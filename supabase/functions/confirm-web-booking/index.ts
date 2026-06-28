// Supabase Edge Function: confirm-web-booking
// =====================================================
// 事前決済の【お支払い完了】をお客様自身が知らせるための公開エンドポイント（認証不要）。
// AirペイにはAPI/Webhookが無いため、決済完了の合図は「お客様がAirペイで決済 →
// Web予約ページに戻り『お支払いが完了しました』を押す」という自己申告。
//
// 役割:
//   ・対象予約（initial客の仮押さえ＝deposit_status='pending'）を deposit_status='paid' にして
//     hold_expires_at を解除＝予約を正式確定にする。
//   ・自己申告のため deposit_self_reported=true を立て、deposit_paid_by は NULL のまま残す。
//     → スタッフはアプリ「事前決済の管理」でAirペイ入金メールと突合できる。
//   ・確定したらスタッフグループLINEへ通知（notify-staff-group）。
//
// 入力(POST): { bookingId }
// 出力: { ok: true, alreadyConfirmed? } | { error, code }
//   code: 'not_found' | 'hold_expired' | 'invalid'
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = (Deno.env.get('WEB_BOOKING_ALLOWED_ORIGINS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsFor(origin: string | null) {
  let allow = '*';
  if (ALLOWED_ORIGINS.length > 0) {
    allow = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

async function notifyStaff(bookingId: string) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/notify-staff-group`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId }),
    });
  } catch (e) {
    console.error('notify-staff-group failed:', (e as Error).message);
  }
}

serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only', code: 'invalid' }, 405);

  try {
    const b = await req.json().catch(() => ({}));
    const bookingId = (b.bookingId ?? '').toString().trim();
    if (!UUID_RE.test(bookingId)) {
      return json({ error: '予約IDが正しくありません', code: 'invalid' }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 念のため期限切れ仮押さえをスイープ（pg_cron不在時の保険）
    await supabase.rpc('cancel_expired_deposit_holds');

    // 対象予約を取得
    const { data: bk, error: selErr } = await supabase
      .from('app_bookings')
      .select('id, status, deposit_status, deposit_amount, hold_expires_at')
      .eq('id', bookingId)
      .maybeSingle();
    if (selErr) {
      console.error('select error:', selErr.message);
      return json({ error: '予約の確認に失敗しました', code: 'invalid' }, 500);
    }
    if (!bk) return json({ error: '予約が見つかりません', code: 'not_found' }, 404);

    // 既に確定済み（二重押し）→ 冪等に成功を返す
    if (bk.deposit_status === 'paid' || bk.deposit_status === 'waived') {
      return json({ ok: true, alreadyConfirmed: true });
    }

    // 仮押さえが期限切れで自動キャンセルされている → 枠が解放済み。
    // お客様は決済済みの可能性が高いので、スタッフへ要対応通知を出す。
    if (bk.status === 'cancelled') {
      await notifyStaff(bookingId);
      return json({
        error: '恐れ入ります、お時間切れにより仮予約が取り消されました。お支払いがお済みの場合は、お手数ですが店舗までご連絡ください。',
        code: 'hold_expired',
      }, 409);
    }

    // pending 以外（none 等）はWeb事前決済の対象外
    if (bk.deposit_status !== 'pending') {
      return json({ error: 'この予約は事前決済の対象ではありません', code: 'invalid' }, 400);
    }

    // 確定: pending → paid（顧客自己申告）。WHERE に deposit_status を残し競合を防ぐ。
    const { data: updated, error: updErr } = await supabase
      .from('app_bookings')
      .update({
        deposit_status: 'paid',
        deposit_paid_at: new Date().toISOString(),
        deposit_self_reported: true,
        hold_expires_at: null,
      })
      .eq('id', bookingId)
      .eq('deposit_status', 'pending')
      .select('id')
      .maybeSingle();

    if (updErr) {
      console.error('update error:', updErr.message);
      return json({ error: '確定処理に失敗しました', code: 'invalid' }, 500);
    }
    if (!updated) {
      // 競合（直前に他処理で変化）→ 冪等に成功扱い
      return json({ ok: true, alreadyConfirmed: true });
    }

    // スタッフグループへ予約確定を通知
    await notifyStaff(bookingId);

    return json({ ok: true });
  } catch (e) {
    console.error('confirm-web-booking error:', (e as Error).message);
    return json({ error: 'Internal error', code: 'invalid' }, 500);
  }
});
