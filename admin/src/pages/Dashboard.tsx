import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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
  }, []);

  async function fetchStats() {
    setLoading(true);
    const now = new Date();
    const todayStr = isoDay(now);
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    const tomorrowStr = isoDay(t);

    // +09:00必須（UTC解釈だと早朝予約が前日の集計に紛れる）
    const [todayRes, tomorrowRes] = await Promise.all([
      supabase
        .from('app_bookings')
        .select('store_id, status, deposit_status, menu:treatment_menu_id(price)')
        .gte('starts_at', `${todayStr}T00:00:00+09:00`)
        .lte('starts_at', `${todayStr}T23:59:59+09:00`),
      supabase
        .from('app_bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', ['confirmed', 'completed'])
        .gte('starts_at', `${tomorrowStr}T00:00:00+09:00`)
        .lte('starts_at', `${tomorrowStr}T23:59:59+09:00`),
    ]);

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

  const cards = [
    { label: `本日の予約（${STORE_NAMES.tamashima}）`, value: `${stats.todayByStore.tamashima}件`, color: '#C3003A' },
    { label: `本日の予約（${STORE_NAMES.kanamitsu}）`, value: `${stats.todayByStore.kanamitsu}件`, color: '#C3003A' },
    { label: '本日の来店完了', value: `${stats.todayCompleted}件`, color: '#388E3C' },
    { label: '本日売上見込み', value: `¥${stats.todayRevenue.toLocaleString()}`, color: '#B8860B' },
    { label: '前金未確認', value: `${stats.depositPending}件`, color: stats.depositPending > 0 ? '#E8590C' : '#999' },
    { label: '明日の予約', value: `${stats.tomorrowBookings}件`, color: '#1565C0' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#C3003A' }}>ダッシュボード</h1>
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#aaa' }}>読み込み中…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {cards.map((card) => (
            <div
              key={card.label}
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: 24,
                borderLeft: `4px solid ${card.color}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}
            >
              <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>{card.label}</div>
              <div style={{ fontSize: 30, fontWeight: 700, color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
