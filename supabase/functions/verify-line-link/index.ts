// Supabase Edge Function: verify-line-link
// Called from the LIFF page after the user authenticates with LINE.
// Input: { token, id_token }
//   - token: short-lived link token created when user tapped "LINE連携"
//   - id_token: LINE ID Token from liff.getIDToken() (or profile with userId)
//
// Flow:
//   1. Verify the LIFF id_token against LINE's verify endpoint
//      to extract the LINE userId (sub claim)
//   2. Look up line_link_tokens row by token (must be unused + unexpired)
//   3. Update profiles.line_user_id for the linked user
//   4. Mark the token used_at

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const liffChannelId = Deno.env.get('LINE_LIFF_CHANNEL_ID') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token, id_token } = await req.json();
    if (!token || !id_token) {
      return json({ error: 'token and id_token required' }, 400);
    }
    if (!liffChannelId) {
      return json({ error: 'LINE_LIFF_CHANNEL_ID not configured' }, 500);
    }

    // Verify the LINE ID Token via LINE's verify endpoint
    const verifyParams = new URLSearchParams();
    verifyParams.append('id_token', id_token);
    verifyParams.append('client_id', liffChannelId);

    const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams.toString(),
    });
    if (!verifyRes.ok) {
      const errBody = await verifyRes.text();
      return json({ error: 'LINE token verify failed', details: errBody }, 401);
    }
    const verified = await verifyRes.json();
    const lineUserId = verified.sub;
    if (!lineUserId) {
      return json({ error: 'sub missing from verified token' }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up link token
    const { data: linkRow, error: linkErr } = await supabase
      .from('line_link_tokens')
      .select('*')
      .eq('token', token)
      .is('used_at', null)
      .gte('expires_at', new Date().toISOString())
      .single();

    if (linkErr || !linkRow) {
      return json({ error: 'Invalid or expired link token' }, 400);
    }

    // Update the customer's profile with line_user_id
    const { error: updErr } = await supabase
      .from('profiles')
      .update({ line_user_id: lineUserId })
      .eq('id', linkRow.user_id);
    if (updErr) {
      return json({ error: 'Profile update failed', details: updErr.message }, 500);
    }

    // Mark token as used
    await supabase
      .from('line_link_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', linkRow.id);

    return json({ ok: true, linked: true });
  } catch (e: any) {
    return json({ error: e?.message ?? 'internal error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
