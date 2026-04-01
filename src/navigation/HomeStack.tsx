import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/home/HomeScreen';
import { COLORS } from '../lib/constants';
import type { HomeStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
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
        name="Home"
        component={HomeScreen}
        options={{ title: 'Moveact' }}
      />
    </Stack.Navigator>
  );
}
