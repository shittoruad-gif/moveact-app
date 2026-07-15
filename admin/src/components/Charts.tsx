import { useState } from 'react';

// =====================================================================
// 軽量SVGチャート（外部ライブラリなし）
//   配色は検証済み: 店舗2系列 #2D6FB5/#A6293F、売上2段 #8E2136/#C75D72
//   （CVD分離・コントラスト・彩度をdatavizバリデータでPASS確認）
// =====================================================================

const STORE_COLORS: Record<string, string> = { tamashima: '#2D6FB5', kanamitsu: '#A6293F' };
const STORE_LABELS: Record<string, string> = { tamashima: '玉島店', kanamitsu: '金光店' };
const SALES_DARK = '#8E2136';   // 歩合給
const SALES_LIGHT = '#C75D72';  // 売上（歩合以外）

interface Tip { x: number; y: number; lines: string[] }

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div style={{
      position: 'absolute', left: tip.x + 12, top: tip.y - 8, zIndex: 5, pointerEvents: 'none',
      background: 'var(--ink)', color: '#fff', borderRadius: 8, padding: '7px 10px',
      fontSize: 12, lineHeight: 1.6, whiteSpace: 'nowrap', boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
    }}>
      {tip.lines.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 700 } : undefined}>{l}</div>)}
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--sub)' }}>
      <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------
// 今後7日間の予約数（縦棒・店舗積み上げ）
//   single=true のときは自分の担当分のみ（1系列・凡例なし）
// ---------------------------------------------------------------------
export interface DayCount {
  iso: string;        // YYYY-MM-DD
  label: string;      // 7/15
  weekday: string;    // 水
  tamashima: number;
  kanamitsu: number;
}

export function WeekBookingsChart({ days, single }: { days: DayCount[]; single?: boolean }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const W = 560, H = 190, PAD_L = 26, PAD_B = 34, PAD_T = 18;
  const plotW = W - PAD_L - 8, plotH = H - PAD_T - PAD_B;
  const max = Math.max(1, ...days.map((d) => d.tamashima + d.kanamitsu));
  const step = plotW / days.length;
  const barW = Math.min(40, step * 0.52);
  const yOf = (v: number) => PAD_T + plotH * (1 - v / max);

  // Y目盛りは2本だけ（控えめなグリッド）
  const ticks = max <= 2 ? [1, 2].slice(0, max) : [Math.ceil(max / 2), max];

  const onEnter = (e: React.MouseEvent, d: DayCount) => {
    const host = (e.currentTarget as SVGElement).closest('div')!.getBoundingClientRect();
    const total = d.tamashima + d.kanamitsu;
    setTip({
      x: e.clientX - host.left, y: e.clientY - host.top,
      lines: single
        ? [`${d.label}（${d.weekday}）`, `ご予約 ${total}件`]
        : [`${d.label}（${d.weekday}）`, `玉島店 ${d.tamashima}件 ・ 金光店 ${d.kanamitsu}件`, `合計 ${total}件`],
    });
  };

  return (
    <div style={{ position: 'relative' }}>
      {!single && (
        <div style={{ display: 'flex', gap: 14, marginBottom: 6 }}>
          <LegendSwatch color={STORE_COLORS.tamashima} label={STORE_LABELS.tamashima} />
          <LegendSwatch color={STORE_COLORS.kanamitsu} label={STORE_LABELS.kanamitsu} />
        </div>
      )}
      {/* スマホでは縮めず横スクロール（縮小するとラベルが読めなくなる） */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 520, height: 'auto', display: 'block' }} role="img" aria-label="今後7日間の予約数">
        {/* 控えめなグリッドと目盛り */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={W - 8} y1={yOf(t)} y2={yOf(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD_L - 6} y={yOf(t) + 4} textAnchor="end" fontSize={10.5} fill="var(--sub)">{t}</text>
          </g>
        ))}
        <line x1={PAD_L} x2={W - 8} y1={yOf(0)} y2={yOf(0)} stroke="var(--border, #CCC)" strokeWidth={1} />

        {days.map((d, i) => {
          const cx = PAD_L + step * i + step / 2;
          const x = cx - barW / 2;
          const total = d.tamashima + d.kanamitsu;
          const tH = plotH * (d.tamashima / max);
          const kH = plotH * (d.kanamitsu / max);
          const gap = d.tamashima > 0 && d.kanamitsu > 0 ? 2 : 0;   // 積み上げ境界の2pxスペーサー
          const isWeekend = d.weekday === '土' || d.weekday === '日';
          return (
            <g key={d.iso}
              onMouseEnter={(e) => onEnter(e, d)} onMouseMove={(e) => onEnter(e, d)} onMouseLeave={() => setTip(null)}>
              {/* ヒット領域（マークより大きく） */}
              <rect x={PAD_L + step * i} y={PAD_T} width={step} height={plotH + PAD_B} fill="transparent" />
              {/* 下段=玉島（基線側は角丸なし） */}
              {d.tamashima > 0 && (
                <path d={roundedTopBar(x, yOf(0) - tH, barW, tH, d.kanamitsu > 0 ? 0 : 4)} fill={STORE_COLORS.tamashima} />
              )}
              {/* 上段=金光（データ端=上を4px角丸） */}
              {d.kanamitsu > 0 && (
                <path d={roundedTopBar(x, yOf(0) - tH - gap - kH, barW, kH, 4)} fill={STORE_COLORS.kanamitsu} />
              )}
              {/* 合計の直接ラベル（0は出さない） */}
              {total > 0 && (
                <text x={cx} y={yOf(0) - tH - kH - gap - 5} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--ink)">{total}</text>
              )}
              <text x={cx} y={H - 18} textAnchor="middle" fontSize={11} fill="var(--sub)">{d.label}</text>
              <text x={cx} y={H - 5} textAnchor="middle" fontSize={10}
                fill={isWeekend ? (d.weekday === '土' ? 'var(--color-sat, #1769C0)' : 'var(--color-sun, #D32F4A)') : 'var(--sub)'}>
                {d.weekday}
              </text>
            </g>
          );
        })}
      </svg>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

