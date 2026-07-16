// Supabase Edge Function: create-paypay-payment
// =====================================================
// 顧客が商品購入時に呼び出す動的PayPay決済作成API。
//
// 【処理内容】
// 1. 認証ユーザーを確認（共通 verifyAuth）
// 2. 入力検証 + 商品取得 + 在庫チェック + クーポン検証 + 金額再計算（共通 validateOrderInput）
// 3. orders を pending 状態で作成（order.id = PayPay の merchantPaymentId）
// 4. order_items を service key で挿入（RLS bypass、改ざん防止）
// 5. クーポンを order に予約（reserved_for_order_id）
// 6. PayPay API を呼んで動的QRコードを発行
// 7. 失敗時はロールバック（order=cancelled、coupon予約解除）
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createPayPayQrCode } from '../_shared/paypay.ts';
import { verifyAuth, json, corsHeaders, safeErrorMessage, AuthError } from '../_shared/auth.ts';
import { validateOrderInput, reserveCoupon, OrderError } from '../_shared/order.ts';

const appRedirectUrl = Deno.env.get('APP_REDIRECT_URL') ?? 'moveact://shop/orders';

interface RequestBody {
  productId?: string;
  quantity?: unknown;
  storeId?: string;
  couponId?: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    // --- 認証 ---
    const { userId, serviceClient } = await verifyAuth(req);

    // --- 入力検証 ---
    const body = (await req.json()) as RequestBody;
    if (!body.storeId || (body.storeId !== 'kanamitsu' && body.storeId !== 'tamashima')) {
      return json({ error: 'storeId is required (kanamitsu | tamashima)' }, 400);
    }

    const validated = await validateOrderInput(serviceClient, userId, {
      productId: body.productId,
      quantity: body.quantity,
      couponId: body.couponId ?? null,
      requirePaypay: true,
    });

    const { product, qty, subtotal, discountAmount, total, coupon } = validated;

    // --- orders を pending で作成 ---
    const { data: order, error: orderErr } = await serviceClient
      .from('orders')
      .insert({
        user_id: userId,
        store_id: body.storeId,
        pickup_store: body.storeId,
        status: 'pending',
        payment_method: 'paypay',
        subtotal,
        tax: 0,
        total,
        discount_amount: discountAmount,
        applied_coupon_id: coupon?.id ?? null,
      })
      .select()
      .single();
    if (orderErr || !order) {
      console.error('order insert error:', orderErr?.code);
      return json({ error: '注文作成に失敗しました' }, 500);
    }

    // --- order_items 挿入（service key 経由なので RLS bypass）---
    const { error: itemErr } = await serviceClient.from('order_items').insert({
      order_id: order.id,
      product_id: product.id,
      quantity: qty,
      unit_price: product.price,
    });
    if (itemErr) {
      console.error('order_items insert error:', itemErr.code);
      await serviceClient.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
      return json({ error: '注文明細の作成に失敗しました' }, 500);
    }

    // --- クーポン予約 ---
    if (coupon) {
      try {
        await reserveCoupon(serviceClient, coupon.id, order.id);
      } catch (e) {
        // 予約失敗 → 注文ロールバック
        await serviceClient.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
        return json({
          error: e instanceof OrderError ? e.message : 'クーポン予約に失敗しました',
        }, 409);
      }
    }

    // --- PayPay API 呼び出し（10分有効期限）---
    const expiresAtSec = Math.floor(Date.now() / 1000) + 10 * 60;

    const paypayResult = await createPayPayQrCode({
      merchantPaymentId: order.id,
      amount: total,
      codeType: 'ORDER_QR',
      orderDescription: `${product.name}${qty > 1 ? ` ×${qty}` : ''}`,
      orderItems: [
        {
          name: product.name,
          quantity: qty,
          productId: product.id,
          unitPrice: { amount: product.price, currency: 'JPY' },
        },
      ],
      redirectUrl: `${appRedirectUrl}?orderId=${order.id}`,
      redirectType: 'APP_DEEP_LINK',
      expiresAt: expiresAtSec,
      isAuthorization: false,
    });

    if (paypayResult.resultInfo?.code !== 'SUCCESS' || !paypayResult.data) {
      console.error('PayPay API error:', paypayResult.resultInfo?.code);
      // ロールバック
      await serviceClient.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
      if (coupon) {
        await serviceClient.rpc('release_coupon_reservation', { p_order_id: order.id });
      }
      return json({
        error: 'PayPay決済の作成に失敗しました',
        code: paypayResult.resultInfo?.code,
      }, 502);
    }

    const { url, deeplink, codeId, expiryDate } = paypayResult.data;

    // --- orders に PayPay情報を保存 ---
    await serviceClient
      .from('orders')
      .update({
        paypay_code_id: codeId,
        paypay_deeplink: deeplink,
        paypay_expires_at: new Date(expiryDate * 1000).toISOString(),
      })
      .eq('id', order.id);

    return json({
      success: true,
      orderId: order.id,
      deeplink,
      url,
      total,
      discountAmount,
      expiresAt: new Date(expiryDate * 1000).toISOString(),
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    if (e instanceof OrderError) return json({ error: e.message }, e.status);
    console.error('create-paypay-payment error:', safeErrorMessage(e));
    return json({ error: 'Internal error' }, 500);
  }
});
