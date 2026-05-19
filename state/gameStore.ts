import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MARBLES, MarbleData } from '../theme';
import { XP_PER_LEVEL, PassTrack } from '../data/seasonPass';
import { ALL_COURSES as COURSES } from '../data/courses';
import {
  SeasonSchedule, SeasonWeek, SeasonRace,
  generateSeasonSchedule, advanceSchedule, isSeasonComplete,
  SEASON_POINTS,
} from '../data/seasonSchedule';
import {
  NATIONAL_EVENTS, NationalEventState,
  generateEventCourses, calculateNationalPayout, SERIES_POINTS,
  getETDateString,
} from '../data/nationalRaces';
import { syncRaceResult, syncPurchase } from '../lib/sync';
import { applyEconomyAction } from '../lib/economy';
import { getConfig, fetchRemoteConfig, loadCachedConfig } from '../lib/remoteConfig';
import { getPromoMultiplier } from '../lib/liveOps';
import { ACHIEVEMENTS, AchievementCheckState } from '../data/achievements';
import {
  ChallengeProgress, ChallengeCheckState,
  generateDailyChallenges, generateWeeklyChallenges, evaluateChallenge, getWeekStartDate,
} from '../data/challenges';

export type GameScreen = 'splash' | 'lobby' | 'season' | 'betting' | 'race' | 'results' | 'roster' | 'profile' | 'courses' | 'playoffs' | 'championship' | 'pass';

export type GameMode =
  | { type: 'quick_race' }
  | { type: 'bet' }
  | { type: 'season'; weekNumber: number; raceIndex: number }
  | { type: 'national_race'; eventId: string; multiplier: number; entryFee: number; seriesRaceIndex?: number }
  | { type: 'tournament'; tournamentId: string; round: number }
  | { type: 'playoff'; round: number }
  | { type: 'multiplayer_tournament'; lobbyId: string; round: number };

export interface RaceResult {
  positions: { marble: MarbleData; time: number }[];
  playerPick: MarbleData | null;
  betAmount: number;
  won: boolean; // mode-specific success (advanced/got payout) — drives Win/Loss screen choice
  payout: number;
  playerPlacement: number; // 1-indexed finish position, 0 if no pick
  // Strict 1st-place flag — true ONLY when player's pick finished 1st in the race.
  // Use this for: streak counting, server analytics, "YOU WON!" celebrations.
  // Distinct from `won` because tournament/playoff use "survived = won" semantics.
  playerWonRace: boolean;
}

export interface CoinTransaction {
  type: 'bet' | 'payout' | 'daily_bonus' | 'purchase';
  amount: number;
  description: string;
  timestamp: number;
}

// ── Season types ──

export interface SeasonStandingEntry {
  wins: number;
  losses: number;
  podiums: number;   // top 3 finishes
  points: number;    // cumulative from SEASON_POINTS
}

export interface SeasonBet {
  marbleId: string;
  betAmount: number;
  won: boolean;
  payout: number;
  placement: number;
}

// ── Marble stat growth (franchise season progression) ──

export interface SeasonMarbleStats {
  speed: number;   // growth overlay (0.0 to 3.0 max)
  power: number;
  bounce: number;
  luck: number;
}

const THEME_STAT_MAP: Record<string, keyof SeasonMarbleStats> = {
  meadow: 'speed', volcano: 'power', frozen: 'bounce', cyber: 'luck',
  beach: 'speed', forest: 'speed', desert: 'power', sunset: 'power',
  night: 'luck', candy: 'bounce', ocean: 'bounce', volcanic: 'power',
  neon: 'luck', snow: 'bounce',
};
const PLACEMENT_GROWTH = [0.30, 0.25, 0.22, 0.18, 0.15, 0.12, 0.08, 0.05];
const AI_GROWTH_RATIO = 0.7;
const SECONDARY_GROWTH_RATIO = 0.3;
const MAX_STAT_GROWTH = 3.0;

// ── KOTH Playoff types ──

export interface KOTHRound {
  courseId: string;
  finishOrder: string[];
  eliminatedMarbleId: string | null;
  lifeUsedByMarbleId: string | null;
}

const SEED_LIVES = [3, 2, 1, 0, 0, 0];

export interface PlayoffState {
  seeds: string[];                     // 6 marble IDs by seed
  lives: Record<string, number>;       // marble ID -> remaining lives
  rounds: KOTHRound[];
  currentRound: number;                // 0-indexed
  eliminatedIds: string[];
  status: 'active' | 'complete';
  championId: string | null;
}

// ── Marble Progression (franchise mode) ──

export interface TrainingSession {
  stat: keyof SeasonMarbleStats;
  cost: number;
  gain: number;
  weekNumber: number;
}

export interface SeasonState {
  seasonNumber: number;
  seasonMode: 'franchise' | 'bettor';
  seasonMarbleId: string | null;       // franchise mode only
  schedule: SeasonWeek[];
  standings: Record<string, SeasonStandingEntry>;
  completedRaceIds: string[];
  playerBets: Record<string, SeasonBet>;
  playoffs: PlayoffState | null;
  seasonHistory: { seasonNumber: number; championId: string; championName: string }[];
  seasonStats: Record<string, SeasonMarbleStats>;  // marble stat growth overlay
  // Marble Progression fields
  condition: Record<string, number>;       // marble ID → condition 0-100 (100=fresh)
  trainingHistory: TrainingSession[];      // all training sessions this season
  trainedThisWeek: boolean;               // can only train once between races
  rivalMarbleId: string | null;           // rival marble for bonus points
  rivalWins: number;                      // times player beat rival
  rivalLosses: number;                    // times rival beat player
}

// ── Tournament types ──

export interface TournamentRound {
  courseId: string;
  eliminatedMarbleId: string | null;
  finishOrder: string[];
}

export interface TournamentState {
  tournamentId: string;
  marbleIds: string[];
  playerPickId: string;
  rounds: TournamentRound[];
  currentRound: number;
  eliminatedIds: string[];
  status: 'active' | 'eliminated' | 'champion';
  entryFee: number;
  prizePool: number;
  roundPayouts: number[];   // payout per round [0..6], 0 = no payout
  totalEarned: number;      // cumulative coins earned so far
}

// Per-round payout schedules: rounds 1-3 free, round 4 = break even, escalates to champion
function getTournamentPayouts(): Record<string, number[]> {
  const cfg = getConfig();
  return {
    'daily-blitz':           [0, 0, 0, 50,  100,  250,  cfg.tournamentPrizes.daily],
    'weekly-cup':            [0, 0, 0, 250, 500,  1250, cfg.tournamentPrizes.weekly],
    'champion-invitational': [0, 0, 0, 500, 1000, 2500, cfg.tournamentPrizes.champion],
  };
}

function getDailyRewards(): number[] {
  return getConfig().dailyRewards;
}

// ── Coin Store ──

export interface CoinPack {
  id: string;
  coins: number;
  price: string;
  bonus: string | null;
  badge: string | null;
}

export const COIN_PACKS: CoinPack[] = [
  { id: 'starter',  coins: 1000,  price: '$0.99',  bonus: null,    badge: null },
  { id: 'popular',  coins: 6000,  price: '$4.99',  bonus: '+20%',  badge: 'MOST POPULAR' },
  { id: 'big',      coins: 15000, price: '$9.99',  bonus: '+50%',  badge: null },
  { id: 'whale',    coins: 40000, price: '$24.99', bonus: '+60%',  badge: 'BEST VALUE' },
];

function getMaxDailyPurchases(): number { return getConfig().maxDailyPurchases; }
function getMaxDailyCoins(): number { return getConfig().maxDailyCoins; }

interface GameState {
  // Auth
  firebaseUid: string | null;
  firebaseDisplayName: string | null;
  firebasePhotoURL: string | null;
  firebaseEmail: string | null;
  setFirebaseUser: (user: { uid: string; displayName: string | null; photoURL: string | null; email: string | null } | null) => void;

  // Navigation
  screen: GameScreen;
  setScreen: (screen: GameScreen) => void;

  // Economy
  coins: number;
  addCoins: (amount: number) => void;
  removeCoins: (amount: number) => void;
  resetCoins: () => void;
  coinHistory: CoinTransaction[];

  // Betting
  selectedMarble: MarbleData | null;
  betAmount: number;
  betsToday: number;
  lastBetDate: string;
  betType: 'win' | 'exacta' | 'trifecta';
  exactaPicks: MarbleData[]; // ordered picks for exacta (2) / trifecta (3)
  selectMarble: (marble: MarbleData) => void;
  setBetAmount: (amount: number) => void;
  setBetType: (type: 'win' | 'exacta' | 'trifecta') => void;
  setExactaPicks: (picks: MarbleData[]) => void;

  // Game Mode
  activeMode: GameMode;
  setActiveMode: (mode: GameMode) => void;

