import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AccountScreen } from '../screens/account/AccountScreen';
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
    </Stack.Navigator>
  );
}
