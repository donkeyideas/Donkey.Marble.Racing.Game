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
const DONE_KEY = `dmr-balance-reconcile-done-${RECONCILE_VERSION}`;
const STORE_KEY = 'dmr-game-state';
const MIN_GAP_TO_RECONCILE = 1;

/**
 * Read the persisted coin balance from AsyncStorage directly, bypassing
 * Zustand entirely. Zustand stores under STORE_KEY with shape
 * `{ state: {...slice}, version: N }` (the persist middleware wrap).
 *
 * Returns null if no persisted entry exists (fresh install) — we still
 * fall back to useGameStore.getState() in that case so we don't miss
 * day-zero local-only grants.
 */
async function readPersistedCoins(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const candidate = parsed?.state?.coins;
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    return null;
  } catch {
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
  try {
    const done = await AsyncStorage.getItem(DONE_KEY);
    if (done === '1') return;

    // Read coins from AsyncStorage directly — bypasses Zustand hydration
    // entirely so we can't accidentally read the default 1000.
    const persisted = await readPersistedCoins();
    const fallback = useGameStore.getState().coins;
    const localBalance =
      persisted !== null
        ? persisted
        : Number.isFinite(fallback)
          ? fallback
          : 0;

    if (localBalance < MIN_GAP_TO_RECONCILE) {
      // Fresh install with no persisted coins — nothing to reconcile.
      // Mark done so we don't keep retrying for empty accounts.
      await AsyncStorage.setItem(DONE_KEY, '1');
      return;
    }

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(
        `[balanceReconcile:v4] localBalance=${localBalance} (persisted=${persisted}, fallback=${fallback})`,
      );
    }

    const res = await applyEconomyAction({
      action: 'client_balance_reconciliation',
      payload: { localBalance },
    });

    if (res.ok) {
      // Snap local to whatever the server returned. If the server credited
      // the full delta, local stays the same. If the server capped, local
      // drops to the capped server value — that's intentional.
      useGameStore.setState({ coins: res.balance });

      // Only mark DONE if the server actually credited something. If it
      // returned no_gap (local <= server.coins), there's a chance our
      // localBalance read was stale — let the next launch retry.
      const credited =
        (res.result?.credited as number | undefined) ?? res.transaction?.amount ?? 0;
      if (typeof credited === 'number' && credited > 0) {
        await AsyncStorage.setItem(DONE_KEY, '1');
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.log(`[balanceReconcile:v4] credited ${credited}, new balance ${res.balance}`);
        }
      } else if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log(`[balanceReconcile:v4] no_gap — retry next launch (balance ${res.balance})`);
      }
    } else if (res.status === 401) {
      // Not signed in yet — don't mark done; will retry on next launch.
      return;
    } else {
      // 4xx (validation) or 5xx — log in dev, don't mark done so we can
      // try again on a future launch.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[balanceReconcile:v4] failed', res.status, res.message);
      }
    }
  } catch (err: any) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[balanceReconcile:v4] threw', err?.message ?? err);
    }
  }
}
