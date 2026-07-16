// Supabase Edge Function: verify-paypay-payment
// =====================================================
// アプリが PayPay deeplink から戻ってきた瞬間に呼ばれる「決済確認」関数。
//
// 【処理内容】
// 1. 認証ユーザー確認 + 自分の注文かチェック
// 2. PayPay API で getPayPayPaymentDetails により最新ステータス取得
// 3. COMPLETED なら orders を 'paid' + クーポン消費 + 在庫減算 + push通知
// 4. EXPIRED/CANCELED/FAILED なら orders を 'cancelled' + クーポン予約解放
// 5. それ以外は何もしない（pending のまま）
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getPayPayPaymentDetails } from '../_shared/paypay.ts';
import { verifyAuth, json, corsHeaders, safeErrorMessage, AuthError } from '../_shared/auth.ts';
import { sendPushNotification } from '../_shared/push.ts';

interface RequestBody {
  orderId?: string;
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const { userId, serviceClient } = await verifyAuth(req);

    const body = (await req.json()) as RequestBody;
    if (!body.orderId) {
      return json({ error: 'orderId is required' }, 400);
    }
    const orderId = body.orderId;

    // --- 自分の注文を取得 ---
    const { data: order, error: orderErr } = await serviceClient
      .from('orders')
      .select('*, items:order_items(*, product:products(id))')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (orderErr || !order) {
      return json({ error: 'Order not found' }, 404);
    }
    const typedOrder = order as OrderRow;

    // --- 既に paid なら短絡 ---
    if (typedOrder.status === 'paid') {
      return json({ success: true, status: 'paid', alreadyProcessed: true });
    }
    if (typedOrder.status === 'cancelled') {
      return json({ success: true, status: 'cancelled', message: 'この注文はキャンセル済みです' });
    }

    // --- PayPay側の最新ステータスを取得 ---
    let details: { data?: { status?: string }; resultInfo?: { code?: string } } | null = null;
    try {
      details = await getPayPayPaymentDetails(orderId) as typeof details;
    } catch (e) {
      console.error('PayPay API error:', safeErrorMessage(e));
      return json({ success: false, status: typedOrder.status, message: 'PayPay APIに接続できませんでした' });
    }
    const ppStatus = details?.data?.status;

    if (ppStatus !== 'COMPLETED') {
      // 失敗系なら orders を cancelled に + クーポン予約解放
      if (ppStatus === 'CANCELED' || ppStatus === 'EXPIRED' || ppStatus === 'FAILED') {
        await serviceClient
          .from('orders')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', orderId)
          .eq('status', 'pending');
        await serviceClient.rpc('release_coupon_reservation', { p_order_id: orderId });

        return json({
          success: true,
          status: 'cancelled',
          paypayStatus: ppStatus,
          message:
            ppStatus === 'CANCELED' ? '決済がキャンセルされました' :
            ppStatus === 'EXPIRED' ? '決済の有効期限が切れました' :
            '決済に失敗しました',
        });
      }

      // CREATED / AUTHORIZED 等 → まだ pending のまま
      return json({
        success: true,
        status: typedOrder.status,
        paypayStatus: ppStatus ?? 'UNKNOWN',
        message: '決済が進行中です',
      });
    }

    // --- COMPLETED → 注文を paid に更新 ---
    const { error: updateErr } = await serviceClient
      .from('orders')
      .update({
        status: 'paid',
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .neq('status', 'paid');

    if (updateErr) {
      console.error('Failed to update order:', updateErr.code);
      return json({ error: 'DB update failed' }, 500);
    }

    // --- クーポン消費 ---
    if (typedOrder.applied_coupon_id) {
      await serviceClient
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
        await serviceClient.rpc('decrement_product_stock', {
          p_product_id: productId,
          p_quantity: item.quantity,
        });
      } catch {
        // RPC 失敗時のフォールバック
        const { data: cur } = await serviceClient
          .from('products')
          .select('stock_quantity')
          .eq('id', productId)
          .single();
        const next = Math.max(0, (cur?.stock_quantity ?? 0) - item.quantity);
        await serviceClient
          .from('products')
          .update({ stock_quantity: next })
          .eq('id', productId);
      }
    }

    // --- push通知 ---
    await sendPushNotification(serviceClient, typedOrder.user_id, {
      title: 'ご注文確定',
      body: 'PayPayでの決済が完了しました。商品の準備ができましたらお知らせします。',
      data: { screen: 'OrderHistory', orderId: typedOrder.id },
    });

    return json({ success: true, status: 'paid', orderId: typedOrder.id });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    console.error('verify-paypay-payment error:', safeErrorMessage(e));
    return json({ error: 'Internal error' }, 500);
  }
});
