// Supabase Edge Function: customer-cancel-booking
// =====================================================
// 顧客本人によるアプリ内予約（app_bookings）キャンセルの正規エンドポイント。
// RNアプリの「予約履歴」画面から supabase.functions.invoke で呼ぶ
// （verify_jwt=true のデフォルト運用。config.toml への追記は不要）。
//
// 入力(POST): { bookingId }
// 処理:
//   1. JWTのユーザーが当該予約の user_id 本人であることを service role で検証
//   2. status='cancelled' へ更新
//      （既に cancelled → 冪等に成功応答／completed・no_show → 変更せず理由を返す）
//   3. 予約時に使用済みへ更新したクーポン(applied_coupon_id)を解放
//   4. スタッフグループLINEへキャンセル通知（notify-staff-group / service role。
//      当日キャンセル(JST)は「（当日キャンセル）」を付記）
//   5. 同日・同店舗のキャンセル待ちへ空き通知（notify-waitlist / service role）
// 出力: { ok: true, alreadyCancelled? } | { ok: false, code, message } | { error }
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { verifyAuth, AuthError, corsHeaders, json, safeErrorMessage } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const { userId, serviceClient: supabase } = await verifyAuth(req);

    const { bookingId } = await req.json();
    if (!bookingId || typeof bookingId !== 'string') {
      return json({ error: 'bookingId は必須です' }, 400);
    }

    const { data: booking } = await supabase
      .from('app_bookings')
      .select('id, user_id, store_id, starts_at, status, applied_coupon_id')
      .eq('id', bookingId)
      .maybeSingle();
    if (!booking) return json({ error: '予約が見つかりません', code: 'not_found' }, 404);

    // 本人確認: JWTのユーザー = 予約のuser_id
    if (booking.user_id !== userId) {
      return json({ error: 'この予約を操作する権限がありません', code: 'forbidden' }, 403);
    }

    // 冪等: 既にキャンセル済みならそのまま成功応答（通知も再送しない）
    if (booking.status === 'cancelled') {
      return json({ ok: true, alreadyCancelled: true });
    }
    // 施術完了・無断キャンセル記録済みは変更しない（200で理由を返しアプリ側で案内）
    if (booking.status === 'completed' || booking.status === 'no_show') {
      return json({
        ok: false,
        code: booking.status,
        message: 'この予約はすでに施術が完了しているため、キャンセルできません。ご不明な点は店舗までお問い合わせください。',
      });
    }

    // キャンセルへ更新（本人・現ステータス一致を条件に二重処理を防止）
    const { error: updErr } = await supabase
      .from('app_bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('user_id', userId)
      .eq('status', booking.status);
    if (updErr) return json({ error: 'キャンセル処理に失敗しました' }, 500);

    // 予約時に使用済みへ更新したクーポンを解放（未消化なので再度使える状態へ戻す）
    if (booking.applied_coupon_id) {
      const { error: cpErr } = await supabase
        .from('coupons')
        .update({ is_used: false, used_at: null })
        .eq('id', booking.applied_coupon_id)
        .eq('user_id', booking.user_id)
        .eq('is_used', true);
      if (cpErr) console.error('coupon release failed:', cpErr.message);
    }

    // スタッフグループLINEへキャンセル通知（当日判定・文面整形は notify-staff-group 側）
    try {
      await fetch(`${supabaseUrl}/functions/v1/notify-staff-group`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, eventType: 'cancelled' }),
      });
    } catch (e) {
      console.error('notify-staff-group failed:', (e as Error).message);
    }

    // 空きが出たので同日・同店舗のキャンセル待ちへ通知（JSTの日付で）
    try {
      const dateJst = new Date(new Date(booking.starts_at).getTime() + 9 * 3600_000)
        .toISOString().slice(0, 10);
      await fetch(`${supabaseUrl}/functions/v1/notify-waitlist`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: booking.store_id, date: dateJst }),
      });
    } catch (e) {
      console.error('notify-waitlist failed:', (e as Error).message);
    }

    return json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    return json({ error: safeErrorMessage(e) }, 500);
  }
});
