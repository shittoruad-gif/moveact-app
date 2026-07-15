import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────
// サロンボード風タイムライン予約表（admin独自実装）
//   縦軸: 営業時間を15分=18pxの行に。横軸: スタッフ列。
//   6クエリ並列ロード: roster / business_hours / closed_days / app_bookings / staff_unavailability / airreserve_events
//   見た目はデザインシステム（index.cssの--ink/--sub/--line等とbadge/btn/modalクラス）に準拠。
// ─────────────────────────────────────────────────────────────

type StoreId = 'tamashima' | 'kanamitsu';
const STORE_NAMES: Record<StoreId, string> = { tamashima: '玉島店', kanamitsu: '金光店' };

// グリッド寸法
const ROW_MIN = 15;          // 1行=15分
const ROW_PX = 18;           // 1行=18px
const PX_PER_MIN = ROW_PX / ROW_MIN; // 1.2px/分
const TIME_COL_W = 56;       // 時刻軸列幅
const STAFF_COL_W = 160;     // スタッフ列幅
const FALLBACK_OPEN = '09:00';
const FALLBACK_CLOSE = '21:00';

// ─────────────────────────────────────────────────────────────
// 型
// ─────────────────────────────────────────────────────────────
interface RosterRow {
  staff_id: string;
  full_name: string;
  store_id: string;
}
interface BusinessHoursRow {
  store_id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}
interface ClosedDayRow {
  date: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  reason: string | null;
}
interface BookingRow {
  id: string;
  store_id: string;
  staff_id: string | null;
  treatment_menu_id: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  source: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  is_first_visit: boolean;
  deposit_status: string | null;
  customer_request: string | null;
  menu: { name: string; duration_minutes: number; price: number } | null;
  staff: { full_name: string } | null;
}
interface UnavailRow {
  id?: string;
  staff_id: string;
  store_id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  block_type: string | null;
}
// AirReserve取込予約（読み取り専用表示）
interface AirReserveRow {
  id: string;
  store_id: string;
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  summary: string | null;
}
// 週間勤務スケジュール（シフト外グレー表示用。AirReserveのグレーと同じ見え方にする）
interface WeeklyShiftRow {
  staff_id: string;
  store_id: string;
  day_of_week: number;
  start_time: string;   // 'HH:MM:SS'
  end_time: string;
}

// スタッフ列（未割当を含む）
interface Column {
  staffId: string | null;
  name: string;
}

// 空き枠クリックで開く「予約/予定/休み」登録モーダルのコンテキスト
interface QuickSlotCtx {
  store: StoreId;
  staffId: string | null;
  staffName: string;
  slotMin: number;
  openMin: number;
  closeMin: number;
}

// ─────────────────────────────────────────────────────────────
// 時刻ユーティリティ
// ─────────────────────────────────────────────────────────────
function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fmtHeading(d: Date) {
  // 年は省略（スマホで「2026年7月15日(水)」が2行に折り返すため。年跨ぎ操作は稀）
  return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
}
// 'HH:MM' → 0時からの分
function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}
// ローカル日時(ISO/Date)→ その日の0時からの分
function dateToMinOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}
function fmtClock(iso: string) {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
// ISO → JST明示の 'YYYY-MM-DD' と 'HH:MM'（端末TZに依存させない）
function isoToJstParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); // YYYY-MM-DD
  const time = d.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  return { date, time };
}

// ─────────────────────────────────────────────────────────────
// ステータス→表示（左ボーダー色・凡例と統一）
//   確定=green / 前金未確認=amber / 完了=gray / 無断=red / キャンセル=薄灰
// ─────────────────────────────────────────────────────────────
function bookingVisual(b: BookingRow): { color: string; label: string } {
  if (b.status === 'cancelled') return { color: 'var(--line)', label: 'キャンセル' };
  if (b.status === 'no_show') return { color: 'var(--red)', label: '無断キャンセル' };
  if (b.status === 'completed') return { color: 'var(--sub)', label: '完了' };
  if (b.status === 'tentative' || b.status === 'pending') return { color: 'var(--amber)', label: '仮予約' };
  if (b.deposit_status === 'pending') return { color: 'var(--amber)', label: '前金未確認' };
  return { color: 'var(--green)', label: '確定' };
}

