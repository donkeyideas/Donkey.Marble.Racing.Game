// Track configuration system — rebuilt with proper Matter.js demo physics
// All physics values reference: brm.io/matter-js demos (wreckingBall, avalanche, newtonsCradle, terrain)
//
// Layout rules:
// 1. No empty gaps — every vertical section has obstacles or ramps
// 2. Ramps span full width (entry off-screen, exit with gap)
// 3. Springs at every ramp exit corner
// 4. Finish funnel full-width (leftX1=0, rightX1=engineWidth)
// 5. 50px-thick walls + ceiling guarantee containment

export interface RampData { points: { x: number; y: number }[]; engineCY: number }
export interface ObstacleInfo { x: number; y: number; r: number; type: 'peg' | 'bumper' }
export interface WindmillConfig { x: number; y: number; width: number; speed: number }
export interface FunnelData { leftX1: number; leftX2: number; rightX1: number; rightX2: number; y1: number; y2: number }
export interface SpringData { x: number; y: number; w: number; h: number }

export interface PendulumConfig {
  anchorX: number;
  anchorY: number;
  length: number;
  bobRadius: number;
  startVelocityX: number;
}

export interface BallPitConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  ballCount: number;
  ballRadius: number;
}

export interface CradleConfig {
  x: number;
  y: number;
  count: number;
  spacing: number;
  length: number;
  ballRadius: number;
}

export interface TrampolineConfig {
  x: number;
  y: number;
  width: number;
  strength: number;
}

export interface SpeedBurstConfig {
  x: number;
  y: number;
  width: number;
  direction: 'left' | 'right' | 'down';
  activationChance: number; // 0-1, typically 0.6
}



export interface TrackConfig {
  id: string;
  engineWidth: number;
  totalHeight: number;
  finishY: number;
  channelLeft: number;
  channelRight: number;
  channelDepth: number;
  channelCX: number;
  miniFunnelH: number;
  ramps: RampData[];
  obstacles: ObstacleInfo[];
  windmillConfigs: WindmillConfig[];
  funnels: FunnelData[];
  finishFunnel: FunnelData;
  springs: SpringData[];
  gravity: { x: number; y: number; scale: number };
  bgImage: 'grass' | 'lava' | 'ice' | 'cyber';
  pendulums?: PendulumConfig[];
  ballPits?: BallPitConfig[];
  cradles?: CradleConfig[];
  trampolines?: TrampolineConfig[];
  speedBursts?: SpeedBurstConfig[];
  wallColor?: string;  // Solid color for walls (no border/railway look)
}

// ── Helpers ──

export const ENGINE_WIDTH = 400;
export const ENTRY_MARGIN = -30;
export const EXIT_GAP = 100;

export function generateRampPoints(cy: number, isRight: boolean, drop: number) {
  const startX = isRight ? ENTRY_MARGIN : EXIT_GAP;
  const endX = isRight ? ENGINE_WIDTH - EXIT_GAP : ENGINE_WIDTH - ENTRY_MARGIN;
  const startY = isRight ? cy - drop : cy + drop;
  const endY = isRight ? cy + drop : cy - drop;

  // Quadratic bezier curve — smooth concave arc (like a slide)
  // Control point stays BETWEEN endpoints — no valley, always monotonic descent
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2 + Math.abs(endY - startY) * 0.2;
  const SEGMENTS = 8;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const u = 1 - t;
    // Quadratic bezier: B(t) = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
    const x = u * u * startX + 2 * u * t * midX + t * t * endX;
    const y = u * u * startY + 2 * u * t * midY + t * t * endY;
    points.push({ x, y });
  }
  return points;
}

export function generateSprings(rampCYs: number[], drop: number): SpringData[] {
  return rampCYs.map((cy, i) => {
    const isRight = i % 2 === 0;
    return {
      x: isRight ? ENGINE_WIDTH - EXIT_GAP / 2 : EXIT_GAP / 2,
      y: cy + drop + 25,
      w: 35,
      h: 12,
    };
  });
}

export function generatePegZone(pegY: number, rows: number, cols: number, hSpacing: number, vSpacing: number): ObstacleInfo[] {
  const pegs: ObstacleInfo[] = [];
  for (let row = 0; row < rows; row++) {
    const offset = row % 2 === 0 ? 0 : hSpacing / 2;
    for (let col = 0; col < cols; col++) {
      const px = 70 + offset + col * hSpacing; // start at x=70 (was 40) — keep pegs away from walls
      const py = pegY - (rows * vSpacing) / 2 + row * vSpacing;
      if (px > 50 && px < ENGINE_WIDTH - 50) { // wider wall margin (was 25)
        pegs.push({ x: px, y: py, r: 6, type: 'peg' });
      }
    }
  }
  return pegs;
}

export function generateFunnel(pegY: number, aboveOffset: number, belowOffset: number): FunnelData {
  return {
    y1: pegY - aboveOffset,
    y2: pegY - belowOffset,
    leftX1: 15,
    leftX2: 110,      // wider exit (was 155) — prevents arch jams with 8 marbles
    rightX1: ENGINE_WIDTH - 15,
    rightX2: ENGINE_WIDTH - 110,
  };
}

