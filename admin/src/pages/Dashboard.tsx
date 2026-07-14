import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { WeekBookingsChart, type DayCount } from '../components/Charts';

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
  const [loadError, setLoadError] = useState(false);
  const [week, setWeek] = useState<DayCount[]>([]);
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

    // 今後7日間（本日含む）の予約 → 店舗別に日次集計してグラフ表示
    //   AirReserveからの取込分（airreserve_events）も、移行期間中の実予約として含める。
    //   ただし「予定」「入れ替え時間」等の内部ブロックはお客様の予約ではないため除外。
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekWindow = { from: `${todayStr}T00:00:00+09:00`, to: `${isoDay(weekEnd)}T00:00:00+09:00` };
    let weekQ: any = supabase
      .from('app_bookings')
      .select('starts_at, store_id')
      .in('status', ['confirmed', 'completed'])
      .gte('starts_at', weekWindow.from)
      .lt('starts_at', weekWindow.to);
    if (mine) weekQ = weekQ.eq('staff_id', userId);
    let weekAirQ: any = supabase
      .from('airreserve_events')
      .select('starts_at, store_id, summary')
      .gte('starts_at', weekWindow.from)
      .lt('starts_at', weekWindow.to);
    if (mine) weekAirQ = weekAirQ.eq('staff_id', userId);

    const [todayRes, tomorrowRes, weekRes, weekAirRes] = await Promise.all([todayQ, tomorrowQ, weekQ, weekAirQ]);

    // 取得に失敗したら0件と紛らわしいので明示的にエラー表示へ
    if (todayRes.error || tomorrowRes.error || weekRes.error || weekAirRes.error) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    setLoadError(false);

    // 7日分の器を作って予約をJST日付で振り分け
    const days: DayCount[] = [];
    const WD = ['日', '月', '火', '水', '木', '金', '土'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const iso = isoDay(d);
      days.push({ iso, label: `${d.getMonth() + 1}/${d.getDate()}`, weekday: WD[d.getDay()], tamashima: 0, kanamitsu: 0 });
    }
    const addToDay = (starts_at: string, store_id: string) => {
      const jst = new Date(new Date(starts_at).getTime() + 9 * 3600 * 1000);
      const iso = jst.toISOString().slice(0, 10);
      const day = days.find((x) => x.iso === iso);
      if (day && (store_id === 'tamashima' || store_id === 'kanamitsu')) day[store_id as StoreId]++;
    };
    for (const b of ((weekRes.data as any) ?? []) as { starts_at: string; store_id: string }[]) {
      addToDay(b.starts_at, b.store_id);
    }
    const INTERNAL_BLOCKS = ['予定', '入れ替え時間'];
    for (const ev of ((weekAirRes.data as any) ?? []) as { starts_at: string; store_id: string; summary: string | null }[]) {
      if (INTERNAL_BLOCKS.includes((ev.summary ?? '').trim())) continue;
      addToDay(ev.starts_at, ev.store_id);
    }
    setWeek(days);

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
      ) : loadError ? (
        <div className="card card-pad" style={{ background: 'var(--red-weak)', color: 'var(--red)', fontSize: 13.5, lineHeight: 1.8 }}>
          データの取得に失敗しました。通信環境をご確認のうえ、ページを再読み込みしてください。
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-secondary" onClick={() => fetchStats()}>再読み込み</button>
          </div>
        </div>
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
            <div style={{ ...kpiLabelStyle, marginBottom: 10 }}>
              今後7日間のご予約{!isAdmin && '（あなたの担当分）'}
              <span style={{ fontWeight: 400, marginLeft: 8 }}>※AirReserveからの取込予約を含む</span>
            </div>
            {week.every((d) => d.tamashima + d.kanamitsu === 0) ? (
              <div className="empty" style={{ padding: '20px 10px' }}>今後7日間のご予約はまだありません。</div>
            ) : (
              <WeekBookingsChart days={week} single={!isAdmin} />
            )}
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
