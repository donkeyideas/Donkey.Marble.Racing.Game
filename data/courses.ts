import { MARBLES } from '../theme';
import { getETDateString } from './nationalRaces';

export type CourseTheme =
  | 'meadow' | 'volcano' | 'frozen' | 'cyber'
  | 'beach' | 'forest' | 'desert' | 'sunset' | 'night'
  | 'candy' | 'ocean' | 'volcanic' | 'neon' | 'snow';

export interface CourseData {
  id: string;
  name: string;
  theme: CourseTheme;
  trackType: string; // maps to buildTrack() physics id
  description: string;
  favoredMarbleId: string;
  favoredStat: string;
  gradientColors: [string, string];
}

export const COURSES: CourseData[] = [
  // 1. Classic Zigzag
  { id: 'classic-zigzag-1', name: 'Classic Zigzag', theme: 'meadow', trackType: 'classic-zigzag', description: 'The original — zigzag ramps and peg zones', favoredMarbleId: 'dash', favoredStat: 'Speed', gradientColors: ['#1a4a1a', '#3a8a3a'] },
  // 2. Bumper Blitz
  { id: 'bumper-blitz-1', name: 'Bumper Blitz', theme: 'volcano', trackType: 'bumper-blitz', description: 'Flat ramps, wall-to-wall bumpers', favoredMarbleId: 'spike', favoredStat: 'Power', gradientColors: ['#5a1a0a', '#c44000'] },
  // 3. Pendulum Alley
  { id: 'pendulum-alley-1', name: 'Pendulum Alley', theme: 'volcano', trackType: 'pendulum-alley', description: 'Swinging wrecking balls knock marbles around', favoredMarbleId: 'rocky', favoredStat: 'Power', gradientColors: ['#6a1a00', '#e74c3c'] },
  // 4. Ball Pit Run
  { id: 'ball-pit-run-1', name: 'Ball Pit Run', theme: 'cyber', trackType: 'ball-pit-run', description: 'Push through zones of loose balls', favoredMarbleId: 'spike', favoredStat: 'Power', gradientColors: ['#2a0a4a', '#9b59b6'] },
  // 5. Peg Storm
  { id: 'peg-storm-1', name: 'Peg Storm', theme: 'frozen', trackType: 'peg-storm', description: 'Ultra-dense pegs with varied sizes — pure chaos', favoredMarbleId: 'lucky', favoredStat: 'Luck', gradientColors: ['#0a2a4a', '#4a9aca'] },
  // 6. Cradle Drop
  { id: 'cradle-drop-1', name: 'Cradle Drop', theme: 'meadow', trackType: 'cradle-drop', description: 'Newton cradle rows transfer marble momentum', favoredMarbleId: 'frosty', favoredStat: 'Bounce', gradientColors: ['#2d6b2d', '#4a9a4a'] },
  // 7. Trampoline Park
  { id: 'trampoline-park-1', name: 'Trampoline Park', theme: 'cyber', trackType: 'trampoline-park', description: 'Bouncy pads launch marbles skyward', favoredMarbleId: 'frosty', favoredStat: 'Bounce', gradientColors: ['#1a0a3a', '#8a2aca'] },
  // 8. Terrain Valley
  { id: 'terrain-valley-1', name: 'Terrain Valley', theme: 'meadow', trackType: 'terrain-valley', description: 'Curving undulating ramps — no straight paths', favoredMarbleId: 'aqua', favoredStat: 'Speed', gradientColors: ['#3a7a3a', '#5aaa5a'] },
  // 9. The Gauntlet
  { id: 'gauntlet-1', name: 'The Gauntlet', theme: 'volcano', trackType: 'gauntlet', description: 'Every obstacle combined — the ultimate test', favoredMarbleId: 'shadow', favoredStat: 'Dark horse', gradientColors: ['#3a0a0a', '#aa2020'] },
  // 10. Pendulum Alley (frozen variant)
  { id: 'pendulum-alley-2', name: 'Frozen Pendulums', theme: 'frozen', trackType: 'pendulum-alley', description: 'Icy wrecking balls on the frozen track', favoredMarbleId: 'nova', favoredStat: 'Wild card', gradientColors: ['#0a3a6a', '#3498db'] },
  // 11. Ball Pit Run (meadow variant)
  { id: 'ball-pit-run-2', name: 'Garden Ball Pit', theme: 'meadow', trackType: 'ball-pit-run', description: 'A softer ball pit among the meadows', favoredMarbleId: 'dash', favoredStat: 'Speed', gradientColors: ['#1a5a1a', '#3aaa3a'] },
  // 12. The Gauntlet (cyber variant)
  { id: 'gauntlet-2', name: 'Cyber Gauntlet', theme: 'cyber', trackType: 'gauntlet', description: 'Digital mayhem — every element at max intensity', favoredMarbleId: 'lucky', favoredStat: 'Luck', gradientColors: ['#0a0a2a', '#5a2a8a'] },
  // 13–16. Grand Prix — F1-style sweeping curves (4 theme variants)
  { id: 'grand-prix-cyber', name: 'Neon Grand Prix', theme: 'cyber', trackType: 'grand-prix-cyber', description: 'F1-style curves through neon circuits', favoredMarbleId: 'dash', favoredStat: 'Speed', gradientColors: ['#0a0a3a', '#9b59b6'] },
  { id: 'grand-prix-meadow', name: 'Garden Grand Prix', theme: 'meadow', trackType: 'grand-prix-meadow', description: 'F1-style curves through rolling meadows', favoredMarbleId: 'aqua', favoredStat: 'Speed', gradientColors: ['#1a4a1a', '#3a8a3a'] },
  { id: 'grand-prix-volcano', name: 'Inferno Grand Prix', theme: 'volcano', trackType: 'grand-prix-volcano', description: 'F1-style curves through molten lava', favoredMarbleId: 'spike', favoredStat: 'Power', gradientColors: ['#5a1a0a', '#e74c3c'] },
  { id: 'grand-prix-frozen', name: 'Glacier Grand Prix', theme: 'frozen', trackType: 'grand-prix-frozen', description: 'F1-style curves across icy terrain', favoredMarbleId: 'frosty', favoredStat: 'Bounce', gradientColors: ['#0a2a4a', '#3498db'] },
  // ── Featured generated tracks (first 10 from validated set) ──
  { id: 'gen-1004', name: 'Thunder Canyon', theme: 'meadow', trackType: 'gen-1004', description: 'Clean medium-peg descent — pure speed', favoredMarbleId: 'dash', favoredStat: 'Speed', gradientColors: ['#1a4a1a', '#3a8a3a'] },
  { id: 'gen-1006', name: 'Crystal Falls', theme: 'volcano', trackType: 'gen-1006', description: 'Ball pits and cradles weave through ramps', favoredMarbleId: 'rocky', favoredStat: 'Power', gradientColors: ['#5a1a0a', '#c44000'] },
  { id: 'gen-1043', name: 'Iron Run', theme: 'frozen', trackType: 'gen-1043', description: 'Long descent with light pegs', favoredMarbleId: 'lucky', favoredStat: 'Luck', gradientColors: ['#0a2a4a', '#4a9aca'] },
  { id: 'gen-1192', name: 'Mystic Gorge', theme: 'cyber', trackType: 'gen-1192', description: 'Pendulums and trampolines on a fast course', favoredMarbleId: 'frosty', favoredStat: 'Bounce', gradientColors: ['#2a0a4a', '#9b59b6'] },
  { id: 'gen-1068', name: 'Blazing Pass', theme: 'meadow', trackType: 'gen-1068', description: 'Pendulums and trampolines with medium pegs', favoredMarbleId: 'spike', favoredStat: 'Power', gradientColors: ['#2d6b2d', '#4a9a4a'] },
  { id: 'gen-1970', name: 'Shadow Valley', theme: 'volcano', trackType: 'gen-1970', description: 'Smooth ramp run through medium pegs', favoredMarbleId: 'shadow', favoredStat: 'Dark horse', gradientColors: ['#6a1a00', '#e74c3c'] },
  { id: 'gen-1143', name: 'Frozen Drop', theme: 'frozen', trackType: 'gen-1143', description: 'Cradles and trampolines across winding ramps', favoredMarbleId: 'nova', favoredStat: 'Wild card', gradientColors: ['#0a3a6a', '#3498db'] },
  { id: 'gen-1094', name: 'Neon Descent', theme: 'cyber', trackType: 'gen-1094', description: 'Ball pits and trampolines through tight ramps', favoredMarbleId: 'aqua', favoredStat: 'Speed', gradientColors: ['#1a0a3a', '#8a2aca'] },
  { id: 'gen-1098', name: 'Storm Rapids', theme: 'meadow', trackType: 'gen-1098', description: 'Pendulum gauntlet on a fast course', favoredMarbleId: 'dash', favoredStat: 'Speed', gradientColors: ['#3a7a3a', '#5aaa5a'] },
  { id: 'gen-1106', name: 'Golden Chute', theme: 'volcano', trackType: 'gen-1106', description: 'Dense peg zones with cradles and trampolines', favoredMarbleId: 'spike', favoredStat: 'Power', gradientColors: ['#3a0a0a', '#aa2020'] },
];

