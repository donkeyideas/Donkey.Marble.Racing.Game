import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius } from '../theme';
import { useGameStore } from '../state/gameStore';
import { syncPlayerState } from '../lib/sync';
import { ACHIEVEMENTS } from '../data/achievements';
import { getTrackOfTheDay } from '../data/courses';
import MarbleDot from '../components/MarbleDot';
import CoinPill from '../components/CoinPill';

function ModeCard({
  title,
  subtitle,
  colors,
  onPress,
  badge,
}: {
  title: string;
  subtitle: string;
  colors: [string, string];
  onPress: () => void;
  badge?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>
      <LinearGradient colors={colors} style={styles.modeCard}>
        {badge && (
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{badge}</Text>
          </View>
        )}
        <Text style={styles.modeTitle}>{title}</Text>
        <Text style={styles.modeSub}>{subtitle}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export default function LobbyScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const playerName = useGameStore((s) => s.playerName);
  const totalRaces = useGameStore((s) => s.totalRaces);
  const totalWins = useGameStore((s) => s.totalWins);
  const passLevel = useGameStore((s) => s.passLevel);
  const achievements = useGameStore((s) => s.achievements);
  const achievementCount = Object.keys(achievements).length;

  // Daily streak reward
  const [dailyReward, setDailyReward] = useState<{ reward: number; streak: number } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const result = useGameStore.getState().checkDailyStreak();
    if (result) {
      setDailyReward(result);
      Animated.sequence([
        Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.delay(3000),
        Animated.timing(toastOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start(() => setDailyReward(null));
    }
  }, []);

  // Periodic state sync — fire-and-forget every 5 minutes
  useEffect(() => {
    const doSync = () => {
      const s = useGameStore.getState();
      syncPlayerState({
        playerName: s.playerName,
        coins: s.coins,
        totalRaces: s.totalRaces,
        totalWins: s.totalWins,
        currentStreak: s.currentStreak,
        bestStreak: s.bestStreak,
        dailyStreak: s.dailyStreak,
        passLevel: s.passLevel,
        passXp: s.passXp,
      });
    };
    doSync();
    const interval = setInterval(doSync, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ===== TOP BAR ===== */}
          <View style={styles.topBar}>
            <View style={styles.topBarLeft}>
              <View style={styles.avatar}>
                <Text style={styles.avatarLetter}>
                  {playerName ? playerName[0].toUpperCase() : 'P'}
                </Text>
              </View>
              <View>
                <Text style={styles.playerName}>{playerName || 'PLAYER'}</Text>
                <Text style={styles.playerSub}>Level {passLevel} · {totalWins}W-{totalRaces - totalWins}L</Text>
              </View>
            </View>
            <CoinPill amount={coins} onPress={() => router.push('/store')} />
          </View>

          {/* ===== MARBLES ROW ===== */}
          <View style={styles.marblesRow}>
            {MARBLES.map((m) => (
              <MarbleDot key={m.id} marble={m} size={32} />
            ))}
          </View>

          {/* ===== GAME MODES ===== */}
          <Text style={styles.sectionTitle}>GAME MODES</Text>

          <ModeCard
            title="SEASON"
            subtitle="Play Season 1 · Schedule, playoffs & championship"
            colors={['#ffc220', '#ff9a1a']}
            onPress={() => router.push('/season')}
            badge="MAIN"
          />

          <ModeCard
            title="NATIONAL RACES"
            subtitle="Special event races · Win 2x-5x multiplied payouts"
            colors={['#9b59b6', '#7d3c98']}
            onPress={() => router.push('/national-races')}
            badge="2X-5X"
          />

          <ModeCard
            title="TOURNAMENTS"
            subtitle="Bracket competitions · 8-marble elimination"
            colors={['#00b4d8', '#0077b6']}
            onPress={() => router.push('/tournaments')}
          />

          <ModeCard
            title="QUICK RACE"
            subtitle="Pick any course · Race for fun, no stakes"
            colors={['#2ecc71', '#1a9c58']}
            onPress={() => router.push('/courses')}
          />

          <ModeCard
            title="TRACK OF THE DAY"
            subtitle={`Today: ${getTrackOfTheDay().name} · Bonus coins!`}
            colors={['#f39c12', '#e67e22']}
            badge="DAILY"
            onPress={() => {
              const totd = getTrackOfTheDay();
              useGameStore.getState().selectCourse(totd.id);
              useGameStore.getState().setActiveMode({ type: 'quick_race' });
              useGameStore.getState().resetBet();
              router.push('/race');
            }}
          />

          <ModeCard
            title="GRAND PRIX"
            subtitle="F1-style sweeping curves and racing lines"
            colors={['#0a0a3a', '#e74c3c']}
            badge="F1"
            onPress={() => {
              useGameStore.getState().selectCourse('grand-prix-1');
              useGameStore.getState().setActiveMode({ type: 'quick_race' });
              useGameStore.getState().resetBet();
              router.push('/race');
            }}
          />

          <ModeCard
            title="CUSTOM TRACK"
            subtitle="Generate tracks from any seed · Race your creations"
            colors={['#e67e22', '#d35400']}
            onPress={() => router.push('/custom-track')}
          />

          <ModeCard
            title="PROFILE"
            subtitle="Your stats, league progress & favorite marble"
            colors={['#34495e', '#2c3e50']}
            onPress={() => router.push('/profile')}
          />

          {/* ===== EXPLORE ===== */}
          <Text style={styles.sectionTitle}>EXPLORE</Text>

          <View style={styles.navRow}>
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/roster')}
            >
              <Text style={styles.navLabel}>MARBLES</Text>
              <Text style={styles.navSub}>8 racers</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/analytics')}
            >
              <Text style={styles.navLabel}>ANALYTICS</Text>
              <Text style={styles.navSub}>Stats</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/courses')}
            >
              <Text style={styles.navLabel}>COURSES</Text>
              <Text style={styles.navSub}>96 tracks</Text>
            </Pressable>
          </View>

          <View style={styles.navRow}>
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/store')}
            >
              <Text style={styles.navLabel}>STORE</Text>
              <Text style={styles.navSub}>Buy coins</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/pass')}
            >
              <Text style={styles.navLabel}>SEASON PASS</Text>
              <Text style={styles.navSub}>Level {passLevel}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/settings')}
            >
              <Text style={styles.navLabel}>SETTINGS</Text>
              <Text style={styles.navSub}>Legal</Text>
            </Pressable>
          </View>

          <View style={styles.navRow}>
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/leaderboards')}
            >
              <Text style={styles.navLabel}>LEADERS</Text>
              <Text style={styles.navSub}>Rankings</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/achievements')}
            >
              <Text style={styles.navLabel}>ACHIEVE</Text>
              <Text style={styles.navSub}>{achievementCount}/{ACHIEVEMENTS.length}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.navCardPressed]}
              onPress={() => router.push('/challenges')}
            >
              <Text style={styles.navLabel}>CHALLENGES</Text>
              <Text style={styles.navSub}>Daily</Text>
            </Pressable>
          </View>


          {/* ===== FOOTER ===== */}
          <Text style={styles.disclaimer}>
            For ages 17+ · Virtual coins only · No real money gambling
          </Text>
        </ScrollView>
      </SafeAreaView>
      {dailyReward && (
        <Animated.View style={[styles.dailyToast, { opacity: toastOpacity }]} pointerEvents="none">
          <Text style={styles.dailyToastIcon}>🔥</Text>
          <View>
            <Text style={styles.dailyToastTitle}>Day {dailyReward.streak} Streak!</Text>
            <Text style={styles.dailyToastSub}>+{dailyReward.reward} coins</Text>
          </View>
        </Animated.View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 40,
  },

  /* ===== TOP BAR ===== */
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.yellow,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: Fonts.display,
    fontSize: 20,
    color: Colors.ink,
    marginTop: -1,
  },
  playerName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    color: Colors.white,
  },
  playerSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha50,
  },

  /* ===== MARBLES ROW ===== */
  marblesRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginBottom: 20,
  },

  /* ===== SECTION TITLE ===== */
  sectionTitle: {
    fontFamily: Fonts.display,
    fontSize: 13,
    color: Colors.whiteAlpha50,
    letterSpacing: 2,
    marginBottom: 10,
    marginTop: 10,
  },

  /* ===== MODE CARDS ===== */
  modeCard: {
    borderRadius: BorderRadius.lg,
    padding: 18,
    marginBottom: 10,
  },
  modeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingVertical: 2,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.pill,
    marginBottom: 6,
  },
  modeBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.white,
    letterSpacing: 1,
  },
  modeTitle: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.white,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modeSub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },

  /* ===== NAV ROW ===== */
  navRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  navCard: {
    flex: 1,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha12,
    borderRadius: BorderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  navCardPressed: {
    opacity: 0.7,
  },
  navLabel: {
    fontFamily: Fonts.display,
    fontSize: 12,
    color: Colors.white,
    marginBottom: 2,
  },
  navSub: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.whiteAlpha35,
  },

  /* ===== DISCLAIMER ===== */
  disclaimer: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha25,
    textAlign: 'center',
    marginTop: 16,
  },
  dailyToast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.yellow,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  dailyToastIcon: {
    fontSize: 28,
  },
  dailyToastTitle: {
    fontFamily: Fonts.display,
    fontSize: 16,
    color: Colors.yellow,
  },
  dailyToastSub: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: '#fff',
  },
});
