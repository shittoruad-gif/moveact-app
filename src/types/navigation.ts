import type { StoreId } from './database';

// Auth Stack
export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  Onboarding: undefined;
};

// Home Stack
export type HomeStackParamList = {
  Home: undefined;
  AnnouncementDetail: { id: string };
};

// Booking Stack
export type BookingStackParamList = {
  BookingChoice: undefined;
  BookingWebView: { storeId: StoreId };
  // 店舗選択＋クーポン選択（予約の最初のステップ）
  BookingStart: { isNewCustomer?: boolean };
  BookingCalendar: { menuId?: string; isNewCustomer?: boolean; storeId?: StoreId; couponId?: string };
  BookingConfirm: { menuId: string; dateTime: string; staffId?: string; isNewCustomer?: boolean; storeId?: StoreId; couponId?: string };
  BookingComplete: { bookingId: string; isNewCustomer?: boolean };
  CounselingSheet: { bookingId: string };
  StoreGuide: { storeId: StoreId };
  GroupLessonList: undefined;
  GroupLessonDetail: { lessonId: string };
  MenuPrice: undefined;
  AfterHoursRequest: { storeId?: StoreId };
};

// Ticket Stack
export type TicketStackParamList = {
  TicketDashboard: undefined;
  TicketPurchase: undefined;
  Subscription: undefined;
  PurchaseHistory: undefined;
};

// Shop Stack
export type ShopStackParamList = {
  ProductList: undefined;
  ProductDetail: { productId: string };
  // 商品注文フロー（店頭受取・店頭支払い）
  ProductCheckout: { productId: string; quantity?: number };
  OrderComplete: { orderId: string };
};

// Account Stack
export type AccountStackParamList = {
  Account: undefined;
  MyBookings: undefined;
  Reschedule: { bookingId: string };
  OrderHistory: undefined;
  CustomerReceipt: { orderId: string };
  Favorites: undefined;
  BookingHistory: undefined;
  CouponList: undefined;
  ReferralScreen: undefined;
  NotificationSettings: undefined;
  StoreSelect: undefined;
  LineLink: undefined;
};

// Staff Stack
export type StaffStackParamList = {
  StaffDashboard: undefined;
  CustomerList: undefined;
  CustomerDetail: { userId: string };
  StaffBookingList: undefined;
  StaffBookingDetail: { bookingId: string };
  Reschedule: { bookingId: string };
  StaffBookingForm: { customerId: string; presetMenuId?: string };
  LineNotificationLog: undefined;
  StaffOrderList: undefined;
  StaffRevenue: undefined;
  CouponManagement: undefined;
  KarteForm: { customerId: string; karteId?: string; bookingId?: string };
  KarteDetail: { karteId: string };
  StaffRegistration: undefined;
  // Staff ops expansion
  BookingPrep: { date?: string };
  WeekCalendar: undefined;
  StaffUnavailability: undefined;
  CancellationReport: undefined;
  LineMessageCompose: { customerId: string };
  AnnouncementList: undefined;
  AnnouncementForm: { announcementId?: string };
  BirthdayList: undefined;
  InactiveCustomers: undefined;
  StaffNotes: undefined;
  StaffNoteForm: { noteId?: string };
  DailyReport: { date?: string };
  ReceiptList: undefined;
  ReceiptForm: { customerId?: string; amount?: number; sourceType?: string; sourceId?: string };
  ReceiptView: { receiptId: string };
  WalkInSale: undefined;
  InventoryAlert: undefined;
  MenuAnalytics: undefined;
  MenuTagPricing: undefined;
  StoreHours: undefined;
  StaffRoster: undefined;
  StaffLineGroup: undefined;
  AfterHoursAdmin: undefined;
  DepositAdmin: undefined;
  PilatesLibrary: undefined;
  ReferralAdmin: undefined;
  AirReserveSources: undefined;
  AirReserveSourceForm: { sourceId?: string };
  StaffProductList: undefined;
  StaffProductForm: { productId?: string };
};

// Main Tabs
export type MainTabParamList = {
  HomeTab: undefined;
  BookingTab: undefined;
  TicketTab: undefined;
  ShopTab: undefined;
  AccountTab: undefined;
  StaffTab: undefined;
};

// Root
export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
};
