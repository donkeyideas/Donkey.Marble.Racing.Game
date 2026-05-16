import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, BorderRadius, MARBLES } from '../theme';
import { useGameStore } from '../state/gameStore';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';
import MarbleDot from '../components/MarbleDot';
import {
  LobbyData,
  LobbyPlayer,
  subscribeLobby,
  quickMatch,
  backfillWithBots,
  startDraft,
  draftPick,
  autoDraftBots,
  submitRoundResult,
  advanceToNextRace,
  leaveLobby,
  getPlayerPlacement,
  calculateMPPayout,
  getWinner,
  MP_TIERS,
  AI_BACKFILL_DELAY_MS,
} from '../lib/multiplayer';

type Phase = 'matching' | 'waiting' | 'drafting' | 'racing' | 'round_result' | 'finished';

export default function MultiplayerLobbyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tier: string }>();
  const tier = (params.tier || 'daily') as 'daily' | 'weekly' | 'champion';

  const coins = useGameStore((s) => s.coins);
  const firebaseUid = useGameStore((s) => s.firebaseUid);
  const firebaseDisplayName = useGameStore((s) => s.firebaseDisplayName);
  const setMpLobbyId = useGameStore((s) => s.setMpLobbyId);
  const setMpResult = useGameStore((s) => s.setMpResult);

  const [lobbyId, setLobbyId] = useState<string | null>(null);
  const [lobby, setLobby] = useState<LobbyData | null>(null);
  const [phase, setPhase] = useState<Phase>('matching');
  const [selectedMarble, setSelectedMarble] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(15);
  const backfillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uid = firebaseUid || 'local-player';
  const displayName = firebaseDisplayName || useGameStore.getState().playerName || 'Player';
  const tierConfig = MP_TIERS[tier];

  // ---------------------------------------------------------------------------
  // Quick match on mount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let mounted = true;

    async function match() {
      try {
        // Deduct entry fee
        const store = useGameStore.getState();
        if (store.coins < tierConfig.entryFee) {
          Alert.alert('Not Enough Coins', `You need ${tierConfig.entryFee} coins to enter.`);
          router.back();
          return;
        }
        store.removeCoins(tierConfig.entryFee);

        const id = await quickMatch(uid, displayName, tier);
        if (!mounted) return;
        setLobbyId(id);
        setMpLobbyId(id);
        setPhase('waiting');
      } catch (e) {
        if (mounted) {
          Alert.alert('Error', 'Could not find a match. Please try again.');
          router.back();
        }
      }
    }

    match();
    return () => { mounted = false; };
  }, []);

  // ---------------------------------------------------------------------------
  // Subscribe to lobby updates
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!lobbyId) return;

    const unsub = subscribeLobby(lobbyId, (data) => {
      setLobby(data);
      if (data) {
        setPhase(data.status === 'waiting' ? 'waiting' : data.status);
      }
    });

    return () => unsub();
  }, [lobbyId]);

  // ---------------------------------------------------------------------------
  // Backfill timer (host only)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!lobbyId || !lobby) return;
    if (lobby.hostUid !== uid || lobby.status !== 'waiting') return;

    // Start countdown
    setCountdown(Math.ceil(AI_BACKFILL_DELAY_MS / 1000));

    countdownRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    backfillTimerRef.current = setTimeout(async () => {
      await backfillWithBots(lobbyId);
      await startDraft(lobbyId);
      // Auto-draft for initial bots if needed
      setTimeout(() => autoDraftBots(lobbyId), 500);
    }, AI_BACKFILL_DELAY_MS);

    return () => {
      if (backfillTimerRef.current) clearTimeout(backfillTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [lobbyId, lobby?.status, lobby?.hostUid]);

  // ---------------------------------------------------------------------------
  // Auto-draft bots when it's their turn
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!lobbyId || !lobby || lobby.status !== 'drafting') return;
    if (lobby.hostUid !== uid) return;

    const currentDraftUid = lobby.draftOrder?.[lobby.draftTurn];
    if (currentDraftUid && lobby.players?.[currentDraftUid]?.isBot) {
      setTimeout(() => autoDraftBots(lobbyId), 800);
    }
  }, [lobby?.draftTurn, lobby?.status]);

  // ---------------------------------------------------------------------------
  // Handle player draft pick
  // ---------------------------------------------------------------------------
  const handleDraftPick = useCallback(async () => {
    if (!lobbyId || !selectedMarble || !lobby) return;

    const success = await draftPick(lobbyId, uid, selectedMarble);
    if (success) {
      setSelectedMarble(null);
      // Trigger bot auto-draft after player picks
      setTimeout(() => autoDraftBots(lobbyId), 500);
    }
  }, [lobbyId, selectedMarble, uid, lobby]);

  // ---------------------------------------------------------------------------
  // Start race (navigate to race screen)
  // ---------------------------------------------------------------------------
  const handleStartRace = useCallback(() => {
    if (!lobby || !lobbyId) return;

    const courseId = lobby.courses[lobby.currentRound];
    const myMarble = lobby.players?.[uid]?.marbleId;
    if (!courseId || !myMarble) return;

    const store = useGameStore.getState();
    store.selectCourse(courseId);
    store.setActiveMode({
      type: 'multiplayer_tournament',
      lobbyId,
      round: lobby.currentRound,
    });

    const marble = MARBLES.find((m) => m.id === myMarble);
    if (marble) store.selectMarble(marble);
    store.setBetAmount(0);

    router.push('/race');
  }, [lobby, lobbyId, uid]);

  // ---------------------------------------------------------------------------
  // Handle race finish — host submits result
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!lobby || !lobbyId) return;
    if (lobby.status !== 'racing' || lobby.hostUid !== uid) return;

    // Check if we returned from a race (lastResult exists)
    const lastResult = useGameStore.getState().lastResult;
    if (lastResult && lastResult.positions.length > 0) {
      const finishOrder = lastResult.positions.map((p) => p.marble.id);
      submitRoundResult(lobbyId, uid, finishOrder);
    }
  }, [lobby?.status]);

  // ---------------------------------------------------------------------------
  // Handle tournament finished
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!lobby || lobby.status !== 'finished') return;

    const placement = getPlayerPlacement(lobby, uid);
    const payout = calculateMPPayout(lobby, placement);
    setMpResult(placement, payout);
  }, [lobby?.status]);

  // ---------------------------------------------------------------------------
  // Leave lobby
  // ---------------------------------------------------------------------------
  const handleLeave = useCallback(async () => {
    if (lobbyId) {
      await leaveLobby(lobbyId, uid);
      setMpLobbyId(null);
    }
    router.back();
  }, [lobbyId, uid]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const players = lobby ? Object.values(lobby.players || {}) : [];
  const humanCount = players.filter((p) => !p.isBot).length;
  const totalCount = players.length;
  const isMyTurn = lobby?.status === 'drafting' && lobby.draftOrder?.[lobby.draftTurn] === uid;
  const myPlayer = lobby?.players?.[uid];
  const amEliminated = myPlayer?.eliminated ?? false;
  const myMarbleId = myPlayer?.marbleId;

  const currentDrafter = lobby?.status === 'drafting'
    ? lobby.players?.[lobby.draftOrder?.[lobby.draftTurn] || '']
    : null;

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
            <BackButton onPress={handleLeave} />
            <CoinPill amount={coins} />
          </View>

          {/* Title */}
          <Text style={styles.title}>MULTIPLAYER</Text>
          <Text style={styles.subtitle}>
            {tierConfig.label} · Prize Pool: {tierConfig.prizePool.toLocaleString()}
          </Text>

          {/* PHASE: Matching */}
          {phase === 'matching' && (
            <View style={styles.centerCard}>
              <ActivityIndicator size="large" color={Colors.yellow} />
              <Text style={styles.centerText}>Finding a match...</Text>
            </View>
          )}

          {/* PHASE: Waiting for players */}
          {phase === 'waiting' && (
            <>
              <View style={styles.centerCard}>
                <Text style={styles.statusTitle}>WAITING FOR PLAYERS</Text>
                <Text style={styles.statusSub}>
                  {humanCount} player{humanCount !== 1 ? 's' : ''} joined · {8 - totalCount} slots open
                </Text>
                <View style={styles.countdownRow}>
                  <Text style={styles.countdownText}>
                    AI fills empty slots in {countdown}s
                  </Text>
                </View>
              </View>

              {/* Player list */}
              <Text style={styles.sectionTitle}>PLAYERS</Text>
              {players.map((p) => (
                <View key={p.uid} style={styles.playerRow}>
                  <View style={[styles.playerDot, p.uid === uid && { borderColor: Colors.yellow }]}>
                    <Text style={styles.playerDotText}>
                      {p.displayName[0].toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.playerName}>
                    {p.displayName} {p.uid === uid ? '(YOU)' : ''} {p.isHost ? '(HOST)' : ''}
                  </Text>
                </View>
              ))}

              {/* Empty slots */}
              {Array.from({ length: 8 - totalCount }).map((_, i) => (
                <View key={`empty-${i}`} style={[styles.playerRow, { opacity: 0.3 }]}>
                  <View style={styles.playerDot}>
                    <Text style={styles.playerDotText}>?</Text>
                  </View>
                  <Text style={styles.playerName}>Waiting...</Text>
                </View>
              ))}
            </>
          )}

          {/* PHASE: Drafting */}
          {phase === 'drafting' && lobby && (
            <>
              <View style={styles.centerCard}>
                <Text style={styles.statusTitle}>MARBLE DRAFT</Text>
                {isMyTurn ? (
                  <Text style={[styles.statusSub, { color: Colors.yellow }]}>
                    YOUR TURN — Pick a marble!
                  </Text>
                ) : myMarbleId ? (
                  <Text style={styles.statusSub}>
                    Waiting for {currentDrafter?.displayName || 'other player'} to pick...
                  </Text>
                ) : (
                  <Text style={styles.statusSub}>
                    {currentDrafter?.displayName || 'Someone'} is picking...
                  </Text>
                )}
              </View>

              {/* Your marble (if already picked) */}
              {myMarbleId && (
                <View style={styles.myMarbleCard}>
                  <MarbleDot
                    marble={MARBLES.find((m) => m.id === myMarbleId)!}
                    size={40}
                  />
                  <View style={{ marginLeft: 12 }}>
                    <Text style={styles.myMarbleLabel}>YOUR MARBLE</Text>
                    <Text style={styles.myMarbleName}>
                      {MARBLES.find((m) => m.id === myMarbleId)?.name}
                    </Text>
                  </View>
                </View>
              )}

              {/* Available marbles grid */}
              {isMyTurn && !myMarbleId && (
                <>
                  <Text style={styles.sectionTitle}>AVAILABLE MARBLES</Text>
                  <View style={styles.marbleGrid}>
                    {(lobby.availableMarbles || []).map((mId) => {
                      const marble = MARBLES.find((m) => m.id === mId);
                      if (!marble) return null;
                      const isSelected = selectedMarble === mId;
                      return (
                        <Pressable
                          key={mId}
                          onPress={() => setSelectedMarble(mId)}
                          style={[
                            styles.marbleCell,
                            isSelected && styles.marbleCellSelected,
                          ]}
                        >
                          <MarbleDot marble={marble} size={36} />
                          <Text style={styles.marbleCellName}>{marble.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {selectedMarble && (
                    <Pressable onPress={handleDraftPick} style={styles.confirmBtn}>
                      <Text style={styles.confirmBtnText}>
                        PICK {MARBLES.find((m) => m.id === selectedMarble)?.name.toUpperCase()}
                      </Text>
                    </Pressable>
                  )}
                </>
              )}

              {/* Draft order */}
              <Text style={styles.sectionTitle}>DRAFT ORDER</Text>
              {(lobby.draftOrder || []).map((draftUid, i) => {
                const p = lobby.players?.[draftUid];
                if (!p) return null;
                const isDone = p.marbleId !== null;
                const isCurrent = i === lobby.draftTurn;
                const pickedMarble = isDone ? MARBLES.find((m) => m.id === p.marbleId) : null;
                return (
                  <View
                    key={draftUid}
                    style={[
                      styles.draftRow,
                      isCurrent && { borderColor: Colors.yellow },
                    ]}
                  >
                    <Text style={styles.draftNum}>{i + 1}</Text>
                    <Text style={[styles.draftName, draftUid === uid && { color: Colors.yellow }]}>
                      {p.displayName} {draftUid === uid ? '(YOU)' : ''} {p.isBot ? '(BOT)' : ''}
                    </Text>
                    {pickedMarble ? (
                      <MarbleDot marble={pickedMarble} size={20} />
                    ) : isCurrent ? (
                      <Text style={styles.draftPicking}>PICKING...</Text>
                    ) : (
                      <Text style={styles.draftWaiting}>-</Text>
                    )}
                  </View>
                );
              })}
            </>
          )}

          {/* PHASE: Racing */}
          {phase === 'racing' && lobby && (
            <View style={styles.centerCard}>
              <Text style={styles.statusTitle}>
                ROUND {lobby.currentRound + 1} of 7
              </Text>
              <Text style={styles.statusSub}>
                {8 - lobby.currentRound} marbles remaining
              </Text>

              {!amEliminated ? (
                <Pressable onPress={handleStartRace} style={styles.raceBtn}>
                  <Text style={styles.raceBtnText}>RACE NOW</Text>
                </Pressable>
              ) : (
                <Text style={[styles.statusSub, { color: Colors.red, marginTop: 12 }]}>
                  You were eliminated in Round {(myPlayer?.eliminatedRound ?? 0) + 1}
                </Text>
              )}
            </View>
          )}

          {/* PHASE: Round Result */}
          {phase === 'round_result' && lobby && (
            <>
              <View style={styles.centerCard}>
                <Text style={styles.statusTitle}>
                  ROUND {lobby.currentRound} RESULTS
                </Text>

                {/* Last round results */}
                {lobby.rounds.length > 0 && (() => {
                  const lastRound = lobby.rounds[lobby.rounds.length - 1];
                  const eliminatedPlayer = lobby.players?.[lastRound.eliminatedPlayerId];
                  return (
                    <>
                      <Text style={styles.statusSub}>
                        Finish order:
                      </Text>
                      {lastRound.finishOrder.map((mId, i) => {
                        const marble = MARBLES.find((m) => m.id === mId);
                        const isLast = i === lastRound.finishOrder.length - 1;
                        return (
                          <View key={mId} style={styles.resultRow}>
                            <Text style={[styles.resultPos, isLast && { color: Colors.red }]}>
                              #{i + 1}
                            </Text>
                            {marble && <MarbleDot marble={marble} size={20} />}
                            <Text style={[styles.resultName, isLast && { color: Colors.red }]}>
                              {marble?.name} {isLast ? '(ELIMINATED)' : ''}
                            </Text>
                          </View>
                        );
                      })}

                      {eliminatedPlayer && (
                        <Text style={[styles.statusSub, { color: Colors.red, marginTop: 8 }]}>
                          {eliminatedPlayer.displayName} eliminated!
                        </Text>
                      )}
                    </>
                  );
                })()}

                {amEliminated ? (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.statusSub, { color: Colors.red }]}>
                      You were eliminated
                    </Text>
                    <Pressable onPress={handleLeave} style={styles.leaveBtn}>
                      <Text style={styles.leaveBtnText}>LEAVE TOURNAMENT</Text>
                    </Pressable>
                  </View>
                ) : lobby.hostUid === uid ? (
                  <Pressable
                    onPress={() => advanceToNextRace(lobbyId!)}
                    style={[styles.raceBtn, { marginTop: 16 }]}
                  >
                    <Text style={styles.raceBtnText}>NEXT ROUND</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.statusSub, { marginTop: 12 }]}>
                    Waiting for host to start next round...
                  </Text>
                )}
              </View>
            </>
          )}

          {/* PHASE: Finished */}
          {phase === 'finished' && lobby && (() => {
            const winner = getWinner(lobby);
            const placement = getPlayerPlacement(lobby, uid);
            const payout = calculateMPPayout(lobby, placement);
            const isWinner = placement === 1;

            return (
              <View style={styles.centerCard}>
                <Text style={[styles.statusTitle, isWinner && { color: Colors.yellow }]}>
                  {isWinner ? 'CHAMPION!' : `FINISHED #${placement}`}
                </Text>

                {winner && (
                  <Text style={styles.statusSub}>
                    Winner: {winner.displayName}
                  </Text>
                )}

                <View style={styles.payoutCard}>
                  <Text style={styles.payoutLabel}>YOUR PAYOUT</Text>
                  <Text style={styles.payoutAmount}>+{payout.toLocaleString()}</Text>
                </View>

                {/* Final standings */}
                <Text style={[styles.sectionTitle, { marginTop: 16 }]}>FINAL STANDINGS</Text>
                {players
                  .sort((a, b) => {
                    if (!a.eliminated && !b.eliminated) return 0;
                    if (!a.eliminated) return -1;
                    if (!b.eliminated) return 1;
                    return (b.eliminatedRound ?? 0) - (a.eliminatedRound ?? 0);
                  })
                  .map((p, i) => (
                    <View key={p.uid} style={styles.standingRow}>
                      <Text style={styles.standingPos}>#{i + 1}</Text>
                      {p.marbleId && (
                        <MarbleDot
                          marble={MARBLES.find((m) => m.id === p.marbleId)!}
                          size={20}
                        />
                      )}
                      <Text style={[
                        styles.standingName,
                        p.uid === uid && { color: Colors.yellow },
                      ]}>
                        {p.displayName} {p.uid === uid ? '(YOU)' : ''} {p.isBot ? '(BOT)' : ''}
                      </Text>
                      <Text style={styles.standingPayout}>
                        +{calculateMPPayout(lobby, i + 1).toLocaleString()}
                      </Text>
                    </View>
                  ))}

                <Pressable onPress={handleLeave} style={[styles.raceBtn, { marginTop: 20 }]}>
                  <Text style={styles.raceBtnText}>BACK TO LOBBY</Text>
                </Pressable>
              </View>
            );
          })()}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

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
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: Fonts.display,
    fontSize: 13,
    color: Colors.whiteAlpha50,
    letterSpacing: 2,
    marginBottom: 10,
    marginTop: 16,
  },

  /* Center card */
  centerCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.lg,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  centerText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.whiteAlpha50,
    marginTop: 12,
  },

  statusTitle: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.white,
    marginBottom: 8,
  },
  statusSub: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
  },

  /* Countdown */
  countdownRow: {
    marginTop: 12,
    backgroundColor: 'rgba(255,194,32,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
  },
  countdownText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.yellow,
  },

  /* Player list */
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: Colors.whiteAlpha07,
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
  },
  playerDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.whiteAlpha10,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerDotText: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: Colors.white,
  },
  playerName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 14,
    color: Colors.white,
    flex: 1,
  },

  /* Marble grid */
  marbleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  marbleCell: {
    width: 80,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 2,
    borderColor: Colors.whiteAlpha10,
  },
  marbleCellSelected: {
    borderColor: Colors.yellow,
    backgroundColor: 'rgba(255,194,32,0.1)',
  },
  marbleCellName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: Colors.whiteAlpha50,
    marginTop: 4,
  },

  /* My marble card */
  myMarbleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,194,32,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,194,32,0.2)',
    borderRadius: BorderRadius.md,
    padding: 14,
    marginBottom: 8,
  },
  myMarbleLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: Colors.whiteAlpha40,
    letterSpacing: 0.5,
  },
  myMarbleName: {
    fontFamily: Fonts.display,
    fontSize: 16,
    color: Colors.yellow,
  },

  /* Draft order */
  draftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 1,
    borderColor: Colors.whiteAlpha10,
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
  },
  draftNum: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: Colors.whiteAlpha35,
    width: 20,
  },
  draftName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
    flex: 1,
  },
  draftPicking: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: Colors.yellow,
    letterSpacing: 0.5,
  },
  draftWaiting: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.whiteAlpha25,
  },

  /* Confirm button */
  confirmBtn: {
    backgroundColor: Colors.yellow,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  confirmBtnText: {
    fontFamily: Fonts.display,
    fontSize: 16,
    color: Colors.ink,
  },

  /* Race button */
  raceBtn: {
    backgroundColor: Colors.green,
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 12,
  },
  raceBtnText: {
    fontFamily: Fonts.display,
    fontSize: 16,
    color: Colors.white,
  },

  /* Leave button */
  leaveBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginTop: 12,
  },
  leaveBtnText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    letterSpacing: 0.5,
  },

  /* Result rows */
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  resultPos: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: Colors.whiteAlpha50,
    width: 30,
  },
  resultName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
  },

  /* Payout card */
  payoutCard: {
    backgroundColor: 'rgba(255,194,32,0.1)',
    borderRadius: BorderRadius.md,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
    width: '100%',
  },
  payoutLabel: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 10,
    color: Colors.whiteAlpha40,
    letterSpacing: 1,
  },
  payoutAmount: {
    fontFamily: Fonts.display,
    fontSize: 28,
    color: Colors.yellow,
    marginTop: 4,
  },

  /* Standing rows */
  standingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: Colors.whiteAlpha07,
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
  },
  standingPos: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: Colors.whiteAlpha50,
    width: 30,
  },
  standingName: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
    flex: 1,
  },
  standingPayout: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 12,
    color: Colors.yellow,
  },
});
