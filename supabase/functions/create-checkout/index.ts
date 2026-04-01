// Supabase Edge Function: create-checkout
// Creates a Stripe PaymentIntent for ticket purchases, product orders, etc.

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
    // Verify user
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

    const { type, planId, storeId, items } = await req.json();

    // Get or create Stripe customer
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name, phone, email')
      .eq('id', user.id)
      .single();

    let customerId = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: profile?.full_name ?? undefined,
        phone: profile?.phone ?? undefined,
        email: profile?.email ?? user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await supabase.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    let amount: number;
    let description: string;
    let metadata: Record<string, string> = {
      user_id: user.id,
      store_id: storeId,
      type,
    };

    if (type === 'ticket') {
      // Ticket purchase
      const { data: plan } = await supabase
        .from('ticket_plans')
        .select('*')
        .eq('id', planId)
        .single();

      if (!plan) {
        return new Response(JSON.stringify({ error: 'Plan not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      amount = plan.price;
      description = `${plan.name} - Moveact`;
      metadata.plan_id = planId;
      metadata.total_sessions = String(plan.total_sessions);
      metadata.validity_days = String(plan.validity_days);

    } else if (type === 'product') {
      // Product order
      amount = items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
      description = `商品購入 - Moveact`;
      metadata.item_count = String(items.length);

    } else {
      return new Response(JSON.stringify({ error: 'Invalid type' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount, // JPY is zero-decimal
      currency: 'jpy',
      customer: customerId,
      description,
      metadata,
      setup_future_usage: 'off_session', // Save card for cancellation charges
      automatic_payment_methods: { enabled: true },
    });

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