export function generateFinishZone(finishY: number) {
  // Funnel exit is wide, mini-funnel gently narrows to stacking channel
  const FUNNEL_EXIT_W = 80;   // Funnel exit width — balanced for flow
  const CHANNEL_W = 40;       // Stacking channel — fits marbles comfortably (diam=22)
  const MINI_FUNNEL_H = 80;   // Gentle transition from funnel to channel (~14° angle)
  const channelCX = ENGINE_WIDTH / 2;
  const channelLeft = channelCX - CHANNEL_W / 2;
  const channelRight = channelCX + CHANNEL_W / 2;
  const channelDepth = 270;   // Enough room for 8 marbles after mini-funnel
  const finishFunnel: FunnelData = {
    y1: finishY - 160,
    y2: finishY,
    leftX1: 0,
    leftX2: channelCX - FUNNEL_EXIT_W / 2,
    rightX1: ENGINE_WIDTH,
    rightX2: channelCX + FUNNEL_EXIT_W / 2,
  };
  return { channelCX, channelLeft, channelRight, channelDepth, finishFunnel, miniFunnelH: MINI_FUNNEL_H };
}

function randSign(): number {
  return Math.random() > 0.5 ? 1 : -1;
}

// Generate a few bumpers to fill a gap zone (sparse — NOT a wall)
export function generateGapBumpers(centerY: number, spread: number): ObstacleInfo[] {
  return [
    { x: 130, y: centerY - spread * 0.5, r: 14, type: 'bumper' },
    { x: 270, y: centerY + spread * 0.5, r: 14, type: 'bumper' },
  ];
}

// Generate light peg scatter to fill a gap zone (2 rows max)
function generateGapPegs(centerY: number, _rows: number): ObstacleInfo[] {
  return generatePegZone(centerY, Math.min(_rows, 2), 4, 70, 35);
}

// ── Course 1: Classic Zigzag ──

export function buildClassicZigzag(): TrackConfig {
  const RAMP_DROP = 65;
  const RAMP_CYS = [300, 520, 740, 1500, 1720, 1940];
  const PEG_ZONE_YS = [1150, 2350];
  const FINISH_Y = 2700;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;

  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));

  const obstacles: ObstacleInfo[] = [];

  // Peg zones — first zone lighter (3 rows) to improve flow
  obstacles.push(...generatePegZone(PEG_ZONE_YS[0], 3, 5, 65, 35));
  obstacles.push(...generatePegZone(PEG_ZONE_YS[1], 3, 5, 65, 35));

  // Bumpers between ramp pairs
  const mid12 = (520 + 740) / 2;
  obstacles.push(
    { x: 150, y: mid12 - 40, r: 14, type: 'bumper' },
    { x: 250, y: mid12, r: 14, type: 'bumper' },
    { x: 150, y: mid12 + 40, r: 14, type: 'bumper' },
  );
  const mid45 = (1720 + 1940) / 2;
  obstacles.push(
    { x: 250, y: mid45 - 40, r: 14, type: 'bumper' },
    { x: 150, y: mid45, r: 14, type: 'bumper' },
    { x: 250, y: mid45 + 40, r: 14, type: 'bumper' },
  );

  // Fill gaps with sparse bumpers — removed y=1350 (was double-bottleneck with peg zone)
  obstacles.push(...generateGapBumpers(950, 40));
  obstacles.push(...generateGapBumpers(2150, 40));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 340, speed: randSign() * (0.005 + Math.random() * 0.005) },
    { x: 200, y: 950, width: 200, speed: randSign() * (0.008 + Math.random() * 0.005) },
    { x: 200, y: (1500 + 1720) / 2, width: 320, speed: randSign() * (0.006 + Math.random() * 0.005) },
    { x: 200, y: 2150, width: 200, speed: randSign() * (0.007 + Math.random() * 0.005) },
  ];

  PEG_ZONE_YS.forEach(pegY => {
    windmillConfigs.push({
      x: 200, y: pegY - 80, width: 120,
      speed: randSign() * (0.03 + Math.random() * 0.02),
    });
  });

  // No funnels — they create arch jams with 8 marbles
  const funnels: FunnelData[] = [];
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  return {
    id: 'classic-zigzag',
    engineWidth: ENGINE_WIDTH,
    totalHeight: TOTAL_HEIGHT,
    finishY: FINISH_Y,
    ...finish,
    ramps,
    obstacles,
    windmillConfigs,
    funnels,
    finishFunnel: finish.finishFunnel,
    springs,
    gravity: { x: 0, y: 1.0, scale: 0.001 },
    bgImage: 'grass',
    speedBursts: [
      { x: 120, y: 605, width: 50, direction: 'left', activationChance: 0.6 },
      { x: 280, y: 2005, width: 50, direction: 'right', activationChance: 0.6 },
    ],
  };
}

// ── Course 2: Bumper Blitz ──

