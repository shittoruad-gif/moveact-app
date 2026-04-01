import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { RootNavigator } from './src/navigation/RootNavigator';
import { useAuth } from './src/hooks/useAuth';
import { useStoreSelection } from './src/stores/storeSelectionStore';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F1EC', padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#D32F2F', marginBottom: 8 }}>エラーが発生しました</Text>
          <Text style={{ fontSize: 13, color: '#666', textAlign: 'center' }}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { isLoading } = useAuth();
  const { loadFromStorage } = useStoreSelection();

  useEffect(() => {
    loadFromStorage();
  }, []);

  // Web linking config for react-navigation
  const linking = Platform.OS === 'web' ? {
    prefixes: ['/'],
    config: {
      screens: {
        Auth: 'auth',
        Main: {
          screens: {
            HomeTab: { screens: { Home: '' } },
            BookingTab: { screens: { BookingChoice: 'booking' } },
            TicketTab: { screens: { TicketDashboard: 'tickets' } },
            ShopTab: { screens: { ProductList: 'shop' } },
            AccountTab: { screens: { Account: 'account' } },
          },
        },
      },
    },
  } as const : undefined;

  return (
    <NavigationContainer linking={linking as any}>
      <StatusBar style="light" />
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
