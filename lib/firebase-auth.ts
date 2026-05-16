/**
 * Firebase Authentication — Google + Apple sign-in.
 *
 * All native Firebase imports are guarded by isExpoGo check.
 * In Expo Go, all functions are safe no-ops.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

/** True when running in Expo Go (no native modules available) */
const isExpoGo = Constants.appOwnership === 'expo';

// ---------------------------------------------------------------------------
// Lazy native module accessors — only loaded in dev/prod builds
// ---------------------------------------------------------------------------

let _auth: any = null;
let _GoogleSignin: any = null;

function getAuth() {
  if (isExpoGo) return null;
  if (_auth) return _auth;
  try {
    _auth = require('@react-native-firebase/auth').default;
    return _auth;
  } catch {
    return null;
  }
}

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
// Public API — same interface, safe no-ops in Expo Go
// ---------------------------------------------------------------------------

let googleConfigured = false;

export function configureGoogleSignIn(webClientId: string) {
  const gs = getGoogleSignin();
  if (gs) {
    gs.configure({ webClientId });
    googleConfigured = true;
  }
}

export async function signInWithGoogle(): Promise<any | null> {
  try {
    const authMod = getAuth();
    const gs = getGoogleSignin();
    if (!authMod || !gs || !googleConfigured) return null;

    await gs.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await gs.signIn();

    if (!response.data?.idToken) return null;

    const credential = authMod.GoogleAuthProvider.credential(response.data.idToken);
    const userCredential = await authMod().signInWithCredential(credential);
    return userCredential.user;
  } catch (error: any) {
    console.warn('[Auth] Google sign-in failed:', error?.message || error);
    return null;
  }
}

export async function signInWithApple(): Promise<any | null> {
  if (Platform.OS !== 'ios') return null;

  try {
    const authMod = getAuth();
    if (!authMod) return null;

    const AppleAuth = require('expo-apple-authentication');
    const appleCredential = await AppleAuth.signInAsync({
      requestedScopes: [
        AppleAuth.AppleAuthenticationScope.FULL_NAME,
        AppleAuth.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (!appleCredential.identityToken) return null;

    const credential = authMod.AppleAuthProvider.credential(
      appleCredential.identityToken,
      appleCredential.authorizationCode || '',
    );
    const userCredential = await authMod().signInWithCredential(credential);

    if (appleCredential.fullName?.givenName && !userCredential.user.displayName) {
      const displayName = [
        appleCredential.fullName.givenName,
        appleCredential.fullName.familyName,
      ].filter(Boolean).join(' ');
      await userCredential.user.updateProfile({ displayName });
    }

    return userCredential.user;
  } catch (error: any) {
    console.warn('[Auth] Apple sign-in failed:', error?.message || error);
    return null;
  }
}

export async function signOut(): Promise<void> {
  try {
    const authMod = getAuth();
    if (authMod) await authMod().signOut();
    if (googleConfigured) {
      const gs = getGoogleSignin();
      if (gs) try { await gs.signOut(); } catch {}
    }
  } catch (error: any) {
    console.warn('[Auth] Sign-out failed:', error?.message || error);
  }
}

export function getCurrentUser(): any | null {
  const authMod = getAuth();
  return authMod ? authMod().currentUser : null;
}

export function onAuthStateChanged(
  callback: (user: any | null) => void,
): () => void {
  const authMod = getAuth();
  if (!authMod) {
    callback(null);
    return () => {};
  }
  return authMod().onAuthStateChanged(callback);
}

export async function deleteAccount(): Promise<boolean> {
  try {
    const authMod = getAuth();
    if (!authMod) return false;
    const user = authMod().currentUser;
    if (!user) return false;
    await user.delete();
    return true;
  } catch (error: any) {
    console.warn('[Auth] Account deletion failed:', error?.message || error);
    return false;
  }
}