export function buildBumperBlitz(): TrackConfig {
  const RAMP_DROP = 50;
  const RAMP_CYS = [300, 520, 740, 1500, 1720, 1940];
  const PEG_ZONE_YS = [1150, 2350];
  const FINISH_Y = 2700;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;

  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));

  const obstacles: ObstacleInfo[] = [];

  // Lighter peg zones — 3 rows, 5 cols, wider spacing (was 5×7 @ 48px — too dense)
  PEG_ZONE_YS.forEach(pegY => {
    obstacles.push(...generatePegZone(pegY, 3, 5, 65, 35));
  });

  // Single bumper between ramp pairs — reduced from 2 per pair to avoid congestion
  const rampMids = [(300 + 520) / 2, (520 + 740) / 2, (1500 + 1720) / 2, (1720 + 1940) / 2];
  rampMids.forEach((midY, i) => {
    obstacles.push(
      { x: i % 2 === 0 ? 150 : 250, y: midY, r: 14, type: 'bumper' },
    );
  });

  // Sparse bumpers in gap zones — removed y=1350 gap (was causing ramp group 2 congestion)
  obstacles.push(...generateGapBumpers(950, 40));
  obstacles.push(...generateGapBumpers(2150, 40));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 300, speed: randSign() * (0.006 + Math.random() * 0.005) },
    { x: 200, y: 950, width: 280, speed: randSign() * (0.005 + Math.random() * 0.004) },
    { x: 200, y: (1500 + 1720) / 2, width: 300, speed: randSign() * (0.007 + Math.random() * 0.005) },
  ];

  PEG_ZONE_YS.forEach(pegY => {
    windmillConfigs.push({
      x: 200, y: pegY - 80, width: 130,
      speed: randSign() * (0.035 + Math.random() * 0.02),
    });
  });

  // No funnels — they create arch jams with 8 marbles (funnel exit ≈ 8 marble widths = guaranteed jam)
  const funnels: FunnelData[] = [];
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  return {
    id: 'bumper-blitz',
    engineWidth: ENGINE_WIDTH,
    totalHeight: TOTAL_HEIGHT,
    finishY: FINISH_Y,
    ...finish,
    ramps,
    obstacles,
    windmillConfigs,
    funnels,
    finishFunnel: finish.finishFunnel,
    springs,
    gravity: { x: 0, y: 1.0, scale: 0.001 },
    bgImage: 'grass',
    speedBursts: [
      { x: 300, y: 575, width: 45, direction: 'right', activationChance: 0.55 },
    ],
  };
}

// ── Course 3: Pendulum Alley — massive wrecking balls that HIT marbles ──

export function buildPendulumAlley(): TrackConfig {
  const RAMP_DROP = 60;
  const RAMP_CYS = [300, 520, 740, 1500, 1720, 1940];
  const PEG_ZONE_YS = [1150, 2350];
  const FINISH_Y = 2700;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;

  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));

  const obstacles: ObstacleInfo[] = [];
  PEG_ZONE_YS.forEach(pegY => {
    obstacles.push(...generatePegZone(pegY, 3, 5, 65, 35));
  });

  // Fill gaps with light pegs (pendulums are the main obstacle)
  obstacles.push(...generateGapPegs(900, 2));
  obstacles.push(...generateGapPegs(1350, 2));
  obstacles.push(...generateGapPegs(2150, 2));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 280, speed: randSign() * (0.005 + Math.random() * 0.004) },
  ];

  const funnels: FunnelData[] = []; // no funnels — arch jams with 8 marbles
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  // Wrecking ball pendulums — bobs hang in GAP ZONES between ramps, not on them
  // Ramp exits: ~365,585,805 (group 1) and ~1565,1785,2005 (group 2)
  // Bobs must NOT overlap ramp Y ranges. Place anchors so bob (anchor+length) is in gaps.
  // Fewer, smaller pendulums — reduced from 7 to 4 to prevent marble trapping
  const pendulums: PendulumConfig[] = [
    { anchorX: 200, anchorY: 720, length: 100, bobRadius: 14, startVelocityX: 5 },
    { anchorX: 200, anchorY: 1250, length: 100, bobRadius: 14, startVelocityX: -5 },
    { anchorX: 150, anchorY: 1920, length: 100, bobRadius: 14, startVelocityX: 5 },
    { anchorX: 250, anchorY: 2100, length: 100, bobRadius: 14, startVelocityX: -5 },
  ];

  return {
    id: 'pendulum-alley',
    engineWidth: ENGINE_WIDTH,
    totalHeight: TOTAL_HEIGHT,
    finishY: FINISH_Y,
    ...finish,
    ramps,
    obstacles,
    windmillConfigs,
    funnels,
    finishFunnel: finish.finishFunnel,
    springs,
    gravity: { x: 0, y: 1.0, scale: 0.001 },
    bgImage: 'lava',
    pendulums,
    speedBursts: [
      { x: 130, y: 810, width: 55, direction: 'down', activationChance: 0.6 },
      { x: 270, y: 1785, width: 50, direction: 'left', activationChance: 0.65 },
    ],
  };
}

// ── Course 4: Ball Pit Run — avalanche-style cascading balls ──

