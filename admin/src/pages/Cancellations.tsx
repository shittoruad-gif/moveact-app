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

const CHARGE_CONFIRM: Record<'ticket' | 'stripe' | 'waive', string> = {
  ticket: 'この予約をキャンセルし、回数券を1回分消化します。よろしいですか？',
  stripe: 'この予約をキャンセルし、Stripeでキャンセル料を請求します。よろしいですか？',
  waive: 'この予約をキャンセルします。キャンセル料は請求しません（免除）。よろしいですか？',
};

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
    if (!window.confirm(CHARGE_CONFIRM[chargeType])) return;
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
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">当日キャンセル管理</h2>
          <p className="page-help">本日実施予定のレッスン予約に対して、当日キャンセルの処理（回数券消化・Stripe請求・免除）ができます。</p>
        </div>
      </div>

      <div className="card">
        {bookings.length === 0 ? (
          <div className="empty">
            本日実施の予約はありません。当日キャンセルの処理が必要な予約が入ると、ここに表示されます。
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>実施日時</th>
                <th>顧客名</th>
                <th>電話番号</th>
                <th>レッスン</th>
                <th>料金</th>
                <th>ステータス</th>
                <th>キャンセル処理</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {(b.group_lesson as any)?.starts_at
                      ? new Date((b.group_lesson as any).starts_at).toLocaleString('ja-JP', {
                          month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
                        })
                      : '-'}
                  </td>
                  <td>{(b.profile as any)?.full_name ?? '-'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{(b.profile as any)?.phone ?? '-'}</td>
                  <td>{(b.group_lesson as any)?.title ?? '-'}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>¥{((b.group_lesson as any)?.price ?? 0).toLocaleString()}</td>
                  <td>
                    {b.status === 'confirmed'
                      ? <span className="badge badge-green" title="確定済みの予約です">確定</span>
                      : <span className="badge badge-gray">{b.status}</span>}
                  </td>
                  <td>
                    {b.status === 'confirmed' && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleCancel(b.id, 'ticket')}
                          disabled={processing === b.id}
                          title="キャンセルし、回数券を1回分消化します"
                        >{processing === b.id ? '処理中…' : '回数券消化'}</button>
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => handleCancel(b.id, 'stripe')}
                          disabled={processing === b.id}
                          title="キャンセルし、Stripeでキャンセル料を請求します"
                        >Stripe請求</button>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleCancel(b.id, 'waive')}
                          disabled={processing === b.id}
                          title="キャンセル料を請求せずにキャンセル処理します"
                        >免除</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
