// Supabase Edge Function: daily-ops-summary
// =====================================================
// 毎朝の運営サマリをスタッフのグループLINE(line_notify_groups)へpushする。
// pg_cron から毎日 23:00 UTC (= 08:00 JST) に呼ばれる（migration 098）。
//
// 集計（JST本日）:
//   ・店舗別の本日予約件数（confirmed + completed）と初回件数
//   ・前金未確認（deposit_status='pending'・本日以降の確定予約）件数
//   ・明日の予約件数（店舗別）
// システム健全性チェック（問題があれば ⚠️ 行を付ける）:
//   ・cancel_expired_deposit_holds cron の直近成功が確認できない
//     （RPC get_cron_last_success / 期限切れ放置ホールドの有無で判定）
//   ・昨日以降のWeb予約（確定・メールアドレスあり）で確認メール未送信
//
// 認証: service role key か CRON_SECRET のみ（それ以外は401）。
// LINE_CHANNEL_ACCESS_TOKEN 未設定なら console.error のみで 200 を返す。
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STORES: { id: string; name: string }[] = [
  { id: 'kanamitsu', name: '金光店' },
  { id: 'tamashima', name: '玉島店' },
];
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// JSTの「今日 00:00」からoffsetDays日ずらした瞬間をUTCのDateで返す（epoch計算・素朴文字列不使用）
function jstDayStart(offsetDays: number): Date {
  const shifted = new Date(Date.now() + JST_OFFSET_MS); // UTC部品=JSTの壁時計
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + offsetDays) -
      JST_OFFSET_MS,
  );
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // ---- 認証: service role key か CRON_SECRET のみ ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const isServiceRole = authHeader === `Bearer ${serviceKey}`;
    const isCron = cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`;
    if (!isServiceRole && !isCron) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- JST日付窓 ----
    const todayStart = jstDayStart(0);
    const tomorrowStart = jstDayStart(1);
    const dayAfterStart = jstDayStart(2);
    const yesterdayStart = jstDayStart(-1);

    const jstNow = new Date(Date.now() + JST_OFFSET_MS);
    const dateLabel = `${jstNow.getUTCMonth() + 1}/${jstNow.getUTCDate()}(${WEEKDAYS[jstNow.getUTCDay()]})`;

    // ---- 件数カウントヘルパー ----
    const ACTIVE_STATUSES = ['confirmed', 'completed'];
    async function countBookings(build: (q: any) => any): Promise<number> {
      let q = supabase.from('app_bookings').select('id', { count: 'exact', head: true });
      q = build(q);
      const { count, error } = await q;
      if (error) throw new Error(`集計エラー: ${error.message}`);
      return count ?? 0;
    }

    // ---- 集計（並列） ----
    const [
      todayCounts,
      todayFirstCounts,
      tomorrowCounts,
      depositPending,
      emailUnsent,
    ] = await Promise.all([
      // 店舗別・本日予約件数（confirmed+completed）
      Promise.all(STORES.map((s) =>
        countBookings((q) =>
          q.eq('store_id', s.id).in('status', ACTIVE_STATUSES)
            .gte('starts_at', todayStart.toISOString()).lt('starts_at', tomorrowStart.toISOString())
        )
      )),
      // 店舗別・本日の初回件数
      Promise.all(STORES.map((s) =>
        countBookings((q) =>
          q.eq('store_id', s.id).in('status', ACTIVE_STATUSES).eq('is_first_visit', true)
            .gte('starts_at', todayStart.toISOString()).lt('starts_at', tomorrowStart.toISOString())
        )
      )),
      // 店舗別・明日の予約件数
      Promise.all(STORES.map((s) =>
        countBookings((q) =>
          q.eq('store_id', s.id).in('status', ACTIVE_STATUSES)
            .gte('starts_at', tomorrowStart.toISOString()).lt('starts_at', dayAfterStart.toISOString())
        )
      )),
      // 前金未確認（本日以降の確定予約で deposit_status='pending'）
      countBookings((q) =>
        q.eq('status', 'confirmed').eq('deposit_status', 'pending')
          .gte('starts_at', todayStart.toISOString())
      ),
      // 昨日以降に作成されたWeb予約のうち、確定済み・メールアドレスあり・確認メール未送信
      // （deposit pending の仮押さえは確定前＝未送信が正常なので除外）
      countBookings((q) =>
        q.eq('source', 'web').in('status', ACTIVE_STATUSES)
          .not('guest_email', 'is', null)
          .neq('deposit_status', 'pending')
          .is('confirmation_email_sent_at', null)
          .gte('created_at', yesterdayStart.toISOString())
      ),
    ]);

    // ---- システム健全性チェック ----
    const warnings: string[] = [];

    // 1) cancel_expired_deposit_holds cron の直近成功（migration 098 のRPC）
    //    RPCが使えない/成功記録がない/30分超停止 → 警告。加えて実害
    //    （期限切れ15分超の放置ホールド）が観測されたら必ず警告。
    try {
      const { data: lastRun, error: rpcErr } = await supabase
        .rpc('get_cron_last_success', { p_jobname: 'cancel-expired-deposit-holds' });
      const STALE_MS = 30 * 60 * 1000; // 5分間隔ジョブ→30分無成功で異常
      if (rpcErr) {
        console.error('get_cron_last_success rpc failed:', rpcErr.message);
        warnings.push('⚠️前金期限切れ自動キャンセル(cron)の実行状況を確認できません');
      } else if (!lastRun) {
        warnings.push('⚠️前金期限切れ自動キャンセル(cron)の実行記録がありません');
      } else if (Date.now() - new Date(lastRun as string).getTime() > STALE_MS) {
        const mins = Math.floor((Date.now() - new Date(lastRun as string).getTime()) / 60000);
        warnings.push(`⚠️前金期限切れ自動キャンセル(cron)が${mins}分間実行されていません`);
      }
    } catch (e) {
      console.error('cron health check failed:', (e as Error).message);
      warnings.push('⚠️前金期限切れ自動キャンセル(cron)の実行状況を確認できません');
    }
    try {
      const staleHoldCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const staleHolds = await countBookings((q) =>
        q.eq('source', 'web').eq('status', 'confirmed').eq('deposit_status', 'pending')
          .not('hold_expires_at', 'is', null)
          .lt('hold_expires_at', staleHoldCutoff)
      );
      if (staleHolds > 0) {
        warnings.push(`⚠️期限切れの前金仮押さえが${staleHolds}件放置されています（自動キャンセル未稼働の疑い）`);
      }
    } catch (e) {
      console.error('stale hold check failed:', (e as Error).message);
    }

    // 2) 確認メール未送信（メール不達の兆候）
    if (emailUnsent > 0) {
      warnings.push(`⚠️確認メール未送信: ${emailUnsent}件（昨日以降のWeb確定予約）`);
    }

    // ---- 文面 ----
    const [kanaToday, tamaToday] = todayCounts;
    const [kanaFirst, tamaFirst] = todayFirstCounts;
    const [kanaTmrw, tamaTmrw] = tomorrowCounts;
    const lines = [
      `【Moveact 本日のサマリ ${dateLabel}】`,
      `金光店: 予約${kanaToday}件(初回${kanaFirst})・玉島店: ${tamaToday}件(初回${tamaFirst})`,
      `前金未確認: ${depositPending}件`,
      `明日: 金光${kanaTmrw}件/玉島${tamaTmrw}件`,
      ...warnings,
    ];
    const text = lines.join('\n');

    // ---- 送信（notify-staff-group と同方式でグループLINEへpush） ----
    if (!lineToken) {
      console.error('LINE_CHANNEL_ACCESS_TOKEN not configured — summary not sent:\n' + text);
      return json({ sent: 0, note: 'LINE_CHANNEL_ACCESS_TOKEN 未設定のため送信をスキップしました', text });
    }

    const { data: groups, error: gErr } = await supabase
      .from('line_notify_groups')
      .select('group_id, store_id')
      .eq('is_active', true)
      .eq('notify_on_booking', true);
    if (gErr) return json({ error: gErr.message }, 500);

    // サマリは全店横断の内容なので、有効な全グループへ送る（group_idで重複排除）
    const targets = [...new Set((groups ?? []).map((g: any) => g.group_id as string))];
    if (targets.length === 0) return json({ sent: 0, note: '通知先グループが未登録です', text });

    let sent = 0;
    for (const to of targets) {
      const r = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lineToken}` },
        body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
      });
      if (r.ok) sent++;
      else console.error('push failed:', r.status, await r.text());
    }
    return json({ sent, warnings: warnings.length, text });
  } catch (e) {
    console.error('daily-ops-summary error:', (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
