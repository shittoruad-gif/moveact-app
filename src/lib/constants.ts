// Store IDs and configuration
export const STORES = {
  kanamitsu: {
    id: 'kanamitsu' as const,
    name: '金光店',
    address: '岡山県浅口市金光町占見新田283-1 2階',
    phone: '07022318300',
    bookingUrl: 'https://airrsv.net/Moveact/calendar',
  },
  tamashima: {
    id: 'tamashima' as const,
    name: '玉島店',
    address: '岡山県倉敷市玉島中央町3丁目',
    phone: '',
    bookingUrl: 'https://airrsv.net/moveact-tamashima/calendar',
  },
} as const;

export type StoreId = keyof typeof STORES;

// Treatment types
export const TREATMENT_TYPES = {
  seitai: '整体',
  biyou_hari: '美容鍼',
  pilates: 'ピラティス',
  group_pilates: 'グループピラティス',
  reflexology: 'リフレクソロジー',
} as const;

export type TreatmentType = keyof typeof TREATMENT_TYPES;

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

// Cancellation policy
export const CANCELLATION_POLICY = {
  sameDayCutoffHours: 0,
} as const;
