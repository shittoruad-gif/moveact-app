-- ============================================================
-- Moveact App - ALL MIGRATIONS COMBINED
-- Run this entire file in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 001: SCHEMA
-- ============================================================

CREATE TYPE store_id AS ENUM ('kanamitsu', 'tamashima');
CREATE TYPE treatment_type AS ENUM ('seitai', 'biyou_hari', 'pilates', 'group_pilates', 'reflexology');
CREATE TYPE ticket_status AS ENUM ('active', 'expired', 'fully_used', 'cancelled');
CREATE TYPE subscription_status AS ENUM ('active', 'paused', 'cancelled', 'past_due');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled', 'refunded');
CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled_by_user', 'cancelled_same_day', 'completed', 'no_show');
CREATE TYPE cancellation_charge_type AS ENUM ('ticket_deduction', 'stripe_charge', 'waived');
CREATE TYPE user_role AS ENUM ('customer', 'staff', 'admin');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  full_name_kana TEXT,
  phone TEXT,
  email TEXT,
  preferred_store store_id DEFAULT 'kanamitsu',
  role user_role DEFAULT 'customer',
  line_user_id TEXT,
  expo_push_token TEXT,
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.phone,
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE TABLE stores (
  id store_id PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  booking_url TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE treatment_menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_type treatment_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  price INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE store_treatment_menus (
  store_id store_id REFERENCES stores(id),
  treatment_menu_id UUID REFERENCES treatment_menus(id),
  is_available BOOLEAN DEFAULT true,
  PRIMARY KEY (store_id, treatment_menu_id)
);

CREATE TABLE ticket_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  treatment_type treatment_type NOT NULL,
  total_sessions INTEGER NOT NULL,
  price INTEGER NOT NULL,
  price_per_session INTEGER GENERATED ALWAYS AS (price / total_sessions) STORED,
  validity_days INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  ticket_plan_id UUID NOT NULL REFERENCES ticket_plans(id),
  store_id store_id NOT NULL REFERENCES stores(id),
  total_sessions INTEGER NOT NULL,
  remaining_sessions INTEGER NOT NULL,
  status ticket_status DEFAULT 'active',
  purchased_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ticket_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_ticket_id UUID NOT NULL REFERENCES user_tickets(id),
  reason TEXT NOT NULL,
  sessions_deducted INTEGER NOT NULL DEFAULT 1,
  related_booking_id UUID,
  staff_id UUID REFERENCES profiles(id),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  treatment_type treatment_type NOT NULL,
  sessions_per_month INTEGER NOT NULL,
  monthly_price INTEGER NOT NULL,
  stripe_price_id TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  subscription_plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  store_id store_id NOT NULL REFERENCES stores(id),
  status subscription_status DEFAULT 'active',
  stripe_subscription_id TEXT NOT NULL,
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  sessions_remaining_this_period INTEGER NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE group_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id store_id NOT NULL REFERENCES stores(id),
  title TEXT NOT NULL,
  instructor_name TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  max_capacity INTEGER NOT NULL,
  current_bookings INTEGER DEFAULT 0,
  price INTEGER NOT NULL DEFAULT 3000,
  is_ticket_eligible BOOLEAN DEFAULT true,
  is_cancelled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_group_lessons_store_date ON group_lessons(store_id, starts_at);

CREATE TABLE group_lesson_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  group_lesson_id UUID NOT NULL REFERENCES group_lessons(id),
  status booking_status DEFAULT 'confirmed',
  payment_method TEXT,
  user_ticket_id UUID REFERENCES user_tickets(id),
  user_subscription_id UUID REFERENCES user_subscriptions(id),
  stripe_payment_intent_id TEXT,
  booked_at TIMESTAMPTZ DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, group_lesson_id)
);

CREATE TABLE group_lesson_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  group_lesson_id UUID NOT NULL REFERENCES group_lessons(id),
  position INTEGER NOT NULL,
  is_notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, group_lesson_id)
);

