import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────
// 練習モード 共有データストア
//   全画面がこのメモリ内データを共有し、ある画面の操作が他画面にも反映される。
//   supabase（本番DB）には一切アクセスしない。リロード/「最初に戻す」で初期化。
// ─────────────────────────────────────────────────────────────

export type StoreId = 'tamashima' | 'kanamitsu';
export const STORE_NAMES: Record<StoreId, string> = { tamashima: '玉島店', kanamitsu: '金光店' };
export const STORES: StoreId[] = ['tamashima', 'kanamitsu'];

export interface DemoStaff { id: string; name: string; store: StoreId; }
export interface DemoMenu { id: string; name: string; minutes: number; price: number; }

export const STAFF: DemoStaff[] = [
  { id: 's1', name: '三上（練習）', store: 'kanamitsu' },
  { id: 's2', name: '久一（練習）', store: 'kanamitsu' },
  { id: 's3', name: '石井（練習）', store: 'kanamitsu' },
  { id: 's4', name: 'YUNA（練習）', store: 'tamashima' },
  { id: 's5', name: 'ARISA（練習）', store: 'tamashima' },
];
export const MENUS: DemoMenu[] = [
  { id: 'm1', name: '整体', minutes: 45, price: 3980 },
  { id: 'm2', name: '美容鍼', minutes: 45, price: 3980 },
  { id: 'm3', name: 'ピラティス', minutes: 45, price: 3980 },
  { id: 'm4', name: '足つぼ', minutes: 30, price: 1980 },
];

export type BookingStatus = 'confirmed' | 'completed' | 'no_show' | 'cancelled';
export interface DemoBooking {
  id: string;
  store: StoreId;
  staffId: string;
  startMin: number;
  minutes: number;
  guestName: string;
  guestPhone: string;
  menuId: string;
  price: number;
  status: BookingStatus;
  isFirstVisit: boolean;
}

export type OffType = 'off' | 'busy';
export interface DemoOff {
  id: string; store: StoreId; staffId: string; startMin: number; endMin: number; type: OffType; reason: string;
}

export interface DemoLesson {
  id: string; store: StoreId; startMin: number; minutes: number; title: string; instructor: string; capacity: number; booked: number; price: number; cancelled: boolean;
}

export interface DemoHistory { id: string; atLabel: string; actor: string; action: '登録' | '変更' | '削除'; entity: string; summary: string; }

export const OPEN_MIN = 9 * 60;
export const CLOSE_MIN = 21 * 60;

export function minToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// 練習用の「今日」ラベル（固定・全画面で共通の1日を扱う）
export const DEMO_DATE_LABEL = '本日（練習）';

interface DemoState {
  bookings: DemoBooking[];
  offs: DemoOff[];
  lessons: DemoLesson[];
  history: DemoHistory[];
  hours: Record<StoreId, { open: string; close: string; closed: boolean }[]>; // [dow0..6]
}

let uid = 0;
const nid = (p: string) => `${p}-${++uid}`;
let clock = 9 * 60 + 5; // 履歴の時刻を少しずつ進めるための擬似時計
const stamp = () => { clock += 7; return minToHHMM(Math.min(clock, CLOSE_MIN)); };

function seed(): DemoState {
  uid = 0; clock = 9 * 60 + 5;
  const defHours = Array.from({ length: 7 }, () => ({ open: '09:00', close: '21:00', closed: false }));
  return {
    bookings: [
      { id: nid('b'), store: 'kanamitsu', staffId: 's1', startMin: 10 * 60, minutes: 45, guestName: '山田 花子', guestPhone: '090-1111-2222', menuId: 'm1', price: 3980, status: 'confirmed', isFirstVisit: true },
      { id: nid('b'), store: 'kanamitsu', staffId: 's3', startMin: 11 * 60 + 30, minutes: 45, guestName: '佐藤 美咲', guestPhone: '090-3333-4444', menuId: 'm2', price: 6600, status: 'confirmed', isFirstVisit: false },
      { id: nid('b'), store: 'kanamitsu', staffId: 's2', startMin: 14 * 60, minutes: 30, guestName: '鈴木 一郎', guestPhone: '090-5555-6666', menuId: 'm4', price: 2980, status: 'completed', isFirstVisit: false },
      { id: nid('b'), store: 'tamashima', staffId: 's4', startMin: 13 * 60, minutes: 45, guestName: '田中 陽子', guestPhone: '090-7777-8888', menuId: 'm3', price: 3980, status: 'confirmed', isFirstVisit: true },
    ],
    offs: [
      { id: nid('o'), store: 'kanamitsu', staffId: 's1', startMin: 12 * 60, endMin: 13 * 60, type: 'busy', reason: '外出' },
    ],
    lessons: [
      { id: nid('l'), store: 'tamashima', startMin: 18 * 60, minutes: 45, title: 'ピラティス', instructor: 'YUNA', capacity: 4, booked: 2, price: 3000, cancelled: false },
    ],
    history: [
      { id: nid('h'), atLabel: '09:02', actor: 'ネット予約', action: '登録', entity: '予約', summary: '山田 花子 様（整体 / 金光店）のネット予約が入りました' },
    ],
    hours: { tamashima: defHours.map((h) => ({ ...h })), kanamitsu: defHours.map((h) => ({ ...h })) },
  };
}

