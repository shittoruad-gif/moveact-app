// Supabase Edge Function: airreserve-sync
// Polls Airリザーブ iCal feeds registered in `airreserve_sources` and
// upserts events into `airreserve_events`.
//
// Airリザーブ は公式 REST API を提供していないため、スタッフ／店舗ごとに
// 発行される iCal フィード URL を取得して同期する方式を採用。
// (Airリザーブの管理画面 → 予約カレンダー → iCal 連携 で URL を取得可)
//
// Trigger:
//   - Manual: POST / (auth: service role or staff)
//   - Scheduled (pg_cron): 15分おきなど
//
// Body (optional):
//   { source_id?: string }  -> sync only that source. If omitted syncs all active.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: service role / cron secret / staff・admin ユーザー のいずれか
    const authHeader = req.headers.get('Authorization') ?? '';
    const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
    const isServiceRole = authHeader === `Bearer ${supabaseServiceKey}`;
    const isCron = cronSecret.length > 0 && authHeader === `Bearer ${cronSecret}`;
    if (!isServiceRole && !isCron) {
      const { data: { user } } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      );
      if (!user) return json({ error: 'Unauthorized' }, 401);
      const { data: prof } = await supabase
        .from('profiles').select('role').eq('id', user.id).single();
      if (!prof || !['staff','admin'].includes(prof.role)) {
        return json({ error: 'Staff access required' }, 403);
      }
    }

    const body = req.method === 'POST'
      ? await req.json().catch(() => ({}))
      : {};
    const singleId: string | undefined = body?.source_id;

    // Fetch sources
    let q = supabase.from('airreserve_sources').select('*').eq('is_active', true);
    if (singleId) q = q.eq('id', singleId);
    const { data: sources, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const results: any[] = [];
    for (const src of sources ?? []) {
      try {
        const r = await syncOne(supabase, src);
        results.push({ source_id: src.id, label: src.label, ...r });
      } catch (e: any) {
        await supabase.from('airreserve_sources').update({
          last_synced_at: new Date().toISOString(),
          last_sync_status: 'error',
          last_sync_error: e?.message ?? String(e),
          updated_at: new Date().toISOString(),
        }).eq('id', src.id);
        results.push({ source_id: src.id, label: src.label, ok: false, error: e?.message });
      }
    }

    return json({ ok: true, count: results.length, results });
  } catch (e: any) {
    return json({ error: e?.message ?? 'internal error' }, 500);
  }
});

async function syncOne(supabase: any, src: any) {
  const res = await fetch(src.ical_url, {
    headers: {
      'User-Agent': 'Moveact-Airreserve-Sync/1.0',
      'Accept': 'text/calendar',
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  const events = parseICal(text);

  // Upsert all events for this source
  let upserted = 0;
  const now = new Date().toISOString();
  const uids = new Set<string>();

  for (const ev of events) {
    uids.add(ev.uid);
    const row = {
      source_id: src.id,
      external_uid: ev.uid,
      store_id: src.store_id,
      staff_id: src.staff_id,
      starts_at: ev.start,
      ends_at: ev.end,
      summary: ev.summary ?? null,
      description: ev.description ?? null,
      location: ev.location ?? null,
      raw: ev.raw,
      synced_at: now,
    };
    const { error: upErr } = await supabase
      .from('airreserve_events')
      .upsert(row, { onConflict: 'source_id,external_uid' });
    if (!upErr) upserted++;
  }

  // Prune events that no longer exist in the feed AND are future-dated
  // (we keep past events as history).
  if (uids.size > 0) {
    const { data: existing } = await supabase
      .from('airreserve_events')
      .select('id, external_uid, starts_at')
      .eq('source_id', src.id)
      .gte('starts_at', now);
    const toDelete = (existing ?? []).filter((e: any) => !uids.has(e.external_uid));
    if (toDelete.length > 0) {
      await supabase
        .from('airreserve_events')
        .delete()
        .in('id', toDelete.map((e: any) => e.id));
    }
  }

  await supabase.from('airreserve_sources').update({
    last_synced_at: now,
    last_sync_status: 'ok',
    last_sync_error: null,
    events_count: events.length,
    updated_at: now,
  }).eq('id', src.id);

  return { ok: true, fetched: events.length, upserted };
}

// ---------- Minimal iCal parser ----------
// Handles RFC 5545 unfolding + VEVENT extraction.
// Supports UTC (Z), floating time, and TZID=Asia/Tokyo (common for Airリザーブ).

interface ICalEvent {
  uid: string;
  start: string;
  end: string;
  summary?: string;
  description?: string;
  location?: string;
  raw: Record<string, string>;
}

function parseICal(raw: string): ICalEvent[] {
  // Unfold: lines beginning with space/tab are continuations.
  const lines: string[] = [];
  const rawLines = raw.replace(/\r\n/g, '\n').split('\n');
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  const events: ICalEvent[] = [];
  let current: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT') {
      if (current && current.UID && (current.DTSTART || current['DTSTART;TZID=Asia/Tokyo'])) {
        const start = parseDateProp(current, 'DTSTART');
        const end = parseDateProp(current, 'DTEND') ?? start;
        if (start) {
          events.push({
            uid: current.UID,
            start,
            end,
            summary: decodeText(current.SUMMARY),
            description: decodeText(current.DESCRIPTION),
            location: decodeText(current.LOCATION),
            raw: current,
          });
        }
      }
      current = null;
    } else if (current) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.slice(0, idx);
        const value = line.slice(idx + 1);
        current[key] = value;
        // Also stash base key (without params) for convenience
        const baseKey = key.split(';')[0];
        if (!(baseKey in current)) current[baseKey] = value;
      }
    }
  }

  return events;
}

function parseDateProp(props: Record<string, string>, baseKey: string): string | null {
  // Find any property starting with the base key (may have TZID=... params).
  const exactKey = Object.keys(props).find((k) => k === baseKey || k.startsWith(baseKey + ';'));
  if (!exactKey) return null;
  const value = props[exactKey];
  const params = parseParams(exactKey);

  // Formats:
  //   20250420T100000Z                 (UTC)
  //   20250420T100000                  (floating or with TZID)
  //   20250420                         (DATE)
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, hh, mm, ss, z] = m;
  const year = +y, month = +mo, day = +d, hour = +(hh ?? 0), minute = +(mm ?? 0), second = +(ss ?? 0);

  if (z === 'Z') {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString();
  }
  if (params.TZID === 'Asia/Tokyo') {
    // JST = UTC+9. Convert wall-clock JST → UTC.
    return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second)).toISOString();
  }
  // Floating or DATE: treat as JST by default (Airリザーブは日本向け)
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second)).toISOString();
}

function parseParams(key: string): Record<string, string> {
  const parts = key.split(';').slice(1);
  const obj: Record<string, string> = {};
  for (const p of parts) {
    const eq = p.indexOf('=');
    if (eq > 0) obj[p.slice(0, eq)] = p.slice(eq + 1);
  }
  return obj;
}

function decodeText(v: string | undefined): string | undefined {
  if (!v) return undefined;
  return v
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