CREATE TABLE cancellation_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  booking_id UUID REFERENCES group_lesson_bookings(id),
  charge_type cancellation_charge_type NOT NULL,
  amount INTEGER,
  user_ticket_id UUID REFERENCES user_tickets(id),
  stripe_payment_intent_id TEXT,
  processed_by UUID REFERENCES profiles(id),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  compare_at_price INTEGER,
  sku TEXT UNIQUE,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  stripe_price_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE store_products (
  store_id store_id REFERENCES stores(id),
  product_id UUID REFERENCES products(id),
  stock_quantity INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  PRIMARY KEY (store_id, product_id)
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  store_id store_id NOT NULL REFERENCES stores(id),
  status order_status DEFAULT 'pending',
  subtotal INTEGER NOT NULL,
  tax INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  stripe_payment_intent_id TEXT,
  pickup_store store_id REFERENCES stores(id),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id store_id,
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  published_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RPC Functions
CREATE OR REPLACE FUNCTION increment_lesson_bookings(lesson_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE group_lessons
  SET current_bookings = current_bookings + 1, updated_at = now()
  WHERE id = lesson_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION decrement_lesson_bookings(lesson_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE group_lessons
  SET current_bookings = GREATEST(current_bookings - 1, 0), updated_at = now()
  WHERE id = lesson_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION deduct_ticket_session(
  p_ticket_id UUID,
  p_reason TEXT,
  p_booking_id UUID DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  UPDATE user_tickets
  SET remaining_sessions = remaining_sessions - 1,
      status = CASE WHEN remaining_sessions - 1 <= 0 THEN 'fully_used'::ticket_status ELSE status END,
      updated_at = now()
  WHERE id = p_ticket_id AND remaining_sessions > 0;

  INSERT INTO ticket_usage_log (user_ticket_id, reason, sessions_deducted, related_booking_id, staff_id, note)
  VALUES (p_ticket_id, p_reason, 1, p_booking_id, p_staff_id, p_note);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 002: RLS POLICIES
-- ============================================================

CREATE OR REPLACE FUNCTION is_staff_or_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('staff', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own_profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "staff_read_all_profiles" ON profiles FOR SELECT USING (is_staff_or_admin());
CREATE POLICY "staff_update_all_profiles" ON profiles FOR UPDATE USING (is_staff_or_admin());

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_stores" ON stores FOR SELECT USING (true);
CREATE POLICY "admin_manage_stores" ON stores FOR ALL USING (is_staff_or_admin());

ALTER TABLE treatment_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_menus" ON treatment_menus FOR SELECT USING (true);
CREATE POLICY "staff_manage_menus" ON treatment_menus FOR ALL USING (is_staff_or_admin());

ALTER TABLE ticket_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_ticket_plans" ON ticket_plans FOR SELECT USING (true);
CREATE POLICY "staff_manage_ticket_plans" ON ticket_plans FOR ALL USING (is_staff_or_admin());

ALTER TABLE user_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_tickets" ON user_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "staff_manage_tickets" ON user_tickets FOR ALL USING (is_staff_or_admin());

ALTER TABLE ticket_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_usage" ON ticket_usage_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_tickets WHERE id = ticket_usage_log.user_ticket_id AND user_id = auth.uid()));
CREATE POLICY "staff_manage_usage" ON ticket_usage_log FOR ALL USING (is_staff_or_admin());

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_sub_plans" ON subscription_plans FOR SELECT USING (true);
CREATE POLICY "staff_manage_sub_plans" ON subscription_plans FOR ALL USING (is_staff_or_admin());

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_subs" ON user_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "staff_manage_subs" ON user_subscriptions FOR ALL USING (is_staff_or_admin());

ALTER TABLE group_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_lessons" ON group_lessons FOR SELECT USING (true);
CREATE POLICY "staff_manage_lessons" ON group_lessons FOR ALL USING (is_staff_or_admin());

ALTER TABLE group_lesson_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_bookings" ON group_lesson_bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_bookings" ON group_lesson_bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_bookings" ON group_lesson_bookings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "staff_manage_bookings" ON group_lesson_bookings FOR ALL USING (is_staff_or_admin());

ALTER TABLE group_lesson_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_waitlist" ON group_lesson_waitlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_waitlist" ON group_lesson_waitlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "staff_manage_waitlist" ON group_lesson_waitlist FOR ALL USING (is_staff_or_admin());

ALTER TABLE cancellation_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_charges" ON cancellation_charges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "staff_manage_charges" ON cancellation_charges FOR ALL USING (is_staff_or_admin());

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_active_products" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "staff_manage_products" ON products FOR ALL USING (is_staff_or_admin());

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_images" ON product_images FOR SELECT USING (true);
CREATE POLICY "staff_manage_images" ON product_images FOR ALL USING (is_staff_or_admin());

ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_store_products" ON store_products FOR SELECT USING (true);
CREATE POLICY "staff_manage_store_products" ON store_products FOR ALL USING (is_staff_or_admin());

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "staff_manage_orders" ON orders FOR ALL USING (is_staff_or_admin());

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_order_items" ON order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders WHERE id = order_items.order_id AND user_id = auth.uid()));
CREATE POLICY "staff_manage_order_items" ON order_items FOR ALL USING (is_staff_or_admin());

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_notifications" ON notification_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_update_own_notifications" ON notification_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "staff_manage_notifications" ON notification_log FOR ALL USING (is_staff_or_admin());

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_announcements" ON announcements FOR SELECT USING (is_active = true);
CREATE POLICY "staff_manage_announcements" ON announcements FOR ALL USING (is_staff_or_admin());

ALTER TABLE store_treatment_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_store_menus" ON store_treatment_menus FOR SELECT USING (true);
CREATE POLICY "staff_manage_store_menus" ON store_treatment_menus FOR ALL USING (is_staff_or_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE group_lessons;

-- ============================================================
-- 003: SEED DATA
-- ============================================================

INSERT INTO stores (id, name, address, phone, booking_url) VALUES
  ('kanamitsu', '金光店', '岡山県浅口市金光町占見新田283-1 2階', '07022318300', 'https://airrsv.net/Moveact/calendar'),
  ('tamashima', '玉島店', '岡山県倉敷市玉島', '', 'https://airrsv.net/Moveact-tamashima/calendar');

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

INSERT INTO store_treatment_menus (store_id, treatment_menu_id)
SELECT 'kanamitsu', id FROM treatment_menus;

INSERT INTO store_treatment_menus (store_id, treatment_menu_id)
SELECT 'tamashima', id FROM treatment_menus;

INSERT INTO ticket_plans (name, treatment_type, total_sessions, price, validity_days, sort_order) VALUES
  ('整体 5回券', 'seitai', 5, 29700, 90, 1),
  ('整体 10回券', 'seitai', 10, 52800, 180, 2),
  ('美容鍼 5回券', 'biyou_hari', 5, 29700, 90, 3),
  ('美容鍼 10回券', 'biyou_hari', 10, 52800, 180, 4),
  ('ピラティス 5回券', 'pilates', 5, 29700, 90, 5),
  ('ピラティス 10回券', 'pilates', 10, 52800, 180, 6),
  ('グループピラティス 5回券', 'group_pilates', 5, 13200, 90, 7),
  ('グループピラティス 10回券', 'group_pilates', 10, 24000, 180, 8);

INSERT INTO announcements (store_id, title, body, published_at, is_active) VALUES
  (NULL, 'アプリリリースのお知らせ', 'Moveact公式アプリをリリースしました。アプリから予約、回数券の管理、商品の購入が可能です。', now(), true),
  ('kanamitsu', '金光店 年末年始の営業時間', '12月30日〜1月3日は休業とさせていただきます。', now(), true),
  ('tamashima', '玉島店 新メニューのお知らせ', 'リフレクソロジーメニューが新登場！足裏から全身のバランスを整えます。', now(), true);

-- ============================================================
-- 004: REVIEW OPT OUT
-- ============================================================

ALTER TABLE profiles ADD COLUMN review_opt_out BOOLEAN DEFAULT false;
