import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { HomeStack } from './HomeStack';
import { BookingStack } from './BookingStack';
import { TicketStack } from './TicketStack';
import { ShopStack } from './ShopStack';
import { AccountStack } from './AccountStack';
import { COLORS } from '../lib/constants';
import { Ionicons } from '@expo/vector-icons';
import type { MainTabParamList } from '../types/navigation';

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.accent,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.borderLight,
          borderTopWidth: 0.5,
          paddingTop: 6,
          height: 84,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          letterSpacing: 0.3,
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          title: 'ホーム',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="BookingTab"
        component={BookingStack}
        options={{
          title: '予約',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="TicketTab"
        component={TicketStack}
        options={{
          title: '回数券',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ticket-outline" size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ShopTab"
        component={ShopStack}
        options={{
          title: 'ショップ',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bag-outline" size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="AccountTab"
        component={AccountStack}
        options={{
          title: 'マイページ',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
