-- ============================================================
-- Update store info, ticket plans to universal system
-- ============================================================

-- Fix tamashima booking URL (lowercase)
UPDATE stores SET
  booking_url = 'https://airrsv.net/moveact-tamashima/calendar',
  address = '岡山県倉敷市玉島中央町3丁目'
WHERE id = 'tamashima';

-- Make treatment_type nullable for universal tickets
ALTER TABLE ticket_plans ALTER COLUMN treatment_type DROP NOT NULL;

-- Add bonus description field
ALTER TABLE ticket_plans ADD COLUMN IF NOT EXISTS bonus_description TEXT;

-- Deactivate old ticket plans
UPDATE ticket_plans SET is_active = false;

-- Insert new universal ticket plans
INSERT INTO ticket_plans (name, treatment_type, total_sessions, price, validity_days, sort_order, bonus_description) VALUES
  ('5回券', NULL, 5, 33000, 90, 1, '15分延長チケット付き'),
  ('10回券', NULL, 11, 66000, 180, 2, '+1回分ボーナス付き'),
  ('15回券', NULL, 17, 99000, 270, 3, '+2回分ボーナス付き'),
  ('グループレッスン月4回チケット', 'group_pilates', 4, 10000, 30, 10, '1回あたり¥2,500');
