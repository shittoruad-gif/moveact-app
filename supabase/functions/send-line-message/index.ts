// Supabase Edge Function: send-line-message
// Sends LINE push message to a client via LINE Messaging API.
// Called from:
//   1) Staff client when creating a booking: { booking_id, message_type: 'booking_created' }
//   2) Cron / pg_net: { booking_id, message_type: 'booking_reminder' }
//
// Env required:
//   LINE_CHANNEL_ACCESS_TOKEN - Long-lived access token from LINE Developers Console
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const lineAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type MessageType =
  | 'booking_created'
  | 'booking_reminder'
  | 'booking_cancelled'
  | 'booking_rescheduled'
  | 'custom';

interface RequestBody {
  booking_id?: string;
  user_id?: string;
  message_type: MessageType;
  custom_text?: string;
}

const STORE_NAMES: Record<string, string> = {
  kanamitsu: '金光店',
  tamashima: '玉島店',
};

const STORE_ADDRESS: Record<string, string> = {
  kanamitsu: '岡山県浅口市金光町占見新田283-1 2階',
  tamashima: '岡山県倉敷市玉島中央町3丁目',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!lineAccessToken) {
      return json({ error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth: 内部のservice role呼び出し以外は staff/admin のJWTを必須にする。
    // （旧実装は authHeader が空だとチェックを丸ごとスキップする fail-open だった）
    const authHeader = req.headers.get('Authorization') ?? '';
    if (authHeader !== `Bearer ${supabaseServiceKey}`) {
      const token = authHeader.replace('Bearer ', '');
      if (!token) {
        return json({ error: 'Unauthorized' }, 401);
      }
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return json({ error: 'Unauthorized' }, 401);
      }
      const { data: callerProfile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single();
      if (!callerProfile || !['staff', 'admin'].includes(callerProfile.role)) {
        return json({ error: 'Staff access required' }, 403);
      }
    }

    const body = (await req.json()) as RequestBody;
    if (!body.message_type) {
      return json({ error: 'message_type required' }, 400);
    }

    // Resolve booking + customer
    let booking: any = null;
    let customerId = body.user_id;

    if (body.booking_id) {
      const { data: b, error: bErr } = await supabase
        .from('app_bookings')
        .select('*, treatment_menu:treatment_menus(name, duration_minutes), staff:profiles!app_bookings_staff_id_fkey(full_name)')
        .eq('id', body.booking_id)
        .single();
      if (bErr || !b) return json({ error: 'Booking not found' }, 404);
      booking = b;
      customerId = b.user_id;
    }

    if (!customerId) {
      return json({ error: 'booking_id or user_id required' }, 400);
    }

    const { data: customer, error: cErr } = await supabase
      .from('profiles')
      .select('id, full_name, line_user_id')
      .eq('id', customerId)
      .single();
    if (cErr || !customer) return json({ error: 'Customer not found' }, 404);

    if (!customer.line_user_id) {
      await logNotification(supabase, {
        user_id: customer.id,
        booking_id: body.booking_id ?? null,
        message_type: body.message_type,
        line_user_id: null,
        payload: null,
        status: 'skipped',
        error_message: 'line_user_id not set',
      });
      return json({ ok: true, skipped: true, reason: 'LINE not linked' });
    }

    // Build message payload
    const messages = buildMessages(body.message_type, {
      customerName: customer.full_name,
      booking,
      customText: body.custom_text,
    });

    // Call LINE Messaging API push endpoint
    const lineRes = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lineAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: customer.line_user_id,
        messages,
      }),
    });

    const lineBody = await lineRes.text();

    if (!lineRes.ok) {
      await logNotification(supabase, {
        user_id: customer.id,
        booking_id: body.booking_id ?? null,
        message_type: body.message_type,
        line_user_id: customer.line_user_id,
        payload: { messages },
        status: 'failed',
        error_message: `LINE API ${lineRes.status}: ${lineBody}`,
      });
      return json({ error: 'LINE API error', details: lineBody }, 502);
    }

    await logNotification(supabase, {
      user_id: customer.id,
      booking_id: body.booking_id ?? null,
      message_type: body.message_type,
      line_user_id: customer.line_user_id,
      payload: { messages },
      status: 'sent',
      error_message: null,
    });

    return json({ ok: true, sent: true });
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

