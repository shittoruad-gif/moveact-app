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
import { sendConfirmationEmail } from '../_shared/email.ts';
import { createZoomMeeting } from '../_shared/zoom.ts';

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

async function notifyStaff(bookingId: string, eventType?: string) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/notify-staff-group`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventType ? { bookingId, eventType } : { bookingId }),
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

    // 【重要】グローバルなスイープ（cancel_expired_deposit_holds）はここでは呼ばない。
    // 先に呼ぶと、期限を「わずかに」過ぎてから『お支払いが完了しました』を押したお客様
    // 自身の仮押さえまで、この確定リクエストの冒頭で取り消してしまい hold_expired を返す。
    // → 対象予約を先に読み、猶予（GRACE）内なら pending→paid を許可。スイープは最後に回す。

    // 対象予約を取得（メール送信用に guest_email 等も含む）
    const { data: bk, error: selErr } = await supabase
      .from('app_bookings')
      .select('id, status, deposit_status, deposit_amount, hold_expires_at, guest_name, guest_email, starts_at, store_id, treatment_menu_id, staff_id, confirmation_email_sent_at, cancel_token')
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
    // お客様は決済済みの可能性が高いので、スタッフへ要対応通知（前金未確認キャンセルの文面）を出す。
    if (bk.status === 'cancelled') {
      await notifyStaff(bookingId, 'deposit_expired');
      return json({
        error: '恐れ入ります、お時間切れにより仮予約が取り消されました。お支払いがお済みの場合は、お手数ですが店舗までご連絡ください。',
        code: 'hold_expired',
      }, 409);
    }

    // confirmed 以外（completed / no_show 等）は事前決済の確定対象外
    if (bk.status !== 'confirmed') {
      return json({ error: 'この予約は事前決済の対象ではありません', code: 'invalid' }, 400);
    }

    // pending 以外（none 等）はWeb事前決済の対象外
    if (bk.deposit_status !== 'pending') {
      return json({ error: 'この予約は事前決済の対象ではありません', code: 'invalid' }, 400);
    }

    // 決済リンクを発行していない予約（hold_expires_at が最初から無い）は
    // 「お支払い完了」の自己申告対象外（スタッフが個別に確認するフロー）。
    if (!bk.hold_expires_at) {
      return json({ error: 'この予約は事前決済の対象ではありません', code: 'invalid' }, 400);
    }

    // 猶予（GRACE）判定: 決済後、戻ってボタンを押すまでの遅延を吸収する。
    // 期限を GRACE を超えて過ぎている場合のみ「時間切れ」とみなす（枠が実質失われた予約）。
    // GRACE 内（＝わずかな超過）なら、お客様自身の仮押さえとして pending→paid を許可する。
    // ※ここではまだグローバルスイープを走らせていないため、枠はまだ解放されていない。
    const HOLD_GRACE_MS = 5 * 60_000; // 5分
    if (bk.hold_expires_at) {
      const overdueMs = Date.now() - new Date(bk.hold_expires_at).getTime();
      if (overdueMs > HOLD_GRACE_MS) {
        // 猶予を超過 → 枠が失われた可能性が高い。スタッフへ要対応通知を出して案内する。
        await notifyStaff(bookingId);
        return json({
          error: '恐れ入ります、お時間切れにより仮予約が取り消されました。お支払いがお済みの場合は、お手数ですが店舗までご連絡ください。',
          code: 'hold_expired',
        }, 409);
      }
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
      // SELECT後にスイープ（自動キャンセル）が走った場合に paid を上書きしない。
      // これが無いと「status=cancelled かつ deposit=paid」の矛盾行ができ、
      // 枠が解放済みなのにお客様へ確定メールが送られる。
      .eq('status', 'confirmed')
      .select('id')
      .maybeSingle();

    if (updErr) {
      console.error('update error:', updErr.message);
      return json({ error: '確定処理に失敗しました', code: 'invalid' }, 500);
    }
    if (!updated) {
      // 競合（直前に他処理で変化）→ 現在の状態を取り直して正しい応答を返す。
      // スイープに自動キャンセルされていた場合は「成功」を返してはいけない（確定メールも送らない）。
      const { data: cur } = await supabase
        .from('app_bookings').select('status, deposit_status').eq('id', bookingId).maybeSingle();
      if (cur?.status === 'cancelled') {
        await notifyStaff(bookingId, 'deposit_expired');
        return json({
          error: '恐れ入ります、お時間切れにより仮予約が取り消されました。お支払いがお済みの場合は、お手数ですが店舗までご連絡ください。',
          code: 'hold_expired',
        }, 409);
      }
      if (cur?.deposit_status === 'paid' || cur?.deposit_status === 'waived') {
        return json({ ok: true, alreadyConfirmed: true });
      }
      return json({ error: '確定処理が競合しました。もう一度お試しください。', code: 'invalid' }, 409);
    }

    // 対象予約を paid に確定させた「後で」グローバルスイープを実行する（pg_cron不在時の保険）。
    // この時点で本予約は deposit_status='paid' なので、スイープ（pending のみ対象）には掛からない。
    // fire-and-forget: スイープの失敗で確定処理を巻き戻さない。
    supabase.rpc('cancel_expired_deposit_holds').then(() => {}, (e: unknown) =>
      console.error('sweep after confirm failed:', (e as Error).message));

    // メニュー情報（Zoom作成・確認メールで共用）
    const { data: menuRow } = await supabase
      .from('treatment_menus').select('name, duration_minutes').eq('id', bk.treatment_menu_id).maybeSingle();

    // --- Zoom会議の自動作成（zoom_user_id 設定スタッフの予約のみ）---
    //   通知の前に作成しURLを保存（LINE通知にも載る）。失敗してもZoom無しで確定。
    let zoomJoinUrl: string | null = null;
    try {
      if (bk.staff_id && menuRow) {
        const { data: staffProf } = await supabase
          .from('profiles').select('zoom_user_id').eq('id', bk.staff_id).maybeSingle();
        if (staffProf?.zoom_user_id) {
          const m = await createZoomMeeting({
            hostUserId: staffProf.zoom_user_id,
            topic: `${menuRow.name}（${bk.guest_name}様）`,
            startIso: bk.starts_at,
            durationMin: menuRow.duration_minutes,
          });
          if (m) {
            zoomJoinUrl = m.joinUrl;
            await supabase.from('app_bookings')
              .update({ zoom_join_url: m.joinUrl, zoom_meeting_id: m.id }).eq('id', bookingId);
          }
        }
      }
    } catch (e) {
      console.error('zoom create failed:', (e as Error).message);
    }

    // スタッフグループへ予約確定を通知
    await notifyStaff(bookingId);

    // 確認メール（事前決済完了 = 予約確定）。未送信かつメールありの場合のみ。
    if (bk.guest_email && !bk.confirmation_email_sent_at && menuRow) {
      const startsJst = new Date(new Date(bk.starts_at).getTime() + 9 * 3600_000);
      const date = startsJst.toISOString().slice(0, 10);
      const time = `${String(startsJst.getUTCHours()).padStart(2, '0')}:${String(startsJst.getUTCMinutes()).padStart(2, '0')}`;
      sendConfirmationEmail({
        guestName: bk.guest_name,
        guestEmail: bk.guest_email,
        date, time,
        menuName: menuRow.name,
        durationMinutes: menuRow.duration_minutes,
        storeId: bk.store_id,
        cancelToken: bk.cancel_token ?? undefined,
        zoomUrl: zoomJoinUrl ?? undefined,
      }).then(() =>
        supabase.from('app_bookings')
          .update({ confirmation_email_sent_at: new Date().toISOString() })
          .eq('id', bookingId).then(() => {})
      ).catch((e) => console.error('confirmation email failed:', (e as Error).message));
    }

    return json({ ok: true, zoomJoinUrl });
  } catch (e) {
    console.error('confirm-web-booking error:', (e as Error).message);
    return json({ error: 'Internal error', code: 'invalid' }, 500);
  }
});
