import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type StoreId = 'tamashima' | 'kanamitsu';

interface Staff { id: string; full_name: string; }
interface Menu  { id: string; name: string; duration_minutes: number; price: number; }

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const INIT_FORM = {
  storeId: 'tamashima' as StoreId,
  staffId: '',
  menuId: '',
  date: isoToday(),
  time: '10:00',
  guestName: '',
  guestPhone: '',
  guestEmail: '',
  request: '',
  isFirstVisit: false,
};

export function NewBooking() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [menuList, setMenuList]   = useState<Menu[]>([]);
  const [form, setForm]           = useState(INIT_FORM);
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('id, full_name').eq('role', 'staff').order('full_name'),
      supabase.from('treatment_menus').select('id, name, duration_minutes, price')
        .eq('is_active', true).order('sort_order'),
    ]).then(([s, m]) => {
      if (s.data) setStaffList(s.data as Staff[]);
      if (m.data) setMenuList(m.data as Menu[]);
    });
  }, []);

  const set = <K extends keyof typeof INIT_FORM>(key: K, val: (typeof INIT_FORM)[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const selectedMenu = menuList.find(m => m.id === form.menuId);

  const endTime = (() => {
    if (!selectedMenu || !form.date || !form.time) return null;
    const s = new Date(`${form.date}T${form.time}:00`);
    s.setMinutes(s.getMinutes() + selectedMenu.duration_minutes);
    return s.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.guestName.trim()) { setError('お名前を入力してください'); return; }
    if (!form.guestPhone.trim()) { setError('電話番号を入力してください'); return; }
    if (!form.menuId) { setError('メニューを選択してください'); return; }

    const startsAt = new Date(`${form.date}T${form.time}:00`);
    const duration = selectedMenu?.duration_minutes ?? 60;
    const endsAt   = new Date(startsAt.getTime() + duration * 60 * 1000);

    setLoading(true); setError(null);

    // AirReserve取込予約との重複チェック
    // （app_bookings同士のEXCLUDE制約ではAirReserve側の重複は防げないため、保存前に確認する）
    // 重複条件: 既存.starts_at < 新規.ends_at AND 既存.ends_at > 新規.starts_at（[starts, ends) 区間）
    let airQ = supabase
      .from('airreserve_events')
      .select('id, staff_id, starts_at, ends_at')
      .eq('store_id', form.storeId)
      .lt('starts_at', endsAt.toISOString())
      .gt('ends_at', startsAt.toISOString());
    if (form.staffId) airQ = airQ.eq('staff_id', form.staffId);

    const { data: airOverlaps, error: airErr } = await airQ;

    if (airErr) {
      setLoading(false);
      setError(`エラー: AirReserve予約の重複確認に失敗しました（${airErr.message}）`);
      return;
    }
    if (form.staffId && (airOverlaps?.length ?? 0) > 0) {
      // 指名スタッフのAirReserve予約と重なる → 保存をブロック
      setLoading(false);
      setError('この時間帯はAirReserveの予約と重複しています。別の時間を選んでください。');
      return;
    }
    if (!form.staffId && (airOverlaps?.length ?? 0) > 0) {
      // 指名なし（未割当）の場合、この店舗の誰かのAirReserve予約と重なる → 警告して確認
      // （このフォームでは自動割当は行われないため、ブロックせず確認のみ）
      const proceed = window.confirm(
        'この時間帯はこの店舗のAirReserveの予約と重複しています。\n担当スタッフが未指定のため、担当を決める際に時間が重なる可能性があります。\nこのまま登録しますか？',
      );
      if (!proceed) {
        setLoading(false);
        return;
      }
    }

    const { error: err } = await supabase.from('app_bookings').insert({
      store_id:           form.storeId,
      treatment_menu_id:  form.menuId,
      staff_id:           form.staffId || null,
      starts_at:          startsAt.toISOString(),
      ends_at:            endsAt.toISOString(),
      guest_name:         form.guestName.trim(),
      guest_phone:        form.guestPhone.trim(),
      guest_phone_norm:   form.guestPhone.replace(/\D/g, ''),
      guest_email:        form.guestEmail.trim() || null,
      customer_request:   form.request.trim() || null,
      status:             'confirmed',
      source:             'staff',
      created_by:         'staff',
      is_first_visit:     form.isFirstVisit,
      deposit_status:     'none',
      payment_status:     'not_required',
    });

    setLoading(false);

    if (err) {
      if (err.code === '23P01') {
        setError('この時間帯はすでに予約が入っています。別の時間を選んでください。');
      } else {
        setError(`エラー: ${err.message}`);
      }
      return;
    }

    setSuccess(true);
    setForm(f => ({
      ...INIT_FORM,
      storeId: f.storeId,
      staffId: f.staffId,
      menuId:  f.menuId,
      date:    f.date,
      time:    f.time,
    }));
    setTimeout(() => setSuccess(false), 4000);
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 24px', fontSize: 22, fontWeight: 700, color: '#C3003A' }}>
        手動予約入力
      </h2>

      {success && (
        <div style={{
          padding: '12px 16px', background: '#E8F5E9', border: '1px solid #A5D6A7',
          borderRadius: 8, marginBottom: 20, color: '#2E7D32', fontWeight: 600, fontSize: 14,
        }}>
          ✅ 予約を登録しました
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
        {/* 予約情報 */}
        <Card title="予約情報">
          <Grid2>
            <Field label="店舗 *">
              <select style={sel} value={form.storeId} onChange={e => set('storeId', e.target.value as StoreId)}>
                <option value="tamashima">玉島店</option>
                <option value="kanamitsu">金光店</option>
              </select>
            </Field>

            <Field label="担当スタッフ">
              <select style={sel} value={form.staffId} onChange={e => set('staffId', e.target.value)}>
                <option value="">指名なし</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </Field>

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="メニュー *">
                <select style={sel} value={form.menuId} onChange={e => set('menuId', e.target.value)}>
                  <option value="">選択してください</option>
                  {menuList.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}（{m.duration_minutes}分 / ¥{m.price.toLocaleString()}）
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="日付 *">
              <input type="date" style={inp} value={form.date} onChange={e => set('date', e.target.value)} />
            </Field>

            <Field label="開始時刻 *">
              <input type="time" style={inp} value={form.time} onChange={e => set('time', e.target.value)} step="600" />
            </Field>
          </Grid2>

          {endTime && (
            <div style={{
              marginTop: 12, padding: '8px 14px', background: '#F5F5F7',
              borderRadius: 8, fontSize: 13, color: '#666',
            }}>
              終了予定: <strong>{endTime}</strong>（{selectedMenu?.duration_minutes}分）
            </div>
          )}
        </Card>

        {/* お客様情報 */}
        <Card title="お客様情報">
          <Grid2>
            <Field label="お名前 *">
              <input
                type="text" style={inp} placeholder="山田 花子"
                value={form.guestName} onChange={e => set('guestName', e.target.value)}
              />
            </Field>
            <Field label="電話番号 *">
              <input
                type="tel" style={inp} placeholder="090-1234-5678"
                value={form.guestPhone} onChange={e => set('guestPhone', e.target.value)}
              />
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="メールアドレス">
                <input
                  type="email" style={inp} placeholder="example@email.com"
                  value={form.guestEmail} onChange={e => set('guestEmail', e.target.value)}
                />
              </Field>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="備考・要望">
                <textarea
                  style={{ ...inp, height: 80, resize: 'vertical' }}
                  placeholder="お客様からの要望やスタッフメモ"
                  value={form.request} onChange={e => set('request', e.target.value)}
                />
              </Field>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={form.isFirstVisit}
                  onChange={e => set('isFirstVisit', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: '#E84C4C' }}
                />
                <span>初回・新規のお客様</span>
                <span style={{
                  fontSize: 11, background: '#E84C4C', color: '#fff',
                  padding: '1px 7px', borderRadius: 10, fontWeight: 700,
                }}>初回</span>
                <span style={{ fontSize: 12, color: '#999' }}>（予約一覧の上部に表示されます）</span>
              </label>
            </div>
          </Grid2>
        </Card>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%', padding: 14, background: '#C3003A', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            letterSpacing: 0.5,
          }}
        >
          {loading ? '登録中…' : '予約を登録する'}
        </button>
      </form>
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
