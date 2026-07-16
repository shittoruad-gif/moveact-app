// Edge Function 共通の push 通知ヘルパー
// =====================================================
// Expo Push API への送信。タイムアウト + リトライ機能つき。

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const FETCH_TIMEOUT_MS = 10_000; // 10秒
const MAX_RETRIES = 2;

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
}

/**
 * 指定ユーザーに push 通知を送る。失敗時はリトライ。最終的に失敗しても throw しない（呼び出し側を止めない）。
 */
export async function sendPushNotification(
  supabase: SupabaseClient,
  userId: string,
  notification: PushPayload,
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('expo_push_token')
    .eq('id', userId)
    .single();

  if (!profile?.expo_push_token) return;

  const sent = await sendWithRetry(profile.expo_push_token, notification);

  // 通知履歴を残す（送信成功・失敗どちらでも記録）
  try {
    await supabase.from('notification_log').insert({
      user_id: userId,
      title: notification.title,
      body: notification.body,
      data: notification.data,
    });
  } catch {
    // ログ保存失敗は無視
  }

  if (!sent) {
    console.warn('Push notification failed after retries:', { userId });
  }
}

async function sendWithRetry(token: string, notification: PushPayload): Promise<boolean> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const success = await sendOnce(token, notification);
    if (success) return true;
    if (attempt < MAX_RETRIES) {
      const wait = Math.min(2000 * Math.pow(2, attempt), 8000);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return false;
}

async function sendOnce(token: string, notification: PushPayload): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: token,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        sound: notification.sound ?? 'default',
      }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
