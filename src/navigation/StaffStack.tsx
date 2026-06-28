import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StaffDashboardScreen } from '../screens/staff/StaffDashboardScreen';
import { CustomerListScreen } from '../screens/staff/CustomerListScreen';
import { CustomerDetailScreen } from '../screens/staff/CustomerDetailScreen';
import { StaffBookingListScreen } from '../screens/staff/StaffBookingListScreen';
import { RescheduleScreen } from '../screens/booking/RescheduleScreen';
import { StaffOrderListScreen } from '../screens/staff/StaffOrderListScreen';
import { StaffRevenueScreen } from '../screens/staff/StaffRevenueScreen';
import { CouponManagementScreen } from '../screens/staff/CouponManagementScreen';
import { KarteFormScreen } from '../screens/staff/KarteFormScreen';
import { KarteDetailScreen } from '../screens/staff/KarteDetailScreen';
import { StaffRegistrationScreen } from '../screens/staff/StaffRegistrationScreen';
import { StaffBookingFormScreen } from '../screens/staff/StaffBookingFormScreen';
import { LineNotificationLogScreen } from '../screens/staff/LineNotificationLogScreen';
// Staff ops expansion
import { BookingPrepScreen } from '../screens/staff/BookingPrepScreen';
import { WeekCalendarScreen } from '../screens/staff/WeekCalendarScreen';
import { StaffUnavailabilityScreen } from '../screens/staff/StaffUnavailabilityScreen';
import { CancellationReportScreen } from '../screens/staff/CancellationReportScreen';
import { LineMessageComposeScreen } from '../screens/staff/LineMessageComposeScreen';
import { AnnouncementListScreen } from '../screens/staff/AnnouncementListScreen';
import { AnnouncementFormScreen } from '../screens/staff/AnnouncementFormScreen';
import { BirthdayListScreen } from '../screens/staff/BirthdayListScreen';
import { InactiveCustomersScreen } from '../screens/staff/InactiveCustomersScreen';
import { StaffNotesScreen } from '../screens/staff/StaffNotesScreen';
import { StaffNoteFormScreen } from '../screens/staff/StaffNoteFormScreen';
import { DailyReportScreen } from '../screens/staff/DailyReportScreen';
import { ReceiptListScreen } from '../screens/staff/ReceiptListScreen';
import { ReceiptFormScreen } from '../screens/staff/ReceiptFormScreen';
import { ReceiptViewScreen } from '../screens/staff/ReceiptViewScreen';
import { WalkInSaleScreen } from '../screens/staff/WalkInSaleScreen';
import { InventoryAlertScreen } from '../screens/staff/InventoryAlertScreen';
import { MenuAnalyticsScreen } from '../screens/staff/MenuAnalyticsScreen';
import { MenuTagPricingScreen } from '../screens/staff/MenuTagPricingScreen';
import { StoreHoursScreen } from '../screens/staff/StoreHoursScreen';
import { StaffRosterScreen } from '../screens/staff/StaffRosterScreen';
import { StaffLineGroupScreen } from '../screens/staff/StaffLineGroupScreen';
import { PilatesLibraryScreen } from '../screens/staff/PilatesLibraryScreen';
import { ReferralAdminScreen } from '../screens/staff/ReferralAdminScreen';
import { AirReserveSourcesScreen } from '../screens/staff/AirReserveSourcesScreen';
import { AirReserveSourceFormScreen } from '../screens/staff/AirReserveSourceFormScreen';
import { StaffProductListScreen } from '../screens/staff/StaffProductListScreen';
import { StaffProductFormScreen } from '../screens/staff/StaffProductFormScreen';
import { AfterHoursAdminScreen } from '../screens/staff/AfterHoursAdminScreen';
import { DepositAdminScreen } from '../screens/staff/DepositAdminScreen';
import { COLORS } from '../lib/constants';
import type { StaffStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<StaffStackParamList>();

export function StaffStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="StaffDashboard"
        component={StaffDashboardScreen}
        options={{ title: '管理' }}
      />
      <Stack.Screen name="CustomerList" component={CustomerListScreen} options={{ title: '顧客一覧' }} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} options={{ title: '顧客カルテ' }} />
      <Stack.Screen name="StaffBookingList" component={StaffBookingListScreen} options={{ title: '予約一覧' }} />
      <Stack.Screen name="Reschedule" component={RescheduleScreen} options={{ title: '日時を変更' }} />
      <Stack.Screen name="StaffOrderList" component={StaffOrderListScreen} options={{ title: '注文管理' }} />
      <Stack.Screen name="StaffRevenue" component={StaffRevenueScreen} options={{ title: '売上・明細' }} />
      <Stack.Screen name="CouponManagement" component={CouponManagementScreen} options={{ title: 'クーポン管理' }} />
      <Stack.Screen
        name="KarteForm"
        component={KarteFormScreen}
        options={({ route }) => ({
          title: route.params.karteId ? 'カルテ編集' : '新規カルテ',
        })}
      />
      <Stack.Screen name="KarteDetail" component={KarteDetailScreen} options={{ title: 'カルテ詳細' }} />
      <Stack.Screen name="StaffRegistration" component={StaffRegistrationScreen} options={{ title: 'スタッフ登録管理' }} />
      <Stack.Screen name="StaffBookingForm" component={StaffBookingFormScreen} options={{ title: '次回予約の作成' }} />
      <Stack.Screen name="LineNotificationLog" component={LineNotificationLogScreen} options={{ title: 'LINE送信履歴' }} />

      {/* Staff ops expansion */}
      <Stack.Screen name="BookingPrep" component={BookingPrepScreen} options={{ title: '本日の準備シート' }} />
      <Stack.Screen name="WeekCalendar" component={WeekCalendarScreen} options={{ title: '週カレンダー' }} />
      <Stack.Screen name="StaffUnavailability" component={StaffUnavailabilityScreen} options={{ title: '不在・空き枠ブロック' }} />
      <Stack.Screen name="CancellationReport" component={CancellationReportScreen} options={{ title: 'キャンセル分析' }} />
      <Stack.Screen
        name="LineMessageCompose"
        component={LineMessageComposeScreen}
        options={{ title: 'LINE個別送信' }}
      />
      <Stack.Screen name="AnnouncementList" component={AnnouncementListScreen} options={{ title: 'お知らせ管理' }} />
      <Stack.Screen
        name="AnnouncementForm"
        component={AnnouncementFormScreen}
        options={({ route }) => ({
          title: route.params?.announcementId ? 'お知らせ編集' : 'お知らせ作成',
        })}
      />
      <Stack.Screen name="BirthdayList" component={BirthdayListScreen} options={{ title: '誕生日リスト' }} />
      <Stack.Screen name="InactiveCustomers" component={InactiveCustomersScreen} options={{ title: '離脱顧客' }} />
      <Stack.Screen name="StaffNotes" component={StaffNotesScreen} options={{ title: '申し送りボード' }} />
      <Stack.Screen
        name="StaffNoteForm"
        component={StaffNoteFormScreen}
        options={({ route }) => ({
          title: route.params?.noteId ? '申し送り編集' : '申し送り投稿',
        })}
      />
      <Stack.Screen name="DailyReport" component={DailyReportScreen} options={{ title: '日次レポート' }} />
      <Stack.Screen name="ReceiptList" component={ReceiptListScreen} options={{ title: '領収書一覧' }} />
      <Stack.Screen name="ReceiptForm" component={ReceiptFormScreen} options={{ title: '領収書発行' }} />
      <Stack.Screen name="ReceiptView" component={ReceiptViewScreen} options={{ title: '領収書' }} />
      <Stack.Screen name="WalkInSale" component={WalkInSaleScreen} options={{ title: '手売りレジ' }} />
      <Stack.Screen name="InventoryAlert" component={InventoryAlertScreen} options={{ title: '在庫アラート' }} />
      <Stack.Screen name="MenuAnalytics" component={MenuAnalyticsScreen} options={{ title: 'メニュー別分析' }} />
      <Stack.Screen name="MenuTagPricing" component={MenuTagPricingScreen} options={{ title: 'タグ別料金設定' }} />
      <Stack.Screen name="StoreHours" component={StoreHoursScreen} options={{ title: '営業時間・定休日' }} />
      <Stack.Screen name="StaffRoster" component={StaffRosterScreen} options={{ title: 'スタッフ店舗配属' }} />
      <Stack.Screen name="StaffLineGroup" component={StaffLineGroupScreen} options={{ title: 'グループLINE通知' }} />
      <Stack.Screen name="PilatesLibrary" component={PilatesLibraryScreen} options={{ title: '施術教材ライブラリ' }} />
      <Stack.Screen name="ReferralAdmin" component={ReferralAdminScreen} options={{ title: '紹介管理' }} />
      <Stack.Screen name="AirReserveSources" component={AirReserveSourcesScreen} options={{ title: 'Airリザーブ連携' }} />
      <Stack.Screen
        name="AirReserveSourceForm"
        component={AirReserveSourceFormScreen}
        options={({ route }) => ({
          title: route.params?.sourceId ? 'iCalソース編集' : 'iCalソース登録',
        })}
      />
      <Stack.Screen name="StaffProductList" component={StaffProductListScreen} options={{ title: '物販商品管理' }} />
      <Stack.Screen
        name="StaffProductForm"
        component={StaffProductFormScreen}
        options={({ route }) => ({
          title: route.params?.productId ? '商品編集' : '商品登録',
        })}
      />
      <Stack.Screen name="AfterHoursAdmin" component={AfterHoursAdminScreen} options={{ title: '時間外リクエスト管理' }} />
      <Stack.Screen name="DepositAdmin" component={DepositAdminScreen} options={{ title: '事前決済の管理' }} />
    </Stack.Navigator>
  );
}
