-- Migration 088: 休み枠を考慮したスタッフ割当のための公開ビュー（監査 H-5）
-- =====================================================
-- 旧状態: staff_unavailability は staff/admin のみ SELECT 可。顧客側の
--   確定時スタッフ割当ロジックでは常に0件 → 休み中スタッフに予約が
--   割り当たることがあった（066のEXCLUDE制約は予約同士の重なりしか防がない）。
-- 対策: 非機微カラム(reason除外)だけを公開ビューで提供。
--   public_staff_roster / store_business_hours と同方針。
--   ビューは所有者(postgres)権限で実行され基底表のRLSを回避するため、
--   reason等の機微情報を晒さずに割当判定だけ可能にする。
-- =====================================================

CREATE OR REPLACE VIEW public_staff_unavailability AS
  SELECT staff_id, store_id, starts_at, ends_at, block_type
  FROM staff_unavailability;

GRANT SELECT ON public_staff_unavailability TO anon, authenticated;
