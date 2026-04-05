-- Staff commission rates and revenue tracking
-- Each staff has a commission_rate (e.g., 0.50 = 50%, 0.40 = 40%)

-- Add commission_rate to profiles for staff/admin
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commission_rate numeric(4,2) DEFAULT 0.50;

-- Staff revenue view: bookings completed by each staff
-- Revenue comes from app_bookings (treatment sessions) with treatment_menu price
CREATE OR REPLACE VIEW staff_monthly_revenue AS
SELECT
  b.staff_id,
  p.full_name AS staff_name,
  p.commission_rate,
  DATE_TRUNC('month', b.starts_at) AS month,
  COUNT(*) AS session_count,
  SUM(tm.price) AS gross_revenue,
  SUM(tm.price * p.commission_rate) AS commission_amount
FROM app_bookings b
JOIN profiles p ON p.id = b.staff_id
JOIN treatment_menus tm ON tm.id = b.treatment_menu_id
WHERE b.status = 'completed'
  AND b.staff_id IS NOT NULL
GROUP BY b.staff_id, p.full_name, p.commission_rate, DATE_TRUNC('month', b.starts_at);

-- RLS: staff can only see their own revenue, admin can see all
-- Note: Views inherit from underlying table RLS, so we use a function instead

CREATE OR REPLACE FUNCTION get_staff_revenue(
  p_staff_id uuid DEFAULT NULL,
  p_year int DEFAULT EXTRACT(YEAR FROM NOW()),
  p_month int DEFAULT EXTRACT(MONTH FROM NOW())
)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  commission_rate numeric,
  booking_date date,
  menu_name text,
  customer_name text,
  price int,
  commission int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_user_id uuid := auth.uid();
BEGIN
  -- Get caller's role
  SELECT role INTO v_role FROM profiles WHERE id = v_user_id;

  -- Admin can see all staff, staff can only see themselves
  IF v_role = 'admin' THEN
    -- Admin: if p_staff_id is null, show all staff; otherwise filter
    RETURN QUERY
    SELECT
      b.staff_id,
      sp.full_name::text AS staff_name,
      sp.commission_rate,
      b.starts_at::date AS booking_date,
      tm.name::text AS menu_name,
      cp.full_name::text AS customer_name,
      tm.price::int AS price,
      (tm.price * sp.commission_rate)::int AS commission
    FROM app_bookings b
    JOIN profiles sp ON sp.id = b.staff_id
    JOIN treatment_menus tm ON tm.id = b.treatment_menu_id
    LEFT JOIN profiles cp ON cp.id = b.user_id
    WHERE b.status = 'completed'
      AND b.staff_id IS NOT NULL
      AND EXTRACT(YEAR FROM b.starts_at) = p_year
      AND EXTRACT(MONTH FROM b.starts_at) = p_month
      AND (p_staff_id IS NULL OR b.staff_id = p_staff_id)
    ORDER BY b.starts_at DESC;

  ELSIF v_role = 'staff' THEN
    -- Staff: only their own data
    RETURN QUERY
    SELECT
      b.staff_id,
      sp.full_name::text AS staff_name,
      sp.commission_rate,
      b.starts_at::date AS booking_date,
      tm.name::text AS menu_name,
      cp.full_name::text AS customer_name,
      tm.price::int AS price,
      (tm.price * sp.commission_rate)::int AS commission
    FROM app_bookings b
    JOIN profiles sp ON sp.id = b.staff_id
    JOIN treatment_menus tm ON tm.id = b.treatment_menu_id
    LEFT JOIN profiles cp ON cp.id = b.user_id
    WHERE b.status = 'completed'
      AND b.staff_id = v_user_id
      AND EXTRACT(YEAR FROM b.starts_at) = p_year
      AND EXTRACT(MONTH FROM b.starts_at) = p_month
    ORDER BY b.starts_at DESC;
  END IF;
END;
$$;
