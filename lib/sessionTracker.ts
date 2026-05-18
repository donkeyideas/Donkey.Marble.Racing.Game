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

async function sendSession(startedAt: Date, endedAt: Date): Promise<void> {
  const platform = platformOrNull();
  if (!platform) return;
  const durationSecs = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  if (durationSecs < MIN_LOG_SECONDS) return;
  try {
    await api.recordAppSession({
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSecs,
      platform,
    });
  } catch {
    // Network failure — drop. We'd prefer to never retry from a stale
    // open-session row (could double-count on flaky networks).
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
      await clearOpenSession();
      return;
    }
    const fourHoursLater = new Date(startedAt.getTime() + 4 * 60 * 60 * 1000);
    const endedAt = new Date(Math.min(Date.now(), fourHoursLater.getTime()));
    await sendSession(startedAt, endedAt);
    await clearOpenSession();
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
