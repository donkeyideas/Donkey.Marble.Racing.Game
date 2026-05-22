import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { Colors, Fonts, MARBLES, BorderRadius, MarbleData } from '../theme';
import { useGameStore } from '../state/gameStore';
import BackButton from '../components/BackButton';
import MarbleDot from '../components/MarbleDot';

/**
 * Composite "OVERALL" score 0.0 – 10.0. Mirrors getOverallRating in
 * app/analytics.tsx exactly so the trading card and the analytics
 * screen agree on every marble's rating.
 */
function getOverallRating(
  marble: MarbleData,
  opts: { winRatePct?: number; form?: 'hot' | 'cold' | 'neutral'; betCount?: number; maxBetCount?: number } = {},
): string {
  const { speed, power, bounce, luck } = marble.stats;
  const baseAvg = (speed + power + bounce + luck) / 4;
  const baseScore = (baseAvg / 5) * 6;

  const winRate = opts.winRatePct ?? 0;
  const perfBonus = Math.max(-2, Math.min(2, ((winRate - 12.5) / 12.5) * 2));

  const formBonus = opts.form === 'hot' ? 1 : opts.form === 'cold' ? -1 : 0;

  const popBonus =
    opts.maxBetCount && opts.maxBetCount > 0 && opts.betCount !== undefined
      ? ((opts.betCount / opts.maxBetCount) - 0.5) * 2
      : 0;

  const total = Math.max(0, Math.min(10, baseScore + perfBonus + formBonus + popBonus));
  return total.toFixed(1);
}

// Stat-bar color pairs (gradient endpoints) keyed by stat
const STAT_META: { key: 'speed' | 'power' | 'bounce' | 'luck'; label: string; color: string }[] = [
  { key: 'speed', label: 'SPEED', color: Colors.red },
  { key: 'power', label: 'POWER', color: Colors.green },
  { key: 'bounce', label: 'BOUNCE', color: Colors.blueLight },
  { key: 'luck', label: 'LUCK', color: Colors.yellow },
];

