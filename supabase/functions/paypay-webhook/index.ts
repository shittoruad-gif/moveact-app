// Supabase Edge Function: paypay-webhook
// =====================================================
// PayPay for Developers からの決済通知を受信する（将来用予備）。
// 通常は verify-paypay-payment 側がメインフローで、こちらは
// PayPay 加盟店契約で Push Notification 機能を有効化したとき動作する。
//
// 【処理内容】
// 1. 通知を受けたら getPayPayPaymentDetails で必ず二重確認
// 2. merchantPaymentId（= orders.id）で対象注文を取得
// 3. 注文を 'paid' に更新 + クーポンを消費 + push通知
// 4. 商品在庫を減算
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getPayPayPaymentDetails } from '../_shared/paypay.ts';
import { sendPushNotification } from '../_shared/push.ts';
import { safeErrorMessage, json } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface WebhookPayload {
  notification_type?: string;
  notificationType?: string;
  merchant_order_id?: string;
  merchantPaymentId?: string;
  state?: string;
}

interface OrderItemRow {
  product_id: string;
  quantity: number;
  product?: { id?: string };
}

interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  applied_coupon_id: string | null;
  items?: OrderItemRow[];
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const payload = (await req.json()) as WebhookPayload;
    const notificationType = payload.notification_type ?? payload.notificationType;
    const merchantPaymentId = payload.merchant_order_id ?? payload.merchantPaymentId;
    const state = payload.state;

    console.log('PayPay webhook received:', { notificationType, state });

    if (!merchantPaymentId) {
      return json({ received: true, note: 'no merchantPaymentId' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (notificationType !== 'Transaction' || state !== 'COMPLETED') {
      return json({ received: true, processed: false });
    }

    // --- 二重確認 ---
    let details: { data?: { status?: string } } | null = null;
    try {
      details = await getPayPayPaymentDetails(merchantPaymentId) as typeof details;
    } catch (e) {
      console.error('PayPay verify error:', safeErrorMessage(e));
      return json({ received: true, verified: false });
    }
    if (details?.data?.status !== 'COMPLETED') {
      return json({ received: true, verified: false });
    }

    // --- 対象 order 取得 ---
    const { data: order } = await supabase
      .from('orders')
      .select('*, items:order_items(*, product:products(id))')
      .eq('id', merchantPaymentId)
      .single();

    if (!order) {
      return json({ received: true, matched: false });
    }
    const typedOrder = order as OrderRow;

    if (typedOrder.status === 'paid') {
      return json({ received: true, alreadyProcessed: true });
    }

    // --- 注文を paid に更新 ---
    const { error: updateErr } = await supabase
      .from('orders')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', typedOrder.id)
      .neq('status', 'paid');

    if (updateErr) {
      console.error('Failed to update order:', updateErr.code);
      return json({ received: true, error: 'DB update failed' }, 500);
    }

    // --- クーポン消費 ---
    if (typedOrder.applied_coupon_id) {
      await supabase
        .from('coupons')
        .update({
          is_used: true,
          used_at: new Date().toISOString(),
          reserved_for_order_id: null,
          reserved_at: null,
        })
        .eq('id', typedOrder.applied_coupon_id)
        .eq('is_used', false);
    }

    // --- 在庫減算 ---
    for (const item of (typedOrder.items ?? [])) {
      const productId = item.product?.id ?? item.product_id;
      if (!productId) continue;
      try {
        await supabase.rpc('decrement_product_stock', {
          p_product_id: productId,
          p_quantity: item.quantity,
        });
      } catch {
        const { data: cur } = await supabase
          .from('products')
          .select('stock_quantity')
          .eq('id', productId)
          .single();
        const next = Math.max(0, (cur?.stock_quantity ?? 0) - item.quantity);
        await supabase.from('products').update({ stock_quantity: next }).eq('id', productId);
      }
    }

    // --- push通知 ---
    await sendPushNotification(supabase, typedOrder.user_id, {
      title: 'ご注文確定',
      body: 'PayPayでの決済が完了しました。商品の準備ができましたらお知らせします。',
      data: { screen: 'OrderHistory', orderId: typedOrder.id },
    });

    return json({ received: true, orderId: typedOrder.id, status: 'paid' });
  } catch (e) {
    console.error('paypay-webhook error:', safeErrorMessage(e));
    return json({ error: 'Internal error' }, 500);
  }
});
