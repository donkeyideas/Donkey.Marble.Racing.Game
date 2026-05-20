import Matter from 'matter-js';
import { MarbleData, MARBLES } from '../theme';
import {
  TrackConfig, RampData, ObstacleInfo, WindmillConfig, FunnelData, SpringData,
  PendulumConfig, BallPitConfig, CradleConfig, TrampolineConfig, SpeedBurstConfig, SwingingDoorConfig,
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
  swingingDoors: { hingeX: number; hingeY: number; length: number; angle: number }[];
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
// 2 substeps × 60Hz = 120 physics ticks/sec. We previously ran 3 substeps for
// extra stability, but with enableSleeping ON resting marbles cost nothing and
// the velocity/position iteration counts (10/8 on engine create, up from
// default 6/4) make 2 substeps perfectly stable. Net result: 33% less physics
// work per frame, which is most of the mid-race FPS savings.
const SUBSTEPS = 2;
const FIXED_DT = (1000 / 60) / SUBSTEPS; // ~8.33ms per substep

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
    // CRITICAL FOR FPS: bodies that come to rest stop being simulated.
    // Massive win at end-of-race when 5+ marbles have settled into the
    // finish channel — they used to cost 3 substeps × full constraint
    // solving each, despite being motionless.
    enableSleeping: true,
  } as any);
  const world = engine.world;
  const W = track.engineWidth;

  // === WALLS — 50px thick boundaries (avalanche demo: near-zero friction) ===
  // CRITICAL: frictionStatic explicitly set to 0.005 across all static bodies.
  // Matter computes contact static friction as sqrt(a.frictionStatic * b.frictionStatic).
  // Default frictionStatic is 0.5, so even with marble.frictionStatic=0.001
  // the contact static friction was sqrt(0.0005)=0.022 — enough to hold a
  // marble in a V-pocket between a wall and a nearby peg. Setting it to
  // 0.005 on both surfaces drops contact static friction to 0.005, which
  // means any non-zero gravity vector slides the marble out.
  const STATIC_FRICTION = 0.005;
  const totalH = track.totalHeight;
  Matter.Composite.add(world, [
    // Left wall — moderate restitution to bounce marbles back into play
    Matter.Bodies.rectangle(0, totalH / 2, 50, totalH + 200, {
      isStatic: true, friction: 0.01, frictionStatic: STATIC_FRICTION, restitution: 0.2, label: 'wall',
    }),
    // Right wall
    Matter.Bodies.rectangle(W, totalH / 2, 50, totalH + 200, {
      isStatic: true, friction: 0.01, frictionStatic: STATIC_FRICTION, restitution: 0.2, label: 'wall',
    }),
    // Ceiling
    Matter.Bodies.rectangle(W / 2, -25, W + 100, 50, {
      isStatic: true, friction: 0.01, frictionStatic: STATIC_FRICTION, restitution: 0.2, label: 'ceiling',
    }),
    // Floor
    Matter.Bodies.rectangle(W / 2, totalH + 25, W + 100, 50, {
      isStatic: true, friction: 0.3, frictionStatic: 0.3, restitution: 0.1, label: 'floor',
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
          friction: 0.005, frictionStatic: STATIC_FRICTION, restitution: 0.3,
          chamfer: { radius: 4 },
          label: 'ramp',
        }),
      );
    }
  });

  // === BUMPERS & PEGS — bumpers deflect marbles with satisfying kick ===
  // Bumper restitution capped at 0.95 (was 1.2). Above 1.0 each bounce GAINS
  // energy, which makes a marble trapped between a bumper and a wall
  // accelerate to perpetual oscillation — a stuck state that looks chaotic
  // rather than the V-pocket pinch but is the same root problem.
  //
  // GEOMETRIC PINCH REPAIR: a peg/bumper placed so its surface sits between
  // 0 and 1 marble-diameter from a wall creates a STABLE V-pocket. A marble
  // landing in that pocket has both contact normals balanced against
  // gravity and remains motionless regardless of friction. We cannot fix
  // this with physics tuning; only by eliminating the pocket. So before
  // building the bodies we snap any obstacle whose center is in the pinch
  // zone to touch the wall (gap = 0 means the marble bounces off the
  // exposed top of the peg instead of falling into the gap).
  const MARBLE_RADIUS = 11;
  const MARBLE_DIAMETER = MARBLE_RADIUS * 2;
  const WALL_SURFACE_L = 25;       // right edge of left wall (0..50)
  const WALL_SURFACE_R = W - 25;   // left edge of right wall
  const PINCH_BUFFER = 4;          // extra px beyond marble diameter
  const repairedObstacles = track.obstacles.map(o => {
    let x = o.x;
    // Left-wall pinch: surface gap in (0, marbleDiameter + buffer)
    const leftGap = (x - o.r) - WALL_SURFACE_L;
    if (leftGap > 0 && leftGap < MARBLE_DIAMETER + PINCH_BUFFER) {
      x = WALL_SURFACE_L + o.r; // snap to touch the wall
    }
    // Right-wall pinch
    const rightGap = WALL_SURFACE_R - (x + o.r);
    if (rightGap > 0 && rightGap < MARBLE_DIAMETER + PINCH_BUFFER) {
      x = WALL_SURFACE_R - o.r;
    }
    return { ...o, x };
  });
  /* Peg-to-peg pinches: any two pegs whose surface gap is in (0, diameter+buffer)
   * form a horizontal V-pocket. Resolve by snapping the pair to touching
   * (gap = -0.5 px so contact solver treats them as a single static cluster).
   * Iterate twice so 3-peg chains converge. */
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < repairedObstacles.length; i++) {
      for (let j = i + 1; j < repairedObstacles.length; j++) {
        const a = repairedObstacles[i], b = repairedObstacles[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minSafe = a.r + b.r;
        const pinchMax = minSafe + MARBLE_DIAMETER + PINCH_BUFFER;
        if (dist > minSafe && dist < pinchMax) {
          // Pull the smaller-radius peg toward the larger one until touching.
          // (Or split the difference if equal.)
          const target = minSafe - 0.5;
          const need = dist - target;
          const ux = dx / dist, uy = dy / dist;
          if (a.r <= b.r) { a.x += ux * need; a.y += uy * need; }
          else { b.x -= ux * need; b.y -= uy * need; }
        }
      }
    }
  }

  /* Peg-to-ramp-segment pinches: closest distance from peg center to each
   * ramp line segment. If the resulting clearance is in the pinch zone, snap
   * the peg toward the segment until it touches. Ramp thickness = 14 (so
   * segment surface is 7px from the line). Marble radius = 11. */
  const RAMP_HALF_THICKNESS = 7;
  function distPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    const t = Math.max(0, Math.min(1, ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2));
    const cx = ax + t * abx, cy = ay + t * aby;
    return { dist: Math.hypot(px - cx, py - cy), cx, cy };
  }
  for (const obs of repairedObstacles) {
    for (const ramp of track.ramps) {
      for (let s = 0; s < ramp.points.length - 1; s++) {
        const a = ramp.points[s], b = ramp.points[s + 1];
        const { dist, cx, cy } = distPointToSegment(obs.x, obs.y, a.x, a.y, b.x, b.y);
        const minSafe = obs.r + RAMP_HALF_THICKNESS;
        const pinchMax = minSafe + MARBLE_DIAMETER + PINCH_BUFFER;
        if (dist > minSafe && dist < pinchMax) {
          // Move the peg toward the closest point on the segment until touching
          const ux = (obs.x - cx) / dist, uy = (obs.y - cy) / dist;
          obs.x = cx + ux * (minSafe - 0.5);
          obs.y = cy + uy * (minSafe - 0.5);
        }
      }
    }
  }
  // Peg restitution 0.6, bumper restitution 0.8 (was 1.2 → causes perpetual
  // oscillation; was 0.95 → still nearly-elastic so a marble pinned between
  // two bumpers loses energy too slowly to ever stop).
  repairedObstacles.forEach(obs => {
    Matter.Composite.add(world,
      Matter.Bodies.circle(obs.x, obs.y, obs.r, {
        isStatic: true,
        restitution: obs.type === 'bumper' ? 0.8 : 0.6,
        friction: 0.001, frictionStatic: STATIC_FRICTION,
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
        { isStatic: true, angle: Math.atan2(dy, ldx), friction: 0.005, frictionStatic: STATIC_FRICTION, restitution: 0.35, label: 'funnel' },
      ),
    );
    const rdx = f.rightX2 - f.rightX1;
    const rLen = Math.sqrt(rdx * rdx + dy * dy);
    Matter.Composite.add(world,
      Matter.Bodies.rectangle(
        (f.rightX1 + f.rightX2) / 2, (f.y1 + f.y2) / 2, rLen, 12,
        { isStatic: true, angle: Math.atan2(dy, rdx), friction: 0.005, frictionStatic: STATIC_FRICTION, restitution: 0.35, label: 'funnel' },
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
      { isStatic: true, angle: Math.atan2(fdy, fldx), friction: 0.005, frictionStatic: STATIC_FRICTION, restitution: 0.3, label: 'finish-funnel' },
    ),
  );
  const frdx = ff.rightX2 - ff.rightX1;
  const frLen = Math.sqrt(frdx * frdx + fdy * fdy);
  Matter.Composite.add(world,
    Matter.Bodies.rectangle(
      (ff.rightX1 + ff.rightX2) / 2, (ff.y1 + ff.y2) / 2, frLen, 14,
      { isStatic: true, angle: Math.atan2(fdy, frdx), friction: 0.005, frictionStatic: STATIC_FRICTION, restitution: 0.3, label: 'finish-funnel' },
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
      { isStatic: true, angle: Math.atan2(miniH, mlDx), friction: 0.005, frictionStatic: STATIC_FRICTION, restitution: 0.3, label: 'channel-funnel' },
    ),
  );
  // Right mini-funnel wall: from funnel exit right edge → channel right edge
  const mrDx = track.channelRight - funnelExitRight;
  const mrLen = Math.sqrt(mrDx * mrDx + miniH * miniH);
  Matter.Composite.add(world,
    Matter.Bodies.rectangle(
      (funnelExitRight + track.channelRight) / 2, track.finishY + miniH / 2, mrLen, 10,
      { isStatic: true, angle: Math.atan2(miniH, mrDx), friction: 0.005, frictionStatic: STATIC_FRICTION, restitution: 0.3, label: 'channel-funnel' },
    ),
  );
  // Channel walls (below mini-funnel)
  const channelTopY = track.finishY + miniH;
  const channelWallH = track.channelDepth - miniH;
  Matter.Composite.add(world,
    Matter.Bodies.rectangle(track.channelLeft - 5, channelTopY + channelWallH / 2, 10, channelWallH + 20, {
      isStatic: true, friction: 0.005, frictionStatic: STATIC_FRICTION, restitution: 0.2, label: 'channel-wall',
    }),
  );
  Matter.Composite.add(world,
    Matter.Bodies.rectangle(track.channelRight + 5, channelTopY + channelWallH / 2, 10, channelWallH + 20, {
      isStatic: true, friction: 0.005, frictionStatic: STATIC_FRICTION, restitution: 0.2, label: 'channel-wall',
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
      isStatic: true, friction: 0.01, frictionStatic: STATIC_FRICTION, restitution: 0.5,
      label: 'windmill',
    });
    Matter.Composite.add(world, blade);
    wmBodies.push({ body: blade, ...wm });
  });

  // === SWINGING DOORS — hinged blade swinging on a sine wave ===
  // Door's center sits half-length away from the hinge. Each step() we
  // compute the current angle from elapsed + period + phase, then setAngle
  // + setPosition so the door rotates around its hinge endpoint (not its
  // own center, which is what a static body would default to).
  interface SwingDoorBody { body: Matter.Body; config: SwingingDoorConfig }
  const swingDoorBodies: SwingDoorBody[] = [];
  (track.swingingDoors || []).forEach(d => {
    // Body is positioned at its INITIAL center (at rest = baseAngle).
    const cx = d.hingeX + (d.length / 2) * Math.cos(d.baseAngle);
    const cy = d.hingeY + (d.length / 2) * Math.sin(d.baseAngle);
    const body = Matter.Bodies.rectangle(cx, cy, d.length, 6, {
      isStatic: true,
      friction: 0.02, frictionStatic: STATIC_FRICTION,
      restitution: 0.45,
      angle: d.baseAngle,
      label: 'swinging-door',
    });
    Matter.Composite.add(world, body);
    swingDoorBodies.push({ body, config: d });
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
          // Become sensor so marbles pass through — prevents shelf trapping
          trampBody.isSensor = true;
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

      // Haptic feedback for any marble collision (walls, ramps, bumpers, pegs, other marbles, etc.)
      if (onHaptic) {
        const mA = marbleBodies.find(m => m.body === bodyA);
        const mB = marbleBodies.find(m => m.body === bodyB);
        const mEntry = mA || mB;
        if (mEntry) {
          const otherBody = mA ? bodyB : mB ? bodyA : null;
          if (otherBody?.label === 'bumper') onHaptic('bumper', mEntry.data.id);
          else if (otherBody?.label === 'pendulum-bob') onHaptic('pendulum', mEntry.data.id);
          else if (otherBody?.label === 'cradle-bob') onHaptic('cradle', mEntry.data.id);
          else onHaptic('bumper', mEntry.data.id); // any collision = haptic
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
  // Geometric anti-stick: each trampoline gets a tiny tilt (±2°). A flat
  // horizontal trampoline allows a marble to settle on top in stable
  // equilibrium (gravity vs. normal force, no tangent component). With a
  // 2° slope the gravity vector has a horizontal component and marbles
  // always roll off — they cannot remain motionless on the surface.
  // Direction is deterministic from x position so the same track always
  // tilts the same way.
  if (track.trampolines) {
    track.trampolines.forEach(t => {
      const tiltDir = t.x < W / 2 ? 1 : -1; // tilt outward toward nearest wall
      const tilt = tiltDir * (2 * Math.PI / 180); // 2°
      const body = Matter.Bodies.rectangle(t.x, t.y, t.width, 10, {
        isStatic: true,
        angle: tilt,
        restitution: 0.5,
        friction: 0.005, frictionStatic: STATIC_FRICTION,
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
      // CRITICAL: frictionStatic was 0.1. With STATIC_FRICTION=0.005 on
      // every surface above, the contact frictionStatic ended up
      // sqrt(0.1 * 0.005) = 0.022 — still enough to lock a marble in
      // a V-pocket. Dropping marble.frictionStatic to 0.001 takes the
      // contact value to sqrt(0.001 * 0.005) = 0.0022, which is the
      // "marbles slide out of any pinch" zone.
      frictionStatic: 0.001,
      density: 0.001 + marble.stats.power * 0.00005,        // 0.0011-0.00125 — tight around default 0.001
      frictionAir: 0.008 - marble.stats.speed * 0.0005,      // 0.0055-0.0075 — low drag for natural flow, gravity dominates
      label: marble.id,
      collisionFilter: MARBLE_FILTER,
      // Racing marbles must NEVER be put to sleep by Matter — sleeping is
      // an optimization that freezes a body's physics when it stops moving.
      // It looked like the marble was stuck on the track when in fact the
      // engine had paused simulating it. The flag is overridden back to
      // default after the marble crosses the finish line, so finished
      // marbles still get the perf win once they settle in their slot.
      sleepThreshold: Infinity,
    } as any);
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
  // Finish-rank counter — increments as each marble crosses finishY so we can
  // snap that marble to its numbered slot (1st = bottom slot, 8th = top slot).
  let finishRankCounter = 0;

  /* Doomsday bar — sweeps stragglers so the race never drags.
   *
   * The spawn time is always clamped to a 40-50s window:
   *   - NEVER before MIN (40s) — earlier felt abrupt; a 30s spawn was
   *     reported as "too early".
   *   - As soon as the race is decided after the 40s floor (first
   *     marble finished POST_FINISH_GRACE ago), spawn — don't make the
   *     player watch a stuck marble.
   *   - NEVER after MAX (50s) — spawn regardless once 50s is reached.
   * Net: a decided race gets the bar at 40s; a genuinely close race
   * gets it by 50s. Deadline is the hard force-finish cutoff. */
  const DOOMSDAY_MIN_TRIGGER_MS = 40000;  // floor — never spawn before this
  const DOOMSDAY_MAX_TRIGGER_MS = 50000;  // ceiling — always spawn by this
  const DOOMSDAY_POST_FINISH_GRACE_MS = 12000;
  const DOOMSDAY_SWEEP_MS = 9000;       // fixed sweep time once the bar spawns
  const DOOMSDAY_DEADLINE_MS = 70000;   // hard cutoff — force-finish anyone left
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
    /* Spawn window clamped to 40-50s: never before the 40s floor;
     * once past it, spawn as soon as the race is decided (first finish
     * + grace) or when the 50s ceiling is hit, whichever comes first. */
    const pastFloor = elapsed >= DOOMSDAY_MIN_TRIGGER_MS;
    const pastCeiling = elapsed >= DOOMSDAY_MAX_TRIGGER_MS;
    const raceDecided =
      firstFinishTime > 0 &&
      elapsed - firstFinishTime >= DOOMSDAY_POST_FINISH_GRACE_MS;
    const shouldSpawnDoomsday = pastFloor && (pastCeiling || raceDecided);
    if (!doomsdayBarActive && shouldSpawnDoomsday && unfinishedMarbles.length > 0) {
      let highestY = Infinity;
      for (const { body } of unfinishedMarbles) {
        if (body.position.y < highestY) highestY = body.position.y;
      }
      doomsdayBarStartY = highestY - 100;
      doomsdayBarStartTime = elapsed;
      doomsdayBarEndY = track.finishY + 50;
      /* Fixed sweep duration, NOT (deadline - elapsed). Tying it to the
       * deadline meant an early-spawned bar crept down over 30-40s —
       * defeating the point. A fixed ~9s sweep wraps the race up
       * promptly no matter when the bar appears. */
      doomsdayBarDuration = DOOMSDAY_SWEEP_MS;

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

    // Move doomsday bar + apply downward sweep force to all unfinished marbles.
    //
    // Previously the bar relied on collision alone to push marbles down. That
    // failed in two ways:
    //   1. The bar is `isStatic` and moves via setPosition. When it teleports
    //      into a marble's position, Matter resolves by the *shortest*
    //      separation vector — which often points UP. The marble ended up
    //      ABOVE the bar and never got swept.
    //   2. Per-step displacement (~2-3 px) is less than the marble radius, so
    //      collision resolution is jittery / "clunky" feeling.
    //
    // Now: the bar is still visible (and still collides), but the actual
    // sweep mechanism is a velocity floor applied to every unfinished marble
    // whose Y is at or above the bar's leading edge. Marbles cannot escape
    // upward because we directly write Y velocity each frame.
    if (doomsdayBarActive && doomsdayBar) {
      const progress = Math.min(1, (elapsed - doomsdayBarStartTime) / Math.max(doomsdayBarDuration, 1));
      const newY = doomsdayBarStartY + progress * (doomsdayBarEndY - doomsdayBarStartY);
      if (newY >= track.finishY + 50) {
        Matter.Composite.remove(world, doomsdayBar);
        doomsdayBar = null;
        doomsdayBarActive = false;
      } else {
        Matter.Body.setPosition(doomsdayBar, { x: W / 2, y: newY });

        // No force here — the collision push from the static bar handles
        // moving marbles down. The escape-upward failure mode is handled in
        // a post-physics snap-back below.
      }
    }

    // Time accumulator — run physics at fixed 60fps regardless of screen refresh rate
    // On 120Hz screens, only every other frame advances physics (prevents 2x speed bug).
    //
    // Windmill rotation lives INSIDE this gate so it stays in lockstep with
    // physics — a previous attempt to rotate every render frame (for 120Hz
    // smoothness) caused the scrambler windmill to push marbles unpredictably
    // at race start. The visible smoothness comes from the SharedValue render
    // path consuming the angle every frame, not from rotating more often.
    physicsAccumulator += _dt;
    while (physicsAccumulator >= FRAME_DT) {
      wmBodies.forEach(wm => {
        Matter.Body.setAngle(wm.body, wm.body.angle + wm.speed);
      });
      // Swinging doors — sine-wave angle around their hinge. Body has to
      // be both rotated AND repositioned because the rotation pivot is
      // the hinge endpoint, not the body's own center.
      swingDoorBodies.forEach(d => {
        const t = (elapsed + (d.config.phase ?? 0)) / d.config.periodMs;
        const angle = d.config.baseAngle + Math.sin(t * Math.PI * 2) * d.config.arc;
        const cx = d.config.hingeX + (d.config.length / 2) * Math.cos(angle);
        const cy = d.config.hingeY + (d.config.length / 2) * Math.sin(angle);
        Matter.Body.setPosition(d.body, { x: cx, y: cy });
        Matter.Body.setAngle(d.body, angle);
      });
      for (let s = 0; s < SUBSTEPS; s++) {
        Matter.Engine.update(engine, FIXED_DT);
      }
      physicsAccumulator -= FRAME_DT;
    }

    // Post-physics: if the doomsday bar pushed a marble UPWARD, snap it back
    // below the bar and zero any upward velocity. Only triggers when the
    // marble is barely above the bar (within 1 marble diameter) so it can't
    // teleport a marble that was legitimately bouncing high — and only zeros
    // upward velocity rather than firing a strong downward push, to avoid
    // any visual "warp" through obstacles.
    if (doomsdayBarActive && doomsdayBar) {
      const barLeadingEdge = doomsdayBar.position.y - DOOMSDAY_BAR_HEIGHT / 2;
      const MARBLE_R_LOCAL = 14;
      const MAX_SNAP_DISTANCE = MARBLE_R_LOCAL * 2; // 28px — never teleport more than this
      for (const { body, data } of marbleBodies) {
        if (finishTimes[data.id]) continue;
        const topOfMarble = body.position.y - MARBLE_R_LOCAL;
        const overshoot = barLeadingEdge - topOfMarble;
        if (overshoot > 0 && overshoot <= MAX_SNAP_DISTANCE) {
          Matter.Body.setPosition(body, {
            x: body.position.x,
            y: barLeadingEdge + MARBLE_R_LOCAL + 1,
          });
          if (body.velocity.y < 0) {
            Matter.Body.setVelocity(body, { x: body.velocity.x, y: 0 });
          }
        }
      }
    }

    // Post-step marble processing
    const MAX_SPEED = 15; // velocity cap — higher for natural flow with low air friction
    const SLOT_H = 26;    // slot height in engine units, matches trackVisuals.slotH = ex(26)
    marbleBodies.forEach(({ body, data }) => {
      // Finished marbles run on PURE physics from here — gravity pulls them
      // down, shelves catch them, marble-marble collisions stack the column.
      // No teleporting, no x-snap. Just a soft velocity cap on the downward
      // component so they don't tunnel through shelves at top speed.
      if (finishTimes[data.id]) {
        const vy = body.velocity.y;
        if (vy > 10) Matter.Body.setVelocity(body, { x: body.velocity.x, y: 10 });
        return;
      }

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

      // No stuck-kick. Marbles can't sleep (sleepThreshold = Infinity), so
      // physics keeps simulating them every frame regardless of velocity.
      // If they're slow, they're slow because of geometry — not because the
      // engine froze them. Truly stuck marbles are now structurally
      // impossible without an external safety net.

      // Finish detection. Marble crossed finishY — record the time and increment
      // the rank counter. CRUCIALLY: no setPosition, no setStatic, no x-snap.
      // We spawn a horizontal "shelf" body inside the channel at the floor of
      // this marble's slot; gravity carries the marble down to land on it.
      // The earlier teleport-snap looked ghosty because the body's x jumped
      // 10-15px instantly when it crossed. Now it's pure physics start to end.
      if (body.position.y >= track.finishY) {
        const overshoot = body.position.y - track.finishY;
        const vyAbs = Math.max(Math.abs(body.velocity.y), 0.1);
        finishTimes[data.id] = elapsed - (overshoot / vyAbs);
        if (!firstFinishTime) firstFinishTime = finishTimes[data.id];
        finishRankCounter++;
        const rank = finishRankCounter;

        // Lighter damping than before — enough so marbles don't bounce
        // forever in the channel, but not so much that they look slow-mo.
        body.frictionAir = 0.05;
        body.restitution = 0.1;
        body.friction = 0.3;
        // Re-enable sleeping for finished marbles — once they settle in their
        // slot the perf cost of simulating them adds up across 8 marbles
        // sitting motionless. They've already crossed the line so freezing
        // them is fine. Racing marbles still have sleepThreshold = Infinity.
        (body as any).sleepThreshold = 60;

        // Rank 1 lands on the existing channel-floor — no extra shelf needed.
        // Ranks 2..N each get a static shelf placed at the floor of their slot,
        // which is the TOP of the slot below. The shelf catches them before
        // they collide with the previous finisher.
        if (rank >= 2) {
          const shelfY = track.finishY + track.channelDepth - (rank - 1) * SLOT_H;
          const shelf = Matter.Bodies.rectangle(
            track.channelCX, shelfY,
            track.channelRight - track.channelLeft, 3,
            { isStatic: true, friction: 0.6, restitution: 0, label: 'slot-shelf' },
          );
          Matter.Composite.add(world, shelf);
        }
      }
    });

    const finishedCount = Object.keys(finishTimes).length;
    const isFinished = finishedCount >= totalMarbleCount || elapsed > DOOMSDAY_DEADLINE_MS;
    if (isFinished) {
      // Doomsday fallback. Rank remaining marbles by current Y (closer to the
      // finish = better rank). Drop each one into the channel above the stack
      // and add its shelf so the stack completes cleanly. Stragglers DO get
      // teleported here — they got stuck somewhere upstream, so there's no
      // meaningful "natural" finish for them. The organic path above is pure
      // physics; this is only for the timeout case.
      const SLOT_H_DOOMSDAY = 26;
      const unfinished = marbleBodies
        .filter(mb => !finishTimes[mb.data.id])
        .sort((a, b) => b.body.position.y - a.body.position.y);
      unfinished.forEach(({ data, body }) => {
        finishTimes[data.id] = elapsed + (track.finishY - body.position.y) * 8;
        finishRankCounter++;
        const rank = finishRankCounter;
        if (rank >= 2) {
          const shelfY = track.finishY + track.channelDepth - (rank - 1) * SLOT_H_DOOMSDAY;
          const shelf = Matter.Bodies.rectangle(
            track.channelCX, shelfY,
            track.channelRight - track.channelLeft, 3,
            { isStatic: true, friction: 0.6, restitution: 0, label: 'slot-shelf' },
          );
          Matter.Composite.add(world, shelf);
        }
        // Drop the marble just above the channel top so it falls onto its shelf.
        const dropY = track.finishY + 12;
        Matter.Body.setPosition(body, { x: track.channelCX, y: dropY });
        Matter.Body.setVelocity(body, { x: 0, y: 1 });
        Matter.Body.setAngularVelocity(body, 0);
        body.frictionAir = 0.05;
        body.restitution = 0.1;
        body.friction = 0.3;
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
      swingingDoors: swingDoorBodies.map(d => ({
        hingeX: d.config.hingeX, hingeY: d.config.hingeY,
        length: d.config.length, angle: d.body.angle,
      })),
      doomsdayBar: doomsdayBarActive && doomsdayBar
        ? { y: doomsdayBar.position.y, active: true }
        : null,
    };
  }

  function getPositions(): { marble: MarbleData; time: number }[] {
    // Primary sort: finishTime (lower = finished earlier).
    // Tiebreakers (in order) for marbles with identical times:
    //  1. body.position.y DESC — further past finishY = ahead
    //  2. body.position.x — leftmost in the finish channel = ahead (deterministic)
    //  3. marble.id — final deterministic fallback
    // This guarantees a stable, deterministic order even if physics produces identical finishTimes.
    return marbleBodies
      .map(({ data, body }) => ({
        marble: data,
        time: finishTimes[data.id] || elapsed + (track.finishY - body.position.y) * 8,
        _y: body.position.y,
        _x: body.position.x,
      }))
      .sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        if (a._y !== b._y) return b._y - a._y;
        if (a._x !== b._x) return a._x - b._x;
        return a.marble.id.localeCompare(b.marble.id);
      })
      .map(({ marble, time }) => ({ marble, time }));
  }

  function destroy() { Matter.Engine.clear(engine); }
  // Expose the marbles in the engine's internal (shuffled) order so the renderer
  // can match each visual index to the correct marble identity. Without this,
  // marble colors get drawn at the wrong physics positions and the leaderboard
  // looks inconsistent with the on-screen marbles.
  const marbles = marbleBodies.map(({ data }) => data);

  // Pure read of all static (non-animated) element configs. No side effects —
  // safe to call before the race starts. The renderer captures this once and
  // uses it for the lifetime of the race, with SharedValues driving animation.
  function getStaticConfig() {
    return {
      windmills: wmBodies.map(wm => ({ x: wm.x, y: wm.y, width: wm.width })),
      pendulums: pendulumBobs.map(p => ({
        anchorX: p.config.anchorX, anchorY: p.config.anchorY, bobRadius: p.config.bobRadius,
      })),
      cradles: cradleBobs.map(c => ({
        anchorX: c.anchorX, anchorY: c.anchorY, bobRadius: c.ballRadius,
      })),
      ballPitRadii: pitBallBodies.map(b => b.r),
      trampolines: trampolineBodies.map(t => ({
        x: t.config.x, y: t.config.y, width: t.config.width,
      })),
      speedBursts: speedBurstBodies.map(sb => ({
        x: sb.config.x, y: sb.config.y, width: sb.config.width, direction: sb.config.direction,
      })),
    };
  }

  return { step, getPositions, destroy, releaseGate, track, marbles, getStaticConfig };
}