  // Race
  lastResult: RaceResult | null;
  setLastResult: (result: RaceResult) => void;

  // Player
  playerName: string;
  setPlayerName: (name: string) => void;

  /**
   * True after the user has completed (or skipped) the first-launch intro
   * race. Splash routes to /intro-pick when this is false and straight to
   * /lobby otherwise, so the marble-pick + tutorial race never re-runs.
   */
  hasSeenIntroRace: boolean;
  setHasSeenIntroRace: (v: boolean) => void;

  // Stats
  totalRaces: number;
  totalWins: number;
  currentStreak: number;
  marbleStats: Record<string, { wins: number; losses: number; betCount: number }>;

  // Season
  seasonWeek: number;
  seasonStandings: Record<string, { wins: number; losses: number }>;
  dailyStreak: number;
  bestStreak: number;
  lastPlayedDate: string | null;

  // Course
  selectedCourseId: string;
  selectCourse: (id: string) => void;

  // Race history (last 20 races for stats)
  raceHistory: { positions: string[] }[]; // marble IDs in finish order

  // Pass
  passLevel: number;
  passXp: number;
  passTrack: PassTrack;
  /**
   * Called by app/store.tsx after the store SDK has confirmed the purchase.
   * Receives the store-issued purchase token, which the server re-verifies
   * before granting the entitlement.
   */
  purchaseSeasonPass: (
    track: 'premium' | 'plus',
    purchaseToken: string,
    storeProductId: string,
  ) => Promise<{ success: boolean; error?: string }>;

  // Structured Season
  season: SeasonState | null;
  initSeason: (seasonNumber?: number, mode?: 'franchise' | 'bettor', marbleId?: string) => void;
  handleSeasonResult: (raceId: string, positions: string[]) => void;
  seedPlayoffs: () => void;
  handlePlayoffResult: (positions: string[]) => void;
  /** Skip the rest of the playoffs and auto-resolve a champion. Used when
   *  the player's marble has been eliminated and they don't want to watch
   *  every remaining round. Picks a random finish order each round and
   *  re-uses handlePlayoffResult so eliminations, lives, and the final
   *  payout all follow the normal rules. */
  simulateRemainingPlayoffs: () => void;
  // Marble Progression
  trainMarble: (stat: keyof SeasonMarbleStats) => { success: boolean; gain: number; cost: number };
  restMarble: (marbleId: string) => void;

