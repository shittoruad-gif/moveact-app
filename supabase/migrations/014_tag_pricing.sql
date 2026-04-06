-- Tag-based pricing for treatment menus
-- Customers with specific tags (VIP, 旧料金, etc.) get different prices

CREATE TABLE IF NOT EXISTS menu_tag_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_menu_id uuid NOT NULL REFERENCES treatment_menus(id) ON DELETE CASCADE,
  tag text NOT NULL,
  price int NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(treatment_menu_id, tag)
);

-- RLS
ALTER TABLE menu_tag_prices ENABLE ROW LEVEL SECURITY;

-- Everyone can read tag prices (needed for booking flow)
CREATE POLICY "Anyone can read menu_tag_prices"
  ON menu_tag_prices FOR SELECT
  USING (true);

-- Only staff/admin can manage
CREATE POLICY "Staff can manage menu_tag_prices"
  ON menu_tag_prices FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff', 'admin'))
  );

-- Index for fast lookup
CREATE INDEX idx_menu_tag_prices_menu ON menu_tag_prices(treatment_menu_id);
CREATE INDEX idx_menu_tag_prices_tag ON menu_tag_prices(tag);

-- Helper function: get the effective price for a user on a menu
-- Returns the first matching tag price, or the default menu price
CREATE OR REPLACE FUNCTION get_effective_price(
  p_menu_id uuid,
  p_user_id uuid
)
RETURNS TABLE (price int, applied_tag text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tags text[];
  v_tag text;
  v_price int;
BEGIN
  -- Get user's tags
  SELECT tags INTO v_tags FROM profiles WHERE id = p_user_id;

  -- Check each tag for a matching price (first match wins)
  IF v_tags IS NOT NULL THEN
    FOREACH v_tag IN ARRAY v_tags LOOP
      SELECT mtp.price INTO v_price
      FROM menu_tag_prices mtp
      WHERE mtp.treatment_menu_id = p_menu_id AND mtp.tag = v_tag;

      IF v_price IS NOT NULL THEN
        price := v_price;
        applied_tag := v_tag;
        RETURN NEXT;
        RETURN;
      END IF;
    END LOOP;
  END IF;

  -- No tag match: return default price
  SELECT tm.price INTO v_price FROM treatment_menus tm WHERE tm.id = p_menu_id;
  price := v_price;
  applied_tag := NULL;
  RETURN NEXT;
END;
$$;
