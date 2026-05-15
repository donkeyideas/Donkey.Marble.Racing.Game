import React, { useState } from 'react';
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

function getMarble(id: string): MarbleData {
  return MARBLES.find((m) => m.id === id)!;
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

            <View style={styles.pickerGrid}>
              {marbleIds.map(id => {
                const marble = getMarble(id);
                const isSelected = selectedPick === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setSelectedPick(id)}
                    style={[styles.pickerCard, isSelected && styles.pickerCardSelected]}
                  >
                    <MarbleDot marble={marble} size={36} />
                    <Text style={[styles.pickerName, isSelected && styles.pickerNameSelected]}>
                      {marble.name}
                    </Text>
                  </Pressable>
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

          {/* Status banners */}
          {status === 'champion' && (
            <View style={styles.championBanner}>
              <Text style={styles.championText}>CHAMPION!</Text>
              <Text style={styles.championPrize}>+{totalEarned.toLocaleString()} coins total</Text>
            </View>
          )}
          {status === 'eliminated' && (
            <View style={styles.eliminatedBanner}>
              <Text style={styles.eliminatedText}>ELIMINATED</Text>
              <Text style={styles.eliminatedSub}>
                Round {currentRound} · {playerMarble.name} finished last
                {totalEarned > 0 ? ` · Earned ${totalEarned.toLocaleString()} coins` : ''}
              </Text>
            </View>
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
