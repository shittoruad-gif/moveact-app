import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// 店舗設定
// (a) 営業時間: store_business_hours を店舗×曜日の表で編集・保存
// (b) 臨時休業/特別営業: store_closed_days の一覧（今日以降）＋追加・削除
// ※ 必ず store_id で絞る（他店舗のデータを巻き込まない）
// ※ 日付はJST基準（epoch計算で今日を求める）。open/close は 'HH:MM' のTEXT

type StoreId = 'tamashima' | 'kanamitsu';
const STORE_ORDER: StoreId[] = ['tamashima', 'kanamitsu'];
const STORE_NAMES: Record<StoreId, string> = { tamashima: '玉島店', kanamitsu: '金光店' };

const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface HourRow {
  day_of_week: number;
  open_time: string;   // 'HH:MM'（編集用。定休日でも直前値を保持）
  close_time: string;
  is_closed: boolean;
}

interface ClosedDayRow {
  id: string;
  store_id: string;
  date: string;        // 'YYYY-MM-DD'
  is_closed: boolean;  // true=終日休業 / false=特別営業時間
  open_time: string | null;
  close_time: string | null;
  reason: string | null;
}

// JSTの今日 'YYYY-MM-DD'（epoch計算でタイムゾーンを明示）
function jstTodayStr(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function fmtDate(dateStr: string): string {
  // DATE列はJSTの日付として扱う（+09:00明示でUTC解釈を防ぐ）
  return new Date(`${dateStr}T00:00:00+09:00`).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  });
}

const DEFAULT_HOURS: HourRow[] = Array.from({ length: 7 }, (_, dow) => ({
  day_of_week: dow, open_time: '09:00', close_time: '21:00', is_closed: false,
}));

const INIT_CLOSED_FORM = {
  date: jstTodayStr(),
  mode: 'closed' as 'closed' | 'special',
  openTime: '09:00',
  closeTime: '17:00',
  reason: '',
};

