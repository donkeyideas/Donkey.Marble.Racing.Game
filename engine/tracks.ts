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

/**
 * Swinging-door trap. A rectangular blade hinged at one end that swings
 * back and forth in a sine wave. Marbles colliding with the closed door
 * are blocked; when the door swings open they can pass. Placed in peg
 * fields and other obstacle clusters where extra randomness is welcome.
 */
export interface SwingingDoorConfig {
  /** Hinge point — the end of the door that stays fixed. */
  hingeX: number;
  hingeY: number;
  /** Length of the door, in engine units. */
  length: number;
  /** Peak swing angle in radians from the rest position. */
  arc: number;
  /** Full back-and-forth cycle duration in ms. */
  periodMs: number;
  /** Rest angle of the door (0 = horizontal pointing right). */
  baseAngle: number;
  /** Phase offset in radians so multiple doors can swing independently. */
  phase?: number;
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
  bgImage: string;
  pendulums?: PendulumConfig[];
  ballPits?: BallPitConfig[];
  cradles?: CradleConfig[];
  trampolines?: TrampolineConfig[];
  speedBursts?: SpeedBurstConfig[];
  swingingDoors?: SwingingDoorConfig[];
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
  // Track shortened: removed one ramp pair (was 6, now 4) and one peg zone.
  // The 6-ramp + 2-peg-zone layout averaged ~48s per race with the new
  // lossy-bumper physics — too close to the 55s doomsday trigger. Cutting
  // to 4 ramps + 1 peg zone drops total height to 2480 and avg race to
  // ~30–35s while preserving the zigzag-with-bumpers identity.
  const RAMP_DROP = 65;
  // LENGTH EXTENSION — was 4 ramps + FINISH_Y 2200 = ~12s sprint. Now 11
  // ramps + FINISH_Y 4700 to land in the 25-30s window. Three new ramp
  // groups + two new peg zones + extra obstacles fill the new descent
  // while preserving the "zigzag with bumpers" identity.
  const RAMP_CYS = [
    300, 520, 740, 1500,
    2200, 2420, 2640,     // group 3 (new)
    3400, 3620, 3840,     // group 4 (new)
    4500,                 // final descent ramp (new)
  ];
  const PEG_ZONE_YS = [1150, 1950, 3150, 4250];
  const FINISH_Y = 4700;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;

  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));

  const obstacles: ObstacleInfo[] = [];

  // All 4 peg zones — original + 3 new across the extended descent.
  PEG_ZONE_YS.forEach(pegY => {
    obstacles.push(...generatePegZone(pegY, 3, 5, 65, 35));
  });

  // Bumper clusters — original middle plus new clusters in each lower group
  const mid12 = (520 + 740) / 2;
  obstacles.push(
    { x: 150, y: mid12 - 40, r: 14, type: 'bumper' },
    { x: 250, y: mid12, r: 14, type: 'bumper' },
    { x: 150, y: mid12 + 40, r: 14, type: 'bumper' },
  );
  const mid34 = (2420 + 2640) / 2;
  obstacles.push(
    { x: 250, y: mid34 - 40, r: 14, type: 'bumper' },
    { x: 150, y: mid34, r: 14, type: 'bumper' },
    { x: 250, y: mid34 + 40, r: 14, type: 'bumper' },
  );
  const mid56 = (3620 + 3840) / 2;
  obstacles.push(
    { x: 150, y: mid56 - 40, r: 14, type: 'bumper' },
    { x: 250, y: mid56, r: 14, type: 'bumper' },
    { x: 150, y: mid56 + 40, r: 14, type: 'bumper' },
  );

  // Sparse gap bumpers — extended for new sections
  obstacles.push(...generateGapBumpers(950, 40));
  obstacles.push(...generateGapBumpers(2000, 40));
  obstacles.push(...generateGapBumpers(3200, 40));
  obstacles.push(...generateGapBumpers(4300, 35));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 340, speed: randSign() * (0.005 + Math.random() * 0.005) },
    { x: 200, y: 950, width: 200, speed: randSign() * (0.008 + Math.random() * 0.005) },
    { x: 200, y: mid34, width: 280, speed: randSign() * (0.006 + Math.random() * 0.005) },
    { x: 200, y: mid56, width: 280, speed: randSign() * (0.007 + Math.random() * 0.005) },
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
    // Gravity 1.25 (was 1.0). High variance in marble paths through the
    // bumper field + peg zone meant the slowest marble per race could
    // still take 55s+ even with shortened layout. Strong gravity pulls
    // lingering marbles down within the safety window.
    gravity: { x: 0, y: 1.25, scale: 0.001 },
    // Visual test: layered Hills parallax PNGs instead of the procedural grass scenery.
    // Only this track points at 'grass_hills'; other grass courses stay procedural.
    bgImage: 'grass_hills',
    speedBursts: [
      { x: 120, y: 605, width: 50, direction: 'left', activationChance: 0.6 },
      { x: 280, y: 2500, width: 50, direction: 'right', activationChance: 0.6 },
      { x: 120, y: 3700, width: 50, direction: 'left', activationChance: 0.6 },
    ],
  };
}

