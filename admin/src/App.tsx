import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Cancellations } from './pages/Cancellations';
import { GroupLessons } from './pages/GroupLessons';
import type { Session } from '@supabase/supabase-js';

function Layout({ children }: { children: React.ReactNode }) {
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const navItems = [
    { to: '/', label: 'ダッシュボード', icon: '📊' },
    { to: '/cancellations', label: '当日キャンセル', icon: '❌' },
    { to: '/lessons', label: 'グループレッスン', icon: '🧘' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{ width: 240, background: '#1B3A5C', color: '#fff', padding: '24px 0', flexShrink: 0, position: 'relative' }}>
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
              background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
              borderLeft: isActive ? '3px solid #E8B44B' : '3px solid transparent',
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

      <main style={{ flex: 1, background: '#F5F1EC', padding: 32 }}>
        {children}
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>読み込み中...</div>;
  }

  if (!session) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/cancellations" element={<Cancellations />} />
          <Route path="/lessons" element={<GroupLessons />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
