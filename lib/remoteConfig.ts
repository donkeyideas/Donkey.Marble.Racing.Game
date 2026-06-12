import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PerfTier } from '../utils/perfBudget';
export type { PerfTier } from '../utils/perfBudget';

/* ------------------------------------------------------------------ */
/*  Remote Config — fetches economy values from admin API              */
/*  Falls back to hardcoded defaults if offline/error                  */
/* ------------------------------------------------------------------ */

/* __DEV__ is a Metro-injected global — guard the reference so this
 * module can also be imported by plain-Node tooling (track audit
 * scripts) without a "ReferenceError: __DEV__ is not defined" at load.
 * In the app Metro always defines it; in Node it's treated as prod. */
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;
const CONFIG_URL = IS_DEV
  ? 'http://localhost:3003/api/game-config'
  : 'https://marble-admin.donkeyideas.com/api/game-config';

const CACHE_KEY = 'dmr-remote-config';
/* Cache window dropped 5min → 60s. Combined with the foreground-refetch
 * hook in sessionTracker, this means an admin pushing a new track
 * background sees it appear on the app within ~60 seconds (or instantly
 * on the next foreground transition). The old 5-min window was tuned
 * for steady-state cost but made live-ops testing painful. */
const STALE_MS = 60 * 1000;

export interface RemoteConfig {
  betAmounts: number[];
  dailyRewards: number[];
  houseEdge: number;
  maxDailyPurchases: number;
  maxDailyCoins: number;
  tournamentPrizes: { daily: number; weekly: number; champion: number };
  tournamentEntryFees?: { daily: number; weekly: number; champion: number };
  /* Per-tier 2nd and 3rd place placement bonuses. Awarded when the
   * player's marble is eliminated in the final round (2nd place) or the
   * semi-final (3rd place). Distinct from per-round survival payouts. */
  tournamentSecondPrizes?: { daily: number; weekly: number; champion: number };
  tournamentThirdPrizes?: { daily: number; weekly: number; champion: number };
  /* Per-tier round-by-round survival payouts. 7-element array, index =
   * round number (0-based). Rounds 0-2 are typically 0 (free play),
   * 3-5 are escalating survival rewards, index 6 is the champion prize.
   * Falls back to a hardcoded matrix in DEFAULT_CONFIG when absent. */
  tournamentRoundPayouts?: { daily: number[]; weekly: number[]; champion: number[] };
  /* Season playoff placement payouts (franchise mode) + season-complete
   * consolation for both modes. */
  playoffPayouts?: {
    champion: number;
    runnerUp: number;
    top3: number;
    qualified: number;
    bettorComplete: number;
  };
  /* Season starter bonus: base + increment × (seasonNum - 2), capped. */
  seasonStarterBonus?: { base: number; increment: number; cap: number };
  /* National race economy. entry = coin cost to play; firstMult = 1st
   * place payout = entry × firstMult; secondRatio/thirdRatio applied to
   * the 1st place payout. */
  nationalRaces?: {
    grandPrix:  { entry: number; firstMult: number };
    marbleMile: { entry: number; firstMult: number };
    speedDemon: { entry: number; firstMult: number };
    chaosCup:   { entry: number; firstMult: number };
    secondRatio: number;
    thirdRatio:  number;
  };
  /* Multiplayer tournament economy. Pool is the displayed prize pool;
   * placementRatios distributes pool × (1 - rake). */
  multiplayer?: {
    blitz:        { entry: number; pool: number };
    cup:          { entry: number; pool: number };
    invitational: { entry: number; pool: number };
    rake: number;
    /* first/second/third are used by the 'standard' payout mode;
     * fourth is consumed by 'survivors' mode (4-place payout). */
    placementRatios: { first: number; second: number; third: number; fourth?: number };
  };
  /* Challenge coin rewards. Mirror data/challenges.ts shape. */
  challenges?: {
    daily:  { win: number; top3: number; streak2: number; wins3: number };
    weekly: { races5: number; marbles3: number; races10: number; marbles5: number };
  };
  /* Season Pass milestone coin rewards at fixed levels. */
  passMilestones?: {
    level2: number; level5: number; level10: number; level15: number; level20: number;
  };
  /* In-app coin pack grants. IAP price is set in App Store / Play Store
   * — only the coin grant + promo multiplier are tunable here. */
  storePacks?: {
    starter: { coins: number };
    popular: { coins: number; promo: number };
    big:     { coins: number; promo: number };
    whale:   { coins: number; promo: number };
  };
  /* Bet house edge — proportion of fair odds the house keeps. 0.10 =
   * payouts use 90% of fair odds. */
  betHouseEdge?: number;
  /* Season-pass XP grants per race mode. */
  passXp?: { betRace: number; quickRace: number; winBonus: number };
  xpPerLevel: number;
  /**
   * Per-track custom background images. Maps a course id (e.g.
   * "gen-1043", "grand-prix-cyber") to an image URL hosted on a CDN /
   * S3 bucket the admin controls. When a race loads, if there's a URL
   * for the current course id, the race screen renders that image as
   * the background tile INSTEAD of the bundled theme sprite.
   *
   * Use cases:
   *   - Sponsored skins: "Pepsi presents Iron Run" with a Pepsi-branded
   *     background only on that one course
   *   - Seasonal: drop a snowy backdrop on every Daily-Blitz course in
   *     December without releasing a new app build
   *   - Event-specific: special background for the championship race
   *
   * Image requirements: portrait tile that repeats vertically. ~390×844
   * matches the phone screen. PNG/JPG. Any HTTPS URL works.
   *
   * Empty map → every track uses its native bundled background. Course
   * ids without an entry use their native bg.
   */
  trackBgImages?: Record<string, string>;
  /**
   * Master switch for the "Watch ad for coins" feature. When false,
   * the Store UI hides the rewarded-ad tile entirely so we can disable
   * the feature remotely (e.g. if AdMob fill drops, policy issues, or
   * during App Store / Play Store review). Defaults false so the
   * feature stays dark until explicitly turned on per platform.
   */
  feature_rewarded_ads?: boolean;
  /**
   * Runtime switch for the Rapier physics engine. When true, races
   * route through engine/race-rapier.ts; otherwise they use the
   * Matter.js implementation. Lets us A/B Rapier without an app
   * rebuild once the native-module bridge ships. Default false (cached
   * config absent → build-time fallback in engineConfig.ts wins).
   */
  feature_rapier_engine?: boolean;
  /**
   * Per-device performance tier. Drives how much physics + telemetry
   * work the race loop does. Used to pull older / mid-range phones
   * into a playable framerate without dragging flagship devices down.
   *
   *   - "low":    1 substep, telemetry every 6 frames, dense
   *               procedural obstacles trimmed (~25% fewer pegs +
   *               smaller ball pits).
   *   - "medium": 2 substeps (default), telemetry every 3 frames.
   *   - "high":   2 substeps, telemetry every frame, full obstacle
   *               density. Flagship-tier knobs.
   *
   * The device picks a tier locally on first launch via
   * utils/perfTier.ts; admins can override per-cohort by setting this
   * field. The remote value, when present, ALWAYS wins over the
   * locally-detected tier — useful for forcing "low" on a problematic
   * device model after a support ticket.
   */
  perfTier?: PerfTier;
}