export const THEME_COLORS: Record<CourseTheme, string> = {
  meadow: '#2ecc71',
  volcano: '#e74c3c',
  frozen: '#3498db',
  cyber: '#9b59b6',
  beach: '#f0c040',
  forest: '#1a8a1a',
  desert: '#d4a840',
  sunset: '#ff6b35',
  night: '#4a4a8a',
  candy: '#ff69b4',
  ocean: '#0077b6',
  volcanic: '#cc0000',
  neon: '#00ff87',
  snow: '#b0d0f0',
};

// ── Generated tracks ──

// Validated: 5 runs per seed, all 8/8 finish naturally in <55s, zero "real
// stuck" events (3-second motionless windows), zero doomsday rescues.
// Re-audited after the engine pinch-repair pass + frictionStatic /
// trampoline-tilt fixes — seeds that consistently fail any criterion
// across multiple audit runs were dropped. See scripts/test-all-tracks.ts.
const VALIDATED_SEEDS: number[] = [
  // Original cohort (1004–2010) — minus seeds that geometrically pinch
  // marbles or whose long ramp counts push avg time over 55s even with
  // the lossy bumper / tilted trampoline / pinch repair fixes.
  1004, 1006, 1043, 1068, 1094, 1098, 1106,
  1143, 1165, 1175, 1177, 1178, 1187, 1192, 1204, 1214,
  1219, 1280, 1299, 1300,
  1368, 1403, 1410, 1426, 1428,
  1432, 1466, 1494, 1510, 1520, 1561, 1564,
  1579, 1580, 1581, 1592, 1598, 1620, 1638,
  1646, 1670, 1691, 1693,
  1840, 1895, 1970,
  // 2100-series — kept the seeds that audit cleanly. Dropped seeds with
  // recurring stuck patterns or 3/5+ doomsday triggers.
  2100, 2101, 2102,
  2108, 2109, 2110, 2112, 2115,
  2118, 2123,
  2128, 2129, 2131,
  2135, 2136, 2142,
  2145, 2146, 2148, 2153,
  2156, 2159,
  2164, 2169,
  2173, 2174, 2175, 2176, 2177, 2178,
  2182, 2184,
  2190, 2195,
  2198, 2199, 2201, 2203, 2204,
  2205, 2207, 2208, 2210, 2211,
  2215, 2218,
];

