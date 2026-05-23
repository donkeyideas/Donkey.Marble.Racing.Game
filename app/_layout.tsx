import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, LilitaOne_400Regular } from '@expo-google-fonts/lilita-one';
import {
  Fredoka_400Regular,
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { scheduleIfAlreadyPermitted } from '../utils/eventNotifications';
import { loadCachedConfig, fetchRemoteConfig } from '../lib/remoteConfig';
import { fetchAllLiveOps } from '../lib/liveOps';
import { onAuthStateChanged, configureGoogleSignIn } from '../lib/firebase-auth';
import { registerForPushNotifications, unregisterPushNotifications } from '../lib/pushRegistration';
import { initSessionTracker, startSession, endSession } from '../lib/sessionTracker';
import { flushEconomyQueue, clearEconomyQueue } from '../lib/syncQueue';
import { flushRaceSyncQueue, clearRaceSyncQueue } from '../lib/raceSyncQueue';
import { reconcileLocalBalanceOnce } from '../lib/balanceReconcile';
import { useGameStore } from '../state/gameStore';
import { GameModalHost } from '../components/GameModal';
import { useStableWindowDimensions } from '../utils/useStableDimensions';
import { initRewardedAds, loadRewardedAd } from '../utils/rewardedAds';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    LilitaOne_400Regular,
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  // Android cold-start fix: on the first launch after an app update the JS
  // bundle can evaluate before the activity window is fully measured, so
  // `Dimensions.get('window')` returns stale values and any module that
  // captures them at import time (e.g. RaceCanvas's render SCALE) is sized
  // wrong — the whole app looks "zoomed in" until the next launch. We hold
  // back the navigator until the window size has settled so route screen
  // modules are imported (and their module-level Dimensions reads run) only
  // once the correct size is available.
  const dimensionsStable = useStableWindowDimensions();
  const ready = fontsLoaded && dimensionsStable;

  useEffect(() => {
    // Load cached remote config immediately, then fetch fresh in background
    loadCachedConfig().then(() => fetchRemoteConfig()).catch(() => {});
    // Fetch live ops data (announcements, promos, messages, A/B tests)
    fetchAllLiveOps().catch(() => {});

    // Configure Google Sign-In (webClientId from Firebase Console)
    configureGoogleSignIn('791385622060-goted95ii4ea0emlb046qeni65icb8a1.apps.googleusercontent.com');

    // Sync Firebase auth state → Zustand store, and register/clear push token
    // around sign-in transitions. Registration is gated on having an
    // authenticated session because the /push-token endpoint requires it.
    // The session tracker is initialised once with the current sign-in state
    // and then opens/closes sessions on AppState transitions; we still
    // start/end explicitly on sign-in / sign-out so anonymous time doesn't
    // get attributed to the player.
    // Coin sync (queues + reconciliation) runs on EVERY app launch,
    // independent of Firebase auth state. The mobile API token used by
    // applyEconomyAction is a device-bound session token (set during
    // splash via registerOrLogin), not the Firebase user — gating these
    // behind a Firebase sign-in meant anonymous users never reconciled
    // and their phone-vs-admin coin drift never closed. That was the
    // root cause behind the persistent mismatch even after v3 shipped.
    flushEconomyQueue().catch(() => {});
    flushRaceSyncQueue()
      .then((res) => {
        if (res.drained > 0 && typeof res.balance === 'number') {
          useGameStore.setState({ coins: res.balance });
        }
      })
      .catch(() => {});
    reconcileLocalBalanceOnce().catch(() => {});

    const unsubAuth = onAuthStateChanged((user) => {
      const { setFirebaseUser } = useGameStore.getState();
      if (user) {
        setFirebaseUser({
          uid: user.uid,
          displayName: user.displayName,
          photoURL: user.photoURL,
          email: user.email,
        });
        registerForPushNotifications().catch(() => {});
        initSessionTracker(true);
        startSession();
        // Re-flush opportunistically on Firebase sign-in (e.g., the user
        // signed in mid-session after launch). The launch-time flushes
        // above already handle the cold-start case.
        flushEconomyQueue().catch(() => {});
        flushRaceSyncQueue()
          .then((res) => {
            if (res.drained > 0 && typeof res.balance === 'number') {
              useGameStore.setState({ coins: res.balance });
            }
          })
          .catch(() => {});
        reconcileLocalBalanceOnce().catch(() => {});
      } else {
        setFirebaseUser(null);
        unregisterPushNotifications().catch(() => {});
        endSession();
        // Drop the queues so the next user doesn't inherit the previous
        // user's pending writes.
        clearEconomyQueue().catch(() => {});
        clearRaceSyncQueue().catch(() => {});
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
      // Re-schedule event notifications if permission already granted (no prompt)
      scheduleIfAlreadyPermitted().catch(() => {});
      // Initialise Google Mobile Ads once the app frame is stable, then
      // start pre-loading a rewarded ad in the background so the Store's
      // "Watch ad for coins" tile can show one instantly when the player
      // opens it. Wrapped in try/catch — a missing native module or
      // network failure must never crash the boot path.
      (async () => {
        try {
          await initRewardedAds();
          loadRewardedAd();
        } catch {
          // noop — ad init is best-effort.
        }
      })();
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: '#0a3a96' },
        }}
      />
      {/* Themed Alert replacement — consumes showModal() / hideModal() calls. */}
      <GameModalHost />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a3a96',
  },
});
