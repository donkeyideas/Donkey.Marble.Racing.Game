import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NATIONAL_EVENTS } from '../data/nationalRaces';

const NOTIF_SCHEDULED_KEY = 'dmr-event-notifs-scheduled';

// Configure notification behavior (shows alert even when app is open)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Check if permission is already granted (without prompting) */
export async function hasNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/** Request permission — call this only when user opts in (e.g., national races screen) */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  // iOS: provisional permission shows notifications quietly in Notification Center
  // without interrupting. Full permission is requested when user taps the notification.
  if (Platform.OS === 'ios') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        allowBadge: false,
        allowProvisional: false, // ask for full permission
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

  // Cancel all existing scheduled notifications to avoid duplicates
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Get the user's timezone offset relative to ET
  const now = new Date();
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etString);
  const localDate = new Date(now.toLocaleString('en-US'));
  const etOffsetMinutes = Math.round((localDate.getTime() - etDate.getTime()) / 60000);

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

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${event.name} starts in 5 minutes!`,
        body: `Entry: ${event.entryFee} coins \u00B7 Win up to ${event.entryFee * event.multiplier} coins (${event.multiplier}X). Get your bets in!`,
        sound: true,
        data: { eventId: event.id, screen: '/national-races' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
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
  await Notifications.cancelAllScheduledNotificationsAsync();
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
