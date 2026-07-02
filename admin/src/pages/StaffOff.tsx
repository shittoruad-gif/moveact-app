import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// スタッフ休み登録
// ・店舗→スタッフ(staff_stores/public_staff_roster)を選び、
//   staff_unavailability に休み(off)/外出・予定(busy)ブロックを登録する
// ・当日以降の登録済みブロックを一覧表示し、削除できる
// ・日時はJST明示（+09:00）で保存する（素朴文字列はUTC解釈になるため禁止）

type StoreId = 'tamashima' | 'kanamitsu';
const STORE_ORDER: StoreId[] = ['tamashima', 'kanamitsu'];
const STORE_NAMES: Record<StoreId, string> = { tamashima: '玉島店', kanamitsu: '金光店' };

const BLOCK_TYPE_LABELS: Record<string, string> = {
  off: '休み',
  busy: '外出・予定',
  changeover: '入れ替え時間',
};

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
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit',
  });
}

function fmtRange(startsAt: string, endsAt: string): string {
  const sameDay = fmtJstDate(startsAt) === fmtJstDate(endsAt);
  return sameDay
    ? `${fmtJstDate(startsAt)} ${fmtJstTime(startsAt)}〜${fmtJstTime(endsAt)}`
    : `${fmtJstDate(startsAt)} ${fmtJstTime(startsAt)}〜${fmtJstDate(endsAt)} ${fmtJstTime(endsAt)}`;
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
    if (!window.confirm(`${name}さんの ${fmtRange(block.starts_at, block.ends_at)} のブロックを削除しますか？`)) return;

    setDeleting(block.id);
    const { error: err } = await supabase.from('staff_unavailability').delete().eq('id', block.id);
    setDeleting(null);

    if (err) {
      setError(`エラー: 削除に失敗しました（${err.message}）`);
      return;
    }
    loadBlocks();
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 700, color: '#C3003A' }}>
        スタッフ休み登録
      </h2>

      {success && (
        <div style={{
          padding: '12px 16px', background: '#E8F5E9', border: '1px solid #A5D6A7',
          borderRadius: 8, marginBottom: 20, color: '#2E7D32', fontWeight: 600, fontSize: 14,
        }}>
          ✅ {success}
        </div>
      )}
      {error && (
        <div style={{
          padding: '12px 16px', background: '#FFEBEE', border: '1px solid #EF9A9A',
          borderRadius: 8, marginBottom: 20, color: '#C62828', fontSize: 14,
        }}>
          ⚠️ {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card title="休み・予定ブロックの登録">
          <Grid2>
            <Field label="店舗 *">
              <select style={sel} value={form.storeId} onChange={e => set('storeId', e.target.value as StoreId)}>
                {STORE_ORDER.map(s => <option key={s} value={s}>{STORE_NAMES[s]}</option>)}
              </select>
            </Field>

            <Field label="スタッフ *">
              <select style={sel} value={form.staffId} onChange={e => set('staffId', e.target.value)}>
                <option value="">選択してください</option>
                {roster.map(r => <option key={r.staff_id} value={r.staff_id}>{r.full_name}</option>)}
              </select>
            </Field>

            <Field label="日付 *">
              <input type="date" style={inp} value={form.date} onChange={e => set('date', e.target.value)} />
            </Field>

            <Field label="種別 *">
              <select style={sel} value={form.blockType} onChange={e => set('blockType', e.target.value as 'off' | 'busy')}>
                <option value="off">休み（終日・半日など）</option>
                <option value="busy">外出・予定あり</option>
              </select>
            </Field>

            <Field label="開始時刻 *">
              <input type="time" style={inp} value={form.startTime} onChange={e => set('startTime', e.target.value)} step="600" />
            </Field>

            <Field label="終了時刻 *">
              <input type="time" style={inp} value={form.endTime} onChange={e => set('endTime', e.target.value)} step="600" />
            </Field>

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="理由・メモ">
                <input
                  type="text" style={inp} placeholder="例）有休 / 研修 / 通院"
                  value={form.reason} onChange={e => set('reason', e.target.value)}
                />
              </Field>
            </div>
          </Grid2>

          <div style={{
            marginTop: 12, padding: '8px 14px', background: '#F5F5F7',
            borderRadius: 8, fontSize: 13, color: '#666',
          }}>
            登録した時間帯は、そのスタッフの予約枠がブロックされます（Web予約・予約表に反映）。
          </div>
        </Card>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: 14, background: '#C3003A', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            letterSpacing: 0.5, marginBottom: 28,
          }}
        >
          {loading ? '登録中…' : '休み・予定を登録する'}
        </button>
      </form>

      <Card title="登録済みブロック（本日以降）">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#C3003A', color: '#fff' }}>
              <th style={thStyle}>スタッフ</th>
              <th style={thStyle}>店舗</th>
              <th style={thStyle}>日時</th>
              <th style={thStyle}>種別</th>
              <th style={thStyle}>理由</th>
              <th style={thStyle}>操作</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map(b => (
              <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>{b.staff?.full_name ?? '-'}</td>
                <td style={tdStyle}>
                  {b.store_id && (STORE_NAMES as Record<string, string>)[b.store_id]
                    ? (STORE_NAMES as Record<string, string>)[b.store_id]
                    : (b.store_id ?? '-')}
                </td>
                <td style={tdStyle}>{fmtRange(b.starts_at, b.ends_at)}</td>
                <td style={tdStyle}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                    background: b.block_type === 'off' ? '#FFEBEE' : '#FFF8E1',
                    color: b.block_type === 'off' ? '#C62828' : '#B26A00',
                  }}>
                    {(b.block_type && BLOCK_TYPE_LABELS[b.block_type]) || 'ブロック'}
                  </span>
                </td>
                <td style={tdStyle}>{b.reason ?? '-'}</td>
                <td style={tdStyle}>
                  <button
                    onClick={() => handleDelete(b)}
                    disabled={deleting === b.id}
                    style={{
                      color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px',
                      fontSize: 12, fontWeight: 600, background: '#999',
                      cursor: deleting === b.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
            {blocks.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#999' }}>
                  本日以降の登録はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ── 共通スタイル ──────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, padding: 24,
      boxShadow: '0 1px 5px rgba(0,0,0,0.07)', marginBottom: 20,
    }}>
      <h3 style={{
        margin: '0 0 18px', fontSize: 14, fontWeight: 700, color: '#C3003A',
        paddingBottom: 10, borderBottom: '1px solid #EEE',
      }}>{title}</h3>
      {children}
    </div>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600, color: '#444' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const base: React.CSSProperties = {
  width: '100%', padding: '10px 12px', border: '1px solid #DDD',
  borderRadius: 8, fontSize: 14, background: '#FAFAFA', boxSizing: 'border-box',
  outline: 'none',
};
const inp: React.CSSProperties = { ...base };
const sel: React.CSSProperties = { ...base, appearance: 'auto' };

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontSize: 13,
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: 14,
};