const PREFIXES = [
  'Thunder', 'Crystal', 'Iron', 'Mystic', 'Blazing', 'Shadow', 'Frozen', 'Neon',
  'Storm', 'Golden', 'Silver', 'Dark', 'Crimson', 'Emerald', 'Cobalt', 'Amber',
  'Phantom', 'Savage', 'Wild', 'Ancient', 'Rusted', 'Molten', 'Spectral', 'Lunar',
  'Solar',
];

const SUFFIXES = [
  'Canyon', 'Falls', 'Run', 'Gorge', 'Pass', 'Valley', 'Drop', 'Descent',
  'Rapids', 'Chute', 'Plunge', 'Drift', 'Slope', 'Ridge', 'Trail', 'Cascade',
  'Ravine', 'Summit', 'Hollow', 'Abyss',
];

/* Derived from theme/index.ts so adding a new marble there auto-flows
 * into procedural course generation. Previously this hardcoded list
 * would silently drift if a marble was added/removed in theme without
 * updating courses — generated tracks would point at non-existent
 * marble ids. Mirrors what data/seasonSchedule.ts already does. */
const MARBLE_IDS = MARBLES.map((m) => m.id);

const FAVORED_STATS = ['Speed', 'Power', 'Bounce', 'Luck', 'Speed', 'Wild card', 'Dark horse', 'Speed'];

