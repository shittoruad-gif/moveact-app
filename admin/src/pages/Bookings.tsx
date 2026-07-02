import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

type StoreId = 'tamashima' | 'kanamitsu';

const STORE_NAMES: Record<StoreId, string> = { tamashima: '玉島店', kanamitsu: '金光店' };

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  confirmed:  { label: '確定',     color: '#1B7A3C', bg: '#E8F5E9' },
  completed:  { label: '完了',     color: '#555',    bg: '#f0f0f0' },
  cancelled:  { label: 'キャンセル', color: '#999',   bg: '#f5f5f5' },
  no_show:    { label: '無断欠席', color: '#C62828', bg: '#FFEBEE' },
};

interface Booking {
  id: string;
  store_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  source: string;
  guest_name: string | null;
  guest_phone: string | null;
  is_first_visit: boolean;
  deposit_status: string;
  customer_request: string | null;
  menu: { name: string; duration_minutes: number; price: number } | null;
  staff: { full_name: string } | null;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function Bookings() {
  const todayDate = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const [date, setDate] = useState(todayDate);
  const [storeFilter, setStoreFilter] = useState<StoreId | 'all'>('all');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    const dayStr = isoDay(date);
    let query = supabase
      .from('app_bookings')
      .select(`
        id, store_id, starts_at, ends_at, status, source,
        guest_name, guest_phone, is_first_visit, deposit_status, customer_request,
        menu:treatment_menu_id(name, duration_minutes, price),
        staff:staff_id(full_name)
      `)
      // +09:00必須（UTC解釈だと早朝予約が前日の一覧に紛れる）
      .gte('starts_at', `${dayStr}T00:00:00+09:00`)
      .lte('starts_at', `${dayStr}T23:59:59+09:00`)
      .order('starts_at');

    if (storeFilter !== 'all') query = query.eq('store_id', storeFilter);

    const { data } = await query;
    setBookings((data as any) ?? []);
    setLoading(false);
  }, [date, storeFilter]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const handleCancel = async (id: string) => {
    if (!window.confirm('この予約をキャンセルしますか？')) return;
    setCancelling(id);
    const { error } = await supabase
      .from('app_bookings')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (!error) setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
    setCancelling(null);
  };

