import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

// LINE LIFF: index.html でSDKを読み込み済み。LIFF_ID未設定時はスキップ。
declare const liff: { init: (c: { liffId: string }) => Promise<void> } | undefined;
const LIFF_ID = (import.meta.env.VITE_LIFF_ID as string | undefined) ?? '';
if (LIFF_ID && typeof liff !== 'undefined') {
  liff.init({ liffId: LIFF_ID }).catch(() => {});
}
import type { PageData, StoreId, Menu, CreateBookingResult, ConfirmBookingResult } from './lib/api';
import { getBookingPageData, createWebBooking, confirmWebBooking, STORE_INFO, formatPhone, formatYen, isValidEmail } from './lib/api';
import { StoreMenuStep } from './components/StoreMenuStep';
import { DateTimeStep } from './components/DateTimeStep';
import { CustomerStep, type CustomerInfo } from './components/CustomerStep';
import { ConfirmStep } from './components/ConfirmStep';
import { StaffStep } from './components/StaffStep';
import { StepIndicator } from './components/StepIndicator';

type Step = 'menu' | 'staff' | 'datetime' | 'customer' | 'confirm' | 'payment' | 'done';
const FLOW: Step[] = ['menu', 'staff', 'datetime', 'customer', 'confirm'];
const STEP_NAMES: Record<string, string> = { menu: 'メニュー', staff: 'スタッフ', datetime: '日時', customer: 'お客様', confirm: '確認' };
const PHONE_RE = /^[0-9\-+\s()]{10,20}$/;

// ---- 事前決済の仮押さえ退避（決済ページから戻る際のSPA状態消失に備える） ----
// LINE内ブラウザ等では外部決済リンクから戻ると元のタブが破棄されることがあり、
// Reactの状態だけだと「お支払いが完了しました」を押せなくなる（＝支払済みなのに30分で自動取消）。
// そこで仮押さえの最小情報をストレージへ保存し、マウント時に復元して決済ステップへ直行させる。
const PENDING_HOLD_KEY = 'moveact_pending_hold';

interface PendingHold {
  bookingId: string;
  holdExpiresAt: string;          // ISO。過ぎていたら復元せず破棄
  paymentUrl: string;
  depositAmount: number | null;
  zoomJoinUrl: string | null;
  storeId: StoreId;               // 決済ステップの表示（店舗名・電話）に必要
  opened: boolean;                // 決済リンクを開いた後か（確定ボタンの活性判定）
}

function savePendingHold(hold: PendingHold): void {
  const json = JSON.stringify(hold);
  // LINEは決済から戻る際に新しいタブを開くことがあるため、sessionStorageとlocalStorageの両方へ
  try { sessionStorage.setItem(PENDING_HOLD_KEY, json); } catch { /* プライベートブラウズ等では諦める */ }
  try { localStorage.setItem(PENDING_HOLD_KEY, json); } catch { /* 同上 */ }
}

function clearPendingHold(): void {
  try { sessionStorage.removeItem(PENDING_HOLD_KEY); } catch { /* noop */ }
  try { localStorage.removeItem(PENDING_HOLD_KEY); } catch { /* noop */ }
}

function loadPendingHold(): PendingHold | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PENDING_HOLD_KEY) ?? sessionStorage.getItem(PENDING_HOLD_KEY);
  } catch { return null; }
  if (!raw) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { clearPendingHold(); return null; }
  if (parsed === null || typeof parsed !== 'object') { clearPendingHold(); return null; }
  const h = parsed as Partial<PendingHold>;
  if (typeof h.bookingId !== 'string' || typeof h.holdExpiresAt !== 'string' || typeof h.paymentUrl !== 'string'
    || (h.storeId !== 'tamashima' && h.storeId !== 'kanamitsu')) {
    clearPendingHold();
    return null;
  }
  const expiresMs = new Date(h.holdExpiresAt).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
    clearPendingHold();   // 期限切れ（サーバー側で自動キャンセル済み）は復元しない
    return null;
  }
  return {
    bookingId: h.bookingId,
    holdExpiresAt: h.holdExpiresAt,
    paymentUrl: h.paymentUrl,
    depositAmount: typeof h.depositAmount === 'number' ? h.depositAmount : null,
    zoomJoinUrl: typeof h.zoomJoinUrl === 'string' ? h.zoomJoinUrl : null,
    storeId: h.storeId,
    opened: h.opened === true,
  };
}