// ── Course 2: Bumper Blitz ──

export function buildBumperBlitz(): TrackConfig {
  // LENGTH EXTENSION — doubled vertical content so races land in the
  // 25-30s window instead of the prior ~12s sprint. Adds a third + fourth
  // ramp group, a third peg zone, third gap-bumper band, and matching
  // windmills for the new lower section. FINISH_Y pushed from 2700 → 4700.
  const RAMP_DROP = 50;
  const RAMP_CYS = [
    300, 520, 740,        // group 1 (top)
    1500, 1720, 1940,     // group 2
    2700, 2920, 3140,     // group 3 (new)
    3900, 4120, 4340,     // group 4 (new)
  ];
  const PEG_ZONE_YS = [1150, 2350, 3550];
  const FINISH_Y = 4700;
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

  // Single bumper between ramp pairs — extended to cover all 4 ramp groups
  const rampMids = [
    (300 + 520) / 2, (520 + 740) / 2,
    (1500 + 1720) / 2, (1720 + 1940) / 2,
    (2700 + 2920) / 2, (2920 + 3140) / 2,
    (3900 + 4120) / 2, (4120 + 4340) / 2,
  ];
  rampMids.forEach((midY, i) => {
    obstacles.push(
      { x: i % 2 === 0 ? 150 : 250, y: midY, r: 14, type: 'bumper' },
    );
  });

  // Sparse bumpers in gap zones — extended for new sections
  obstacles.push(...generateGapBumpers(950, 40));
  obstacles.push(...generateGapBumpers(2150, 40));
  obstacles.push(...generateGapBumpers(3350, 40));
  obstacles.push(...generateGapBumpers(4550, 35));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 300, speed: randSign() * (0.006 + Math.random() * 0.005) },
    { x: 200, y: 950, width: 280, speed: randSign() * (0.005 + Math.random() * 0.004) },
    { x: 200, y: (1500 + 1720) / 2, width: 300, speed: randSign() * (0.007 + Math.random() * 0.005) },
    { x: 200, y: (2700 + 2920) / 2, width: 300, speed: randSign() * (0.006 + Math.random() * 0.005) },
    { x: 200, y: (3900 + 4120) / 2, width: 280, speed: randSign() * (0.007 + Math.random() * 0.005) },
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
      { x: 100, y: 2975, width: 45, direction: 'left', activationChance: 0.55 },
      { x: 300, y: 4175, width: 45, direction: 'right', activationChance: 0.55 },
    ],
  };
}

// ── Course 3: Pendulum Alley — massive wrecking balls that HIT marbles ──

