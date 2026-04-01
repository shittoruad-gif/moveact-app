-- Add review opt-out flag to profiles
ALTER TABLE profiles ADD COLUMN review_opt_out BOOLEAN DEFAULT false;

-- Schedule morning push notifications (8:00 AM JST = 23:00 UTC previous day)
-- This requires pg_cron extension enabled in Supabase Dashboard
-- SELECT cron.schedule(
--   'morning-reminders',
--   '0 23 * * *',
--   $$SELECT net.http_post(
--     url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
--     ),
--     body := '{"type":"all"}'::jsonb
--   );$$
-- );
