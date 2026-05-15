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
  productName: string;
  priceUsd: number;
  coinsGranted: number;
  currentCoins: number;
}): void {
  syncInBackground(async () => {
    const token = await getToken();
    if (!token) return;
    await api.post('/sync/purchase', data);
  });
}

export function syncPlayerState(data: {
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
