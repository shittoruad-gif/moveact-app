import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface GroupLesson {
  id: string;
  store_id: string;
  title: string;
  instructor_name: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  max_capacity: number;
  current_bookings: number;
  price: number;
  is_ticket_eligible: boolean;
  is_cancelled: boolean;
}

interface LessonPattern {
  key: string;
  store_id: string;
  title: string;
  instructor_name: string;
  description: string | null;
  weekday: number;
  startHM: string;
  endHM: string;
  max_capacity: number;
  price: number;
  is_ticket_eligible: boolean;
  lastMonthCount: number;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** timestamptz を JST の (曜日, HH:MM) に分解する（実行環境のタイムゾーンに依存しない） */
function toJstParts(iso: string): { weekday: number; hm: string } {
  const j = new Date(new Date(iso).getTime() + 9 * 3600000);
  return {
    weekday: j.getUTCDay(),
    hm: `${pad2(j.getUTCHours())}:${pad2(j.getUTCMinutes())}`,
  };
}

/** 今日の日付（JST）。m は 0 始まり */
function jstToday(): { y: number; m: number; d: number } {
  const j = new Date(Date.now() + 9 * 3600000);
  return { y: j.getUTCFullYear(), m: j.getUTCMonth(), d: j.getUTCDate() };
}

/** 月のはみ出しを正規化する（m は 0 始まり） */
function normalizeMonth(y: number, m: number): { y: number; m: number } {
  return { y: y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
}

/** 月初 00:00 JST の timestamptz 文字列 */
function monthStartJst(y: number, m: number): string {
  return `${y}-${pad2(m + 1)}-01T00:00:00+09:00`;
}

/** 対象月のうち、指定曜日かつ今日（JST）より後の日付（YYYY-MM-DD）一覧 */
function futureDatesInMonth(y: number, m: number, weekday: number): string[] {
  const today = jstToday();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(Date.UTC(y, m, d)).getUTCDay() !== weekday) continue;
    const isAfterToday =
      y > today.y || (y === today.y && (m > today.m || (m === today.m && d > today.d)));
    if (!isAfterToday) continue;
    dates.push(`${y}-${pad2(m + 1)}-${pad2(d)}`);
  }
  return dates;
}