// 上端だけ角丸の縦棒パス
function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

// ---------------------------------------------------------------------
// スタッフ別売上（横棒・歩合給を内訳表示）
// ---------------------------------------------------------------------
export interface SalesItem { name: string; sales: number; commission: number | null }

export function SalesBarChart({ items }: { items: SalesItem[] }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const max = Math.max(1, ...items.map((i) => i.sales));
  const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;

  const onEnter = (e: React.MouseEvent, it: SalesItem) => {
    const host = (e.currentTarget as HTMLElement).closest('.sales-chart')!.getBoundingClientRect();
    setTip({
      x: e.clientX - host.left, y: e.clientY - host.top,
      lines: [it.name, `売上 ${yen(it.sales)}`, it.commission == null ? '歩合なし（代表）' : `うち歩合給 ${yen(it.commission)}`],
    });
  };

  return (
    <div className="sales-chart" style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
        <LegendSwatch color={SALES_DARK} label="歩合給" />
        <LegendSwatch color={SALES_LIGHT} label="売上（歩合以外）" />
      </div>
      <div style={{ display: 'grid', gap: 9 }}>
        {items.map((it) => {
          const pct = it.sales / max;
          const comPct = it.sales > 0 && it.commission ? it.commission / it.sales : 0;
          return (
            <div key={it.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}
              onMouseEnter={(e) => onEnter(e, it)} onMouseMove={(e) => onEnter(e, it)} onMouseLeave={() => setTip(null)}>
              <div style={{ width: 64, fontSize: 12.5, color: 'var(--ink)', flexShrink: 0, textAlign: 'right' }}>{it.name}</div>
              <div style={{ flex: 1, height: 18, display: 'flex', alignItems: 'center', gap: 2 }}>
                {it.sales > 0 ? (
                  <>
                    {comPct > 0 && (
                      <div style={{ width: `${pct * comPct * 100}%`, minWidth: 3, height: 18, background: SALES_DARK, borderRadius: comPct >= 1 ? 4 : '4px 0 0 4px' }} />
                    )}
                    <div style={{ width: `${pct * (1 - comPct) * 100}%`, minWidth: 3, height: 18, background: SALES_LIGHT, borderRadius: comPct > 0 ? '0 4px 4px 0' : 4 }} />
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)', marginLeft: 6, whiteSpace: 'nowrap' }}>{yen(it.sales)}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>¥0</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}
