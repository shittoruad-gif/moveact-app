import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────
// サロンボード風タイムライン予約表（admin独自実装）
//   縦軸: 営業時間を15分=18pxの行に。横軸: スタッフ列。
//   6クエリ並列ロード: roster / business_hours / closed_days / app_bookings / staff_unavailability / airreserve_events
// ─────────────────────────────────────────────────────────────

type StoreId = 'tamashima' | 'kanamitsu';
const STORE_ORDER: StoreId[] = ['tamashima', 'kanamitsu'];
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

// スタッフ列（未割当を含む）
interface Column {
  staffId: string | null;
  name: string;
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
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
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
// メイン
// ─────────────────────────────────────────────────────────────
export function Timeline() {
  const todayDate = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [date, setDate] = useState<Date>(todayDate);
  const [storeFilter, setStoreFilter] = useState<StoreId | 'all'>('all');

  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [hours, setHours] = useState<BusinessHoursRow[]>([]);
  const [closedDays, setClosedDays] = useState<ClosedDayRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [unavail, setUnavail] = useState<UnavailRow[]>([]);
  const [airEvents, setAirEvents] = useState<AirReserveRow[]>([]);
  const [loading, setLoading] = useState(false);
  // 予約ブロッククリックで開く詳細・編集モーダル（AirReserveブロックは対象外）
  const [editing, setEditing] = useState<BookingRow | null>(null);

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

    // スタッフ列クエリ（store_idでフィルタする場合のみ絞る。allは両店分）
    let rosterQ = supabase.from('public_staff_roster').select('staff_id, full_name, store_id');
    if (storeFilter !== 'all') rosterQ = rosterQ.eq('store_id', storeFilter);

    let hoursQ = supabase
      .from('store_business_hours')
      .select('store_id, day_of_week, open_time, close_time, is_closed')
      .eq('day_of_week', dow);
    if (storeFilter !== 'all') hoursQ = hoursQ.eq('store_id', storeFilter);

    let closedQ = supabase
      .from('store_closed_days')
      .select('date, is_closed, open_time, close_time, reason')
      .eq('date', dayStr);

    let bookingsQ = supabase
      .from('app_bookings')
      .select(`
        id, store_id, staff_id, treatment_menu_id, starts_at, ends_at, status, source,
        guest_name, guest_phone, is_first_visit, deposit_status, customer_request,
        menu:treatment_menu_id(name, duration_minutes, price),
        staff:staff_id(full_name)
      `)
      .gte('starts_at', lo)
      .lte('starts_at', hi)
      .order('starts_at');
    if (storeFilter !== 'all') bookingsQ = bookingsQ.eq('store_id', storeFilter);

    let unavailQ = supabase
      .from('staff_unavailability')
      .select('staff_id, store_id, starts_at, ends_at, reason, block_type')
      .gte('starts_at', lo)
      .lte('starts_at', hi);
    if (storeFilter !== 'all') unavailQ = unavailQ.eq('store_id', storeFilter);

    // AirReserve取込予約（読み取り専用。二重予約防止のため表示必須）
    let airQ = supabase
      .from('airreserve_events')
      .select('id, store_id, staff_id, starts_at, ends_at, summary')
      .gte('starts_at', lo)
      .lte('starts_at', hi)
      .order('starts_at');
    if (storeFilter !== 'all') airQ = airQ.eq('store_id', storeFilter);

    const [r, h, c, b, u, a] = await Promise.all([rosterQ, hoursQ, closedQ, bookingsQ, unavailQ, airQ]);

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
    setLoading(false);
  }, [dayStr, dow, storeFilter]);

  useEffect(() => { load(); }, [load]);

  const moveDate = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    d.setHours(0, 0, 0, 0);
    setDate(d);
  };

  // 描画対象の店舗
  const storesToRender: StoreId[] =
    storeFilter === 'all' ? STORE_ORDER : [storeFilter];

  return (
    <div style={{ fontFamily: 'var(--tl-font)', color: 'var(--color-text)' }}>
      {/* タイトル + 店舗タブ */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--color-primary-dark)' }}>
          予約表
        </h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {(['all', 'tamashima', 'kanamitsu'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStoreFilter(s)}
              style={{
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: storeFilter === s ? 700 : 400,
                background: storeFilter === s ? 'var(--color-primary)' : 'var(--color-bg-sub)',
                color: storeFilter === s ? '#fff' : 'var(--color-text-sub)',
                transition: 'all 0.15s',
              }}
            >{s === 'all' ? '全店' : STORE_NAMES[s as StoreId]}</button>
          ))}
        </div>
      </div>

      {/* 日付ナビ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
        background: 'var(--color-bg)', padding: '10px 16px', borderRadius: 10,
        border: '1px solid var(--color-border)',
      }}>
        <button onClick={() => moveDate(-1)} style={navBtn}>‹ 前日</button>
        <button
          onClick={() => setDate(todayDate)}
          style={{ ...navBtn, background: isToday ? 'var(--color-primary)' : 'var(--color-bg-sub)', color: isToday ? '#fff' : 'var(--color-text-sub)' }}
        >今日</button>
        <DateColorSpan date={date} />
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--color-text-mute)' }}>
          {bookings.filter(b => b.status !== 'cancelled').length}件
        </span>
        <button onClick={() => moveDate(1)} style={navBtn}>翌日 ›</button>
      </div>

      {/* 凡例 */}
      <Legend />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-text-mute)' }}>読み込み中…</div>
      ) : (
        storesToRender.map(store => (
          <StoreBoard
            key={store}
            store={store}
            showStoreLabel={storeFilter === 'all'}
            roster={roster}
            hours={hours}
            closedDays={closedDays}
            bookings={bookings}
            unavail={unavail}
            airEvents={airEvents}
            dow={dow}
            isToday={isToday}
            nowMin={nowMin}
            dayStr={dayStr}
            onBookingClick={setEditing}
          />
        ))
      )}

      {/* 予約詳細・編集モーダル */}
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 店舗ごとのボード
// ─────────────────────────────────────────────────────────────
function StoreBoard({
  store, showStoreLabel, roster, hours, closedDays, bookings, unavail, airEvents, dow, isToday, nowMin, dayStr, onBookingClick,
}: {
  store: StoreId;
  showStoreLabel: boolean;
  roster: RosterRow[];
  hours: BusinessHoursRow[];
  closedDays: ClosedDayRow[];
  bookings: BookingRow[];
  unavail: UnavailRow[];
  airEvents: AirReserveRow[];
  dow: number;
  isToday: boolean;
  nowMin: number;
  dayStr: string;
  onBookingClick: (b: BookingRow) => void;
}) {
  const navigate = useNavigate();

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

  // 時刻目盛り（1時間ごと）
  const hourMarks: number[] = [];
  for (let m = Math.ceil(openMin / 60) * 60; m <= closeMin; m += 60) hourMarks.push(m);

  const handleEmptyClick = (col: Column, slotMin: number) => {
    const t = minToHHMM(slotMin);
    navigate(
      `/new-booking?store=${store}&staff=${col.staffId ?? ''}&date=${dayStr}&time=${t}`,
    );
  };

  return (
    <div style={{ marginBottom: 28 }}>
      {showStoreLabel && (
        <div style={{
          display: 'inline-block', marginBottom: 8, padding: '4px 14px',
          background: 'var(--color-primary-tint)', color: 'var(--color-primary-dark)',
          borderRadius: 6, fontSize: 14, fontWeight: 700,
          border: '1px solid var(--color-primary-light)',
        }}>
          {STORE_NAMES[store]}
        </div>
      )}

      {storeClosed && (
        <div style={{ fontSize: 12, color: 'var(--color-text-mute)', marginBottom: 6 }}>
          ※ 本日は休業日です{closedReason ? `（${closedReason}）` : ''}（参考表示）
        </div>
      )}

      <div style={{
        border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'auto',
        background: 'var(--color-bg)', maxWidth: '100%',
      }}>
        {/* 横スクロール領域 */}
        <div style={{ display: 'inline-block', minWidth: '100%' }}>
          {/* ヘッダ行（スタッフ名） */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3 }}>
            <div style={{
              width: TIME_COL_W, flexShrink: 0, height: 34,
              background: 'var(--color-bg-sub)', borderBottom: '1px solid var(--color-border-strong)',
              borderRight: '1px solid var(--color-border)',
              position: 'sticky', left: 0, zIndex: 4,
            }} />
            {columns.map((col, i) => (
              <div key={col.staffId ?? `unassigned-${i}`} style={{
                width: STAFF_COL_W, flexShrink: 0, height: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700,
                color: col.staffId ? 'var(--color-text)' : 'var(--color-text-mute)',
                background: 'var(--color-bg-sub)',
                borderBottom: '1px solid var(--color-border-strong)',
                borderRight: '1px solid var(--color-border)',
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
              background: 'var(--color-bg)', borderRight: '1px solid var(--color-border)',
              height: bodyHeight,
            }}>
              {hourMarks.map(m => (
                <div key={m} style={{
                  position: 'absolute', top: (m - openMin) * PX_PER_MIN, left: 0, right: 0,
                  fontSize: 11, color: 'var(--color-text-sub)', textAlign: 'right',
                  paddingRight: 6, transform: 'translateY(-1px)',
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
                    borderRight: '1px solid var(--color-border)',
                    background: storeClosed ? 'var(--color-bg-muted)' : 'var(--color-bg)',
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
                        title={`${minToHHMM(slotMin)} に新規予約`}
                        style={{
                          position: 'absolute', top: ri * ROW_PX, left: 0, right: 0,
                          height: ROW_PX, boxSizing: 'border-box',
                          borderTop: isHourLine
                            ? '1px solid var(--color-border-strong)'
                            : '1px solid var(--color-bg-sub)',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary-tint)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      />
                    );
                  })}

                  {/* 非稼働ブロック（灰色斜線） */}
                  {colUnavail.map((u, ui) => (
                    <UnavailBlock key={`u-${ui}`} u={u} openMin={openMin} closeMin={closeMin} />
                  ))}

                  {/* AirReserve取込ブロック（読み取り専用） */}
                  {colAir.map(a => (
                    <AirReserveBlock key={a.id} ev={a} openMin={openMin} closeMin={closeMin} />
                  ))}

                  {/* 予約ブロック（クリックで詳細・編集） */}
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
                borderTop: '2px solid var(--color-primary)', zIndex: 5, pointerEvents: 'none',
              }}>
                <span style={{
                  position: 'absolute', left: -TIME_COL_W, top: -8, width: TIME_COL_W - 4,
                  textAlign: 'right', fontSize: 10, fontWeight: 700, color: 'var(--color-primary)',
                  background: 'var(--color-bg)',
                }}>
                  {minToHHMM(nowMin)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {columns.length === 1 && (
        <div style={{ fontSize: 12, color: 'var(--color-text-mute)', marginTop: 6 }}>
          ※ この店舗に登録スタッフが見つかりません（未割当レーンのみ表示）。
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 予約ブロック
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
  const isTentative = b.status === 'tentative' || b.status === 'pending';
  const isDone = b.status === 'completed' || b.status === 'no_show';
  const isFirst = b.is_first_visit;

  let accent: string;
  let bg: string;
  if (isCancelled) {
    accent = 'var(--status-cancel)'; bg = 'var(--color-bg-sub)';
  } else if (isDone) {
    accent = 'var(--status-done)'; bg = 'var(--color-bg-sub)';
  } else if (isTentative) {
    accent = 'var(--status-tentative)'; bg = '#FFF6E8';
  } else if (isFirst) {
    accent = 'var(--status-new)'; bg = 'var(--status-new-bg)';
  } else {
    accent = 'var(--status-repeat)'; bg = 'var(--status-repeat-bg)';
  }

  const compact = height < 36;

  return (
    <div
      title={`${fmtClock(b.starts_at)} ${b.guest_name ?? ''} / ${b.menu?.name ?? ''}（クリックで詳細・編集）`}
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        position: 'absolute', top, left: 2, right: 2, height: height - 2,
        background: bg, borderLeft: `3px solid ${accent}`,
        borderRadius: 4, boxSizing: 'border-box',
        padding: '2px 5px', overflow: 'hidden', zIndex: 1,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        opacity: isCancelled ? 0.6 : 1,
        cursor: 'pointer', lineHeight: 1.3,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.18)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.08)'; }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 700, color: accent,
        textDecoration: isCancelled ? 'line-through' : 'none',
      }}>
        <span>{fmtClock(b.starts_at)}</span>
        {isFirst && !isCancelled && (
          <span style={{
            fontSize: 9, fontWeight: 800, color: '#fff', background: 'var(--status-new)',
            borderRadius: 3, padding: '0 3px', lineHeight: '13px',
          }}>初</span>
        )}
      </div>
      {!compact && (
        <>
          <div style={{
            fontSize: 12, fontWeight: 700, color: 'var(--color-text)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textDecoration: isCancelled ? 'line-through' : 'none',
          }}>
            {b.guest_name ?? '（名前未記入）'}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--color-text-sub)',
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
// 予約詳細・編集モーダル
//   保存は UPDATE app_bookings 一発。二重予約は DB の EXCLUDE 制約
//   （バッファ=入れ替え時間込み）が最終防衛。AirReserve取込予約とは
//   制約が効かないため、保存前にアプリ側で重複確認する（NewBookingと同方式）。
// ─────────────────────────────────────────────────────────────
interface StaffOption { staff_id: string; full_name: string; }
interface MenuOption { id: string; name: string; duration_minutes: number; price: number; }

const STATUS_LABELS: Record<string, string> = {
  confirmed: '確定',
  completed: '来店完了',
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
  // メニュー変更時は duration_minutes から ends_at を再計算
  const durationMin = menuChanged ? (selectedMenu?.duration_minutes ?? 60) : origDurationMin;

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

  const depositLabel =
    b.deposit_status === 'paid' ? '前金済み' :
    b.deposit_status === 'pending' ? '前金未払い' : null;

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
    if (newStatus === 'cancelled' && !window.confirm('この予約をキャンセルしますか？')) return;
    if (newStatus === 'no_show' && !window.confirm('この予約を無断キャンセルとして記録しますか？')) return;
    const ok = await doUpdate({ status: newStatus });
    if (ok) await onSaved();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)', borderRadius: 12, width: 'min(560px, 100%)',
          maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box',
          boxShadow: '0 8px 30px rgba(0,0,0,0.25)', fontFamily: 'var(--tl-font)',
        }}
      >
        {/* ヘッダ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px',
          borderBottom: '1px solid var(--color-border)',
          position: 'sticky', top: 0, background: 'var(--color-bg)', zIndex: 1,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-primary-dark)' }}>
            予約の詳細・編集
          </span>
          {b.is_first_visit && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: '#fff', background: 'var(--status-new)',
              borderRadius: 3, padding: '1px 6px',
            }}>初回</span>
          )}
          {depositLabel && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: b.deposit_status === 'paid' ? '#2E7D32' : '#C62828',
              background: b.deposit_status === 'paid' ? '#E8F5E9' : '#FFEBEE',
              borderRadius: 10, padding: '1px 8px',
            }}>{depositLabel}</span>
          )}
          <button
            onClick={onClose}
            title="閉じる"
            style={{
              marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 20, lineHeight: 1, color: 'var(--color-text-mute)', padding: 4,
            }}
          >×</button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* お客様情報（表示のみ） */}
          <div style={{
            background: 'var(--color-bg-sub)', borderRadius: 8, padding: '10px 14px',
            marginBottom: 16, fontSize: 13, lineHeight: 1.7,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text)' }}>
              {b.guest_name ? (
                <>
                  {b.guest_name}
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-sub)', marginLeft: 6 }}>様</span>
                </>
              ) : '会員（アプリ予約）'}
            </div>
            <div style={{ color: 'var(--color-text-sub)' }}>
              電話: {b.guest_phone ?? '（未登録）'}
            </div>
            <div style={{ color: 'var(--color-text-sub)' }}>
              現在: {fmtClock(b.starts_at)}{b.ends_at ? `〜${fmtClock(b.ends_at)}` : ''} / {b.menu?.name ?? 'メニュー不明'} / {STATUS_LABELS[b.status] ?? b.status}
            </div>
          </div>

          {/* 編集フォーム */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={mLabel}>日付</label>
              <input type="date" style={mInp} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label style={mLabel}>開始時刻（15分刻み）</label>
              <select style={mInp} value={time} onChange={e => setTime(e.target.value)}>
                {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={mLabel}>担当スタッフ</label>
              <select style={mInp} value={staffId} onChange={e => setStaffId(e.target.value)}>
                <option value="">未割当（指名なし）</option>
                {staffList.map(s => <option key={s.staff_id} value={s.staff_id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={mLabel}>ステータス</label>
              <select style={mInp} value={status} onChange={e => setStatus(e.target.value)}>
                {statusOptions.map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={mLabel}>メニュー</label>
              <select style={mInp} value={menuId} onChange={e => setMenuId(e.target.value)}>
                <option value="">選択してください</option>
                {menuList.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name}（{m.duration_minutes}分 / ¥{m.price.toLocaleString()}）
                  </option>
                ))}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={mLabel}>要望・スタッフメモ</label>
              <textarea
                style={{ ...mInp, height: 70, resize: 'vertical' }}
                placeholder="お客様からの要望やスタッフメモ"
                value={customerRequest}
                onChange={e => setCustomerRequest(e.target.value)}
              />
            </div>
          </div>

          {endPreview && (
            <div style={{
              marginTop: 12, padding: '8px 14px', background: 'var(--color-bg-sub)',
              borderRadius: 8, fontSize: 13, color: 'var(--color-text-sub)',
            }}>
              終了予定: <strong>{endPreview}</strong>（{durationMin}分）
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 14px', background: '#FFEBEE',
              border: '1px solid #EF9A9A', borderRadius: 8, color: '#C62828', fontSize: 13,
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* クイックアクション */}
          <div style={{
            display: 'flex', gap: 8, marginTop: 16, paddingTop: 14,
            borderTop: '1px solid var(--color-border)', flexWrap: 'wrap',
          }}>
            <button
              onClick={() => quickStatus('completed')}
              disabled={saving}
              style={{ ...quickBtn, border: '1px solid #2E7D32', color: '#2E7D32' }}
            >来店完了</button>
            <button
              onClick={() => quickStatus('no_show')}
              disabled={saving}
              style={{ ...quickBtn, border: '1px solid #C62828', color: '#C62828' }}
            >無断キャンセル</button>
            <button
              onClick={() => quickStatus('cancelled')}
              disabled={saving}
              style={{ ...quickBtn, border: '1px solid var(--color-text-mute)', color: 'var(--color-text-sub)' }}
            >キャンセル</button>
          </div>

          {/* フッタ */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                flex: 1, padding: 12, background: 'var(--color-bg-sub)', color: 'var(--color-text-sub)',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >閉じる</button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 2, padding: 12, background: 'var(--color-primary-dark)', color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                letterSpacing: 0.5,
              }}
            >{saving ? '保存中…' : '変更を保存する'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const mLabel: React.CSSProperties = {
  display: 'block', marginBottom: 5, fontSize: 12, fontWeight: 600, color: 'var(--color-text-sub)',
};
const mInp: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1px solid var(--color-border)',
  borderRadius: 8, fontSize: 14, background: 'var(--color-bg-muted)', boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit', color: 'var(--color-text)',
};
const quickBtn: React.CSSProperties = {
  padding: '7px 14px', fontSize: 13, fontWeight: 600, background: '#fff',
  borderRadius: 8, cursor: 'pointer',
};

// ─────────────────────────────────────────────────────────────
// AirReserve取込ブロック（読み取り専用・くすみ紫）
// ─────────────────────────────────────────────────────────────
const AIR_ACCENT = '#8E7CC3';
const AIR_BG = '#F3F0F9';

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
      title={`${fmtClock(ev.starts_at)}〜${fmtClock(ev.ends_at)} AirReserve取込 / ${ev.summary ?? ''}`}
      style={{
        position: 'absolute', top, left: 2, right: 2, height: height - 2,
        background: AIR_BG, borderLeft: `3px solid ${AIR_ACCENT}`,
        borderRadius: 4, boxSizing: 'border-box',
        padding: '2px 5px', overflow: 'hidden', zIndex: 1,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        cursor: 'default', lineHeight: 1.3,
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 700, color: AIR_ACCENT,
      }}>
        <span>{fmtClock(ev.starts_at)}</span>
        <span style={{
          fontSize: 9, fontWeight: 800, color: '#fff', background: AIR_ACCENT,
          borderRadius: 3, padding: '0 3px', lineHeight: '13px',
        }}>AirReserve</span>
      </div>
      {!compact && (
        <div style={{
          fontSize: 12, fontWeight: 700, color: 'var(--color-text)',
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
function UnavailBlock({ u, openMin, closeMin }: { u: UnavailRow; openMin: number; closeMin: number }) {
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
  const label = (u.block_type && labelMap[u.block_type]) || u.reason || '非稼働';

  return (
    <div
      title={`${fmtClock(u.starts_at)}〜${fmtClock(u.ends_at)} ${label}`}
      style={{
        position: 'absolute', top, left: 2, right: 2, height: height - 2,
        boxSizing: 'border-box', borderRadius: 4, zIndex: 1, overflow: 'hidden',
        border: '1px solid var(--color-border-strong)',
        backgroundColor: 'var(--color-bg-sub)',
        backgroundImage:
          'repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0, rgba(0,0,0,0.06) 4px, transparent 4px, transparent 8px)',
        display: 'flex', alignItems: 'flex-start',
        padding: '2px 5px', fontSize: 10, color: 'var(--color-text-mute)', fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 凡例
// ─────────────────────────────────────────────────────────────
function Legend() {
  const items: { label: string; accent: string; bg: string; hatch?: boolean; badge?: boolean }[] = [
    { label: '初回', accent: 'var(--status-new)', bg: 'var(--status-new-bg)', badge: true },
    { label: '再来店', accent: 'var(--status-repeat)', bg: 'var(--status-repeat-bg)' },
    { label: '仮予約', accent: 'var(--status-tentative)', bg: '#FFF6E8' },
    { label: '来店済', accent: 'var(--status-done)', bg: 'var(--color-bg-sub)' },
    { label: '非稼働', accent: 'var(--color-border-strong)', bg: 'var(--color-bg-sub)', hatch: true },
    { label: 'AirReserve取込', accent: AIR_ACCENT, bg: AIR_BG },
  ];
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
      {items.map(it => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-sub)' }}>
          <span style={{
            width: 16, height: 16, borderRadius: 3, borderLeft: `3px solid ${it.accent}`,
            background: it.bg, boxSizing: 'border-box',
            backgroundImage: it.hatch
              ? 'repeating-linear-gradient(45deg, rgba(0,0,0,0.06) 0, rgba(0,0,0,0.06) 3px, transparent 3px, transparent 6px)'
              : undefined,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {it.badge && (
              <span style={{ fontSize: 8, fontWeight: 800, color: it.accent }}>初</span>
            )}
          </span>
          {it.label}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 日付見出し（土=青 / 日=赤）
// ─────────────────────────────────────────────────────────────
function DateColorSpan({ date }: { date: Date }) {
  const dow = date.getDay();
  const color =
    dow === 0 ? 'var(--color-sun)' :
    dow === 6 ? 'var(--color-sat)' :
    'var(--color-text)';
  return (
    <span style={{ fontWeight: 700, fontSize: 16, color }}>
      {fmtHeading(date)}
    </span>
  );
}

const navBtn: React.CSSProperties = {
  padding: '6px 14px', background: 'var(--color-bg-sub)', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--color-text-sub)',
};
