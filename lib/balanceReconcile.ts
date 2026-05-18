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

const RECONCILE_VERSION = 'v1';
const DONE_KEY = `dmr-balance-reconcile-done-${RECONCILE_VERSION}`;
const MIN_GAP_TO_RECONCILE = 1; // ignore drift of 0 coins

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