interface DemoCtx {
  state: DemoState;
  addBooking: (b: Omit<DemoBooking, 'id' | 'status'> & { status?: BookingStatus }) => void;
  updateBooking: (id: string, patch: Partial<DemoBooking>) => void;
  setBookingStatus: (id: string, status: BookingStatus) => void;
  addOff: (o: Omit<DemoOff, 'id'>) => void;
  removeOff: (id: string) => void;
  addLesson: (l: Omit<DemoLesson, 'id' | 'booked' | 'cancelled'>) => void;
  cancelLesson: (id: string) => void;
  setHours: (store: StoreId, dow: number, patch: Partial<{ open: string; close: string; closed: boolean }>) => void;
  reset: () => void;
}

const Ctx = createContext<DemoCtx | null>(null);
export const useDemo = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDemo must be used within DemoProvider');
  return c;
};

const menuName = (id: string) => MENUS.find((m) => m.id === id)?.name ?? 'メニュー';
const staffName = (id: string) => STAFF.find((s) => s.id === id)?.name ?? '担当';

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(seed);

  const log = (h: Omit<DemoHistory, 'id' | 'atLabel' | 'actor'>) =>
    ({ id: nid('h'), atLabel: stamp(), actor: 'あなた（練習）', ...h });

  const api: DemoCtx = useMemo(() => ({
    state,
    addBooking: (b) => setState((s) => {
      const nb: DemoBooking = { id: nid('b'), status: 'confirmed', ...b };
      return {
        ...s,
        bookings: [...s.bookings, nb],
        history: [log({ action: '登録', entity: '予約', summary: `${nb.guestName} 様（${menuName(nb.menuId)} / ${STORE_NAMES[nb.store]} / ${staffName(nb.staffId)}）${minToHHMM(nb.startMin)}〜 の予約を登録` }), ...s.history],
      };
    }),
    updateBooking: (id, patch) => setState((s) => {
      const cur = s.bookings.find((x) => x.id === id);
      return {
        ...s,
        bookings: s.bookings.map((x) => (x.id === id ? { ...x, ...patch } : x)),
        history: cur ? [log({ action: '変更', entity: '予約', summary: `${cur.guestName} 様の予約を変更（${minToHHMM(patch.startMin ?? cur.startMin)}〜 / ${patch.minutes ?? cur.minutes}分）` }), ...s.history] : s.history,
      };
    }),
    setBookingStatus: (id, status) => setState((s) => {
      const cur = s.bookings.find((x) => x.id === id);
      const label = status === 'completed' ? '来店完了' : status === 'no_show' ? '無断キャンセル' : status === 'cancelled' ? 'キャンセル' : '確定';
      return {
        ...s,
        bookings: s.bookings.map((x) => (x.id === id ? { ...x, status } : x)),
        history: cur ? [log({ action: status === 'cancelled' || status === 'no_show' ? '削除' : '変更', entity: '予約', summary: `${cur.guestName} 様の予約を「${label}」に変更` }), ...s.history] : s.history,
      };
    }),
    addOff: (o) => setState((s) => ({
      ...s,
      offs: [...s.offs, { id: nid('o'), ...o }],
      history: [log({ action: '登録', entity: o.type === 'off' ? 'スタッフ休み' : '予定', summary: `${staffName(o.staffId)} の${o.type === 'off' ? '休み' : '予定'}（${minToHHMM(o.startMin)}〜${minToHHMM(o.endMin)}）を登録` }), ...s.history],
    })),
    removeOff: (id) => setState((s) => {
      const cur = s.offs.find((x) => x.id === id);
      return {
        ...s,
        offs: s.offs.filter((x) => x.id !== id),
        history: cur ? [log({ action: '削除', entity: cur.type === 'off' ? 'スタッフ休み' : '予定', summary: `${staffName(cur.staffId)} の${cur.type === 'off' ? '休み' : '予定'}を削除` }), ...s.history] : s.history,
      };
    }),
    addLesson: (l) => setState((s) => ({
      ...s,
      lessons: [...s.lessons, { id: nid('l'), booked: 0, cancelled: false, ...l }],
      history: [log({ action: '登録', entity: 'グループレッスン', summary: `${l.title}（${STORE_NAMES[l.store]} ${minToHHMM(l.startMin)}〜 定員${l.capacity}名）を登録` }), ...s.history],
    })),
    cancelLesson: (id) => setState((s) => {
      const cur = s.lessons.find((x) => x.id === id);
      return {
        ...s,
        lessons: s.lessons.map((x) => (x.id === id ? { ...x, cancelled: true } : x)),
        history: cur ? [log({ action: '削除', entity: 'グループレッスン', summary: `${cur.title}（${minToHHMM(cur.startMin)}〜）をキャンセル` }), ...s.history] : s.history,
      };
    }),
    setHours: (store, dow, patch) => setState((s) => ({
      ...s,
      hours: { ...s.hours, [store]: s.hours[store].map((h, i) => (i === dow ? { ...h, ...patch } : h)) },
    })),
    reset: () => setState(seed()),
  }), [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
