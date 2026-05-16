import AsyncStorage from '@react-native-async-storage/async-storage';

/* ------------------------------------------------------------------ */
/*  Remote Config — fetches economy values from admin API              */
/*  Falls back to hardcoded defaults if offline/error                  */
/* ------------------------------------------------------------------ */

const CONFIG_URL = __DEV__
  ? 'http://localhost:3001/api/game-config'
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
  xpPerLevel: number;
}

export const DEFAULT_CONFIG: RemoteConfig = {
  betAmounts: [25, 100, 250, 500],
  dailyRewards: [200, 250, 300, 350, 400, 500, 750],
  houseEdge: 0.10,
  maxDailyPurchases: 3,
  maxDailyCoins: 25000,
  tournamentPrizes: { daily: 4600, weekly: 23000, champion: 46000 },
  xpPerLevel: 1000,
};

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
