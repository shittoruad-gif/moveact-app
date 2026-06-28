-- Migration 080: 学割リンク追加 + payment_links.auto_match（初回前金の自動照合対象フラグ）
-- =====================================================
-- 学割（学生割引）の都度決済リンクを2つ追加（AirPayで作成済の実URL）:
--   ・学割 30分（3,500円）
--   ・学割 三上指名・指名料込み（4,400円）
--
-- 重要: 3,500円は既存の「Moveact 事前決済（3,500円）」(074)と金額が重複し、
--   さらにメニュー「二人でピラティス(3,500円)」が存在するため、初回前金ゲート
--   (create-web-booking が金額一致で自動案内)が曖昧になる。
--   → payment_links.auto_match を追加。学割・カタログ用リンクは false にして
--     「自動案内の対象外（スタッフが手動でURL共有する用途）」とする。
--   create-web-booking 側は .eq('auto_match', true) を付与（既存074リンクは既定true=従来通り）。
--
-- 注: 「初回で使うのは3,980/5,980のみ」にゲートを限定するか（=他の金額を auto_match=false に
--   するか）、および初回前金を定額(3,980/5,980)にするかは別途ユーザー確認の上で対応。
--   本migrationでは学割の追加と衝突回避のみを行い、既存リンクの自動照合は変更しない。
-- =====================================================

ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS auto_match BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN payment_links.auto_match IS
  '初回客の事前決済ゲート(create-web-booking)が金額一致で自動案内してよいか。学割・カタログ用リンクはfalseにし手動共有のみとする。';

INSERT INTO payment_links (provider, amount, label, url, store_id, is_active, is_subscription, auto_match) VALUES
  ('airpay', 3500, '学割 30分（3,500円）',                 'https://web.online.airpayment.jp/payment?planId=PLWjz6a3GqC4QUB0pm', NULL, true, false, false),
  ('airpay', 4400, '学割 三上指名・指名料込み（4,400円）', 'https://web.online.airpayment.jp/payment?planId=PLjFTQSUCCdIs7ZRcp', NULL, true, false, false);
