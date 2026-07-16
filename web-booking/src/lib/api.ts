// 公開Web予約のAPIクライアント（Supabase Edge Functions経由のみ）
// 認証不要。3つの公開関数だけを呼ぶ（DB/RLSには触れない）。
// =====================================================

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://khsriogicdjdyivshplc.supabase.co';
const FN = `${SUPABASE_URL}/functions/v1`;

// ---- 型 ----
export type StoreId = 'tamashima' | 'kanamitsu';

export interface Menu {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
  treatmentType: string;
  description: string | null;
  imageUrl?: string | null;   // メニュー写真（後日登録。未設定はプレースホルダ表示）
  requiredStaffSlug?: string | null;   // 指名メニュー（設定時はそのスタッフ固定。booking_slug）
}

// 出勤曜日ラベル（0=日..6=土 → 月〜日の順で表示。週7日は「毎日」）
export function workDaysLabel(days: number[]): string {
  const NAMES = ['日', '月', '火', '水', '木', '金', '土'];
  const uniq = [...new Set(days)];
  if (uniq.length >= 7) return '毎日';
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  return ORDER.filter(d => uniq.includes(d)).map(d => NAMES[d]).join('・');
}

export interface RosterStaff {
  id: string;
  name: string;
  slug?: string | null;   // booking_slug（指名メニューの担当解決に使用）
  workDays?: number[] | null;   // 出勤曜日(0=日..6=土)。勤務スケジュール未設定店舗はnull
  photoUrl?: string | null;   // 顔写真URL（公式サイト由来）。未設定はイニシャル表示
  title?: string | null;      // 資格・肩書き（例: 柔道整復師・はり師・きゅう師）
  bio?: string | null;        // 紹介文（公式サイトより引用）
  skills?: string[];          // 担当できる施術種別(treatment_type)。指名リストの絞り込みに使用
}

export interface PageStaff {
  id: string;
  name: string;
  slug: string;
  storeIds: string[];
}

export interface PageData {
  staff: PageStaff | null;
  stores: { id: StoreId; name: string }[];
  menusByStore: Record<string, Menu[]>;
  staffByStore?: Record<string, RosterStaff[]>;   // 店舗別スタッフ一覧（フロー内の指名選択用）
}

export interface Slot {
  time: string;   // 'HH:MM'
  level: string;  // ◎ ○ △
  freeStaff: number;
}

export interface SlotsResult {
  slots: Slot[];
  isClosed: boolean;
  businessHours?: { open: string; close: string };
  durationMinutes?: number;
  totalStaff?: number;
}

export interface CreateBookingInput {
  storeId: StoreId;
  menuId: string;
  date: string;   // YYYY-MM-DD
  time: string;   // HH:MM
  staffId?: string | null;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  request?: string;
  isStudent?: boolean;   // 学割（学生割引）希望
}

export interface CreateBookingResult {
  bookingId?: string;
  requiresDeposit?: boolean;
  depositAmount?: number | null;
  paymentUrl?: string | null;
  holdExpiresAt?: string | null;   // 事前決済の仮押さえ期限（ISO）。過ぎると自動キャンセル
  zoomJoinUrl?: string | null;     // オンライン(Zoom)対象スタッフの予約のみ。会議参加URL
  error?: string;
  code?: 'slot_taken' | 'closed' | 'invalid' | 'rate_limited';
}

export interface ConfirmBookingResult {
  ok?: boolean;
  alreadyConfirmed?: boolean;
  zoomJoinUrl?: string | null;     // オンライン(Zoom)対象スタッフの予約のみ。会議参加URL
  error?: string;
  code?: 'hold_expired' | 'not_found' | 'invalid';
}

