import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AccountScreen } from '../screens/account/AccountScreen';
import { OrderHistoryScreen } from '../screens/account/OrderHistoryScreen';
import { FavoritesScreen } from '../screens/account/FavoritesScreen';
import { CouponListScreen } from '../screens/account/CouponListScreen';
import { ReferralScreen } from '../screens/account/ReferralScreen';
import { COLORS } from '../lib/constants';
import type { AccountStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<AccountStackParamList>();

export function AccountStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Account" component={AccountScreen} options={{ title: 'マイページ' }} />
      <Stack.Screen name="OrderHistory" component={OrderHistoryScreen} options={{ title: '注文履歴' }} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ title: 'お気に入り' }} />
      <Stack.Screen name="CouponList" component={CouponListScreen} options={{ title: 'クーポン' }} />
      <Stack.Screen name="ReferralScreen" component={ReferralScreen} options={{ title: 'お友達紹介' }} />
    </Stack.Navigator>
  );
}
