import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// メニュー管理（管理者のみ）
//   メニューの追加・編集・有効/無効・限定(非公開)設定ができる。
//   追加すると予約URL（/menu/{slug}）が自動発行され、そのままコピーして使える。

const BOOKING_BASE = 'https://booking.moveact.net';

type StoreId = 'tamashima' | 'kanamitsu';
const STORES: StoreId[] = ['tamashima', 'kanamitsu'];
const STORE_NAMES: Record<StoreId, string> = { tamashima: '玉島店', kanamitsu: '金光店' };

// 施術種別（スタッフのスキル判定に使われるため、既定の種別から選ぶ）
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'seitai', label: '整体' },
  { value: 'biyou_hari', label: '美容鍼' },
  { value: 'pilates', label: 'ピラティス' },
  { value: 'reflexology', label: '足つぼ' },
  { value: 'group_pilates', label: 'グループピラティス' },
];
const typeLabel = (t: string) => TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;

interface MenuRow {
  id: string;
  treatment_type: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  is_unlisted: boolean;
  booking_slug: string | null;
  sort_order: number | null;
}
interface StoreLink { store_id: string; treatment_menu_id: string; }

interface FormState {
  name: string;
  treatmentType: string;
  durationMinutes: number;
  price: number;
  description: string;
  stores: Record<StoreId, boolean>;
  isUnlisted: boolean;
  isActive: boolean;
}
const EMPTY_FORM: FormState = {
  name: '', treatmentType: 'seitai', durationMinutes: 45, price: 3980, description: '',
  stores: { tamashima: false, kanamitsu: false }, isUnlisted: false, isActive: true,
};

