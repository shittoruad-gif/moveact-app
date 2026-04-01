// Supabase Edge Function: send-push
// Scheduled via pg_cron to run every morning at 8:00 AM JST
// Sends booking reminders and post-visit review requests

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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { type } = await req.json().catch(() => ({ type: 'all' }));

  const results = { reminders: 0, reviews: 0 };

  // ============================================================
  // 1. Morning Reminders - Send to users with bookings today
  // ============================================================
  if (type === 'all' || type === 'reminders') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get today's confirmed group lesson bookings
    const { data: todayBookings } = await supabase
      .from('group_lesson_bookings')
      .select(`
        id, user_id,
        group_lesson:group_lessons(title, starts_at, store_id)
      `)
      .eq('status', 'confirmed')
      .gte('booked_at', '2000-01-01'); // all bookings

    if (todayBookings) {
      for (const booking of todayBookings) {
        const lesson = booking.group_lesson as any;
        if (!lesson?.starts_at) continue;

        const lessonDate = new Date(lesson.starts_at);
        // Check if lesson is today
        if (lessonDate < today || lessonDate >= tomorrow) continue;

        const timeStr = lessonDate.toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Tokyo',
        });

        const storeName = lesson.store_id === 'kanamitsu' ? '金光店' : '玉島店';

        await sendPush(supabase, booking.user_id, {
          title: '本日のご予約',
          body: `${timeStr}から「${lesson.title}」のご予約がございます（${storeName}）`,
          data: { screen: 'GroupLessonDetail', lessonId: booking.id },
        });

        results.reminders++;
      }
    }
  }

  // ============================================================
  // 2. Post-visit Review Requests - Send to users whose booking was yesterday
  // ============================================================
  if (type === 'all' || type === 'reviews') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get yesterday's completed bookings
    const { data: completedBookings } = await supabase
      .from('group_lesson_bookings')
      .select(`
        id, user_id,
        group_lesson:group_lessons(title, starts_at)
      `)
      .in('status', ['confirmed', 'completed']);

    if (completedBookings) {
      for (const booking of completedBookings) {
        const lesson = booking.group_lesson as any;
        if (!lesson?.starts_at) continue;

        const lessonDate = new Date(lesson.starts_at);
        // Check if lesson was yesterday
        if (lessonDate < yesterday || lessonDate >= today) continue;

        // Check if user has opted out of review requests
        const { data: profile } = await supabase
          .from('profiles')
          .select('review_opt_out')
          .eq('id', booking.user_id)
          .single();

        if (profile?.review_opt_out) continue;

        await sendPush(supabase, booking.user_id, {
          title: '昨日のご来院ありがとうございました',
          body: `「${lesson.title}」はいかがでしたか？よろしければ口コミをお願いいたします`,
          data: { screen: 'ReviewRequest', lessonTitle: lesson.title },
        });

        results.reviews++;
      }
    }
  }

  return new Response(
    JSON.stringify({ success: true, ...results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

async function sendPush(
  supabase: any,
  userId: string,
  notification: { title: string; body: string; data?: Record<string, unknown> }
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', userId)
    .single();

  if (!profile?.expo_push_token) return;

  await supabase.from('notification_log').insert({
    user_id: userId,
    title: notification.title,
    body: notification.body,
    data: notification.data,
  });

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: profile.expo_push_token,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: 'default',
    }),
  });
}
