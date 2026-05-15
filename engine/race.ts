import Matter from 'matter-js';
import { MarbleData, MARBLES } from '../theme';
import {
  TrackConfig, RampData, ObstacleInfo, WindmillConfig, FunnelData, SpringData,
  PendulumConfig, BallPitConfig, CradleConfig, TrampolineConfig, SpeedBurstConfig,
  buildClassicZigzag,
} from './tracks';

export interface PendulumState {
  anchorX: number;
  anchorY: number;
  bobX: number;
  bobY: number;
  bobRadius: number;
}

export interface BallPitBallState {
  x: number;
  y: number;
  r: number;
}

export interface TrampolineState {
  x: number;
  y: number;
  width: number;
}

export interface SpeedBurstState {
  x: number;
  y: number;
  width: number;
  direction: 'left' | 'right' | 'down';
  active: boolean;
}

export interface RaceState {
  marbles: { data: MarbleData; x: number; y: number; finished: boolean; finishTime: number }[];
  elapsed: number;
  isFinished: boolean;
  windmills: { x: number; y: number; angle: number; width: number }[];
  pendulums: PendulumState[];
  ballPitBalls: BallPitBallState[];
  cradles: PendulumState[];
  trampolines: TrampolineState[];
  speedBursts: SpeedBurstState[];
  doomsdayBar: { y: number; active: boolean } | null;
}

// Re-export types and track data for the renderer
export type { RampData, ObstacleInfo, WindmillConfig, FunnelData, SpringData, TrackConfig };

// Default track for backwards compatibility
const DEFAULT_TRACK = buildClassicZigzag();

export const ENGINE_WIDTH = 400;
export const FINISH_Y = DEFAULT_TRACK.finishY;
export const CHANNEL_LEFT = DEFAULT_TRACK.channelLeft;
export const CHANNEL_RIGHT = DEFAULT_TRACK.channelRight;
export const TOTAL_HEIGHT = DEFAULT_TRACK.totalHeight;
export const TRACK_DATA = DEFAULT_TRACK;

// === Physics Constants (from Matter.js demos) ===

// Fixed-timestep substeps for precision (from substep demo)
const SUBSTEPS = 3;
const FIXED_DT = (1000 / 60) / SUBSTEPS; // ~5.56ms per substep

// Collision categories — simplified, no more DECOR hack
const CAT_WALL     = 0x0001; // Static: walls, ramps, funnels, pegs, bumpers
const CAT_MARBLE   = 0x0002; // Racing marbles
const CAT_OBSTACLE = 0x0004; // Dynamic obstacles: pendulums, pit balls, cradle bobs
const CAT_DOOMSDAY = 0x0008; // Doomsday sweep bar

// Marbles collide with walls + other marbles + all obstacles + doomsday bar
const MARBLE_FILTER   = { category: CAT_MARBLE, mask: CAT_WALL | CAT_MARBLE | CAT_OBSTACLE | CAT_DOOMSDAY };
// Obstacles collide with walls + marbles but NOT each other (prevents obstacle jams)
const OBSTACLE_FILTER = { category: CAT_OBSTACLE, mask: CAT_WALL | CAT_MARBLE };
// Cradle bobs collide with walls + marbles + OTHER cradle bobs (needed for momentum transfer)
const CRADLE_FILTER   = { category: CAT_OBSTACLE, mask: CAT_WALL | CAT_MARBLE | CAT_OBSTACLE };

// === ENGINE ===

export interface RaceEngineOptions {
  config?: TrackConfig;
  raceMarbles?: MarbleData[];
  onHaptic?: (type: 'bumper' | 'trampoline' | 'speedBurst' | 'pendulum' | 'cradle', marbleId: string) => void;
}

