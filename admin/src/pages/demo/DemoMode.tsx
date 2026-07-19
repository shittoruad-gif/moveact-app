import { useMemo, useState } from 'react';
import {
  DemoProvider, useDemo, STAFF, MENUS, STORES, STORE_NAMES, OPEN_MIN, CLOSE_MIN,
  minToHHMM, DEMO_DATE_LABEL,
  type StoreId, type DemoBooking, type OffType,
} from './store';

// ─────────────────────────────────────────────────────────────
// 練習モード（デモ）— 管理画面の全機能を練習できる自己完結アプリ
//   実データ（本番DB）には一切アクセスしない。すべてメモリ内で連動する。
// ─────────────────────────────────────────────────────────────

const STEP = 30;
const ROW_PX = 28;
const PX_PER_MIN = ROW_PX / STEP;
const BUFFER = 15;   // 前後の入れ替え時間（分）。本番と同じルールで練習する。

type TabKey =
  | 'board' | 'newBooking' | 'bookings' | 'cancel' | 'lessons'
  | 'off' | 'settings' | 'dashboard' | 'performance' | 'history';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'board', label: '予約表' },
  { key: 'dashboard', label: 'ダッシュボード' },
  { key: 'bookings', label: '予約管理' },
  { key: 'newBooking', label: '手動予約入力' },
  { key: 'cancel', label: '当日キャンセル' },
  { key: 'lessons', label: 'グループレッスン' },
  { key: 'off', label: 'スタッフ休み' },
  { key: 'settings', label: '店舗設定' },
  { key: 'performance', label: 'スタッフ成績' },
  { key: 'history', label: '更新履歴' },
];

const DOW = ['日', '月', '火', '水', '木', '金', '土'];

export function DemoMode() {
  return (
    <DemoProvider>
      <DemoInner />
    </DemoProvider>
  );
}

function DemoInner() {
  const { reset } = useDemo();
  const [tab, setTab] = useState<TabKey>('board');
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2600); };

  const handleReset = () => {
    if (!window.confirm('練習の内容をすべて消して、最初の状態に戻します。よろしいですか？')) return;
    reset();
    flash('最初の状態に戻しました');
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">練習モード（デモ）</h2>
        <p className="page-help">
          本物そっくりの管理画面で、すべての操作を練習できます。ここでの操作は<strong>実際の予約やお客様には一切影響しません</strong>。
          下のタブで各機能に切り替えられます。ある画面で入れた予約は、予約表・予約管理・更新履歴など他の画面にもちゃんと反映されます。
        </p>
      </div>

      {/* 練習モードの帯 */}
      <div className="card card-pad" style={{ background: 'var(--amber-weak, #fff7e6)', border: '1px solid var(--amber, #d99a00)', color: 'var(--amber, #8a6a00)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🎓 これは練習用の画面です</span>
        <span style={{ fontSize: 13 }}>入力・変更・キャンセルはすべて練習で、保存されません。安心して触ってください。</span>
        <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={handleReset}>最初に戻す</button>
      </div>

      {/* 機能タブ */}
      <div className="card card-pad" style={{ marginBottom: 14, overflowX: 'auto' }}>
        <div className="seg" style={{ flexWrap: 'wrap', gap: 6 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`seg-btn${tab === t.key ? ' seg-btn--active' : ''}`}
              onClick={() => setTab(t.key)}
            >{t.label}</button>
          ))}
        </div>
      </div>

      {tab === 'board' && <BoardScreen onFlash={flash} />}
      {tab === 'dashboard' && <DashboardScreen />}
      {tab === 'bookings' && <BookingsScreen onFlash={flash} />}
      {tab === 'newBooking' && <NewBookingScreen onFlash={flash} onDone={() => setTab('board')} />}
      {tab === 'cancel' && <CancelScreen onFlash={flash} />}
      {tab === 'lessons' && <LessonsScreen onFlash={flash} />}
      {tab === 'off' && <OffScreen onFlash={flash} />}
      {tab === 'settings' && <SettingsScreen onFlash={flash} />}
      {tab === 'performance' && <PerformanceScreen />}
      {tab === 'history' && <HistoryScreen />}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: '#fff', padding: '10px 18px', borderRadius: 8, fontSize: 13.5, zIndex: 60, boxShadow: 'var(--shadow)' }}>{toast}</div>
      )}
    </div>
  );
}

// 店舗切替の共通セグメント
function StoreSeg({ value, onChange }: { value: StoreId; onChange: (s: StoreId) => void }) {
  return (
    <div className="seg" style={{ marginBottom: 14 }}>
      {STORES.map((s) => (
        <button key={s} type="button" className={`seg-btn${value === s ? ' seg-btn--active' : ''}`} onClick={() => onChange(s)}>{STORE_NAMES[s]}</button>
      ))}
    </div>
  );
}

