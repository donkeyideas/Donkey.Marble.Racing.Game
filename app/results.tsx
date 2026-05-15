import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors, Fonts, MarbleData } from '../theme';
import { useGameStore, GameMode, SeasonMarbleStats } from '../state/gameStore';
import MarbleDot from '../components/MarbleDot';
import CoinPill from '../components/CoinPill';
import { ALL_COURSES as COURSES } from '../data/courses';

const THEME_STAT_MAP: Record<string, keyof SeasonMarbleStats> = {
  meadow: 'speed', volcano: 'power', frozen: 'bounce', cyber: 'luck',
};
const STAT_LABELS: Record<keyof SeasonMarbleStats, string> = {
  speed: 'SPD', power: 'PWR', bounce: 'BNC', luck: 'LCK',
};
const STAT_COLORS: Record<keyof SeasonMarbleStats, string> = {
  speed: '#4dabf7', power: '#ff6b6b', bounce: '#69db7c', luck: '#da77f2',
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CONFETTI_COLORS = ['#ff6b6b', '#4dabf7', '#69db7c', '#ffd43b', '#da77f2', '#ff922b', '#ffffff'];
const CONFETTI_COUNT = 24;

// ── Confetti piece ──────────────────────────────────────────────────────────
function ConfettiPiece({ index }: { index: number }) {
  const fallAnim = useRef(new Animated.Value(-30)).current;
  const swayAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const left = Math.random() * SCREEN_WIDTH;
  const size = 6 + Math.random() * 10;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  const delay = Math.random() * 1200;
  const duration = 2500 + Math.random() * 1500;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fallAnim, {
        toValue: SCREEN_HEIGHT + 40,
        duration,
        delay,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(swayAnim, {
            toValue: 20,
            duration: 400 + Math.random() * 300,
            useNativeDriver: true,
          }),
          Animated.timing(swayAnim, {
            toValue: -20,
            duration: 400 + Math.random() * 300,
            useNativeDriver: true,
          }),
        ])
      ),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration,
        delay: delay + duration * 0.6,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          left,
          width: size,
          height: size * 0.6,
          backgroundColor: color,
          borderRadius: 2,
          transform: [
            { translateY: fallAnim },
            { translateX: swayAnim },
            { rotate: `${Math.random() * 360}deg` },
          ],
          opacity: opacityAnim,
        },
      ]}
    />
  );
}

