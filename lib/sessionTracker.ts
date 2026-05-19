/**
 * In-app session tracker for "Avg Session Length" telemetry.
 *
 * An "app session" is the span from when the user foregrounds the app to
 * when they background it (or kill it). We:
 *   - Start a session on foreground (AppState becomes 'active' AND the
 *     player is signed in — anonymous sessions aren't worth recording).
 *   - End a session on background ('inactive' or 'background'). Send the
 *     duration to the server.
 *   - Survive process kill by stashing the open-session start time in
 *     AsyncStorage and finalising it on next launch if we find one (best
 *     effort — we treat the time between the saved startedAt and now as
 *     the session length, capped server-side at 4h).
 *
 * Hooks into the app lifecycle exactly once via initSessionTracker(),
 * called from _layout.tsx. Idempotent.
 */

import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';
import { flushEconomyQueue } from './syncQueue';
import { flushRaceSyncQueue } from './raceSyncQueue';
import { useGameStore } from '../state/gameStore';

const OPEN_SESSION_KEY = 'dmr-app-session-open-v1';
const MIN_LOG_SECONDS = 2;

interface OpenSession {
  startedAt: string; // ISO
}

let initialized = false;
let openStartedAt: Date | null = null;
let listenerSub: ReturnType<typeof AppState.addEventListener> | null = null;
let lastForegroundAt = Date.now();

function platformOrNull(): 'ios' | 'android' | 'web' | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return null;
}

async function persistOpenSession(startedAt: Date): Promise<void> {
  try {
    const v: OpenSession = { startedAt: startedAt.toISOString() };
    await AsyncStorage.setItem(OPEN_SESSION_KEY, JSON.stringify(v));
  } catch {
    // best-effort
  }
}

async function readOpenSession(): Promise<OpenSession | null> {
  try {
    const raw = await AsyncStorage.getItem(OPEN_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OpenSession;
  } catch {
    return null;
  }
}

async function clearOpenSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OPEN_SESSION_KEY);
  } catch {
    // best-effort
  }
}

/**
 * Returns true on successful send, false on network/server failure. Used
 * by the stale-session-finalisation path to decide whether it's safe to
 * clear the persisted row.
 */
async function sendSession(startedAt: Date, endedAt: Date): Promise<boolean> {
  const platform = platformOrNull();
  if (!platform) return false;
  const durationSecs = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  if (durationSecs < MIN_LOG_SECONDS) return true; // nothing to send is "ok"
  try {
    await api.recordAppSession({
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSecs,
      platform,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Begin tracking. Safe to call once per app launch; subsequent calls are
 * no-ops. The startSession argument tells us whether the user is already
 * signed in — if so we open a session immediately; otherwise we wait until
 * the caller invokes startSession() after sign-in.
 */
export function initSessionTracker(signedIn: boolean): void {
  if (initialized) return;
  initialized = true;

  // Finalise any session that didn't get cleanly ended (process kill).
  // We use the lesser of (now) and (startedAt + 4h) since the server caps
  // at 4h anyway.
  readOpenSession().then(async (open) => {
    if (!open) return;
    const startedAt = new Date(open.startedAt);
    if (Number.isNaN(startedAt.getTime())) {
      // Corrupt row — safe to clear.
      await clearOpenSession();
      return;
    }
    const fourHoursLater = new Date(startedAt.getTime() + 4 * 60 * 60 * 1000);
    const endedAt = new Date(Math.min(Date.now(), fourHoursLater.getTime()));
    /* Only clear the persisted row on a successful send. If the network
     * is down (or the server returns 5xx), KEEP the row so the next
     * launch can retry. Previously this unconditionally cleared, which
     * meant any launch with the API offline silently lost the stale
     * session telemetry — exactly the data point we needed to detect
     * crashes-on-foreground from analytics. */
    const sent = await sendSession(startedAt, endedAt);
    if (sent) {
      await clearOpenSession();
    } else if (__DEV__) {
      console.log('[sessionTracker] stale session send failed, keeping row for next launch');
    }
  }).catch(() => {});

  if (signedIn) {
    startSession();
  }

  listenerSub = AppState.addEventListener('change', handleAppStateChange);
}

function handleAppStateChange(state: AppStateStatus): void {
  if (state === 'active') {
    // Debounce: if we backgrounded < 1s ago and came back, don't open a
    // new session — the previous one was probably an OS prompt blip.
    if (Date.now() - lastForegroundAt < 1000 && !openStartedAt) {
      startSession();
    } else if (!openStartedAt) {
      startSession();
    }
    // Foreground is also a good moment to retry any queued economy
    // actions AND any queued race-syncs — network is usually freshly
    // available. Previously only the economy queue drained here; a race
    // played while the device was offline would sit unsynced until the
    // user happened to trigger an economy action. Now both queues drain
    // on every foreground transition; if the race queue drains anything,
    // snap local coins to the server's authoritative balance.
    flushEconomyQueue().catch(() => {});
    flushRaceSyncQueue()
      .then((q) => {
        if (q.drained > 0 && typeof q.balance === 'number') {
          useGameStore.setState({ coins: q.balance });
        }
      })
      .catch(() => {});
  } else if (state === 'inactive' || state === 'background') {
    lastForegroundAt = Date.now();
    endSession();
  }
}

/**
 * Open a new session. Called automatically on foreground; also exposed for
 * the auth flow to start a session immediately after sign-in.
 */
export function startSession(): void {
  if (openStartedAt) return;
  openStartedAt = new Date();
  persistOpenSession(openStartedAt).catch(() => {});
}

/**
 * Close the current session, send to server, clear state. Called
 * automatically on background; also exposed for sign-out.
 */
export function endSession(): void {
  if (!openStartedAt) return;
  const startedAt = openStartedAt;
  openStartedAt = null;
  const endedAt = new Date();
  sendSession(startedAt, endedAt).catch(() => {});
  clearOpenSession().catch(() => {});
}

/** Test/cleanup hook — not used in production. */
export function _resetSessionTrackerForTests(): void {
  if (listenerSub) listenerSub.remove();
  listenerSub = null;
  initialized = false;
  openStartedAt = null;
}