  const moveDate = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d);
  };

  const isToday = isoDay(date) === isoDay(todayDate);

  const active    = bookings.filter(b => b.status !== 'cancelled');
  const firstVisit = active.filter(b => b.is_first_visit);
  const returning  = active.filter(b => !b.is_first_visit);
  const cancelled  = bookings.filter(b => b.status === 'cancelled');

  return (
    <div>
      {/* タイトル行 */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20, gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#C3003A' }}>予約管理</h2>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {(['all', 'tamashima', 'kanamitsu'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStoreFilter(s)}
              style={{
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: storeFilter === s ? 700 : 400,
                background: storeFilter === s ? '#C3003A' : '#EAEAEC',
                color: storeFilter === s ? '#fff' : '#555',
                transition: 'all 0.15s',
              }}
            >{s === 'all' ? '全店' : STORE_NAMES[s as StoreId]}</button>
          ))}
        </div>
      </div>

      {/* 日付ナビゲーション */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24,
        background: '#fff', padding: '12px 20px', borderRadius: 12,
        boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
      }}>
        <button onClick={() => moveDate(-1)} style={navBtn}>‹ 前日</button>
        <button
          onClick={() => setDate(todayDate)}
          style={{ ...navBtn, background: isToday ? '#C3003A' : '#EAEAEC', color: isToday ? '#fff' : '#555' }}
        >今日</button>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: 17, color: '#C3003A' }}>
          {fmtDate(date)}
        </span>
        <span style={{ fontSize: 13, color: '#999' }}>{active.length}件</span>
        <button onClick={() => moveDate(1)} style={navBtn}>翌日 ›</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>読み込み中…</div>
      ) : (
        <>
          {/* ① 初回・新規（上部に強調表示） */}
          {firstVisit.length > 0 && (
            <SectionBlock
              title={`🆕 初回・新規のお客様（${firstVisit.length}件）`}
              borderColor="#E84C4C"
              headerBg="#FFF5F5"
            >
              {firstVisit.map(b => (
                <BookingCard key={b.id} b={b} onCancel={handleCancel} cancelling={cancelling} />
              ))}
            </SectionBlock>
          )}

          {/* ② 通常予約 */}
          {returning.length > 0 && (
            <SectionBlock
              title={`📋 本日の予約（${returning.length}件）`}
              borderColor="#C3003A"
              headerBg="#FCEFF3"
            >
              {returning.map(b => (
                <BookingCard key={b.id} b={b} onCancel={handleCancel} cancelling={cancelling} />
              ))}
            </SectionBlock>
          )}

          {/* ③ キャンセル済み */}
          {cancelled.length > 0 && (
            <SectionBlock title={`キャンセル済み（${cancelled.length}件）`} borderColor="#bbb" headerBg="#f8f8f8">
              {cancelled.map(b => (
                <BookingCard key={b.id} b={b} onCancel={() => {}} cancelling={null} showCancel={false} />
              ))}
            </SectionBlock>
          )}

          {bookings.length === 0 && (
            <div style={{ textAlign: 'center', padding: 80, color: '#bbb', fontSize: 15 }}>
              この日の予約はありません
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SectionBlock({ title, borderColor, headerBg, children }: {
  title: string; borderColor: string; headerBg: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        padding: '9px 16px', marginBottom: 10,
        background: headerBg, borderLeft: `4px solid ${borderColor}`,
        borderRadius: '0 8px 8px 0',
      }}>
        <span style={{ fontWeight: 700, color: borderColor, fontSize: 14 }}>{title}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  );
}

function BookingCard({ b, onCancel, cancelling, showCancel = true }: {
  b: Booking; onCancel: (id: string) => void; cancelling: string | null; showCancel?: boolean;
}) {
  const st = STATUS_MAP[b.status] ?? { label: b.status, color: '#555', bg: '#eee' };
  const isCancelled = b.status === 'cancelled';

  return (
    <div style={{
      background: isCancelled ? '#fafafa' : '#fff',
      borderRadius: 10, padding: '14px 18px',
      boxShadow: '0 1px 5px rgba(0,0,0,0.07)',
      display: 'flex', alignItems: 'center', gap: 16,
      opacity: isCancelled ? 0.65 : 1,
      borderLeft: b.is_first_visit && !isCancelled ? '3px solid #E84C4C' : '3px solid transparent',
    }}>
      {/* 時刻 */}
      <div style={{ minWidth: 72, textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 16, color: '#C3003A', letterSpacing: 0.5 }}>
          {fmtTime(b.starts_at)}
        </div>
        <div style={{ fontSize: 12, color: '#aaa' }}>〜{fmtTime(b.ends_at)}</div>
      </div>

      <div style={{ width: 1, height: 44, background: '#EAEAEC' }} />

      {/* メイン情報 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a' }}>
            {b.guest_name ?? '（名前未記入）'}
          </span>
          {b.is_first_visit && (
            <Tag label="初回" color="#fff" bg="#E84C4C" />
          )}
          {b.source === 'web' && <Tag label="WEB予約" color="#1565C0" bg="#E8F4FD" />}
          {b.source === 'staff' && <Tag label="手動入力" color="#5B4FBF" bg="#F3F0FF" />}
        </div>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 2 }}>
          {b.menu?.name ?? 'メニュー不明'}
          {b.staff?.full_name ? ` · ${b.staff.full_name}` : ''}
          {b.store_id in STORE_NAMES
            ? ` · ${STORE_NAMES[b.store_id as StoreId]}`
            : ''}
        </div>
        {b.guest_phone && (
          <div style={{ fontSize: 12, color: '#888' }}>{b.guest_phone}</div>
        )}
        {b.customer_request && (
          <div style={{ fontSize: 12, color: '#B8860B', marginTop: 3 }}>
            💬 {b.customer_request}
          </div>
        )}
      </div>

      {/* 右列: ステータス・前金・ボタン */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
        <span style={{
          fontSize: 12, fontWeight: 600, color: st.color,
          background: st.bg, padding: '2px 10px', borderRadius: 20,
        }}>{st.label}</span>
        {b.deposit_status === 'pending' && (
          <span style={{ fontSize: 11, color: '#E84C4C', fontWeight: 600 }}>前金未払い</span>
        )}
        {b.deposit_status === 'paid' && (
          <span style={{ fontSize: 11, color: '#388E3C', fontWeight: 600 }}>前金済み</span>
        )}
        {showCancel && b.status === 'confirmed' && (
          <button
            onClick={() => onCancel(b.id)}
            disabled={cancelling === b.id}
            style={{
              padding: '4px 12px', fontSize: 12, fontWeight: 600,
              border: '1px solid #E84C4C', color: '#E84C4C',
              background: '#fff', borderRadius: 6, cursor: 'pointer',
              opacity: cancelling === b.id ? 0.5 : 1,
            }}
          >{cancelling === b.id ? '処理中…' : 'キャンセル'}</button>
        )}
      </div>
    </div>
  );
}

function Tag({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color, background: bg,
      padding: '2px 7px', borderRadius: 10,
    }}>{label}</span>
  );
}

const navBtn: React.CSSProperties = {
  padding: '6px 14px', background: '#EAEAEC', border: 'none',
  borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#444',
};
