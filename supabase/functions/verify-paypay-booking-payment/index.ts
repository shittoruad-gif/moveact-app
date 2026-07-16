// Supabase Edge Function: verify-paypay-booking-payment
// =====================================================
// アプリが PayPay deeplink から戻ってきた瞬間に呼ばれる「施術料金決済確認」関数。
//
// 【処理内容】
// 1. 認証ユーザー確認 + 自分の予約かチェック
// 2. PayPay API で getPayPayPaymentDetails により最新ステータス取得
// 3. COMPLETED なら app_bookings.payment_status = 'paid' + push通知
// 4. EXPIRED/CANCELED/FAILED なら payment_status を 'cancelled' に
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getPayPayPaymentDetails } from '../_shared/paypay.ts';
import { verifyAuth, json, corsHeaders, safeErrorMessage, AuthError } from '../_shared/auth.ts';
import { sendPushNotification } from '../_shared/push.ts';

interface RequestBody {
  bookingId?: string;
}

interface BookingRow {
  id: string;
  user_id: string;
  status: string;
  payment_status: string;
  payment_amount: number | null;
  treatment_menu?: { name?: string };
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
    if (!body.bookingId) {
      return json({ error: 'bookingId is required' }, 400);
    }
    const bookingId = body.bookingId;

    const { data: booking, error: bErr } = await serviceClient
      .from('app_bookings')
      .select('id, user_id, status, payment_status, payment_amount, treatment_menu:treatment_menus(name)')
      .eq('id', bookingId)
      .eq('user_id', userId)
      .single();

    if (bErr || !booking) {
      return json({ error: 'Booking not found' }, 404);
    }
    const typedBooking = booking as BookingRow;

    if (typedBooking.payment_status === 'paid') {
      return json({ success: true, payment_status: 'paid', alreadyProcessed: true });
    }
    if (typedBooking.payment_status === 'cancelled') {
      return json({ success: true, payment_status: 'cancelled', message: 'この決済はキャンセル済みです' });
    }

    // --- PayPay側のステータスを取得 ---
    let details: { data?: { status?: string }; resultInfo?: { code?: string } } | null = null;
    try {
      details = await getPayPayPaymentDetails(bookingId) as typeof details;
    } catch (e) {
      console.error('PayPay API error:', safeErrorMessage(e));
      return json({ success: false, payment_status: typedBooking.payment_status, message: 'PayPay APIに接続できませんでした' });
    }
    const ppStatus = details?.data?.status;

    if (ppStatus !== 'COMPLETED') {
      if (ppStatus === 'CANCELED' || ppStatus === 'EXPIRED' || ppStatus === 'FAILED') {
        await serviceClient
          .from('app_bookings')
          .update({
            payment_status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('id', bookingId)
          .eq('payment_status', 'pending');

        return json({
          success: true,
          payment_status: 'cancelled',
          paypayStatus: ppStatus,
          message:
            ppStatus === 'CANCELED' ? '決済がキャンセルされました' :
            ppStatus === 'EXPIRED' ? '決済の有効期限が切れました' :
            '決済に失敗しました',
        });
      }
      return json({
        success: true,
        payment_status: typedBooking.payment_status,
        paypayStatus: ppStatus ?? 'UNKNOWN',
        message: '決済が進行中です',
      });
    }

    // --- COMPLETED → paid に更新 ---
    const { error: updErr } = await serviceClient
      .from('app_bookings')
      .update({
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .neq('payment_status', 'paid');

    if (updErr) {
      console.error('Failed to update booking:', updErr.code);
      return json({ error: 'DB update failed' }, 500);
    }

    // --- push通知 ---
    await sendPushNotification(serviceClient, typedBooking.user_id, {
      title: '施術料金のお支払いが完了',
      body: `${typedBooking.treatment_menu?.name ?? 'ご予約'} の事前決済が完了しました。当日のお越しをお待ちしております。`,
      data: { screen: 'BookingHistory', bookingId },
    });

    return json({ success: true, payment_status: 'paid', bookingId });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    console.error('verify-paypay-booking-payment error:', safeErrorMessage(e));
    return json({ error: 'Internal error' }, 500);
  }
});