export function buildBallPitRun(): TrackConfig {
  const RAMP_DROP = 55;
  const RAMP_CYS = [300, 520, 740, 1500, 1720, 1940];
  const FINISH_Y = 2700;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;

  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));

  const obstacles: ObstacleInfo[] = [];
  // Light bumpers to guide flow between pit zones
  obstacles.push(
    { x: 150, y: 950, r: 12, type: 'bumper' },
    { x: 250, y: 950, r: 12, type: 'bumper' },
    { x: 200, y: 1350, r: 14, type: 'bumper' },
    { x: 150, y: 2050, r: 12, type: 'bumper' },
    { x: 250, y: 2050, r: 12, type: 'bumper' },
  );

  // Pegs in non-pit gaps
  obstacles.push(...generateGapPegs(1350, 3));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 300, speed: randSign() * (0.005 + Math.random() * 0.004) },
    { x: 200, y: (1500 + 1720) / 2, width: 280, speed: randSign() * (0.006 + Math.random() * 0.004) },
  ];

  const funnels: FunnelData[] = [
    generateFunnel(1000, 160, 50),
    generateFunnel(2200, 160, 50),
  ];

  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  // Avalanche ball zones — fewer, smaller balls to prevent marble trapping
  const ballPits: BallPitConfig[] = [
    { x: 30, y: 850, width: 340, height: 200, ballCount: 10, ballRadius: 7 },
    { x: 30, y: 1250, width: 340, height: 160, ballCount: 8, ballRadius: 7 },
    { x: 30, y: 2100, width: 340, height: 200, ballCount: 10, ballRadius: 7 },
  ];

  return {
    id: 'ball-pit-run',
    engineWidth: ENGINE_WIDTH,
    totalHeight: TOTAL_HEIGHT,
    finishY: FINISH_Y,
    ...finish,
    ramps,
    obstacles,
    windmillConfigs,
    funnels,
    finishFunnel: finish.finishFunnel,
    springs,
    gravity: { x: 0, y: 1.0, scale: 0.001 },
    bgImage: 'cyber',
    ballPits,
  };
}

// ── Course 5: Peg Storm ──

export function buildPegStorm(): TrackConfig {
  const RAMP_DROP = 55;
  const RAMP_CYS = [300, 520, 740, 1500, 1720, 1940];
  // Reduced from 4 peg zones to 2 — 4 was way too dense (154 pegs)
  const PEG_ZONE_YS = [1100, 2350];
  const FINISH_Y = 2700;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;

  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));

  const obstacles: ObstacleInfo[] = [];

  // Peg zones — 4 rows, 5 cols with varied sizes (was 5-6 rows × 7 cols — 154 pegs!)
  PEG_ZONE_YS.forEach((pegY) => {
    const rows = 4, cols = 5, hSp = 60, vSp = 32;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 === 0 ? 0 : hSp / 2;
      for (let col = 0; col < cols; col++) {
        const px = 50 + offset + col * hSp;
        const py = pegY - (rows * vSp) / 2 + row * vSp;
        if (px > 25 && px < ENGINE_WIDTH - 25) {
          const r = (row + col) % 5 === 0 ? 10 : (row + col) % 3 === 0 ? 8 : 5;
          obstacles.push({ x: px, y: py, r, type: 'peg' });
        }
      }
    }
  });

  // Bumpers between ramp pairs — 2 per pair (was 5 — too dense)
  const rampMids = [(300 + 520) / 2, (520 + 740) / 2, (1500 + 1720) / 2, (1720 + 1940) / 2];
  rampMids.forEach(midY => {
    obstacles.push(
      { x: 130, y: midY, r: 14, type: 'bumper' },
      { x: 270, y: midY, r: 14, type: 'bumper' },
    );
  });

  // Sparse gap fills
  obstacles.push(...generateGapBumpers(900, 30));
  obstacles.push(...generateGapBumpers(1420, 25));
  obstacles.push(...generateGapBumpers(2100, 30));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 300, speed: randSign() * (0.007 + Math.random() * 0.005) },
    { x: 200, y: (1500 + 1720) / 2, width: 280, speed: randSign() * (0.008 + Math.random() * 0.005) },
  ];
  PEG_ZONE_YS.forEach(pegY => {
    windmillConfigs.push({
      x: 200, y: pegY - 70, width: 140,
      speed: randSign() * (0.03 + Math.random() * 0.02),
    });
  });

  const funnels: FunnelData[] = []; // no funnels — arch jams with 8 marbles
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  return {
    id: 'peg-storm',
    engineWidth: ENGINE_WIDTH,
    totalHeight: TOTAL_HEIGHT,
    finishY: FINISH_Y,
    ...finish,
    ramps,
    obstacles,
    windmillConfigs,
    funnels,
    finishFunnel: finish.finishFunnel,
    springs,
    gravity: { x: 0, y: 1.0, scale: 0.001 },
    bgImage: 'ice',
    speedBursts: [
      { x: 100, y: 585, width: 48, direction: 'left', activationChance: 0.6 },
      { x: 310, y: 1995, width: 48, direction: 'right', activationChance: 0.55 },
    ],
  };
}

