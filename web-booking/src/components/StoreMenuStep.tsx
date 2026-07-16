import type { PageData, StoreId, Menu } from '../lib/api';
import { formatYen, workDaysLabel } from '../lib/api';

interface Props {
  pageData: PageData;
  storeId: StoreId | null;
  menu: Menu | null;
  onSelectStore: (s: StoreId) => void;
  onSelectMenu: (m: Menu) => void;
}

// 施術タイプ別の見出し（並びをカテゴリでまとめて見やすく）
const TYPE_LABEL: Record<string, string> = {
  seitai: '整体',
  biyou_hari: '美容鍼',
  pilates: 'ピラティス',
  group_pilates: 'グループピラティス',
  reflexology: '足つぼ',
  other: 'その他',
};

// 店舗の所在地（初めてのお客様が店舗を選びやすいように）
const STORE_CITY: Record<string, string> = {
  tamashima: '倉敷市玉島',
  kanamitsu: '浅口市金光町',
};

export function StoreMenuStep({ pageData, storeId, menu, onSelectStore, onSelectMenu }: Props) {
  const multiStore = pageData.stores.length > 1;
  const menus = storeId ? (pageData.menusByStore[storeId] ?? []) : [];

  // 指名メニュー用: 担当スタッフのこの店舗での出勤曜日（選んだ後に×だらけで戸惑わないよう事前に案内）
  const nominationDays = (m: Menu): string | null => {
    if (!m.requiredStaffSlug || !storeId) return null;
    const st = (pageData.staffByStore?.[storeId] ?? []).find((x) => x.slug === m.requiredStaffSlug);
    if (!st || !st.workDays || st.workDays.length === 0 || st.workDays.length >= 7) return null;
    return workDaysLabel(st.workDays);
  };

  // 施術タイプでグルーピング（出現順を保持）
  const groups: { type: string; items: Menu[] }[] = [];
  for (const m of menus) {
    let g = groups.find((x) => x.type === m.treatmentType);
    if (!g) { g = { type: m.treatmentType, items: [] }; groups.push(g); }
    g.items.push(m);
  }

  return (
    <div>
      {/* 店舗が複数あり未選択の間は、最初に表示されるのは店舗のため見出しも「店舗」にする */}
      {multiStore && !storeId ? (
        <>
          <h2 className="heading">店舗をお選びください</h2>
          <p className="lead">まずはご希望の店舗をお選びください。</p>
        </>
      ) : (
        <>
          <h2 className="heading">メニューをお選びください</h2>
          <p className="lead">ご希望のメニューをお選びいただくと、空いているお時間をご案内します。</p>
        </>
      )}

      {multiStore && (
        <>
          <div className="eyebrow">店舗</div>
          <div className="stores">
            {pageData.stores.map((s) => (
              <button
                key={s.id}
                className={`store ${storeId === s.id ? 'on' : ''}`}
                aria-pressed={storeId === s.id}
                onClick={() => onSelectStore(s.id)}
              >
                <div className="jp">{s.name}</div>
                <div className="city">{STORE_CITY[s.id] ?? ''}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {storeId && (
        <>
          {menus.length === 0 && <p className="note">ただいまメニューを準備しております。</p>}
          {groups.map((g) => (
            <div key={g.type}>
              <div className="eyebrow">{TYPE_LABEL[g.type] ?? 'メニュー'}</div>
              {g.items.map((m) => (
                <button
                  key={m.id}
                  className={`menu ${menu?.id === m.id ? 'on' : ''}`}
                  aria-pressed={menu?.id === m.id}
                  onClick={() => onSelectMenu(m)}
                >
                  <div className="menu-photo">
                    {m.imageUrl
                      ? <img src={m.imageUrl} alt={m.name} loading="lazy" />
                      : <span className="ph-label">{TYPE_LABEL[m.treatmentType] ?? 'MENU'}</span>}
                  </div>
                  <div className="menu-main">
                    <div className="nm">{m.name}</div>
                    <div className="dur">
                      所要時間 約{m.durationMinutes}分
                      {/* スタッフ選択画面と表記を統一（「月・水」形式、末尾の「曜」なし） */}
                      {nominationDays(m) && <>　・　出勤：{nominationDays(m)}</>}
                    </div>
                    {m.description && <div className="desc">{m.description}</div>}
                    <div className="pr">{formatYen(m.price)}<small> 税込</small></div>
                  </div>
                </button>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
