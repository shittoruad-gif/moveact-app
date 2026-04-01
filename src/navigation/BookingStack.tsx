import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BookingChoiceScreen } from '../screens/booking/BookingChoiceScreen';
import { BookingWebViewScreen } from '../screens/booking/BookingWebViewScreen';
import { GroupLessonListScreen } from '../screens/booking/GroupLessonListScreen';
import { GroupLessonDetailScreen } from '../screens/booking/GroupLessonDetailScreen';
import { MenuPriceScreen } from '../screens/booking/MenuPriceScreen';
import { COLORS } from '../lib/constants';
import type { BookingStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<BookingStackParamList>();

export function BookingStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="BookingChoice" component={BookingChoiceScreen} options={{ title: '予約' }} />
      <Stack.Screen name="BookingWebView" component={BookingWebViewScreen} options={{ title: 'Web予約' }} />
      <Stack.Screen name="GroupLessonList" component={GroupLessonListScreen} options={{ title: 'グループレッスン' }} />
      <Stack.Screen name="GroupLessonDetail" component={GroupLessonDetailScreen} options={{ title: 'レッスン詳細' }} />
      <Stack.Screen name="MenuPrice" component={MenuPriceScreen} options={{ title: '料金メニュー' }} />
    </Stack.Navigator>
  );
}
