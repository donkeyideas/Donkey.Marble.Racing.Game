/**
 * Firebase Authentication — Google + Apple sign-in via Firebase Web SDK.
 *
 * Architecture:
 *   - Native sign-in UI: @react-native-google-signin/google-signin (Google)
 *     and expo-apple-authentication (Apple) handle the platform pickers and
 *     return idTokens. These pods are stable and have no umbrella-header issues.
 *   - Firebase auth: the modular firebase/auth Web SDK accepts those idTokens
 *     via GoogleAuthProvider.credential() / OAuthProvider.credential() and
 *     signs the user into Firebase. No native Firebase pod involved.
 *
 * All functions are safe in Expo Go (graceful no-ops when native pickers
 * aren't available).
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  signInWithCredential,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  OAuthProvider,
  User,
} from 'firebase/auth';
import { getFbAuth } from './firebase';

/** True when running in Expo Go (no native sign-in pickers available). */
const isExpoGo =
  (Constants.executionEnvironment as string | undefined) === 'storeClient' ||
  (Constants as any).appOwnership === 'expo';

// ---------------------------------------------------------------------------
// Lazy native module accessors (only for the sign-in PICKERS, not Firebase)
// ---------------------------------------------------------------------------

let _GoogleSignin: any = null;
function getGoogleSignin() {
  if (isExpoGo) return null;
  if (_GoogleSignin) return _GoogleSignin;
  try {
    _GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
    return _GoogleSignin;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

let googleConfigured = false;

export function configureGoogleSignIn(webClientId: string) {
  const gs = getGoogleSignin();
  if (gs) {
    /* `scopes` is required on Android for the id token to come back with
     * email/profile claims attached — without it the Google picker still
     * opens but the response is missing fields Firebase needs to build a
     * useful user record, which surfaced as the "signed in with Google
     * doesn't take" report on Android.
     *
     * `offlineAccess: false` because Firebase doesn't need server-side
     * refresh tokens — the Web SDK handles its own session management. */
    gs.configure({
      webClientId,
      scopes: ['profile', 'email'],
      offlineAccess: false,
    });
    googleConfigured = true;
  }
}

/* Last Google sign-in error, surfaced by signInWithGoogle so the caller
 * can show a real message in the UI instead of "Could not sign in" —
 * required to diagnose Android SHA-1 / Play Services / OAuth client
 * mismatches on TestFlight / internal-track builds. */
let lastGoogleError: string | null = null;
export function getLastGoogleSignInError(): string | null {
  return lastGoogleError;
}

export async function signInWithGoogle(): Promise<User | null> {
  lastGoogleError = null;
  try {
    const gs = getGoogleSignin();
    if (!gs) {
      lastGoogleError = 'Google Sign-In native module not available (Expo Go or unlinked native build)';
      return null;
    }
    if (!googleConfigured) {
      lastGoogleError = 'Google Sign-In not configured — webClientId missing';
      return null;
    }

    await gs.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await gs.signIn();
    /* Newer @react-native-google-signin versions wrap the result in
     * { type: 'success' | 'cancelled', data: {...} }. Older versions
     * return the data fields directly. Read defensively. */
    const idToken: string | undefined =
      response?.data?.idToken ?? response?.idToken;
    if (!idToken) {
      lastGoogleError = 'Google did not return an idToken (likely SHA-1 fingerprint mismatch or OAuth client misconfigured)';
      return null;
    }

    // Exchange the Google idToken for a Firebase credential via the Web SDK.
    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(getFbAuth(), credential);
    return userCredential.user;
  } catch (error: any) {
    const code = error?.code ?? '';
    const msg = error?.message ?? String(error);
    lastGoogleError = code ? `${code}: ${msg}` : msg;
    if (__DEV__) console.warn('[Auth] Google sign-in failed:', lastGoogleError);
    return null;
  }
}

export async function signInWithApple(): Promise<User | null> {
  if (Platform.OS !== 'ios') return null;

  try {
    // Native Apple picker — same as before, this dep has no Pod issues.
    const AppleAuth = require('expo-apple-authentication');
    const appleCredential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!appleCredential.identityToken) return null;

    // Web SDK OAuthProvider for apple.com — exchanges identityToken for Firebase user.
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken: appleCredential.identityToken,
      rawNonce: undefined, // not using nonce verification; Apple's identityToken is already signed
    });
    const userCredential = await signInWithCredential(getFbAuth(), credential);

    // First-time sign-in: Apple supplies the user's name; set displayName.
    if (appleCredential.fullName?.givenName && !userCredential.user.displayName) {
      const displayName = [
        appleCredential.fullName.givenName,
        appleCredential.fullName.familyName,
      ].filter(Boolean).join(' ');
      try { await updateProfile(userCredential.user, { displayName }); } catch {}
    }

    return userCredential.user;
  } catch (error: any) {
    console.warn('[Auth] Apple sign-in failed:', error?.message || error);
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    await fbSignOut(getFbAuth());
    if (googleConfigured) {
      const gs = getGoogleSignin();
      if (gs) try { await gs.signOut(); } catch {}
    }
  } catch (error: any) {
    console.warn('[Auth] Sign-out failed:', error?.message || error);
  }
}

export function getCurrentUser(): User | null {
  return getFbAuth().currentUser;
}

export function onAuthStateChanged(
  callback: (user: User | null) => void,
): () => void {
  return fbOnAuthStateChanged(getFbAuth(), callback);
}

export async function deleteAccount(): Promise<boolean> {
  try {
    const user = getFbAuth().currentUser;
    if (!user) return false;
    await user.delete();
    return true;
  } catch (error: any) {
    console.warn('[Auth] Account deletion failed:', error?.message || error);
    return false;
  }
}
