// Supabase Edge Function: cancel-treatment-booking
// =====================================================
// 施術予約(app_bookings)の当日/無断キャンセルを、規約に沿って処理する（スタッフ操作）。
//   chargeType:
//     'ticket' … 有効な回数券から1回分を消化（deduct_ticket_session）
//     'unpaid' … キャンセル料を「未収金」として記録（amount 指定）
//     'waive'  … 無料でキャンセル（キャンセル料なし）
// いずれも app_bookings.status='cancelled' にし、cancellation_charges に記録する。
// 決済はStripe以外を予定のため、ここではカード即時課金は行わない。
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
    const supabase = createClient(supabaseUrl, serviceKey);

    // スタッフ/管理者のみ
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (!prof || !['staff', 'admin'].includes(prof.role)) return json({ error: 'Staff access required' }, 403);

    const { bookingId, chargeType, amount, note } = await req.json();
    if (!bookingId || !['ticket', 'unpaid', 'waive'].includes(chargeType)) {
      return json({ error: 'bookingId と chargeType(ticket|unpaid|waive) は必須です' }, 400);
    }

    const { data: booking } = await supabase
      .from('app_bookings').select('*').eq('id', bookingId).single();
    if (!booking) return json({ error: 'Booking not found' }, 404);

    // 冪等性ガード: 既にキャンセル済みなら二重処理しない（二重チケット消化・課金記録の重複を防ぐ）
    if (String(booking.status).startsWith('cancelled')) {
      return json({ success: true, alreadyCancelled: true }, 200);
    }

    // 予約をキャンセル状態に（status を条件に含め、競合時に二重更新しない）
    const { data: cancelledRows } = await supabase.from('app_bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('status', booking.status)
      .select('id');
    if (!cancelledRows || cancelledRows.length === 0) {
      return json({ success: true, alreadyCancelled: true }, 200);
    }

    const charge: Record<string, unknown> = {
      user_id: booking.user_id,
      booking_id: bookingId,
      processed_by: user.id,
      note: note ?? null,
    };

    if (chargeType === 'ticket') {
      const { data: tickets } = await supabase
        .from('user_tickets').select('*')
        .eq('user_id', booking.user_id).eq('status', 'active').gt('remaining_sessions', 0)
        .order('expires_at', { ascending: true }).limit(1);
      const ticket = tickets?.[0];
      if (!ticket) return json({ error: '有効な回数券がありません。別の処理を選んでください。' }, 400);

      await supabase.rpc('deduct_ticket_session', {
        p_ticket_id: ticket.id,
        p_reason: 'same_day_cancel',
        p_booking_id: bookingId,
        p_staff_id: user.id,
        p_note: note ?? '当日キャンセルによる回数券消化',
      });
      charge.charge_type = 'ticket_deduction';
      charge.user_ticket_id = ticket.id;
      await notify(supabase, booking.user_id, '当日キャンセル', '回数券より1回分を消化させていただきました。', 'TicketDashboard');

    } else if (chargeType === 'unpaid') {
      charge.charge_type = 'unpaid';
      charge.amount = amount ?? null;
      await notify(supabase, booking.user_id, '当日キャンセル',
        'キャンセル料が発生しました。次回ご来店時にご精算をお願いいたします。', 'MyBookings');

    } else { // waive
      charge.charge_type = 'waived';
      await notify(supabase, booking.user_id, '予約キャンセル', 'ご予約をキャンセルいたしました。', 'MyBookings');
    }

    await supabase.from('cancellation_charges').insert(charge);
    return json({ success: true, chargeType });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function notify(supabase: any, userId: string, title: string, body: string, screen: string) {
  const { data: p } = await supabase.from('profiles').select('expo_push_token').eq('id', userId).single();
  await supabase.from('notification_log').insert({ user_id: userId, title, body, data: { screen } });
  if (!p?.expo_push_token) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: p.expo_push_token, title, body, data: { screen } }),
    });
  } catch (_e) { /* non-fatal */ }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
