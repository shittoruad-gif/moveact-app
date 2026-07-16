// Supabase Edge Function: send-daily-reminders
// =====================================================
// 翌日（JST）の予約に前日リマインドを送る（メール＋会員LINE）。
// pg_cron から毎日 00:00 UTC (= 09:00 JST) に呼び出される（--no-verify-jwt デプロイ）。
//
// 認証: Authorization ヘッダーが service role key または CRON_SECRET の
//       Bearer トークンのときのみ実行。それ以外は 401。
//       ※ pg_cron 側は vault の cron_secret を Authorization に付けて呼ぶこと
//         （migration 039 の airreserve-sync と同じ方式）。
//
// 送信チャネル:
//   ・メール: guest_email がある予約（RESEND_API_KEY 未設定時は静かにスキップ）
//   ・LINE : 会員予約(user_id)で profiles.line_user_id がある場合に push
//            （LINE_CHANNEL_ACCESS_TOKEN 未設定時は console.warn してスキップ）
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendReminderEmail } from '../_shared/email.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';

const STORE_NAMES: Record<string, string> = { kanamitsu: '金光店', tamashima: '玉島店' };
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

interface ReminderBooking {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  starts_at: string;
  store_id: string;
  treatment_menu_id: string;
  profile: { full_name: string | null; line_user_id: string | null } | null;
}

interface MenuRow {
  id: string;
  name: string;
  duration_minutes: number;
}

serve(async (req) => {
  try {
    // 認証: service role key または CRON_SECRET のみ許可（それ以外は401）
    const authHeader = req.headers.get('Authorization') ?? '';
    const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const isServiceRole = authHeader === `Bearer ${serviceKey}`;
    const isCron = cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`;
    if (!isServiceRole && !isCron) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 翌日(JST)の日付文字列を取得
    const nowJst = new Date(Date.now() + 9 * 3600_000);
    const tomorrowJst = new Date(nowJst);
    tomorrowJst.setDate(tomorrowJst.getDate() + 1);
    const tomorrowDate = tomorrowJst.toISOString().slice(0, 10);
    const dayStart = `${tomorrowDate}T00:00:00+09:00`;
    const dayEnd   = `${tomorrowDate}T23:59:59+09:00`;

    // 翌日のconfirmed・決済済み/不要・リマインド未送信の予約を取得
    // （メール宛先が無くても、会員のLINE送信対象になり得るため guest_email では絞らない）
    const { data: bookings, error } = await supabase
      .from('app_bookings')
      .select('id, user_id, guest_name, guest_email, starts_at, store_id, treatment_menu_id, profile:profiles!app_bookings_user_id_fkey(full_name, line_user_id)')
      .eq('status', 'confirmed')
      .in('deposit_status', ['none', 'paid', 'waived'])
      .is('reminder_email_sent_at', null)
      .gte('starts_at', dayStart)
      .lte('starts_at', dayEnd);

    if (error) {
      console.error('[send-daily-reminders] query error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    const targets = (bookings ?? []) as unknown as ReminderBooking[];
    if (targets.length === 0) {
      console.log(`[send-daily-reminders] no reminders needed for ${tomorrowDate}`);
      return new Response(JSON.stringify({ ok: true, sent: 0, line_sent: 0, date: tomorrowDate }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // メニュー詳細を一括取得
    const menuIds = [...new Set(targets.map((b) => b.treatment_menu_id))];
    const { data: menus } = await supabase
      .from('treatment_menus').select('id, name, duration_minutes').in('id', menuIds);
    const menuMap = new Map<string, MenuRow>(((menus ?? []) as MenuRow[]).map((m) => [m.id, m]));

    let sent = 0;      // メール送信数（従来のカウント）
    let lineSent = 0;  // LINE送信数
    for (const bk of targets) {
      const menu = menuMap.get(bk.treatment_menu_id);
      if (!menu) continue;

      // starts_at (UTC ISO) → JST の日付・時刻文字列
      const startsUtc = new Date(bk.starts_at);
      const startsJst = new Date(startsUtc.getTime() + 9 * 3600_000);
      const date = startsJst.toISOString().slice(0, 10);
      const time = `${String(startsJst.getUTCHours()).padStart(2, '0')}:${String(startsJst.getUTCMinutes()).padStart(2, '0')}`;

      let delivered = false;

      // 1) メールリマインド。送信の成否で分岐する。
      //    失敗時に delivered を立てると「送信済み」マークが付き二度と再送されないため、
      //    Resend障害・キー未設定時は未送信のまま残して次回実行でリトライさせる。
      if (bk.guest_email) {
        const ok = await sendReminderEmail({
          guestName: bk.guest_name ?? '',
          guestEmail: bk.guest_email,
          date,
          time,
          menuName: menu.name,
          durationMinutes: menu.duration_minutes,
          storeId: bk.store_id,
        });
        if (ok) {
          sent++;
          delivered = true;
        } else {
          console.error(`[send-daily-reminders] メール送信失敗のため未送信のまま残します booking=${bk.id}`);
        }
      }

      // 2) LINEリマインド（会員かつ profiles.line_user_id あり）
      const lineUserId = bk.user_id ? (bk.profile?.line_user_id ?? null) : null;
      if (lineUserId) {
        if (!lineToken) {
          console.warn('[send-daily-reminders] LINE_CHANNEL_ACCESS_TOKEN 未設定のためLINEリマインドをスキップします');
        } else {
          const [yy4, mo, d] = date.split('-').map(Number);
          // getDay()はランタイムTZ依存（Edge=UTCだと1日ズレる）。TZ非依存のgetUTCDay()を使う。
          const dow = WEEKDAYS[new Date(Date.UTC(yy4, mo - 1, d)).getUTCDay()];
          const storeName = STORE_NAMES[bk.store_id] ?? bk.store_id;
          const text =
            `【Moveact】明日のご予約のお知らせ\n` +
            `${mo}月${d}日(${dow}) ${time}〜\n` +
            `メニュー: ${menu.name}\n` +
            `店舗: ${storeName}\n` +
            `ご変更の際はお早めにご連絡ください。`;
          const ok = await pushLine(lineUserId, text);
          // 監査ログ（line-reminder-cron / send-line-message と同じテーブル）
          await supabase.from('line_notification_log').insert({
            user_id: bk.user_id,
            booking_id: bk.id,
            message_type: 'booking_reminder',
            line_user_id: lineUserId,
            payload: { text },
            status: ok ? 'sent' : 'failed',
            error_message: ok ? null : 'LINE push failed',
          });
          if (ok) {
            lineSent++;
            delivered = true;
          }
        }
      }

      // 送信済みをマーク（メール・LINEいずれかを送った予約のみ。失敗してもループ継続）
      if (delivered) {
        const { error: updErr } = await supabase.from('app_bookings')
          .update({ reminder_email_sent_at: new Date().toISOString() })
          .eq('id', bk.id);
        if (updErr) console.error('[send-daily-reminders] mark error:', updErr.message);
      }
    }

    console.log(`[send-daily-reminders] sent=${sent} line_sent=${lineSent} date=${tomorrowDate}`);
    return new Response(JSON.stringify({ ok: true, sent, line_sent: lineSent, date: tomorrowDate }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[send-daily-reminders] error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});

// LINE Messaging API push（notify-staff-group と同じ LINE_CHANNEL_ACCESS_TOKEN を使用）
async function pushLine(to: string, text: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lineToken}` },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.error('[send-daily-reminders] LINE push failed:', res.status, txt);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[send-daily-reminders] LINE push error:', (e as Error).message);
    return false;
  }
}
