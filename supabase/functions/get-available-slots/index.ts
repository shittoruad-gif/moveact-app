// Supabase Edge Function: get-available-slots
// =====================================================
// 指定店舗・メニュー・日付の「予約可能な開始時刻」一覧を、スタッフ単位で計算して返す。
// アプリ・公開Web予約ページの両方から使える（認証不要・公開）。ホットペッパー式。
//
// 計算ロジック（サーバー側に一元化）:
//   1. 店舗の営業時間（store_business_hours）＋特定日の休業/短縮（store_closed_days）
//   2. ロスター（staff_stores）の各スタッフについて、予約(+前後15分バッファ)・
//      ブロック(staff_unavailability: 入れ替え/予定あり/休み)で埋まっていない枠を空きとみなす
//   3. 指名なし: 1人でも空きスタッフがいれば予約可。空き人数で ◎(>=3)○(2)△(1)× を判定
//      指名あり(staffId): そのスタッフが空いている枠のみ
//   4. すきま時間ブロック（隣接予約とのギャップが 30分超〜75分未満は案内しない）
//   5. 当日の過去時刻は除外
//
// 入力(GET or POST): { storeId, menuId, date(YYYY-MM-DD), staffId? }
// 出力: { slots: [{time, level, freeStaff, staffIds}], businessHours, isClosed }
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SLOT_INTERVAL = 15;       // 15分刻みで候補を生成
const BUFFER = 15;              // 前後バッファ（分）
const MAX_OK_GAP = 30;          // すきま時間ブロック: これ以下のギャップはOK
const MIN_FITTABLE_GAP = 75;    // これ以上ならOK（最短メニュー45分+両側バッファ）

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    let storeId = '', menuId = '', date = '', staffId = '';
    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      storeId = b.storeId; menuId = b.menuId; date = b.date; staffId = b.staffId ?? '';
    } else {
      const u = new URL(req.url);
      storeId = u.searchParams.get('storeId') ?? '';
      menuId = u.searchParams.get('menuId') ?? '';
      date = u.searchParams.get('date') ?? '';
      staffId = u.searchParams.get('staffId') ?? '';
    }
    if (!storeId || !menuId || !date) {
      return json({ error: 'storeId, menuId, date は必須です' }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 期限切れの仮押さえ（未払い）を解放してから空きを計算（pg_cron不在時の保険）
    await supabase.rpc('cancel_expired_deposit_holds').then(() => {}, () => {});

    // メニュー所要時間 + 指名スタッフ（required_staff_slug）+ 施術種別（スキル絞り込み用）
    const { data: menu } = await supabase
      .from('treatment_menus').select('duration_minutes, required_staff_slug, treatment_type').eq('id', menuId).single();
    if (!menu) return json({ error: 'メニューが見つかりません' }, 404);
    const duration = menu.duration_minutes as number;
    const treatmentType = (menu as { treatment_type?: string }).treatment_type ?? null;

    // 指名メニュー: required_staff_slug → profiles.booking_slug で担当スタッフを解決。
    // 解決できない場合は休業日と同じ形（空き無し）を返す（クラッシュさせない）。
    let requiredStaffId: string | null = null;
    if (menu.required_staff_slug) {
      const { data: reqProfiles } = await supabase
        .from('profiles').select('id, role').eq('booking_slug', menu.required_staff_slug);
      const resolved =
        (reqProfiles ?? []).find((p: { id: string; role: string }) => p.role === 'staff') ??
        (reqProfiles ?? [])[0];
      if (!resolved) {
        console.error(
          `get-available-slots: required_staff_slug '${menu.required_staff_slug}' を profiles.booking_slug で解決できません (menuId=${menuId})`,
        );
        return json({ slots: [], isClosed: true });
      }
      requiredStaffId = resolved.id as string;
    }

    // 曜日（TZ非依存のカレンダー曜日で判定）
    const [yy, mm, dd] = date.split('-').map(Number);
    const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();

    // 特定日の休業/短縮を優先
    const { data: closed } = await supabase
      .from('store_closed_days').select('*').eq('store_id', storeId).eq('date', date).maybeSingle();

    let openMin: number | null = null, closeMin: number | null = null;
    if (closed) {
      if (closed.is_closed) return json({ slots: [], isClosed: true });
      if (closed.open_time && closed.close_time) {
        openMin = toMin(closed.open_time); closeMin = toMin(closed.close_time);
      }
    }
    if (openMin === null) {
      const { data: bh } = await supabase
        .from('store_business_hours').select('*').eq('store_id', storeId).eq('day_of_week', dow).maybeSingle();
      if (!bh || bh.is_closed || !bh.open_time || !bh.close_time) {
        return json({ slots: [], isClosed: true });
      }
      openMin = toMin(bh.open_time); closeMin = toMin(bh.close_time);
    }

    // ネット予約の受付締切（開始N分前まで受付。店舗設定で変更・0=直前まで）
    // 取得エラー時に黙って0（締切なし）へ倒すと設定が消えたのと同じになるため、エラーは返す（フェイルクローズ）
    const { data: storeRow, error: storeErr } = await supabase
      .from('stores').select('booking_lead_minutes').eq('id', storeId).maybeSingle();
    if (storeErr) {
      console.error('get-available-slots: stores取得失敗:', storeErr.message);
      return json({ error: '空き状況の取得に失敗しました。時間をおいてお試しください。' }, 500);
    }
    const leadMin = (storeRow as { booking_lead_minutes?: number | null } | null)?.booking_lead_minutes ?? 0;

    // ロスター（この店舗で稼働するスタッフ）
    const { data: roster } = await supabase
      .from('staff_stores').select('staff_id').eq('store_id', storeId).eq('is_active', true);
    let staffIds: string[] = (roster ?? []).map((r: { staff_id: string }) => r.staff_id);
    // ロスター未設定はデータ不備として扱う。
    // 旧フォールバック（全スタッフ/管理者を復活）は他店舗スタッフまで空き扱いになる危険があるため廃止し、
    // 休業日と同じ形（空き無し）を返す。
    if (staffIds.length === 0) {
      console.error(`get-available-slots: staff_stores にロスターがありません (storeId=${storeId})`);
      return json({ slots: [], isClosed: true });
    }

    // --- スキル(施術種別)フィルタ ---
    // メニューの treatment_type を担当できるスタッフだけを候補に残す。
    // これで「おまかせ」でも「指名」でも施術不可のスタッフが空き/割当対象にならない。
    // ※指名メニュー(required_staff_slug)はその担当が施術可能な前提のため、下で staffIds を上書きする。
    if (treatmentType && !requiredStaffId) {
      const { data: skillRows } = await supabase
        .from('staff_skills').select('staff_id').eq('treatment_type', treatmentType);
      const skilled = new Set((skillRows ?? []).map((r: { staff_id: string }) => r.staff_id));
      staffIds = staffIds.filter((id) => skilled.has(id));
      // この店舗にこの施術を担当できるスタッフがいない ＝ 空き無し（店は開いているので isClosed にはしない）
      if (staffIds.length === 0) return json({ slots: [], isClosed: false });
    }

    // 指名メニュー: クライアントの staffId に関わらず、解決済みスタッフのみで空き計算（強制指名）
    if (requiredStaffId) {
      staffId = requiredStaffId;
      staffIds = [requiredStaffId];
    } else if (staffId) {
      // 指名ありなら対象を1人に絞る
      staffIds = staffIds.filter((id) => id === staffId);
      if (staffIds.length === 0) return json({ slots: [], isClosed: false });
    }

    // 当日の予約・ブロックを取得（スタッフ別に振り分ける）
    const dayStart = `${date}T00:00:00+09:00`;
    const dayEnd = `${date}T23:59:59+09:00`;
    const [{ data: bookings }, { data: unavail }, { data: airEvents }, { data: weekly }, { data: groupLessons }] = await Promise.all([
      supabase.from('app_bookings')
        .select('staff_id, starts_at, ends_at, buffer_before, buffer_after')
        .eq('store_id', storeId)
        .neq('status', 'cancelled')
        .gte('starts_at', dayStart).lte('starts_at', dayEnd),
      supabase.from('staff_unavailability')
        .select('staff_id, starts_at, ends_at, block_type')
        .eq('store_id', storeId)
        .lte('starts_at', dayEnd).gte('ends_at', dayStart),
      // Airリザーブ外部予約（同期済み）: 空きをブロックする
      // summary は「予定」「入れ替え時間」等の内部ブロック判別に使う（店舗占有から除外）
      // 取得条件は「この日に重なる」（create-web-booking と同一）。開始日だけで絞ると
      // 前日から続く・日をまたぐブロックが空き表示では無視され、予約確定時に初めて409になる。
      supabase.from('airreserve_events')
        .select('staff_id, starts_at, ends_at, summary')
        .eq('store_id', storeId)
        .lte('starts_at', dayEnd).gte('ends_at', dayStart),
      // 週間勤務スケジュール（勤務曜日/時間帯ゲート用。店舗の全行を取得して有効判定）
      supabase.from('staff_weekly_schedule')
        .select('staff_id, day_of_week, start_time, end_time')
        .eq('store_id', storeId),
      // グループレッスン: 開催中は店舗全体を占有（キャパ1のため個別予約を受けない）
      supabase.from('group_lessons')
        .select('starts_at, ends_at')
        .eq('store_id', storeId)
        .eq('is_cancelled', false)
        .lte('starts_at', dayEnd).gte('ends_at', dayStart),
    ]);

    const base = new Date(`${date}T00:00:00+09:00`).getTime();
    const jstMin = (iso: string) => Math.round((new Date(iso).getTime() - base) / 60000);

    interface Busy { start: number; end: number; }
    // スタッフ別の占有区間
    const busyByStaff = new Map<string, Busy[]>();
    const ensure = (id: string) => {
      if (!busyByStaff.has(id)) busyByStaff.set(id, []);
      return busyByStaff.get(id)!;
    };

    // 勤務曜日/時間帯ゲート: staff_weekly_schedule に店舗の行が1行でもあれば有効化。
    // 有効時: その曜日に行が無いスタッフは候補から除外し、行があるスタッフは勤務窓
    // [start_time, end_time] の外側を busy 区間として busyByStaff に載せる
    // （既存のバッファ付き重なり判定にそのまま乗る）。店舗に1行も無ければ従来動作。
    // ※ 番兵区間は realBusyByStaff には入れない — 勤務境界は実予約ではないため、
    //   すきま時間ブロック判定がシフト境界を予約と誤認して枠を落とすのを防ぐ。
    // ※ 重なり判定は bufStart/bufEnd（±BUFFER）で行われるため、勤務開始ちょうど・
    //   終了ちょうどの枠が潰れないよう番兵を BUFFER 分だけ外側へずらす。
    if ((weekly ?? []).length > 0) {
      const todayWindow = new Map<string, { start: number; end: number }>();
      for (const w of (weekly ?? [])) {
        if (w.day_of_week === dow) {
          todayWindow.set(w.staff_id, { start: toMin(w.start_time), end: toMin(w.end_time) });
        }
      }
      staffIds = staffIds.filter((id) => todayWindow.has(id));
      if (staffIds.length === 0) return json({ slots: [], isClosed: false });
      for (const id of staffIds) {
        const w = todayWindow.get(id)!;
        ensure(id).push(
          { start: -100000, end: w.start - BUFFER },
          { start: w.end + BUFFER, end: 100000 },
        );
      }
    }

    // 予約: staff_id があればそのスタッフのみ占有。staff_id なし(指名なし予約)は
    // 「誰か1人」を占有するが特定できないため、空きスタッフを1人消費する扱いにする。
    const unassignedBookings: Busy[] = [];
    for (const b of (bookings ?? [])) {
      const iv = {
        start: jstMin(b.starts_at) - (b.buffer_before ?? BUFFER),
        end: jstMin(b.ends_at) + (b.buffer_after ?? BUFFER),
      };
      if (b.staff_id && staffIds.includes(b.staff_id)) ensure(b.staff_id).push(iv);
      else if (!b.staff_id) unassignedBookings.push(iv);
    }
    // ブロック（入れ替え/予定あり/休み）は当該スタッフのみ
    for (const u of (unavail ?? [])) {
      if (u.staff_id && staffIds.includes(u.staff_id)) {
        ensure(u.staff_id).push({ start: jstMin(u.starts_at), end: jstMin(u.ends_at) });
      }
    }

    // すきま時間ブロック判定用（実予約・バッファ無し）。
    // スタッフ別に持ち、指名なしで割当不能な分だけ全スタッフ共通として扱う。
    const realBusyByStaff = new Map<string, Busy[]>();
    const ensureReal = (id: string) => {
      if (!realBusyByStaff.has(id)) realBusyByStaff.set(id, []);
      return realBusyByStaff.get(id)!;
    };
    const unassignedRealBusy: Busy[] = [];
    for (const b of (bookings ?? [])) {
      const iv = { start: jstMin(b.starts_at), end: jstMin(b.ends_at) };
      if (b.staff_id && staffIds.includes(b.staff_id)) ensureReal(b.staff_id).push(iv);
      else if (!b.staff_id) unassignedRealBusy.push(iv);
    }

    // Airリザーブ外部予約: app_bookings と同一構造にマージ。
    // staff_id 指定かつ対象スタッフなら当該スタッフを占有（同一スタッフの app_booking と同扱い）。
    // 併せて未バッファ区間をすきま時間判定用に加える。
    for (const ev of (airEvents ?? [])) {
      const start = jstMin(ev.starts_at), end = jstMin(ev.ends_at);
      const buffered = { start: start - BUFFER, end: end + BUFFER };
      const raw = { start, end };
      if (ev.staff_id && staffIds.includes(ev.staff_id)) {
        ensure(ev.staff_id).push(buffered);
        ensureReal(ev.staff_id).push(raw);
      } else if (!ev.staff_id) {
        unassignedBookings.push(buffered);
        unassignedRealBusy.push(raw);
      }
    }

    // --- 店舗キャパシティ = 同時1件（2026-07-15 オーナー決定）---
    //   店舗内の「お客様のご予約」が1件でも入っている時間帯は、担当スタッフに
    //   関わらず店舗全体を占有済みとして枠を出さない。
    //   対象: app_bookings 全件（候補外スタッフ・未割当含む）
    //       + AirReserve顧客予約
    //       + 「入れ替え時間」ブロック（AirReserve取込・管理画面登録の両方。
    //         店の入れ替え作業中は他スタッフの予約も受けない。区間そのものが
    //         バッファのため追加バッファは付けない）
    //       + グループレッスン開催枠
    //   ※「予定」（外出・予定あり）は当該スタッフのみ占有＝他スタッフの予約と重なってOK。
    //   ※30分以上の「入れ替え時間」は実態がスタッフ個人の不在のため「予定」と同じ
    //     スタッフのみ扱い（オーナー指示 2026-07-15。migration 113でデータ側も変換済み）。
    const STAFF_ONLY_AIR_BLOCKS = ['予定'];
    const AIR_CHANGEOVER = '入れ替え時間';
    const CHANGEOVER_STORE_BLOCK_UNDER_MIN = 30;   // これ未満の入れ替えのみ店舗全体を塞ぐ
    const storeBusy: Busy[] = [];
    for (const b of (bookings ?? [])) {
      storeBusy.push({
        start: jstMin(b.starts_at) - (b.buffer_before ?? BUFFER),
        end: jstMin(b.ends_at) + (b.buffer_after ?? BUFFER),
      });
    }
    for (const ev of (airEvents ?? [])) {
      const sm = ((ev as { summary?: string | null }).summary ?? '').trim();
      if (STAFF_ONLY_AIR_BLOCKS.includes(sm)) continue;
      const s = jstMin(ev.starts_at), e = jstMin(ev.ends_at);
      if (sm === AIR_CHANGEOVER) {
        if (e - s < CHANGEOVER_STORE_BLOCK_UNDER_MIN) storeBusy.push({ start: s, end: e });   // 追加バッファなし
        // 30分以上はスタッフ占有のみ（既存のスタッフ別処理が引き続き担当）
      } else {
        storeBusy.push({ start: s - BUFFER, end: e + BUFFER });
      }
    }
    // 管理画面から登録された「入れ替え時間」(block_type='changeover')も同じ30分ルール
    for (const u of (unavail ?? [])) {
      if ((u as { block_type?: string | null }).block_type === 'changeover') {
        const s = jstMin(u.starts_at), e = jstMin(u.ends_at);
        if (e - s < CHANGEOVER_STORE_BLOCK_UNDER_MIN) storeBusy.push({ start: s, end: e });
      }
    }
    for (const gl of (groupLessons ?? [])) {
      storeBusy.push({ start: jstMin(gl.starts_at) - BUFFER, end: jstMin(gl.ends_at) + BUFFER });
    }

    // 受付締切: 開始時刻が「今 + leadMin分」以前の枠は出さない。
    // 絶対時刻（epoch）で比較するため、締切が長い場合は翌日以降の枠にも正しく効く。
    const cutoffEpoch = Date.now() + leadMin * 60000;
    const totalStaff = staffIds.length;

    const slots: { time: string; level: string; freeStaff: number }[] = [];
    for (let s = openMin!; s + duration <= closeMin!; s += SLOT_INTERVAL) {
      const slotStart = s, slotEnd = s + duration;
      const bufStart = slotStart - BUFFER, bufEnd = slotEnd + BUFFER;

      // 過去枠・受付締切前の枠
      if (base + slotStart * 60000 <= cutoffEpoch) continue;

      // 店舗キャパ=1: 既にお客様のご予約がある時間帯は担当を問わず不可
      if (storeBusy.some((b) => bufStart < b.end && bufEnd > b.start)) continue;

      // 各スタッフが空いているか判定
      let freeStaff = 0;
      const freeStaffIds: string[] = [];
      for (const id of staffIds) {
        const intervals = busyByStaff.get(id) ?? [];
        const occupied = intervals.some((b) => bufStart < b.end && bufEnd > b.start);
        if (!occupied) { freeStaff++; freeStaffIds.push(id); }
      }
      // 指名なし予約（staff未割当）は空きスタッフを消費（指名ありでは消費しない）
      const overlappingUnassigned = staffId
        ? 0
        : unassignedBookings.filter((b) => bufStart < b.end && bufEnd > b.start).length;
      freeStaff = Math.max(0, freeStaff - overlappingUnassigned);

      if (freeStaff <= 0) continue; // 空きスタッフなし

      // すきま時間ブロック: 空きスタッフ「本人の」実予約との隣接ギャップが中途半端なら不可。
      // 1人でも中途半端なギャップのない空きスタッフがいれば枠を残す（店舗全体では落とさない）。
      const isAwkwardFor = (id: string): boolean => {
        let beforeEnd = -Infinity, afterStart = Infinity;
        const own = realBusyByStaff.get(id) ?? [];
        for (const b of [...own, ...unassignedRealBusy]) {
          if (b.end <= slotStart && b.end > beforeEnd) beforeEnd = b.end;
          if (b.start >= slotEnd && b.start < afterStart) afterStart = b.start;
        }
        if (beforeEnd !== -Infinity) {
          const g = slotStart - beforeEnd;
          if (g > MAX_OK_GAP && g < MIN_FITTABLE_GAP) return true;
        }
        if (afterStart !== Infinity) {
          const g = afterStart - slotEnd;
          if (g > MAX_OK_GAP && g < MIN_FITTABLE_GAP) return true;
        }
        return false;
      };
      const anyStaffWithoutAwkwardGap = freeStaffIds.some((id) => !isAwkwardFor(id));
      if (!anyStaffWithoutAwkwardGap) continue;

      // 店舗キャパ=1のため「空きスタッフ数=残り枠数」の概念がなくなった。
      // 空いている枠は一律「○ 空きあり」で表現する（◎/△の段階表示は廃止）。
      const level = '○';

      slots.push({ time: toHHMM(slotStart), level, freeStaff });
    }

    return json({
      slots,
      isClosed: false,
      businessHours: { open: toHHMM(openMin!), close: toHHMM(closeMin!) },
      durationMinutes: duration,
      totalStaff,
    });
  } catch (e) {
    console.error('get-available-slots error:', (e as Error).message);
    return json({ error: 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
