import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function Dashboard() {
  const [stats, setStats] = useState({
    todayBookings: 0,
    activeTickets: 0,
    pendingOrders: 0,
    activeSubscriptions: 0,
  });

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [bookings, tickets, orders, subs] = await Promise.all([
      supabase.from('group_lesson_bookings').select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .gte('booked_at', today.toISOString())
        .lt('booked_at', tomorrow.toISOString()),
      supabase.from('user_tickets').select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabase.from('orders').select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase.from('user_subscriptions').select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
    ]);

    setStats({
      todayBookings: bookings.count ?? 0,
      activeTickets: tickets.count ?? 0,
      pendingOrders: orders.count ?? 0,
      activeSubscriptions: subs.count ?? 0,
    });
  }

  const cards = [
    { label: '本日の予約', value: stats.todayBookings, color: '#1B3A5C' },
    { label: '有効な回数券', value: stats.activeTickets, color: '#E8B44B' },
    { label: '未処理注文', value: stats.pendingOrders, color: '#F57C00' },
    { label: 'アクティブサブスク', value: stats.activeSubscriptions, color: '#388E3C' },
  ];

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>ダッシュボード</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
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
            <div style={{ fontSize: 32, fontWeight: 700, color: card.color }}>{card.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
