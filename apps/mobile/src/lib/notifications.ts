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

import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase-mobile';

// SDK 54+: appOwnership is deprecated; executionEnvironment is the canonical
// way to detect Expo Go. Keep the legacy fallback for any edge cases.
function isExpoGo(): boolean {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === 'expo'
  );
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Expo Go (SDK 53+) removed Android push notifications — bail out silently.
  if (isExpoGo()) {
    console.log('[Push] Skipping push setup in Expo Go client.');
    return null;
  }

  // Push notifications are only available on physical devices.
  if (!Device.isDevice) {
    console.warn('[Push] Push notifications require a physical device.');
    return null;
  }

  try {
    // Android requires a notification channel for foreground delivery.
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

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn(
        '[Push] No EAS projectId configured (app.json extra.eas.projectId) — ' +
          'getExpoPushTokenAsync will likely fail. Run `eas init` to link a project.',
      );
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
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

// ── Tap-to-navigate ──────────────────────────────────────────────────────────
//
// The `notifications` table's DB triggers already stamp a web-style `link_url`
// on every row (e.g. "/events/<id>" or "/profile?tab=support&ticketId=<uuid>").
// A future Edge Function can forward that same string as the push payload's
// `data.link_url` with zero extra mapping — this just parses it back into a
// screen the mobile Navigator understands.
export type PushDeepLink =
  | { screen: 'event-details'; eventId: string }
  | { screen: 'ticket-chat'; ticketId: string };

export function parseLinkUrl(linkUrl: string | null | undefined): PushDeepLink | null {
  if (!linkUrl) return null;

  const eventMatch = linkUrl.match(/^\/events\/([^/?]+)/);
  if (eventMatch) return { screen: 'event-details', eventId: eventMatch[1] };

  const ticketMatch = linkUrl.match(/ticketId=([^&]+)/);
  if (ticketMatch) return { screen: 'ticket-chat', ticketId: ticketMatch[1] };

  return null;
}

function extractLinkUrl(content: { data: { [key: string]: unknown } }): string | undefined {
  const linkUrl = content.data.link_url;
  return typeof linkUrl === 'string' ? linkUrl : undefined;
}

// Call once near the app root (independent of login state). Handles three
// cases: tap while app is foregrounded/backgrounded (response listener), tap
// that cold-starts the app (getLastNotificationResponseAsync), and a plain
// foreground receipt (logged only — presentation is handled by
// setNotificationHandler in initPushNotifications).
export function addNotificationListeners(onDeepLink: (link: PushDeepLink) => void): () => void {
  if (isExpoGo()) return () => {};

  const receivedSub = Notifications.addNotificationReceivedListener((notification) => {
    console.log('[Push] Received in foreground:', notification.request.content.title);
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const link = parseLinkUrl(extractLinkUrl(response.notification.request.content));
    if (link) onDeepLink(link);
  });

  Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    const link = parseLinkUrl(extractLinkUrl(response.notification.request.content));
    if (link) onDeepLink(link);
  });

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}
