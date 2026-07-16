// Supabase Edge Function: cancel-web-booking
// =====================================================
// お客様がメールリンクから予約をキャンセル・変更（キャンセル後に再予約）するための
// 公開エンドポイント（認証不要）。
//
// GET  ?token=<uuid>   → 予約情報と「キャンセル可否」を返す
// POST { token }       → キャンセル実行
//
// キャンセル不可のケース:
//   ・当日（JST）の予約（前日23:59まで受付）
//   ・既にキャンセル済み
//   ・過去の予約
//   ・事前決済済み（paid）→ 不可。スタッフ電話案内に誘導
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALLOWED_ORIGINS = (Deno.env.get('WEB_BOOKING_ALLOWED_ORIGINS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const STORE_MAP: Record<string, { name: string; phone: string }> = {
  tamashima: { name: '玉島店', phone: '080-5126-4249' },
  kanamitsu: { name: '金光店', phone: '070-2231-8300' },
};

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function fmtDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  const dow = new Date(`${d}T00:00:00+09:00`).getDay();
  return `${y}年${m}月${day}日（${WEEKDAYS[dow]}）`;
}

function corsFor(origin: string | null) {
  let allow = '*';
  if (ALLOWED_ORIGINS.length > 0) {
    allow = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 今日のJST日付を "YYYY-MM-DD" で返す */
function todayJst(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const supabase = createClient(supabaseUrl, serviceKey);

  // ===== GET: 予約情報取得 =====
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const token = (url.searchParams.get('token') ?? '').trim();
    if (!UUID_RE.test(token)) return json({ error: 'トークンが正しくありません', code: 'invalid' }, 400);

    const { data: bk, error } = await supabase
      .from('app_bookings')
      .select('id, status, deposit_status, starts_at, guest_name, store_id, treatment_menu_id, staff_id')
      .eq('cancel_token', token)
      .maybeSingle();

    if (error) return json({ error: '情報の取得に失敗しました', code: 'invalid' }, 500);
    if (!bk) return json({ error: '予約が見つかりません。リンクが正しいか確認してください。', code: 'not_found' }, 404);

    const { data: menu } = await supabase
      .from('treatment_menus').select('name, duration_minutes').eq('id', bk.treatment_menu_id).maybeSingle();

    const { data: staff } = await supabase
      .from('profiles').select('full_name, booking_slug').eq('id', bk.staff_id).maybeSingle();

    const store = STORE_MAP[bk.store_id];

    // starts_at (UTC) → JST
    const startsUtc = new Date(bk.starts_at);
    const startsJst = new Date(startsUtc.getTime() + 9 * 3600_000);
    const date = startsJst.toISOString().slice(0, 10);
    const time = `${String(startsJst.getUTCHours()).padStart(2, '0')}:${String(startsJst.getUTCMinutes()).padStart(2, '0')}`;

    const today = todayJst();
    const isCancelled = bk.status === 'cancelled';
    const isPast = date < today;
    const isToday = date === today;
    const isPaid = bk.deposit_status === 'paid';

    let canCancel = true;
    let cannotCancelReason: string | null = null;

    if (isCancelled) {
      canCancel = false;
      cannotCancelReason = 'この予約はすでにキャンセル済みです。';
    } else if (isPast) {
      canCancel = false;
      cannotCancelReason = 'この予約の日時はすでに過ぎています。';
    } else if (isToday) {
      canCancel = false;
      cannotCancelReason = '当日キャンセルはお電話にてご連絡ください。';
    } else if (isPaid) {
      canCancel = false;
      cannotCancelReason = '事前決済済みのご予約のキャンセルは、お電話にてご連絡ください。';
    }

    return json({
      ok: true,
      booking: {
        date,
        time,
        dateLabel: fmtDate(date),
        menuName: menu?.name ?? '',
        durationMinutes: menu?.duration_minutes ?? 0,
        storeName: store?.name ?? '',
        storePhone: store?.phone ?? '',
        guestName: bk.guest_name,
        status: bk.status,
        depositStatus: bk.deposit_status,
        staffSlug: staff?.booking_slug ?? null,
        canCancel,
        cannotCancelReason,
      },
    });
  }

  // ===== POST: キャンセル実行 =====
  if (req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const token = (b.token ?? '').toString().trim();
    if (!UUID_RE.test(token)) return json({ error: 'トークンが正しくありません', code: 'invalid' }, 400);

    const { data: bk, error: selErr } = await supabase
      .from('app_bookings')
      .select('id, status, deposit_status, starts_at, guest_name, guest_email, store_id, staff_id, treatment_menu_id')
      .eq('cancel_token', token)
      .maybeSingle();

    if (selErr) return json({ error: '予約の確認に失敗しました', code: 'invalid' }, 500);
    if (!bk) return json({ error: '予約が見つかりません', code: 'not_found' }, 404);

    const startsUtc = new Date(bk.starts_at);
    const startsJst = new Date(startsUtc.getTime() + 9 * 3600_000);
    const date = startsJst.toISOString().slice(0, 10);
    const today = todayJst();

    if (bk.status === 'cancelled') return json({ ok: true, alreadyCancelled: true });
    if (date < today) return json({ error: '過去の予約はキャンセルできません', code: 'invalid' }, 400);
    if (date === today) return json({ error: '当日キャンセルはお電話にてご連絡ください', code: 'same_day' }, 400);
    if (bk.deposit_status === 'paid') return json({ error: '事前決済済みのキャンセルはお電話にてご連絡ください', code: 'paid' }, 400);

    const { error: updErr } = await supabase
      .from('app_bookings')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', bk.id)
      .eq('status', 'confirmed');

    if (updErr) return json({ error: 'キャンセルに失敗しました', code: 'invalid' }, 500);

    // スタッフLINE通知（キャンセル）
    try {
      await fetch(`${supabaseUrl}/functions/v1/notify-staff-group`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bk.id, eventType: 'cancelled' }),
      });
    } catch (e) {
      console.error('notify-staff-group failed:', (e as Error).message);
    }

    // 同日・同店舗のキャンセル待ちへ空き通知（customer-cancel-booking と同一の動作にそろえる）
    try {
      const dateJst = new Date(new Date(bk.starts_at).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
      await fetch(`${supabaseUrl}/functions/v1/notify-waitlist`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: bk.store_id, date: dateJst }),
      });
    } catch (e) {
      console.error('notify-waitlist failed:', (e as Error).message);
    }

    // キャンセル確認メール
    if (bk.guest_email) {
      const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
      const FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Moveact予約 <noreply@moveact.jp>';
      if (RESEND_KEY) {
        const store = STORE_MAP[bk.store_id];
        const { data: menu } = await supabase
          .from('treatment_menus').select('name, duration_minutes').eq('id', bk.treatment_menu_id).maybeSingle();
        const WEEKDAYS_LOCAL = ['日', '月', '火', '水', '木', '金', '土'];
        const [y, m, day] = date.split('-').map(Number);
        const dow = new Date(`${date}T00:00:00+09:00`).getDay();
        const dateLabel = `${y}年${m}月${day}日（${WEEKDAYS_LOCAL[dow]}）`;
        const time = `${String(startsJst.getUTCHours()).padStart(2, '0')}:${String(startsJst.getUTCMinutes()).padStart(2, '0')}`;

        const html = `<!DOCTYPE html><html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:'Helvetica Neue',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px">
<table width="100%" style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
  <tr><td style="background:#1a1a1a;padding:28px 32px">
    <div style="color:#C4956A;font-size:22px;letter-spacing:4px;font-weight:300">MOVEACT</div>
    <div style="color:#888;font-size:12px;letter-spacing:2px;margin-top:4px">整体・美容鍼・ピラティス</div>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="color:#333;font-size:16px;margin:0 0 8px 0">${bk.guest_name} 様</p>
    <p style="color:#333;font-size:15px;margin:0 0 24px 0">以下のご予約をキャンセルいたしました。</p>
    <table width="100%" style="border:1px solid #e8e4dd;border-radius:6px;overflow:hidden">
      <tr><td style="background:#f8f5f0;padding:12px 16px;border-bottom:1px solid #e8e4dd">
        <span style="color:#C4956A;font-size:12px;letter-spacing:1px">キャンセルしたご予約</span>
      </td></tr>
      <tr><td style="padding:16px">
        <table width="100%">
          <tr><td style="color:#888;font-size:13px;padding:5px 0;width:80px">日時</td>
              <td style="color:#333;font-size:14px;padding:5px 0"><s>${dateLabel} ${time}</s></td></tr>
          <tr><td style="color:#888;font-size:13px;padding:5px 0">メニュー</td>
              <td style="color:#333;font-size:14px;padding:5px 0">${menu?.name ?? ''}（${menu?.duration_minutes ?? 0}分）</td></tr>
          <tr><td style="color:#888;font-size:13px;padding:5px 0">店舗</td>
              <td style="color:#333;font-size:14px;padding:5px 0">${store?.name ?? ''}</td></tr>
        </table>
      </td></tr>
    </table>
    <p style="color:#666;font-size:14px;margin-top:20px">またのご来院をお待ちしております。<br>ご不明な点はお電話にてご連絡ください。<br>${store?.phone ?? ''}</p>
    <p style="color:#999;font-size:12px;margin-top:24px">このメールはMoveact Web予約システムから自動送信されています。</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM_EMAIL, to: [bk.guest_email], subject: `【Moveact】ご予約をキャンセルしました｜${dateLabel}`, html }),
        }).catch(() => {});
      }
    }

    const { data: staff } = await supabase
      .from('profiles').select('booking_slug').eq('id', bk.staff_id).maybeSingle();

    return json({ ok: true, staffSlug: staff?.booking_slug ?? null });
  }

  return json({ error: 'Method not allowed', code: 'invalid' }, 405);
});
