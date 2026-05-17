import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts } from '../theme';
import { useGameStore } from '../state/gameStore';
import { registerOrLogin } from '../lib/auth';
import { generatePlayerName } from '../lib/playerName';
import PrimaryButton from '../components/PrimaryButton';
import FloatingMarblesBackground from '../components/FloatingMarblesBackground';

export default function SplashScreen() {
  const router = useRouter();
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);

  const handleStart = () => {
    // Auto-generate a friendly name on first launch. Users can change it
    // anytime via Settings -> "Tap to change name". Skips the name entry
    // screen entirely to remove first-launch friction.
    const name = playerName || generatePlayerName();
    if (!playerName) setPlayerName(name);
    registerOrLogin(name); // fire-and-forget
    router.replace('/lobby');
  };

  return (
    <Pressable style={styles.fill} onPress={handleStart}>
      <LinearGradient
        colors={['#6ec1ff', '#1d56d4', '#0a3a96']}
        style={styles.fill}
      >
        <View style={styles.container}>
          <FloatingMarblesBackground opacity={0.35} />

          <View style={styles.content}>
            <Text style={styles.welcomeText}>WELCOME TO</Text>

            <View style={styles.donkeyWrapper}>
              <Text style={[styles.donkeyText, styles.donkeyShadow]}>
                DONKEY
              </Text>
              <Text style={styles.donkeyText}>DONKEY</Text>
            </View>

            <Text style={styles.marbleText}>MARBLE</Text>

            <View style={styles.racingBadge}>
              <Text style={styles.racingText}>RACING</Text>
            </View>

            <View style={{ marginTop: 50 }}>
              <PrimaryButton label="TAP TO START" onPress={handleStart} />
            </View>
          </View>

          <Text style={styles.disclaimer}>
            For ages 17+ · Virtual coins only · No real money gambling
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    zIndex: 2,
  },

  // Splash
  welcomeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontFamily: Fonts.bodySemiBold,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  donkeyWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donkeyText: {
    color: Colors.white,
    fontSize: 64,
    fontFamily: Fonts.display,
    lineHeight: 72,
  },
  donkeyShadow: {
    position: 'absolute',
    color: '#0a3a96',
    top: 3,
    left: 3,
  },
  marbleText: {
    color: Colors.yellow,
    fontSize: 48,
    fontFamily: Fonts.display,
    lineHeight: 54,
    marginTop: -4,
  },
  racingBadge: {
    backgroundColor: Colors.ink,
    paddingVertical: 6,
    paddingHorizontal: 28,
    borderRadius: 8,
    marginTop: 8,
  },
  racingText: {
    color: Colors.white,
    fontSize: 28,
    fontFamily: Fonts.display,
    letterSpacing: 3,
  },

  disclaimer: {
    position: 'absolute',
    bottom: 50,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    fontFamily: Fonts.body,
    textAlign: 'center',
  },
});
