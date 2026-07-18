import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import type { StoreId, Menu, Slot } from '../lib/api';
import { getAvailableSlots, nextDays } from '../lib/api';

interface Props {
  storeId: StoreId;
  menu: Menu;
  staffId: string | null;
  date: string | null;
  time: string | null;
  error?: string | null;   // 送信エラー（枠が先に埋まった等）。日付を選び直すと親側でクリアされる
  onSelectDate: (iso: string) => void;
  onSelectTime: (time: string) => void;
}

// 表示できる範囲（4週間ぶん）。7日ずつのウィンドウで表示する。
// ※ nextDays(28) はコンポーネント内で算出する（モジュール読み込み時に固定すると、
//   タブを開いたまま日付が変わったとき先頭が「昨日」のまま残るため）。
const DAYS_PER_PAGE = 7;
const ROW_STEP = 15;                       // サーバーは15分刻みで返すので取りこぼし防止に15分行
const FALLBACK = { open: '09:00', close: '21:00' };
const CACHE_TTL_MS = 60_000;               // 空き状況キャッシュの有効期限（長時間滞在での陳腐化を防止）

type DayState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'closed' }
  | { status: 'ok'; slots: Map<string, Slot>; open: string; close: string };

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export function DateTimeStep({ storeId, menu, staffId, date, time, error, onSelectDate, onSelectTime }: Props) {
  const [page, setPage] = useState(0);
  const [dayData, setDayData] = useState<Record<string, DayState>>({});
  const [fetchErr, setFetchErr] = useState<string | null>(null);   // 空き状況の取得エラー案内
  // キャッシュ: storeId|menuId|staffId|iso → {DayState, 取得時刻}（横スクロール/週送りの再取得を抑制）
  const cache = useRef<Map<string, { st: DayState; at: number }>>(new Map());

  // 予約可能な28日分。日時ステップへ入るたびに算出し直す（日跨ぎの先頭ズレ防止）。
  const ALL_DAYS = useMemo(() => nextDays(28), []);

  const maxPage = Math.ceil(ALL_DAYS.length / DAYS_PER_PAGE) - 1;
  const visibleDays = ALL_DAYS.slice(page * DAYS_PER_PAGE, page * DAYS_PER_PAGE + DAYS_PER_PAGE);
  const cacheKey = (iso: string) => `${storeId}|${menu.id}|${staffId ?? ''}|${iso}`;

  // メニュー/店舗/担当が変わったらキャッシュごと破棄して全再取得
  useEffect(() => {
    cache.current = new Map();
    setDayData({});
  }, [storeId, menu.id, staffId]);

  // 表示中の7日のうち未取得の日を並列フェッチ
  useEffect(() => {
    let cancelled = false;
    // 未取得の日に加え、前回エラーだった日も対象にする（週送りで自然に再試行できる）
    const missing = visibleDays.filter((d) => !dayData[d.iso] || dayData[d.iso].status === 'error');
    if (missing.length === 0) return;

    setDayData((prev) => {
      const next = { ...prev };
      missing.forEach((d) => { next[d.iso] = { status: 'loading' }; });
      return next;
    });
    setFetchErr(null);   // 再取得を始めたら案内をリセット（失敗すれば再表示）

    missing.forEach(async (d) => {
      const key = cacheKey(d.iso);
      const cached = cache.current.get(key);
      if (cached && Date.now() - cached.at <= CACHE_TTL_MS) {
        if (!cancelled) setDayData((prev) => ({ ...prev, [d.iso]: cached.st }));
        return;
      }
      try {
        const r = await getAvailableSlots({ storeId, menuId: menu.id, date: d.iso, staffId });
        const st: DayState = r.isClosed
          ? { status: 'closed' }
          : {
              status: 'ok',
              slots: new Map((r.slots ?? []).map((s) => [s.time, s])),
              open: r.businessHours?.open ?? FALLBACK.open,
              close: r.businessHours?.close ?? FALLBACK.close,
            };
        cache.current.set(key, { st, at: Date.now() });
        if (!cancelled) setDayData((prev) => ({ ...prev, [d.iso]: st }));
      } catch {
        if (!cancelled) {
          setDayData((prev) => ({ ...prev, [d.iso]: { status: 'error' } }));
          setFetchErr('一部の空き状況を取得できませんでした。電波の良い場所で、週の切り替えなどで再読み込みをお試しください。');
        }
      }
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDays.map((d) => d.iso).join(','), storeId, menu.id, staffId]);

  // 時刻軸（行）= 表示中の取得済みの日の営業時間の和集合。未取得時はフォールバック。
  const okDays = visibleDays
    .map((d) => dayData[d.iso])
    .filter((s): s is Extract<DayState, { status: 'ok' }> => !!s && s.status === 'ok');
  const openMin = okDays.length ? Math.min(...okDays.map((s) => toMin(s.open))) : toMin(FALLBACK.open);
  const closeMin = okDays.length ? Math.max(...okDays.map((s) => toMin(s.close))) : toMin(FALLBACK.close);

  const rows: number[] = [];
  for (let m = openMin; m < closeMin; m += ROW_STEP) rows.push(m);

  // セルの表示状態を決める（×はクライアントで自前展開）
  function cellOf(iso: string, rowMin: number): { cls: string; sym: string; clickable: boolean } {
    const st = dayData[iso];
    if (!st || st.status === 'loading') return { cls: 'load', sym: '·', clickable: false };
    if (st.status === 'error') return { cls: 'off', sym: '!', clickable: false };
    if (st.status === 'closed') return { cls: 'off', sym: '休', clickable: false };
    // ok
    if (rowMin < toMin(st.open) || rowMin >= toMin(st.close)) return { cls: 'off', sym: '−', clickable: false };
    const slot = st.slots.get(toHHMM(rowMin));
    if (!slot) return { cls: 'full', sym: '×', clickable: false };
    if (slot.level === '◎' || slot.level === '○') return { cls: 'ok', sym: '○', clickable: true };
    return { cls: 'few', sym: '△', clickable: true };  // △ = 残りわずか
  }

  const first = visibleDays[0];
  const last = visibleDays[visibleDays.length - 1];

  return (
    <div>
      <h2 className="heading">ご希望の日時</h2>
      {error && <div className="banner-err">{error}</div>}
      {!error && fetchErr && <div className="banner-err">{fetchErr}</div>}
      {/* 店舗キャパ=同時1件のため「△残りわずか」の段階表示は廃止（サーバーは常に○を返す） */}
      <p className="lead">空いているお時間（○）をお選びください。</p>
      <div className="cal-legend">
        <span><b className="g">○</b> 空きあり</span>
        <span><b className="x">×</b> 満席</span>
        <span><b className="d">−</b> 受付時間外</span>
      </div>


      <div className="cal-nav">
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>‹ 前の7日</button>
        <span className="lbl">{first?.label}（{first?.weekday}）〜{last?.label}（{last?.weekday}）</span>
        <button onClick={() => setPage((p) => Math.min(maxPage, p + 1))} disabled={page >= maxPage}>次の7日 ›</button>
      </div>

      <div className="cal-scroll">
        <div className="cal-grid" style={{ gridTemplateColumns: `46px repeat(${visibleDays.length}, minmax(46px, 1fr))` }}>
          {/* ヘッダー行 */}
          <div className="cal-corner" />
          {visibleDays.map((d) => (
            <div key={d.iso} className={`cal-dayhead ${d.weekday === '土' ? 'sat' : ''} ${d.weekday === '日' ? 'sun' : ''}`}>
              <div className="wd">{d.weekday}</div>
              <div className="dy">{d.label.split('/')[1]}</div>
            </div>
          ))}

          {/* 時刻 × 日付セル */}
          {rows.map((rowMin) => {
            const isHour = rowMin % 60 === 0;
            return (
              <Fragment key={rowMin}>
                <div className={`cal-time ${isHour ? 'hour' : ''}`}>{rowMin % 30 === 0 ? toHHMM(rowMin) : ''}</div>
                {visibleDays.map((d) => {
                  const c = cellOf(d.iso, rowMin);
                  const selected = date === d.iso && time === toHHMM(rowMin);
                  return (
                    <button
                      key={d.iso + rowMin}
                      className={`cal-cell ${c.cls} ${isHour ? 'hour' : ''} ${selected ? 'on' : ''}`}
                      disabled={!c.clickable}
                      aria-label={`${d.label} ${toHHMM(rowMin)} ${c.cls === 'ok' ? '空きあり' : c.cls === 'few' ? '残りわずか' : c.cls === 'full' ? '満席' : '受付不可'}`}
                      onClick={() => { onSelectDate(d.iso); onSelectTime(toHHMM(rowMin)); }}
                    >
                      {c.sym}
                    </button>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>

    </div>
  );
}