export function createRaceEngine(configOrOpts?: TrackConfig | RaceEngineOptions, raceMarbles?: MarbleData[]) {
  // Support both old signature (config, marbles) and new options object
  let opts: RaceEngineOptions;
  if (configOrOpts && 'onHaptic' in configOrOpts) {
    opts = configOrOpts as RaceEngineOptions;
  } else {
    opts = { config: configOrOpts as TrackConfig | undefined, raceMarbles };
  }
  const onHaptic = opts.onHaptic;
  const config = opts.config;
  raceMarbles = opts.raceMarbles ?? raceMarbles;
  const track = config || DEFAULT_TRACK;
  const engine = Matter.Engine.create({
    gravity: track.gravity,
    positionIterations: 10, // up from default 6 — better stability
    velocityIterations: 8,  // up from default 4
  } as any);
  const world = engine.world;
  const W = track.engineWidth;

  // === WALLS — 50px thick boundaries (avalanche demo: near-zero friction) ===
  const totalH = track.totalHeight;
  Matter.Composite.add(world, [
    // Left wall — moderate restitution to bounce marbles back into play
    Matter.Bodies.rectangle(0, totalH / 2, 50, totalH + 200, {
      isStatic: true, friction: 0.01, restitution: 0.2, label: 'wall',
    }),
    // Right wall
    Matter.Bodies.rectangle(W, totalH / 2, 50, totalH + 200, {
      isStatic: true, friction: 0.01, restitution: 0.2, label: 'wall',
    }),
    // Ceiling
    Matter.Bodies.rectangle(W / 2, -25, W + 100, 50, {
      isStatic: true, friction: 0.01, restitution: 0.2, label: 'ceiling',
    }),
    // Floor
    Matter.Bodies.rectangle(W / 2, totalH + 25, W + 100, 50, {
      isStatic: true, friction: 0.3, restitution: 0.1, label: 'floor',
    }),
  ]);

  // === RAMPS ===
  const RAMP_THICKNESS = 14;
  track.ramps.forEach(ramp => {
    for (let j = 0; j < ramp.points.length - 1; j++) {
      const a = ramp.points[j], b = ramp.points[j + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      Matter.Composite.add(world,
        Matter.Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len + 6, RAMP_THICKNESS, {
          isStatic: true, angle: Math.atan2(dy, dx),
          friction: 0.005, restitution: 0.3, // near-zero rolling friction (avalanche demo pattern)
          chamfer: { radius: 4 },
          label: 'ramp',
        }),
      );
    }
  });

  // === BUMPERS & PEGS — bumpers deflect marbles with satisfying kick ===
  track.obstacles.forEach(obs => {
    Matter.Composite.add(world,
      Matter.Bodies.circle(obs.x, obs.y, obs.r, {
        isStatic: true,
        restitution: obs.type === 'bumper' ? 1.2 : 0.3, // bumpers: strong bounce, pegs: absorb energy
        friction: 0.001,
        collisionFilter: { category: CAT_WALL, mask: CAT_MARBLE | CAT_OBSTACLE },
        label: obs.type,
      }),
    );
  });

  // === FUNNEL WALLS ===
  track.funnels.forEach(f => {
    const dy = f.y2 - f.y1;
    const ldx = f.leftX2 - f.leftX1;
    const lLen = Math.sqrt(ldx * ldx + dy * dy);
    Matter.Composite.add(world,
      Matter.Bodies.rectangle(
        (f.leftX1 + f.leftX2) / 2, (f.y1 + f.y2) / 2, lLen, 12,
        { isStatic: true, angle: Math.atan2(dy, ldx), friction: 0.005, restitution: 0.35, label: 'funnel' },
      ),
    );
    const rdx = f.rightX2 - f.rightX1;
    const rLen = Math.sqrt(rdx * rdx + dy * dy);
    Matter.Composite.add(world,
      Matter.Bodies.rectangle(
        (f.rightX1 + f.rightX2) / 2, (f.y1 + f.y2) / 2, rLen, 12,
        { isStatic: true, angle: Math.atan2(dy, rdx), friction: 0.005, restitution: 0.35, label: 'funnel' },
      ),
    );
  });

  // === FINISH ZONE ===
  const ff = track.finishFunnel;
  const fdy = ff.y2 - ff.y1;
  const fldx = ff.leftX2 - ff.leftX1;
  const flLen = Math.sqrt(fldx * fldx + fdy * fdy);
  Matter.Composite.add(world,
    Matter.Bodies.rectangle(
      (ff.leftX1 + ff.leftX2) / 2, (ff.y1 + ff.y2) / 2, flLen, 14,
      { isStatic: true, angle: Math.atan2(fdy, fldx), friction: 0.005, restitution: 0.3, label: 'finish-funnel' },
    ),
  );
  const frdx = ff.rightX2 - ff.rightX1;
  const frLen = Math.sqrt(frdx * frdx + fdy * fdy);
  Matter.Composite.add(world,
    Matter.Bodies.rectangle(
      (ff.rightX1 + ff.rightX2) / 2, (ff.y1 + ff.y2) / 2, frLen, 14,
      { isStatic: true, angle: Math.atan2(fdy, frdx), friction: 0.005, restitution: 0.3, label: 'finish-funnel' },
    ),
  );
  // Mini-funnel: narrows from funnel exit to channel width over miniFunnelH below finishY
  const miniH = track.miniFunnelH;
  const funnelExitLeft = ff.leftX2;
  const funnelExitRight = ff.rightX2;
  // Left mini-funnel wall: from funnel exit left edge → channel left edge
  const mlDx = track.channelLeft - funnelExitLeft;
  const mlLen = Math.sqrt(mlDx * mlDx + miniH * miniH);
  Matter.Composite.add(world,
    Matter.Bodies.rectangle(
      (funnelExitLeft + track.channelLeft) / 2, track.finishY + miniH / 2, mlLen, 10,
      { isStatic: true, angle: Math.atan2(miniH, mlDx), friction: 0.005, restitution: 0.3, label: 'channel-funnel' },
    ),
  );
  // Right mini-funnel wall: from funnel exit right edge → channel right edge
  const mrDx = track.channelRight - funnelExitRight;
  const mrLen = Math.sqrt(mrDx * mrDx + miniH * miniH);
  Matter.Composite.add(world,
    Matter.Bodies.rectangle(
      (funnelExitRight + track.channelRight) / 2, track.finishY + miniH / 2, mrLen, 10,
      { isStatic: true, angle: Math.atan2(miniH, mrDx), friction: 0.005, restitution: 0.3, label: 'channel-funnel' },
    ),
  );
  // Channel walls (below mini-funnel)
  const channelTopY = track.finishY + miniH;
  const channelWallH = track.channelDepth - miniH;
  Matter.Composite.add(world,
    Matter.Bodies.rectangle(track.channelLeft - 5, channelTopY + channelWallH / 2, 10, channelWallH + 20, {
      isStatic: true, friction: 0.005, restitution: 0.2, label: 'channel-wall',
    }),
  );
  Matter.Composite.add(world,
    Matter.Bodies.rectangle(track.channelRight + 5, channelTopY + channelWallH / 2, 10, channelWallH + 20, {
      isStatic: true, friction: 0.005, restitution: 0.2, label: 'channel-wall',
    }),
  );
  Matter.Composite.add(world,
    Matter.Bodies.rectangle(track.channelCX, track.finishY + track.channelDepth + 10, (track.channelRight - track.channelLeft) + 20, 14, {
      isStatic: true, friction: 0.5, restitution: 0.1, label: 'channel-floor',
    }),
  );

  // === WINDMILLS — natural wooden blade feel ===
  interface WMBody { body: Matter.Body; x: number; y: number; width: number; speed: number }
  const wmBodies: WMBody[] = [];
  track.windmillConfigs.forEach(wm => {
    const blade = Matter.Bodies.rectangle(wm.x, wm.y, wm.width, 8, {
      isStatic: true, friction: 0.01, restitution: 0.5, // satisfying deflection
      label: 'windmill',
    });
    Matter.Composite.add(world, blade);
    wmBodies.push({ body: blade, ...wm });
  });

  // === SPRINGS — sensor-based gentle redirect (no bouncing!) ===
  // Springs are sensors: marbles pass through but get a gentle downward/inward nudge
  track.springs.forEach(sp => {
    const body = Matter.Bodies.rectangle(sp.x, sp.y, sp.w, sp.h, {
      isStatic: true, isSensor: true, label: 'spring',
    });
    Matter.Composite.add(world, body);
  });

  // Single unified collisionStart handler for springs + trampolines
  const MAX_TRAMP_BOUNCES = 5;
  const trampolineBodies: { body: Matter.Body; config: TrampolineConfig }[] = [];
  const trampBounceCount = new Map<Matter.Body, number>();

  Matter.Events.on(engine, 'collisionStart', (event: any) => {
    event.pairs.forEach((pair: any) => {
      const { bodyA, bodyB } = pair;

      // Spring — sensor-based gentle redirect toward center and downward
      let marble: Matter.Body | null = null;
      if (bodyA.label === 'spring' && !bodyB.isStatic) { marble = bodyB; }
      else if (bodyB.label === 'spring' && !bodyA.isStatic) { marble = bodyA; }
      if (marble) {
        const toCenter = marble.position.x < W / 2 ? 1 : -1;
        Matter.Body.applyForce(marble, marble.position, {
          x: toCenter * 0.002 * marble.mass,
          y: 0.001 * marble.mass, // gentle downward nudge, NOT upward
        });
        return;
      }

      // Trampoline — restitution 0.75 handles bounce; add modest upward kick
      let tMarble: Matter.Body | null = null;
      let trampBody: Matter.Body | null = null;
      if (bodyA.label === 'trampoline' && !bodyB.isStatic) { tMarble = bodyB; trampBody = bodyA; }
      else if (bodyB.label === 'trampoline' && !bodyA.isStatic) { tMarble = bodyA; trampBody = bodyB; }
      if (tMarble && trampBody) {
        const count = trampBounceCount.get(trampBody) || 0;
        if (count >= MAX_TRAMP_BOUNCES) return;
        trampBounceCount.set(trampBody, count + 1);
        if (count + 1 >= MAX_TRAMP_BOUNCES) {
          (trampBody as any).restitution = 0.1;
        }
        const tc = trampolineBodies.find(t => t.body === trampBody);
        const strength = tc ? tc.config.strength : 5;
        // Modest upward kick to complement restitution bounce
        Matter.Body.applyForce(tMarble, tMarble.position, {
          x: (Math.random() - 0.5) * 0.001 * tMarble.mass,
          y: -strength * 0.0008 * tMarble.mass,
        });
        if (onHaptic) {
          const mEntry = marbleBodies.find(m => m.body === tMarble);
          if (mEntry) onHaptic('trampoline', mEntry.data.id);
        }
      }

      // Speed burst — gentle directional push
      let sbMarble: Matter.Body | null = null;
      let sbEntry: typeof speedBurstBodies[0] | null = null;
      if (bodyA.label === 'speedburst' && !bodyB.isStatic) {
        sbMarble = bodyB;
        sbEntry = speedBurstBodies.find(s => s.body === bodyA) || null;
      } else if (bodyB.label === 'speedburst' && !bodyA.isStatic) {
        sbMarble = bodyA;
        sbEntry = speedBurstBodies.find(s => s.body === bodyB) || null;
      }
      if (sbMarble && sbEntry) {
        if (Math.random() < sbEntry.config.activationChance) {
          const str = 0.003;
          let fx = 0, fy = 0;
          switch (sbEntry.config.direction) {
            case 'left':  fx = -str * sbMarble.mass; fy = -0.0005 * sbMarble.mass; break;
            case 'right': fx = str * sbMarble.mass;  fy = -0.0005 * sbMarble.mass; break;
            case 'down':  fx = 0; fy = str * sbMarble.mass; break;
          }
          Matter.Body.applyForce(sbMarble, sbMarble.position, { x: fx, y: fy });
          sbEntry.activeUntil = elapsed + 300;
          if (onHaptic) {
            const mEntry = marbleBodies.find(m => m.body === sbMarble);
            if (mEntry) onHaptic('speedBurst', mEntry.data.id);
          }
        }
      }

      // Haptic feedback for bumpers, pendulums, cradles
      if (onHaptic) {
        const mA = marbleBodies.find(m => m.body === bodyA);
        const mB = marbleBodies.find(m => m.body === bodyB);
        const mEntry = mA || mB;
        const otherBody = mA ? bodyB : mB ? bodyA : null;
        if (mEntry && otherBody) {
          if (otherBody.label === 'bumper') onHaptic('bumper', mEntry.data.id);
          else if (otherBody.label === 'pendulum-bob') onHaptic('pendulum', mEntry.data.id);
          else if (otherBody.label === 'cradle-bob') onHaptic('cradle', mEntry.data.id);
        }
      }
    });
  });

  // === PENDULUMS — wrecking ball physics (from wreckingBall demo) ===
  const pendulumBobs: { body: Matter.Body; config: PendulumConfig }[] = [];
  if (track.pendulums) {
    track.pendulums.forEach(p => {
      const bob = Matter.Bodies.circle(p.anchorX, p.anchorY + p.length, p.bobRadius, {
        density: 0.008,       // lighter — deflects marbles but doesn't trap them against walls
        restitution: 0.8,     // high restitution — marbles bounce off quickly rather than sticking
        friction: 0.005,
        frictionAir: 0.005,   // slight air drag — pendulum decays naturally
        label: 'pendulum-bob',
        collisionFilter: OBSTACLE_FILTER,
      });
      const constraint = Matter.Constraint.create({
        pointA: { x: p.anchorX, y: p.anchorY },
        bodyB: bob,
        length: p.length,
        stiffness: 1,   // rigid rod (correct for pendulum, same as demo)
        damping: 0,      // no joint damping (demo default)
      });
      Matter.Composite.add(world, [bob, constraint]);
      Matter.Body.setVelocity(bob, { x: p.startVelocityX, y: 0 });
      pendulumBobs.push({ body: bob, config: p });
    });
  }

  // === BALL PITS — avalanche physics (from avalanche demo) ===
  const pitBallBodies: { body: Matter.Body; r: number }[] = [];
  if (track.ballPits) {
    track.ballPits.forEach(pit => {
      const cols = Math.floor(pit.width / (pit.ballRadius * 3));
      const rows = Math.ceil(pit.ballCount / cols);
      for (let i = 0; i < pit.ballCount; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const offsetX = row % 2 === 0 ? 0 : pit.ballRadius * 1.5;
        const bx = pit.x + pit.ballRadius * 2 + col * (pit.width / cols) + offsetX;
        const by = pit.y + pit.ballRadius * 2 + row * (pit.height / Math.max(1, rows));
        const ball = Matter.Bodies.circle(bx, by, pit.ballRadius, {
          density: 0.001,       // standard default
          restitution: 0.5,     // avalanche demo pattern
          friction: 0.005,     // near-zero surface friction
          frictionAir: 0.01,   // default air drag
          label: 'pit-ball',
          collisionFilter: OBSTACLE_FILTER, // NOW HITS MARBLES
        });
        Matter.Composite.add(world, ball);
        pitBallBodies.push({ body: ball, r: pit.ballRadius });
      }
    });
  }

  // === NEWTON'S CRADLES — exact demo physics (from newtonsCradle demo) ===
  const cradleBobs: { body: Matter.Body; anchorX: number; anchorY: number; ballRadius: number }[] = [];
  if (track.cradles) {
    track.cradles.forEach(c => {
      for (let i = 0; i < c.count; i++) {
        const ballX = c.x - (c.count - 1) * c.spacing / 2 + i * c.spacing;
        const bob = Matter.Bodies.circle(ballX, c.y + c.length, c.ballRadius, {
          inertia: Infinity,           // CRITICAL: prevents rotation (newtonsCradle demo)
          restitution: 1.0,            // perfect elastic collision (newtonsCradle demo)
          friction: 0,                 // zero friction (newtonsCradle demo)
          frictionAir: 0,              // zero air drag (newtonsCradle demo)
          slop: c.ballRadius * 0.02,   // tighter contact tolerance (newtonsCradle demo)
          label: 'cradle-bob',
          collisionFilter: CRADLE_FILTER, // hits walls + marbles + other cradle bobs
        });
        const constraint = Matter.Constraint.create({
          pointA: { x: ballX, y: c.y },
          bodyB: bob,
          length: c.length,
          stiffness: 1,  // rigid string (demo default)
          damping: 0,     // no damping (demo default)
        });
        Matter.Composite.add(world, [bob, constraint]);
        cradleBobs.push({ body: bob, anchorX: ballX, anchorY: c.y, ballRadius: c.ballRadius });
      }
      // Pull first ball back to start the cradle (same as demo: Body.translate)
      if (cradleBobs.length >= c.count) {
        const firstBob = cradleBobs[cradleBobs.length - c.count];
        Matter.Body.translate(firstBob.body, { x: -c.spacing * 1.5, y: -c.length * 0.15 });
      }
    });
  }

  // === TRAMPOLINES — high restitution handles bounce; force adds extra kick ===
  if (track.trampolines) {
    track.trampolines.forEach(t => {
      const body = Matter.Bodies.rectangle(t.x, t.y, t.width, 10, {
        isStatic: true,
        restitution: 0.5, // moderate bounce — prevents marbles getting trapped
        friction: 0.005,
        label: 'trampoline',
        chamfer: { radius: 3 },
      });
      trampBounceCount.set(body, 0);
      Matter.Composite.add(world, body);
      trampolineBodies.push({ body, config: t });
    });
  }

  // === SPEED BURSTS — sensor-based directional boost pads ===
  const speedBurstBodies: { body: Matter.Body; config: SpeedBurstConfig; activeUntil: number }[] = [];
  if (track.speedBursts) {
    track.speedBursts.forEach(sb => {
      const body = Matter.Bodies.rectangle(sb.x, sb.y, sb.width, 12, {
        isStatic: true,
        isSensor: true,
        label: 'speedburst',
      });
      Matter.Composite.add(world, body);
      speedBurstBodies.push({ body, config: sb, activeUntil: 0 });
    });
  }

  // === STARTING AREA ===
  const scramblerBody = Matter.Bodies.rectangle(W / 2, 140, 280, 8, {
    isStatic: true, friction: 0.01, restitution: 0.5, label: 'windmill',
  });
  Matter.Composite.add(world, scramblerBody);
  const scramblerWm: WMBody = { body: scramblerBody, x: W / 2, y: 140, width: 280, speed: 0.04 };
  wmBodies.push(scramblerWm);

  const gate = Matter.Bodies.rectangle(W / 2, 230, W - 20, 10, {
    isStatic: true, friction: 0.1, restitution: 0.3, label: 'gate',
  });
  Matter.Composite.add(world, gate);

  // === MARBLES — exact avalanche demo pattern (friction≈0, frictionAir=default 0.01) ===
  const marbleBodies: { body: Matter.Body; data: MarbleData }[] = [];
  const marblePool = raceMarbles || MARBLES;
  const totalMarbleCount = marblePool.length;
  const shuffled = [...marblePool].sort(() => Math.random() - 0.5);
  shuffled.forEach((marble, i) => {
    const startX = W / 2 + (Math.random() - 0.5) * 160;
    const startY = 40 + i * 16 + (Math.random() - 0.5) * 8;
    const body = Matter.Bodies.circle(startX, startY, 11, {
      restitution: 0.48 + marble.stats.bounce * 0.01,       // 0.50-0.54 — tight around avalanche's 0.5
      friction: 0.00001,                                      // exact avalanche demo value
      frictionStatic: 0.1,                                    // default — helps marbles settle naturally
      density: 0.001 + marble.stats.power * 0.00005,        // 0.0011-0.00125 — tight around default 0.001
      frictionAir: 0.008 - marble.stats.speed * 0.0005,      // 0.0055-0.0075 — low drag for natural flow, gravity dominates
      label: marble.id,
      collisionFilter: MARBLE_FILTER,
    });
    Matter.Body.setVelocity(body, {
      x: (Math.random() - 0.5) * 1.5,
      y: 0.3 + Math.random() * 0.3,
    });
    marbleBodies.push({ body, data: marble });
    Matter.Composite.add(world, body);
  });

  let gateOpen = false;
  let elapsed = 0;
  let physicsAccumulator = 0; // Time accumulator — fixes 120Hz/90Hz double-speed bug
  const FRAME_DT = 1000 / 60;  // Physics runs at fixed 60fps regardless of screen refresh rate
  const finishTimes: Record<string, number> = {};
  let firstFinishTime = 0;

  // No anti-stuck hacks — physics must flow naturally. Doomsday bar is the only safety net.

  // Doomsday bar — physical sweep bar for true physics finish guarantee
  const DOOMSDAY_TRIGGER_MS = 45000; // 45s — sweep stragglers (no anti-stuck, so trigger earlier)
  const DOOMSDAY_DEADLINE_MS = 60000; // 60s hard cap
  const DOOMSDAY_BAR_HEIGHT = 20;
  const DOOMSDAY_FILTER = { category: CAT_DOOMSDAY, mask: CAT_MARBLE };
  let doomsdayBar: Matter.Body | null = null;
  let doomsdayBarActive = false;
  let doomsdayBarStartY = 0;
  let doomsdayBarStartTime = 0;
  let doomsdayBarEndY = 0;
  let doomsdayBarDuration = 0;

  function releaseGate() {
    if (!gateOpen) {
      gateOpen = true;
      elapsed = 0;
      Matter.Composite.remove(world, gate);
      Matter.Composite.remove(world, scramblerBody);
      wmBodies.splice(wmBodies.indexOf(scramblerWm), 1);
    }
  }

  function step(_dt: number = 16.67): RaceState {
    if (gateOpen) elapsed += _dt;

    // === DOOMSDAY BAR — spawn check (before physics so collision resolves properly) ===
    const unfinishedMarbles = marbleBodies.filter(({ data }) => !finishTimes[data.id]);
    if (!doomsdayBarActive && elapsed >= DOOMSDAY_TRIGGER_MS && unfinishedMarbles.length > 0) {
      let highestY = Infinity;
      for (const { body } of unfinishedMarbles) {
        if (body.position.y < highestY) highestY = body.position.y;
      }
      doomsdayBarStartY = highestY - 100;
      doomsdayBarStartTime = elapsed;
      doomsdayBarEndY = track.finishY + 50;
      doomsdayBarDuration = DOOMSDAY_DEADLINE_MS - elapsed;

      doomsdayBar = Matter.Bodies.rectangle(W / 2, doomsdayBarStartY, W + 100, DOOMSDAY_BAR_HEIGHT, {
        isStatic: true,
        friction: 0.1,
        restitution: 0.3,
        label: 'doomsday-bar',
        collisionFilter: DOOMSDAY_FILTER,
      });
      Matter.Composite.add(world, doomsdayBar);
      doomsdayBarActive = true;
    }

    // Move doomsday bar BEFORE physics step so collisions resolve in the same frame
    if (doomsdayBarActive && doomsdayBar) {
      const progress = Math.min(1, (elapsed - doomsdayBarStartTime) / Math.max(doomsdayBarDuration, 1));
      const newY = doomsdayBarStartY + progress * (doomsdayBarEndY - doomsdayBarStartY);
      if (newY >= track.finishY + 50) {
        Matter.Composite.remove(world, doomsdayBar);
        doomsdayBar = null;
        doomsdayBarActive = false;
      } else {
        const speed = (doomsdayBarEndY - doomsdayBarStartY) / (doomsdayBarDuration / 16.67);
        Matter.Body.setVelocity(doomsdayBar, { x: 0, y: speed });
        Matter.Body.setPosition(doomsdayBar, { x: W / 2, y: newY });
      }
    }

    // Time accumulator — run physics at fixed 60fps regardless of screen refresh rate
    // On 120Hz screens, only every other frame advances physics (prevents 2x speed bug)
    physicsAccumulator += _dt;
    while (physicsAccumulator >= FRAME_DT) {
      // Windmill rotation per physics frame
      wmBodies.forEach(wm => {
        Matter.Body.setAngle(wm.body, wm.body.angle + wm.speed);
      });
      // Substeps for precision
      for (let s = 0; s < SUBSTEPS; s++) {
        Matter.Engine.update(engine, FIXED_DT);
      }
      physicsAccumulator -= FRAME_DT;
    }

    // Post-step marble processing
    const MAX_SPEED = 15; // velocity cap — higher for natural flow with low air friction
    marbleBodies.forEach(({ body, data }) => {
      if (finishTimes[data.id]) return;

      // Velocity cap — clamp speed to feel natural
      const vx = body.velocity.x, vy = body.velocity.y;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;
        Matter.Body.setVelocity(body, { x: vx * scale, y: vy * scale });
      }

      // Luck-based gentle nudge — rare and very soft (force-based, not jitter)
      if (Math.random() < 0.005 * data.stats.luck) {
        Matter.Body.applyForce(body, body.position, {
          x: (Math.random() - 0.5) * 0.0003 * body.mass,
          y: 0,
        });
      }

      // Finish detection — gradual slowdown instead of instant velocity override
      if (body.position.y >= track.finishY) {
        finishTimes[data.id] = elapsed;
        if (!firstFinishTime) firstFinishTime = elapsed;
        body.frictionAir = 0.15;
        body.restitution = 0.1;
        body.friction = 0.3;
      }
    });

    const finishedCount = Object.keys(finishTimes).length;
    const isFinished = finishedCount >= totalMarbleCount || elapsed > DOOMSDAY_DEADLINE_MS;
    if (isFinished) {
      marbleBodies.forEach(({ data, body }) => {
        if (!finishTimes[data.id]) finishTimes[data.id] = elapsed + (track.finishY - body.position.y) * 8;
      });
    }

    const marbles = marbleBodies.map(({ body, data }) => ({
      data,
      x: body.position.x,
      y: body.position.y,
      finished: !!finishTimes[data.id],
      finishTime: finishTimes[data.id] || 0,
    }));

    return {
      marbles,
      elapsed,
      isFinished,
      windmills: wmBodies.map(wm => ({
        x: wm.x, y: wm.y, angle: wm.body.angle, width: wm.width,
      })),
      pendulums: pendulumBobs.map(p => ({
        anchorX: p.config.anchorX, anchorY: p.config.anchorY,
        bobX: p.body.position.x, bobY: p.body.position.y,
        bobRadius: p.config.bobRadius,
      })),
      ballPitBalls: pitBallBodies.map(b => ({
        x: b.body.position.x, y: b.body.position.y, r: b.r,
      })),
      cradles: cradleBobs.map(c => ({
        anchorX: c.anchorX, anchorY: c.anchorY,
        bobX: c.body.position.x, bobY: c.body.position.y,
        bobRadius: c.ballRadius,
      })),
      trampolines: trampolineBodies.map(t => ({
        x: t.config.x, y: t.config.y, width: t.config.width,
      })),
      speedBursts: speedBurstBodies.map(sb => ({
        x: sb.config.x, y: sb.config.y, width: sb.config.width,
        direction: sb.config.direction,
        active: elapsed < sb.activeUntil,
      })),
      doomsdayBar: doomsdayBarActive && doomsdayBar
        ? { y: doomsdayBar.position.y, active: true }
        : null,
    };
  }

  function getPositions(): { marble: MarbleData; time: number }[] {
    return marbleBodies
      .map(({ data, body }) => ({
        marble: data, time: finishTimes[data.id] || elapsed + (track.finishY - body.position.y) * 8,
      }))
      .sort((a, b) => a.time - b.time);
  }

  function destroy() { Matter.Engine.clear(engine); }
  return { step, getPositions, destroy, releaseGate, track };
}
