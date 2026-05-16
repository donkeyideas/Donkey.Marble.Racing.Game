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
import { useGameStore } from '../state/gameStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    LilitaOne_400Regular,
    Fredoka_400Regular,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
  });

  useEffect(() => {
    // Load cached remote config immediately, then fetch fresh in background
    loadCachedConfig().then(() => fetchRemoteConfig()).catch(() => {});
    // Fetch live ops data (announcements, promos, messages, A/B tests)
    fetchAllLiveOps().catch(() => {});

    // Configure Google Sign-In (webClientId from Firebase Console)
    configureGoogleSignIn('791385622060-goted95ii4ea0emlb046qeni65icb8a1.apps.googleusercontent.com');

    // Sync Firebase auth state → Zustand store
    const unsubAuth = onAuthStateChanged((user) => {
      const { setFirebaseUser } = useGameStore.getState();
      if (user) {
        setFirebaseUser({
          uid: user.uid,
          displayName: user.displayName,
          photoURL: user.photoURL,
          email: user.email,
        });
      } else {
        setFirebaseUser(null);
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
      // Re-schedule event notifications if permission already granted (no prompt)
      scheduleIfAlreadyPermitted().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a3a96',
  },
});
