// Supabase Edge Function: create-web-booking
// =====================================================
// 公開Web予約ページからのゲスト予約を作成（認証不要・公開）。
// service role で実行し、サーバー側で枠を再検証してから挿入する。
// 二重予約は DB の EXCLUDE 制約（migration 066）で物理的に防止し、
// 競合時は slot_taken を返す。
//
// 初回のお客様は事前決済（前金）を促す:
//   ・guest_phone(数字のみ) で過去予約/会員を照合 → 無ければ初回
//   ・初回は deposit_status='pending', deposit_amount=メニュー価格 で仮押さえ
//   ・payment_links（Airペイの金額固定リンク）から該当URLを返す
//
// 入力(POST): { storeId, menuId, date, time, staffId?, guestName, guestPhone, guestEmail?, request? }
// 出力: { bookingId, requiresDeposit, depositAmount, paymentUrl } | { error, code }
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// 許可オリジン（カンマ区切り）。未設定なら '*'（ドメイン確定後に設定推奨）
const ALLOWED_ORIGINS = (Deno.env.get('WEB_BOOKING_ALLOWED_ORIGINS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const BUFFER = 15;            // 前後バッファ（分）
const MAX_OK_GAP = 30;        // すきま時間ブロック: これ以下のギャップはOK
const MIN_FITTABLE_GAP = 75;  // これ以上ならOK
const IP_LIMIT_PER_HOUR = 10; // 同一IPの1時間あたり上限
const PHONE_LIMIT_PER_DAY = 5;// 同一電話の1日あたり上限
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only', code: 'invalid' }, 405);

  try {
    const b = await req.json().catch(() => ({}));
    const storeId = (b.storeId ?? '').toString();
    const menuId = (b.menuId ?? '').toString();
    const date = (b.date ?? '').toString();
    const time = (b.time ?? '').toString();
    const staffId = (b.staffId ?? '').toString() || null;
    const guestName = (b.guestName ?? '').toString().trim();
    const guestPhone = (b.guestPhone ?? '').toString().trim();
    const guestEmail = (b.guestEmail ?? '').toString().trim() || null;
    const request = (b.request ?? '').toString().trim().slice(0, 1000) || null;

    // --- 入力検証 ---
    if (!storeId || !menuId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return json({ error: '入力が正しくありません', code: 'invalid' }, 400);
    }
    const [yy, mm, dd] = date.split('-').map(Number);
    // 月またぎの不正日付(例:2025-02-31, 2099-99-99)を排除（UTC構築で往復検証）
    const probe = new Date(Date.UTC(yy, mm - 1, dd));
    if (probe.getUTCFullYear() !== yy || probe.getUTCMonth() !== mm - 1 || probe.getUTCDate() !== dd) {
      return json({ error: '日付が正しくありません', code: 'invalid' }, 400);
    }
    const [thh, tmm] = time.split(':').map(Number);
    if (thh < 0 || thh > 23 || tmm < 0 || tmm > 59) {
      return json({ error: '時刻が正しくありません', code: 'invalid' }, 400);
    }
    if (!guestName || guestName.length > 50) return json({ error: 'お名前を正しく入力してください', code: 'invalid' }, 400);
    const phoneNorm = guestPhone.replace(/\D/g, '');
    if (phoneNorm.length < 10 || phoneNorm.length > 11) {
      return json({ error: '電話番号を正しく入力してください', code: 'invalid' }, 400);
    }
    if (guestEmail && !EMAIL_RE.test(guestEmail)) {
      return json({ error: 'メールアドレスの形式が正しくありません', code: 'invalid' }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // --- 期限切れの仮押さえ（未払い）を先に解放（pg_cron不在時の保険・枠を正しく開ける）---
    await supabase.rpc('cancel_expired_deposit_holds').then(() => {}, () => {});

    // --- レート制限（IP / 電話）---
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
    const since1h = new Date(Date.now() - 3600_000).toISOString();
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const [{ count: ipCount }, { count: phoneCount }] = await Promise.all([
      supabase.from('web_booking_rate_limit').select('id', { count: 'exact', head: true })
        .eq('ip', ip).gte('created_at', since1h),
      supabase.from('web_booking_rate_limit').select('id', { count: 'exact', head: true })
        .eq('phone_norm', phoneNorm).gte('created_at', since24h),
    ]);
    if ((ipCount ?? 0) >= IP_LIMIT_PER_HOUR || (phoneCount ?? 0) >= PHONE_LIMIT_PER_DAY) {
      return json({ error: 'ご予約の回数が上限に達しました。しばらくしてからお試しください。', code: 'rate_limited' }, 429);
    }
    // 試行を記録 + 古いログを掃除（ベストエフォート）
    await supabase.from('web_booking_rate_limit').insert({ ip, phone_norm: phoneNorm });
    supabase.from('web_booking_rate_limit').delete().lt('created_at', since24h).then(() => {});

    // --- メニュー ---
    const { data: menu } = await supabase
      .from('treatment_menus').select('duration_minutes, name, price').eq('id', menuId).eq('is_active', true).single();
    if (!menu) return json({ error: 'メニューが見つかりません', code: 'invalid' }, 404);
    const duration = menu.duration_minutes as number;

    // --- 店舗で提供されているメニューか ---
    const { data: stm } = await supabase
      .from('store_treatment_menus')
      .select('store_id').eq('store_id', storeId).eq('treatment_menu_id', menuId).eq('is_available', true).maybeSingle();
    if (!stm) return json({ error: 'この店舗では受付できないメニューです', code: 'invalid' }, 400);

    // --- 営業時間 / 休業日 ---
    const dow = new Date(`${date}T00:00:00+09:00`).getDay();
    const { data: closed } = await supabase
      .from('store_closed_days').select('*').eq('store_id', storeId).eq('date', date).maybeSingle();
    let openMin: number | null = null, closeMin: number | null = null;
    if (closed) {
      if (closed.is_closed) return json({ error: '休業日です', code: 'closed' }, 409);
      if (closed.open_time && closed.close_time) { openMin = toMin(closed.open_time); closeMin = toMin(closed.close_time); }
    }
    if (openMin === null) {
      const { data: bh } = await supabase
        .from('store_business_hours').select('*').eq('store_id', storeId).eq('day_of_week', dow).maybeSingle();
      if (!bh || bh.is_closed || !bh.open_time || !bh.close_time) {
        return json({ error: '休業日です', code: 'closed' }, 409);
      }
      openMin = toMin(bh.open_time); closeMin = toMin(bh.close_time);
    }

    const slotStart = toMin(time);
    const slotEnd = slotStart + duration;
    if (slotStart < openMin! || slotEnd > closeMin!) {
      return json({ error: '営業時間外です', code: 'closed' }, 409);
    }

    // --- 過去日時の拒否 ---
    const base = new Date(`${date}T00:00:00+09:00`).getTime();
    const nowJst = Math.round((Date.now() - base) / 60000);
    if (nowJst >= 0 && nowJst <= 1440 && slotStart <= nowJst) {
      return json({ error: '過去の時刻は予約できません', code: 'slot_taken' }, 409);
    }
    // 受付は本日〜180日先まで
    if (base - new Date().setHours(0, 0, 0, 0) > 200 * 86_400_000) {
      return json({ error: '予約できる期間を超えています', code: 'invalid' }, 400);
    }

    // --- ロスター ---
    const { data: roster } = await supabase
      .from('staff_stores').select('staff_id').eq('store_id', storeId).eq('is_active', true);
    let staffIds: string[] = (roster ?? []).map((r: { staff_id: string }) => r.staff_id);
    if (staffIds.length === 0) {
      const { data: allStaff } = await supabase.from('profiles').select('id').in('role', ['staff', 'admin']);
      staffIds = (allStaff ?? []).map((r: { id: string }) => r.id);
    }
    if (staffId) {
      if (!staffIds.includes(staffId)) {
        return json({ error: '指名スタッフはこの店舗で受付していません', code: 'invalid' }, 400);
      }
      staffIds = [staffId];
    }

    // --- 当日の予約・ブロック ---
    const dayStart = `${date}T00:00:00+09:00`;
    const dayEnd = `${date}T23:59:59+09:00`;
    const [{ data: bookings }, { data: unavail }] = await Promise.all([
      supabase.from('app_bookings')
        .select('staff_id, starts_at, ends_at, buffer_before, buffer_after')
        .eq('store_id', storeId).neq('status', 'cancelled')
        .gte('starts_at', dayStart).lte('starts_at', dayEnd),
      supabase.from('staff_unavailability')
        .select('staff_id, starts_at, ends_at')
        .eq('store_id', storeId)
        .lte('starts_at', dayEnd).gte('ends_at', dayStart),
    ]);

    const jstMin = (iso: string) => Math.round((new Date(iso).getTime() - base) / 60000);
    const bufStart = slotStart - BUFFER, bufEnd = slotEnd + BUFFER;

    interface Busy { start: number; end: number; }
    const busyByStaff = new Map<string, Busy[]>();
    const ensure = (id: string) => { if (!busyByStaff.has(id)) busyByStaff.set(id, []); return busyByStaff.get(id)!; };
    const unassigned: Busy[] = [];
    for (const bk of (bookings ?? [])) {
      const iv = { start: jstMin(bk.starts_at) - (bk.buffer_before ?? BUFFER), end: jstMin(bk.ends_at) + (bk.buffer_after ?? BUFFER) };
      if (bk.staff_id && staffIds.includes(bk.staff_id)) ensure(bk.staff_id).push(iv);
      else if (!bk.staff_id) unassigned.push(iv); // staff_id無し(おまかせ未確定)のみ未割当扱い
    }
    for (const u of (unavail ?? [])) {
      if (u.staff_id && staffIds.includes(u.staff_id)) ensure(u.staff_id).push({ start: jstMin(u.starts_at), end: jstMin(u.ends_at) });
    }

    // --- 空きスタッフを特定 ---
    const freeStaffIds = staffIds.filter((id) => {
      const intervals = busyByStaff.get(id) ?? [];
      return !intervals.some((x) => bufStart < x.end && bufEnd > x.start);
    });
    // 指名なし時のみ、未割当予約が空きを消費（指名時は無関係）
    const overlappingUnassigned = staffId ? 0 : unassigned.filter((x) => bufStart < x.end && bufEnd > x.start).length;
    const effectiveFree = freeStaffIds.length - overlappingUnassigned;
    if (effectiveFree <= 0 || freeStaffIds.length === 0) {
      return json({ error: 'この枠は埋まってしまいました。別の時間をお選びください。', code: 'slot_taken' }, 409);
    }

    // --- すきま時間ブロック（get-available-slots と整合）---
    const realBusy = (bookings ?? []).map((bk) => ({ start: jstMin(bk.starts_at), end: jstMin(bk.ends_at) }));
    let beforeEnd = -Infinity, afterStart = Infinity;
    for (const x of realBusy) {
      if (x.end <= slotStart && x.end > beforeEnd) beforeEnd = x.end;
      if (x.start >= slotEnd && x.start < afterStart) afterStart = x.start;
    }
    if (beforeEnd !== -Infinity) {
      const g = slotStart - beforeEnd;
      if (g > MAX_OK_GAP && g < MIN_FITTABLE_GAP) return json({ error: 'この時間はご案内できません。別の時間をお選びください。', code: 'slot_taken' }, 409);
    }
    if (afterStart !== Infinity) {
      const g = afterStart - slotEnd;
      if (g > MAX_OK_GAP && g < MIN_FITTABLE_GAP) return json({ error: 'この時間はご案内できません。別の時間をお選びください。', code: 'slot_taken' }, 409);
    }

    const assignedStaff = staffId ?? freeStaffIds[0];
    const isNominated = !!staffId;

    // --- 初回判定（電話/メールで過去予約・会員を照合）---
    let isFirstVisit = true;
    const { count: priorBookings } = await supabase
      .from('app_bookings').select('id', { count: 'exact', head: true })
      .eq('guest_phone_norm', phoneNorm).neq('status', 'cancelled');
    if ((priorBookings ?? 0) > 0) isFirstVisit = false;
    if (isFirstVisit) {
      // 会員(アプリ登録)の電話とも照合
      const { data: prof } = await supabase
        .from('profiles').select('id').eq('phone', guestPhone).limit(1).maybeSingle();
      if (prof) isFirstVisit = false;
    }

    // --- 前金（初回のみ）---
    //   通常: 前金=メニュー価格（初回対象メニューは3,980/5,980想定。自動案内はその金額のみ）。
    //   学割: 学生選択時はメニュー価格に対応する学割価格で請求（下記の対応表）。
    const isStudent = b.isStudent === true;
    const STUDENT_DEPOSIT: Record<number, number> = { 3980: 3500, 5980: 4400 };
    const depositRequired = isFirstVisit;
    const menuPrice = menu.price as number;
    let depositAmount: number | null = null;
    if (depositRequired) {
      depositAmount = isStudent ? (STUDENT_DEPOSIT[menuPrice] ?? menuPrice) : menuPrice;
    }
    const depositStatus = depositRequired ? 'pending' : 'none';

    // --- 前金リンク（Airペイの金額固定リンク）を【挿入前に】照合 ---
    //   リンクが有る初回客のみ「事前決済が完了するまで確定しない」仮押さえにする。
    //   リンクが無い初回客は従来どおりスタッフが個別連絡（自動失効はさせない）。
    //   学生=学割リンク(is_student)、通常=自動案内リンク(auto_match) を金額で照合。
    let paymentUrl: string | null = null;
    if (depositRequired && depositAmount) {
      let q = supabase
        .from('payment_links').select('url')
        .eq('is_active', true).eq('amount', depositAmount)
        .eq('is_subscription', false);   // 定期(サブスク)リンクは前金照合の対象外（毎月課金への誤登録防止）
      q = isStudent ? q.eq('is_student', true) : q.eq('auto_match', true);
      const { data: link } = await q
        .or(`store_id.eq.${storeId},store_id.is.null`)
        .order('store_id', { ascending: true, nullsFirst: false })
        .limit(1).maybeSingle();
      paymentUrl = link?.url ?? null;
    }
    // 仮押さえの失効期限: オンライン決済導線(リンク)がある時のみ設定（既定30分）。
    //   期限内に「お支払いが完了しました」が押されないと自動キャンセルで枠を解放する。
    const HOLD_MINUTES = 30;
    const holdExpiresAt = (depositRequired && paymentUrl)
      ? new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
      : null;

    // --- 挿入（EXCLUDE制約違反=二重予約は slot_taken に変換）---
    //   枠は status='confirmed' で物理確保しつつ、初回客は deposit_status='pending' +
    //   hold_expires_at で「事前決済待ちの仮押さえ」を表す（決済完了で paid＝正式確定）。
    const startsAt = new Date(base + slotStart * 60000).toISOString();
    const endsAt = new Date(base + slotEnd * 60000).toISOString();
    const { data: inserted, error: insErr } = await supabase
      .from('app_bookings')
      .insert({
        user_id: null,
        store_id: storeId,
        treatment_menu_id: menuId,
        staff_id: assignedStaff,
        is_staff_nominated: isNominated,
        starts_at: startsAt,
        ends_at: endsAt,
        buffer_before: BUFFER,
        buffer_after: BUFFER,
        status: 'confirmed',
        payment_method: 'onsite',
        created_by: 'client',
        source: 'web',
        guest_name: guestName,
        guest_phone: guestPhone,
        guest_phone_norm: phoneNorm,
        guest_email: guestEmail,
        customer_request: request,
        is_first_visit: isFirstVisit,
        deposit_status: depositStatus,
        deposit_amount: depositAmount,
        hold_expires_at: holdExpiresAt,
      })
      .select('id')
      .single();

    if (insErr) {
      // 23P01 = exclusion_violation（同一スタッフ枠の二重予約）
      if ((insErr as any).code === '23P01' || /exclud/i.test(insErr.message)) {
        return json({ error: 'この枠は埋まってしまいました。別の時間をお選びください。', code: 'slot_taken' }, 409);
      }
      console.error('insert error:', insErr.message);
      return json({ error: '予約の作成に失敗しました', code: 'invalid' }, 500);
    }

    // --- スタッフグループLINE通知（失敗しても予約は成立）---
    //   初回客の仮押さえ（事前決済待ち）は【まだ確定でない】ため、ここでは通知しない。
    //   決済完了の自己申告（confirm-web-booking）時に通知する。
    //   再来店客（前金不要）は即確定なので、従来どおりここで通知する。
    const heldForPayment = depositRequired && !!holdExpiresAt;
    if (!heldForPayment) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-staff-group`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: inserted!.id }),
        });
      } catch (e) {
        console.error('notify-staff-group failed:', (e as Error).message);
      }
    }

    return json({
      bookingId: inserted!.id,
      requiresDeposit: depositRequired,
      depositAmount,
      paymentUrl,
      holdExpiresAt,
    });
  } catch (e) {
    console.error('create-web-booking error:', (e as Error).message);
    return json({ error: 'Internal error', code: 'invalid' }, 500);
  }
});