// ── Finish row ──────────────────────────────────────────────────────────────
function FinishRow({
  position,
  marble,
  odds,
  isWinner,
  isPlayerPick,
  variant,
}: {
  position: number;
  marble: MarbleData;
  odds: number;
  isWinner: boolean;
  isPlayerPick: boolean;
  variant: 'win' | 'loss';
}) {
  const isWinVariant = variant === 'win';

  const rowHighlight =
    isWinVariant && isWinner
      ? styles.finishRowWinnerWin
      : !isWinVariant && isWinner
      ? styles.finishRowWinnerLoss
      : !isWinVariant && isPlayerPick && !isWinner
      ? styles.finishRowPickLoss
      : undefined;

  const tag = isPlayerPick && isWinner
    ? 'YOUR PICK \u00B7 WINNER'
    : isPlayerPick
      ? 'YOUR PICK'
      : null;

  return (
    <View style={[styles.finishRow, rowHighlight]}>
      <View style={styles.finishRowTop}>
        <Text
          style={[
            styles.finishPosition,
            isWinVariant ? styles.finishPositionWin : styles.finishPositionLoss,
          ]}
        >
          {position}
        </Text>

        <MarbleDot marble={marble} size={24} />

        <Text
          style={[
            styles.finishName,
            isWinVariant ? styles.finishNameWin : styles.finishNameLoss,
          ]}
          numberOfLines={1}
        >
          {marble.name}
        </Text>

        <Text
          style={[
            styles.finishOdds,
            isWinVariant ? styles.finishOddsWin : styles.finishOddsLoss,
          ]}
        >
          {odds.toFixed(1)}x
        </Text>
      </View>

      {tag && (
        <View style={styles.finishTagRow}>
          <View style={[styles.finishTag, !isWinVariant && !isWinner && styles.finishTagLoss]}>
            <Text style={[styles.finishTagText, !isWinVariant && !isWinner && styles.finishTagTextLoss]}>
              {tag}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Stat Growth Card ────────────────────────────────────────────────────────
function StatGrowthCard({ variant }: { variant: 'win' | 'loss' }) {
  const season = useGameStore((s) => s.season);
  const selectedCourseId = useGameStore((s) => s.selectedCourseId);
  const activeMode = useGameStore((s) => s.activeMode);

  if (!season || season.seasonMode !== 'franchise' || !season.seasonMarbleId) return null;
  if (activeMode.type !== 'season' && activeMode.type !== 'playoff') return null;

  const stats = season.seasonStats?.[season.seasonMarbleId];
  if (!stats) return null;

  const course = COURSES.find((c) => c.id === selectedCourseId);
  const primaryStat = course ? THEME_STAT_MAP[course.theme] ?? null : null;
  const isWin = variant === 'win';

  const statKeys: (keyof SeasonMarbleStats)[] = ['speed', 'power', 'bounce', 'luck'];

  return (
    <View style={[isWin ? styles.winCard : styles.lossCard, { marginBottom: 16 }]}>
      <Text style={isWin ? styles.winCardTitle : styles.lossCardTitle}>STAT GROWTH</Text>
      {statKeys.map((key) => {
        const val = stats[key];
        const pct = Math.min((val / 3.0) * 100, 100);
        const isPrimary = key === primaryStat;
        return (
          <View key={key} style={styles.statGrowthRow}>
            <Text style={[styles.statGrowthLabel, isWin ? { color: Colors.ink } : { color: Colors.white }]}>
              {STAT_LABELS[key]}
            </Text>
            <View style={styles.statGrowthTrack}>
              <View style={[styles.statGrowthFill, { width: `${Math.max(2, pct)}%`, backgroundColor: STAT_COLORS[key] }]} />
            </View>
            <Text style={[styles.statGrowthValue, isWin ? { color: Colors.ink } : { color: Colors.white }]}>
              +{val.toFixed(1)}
            </Text>
            {isPrimary && (
              <View style={[styles.statGrowthBoosted, { backgroundColor: STAT_COLORS[key] + '30' }]}>
                <Text style={[styles.statGrowthBoostedText, { color: STAT_COLORS[key] }]}>BOOSTED</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Win Screen ──────────────────────────────────────────────────────────────
function getModeDest(mode: GameMode): { primary: string; primaryLabel: string; secondary?: string; secondaryLabel?: string } {
  switch (mode.type) {
    case 'quick_race':
      return { primary: '/courses', primaryLabel: 'RACE AGAIN', secondary: '/lobby', secondaryLabel: 'BACK TO LOBBY' };
    case 'season':
      return { primary: '/season', primaryLabel: 'BACK TO SEASON', secondary: '/lobby', secondaryLabel: 'BACK TO LOBBY' };
    case 'national_race':
      return { primary: '/national-races', primaryLabel: 'BACK TO EVENTS', secondary: '/lobby', secondaryLabel: 'BACK TO LOBBY' };
    case 'tournament':
      return { primary: '/tournament-bracket', primaryLabel: 'VIEW BRACKET', secondary: '/lobby', secondaryLabel: 'BACK TO LOBBY' };
    case 'playoff':
      return { primary: '/playoffs', primaryLabel: 'BACK TO PLAYOFFS', secondary: '/lobby', secondaryLabel: 'BACK TO LOBBY' };
    case 'bet':
    default:
      return { primary: '/lobby', primaryLabel: 'NEXT RACE' };
  }
}

function WinScreen() {
  const router = useRouter();
  const lastResult = useGameStore((s) => s.lastResult)!;
  const coins = useGameStore((s) => s.coins);
  const resetBet = useGameStore((s) => s.resetBet);
  const activeMode = useGameStore((s) => s.activeMode);
  const odds = useGameStore((s) => s.getOdds());
  const season = useGameStore((s) => s.season);

  const tournaments = useGameStore((s) => s.tournaments);

  const dest = getModeDest(activeMode);
  const isQuickRace = activeMode.type === 'quick_race';
  const isTournament = activeMode.type === 'tournament';
  const isTournamentChampion = isTournament && tournaments?.currentRound !== undefined && tournaments.currentRound >= 7;
  const isFranchise = season?.seasonMode === 'franchise' && (activeMode.type === 'season' || activeMode.type === 'playoff');

  // Get the payout for the round that just completed
  const tournamentRoundPayout = isTournament && tournaments
    ? tournaments.roundPayouts?.[tournaments.currentRound - 1] || 0
    : 0;
  const tournamentTotalEarned = isTournament && tournaments ? (tournaments.totalEarned || 0) : 0;

  const handlePrimary = () => {
    resetBet();
    router.replace(dest.primary as any);
  };

  const handleSecondary = () => {
    resetBet();
    router.replace(dest.secondary as any || '/lobby');
  };

  const topFinishers = lastResult.positions.slice(0, 4);

  return (
    <LinearGradient colors={['#ffd84d', '#ffc220', '#ff9a1a']} style={styles.fill}>
      {/* Confetti */}
      <View style={styles.confettiContainer} pointerEvents="none">
        {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
          <ConfettiPiece key={i} index={i} />
        ))}
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title — placement-aware */}
        <Text style={styles.winTitle}>
          {isTournament
            ? isTournamentChampion ? 'CHAMPION!' : 'SURVIVED!'
            : isQuickRace
              ? 'RACE COMPLETE!'
              : isFranchise
                ? lastResult.playerPlacement === 1
                  ? 'YOUR MARBLE WON!'
                  : 'PODIUM FINISH!'
                : lastResult.playerPlacement === 1
                  ? 'YOU WON!'
                  : lastResult.playerPlacement === 2
                    ? 'SO CLOSE!'
                    : 'TOP 3!'}
        </Text>

        {/* Payout — show net profit (payout minus original bet) */}
        {isTournament && (
          <>
            {tournamentRoundPayout > 0 && (
              <Text style={styles.winPayout}>+{tournamentRoundPayout.toLocaleString()}</Text>
            )}
            <Text style={styles.winCoinsLabel}>
              {isTournamentChampion
                ? `Tournament champion! Total earned: ${tournamentTotalEarned.toLocaleString()} coins`
                : tournamentRoundPayout > 0
                  ? `Round ${tournaments?.currentRound ?? ''} survived · Total earned: ${tournamentTotalEarned.toLocaleString()}`
                  : `Survived! ${7 - (tournaments?.currentRound ?? 0)} rounds to go · Payouts start at Round 4`}
            </Text>
          </>
        )}
        {!isQuickRace && !isTournament && lastResult.payout > 0 && (
          <>
            <Text style={styles.winPayout}>
              +{lastResult.payout - lastResult.betAmount}
            </Text>
            <Text style={styles.winCoinsLabel}>
              {lastResult.playerPlacement === 1
                ? `${lastResult.betAmount} bet returned + ${lastResult.payout - lastResult.betAmount} winnings`
                : `${lastResult.betAmount} bet returned + ${lastResult.payout - lastResult.betAmount} bonus`}
            </Text>
          </>
        )}
        {isQuickRace && (
          <Text style={styles.winCoinsLabel}>Your marble finished 1st!</Text>
        )}

        {/* Balance pill */}
        {!isQuickRace && (
          <View style={styles.pillCenter}>
            <CoinPill amount={coins} dark />
          </View>
        )}

        {/* Results card */}
        <View style={styles.winCard}>
          <Text style={styles.winCardTitle}>FINISH ORDER</Text>

          {topFinishers.map((entry, index) => {
            const isPlayerPick = lastResult.playerPick?.id === entry.marble.id;
            const isWinner = index === 0;
            return (
              <FinishRow
                key={entry.marble.id}
                position={index + 1}
                marble={entry.marble}
                odds={odds[entry.marble.id] ?? 2.0}
                isWinner={isWinner}
                isPlayerPick={isPlayerPick}
                variant="win"
              />
            );
          })}
        </View>

        {/* Stat growth card for franchise mode */}
        <StatGrowthCard variant="win" />

        {/* Actions */}
        <View style={styles.actions}>
          {/* Primary action */}
          <Pressable
            onPress={handlePrimary}
            style={({ pressed }) => [
              styles.shareBtn,
              pressed && styles.pressed,
            ]}
          >
            <LinearGradient
              colors={[Colors.blue, Colors.blueDark]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.shareBtnGradient}
            >
              <Text style={styles.shareBtnText}>{dest.primaryLabel}</Text>
            </LinearGradient>
          </Pressable>

          {/* Secondary action */}
          {dest.secondary && (
            <Pressable
              onPress={handleSecondary}
              style={({ pressed }) => [
                styles.ghostBtnWin,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.ghostBtnWinText}>{dest.secondaryLabel}</Text>
            </Pressable>
          )}

          <Text style={styles.breakTextWin}>Take a break?</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

// ── Loss Screen ─────────────────────────────────────────────────────────────
function LossScreen() {
  const router = useRouter();
  const lastResult = useGameStore((s) => s.lastResult)!;
  const coins = useGameStore((s) => s.coins);
  const resetBet = useGameStore((s) => s.resetBet);
  const activeMode = useGameStore((s) => s.activeMode);
  const odds = useGameStore((s) => s.getOdds());
  const season = useGameStore((s) => s.season);

  const tournaments = useGameStore((s) => s.tournaments);

  const dest = getModeDest(activeMode);
  const isQuickRace = activeMode.type === 'quick_race';
  const isTournament = activeMode.type === 'tournament';
  const isFranchise = season?.seasonMode === 'franchise' && (activeMode.type === 'season' || activeMode.type === 'playoff');

  const tournamentTotalEarned = isTournament && tournaments ? (tournaments.totalEarned || 0) : 0;
  const tournamentEntryFee = isTournament && tournaments ? tournaments.entryFee : 0;
  const tournamentNet = tournamentTotalEarned - tournamentEntryFee;

  const handlePrimary = () => {
    resetBet();
    router.replace(dest.primary as any);
  };

  const handleSecondary = () => {
    resetBet();
    router.replace(dest.secondary as any || '/lobby');
  };

  const topFinishers = lastResult.positions.slice(0, 4);

  return (
    <LinearGradient colors={['#1d56d4', '#0a3a96', '#0a1a3a']} style={styles.fill}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Title — show placement context */}
        <Text style={styles.lossTitle}>
          {isTournament
            ? 'ELIMINATED!'
            : isQuickRace
              ? 'RACE COMPLETE!'
              : isFranchise
                ? `FINISHED #${lastResult.playerPlacement}`
                : 'BETTER LUCK!'}
        </Text>
        <Text style={styles.lossPlacement}>
          {isTournament
            ? tournamentTotalEarned > 0
              ? `Eliminated in round ${tournaments?.currentRound ?? ''}. Earned ${tournamentTotalEarned.toLocaleString()} coins (net: ${tournamentNet >= 0 ? '+' : ''}${tournamentNet.toLocaleString()})`
              : `Your marble finished last. Entry fee of ${tournamentEntryFee.toLocaleString()} lost.`
            : isQuickRace
              ? `Winner: ${lastResult.positions[0]?.marble.name || 'Unknown'}`
              : isFranchise
                ? `${lastResult.playerPick?.name ?? 'Your marble'} finished #${lastResult.playerPlacement} of ${lastResult.positions.length}`
                : `Your marble finished #${lastResult.playerPlacement} of ${lastResult.positions.length}`}
        </Text>

        {/* Net result — 4th+ always loses the full bet */}
        {!isQuickRace && !isTournament && (
          <Text style={styles.lossAmount}>-{lastResult.betAmount}</Text>
        )}

        {/* Balance pill */}
        {!isQuickRace && (
          <View style={styles.pillCenter}>
            <CoinPill amount={coins} />
          </View>
        )}

        {/* Results card */}
        <View style={styles.lossCard}>
          <Text style={styles.lossCardTitle}>FINISH ORDER</Text>

          {topFinishers.map((entry, index) => {
            const isPlayerPick = lastResult.playerPick?.id === entry.marble.id;
            const isWinner = index === 0;
            return (
              <FinishRow
                key={entry.marble.id}
                position={index + 1}
                marble={entry.marble}
                odds={odds[entry.marble.id] ?? 2.0}
                isWinner={isWinner}
                isPlayerPick={isPlayerPick}
                variant="loss"
              />
            );
          })}
        </View>

        {/* Stat growth card for franchise mode */}
        <StatGrowthCard variant="loss" />

        {/* Actions */}
        <View style={styles.actions}>
          {/* Primary action */}
          <Pressable
            onPress={handlePrimary}
            style={({ pressed }) => [
              styles.tryAgainBtn,
              pressed && styles.pressed,
            ]}
          >
            <LinearGradient
              colors={[Colors.yellowBright, Colors.yellow]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={styles.tryAgainGradient}
            >
              <Text style={styles.tryAgainText}>{dest.primaryLabel}</Text>
            </LinearGradient>
          </Pressable>

          {/* Secondary action */}
          {dest.secondary && (
            <Pressable
              onPress={handleSecondary}
              style={({ pressed }) => [
                styles.ghostBtnLoss,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.ghostBtnLossText}>{dest.secondaryLabel}</Text>
            </Pressable>
          )}

          <Text style={styles.breakTextLoss}>Take a break?</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

// ── Main Export ──────────────────────────────────────────────────────────────
export default function ResultsScreen() {
  const lastResult = useGameStore((s) => s.lastResult);

  if (!lastResult) {
    return (
      <View style={[styles.fill, styles.emptyContainer]}>
        <Text style={styles.emptyText}>No results yet.</Text>
      </View>
    );
  }

  return lastResult.won ? <WinScreen /> : <LossScreen />;
}

// ── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ translateY: 2 }],
  },
  scrollContent: {
    alignItems: 'center',
    paddingTop: 70,
    paddingBottom: 50,
    paddingHorizontal: 20,
  },

  // Empty / fallback
  emptyContainer: {
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.whiteAlpha50,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
  },

  // ── Confetti ────────────────────────────────────────────────────────────
  confettiContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    overflow: 'hidden',
  },
  confettiPiece: {
    position: 'absolute',
    top: -20,
  },

  // ── Win layout ──────────────────────────────────────────────────────────
  winTitle: {
    fontFamily: Fonts.display,
    fontSize: 42,
    color: Colors.ink,
    textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
    marginBottom: 8,
  },
  winPayout: {
    fontFamily: Fonts.display,
    fontSize: 56,
    color: Colors.ink,
    textAlign: 'center',
    lineHeight: 62,
  },
  winCoinsLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 18,
    color: Colors.inkAlpha50,
    textAlign: 'center',
    marginBottom: 16,
  },
  pillCenter: {
    alignItems: 'center',
    marginBottom: 24,
  },

  // Win results card
  winCard: {
    backgroundColor: Colors.white,
    borderRadius: 18,
    padding: 18,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    marginBottom: 24,
  },
  winCardTitle: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: '#0a3a96',
    letterSpacing: 1,
    marginBottom: 12,
  },

  // ── Loss layout ─────────────────────────────────────────────────────────
  lossTitle: {
    fontFamily: Fonts.display,
    fontSize: 36,
    color: Colors.white,
    textAlign: 'center',
    marginBottom: 4,
  },
  lossPlacement: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.whiteAlpha50,
    textAlign: 'center',
    marginBottom: 12,
  },
  lossAmount: {
    fontFamily: Fonts.display,
    fontSize: 40,
    color: Colors.red,
    textAlign: 'center',
    marginBottom: 16,
  },
  lossPartialReturn: {
    fontFamily: Fonts.display,
    fontSize: 32,
    color: Colors.yellow,
    textAlign: 'center',
  },
  lossNetLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
    marginBottom: 16,
  },

  // Loss results card
  lossCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 18,
    padding: 18,
    width: '100%',
    marginBottom: 24,
  },
  lossCardTitle: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: Colors.whiteAlpha40,
    letterSpacing: 1,
    marginBottom: 12,
  },

  // ── Finish rows (shared) ───────────────────────────────────────────────
  finishRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  finishRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  finishTagRow: {
    flexDirection: 'row',
    marginTop: 4,
    marginLeft: 34,
  },
  finishRowWinnerWin: {
    backgroundColor: 'rgba(255,194,32,0.2)',
    borderWidth: 2,
    borderColor: Colors.yellow,
  },
  finishRowWinnerLoss: {
    backgroundColor: Colors.yellowAlpha15,
    borderWidth: 1,
    borderColor: 'rgba(255,194,32,0.3)',
  },
  finishRowPickLoss: {
    backgroundColor: Colors.blueAlpha10,
    borderWidth: 1,
    borderColor: 'rgba(77,128,255,0.25)',
  },
  finishPosition: {
    fontFamily: Fonts.bodyBold,
    fontSize: 16,
    width: 24,
    textAlign: 'center',
    marginRight: 10,
  },
  finishPositionWin: {
    color: Colors.ink,
  },
  finishPositionLoss: {
    color: Colors.white,
  },
  finishName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    flex: 1,
    marginLeft: 10,
  },
  finishNameWin: {
    color: Colors.ink,
  },
  finishNameLoss: {
    color: Colors.white,
  },
  finishOdds: {
    fontFamily: Fonts.body,
    fontSize: 13,
    marginLeft: 8,
  },
  finishOddsWin: {
    color: Colors.inkAlpha50,
  },
  finishOddsLoss: {
    color: 'rgba(255,255,255,0.3)',
  },
  finishTag: {
    backgroundColor: Colors.yellowAlpha20,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  finishTagLoss: {
    backgroundColor: Colors.blueAlpha10,
  },
  finishTagText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 9,
    color: Colors.ink,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  finishTagTextLoss: {
    color: Colors.whiteAlpha70,
  },

  // ── Actions (shared) ───────────────────────────────────────────────────
  actions: {
    width: '100%',
    alignItems: 'center',
    marginTop: 32,
  },

  // Share button (win)
  shareBtn: {
    width: '100%',
    borderRadius: 50,
    overflow: 'hidden',
    marginBottom: 12,
  },
  shareBtnGradient: {
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareBtnText: {
    fontFamily: Fonts.display,
    fontSize: 17,
    color: Colors.white,
  },

  // Ghost button (win variant — dashed, ink text)
  ghostBtnWin: {
    width: '100%',
    borderWidth: 2,
    borderColor: Colors.inkAlpha30,
    borderRadius: 50,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  ghostBtnWinText: {
    fontFamily: Fonts.display,
    fontSize: 17,
    color: Colors.ink,
  },

  breakTextWin: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.inkAlpha50,
    textAlign: 'center',
  },

  // Try again button (loss)
  tryAgainBtn: {
    width: '100%',
    borderRadius: 50,
    overflow: 'hidden',
    marginBottom: 12,
  },
  tryAgainGradient: {
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tryAgainText: {
    fontFamily: Fonts.display,
    fontSize: 17,
    color: Colors.ink,
  },

  // Ghost button (loss variant — solid border, white 40% text)
  ghostBtnLoss: {
    width: '100%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 50,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  ghostBtnLossText: {
    fontFamily: Fonts.display,
    fontSize: 17,
    color: Colors.whiteAlpha40,
  },

  breakTextLoss: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.whiteAlpha25,
    textAlign: 'center',
  },

  // ── Stat Growth Card ──────────────────────────────────────────────────
  statGrowthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statGrowthLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    width: 32,
    letterSpacing: 0.5,
  },
  statGrowthTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(128,128,128,0.2)',
    borderRadius: 3,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  statGrowthFill: {
    height: 6,
    borderRadius: 3,
  },
  statGrowthValue: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    width: 36,
    textAlign: 'right',
  },
  statGrowthBoosted: {
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 4,
    marginLeft: 6,
  },
  statGrowthBoostedText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 8,
    letterSpacing: 0.5,
  },
});
