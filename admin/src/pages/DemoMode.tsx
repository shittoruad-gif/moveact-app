import { useMemo, useState } from 'react';

// ─────────────────────────────────────────────────────────────
// 練習モード（デモ）
//   実際の予約表そっくりの盤面で、予約の追加・時間変更・キャンセルを練習できる。
//   すべてブラウザ内のメモリだけで動き、本番のデータベースには一切書き込まない。
//   「最初に戻す」でいつでもまっさらな練習状態に戻せる。
// ─────────────────────────────────────────────────────────────

const OPEN_MIN = 9 * 60;    // 9:00
const CLOSE_MIN = 21 * 60;  // 21:00
const STEP = 30;            // 30分刻み
const ROW_PX = 30;          // 1コマ30px
const PX_PER_MIN = ROW_PX / STEP;
const TIME_COL_W = 52;
const STAFF_COL_W = 150;

interface DemoStaff { id: string; name: string; }
interface DemoMenu { id: string; name: string; minutes: number; }
interface DemoBooking {
  id: string;
  staffId: string;
  startMin: number;
  minutes: number;
  guestName: string;
  menuName: string;
  status: 'confirmed' | 'completed' | 'cancelled';
}

const STAFF: DemoStaff[] = [
  { id: 's1', name: '三上（練習）' },
  { id: 's2', name: '久一（練習）' },
  { id: 's3', name: '石井（練習）' },
];
const MENUS: DemoMenu[] = [
  { id: 'm1', name: '整体', minutes: 45 },
  { id: 'm2', name: '美容鍼', minutes: 45 },
  { id: 'm3', name: 'ピラティス', minutes: 45 },
  { id: 'm4', name: '足つぼ', minutes: 30 },
];

function minToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function seed(): DemoBooking[] {
  return [
    { id: 'seed1', staffId: 's1', startMin: 10 * 60, minutes: 45, guestName: '山田 花子', menuName: '整体', status: 'confirmed' },
    { id: 'seed2', staffId: 's3', startMin: 11 * 60 + 30, minutes: 45, guestName: '佐藤 美咲', menuName: '美容鍼', status: 'confirmed' },
    { id: 'seed3', staffId: 's2', startMin: 14 * 60, minutes: 30, guestName: '鈴木 一郎', menuName: '足つぼ', status: 'completed' },
  ];
}

let uidCounter = 0;
const nextId = () => `demo-${++uidCounter}`;

