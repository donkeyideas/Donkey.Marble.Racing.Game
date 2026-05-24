/**
 * Pending-economy-action retry queue.
 *
 * When applyEconomyAction() fails for a retriable reason (network down,
 * server 5xx, transient 401 because the token rotation hasn't finished),
 * we'd previously console.warn and forget — the user's optimistic local
 * coin balance kept drifting from the server's authoritative one. The
 * admin dashboard then showed stale numbers and there was no recovery
 * path short of an admin coin adjustment.
 *
 * This module stashes the failed action in AsyncStorage and retries on:
 *   - app foreground (AppState transitions to 'active')
 *   - successful sign-in
 *   - immediately after any successful applyEconomyAction (piggy-back
 *     to drain the queue while we know the network and token are good)
 *
 * Each enqueued item carries its original idempotencyKey, so the server's
 * idempotency check prevents double-grants if the queue retries an action
 * that actually succeeded on the original attempt (the server dropped the
 * response).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getToken } from './api';
import type { EconomyAction, EconomyResponse } from './economy';

const QUEUE_KEY = 'dmr-economy-retry-queue-v1';
const MAX_QUEUE_SIZE = 50;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — older entries get dropped

export interface QueuedItem {
  action: EconomyAction;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
  addedAt: number;
}

let flushInFlight = false;
const listeners = new Set<(count: number) => void>();

async function readQueue(): Promise<QueuedItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    for (const cb of listeners) cb(items.length);
  } catch {
    // best-effort
  }
}

/** Subscribe to queue-size changes (e.g. for a "pending sync" badge). */
export function onQueueSizeChange(cb: (count: number) => void): () => void {
  listeners.add(cb);
  // Fire once immediately so the subscriber can render the current value
  readQueue().then((items) => cb(items.length)).catch(() => {});
  return () => listeners.delete(cb);
}

/** Get the current pending count (one-shot, async). */
export async function pendingCount(): Promise<number> {
  const items = await readQueue();
  return items.length;
}

/**
 * Add a failed economy action to the retry queue. De-duplicates by
 * idempotencyKey — if the same key is already queued, this is a no-op
 * (don't grow the queue unbounded on persistent failures of the same
 * call). Drops the oldest entries when over MAX_QUEUE_SIZE.
 */
export async function enqueueEconomyAction(item: QueuedItem): Promise<void> {
  const items = await readQueue();
  if (items.some((q) => q.idempotencyKey === item.idempotencyKey)) return;
  items.push(item);
  if (items.length > MAX_QUEUE_SIZE) {
    items.splice(0, items.length - MAX_QUEUE_SIZE);
  }
  await writeQueue(items);
}

export interface FlushResult {
  /** Items successfully sent to the server (including idempotent replays). */
  drained: number;
  /**
   * The server's authoritative balance from the LAST successful drain, if
   * any. Callers use this for silent reconciliation — snap local coins to
   * server after replay so offline-applied debits/credits converge to the
   * canonical post-server-validation balance.
   */
  balance: number | null;
}

/**
 * Attempt to drain the queue. Each item is POSTed via the same economy
 * endpoint; on success, the item is removed. On the first failure we
 * stop and try again on the next flush — preserving order so dependent
 * actions stay sequential.
 *
 * Returns the count drained plus the server's last-seen balance so the
 * caller can reconcile local state to the canonical server value. If the
 * queue is empty or there's no auth token, returns {drained:0, balance:null}.
 */
export async function flushEconomyQueue(): Promise<FlushResult> {
  if (flushInFlight) return { drained: 0, balance: null };
  flushInFlight = true;
  try {
    const token = await getToken();
    if (!token) return { drained: 0, balance: null };

    let items = await readQueue();
    if (items.length === 0) return { drained: 0, balance: null };

    // Drop stale entries before we even try
    const now = Date.now();
    items = items.filter((i) => now - i.addedAt < MAX_AGE_MS);

    let drained = 0;
    let lastBalance: number | null = null;
    while (items.length > 0) {
      const head = items[0];
      try {
        const res = await api.post<EconomyResponse>('/economy/transaction', {
          action: head.action,
          payload: head.payload,
          idempotencyKey: head.idempotencyKey,
        });
        // Server accepted (or replayed via idempotency). Either way, item is done.
        if (res && (res as any).success !== false) {
          if (typeof (res as any).balance === 'number') lastBalance = (res as any).balance;
          items.shift();
          drained++;
          continue;
        }
        // Validation rejection — server says this'll never succeed. Drop it.
        items.shift();
      } catch (err: any) {
        const status = err?.status;
        // 4xx other than 401 = permanent rejection; drop so we don't loop.
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 401) {
          items.shift();
          continue;
        }
        // 401 / 5xx / network — stop and wait for next flush trigger.
        break;
      }
    }

    await writeQueue(items);
    return { drained, balance: lastBalance };
  } finally {
    flushInFlight = false;
  }
}

/** Clear the entire queue. Used on sign-out so the next user doesn't inherit. */
export async function clearEconomyQueue(): Promise<void> {
  await writeQueue([]);
}
