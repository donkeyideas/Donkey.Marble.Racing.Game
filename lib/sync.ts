import { api, getToken } from './api';
import { newIdempotencyKey } from './economy';

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

interface RaceSyncResponse {
  success: true;
  raceId: string;
  balance: number;
  banned: boolean;
  duplicate?: boolean;
}

/**
 * Sync a race result. Server computes the coin balance change atomically
 * (bet - payout) and returns the new authoritative balance via
 * `onAuthoritative`. The client should reconcile its local coins from that
 * value rather than trusting its own computation.
 *
 * The `idempotencyKey` (auto-generated if not supplied) protects against
 * duplicate submissions on retry.
 */
export function syncRaceResult(
  data: {
    courseId: string;
    courseTheme: string;
    gameMode: string;
    finishOrder: string[];
    playerPickId: string | null;
    betAmount: number;
    payout: number;
    playerPlacement: number;
    won: boolean;
    odds?: number;
    winnerTime?: number;
    modeContext?: unknown;
    idempotencyKey?: string;
  },
  onAuthoritative?: (balance: number) => void,
): void {
  const idempotencyKey = data.idempotencyKey ?? newIdempotencyKey();
  syncInBackground(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await api.post<RaceSyncResponse>('/sync/race', { ...data, idempotencyKey });
    if (res && typeof res.balance === 'number' && onAuthoritative) {
      onAuthoritative(res.balance);
    }
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

interface StateSyncResponse {
  success: true;
  banned: boolean;
  state: {
    playerName: string;
    coins: number;
    totalRaces: number;
    totalWins: number;
    currentStreak: number;
    bestStreak: number;
    dailyStreak: number;
    passLevel: number;
    passXp: number;
    passTier: string;
    status: string;
  };
  config: Record<string, string>;
}

/**
 * Sync player state — push non-economy hints (playerName, streaks, pass XP)
 * and PULL the server's authoritative state. Server is the source of truth
 * for coins / totalRaces / totalWins / dailyStreak. The caller should use
 * `onAuthoritative` to reconcile local state.
 */
export function syncPlayerState(
  data: {
    playerName?: string;
    currentStreak?: number;
    bestStreak?: number;
    passLevel?: number;
    passXp?: number;
  },
  onAuthoritative?: (state: StateSyncResponse['state']) => void,
): void {
  syncInBackground(async () => {
    const token = await getToken();
    if (!token) return;
    const res = await api.post<StateSyncResponse>('/sync/state', data);
    if (res?.state && onAuthoritative) {
      onAuthoritative(res.state);
    }
  });
}
