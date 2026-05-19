import AsyncStorage from '@react-native-async-storage/async-storage';

/* ------------------------------------------------------------------ */
/*  Remote Config — fetches economy values from admin API              */
/*  Falls back to hardcoded defaults if offline/error                  */
/* ------------------------------------------------------------------ */

const CONFIG_URL = __DEV__
  ? 'http://localhost:3003/api/game-config'
  : 'https://marble-admin.donkeyideas.com/api/game-config';

const CACHE_KEY = 'dmr-remote-config';
const STALE_MS = 5 * 60 * 1000; // refetch every 5 minutes

export interface RemoteConfig {
  betAmounts: number[];
  dailyRewards: number[];
  houseEdge: number;
  maxDailyPurchases: number;
  maxDailyCoins: number;
  tournamentPrizes: { daily: number; weekly: number; champion: number };
  /* Optional because the admin API doesn't emit this yet — clients fall back
   * to the DEFAULT_CONFIG values when the field is absent. Adding the field
   * server-side is a follow-up; the server's canonical TOURNAMENT_CONFIGS
   * already validates entry fees so this is purely a UI hint. */
  tournamentEntryFees?: { daily: number; weekly: number; champion: number };
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
  trackBgImages: {},
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
