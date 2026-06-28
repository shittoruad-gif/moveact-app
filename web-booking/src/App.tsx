import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import type { PageData, StoreId, Menu, CreateBookingResult, ConfirmBookingResult } from './lib/api';
import { getBookingPageData, createWebBooking, confirmWebBooking, STORE_INFO, formatPhone, formatYen } from './lib/api';
import { StoreMenuStep } from './components/StoreMenuStep';
import { DateTimeStep } from './components/DateTimeStep';
import { CustomerStep, type CustomerInfo } from './components/CustomerStep';
import { ConfirmStep } from './components/ConfirmStep';

type Step = 'menu' | 'datetime' | 'customer' | 'confirm' | 'payment' | 'done';
const FLOW: Step[] = ['menu', 'datetime', 'customer', 'confirm'];
const STEP_NAMES: Record<string, string> = { menu: 'メニュー', datetime: '日時', customer: 'お客様', confirm: '確認' };
const PHONE_RE = /^[0-9\-+\s()]{10,20}$/;

export function BookingFlow() {
  const { slug } = useParams();

  const [pageData, setPageData] = useState<PageData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [step, setStep] = useState<Step>('menu');

  const [storeId, setStoreId] = useState<StoreId | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo>({ name: '', phone: '', email: '', request: '', consent: false, isStudent: false });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateBookingResult | null>(null);
  const [paid, setPaid] = useState(false);   // 事前決済の完了（自己申告）が済んだか

  // 初期データ + slug変更時に状態を完全リセット
  useEffect(() => {
    let cancelled = false;
    setPageData(null); setLoadError(false); setStep('menu');
    setStoreId(null); setMenu(null); setDate(null); setTime(null);
    setCustomer({ name: '', phone: '', email: '', request: '', consent: false, isStudent: false });
    setResult(null); setSubmitError(null); setPaid(false);
    getBookingPageData(slug)
      .then((d) => {
        if (cancelled) return;
        setPageData(d);
        if (d.stores.length === 1) setStoreId(d.stores[0].id);
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
  }, [slug]);

  if (loadError) {
    return (
      <Shell>
        <p className="note">読み込みに失敗しました。<br />お手数ですが、時間をおいて再度お試しください。</p>
      </Shell>
    );
  }
  if (!pageData) {
    return <Shell><div className="loading"><div className="spinner" />読み込み中</div></Shell>;
  }

  const staff = pageData.staff;

  const canNext = (): boolean => {
    if (step === 'menu') return !!storeId && !!menu;
    if (step === 'datetime') return !!date && !!time;
    if (step === 'customer')
      return customer.name.trim().length > 0 && PHONE_RE.test(customer.phone.trim()) && customer.consent;
    return true;
  };

  const goNext = () => { const i = FLOW.indexOf(step); if (i >= 0 && i < FLOW.length - 1) { setStep(FLOW[i + 1]); window.scrollTo(0, 0); } };
  const goBack = () => { const i = FLOW.indexOf(step); if (i > 0) { setStep(FLOW[i - 1]); window.scrollTo(0, 0); } };

  const handleStore = (s: StoreId) => { setStoreId(s); setMenu(null); setDate(null); setTime(null); };
  const handleMenu = (m: Menu) => { setMenu(m); setTime(null); };
  const handleDate = (iso: string) => { setDate(iso); setTime(null); };

  const submit = async () => {
    if (submitting) return;                       // 二重送信ガード
    if (!storeId || !menu || !date || !time) return;
    setSubmitting(true); setSubmitError(null);
    let r: CreateBookingResult;
    try {
      r = await createWebBooking({
        storeId, menuId: menu.id, date, time,
        staffId: staff?.id ?? null,
        guestName: customer.name.trim(),
        guestPhone: customer.phone.trim(),
        guestEmail: customer.email.trim() || undefined,
        request: customer.request.trim() || undefined,
        isStudent: customer.isStudent,
      });
    } catch {
      setSubmitting(false);
      setSubmitError('通信に失敗しました。電波の良い場所で再度お試しください。');
      return;
    }
    setSubmitting(false);
    if (r.bookingId) {
      setResult(r);
      // 初回客で決済リンクがある場合は、お支払いが済むまで確定しない（事前決済ゲート）。
      // リンクが無い初回客・再来店客は従来どおり完了画面へ。
      setStep(r.requiresDeposit && r.paymentUrl ? 'payment' : 'done');
      window.scrollTo(0, 0);
      return;
    }
    if (r.code === 'slot_taken' || r.code === 'closed') {
      setSubmitError(r.error ?? '選択した枠が予約できませんでした。別の日時をお選びください。');
      setTime(null); setStep('datetime');
    } else {
      setSubmitError(r.error ?? '予約に失敗しました。入力内容をご確認ください。');
    }
  };

  const stepIndex = FLOW.indexOf(step);
  const isTerminal = step === 'payment' || step === 'done';

  return (
    <Shell>
      {!isTerminal && (
        <>
          {staff && (
            <div className="staff-intro">
              <div className="ring">{staff.name.charAt(0)}</div>
              <div>
                <div className="label">ご指名予約</div>
                <div className="name">{staff.name}</div>
                <div className="note">担当者を指定してご予約いただけます</div>
              </div>
            </div>
          )}

          <div className="steps">
            {FLOW.map((s, i) => (
              <div key={s} className={`s ${i === stepIndex ? 'active' : ''} ${i < stepIndex ? 'done' : ''}`}>
                <div className="num">{i < stepIndex ? '✓' : i + 1}</div>
                <div className="nm">{STEP_NAMES[s]}</div>
              </div>
            ))}
          </div>

          {step !== 'menu' && <button className="back" onClick={goBack}>← 戻る</button>}
        </>
      )}

      {step === 'menu' && (
        <StoreMenuStep pageData={pageData} storeId={storeId} menu={menu}
          onSelectStore={handleStore} onSelectMenu={handleMenu} />
      )}
      {step === 'datetime' && storeId && menu && (
        <DateTimeStep storeId={storeId} menu={menu} staffId={staff?.id ?? null}
          date={date} time={time} onSelectDate={handleDate} onSelectTime={setTime} />
      )}
      {step === 'customer' && <CustomerStep customer={customer} setCustomer={setCustomer} />}
      {step === 'confirm' && storeId && menu && date && time && (
        <ConfirmStep pageData={pageData} storeId={storeId} menu={menu} date={date} time={time}
          customer={customer} error={submitError} />
      )}
      {step === 'payment' && storeId && result && (
        <PaymentStep
          storeId={storeId}
          result={result}
          onConfirmed={() => { setPaid(true); setStep('done'); window.scrollTo(0, 0); }}
          onReset={() => window.location.reload()}
        />
      )}
      {step === 'done' && storeId && result && (
        <DoneView storeId={storeId} result={result} paid={paid} onReset={() => window.location.reload()} />
      )}

      {!isTerminal && (
        <div className="footer">
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
function PaymentStep({ storeId, result, onConfirmed, onReset }: {
  storeId: StoreId; result: CreateBookingResult; onConfirmed: () => void; onReset: () => void;
}) {
  const store = STORE_INFO[storeId];
  const [opened, setOpened] = useState(false);     // 決済リンクを開いたか
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);   // 仮押さえ期限切れ

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
    if (r.ok) { onConfirmed(); return; }
    if (r.code === 'hold_expired') {
      setExpired(true);
      setErr(r.error ?? '恐れ入ります、お時間切れとなりました。お支払いがお済みの場合は店舗までご連絡ください。');
      return;
    }
    setErr(r.error ?? '確定に失敗しました。お手数ですがもう一度お試しください。');
  };

  return (
    <div className="done">
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
        <p>お支払いがお済みでない場合、約30分でこの仮予約は自動的に取り消されます。</p>
      </div>

      {err && <div className="banner-err" style={{ marginBottom: 14 }}>{err}</div>}

      {!expired ? (
        <>
          {result.paymentUrl && (
            <a className="btn accent" style={{ display: 'block', textDecoration: 'none', textAlign: 'center', marginBottom: 12 }}
              href={result.paymentUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)}>
              事前決済へ進む
            </a>
          )}
          <button className="btn" disabled={!opened || confirming} onClick={confirm}>
            {confirming ? '確認中…' : 'お支払いが完了しました'}
          </button>
          {!opened && (
            <p className="note" style={{ marginTop: 10 }}>※まず「事前決済へ進む」からお支払いください。</p>
          )}
        </>
      ) : (
        <div className="summary" style={{ textAlign: 'left', marginTop: 4 }}>
          <div className="srow"><div className="k">店舗</div><div className="v"><span className="strong">{store.name}</span></div></div>
          <div className="srow"><div className="k">電話</div><div className="v"><a href={`tel:${store.phone}`}>{formatPhone(store.phone)}</a></div></div>
        </div>
      )}

      <button className="btn" style={{ marginTop: 18 }} onClick={onReset}>最初からやり直す</button>
    </div>
  );
}

function DoneView({ storeId, result, paid, onReset }: { storeId: StoreId; result: CreateBookingResult; paid: boolean; onReset: () => void }) {
  const store = STORE_INFO[storeId];
  const needsPay = !!result.requiresDeposit;

  return (
    <div className="done">
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
        <div className="srow"><div className="k">店舗</div><div className="v"><span className="strong">{store.name}</span></div></div>
        <div className="srow"><div className="k">住所</div><div className="v" style={{ fontSize: 13 }}>{store.address}</div></div>
        <div className="srow"><div className="k">電話</div><div className="v"><a href={`tel:${store.phone}`}>{formatPhone(store.phone)}</a></div></div>
      </div>

      <button className="btn" style={{ marginTop: 18 }} onClick={onReset}>続けて予約する</button>
    </div>
  );
}
