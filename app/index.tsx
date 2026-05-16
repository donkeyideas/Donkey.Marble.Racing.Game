import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Fonts, MARBLES } from '../theme';
import { useGameStore } from '../state/gameStore';
import { registerOrLogin } from '../lib/auth';
import MarbleDot from '../components/MarbleDot';
import PrimaryButton from '../components/PrimaryButton';
import Matter from 'matter-js';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// === Floating Marbles Physics ===
const MARBLE_R = 20;
const MARBLE_COUNT = MARBLES.length; // 8

interface FloatingMarble {
  x: Animated.Value;
  y: Animated.Value;
  data: typeof MARBLES[0];
}

function useFloatingMarbles() {
  const marblesRef = useRef<FloatingMarble[]>(
    MARBLES.map((m) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      data: m,
    }))
  );
  const engineRef = useRef<Matter.Engine | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    // Timescale demo approach: normal gravity + slow-mo timeScale
    // Marbles arc gracefully, bouncing off walls in bullet-time
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 1 } });
    engine.timing.timeScale = 0.12; // slow-mo: 12% speed
    engineRef.current = engine;
    const world = engine.world;

    // Walls — box the whole screen, perfect bounce
    const wallOpts = { isStatic: true, restitution: 1.0, friction: 0 };
    const walls = [
      Matter.Bodies.rectangle(SCREEN_WIDTH / 2, -10, SCREEN_WIDTH, 20, wallOpts),
      Matter.Bodies.rectangle(SCREEN_WIDTH / 2, SCREEN_HEIGHT + 10, SCREEN_WIDTH, 20, wallOpts),
      Matter.Bodies.rectangle(-10, SCREEN_HEIGHT / 2, 20, SCREEN_HEIGHT, wallOpts),
      Matter.Bodies.rectangle(SCREEN_WIDTH + 10, SCREEN_HEIGHT / 2, 20, SCREEN_HEIGHT, wallOpts),
    ];
    Matter.Composite.add(world, walls);

    // Marble bodies — scatter across screen with strong initial launches
    const bodies: Matter.Body[] = [];
    marblesRef.current.forEach((m, i) => {
      const startX = 30 + (i / (MARBLE_COUNT - 1)) * (SCREEN_WIDTH - 60);
      const startY = SCREEN_HEIGHT * 0.3 + Math.random() * SCREEN_HEIGHT * 0.4;
      const body = Matter.Bodies.circle(startX, startY, MARBLE_R, {
        restitution: 0.9,
        friction: 0.0001,
        frictionAir: 0.0005,
        density: 0.001,
      });
      // Strong launch — timescale makes it look like graceful arcs
      Matter.Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 20,
        y: -(Math.random() * 15 + 5), // upward launch
      });
      bodies.push(body);
      Matter.Composite.add(world, body);
    });

    // Periodic re-launches: pick a random marble and fling it upward
    const launchInterval = setInterval(() => {
      const idx = Math.floor(Math.random() * bodies.length);
      const body = bodies[idx];
      Matter.Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 18,
        y: -(Math.random() * 20 + 8),
      });
    }, 2000);

    // Animation loop
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(t - last, 32);
      last = t;
      Matter.Engine.update(engine, dt);

      bodies.forEach((body, i) => {
        marblesRef.current[i].x.setValue(body.position.x - MARBLE_R);
        marblesRef.current[i].y.setValue(body.position.y - MARBLE_R);
      });

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      clearInterval(launchInterval);
      cancelAnimationFrame(rafRef.current);
      Matter.Engine.clear(engine);
    };
  }, []);

  return marblesRef.current;
}

export default function SplashScreen() {
  const router = useRouter();
  const playerName = useGameStore((s) => s.playerName);
  const setPlayerName = useGameStore((s) => s.setPlayerName);
  const [showNameEntry, setShowNameEntry] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const floatingMarbles = useFloatingMarbles();

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
            {/* Floating marbles behind content */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {floatingMarbles.map((m) => (
                <Animated.View
                  key={m.data.id}
                  style={{
                    position: 'absolute',
                    left: m.x,
                    top: m.y,
                    width: MARBLE_R * 2,
                    height: MARBLE_R * 2,
                    borderRadius: MARBLE_R,
                    backgroundColor: m.data.colorDark,
                    opacity: 0.25,
                    overflow: 'hidden',
                  }}
                >
                  <View style={{
                    position: 'absolute', top: 1, left: 1,
                    width: MARBLE_R * 2 - 2, height: MARBLE_R * 2 - 2,
                    borderRadius: MARBLE_R - 1, backgroundColor: m.data.colorLight, opacity: 0.8,
                  }} />
                </Animated.View>
              ))}
            </View>

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
          {/* Floating marbles behind content */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {floatingMarbles.map((m) => (
              <Animated.View
                key={m.data.id}
                style={{
                  position: 'absolute',
                  left: m.x,
                  top: m.y,
                  width: MARBLE_R * 2,
                  height: MARBLE_R * 2,
                  borderRadius: MARBLE_R,
                  backgroundColor: m.data.colorDark,
                  opacity: 0.35,
                  overflow: 'hidden',
                }}
              >
                <View style={{
                  position: 'absolute', top: 2, left: 2,
                  width: MARBLE_R * 2 - 4, height: MARBLE_R * 2 - 4,
                  borderRadius: MARBLE_R - 2, backgroundColor: m.data.colorLight,
                }} />
                <View style={{
                  position: 'absolute', top: 5, left: 7, width: 10, height: 6,
                  borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.4)',
                  transform: [{ rotate: '-20deg' }],
                }} />
              </Animated.View>
            ))}
          </View>

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
