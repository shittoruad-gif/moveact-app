import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// 手動予約入力
// ・電話・店頭で受けた予約を登録する（単発）。右パネルにその日の予約状況を表示
// ・「繰り返し予約」: 選択日を1回目として毎週/隔週で複数回をまとめて登録する。
//   recurrence_group_id（migration 045）を同一シリーズで共有する
// ・「先月の繰り返し予約から作成」: 対象月（今月/来月）の前月の定期予約シリーズを
//   同じ曜日・時刻で対象月（今日より後の日付のみ）へコピーする
// ・衝突チェックは担当スタッフ単位（app_bookings＋staff_unavailability＋airreserve_events、
//   ±15分バッファ）。重複はスキップ扱いにして理由を表示する
// ・日時はJST明示（+09:00）で保存する（素朴文字列はUTC解釈になるため禁止）

type StoreId = 'tamashima' | 'kanamitsu';

interface RosterRow { staff_id: string; full_name: string; store_id: string; }
interface Menu      { id: string; name: string; duration_minutes: number; price: number; treatment_type: string; }
interface SkillRow  { staff_id: string; treatment_type: string; }
interface MenuStore { store_id: string; treatment_menu_id: string; }

// 右パネル「この日の予約状況」の統合行（app_bookings＋airreserve_events）
interface DayRow {
  id: string;
  source: 'app' | 'air';
  starts_at: string;
  ends_at: string;
  name: string;          // 顧客名（AirReserveはsummary）
  menuName: string;
  staffName: string;
  status: string;        // appのみ（confirmed/completed/no_show）
  depositStatus: string; // appのみ
}

const STORE_LABEL: Record<StoreId, string> = { tamashima: '玉島店', kanamitsu: '金光店' };

// 前後の入れ替え時間（分）。091のバッファ込みEXCLUDE制約・スタッフアプリの定期予約と揃える
const BUFFER_MINUTES = 15;

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

const pad2 = (n: number) => String(n).padStart(2, '0');

// JST基準の今日（YYYY-MM-DD）。実行環境のタイムゾーンに依存しない
function isoToday() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  });
}