export function buildPendulumAlley(): TrackConfig {
  const RAMP_DROP = 60;
  const RAMP_CYS = [
    300, 520, 740,
    1500, 1720, 1940,
    2700, 2920, 3140,
    3900, 4120, 4340,
  ];
  const PEG_ZONE_YS = [1150, 2350, 3550];
  const FINISH_Y = 4700;
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
  obstacles.push(...generateGapPegs(3350, 2));
  obstacles.push(...generateGapPegs(4550, 2));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 280, speed: randSign() * (0.005 + Math.random() * 0.004) },
    { x: 200, y: (2700 + 2920) / 2, width: 280, speed: randSign() * (0.005 + Math.random() * 0.004) },
    { x: 200, y: (3900 + 4120) / 2, width: 280, speed: randSign() * (0.006 + Math.random() * 0.004) },
  ];

  const funnels: FunnelData[] = []; // no funnels — arch jams with 8 marbles
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  // Wrecking ball pendulums — doubled for the extended track length.
  // Bobs sit in GAP ZONES between ramps; alternating anchor X positions
  // and start velocity directions keep the swing chaos varied.
  const pendulums: PendulumConfig[] = [
    { anchorX: 200, anchorY: 720, length: 100, bobRadius: 14, startVelocityX: 5 },
    { anchorX: 200, anchorY: 1250, length: 100, bobRadius: 14, startVelocityX: -5 },
    { anchorX: 150, anchorY: 1920, length: 100, bobRadius: 14, startVelocityX: 5 },
    { anchorX: 250, anchorY: 2100, length: 100, bobRadius: 14, startVelocityX: -5 },
    { anchorX: 200, anchorY: 2900, length: 100, bobRadius: 14, startVelocityX: 5 },
    { anchorX: 150, anchorY: 3450, length: 100, bobRadius: 14, startVelocityX: -5 },
    { anchorX: 250, anchorY: 3700, length: 100, bobRadius: 14, startVelocityX: 5 },
    { anchorX: 200, anchorY: 4100, length: 110, bobRadius: 14, startVelocityX: -5 },
    { anchorX: 200, anchorY: 4500, length: 100, bobRadius: 14, startVelocityX: 5 },
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
      { x: 130, y: 2985, width: 55, direction: 'down', activationChance: 0.6 },
      { x: 270, y: 4185, width: 50, direction: 'left', activationChance: 0.65 },
    ],
  };
}

// ── Course 4: Ball Pit Run — avalanche-style cascading balls ──

export function buildBallPitRun(): TrackConfig {
  const RAMP_DROP = 55;
  const RAMP_CYS = [
    300, 520, 740,
    1500, 1720, 1940,
    2700, 2920, 3140,
    3900, 4120, 4340,
  ];
  const FINISH_Y = 4700;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;

  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));

  const obstacles: ObstacleInfo[] = [];
  // Light bumpers to guide flow between pit zones — extended for new sections
  obstacles.push(
    { x: 150, y: 950, r: 12, type: 'bumper' },
    { x: 250, y: 950, r: 12, type: 'bumper' },
    { x: 200, y: 1350, r: 14, type: 'bumper' },
    { x: 150, y: 2050, r: 12, type: 'bumper' },
    { x: 250, y: 2050, r: 12, type: 'bumper' },
    { x: 150, y: 3250, r: 12, type: 'bumper' },
    { x: 250, y: 3250, r: 12, type: 'bumper' },
    { x: 200, y: 3650, r: 14, type: 'bumper' },
    { x: 150, y: 4450, r: 12, type: 'bumper' },
    { x: 250, y: 4450, r: 12, type: 'bumper' },
  );

  // Pegs in non-pit gaps
  obstacles.push(...generateGapPegs(1350, 3));
  obstacles.push(...generateGapPegs(3650, 3));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 300, speed: randSign() * (0.005 + Math.random() * 0.004) },
    { x: 200, y: (1500 + 1720) / 2, width: 280, speed: randSign() * (0.006 + Math.random() * 0.004) },
    { x: 200, y: (2700 + 2920) / 2, width: 300, speed: randSign() * (0.005 + Math.random() * 0.004) },
    { x: 200, y: (3900 + 4120) / 2, width: 280, speed: randSign() * (0.006 + Math.random() * 0.004) },
  ];

  const funnels: FunnelData[] = [
    generateFunnel(1000, 160, 50),
    generateFunnel(2200, 160, 50),
    generateFunnel(3400, 160, 50),
    generateFunnel(4500, 130, 40),
  ];

  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  // Avalanche ball zones — doubled count to fill the new lower sections.
  const ballPits: BallPitConfig[] = [
    { x: 30, y: 850, width: 340, height: 200, ballCount: 10, ballRadius: 7 },
    { x: 30, y: 1250, width: 340, height: 160, ballCount: 8, ballRadius: 7 },
    { x: 30, y: 2100, width: 340, height: 200, ballCount: 10, ballRadius: 7 },
    { x: 30, y: 3050, width: 340, height: 200, ballCount: 10, ballRadius: 7 },
    { x: 30, y: 3450, width: 340, height: 160, ballCount: 8, ballRadius: 7 },
    { x: 30, y: 4300, width: 340, height: 180, ballCount: 9, ballRadius: 7 },
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
    // Gravity 1.1 — ball pits add drag; this offsets it.
    gravity: { x: 0, y: 1.1, scale: 0.001 },
    bgImage: 'cyber',
    ballPits,
  };
}

