import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, BorderRadius } from '../theme';
import type { MarbleData } from '../theme';
import { useGameStore } from '../state/gameStore';
import { COURSES } from '../data/courses';
import MarbleDot from '../components/MarbleDot';

const { width: SW } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_W = (SW - 40 - CARD_GAP) / 2;

/**
 * First-launch intro: pick a marble, jump straight into a random track
 * as a tutorial-by-doing. The store flag `hasSeenIntroRace` is flipped
 * the moment we navigate to /race so a crash on the race screen won't
 * loop the user back here.
 */
export default function IntroPickScreen() {
  const router = useRouter();
  const playerName = useGameStore((s) => s.playerName);
  const selectMarble = useGameStore((s) => s.selectMarble);
  const setActiveMode = useGameStore((s) => s.setActiveMode);
  const selectCourse = useGameStore((s) => s.selectCourse);
  const setHasSeenIntroRace = useGameStore((s) => s.setHasSeenIntroRace);

  const [picked, setPicked] = useState<MarbleData | null>(null);

  const handleStart = () => {
    if (!picked) return;
    /* Random course from the full course pool. */
    const course = COURSES[Math.floor(Math.random() * COURSES.length)];
    selectMarble(picked);
    selectCourse(course.id);
    setActiveMode({ type: 'quick_race' });
    setHasSeenIntroRace(true);
    router.replace('/race');
  };

  return (
    <LinearGradient colors={['#0a3a96', '#0a1a3a']} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <Text style={styles.welcome}>WELCOME{playerName ? ',' : ''}</Text>
          {playerName ? <Text style={styles.name}>{playerName}</Text> : null}
          <View style={{ height: 14 }} />
          <Text style={styles.prompt}>PICK YOUR FIRST RACER</Text>
          <Text style={styles.subPrompt}>
            Eight marbles. One is about to be yours. Choose wisely.
          </Text>

          {/* Marble grid */}
          <View style={styles.grid}>
            {MARBLES.map((marble) => {
              const isPicked = picked?.id === marble.id;
              return (
                <Pressable
                  key={marble.id}
                  onPress={() => setPicked(marble)}
                  style={({ pressed }) => [
                    styles.card,
                    isPicked && styles.cardPicked,
                    pressed && styles.cardPressed,
                  ]}
                >
                  <MarbleDot marble={marble} size={64} />
                  <Text style={styles.marbleName}>{marble.name}</Text>
                  <Text style={styles.marblePersonality} numberOfLines={1}>
                    {marble.personality}
                  </Text>
                  <View style={styles.statRow}>
                    <StatChip label="SPD" value={marble.stats.speed} />
                    <StatChip label="PWR" value={marble.stats.power} />
                    <StatChip label="BNC" value={marble.stats.bounce} />
                    <StatChip label="LCK" value={marble.stats.luck} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Sticky CTA */}
        <View style={styles.ctaWrap} pointerEvents="box-none">
          <Pressable
            onPress={handleStart}
            disabled={!picked}
            style={({ pressed }) => [
              styles.cta,
              !picked && styles.ctaDisabled,
              pressed && picked && styles.ctaPressed,
            ]}
          >
            <LinearGradient
              colors={picked ? ['#ffd84d', '#ffc220'] : ['#3a3a4a', '#2a2a3a']}
              style={styles.ctaInner}
            >
              <Text style={[styles.ctaText, !picked && styles.ctaTextDisabled]}>
                {picked ? `RACE WITH ${picked.name.toUpperCase()}` : 'PICK A MARBLE TO START'}
              </Text>
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  welcome: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.whiteAlpha50,
    letterSpacing: 3,
    textAlign: 'center',
  },
  name: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.white,
    textAlign: 'center',
    marginTop: 2,
  },
  prompt: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.yellow,
    textAlign: 'center',
    letterSpacing: 2,
  },
  subPrompt: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.whiteAlpha50,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    paddingHorizontal: 20,
    lineHeight: 18,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CARD_GAP,
  },
  card: {
    width: CARD_W,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.lg,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  cardPicked: {
    borderColor: Colors.yellow,
    backgroundColor: 'rgba(255,194,32,0.10)',
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  marbleName: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.white,
    marginTop: 10,
  },
  marblePersonality: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha50,
    marginTop: 2,
    fontStyle: 'italic',
  },
  statRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 10,
    width: '100%',
    justifyContent: 'center',
  },
  statChip: {
    backgroundColor: Colors.whiteAlpha10,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 6,
    alignItems: 'center',
    minWidth: 32,
  },
  statLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 8,
    color: Colors.whiteAlpha50,
    letterSpacing: 0.5,
  },
  statValue: {
    fontFamily: Fonts.display,
    fontSize: 12,
    color: Colors.yellow,
    lineHeight: 14,
  },

  ctaWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 18,
    backgroundColor: 'rgba(10,26,58,0.92)',
  },
  cta: {
    borderRadius: BorderRadius.pill,
    overflow: 'hidden',
  },
  ctaInner: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.55,
  },
  ctaPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  ctaText: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.ink,
    letterSpacing: 1.5,
  },
  ctaTextDisabled: {
    color: Colors.whiteAlpha50,
  },
});
