// Supabase Edge Function: line-reminder-cron
// Sends LINE reminder messages for bookings happening later today (same day, 朝送信想定).
//
// Trigger this via a scheduled job (pg_cron / GitHub Actions / external scheduler)
// to run once per morning. Supabase schedules can call this with:
//   curl -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
//        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
//        https://<project>.supabase.co/functions/v1/line-reminder-cron
//
// Env required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   LINE_CHANNEL_ACCESS_TOKEN (used indirectly via send-line-message)
//
// Optional query params:
//   ?mode=today          (default) reminders for today's confirmed bookings
//   ?mode=tomorrow       reminders for tomorrow (前日夜送信用)
//   ?dry_run=1           do not send, just count targets

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only accept calls with the service role key (cron / internal).
    const authHeader = req.headers.get('Authorization') ?? '';
    if (authHeader !== `Bearer ${supabaseServiceKey}`) {
      return json({ error: 'Service role required' }, 401);
    }

    const url = new URL(req.url);
    const mode = (url.searchParams.get('mode') ?? 'today') as 'today' | 'tomorrow';
    const dryRun = url.searchParams.get('dry_run') === '1';

    // Compute target date range in JST
    const { startJst, endJst } = getJstRange(mode);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all confirmed bookings in the window whose customer has a line_user_id
    // and that haven't already been reminded.
    const { data: bookings, error } = await supabase
      .from('app_bookings')
      .select(`
        id, user_id, store_id, starts_at, ends_at,
        profile:profiles!app_bookings_user_id_fkey(id, full_name, line_user_id)
      `)
      .eq('status', 'confirmed')
      .gte('starts_at', startJst.toISOString())
      .lt('starts_at', endJst.toISOString());

    if (error) {
      return json({ error: 'Failed to fetch bookings', details: error.message }, 500);
    }

    const targets = (bookings ?? []).filter(
      (b: any) => b.profile?.line_user_id,
    );

    // De-duplicate: skip bookings that already have a successful reminder in the log.
    const { data: existingLogs } = await supabase
      .from('line_notification_log')
      .select('booking_id')
      .eq('message_type', 'booking_reminder')
      .eq('status', 'sent')
      .in('booking_id', targets.map((b: any) => b.id));

    const alreadySent = new Set(
      (existingLogs ?? []).map((l: any) => l.booking_id).filter(Boolean),
    );

    const toSend = targets.filter((b: any) => !alreadySent.has(b.id));

    if (dryRun) {
      return json({
        ok: true,
        dry_run: true,
        mode,
        window: { start: startJst.toISOString(), end: endJst.toISOString() },
        total_confirmed: bookings?.length ?? 0,
        linked: targets.length,
        to_send: toSend.length,
        already_sent: alreadySent.size,
      });
    }

    // Fire send-line-message for each target. Run sequentially to avoid LINE rate limits.
    const results: Array<{ booking_id: string; ok: boolean; error?: string }> = [];
    for (const b of toSend) {
      try {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/send-line-message`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'apikey': supabaseServiceKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              booking_id: b.id,
              message_type: 'booking_reminder',
            }),
          },
        );
        const body = await res.json();
        results.push({
          booking_id: b.id,
          ok: res.ok && body?.ok === true,
          error: !res.ok ? JSON.stringify(body) : undefined,
        });
      } catch (e: any) {
        results.push({ booking_id: b.id, ok: false, error: e?.message ?? 'unknown' });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.length - sent;

    return json({
      ok: true,
      mode,
      window: { start: startJst.toISOString(), end: endJst.toISOString() },
      total_confirmed: bookings?.length ?? 0,
      linked: targets.length,
      attempted: results.length,
      sent,
      failed,
      results,
    });
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

// Compute [start, end) window in UTC representing the target JST day.
// JST = UTC+9. "today" in JST is [today 00:00 JST, tomorrow 00:00 JST).
function getJstRange(mode: 'today' | 'tomorrow'): { startJst: Date; endJst: Date } {
  const now = new Date();
  // Current JST date (UTC+9)
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jstNow.getUTCFullYear();
  const m = jstNow.getUTCMonth();
  const d = jstNow.getUTCDate() + (mode === 'tomorrow' ? 1 : 0);

  // Midnight JST for the target date, expressed in UTC.
  // 00:00 JST = 15:00 UTC the previous day → subtract 9h from the UTC-midnight point.
  const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - 9 * 60 * 60 * 1000);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);

  return { startJst: startUtc, endJst: endUtc };
}
