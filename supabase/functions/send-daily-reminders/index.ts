// Supabase Edge Function: send-daily-reminders
// =====================================================
// 翌日（JST）の予約に前日リマインドメールを送る。
// pg_cron から毎日 00:00 UTC (= 09:00 JST) に呼び出される（--no-verify-jwt デプロイ）。
// RESEND_API_KEY 未設定時は静かにスキップ。
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendReminderEmail } from '../_shared/email.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async () => {
  try {
    const supabase = createClient(supabaseUrl, serviceKey);

    // 翌日(JST)の日付文字列を取得
    const nowJst = new Date(Date.now() + 9 * 3600_000);
    const tomorrowJst = new Date(nowJst);
    tomorrowJst.setDate(tomorrowJst.getDate() + 1);
    const tomorrowDate = tomorrowJst.toISOString().slice(0, 10);
    const dayStart = `${tomorrowDate}T00:00:00+09:00`;
    const dayEnd   = `${tomorrowDate}T23:59:59+09:00`;

    // 翌日のconfirmed・決済済み/不要・メールあり・リマインド未送信の予約を取得
    const { data: bookings, error } = await supabase
      .from('app_bookings')
      .select('id, guest_name, guest_email, starts_at, store_id, treatment_menu_id')
      .eq('status', 'confirmed')
      .in('deposit_status', ['none', 'paid', 'waived'])
      .not('guest_email', 'is', null)
      .is('reminder_email_sent_at', null)
      .gte('starts_at', dayStart)
      .lte('starts_at', dayEnd);

    if (error) {
      console.error('[send-daily-reminders] query error:', error.message);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!bookings || bookings.length === 0) {
      console.log(`[send-daily-reminders] no reminders needed for ${tomorrowDate}`);
      return new Response(JSON.stringify({ ok: true, sent: 0, date: tomorrowDate }));
    }

    // メニュー詳細を一括取得
    const menuIds = [...new Set(bookings.map((b: { treatment_menu_id: string }) => b.treatment_menu_id))];
    const { data: menus } = await supabase
      .from('treatment_menus').select('id, name, duration_minutes').in('id', menuIds);
    const menuMap = new Map((menus ?? []).map((m: { id: string; name: string; duration_minutes: number }) => [m.id, m]));

    let sent = 0;
    for (const bk of bookings) {
      if (!bk.guest_email) continue;
      const menu = menuMap.get(bk.treatment_menu_id);
      if (!menu) continue;

      // starts_at (UTC ISO) → JST の日付・時刻文字列
      const startsUtc = new Date(bk.starts_at);
      const startsJst = new Date(startsUtc.getTime() + 9 * 3600_000);
      const date = startsJst.toISOString().slice(0, 10);
      const time = `${String(startsJst.getUTCHours()).padStart(2, '0')}:${String(startsJst.getUTCMinutes()).padStart(2, '0')}`;

      await sendReminderEmail({
        guestName: bk.guest_name,
        guestEmail: bk.guest_email,
        date,
        time,
        menuName: menu.name,
        durationMinutes: menu.duration_minutes,
        storeId: bk.store_id,
      });

      // 送信済みをマーク（失敗してもループ継続）
      await supabase.from('app_bookings')
        .update({ reminder_email_sent_at: new Date().toISOString() })
        .eq('id', bk.id)
        .then(() => {});

      sent++;
    }

    console.log(`[send-daily-reminders] sent=${sent} date=${tomorrowDate}`);
    return new Response(JSON.stringify({ ok: true, sent, date: tomorrowDate }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[send-daily-reminders] error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