const DESCRIPTIONS = [
  'Tight ramps with dense peg zones',
  'Wide open descent — pure speed matters',
  'Winding path through scattered bumpers',
  'Narrow gaps test precision and bounce',
  'Multi-obstacle gauntlet run',
  'Fast drop with minimal obstacles',
  'Tricky turns and hidden bumpers',
  'Bouncy terrain keeps it unpredictable',
  'Long ramp chains build momentum',
  'Chaotic peg fields slow the pack',
  'Obstacle-heavy test of endurance',
  'Speed zones reward aggressive play',
  'Steep drops with tight funnels',
  'Open course with strategic bumpers',
  'Dense obstacles test every marble stat',
  'Quick descent favors the bold',
  'Scattered hazards across wide ramps',
  'Momentum-building run with sharp turns',
  'Peg-heavy course with surprise gaps',
  'Balance of speed and obstacle control',
];

const THEMES: CourseTheme[] = [
  'meadow', 'volcano', 'frozen', 'cyber',
  'beach', 'forest', 'desert', 'sunset', 'night',
  'candy', 'ocean', 'volcanic', 'neon', 'snow',
];

const THEME_GRADIENTS: Record<CourseTheme, [string, string][]> = {
  meadow: [['#1a4a1a', '#3a8a3a'], ['#2d6b2d', '#4a9a4a'], ['#3a7a3a', '#5aaa5a']],
  volcano: [['#5a1a0a', '#c44000'], ['#6a1a00', '#e74c3c'], ['#3a0a0a', '#aa2020']],
  frozen: [['#0a2a4a', '#4a9aca'], ['#0a3a6a', '#3498db'], ['#1a3a5a', '#5a8aba']],
  cyber: [['#2a0a4a', '#9b59b6'], ['#1a0a3a', '#8a2aca'], ['#0a0a2a', '#5a2a8a']],
  beach: [['#4a90d9', '#c2b280'], ['#5aa0e0', '#d0c090'], ['#3a80c0', '#b0a070']],
  forest: [['#0a3a0a', '#2d5a2d'], ['#0a4a0a', '#3a6a3a'], ['#0a2a0a', '#1a4a1a']],
  desert: [['#a08030', '#d4a840'], ['#b09040', '#e0b850'], ['#907020', '#c09030']],
  sunset: [['#cc4420', '#8a2060'], ['#dd5530', '#9a3070'], ['#bb3310', '#7a1050']],
  night: [['#0a0a2a', '#1a1a4a'], ['#0a0a3a', '#2a2a5a'], ['#050520', '#101040']],
  candy: [['#cc1080', '#ff69b4'], ['#dd2090', '#ff79c4'], ['#bb0070', '#ff59a4']],
  ocean: [['#001a4a', '#0077b6'], ['#002a5a', '#0087c6'], ['#000a3a', '#0067a6']],
  volcanic: [['#3a0000', '#8b0000'], ['#4a0000', '#9b1010'], ['#2a0000', '#7b0000']],
  neon: [['#0a2a1a', '#00cc66'], ['#0a3a2a', '#00dd77'], ['#0a1a0a', '#00bb55']],
  snow: [['#a0b8d0', '#d0e0f0'], ['#b0c8e0', '#e0f0ff'], ['#90a8c0', '#c0d0e0']],
};

export function getGeneratedCourses(): CourseData[] {
  return VALIDATED_SEEDS.map((seed, i) => {
    const theme = THEMES[i % THEMES.length];
    const prefix = PREFIXES[i % PREFIXES.length];
    const suffix = SUFFIXES[i % SUFFIXES.length];
    const gradients = THEME_GRADIENTS[theme];
    return {
      id: `gen-${seed}`,
      name: `${prefix} ${suffix}`,
      theme,
      trackType: `gen-${seed}`,
      description: DESCRIPTIONS[i % DESCRIPTIONS.length],
      favoredMarbleId: MARBLE_IDS[i % MARBLE_IDS.length],
      favoredStat: FAVORED_STATS[i % FAVORED_STATS.length],
      gradientColors: gradients[i % gradients.length],
    };
  });
}