// ── Course 5: Peg Storm ──

export function buildPegStorm(): TrackConfig {
  const RAMP_DROP = 55;
  const RAMP_CYS = [
    300, 520, 740,
    1500, 1720, 1940,
    2700, 2920, 3140,
    3900, 4120, 4340,
  ];
  // 3 peg zones distributed across the extended length
  const PEG_ZONE_YS = [1100, 2350, 3550];
  const FINISH_Y = 4700;
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

  // Bumpers between ramp pairs — extended for all 4 ramp groups
  const rampMids = [
    (300 + 520) / 2, (520 + 740) / 2,
    (1500 + 1720) / 2, (1720 + 1940) / 2,
    (2700 + 2920) / 2, (2920 + 3140) / 2,
    (3900 + 4120) / 2, (4120 + 4340) / 2,
  ];
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
  obstacles.push(...generateGapBumpers(3300, 30));
  obstacles.push(...generateGapBumpers(4500, 25));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 300, speed: randSign() * (0.007 + Math.random() * 0.005) },
    { x: 200, y: (1500 + 1720) / 2, width: 280, speed: randSign() * (0.008 + Math.random() * 0.005) },
    { x: 200, y: (2700 + 2920) / 2, width: 300, speed: randSign() * (0.007 + Math.random() * 0.005) },
    { x: 200, y: (3900 + 4120) / 2, width: 280, speed: randSign() * (0.008 + Math.random() * 0.005) },
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
      { x: 100, y: 2985, width: 48, direction: 'left', activationChance: 0.6 },
      { x: 310, y: 4185, width: 48, direction: 'right', activationChance: 0.55 },
    ],
  };
}

// ── Course 6: Cradle Drop — proper Newton's cradle physics ──

