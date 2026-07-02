import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Booking {
  id: string;
  user_id: string;
  status: string;
  booked_at: string;
  group_lesson: {
    id: string;
    title: string;
    starts_at: string;
    price: number;
  };
  profile: {
    full_name: string;
    phone: string;
  };
}

function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function Cancellations() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetchTodayBookings();
  }, []);

  async function fetchTodayBookings() {
    const dayStr = isoDay(new Date());

    const { data } = await supabase
      .from('group_lesson_bookings')
      .select(`
        id, user_id, status, booked_at,
        group_lesson:group_lessons!inner(id, title, starts_at, price),
        profile:profiles!user_id(full_name, phone)
      `)
      .eq('status', 'confirmed')
      // 「今日作成された予約」ではなく「実施日が今日」の予約を対象にする（+09:00のJST日窓必須）
      .gte('group_lesson.starts_at', `${dayStr}T00:00:00+09:00`)
      .lte('group_lesson.starts_at', `${dayStr}T23:59:59+09:00`);

    const rows = (((data as any) ?? []) as Booking[]).slice();
    rows.sort((a, b) =>
      new Date((a.group_lesson as any)?.starts_at ?? 0).getTime() -
      new Date((b.group_lesson as any)?.starts_at ?? 0).getTime()
    );
    setBookings(rows);
  }

  async function handleCancel(bookingId: string, chargeType: 'ticket' | 'stripe' | 'waive') {
    setProcessing(bookingId);
    const { data: { session } } = await supabase.auth.getSession();

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-booking`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          bookingId,
          chargeType,
          note: `管理画面からの当日キャンセル処理 (${chargeType})`,
        }),
      }
    );

    const result = await res.json();
    if (result.success) {
      alert('キャンセル処理が完了しました');
      fetchTodayBookings();
    } else {
      alert(`エラー: ${result.error}`);
    }
    setProcessing(null);
  }

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>当日キャンセル管理</h1>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', borderRadius: 8, overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#C3003A', color: '#fff' }}>
            <th style={thStyle}>顧客名</th>
            <th style={thStyle}>電話番号</th>
            <th style={thStyle}>レッスン</th>
            <th style={thStyle}>実施日時</th>
            <th style={thStyle}>料金</th>
            <th style={thStyle}>ステータス</th>
            <th style={thStyle}>キャンセル処理</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={tdStyle}>{(b.profile as any)?.full_name ?? '-'}</td>
              <td style={tdStyle}>{(b.profile as any)?.phone ?? '-'}</td>
              <td style={tdStyle}>{(b.group_lesson as any)?.title ?? '-'}</td>
              <td style={tdStyle}>
                {(b.group_lesson as any)?.starts_at
                  ? new Date((b.group_lesson as any).starts_at).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
                    })
                  : '-'}
              </td>
              <td style={tdStyle}>¥{((b.group_lesson as any)?.price ?? 0).toLocaleString()}</td>
              <td style={tdStyle}>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  background: b.status === 'confirmed' ? '#E8F5E9' : '#FFEBEE',
                  color: b.status === 'confirmed' ? '#388E3C' : '#D32F2F',
                }}>
                  {b.status === 'confirmed' ? '確定' : b.status}
                </span>
              </td>
              <td style={tdStyle}>
                {b.status === 'confirmed' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleCancel(b.id, 'ticket')}
                      disabled={processing === b.id}
                      style={{ ...btnStyle, background: '#E8B44B' }}
                    >
                      回数券消化
                    </button>
                    <button
                      onClick={() => handleCancel(b.id, 'stripe')}
                      disabled={processing === b.id}
                      style={{ ...btnStyle, background: '#D32F2F' }}
                    >
                      Stripe請求
                    </button>
                    <button
                      onClick={() => handleCancel(b.id, 'waive')}
                      disabled={processing === b.id}
                      style={{ ...btnStyle, background: '#999' }}
                    >
                      免除
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {bookings.length === 0 && (
            <tr>
              <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: '#999' }}>
                本日実施の予約はありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 13,
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 14,
};

const btnStyle: React.CSSProperties = {
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  padding: '6px 12px',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
};
