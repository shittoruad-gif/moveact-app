import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// クライアント一覧
// =====================================================
// 予約が入ると自動で登録されるクライアントリスト（booking_customers）。
//   - 名前・フリガナ・電話で絞り込み
//   - フリガナ・メモはその場で編集できる（電話・メールは予約時に自動更新）
//   - 「予約を入れる」でお客様情報が入った状態の手動予約入力へ移動

interface Row {
  id: string;
  name: string;
  name_kana: string | null;
  phone: string | null;
  email: string | null;
  note: string | null;
  source: string;
  updated_at: string;
}

const SOURCE_LABEL: Record<string, string> = {
  web: 'ネット予約', manual: '手動登録', airreserve: 'AirReserve',
};

export function Customers() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');

  // 編集中の行
  const [editId, setEditId] = useState<string | null>(null);
  const [editKana, setEditKana] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('booking_customers')
      .select('id, name, name_kana, phone, email, note, source, updated_at')
      .order('name_kana', { ascending: true, nullsFirst: false });
    if (error) {
      setError('クライアント一覧の読み込みに失敗しました。');
      setRows([]);
    } else {
      setError(null);
      setRows((data as Row[]) ?? []);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = q.trim();
    if (!term) return rows;
    const digits = term.replace(/\D/g, '');
    return rows.filter((r) =>
      r.name.includes(term) ||
      (r.name_kana ?? '').includes(term) ||
      (digits.length >= 3 && (r.phone ?? '').replace(/\D/g, '').includes(digits))
    );
  }, [rows, q]);

  const startEdit = (r: Row) => {
    setEditId(r.id); setEditKana(r.name_kana ?? ''); setEditNote(r.note ?? '');
  };
  const saveEdit = async () => {
    if (!editId) return;
    setSaving(true);
    const { error } = await supabase
      .from('booking_customers')
      .update({ name_kana: editKana.trim() || null, note: editNote.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', editId);
    setSaving(false);
    if (error) { setError('保存に失敗しました。もう一度お試しください。'); return; }
    setEditId(null);
    await load();
  };

  const goBooking = (r: Row) => {
    const p = new URLSearchParams();
    p.set('name', r.name);
    if (r.phone) p.set('phone', r.phone);
    if (r.email) p.set('email', r.email);
    navigate(`/new-booking?${p.toString()}`);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">クライアント一覧</h2>
        <p className="page-help">
          一度でも予約が入ったお客様は、ここに自動で登録されます（ネット予約・手動予約とも）。
          <strong>「予約を入れる」</strong>を押すと、お客様情報が入力済みの状態で手動予約入力へ移動します。
          フリガナとメモはこの画面で編集できます。
        </p>
      </div>

      {error && <div className="note note-red" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <input
          type="text" className="input"
          placeholder="名前・フリガナ・電話番号で絞り込み"
          value={q} onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <span style={{ marginLeft: 12, fontSize: 13, color: 'var(--sub)' }}>
          {filtered.length} / {rows.length} 名
        </span>
      </div>

      {loading ? (
        <div className="card"><div className="empty">読み込み中です…</div></div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="empty">該当するお客様がいません。</div></div>
      ) : (
        <div className="card card-pad">
          {filtered.map((r) => (
            <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--sub)' }}>
                    {r.name_kana || 'フリガナ未登録'}・{SOURCE_LABEL[r.source] ?? r.source}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'var(--sub)' }}>
                  <div>{r.phone || '電話未登録'}</div>
                  <div style={{ wordBreak: 'break-all' }}>{r.email || ''}</div>
                  {r.note && <div style={{ color: 'var(--text)', marginTop: 2 }}>メモ: {r.note}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => goBooking(r)}>
                    予約を入れる
                  </button>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(r)}>
                    編集
                  </button>
                </div>
              </div>

              {editId === r.id && (
                <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label className="field-label">フリガナ</label>
                    <input type="text" className="input" value={editKana}
                      placeholder="ヤマダハナコ" onChange={(e) => setEditKana(e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0, flex: 1, minWidth: 200 }}>
                    <label className="field-label">メモ（お客様には見えません）</label>
                    <input type="text" className="input" value={editNote}
                      placeholder="例：腰痛で通院中／回数券あり" onChange={(e) => setEditNote(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-sm btn-primary" disabled={saving} onClick={saveEdit}>
                    {saving ? '保存中…' : '保存'}
                  </button>
                  <button type="button" className="btn btn-sm btn-secondary" onClick={() => setEditId(null)}>
                    やめる
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
