// Supabase Edge Function: line-auth
// =====================================================
// LINEログイン（顧客の本人認証）。クライアント(expo-auth-session)が取得した
// 認可コードを受け取り、サーバー側でLINEトークン交換→検証し、対応する
// Supabaseユーザーを検索/作成して「セッション発行用の token_hash」を返す。
// チャネルシークレットはこの関数(サーバー)だけが保持する。
//
// 入力: { code, code_verifier?, redirect_uri }
// 出力: { ok, token_hash, email }  → クライアントが verifyOtp(token_hash) で本物のセッション取得
//
// 必要なシークレット: LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET
//   （SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は既定で利用可）
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const channelId = Deno.env.get('LINE_LOGIN_CHANNEL_ID') ?? '';
const channelSecret = Deno.env.get('LINE_LOGIN_CHANNEL_SECRET') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!channelId || !channelSecret) {
      return json({ error: 'LINE Login channel not configured (LINE_LOGIN_CHANNEL_ID / _SECRET)' }, 500);
    }
    const { code, code_verifier, redirect_uri } = await req.json().catch(() => ({}));
    if (!code || !redirect_uri) return json({ error: 'code and redirect_uri are required' }, 400);

    // 1) 認可コード → トークン（LINE）。secretはサーバー側のみ。
    const tokenParams = new URLSearchParams();
    tokenParams.append('grant_type', 'authorization_code');
    tokenParams.append('code', code);
    tokenParams.append('redirect_uri', redirect_uri);
    tokenParams.append('client_id', channelId);
    tokenParams.append('client_secret', channelSecret);
    if (code_verifier) tokenParams.append('code_verifier', code_verifier);

    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });
    if (!tokenRes.ok) return json({ error: 'LINE token exchange failed', details: await tokenRes.text() }, 401);
    const tokenData = await tokenRes.json();
    const idToken = tokenData.id_token as string | undefined;
    if (!idToken) return json({ error: 'no id_token returned from LINE' }, 401);

    // 2) id_token を検証 → sub(LINE userId), name, email
    const vp = new URLSearchParams();
    vp.append('id_token', idToken);
    vp.append('client_id', channelId);
    const vRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: vp.toString(),
    });
    if (!vRes.ok) return json({ error: 'LINE id_token verify failed', details: await vRes.text() }, 401);
    const v = await vRes.json();
    const lineUserId = v.sub as string | undefined;
    const displayName = (v.name as string | undefined) ?? 'LINEユーザー';
    const lineEmail = (v.email as string | undefined) ?? null;
    if (!lineUserId) return json({ error: 'sub missing from verified token' }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);

    // 3) line_user_id で既存ユーザーを検索
    let userId: string | null = null;
    let accountEmail: string | null = null;
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('line_user_id', lineUserId)
      .maybeSingle();
    if (existing) {
      userId = (existing as { id: string }).id;
      accountEmail = (existing as { email: string | null }).email ?? null;
    }

    // 紐付け用メール（LINEのemail scopeが無ければ合成アドレス）
    if (!accountEmail) accountEmail = lineEmail || `line_${lineUserId}@line.moveact.app`;

    // 4) 未登録なら作成（handle_new_userトリガがprofilesを作る）。line_user_idは明示更新。
    if (!userId) {
      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        email: accountEmail,
        email_confirm: true,
        user_metadata: { full_name: displayName, line_user_id: lineUserId },
      });
      if (cErr || !created?.user) {
        return json({ error: 'user create failed', details: cErr?.message ?? 'unknown' }, 500);
      }
      userId = created.user.id;
    }
    // profiles.line_user_id を確実に紐付け（トリガはline_user_idを設定しないため）
    await supabase.from('profiles').update({ line_user_id: lineUserId }).eq('id', userId);

    // 5) magiclinkでセッション発行用 token_hash を取得
    const { data: linkData, error: lErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: accountEmail,
    });
    const tokenHash = (linkData as { properties?: { hashed_token?: string } } | null)?.properties?.hashed_token;
    if (lErr || !tokenHash) {
      return json({ error: 'session link generation failed', details: lErr?.message ?? 'no token_hash' }, 500);
    }

    return json({ ok: true, token_hash: tokenHash, email: accountEmail });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
