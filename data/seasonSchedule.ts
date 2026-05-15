import { ALL_COURSES, CourseData } from './courses';

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

export interface FeaturedMatchup {
  marble1Id: string;
  marble2Id: string;
  headline: string;
}

export interface SeasonRace {
  id: string;              // e.g. 'w1-r0'
  weekNumber: number;      // 1-10
  raceIndex: number;       // 0-4 within the week
  name: string;            // 'Morning Brew', 'PRIME TIME', etc.
  courseId: string;
  courseName: string;
  featuredMatchup: FeaturedMatchup;
  status: 'locked' | 'available' | 'completed';
  winnerId?: string;
  positions?: string[];    // full finish order (8 marble IDs)
}

export interface SeasonWeek {
  weekNumber: number;
  races: SeasonRace[];
  status: 'locked' | 'current' | 'completed';
}

export interface SeasonSchedule {
  seasonNumber: number;
  weeks: SeasonWeek[];
}

// ────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────

const MARBLE_IDS = ['rocky', 'dash', 'lucky', 'spike', 'nova', 'frosty', 'aqua', 'shadow'] as const;

const MATCHUP_HEADLINES: Record<string, string> = {
  'rocky-dash':    'Power vs Speed',
  'rocky-lucky':   'Grit vs Fortune',
  'rocky-spike':   'Clash of Titans',
  'rocky-nova':    'Steady vs Wild',
  'rocky-frosty':  'Fire and Ice',
  'rocky-aqua':    'Mountain vs Stream',
  'rocky-shadow':  'Light vs Dark',
  'dash-lucky':    'Speed vs Luck',
  'dash-spike':    'Quick vs Tough',
  'dash-nova':     'Speedster Showdown',
  'dash-frosty':   'Fast Break',
  'dash-aqua':     'Ocean Speedway',
  'dash-shadow':   'Flash vs Phantom',
  'lucky-spike':   'Fortune vs Force',
  'lucky-nova':    'Stars Align',
  'lucky-frosty':  'Roll the Dice',
  'lucky-aqua':    'Lucky Tide',
  'lucky-shadow':  'Fortune\'s Shadow',
  'spike-nova':    'Brute vs Bright',
  'spike-frosty':  'Heavy Hitters',
  'spike-aqua':    'Power Surge',
  'spike-shadow':  'Thunder and Dark',
  'nova-frosty':   'Wildfire',
  'nova-aqua':     'Cosmic Wave',
  'nova-shadow':   'Supernova',
  'frosty-aqua':   'Cool Currents',
  'frosty-shadow': 'Frost Bite',
  'aqua-shadow':   'Deep Waters',
};

// Points awarded by finish position (1st through 8th)
export const SEASON_POINTS = [10, 7, 5, 4, 3, 2, 1, 0] as const;

export const WEEKS_PER_SEASON = 10;
export const RACES_PER_WEEK = 1;
export const TOTAL_SEASON_RACES = WEEKS_PER_SEASON * RACES_PER_WEEK; // 10

// ────────────────────────────────────────────────────────
// Seeded PRNG (deterministic from season number)
// ────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ────────────────────────────────────────────────────────
// All 28 marble pairings
// ────────────────────────────────────────────────────────

function getAllMatchups(): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < MARBLE_IDS.length; i++) {
    for (let j = i + 1; j < MARBLE_IDS.length; j++) {
      pairs.push([MARBLE_IDS[i], MARBLE_IDS[j]]);
    }
  }
  return pairs; // 28 total
}

function getHeadline(a: string, b: string): string {
  const key1 = `${a}-${b}`;
  const key2 = `${b}-${a}`;
  return MATCHUP_HEADLINES[key1] || MATCHUP_HEADLINES[key2] || 'Rivalry Race';
}

// ────────────────────────────────────────────────────────
// Schedule Generation
// ────────────────────────────────────────────────────────

export function generateSeasonSchedule(seasonNumber: number): SeasonSchedule {
  const rng = mulberry32(seasonNumber * 7919 + 31337);

  // Pick 10 unique courses (1 per week)
  const shuffledCourses = shuffle(ALL_COURSES, rng);
  const selectedCourses = shuffledCourses.slice(0, TOTAL_SEASON_RACES);

  // Shuffle matchups and cycle them for 10 races
  const allMatchups = shuffle(getAllMatchups(), rng);

  const weeks: SeasonWeek[] = [];

  for (let w = 0; w < WEEKS_PER_SEASON; w++) {
    const weekNumber = w + 1;
    const course = selectedCourses[w];
    const [m1, m2] = allMatchups[w % allMatchups.length];

    const race: SeasonRace = {
      id: `w${weekNumber}-r0`,
      weekNumber,
      raceIndex: 0,
      name: `Week ${weekNumber} Race`,
      courseId: course.id,
      courseName: course.name,
      featuredMatchup: {
        marble1Id: m1,
        marble2Id: m2,
        headline: getHeadline(m1, m2),
      },
      status: weekNumber === 1 ? 'available' : 'locked' as const,
    };

    weeks.push({
      weekNumber,
      races: [race],
      status: weekNumber === 1 ? 'current' : 'locked' as const,
    });
  }

  return { seasonNumber, weeks };
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

/** Unlock the next week after the current race completes. */
export function advanceSchedule(weeks: SeasonWeek[]): SeasonWeek[] {
  const updated = weeks.map((w) => ({
    ...w,
    races: w.races.map((r) => ({ ...r })),
  }));

  for (let w = 0; w < updated.length; w++) {
    const week = updated[w];
    // If this week's race is completed, mark week done and unlock next
    if (week.races[0].status === 'completed' && week.status !== 'completed') {
      week.status = 'completed';
      if (w + 1 < updated.length && updated[w + 1].status === 'locked') {
        updated[w + 1].status = 'current';
        updated[w + 1].races[0].status = 'available';
      }
      return updated;
    }
  }

  return updated;
}

/** Check if the regular season is complete (all 10 weeks done). */
export function isSeasonComplete(weeks: SeasonWeek[]): boolean {
  return weeks.every((w) => w.status === 'completed');
}

/** Get the current week number (1-based). */
export function getCurrentWeek(weeks: SeasonWeek[]): number {
  const current = weeks.find((w) => w.status === 'current');
  return current ? current.weekNumber : weeks.length;
}

/** Get the next available race, or null if none. */
export function getNextAvailableRace(weeks: SeasonWeek[]): SeasonRace | null {
  for (const week of weeks) {
    if (week.status === 'locked') continue;
    const race = week.races.find((r) => r.status === 'available');
    if (race) return race;
  }
  return null;
}
