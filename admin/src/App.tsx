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
import { StaffPerformance } from './pages/StaffPerformance';
import { UpdateHistory } from './pages/UpdateHistory';
import { DemoMode } from './pages/demo/DemoMode';
import { BookingLinks } from './pages/BookingLinks';
import { MenuManager } from './pages/MenuManager';
import { AuthContext, useAuth } from './lib/auth';
import type { Session } from '@supabase/supabase-js';

// ナビ用インラインSVGアイコン（16px・ストローク・currentColor）
const ICON_PATHS = {
  timeline: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </>
  ),
  dashboard: (
    <>
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M8 17v-3M13 17V5M18 17V9" />
    </>
  ),
  bookings: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </>
  ),
  newBooking: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12h8M12 8v8" />
    </>
  ),
  cancel: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m4.9 4.9 14.2 14.2" />
    </>
  ),
  group: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  staffOff: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  settings: (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  chart: (
    <>
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="12" y1="20" x2="12" y2="8" />
      <line x1="18" y1="20" x2="18" y2="11" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  demo: (
    <>
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
} as const;

type IconName = keyof typeof ICON_PATHS;

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="nav-icon"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

const NAV_ITEMS: { to: string; label: string; icon: IconName; title: string; adminOnly?: boolean }[] = [
  { to: '/timeline', label: '予約表', icon: 'timeline', title: '1日の予約をスタッフ別の時間軸で確認します' },
  { to: '/', label: 'ダッシュボード', icon: 'dashboard', title: '本日の予約件数など店舗の概況を確認します' },
  { to: '/bookings', label: '予約管理', icon: 'bookings', title: '予約を一覧で検索・確認します' },
  { to: '/new-booking', label: '手動予約入力', icon: 'newBooking', title: '電話や店頭で受けた予約を登録します' },
  { to: '/cancellations', label: '当日キャンセル', icon: 'cancel', title: '当日のキャンセル・無断キャンセルを記録します' },
  { to: '/lessons', label: 'グループレッスン', icon: 'group', title: 'グループレッスンの枠と参加者を管理します' },
  { to: '/staff-off', label: 'スタッフ休み', icon: 'staffOff', title: 'スタッフの休みを登録します' },
  { to: '/store-settings', label: '店舗設定', icon: 'settings', title: '営業時間・臨時休業を設定します（管理者のみ）', adminOnly: true },
  { to: '/performance', label: 'スタッフ成績・歩合', icon: 'chart', title: 'リピート率などの成績と、売上に対する歩合給を集計します' },
  { to: '/history', label: '更新履歴', icon: 'history', title: '予約・休みの登録/変更/削除の履歴（誰がいつ操作したか）を確認します' },
  { to: '/booking-links', label: '予約リンク', icon: 'link', title: 'スタッフ別・店舗別のネット予約URLを確認してコピーできます' },
  { to: '/menus', label: 'メニュー管理', icon: 'settings', title: 'メニューの追加・編集と、メニューごとの予約URL発行（管理者のみ）', adminOnly: true },
  { to: '/demo', label: '練習モード', icon: 'demo', title: '本物そっくりの画面で操作を練習できます（保存されません）' },
];

// 「使い方」ヘルプモーダル
function HelpModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pages = [
    { name: '予約表', desc: '1日の予約をスタッフ別の時間軸で確認できます。予約をクリックすると詳細の確認・変更ができます。' },
    { name: 'ダッシュボード', desc: '本日の予約件数など、店舗の状況をまとめて確認できます。' },
    { name: '予約管理', desc: '予約を一覧で検索・確認できます。過去の予約もこちらで探せます。' },
    { name: '手動予約入力', desc: '電話や店頭で受けた予約を登録します。' },
    { name: '当日キャンセル', desc: '当日のキャンセルや無断キャンセルを記録します。' },
    { name: 'グループレッスン', desc: 'グループレッスンの枠と参加者を管理します。' },
    { name: 'スタッフ休み', desc: 'スタッフの休みを登録します。登録した時間帯は予約を受け付けません。' },
    { name: '店舗設定', desc: '営業時間・メニュー・スタッフ情報など、店舗の基本設定を変更します。' },
  ];

  const tips = [
    { q: '予約の時間や担当を変えたいときは', a: '予約表で該当の予約をクリックして編集します。' },
    { q: '電話で予約を受けたときは', a: '手動予約入力から登録します。' },
    { q: 'お客様が連絡なく来なかったときは', a: '当日キャンセルで「無断キャンセル」として記録します。' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="help-modal-title">この管理画面の使い方</h3>
        </div>
        <div className="modal-body">
          <dl className="help-dl">
            {pages.map((p) => (
              <div key={p.name}>
                <dt>{p.name}</dt>
                <dd>{p.desc}</dd>
              </div>
            ))}
          </dl>
          <p className="help-section-title">困ったときは</p>
          <dl className="help-dl">
            {tips.map((t) => (
              <div key={t.q}>
                <dt>{t.q}</dt>
                <dd>{t.a}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

function Layout({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { isAdmin } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // 管理者のみの項目（店舗設定）は一般スタッフには出さない
  const navItems = NAV_ITEMS.filter((item) => isAdmin || !item.adminOnly);

  return (
    <div className="app">
      <nav className="sidenav" aria-label="メインメニュー">
        <div className="sidenav-brand">
          MOVEACT
          <span>管理画面</span>
        </div>

        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={item.title}
            className={({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link')}
          >
            <NavIcon name={item.icon} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="app-body">
        <header className="app-header">
          <div className="app-header-title">Moveact 管理</div>
          <div className="app-header-right">
            <span className="app-header-user" title="ログイン中のアカウント">
              {userEmail}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setHelpOpen(true)}
              title="各ページの用途を確認できます"
            >
              使い方
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
              ログアウト
            </button>
          </div>
        </header>

        <main className="app-content">{children}</main>
      </div>

      {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

// 画面アクセス権ガード: profiles.role が staff/admin のみ許可
type RoleState = 'checking' | 'allowed' | 'denied';

function AccessDenied() {
  const handleLogout = async () => { await supabase.auth.signOut(); };
  return (
    <div className="login-page">
      <div className="login-card card card-pad">
        <h1 className="login-logo">
          MOVEACT <span>管理</span>
        </h1>
        <p className="login-sub">スタッフ・管理者専用の管理画面です</p>
        <div className="note" role="alert" style={{ marginBottom: 16 }}>
          このアカウントには管理画面のアクセス権限がありません。
          権限が必要な場合は管理者にお問い合わせください。
        </div>
        <button type="button" className="btn btn-secondary" style={{ width: '100%' }} onClick={handleLogout}>
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
  const [isAdmin, setIsAdmin] = useState(false);

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
        const r = (data as { role: string } | null)?.role;
        if (r === 'staff' || r === 'admin') {
          setRole('allowed');
          setIsAdmin(r === 'admin');
        } else {
          setRole('denied');
          setIsAdmin(false);
        }
      });
    return () => { cancelled = true; };
  }, [session]);

  if (loading) {
    return <div className="app-loading">読み込んでいます…</div>;
  }

  if (!session) {
    return <Login />;
  }

  if (role === 'checking') {
    return <div className="app-loading">権限を確認しています…</div>;
  }

  if (role === 'denied') {
    return <AccessDenied />;
  }

  return (
    <AuthContext.Provider value={{ userId: session.user.id, isAdmin }}>
      <BrowserRouter>
        <Layout userEmail={session.user.email ?? ''}>
          <Routes>
            <Route path="/timeline" element={<Timeline />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="/bookings" element={<Bookings />} />
            <Route path="/new-booking" element={<NewBooking />} />
            <Route path="/cancellations" element={<Cancellations />} />
            <Route path="/lessons" element={<GroupLessons />} />
            <Route path="/staff-off" element={<StaffOff />} />
            {/* 店舗設定は管理者のみ。一般スタッフは / に戻す */}
            <Route path="/store-settings" element={isAdmin ? <StoreSettings /> : <Navigate to="/" />} />
            <Route path="/performance" element={<StaffPerformance />} />
            <Route path="/history" element={<UpdateHistory />} />
            <Route path="/booking-links" element={<BookingLinks />} />
            <Route path="/menus" element={isAdmin ? <MenuManager /> : <Navigate to="/" />} />
            <Route path="/demo" element={<DemoMode />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthContext.Provider>
  );
}
