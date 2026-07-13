import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type StoreId = 'tamashima' | 'kanamitsu';

const STORE_NAMES: Record<StoreId, string> = { tamashima: '玉島店', kanamitsu: '金光店' };

interface TodayBooking {
  store_id: string;
  status: string;
  deposit_status: string;
  menu: { price: number } | null;
}

function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function Dashboard() {
  const { userId, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todayByStore: { tamashima: 0, kanamitsu: 0 } as Record<StoreId, number>,
    todayCompleted: 0,
    todayRevenue: 0,
    depositPending: 0,
    tomorrowBookings: 0,
  });

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, userId]);

  async function fetchStats() {
    setLoading(true);
    const now = new Date();
    const todayStr = isoDay(now);
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    const tomorrowStr = isoDay(t);

    // 一般スタッフは自分の担当分のみ（管理者は店舗全体）
    const mine = !isAdmin && !!userId;

    // +09:00必須（UTC解釈だと早朝予約が前日の集計に紛れる）
    let todayQ: any = supabase
      .from('app_bookings')
      .select('store_id, status, deposit_status, menu:treatment_menu_id(price)')
      .gte('starts_at', `${todayStr}T00:00:00+09:00`)
      .lte('starts_at', `${todayStr}T23:59:59+09:00`);
    if (mine) todayQ = todayQ.eq('staff_id', userId);

    let tomorrowQ: any = supabase
      .from('app_bookings')
      .select('id', { count: 'exact', head: true })
      .in('status', ['confirmed', 'completed'])
      .gte('starts_at', `${tomorrowStr}T00:00:00+09:00`)
      .lte('starts_at', `${tomorrowStr}T23:59:59+09:00`);
    if (mine) tomorrowQ = tomorrowQ.eq('staff_id', userId);

    const [todayRes, tomorrowRes] = await Promise.all([todayQ, tomorrowQ]);

    const today = ((todayRes.data as any) ?? []) as TodayBooking[];
    const activeToday = today.filter(b => b.status === 'confirmed' || b.status === 'completed');

    const todayByStore: Record<StoreId, number> = { tamashima: 0, kanamitsu: 0 };
    for (const b of activeToday) {
      if (b.store_id === 'tamashima' || b.store_id === 'kanamitsu') {
        todayByStore[b.store_id as StoreId]++;
      }
    }

    setStats({
      todayByStore,
      todayCompleted: today.filter(b => b.status === 'completed').length,
      todayRevenue: activeToday.reduce((sum, b) => sum + (b.menu?.price ?? 0), 0),
      depositPending: today.filter(b => b.deposit_status === 'pending' && b.status !== 'cancelled').length,
      tomorrowBookings: tomorrowRes.count ?? 0,
    });
    setLoading(false);
  }

  const todayTotal = stats.todayByStore.tamashima + stats.todayByStore.kanamitsu;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">ダッシュボード</h1>
        <p className="page-help">
          {isAdmin
            ? '今日の店舗の状況をひと目で確認できます。'
            : '今日のあなたの担当分をひと目で確認できます。（店舗全体は管理者が確認します）'}
        </p>
      </div>

      {loading ? (
        <div className="empty">読み込み中です…</div>
      ) : (
        <>
          <div style={kpiGridStyle}>
            <div className="card card-pad" title="本日の確定・完了予約の合計です">
              <div style={kpiLabelStyle}>本日の予約</div>
              <div style={kpiValueStyle}>{todayTotal}件</div>
              <div style={kpiSubStyle}>
                {STORE_NAMES.tamashima} {stats.todayByStore.tamashima}件・{STORE_NAMES.kanamitsu} {stats.todayByStore.kanamitsu}件
              </div>
            </div>

            <div className="card card-pad" title="本日、来店が完了した予約の件数です">
              <div style={kpiLabelStyle}>本日の来店完了</div>
              <div style={kpiValueStyle}>{stats.todayCompleted}件</div>
            </div>

            <div className="card card-pad" title="本日の確定・完了予約のメニュー料金の合計です">
              <div style={kpiLabelStyle}>本日売上見込み</div>
              <div style={kpiValueStyle}>¥{stats.todayRevenue.toLocaleString()}</div>
            </div>

            <div
              className="card card-pad"
              style={stats.depositPending > 0 ? { background: 'var(--amber-weak)' } : undefined}
              title="前金の入金がまだ確認できていない本日の予約の件数です"
            >
              <div style={kpiLabelStyle}>前金未確認</div>
              <div style={stats.depositPending > 0 ? { ...kpiValueStyle, color: 'var(--amber)' } : kpiValueStyle}>
                {stats.depositPending}件
              </div>
              {stats.depositPending > 0 && (
                <div style={kpiSubStyle}>
                  <Link to="/bookings" style={{ color: 'var(--amber)' }}>
                    予約管理で入金を確認してください
                  </Link>
                </div>
              )}
            </div>

            <div className="card card-pad" title="明日の確定・完了予約の件数です">
              <div style={kpiLabelStyle}>明日の予約</div>
              <div style={kpiValueStyle}>{stats.tomorrowBookings}件</div>
            </div>
          </div>

          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div style={{ ...kpiLabelStyle, marginBottom: 12 }}>よく使う操作</div>
            <div className="toolbar" style={{ flexWrap: 'wrap' }}>
              <Link to="/timeline" className="btn btn-secondary">タイムラインを開く</Link>
              <Link to="/new-booking" className="btn btn-secondary">新規予約を登録する</Link>
              <Link to="/staff-off" className="btn btn-secondary">スタッフの休みを登録する</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 16,
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--sub)',
  marginBottom: 8,
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 600,
  color: 'var(--ink)',
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.2,
};

const kpiSubStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--sub)',
  marginTop: 6,
};