// 'YYYY-MM-DD' に日数を加算（TZ非依存のカレンダー計算）
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// 'YYYY-MM-DD' → '7/18(土)' 表記（曜日はTZ非依存で判定）
function fmtMdW(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}(${WEEKDAY_LABELS[w]})`;
}

// timestamptzをJSTで分解（+9hしてgetUTC系で読む。曜日もTZ非依存で取れる）
function jstParts(iso: string): { dateStr: string; hhmm: string; weekday: number } {
  const j = new Date(new Date(iso).getTime() + 9 * 3600000);
  return {
    dateStr: `${j.getUTCFullYear()}-${pad2(j.getUTCMonth() + 1)}-${pad2(j.getUTCDate())}`,
    hhmm: `${pad2(j.getUTCHours())}:${pad2(j.getUTCMinutes())}`,
    weekday: j.getUTCDay(),
  };
}

// JST基準の今日からoffsetか月後の年月（mは0始まり）
function monthOffsetJst(offset: number): { y: number; m: number } {
  const t = new Date(Date.now() + 9 * 3600000);
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
}

function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const d = new Date(Date.UTC(y, m + delta, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
}

// 対象月のstarts_at検索窓（月初〜翌月初、JST明示）
function monthWindow(y: number, m: number): { lo: string; hi: string } {
  const next = addMonths(y, m, 1);
  return {
    lo: `${y}-${pad2(m + 1)}-01T00:00:00+09:00`,
    hi: `${next.y}-${pad2(next.m + 1)}-01T00:00:00+09:00`,
  };
}

// 対象月内で指定曜日に該当し、かつ今日より後の日付一覧（曜日はTZ非依存で判定）
function candidateDates(y: number, m: number, weekday: number, todayStr: string): string[] {
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= days; d++) {
    if (new Date(Date.UTC(y, m, d)).getUTCDay() !== weekday) continue;
    const dateStr = `${y}-${pad2(m + 1)}-${pad2(d)}`;
    if (dateStr <= todayStr) continue; // 生成対象は今日より後のみ
    out.push(dateStr);
  }
  return out;
}

// ── スタッフのビジー区間（衝突チェック用）────────────────────
// 予約=各行のバッファ込み / ブロック=素の時間 / AirReserve=既定バッファ込み。
// staff_idが無い行（未割当の予約・全店ブロック）は誰を占有しているか特定できないため、
// 安全側で全スタッフをブロック扱いにする（staffId=null）。

interface BusyIv { staffId: string | null; s: number; e: number; }

interface BusyBookingRow {
  staff_id: string | null; starts_at: string; ends_at: string;
  buffer_before: number | null; buffer_after: number | null;
}
interface BusyRangeRow { staff_id: string | null; starts_at: string; ends_at: string; }

// 期間内のビジー区間を店舗単位でまとめて取得（+09:00日窓）。
// staffIdsを渡すと該当スタッフ＋未割当行のみに絞って転送量を抑える
async function fetchBusyIntervals(
  storeId: StoreId, loIso: string, hiIso: string, staffIds?: string[],
): Promise<BusyIv[]> {
  const staffOr = staffIds && staffIds.length > 0
    ? `staff_id.is.null,staff_id.in.(${staffIds.join(',')})`
    : null;

  let bq = supabase.from('app_bookings')
    .select('staff_id, starts_at, ends_at, buffer_before, buffer_after')
    .eq('store_id', storeId)
    .neq('status', 'cancelled')
    .gte('starts_at', loIso)
    .lte('starts_at', hiIso);
  if (staffOr) bq = bq.or(staffOr);

  let uq = supabase.from('staff_unavailability')
    .select('staff_id, starts_at, ends_at')
    .or(`store_id.eq.${storeId},store_id.is.null`)
    .lte('starts_at', hiIso)
    .gte('ends_at', loIso);
  if (staffOr) uq = uq.or(staffOr);

  let aq = supabase.from('airreserve_events')
    .select('staff_id, starts_at, ends_at')
    .eq('store_id', storeId)
    .gte('starts_at', loIso)
    .lte('starts_at', hiIso);
  if (staffOr) aq = aq.or(staffOr);

  const [bk, un, air] = await Promise.all([bq, uq, aq]);
  const err = bk.error ?? un.error ?? air.error;
  if (err) throw new Error(err.message);

  const out: BusyIv[] = [];
  for (const b of ((bk.data as unknown as BusyBookingRow[]) ?? [])) {
    out.push({
      staffId: b.staff_id,
      s: new Date(b.starts_at).getTime() - (b.buffer_before ?? BUFFER_MINUTES) * 60000,
      e: new Date(b.ends_at).getTime() + (b.buffer_after ?? BUFFER_MINUTES) * 60000,
    });
  }
  for (const u of ((un.data as unknown as BusyRangeRow[]) ?? [])) {
    out.push({ staffId: u.staff_id, s: new Date(u.starts_at).getTime(), e: new Date(u.ends_at).getTime() });
  }
  for (const a of ((air.data as unknown as BusyRangeRow[]) ?? [])) {
    out.push({
      staffId: a.staff_id,
      s: new Date(a.starts_at).getTime() - BUFFER_MINUTES * 60000,
      e: new Date(a.ends_at).getTime() + BUFFER_MINUTES * 60000,
    });
  }
  return out;
}

// 候補（±15分バッファ込み）が指定スタッフのビジー区間と重なるか
function hasClash(busy: BusyIv[], staffId: string, startMs: number, endMs: number): boolean {
  const bufS = startMs - BUFFER_MINUTES * 60000;
  const bufE = endMs + BUFFER_MINUTES * 60000;
  return busy.some(iv => (iv.staffId === null || iv.staffId === staffId) && bufS < iv.e && bufE > iv.s);
}

// 生成予定1件（繰り返し予約・先月コピー共通のプレビュー行）
interface PlanItem {
  key: string;
  dateStr: string;   // 'YYYY-MM-DD'
  hhmm: string;      // 'HH:MM'
  startIso: string;
  endIso: string;
  ok: boolean;
  reason: string | null;
  checked: boolean;
  seriesKey?: string; // コピー用: 由来シリーズのrecurrence_group_id
  label?: string;     // コピー用: 顧客名
}

// 先月の繰り返し予約をシリーズ単位に集約した1行
interface CopySeries {
  groupId: string;
  customerName: string;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  userId: string | null;
  menuId: string;
  menuName: string;
  staffId: string | null;
  staffName: string;
  weekday: number;
  hhmm: string;
  durationMin: number;
  count: number; // 先月の回数
}

interface SeriesSourceRow {
  recurrence_group_id: string;
  starts_at: string;
  ends_at: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  user_id: string | null;
  treatment_menu_id: string;
  staff_id: string | null;
  menu: { name: string } | null;
  staff: { full_name: string } | null;
}

// コピー可能なシリーズか（担当必須・氏名情報のいずれか必須）
function isCopyableSeries(s: CopySeries): boolean {
  return !!s.staffId && (s.guestName !== null || s.userId !== null);
}

// 繰り返し回数の選択肢（2〜24回）
const RECUR_COUNTS = Array.from({ length: 23 }, (_, i) => i + 2);

const INIT_FORM = {
  storeId: 'tamashima' as StoreId,
  staffId: '',
  menuId: '',
  date: isoToday(),
  time: '10:00',
  guestName: '',
  guestPhone: '',
  guestEmail: '',
  request: '',
  isFirstVisit: false,
};

// タイムラインの空き枠クリックから渡されるURLパラメータを初期値に反映
// 形式: /new-booking?store=tamashima&staff=<uuid|空>&date=YYYY-MM-DD&time=HH:MM
function formFromParams(params: URLSearchParams): typeof INIT_FORM {
  const form = { ...INIT_FORM, date: isoToday() };
  const store = params.get('store');
  if (store === 'tamashima' || store === 'kanamitsu') form.storeId = store;
  const staff = params.get('staff');
  if (staff) form.staffId = staff;
  const date = params.get('date');
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) form.date = date;
  const time = params.get('time');
  if (time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) form.time = time;
  return form;
}

export function NewBooking() {
  const [searchParams]            = useSearchParams();
  const [roster, setRoster]       = useState<RosterRow[]>([]);
  const [menuList, setMenuList]   = useState<Menu[]>([]);
  const [menuStores, setMenuStores] = useState<MenuStore[]>([]);
  const [skillRows, setSkillRows] = useState<SkillRow[]>([]);
  const [masterLoaded, setMasterLoaded] = useState(false);
  const [form, setForm]           = useState(() => formFromParams(searchParams));
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [dayRows, setDayRows]     = useState<DayRow[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  // 取得エラーは必ず画面に出す（「予約なし」と誤認して二重登録する事故を防ぐ）
  const [dayErr, setDayErr] = useState<string | null>(null);

  // ── 繰り返し予約 ──
  const [recurOn, setRecurOn]         = useState(false);
  const [recurWeeks, setRecurWeeks]   = useState<1 | 2>(1); // 1=毎週 / 2=隔週
  const [recurCount, setRecurCount]   = useState(4);
  const [recurItems, setRecurItems]   = useState<PlanItem[] | null>(null);
  const [recurChecking, setRecurChecking] = useState(false);
  const [recurSaving, setRecurSaving] = useState(false);
  const [recurError, setRecurError]   = useState<string | null>(null);
  const [recurNote, setRecurNote]     = useState<string | null>(null);

  // ── 先月の繰り返し予約からコピー ──
  const [copyTargetMonth, setCopyTargetMonth] = useState<'this' | 'next'>('this');
  const [copySeries, setCopySeries]   = useState<CopySeries[] | null>(null); // null=読み込み中
  const [copySelected, setCopySelected] = useState<Set<string>>(new Set());
  const [copyItems, setCopyItems]     = useState<PlanItem[] | null>(null);
  const [copyNoDates, setCopyNoDates] = useState<string[]>([]);
  const [copyChecking, setCopyChecking] = useState(false);
  const [copySaving, setCopySaving]   = useState(false);
  const [copyError, setCopyError]     = useState<string | null>(null);
  const [copyNote, setCopyNote]       = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      // staff_stores(is_active=true) × profiles のビュー。タイムラインの列と同じ母集団
      supabase.from('public_staff_roster').select('staff_id, full_name, store_id').order('full_name'),
      supabase.from('treatment_menus').select('id, name, duration_minutes, price, treatment_type')
        .eq('is_active', true).order('sort_order'),
      supabase.from('store_treatment_menus').select('store_id, treatment_menu_id')
        .eq('is_available', true),
      // スタッフ施術スキル（メニューの施術種別で担当を絞る）
      supabase.from('staff_skills').select('staff_id, treatment_type'),
    ]).then(([r, m, sm, sk]) => {
      if (r.data)  setRoster(r.data as RosterRow[]);
      if (m.data)  setMenuList(m.data as Menu[]);
      if (sm.data) setMenuStores(sm.data as MenuStore[]);
      if (sk.data) setSkillRows(sk.data as SkillRow[]);
      setMasterLoaded(true);
    });
  }, []);

  // 選択中メニューの施術種別を担当できるスタッフ集合（メニュー未選択なら絞らない=null）
  const skilledForMenu = useMemo(() => {
    const mt = menuList.find(m => m.id === form.menuId)?.treatment_type ?? null;
    if (!mt) return null;
    return new Set(skillRows.filter(s => s.treatment_type === mt).map(s => s.staff_id));
  }, [menuList, form.menuId, skillRows]);

  // 選択店舗で稼働し、かつ選択メニューの施術を担当できるスタッフ（重複staff_idは除去）
  const staffList = useMemo(() => {
    const seen = new Set<string>();
    return roster
      .filter(r => r.store_id === form.storeId)
      .filter(r => !skilledForMenu || skilledForMenu.has(r.staff_id))
      .filter(r => (seen.has(r.staff_id) ? false : (seen.add(r.staff_id), true)))
      .map(r => ({ id: r.staff_id, full_name: r.full_name }));
  }, [roster, form.storeId, skilledForMenu]);

  // メニュー変更で、選択中の担当がその施術を担当できなくなったら担当をクリアする
  useEffect(() => {
    if (form.staffId && skilledForMenu && !skilledForMenu.has(form.staffId)) {
      setForm(f => ({ ...f, staffId: '' }));
    }
  }, [skilledForMenu, form.staffId]);

  // 選択店舗で提供中のメニュー
  const storeMenus = useMemo(() => {
    const ids = new Set(
      menuStores.filter(x => x.store_id === form.storeId).map(x => x.treatment_menu_id),
    );
    return menuList.filter(m => ids.has(m.id));
  }, [menuList, menuStores, form.storeId]);

  // 店舗変更時: 選択中のスタッフ/メニューが変更後の店舗で対象外なら選択解除
  // （マスタ読み込み完了前は判定しない＝URLプレフィルを消さない）
  useEffect(() => {
    if (!masterLoaded) return;
    setForm(f => {
      const staffOk = !f.staffId ||
        roster.some(r => r.store_id === f.storeId && r.staff_id === f.staffId);
      const menuOk = !f.menuId ||
        menuStores.some(x => x.store_id === f.storeId && x.treatment_menu_id === f.menuId);
      if (staffOk && menuOk) return f;
      return { ...f, staffId: staffOk ? f.staffId : '', menuId: menuOk ? f.menuId : '' };
    });
  }, [masterLoaded, form.storeId, roster, menuStores]);

  // ── 既存予約の可視化: 選択中の店舗・日付の予約を統合取得 ──
  // app_bookings(キャンセル除外・+09:00日窓) と airreserve_events(同窓) を時刻順に統合
  const loadDayBookings = useCallback(async (storeId: StoreId, dateStr: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { setDayRows([]); return; }
    setDayLoading(true);
    const lo = `${dateStr}T00:00:00+09:00`;
    const hi = `${dateStr}T23:59:59+09:00`;

    const [b, a] = await Promise.all([
      supabase
        .from('app_bookings')
        .select(`
          id, starts_at, ends_at, status, deposit_status, guest_name,
          menu:treatment_menu_id(name),
          staff:staff_id(full_name)
        `)
        .eq('store_id', storeId)
        .neq('status', 'cancelled')
        .gte('starts_at', lo)
        .lte('starts_at', hi)
        .order('starts_at'),
      supabase
        .from('airreserve_events')
        .select('id, staff_id, starts_at, ends_at, summary')
        .eq('store_id', storeId)
        .gte('starts_at', lo)
        .lte('starts_at', hi)
        .order('starts_at'),
    ]);

    type AppRow = {
      id: string; starts_at: string; ends_at: string; status: string; deposit_status: string;
      guest_name: string;
      menu: { name: string } | null;
      staff: { full_name: string } | null;
    };
    type AirRow = { id: string; staff_id: string | null; starts_at: string; ends_at: string; summary: string | null };

    const appRows: DayRow[] = ((b.data as unknown as AppRow[]) ?? []).map(r => ({
      id: `app-${r.id}`,
      source: 'app',
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      name: r.guest_name,
      menuName: r.menu?.name ?? '',
      staffName: r.staff?.full_name ?? '',
      status: r.status,
      depositStatus: r.deposit_status,
    }));
    const airRows: DayRow[] = ((a.data as unknown as AirRow[]) ?? []).map(r => ({
      id: `air-${r.id}`,
      source: 'air',
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      name: r.summary ?? '（内容未取得）',
      menuName: '',
      staffName: roster.find(x => x.staff_id === r.staff_id)?.full_name ?? '',
      status: '',
      depositStatus: '',
    }));

    const fetchErr = b.error ?? a.error;
    setDayErr(fetchErr
      ? `予約状況の取得に失敗しました。既存の予約が表示されていない可能性があるため、登録前にご注意ください。（詳細: ${fetchErr.message}）`
      : null);

    setDayRows(
      [...appRows, ...airRows].sort((x, y) => x.starts_at.localeCompare(y.starts_at)),
    );
    setDayLoading(false);
  }, [roster]);

  // 日付・店舗の変更で自動更新
  useEffect(() => {
    loadDayBookings(form.storeId, form.date);
  }, [loadDayBookings, form.storeId, form.date]);

  const set = <K extends keyof typeof INIT_FORM>(key: K, val: (typeof INIT_FORM)[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const selectedMenu = menuList.find(m => m.id === form.menuId);

  const endTime = (() => {
    if (!selectedMenu || !form.date || !form.time) return null;
    const s = new Date(`${form.date}T${form.time}:00+09:00`);
    s.setMinutes(s.getMinutes() + selectedMenu.duration_minutes);
    return s.toLocaleTimeString('ja-JP', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
    });
  })();

  // 選択中の時間帯（[starts, ends) 区間）。右パネルの重なりハイライトに使用
  const selectedRange = useMemo(() => {
    if (!form.date || !form.time) return null;
    const s = new Date(`${form.date}T${form.time}:00+09:00`);
    if (Number.isNaN(s.getTime())) return null;
    const dur = selectedMenu?.duration_minutes ?? 60;
    return { start: s.getTime(), end: s.getTime() + dur * 60 * 1000 };
  }, [form.date, form.time, selectedMenu]);

  const overlapsSelected = (row: DayRow) => {
    if (!selectedRange) return false;
    return new Date(row.starts_at).getTime() < selectedRange.end &&
           new Date(row.ends_at).getTime() > selectedRange.start;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (recurOn) return; // 繰り返し予約は「繰り返し予約」欄の確認→登録フローで行う
    if (!form.guestName.trim()) { setError('お名前を入力してください'); return; }
    if (!form.guestPhone.trim()) { setError('電話番号を入力してください'); return; }
    if (!form.menuId) { setError('メニューを選択してください'); return; }
    // 施術スキルの整合ガード（多重防御。通常はドロップダウンで弾かれる）
    if (form.staffId && skilledForMenu && !skilledForMenu.has(form.staffId)) {
      setError('選択した担当スタッフはこのメニューを担当できません'); return;
    }

    const startsAt = new Date(`${form.date}T${form.time}:00+09:00`); // JST明示
    const duration = selectedMenu?.duration_minutes ?? 60;
    const endsAt   = new Date(startsAt.getTime() + duration * 60 * 1000);

    setLoading(true); setError(null);

    // AirReserve取込予約との重複チェック
    // （app_bookings同士のEXCLUDE制約ではAirReserve側の重複は防げないため、保存前に確認する）
    // 重複条件: 既存.starts_at < 新規.ends_at AND 既存.ends_at > 新規.starts_at（[starts, ends) 区間）
    let airQ = supabase
      .from('airreserve_events')
      .select('id, staff_id, starts_at, ends_at')
      .eq('store_id', form.storeId)
      .lt('starts_at', endsAt.toISOString())
      .gt('ends_at', startsAt.toISOString());
    if (form.staffId) airQ = airQ.eq('staff_id', form.staffId);

    const { data: airOverlaps, error: airErr } = await airQ;

    if (airErr) {
      setLoading(false);
      setError(`エラー: AirReserve予約の重複確認に失敗しました（${airErr.message}）`);
      return;
    }
    if (form.staffId && (airOverlaps?.length ?? 0) > 0) {
      // 指名スタッフのAirReserve予約と重なる → 保存をブロック
      setLoading(false);
      setError('この時間帯はAirReserveの予約と重複しています。別の時間を選んでください。');
      return;
    }
    if (!form.staffId && (airOverlaps?.length ?? 0) > 0) {
      // 指名なし（未割当）の場合、この店舗の誰かのAirReserve予約と重なる → 警告して確認
      // （このフォームでは自動割当は行われないため、ブロックせず確認のみ）
      const proceed = window.confirm(
        'この時間帯はこの店舗のAirReserveの予約と重複しています。\n担当スタッフが未指定のため、担当を決める際に時間が重なる可能性があります。\nこのまま登録しますか？',
      );
      if (!proceed) {
        setLoading(false);
        return;
      }
    }

    const { error: err } = await supabase.from('app_bookings').insert({
      store_id:           form.storeId,
      treatment_menu_id:  form.menuId,
      staff_id:           form.staffId || null,
      starts_at:          startsAt.toISOString(),
      ends_at:            endsAt.toISOString(),
      guest_name:         form.guestName.trim(),
      guest_phone:        form.guestPhone.trim(),
      guest_phone_norm:   form.guestPhone.replace(/\D/g, ''),
      guest_email:        form.guestEmail.trim() || null,
      customer_request:   form.request.trim() || null,
      status:             'confirmed',
      source:             'staff',
      created_by:         'staff',
      is_first_visit:     form.isFirstVisit,
      deposit_status:     'none',
      payment_status:     'not_required',
    });

    setLoading(false);

    if (err) {
      if (err.code === '23P01') {
        setError('この時間帯はすでに予約が入っています。別の時間を選んでください。');
      } else {
        setError(`エラー: ${err.message}`);
      }
      return;
    }

    setSuccess(true);
    // 日付・店舗を保持してクリア
    setForm(f => ({ ...INIT_FORM, storeId: f.storeId, date: f.date }));
    loadDayBookings(form.storeId, form.date); // 登録した予約を右パネルへ即反映
    setTimeout(() => setSuccess(false), 4000);
  };

  // ── 繰り返し予約 ─────────────────────────────

  // 日程に影響する入力が変わったら確認済みプレビューは破棄する（前提が変わるため）
  useEffect(() => {
    setRecurItems(null);
  }, [form.storeId, form.staffId, form.menuId, form.date, form.time, recurWeeks, recurCount, recurOn]);

  const recurSelectedCount = recurItems?.filter(i => i.ok && i.checked).length ?? 0;

  const toggleRecurItem = (key: string) =>
    setRecurItems(items => items && items.map(i => (i.key === key ? { ...i, checked: !i.checked } : i)));

  // 生成予定の日程（1回目=選択日、以降+7日 or +14日）を作り、担当スタッフの衝突を判定する
  const handleRecurPreview = async () => {
    setRecurError(null); setRecurNote(null);
    if (!form.guestName.trim()) { setRecurError('お名前を入力してください'); return; }
    if (!form.guestPhone.trim()) { setRecurError('電話番号を入力してください'); return; }
    if (!form.menuId) { setRecurError('メニューを選択してください'); return; }
    if (!form.staffId) { setRecurError('繰り返し予約では担当スタッフを選択してください'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || !form.time) { setRecurError('日付と開始時刻を入力してください'); return; }

    setRecurChecking(true);
    try {
      const duration = selectedMenu?.duration_minutes ?? 60;
      const dates = Array.from({ length: recurCount }, (_, i) => addDays(form.date, i * recurWeeks * 7));
      const busy = await fetchBusyIntervals(
        form.storeId,
        `${dates[0]}T00:00:00+09:00`,
        `${dates[dates.length - 1]}T23:59:59+09:00`,
        [form.staffId],
      );
      const items: PlanItem[] = dates.map(dateStr => {
        const startIso = `${dateStr}T${form.time}:00+09:00`;
        const startMs = new Date(startIso).getTime();
        const endMs = startMs + duration * 60000;
        const clash = hasClash(busy, form.staffId, startMs, endMs);
        return {
          key: dateStr,
          dateStr,
          hhmm: form.time,
          startIso,
          endIso: new Date(endMs).toISOString(),
          ok: !clash,
          reason: clash ? '既存の予約・予定と重なっています' : null,
          checked: !clash,
        };
      });
      setRecurItems(items);
    } catch (e) {
      setRecurError(`エラー: 空き状況の確認に失敗しました（${e instanceof Error ? e.message : String(e)}）`);
    }
    setRecurChecking(false);
  };

  // 選択した日程を1件ずつINSERT（recurrence_group_idを共有）。
  // 23P01/exclusion（DB制約が最終防衛線）は該当日だけスキップに算入する
  const handleRecurApply = async () => {
    if (!recurItems) return;
    const chosen = recurItems.filter(i => i.ok && i.checked);
    if (chosen.length === 0) { setRecurError('登録する日程を選択してください'); return; }

    setRecurSaving(true); setRecurError(null);
    const groupId = crypto.randomUUID();
    let inserted = 0;
    const skipDetails: { dateStr: string; msg: string }[] = [];

    for (const item of chosen) {
      const { error: err } = await supabase.from('app_bookings').insert({
        store_id:           form.storeId,
        treatment_menu_id:  form.menuId,
        staff_id:           form.staffId,
        starts_at:          item.startIso,
        ends_at:            item.endIso,
        guest_name:         form.guestName.trim(),
        guest_phone:        form.guestPhone.trim(),
        guest_phone_norm:   form.guestPhone.replace(/\D/g, ''),
        guest_email:        form.guestEmail.trim() || null,
        customer_request:   form.request.trim() || null,
        status:             'confirmed',
        source:             'staff',
        created_by:         'staff',
        is_first_visit:     form.isFirstVisit,
        deposit_status:     'none',
        payment_status:     'not_required',
        recurrence_group_id: groupId,
      });
      if (!err) {
        inserted += 1;
      } else if (err.code === '23P01') {
        skipDetails.push({ dateStr: item.dateStr, msg: `${fmtMdW(item.dateStr)}は既存予約と重なるためスキップ` });
      } else {
        skipDetails.push({ dateStr: item.dateStr, msg: `${fmtMdW(item.dateStr)}はエラーのためスキップ（${err.message}）` });
      }
    }

    // プレビュー時点で重複していた分もスキップとして案内する
    for (const item of recurItems.filter(i => !i.ok)) {
      skipDetails.push({ dateStr: item.dateStr, msg: `${fmtMdW(item.dateStr)}は既存予約と重なるためスキップ` });
    }
    skipDetails.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

    const parts = skipDetails.map(d => d.msg);
    const uncheckedCount = recurItems.filter(i => i.ok && !i.checked).length;
    if (uncheckedCount > 0) parts.push(`${uncheckedCount}件は選択を外したため登録していません`);

    let msg = `${recurItems.length}件中${inserted}件を登録しました`;
    if (parts.length > 0) msg += `（${parts.join('、')}）`;
    setRecurNote(msg);
    setRecurItems(null);

    if (inserted > 0) {
      // 単発登録と同様、店舗・日付を保持してフォームをクリアし、右パネルへ即反映
      setForm(f => ({ ...INIT_FORM, storeId: f.storeId, date: f.date }));
      loadDayBookings(form.storeId, form.date);
    }
    setRecurSaving(false);
  };

  // ── 先月の繰り返し予約からコピー ─────────────────

  const copyTarget = copyTargetMonth === 'next' ? monthOffsetJst(1) : monthOffsetJst(0);
  const copyPrev = addMonths(copyTarget.y, copyTarget.m, -1); // 「先月」= 対象月の前月
  const copyTargetWord = copyTargetMonth === 'next' ? '来月' : '今月';
  const copyTargetLabel = `${copyTarget.m + 1}月`;
  const copyPrevLabel = `${copyPrev.m + 1}月`;

  const copySelectableList = (copySeries ?? []).filter(isCopyableSeries);
  const copyAllSelected =
    copySelectableList.length > 0 && copySelectableList.every(s => copySelected.has(s.groupId));
  const copySelectedCount = copyItems?.filter(i => i.ok && i.checked).length ?? 0;

  const toggleCopySeries = (groupId: string) => {
    setCopySelected(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    setCopyItems(null); // 選択が変わったらプレビューは破棄
  };

  const toggleCopyAllSeries = () => {
    setCopySelected(copyAllSelected ? new Set() : new Set(copySelectableList.map(s => s.groupId)));
    setCopyItems(null);
  };

  const toggleCopyItem = (key: string) =>
    setCopyItems(items => items && items.map(i => (i.key === key ? { ...i, checked: !i.checked } : i)));

  // 選択店舗の先月分（recurrence_group_id IS NOT NULL, status<>'cancelled'）をシリーズ単位に集約
  useEffect(() => {
    let cancelled = false;
    setCopySeries(null);
    setCopySelected(new Set());
    setCopyItems(null);
    setCopyNoDates([]);
    setCopyError(null);
    setCopyNote(null);

    (async () => {
      const target = copyTargetMonth === 'next' ? monthOffsetJst(1) : monthOffsetJst(0);
      const prev = addMonths(target.y, target.m, -1);
      const win = monthWindow(prev.y, prev.m);

      const { data, error: err } = await supabase
        .from('app_bookings')
        .select(`
          recurrence_group_id, starts_at, ends_at,
          guest_name, guest_phone, guest_email, user_id,
          treatment_menu_id, staff_id,
          menu:treatment_menu_id(name),
          staff:staff_id(full_name)
        `)
        .eq('store_id', form.storeId)
        .neq('status', 'cancelled')
        .not('recurrence_group_id', 'is', null)
        .gte('starts_at', win.lo)
        .lt('starts_at', win.hi)
        .order('starts_at');

      if (cancelled) return;
      if (err) {
        setCopyError(`エラー: 先月の繰り返し予約の読み込みに失敗しました（${err.message}）`);
        setCopySeries([]);
        return;
      }

      // シリーズ単位に集約（代表行=最新回。曜日・時刻・メニュー・担当は最新回に従う）
      const map = new Map<string, { rep: SeriesSourceRow; count: number }>();
      for (const r of ((data as unknown as SeriesSourceRow[]) ?? [])) {
        const cur = map.get(r.recurrence_group_id);
        if (cur) { cur.count += 1; cur.rep = r; }
        else map.set(r.recurrence_group_id, { rep: r, count: 1 });
      }

      // 会員予約（guest_name無し）の氏名をまとめて取得
      const userIds = [...new Set(
        [...map.values()].filter(v => !v.rep.guest_name && v.rep.user_id).map(v => v.rep.user_id as string),
      )];
      const profileNames = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
        for (const p of (((profs as { id: string; full_name: string | null }[] | null) ?? []))) {
          profileNames.set(p.id, p.full_name ?? '');
        }
      }
      if (cancelled) return;

      const list: CopySeries[] = [...map.entries()].map(([groupId, { rep, count }]) => {
        const s = jstParts(rep.starts_at);
        const durationMin = Math.max(
          5, Math.round((new Date(rep.ends_at).getTime() - new Date(rep.starts_at).getTime()) / 60000),
        );
        return {
          groupId,
          customerName: rep.guest_name
            ?? (rep.user_id ? (profileNames.get(rep.user_id) || '（会員）') : '（名前未設定）'),
          guestName: rep.guest_name,
          guestPhone: rep.guest_phone,
          guestEmail: rep.guest_email,
          userId: rep.user_id,
          menuId: rep.treatment_menu_id,
          menuName: rep.menu?.name ?? '-',
          staffId: rep.staff_id,
          staffName: rep.staff?.full_name ?? '（未指定）',
          weekday: s.weekday,
          hhmm: s.hhmm,
          durationMin,
          count,
        };
      }).sort((a, b) =>
        a.weekday - b.weekday ||
        a.hhmm.localeCompare(b.hhmm) ||
        a.customerName.localeCompare(b.customerName, 'ja'),
      );

      setCopySeries(list);
      setCopySelected(new Set(list.filter(isCopyableSeries).map(s => s.groupId)));
    })();

    return () => { cancelled = true; };
  }, [form.storeId, copyTargetMonth]);

  // 選択シリーズを対象月の同曜日・同時刻（今日より後のみ）へ展開し、担当スタッフの衝突を判定
  const handleCopyPreview = async () => {
    if (!copySeries) return;
    setCopyError(null); setCopyNote(null);
    const selected = copySeries.filter(s => copySelected.has(s.groupId) && isCopyableSeries(s));
    if (selected.length === 0) { setCopyError('コピーする予約を選択してください'); return; }

    setCopyChecking(true);
    try {
      const today = isoToday();
      const items: PlanItem[] = [];
      const noDates: string[] = [];

      for (const s of selected) {
        const dates = candidateDates(copyTarget.y, copyTarget.m, s.weekday, today);
        if (dates.length === 0) {
          noDates.push(`${s.customerName}様（${WEEKDAY_LABELS[s.weekday]}曜 ${s.hhmm}）`);
          continue;
        }
        for (const dateStr of dates) {
          const startIso = `${dateStr}T${s.hhmm}:00+09:00`;
          const startMs = new Date(startIso).getTime();
          const endMs = startMs + s.durationMin * 60000;
          items.push({
            key: `${s.groupId}|${dateStr}`,
            dateStr,
            hhmm: s.hhmm,
            startIso,
            endIso: new Date(endMs).toISOString(),
            ok: true,
            reason: null,
            checked: true,
            seriesKey: s.groupId,
            label: s.customerName,
          });
        }
      }

      if (items.length === 0) {
        setCopyNoDates(noDates);
        setCopyItems(null);
        setCopyError('対象月に登録できる日がありません（今日より後の日付のみが対象です）');
        setCopyChecking(false);
        return;
      }

      const dateStrs = items.map(i => i.dateStr).sort();
      const staffIds = [...new Set(selected.map(s => s.staffId as string))];
      const busy = await fetchBusyIntervals(
        form.storeId,
        `${dateStrs[0]}T00:00:00+09:00`,
        `${dateStrs[dateStrs.length - 1]}T23:59:59+09:00`,
        staffIds,
      );
      const bySeries = new Map(selected.map(s => [s.groupId, s]));
      for (const item of items) {
        const s = bySeries.get(item.seriesKey as string);
        if (!s) continue;
        const startMs = new Date(item.startIso).getTime();
        const endMs = startMs + s.durationMin * 60000;
        if (hasClash(busy, s.staffId as string, startMs, endMs)) {
          item.ok = false;
          item.reason = '既存の予約・予定と重なっています';
          item.checked = false;
        }
      }
      items.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.hhmm.localeCompare(b.hhmm));

      setCopyNoDates(noDates);
      setCopyItems(items);
    } catch (e) {
      setCopyError(`エラー: 空き状況の確認に失敗しました（${e instanceof Error ? e.message : String(e)}）`);
    }
    setCopyChecking(false);
  };

  // 選択した日程を1件ずつINSERT。シリーズごとに新しいrecurrence_group_idを発行し、
  // ゲスト情報とメニュー・担当を引き継ぐ。23P01/exclusionは該当日だけスキップに算入
  const handleCopyApply = async () => {
    if (!copyItems || !copySeries) return;
    const chosen = copyItems.filter(i => i.ok && i.checked);
    if (chosen.length === 0) { setCopyError('登録する日程を選択してください'); return; }

    setCopySaving(true); setCopyError(null);
    const bySeries = new Map(copySeries.map(s => [s.groupId, s]));
    const newGroupIds = new Map<string, string>();
    let inserted = 0;
    const skipDetails: { dateStr: string; msg: string }[] = [];

    for (const item of chosen) {
      const s = bySeries.get(item.seriesKey as string);
      if (!s) continue;
      let gid = newGroupIds.get(s.groupId);
      if (!gid) { gid = crypto.randomUUID(); newGroupIds.set(s.groupId, gid); }

      const { error: err } = await supabase.from('app_bookings').insert({
        store_id:           form.storeId,
        treatment_menu_id:  s.menuId,
        staff_id:           s.staffId,
        starts_at:          item.startIso,
        ends_at:            item.endIso,
        user_id:            s.userId,
        guest_name:         s.guestName,
        guest_phone:        s.guestPhone,
        guest_phone_norm:   s.guestPhone ? s.guestPhone.replace(/\D/g, '') : null,
        guest_email:        s.guestEmail,
        status:             'confirmed',
        source:             'staff',
        created_by:         'staff',
        is_first_visit:     false,
        deposit_status:     'none',
        payment_status:     'not_required',
        recurrence_group_id: gid,
      });
      if (!err) {
        inserted += 1;
      } else if (err.code === '23P01') {
        skipDetails.push({
          dateStr: item.dateStr,
          msg: `${item.label}様の${fmtMdW(item.dateStr)}は既存予約と重なるためスキップ`,
        });
      } else {
        skipDetails.push({
          dateStr: item.dateStr,
          msg: `${item.label}様の${fmtMdW(item.dateStr)}はエラーのためスキップ（${err.message}）`,
        });
      }
    }

    // プレビュー時点で重複していた分もスキップとして案内する
    for (const item of copyItems.filter(i => !i.ok)) {
      skipDetails.push({
        dateStr: item.dateStr,
        msg: `${item.label}様の${fmtMdW(item.dateStr)}は既存予約と重なるためスキップ`,
      });
    }
    skipDetails.sort((a, b) => a.dateStr.localeCompare(b.dateStr));

    const parts = skipDetails.map(d => d.msg);
    const uncheckedCount = copyItems.filter(i => i.ok && !i.checked).length;
    if (uncheckedCount > 0) parts.push(`${uncheckedCount}件は選択を外したため登録していません`);

    let msg = `${copyTargetLabel}に${copyItems.length}件中${inserted}件を登録しました`;
    if (parts.length > 0) msg += `（${parts.join('、')}）`;
    setCopyNote(msg);
    setCopyItems(null);
    setCopyNoDates([]);
    loadDayBookings(form.storeId, form.date); // 表示中の日に登録した場合に右パネルへ即反映
    setCopySaving(false);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">手動予約入力</h1>
        <p className="page-help">
          電話や店頭で受けた予約を登録します。毎週同じ曜日・時間の予約は「繰り返し予約」でまとめて登録できます。
        </p>
      </div>

      {success && (
        <div
          className="note"
          role="status"
          style={{ background: 'var(--green-weak)', color: 'var(--green)', marginBottom: 16 }}
        >
          予約を登録しました
        </div>
      )}
      {error && (
        <div
          className="note"
          role="alert"
          style={{ background: 'var(--red-weak)', color: 'var(--red)', marginBottom: 16 }}
        >
          {error}
        </div>
      )}

      {/* 左=入力フォーム / 右=この日の予約状況。狭い画面では縦積み */}
      <style>{`
        .nb-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
          gap: 16px;
          align-items: start;
        }
        .nb-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }
        @media (max-width: 900px) {
          .nb-layout { grid-template-columns: 1fr; }
        }
        @media (max-width: 560px) {
          .nb-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <div className="nb-layout">
        {/* ── 入力フォーム ── */}
        <form onSubmit={handleSubmit} className="card">
          <div className="card-pad">
            <div className="nb-grid">
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label">店舗 <RequiredBadge /></label>
                <div className="seg" role="group" aria-label="店舗切替">
                  {(['tamashima', 'kanamitsu'] as StoreId[]).map(sid => (
                    <button
                      key={sid}
                      type="button"
                      className={`seg-btn${form.storeId === sid ? ' seg-btn--active' : ''}`}
                      onClick={() => set('storeId', sid)}
                      title={`${STORE_LABEL[sid]}の予約として登録します`}
                    >
                      {STORE_LABEL[sid]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field">
                <label className="field-label" htmlFor="nb-date">日付 <RequiredBadge /></label>
                <input
                  id="nb-date" type="date" className="input"
                  value={form.date} onChange={e => set('date', e.target.value)}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="nb-time">開始時刻 <RequiredBadge /></label>
                <input
                  id="nb-time" type="time" className="input" step="600"
                  min="06:00" max="23:50"
                  value={form.time} onChange={e => set('time', e.target.value)}
                />
              </div>

              {/* ── 繰り返し予約 ── */}
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <div className="card-pad">
                  <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
                    繰り返し予約
                  </h2>
                  <label
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}
                    title="毎週・隔週の同じ曜日・時間の予約をまとめて登録します"
                  >
                    <input
                      type="checkbox"
                      checked={recurOn}
                      onChange={e => { setRecurOn(e.target.checked); setRecurError(null); setRecurNote(null); }}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                    />
                    <span>繰り返し予約にする</span>
                  </label>

                  {recurOn && (
                    <div style={{ marginTop: 12 }}>
                      <div className="nb-grid">
                        <div className="field">
                          <label className="field-label" htmlFor="nb-recur-freq">頻度</label>
                          <select
                            id="nb-recur-freq" className="select"
                            value={recurWeeks}
                            onChange={e => setRecurWeeks(Number(e.target.value) === 2 ? 2 : 1)}
                          >
                            <option value={1}>毎週</option>
                            <option value={2}>隔週</option>
                          </select>
                        </div>
                        <div className="field">
                          <label className="field-label" htmlFor="nb-recur-count">回数</label>
                          <select
                            id="nb-recur-count" className="select"
                            value={recurCount}
                            onChange={e => setRecurCount(Number(e.target.value))}
                          >
                            {RECUR_COUNTS.map(c => <option key={c} value={c}>{c}回</option>)}
                          </select>
                        </div>
                      </div>
                      <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--sub)' }}>
                        選択した日を1回目として、同じ曜日・時間で繰り返し登録します
                      </p>

                      <div style={{ marginTop: 12 }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={handleRecurPreview}
                          disabled={recurChecking || recurSaving}
                          title="生成予定の日程と空き状況を確認します"
                        >
                          {recurChecking ? '確認中…' : '日程を確認する'}
                        </button>
                      </div>

                      {recurError && (
                        <div className="note note-red" role="alert" style={{ marginTop: 12 }}>
                          {recurError}
                        </div>
                      )}

                      {recurItems && (
                        <div style={{ marginTop: 12 }}>
                          <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--sub)' }}>
                            生成予定の日程（全{recurItems.length}件・登録可{recurItems.filter(i => i.ok).length}件）
                          </p>
                          {recurItems.map(item => (
                            <label
                              key={item.key}
                              style={{
                                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                                padding: '6px 4px', borderBottom: '1px solid var(--line)',
                                fontSize: 13, cursor: item.ok ? 'pointer' : 'default',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={item.checked}
                                disabled={!item.ok || recurSaving}
                                onChange={() => toggleRecurItem(item.key)}
                                style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
                              />
                              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                {fmtMdW(item.dateStr)} {item.hhmm}–{fmtTime(item.endIso)}
                              </span>
                              {item.ok ? (
                                <span className="badge badge-green">○ 登録可</span>
                              ) : (
                                <span className="badge badge-amber" title={item.reason ?? undefined}>
                                  × スキップ（重複あり）
                                </span>
                              )}
                            </label>
                          ))}
                          <div style={{ marginTop: 12 }}>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={handleRecurApply}
                              disabled={recurSaving || recurSelectedCount === 0}
                              title="チェックした日程をまとめて登録します"
                            >
                              {recurSaving ? '登録中…' : `${recurSelectedCount}件を登録する`}
                            </button>
                          </div>
                        </div>
                      )}

                      {recurNote && (
                        <div
                          className="note"
                          role="status"
                          style={{ background: 'var(--green-weak)', color: 'var(--green)', marginTop: 12 }}
                        >
                          {recurNote}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label" htmlFor="nb-menu">メニュー <RequiredBadge /></label>
                <select
                  id="nb-menu" className="select"
                  value={form.menuId} onChange={e => set('menuId', e.target.value)}
                >
                  <option value="">選択してください</option>
                  {storeMenus.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}（{m.duration_minutes}分 / ¥{m.price.toLocaleString()}）
                    </option>
                  ))}
                </select>
                {endTime && (
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--sub)' }}>
                    終了予定 <strong style={{ color: 'var(--ink)' }}>{endTime}</strong>
                    （{selectedMenu?.duration_minutes}分）
                  </p>
                )}
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label" htmlFor="nb-staff">
                  担当スタッフ{recurOn && <> <RequiredBadge /></>}
                </label>
                <select
                  id="nb-staff" className="select"
                  value={form.staffId} onChange={e => set('staffId', e.target.value)}
                >
                  <option value="">指名なし</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
                {form.menuId && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--sub)' }}>
                    このメニューを担当できるスタッフのみ表示しています。
                  </p>
                )}
                {recurOn && (
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--sub)' }}>
                    繰り返し予約は担当スタッフ単位で空きを確認するため、担当の選択が必要です。
                  </p>
                )}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="nb-name">お名前 <RequiredBadge /></label>
                <input
                  id="nb-name" type="text" className="input" placeholder="山田 花子"
                  value={form.guestName} onChange={e => set('guestName', e.target.value)}
                />
              </div>

              <div className="field">
                <label className="field-label" htmlFor="nb-phone">電話番号 <RequiredBadge /></label>
                <input
                  id="nb-phone" type="tel" className="input" placeholder="090-1234-5678"
                  value={form.guestPhone} onChange={e => set('guestPhone', e.target.value)}
                />
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label" htmlFor="nb-email">メールアドレス</label>
                <input
                  id="nb-email" type="email" className="input" placeholder="example@email.com"
                  value={form.guestEmail} onChange={e => set('guestEmail', e.target.value)}
                />
              </div>

              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label className="field-label" htmlFor="nb-request">備考・要望</label>
                <textarea
                  id="nb-request" className="textarea"
                  style={{ height: 80, resize: 'vertical' }}
                  placeholder="お客様からの要望やスタッフメモ"
                  value={form.request} onChange={e => set('request', e.target.value)}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}
                  title="初回・新規のお客様の予約は予約一覧の上部に表示されます"
                >
                  <input
                    type="checkbox"
                    checked={form.isFirstVisit}
                    onChange={e => set('isFirstVisit', e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                  />
                  <span>初回・新規のお客様</span>
                  <span style={{ fontSize: 12, color: 'var(--sub)' }}>（予約一覧の上部に表示されます）</span>
                </label>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              {recurOn ? (
                <p className="note">
                  繰り返し予約は、上の「繰り返し予約」欄の「日程を確認する」から登録します。
                </p>
              ) : (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ width: '100%' }}
                >
                  {loading ? '登録中…' : 'この内容で予約を登録する'}
                </button>
              )}
            </div>
          </div>
        </form>

        {/* ── この日の予約状況 ── */}
        <div className="card">
          <div className="card-pad">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
                この日の予約状況
              </h2>
              <span style={{ fontSize: 13, color: 'var(--sub)' }}>
                {form.date}・{STORE_LABEL[form.storeId]}
              </span>
            </div>

            {dayErr && (
              <div style={{ background: 'var(--red-weak)', color: 'var(--red)', fontSize: 12.5, lineHeight: 1.7, borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
                {dayErr}
              </div>
            )}
            {dayLoading ? (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--sub)' }}>読み込み中…</p>
            ) : dayRows.length === 0 ? (
              <div className="empty">
                この日の予約はまだありません。左のフォームからそのまま登録できます。
              </div>
            ) : (
              <div>
                {dayRows.map(row => {
                  const hit = overlapsSelected(row);
                  return (
                    <div
                      key={row.id}
                      title={
                        `${fmtTime(row.starts_at)}–${fmtTime(row.ends_at)} ${row.name}` +
                        (row.menuName ? ` ${row.menuName}` : '') +
                        (row.staffName ? ` 担当:${row.staffName}` : '') +
                        (row.source === 'air' ? '（AirReserve取込予約）' : '') +
                        (hit ? '／選択中の時間と重なっています' : '')
                      }
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 8px',
                        borderBottom: '1px solid var(--line)',
                        background: hit ? 'var(--amber-weak)' : 'transparent',
                        borderRadius: hit ? 6 : 0,
                        fontSize: 14,
                      }}
                    >
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>
                        {fmtTime(row.starts_at)}–{fmtTime(row.ends_at)}
                      </span>
                      <span style={{ color: 'var(--ink)' }}>{row.name}</span>
                      {row.menuName && <span style={{ color: 'var(--sub)', fontSize: 13 }}>{row.menuName}</span>}
                      {row.staffName && <span style={{ color: 'var(--sub)', fontSize: 13 }}>担当: {row.staffName}</span>}
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {row.source === 'air' && (
                          <span className="badge badge-purple" title="AirReserveから取り込んだ予約です">AirReserve</span>
                        )}
                        {row.source === 'app' && row.status === 'confirmed' && (
                          <span className="badge badge-green" title="確定済みの予約です">確定</span>
                        )}
                        {row.source === 'app' && row.status === 'completed' && (
                          <span className="badge badge-gray" title="来店が完了した予約です">完了</span>
                        )}
                        {row.source === 'app' && row.status === 'no_show' && (
                          <span className="badge badge-red" title="無断キャンセルとなった予約です">無断キャンセル</span>
                        )}
                        {row.source === 'app' && row.depositStatus === 'pending' && (
                          <span className="badge badge-amber" title="前金の入金がまだ確認できていません">前金未確認</span>
                        )}
                        {row.source === 'app' && (row.depositStatus === 'paid' || row.depositStatus === 'waived') && (
                          <span className="badge badge-green" title="前金の確認が済んでいます">前金済</span>
                        )}
                      </span>
                      {hit && (
                        <span style={{ flexBasis: '100%', fontSize: 12, color: 'var(--amber)' }}>
                          選択中の時間と重なっています
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 先月の繰り返し予約から作成 ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-pad">
          <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
            先月の繰り返し予約から作成
          </h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--sub)' }}>
            {STORE_LABEL[form.storeId]}の{copyPrevLabel}の繰り返し予約をシリーズ単位でまとめ、
            {copyTargetLabel}の同じ曜日・時刻（今日より後の日付のみ）へコピーします。
          </p>

          <div className="field" style={{ marginBottom: 16 }}>
            <label className="field-label">対象月</label>
            <div className="seg" role="group" aria-label="対象月切替">
              <button
                type="button"
                className={`seg-btn${copyTargetMonth === 'this' ? ' seg-btn--active' : ''}`}
                onClick={() => setCopyTargetMonth('this')}
                title={`今月（${monthOffsetJst(0).m + 1}月）に作成します`}
              >
                今月（{monthOffsetJst(0).m + 1}月）
              </button>
              <button
                type="button"
                className={`seg-btn${copyTargetMonth === 'next' ? ' seg-btn--active' : ''}`}
                onClick={() => setCopyTargetMonth('next')}
                title={`来月（${monthOffsetJst(1).m + 1}月）に作成します`}
              >
                来月（{monthOffsetJst(1).m + 1}月）
              </button>
            </div>
          </div>

          {copyNote && (
            <div
              className="note"
              role="status"
              style={{ background: 'var(--green-weak)', color: 'var(--green)', marginBottom: 16 }}
            >
              {copyNote}
            </div>
          )}
          {copyError && (
            <div className="note note-red" role="alert" style={{ marginBottom: 16 }}>
              {copyError}
            </div>
          )}

          {copySeries === null ? (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--sub)' }}>読み込み中…</p>
          ) : copySeries.length === 0 ? (
            <div className="empty">
              先月の繰り返し予約はありません。上のフォームで「繰り返し予約にする」を使うと、来月このリストからコピーできるようになります。
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={copyAllSelected}
                          onChange={toggleCopyAllSeries}
                          disabled={copySelectableList.length === 0}
                          title="すべて選択・解除します"
                        />
                      </th>
                      <th>お客様</th>
                      <th>曜日・時刻</th>
                      <th>メニュー</th>
                      <th>担当</th>
                      <th>先月の回数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {copySeries.map(s => {
                      const copyable = isCopyableSeries(s);
                      return (
                        <tr key={s.groupId}>
                          <td>
                            <input
                              type="checkbox"
                              checked={copySelected.has(s.groupId)}
                              onChange={() => toggleCopySeries(s.groupId)}
                              disabled={!copyable}
                              title={
                                copyable
                                  ? 'この予約をコピー対象にします'
                                  : '担当スタッフまたはお客様情報が無いためコピーできません'
                              }
                            />
                          </td>
                          <td>{s.customerName}様</td>
                          <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {WEEKDAY_LABELS[s.weekday]}曜 {s.hhmm}
                          </td>
                          <td>{s.menuName}</td>
                          <td>
                            {s.staffId ? s.staffName : (
                              <span className="badge badge-gray" title="担当スタッフが未設定のためコピーできません">未指定</span>
                            )}
                          </td>
                          <td>{s.count}回</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {copyItems === null && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCopyPreview}
                  disabled={copyChecking || copySelected.size === 0}
                  title={`選択した予約を${copyTargetLabel}の同じ曜日・時刻（今日より後）へ展開して確認します`}
                >
                  {copyChecking ? '確認中…' : `選択した予約を${copyTargetWord}に作成する`}
                </button>
              )}

              {copyItems !== null && (
                <div>
                  {copyNoDates.length > 0 && (
                    <div className="note" style={{ marginBottom: 12 }}>
                      {copyNoDates.join('、')}は、対象月に登録できる日がないため対象外です（今日より後の日付のみが対象です）。
                    </div>
                  )}
                  <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--sub)' }}>
                    生成予定の日程（全{copyItems.length}件・登録可{copyItems.filter(i => i.ok).length}件）
                  </p>
                  {copyItems.map(item => (
                    <label
                      key={item.key}
                      style={{
                        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                        padding: '6px 4px', borderBottom: '1px solid var(--line)',
                        fontSize: 13, cursor: item.ok ? 'pointer' : 'default',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        disabled={!item.ok || copySaving}
                        onChange={() => toggleCopyItem(item.key)}
                        style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
                      />
                      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                        {fmtMdW(item.dateStr)} {item.hhmm}–{fmtTime(item.endIso)}
                      </span>
                      <span>{item.label}様</span>
                      {item.ok ? (
                        <span className="badge badge-green">○ 登録可</span>
                      ) : (
                        <span className="badge badge-amber" title={item.reason ?? undefined}>
                          × スキップ（重複あり）
                        </span>
                      )}
                    </label>
                  ))}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleCopyApply}
                      disabled={copySaving || copySelectedCount === 0}
                      title="チェックした日程をまとめて登録します"
                    >
                      {copySaving ? '登録中…' : `${copySelectedCount}件を登録する`}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => { setCopyItems(null); setCopyNoDates([]); }}
                      disabled={copySaving}
                      title="日程の確認をやり直します"
                    >
                      選び直す
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 補助 ──────────────────────────────

function RequiredBadge() {
  return <span className="badge badge-red" title="入力必須の項目です">必須</span>;
}
