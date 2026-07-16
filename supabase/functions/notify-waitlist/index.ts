// Supabase Edge Function: notify-waitlist
// =====================================================
// 指定店舗・日付でキャンセルが出た際、その日のキャンセル待ち(status='waiting')に
// 「空きが出ました」を通知（プッシュ＋LINE）し、status='notified' に更新する。
// 予約キャンセル処理の直後に呼ぶ。
// 内部認可: Authorization が以下のいずれかでなければ 403。
//   ・service role key（customer-cancel-booking 等の内部呼び出し）
//   ・CRON_SECRET（cron等の内部ジョブ）
//   ・role が staff/admin のユーザーJWT（スタッフ画面の予約一覧から）
//   ※顧客のセルフキャンセルは customer-cancel-booking 経由（service role）で届く。
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { storeId, date } = await req.json();
    if (!storeId || !date) return json({ error: 'storeId, date は必須です' }, 400);

    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- 内部認可: service role / CRON_SECRET / staff・adminのJWT ----
    const authHeader = req.headers.get('Authorization') ?? '';
    const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const isServiceRole = authHeader === `Bearer ${serviceKey}`;
    const isCron = cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`;
    if (!isServiceRole && !isCron) {
      const token = authHeader.replace('Bearer ', '').trim();
      if (!token) return json({ error: 'Forbidden' }, 403);
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) return json({ error: 'Forbidden' }, 403);
      const { data: prof } = await supabase
        .from('profiles').select('role').eq('id', user.id).single();
      if (!prof || !['staff', 'admin'].includes(prof.role)) {
        return json({ error: 'Forbidden' }, 403);
      }
    }

    const { data: waiters } = await supabase
      .from('booking_waitlist')
      .select('id, user_id')
      .eq('store_id', storeId)
      .eq('desired_date', date)
      .eq('status', 'waiting');

    if (!waiters || waiters.length === 0) return json({ notified: 0 });

    const dLabel = new Date(`${date}T00:00:00+09:00`)
      .toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
    const title = 'キャンセル待ちの空きが出ました';
    const body = `${dLabel}にご希望のお日にちで空きが出ました。お早めにご予約ください。`;

    let count = 0;
    for (const w of waiters) {
      const { data: p } = await supabase
        .from('profiles').select('expo_push_token, line_user_id').eq('id', w.user_id).single();

      await supabase.from('notification_log').insert({
        user_id: w.user_id, title, body, data: { screen: 'BookingChoice' },
      });
      if (p?.expo_push_token) {
        try {
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: p.expo_push_token, title, body, data: { screen: 'BookingChoice' } }),
          });
        } catch (_e) { /* non-fatal */ }
      }
      await supabase.from('booking_waitlist')
        .update({ status: 'notified', notified_at: new Date().toISOString() })
        .eq('id', w.id);
      count++;
    }
    return json({ notified: count });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
