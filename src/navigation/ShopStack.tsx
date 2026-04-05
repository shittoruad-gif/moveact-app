import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ProductListScreen } from '../screens/shop/ProductListScreen';
import { ProductDetailScreen } from '../screens/shop/ProductDetailScreen';
import { CartScreen } from '../screens/shop/CartScreen';
import { CheckoutScreen } from '../screens/shop/CheckoutScreen';
import { OrderCompleteScreen } from '../screens/shop/OrderCompleteScreen';
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
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: '商品詳細' }} />
      <Stack.Screen name="Cart" component={CartScreen} options={{ title: 'カート' }} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: '注文確認' }} />
      <Stack.Screen name="OrderComplete" component={OrderCompleteScreen} options={{ title: '注文完了', headerBackVisible: false }} />
    </Stack.Navigator>
  );
}
