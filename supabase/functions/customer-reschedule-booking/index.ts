// Supabase Edge Function: customer-reschedule-booking
// =====================================================
// 予約の日時変更（リスケジュール）の正規エンドポイント。
// RNアプリの RescheduleScreen から supabase.functions.invoke で呼ぶ
// （verify_jwt=true のデフォルト運用。config.toml への追記は不要）。
// 従来はクライアントが app_bookings を無検証で直接 UPDATE していたため、
// サーバー側で本人確認と空き枠の再検証を行うこの関数へ一本化する。
//
// 入力(POST): { bookingId, date: 'YYYY-MM-DD', time: 'HH:MM' }（JST）
// 処理:
//   1. JWTのユーザーが当該予約の user_id 本人であることを service role で検証
//      （スタッフ画面 StaffBookingListScreen からも同じ画面を使うため、
//        staff / admin ロールは他人の予約・ゲスト予約も変更可）
//   2. status チェック（cancelled / completed / no_show / 開始済みは変更不可）
//   3. 店舗・メニュー・担当スタッフはそのままに、新日時で再検証:
//      過去日時拒否・営業時間/店舗休業チェック・staff_weekly_schedule 窓チェック・
//      同スタッフの app_bookings / staff_unavailability / airreserve_events との
//      バッファ込み重複チェック（create-web-booking と同一ロジック。自予約は除外）
//   4. OKなら starts_at / ends_at を UPDATE
//      （EXCLUDE制約違反 23P01 は slot_taken 409 に変換）
//   5. スタッフグループLINEへ変更通知（notify-staff-group / service role。
//      eventType='rescheduled' + oldStartsAt を渡し
//      「【変更】○○様 ○/○ HH:MM→○/○ HH:MM メニュー/担当」を送る）
//   6. 顧客本人へのLINE通知（send-line-message / booking_rescheduled / service role。
//      send-line-message は顧客JWTでは呼べないため、ここから内部呼び出しする）
// 出力: { ok: true, unchanged? } | { ok: false, code, message } | { error, code? }
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { verifyAuth, AuthError, corsHeaders, json, safeErrorMessage } from '../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BUFFER = 15; // 前後バッファ（分）: create-web-booking と同一

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  try {
    const { userId, serviceClient: supabase } = await verifyAuth(req);

    const body = await req.json().catch(() => ({}));
    const bookingId = (body.bookingId ?? '').toString();
    const date = (body.date ?? '').toString();
    const time = (body.time ?? '').toString();

    // --- 入力検証 ---
    if (!bookingId) return json({ error: 'bookingId は必須です', code: 'invalid' }, 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return json({ error: '日時の形式が正しくありません', code: 'invalid' }, 400);
    }
    const [yy, mm, dd] = date.split('-').map(Number);
    // 不正日付(例:2026-02-31)を排除（UTC構築で往復検証）
    const probe = new Date(Date.UTC(yy, mm - 1, dd));
    if (probe.getUTCFullYear() !== yy || probe.getUTCMonth() !== mm - 1 || probe.getUTCDate() !== dd) {
      return json({ error: '日付が正しくありません', code: 'invalid' }, 400);
    }
    const [thh, tmm] = time.split(':').map(Number);
    if (thh < 0 || thh > 23 || tmm < 0 || tmm > 59) {
      return json({ error: '時刻が正しくありません', code: 'invalid' }, 400);
    }

    // --- 対象予約の取得 ---
    const { data: booking } = await supabase
      .from('app_bookings')
      .select('id, user_id, store_id, staff_id, treatment_menu_id, starts_at, ends_at, status, buffer_before, buffer_after, treatment_menu:treatment_menus(duration_minutes, treatment_type)')
      .eq('id', bookingId)
      .maybeSingle();
    if (!booking) return json({ error: '予約が見つかりません', code: 'not_found' }, 404);

    // --- 本人確認: JWTのユーザー = 予約のuser_id（staff/adminは他人の予約も可）---
    if (booking.user_id !== userId) {
      const { data: prof } = await supabase
        .from('profiles').select('role').eq('id', userId).maybeSingle();
      if (!prof || !['staff', 'admin'].includes(prof.role)) {
        return json({ error: 'この予約を操作する権限がありません', code: 'forbidden' }, 403);
      }
    }

    // --- ステータス確認（200で理由を返しアプリ側で案内）---
    if (booking.status === 'cancelled') {
      return json({ ok: false, code: 'cancelled', message: 'この予約はキャンセル済みのため変更できません。お手数ですが、あらためてご予約をお取りください。' });
    }
    if (booking.status === 'completed' || booking.status === 'no_show') {
      return json({ ok: false, code: booking.status, message: 'この予約はすでに施術が完了しているため変更できません。ご不明な点は店舗までお問い合わせください。' });
    }
    // 開始時刻を過ぎた予約の付け替えは不可（当日キャンセル規約の迂回防止）
    if (new Date(booking.starts_at).getTime() <= Date.now()) {
      return json({ ok: false, code: 'started', message: '開始時刻を過ぎたご予約は変更できません。お手数ですが、店舗までご連絡ください。' });
    }

    // 施術時間: メニューの現行 duration を優先し、無ければ既存予約の長さを維持
    const menuDur = (booking as any).treatment_menu?.duration_minutes as number | undefined;
    const currentSpan = Math.round((new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 60000);
    const duration = menuDur ?? (currentSpan > 0 ? currentSpan : 60);

    // --- 営業時間 / 休業日 ---
    // 曜日はサーバーローカルTZ(Supabase EdgeはUTC)に依存させないため、
    // 解析済みの yy/mm/dd から UTC で曜日を求める（create-web-booking と同一）。
    const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
    const storeId = booking.store_id as string;
    const { data: closed } = await supabase
      .from('store_closed_days').select('*').eq('store_id', storeId).eq('date', date).maybeSingle();
    let openMin: number | null = null, closeMin: number | null = null;
    if (closed) {
      if (closed.is_closed) return json({ error: 'この日は休業日です。別の日をお選びください。', code: 'closed' }, 409);
      if (closed.open_time && closed.close_time) { openMin = toMin(closed.open_time); closeMin = toMin(closed.close_time); }
    }
    if (openMin === null) {
      const { data: bh } = await supabase
        .from('store_business_hours').select('*').eq('store_id', storeId).eq('day_of_week', dow).maybeSingle();
      if (!bh || bh.is_closed || !bh.open_time || !bh.close_time) {
        return json({ error: 'この日は休業日です。別の日をお選びください。', code: 'closed' }, 409);
      }
      openMin = toMin(bh.open_time); closeMin = toMin(bh.close_time);
    }

    const slotStart = toMin(time);
    const slotEnd = slotStart + duration;
    if (slotStart < openMin! || slotEnd > closeMin!) {
      return json({ error: 'この時間は営業時間外です。別の時間をお選びください。', code: 'closed' }, 409);
    }

    // --- 過去日時の拒否（JSTの絶対時刻で判定・TZ非依存）---
    const base = new Date(`${date}T00:00:00+09:00`).getTime();
    const startEpoch = base + slotStart * 60000;
    if (startEpoch <= Date.now()) {
      return json({ error: '過去の日時には変更できません', code: 'invalid' }, 400);
    }
    // 受付締切（stores.booking_lead_minutes）: 新規予約と同じく、開始N分前を過ぎた枠へは変更不可。
    // これが無いと、新規予約では弾かれる直前枠へ「変更」で滑り込めてしまう。
    {
      const { data: leadRow, error: leadErr } = await supabase
        .from('stores').select('booking_lead_minutes').eq('id', storeId).maybeSingle();
      if (leadErr) {
        return json({ error: '受付設定の確認に失敗しました。時間をおいてお試しください。', code: 'invalid' }, 500);
      }
      const leadMin = (leadRow as { booking_lead_minutes?: number | null } | null)?.booking_lead_minutes ?? 0;
      if (leadMin > 0 && startEpoch <= Date.now() + leadMin * 60000) {
        const h = Math.floor(leadMin / 60), m = leadMin % 60;
        const leadLabel = h === 0 ? `${m}分` : m === 0 ? `${h}時間` : `${h}時間${m}分`;
        return json({
          error: `ご来店の${leadLabel}前を過ぎているため、この時間へは変更できません。お急ぎの場合はお電話でお問い合わせください。`,
          code: 'invalid',
        }, 400);
      }
    }
    // 受付は本日〜180日先まで（JSTの今日0時起点。create-web-booking と同一）
    const jstNow = new Date(Date.now() + 9 * 3600_000);
    const jstTodayMidnight = Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate()) - 9 * 3600_000;
    if (base - jstTodayMidnight > 180 * 86_400_000) {
      return json({ error: '変更できる期間を超えています', code: 'invalid' }, 400);
    }

    // 変更なし（同一日時）は何もせず成功（通知の重複送信も防ぐ）
    if (startEpoch === new Date(booking.starts_at).getTime() && duration === currentSpan) {
      return json({ ok: true, unchanged: true });
    }

    // --- 候補スタッフ ---
    //   担当が決まっている予約はそのスタッフ固定。
    //   担当未定（おまかせ）の予約はロスターの空き人数で判定（create-web-booking と同一）。
    let staffIds: string[];
    const fixedStaff = (booking.staff_id as string | null) ?? null;
    if (fixedStaff) {
      staffIds = [fixedStaff];
    } else {
      const { data: roster } = await supabase
        .from('staff_stores').select('staff_id').eq('store_id', storeId).eq('is_active', true);
      staffIds = (roster ?? []).map((r: { staff_id: string }) => r.staff_id);
      if (staffIds.length === 0) {
        return json({ error: 'この枠は埋まってしまいました。別の時間をお選びください。', code: 'slot_taken' }, 409);
      }
      // スキル(施術種別)フィルタ: このメニューを担当できるスタッフだけに絞る（create-web-booking と同一方針）
      const tt = (booking as { treatment_menu?: { treatment_type?: string } }).treatment_menu?.treatment_type;
      if (tt) {
        const { data: skillRows } = await supabase
          .from('staff_skills').select('staff_id').eq('treatment_type', tt);
        const skilled = new Set((skillRows ?? []).map((r: { staff_id: string }) => r.staff_id));
        staffIds = staffIds.filter((id) => skilled.has(id));
        if (staffIds.length === 0) {
          return json({ error: 'この枠は埋まってしまいました。別の時間をお選びください。', code: 'slot_taken' }, 409);
        }
      }
    }

    // --- 当日の予約・ブロック＋週間勤務スケジュール（create-web-booking と同一）---
    const dayStart = `${date}T00:00:00+09:00`;
    const dayEnd = `${date}T23:59:59+09:00`;
    const [{ data: bookings }, { data: unavail }, { data: airEvents }, { data: weeklyRows }] = await Promise.all([
      supabase.from('app_bookings')
        .select('id, staff_id, starts_at, ends_at, buffer_before, buffer_after')
        .eq('store_id', storeId).neq('status', 'cancelled')
        .gte('starts_at', dayStart).lte('starts_at', dayEnd),
      supabase.from('staff_unavailability')
        .select('staff_id, starts_at, ends_at')
        .eq('store_id', storeId)
        .lte('starts_at', dayEnd).gte('ends_at', dayStart),
      supabase.from('airreserve_events')
        .select('staff_id, starts_at, ends_at')
        .eq('store_id', storeId)
        .lte('starts_at', dayEnd).gte('ends_at', dayStart),
      supabase.from('staff_weekly_schedule')
        .select('staff_id, day_of_week, start_time, end_time')
        .eq('store_id', storeId),
    ]);

    // 自予約の新しいバッファ（既存値を維持。UPDATE後の buf_starts_at/buf_ends_at と一致）
    const bufBefore = (booking.buffer_before as number | null) ?? BUFFER;
    const bufAfter = (booking.buffer_after as number | null) ?? BUFFER;

    // --- 勤務スケジュールゲート ---
    //   店舗に行が1件でもあれば有効化。当該曜日に行が無いスタッフは候補から除外。
    const scheduleActive = (weeklyRows ?? []).length > 0;
    const workWindow = new Map<string, { start: number; end: number }>();
    if (scheduleActive) {
      for (const w of (weeklyRows ?? [])) {
        if (w.day_of_week === dow) {
          workWindow.set(w.staff_id as string, { start: toMin(w.start_time), end: toMin(w.end_time) });
        }
      }
      staffIds = staffIds.filter((id) => workWindow.has(id));
      if (staffIds.length === 0) {
        // 担当スタッフがその曜日に勤務しない／その曜日の出勤者がいない
        return json({ error: 'この時間はご案内できません。別の時間をお選びください。', code: 'slot_taken' }, 409);
      }
    }

    const jstMin = (iso: string) => Math.round((new Date(iso).getTime() - base) / 60000);
    const bufStart = slotStart - bufBefore, bufEnd = slotEnd + bufAfter;

    interface Busy { start: number; end: number; }
    const busyByStaff = new Map<string, Busy[]>();
    const ensure = (id: string) => { if (!busyByStaff.has(id)) busyByStaff.set(id, []); return busyByStaff.get(id)!; };
    const unassigned: Busy[] = [];
    for (const bk of (bookings ?? [])) {
      if (bk.id === bookingId) continue; // 自分自身の旧枠は空きとして扱う
      const iv = { start: jstMin(bk.starts_at) - (bk.buffer_before ?? BUFFER), end: jstMin(bk.ends_at) + (bk.buffer_after ?? BUFFER) };
      if (bk.staff_id && staffIds.includes(bk.staff_id)) ensure(bk.staff_id).push(iv);
      else if (!bk.staff_id) unassigned.push(iv);
    }
    for (const u of (unavail ?? [])) {
      if (u.staff_id && staffIds.includes(u.staff_id)) ensure(u.staff_id).push({ start: jstMin(u.starts_at), end: jstMin(u.ends_at) });
    }
    for (const ev of (airEvents ?? [])) {
      const s = jstMin(ev.starts_at), e = jstMin(ev.ends_at);
      if (ev.staff_id && staffIds.includes(ev.staff_id)) ensure(ev.staff_id).push({ start: s - BUFFER, end: e + BUFFER });
      else if (!ev.staff_id) unassigned.push({ start: s - BUFFER, end: e + BUFFER });
    }
    // 勤務時間窓の外側を busy 区間として合算（番兵はバッファ分外側へシフト。
    // シフト先頭/末尾ちょうどの枠が409にならないようにする＝create-web-booking と同一）
    if (scheduleActive) {
      for (const id of staffIds) {
        const w = workWindow.get(id)!;
        ensure(id).push({ start: -100000, end: w.start - bufBefore });
        ensure(id).push({ start: w.end + bufAfter, end: 100000 });
      }
    }

    // --- 空き判定 ---
    const freeStaffIds = staffIds.filter((id) => {
      const intervals = busyByStaff.get(id) ?? [];
      return !intervals.some((x) => bufStart < x.end && bufEnd > x.start);
    });
    // 担当固定なら未割当予約は無関係。担当未定なら未割当予約が空きを消費。
    const overlappingUnassigned = fixedStaff ? 0 : unassigned.filter((x) => bufStart < x.end && bufEnd > x.start).length;
    const effectiveFree = freeStaffIds.length - overlappingUnassigned;
    if (effectiveFree <= 0 || freeStaffIds.length === 0) {
      return json({ error: 'この枠は埋まってしまいました。別の時間をお選びください。', code: 'slot_taken' }, 409);
    }

    // --- UPDATE（EXCLUDE制約違反=二重予約は slot_taken に変換）---
    const startsAt = new Date(base + slotStart * 60000).toISOString();
    const endsAt = new Date(base + slotEnd * 60000).toISOString();
    const { data: updated, error: updErr } = await supabase
      .from('app_bookings')
      .update({ starts_at: startsAt, ends_at: endsAt, updated_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('status', booking.status) // キャンセル等との競合による二重処理を防止
      .select('id');
    if (updErr) {
      if ((updErr as any).code === '23P01' || /exclud/i.test(updErr.message)) {
        return json({ error: 'この枠は埋まってしまいました。別の時間をお選びください。', code: 'slot_taken' }, 409);
      }
      console.error('reschedule update failed:', updErr.message);
      return json({ error: '変更の処理に失敗しました' }, 500);
    }
    if (!updated || updated.length === 0) {
      // 検証中に予約の状態が変わった（同時キャンセル等）。通知は送らずやり直しを案内。
      return json({ ok: false, code: 'conflict', message: 'ご予約の状態が変わったため変更できませんでした。お手数ですが、画面を更新してもう一度お試しください。' });
    }

    // --- スタッフグループLINEへ変更通知（service role / 失敗しても変更は成立）---
    //   notify-staff-group 側で oldStartsAt を使い
    //   「【変更】○○様 ○/○ HH:MM→○/○ HH:MM メニュー/担当」を整形して送る。
    try {
      await fetch(`${supabaseUrl}/functions/v1/notify-staff-group`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, eventType: 'rescheduled', oldStartsAt: booking.starts_at }),
      });
    } catch (e) {
      console.error('notify-staff-group failed:', (e as Error).message);
    }

    // --- 顧客本人へのLINE通知（LINE連携済みの場合のみ送信される / 非致命）---
    //   send-line-message は staff/service role 限定のため、ここから内部呼び出しする。
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-line-message`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: bookingId, message_type: 'booking_rescheduled' }),
      });
    } catch (e) {
      console.error('send-line-message failed:', (e as Error).message);
    }

    return json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, e.status);
    return json({ error: safeErrorMessage(e) }, 500);
  }
});
