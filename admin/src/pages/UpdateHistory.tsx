import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AuditRow {
  id: string;
  at: string;
  actor_name: string;
  action: string;   // create | update | delete
  entity: string;   // booking | staff_off | store_closed
  store_id: string | null;
  summary: string;
}

type EntityFilter = 'all' | 'staff_off' | 'store_closed' | 'booking';
type ActionFilter = 'all' | 'delete' | 'update' | 'create';

const ENTITY_LABEL: Record<string, string> = { booking: '予約', staff_off: 'スタッフ休み', store_closed: '臨時休業' };
const ACTION_LABEL: Record<string, string> = { create: '登録', update: '変更', delete: '削除' };

function fmtJst(iso: string): string {
  const j = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const p = (n: number) => String(n).padStart(2, '0');
  const w = ['日', '月', '火', '水', '木', '金', '土'][j.getDay()];
  // 月・日ともゼロ埋めなしで統一（例: 7/5(日) 14:03）
  return `${j.getMonth() + 1}/${j.getDate()}(${w}) ${p(j.getHours())}:${p(j.getMinutes())}`;
}

export function UpdateHistory() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entity, setEntity] = useState<EntityFilter>('all');
  const [action, setAction] = useState<ActionFilter>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      let q: any = supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(300);
      if (entity !== 'all') q = q.eq('entity', entity);
      if (action !== 'all') q = q.eq('action', action);
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        setError('履歴の取得に失敗しました。時間をおいて再度お試しください。');
        setRows([]);
      } else {
        setRows((data as AuditRow[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [entity, action]);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">更新履歴</h1>
        <p className="page-help">
          予約・スタッフ休み・臨時休業の「登録／変更／削除」を、いつ・誰が行ったかの記録です。
          <strong>予約を止めていた休み（ブロック）が誰かに削除された</strong>場合も、ここの「削除」の記録から操作者が分かります。
        </p>
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap', marginBottom: 14, gap: 8 }}>
        <div className="seg" role="tablist" aria-label="種類">
          <button className={`seg-btn ${entity === 'all' ? 'seg-btn--active' : ''}`} onClick={() => setEntity('all')}>すべて</button>
          <button className={`seg-btn ${entity === 'staff_off' ? 'seg-btn--active' : ''}`} onClick={() => setEntity('staff_off')}>スタッフ休み</button>
          <button className={`seg-btn ${entity === 'store_closed' ? 'seg-btn--active' : ''}`} onClick={() => setEntity('store_closed')}>臨時休業</button>
          <button className={`seg-btn ${entity === 'booking' ? 'seg-btn--active' : ''}`} onClick={() => setEntity('booking')}>予約</button>
        </div>
        <div className="seg" role="tablist" aria-label="操作">
          <button className={`seg-btn ${action === 'all' ? 'seg-btn--active' : ''}`} onClick={() => setAction('all')}>全操作</button>
          <button className={`seg-btn ${action === 'delete' ? 'seg-btn--active' : ''}`} onClick={() => setAction('delete')}>削除のみ</button>
          <button className={`seg-btn ${action === 'update' ? 'seg-btn--active' : ''}`} onClick={() => setAction('update')}>変更のみ</button>
        </div>
      </div>

      {loading ? (
        <div className="empty">読み込み中です…</div>
      ) : error ? (
        <div className="empty" style={{ color: 'var(--red)' }}>{error}</div>
      ) : rows.length === 0 ? (
        <div className="empty">該当する履歴はまだありません。</div>
      ) : (
        <div className="card card-pad">
          {/* スマホでも横スクロールなしで全情報が読めるよう、表ではなくリスト形式で表示 */}
          <div>
            {rows.map((r) => (
              <div key={r.id} style={{ padding: '10px 2px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--sub)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtJst(r.at)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.actor_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--sub)' }}>{ENTITY_LABEL[r.entity] ?? r.entity}</span>
                  <span className={`badge ${r.action === 'delete' ? 'badge-red' : r.action === 'update' ? 'badge-amber' : 'badge-green'}`}>
                    {ACTION_LABEL[r.action] ?? r.action}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.7, overflowWrap: 'anywhere' }}>{r.summary}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--sub)', marginTop: 10 }}>
            ※ 最新300件を表示しています。「操作者」がネット予約/システムのものは、お客様のネット予約や自動処理による変更です。
          </p>
        </div>
      )}
    </div>
  );
}

