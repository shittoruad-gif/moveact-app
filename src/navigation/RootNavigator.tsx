import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, View } from 'react-native';
import { AuthStack } from './AuthStack';
import { MainTabs } from './MainTabs';
import { useAuthStore } from '../stores/authStore';
import { COLORS } from '../lib/constants';
import type { RootStackParamList } from '../types/navigation';

// Set to true to preview the main app without authentication
const PREVIEW_MODE = false;

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { session, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const showMain = PREVIEW_MODE || !!session;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {showMain ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Auth" component={AuthStack} />
      )}
    </Stack.Navigator>
  );
}