// ── Course 6: Cradle Drop — proper Newton's cradle physics ──

export function buildCradleDrop(): TrackConfig {
  const RAMP_DROP = 60;
  const RAMP_CYS = [300, 520, 740, 1500, 1720, 1940];
  const PEG_ZONE_YS = [1150, 2350];
  const FINISH_Y = 2700;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;

  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));

  const obstacles: ObstacleInfo[] = [];
  PEG_ZONE_YS.forEach(pegY => {
    obstacles.push(...generatePegZone(pegY, 3, 5, 65, 35));
  });

  // Fill gaps with light pegs around cradle zones
  obstacles.push(...generateGapPegs(820, 2));
  obstacles.push(...generateGapPegs(1300, 2));
  obstacles.push(...generateGapPegs(2050, 2));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 300, speed: randSign() * (0.005 + Math.random() * 0.004) },
    { x: 200, y: (1500 + 1720) / 2, width: 280, speed: randSign() * (0.006 + Math.random() * 0.004) },
  ];

  const funnels: FunnelData[] = []; // no funnels — arch jams with 8 marbles
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  // Newton's cradles — 3 bobs each, wider spacing so marbles pass between
  const cradles: CradleConfig[] = [
    { x: 200, y: 860, count: 3, spacing: 30, length: 80, ballRadius: 9 },
    { x: 200, y: 1350, count: 3, spacing: 30, length: 75, ballRadius: 9 },
    { x: 200, y: 2100, count: 3, spacing: 30, length: 80, ballRadius: 9 },
  ];

  return {
    id: 'cradle-drop',
    engineWidth: ENGINE_WIDTH,
    totalHeight: TOTAL_HEIGHT,
    finishY: FINISH_Y,
    ...finish,
    ramps,
    obstacles,
    windmillConfigs,
    funnels,
    finishFunnel: finish.finishFunnel,
    springs,
    gravity: { x: 0, y: 1.0, scale: 0.001 },
    bgImage: 'grass',
    cradles,
  };
}

// ── Course 7: Trampoline Park ──

export function buildTrampolinePark(): TrackConfig {
  const RAMP_DROP = 55;
  const RAMP_CYS = [300, 520, 740, 1500, 1720, 1940];
  const PEG_ZONE_YS = [1150, 2350];
  const FINISH_Y = 2700;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;

  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));

  // Trampoline park: light pegs only — trampolines are the main obstacle, not pegs
  const obstacles: ObstacleInfo[] = [];
  PEG_ZONE_YS.forEach(pegY => {
    obstacles.push(...generatePegZone(pegY, 3, 4, 70, 35));
  });
  // No gapPegs — trampolines fill the gaps instead

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (1500 + 1720) / 2, width: 280, speed: randSign() * (0.005 + Math.random() * 0.004) },
  ];

  // No funnels — they create bottlenecks with 8 marbles. Pegs alone provide randomization.
  const funnels: FunnelData[] = [];
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  // Trampolines in gap zones only — NOT near ramp exits (caused marbles to bounce backwards)
  // Reduced strength (was 7-10, now 5-7) so marbles redirect but still flow downward
  const trampolines: TrampolineConfig[] = [
    // Gap zone 1 (y=830-1150) — reduced count and strength
    { x: 120, y: 900, width: 70, strength: 3 },
    { x: 280, y: 1000, width: 70, strength: 3 },
    // Gap zone 2 (y=1220-1500)
    { x: 200, y: 1350, width: 70, strength: 3 },
    // Gap zone 3 (y=2005-2350)
    { x: 120, y: 2100, width: 70, strength: 3 },
    { x: 280, y: 2220, width: 70, strength: 3 },
  ];

  return {
    id: 'trampoline-park',
    engineWidth: ENGINE_WIDTH,
    totalHeight: TOTAL_HEIGHT,
    finishY: FINISH_Y,
    ...finish,
    ramps,
    obstacles,
    windmillConfigs,
    funnels,
    finishFunnel: finish.finishFunnel,
    springs,
    gravity: { x: 0, y: 1.0, scale: 0.001 },
    bgImage: 'cyber',
    trampolines,
  };
}

// ── Course 8: Terrain Valley — curved undulating ramps, no flat spots ──

