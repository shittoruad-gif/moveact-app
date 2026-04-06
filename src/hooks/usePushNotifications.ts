import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import type { EventSubscription } from 'expo-modules-core';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

// Configure notification handler (shown when app is in foreground)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushNotifications() {
  const session = useAuthStore((s) => s.session);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;

    registerForPushNotifications().then((token) => {
      if (token) {
        setExpoPushToken(token);
        savePushToken(session.user.id, token);
      }
    });

    // Listen for incoming notifications (app in foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener(
      (_notification) => {
        // Notification received while app is in foreground
        // The handler above will show it as a banner
      }
    );

    // Listen for notification taps (user clicked notification)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (_response) => {
        // Navigation is handled in App.tsx via navigationRef
      }
    );

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [session?.user?.id]);

  return { expoPushToken };
}

async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return null;
  }

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Moveact',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C4956A',
      sound: 'default',
    });
  }

  // Get Expo push token
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId ?? '06ac98a0-2e36-4879-bbfc-d3b85f8e78cf',
    });
    return tokenData.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

async function savePushToken(userId: string, token: string) {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ expo_push_token: token })
      .eq('id', userId);

    if (error) {
      console.error('Failed to save push token:', error);
    }
  } catch (error) {
    console.error('Error saving push token:', error);
  }
}
