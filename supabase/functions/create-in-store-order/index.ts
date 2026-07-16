// Supabase Edge Function: create-in-store-order
// =====================================================
// 店頭支払い（現金/カード/店頭PayPay）注文を作成する。
// クライアント側 RLS では金額改ざん・order_items 保存ができないため、
// すべての注文作成を Edge Function 経由に統一する。
//
// 【処理内容】
// 1. 認証ユーザー確認
// 2. 入力検証 + 商品取得 + 在庫チェック + クーポン検証 + 金額再計算
// 3. orders を pending で作成（決済は店頭で）
// 4. order_items を挿入
// 5. クーポンを order に予約（店頭でスタッフが確定時に消費）
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { verifyAuth, json, corsHeaders, safeErrorMessage, AuthError } from '../_shared/auth.ts';
import { validateOrderInput, reserveCoupon, OrderError } from '../_shared/order.ts';

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
    const { userId, serviceClient } = await verifyAuth(req);

    const body = (await req.json()) as RequestBody;
    if (!body.storeId || (body.storeId !== 'kanamitsu' && body.storeId !== 'tamashima')) {
      return json({ error: 'storeId is required (kanamitsu | tamashima)' }, 400);
    }

    const validated = await validateOrderInput(serviceClient, userId, {
      productId: body.productId,
      quantity: body.quantity,
      couponId: body.couponId ?? null,
    });

    const { product, qty, subtotal, discountAmount, total, coupon } = validated;

    // --- 注文作成 ---
    const { data: order, error: orderErr } = await serviceClient
      .from('orders')
      .insert({
        user_id: userId,
        store_id: body.storeId,
        pickup_store: body.storeId,
        status: 'pending',
        payment_method: 'in_store',
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

    // --- order_items 挿入 ---
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

    // --- クーポン予約（店頭で受取時にスタッフが確定）---
    if (coupon) {
      try {
        await reserveCoupon(serviceClient, coupon.id, order.id);
      } catch (e) {
        await serviceClient.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
        return json({
          error: e instanceof OrderError ? e.message : 'クーポン予約に失敗しました',
        }, 409);
      }
    }

    return json({
      success: true,
      orderId: order.id,
      total,
      discountAmount,
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    if (e instanceof OrderError) return json({ error: e.message }, e.status);
    console.error('create-in-store-order error:', safeErrorMessage(e));
    return json({ error: 'Internal error' }, 500);
  }
});
