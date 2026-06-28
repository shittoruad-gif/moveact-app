-- Migration 081: 初回前金を3,980/5,980のみに限定 + 学割(学生)系統の分離
-- =====================================================
-- ユーザー方針:
--   ・通常の初回前金は「3,980円 / 5,980円」のみ（どちらかはメニュー価格＝施術メニュー/時間で決まる）。
--     → 該当価格(3,980/5,980)のメニューを用意し、前金=メニュー価格のまま自動案内。
--     → それ以外の金額(2,980/3,000/3,500/6,600/9,900/13,200・三上都度5,500/11,000等)は
--       初回前金の自動案内対象から外す（auto_match=false）。
--   ・学割(学生割引)はWeb予約に組み込む。学生選択時はメニュー価格に対応する学割価格で請求:
--       3,980円 → 3,500円 / 5,980円 → 4,400円（create-web-booking のSTUDENT_DEPOSIT対応表）。
--     学割リンクは is_student=true で分類し、通常のauto_matchとは別系統で照合する。
-- =====================================================

ALTER TABLE payment_links
  ADD COLUMN IF NOT EXISTS is_student BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN payment_links.is_student IS
  '学割(学生割引)リンク。Web予約で学生選択時の前金照合に使う(通常のauto_match系統とは別)。';

-- 学割リンクを学生用に分類（080で追加した3,500/4,400）
UPDATE payment_links SET is_student = true
  WHERE label LIKE '学割%';

-- 通常の初回前金の自動案内は 3,980/5,980 のみ（定期・学割・その他金額は対象外）
UPDATE payment_links
  SET auto_match = (amount IN (3980, 5980) AND is_subscription = false AND is_student = false);
