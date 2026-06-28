-- Migration 079: 三上の14リンクに実URLを設定して有効化 + 定期/都度の区別
-- =====================================================
-- 076でプレースホルダ(PENDING_*)・is_active=falseで登録した14件に、
-- AirPay管理画面で作成した実際の決済リンクURL(planId)を設定し is_active=true にする。
--
-- 重要: 事前決済ゲート(create-web-booking)はメニュー価格に一致する payment_links を
--   金額で自動照合する。定期決済(サブスク)リンクが金額一致で誤マッチすると、
--   初回客が「都度の前金」のつもりで毎月課金のサブスクに登録されてしまう。
--   → payment_links に is_subscription を追加し、ゲートは is_subscription=false のみ照合する
--     (create-web-booking 側で .eq('is_subscription', false) を付与)。
--   三上の都度2件(5,500/11,000)は前金リンク=false、三上特別料金の定期12件=true。
--
-- 定期リンクは「毎月・決済日=1日」で作成済（ユーザー指示）。
-- =====================================================

ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS is_subscription BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN payment_links.is_subscription IS
  'true=AirPay定期決済(サブスク)リンク。事前決済ゲート(create-web-booking)は金額照合の対象外にする(毎月課金への誤登録を防ぐ)。';

-- 共通: PENDINGプレースホルダを実URLに置換し有効化するヘルパ的UPDATE群
-- 都度（三上尚志 事前決済）— is_subscription=false
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLpkKHqaiL8If0RZkW', is_active=true, is_subscription=false
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_5500';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLnxtZHaL4a1XqX7nd', is_active=true, is_subscription=false
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_11000';

-- 定期（三上特別料金・毎月1日課金）— is_subscription=true
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLMP3ZYKCIZlwTS7Tb', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_60_1';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLOnjssvfyNphSURZR', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_60_2';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLUF03H0VJt5dghtD0', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_60_3';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLt43TJvQh3LQSidvl', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_60_4';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PL7rKypGvREfoG2Qga', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_45_1';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLbndbvo6txJIYOH9I', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_45_2';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PL6OVPeCDFZweuSeK2', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_45_3';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLX8OxoJCFckAfiffD', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_45_4';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLlLaNqzlfrMuXW8D6', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_30_1';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLJyzm3kCYDxHCtruP', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_30_2';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLavyEWxAtYNl535FV', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_30_3';
UPDATE payment_links SET url='https://web.online.airpayment.jp/payment?planId=PLoWEMJbDr2Gw6tC6y', is_active=true, is_subscription=true
  WHERE url='https://web.online.airpayment.jp/payment?planId=PENDING_30_4';

-- 念のため: PENDINGが残っていないか（残っていれば後続でNOTICE等に出る想定）
-- SELECT count(*) FROM payment_links WHERE url LIKE '%PENDING_%';
