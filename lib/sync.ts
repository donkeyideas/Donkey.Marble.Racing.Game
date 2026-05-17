import { api, getToken } from './api';

/**
 * Fire-and-forget: runs in background, never blocks UI.
 * If sync fails, game continues normally.
 */
function syncInBackground(fn: () => Promise<void>): void {
  fn().catch((err) => {
    if (__DEV__) {
      console.warn('[sync]', err.message);
    }
  });
}

export function syncRaceResult(data: {
  courseId: string;
  courseTheme: string;
  gameMode: string;
  finishOrder: string[];
  playerPickId: string | null;
  betAmount: number;
  payout: number;
  playerPlacement: number;
  won: boolean;
  currentCoins: number;
  odds?: number;
  winnerTime?: number;
  modeContext?: unknown;
}): void {
  syncInBackground(async () => {
    const token = await getToken();
    if (!token) return;
    await api.post('/sync/race', data);
  });
}

export function syncPurchase(data: {
  productId: string;
  /** Real purchase token from the platform store (Google Play / App Store). REQUIRED. */
  purchaseToken: string;
  currentCoins: number;
}): void {
  if (!data.purchaseToken) {
    // Hard guard: never call sync without a real store token. The server
    // requires Google Play / App Store verification and will reject empty
    // tokens with 402.
    if (__DEV__) console.warn('[syncPurchase] called without purchaseToken — skipping');
    return;
  }
  syncInBackground(async () => {
    const token = await getToken();
    if (!token) return;
    await api.post('/sync/purchase', data);
  });
}

export function syncPlayerState(data: {
  playerName: string;
  coins: number;
  totalRaces: number;
  totalWins: number;
  currentStreak: number;
  bestStreak: number;
  dailyStreak: number;
  passLevel: number;
  passXp: number;
}): void {
  syncInBackground(async () => {
    const token = await getToken();
    if (!token) return;
    await api.post('/sync/state', data);
  });
}
