import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  Share,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Fonts, Spacing, BorderRadius, MARBLES } from '../theme';
import { useGameStore } from '../state/gameStore';
import BackButton from '../components/BackButton';
import CoinPill from '../components/CoinPill';
import MarbleDot from '../components/MarbleDot';
import MarbleStatsCard from '../components/MarbleStatsCard';
import { showModal } from '../components/GameModal';
import {
  LobbyData,
  LobbyPlayer,
  PayoutMode,
  PAYOUT_BREAKDOWNS,
  PAYOUT_MODE_META,
  computePool,
  MP_RAKE,
  subscribeLobby,
  quickMatch,
  createPrivateLobby,
  joinByCode,
  findAllOpenPublicLobbies,
  getQueueCounts,
  emptyQueueCounts,
  QueueCounts,
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
import { recordPlayedWith } from '../lib/mpFriends';

type Phase = 'pick_payout' | 'matching' | 'waiting' | 'drafting' | 'racing' | 'round_result' | 'finished' | 'submitting';

export default function MultiplayerLobbyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tier: string }>();
  const tier = (params.tier || 'daily') as 'daily' | 'weekly' | 'champion';

  const coins = useGameStore((s) => s.coins);
  const firebaseUid = useGameStore((s) => s.firebaseUid);
  const firebaseDisplayName = useGameStore((s) => s.firebaseDisplayName);
  const setMpLobbyId = useGameStore((s) => s.setMpLobbyId);
  const setMpResult = useGameStore((s) => s.setMpResult);

  // If the user is mid-tournament and just came back from a race, the store
  // still holds their lobbyId. In that case we resume the existing lobby
  // instead of showing the pick-payout screen and charging a new entry fee.
  const existingMpLobbyId = useGameStore.getState().mpLobbyId;
  const isResuming = !!existingMpLobbyId;

  const [lobbyId, setLobbyId] = useState<string | null>(existingMpLobbyId);
  const [lobby, setLobby] = useState<LobbyData | null>(null);

  // Auxiliary state for the new matchmaking entry points: lobby codes,
  // public browser, and live queue counts.
  const [queueCounts, setQueueCounts] = useState<QueueCounts>(emptyQueueCounts());
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseLobbies, setBrowseLobbies] = useState<{ lobbyId: string; lobby: LobbyData }[]>([]);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  // 'submitting' on resume — keep the user from seeing a 'RACE NOW' flash
  // while we send their round result to the server. The lobby-subscription
  // effect below will flip phase to 'round_result' once the server advances.
  const [phase, setPhase] = useState<Phase>(isResuming ? 'submitting' : 'pick_payout');
  const [payoutMode, setPayoutMode] = useState<PayoutMode>('standard');
  const [selectedMarble, setSelectedMarble] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(Math.ceil(AI_BACKFILL_DELAY_MS / 1000));
  const [matchingText, setMatchingText] = useState('Searching for opponents...');
  const backfillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Per-round submit guard. Without this, the racing-phase useEffect can
  // fire repeatedly off lobby snapshots and re-submit the same finish order.
  // Also lets us tell "fresh result from THIS round" apart from "stale result
  // from a previous quick-race that's still in the store".
  const submittedRoundRef = useRef<number>(-1);
  const expectingResultRef = useRef<boolean>(false);

  const uid = firebaseUid || 'local-player';
  const displayName = firebaseDisplayName || useGameStore.getState().playerName || 'Player';
  const tierConfig = MP_TIERS[tier];

  // ---------------------------------------------------------------------------
  // Live queue counts on the pick screen — refreshes every 8s so the tier
  // cards can show "3 queued" badges. Stops once we leave pick_payout.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'pick_payout') return;
    let cancelled = false;
    const refresh = () => {
      getQueueCounts().then(c => { if (!cancelled) setQueueCounts(c); }).catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, 8000);
    return () => { cancelled = true; clearInterval(id); };
  }, [phase]);

  // ---------------------------------------------------------------------------
  // Mount-time lastResult handling
  //
  // Two cases:
  //   1) Fresh entry (isResuming = false): user came in from main lobby. Clear
  //      any leftover lastResult from a prior quick race so it can't be picked
  //      up as a multiplayer round result.
  //   2) Resuming (isResuming = true): user just finished a multiplayer round
  //      race, hit BACK TO LOBBY on the results screen, and we landed here.
  //      lastResult holds the round's finish order — we MUST keep it so the
  //      "submit round result" effect below can fire. expectingResultRef is
  //      flipped on so the gate doesn't reject it.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isResuming) {
      const lr = useGameStore.getState().lastResult;
      if (lr && lr.positions.length > 0) {
        expectingResultRef.current = true;
      }
    } else {
      useGameStore.setState({ lastResult: null });
    }
  }, []);

  // Common pre-entry check + fee charge used by all entry paths.
  const chargeEntryFee = useCallback((): boolean => {
    const store = useGameStore.getState();
    if (store.coins < tierConfig.entryFee) {
      showModal({
        title: 'Not Enough Coins',
        message: `You need ${tierConfig.entryFee} coins to enter this tier.`,
        buttons: [
          { label: 'Coin Store', variant: 'yellow', onPress: () => router.replace('/store') },
          { label: 'Back', variant: 'ghost', onPress: () => router.back() },
        ],
      });
      return false;
    }
    store.removeCoins(tierConfig.entryFee);
    return true;
  }, [tierConfig.entryFee, router]);

  // ---------------------------------------------------------------------------
  // Create a PRIVATE lobby — generates a 6-char code that can be shared.
  // The lobby is excluded from quickMatch / public browser, so only people
  // who have the code can join.
  // ---------------------------------------------------------------------------
  const createPrivate = useCallback(async (mode: PayoutMode) => {
    if (!chargeEntryFee()) return;
    setPayoutMode(mode);
    setPhase('matching');
    try {
      const { lobbyId: id, code } = await createPrivateLobby(uid, displayName, tier, mode);
      setLobbyId(id);
      setMpLobbyId(id);
      setCreatedCode(code);
      setPhase('waiting');
    } catch (e: any) {
      useGameStore.getState().addCoins(tierConfig.entryFee);
      const msg = e?.message ?? 'Network error';
      showModal({
        title: 'Couldn’t Create Lobby',
        message: `${msg}\n\nEntry refunded.`,
        buttons: [{ label: 'OK', variant: 'yellow' }],
      });
      setPhase('pick_payout');
    }
  }, [chargeEntryFee, uid, displayName, tier, setMpLobbyId, tierConfig.entryFee]);

  // ---------------------------------------------------------------------------
  // Join a lobby by its 6-char code. Validates the code locally first (length,
  // alphabet), then hands off to joinByCode which scans recent lobbies.
  // ---------------------------------------------------------------------------
  const submitCode = useCallback(async () => {
    setCodeError(null);
    if (!chargeEntryFee()) {
      setCodeOpen(false);
      return;
    }
    setPhase('matching');
    setCodeOpen(false);
    const res = await joinByCode(codeInput, uid, displayName);
    if (!res.ok) {
      // Refund + surface the reason
      useGameStore.getState().addCoins(tierConfig.entryFee);
      setCodeError(res.reason);
      setCodeOpen(true);
      setPhase('pick_payout');
      return;
    }
    setLobbyId(res.lobbyId);
    setMpLobbyId(res.lobbyId);
    setCodeInput('');
    setPhase('waiting');
  }, [chargeEntryFee, codeInput, uid, displayName, setMpLobbyId, tierConfig.entryFee]);

  // ---------------------------------------------------------------------------
  // Open the public lobby browser
  // ---------------------------------------------------------------------------
  const openBrowse = useCallback(async () => {
    setBrowseOpen(true);
    try {
      const list = await findAllOpenPublicLobbies();
      // Hide lobbies for tiers the player can't afford so they don't tap
      // through to a refund flow.
      const affordable = list.filter(l => l.lobby.entryFee <= coins);
      setBrowseLobbies(affordable);
    } catch {
      setBrowseLobbies([]);
    }
  }, [coins]);

  // Join the specific lobby the user picked from the browser.
  const joinBrowseLobby = useCallback(async (target: { lobbyId: string; lobby: LobbyData }) => {
    setBrowseOpen(false);
    // Use that lobby's tier / mode for accounting, not the screen's current
    // tier — the user may be browsing across tiers from a Daily Blitz entry.
    const fee = target.lobby.entryFee;
    const store = useGameStore.getState();
    if (store.coins < fee) {
      showModal({
        title: 'Not Enough Coins',
        message: `You need ${fee} coins for this lobby.`,
        buttons: [{ label: 'OK', variant: 'yellow' }],
      });
      return;
    }
    store.removeCoins(fee);
    setPhase('matching');
    try {
      const { joinLobby } = await import('../lib/multiplayer');
      const joined = await joinLobby(target.lobbyId, uid, displayName);
      if (!joined) {
        store.addCoins(fee);
        showModal({
          title: 'Couldn’t Join',
          message: 'That lobby just filled or started. Try another.',
          buttons: [{ label: 'OK', variant: 'yellow' }],
        });
        setPhase('pick_payout');
        return;
      }
      setLobbyId(target.lobbyId);
      setMpLobbyId(target.lobbyId);
      setPayoutMode((target.lobby.payoutMode || 'standard') as PayoutMode);
      setPhase('waiting');
    } catch (e: any) {
      store.addCoins(fee);
      setPhase('pick_payout');
    }
  }, [uid, displayName, setMpLobbyId]);

  // Share the active lobby's invite code via the OS share sheet.
  const shareCode = useCallback(async () => {
    const code = createdCode || lobby?.code;
    if (!code) return;
    try {
      await Share.share({
        message: `Join my Donkey Marble Racing lobby — code: ${code}`,
      });
    } catch {
      /* user cancelled */
    }
  }, [createdCode, lobby?.code]);

  // ---------------------------------------------------------------------------
  // Start matchmaking with the player's chosen payout mode
  // ---------------------------------------------------------------------------
  const beginMatchmaking = useCallback(async (mode: PayoutMode) => {
    if (!chargeEntryFee()) return;
    setPayoutMode(mode);
    setPhase('matching');

    try {
      const id = await quickMatch(uid, displayName, tier, mode);
      setLobbyId(id);
      setMpLobbyId(id);
      setPhase('waiting');
    } catch (e: any) {
      // Refund and surface the actual error so we can diagnose. Common
      // causes: locked-down RTDB rules, missing index, Web SDK auth not
      // ready yet when the DB write fires.
      useGameStore.getState().addCoins(tierConfig.entryFee);
      const errMsg = e?.code
        ? `${e.code}: ${e.message ?? 'no detail'}`
        : (e?.message ?? String(e ?? 'unknown error'));
      console.warn('[Multiplayer] quickMatch failed:', errMsg, e);
      showModal({
        title: 'Multiplayer Unavailable',
        message: `Couldn't connect: ${errMsg}\n\nYour ${tierConfig.entryFee} coins were refunded.`,
        buttons: [
          { label: 'Retry', variant: 'yellow', onPress: () => setPhase('pick_payout') },
          { label: 'Back', variant: 'ghost', onPress: () => router.back() },
        ],
      });
      setPhase('pick_payout');
    }
  }, [tier, tierConfig.entryFee, uid, displayName, router, setMpLobbyId]);

  // Cycle the matching-phase status text so the screen feels alive while we
  // do the actual Firebase lookup. Roughly mirrors what a matchmaker would
  // show — "looking", "found a lobby", "loading". Stops once phase != matching.
  useEffect(() => {
    if (phase !== 'matching') return;
    const messages = [
      'Searching for opponents...',
      'Looking for active lobbies...',
      'Pinging server...',
      'Almost ready...',
    ];
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % messages.length;
      setMatchingText(messages[i]);
    }, 1400);
    return () => clearInterval(t);
  }, [phase]);

  // ---------------------------------------------------------------------------
  // Subscribe to lobby updates
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!lobbyId) return;

    // Safety net for a stale mpLobbyId (e.g. user closed the app mid-tournament
    // and the lobby has since expired on Firebase). If Firebase returns null
    // within ~3 seconds, clear the stored lobbyId and drop the user on the
    // pick-payout screen instead of leaving them stranded on a loading state.
    const staleGuard = setTimeout(() => {
      if (!lobby && isResuming) {
        useGameStore.getState().setMpLobbyId(null);
        useGameStore.setState({ lastResult: null });
        expectingResultRef.current = false;
        setLobbyId(null);
        setPhase('pick_payout');
      }
    }, 3000);

    const unsub = subscribeLobby(lobbyId, (data) => {
      setLobby(data);
      if (data) {
        clearTimeout(staleGuard);
        // Hold the 'submitting' phase while we're still expecting to send a
        // round result back. Once submitRoundResult fires, server flips
        // status to 'round_result' / 'finished' and we sync to that.
        if (expectingResultRef.current && data.status === 'racing') {
          setPhase('submitting');
        } else {
          setPhase(data.status === 'waiting' ? 'waiting' : data.status);
        }
      }
    });

    return () => {
      clearTimeout(staleGuard);
      unsub();
    };
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

    // Compute which marbles are still alive in the bracket. Eliminated
    // marbles MUST NOT race this round — previously the race screen
    // ignored the multiplayer mode entirely and raced all 8 marbles every
    // round, which is what produced the "all balls added back in round 5"
    // bug. Active players (not eliminated, marble drafted) → marble IDs.
    const survivingMarbleIds = Object.values(lobby.players || {})
      .filter((p) => !p.eliminated && p.marbleId)
      .map((p) => p.marbleId!)
      .filter((id): id is string => !!id);

    const store = useGameStore.getState();
    store.selectCourse(courseId);
    store.setActiveMode({
      type: 'multiplayer_tournament',
      lobbyId,
      round: lobby.currentRound,
    });
    store.setMpSurvivingMarbleIds(survivingMarbleIds);

    const marble = MARBLES.find((m) => m.id === myMarble);
    if (marble) store.selectMarble(marble);
    store.setBetAmount(0);

    // Arm the result-submit gate and wipe any stale lastResult so the
    // racing-phase useEffect only fires for THIS round's finish.
    useGameStore.setState({ lastResult: null });
    expectingResultRef.current = true;

    router.push('/race');
  }, [lobby, lobbyId, uid]);

  // ---------------------------------------------------------------------------
  // Handle race finish — host submits result.
  //
  // Only fires when:
  //   1. The host pressed RACE NOW for THIS round (expectingResultRef = true)
  //   2. We haven't already submitted this round (submittedRoundRef tracks it)
  //   3. lastResult is actually present
  //
  // Previously this fired on every 'racing' status snapshot, which meant a
  // stale lastResult from a prior quick race would auto-submit before the
  // player ever saw the race screen — user reported "picks marble, goes
  // straight to results, no game".
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!lobby || !lobbyId) return;
    if (lobby.status !== 'racing' || lobby.hostUid !== uid) return;
    if (!expectingResultRef.current) return;
    if (submittedRoundRef.current === lobby.currentRound) return;

    const lastResult = useGameStore.getState().lastResult;
    if (lastResult && lastResult.positions.length > 0) {
      submittedRoundRef.current = lobby.currentRound;
      expectingResultRef.current = false;
      const finishOrder = lastResult.positions.map((p) => p.marble.id);
      submitRoundResult(lobbyId, uid, finishOrder);
      // Clear so the next round can't accidentally re-use this finish order.
      useGameStore.setState({ lastResult: null });
    }
  }, [lobby?.status, lobby?.currentRound]);

  // ---------------------------------------------------------------------------
  // Handle tournament finished
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!lobby || lobby.status !== 'finished') return;

    const placement = getPlayerPlacement(lobby, uid);
    const payout = calculateMPPayout(lobby, placement);
    setMpResult(placement, payout);

    // Auto-record human opponents into the local friends list so they
    // appear on the user's "recently played with" screen next time. No
    // network — pure AsyncStorage on this device.
    const opponents = Object.values(lobby.players || {}).map((p) => ({
      uid: p.uid,
      displayName: p.displayName,
      isBot: !!p.isBot,
    }));
    recordPlayedWith(uid, opponents).catch(() => {});
  }, [lobby?.status]);

  // ---------------------------------------------------------------------------
  // Leave lobby
  //
  // Always routes EXPLICITLY to /lobby (main menu) rather than router.back().
  // After a multi-round race the back stack can be rewritten by the race +
  // results screens, so router.back() sometimes lands the user on a stale
  // queue / results page they thought they'd already left. router.replace
  // also nukes the back stack so the user can't accidentally re-enter the
  // dead lobby via the OS back button.
  // ---------------------------------------------------------------------------
  const handleLeave = useCallback(async () => {
    if (lobbyId) {
      await leaveLobby(lobbyId, uid);
      setMpLobbyId(null);
    }
    router.replace('/lobby');
  }, [lobbyId, uid, router, setMpLobbyId]);

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

  // Live pool — entry × paid-in players × (1 − rake). Shown in the header
  // so players watch it grow as humans join. Before matching exists, fall
  // back to "max possible pool" so the player knows what they're chasing.
  const paidInPlayers = players.filter(p => !p.isBot).length;
  const livePool = lobby
    ? computePool(lobby.entryFee, Math.max(paidInPlayers, 1))
    : 0;
  const maxPool = computePool(tierConfig.entryFee, 8);
  const myPlacement = myPlayer?.eliminated && myPlayer.eliminatedRound != null
    ? totalCount - myPlayer.eliminatedRound
    : null;
  const projectedPayout = lobby && myPlacement
    ? calculateMPPayout(lobby, myPlacement)
    : 0;

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
            {tierConfig.label} · Entry: {tierConfig.entryFee} · Max pool: {maxPool.toLocaleString()}
          </Text>

          {/* Live pool ticker — shown once a lobby exists. Pool grows as
              humans join the lobby. */}
          {lobby && phase !== 'pick_payout' && (
            <View style={styles.poolTicker}>
              <View>
                <Text style={styles.poolTickerLabel}>LIVE POOL</Text>
                <Text style={styles.poolTickerValue}>{livePool.toLocaleString()}</Text>
              </View>
              <View style={styles.poolTickerDivider} />
              <View>
                <Text style={styles.poolTickerLabel}>MODE</Text>
                <Text style={styles.poolTickerMode}>{PAYOUT_MODE_META[lobby.payoutMode || 'standard'].label}</Text>
              </View>
            </View>
          )}

          {/* How-it-works card — shown during pre-race phases so first-time
              players know what's coming. Hidden once racing starts. */}
          {(phase === 'matching' || phase === 'waiting' || phase === 'drafting') && (
            <View style={styles.howItWorksCard}>
              <Text style={styles.howItWorksTitle}>HOW IT WORKS</Text>
              <Text style={styles.howItWorksStep}>1. Lobby fills with 8 players. Empty slots are filled after 60s.</Text>
              <Text style={styles.howItWorksStep}>2. Snake draft: each player picks one marble.</Text>
              <Text style={styles.howItWorksStep}>3. All 8 marbles race together. Last place is eliminated each round.</Text>
              <Text style={styles.howItWorksStep}>4. Survive 7 rounds to win the prize pool.</Text>
            </View>
          )}

          {/* PHASE: Pick payout mode — first thing the player sees. They
              choose their risk profile, then matchmaking starts. */}
          {phase === 'pick_payout' && (
            <>
              <View style={styles.payoutPickerHeader}>
                <Text style={styles.payoutPickerTitle}>PICK YOUR STAKES</Text>
                <Text style={styles.payoutPickerSub}>
                  Pool grows as players join (max {maxPool.toLocaleString()} at full lobby).
                  Pick how the pot pays out.
                </Text>
              </View>

              {(['standard', 'winner_takes_all', 'survivors'] as PayoutMode[]).map((mode) => {
                const meta = PAYOUT_MODE_META[mode];
                const breakdown = PAYOUT_BREAKDOWNS[mode];
                const top = breakdown[0];
                const topPayout = Math.floor(maxPool * top.pct / 100);
                const queued = queueCounts[`${tier}-${mode}` as const] ?? 0;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => beginMatchmaking(mode)}
                    style={({ pressed }) => [
                      styles.payoutModeCard,
                      pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <View style={styles.payoutModeHeader}>
                      <Text style={styles.payoutModeLabel}>{meta.label}</Text>
                      <View style={styles.payoutModeRight}>
                        {queued > 0 && (
                          <View style={styles.queueBadge}>
                            <View style={styles.queueDot} />
                            <Text style={styles.queueBadgeText}>{queued} queued</Text>
                          </View>
                        )}
                        <Text style={styles.payoutModeTopPrize}>up to {topPayout.toLocaleString()}</Text>
                      </View>
                    </View>
                    <Text style={styles.payoutModeTagline}>{meta.tagline}</Text>
                    <View style={styles.payoutBreakdownRow}>
                      {breakdown.map((b, i) => (
                        <View key={i} style={styles.payoutBreakdownPill}>
                          <Text style={styles.payoutBreakdownPlace}>{b.placement}</Text>
                          <Text style={styles.payoutBreakdownPct}>{b.pct}%</Text>
                        </View>
                      ))}
                    </View>
                  </Pressable>
                );
              })}

              <Text style={styles.rakeFootnote}>
                {Math.round(MP_RAKE * 100)}% of each pot is held back by the house. The rest is paid out.
              </Text>

              {/* Alternate entry methods: enter a friend's code, browse
                  open lobbies, or create a private coded lobby. */}
              <Text style={[styles.payoutPickerTitle, { fontSize: 13, marginTop: 18, marginBottom: 8 }]}>
                OR PLAY WITH FRIENDS
              </Text>
              <View style={styles.altEntryRow}>
                <Pressable style={styles.altEntryBtn} onPress={() => { setCodeError(null); setCodeOpen(true); }}>
                  <Text style={styles.altEntryEmoji}>#</Text>
                  <Text style={styles.altEntryLabel}>ENTER CODE</Text>
                </Pressable>
                <Pressable style={styles.altEntryBtn} onPress={openBrowse}>
                  <Text style={styles.altEntryEmoji}>~</Text>
                  <Text style={styles.altEntryLabel}>BROWSE</Text>
                </Pressable>
              </View>
              <Pressable
                style={styles.privateBtn}
                onPress={() => {
                  showModal({
                    title: 'Pick a payout mode',
                    message: 'Your private lobby will use this payout mode. Friends who join with your code race under the same rules.',
                    buttons: [
                      { label: 'Standard', variant: 'yellow', onPress: () => createPrivate('standard') },
                      { label: 'Winner Takes All', variant: 'yellow', onPress: () => createPrivate('winner_takes_all') },
                      { label: 'Survivors', variant: 'yellow', onPress: () => createPrivate('survivors') },
                      { label: 'Cancel', variant: 'ghost' },
                    ],
                  });
                }}
              >
                <Text style={styles.privateBtnLabel}>CREATE PRIVATE LOBBY</Text>
                <Text style={styles.privateBtnSub}>Get a 6-character code to share</Text>
              </Pressable>

              {/* Friends list shortcut — recently played-with humans live
                  on a separate screen so the user can pin, remove, or
                  jump back here to invite them via a private code. */}
              <Pressable
                style={styles.friendsBtn}
                onPress={() => router.push('/friends')}
              >
                <Text style={styles.friendsBtnLabel}>FRIENDS LIST</Text>
                <Text style={styles.friendsBtnSub}>Recent multiplayer opponents</Text>
              </Pressable>
            </>
          )}

          {/* PHASE: Submitting result (only seen briefly after returning
              from a race finish). Holds the user on a clear loading state so
              they don't accidentally tap RACE NOW before the server has
              processed the round result. */}
          {phase === 'submitting' && (
            <View style={styles.centerCard}>
              <ActivityIndicator size="large" color={Colors.yellow} />
              <Text style={styles.statusTitle}>SUBMITTING RESULT</Text>
              <Text style={styles.centerText}>Recording your finish for this round…</Text>
            </View>
          )}

          {/* PHASE: Matching */}
          {phase === 'matching' && (
            <View style={styles.centerCard}>
              <ActivityIndicator size="large" color={Colors.yellow} />
              <Text style={styles.statusTitle}>MATCHING</Text>
              <Text style={styles.centerText}>{matchingText}</Text>
              <Text style={[styles.statusSub, { marginTop: 12 }]}>
                Tier: {tierConfig.label} · Entry: {tierConfig.entryFee}
              </Text>
            </View>
          )}

          {/* PHASE: Waiting for players */}
          {phase === 'waiting' && (
            <>
              {/* Invite-code card — only for private lobbies. Big readable
                  code + native share sheet so the host can invite friends. */}
              {(lobby?.isPrivate || createdCode) && (lobby?.code || createdCode) && (
                <View style={styles.codeCard}>
                  <Text style={styles.codeCardLabel}>INVITE CODE</Text>
                  <Text style={styles.codeCardValue}>{(lobby?.code || createdCode)}</Text>
                  <Pressable style={styles.codeShareBtn} onPress={shareCode}>
                    <Text style={styles.codeShareBtnText}>SHARE CODE</Text>
                  </Pressable>
                  <Text style={styles.codeCardHint}>
                    Friends tap ENTER CODE on the multiplayer screen and type this in.
                  </Text>
                </View>
              )}

              <View style={styles.centerCard}>
                <Text style={styles.statusTitle}>WAITING FOR PLAYERS</Text>
                <Text style={styles.statusSub}>
                  {humanCount} player{humanCount !== 1 ? 's' : ''} joined · {8 - totalCount} slots open
                </Text>
                <View style={styles.countdownRow}>
                  <Text style={styles.countdownText}>
                    Empty slots filled in {countdown}s
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
                      return (
                        <MarbleStatsCard
                          key={mId}
                          marble={marble}
                          selected={selectedMarble === mId}
                          onPress={() => setSelectedMarble(mId)}
                        />
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
                      {p.displayName} {draftUid === uid ? '(YOU)' : ''}
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
                  <View style={{ marginTop: 16, alignItems: 'center' }}>
                    <Text style={[styles.statusSub, { color: Colors.red }]}>
                      You were eliminated in Round {lobby.currentRound}
                    </Text>
                    <Text style={[styles.statusSub, { marginTop: 4, fontSize: 11 }]}>
                      The tournament continues without you. Your placement and
                      payout are locked in for the final standings.
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
                        {p.displayName} {p.uid === uid ? '(YOU)' : ''}
                      </Text>
                      <Text style={styles.standingPayout}>
                        +{calculateMPPayout(lobby, i + 1).toLocaleString()}
                      </Text>
                    </View>
                  ))}

                <Pressable
                  onPress={handleLeave}
                  style={[styles.raceBtn, { marginTop: 20 }]}
                >
                  <Text style={styles.raceBtnText}>MAIN MENU</Text>
                </Pressable>
                <Pressable
                  onPress={() => router.replace({ pathname: '/multiplayer-lobby', params: { tier } })}
                  style={[styles.raceBtnSecondary, { marginTop: 8 }]}
                >
                  <Text style={styles.raceBtnSecondaryText}>PLAY AGAIN</Text>
                </Pressable>
              </View>
            );
          })()}
        </ScrollView>
      </SafeAreaView>

      {/* ──── ENTER CODE modal ──────────────────────────────────────────── */}
      <Modal visible={codeOpen} transparent animationType="fade" onRequestClose={() => setCodeOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setCodeOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>ENTER LOBBY CODE</Text>
            <Text style={styles.modalSub}>Type the 6-character code your friend shared.</Text>
            <TextInput
              style={styles.codeInput}
              value={codeInput}
              onChangeText={(t) => setCodeInput(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="A1B2C3"
              placeholderTextColor={Colors.whiteAlpha40}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
            {codeError && <Text style={styles.codeError}>{codeError}</Text>}
            <View style={styles.modalBtnRow}>
              <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => { setCodeOpen(false); setCodeInput(''); setCodeError(null); }}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, codeInput.length === 6 ? styles.modalBtnYellow : styles.modalBtnDisabled]}
                onPress={() => { if (codeInput.length === 6) submitCode(); }}
              >
                <Text style={styles.modalBtnYellowText}>JOIN</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ──── BROWSE PUBLIC LOBBIES modal ────────────────────────────────── */}
      <Modal visible={browseOpen} transparent animationType="fade" onRequestClose={() => setBrowseOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setBrowseOpen(false)}>
          <Pressable style={[styles.modalCard, { maxHeight: '80%' }]} onPress={() => {}}>
            <Text style={styles.modalTitle}>OPEN LOBBIES</Text>
            <Text style={styles.modalSub}>
              Public lobbies waiting for players. Tap to join.
            </Text>
            <ScrollView style={{ maxHeight: 400, marginTop: 12 }}>
              {browseLobbies.length === 0 ? (
                <Text style={styles.browseEmpty}>
                  No open public lobbies right now. Try quick match or create a private lobby to start one.
                </Text>
              ) : (
                browseLobbies.map((entry) => {
                  const humans = Object.values(entry.lobby.players || {}).filter(p => !p.isBot).length;
                  const total = Object.keys(entry.lobby.players || {}).length;
                  const tierLabel = MP_TIERS[entry.lobby.tier]?.label || entry.lobby.tier;
                  const modeLabel = PAYOUT_MODE_META[(entry.lobby.payoutMode || 'standard') as PayoutMode].label;
                  return (
                    <Pressable
                      key={entry.lobbyId}
                      onPress={() => joinBrowseLobby(entry)}
                      style={({ pressed }) => [styles.browseRow, pressed && { opacity: 0.85 }]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.browseRowTier}>{tierLabel}</Text>
                        <Text style={styles.browseRowMode}>{modeLabel} · Entry {entry.lobby.entryFee}</Text>
                      </View>
                      <Text style={styles.browseRowCount}>{humans}/{total}{total < 8 ? `/${8}` : ''}</Text>
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
            <Pressable style={[styles.modalBtn, styles.modalBtnGhost, { marginTop: 12 }]} onPress={() => setBrowseOpen(false)}>
              <Text style={styles.modalBtnGhostText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  // === Payout picker ===
  payoutPickerHeader: {
    marginTop: 4,
    marginBottom: 14,
    alignItems: 'center',
  },
  payoutPickerTitle: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.yellow,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  payoutPickerSub: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha60,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 12,
  },
  payoutModeCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    borderColor: 'rgba(255,194,32,0.35)',
    borderRadius: BorderRadius.lg,
    padding: 14,
    marginBottom: 10,
  },
  payoutModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  payoutModeLabel: {
    fontFamily: Fonts.display,
    fontSize: 16,
    color: Colors.white,
    letterSpacing: 1,
  },
  payoutModeTopPrize: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.yellow,
  },
  payoutModeTagline: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha60,
    marginBottom: 10,
    lineHeight: 16,
  },
  payoutBreakdownRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  payoutBreakdownPill: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: BorderRadius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  payoutBreakdownPlace: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.whiteAlpha60,
    letterSpacing: 0.5,
  },
  payoutBreakdownPct: {
    fontFamily: Fonts.display,
    fontSize: 12,
    color: Colors.yellow,
  },
  rakeFootnote: {
    fontFamily: Fonts.body,
    fontSize: 10,
    color: Colors.whiteAlpha40,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },

  // === Queue badge + alt entry ===
  payoutModeRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  queueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(46,204,113,0.18)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  queueDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#2ecc71',
  },
  queueBadgeText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: '#2ecc71',
    letterSpacing: 0.5,
  },
  altEntryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  altEntryBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  altEntryEmoji: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.yellow,
  },
  altEntryLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: Colors.white,
    letterSpacing: 1,
  },
  privateBtn: {
    backgroundColor: 'rgba(155,89,182,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(155,89,182,0.5)',
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 6,
  },
  privateBtnLabel: {
    fontFamily: Fonts.display,
    fontSize: 15,
    color: '#c39bd3',
    letterSpacing: 1,
  },
  privateBtnSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha50,
    marginTop: 3,
  },
  friendsBtn: {
    backgroundColor: 'rgba(46,204,113,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(46,204,113,0.40)',
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  friendsBtnLabel: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: '#2ecc71',
    letterSpacing: 1.2,
  },
  friendsBtnSub: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha50,
    marginTop: 3,
  },

  // === Code card (visible in waiting phase for private lobbies) ===
  codeCard: {
    backgroundColor: 'rgba(255,194,32,0.10)',
    borderWidth: 2,
    borderColor: 'rgba(255,194,32,0.40)',
    borderRadius: BorderRadius.lg,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  codeCardLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 10,
    color: Colors.yellow,
    letterSpacing: 2,
    marginBottom: 6,
  },
  codeCardValue: {
    fontFamily: Fonts.display,
    fontSize: 36,
    color: Colors.white,
    letterSpacing: 6,
    marginBottom: 12,
  },
  codeShareBtn: {
    backgroundColor: Colors.yellow,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  codeShareBtnText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.ink,
    letterSpacing: 1,
  },
  codeCardHint: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha50,
    marginTop: 10,
    textAlign: 'center',
    paddingHorizontal: 6,
  },

  // === Modals (code entry + browser) ===
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: '#0a1a3a',
    borderWidth: 2,
    borderColor: 'rgba(255,194,32,0.4)',
    borderRadius: BorderRadius.lg,
    padding: 20,
  },
  modalTitle: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.yellow,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 6,
  },
  modalSub: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha60,
    textAlign: 'center',
    lineHeight: 17,
  },
  codeInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,194,32,0.5)',
    borderRadius: BorderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    fontFamily: Fonts.display,
    fontSize: 26,
    color: Colors.white,
    letterSpacing: 6,
    textAlign: 'center',
  },
  codeError: {
    fontFamily: Fonts.bodyBold,
    fontSize: 12,
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalBtnGhost: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  modalBtnGhostText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
    letterSpacing: 0.5,
  },
  modalBtnYellow: {
    backgroundColor: Colors.yellow,
  },
  modalBtnDisabled: {
    backgroundColor: 'rgba(255,194,32,0.25)',
  },
  modalBtnYellowText: {
    fontFamily: Fonts.display,
    fontSize: 14,
    color: Colors.ink,
    letterSpacing: 1,
  },
  browseEmpty: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.whiteAlpha50,
    textAlign: 'center',
    paddingVertical: 28,
    paddingHorizontal: 12,
    lineHeight: 17,
  },
  browseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 12,
  },
  browseRowTier: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
  },
  browseRowMode: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha50,
    marginTop: 2,
  },
  browseRowCount: {
    fontFamily: Fonts.display,
    fontSize: 18,
    color: Colors.yellow,
  },

  // === Live pool ticker ===
  poolTicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,194,32,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,194,32,0.3)',
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 14,
  },
  poolTickerLabel: {
    fontFamily: Fonts.bodyBold,
    fontSize: 9,
    color: Colors.whiteAlpha50,
    letterSpacing: 1,
    marginBottom: 2,
  },
  poolTickerValue: {
    fontFamily: Fonts.display,
    fontSize: 22,
    color: Colors.yellow,
  },
  poolTickerMode: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.white,
  },
  poolTickerDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  howItWorksCard: {
    backgroundColor: Colors.whiteAlpha07,
    borderWidth: 1,
    borderColor: Colors.yellowAlpha20,
    borderRadius: BorderRadius.md,
    padding: 12,
    marginBottom: 12,
  },
  howItWorksTitle: {
    fontFamily: Fonts.display,
    fontSize: 12,
    color: Colors.yellow,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  howItWorksStep: {
    fontFamily: Fonts.body,
    fontSize: 11,
    color: Colors.whiteAlpha60,
    lineHeight: 16,
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
    justifyContent: 'space-between',
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
  raceBtnSecondary: {
    backgroundColor: 'transparent',
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  raceBtnSecondaryText: {
    fontFamily: Fonts.bodyBold,
    fontSize: 13,
    color: Colors.whiteAlpha60,
    letterSpacing: 1,
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
