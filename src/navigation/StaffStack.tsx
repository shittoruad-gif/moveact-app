import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StaffDashboardScreen } from '../screens/staff/StaffDashboardScreen';
import { CustomerListScreen } from '../screens/staff/CustomerListScreen';
import { CustomerDetailScreen } from '../screens/staff/CustomerDetailScreen';
import { StaffBookingListScreen } from '../screens/staff/StaffBookingListScreen';
import { StaffOrderListScreen } from '../screens/staff/StaffOrderListScreen';
import { StaffRevenueScreen } from '../screens/staff/StaffRevenueScreen';
import { CouponManagementScreen } from '../screens/staff/CouponManagementScreen';
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
      <Stack.Screen
        name="CustomerList"
        component={CustomerListScreen}
        options={{ title: '顧客一覧' }}
      />
      <Stack.Screen
        name="CustomerDetail"
        component={CustomerDetailScreen}
        options={{ title: '顧客カルテ' }}
      />
      <Stack.Screen
        name="StaffBookingList"
        component={StaffBookingListScreen}
        options={{ title: '予約一覧' }}
      />
      <Stack.Screen
        name="StaffOrderList"
        component={StaffOrderListScreen}
        options={{ title: '注文管理' }}
      />
      <Stack.Screen
        name="StaffRevenue"
        component={StaffRevenueScreen}
        options={{ title: '売上・明細' }}
      />
      <Stack.Screen
        name="CouponManagement"
        component={CouponManagementScreen}
        options={{ title: 'クーポン管理' }}
      />
    </Stack.Navigator>
  );
}
