import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// スタッフ休み登録
// ・店舗→スタッフ(staff_stores/public_staff_roster)を選び、
//   staff_unavailability に休み(off)/外出・予定(busy)ブロックを登録する
// ・右カラムに選択したスタッフ・日付の予約状況（app_bookings＋airreserve_events）を表示し、
//   予約と重なる時間帯に休みを入れようとしたら警告する
// ・当日以降の登録済みブロックを一覧表示し、削除できる
// ・「先月の休みをコピー」: 対象月（今月/来月）の前月分を曜日×時間帯のパターンに
//   集約してプレビューし、選択したパターンだけを対象月（今日より後の日付）へ展開登録する
// ・日時はJST明示（+09:00）で保存する（素朴文字列はUTC解釈になるため禁止）

type StoreId = 'tamashima' | 'kanamitsu';
const STORE_ORDER: StoreId[] = ['tamashima', 'kanamitsu'];
const STORE_NAMES: Record<StoreId, string> = { tamashima: '玉島店', kanamitsu: '金光店' };

const BLOCK_TYPE_LABELS: Record<string, string> = {
  off: '休み',
  busy: '外出・予定',
  changeover: '入れ替え時間',
};

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface RosterRow {
  staff_id: string;
  full_name: string;
  store_id: string;
}

interface BlockRow {
  id: string;
  staff_id: string | null;
  store_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  block_type: string | null;
  staff: { full_name: string } | null;
}

// 予約状況パネル用（app_bookings と airreserve_events を統合した1行）
interface DayBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
  menuName: string;
  staffName: string;
  isAirReserve: boolean;
}

interface AppBookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  guest_name: string | null;
  menu: { name: string } | null;
  staff: { full_name: string } | null;
}

interface AirEventRow {
  id: string;
  starts_at: string;
  ends_at: string;
  summary: string | null;
}

// JSTの今日 'YYYY-MM-DD'（epoch計算でタイムゾーンを明示）
function jstTodayStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function fmtJstDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', weekday: 'short',
  });
}

function fmtJstTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function fmtRange(startsAt: string, endsAt: string): string {
  const sameDay = fmtJstDate(startsAt) === fmtJstDate(endsAt);
  return sameDay
    ? `${fmtJstDate(startsAt)} ${fmtJstTime(startsAt)}〜${fmtJstTime(endsAt)}`
    : `${fmtJstDate(startsAt)} ${fmtJstTime(startsAt)}〜${fmtJstDate(endsAt)} ${fmtJstTime(endsAt)}`;
}

// ---------------------------------------------------------------------
// 先月の休みをコピー（曜日×時間帯パターンの集約と対象月への展開）
// ---------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' → '7/18' 表記（プレビューの注意バッジ用）
const fmtMD = (dateStr: string) => `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}`;

// timestamptzをJSTで分解（+9hしてgetUTC系で読む。曜日もTZ非依存で取れる）
function jstParts(iso: string): { dateStr: string; hhmm: string; weekday: number } {
  const j = new Date(new Date(iso).getTime() + 9 * 3600000);
  return {
    dateStr: `${j.getUTCFullYear()}-${pad2(j.getUTCMonth() + 1)}-${pad2(j.getUTCDate())}`,
    hhmm: `${pad2(j.getUTCHours())}:${pad2(j.getUTCMinutes())}`,
    weekday: j.getUTCDay(),
  };
}

// JST基準の今日からoffsetか月後の年月（m は 0始まり）
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

// 完全同一（同staff・同starts_at・同ends_at）判定キー。epochで比較して表記ゆれを吸収する
function dupKey(staffId: string, startsAt: string, endsAt: string): string {
  return `${staffId}|${new Date(startsAt).getTime()}|${new Date(endsAt).getTime()}`;
}

// 先月分を集約したパターン1行（プレビュー表の行）
interface CopyPattern {
  key: string;
  staffId: string;
  staffName: string;
  weekday: number;
  startTime: string; // 'HH:MM'
  endTime: string;   // 'HH:MM'
  blockType: string;
  reason: string | null;
  lastMonthCount: number;   // 先月の回数
  createDates: string[];    // 対象月に作成される日付（重複除外後）
  duplicateDates: string[]; // 完全同一の既存行がありスキップされる日付
  bookingDates: string[];   // 既存予約と重なる日付（注意喚起のみ・登録は可能）
}