async function logNotification(supabase: any, entry: any) {
  try {
    await supabase.from('line_notification_log').insert(entry);
  } catch (_) { /* non-fatal */ }
}

interface MessageCtx {
  customerName: string;
  booking: any | null;
  customText?: string;
}

function buildMessages(type: MessageType, ctx: MessageCtx): any[] {
  const { customerName, booking, customText } = ctx;

  if (type === 'custom') {
    return [{ type: 'text', text: customText ?? '' }];
  }

  if (!booking) {
    return [{ type: 'text', text: `${customerName}様、Moveactからのお知らせです。` }];
  }

  const start = new Date(booking.starts_at);
  const dateStr = start.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo',
  });
  const timeStr = start.toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  });
  const endStr = new Date(booking.ends_at).toLocaleTimeString('ja-JP', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  });
  const storeName = STORE_NAMES[booking.store_id] ?? booking.store_id;
  const storeAddr = STORE_ADDRESS[booking.store_id] ?? '';
  const menuName = booking.treatment_menu?.name ?? '施術';
  const duration = booking.treatment_menu?.duration_minutes ?? 0;
  const staffName = booking.staff?.full_name ?? '';

  const titleMap: Record<MessageType, string> = {
    booking_created: 'ご予約を承りました',
    booking_reminder: 'ご予約のリマインド',
    booking_cancelled: 'ご予約のキャンセル',
    booking_rescheduled: 'ご予約の変更',
    custom: 'お知らせ',
  };

  const leadMap: Record<MessageType, string> = {
    booking_created: '次回のご予約内容をお知らせいたします。',
    booking_reminder: 'まもなくご予約のお時間です。ご来店をお待ちしております。',
    booking_cancelled: 'ご予約がキャンセルされました。ご確認ください。',
    booking_rescheduled: 'ご予約内容が変更されました。',
    custom: '',
  };

  // Flex Message for rich formatting
  const flex = {
    type: 'flex',
    altText: `${titleMap[type]}：${dateStr} ${timeStr} ${menuName}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#C4956A',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: 'Moveact', color: '#FFFFFF', size: 'sm', weight: 'bold' },
          { type: 'text', text: titleMap[type], color: '#FFFFFF', size: 'lg', weight: 'bold', margin: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: `${customerName}様`, weight: 'bold', size: 'md' },
          { type: 'text', text: leadMap[type], size: 'sm', color: '#6B5E5E', wrap: true, margin: 'sm' },
          { type: 'separator', margin: 'md' },
          row('🗓 日時', `${dateStr}\n${timeStr} - ${endStr}`),
          row('🏠 店舗', storeName),
          row('💆 メニュー', `${menuName}（${duration}分）`),
          ...(staffName ? [row('👤 担当', staffName)] : []),
          ...(booking.note ? [row('📝 メモ', booking.note)] : []),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '12px',
        contents: [
          {
            type: 'text',
            text: `📍 ${storeAddr}`,
            size: 'xxs',
            color: '#8A7E7E',
            wrap: true,
          },
          {
            type: 'text',
            text: 'キャンセル・変更はアプリまたはお電話でお願いします。',
            size: 'xxs',
            color: '#8A7E7E',
            wrap: true,
            margin: 'sm',
          },
        ],
      },
    },
  };

  return [flex];
}

function row(label: string, value: string) {
  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: [
      { type: 'text', text: label, size: 'xs', color: '#8A7E7E' },
      { type: 'text', text: value, size: 'sm', weight: 'bold', color: '#3D3535', wrap: true },
    ],
  };
}
