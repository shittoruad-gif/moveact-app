// Supabase Edge Function: notify-staff-group
// =====================================================
// 予約が入った際、スタッフのグループLINE(line_notify_groups)へ通知をpushする。
// 予約作成の直後にクライアントから呼ぶ（bookingId を渡す）。
//   ・該当店舗(store_id一致) または 全店共通(store_id=NULL) の有効グループへ送信
//   ・seriesCount を渡すと「定期予約 全N回」と付記
//   ・eventType='cancelled' を渡すとキャンセル通知（当日キャンセルは明記）
// 内部認可: Authorization が以下のいずれかでなければ 403。
//   ・service role key（Edge関数同士の内部呼び出し）
//   ・CRON_SECRET（cron等の内部ジョブ）
//   ・ユーザーJWT … role が staff/admin、または当該予約の user_id 本人
//     （アプリの予約確定画面 BookingConfirmScreen は顧客本人JWTで呼ぶため）
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

const STORE_NAMES: Record<string, string> = { kanamitsu: '金光店', tamashima: '玉島店' };

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!lineToken) return json({ error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, 500);
    const { bookingId, seriesCount, eventType, oldStartsAt } = await req.json();
    if (!bookingId) return json({ error: 'bookingId は必須です' }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- 内部認可: service role / CRON_SECRET / (staff・admin or 予約者本人のJWT) ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const isServiceRole = authHeader === `Bearer ${serviceKey}`;
    const isCron = cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`;
    let callerUserId: string | null = null;
    let callerIsStaff = false;
    if (!isServiceRole && !isCron) {
      const token = authHeader.replace('Bearer ', '').trim();
      if (!token) return json({ error: 'Forbidden' }, 403);
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) return json({ error: 'Forbidden' }, 403);
      callerUserId = user.id;
      const { data: prof } = await supabase
        .from('profiles').select('role').eq('id', user.id).single();
      callerIsStaff = !!prof && ['staff', 'admin'].includes(prof.role);
    }

    const { data: b } = await supabase
      .from('app_bookings')
      .select('*, treatment_menu:treatment_menus(name, duration_minutes), profile:profiles(full_name)')
      .eq('id', bookingId)
      .single();
    if (!b) return json({ error: 'Booking not found' }, 404);

    // ユーザーJWT呼び出しは staff/admin か予約者本人のみ許可
    if (!isServiceRole && !isCron && !callerIsStaff && b.user_id !== callerUserId) {
      return json({ error: 'Forbidden' }, 403);
    }

    // 担当スタッフ名
    let staffName = 'おまかせ';
    if (b.staff_id) {
      const { data: sp } = await supabase.from('profiles').select('full_name').eq('id', b.staff_id).single();
      if (sp?.full_name) staffName = b.is_staff_nominated ? `${sp.full_name}（指名）` : sp.full_name;
    }

    // 日本時間で整形
    const dt = new Date(b.starts_at).toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', weekday: 'short',
      hour: '2-digit', minute: '2-digit',
    });
    const storeName = STORE_NAMES[b.store_id] ?? b.store_id;
    // 顧客名: アカウントあり→profile、ゲスト(Web/スタッフ登録)→guest_name
    const customerName = b.profile?.full_name ?? b.guest_name ?? '';
    const customer = customerName ? `${customerName}様` : 'お客様';
    const created =
      b.created_by === 'staff' ? '【スタッフ登録】'
      : b.source === 'web' ? '【Web予約】'
      : '【アプリ予約】';
    const phoneLine = b.guest_phone ? `\n📞 ${b.guest_phone}` : '';
    const seriesLine = seriesCount && seriesCount > 1 ? `\n🔁 定期予約 全${seriesCount}回` : '';
    const reqLine = b.customer_request ? `\n📝 要望: ${b.customer_request}` : '';
    // 初回・前金（事前決済）状況
    const firstLine = b.is_first_visit ? '\n🌟 初回のお客様' : '';
    let depositLine = '';
    if (b.deposit_status === 'pending') depositLine = `\n💳 要事前決済 ¥${(b.deposit_amount ?? 0).toLocaleString('ja-JP')}（入金待ち）`;
    else if (b.deposit_status === 'paid') depositLine = `\n💳 事前決済 済`;
    const zoomLine = b.zoom_join_url ? `\n🎥 Zoom: ${b.zoom_join_url}` : '';

    let text: string;
    if (eventType === 'deposit_expired') {
      // 前金（事前決済）期限切れの自動キャンセル通知。
      // お客様がAirペイで支払い済みなのに完了ボタンを押していないだけの可能性が
      // あるため（2026-07-15の実事故）、必ずAirペイ側の入金確認を促す。
      const startJst = new Date(new Date(b.starts_at).getTime() + 9 * 3600_000);
      const md = `${startJst.getUTCMonth() + 1}/${startJst.getUTCDate()}`;
      const hm = `${String(startJst.getUTCHours()).padStart(2, '0')}:${String(startJst.getUTCMinutes()).padStart(2, '0')}`;
      text =
        `⚠️ 前金未確認の自動キャンセル\n` +
        `🏥 ${storeName}\n` +
        `📅 ${md} ${hm}〜 ${b.treatment_menu?.name ?? ''}\n` +
        `👤 ${customer}${phoneLine}\n` +
        `30分以内にお支払いの確認ができなかったため、自動でキャンセルしました。\n` +
        `※お客様が支払い済みでも「完了ボタン」を押していないとこの状態になります。` +
        `Airペイ管理画面（オンライン決済 > 取引履歴）で入金を確認し、入金があれば「手動予約入力」から同じ日時で入れ直してください。`;
    } else if (eventType === 'cancelled') {
      // キャンセル通知（JSTで日時・当日判定）
      const startJst = new Date(new Date(b.starts_at).getTime() + 9 * 3600_000);
      const md = `${startJst.getUTCMonth() + 1}/${startJst.getUTCDate()}`;
      const hm = `${String(startJst.getUTCHours()).padStart(2, '0')}:${String(startJst.getUTCMinutes()).padStart(2, '0')}`;
      const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
      const isSameDay = startJst.toISOString().slice(0, 10) === todayJst;
      text =
        `【キャンセル】${md} ${hm} ${customer} ${b.treatment_menu?.name ?? ''}` +
        (isSameDay ? '（当日キャンセル）' : '') +
        `\n🏥 ${storeName}`;
    } else if (eventType === 'rescheduled') {
      // 予約変更通知（旧日時→新日時をJSTで。customer-reschedule-booking から呼ばれる）
      const fmtJst = (iso: string) => {
        const j = new Date(new Date(iso).getTime() + 9 * 3600_000);
        return `${j.getUTCMonth() + 1}/${j.getUTCDate()} ${String(j.getUTCHours()).padStart(2, '0')}:${String(j.getUTCMinutes()).padStart(2, '0')}`;
      };
      const fromPart = oldStartsAt ? `${fmtJst(oldStartsAt)} → ` : '';
      text =
        `【変更】${customer} ${fromPart}${fmtJst(b.starts_at)}\n` +
        `💆 ${b.treatment_menu?.name ?? ''}（${b.treatment_menu?.duration_minutes ?? '-'}分） / 担当: ${staffName}\n` +
        `🏥 ${storeName}`;
    } else {
      text =
        `🔔 新しいご予約 ${created}\n` +
        `🏥 ${storeName}\n` +
        `📅 ${dt}\n` +
        `💆 ${b.treatment_menu?.name ?? ''}（${b.treatment_menu?.duration_minutes ?? '-'}分）\n` +
        `👤 ${customer}${phoneLine}\n` +
        `🧑‍⚕️ 担当: ${staffName}` +
        firstLine + depositLine + zoomLine + seriesLine + reqLine;
    }

    // 送信先グループ（該当店舗 or 全店共通）
    const { data: groups } = await supabase
      .from('line_notify_groups')
      .select('group_id, store_id')
      .eq('is_active', true)
      .eq('notify_on_booking', true);

    const targets = (groups ?? []).filter((g: any) => g.store_id === null || g.store_id === b.store_id);
    if (targets.length === 0) return json({ sent: 0, note: '通知先グループが未登録です' });

    let sent = 0;
    for (const g of targets) {
      const r = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lineToken}` },
        body: JSON.stringify({ to: g.group_id, messages: [{ type: 'text', text }] }),
      });
      if (r.ok) sent++;
      else console.error('push failed:', r.status, await r.text());
    }
    return json({ sent });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
