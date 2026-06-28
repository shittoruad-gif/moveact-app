-- Migration 082: 初回専用メニュー追加（3,980円・5,980円）
-- 事前決済ゲートが発動する価格帯のメニューを用意する。
-- auto_match=true の payment_links がある 3,980/5,980 に対応。
-- =====================================================

INSERT INTO treatment_menus (treatment_type, name, description, duration_minutes, price, sort_order)
VALUES
  ('seitai', '初回施術（カウンセリング込み）', 'お身体の状態を確認しながら丁寧にご案内します', 45, 3980, 0),
  ('biyou_hari', '美容鍼＋小顔矯正（初回）', 'はじめての方向けの美容鍼・小顔矯正体験', 60, 5980, 0);

-- 両店舗に追加（重複防止のため NOT EXISTS チェック）
INSERT INTO store_treatment_menus (store_id, treatment_menu_id)
SELECT 'tamashima', tm.id
FROM treatment_menus tm
WHERE tm.price IN (3980, 5980)
  AND NOT EXISTS (
    SELECT 1 FROM store_treatment_menus stm
    WHERE stm.store_id = 'tamashima' AND stm.treatment_menu_id = tm.id
  );

INSERT INTO store_treatment_menus (store_id, treatment_menu_id)
SELECT 'kanamitsu', tm.id
FROM treatment_menus tm
WHERE tm.price IN (3980, 5980)
  AND NOT EXISTS (
    SELECT 1 FROM store_treatment_menus stm
    WHERE stm.store_id = 'kanamitsu' AND stm.treatment_menu_id = tm.id
  );
