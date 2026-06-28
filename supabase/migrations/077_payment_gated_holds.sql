-- Migration 077: 事前決済ゲート（お支払い完了で予約確定）＋ 仮押さえの自動失効
-- =====================================================
-- 方針変更: 初回のお客様は「事前決済が完了するまで予約が確定しない」運用にする。
--   ・create-web-booking は初回客の予約を【仮押さえ】で作成する:
--       status='confirmed'（枠はEXCLUDE制約で物理的に確保）＋ deposit_status='pending'
--       ＋ hold_expires_at（既定30分後）。
--   ・お客様がAirペイで決済 → Web予約ページに戻り「お支払いが完了しました」を押す
--       → confirm-web-booking が deposit_status='paid' にして hold を解除＝予約確定。
--   ・AirペイにはAPI/Webhookが無いため、確定の合図は【お客様の自己申告】。
--       スタッフがAirペイの入金メールで突き合わせできるよう deposit_self_reported を残す。
--   ・期限内に決済（自己申告）が無い仮押さえは hold_expires_at を過ぎると自動キャンセルし、
--       枠を解放する（EXCLUDE制約は status<>'cancelled' でのみ効くため、明示的にキャンセルが必要）。
--
-- 既存列との関係（重複作成しない）:
--   ・deposit_status / deposit_amount / deposit_paid_at / deposit_paid_by は 067・069 で作成済み。
--   ・status の CHECK は 011 のまま（confirmed/completed/cancelled/no_show）。新値は足さない。
--   ・source（app/web/staff）は 041 で作成済み。Web由来のみ自動失効の対象にする。
-- =====================================================

-- 1) 仮押さえの失効期限と、顧客自己申告フラグ
ALTER TABLE app_bookings
  ADD COLUMN IF NOT EXISTS hold_expires_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposit_self_reported  BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN app_bookings.hold_expires_at IS
  '事前決済の仮押さえ期限。これを過ぎた未払い(deposit_status=pending)のWeb予約は自動キャンセルされ枠が解放される。決済確定時はNULLに戻す。';
COMMENT ON COLUMN app_bookings.deposit_self_reported IS
  'お客様自身が「お支払いが完了しました」を押して確定したか。true=Airペイの入金メールでスタッフが突合する対象（deposit_paid_byはNULL）。';

-- 2) 失効スイープ用の部分インデックス（pending かつ未キャンセルのみ）
CREATE INDEX IF NOT EXISTS idx_app_bookings_hold_expiry
  ON app_bookings (hold_expires_at)
  WHERE deposit_status = 'pending' AND status = 'confirmed';

-- 3) 期限切れの未払い仮押さえをキャンセルして枠を解放する関数
--    Web予約由来のみ対象（アプリ/スタッフ作成の予約は触らない）。返り値=解放件数。
CREATE OR REPLACE FUNCTION cancel_expired_deposit_holds()
RETURNS integer AS $$
DECLARE
  n integer;
BEGIN
  UPDATE app_bookings
     SET status = 'cancelled'
   WHERE deposit_status = 'pending'
     AND status = 'confirmed'
     AND source = 'web'
     AND hold_expires_at IS NOT NULL
     AND hold_expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cancel_expired_deposit_holds() IS
  '事前決済の期限切れ仮押さえ(Web予約・pending)を cancelled にして枠を解放する。Edge Functionが予約処理の冒頭で都度呼ぶほか、pg_cronでも定期実行する。';

-- 4) pg_cron で5分ごとに自動スイープ（Edge Functionの都度実行と二重の保険）
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('cancel-expired-deposit-holds');
EXCEPTION WHEN OTHERS THEN
  NULL; -- 未登録なら無視
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'cancel-expired-deposit-holds',
    '*/5 * * * *',
    $cron$ SELECT cancel_expired_deposit_holds(); $cron$
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron が未有効でも他のEdge Function側スイープで担保するため失敗させない
  RAISE NOTICE 'cron.schedule skipped (pg_cron unavailable?): %', SQLERRM;
END $$;