export function buildTerrainValley(): TrackConfig {
  const RAMP_DROP = 60;
  // More ramps to fill gaps — 9 ramps instead of 6
  const RAMP_CYS = [300, 480, 660, 850, 1050, 1500, 1680, 1860, 2050];
  // Peg zone at y=1300 (was 1250 — funnel at 1250 blocked ramp 5 exit at y=1110)
  const PEG_ZONE_YS = [1300, 2350];
  const FINISH_Y = 2700;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;

  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));

  const obstacles: ObstacleInfo[] = [];
  // First peg zone (y=1300): moderate density
  obstacles.push(...generatePegZone(1300, 3, 5, 65, 35));
  // Second peg zone (y=2350): lighter — was causing bottleneck with funnels
  obstacles.push(...generatePegZone(2350, 3, 4, 70, 35));

  // Bumpers between ramps
  const mid01 = (300 + 480) / 2;
  const mid34 = (850 + 1050) / 2;
  const mid67 = (1680 + 1860) / 2;
  obstacles.push(
    { x: 150, y: mid01, r: 14, type: 'bumper' },
    { x: 250, y: mid01 + 20, r: 14, type: 'bumper' },
    { x: 200, y: mid34, r: 16, type: 'bumper' },
    { x: 120, y: mid34 + 30, r: 12, type: 'bumper' },
    { x: 280, y: mid34 + 30, r: 12, type: 'bumper' },
    { x: 150, y: mid67, r: 14, type: 'bumper' },
    { x: 250, y: mid67 + 20, r: 14, type: 'bumper' },
  );

  // Sparse gap fills — NO pegs near ramp 5 exit (y≈1110 was causing 152 stuck events)
  obstacles.push(...generateGapBumpers(2200, 40));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: mid01, width: 300, speed: randSign() * (0.005 + Math.random() * 0.005) },
    { x: 200, y: mid34, width: 280, speed: randSign() * (0.006 + Math.random() * 0.005) },
    { x: 200, y: mid67, width: 260, speed: randSign() * (0.006 + Math.random() * 0.005) },
  ];

  PEG_ZONE_YS.forEach(pegY => {
    windmillConfigs.push({
      x: 200, y: pegY - 80, width: 120,
      speed: randSign() * (0.03 + Math.random() * 0.02),
    });
  });

  // No funnels — they create bottlenecks with 8 marbles (same fix as trampoline-park)
  const funnels: FunnelData[] = [];
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  return {
    id: 'terrain-valley',
    engineWidth: ENGINE_WIDTH,
    totalHeight: TOTAL_HEIGHT,
    finishY: FINISH_Y,
    ...finish,
    ramps,
    obstacles,
    windmillConfigs,
    funnels,
    finishFunnel: finish.finishFunnel,
    springs,
    gravity: { x: 0, y: 1.0, scale: 0.001 },
    bgImage: 'grass',
  };
}

// ── Course 9: The Gauntlet — every element combined ──

export function buildGauntlet(): TrackConfig {
  const RAMP_DROP = 60;
  const RAMP_CYS = [300, 520, 740, 1500, 1720, 1940];
  const PEG_ZONE_YS = [1100, 2300];
  const FINISH_Y = 2750;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;

  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));

  const obstacles: ObstacleInfo[] = [];
  PEG_ZONE_YS.forEach(pegY => {
    obstacles.push(...generatePegZone(pegY, 4, 6, 55, 32));
  });

  // Bumpers
  obstacles.push(
    { x: 150, y: (520 + 740) / 2, r: 14, type: 'bumper' },
    { x: 250, y: (520 + 740) / 2, r: 14, type: 'bumper' },
    { x: 200, y: (1720 + 1940) / 2, r: 16, type: 'bumper' },
  );

  // Fill gaps with mixed elements
  // Sparse gap fills — no bumpers at y=900 (pendulum zone)
  obstacles.push(...generateGapPegs(1300, 2));
  obstacles.push(...generateGapBumpers(2150, 25));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 300, speed: randSign() * (0.006 + Math.random() * 0.005) },
    { x: 200, y: (1500 + 1720) / 2, width: 280, speed: randSign() * (0.007 + Math.random() * 0.005) },
  ];
  PEG_ZONE_YS.forEach(pegY => {
    windmillConfigs.push({
      x: 200, y: pegY - 70, width: 130,
      speed: randSign() * (0.035 + Math.random() * 0.02),
    });
  });

  const funnels: FunnelData[] = []; // no funnels — arch jams with 8 marbles
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  // Wrecking ball pendulums
  // Fewer, smaller pendulums
  const pendulums: PendulumConfig[] = [
    { anchorX: 200, anchorY: 860, length: 110, bobRadius: 14, startVelocityX: 5 },
    { anchorX: 200, anchorY: 2050, length: 120, bobRadius: 14, startVelocityX: -5 },
  ];

  // Trampolines — placed in gap zones only (NOT on ramps!)
  // Trampolines — only in zones without pendulums/bumpers to avoid traps
  const trampolines: TrampolineConfig[] = [
    { x: 200, y: 2200, width: 80, strength: 4 },
  ];

  // Newton's cradles — 3 bobs, wider spacing
  const cradles: CradleConfig[] = [
    { x: 200, y: 2450, count: 3, spacing: 30, length: 65, ballRadius: 9 },
  ];

  // Ball pit zone — fewer balls to reduce trapping
  const ballPits: BallPitConfig[] = [
    { x: 50, y: 1220, width: 300, height: 150, ballCount: 8, ballRadius: 7 },
  ];

  return {
    id: 'gauntlet',
    engineWidth: ENGINE_WIDTH,
    totalHeight: TOTAL_HEIGHT,
    finishY: FINISH_Y,
    ...finish,
    ramps,
    obstacles,
    windmillConfigs,
    funnels,
    finishFunnel: finish.finishFunnel,
    springs,
    gravity: { x: 0, y: 1.0, scale: 0.001 },
    bgImage: 'lava',
    pendulums,
    trampolines,
    cradles,
    ballPits,
    speedBursts: [
      { x: 140, y: 810, width: 55, direction: 'down', activationChance: 0.65 },
      { x: 260, y: 2005, width: 50, direction: 'right', activationChance: 0.6 },
    ],
  };
}

