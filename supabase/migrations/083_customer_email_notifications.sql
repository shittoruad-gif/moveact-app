-- Migration 083: 顧客メール通知トラッキング + 前日リマインダーcron
-- =====================================================
-- 予約確認メール・前日リマインドメールの送信済みフラグを app_bookings に追加。
-- pg_cron で毎朝09:00 JST (=00:00 UTC) に send-daily-reminders を呼ぶ。
-- =====================================================

ALTER TABLE app_bookings
  ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN app_bookings.confirmation_email_sent_at IS
  '予約確認メールを顧客に送信した日時。NULLは未送信（メールなし客含む）。';
COMMENT ON COLUMN app_bookings.reminder_email_sent_at IS
  '前日リマインドメールを顧客に送信した日時。NULLは未送信。';

-- 毎日09:00 JST (= 00:00 UTC) に前日リマインドを送信する
-- ※ RESEND_API_KEY を Supabase Dashboard > Edge Functions > Secrets に設定すること
SELECT cron.schedule(
  'send-daily-reminders',
  '0 0 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://khsriogicdjdyivshplc.supabase.co/functions/v1/send-daily-reminders',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
