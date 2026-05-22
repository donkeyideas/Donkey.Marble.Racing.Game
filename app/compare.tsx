import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius, MarbleData } from '../theme';
import { useGameStore } from '../state/gameStore';
import BackButton from '../components/BackButton';
import MarbleDot from '../components/MarbleDot';

/**
 * Composite "OVERALL" score 0.0 – 10.0. Mirrors the helper in
 * app/analytics.tsx so the two screens agree:
 *   - Base score: (speed+power+bounce+luck)/4 scaled to 0–6  (60%)
 *   - Performance bonus: ±2 based on win rate vs the 12.5% baseline
 *   - Recent-form bonus: ±1 for hot/cold last-5-races (10%)
 *   - Bet-popularity bonus: ±1 for high-bet marbles (10%)
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

interface MarbleProfile {
  marble: MarbleData;
  // base stats scaled to 0-100 for bar display
  speed: number;
  power: number;
  bounce: number;
  luck: number;
  wins: number;
  losses: number;
  winRate: number;        // %
  avgFinish: number | null; // average finish position, null if no races
  form: 'hot' | 'cold' | 'neutral';
  overall: string;
}

const STAT_LEFT_COLOR = Colors.red;
const STAT_RIGHT_COLOR = '#3498db';

/** A side-by-side stat row: left value | mirrored bars | label | right value */
function StatRow({
  label,
  leftValue,
  rightValue,
  leftDisplay,
  rightDisplay,
}: {
  label: string;
  leftValue: number;
  rightValue: number;
  leftDisplay: string;
  rightDisplay: string;
}) {
  const max = Math.max(leftValue, rightValue, 1);
  const leftWins = leftValue > rightValue;
  const rightWins = rightValue > leftValue;
  return (
    <View style={styles.csRow}>
      <Text style={[styles.csValLeft, leftWins ? styles.csWinnerLeft : styles.csLoser]}>
        {leftDisplay}
      </Text>
      <View style={styles.csBarArea}>
        <View style={styles.csBarLeft}>
          <View
            style={[
              styles.csBarFill,
              { width: `${(leftValue / max) * 100}%`, backgroundColor: STAT_LEFT_COLOR },
            ]}
          />
        </View>
        <View style={styles.csBarRight}>
          <View
            style={[
              styles.csBarFill,
              { width: `${(rightValue / max) * 100}%`, backgroundColor: STAT_RIGHT_COLOR },
            ]}
          />
        </View>
      </View>
      <Text style={styles.csLabel}>{label}</Text>
      <Text style={[styles.csValRight, rightWins ? styles.csWinnerRight : styles.csLoser]}>
        {rightDisplay}
      </Text>
    </View>
  );
}

/** A record row with no bars — just left value | label | right value */
function RecordRow({
  label,
  leftValue,
  rightValue,
  leftDisplay,
  rightDisplay,
  higherIsBetter = true,
}: {
  label: string;
  leftValue: number;
  rightValue: number;
  leftDisplay: string;
  rightDisplay: string;
  higherIsBetter?: boolean;
}) {
  const leftWins = higherIsBetter ? leftValue > rightValue : leftValue < rightValue;
  const rightWins = higherIsBetter ? rightValue > leftValue : rightValue < leftValue;
  return (
    <View style={styles.csRow}>
      <Text style={[styles.csValLeft, leftWins ? styles.csWinnerLeft : styles.csLoser]}>
        {leftDisplay}
      </Text>
      <Text style={styles.csLabelWide}>{label}</Text>
      <Text style={[styles.csValRight, rightWins ? styles.csWinnerRight : styles.csLoser]}>
        {rightDisplay}
      </Text>
    </View>
  );
}