export function DemoMode() {
  const [bookings, setBookings] = useState<DemoBooking[]>(seed);
  const [toast, setToast] = useState<string | null>(null);
  // 空き枠クリックで開く新規登録モーダル
  const [adding, setAdding] = useState<{ staffId: string; startMin: number } | null>(null);
  // 予約クリックで開く変更モーダル
  const [editing, setEditing] = useState<DemoBooking | null>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  };

  const rows = useMemo(() => {
    const out: number[] = [];
    for (let m = OPEN_MIN; m < CLOSE_MIN; m += STEP) out.push(m);
    return out;
  }, []);
  const bodyHeight = ((CLOSE_MIN - OPEN_MIN) / STEP) * ROW_PX;
  const hourMarks = useMemo(() => {
    const out: number[] = [];
    for (let m = OPEN_MIN; m <= CLOSE_MIN; m += 60) out.push(m);
    return out;
  }, []);

  const active = bookings.filter((b) => b.status !== 'cancelled');

  const overlaps = (staffId: string, startMin: number, minutes: number, ignoreId?: string) =>
    active.some((b) =>
      b.id !== ignoreId && b.staffId === staffId &&
      startMin < b.startMin + b.minutes && startMin + minutes > b.startMin,
    );

  const handleReset = () => {
    if (!window.confirm('練習の内容をすべて消して、最初の状態に戻します。よろしいですか？')) return;
    uidCounter = 0;
    setBookings(seed());
    flash('最初の状態に戻しました');
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">練習モード（デモ）</h2>
        <p className="page-help">
          本物そっくりの予約表で操作を練習できます。ここでの操作は<strong>実際の予約やお客様には一切影響しません</strong>。
          空き枠をクリックして予約を入れる／予約をクリックして時間変更・キャンセル、を自由に試してください。
        </p>
      </div>

      {/* 練習モードの目立つ帯 */}
      <div
        className="card card-pad"
        style={{
          background: 'var(--amber-weak, #fff7e6)', border: '1px solid var(--amber, #d99a00)',
          color: 'var(--amber, #8a6a00)', marginBottom: 14, display: 'flex',
          alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14 }}>🎓 これは練習用の画面です</span>
        <span style={{ fontSize: 13 }}>入力・変更・キャンセルはすべて練習で、保存されません。安心して触ってください。</span>
        <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={handleReset}>
          最初に戻す
        </button>
      </div>

      {/* 手順ガイド */}
      <div className="card card-pad" style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[
            { n: '1', t: '予約を入れる', d: '空いているマスをクリック → お名前・メニュー・担当を選んで登録' },
            { n: '2', t: '時間を変える', d: '入っている予約をクリック → 開始時刻や所要時間を変更して保存' },
            { n: '3', t: 'キャンセルする', d: '予約をクリック →「キャンセルする」。枠がまた空きます' },
          ].map((s) => (
            <div key={s.n} style={{ display: 'flex', gap: 10 }}>
              <div style={{
                flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700,
              }}>{s.n}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.t}</div>
                <div style={{ fontSize: 12.5, color: 'var(--sub)', lineHeight: 1.6 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 予約表（練習用） */}
      <div className="card" style={{ overflow: 'auto', maxWidth: '100%' }}>
        <div style={{ display: 'inline-block', minWidth: '100%' }}>
          {/* ヘッダ行 */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 3 }}>
            <div style={{
              width: TIME_COL_W, flexShrink: 0, height: 34, background: 'var(--surface)',
              borderBottom: '1px solid var(--line)', borderRight: '1px solid var(--line)',
              position: 'sticky', left: 0, zIndex: 4, boxSizing: 'border-box',
            }} />
            {STAFF.map((s) => (
              <div key={s.id} style={{
                width: STAFF_COL_W, flexShrink: 0, height: 34, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600,
                background: 'var(--surface)', borderBottom: '1px solid var(--line)',
                borderRight: '1px solid var(--line)', boxSizing: 'border-box',
              }}>{s.name}</div>
            ))}
          </div>

          {/* ボディ */}
          <div style={{ display: 'flex', position: 'relative' }}>
            {/* 時刻軸 */}
            <div style={{
              width: TIME_COL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 2,
              background: 'var(--surface)', borderRight: '1px solid var(--line)',
              height: bodyHeight, boxSizing: 'border-box',
            }}>
              {hourMarks.map((m) => (
                <div key={m} style={{
                  position: 'absolute', top: (m - OPEN_MIN) * PX_PER_MIN, left: 0, right: 0,
                  fontSize: 11.5, color: 'var(--sub)', textAlign: 'right', paddingRight: 6,
                  transform: 'translateY(-1px)', fontVariantNumeric: 'tabular-nums',
                }}>{minToHHMM(m)}</div>
              ))}
            </div>

            {/* スタッフ列 */}
            {STAFF.map((s) => (
              <div key={s.id} style={{
                width: STAFF_COL_W, flexShrink: 0, position: 'relative', height: bodyHeight,
                borderRight: '1px solid var(--line)', background: 'var(--surface)', boxSizing: 'border-box',
              }}>
                {/* 30分グリッド（クリックで新規） */}
                {rows.map((m) => (
                  <div
                    key={m}
                    onClick={() => setAdding({ staffId: s.id, startMin: m })}
                    title={`${minToHHMM(m)} クリックで練習の予約を入れる`}
                    style={{
                      position: 'absolute', top: (m - OPEN_MIN) * PX_PER_MIN, left: 0, right: 0,
                      height: ROW_PX, boxSizing: 'border-box',
                      borderTop: m % 60 === 0 ? '1px solid var(--line)' : '1px solid var(--bg)',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-weak)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  />
                ))}

                {/* 予約ブロック */}
                {active.filter((b) => b.staffId === s.id).map((b) => {
                  const top = (b.startMin - OPEN_MIN) * PX_PER_MIN;
                  const height = Math.max(ROW_PX, b.minutes * PX_PER_MIN) - 2;
                  const color = b.status === 'completed' ? 'var(--sub)' : 'var(--green)';
                  return (
                    <div
                      key={b.id}
                      onClick={(e) => { e.stopPropagation(); setEditing(b); }}
                      title={`${minToHHMM(b.startMin)} ${b.guestName} / ${b.menuName}（クリックで変更・キャンセル）`}
                      style={{
                        position: 'absolute', top, left: 2, right: 2, height,
                        background: 'var(--surface)', border: '1px solid var(--line)',
                        borderLeft: `3px solid ${color}`, borderRadius: 4, boxSizing: 'border-box',
                        padding: '2px 6px', overflow: 'hidden', cursor: 'pointer',
                        boxShadow: 'var(--shadow)', lineHeight: 1.3,
                      }}
                    >
                      <div style={{ fontSize: 11, color: 'var(--sub)', fontVariantNumeric: 'tabular-nums' }}>
                        {minToHHMM(b.startMin)}
                        {b.status === 'completed' && <span style={{ marginLeft: 4 }}>完了</span>}
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {b.guestName}
                      </div>
                      {height > 34 && (
                        <div style={{ fontSize: 11.5, color: 'var(--sub)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {b.menuName}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* トースト */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--ink)', color: '#fff', padding: '10px 18px', borderRadius: 8,
          fontSize: 13.5, zIndex: 50, boxShadow: 'var(--shadow)',
        }}>{toast}</div>
      )}

      {/* 新規登録モーダル */}
      {adding && (
        <AddModal
          ctx={adding}
          hasOverlap={(sid, start, mins) => overlaps(sid, start, mins)}
          onClose={() => setAdding(null)}
          onAdd={(b) => {
            setBookings((prev) => [...prev, b]);
            setAdding(null);
            flash(`${b.guestName}さんの予約を入れました（練習）`);
          }}
        />
      )}

      {/* 変更・キャンセルモーダル */}
      {editing && (
        <EditModal
          b={editing}
          hasOverlap={(start, mins) => overlaps(editing.staffId, start, mins, editing.id)}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            setBookings((prev) => prev.map((x) => (x.id === editing.id ? { ...x, ...patch } : x)));
            setEditing(null);
            flash('予約を変更しました（練習）');
          }}
          onComplete={() => {
            setBookings((prev) => prev.map((x) => (x.id === editing.id ? { ...x, status: 'completed' } : x)));
            setEditing(null);
            flash('来店完了にしました（練習）');
          }}
          onCancel={() => {
            setBookings((prev) => prev.map((x) => (x.id === editing.id ? { ...x, status: 'cancelled' } : x)));
            setEditing(null);
            flash('予約をキャンセルしました（練習）');
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 新規登録モーダル
// ─────────────────────────────────────────────────────────────
function AddModal({ ctx, hasOverlap, onClose, onAdd }: {
  ctx: { staffId: string; startMin: number };
  hasOverlap: (staffId: string, startMin: number, minutes: number) => boolean;
  onClose: () => void;
  onAdd: (b: DemoBooking) => void;
}) {
  const [name, setName] = useState('');
  const [menuId, setMenuId] = useState(MENUS[0].id);
  const [staffId, setStaffId] = useState(ctx.staffId);
  const [error, setError] = useState<string | null>(null);
  const menu = MENUS.find((m) => m.id === menuId)!;
  const staffName = STAFF.find((s) => s.id === staffId)?.name ?? '';

  const submit = () => {
    if (!name.trim()) { setError('お名前を入力してください（練習なので何でもOKです）'); return; }
    if (ctx.startMin + menu.minutes > CLOSE_MIN) { setError('終了が営業時間（21:00）を超えます。早い時間を選んでください。'); return; }
    if (hasOverlap(staffId, ctx.startMin, menu.minutes)) { setError('その時間帯はこの担当に別の予約が入っています。'); return; }
    onAdd({
      id: nextId(), staffId, startMin: ctx.startMin, minutes: menu.minutes,
      guestName: name.trim(), menuName: menu.name, status: 'confirmed',
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 100%)' }}>
        <div className="modal-head" style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>予約を入れる（練習）</span>
          <button type="button" onClick={onClose} aria-label="閉じる" style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: 'var(--sub)' }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          <div className="note" style={{ marginBottom: 14 }}>
            {minToHHMM(ctx.startMin)}〜 / {staffName}
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">お名前</label>
            <input className="input" placeholder="例）山田 花子" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label className="field-label">メニュー</label>
              <select className="select" value={menuId} onChange={(e) => setMenuId(e.target.value)}>
                {MENUS.map((m) => <option key={m.id} value={m.id}>{m.name}（{m.minutes}分）</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">担当</label>
              <select className="select" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
                {STAFF.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="note" style={{ marginTop: 12 }}>
            終了予定: <strong>{minToHHMM(ctx.startMin + menu.minutes)}</strong>（{menu.minutes}分）
          </div>
          {error && <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--red-weak)', color: 'var(--red)', borderRadius: 8, fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>閉じる</button>
          <button type="button" className="btn btn-primary" onClick={submit}>この内容で入れる</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 変更・キャンセルモーダル
// ─────────────────────────────────────────────────────────────
function EditModal({ b, hasOverlap, onClose, onSave, onComplete, onCancel }: {
  b: DemoBooking;
  hasOverlap: (startMin: number, minutes: number) => boolean;
  onClose: () => void;
  onSave: (patch: Partial<DemoBooking>) => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [startMin, setStartMin] = useState(b.startMin);
  const [minutes, setMinutes] = useState(b.minutes);
  const [error, setError] = useState<string | null>(null);

  const timeOptions = useMemo(() => {
    const out: number[] = [];
    for (let m = OPEN_MIN; m < CLOSE_MIN; m += STEP) out.push(m);
    return out;
  }, []);

  const save = () => {
    if (startMin + minutes > CLOSE_MIN) { setError('終了が営業時間（21:00）を超えます。'); return; }
    if (hasOverlap(startMin, minutes)) { setError('その時間帯はこの担当に別の予約が入っています。'); return; }
    onSave({ startMin, minutes });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(440px, 100%)' }}>
        <div className="modal-head" style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>予約の変更（練習）</span>
          <button type="button" onClick={onClose} aria-label="閉じる" style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: 'var(--sub)' }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          <div className="note" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{b.guestName} 様</div>
            <div style={{ color: 'var(--sub)' }}>{b.menuName} / 現在 {minToHHMM(b.startMin)}〜{minToHHMM(b.startMin + b.minutes)}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label className="field-label">開始時刻</label>
              <select className="select" value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>
                {timeOptions.map((m) => <option key={m} value={m}>{minToHHMM(m)}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">所要時間</label>
              <select className="select" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                {[30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m}分</option>)}
              </select>
            </div>
          </div>
          <div className="note" style={{ marginTop: 12 }}>
            終了予定: <strong>{minToHHMM(startMin + minutes)}</strong>
          </div>
          {error && <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--red-weak)', color: 'var(--red)', borderRadius: 8, fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm" onClick={onComplete}>来店完了にする</button>
            <button type="button" className="btn btn-sm btn-danger" onClick={onCancel}>キャンセルする</button>
          </div>
        </div>
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>閉じる</button>
          <button type="button" className="btn btn-primary" onClick={save}>変更を保存する</button>
        </div>
      </div>
    </div>
  );
}
