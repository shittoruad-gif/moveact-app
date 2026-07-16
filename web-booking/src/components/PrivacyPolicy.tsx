import { useEffect, type CSSProperties } from 'react';
import { STORE_INFO, formatPhone } from '../lib/api';

interface Props {
  onClose: () => void;
}

/** プライバシーポリシー（モーダル表示） */
export function PrivacyPolicy({ onClose }: Props) {
  // Escapeキーで閉じる＋表示中は背面のスクロールを止める
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const overlay: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 100,
    background: 'rgba(61, 53, 53, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '24px 18px',
  };
  const panel: CSSProperties = {
    background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-soft)', width: '100%', maxWidth: 440,
    maxHeight: '82vh', display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  };
  const head: CSSProperties = {
    padding: '18px 20px 14px', borderBottom: '1px solid var(--line-soft)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  };
  const body: CSSProperties = {
    padding: '16px 20px 20px', overflowY: 'auto',
    fontSize: 13, lineHeight: 1.9, color: 'var(--brown)',
  };
  const secTtl: CSSProperties = {
    fontSize: 11, letterSpacing: '0.14em', color: 'var(--caramel-deep)',
    fontWeight: 700, margin: '16px 0 6px',
  };
  const ul: CSSProperties = { margin: '0 0 4px', paddingLeft: 18 };

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="プライバシーポリシー"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panel}>
        <div style={head}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 600, letterSpacing: '0.04em' }}>
            プライバシーポリシー
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる"
            style={{
              border: 'none', background: 'var(--cream-deep)', color: 'var(--taupe)',
              width: 44, height: 44, borderRadius: '50%', fontSize: 18, lineHeight: 1, flexShrink: 0,
            }}>
            ×
          </button>
        </div>
        <div style={body}>
          <p style={{ margin: 0 }}>
            Moveact（以下「当店」）は、ご予約の際にお預かりするお客様の個人情報を、以下のとおり取り扱います。
          </p>

          <div style={secTtl}>1. 利用目的</div>
          <p style={{ margin: '0 0 4px' }}>お預かりした個人情報（お名前・電話番号・メールアドレス等）は、次の目的にのみ利用いたします。</p>
          <ul style={ul}>
            <li>ご予約の受付・確認・変更・キャンセルなどの予約管理のため</li>
            <li>ご来店時の本人確認のため</li>
            <li>ご予約内容の確認や施術に関するご連絡のため</li>
          </ul>

          <div style={secTtl}>2. 第三者への提供</div>
          <p style={{ margin: 0 }}>
            法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供することはありません。
          </p>

          <div style={secTtl}>3. 安全管理</div>
          <p style={{ margin: 0 }}>
            お預かりした個人情報は、紛失・漏えい・不正アクセス等を防ぐため、適切に管理いたします。
          </p>

          <div style={secTtl}>4. 開示・訂正・削除のお申し出</div>
          <p style={{ margin: '0 0 4px' }}>
            ご自身の個人情報の開示・訂正・削除等をご希望の場合は、ご利用の店舗までお気軽にお申し出ください。
          </p>
          <ul style={ul}>
            <li>{STORE_INFO.tamashima.name}：{formatPhone(STORE_INFO.tamashima.phone)}</li>
            <li>{STORE_INFO.kanamitsu.name}：{formatPhone(STORE_INFO.kanamitsu.phone)}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