export function buildCradleDrop(): TrackConfig {
  const RAMP_DROP = 60;
  const RAMP_CYS = [
    300, 520, 740,
    1500, 1720, 1940,
    2700, 2920, 3140,
    3900, 4120, 4340,
  ];
  const PEG_ZONE_YS = [1150, 2350, 3550];
  const FINISH_Y = 4700;
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
  obstacles.push(...generateGapPegs(3250, 2));
  obstacles.push(...generateGapPegs(4500, 2));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 300, speed: randSign() * (0.005 + Math.random() * 0.004) },
    { x: 200, y: (1500 + 1720) / 2, width: 280, speed: randSign() * (0.006 + Math.random() * 0.004) },
    { x: 200, y: (2700 + 2920) / 2, width: 300, speed: randSign() * (0.005 + Math.random() * 0.004) },
    { x: 200, y: (3900 + 4120) / 2, width: 280, speed: randSign() * (0.006 + Math.random() * 0.004) },
  ];

  const funnels: FunnelData[] = []; // no funnels — arch jams with 8 marbles
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  // Newton's cradles — doubled to 5 cradle rows across the extended length.
  const cradles: CradleConfig[] = [
    { x: 200, y: 860, count: 3, spacing: 30, length: 80, ballRadius: 9 },
    { x: 200, y: 1350, count: 3, spacing: 30, length: 75, ballRadius: 9 },
    { x: 200, y: 2100, count: 3, spacing: 30, length: 80, ballRadius: 9 },
    { x: 200, y: 3050, count: 3, spacing: 30, length: 80, ballRadius: 9 },
    { x: 200, y: 3700, count: 3, spacing: 30, length: 75, ballRadius: 9 },
    { x: 200, y: 4500, count: 3, spacing: 30, length: 80, ballRadius: 9 },
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
    // Gravity 1.15 — cradle bobs absorb energy elastically but their
    // swing decays slowly; marbles often dawdle behind the cradle row.
    gravity: { x: 0, y: 1.15, scale: 0.001 },
    bgImage: 'grass',
    cradles,
  };
}

// ── Course 7: Trampoline Park ──

