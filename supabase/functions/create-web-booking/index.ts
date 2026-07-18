// Supabase Edge Function: create-web-booking
// =====================================================
// 公開Web予約ページからのゲスト予約を作成（認証不要・公開）。
// service role で実行し、サーバー側で枠を再検証してから挿入する。
// 二重予約は DB の EXCLUDE 制約（migration 066）で物理的に防止し、
// 競合時は slot_taken を返す。
//
// 初回のお客様は事前決済（前金）を促す:
//   ・guest_phone(数字のみ) で過去予約/会員を照合 → 無ければ初回
//   ・初回は deposit_status='pending', deposit_amount=メニュー価格 で仮押さえ
//   ・payment_links（Airペイの金額固定リンク）から該当URLを返す
//
// 指名メニュー: treatment_menus.required_staff_slug が設定されたメニューは
//   profiles.booking_slug(role='staff') で解決したスタッフ固定。
//   クライアントが別の staffId を送ってきたら 400 {code:'invalid'}。
//
// 勤務スケジュールゲート（get-available-slots と整合）:
//   staff_weekly_schedule に店舗の行が1件でもあれば有効化。
//   当該曜日に行が無いスタッフは候補から除外し、行があるスタッフは
//   start_time〜end_time の外側を busy 区間として既存の重なり判定に乗せる。
//   店舗に1行も無ければ従来動作（フォールバック）。
//
// 入力(POST): { storeId, menuId, date, time, staffId?, guestName, guestPhone, guestEmail?, request? }
// 出力: { bookingId, requiresDeposit, depositAmount, paymentUrl } | { error, code }
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendConfirmationEmail } from '../_shared/email.ts';
import { createZoomMeeting } from '../_shared/zoom.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// 許可オリジン（カンマ区切り）。未設定なら '*'（ドメイン確定後に設定推奨）
const ALLOWED_ORIGINS = (Deno.env.get('WEB_BOOKING_ALLOWED_ORIGINS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const BUFFER = 15;            // 前後バッファ（分）
const MAX_OK_GAP = 30;        // すきま時間ブロック: これ以下のギャップはOK
const MIN_FITTABLE_GAP = 75;  // これ以上ならOK
const IP_LIMIT_PER_HOUR = 10; // 同一IPの1時間あたり上限
const PHONE_LIMIT_PER_DAY = 5;// 同一電話の1日あたり上限
const STORE_LIMIT_PER_HOUR = 30; // 店舗単位: 直近60分のWeb予約作成数の総量キャップ（ヘッダ偽装・電話ローテーション対策）
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function corsFor(origin: string | null) {
  let allow = '*';
  if (ALLOWED_ORIGINS.length > 0) {
    allow = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0];
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

serve(async (req) => {
  const cors = corsFor(req.headers.get('origin'));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only', code: 'invalid' }, 405);

  try {
    const b = await req.json().catch(() => ({}));
    const storeId = (b.storeId ?? '').toString();
    const menuId = (b.menuId ?? '').toString();
    const date = (b.date ?? '').toString();
    const time = (b.time ?? '').toString();
    let staffId = (b.staffId ?? '').toString() || null;
    const guestName = (b.guestName ?? '').toString().trim();
    const guestPhone = (b.guestPhone ?? '').toString().trim();
    const guestEmail = (b.guestEmail ?? '').toString().trim();
    const request = (b.request ?? '').toString().trim().slice(0, 1000) || null;
    // 冪等キー（予約1回の試行につき固定。再送信での二重予約を防ぐ）
    const idempotencyKey = (b.idempotencyKey ?? '').toString().trim().slice(0, 100) || null;

    // --- 入力検証 ---
    if (!storeId || !menuId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return json({ error: '入力が正しくありません', code: 'invalid' }, 400);
    }
    const [yy, mm, dd] = date.split('-').map(Number);
    // 月またぎの不正日付(例:2025-02-31, 2099-99-99)を排除（UTC構築で往復検証）
    const probe = new Date(Date.UTC(yy, mm - 1, dd));
    if (probe.getUTCFullYear() !== yy || probe.getUTCMonth() !== mm - 1 || probe.getUTCDate() !== dd) {
      return json({ error: '日付が正しくありません', code: 'invalid' }, 400);
    }
    const [thh, tmm] = time.split(':').map(Number);
    if (thh < 0 || thh > 23 || tmm < 0 || tmm > 59) {
      return json({ error: '時刻が正しくありません', code: 'invalid' }, 400);
    }
    if (!guestName || guestName.length > 50) return json({ error: 'お名前を正しく入力してください', code: 'invalid' }, 400);
    const phoneNorm = guestPhone.replace(/\D/g, '');
    if (phoneNorm.length < 10 || phoneNorm.length > 11) {
      return json({ error: '電話番号を正しく入力してください', code: 'invalid' }, 400);
    }
    if (!guestEmail || !EMAIL_RE.test(guestEmail)) {
      return json({ error: 'メールアドレスを正しく入力してください', code: 'invalid' }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // --- 期限切れの仮押さえ（未払い）を先に解放（pg_cron不在時の保険・枠を正しく開ける）---
    await supabase.rpc('cancel_expired_deposit_holds').then(() => {}, () => {});

    // --- レート制限（IP / 電話 / 店舗総量）---
    // IP取得はヘッダ偽装耐性の高い順に採用する（優先順位）:
    //   1) cf-connecting-ip … Supabase Edge(Cloudflare配下)がエッジで上書き付与する接続元IP。
    //      クライアントが同名ヘッダを送っても信頼プロキシが差し替えるため偽装不可。最優先。
    //   2) x-forwarded-for の「末尾」… 各ホップが自分の見た接続元を末尾に追記する仕様のため、
    //      末尾側ほど最後のホップ（信頼プロキシ）が付けた値。先頭はクライアントが自由に
    //      偽装できるので使わない（従来の先頭採用から変更）。
    //   3) x-real-ip … 一部プロキシが付与する補助ヘッダ。上記2つが無い場合のみ。
    //   いずれも取れなければ 'unknown'（unknown同士で共通の制限を受けるのは許容）。
    const pickClientIp = (): string => {
      const cf = (req.headers.get('cf-connecting-ip') ?? '').trim();
      if (cf) return cf;
      const xffParts = (req.headers.get('x-forwarded-for') ?? '')
        .split(',').map((s) => s.trim()).filter(Boolean);
      if (xffParts.length > 0) return xffParts[xffParts.length - 1];
      const real = (req.headers.get('x-real-ip') ?? '').trim();
      if (real) return real;
      return 'unknown';
    };
    const ip = pickClientIp();
    const since1h = new Date(Date.now() - 3600_000).toISOString();
    const since24h = new Date(Date.now() - 86_400_000).toISOString();
    const [{ count: ipCount }, { count: phoneCount }, { count: storeHourCount }] = await Promise.all([
      supabase.from('web_booking_rate_limit').select('id', { count: 'exact', head: true })
        .eq('ip', ip).gte('created_at', since1h),
      supabase.from('web_booking_rate_limit').select('id', { count: 'exact', head: true })
        .eq('phone_norm', phoneNorm).gte('created_at', since24h),
      // 店舗単位の総量キャップ: ヘッダ偽装や電話番号ローテーションでIP/電話の個別制限を
      // すり抜けられても、この店舗で直近60分に「作成された」Web予約(source='web')の総数で
      // 止める最後の砦。status は問わない（キャンセル済みも作成実績として数える）。
      // 判定は created_at（作成時刻）ベース。
      supabase.from('app_bookings').select('id', { count: 'exact', head: true })
        .eq('store_id', storeId).eq('source', 'web').gte('created_at', since1h),
    ]);
    if ((storeHourCount ?? 0) >= STORE_LIMIT_PER_HOUR) {
      return json({ error: '現在アクセスが集中しています。しばらくしてからお試しください', code: 'rate_limited' }, 429);
    }
    if ((ipCount ?? 0) >= IP_LIMIT_PER_HOUR || (phoneCount ?? 0) >= PHONE_LIMIT_PER_DAY) {
      return json({ error: 'ご予約の回数が上限に達しました。しばらくしてからお試しください。', code: 'rate_limited' }, 429);
    }
    // 試行を記録 + 古いログを掃除（ベストエフォート）
    await supabase.from('web_booking_rate_limit').insert({ ip, phone_norm: phoneNorm });
    supabase.from('web_booking_rate_limit').delete().lt('created_at', since24h).then(() => {});

    // --- メニュー ---
    const { data: menu } = await supabase
      .from('treatment_menus').select('duration_minutes, name, price, required_staff_slug, treatment_type')
      .eq('id', menuId).eq('is_active', true).single();
    if (!menu) return json({ error: 'メニューが見つかりません', code: 'invalid' }, 404);
    const duration = menu.duration_minutes as number;
    const treatmentType = (menu as { treatment_type?: string }).treatment_type ?? null;

    // --- 店舗で提供されているメニューか ---
    const { data: stm } = await supabase
      .from('store_treatment_menus')
      .select('store_id').eq('store_id', storeId).eq('treatment_menu_id', menuId).eq('is_available', true).maybeSingle();
    if (!stm) return json({ error: 'この店舗では受付できないメニューです', code: 'invalid' }, 400);

    // --- 指名メニュー（required_staff_slug）---
    //   設定されている場合は profiles.booking_slug でスタッフを解決し、そのスタッフ固定の
    //   指名予約として扱う（is_staff_nominated=true）。別の staffId 指定は 400。
    const requiredSlug = (menu.required_staff_slug as string | null) ?? null;
    if (requiredSlug) {
      const { data: reqStaff, error: reqErr } = await supabase
        .from('profiles').select('id')
        .eq('booking_slug', requiredSlug).eq('role', 'staff').single();
      if (reqErr || !reqStaff) {
        console.error('required_staff_slug unresolved:', requiredSlug, reqErr?.message ?? 'no row');
        return json({ error: 'このメニューは現在受付できません', code: 'invalid' }, 400);
      }
      if (staffId && staffId !== reqStaff.id) {
        return json({ error: 'このメニューは担当固定です', code: 'invalid' }, 400);
      }
      staffId = reqStaff.id as string;
    }

    // --- 営業時間 / 休業日 ---
    // 曜日はサーバーローカルTZ(Supabase EdgeはUTC)に依存させないため、
    // 既に解析済みの yy/mm/dd から UTC で曜日を求める（+09:00文字列のgetDay()は日ズレの恐れ）。
    const dow = new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
    const { data: closed } = await supabase
      .from('store_closed_days').select('*').eq('store_id', storeId).eq('date', date).maybeSingle();
    let openMin: number | null = null, closeMin: number | null = null;
    if (closed) {
      if (closed.is_closed) return json({ error: '休業日です', code: 'closed' }, 409);
      if (closed.open_time && closed.close_time) { openMin = toMin(closed.open_time); closeMin = toMin(closed.close_time); }
    }
    if (openMin === null) {
      const { data: bh } = await supabase
        .from('store_business_hours').select('*').eq('store_id', storeId).eq('day_of_week', dow).maybeSingle();
      if (!bh || bh.is_closed || !bh.open_time || !bh.close_time) {
        return json({ error: '休業日です', code: 'closed' }, 409);
      }
      openMin = toMin(bh.open_time); closeMin = toMin(bh.close_time);
    }

    const slotStart = toMin(time);
    const slotEnd = slotStart + duration;
    // 画面は15分グリッドのみ提示。直接POSTでの中途半端な時刻（10:07等）を防ぐ
    if (slotStart % 15 !== 0) {
      return json({ error: '予約時刻は15分単位で指定してください', code: 'invalid' }, 400);
    }
    if (slotStart < openMin! || slotEnd > closeMin!) {
      return json({ error: '営業時間外です', code: 'closed' }, 409);
    }

    // --- 過去日時の拒否 ---
    const base = new Date(`${date}T00:00:00+09:00`).getTime();
    const nowJst = Math.round((Date.now() - base) / 60000);
    if (nowJst >= 0 && nowJst <= 1440 && slotStart <= nowJst) {
      return json({ error: '過去の時刻は予約できません', code: 'slot_taken' }, 409);
    }
    // 上記は当日枠のみ対象。直接POSTで過去日を渡された場合に備え、
    // スロット開始の絶対時刻(JST基準のbase + slotStart分)が未来でなければ無条件で拒否する。
    const startEpoch = base + slotStart * 60000;
    if (startEpoch <= Date.now()) {
      return json({ error: '過去の時刻は予約できません', code: 'slot_taken' }, 409);
    }

    // --- 受付締切（店舗設定 stores.booking_lead_minutes: 開始N分前までネット予約可）---
    // 画面には締切後の枠は出ないが、直接POST・画面表示後の時間経過に備えてここでも拒否する。
    // 取得エラー時は締切なしに倒さずエラーを返す（フェイルクローズ）。
    const { data: leadRow, error: leadErr } = await supabase
      .from('stores').select('booking_lead_minutes').eq('id', storeId).maybeSingle();
    if (leadErr) {
      console.error('create-web-booking: stores取得失敗:', leadErr.message);
      return json({ error: '受付設定の確認に失敗しました。時間をおいてお試しください。', code: 'invalid' }, 500);
    }
    const leadMin = (leadRow as { booking_lead_minutes?: number | null } | null)?.booking_lead_minutes ?? 0;
    if (leadMin > 0 && startEpoch <= Date.now() + leadMin * 60000) {
      const h = Math.floor(leadMin / 60), m = leadMin % 60;
      const leadLabel = h === 0 ? `${m}分` : m === 0 ? `${h}時間` : `${h}時間${m}分`;
      return json({
        error: `ネット予約はご来店の${leadLabel}前まで受け付けています。お急ぎの場合はお電話でお問い合わせください。`,
        code: 'slot_taken',
      }, 409);
    }
    // 受付は本日〜180日先まで（JSTの今日0時起点で判定）。
    const jstTodayMidnight = (() => {
      const now = new Date();
      const jstNow = new Date(now.getTime() + 9 * 3600_000);
      return Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate()) - 9 * 3600_000;
    })();
    if (base - jstTodayMidnight > 180 * 86_400_000) {
      return json({ error: '予約できる期間を超えています', code: 'invalid' }, 400);
    }

    // --- ロスター ---
    //   ロスター未設定の全スタッフフォールバックは廃止（get-available-slots と整合）。
    //   未設定＝受付できない設定ミスとして扱い、slot_taken で閉じる。
    const { data: roster } = await supabase
      .from('staff_stores').select('staff_id').eq('store_id', storeId).eq('is_active', true);
    let staffIds: string[] = (roster ?? []).map((r: { staff_id: string }) => r.staff_id);
    if (staffIds.length === 0) {
      console.error('staff roster empty for store:', storeId);
      return json({ error: 'この枠は埋まってしまいました。別の時間をお選びください。', code: 'slot_taken' }, 409);
    }

    // --- スキル(施術種別)フィルタ ---
    //   メニューの施術種別を担当できるスタッフだけを候補に残す。
    //   指名メニュー(required_staff_slug)はその担当が施術可能な前提のためスキップ。
    if (treatmentType && !requiredSlug) {
      const { data: skillRows } = await supabase
        .from('staff_skills').select('staff_id').eq('treatment_type', treatmentType);
      const skilled = new Set((skillRows ?? []).map((r: { staff_id: string }) => r.staff_id));
      if (staffId && !skilled.has(staffId)) {
        return json({ error: 'ご指名の担当者はこのメニューを承っておりません', code: 'invalid' }, 400);
      }
      staffIds = staffIds.filter((id) => skilled.has(id));
      if (staffIds.length === 0) {
        return json({ error: 'この枠は埋まってしまいました。別の時間をお選びください。', code: 'slot_taken' }, 409);
      }
    }

    if (staffId) {
      if (!staffIds.includes(staffId)) {
        return json({ error: '指名スタッフはこの店舗で受付していません', code: 'invalid' }, 400);
      }
      staffIds = [staffId];
    }

    // --- 当日の予約・ブロック＋週間勤務スケジュール ---
    const dayStart = `${date}T00:00:00+09:00`;
    const dayEnd = `${date}T23:59:59+09:00`;
    const [{ data: bookings }, { data: unavail }, { data: airEvents }, { data: weeklyRows }] = await Promise.all([
      supabase.from('app_bookings')
        .select('staff_id, starts_at, ends_at, buffer_before, buffer_after')
        .eq('store_id', storeId).neq('status', 'cancelled')
        .gte('starts_at', dayStart).lte('starts_at', dayEnd),
      supabase.from('staff_unavailability')
        .select('staff_id, starts_at, ends_at, block_type')
        .eq('store_id', storeId)
        .lte('starts_at', dayEnd).gte('ends_at', dayStart),
      // AirReserve外部予約(migration 018)も空き判定を塞ぐ。同日ウィンドウで取得。
      // summary は「予定」「入れ替え時間」等の内部ブロック判別に使う（店舗占有から除外）
      supabase.from('airreserve_events')
        .select('staff_id, starts_at, ends_at, summary')
        .eq('store_id', storeId)
        .lte('starts_at', dayEnd).gte('ends_at', dayStart),
      // 週間勤務スケジュール（店舗の全行）。1行でもあればゲート有効。
      supabase.from('staff_weekly_schedule')
        .select('staff_id, day_of_week, start_time, end_time')
        .eq('store_id', storeId),
    ]);
    // グループレッスン: 開催中は店舗全体を占有（キャパ1のため個別予約を受けない）
    const { data: groupLessons } = await supabase.from('group_lessons')
      .select('starts_at, ends_at')
      .eq('store_id', storeId)
      .eq('is_cancelled', false)
      .lte('starts_at', dayEnd).gte('ends_at', dayStart);

    // --- 勤務スケジュールゲート（get-available-slots と整合）---
    //   店舗に行が1件でもあれば有効化。当該曜日に行が無いスタッフは候補から除外。
    //   行があるスタッフの勤務時間窓は、後段で「窓の外側= busy 区間」として合算する。
    const scheduleActive = (weeklyRows ?? []).length > 0;
    const workWindow = new Map<string, { start: number; end: number }>();
    if (scheduleActive) {
      for (const w of (weeklyRows ?? [])) {
        if (w.day_of_week === dow) {
          workWindow.set(w.staff_id as string, { start: toMin(w.start_time), end: toMin(w.end_time) });
        }
      }
      staffIds = staffIds.filter((id) => workWindow.has(id));
      if (staffIds.length === 0) {
        // 指名スタッフがその曜日に勤務しない／その曜日の出勤者がいない
        return json({ error: 'この時間はご案内できません。別の時間をお選びください。', code: 'slot_taken' }, 409);
      }
    }

    const jstMin = (iso: string) => Math.round((new Date(iso).getTime() - base) / 60000);
    const bufStart = slotStart - BUFFER, bufEnd = slotEnd + BUFFER;

    interface Busy { start: number; end: number; }
    const busyByStaff = new Map<string, Busy[]>();
    const ensure = (id: string) => { if (!busyByStaff.has(id)) busyByStaff.set(id, []); return busyByStaff.get(id)!; };
    const unassigned: Busy[] = [];
    for (const bk of (bookings ?? [])) {
      const iv = { start: jstMin(bk.starts_at) - (bk.buffer_before ?? BUFFER), end: jstMin(bk.ends_at) + (bk.buffer_after ?? BUFFER) };
      if (bk.staff_id && staffIds.includes(bk.staff_id)) ensure(bk.staff_id).push(iv);
      else if (!bk.staff_id) unassigned.push(iv); // staff_id無し(おまかせ未確定)のみ未割当扱い
    }
    for (const u of (unavail ?? [])) {
      if (u.staff_id && staffIds.includes(u.staff_id)) ensure(u.staff_id).push({ start: jstMin(u.starts_at), end: jstMin(u.ends_at) });
    }
    // AirReserve外部予約: 同一スタッフのapp_bookingと同じ扱い。
    //   staff_id が設定され有効スタッフなら、そのスタッフをBUFFER付きで占有。
    //   staff_id 無しはどのスタッフか特定できないため未割当予約として空きを1人消費。
    //   すきま時間ロジック用に、素の区間もrealBusyへ足す。
    for (const ev of (airEvents ?? [])) {
      const s = jstMin(ev.starts_at), e = jstMin(ev.ends_at);
      if (ev.staff_id && staffIds.includes(ev.staff_id)) {
        ensure(ev.staff_id).push({ start: s - BUFFER, end: e + BUFFER });
      } else if (!ev.staff_id) {
        unassigned.push({ start: s - BUFFER, end: e + BUFFER });
      }
    }
    // 勤務スケジュールゲート: 勤務時間窓の外側を busy 区間として合算し、
    // 既存の重なり判定（バッファ込み）にそのまま乗せる（get-available-slots と同一）。
    if (scheduleActive) {
      for (const id of staffIds) {
        const w = workWindow.get(id)!;
        // 番兵はBUFFER分外側へシフト（get-available-slotsと同一式）。
        // 判定側が bufStart/bufEnd(±15分)で重なりを見るため、シフトしないと
        // シフト先頭/末尾ちょうどの枠（09:00開始・21:00終了・三上の06:30等）が
        // 「グリッドには出るのに予約すると409」になる。
        ensure(id).push({ start: -100000, end: w.start - BUFFER });
        ensure(id).push({ start: w.end + BUFFER, end: 100000 });
      }
    }

    // --- 店舗キャパシティ = 同時1件（2026-07-15 オーナー決定）---
    //   担当スタッフに関わらず、店舗内にお客様のご予約が1件でもあれば不可。
    //   「入れ替え時間」（AirReserve取込・管理画面登録とも）も店舗全体を塞ぐ。
    //   「予定」は当該スタッフのみ＝他スタッフの予約と重なってOK。
    //   get-available-slots の表示判定と同一ソース・同一バッファで揃える。
    //   （最後の砦としてDB制約 one_booking_per_store_at_a_time も併設・migration 111）
    //   ※30分以上の「入れ替え時間」は「予定」と同じスタッフのみ扱い
    //     （オーナー指示 2026-07-15。migration 113でデータ側も変換済み）。
    const STAFF_ONLY_AIR_BLOCKS = ['予定'];
    const AIR_CHANGEOVER = '入れ替え時間';
    const CHANGEOVER_STORE_BLOCK_UNDER_MIN = 30;   // これ未満の入れ替えのみ店舗全体を塞ぐ
    const storeBusy: Busy[] = [];
    for (const bk of (bookings ?? [])) {
      storeBusy.push({ start: jstMin(bk.starts_at) - (bk.buffer_before ?? BUFFER), end: jstMin(bk.ends_at) + (bk.buffer_after ?? BUFFER) });
    }
    for (const ev of (airEvents ?? [])) {
      const sm = ((ev as { summary?: string | null }).summary ?? '').trim();
      if (STAFF_ONLY_AIR_BLOCKS.includes(sm)) continue;
      const s = jstMin(ev.starts_at), e = jstMin(ev.ends_at);
      if (sm === AIR_CHANGEOVER) {
        if (e - s < CHANGEOVER_STORE_BLOCK_UNDER_MIN) storeBusy.push({ start: s, end: e });   // 区間そのものがバッファ＝追加なし
      } else {
        storeBusy.push({ start: s - BUFFER, end: e + BUFFER });
      }
    }
    // 管理画面から登録された「入れ替え時間」(block_type='changeover')も同じ30分ルール
    for (const u of (unavail ?? [])) {
      if ((u as { block_type?: string | null }).block_type === 'changeover') {
        const s = jstMin(u.starts_at), e = jstMin(u.ends_at);
        if (e - s < CHANGEOVER_STORE_BLOCK_UNDER_MIN) storeBusy.push({ start: s, end: e });
      }
    }
    for (const gl of (groupLessons ?? [])) {
      storeBusy.push({ start: jstMin(gl.starts_at) - BUFFER, end: jstMin(gl.ends_at) + BUFFER });
    }
    if (storeBusy.some((x) => bufStart < x.end && bufEnd > x.start)) {
      return json({ error: 'この枠は埋まってしまいました。別の時間をお選びください。', code: 'slot_taken' }, 409);
    }

    // --- 空きスタッフを特定 ---
    const freeStaffIds = staffIds.filter((id) => {
      const intervals = busyByStaff.get(id) ?? [];
      return !intervals.some((x) => bufStart < x.end && bufEnd > x.start);
    });
    // 指名なし時のみ、未割当予約が空きを消費（指名時は無関係）
    const overlappingUnassigned = staffId ? 0 : unassigned.filter((x) => bufStart < x.end && bufEnd > x.start).length;
    const effectiveFree = freeStaffIds.length - overlappingUnassigned;
    if (effectiveFree <= 0 || freeStaffIds.length === 0) {
      return json({ error: 'この枠は埋まってしまいました。別の時間をお選びください。', code: 'slot_taken' }, 409);
    }

    // --- すきま時間ブロック（get-available-slots のスタッフ別判定と同一）---
    //   「そのスタッフ自身の」実予約(app_bookings)＋AirReserve外部予約（素の区間）
    //   ＋担当未定の予約（店舗共有）だけを見て中途半端な空き(31〜74分)を弾く。
    //   店舗横断で合算すると、他スタッフの予約が作る隙間で
    //   本来空いているスタッフの枠まで409になってしまう（グリッドとの不一致）。
    const realBusyByStaff = new Map<string, Busy[]>();
    const ensureReal = (id: string) => { if (!realBusyByStaff.has(id)) realBusyByStaff.set(id, []); return realBusyByStaff.get(id)!; };
    const unassignedReal: Busy[] = [];
    for (const bk of (bookings ?? [])) {
      const iv = { start: jstMin(bk.starts_at), end: jstMin(bk.ends_at) };
      if (bk.staff_id && staffIds.includes(bk.staff_id)) ensureReal(bk.staff_id).push(iv);
      else if (!bk.staff_id) unassignedReal.push(iv);
    }
    for (const ev of (airEvents ?? [])) {
      const iv = { start: jstMin(ev.starts_at), end: jstMin(ev.ends_at) };
      if (ev.staff_id && staffIds.includes(ev.staff_id)) ensureReal(ev.staff_id).push(iv);
      else if (!ev.staff_id) unassignedReal.push(iv);
    }
    const hasAwkwardGap = (id: string): boolean => {
      const own = [...(realBusyByStaff.get(id) ?? []), ...unassignedReal];
      let beforeEnd = -Infinity, afterStart = Infinity;
      for (const x of own) {
        if (x.end <= slotStart && x.end > beforeEnd) beforeEnd = x.end;
        if (x.start >= slotEnd && x.start < afterStart) afterStart = x.start;
      }
      if (beforeEnd !== -Infinity) {
        const g = slotStart - beforeEnd;
        if (g > MAX_OK_GAP && g < MIN_FITTABLE_GAP) return true;
      }
      if (afterStart !== Infinity) {
        const g = afterStart - slotEnd;
        if (g > MAX_OK_GAP && g < MIN_FITTABLE_GAP) return true;
      }
      return false;
    };
    // すきま時間を作らないスタッフのみ割当可能（1人も居なければグリッド同様この枠は不可）
    const assignableStaff = freeStaffIds.filter((id) => !hasAwkwardGap(id));
    if (assignableStaff.length === 0) {
      return json({ error: 'この時間はご案内できません。別の時間をお選びください。', code: 'slot_taken' }, 409);
    }

    const assignedStaff = staffId ?? assignableStaff[0];
    const isNominated = !!staffId;

    // --- 初回判定（電話/メールで過去予約・会員を照合）---
    //   注意: 自分自身の未払い仮押さえ(deposit_status='pending')を「過去予約」と数えると、
    //   初回客の2回目の予約が「再来店」扱いになり前金ゲートを素通りしてしまう。
    //   よって pending の仮押さえは初回判定から除外する（本当の来店=confirmed/completed かつ
    //   deposit_status が none/paid/waived のもののみを来店実績とみなす）。
    let isFirstVisit = true;
    const { count: priorBookings } = await supabase
      .from('app_bookings').select('id', { count: 'exact', head: true })
      .eq('guest_phone_norm', phoneNorm).neq('status', 'cancelled')
      .neq('deposit_status', 'pending');
    if ((priorBookings ?? 0) > 0) isFirstVisit = false;
    if (isFirstVisit) {
      // 会員(アプリ登録)の電話とも照合。DB側で数字のみに正規化して件数を数える
      // （全件フェッチだと会員が行数上限を超えたとき取りこぼし、再来店会員が初回扱いになる）。
      const { data: memberCount, error: memberErr } = await supabase
        .rpc('count_members_by_phone', { p_phone_norm: phoneNorm });
      if (memberErr) {
        console.error('count_members_by_phone failed:', memberErr.message);
      } else if ((memberCount ?? 0) > 0) {
        isFirstVisit = false;
      }
    }

    // --- 前金（初回のみ）---
    //   通常: 前金=メニュー価格（初回対象メニューは3,980/5,980想定。自動案内はその金額のみ）。
    //   学割: 学生選択時はメニュー価格に対応する学割価格で請求（下記の対応表）。
    const isStudent = b.isStudent === true;
    // 学割対応表: 初回対象メニュー価格→学割前金（migrations 080/081/082 と一致させる）。
    const STUDENT_DEPOSIT: Record<number, number> = { 3980: 3500, 5980: 4400 };
    const depositRequired = isFirstVisit;
    const menuPrice = menu.price as number;
    // 学割指定なのに対応表に無いメニュー価格なら、黙って通常価格を請求せず明示的にエラー。
    if (depositRequired && isStudent && !(menuPrice in STUDENT_DEPOSIT)) {
      return json({ error: 'このメニューは学割対象外です', code: 'invalid' }, 400);
    }
    let depositAmount: number | null = null;
    if (depositRequired) {
      depositAmount = isStudent ? STUDENT_DEPOSIT[menuPrice] : menuPrice;
    }
    const depositStatus = depositRequired ? 'pending' : 'none';

    // --- 前金リンク（Airペイの金額固定リンク）を【挿入前に】照合 ---
    //   リンクが有る初回客のみ「事前決済が完了するまで確定しない」仮押さえにする。
    //   リンクが無い初回客は従来どおりスタッフが個別連絡（自動失効はさせない）。
    //   学生=学割リンク(is_student)、通常=自動案内リンク(auto_match) を金額で照合。
    let paymentUrl: string | null = null;
    if (depositRequired && depositAmount) {
      let q = supabase
        .from('payment_links').select('url, store_id')
        .eq('is_active', true).eq('amount', depositAmount)
        .eq('is_subscription', false);   // 定期(サブスク)リンクは前金照合の対象外（毎月課金への誤登録防止）
      q = isStudent ? q.eq('is_student', true) : q.eq('auto_match', true);
      // 店舗別リンクとグローバル(null)リンクの両方を取得し、決定的に選ぶ:
      //   1) 店舗一致を最優先、2) 無ければグローバル。重複時は created_at 新しい順で安定化。
      const { data: links } = await q
        .or(`store_id.eq.${storeId},store_id.is.null`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true });
      const chosen = (links ?? []).find((l) => l.store_id === storeId)
        ?? (links ?? []).find((l) => l.store_id === null);
      paymentUrl = chosen?.url ?? null;
    }
    // 仮押さえの失効期限: オンライン決済導線(リンク)がある時のみ設定（既定30分）。
    //   期限内に「お支払いが完了しました」が押されないと自動キャンセルで枠を解放する。
    const HOLD_MINUTES = 30;
    const holdExpiresAt = (depositRequired && paymentUrl)
      ? new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString()
      : null;

    // --- 挿入（EXCLUDE制約違反=二重予約は slot_taken に変換）---
    //   枠は status='confirmed' で物理確保しつつ、初回客は deposit_status='pending' +
    //   hold_expires_at で「事前決済待ちの仮押さえ」を表す（決済完了で paid＝正式確定）。
    const startsAt = new Date(base + slotStart * 60000).toISOString();
    const endsAt = new Date(base + slotEnd * 60000).toISOString();
    const { data: inserted, error: insErr } = await supabase
      .from('app_bookings')
      .insert({
        user_id: null,
        store_id: storeId,
        treatment_menu_id: menuId,
        staff_id: assignedStaff,
        is_staff_nominated: isNominated,
        starts_at: startsAt,
        ends_at: endsAt,
        buffer_before: BUFFER,
        buffer_after: BUFFER,
        status: 'confirmed',
        payment_method: 'onsite',
        created_by: 'client',
        source: 'web',
        guest_name: guestName,
        guest_phone: guestPhone,
        guest_phone_norm: phoneNorm,
        guest_email: guestEmail,
        customer_request: request,
        is_first_visit: isFirstVisit,
        deposit_status: depositStatus,
        deposit_amount: depositAmount,
        hold_expires_at: holdExpiresAt,
        idempotency_key: idempotencyKey,
      })
      .select('id, cancel_token')
      .single();

    if (insErr) {
      // 23505 = unique_violation。冪等キー重複＝通信断後の再送信で、既に同じ予約が
      // 作成されている。二重予約にせず、既存の予約をそのまま返す（この試行と同一入力
      // なので paymentUrl 等は再計算済みの値がそのまま使える。通知・メールは初回送信済み）。
      if ((insErr as any).code === '23505' && idempotencyKey) {
        const { data: existing } = await supabase
          .from('app_bookings').select('id')
          .eq('idempotency_key', idempotencyKey).maybeSingle();
        if (existing) {
          return json({
            bookingId: existing.id,
            requiresDeposit: depositRequired,
            depositAmount,
            paymentUrl,
            holdExpiresAt,
            zoomJoinUrl: null,
          });
        }
      }
      // 23P01 = exclusion_violation（同一スタッフ枠の二重予約）
      if ((insErr as any).code === '23P01' || /exclud/i.test(insErr.message)) {
        return json({ error: 'この枠は埋まってしまいました。別の時間をお選びください。', code: 'slot_taken' }, 409);
      }
      console.error('insert error:', insErr.message);
      return json({ error: '予約の作成に失敗しました', code: 'invalid' }, 500);
    }

    // --- スタッフグループLINE通知（失敗しても予約は成立）---
    //   初回客の仮押さえ（事前決済待ち）は【まだ確定でない】ため、ここでは通知しない。
    //   決済完了の自己申告（confirm-web-booking）時に通知する。
    //   再来店客（前金不要）は即確定なので、従来どおりここで通知する。
    const heldForPayment = depositRequired && !!holdExpiresAt;
    let zoomJoinUrl: string | null = null;
    if (!heldForPayment) {
      // --- Zoom会議の自動作成（zoom_user_id を設定したスタッフの予約のみ）---
      //   通知・メールの前に作成し、URLを予約に保存してから通知する。
      //   失敗してもZoom無しで確定（予約は止めない）。
      try {
        const { data: staffProf } = await supabase
          .from('profiles').select('zoom_user_id').eq('id', assignedStaff).maybeSingle();
        if (staffProf?.zoom_user_id) {
          const m = await createZoomMeeting({
            hostUserId: staffProf.zoom_user_id,
            topic: `${menu.name}（${guestName}様）`,
            startIso: startsAt,
            durationMin: duration,
          });
          if (m) {
            zoomJoinUrl = m.joinUrl;
            await supabase.from('app_bookings')
              .update({ zoom_join_url: m.joinUrl, zoom_meeting_id: m.id })
              .eq('id', inserted!.id);
          }
        }
      } catch (e) {
        console.error('zoom create failed:', (e as Error).message);
      }

      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-staff-group`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: inserted!.id }),
        });
      } catch (e) {
        console.error('notify-staff-group failed:', (e as Error).message);
      }

      // 確認メール: 前金ゲートなし（再来店 or 前金リンク無し）の確定予約のみ送る。
      // 前金ゲートあり（heldForPayment）は confirm-web-booking で決済確定後に送る。
      if (guestEmail) {
        const jstBase = new Date(base + 9 * 3600_000);  // UTC→JST
        const jstTime = `${String(Math.floor(slotStart / 60)).padStart(2, '0')}:${String(slotStart % 60).padStart(2, '0')}`;
        sendConfirmationEmail({
          guestName, guestEmail, date, time: jstTime,
          menuName: menu.name as string,
          durationMinutes: duration,
          storeId,
          cancelToken: inserted!.cancel_token ?? undefined,
          zoomUrl: zoomJoinUrl ?? undefined,
        }).then(() =>
          supabase.from('app_bookings')
            .update({ confirmation_email_sent_at: new Date().toISOString() })
            .eq('id', inserted!.id).then(() => {})
        ).catch((e) => console.error('confirmation email failed:', (e as Error).message));
        void jstBase; // suppress unused warning
      }
    } else {
      // 前金ゲートあり（初回・事前決済待ち）でも作成時点でスタッフに通知する。
      // 通知文には「💳 要事前決済（入金待ち）」が自動で付くため状況が分かる。
      // ※以前は決済確定(confirm-web-booking)時のみ通知だったが、支払い済みでも
      //   完了ボタン未押下だと通知ゼロのまま自動キャンセルされ、店側が予約の存在に
      //   気づけない事故が起きた（2026-07-15）。
      try {
        await fetch(`${supabaseUrl}/functions/v1/notify-staff-group`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: inserted!.id }),
        });
      } catch (e) {
        console.error('notify-staff-group (held) failed:', (e as Error).message);
      }
    }

    return json({
      bookingId: inserted!.id,
      requiresDeposit: depositRequired,
      depositAmount,
      paymentUrl,
      holdExpiresAt,
      zoomJoinUrl,
    });
  } catch (e) {
    console.error('create-web-booking error:', (e as Error).message);
    return json({ error: 'Internal error', code: 'invalid' }, 500);
  }
});