export const DEFAULT_CONFIG: RemoteConfig = {
  betAmounts: [25, 100, 250, 500],
  dailyRewards: [200, 250, 300, 350, 400, 500, 750],
  houseEdge: 0.10,
  maxDailyPurchases: 3,
  maxDailyCoins: 25000,
  tournamentPrizes: { daily: 4600, weekly: 23000, champion: 46000 },
  // Must match data/seasonPass.ts XP_PER_LEVEL. Previously 1000, which
  // de-synced the level-up math when remote config briefly returned the
  // default before the live values loaded — players would jump 3 levels
  // on a single win until the fetch completed.
  xpPerLevel: 3500,
  /* Per-tier multiplayer entry fees. Matches MP_TIERS in lib/multiplayer.ts;
   * the server validates against canonical values from
   * apps/dashboard/.../economy-config.ts so this is just a UI hint. */
  tournamentEntryFees: { daily: 100, weekly: 500, champion: 1000 },
  /* All defaults below mirror admin SEED so an offline first-run client
   * sees the same payouts as the live server. */
  tournamentSecondPrizes: { daily: 1150, weekly: 5750, champion: 11500 },
  tournamentThirdPrizes:  { daily: 460,  weekly: 2300, champion: 4600 },
  tournamentRoundPayouts: {
    daily:    [0, 0, 0, 50,  100,  250,  4600],
    weekly:   [0, 0, 0, 250, 500,  1250, 23000],
    champion: [0, 0, 0, 500, 1000, 2500, 46000],
  },
  playoffPayouts: {
    champion: 5000, runnerUp: 2500, top3: 1000,
    qualified: 1500, bettorComplete: 1500,
  },
  seasonStarterBonus: { base: 500, increment: 250, cap: 2500 },
  nationalRaces: {
    grandPrix:  { entry: 500, firstMult: 5 },
    marbleMile: { entry: 300, firstMult: 3 },
    speedDemon: { entry: 200, firstMult: 2 },
    chaosCup:   { entry: 400, firstMult: 4 },
    secondRatio: 0.5, thirdRatio: 0.25,
  },
  multiplayer: {
    blitz:        { entry: 100,  pool: 5000 },
    cup:          { entry: 500,  pool: 25000 },
    invitational: { entry: 1000, pool: 50000 },
    rake: 0.20,
    placementRatios: { first: 0.60, second: 0.20, third: 0.10, fourth: 0.05 },
  },
  challenges: {
    daily:  { win: 300, top3: 200, streak2: 400, wins3: 500 },
    weekly: { races5: 1500, marbles3: 2000, races10: 2000, marbles5: 2500 },
  },
  passMilestones: {
    level2: 200, level5: 500, level10: 1000, level15: 2000, level20: 1500,
  },
  storePacks: {
    starter: { coins: 1000 },
    popular: { coins: 6000,  promo: 0.20 },
    big:     { coins: 15000, promo: 0.50 },
    whale:   { coins: 40000, promo: 0.60 },
  },
  betHouseEdge: 0.10,
  passXp: { betRace: 250, quickRace: 125, winBonus: 500 },
  trackBgImages: {},
  feature_rewarded_ads: false,
  feature_rapier_engine: false,
  // perfTier left undefined here so the device-side auto-detection
  // (utils/perfTier.ts) governs unless an admin explicitly overrides.
};

