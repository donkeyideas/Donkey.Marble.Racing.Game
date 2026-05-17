/**
 * Lightweight friend list for multiplayer.
 *
 * Kept in AsyncStorage on the device — no server backend required. The
 * user auto-accumulates "recently played with" entries from every MP
 * match they finish. They can also clear, rename, or pin entries from
 * the UI. Capped at 50 entries with newest-first eviction.
 *
 * Future: when a real friends backend lands (presence, push-invite),
 * this same surface can wrap the network calls. For now it's local-only
 * so the feature ships without server dependencies.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const FRIENDS_KEY = 'dmr-mp-friends-v1';
const MAX_FRIENDS = 50;

export interface MpFriend {
  uid: string;
  displayName: string;
  /** Last time this friend appeared in a lobby with the user (ms). */
  lastPlayedAt: number;
  /** How many MP matches they've shared. */
  matchesPlayed: number;
  /** User-pinned friends stay above auto-tracked ones in the list. */
  pinned?: boolean;
}

export async function getFriends(): Promise<MpFriend[]> {
  try {
    const raw = await AsyncStorage.getItem(FRIENDS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as MpFriend[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeFriends(list: MpFriend[]): Promise<void> {
  try {
    // Pinned first, then by lastPlayedAt desc. Trim to MAX.
    const sorted = [...list].sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      return b.lastPlayedAt - a.lastPlayedAt;
    }).slice(0, MAX_FRIENDS);
    await AsyncStorage.setItem(FRIENDS_KEY, JSON.stringify(sorted));
  } catch {
    /* best-effort */
  }
}

/**
 * Bump the friend record for each human opponent in a finished lobby.
 * Auto-adds new entries, increments match count for existing ones.
 * Skips bots, skips the local user. Safe to call after every match.
 */
export async function recordPlayedWith(
  localUid: string,
  opponents: { uid: string; displayName: string; isBot: boolean }[],
): Promise<void> {
  const humans = opponents.filter(o => !o.isBot && o.uid && o.uid !== localUid);
  if (humans.length === 0) return;
  const list = await getFriends();
  const byUid = new Map(list.map(f => [f.uid, f]));
  const now = Date.now();
  for (const o of humans) {
    const existing = byUid.get(o.uid);
    if (existing) {
      existing.displayName = o.displayName || existing.displayName;
      existing.lastPlayedAt = now;
      existing.matchesPlayed += 1;
    } else {
      byUid.set(o.uid, {
        uid: o.uid,
        displayName: o.displayName || 'Player',
        lastPlayedAt: now,
        matchesPlayed: 1,
      });
    }
  }
  await writeFriends([...byUid.values()]);
}

export async function pinFriend(uid: string, pinned: boolean): Promise<void> {
  const list = await getFriends();
  const f = list.find(x => x.uid === uid);
  if (f) {
    f.pinned = pinned;
    await writeFriends(list);
  }
}

export async function removeFriend(uid: string): Promise<void> {
  const list = await getFriends();
  await writeFriends(list.filter(f => f.uid !== uid));
}