interface CopySourceRow {
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
  block_type: string | null;
  reason: string | null;
  staff: { full_name: string } | null;
}

interface SlimRangeRow {
  staff_id: string | null;
  starts_at: string;
  ends_at: string;
}

const INIT_FORM = {
  storeId: 'tamashima' as StoreId,
  staffId: '',
  date: jstTodayStr(),
  startTime: '09:00',
  endTime: '21:00',
  blockType: 'off' as 'off' | 'busy',
  reason: '',
};

export function StaffOff() {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [form, setForm] = useState(INIT_FORM);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 選択中スタッフ・日付の予約状況（共通仕様 loadDayBookings のスタッフ絞り版）
  const [dayBookings, setDayBookings] = useState<DayBooking[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  // 先月の休みをコピー
  const [copyTargetMonth, setCopyTargetMonth] = useState<'this' | 'next'>('this');
  const [copyPatterns, setCopyPatterns] = useState<CopyPattern[] | null>(null); // null=未読込
  const [copySelected, setCopySelected] = useState<Set<string>>(new Set());
  const [copyLoading, setCopyLoading] = useState(false);
  const [copyApplying, setCopyApplying] = useState(false);
  const [copyResult, setCopyResult] = useState<string | null>(null);

  const set = <K extends keyof typeof INIT_FORM>(key: K, val: (typeof INIT_FORM)[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  // 店舗のスタッフ一覧（稼働ロスター）
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('public_staff_roster')
      .select('staff_id, full_name, store_id')
      .eq('store_id', form.storeId)
      .order('full_name')
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data as RosterRow[]) ?? [];
        setRoster(rows);
        // 店舗を切り替えたとき、その店舗に居ないスタッフの選択は解除
        setForm(f => (rows.some(r => r.staff_id === f.staffId) ? f : { ...f, staffId: '' }));
      });
    return () => { cancelled = true; };
  }, [form.storeId]);

  // 当日以降（終了がまだ来ていないものを含む）のブロック一覧
  const loadBlocks = useCallback(async () => {
    const lo = `${jstTodayStr()}T00:00:00+09:00`;
    const { data } = await supabase
      .from('staff_unavailability')
      .select('id, staff_id, store_id, starts_at, ends_at, reason, block_type, staff:staff_id(full_name)')
      .gte('ends_at', lo)
      .order('starts_at');
    setBlocks((data as unknown as BlockRow[]) ?? []);
  }, []);

  useEffect(() => { loadBlocks(); }, [loadBlocks]);

  // 選択したスタッフ・日付の予約状況を取得
  // app_bookings(status<>'cancelled', +09:00日窓, menu/staff join) と
  // airreserve_events(同窓) をスタッフで絞って時刻順に統合する
  useEffect(() => {
    if (!form.staffId || !form.date) {
      setDayBookings([]);
      return;
    }
    let cancelled = false;
    setDayLoading(true);

    const lo = `${form.date}T00:00:00+09:00`;
    const hi = `${form.date}T23:59:59+09:00`;

    (async () => {
      const [appRes, airRes] = await Promise.all([
        supabase
          .from('app_bookings')
          .select('id, starts_at, ends_at, guest_name, menu:treatment_menu_id(name), staff:staff_id(full_name)')
          .eq('store_id', form.storeId)
          .eq('staff_id', form.staffId)
          .neq('status', 'cancelled')
          .gte('starts_at', lo)
          .lte('starts_at', hi)
          .order('starts_at'),
        supabase
          .from('airreserve_events')
          .select('id, starts_at, ends_at, summary')
          .eq('store_id', form.storeId)
          .eq('staff_id', form.staffId)
          .gte('starts_at', lo)
          .lte('starts_at', hi)
          .order('starts_at'),
      ]);
      if (cancelled) return;

      const staffName = roster.find(r => r.staff_id === form.staffId)?.full_name ?? '';
      const appRows = ((appRes.data as unknown as AppBookingRow[]) ?? []).map(b => ({
        id: `app-${b.id}`,
        startsAt: b.starts_at,
        endsAt: b.ends_at,
        customerName: b.guest_name ?? '（名前なし）',
        menuName: b.menu?.name ?? '-',
        staffName: b.staff?.full_name ?? staffName,
        isAirReserve: false,
      }));
      const airRows = ((airRes.data as AirEventRow[]) ?? []).map(ev => ({
        id: `air-${ev.id}`,
        startsAt: ev.starts_at,
        endsAt: ev.ends_at,
        customerName: ev.summary ?? 'AirReserve予約',
        menuName: '',
        staffName,
        isAirReserve: true,
      }));

      setDayBookings(
        [...appRows, ...airRows].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
      setDayLoading(false);
    })();

    return () => { cancelled = true; };
  }, [form.storeId, form.staffId, form.date, roster]);

  // 入力中の時間帯と既存予約の重なり判定（JSTのHH:MM文字列で比較）
  const hasOverlap =
    !!form.startTime && !!form.endTime && form.startTime < form.endTime &&
    dayBookings.some(b =>
      fmtJstTime(b.startsAt) < form.endTime && fmtJstTime(b.endsAt) > form.startTime,
    );

  const selectedStaffName = roster.find(r => r.staff_id === form.staffId)?.full_name ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);

    if (!form.staffId) { setError('スタッフを選択してください'); return; }
    if (!form.date) { setError('日付を入力してください'); return; }
    if (!form.startTime || !form.endTime) { setError('開始・終了時刻を入力してください'); return; }
    if (form.startTime >= form.endTime) { setError('終了時刻は開始時刻より後にしてください'); return; }

    setLoading(true); setError(null);

    // JST明示で保存（+09:00を付けないとUTC解釈で9時間ズレる）
    const startsAt = `${form.date}T${form.startTime}:00+09:00`;
    const endsAt = `${form.date}T${form.endTime}:00+09:00`;

    const { data: { session } } = await supabase.auth.getSession();

    const { error: err } = await supabase.from('staff_unavailability').insert({
      staff_id: form.staffId,
      store_id: form.storeId,
      starts_at: startsAt,
      ends_at: endsAt,
      reason: form.reason.trim() || null,
      block_type: form.blockType,
      created_by: session?.user.id ?? null,
    });

    setLoading(false);

    if (err) {
      setError(`エラー: 登録に失敗しました（${err.message}）`);
      return;
    }

    const staffName = roster.find(r => r.staff_id === form.staffId)?.full_name ?? '';
    setSuccess(`${staffName}さんの${BLOCK_TYPE_LABELS[form.blockType]}を登録しました`);
    setForm(f => ({ ...f, reason: '' }));
    loadBlocks();
    setTimeout(() => setSuccess(null), 4000);
  };

  const handleDelete = async (block: BlockRow) => {
    const name = block.staff?.full_name ?? 'スタッフ';
    if (!window.confirm(`${name}さんの ${fmtRange(block.starts_at, block.ends_at)} のブロックを削除します。よろしいですか？`)) return;

    setDeleting(block.id);
    const { error: err } = await supabase.from('staff_unavailability').delete().eq('id', block.id);
    setDeleting(null);

    if (err) {
      setError(`エラー: 削除に失敗しました（${err.message}）`);
      return;
    }
    loadBlocks();
  };

  // ----- 先月の休みをコピー -----

  const copyTarget = copyTargetMonth === 'next' ? monthOffsetJst(1) : monthOffsetJst(0);
  const copyPrev = addMonths(copyTarget.y, copyTarget.m, -1); // 「先月」= 対象月の前月
  const copyTargetLabel = `${copyTarget.m + 1}月`;
  const copyPrevLabel = `${copyPrev.m + 1}月`;
  const copySelectable = (copyPatterns ?? []).filter(p => p.createDates.length > 0);
  const copyAllSelected = copySelectable.length > 0 && copySelectable.every(p => copySelected.has(p.key));
  const copyCreateTotal = copySelectable
    .filter(p => copySelected.has(p.key))
    .reduce((n, p) => n + p.createDates.length, 0);

  // 店舗・対象月を切り替えたら読み込み済みプレビューは破棄する（前提が変わるため）
  useEffect(() => {
    setCopyPatterns(null);
    setCopySelected(new Set());
    setCopyResult(null);
  }, [form.storeId, copyTargetMonth]);

  const toggleCopyPattern = (key: string) =>
    setCopySelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleCopyAll = () =>
    setCopySelected(copyAllSelected ? new Set() : new Set(copySelectable.map(p => p.key)));

  // 先月分を読み込んで (staff, 曜日, 開始, 終了, 種別, 理由) でパターン集約し、
  // 対象月への展開予定（作成日・重複スキップ・予約重なり）を添えてプレビューする
  const handleLoadPatterns = async () => {
    setCopyLoading(true);
    setCopyResult(null);
    setError(null);

    const prevWin = monthWindow(copyPrev.y, copyPrev.m);
    const targetWin = monthWindow(copyTarget.y, copyTarget.m);
    const today = jstTodayStr();

    const [prevRes, existRes, bookRes] = await Promise.all([
      supabase
        .from('staff_unavailability')
        .select('staff_id, starts_at, ends_at, block_type, reason, staff:staff_id(full_name)')
        .eq('store_id', form.storeId)
        .gte('starts_at', prevWin.lo)
        .lt('starts_at', prevWin.hi)
        .order('starts_at'),
      supabase
        .from('staff_unavailability')
        .select('staff_id, starts_at, ends_at')
        .eq('store_id', form.storeId)
        .gte('starts_at', targetWin.lo)
        .lt('starts_at', targetWin.hi),
      supabase
        .from('app_bookings')
        .select('staff_id, starts_at, ends_at')
        .eq('store_id', form.storeId)
        .neq('status', 'cancelled')
        .gte('starts_at', targetWin.lo)
        .lt('starts_at', targetWin.hi),
    ]);

    const loadErr = prevRes.error ?? existRes.error ?? bookRes.error;
    if (loadErr) {
      setError(`エラー: 先月の休みの読み込みに失敗しました（${loadErr.message}）`);
      setCopyLoading(false);
      return;
    }

    // パターン集約（日をまたぐ登録は同日ペアに展開できないため対象外）
    const map = new Map<string, CopyPattern>();
    for (const row of ((prevRes.data as unknown as CopySourceRow[]) ?? [])) {
      if (!row.staff_id) continue;
      const s = jstParts(row.starts_at);
      const e = jstParts(row.ends_at);
      if (s.dateStr !== e.dateStr) continue;
      const reason = row.reason?.trim() || null;
      const blockType = row.block_type ?? 'off';
      const key = [row.staff_id, s.weekday, s.hhmm, e.hhmm, blockType, reason ?? ''].join('|');
      const cur = map.get(key);
      if (cur) {
        cur.lastMonthCount += 1;
      } else {
        map.set(key, {
          key,
          staffId: row.staff_id,
          staffName: row.staff?.full_name ?? 'スタッフ',
          weekday: s.weekday,
          startTime: s.hhmm,
          endTime: e.hhmm,
          blockType,
          reason,
          lastMonthCount: 1,
          createDates: [],
          duplicateDates: [],
          bookingDates: [],
        });
      }
    }

    const existing = new Set(
      (((existRes.data as unknown as SlimRangeRow[]) ?? []))
        .filter(r => r.staff_id)
        .map(r => dupKey(r.staff_id as string, r.starts_at, r.ends_at)),
    );
    const bookings = (((bookRes.data as unknown as SlimRangeRow[]) ?? []))
      .filter(b => b.staff_id)
      .map(b => {
        const s = jstParts(b.starts_at);
        const e = jstParts(b.ends_at);
        return { staffId: b.staff_id as string, dateStr: s.dateStr, startHm: s.hhmm, endHm: e.hhmm };
      });

    for (const p of map.values()) {
      for (const dateStr of candidateDates(copyTarget.y, copyTarget.m, p.weekday, today)) {
        const k = dupKey(
          p.staffId,
          `${dateStr}T${p.startTime}:00+09:00`,
          `${dateStr}T${p.endTime}:00+09:00`,
        );
        if (existing.has(k)) {
          p.duplicateDates.push(dateStr);
          continue;
        }
        p.createDates.push(dateStr);
        const overlapped = bookings.some(b =>
          b.staffId === p.staffId && b.dateStr === dateStr &&
          b.startHm < p.endTime && b.endHm > p.startTime,
        );
        if (overlapped) p.bookingDates.push(dateStr);
      }
    }

    const list = [...map.values()].sort((a, b) =>
      a.staffName.localeCompare(b.staffName, 'ja') ||
      a.weekday - b.weekday ||
      a.startTime.localeCompare(b.startTime),
    );
    setCopyPatterns(list);
    setCopySelected(new Set(list.filter(p => p.createDates.length > 0).map(p => p.key)));
    setCopyLoading(false);
  };

  // 選択したパターンを対象月の該当曜日（今日より後）へ展開してINSERTする。
  // 完全同一の既存行（同staff・同starts_at・同ends_at）は登録直前に取り直してスキップする
  const handleApplyPatterns = async () => {
    if (!copyPatterns) return;
    const selected = copyPatterns.filter(p => copySelected.has(p.key));
    if (selected.length === 0) return;

    setCopyApplying(true);
    setCopyResult(null);
    setError(null);

    const targetWin = monthWindow(copyTarget.y, copyTarget.m);
    const today = jstTodayStr();

    const { data: existData, error: existErr } = await supabase
      .from('staff_unavailability')
      .select('staff_id, starts_at, ends_at')
      .eq('store_id', form.storeId)
      .gte('starts_at', targetWin.lo)
      .lt('starts_at', targetWin.hi);

    if (existErr) {
      setError(`エラー: 既存の登録の確認に失敗しました（${existErr.message}）`);
      setCopyApplying(false);
      return;
    }

    const seen = new Set(
      (((existData as unknown as SlimRangeRow[]) ?? []))
        .filter(r => r.staff_id)
        .map(r => dupKey(r.staff_id as string, r.starts_at, r.ends_at)),
    );

    const { data: { session } } = await supabase.auth.getSession();

    const rows: {
      staff_id: string; store_id: StoreId; starts_at: string; ends_at: string;
      block_type: string; reason: string | null; created_by: string | null;
    }[] = [];
    let skippedDup = 0;
    let skippedNoDate = 0;

    for (const p of selected) {
      const dates = candidateDates(copyTarget.y, copyTarget.m, p.weekday, today);
      if (dates.length === 0) {
        skippedNoDate += 1;
        continue;
      }
      for (const dateStr of dates) {
        const startsAt = `${dateStr}T${p.startTime}:00+09:00`;
        const endsAt = `${dateStr}T${p.endTime}:00+09:00`;
        const k = dupKey(p.staffId, startsAt, endsAt);
        if (seen.has(k)) {
          skippedDup += 1;
          continue;
        }
        seen.add(k);
        rows.push({
          staff_id: p.staffId,
          store_id: form.storeId,
          starts_at: startsAt,
          ends_at: endsAt,
          block_type: p.blockType,
          reason: p.reason,
          created_by: session?.user.id ?? null,
        });
      }
    }

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('staff_unavailability').insert(rows);
      if (insErr) {
        setError(`エラー: 登録に失敗しました（${insErr.message}）`);
        setCopyApplying(false);
        return;
      }
    }

    const skipParts: string[] = [];
    if (skippedDup > 0) skipParts.push(`同じ内容の登録が既にあるため${skippedDup}件`);
    if (skippedNoDate > 0) skipParts.push(`対象月に該当する日がないため${skippedNoDate}パターン`);
    setCopyResult(
      skipParts.length > 0
        ? `${copyTargetLabel}に${rows.length}件を登録しました。スキップ: ${skipParts.join('、')}。`
        : `${copyTargetLabel}に${rows.length}件を登録しました。スキップはありません。`,
    );
    setCopyPatterns(null);
    setCopySelected(new Set());
    setCopyApplying(false);
    loadBlocks();
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">スタッフ休み登録</h2>
        <p className="page-help">スタッフの休みを登録すると、その時間帯はネット予約に表示されなくなります。毎月同じパターンの休みは先月分からコピーできます。</p>
      </div>

      {success && (
        <div className="note" style={{ background: 'var(--green-weak)', color: 'var(--green)', marginBottom: 16 }}>
          {success}
        </div>
      )}
      {error && (
        <div className="note" style={{ background: 'var(--red-weak)', color: 'var(--red)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* 左=登録フォーム / 右=選択したスタッフ・日付の予約状況（幅が狭いときは縦積み） */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          alignItems: 'start',
          marginBottom: 16,
        }}
      >
        <form onSubmit={handleSubmit} className="card card-pad">
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>休み・予定の登録</h3>

          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">店舗</label>
            <div className="seg">
              {STORE_ORDER.map(s => (
                <button
                  key={s}
                  type="button"
                  className={`seg-btn${form.storeId === s ? ' seg-btn--active' : ''}`}
                  onClick={() => set('storeId', s)}
                  title={`${STORE_NAMES[s]}のスタッフから選びます`}
                >
                  {STORE_NAMES[s]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="field">
              <label className="field-label">スタッフ（必須）</label>
              <select className="select" value={form.staffId} onChange={e => set('staffId', e.target.value)}>
                <option value="">選択してください</option>
                {roster.map(r => <option key={r.staff_id} value={r.staff_id}>{r.full_name}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">日付（必須）</label>
              <input type="date" className="input" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">種別（必須）</label>
              <select
                className="select"
                value={form.blockType}
                onChange={e => set('blockType', e.target.value as 'off' | 'busy')}
                title="休み＝終日や半日の休み／外出・予定＝一時的なブロック"
              >
                <option value="off">休み（終日や半日の休み）</option>
                <option value="busy">外出・予定（一時的なブロック）</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">開始時刻（必須）</label>
              <input type="time" className="input" value={form.startTime} onChange={e => set('startTime', e.target.value)} step="600" />
            </div>
            <div className="field">
              <label className="field-label">終了時刻（必須）</label>
              <input type="time" className="input" value={form.endTime} onChange={e => set('endTime', e.target.value)} step="600" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label className="field-label">理由・メモ</label>
              <input
                type="text" className="input" placeholder="例）有休 / 研修 / 通院"
                value={form.reason} onChange={e => set('reason', e.target.value)}
              />
            </div>
          </div>

          <div className="note" style={{ marginBottom: 16 }}>
            登録した時間帯は、そのスタッフの予約枠がブロックされます（ネット予約・予約表に反映されます）。
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? '登録中…' : '休みを登録する'}
          </button>
        </form>

        {/* 選択したスタッフ・日付の予約状況 */}
        <div className="card card-pad">
          <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>
            {form.staffId && form.date
              ? `${selectedStaffName}さんの予約状況（${fmtJstDate(`${form.date}T00:00:00+09:00`)}）`
              : '予約状況'}
          </h3>

          {!form.staffId || !form.date ? (
            <div className="empty">スタッフと日付を選ぶと、その日の予約状況が表示されます。</div>
          ) : dayLoading ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--sub)', fontSize: 13 }}>読み込み中…</div>
          ) : dayBookings.length === 0 ? (
            <div className="empty">この日の予約はまだありません。そのまま休みを登録できます。</div>
          ) : (
            <div>
              {dayBookings.map(b => (
                <div
                  key={b.id}
                  style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                    padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13,
                  }}
                  title={`${fmtJstTime(b.startsAt)}〜${fmtJstTime(b.endsAt)} ${b.customerName}`}
                >
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                    {fmtJstTime(b.startsAt)}–{fmtJstTime(b.endsAt)}
                  </span>
                  <span>{b.customerName}</span>
                  {b.menuName && <span style={{ color: 'var(--sub)' }}>{b.menuName}</span>}
                  {b.staffName && <span style={{ color: 'var(--sub)' }}>{b.staffName}</span>}
                  {b.isAirReserve && (
                    <span className="badge badge-purple" title="AirReserveから取り込んだ予約です">AirReserve</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {hasOverlap && (
            <div
              style={{
                marginTop: 16, padding: '10px 12px', background: 'var(--amber-weak)',
                color: 'var(--amber)', borderRadius: 8, fontSize: 13, lineHeight: 1.6,
              }}
            >
              この時間帯には既に予約があります。先にタイムラインで予約を変更してください。
            </div>
          )}
        </div>
      </div>

      {/* 先月の休みをコピー */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>先月の休みをコピー</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--sub)' }}>
          {STORE_NAMES[form.storeId]}の{copyPrevLabel}の登録を曜日・時間帯のパターンにまとめ、{copyTargetLabel}の同じ曜日（今日より後の日付）へコピーします。
        </p>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div className="field">
            <label className="field-label">対象月</label>
            <div className="seg">
              <button
                type="button"
                className={`seg-btn${copyTargetMonth === 'this' ? ' seg-btn--active' : ''}`}
                onClick={() => setCopyTargetMonth('this')}
                title={`今月（${monthOffsetJst(0).m + 1}月）へコピーします`}
              >
                今月（{monthOffsetJst(0).m + 1}月）
              </button>
              <button
                type="button"
                className={`seg-btn${copyTargetMonth === 'next' ? ' seg-btn--active' : ''}`}
                onClick={() => setCopyTargetMonth('next')}
                title={`来月（${monthOffsetJst(1).m + 1}月）へコピーします`}
              >
                来月（{monthOffsetJst(1).m + 1}月）
              </button>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleLoadPatterns}
            disabled={copyLoading}
            title={`${copyPrevLabel}の登録をパターン集約してプレビューします`}
          >
            {copyLoading ? '読み込み中…' : '先月の休みを読み込む'}
          </button>
        </div>

        {copyResult && (
          <div className="note" style={{ background: 'var(--green-weak)', color: 'var(--green)', marginBottom: 16 }}>
            {copyResult}
          </div>
        )}

        {copyPatterns !== null && (
          copyPatterns.length === 0 ? (
            <div className="empty">先月の休み登録はありません。</div>
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
                          onChange={toggleCopyAll}
                          disabled={copySelectable.length === 0}
                          title="すべて選択・解除します"
                        />
                      </th>
                      <th>スタッフ</th>
                      <th>曜日</th>
                      <th>時間帯</th>
                      <th>種別</th>
                      <th>先月の回数</th>
                      <th>対象月に作成される日数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {copyPatterns.map(p => (
                      <tr key={p.key}>
                        <td>
                          <input
                            type="checkbox"
                            checked={copySelected.has(p.key)}
                            onChange={() => toggleCopyPattern(p.key)}
                            disabled={p.createDates.length === 0}
                            title={p.createDates.length === 0 ? '作成できる日がないため選択できません' : 'このパターンをコピー対象にします'}
                          />
                        </td>
                        <td>{p.staffName}</td>
                        <td>{WEEKDAY_LABELS[p.weekday]}曜</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.startTime}〜{p.endTime}</td>
                        <td>
                          <span className={`badge ${p.blockType === 'busy' ? 'badge-amber' : 'badge-gray'}`}>
                            {BLOCK_TYPE_LABELS[p.blockType] ?? 'ブロック'}
                          </span>
                          {p.reason && <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--sub)' }}>{p.reason}</span>}
                        </td>
                        <td>{p.lastMonthCount}回</td>
                        <td>
                          {p.createDates.length}日
                          {p.duplicateDates.length > 0 && (
                            <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--sub)' }}>
                              （同じ登録が既にある{p.duplicateDates.length}日はスキップ）
                            </span>
                          )}
                          {p.bookingDates.length > 0 && (
                            <span
                              className="badge badge-amber"
                              style={{ marginLeft: 6 }}
                              title={`予約が入っている日: ${p.bookingDates.map(fmtMD).join('、')}（登録は可能です。重なりに注意してください）`}
                            >
                              予約あり: {fmtMD(p.bookingDates[0])}{p.bookingDates.length > 1 ? 'ほか' : ''}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="note" style={{ marginBottom: 16 }}>
                「予約あり」のパターンは、コピー先の日に既に予約が入っています。登録は可能ですが、重なりに注意してください。
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApplyPatterns}
                disabled={copyApplying || copyCreateTotal === 0}
                title={`選択したパターンを${copyTargetLabel}の同じ曜日（今日より後）へ展開して登録します`}
              >
                {copyApplying ? '登録中…' : `選択したパターンを${copyTargetLabel}に登録する（${copyCreateTotal}件）`}
              </button>
            </>
          )
        )}
      </div>

      {/* 登録済みブロック一覧 */}
      <div className="card card-pad">
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>登録済みブロック（本日以降）</h3>
        {blocks.length === 0 ? (
          <div className="empty">本日以降の登録はありません。上のフォームから休みや予定を登録できます。</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>スタッフ</th>
                  <th>店舗</th>
                  <th>日時</th>
                  <th>種別</th>
                  <th>理由</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {blocks.map(b => (
                  <tr key={b.id}>
                    <td>{b.staff?.full_name ?? '-'}</td>
                    <td>
                      {b.store_id && (STORE_NAMES as Record<string, string>)[b.store_id]
                        ? (STORE_NAMES as Record<string, string>)[b.store_id]
                        : (b.store_id ?? '-')}
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtRange(b.starts_at, b.ends_at)}</td>
                    <td>
                      <span
                        className={`badge ${b.block_type === 'busy' ? 'badge-amber' : 'badge-gray'}`}
                        title={b.block_type === 'busy' ? '一時的なブロック（外出・予定）' : '終日や半日の休み'}
                      >
                        {(b.block_type && BLOCK_TYPE_LABELS[b.block_type]) || 'ブロック'}
                      </span>
                    </td>
                    <td>{b.reason ?? '-'}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(b)}
                        disabled={deleting === b.id}
                        title="このブロックを削除します（予約枠が再び空きます）"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
