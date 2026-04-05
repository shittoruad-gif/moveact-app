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
  BookingCalendar: { menuId?: string; isNewCustomer?: boolean };
  BookingConfirm: { menuId: string; dateTime: string; staffId?: string; isNewCustomer?: boolean };
  BookingComplete: { bookingId: string; isNewCustomer?: boolean };
  CounselingSheet: { bookingId: string };
  StoreGuide: { storeId: StoreId };
  GroupLessonList: undefined;
  GroupLessonDetail: { lessonId: string };
  MenuPrice: undefined;
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
  Cart: undefined;
  Checkout: undefined;
  OrderComplete: { orderId: string };
};

// Account Stack
export type AccountStackParamList = {
  Account: undefined;
  OrderHistory: undefined;
  Favorites: undefined;
  BookingHistory: undefined;
  CouponList: undefined;
  ReferralScreen: undefined;
  NotificationSettings: undefined;
  StoreSelect: undefined;
};

// Staff Stack
export type StaffStackParamList = {
  StaffDashboard: undefined;
  CustomerList: undefined;
  CustomerDetail: { userId: string };
  StaffBookingList: undefined;
  StaffBookingDetail: { bookingId: string };
  StaffOrderList: undefined;
  StaffRevenue: undefined;
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
  Main: undefined;
};
