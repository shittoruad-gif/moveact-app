// Interest categories for onboarding
// Each interest maps to product categories and keyword filters

export interface InterestOption {
  id: string;
  label: string;
  icon: string; // Ionicons name
  description: string;
  /** Product categories that match this interest */
  categories: string[];
  /** Additional keyword filters applied to product name/description */
  keywords: string[];
}

export const INTEREST_OPTIONS: InterestOption[] = [
  {
    id: 'hair_care',
    label: 'ヘアケア',
    icon: 'cut-outline',
    description: 'ドライヤー・アイロン・ヘアケア',
    categories: ['ReFa'],
    keywords: ['ドライヤー', 'アイロン', 'ストレート', 'カール', 'リセッター', 'フィンガー', '髪'],
  },
  {
    id: 'scalp_care',
    label: '頭皮ケア',
    icon: 'water-outline',
    description: 'ヘッドスパ・頭皮マッサージ',
    categories: ['ReFa'],
    keywords: ['ヘッドスパ', '頭皮', 'ホットドロップ'],
  },
  {
    id: 'face_care',
    label: 'フェイスケア',
    icon: 'happy-outline',
    description: '美顔器・美容液・ファンデーション',
    categories: ['ReFa', 'PLOSION', 'V3/SPICARE'],
    keywords: ['カラット', 'カッサ', 'ハイドラ', 'ウォーミー', 'ダーマ', 'フェイス', 'セラム', '美容液', 'クレンジング', 'ファンデ', 'ポイント'],
  },
  {
    id: 'body_care',
    label: 'ボディケア',
    icon: 'body-outline',
    description: 'EMS・トレーニングギア',
    categories: ['ReFa', 'SIXPAD', 'PAO'],
    keywords: ['フォーボディ', 'ボディ', 'EMS', 'トレーニング', 'PAO'],
  },
  {
    id: 'bath_shower',
    label: 'シャワー・バス',
    icon: 'rainy-outline',
    description: 'ファインバブルシャワーヘッド',
    categories: ['ReFa'],
    keywords: ['ファインバブル', 'シャワー', 'ミスト', 'カートリッジ'],
  },
  {
    id: 'beauty_device',
    label: '光美容・脱毛',
    icon: 'flash-outline',
    description: '光美容器・シェーバー',
    categories: ['ReFa'],
    keywords: ['エピ', '光美容', 'シェーバー', 'ビューテック エピ'],
  },
  {
    id: 'posture',
    label: '姿勢・骨盤',
    icon: 'fitness-outline',
    description: '姿勢矯正チェア・骨盤ケア',
    categories: ['Style'],
    keywords: ['Style', 'スタイル', '骨盤', '姿勢'],
  },
  {
    id: 'support',
    label: '腰・膝サポート',
    icon: 'shield-checkmark-outline',
    description: 'コルセット・サポーター',
    categories: ['ダイヤ工業'],
    keywords: ['コルセット', 'サポーター', '膝', '腰', '骨盤ベルト', '外反母趾'],
  },
  {
    id: 'sleep',
    label: '睡眠・リラックス',
    icon: 'moon-outline',
    description: 'マットレス・枕・アイマスク',
    categories: ['NEWPEACE'],
    keywords: ['マットレス', '枕', 'ピロー', 'アイマスク', 'リラック'],
  },
  {
    id: 'foot_care',
    label: '足のお悩み',
    icon: 'footsteps-outline',
    description: '足袋シューズ・外反母趾ケア',
    categories: ['Lafeet'],
    keywords: ['足袋', '外反母趾', '足指', 'Lafeet'],
  },
];

/**
 * Get product IDs that match user interests
 * Used for filtering recommended products
 */
export function buildInterestFilter(interests: string[]): {
  categories: string[];
  keywords: string[];
} {
  const categories = new Set<string>();
  const keywords = new Set<string>();

  for (const interestId of interests) {
    const option = INTEREST_OPTIONS.find((o) => o.id === interestId);
    if (option) {
      option.categories.forEach((c) => categories.add(c));
      option.keywords.forEach((k) => keywords.add(k));
    }
  }

  return {
    categories: Array.from(categories),
    keywords: Array.from(keywords),
  };
}
