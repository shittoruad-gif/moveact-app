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
      setError(error.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F1EC' }}>
      <form onSubmit={handleLogin} style={{ background: '#fff', borderRadius: 16, padding: 40, width: 400, boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#1B3A5C', textAlign: 'center', marginBottom: 8 }}>Moveact</h1>
        <p style={{ textAlign: 'center', color: '#666', marginBottom: 32, fontSize: 14 }}>管理画面ログイン</p>

        {error && (
          <div style={{ background: '#FFEBEE', color: '#D32F2F', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' }}
            required
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' }}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: 14,
            background: '#1B3A5C',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </div>
  );
}
