import type { StoreId, Menu } from '../lib/api';
import type { CustomerInfo } from './CustomerStep';
import { formatYen, formatPhone, STORE_INFO } from '../lib/api';

interface Props {
  storeId: StoreId;
  menu: Menu;
  date: string;
  time: string;
  customer: CustomerInfo;
  staffName: string | null;   // null = おまかせ
  error: string | null;
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  // 曜日は端末のタイムゾーンに依存させない（UTC固定で日付そのものの曜日を取る）
  const wd = WD[new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${y}年${m}月${d}日（${wd}）`;
}

export function ConfirmStep({ storeId, menu, date, time, customer, staffName, error }: Props) {
  const store = STORE_INFO[storeId];

  return (
    <div>
      <h2 className="heading">ご予約内容の確認</h2>
      <p className="lead">内容をご確認のうえ、お進みください。</p>

      {error && <div className="banner-err">{error}</div>}

      <div className="summary">
        <div className="srow feature">
          <div className="k">店舗</div>
          <div className="v"><span className="strong">{store.name}</span></div>
        </div>
        <div className="srow">
          <div className="k">担当</div>
          <div className="v">
            {staffName
              ? <>{staffName}　<span className="tag nm">ご指名</span></>
              : <span className="tag om">おまかせ</span>}
          </div>
        </div>
        <div className="srow">
          <div className="k">メニュー</div>
          <div className="v"><span className="strong">{menu.name}</span><br />約{menu.durationMinutes}分</div>
        </div>
        <div className="srow feature">
          <div className="k">日時</div>
          <div className="v"><span className="strong">{formatDate(date)}　{time}</span></div>
        </div>
        <div className="srow">
          <div className="k">料金</div>
          <div className="v">
            {formatYen(menu.price)}（税込）
            {customer.isStudent && (
              <div style={{ fontSize: 11.5, color: 'var(--caramel-deep)', marginTop: 3 }}>
                学割を適用します（ご来店時に学生証をご提示ください）
              </div>
            )}
          </div>
        </div>
        <div className="srow">
          <div className="k">お名前</div>
          <div className="v">{customer.name} 様</div>
        </div>
        <div className="srow">
          <div className="k">電話</div>
          <div className="v">{customer.phone}</div>
        </div>
        {customer.email && <div className="srow"><div className="k">メール</div><div className="v">{customer.email}</div></div>}
        {customer.request && <div className="srow"><div className="k">ご要望</div><div className="v">{customer.request}</div></div>}
      </div>

      {/* 初回限定メニューのみ: 事前決済（前金）の事前予告 */}
      {menu.name.startsWith('【初回限定】') && (
        <div style={{
          background: 'var(--surface-warm)', border: '1px solid var(--peach)',
          borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '0 0 18px',
          fontSize: 12.5, color: 'var(--taupe)', lineHeight: 1.9, textAlign: 'left',
        }}>
          <b style={{ display: 'block', color: 'var(--caramel-deep)', fontSize: 13, marginBottom: 4 }}>初回のお客様へ（事前決済のご案内）</b>
          初回のお客様は、ご予約確定後に事前決済（オンライン）のご案内があります。30分以内にお手続きが完了しない場合、ご予約は自動的に取り消されます。
        </div>
      )}

      <p className="fineprint">
        ※ ご予約確定後、{store.name}（{formatPhone(store.phone)}）よりご連絡を差し上げる場合がございます。
      </p>
    </div>
  );
}
