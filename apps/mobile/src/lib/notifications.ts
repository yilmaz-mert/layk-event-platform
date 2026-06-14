// ── Push Notification Infrastructure ────────────────────────────────────────
//
// Architecture note (replacing web notification.mp3):
//   The web app plays notification.mp3 via a browser Audio() instance when a
//   realtime INSERT arrives on the notifications table.  On mobile that trick
//   is replaced by Expo Push Notifications:
//
//   1. This module obtains a device-specific Expo Push Token on first launch.
//   2. The token is written to the user's profile row in Supabase.
//   3. Database triggers (which already fire for web-audio) will be extended
//      (or new Supabase Edge Functions will be created) to POST the token to
//      https://exp.host/--/api/v2/push/send when a new notification row is
//      inserted, delivering native push payloads instead of playing audio.
//   4. The Edge Function approach means no app-side polling is needed and
//      push delivery works even when the app is fully closed.

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase-mobile';

// Configure how incoming pushes appear while the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Push notifications are only available on physical devices
  if (!Device.isDevice) {
    console.warn('[Push] Push notifications require a physical device.');
    return null;
  }

  // Android requires a notification channel for foreground delivery
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('layk-default', {
      name: "L'Ayk Notifications",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2d2f47',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('[Push] Permission not granted for push notifications.');
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    // Replace with your actual Expo project ID from app.json / EAS
    projectId: undefined,
  });

  console.log('[Push] Expo Push Token:', tokenData.data);
  return tokenData.data;
}

// Persist the Expo Push Token on the user's profile row so database triggers
// and Edge Functions can address this device.
export async function savePushTokenToProfile(
  userId: string,
  token: string,
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ push_token: token })
    .eq('id', userId);

  if (error) {
    console.error('[Push] Failed to save push token:', error.message);
  } else {
    console.log('[Push] Token saved for user', userId);
  }
}

// Call once in App.tsx (or a profile-loaded effect) to wire up the full flow.
export async function initPushNotifications(userId: string): Promise<void> {
  const token = await registerForPushNotificationsAsync();
  if (token) {
    await savePushTokenToProfile(userId, token);
  }
}
