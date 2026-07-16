// Supabase Edge Function: broadcast-line-announcement
// Sends a LINE text/template message to all LINE-linked users.
// Usage (staff only):
//   POST { announcement_id?: string, title?: string, body: string, image_url?: string }
//
// If announcement_id is provided, fetches title/body from announcements table
// and marks line_broadcast_at.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!lineAccessToken) return json({ error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, 500);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Staff auth
    const authHeader = req.headers.get('Authorization') ?? '';
    let callerId: string | null = null;
    if (authHeader !== `Bearer ${supabaseServiceKey}`) {
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!prof || !['staff','admin'].includes(prof.role)) {
        return json({ error: 'Staff access required' }, 403);
      }
      callerId = user.id;
    }

    const body = await req.json();
    let title: string | undefined = body.title;
    let text: string | undefined = body.body;
    const imageUrl: string | undefined = body.image_url;
    const announcementId: string | undefined = body.announcement_id;

    if (announcementId) {
      const { data: ann } = await supabase
        .from('announcements')
        .select('title, content, image_url')
        .eq('id', announcementId)
        .single();
      if (!ann) return json({ error: 'Announcement not found' }, 404);
      title = ann.title;
      text = ann.content;
    }

    if (!text) return json({ error: 'body text required' }, 400);

    // Fetch all linked users
    const { data: users, error: usersErr } = await supabase
      .from('profiles')
      .select('id, line_user_id')
      .eq('role', 'customer')
      .not('line_user_id', 'is', null);
    if (usersErr) return json({ error: usersErr.message }, 500);

    const lineIds = (users ?? []).map((u: any) => u.line_user_id).filter(Boolean);
    if (lineIds.length === 0) return json({ ok: true, sent: 0, reason: 'no linked users' });

    // Build messages
    const messages = buildMessages(title, text, imageUrl);

    // LINE /multicast handles up to 500 recipients per call.
    let sent = 0, failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < lineIds.length; i += 500) {
      const batch = lineIds.slice(i, i + 500);
      const r = await fetch('https://api.line.me/v2/bot/message/multicast', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lineAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to: batch, messages }),
      });
      if (r.ok) {
        sent += batch.length;
      } else {
        failed += batch.length;
        errors.push(`batch ${i / 500}: ${r.status} ${await r.text()}`);
      }
    }

    // Log bulk send (per user) - sample only to keep log size reasonable
    await supabase.from('line_notification_log').insert({
      user_id: users?.[0]?.id ?? null,
      booking_id: null,
      message_type: 'custom',
      line_user_id: `broadcast(${lineIds.length})`,
      payload: { title, text, sent, failed, errors: errors.slice(0, 3) },
      status: failed === 0 ? 'sent' : failed === lineIds.length ? 'failed' : 'sent',
      error_message: errors.length ? errors.join('\n').slice(0, 1000) : null,
    }).select();

    // Mark announcement as broadcasted
    if (announcementId) {
      await supabase.from('announcements').update({
        line_broadcast_at: new Date().toISOString(),
        line_broadcast_count: sent,
      }).eq('id', announcementId);
    }

    return json({
      ok: true,
      total: lineIds.length,
      sent,
      failed,
      errors: errors.length ? errors : undefined,
    });
  } catch (e: any) {
    return json({ error: e?.message ?? 'internal error' }, 500);
  }
});

function buildMessages(title: string | undefined, text: string, imageUrl?: string): any[] {
  const messages: any[] = [];
  if (imageUrl) {
    messages.push({
      type: 'image',
      originalContentUrl: imageUrl,
      previewImageUrl: imageUrl,
    });
  }
  const head = title ? `【${title}】\n` : '';
  messages.push({ type: 'text', text: (head + text).slice(0, 4800) });
  return messages;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