// ---- 呼び出し ----
async function postJson<T>(fn: string, body: unknown): Promise<T> {
  const res = await fetch(`${FN}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  // 4xx/5xx でも本文にエラーJSON（code等）が入るのでまずパースを試みる
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (data === null) {
    // JSONとして読めない＝ネットワーク/ゲートウェイ障害
    throw new Error(`HTTP ${res.status}`);
  }
  return data as T;
}

export function getBookingPageData(slug?: string): Promise<PageData> {
  return postJson<PageData>('get-booking-page-data', { slug: slug ?? '' });
}

export async function getAvailableSlots(p: {
  storeId: StoreId; menuId: string; date: string; staffId?: string | null;
}): Promise<SlotsResult> {
  const r = await postJson<SlotsResult & { error?: string }>('get-available-slots', p);
  // サーバーがエラーJSON（{error}）を返した場合は例外にする。
  // これをそのまま返すと slots 無し＝全時間帯「×満席」と誤描画され、障害を隠してしまう。
  if (r && r.error) throw new Error(r.error);
  return r;
}

export function createWebBooking(p: CreateBookingInput): Promise<CreateBookingResult> {
  return postJson<CreateBookingResult>('create-web-booking', p);
}

// 事前決済の「お支払いが完了しました」をお客様が知らせる（自己申告で予約確定）
export function confirmWebBooking(bookingId: string): Promise<ConfirmBookingResult> {
  return postJson<ConfirmBookingResult>('confirm-web-booking', { bookingId });
}

// ---- キャンセル ----
export interface CancelBookingInfo {
  date: string;
  time: string;
  dateLabel: string;
  menuName: string;
  durationMinutes: number;
  storeName: string;
  storePhone: string;
  guestName: string;
  status: string;
  depositStatus: string;
  staffSlug: string | null;
  canCancel: boolean;
  cannotCancelReason: string | null;
}

export interface CancelInfoResult {
  ok?: boolean;
  booking?: CancelBookingInfo;
  error?: string;
  code?: string;
}

export interface CancelResult {
  ok?: boolean;
  alreadyCancelled?: boolean;
  staffSlug?: string | null;
  error?: string;
  code?: string;
}

export async function getCancelInfo(token: string): Promise<CancelInfoResult> {
  const res = await fetch(`${FN}/cancel-web-booking?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  try { return text ? JSON.parse(text) : {}; } catch { throw new Error(`HTTP ${res.status}`); }
}

export function cancelBooking(token: string): Promise<CancelResult> {
  return postJson<CancelResult>('cancel-web-booking', { token });
}

// ---- 店舗情報（表示用） ----
export const STORE_INFO: Record<StoreId, { name: string; address: string; phone: string }> = {
  tamashima: {
    name: '玉島店',
    address: '〒713-8122 岡山県倉敷市玉島中央町3丁目911-186 2F',
    phone: '08051264249',
  },
  kanamitsu: {
    name: '金光店',
    address: '〒719-0104 岡山県浅口市金光町占見新田283-1 2階',
    phone: '07022318300',
  },
};

export const CANCELLATION_POLICY = {
  headline:
    '当日キャンセル・無断キャンセルは、施術1回分の料金、または回数券1回分消化、もしくはサブスク1回分消化となります。',
  lines: [
    'ご予約の変更・キャンセルは、前日までにお願いいたします。',
    '当日のキャンセル・ご変更、および無断キャンセルの場合は、施術1回分の料金（回数券をお持ちの場合は回数券1回分消化、サブスクをご利用の場合はサブスクの施術1回分消化）を申し受けます。',
    '体調不良などやむを得ない事情の場合は、できるだけ早めにご連絡ください。',
  ],
};

// ---- 日付ユーティリティ（JST基準） ----
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function jstNow(): Date {
  // Intl.DateTimeFormat の parts で確実にJSTの年月日時を取り出す（locale文字列parseは不安定）
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  let hour = get('hour');
  if (hour === 24) hour = 0; // 一部環境で 24 を返すケースの保険
  return new Date(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
}

export function formatPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  if (d.length === 10) return d.replace(/(\d{2,4})(\d{3,4})(\d{4})/, '$1-$2-$3');
  return p;
}

export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
}

export interface DayOption {
  iso: string;       // YYYY-MM-DD
  label: string;     // 7/1
  weekday: string;   // 火
  isWeekend: boolean;
}

export function nextDays(count: number): DayOption[] {
  const start = jstNow();
  start.setHours(0, 0, 0, 0);
  const out: DayOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const dow = d.getDay();
    out.push({
      iso: `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      label: `${m}/${day}`,
      weekday: WEEKDAYS[dow],
      isWeekend: dow === 0 || dow === 6,
    });
  }
  return out;
}

export function formatYen(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`;
}
