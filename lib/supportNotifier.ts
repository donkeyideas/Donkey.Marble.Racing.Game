/**
 * Support reply notifier.
 *
 * Polls /support/tickets, detects newly-arrived admin replies, fires a local
 * push notification for each new one, and persists a last-seen map so we
 * don't re-notify on subsequent polls.
 *
 * "Newly arrived" = a ticket with hasUnreadAdminReply === true whose
 * last admin message createdAt is newer than our last-seen timestamp.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, getToken, SupportTicketSummary } from './api';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // expo-notifications not available (Expo Go SDK 53+) — in-app banner still
  // works, only the OS-level push is missing.
}

const LAST_SEEN_KEY = 'dmr-support-last-seen-v1';
const BANNER_DISMISSED_AT_KEY = 'dmr-support-banner-dismissed-count-v1';

/**
 * Persist the unread-count snapshot the user dismissed in the lobby banner,
 * so the banner doesn't reappear after an app restart for the same backlog.
 * Stored separately from the per-ticket last-seen map because the banner is
 * a count-based UX hint, not tied to any single ticket.
 */
export async function readBannerDismissedCount(): Promise<number> {
  try {
    const v = await AsyncStorage.getItem(BANNER_DISMISSED_AT_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

export async function writeBannerDismissedCount(count: number): Promise<void> {
  try {
    await AsyncStorage.setItem(BANNER_DISMISSED_AT_KEY, String(count));
  } catch {
    // best-effort
  }
}

interface SupportPollResult {
  /** Total tickets with unread admin reply. */
  unreadCount: number;
  /** Newest admin reply timestamp across all tickets, or null. */
  newestReplyAt: string | null;
  /** Subjects of the tickets with the newest replies (for banner copy). */
  unreadSubjects: string[];
}

async function readLastSeen(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SEEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeLastSeen(map: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_SEEN_KEY, JSON.stringify(map));
  } catch {
    // best-effort
  }
}

/**
 * Mark a ticket's admin replies as seen up to its current lastMessage.createdAt.
 * Call this when the user opens the ticket chat so the next poll won't
 * re-notify.
 */
export async function markTicketSeen(ticketId: string, timestamp?: string): Promise<void> {
  const map = await readLastSeen();
  map[ticketId] = timestamp || new Date().toISOString();
  await writeLastSeen(map);
}

/**
 * Poll the server and return current unread state. Fires a local notification
 * for each ticket whose latest admin reply we haven't seen yet.
 *
 * Safe to call frequently — no-ops if the user isn't signed in or if the
 * request fails.
 */
export async function pollSupportReplies(): Promise<SupportPollResult> {
  const empty: SupportPollResult = { unreadCount: 0, newestReplyAt: null, unreadSubjects: [] };
  const token = await getToken();
  if (!token) return empty;

  let tickets: SupportTicketSummary[];
  try {
    const res = await api.support.listTickets();
    tickets = res.tickets;
  } catch {
    return empty;
  }

  const lastSeen = await readLastSeen();
  const newlyArrived: SupportTicketSummary[] = [];
  let newestReplyAt: string | null = null;
  let unreadCount = 0;
  const unreadSubjects: string[] = [];

  for (const t of tickets) {
    if (!t.hasUnreadAdminReply) continue;
    unreadCount++;
    unreadSubjects.push(t.subject);
    const ts = t.lastMessage?.createdAt;
    if (!ts) continue;
    if (!newestReplyAt || ts > newestReplyAt) newestReplyAt = ts;
    // Notify only if this admin reply is newer than what we've already
    // surfaced. Without this guard the user would re-get the same
    // notification every poll until they opened the ticket.
    const seen = lastSeen[t.id];
    if (!seen || ts > seen) newlyArrived.push(t);
  }

  // Fire one local notification per newly-arrived reply so the user sees them
  // individually in their notification tray. Best-effort — silently no-op if
  // expo-notifications isn't available or permission was denied.
  if (Notifications && newlyArrived.length > 0) {
    try {
      const perm = await Notifications.getPermissionsAsync();
      if (perm.status === 'granted') {
        for (const t of newlyArrived) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Support replied',
              body: `Re: ${t.subject}`,
              sound: true,
              data: { screen: '/support', ticketId: t.id },
            },
            trigger: null, // fire immediately
          });
        }
      }
    } catch {
      // ignore
    }
  }

  // Update last-seen so we don't re-notify next poll. We DO NOT clear the
  // unread flag here — that stays true until the user actually opens the
  // ticket and we call markTicketSeen() from the chat view.
  if (newlyArrived.length > 0) {
    const next = { ...lastSeen };
    for (const t of newlyArrived) {
      if (t.lastMessage?.createdAt) next[t.id] = t.lastMessage.createdAt;
    }
    await writeLastSeen(next);
  }

  return { unreadCount, newestReplyAt, unreadSubjects };
}
