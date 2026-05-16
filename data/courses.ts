export type CourseTheme = 'meadow' | 'volcano' | 'frozen' | 'cyber';

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
  // ── Featured generated tracks (first 10 from validated set) ──
  { id: 'gen-1004', name: 'Thunder Canyon', theme: 'meadow', trackType: 'gen-1004', description: 'Clean medium-peg descent — pure speed', favoredMarbleId: 'dash', favoredStat: 'Speed', gradientColors: ['#1a4a1a', '#3a8a3a'] },
  { id: 'gen-1028', name: 'Crystal Falls', theme: 'volcano', trackType: 'gen-1028', description: 'Ball pits and cradles weave through ramps', favoredMarbleId: 'rocky', favoredStat: 'Power', gradientColors: ['#5a1a0a', '#c44000'] },
  { id: 'gen-1043', name: 'Iron Run', theme: 'frozen', trackType: 'gen-1043', description: 'Long descent with light pegs', favoredMarbleId: 'lucky', favoredStat: 'Luck', gradientColors: ['#0a2a4a', '#4a9aca'] },
  { id: 'gen-1725', name: 'Mystic Gorge', theme: 'cyber', trackType: 'gen-1725', description: 'Pendulums and trampolines on a fast course', favoredMarbleId: 'frosty', favoredStat: 'Bounce', gradientColors: ['#2a0a4a', '#9b59b6'] },
  { id: 'gen-1068', name: 'Blazing Pass', theme: 'meadow', trackType: 'gen-1068', description: 'Pendulums and trampolines with medium pegs', favoredMarbleId: 'spike', favoredStat: 'Power', gradientColors: ['#2d6b2d', '#4a9a4a'] },
  { id: 'gen-1970', name: 'Shadow Valley', theme: 'volcano', trackType: 'gen-1970', description: 'Smooth ramp run through medium pegs', favoredMarbleId: 'shadow', favoredStat: 'Dark horse', gradientColors: ['#6a1a00', '#e74c3c'] },
  { id: 'gen-1081', name: 'Frozen Drop', theme: 'frozen', trackType: 'gen-1081', description: 'Cradles and trampolines across winding ramps', favoredMarbleId: 'nova', favoredStat: 'Wild card', gradientColors: ['#0a3a6a', '#3498db'] },
  { id: 'gen-1094', name: 'Neon Descent', theme: 'cyber', trackType: 'gen-1094', description: 'Ball pits and trampolines through tight ramps', favoredMarbleId: 'aqua', favoredStat: 'Speed', gradientColors: ['#1a0a3a', '#8a2aca'] },
  { id: 'gen-1098', name: 'Storm Rapids', theme: 'meadow', trackType: 'gen-1098', description: 'Pendulum gauntlet on a fast course', favoredMarbleId: 'dash', favoredStat: 'Speed', gradientColors: ['#3a7a3a', '#5aaa5a'] },
  { id: 'gen-1106', name: 'Golden Chute', theme: 'volcano', trackType: 'gen-1106', description: 'Dense peg zones with cradles and trampolines', favoredMarbleId: 'spike', favoredStat: 'Power', gradientColors: ['#3a0a0a', '#aa2020'] },
];

export const THEME_COLORS: Record<CourseTheme, string> = {
  meadow: '#2ecc71',
  volcano: '#e74c3c',
  frozen: '#3498db',
  cyber: '#9b59b6',
};

// ── Generated tracks ──

// Validated: 3 runs per seed, avg <55s, 8/8 finish, <30 stuck events, no escapes
const VALIDATED_SEEDS: number[] = [
  1004, 1006, 1013, 1028, 1043, 1068, 1081, 1094,
  1098, 1106, 1109, 1130, 1139, 1143, 1165,
  1172, 1175, 1177, 1178, 1187, 1192, 1203, 1204, 1214,
  1219, 1240, 1241, 1250, 1262, 1280, 1299, 1300, 1322, 1325,
  1337, 1351, 1353, 1365, 1368, 1387, 1390, 1403, 1410,
  1411, 1425, 1426, 1428, 1432, 1433, 1435, 1466,
  1479, 1488, 1489, 1494, 1510, 1520, 1523, 1548, 1561, 1564,
  1579, 1580, 1581, 1592, 1598, 1618, 1620, 1638,
  1646, 1657, 1667, 1670, 1691, 1693, 1694, 1725,
  1750, 1840, 1895, 1940, 1970, 2005, 2010,
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

const MARBLE_IDS = ['dash', 'spike', 'rocky', 'lucky', 'frosty', 'nova', 'shadow', 'aqua'];

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

const THEMES: CourseTheme[] = ['meadow', 'volcano', 'frozen', 'cyber'];

const THEME_GRADIENTS: Record<CourseTheme, [string, string][]> = {
  meadow: [['#1a4a1a', '#3a8a3a'], ['#2d6b2d', '#4a9a4a'], ['#3a7a3a', '#5aaa5a']],
  volcano: [['#5a1a0a', '#c44000'], ['#6a1a00', '#e74c3c'], ['#3a0a0a', '#aa2020']],
  frozen: [['#0a2a4a', '#4a9aca'], ['#0a3a6a', '#3498db'], ['#1a3a5a', '#5a8aba']],
  cyber: [['#2a0a4a', '#9b59b6'], ['#1a0a3a', '#8a2aca'], ['#0a0a2a', '#5a2a8a']],
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

// All courses: 12 hand-crafted + 10 featured generated + remaining 90 generated
// Deduplicates by id — featured gen-* already in COURSES won't be added twice
const featuredIds = new Set(COURSES.filter(c => c.id.startsWith('gen-')).map(c => c.id));
const extraGenerated = getGeneratedCourses().filter(c => !featuredIds.has(c.id));
export const ALL_COURSES: CourseData[] = [...COURSES, ...extraGenerated];

/** Deterministic Track of the Day — picks one course per calendar date */
export function getTrackOfTheDay(): CourseData {
  const today = new Date();
  // Simple date seed: YYYYMMDD as number
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  // mulberry32-style hash for good distribution
  let h = seed | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return ALL_COURSES[h % ALL_COURSES.length];
}
