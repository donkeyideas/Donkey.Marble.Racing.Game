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

import { api, getToken } from './api';

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
  | 'custom_track_entry';

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
  const token = await getToken();
  if (!token) {
    return { ok: false, status: 401, message: 'Not signed in' };
  }
  const idempotencyKey = opts.idempotencyKey ?? newIdempotencyKey();

  try {
    const res = await api.post<EconomyResponse>('/economy/transaction', {
      action: opts.action,
      idempotencyKey,
      payload: opts.payload ?? {},
    });
    return { ...res, ok: true };
  } catch (err: any) {
    const status: number = err?.response?.status ?? 0;
    const message: string =
      err?.response?.data?.error?.message ?? err?.message ?? 'Economy request failed';
    return { ok: false, status, message };
  }
}
