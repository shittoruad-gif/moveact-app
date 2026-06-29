import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────
// サロンボード風タイムライン予約表（admin独自実装）
//   縦軸: 営業時間を15分=18pxの行に。横軸: スタッフ列。
//   4クエリ並列ロード: roster / business_hours / app_bookings / staff_unavailability
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
  const [loading, setLoading] = useState(false);

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
    const lo = `${dayStr}T00:00:00`;
    const hi = `${dayStr}T23:59:59`;

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
        id, store_id, staff_id, starts_at, ends_at, status, source,
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

    const [r, h, c, b, u] = await Promise.all([rosterQ, hoursQ, closedQ, bookingsQ, unavailQ]);

    setRoster((r.data as RosterRow[]) ?? []);
    setHours((h.data as BusinessHoursRow[]) ?? []);
    setClosedDays((c.data as ClosedDayRow[]) ?? []);
    setBookings((b.data as unknown as BookingRow[]) ?? []);
    setUnavail((u.data as UnavailRow[]) ?? []);
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
            dow={dow}
            isToday={isToday}
            nowMin={nowMin}
            dayStr={dayStr}
          />
        ))
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 店舗ごとのボード
// ─────────────────────────────────────────────────────────────
function StoreBoard({
  store, showStoreLabel, roster, hours, closedDays, bookings, unavail, dow, isToday, nowMin, dayStr,
}: {
  store: StoreId;
  showStoreLabel: boolean;
  roster: RosterRow[];
  hours: BusinessHoursRow[];
  closedDays: ClosedDayRow[];
  bookings: BookingRow[];
  unavail: UnavailRow[];
  dow: number;
  isToday: boolean;
  nowMin: number;
  dayStr: string;
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

  // この店舗の予約・非稼働
  const storeBookings = bookings.filter(b => b.store_id === store);
  const storeUnavail = unavail.filter(u => u.store_id === store);

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

                  {/* 予約ブロック */}
                  {colBookings.map(b => (
                    <ReservationBlock key={b.id} b={b} openMin={openMin} closeMin={closeMin} />
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
function ReservationBlock({ b, openMin, closeMin }: { b: BookingRow; openMin: number; closeMin: number }) {
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
      title={`${fmtClock(b.starts_at)} ${b.guest_name ?? ''} / ${b.menu?.name ?? ''}`}
      style={{
        position: 'absolute', top, left: 2, right: 2, height: height - 2,
        background: bg, borderLeft: `3px solid ${accent}`,
        borderRadius: 4, boxSizing: 'border-box',
        padding: '2px 5px', overflow: 'hidden', zIndex: 1,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        opacity: isCancelled ? 0.6 : 1,
        cursor: 'default', lineHeight: 1.3,
      }}
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