export function buildTrampolinePark(): TrackConfig {
  const RAMP_DROP = 55;
  const RAMP_CYS = [
    300, 520, 740,
    1500, 1720, 1940,
    2700, 2920, 3140,
    3900, 4120, 4340,
  ];
  const PEG_ZONE_YS = [1150, 2350, 3550];
  const FINISH_Y = 4700;
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
    { x: 200, y: (2700 + 2920) / 2, width: 280, speed: randSign() * (0.006 + Math.random() * 0.004) },
    { x: 200, y: (3900 + 4120) / 2, width: 280, speed: randSign() * (0.005 + Math.random() * 0.004) },
  ];

  // No funnels — they create bottlenecks with 8 marbles. Pegs alone provide randomization.
  const funnels: FunnelData[] = [];
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);
  const finish = generateFinishZone(FINISH_Y);

  // Trampolines — doubled count across all 6 gap zones for the extended
  // length. Each cluster stays light (1-2 trampolines per gap) so marbles
  // redirect without getting trapped on shelves.
  const trampolines: TrampolineConfig[] = [
    { x: 120, y: 900, width: 70, strength: 3 },
    { x: 280, y: 1000, width: 70, strength: 3 },
    { x: 200, y: 1350, width: 70, strength: 3 },
    { x: 120, y: 2100, width: 70, strength: 3 },
    { x: 280, y: 2220, width: 70, strength: 3 },
    { x: 200, y: 2500, width: 70, strength: 3 },
    { x: 120, y: 3300, width: 70, strength: 3 },
    { x: 280, y: 3450, width: 70, strength: 3 },
    { x: 200, y: 3700, width: 70, strength: 3 },
    { x: 120, y: 4450, width: 70, strength: 3 },
    { x: 280, y: 4570, width: 70, strength: 3 },
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
  const RAMP_CYS = [
    300, 520, 740,
    1500, 1720, 1940,
    2700, 2920, 3140,
    3900, 4120, 4340,
  ];
  const PEG_ZONE_YS = [1100, 2300, 3550];
  const FINISH_Y = 4700;
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

  // Bumpers — extended for all 4 ramp groups
  obstacles.push(
    { x: 150, y: (520 + 740) / 2, r: 14, type: 'bumper' },
    { x: 250, y: (520 + 740) / 2, r: 14, type: 'bumper' },
    { x: 200, y: (1720 + 1940) / 2, r: 16, type: 'bumper' },
    { x: 150, y: (2920 + 3140) / 2, r: 14, type: 'bumper' },
    { x: 250, y: (2920 + 3140) / 2, r: 14, type: 'bumper' },
    { x: 200, y: (4120 + 4340) / 2, r: 16, type: 'bumper' },
  );

  // Fill gaps with mixed elements
  obstacles.push(...generateGapPegs(1300, 2));
  obstacles.push(...generateGapBumpers(2150, 25));
  obstacles.push(...generateGapPegs(3300, 2));
  obstacles.push(...generateGapBumpers(4500, 25));

  const windmillConfigs: WindmillConfig[] = [
    { x: 200, y: (300 + 520) / 2, width: 300, speed: randSign() * (0.006 + Math.random() * 0.005) },
    { x: 200, y: (1500 + 1720) / 2, width: 280, speed: randSign() * (0.007 + Math.random() * 0.005) },
    { x: 200, y: (2700 + 2920) / 2, width: 300, speed: randSign() * (0.006 + Math.random() * 0.005) },
    { x: 200, y: (3900 + 4120) / 2, width: 280, speed: randSign() * (0.007 + Math.random() * 0.005) },
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

  // Wrecking ball pendulums — doubled for the extended track length
  const pendulums: PendulumConfig[] = [
    { anchorX: 200, anchorY: 860, length: 110, bobRadius: 14, startVelocityX: 5 },
    { anchorX: 200, anchorY: 2050, length: 120, bobRadius: 14, startVelocityX: -5 },
    { anchorX: 200, anchorY: 3250, length: 110, bobRadius: 14, startVelocityX: 5 },
    { anchorX: 200, anchorY: 4400, length: 120, bobRadius: 14, startVelocityX: -5 },
  ];

  // Trampolines — only in zones without pendulums/bumpers to avoid traps
  const trampolines: TrampolineConfig[] = [
    { x: 200, y: 2200, width: 80, strength: 4 },
    { x: 200, y: 4550, width: 80, strength: 4 },
  ];

  // Newton's cradles — one per major section
  const cradles: CradleConfig[] = [
    { x: 200, y: 2450, count: 3, spacing: 30, length: 65, ballRadius: 9 },
    { x: 200, y: 4250, count: 3, spacing: 30, length: 65, ballRadius: 9 },
  ];

  // Ball pit zones — fewer balls each to reduce trapping, more zones overall
  const ballPits: BallPitConfig[] = [
    { x: 50, y: 1220, width: 300, height: 150, ballCount: 8, ballRadius: 7 },
    { x: 50, y: 3420, width: 300, height: 150, ballCount: 8, ballRadius: 7 },
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
      { x: 140, y: 3210, width: 55, direction: 'down', activationChance: 0.65 },
      { x: 260, y: 4205, width: 50, direction: 'left', activationChance: 0.6 },
    ],
  };
}

// ── Course 10: Grand Prix — continuous S-channel ──
// Two parallel sine-wave walls form a winding tube from top to bottom.
// Funnel entry captures all marble spawn positions; no marble escapes the channel.

