import React from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius, MarbleData } from '../theme';
import { useGameStore } from '../state/gameStore';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';
import MarbleDot from '../components/MarbleDot';
import PrimaryButton from '../components/PrimaryButton';
import { XP_PER_LEVEL } from '../data/seasonPass';

const LEAGUE_TIERS = [
  { name: 'BRONZE', threshold: 1, color: Colors.bronze, next: 'SILVER', nextLevel: 10 },
  { name: 'SILVER', threshold: 10, color: '#c0c0c0', next: 'GOLD', nextLevel: 20 },
  { name: 'GOLD', threshold: 20, color: Colors.yellow, next: 'DIAMOND', nextLevel: 30 },
  { name: 'DIAMOND', threshold: 30, color: '#b9f2ff', next: null, nextLevel: 50 },
];

function getLeague(level: number) {
  for (let i = LEAGUE_TIERS.length - 1; i >= 0; i--) {
    if (level >= LEAGUE_TIERS[i].threshold) return LEAGUE_TIERS[i];
  }
  return LEAGUE_TIERS[0];
}

function getFavoriteMarble(marbleStats: Record<string, { wins: number; losses: number; betCount: number }>) {
  let bestId = '';
  let bestCount = 0;
  for (const [id, stats] of Object.entries(marbleStats)) {
    if (stats.betCount > bestCount) {
      bestCount = stats.betCount;
      bestId = id;
    }
  }
  if (!bestId) return null;
  const marble = MARBLES.find((m) => m.id === bestId);
  return marble ? { marble, stats: marbleStats[bestId] } : null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const playerName = useGameStore((s) => s.playerName);
  const totalRaces = useGameStore((s) => s.totalRaces);
  const totalWins = useGameStore((s) => s.totalWins);
  const passLevel = useGameStore((s) => s.passLevel);
  const passXp = useGameStore((s) => s.passXp);
  const marbleStats = useGameStore((s) => s.marbleStats);

  const winRate = totalRaces > 0 ? Math.round((totalWins / totalRaces) * 100) : 0;

  const league = getLeague(passLevel);
  const currentXP = passXp;
  const nextTierXP = XP_PER_LEVEL;
  const progressPercent = (currentXP / nextTierXP) * 100;
  const favorite = getFavoriteMarble(marbleStats);

  return (
    <LinearGradient
      colors={['#1d56d4', '#0a3a96']}
      style={styles.fill}
    >
      <SafeAreaView style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ===== HEADER ROW ===== */}
          <View style={styles.headerRow}>
            <BackButton onPress={() => router.back()} />
            <CoinPill amount={coins} />
          </View>

          {/* ===== PROFILE HEADER ===== */}
          <View style={styles.profileHeader}>
            {/* Avatar */}
            <View style={styles.avatar}>
              <Text style={styles.avatarLetter}>{playerName ? playerName[0].toUpperCase() : 'P'}</Text>
            </View>

            {/* Info */}
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{playerName || 'PLAYER'}</Text>
              <View style={styles.leagueRow}>
                <View style={[styles.bronzeDot, { backgroundColor: league.color }]} />
                <Text style={[styles.leagueText, { color: league.color }]}>{league.name} LEAGUE</Text>
              </View>
              <Text style={styles.levelText}>Level {passLevel}</Text>
            </View>
          </View>

          {/* ===== LEAGUE PROGRESS ===== */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>LEAGUE PROGRESS</Text>

            {/* Progress bar */}
            <View style={styles.progressBarBg}>
              <LinearGradient
                colors={[Colors.bronze, Colors.yellow]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.progressBarFill,
                  { width: `${progressPercent}%` },
                ]}
              />
            </View>

            {/* Progress labels */}
            <View style={styles.progressLabels}>
              <Text style={styles.progressValue}>
                {currentXP} / {nextTierXP} XP
              </Text>
              <Text style={styles.progressTarget}>
                {league.next ? `${league.next} at Level ${league.nextLevel}` : 'MAX LEAGUE'}
              </Text>
            </View>
          </View>

          {/* ===== STATS GRID ===== */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{totalRaces}</Text>
              <Text style={styles.statLabel}>RACES</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{totalWins}</Text>
              <Text style={styles.statLabel}>WINS</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{winRate}%</Text>
              <Text style={styles.statLabel}>WIN RATE</Text>
            </View>
          </View>

          {/* ===== FAVORITE MARBLE ===== */}
          {favorite ? (
            <View style={styles.favoriteCard}>
              <MarbleDot marble={favorite.marble} size={40} />
              <View style={styles.favoriteInfo}>
                <Text style={styles.favoriteLabel}>FAVORITE MARBLE</Text>
                <Text style={styles.favoriteName}>{favorite.marble.name}</Text>
                <Text style={styles.favoriteStat}>
                  Bet on {favorite.stats.betCount} times {'\u00B7'} Won {favorite.stats.wins}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.favoriteCard}>
              <View style={[styles.avatar, { width: 40, height: 40, borderRadius: 20 }]}>
                <Text style={[styles.avatarLetter, { fontSize: 18 }]}>?</Text>
              </View>
              <View style={styles.favoriteInfo}>
                <Text style={styles.favoriteLabel}>FAVORITE MARBLE</Text>
                <Text style={styles.favoriteName}>No bets yet</Text>
                <Text style={styles.favoriteStat}>Place your first bet to track!</Text>
              </View>
            </View>
          )}

          {/* ===== ACTIONS ===== */}
          <View style={styles.actions}>
            <PrimaryButton
              label="COIN STORE"
              onPress={() => router.push('/store')}
            />
            <PrimaryButton
              label="VIEW ROSTER"
              variant="ghost"
              onPress={() => router.push('/roster')}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  /* ===== HEADER ===== */
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },

  /* ===== PROFILE HEADER ===== */
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.yellow,
    borderWidth: 3,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  avatarLetter: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.ink,
    marginTop: -2,
  },
  profileInfo: {
    marginLeft: 16,
  },
  profileName: {
    fontFamily: Fonts.display,
    fontSize: 24,
    color: Colors.white,
    marginBottom: 4,
  },
  leagueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bronzeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.bronze,
  },
  leagueText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.bronze,
  },
  levelText: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha40,
    marginTop: 2,
  },

  /* ===== LEAGUE PROGRESS ===== */
  sectionCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    letterSpacing: 1,
    marginBottom: 12,
  },
  progressBarBg: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: 10,
    borderRadius: 5,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressValue: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: Colors.whiteAlpha35,
  },
  progressTarget: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: Colors.whiteAlpha35,
  },

  /* ===== STATS GRID ===== */
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.yellow,
    marginBottom: 4,
  },
  statLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.whiteAlpha40,
    letterSpacing: 0.5,
  },

  /* ===== FAVORITE MARBLE ===== */
  favoriteCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  favoriteInfo: {
    marginLeft: 14,
    flex: 1,
  },
  favoriteLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: Colors.whiteAlpha40,
    letterSpacing: 1,
    marginBottom: 2,
  },
  favoriteName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    color: Colors.white,
    marginBottom: 2,
  },
  favoriteStat: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha40,
  },

  /* ===== ACTIONS ===== */
  actions: {
    gap: 10,
    marginTop: 10,
  },
});
