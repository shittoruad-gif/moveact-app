import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Bookings } from './pages/Bookings';
import { NewBooking } from './pages/NewBooking';
import { Cancellations } from './pages/Cancellations';
import { GroupLessons } from './pages/GroupLessons';
import { Timeline } from './pages/Timeline';
import { StaffOff } from './pages/StaffOff';
import { StoreSettings } from './pages/StoreSettings';
import type { Session } from '@supabase/supabase-js';

function Layout({ children }: { children: React.ReactNode }) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { to: '/timeline', label: '予約表', icon: '📅' },
    { to: '/', label: 'ダッシュボード', icon: '📊' },
    { to: '/bookings', label: '予約管理', icon: '📋' },
    { to: '/new-booking', label: '手動予約入力', icon: '✏️' },
    { to: '/cancellations', label: '当日キャンセル', icon: '❌' },
    { to: '/lessons', label: 'グループレッスン', icon: '🧘' },
    { to: '/staff-off', label: 'スタッフ休み', icon: '🌙' },
    { to: '/store-settings', label: '店舗設定', icon: '⚙️' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 240, background: '#C3003A', color: '#fff', padding: '24px 0', flexShrink: 0, position: 'relative' }}>
        <div style={{ padding: '0 20px', marginBottom: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Moveact</h2>
          <p style={{ fontSize: 11, opacity: 0.6, margin: '4px 0 0' }}>管理画面</p>
        </div>

        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 20px',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: isActive ? 600 : 400,
              background: isActive ? 'rgba(255,255,255,0.18)' : 'transparent',
              borderLeft: isActive ? '3px solid #fff' : '3px solid transparent',
            })}
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, padding: '0 20px' }}>
          <button
            onClick={handleLogout}
            style={{ width: '100%', padding: 10, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
          >
            ログアウト
          </button>
        </div>
      </nav>

      <main style={{ flex: 1, background: '#F5F5F7', padding: 32 }}>
        {children}
      </main>
    </div>
  );
}

// 画面アクセス権ガード: profiles.role が staff/admin のみ許可
type RoleState = 'checking' | 'allowed' | 'denied';

function AccessDenied() {
  const handleLogout = async () => { await supabase.auth.signOut(); };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F5F7' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, width: 420, boxShadow: '0 2px 12px rgba(0,0,0,0.1)', textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#C3003A', marginBottom: 12 }}>アクセス権限がありません</h1>
        <p style={{ color: '#555', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          この管理画面はスタッフ・管理者のみ利用できます。<br />
          権限が必要な場合は管理者にお問い合わせください。
        </p>
        <button
          onClick={handleLogout}
          style={{ width: '100%', padding: 12, background: '#C3003A', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          ログアウト
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<RoleState>('checking');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // session確立後に role を検証（staff/admin以外は弾く）
  useEffect(() => {
    if (!session) { setRole('checking'); return; }
    let cancelled = false;
    setRole('checking');
    supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        if (data && ['staff', 'admin'].includes((data as { role: string }).role)) {
          setRole('allowed');
        } else {
          setRole('denied');
        }
      });
    return () => { cancelled = true; };
  }, [session]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>読み込み中...</div>;
  }

  if (!session) {
    return <Login />;
  }

  if (role === 'checking') {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>権限を確認中...</div>;
  }

  if (role === 'denied') {
    return <AccessDenied />;
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/new-booking" element={<NewBooking />} />
          <Route path="/cancellations" element={<Cancellations />} />
          <Route path="/lessons" element={<GroupLessons />} />
          <Route path="/staff-off" element={<StaffOff />} />
          <Route path="/store-settings" element={<StoreSettings />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
