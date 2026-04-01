-- ============================================================
-- Moveact App Database Schema
-- ============================================================

-- ENUMS
CREATE TYPE store_id AS ENUM ('kanamitsu', 'tamashima');
CREATE TYPE treatment_type AS ENUM ('seitai', 'biyou_hari', 'pilates', 'group_pilates', 'reflexology');
CREATE TYPE ticket_status AS ENUM ('active', 'expired', 'fully_used', 'cancelled');
CREATE TYPE subscription_status AS ENUM ('active', 'paused', 'cancelled', 'past_due');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled', 'refunded');
CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled_by_user', 'cancelled_same_day', 'completed', 'no_show');
CREATE TYPE cancellation_charge_type AS ENUM ('ticket_deduction', 'stripe_charge', 'waived');
CREATE TYPE user_role AS ENUM ('customer', 'staff', 'admin');

-- ============================================================
-- PROFILES
-- ============================================================
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

-- Auto-create profile on signup
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

-- ============================================================
-- STORES
-- ============================================================
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

-- ============================================================
-- TREATMENT MENUS
-- ============================================================
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

-- ============================================================
-- TICKET PLANS
-- ============================================================
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

-- ============================================================
-- USER TICKETS
-- ============================================================
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

-- ============================================================
-- SUBSCRIPTION PLANS
-- ============================================================
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

-- ============================================================
-- GROUP LESSONS
-- ============================================================
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

-- ============================================================
-- CANCELLATION CHARGES
-- ============================================================
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

-- ============================================================
-- PRODUCTS
-- ============================================================
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

-- ============================================================
-- ORDERS
-- ============================================================
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

-- ============================================================
-- NOTIFICATIONS & ANNOUNCEMENTS
-- ============================================================
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

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- Increment booking count for a lesson
CREATE OR REPLACE FUNCTION increment_lesson_bookings(lesson_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE group_lessons
  SET current_bookings = current_bookings + 1,
      updated_at = now()
  WHERE id = lesson_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decrement booking count for a lesson
CREATE OR REPLACE FUNCTION decrement_lesson_bookings(lesson_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE group_lessons
  SET current_bookings = GREATEST(current_bookings - 1, 0),
      updated_at = now()
  WHERE id = lesson_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Deduct a ticket session
CREATE OR REPLACE FUNCTION deduct_ticket_session(
  p_ticket_id UUID,
  p_reason TEXT,
  p_booking_id UUID DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Deduct session
  UPDATE user_tickets
  SET remaining_sessions = remaining_sessions - 1,
      status = CASE WHEN remaining_sessions - 1 <= 0 THEN 'fully_used'::ticket_status ELSE status END,
      updated_at = now()
  WHERE id = p_ticket_id AND remaining_sessions > 0;

  -- Log usage
  INSERT INTO ticket_usage_log (user_ticket_id, reason, sessions_deducted, related_booking_id, staff_id, note)
  VALUES (p_ticket_id, p_reason, 1, p_booking_id, p_staff_id, p_note);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
