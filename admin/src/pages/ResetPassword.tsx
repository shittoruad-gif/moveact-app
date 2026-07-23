import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// スタッフ本人がメールのリンクから新しいパスワードを設定する画面。
//   URL: /reset-password?token_hash=...&type=recovery
//   1) token_hash を verifyOtp('recovery') で検証してセッション確立
//   2) 新パスワードを入力 → updateUser({ password })
// ※ App.tsx がログイン状態に関係なく、このパスのときは本画面を表示する。

type Phase = 'verifying' | 'ready' | 'invalid' | 'saving' | 'done';

export function ResetPassword() {
  const [phase, setPhase] = useState<Phase>('verifying');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const verifiedRef = useRef(false); // token は1回だけ検証（二重実行防止）

  useEffect(() => {
    if (verifiedRef.current) return;
    verifiedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    if (!tokenHash || type !== 'recovery') {
      setPhase('invalid');
      return;
    }
    (async () => {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      setPhase(error ? 'invalid' : 'ready');
    })();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 8) { setError('パスワードは8文字以上にしてください。'); return; }
    if (pw !== pw2) { setError('確認用パスワードが一致しません。'); return; }
    setPhase('saving');
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) {
      setError('パスワードの設定に失敗しました。リンクの有効期限が切れている可能性があります。お手数ですが、もう一度お試しください。');
      setPhase('ready');
      return;
    }
    // 新パスワードでログインし直してもらうため、一旦サインアウト
    await supabase.auth.signOut();
    setPhase('done');
  }

  return (
    <div className="login-page">
      <div className="login-card card card-pad">
        <h1 className="login-logo">MOVEACT <span>管理</span></h1>
        <p className="login-sub">パスワードの再設定</p>

        {phase === 'verifying' && (
          <div className="empty" style={{ padding: '24px 0' }}>リンクを確認しています…</div>
        )}

        {phase === 'invalid' && (
          <>
            <div className="note note-red" role="alert" style={{ marginBottom: 16 }}>
              リンクが無効か、有効期限（1時間）が切れています。<br />
              お手数ですが、ログイン画面の「パスワードをお忘れの方」から、もう一度お試しください。
            </div>
            <a href="/" className="btn btn-secondary" style={{ width: '100%', textAlign: 'center', textDecoration: 'none' }}>
              ログイン画面へ
            </a>
          </>
        )}

        {(phase === 'ready' || phase === 'saving') && (
          <form onSubmit={handleSave} style={{ display: 'grid', gap: 16 }}>
            <p className="page-help" style={{ margin: 0 }}>新しいパスワードを入力してください（8文字以上）。</p>
            {error && <div className="note note-red" role="alert">{error}</div>}
            <div className="field">
              <label className="field-label" htmlFor="new-pw">新しいパスワード</label>
              <input id="new-pw" className="input" type="password" autoComplete="new-password"
                value={pw} onChange={(e) => setPw(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="new-pw2">新しいパスワード（確認）</label>
              <input id="new-pw2" className="input" type="password" autoComplete="new-password"
                value={pw2} onChange={(e) => setPw2(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={phase === 'saving'} style={{ width: '100%' }}>
              {phase === 'saving' ? '設定しています…' : 'このパスワードに設定する'}
            </button>
          </form>
        )}

        {phase === 'done' && (
          <>
            <div className="note" style={{ background: 'var(--green-weak)', color: 'var(--green)', marginBottom: 16 }}>
              新しいパスワードを設定しました。<br />新しいパスワードでログインしてください。
            </div>
            <a href="/" className="btn btn-primary" style={{ width: '100%', textAlign: 'center', textDecoration: 'none' }}>
              ログイン画面へ
            </a>
          </>
        )}
      </div>
    </div>
  );
}