// ── Course 10: Grand Prix — continuous S-channel ──
// Two parallel sine-wave walls form a winding tube from top to bottom.
// Funnel entry captures all marble spawn positions; no marble escapes the channel.

const GP_THEMES: Record<string, { bg: 'grass' | 'lava' | 'ice' | 'cyber'; wall: string }> = {
  meadow: { bg: 'grass', wall: '#2ecc71' },
  volcano: { bg: 'lava', wall: '#e74c3c' },
  frozen: { bg: 'ice', wall: '#00b4d8' },
  cyber:  { bg: 'cyber', wall: '#9333ea' },
};

// Seeded PRNG for Grand Prix variation
function gpRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 13), 0x45d9f3b);
    s = (s ^ (s >>> 16)) >>> 0;
    return s / 0x100000000;
  };
}

// Obstacle combo types for chambers — each combo has a primary moving obstacle + small statics
type ChamberCombo = 'windmill_pegs' | 'pendulum_bumpers' | 'speedburst_tramp' | 'windmill_bumpers' | 'pendulum_pegs' | 'tramp_speedburst';
const CHAMBER_COMBOS: ChamberCombo[] = ['windmill_pegs', 'pendulum_bumpers', 'speedburst_tramp', 'windmill_bumpers', 'pendulum_pegs', 'tramp_speedburst'];

