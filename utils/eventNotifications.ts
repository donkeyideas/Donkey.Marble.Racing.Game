import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NATIONAL_EVENTS } from '../data/nationalRaces';

let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // expo-notifications not available (e.g. Expo Go SDK 53+)
  console.warn('expo-notifications not available, push notifications disabled');
}

const NOTIF_SCHEDULED_KEY = 'dmr-event-notifs-scheduled';

/** Check if permission is already granted (without prompting) */
export async function hasNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/** Request permission — call this only when user opts in (e.g., national races screen) */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications) return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  if (Platform.OS === 'ios') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
        allowProvisional: false,
      },
    });
    return status === 'granted';
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/** Format 24h hour to readable string */
function formatHour(h: number): string {
  if (h === 0) return '12:00 AM';
  if (h === 12) return '12:00 PM';
  return h > 12 ? `${h - 12}:00 PM` : `${h}:00 AM`;
}

/**
 * Schedule daily notifications for all national events.
 * Each notification fires 5 minutes before the event start time (in ET).
 *
 * Schedule:
 * - Speed Demon Dash: 11:55 AM ET (event at 12:00 PM ET)
 * - Marble Mile:       5:55 PM ET (event at  6:00 PM ET)
 * - Grand Prix:        7:55 PM ET (event at  8:00 PM ET)
 * - Chaos Cup:         9:55 PM ET (event at 10:00 PM ET)
 */
export async function scheduleEventNotifications(): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) return false;

  if (!Notifications) return false;

  // Cancel all existing scheduled notifications to avoid duplicates
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Get the user's timezone offset relative to ET (in minutes)
  // etOffsetMinutes = local_time - ET_time (negative if local is behind ET)
  const now = new Date();
  const localOffsetMin = now.getTimezoneOffset(); // UTC - local, in minutes (e.g., 480 for PST)
  const month = now.getUTCMonth();
  const etOffsetHours = (month > 2 && month < 10) ? -4 : -5; // simplified DST
  // local - ET = (-localOffsetMin) - (etOffsetHours * 60)
  // e.g., PST vs EST: (-480) - (-300) = -180 (PST is 3h behind ET)
  const etOffsetMinutes = -localOffsetMin - (etOffsetHours * 60);

  for (const event of NATIONAL_EVENTS) {
    // 5 min before the event hour → XX:55 of the previous hour
    const notifyHourET = event.startHourET === 0 ? 23 : event.startHourET - 1;
    const notifyMinuteET = 55;

    // Convert ET time to local device time
    const totalMinutesET = notifyHourET * 60 + notifyMinuteET;
    const totalMinutesLocal = totalMinutesET + etOffsetMinutes;

    // Handle day wrap-around (negative or > 1440)
    const wrapped = ((totalMinutesLocal % 1440) + 1440) % 1440;
    const localHour = Math.floor(wrapped / 60);
    const localMinute = wrapped % 60;

    await Notifications!.scheduleNotificationAsync({
      content: {
        title: `${event.name} starts in 5 minutes!`,
        body: `Entry: ${event.entryFee} coins \u00B7 Win up to ${event.entryFee * event.multiplier} coins (${event.multiplier}X). Get your bets in!`,
        sound: true,
        data: { eventId: event.id, screen: '/national-races' },
      },
      trigger: {
        type: Notifications!.SchedulableTriggerInputTypes.DAILY,
        hour: localHour,
        minute: localMinute,
      },
    });
  }

  await AsyncStorage.setItem(NOTIF_SCHEDULED_KEY, 'true');
  return true;
}

/**
 * Try to schedule if permission is already granted (silent, no prompt).
 * Called on app startup — won't bother the user.
 */
export async function scheduleIfAlreadyPermitted(): Promise<void> {
  const granted = await hasNotificationPermission();
  if (!granted) return;
  // Re-schedule to keep times accurate (e.g., if user changed timezone)
  await scheduleEventNotifications();
}

/** Cancel all scheduled event notifications */
export async function cancelEventNotifications(): Promise<void> {
  if (Notifications) await Notifications.cancelAllScheduledNotificationsAsync();
  await AsyncStorage.removeItem(NOTIF_SCHEDULED_KEY);
}

/** Check if notifications have been set up */
export async function areNotificationsScheduled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(NOTIF_SCHEDULED_KEY);
  return val === 'true';
}

/**
 * Get the notification schedule for display purposes.
 */
export function getNotificationSchedule(): { event: string; notifyTimeET: string; eventTimeET: string }[] {
  return NATIONAL_EVENTS.map(event => ({
    event: event.name,
    notifyTimeET: formatHour(event.startHourET).replace(':00', ':55'),
    eventTimeET: formatHour(event.startHourET),
  }));
}
