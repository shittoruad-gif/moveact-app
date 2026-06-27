-- Migration 076: 三上特別料金＋Moveact標準料金の16件決済リンク登録
-- 【内訳】
-- ・Moveact標準（都度）: 3,980円、5,980円 [既成・URL確定]
-- ・三上尚志（都度）: 5,500円、11,000円 [URL作成予定]
-- ・三上特別料金（定期）: 60分/45分/30分 × 月1-4回の12プラン
-- ※定期決済のlabelに「- 定期決済」を付与して区別
-- ※URL作成前の一時登録。実URLはAirPay管理画面で作成後、updatesで置換

INSERT INTO payment_links (provider, amount, label, url, store_id, is_active) VALUES
  -- 既成2件（Moveact標準・都度決済）
  ('airpay',  3980, 'Moveact 事前決済（3,980円）',  'https://web.online.airpayment.jp/payment?planId=PLQurMkicu1xWLqPk2', NULL, true),
  ('airpay',  5980, 'Moveact 事前決済（5,980円）',  'https://web.online.airpayment.jp/payment?planId=PLXgWOk5zA4M1LAgSs', NULL, true),

  -- 三上尚志・都度決済2件（ステータス=false、URL後続）
  ('airpay',  5500, '三上尚志 施術事前決済（5,500円・1回）', 'https://web.online.airpayment.jp/payment?planId=PENDING_5500', NULL, false),
  ('airpay', 11000, '三上尚志 施術事前決済（11,000円・1回）', 'https://web.online.airpayment.jp/payment?planId=PENDING_11000', NULL, false),

  -- 三上特別料金・定期決済プラン12件
  -- 60分コース
  ('airpay',  7700, '三上特別料金 60分月1回（7,700円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_60_1', NULL, false),
  ('airpay', 14500, '三上特別料金 60分月2回（14,500円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_60_2', NULL, false),
  ('airpay', 21300, '三上特別料金 60分月3回（21,300円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_60_3', NULL, false),
  ('airpay', 28000, '三上特別料金 60分月4回（28,000円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_60_4', NULL, false),

  -- 45分コース
  ('airpay',  5770, '三上特別料金 45分月1回（5,770円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_45_1', NULL, false),
  ('airpay', 11000, '三上特別料金 45分月2回（11,000円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_45_2', NULL, false),
  ('airpay', 15900, '三上特別料金 45分月3回（15,900円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_45_3', NULL, false),
  ('airpay', 21000, '三上特別料金 45分月4回（21,000円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_45_4', NULL, false),

  -- 30分コース
  ('airpay',  3850, '三上特別料金 30分月1回（3,850円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_30_1', NULL, false),
  ('airpay',  7400, '三上特別料金 30分月2回（7,400円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_30_2', NULL, false),
  ('airpay', 10800, '三上特別料金 30分月3回（10,800円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_30_3', NULL, false),
  ('airpay', 14000, '三上特別料金 30分月4回（14,000円）- 定期決済', 'https://web.online.airpayment.jp/payment?planId=PENDING_30_4', NULL, false);
