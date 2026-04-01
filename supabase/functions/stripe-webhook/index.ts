// Supabase Edge Function: stripe-webhook
// Handles Stripe webhook events for payment confirmations

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@13?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' });
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  const signature = req.headers.get('stripe-signature')!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    return new Response(`Webhook signature verification failed: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const { type, user_id, store_id, plan_id, total_sessions, validity_days } = pi.metadata;

      if (type === 'ticket' && user_id && plan_id) {
        // Create user ticket
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + Number(validity_days));

        await supabase.from('user_tickets').insert({
          user_id,
          ticket_plan_id: plan_id,
          store_id: store_id as 'kanamitsu' | 'tamashima',
          total_sessions: Number(total_sessions),
          remaining_sessions: Number(total_sessions),
          status: 'active',
          expires_at: expiresAt.toISOString(),
          stripe_payment_intent_id: pi.id,
        });

        // Send push notification
        await sendPushNotification(supabase, user_id, {
          title: '回数券購入完了',
          body: `${total_sessions}回券の購入が完了しました。`,
          data: { screen: 'TicketDashboard' },
        });
      }

      if (type === 'product' && user_id) {
        // Update order status
        await supabase
          .from('orders')
          .update({ status: 'paid' })
          .eq('stripe_payment_intent_id', pi.id);

        await sendPushNotification(supabase, user_id, {
          title: '注文確定',
          body: 'ご注文が確定しました。商品の準備ができましたらお知らせします。',
          data: { screen: 'OrderHistory' },
        });
      }

      if (type === 'cancellation_charge' && user_id) {
        // Cancellation charge was successful - already logged in cancel-booking function
        await sendPushNotification(supabase, user_id, {
          title: 'キャンセル料のお知らせ',
          body: `当日キャンセル料 ¥${(pi.amount).toLocaleString()} を決済いたしました。`,
          data: { screen: 'Account' },
        });
      }
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoice.subscription as string;

      if (subscriptionId) {
        // Refresh subscription period
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const { data: userSub } = await supabase
          .from('user_subscriptions')
          .select('*, subscription_plan:subscription_plans(*)')
          .eq('stripe_subscription_id', subscriptionId)
          .single();

        if (userSub) {
          await supabase
            .from('user_subscriptions')
            .update({
              status: 'active',
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              sessions_remaining_this_period: userSub.subscription_plan?.sessions_per_month ?? 0,
            })
            .eq('id', userSub.id);

          await sendPushNotification(supabase, userSub.user_id, {
            title: 'サブスク更新のお知らせ',
            body: `今月分の更新が完了しました。ご利用可能回数: ${userSub.subscription_plan?.sessions_per_month}回`,
            data: { screen: 'TicketDashboard' },
          });
        }
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await supabase
        .from('user_subscriptions')
        .update({ status: 'cancelled' })
        .eq('stripe_subscription_id', subscription.id);
      break;
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// Helper: Send push notification via Expo
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

  // Log notification
  await supabase.from('notification_log').insert({
    user_id: userId,
    title: notification.title,
    body: notification.body,
    data: notification.data,
  });

  // Send via Expo Push API
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
