import { api, getToken, clearToken } from './api';
import { newIdempotencyKey } from './economy';
import { enqueueRaceSync } from './raceSyncQueue';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const body = { ...data, idempotencyKey };

  // Run in background but DO NOT silently drop failures — enqueue them so
  // the next flush (foreground / sign-in / next successful race) replays
  // the missing race against /sync/race. Server idempotency-keys prevent
  // double-recording if the original call actually succeeded but its
  // response was dropped.
  (async () => {
    try {
      const token = await getToken();
      if (!token) {
        await enqueueRaceSync({ payload: body, idempotencyKey, addedAt: Date.now() });
        return;
      }
      const res = await api.post<RaceSyncResponse>('/sync/race', body);
      if (res && typeof res.balance === 'number' && onAuthoritative) {
        onAuthoritative(res.balance);
      }
    } catch (err: any) {
      const status: number = err?.status ?? 0;
      // Permanent client error other than 401 — dropping is the only
      // safe option (replay won't change anything). Anything else gets
      // queued for retry.
      const isPermanent = status >= 400 && status < 500 && status !== 401;
      if (!isPermanent) {
        await enqueueRaceSync({ payload: body, idempotencyKey, addedAt: Date.now() });
      }
      if (__DEV__) {
        console.warn(
          '[sync/race]',
          isPermanent ? 'dropped (permanent error)' : 'queued for retry',
          status,
          err?.message,
        );
      }
    }
  })();
}

interface PurchaseSyncResponse {
  success: true;
  duplicate?: boolean;
}

/**
 * Send a verified store purchase to the server. Server re-verifies the
 * token against Google Play / App Store before recording. Returns success
 * so the caller can finalize the purchase (call finishPurchase to ack).
 *
 * Unlike race/state sync, this is NOT fire-and-forget: callers need to
 * know whether the server accepted before they grant entitlements
 * locally and acknowledge the transaction with the store.
 */
export async function syncPurchase(data: {
  /** Platform-specific store SKU (matches what was sent to the store). */
  productId: string;
  /** Token from the store SDK after a successful purchase. */
  purchaseToken: string;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  if (!data.purchaseToken) {
    return { ok: false, status: 400, message: 'Missing purchaseToken' };
  }
  const token = await getToken();
  if (!token) return { ok: false, status: 401, message: 'Not signed in' };

  try {
    await api.post<PurchaseSyncResponse>('/sync/purchase', data);
    return { ok: true };
  } catch (err: any) {
    /* api.post throws ApiError (lib/api.ts), which exposes `.status` and
     * `.message` directly — NOT an axios-style { response: { status, data } }
     * envelope. The old code read err.response.status which was always
     * undefined, falling through to status 0 and treating every failure as
     * a network error. Read the flat ApiError shape instead. */
    const status: number = err?.status ?? 0;
    const message: string = err?.message ?? 'Purchase sync failed';
    return { ok: false, status, message };
  }
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
    try {
      const res = await api.post<StateSyncResponse>('/sync/state', data);
      if (res?.state && onAuthoritative) {
        onAuthoritative(res.state);
      }
    } catch (err: any) {
      /* If the server says our session is invalid AND we held a token,
       * that means the player record (or its session) no longer exists.
       * Two common causes: admin deleted the account, or the player
       * self-deleted on a sibling device. In either case the local
       * state is now orphaned — the next /sync would just 401 in a
       * loop forever. Wipe local state and the token; the next app
       * cold-start runs registerOrLogin and creates a fresh player. */
      const status: number = err?.status ?? 0;
      if (status === 401) {
        await handleAccountDeletedRemotely();
      }
      throw err; // let syncInBackground log it in dev
    }
  });
}

/**
 * Called when the server returns 401 to a request that DID send a token.
 * Best-effort cleanup so the app doesn't loop forever on a dead session.
 *
 *   1. Clear the auth token from AsyncStorage so the next sync skips the
 *      doomed /sync/state call entirely.
 *   2. Clear the persisted Zustand store so cached coins / races / etc.
 *      from the deleted player don't survive into the fresh registration.
 *   3. On next cold-start, registerOrLogin() sees no token, falls through
 *      to /auth/register, server creates a brand-new player keyed on the
 *      device id, and the user lands on the onboarding flow.
 *
 * We don't try to force-reload the UI here — bouncing through a stale
 * screen is worse UX than letting the user back out naturally. The 60s
 * lobby tick will pick up the cleared token on the next iteration and
 * surface "session expired, please restart the app" via the existing
 * empty-state.
 */
let sessionExpiredHandled = false;
async function handleAccountDeletedRemotely(): Promise<void> {
  if (sessionExpiredHandled) return; // dedup repeated 401s within a session
  sessionExpiredHandled = true;
  /* Lazy require to avoid a circular import:
   *   lib/sync ← lib/accountReset ← state/gameStore ← lib/sync (some
   *   modules pull sync transitively). The lazy require breaks the
   *   cycle at evaluation time without changing call sites. */
  try {
    const { resetAccountLocally } = require('./accountReset');
    await resetAccountLocally();
  } catch (err) {
    console.warn('[sync/state] resetAccountLocally failed, falling back to minimal cleanup', err);
    try { await clearToken(); } catch {}
    try { await AsyncStorage.removeItem('dmr-game-state'); } catch {}
  }
  if (__DEV__) {
    console.warn(
      '[sync/state] 401 with token present — account deleted server-side. ' +
      'Local state, token, and in-memory store cleared. UI will route to splash.',
    );
  }
}
