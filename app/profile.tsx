import React, { useState, useMemo } from 'react';
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
import { getXpPerLevel, getConfig } from '../lib/remoteConfig';

// The betting screen caps daily bets at 10 (hard-coded UI constant in
// app/betting.tsx). Mirror it here so the limit bar stays in sync.
const MAX_DAILY_BETS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ── Daily-limit progress row ────────────────────────────────────────────────
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

// ── Daily login-streak strip ────────────────────────────────────────────────
function StreakStrip({ streak }: { streak: number }) {
  const cycle = getConfig().dailyRewards.length || 7;
  const filled = streak <= 0 ? 0 : ((streak - 1) % cycle) + 1;
  return (
    <View style={styles.streakStrip}>
      {Array.from({ length: cycle }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.streakSeg,
            { backgroundColor: i < filled ? '#2ecc71' : Colors.whiteAlpha10 },
          ]}
        />
      ))}
    </View>
  );
}

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

// ── Coin / Race history with pagination ────────────────────────────────────
interface CoinTx {
  type: 'bet' | 'payout' | 'daily_bonus' | 'purchase';
  amount: number;
  description: string;
  timestamp: number;
}

const PAGE_SIZE = 10;

function formatHistoryTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function typeLabel(type: CoinTx['type']): { label: string; color: string } {
  switch (type) {
    case 'payout':       return { label: 'WIN',     color: '#2ecc71' };
    case 'bet':          return { label: 'ENTRY',   color: '#e74c3c' };
    case 'daily_bonus':  return { label: 'BONUS',   color: '#ffc220' };
    case 'purchase':     return { label: 'STORE',   color: '#3498db' };
  }
}

