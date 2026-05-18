import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Animated as RNAnimated,
  Dimensions,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate } from 'react-native-reanimated';
import Fireworks from '../components/Fireworks';
import { Colors, Fonts, MARBLES, Spacing, BorderRadius, MarbleData } from '../theme';
import { useGameStore } from '../state/gameStore';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';
import MarbleDot from '../components/MarbleDot';
import PrimaryButton from '../components/PrimaryButton';

function getMarble(id: string): MarbleData {
  return MARBLES.find((m) => m.id === id)!;
}

// ── Confetti for champion screen ───────────────────────────────────────────
const { width: SCREEN_W } = Dimensions.get('window');
const CONFETTI_COLORS = ['#ffc220', '#2ecc71', '#e74c3c', '#3498db', '#9b59b6', '#ff9a1a', '#1abc9c'];
const CONFETTI_COUNT = 28;

function ConfettiBurst() {
  const pieces = useRef(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      tx: new RNAnimated.Value(0),
      ty: new RNAnimated.Value(-20),
      rot: new RNAnimated.Value(0),
      opacity: new RNAnimated.Value(0),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      startX: Math.random() * SCREEN_W,
      driftX: (Math.random() - 0.5) * 120,
      fallY: 400 + Math.random() * 350,
      delay: Math.random() * 400,
      spin: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random() * 2),
      size: 6 + Math.random() * 6,
    })),
  ).current;

  useEffect(() => {
    pieces.forEach((p) => {
      RNAnimated.parallel([
        RNAnimated.timing(p.opacity, { toValue: 1, duration: 200, delay: p.delay, useNativeDriver: true }),
        RNAnimated.timing(p.tx, { toValue: p.driftX, duration: 2200, delay: p.delay, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        RNAnimated.timing(p.ty, { toValue: p.fallY, duration: 2200, delay: p.delay, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
        RNAnimated.timing(p.rot, { toValue: p.spin, duration: 2200, delay: p.delay, useNativeDriver: true }),
        RNAnimated.sequence([
          RNAnimated.delay(p.delay + 1600),
          RNAnimated.timing(p.opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]),
      ]).start();
    });
  }, []);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => (
        <RNAnimated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.startX,
            top: 0,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            opacity: p.opacity,
            transform: [
              { translateX: p.tx },
              { translateY: p.ty },
              { rotate: p.rot.interpolate({ inputRange: [-3, 3], outputRange: ['-540deg', '540deg'] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

// ── Champion banner with spring-in + pulse ─────────────────────────────────
function ChampionBanner({ totalEarned }: { totalEarned: number }) {
  const scale = useRef(new RNAnimated.Value(0)).current;
  const pulse = useRef(new RNAnimated.Value(1)).current;
  const glow = useRef(new RNAnimated.Value(0)).current;
  const [displayCoins, setDisplayCoins] = useState(0);

  useEffect(() => {
    // Spring in
    RNAnimated.spring(scale, {
      toValue: 1,
      tension: 60,
      friction: 5,
      useNativeDriver: true,
    }).start();
    // Continuous pulse on the CHAMPION text
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, { toValue: 1.08, duration: 700, useNativeDriver: true }),
        RNAnimated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    ).start();
    // Glow ring
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
        RNAnimated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
    // Coin count-up over ~1.2s
    const start = Date.now();
    const duration = 1200;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setDisplayCoins(Math.floor(t * totalEarned));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [totalEarned]);

  return (
    <RNAnimated.View style={[styles.championBanner, { transform: [{ scale }] }]}>
      <RNAnimated.View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFillObject,
          borderRadius: 16,
          backgroundColor: '#ffc220',
          opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.15] }),
        }}
      />
      <RNAnimated.Text style={[styles.championText, { transform: [{ scale: pulse }] }]}>
        CHAMPION!
      </RNAnimated.Text>
      <Text style={styles.championPrize}>+{displayCoins.toLocaleString()} coins total</Text>
    </RNAnimated.View>
  );
}

// ── Eliminated banner with shake + red flash ───────────────────────────────
function EliminatedBanner({ currentRound, marbleName, totalEarned }: {
  currentRound: number; marbleName: string; totalEarned: number;
}) {
  const shake = useRef(new RNAnimated.Value(0)).current;
  const flashOpacity = useRef(new RNAnimated.Value(0)).current;
  const fadeIn = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    // Red flash burst on mount
    RNAnimated.sequence([
      RNAnimated.timing(flashOpacity, { toValue: 0.7, duration: 120, useNativeDriver: true }),
      RNAnimated.timing(flashOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();
    // Shake the ELIMINATED text on impact
    RNAnimated.sequence([
      RNAnimated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: -0.7, duration: 60, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: 0.7, duration: 60, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: -0.4, duration: 60, useNativeDriver: true }),
      RNAnimated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
    RNAnimated.timing(fadeIn, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);

  const shakeX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] });

  return (
    <>
      {/* Full-screen red flash on impact */}
      <RNAnimated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: '#e74c3c', opacity: flashOpacity, zIndex: 100 }]}
      />
      <RNAnimated.View style={[styles.eliminatedBanner, { opacity: fadeIn }]}>
        <RNAnimated.Text style={[styles.eliminatedText, { transform: [{ translateX: shakeX }] }]}>
          ELIMINATED
        </RNAnimated.Text>
        <Text style={styles.eliminatedSub}>
          Round {currentRound} · {marbleName} finished last
          {totalEarned > 0 ? ` · Earned ${totalEarned.toLocaleString()} coins` : ''}
        </Text>
      </RNAnimated.View>
    </>
  );
}

// Summarize a stat value (1-5) as a descriptive word
function statLabel(val: number): string {
  if (val >= 5) return 'Elite';
  if (val >= 4) return 'High';
  if (val >= 3) return 'Avg';
  if (val >= 2) return 'Low';
  return 'Weak';
}
function statColor(val: number): string {
  if (val >= 5) return Colors.yellow;
  if (val >= 4) return Colors.green;
  if (val >= 3) return Colors.white;
  return Colors.whiteAlpha40;
}

// Picker card with flip-to-stats
interface PickerFlipCardProps {
  marble: MarbleData;
  isSelected: boolean;
  stats: { wins: number; losses: number; betCount: number } | null;
  onSelect: () => void;
}

function PickerFlipCard({ marble, isSelected, stats, onSelect }: PickerFlipCardProps) {
  const flip = useSharedValue(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const toggleFlip = useCallback(() => {
    const next = !isFlipped;
    setIsFlipped(next);
    flip.value = withTiming(next ? 1 : 0, { duration: 350 });
  }, [isFlipped, flip]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 600 }, { rotateY: `${interpolate(flip.value, [0, 1], [0, 90])}deg` }],
    opacity: flip.value > 0.5 ? 0 : 1,
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 600 }, { rotateY: `${interpolate(flip.value, [0, 1], [-90, 0])}deg` }],
    opacity: flip.value > 0.5 ? 1 : 0,
  }));

  const totalRaces = stats ? stats.wins + stats.losses : 0;
  const winPct = totalRaces > 0 ? Math.round((stats!.wins / totalRaces) * 100) : null;

  // Summarize performance as a phrase
  let performanceText = 'No race history';
  if (totalRaces > 0 && winPct !== null) {
    if (winPct >= 25) performanceText = 'Strong performer';
    else if (winPct >= 15) performanceText = 'Solid runner';
    else if (winPct >= 8) performanceText = 'Inconsistent';
    else performanceText = 'Underdog';
  }

  // Best stat
  const { speed, power, bounce, luck } = marble.stats;
  const statEntries = [
    { name: 'SPD', val: speed },
    { name: 'PWR', val: power },
    { name: 'BNC', val: bounce },
    { name: 'LCK', val: luck },
  ];

  return (
    <View style={[pkStyles.cardWrapper]}>
      {/* Front */}
      <Animated.View style={[pkStyles.card, isSelected && pkStyles.cardSelected, frontStyle]}>
        <Pressable onPress={onSelect} style={({ pressed }) => [pkStyles.cardInner, pressed && { opacity: 0.85 }]}>
          <MarbleDot marble={marble} size={44} />
          <Text style={[pkStyles.cardName, isSelected && { color: Colors.yellow }]}>{marble.name}</Text>
          <Text style={pkStyles.personality}>{marble.personality}</Text>

          {/* Stat bars */}
          <View style={pkStyles.statBars}>
            {statEntries.map(s => (
              <View key={s.name} style={pkStyles.statBarRow}>
                <Text style={pkStyles.statBarLabel}>{s.name}</Text>
                <View style={pkStyles.statBarTrack}>
                  <View style={[pkStyles.statBarFill, { width: `${s.val * 20}%`, backgroundColor: statColor(s.val) }]} />
                </View>
              </View>
            ))}
          </View>

          <Pressable onPress={toggleFlip} hitSlop={8} style={pkStyles.flipBtn}>
            <Text style={pkStyles.flipBtnText}>HISTORY</Text>
          </Pressable>
        </Pressable>
      </Animated.View>

      {/* Back — Race History */}
      <Animated.View style={[pkStyles.card, pkStyles.cardBack, isSelected && pkStyles.cardSelected, backStyle]}>
        <Pressable onPress={toggleFlip} style={({ pressed }) => [pkStyles.cardInner, pressed && { opacity: 0.85 }]}>
          <View style={pkStyles.backHeader}>
            <MarbleDot marble={marble} size={24} />
            <Text style={pkStyles.backName}>{marble.name}</Text>
          </View>

          <Text style={pkStyles.perfText}>{performanceText}</Text>

          {totalRaces > 0 && stats ? (
            <View style={pkStyles.historyGrid}>
              <View style={pkStyles.histCell}>
                <Text style={pkStyles.histValue}>{stats.wins}</Text>
                <Text style={pkStyles.histLabel}>WINS</Text>
              </View>
              <View style={pkStyles.histCell}>
                <Text style={pkStyles.histValue}>{totalRaces}</Text>
                <Text style={pkStyles.histLabel}>RACES</Text>
              </View>
              <View style={pkStyles.histCell}>
                <Text style={[pkStyles.histValue, { color: winPct! >= 15 ? Colors.green : Colors.red }]}>
                  {winPct}%
                </Text>
                <Text style={pkStyles.histLabel}>WIN%</Text>
              </View>
            </View>
          ) : (
            <Text style={pkStyles.noHistory}>First time racing — unknown potential</Text>
          )}

          <Pressable onPress={onSelect} style={pkStyles.selectBtn}>
            <Text style={pkStyles.selectBtnText}>{isSelected ? 'SELECTED' : 'SELECT'}</Text>
          </Pressable>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function TournamentBracketScreen() {
  const router = useRouter();
  const coins = useGameStore((s) => s.coins);
  const tournaments = useGameStore((s) => s.tournaments);
  const selectCourse = useGameStore((s) => s.selectCourse);
  const setActiveMode = useGameStore((s) => s.setActiveMode);
  const selectMarble = useGameStore((s) => s.selectMarble);
  const setBetAmount = useGameStore((s) => s.setBetAmount);

  const [selectedPick, setSelectedPick] = useState<string | null>(null);
  const marbleStats = useGameStore(s => s.marbleStats);

  if (!tournaments) {
    return (
      <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.fill}>
        <SafeAreaView style={[styles.fill, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={styles.title}>No active tournament</Text>
          <PrimaryButton label="BACK" onPress={() => router.push('/tournaments')} />
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const { marbleIds, playerPickId, rounds, currentRound, eliminatedIds, status, prizePool, roundPayouts, totalEarned } = tournaments;
  const remainingIds = marbleIds.filter(id => !eliminatedIds.includes(id));
  const needsPick = !playerPickId;
  const marblesInRound = 8 - currentRound;

  const handlePickConfirm = () => {
    if (!selectedPick) return;
    useGameStore.setState({
      tournaments: { ...tournaments, playerPickId: selectedPick },
    });
  };

  const handleRace = () => {
    if (!tournaments || currentRound >= 7 || !tournaments.playerPickId) return;
    const round = rounds[currentRound];
    selectCourse(round.courseId);
    setActiveMode({
      type: 'tournament',
      tournamentId: tournaments.tournamentId,
      round: currentRound,
    });
    selectMarble(MARBLES.find(m => m.id === tournaments.playerPickId)!);
    setBetAmount(0);
    router.push('/race');
  };

  // Marble picker — before first race
  if (needsPick) {
    return (
      <LinearGradient colors={['#1d56d4', '#0a3a96']} style={styles.fill}>
        <SafeAreaView style={styles.fill}>
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerRow}>
              <BackButton onPress={() => router.push('/tournaments')} />
              <CoinPill amount={coins} />
            </View>

            <Text style={styles.title}>PICK YOUR MARBLE</Text>
            <Text style={styles.subtitle}>
              This marble races for you the entire tournament.{'\n'}If it finishes last in any round, you're out.
            </Text>

            <View style={pkStyles.grid}>
              {marbleIds.map(id => {
                const marble = getMarble(id);
                const isSelected = selectedPick === id;
                return (
                  <PickerFlipCard
                    key={id}
                    marble={marble}
                    isSelected={isSelected}
                    stats={marbleStats[id] || null}
                    onSelect={() => setSelectedPick(id)}
                  />
                );
              })}
            </View>

            <View style={{ height: 16 }} />
            {selectedPick ? (
              <PrimaryButton label="START TOURNAMENT" onPress={handlePickConfirm} />
            ) : (
              <View style={styles.pickPrompt}>
                <Text style={styles.pickPromptText}>Tap a marble to select it</Text>
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const playerMarble = getMarble(playerPickId);

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
            <BackButton onPress={() => router.push('/tournaments')} />
            <CoinPill amount={coins} />
          </View>

          {/* Title */}
          <Text style={styles.title}>KING OF THE HILL</Text>
          <Text style={styles.subtitle}>
            {status === 'champion'
              ? 'Your marble is the champion!'
              : status === 'eliminated'
                ? 'Your marble was eliminated'
                : `Round ${currentRound + 1} of 7 · ${marblesInRound} marbles racing · Prize: ${prizePool.toLocaleString()}`}
          </Text>

          {/* Status banners — animated. Champion gets confetti + pulse +
              coin count-up; eliminated gets a red flash + shake. */}
          {status === 'champion' && (
            <>
              <Fireworks />
              <ChampionBanner totalEarned={totalEarned} />
            </>
          )}
          {status === 'eliminated' && (
            <EliminatedBanner
              currentRound={currentRound}
              marbleName={playerMarble.name}
              totalEarned={totalEarned}
            />
          )}

          {/* Your marble */}
          <View style={styles.yourMarbleBanner}>
            <MarbleDot marble={playerMarble} size={28} />
            <View style={styles.yourMarbleInfo}>
              <Text style={styles.yourMarbleLabel}>YOUR MARBLE</Text>
              <Text style={styles.yourMarbleName}>{playerMarble.name}</Text>
            </View>
            {status === 'active' && (
              <View style={styles.aliveBadge}>
                <Text style={styles.aliveBadgeText}>ALIVE</Text>
              </View>
            )}
          </View>

          {/* Payout ladder */}
          {roundPayouts && (
            <>
              <Text style={styles.sectionLabel}>
                PRIZE LADDER{totalEarned > 0 ? ` · EARNED ${totalEarned.toLocaleString()}` : ''}
              </Text>
              <View style={styles.payoutLadder}>
                {roundPayouts.map((payout, idx) => {
                  const isCompleted = idx < currentRound;
                  const isCurrent = idx === currentRound && status === 'active';
                  const isPlayerEliminated = status === 'eliminated' && idx >= currentRound;
                  const survived = isCompleted && !(status === 'eliminated' && idx >= currentRound);
                  return (
                    <View
                      key={idx}
                      style={[
                        styles.payoutRow,
                        isCurrent && styles.payoutRowCurrent,
                        survived && payout > 0 && styles.payoutRowEarned,
                        isPlayerEliminated && styles.payoutRowLocked,
                      ]}
                    >
                      <Text style={[
                        styles.payoutRound,
                        isCurrent && styles.payoutRoundCurrent,
                        survived && styles.payoutRoundEarned,
                      ]}>
                        R{idx + 1}
                      </Text>
                      <Text style={[
                        styles.payoutMarbles,
                        isCurrent && styles.payoutMarblesCurrent,
                      ]}>
                        {8 - idx} → {7 - idx}
                      </Text>
                      <Text style={[
                        styles.payoutAmount,
                        payout === 0 && styles.payoutAmountZero,
                        isCurrent && styles.payoutAmountCurrent,
                        survived && payout > 0 && styles.payoutAmountEarned,
                      ]}>
                        {payout > 0 ? `+${payout.toLocaleString()}` : '—'}
                      </Text>
                      {survived && payout > 0 && (
                        <Text style={styles.payoutCheck}>✓</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Remaining marbles */}
          <Text style={styles.sectionLabel}>
            {status === 'active' ? `STILL RACING · ${remainingIds.length}` : `FINAL STANDINGS · ${remainingIds.length} survived`}
          </Text>
          <View style={styles.marblesRow}>
            {remainingIds.map(id => {
              const marble = getMarble(id);
              const isPlayer = id === playerPickId;
              return (
                <View key={id} style={[styles.marbleChip, isPlayer && styles.marbleChipPlayer]}>
                  <MarbleDot marble={marble} size={22} />
                  <Text style={[styles.marbleChipName, isPlayer && styles.marbleChipNamePlayer]}>
                    {marble.name}
                  </Text>
                </View>
              );
            })}
          </View>

          {/* Eliminated marbles */}
          {eliminatedIds.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>ELIMINATED · {eliminatedIds.length}</Text>
              <View style={styles.marblesRow}>
                {eliminatedIds.map((id, i) => {
                  const marble = getMarble(id);
                  const roundNum = i + 1;
                  return (
                    <View key={id} style={styles.eliminatedChip}>
                      <MarbleDot marble={marble} size={18} />
                      <Text style={styles.eliminatedChipName}>{marble.name}</Text>
                      <Text style={styles.eliminatedRound}>R{roundNum}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Round history */}
          {rounds.filter(r => r.finishOrder.length > 0).length > 0 && (
            <>
              <Text style={styles.sectionLabel}>ROUND HISTORY</Text>
              {rounds.map((round, idx) => {
                if (round.finishOrder.length === 0) return null;
                const eliminated = round.eliminatedMarbleId ? getMarble(round.eliminatedMarbleId) : null;
                return (
                  <View key={idx} style={styles.roundCard}>
                    <View style={styles.roundHeader}>
                      <Text style={styles.roundTitle}>Round {idx + 1}</Text>
                      {eliminated && (
                        <View style={styles.roundElimBadge}>
                          <MarbleDot marble={eliminated} size={14} />
                          <Text style={styles.roundElimText}>{eliminated.name} eliminated</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.roundFinish}>
                      {round.finishOrder.slice(0, 5).map((mid, pos) => {
                        const m = getMarble(mid);
                        const isElim = mid === round.eliminatedMarbleId;
                        return (
                          <View key={mid} style={[styles.finishEntry, isElim && styles.finishEntryElim]}>
                            <Text style={[styles.finishPos, isElim && styles.finishPosElim]}>{pos + 1}</Text>
                            <MarbleDot marble={m} size={16} />
                            <Text style={[styles.finishName, isElim && styles.finishNameElim]}>{m.name}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {/* Action buttons */}
          <View style={{ height: 20 }} />
          {status === 'active' && (
            <PrimaryButton
              label={`RACE · ROUND ${currentRound + 1}`}
              onPress={handleRace}
            />
          )}

          {(status === 'champion' || status === 'eliminated') && (
            <PrimaryButton
              label="BACK TO TOURNAMENTS"
              onPress={() => {
                useGameStore.setState({ tournaments: null });
                router.push('/tournaments');
              }}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },

  title: { fontFamily: Fonts.display, fontSize: 24, color: Colors.white, textAlign: 'center', marginBottom: 4 },
  subtitle: { fontFamily: Fonts.body, fontSize: 13, color: Colors.whiteAlpha40, textAlign: 'center', marginBottom: 16 },

  /* Champion / Eliminated banners */
  championBanner: {
    backgroundColor: 'rgba(46,204,113,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(46,204,113,0.2)',
    borderRadius: BorderRadius.lg,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  championText: { fontFamily: Fonts.display, fontSize: 22, color: Colors.green },
  championPrize: { fontFamily: Fonts.display, fontSize: 20, color: Colors.yellow, marginTop: 4 },

  eliminatedBanner: {
    backgroundColor: Colors.redAlpha20,
    borderWidth: 2,
    borderColor: 'rgba(231,76,60,0.3)',
    borderRadius: BorderRadius.md,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  eliminatedText: { fontFamily: Fonts.display, fontSize: 16, color: Colors.red },
  eliminatedSub: { fontFamily: Fonts.body, fontSize: 12, color: Colors.whiteAlpha40, marginTop: 4 },

  /* Your marble banner */
  yourMarbleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.yellowAlpha08,
    borderWidth: 1,
    borderColor: Colors.yellowAlpha20,
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  yourMarbleInfo: { flex: 1 },
  yourMarbleLabel: { fontFamily: Fonts.bodySemiBold, fontSize: 9, color: Colors.whiteAlpha40, letterSpacing: 1 },
  yourMarbleName: { fontFamily: Fonts.bodyBold, fontSize: 16, color: Colors.yellow },
  aliveBadge: { backgroundColor: 'rgba(46,204,113,0.2)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: BorderRadius.pill },
  aliveBadgeText: { fontFamily: Fonts.bodyBold, fontSize: 10, color: Colors.green, letterSpacing: 0.5 },

  /* Section labels */
  sectionLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: Colors.whiteAlpha40,
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 4,
  },

  /* Payout ladder */
  payoutLadder: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 8,
    marginBottom: 16,
  },
  payoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 2,
  },
  payoutRowCurrent: {
    backgroundColor: Colors.yellowAlpha08,
    borderWidth: 1,
    borderColor: Colors.yellowAlpha20,
  },
  payoutRowEarned: {
    backgroundColor: 'rgba(46,204,113,0.08)',
  },
  payoutRowLocked: {
    opacity: 0.35,
  },
  payoutRound: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.whiteAlpha40,
    width: 28,
  },
  payoutRoundCurrent: {
    color: Colors.yellow,
  },
  payoutRoundEarned: {
    color: Colors.green,
  },
  payoutMarbles: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha25,
    width: 50,
  },
  payoutMarblesCurrent: {
    color: Colors.whiteAlpha40,
  },
  payoutAmount: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
    flex: 1,
    textAlign: 'right',
  },
  payoutAmountZero: {
    color: Colors.whiteAlpha25,
    fontFamily: Fonts.body,
  },
  payoutAmountCurrent: {
    color: Colors.yellow,
  },
  payoutAmountEarned: {
    color: Colors.green,
  },
  payoutCheck: {
    fontSize: 12,
    color: Colors.green,
    marginLeft: 6,
    width: 16,
  },

  /* Marble chips */
  marblesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  marbleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.pill,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  marbleChipPlayer: {
    borderColor: Colors.yellowAlpha20,
    backgroundColor: Colors.yellowAlpha08,
  },
  marbleChipName: { fontFamily: Fonts.bodySemiBold, fontSize: 12, color: Colors.white },
  marbleChipNamePlayer: { color: Colors.yellow },

  eliminatedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
    opacity: 0.5,
  },
  eliminatedChipName: { fontFamily: Fonts.bodySemiBold, fontSize: 11, color: Colors.whiteAlpha40 },
  eliminatedRound: { fontFamily: Fonts.bodyBold, fontSize: 9, color: Colors.red, letterSpacing: 0.5 },

  /* Round history */
  roundCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: 8,
  },
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roundTitle: { fontFamily: Fonts.bodyBold, fontSize: 13, color: Colors.white },
  roundElimBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.redAlpha20,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: BorderRadius.pill,
  },
  roundElimText: { fontFamily: Fonts.bodySemiBold, fontSize: 10, color: Colors.red },

  roundFinish: { gap: 4 },
  finishEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  finishEntryElim: { opacity: 0.4 },
  finishPos: { fontFamily: Fonts.bodyBold, fontSize: 12, color: Colors.whiteAlpha50, width: 18 },
  finishPosElim: { color: Colors.red },
  finishName: { fontFamily: Fonts.body, fontSize: 12, color: Colors.whiteAlpha50 },
  finishNameElim: { color: Colors.red, textDecorationLine: 'line-through' },

  /* Picker */
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  pickerCard: {
    width: '45%',
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  pickerCardSelected: {
    borderColor: Colors.yellow,
    backgroundColor: Colors.yellowAlpha08,
  },
  pickerName: { fontFamily: Fonts.bodyBold, fontSize: 14, color: Colors.white },
  pickerNameSelected: { color: Colors.yellow },

  pickPrompt: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    padding: 16,
    alignItems: 'center',
  },
  pickPromptText: { fontFamily: Fonts.bodySemiBold, fontSize: 13, color: Colors.whiteAlpha40 },
});

// Picker FlipCard styles
const pkStyles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  cardWrapper: {
    width: '47%',
    height: 210,
  },
  card: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.md,
    backfaceVisibility: 'hidden',
  },
  cardBack: {
    backgroundColor: 'rgba(10,20,50,0.95)',
  },
  cardSelected: {
    borderColor: Colors.yellow,
    backgroundColor: Colors.yellowAlpha08,
  },
  cardInner: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  cardName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
    marginTop: 2,
  },
  personality: {
    fontFamily: Fonts.body,
    fontSize: 9,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
  },
  statBars: {
    width: '100%',
    gap: 3,
    marginTop: 4,
  },
  statBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statBarLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 8,
    color: Colors.whiteAlpha40,
    width: 24,
    letterSpacing: 0.5,
  },
  statBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  statBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  flipBtn: {
    marginTop: 4,
    paddingVertical: 3,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: BorderRadius.pill,
  },
  flipBtnText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 9,
    color: Colors.whiteAlpha50,
    letterSpacing: 0.8,
  },
  // Back face
  backHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  backName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
  perfText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 11,
    color: Colors.yellow,
    marginBottom: 8,
  },
  historyGrid: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  histCell: {
    alignItems: 'center',
  },
  histValue: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.white,
  },
  histLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 8,
    color: Colors.whiteAlpha40,
    letterSpacing: 0.8,
  },
  noHistory: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
    marginVertical: 10,
  },
  selectBtn: {
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,194,32,0.15)',
    borderWidth: 1,
    borderColor: Colors.yellowAlpha20,
    borderRadius: BorderRadius.pill,
  },
  selectBtnText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 11,
    color: Colors.yellow,
    letterSpacing: 0.5,
  },
});
