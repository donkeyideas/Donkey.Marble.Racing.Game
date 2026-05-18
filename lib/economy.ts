/**
 * Server-authoritative economy client.
 *
 * Every coin-altering action goes through this module. The server validates,
 * persists, and returns the new authoritative balance. The client updates
 * local state from the server response — never the other way around.
 *
 * Each call includes a client-generated idempotency key so retries are safe:
 * the server enforces uniqueness and returns the previous result if the same
 * key is seen twice (e.g., network hiccup, optimistic re-tap).
 */

import { api, getToken, ApiError } from './api';
import { enqueueEconomyAction, flushEconomyQueue } from './syncQueue';
import { flushRaceSyncQueue } from './raceSyncQueue';
import { useGameStore } from '../state/gameStore';

export type EconomyAction =
  | 'claim_daily'
  | 'claim_achievement'
  | 'claim_challenge'
  | 'place_bet'
  | 'settle_bet'
  | 'tournament_entry'
  | 'tournament_payout'
  | 'playoff_payout'
  | 'national_entry'
  | 'national_payout'
  | 'mp_entry'
  | 'mp_payout'
  | 'custom_track_entry'
  | 'season_starter_bonus'
  | 'client_balance_reconciliation';

export interface EconomyResponse {
  success: true;
  balance: number;
  transaction: {
    id: string;
    type: string;
    amount: number;
    createdAt: string;
  };
  result?: Record<string, unknown>;
  replayed?: boolean;
}

export interface EconomyError {
  ok: false;
  status: number;
  message: string;
}

export type EconomyResult = (EconomyResponse & { ok: true }) | EconomyError;

/**
 * Generate a UUID v4 for idempotency keys. Used to make POSTs replay-safe.
 */
export function newIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * POST a coin-altering action. Server returns the new authoritative balance.
 * Caller is responsible for updating local state from the response.
 *
 * Returns { ok: false } on auth / validation / network failure so callers can
 * surface an error to the user instead of silently desyncing.
 */
export async function applyEconomyAction(opts: {
  action: EconomyAction;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<EconomyResult> {
  const idempotencyKey = opts.idempotencyKey ?? newIdempotencyKey();
  const token = await getToken();

  // No auth token yet — queue for retry once the user signs in. Local UI
  // state stays optimistic; the queue flush after sign-in reconciles
  // server-side. Previously this just returned and let the optimistic
  // balance drift forever.
  if (!token) {
    await enqueueEconomyAction({
      action: opts.action,
      payload: opts.payload,
      idempotencyKey,
      addedAt: Date.now(),
    });
    return { ok: false, status: 401, message: 'Not signed in (queued for retry)' };
  }

  try {
    const res = await api.post<EconomyResponse>('/economy/transaction', {
      action: opts.action,
      idempotencyKey,
      payload: opts.payload ?? {},
    });
    // Piggy-back: we know the network and token are good right now, drain
    // any backlogged actions AND any queued race syncs opportunistically.
    // Fire-and-forget. If the race queue drains anything, snap local coins
    // to the server's post-drain balance so the UI matches.
    flushEconomyQueue().catch(() => {});
    flushRaceSyncQueue()
      .then((q) => {
        if (q.drained > 0 && typeof q.balance === 'number') {
          useGameStore.setState({ coins: q.balance });
        }
      })
      .catch(() => {});
    return { ...res, ok: true };
  } catch (err: any) {
    const status: number = err instanceof ApiError ? err.status : 0;
    const message: string = err?.message ?? 'Economy request failed';

    // Retriable failure (network, 5xx, transient 401) — queue for retry.
    // Permanent client errors (4xx other than 401) get dropped.
    const isRetriable = status === 0 || status === 401 || (status >= 500 && status < 600);
    if (isRetriable) {
      await enqueueEconomyAction({
        action: opts.action,
        payload: opts.payload,
        idempotencyKey,
        addedAt: Date.now(),
      });
    }
    return { ok: false, status, message };
  }
}
