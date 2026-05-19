import { ALL_COURSES } from './courses';

export interface NationalEvent {
  id: string;
  name: string;
  subtitle: string;
  multiplier: number;
  entryFee: number;
  format: 'single' | 'series';
  seriesLength: number;      // 1 for single, 3 for Grand Prix
  colors: [string, string];
  /** Daily start hour in Eastern Time (24h). Event goes live at this hour every day. */
  startHourET: number;
}

export const NATIONAL_EVENTS: NationalEvent[] = [
  {
    id: 'grand-prix',
    name: 'THE GRAND PRIX',
    subtitle: '3-race series · Top finisher wins jackpot',
    multiplier: 5,
    entryFee: 500,
    format: 'series',
    seriesLength: 3,
    colors: ['#ffc220', '#ff6b1a'],
    startHourET: 20,       // 8pm ET daily
  },
  {
    id: 'marble-mile',
    name: 'THE MARBLE MILE',
    subtitle: 'Longest track · Endurance test',
    multiplier: 3,
    entryFee: 300,
    format: 'single',
    seriesLength: 1,
    colors: ['#e74c3c', '#c0392b'],
    startHourET: 17,       // 5pm ET daily (afternoon slot)
  },
  {
    id: 'speed-demon',
    name: 'SPEED DEMON DASH',
    subtitle: 'Shortest track · Pure speed',
    multiplier: 2,
    entryFee: 200,
    format: 'single',
    seriesLength: 1,
    colors: ['#2ecc71', '#1a9c58'],
    startHourET: 12,       // 12pm ET daily (lunchtime)
  },
  {
    id: 'chaos-cup',
    name: 'CHAOS CUP',
    subtitle: 'Random course · Random marbles · Anything goes',
    multiplier: 4,
    entryFee: 400,
    format: 'single',
    seriesLength: 1,
    colors: ['#9b59b6', '#7d3c98'],
    startHourET: 8,        // 8am ET daily (morning slot)
  },
];

export interface NationalEventState {
  courseIds: string[];
  entered: boolean;
  completedDate: string | null;   // ISO date string (YYYY-MM-DD in ET) when last completed
  seriesProgress: {
    racesCompleted: number;
    marblePoints: Record<string, number>;   // cumulative series points
    playerPick: string | null;              // marble picked for the series
  } | null;
}

/**
 * Get Eastern Time offset in hours (-5 EST or -4 EDT).
 * US DST: 2nd Sunday of March at 2am → 1st Sunday of November at 2am.
 */
function getETOffset(): number {
  const now = new Date();
  const month = now.getUTCMonth(); // 0-indexed
  const day = now.getUTCDate();
  const dow = now.getUTCDay(); // 0=Sun

  // Apr–Oct: always EDT (-4)
  if (month > 2 && month < 10) return -4;
  // Dec–Feb: always EST (-5)
  if (month < 2 || month === 11) return -5;
  // March: EDT starts 2nd Sunday (day 8–14)
  if (month === 2) {
    // Find the 2nd Sunday: first Sunday (1-based) in March, add 7
    const firstDayDow = new Date(Date.UTC(now.getUTCFullYear(), 2, 1)).getUTCDay();
    const secondSunday = firstDayDow === 0 ? 8 : 8 + (7 - firstDayDow);
    return day >= secondSunday ? -4 : -5;
  }
  // November: EST starts 1st Sunday (day 1–7)
  const firstDayDow = new Date(Date.UTC(now.getUTCFullYear(), 10, 1)).getUTCDay();
  const firstSunday = firstDayDow === 0 ? 1 : 8 - firstDayDow;
  return day >= firstSunday ? -5 : -4;
}

/** Get the current hour in Eastern Time (0–23). Works on Hermes/RN. */
function getEasternHour(): number {
  const now = new Date();
  const utcH = now.getUTCHours();
  return ((utcH + getETOffset()) % 24 + 24) % 24;
}

