import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // パスワード再設定（本人がメールでリセットリンクを受け取る）
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [resetSent, setResetSent] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(
        error.message.toLowerCase().includes('invalid login credentials')
          ? 'メールアドレスかパスワードが違います。ご確認のうえ、もう一度お試しください。'
          : 'ログインできませんでした。しばらく時間をおいて、もう一度お試しください。'
      );
    }
    setLoading(false);
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResetMsg('');
    const { data, error } = await supabase.functions.invoke('staff-password-reset', {
      body: { email },
    });
    if (error && !data) {
      setError('送信に失敗しました。メールアドレスをご確認のうえ、もう一度お試しください。');
    } else {
      setResetSent(true);
      setResetMsg(
        (data?.message as string) ??
          'ご登録のメールアドレス宛にリセット用のリンクをお送りしました（数分お待ちください）。'
      );
    }
    setLoading(false);
  }

  return (
    <div className="login-page">
      <div className="login-card card card-pad">
        <h1 className="login-logo">
          MOVEACT <span>管理</span>
        </h1>
        <p className="login-sub">スタッフ・管理者専用の管理画面です</p>

        {error && (
          <div className="note note-red" role="alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {mode === 'login' && (
          <>
            <form onSubmit={handleLogin} style={{ display: 'grid', gap: 16 }}>
              <div className="field">
                <label className="field-label" htmlFor="login-email">メールアドレス</label>
                <input
                  id="login-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="login-password">パスワード</label>
                <input
                  id="login-password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
                {loading ? 'ログインしています…' : 'ログインする'}
              </button>
            </form>

            <button
              type="button"
              className="btn-link"
              style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 0 }}
              onClick={() => { setMode('forgot'); setError(''); setResetSent(false); setResetMsg(''); }}
            >
              パスワードをお忘れの方はこちら
            </button>
          </>
        )}

        {mode === 'forgot' && (
          <>
            {resetSent ? (
              <div className="note" style={{ background: 'var(--green-weak)', color: 'var(--green)', marginBottom: 16 }}>
                {resetMsg}
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--sub)' }}>
                  メールが届かない場合は、迷惑メールフォルダをご確認ください。それでも届かないときは、店長にお伝えください。
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgot} style={{ display: 'grid', gap: 16 }}>
                <p className="page-help" style={{ margin: 0 }}>
                  ご登録のメールアドレスを入力してください。パスワードを再設定するためのリンクをメールでお送りします。
                </p>
                <div className="field">
                  <label className="field-label" htmlFor="forgot-email">メールアドレス</label>
                  <input
                    id="forgot-email"
                    className="input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
                  {loading ? '送信しています…' : 'リセットリンクを送る'}
                </button>
              </form>
            )}

            <button
              type="button"
              className="btn-link"
              style={{ marginTop: 16, background: 'none', border: 'none', color: 'var(--sub)', cursor: 'pointer', fontSize: 13, padding: 0 }}
              onClick={() => { setMode('login'); setError(''); }}
            >
              ← ログイン画面に戻る
            </button>
          </>
        )}
      </div>
    </div>
  );
}
