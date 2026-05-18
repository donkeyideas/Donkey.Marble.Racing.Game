/**
 * Push notification token registration.
 *
 * Requests notification permission, fetches the device's Expo push token, and
 * POSTs it to the admin so Live Ops can target this device. Best-effort — if
 * any step fails (permission denied, Expo Go without dev build, network), the
 * app continues normally; the user just won't receive announcement pushes.
 *
 * The Expo Push API proxies to FCM (Android) and APNs (iOS). The operator
 * verifies per-platform delivery from the Live Ops "Notification Delivery
 * History" card.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
} catch {
  Notifications = null;
}

const LAST_REGISTERED_TOKEN_KEY = 'dmr-push-token-last-registered-v1';

/**
 * Idempotent — safe to call on every cold start. Returns the token registered,
 * or null if anything prevented registration.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications) return null;
  // Expo Go in SDK 53+ no longer supports remote push tokens; only dev builds do.
  if (Constants.appOwnership === 'expo') return null;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    // EAS project id, required by getExpoPushTokenAsync for project-scoped tokens.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    if (!projectId) return null;

    const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResp.data;
    if (!token) return null;

    const platform: 'ios' | 'android' | null =
      Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;
    if (!platform) return null;

    // Skip the network call if nothing changed since last registration
    const lastRegistered = await AsyncStorage.getItem(LAST_REGISTERED_TOKEN_KEY);
    const fingerprint = `${platform}:${token}`;
    if (lastRegistered === fingerprint) return token;

    await api.registerPushToken(token, platform);
    await AsyncStorage.setItem(LAST_REGISTERED_TOKEN_KEY, fingerprint);
    return token;
  } catch {
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
