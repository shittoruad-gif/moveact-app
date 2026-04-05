import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BookingChoiceScreen } from '../screens/booking/BookingChoiceScreen';
import { BookingWebViewScreen } from '../screens/booking/BookingWebViewScreen';
import { BookingCalendarScreen } from '../screens/booking/BookingCalendarScreen';
import { BookingConfirmScreen } from '../screens/booking/BookingConfirmScreen';
import { BookingCompleteScreen } from '../screens/booking/BookingCompleteScreen';
import { CounselingSheetScreen } from '../screens/booking/CounselingSheetScreen';
import { StoreGuideScreen } from '../screens/booking/StoreGuideScreen';
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
      <Stack.Screen name="BookingCalendar" component={BookingCalendarScreen} options={{ title: '日時を選択' }} />
      <Stack.Screen name="BookingConfirm" component={BookingConfirmScreen} options={{ title: '予約確認' }} />
      <Stack.Screen name="BookingComplete" component={BookingCompleteScreen} options={{ title: '予約完了', headerBackVisible: false }} />
      <Stack.Screen name="CounselingSheet" component={CounselingSheetScreen} options={{ title: 'カウンセリングシート' }} />
      <Stack.Screen name="StoreGuide" component={StoreGuideScreen} options={{ title: '店舗案内' }} />
      <Stack.Screen name="GroupLessonList" component={GroupLessonListScreen} options={{ title: 'グループレッスン' }} />
      <Stack.Screen name="GroupLessonDetail" component={GroupLessonDetailScreen} options={{ title: 'レッスン詳細' }} />
      <Stack.Screen name="MenuPrice" component={MenuPriceScreen} options={{ title: '料金メニュー' }} />
    </Stack.Navigator>
  );
}