  // National Races
  nationalRaces: Record<string, NationalEventState>;
  enterNationalRace: (eventId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  refreshNationalEvents: () => void;
  handleNationalRaceResult: (positions: string[]) => void;

  // Tournaments
  tournaments: TournamentState | null;
  enterTournament: (tournamentId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  handleTournamentResult: (positions: string[]) => void;

  // Multiplayer Tournaments
  mpLobbyId: string | null;
  mpPlacement: number | null;   // Final placement (1-8)
  mpPayout: number;
  /** Marble IDs of players still alive in the current MP round. Set by
   *  multiplayer-lobby when starting a round so the race engine only races
   *  the survivors — eliminated marbles must NOT come back. */
  mpSurvivingMarbleIds: string[];
  setMpSurvivingMarbleIds: (ids: string[]) => void;
  setMpLobbyId: (lobbyId: string | null) => void;
  setMpResult: (placement: number, payout: number) => void;

  // Store
  storePurchasesToday: number;
  storeCoinsPurchasedToday: number;
  storeLastPurchaseDate: string;
  /**
   * Called by app/store.tsx after the store SDK has confirmed the purchase.
   * Receives the store-issued purchase token, which the server re-verifies
   * before granting coins.
   */
  purchaseCoinPack: (
    packId: string,
    purchaseToken: string,
    storeProductId: string,
  ) => Promise<{ success: boolean; coins?: number; error?: string }>;

  // Odds
  getOdds: () => Record<string, number>;

  // Achievements & Skins
  achievements: Record<string, { unlockedAt: string }>;
  equippedSkins: Record<string, string>; // marbleId → skinId
  checkAchievements: () => string[];
  equipSkin: (marbleId: string, skinId: string) => void;
  unequipSkin: (marbleId: string) => void;

  // Custom Tracks
  customTracks: { seed: number; name: string; savedAt: string }[];
  saveCustomTrack: (seed: number, name: string) => void;
  removeCustomTrack: (seed: number) => void;

  // Challenges
  challenges: {
    daily: ChallengeProgress[];
    weekly: ChallengeProgress[];
    lastDailyReset: string;
    lastWeeklyReset: string;
  };
  checkChallenges: () => string[];
  refreshChallenges: () => void;
  claimChallengeReward: (challengeId: string) => void;

  // Actions
  placeBet: () => boolean;
  resetBet: () => void;
  /**
   * Optimistic check — returns null if already checked today, otherwise marks
   * today's date locally. The actual coin reward must be claimed via
   * `claimDailyBonus()` (server-authoritative).
   */
  checkDailyStreak: () => { reward: number; streak: number; pendingServer?: boolean } | null;
  /**
   * Server-authoritative daily bonus claim. Returns the granted reward and
   * new authoritative streak. Returns null if already claimed today or on
   * network failure.
   */
  claimDailyBonus: () => Promise<{ reward: number; streak: number } | null>;
}

// Generate odds with real spread based on weighted stats + season performance + random "form"
function calculateOdds(standings?: Record<string, { wins: number; losses: number }>): Record<string, number> {
  const entries = MARBLES.map((m) => {
    const base = m.stats.speed * 2.5 + m.stats.luck * 2 + m.stats.power + m.stats.bounce;
    // Factor in season performance if available
    let performanceBoost = 1;
    if (standings) {
      const record = standings[m.id];
      if (record && (record.wins + record.losses) > 0) {
        const winRate = record.wins / (record.wins + record.losses);
        performanceBoost = 0.8 + winRate * 0.4; // 0.8x to 1.2x based on win rate
      }
    }
    // "Form" shifts each marble's strength per session (0.5x - 1.5x)
    const form = 0.5 + Math.random();
    return { id: m.id, power: base * form * performanceBoost };
  });

  // Raise to 1.8 power to amplify differences into real odds spread
  const boosted = entries.map(e => ({ id: e.id, p: e.power ** 1.8 }));
  const total = boosted.reduce((s, e) => s + e.p, 0);

  const odds: Record<string, number> = {};
  boosted.forEach((e) => {
    const prob = e.p / total;
    const raw = (1 / prob) * 0.9; // 10% house edge
    odds[e.id] = Math.round(Math.max(1.5, Math.min(12, raw)) * 10) / 10;
  });
  return odds;
}

let currentOdds = calculateOdds();

// Initialize all marbles at 0-0
const initialStandings: Record<string, { wins: number; losses: number }> = {};
MARBLES.forEach((m) => {
  initialStandings[m.id] = { wins: 0, losses: 0 };
});

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
  // Auth
  firebaseUid: null,
  firebaseDisplayName: null,
  firebasePhotoURL: null,
  firebaseEmail: null,
  setFirebaseUser: (user) => {
    if (user) {
      set({
        firebaseUid: user.uid,
        firebaseDisplayName: user.displayName,
        firebasePhotoURL: user.photoURL,
        firebaseEmail: user.email,
      });
    } else {
      set({
        firebaseUid: null,
        firebaseDisplayName: null,
        firebasePhotoURL: null,
        firebaseEmail: null,
      });
    }
  },

  screen: 'splash',
  setScreen: (screen) => set({ screen }),

  playerName: '',
  setPlayerName: (name) => set({ playerName: name }),

  hasSeenIntroRace: false,
  setHasSeenIntroRace: (v) => set({ hasSeenIntroRace: v }),

  coins: 1000,
  addCoins: (amount) => set((s) => ({ coins: s.coins + amount })),
  removeCoins: (amount) => set((s) => ({ coins: Math.max(0, s.coins - amount) })),
  resetCoins: () => set({ coins: 1000 }),
  coinHistory: [],

  activeMode: { type: 'bet' } as GameMode,
  setActiveMode: (mode) => set({ activeMode: mode }),

  selectedMarble: null,
  betAmount: 100,
  betsToday: 0,
  lastBetDate: '',
  betType: 'win',
  exactaPicks: [],
  selectMarble: (marble) => set({ selectedMarble: marble }),
  setBetAmount: (amount) => set({ betAmount: amount }),
  setBetType: (type) => set({ betType: type, exactaPicks: [], selectedMarble: null }),
  setExactaPicks: (picks) => set({ exactaPicks: picks }),

  lastResult: null,
  setLastResult: (result) => {
    const { activeMode, seasonStandings, totalRaces, totalWins, currentStreak, bestStreak, passXp, passLevel, raceHistory, marbleStats, coinHistory } = get();

    const isQuickRace = activeMode.type === 'quick_race';

    // --- COMMON: race history (all modes) ---
    const newHistory = [...raceHistory, { positions: result.positions.map(p => p.marble.id) }];
    if (newHistory.length > 20) newHistory.shift();

    // --- COMMON: marble stats (all modes except quick race) ---
    const newMarbleStats = { ...marbleStats };
    if (!isQuickRace) {
      result.positions.forEach((pos, i) => {
        const prev = newMarbleStats[pos.marble.id] || { wins: 0, losses: 0, betCount: 0 };
        newMarbleStats[pos.marble.id] = {
          wins: i === 0 ? prev.wins + 1 : prev.wins,
          losses: i === 0 ? prev.losses : prev.losses + 1,
          betCount: prev.betCount,
        };
      });
      if (result.playerPick) {
        const prev = newMarbleStats[result.playerPick.id] || { wins: 0, losses: 0, betCount: 0 };
        newMarbleStats[result.playerPick.id] = { ...prev, betCount: prev.betCount + 1 };
      }
    }

    // --- COMMON: total races (all modes) ---
    const newTotalRaces = totalRaces + 1;

    // --- COMMON: Pass XP (50% for quick race, full for others) ---
    const MAX_PASS_LEVEL = 30;
    const xpGain = isQuickRace ? 125 : 250;
    const xpWinBonus = isQuickRace ? 0 : (result.won ? 500 : 0);
    let xp = passXp + xpGain + xpWinBonus;
    let lvl = passLevel;
    while (xp >= XP_PER_LEVEL && lvl < MAX_PASS_LEVEL) {
      xp -= XP_PER_LEVEL;
      lvl++;
    }
    if (lvl >= MAX_PASS_LEVEL) xp = Math.min(xp, XP_PER_LEVEL - 1); // cap at max

    // --- MODE-SPECIFIC ---
    let newStandings = seasonStandings;
    let newTotalWins = totalWins;
    let newStreak = currentStreak;
    let newBest = bestStreak;
    let newWeek = get().seasonWeek;
    const newCoinHistory = [...coinHistory];
    const positionIds = result.positions.map((p) => p.marble.id);

    if (!isQuickRace) {
      // Update global standings (bet, season, national, tournament, playoff)
      newStandings = { ...seasonStandings };
      result.positions.forEach((pos, i) => {
        const prev = newStandings[pos.marble.id] || { wins: 0, losses: 0 };
        newStandings[pos.marble.id] = i === 0
          ? { wins: prev.wins + 1, losses: prev.losses }
          : { wins: prev.wins, losses: prev.losses + 1 };
      });

      // Player win/loss streak — strict: only count actual 1st-place finishes,
      // not tournament survivals. Prevents inflated win counts in elimination modes.
      if (result.playerWonRace) {
        newTotalWins++;
        newStreak++;
        newBest = Math.max(newBest, newStreak);
      } else {
        newStreak = 0;
      }

      // Season week advances every 5 races
      newWeek = Math.min(12, Math.floor(newTotalRaces / 5) + 1);

      // Coin transaction ledger
      if (result.payout > 0) {
        const placeLabel = result.playerPlacement === 1 ? '1st' : result.playerPlacement === 2 ? '2nd' : '3rd';
        newCoinHistory.push({
          type: 'payout',
          amount: result.payout,
          description: `${placeLabel} place — ${result.playerPick?.name || 'marble'}`,
          timestamp: Date.now(),
        });
      }
      while (newCoinHistory.length > 200) newCoinHistory.shift();
    }

    // Atomic payout: add coins in same state update as result
    const newCoins = get().coins + (result.payout > 0 ? result.payout : 0);

    set({
      lastResult: result,
      coins: newCoins,
      seasonStandings: newStandings,
      marbleStats: newMarbleStats,
      raceHistory: newHistory,
      totalRaces: newTotalRaces,
      totalWins: newTotalWins,
      currentStreak: newStreak,
      bestStreak: newBest,
      passXp: xp,
      passLevel: lvl,
      seasonWeek: newWeek,
      coinHistory: newCoinHistory,
    });

    // --- Sync race to server (fire-and-forget); reconcile coins from server ---
    const course = COURSES.find(c => c.id === get().selectedCourseId);
    // Quick Race has no betting UI and shouldn't move coins. Force 0/0 here
    // so the global betAmount default (100) doesn't leak into the race record.
    // Server also enforces this as defense-in-depth.
    const syncBet = isQuickRace ? 0 : result.betAmount;
    const syncPayout = isQuickRace ? 0 : result.payout;
    syncRaceResult(
      {
        courseId: get().selectedCourseId,
        courseTheme: course?.theme ?? 'unknown',
        gameMode: activeMode.type,
        finishOrder: positionIds,
        playerPickId: result.playerPick?.id ?? null,
        betAmount: syncBet,
        payout: syncPayout,
        playerPlacement: result.playerPlacement,
        // Sync the strict 1st-place flag so server-side "wins" analytics aren't
        // inflated by tournament-round survivals.
        won: result.playerWonRace,
        odds: result.playerPick ? currentOdds[result.playerPick.id] : undefined,
        winnerTime: result.positions[0]?.time,
        modeContext: activeMode.type !== 'bet' && activeMode.type !== 'quick_race' ? activeMode : undefined,
      },
      (serverBalance) => {
        // Server is authoritative for the post-race coin balance.
        useGameStore.setState({ coins: serverBalance });
      },
    );

    // --- Mode-specific post-processing ---
    if (activeMode.type === 'season') {
      const raceId = `w${activeMode.weekNumber}-r${activeMode.raceIndex}`;
      get().handleSeasonResult(raceId, positionIds);
    } else if (activeMode.type === 'playoff') {
      get().handlePlayoffResult(positionIds);
    } else if (activeMode.type === 'national_race') {
      get().handleNationalRaceResult(positionIds);
    } else if (activeMode.type === 'tournament') {
      get().handleTournamentResult(positionIds);
    }

    // --- Post-race achievement & challenge checks ---
    setTimeout(() => {
      get().checkAchievements();
      get().checkChallenges();
    }, 0);
  },

  totalRaces: 0,
  totalWins: 0,
  currentStreak: 0,
  marbleStats: {},

  seasonWeek: 1,
  seasonStandings: { ...initialStandings },
  dailyStreak: 1,
  bestStreak: 0,
  lastPlayedDate: null,

  selectedCourseId: COURSES[0].id,
  selectCourse: (id) => set({ selectedCourseId: id }),
  raceHistory: [],

  passLevel: 1,
  passXp: 0,
  passTrack: 'free' as PassTrack,

  purchaseSeasonPass: async (track, purchaseToken, storeProductId) => {
    const { passTrack, coinHistory } = get();
    if (passTrack === 'plus') return { success: false, error: 'Already on Plus tier' };
    if (passTrack === track) return { success: false, error: 'Already own this pass' };

    const label = track === 'premium' ? 'Premium Pass' : 'Plus Pass';
    const price = track === 'premium' ? 9.99 : 24.99;

    if (!purchaseToken || !storeProductId) {
      if (__DEV__) console.warn('[purchaseSeasonPass] called without purchaseToken');
      return { success: false, error: 'Missing purchase token — purchase not verified' };
    }

    const syncResult = await syncPurchase({
      productId: storeProductId,
      purchaseToken,
    });
    if (!syncResult.ok) {
      if (__DEV__) console.warn('[purchaseSeasonPass] server rejected', syncResult.message);
      return { success: false, error: `Verification failed: ${syncResult.message}` };
    }

    const newCoinHistory = [...coinHistory, {
      type: 'purchase' as const,
      amount: 0,
      description: `Purchased ${label} ($${price})`,
      timestamp: Date.now(),
    }];
    while (newCoinHistory.length > 200) newCoinHistory.shift();

    set({ passTrack: track, coinHistory: newCoinHistory });
    return { success: true };
  },

  // ── Structured Season ──
  season: null,

  initSeason: (seasonNumber, mode, marbleId) => {
    const num = seasonNumber ?? ((get().season?.seasonNumber ?? 0) + 1);
    const schedule = generateSeasonSchedule(num);
    const standings: Record<string, SeasonStandingEntry> = {};
    const seasonStats: Record<string, SeasonMarbleStats> = {};
    MARBLES.forEach((m) => {
      standings[m.id] = { wins: 0, losses: 0, podiums: 0, points: 0 };
      seasonStats[m.id] = { speed: 0, power: 0, bounce: 0, luck: 0 };
    });
    // Initialize condition at 100% for all marbles
    const condition: Record<string, number> = {};
    MARBLES.forEach((m) => { condition[m.id] = 100; });

    // Pick a rival (franchise only) — pick a random marble that isn't the player's
    let rivalMarbleId: string | null = null;
    if ((mode ?? 'bettor') === 'franchise' && marbleId) {
      const otherIds = MARBLES.filter(m => m.id !== marbleId).map(m => m.id);
      rivalMarbleId = otherIds[Math.floor(Math.random() * otherIds.length)];
    }

    // Season starter bonus — returning players get coins for starting a new season
    // Season 1: no bonus (fresh start). Season 2+: 500 + 250 per season (caps at 2500)
    if (num >= 2) {
      const { coins, coinHistory } = get();
      const bonus = Math.min(2500, 500 + (num - 2) * 250);
      // Optimistic local credit so the season-hub UI shows the new balance
      // immediately. The server call below reconciles to the authoritative
      // value, and the natural idempotency key (season_starter:{playerId}:
      // {seasonNumber}) means it's safe to retry across cold starts.
      set({
        coins: coins + bonus,
        coinHistory: [
          { type: 'payout' as const, amount: bonus, description: `Season ${num} Starter Bonus`, timestamp: Date.now() },
          ...coinHistory,
        ].slice(0, 200),
      });

      applyEconomyAction({
        action: 'season_starter_bonus',
        payload: { seasonNumber: num },
        // Server constructs its own natural key from playerId + seasonNumber
        // so repeated invocations for the same season are de-duped without
        // the client needing to know its playerId. We pass a random UUID
        // here only as the transport-level idempotency hint for retries
        // within a single attempt; the server's natural key is the real
        // guard against multi-claim.
      }).then((res) => {
        if (res.ok) {
          useGameStore.setState({ coins: res.balance });
        } else if (__DEV__) {
          console.warn('[season_starter_bonus]', res.message);
        }
      });
    }

    set({
      season: {
        seasonNumber: num,
        seasonMode: mode ?? 'bettor',
        seasonMarbleId: marbleId ?? null,
        schedule: schedule.weeks,
        standings,
        completedRaceIds: [],
        playerBets: {},
        playoffs: null,
        seasonHistory: get().season?.seasonHistory ?? [],
        seasonStats,
        condition,
        trainingHistory: [],
        trainedThisWeek: false,
        rivalMarbleId,
        rivalWins: 0,
        rivalLosses: 0,
      },
    });
  },

  handleSeasonResult: (raceId, positions) => {
    const { season } = get();
    if (!season) return;

    // 1. Mark race as completed + record positions
    const updatedWeeks = season.schedule.map((w) => ({
      ...w,
      races: w.races.map((r) => {
        if (r.id !== raceId) return r;
        return { ...r, status: 'completed' as const, winnerId: positions[0], positions };
      }),
    }));

    // 2. Update standings with points
    const newStandings = { ...season.standings };
    positions.forEach((marbleId, i) => {
      const prev = newStandings[marbleId] || { wins: 0, losses: 0, podiums: 0, points: 0 };
      newStandings[marbleId] = {
        wins: i === 0 ? prev.wins + 1 : prev.wins,
        losses: i === 0 ? prev.losses : prev.losses + 1,
        podiums: i < 3 ? prev.podiums + 1 : prev.podiums,
        points: prev.points + (SEASON_POINTS[i] ?? 0),
      };
    });

    // 3. Record player's result for this race
    const { lastResult } = get();
    const newPlayerBets = { ...season.playerBets };
    if (season.seasonMode === 'franchise' && season.seasonMarbleId) {
      // Franchise mode: track the season marble's placement automatically
      const pickId = season.seasonMarbleId;
      const placement = positions.indexOf(pickId) + 1;
      newPlayerBets[raceId] = {
        marbleId: pickId,
        betAmount: lastResult?.betAmount ?? 0,
        won: placement <= 3,
        payout: lastResult?.payout ?? 0,
        placement,
      };
    } else if (lastResult?.playerPick) {
      // Bettor mode: track the player's per-race pick
      const pickId = lastResult.playerPick.id;
      const placement = positions.indexOf(pickId) + 1;
      newPlayerBets[raceId] = {
        marbleId: pickId,
        betAmount: lastResult.betAmount,
        won: lastResult.won,
        payout: lastResult.payout,
        placement,
      };
    }

    // 4. Apply stat growth
    const race = season.schedule.flatMap(w => w.races).find(r => r.id === raceId);
    const course = race ? COURSES.find(c => c.id === race.courseId) : null;
    const courseTheme = course?.theme ?? 'meadow';
    const primaryStat = THEME_STAT_MAP[courseTheme] ?? 'speed';

    const newSeasonStats = { ...season.seasonStats };
    positions.forEach((marbleId, idx) => {
      const isPlayerMarble = marbleId === season.seasonMarbleId;
      const baseGrowth = PLACEMENT_GROWTH[idx] ?? 0.05;
      const growthMultiplier = isPlayerMarble ? 1.0 : AI_GROWTH_RATIO;
      const jitter = isPlayerMarble ? 0 : (Math.random() - 0.5) * 0.06;
      const primaryGrowth = Math.max(0, baseGrowth * growthMultiplier + jitter);
      const secondaryGrowth = primaryGrowth * SECONDARY_GROWTH_RATIO;

      const allStats: (keyof SeasonMarbleStats)[] = ['speed', 'power', 'bounce', 'luck'];
      const secondaryOptions = allStats.filter(s => s !== primaryStat);
      const secondaryStat = secondaryOptions[Math.floor(Math.random() * secondaryOptions.length)];

      const prev = newSeasonStats[marbleId] ?? { speed: 0, power: 0, bounce: 0, luck: 0 };
      newSeasonStats[marbleId] = {
        ...prev,
        [primaryStat]: Math.min(MAX_STAT_GROWTH, prev[primaryStat] + primaryGrowth),
        [secondaryStat]: Math.min(MAX_STAT_GROWTH, prev[secondaryStat] + secondaryGrowth),
      };
    });

    // 5. Update condition (fatigue) — each race costs 10-20% based on placement
    const newCondition = { ...(season.condition ?? {}) };
    positions.forEach((marbleId, idx) => {
      const fatigueCost = 10 + Math.floor((idx / 7) * 10); // 10% for 1st, ~20% for 8th
      const prev = newCondition[marbleId] ?? 100;
      newCondition[marbleId] = Math.max(0, prev - fatigueCost);
    });

    // 6. Track rival results
    let rivalWins = season.rivalWins ?? 0;
    let rivalLosses = season.rivalLosses ?? 0;
    if (season.seasonMode === 'franchise' && season.rivalMarbleId && season.seasonMarbleId) {
      const playerPos = positions.indexOf(season.seasonMarbleId);
      const rivalPos = positions.indexOf(season.rivalMarbleId);
      if (playerPos >= 0 && rivalPos >= 0) {
        if (playerPos < rivalPos) rivalWins++;
        else rivalLosses++;
      }
    }

    // 7. Advance schedule (unlock next race / next week)
    const advanced = advanceSchedule(updatedWeeks);

    set({
      season: {
        ...season,
        schedule: advanced,
        standings: newStandings,
        completedRaceIds: [...season.completedRaceIds, raceId],
        playerBets: newPlayerBets,
        seasonStats: newSeasonStats,
        condition: newCondition,
        trainedThisWeek: false, // Reset training flag for new week
        rivalWins,
        rivalLosses,
      },
    });
  },

  trainMarble: (stat) => {
    // TODO(economy): this deducts coins LOCALLY only — server isn't told.
    // Wire to applyEconomyAction('train_marble', { stat }) once that server
    // action exists. Until then, franchise-mode training drift is recovered
    // by the periodic local↔server coin reconciliation in lobby.tsx (which
    // pulls server↑ when server > local, so the server's authoritative
    // lower-by-training balance eventually wins out).
    const { season, coins } = get();
    if (!season || season.seasonMode !== 'franchise' || !season.seasonMarbleId) {
      return { success: false, gain: 0, cost: 0 };
    }
    if (season.trainedThisWeek) {
      return { success: false, gain: 0, cost: 0 };
    }
    // Cost escalates: 200 for first, +100 each
    const sessionCount = season.trainingHistory.length;
    const cost = 200 + sessionCount * 100;
    if (coins < cost) {
      return { success: false, gain: 0, cost };
    }
    // Gain is randomized: 0.10 to 0.30
    const gain = +(0.10 + Math.random() * 0.20).toFixed(2);
    const marbleId = season.seasonMarbleId;
    const prev = season.seasonStats[marbleId] ?? { speed: 0, power: 0, bounce: 0, luck: 0 };
    const newVal = Math.min(MAX_STAT_GROWTH, prev[stat] + gain);

    const currentWeek = season.schedule.findIndex(w => w.status === 'current') + 1;
    const session: TrainingSession = { stat, cost, gain, weekNumber: currentWeek };

    set({
      coins: coins - cost,
      season: {
        ...season,
        seasonStats: {
          ...season.seasonStats,
          [marbleId]: { ...prev, [stat]: newVal },
        },
        trainingHistory: [...season.trainingHistory, session],
        trainedThisWeek: true,
      },
    });
    return { success: true, gain, cost };
  },

  restMarble: (marbleId) => {
    const { season } = get();
    if (!season) return;
    const newCondition = { ...(season.condition ?? {}) };
    const prev = newCondition[marbleId] ?? 50;
    newCondition[marbleId] = Math.min(100, prev + 30); // Rest recovers 30%
    set({ season: { ...season, condition: newCondition } });
  },

  seedPlayoffs: () => {
    const { season } = get();
    if (!season) return;

    // Top 6 marbles by points
    const sorted = Object.entries(season.standings)
      .sort(([, a], [, b]) => b.points - a.points || b.wins - a.wins)
      .map(([id]) => id);
    const seeds = sorted.slice(0, 6);

    // Assign lives based on seed
    const lives: Record<string, number> = {};
    seeds.forEach((id, i) => {
      lives[id] = SEED_LIVES[i];
    });

    const playoffs: PlayoffState = {
      seeds,
      lives,
      rounds: [],
      currentRound: 0,
      eliminatedIds: [],
      status: 'active',
      championId: null,
    };

    set({
      season: { ...season, playoffs },
    });
  },

  handlePlayoffResult: (positions) => {
    const { season } = get();
    if (!season?.playoffs || season.playoffs.status === 'complete') return;
    const playoffs = JSON.parse(JSON.stringify(season.playoffs)) as PlayoffState;

    // Find last place among remaining marbles
    const remainingIds = playoffs.seeds.filter(id => !playoffs.eliminatedIds.includes(id));
    let lastPlaceId = '';
    for (let i = positions.length - 1; i >= 0; i--) {
      if (remainingIds.includes(positions[i])) {
        lastPlaceId = positions[i];
        break;
      }
    }

    let eliminatedId: string | null = null;
    let lifeUsedId: string | null = null;

    if (lastPlaceId) {
      const livesRemaining = playoffs.lives[lastPlaceId] ?? 0;
      if (livesRemaining > 0) {
        // Saved by a life!
        playoffs.lives[lastPlaceId] = livesRemaining - 1;
        lifeUsedId = lastPlaceId;
      } else {
        // Eliminated
        playoffs.eliminatedIds.push(lastPlaceId);
        eliminatedId = lastPlaceId;
      }
    }

    playoffs.rounds.push({
      courseId: get().selectedCourseId,
      finishOrder: positions,
      eliminatedMarbleId: eliminatedId,
      lifeUsedByMarbleId: lifeUsedId,
    });
    playoffs.currentRound = playoffs.rounds.length;

    // Check for champion: only 1 marble left
    const stillAlive = playoffs.seeds.filter(id => !playoffs.eliminatedIds.includes(id));
    if (stillAlive.length === 1) {
      playoffs.status = 'complete';
      playoffs.championId = stillAlive[0];
      const champion = MARBLES.find(m => m.id === stillAlive[0]);

      // --- Playoff placement rewards ---
      // Franchise: reward based on player marble's final placement
      // Bettor: flat completion bonus for finishing the season
      const playerMarbleId = season.seasonMarbleId;
      const isFranchise = season.seasonMode === 'franchise';
      let playoffPayout = 0;
      let playoffDesc = '';

      if (isFranchise && playerMarbleId) {
        // Determine player's final placement (1st = champion, 2nd = last eliminated, etc.)
        // allEliminated[0] is the first marble out (worst rank).
        // allEliminated[N-1] is the last marble eliminated before the champion = runner-up (2nd).
        // Placement formula: N - index + 1 → first_out maps to (N+1) (worst), last_out maps to 2 (runner-up).
        const allEliminated = [...playoffs.eliminatedIds];
        const placement = playerMarbleId === stillAlive[0]
          ? 1
          : allEliminated.length - allEliminated.indexOf(playerMarbleId) + 1;

        // Reward tiers: 1st=5000, 2nd=2500, 3rd=1000
        if (placement === 1) { playoffPayout = 5000; playoffDesc = 'Playoff Champion'; }
        else if (placement === 2) { playoffPayout = 2500; playoffDesc = 'Playoff Runner-Up'; }
        else if (placement === 3) { playoffPayout = 1000; playoffDesc = 'Playoff Top 3'; }
      } else {
        // Bettor mode: flat 1,500 coin bonus for completing the full season.
        // Bumped from 500 — bettor mode players were essentially shut out of
        // any season-end reward because they don't have a single marble to
        // place in the top 3. 1,500 sits between franchise's 2nd-place (2,500)
        // and 3rd-place (1,000) rewards so it feels like a legitimate finish
        // bonus rather than a participation trophy.
        playoffPayout = 1500;
        playoffDesc = 'Season Complete';
      }

      const { coins, coinHistory } = get();
      if (playoffPayout > 0) {
        // Fire server-authoritative payout; reconcile balance on response.
        applyEconomyAction({
          action: 'playoff_payout',
          payload: { amount: playoffPayout, description: playoffDesc },
        }).then((res) => {
          if (res.ok) {
            useGameStore.setState({ coins: res.balance });
          } else if (__DEV__) {
            console.warn('[playoff_payout]', res.message);
          }
        });
      }
      set({
        coins: coins + playoffPayout,
        coinHistory: playoffPayout > 0 ? [
          { type: 'payout' as const, amount: playoffPayout, description: playoffDesc, timestamp: Date.now() },
          ...coinHistory,
        ].slice(0, 200) : coinHistory,
        season: {
          ...season,
          playoffs,
          seasonHistory: [
            ...season.seasonHistory,
            {
              seasonNumber: season.seasonNumber,
              championId: stillAlive[0],
              championName: champion?.name ?? stillAlive[0],
            },
          ],
        },
      });
      return;
    }

    set({ season: { ...season, playoffs } });
  },

  simulateRemainingPlayoffs: () => {
    // Safety cap so a degenerate state can't infinite-loop here. 16 rounds
    // is more than enough for any reasonable playoff size.
    for (let i = 0; i < 16; i++) {
      const { season } = get();
      const playoffs = season?.playoffs;
      if (!playoffs || playoffs.status === 'complete') return;

      const remaining = playoffs.seeds.filter(id => !playoffs.eliminatedIds.includes(id));
      if (remaining.length <= 1) return;

      // Random finish order among remaining marbles. handlePlayoffResult
      // honors the "lives" system and may save the last-place marble if
      // it still has a life, so we don't need to special-case anything.
      const order = [...remaining].sort(() => Math.random() - 0.5);
      get().handlePlayoffResult(order);
    }
  },

  // ── National Races ──
  nationalRaces: {} as Record<string, NationalEventState>,

  refreshNationalEvents: () => {
    const courseMap = generateEventCourses();
    const current = get().nationalRaces ?? {};
    const updated: Record<string, NationalEventState> = {};
    NATIONAL_EVENTS.forEach((event) => {
      const existing = current[event.id];
      // Keep state if already entered
      if (existing?.entered) {
        updated[event.id] = existing;
      } else {
        updated[event.id] = {
          courseIds: courseMap[event.id],
          entered: false,
          completedDate: existing?.completedDate ?? null,
          seriesProgress: null,
        };
      }
    });
    set({ nationalRaces: updated });
  },

  enterNationalRace: async (eventId) => {
    const event = NATIONAL_EVENTS.find((e) => e.id === eventId);
    if (!event) return { ok: false, reason: 'Unknown event.' };
    const { coins, nationalRaces: nr, coinHistory } = get();
    const nationalRaces = nr ?? {};
    if (coins < event.entryFee) return { ok: false, reason: `Need ${event.entryFee} coins, you have ${coins}.` };

    const state = nationalRaces[eventId];
    if (!state) return { ok: false, reason: 'Event not loaded — try again.' };
    if (state.entered) return { ok: false, reason: 'Already entered this event today.' };

    // Try the server first for cross-device sync, but fall back to a local
    // deduction if the server is unreachable or returns 5xx — the user
    // shouldn't be locked out of single-device play when the backend hiccups.
    // We still block on 401 so signed-out devices can't desync the economy.
    const res = await applyEconomyAction({
      action: 'national_entry',
      payload: { eventId },
    });

    let newBalance: number;
    if (res.ok) {
      newBalance = res.balance;
    } else {
      if (__DEV__) console.warn('[enterNationalRace] server failed, local fallback', res.status, res.message);
      newBalance = coins - event.entryFee;
    }

    const newCoinHistory = [...coinHistory, {
      type: 'bet' as const,
      amount: -event.entryFee,
      description: `Entered ${event.name}`,
      timestamp: Date.now(),
    }];
    while (newCoinHistory.length > 200) newCoinHistory.shift();

    set({
      coins: newBalance,
      nationalRaces: {
        ...nationalRaces,
        [eventId]: {
          ...state,
          entered: true,
          seriesProgress: event.format === 'series' ? {
            racesCompleted: 0,
            marblePoints: {},
            playerPick: null,
          } : null,
        },
      },
      coinHistory: newCoinHistory,
    });
    return { ok: true };
  },

  handleNationalRaceResult: (positions) => {
    const { activeMode, nationalRaces: nr, coins, coinHistory } = get();
    const nationalRaces = nr ?? {};
    if (activeMode.type !== 'national_race') return;

    const event = NATIONAL_EVENTS.find((e) => e.id === activeMode.eventId);
    if (!event) return;

    const state = nationalRaces[activeMode.eventId];
    if (!state) return;

    if (event.format === 'single') {
      // Single race: pay out based on player's marble placement
      const playerMarble = get().selectedMarble;
      if (playerMarble) {
        const placement = positions.indexOf(playerMarble.id);
        const payout = calculateNationalPayout(placement, event.entryFee, event.multiplier);

        if (payout > 0) {
          const newCoinHistory = [...coinHistory, {
            type: 'payout' as const,
            amount: payout,
            description: `${event.name} - ${placement === 0 ? '1st' : placement === 1 ? '2nd' : '3rd'} place`,
            timestamp: Date.now(),
          }];
          while (newCoinHistory.length > 200) newCoinHistory.shift();
          set({ coins: coins + payout, coinHistory: newCoinHistory });

          // Fire server-authoritative payout; reconcile balance on response.
          // `placement` is 0-indexed locally but the server expects 1-indexed.
          applyEconomyAction({
            action: 'national_payout',
            payload: { eventId: event.id, placement: placement + 1 },
          }).then((res) => {
            if (res.ok) {
              useGameStore.setState({ coins: res.balance });
            } else if (__DEV__) {
              console.warn('[national_payout single]', res.message);
            }
          });
        }
      }

      // Mark completed for today, reset entered
      set({
        nationalRaces: {
          ...nationalRaces,
          [activeMode.eventId]: { ...state, entered: false, seriesProgress: null, completedDate: getETDateString() },
        },
      });
    } else if (event.format === 'series' && state.seriesProgress) {
      // Grand Prix series: accumulate points
      const progress = { ...state.seriesProgress };
      const pts = { ...progress.marblePoints };
      positions.forEach((marbleId, i) => {
        pts[marbleId] = (pts[marbleId] || 0) + (SERIES_POINTS[i] ?? 0);
      });
      progress.marblePoints = pts;
      progress.racesCompleted++;

      if (progress.racesCompleted >= event.seriesLength) {
        // Series complete — find winner and pay out
        const seriesWinnerId = Object.entries(pts).sort(([, a], [, b]) => b - a)[0]?.[0];
        const playerPick = progress.playerPick;
        if (playerPick && seriesWinnerId === playerPick) {
          const payout = Math.round(event.entryFee * event.multiplier);
          const newCoinHistory = [...coinHistory, {
            type: 'payout' as const,
            amount: payout,
            description: `${event.name} series winner!`,
            timestamp: Date.now(),
          }];
          while (newCoinHistory.length > 200) newCoinHistory.shift();
          set({ coins: coins + payout, coinHistory: newCoinHistory });

          // Server-authoritative series-winner payout: placement 1 (1st).
          applyEconomyAction({
            action: 'national_payout',
            payload: { eventId: event.id, placement: 1 },
          }).then((res) => {
            if (res.ok) {
              useGameStore.setState({ coins: res.balance });
            } else if (__DEV__) {
              console.warn('[national_payout series]', res.message);
            }
          });
        }

        // Mark completed for today, reset
        set({
          nationalRaces: {
            ...nationalRaces,
            [activeMode.eventId]: { ...state, entered: false, seriesProgress: null, completedDate: getETDateString() },
          },
        });
      } else {
        // More races in series
        set({
          nationalRaces: {
            ...nationalRaces,
            [activeMode.eventId]: { ...state, seriesProgress: progress },
          },
        });
      }
    }
  },

  // ── Tournaments ──
  tournaments: null,

  // Multiplayer Tournaments
  mpLobbyId: null,
  mpPlacement: null,
  mpPayout: 0,
  mpSurvivingMarbleIds: [],
  setMpSurvivingMarbleIds: (ids) => set({ mpSurvivingMarbleIds: ids }),
  setMpLobbyId: (lobbyId) => set({ mpLobbyId: lobbyId }),
  setMpResult: (placement, payout) => {
    const { coins, coinHistory, mpLobbyId } = get();
    if (payout > 0) {
      // Optimistic local credit so the FINISHED screen shows the new
      // balance immediately. The server payout below reconciles to the
      // authoritative balance if it returns ok.
      set({
        mpPlacement: placement,
        mpPayout: payout,
        coins: coins + payout,
        coinHistory: [
          { type: 'payout' as const, amount: payout, description: `MP Tournament ${placement === 1 ? 'Champion' : `#${placement}`}`, timestamp: Date.now() },
          ...coinHistory,
        ].slice(0, 200),
      });

      // Fire server-authoritative payout. Same pattern as tournament /
      // playoff / national: send the action, snap to res.balance on
      // success, leave the optimistic credit in place on failure. This
      // is what makes the MP win survive cross-device account access —
      // without it, an MP win lived only on the device that earned it.
      applyEconomyAction({
        action: 'mp_payout',
        payload: { lobbyId: mpLobbyId, placement, amount: payout },
      }).then((res) => {
        if (res.ok) {
          useGameStore.setState({ coins: res.balance });
        } else if (__DEV__) {
          console.warn('[mp_payout]', res.message);
        }
      });
    } else {
      set({ mpPlacement: placement, mpPayout: payout });
    }
  },

  enterTournament: async (tournamentId) => {
    const { coins, coinHistory } = get();
    const configs: Record<string, { entryFee: number; prizePool: number }> = {
      'daily-blitz': { entryFee: 100, prizePool: 5000 },
      'weekly-cup': { entryFee: 500, prizePool: 25000 },
      'champion-invitational': { entryFee: 1000, prizePool: 50000 },
    };
    const config = configs[tournamentId];
    if (!config) return { ok: false, reason: 'Unknown tournament.' };
    if (coins < config.entryFee) return { ok: false, reason: `Need ${config.entryFee} coins, you have ${coins}.` };

    // Try the server first, fall back to local deduction on network/5xx so
    // tournaments stay playable when the backend hiccups.
    const res = await applyEconomyAction({
      action: 'tournament_entry',
      payload: { tournamentId },
    });

    let newBalance: number;
    if (res.ok) {
      newBalance = res.balance;
    } else {
      if (__DEV__) console.warn('[enterTournament] server failed, local fallback', res.status, res.message);
      newBalance = coins - config.entryFee;
    }

    // Shuffle marbles (Fisher-Yates)
    const marbleIds = MARBLES.map(m => m.id);
    for (let i = marbleIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [marbleIds[i], marbleIds[j]] = [marbleIds[j], marbleIds[i]];
    }

    // Pick 7 random courses (one per round)
    const coursePool = [...COURSES];
    for (let i = coursePool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [coursePool[i], coursePool[j]] = [coursePool[j], coursePool[i]];
    }

    const rounds: TournamentRound[] = [];
    for (let i = 0; i < 7; i++) {
      rounds.push({ courseId: coursePool[i].id, eliminatedMarbleId: null, finishOrder: [] });
    }

    const newCoinHistory = [...coinHistory, {
      type: 'bet' as const,
      amount: -config.entryFee,
      description: `Entered tournament: ${tournamentId}`,
      timestamp: Date.now(),
    }];
    while (newCoinHistory.length > 200) newCoinHistory.shift();

    set({
      coins: newBalance,
      coinHistory: newCoinHistory,
      tournaments: {
        tournamentId,
        marbleIds,
        playerPickId: '',
        rounds,
        currentRound: 0,
        eliminatedIds: [],
        status: 'active',
        entryFee: config.entryFee,
        prizePool: config.prizePool,
        roundPayouts: getTournamentPayouts()[tournamentId] || [0, 0, 0, 0, 0, 0, 0],
        totalEarned: 0,
      },
    });
    return { ok: true };
  },

  handleTournamentResult: (positions) => {
    const { activeMode, tournaments, coins, coinHistory } = get();
    if (activeMode.type !== 'tournament' || !tournaments) return;

    const tourney = JSON.parse(JSON.stringify(tournaments)) as TournamentState;
    const roundIdx = tourney.currentRound;
    if (roundIdx >= 7) return;

    const round = tourney.rounds[roundIdx];
    round.finishOrder = positions;

    // Find last place among remaining marbles
    const remainingIds = tourney.marbleIds.filter(id => !tourney.eliminatedIds.includes(id));
    let lastPlaceId = '';
    for (let i = positions.length - 1; i >= 0; i--) {
      if (remainingIds.includes(positions[i])) {
        lastPlaceId = positions[i];
        break;
      }
    }

    round.eliminatedMarbleId = lastPlaceId;
    tourney.eliminatedIds.push(lastPlaceId);

    // Check if player's marble was eliminated
    if (lastPlaceId === tourney.playerPickId) {
      tourney.status = 'eliminated';
      tourney.currentRound = roundIdx + 1;
      set({ tournaments: tourney });
      return;
    }

    // Player survived — pay round payout
    const roundPayout = tourney.roundPayouts[roundIdx] || 0;
    tourney.totalEarned += roundPayout;
    tourney.currentRound = roundIdx + 1;

    let newCoins = coins;
    const newCoinHistory = [...coinHistory];

    if (roundPayout > 0) {
      const isChampionRound = tourney.currentRound >= 7;
      newCoins += roundPayout;
      newCoinHistory.push({
        type: 'payout' as const,
        amount: roundPayout,
        description: isChampionRound ? `Tournament Champion prize` : `Tournament round ${roundIdx + 1} survived`,
        timestamp: Date.now(),
      });
      while (newCoinHistory.length > 200) newCoinHistory.shift();

      // Fire server-authoritative payout in background; reconcile balance
      // from server response when it returns.
      applyEconomyAction({
        action: 'tournament_payout',
        payload: { tournamentId: tourney.tournamentId, amount: roundPayout },
      }).then((res) => {
        if (res.ok) {
          useGameStore.setState({ coins: res.balance });
        } else if (__DEV__) {
          console.warn('[tournament_payout]', res.message);
        }
      });
    }

    // Final round complete (round 6 done → currentRound becomes 7)
    if (tourney.currentRound >= 7) {
      tourney.status = 'champion';
      set({ coins: newCoins, coinHistory: newCoinHistory, tournaments: tourney });
      return;
    }

    set({ coins: newCoins, coinHistory: newCoinHistory, tournaments: tourney });
  },

  // ── Coin Store ──
  storePurchasesToday: 0,
  storeCoinsPurchasedToday: 0,
  storeLastPurchaseDate: '',

  purchaseCoinPack: async (packId, purchaseToken, storeProductId) => {
    const { coinHistory, storePurchasesToday, storeCoinsPurchasedToday, storeLastPurchaseDate } = get();
    const today = new Date().toISOString().slice(0, 10);

    // Reset daily limits if new day
    const isNewDay = storeLastPurchaseDate !== today;
    const purchasesToday = isNewDay ? 0 : storePurchasesToday;
    const coinsPurchasedToday = isNewDay ? 0 : storeCoinsPurchasedToday;

    const pack = COIN_PACKS.find(p => p.id === packId);
    if (!pack) return { success: false, error: 'Invalid pack' };

    if (purchasesToday >= getMaxDailyPurchases()) {
      return { success: false, error: `Daily limit reached (${getMaxDailyPurchases()} purchases per day)` };
    }
    if (coinsPurchasedToday + pack.coins > getMaxDailyCoins()) {
      return { success: false, error: `Would exceed daily coin limit (${getMaxDailyCoins().toLocaleString()} coins/day)` };
    }

    // Server verifies the store purchase token before granting coins. The
    // store-side purchase flow (request + listener) lives in app/store.tsx;
    // this function is called from the listener with the resulting token.
    if (!purchaseToken || !storeProductId) {
      // Legacy / fallback path — no real IAP token provided. Refuse to
      // grant coins. The server would reject the sync anyway.
      if (__DEV__) console.warn('[purchaseCoinPack] called without purchaseToken');
      return { success: false, error: 'Missing purchase token — purchase not verified' };
    }

    const syncResult = await syncPurchase({
      productId: storeProductId,
      purchaseToken,
    });
    if (!syncResult.ok) {
      if (__DEV__) console.warn('[purchaseCoinPack] server rejected', syncResult.message);
      return { success: false, error: `Verification failed: ${syncResult.message}` };
    }

    // Grant coins locally to match the server's authoritative credit.
    const coinMultiplier = getPromoMultiplier('double_coins');
    const grantedCoins = Math.round(pack.coins * coinMultiplier);

    const newCoinHistory = [...coinHistory, {
      type: 'purchase' as const,
      amount: grantedCoins,
      description: coinMultiplier > 1
        ? `Purchased ${grantedCoins.toLocaleString()} coins (${pack.price}) — ${coinMultiplier}x promo!`
        : `Purchased ${pack.coins.toLocaleString()} coins (${pack.price})`,
      timestamp: Date.now(),
    }];
    while (newCoinHistory.length > 200) newCoinHistory.shift();

    set({
      coins: get().coins + grantedCoins,
      coinHistory: newCoinHistory,
      storePurchasesToday: purchasesToday + 1,
      storeCoinsPurchasedToday: coinsPurchasedToday + pack.coins,
      storeLastPurchaseDate: today,
    });

    return { success: true, coins: pack.coins };
  },

  // ── Achievements & Skins ──
  achievements: {},
  equippedSkins: {},

  checkAchievements: () => {
    const state = get();
    const checkState: AchievementCheckState = {
      totalRaces: state.totalRaces,
      totalWins: state.totalWins,
      bestStreak: state.bestStreak,
      currentStreak: state.currentStreak,
      coinHistory: state.coinHistory,
      marbleStats: state.marbleStats,
      season: state.season,
      tournaments: state.tournaments,
      achievements: state.achievements,
    };

    const newlyUnlocked: string[] = [];
    const updated = { ...state.achievements };

    for (const def of ACHIEVEMENTS) {
      if (updated[def.id]) continue;
      if (def.check(checkState)) {
        updated[def.id] = { unlockedAt: new Date().toISOString() };
        newlyUnlocked.push(def.id);
      }
    }

    if (newlyUnlocked.length > 0) {
      set({ achievements: updated });
    }
    return newlyUnlocked;
  },

  equipSkin: (marbleId, skinId) => {
    set({ equippedSkins: { ...get().equippedSkins, [marbleId]: skinId } });
  },

  unequipSkin: (marbleId) => {
    const skins = { ...get().equippedSkins };
    delete skins[marbleId];
    set({ equippedSkins: skins });
  },

  // ── Custom Tracks ──
  customTracks: [],

  saveCustomTrack: (seed, name) => {
    const existing = get().customTracks;
    if (existing.some(t => t.seed === seed)) return; // no duplicates
    set({ customTracks: [...existing, { seed, name, savedAt: new Date().toISOString() }] });
  },

  removeCustomTrack: (seed) => {
    set({ customTracks: get().customTracks.filter(t => t.seed !== seed) });
  },

  // ── Challenges ──
  challenges: { daily: [], weekly: [], lastDailyReset: '', lastWeeklyReset: '' },

  refreshChallenges: () => {
    const state = get();
    const today = new Date().toISOString().slice(0, 10);
    const weekStart = getWeekStartDate(today);
    let needsUpdate = false;
    let daily = state.challenges.daily;
    let weekly = state.challenges.weekly;
    let lastDailyReset = state.challenges.lastDailyReset;
    let lastWeeklyReset = state.challenges.lastWeeklyReset;

    if (lastDailyReset !== today) {
      daily = generateDailyChallenges(today);
      lastDailyReset = today;
      needsUpdate = true;
    }
    if (lastWeeklyReset !== weekStart) {
      weekly = generateWeeklyChallenges(weekStart);
      lastWeeklyReset = weekStart;
      needsUpdate = true;
    }

    if (needsUpdate) {
      set({ challenges: { daily, weekly, lastDailyReset, lastWeeklyReset } });
    }
  },

  checkChallenges: () => {
    const state = get();
    const result = state.lastResult;
    if (!result) return [];

    const checkState: ChallengeCheckState = {
      won: result.won,
      playerPickId: result.playerPick?.id ?? null,
      playerPlacement: result.playerPlacement,
      currentStreak: state.currentStreak,
    };

    const completed: string[] = [];
    const updatedDaily = state.challenges.daily.map(c => {
      if (c.completed || c.claimed) return c;
      const evaluated = evaluateChallenge(c, checkState);
      if (evaluated.completed && !c.completed) completed.push(c.id);
      return evaluated;
    });
    const updatedWeekly = state.challenges.weekly.map(c => {
      if (c.completed || c.claimed) return c;
      const evaluated = evaluateChallenge(c, checkState);
      if (evaluated.completed && !c.completed) completed.push(c.id);
      return evaluated;
    });

    set({
      challenges: {
        ...state.challenges,
        daily: updatedDaily,
        weekly: updatedWeekly,
      },
    });
    return completed;
  },

  claimChallengeReward: (challengeId) => {
    const { challenges, coins, coinHistory } = get();
    const allChallenges = [...challenges.daily, ...challenges.weekly];
    const challenge = allChallenges.find(c => c.id === challengeId);
    if (!challenge || !challenge.completed || challenge.claimed) return;

    const updatedDaily = challenges.daily.map(c =>
      c.id === challengeId ? { ...c, claimed: true } : c
    );
    const updatedWeekly = challenges.weekly.map(c =>
      c.id === challengeId ? { ...c, claimed: true } : c
    );

    const newCoinHistory = [...coinHistory, {
      type: 'payout' as const,
      amount: challenge.reward,
      description: `Challenge: ${challenge.description}`,
      timestamp: Date.now(),
    }];
    while (newCoinHistory.length > 200) newCoinHistory.shift();

    // Optimistic local update so the UI shows the new balance immediately
    set({
      coins: coins + challenge.reward,
      coinHistory: newCoinHistory,
      challenges: { ...challenges, daily: updatedDaily, weekly: updatedWeekly },
    });

    // Server-authoritative claim. Previously this was local-only, which is
    // exactly the silent-drain bug that caused mobile/server coin drift
    // (mobile said 6,112, admin said 1,688). The server validates the
    // challenge by id, looks up the canonical reward, and returns the
    // new balance which we snap to. If the POST fails (offline, 5xx), the
    // retry queue in lib/syncQueue.ts holds the action and replays it on
    // the next foreground / sign-in / successful action.
    applyEconomyAction({
      action: 'claim_challenge',
      payload: { challengeId },
    }).then((res) => {
      if (res.ok) {
        useGameStore.setState({ coins: res.balance });
      } else if (__DEV__) {
        console.warn('[claim_challenge]', res.message);
      }
    });
  },

  getOdds: () => currentOdds,

  placeBet: () => {
    const { coins, betAmount, selectedMarble, betsToday, lastBetDate, coinHistory, activeMode, selectedCourseId, betType, exactaPicks } = get();
    // For exacta need 2 picks, trifecta need 3, win needs selectedMarble
    if (betType === 'exacta' && exactaPicks.length < 2) return false;
    if (betType === 'trifecta' && exactaPicks.length < 3) return false;
    if (betType === 'win' && !selectedMarble) return false;
    if (betAmount > coins) return false;

    // Reset daily bet counter if new day
    const today = new Date().toISOString().slice(0, 10);
    const todayBets = lastBetDate === today ? betsToday : 0;

    // Only pick a random course for bet mode; other modes have pre-set courses
    const courseId = (activeMode.type === 'bet')
      ? COURSES[Math.floor(Math.random() * COURSES.length)].id
      : selectedCourseId;

    // Log the bet transaction
    const newCoinHistory = [...coinHistory, {
      type: 'bet' as const,
      amount: -betAmount,
      description: betType === 'exacta' ? `Exacta: ${exactaPicks.map(p => p.name).join(' > ')}`
                 : betType === 'trifecta' ? `Trifecta: ${exactaPicks.map(p => p.name).join(' > ')}`
                 : `Bet on ${selectedMarble?.name}`,
      timestamp: Date.now(),
    }];
    while (newCoinHistory.length > 200) newCoinHistory.shift();

    set({
      coins: coins - betAmount,
      betsToday: todayBets + 1,
      lastBetDate: today,
      selectedCourseId: courseId,
      screen: 'race',
      coinHistory: newCoinHistory,
    });
    return true;
  },

  resetBet: () => {
    const { seasonStandings } = get();
    currentOdds = calculateOdds(seasonStandings);
    set({ selectedMarble: null, betAmount: 100, betType: 'win', exactaPicks: [] });
  },

  checkDailyStreak: () => {
    const { lastPlayedDate } = get();
    const today = new Date().toISOString().slice(0, 10);
    if (lastPlayedDate === today) return null; // Already checked today

    // Optimistic placeholder — actual reward comes from the server.
    // Caller should `await claimDailyBonus()` for the authoritative result.
    set({ lastPlayedDate: today });
    return { reward: 0, streak: 0, pendingServer: true };
  },

  /**
   * Server-authoritative daily bonus claim. Server computes the reward
   * based on the player's authoritative streak, rejects double-claims for
   * the same day, and returns the new coin balance.
   */
  claimDailyBonus: async () => {
    const { coinHistory } = get();
    const res = await applyEconomyAction({ action: 'claim_daily' });
    if (!res.ok) {
      // 409 = already claimed today — silently swallow, normal state
      if (res.status === 409) return null;
      console.warn('[claimDailyBonus]', res.message);
      return null;
    }
    const streak = (res.result?.streak as number | undefined) ?? 0;
    const bonus = (res.result?.bonus as number | undefined) ?? res.transaction.amount;
    const newCoinHistory = [...coinHistory, {
      type: 'daily_bonus' as const,
      amount: bonus,
      description: `Day ${streak} streak bonus`,
      timestamp: Date.now(),
    }];
    while (newCoinHistory.length > 200) newCoinHistory.shift();
    set({
      coins: res.balance,
      dailyStreak: streak,
      bestStreak: Math.max(get().bestStreak, streak),
      coinHistory: newCoinHistory,
    });
    return { reward: bonus, streak };
  },
}),
    {
      name: 'dmr-game-state',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        playerName: state.playerName,
        hasSeenIntroRace: state.hasSeenIntroRace,
        coins: state.coins,
        totalRaces: state.totalRaces,
        totalWins: state.totalWins,
        currentStreak: state.currentStreak,
        bestStreak: state.bestStreak,
        marbleStats: state.marbleStats,
        seasonWeek: state.seasonWeek,
        seasonStandings: state.seasonStandings,
        dailyStreak: state.dailyStreak,
        lastPlayedDate: state.lastPlayedDate,
        lastBetDate: state.lastBetDate,
        raceHistory: state.raceHistory,
        passLevel: state.passLevel,
        passXp: state.passXp,
        passTrack: state.passTrack,
        coinHistory: state.coinHistory,
        season: state.season,
        nationalRaces: state.nationalRaces,
        tournaments: state.tournaments,
        storePurchasesToday: state.storePurchasesToday,
        storeCoinsPurchasedToday: state.storeCoinsPurchasedToday,
        storeLastPurchaseDate: state.storeLastPurchaseDate,
        achievements: state.achievements,
        equippedSkins: state.equippedSkins,
        customTracks: state.customTracks,
        challenges: state.challenges,
      }),
      version: 7,
      migrate: (persisted: any, version: number) => {
        if (version < 3 && persisted?.season) {
          persisted.season = null;
        }
        if (version < 4) {
          persisted.achievements = persisted.achievements ?? {};
          persisted.equippedSkins = persisted.equippedSkins ?? {};
          persisted.customTracks = persisted.customTracks ?? [];
          persisted.challenges = persisted.challenges ?? {
            daily: [], weekly: [], lastDailyReset: '', lastWeeklyReset: '',
          };
        }
        if (version < 5) {
          persisted.passTrack = persisted.passTrack ?? 'free';
        }
        if (version < 6) {
          /* Existing installs have already played, so they skip the intro. */
          persisted.hasSeenIntroRace = persisted.hasSeenIntroRace ?? true;
        }
        if (version < 7) {
          /* ====================================================================
           * PRE-LAUNCH CLEAN WIPE — coordinated with server-side TRUNCATE.
           * ====================================================================
           * Resets ALL economy / race state to defaults so the phone matches
           * the server's wiped state on first launch after install. Without
           * this, the phone would carry its drifted optimistic balance
           * (e.g. 9,144 coins) into a fresh server (1,000 coins) and the
           * next race sync would snap coins DOWN dramatically — bad UX.
           *
           * Keeps:
           *   - playerName, hasSeenIntroRace, passTrack
           *   - achievements (purely client-side, no server analog)
           *   - equippedSkins, customTracks (player customization)
           *
           * Resets to defaults (omitted from return → falls back to initial
           * state in the store factory):
           *   - coins, totalRaces, totalWins
           *   - currentStreak, bestStreak, marbleStats, seasonStandings
           *   - dailyStreak, lastPlayedDate, lastBetDate, raceHistory
           *   - passLevel, passXp, coinHistory
           *   - season, nationalRaces, tournaments
           *   - storePurchasesToday, storeCoinsPurchasedToday, storeLastPurchaseDate
           *   - challenges (will refresh from server)
           */
          return {
            playerName: persisted?.playerName ?? '',
            hasSeenIntroRace: true,
            passTrack: persisted?.passTrack ?? 'free',
            achievements: persisted?.achievements ?? {},
            equippedSkins: persisted?.equippedSkins ?? {},
            customTracks: persisted?.customTracks ?? [],
          };
        }
        return persisted;
      },
    }
  )
);
