import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      </div>
    </div>
  );
}
