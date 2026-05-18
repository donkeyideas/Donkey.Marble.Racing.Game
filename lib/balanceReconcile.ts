/**
 * One-time mobile→server coin balance reconciliation.
 *
 * Why this exists: before the challenge-claim and season-starter-bonus
 * paths were wired through applyEconomyAction (commits 1ed5184 + earlier),
 * those grants only updated local Zustand state. The server never saw
 * them, so player.coins on the server drifted lower than what the player
 * actually has on their phone. Admin dashboards showed the stale value.
 *
 * The fix forward: those paths now sync. But existing accounts have
 * historical drift that won't auto-correct because the original local
 * grants didn't carry idempotency keys we can replay.
 *
 * This module runs ONCE per app install (gated by AsyncStorage flag) the
 * first time the user is signed in after launching the patched build.
 * It compares local coins to server coins, and if local is higher, POSTs
 * a client_balance_reconciliation action. The server caps the credit at
 * 50,000 so a tampered client can't claim millions. Once the action
 * succeeds the local flag is set and the reconciliation never re-runs.
 *
 * Bumping the RECONCILE_VERSION in BOTH client and server allows a new
 * one-time backfill in the future if needed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGameStore } from '../state/gameStore';
import { applyEconomyAction } from './economy';

/* v3 bump: v2 went out but Firebase's auth listener fires before Zustand
 * persist finishes its AsyncStorage hydration, so reconcileLocalBalanceOnce
 * was reading the DEFAULT coins (1000) instead of the actual persisted
 * value (e.g. 5,162). Server saw "1000 < 5,375" → no gap → returned
 * success → client marked v2 as done. v2 reconciliation got silently
 * locked on every account with no real reconciliation happening.
 *
 * v3 ships with two fixes:
 *   1. Wait for store hydration before reading coins (see waitForHydration)
 *   2. The version bump unlocks every account that got falsely-marked v2 */
const RECONCILE_VERSION = 'v3';
const DONE_KEY = `dmr-balance-reconcile-done-${RECONCILE_VERSION}`;
const MIN_GAP_TO_RECONCILE = 1; // ignore drift of 0 coins

/* Resolve once Zustand's persist middleware has finished reading
 * dmr-game-state from AsyncStorage. If already hydrated, returns
 * immediately. */
function waitForHydration(): Promise<void> {
  const persist = (useGameStore as any).persist;
  if (!persist || typeof persist.hasHydrated !== 'function') return Promise.resolve();
  if (persist.hasHydrated()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const unsub = persist.onFinishHydration(() => {
      if (typeof unsub === 'function') unsub();
      resolve();
    });
    // Safety cap — don't wait forever if onFinishHydration never fires
    // (e.g. on a fresh install where there's nothing to hydrate). Zustand
    // typically resolves within tens of ms, so 3s is a generous ceiling.
    setTimeout(resolve, 3000);
  });
}

/**
 * Idempotent. Safe to call on every sign-in — bails immediately if the
 * AsyncStorage flag says we've already reconciled for this version.
 * Best-effort: any failure is swallowed so a flaky network doesn't
 * permanently block the player.
 */
export async function reconcileLocalBalanceOnce(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(DONE_KEY);
    if (done === '1') return;

    // CRITICAL: wait for Zustand's persist hydration before reading coins.
    // The Firebase auth listener fires inside _layout.tsx as soon as the
    // listener is registered (synchronous if there's a cached user), which
    // is typically BEFORE the persist middleware finishes its async
    // AsyncStorage read. Reading too early returns the initial-state
    // default (1000), not the persisted balance — v2 of this module shipped
    // without this guard and silently no-op'd reconciliation on every
    // user. v3 above bumped the version to unlock those accounts.
    await waitForHydration();

    const localBalance = useGameStore.getState().coins;
    if (!Number.isFinite(localBalance) || localBalance < MIN_GAP_TO_RECONCILE) {
      // Nothing meaningful to reconcile; mark done so we don't keep checking.
      await AsyncStorage.setItem(DONE_KEY, '1');
      return;
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
      await AsyncStorage.setItem(DONE_KEY, '1');
    } else if (res.status === 401) {
      // Not signed in yet — don't mark done; will retry on next sign-in.
      return;
    } else {
      // 4xx (validation) or 5xx — log in dev, don't mark done so we can
      // try again on a future launch.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.warn('[balanceReconcile] failed', res.status, res.message);
      }
    }
  } catch {
    // best-effort
  }
}
