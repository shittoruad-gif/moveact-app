import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TicketDashboardScreen } from '../screens/tickets/TicketDashboardScreen';
import { TicketPurchaseScreen } from '../screens/tickets/TicketPurchaseScreen';
import { COLORS } from '../lib/constants';
import type { TicketStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<TicketStackParamList>();

export function TicketStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="TicketDashboard" component={TicketDashboardScreen} options={{ title: '回数券・サブスク' }} />
      <Stack.Screen name="TicketPurchase" component={TicketPurchaseScreen} options={{ title: '回数券プラン一覧' }} />
    </Stack.Navigator>
  );
}