export function MenuManager() {
  const [menus, setMenus] = useState<MenuRow[]>([]);
  const [links, setLinks] = useState<StoreLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<MenuRow | 'new' | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [m, l] = await Promise.all([
      supabase.from('treatment_menus').select('id, treatment_type, name, description, duration_minutes, price, is_active, is_unlisted, booking_slug, sort_order').order('sort_order'),
      supabase.from('store_treatment_menus').select('store_id, treatment_menu_id').eq('is_available', true),
    ]);
    if (m.error || l.error) { setError('メニューの読み込みに失敗しました。'); setMenus([]); setLinks([]); }
    else { setMenus((m.data as MenuRow[]) ?? []); setLinks((l.data as StoreLink[]) ?? []); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const storesOf = useCallback((menuId: string): StoreId[] =>
    STORES.filter((s) => links.some((l) => l.treatment_menu_id === menuId && l.store_id === s)), [links]);

  const flash = (msg: string) => { setSuccess(msg); window.setTimeout(() => setSuccess((s) => (s === msg ? null : s)), 3500); };

  const copy = async (url: string, key: string) => {
    try { await navigator.clipboard.writeText(url); }
    catch {
      const ta = document.createElement('textarea'); ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch { /* noop */ } document.body.removeChild(ta);
    }
    setCopied(key); window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
  };

  const toggleActive = async (m: MenuRow) => {
    const { error: e } = await supabase.from('treatment_menus').update({ is_active: !m.is_active }).eq('id', m.id);
    if (e) { window.alert(`エラー: ${e.message}`); return; }
    flash(!m.is_active ? 'メニューを公開しました' : 'メニューを非公開（無効）にしました');
    load();
  };

  const sorted = useMemo(() => menus, [menus]);

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-title">メニュー管理</h2>
        <p className="page-help">
          お客様が予約できるメニューを追加・編集できます。追加すると<strong>そのメニュー専用の予約URL（/menu/…）が自動で発行</strong>され、コピーしてお客様に送れます。
          「限定メニュー」にすると通常の予約ページには表示されず、専用URLからだけ予約できます（スレッズ限定など）。
        </p>
      </div>

      {success && <div className="note" style={{ background: 'var(--green-weak)', color: 'var(--green)', marginBottom: 16 }}>{success}</div>}
      {error && <div className="note" style={{ background: 'var(--red-weak)', color: 'var(--red)', marginBottom: 16 }}>{error}</div>}

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>＋ 新しいメニューを追加</button>
      </div>

      {loading ? (
        <div className="card"><div className="empty">読み込み中です…</div></div>
      ) : sorted.length === 0 ? (
        <div className="card"><div className="empty">メニューがありません。「新しいメニューを追加」から登録できます。</div></div>
      ) : (
        <div className="card card-pad">
          {sorted.map((m) => {
            const url = m.booking_slug ? `${BOOKING_BASE}/menu/${m.booking_slug}` : null;
            return (
              <div key={m.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line)', opacity: m.is_active ? 1 : 0.55 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</span>
                  {m.is_unlisted && <span className="badge" style={{ background: 'var(--accent-weak)', color: 'var(--accent)' }}>限定・非公開</span>}
                  {!m.is_active && <span className="badge badge-gray">無効</span>}
                  <span style={{ fontSize: 12.5, color: 'var(--sub)' }}>{typeLabel(m.treatment_type)} / {m.duration_minutes}分 / ¥{m.price.toLocaleString()}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--sub)' }}>{storesOf(m.id).map((s) => STORE_NAMES[s]).join('・') || '（提供店舗なし）'}</span>
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-sm" onClick={() => setEditing(m)}>編集</button>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => toggleActive(m)}>{m.is_active ? '無効にする' : '公開する'}</button>
                  </span>
                </div>
                {url && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                    <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: 'var(--accent)', wordBreak: 'break-all', textDecoration: 'none' }}>{url}</a>
                    <button type="button" className={`btn btn-sm${copied === m.id ? '' : ' btn-primary'}`} onClick={() => copy(url, m.id)} style={{ whiteSpace: 'nowrap' }}>
                      {copied === m.id ? '✓ コピー済み' : 'リンクをコピー'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <MenuEditModal
          menu={editing === 'new' ? null : editing}
          initialStores={editing === 'new' ? [] : storesOf(editing.id)}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { setEditing(null); flash(msg); load(); }}
        />
      )}
    </div>
  );
}

function MenuEditModal({ menu, initialStores, onClose, onSaved }: {
  menu: MenuRow | null;
  initialStores: StoreId[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const isNew = !menu;
  const [f, setF] = useState<FormState>(() => menu ? {
    name: menu.name, treatmentType: menu.treatment_type, durationMinutes: menu.duration_minutes,
    price: menu.price, description: menu.description ?? '',
    stores: { tamashima: initialStores.includes('tamashima'), kanamitsu: initialStores.includes('kanamitsu') },
    isUnlisted: menu.is_unlisted, isActive: menu.is_active,
  } : EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setError(null);
    if (!f.name.trim()) { setError('メニュー名を入力してください'); return; }
    if (f.durationMinutes <= 0) { setError('所要時間を入力してください'); return; }
    if (f.price < 0) { setError('料金を正しく入力してください'); return; }
    const chosenStores = STORES.filter((s) => f.stores[s]);
    if (chosenStores.length === 0) { setError('提供する店舗を1つ以上選んでください'); return; }

    setSaving(true);
    const payload = {
      treatment_type: f.treatmentType,
      name: f.name.trim(),
      description: f.description.trim() || null,
      duration_minutes: f.durationMinutes,
      price: f.price,
      is_active: f.isActive,
      is_unlisted: f.isUnlisted,
    };

    let menuId = menu?.id;
    if (isNew) {
      const { data, error: e } = await supabase.from('treatment_menus')
        .insert({ ...payload, sort_order: 200 })
        .select('id').single();
      if (e || !data) { setSaving(false); setError(`保存に失敗しました（${e?.message ?? '不明'}）`); return; }
      menuId = (data as { id: string }).id;
    } else {
      const { error: e } = await supabase.from('treatment_menus').update(payload).eq('id', menu!.id);
      if (e) { setSaving(false); setError(`保存に失敗しました（${e.message}）`); return; }
    }

    // 提供店舗の同期: いったん全削除→選択店舗を登録（子テーブル無しで安全）
    await supabase.from('store_treatment_menus').delete().eq('treatment_menu_id', menuId!);
    if (chosenStores.length > 0) {
      const rows = chosenStores.map((s) => ({ store_id: s, treatment_menu_id: menuId!, is_available: true }));
      const { error: le } = await supabase.from('store_treatment_menus').insert(rows);
      if (le) { setSaving(false); setError(`店舗の紐付けに失敗しました（${le.message}）`); return; }
    }

    setSaving(false);
    onSaved(isNew ? 'メニューを追加しました。予約リンクが発行されました。' : 'メニューを更新しました。');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(520px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head" style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{isNew ? '新しいメニューを追加' : 'メニューを編集'}</span>
          <button type="button" onClick={onClose} aria-label="閉じる" style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: 'var(--sub)' }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto' }}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label className="field-label">メニュー名</label>
            <input className="input" placeholder="例）【スレッズ限定】整体 45分" value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label className="field-label">種別</label>
              <select className="select" value={f.treatmentType} onChange={(e) => set('treatmentType', e.target.value)}>
                {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">所要時間（分）</label>
              <input className="input" type="number" min={5} step={5} value={f.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value))} />
            </div>
            <div className="field">
              <label className="field-label">料金（円）</label>
              <input className="input" type="number" min={0} step={10} value={f.price} onChange={(e) => set('price', Number(e.target.value))} />
            </div>
            <div className="field">
              <label className="field-label">提供する店舗</label>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', height: 38 }}>
                {STORES.map((s) => (
                  <label key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13.5 }}>
                    <input type="checkbox" checked={f.stores[s]} onChange={(e) => set('stores', { ...f.stores, [s]: e.target.checked })} />
                    {STORE_NAMES[s]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="field-label">説明（任意）</label>
            <textarea className="textarea" style={{ height: 60, resize: 'vertical' }} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="お客様に表示される説明文" />
          </div>

          <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
              <input type="checkbox" checked={f.isUnlisted} onChange={(e) => set('isUnlisted', e.target.checked)} />
              <span><strong>限定メニューにする（一般の予約ページに表示しない）</strong></span>
            </label>
            <p style={{ fontSize: 12, color: 'var(--sub)', margin: '6px 0 0', lineHeight: 1.6 }}>
              チェックすると、このメニューは通常の予約ページには出ず、<strong>専用URLを受け取った人だけ</strong>が予約できます（スレッズ限定など）。
            </p>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5, marginTop: 12 }}>
            <input type="checkbox" checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            公開する（チェックを外すと予約を受け付けません）
          </label>

          {isNew && (
            <p className="note" style={{ marginTop: 12 }}>保存すると、このメニュー専用の予約URLが自動で作られます。作成後に一覧からコピーできます。</p>
          )}
          {error && <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--red-weak)', color: 'var(--red)', borderRadius: 8, fontSize: 13 }}>{error}</div>}
        </div>
        <div className="modal-foot" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>閉じる</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '保存中…' : (isNew ? 'この内容で追加する' : '変更を保存する')}</button>
        </div>
      </div>
    </div>
  );
}
