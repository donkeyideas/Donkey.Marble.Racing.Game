import React, { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, BorderRadius } from '../theme';
import { useGameStore, CoinTransaction } from '../state/gameStore';
import { getConfig } from '../lib/remoteConfig';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';

// The betting screen caps daily bets at 10 (hard-coded UI constant in
// app/betting.tsx — not in remote config). Mirror it here so the limit bar
// stays in sync with what the bet screen actually enforces.
const MAX_DAILY_BETS = 10;

const COLOR_EARNED = '#2ecc71';
const COLOR_SPENT = '#e74c3c';
const COLOR_PURCHASED = '#ffc220';
const COLOR_BLUE = '#3498db';
const COLOR_PURPLE = '#c084fc';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ── Activity feed helpers ───────────────────────────────────────────────────
function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return 'Just now';
  const mins = Math.floor(diff / (60 * 1000));
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(diff / (60 * 60 * 1000));
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(diff / DAY_MS);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const d = new Date(ts);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function txVisual(tx: CoinTransaction): { icon: string; color: string } {
  const positive = tx.amount >= 0;
  switch (tx.type) {
    case 'payout':      return { icon: 'W', color: COLOR_EARNED };
    case 'daily_bonus': return { icon: '+', color: COLOR_PURCHASED };
    case 'purchase':    return { icon: '$', color: COLOR_BLUE };
    case 'bet':         return positive
      ? { icon: 'W', color: COLOR_EARNED }
      : { icon: 'L', color: COLOR_SPENT };
    default:            return { icon: positive ? '+' : '-', color: positive ? COLOR_EARNED : COLOR_SPENT };
  }
}

