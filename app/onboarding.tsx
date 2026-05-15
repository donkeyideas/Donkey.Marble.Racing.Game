import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, BorderRadius } from '../theme';
import MarbleDot from '../components/MarbleDot';

const { width: SW } = Dimensions.get('window');
const TOTAL_STEPS = 4;

/* ── Animated fade-in wrapper ──────────────────────────────────────── */
function FadeIn({
  delay = 0,
  duration = 500,
  children,
  style,
}: {
  delay?: number;
  duration?: number;
  children: React.ReactNode;
  style?: any;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

/* ── Step 1: THE OPENING ───────────────────────────────────────────── */
function IntroStep() {
  return (
    <View style={styles.centered}>
      <FadeIn delay={600}>
        <Text style={styles.introLine}>They came from different worlds.</Text>
      </FadeIn>
      <FadeIn delay={2000}>
        <Text style={styles.introLineBold}>Eight marbles.</Text>
      </FadeIn>
      <FadeIn delay={2800}>
        <Text style={styles.introLineBold}>Eight stories.</Text>
      </FadeIn>
      <FadeIn delay={4200}>
        <Text style={styles.introLineGold}>Only one will be crowned champion.</Text>
      </FadeIn>
      <FadeIn delay={5800}>
        <Text style={styles.tapHint}>TAP TO CONTINUE</Text>
      </FadeIn>
    </View>
  );
}

/* ── Step 2: THE SEASON ────────────────────────────────────────────── */
function SeasonStep() {
  return (
    <View style={styles.centered}>
      <FadeIn delay={400}>
        <View style={styles.seasonPill}>
          <Text style={styles.seasonPillText}>SEASON 1</Text>
        </View>
      </FadeIn>
      <FadeIn delay={1000}>
        <Text style={styles.seasonBig}>THE INAUGURAL</Text>
      </FadeIn>
      <FadeIn delay={1400}>
        <Text style={styles.seasonBigGold}>SEASON</Text>
      </FadeIn>
      <View style={{ height: 20 }} />
      <FadeIn delay={2400}>
        <Text style={styles.seasonSub}>12 weeks. 6 races a day.</Text>
      </FadeIn>
      <FadeIn delay={3200}>
        <Text style={styles.seasonSubBold}>Zero mercy.</Text>
      </FadeIn>
      <View style={{ height: 24 }} />
      <FadeIn delay={4200}>
        <Text style={styles.seasonHighlight}>
          The Donkey Marble Racing League
        </Text>
      </FadeIn>
      <FadeIn delay={4800}>
        <Text style={styles.seasonHighlightBig}>begins NOW.</Text>
      </FadeIn>
      <FadeIn delay={6000}>
        <Text style={styles.tapHint}>TAP TO CONTINUE</Text>
      </FadeIn>
    </View>
  );
}

/* ── Step 3: THE CONTENDERS ────────────────────────────────────────── */
function ContendersStep() {
  return (
    <View style={styles.centered}>
      <FadeIn delay={300}>
        <Text style={styles.contendersTitle}>THE CONTENDERS</Text>
      </FadeIn>
      <FadeIn delay={600}>
        <Text style={styles.contendersSub}>
          Meet the racers of Season 1.
        </Text>
      </FadeIn>
      <View style={{ height: 20 }} />
      <View style={styles.contendersGrid}>
        {MARBLES.map((marble, i) => (
          <FadeIn key={marble.id} delay={900 + i * 200} style={styles.contenderCard}>
            <MarbleDot marble={marble} size={48} />
            <Text style={styles.contenderName}>{marble.name}</Text>
            <Text style={styles.contenderPersonality}>{marble.personality}</Text>
          </FadeIn>
        ))}
      </View>
      <FadeIn delay={3000}>
        <Text style={styles.tapHint}>TAP TO CONTINUE</Text>
      </FadeIn>
    </View>
  );
}

/* ── Step 4: THE PITCH ─────────────────────────────────────────────── */
function PitchStep({ onEnter }: { onEnter: () => void }) {
  return (
    <View style={styles.centered}>
      <FadeIn delay={400}>
        <Text style={styles.pitchLine}>Every race. Every turn. Every bounce.</Text>
      </FadeIn>
      <FadeIn delay={1400}>
        <Text style={styles.pitchLineBold}>Completely unpredictable.</Text>
      </FadeIn>
      <View style={{ height: 24 }} />
      <FadeIn delay={2600}>
        <Text style={styles.pitchQuestion}>Your job?</Text>
      </FadeIn>
      <FadeIn delay={3400}>
        <Text style={styles.pitchBig}>CALL THE WINNER</Text>
      </FadeIn>
      <View style={{ height: 8 }} />
      <FadeIn delay={4200}>
        <Text style={styles.pitchSub}>
          Place your bet. Watch them roll. Win big.
        </Text>
      </FadeIn>
      <FadeIn delay={4800}>
        <Text style={styles.pitchCoins}>Here's 500 coins to get you started.</Text>
      </FadeIn>
      <FadeIn delay={5400}>
        <Pressable onPress={onEnter} style={({ pressed }) => pressed && styles.pressed}>
          <LinearGradient
            colors={['#ffd84d', '#ffc220']}
            style={styles.enterBtn}
          >
            <Text style={styles.enterBtnText}>I'M IN</Text>
          </LinearGradient>
        </Pressable>
      </FadeIn>
    </View>
  );
}

/* ── Main Onboarding Screen ────────────────────────────────────────── */
export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const advance = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setStep((prev) => prev + 1);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleEnter = () => {
    router.replace('/season');
  };

  const handleSkip = () => {
    router.replace('/season');
  };

  // Background gradient changes per step for drama
  const bgColors: [string, string] =
    step === 0
      ? ['#050d1f', '#0a1a3a']
      : step === 1
      ? ['#1a0e00', '#0a1a3a']
      : step === 2
      ? ['#0a2a6a', '#0a1a3a']
      : ['#050d1f', '#0a1a3a'];

  return (
    <LinearGradient colors={bgColors} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        {/* Skip */}
        <Pressable onPress={handleSkip} style={styles.skipBtn} hitSlop={16}>
          <Text style={styles.skipText}>SKIP</Text>
        </Pressable>

        {/* Step content — tap to advance on steps 0-2 */}
        <Pressable
          style={styles.fill}
          onPress={step < 3 ? advance : undefined}
        >
          <Animated.View style={[styles.fill, { opacity: fadeAnim }]}>
            {step === 0 && <IntroStep />}
            {step === 1 && <SeasonStep />}
            {step === 2 && <ContendersStep />}
            {step === 3 && <PitchStep onEnter={handleEnter} />}
          </Animated.View>
        </Pressable>

        {/* Page dots */}
        <View style={styles.dotsRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === step && styles.dotActive]}
            />
          ))}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  fill: { flex: 1 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },

  /* Skip */
  skipBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.whiteAlpha35,
    letterSpacing: 1,
  },

  /* Page dots */
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.whiteAlpha15,
  },
  dotActive: {
    backgroundColor: Colors.yellow,
    width: 24,
    borderRadius: 4,
  },

  /* Tap hint */
  tapHint: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.whiteAlpha25,
    letterSpacing: 2,
    marginTop: 50,
  },

  /* ── Step 1: Intro ────────────────────────────────────────────── */
  introLine: {
    fontFamily: Fonts.body,
    fontSize: 20,
    color: Colors.whiteAlpha50,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 28,
  },
  introLineBold: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 26,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 34,
  },
  introLineGold: {
    fontFamily: Fonts.display,
    fontSize: 24,
    color: Colors.yellow,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 32,
  },

  /* ── Step 2: Season ───────────────────────────────────────────── */
  seasonPill: {
    backgroundColor: Colors.yellowAlpha20,
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    marginBottom: 14,
  },
  seasonPillText: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: Colors.yellow,
    letterSpacing: 3,
  },
  seasonBig: {
    fontFamily: Fonts.display,
    fontSize: 38,
    color: Colors.white,
    textAlign: 'center',
    lineHeight: 44,
  },
  seasonBigGold: {
    fontFamily: Fonts.display,
    fontSize: 42,
    color: Colors.yellow,
    textAlign: 'center',
    lineHeight: 48,
  },
  seasonSub: {
    fontFamily: Fonts.body,
    fontSize: 17,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
    lineHeight: 24,
  },
  seasonSubBold: {
    fontFamily: Fonts.bodyBold,
    fontSize: 18,
    color: Colors.whiteAlpha60,
    textAlign: 'center',
    lineHeight: 24,
  },
  seasonHighlight: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 17,
    color: Colors.whiteAlpha60,
    textAlign: 'center',
    lineHeight: 24,
  },
  seasonHighlightBig: {
    fontFamily: Fonts.display,
    fontSize: 24,
    color: Colors.yellow,
    textAlign: 'center',
    lineHeight: 30,
  },

  /* ── Step 3: Contenders ───────────────────────────────────────── */
  contendersTitle: {
    fontFamily: Fonts.display,
    fontSize: 24,
    color: Colors.yellow,
    letterSpacing: 3,
  },
  contendersSub: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
    marginTop: 4,
  },
  contendersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    width: '100%',
    paddingHorizontal: 10,
  },
  contenderCard: {
    width: (SW - 100) / 4,
    alignItems: 'center',
    marginBottom: 8,
  },
  contenderName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.white,
    marginTop: 6,
    textAlign: 'center',
  },
  contenderPersonality: {
    fontFamily: Fonts.body,
    fontSize: 9,
    color: Colors.whiteAlpha35,
    textAlign: 'center',
    marginTop: 1,
  },

  /* ── Step 4: Pitch ────────────────────────────────────────────── */
  pitchLine: {
    fontFamily: Fonts.body,
    fontSize: 19,
    color: Colors.whiteAlpha50,
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 28,
  },
  pitchLineBold: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 20,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 4,
    lineHeight: 28,
  },
  pitchQuestion: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 24,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 8,
  },
  pitchBig: {
    fontFamily: Fonts.display,
    fontSize: 36,
    color: Colors.yellow,
    textAlign: 'center',
    lineHeight: 42,
  },
  pitchSub: {
    fontFamily: Fonts.body,
    fontSize: 16,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
    lineHeight: 24,
  },
  pitchCoins: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.yellow,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 30,
  },
  enterBtn: {
    paddingVertical: 18,
    paddingHorizontal: 80,
    borderRadius: BorderRadius.pill,
    alignItems: 'center',
  },
  enterBtnText: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.ink,
  },
});
