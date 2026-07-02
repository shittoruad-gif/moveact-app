import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

type StoreId = 'tamashima' | 'kanamitsu';

const STORE_NAMES: Record<StoreId, string> = { tamashima: '玉島店', kanamitsu: '金光店' };

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
  const [updating, setUpdating] = useState<string | null>(null);
  const [pendingOnly, setPendingOnly] = useState(false);

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
    if (!window.confirm('この予約をキャンセルします。よろしいですか？')) return;
    setCancelling(id);
    const { error } = await supabase
      .from('app_bookings')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (!error) setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
    setCancelling(null);
  };

  const handleStatusChange = async (id: string, status: 'completed' | 'no_show') => {
    const label = status === 'completed' ? '来店完了' : '無断キャンセル';
    if (!window.confirm(`この予約を「${label}」として記録します。よろしいですか？`)) return;
    setUpdating(id);
    const { error } = await supabase
      .from('app_bookings')
      .update({ status })
      .eq('id', id);
    if (!error) await fetchBookings();
    setUpdating(null);
  };

  const moveDate = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d);
  };

  const isToday = isoDay(date) === isoDay(todayDate);

  // 前金未確認のみフィルタ（当日の入金照合漏れ防止）
  const visible = pendingOnly ? bookings.filter(b => b.deposit_status === 'pending') : bookings;
  const active    = visible.filter(b => b.status !== 'cancelled');
  const firstVisit = active.filter(b => b.is_first_visit);
  const returning  = active.filter(b => !b.is_first_visit);
  const cancelled  = visible.filter(b => b.status === 'cancelled');
  const pendingCount = bookings.filter(b => b.deposit_status === 'pending' && b.status !== 'cancelled').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">予約管理</h2>
          <p className="page-help">本日の来店予定を確認し、来店・無断キャンセルの記録と前金の入金確認ができます。</p>
        </div>
      </div>

      {/* フィルタ */}
      <div className="toolbar" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="seg" title="表示する店舗を切り替えます">
          {(['all', 'tamashima', 'kanamitsu'] as const).map(s => (
            <button
              key={s}
              type="button"
              className={`seg-btn${storeFilter === s ? ' seg-btn--active' : ''}`}
              onClick={() => setStoreFilter(s)}
            >{s === 'all' ? '全店' : STORE_NAMES[s as StoreId]}</button>
          ))}
        </div>
        <div className="seg" style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className={`seg-btn${pendingOnly ? ' seg-btn--active' : ''}`}
            onClick={() => setPendingOnly(p => !p)}
            title="前金の入金確認が済んでいない予約だけを表示します"
          >前金未確認のみ表示{pendingCount > 0 ? `（${pendingCount}）` : ''}</button>
        </div>
      </div>

      {/* 日付ナビゲーション */}
      <div className="card card-pad day-nav" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button type="button" className="btn btn-sm" onClick={() => moveDate(-1)} title="前の日の予約を表示します">前日</button>
        <button
          type="button"
          className={`btn btn-sm${isToday ? ' btn-primary' : ''}`}
          onClick={() => setDate(todayDate)}
          title="今日の予約を表示します"
        >今日</button>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: 15 }}>
          {fmtDate(date)}
        </span>
        <span style={{ fontSize: 13, color: 'var(--sub)', fontVariantNumeric: 'tabular-nums' }}>{active.length}件</span>
        <button type="button" className="btn btn-sm" onClick={() => moveDate(1)} title="次の日の予約を表示します">翌日</button>
      </div>

      {loading ? (
        <div className="card card-pad" style={{ textAlign: 'center', color: 'var(--sub)' }}>読み込み中…</div>
      ) : (
        <>
          {/* ① 初回・新規 */}
          {firstVisit.length > 0 && (
            <BookingSection title={`初回・新規のお客様（${firstVisit.length}件）`}>
              {firstVisit.map(b => (
                <BookingRow key={b.id} b={b} onCancel={handleCancel} onStatusChange={handleStatusChange} cancelling={cancelling} updating={updating} />
              ))}
            </BookingSection>
          )}

          {/* ② 通常予約 */}
          {returning.length > 0 && (
            <BookingSection title={`本日の予約（${returning.length}件）`}>
              {returning.map(b => (
                <BookingRow key={b.id} b={b} onCancel={handleCancel} onStatusChange={handleStatusChange} cancelling={cancelling} updating={updating} />
              ))}
            </BookingSection>
          )}

          {/* ③ キャンセル済み */}
          {cancelled.length > 0 && (
            <BookingSection title={`キャンセル（${cancelled.length}件）`}>
              {cancelled.map(b => (
                <BookingRow key={b.id} b={b} onCancel={() => {}} onStatusChange={() => {}} cancelling={null} updating={null} showActions={false} />
              ))}
            </BookingSection>
          )}

          {visible.length === 0 && (
            <div className="card">
              <div className="empty">
                {pendingOnly
                  ? '前金未確認の予約はありません。すべての予約を見るには「前金未確認のみ表示」を解除してください。'
                  : 'この日の予約はありません。新規予約はタイムラインまたは新規予約ページから登録できます。'}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BookingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h3 style={{
        margin: 0, padding: '12px 20px', fontSize: 13, fontWeight: 600,
        color: 'var(--sub)', borderBottom: '1px solid var(--line)',
      }}>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'confirmed':
      return <span className="badge badge-green" title="確定済みの予約です">確定</span>;
    case 'completed':
      return <span className="badge badge-gray" title="来店が完了した予約です">完了</span>;
    case 'cancelled':
      return <span className="badge badge-gray" title="キャンセルされた予約です">キャンセル</span>;
    case 'no_show':
      return <span className="badge badge-red" title="無断キャンセルとして記録された予約です">無断キャンセル</span>;
    default:
      return <span className="badge badge-gray">{status}</span>;
  }
}

function BookingRow({ b, onCancel, onStatusChange, cancelling, updating, showActions = true }: {
  b: Booking;
  onCancel: (id: string) => void;
  onStatusChange: (id: string, status: 'completed' | 'no_show') => void;
  cancelling: string | null;
  updating: string | null;
  showActions?: boolean;
}) {
  const isCancelled = b.status === 'cancelled';
  const busy = cancelling === b.id || updating === b.id;

  const meta = [
    b.menu?.name ?? 'メニュー不明',
    b.staff?.full_name ?? null,
    b.store_id in STORE_NAMES ? STORE_NAMES[b.store_id as StoreId] : null,
    b.guest_phone ?? null,
  ].filter(Boolean).join(' / ');

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      padding: '12px 20px', borderBottom: '1px solid var(--line)',
      opacity: isCancelled ? 0.6 : 1,
    }}>
      {/* 時刻 */}
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
      </span>

      {/* 顧客名・メニュー・担当 */}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>{b.guest_name ?? '（名前未記入）'}</span>
          <span style={{ fontSize: 13, color: 'var(--sub)' }}>{meta}</span>
        </div>
        {b.customer_request && (
          <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 2 }} title="お客様からの要望です">
            要望: {b.customer_request}
          </div>
        )}
      </div>

      {/* バッジ群 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {b.is_first_visit && !isCancelled && (
          <span className="badge badge-red" title="初回来店のお客様です">初回</span>
        )}
        {b.source === 'web' && <span className="badge badge-gray" title="ネット予約から入った予約です">WEB予約</span>}
        {b.source === 'staff' && <span className="badge badge-gray" title="スタッフが手動で登録した予約です">手動入力</span>}
        <StatusBadge status={b.status} />
        {b.deposit_status === 'pending' && (
          <span className="badge badge-amber" title="前金の入金確認がまだ済んでいません">前金未確認</span>
        )}
        {(b.deposit_status === 'paid' || b.deposit_status === 'waived') && (
          <span className="badge badge-green" title="前金の確認が済んでいます">前金済</span>
        )}
      </div>

      {/* 操作 */}
      {showActions && b.status === 'confirmed' && (
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => onStatusChange(b.id, 'completed')}
            disabled={busy}
            title="この予約を来店完了として記録します"
          >{updating === b.id ? '処理中…' : '来店完了'}</button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => onStatusChange(b.id, 'no_show')}
            disabled={busy}
            title="この予約を無断キャンセルとして記録します"
          >無断</button>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => onCancel(b.id)}
            disabled={busy}
            title="この予約をキャンセルします"
          >{cancelling === b.id ? '処理中…' : 'キャンセル'}</button>
        </div>
      )}
    </div>
  );
}
