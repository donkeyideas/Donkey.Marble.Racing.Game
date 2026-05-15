import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import { useGameStore } from '../state/gameStore';
import type { ChallengeProgress } from '../data/challenges';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';

function ChallengeCard({ challenge, onClaim }: { challenge: ChallengeProgress; onClaim: () => void }) {
  const progress = Math.min(challenge.current / challenge.target, 1);

  return (
    <View style={[styles.card, challenge.completed && styles.cardComplete]}>
      <View style={styles.cardTop}>
        <Text style={styles.cardDesc}>{challenge.description}</Text>
        <Text style={[styles.cardReward, challenge.claimed && { color: Colors.whiteAlpha40 }]}>
          +{challenge.reward}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBg}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.progressText}>
        {challenge.current} / {challenge.target}
      </Text>

      {/* Claim button */}
      {challenge.completed && !challenge.claimed && (
        <Pressable style={styles.claimBtn} onPress={onClaim}>
          <Text style={styles.claimBtnText}>CLAIM</Text>
        </Pressable>
      )}
      {challenge.claimed && (
        <Text style={styles.claimedLabel}>CLAIMED</Text>
      )}
    </View>
  );
}

export default function ChallengesScreen() {
  const router = useRouter();
  const coins = useGameStore(s => s.coins);
  const challenges = useGameStore(s => s.challenges);
  const refreshChallenges = useGameStore(s => s.refreshChallenges);
  const claimChallengeReward = useGameStore(s => s.claimChallengeReward);

  useEffect(() => {
    refreshChallenges();
  }, []);

  const dailyComplete = challenges.daily.filter(c => c.completed).length;
  const weeklyComplete = challenges.weekly.filter(c => c.completed).length;

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.gradient}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <BackButton onPress={() => router.back()} />
          <Text style={styles.title}>CHALLENGES</Text>
          <CoinPill amount={coins} />
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Daily */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>DAILY CHALLENGES</Text>
            <Text style={styles.sectionSub}>{dailyComplete}/{challenges.daily.length} complete</Text>
          </View>

          {challenges.daily.length === 0 && (
            <Text style={styles.emptyText}>Loading challenges...</Text>
          )}

          {challenges.daily.map(c => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              onClaim={() => claimChallengeReward(c.id)}
            />
          ))}

          {/* Weekly */}
          <View style={[styles.sectionHeader, { marginTop: Spacing.lg }]}>
            <Text style={styles.sectionTitle}>WEEKLY CHALLENGES</Text>
            <Text style={styles.sectionSub}>{weeklyComplete}/{challenges.weekly.length} complete</Text>
          </View>

          {challenges.weekly.length === 0 && (
            <Text style={styles.emptyText}>Loading challenges...</Text>
          )}

          {challenges.weekly.map(c => (
            <ChallengeCard
              key={c.id}
              challenge={c}
              onClaim={() => claimChallengeReward(c.id)}
            />
          ))}

          {/* Reward summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>TOTAL AVAILABLE REWARDS</Text>
            <Text style={styles.summaryValue}>
              {[...challenges.daily, ...challenges.weekly]
                .filter(c => !c.claimed)
                .reduce((s, c) => s + c.reward, 0)
                .toLocaleString()} coins
            </Text>
          </View>
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
  scroll: { flex: 1, marginTop: Spacing.md },
  scrollContent: { paddingHorizontal: Spacing.md, paddingBottom: 40 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontFamily: Fonts.display, fontSize: 16, color: Colors.white, letterSpacing: 2 },
  sectionSub: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.whiteAlpha50 },

  emptyText: { fontFamily: Fonts.body, fontSize: 13, color: Colors.whiteAlpha40, textAlign: 'center', padding: 20 },

  card: {
    padding: 16, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  cardComplete: { borderColor: Colors.green },

  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  cardDesc: { fontFamily: Fonts.bodySemiBold, fontSize: 14, color: Colors.white, flex: 1, marginRight: 10 },
  cardReward: { fontFamily: Fonts.display, fontSize: 16, color: Colors.yellow },

  progressBg: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.green },
  progressText: { fontFamily: Fonts.body, fontSize: 11, color: Colors.whiteAlpha50, marginTop: 4, textAlign: 'right' },

  claimBtn: {
    marginTop: 10, paddingVertical: 10, alignItems: 'center',
    backgroundColor: Colors.yellow, borderRadius: BorderRadius.sm,
  },
  claimBtnText: { fontFamily: Fonts.display, fontSize: 14, color: Colors.ink, letterSpacing: 1 },

  claimedLabel: {
    fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.whiteAlpha40,
    textAlign: 'center', marginTop: 8, letterSpacing: 1,
  },

  summaryCard: {
    padding: 18, marginTop: Spacing.lg, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.yellowAlpha20,
  },
  summaryTitle: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.whiteAlpha50, letterSpacing: 1 },
  summaryValue: { fontFamily: Fonts.display, fontSize: 24, color: Colors.yellow, marginTop: 6 },
});