export function StoreSettings() {
  const [storeId, setStoreId] = useState<StoreId>('tamashima');
  const [hours, setHours] = useState<HourRow[]>(DEFAULT_HOURS);
  const [hoursLoading, setHoursLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [closedDays, setClosedDays] = useState<ClosedDayRow[]>([]);
  const [closedForm, setClosedForm] = useState(INIT_CLOSED_FORM);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flashSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 4000);
  };

  // ── (a) 営業時間の読み込み ──
  const loadHours = useCallback(async () => {
    setHoursLoading(true);
    const { data } = await supabase
      .from('store_business_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('store_id', storeId)   // 店舗で必ず絞る
      .order('day_of_week');

    const rows = (data as { day_of_week: number; open_time: string | null; close_time: string | null; is_closed: boolean }[]) ?? [];
    setHours(DEFAULT_HOURS.map(def => {
      const found = rows.find(r => r.day_of_week === def.day_of_week);
      if (!found) return { ...def };
      return {
        day_of_week: found.day_of_week,
        open_time: found.open_time ?? def.open_time,
        close_time: found.close_time ?? def.close_time,
        is_closed: found.is_closed,
      };
    }));
    setHoursLoading(false);
  }, [storeId]);

  // ── (b) 臨時休業/特別営業の読み込み（今日以降・この店舗のみ） ──
  const loadClosedDays = useCallback(async () => {
    const { data } = await supabase
      .from('store_closed_days')
      .select('id, store_id, date, is_closed, open_time, close_time, reason')
      .eq('store_id', storeId)   // 店舗で必ず絞る
      .gte('date', jstTodayStr())
      .order('date');
    setClosedDays((data as ClosedDayRow[]) ?? []);
  }, [storeId]);

  useEffect(() => { loadHours(); }, [loadHours]);
  useEffect(() => { loadClosedDays(); }, [loadClosedDays]);

  const setHour = (dow: number, patch: Partial<HourRow>) =>
    setHours(hs => hs.map(h => (h.day_of_week === dow ? { ...h, ...patch } : h)));

  // ── (a) 営業時間の保存 ──
  const handleSaveHours = async () => {
    setSuccess(null);
    for (const h of hours) {
      if (h.is_closed) continue;
      if (!h.open_time || !h.close_time) {
        setError(`${DOW_LABELS[h.day_of_week]}曜の営業時間を入力してください`);
        return;
      }
      if (h.open_time >= h.close_time) {
        setError(`${DOW_LABELS[h.day_of_week]}曜は閉店時刻を開店時刻より後にしてください`);
        return;
      }
    }

    setSaving(true); setError(null);

    const payload = hours.map(h => ({
      store_id: storeId,
      day_of_week: h.day_of_week,
      open_time: h.is_closed ? null : h.open_time,
      close_time: h.is_closed ? null : h.close_time,
      is_closed: h.is_closed,
      updated_at: new Date().toISOString(),
    }));

    const { error: err } = await supabase
      .from('store_business_hours')
      .upsert(payload, { onConflict: 'store_id,day_of_week' });

    setSaving(false);

    if (err) {
      setError(`エラー: 営業時間の保存に失敗しました（${err.message}）`);
      return;
    }
    flashSuccess(`${STORE_NAMES[storeId]}の営業時間を保存しました`);
    loadHours();
  };

  // ── (b) 臨時休業/特別営業の追加 ──
  const setClosed = <K extends keyof typeof INIT_CLOSED_FORM>(key: K, val: (typeof INIT_CLOSED_FORM)[K]) =>
    setClosedForm(f => ({ ...f, [key]: val }));

  const handleAddClosedDay = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);

    if (!closedForm.date) { setError('日付を入力してください'); return; }
    if (closedForm.mode === 'special') {
      if (!closedForm.openTime || !closedForm.closeTime) {
        setError('特別営業の開店・閉店時刻を入力してください'); return;
      }
      if (closedForm.openTime >= closedForm.closeTime) {
        setError('特別営業の閉店時刻は開店時刻より後にしてください'); return;
      }
    }

    setAdding(true); setError(null);

    const isClosed = closedForm.mode === 'closed';
    const { error: err } = await supabase.from('store_closed_days').insert({
      store_id: storeId,
      date: closedForm.date,
      is_closed: isClosed,
      open_time: isClosed ? null : closedForm.openTime,
      close_time: isClosed ? null : closedForm.closeTime,
      reason: closedForm.reason.trim() || null,
    });

    setAdding(false);

    if (err) {
      if (err.code === '23505') {
        setError('この日付はすでに登録されています。変更する場合は既存の行を削除してから登録し直してください。');
      } else {
        setError(`エラー: 登録に失敗しました（${err.message}）`);
      }
      return;
    }
    flashSuccess(isClosed ? '臨時休業を登録しました' : '特別営業時間を登録しました');
    setClosedForm(f => ({ ...INIT_CLOSED_FORM, mode: f.mode }));
    loadClosedDays();
  };

  const handleDeleteClosedDay = async (row: ClosedDayRow) => {
    const label = row.is_closed ? '臨時休業' : '特別営業時間';
    if (!window.confirm(`${fmtDate(row.date)} の${label}を削除しますか？`)) return;

    setDeleting(row.id);
    const { error: err } = await supabase.from('store_closed_days').delete().eq('id', row.id);
    setDeleting(null);

    if (err) {
      setError(`エラー: 削除に失敗しました（${err.message}）`);
      return;
    }
    loadClosedDays();
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 700, color: '#C3003A' }}>
        店舗設定
      </h2>

      {/* 店舗切り替え */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {STORE_ORDER.map(s => (
          <button
            key={s}
            onClick={() => setStoreId(s)}
            style={{
              padding: '8px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              border: '1px solid #C3003A', cursor: 'pointer',
              background: storeId === s ? '#C3003A' : '#fff',
              color: storeId === s ? '#fff' : '#C3003A',
            }}
          >
            {STORE_NAMES[s]}
          </button>
        ))}
      </div>

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

      {/* (a) 営業時間 */}
      <Card title={`営業時間（${STORE_NAMES[storeId]}・曜日別）`}>
        {hoursLoading ? (
          <div style={{ padding: 20, textAlign: 'center', color: '#999', fontSize: 14 }}>読み込み中…</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#C3003A', color: '#fff' }}>
                <th style={thStyle}>曜日</th>
                <th style={thStyle}>定休日</th>
                <th style={thStyle}>開店</th>
                <th style={thStyle}>閉店</th>
              </tr>
            </thead>
            <tbody>
              {hours.map(h => (
                <tr key={h.day_of_week} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: h.day_of_week === 0 ? '#C62828' : h.day_of_week === 6 ? '#1565C0' : '#333' }}>
                    {DOW_LABELS[h.day_of_week]}曜
                  </td>
                  <td style={tdStyle}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={h.is_closed}
                        onChange={e => setHour(h.day_of_week, { is_closed: e.target.checked })}
                        style={{ width: 16, height: 16, accentColor: '#C3003A' }}
                      />
                      <span style={{ color: h.is_closed ? '#C62828' : '#999' }}>
                        {h.is_closed ? '定休日' : '営業'}
                      </span>
                    </label>
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="time" style={{ ...inp, width: 130, opacity: h.is_closed ? 0.4 : 1 }}
                      value={h.open_time} disabled={h.is_closed}
                      onChange={e => setHour(h.day_of_week, { open_time: e.target.value })}
                    />
                  </td>
                  <td style={tdStyle}>
                    <input
                      type="time" style={{ ...inp, width: 130, opacity: h.is_closed ? 0.4 : 1 }}
                      value={h.close_time} disabled={h.is_closed}
                      onChange={e => setHour(h.day_of_week, { close_time: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button
          onClick={handleSaveHours}
          disabled={saving || hoursLoading}
          style={{
            marginTop: 16, width: '100%', padding: 12, background: '#C3003A', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: saving || hoursLoading ? 'not-allowed' : 'pointer',
            opacity: saving || hoursLoading ? 0.7 : 1,
          }}
        >
          {saving ? '保存中…' : '営業時間を保存する'}
        </button>
      </Card>

      {/* (b) 臨時休業・特別営業 */}
      <Card title={`臨時休業・特別営業（${STORE_NAMES[storeId]}・本日以降）`}>
        <form onSubmit={handleAddClosedDay} style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
            <Field label="日付 *">
              <input type="date" style={inp} value={closedForm.date} onChange={e => setClosed('date', e.target.value)} />
            </Field>
            <Field label="種別 *">
              <select style={sel} value={closedForm.mode} onChange={e => setClosed('mode', e.target.value as 'closed' | 'special')}>
                <option value="closed">終日休業</option>
                <option value="special">特別営業時間</option>
              </select>
            </Field>
            <Field label="開店">
              <input
                type="time" style={{ ...inp, opacity: closedForm.mode === 'closed' ? 0.4 : 1 }}
                value={closedForm.openTime} disabled={closedForm.mode === 'closed'}
                onChange={e => setClosed('openTime', e.target.value)}
              />
            </Field>
            <Field label="閉店">
              <input
                type="time" style={{ ...inp, opacity: closedForm.mode === 'closed' ? 0.4 : 1 }}
                value={closedForm.closeTime} disabled={closedForm.mode === 'closed'}
                onChange={e => setClosed('closeTime', e.target.value)}
              />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end', marginTop: 12 }}>
            <Field label="理由・メモ">
              <input
                type="text" style={inp} placeholder="例）お盆休み / 研修のため午前のみ営業"
                value={closedForm.reason} onChange={e => setClosed('reason', e.target.value)}
              />
            </Field>
            <button
              type="submit"
              disabled={adding}
              style={{
                padding: '10px 24px', background: '#C3003A', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
                cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {adding ? '登録中…' : '追加する'}
            </button>
          </div>
        </form>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#C3003A', color: '#fff' }}>
              <th style={thStyle}>日付</th>
              <th style={thStyle}>種別</th>
              <th style={thStyle}>時間</th>
              <th style={thStyle}>理由</th>
              <th style={thStyle}>操作</th>
            </tr>
          </thead>
          <tbody>
            {closedDays.map(d => (
              <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtDate(d.date)}</td>
                <td style={tdStyle}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                    background: d.is_closed ? '#FFEBEE' : '#E3F2FD',
                    color: d.is_closed ? '#C62828' : '#1565C0',
                  }}>
                    {d.is_closed ? '終日休業' : '特別営業'}
                  </span>
                </td>
                <td style={tdStyle}>
                  {d.is_closed ? '-' : `${d.open_time ?? '?'}〜${d.close_time ?? '?'}`}
                </td>
                <td style={tdStyle}>{d.reason ?? '-'}</td>
                <td style={tdStyle}>
                  <button
                    onClick={() => handleDeleteClosedDay(d)}
                    disabled={deleting === d.id}
                    style={{
                      color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px',
                      fontSize: 12, fontWeight: 600, background: '#999',
                      cursor: deleting === d.id ? 'not-allowed' : 'pointer',
                    }}
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
            {closedDays.length === 0 && (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#999' }}>
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
