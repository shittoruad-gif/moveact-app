// 一時セットアップ：メールでスタッフを特定→staff化→店舗配属(staff_stores)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  // 管理者専用の一時セットアップツール。service role の Authorization が無ければ拒否。
  // （config.toml未登録=verify_jwt=trueだが、それだけだと公開anonキーで叩けてしまい
  //   スタッフ名簿の全消去・再構築ができてしまうため、関数内でも必ず検証する）
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { 'Content-Type': 'application/json' },
    });
  }
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const body = await req.text().catch(() => '');
  // デバッグテストユーザーの削除
  if (body.includes('cleanup_debug')) {
    const { data: users } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const testUsers = (users?.users ?? []).filter(u => u.email?.includes('debug_test_xyz999'));
    for (const u of testUsers) {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${u.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey },
      });
    }
    return new Response(JSON.stringify({ deleted: testUsers.map(u => u.id) }), { headers: { 'Content-Type': 'application/json' } });
  }
  const log: any[] = [];

  // メール → ユーザーID マップ（全ユーザー取得）
  const byEmail: Record<string, string> = {};
  for (let page = 1; page <= 6; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    for (const u of users) if (u.email) byEmail[u.email.toLowerCase()] = u.id;
    if (users.length < 1000) break;
  }

  const staff = [
    { key: '三上', name: '三上尚志', email: 'momen_t421@yahoo.co.jp' },
    { key: '久一', name: '久一吉弘', email: 'xxx.hsys.xxx@gmail.com' },
    { key: 'アリサ', name: 'ARISA', email: 'ars.13@ezweb.ne.jp' },
    { key: 'ユナ', name: 'YUNA', email: 'yuai63514@icloud.com' },
    { key: '石井', name: '石井裕美', email: 'heakichitsun@gmail.com' },
    { key: '小宮', name: '小宮 寧', email: 'konene612@gmail.com' },
  ];
  const ids: Record<string, string> = {};
  for (const s of staff) {
    let id = byEmail[s.email.toLowerCase()] ?? null;
    let created = false;
    if (!id) {
      // JS clientのauth.adminがEdge Functionから500を返すため、REST APIを直接呼ぶ
      const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: s.email,
          email_confirm: true,
          password: crypto.randomUUID() + 'Aa1!',
          user_metadata: { full_name: s.name },
        }),
      });
      const resText = await res.text();
      if (!res.ok) {
        log.push({ key: s.key, email: s.email, status: res.status, error: resText });
        continue;
      }
      const user = JSON.parse(resText);
      id = user.id; created = true;
    }
    await supabase.from('profiles').upsert({ id, full_name: s.name, role: 'staff' }, { onConflict: 'id' });
    ids[s.key] = id;
    log.push({ key: s.key, name: s.name, id, created });
  }

  // 配属を再構築
  await supabase.from('staff_stores').delete().not('staff_id', 'is', null);
  const tama = ['三上', '久一', 'アリサ', 'ユナ'];
  const kana = ['三上', '久一', 'ユナ', '石井', '小宮'];
  const rows: any[] = [];
  for (const k of tama) if (ids[k]) rows.push({ staff_id: ids[k], store_id: 'tamashima', is_active: true });
  for (const k of kana) if (ids[k]) rows.push({ staff_id: ids[k], store_id: 'kanamitsu', is_active: true });
  const { error: rErr } = await supabase.from('staff_stores').upsert(rows, { onConflict: 'staff_id,store_id' });

  return new Response(JSON.stringify({ log, rosterRows: rows.length, rosterError: rErr?.message ?? null }, null, 1),
    { headers: { 'Content-Type': 'application/json' } });
});
