import { useEffect } from 'react';

// LINEログインのhttps中継ページ。
// LINEは独自スキーム(moveact://)をコールバックに登録できないため、
// 一度このhttpsページで受けてから、アプリのカスタムスキームへ橋渡しする。
export function LineCallback() {
  const target = 'moveact://line-auth' + (typeof window !== 'undefined' ? window.location.search : '');

  useEffect(() => {
    // アプリへ自動で戻す
    window.location.replace(target);
  }, [target]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', fontFamily: 'system-ui, sans-serif', color: '#6B5E5E' }}>
      <div style={{ fontSize: 15 }}>Moveactアプリに戻っています…</div>
      <a href={target} style={{ color: '#A87B52', fontSize: 14 }}>自動で戻らない場合はこちらをタップ</a>
    </div>
  );
}
