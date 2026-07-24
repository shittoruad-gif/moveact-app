import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// クライアント検索（手動予約入力用）
// =====================================================
// 苗字・フリガナ・電話番号の一部で booking_customers（クライアントリスト）を検索し、
// 選択するとお客様情報をフォームへ呼び出す。選択後は来店履歴（過去の予約メニュー）も表示。
// 履歴は app_bookings（新システム）と airreserve_events（AirReserve取込）の両方から引く。

export interface CustomerHit {
  id: string;
  name: string;
  name_key: string;
  name_kana: string | null;
  phone: string | null;
  phone_norm: string | null;
  email: string | null;
  note: string | null;
}

export interface HistoryItem {
  date: string;       // YYYY/M/D
  time: string;       // HH:MM
  menu: string;
  staff: string;
  status: string;     // 表示用ラベル（済/予約中/キャンセル/AirReserve）
}

interface Props {
  menuNames: Map<string, string>;    // treatment_menu_id → メニュー名
  staffNames: Map<string, string>;   // staff_id → 氏名
  onPick: (c: CustomerHit) => void;  // 選択時にフォームへ反映してもらう
}

const STATUS_LABEL: Record<string, string> = {
  completed: '来店済み', confirmed: '予約中', pending: '仮予約',
  cancelled: 'キャンセル', no_show: '無断キャンセル',
};

function fmt(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

export function CustomerSearch({ menuNames, staffNames, onPick }: Props) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<CustomerHit | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);   // null=未取得/取得中
  const timerRef = useRef<number | null>(null);

  // 入力から300ms待って検索（打鍵ごとの連打を避ける）
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const term = q.trim();
    if (term.length < 1) { setHits([]); setOpen(false); return; }
    timerRef.current = window.setTimeout(async () => {
      const like = `%${term.replace(/[%_]/g, '')}%`;
      const digits = term.replace(/\D/g, '');
      const ors = [`name.ilike.${like}`, `name_kana.ilike.${like}`];
      if (digits.length >= 3) ors.push(`phone_norm.ilike.%${digits}%`);
      const { data } = await supabase
        .from('booking_customers')
        .select('id, name, name_key, name_kana, phone, phone_norm, email, note')
        .or(ors.join(','))
        .order('updated_at', { ascending: false })
        .limit(8);
      setHits((data as CustomerHit[]) ?? []);
      setOpen(true);
    }, 300);
    return () => { if (timerRef.current) window.clearTimeout(timerRef.current); };
  }, [q]);

  const pick = async (c: CustomerHit) => {
    setPicked(c);
    setOpen(false);
    setQ('');
    setHistory(null);
    onPick(c);

    // ---- 来店履歴（新システム + AirReserve取込）----
    const items: HistoryItem[] = [];

    // 新システムの予約: 電話一致 or 氏名一致
    const bOrs = [`guest_name.eq.${c.name}`];
    if (c.phone_norm) bOrs.push(`guest_phone_norm.eq.${c.phone_norm}`);
    const { data: books } = await supabase
      .from('app_bookings')
      .select('starts_at, status, treatment_menu_id, staff_id')
      .or(bOrs.join(','))
      .order('starts_at', { ascending: false })
      .limit(10);
    for (const b of (books as { starts_at: string; status: string; treatment_menu_id: string | null; staff_id: string | null }[]) ?? []) {
      const { date, time } = fmt(b.starts_at);
      items.push({
        date, time,
        menu: (b.treatment_menu_id && menuNames.get(b.treatment_menu_id)) || 'メニュー不明',
        staff: (b.staff_id && staffNames.get(b.staff_id)) || '—',
        status: STATUS_LABEL[b.status] ?? b.status,
      });
    }

    // AirReserve取込分: summary が「氏名 / メニュー」形式なので前方一致で引く
    const { data: airs } = await supabase
      .from('airreserve_events')
      .select('starts_at, summary, staff_id')
      .ilike('summary', `${c.name_key} / %`)
      .order('starts_at', { ascending: false })
      .limit(10);
    for (const a of (airs as { starts_at: string; summary: string; staff_id: string | null }[]) ?? []) {
      const { date, time } = fmt(a.starts_at);
      items.push({
        date, time,
        menu: a.summary.split(' / ').slice(1).join(' / ') || a.summary,
        staff: (a.staff_id && staffNames.get(a.staff_id)) || '—',
        status: 'AirReserve',
      });
    }

    items.sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time, 'ja'));
    setHistory(items.slice(0, 6));
  };

  return (
    <div style={{ gridColumn: '1 / -1' }}>
      {/* 検索ボックス */}
      <div className="field" style={{ position: 'relative', marginBottom: picked ? 8 : undefined }}>
        <label className="field-label" htmlFor="nb-cust-search">お客様を検索（2回目以降の方）</label>
        <input
          id="nb-cust-search" type="text" className="input"
          placeholder="苗字・フリガナ・電話番号の一部で検索（例：いわもと／イワモト／090…）"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (hits.length > 0) setOpen(true); }}
          autoComplete="off"
        />
        {open && (
          <div style={{
            position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, marginTop: 4,
            background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden',
          }}>
            {hits.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--sub)' }}>
                該当するお客様が見つかりません。新規の方は下の欄にそのままご入力ください。
              </div>
            ) : hits.map((h) => (
              <button
                key={h.id} type="button"
                onClick={() => pick(h)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                  background: 'none', border: 'none', borderBottom: '1px solid var(--line)',
                  cursor: 'pointer', font: 'inherit',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 14 }}>{h.name}</span>
                {h.name_kana && <span style={{ fontSize: 12, color: 'var(--sub)', marginLeft: 8 }}>{h.name_kana}</span>}
                {h.phone && <span style={{ fontSize: 12, color: 'var(--sub)', marginLeft: 8 }}>{h.phone}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 選択中の表示＋来店履歴 */}
      {picked && (
        <div style={{
          border: '1px solid var(--line)', borderLeft: '4px solid var(--accent)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{picked.name} 様を呼び出しました</span>
            {picked.note && <span style={{ color: 'var(--sub)' }}>メモ: {picked.note}</span>}
            <button
              type="button" className="btn btn-sm btn-secondary"
              onClick={() => { setPicked(null); setHistory(null); }}
              style={{ marginLeft: 'auto' }}
            >表示を閉じる</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 4 }}>来店履歴（直近）</div>
            {history === null ? (
              <div style={{ fontSize: 12, color: 'var(--sub)' }}>読み込み中です…</div>
            ) : history.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--sub)' }}>履歴が見つかりませんでした。</div>
            ) : (
              <table style={{ width: '100%', fontSize: 12.5, borderCollapse: 'collapse' }}>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i} style={{ borderTop: i ? '1px solid var(--line)' : 'none' }}>
                      <td style={{ padding: '4px 8px 4px 0', whiteSpace: 'nowrap' }}>{h.date} {h.time}</td>
                      <td style={{ padding: '4px 8px' }}>{h.menu}</td>
                      <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{h.staff}</td>
                      <td style={{ padding: '4px 0 4px 8px', whiteSpace: 'nowrap', color: 'var(--sub)' }}>{h.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
