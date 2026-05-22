import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
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

  // ── Season standing ──
  const seasonEntry = season?.standings[marble.id] ?? null;
  const seasonRank = useMemo(() => {
    if (!season || !seasonEntry) return null;
    const sorted = Object.entries(season.standings)
      .sort(([, a], [, b]) => b.points - a.points || b.wins - a.wins);
    return sorted.findIndex(([id]) => id === marble.id) + 1;
  }, [season, seasonEntry, marble.id]);

  // ── Last 10 races placements (real raceHistory) ──
  const last10 = useMemo(
    () =>
      raceHistory
        .slice(-10)
        .map((r) => r.positions.indexOf(marble.id))
        .filter((pos) => pos >= 0)
        .map((pos) => pos + 1), // 1-indexed placement
    [raceHistory, marble.id],
  );

  // ── Head-to-head vs other marbles (real raceHistory) ──
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
        {/* Header */}
        <View style={styles.headerRow}>
          <BackButton onPress={() => router.back()} />
          <View style={styles.seasonBadge}>
            <Text style={styles.seasonBadgeText}>{seasonLabel}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ===== Identity hero ===== */}
          <LinearGradient
            colors={['#1a3a7a', '#0d1a3a']}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.heroCard}
          >
            <MarbleDot marble={marble} size={96} />
            <Text style={styles.marbleName}>{marble.name}</Text>
            <Text style={styles.personality}>{marble.personality}</Text>

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

            {/* Record row */}
            <View style={styles.recordRow}>
              <View style={styles.recordItem}>
                <Text style={styles.recordValue}>{record.wins}</Text>
                <Text style={styles.recordLabel}>WINS</Text>
              </View>
              <View style={styles.recordDivider} />
              <View style={styles.recordItem}>
                <Text style={styles.recordValue}>{record.losses}</Text>
                <Text style={styles.recordLabel}>LOSSES</Text>
              </View>
              <View style={styles.recordDivider} />
              <View style={styles.recordItem}>
                <Text style={styles.recordValue}>
                  {totalRaces > 0 ? `${winRatePct}%` : '--'}
                </Text>
                <Text style={styles.recordLabel}>WIN RATE</Text>
              </View>
            </View>
          </LinearGradient>

          {/* ===== Overall + stat bars ===== */}
          <View style={styles.card}>
            <View style={styles.ratingHeader}>
              <Text style={styles.sectionLabel}>RATING</Text>
              <View style={styles.overallPill}>
                <Text style={styles.overallNum}>{overall}</Text>
                <Text style={styles.overallLabel}>OVERALL</Text>
              </View>
            </View>

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
          </View>

          {/* ===== Season stats ===== */}
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>SEASON STATS</Text>
            {seasonEntry ? (
              <View style={styles.statGrid}>
                <View style={styles.statCell}>
                  <Text style={styles.statCellVal}>#{seasonRank}</Text>
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
          </View>

          {/* ===== Last 10 races ===== */}
          <View style={styles.card}>
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
          </View>

          {/* ===== Head-to-head ===== */}
          <View style={[styles.card, styles.cardLast]}>
            <Text style={styles.sectionLabel}>HEAD-TO-HEAD</Text>
            {headToHead.length > 0 ? (
              <View style={styles.h2hBlock}>
                {headToHead.map((h) => {
                  const pct = h.total > 0 ? (h.wins / h.total) * 100 : 0;
                  const ahead = h.wins >= h.losses;
                  return (
                    <View key={h.opp.id} style={styles.h2hRow}>
                      <MarbleDot marble={h.opp} size={20} />
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
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
  },

  // Season badge
  seasonBadge: {
    backgroundColor: Colors.yellowAlpha15,
    borderRadius: BorderRadius.pill,
    paddingVertical: 4,
    paddingHorizontal: 14,
  },
  seasonBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.yellow,
    letterSpacing: 2,
  },

  // Identity hero card
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha10,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 12,
  },
  marbleName: {
    fontFamily: Fonts.display,
    fontSize: 32,
    color: Colors.white,
    marginTop: 12,
  },
  personality: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.whiteAlpha40,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Record row
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginTop: 18,
  },
  recordItem: { alignItems: 'center', minWidth: 64 },
  recordDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.whiteAlpha10,
  },
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

  // Generic card (standard subtle styling — no gold border)
  card: {
    backgroundColor: Colors.whiteAlpha07,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
  },
  cardLast: {
    marginBottom: 0,
  },

  // Rating header row
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  // Overall rating
  overallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,194,32,0.12)',
    borderWidth: 1.5,
    borderColor: Colors.yellowAlpha20,
    borderRadius: BorderRadius.pill,
    paddingVertical: 5,
    paddingHorizontal: 14,
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
    gap: 10,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statLabel: {
    width: 56,
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.whiteAlpha40,
    textAlign: 'right',
  },
  statBarBg: {
    flex: 1,
    height: 10,
    backgroundColor: Colors.whiteAlpha07,
    borderRadius: 5,
    overflow: 'hidden',
  },
  statBarFill: {
    height: 10,
    borderRadius: 5,
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
    marginTop: 12,
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

  // Section labels
  sectionLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.yellow,
    letterSpacing: 2,
    marginBottom: 12,
  },

  // Season stat grid
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  statCell: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  statCellVal: {
    fontFamily: Fonts.display,
    fontSize: 20,
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
    gap: 6,
    height: 84,
    width: '100%',
  },
  sparkBarSlot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sparkBar: {
    width: '100%',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    minHeight: 4,
  },
  sparkPlace: {
    fontFamily: Fonts.bodyBold,
    fontSize: 9,
    color: Colors.whiteAlpha35,
    marginTop: 4,
  },

  // Head-to-head
  h2hBlock: {
    width: '100%',
  },
  h2hRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  h2hName: {
    flex: 1,
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
  },
  h2hRecord: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.whiteAlpha40,
    width: 44,
    textAlign: 'right',
  },
  h2hBarBg: {
    width: 72,
    height: 7,
    backgroundColor: Colors.whiteAlpha07,
    borderRadius: 3.5,
    overflow: 'hidden',
  },
  h2hBarFill: {
    height: 7,
    borderRadius: 3.5,
  },

  noData: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha35,
  },
});
