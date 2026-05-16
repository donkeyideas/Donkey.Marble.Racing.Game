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
    gs.configure({ webClientId });
    googleConfigured = true;
  }
}

export async function signInWithGoogle(): Promise<User | null> {
  try {
    const gs = getGoogleSignin();
    if (!gs || !googleConfigured) return null;

    await gs.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await gs.signIn();
    if (!response.data?.idToken) return null;

    // Exchange the Google idToken for a Firebase credential via the Web SDK.
    const credential = GoogleAuthProvider.credential(response.data.idToken);
    const userCredential = await signInWithCredential(getFbAuth(), credential);
    return userCredential.user;
  } catch (error: any) {
    console.warn('[Auth] Google sign-in failed:', error?.message || error);
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
