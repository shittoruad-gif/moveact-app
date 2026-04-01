// Supabase Database Types
// In production, generate with: npx supabase gen types typescript --project-id <id>

export type StoreId = 'kanamitsu' | 'tamashima';
export type TreatmentType = 'seitai' | 'biyou_hari' | 'pilates' | 'group_pilates' | 'reflexology';
export type TicketStatus = 'active' | 'expired' | 'fully_used' | 'cancelled';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'past_due';
export type OrderStatus = 'pending' | 'paid' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'refunded';
export type BookingStatus = 'confirmed' | 'cancelled_by_user' | 'cancelled_same_day' | 'completed' | 'no_show';
export type CancellationChargeType = 'ticket_deduction' | 'stripe_charge' | 'waived';
export type UserRole = 'customer' | 'staff' | 'admin';

export interface Profile {
  id: string;
  full_name: string;
  full_name_kana: string | null;
  phone: string | null;
  email: string | null;
  preferred_store: StoreId;
  role: UserRole;
  line_user_id: string | null;
  expo_push_token: string | null;
  stripe_customer_id: string | null;
  review_opt_out: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: StoreId;
  name: string;
  address: string;
  phone: string | null;
  booking_url: string;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
}

export interface TreatmentMenu {
  id: string;
  treatment_type: TreatmentType;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface TicketPlan {
  id: string;
  name: string;
  treatment_type: TreatmentType | null;
  total_sessions: number;
  price: number;
  price_per_session: number;
  validity_days: number;
  is_active: boolean;
  sort_order: number;
  bonus_description: string | null;
  target_tags: string[];
  created_at: string;
}

export interface UserTicket {
  id: string;
  user_id: string;
  ticket_plan_id: string;
  store_id: StoreId;
  total_sessions: number;
  remaining_sessions: number;
  status: TicketStatus;
  purchased_at: string;
  expires_at: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  ticket_plan?: TicketPlan;
}

export interface TicketUsageLog {
  id: string;
  user_ticket_id: string;
  reason: string;
  sessions_deducted: number;
  related_booking_id: string | null;
  staff_id: string | null;
  note: string | null;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  treatment_type: TreatmentType;
  sessions_per_month: number;
  monthly_price: number;
  stripe_price_id: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  subscription_plan_id: string;
  store_id: StoreId;
  status: SubscriptionStatus;
  stripe_subscription_id: string;
  current_period_start: string;
  current_period_end: string;
  sessions_remaining_this_period: number;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  subscription_plan?: SubscriptionPlan;
}

export interface GroupLesson {
  id: string;
  store_id: StoreId;
  title: string;
  instructor_name: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  max_capacity: number;
  current_bookings: number;
  price: number;
  is_ticket_eligible: boolean;
  is_cancelled: boolean;
  created_at: string;
  updated_at: string;
}

export interface GroupLessonBooking {
  id: string;
  user_id: string;
  group_lesson_id: string;
  status: BookingStatus;
  payment_method: string | null;
  user_ticket_id: string | null;
  user_subscription_id: string | null;
  stripe_payment_intent_id: string | null;
  booked_at: string;
  cancelled_at: string | null;
  created_at: string;
  // Joined data
  group_lesson?: GroupLesson;
}

export interface CancellationCharge {
  id: string;
  user_id: string;
  booking_id: string | null;
  charge_type: CancellationChargeType;
  amount: number | null;
  user_ticket_id: string | null;
  stripe_payment_intent_id: string | null;
  processed_by: string | null;
  note: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  sku: string | null;
  stock_quantity: number;
  category: string | null;
  is_active: boolean;
  sort_order: number;
  stripe_price_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  images?: ProductImage[];
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  sort_order: number;
  created_at: string;
}

export interface Order {
  id: string;
  user_id: string;
  store_id: StoreId;
  status: OrderStatus;
  subtotal: number;
  tax: number;
  total: number;
  stripe_payment_intent_id: string | null;
  pickup_store: StoreId | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  items?: OrderItem[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  created_at: string;
  // Joined data
  product?: Product;
}

export interface Announcement {
  id: string;
  store_id: StoreId | null;
  title: string;
  body: string | null;
  image_url: string | null;
  published_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface NotificationLog {
  id: string;
  user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  sent_at: string;
}

// Supabase Database type helper
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string; full_name: string }; Update: Partial<Profile> };
      stores: { Row: Store; Insert: Store; Update: Partial<Store> };
      treatment_menus: { Row: TreatmentMenu; Insert: Omit<TreatmentMenu, 'id' | 'created_at'>; Update: Partial<TreatmentMenu> };
      ticket_plans: { Row: TicketPlan; Insert: Omit<TicketPlan, 'id' | 'price_per_session' | 'created_at'>; Update: Partial<TicketPlan> };
      user_tickets: { Row: UserTicket; Insert: Omit<UserTicket, 'id' | 'created_at' | 'updated_at'>; Update: Partial<UserTicket> };
      ticket_usage_log: { Row: TicketUsageLog; Insert: Omit<TicketUsageLog, 'id' | 'created_at'>; Update: Partial<TicketUsageLog> };
      subscription_plans: { Row: SubscriptionPlan; Insert: Omit<SubscriptionPlan, 'id' | 'created_at'>; Update: Partial<SubscriptionPlan> };
      user_subscriptions: { Row: UserSubscription; Insert: Omit<UserSubscription, 'id' | 'created_at' | 'updated_at'>; Update: Partial<UserSubscription> };
      group_lessons: { Row: GroupLesson; Insert: Omit<GroupLesson, 'id' | 'current_bookings' | 'created_at' | 'updated_at'>; Update: Partial<GroupLesson> };
      group_lesson_bookings: { Row: GroupLessonBooking; Insert: Omit<GroupLessonBooking, 'id' | 'created_at'>; Update: Partial<GroupLessonBooking> };
      cancellation_charges: { Row: CancellationCharge; Insert: Omit<CancellationCharge, 'id' | 'created_at'>; Update: Partial<CancellationCharge> };
      products: { Row: Product; Insert: Omit<Product, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Product> };
      product_images: { Row: ProductImage; Insert: Omit<ProductImage, 'id' | 'created_at'>; Update: Partial<ProductImage> };
      orders: { Row: Order; Insert: Omit<Order, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Order> };
      order_items: { Row: OrderItem; Insert: Omit<OrderItem, 'id' | 'created_at'>; Update: Partial<OrderItem> };
      announcements: { Row: Announcement; Insert: Omit<Announcement, 'id' | 'created_at'>; Update: Partial<Announcement> };
      notification_log: { Row: NotificationLog; Insert: Omit<NotificationLog, 'id' | 'sent_at'>; Update: Partial<NotificationLog> };
    };
  };
}