// ─────────────────────────────────────────────────────────────
// メイン
// ─────────────────────────────────────────────────────────────
export function Timeline() {
  const todayDate = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [date, setDate] = useState<Date>(todayDate);
  // 店舗は常に1店舗のみ表示（両店同時表示は見にくいため廃止・2026-07-15オーナー要望）。
  // 前回選んだ店舗を記憶して次回もその店舗から開く。
  const [storeFilter, setStoreFilter] = useState<StoreId>(() => {
    const saved = localStorage.getItem('timeline.store');
    return saved === 'kanamitsu' || saved === 'tamashima' ? saved : 'tamashima';
  });
  useEffect(() => { localStorage.setItem('timeline.store', storeFilter); }, [storeFilter]);

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [hours, setHours] = useState<BusinessHoursRow[]>([]);
  const [closedDays, setClosedDays] = useState<ClosedDayRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [unavail, setUnavail] = useState<UnavailRow[]>([]);
  const [weeklyShifts, setWeeklyShifts] = useState<WeeklyShiftRow[]>([]);
  // 取得エラーは必ず画面に出す（握りつぶすと「予約0件」と区別できず事故になる）
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [airEvents, setAirEvents] = useState<AirReserveRow[]>([]);
  const [loading, setLoading] = useState(false);
  // 予約ブロッククリックで開く変更モーダル（AirReserveブロックは対象外）
  const [editing, setEditing] = useState<BookingRow | null>(null);
  // 空き枠クリックで開く「予約/予定/休み」登録モーダル
  const [quickSlot, setQuickSlot] = useState<QuickSlotCtx | null>(null);

  // 現在時刻（分）— 60秒ごと更新
  const [nowMin, setNowMin] = useState<number>(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const dayStr = isoDay(date);
  const dow = date.getDay(); // 0=日..6=土
  const isToday = dayStr === isoDay(todayDate);

  const load = useCallback(async () => {
    setLoading(true);
    // JSTの1日窓。+09:00を付けないとUTC解釈になり、早朝(6:30〜)の予約・
    // AirReserveイベントが前日扱いになってボードから消える。
    const lo = `${dayStr}T00:00:00+09:00`;
    const hi = `${dayStr}T23:59:59+09:00`;

    // スタッフ列クエリ（選択中の1店舗のみ）
    let rosterQ = supabase.from('public_staff_roster').select('staff_id, full_name, store_id');
    rosterQ = rosterQ.eq('store_id', storeFilter);

    let hoursQ = supabase
      .from('store_business_hours')
      .select('store_id, day_of_week, open_time, close_time, is_closed')
      .eq('day_of_week', dow);
    hoursQ = hoursQ.eq('store_id', storeFilter);

    let closedQ = supabase
      .from('store_closed_days')
      .select('date, is_closed, open_time, close_time, reason')
      .eq('date', dayStr);

    let bookingsQ = supabase
      .from('app_bookings')
      .select(`
        id, store_id, staff_id, treatment_menu_id, starts_at, ends_at, status, source,
        guest_name, guest_phone, guest_email, is_first_visit, deposit_status, customer_request,
        menu:treatment_menu_id(name, duration_minutes, price),
        staff:staff_id(full_name)
      `)
      .gte('starts_at', lo)
      .lte('starts_at', hi)
      .order('starts_at');
    bookingsQ = bookingsQ.eq('store_id', storeFilter);

    let unavailQ = supabase
      .from('staff_unavailability')
      .select('id, staff_id, store_id, starts_at, ends_at, reason, block_type')
      .gte('starts_at', lo)
      .lte('starts_at', hi);
    unavailQ = unavailQ.eq('store_id', storeFilter);

    // AirReserve取込予約（読み取り専用。二重予約防止のため表示必須）
    let airQ = supabase
      .from('airreserve_events')
      .select('id, store_id, staff_id, starts_at, ends_at, summary')
      .gte('starts_at', lo)
      .lte('starts_at', hi)
      .order('starts_at');
    airQ = airQ.eq('store_id', storeFilter);

    // 週間勤務スケジュール（シフト外のグレー表示用。店舗の全曜日分を取得して当日分を使う）
    const weeklyQ = supabase
      .from('staff_weekly_schedule')
      .select('staff_id, store_id, day_of_week, start_time, end_time')
      .eq('store_id', storeFilter);

    const [r, h, c, b, u, a, w] = await Promise.all([rosterQ, hoursQ, closedQ, bookingsQ, unavailQ, airQ, weeklyQ]);

    // どれか1つでも失敗したら明示（0件表示と混同させない）
    const firstErr = r.error ?? h.error ?? c.error ?? b.error ?? u.error ?? a.error ?? w.error;
    setLoadErr(firstErr
      ? `予約データの取得に失敗しました。表示が0件でも実際には予約が入っている可能性があります。再読み込みしても直らない場合は管理者へ連絡してください。（詳細: ${firstErr.message}）`
      : null);

    const airRows = ((a.data as AirReserveRow[]) ?? []).filter(ev => {
      if (ev.staff_id === null) {
        console.warn(`[Timeline] airreserve_events ${ev.id} は staff_id が null のため表示をスキップします (starts_at=${ev.starts_at})`);
        return false;
      }
      return true;
    });

    setRoster((r.data as RosterRow[]) ?? []);
    setHours((h.data as BusinessHoursRow[]) ?? []);
    setClosedDays((c.data as ClosedDayRow[]) ?? []);
    setBookings((b.data as unknown as BookingRow[]) ?? []);
    setUnavail((u.data as UnavailRow[]) ?? []);
    setAirEvents(airRows);
    setWeeklyShifts((w.data as WeeklyShiftRow[]) ?? []);
    setLoading(false);
  }, [dayStr, dow, storeFilter]);

  useEffect(() => { load(); }, [load]);

  const moveDate = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    d.setHours(0, 0, 0, 0);
    setDate(d);
  };

  // 予約表から登録した予定・休みブロックの削除（入れ替え時間ブロックは対象外）
  const handleUnavailDelete = async (u: UnavailRow) => {
    if (!u.id) return;
    const typeLabel = u.block_type === 'off' ? '休み' : '予定';
    const range = `${fmtClock(u.starts_at)}〜${fmtClock(u.ends_at)}`;
    if (!window.confirm(`この${typeLabel}（${range}${u.reason ? ` / ${u.reason}` : ''}）を削除します。この時間帯の予約枠が再び空きます。よろしいですか？`)) return;
    const { error: err } = await supabase.from('staff_unavailability').delete().eq('id', u.id);
    if (err) {
      window.alert(`エラー: 削除に失敗しました（${err.message}）`);
      return;
    }
    await load();
  };

  // 描画対象の店舗
  const storesToRender: StoreId[] =
    [storeFilter];

  return (
    <div className="page">
      {/* タイトル + ページ説明 */}
      <div className="page-head">
        <div>
          <h2 className="page-title">予約表</h2>
          <p className="page-help">
            スタッフごとの予約状況を確認し、予約をクリックすると時間・長さの変更やキャンセルができます。空き枠をクリックすると新規予約・予定・休みを登録できます。
            予約表は6:00〜24:00を表示します（営業時間外はスタッフだけが手動で予約を入れられます。お客様のネット予約は営業時間内のみ）。
          </p>
        </div>
      </div>

      {/* 店舗切替 */}
      <div className="toolbar" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="seg" title="表示する店舗を切り替えます">
          {(['tamashima', 'kanamitsu'] as const).map(s => (
            <button
              key={s}
              type="button"
              className={`seg-btn${storeFilter === s ? ' seg-btn--active' : ''}`}
              onClick={() => setStoreFilter(s)}
            >{STORE_NAMES[s as StoreId]}</button>
          ))}
        </div>
      </div>

      {/* 日付ナビ */}
      <div className="card card-pad day-nav" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button type="button" className="btn btn-sm" onClick={() => moveDate(-1)} title="前の日の予約表を表示します">前日</button>
        <button
          type="button"
          className={`btn btn-sm${isToday ? ' btn-primary' : ''}`}
          onClick={() => setDate(todayDate)}
          title="今日の予約表を表示します"
        >今日</button>
        <span style={{ flex: 1, textAlign: 'center' }}>
          <DateColorSpan date={date} />
        </span>
        <span
          style={{ fontSize: 13, color: 'var(--sub)', fontVariantNumeric: 'tabular-nums' }}
          title="この日の予約件数です（キャンセルを除く）"
        >
          {bookings.filter(b => b.status !== 'cancelled').length}件
        </span>
        <button type="button" className="btn btn-sm" onClick={() => moveDate(1)} title="次の日の予約表を表示します">翌日</button>
      </div>

      {/* 凡例 */}
      <Legend />

      {loadErr && (
        <div className="card card-pad" style={{ background: 'var(--red-weak)', color: 'var(--red)', fontSize: 13.5, lineHeight: 1.8, marginBottom: 12 }}>
          {loadErr}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-sm" onClick={() => load()}>再読み込み</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">
          <div className="empty">読み込み中です…</div>
        </div>
      ) : (
        storesToRender.map(store => (
          <StoreBoard
            key={store}
            store={store}
            showStoreLabel={false}
            roster={roster}
            hours={hours}
            closedDays={closedDays}
            bookings={bookings}
            unavail={unavail}
            airEvents={airEvents}
            weeklyShifts={weeklyShifts}
            dow={dow}
            isToday={isToday}
            nowMin={nowMin}
            dayStr={dayStr}
            onBookingClick={setEditing}
            onEmptyClick={setQuickSlot}
            onUnavailDelete={handleUnavailDelete}
          />
        ))
      )}

      {/* 予約変更モーダル */}
      {editing && (
        <BookingEditModal
          b={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}

      {/* 空き枠クリック → 新規予約/予定/休みの登録モーダル */}
      {quickSlot && (
        <QuickSlotModal
          ctx={quickSlot}
          dayStr={dayStr}
          bookings={bookings}
          airEvents={airEvents}
          onClose={() => setQuickSlot(null)}
          onSaved={async () => {
            setQuickSlot(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 店舗ごとのボード
// ─────────────────────────────────────────────────────────────
function StoreBoard({
  store, showStoreLabel, roster, hours, closedDays, bookings, unavail, airEvents, weeklyShifts, dow, isToday, nowMin, dayStr, onBookingClick, onEmptyClick, onUnavailDelete,
}: {
  store: StoreId;
  showStoreLabel: boolean;
  roster: RosterRow[];
  hours: BusinessHoursRow[];
  closedDays: ClosedDayRow[];
  bookings: BookingRow[];
  unavail: UnavailRow[];
  airEvents: AirReserveRow[];
  weeklyShifts: WeeklyShiftRow[];
  dow: number;
  isToday: boolean;
  nowMin: number;
  dayStr: string;
  onBookingClick: (b: BookingRow) => void;
  onEmptyClick: (ctx: QuickSlotCtx) => void;
  onUnavailDelete: (u: UnavailRow) => void;
}) {
  // 営業時間（例外日 > 通常曜日 > フォールバック）
  const closedDay = closedDays.find(c => c.date === dayStr); // 店舗非依存テーブル想定
  const hRow = hours.find(h => h.store_id === store && h.day_of_week === dow);

  let openMin: number;
  let closeMin: number;
  let storeClosed = false;
  let closedReason: string | null = null;

  if (closedDay && closedDay.is_closed && !closedDay.open_time) {
    storeClosed = true;
    closedReason = closedDay.reason;
    openMin = hhmmToMin(FALLBACK_OPEN);
    closeMin = hhmmToMin(FALLBACK_CLOSE);
  } else if (closedDay && closedDay.open_time && closedDay.close_time) {
    openMin = hhmmToMin(closedDay.open_time);
    closeMin = hhmmToMin(closedDay.close_time);
  } else if (hRow && !hRow.is_closed && hRow.open_time && hRow.close_time) {
    openMin = hhmmToMin(hRow.open_time);
    closeMin = hhmmToMin(hRow.close_time);
  } else if (hRow && hRow.is_closed) {
    storeClosed = true;
    openMin = hhmmToMin(FALLBACK_OPEN);
    closeMin = hhmmToMin(FALLBACK_CLOSE);
  } else {
    openMin = hhmmToMin(FALLBACK_OPEN);
    closeMin = hhmmToMin(FALLBACK_CLOSE);
  }

  // 管理画面のグリッドは常に6:00〜24:00を表示（早朝・夜間の個人的な予約も入れて確認できる）。
  // ネット予約でお客様が選べる時間は店舗の営業時間のままで変わらない。
  const bizOpenMin = openMin;
  const bizCloseMin = closeMin;
  openMin = Math.min(openMin, 6 * 60);
  closeMin = Math.max(closeMin, 24 * 60);

  const totalRows = Math.max(1, Math.round((closeMin - openMin) / ROW_MIN));
  const bodyHeight = totalRows * ROW_PX;

  // スタッフ列（store該当）+ 未割当レーン
  const staffCols: Column[] = roster
    .filter(r => r.store_id === store)
    .map(r => ({ staffId: r.staff_id, name: r.full_name }));
  // 重複staff_id除去（rosterが重複返す可能性へ保険）
  const seen = new Set<string>();
  const uniqueStaff = staffCols.filter(c => {
    if (c.staffId && seen.has(c.staffId)) return false;
    if (c.staffId) seen.add(c.staffId);
    return true;
  });
  const columns: Column[] = [...uniqueStaff, { staffId: null, name: '未割当' }];

  // この店舗の予約・非稼働・AirReserve取込
  const storeBookings = bookings.filter(b => b.store_id === store);
  const storeUnavail = unavail.filter(u => u.store_id === store);
  const storeAir = airEvents.filter(a => a.store_id === store);

  // シフト外グレー（AirReserveのグレーと同じ見え方）:
  //   店舗にスケジュール行が1件でもあれば有効。各スタッフの当日の勤務窓の
  //   外側をグレーで塗る。当日の行が無いスタッフは終日シフト外（休み）。
  const storeShifts = weeklyShifts.filter(wsr => wsr.store_id === store);
  const scheduleActive = storeShifts.length > 0;
  const todayWindow = new Map<string, { start: number; end: number }>();
  for (const wsr of storeShifts) {
    if (wsr.day_of_week === dow) {
      todayWindow.set(wsr.staff_id, { start: hhmmToMin(wsr.start_time.slice(0, 5)), end: hhmmToMin(wsr.end_time.slice(0, 5)) });
    }
  }
  // スタッフの当日シフト外区間（openMin〜closeMin座標で返す）
  const offShiftRanges = (staffId: string): { start: number; end: number; allDay: boolean }[] => {
    if (!scheduleActive) return [];
    const wdw = todayWindow.get(staffId);
    if (!wdw) return [{ start: openMin, end: closeMin, allDay: true }];   // 当日の行なし=終日休み
    const out: { start: number; end: number; allDay: boolean }[] = [];
    if (wdw.start > openMin) out.push({ start: openMin, end: Math.min(wdw.start, closeMin), allDay: false });
    if (wdw.end < closeMin) out.push({ start: Math.max(wdw.end, openMin), end: closeMin, allDay: false });
    return out.filter(x => x.end > x.start);
  };

  // 時刻目盛り（1時間ごと）
  const hourMarks: number[] = [];
  for (let m = Math.ceil(openMin / 60) * 60; m <= closeMin; m += 60) hourMarks.push(m);

  const handleEmptyClick = (col: Column, slotMin: number) => {
    onEmptyClick({ store, staffId: col.staffId, staffName: col.name, slotMin, openMin, closeMin });
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {showStoreLabel && (
        <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
          {STORE_NAMES[store]}
        </div>
      )}

      {storeClosed && (
        <div className="note" style={{ marginBottom: 8 }}>
          この日は休業日です{closedReason ? `（${closedReason}）` : ''}。参考として予約枠を表示しています。
        </div>
      )}

      <div className="card" style={{ overflow: 'auto', maxWidth: '100%' }}>
        {/* 横スクロール領域 */}
        <div style={{ display: 'inline-block', minWidth: '100%' }}>
          {/* ヘッダ行（スタッフ名） */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3 }}>
            <div style={{
              width: TIME_COL_W, flexShrink: 0, height: 36,
              background: 'var(--surface)',
              borderBottom: '1px solid var(--line)',
              borderRight: '1px solid var(--line)',
              position: 'sticky', left: 0, zIndex: 4,
              boxSizing: 'border-box',
            }} />
            {columns.map((col, i) => (
              <div key={col.staffId ?? `unassigned-${i}`} style={{
                width: STAFF_COL_W, flexShrink: 0, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600,
                color: col.staffId ? 'var(--ink)' : 'var(--sub)',
                background: 'var(--surface)',
                borderBottom: '1px solid var(--line)',
                borderRight: '1px solid var(--line)',
                boxSizing: 'border-box',
              }}>
                {col.name}
              </div>
            ))}
          </div>

          {/* ボディ */}
          <div style={{ display: 'flex', position: 'relative' }}>
            {/* 時刻軸列 */}
            <div style={{
              width: TIME_COL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2,
              background: 'var(--surface)', borderRight: '1px solid var(--line)',
              height: bodyHeight, boxSizing: 'border-box',
            }}>
              {hourMarks.map(m => (
                <div key={m} style={{
                  position: 'absolute', top: (m - openMin) * PX_PER_MIN, left: 0, right: 0,
                  fontSize: 12, textAlign: 'right',
                  // 営業時間外（ネット予約対象外）の時刻はうすく表示して区別する
                  color: m < bizOpenMin || m > bizCloseMin ? 'rgba(120, 113, 108, 0.45)' : 'var(--sub)',
                  paddingRight: 6, transform: 'translateY(-1px)',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {minToHHMM(m)}
                </div>
              ))}
            </div>

            {/* スタッフ列 */}
            {columns.map((col, ci) => {
              const colBookings = storeBookings.filter(b =>
                col.staffId === null ? b.staff_id === null : b.staff_id === col.staffId,
              );
              const colUnavail = col.staffId === null
                ? []
                : storeUnavail.filter(u => u.staff_id === col.staffId);
              // staff_id が null の行は load() 側で警告済み・除外済み（未割当レーンには出さない）
              const colAir = col.staffId === null
                ? []
                : storeAir.filter(a => a.staff_id === col.staffId);

              return (
                <div
                  key={col.staffId ?? `col-unassigned-${ci}`}
                  style={{
                    width: STAFF_COL_W, flexShrink: 0, position: 'relative',
                    height: bodyHeight,
                    borderRight: '1px solid var(--line)',
                    background: storeClosed ? 'var(--bg)' : 'var(--surface)',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* 15分グリッド線（クリックで新規予約） */}
                  {Array.from({ length: totalRows }).map((_, ri) => {
                    const slotMin = openMin + ri * ROW_MIN;
                    const isHourLine = slotMin % 60 === 0;
                    return (
                      <div
                        key={ri}
                        onClick={() => handleEmptyClick(col, slotMin)}
                        title={`${minToHHMM(slotMin)} クリックで予約・予定・休みを登録`}
                        style={{
                          position: 'absolute', top: ri * ROW_PX, left: 0, right: 0,
                          height: ROW_PX, boxSizing: 'border-box',
                          borderTop: isHourLine
                            ? '1px solid var(--line)'
                            : '1px solid var(--bg)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-weak)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      />
                    );
                  })}

                  {/* シフト外グレー（勤務スケジュール外＝AirReserveのグレーと同じ意味）。
                      クリックは透過させる（シフト外でもスタッフ判断の手動予約は可能） */}
                  {col.staffId !== null && offShiftRanges(col.staffId).map((g, gi) => {
                    const top = (g.start - openMin) * PX_PER_MIN;
                    const height = (g.end - g.start) * PX_PER_MIN;
                    return (
                      <div
                        key={`shift-${gi}`}
                        title={g.allDay ? 'この日はシフトが入っていません（休み）' : 'シフト外の時間帯です'}
                        style={{
                          position: 'absolute', top, left: 0, right: 0, height,
                          background: 'rgba(120, 113, 108, 0.10)',
                          pointerEvents: 'none', boxSizing: 'border-box',
                          display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                        }}
                      >
                        {height >= 40 && (
                          <span style={{ fontSize: 10.5, color: 'var(--sub)', marginTop: 4, letterSpacing: '0.06em' }}>
                            {g.allDay ? 'シフト外（休み）' : 'シフト外'}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {/* 非稼働ブロック（灰色斜線）。予定・休みはクリックで削除できる */}
                  {colUnavail.map((u, ui) => (
                    <UnavailBlock
                      key={`u-${ui}`}
                      u={u}
                      openMin={openMin}
                      closeMin={closeMin}
                      onDelete={u.id && u.block_type !== 'changeover' ? () => onUnavailDelete(u) : undefined}
                    />
                  ))}

                  {/* AirReserve取込ブロック（読み取り専用） */}
                  {colAir.map(a => (
                    <AirReserveBlock key={a.id} ev={a} openMin={openMin} closeMin={closeMin} />
                  ))}

                  {/* 予約ブロック（クリックで変更・キャンセル） */}
                  {colBookings.map(b => (
                    <ReservationBlock key={b.id} b={b} openMin={openMin} closeMin={closeMin} onClick={() => onBookingClick(b)} />
                  ))}
                </div>
              );
            })}

            {/* 現在時刻ライン（当日かつ営業時間内） */}
            {isToday && nowMin >= openMin && nowMin <= closeMin && (
              <div style={{
                position: 'absolute', left: TIME_COL_W, right: 0,
                top: (nowMin - openMin) * PX_PER_MIN, height: 0,
                borderTop: '1px solid var(--accent)', zIndex: 5, pointerEvents: 'none',
              }}>
                <span style={{
                  position: 'absolute', left: -TIME_COL_W, top: -8, width: TIME_COL_W - 4,
                  textAlign: 'right', fontSize: 10, fontWeight: 600, color: 'var(--accent)',
                  background: 'var(--surface)', fontVariantNumeric: 'tabular-nums',
                }}>
                  {minToHHMM(nowMin)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {columns.length === 1 && (
        <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6 }}>
          この店舗に登録スタッフが見つからないため、未割当レーンのみ表示しています。
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 予約ブロック（surface地 + 左3pxステータス色ボーダー）
// ─────────────────────────────────────────────────────────────
function ReservationBlock({ b, openMin, closeMin, onClick }: { b: BookingRow; openMin: number; closeMin: number; onClick: () => void }) {
  const startMin = dateToMinOfDay(b.starts_at);
  let endMin: number;
  if (b.ends_at) {
    endMin = dateToMinOfDay(b.ends_at);
  } else if (b.menu?.duration_minutes) {
    endMin = startMin + b.menu.duration_minutes;
  } else {
    endMin = startMin + 60;
  }
  // 営業時間にクランプ（描画はみ出し防止）
  const top = (startMin - openMin) * PX_PER_MIN;
  const rawH = (endMin - startMin) * PX_PER_MIN;
  const maxH = (closeMin - startMin) * PX_PER_MIN;
  const height = Math.max(ROW_PX, Math.min(rawH, maxH));

  const isCancelled = b.status === 'cancelled';
  const visual = bookingVisual(b);
  const guestName = b.guest_name ?? '会員予約';
  const compact = height < 36;

  return (
    <div
      title={`${fmtClock(b.starts_at)} ${guestName} / ${b.menu?.name ?? 'メニュー不明'} / ${visual.label}（クリックで変更・キャンセルができます）`}
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        position: 'absolute', top, left: 2, right: 2, height: height - 2,
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        borderLeft: `3px solid ${visual.color}`,
        borderRadius: 4, boxSizing: 'border-box',
        padding: '2px 6px', overflow: 'hidden', zIndex: 1,
        boxShadow: 'var(--shadow)',
        opacity: isCancelled ? 0.55 : 1,
        cursor: 'pointer', lineHeight: 1.35,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 4,
        fontSize: 11, color: 'var(--sub)', fontVariantNumeric: 'tabular-nums',
      }}>
        <span>{fmtClock(b.starts_at)}</span>
        {b.is_first_visit && !isCancelled && (
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)' }}>初回</span>
        )}
        {compact && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--ink)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {guestName}
          </span>
        )}
      </div>
      {!compact && (
        <>
          <div style={{
            fontSize: 13, fontWeight: 600, color: 'var(--ink)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {guestName}
          </div>
          <div style={{
            fontSize: 12, color: 'var(--sub)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {b.menu?.name ?? 'メニュー不明'}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 予約変更モーダル
//   保存は UPDATE app_bookings 一発。二重予約は DB の EXCLUDE 制約
//   （バッファ=入れ替え時間込み）が最終防衛。AirReserve取込予約とは
//   制約が効かないため、保存前にアプリ側で重複確認する（NewBookingと同方式）。
// ─────────────────────────────────────────────────────────────
interface StaffOption { staff_id: string; full_name: string; }
interface MenuOption { id: string; name: string; duration_minutes: number; price: number; }

const STATUS_LABELS: Record<string, string> = {
  confirmed: '確定',
  completed: '完了',
  cancelled: 'キャンセル',
  no_show: '無断キャンセル',
  tentative: '仮予約',
  pending: '保留',
};

function BookingEditModal({ b, onClose, onSaved }: {
  b: BookingRow;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const init = useMemo(() => isoToJstParts(b.starts_at), [b]);
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const [staffId, setStaffId] = useState(b.staff_id ?? '');
  const [menuId, setMenuId] = useState(b.treatment_menu_id ?? '');
  const [status, setStatus] = useState(b.status);
  const [customerRequest, setCustomerRequest] = useState(b.customer_request ?? '');

  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [menuList, setMenuList] = useState<MenuOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 店舗の稼働スタッフ（staff_stores × profiles）と店舗メニュー（store_treatment_menus × treatment_menus）
  useEffect(() => {
    let alive = true;
    (async () => {
      const [s, stm] = await Promise.all([
        supabase
          .from('staff_stores')
          .select('staff_id, profile:profiles(full_name)')
          .eq('store_id', b.store_id)
          .eq('is_active', true),
        supabase
          .from('store_treatment_menus')
          .select('treatment_menu_id')
          .eq('store_id', b.store_id)
          .eq('is_available', true),
      ]);

      const staffRows: StaffOption[] =
        ((s.data as unknown as { staff_id: string; profile: { full_name: string } | null }[]) ?? [])
          .map(r => ({ staff_id: r.staff_id, full_name: r.profile?.full_name ?? '（名前未設定）' }))
          .sort((x, y) => x.full_name.localeCompare(y.full_name, 'ja'));

      const menuIds = ((stm.data as { treatment_menu_id: string }[]) ?? []).map(r => r.treatment_menu_id);
      let menus: MenuOption[] = [];
      if (menuIds.length > 0) {
        const { data: m } = await supabase
          .from('treatment_menus')
          .select('id, name, duration_minutes, price')
          .in('id', menuIds)
          .eq('is_active', true)
          .order('sort_order');
        menus = ((m as MenuOption[]) ?? []);
      }

      if (!alive) return;
      // 現在の担当・メニューが一覧に無い場合も選択肢に残す（無いと保存時に意図せず変わるため）
      if (b.staff_id && !staffRows.some(r => r.staff_id === b.staff_id)) {
        staffRows.push({ staff_id: b.staff_id, full_name: b.staff?.full_name ?? '（現在の担当）' });
      }
      if (b.treatment_menu_id && !menus.some(m => m.id === b.treatment_menu_id)) {
        menus.push({
          id: b.treatment_menu_id,
          name: b.menu?.name ?? '（現在のメニュー）',
          duration_minutes: b.menu?.duration_minutes ?? 60,
          price: b.menu?.price ?? 0,
        });
      }
      setStaffList(staffRows);
      setMenuList(menus);
    })();
    return () => { alive = false; };
  }, [b]);

  // 開始時刻の選択肢（15分刻み。既存予約が刻み外の時刻でも選択肢に残す）
  const timeOptions = useMemo(() => {
    const opts: string[] = [];
    for (let m = 6 * 60; m <= 23 * 60 + 45; m += 15) opts.push(minToHHMM(m));
    if (time && !opts.includes(time)) {
      opts.push(time);
      opts.sort();
    }
    return opts;
  }, [time]);

  // 元の所要時間（分）。メニュー据え置き時はこの長さを維持して平行移動する
  const origDurationMin = useMemo(() => {
    if (b.ends_at) {
      const diff = Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000);
      if (diff > 0) return diff;
    }
    return b.menu?.duration_minutes ?? 60;
  }, [b]);

  const selectedMenu = menuList.find(m => m.id === menuId);
  const menuChanged = menuId !== (b.treatment_menu_id ?? '');
  // 所要時間（予約の長さ）: 「自動」= メニュー変更時はメニューの時間、据え置き時は元の長さ。
  // 手動で選ぶと ends_at がその長さで再計算される。
  const [durationSel, setDurationSel] = useState<number | null>(null);
  const autoDurationMin = menuChanged ? (selectedMenu?.duration_minutes ?? 60) : origDurationMin;
  const durationMin = durationSel ?? autoDurationMin;

  const durationOptions = useMemo(() => {
    const opts: number[] = [];
    for (let m = 15; m <= 300; m += 15) opts.push(m);
    if (!opts.includes(autoDurationMin)) {
      opts.push(autoDurationMin);
      opts.sort((a, b) => a - b);
    }
    return opts;
  }, [autoDurationMin]);

  // 終了予定の表示（JST明示）
  const endPreview = useMemo(() => {
    if (!date || !time) return null;
    const s = new Date(`${date}T${time}:00+09:00`);
    if (Number.isNaN(s.getTime())) return null;
    const e = new Date(s.getTime() + durationMin * 60_000);
    return e.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false });
  }, [date, time, durationMin]);

  // ステータス選択肢（既存が想定外の値でも選択肢に残す）
  const statusOptions = useMemo(() => {
    const base = ['confirmed', 'completed', 'cancelled', 'no_show'];
    if (!base.includes(b.status)) base.unshift(b.status);
    return base;
  }, [b]);

  // 保存（UPDATE app_bookings 一発）
  const doUpdate = async (payload: Record<string, unknown>): Promise<boolean> => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('app_bookings').update(payload).eq('id', b.id);
    setSaving(false);
    if (err) {
      if (err.code === '23P01' || err.message.toLowerCase().includes('exclusion')) {
        setError('その時間帯は既に予約があります（入れ替え時間15分を含む）');
      } else {
        setError(`エラー: ${err.message}`);
      }
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    setError(null);
    if (!menuId) { setError('メニューを選択してください'); return; }
    if (!date || !time) { setError('日付と開始時刻を入力してください'); return; }

    // JST明示で組み立て（端末TZに依存させない）
    const startsAt = new Date(`${date}T${time}:00+09:00`);
    if (Number.isNaN(startsAt.getTime())) { setError('日付・時刻の形式が正しくありません'); return; }
    const endsAt = new Date(startsAt.getTime() + durationMin * 60_000);

    // AirReserve取込予約との重複チェック（NewBookingと同方式・同文言）。
    // キャンセルにする保存は枠を空けるだけなので確認不要。
    if (status !== 'cancelled') {
      setSaving(true);
      let airQ = supabase
        .from('airreserve_events')
        .select('id, staff_id, starts_at, ends_at')
        .eq('store_id', b.store_id)
        .lt('starts_at', endsAt.toISOString())
        .gt('ends_at', startsAt.toISOString());
      if (staffId) airQ = airQ.eq('staff_id', staffId);

      const { data: airOverlaps, error: airErr } = await airQ;
      setSaving(false);

      if (airErr) {
        setError(`エラー: AirReserve予約の重複確認に失敗しました（${airErr.message}）`);
        return;
      }
      if (staffId && (airOverlaps?.length ?? 0) > 0) {
        setError('この時間帯はAirReserveの予約と重複しています。別の時間を選んでください。');
        return;
      }
      if (!staffId && (airOverlaps?.length ?? 0) > 0) {
        const proceed = window.confirm(
          'この時間帯はこの店舗のAirReserveの予約と重複しています。\n担当スタッフが未指定のため、担当を決める際に時間が重なる可能性があります。\nこのまま保存しますか？',
        );
        if (!proceed) return;
      }
    }

    const ok = await doUpdate({
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      staff_id: staffId || null,
      treatment_menu_id: menuId,
      status,
      customer_request: customerRequest.trim() || null,
    });
    if (ok) await onSaved();
  };

  // クイックアクション（ステータスのみ即時更新）
  const quickStatus = async (newStatus: 'completed' | 'no_show' | 'cancelled') => {
    if (newStatus === 'cancelled' && !window.confirm('この予約をキャンセルします。よろしいですか？')) return;
    if (newStatus === 'no_show' && !window.confirm('この予約を無断キャンセルとして記録します。よろしいですか？')) return;
    const ok = await doUpdate({ status: newStatus });
    if (ok) await onSaved();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* ヘッダ */}
        <div className="modal-head" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>予約の変更</span>
          {b.is_first_visit && (
            <span className="badge" style={{ background: 'var(--accent-weak)', color: 'var(--accent)' }}>初回</span>
          )}
          {b.deposit_status === 'paid' && <span className="badge badge-green">前金済</span>}
          {b.deposit_status === 'pending' && <span className="badge badge-amber">前金未確認</span>}
          <button
            type="button"
            onClick={onClose}
            title="変更せずに閉じます"
            aria-label="閉じる"
            style={{
              marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 20, lineHeight: 1, color: 'var(--sub)', padding: 4,
            }}
          >×</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          {/* お客様情報（表示のみ） */}
          <div className="note" style={{ marginBottom: 16, lineHeight: 1.7 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
              {b.guest_name ? (
                <>
                  {b.guest_name}
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--sub)', marginLeft: 6 }}>様</span>
                </>
              ) : '会員（アプリ予約）'}
            </div>
            <div style={{ color: 'var(--sub)' }}>
              電話: {b.guest_phone ?? '（未登録）'}
            </div>
            <div style={{ color: 'var(--sub)' }}>
              メール: {b.guest_email ?? '（未登録）'}
            </div>
            <div style={{ color: 'var(--sub)' }}>
              現在: {fmtClock(b.starts_at)}{b.ends_at ? `〜${fmtClock(b.ends_at)}` : ''} / {b.menu?.name ?? 'メニュー不明'} / {STATUS_LABELS[b.status] ?? b.status}
            </div>
          </div>

          {/* 編集フォーム */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label className="field-label">日付</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">開始時刻（15分刻み）</label>
              <select className="select" value={time} onChange={e => setTime(e.target.value)}>
                {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">担当スタッフ</label>
              <select className="select" value={staffId} onChange={e => setStaffId(e.target.value)}>
                <option value="">未割当（指名なし）</option>
                {staffList.map(s => <option key={s.staff_id} value={s.staff_id}>{s.full_name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">ステータス</label>
              <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
                {statusOptions.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">メニュー</label>
              <select
                className="select"
                value={menuId}
                onChange={e => { setMenuId(e.target.value); setDurationSel(null); }}
              >
                <option value="">選択してください</option>
                {menuList.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}（{m.duration_minutes}分 / ¥{m.price.toLocaleString()}）
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field-label">所要時間（予約の長さ）</label>
              <select
                className="select"
                value={durationSel ?? ''}
                onChange={e => setDurationSel(e.target.value === '' ? null : Number(e.target.value))}
                title="変更すると終了時刻がこの長さで計算し直されます"
              >
                <option value="">自動（{autoDurationMin}分）</option>
                {durationOptions.map(m => <option key={m} value={m}>{m}分</option>)}
              </select>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">要望・スタッフメモ</label>
              <textarea
                className="textarea"
                style={{ height: 70, resize: 'vertical' }}
                placeholder="お客様からの要望やスタッフメモ"
                value={customerRequest}
                onChange={e => setCustomerRequest(e.target.value)}
              />
            </div>
          </div>

          {endPreview && (
            <div className="note" style={{ marginTop: 12 }}>
              終了予定: <strong>{endPreview}</strong>（{durationMin}分）
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 14px', background: 'var(--red-weak)',
              borderRadius: 8, color: 'var(--red)', fontSize: 13,
            }}>
              {error}
            </div>
          )}

          {/* クイックアクション（ステータスのみ即時更新） */}
          <div style={{
            display: 'flex', gap: 8, marginTop: 16, paddingTop: 14,
            borderTop: '1px solid var(--line)', flexWrap: 'wrap',
          }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => quickStatus('completed')}
              disabled={saving}
              title="この予約を来店完了として記録します"
            >来店完了にする</button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => quickStatus('no_show')}
              disabled={saving}
              title="この予約を無断キャンセルとして記録します"
            >無断キャンセルにする</button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => quickStatus('cancelled')}
              disabled={saving}
              title="この予約をキャンセルして枠を空けます"
            >予約をキャンセルする</button>
          </div>
        </div>

        {/* フッタ */}
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={saving}
          >閉じる</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >{saving ? '保存中…' : '変更を保存する'}</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 空き枠クリックモーダル（新規予約へ進む / 予定・休みをその場で登録）
//   予定・休みは staff_unavailability にINSERT（スタッフ休み登録ページと同方式）。
//   日時はJST明示（+09:00）で保存する。
// ─────────────────────────────────────────────────────────────
function QuickSlotModal({ ctx, dayStr, bookings, airEvents, onClose, onSaved }: {
  ctx: QuickSlotCtx;
  dayStr: string;
  bookings: BookingRow[];
  airEvents: AirReserveRow[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  // 未割当レーンにはスタッフ紐付きの予定・休みを登録できない
  const canBlock = ctx.staffId !== null;
  const [mode, setMode] = useState<'booking' | 'busy' | 'off'>('booking');
  const [startTime, setStartTime] = useState(minToHHMM(ctx.slotMin));
  const [endTime, setEndTime] = useState(minToHHMM(Math.min(ctx.slotMin + 60, ctx.closeMin)));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeOptions = useMemo(() => {
    const opts: string[] = [];
    for (let m = 6 * 60; m <= 23 * 60 + 45; m += 15) opts.push(minToHHMM(m));
    return opts;
  }, []);

  // 入力中の時間帯と既存予約（app_bookings + AirReserve）の重なり（注意喚起のみ・登録は可能）
  const hasOverlap = useMemo(() => {
    if (!ctx.staffId || startTime >= endTime) return false;
    const hits = (sIso: string, eIso: string) =>
      isoToJstParts(sIso).time < endTime && isoToJstParts(eIso).time > startTime;
    const bkEnd = (b: BookingRow) =>
      b.ends_at ?? new Date(new Date(b.starts_at).getTime() + (b.menu?.duration_minutes ?? 60) * 60_000).toISOString();
    return (
      bookings.some(b => b.staff_id === ctx.staffId && b.status !== 'cancelled' && hits(b.starts_at, bkEnd(b))) ||
      airEvents.some(a => a.staff_id === ctx.staffId && hits(a.starts_at, a.ends_at))
    );
  }, [bookings, airEvents, ctx.staffId, startTime, endTime]);

  const handleRegister = async () => {
    if (!ctx.staffId) return;
    if (startTime >= endTime) { setError('終了時刻は開始時刻より後にしてください'); return; }
    setSaving(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const { error: err } = await supabase.from('staff_unavailability').insert({
      staff_id: ctx.staffId,
      store_id: ctx.store,
      starts_at: `${dayStr}T${startTime}:00+09:00`,
      ends_at: `${dayStr}T${endTime}:00+09:00`,
      reason: reason.trim() || null,
      block_type: mode === 'off' ? 'off' : 'busy',
      created_by: session?.user.id ?? null,
    });
    setSaving(false);
    if (err) {
      setError(`エラー: 登録に失敗しました（${err.message}）`);
      return;
    }
    await onSaved();
  };

  const dateLabel = new Date(`${dayStr}T00:00:00+09:00`).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(480px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="modal-head" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>この枠に登録</span>
          <button
            type="button"
            onClick={onClose}
            title="登録せずに閉じます"
            aria-label="閉じる"
            style={{
              marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 20, lineHeight: 1, color: 'var(--sub)', padding: 4,
            }}
          >×</button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>
          <div className="note" style={{ marginBottom: 16, lineHeight: 1.7 }}>
            {STORE_NAMES[ctx.store]} / <strong>{ctx.staffName}</strong> / {dateLabel} {minToHHMM(ctx.slotMin)}〜
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">登録する内容</label>
            <div className="seg">
              <button
                type="button"
                className={`seg-btn${mode === 'booking' ? ' seg-btn--active' : ''}`}
                onClick={() => setMode('booking')}
                title="お客様の予約を登録します（予約入力画面へ進みます）"
              >新規予約</button>
              <button
                type="button"
                className={`seg-btn${mode === 'busy' ? ' seg-btn--active' : ''}`}
                onClick={() => setMode('busy')}
                disabled={!canBlock}
                title="外出・会議などの予定でこの時間の予約を止めます"
              >予定</button>
              <button
                type="button"
                className={`seg-btn${mode === 'off' ? ' seg-btn--active' : ''}`}
                onClick={() => setMode('off')}
                disabled={!canBlock}
                title="休みとしてこの時間の予約を止めます"
              >休み</button>
            </div>
          </div>

          {!canBlock && (
            <div className="note" style={{ marginBottom: 12 }}>
              未割当の列には予定・休みは登録できません。予定・休みを入れる場合はスタッフの列の枠をクリックしてください。
            </div>
          )}

          {mode === 'booking' ? (
            <div className="note" style={{ lineHeight: 1.7 }}>
              「予約入力へ進む」を押すと、この店舗・スタッフ・時間が入った状態で手動予約入力画面が開きます。
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="field">
                  <label className="field-label">開始時刻</label>
                  <select className="select" value={startTime} onChange={e => setStartTime(e.target.value)}>
                    {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field-label">終了時刻</label>
                  <select className="select" value={endTime} onChange={e => setEndTime(e.target.value)}>
                    {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label className="field-label">理由・メモ</label>
                  <input
                    type="text"
                    className="input"
                    placeholder={mode === 'off' ? '例）有休 / 通院' : '例）外出 / 研修 / 会議'}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => { setStartTime(minToHHMM(ctx.openMin)); setEndTime(minToHHMM(ctx.closeMin)); }}
                  title="開始・終了を営業時間いっぱいにします（終日の休みなど）"
                >終日にする</button>
              </div>

              <div className="note" style={{ marginTop: 12, lineHeight: 1.7 }}>
                登録した時間帯は、このスタッフの予約枠がブロックされます（ネット予約・予約表に反映されます）。
              </div>

              {hasOverlap && (
                <div style={{
                  marginTop: 12, padding: '10px 12px', background: 'var(--amber-weak)',
                  color: 'var(--amber)', borderRadius: 8, fontSize: 13, lineHeight: 1.6,
                }}>
                  この時間帯には既に予約があります。予約はそのまま残るため、必要なら先に予約を変更してください。
                </div>
              )}

              {error && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', background: 'var(--red-weak)',
                  borderRadius: 8, color: 'var(--red)', fontSize: 13,
                }}>
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>閉じる</button>
          {mode === 'booking' ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/new-booking?store=${ctx.store}&staff=${ctx.staffId ?? ''}&date=${dayStr}&time=${minToHHMM(ctx.slotMin)}`)}
            >予約入力へ進む</button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRegister}
              disabled={saving || !canBlock}
            >{saving ? '登録中…' : mode === 'off' ? '休みを登録する' : '予定を登録する'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// AirReserve取込ブロック（読み取り専用・purple-weak地）
// ─────────────────────────────────────────────────────────────
function AirReserveBlock({ ev, openMin, closeMin }: { ev: AirReserveRow; openMin: number; closeMin: number }) {
  const startMin = dateToMinOfDay(ev.starts_at);
  const endMin = dateToMinOfDay(ev.ends_at);
  // 営業時間にクランプ（描画はみ出し防止）
  const top = (startMin - openMin) * PX_PER_MIN;
  const rawH = (endMin - startMin) * PX_PER_MIN;
  const maxH = (closeMin - startMin) * PX_PER_MIN;
  const height = Math.max(ROW_PX, Math.min(rawH, maxH));

  const compact = height < 36;

  return (
    <div
      title={`${fmtClock(ev.starts_at)}〜${fmtClock(ev.ends_at)} AirReserveの予約（参照のみ・編集不可）${ev.summary ? ` / ${ev.summary}` : ''}`}
      style={{
        position: 'absolute', top, left: 2, right: 2, height: height - 2,
        background: 'var(--purple-weak)',
        border: '1px solid var(--line)',
        borderLeft: '3px solid var(--purple)',
        borderRadius: 4, boxSizing: 'border-box',
        padding: '2px 6px', overflow: 'hidden', zIndex: 1,
        boxShadow: 'var(--shadow)',
        cursor: 'default', lineHeight: 1.35,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 600, color: 'var(--purple)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span>{fmtClock(ev.starts_at)}</span>
        {!compact && <span className="badge badge-purple">AirReserve</span>}
        {compact && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: 'var(--ink)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {ev.summary ?? 'AirReserve'}
          </span>
        )}
      </div>
      {!compact && (
        <div style={{
          fontSize: 12, color: 'var(--sub)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {ev.summary ?? '（内容未記入）'}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 非稼働ブロック（灰色斜線）
// ─────────────────────────────────────────────────────────────
function UnavailBlock({ u, openMin, closeMin, onDelete }: { u: UnavailRow; openMin: number; closeMin: number; onDelete?: () => void }) {
  const startMin = dateToMinOfDay(u.starts_at);
  const endMin = dateToMinOfDay(u.ends_at);
  const top = (startMin - openMin) * PX_PER_MIN;
  const rawH = (endMin - startMin) * PX_PER_MIN;
  const maxH = (closeMin - startMin) * PX_PER_MIN;
  const height = Math.max(ROW_PX, Math.min(rawH, maxH));

  const labelMap: Record<string, string> = {
    changeover: '入替',
    busy: '対応中',
    off: '不在',
  };
  const label = (u.block_type && labelMap[u.block_type]) || u.reason || '休み';

  return (
    <div
      title={`${fmtClock(u.starts_at)}〜${fmtClock(u.ends_at)} ${label}（この時間帯は予約できません${onDelete ? '。クリックで削除できます' : ''}）`}
      onClick={onDelete ? e => { e.stopPropagation(); onDelete(); } : undefined}
      style={{
        position: 'absolute', top, left: 2, right: 2, height: height - 2,
        boxSizing: 'border-box', borderRadius: 4, zIndex: 1, overflow: 'hidden',
        border: '1px solid var(--line)',
        backgroundColor: 'var(--bg)',
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0, rgba(0,0,0,0.05) 4px, transparent 4px, transparent 8px)',
        display: 'flex', alignItems: 'flex-start',
        padding: '2px 6px', fontSize: 10, color: 'var(--sub)', fontWeight: 600,
        cursor: onDelete ? 'pointer' : 'default',
      }}
    >
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 凡例（ラベル付き・ステータス表記統一）
// ─────────────────────────────────────────────────────────────
function Legend() {
  const items: { label: string; color: string; bg?: string; hatch?: boolean; title: string }[] = [
    { label: '確定', color: 'var(--green)', title: '来店予定が確定している予約です' },
    { label: '完了', color: 'var(--sub)', title: '来店が完了した予約です' },
    { label: '無断キャンセル', color: 'var(--red)', title: '連絡なく来店されなかった予約です' },
    { label: '前金未確認', color: 'var(--amber)', title: '初回前金の入金確認が済んでいない予約です' },
    { label: 'AirReserve', color: 'var(--purple)', bg: 'var(--purple-weak)', title: 'AirReserveから取り込んだ予約です（参照のみ・編集不可）' },
    { label: '休み', color: 'var(--line)', hatch: true, title: 'スタッフが対応できない時間帯です' },
    { label: 'シフト外', color: 'rgba(120,113,108,0.35)', title: '勤務スケジュール外の時間帯です（うすいグレーの帯）' },
  ];
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: 'var(--sub)' }}>凡例:</span>
      {items.map(it => (
        <span
          key={it.label}
          title={it.title}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--sub)' }}
        >
          <span style={{
            width: 14, height: 14, borderRadius: 3, boxSizing: 'border-box',
            background: it.bg ?? 'var(--surface)',
            border: '1px solid var(--line)',
            borderLeft: `3px solid ${it.color}`,
            backgroundImage: it.hatch
              ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0, rgba(0,0,0,0.05) 3px, transparent 3px, transparent 6px)'
              : undefined,
          }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 日付見出し（日曜のみ--redで注意喚起。色面は最小限）
// ─────────────────────────────────────────────────────────────
function DateColorSpan({ date }: { date: Date }) {
  const dow = date.getDay();
  const color = dow === 0 ? 'var(--red)' : 'var(--ink)';
  return (
    <span style={{ fontWeight: 600, fontSize: 15, color }}>
      {fmtHeading(date)}
    </span>
  );
}
