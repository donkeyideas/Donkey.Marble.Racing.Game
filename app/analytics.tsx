import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius, MarbleData } from '../theme';
import { useGameStore } from '../state/gameStore';
import BackButton from '../components/BackButton';
import MarbleDot from '../components/MarbleDot';

function getOverallRating(marble: MarbleData) {
  const { speed, power, bounce, luck } = marble.stats;
  return Math.round((speed + power + bounce + luck) / 4);
}

function StatBarInline({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statBarRow}>
      <Text style={styles.statBarLabel}>{label}</Text>
      <View style={styles.statBarTrack}>
        <View style={[styles.statBarFill, { width: `${value}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.statBarValue}>{value}</Text>
    </View>
  );
}

export default function AnalyticsScreen() {
  const router = useRouter();
  const seasonStandings = useGameStore((s) => s.seasonStandings);
  const marbleStats = useGameStore((s) => s.marbleStats);
  const raceHistory = useGameStore((s) => s.raceHistory);
  const totalRaces = useGameStore((s) => s.totalRaces);

  // Compute rankings sorted by win rate
  const rankings = MARBLES.map((m) => {
    const standing = seasonStandings[m.id] || { wins: 0, losses: 0 };
    const total = standing.wins + standing.losses;
    const winRate = total > 0 ? Math.round((standing.wins / total) * 100) : 0;
    const stats = marbleStats[m.id] || { wins: 0, losses: 0, betCount: 0 };

    // Hot/cold: check last 5 races
    let recentWins = 0;
    const last5 = raceHistory.slice(-5);
    last5.forEach((race) => {
      if (race.positions[0] === m.id) recentWins++;
    });
    const form = last5.length > 0
      ? recentWins >= 3 ? 'hot' : recentWins === 0 ? 'cold' : 'neutral'
      : 'neutral';

    return { marble: m, standing, winRate, stats, form, recentWins };
  }).sort((a, b) => b.standing.wins - a.standing.wins);

  // Overall stats
  const totalWinsAll = rankings.reduce((sum, r) => sum + r.standing.wins, 0);
  const mostWins = rankings[0];
  const bestWinRate = [...rankings].sort((a, b) => b.winRate - a.winRate)[0];

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <BackButton onPress={() => router.back()} />
          </View>

          {/* Title */}
          <Text style={styles.title}>MARBLE ANALYTICS</Text>
          <Text style={styles.subtitle}>
            Performance stats across {totalRaces} races
          </Text>

          {/* Overview stats */}
          <View style={styles.overviewRow}>
            <View style={styles.overviewCard}>
              <Text style={styles.overviewValue}>{totalRaces}</Text>
              <Text style={styles.overviewLabel}>TOTAL RACES</Text>
            </View>
            <View style={styles.overviewCard}>
              {mostWins && mostWins.standing.wins > 0 ? (
                <>
                  <MarbleDot marble={mostWins.marble} size={28} />
                  <Text style={styles.overviewLabel}>MOST WINS</Text>
                </>
              ) : (
                <>
                  <Text style={styles.overviewValue}>--</Text>
                  <Text style={styles.overviewLabel}>MOST WINS</Text>
                </>
              )}
            </View>
            <View style={styles.overviewCard}>
              {bestWinRate && bestWinRate.winRate > 0 ? (
                <>
                  <Text style={styles.overviewValue}>{bestWinRate.winRate}%</Text>
                  <Text style={styles.overviewLabel}>BEST WIN %</Text>
                </>
              ) : (
                <>
                  <Text style={styles.overviewValue}>--</Text>
                  <Text style={styles.overviewLabel}>BEST WIN %</Text>
                </>
              )}
            </View>
          </View>

          {/* Power rankings */}
          <Text style={styles.sectionTitle}>POWER RANKINGS</Text>

          {rankings.map((entry, i) => (
            <View key={entry.marble.id} style={styles.rankingCard}>
              {/* Rank + marble */}
              <View style={styles.rankingHeader}>
                <View style={[
                  styles.rankNum,
                  i === 0 && { backgroundColor: Colors.yellowAlpha20 },
                  i === 1 && { backgroundColor: 'rgba(192,192,192,0.15)' },
                  i === 2 && { backgroundColor: 'rgba(205,127,50,0.15)' },
                ]}>
                  <Text style={[
                    styles.rankNumText,
                    i === 0 && { color: Colors.yellow },
                    i === 1 && { color: '#c0c0c0' },
                    i === 2 && { color: Colors.bronze },
                  ]}>#{i + 1}</Text>
                </View>
                <MarbleDot marble={entry.marble} size={32} />
                <View style={styles.rankingInfo}>
                  <Text style={styles.rankingName}>{entry.marble.name}</Text>
                  <Text style={styles.rankingRecord}>
                    {entry.standing.wins}W-{entry.standing.losses}L
                    {entry.winRate > 0 ? ` · ${entry.winRate}%` : ''}
                  </Text>
                </View>
                {/* Form indicator */}
                {entry.form === 'hot' && (
                  <View style={styles.hotBadge}><Text style={styles.hotText}>HOT</Text></View>
                )}
                {entry.form === 'cold' && (
                  <View style={styles.coldBadge}><Text style={styles.coldText}>COLD</Text></View>
                )}
              </View>

              {/* Stat bars */}
              <View style={styles.rankingStats}>
                <StatBarInline label="SPD" value={entry.marble.stats.speed} color={Colors.yellow} />
                <StatBarInline label="PWR" value={entry.marble.stats.power} color={Colors.green} />
                <StatBarInline label="BNC" value={entry.marble.stats.bounce} color="#4d80ff" />
                <StatBarInline label="LCK" value={entry.marble.stats.luck} color={Colors.red} />
              </View>

              {/* Betting stats */}
              {entry.stats.betCount > 0 && (
                <View style={styles.betStatsRow}>
                  <Text style={styles.betStatsText}>
                    Your bets: {entry.stats.betCount} placed · {entry.stats.wins} won
                  </Text>
                </View>
              )}

              {/* Overall rating */}
              <View style={styles.ratingRow}>
                <Text style={styles.ratingLabel}>OVERALL</Text>
                <Text style={styles.ratingValue}>{getOverallRating(entry.marble)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },

  title: { fontFamily: Fonts.display, fontSize: 28, color: Colors.white, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontFamily: Fonts.body, fontSize: 13, color: Colors.whiteAlpha40, textAlign: 'center', marginBottom: 16 },

  sectionTitle: { fontFamily: Fonts.display, fontSize: 13, color: Colors.whiteAlpha50, letterSpacing: 2, marginBottom: 10, marginTop: 10 },

  /* Overview */
  overviewRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  overviewCard: {
    flex: 1,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  overviewValue: { fontFamily: Fonts.display, fontSize: 22, color: Colors.yellow },
  overviewLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: Colors.whiteAlpha35, letterSpacing: 0.5, marginTop: 2 },

  /* Rankings */
  rankingCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 10,
  },
  rankingHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  rankNum: { width: 28, height: 28, borderRadius: 8, backgroundColor: Colors.whiteAlpha07, alignItems: 'center', justifyContent: 'center' },
  rankNumText: { fontFamily: Fonts.bodyBold, fontSize: 12, color: Colors.whiteAlpha35 },
  rankingInfo: { flex: 1 },
  rankingName: { fontFamily: Fonts.bodyBold, fontSize: 15, color: Colors.white },
  rankingRecord: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha40 },

  hotBadge: { backgroundColor: 'rgba(231,76,60,0.2)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: BorderRadius.pill },
  hotText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.red, letterSpacing: 0.5 },
  coldBadge: { backgroundColor: 'rgba(52,152,219,0.2)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: BorderRadius.pill },
  coldText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: '#3498db', letterSpacing: 0.5 },

  /* Stat bars */
  rankingStats: { gap: 4, marginBottom: 8 },
  statBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statBarLabel: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.whiteAlpha35, width: 28 },
  statBarTrack: { flex: 1, height: 6, backgroundColor: Colors.whiteAlpha07, borderRadius: 3, overflow: 'hidden' },
  statBarFill: { height: 6, borderRadius: 3 },
  statBarValue: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: Colors.whiteAlpha40, width: 22, textAlign: 'right' },

  /* Bet stats */
  betStatsRow: { paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', marginBottom: 6 },
  betStatsText: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha35 },

  /* Rating */
  ratingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  ratingLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: Colors.whiteAlpha35, letterSpacing: 1 },
  ratingValue: { fontFamily: Fonts.display, fontSize: 18, color: Colors.yellow },
});
