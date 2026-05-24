/**
 * Network status hook + reconnect trigger.
 *
 * The game has worked silently with whatever fetch returned, which meant a
 * player on the subway had no visible explanation for why "RACE" tapped to
 * nothing. This module gives both the UI ("you are offline") and the sync
 * system ("you just came back, drain the queues") something to react to.
 *
 * `useOnlineStatus()` returns a live boolean React subscribers can render
 * against. `onReconnect()` registers a one-shot callback fired when we
 * transition from offline -> online — used by _layout.tsx to flush the
 * pending economy + race sync queues on the moment connectivity returns
 * instead of waiting for the next app foreground.
 */

import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

let cachedOnline = true; // optimistic — assume online until proven otherwise
let netInfoSubscribed = false;
const statusListeners = new Set<(online: boolean) => void>();
const reconnectListeners = new Set<() => void>();

function isOnline(state: NetInfoState | null): boolean {
  if (!state) return true;
  // isConnected can be null on first emission; treat null as "unknown, assume
  // online" so we don't flash an offline banner during the initial probe.
  if (state.isConnected === false) return false;
  // isInternetReachable is stricter — a captive-portal wifi can be "connected"
  // but not actually reach the internet. Only trust `false`; null = unknown.
  if (state.isInternetReachable === false) return false;
  return true;
}

function ensureSubscribed(): void {
  if (netInfoSubscribed) return;
  netInfoSubscribed = true;
  NetInfo.addEventListener((state) => {
    const next = isOnline(state);
    const wasOnline = cachedOnline;
    cachedOnline = next;
    if (wasOnline !== next) {
      for (const cb of statusListeners) cb(next);
    }
    if (!wasOnline && next) {
      for (const cb of reconnectListeners) {
        try { cb(); } catch { /* one bad listener shouldn't block others */ }
      }
    }
  });
}

/** React hook: re-renders when online/offline transitions. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(cachedOnline);
  useEffect(() => {
    ensureSubscribed();
    const cb = (next: boolean) => setOnline(next);
    statusListeners.add(cb);
    // Re-probe once on mount so a screen mounted while offline shows the
    // banner immediately instead of waiting for the next NetInfo emission.
    NetInfo.fetch().then((state) => {
      cachedOnline = isOnline(state);
      setOnline(cachedOnline);
    }).catch(() => {});
    return () => { statusListeners.delete(cb); };
  }, []);
  return online;
}

/** Register a callback fired when we transition offline -> online. Returns an unsubscribe. */
export function onReconnect(cb: () => void): () => void {
  ensureSubscribed();
  reconnectListeners.add(cb);
  return () => { reconnectListeners.delete(cb); };
}

/** Synchronous "best-guess" — useful in non-React contexts. May be stale until first NetInfo emission. */
export function isOnlineNow(): boolean {
  ensureSubscribed();
  return cachedOnline;
}
