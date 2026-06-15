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

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase-mobile';

// Returns true when running inside the Expo Go client (SDK 53+ dropped Android
// push support in Expo Go, so we must skip all Notifications API calls there).
function isExpoGo(): boolean {
  return Constants.appOwnership === 'expo';
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Expo Go (SDK 53+) removed Android push notifications — bail out silently.
  if (isExpoGo()) {
    console.log('[Push] Skipping push setup in Expo Go client.');
    return null;
  }

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
      lightColor: '#0f172a',
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

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      // Replace with your actual Expo project ID from app.json / EAS
      projectId: undefined,
    });
    console.log('[Push] Expo Push Token:', tokenData.data);
    return tokenData.data;
  } catch (err) {
    console.warn('[Push] Failed to obtain push token:', err);
    return null;
  }
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
  if (isExpoGo()) return;

  try {
    // Configure foreground presentation here (not at module level) so it never
    // runs in Expo Go, which throws on any Notifications API call on Android SDK 53+.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    const token = await registerForPushNotificationsAsync();
    if (token) {
      await savePushTokenToProfile(userId, token);
    }
  } catch (err) {
    console.warn('[Push] initPushNotifications failed:', err);
  }
}
