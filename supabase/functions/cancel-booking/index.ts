// Supabase Edge Function: cancel-booking
// Handles same-day cancellation: ticket deduction or Stripe charge
// Called from admin panel by staff

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify staff user
    const authHeader = req.headers.get('Authorization')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check staff role
    const { data: staffProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!staffProfile || !['staff', 'admin'].includes(staffProfile.role)) {
      return new Response(JSON.stringify({ error: 'Staff access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { bookingId, chargeType, note } = await req.json();
    // chargeType: 'ticket' | 'stripe' | 'waive'

    // Get booking details
    const { data: booking } = await supabase
      .from('group_lesson_bookings')
      .select('*, group_lesson:group_lessons(*)')
      .eq('id', bookingId)
      .single();

    if (!booking) {
      return new Response(JSON.stringify({ error: 'Booking not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update booking status
    await supabase
      .from('group_lesson_bookings')
      .update({
        status: 'cancelled_same_day',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    // Decrement lesson bookings count
    await supabase.rpc('decrement_lesson_bookings', { lesson_id: booking.group_lesson_id });

    let chargeRecord: any = {
      user_id: booking.user_id,
      booking_id: bookingId,
      processed_by: user.id,
      note,
    };

    if (chargeType === 'ticket') {
      // Find an active ticket to deduct
      const { data: tickets } = await supabase
        .from('user_tickets')
        .select('*')
        .eq('user_id', booking.user_id)
        .eq('status', 'active')
        .gt('remaining_sessions', 0)
        .order('expires_at', { ascending: true })
        .limit(1);

      const ticket = tickets?.[0];
      if (!ticket) {
        return new Response(JSON.stringify({ error: 'No active ticket found for deduction' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Deduct session
      await supabase.rpc('deduct_ticket_session', {
        p_ticket_id: ticket.id,
        p_reason: 'same_day_cancel',
        p_booking_id: bookingId,
        p_staff_id: user.id,
        p_note: note ?? '当日キャンセルによる回数券消化',
      });

      chargeRecord.charge_type = 'ticket_deduction';
      chargeRecord.user_ticket_id = ticket.id;

      // Send notification
      await sendPushNotification(supabase, booking.user_id, {
        title: '当日キャンセル',
        body: '回数券より1回分を消化させていただきました。',
        data: { screen: 'TicketDashboard' },
      });

    } else if (chargeType === 'stripe') {
      // Get customer's saved payment method
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', booking.user_id)
        .single();

      if (!profile?.stripe_customer_id) {
        return new Response(JSON.stringify({ error: 'No Stripe customer found' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get default payment method
      const paymentMethods = await stripe.paymentMethods.list({
        customer: profile.stripe_customer_id,
        type: 'card',
      });

      if (paymentMethods.data.length === 0) {
        return new Response(JSON.stringify({ error: 'No saved payment method' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Charge cancellation fee (same as lesson price)
      const cancellationAmount = booking.group_lesson?.price ?? 3000;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: cancellationAmount,
        currency: 'jpy',
        customer: profile.stripe_customer_id,
        payment_method: paymentMethods.data[0].id,
        off_session: true,
        confirm: true,
        description: `当日キャンセル料 - ${booking.group_lesson?.title ?? 'グループレッスン'}`,
        metadata: {
          type: 'cancellation_charge',
          user_id: booking.user_id,
          booking_id: bookingId,
        },
      });

      chargeRecord.charge_type = 'stripe_charge';
      chargeRecord.amount = cancellationAmount;
      chargeRecord.stripe_payment_intent_id = paymentIntent.id;

      // Notification sent via webhook when payment succeeds

    } else if (chargeType === 'waive') {
      chargeRecord.charge_type = 'waived';

      await sendPushNotification(supabase, booking.user_id, {
        title: '予約キャンセル',
        body: `${booking.group_lesson?.title ?? 'レッスン'}のご予約をキャンセルいたしました。`,
        data: { screen: 'BookingChoice' },
      });
    }

    // Record the cancellation charge
    await supabase.from('cancellation_charges').insert(chargeRecord);

    return new Response(
      JSON.stringify({ success: true, chargeType }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function sendPushNotification(
  supabase: any,
  userId: string,
  notification: { title: string; body: string; data?: Record<string, unknown> }
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', userId)
    .single();

  if (!profile?.expo_push_token) return;

  await supabase.from('notification_log').insert({
    user_id: userId,
    title: notification.title,
    body: notification.body,
    data: notification.data,
  });

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: profile.expo_push_token,
      title: notification.title,
      body: notification.body,
      data: notification.data,
    }),
  });
}
