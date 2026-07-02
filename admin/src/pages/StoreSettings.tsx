import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// 店舗設定
// (a) 営業時間: store_business_hours を店舗×曜日の表で編集・保存（保存ボタンは表の下に1つ）
// (b) 臨時休業/特別営業: store_closed_days の一覧（今日以降）＋追加・削除（別カード）
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
    if (!window.confirm(`${fmtDate(row.date)} の${label}を削除します。よろしいですか？`)) return;

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
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">店舗設定</h2>
        <p className="page-help">店舗の営業時間と臨時休業を設定します。ここでの設定はネット予約の受付時間に反映されます。</p>
      </div>

      {/* 店舗切り替え */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="seg">
          {STORE_ORDER.map(s => (
            <button
              key={s}
              type="button"
              className={`seg-btn${storeId === s ? ' seg-btn--active' : ''}`}
              onClick={() => setStoreId(s)}
              title={`${STORE_NAMES[s]}の設定を表示します`}
            >
              {STORE_NAMES[s]}
            </button>
          ))}
        </div>
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

      {/* (a) 営業時間 */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>
          営業時間（{STORE_NAMES[storeId]}・曜日別）
        </h3>

        {hoursLoading ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--sub)', fontSize: 13 }}>読み込み中…</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>曜日</th>
                  <th>定休日</th>
                  <th>開店</th>
                  <th>閉店</th>
                </tr>
              </thead>
              <tbody>
                {hours.map(h => (
                  <tr key={h.day_of_week}>
                    <td style={{ fontWeight: 600 }}>{DOW_LABELS[h.day_of_week]}曜</td>
                    <td>
                      <label
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}
                        title="チェックすると、この曜日はネット予約を受け付けません"
                      >
                        <input
                          type="checkbox"
                          checked={h.is_closed}
                          onChange={e => setHour(h.day_of_week, { is_closed: e.target.checked })}
                          style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                        />
                        <span style={{ color: h.is_closed ? 'var(--ink)' : 'var(--sub)' }}>
                          {h.is_closed ? '定休日' : '営業'}
                        </span>
                      </label>
                    </td>
                    <td>
                      <input
                        type="time" className="input" style={{ width: 120 }}
                        value={h.open_time} disabled={h.is_closed}
                        onChange={e => setHour(h.day_of_week, { open_time: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="time" className="input" style={{ width: 120 }}
                        value={h.close_time} disabled={h.is_closed}
                        onChange={e => setHour(h.day_of_week, { close_time: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            onClick={handleSaveHours}
            disabled={saving || hoursLoading}
          >
            {saving ? '保存中…' : '営業時間を保存する'}
          </button>
        </div>
      </div>

      {/* (b) 臨時休業・特別営業 */}
      <div className="card card-pad">
        <h3 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600 }}>
          臨時休業・特別営業（{STORE_NAMES[storeId]}・本日以降）
        </h3>

        <form onSubmit={handleAddClosedDay} style={{ marginBottom: 20 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <div className="field">
              <label className="field-label">日付（必須）</label>
              <input type="date" className="input" value={closedForm.date} onChange={e => setClosed('date', e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">種別（必須）</label>
              <select
                className="select"
                value={closedForm.mode}
                onChange={e => setClosed('mode', e.target.value as 'closed' | 'special')}
                title="終日休業＝その日は予約を受け付けません／特別営業時間＝通常と異なる時間で営業します"
              >
                <option value="closed">終日休業</option>
                <option value="special">特別営業時間</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">開店</label>
              <input
                type="time" className="input"
                value={closedForm.openTime} disabled={closedForm.mode === 'closed'}
                onChange={e => setClosed('openTime', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">閉店</label>
              <input
                type="time" className="input"
                value={closedForm.closeTime} disabled={closedForm.mode === 'closed'}
                onChange={e => setClosed('closeTime', e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end', marginTop: 12 }}>
            <div className="field">
              <label className="field-label">理由・メモ</label>
              <input
                type="text" className="input" placeholder="例）お盆休み / 研修のため午前のみ営業"
                value={closedForm.reason} onChange={e => setClosed('reason', e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={adding} style={{ whiteSpace: 'nowrap' }}>
              {adding
                ? '登録中…'
                : closedForm.mode === 'closed' ? '臨時休業を登録する' : '特別営業を登録する'}
            </button>
          </div>
        </form>

        {closedDays.length === 0 ? (
          <div className="empty">本日以降の臨時休業・特別営業はありません。上のフォームから登録できます。</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>種別</th>
                  <th>時間</th>
                  <th>理由</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {closedDays.map(d => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{fmtDate(d.date)}</td>
                    <td>
                      <span
                        className={`badge ${d.is_closed ? 'badge-red' : 'badge-amber'}`}
                        title={d.is_closed ? 'この日は終日予約を受け付けません' : 'この日は通常と異なる時間で営業します'}
                      >
                        {d.is_closed ? '終日休業' : '特別営業'}
                      </span>
                    </td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {d.is_closed ? '-' : `${d.open_time ?? '?'}〜${d.close_time ?? '?'}`}
                    </td>
                    <td>{d.reason ?? '-'}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteClosedDay(d)}
                        disabled={deleting === d.id}
                        title="この登録を削除します（通常の営業時間に戻ります）"
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