const STAFF_COL_W = 148;
const TIME_COL_W = 50;

// ─────────────────────────────────────────────────────────────
// 予約表
// ─────────────────────────────────────────────────────────────
function BoardScreen({ onFlash }: { onFlash: (m: string) => void }) {
  const { state, addBooking, updateBooking, setBookingStatus, removeOff } = useDemo();
  const [store, setStore] = useState<StoreId>('kanamitsu');
  const [adding, setAdding] = useState<{ staffId: string; startMin: number } | null>(null);
  const [editing, setEditing] = useState<DemoBooking | null>(null);

  const staff = STAFF.filter((s) => s.store === store);
  const rows = useMemo(() => { const o: number[] = []; for (let m = OPEN_MIN; m < CLOSE_MIN; m += STEP) o.push(m); return o; }, []);
  const hourMarks = useMemo(() => { const o: number[] = []; for (let m = OPEN_MIN; m <= CLOSE_MIN; m += 60) o.push(m); return o; }, []);
  const bodyH = ((CLOSE_MIN - OPEN_MIN) / STEP) * ROW_PX;

  const active = state.bookings.filter((b) => b.store === store && b.status !== 'cancelled');
  const offs = state.offs.filter((o) => o.store === store);
  // 店舗キャパ=1＋前後の入れ替え時間15分: 店舗内に別の予約があり、±15分の枠が
  // 重なる時間帯は担当を問わず不可（本番と同じルール）。第1引数staffIdは互換のため残す。
  const overlaps = (_staffId: string, start: number, mins: number, ignore?: string) =>
    active.some((b) => b.id !== ignore &&
      start - BUFFER < b.startMin + b.minutes + BUFFER &&
      start + mins + BUFFER > b.startMin - BUFFER);

  return (
    <>
      <StoreSeg value={store} onChange={setStore} />
      <p className="page-help" style={{ marginTop: -6, marginBottom: 12 }}>{DEMO_DATE_LABEL}・空き枠クリックで予約、予約クリックで変更・キャンセル。斜線は休み/予定（クリックで削除）。</p>
      <div className="card" style={{ overflow: 'auto', maxWidth: '100%' }}>
        <div style={{ display: 'inline-block', minWidth: '100%' }}>
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3 }}>
            <div style={{ width: TIME_COL_W, flexShrink: 0, height: 32, background: 'var(--surface)', borderBottom: '1px solid var(--line)', borderRight: '1px solid var(--line)', position: 'sticky', left: 0, zIndex: 4, boxSizing: 'border-box' }} />
            {staff.map((s) => (
              <div key={s.id} style={{ width: STAFF_COL_W, flexShrink: 0, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600, background: 'var(--surface)', borderBottom: '1px solid var(--line)', borderRight: '1px solid var(--line)', boxSizing: 'border-box' }}>{s.name}</div>
            ))}
          </div>
          <div style={{ display: 'flex', position: 'relative' }}>
            <div style={{ width: TIME_COL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface)', borderRight: '1px solid var(--line)', height: bodyH, boxSizing: 'border-box' }}>
              {hourMarks.map((m) => (
                <div key={m} style={{ position: 'absolute', top: (m - OPEN_MIN) * PX_PER_MIN, left: 0, right: 0, fontSize: 11, color: 'var(--sub)', textAlign: 'right', paddingRight: 5, transform: 'translateY(-1px)', fontVariantNumeric: 'tabular-nums' }}>{minToHHMM(m)}</div>
              ))}
            </div>
            {staff.map((s) => (
              <div key={s.id} style={{ width: STAFF_COL_W, flexShrink: 0, position: 'relative', height: bodyH, borderRight: '1px solid var(--line)', background: 'var(--surface)', boxSizing: 'border-box' }}>
                {rows.map((m) => (
                  <div key={m} onClick={() => setAdding({ staffId: s.id, startMin: m })} title={`${minToHHMM(m)} クリックで予約`}
                    style={{ position: 'absolute', top: (m - OPEN_MIN) * PX_PER_MIN, left: 0, right: 0, height: ROW_PX, boxSizing: 'border-box', borderTop: m % 60 === 0 ? '1px solid var(--line)' : '1px solid var(--bg)', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-weak)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }} />
                ))}
                {offs.filter((o) => o.staffId === s.id).map((o) => (
                  <div key={o.id} onClick={(e) => { e.stopPropagation(); if (window.confirm('この休み/予定を削除しますか？（練習）')) { removeOff(o.id); onFlash('休み/予定を削除しました（練習）'); } }}
                    title={`${minToHHMM(o.startMin)}〜${minToHHMM(o.endMin)} ${o.type === 'off' ? '休み' : '予定'}（クリックで削除）`}
                    style={{ position: 'absolute', top: (o.startMin - OPEN_MIN) * PX_PER_MIN, left: 2, right: 2, height: (o.endMin - o.startMin) * PX_PER_MIN - 2, borderRadius: 4, border: '1px solid var(--line)', backgroundColor: 'var(--bg)', backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.05) 0, rgba(0,0,0,0.05) 4px, transparent 4px, transparent 8px)', fontSize: 10, color: 'var(--sub)', fontWeight: 600, padding: '2px 5px', cursor: 'pointer', zIndex: 1 }}>
                    {o.type === 'off' ? '休み' : (o.reason || '予定')}
                  </div>
                ))}
                {active.filter((b) => b.staffId === s.id).map((b) => {
                  const top = (b.startMin - OPEN_MIN) * PX_PER_MIN;
                  const h = Math.max(ROW_PX, b.minutes * PX_PER_MIN) - 2;
                  const color = b.status === 'completed' ? 'var(--sub)' : b.status === 'no_show' ? 'var(--red)' : b.isFirstVisit ? 'var(--accent)' : 'var(--green)';
                  return (
                    <div key={b.id} onClick={(e) => { e.stopPropagation(); setEditing(b); }}
                      title={`${minToHHMM(b.startMin)} ${b.guestName}（クリックで変更）`}
                      style={{ position: 'absolute', top, left: 2, right: 2, height: h, background: 'var(--surface)', border: '1px solid var(--line)', borderLeft: `3px solid ${color}`, borderRadius: 4, boxSizing: 'border-box', padding: '2px 6px', overflow: 'hidden', cursor: 'pointer', boxShadow: 'var(--shadow)', zIndex: 2, lineHeight: 1.3 }}>
                      <div style={{ fontSize: 10.5, color: 'var(--sub)', fontVariantNumeric: 'tabular-nums' }}>
                        {minToHHMM(b.startMin)}{b.isFirstVisit && <span style={{ color: 'var(--accent)', marginLeft: 4, fontWeight: 600 }}>初回</span>}{b.status === 'completed' && <span style={{ marginLeft: 4 }}>完了</span>}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.guestName}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {adding && (
        <AddBookingModal store={store} ctx={adding} hasOverlap={(sid, st, mn) => overlaps(sid, st, mn)}
          onClose={() => setAdding(null)}
          onAdd={(b) => { addBooking(b); setAdding(null); onFlash(`${b.guestName}さんの予約を入れました（練習）`); }} />
      )}
      {editing && (
        <EditBookingModal b={editing} hasOverlap={(st, mn) => overlaps(editing.staffId, st, mn, editing.id)}
          onClose={() => setEditing(null)}
          onSave={(patch) => { updateBooking(editing.id, patch); setEditing(null); onFlash('予約を変更しました（練習）'); }}
          onStatus={(st) => { setBookingStatus(editing.id, st); setEditing(null); onFlash(st === 'completed' ? '来店完了にしました（練習）' : st === 'no_show' ? '無断キャンセルにしました（練習）' : 'キャンセルしました（練習）'); }} />
      )}
    </>
  );
}

function AddBookingModal({ store, ctx, hasOverlap, onClose, onAdd }: {
  store: StoreId; ctx: { staffId: string; startMin: number };
  hasOverlap: (staffId: string, startMin: number, minutes: number) => boolean;
  onClose: () => void; onAdd: (b: Omit<DemoBooking, 'id' | 'status'>) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [menuId, setMenuId] = useState(MENUS[0].id);
  const [staffId, setStaffId] = useState(ctx.staffId);
  const [first, setFirst] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menu = MENUS.find((m) => m.id === menuId)!;

  const submit = () => {
    if (!name.trim()) { setError('お名前を入力してください（練習なので何でもOK）'); return; }
    if (ctx.startMin + menu.minutes > CLOSE_MIN) { setError('終了が営業時間（21:00）を超えます。'); return; }
    if (hasOverlap(staffId, ctx.startMin, menu.minutes)) { setError('この時間帯は店舗に別の予約があります（前後の入れ替え時間15分を含む）。同じ時間に受けられるのは店舗で1件までです。'); return; }
    onAdd({ store, staffId, startMin: ctx.startMin, minutes: menu.minutes, guestName: name.trim(), guestPhone: phone.trim(), menuId, price: menu.price, isFirstVisit: first });
  };

  return (
    <ModalShell title="予約を入れる（練習）" onClose={onClose} footer={<>
      <button type="button" className="btn btn-secondary" onClick={onClose}>閉じる</button>
      <button type="button" className="btn btn-primary" onClick={submit}>この内容で入れる</button>
    </>}>
      <div className="note" style={{ marginBottom: 14 }}>{STORE_NAMES[store]} / {minToHHMM(ctx.startMin)}〜</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field"><label className="field-label">お名前</label><input className="input" placeholder="例）山田 花子" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div className="field"><label className="field-label">電話（任意）</label><input className="input" placeholder="090-…" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="field"><label className="field-label">メニュー</label>
          <select className="select" value={menuId} onChange={(e) => setMenuId(e.target.value)}>{MENUS.map((m) => <option key={m.id} value={m.id}>{m.name}（{m.minutes}分）</option>)}</select>
        </div>
        <div className="field"><label className="field-label">担当</label>
          <select className="select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>{STAFF.filter((s) => s.store === store).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </div>
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} /> 初回のお客様
      </label>
      <div className="note" style={{ marginTop: 10 }}>終了予定: <strong>{minToHHMM(ctx.startMin + menu.minutes)}</strong>（{menu.minutes}分）</div>
      {error && <ErrBox msg={error} />}
    </ModalShell>
  );
}

function EditBookingModal({ b, hasOverlap, onClose, onSave, onStatus }: {
  b: DemoBooking; hasOverlap: (startMin: number, minutes: number) => boolean;
  onClose: () => void; onSave: (patch: Partial<DemoBooking>) => void; onStatus: (s: DemoBooking['status']) => void;
}) {
  const [startMin, setStartMin] = useState(b.startMin);
  const [minutes, setMinutes] = useState(b.minutes);
  const [error, setError] = useState<string | null>(null);
  const times = useMemo(() => { const o: number[] = []; for (let m = OPEN_MIN; m < CLOSE_MIN; m += STEP) o.push(m); return o; }, []);
  const save = () => {
    if (startMin + minutes > CLOSE_MIN) { setError('終了が営業時間（21:00）を超えます。'); return; }
    if (hasOverlap(startMin, minutes)) { setError('この時間帯は店舗に別の予約があります（前後の入れ替え時間15分を含む）。'); return; }
    onSave({ startMin, minutes });
  };
  return (
    <ModalShell title="予約の変更（練習）" onClose={onClose} footer={<>
      <button type="button" className="btn btn-secondary" onClick={onClose}>閉じる</button>
      <button type="button" className="btn btn-primary" onClick={save}>変更を保存する</button>
    </>}>
      <div className="note" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{b.guestName} 様</div>
        <div style={{ color: 'var(--sub)' }}>{MENUS.find((m) => m.id === b.menuId)?.name} / 電話 {b.guestPhone || '（未登録）'}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field"><label className="field-label">開始時刻</label>
          <select className="select" value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>{times.map((m) => <option key={m} value={m}>{minToHHMM(m)}</option>)}</select></div>
        <div className="field"><label className="field-label">所要時間</label>
          <select className="select" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>{[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m}分</option>)}</select></div>
      </div>
      <div className="note" style={{ marginTop: 12 }}>終了予定: <strong>{minToHHMM(startMin + minutes)}</strong></div>
      {error && <ErrBox msg={error} />}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-sm" onClick={() => onStatus('completed')}>来店完了にする</button>
        <button type="button" className="btn btn-sm" onClick={() => onStatus('no_show')}>無断キャンセルにする</button>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => onStatus('cancelled')}>キャンセルする</button>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────
// 手動予約入力
// ─────────────────────────────────────────────────────────────
function NewBookingScreen({ onFlash, onDone }: { onFlash: (m: string) => void; onDone: () => void }) {
  const { state, addBooking } = useDemo();
  const [store, setStore] = useState<StoreId>('kanamitsu');
  const [staffId, setStaffId] = useState(STAFF.find((s) => s.store === 'kanamitsu')!.id);
  const [menuId, setMenuId] = useState(MENUS[0].id);
  const [startMin, setStartMin] = useState(15 * 60);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [first, setFirst] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menu = MENUS.find((m) => m.id === menuId)!;
  const staff = STAFF.filter((s) => s.store === store);
  const times = useMemo(() => { const o: number[] = []; for (let m = OPEN_MIN; m < CLOSE_MIN; m += STEP) o.push(m); return o; }, []);
  const dayBookings = state.bookings.filter((b) => b.store === store && b.staffId === staffId && b.status !== 'cancelled').sort((a, b) => a.startMin - b.startMin);
  // 店舗キャパ=1＋入れ替え15分（本番と同じ）: 店舗内の別予約と±15分が重なる時間帯は不可
  const storeBookings = state.bookings.filter((b) => b.store === store && b.status !== 'cancelled');

  const submit = () => {
    if (!name.trim()) { setError('お名前を入力してください'); return; }
    if (startMin + menu.minutes > CLOSE_MIN) { setError('終了が営業時間（21:00）を超えます。'); return; }
    if (storeBookings.some((b) => startMin - BUFFER < b.startMin + b.minutes + BUFFER && startMin + menu.minutes + BUFFER > b.startMin - BUFFER)) {
      setError('この時間帯は店舗に別の予約があります（前後の入れ替え時間15分を含む）。同じ時間に受けられるのは店舗で1件までです。'); return;
    }
    addBooking({ store, staffId, startMin, minutes: menu.minutes, guestName: name.trim(), guestPhone: phone.trim(), menuId, price: menu.price, isFirstVisit: first });
    onFlash(`${name.trim()}さんの予約を登録しました（練習）`);
    setName(''); setPhone(''); setFirst(false);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
      <div className="card card-pad">
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>手動予約入力（練習）</h3>
        <StoreSeg value={store} onChange={(s) => { setStore(s); setStaffId(STAFF.find((x) => x.store === s)!.id); }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label className="field-label">開始時刻</label>
            <select className="select" value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>{times.map((m) => <option key={m} value={m}>{minToHHMM(m)}</option>)}</select></div>
          <div className="field"><label className="field-label">担当</label>
            <select className="select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label">メニュー</label>
            <select className="select" value={menuId} onChange={(e) => setMenuId(e.target.value)}>{MENUS.map((m) => <option key={m.id} value={m.id}>{m.name}（{m.minutes}分 / ¥{m.price.toLocaleString()}）</option>)}</select></div>
          <div className="field"><label className="field-label">お名前</label><input className="input" placeholder="例）山田 花子" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label className="field-label">電話（任意）</label><input className="input" placeholder="090-…" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={first} onChange={(e) => setFirst(e.target.checked)} /> 初回のお客様
        </label>
        <div className="note" style={{ margin: '12px 0' }}>終了予定: <strong>{minToHHMM(startMin + menu.minutes)}</strong></div>
        {error && <ErrBox msg={error} />}
        <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={submit}>この内容で登録する</button>
        <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%', marginTop: 8 }} onClick={onDone}>予約表で確認する →</button>
      </div>
      <div className="card card-pad">
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>この担当の予約状況（{DEMO_DATE_LABEL}）</h3>
        {dayBookings.length === 0 ? <div className="empty">まだ予約はありません。</div> : (
          <div>{dayBookings.map((b) => (
            <div key={b.id} style={{ display: 'flex', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{minToHHMM(b.startMin)}–{minToHHMM(b.startMin + b.minutes)}</span>
              <span>{b.guestName}</span>
              <span style={{ color: 'var(--sub)' }}>{MENUS.find((m) => m.id === b.menuId)?.name}</span>
            </div>
          ))}</div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 予約管理（一覧・来店完了/無断/キャンセル）
// ─────────────────────────────────────────────────────────────
function BookingsScreen({ onFlash }: { onFlash: (m: string) => void }) {
  const { state, setBookingStatus } = useDemo();
  const [store, setStore] = useState<StoreId | 'all'>('all');
  const list = state.bookings
    .filter((b) => store === 'all' || b.store === store)
    .sort((a, b) => a.startMin - b.startMin);
  const badge = (b: DemoBooking) =>
    b.status === 'completed' ? <span className="badge badge-gray">来店完了</span>
      : b.status === 'no_show' ? <span className="badge badge-red">無断</span>
        : b.status === 'cancelled' ? <span className="badge badge-gray">キャンセル</span>
          : <span className="badge badge-green">確定</span>;
  return (
    <>
      <div className="seg" style={{ marginBottom: 14 }}>
        {(['all', 'tamashima', 'kanamitsu'] as const).map((s) => (
          <button key={s} type="button" className={`seg-btn${store === s ? ' seg-btn--active' : ''}`} onClick={() => setStore(s)}>{s === 'all' ? '全店' : STORE_NAMES[s]}</button>
        ))}
      </div>
      <div className="card card-pad">
        <p className="page-help" style={{ marginTop: 0 }}>{DEMO_DATE_LABEL}の予約一覧です。各予約で「来店完了」「無断」「キャンセル」を記録する練習ができます。</p>
        {list.length === 0 ? <div className="empty">予約はありません。</div> : list.map((b) => (
          <div key={b.id} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--line)', opacity: b.status === 'cancelled' ? 0.55 : 1 }}>
            <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 92 }}>{minToHHMM(b.startMin)}–{minToHHMM(b.startMin + b.minutes)}</span>
            <span style={{ fontWeight: 600 }}>{b.guestName}</span>
            {b.isFirstVisit && <span className="badge" style={{ background: 'var(--accent-weak)', color: 'var(--accent)' }}>初回</span>}
            <span style={{ fontSize: 12.5, color: 'var(--sub)' }}>{MENUS.find((m) => m.id === b.menuId)?.name} / {STORE_NAMES[b.store]}</span>
            {badge(b)}
            {b.status === 'confirmed' && (
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn btn-sm" onClick={() => { setBookingStatus(b.id, 'completed'); onFlash('来店完了にしました（練習）'); }}>来店完了</button>
                <button className="btn btn-sm" onClick={() => { setBookingStatus(b.id, 'no_show'); onFlash('無断キャンセルにしました（練習）'); }}>無断</button>
                <button className="btn btn-sm btn-danger" onClick={() => { setBookingStatus(b.id, 'cancelled'); onFlash('キャンセルしました（練習）'); }}>キャンセル</button>
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 当日キャンセル（回数券/請求/免除の練習）
// ─────────────────────────────────────────────────────────────
function CancelScreen({ onFlash }: { onFlash: (m: string) => void }) {
  const { state, setBookingStatus } = useDemo();
  const targets = state.bookings.filter((b) => b.status === 'confirmed');
  const doCancel = (id: string, kind: string) => {
    if (!window.confirm(`「${kind}」で当日キャンセルを処理します（練習）。よろしいですか？`)) return;
    setBookingStatus(id, 'cancelled');
    onFlash(`${kind}で当日キャンセルしました（練習）`);
  };
  return (
    <div className="card card-pad">
      <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600 }}>当日キャンセル管理（練習）</h3>
      <p className="page-help" style={{ marginTop: 0 }}>当日のキャンセルを、回数券消化・料金請求・免除のいずれかで記録する練習ができます。</p>
      {targets.length === 0 ? <div className="empty">対象の予約がありません。予約表や手動予約入力で予約を増やしてから試せます。</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>時間</th><th>お客様</th><th>メニュー</th><th>店舗</th><th>処理</th></tr></thead>
            <tbody>
              {targets.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{minToHHMM(b.startMin)}</td>
                  <td style={{ fontWeight: 600 }}>{b.guestName}</td>
                  <td>{MENUS.find((m) => m.id === b.menuId)?.name}</td>
                  <td>{STORE_NAMES[b.store]}</td>
                  <td>
                    <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button className="btn btn-sm" onClick={() => doCancel(b.id, '回数券消化')}>回数券消化</button>
                      <button className="btn btn-sm" onClick={() => doCancel(b.id, '料金請求')}>料金請求</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => doCancel(b.id, '免除')}>免除</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// グループレッスン
// ─────────────────────────────────────────────────────────────
function LessonsScreen({ onFlash }: { onFlash: (m: string) => void }) {
  const { state, addLesson, cancelLesson } = useDemo();
  const [store, setStore] = useState<StoreId>('tamashima');
  const [title, setTitle] = useState('ピラティス');
  const [instructor, setInstructor] = useState('YUNA');
  const [startMin, setStartMin] = useState(18 * 60);
  const [minutes] = useState(45);
  const [capacity, setCapacity] = useState(4);
  const [price, setPrice] = useState(3000);
  const times = useMemo(() => { const o: number[] = []; for (let m = OPEN_MIN; m < CLOSE_MIN; m += STEP) o.push(m); return o; }, []);
  const list = state.lessons.filter((l) => l.store === store);
  const add = () => {
    if (!title.trim()) { onFlash('レッスン名を入力してください'); return; }
    addLesson({ store, title: title.trim(), instructor: instructor.trim(), startMin, minutes, capacity, price });
    onFlash('レッスンを追加しました（練習）');
  };
  return (
    <>
      <StoreSeg value={store} onChange={setStore} />
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600 }}>レッスンを追加（練習）</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div className="field"><label className="field-label">レッスン名</label><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="field"><label className="field-label">講師</label><input className="input" value={instructor} onChange={(e) => setInstructor(e.target.value)} /></div>
          <div className="field"><label className="field-label">開始</label><select className="select" value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>{times.map((m) => <option key={m} value={m}>{minToHHMM(m)}</option>)}</select></div>
          <div className="field"><label className="field-label">定員（最大4名）</label><select className="select" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}名</option>)}</select></div>
          <div className="field"><label className="field-label">料金</label><input className="input" type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} /></div>
        </div>
        <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={add}>レッスンを追加する</button>
      </div>
      <div className="card card-pad">
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>登録済みレッスン</h3>
        {list.length === 0 ? <div className="empty">レッスンはありません。</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>時間</th><th>レッスン</th><th>講師</th><th>予約/定員</th><th>料金</th><th>状態</th><th></th></tr></thead>
              <tbody>{list.map((l) => (
                <tr key={l.id} style={{ opacity: l.cancelled ? 0.55 : 1 }}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{minToHHMM(l.startMin)}</td>
                  <td style={{ fontWeight: 600 }}>{l.title}</td>
                  <td>{l.instructor}</td>
                  <td>{l.booked}/{l.capacity}</td>
                  <td>¥{l.price.toLocaleString()}</td>
                  <td>{l.cancelled ? <span className="badge badge-gray">中止</span> : <span className="badge badge-green">開催予定</span>}</td>
                  <td>{!l.cancelled && <button className="btn btn-sm btn-danger" onClick={() => { if (window.confirm('このレッスンをキャンセルしますか？（練習）')) { cancelLesson(l.id); onFlash('レッスンをキャンセルしました（練習）'); } }}>キャンセル</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// スタッフ休み
// ─────────────────────────────────────────────────────────────
function OffScreen({ onFlash }: { onFlash: (m: string) => void }) {
  const { state, addOff, removeOff } = useDemo();
  const [store, setStore] = useState<StoreId>('kanamitsu');
  const [staffId, setStaffId] = useState(STAFF.find((s) => s.store === 'kanamitsu')!.id);
  const [type, setType] = useState<OffType>('off');
  const [startMin, setStartMin] = useState(9 * 60);
  const [endMin, setEndMin] = useState(21 * 60);
  const [reason, setReason] = useState('');
  const times = useMemo(() => { const o: number[] = []; for (let m = OPEN_MIN; m <= CLOSE_MIN; m += STEP) o.push(m); return o; }, []);
  const staff = STAFF.filter((s) => s.store === store);
  const list = state.offs.filter((o) => o.store === store);
  const add = () => {
    if (endMin <= startMin) { onFlash('終了は開始より後にしてください'); return; }
    addOff({ store, staffId, type, startMin, endMin, reason: reason.trim() });
    onFlash(`${type === 'off' ? '休み' : '予定'}を登録しました（練習）`);
    setReason('');
  };
  return (
    <>
      <StoreSeg value={store} onChange={(s) => { setStore(s); setStaffId(STAFF.find((x) => x.store === s)!.id); }} />
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600 }}>休み・予定の登録（練習）</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div className="field"><label className="field-label">スタッフ</label><select className="select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="field"><label className="field-label">種別</label><select className="select" value={type} onChange={(e) => setType(e.target.value as OffType)}><option value="off">休み</option><option value="busy">外出・予定</option></select></div>
          <div className="field"><label className="field-label">開始</label><select className="select" value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>{times.map((m) => <option key={m} value={m}>{minToHHMM(m)}</option>)}</select></div>
          <div className="field"><label className="field-label">終了</label><select className="select" value={endMin} onChange={(e) => setEndMin(Number(e.target.value))}>{times.map((m) => <option key={m} value={m}>{minToHHMM(m)}</option>)}</select></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label className="field-label">理由・メモ</label><input className="input" placeholder="例）有休 / 通院" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
        <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={add}>登録する</button>
      </div>
      <div className="card card-pad">
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>登録済みの休み・予定</h3>
        {list.length === 0 ? <div className="empty">登録はありません。</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>スタッフ</th><th>時間</th><th>種別</th><th>理由</th><th></th></tr></thead>
              <tbody>{list.map((o) => (
                <tr key={o.id}>
                  <td>{STAFF.find((s) => s.id === o.staffId)?.name}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{minToHHMM(o.startMin)}〜{minToHHMM(o.endMin)}</td>
                  <td><span className={`badge ${o.type === 'busy' ? 'badge-amber' : 'badge-gray'}`}>{o.type === 'off' ? '休み' : '外出・予定'}</span></td>
                  <td>{o.reason || '-'}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => { removeOff(o.id); onFlash('削除しました（練習）'); }}>削除</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 店舗設定（営業時間）
// ─────────────────────────────────────────────────────────────
function SettingsScreen({ onFlash }: { onFlash: (m: string) => void }) {
  const { state, setHours } = useDemo();
  const [store, setStore] = useState<StoreId>('kanamitsu');
  const rows = state.hours[store];
  const timeOpts = useMemo(() => { const o: string[] = []; for (let m = 6 * 60; m <= 23 * 60; m += 30) o.push(minToHHMM(m)); return o; }, []);
  return (
    <>
      <StoreSeg value={store} onChange={setStore} />
      <div className="card card-pad">
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600 }}>営業時間（{STORE_NAMES[store]}・練習）</h3>
        <p className="page-help" style={{ marginTop: 0 }}>曜日ごとの営業時間・定休日を設定する練習ができます。実際の受付時間は変わりません。</p>
        <div style={{ overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>曜日</th><th>定休日</th><th>開店</th><th>閉店</th></tr></thead>
            <tbody>{rows.map((h, dow) => (
              <tr key={dow}>
                <td style={{ fontWeight: 600 }}>{DOW[dow]}曜</td>
                <td><label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={h.closed} onChange={(e) => setHours(store, dow, { closed: e.target.checked })} /> {h.closed ? '定休日' : '営業'}
                </label></td>
                <td><select className="select" style={{ width: 110 }} value={h.open} disabled={h.closed} onChange={(e) => setHours(store, dow, { open: e.target.value })}>{timeOpts.map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
                <td><select className="select" style={{ width: 110 }} value={h.close} disabled={h.closed} onChange={(e) => setHours(store, dow, { close: e.target.value })}>{timeOpts.map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <button type="button" className="btn btn-primary" style={{ marginTop: 14 }} onClick={() => onFlash('営業時間を保存しました（練習）')}>営業時間を保存する</button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// ダッシュボード（練習データから集計）
// ─────────────────────────────────────────────────────────────
function DashboardScreen() {
  const { state } = useDemo();
  const b = state.bookings;
  const todayCount = b.filter((x) => x.status !== 'cancelled').length;
  const completed = b.filter((x) => x.status === 'completed').length;
  const revenue = b.filter((x) => x.status === 'completed').reduce((n, x) => n + x.price, 0);
  const byStore = (s: StoreId) => b.filter((x) => x.store === s && x.status !== 'cancelled').length;
  const cards = [
    { label: '本日の予約', value: `${todayCount}件`, sub: `玉島 ${byStore('tamashima')} / 金光 ${byStore('kanamitsu')}` },
    { label: '来店完了', value: `${completed}件`, sub: '' },
    { label: '売上見込み', value: `¥${revenue.toLocaleString()}`, sub: '来店完了分' },
    { label: 'グループレッスン', value: `${state.lessons.filter((l) => !l.cancelled).length}件`, sub: '' },
  ];
  const max = Math.max(1, todayCount);
  return (
    <div className="card card-pad">
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>ダッシュボード（練習）</h3>
      <p className="page-help" style={{ marginTop: 0 }}>練習で入れた予約が、そのまま数値に反映されます。予約を増やして数字が変わるのを確認できます。</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
        {cards.map((c) => (
          <div key={c.label} className="card card-pad" style={{ background: 'var(--surface)' }}>
            <div style={{ fontSize: 12, color: 'var(--sub)' }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, margin: '2px 0' }}>{c.value}</div>
            <div style={{ fontSize: 11.5, color: 'var(--sub)' }}>{c.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>店舗別の予約数</div>
      {STORES.map((s) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ width: 54, fontSize: 12.5, color: 'var(--sub)' }}>{STORE_NAMES[s]}</span>
          <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
            <div style={{ width: `${(byStore(s) / max) * 100}%`, height: '100%', background: s === 'tamashima' ? '#2D6FB5' : '#A6293F' }} />
          </div>
          <span style={{ width: 32, textAlign: 'right', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{byStore(s)}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// スタッフ成績（練習データから集計）
// ─────────────────────────────────────────────────────────────
function PerformanceScreen() {
  const { state } = useDemo();
  const rows = STAFF.map((s) => {
    const mine = state.bookings.filter((b) => b.staffId === s.id);
    const done = mine.filter((b) => b.status === 'completed');
    return { name: s.name, store: s.store, total: mine.filter((b) => b.status !== 'cancelled').length, done: done.length, sales: done.reduce((n, b) => n + b.price, 0) };
  });
  return (
    <div className="card card-pad">
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>スタッフ成績（練習）</h3>
      <p className="page-help" style={{ marginTop: 0 }}>担当ごとの予約数・来店完了数・売上（来店完了分）です。練習で予約を「来店完了」にすると売上が増えます。</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>スタッフ</th><th>店舗</th><th>予約数</th><th>来店完了</th><th>売上</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.name}>
              <td style={{ fontWeight: 600 }}>{r.name}</td>
              <td>{STORE_NAMES[r.store]}</td>
              <td>{r.total}件</td>
              <td>{r.done}件</td>
              <td>¥{r.sales.toLocaleString()}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 更新履歴（練習中の操作ログ）
// ─────────────────────────────────────────────────────────────
function HistoryScreen() {
  const { state } = useDemo();
  return (
    <div className="card card-pad">
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600 }}>更新履歴（練習）</h3>
      <p className="page-help" style={{ marginTop: 0 }}>あなたが練習でした操作が、誰がいつ何をしたかの記録として残ります。実際の更新履歴と同じ見え方です。</p>
      <div>
        {state.history.map((h) => (
          <div key={h.id} style={{ padding: '10px 2px', borderBottom: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 12.5, color: 'var(--sub)', fontVariantNumeric: 'tabular-nums' }}>{h.atLabel}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{h.actor}</span>
              <span style={{ fontSize: 12, color: 'var(--sub)' }}>{h.entity}</span>
              <span className={`badge ${h.action === '削除' ? 'badge-red' : h.action === '変更' ? 'badge-amber' : 'badge-green'}`}>{h.action}</span>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.7 }}>{h.summary}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 共通の小物
// ─────────────────────────────────────────────────────────────
function ModalShell({ title, onClose, footer, children }: { title: string; onClose: () => void; footer: ReactNodeLike; children: ReactNodeLike }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(460px, 100%)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head" style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
          <button type="button" onClick={onClose} aria-label="閉じる" style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: 'var(--sub)' }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>{children}</div>
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>{footer}</div>
      </div>
    </div>
  );
}

function ErrBox({ msg }: { msg: string }) {
  return <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--red-weak)', color: 'var(--red)', borderRadius: 8, fontSize: 13 }}>{msg}</div>;
}

type ReactNodeLike = React.ReactNode;
