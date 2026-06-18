import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MARBLES, MarbleData } from '../theme';
import { PassTrack } from '../data/seasonPass';
import { ALL_COURSES as COURSES } from '../data/courses';
import {
  SeasonSchedule, SeasonWeek, SeasonRace,
  generateSeasonSchedule, advanceSchedule, isSeasonComplete,
  WEEKS_PER_SEASON,
  SEASON_POINTS,
} from '../data/seasonSchedule';
import {
  NATIONAL_EVENTS, getNationalEvents, NationalEventState,
  generateEventCourses, calculateNationalPayout, SERIES_POINTS,
  getETDateString,
} from '../data/nationalRaces';
import { syncRaceResult, syncPurchase, syncPlayerState } from '../lib/sync';
import { applyEconomyAction, EconomyAction, EconomyResult } from '../lib/economy';
import { showRewardedAd } from '../utils/rewardedAds';

/**
 * UTC date stamp for daily-cap tracking. Matches the server's daily-cap
 * window (UTC midnight) so the client never thinks it has caps left when
 * the server has already reset, or vice versa.
 */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Wrap applyEconomyAction so that 4xx (non-401) failures roll back any
 * optimistic local mutation the caller made before firing the action.
 *
 * Why: the syncQueue only re-tries retriable failures (network/5xx/401).
 * Permanent client errors (400/403/409) are silently dropped, leaving the
 * client with an optimistic credit/debit that will never be reconciled.
 * Callers pass a `rollback` closure that undoes their optimistic change,
 * which we invoke only on a permanent rejection. 401 = queued, so we leave
 * the optimistic state in place and let the queue settle it later.
 */
async function applyEconomyActionWithRollback(
  opts: { action: EconomyAction; payload?: Record<string, unknown> },
  rollback: () => void,
): Promise<EconomyResult> {
  const res = await applyEconomyAction(opts);
  // 401 = queued for auth · 0 = queued for network. Both keep the optimistic
  // local debit because the action IS in the retry queue and will replay
  // when connectivity / token returns. Previously only 401 was exempted, so
  // a player on the subway saw their balance rollback and the action drop —
  // making bet/tournament/national entry silently impossible offline.
  if (!res.ok && res.status !== 401 && res.status !== 0) {
    rollback();
  }
  return res;
}
import { getConfig, fetchRemoteConfig, loadCachedConfig, getXpPerLevel } from '../lib/remoteConfig';
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
  // True when the player has no stake in the race — currently only a playoff
  // race the player's franchise marble didn't qualify for (or was eliminated
  // from). Drives the neutral "spectator" results screen so the player never
  // sees a false "YOU WON!"/"PODIUM FINISH!" for a race they only watched.
  spectator?: boolean;
  // Per-marble physics/race telemetry captured by the engine this race.
  // Optional — older callers / replays won't have it; analytics folds it in
  // when present. See engine/race.ts MarbleTelemetry.
  telemetry?: MarbleTelemetry[];
}

/**
 * Per-marble telemetry shape. Mirrors engine/race.ts MarbleTelemetry; declared
 * here too so the store has no import cycle with the engine module.
 */
export interface MarbleTelemetry {
  marbleId: string;
  finishTime: number;
  finishPlace: number;
  peakVelocity: number;
  avgVelocity: number;
  velocitySampleCount: number;
  bounces: number;
  bumperHits: number;
  pegContacts: number;
  wallScrapes: number;
  speedBurstHits: number;
  posAt25: number;
  posAt50: number;
  posAt75: number;
  posAtFinish: number;
  overtakes: number;
  timesPassed: number;
  wireToWire: boolean;
  leadTimeFraction: number;
}

/**
 * Lifetime accumulated analytics for one marble. All counters are TOTALS so
 * any average is derived as total / count at read time. Persisted.
 */
export interface MarbleAnalytics {
  races: number;                 // races counted into analytics (non quick-race)
  // Finish-position accumulators.
  finishPositions: number[];     // recent finish places (capped at 60) — for σ
  podiums: number;               // top-3 finishes
  finishCounts: number[];        // index 0..7 → count of 1st..8th place finishes
  totalFinishPosition: number;   // Σ finish place — for average position
  // Physics telemetry totals (divide by races for averages).
  peakVelocity: number;          // best single-race peak velocity ever
  totalAvgVelocity: number;      // Σ per-race avg velocity
  totalBounces: number;
  totalBumperHits: number;
  totalPegContacts: number;
  totalWallScrapes: number;
  totalSpeedBurstHits: number;
  // Race intelligence totals.
  totalOvertakes: number;
  totalTimesPassed: number;
  wireToWireWins: number;
  totalLeadTimeFraction: number; // Σ per-race lead fraction
  // Position-by-stage totals (divide by races for the stage line chart).
  totalPosAt25: number;
  totalPosAt50: number;
  totalPosAt75: number;
  // Clutch — wins/races in close finishes (small finish-time margin).
  closeRaces: number;
  closeWins: number;
  // Per-theme W-L. Keyed by course theme string.
  themeStats: Record<string, { wins: number; races: number; totalPos: number }>;
}

/* One invited friend's referral record. These are SERVER-issued — the
 * client never fabricates them, because referral attribution + the +500
 * reward must be verified server-side. */
export interface Referral {
  /** Display name of the invited friend (server-provided). */
  name: string;
  /** pending = signed up, not racing yet · racing = 1-2 of 3 races done ·
   *  earned = completed 3 races, +500 granted server-side. */
  status: 'pending' | 'racing' | 'earned';
  /** Races the invited friend has completed (0-3). */
  racesCompleted: number;
  /** Epoch ms when the invite was recorded. */
  invitedAt: number;
}

/* User-facing toggle settings shown on the Settings screen.
 * The first four are notification preferences (persisted only — there is
 * no scheduler yet). The last three gate gameplay subsystems. */
export interface GameSettings {
  raceReminders: boolean;
  primeTimeAlerts: boolean;
  nightCapAlerts: boolean;
  dailyBonusReminder: boolean;
  sound: boolean;
  vibration: boolean;
  cameraShake: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  raceReminders: true,
  primeTimeAlerts: true,
  nightCapAlerts: true,
  dailyBonusReminder: true,
  sound: true,
  vibration: true,
  cameraShake: true,
};

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

/* Per-round payout schedules. Reads from remote config so live-ops can
 * rebalance survival rewards without an app build. Falls back to the
 * legacy hardcoded matrix (with the champion prize patched in from
 * tournamentPrizes) when the new tournamentRoundPayouts field is
 * absent — protects against an old admin API that doesn't emit it. */
