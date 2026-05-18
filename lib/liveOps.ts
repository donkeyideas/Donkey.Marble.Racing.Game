import AsyncStorage from '@react-native-async-storage/async-storage';

/* ------------------------------------------------------------------ */
/*  Live Ops — fetches announcements, promos, messages from admin API  */
/* ------------------------------------------------------------------ */

const BASE_URL = __DEV__
  ? 'http://localhost:3001/api'
  : 'https://marble-admin.donkeyideas.com/api';

const PLAYER_ID_KEY = 'dmr-player-id';

// ── Types ──

export interface Announcement {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'warning' | 'maintenance' | 'promo';
  priority: number;
}

export interface Promo {
  id: string;
  name: string;
  type: 'double_coins' | 'bonus_reward' | 'discount' | 'free_entry';
  multiplier: number;
  config: any;
}

export interface GameMessage {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'reward' | 'warning' | 'compensation';
  coinsAttached: number;
  createdAt: string;
}

export interface ABTestAssignment {
  testId: string;
  testName: string;
  variant: string;
}

// ── State ──

let announcements: Announcement[] = [];
let promos: Promo[] = [];
let messages: GameMessage[] = [];
let abAssignments: ABTestAssignment[] = [];
let playerId: string | null = null;

/* IDs the user has tapped to dismiss locally. Filtered out of
 * getAnnouncements()/getActivePromos() so a dismissed banner doesn't
 * pop back up on the next config refresh. Persisted to AsyncStorage so
 * dismissals survive cold starts. */
const DISMISSED_KEY = 'dmr-live-ops-dismissed-v1';
let dismissedIds: Set<string> = new Set();
let dismissedLoaded = false;
const subscribers = new Set<() => void>();

function notify() {
  for (const cb of subscribers) {
    try { cb(); } catch {}
  }
}

/** Subscribe to dismissal changes so screens can re-render. */
export function onLiveOpsChange(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

async function loadDismissed(): Promise<void> {
  if (dismissedLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(DISMISSED_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr)) dismissedIds = new Set(arr);
    }
  } catch {}
  dismissedLoaded = true;
}

async function saveDismissed(): Promise<void> {
  try {
    await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedIds]));
  } catch {}
}

/** Mark an announcement / promo as dismissed locally. Idempotent. */
export async function dismissLiveOpsItem(id: string): Promise<void> {
  await loadDismissed();
  if (dismissedIds.has(id)) return;
  dismissedIds.add(id);
  await saveDismissed();
  notify();
}

// ── Player ID ──

export async function getPlayerId(): Promise<string | null> {
  if (playerId) return playerId;
  try {
    playerId = await AsyncStorage.getItem(PLAYER_ID_KEY);
  } catch {}
  return playerId;
}

export async function setPlayerId(id: string): Promise<void> {
  playerId = id;
  try {
    await AsyncStorage.setItem(PLAYER_ID_KEY, id);
  } catch {}
}

// ── Fetch Functions ──

export async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const res = await fetch(`${BASE_URL}/game-announcements`);
    if (!res.ok) return [];
    const data = await res.json();
    announcements = data.announcements ?? [];
  } catch {
    // silently fail
  }
  return announcements;
}

export async function fetchPromos(): Promise<Promo[]> {
  try {
    const res = await fetch(`${BASE_URL}/game-promos`);
    if (!res.ok) return [];
    const data = await res.json();
    promos = data.promos ?? [];
  } catch {}
  return promos;
}

export async function fetchMessages(): Promise<GameMessage[]> {
  const pid = await getPlayerId();
  if (!pid) return [];
  try {
    const res = await fetch(`${BASE_URL}/game-messages?playerId=${pid}`);
    if (!res.ok) return [];
    const data = await res.json();
    messages = data.messages ?? [];
  } catch {}
  return messages;
}

export async function markMessagesRead(messageIds: string[]): Promise<void> {
  const pid = await getPlayerId();
  if (!pid || messageIds.length === 0) return;
  try {
    await fetch(`${BASE_URL}/game-messages?playerId=${pid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageIds }),
    });
    messages = messages.filter((m) => !messageIds.includes(m.id));
  } catch {}
}

export async function fetchABTests(): Promise<ABTestAssignment[]> {
  const pid = await getPlayerId();
  if (!pid) return [];
  try {
    const res = await fetch(`${BASE_URL}/game-ab-tests?playerId=${pid}`);
    if (!res.ok) return [];
    const data = await res.json();
    abAssignments = data.assignments ?? [];
  } catch {}
  return abAssignments;
}

// ── Fetch All (called on app launch) ──

export async function fetchAllLiveOps(): Promise<void> {
  await Promise.all([
    loadDismissed(),
    fetchAnnouncements(),
    fetchPromos(),
    fetchMessages(),
    fetchABTests(),
  ]);
  // Tell subscribers (lobby banner, etc.) — initial dataset is now in memory
  // and any persisted dismissals have been applied.
  notify();
}

// ── Getters (synchronous, from memory) ──

export function getAnnouncements(): Announcement[] {
  if (dismissedIds.size === 0) return announcements;
  return announcements.filter((a) => !dismissedIds.has(a.id));
}

export function getActivePromos(): Promo[] {
  if (dismissedIds.size === 0) return promos;
  return promos.filter((p) => !dismissedIds.has(p.id));
}

export function getUnreadMessages(): GameMessage[] {
  return messages;
}

export function getABAssignments(): ABTestAssignment[] {
  return abAssignments;
}

/** Check if a specific promo type is active */
export function isPromoActive(type: Promo['type']): boolean {
  return promos.some((p) => p.type === type);
}

/** Get the multiplier for a promo type (default 1.0 if not active) */
export function getPromoMultiplier(type: Promo['type']): number {
  const promo = promos.find((p) => p.type === type);
  return promo ? Number(promo.multiplier) : 1.0;
}

/** Get the variant for a specific A/B test by name */
export function getTestVariant(testName: string): string | null {
  const assignment = abAssignments.find((a) => a.testName === testName);
  return assignment?.variant ?? null;
}
