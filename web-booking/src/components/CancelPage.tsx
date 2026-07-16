import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getCancelInfo, cancelBooking, type CancelBookingInfo, formatPhone } from '../lib/api';

type Phase = 'loading' | 'confirm' | 'cancelled' | 'error';

export function CancelPage() {
  const { token } = useParams<{ token: string }>();
  const [phase, setPhase] = useState<Phase>('loading');
  const [booking, setBooking] = useState<CancelBookingInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [staffSlug, setStaffSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setErrorMsg('リンクが正しくありません。'); setPhase('error'); return; }
    getCancelInfo(token)
      .then((r) => {
        if (r.ok && r.booking) {
          setBooking(r.booking);
          setPhase('confirm');
        } else {
          setErrorMsg(r.error ?? '予約情報の取得に失敗しました。');
          setPhase('error');
        }
      })
      .catch(() => {
        setErrorMsg('通信に失敗しました。電波の良い場所で再度お試しください。');
        setPhase('error');
      });
  }, [token]);

  const handleCancel = async () => {
    if (!token || processing) return;
    setProcessing(true);
    try {
      const r = await cancelBooking(token);
      if (r.ok || r.alreadyCancelled) {
        setStaffSlug(r.staffSlug ?? null);
        setPhase('cancelled');
      } else {
        setErrorMsg(r.error ?? 'キャンセルに失敗しました。');
        setPhase('error');
      }
    } catch {
      setErrorMsg('通信に失敗しました。電波の良い場所で再度お試しください。');
      setPhase('error');
    } finally {
      setProcessing(false);
    }
  };

  const handleReschedule = async () => {
    if (!token || processing) return;
    setProcessing(true);
    try {
      const r = await cancelBooking(token);
      if (r.ok || r.alreadyCancelled) {
        const slug = r.staffSlug ?? booking?.staffSlug;
        window.location.href = slug ? `/${slug}` : '/';
      } else {
        setErrorMsg(r.error ?? 'キャンセルに失敗しました。');
        setPhase('error');
      }
    } catch {
      setErrorMsg('通信に失敗しました。電波の良い場所で再度お試しください。');
      setPhase('error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="brandmark">MOVEACT<span className="dot">.</span></div>
        <div className="brandtag">整体・美容鍼・ピラティス</div>
        <div className="brandrule" />
      </header>
      <div className="content">
        {phase === 'loading' && (
          <div className="loading"><div className="spinner" />読み込み中</div>
        )}

        {phase === 'confirm' && booking && (
          <div className="done-screen">
            <h2 style={{ marginBottom: 8 }}>ご予約のキャンセル・変更</h2>
            <p style={{ color: 'var(--taupe)', fontSize: 14, marginTop: 0 }}>
              以下のご予約をキャンセルまたは変更します。
            </p>

            <div className="summary" style={{ textAlign: 'left', marginBottom: 24 }}>
              <div className="srow"><div className="k">日時</div><div className="v"><span className="strong">{booking.dateLabel} {booking.time}</span></div></div>
              <div className="srow"><div className="k">メニュー</div><div className="v">{booking.menuName}（{booking.durationMinutes}分）</div></div>
              <div className="srow"><div className="k">店舗</div><div className="v">{booking.storeName}</div></div>
            </div>

            {!booking.canCancel ? (
              <>
                <div className="banner-err">{booking.cannotCancelReason}</div>
                {(booking.cannotCancelReason?.includes('電話') || booking.cannotCancelReason?.includes('決済')) && (
                  <div className="summary" style={{ textAlign: 'left', marginTop: 16 }}>
                    <div className="srow"><div className="k">電話</div>
                      <div className="v"><a href={`tel:${booking.storePhone.replace(/-/g, '')}`}>{booking.storePhone}</a></div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <button
                  className="btn"
                  disabled={processing}
                  onClick={handleReschedule}
                  style={{ marginBottom: 10 }}
                >
                  {processing ? '処理中…' : '別の日時に変更する'}
                </button>
                <button
                  className="btn"
                  disabled={processing}
                  onClick={handleCancel}
                  style={{ background: 'transparent', color: 'var(--taupe)', border: '1px solid var(--taupe-soft)', fontSize: 13, boxShadow: 'none' }}
                >
                  {processing ? '処理中…' : 'キャンセルする'}
                </button>
                <p className="note" style={{ marginTop: 12, fontSize: 12 }}>
                  ※「別の日時に変更する」を選ぶと、現在の予約がキャンセルされ予約画面に戻ります。
                </p>
              </>
            )}
          </div>
        )}

        {phase === 'cancelled' && (
          <div className="done-screen">
            <div className="seal">
              <svg viewBox="0 0 24 24" fill="none" stroke="#C4956A" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.2 4.2L19 7" />
              </svg>
            </div>
            <h2>キャンセルが完了しました</h2>
            <p>ご予約をキャンセルいたしました。<br />またのご来院をお待ちしております。</p>
            <button
              className="btn"
              style={{ marginTop: 16 }}
              onClick={() => { window.location.href = staffSlug ? `/${staffSlug}` : '/'; }}
            >
              新しく予約する
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="done-screen">
            <p className="note" style={{ marginBottom: 16 }}>{errorMsg}</p>
            {booking?.storePhone && (
              <div className="summary" style={{ textAlign: 'left' }}>
                <div className="srow"><div className="k">電話</div>
                  <div className="v">
                    <a href={`tel:${booking.storePhone.replace(/-/g, '')}`}>{formatPhone(booking.storePhone)}</a>
                  </div>
                </div>
              </div>
            )}
            <button className="btn" style={{ marginTop: 16 }} onClick={() => window.history.back()}>
              戻る
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