function getTournamentPayouts(): Record<string, number[]> {
  const cfg = getConfig();
  const live = cfg.tournamentRoundPayouts;
  if (live) {
    return {
      'daily-blitz':           live.daily,
      'weekly-cup':            live.weekly,
      'champion-invitational': live.champion,
    };
  }
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

/* Static defaults used when remote config hasn't loaded yet. The
 * canonical source for grants + promo % is remote config — use
 * getCoinPacks() at render time so the user always sees the live
 * value. Price stays hardcoded because it's tied to the IAP product
 * registered with Apple/Google and can't be changed live. */
export const COIN_PACKS: CoinPack[] = [
  { id: 'starter',  coins: 1000,  price: '$0.99',  bonus: null,    badge: null },
  { id: 'popular',  coins: 6000,  price: '$4.99',  bonus: '+20%',  badge: 'MOST POPULAR' },
  { id: 'big',      coins: 15000, price: '$9.99',  bonus: '+50%',  badge: null },
  { id: 'whale',    coins: 40000, price: '$24.99', bonus: '+60%',  badge: 'BEST VALUE' },
];

export function getCoinPacks(): CoinPack[] {
  const cfg = getConfig();
  const live = cfg.storePacks;
  if (!live) return COIN_PACKS;
  const pct = (m?: number) => m && m > 0 ? `+${Math.round(m * 100)}%` : null;
  return [
    { id: 'starter',  coins: live.starter.coins,   price: '$0.99',  bonus: null,                       badge: null },
    { id: 'popular',  coins: live.popular.coins,   price: '$4.99',  bonus: pct(live.popular.promo),    badge: 'MOST POPULAR' },
    { id: 'big',      coins: live.big.coins,       price: '$9.99',  bonus: pct(live.big.promo),        badge: null },
    { id: 'whale',    coins: live.whale.coins,     price: '$24.99', bonus: pct(live.whale.promo),      badge: 'BEST VALUE' },
  ];
}

/* Number of single-elimination rounds in a tournament.
 *
 * 8 marbles → 7 eliminations to crown a champion. Previously the literal
 * `7` was scattered across tournament-bracket.tsx, tournaments.tsx,
 * multiplayer-lobby.tsx, results.tsx, and gameStore tournament logic. If
 * we ever change the format (e.g. 16-marble bracket → 15 rounds), missing
 * one of those callsites silently breaks the "Round N of M" labelling.
 * Import and use this constant instead. */
export const TOURNAMENT_ROUNDS = 7;

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
  /**
   * Canonical id of the currently in-flight bet, set by placeBet() and
   * cleared by settleBet(). The server returns this in the place_bet
   * ledger row; settle_bet REQUIRES the betId in its payload because
   * the canonical bet amount is looked up from the ledger (not trusted
   * from the client). NEVER mutate from the UI layer.
   */
  currentBetId: string | null;
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

  /**
   * Transient flag — true while the first-launch tutorial race is in
   * flight. The intro race runs in `quick_race` mode (same mechanics —
   * no bet, reduced XP), but a new player finishing it should land on
   * the main lobby to see the whole game, NOT the quick-race "RACE
   * AGAIN → courses" destination. The results screen reads this flag to
   * override its navigation, then clears it. Not persisted — an app
   * restart naturally resets it, and the intro only runs once anyway.
   */
  introRacePending: boolean;
  setIntroRacePending: (v: boolean) => void;

  // Stats
  totalRaces: number;
  totalWins: number;
  currentStreak: number;
  marbleStats: Record<string, { wins: number; losses: number; betCount: number }>;

  // Deep analytics — lifetime physics/race telemetry per marble.
  marbleAnalytics: Record<string, MarbleAnalytics>;

  /* User-facing toggle settings (Settings screen). All default to true.
   * Notification flags are persisted only (no scheduler yet). Sound,
   * vibration and camera-shake gate their respective subsystems. */
  settings: GameSettings;
  setSetting: (key: keyof GameSettings, value: boolean) => void;

  /* Referral / invite-friends state.
   *
   * `referralCode` is a stable, human-readable code derived once from the
   * Firebase uid (or a random-once seed) and never changes afterwards.
   *
   * `referrals` is populated by the SERVER — real referral attribution
   * (who used your code, whether they finished 3 races) cannot be trusted
   * client-side, so this stays empty until a server pushes confirmed
   * referral records. The +500 reward is granted server-side; the client
   * never self-credits coins for referrals. */
  referralCode: string;
  referrals: Referral[];
  /** Idempotently derive + persist the referral code if it isn't set yet. */
  ensureReferralCode: () => string;

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
  setMpResult: (placement: number, payout: number, tier?: 'daily' | 'weekly' | 'champion') => void;

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

  /* Rewarded-ads counter — NON-persisted. The server is the source of
   * truth for the per-day cap; these locals are only used to keep the UI
   * snappy between taps (so the tile shows "3 / 5 today" without waiting
   * for a server round-trip). Resetting on app restart is fine: the next
   * claimRewardedAd() call gets a 4xx/cap-reached from the server if the
   * player has already maxed out today. */
  adsWatchedToday: number;
  lastAdDate: string;
  claimRewardedAd: () => Promise<{ ok: boolean; granted?: number; message?: string }>;

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
  /** Server-authoritative bet placement. Returns ok=true on success or
   *  queued retry; ok=false carries the server status + message so the UI
   *  can show what actually went wrong (e.g. "rate limit", "invalid course",
   *  "auth expired") instead of a generic "check your connection". */
  placeBet: () => Promise<{ ok: true } | { ok: false; status: number; message: string }>;
  /**
   * Server-authoritative bet settlement. Uses currentBetId (set by
   * placeBet()) so the server can look up the canonical bet amount from
   * its ledger rather than trusting a client-supplied amount. Called by
   * setLastResult after a race finishes with a positive payout.
   */
  settleBet: (payout: number) => Promise<void>;
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
  /* House edge: payouts pay 1-edge of the fair odds. 0.10 = 10% house
   * edge → payout multiplier 0.9. Lives in remote config so live-ops
   * can tighten / loosen margin without an app build. */
  const edge = getConfig().betHouseEdge ?? 0.10;
  const payoutMultiplier = Math.max(0, Math.min(1, 1 - edge));
  boosted.forEach((e) => {
    const prob = e.p / total;
    const raw = (1 / prob) * payoutMultiplier;
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

// ── Deep analytics helpers ──

const FINISH_HISTORY_CAP = 60;

/** A fresh, zeroed analytics record for one marble. */
function emptyAnalytics(): MarbleAnalytics {
  return {
    races: 0,
    finishPositions: [],
    podiums: 0,
    finishCounts: [0, 0, 0, 0, 0, 0, 0, 0],
    totalFinishPosition: 0,
    peakVelocity: 0,
    totalAvgVelocity: 0,
    totalBounces: 0,
    totalBumperHits: 0,
    totalPegContacts: 0,
    totalWallScrapes: 0,
    totalSpeedBurstHits: 0,
    totalOvertakes: 0,
    totalTimesPassed: 0,
    wireToWireWins: 0,
    totalLeadTimeFraction: 0,
    totalPosAt25: 0,
    totalPosAt50: 0,
    totalPosAt75: 0,
    closeRaces: 0,
    closeWins: 0,
    themeStats: {},
  };
}

/**
 * Fold one race's results + telemetry into the lifetime marbleAnalytics map.
 * PURE — returns a new map, mutates nothing.
 *
 * `finishOrder` is the array of marble ids in finishing order (index 0 = 1st).
 * `times` maps marbleId → finish time; used to flag close races for Clutch.
 */
function foldRaceAnalytics(
  prev: Record<string, MarbleAnalytics>,
  finishOrder: string[],
  times: Record<string, number>,
  telemetry: MarbleTelemetry[] | undefined,
  courseTheme: string,
): Record<string, MarbleAnalytics> {
  const next: Record<string, MarbleAnalytics> = { ...prev };
  const n = finishOrder.length;
  if (n < 2) return next;

  // Telemetry indexed by marble id for quick lookup.
  const telById: Record<string, MarbleTelemetry> = {};
  (telemetry ?? []).forEach(t => { telById[t.marbleId] = t; });

  // Close-race detection: winner's margin over 2nd place is "small".
  // 800ms threshold = a photo finish at the marble timescale.
  const CLOSE_MARGIN_MS = 800;
  const winnerTime = times[finishOrder[0]] ?? 0;
  const runnerTime = times[finishOrder[1]] ?? 0;
  const isCloseRace = winnerTime > 0 && runnerTime > 0 &&
    Math.abs(runnerTime - winnerTime) <= CLOSE_MARGIN_MS;

  finishOrder.forEach((id, idx) => {
    const place = idx + 1;             // 1-indexed finish
    const base = next[id] ?? emptyAnalytics();
    const a: MarbleAnalytics = {
      ...base,
      finishCounts: [...base.finishCounts],
      finishPositions: [...base.finishPositions],
      themeStats: { ...base.themeStats },
    };
    a.races += 1;
    a.finishPositions.push(place);
    if (a.finishPositions.length > FINISH_HISTORY_CAP) a.finishPositions.shift();
    a.totalFinishPosition += place;
    if (place <= 3) a.podiums += 1;
    if (place >= 1 && place <= 8) a.finishCounts[place - 1] += 1;

    // Theme split.
    const ts = a.themeStats[courseTheme] ?? { wins: 0, races: 0, totalPos: 0 };
    a.themeStats[courseTheme] = {
      wins: ts.wins + (place === 1 ? 1 : 0),
      races: ts.races + 1,
      totalPos: ts.totalPos + place,
    };

    // Clutch — count this race if it was decided by a small margin.
    if (isCloseRace) {
      a.closeRaces += 1;
      if (place === 1) a.closeWins += 1;
    }

    // Physics + race-intelligence telemetry.
    const t = telById[id];
    if (t) {
      if (t.peakVelocity > a.peakVelocity) a.peakVelocity = t.peakVelocity;
      a.totalAvgVelocity += t.avgVelocity;
      a.totalBounces += t.bounces;
      a.totalBumperHits += t.bumperHits;
      a.totalPegContacts += t.pegContacts;
      a.totalWallScrapes += t.wallScrapes;
      a.totalSpeedBurstHits += t.speedBurstHits;
      a.totalOvertakes += t.overtakes;
      a.totalTimesPassed += t.timesPassed;
      a.totalLeadTimeFraction += t.leadTimeFraction;
      a.totalPosAt25 += t.posAt25;
      a.totalPosAt50 += t.posAt50;
      a.totalPosAt75 += t.posAt75;
      if (t.wireToWire && place === 1) a.wireToWireWins += 1;
    }
    next[id] = a;
  });
  return next;
}

/**
 * Build a stable, human-readable referral code from a seed string.
 *
 * Deterministic: the same seed always yields the same code, so a signed-in
 * user keeps one code across reinstalls (seed = Firebase uid). When no uid
 * is available the caller passes a random-once seed, and the result is
 * persisted so it likewise never changes.
 *
 * Shape: an uppercase marble name + 2 digits, e.g. "ROCKY42".
 */
function generateReferralCode(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  hash = Math.abs(hash);
  const marble = MARBLES[hash % MARBLES.length];
  const digits = (hash % 100).toString().padStart(2, '0');
  return `${marble.name.toUpperCase()}${digits}`;
}

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
  setPlayerName: (name) => {
    set({ playerName: name });
    // Push the new name to the server immediately so the admin dashboard
    // (and any other device) reflects the change without having to wait
    // for the next lobby mount to fire its sync.
    syncPlayerState({ playerName: name });
  },

  hasSeenIntroRace: false,
  setHasSeenIntroRace: (v) => set({ hasSeenIntroRace: v }),

  introRacePending: false,
  setIntroRacePending: (v) => set({ introRacePending: v }),

  coins: 1000,
  currentBetId: null,
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
    const { activeMode, seasonStandings, totalRaces, totalWins, currentStreak, bestStreak, passXp, passLevel, raceHistory, marbleStats, coinHistory, marbleAnalytics } = get();

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

    // --- COMMON: deep analytics (all modes except quick race) ---
    // Folds engine telemetry + finish order into the lifetime per-marble
    // analytics map. Quick races are excluded to mirror marbleStats so the
    // two records stay consistent.
    let newMarbleAnalytics = marbleAnalytics;
    if (!isQuickRace) {
      const finishOrder = result.positions.map(p => p.marble.id);
      const times: Record<string, number> = {};
      result.positions.forEach(p => { times[p.marble.id] = p.time; });
      const courseTheme =
        COURSES.find(c => c.id === get().selectedCourseId)?.theme ?? 'unknown';
      newMarbleAnalytics = foldRaceAnalytics(
        marbleAnalytics, finishOrder, times, result.telemetry, courseTheme,
      );
    }

    // --- COMMON: total races (all modes) ---
    const newTotalRaces = totalRaces + 1;

    // --- COMMON: Pass XP (50% for quick race, full for others) ---
    // xpPerLevel comes from remote config so admins can tune progression
    // speed without a new app build. Defaults to the data/seasonPass.ts
    // constant when remote config hasn't loaded yet.
    const MAX_PASS_LEVEL = 30;
    const xpPerLevel = getXpPerLevel();
    /* XP grants are admin-tunable via remote config passXp. Defaults
     * mirror the historical hardcoded values so existing balance math
     * is preserved if the remote field is absent. */
    const xpCfg = getConfig().passXp ?? { betRace: 250, quickRace: 125, winBonus: 500 };
    const xpGain = isQuickRace ? xpCfg.quickRace : xpCfg.betRace;
    const xpWinBonus = isQuickRace ? 0 : (result.won ? xpCfg.winBonus : 0);
    let xp = passXp + xpGain + xpWinBonus;
    let lvl = passLevel;
    while (xp >= xpPerLevel && lvl < MAX_PASS_LEVEL) {
      xp -= xpPerLevel;
      lvl++;
    }
    if (lvl >= MAX_PASS_LEVEL) xp = Math.min(xp, xpPerLevel - 1); // cap at max

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
      } else if (!result.spectator) {
        // A spectated playoff race the player isn't in must not reset their
        // win streak — they didn't lose, they just watched.
        newStreak = 0;
      }

      /* Season-week advance — STRICTLY scoped to season-mode races.
       *
       * Old fallback for non-season modes derived seasonWeek from lifetime
       * totalRaces / RACES_PER_WEEK, which surfaced a decorative-but-wrong
       * "week" indicator in bet/national/tournament contexts. The variable
       * is only meaningful for actual season races, so we simply leave it
       * unchanged from the current value in every other mode. */
      const seasonState = get().season;
      if (activeMode.type === 'season' && seasonState) {
        const curIdx = seasonState.schedule.findIndex(w => w.status === 'current');
        newWeek = Math.min(WEEKS_PER_SEASON, (curIdx >= 0 ? curIdx + 1 : 1));
      }
      // All other modes: newWeek already initialized to get().seasonWeek
      // above — leave it alone.

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

    /* Coin payout routing.
     *
     * Bet wins (activeMode.type === 'bet') go through settleBet() so the
     * server is authoritative. Other modes (season, national, tournament,
     * playoff) have their own server payout calls dispatched in the
     * mode-specific post-processing below.
     *
     * For bet mode we DO NOT credit coins locally — settleBet awaits the
     * server response and snaps coins to the authoritative balance. This
     * prevents the place_bet→settle_bet "double credit" window where the
     * client and server briefly disagree.
     *
     * For all other modes, we keep the existing optimistic local credit
     * (computed below) because the mode handler still owns the post-race
     * server reconciliation. */
    const isBetMode = activeMode.type === 'bet';
    const localPayoutCredit = (!isBetMode && result.payout > 0) ? result.payout : 0;
    const newCoins = get().coins + localPayoutCredit;

    set({
      lastResult: result,
      coins: newCoins,
      seasonStandings: newStandings,
      marbleStats: newMarbleStats,
      marbleAnalytics: newMarbleAnalytics,
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

    // Fire bet-mode settlement against the server — payout 0 still settles
    // (closes the bet row even on a loss). settleBet is safe to call with
    // no currentBetId; it short-circuits.
    if (isBetMode) {
      get().settleBet(result.payout).catch(() => {});
    }

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
  marbleAnalytics: {},

  settings: { ...DEFAULT_SETTINGS },
  setSetting: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value } })),

  referralCode: '',
  referrals: [],
  ensureReferralCode: () => {
    const existing = get().referralCode;
    if (existing) return existing;
    /* Prefer the Firebase uid so the code survives a reinstall for
     * signed-in users; otherwise seed from a random-once value. Either
     * way the result is persisted, so the code is generated exactly once. */
    const seed = get().firebaseUid ?? `anon-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const code = generateReferralCode(seed);
    set({ referralCode: code });
    return code;
  },

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
    // Season 1: no bonus (fresh start). Season 2+: base + increment per season, capped.
    // Values live in remote config so live-ops can tune season-over-season retention.
    if (num >= 2) {
      const { coins, coinHistory } = get();
      const sb = getConfig().seasonStarterBonus ?? { base: 500, increment: 250, cap: 2500 };
      const bonus = Math.min(sb.cap, sb.base + (num - 2) * sb.increment);
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

  trainMarble: (_stat) => {
    /* DISABLED until server economy support ships.
     *
     * Previously this deducted coins LOCALLY only — the server was never
     * told, leaving the franchise-mode training path as an open coin
     * exploit (tap "Train" → free local credit drift). Until the server
     * adds a `train_marble` EconomyAction with canonical cost validation,
     * we hard-refuse all training attempts at the store layer.
     *
     * Callers (app/season.tsx) already handle a falsy `success` by showing
     * a "couldn't train" toast / button-disabled state, so the UX
     * degradation is minimal.
     *
     * TODO(economy): wire to applyEconomyAction('train_marble', { stat })
     * once that endpoint exists. Keep the gain/cost calc + season state
     * mutation; reinstate the set() block after the server response with
     * res.balance instead of `coins - cost`. */
    if (__DEV__) console.warn('trainMarble disabled until server economy support ships');
    return { success: false, gain: 0, cost: 0 };
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

    /* Top 6 marbles by points → wins → alphabetical id (deterministic).
     *
     * The alphabetical-id tiebreaker is the important new addition: without
     * it Array.prototype.sort behavior on equally-ranked entries is engine-
     * dependent (V8 vs Hermes vs JSC differ), which could produce a
     * different bracket between server replay and client display. Sorting
     * by id last guarantees the same six seeds in the same order every
     * time, on every JS runtime. */
    const sorted = Object.entries(season.standings)
      .sort(([idA, a], [idB, b]) =>
        b.points - a.points ||
        b.wins - a.wins ||
        idA.localeCompare(idB),
      )
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
      /* seriesId is the per-payout-type natural key the server uses for
       * idempotency (playoff_payout:{playerId}:{seasonNumber}:{seriesId}).
       * Without it the server returns 400 and the local optimistic credit
       * gets snapped back on the next sync. If we can't determine a
       * seriesId we MUST skip the server call entirely. */
      let seriesId: string | null = null;

      if (isFranchise && playerMarbleId) {
        // Determine player's final placement (1st = champion, 2nd = last eliminated, etc.)
        // allEliminated[0] is the first marble out (worst rank).
        // allEliminated[N-1] is the last marble eliminated before the champion = runner-up (2nd).
        // Placement formula: N - index + 1 → first_out maps to (N+1) (worst), last_out maps to 2 (runner-up).
        const allEliminated = [...playoffs.eliminatedIds];
        const eliminationIdx = allEliminated.indexOf(playerMarbleId);
        const madePlayoffs = playerMarbleId === stillAlive[0] || eliminationIdx >= 0;
        const placement = playerMarbleId === stillAlive[0]
          ? 1
          : allEliminated.length - eliminationIdx + 1;

        const remote = getConfig();
        const po = remote.playoffPayouts;
        const championPrize = po?.champion  ?? 5000;
        const runnerUpPrize = po?.runnerUp  ?? 2500;
        const top3Prize     = po?.top3      ?? 1000;
        const qualifiedPrize = po?.qualified ?? 1500;

        if (!madePlayoffs) {
          /* Franchise marble didn't qualify for playoffs (finished outside
           * the top 6 seeds). Without this branch the player would get
           * zero for finishing the season as their marble — a brutal
           * "you played 10 races for nothing" UX. */
          playoffPayout = qualifiedPrize;
          playoffDesc = 'Season Complete (consolation)';
          seriesId = 'consolation';
        } else {
          if (placement === 1) { playoffPayout = championPrize; playoffDesc = 'Playoff Champion'; seriesId = 'champion'; }
          else if (placement === 2) { playoffPayout = runnerUpPrize; playoffDesc = 'Playoff Runner-Up'; seriesId = 'runner-up'; }
          else if (placement === 3) { playoffPayout = top3Prize; playoffDesc = 'Playoff Top 3'; seriesId = 'top-3'; }
        }
      } else {
        // Bettor mode: flat completion bonus for finishing the season.
        // Bumped historically from 500 because bettor players have no single
        // marble to medal with. Now live-config driven so ops can tune.
        playoffPayout = getConfig().playoffPayouts?.bettorComplete ?? 1500;
        playoffDesc = 'Season Complete';
      }

      const { coins: prevCoins, coinHistory } = get();
      if (playoffPayout > 0 && seriesId) {
        /* Server-authoritative payout with rollback on permanent rejection.
         * The optimistic credit lands in the set() below; if the server
         * refuses (e.g. season already finalized), the rollback restores
         * prevCoins so the player doesn't keep phantom playoff coins.
         * seasonNumber + seriesId form the natural-key idempotency tuple
         * the server requires — omitting them caused a silent 400 that
         * wiped the credit on the next sync. */
        applyEconomyActionWithRollback(
          {
            action: 'playoff_payout',
            payload: {
              amount: playoffPayout,
              description: playoffDesc,
              seasonNumber: season.seasonNumber,
              seriesId,
            },
          },
          () => useGameStore.setState({ coins: prevCoins }),
        ).then((res) => {
          if (res.ok) {
            useGameStore.setState({ coins: res.balance });
          } else if (__DEV__) {
            console.warn('[playoff_payout]', res.message);
          }
        });
      }
      // Defensive: older save states may not have `seasonHistory` defined
      // (the field was added after season state shipped). Spreading
      // `undefined` here was crashing the playoff Skip button.
      const priorHistory = Array.isArray(season.seasonHistory) ? season.seasonHistory : [];
      set({
        coins: prevCoins + playoffPayout,
        coinHistory: playoffPayout > 0 ? [
          { type: 'payout' as const, amount: playoffPayout, description: playoffDesc, timestamp: Date.now() },
          ...coinHistory,
        ].slice(0, 200) : coinHistory,
        season: {
          ...season,
          playoffs,
          seasonHistory: [
            ...priorHistory,
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
    const today = getETDateString();
    const updated: Record<string, NationalEventState> = {};
    getNationalEvents().forEach((event) => {
      const existing = current[event.id];

      /* Stale-entry detection.
       *
       * If an event is still flagged `entered: true` but the `completedDate`
       * is from a previous day AND there's no in-flight `seriesProgress`,
       * it means the player abandoned a single-race entry mid-flow (closed
       * the app between enter and finish) and the daily reset rolled past
       * them. Without this branch they'd be locked out of entering today,
       * even though no race actually ran yesterday. Reset to a fresh entry
       * slot. We DO NOT touch series-format events with active
       * seriesProgress — those represent a real in-flight Grand Prix
       * series that should persist across days. */
      const isStaleEntry =
        existing?.entered &&
        existing.completedDate !== today &&
        !existing.seriesProgress;

      if (existing?.entered && !isStaleEntry) {
        // Genuinely in-flight (today, or has series progress) — preserve.
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
    const event = getNationalEvents().find((e) => e.id === eventId);
    if (!event) return { ok: false, reason: 'Unknown event.' };
    const { coins, nationalRaces: nr, coinHistory } = get();
    const nationalRaces = nr ?? {};
    if (coins < event.entryFee) return { ok: false, reason: `Need ${event.entryFee} coins, you have ${coins}.` };

    const state = nationalRaces[eventId];
    if (!state) return { ok: false, reason: 'Event not loaded — try again.' };
    if (state.entered) return { ok: false, reason: 'Already entered this event today.' };

    /* Optimistic debit + rollback on permanent rejection. See
     * enterTournament for the rationale — the old "silent local fallback"
     * path let the client enter for free when the server refused. */
    const prevCoins = coins;
    const optimisticBalance = coins - event.entryFee;
    set({ coins: optimisticBalance });

    const res = await applyEconomyActionWithRollback(
      {
        action: 'national_entry',
        payload: { eventId },
      },
      () => useGameStore.setState({ coins: prevCoins }),
    );

    let newBalance: number;
    if (res.ok) {
      newBalance = res.balance;
    } else if (res.status === 401 || res.status === 0) {
      // Queued for auth (401) or queued for network (0) — keep the optimistic
      // debit; the syncQueue will replay once we're back online / signed in.
      newBalance = optimisticBalance;
    } else {
      if (__DEV__) console.warn('[enterNationalRace] server rejected', res.status, res.message);
      return { ok: false, reason: res.message || 'Server rejected entry.' };
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

    const event = getNationalEvents().find((e) => e.id === activeMode.eventId);
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
          const prevCoins = coins;
          const newCoinHistory = [...coinHistory, {
            type: 'payout' as const,
            amount: payout,
            description: `${event.name} - ${placement === 0 ? '1st' : placement === 1 ? '2nd' : '3rd'} place`,
            timestamp: Date.now(),
          }];
          while (newCoinHistory.length > 200) newCoinHistory.shift();
          set({ coins: prevCoins + payout, coinHistory: newCoinHistory });

          /* Fire server-authoritative payout. Rolls back the optimistic
           * +payout on permanent rejection (e.g. event already paid out,
           * wrong eventId). `placement` is 0-indexed locally but the
           * server expects 1-indexed. */
          applyEconomyActionWithRollback(
            {
              action: 'national_payout',
              payload: { eventId: event.id, placement: placement + 1 },
            },
            () => useGameStore.setState({ coins: prevCoins }),
          ).then((res) => {
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
          const prevCoins = coins;
          const newCoinHistory = [...coinHistory, {
            type: 'payout' as const,
            amount: payout,
            description: `${event.name} series winner!`,
            timestamp: Date.now(),
          }];
          while (newCoinHistory.length > 200) newCoinHistory.shift();
          set({ coins: prevCoins + payout, coinHistory: newCoinHistory });

          /* Server-authoritative series-winner payout (placement 1).
           * Rolls back optimistic +payout on permanent rejection. */
          applyEconomyActionWithRollback(
            {
              action: 'national_payout',
              payload: { eventId: event.id, placement: 1 },
            },
            () => useGameStore.setState({ coins: prevCoins }),
          ).then((res) => {
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
  setMpResult: (placement, payout, tier) => {
    const { coins: prevCoins, coinHistory, mpLobbyId } = get();
    if (payout > 0) {
      // Optimistic local credit so the FINISHED screen shows the new
      // balance immediately. The server payout below reconciles to the
      // authoritative balance if it returns ok.
      set({
        mpPlacement: placement,
        mpPayout: payout,
        coins: prevCoins + payout,
        coinHistory: [
          { type: 'payout' as const, amount: payout, description: `MP Tournament ${placement === 1 ? 'Champion' : `#${placement}`}`, timestamp: Date.now() },
          ...coinHistory,
        ].slice(0, 200),
      });

      /* Server-authoritative payout. Rolls back the optimistic +payout
       * credit on any permanent (non-401) rejection — previously the
       * client kept the optimistic balance even when the server refused
       * (e.g. tier-cap violation, replayed lobbyId), creating phantom
       * coins that didn't exist server-side. 401 stays optimistic and
       * relies on the syncQueue to reconcile on sign-in. */
      applyEconomyActionWithRollback(
        {
          action: 'mp_payout',
          payload: { lobbyId: mpLobbyId, placement, amount: payout, tier },
        },
        () => useGameStore.setState({ coins: prevCoins }),
      ).then((res) => {
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
    /* Tournament entry fees + prize pools come from remote config so live-ops
     * can re-balance the economy without an app update. Falls back to the
     * baked-in values when remote config hasn't loaded yet — the server's
     * canonical TOURNAMENT_CONFIGS is the ultimate source of truth and will
     * reject mismatches at the /economy/transaction layer regardless. */
    const remote = getConfig();
    const remoteFees = remote.tournamentEntryFees ?? { daily: 100, weekly: 500, champion: 1000 };
    const remotePrizes = remote.tournamentPrizes ?? { daily: 4600, weekly: 23000, champion: 46000 };
    const configs: Record<string, { entryFee: number; prizePool: number }> = {
      'daily-blitz':           { entryFee: remoteFees.daily,    prizePool: remotePrizes.daily },
      'weekly-cup':            { entryFee: remoteFees.weekly,   prizePool: remotePrizes.weekly },
      'champion-invitational': { entryFee: remoteFees.champion, prizePool: remotePrizes.champion },
    };
    const config = configs[tournamentId];
    if (!config) return { ok: false, reason: 'Unknown tournament.' };
    if (coins < config.entryFee) return { ok: false, reason: `Need ${config.entryFee} coins, you have ${coins}.` };

    /* Tournament entry: optimistically debit then call server. Rollback
     * on permanent failure (e.g. server-side balance < entryFee). 401 /
     * 5xx keep the optimistic debit and let the syncQueue settle once
     * connectivity returns. Previously the "local fallback" branch
     * silently swallowed 4xx errors and let the player enter for free —
     * the server never recorded the entry, but local state was debited
     * anyway. The new flow refuses the entry on permanent rejection. */
    const prevCoins = coins;
    const optimisticBalance = coins - config.entryFee;
    set({ coins: optimisticBalance });

    const res = await applyEconomyActionWithRollback(
      {
        action: 'tournament_entry',
        payload: { tournamentId },
      },
      () => useGameStore.setState({ coins: prevCoins }),
    );

    let newBalance: number;
    if (res.ok) {
      newBalance = res.balance;
    } else if (res.status === 401 || res.status === 0) {
      // Queued — keep optimistic debit; queue will settle on sign-in / when
      // we're back online. Both auth (401) and network (0) failures go
      // through the syncQueue with the original idempotencyKey.
      newBalance = optimisticBalance;
    } else {
      // Permanent rejection — rollback already restored prevCoins.
      if (__DEV__) console.warn('[enterTournament] server rejected', res.status, res.message);
      return { ok: false, reason: res.message || 'Server rejected tournament entry.' };
    }

    // Shuffle marbles (Fisher-Yates)
    const marbleIds = MARBLES.map(m => m.id);
    for (let i = marbleIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [marbleIds[i], marbleIds[j]] = [marbleIds[j], marbleIds[i]];
    }

    // Pick one random course per round
    const coursePool = [...COURSES];
    for (let i = coursePool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [coursePool[i], coursePool[j]] = [coursePool[j], coursePool[i]];
    }

    const rounds: TournamentRound[] = [];
    for (let i = 0; i < TOURNAMENT_ROUNDS; i++) {
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

      /* Placement bonus on elimination. remainingIds.length at this point
       * is the count BEFORE eliminating lastPlaceId, so:
       *   - 2 remaining → eliminated marble is 2nd place (final round)
       *   - 3 remaining → eliminated marble is 3rd place (semi-final)
       * Anything earlier (4+ remaining) gets no placement bonus — those
       * marbles already pocketed their per-round survival payout. */
      const remote = getConfig();
      const tier = tourney.tournamentId === 'daily-blitz' ? 'daily'
        : tourney.tournamentId === 'weekly-cup' ? 'weekly'
        : 'champion';
      let placementBonus = 0;
      let placementLabel = '';
      if (remainingIds.length === 2) {
        placementBonus = remote.tournamentSecondPrizes?.[tier] ?? 0;
        placementLabel = '2nd place';
      } else if (remainingIds.length === 3) {
        placementBonus = remote.tournamentThirdPrizes?.[tier] ?? 0;
        placementLabel = '3rd place';
      }

      if (placementBonus > 0) {
        tourney.totalEarned += placementBonus;
        const newCoinHistoryElim = [...coinHistory, {
          type: 'payout' as const,
          amount: placementBonus,
          description: `Tournament ${placementLabel} prize`,
          timestamp: Date.now(),
        }];
        while (newCoinHistoryElim.length > 200) newCoinHistoryElim.shift();
        set({
          tournaments: tourney,
          coins: coins + placementBonus,
          coinHistory: newCoinHistoryElim,
        });
        applyEconomyAction({
          action: 'tournament_payout',
          payload: { tournamentId: tourney.tournamentId, amount: placementBonus },
        }).then((res) => {
          if (res.ok) {
            useGameStore.setState({ coins: res.balance });
          } else if (__DEV__) {
            console.warn('[tournament_payout placement]', res.message);
          }
        });
        return;
      }

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
      const isChampionRound = tourney.currentRound >= TOURNAMENT_ROUNDS;
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
    if (tourney.currentRound >= TOURNAMENT_ROUNDS) {
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

    /* Compute the post-promo grant BEFORE the daily-cap check. Previously
     * the cap used `pack.coins` (the base amount) while the player actually
     * received `pack.coins * coinMultiplier` from any active double_coins
     * promo. A player could blow the 25k/day cap by 2x simply by buying
     * during a promo — the cap check passed because base pack.coins fit
     * under the cap, but the credited amount didn't. Fixed by sizing the
     * cap check off the actual amount we're about to credit. */
    const coinMultiplier = getPromoMultiplier('double_coins');
    const grantedCoins = Math.round(pack.coins * coinMultiplier);

    if (coinsPurchasedToday + grantedCoins > getMaxDailyCoins()) {
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
      // Track the post-promo grant against the daily cap so subsequent
      // purchases see the real amount credited today, not the base pack.coins.
      storeCoinsPurchasedToday: coinsPurchasedToday + grantedCoins,
      storeLastPurchaseDate: today,
    });

    return { success: true, coins: grantedCoins };
  },

  // ── Rewarded Ads ──
  /* Non-persisted: the server is the source of truth for the daily cap.
   * Resetting on cold start is intentional — the next claimRewardedAd()
   * call sees the server's authoritative count and updates `adsWatchedToday`
   * from the server response (or refuses with `Daily cap reached`). */
  adsWatchedToday: 0,
  lastAdDate: '',

  claimRewardedAd: async () => {
    const today = todayUtc();
    const { adsWatchedToday, lastAdDate, coinHistory } = get();

    // Reset local counter on a fresh UTC day.
    const watchedSoFar = lastAdDate === today ? adsWatchedToday : 0;
    if (lastAdDate !== today) {
      set({ adsWatchedToday: 0, lastAdDate: today });
    }

    // Client-side cap so the UI matches what the server will enforce.
    if (watchedSoFar >= 5) {
      return { ok: false, message: 'Daily cap reached' };
    }

    // Show the ad. The util resolves with `watched: false` if the user
    // dismissed before completion (or if the SDK failed to load a fill).
    let watched = false;
    try {
      const result = await showRewardedAd();
      watched = !!result?.watched;
    } catch (err) {
      if (__DEV__) console.warn('[claimRewardedAd] showRewardedAd threw', err);
      return { ok: false, message: 'Ad not completed' };
    }
    if (!watched) {
      return { ok: false, message: 'Ad not completed' };
    }

    /* Per-ad nonce → idempotency key. If the user double-taps or the
     * network hiccups mid-grant, the server replays the prior result
     * instead of double-crediting. */
    const nonce =
      typeof (globalThis as any).crypto?.randomUUID === 'function'
        ? (globalThis as any).crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const res = await applyEconomyAction({
      action: 'reward_ad' as EconomyAction,
      payload: {},
      idempotencyKey: nonce,
    });

    if (!res.ok) {
      if (__DEV__) console.warn('[claimRewardedAd]', res.status, res.message);
      return { ok: false, message: res.message };
    }

    /* Server-confirmed grant. Trust the server balance over any optimistic
     * local addition — `coinHistory` is local-only metadata so we append
     * the +100 line for the UI ledger. */
    const granted =
      (res.result?.granted as number | undefined) ??
      (res.transaction?.amount as number | undefined) ??
      100;

    const newCoinHistory = [
      {
        type: 'payout' as const,
        amount: granted,
        description: 'Rewarded ad',
        timestamp: Date.now(),
      },
      ...coinHistory,
    ];
    while (newCoinHistory.length > 200) newCoinHistory.pop();

    set({
      coins: res.balance,
      adsWatchedToday: watchedSoFar + 1,
      lastAdDate: today,
      coinHistory: newCoinHistory,
    });

    return { ok: true, granted };
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
    const { challenges, coins: prevCoins, coinHistory } = get();
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
      coins: prevCoins + challenge.reward,
      coinHistory: newCoinHistory,
      challenges: { ...challenges, daily: updatedDaily, weekly: updatedWeekly },
    });

    /* Server-authoritative claim. Rolls back the optimistic +reward on
     * permanent (non-401) rejection — without rollback a server-side
     * "already claimed" (409) or invalid-challenge (404) would leave the
     * client showing a phantom balance forever. The challenge-claimed
     * flag stays set either way (the optimistic UI state remains useful
     * for "you already claimed this") — only the coin total rolls back.
     *
     * 401 (signed-out) keeps the optimistic credit; the queued action
     * settles on sign-in via the server's natural-key idempotency. */
    applyEconomyActionWithRollback(
      {
        action: 'claim_challenge',
        payload: { challengeId },
      },
      () => useGameStore.setState({ coins: prevCoins }),
    ).then((res) => {
      if (res.ok) {
        useGameStore.setState({ coins: res.balance });
      } else if (__DEV__) {
        console.warn('[claim_challenge]', res.message);
      }
    });
  },

  getOdds: () => currentOdds,

  placeBet: async () => {
    const { coins, betAmount, selectedMarble, betsToday, lastBetDate, coinHistory, activeMode, selectedCourseId, betType, exactaPicks } = get();
    // For exacta need 2 picks, trifecta need 3, win needs selectedMarble
    if (betType === 'exacta' && exactaPicks.length < 2) return { ok: false, status: -1, message: 'Pick 2 marbles for an exacta.' };
    if (betType === 'trifecta' && exactaPicks.length < 3) return { ok: false, status: -1, message: 'Pick 3 marbles for a trifecta.' };
    if (betType === 'win' && !selectedMarble) return { ok: false, status: -1, message: 'Pick a marble.' };
    if (betAmount > coins) return { ok: false, status: -1, message: `Need ${betAmount} coins, have ${coins}.` };

    // Reset daily bet counter if new day
    const today = new Date().toISOString().slice(0, 10);
    const todayBets = lastBetDate === today ? betsToday : 0;

    // Honor an explicitly-selected course in every mode. Bet mode used
    // to randomize unconditionally — that was right for the legacy
    // lobby Hero card (no course pre-selected) but wrong for the Quick
    // Race → Bet flow where the user just picked a specific course.
    // Now: random ONLY when bet mode has no selected course (lobby
    // fallback); otherwise the user races on what they bet on.
    const courseId = (activeMode.type === 'bet' && !selectedCourseId)
      ? COURSES[Math.floor(Math.random() * COURSES.length)].id
      : selectedCourseId;

    // Log the bet transaction locally so it appears in coin history regardless
    // of server outcome. The actual coin debit is server-driven.
    const newCoinHistory = [...coinHistory, {
      type: 'bet' as const,
      amount: -betAmount,
      description: betType === 'exacta' ? `Exacta: ${exactaPicks.map(p => p.name).join(' > ')}`
                 : betType === 'trifecta' ? `Trifecta: ${exactaPicks.map(p => p.name).join(' > ')}`
                 : `Bet on ${selectedMarble?.name}`,
      timestamp: Date.now(),
    }];
    while (newCoinHistory.length > 200) newCoinHistory.shift();

    // Server-authoritative bet placement. The server validates the bet,
    // deducts coins, and returns the new balance + betId. We persist the
    // betId so settle_bet (after the race) can reference the canonical
    // bet amount from the ledger row instead of trusting the client.
    const marbleId = betType === 'win' ? selectedMarble?.id : exactaPicks[0]?.id;
    const res = await applyEconomyAction({
      action: 'place_bet',
      payload: { amount: betAmount, marbleId, courseId, betType },
    });

    if (res.ok) {
      const betId = (res.result?.betId as string | undefined) ?? null;
      set({
        coins: res.balance,
        currentBetId: betId,
        betsToday: todayBets + 1,
        lastBetDate: today,
        selectedCourseId: courseId,
        screen: 'race',
        coinHistory: newCoinHistory,
      });
      return { ok: true };
    }

    // Treat 401 (signed-out), 0 (network failure), AND 5xx (server hiccup)
    // all as "queued for retry" — proceed optimistically with local debit so
    // the user can play the race. The action is already in the syncQueue
    // courtesy of applyEconomyAction; idempotencyKey prevents double-spend
    // on retry. Previously only 401 / 0 took this path; a transient server
    // 502/503 blocked the bet entirely even though it was queued.
    if (res.status === 401 || res.status === 0 || (res.status >= 500 && res.status < 600)) {
      set({
        coins: coins - betAmount,
        currentBetId: null,
        betsToday: todayBets + 1,
        lastBetDate: today,
        selectedCourseId: courseId,
        screen: 'race',
        coinHistory: newCoinHistory,
      });
      return { ok: true };
    }

    // Permanent failure (4xx other than 401, or explicit refusal). Do NOT
    // deduct locally — the server didn't take the bet. Bubble the actual
    // status + message so the betting screen can show the user what's
    // wrong instead of a generic "check your connection".
    if (__DEV__) console.warn('[placeBet] server rejected', res.status, res.message);
    return { ok: false, status: res.status, message: res.message };
  },

  settleBet: async (payout: number) => {
    const { currentBetId, coins } = get();
    if (!currentBetId) {
      // No in-flight bet to settle — happens in quick race / tournament /
      // playoff modes where no place_bet was issued. Nothing to do.
      return;
    }
    const res = await applyEconomyAction({
      action: 'settle_bet',
      payload: { betId: currentBetId, payout },
    });
    if (res.ok) {
      set({ coins: res.balance, currentBetId: null });
      return;
    }
    // Offline (401 / network 0): credit the payout locally so the player
    // sees their winnings now. The settle_bet action is queued and will
    // replay with the same idempotencyKey when we're back online — server
    // will reconcile to the canonical amount (idempotency prevents double
    // credit). Previously the payout was silently dropped offline and the
    // user thought they lost a winning bet.
    if (res.status === 401 || res.status === 0) {
      set({ coins: coins + payout, currentBetId: null });
      return;
    }
    if (__DEV__) console.warn('[settleBet]', res.status, res.message);
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

    /* Do NOT mark lastPlayedDate yet — we used to set it here optimistically
     * which meant a failed claimDailyBonus (offline / 5xx) silently burned
     * the user's daily bonus: the next checkDailyStreak call saw today's
     * date and returned null, so the bonus was never retried. Now we only
     * mark lastPlayedDate inside claimDailyBonus AFTER the server response
     * confirms the bonus was credited (or the natural-key idempotency
     * server-side rejects a true replay). */
    return { reward: 0, streak: 0, pendingServer: true };
  },

  /**
   * Server-authoritative daily bonus claim. Server computes the reward
   * based on the player's authoritative streak, rejects double-claims for
   * the same day, and returns the new coin balance.
   */
  claimDailyBonus: async () => {
    const { coinHistory } = get();
    const today = new Date().toISOString().slice(0, 10);
    const res = await applyEconomyAction({ action: 'claim_daily' });
    if (!res.ok) {
      // 409 = already claimed today — server has the canonical "claimed today"
      // signal, so we trust it: mark lastPlayedDate locally so we stop pinging.
      if (res.status === 409) {
        set({ lastPlayedDate: today });
        return null;
      }
      // Network / 5xx / 401 — don't mark today as claimed; let the user retry
      // on next foreground / sign-in.
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
      lastPlayedDate: today,
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
        marbleAnalytics: state.marbleAnalytics,
        settings: state.settings,
        referralCode: state.referralCode,
        referrals: state.referrals,
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
      version: 11,
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
           * Previously this returned a partial object and relied on Zustand
           * persist's shallow merge with the factory defaults. That worked
           * by accident but is fragile: any future change to the factory's
           * initial values would silently change what migrated installs
           * see. Now we enumerate every persisted field explicitly.
           *
           * Keeps:
           *   - playerName, hasSeenIntroRace, passTrack
           *   - achievements (purely client-side, no server analog)
           *   - equippedSkins, customTracks (player customization)
           */
          return {
            // Preserve client-side / identity fields
            playerName: persisted?.playerName ?? '',
            hasSeenIntroRace: true,
            passTrack: persisted?.passTrack ?? 'free',
            achievements: persisted?.achievements ?? {},
            equippedSkins: persisted?.equippedSkins ?? {},
            customTracks: persisted?.customTracks ?? [],

            // Explicit reset of everything else to defaults
            coins: 1000,
            totalRaces: 0,
            totalWins: 0,
            currentStreak: 0,
            bestStreak: 0,
            dailyStreak: 0,
            marbleStats: {},
            seasonStandings: {},
            seasonWeek: 1,
            lastPlayedDate: null,
            lastBetDate: '',
            raceHistory: [],
            passLevel: 1,
            passXp: 0,
            coinHistory: [],
            season: null,
            nationalRaces: {},
            tournaments: null,
            storePurchasesToday: 0,
            storeCoinsPurchasedToday: 0,
            storeLastPurchaseDate: '',
            challenges: { daily: [], weekly: [], lastDailyReset: '', lastWeeklyReset: '' },
            marbleAnalytics: {},
          };
        }
        if (version < 8) {
          /* Deep analytics added in v8 — backfill an empty record so the
           * analytics screen reads a defined map on existing installs. */
          persisted.marbleAnalytics = persisted.marbleAnalytics ?? {};
        }
        if (version < 9) {
          /* Settings toggles added in v9 — backfill defaults so existing
           * installs get a fully-populated settings object. Merge per-key
           * so a partial persisted object still gets every flag. */
          persisted.settings = { ...DEFAULT_SETTINGS, ...(persisted.settings ?? {}) };
        }
        if (version < 10) {
          /* Referral / invite-friends state added in v10. Default the code
           * to '' (the screen lazily derives + persists it on first open
           * via ensureReferralCode) and the referrals list to empty — the
           * list is server-populated, so existing installs start clean. */
          persisted.referralCode = persisted.referralCode ?? '';
          persisted.referrals = persisted.referrals ?? [];
        }
        if (version < 11) {
          /* Older season states (pre-Madden update) lacked seasonHistory
           * and other later-added fields. Backfilling here prevents a
           * crash on the playoff Skip button when the champion path
           * spreads `season.seasonHistory`. */
          if (persisted.season) {
            persisted.season.seasonHistory = persisted.season.seasonHistory ?? [];
            persisted.season.seasonStats = persisted.season.seasonStats ?? {};
            persisted.season.condition = persisted.season.condition ?? {};
            persisted.season.trainingHistory = persisted.season.trainingHistory ?? [];
            persisted.season.trainedThisWeek = persisted.season.trainedThisWeek ?? false;
            persisted.season.rivalMarbleId = persisted.season.rivalMarbleId ?? null;
            persisted.season.rivalWins = persisted.season.rivalWins ?? 0;
            persisted.season.rivalLosses = persisted.season.rivalLosses ?? 0;
            persisted.season.seasonMode = persisted.season.seasonMode ?? 'bettor';
            persisted.season.seasonMarbleId = persisted.season.seasonMarbleId ?? null;
          }
        }
        return persisted;
      },
    }
  )
);
