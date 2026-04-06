-- ===================================================
-- 012: Coupons, Referrals, Birthday field
-- ===================================================

-- Add date_of_birth to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('birthday', 'referral', 'campaign')),
  title TEXT NOT NULL,
  description TEXT,
  discount_amount INTEGER,   -- yen discount (also used as cap when both set)
  discount_percent INTEGER,  -- % discount
  applicable_to TEXT NOT NULL DEFAULT 'all' CHECK (applicable_to IN ('treatment', 'shop', 'all')),  -- where coupon can be used
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_user ON coupons(user_id);
CREATE INDEX IF NOT EXISTS idx_coupons_type ON coupons(type);

-- Referrals table
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id),
  referred_name TEXT,
  referred_phone TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'registered', 'completed')),
  referral_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);

-- RLS
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own coupons" ON coupons
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own referrals" ON referrals
  FOR SELECT USING (auth.uid() = referrer_user_id);
CREATE POLICY "Users can create referrals" ON referrals
  FOR INSERT WITH CHECK (auth.uid() = referrer_user_id);

-- ===================================================
-- Birthday coupon function
-- Call this via cron or Edge Function on 1st of each month
-- ===================================================
CREATE OR REPLACE FUNCTION generate_birthday_coupons()
RETURNS void AS $$
DECLARE
  r RECORD;
  current_month INTEGER;
  coupon_valid_from DATE;
  coupon_valid_until DATE;
BEGIN
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  coupon_valid_from := DATE_TRUNC('month', CURRENT_DATE);
  coupon_valid_until := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

  FOR r IN
    SELECT id, full_name
    FROM profiles
    WHERE date_of_birth IS NOT NULL
      AND EXTRACT(MONTH FROM date_of_birth) = current_month
      AND id NOT IN (
        SELECT user_id FROM coupons
        WHERE type = 'birthday'
          AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
          AND EXTRACT(MONTH FROM created_at) = current_month
      )
  LOOP
    INSERT INTO coupons (
      user_id, code, type, title, description,
      discount_percent, discount_amount, applicable_to, valid_from, valid_until
    ) VALUES (
      r.id,
      'BDAY-' || TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || SUBSTRING(r.id::TEXT FROM 1 FOR 8),
      'birthday',
      r.full_name || 'さん、お誕生日おめでとうございます',
      'お誕生月の特別クーポンです。施術・商品購入から20%OFF（上限1,000円）となります。',
      20,
      1000,
      'all',
      coupon_valid_from,
      coupon_valid_until
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Update profile trigger to save date_of_birth from auth metadata
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, full_name_kana, phone, email, date_of_birth, preferred_store, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name_kana', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.email,
    CASE
      WHEN NEW.raw_user_meta_data->>'date_of_birth' IS NOT NULL
        AND NEW.raw_user_meta_data->>'date_of_birth' != ''
      THEN (NEW.raw_user_meta_data->>'date_of_birth')::DATE
      ELSE NULL
    END,
    'kanamitsu',
    'customer'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    full_name_kana = COALESCE(EXCLUDED.full_name_kana, profiles.full_name_kana),
    phone = COALESCE(EXCLUDED.phone, profiles.phone),
    email = COALESCE(EXCLUDED.email, profiles.email),
    date_of_birth = COALESCE(EXCLUDED.date_of_birth, profiles.date_of_birth);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