export function buildGrandPrix(theme: string = 'cyber', seed: number = 0): TrackConfig {
  const rng = gpRng(seed * 7919 + 42);

  const FINISH_Y = 5400;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;
  const finish = generateFinishZone(FINISH_Y);

  // Seed-varied parameters
  const AMP = 55 + Math.floor(rng() * 20);            // 55-75
  const HALF_WAVES = 42 + Math.floor(rng() * 10);     // 42-51
  const CH_W = 170 + Math.floor(rng() * 20);          // 170-190
  const HALF = CH_W / 2;
  const CHAMBER_HALF = 160 + Math.floor(rng() * 15);  // 160-175
  const WAVE_START = 250;
  const WAVE_END = 5200;
  const N = 120;

  // 7 chamber Y positions — slightly jittered by seed
  const baseYs = [800, 1400, 2000, 2600, 3200, 3800, 4400];
  const chambers = baseYs.map(by => ({
    y: by + Math.floor(rng() * 60 - 30),  // ±30 jitter
    radius: 200,
  }));

  // Shuffle obstacle combos for this seed
  const combos = [...CHAMBER_COMBOS];
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }
  // 7 chambers, 6 combos — last chamber reuses a combo
  const chamberCombos = [...combos, combos[Math.floor(rng() * combos.length)]];

  const leftPts: { x: number; y: number }[] = [];
  const rightPts: { x: number; y: number }[] = [];

  // Entry funnel: y=20 → WAVE_START
  const FUNNEL_N = 10;
  const FUNNEL_TOP_HALF = 170;
  for (let i = 0; i <= FUNNEL_N; i++) {
    const t = i / FUNNEL_N;
    const y = 20 + t * (WAVE_START - 20);
    const halfW = FUNNEL_TOP_HALF * (1 - t) + HALF * t;
    leftPts.push({ x: 200 - halfW, y });
    rightPts.push({ x: 200 + halfW, y });
  }

  // S-channel with chamber widenings
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const y = WAVE_START + t * (WAVE_END - WAVE_START);

    let chamberBlend = 0;
    for (const ch of chambers) {
      const dist = Math.abs(y - ch.y);
      if (dist < ch.radius) {
        const b = 1 - dist / ch.radius;
        chamberBlend = Math.max(chamberBlend, b * b * (3 - 2 * b));
      }
    }

    const localHalf = HALF + chamberBlend * (CHAMBER_HALF - HALF);
    const localAmp = AMP * (1 - chamberBlend * 0.85);
    const cx = 200 + localAmp * Math.sin(HALF_WAVES * Math.PI * t);

    leftPts.push({ x: cx - localHalf, y });
    rightPts.push({ x: cx + localHalf, y });
  }

  // Build obstacles based on chamber combos
  const obstacles: ObstacleInfo[] = [];
  const windmillConfigs: WindmillConfig[] = [];
  const pendulums: PendulumConfig[] = [];
  const trampolines: TrampolineConfig[] = [];
  const speedBursts: SpeedBurstConfig[] = [];

  chambers.forEach((ch, ci) => {
    const combo = chamberCombos[ci];
    const y = ch.y;
    const dir = ci % 2 === 0 ? 1 : -1; // alternate directions

    switch (combo) {
      case 'windmill_pegs':
        windmillConfigs.push({ x: 200, y, width: 120, speed: 0.008 * dir });
        obstacles.push(
          { x: 140, y: y + 30, r: 5, type: 'peg' },
          { x: 200, y: y + 10, r: 5, type: 'peg' },
          { x: 260, y: y + 30, r: 5, type: 'peg' },
          { x: 170, y: y + 60, r: 5, type: 'peg' },
          { x: 230, y: y + 60, r: 5, type: 'peg' },
        );
        break;
      case 'pendulum_bumpers':
        pendulums.push({ anchorX: 200, anchorY: y, length: 100, bobRadius: 15, startVelocityX: 6 * dir });
        obstacles.push(
          { x: 130, y: y - 30, r: 5, type: 'bumper' },
          { x: 270, y: y - 30, r: 5, type: 'bumper' },
          { x: 150, y: y + 40, r: 5, type: 'bumper' },
          { x: 250, y: y + 40, r: 5, type: 'bumper' },
        );
        break;
      case 'speedburst_tramp':
        speedBursts.push(
          { x: 200, y: y - 20, width: 60, direction: 'down' as const, activationChance: 0.7 },
          { x: 140, y: y + 10, width: 50, direction: 'right' as const, activationChance: 0.6 },
          { x: 260, y: y + 10, width: 50, direction: 'left' as const, activationChance: 0.6 },
        );
        trampolines.push(
          { x: 140, y: y + 50, width: 40, strength: 5 },
          { x: 260, y: y + 50, width: 40, strength: 5 },
        );
        break;
      case 'windmill_bumpers':
        windmillConfigs.push({ x: 200, y, width: 120, speed: -0.008 * dir });
        obstacles.push(
          { x: 140, y: y - 20, r: 5, type: 'bumper' },
          { x: 260, y: y - 20, r: 5, type: 'bumper' },
          { x: 200, y: y + 40, r: 5, type: 'bumper' },
        );
        break;
      case 'pendulum_pegs':
        pendulums.push({ anchorX: 200, anchorY: y, length: 100, bobRadius: 15, startVelocityX: -6 * dir });
        obstacles.push(
          { x: 150, y: y + 20, r: 5, type: 'peg' },
          { x: 200, y: y, r: 5, type: 'peg' },
          { x: 250, y: y + 20, r: 5, type: 'peg' },
          { x: 175, y: y + 50, r: 5, type: 'peg' },
          { x: 225, y: y + 50, r: 5, type: 'peg' },
        );
        break;
      case 'tramp_speedburst':
        trampolines.push(
          { x: 150, y: y + 40, width: 40, strength: 5 },
          { x: 250, y: y + 40, width: 40, strength: 5 },
        );
        speedBursts.push(
          { x: 200, y: y - 20, width: 60, direction: 'down' as const, activationChance: 0.7 },
        );
        break;
    }
  });

  const gpTheme = GP_THEMES[theme] || GP_THEMES.cyber;

  return {
    id: `grand-prix-${seed || theme}`,
    engineWidth: ENGINE_WIDTH,
    totalHeight: TOTAL_HEIGHT,
    finishY: FINISH_Y,
    ...finish,
    ramps: [
      { points: leftPts, engineCY: (WAVE_START + WAVE_END) / 2 },
      { points: rightPts, engineCY: (WAVE_START + WAVE_END) / 2 },
    ],
    obstacles,
    windmillConfigs,
    funnels: [],
    finishFunnel: finish.finishFunnel,
    springs: [],
    gravity: { x: 0, y: 1.0, scale: 0.001 },
    bgImage: gpTheme.bg,
    pendulums,
    trampolines,
    speedBursts,
    wallColor: gpTheme.wall,
  };
}

// ── Track lookup ──

export function buildTrack(courseId: string): TrackConfig {
  if (courseId.startsWith('gen-')) {
    const seed = parseInt(courseId.slice(4), 10);
    // Lazy require to break circular dependency (trackGenerator imports from tracks)
    const { generateTrack } = require('./trackGenerator');
    return generateTrack(seed);
  }
  // Grand Prix: gp-{seed}-{theme} for seeded variants, or grand-prix-{theme} for originals
  if (courseId.startsWith('gp-')) {
    const parts = courseId.split('-');
    const seed = parseInt(parts[1], 10);
    const theme = parts[2] || 'cyber';
    return buildGrandPrix(theme, seed);
  }
  if (courseId.startsWith('grand-prix')) {
    const parts = courseId.split('-');
    const theme = parts.length > 2 ? parts[2] : 'cyber';
    return buildGrandPrix(theme);
  }
  switch (courseId) {
    case 'bumper-blitz': return buildBumperBlitz();
    case 'pendulum-alley': return buildPendulumAlley();
    case 'ball-pit-run': return buildBallPitRun();
    case 'peg-storm': return buildPegStorm();
    case 'cradle-drop': return buildCradleDrop();
    case 'trampoline-park': return buildTrampolinePark();
    case 'terrain-valley': return buildTerrainValley();
    case 'gauntlet': return buildGauntlet();
    case 'classic-zigzag':
    default: return buildClassicZigzag();
  }
}
