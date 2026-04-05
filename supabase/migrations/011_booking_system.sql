-- ===================================================
-- 011: In-App Booking System + Favorites + Counseling
-- ===================================================

-- App Bookings (in-app reservation system)
CREATE TABLE IF NOT EXISTS app_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  store_id TEXT NOT NULL,
  treatment_menu_id UUID NOT NULL REFERENCES treatment_menus(id),
  staff_id UUID REFERENCES auth.users(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  buffer_before INTEGER NOT NULL DEFAULT 15, -- minutes
  buffer_after INTEGER NOT NULL DEFAULT 15,  -- minutes
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled', 'no_show')),
  payment_method TEXT CHECK (payment_method IN ('prepaid', 'onsite')),
  prepayment_url TEXT,
  stripe_payment_intent_id TEXT,
  note TEXT,
  created_by TEXT NOT NULL DEFAULT 'client' CHECK (created_by IN ('client', 'staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for booking queries
CREATE INDEX IF NOT EXISTS idx_app_bookings_store_date ON app_bookings(store_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_app_bookings_user ON app_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_app_bookings_status ON app_bookings(status);

-- Staff Schedule
CREATE TABLE IF NOT EXISTS staff_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES auth.users(id),
  store_id TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(staff_id, date)
);

-- Counseling Sheets
CREATE TABLE IF NOT EXISTS counseling_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  booking_id UUID REFERENCES app_bookings(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  responses JSONB NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counseling_user ON counseling_sheets(user_id);

-- Favorites
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

-- RLS Policies
ALTER TABLE app_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE counseling_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- App Bookings: users can see their own, staff/admin can see all
CREATE POLICY "Users can view own bookings" ON app_bookings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create bookings" ON app_bookings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bookings" ON app_bookings
  FOR UPDATE USING (auth.uid() = user_id);

-- Staff schedules: everyone can read (for availability), staff can manage own
CREATE POLICY "Anyone can view schedules" ON staff_schedules
  FOR SELECT USING (true);

-- Counseling sheets: users see/create their own
CREATE POLICY "Users can view own sheets" ON counseling_sheets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create sheets" ON counseling_sheets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sheets" ON counseling_sheets
  FOR UPDATE USING (auth.uid() = user_id);

-- Favorites: users see/manage their own
CREATE POLICY "Users can view own favorites" ON favorites
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create favorites" ON favorites
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own favorites" ON favorites
  FOR DELETE USING (auth.uid() = user_id);

-- Function to check booking conflicts (including buffer time)
CREATE OR REPLACE FUNCTION check_booking_conflict(
  p_store_id TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_buffer_before INTEGER DEFAULT 15,
  p_buffer_after INTEGER DEFAULT 15
) RETURNS BOOLEAN AS $$
DECLARE
  conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO conflict_count
  FROM app_bookings
  WHERE store_id = p_store_id
    AND status NOT IN ('cancelled')
    AND (
      -- Check if the new booking (with buffer) overlaps with existing bookings (with their buffer)
      (p_starts_at - (p_buffer_before || ' minutes')::INTERVAL) < (ends_at + (buffer_after || ' minutes')::INTERVAL)
      AND
      (p_ends_at + (p_buffer_after || ' minutes')::INTERVAL) > (starts_at - (buffer_before || ' minutes')::INTERVAL)
    );
  RETURN conflict_count > 0;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_app_bookings_updated
  BEFORE UPDATE ON app_bookings
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_counseling_sheets_updated
  BEFORE UPDATE ON counseling_sheets
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();
