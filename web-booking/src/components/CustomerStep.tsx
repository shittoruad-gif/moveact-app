import { CANCELLATION_POLICY, isValidEmail } from '../lib/api';

export interface CustomerInfo {
  name: string;
  phone: string;
  email: string;
  request: string;
  consent: boolean;
  isStudent: boolean;
}

interface Props {
  customer: CustomerInfo;
  setCustomer: (c: CustomerInfo) => void;
  isFirstVisitHint?: boolean;
}

export function CustomerStep({ customer, setCustomer }: Props) {
  const up = (patch: Partial<CustomerInfo>) => setCustomer({ ...customer, ...patch });
  const emailInvalid = customer.email.trim().length > 0 && !isValidEmail(customer.email);

  return (
    <div>
      <h2 className="heading">お客様情報</h2>
      <p className="lead">ご連絡先をご入力ください。</p>

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
        <label htmlFor="c-email">メールアドレス（任意）</label>
        <input id="c-email" type="email" inputMode="email" autoComplete="email" value={customer.email}
          placeholder="例：hanako@example.com" onChange={(e) => up({ email: e.target.value })} />
        {emailInvalid && <div className="err">メールアドレスの形式をご確認ください。</div>}
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
        <p className="note" style={{ marginTop: 0, marginBottom: 8 }}>
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
        <label htmlFor="consent">上記キャンセルについて確認のうえ、予約に進みます。</label>
      </div>
    </div>
  );
}
