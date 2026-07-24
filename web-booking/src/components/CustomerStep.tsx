import { useState } from 'react';
import { CANCELLATION_POLICY, isValidEmail } from '../lib/api';
import { PrivacyPolicy } from './PrivacyPolicy';

export interface CustomerInfo {
  name: string;
  phone: string;
  email: string;
  request: string;
  consent: boolean;
  isStudent: boolean;
}

export interface PickedSummary {
  storeName: string;
  menuName: string;
  dateLabel: string;   // 例: 2026年7月4日（土）
  time: string;        // 例: 13:00
  staffLabel: string;  // 例: おまかせ / 三上尚志（ご指名）
}

interface Props {
  customer: CustomerInfo;
  setCustomer: (c: CustomerInfo) => void;
  isFirstVisitHint?: boolean;
  summary?: PickedSummary;   // 選択済み内容のミニ表示（入力中に日時を確認できるように）
  contactPrefilled?: boolean;                  // 前回のご入力から自動で埋めたか
  prefillSource?: 'device' | 'line';           // 自動入力の出どころ（案内文の出し分け）
  onUseAnotherPerson?: () => void;             // 「別の方が予約する」で記憶を消して空にする
}

export function CustomerStep({ customer, setCustomer, summary, contactPrefilled, prefillSource, onUseAnotherPerson }: Props) {
  const up = (patch: Partial<CustomerInfo>) => setCustomer({ ...customer, ...patch });
  const emailInvalid = customer.email.trim().length > 0 && !isValidEmail(customer.email);
  const [showPolicy, setShowPolicy] = useState(false);

  return (
    <div>
      <h2 className="heading">お客様情報</h2>
      <p className="lead">ご連絡先をご入力ください。</p>

      {summary && (
        <div className="picked-summary" aria-label="選択中のご予約内容">
          <span className="ps-main">{summary.dateLabel}　{summary.time}</span>
          <span className="ps-sub">{summary.menuName} ／ {summary.staffLabel} ／ {summary.storeName}</span>
        </div>
      )}

      {contactPrefilled && (
        <div className="prefill-note" role="status">
          <span>
            {prefillSource === 'line'
              ? 'LINEのご登録内容から自動で入力しました。このままで進めます。'
              : '前回ご入力いただいた内容を表示しています。このままで進めます。'}
          </span>
          {onUseAnotherPerson && (
            <button type="button" className="prefill-clear" onClick={onUseAnotherPerson}>
              別の方が予約する（入力を消す）
            </button>
          )}
        </div>
      )}

      <div className="field">
        <label htmlFor="c-name">お名前<span className="req">必須</span></label>
        <input id="c-name" type="text" autoComplete="name" value={customer.name}
          placeholder="例：山田 花子" onChange={(e) => up({ name: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="c-phone">電話番号<span className="req">必須</span></label>
        <input id="c-phone" type="tel" inputMode="tel" autoComplete="tel" value={customer.phone}
          placeholder="例：090-1234-5678" onChange={(e) => up({ phone: e.target.value })} />
      </div>

      <div className="field">
        <label htmlFor="c-email">メールアドレス<span className="req">必須</span></label>
        <input id="c-email" type="email" inputMode="email" autoComplete="email" value={customer.email}
          placeholder="例：hanako@example.com" onChange={(e) => up({ email: e.target.value })} />
        {emailInvalid && <div className="err">メールアドレスの形式をご確認ください。</div>}
        <div className="field-hint">ご予約確認・ご案内をお送りします。</div>
      </div>

      <div className="field">
        <label htmlFor="c-req">ご相談・ご要望（任意）</label>
        <textarea id="c-req" value={customer.request}
          placeholder="気になる症状やご希望があればお書きください。" onChange={(e) => up({ request: e.target.value })} />
      </div>

      <div className="consent" style={{ marginBottom: 4 }}>
        <input id="student" type="checkbox" checked={customer.isStudent}
          onChange={(e) => up({ isStudent: e.target.checked })} />
        <label htmlFor="student">学割を利用する（学生の方）</label>
      </div>
      {customer.isStudent && (
        <p className="field-hint" style={{ marginTop: 0, marginBottom: 8 }}>
          ※ご来店時に学生証のご提示をお願いいたします。事前決済の金額が学割料金になります。
        </p>
      )}

      <div className="policy">
        <div className="ttl">キャンセルについて</div>
        <div className="hl">{CANCELLATION_POLICY.headline}</div>
        <ul>{CANCELLATION_POLICY.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </div>

      <div className="consent">
        <input id="consent" type="checkbox" checked={customer.consent}
          onChange={(e) => up({ consent: e.target.checked })} />
        {/* label内にbuttonを入れると不正なネストになるため、リンクはlabelの外に置く */}
        <span>
          <label htmlFor="consent">上記キャンセルについて確認のうえ、</label>
          <button type="button" onClick={() => setShowPolicy(true)}
            style={{
              background: 'none', border: 'none', padding: 0, font: 'inherit',
              color: 'var(--caramel-deep)', textDecoration: 'underline', textUnderlineOffset: 3,
            }}>
            プライバシーポリシー
          </button>
          <label htmlFor="consent">に同意する</label>
        </span>
      </div>

      {showPolicy && <PrivacyPolicy onClose={() => setShowPolicy(false)} />}
    </div>
  );
}
