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

    // メニュー所要時間
    const { data: menu } = await supabase
      .from('treatment_menus').select('duration_minutes').eq('id', menuId).single();
    if (!menu) return json({ error: 'メニューが見つかりません' }, 404);
    const duration = menu.duration_minutes as number;

    // 曜日
    const dow = new Date(`${date}T00:00:00+09:00`).getDay();

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

    // ロスター（この店舗で稼働するスタッフ）
    const { data: roster } = await supabase
      .from('staff_stores').select('staff_id').eq('store_id', storeId).eq('is_active', true);
    let staffIds: string[] = (roster ?? []).map((r: { staff_id: string }) => r.staff_id);
    // ロスター未設定なら全スタッフ/管理者をフォールバック
    if (staffIds.length === 0) {
      const { data: allStaff } = await supabase
        .from('profiles').select('id').in('role', ['staff', 'admin']);
      staffIds = (allStaff ?? []).map((r: { id: string }) => r.id);
    }
    // 指名ありなら対象を1人に絞る
    if (staffId) {
      staffIds = staffIds.filter((id) => id === staffId);
      if (staffIds.length === 0) return json({ slots: [], isClosed: false });
    }

    // 当日の予約・ブロックを取得（スタッフ別に振り分ける）
    const dayStart = `${date}T00:00:00+09:00`;
    const dayEnd = `${date}T23:59:59+09:00`;
    const [{ data: bookings }, { data: unavail }] = await Promise.all([
      supabase.from('app_bookings')
        .select('staff_id, starts_at, ends_at, buffer_before, buffer_after')
        .eq('store_id', storeId)
        .neq('status', 'cancelled')
        .gte('starts_at', dayStart).lte('starts_at', dayEnd),
      supabase.from('staff_unavailability')
        .select('staff_id, starts_at, ends_at, block_type')
        .eq('store_id', storeId)
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
    // 予約: staff_id があればそのスタッフのみ占有。staff_id なし(指名なし予約)は
    // 「誰か1人」を占有するが特定できないため、空きスタッフを1人消費する扱いにする。
    const unassignedBookings: Busy[] = [];
    for (const b of (bookings ?? [])) {
      const iv = {
        start: jstMin(b.starts_at) - (b.buffer_before ?? BUFFER),
        end: jstMin(b.ends_at) + (b.buffer_after ?? BUFFER),
      };
      if (b.staff_id && staffIds.includes(b.staff_id)) ensure(b.staff_id).push(iv);
      else unassignedBookings.push(iv);
    }
    // ブロック（入れ替え/予定あり/休み）は当該スタッフのみ
    for (const u of (unavail ?? [])) {
      if (u.staff_id && staffIds.includes(u.staff_id)) {
        ensure(u.staff_id).push({ start: jstMin(u.starts_at), end: jstMin(u.ends_at) });
      }
    }

    // すきま時間ブロック判定用（実予約・バッファ無し、全スタッフ合算）
    const realBusy = (bookings ?? []).map((b) => ({ start: jstMin(b.starts_at), end: jstMin(b.ends_at) }));

    const nowJst = Math.round((Date.now() - base) / 60000);
    const totalStaff = staffIds.length;

    const slots: { time: string; level: string; freeStaff: number }[] = [];
    for (let s = openMin!; s + duration <= closeMin!; s += SLOT_INTERVAL) {
      const slotStart = s, slotEnd = s + duration;
      const bufStart = slotStart - BUFFER, bufEnd = slotEnd + BUFFER;

      // 過去枠（当日のみ）
      if (nowJst >= 0 && nowJst <= 1440 && slotStart <= nowJst) continue;

      // 各スタッフが空いているか判定
      let freeStaff = 0;
      for (const id of staffIds) {
        const intervals = busyByStaff.get(id) ?? [];
        const occupied = intervals.some((b) => bufStart < b.end && bufEnd > b.start);
        if (!occupied) freeStaff++;
      }
      // 指名なし予約（staff未割当）は空きスタッフを消費
      const overlappingUnassigned = unassignedBookings.filter((b) => bufStart < b.end && bufEnd > b.start).length;
      freeStaff = Math.max(0, freeStaff - overlappingUnassigned);

      if (freeStaff <= 0) continue; // 空きスタッフなし

      // すきま時間ブロック: 直前/直後の実予約とのギャップが中途半端なら案内しない
      let awkward = false;
      let beforeEnd = -Infinity, afterStart = Infinity;
      for (const b of realBusy) {
        if (b.end <= slotStart && b.end > beforeEnd) beforeEnd = b.end;
        if (b.start >= slotEnd && b.start < afterStart) afterStart = b.start;
      }
      if (beforeEnd !== -Infinity) {
        const g = slotStart - beforeEnd;
        if (g > MAX_OK_GAP && g < MIN_FITTABLE_GAP) awkward = true;
      }
      if (afterStart !== Infinity) {
        const g = afterStart - slotEnd;
        if (g > MAX_OK_GAP && g < MIN_FITTABLE_GAP) awkward = true;
      }
      if (awkward) continue;

      // ◎○△× 判定（空きスタッフ数 / 全スタッフ）
      let level: string;
      if (totalStaff >= 3 && freeStaff >= 3) level = '◎';
      else if (freeStaff >= 2) level = '◎';
      else if (freeStaff === 1 && totalStaff === 1) level = '○';
      else level = '△'; // 残りわずか（指名なしで1枠のみ）
      // 指名ありは「空き=○ / なし=表示しない」のシンプル表現
      if (staffId) level = '○';

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
