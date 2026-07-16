// Supabase Edge Function: get-booking-page-data
// =====================================================
// 公開Web予約ページの初期データを返す（認証不要・公開）。
// 入力: { slug? }  — slug があれば担当者指名のプリセット
// 出力:
//   {
//     staff: { id, name, slug, storeIds[] } | null,   // slug該当スタッフ。配属店舗のみ
//     stores: [{ id, name }],                          // 選択可能な店舗（staffありなら配属店のみ）
//     menusByStore: { [storeId]: [{ id, name, durationMinutes, price, treatmentType, description }] }
//   }
// DB/RLSに触れさせないため、公開Web側はこの関数経由のみでデータ取得する。
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const STORE_NAMES: Record<string, string> = { kanamitsu: '金光店', tamashima: '玉島店' };
const ALL_STORES = ['tamashima', 'kanamitsu'];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    let slug = '';
    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      slug = (b.slug ?? '').toString().trim();
    } else {
      slug = new URL(req.url).searchParams.get('slug')?.trim() ?? '';
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 1) slug → スタッフ
    let staff: { id: string; name: string; slug: string; storeIds: string[] } | null = null;
    if (slug) {
      const { data: p } = await supabase
        .from('profiles')
        .select('id, full_name, booking_slug, role')
        .eq('booking_slug', slug)
        .maybeSingle();
      if (p && (p.role === 'staff' || p.role === 'admin')) {
        const { data: ss } = await supabase
          .from('staff_stores')
          .select('store_id')
          .eq('staff_id', p.id)
          .eq('is_active', true);
        const storeIds = (ss ?? []).map((r: { store_id: string }) => r.store_id);
        staff = { id: p.id, name: p.full_name, slug, storeIds };
      }
    }

    // 2) 対象店舗（staffありなら配属店舗、なければ全店）
    const targetStores = staff && staff.storeIds.length > 0 ? staff.storeIds : ALL_STORES;
    const stores = targetStores.map((id) => ({ id, name: STORE_NAMES[id] ?? id }));

    // 3) 店舗別メニュー（store_treatment_menus × treatment_menus, 有効のみ）
    const { data: stm } = await supabase
      .from('store_treatment_menus')
      .select('store_id, treatment_menu_id, is_available')
      .in('store_id', targetStores)
      .eq('is_available', true);

    const menuIds = Array.from(new Set((stm ?? []).map((r: { treatment_menu_id: string }) => r.treatment_menu_id)));
    // select('*') にして image_url 列があれば自動で拾う（後日 image_url を追加しても改修不要）
    const { data: menus } = menuIds.length
      ? await supabase
          .from('treatment_menus')
          .select('*')
          .in('id', menuIds)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
      : { data: [] };

    // 店舗ごとの取扱メニューID集合（提供可否の判定用）
    const availByStore = new Map<string, Set<string>>();
    for (const link of (stm ?? [])) {
      let set = availByStore.get(link.store_id);
      if (!set) { set = new Set(); availByStore.set(link.store_id, set); }
      set.add(link.treatment_menu_id);
    }

    // sort_order順を維持するため、sort済みの menus を外側ループにして各店舗へ配る
    const menusByStore: Record<string, any[]> = {};
    for (const id of targetStores) menusByStore[id] = [];
    for (const m of (menus ?? [])) {
      const payload = {
        id: m.id,
        name: m.name,
        durationMinutes: m.duration_minutes,
        price: m.price,
        treatmentType: m.treatment_type,
        description: m.description,
        imageUrl: m.image_url ?? null,   // 列が無ければ null（後日登録で自動反映）
        requiredStaffSlug: m.required_staff_slug ?? null,   // 指名メニュー（設定時はそのスタッフ固定）
      };
      for (const id of targetStores) {
        if (availByStore.get(id)?.has(m.id)) menusByStore[id].push(payload);
      }
    }

    // 4) 店舗別スタッフ一覧（フロー内の指名選択用）。public_staff_roster は "Anyone can read"。
    const { data: roster } = await supabase
      .from('public_staff_roster')
      .select('staff_id, full_name, store_id')
      .in('store_id', targetStores)
      .order('full_name', { ascending: true });

    // 指名メニュー（required_staff_slug）をフロント側で staff_id に解決できるよう、
    // ロスターに booking_slug を付与する（ビューに列が無いため profiles から引く）。
    // 併せて公式サイト由来の写真/肩書き/紹介文(102)も取得し、指名選択で表示する。
    const rosterIds = Array.from(new Set((roster ?? []).map((r: { staff_id: string }) => r.staff_id)));
    const slugById = new Map<string, string | null>();
    const profById = new Map<string, { photo: string | null; title: string | null; bio: string | null }>();
    if (rosterIds.length) {
      const { data: slugRows } = await supabase
        .from('profiles')
        .select('id, booking_slug, photo_url, staff_title, staff_bio')
        .in('id', rosterIds);
      for (const row of (slugRows ?? [])) {
        const r = row as { id: string; booking_slug: string | null; photo_url: string | null; staff_title: string | null; staff_bio: string | null };
        slugById.set(r.id, r.booking_slug ?? null);
        profById.set(r.id, { photo: r.photo_url ?? null, title: r.staff_title ?? null, bio: r.staff_bio ?? null });
      }
    }

    // 出勤曜日（staff_weekly_schedule）: スタッフ選択・指名メニューの補足表示用。
    // 行が無い店舗は勤務ゲート未使用＝表示なし（フロントはundefined扱い）。
    const { data: sched } = await supabase
      .from('staff_weekly_schedule')
      .select('staff_id, store_id, day_of_week')
      .in('store_id', targetStores);
    const daysByStaffStore = new Map<string, number[]>();
    for (const s of (sched ?? [])) {
      const key = `${(s as { staff_id: string }).staff_id}|${(s as { store_id: string }).store_id}`;
      const arr = daysByStaffStore.get(key) ?? [];
      arr.push((s as { day_of_week: number }).day_of_week);
      daysByStaffStore.set(key, arr);
    }

    // 施術スキル（staff_skills）: 指名リストを選択メニューの施術種別で絞るためフロントへ返す。
    const { data: skills } = rosterIds.length
      ? await supabase.from('staff_skills').select('staff_id, treatment_type').in('staff_id', rosterIds)
      : { data: [] };
    const skillsByStaff = new Map<string, string[]>();
    for (const s of (skills ?? [])) {
      const sid = (s as { staff_id: string }).staff_id;
      const arr = skillsByStaff.get(sid) ?? [];
      arr.push((s as { treatment_type: string }).treatment_type);
      skillsByStaff.set(sid, arr);
    }

    const staffByStore: Record<string, { id: string; name: string; slug: string | null; workDays: number[] | null; photoUrl: string | null; title: string | null; bio: string | null; skills: string[] }[]> = {};
    for (const id of targetStores) staffByStore[id] = [];
    for (const r of (roster ?? [])) {
      const storeId0 = (r as { store_id: string }).store_id;
      const list = staffByStore[storeId0];
      if (list) {
        const staffId = (r as { staff_id: string }).staff_id;
        const days = daysByStaffStore.get(`${staffId}|${storeId0}`) ?? null;
        const prof = profById.get(staffId);
        list.push({
          id: staffId,
          name: (r as { full_name: string }).full_name,
          slug: slugById.get(staffId) ?? null,
          workDays: days ? [...new Set(days)].sort((a, b) => a - b) : null,
          photoUrl: prof?.photo ?? null,
          title: prof?.title ?? null,
          bio: prof?.bio ?? null,
          skills: skillsByStaff.get(staffId) ?? [],
        });
      }
    }

    // その店舗に「担当できるスタッフが1人もいない施術種別」のメニューは出さない。
    // 例: リフレは小宮のみ担当で小宮は金光のみ在籍 → 玉島ではリフレを表示しない
    //     （表示すると選べるのに全枠×＝予約できない行き止まりになるため）。
    const typesByStore: Record<string, Set<string>> = {};
    for (const id of targetStores) typesByStore[id] = new Set();
    for (const r of (roster ?? [])) {
      const sid = (r as { staff_id: string }).staff_id;
      const st = (r as { store_id: string }).store_id;
      for (const tt of (skillsByStaff.get(sid) ?? [])) typesByStore[st]?.add(tt);
    }
    for (const id of targetStores) {
      menusByStore[id] = (menusByStore[id] ?? []).filter((m) => typesByStore[id]?.has(m.treatmentType));
    }

    // 担当者別URL(?staff=)の場合、そのスタッフが担当できる施術のメニューだけに絞る
    // （例: ARISAのURLでは整体・美容鍼メニューを出さない）。
    if (staff) {
      const own = new Set(skillsByStaff.get(staff.id) ?? []);
      if (own.size > 0) {
        for (const id of targetStores) {
          menusByStore[id] = (menusByStore[id] ?? []).filter((m) => own.has(m.treatmentType));
        }
      }
    }

    return json({ staff, stores, menusByStore, staffByStore });
  } catch (e) {
    console.error('get-booking-page-data error:', (e as Error).message);
    return json({ error: 'Internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
