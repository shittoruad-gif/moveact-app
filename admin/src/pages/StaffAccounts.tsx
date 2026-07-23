import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// スタッフのログインアカウント管理（管理者専用）
//   - 各スタッフのログインID(メール)・最終ログイン・未ログインかを一覧
//   - 「パスワードをリセット」で仮パスワードを発行し、画面に表示（メール送信はしない）
//     → 管理者がその場でスタッフ本人に手渡す運用。本人は初回ログイン後に変更を推奨。

interface StaffRow {
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  last_sign_in_at: string | null;
  never_logged_in: boolean;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StaffAccounts() {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // リセット状態
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  // 発行済み仮パスワード（userId → password）。画面に表示し続ける（再読込で消える）
  const [issued, setIssued] = useState<Record<string, { password: string; email: string | null }>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.functions.invoke('admin-staff-accounts', {
      body: { action: 'list' },
    });
    if (error || !data?.staff) {
      setError('スタッフ一覧の読み込みに失敗しました。管理者アカウントでログインしているかご確認ください。');
      setStaff([]);
    } else {
      setStaff(data.staff as StaffRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const doReset = async (id: string) => {
    setResettingId(id);
    setError(null);
    const { data, error } = await supabase.functions.invoke('admin-staff-accounts', {
      body: { action: 'reset', userId: id },
    });
    if (error || !data?.password) {
      setError('パスワードのリセットに失敗しました。時間をおいて、もう一度お試しください。');
    } else {
      setIssued((prev) => ({ ...prev, [id]: { password: data.password, email: data.email ?? null } }));
    }
    setResettingId(null);
    setConfirmId(null);
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">スタッフのログイン管理</h2>
        <p className="page-help">
          各スタッフのログインID（メールアドレス）と、ログイン状況を確認できます。
          スタッフがログインできないときは、<strong>「パスワードをリセット」</strong>で新しい仮パスワードを発行し、
          その場で本人にお伝えください（メールは送られません）。本人には、初回ログイン後にパスワードの変更をご案内ください。
        </p>
      </div>

      {error && (
        <div className="note note-red" role="alert" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <div className="card"><div className="empty">読み込み中です…</div></div>
      ) : staff.length === 0 ? (
        <div className="card"><div className="empty">スタッフが見つかりませんでした。</div></div>
      ) : (
        <div className="card card-pad">
          {staff.map((s) => {
            const iss = issued[s.id];
            return (
              <div key={s.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 140 }}>
                    <div style={{ fontWeight: 600 }}>
                      {s.full_name}
                      {s.role === 'admin' && <span className="badge badge-gray" style={{ marginLeft: 6 }}>管理者</span>}
                    </div>
                    {s.never_logged_in
                      ? <div style={{ fontSize: 12, color: 'var(--red)' }}>まだ一度もログインなし</div>
                      : <div style={{ fontSize: 12, color: 'var(--sub)' }}>最終ログイン {fmtDate(s.last_sign_in_at)}</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: 'var(--sub)', wordBreak: 'break-all' }}>
                    <span style={{ color: 'var(--sub)' }}>ログインID：</span>
                    <span style={{ color: 'var(--text)' }}>{s.email ?? '—'}</span>
                  </div>

                  {confirmId === s.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--sub)' }}>リセットしますか？</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={resettingId === s.id}
                        onClick={() => doReset(s.id)}
                      >
                        {resettingId === s.id ? '処理中…' : 'はい、リセット'}
                      </button>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => setConfirmId(null)}>やめる</button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => setConfirmId(s.id)}>
                      パスワードをリセット
                    </button>
                  )}
                </div>

                {iss && (
                  <div className="note" style={{ background: 'var(--green-weak)', marginTop: 10 }}>
                    <div style={{ fontSize: 13, marginBottom: 8, fontWeight: 600, color: 'var(--green)' }}>
                      仮パスワードを発行しました。この画面を離れると再表示できません。今すぐ本人にお伝えください。
                    </div>
                    <div style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ minWidth: 96, fontSize: 12, color: 'var(--sub)' }}>ログインID</span>
                        <code style={{ flex: 1, fontSize: 14 }}>{iss.email ?? s.email ?? '—'}</code>
                        <button type="button" className="btn btn-sm" onClick={() => copyText(iss.email ?? s.email ?? '', `id-${s.id}`)}>
                          {copied === `id-${s.id}` ? '✓' : 'コピー'}
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ minWidth: 96, fontSize: 12, color: 'var(--sub)' }}>新しいパスワード</span>
                        <code style={{ flex: 1, fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>{iss.password}</code>
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => copyText(iss.password, `pw-${s.id}`)}>
                          {copied === `pw-${s.id}` ? '✓ コピー済み' : 'コピー'}
                        </button>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ justifySelf: 'start' }}
                        onClick={() => copyText(`ログインID：${iss.email ?? s.email ?? ''}\nパスワード：${iss.password}`, `both-${s.id}`)}
                      >
                        {copied === `both-${s.id}` ? '✓ まとめてコピーしました' : 'IDとパスワードをまとめてコピー'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