// ── Generated Grand Prix tracks (seeded S-channel variants) ──

// Grand Prix seed list expanded so every theme has at least 4 variants.
// 14 themes × 4 = 56 GP tracks total. Adds 20 seeds (137-156) to the
// existing 36, brings overall track count to 246 + 20 = ~266.
const GP_SEEDS: number[] = [
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
  111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
  121, 122, 123, 124, 125, 126, 127, 128, 129, 130,
  131, 132, 133, 134, 135, 136, 137, 138, 139, 140,
  141, 142, 143, 144, 145, 146, 147, 148, 149, 150,
  151, 152, 153, 154, 155, 156,
];

const GP_PREFIXES = [
  'Circuit', 'Rally', 'Sprint', 'Drift', 'Apex', 'Turbo', 'Nitro', 'Velocity',
  'Blaze', 'Thunder', 'Storm', 'Phantom', 'Lightning', 'Viper', 'Cobra', 'Falcon',
  'Eclipse', 'Zenith',
];

const GP_SUFFIXES = [
  'Grand Prix', 'Circuit', 'Speedway', 'Rally', 'Prix', 'Cup', 'Classic',
  'Championship', 'Challenge', 'Invitational',
];

const GP_DESCS = [
  'Tight S-curves with windmill obstacles',
  'Sweeping bends through obstacle chambers',
  'High-speed channel descent with pendulums',
  'Winding tube packed with trampolines',
  'Speed bursts accelerate through tight curves',
  'Challenging S-channel with mixed hazards',
  'Bumper-lined curves test marble control',
  'Long winding descent through peg fields',
];

function getGeneratedGPCourses(): CourseData[] {
  return GP_SEEDS.map((seed, i) => {
    const theme = THEMES[i % THEMES.length];
    const prefix = GP_PREFIXES[i % GP_PREFIXES.length];
    const suffix = GP_SUFFIXES[i % GP_SUFFIXES.length];
    const gradients = THEME_GRADIENTS[theme];
    return {
      id: `gp-${seed}-${theme}`,
      name: `${prefix} ${suffix}`,
      theme,
      trackType: `gp-${seed}-${theme}`,
      description: GP_DESCS[i % GP_DESCS.length],
      favoredMarbleId: MARBLE_IDS[i % MARBLE_IDS.length],
      favoredStat: FAVORED_STATS[i % FAVORED_STATS.length],
      gradientColors: gradients[i % gradients.length],
    };
  });
}

// All courses: 16 hand-crafted (incl 4 GP) + 10 featured gen + ~181 gen + 36 GP seeded = ~246 total
const featuredIds = new Set(COURSES.filter(c => c.id.startsWith('gen-')).map(c => c.id));
const extraGenerated = getGeneratedCourses().filter(c => !featuredIds.has(c.id));
const gpGenerated = getGeneratedGPCourses();
export const ALL_COURSES: CourseData[] = [...COURSES, ...extraGenerated, ...gpGenerated];

/** Deterministic Track of the Day — picks one course per ET calendar date.
 *
 * Uses Eastern Time so the day-rollover matches the national-race / daily-
 * bonus schedule. Previously this used local device time, which meant a
 * player in PT saw a different Track of the Day than a player in ET at the
 * 3-hour overlap each evening. Mirroring getETDateString() keeps the
 * "Track of the Day" globally consistent. */
export function getTrackOfTheDay(): CourseData {
  // getETDateString returns 'YYYY-MM-DD' — parse back into a numeric seed
  // (YYYYMMDD) for the existing mulberry32 hash. Stripping the dashes is
  // the simplest path and preserves the hash distribution that was tuned
  // against the previous getFullYear()*10000+... seed shape.
  const dateStr = getETDateString();
  const seed = parseInt(dateStr.replace(/-/g, ''), 10) | 0;
  // mulberry32-style hash for good distribution
  let h = seed;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return ALL_COURSES[h % ALL_COURSES.length];
}
