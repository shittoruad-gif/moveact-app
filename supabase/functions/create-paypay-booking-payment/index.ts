// Supabase Edge Function: create-paypay-booking-payment
// =====================================================
// 施術予約（app_bookings）の事前決済を PayPay 動的QRコードで作成する。
//
// 【処理内容】
// 1. 認証ユーザー確認
// 2. booking 取得 + 自分の予約かチェック
// 3. menu price + tag price から実支払い金額を再計算（サーバー側で必ず再計算）
// 4. PayPay API で動的QRコード発行（merchantPaymentId = booking.id）
// 5. deeplink / paypay_code_id / paypay_expires_at を bookings に保存
// 6. クライアントへ deeplink を返却
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createPayPayQrCode } from '../_shared/paypay.ts';
import { verifyAuth, json, corsHeaders, safeErrorMessage, AuthError } from '../_shared/auth.ts';

interface RequestBody {
  bookingId?: string;
}

const APP_REDIRECT_URL = Deno.env.get('APP_REDIRECT_URL') ?? 'moveact://shop/orders';

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
    if (!body.bookingId) {
      return json({ error: 'bookingId is required' }, 400);
    }
    const bookingId = body.bookingId;

    // --- booking 取得 (自分の予約のみ) ---
    const { data: booking, error: bErr } = await serviceClient
      .from('app_bookings')
      .select('*, treatment_menu:treatment_menus(id, name, price, duration_minutes)')
      .eq('id', bookingId)
      .eq('user_id', userId)
      .single();

    if (bErr || !booking) {
      return json({ error: 'Booking not found' }, 404);
    }
    if (booking.status === 'cancelled') {
      return json({ error: 'この予約はキャンセル済みです' }, 400);
    }
    if (booking.payment_status === 'paid') {
      return json({ error: '既に支払い済みです' }, 400);
    }
    if (!booking.treatment_menu) {
      return json({ error: 'Treatment menu not found' }, 404);
    }

    // --- サーバー側で金額再計算（タグ価格優先）---
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('tags')
      .eq('id', userId)
      .single();

    let price: number = booking.treatment_menu.price;
    const userTags: string[] = profile?.tags ?? [];
    if (userTags.length > 0) {
      const { data: tagPrices } = await serviceClient
        .from('menu_tag_prices')
        .select('tag, price')
        .eq('treatment_menu_id', booking.treatment_menu.id)
        .in('tag', userTags)
        .order('price', { ascending: true })
        .limit(1);
      if (tagPrices && tagPrices.length > 0) {
        price = tagPrices[0].price;
      }
    }

    if (price <= 0) {
      return json({ error: '料金が不正です' }, 400);
    }

    // --- PayPay API で QRコード発行 ---
    const expirySec = Math.floor(Date.now() / 1000) + 10 * 60; // 10分後
    const ppResponse = await createPayPayQrCode({
      merchantPaymentId: bookingId,
      amount: price,
      codeType: 'ORDER_QR',
      orderDescription: `Moveact 施術: ${booking.treatment_menu.name}`,
      orderItems: [{
        name: booking.treatment_menu.name,
        category: 'TREATMENT',
        quantity: 1,
        unitPrice: { amount: price, currency: 'JPY' },
      }],
      redirectUrl: APP_REDIRECT_URL,
      redirectType: 'APP_DEEP_LINK',
      expiresAt: expirySec,
    });

    if (ppResponse.resultInfo.code !== 'SUCCESS' || !ppResponse.data) {
      console.error('PayPay API error:', ppResponse.resultInfo);
      return json({
        error: 'PayPay decision failed',
        message: ppResponse.resultInfo.message,
      }, 500);
    }

    // --- booking に PayPay 情報を保存 ---
    const { error: updErr } = await serviceClient
      .from('app_bookings')
      .update({
        payment_method: 'paypay',
        payment_status: 'pending',
        payment_amount: price,
        paypay_code_id: ppResponse.data.codeId,
        paypay_deeplink: ppResponse.data.deeplink,
        paypay_expires_at: new Date(ppResponse.data.expiryDate * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updErr) {
      console.error('Failed to update booking:', updErr.code);
      return json({ error: 'DB update failed' }, 500);
    }

    return json({
      success: true,
      bookingId,
      deeplink: ppResponse.data.deeplink,
      url: ppResponse.data.url,
      amount: price,
      expiresAt: new Date(ppResponse.data.expiryDate * 1000).toISOString(),
    });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    console.error('create-paypay-booking-payment error:', safeErrorMessage(e));
    return json({ error: 'Internal error' }, 500);
  }
});
