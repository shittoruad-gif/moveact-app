import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type StoreFilter = 'all' | 'tamashima' | 'kanamitsu';

interface PerfRow {
  staff_id: string;
  staff_name: string;
  commission_rate: number | null;
  completed: number;
  cancelled: number;
  noshow: number;
  sales: number;
  avg_price: number;
  repeat_visits: number;
  nominated_repeat: number;
  new_customers: number;
  commission: number | null;
}

// 当月の YYYY-MM
function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// YYYY-MM → JSTの月初/翌月初 ISO
function monthRange(ym: string): { start: string; end: string } {
  const [y, m] = ym.split('-').map(Number);
  const startY = y, startM = m;
  const endY = m === 12 ? y + 1 : y;
  const endM = m === 12 ? 1 : m + 1;
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${startY}-${p(startM)}-01T00:00:00+09:00`,
    end: `${endY}-${p(endM)}-01T00:00:00+09:00`,
  };
}
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`;
const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—');

export function StaffPerformance() {
  const [month, setMonth] = useState<string>(thisMonth());
  const [store, setStore] = useState<StoreFilter>('all');
  const [rows, setRows] = useState<PerfRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { start, end } = monthRange(month);
      const { data, error } = await supabase.rpc('get_staff_performance', {
        p_start: start,
        p_end: end,
        p_store: store === 'all' ? null : store,
      });
      if (cancelled) return;
      if (error) {
        setError('集計の取得に失敗しました。時間をおいて再度お試しください。');
        setRows([]);
      } else {
        setRows((data as PerfRow[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [month, store]);

  const totalSales = useMemo(() => rows.reduce((s, r) => s + Number(r.sales || 0), 0), [rows]);
  const totalCommission = useMemo(
    () => rows.reduce((s, r) => s + Number(r.commission || 0), 0),
    [rows],
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">スタッフ成績・歩合</h1>
        <p className="page-help">
          月ごとに、各スタッフのリピート率やキャンセル状況（がんばりや課題）と、売上に対する歩合給を集計します。
          売上は<strong>来店完了</strong>したメニュー料金の合計です。
        </p>
      </div>

      {/* 期間・店舗フィルタ */}
      <div className="toolbar" style={{ flexWrap: 'wrap', marginBottom: 16, alignItems: 'center', gap: 12 }}>
        <label style={{ fontSize: 13, color: 'var(--sub)' }}>対象月</label>
        <input type="month" className="select" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 170 }} />
        <div className="seg" role="tablist" aria-label="店舗">
          <button className={`seg-btn ${store === 'all' ? 'seg-btn--active' : ''}`} onClick={() => setStore('all')}>全店</button>
          <button className={`seg-btn ${store === 'tamashima' ? 'seg-btn--active' : ''}`} onClick={() => setStore('tamashima')}>玉島店</button>
          <button className={`seg-btn ${store === 'kanamitsu' ? 'seg-btn--active' : ''}`} onClick={() => setStore('kanamitsu')}>金光店</button>
        </div>
      </div>

      {loading ? (
        <div className="empty">読み込み中です…</div>
      ) : error ? (
        <div className="empty">{error}</div>
      ) : (
        <>
          {/* ① 歩合給集計 */}
          <div className="card card-pad" style={{ marginBottom: 18 }}>
            <div style={sectionTitle}>歩合給の集計</div>
            <p style={noteStyle}>歩合給 ＝ 売上 × 歩合率。三上（代表）は歩合なし（売上のみ算定）です。</p>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>スタッフ</th>
                    <th style={thR}>売上（来店完了）</th>
                    <th style={thR}>歩合率</th>
                    <th style={thR}>歩合給</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.staff_id}>
                      <td style={td}>{r.staff_name}</td>
                      <td style={tdR}>{yen(Number(r.sales))}</td>
                      <td style={tdR}>{r.commission_rate == null ? '—' : `${Number(r.commission_rate)}%`}</td>
                      <td style={{ ...tdR, fontWeight: 700, color: 'var(--ink)' }}>
                        {r.commission_rate == null ? (
                          <span style={{ color: 'var(--sub)', fontWeight: 400 }}>歩合なし</span>
                        ) : (
                          yen(Number(r.commission))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ ...td, fontWeight: 700 }}>合計</td>
                    <td style={{ ...tdR, fontWeight: 700 }}>{yen(totalSales)}</td>
                    <td style={tdR}></td>
                    <td style={{ ...tdR, fontWeight: 700, color: 'var(--accent)' }}>{yen(totalCommission)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ② スタッフ分析 */}
          <div className="card card-pad">
            <div style={sectionTitle}>スタッフ分析（がんばり・課題の見える化）</div>
            <p style={noteStyle}>
              <span className="badge badge-green">リピート率</span> が高いほど、お客様に選ばれてリピートされています。
              <span className="badge badge-red" style={{ marginLeft: 6 }}>無断率</span> や
              <span className="badge badge-amber" style={{ marginLeft: 6 }}>キャンセル率</span> が高いときは、フォローの余地があるサインです。
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>スタッフ</th>
                    <th style={thR}>来店完了</th>
                    <th style={thR}>売上</th>
                    <th style={thR}>平均単価</th>
                    <th style={thR}>リピート率</th>
                    <th style={thR}>指名リピート</th>
                    <th style={thR}>新規</th>
                    <th style={thR}>キャンセル率</th>
                    <th style={thR}>無断率</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const outcomes = r.completed + r.cancelled + r.noshow;
                    const rep = r.completed > 0 ? r.repeat_visits / r.completed : 0;
                    const cancelR = outcomes > 0 ? r.cancelled / outcomes : 0;
                    const noshowR = outcomes > 0 ? r.noshow / outcomes : 0;
                    return (
                      <tr key={r.staff_id}>
                        <td style={td}>{r.staff_name}</td>
                        <td style={tdR}>{r.completed}件</td>
                        <td style={tdR}>{yen(Number(r.sales))}</td>
                        <td style={tdR}>{r.completed > 0 ? yen(Number(r.avg_price)) : '—'}</td>
                        <td style={tdR}>
                          {r.completed > 0 ? (
                            <span className={rep >= 0.5 ? 'badge badge-green' : 'badge'}>{pct(r.repeat_visits, r.completed)}</span>
                          ) : '—'}
                        </td>
                        <td style={tdR}>{r.completed > 0 ? pct(r.nominated_repeat, r.completed) : '—'}</td>
                        <td style={tdR}>{r.new_customers}人</td>
                        <td style={tdR}>
                          {outcomes > 0 ? (
                            <span className={cancelR >= 0.2 ? 'badge badge-amber' : ''}>{pct(r.cancelled, outcomes)}</span>
                          ) : '—'}
                        </td>
                        <td style={tdR}>
                          {outcomes > 0 ? (
                            <span className={noshowR > 0 ? 'badge badge-red' : ''}>{pct(r.noshow, outcomes)}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p style={{ ...noteStyle, marginTop: 12 }}>
              ・<strong>リピート率</strong>＝来店完了のうち、そのお客様にとって2回目以降だった割合。<br />
              ・<strong>指名リピート</strong>＝同じスタッフへ再来されたお客様の割合。<br />
              ・<strong>新規</strong>＝その月に初めて来店されたお客様の人数。<br />
              ※ 売上・件数は「来店完了」にしたものが対象です。予約表で来店の記録を付けると反映されます。
            </p>
          </div>
        </>
      )}
    </div>
  );
}

const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 };
const noteStyle: React.CSSProperties = { fontSize: 12.5, color: 'var(--sub)', margin: '0 0 12px', lineHeight: 1.7 };
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 640 };
const th: React.CSSProperties = { textAlign: 'left', padding: '9px 12px', borderBottom: '2px solid var(--line)', color: 'var(--sub)', fontWeight: 700, whiteSpace: 'nowrap', fontSize: 12.5 };
const thR: React.CSSProperties = { ...th, textAlign: 'right' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--line)', color: 'var(--ink)', whiteSpace: 'nowrap' };
const tdR: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
