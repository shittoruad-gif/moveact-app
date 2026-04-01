import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface GroupLesson {
  id: string;
  store_id: string;
  title: string;
  instructor_name: string;
  starts_at: string;
  ends_at: string;
  max_capacity: number;
  current_bookings: number;
  price: number;
  is_cancelled: boolean;
}

export function GroupLessons() {
  const [lessons, setLessons] = useState<GroupLesson[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    store_id: 'kanamitsu',
    title: '',
    instructor_name: '',
    starts_at: '',
    ends_at: '',
    max_capacity: 8,
    price: 3000,
  });

  useEffect(() => {
    fetchLessons();
  }, []);

  async function fetchLessons() {
    const { data } = await supabase
      .from('group_lessons')
      .select('*')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at');
    setLessons((data as GroupLesson[]) ?? []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from('group_lessons').insert({
      ...form,
      is_ticket_eligible: true,
      is_cancelled: false,
    });
    setShowForm(false);
    setForm({ store_id: 'kanamitsu', title: '', instructor_name: '', starts_at: '', ends_at: '', max_capacity: 8, price: 3000 });
    fetchLessons();
  }

  async function handleCancel(lessonId: string) {
    if (!confirm('このレッスンをキャンセルしますか？')) return;
    await supabase.from('group_lessons').update({ is_cancelled: true }).eq('id', lessonId);
    fetchLessons();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>グループレッスン管理</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ background: '#1B3A5C', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}
        >
          + レッスン追加
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: '#fff', borderRadius: 12, padding: 24, marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>店舗</label>
            <select value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })} style={inputStyle}>
              <option value="kanamitsu">金光店</option>
              <option value="tamashima">玉島店</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>レッスン名</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>インストラクター</label>
            <input value={form.instructor_name} onChange={(e) => setForm({ ...form, instructor_name: e.target.value })} style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>定員</label>
            <input type="number" value={form.max_capacity} onChange={(e) => setForm({ ...form, max_capacity: Number(e.target.value) })} style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>開始日時</label>
            <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>終了日時</label>
            <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} style={inputStyle} required />
          </div>
          <div>
            <label style={labelStyle}>料金 (円)</label>
            <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} style={inputStyle} required />
          </div>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button type="submit" style={{ background: '#388E3C', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, cursor: 'pointer' }}>
              作成
            </button>
          </div>
        </form>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#1B3A5C', color: '#fff' }}>
            <th style={thStyle}>店舗</th>
            <th style={thStyle}>レッスン名</th>
            <th style={thStyle}>インストラクター</th>
            <th style={thStyle}>日時</th>
            <th style={thStyle}>予約/定員</th>
            <th style={thStyle}>料金</th>
            <th style={thStyle}>操作</th>
          </tr>
        </thead>
        <tbody>
          {lessons.map((l) => (
            <tr key={l.id} style={{ borderBottom: '1px solid #eee', opacity: l.is_cancelled ? 0.5 : 1 }}>
              <td style={tdStyle}>{l.store_id === 'kanamitsu' ? '金光店' : '玉島店'}</td>
              <td style={tdStyle}>{l.title}</td>
              <td style={tdStyle}>{l.instructor_name}</td>
              <td style={tdStyle}>{new Date(l.starts_at).toLocaleString('ja-JP')}</td>
              <td style={tdStyle}>{l.current_bookings}/{l.max_capacity}</td>
              <td style={tdStyle}>¥{l.price.toLocaleString()}</td>
              <td style={tdStyle}>
                {!l.is_cancelled ? (
                  <button onClick={() => handleCancel(l.id)} style={{ color: '#D32F2F', background: 'none', border: '1px solid #D32F2F', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer' }}>
                    キャンセル
                  </button>
                ) : (
                  <span style={{ color: '#D32F2F', fontSize: 12 }}>キャンセル済</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 };
const thStyle: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '12px 16px', fontSize: 14 };
