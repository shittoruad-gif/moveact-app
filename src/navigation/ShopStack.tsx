import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProductListScreen } from '../screens/shop/ProductListScreen';
import { CartScreen } from '../screens/shop/CartScreen';
import { COLORS } from '../lib/constants';
import type { ShopStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<ShopStackParamList>();

export function ShopStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="ProductList" component={ProductListScreen} options={{ title: 'ショップ' }} />
      <Stack.Screen name="Cart" component={CartScreen} options={{ title: 'カート' }} />
    </Stack.Navigator>
  );
}
