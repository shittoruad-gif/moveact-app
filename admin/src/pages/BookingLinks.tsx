import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

// スタッフ別・店舗別のネット予約URLを一覧表示し、コピーできる画面。
// お客様に渡す「この担当で予約するURL」を、管理画面からすぐ取り出せるようにする。

const BOOKING_BASE = 'https://booking.moveact.net';

type StoreId = 'tamashima' | 'kanamitsu';
const STORE_NAMES: Record<StoreId, string> = { tamashima: '玉島店', kanamitsu: '金光店' };
// 店舗別URLのスラッグ（web-booking の STORE_URL_MAP と一致させる）
const STORE_SLUG: Record<StoreId, string> = { tamashima: 'tamashima', kanamitsu: 'konkou' };

interface StaffRow {
  id: string;
  full_name: string;
  booking_slug: string | null;
  role: string;
}
interface StoreLink { staff_id: string; store_id: string; }
interface MenuRow { id: string; name: string; booking_slug: string | null; is_unlisted: boolean; sort_order: number | null; }

export function BookingLinks() {
  const { userId } = useAuth();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [stores, setStores] = useState<StoreLink[]>([]);
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const [p, ss, mm] = await Promise.all([
        supabase.from('profiles').select('id, full_name, booking_slug, role').in('role', ['staff', 'admin']),
        supabase.from('staff_stores').select('staff_id, store_id').eq('is_active', true),
        supabase.from('treatment_menus').select('id, name, booking_slug, is_unlisted, sort_order').eq('is_active', true).order('sort_order'),
      ]);
      if (cancelled) return;
      if (p.error || ss.error || mm.error) {
        setError('予約リンクの読み込みに失敗しました。時間をおいて再度お試しください。');
        setStaff([]); setStores([]); setMenus([]);
      } else {
        setStaff((p.data as StaffRow[]) ?? []);
        setStores((ss.data as StoreLink[]) ?? []);
        setMenus((mm.data as MenuRow[]) ?? []);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // 公開メニュー（一般URLでも見える）と限定メニュー（専用URLのみ）に分ける
  const menusWithSlug = useMemo(() => menus.filter((m) => m.booking_slug), [menus]);
  const publicMenus = useMemo(() => menusWithSlug.filter((m) => !m.is_unlisted), [menusWithSlug]);
  const unlistedMenus = useMemo(() => menusWithSlug.filter((m) => m.is_unlisted), [menusWithSlug]);

  // slug を持つスタッフのみ・slug重複を除外・氏名順
  const staffWithSlug = useMemo(() => {
    const seen = new Set<string>();
    return staff
      .filter((s) => s.booking_slug && !seen.has(s.booking_slug) && seen.add(s.booking_slug))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ja'));
  }, [staff]);

  const storeLabelFor = (staffId: string): string => {
    const ids = stores.filter((s) => s.staff_id === staffId).map((s) => s.store_id);
    const names = (['kanamitsu', 'tamashima'] as StoreId[]).filter((s) => ids.includes(s)).map((s) => STORE_NAMES[s]);
    return names.join('・') || '—';
  };

  const copy = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // クリップボードAPIが使えない環境向けフォールバック（一時textareaで選択コピー）
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(key);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
  };

  // 1行分（ラベル・URL・コピーボタン）
  const LinkRow = ({ label, sub, url, k }: { label: string; sub?: string; url: string; k: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 0', borderBottom: '1px solid var(--line)' }}>
      <div style={{ minWidth: 130 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--sub)' }}>{sub}</div>}
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{ flex: 1, minWidth: 220, fontSize: 13, color: 'var(--accent)', wordBreak: 'break-all', textDecoration: 'none' }}
        title="クリックで予約ページを開きます"
      >{url}</a>
      <button
        type="button"
        className={`btn btn-sm${copied === k ? '' : ' btn-primary'}`}
        onClick={() => copy(url, k)}
        style={{ minWidth: 96, whiteSpace: 'nowrap' }}
      >
        {copied === k ? '✓ コピー済み' : 'リンクをコピー'}
      </button>
    </div>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">予約リンク</h2>
        <p className="page-help">
          お客様にお渡しするネット予約のURLです。担当を指定したリンクを開くと、そのスタッフが最初から選ばれた状態で予約できます。
          <strong>「リンクをコピー」</strong>を押すと、LINEやメールにそのまま貼り付けられます。
        </p>
      </div>

      {error && (
        <div className="note" role="alert" style={{ background: 'var(--red-weak)', color: 'var(--red)', marginBottom: 16 }}>{error}</div>
      )}

      {loading ? (
        <div className="card"><div className="empty">読み込み中です…</div></div>
      ) : (
        <>
          {/* スタッフ別 */}
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600 }}>スタッフ別の予約リンク</h3>
            <p className="page-help" style={{ marginTop: 0 }}>各スタッフを指名した状態で予約できるURLです。担当のお客様にお渡しください。</p>
            {staffWithSlug.length === 0 ? (
              <div className="empty">予約リンクを持つスタッフがいません。</div>
            ) : (
              staffWithSlug.map((s) => (
                <LinkRow
                  key={s.id}
                  label={s.full_name + (s.id === userId ? '（あなた）' : '')}
                  sub={storeLabelFor(s.id)}
                  url={`${BOOKING_BASE}/${s.booking_slug}`}
                  k={`staff-${s.id}`}
                />
              ))
            )}
          </div>

          {/* メニュー別 */}
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600 }}>メニュー別の予約リンク</h3>
            <p className="page-help" style={{ marginTop: 0 }}>そのメニューだけを選んで予約できるURLです。「整体だけ予約してほしい」お客様に、このリンクを送れます。</p>
            {publicMenus.length === 0 ? (
              <div className="empty">予約リンクを持つメニューがありません。</div>
            ) : (
              publicMenus.map((m) => (
                <LinkRow key={m.id} label={m.name} url={`${BOOKING_BASE}/menu/${m.booking_slug}`} k={`menu-${m.id}`} />
              ))
            )}
          </div>

          {/* スレッズ限定など非公開メニュー */}
          {unlistedMenus.length > 0 && (
            <div className="card card-pad" style={{ marginBottom: 16, border: '1px solid var(--accent)' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600 }}>限定メニューの予約リンク（一般には非公開）</h3>
              <p className="page-help" style={{ marginTop: 0 }}>
                これらのメニューは<strong>通常の予約ページには表示されません</strong>。この専用リンクを受け取った人だけが予約できます（スレッズ限定など）。
              </p>
              {unlistedMenus.map((m) => (
                <LinkRow
                  key={m.id}
                  label={m.name}
                  sub="限定・専用URLのみ"
                  url={`${BOOKING_BASE}/menu/${m.booking_slug}`}
                  k={`umenu-${m.id}`}
                />
              ))}
            </div>
          )}

          {/* 店舗別・全体 */}
          <div className="card card-pad">
            <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600 }}>店舗別・おまかせの予約リンク</h3>
            <p className="page-help" style={{ marginTop: 0 }}>担当を指定しない予約リンクです。店舗のチラシや公式SNSなどにご利用ください。</p>
            <LinkRow label="玉島店" sub="担当おまかせ" url={`${BOOKING_BASE}/${STORE_SLUG.tamashima}`} k="store-tamashima" />
            <LinkRow label="金光店" sub="担当おまかせ" url={`${BOOKING_BASE}/${STORE_SLUG.kanamitsu}`} k="store-kanamitsu" />
            <LinkRow label="どちらの店舗も" sub="店舗もお客様が選択" url={`${BOOKING_BASE}/`} k="store-all" />
          </div>
        </>
      )}
    </div>
  );
}