/** Get today's date string in ET (YYYY-MM-DD) */
export function getETDateString(): string {
  const now = new Date();
  const offsetMs = getETOffset() * 3600000;
  const et = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + offsetMs);
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, '0');
  const d = String(et.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Each event closes when the NEXT event of the day opens. With one event
 * per daypart (8 AM / 12 PM / 5 PM / 8 PM), only ONE event is live at a
 * time. For the last event of the day (Grand Prix at 8 PM) the close
 * hour is 24 (midnight ET); the gap from midnight to 8 AM has no live
 * event.
 *
 * Computed dynamically from NATIONAL_EVENTS so the schedule is the only
 * source of truth — change a startHourET and the close times shift
 * automatically.
 */
export function getEventEndHour(event: NationalEvent): number {
  const sorted = [...NATIONAL_EVENTS].sort((a, b) => a.startHourET - b.startHourET);
  const idx = sorted.findIndex((e) => e.id === event.id);
  const next = sorted[idx + 1];
  return next ? next.startHourET : 24;
}

/** Check if a national event is currently live (within its daypart window). */
export function isEventLive(event: NationalEvent): boolean {
  const h = getEasternHour();
  return h >= event.startHourET && h < getEventEndHour(event);
}

/** Check if an event's daypart window has already passed today. */
export function isEventClosedToday(event: NationalEvent): boolean {
  return getEasternHour() >= getEventEndHour(event);
}

/** Check if user already completed this event today */
export function isEventCompletedToday(event: NationalEvent, state: NationalEventState | undefined): boolean {
  if (!state?.completedDate) return false;
  return state.completedDate === getETDateString();
}

/**
 * Convert an ET hour (24h) to the user's LOCAL hour. Event start times are
 * canonically defined in ET (the schedule is global), but each player sees
 * the time formatted for their device so they don't have to mentally
 * convert "8pm ET" to their own timezone.
 */
function etHourToLocal(etHour: number): Date {
  const now = new Date();
  const etOffset = getETOffset(); // -5 or -4 hours
  // ET hour → UTC hour: subtract the (negative) offset
  const utcHour = (etHour - etOffset + 24) % 24;
  const d = new Date(now);
  d.setUTCHours(utcHour, 0, 0, 0);
  return d;
}

/** Format an ET hour as the user's local time, e.g. "9 AM" / "12 PM". */
export function formatLocalEventTime(etHour: number): string {
  const d = etHourToLocal(etHour);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true });
}

/** Get countdown or status text for an event. Uses LOCAL time strings;
 *  no timezone marker in the user-facing copy. */
export function getEventTimeText(event: NationalEvent, state: NationalEventState | undefined): string {
  const completedToday = isEventCompletedToday(event, state);
  if (completedToday) return 'COMPLETED · Resets tomorrow';

  const live = isEventLive(event);
  if (live) return `LIVE NOW · Started at ${formatLocalEventTime(event.startHourET)}`;

  // Window has already passed for today — don't keep saying "live now"
  // when the next event has opened.
  if (isEventClosedToday(event)) {
    return `Closed today · Returns tomorrow at ${formatLocalEventTime(event.startHourET)}`;
  }

  // Not yet live today — show countdown
  const currentHour = getEasternHour();
  const hoursLeft = event.startHourET - currentHour;
  if (hoursLeft === 1) return `Starts in 1 hour · ${formatLocalEventTime(event.startHourET)}`;
  return `Starts in ${hoursLeft}hrs · ${formatLocalEventTime(event.startHourET)}`;
}

/** Get schedule description for display */
export function getScheduleText(event: NationalEvent): string {
  return `Daily at ${formatLocalEventTime(event.startHourET)}`;
}

/** Bucket an event into a time-of-day slot by its ET hour. */
export type EventDaypart = 'morning' | 'noon' | 'afternoon' | 'night';
export function getEventDaypart(event: NationalEvent): EventDaypart {
  const h = event.startHourET;
  if (h < 12) return 'morning';
  if (h < 16) return 'noon';
  if (h < 20) return 'afternoon';
  return 'night';
}

/* Deterministic per-day course selection.
 *
 * Previously `Math.random()` re-shuffled the course list on every call,
 * which meant two phones opening the same national event saw DIFFERENT
 * courses, and a single player's "current event" silently swapped its
 * course set every time gameStore re-derived it (state recompute, app
 * resume, persistence rehydrate). That broke the "all players race the
 * same course today" promise — entries placed at 8:01 could be on a
 * volcano track while entries placed at 8:02 were on a grass one.
 *
 * Now we seed a small PRNG with today's ET date string so:
 *   1. Every device sees the same courses for the same day.
 *   2. The selection is stable across resumes / rehydrates.
 *   3. Tomorrow's set is different.
 *
 * dateOverride is for tests that need to lock to a specific day. */
function seedFromString(seed: string): () => number {
  // xmur3 → splitmix32-ish: cheap deterministic 32-bit RNG.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateEventCourses(dateOverride?: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const day = dateOverride || getETDateString();
  const rand = seedFromString(`national-courses:${day}`);

  // Fisher-Yates with the seeded RNG so the same `day` always produces the
  // same ordering. ALL_COURSES is the canonical course list from data/courses.ts.
  const shuffled = [...ALL_COURSES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  let idx = 0;
  NATIONAL_EVENTS.forEach((event) => {
    const count = event.seriesLength;
    result[event.id] = shuffled.slice(idx, idx + count).map((c) => c.id);
    idx += count;
  });

  return result;
}

/** Points for placement in Grand Prix series races */
export const SERIES_POINTS = [10, 7, 5, 4, 3, 2, 1, 0] as const;

/** Calculate payout for a national race */
export function calculateNationalPayout(
  placement: number,
  entryFee: number,
  multiplier: number,
): number {
  if (placement === 0) return Math.round(entryFee * multiplier); // 1st
  if (placement === 1) return Math.round(entryFee * 0.5);        // 2nd
  if (placement === 2) return Math.round(entryFee * 0.25);       // 3rd
  return 0;
}
