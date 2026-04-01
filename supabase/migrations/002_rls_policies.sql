-- ============================================================
-- Row Level Security Policies
-- ============================================================

-- Helper: check if current user is staff or admin
CREATE OR REPLACE FUNCTION is_staff_or_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('staff', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PROFILES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own_profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "staff_read_all_profiles" ON profiles FOR SELECT USING (is_staff_or_admin());
CREATE POLICY "staff_update_all_profiles" ON profiles FOR UPDATE USING (is_staff_or_admin());

-- STORES (public read)
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_stores" ON stores FOR SELECT USING (true);
CREATE POLICY "admin_manage_stores" ON stores FOR ALL USING (is_staff_or_admin());

-- TREATMENT MENUS (public read)
ALTER TABLE treatment_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_menus" ON treatment_menus FOR SELECT USING (true);
CREATE POLICY "staff_manage_menus" ON treatment_menus FOR ALL USING (is_staff_or_admin());

-- TICKET PLANS (public read)
ALTER TABLE ticket_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_ticket_plans" ON ticket_plans FOR SELECT USING (true);
CREATE POLICY "staff_manage_ticket_plans" ON ticket_plans FOR ALL USING (is_staff_or_admin());

-- USER TICKETS
ALTER TABLE user_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_tickets" ON user_tickets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "staff_manage_tickets" ON user_tickets FOR ALL USING (is_staff_or_admin());

-- TICKET USAGE LOG
ALTER TABLE ticket_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_usage" ON ticket_usage_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM user_tickets WHERE id = ticket_usage_log.user_ticket_id AND user_id = auth.uid()));
CREATE POLICY "staff_manage_usage" ON ticket_usage_log FOR ALL USING (is_staff_or_admin());

-- SUBSCRIPTION PLANS (public read)
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_sub_plans" ON subscription_plans FOR SELECT USING (true);
CREATE POLICY "staff_manage_sub_plans" ON subscription_plans FOR ALL USING (is_staff_or_admin());

-- USER SUBSCRIPTIONS
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_subs" ON user_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "staff_manage_subs" ON user_subscriptions FOR ALL USING (is_staff_or_admin());

-- GROUP LESSONS (public read)
ALTER TABLE group_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_lessons" ON group_lessons FOR SELECT USING (true);
CREATE POLICY "staff_manage_lessons" ON group_lessons FOR ALL USING (is_staff_or_admin());

-- GROUP LESSON BOOKINGS
ALTER TABLE group_lesson_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_bookings" ON group_lesson_bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_bookings" ON group_lesson_bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_update_own_bookings" ON group_lesson_bookings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "staff_manage_bookings" ON group_lesson_bookings FOR ALL USING (is_staff_or_admin());

-- WAITLIST
ALTER TABLE group_lesson_waitlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_waitlist" ON group_lesson_waitlist FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_waitlist" ON group_lesson_waitlist FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "staff_manage_waitlist" ON group_lesson_waitlist FOR ALL USING (is_staff_or_admin());

-- CANCELLATION CHARGES
ALTER TABLE cancellation_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_charges" ON cancellation_charges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "staff_manage_charges" ON cancellation_charges FOR ALL USING (is_staff_or_admin());

-- PRODUCTS (public read active)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_active_products" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "staff_manage_products" ON products FOR ALL USING (is_staff_or_admin());

-- PRODUCT IMAGES (public read)
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_images" ON product_images FOR SELECT USING (true);
CREATE POLICY "staff_manage_images" ON product_images FOR ALL USING (is_staff_or_admin());

-- STORE PRODUCTS
ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_store_products" ON store_products FOR SELECT USING (true);
CREATE POLICY "staff_manage_store_products" ON store_products FOR ALL USING (is_staff_or_admin());

-- ORDERS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_orders" ON orders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_orders" ON orders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "staff_manage_orders" ON orders FOR ALL USING (is_staff_or_admin());

-- ORDER ITEMS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_order_items" ON order_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM orders WHERE id = order_items.order_id AND user_id = auth.uid()));
CREATE POLICY "staff_manage_order_items" ON order_items FOR ALL USING (is_staff_or_admin());

-- NOTIFICATION LOG
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_read_own_notifications" ON notification_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_update_own_notifications" ON notification_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "staff_manage_notifications" ON notification_log FOR ALL USING (is_staff_or_admin());

-- ANNOUNCEMENTS (public read active)
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_announcements" ON announcements FOR SELECT USING (is_active = true);
CREATE POLICY "staff_manage_announcements" ON announcements FOR ALL USING (is_staff_or_admin());

-- STORE TREATMENT MENUS
ALTER TABLE store_treatment_menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_store_menus" ON store_treatment_menus FOR SELECT USING (true);
CREATE POLICY "staff_manage_store_menus" ON store_treatment_menus FOR ALL USING (is_staff_or_admin());

-- Enable Realtime for group_lessons (capacity updates)
ALTER PUBLICATION supabase_realtime ADD TABLE group_lessons;
