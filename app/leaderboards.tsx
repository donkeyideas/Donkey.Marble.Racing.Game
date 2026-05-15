import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius } from '../theme';
import { useGameStore } from '../state/gameStore';
import BackButton from '../components/BackButton';
import MarbleDot from '../components/MarbleDot';

type Tab = 'marbles' | 'records' | 'career';
const TABS: { key: Tab; label: string }[] = [
  { key: 'marbles', label: 'MARBLES' },
  { key: 'records', label: 'RECORDS' },
  { key: 'career', label: 'CAREER' },
];

export default function LeaderboardsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('marbles');
  const marbleStats = useGameStore(s => s.marbleStats);
  const totalRaces = useGameStore(s => s.totalRaces);
  const totalWins = useGameStore(s => s.totalWins);
  const bestStreak = useGameStore(s => s.bestStreak);
  const coinHistory = useGameStore(s => s.coinHistory);
  const season = useGameStore(s => s.season);

  const marbleRankings = useMemo(() => {
    return MARBLES.map(m => {
      const stats = marbleStats[m.id] || { wins: 0, losses: 0, betCount: 0 };
      const total = stats.wins + stats.losses;
      const winRate = total > 0 ? (stats.wins / total) * 100 : 0;
      return { marble: m, ...stats, total, winRate };
    }).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);
  }, [marbleStats]);

  const totalCoinsEarned = useMemo(() =>
    coinHistory.filter(t => t.type === 'payout').reduce((s, t) => s + t.amount, 0),
  [coinHistory]);

  const seasonsWon = season?.seasonHistory?.length ?? 0;

  const mostProfitable = useMemo(() => {
    let best = { name: '—', winRate: 0 };
    MARBLES.forEach(m => {
      const s = marbleStats[m.id];
      if (!s || s.betCount === 0) return;
      const wr = s.wins / (s.wins + s.losses);
      if (wr > best.winRate) best = { name: m.name, winRate: wr };
    });
    return best;
  }, [marbleStats]);

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.title}>LEADERBOARDS</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
          {TABS.map(t => (
            <Pressable
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {tab === 'marbles' && marbleRankings.map((r, i) => (
            <View key={r.marble.id} style={styles.rankCard}>
              <Text style={[styles.rank, i < 3 && styles.rankTop]}>
                {i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`}
              </Text>
              <MarbleDot marble={r.marble} size={36} />
              <View style={styles.rankInfo}>
                <Text style={styles.rankName}>{r.marble.name}</Text>
                <Text style={styles.rankSub}>
                  {r.wins}W – {r.losses}L · {r.winRate.toFixed(1)}%
                </Text>
              </View>
              <Text style={styles.rankWins}>{r.wins}</Text>
            </View>
          ))}

          {tab === 'records' && (
            <View style={styles.recordsGrid}>
              <View style={styles.recordCard}>
                <Text style={styles.recordValue}>{totalRaces}</Text>
                <Text style={styles.recordLabel}>TOTAL RACES</Text>
              </View>
              <View style={styles.recordCard}>
                <Text style={styles.recordValue}>{totalWins}</Text>
                <Text style={styles.recordLabel}>TOTAL WINS</Text>
              </View>
              <View style={styles.recordCard}>
                <Text style={styles.recordValue}>{bestStreak}</Text>
                <Text style={styles.recordLabel}>BEST STREAK</Text>
              </View>
              <View style={styles.recordCard}>
                <Text style={styles.recordValue}>{seasonsWon}</Text>
                <Text style={styles.recordLabel}>SEASONS WON</Text>
              </View>
              <View style={styles.recordCard}>
                <Text style={[styles.recordValue, { color: Colors.yellow }]}>
                  {totalCoinsEarned.toLocaleString()}
                </Text>
                <Text style={styles.recordLabel}>COINS EARNED</Text>
              </View>
              <View style={styles.recordCard}>
                <Text style={styles.recordValue}>
                  {totalRaces > 0 ? ((totalWins / totalRaces) * 100).toFixed(1) : '0'}%
                </Text>
                <Text style={styles.recordLabel}>WIN RATE</Text>
              </View>
            </View>
          )}

          {tab === 'career' && (
            <View>
              <View style={styles.careerCard}>
                <Text style={styles.careerLabel}>OVERALL WIN RATE</Text>
                <Text style={styles.careerValue}>
                  {totalRaces > 0 ? ((totalWins / totalRaces) * 100).toFixed(1) : '0'}%
                </Text>
                <Text style={styles.careerSub}>
                  {totalWins} wins / {totalRaces} races
                </Text>
              </View>

              <View style={styles.careerCard}>
                <Text style={styles.careerLabel}>MOST PROFITABLE MARBLE</Text>
                <Text style={styles.careerValue}>{mostProfitable.name}</Text>
                <Text style={styles.careerSub}>
                  {(mostProfitable.winRate * 100).toFixed(1)}% win rate
                </Text>
              </View>

              <View style={styles.careerCard}>
                <Text style={styles.careerLabel}>BEST WIN STREAK</Text>
                <Text style={styles.careerValue}>{bestStreak}</Text>
                <Text style={styles.careerSub}>consecutive wins</Text>
              </View>

              <View style={styles.careerCard}>
                <Text style={styles.careerLabel}>SEASONS COMPLETED</Text>
                <Text style={styles.careerValue}>{seasonsWon}</Text>
                <Text style={styles.careerSub}>championships won</Text>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  title: { fontFamily: Fonts.display, fontSize: 22, color: Colors.white, letterSpacing: 2 },
  tabBar: { flexGrow: 0, paddingHorizontal: Spacing.md, marginTop: Spacing.md },
  tab: {
    paddingHorizontal: 18, paddingVertical: 8, marginRight: 10,
    borderRadius: BorderRadius.pill, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabActive: { backgroundColor: Colors.yellow },
  tabText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.whiteAlpha60, letterSpacing: 1 },
  tabTextActive: { color: Colors.ink },
  scroll: { flex: 1, marginTop: Spacing.md },
  scrollContent: { paddingHorizontal: Spacing.md, paddingBottom: 40 },

  // Marble rankings
  rankCard: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  rank: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.whiteAlpha60, width: 36 },
  rankTop: { color: Colors.yellow },
  rankInfo: { flex: 1, marginLeft: 12 },
  rankName: { fontFamily: Fonts.bodySemiBold, fontSize: 16, color: Colors.white },
  rankSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.whiteAlpha50, marginTop: 2 },
  rankWins: { fontFamily: Fonts.display, fontSize: 20, color: Colors.yellow },

  // Records grid
  recordsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  recordCard: {
    width: '48%', padding: 18, marginBottom: 12, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  recordValue: { fontFamily: Fonts.display, fontSize: 28, color: Colors.white },
  recordLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.whiteAlpha50, letterSpacing: 1, marginTop: 6 },

  // Career
  careerCard: {
    padding: 18, marginBottom: 12, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  careerLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.whiteAlpha50, letterSpacing: 1 },
  careerValue: { fontFamily: Fonts.display, fontSize: 32, color: Colors.yellow, marginTop: 6 },
  careerSub: { fontFamily: Fonts.body, fontSize: 13, color: Colors.whiteAlpha40, marginTop: 4 },
});