export default function CompareScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ a?: string; b?: string }>();

  const seasonStandings = useGameStore((s) => s.seasonStandings);
  const marbleStats = useGameStore((s) => s.marbleStats);
  const raceHistory = useGameStore((s) => s.raceHistory);

  // Resolve default selection from route params, falling back to first two.
  const findIndex = (id: string | undefined, fallback: number) => {
    const i = id ? MARBLES.findIndex((m) => m.id === id) : -1;
    return i >= 0 ? i : fallback;
  };
  const [indexA, setIndexA] = useState(() => findIndex(params.a, 0));
  const [indexB, setIndexB] = useState(() => findIndex(params.b, 1));

  const maxBetCount = MARBLES.reduce(
    (max, m) => Math.max(max, marbleStats[m.id]?.betCount ?? 0),
    0,
  );

  const buildProfile = (marble: MarbleData): MarbleProfile => {
    const standing = seasonStandings[marble.id] || { wins: 0, losses: 0 };
    const total = standing.wins + standing.losses;
    const winRate = total > 0 ? Math.round((standing.wins / total) * 100) : 0;

    // Average finish position across recorded race history.
    let positionSum = 0;
    let positionCount = 0;
    raceHistory.forEach((race) => {
      const pos = race.positions.indexOf(marble.id);
      if (pos >= 0) {
        positionSum += pos + 1;
        positionCount++;
      }
    });
    const avgFinish = positionCount > 0 ? positionSum / positionCount : null;

    // Hot/cold from last 5 races (matches analytics.tsx logic).
    const last5 = raceHistory.slice(-5);
    let recentWins = 0;
    last5.forEach((race) => {
      if (race.positions[0] === marble.id) recentWins++;
    });
    const form: 'hot' | 'cold' | 'neutral' =
      last5.length > 0
        ? recentWins >= 3
          ? 'hot'
          : recentWins === 0
            ? 'cold'
            : 'neutral'
        : 'neutral';

    const overall = getOverallRating(marble, {
      winRatePct: winRate,
      form,
      betCount: marbleStats[marble.id]?.betCount ?? 0,
      maxBetCount,
    });

    return {
      marble,
      // Base stats are 0-5; scale to 0-100 for bar display.
      speed: marble.stats.speed * 20,
      power: marble.stats.power * 20,
      bounce: marble.stats.bounce * 20,
      luck: marble.stats.luck * 20,
      wins: standing.wins,
      losses: standing.losses,
      winRate,
      avgFinish,
      form,
      overall,
    };
  };

  const profileA = buildProfile(MARBLES[indexA]);
  const profileB = buildProfile(MARBLES[indexB]);

  // Cycle to the next marble, skipping the one selected on the other side.
  const cycle = (current: number, other: number, dir: 1 | -1) => {
    let next = current;
    do {
      next = (next + dir + MARBLES.length) % MARBLES.length;
    } while (next === other);
    return next;
  };

  const renderSelector = (
    profile: MarbleProfile,
    sideColor: string,
    onPrev: () => void,
    onNext: () => void,
  ) => (
    <View style={[styles.compareCard, { borderColor: sideColor }]}>
      <View style={styles.selectorRow}>
        <Pressable onPress={onPrev} hitSlop={8} style={styles.arrowBtn}>
          <Text style={styles.arrowText}>{'‹'}</Text>
        </Pressable>
        <MarbleDot marble={profile.marble} size={44} />
        <Pressable onPress={onNext} hitSlop={8} style={styles.arrowBtn}>
          <Text style={styles.arrowText}>{'›'}</Text>
        </Pressable>
      </View>
      <Text style={styles.ccName}>{profile.marble.name}</Text>
      <Text style={styles.ccRecord}>
        {profile.wins}-{profile.losses}
        {profile.winRate > 0 ? ` · ${profile.winRate}%` : ''}
      </Text>
      {profile.form === 'hot' && (
        <View style={styles.hotBadge}>
          <Text style={styles.hotText}>HOT</Text>
        </View>
      )}
      {profile.form === 'cold' && (
        <View style={styles.coldBadge}>
          <Text style={styles.coldText}>COLD</Text>
        </View>
      )}
    </View>
  );

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
            <View style={styles.spacer} />
          </View>

          {/* Title */}
          <Text style={styles.title}>HEAD TO HEAD</Text>
          <Text style={styles.subtitle}>Compare marble stats side by side</Text>

          {/* Selector cards */}
          <View style={styles.compareCards}>
            {renderSelector(
              profileA,
              'rgba(231,76,60,0.3)',
              () => setIndexA((i) => cycle(i, indexB, -1)),
              () => setIndexA((i) => cycle(i, indexB, 1)),
            )}
            {renderSelector(
              profileB,
              'rgba(52,152,219,0.3)',
              () => setIndexB((i) => cycle(i, indexA, -1)),
              () => setIndexB((i) => cycle(i, indexA, 1)),
            )}
          </View>

          {/* Stat comparison */}
          <Text style={styles.sectionLabel}>STAT COMPARISON</Text>
          <View style={styles.statSection}>
            <StatRow
              label="Speed"
              leftValue={profileA.speed}
              rightValue={profileB.speed}
              leftDisplay={`${profileA.speed}`}
              rightDisplay={`${profileB.speed}`}
            />
            <StatRow
              label="Power"
              leftValue={profileA.power}
              rightValue={profileB.power}
              leftDisplay={`${profileA.power}`}
              rightDisplay={`${profileB.power}`}
            />
            <StatRow
              label="Bounce"
              leftValue={profileA.bounce}
              rightValue={profileB.bounce}
              leftDisplay={`${profileA.bounce}`}
              rightDisplay={`${profileB.bounce}`}
            />
            <StatRow
              label="Luck"
              leftValue={profileA.luck}
              rightValue={profileB.luck}
              leftDisplay={`${profileA.luck}`}
              rightDisplay={`${profileB.luck}`}
            />
          </View>

          {/* Overall rating */}
          <Text style={styles.sectionLabel}>OVERALL RATING</Text>
          <View style={styles.statSection}>
            <RecordRow
              label="Overall"
              leftValue={parseFloat(profileA.overall)}
              rightValue={parseFloat(profileB.overall)}
              leftDisplay={profileA.overall}
              rightDisplay={profileB.overall}
            />
          </View>

          {/* Season record */}
          <Text style={styles.sectionLabel}>SEASON RECORD</Text>
          <View style={styles.statSection}>
            <RecordRow
              label="Wins"
              leftValue={profileA.wins}
              rightValue={profileB.wins}
              leftDisplay={`${profileA.wins}`}
              rightDisplay={`${profileB.wins}`}
            />
            <RecordRow
              label="Losses"
              leftValue={profileA.losses}
              rightValue={profileB.losses}
              leftDisplay={`${profileA.losses}`}
              rightDisplay={`${profileB.losses}`}
              higherIsBetter={false}
            />
            <RecordRow
              label="Win Rate"
              leftValue={profileA.winRate}
              rightValue={profileB.winRate}
              leftDisplay={`${profileA.winRate}%`}
              rightDisplay={`${profileB.winRate}%`}
            />
            {profileA.avgFinish !== null && profileB.avgFinish !== null ? (
              <RecordRow
                label="Avg Finish"
                leftValue={profileA.avgFinish}
                rightValue={profileB.avgFinish}
                leftDisplay={profileA.avgFinish.toFixed(1)}
                rightDisplay={profileB.avgFinish.toFixed(1)}
                higherIsBetter={false}
              />
            ) : (
              <View style={styles.csRow}>
                <Text style={styles.emptyNote}>
                  Avg Finish unlocks after a few races
                </Text>
              </View>
            )}
          </View>

          {/*
            Mock rows "Avg Time", "Best Streak" and the "Head-to-Head"
            rivalry block are omitted: per-marble race times, per-marble
            streaks and pairwise H2H records are not tracked in the store,
            so they would require fabricated data.
          */}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  spacer: { width: 40 },

  title: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha35,
    textAlign: 'center',
    marginBottom: 16,
  },

  sectionLabel: {
    fontFamily: Fonts.display,
    fontSize: 13,
    color: Colors.whiteAlpha50,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 8,
    marginTop: 6,
  },

  /* Selector cards */
  compareCards: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  compareCard: {
    flex: 1,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginBottom: 6,
  },
  arrowBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.whiteAlpha10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    color: Colors.white,
    lineHeight: 18,
  },
  ccName: {
    fontFamily: Fonts.display,
    fontSize: 16,
    color: Colors.white,
  },
  ccRecord: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.whiteAlpha35,
    marginBottom: 4,
  },

  hotBadge: {
    backgroundColor: 'rgba(231,76,60,0.2)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.pill,
    marginTop: 4,
  },
  hotText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.red,
    letterSpacing: 0.5,
  },
  coldBadge: {
    backgroundColor: 'rgba(52,152,219,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52,152,219,0.3)',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.pill,
    marginTop: 4,
  },
  coldText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: '#3498db',
    letterSpacing: 0.5,
  },

  /* Stat / record sections */
  statSection: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 10,
  },
  csRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  csValLeft: {
    width: 44,
    textAlign: 'right',
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
  },
  csValRight: {
    width: 44,
    textAlign: 'left',
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
  },
  csBarArea: {
    flex: 1,
    flexDirection: 'row',
    height: 8,
    gap: 2,
  },
  csBarLeft: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  csBarRight: { flex: 1 },
  csBarFill: { height: 8, borderRadius: 4 },
  csLabel: {
    width: 60,
    textAlign: 'center',
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.whiteAlpha35,
    textTransform: 'uppercase',
  },
  csLabelWide: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.whiteAlpha35,
    textTransform: 'uppercase',
  },
  csWinnerLeft: { color: Colors.red },
  csWinnerRight: { color: '#3498db' },
  csLoser: { color: Colors.whiteAlpha35 },

  emptyNote: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha35,
  },
});