export default function EconomyScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const coinHistory = useGameStore((s) => s.coinHistory);
  const betsToday = useGameStore((s) => s.betsToday);
  const lastBetDate = useGameStore((s) => s.lastBetDate);
  const dailyStreak = useGameStore((s) => s.dailyStreak);
  const storePurchasesToday = useGameStore((s) => s.storePurchasesToday);
  const storeCoinsPurchasedToday = useGameStore((s) => s.storeCoinsPurchasedToday);
  const storeLastPurchaseDate = useGameStore((s) => s.storeLastPurchaseDate);

  const today = new Date().toISOString().slice(0, 10);

  // ── Coin-flow aggregates from history ─────────────────────────────────────
  const {
    earned,
    spent,
    purchased,
    todayDelta,
    weekDelta,
  } = useMemo(() => {
    const dayStart = startOfToday();
    const weekStart = dayStart - 6 * DAY_MS;
    let earnedSum = 0;
    let spentSum = 0;
    let purchasedSum = 0;
    let todaySum = 0;
    let weekSum = 0;
    for (const tx of coinHistory) {
      if (tx.amount > 0 && (tx.type === 'payout' || tx.type === 'daily_bonus')) {
        earnedSum += tx.amount;
      }
      if (tx.amount < 0 && (tx.type === 'bet' || tx.type === 'purchase')) {
        spentSum += Math.abs(tx.amount);
      }
      if (tx.type === 'purchase' && tx.amount > 0) {
        purchasedSum += tx.amount;
      }
      if (tx.timestamp >= dayStart) todaySum += tx.amount;
      if (tx.timestamp >= weekStart) weekSum += tx.amount;
    }
    return {
      earned: earnedSum,
      spent: spentSum,
      purchased: purchasedSum,
      todayDelta: todaySum,
      weekDelta: weekSum,
    };
  }, [coinHistory]);

  // ── Daily limits ──────────────────────────────────────────────────────────
  const cfg = getConfig();
  const maxPurchases = cfg.maxDailyPurchases;
  const maxCoins = cfg.maxDailyCoins;

  const betsUsed = lastBetDate === today ? betsToday : 0;
  const purchasesUsed = storeLastPurchaseDate === today ? storePurchasesToday : 0;
  const coinsBoughtToday = storeLastPurchaseDate === today ? storeCoinsPurchasedToday : 0;

  const fmtDelta = (n: number) => `${n >= 0 ? '+' : ''}${n.toLocaleString()}`;

  // ── Recent activity (newest first) ────────────────────────────────────────
  const recent = useMemo(
    () => [...coinHistory].reverse().slice(0, 8),
    [coinHistory],
  );

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
            <CoinPill amount={coins} />
          </View>

          <Text style={styles.title}>ECONOMY DASHBOARD</Text>

          {/* Balance card */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>TOTAL BALANCE</Text>
            <Text style={styles.balanceVal}>{coins.toLocaleString()}</Text>
            <Text style={styles.balanceSub}>
              {fmtDelta(todayDelta)} today {'·'} {fmtDelta(weekDelta)} this week
            </Text>
          </View>

          {/* Breakdown */}
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownCard}>
              <Text style={[styles.breakdownIcon, { color: COLOR_EARNED }]}>+</Text>
              <Text style={[styles.breakdownVal, { color: COLOR_EARNED }]}>
                {earned.toLocaleString()}
              </Text>
              <Text style={styles.breakdownLabel}>EARNED</Text>
            </View>
            <View style={styles.breakdownCard}>
              <Text style={[styles.breakdownIcon, { color: COLOR_SPENT }]}>-</Text>
              <Text style={[styles.breakdownVal, { color: COLOR_SPENT }]}>
                {spent.toLocaleString()}
              </Text>
              <Text style={styles.breakdownLabel}>SPENT</Text>
            </View>
            <View style={styles.breakdownCard}>
              <Text style={[styles.breakdownIcon, { color: COLOR_PURCHASED }]}>$</Text>
              <Text style={[styles.breakdownVal, { color: COLOR_PURCHASED }]}>
                {purchased.toLocaleString()}
              </Text>
              <Text style={styles.breakdownLabel}>PURCHASED</Text>
            </View>
          </View>

          {/* Daily limits */}
          <Text style={styles.sectionTitle}>DAILY LIMITS</Text>
          <View style={styles.card}>
            <LimitRow
              name="Bets Used"
              used={betsUsed}
              max={MAX_DAILY_BETS}
              color={COLOR_PURCHASED}
            />
            <LimitRow
              name="Purchase Transactions"
              used={purchasesUsed}
              max={maxPurchases}
              color={COLOR_PURPLE}
            />
            <LimitRow
              name="Coins Purchasable"
              used={coinsBoughtToday}
              max={maxCoins}
              color={COLOR_BLUE}
              last
            />
          </View>

          {/* Daily login streak */}
          <Text style={styles.sectionTitle}>DAILY LOGIN STREAK</Text>
          <View style={styles.card}>
            <View style={styles.streakHeader}>
              <Text style={styles.streakDay}>Day {dailyStreak}</Text>
              <Text style={styles.streakSub}>
                {dailyStreak} day{dailyStreak === 1 ? '' : 's'} in a row
              </Text>
            </View>
            <StreakStrip streak={dailyStreak} />
          </View>

          {/* Recent activity */}
          <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
          {recent.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                No coin activity yet. Race, claim daily bonuses, or visit the
                store to populate this feed.
              </Text>
            </View>
          ) : (
            <View style={styles.feedCard}>
              {recent.map((tx, i) => {
                const v = txVisual(tx);
                const positive = tx.amount >= 0;
                return (
                  <View
                    key={`${tx.timestamp}-${i}`}
                    style={[
                      styles.feedRow,
                      i < recent.length - 1 && styles.feedRowBorder,
                    ]}
                  >
                    <View style={[styles.feedIcon, { backgroundColor: v.color + '26' }]}>
                      <Text style={[styles.feedIconText, { color: v.color }]}>
                        {v.icon}
                      </Text>
                    </View>
                    <View style={styles.feedInfo}>
                      <Text style={styles.feedTitle} numberOfLines={1}>
                        {tx.description}
                      </Text>
                      <Text style={styles.feedTime}>{relativeTime(tx.timestamp)}</Text>
                    </View>
                    <Text
                      style={[
                        styles.feedAmount,
                        { color: positive ? COLOR_EARNED : COLOR_SPENT },
                      ]}
                    >
                      {positive ? '+' : ''}{tx.amount.toLocaleString()}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function LimitRow({
  name,
  used,
  max,
  color,
  last,
}: {
  name: string;
  used: number;
  max: number;
  color: string;
  last?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <View style={[styles.limitRow, !last && styles.limitRowBorder]}>
      <View style={styles.limitLeft}>
        <Text style={styles.limitName}>{name}</Text>
        <View style={styles.limitBarTrack}>
          <View
            style={[styles.limitBarFill, { width: `${pct}%`, backgroundColor: color }]}
          />
        </View>
      </View>
      <Text style={styles.limitVal}>
        {used.toLocaleString()} / {max.toLocaleString()}
      </Text>
    </View>
  );
}

function StreakStrip({ streak }: { streak: number }) {
  // dailyRewards length defines the reward cycle (7-day rotation).
  const cycle = getConfig().dailyRewards.length || 7;
  // Position within the current cycle: day 1 -> index 0, day 7 -> index 6,
  // day 8 -> index 0 again.
  const filled = streak <= 0 ? 0 : ((streak - 1) % cycle) + 1;
  return (
    <View style={styles.streakStrip}>
      {Array.from({ length: cycle }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.streakSeg,
            { backgroundColor: i < filled ? COLOR_EARNED : Colors.whiteAlpha10 },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },

  title: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 16,
  },

  sectionTitle: {
    fontFamily: Fonts.display,
    fontSize: 13,
    color: Colors.whiteAlpha50,
    letterSpacing: 2,
    marginBottom: 10,
    marginTop: 12,
  },

  /* Balance card */
  balanceCard: {
    backgroundColor: 'rgba(255,194,32,0.10)',
    borderWidth: 2,
    borderColor: 'rgba(255,194,32,0.25)',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    marginBottom: 18,
  },
  balanceLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.whiteAlpha50,
    letterSpacing: 2,
  },
  balanceVal: {
    fontFamily: Fonts.display,
    fontSize: 42,
    color: Colors.yellow,
    lineHeight: 46,
  },
  balanceSub: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha35,
    marginTop: 4,
  },

  /* Breakdown */
  breakdownRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  breakdownCard: {
    flex: 1,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  breakdownIcon: { fontFamily: Fonts.display, fontSize: 18, marginBottom: 2 },
  breakdownVal: { fontFamily: Fonts.display, fontSize: 16 },
  breakdownLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 9,
    color: Colors.whiteAlpha35,
    letterSpacing: 0.5,
    marginTop: 2,
  },

  /* Generic card */
  card: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 4,
  },

  /* Limit rows */
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
  },
  limitRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  limitLeft: { flex: 1, marginRight: 12 },
  limitName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
    marginBottom: 5,
  },
  limitBarTrack: {
    width: 130,
    height: 6,
    backgroundColor: Colors.whiteAlpha07,
    borderRadius: 3,
    overflow: 'hidden',
  },
  limitBarFill: { height: 6, borderRadius: 3 },
  limitVal: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.whiteAlpha50,
  },

  /* Streak */
  streakHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  streakDay: { fontFamily: Fonts.display, fontSize: 22, color: Colors.yellow },
  streakSub: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.whiteAlpha40,
  },
  streakStrip: { flexDirection: 'row', gap: 4, marginTop: 10 },
  streakSeg: { flex: 1, height: 5, borderRadius: 2.5 },

  /* Activity feed */
  feedCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 4,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  feedRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  feedIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedIconText: { fontFamily: Fonts.display, fontSize: 14 },
  feedInfo: { flex: 1, minWidth: 0 },
  feedTitle: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.white },
  feedTime: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.whiteAlpha35,
    marginTop: 2,
  },
  feedAmount: { fontFamily: Fonts.bodyBold, fontSize: 14 },

  /* Empty */
  emptyCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 16,
    marginBottom: 4,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    textAlign: 'center',
    lineHeight: 17,
  },
});
