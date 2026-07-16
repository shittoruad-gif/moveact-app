// Supabase Edge Function: line-webhook
// =====================================================
// LINE Messaging API の Webhook 受け口。
// 公式LINEボットをスタッフのグループに追加すると、groupId を自動で line_notify_groups に登録する。
//   ・join イベント（ボットがグループに参加）   → 登録＆「登録しました」と返信
//   ・group内メッセージ「通知登録」/「登録」      → 再登録・確認
//   ・leave イベント（ボットがグループから退出） → 無効化
// LINE Developers Console の Webhook URL にこの関数のURLを設定し、Webhookを有効化する。
//
// 必要な環境変数（supabase secrets）:
//   LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET（署名検証・必須。未設定時は403で拒否）
// =====================================================
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';
const lineSecret = Deno.env.get('LINE_CHANNEL_SECRET') ?? '';

serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');

  // 署名検証（フェイルクローズ: シークレット未設定・署名不一致はどちらも拒否）
  if (!lineSecret) {
    console.error('line-webhook: LINE_CHANNEL_SECRET が未設定のためリクエストを拒否しました（フェイルクローズ）');
    return new Response('forbidden', { status: 403 });
  }
  const raw = await req.text();
  const sig = req.headers.get('x-line-signature') ?? '';
  const ok = await verifySignature(raw, sig, lineSecret);
  if (!ok) return new Response('invalid signature', { status: 403 });

  let body: any;
  try { body = JSON.parse(raw); } catch { return new Response('ok'); }
  const supabase = createClient(supabaseUrl, serviceKey);

  for (const ev of (body.events ?? [])) {
    const src = ev.source ?? {};
    const groupId: string | undefined = src.groupId ?? src.roomId;
    if (!groupId) continue; // 1対1トークは対象外

    try {
      if (ev.type === 'join') {
        await registerGroup(supabase, groupId);
        await reply(ev.replyToken, 'このグループを「予約通知の送信先」に登録しました。予約が入るとここに通知します。');
      } else if (ev.type === 'leave') {
        await supabase.from('line_notify_groups').update({ is_active: false }).eq('group_id', groupId);
      } else if (ev.type === 'message' && ev.message?.type === 'text') {
        const text = (ev.message.text ?? '').trim();
        if (text === '通知登録' || text === '登録') {
          await registerGroup(supabase, groupId);
          await reply(ev.replyToken, 'このグループを「予約通知の送信先」に登録しました。');
        } else if (text === '通知停止' || text === '解除') {
          await supabase.from('line_notify_groups').update({ is_active: false }).eq('group_id', groupId);
          await reply(ev.replyToken, '予約通知を停止しました。再開するには「通知登録」と送信してください。');
        }
      }
    } catch (e) {
      console.error('line-webhook event error:', (e as Error).message);
    }
  }
  return new Response('ok');
});

async function registerGroup(supabase: any, groupId: string) {
  await supabase.from('line_notify_groups')
    .upsert({ group_id: groupId, is_active: true, notify_on_booking: true }, { onConflict: 'group_id' });
}

async function reply(replyToken: string | undefined, text: string) {
  if (!replyToken || !lineToken) return;
  try {
    await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${lineToken}` },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
    });
  } catch (_e) { /* non-fatal */ }
}

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return b64 === signature;
  } catch {
    return false;
  }
}
