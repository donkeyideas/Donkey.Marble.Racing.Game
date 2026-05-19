/**
 * Mobile→server coin balance reconciliation.
 *
 * Why this exists: pre-fix, several coin-affecting actions (challenge
 * claims, season-starter bonuses, lost /sync/race calls, etc.) updated
 * local Zustand state without telling the server. Admin dashboards
 * showed stale low values while the phone showed higher real balances.
 *
 * v4 ships with three hard-won fixes:
 *   1. Bypass Zustand hydration entirely — read coins straight from the
 *      raw AsyncStorage entry. v2 and v3 BOTH silently no-op'd because
 *      the auth listener fires before Zustand persist finishes its async
 *      read, and even with `waitForHydration` v3 still hit the default
 *      value on some installs. Reading the persisted blob directly
 *      sidesteps every hydration-timing concern.
 *   2. Don't mark DONE_KEY when the server returns no_gap (credit = 0).
 *      Previously a single misread (e.g. reading 1000 default before
 *      hydration) would lock the reconciliation forever, even after
 *      restarting with correct data. Now we only mark done after an
 *      actual credit, so misreads retry next launch.
 *   3. Version bump from v3 → v4 frees any account that got falsely
 *      DONE-marked at v3 (which is everyone who tested earlier).
 *
 * Server-side natural key (`balance_reconcile:{playerId}:v4`) still
 * enforces one credit per player per version, so multiple retry attempts
 * cannot double-credit even if the client retries 100 times.
 *
 * Bumping the RECONCILE_VERSION in BOTH client and server triggers a
 * one-time backfill for existing installs.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGameStore } from '../state/gameStore';
import { applyEconomyAction } from './economy';

const RECONCILE_VERSION = 'v4';
const STORE_KEY = 'dmr-game-state';
const MIN_GAP_TO_RECONCILE = 1;
const LAST_RUN_KEY = 'dmr-balance-reconcile-last-run-v4';

/* Module-level in-flight guard.
 *
 * reconcileLocalBalanceOnce is invoked from multiple lifecycle hooks
 * (auth listener fires, sign-in success, hydration-complete, etc.) which
 * can all happen in close succession on cold start. Without this guard
 * each call independently issued an HTTP POST, and at worst the server
 * would see N parallel reconciliation requests racing against the same
 * natural-key lock — wasteful at best, contention bugs at worst.
 *
 * The lock is process-local; we don't persist it. Server-side natural
 * key (balance_reconcile:{playerId}:v4) remains the ultimate safety net. */
let inFlight = false;
/** Once a reconciliation has credited a positive amount we stop pinging on
 *  every launch — but we ALWAYS retry on cold start if the last attempt
 *  didn't credit. Server-side natural-key lock (balance_reconcile:{player}:v4)
 *  guarantees we can't double-credit no matter how many times we retry. */
const SUCCESS_KEY = 'dmr-balance-reconcile-credited-v4';

/**
 * Read the persisted coin balance from AsyncStorage directly, bypassing
 * Zustand entirely. Zustand stores under STORE_KEY with shape
 * `{ state: {...slice}, version: N }` (the persist middleware wrap).
 *
 * Returns null if no persisted entry exists (fresh install) — we still
 * fall back to useGameStore.getState() in that case so we don't miss
 * day-zero local-only grants.
 */
/** Read coins from AsyncStorage. Tries multiple envelope shapes because
 *  Zustand persist's exact wrap format has shifted across versions. Returns
 *  null only when nothing usable is found. */
async function readPersistedCoins(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) {
      if (__DEV__) console.log('[balanceReconcile] AsyncStorage has no entry for', STORE_KEY);
      return null;
    }
    if (__DEV__) console.log('[balanceReconcile] raw AsyncStorage entry length:', raw.length);
    const parsed = JSON.parse(raw);
    // Try every reasonable shape Zustand persist might use
    const candidates: unknown[] = [
      parsed?.state?.coins,
      parsed?.coins,
      parsed?.data?.coins,
      parsed?.[0]?.state?.coins,
    ];
    for (const c of candidates) {
      if (typeof c === 'number' && Number.isFinite(c) && c >= 0) {
        if (__DEV__) console.log('[balanceReconcile] read coins from AsyncStorage:', c);
        return c;
      }
    }
    if (__DEV__) {
      console.log('[balanceReconcile] no coins field in persisted state. Top-level keys:', Object.keys(parsed));
    }
    return null;
  } catch (err: any) {
    if (__DEV__) console.warn('[balanceReconcile] readPersistedCoins threw:', err?.message ?? err);
    return null;
  }
}

/**
 * Idempotent at the version level. Safe to call on every app launch —
 * server natural-key idempotency prevents double-credit even under
 * aggressive retries. The DONE_KEY here just shortcuts the network call
 * once we know the reconciliation has succeeded.
 */
export async function reconcileLocalBalanceOnce(): Promise<void> {
  if (inFlight) {
    if (__DEV__) console.log('[balanceReconcile:v4] already in-flight, skipping');
    return;
  }
  inFlight = true;
  try {
    // No early-exit gate anymore — we ALWAYS attempt reconciliation on
    // launch. Server-side natural key (balance_reconcile:{playerId}:v4)
    // prevents double-credit. The cost of one extra HTTP call per launch
    // is worth the bullet-proofing: any previous bug that wrongly marked
    // DONE before crediting now self-heals on the next launch.

    await AsyncStorage.setItem(LAST_RUN_KEY, new Date().toISOString());

    const persisted = await readPersistedCoins();
    const fallback = useGameStore.getState().coins;
    // Prefer the AsyncStorage-persisted value (race-condition-free) over
    // the live Zustand state (which can be the default 1000 if hydration
    // hasn't completed yet). Fall back to Zustand only when AsyncStorage
    // has no entry (fresh install).
    const localBalance =
      persisted !== null
        ? persisted
        : Number.isFinite(fallback)
          ? fallback
          : 0;

    if (__DEV__) {
      console.log(
        `[balanceReconcile:v4] sending localBalance=${localBalance} (persisted=${persisted}, zustand=${fallback})`,
      );
    }

    if (localBalance < MIN_GAP_TO_RECONCILE) {
      if (__DEV__) console.log('[balanceReconcile:v4] localBalance too low, skipping');
      return;
    }

    const res = await applyEconomyAction({
      action: 'client_balance_reconciliation',
      payload: { localBalance },
    });

    if (res.ok) {
      useGameStore.setState({ coins: res.balance });
      const credited =
        (res.result?.credited as number | undefined) ?? res.transaction?.amount ?? 0;
      if (typeof credited === 'number' && credited > 0) {
        await AsyncStorage.setItem(SUCCESS_KEY, JSON.stringify({
          credited,
          balance: res.balance,
          at: new Date().toISOString(),
        }));
        if (__DEV__) {
          console.log(`[balanceReconcile:v4] ✓ credited ${credited}, new balance ${res.balance}`);
        }
      } else if (__DEV__) {
        const reason = (res.result?.reason as string | undefined) ?? 'unknown';
        console.log(
          `[balanceReconcile:v4] no credit (reason=${reason}, server balance=${res.balance}, sent=${localBalance})`,
        );
      }
    } else if (res.status === 401) {
      if (__DEV__) console.log('[balanceReconcile:v4] not signed in — retry next launch');
    } else {
      if (__DEV__) {
        console.warn('[balanceReconcile:v4] failed', res.status, res.message);
      }
    }
  } catch (err: any) {
    if (__DEV__) {
      console.warn('[balanceReconcile:v4] threw', err?.message ?? err);
    }
  } finally {
    inFlight = false;
  }
}
