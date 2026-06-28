// Store IDs and configuration
export const STORES = {
  kanamitsu: {
    id: 'kanamitsu' as const,
    name: '金光店',
    address: '〒719-0104 岡山県浅口市金光町占見新田283-1 2階',
    phone: '07022318300',
    bookingUrl: 'https://airrsv.net/Moveact/calendar',
  },
  tamashima: {
    id: 'tamashima' as const,
    name: '玉島店',
    address: '〒713-8122 岡山県倉敷市玉島中央町3丁目911-186 2F',
    phone: '08051264249',
    bookingUrl: 'https://airrsv.net/moveact-tamashima/calendar',
  },
} as const;

export type StoreId = keyof typeof STORES;

// Product brands
// MTGブランド: B Happy公式サイト経由でオンライン購入
export const MTG_BRANDS = ['ReFa', 'SIXPAD', 'Newpeace', 'PAO', 'MDNA SKIN', 'Style'] as const;
export type MtgBrand = (typeof MTG_BRANDS)[number];

// 選択肢として扱うブランド全体（「その他」= 非MTG）
export const PRODUCT_BRANDS = [...MTG_BRANDS, 'その他'] as const;
export type ProductBrand = (typeof PRODUCT_BRANDS)[number];

export function isMtgBrand(brand: string | null | undefined): boolean {
  if (!brand) return false;
  return (MTG_BRANDS as readonly string[]).includes(brand);
}

// Treatment types
export const TREATMENT_TYPES = {
  seitai: '整体',
  biyou_hari: '美容鍼',
  pilates: 'ピラティス',
  group_pilates: 'グループピラティス',
  reflexology: 'リフレクソロジー',
} as const;

export type TreatmentType = keyof typeof TREATMENT_TYPES;

// 顧客の格付け（タグ）プリセット。
// CustomerDetailScreen（タグ付与）と MenuTagPricing（タグ別料金設定）で共通使用。
// カスタムタグも自由に追加可能だが、料金設定はこのプリセット中心に運用する。
export const PRESET_CUSTOMER_TAGS = ['VIP', '旧料金', '回数券優待', 'スタッフ', '紹介済', '学生'] as const;

// Colors - Warm feminine palette
export const COLORS = {
  primary: '#6B5E5E',          // Warm taupe brown
  primaryDark: '#4A3F3F',      // Darker taupe
  primaryLight: '#8A7D7D',     // Light taupe
  accent: '#C4956A',           // Warm gold/caramel
  accentLight: '#E8D5C0',      // Soft peach
  accentPink: '#D4A5A5',       // Dusty rose
  background: '#FAF7F5',       // Warm cream
  backgroundSoft: '#F3EEEA',   // Slightly deeper cream
  surface: '#FFFFFF',
  surfaceWarm: '#FDF9F6',      // Warm white
  text: '#3D3535',             // Warm dark brown
  textSecondary: '#8A7E7E',    // Muted brown
  textLight: '#B5ABAB',        // Light muted
  border: '#E8E0DB',           // Warm border
  borderLight: '#F0EBE7',      // Very light border
  error: '#C97070',            // Soft red
  success: '#7BA88E',          // Sage green
  warning: '#D4A55A',          // Warm amber
} as const;

// Cancellation policy — 全画面で共通利用するキャンセル規約（単一の出典）
export const CANCELLATION_POLICY = {
  title: 'キャンセルポリシー',
  // 一番伝えたい当日キャンセルのルール（強調表示用）
  headline: '当日キャンセル・無断キャンセルは、施術1回分の料金、または回数券1回分の消化となります。',
  lines: [
    'ご予約の変更・キャンセルは、前日までにお願いいたします。',
    '当日のキャンセル・ご変更、および無断キャンセルの場合は、施術1回分の料金（回数券をお持ちの場合は回数券1回分の消化）を申し受けます。',
    '体調不良などやむを得ない事情の場合は、できるだけ早めにご連絡ください。',
  ],
} as const;

// 予約開始日時が「当日（本日）」か＝当日キャンセル料の対象か
export function isSameDayAppointment(startsAtIso: string): boolean {
  const s = new Date(startsAtIso);
  const now = new Date();
  return s.getFullYear() === now.getFullYear()
    && s.getMonth() === now.getMonth()
    && s.getDate() === now.getDate();
}
