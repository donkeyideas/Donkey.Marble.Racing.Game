/**
 * Pending-race-sync retry queue.
 *
 * Before this existed, `syncRaceResult` was pure fire-and-forget: any
 * /sync/race POST that failed (network blip, brief 5xx, transient 401)
 * was silently lost. The race never made it into game_race_records on
 * the server, and the coin delta (bet + payout) was never reconciled.
 * The phone's optimistic local balance drifted from the server's
 * authoritative balance forever — admins saw stale coins, fewer races
 * than the user had played, and a fraction of their bets in the betting
 * profile.
 *
 * Mirrors syncQueue.ts (the economy-action queue) for retry semantics:
 *   - enqueue on failure, keyed by idempotencyKey (server-side de-dupe)
 *   - drain on app foreground / sign-in / after successful economy POST
 *   - drop on permanent 4xx (server says this'll never succeed)
 *   - max 200 entries, 30-day TTL so a long-offline phone doesn't OOM
 *
 * Race syncs replay against /sync/race with the exact same body, so
 * idempotency by request key prevents double-recording if the network
 * dropped the original RESPONSE (server already processed it).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getToken } from './api';

const QUEUE_KEY = 'dmr-race-retry-queue-v1';
const MAX_QUEUE_SIZE = 200;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface QueuedRaceItem {
  /** Full /sync/race body, including idempotencyKey. */
  payload: Record<string, unknown>;
  idempotencyKey: string;
  addedAt: number;
}

interface RaceSyncResponse {
  success: true;
  raceId: string;
  balance: number;
  banned: boolean;
  duplicate?: boolean;
}

let flushInFlight = false;
const listeners = new Set<(count: number) => void>();

async function readQueue(): Promise<QueuedRaceItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedRaceItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedRaceItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    for (const cb of listeners) cb(items.length);
  } catch {
    // best-effort
  }
}

/** Subscribe to queue-size changes (for a "pending sync" badge if we want one). */
export function onRaceQueueSizeChange(cb: (count: number) => void): () => void {
  listeners.add(cb);
  readQueue().then((items) => cb(items.length)).catch(() => {});
  return () => listeners.delete(cb);
}

export async function raceQueuePendingCount(): Promise<number> {
  const items = await readQueue();
  return items.length;
}

/** Enqueue a failed race sync. De-duplicates by idempotencyKey. */
export async function enqueueRaceSync(item: QueuedRaceItem): Promise<void> {
  const items = await readQueue();
  if (items.some((q) => q.idempotencyKey === item.idempotencyKey)) return;
  items.push(item);
  if (items.length > MAX_QUEUE_SIZE) {
    items.splice(0, items.length - MAX_QUEUE_SIZE);
  }
  await writeQueue(items);
}

/**
 * Drain the queue. Returns the latest authoritative server balance from
 * the last successfully-flushed race (or null if nothing drained), so the
 * caller can reconcile useGameStore.coins without a separate fetch.
 *
 * On the first failure we stop draining so dependent races stay sequential
 * (server-side balance math depends on ordering).
 */
export async function flushRaceSyncQueue(): Promise<{ drained: number; balance: number | null }> {
  if (flushInFlight) return { drained: 0, balance: null };
  flushInFlight = true;
  try {
    const token = await getToken();
    if (!token) return { drained: 0, balance: null };

    let items = await readQueue();
    if (items.length === 0) return { drained: 0, balance: null };

    const now = Date.now();
    items = items.filter((i) => now - i.addedAt < MAX_AGE_MS);

    let drained = 0;
    let lastBalance: number | null = null;
    while (items.length > 0) {
      const head = items[0];
      try {
        const res = await api.post<RaceSyncResponse>('/sync/race', head.payload);
        if (res && typeof res.balance === 'number') {
          lastBalance = res.balance;
        }
        items.shift();
        drained++;
      } catch (err: any) {
        const status = err?.status;
        if (typeof status === 'number' && status >= 400 && status < 500 && status !== 401) {
          // Permanent rejection — drop, don't block subsequent items.
          items.shift();
          continue;
        }
        // 401 / 5xx / network — try again later.
        break;
      }
    }

    await writeQueue(items);
    return { drained, balance: lastBalance };
  } finally {
    flushInFlight = false;
  }
}

export async function clearRaceSyncQueue(): Promise<void> {
  await writeQueue([]);
}