export function GroupLessons() {
  const [lessons, setLessons] = useState<GroupLesson[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    store_id: 'kanamitsu',
    title: '',
    instructor_name: '',
    starts_at: '',
    ends_at: '',
    max_capacity: 8,
    price: 3000,
  });

  // 先月コピー用の状態
  const [copyMonthOffset, setCopyMonthOffset] = useState<0 | 1>(0);
  const [patterns, setPatterns] = useState<LessonPattern[] | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loadingPatterns, setLoadingPatterns] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyResult, setCopyResult] = useState<{ text: string; isError: boolean } | null>(null);

  const today = jstToday();
  const thisMonth = normalizeMonth(today.y, today.m);
  const nextMonth = normalizeMonth(today.y, today.m + 1);
  const targetMonth = copyMonthOffset === 0 ? thisMonth : nextMonth;
  const prevMonth = normalizeMonth(targetMonth.y, targetMonth.m - 1);

  const selectedPatterns = (patterns ?? []).filter((p) => selectedKeys.has(p.key));
  const plannedTotal = selectedPatterns.reduce(
    (sum, p) => sum + futureDatesInMonth(targetMonth.y, targetMonth.m, p.weekday).length,
    0,
  );
  const allSelected =
    patterns !== null && patterns.length > 0 && patterns.every((p) => selectedKeys.has(p.key));

  useEffect(() => {
    fetchLessons();
  }, []);

  async function fetchLessons() {
    const { data } = await supabase
      .from('group_lessons')
      .select('*')
      .gte('starts_at', new Date().toISOString())
      .order('starts_at');
    setLessons((data as GroupLesson[]) ?? []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from('group_lessons').insert({
      ...form,
      is_ticket_eligible: true,
      is_cancelled: false,
    });
    setShowForm(false);
    setForm({ store_id: 'kanamitsu', title: '', instructor_name: '', starts_at: '', ends_at: '', max_capacity: 8, price: 3000 });
    fetchLessons();
  }

  async function handleCancel(lessonId: string) {
    if (!confirm('このレッスンをキャンセルします。よろしいですか？')) return;
    await supabase.from('group_lessons').update({ is_cancelled: true }).eq('id', lessonId);
    fetchLessons();
  }

  function handleChangeCopyMonth(offset: 0 | 1) {
    if (offset === copyMonthOffset) return;
    setCopyMonthOffset(offset);
    setPatterns(null);
    setSelectedKeys(new Set());
    setCopyResult(null);
  }

  async function handleLoadLastMonth() {
    setLoadingPatterns(true);
    setCopyResult(null);
    const { data } = await supabase
      .from('group_lessons')
      .select('*')
      .eq('is_cancelled', false)
      .gte('starts_at', monthStartJst(prevMonth.y, prevMonth.m))
      .lt('starts_at', monthStartJst(targetMonth.y, targetMonth.m))
      .order('starts_at');
    const map = new Map<string, LessonPattern>();
    for (const l of (data as GroupLesson[]) ?? []) {
      const start = toJstParts(l.starts_at);
      const end = toJstParts(l.ends_at);
      const key = JSON.stringify([
        l.store_id,
        start.weekday,
        start.hm,
        end.hm,
        l.title,
        l.instructor_name,
        l.max_capacity,
        l.price,
        l.is_ticket_eligible,
      ]);
      const existing = map.get(key);
      if (existing) {
        existing.lastMonthCount += 1;
        if (existing.description == null && l.description != null) {
          existing.description = l.description;
        }
      } else {
        map.set(key, {
          key,
          store_id: l.store_id,
          title: l.title,
          instructor_name: l.instructor_name,
          description: l.description ?? null,
          weekday: start.weekday,
          startHM: start.hm,
          endHM: end.hm,
          max_capacity: l.max_capacity,
          price: l.price,
          is_ticket_eligible: l.is_ticket_eligible,
          lastMonthCount: 1,
        });
      }
    }
    const list = [...map.values()].sort(
      (a, b) =>
        a.store_id.localeCompare(b.store_id) ||
        a.weekday - b.weekday ||
        a.startHM.localeCompare(b.startHM) ||
        a.title.localeCompare(b.title, 'ja'),
    );
    setPatterns(list);
    setSelectedKeys(new Set(list.map((p) => p.key)));
    setLoadingPatterns(false);
  }

  function togglePattern(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function toggleAllPatterns() {
    if (patterns === null) return;
    setSelectedKeys(allSelected ? new Set() : new Set(patterns.map((p) => p.key)));
  }

  async function handleApplyCopy() {
    if (patterns === null || copying) return;
    setCopying(true);
    setCopyResult(null);

    // 重複チェック用に対象月の既存レッスンを取得（同store・同starts_at・同titleはスキップ）
    const nextOfTarget = normalizeMonth(targetMonth.y, targetMonth.m + 1);
    const { data: existingRows } = await supabase
      .from('group_lessons')
      .select('store_id, starts_at, title')
      .gte('starts_at', monthStartJst(targetMonth.y, targetMonth.m))
      .lt('starts_at', monthStartJst(nextOfTarget.y, nextOfTarget.m));
    const existingKeys = new Set(
      ((existingRows as Pick<GroupLesson, 'store_id' | 'starts_at' | 'title'>[]) ?? []).map(
        (r) => `${r.store_id}|${new Date(r.starts_at).getTime()}|${r.title}`,
      ),
    );

    const rows: Record<string, unknown>[] = [];
    let skipped = 0;
    for (const p of selectedPatterns) {
      for (const dateStr of futureDatesInMonth(targetMonth.y, targetMonth.m, p.weekday)) {
        const startsAt = `${dateStr}T${p.startHM}:00+09:00`;
        const dupKey = `${p.store_id}|${new Date(startsAt).getTime()}|${p.title}`;
        if (existingKeys.has(dupKey)) {
          skipped += 1;
          continue;
        }
        existingKeys.add(dupKey);
        rows.push({
          store_id: p.store_id,
          title: p.title,
          instructor_name: p.instructor_name,
          description: p.description,
          starts_at: startsAt,
          ends_at: `${dateStr}T${p.endHM}:00+09:00`,
          max_capacity: p.max_capacity,
          current_bookings: 0,
          price: p.price,
          is_ticket_eligible: p.is_ticket_eligible,
          is_cancelled: false,
        });
      }
    }

    let created = 0;
    let failMessage: string | null = null;
    if (rows.length > 0) {
      const { error } = await supabase.from('group_lessons').insert(rows);
      if (error) {
        failMessage = error.message;
      } else {
        created = rows.length;
      }
    }

    const monthLabel = `${targetMonth.m + 1}月`;
    if (failMessage) {
      setCopyResult({
        text: `登録に失敗しました（${failMessage}）。作成0件・スキップ${skipped}件です。`,
        isError: true,
      });
    } else {
      setCopyResult({
        text:
          `${monthLabel}分の登録が完了しました。作成${created}件・スキップ${skipped}件です。` +
          (skipped > 0
            ? 'スキップ分は、同じ店舗・日時・レッスン名のレッスンが既に登録されているため作成していません。'
            : ''),
        isError: false,
      });
      setPatterns(null);
      setSelectedKeys(new Set());
    }
    setCopying(false);
    fetchLessons();
  }

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <h1 className="page-title">グループレッスン管理</h1>
            <p className="page-help">今後のグループレッスンの追加・予約状況の確認・キャンセルができます。毎月同じ曜日・時間のレッスンは先月分からコピーできます。</p>
          </div>
          <button
            type="button"
            className={showForm ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? '追加をやめる' : 'レッスンを追加する'}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card card-pad" style={{ marginBottom: 16 }}>
          <div style={formGridStyle}>
            <div className="field">
              <label className="field-label">店舗</label>
              <select className="select" value={form.store_id} onChange={(e) => setForm({ ...form, store_id: e.target.value })}>
                <option value="kanamitsu">金光店</option>
                <option value="tamashima">玉島店</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">レッスン名</label>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="field">
              <label className="field-label">インストラクター</label>
              <input className="input" value={form.instructor_name} onChange={(e) => setForm({ ...form, instructor_name: e.target.value })} required />
            </div>
            <div className="field">
              <label className="field-label">定員</label>
              <input className="input" type="number" value={form.max_capacity} onChange={(e) => setForm({ ...form, max_capacity: Number(e.target.value) })} required />
            </div>
            <div className="field">
              <label className="field-label">開始日時</label>
              <input className="input" type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required />
            </div>
            <div className="field">
              <label className="field-label">終了日時</label>
              <input className="input" type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} required />
            </div>
            <div className="field">
              <label className="field-label">料金（円）</label>
              <input className="input" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} required />
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary">レッスンを作成する</button>
          </div>
        </form>
      )}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>先月のスケジュールをコピー</h2>
        <p className="page-help" style={{ margin: '4px 0 12px' }}>
          対象月の前月（{prevMonth.m + 1}月）に開催したレッスンを曜日・時間のパターンにまとめ、対象月の同じ曜日（今日より後の日付のみ）に作成します。
        </p>
        <div className="toolbar">
          <span className="field-label">対象月</span>
          <div className="seg">
            <button
              type="button"
              className={copyMonthOffset === 0 ? 'seg-btn seg-btn--active' : 'seg-btn'}
              onClick={() => handleChangeCopyMonth(0)}
            >
              今月（{thisMonth.m + 1}月）
            </button>
            <button
              type="button"
              className={copyMonthOffset === 1 ? 'seg-btn seg-btn--active' : 'seg-btn'}
              onClick={() => handleChangeCopyMonth(1)}
            >
              来月（{nextMonth.m + 1}月）
            </button>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleLoadLastMonth}
            disabled={loadingPatterns}
          >
            {loadingPatterns ? '読み込んでいます…' : '先月のレッスンを読み込む'}
          </button>
        </div>

        {patterns !== null && patterns.length === 0 && (
          <div className="empty">先月のグループレッスンはありません。</div>
        )}

        {patterns !== null && patterns.length > 0 && (
          <>
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAllPatterns}
                        aria-label="すべて選択"
                      />
                    </th>
                    <th>レッスン名</th>
                    <th>店舗</th>
                    <th>曜日</th>
                    <th>時間</th>
                    <th>担当</th>
                    <th>定員</th>
                    <th>料金</th>
                    <th>先月の開催数</th>
                    <th>{targetMonth.m + 1}月に作成される回数</th>
                  </tr>
                </thead>
                <tbody>
                  {patterns.map((p) => {
                    const createCount = futureDatesInMonth(targetMonth.y, targetMonth.m, p.weekday).length;
                    return (
                      <tr key={p.key}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(p.key)}
                            onChange={() => togglePattern(p.key)}
                            aria-label={`${p.title}を選択`}
                          />
                        </td>
                        <td>{p.title}</td>
                        <td>{p.store_id === 'kanamitsu' ? '金光店' : '玉島店'}</td>
                        <td>{WEEKDAY_LABELS[p.weekday]}曜</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.startHM}〜{p.endHM}</td>
                        <td>{p.instructor_name}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.max_capacity}名</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>¥{p.price.toLocaleString()}</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.lastMonthCount}回</td>
                        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{createCount}回</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleApplyCopy}
                disabled={copying || plannedTotal === 0}
              >
                {copying
                  ? '作成しています…'
                  : `選択したレッスンを${targetMonth.m + 1}月に作成する（${plannedTotal}件）`}
              </button>
            </div>
          </>
        )}

        {copyResult && (
          <div className={copyResult.isError ? 'note note-red' : 'note'} style={{ marginTop: 12 }}>
            {copyResult.text}
          </div>
        )}
      </div>

      <div className="card">
        {lessons.length === 0 ? (
          <div className="empty">
            今後のレッスンはまだありません。「レッスンを追加する」から登録できます。
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>店舗</th>
                <th>レッスン名</th>
                <th>インストラクター</th>
                <th>日時</th>
                <th title="現在の予約数 / 定員">予約/定員</th>
                <th>料金</th>
                <th>状態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((l) => (
                <tr key={l.id}>
                  <td>{l.store_id === 'kanamitsu' ? '金光店' : '玉島店'}</td>
                  <td>{l.title}</td>
                  <td>{l.instructor_name}</td>
                  <td>{new Date(l.starts_at).toLocaleString('ja-JP')}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{l.current_bookings}/{l.max_capacity}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>¥{l.price.toLocaleString()}</td>
                  <td>
                    {l.is_cancelled ? (
                      <span className="badge badge-gray">キャンセル</span>
                    ) : (
                      <span className="badge badge-green">開催予定</span>
                    )}
                  </td>
                  <td>
                    {!l.is_cancelled && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        title="このレッスンをキャンセルします"
                        onClick={() => handleCancel(l.id)}
                      >
                        キャンセルする
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const formGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 16,
};
