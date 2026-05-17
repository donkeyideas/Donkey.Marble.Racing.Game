/**
 * Firebase Web SDK initialization.
 *
 * The full Firebase stack runs through the modular `firebase` web SDK rather
 * than @react-native-firebase/* native pods. Reason: the native Pod chain has
 * fragile transitive Swift-bridge-header dependencies (FirebaseAuth-Swift.h)
 * that don't resolve reliably under modern Xcode toolchains. The Web SDK uses
 * WebSocket / fetch from JS and ships zero native code — no Pod issues ever.
 *
 * Native sign-in pickers (@react-native-google-signin/google-signin and
 * expo-apple-authentication) still drive the sign-in UI; we just exchange the
 * resulting credential through the Web SDK to get a Firebase user.
 *
 * Singletons: every getter returns the same instance for the app's lifetime.
 */
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getDatabase as getWebDatabase, Database } from 'firebase/database';
import { getAuth as getWebAuth, initializeAuth, Auth } from 'firebase/auth';
import { getAnalytics as getWebAnalytics, isSupported as isAnalyticsSupported, Analytics } from 'firebase/analytics';
import AsyncStorage from '@react-native-async-storage/async-storage';
// IMPORTANT: must import from '@firebase/auth' (the lower-level package), NOT
// 'firebase/auth' (the umbrella). The umbrella's package.json has no
// "react-native" field, so Metro resolves it to the Node bundle which omits
// getReactNativePersistence. The underlying @firebase/auth DOES have a
// "react-native" entry pointing at dist/rn/index.js, which exports the
// function we need.
//
// Wrapped in require + try-style fallback so the file still loads in non-RN
// environments (the headless test runs in Node and won't have a working
// rn-entry resolution).
let getReactNativePersistence: ((s: any) => any) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const auth = require('@firebase/auth');
  getReactNativePersistence = auth?.getReactNativePersistence ?? null;
} catch {
  getReactNativePersistence = null;
}

// Values copied from GoogleService-Info.plist (iOS) — same project, same DB/auth.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCRJLTl5c9SK20ctIeviJywSMqePjcToOU',
  authDomain: 'donkey-marble-racing.firebaseapp.com',
  databaseURL: 'https://donkey-marble-racing-default-rtdb.firebaseio.com',
  projectId: 'donkey-marble-racing',
  storageBucket: 'donkey-marble-racing.firebasestorage.app',
  messagingSenderId: '791385622060',
  appId: '1:791385622060:ios:7312407145171009377389',
} as const;

let _app: FirebaseApp | null = null;
let _db: Database | null = null;
let _auth: Auth | null = null;
let _analytics: Analytics | null = null;

function app(): FirebaseApp {
  if (_app) return _app;
  _app = getApps().length > 0 ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  return _app;
}

/** Realtime Database singleton. */
export function getDb(): Database {
  if (_db) return _db;
  _db = getWebDatabase(app());
  return _db;
}

/** Firebase Auth singleton — for credential-based sign-in flows. */
export function getFbAuth(): Auth {
  if (_auth) return _auth;
  try {
    if (getReactNativePersistence) {
      // RN-backed persistence — the user stays signed in across cold starts.
      // Without this, Firebase Auth in RN defaults to in-memory persistence
      // and silently signs them out on every app launch.
      _auth = initializeAuth(app(), {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } else {
      // Node (or any env without the RN-entry resolution) — let Firebase pick
      // a default. This branch shouldn't run on a real device.
      _auth = initializeAuth(app());
    }
  } catch {
    // initializeAuth throws if auth was already created for this app — that's
    // fine, fall back to retrieving the existing instance.
    _auth = getWebAuth(app());
  }
  return _auth;
}

/**
 * Firebase Analytics singleton — null in unsupported environments
 * (Analytics requires window/document, may not exist on some RN targets).
 * Callers should always null-check.
 */
export async function getFbAnalytics(): Promise<Analytics | null> {
  if (_analytics) return _analytics;
  try {
    if (!(await isAnalyticsSupported())) return null;
    _analytics = getWebAnalytics(app());
    return _analytics;
  } catch {
    return null;
  }
}
