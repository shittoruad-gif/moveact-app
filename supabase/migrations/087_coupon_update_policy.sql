-- Migration 087: クーポンの「使用済み」更新をRLSで許可（監査 H-6）
-- =====================================================
-- 旧状態: coupons は SELECT ポリシーのみ。顧客セッションからの
--   UPDATE(is_used=true) が 0 行で黙って失敗し、同じクーポンを
--   有効期限内に何度でも使い回せた（売上漏れ）。
-- 対策: 本人の「未使用」クーポンに限り UPDATE を許可する。
--   USING で is_used=false の行だけ対象 → 一度使ったら再更新不可。
--   WITH CHECK で user_id の付け替えを禁止。
-- ※ 恒久策は予約作成と同一トランザクションでの消費(RPC化)だが、
--   まずは黙示失敗による使い回しを止める。
-- =====================================================

DROP POLICY IF EXISTS "Users can mark own coupon used" ON coupons;
CREATE POLICY "Users can mark own coupon used" ON coupons
  FOR UPDATE
  USING (auth.uid() = user_id AND is_used = false)
  WITH CHECK (auth.uid() = user_id);