export default function MarbleCardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  // Resolve the marble from the route param; default to the first marble.
  const marble = useMemo(
    () => MARBLES.find((m) => m.id === params.id) ?? MARBLES[0],
    [params.id],
  );

  // ── Store data ──
  const seasonStandings = useGameStore((s) => s.seasonStandings);
  const marbleStats = useGameStore((s) => s.marbleStats);
  const raceHistory = useGameStore((s) => s.raceHistory);
  const season = useGameStore((s) => s.season);

  // ── Flip state ──
  const flip = useSharedValue(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const toggleFlip = useCallback(() => {
    const next = !isFlipped;
    setIsFlipped(next);
    flip.value = withTiming(next ? 1 : 0, { duration: 450 });
  }, [isFlipped, flip]);

  const frontAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(flip.value, [0, 1], [0, 180])}deg` },
    ],
    opacity: flip.value > 0.5 ? 0 : 1,
  }));

  const backAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(flip.value, [0, 1], [180, 360])}deg` },
    ],
    opacity: flip.value > 0.5 ? 1 : 0,
  }));

  // ── Derived data (all real store data) ──

  // All-time record from seasonStandings
  const record = seasonStandings[marble.id] ?? { wins: 0, losses: 0 };
  const totalRaces = record.wins + record.losses;
  const winRatePct = totalRaces > 0 ? Math.round((record.wins / totalRaces) * 100) : 0;

  // Player betting stats
  const stats = marbleStats[marble.id] ?? { wins: 0, losses: 0, betCount: 0 };
  const maxBetCount = Object.values(marbleStats).reduce(
    (max, s) => Math.max(max, s.betCount),
    0,
  );

  // Last-5 form: hot if 3+ wins, cold if 0 wins
  const last5 = raceHistory.slice(-5);
  const recentWins = last5.filter((r) => r.positions[0] === marble.id).length;
  const form: 'hot' | 'cold' | 'neutral' = last5.length > 0
    ? recentWins >= 3 ? 'hot' : recentWins === 0 ? 'cold' : 'neutral'
    : 'neutral';

  const overall = getOverallRating(marble, {
    winRatePct,
    form,
    betCount: stats.betCount,
    maxBetCount,
  });

  // ── Back: season standing ──
  const seasonEntry = season?.standings[marble.id] ?? null;
  const seasonRank = useMemo(() => {
    if (!season || !seasonEntry) return null;
    const sorted = Object.entries(season.standings)
      .sort(([, a], [, b]) => b.points - a.points || b.wins - a.wins);
    return sorted.findIndex(([id]) => id === marble.id) + 1;
  }, [season, seasonEntry, marble.id]);

  // ── Back: last 10 races placements (real raceHistory) ──
  const last10 = useMemo(
    () =>
      raceHistory
        .slice(-10)
        .map((r) => r.positions.indexOf(marble.id))
        .filter((pos) => pos >= 0)
        .map((pos) => pos + 1), // 1-indexed placement
    [raceHistory, marble.id],
  );

  // ── Back: head-to-head vs other marbles (real raceHistory) ──
  // For every race both marbles appeared in, count who finished ahead.
  const headToHead = useMemo(() => {
    return MARBLES.filter((m) => m.id !== marble.id)
      .map((opp) => {
        let wins = 0;
        let losses = 0;
        raceHistory.forEach((race) => {
          const myPos = race.positions.indexOf(marble.id);
          const oppPos = race.positions.indexOf(opp.id);
          if (myPos < 0 || oppPos < 0) return;
          if (myPos < oppPos) wins++;
          else losses++;
        });
        return { opp, wins, losses, total: wins + losses };
      })
      .filter((h) => h.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [raceHistory, marble.id]);

  const seasonLabel = season ? `SEASON ${season.seasonNumber}` : 'PRESEASON';

  // Placement → color (1st green, podium amber, else red)
  const placeColor = (place: number) =>
    place === 1 ? Colors.green : place <= 3 ? Colors.yellowDeep : Colors.red;

  return (
    <LinearGradient colors={['#0d1a3a', '#0a1230']} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <BackButton onPress={() => router.back()} />
            <Pressable
              onPress={toggleFlip}
              hitSlop={10}
              style={({ pressed }) => [styles.flipBtn, pressed && styles.pressed]}
            >
              <Text style={styles.flipBtnText}>FLIP</Text>
            </Pressable>
          </View>

          {/* Card stage */}
          <Pressable onPress={toggleFlip} style={styles.cardStage}>
            {/* ===== FRONT ===== */}
            <Animated.View
              style={[styles.cardFace, styles.cardFront, frontAnimStyle]}
            >
              <LinearGradient
                colors={['#1a3a7a', '#0d1a3a', '#0a1230']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.cardFaceInner}
              >
                <View style={styles.seasonBadge}>
                  <Text style={styles.seasonBadgeText}>{seasonLabel}</Text>
                </View>

                <View style={styles.marbleBig}>
                  <MarbleDot marble={marble} size={92} />
                </View>

                <Text style={styles.marbleName}>{marble.name}</Text>
                <Text style={styles.personality}>{marble.personality}</Text>

                {/* Record row */}
                <View style={styles.recordRow}>
                  <View style={styles.recordItem}>
                    <Text style={styles.recordValue}>{record.wins}</Text>
                    <Text style={styles.recordLabel}>WINS</Text>
                  </View>
                  <View style={styles.recordItem}>
                    <Text style={styles.recordValue}>{record.losses}</Text>
                    <Text style={styles.recordLabel}>LOSSES</Text>
                  </View>
                  <View style={styles.recordItem}>
                    <Text style={styles.recordValue}>
                      {totalRaces > 0 ? `${winRatePct}%` : '--'}
                    </Text>
                    <Text style={styles.recordLabel}>WIN RATE</Text>
                  </View>
                </View>

                {/* Overall rating pill */}
                <View style={styles.overallPill}>
                  <Text style={styles.overallNum}>{overall}</Text>
                  <Text style={styles.overallLabel}>OVERALL</Text>
                </View>

                {/* Stat bars */}
                <View style={styles.statBlock}>
                  {STAT_META.map((meta) => {
                    const value = marble.stats[meta.key]; // 0..5 base
                    const pct = Math.max(0, Math.min(100, (value / 5) * 100));
                    return (
                      <View key={meta.key} style={styles.statRow}>
                        <Text style={styles.statLabel}>{meta.label}</Text>
                        <View style={styles.statBarBg}>
                          <View
                            style={[
                              styles.statBarFill,
                              { width: `${pct}%`, backgroundColor: meta.color },
                            ]}
                          />
                        </View>
                        <Text style={styles.statVal}>{value}</Text>
                      </View>
                    );
                  })}
                </View>

                {/* Hot / Cold badge */}
                {form !== 'neutral' && (
                  <View
                    style={[
                      styles.formBadge,
                      form === 'hot' ? styles.formBadgeHot : styles.formBadgeCold,
                    ]}
                  >
                    <Text
                      style={[
                        styles.formBadgeText,
                        form === 'hot' ? styles.formTextHot : styles.formTextCold,
                      ]}
                    >
                      {form === 'hot'
                        ? `HOT — ${recentWins} wins in last ${last5.length}`
                        : `COLD — ${recentWins} wins in last ${last5.length}`}
                    </Text>
                  </View>
                )}

                <Text style={styles.flipHint}>Tap to flip for full stats</Text>
              </LinearGradient>
            </Animated.View>

            {/* ===== BACK ===== */}
            <Animated.View
              style={[styles.cardFace, styles.cardBack, backAnimStyle]}
            >
              <LinearGradient
                colors={['#0d2a5a', '#0a1230']}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.cardFaceInner}
              >
                {/* Back header */}
                <View style={styles.backHeader}>
                  <MarbleDot marble={marble} size={36} />
                  <Text style={styles.backName}>{marble.name}</Text>
                  <View style={styles.seasonBadgeSm}>
                    <Text style={styles.seasonBadgeText}>
                      {season ? `S${season.seasonNumber}` : 'PRE'}
                    </Text>
                  </View>
                </View>

                {/* Season stats grid */}
                <Text style={styles.sectionLabel}>SEASON STATS</Text>
                {seasonEntry ? (
                  <View style={styles.statGrid}>
                    <View style={styles.statCell}>
                      <Text style={styles.statCellVal}>
                        #{seasonRank}
                      </Text>
                      <Text style={styles.statCellLabel}>RANK</Text>
                    </View>
                    <View style={styles.statCell}>
                      <Text style={[styles.statCellVal, { color: Colors.yellow }]}>
                        {seasonEntry.points}
                      </Text>
                      <Text style={styles.statCellLabel}>POINTS</Text>
                    </View>
                    <View style={styles.statCell}>
                      <Text style={styles.statCellVal}>
                        {seasonEntry.wins}-{seasonEntry.losses}
                      </Text>
                      <Text style={styles.statCellLabel}>W-L</Text>
                    </View>
                    <View style={styles.statCell}>
                      <Text style={styles.statCellVal}>{seasonEntry.podiums}</Text>
                      <Text style={styles.statCellLabel}>PODIUMS</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.noData}>
                    No active season — start a season to track standings.
                  </Text>
                )}

                {/* Last 10 races sparkline */}
                <Text style={styles.sectionLabel}>LAST 10 RACES</Text>
                {last10.length > 0 ? (
                  <View style={styles.sparkRow}>
                    {last10.map((place, i) => {
                      // 1st = tallest bar, 8th = shortest
                      const h = Math.max(15, ((9 - place) / 8) * 100);
                      return (
                        <View key={i} style={styles.sparkBarSlot}>
                          <View
                            style={[
                              styles.sparkBar,
                              { height: `${h}%`, backgroundColor: placeColor(place) },
                            ]}
                          />
                          <Text style={styles.sparkPlace}>{place}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.noData}>No races completed yet.</Text>
                )}

                {/* Head-to-head */}
                <Text style={styles.sectionLabel}>HEAD-TO-HEAD</Text>
                {headToHead.length > 0 ? (
                  <View style={styles.h2hBlock}>
                    {headToHead.map((h) => {
                      const pct = h.total > 0 ? (h.wins / h.total) * 100 : 0;
                      const ahead = h.wins >= h.losses;
                      return (
                        <View key={h.opp.id} style={styles.h2hRow}>
                          <MarbleDot marble={h.opp} size={18} />
                          <Text style={styles.h2hName}>{h.opp.name}</Text>
                          <Text style={styles.h2hRecord}>
                            {h.wins}-{h.losses}
                          </Text>
                          <View style={styles.h2hBarBg}>
                            <View
                              style={[
                                styles.h2hBarFill,
                                {
                                  width: `${pct}%`,
                                  backgroundColor: ahead ? Colors.green : Colors.red,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.noData}>No head-to-head data yet.</Text>
                )}

                <Text style={styles.flipHint}>Tap to flip back</Text>
              </LinearGradient>
            </Animated.View>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const CARD_WIDTH = 300;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  pressed: { opacity: 0.6 },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  flipBtn: {
    backgroundColor: Colors.yellowAlpha15,
    borderWidth: 1.5,
    borderColor: Colors.yellowAlpha20,
    borderRadius: BorderRadius.sm,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  flipBtnText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.yellow,
    letterSpacing: 1,
  },

  // Card stage — front + back stacked
  cardStage: {
    width: CARD_WIDTH,
    minHeight: 540,
  },
  cardFace: {
    width: CARD_WIDTH,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'rgba(255,194,32,0.3)',
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  cardFront: {
    position: 'relative',
  },
  cardBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  cardFaceInner: {
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
  },

  // Season badge
  seasonBadge: {
    backgroundColor: Colors.yellowAlpha15,
    borderRadius: BorderRadius.pill,
    paddingVertical: 4,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  seasonBadgeSm: {
    backgroundColor: Colors.yellowAlpha15,
    borderRadius: BorderRadius.pill,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  seasonBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.yellow,
    letterSpacing: 2,
  },

  // Front: marble + name
  marbleBig: {
    marginBottom: 10,
  },
  marbleName: {
    fontFamily: Fonts.display,
    fontSize: 32,
    color: Colors.white,
  },
  personality: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.whiteAlpha40,
    fontStyle: 'italic',
    marginBottom: 14,
  },

  // Record row
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 16,
  },
  recordItem: { alignItems: 'center' },
  recordValue: {
    fontFamily: Fonts.display,
    fontSize: 26,
    color: Colors.white,
  },
  recordLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 9,
    color: Colors.whiteAlpha35,
    letterSpacing: 1,
    marginTop: 2,
  },

  // Overall rating
  overallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,194,32,0.12)',
    borderWidth: 2,
    borderColor: Colors.yellowAlpha20,
    borderRadius: BorderRadius.pill,
    paddingVertical: 6,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  overallNum: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.yellow,
  },
  overallLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.whiteAlpha50,
    letterSpacing: 1,
  },

  // Stat bars
  statBlock: {
    width: '100%',
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statLabel: {
    width: 52,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.whiteAlpha40,
    textAlign: 'right',
  },
  statBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.whiteAlpha07,
    borderRadius: 4,
    overflow: 'hidden',
  },
  statBarFill: {
    height: 8,
    borderRadius: 4,
  },
  statVal: {
    width: 22,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.whiteAlpha50,
  },

  // Form badge
  formBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  formBadgeHot: {
    backgroundColor: 'rgba(231,76,60,0.15)',
    borderColor: 'rgba(231,76,60,0.3)',
  },
  formBadgeCold: {
    backgroundColor: 'rgba(52,152,219,0.15)',
    borderColor: 'rgba(52,152,219,0.3)',
  },
  formBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
  },
  formTextHot: { color: Colors.red },
  formTextCold: { color: '#3498db' },

  flipHint: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha25,
    marginTop: 16,
  },

  // Back header
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    paddingBottom: 12,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.whiteAlpha10,
  },
  backName: {
    flex: 1,
    fontFamily: Fonts.display,
    fontSize: 20,
    color: Colors.white,
  },

  // Section labels
  sectionLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.yellow,
    letterSpacing: 2,
    alignSelf: 'flex-start',
    marginBottom: 8,
    marginTop: 4,
  },

  // Season stat grid
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
    marginBottom: 12,
  },
  statCell: {
    width: '48.5%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  statCellVal: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.white,
  },
  statCellLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.whiteAlpha35,
    marginTop: 2,
  },

  // Sparkline
  sparkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 56,
    width: '100%',
    marginBottom: 12,
  },
  sparkBarSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sparkBar: {
    width: '100%',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    minHeight: 4,
  },
  sparkPlace: {
    fontFamily: Fonts.bodyBold,
    fontSize: 8,
    color: Colors.whiteAlpha35,
    marginTop: 2,
  },

  // Head-to-head
  h2hBlock: {
    width: '100%',
    marginBottom: 6,
  },
  h2hRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  h2hName: {
    flex: 1,
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.white,
  },
  h2hRecord: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.whiteAlpha40,
    width: 40,
    textAlign: 'right',
  },
  h2hBarBg: {
    width: 60,
    height: 6,
    backgroundColor: Colors.whiteAlpha07,
    borderRadius: 3,
    overflow: 'hidden',
  },
  h2hBarFill: {
    height: 6,
    borderRadius: 3,
  },

  noData: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha35,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
});
