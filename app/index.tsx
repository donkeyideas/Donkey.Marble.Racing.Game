import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, MARBLES } from '../theme';
import { useGameStore } from '../state/gameStore';
import { registerOrLogin } from '../lib/auth';
import MarbleDot from '../components/MarbleDot';
import PrimaryButton from '../components/PrimaryButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SplashScreen() {
  const router = useRouter();
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const [showNameEntry, setShowNameEntry] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const handleStart = () => {
    if (playerName) {
      registerOrLogin(playerName); // fire-and-forget
      router.replace('/lobby');
    } else {
      setShowNameEntry(true);
    }
  };

  const handleNameSubmit = () => {
    const trimmed = nameInput.trim();
    if (trimmed.length >= 2) {
      setPlayerName(trimmed);
      registerOrLogin(trimmed); // fire-and-forget
      router.replace('/lobby');
    }
  };

  if (showNameEntry) {
    return (
      <LinearGradient colors={['#6ec1ff', '#1d56d4', '#0a3a96']} style={styles.fill}>
        <KeyboardAvoidingView
          style={styles.fill}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.container}>
            <View style={styles.content}>
              <Text style={styles.nameTitle}>CREATE YOUR PROFILE</Text>
              <Text style={styles.nameSubtitle}>What should we call you?</Text>

              <View style={styles.nameInputWrapper}>
                <TextInput
                  style={styles.nameInput}
                  placeholder="Enter your name"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={nameInput}
                  onChangeText={setNameInput}
                  maxLength={16}
                  autoFocus
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={handleNameSubmit}
                />
              </View>

              <View style={styles.avatarPreview}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarChar}>
                    {nameInput.trim() ? nameInput.trim()[0].toUpperCase() : '?'}
                  </Text>
                </View>
                <Text style={styles.avatarName}>
                  {nameInput.trim() || 'Your Name'}
                </Text>
              </View>

              <PrimaryButton
                label="LET'S RACE"
                onPress={handleNameSubmit}
                disabled={nameInput.trim().length < 2}
              />

              <View style={styles.marblesRow}>
                {MARBLES.map((marble) => (
                  <MarbleDot key={marble.id} marble={marble} size={28} />
                ))}
              </View>
            </View>

            <Text style={styles.disclaimer}>
              For ages 17+ · Virtual coins only · No real money gambling
            </Text>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    );
  }

  return (
    <Pressable style={styles.fill} onPress={handleStart}>
      <LinearGradient
        colors={['#6ec1ff', '#1d56d4', '#0a3a96']}
        style={styles.fill}
      >
        <View style={styles.container}>
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

            <View style={styles.marblesRow}>
              {MARBLES.map((marble) => (
                <MarbleDot key={marble.id} marble={marble} size={38} />
              ))}
            </View>

            <PrimaryButton label="TAP TO START" onPress={handleStart} />
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
  marblesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 40,
    marginBottom: 30,
  },

  // Name entry
  nameTitle: {
    color: Colors.white,
    fontSize: 28,
    fontFamily: Fonts.display,
    textAlign: 'center',
    marginBottom: 8,
  },
  nameSubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontFamily: Fonts.body,
    textAlign: 'center',
    marginBottom: 30,
  },
  nameInputWrapper: {
    width: SCREEN_WIDTH * 0.75,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 24,
  },
  nameInput: {
    color: Colors.white,
    fontSize: 22,
    fontFamily: Fonts.bodyBold,
    textAlign: 'center',
  },
  avatarPreview: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.yellow,
    borderWidth: 3,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarChar: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.ink,
  },
  avatarName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    color: Colors.white,
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
