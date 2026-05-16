/**
 * Firebase Web SDK initialization.
 *
 * Uses the modular `firebase` web SDK (works in React Native via WebSocket) for
 * Realtime Database. This avoids the @react-native-firebase/database iOS Pod
 * issues entirely — no native pod for the database means no FirebaseAuth-Swift.h
 * not-found / framework-module / non-modular-header pod errors during archive.
 *
 * Auth (Google + Apple) still uses the native @react-native-firebase/auth pod
 * because the native flows give better UX (system credential picker, etc.) and
 * it has no Pod-compile issues on its own.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getDatabase as getWebDatabase, Database } from 'firebase/database';

// Values copied from GoogleService-Info.plist (iOS) — same project, same DB.
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCRJLTl5c9SK20ctIeviJywSMqePjcToOU',
  authDomain: 'donkey-marble-racing.firebaseapp.com',
  databaseURL: 'https://donkey-marble-racing-default-rtdb.firebaseio.com',
  projectId: 'donkey-marble-racing',
  storageBucket: 'donkey-marble-racing.firebasestorage.app',
  messagingSenderId: '791385622060',
  appId: '1:791385622060:ios:7312407145171009377389',
} as const;

let _db: Database | null = null;

/** Returns a singleton Realtime Database instance, initializing on first call. */
export function getDb(): Database {
  if (_db) return _db;
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  _db = getWebDatabase(app);
  return _db;
}
