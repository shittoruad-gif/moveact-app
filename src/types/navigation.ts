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
};

// Account Stack
export type AccountStackParamList = {
  Account: undefined;
  OrderHistory: undefined;
  NotificationSettings: undefined;
  StoreSelect: undefined;
};

// Main Tabs
export type MainTabParamList = {
  HomeTab: undefined;
  BookingTab: undefined;
  TicketTab: undefined;
  ShopTab: undefined;
  AccountTab: undefined;
};

// Root
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};
