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

// Validated: 3 runs per seed, avg <55s, 8/8 finish, <30 stuck events, no escapes
const VALIDATED_SEEDS: number[] = [
  // Original 81 seeds
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
  // New 110 seeds (92.4% pass rate, 3 runs each, 8/8 finish, no doomsday)
  2100, 2101, 2102, 2103, 2104, 2105, 2106, 2107,
  2108, 2109, 2110, 2111, 2112, 2113, 2114, 2115,
  2116, 2117, 2118, 2119, 2120, 2121, 2122, 2123,
  2124, 2125, 2126, 2127, 2128, 2129, 2130, 2131,
  2133, 2134, 2135, 2136, 2138, 2141, 2142, 2144,
  2145, 2146, 2147, 2148, 2149, 2151, 2152, 2153,
  2154, 2155, 2156, 2157, 2159, 2160, 2161, 2162,
  2163, 2164, 2165, 2166, 2167, 2168, 2169, 2171,
  2172, 2173, 2174, 2175, 2176, 2177, 2178, 2179,
  2180, 2181, 2182, 2183, 2184, 2186, 2187, 2188,
  2189, 2190, 2191, 2192, 2193, 2194, 2195, 2196,
  2197, 2198, 2199, 2200, 2201, 2202, 2203, 2204,
  2205, 2206, 2207, 2208, 2209, 2210, 2211, 2212,
  2213, 2214, 2215, 2216, 2217, 2218,
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

const GP_SEEDS: number[] = [
  101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
  111, 112, 113, 114, 115, 116, 117, 118, 119, 120,
  121, 122, 123, 124, 125, 126, 127, 128, 129, 130,
  131, 132, 133, 134, 135, 136,
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
