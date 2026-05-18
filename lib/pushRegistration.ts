/**
 * Push notification token registration.
 *
 * Uses the NATIVE device push token (FCM on Android, APNs on iOS) via
 * Notifications.getDevicePushTokenAsync(). NOT Expo's push service —
 * Expo's getExpoPushTokenAsync hangs on Android and routes through a
 * proxy that doesn't deliver while the app is closed. The native token
 * goes to the backend, which uses Firebase Admin SDK to send pushes
 * directly to APNs/FCM, exactly like the basktball and argufight apps.
 *
 * Best-effort — if any step fails (permission denied, Expo Go without
 * dev build, network), the app continues normally; the user just won't
 * receive remote pushes.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    } as any),
  });
} catch {
  Notifications = null;
}

const LAST_REGISTERED_TOKEN_KEY = 'dmr-push-token-last-registered-v2';

/**
 * Idempotent — safe to call on every cold start. Returns the native
 * token registered, or null if anything prevented registration.
 *
 * The backend stores the token + platform pair and uses Firebase Admin
 * SDK to push:
 *   - Android tokens via FCM
 *   - iOS tokens via APNs (Firebase Admin SDK with the APNs Auth Key
 *     uploaded to Firebase Console)
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications) return null;
  // Expo Go in SDK 53+ doesn't support remote push tokens; only dev / EAS builds.
  if (Constants.appOwnership === 'expo') return null;

  try {
    // Permission flow
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowSound: true,
          allowBadge: true,
          allowProvisional: false,
        },
      });
      status = req.status;
    }
    if (status !== 'granted') {
      if (__DEV__) console.log('[Push] permission not granted:', status);
      return null;
    }

    // Native FCM/APNs token. This is the key change from the previous
    // Expo-push implementation — getDevicePushTokenAsync returns the
    // platform-native token, which Firebase Admin SDK on the backend
    // can deliver to even when the app is fully closed.
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    const token = tokenResp.data as string;
    if (!token) {
      if (__DEV__) console.log('[Push] empty token from getDevicePushTokenAsync');
      return null;
    }

    const platform: 'ios' | 'android' | null =
      Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;
    if (!platform) return null;

    // Android needs a notification channel — without it Android 8+ silently
    // drops incoming notifications. Channel ID 'default' must match what
    // the server sends in its FCM payload.
    if (platform === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Donkey Marble Racing',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#ffc220',
          sound: 'default',
        });
      } catch {
        // best-effort
      }
    }

    // Skip the network call if the same token already registered
    const lastRegistered = await AsyncStorage.getItem(LAST_REGISTERED_TOKEN_KEY);
    const fingerprint = `${platform}:${token}`;
    if (lastRegistered === fingerprint) return token;

    await api.registerPushToken(token, platform);
    await AsyncStorage.setItem(LAST_REGISTERED_TOKEN_KEY, fingerprint);
    if (__DEV__) console.log('[Push] registered native token', platform, token.slice(0, 12) + '...');
    return token;
  } catch (err: any) {
    if (__DEV__) console.log('[Push] registration failed:', err?.message || err);
    return null;
  }
}

/**
 * Clear the registered token server-side and forget the local fingerprint.
 * Call this on sign-out.
 */
export async function unregisterPushNotifications(): Promise<void> {
  try {
    await api.clearPushToken();
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(LAST_REGISTERED_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Subscribe to incoming notifications while app is in the foreground.
 * Returns an unsubscribe function. Callback receives the data payload.
 */
export function addNotificationReceivedListener(
  cb: (data: Record<string, any>) => void,
): () => void {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationReceivedListener((n) => {
    cb(n.request.content.data || {});
  });
  return () => sub.remove();
}

/**
 * Subscribe to taps on notifications (user tapped a push). Returns an
 * unsubscribe function. Use to route to the right screen based on
 * `data.screen` / `data.ticketId` / etc.
 */
export function addNotificationResponseListener(
  cb: (data: Record<string, any>) => void,
): () => void {
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    cb(r.notification.request.content.data || {});
  });
  return () => sub.remove();
}