// Grand Prix backgrounds map to the Skia-gradient bgThemes so every GP track
// renders with a proper themed gradient. The four "legacy" theme aliases
// (meadow/volcano/frozen/cyber) previously pointed at the PNG-tile themes
// (grass/lava/ice/cyber), which made hasLegacyBg() true and skipped the
// gradient render path — leaving Grand Prix tracks looking unthemed/plain.
// They now point at the closest vibrant gradient theme instead.
const GP_THEMES: Record<string, { bg: string; wall: string }> = {
  meadow:   { bg: 'forest',   wall: '#8B5E3C' },
  volcano:  { bg: 'volcanic', wall: '#c0c0c0' },
  frozen:   { bg: 'ocean',    wall: '#d0d0d0' },
  cyber:    { bg: 'neon',     wall: '#00d4ff' },
  beach:    { bg: 'beach',    wall: '#5a3520' },
  forest:   { bg: 'forest',   wall: '#8B5E3C' },
  desert:   { bg: 'desert',   wall: '#3a2510' },
  sunset:   { bg: 'sunset',   wall: '#e0e0e0' },
  night:    { bg: 'night',    wall: '#c0c0c0' },
  candy:    { bg: 'candy',    wall: '#ffffff' },
  ocean:    { bg: 'ocean',    wall: '#e0c060' },
  volcanic: { bg: 'volcanic', wall: '#c0c0c0' },
  neon:     { bg: 'neon',     wall: '#00ff87' },
  snow:     { bg: 'snow',     wall: '#5a3520' },
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

  // ARCHITECTURE REWRITE (v3) — replaced the sine-wave polyline
  // channel with zone-based architecture (open vertical descent +
  // discrete zigzag ramps + chamber obstacle zones). Same total
  // length and chamber identity as the channel version, but body
  // count drops from ~725 to ~200 (in line with hand-crafted)
  // because we're no longer carrying 580 channel-wall polyline
  // segments. GP identity now lives in: length (7500px ≈ 25-30s
  // races), themed visuals (background + wall color from
  // GP_THEMES), and the chamber-combo system below.
  const FINISH_Y = 7500;
  const CHANNEL_DEPTH = 220;
  const TOTAL_HEIGHT = FINISH_Y + CHANNEL_DEPTH + 10;
  const finish = generateFinishZone(FINISH_Y);

  // Zone-architecture: 18 zigzag ramps in 6 groups + 6 chamber zones
  // between them. Same flow shape as a hand-crafted track but extended
  // to GP length. Body count: ~36 ramp segments + ~40-60 chamber
  // obstacles + 18 springs + 4 walls ≈ 200 bodies (vs 725 for the
  // old channel architecture). Old-phone playable, race time ~25-30s.
  const RAMP_DROP = 60;
  const RAMP_CYS = [
    300, 520, 740,
    1500, 1720, 1940,
    2700, 2920, 3140,
    3900, 4120, 4340,
    5100, 5320, 5540,
    6300, 6520, 6740,
  ];

  // Chamber Y positions sit in the gaps between ramp groups. Same
  // chamber-combo system that gave each GP its theme of obstacles.
  const baseYs = [1150, 2350, 3550, 4750, 5950, 7100];
  const chambers = baseYs.map(by => ({
    y: by + Math.floor(rng() * 40 - 20),
  }));

  // Shuffle obstacle combos for this seed — 6 chambers + 6 combos so
  // each combo gets used exactly once per track, ordered randomly.
  const combos = [...CHAMBER_COMBOS];
  for (let i = combos.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [combos[i], combos[j]] = [combos[j], combos[i]];
  }
  const chamberCombos: ChamberCombo[] = combos;

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
      // CLUNK FIX v2 — chamber obstacle sizes bumped from r:5 (cosmetic) to
      // r:11 (peg) / r:14 (bumper) to match hand-crafted tracks. Earlier
      // 5px obstacles were too small to register as physics theater — the
      // marble would graze past them and the chambers felt empty. Also
      // added 2-3 extra obstacles per combo so the wider channel still
      // has a sense of "stuff happening here."
      case 'windmill_pegs':
        windmillConfigs.push({ x: 200, y, width: 120, speed: 0.008 * dir });
        obstacles.push(
          { x: 130, y: y + 30, r: 11, type: 'peg' },
          { x: 200, y: y + 10, r: 11, type: 'peg' },
          { x: 270, y: y + 30, r: 11, type: 'peg' },
          { x: 160, y: y + 70, r: 11, type: 'peg' },
          { x: 240, y: y + 70, r: 11, type: 'peg' },
          { x: 100, y: y + 100, r: 11, type: 'peg' },
          { x: 300, y: y + 100, r: 11, type: 'peg' },
        );
        break;
      case 'pendulum_bumpers':
        pendulums.push({ anchorX: 200, anchorY: y, length: 100, bobRadius: 15, startVelocityX: 6 * dir });
        obstacles.push(
          { x: 110, y: y - 30, r: 14, type: 'bumper' },
          { x: 290, y: y - 30, r: 14, type: 'bumper' },
          { x: 140, y: y + 50, r: 14, type: 'bumper' },
          { x: 260, y: y + 50, r: 14, type: 'bumper' },
          { x: 200, y: y + 110, r: 14, type: 'bumper' },
        );
        break;
      case 'speedburst_tramp':
        speedBursts.push(
          { x: 200, y: y - 20, width: 70, direction: 'down' as const, activationChance: 0.7 },
          { x: 130, y: y + 10, width: 60, direction: 'right' as const, activationChance: 0.65 },
          { x: 270, y: y + 10, width: 60, direction: 'left' as const, activationChance: 0.65 },
        );
        trampolines.push(
          { x: 130, y: y + 60, width: 50, strength: 5 },
          { x: 270, y: y + 60, width: 50, strength: 5 },
        );
        obstacles.push(
          { x: 200, y: y + 90, r: 14, type: 'bumper' },
          { x: 120, y: y + 110, r: 11, type: 'peg' },
          { x: 280, y: y + 110, r: 11, type: 'peg' },
        );
        break;
      case 'windmill_bumpers':
        windmillConfigs.push({ x: 200, y, width: 140, speed: -0.008 * dir });
        obstacles.push(
          { x: 120, y: y - 20, r: 14, type: 'bumper' },
          { x: 280, y: y - 20, r: 14, type: 'bumper' },
          { x: 200, y: y + 50, r: 14, type: 'bumper' },
          { x: 140, y: y + 90, r: 14, type: 'bumper' },
          { x: 260, y: y + 90, r: 14, type: 'bumper' },
        );
        break;
      case 'pendulum_pegs':
        pendulums.push({ anchorX: 200, anchorY: y, length: 100, bobRadius: 15, startVelocityX: -6 * dir });
        obstacles.push(
          { x: 140, y: y + 20, r: 11, type: 'peg' },
          { x: 200, y: y, r: 11, type: 'peg' },
          { x: 260, y: y + 20, r: 11, type: 'peg' },
          { x: 165, y: y + 60, r: 11, type: 'peg' },
          { x: 235, y: y + 60, r: 11, type: 'peg' },
          { x: 110, y: y + 90, r: 11, type: 'peg' },
          { x: 290, y: y + 90, r: 11, type: 'peg' },
        );
        break;
      case 'tramp_speedburst':
        trampolines.push(
          { x: 140, y: y + 40, width: 50, strength: 5 },
          { x: 260, y: y + 40, width: 50, strength: 5 },
        );
        speedBursts.push(
          { x: 200, y: y - 20, width: 70, direction: 'down' as const, activationChance: 0.7 },
        );
        obstacles.push(
          { x: 130, y: y + 90, r: 14, type: 'bumper' },
          { x: 270, y: y + 90, r: 14, type: 'bumper' },
          { x: 200, y: y + 110, r: 11, type: 'peg' },
        );
        break;
    }
  });

  // Build ramps + springs from the RAMP_CYS array, matching the
  // hand-crafted track pattern. Ramps alternate left/right by index
  // so marbles zigzag down through the chambers.
  const ramps: RampData[] = RAMP_CYS.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, RAMP_DROP),
    engineCY: cy,
  }));
  const springs = generateSprings(RAMP_CYS, RAMP_DROP);

  const gpTheme = GP_THEMES[theme] || GP_THEMES.cyber;

  return {
    id: `grand-prix-${seed || theme}`,
    engineWidth: ENGINE_WIDTH,
    totalHeight: TOTAL_HEIGHT,
    finishY: FINISH_Y,
    ...finish,
    ramps,
    obstacles,
    windmillConfigs,
    funnels: [],
    finishFunnel: finish.finishFunnel,
    springs,
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
