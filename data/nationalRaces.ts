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
    startHourET: 18,       // 6pm ET daily
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
    startHourET: 22,       // 10pm ET daily (late night)
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

/** Get current time in Eastern timezone */
function getEasternTime(): Date {
  const now = new Date();
  const eastern = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return eastern;
}

/** Get today's date string in ET (YYYY-MM-DD) */
export function getETDateString(): string {
  const et = getEasternTime();
  const y = et.getFullYear();
  const m = String(et.getMonth() + 1).padStart(2, '0');
  const d = String(et.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Check if a national event is currently live (past its start hour today) */
export function isEventLive(event: NationalEvent): boolean {
  const et = getEasternTime();
  return et.getHours() >= event.startHourET;
}

/** Check if user already completed this event today */
export function isEventCompletedToday(event: NationalEvent, state: NationalEventState | undefined): boolean {
  if (!state?.completedDate) return false;
  return state.completedDate === getETDateString();
}

/** Get countdown or status text for an event */
export function getEventTimeText(event: NationalEvent, state: NationalEventState | undefined): string {
  const live = isEventLive(event);
  const completedToday = isEventCompletedToday(event, state);

  if (completedToday) return 'COMPLETED · Resets tomorrow';
  if (live) return `LIVE NOW · Started at ${formatHour(event.startHourET)} ET`;

  // Not yet live today — show countdown
  const et = getEasternTime();
  const hoursLeft = event.startHourET - et.getHours();
  if (hoursLeft === 1) return `Starts in 1 hour · ${formatHour(event.startHourET)} ET`;
  return `Starts in ${hoursLeft}hrs · ${formatHour(event.startHourET)} ET`;
}

/** Format 24h hour to 12h string */
function formatHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h > 12 ? `${h - 12}pm` : `${h}am`;
}

/** Get schedule description for display */
export function getScheduleText(event: NationalEvent): string {
  return `Daily at ${formatHour(event.startHourET)} ET`;
}

/** Pick random courses for events */
export function generateEventCourses(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const shuffled = [...ALL_COURSES].sort(() => Math.random() - 0.5);
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