/** XP required to advance one Season Pass level. Reads live remote config
 *  with a safe fallback to the baked-in default. Use this everywhere
 *  XP-per-level math is needed instead of importing the constant directly
 *  — that way admins can re-tune progression speed without an app update. */
export function getXpPerLevel(): number {
  const v = getConfig().xpPerLevel;
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_CONFIG.xpPerLevel;
}

let cached: RemoteConfig | null = null;
let lastFetchTime = 0;

/** Load config from AsyncStorage cache (synchronous after first call) */
export async function loadCachedConfig(): Promise<RemoteConfig> {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      cached = JSON.parse(raw) as RemoteConfig;
      return cached;
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULT_CONFIG;
}

/** Fetch fresh config from admin API, cache it locally */
export async function fetchRemoteConfig(): Promise<RemoteConfig> {
  const now = Date.now();
  if (cached && now - lastFetchTime < STALE_MS) {
    return cached;
  }

  try {
    const res = await fetch(CONFIG_URL, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: RemoteConfig = await res.json();

    // Validate shape minimally
    if (!Array.isArray(data.betAmounts) || !Array.isArray(data.dailyRewards)) {
      throw new Error('Invalid config shape');
    }

    cached = data;
    lastFetchTime = now;
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
    return data;
  } catch {
    // On any failure, return cached or defaults
    return cached ?? DEFAULT_CONFIG;
  }
}

/** Get current config (cached in memory, never throws) */
export function getConfig(): RemoteConfig {
  return cached ?? DEFAULT_CONFIG;
}

/** True when the rewarded-ad "watch for coins" feature is enabled via
 *  remote config. Store UI calls this to decide whether to render the
 *  watch-ad tile. Defaults false (feature off) when remote config is
 *  missing or the field is absent. */
export function isRewardedAdsEnabled(): boolean {
  return getConfig().feature_rewarded_ads === true;
}