function markPendingHoldOpened(): void {
  const h = loadPendingHold();
  if (h && !h.opened) savePendingHold({ ...h, opened: true });
}

// ---- 完了画面ユーティリティ ----
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateJa(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAYS_JA[new Date(`${iso}T00:00:00+09:00`).getDay()];
  return `${y}年${m}月${d}日（${wd}）`;
}

// .ics のテキスト値エスケープ（RFC 5545）
function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Date → UTC表記（YYYYMMDDTHHMMSSZ）。開始時刻はJSTオフセット付きで構築してから変換する
function toIcsUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

// 予約内容を.icsファイルにしてクライアント側でダウンロードさせる（カレンダー追加用）
function downloadBookingIcs(p: {
  date: string;              // YYYY-MM-DD
  time: string;              // HH:MM
  durationMinutes: number;
  storeName: string;
  storePhone: string;
  menuName: string;
}): void {
  const start = new Date(`${p.date}T${p.time}:00+09:00`);   // JST明示
  if (!Number.isFinite(start.getTime())) return;
  const end = new Date(start.getTime() + p.durationMinutes * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Moveact//Web Booking//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2, 10)}@moveact-booking`,
    `DTSTAMP:${toIcsUtc(new Date())}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    `SUMMARY:${icsEscape('Moveact ご予約')}`,
    `LOCATION:${icsEscape(p.storeName)}`,
    `DESCRIPTION:${icsEscape(`メニュー: ${p.menuName}\n店舗電話: ${formatPhone(p.storePhone)}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'moveact-yoyaku.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BookingFlow() {
  const { slug } = useParams();
  // URL の slug は「店舗別URL」か「担当者別URL(booking_slug)」のいずれか。
  //   店舗別 → その店舗に固定（店舗選択をスキップ）。slugなし → 従来どおり両店から選択。
  //   金光店のURLは公式サイトに合わせて /konkou（内部ID kanamitsu へマッピング）。
  const STORE_URL_MAP: Record<string, StoreId> = {
    konkou: 'kanamitsu',    // 金光店（サイトの /konkou/ に合わせる）
    kanamitsu: 'kanamitsu', // 別名（内部IDでも受け付ける）
    tamashima: 'tamashima', // 玉島店
  };
  const storeSlug: StoreId | null = slug ? (STORE_URL_MAP[slug] ?? null) : null;
  const staffSlug: string | undefined = slug && !storeSlug ? slug : undefined;

  const [pageData, setPageData] = useState<PageData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState<Step>('menu');

  const [storeId, setStoreId] = useState<StoreId | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [staffPick, setStaffPick] = useState<string | null | undefined>(undefined); // undefined=未選択, null=おまかせ, string=指名
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo>({ name: '', phone: '', email: '', request: '', consent: false, isStudent: false });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // 冪等キー: 同じ予約試行の再送信（通信断リトライ）でのみ再利用し、二重予約を防ぐ。
  // 成功・別枠選び直し時はリセットして次回は新しいキーにする。
  const idemKeyRef = useRef<string | null>(null);
  const [result, setResult] = useState<CreateBookingResult | null>(null);
  const [paid, setPaid] = useState(false);   // 事前決済の完了（自己申告）が済んだか
  const [restoredOpened, setRestoredOpened] = useState(false);   // 復元時、決済リンクを既に開いていたか

  // 初期データ + slug変更時に状態を完全リセット
  useEffect(() => {
    let cancelled = false;
    setPageData(null); setLoadError(false); setStep('menu');
    setStoreId(null); setMenu(null); setStaffPick(undefined); setDate(null); setTime(null);
    setCustomer({ name: '', phone: '', email: '', request: '', consent: false, isStudent: false });
    setResult(null); setSubmitError(null); setPaid(false); setRestoredOpened(false);
    getBookingPageData(staffSlug)
      .then((d) => {
        if (cancelled) return;
        // 店舗別URLの場合は対象店舗だけに絞る（店舗選択を出さず自動確定）
        const data = storeSlug ? { ...d, stores: d.stores.filter((s) => s.id === storeSlug) } : d;
        setPageData(data);
        if (data.stores.length === 1) setStoreId((prev) => prev ?? data.stores[0].id);   // 復元済みの店舗は上書きしない
        if (d.staff) setStaffPick(d.staff.id);   // 担当者別URLで来た場合は指名を初期選択
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [slug]);

  // タブ破棄・リロード後の復元（マウント時に1回だけ）。
  // 未決済の仮押さえがストレージに残っていれば、決済ステップへ直行して
  // 「お支払いが完了しました」を押せる状態に戻す（確定に必要なのはbookingIdのみ）。
  useEffect(() => {
    const hold = loadPendingHold();
    if (!hold) return;
    setStoreId(hold.storeId);
    setResult({
      bookingId: hold.bookingId,
      requiresDeposit: true,
      depositAmount: hold.depositAmount,
      paymentUrl: hold.paymentUrl,
      holdExpiresAt: hold.holdExpiresAt,
      zoomJoinUrl: hold.zoomJoinUrl,
    });
    setRestoredOpened(hold.opened);
    setStep('payment');
  }, []);

  if (loadError) {
    return (
      <Shell>
        <p className="note">読み込みに失敗しました。<br />お手数ですが、時間をおいて再度お試しください。</p>
      </Shell>
    );
  }
  if (!pageData) {
    return <Shell><div className="loading"><div className="spinner" />空き状況を確認しています…</div></Shell>;
  }

  const staff = pageData.staff;

  // ---- 指名メニュー（menu.requiredStaffSlug）----
  // 設定されたメニューは担当スタッフ固定。ロスターの booking_slug から staff_id を解決し、
  // スタッフ選択ステップを丸ごとスキップする（担当は自動確定）。
  // 店舗選択前でも写真・肩書きを解決できるよう、選択中店舗→他店舗の順で全ロスターを探す
  const rosterAll = (() => {
    const byStore = pageData.staffByStore ?? {};
    const primary = storeId ? (byStore[storeId] ?? []) : [];
    const rest = Object.entries(byStore).filter(([k]) => k !== storeId).flatMap(([, v]) => v ?? []);
    return [...primary, ...rest];
  })();

  const nominatedStaff: { id: string; name: string; photoUrl?: string | null; title?: string | null } | null = (() => {
    const reqSlug = menu?.requiredStaffSlug;
    if (!reqSlug) return null;
    const f = rosterAll.find((s) => s.slug === reqSlug);
    if (f) return { id: f.id, name: f.name, photoUrl: f.photoUrl, title: f.title };
    if (pageData.staff && pageData.staff.slug === reqSlug) return { id: pageData.staff.id, name: pageData.staff.name };
    return null;   // 解決不能でもサーバー側がslugで割当するためnull（おまかせ相当）で送る
  })();

  // 担当者別URL(?staff=xxx)で来た場合の担当情報。ロスターから写真/肩書きを補完し、上部バナーで表示。
  const urlStaffInfo: { photoUrl: string | null; title: string | null } | null = (() => {
    if (!pageData.staff) return null;
    const f = rosterAll.find((s) => s.id === pageData.staff!.id) || rosterAll.find((s) => s.slug === pageData.staff!.slug);
    return { photoUrl: f?.photoUrl ?? null, title: f?.title ?? null };
  })();

  // 担当が固定される場合は 'staff' ステップを省く。
  //   ・指名メニュー（menu.requiredStaffSlug）
  //   ・担当者別URL（?staff=xxx → pageData.staff）… 来店時点で担当が確定しているため、
  //     再度スタッフ選択を出さない（出すとユーザーには意味不明な「指名し直し」に見える）。
  const staffFixed = !!menu?.requiredStaffSlug || !!pageData.staff;
  const flow: Step[] = staffFixed ? FLOW.filter((s) => s !== 'staff') : FLOW;

  // 空き取得・予約作成に渡す担当ID（指名メニューは固定、それ以外は選択結果）
  const effectiveStaffId: string | null = menu?.requiredStaffSlug
    ? (nominatedStaff?.id ?? null)
    : (staffPick ?? null);

  const canNext = (): boolean => {
    if (step === 'menu') return !!storeId && !!menu;
    if (step === 'staff') return staffPick !== undefined;   // おまかせ(null)も選択済み扱い
    if (step === 'datetime') return !!date && !!time;
    if (step === 'customer')
      return customer.name.trim().length > 0 && PHONE_RE.test(customer.phone.trim())
        && isValidEmail(customer.email.trim()) && customer.consent;
    return true;
  };

  const goNext = () => { const i = flow.indexOf(step); if (i >= 0 && i < flow.length - 1) { setStep(flow[i + 1]); window.scrollTo(0, 0); } };
  const goBack = () => { const i = flow.indexOf(step); if (i > 0) { setStep(flow[i - 1]); window.scrollTo(0, 0); } };

  const handleStore = (s: StoreId) => {
    setStoreId(s); setMenu(null); setDate(null); setTime(null);
    setStaffPick(pageData.staff ? pageData.staff.id : undefined);   // 店舗が変わると指名は選び直し
  };
  const handleMenu = (m: Menu) => { setMenu(m); setTime(null); };
  const handleDate = (iso: string) => { setDate(iso); setTime(null); setSubmitError(null); };   // 日付を選び直したらエラー表示を消す

  const submit = async () => {
    if (submitting) return;                       // 二重送信ガード
    if (!storeId || !menu || !date || !time) return;
    setSubmitting(true); setSubmitError(null);
    // 同じ試行にはキーを固定（通信断リトライで二重予約にならないように）。無ければ生成。
    if (!idemKeyRef.current) idemKeyRef.current = crypto.randomUUID();
    let r: CreateBookingResult;
    try {
      r = await createWebBooking({
        storeId, menuId: menu.id, date, time,
        staffId: effectiveStaffId,
        guestName: customer.name.trim(),
        guestPhone: customer.phone.trim(),
        guestEmail: customer.email.trim(),
        request: customer.request.trim() || undefined,
        isStudent: customer.isStudent,
        idempotencyKey: idemKeyRef.current,
      });
    } catch {
      // 通信エラーのみキーを保持（再送信で同じ予約として扱う）。ボタンを再度押せるようにする。
      setSubmitting(false);
      setSubmitError('通信に失敗しました。電波の良い場所で再度お試しください。');
      return;
    }
    setSubmitting(false);
    if (r.bookingId) {
      idemKeyRef.current = null;   // 成立したのでキーを解放（次の予約は新しいキー）
      setResult(r);
      // 初回客で決済リンクがある場合は、お支払いが済むまで確定しない（事前決済ゲート）。
      // リンクが無い初回客・再来店客は従来どおり完了画面へ。
      if (r.requiresDeposit && r.paymentUrl) {
        // タブ破棄・リロードに備えて仮押さえを退避（期限が取れない場合のみ復元不可として保存しない）
        if (r.holdExpiresAt) {
          savePendingHold({
            bookingId: r.bookingId,
            holdExpiresAt: r.holdExpiresAt,
            paymentUrl: r.paymentUrl,
            depositAmount: r.depositAmount ?? null,
            zoomJoinUrl: r.zoomJoinUrl ?? null,
            storeId,
            opened: false,
          });
        }
        setStep('payment');
      } else {
        clearPendingHold();   // 決済不要で完了へ。古い退避が残っていれば片付ける
        setStep('done');
      }
      window.scrollTo(0, 0);
      return;
    }
    // 別の枠を選び直す/入力を直す＝別の予約になるので、冪等キーはリセットする。
    idemKeyRef.current = null;
    if (r.code === 'slot_taken' || r.code === 'closed') {
      setSubmitError(r.error ?? '選択した枠が予約できませんでした。別の日時をお選びください。');
      setTime(null); setStep('datetime');
    } else {
      setSubmitError(r.error ?? '予約に失敗しました。入力内容をご確認ください。');
    }
  };

  const stepIndex = flow.indexOf(step);
  const isTerminal = step === 'payment' || step === 'done';

  // 選んだ担当者の表示名（null=おまかせ）。指名メニューは固定担当を優先。
  const chosenStaffName: string | null = (() => {
    if (menu?.requiredStaffSlug) return nominatedStaff?.name ?? null;
    if (staffPick == null) return null;
    const list = storeId ? (pageData.staffByStore?.[storeId] ?? []) : [];
    const f = list.find((s) => s.id === staffPick);
    if (f) return f.name;
    if (pageData.staff && pageData.staff.id === staffPick) return pageData.staff.name;
    return null;
  })();

  // 各ステップで、選択中の内容をフッターに表示する
  const selLabel = (() => {
    if (step === 'staff' && staffPick !== undefined) {
      return staffPick === null ? 'おまかせ' : `${chosenStaffName ?? 'ご指名'}（ご指名）`;
    }
    if (step === 'datetime' && date && time) {
      const [, mo, dy] = date.split('-').map(Number);
      // 曜日は端末のタイムゾーンに依存させない（UTC固定で日付そのものの曜日を取る）
      const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(`${date}T00:00:00Z`).getUTCDay()];
      return `${mo}/${dy}（${wd}） ${time}〜`;
    }
    return null;
  })();

  return (
    <Shell>
      {!isTerminal && (
        <>
          {staff && (
            <div className="staff-intro">
              <div className="ring">
                {urlStaffInfo?.photoUrl
                  ? <img src={urlStaffInfo.photoUrl} alt={staff.name} />
                  : staff.name.charAt(0)}
              </div>
              <div>
                <div className="label">ご指名予約</div>
                <div className="name">
                  {staff.name}
                  {urlStaffInfo?.title && <span className="si-title">{urlStaffInfo.title}</span>}
                </div>
                <div className="note">この担当者でご予約を承ります</div>
              </div>
            </div>
          )}

          {/* 店舗別URL(/kanamitsu・/tamashima)で来た場合の店舗バナー */}
          {storeSlug && (
            <div className="store-intro">
              <div className="label">ご予約店舗</div>
              <div className="name">{STORE_INFO[storeSlug].name}</div>
              <div className="note">{STORE_INFO[storeSlug].address}</div>
            </div>
          )}

          <StepIndicator
            steps={flow.map((s) => ({ key: s, label: STEP_NAMES[s] }))}
            current={stepIndex}
          />

          {step !== 'menu' && <button className="back" onClick={goBack}>← 戻る</button>}

          {/* 指名メニュー: スタッフ選択の代わりに固定担当を表示 */}
          {menu?.requiredStaffSlug && (step === 'datetime' || step === 'confirm') && (
            <div className="nominated-chip">
              {nominatedStaff?.photoUrl && (
                <img src={nominatedStaff.photoUrl} alt={nominatedStaff.name} className="nc-photo" loading="lazy" />
              )}
              <span className="nc-text">
                担当: <b>{nominatedStaff?.name ?? 'ご指名スタッフ'}</b>（指名）
                {nominatedStaff?.title && <span className="nc-title">{nominatedStaff.title}</span>}
              </span>
            </div>
          )}
        </>
      )}

      {step === 'menu' && (
        <StoreMenuStep pageData={pageData} storeId={storeId} menu={menu}
          onSelectStore={handleStore} onSelectMenu={handleMenu} />
      )}
      {step === 'staff' && storeId && (
        <StaffStep
          // 選択中メニューの施術種別を担当できるスタッフだけを指名候補にする
          staffList={(pageData.staffByStore?.[storeId] ?? []).filter(
            (s) => !menu?.treatmentType || (s.skills ?? []).includes(menu.treatmentType)
          )}
          selected={staffPick}
          onSelect={(id) => setStaffPick(id)}
        />
      )}
      {step === 'datetime' && storeId && menu && (
        <DateTimeStep storeId={storeId} menu={menu} staffId={effectiveStaffId}
          date={date} time={time} error={submitError} onSelectDate={handleDate} onSelectTime={setTime} />
      )}
      {step === 'customer' && (
        <CustomerStep
          customer={customer}
          setCustomer={setCustomer}
          summary={storeId && menu && date && time ? {
            storeName: STORE_INFO[storeId].name,
            menuName: menu.name,
            dateLabel: formatDateJa(date),
            time,
            staffLabel: menu.requiredStaffSlug
              ? `${nominatedStaff?.name ?? 'ご指名スタッフ'}（ご指名）`
              : (staffPick === null ? 'おまかせ' : `${chosenStaffName ?? 'ご指名'}（ご指名）`),
          } : undefined}
        />
      )}
      {step === 'confirm' && storeId && menu && date && time && (
        <ConfirmStep storeId={storeId} menu={menu} date={date} time={time}
          customer={customer} staffName={chosenStaffName} error={submitError} />
      )}
      {step === 'payment' && storeId && result && (
        <PaymentStep
          storeId={storeId}
          result={result}
          initialOpened={restoredOpened}
          onConfirmed={(zoomUrl) => { setPaid(true); if (zoomUrl) setResult((prev) => prev ? { ...prev, zoomJoinUrl: zoomUrl } : prev); setStep('done'); window.scrollTo(0, 0); }}
          onReset={() => { clearPendingHold(); window.location.reload(); }}
        />
      )}
      {step === 'done' && storeId && result && (
        <DoneView storeId={storeId} result={result} paid={paid}
          menu={menu} date={date} time={time} staffName={chosenStaffName}
          onReset={() => window.location.reload()} />
      )}

      {!isTerminal && (
        <div className="footer">
          {selLabel && <div className="footer-sel">選択中： <b>{selLabel}</b></div>}
          {/* お客様情報が未完了のときは「なぜ進めないか」を明示する（無言のdisabledにしない） */}
          {step === 'customer' && !canNext() && (
            <div className="footer-hint">
              あと {[
                customer.name.trim().length === 0 && 'お名前',
                !PHONE_RE.test(customer.phone.trim()) && '電話番号',
                !isValidEmail(customer.email.trim()) && 'メールアドレス',
                !customer.consent && '同意のチェック',
              ].filter(Boolean).join('・')} をご入力ください
            </div>
          )}
          {step === 'confirm' ? (
            <button className="btn accent" disabled={submitting} onClick={submit}>
              {submitting ? '送信中…' : 'この内容で予約する'}
            </button>
          ) : (
            <button className="btn" disabled={!canNext()} onClick={goNext}>次へ進む</button>
          )}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <header className="app-header">
        <div className="brandmark">MOVEACT<span className="dot">.</span></div>
        <div className="brandtag">整体・美容鍼・ピラティス</div>
        <div className="brandrule" />
      </header>
      <div className="content">{children}</div>
    </div>
  );
}

// 事前決済ステップ: お支払い → 戻ってきて「お支払いが完了しました」で予約確定。
// AirペイにはAPI/Webhookが無いため、確定の合図はお客様の自己申告。
function PaymentStep({ storeId, result, initialOpened, onConfirmed, onReset }: {
  storeId: StoreId; result: CreateBookingResult; initialOpened: boolean; onConfirmed: (zoomJoinUrl?: string | null) => void; onReset: () => void;
}) {
  const store = STORE_INFO[storeId];
  const [opened, setOpened] = useState(initialOpened);     // 決済リンクを開いたか（復元時は退避した値を引き継ぐ）
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);   // 仮押さえ期限切れ（サーバー応答 hold_expired）

  // ---- 仮押さえ期限カウントダウン（holdExpiresAt → 残り mm:ss を1秒毎に更新） ----
  const holdExpiresMs = (() => {
    if (!result.holdExpiresAt) return null;
    const t = new Date(result.holdExpiresAt).getTime();
    return Number.isFinite(t) ? t : null;
  })();
  const [remainMs, setRemainMs] = useState<number | null>(
    () => holdExpiresMs !== null ? Math.max(0, holdExpiresMs - Date.now()) : null,
  );
  useEffect(() => {
    if (holdExpiresMs === null) return;
    const tick = () => {
      const left = Math.max(0, holdExpiresMs - Date.now());
      setRemainMs(left);
      if (left <= 0) clearInterval(id);
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [holdExpiresMs]);

  const timedOut = remainMs !== null && remainMs <= 0;   // クライアント側で期限切れを検知
  // 注意: クライアントのタイマーが0になっても退避キーは消さない・確定ボタンも消さない。
  // 端末時計のズレや29分台に支払った客に備え、確定はサーバーの猶予(GRACE)判定に委ねる。
  // （消してしまうと支払い済みの客が確定できず、やり直して二重支払いになる）

  const mmss = remainMs !== null
    ? `${String(Math.floor(remainMs / 60_000)).padStart(2, '0')}:${String(Math.floor((remainMs % 60_000) / 1000)).padStart(2, '0')}`
    : null;

  const confirm = async () => {
    if (confirming || !result.bookingId) return;
    setConfirming(true); setErr(null);
    let r: ConfirmBookingResult;
    try {
      r = await confirmWebBooking(result.bookingId);
    } catch {
      setConfirming(false);
      setErr('通信に失敗しました。電波の良い場所で再度お試しください。');
      return;
    }
    setConfirming(false);
    if (r.ok) { clearPendingHold(); onConfirmed(r.zoomJoinUrl); return; }
    if (r.code === 'hold_expired') {
      clearPendingHold();   // 期限切れ＝自動キャンセル済み。復元対象から外す
      setExpired(true);
      setErr(r.error ?? '恐れ入ります、お時間切れとなりました。お支払いがお済みの場合は店舗までご連絡ください。');
      return;
    }
    if (r.code === 'not_found') clearPendingHold();   // 予約が存在しない（キャンセル済み等）
    setErr(r.error ?? '確定に失敗しました。お手数ですがもう一度お試しください。');
  };

  return (
    <div className="done-screen">
      <h2>お支払いにお進みください</h2>
      <p>
        ご予約を確定するには、事前のお支払い（事前決済）が必要です。<br />
        下のボタンからお支払いを済ませ、お戻りになりましたら<br />
        「お支払いが完了しました」を押してください。
      </p>

      <div className="paybox">
        <div className="ph">事前決済のご案内</div>
        {result.depositAmount != null && (
          <div className="amt">{formatYen(result.depositAmount)}<small>（税込）</small></div>
        )}
        {!timedOut && mmss && (
          <div style={{ fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--caramel-deep)', margin: '2px 0 10px', letterSpacing: '0.04em' }}>
            お支払い期限 残り <b style={{ fontSize: 19 }}>{mmss}</b>
          </div>
        )}
        <p>お支払いがお済みでない場合、約30分でこの仮予約は自動的に取り消されます。</p>
      </div>

      {timedOut && !expired && (
        <div className="banner-err" style={{ marginBottom: 14 }}>
          お支払い期限を過ぎています。<b>お支払いがお済みの場合は「お支払いが完了しました」を押してください。</b>まだの場合は最初からやり直してください。
        </div>
      )}
      {err && <div className="banner-err" style={{ marginBottom: 14 }}>{err}</div>}

      {!expired ? (
        <>
          {result.paymentUrl && (
            <a className="btn accent" style={{ display: 'block', textDecoration: 'none', textAlign: 'center', marginBottom: 12 }}
              href={result.paymentUrl} target="_blank" rel="noopener noreferrer"
              onClick={() => { setOpened(true); markPendingHoldOpened(); }}>
              事前決済へ進む
            </a>
          )}
          <button className="btn" disabled={(!opened && !timedOut) || confirming} onClick={confirm}>
            {confirming ? '確認中…' : 'お支払いが完了しました'}
          </button>
          {!opened && !timedOut && (
            <p className="note" style={{ marginTop: 10 }}>※まず「事前決済へ進む」からお支払いください。</p>
          )}
        </>
      ) : (
        <div className="summary" style={{ textAlign: 'left', marginTop: 4 }}>
          <div className="srow"><div className="k">店舗</div><div className="v"><span className="strong">{store.name}</span></div></div>
          <div className="srow"><div className="k">電話</div><div className="v"><a href={`tel:${store.phone}`}>{formatPhone(store.phone)}</a></div></div>
        </div>
      )}

      <button className={timedOut ? 'btn accent' : 'btn'} style={{ marginTop: 18 }} onClick={onReset}>最初からやり直す</button>
    </div>
  );
}

function DoneView({ storeId, result, paid, menu, date, time, staffName, onReset }: {
  storeId: StoreId; result: CreateBookingResult; paid: boolean;
  menu: Menu | null; date: string | null; time: string | null; staffName: string | null;   // 復元経路（タブ破棄後）では失われるためnull許容
  onReset: () => void;
}) {
  const store = STORE_INFO[storeId];
  const needsPay = !!result.requiresDeposit;

  // 予約サマリ行（メニュー・日時・担当・料金）。復元経路で詳細が無い場合は出さない
  const summaryRows = menu && date && time ? (
    <>
      <div className="srow">
        <div className="k">メニュー</div>
        <div className="v"><span className="strong">{menu.name}</span><br />約{menu.durationMinutes}分</div>
      </div>
      <div className="srow feature">
        <div className="k">日時</div>
        <div className="v"><span className="strong">{formatDateJa(date)}　{time}</span></div>
      </div>
      <div className="srow">
        <div className="k">担当</div>
        <div className="v">{staffName ? <>{staffName}　<span className="tag nm">ご指名</span></> : <span className="tag om">おまかせ</span>}</div>
      </div>
      <div className="srow">
        <div className="k">料金</div>
        <div className="v">{formatYen(menu.price)}（税込）</div>
      </div>
    </>
  ) : null;

  // 変更・キャンセル案内 ＋ カレンダー追加（.icsダウンロード）
  const afterSummary = (
    <>
      <p className="note" style={{ padding: '0 10px', marginTop: 14 }}>
        ご予約の変更・キャンセルは、確認メールに記載のリンクからお手続きいただけます。
      </p>
      {menu && date && time && (
        <button
          className="btn"
          style={{ marginTop: 12 }}
          onClick={() => downloadBookingIcs({
            date, time,
            durationMinutes: menu.durationMinutes,
            storeName: store.name,
            storePhone: store.phone,
            menuName: menu.name,
          })}
        >
          カレンダーに追加
        </button>
      )}
    </>
  );

  // Meta Pixel: 予約が「確定」したときだけ Schedule イベントを送信（広告の予約コンバージョン計測）。
  // 初回客の未払い（needsPay && !paid）は未確定なので発火しない（CVの水増しを防ぐ）。
  useEffect(() => {
    if (needsPay && !paid) return;
    window.fbq?.('track', 'Schedule', {
      content_name: store.name,
      currency: 'JPY',
      value: result.depositAmount ?? 0,
    });
    // 予約1件につき1回。result.bookingId が変わる＝別予約の確定時のみ再送信
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.bookingId, needsPay, paid]);

  // オンライン（Zoom）予約: 参加URLを画面に表示（メールに依存せず確実に届ける）
  if (result.zoomJoinUrl) {
    const confirmed = !needsPay || paid;
    return (
      <div className="done-screen">
        <div className="seal">
          <svg viewBox="0 0 24 24" fill="none" stroke="#C4956A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.2 4.2L19 7" />
          </svg>
        </div>
        <h2>{confirmed ? 'ご予約が確定しました' : 'ご予約を承りました'}</h2>
        <p>オンライン（Zoom）でのご案内です。<br />当日はお時間になりましたら下記からご参加ください。</p>

        <div style={{ marginTop: 18, padding: 18, background: '#eef6f1', border: '1px solid #b9ddc9', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ color: '#1f7a55', fontSize: 13, marginBottom: 12 }}>Zoom 参加用リンク</div>
          <a href={result.zoomJoinUrl} target="_blank" rel="noopener noreferrer" className="btn accent" style={{ display: 'inline-block', textDecoration: 'none' }}>Zoomに参加する</a>
          <p className="note" style={{ marginTop: 12, wordBreak: 'break-all' }}>{result.zoomJoinUrl}</p>
          <p className="note" style={{ marginTop: 6 }}>このリンクは当日まで必要です。スクリーンショット等で控えておいてください。</p>
        </div>

        {!confirmed && (
          <p className="note" style={{ marginTop: 14 }}>
            ※初回のお客様は、事前のお支払い後にご予約が確定します。お支払いのご案内を改めてお送りします。
          </p>
        )}

        <div className="summary" style={{ textAlign: 'left', marginTop: 18 }}>
          <div className="srow feature"><div className="k">店舗</div><div className="v"><span className="strong">{store.name}</span></div></div>
          {summaryRows}
          <div className="srow"><div className="k">お問い合わせ</div><div className="v"><a href={`tel:${store.phone}`}>{formatPhone(store.phone)}</a></div></div>
        </div>

        {afterSummary}

        <button className="btn" style={{ marginTop: 18 }} onClick={onReset}>続けて予約する</button>
      </div>
    );
  }

  return (
    <div className="done-screen">
      <div className="seal">
        <svg viewBox="0 0 24 24" fill="none" stroke="#C4956A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.2 4.2L19 7" />
        </svg>
      </div>

      {needsPay && paid ? (
        <>
          <h2>ご予約が確定しました</h2>
          <p>お支払いありがとうございました。<br />当日お気をつけてお越しくださいませ。</p>
        </>
      ) : needsPay ? (
        // 決済リンクが無い初回客のフォールバック（スタッフが個別にご案内）
        <>
          <h2>ご予約を承りました</h2>
          <p>
            初回のお客様には、ご予約確定のため事前のお支払いをお願いしております。<br />
            お支払い用のご案内を、お電話またはメッセージでお送りいたします。<br />
            確認後にご予約が確定いたします。
          </p>
        </>
      ) : (
        <>
          <h2>ご予約ありがとうございます</h2>
          <p>ご予約を承りました。<br />当日お気をつけてお越しくださいませ。</p>
        </>
      )}

      <div className="summary" style={{ textAlign: 'left', marginTop: 18 }}>
        <div className="srow feature"><div className="k">店舗</div><div className="v"><span className="strong">{store.name}</span></div></div>
        {summaryRows}
        <div className="srow"><div className="k">住所</div><div className="v" style={{ fontSize: 13 }}>{store.address}</div></div>
        <div className="srow"><div className="k">電話</div><div className="v"><a href={`tel:${store.phone}`}>{formatPhone(store.phone)}</a></div></div>
      </div>

      {afterSummary}

      <button className="btn" style={{ marginTop: 18 }} onClick={onReset}>続けて予約する</button>
    </div>
  );
}