function CoinHistorySection({ coinHistory }: { coinHistory: CoinTx[] }) {
  const [page, setPage] = useState(0);
  // Show newest first. The store appends to the end, so reverse for display.
  const ordered = useMemo(() => [...coinHistory].reverse(), [coinHistory]);
  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const pageItems = ordered.slice(start, start + PAGE_SIZE);

  if (ordered.length === 0) {
    return (
      <>
        <Text style={styles.sectionHeader}>COIN HISTORY</Text>
        <View style={styles.historyEmpty}>
          <Text style={styles.historyEmptyText}>
            No coin transactions yet. Race, claim daily bonuses, or visit the store to populate this list.
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Text style={styles.sectionHeader}>
        COIN HISTORY <Text style={styles.historyCount}>· {ordered.length}</Text>
      </Text>
      <View style={styles.historyCard}>
        {pageItems.map((tx, i) => {
          const t = typeLabel(tx.type);
          const isPositive = tx.amount > 0;
          return (
            <View
              key={`${tx.timestamp}-${i}`}
              style={[styles.historyRow, i < pageItems.length - 1 && styles.historyRowBorder]}
            >
              <View style={[styles.historyChip, { backgroundColor: t.color + '22' }]}>
                <Text style={[styles.historyChipText, { color: t.color }]}>{t.label}</Text>
              </View>
              <View style={styles.historyMid}>
                <Text style={styles.historyDesc} numberOfLines={1}>{tx.description}</Text>
                <Text style={styles.historyTime}>{formatHistoryTime(tx.timestamp)}</Text>
              </View>
              <Text style={[styles.historyAmount, { color: isPositive ? '#2ecc71' : '#e74c3c' }]}>
                {isPositive ? '+' : ''}{tx.amount.toLocaleString()}
              </Text>
            </View>
          );
        })}
      </View>

      {totalPages > 1 && (
        <View style={styles.paginationRow}>
          <Pressable
            onPress={() => setPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            style={[styles.pageBtn, safePage === 0 && styles.pageBtnDisabled]}
          >
            <Text style={styles.pageBtnText}>{'‹ Prev'}</Text>
          </Pressable>
          <Text style={styles.pageIndicator}>
            Page {safePage + 1} of {totalPages}
          </Text>
          <Pressable
            onPress={() => setPage(Math.min(totalPages - 1, safePage + 1))}
            disabled={safePage === totalPages - 1}
            style={[styles.pageBtn, safePage === totalPages - 1 && styles.pageBtnDisabled]}
          >
            <Text style={styles.pageBtnText}>{'Next ›'}</Text>
          </Pressable>
        </View>
      )}
    </>
  );
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
  const firebaseDisplayName = useGameStore((s) => s.firebaseDisplayName);
  const firebaseEmail = useGameStore((s) => s.firebaseEmail);
  const firebaseUid = useGameStore((s) => s.firebaseUid);
  const currentStreak = useGameStore((s) => s.currentStreak);
  const bestStreak = useGameStore((s) => s.bestStreak);
  const coinHistory = useGameStore((s) => s.coinHistory);
  const season = useGameStore((s) => s.season);
  const tournaments = useGameStore((s) => s.tournaments);
  const betsToday = useGameStore((s) => s.betsToday);
  const lastBetDate = useGameStore((s) => s.lastBetDate);
  const dailyStreak = useGameStore((s) => s.dailyStreak);
  const storePurchasesToday = useGameStore((s) => s.storePurchasesToday);
  const storeCoinsPurchasedToday = useGameStore((s) => s.storeCoinsPurchasedToday);
  const storeLastPurchaseDate = useGameStore((s) => s.storeLastPurchaseDate);

  const winRate = totalRaces > 0 ? Math.round((totalWins / totalRaces) * 100) : 0;

  // Aggregate coin-flow stats from history (capped at 50 entries in store)
  const coinsEarned = coinHistory
    .filter((t) => t.type === 'payout' || t.type === 'daily_bonus')
    .reduce((sum, t) => sum + Math.max(0, t.amount), 0);
  const coinsSpent = coinHistory
    .filter((t) => t.type === 'bet' || t.type === 'purchase')
    .reduce((sum, t) => sum + Math.abs(Math.min(0, t.amount)), 0);
  const coinsPurchased = coinHistory
    .filter((t) => t.type === 'purchase' && t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0);

  // Today / week coin deltas from history timestamps
  const { todayDelta, weekDelta } = useMemo(() => {
    const dayStart = startOfToday();
    const weekStart = dayStart - 6 * DAY_MS;
    let todaySum = 0;
    let weekSum = 0;
    for (const tx of coinHistory) {
      if (tx.timestamp >= dayStart) todaySum += tx.amount;
      if (tx.timestamp >= weekStart) weekSum += tx.amount;
    }
    return { todayDelta: todaySum, weekDelta: weekSum };
  }, [coinHistory]);
  const fmtDelta = (n: number) => `${n >= 0 ? '+' : ''}${n.toLocaleString()}`;

  // Daily-limit usage (reset when the stored date is not today)
  const todayStr = new Date().toISOString().slice(0, 10);
  const cfg = getConfig();
  const betsUsed = lastBetDate === todayStr ? betsToday : 0;
  const purchasesUsed = storeLastPurchaseDate === todayStr ? storePurchasesToday : 0;
  const coinsBoughtToday = storeLastPurchaseDate === todayStr ? storeCoinsPurchasedToday : 0;

  // Most-bet vs highest-win-rate marble (separate metrics — both interesting)
  let mostBetId = '', mostBetCount = 0;
  let bestWinRateId = '', bestWinRate = 0, bestWinRateCount = 0;
  for (const [id, stats] of Object.entries(marbleStats)) {
    if (stats.betCount > mostBetCount) { mostBetCount = stats.betCount; mostBetId = id; }
    const rate = stats.betCount >= 3 ? stats.wins / stats.betCount : 0;
    if (rate > bestWinRate) {
      bestWinRate = rate;
      bestWinRateId = id;
      bestWinRateCount = stats.betCount;
    }
  }
  const mostBetMarble = mostBetId ? MARBLES.find((m) => m.id === mostBetId) : null;
  const bestRateMarble = bestWinRateId ? MARBLES.find((m) => m.id === bestWinRateId) : null;

  const league = getLeague(passLevel);
  const currentXP = passXp;
  const nextTierXP = getXpPerLevel();
  const progressPercent = (currentXP / nextTierXP) * 100;
  const favorite = getFavoriteMarble(marbleStats);

  const tournamentEarnings = tournaments?.totalEarned ?? 0;
  const seasonChampionships = season?.seasonHistory?.length ?? 0;

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
              {firebaseUid && (
                <Text style={styles.connectedText}>
                  {'\u2713'} {firebaseEmail || firebaseDisplayName || 'Connected'}
                </Text>
              )}
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

          {/* ===== STREAK + ECONOMY ===== */}
          <Text style={styles.sectionHeader}>STREAK & ECONOMY</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{currentStreak}</Text>
              <Text style={styles.statLabel}>STREAK</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{bestStreak}</Text>
              <Text style={styles.statLabel}>BEST</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{(coinsEarned - coinsSpent).toLocaleString()}</Text>
              <Text style={styles.statLabel}>NET</Text>
            </View>
          </View>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { flex: 1 }]}>
              <Text style={[styles.statValue, { color: '#2ecc71' }]}>+{coinsEarned.toLocaleString()}</Text>
              <Text style={styles.statLabel}>EARNED</Text>
            </View>
            <View style={[styles.statCard, { flex: 1 }]}>
              <Text style={[styles.statValue, { color: '#e74c3c' }]}>-{coinsSpent.toLocaleString()}</Text>
              <Text style={styles.statLabel}>SPENT</Text>
            </View>
            <View style={[styles.statCard, { flex: 1 }]}>
              <Text style={[styles.statValue, { color: '#ffc220' }]}>{coinsPurchased.toLocaleString()}</Text>
              <Text style={styles.statLabel}>PURCHASED</Text>
            </View>
          </View>

          {/* Balance trend */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>BALANCE TREND</Text>
            <Text style={styles.balanceVal}>{coins.toLocaleString()}</Text>
            <Text style={styles.balanceSub}>
              {fmtDelta(todayDelta)} today {'·'} {fmtDelta(weekDelta)} this week
            </Text>
          </View>

          {/* ===== DAILY LIMITS ===== */}
          <Text style={styles.sectionHeader}>DAILY LIMITS</Text>
          <View style={styles.sectionCard}>
            <LimitRow
              name="Bets Used"
              used={betsUsed}
              max={MAX_DAILY_BETS}
              color="#ffc220"
            />
            <LimitRow
              name="Purchase Transactions"
              used={purchasesUsed}
              max={cfg.maxDailyPurchases}
              color="#c084fc"
            />
            <LimitRow
              name="Coins Purchasable"
              used={coinsBoughtToday}
              max={cfg.maxDailyCoins}
              color="#3498db"
              last
            />
          </View>

          {/* ===== DAILY LOGIN STREAK ===== */}
          <Text style={styles.sectionHeader}>DAILY LOGIN STREAK</Text>
          <View style={styles.sectionCard}>
            <View style={styles.streakLoginHeader}>
              <Text style={styles.streakLoginDay}>Day {dailyStreak}</Text>
              <Text style={styles.streakLoginSub}>
                {dailyStreak} day{dailyStreak === 1 ? '' : 's'} in a row
              </Text>
            </View>
            <StreakStrip streak={dailyStreak} />
          </View>

          {/* ===== CAREER ACHIEVEMENTS ===== */}
          <Text style={styles.sectionHeader}>CAREER</Text>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { flex: 1 }]}>
              <Text style={styles.statValue}>{seasonChampionships}</Text>
              <Text style={styles.statLabel}>SEASON TITLES</Text>
            </View>
            <View style={[styles.statCard, { flex: 1 }]}>
              <Text style={styles.statValue}>{tournamentEarnings.toLocaleString()}</Text>
              <Text style={styles.statLabel}>TOURNEY $</Text>
            </View>
          </View>

          {/* ===== COIN HISTORY ===== */}
          <CoinHistorySection coinHistory={coinHistory} />

          {/* ===== MARBLE INTEL ===== */}
          {bestRateMarble && bestWinRateCount >= 3 && bestWinRateId !== mostBetId && (
            <>
              <Text style={styles.sectionHeader}>HOT PICK</Text>
              <View style={styles.favoriteCard}>
                <MarbleDot marble={bestRateMarble} size={40} />
                <View style={styles.favoriteInfo}>
                  <Text style={styles.favoriteLabel}>HIGHEST WIN RATE</Text>
                  <Text style={styles.favoriteName}>{bestRateMarble.name}</Text>
                  <Text style={styles.favoriteStat}>
                    {Math.round(bestWinRate * 100)}% over {bestWinRateCount} bets
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* ===== INVITE FRIENDS ===== */}
          <Text style={styles.sectionHeader}>GROW YOUR CIRCLE</Text>
          <Pressable
            style={({ pressed }) => [styles.inviteCard, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/invite-friends')}
          >
            <View style={styles.inviteIcon}>
              <Text style={styles.inviteIconText}>+</Text>
            </View>
            <View style={styles.inviteInfo}>
              <Text style={styles.inviteTitle}>INVITE FRIENDS</Text>
              <Text style={styles.inviteSub}>
                Earn +500 coins for every friend who races
              </Text>
            </View>
            <Text style={styles.inviteArrow}>{'›'}</Text>
          </Pressable>

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

  sectionHeader: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 20,
    marginBottom: 10,
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
  connectedText: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: '#2ecc71',
    marginTop: 3,
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

  /* ===== COIN HISTORY ===== */
  historyCount: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha40,
  },
  historyCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 16,
    paddingVertical: 4,
    marginBottom: 12,
  },
  historyEmpty: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  historyEmptyText: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    textAlign: 'center',
    lineHeight: 17,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    gap: 10,
  },
  historyRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  historyChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 50,
    alignItems: 'center',
  },
  historyChipText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  historyMid: {
    flex: 1,
    minWidth: 0,
  },
  historyDesc: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.white,
  },
  historyTime: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.whiteAlpha40,
    marginTop: 2,
  },
  historyAmount: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    minWidth: 60,
    textAlign: 'right',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  pageBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pageBtnDisabled: {
    opacity: 0.35,
  },
  pageBtnText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.white,
    letterSpacing: 0.5,
  },
  pageIndicator: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: Colors.whiteAlpha50,
    letterSpacing: 0.5,
  },

  /* ===== BALANCE TREND ===== */
  balanceVal: {
    fontFamily: Fonts.display,
    fontSize: 34,
    color: Colors.yellow,
    lineHeight: 38,
  },
  balanceSub: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha35,
    marginTop: 2,
  },

  /* ===== DAILY LIMITS ===== */
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

  /* ===== DAILY LOGIN STREAK ===== */
  streakLoginHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  streakLoginDay: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.yellow,
  },
  streakLoginSub: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.whiteAlpha40,
  },
  streakStrip: { flexDirection: 'row', gap: 4, marginTop: 10 },
  streakSeg: { flex: 1, height: 5, borderRadius: 2.5 },

  /* ===== INVITE FRIENDS ===== */
  inviteCard: {
    backgroundColor: 'rgba(255,194,32,0.10)',
    borderWidth: 2,
    borderColor: 'rgba(255,194,32,0.25)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  inviteIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteIconText: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.ink,
    lineHeight: 32,
  },
  inviteInfo: {
    flex: 1,
    marginLeft: 14,
  },
  inviteTitle: {
    fontFamily: Fonts.display,
    fontSize: 17,
    color: Colors.white,
    letterSpacing: 0.5,
  },
  inviteSub: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    marginTop: 2,
  },
  inviteArrow: {
    fontFamily: Fonts.display,
    fontSize: 24,
    color: Colors.whiteAlpha40,
    marginLeft: 8,
  },

  /* ===== ACTIONS ===== */
  actions: {
    gap: 10,
    marginTop: 10,
  },
});
