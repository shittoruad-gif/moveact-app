-- ============================================================
-- Seed Data for Moveact App
-- ============================================================

-- Stores
INSERT INTO stores (id, name, address, phone, booking_url) VALUES
  ('kanamitsu', '金光店', '岡山県浅口市金光町占見新田283-1 2階', '07022318300', 'https://airrsv.net/Moveact/calendar'),
  ('tamashima', '玉島店', '岡山県倉敷市玉島', '', 'https://airrsv.net/Moveact-tamashima/calendar');

-- Treatment Menus
INSERT INTO treatment_menus (treatment_type, name, description, duration_minutes, price, sort_order) VALUES
  ('biyou_hari', '肌質改善美容鍼', '美容鍼 + 電気鍼（パルス） + 小顔矯正 + 石膏パック', 90, 13200, 1),
  ('biyou_hari', '美容鍼＋石膏パック', 'お顔全体と頭にアプローチ', 60, 9900, 2),
  ('biyou_hari', '美容鍼＋小顔矯正', 'シミ、シワ、むくみなどのお悩みがある方', 60, 9900, 3),
  ('biyou_hari', '美容鍼', '美容鍼 + 電気鍼（パルス）', 45, 6600, 4),
  ('seitai', '根本改善整体', '全身の整体とピラティスを組み合わせて痛みや凝りの原因を根本から取ります', 90, 13200, 5),
  ('seitai', '姿勢改善整体', 'お姿勢のお悩みを骨盤から整えていきます', 60, 6600, 6),
  ('seitai', '痛み改善整体', '上半身か下半身から選んでいただきます', 45, 6600, 7),
  ('seitai', '鍼灸施術', '自律神経や頭痛などのお悩みがある方', 45, 6600, 8),
  ('reflexology', 'リフレクソロジー 20分', '足裏の反射区を刺激し、全身のバランスを整えます', 20, 2980, 9),
  ('pilates', 'パーソナルピラティス', 'マンツーマンでのピラティス指導', 60, 6600, 10),
  ('pilates', '二人でピラティス', 'ペアでのピラティスレッスン（1人あたり）', 60, 3500, 11),
  ('group_pilates', 'グループピラティス', 'グループでのピラティスレッスン', 60, 3000, 12);

-- Store-Treatment associations (金光店: all, 玉島店: all except some)
INSERT INTO store_treatment_menus (store_id, treatment_menu_id)
SELECT 'kanamitsu', id FROM treatment_menus;

INSERT INTO store_treatment_menus (store_id, treatment_menu_id)
SELECT 'tamashima', id FROM treatment_menus;

-- Ticket Plans
INSERT INTO ticket_plans (name, treatment_type, total_sessions, price, validity_days, sort_order) VALUES
  ('整体 5回券', 'seitai', 5, 29700, 90, 1),
  ('整体 10回券', 'seitai', 10, 52800, 180, 2),
  ('美容鍼 5回券', 'biyou_hari', 5, 29700, 90, 3),
  ('美容鍼 10回券', 'biyou_hari', 10, 52800, 180, 4),
  ('ピラティス 5回券', 'pilates', 5, 29700, 90, 5),
  ('ピラティス 10回券', 'pilates', 10, 52800, 180, 6),
  ('グループピラティス 5回券', 'group_pilates', 5, 13200, 90, 7),
  ('グループピラティス 10回券', 'group_pilates', 10, 24000, 180, 8);

-- Sample announcements
INSERT INTO announcements (store_id, title, body, published_at, is_active) VALUES
  (NULL, 'アプリリリースのお知らせ', 'Moveact公式アプリをリリースしました。アプリから予約、回数券の管理、商品の購入が可能です。', now(), true),
  ('kanamitsu', '金光店 年末年始の営業時間', '12月30日〜1月3日は休業とさせていただきます。', now(), true),
  ('tamashima', '玉島店 新メニューのお知らせ', 'リフレクソロジーメニューが新登場！足裏から全身のバランスを整えます。', now(), true);
