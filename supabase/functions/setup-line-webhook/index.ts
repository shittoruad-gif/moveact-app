// Supabase Edge Function: setup-line-webhook (セットアップ自動化・1回だけ実行）
// =====================================================
// 既存の LINE_CHANNEL_ACCESS_TOKEN を使って、LINEのWebhook URLを自動設定する。
// （アクセストークンは関数のenv内のみで使用。外部に出さない）
//   1) Webhook endpoint を当アプリの line-webhook 関数URLに設定
//   2) 設定内容を取得して確認（active か）
//   3) Webhook疎通テストを実行
// 送信先URLは固定（改ざん防止）。
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// このプロジェクトの line-webhook 関数URL（固定）
const WEBHOOK_URL = 'https://khsriogicdjdyivshplc.supabase.co/functions/v1/line-webhook';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  // 管理者専用の一時セットアップツール。service role の Authorization が無ければ拒否。
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  try {
    if (!lineToken) {
      return json({ ok: false, step: 'token', error: 'LINE_CHANNEL_ACCESS_TOKEN が未設定です' }, 200);
    }
    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lineToken}` };

    // 1) Webhook URL を設定
    const setRes = await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', {
      method: 'PUT', headers, body: JSON.stringify({ endpoint: WEBHOOK_URL }),
    });
    const setText = await setRes.text();
    if (!setRes.ok) {
      return json({ ok: false, step: 'set', status: setRes.status, body: setText }, 200);
    }

    // 2) 設定確認
    const getRes = await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', { headers });
    const getJson = await getRes.json().catch(() => ({}));

    // 3) 疎通テスト
    const testRes = await fetch('https://api.line.me/v2/bot/channel/webhook/test', {
      method: 'POST', headers, body: JSON.stringify({ endpoint: WEBHOOK_URL }),
    });
    const testJson = await testRes.json().catch(() => ({}));

    return json({
      ok: true,
      endpoint: getJson.endpoint ?? WEBHOOK_URL,
      active: getJson.active ?? null,
      test: testJson, // { success, statusCode, reason, detail }
    });
  } catch (e) {
    return json({ ok: false, step: 'exception', error: (e as Error).message }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
