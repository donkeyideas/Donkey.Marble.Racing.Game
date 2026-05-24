/**
 * Rapier 2D race engine — Stages 2 + 3 implementation.
 *
 * Public surface mirrors engine/race.ts so app/race.tsx can swap between
 * implementations with the USE_RAPIER flag in engineConfig.ts.
 *
 * Implemented in this file:
 *   - Stage 1: World + walls + marbles + gravity + finish detection
 *   - Stage 2: Ramps, bumpers, pegs (with pinch-repair), funnels, finish
 *              funnel, mini-funnel, channel walls + floor
 *   - Stage 3: Springs (sensor + force on contact), trampolines (solid +
 *              max-bounce cap + force kick), speed bursts (sensor +
 *              randomized directional force), doomsday bar (static
 *              repositioned + upward-escape snap-back), kinematic
 *              windmills, kinematic swinging doors
 *
 * Pending stages:
 *   - Stage 4: Joints — pendulums, cradles, ball pit
 *   - Stage 5: Full telemetry + stuck-marble kick + slot-shelf spawning
 *              on finish (currently the basic finish detection works but
 *              the visual stack of finished marbles isn't built)
 *
 * Tuning notes:
 *   - Gravity = 600 (Rapier m/s² scaled for pixel coords). Empirical match
 *     to Matter.js gravity.y=1.0 visual fall speed pending on-device test.
 *   - Marble restitution + friction + damping mirror Matter values directly.
 *     Rapier's contact-friction-from-product semantics differ from Matter's
 *     sqrt() but with our near-zero values the difference is below the
 *     human-perceptible threshold.
 */

import type { MarbleData } from '../theme';
import { setRapierReady } from './engineConfig';
import {
  buildClassicZigzag,
  type TrackConfig,
} from './tracks';
import type {
  RaceState,
  MarbleTelemetry,
  RaceEngineOptions,
} from './race';

// Type-only imports — runtime module is loaded async via initRapierEngine().
type RapierModule = typeof import('@dimforge/rapier2d-compat');
type RWorld = import('@dimforge/rapier2d-compat').World;
type RBody = import('@dimforge/rapier2d-compat').RigidBody;
type RCollider = import('@dimforge/rapier2d-compat').Collider;

let RAPIER: RapierModule | null = null;

/**
 * Initialize the Rapier module. Must be called once before any
 * createRaceEngineRapier() call. Safe to call repeatedly — second+ calls
 * are no-ops. Idempotent.
 */
export async function initRapierEngine(): Promise<void> {
  if (RAPIER) return;
  const mod = await import('@dimforge/rapier2d-compat');
  await mod.init();
  RAPIER = mod;
  setRapierReady(true);
}

const ENGINE_WIDTH = 400;
const SUBSTEPS = 2;
const FIXED_DT = (1000 / 60) / SUBSTEPS;
const FRAME_DT = 1000 / 60;

/* World scale: Rapier's units are meters, Matter.js's are pixels. The
 * Matter.js tracks use pixel coordinates. We keep the same coordinate
 * space and scale gravity to match Matter.js's visual fall speed.
 *
 * Empirical: at GRAVITY_BASE=600 classic-zigzag took ~58s (vs Matter's
 * ~30s baseline). Doubling to 1200 puts the Rapier acceleration in the
 * same ballpark as Matter's Verlet integration with gravity.y=1.0,
 * gravityScale=0.001 over the substep cadence. Further tuning per-track
 * is expected during the validation run. */
const GRAVITY_BASE = 1200;
const MARBLE_RADIUS = 11;
const MARBLE_DIAMETER = MARBLE_RADIUS * 2;
const STATIC_FRICTION = 0.005;
const RAMP_THICKNESS = 14;

// Collision membership / filter bits. Rapier encodes both into a single
// u32 InteractionGroups; we build helpers below to keep the call sites
// readable. The bit assignments mirror engine/race.ts.
const CAT_WALL     = 0x0001;
const CAT_MARBLE   = 0x0002;
const CAT_OBSTACLE = 0x0004;
const CAT_DOOMSDAY = 0x0008;

function groups(membership: number, filter: number): number {
  return (membership << 16) | filter;
}

const WALL_GROUPS     = groups(CAT_WALL,     CAT_MARBLE | CAT_OBSTACLE | CAT_DOOMSDAY);
const MARBLE_GROUPS   = groups(CAT_MARBLE,   CAT_WALL | CAT_MARBLE | CAT_OBSTACLE | CAT_DOOMSDAY);
const OBSTACLE_GROUPS = groups(CAT_OBSTACLE, CAT_WALL | CAT_MARBLE);
const DOOMSDAY_GROUPS = groups(CAT_DOOMSDAY, CAT_MARBLE);

export function createRaceEngineRapier(
  configOrOpts?: TrackConfig | RaceEngineOptions,
  raceMarbles?: MarbleData[],
): {
  step: (dt: number) => RaceState;
  getPositions: () => { marble: MarbleData; time: number }[];
  getTelemetry: () => MarbleTelemetry[];
  destroy: () => void;
  releaseGate: () => void;
  track: TrackConfig;
  marbles: MarbleData[];
  getStaticConfig: () => {
    windmills: { x: number; y: number; width: number }[];
    pendulums: { anchorX: number; anchorY: number; bobRadius: number }[];
    cradles: { anchorX: number; anchorY: number; bobRadius: number }[];
    ballPitRadii: number[];
    trampolines: { x: number; y: number; width: number }[];
    speedBursts: { x: number; y: number; width: number; direction: 'left' | 'right' }[];
  };
} {
  if (!RAPIER) {
    throw new Error(
      'Rapier not initialized — call initRapierEngine() at app boot before creating a race engine. ' +
      'If this fires in production, the engineConfig dispatcher should have fallen back to Matter.js.',
    );
  }
  const R = RAPIER; // narrowed alias for the rest of the closure

  // Discriminate by presence of a track-shape field (`ramps`). The options
  // object never carries that; the TrackConfig always does. Pre-fix the
  // detection used only `'onHaptic' in configOrOpts` which misfired when
  // callers passed `{ config, raceMarbles }` without onHaptic — the else
  // branch then treated the whole options object as a track, blowing up
  // on `track.ramps.forEach`.
  let opts: RaceEngineOptions;
  const isTrackShape = configOrOpts && typeof configOrOpts === 'object'
    && 'ramps' in configOrOpts;
  if (configOrOpts && !isTrackShape) {
    opts = configOrOpts as RaceEngineOptions;
    if (!opts.raceMarbles && raceMarbles) opts.raceMarbles = raceMarbles;
  } else {
    opts = { config: configOrOpts as TrackConfig | undefined, raceMarbles };
  }
  const onHaptic = opts.onHaptic;
  const config = opts.config;
  raceMarbles = opts.raceMarbles ?? raceMarbles ?? [];
  const track = config || buildClassicZigzag();
  const W = track.engineWidth;
  const totalH = track.totalHeight;

  // World gravity respects per-track gravity (avalanche-tuned tracks set
  // 0.95-1.05). We scale by GRAVITY_BASE so Matter values translate.
  const world: RWorld = new R.World({ x: 0, y: GRAVITY_BASE * (track.gravity?.y ?? 1.0) });

  // Event queue captures contact-start events each step for sensor handling.
  const eventQueue = new R.EventQueue(true);

  // Reusable static body — Rapier needs a body per collider but you can
  // share one fixed body for many colliders. We attach all immovable
  // colliders (walls, ramps, pegs, bumpers, funnels, channel) to this
  // single body so the world has fewer rigid bodies to iterate.
  const staticDesc = R.RigidBodyDesc.fixed().setTranslation(0, 0);
  const staticBody: RBody = world.createRigidBody(staticDesc);

  /* Map each collider HANDLE -> a label string. Rapier doesn't have
   * Matter's body.label concept, but the event queue gives us collider
   * handles so we look up labels here when a contact event fires. Keeps
   * sensor/trampoline/speedburst routing fast (O(1) lookup) without
   * iterating arrays. */
  const labelOf = new Map<number, string>();
  function tag(collider: RCollider, label: string): RCollider {
    labelOf.set(collider.handle, label);
    return collider;
  }

  // === WALLS ===
  {
    // Left wall — centered at x=0, extends 25px each side of x=0 inward.
    // Matter version: rectangle(0, totalH/2, 50, totalH+200). To match the
    // INSIDE surface position we put the cuboid center at x=-25 so the
    // right face sits at x=0.
    const halfWallThick = 25;
    const halfWallHeight = (totalH + 200) / 2;
    tag(world.createCollider(
      R.ColliderDesc.cuboid(halfWallThick, halfWallHeight)
        .setTranslation(-halfWallThick, totalH / 2)
        .setFriction(0.01)
        .setRestitution(0.2)
        .setCollisionGroups(WALL_GROUPS),
      staticBody,
    ), 'wall');
    // Right wall — center at x=W+25 so left face sits at x=W
    tag(world.createCollider(
      R.ColliderDesc.cuboid(halfWallThick, halfWallHeight)
        .setTranslation(W + halfWallThick, totalH / 2)
        .setFriction(0.01)
        .setRestitution(0.2)
        .setCollisionGroups(WALL_GROUPS),
      staticBody,
    ), 'wall');
    // Ceiling — center at y=-25 (above visible area)
    tag(world.createCollider(
      R.ColliderDesc.cuboid((W + 100) / 2, halfWallThick)
        .setTranslation(W / 2, -halfWallThick)
        .setFriction(0.01)
        .setRestitution(0.2)
        .setCollisionGroups(WALL_GROUPS),
      staticBody,
    ), 'ceiling');
    // Floor — well below finish
    tag(world.createCollider(
      R.ColliderDesc.cuboid((W + 100) / 2, halfWallThick)
        .setTranslation(W / 2, totalH + halfWallThick)
        .setFriction(0.3)
        .setRestitution(0.1)
        .setCollisionGroups(WALL_GROUPS),
      staticBody,
    ), 'floor');
  }

  // === RAMPS ===
  track.ramps.forEach((ramp) => {
    for (let j = 0; j < ramp.points.length - 1; j++) {
      const a = ramp.points[j];
      const b = ramp.points[j + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      tag(world.createCollider(
        R.ColliderDesc.cuboid((len + 6) / 2, RAMP_THICKNESS / 2)
          .setTranslation((a.x + b.x) / 2, (a.y + b.y) / 2)
          .setRotation(angle)
          .setFriction(0.005)
          .setRestitution(0.3)
          .setCollisionGroups(WALL_GROUPS),
        staticBody,
      ), 'ramp');
    }
  });

  // === BUMPERS & PEGS with pinch-repair ===
  // Pinch-repair logic is pure JS — direct port of engine/race.ts geometry
  // pass. Same wall surfaces, same buffer, same iteration.
  const WALL_SURFACE_L = 25;
  const WALL_SURFACE_R = W - 25;
  const PINCH_BUFFER = 4;
  const repairedObstacles = track.obstacles.map((o) => {
    let x = o.x;
    const leftGap = (x - o.r) - WALL_SURFACE_L;
    if (leftGap > 0 && leftGap < MARBLE_DIAMETER + PINCH_BUFFER) {
      x = WALL_SURFACE_L + o.r;
    }
    const rightGap = WALL_SURFACE_R - (x + o.r);
    if (rightGap > 0 && rightGap < MARBLE_DIAMETER + PINCH_BUFFER) {
      x = WALL_SURFACE_R - o.r;
    }
    return { ...o, x };
  });

  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < repairedObstacles.length; i++) {
      for (let j = i + 1; j < repairedObstacles.length; j++) {
        const a = repairedObstacles[i];
        const b = repairedObstacles[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minSafe = a.r + b.r;
        const pinchMax = minSafe + MARBLE_DIAMETER + PINCH_BUFFER;
        if (dist > minSafe && dist < pinchMax) {
          const target = minSafe - 0.5;
          const need = dist - target;
          const ux = dx / dist;
          const uy = dy / dist;
          if (a.r <= b.r) { a.x += ux * need; a.y += uy * need; }
          else { b.x -= ux * need; b.y -= uy * need; }
        }
      }
    }
  }

  const RAMP_HALF_THICKNESS = 7;
  for (const obs of repairedObstacles) {
    for (const ramp of track.ramps) {
      for (let s = 0; s < ramp.points.length - 1; s++) {
        const a = ramp.points[s];
        const b = ramp.points[s + 1];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const apx = obs.x - a.x;
        const apy = obs.y - a.y;
        const ab2 = abx * abx + aby * aby;
        const t = Math.max(0, Math.min(1, ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2));
        const cx = a.x + t * abx;
        const cy = a.y + t * aby;
        const dist = Math.hypot(obs.x - cx, obs.y - cy);
        const minSafe = obs.r + RAMP_HALF_THICKNESS;
        const pinchMax = minSafe + MARBLE_DIAMETER + PINCH_BUFFER;
        if (dist > minSafe && dist < pinchMax) {
          const ux = (obs.x - cx) / dist;
          const uy = (obs.y - cy) / dist;
          obs.x = cx + ux * (minSafe - 0.5);
          obs.y = cy + uy * (minSafe - 0.5);
        }
      }
    }
  }

  repairedObstacles.forEach((obs) => {
    tag(world.createCollider(
      R.ColliderDesc.ball(obs.r)
        .setTranslation(obs.x, obs.y)
        .setFriction(0.001)
        .setRestitution(obs.type === 'bumper' ? 0.8 : 0.6)
        .setCollisionGroups(groups(CAT_WALL, CAT_MARBLE | CAT_OBSTACLE)),
      staticBody,
    ), obs.type);
  });

  // === FUNNEL WALLS ===
  track.funnels.forEach((f) => {
    const dy = f.y2 - f.y1;
    const ldx = f.leftX2 - f.leftX1;
    const lLen = Math.sqrt(ldx * ldx + dy * dy);
    tag(world.createCollider(
      R.ColliderDesc.cuboid(lLen / 2, 6)
        .setTranslation((f.leftX1 + f.leftX2) / 2, (f.y1 + f.y2) / 2)
        .setRotation(Math.atan2(dy, ldx))
        .setFriction(0.005)
        .setRestitution(0.35)
        .setCollisionGroups(WALL_GROUPS),
      staticBody,
    ), 'funnel');
    const rdx = f.rightX2 - f.rightX1;
    const rLen = Math.sqrt(rdx * rdx + dy * dy);
    tag(world.createCollider(
      R.ColliderDesc.cuboid(rLen / 2, 6)
        .setTranslation((f.rightX1 + f.rightX2) / 2, (f.y1 + f.y2) / 2)
        .setRotation(Math.atan2(dy, rdx))
        .setFriction(0.005)
        .setRestitution(0.35)
        .setCollisionGroups(WALL_GROUPS),
      staticBody,
    ), 'funnel');
  });

  // === FINISH ZONE ===
  const ff = track.finishFunnel;
  const fdy = ff.y2 - ff.y1;
  const fldx = ff.leftX2 - ff.leftX1;
  const flLen = Math.sqrt(fldx * fldx + fdy * fdy);
  tag(world.createCollider(
    R.ColliderDesc.cuboid(flLen / 2, 7)
      .setTranslation((ff.leftX1 + ff.leftX2) / 2, (ff.y1 + ff.y2) / 2)
      .setRotation(Math.atan2(fdy, fldx))
      .setFriction(0.005)
      .setRestitution(0.3)
      .setCollisionGroups(WALL_GROUPS),
    staticBody,
  ), 'finish-funnel');
  const frdx = ff.rightX2 - ff.rightX1;
  const frLen = Math.sqrt(frdx * frdx + fdy * fdy);
  tag(world.createCollider(
    R.ColliderDesc.cuboid(frLen / 2, 7)
      .setTranslation((ff.rightX1 + ff.rightX2) / 2, (ff.y1 + ff.y2) / 2)
      .setRotation(Math.atan2(fdy, frdx))
      .setFriction(0.005)
      .setRestitution(0.3)
      .setCollisionGroups(WALL_GROUPS),
    staticBody,
  ), 'finish-funnel');

  // Mini-funnel between funnel exit and channel
  const miniH = track.miniFunnelH;
  const funnelExitLeft = ff.leftX2;
  const funnelExitRight = ff.rightX2;
  const mlDx = track.channelLeft - funnelExitLeft;
  const mlLen = Math.sqrt(mlDx * mlDx + miniH * miniH);
  tag(world.createCollider(
    R.ColliderDesc.cuboid(mlLen / 2, 5)
      .setTranslation((funnelExitLeft + track.channelLeft) / 2, track.finishY + miniH / 2)
      .setRotation(Math.atan2(miniH, mlDx))
      .setFriction(0.005)
      .setRestitution(0.3)
      .setCollisionGroups(WALL_GROUPS),
    staticBody,
  ), 'channel-funnel');
  const mrDx = track.channelRight - funnelExitRight;
  const mrLen = Math.sqrt(mrDx * mrDx + miniH * miniH);
  tag(world.createCollider(
    R.ColliderDesc.cuboid(mrLen / 2, 5)
      .setTranslation((funnelExitRight + track.channelRight) / 2, track.finishY + miniH / 2)
      .setRotation(Math.atan2(miniH, mrDx))
      .setFriction(0.005)
      .setRestitution(0.3)
      .setCollisionGroups(WALL_GROUPS),
    staticBody,
  ), 'channel-funnel');

  // Channel walls (below mini-funnel)
  const channelTopY = track.finishY + miniH;
  const channelWallH = track.channelDepth - miniH;
  tag(world.createCollider(
    R.ColliderDesc.cuboid(5, (channelWallH + 20) / 2)
      .setTranslation(track.channelLeft - 5, channelTopY + channelWallH / 2)
      .setFriction(0.005)
      .setRestitution(0.2)
      .setCollisionGroups(WALL_GROUPS),
    staticBody,
  ), 'channel-wall');
  tag(world.createCollider(
    R.ColliderDesc.cuboid(5, (channelWallH + 20) / 2)
      .setTranslation(track.channelRight + 5, channelTopY + channelWallH / 2)
      .setFriction(0.005)
      .setRestitution(0.2)
      .setCollisionGroups(WALL_GROUPS),
    staticBody,
  ), 'channel-wall');
  // Channel floor
  tag(world.createCollider(
    R.ColliderDesc.cuboid((track.channelRight - track.channelLeft + 20) / 2, 7)
      .setTranslation(track.channelCX, track.finishY + track.channelDepth + 10)
      .setFriction(0.5)
      .setRestitution(0.1)
      .setCollisionGroups(WALL_GROUPS),
    staticBody,
  ), 'channel-floor');

  // === WINDMILLS — kinematic-position bodies, rotated each frame ===
  interface WMBody {
    body: RBody;
    x: number;
    y: number;
    width: number;
    speed: number;
    angle: number;
  }
  const wmBodies: WMBody[] = [];
  track.windmillConfigs.forEach((wm) => {
    // Kinematic-position-based body: we directly set its angle each frame
    // and Rapier interpolates velocity for correct collision response.
    const bodyDesc = R.RigidBodyDesc.kinematicPositionBased().setTranslation(wm.x, wm.y);
    const body = world.createRigidBody(bodyDesc);
    tag(world.createCollider(
      R.ColliderDesc.cuboid(wm.width / 2, 4)
        .setFriction(0.01)
        .setRestitution(0.5)
        .setCollisionGroups(WALL_GROUPS),
      body,
    ), 'windmill');
    wmBodies.push({ body, x: wm.x, y: wm.y, width: wm.width, speed: wm.speed, angle: 0 });
  });

  // === SWINGING DOORS — kinematic, sin-wave angle around hinge ===
  interface SwingDoorBody {
    body: RBody;
    hingeX: number;
    hingeY: number;
    length: number;
    baseAngle: number;
    arc: number;
    periodMs: number;
    phase: number;
  }
  const swingDoorBodies: SwingDoorBody[] = [];
  (track.swingingDoors || []).forEach((d) => {
    const cx = d.hingeX + (d.length / 2) * Math.cos(d.baseAngle);
    const cy = d.hingeY + (d.length / 2) * Math.sin(d.baseAngle);
    const bodyDesc = R.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(cx, cy)
      .setRotation(d.baseAngle);
    const body = world.createRigidBody(bodyDesc);
    tag(world.createCollider(
      R.ColliderDesc.cuboid(d.length / 2, 3)
        .setFriction(0.02)
        .setRestitution(0.45)
        .setCollisionGroups(WALL_GROUPS),
      body,
    ), 'swinging-door');
    swingDoorBodies.push({
      body,
      hingeX: d.hingeX,
      hingeY: d.hingeY,
      length: d.length,
      baseAngle: d.baseAngle,
      arc: d.arc,
      periodMs: d.periodMs,
      phase: d.phase ?? 0,
    });
  });

  // === SPRINGS — sensors, gentle redirect force on contact ===
  interface SpringBody { collider: RCollider; x: number; y: number; w: number; h: number }
  const springBodies: SpringBody[] = [];
  track.springs.forEach((sp) => {
    const desc = R.ColliderDesc.cuboid(sp.w / 2, sp.h / 2)
      .setTranslation(sp.x, sp.y)
      .setSensor(true)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
      .setCollisionGroups(WALL_GROUPS);
    const col = world.createCollider(desc, staticBody);
    tag(col, 'spring');
    springBodies.push({ collider: col, x: sp.x, y: sp.y, w: sp.w, h: sp.h });
  });

  // === TRAMPOLINES — solid bodies with restitution + force kick on contact ===
  interface TrampolineBody {
    collider: RCollider;
    config: import('./race').TrampolineState extends infer T ? T : never;
    x: number;
    y: number;
    width: number;
    strength: number;
    bounceCount: number;
    nowSensor: boolean;
  }
  const trampolineBodies: TrampolineBody[] = [];
  const MAX_TRAMP_BOUNCES = 5;
  if (track.trampolines) {
    track.trampolines.forEach((t) => {
      const tiltDir = t.x < W / 2 ? 1 : -1;
      const tilt = tiltDir * (2 * Math.PI / 180);
      const desc = R.ColliderDesc.cuboid(t.width / 2, 5)
        .setTranslation(t.x, t.y)
        .setRotation(tilt)
        .setFriction(0.005)
        .setRestitution(0.5)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
        .setCollisionGroups(WALL_GROUPS);
      const col = world.createCollider(desc, staticBody);
      tag(col, 'trampoline');
      trampolineBodies.push({
        collider: col,
        config: t as any,
        x: t.x,
        y: t.y,
        width: t.width,
        strength: t.strength ?? 5,
        bounceCount: 0,
        nowSensor: false,
      });
    });
  }

  // === SPEED BURSTS — sensors, randomized directional boost ===
  interface SpeedBurstBody {
    collider: RCollider;
    x: number;
    y: number;
    width: number;
    direction: 'left' | 'right' | 'down';
    activationChance: number;
    activeUntil: number;
  }
  const speedBurstBodies: SpeedBurstBody[] = [];
  if (track.speedBursts) {
    track.speedBursts.forEach((sb) => {
      const desc = R.ColliderDesc.cuboid(sb.width / 2, 6)
        .setTranslation(sb.x, sb.y)
        .setSensor(true)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
        .setCollisionGroups(WALL_GROUPS);
      const col = world.createCollider(desc, staticBody);
      tag(col, 'speedburst');
      speedBurstBodies.push({
        collider: col,
        x: sb.x,
        y: sb.y,
        width: sb.width,
        direction: sb.direction,
        activationChance: sb.activationChance ?? 0.6,
        activeUntil: 0,
      });
    });
  }

  // === STARTING AREA — scrambler windmill + gate ===
  const scramblerBodyDesc = R.RigidBodyDesc.kinematicPositionBased().setTranslation(W / 2, 140);
  const scramblerBody = world.createRigidBody(scramblerBodyDesc);
  tag(world.createCollider(
    R.ColliderDesc.cuboid(140, 4)
      .setFriction(0.01)
      .setRestitution(0.5)
      .setCollisionGroups(WALL_GROUPS),
    scramblerBody,
  ), 'windmill');
  const scramblerWm: WMBody = { body: scramblerBody, x: W / 2, y: 140, width: 280, speed: 0.04, angle: 0 };
  wmBodies.push(scramblerWm);

  const gateDesc = R.RigidBodyDesc.fixed().setTranslation(W / 2, 230);
  const gateBody = world.createRigidBody(gateDesc);
  const gateCollider = tag(world.createCollider(
    R.ColliderDesc.cuboid((W - 20) / 2, 5)
      .setFriction(0.1)
      .setRestitution(0.3)
      .setCollisionGroups(WALL_GROUPS),
    gateBody,
  ), 'gate');

  // === PENDULUMS — rigid rod swinging on a revolute joint ===
  // Matter uses a Constraint with length+stiffness=1 (rigid rod). Rapier's
  // equivalent is a revolute joint: anchor the fixed point on a zero-size
  // fixed body, anchor the other end on the bob, joint axis-of-rotation
  // is the anchor point. The bob then swings as a rigid pendulum.
  interface PendulumBody {
    body: RBody;
    anchorX: number;
    anchorY: number;
    bobRadius: number;
    length: number;
  }
  const pendulumBobs: PendulumBody[] = [];
  if (track.pendulums) {
    track.pendulums.forEach((p) => {
      // Fixed anchor body at the pivot point.
      const anchorDesc = R.RigidBodyDesc.fixed().setTranslation(p.anchorX, p.anchorY);
      const anchor = world.createRigidBody(anchorDesc);
      // Dynamic bob at length distance below the anchor.
      const bobDesc = R.RigidBodyDesc.dynamic()
        .setTranslation(p.anchorX, p.anchorY + p.length)
        .setLinearDamping(0.005)
        .setAngularDamping(0.005)
        .setCanSleep(false);
      const bob = world.createRigidBody(bobDesc);
      const colDesc = R.ColliderDesc.ball(p.bobRadius)
        .setRestitution(0.8)
        .setFriction(0.005)
        .setDensity(0.5)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
        .setCollisionGroups(OBSTACLE_GROUPS);
      const bobCollider = world.createCollider(colDesc, bob);
      tag(bobCollider, 'pendulum-bob');
      // Revolute joint at the anchor — bob can rotate freely around it.
      // anchor on the fixed body = (0,0) (its own origin = anchor point).
      // anchor on the bob = (0,-length) so the rod extends bob → anchor.
      const jointParams = R.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: -p.length });
      world.createImpulseJoint(jointParams, anchor, bob, true);
      // Initial sideways velocity to start the swing.
      bob.setLinvel({ x: p.startVelocityX, y: 0 }, true);
      pendulumBobs.push({
        body: bob,
        anchorX: p.anchorX,
        anchorY: p.anchorY,
        bobRadius: p.bobRadius,
        length: p.length,
      });
    });
  }

  // === BALL PITS — dynamic balls in a grid (no joints) ===
  interface PitBallBody { body: RBody; r: number }
  const pitBallBodies: PitBallBody[] = [];
  if (track.ballPits) {
    track.ballPits.forEach((pit) => {
      const cols = Math.max(1, Math.floor(pit.width / (pit.ballRadius * 3)));
      const rows = Math.ceil(pit.ballCount / cols);
      for (let i = 0; i < pit.ballCount; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const offsetX = row % 2 === 0 ? 0 : pit.ballRadius * 1.5;
        const bx = pit.x + pit.ballRadius * 2 + col * (pit.width / cols) + offsetX;
        const by = pit.y + pit.ballRadius * 2 + row * (pit.height / Math.max(1, rows));
        const desc = R.RigidBodyDesc.dynamic()
          .setTranslation(bx, by)
          .setLinearDamping(0.01)
          .setCanSleep(false);
        const ball = world.createRigidBody(desc);
        const colDesc = R.ColliderDesc.ball(pit.ballRadius)
          .setRestitution(0.5)
          .setFriction(0.005)
          .setDensity(0.5)
          .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
          .setCollisionGroups(OBSTACLE_GROUPS);
        tag(world.createCollider(colDesc, ball), 'pit-ball');
        pitBallBodies.push({ body: ball, r: pit.ballRadius });
      }
    });
  }

  // === NEWTON'S CRADLES — revolute joints + locked rotation ===
  // Matter uses inertia: Infinity to prevent the bobs from spinning.
  // Rapier equivalent: lockRotations(true, true) on the bob body. With
  // bobs free of angular momentum the chain transfers linear momentum
  // through the row of touching balls, mirroring the Newton's cradle demo.
  interface CradleBody {
    body: RBody;
    anchorX: number;
    anchorY: number;
    ballRadius: number;
  }
  const cradleBobs: CradleBody[] = [];
  if (track.cradles) {
    track.cradles.forEach((c) => {
      const firstIdx = cradleBobs.length;
      for (let i = 0; i < c.count; i++) {
        const ballX = c.x - (c.count - 1) * c.spacing / 2 + i * c.spacing;
        const anchorDesc = R.RigidBodyDesc.fixed().setTranslation(ballX, c.y);
        const anchor = world.createRigidBody(anchorDesc);
        const bobDesc = R.RigidBodyDesc.dynamic()
          .setTranslation(ballX, c.y + c.length)
          .setLinearDamping(0)
          .setAngularDamping(0)
          .setCanSleep(false);
        const bob = world.createRigidBody(bobDesc);
        bob.lockRotations(true, true);
        const colDesc = R.ColliderDesc.ball(c.ballRadius)
          .setRestitution(1.0)
          .setFriction(0)
          .setDensity(1.0)
          .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
          .setCollisionGroups(groups(CAT_OBSTACLE, CAT_WALL | CAT_MARBLE | CAT_OBSTACLE));
        tag(world.createCollider(colDesc, bob), 'cradle-bob');
        const jointParams = R.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: -c.length });
        world.createImpulseJoint(jointParams, anchor, bob, true);
        cradleBobs.push({
          body: bob,
          anchorX: ballX,
          anchorY: c.y,
          ballRadius: c.ballRadius,
        });
      }
      // Pull the first ball back to kick off the cradle motion.
      const firstBob = cradleBobs[firstIdx];
      if (firstBob) {
        const pos = firstBob.body.translation();
        firstBob.body.setTranslation({
          x: pos.x - c.spacing * 1.5,
          y: pos.y - c.length * 0.15,
        }, true);
      }
    });
  }

  // === MARBLES ===
  interface MarbleBody { data: MarbleData; body: RBody; collider: RCollider }
  const marbleBodies: MarbleBody[] = [];
  const marblePool = raceMarbles;
  const totalMarbleCount = marblePool.length;
  const shuffled = [...marblePool].sort(() => Math.random() - 0.5);
  shuffled.forEach((marble, i) => {
    const startX = W / 2 + (Math.random() - 0.5) * 160;
    const startY = 40 + i * 16 + (Math.random() - 0.5) * 8;
    const desc = R.RigidBodyDesc.dynamic()
      .setTranslation(startX, startY)
      .setLinearDamping(0.008 - marble.stats.speed * 0.0005)
      // Racing marbles must NEVER sleep — Rapier puts dynamic bodies to
      // sleep when their velocity drops below an internal threshold,
      // which freezes them mid-track and looks identical to a stuck
      // marble. Same fix Matter uses with sleepThreshold=Infinity.
      .setCanSleep(false);
    const body = world.createRigidBody(desc);
    const colDesc = R.ColliderDesc.ball(MARBLE_RADIUS)
      .setRestitution(0.48 + marble.stats.bounce * 0.01)
      .setFriction(0.00001)
      .setDensity(0.001 + marble.stats.power * 0.00005)
      .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS)
      .setCollisionGroups(MARBLE_GROUPS);
    const collider = world.createCollider(colDesc, body);
    tag(collider, marble.id);
    body.setLinvel({ x: (Math.random() - 0.5) * 1.5, y: 0.3 + Math.random() * 0.3 }, true);
    marbleBodies.push({ data: marble, body, collider });
  });

  // Quick lookup from collider handle to MarbleBody (for collision events).
  const marbleByColliderHandle = new Map<number, MarbleBody>();
  marbleBodies.forEach((m) => marbleByColliderHandle.set(m.collider.handle, m));

  // === TELEMETRY ACCUMULATORS (Stage 5 will read these) ===
  interface TelemetryAccum {
    peakVelocity: number;
    velocitySum: number;
    velocitySamples: number;
    bounces: number;
    bumperHits: number;
    pegContacts: number;
    wallScrapes: number;
    speedBurstHits: number;
    posAt25: number;
    posAt50: number;
    posAt75: number;
    posAtFinish: number;
    overtakes: number;
    timesPassed: number;
    leadFrames: number;
  }
  const telemetry = new Map<string, TelemetryAccum>();
  marblePool.forEach((m) => {
    telemetry.set(m.id, {
      peakVelocity: 0, velocitySum: 0, velocitySamples: 0,
      bounces: 0, bumperHits: 0, pegContacts: 0, wallScrapes: 0, speedBurstHits: 0,
      posAt25: 0, posAt50: 0, posAt75: 0, posAtFinish: 0,
      overtakes: 0, timesPassed: 0, leadFrames: 0,
    });
  });

  // === DOOMSDAY BAR state ===
  const DOOMSDAY_MIN_TRIGGER_MS = 40000;
  const DOOMSDAY_MAX_TRIGGER_MS = 50000;
  const DOOMSDAY_POST_FINISH_GRACE_MS = 12000;
  const DOOMSDAY_SWEEP_MS = 9000;
  const DOOMSDAY_DEADLINE_MS = 70000;
  const DOOMSDAY_BAR_HEIGHT = 20;
  let doomsdayBarBody: RBody | null = null;
  let doomsdayBarActive = false;
  let doomsdayBarStartY = 0;
  let doomsdayBarStartTime = 0;
  let doomsdayBarEndY = 0;
  let doomsdayBarDuration = 0;

  // === STATE ===
  let gateOpen = false;
  let elapsed = 0;
  let physicsAccumulator = 0;
  const finishTimes: Record<string, number> = {};
  let firstFinishTime = 0;
  let finishRankCounter = 0;
  let isFinished = false;

  // Telemetry: previous-frame ranking + quartile-checkpoint capture flags.
  // Ranking is rebuilt every frame inside step(); we hold the previous
  // ranking to detect overtakes (drops in rank) and times-passed (gains).
  let prevRanking: Record<string, number> = {};
  let captured25 = false;
  let captured50 = false;
  let captured75 = false;
  // Wire-to-wire tracking: marble that led at every captured quartile.
  // Built up across the race in step(); read by getTelemetry().
  let wireToWireId: string | null = null;
  let wireToWireBroken = false;

  function releaseGate(): void {
    if (!gateOpen) {
      gateOpen = true;
      elapsed = 0;
      // Remove the gate + scrambler. Rapier's removeRigidBody also removes
      // its colliders, so the staticBody's tagged colliders stay intact.
      world.removeRigidBody(gateBody);
      labelOf.delete(gateCollider.handle);
      world.removeRigidBody(scramblerBody);
      const idx = wmBodies.indexOf(scramblerWm);
      if (idx >= 0) wmBodies.splice(idx, 1);
    }
  }

  function step(_dt: number = 16.67): RaceState {
    if (gateOpen) elapsed += _dt;

    // === DOOMSDAY BAR spawn check ===
    const unfinishedMarbles = marbleBodies.filter(({ data }) => !finishTimes[data.id]);
    const pastFloor = elapsed >= DOOMSDAY_MIN_TRIGGER_MS;
    const pastCeiling = elapsed >= DOOMSDAY_MAX_TRIGGER_MS;
    const raceDecided =
      firstFinishTime > 0 &&
      elapsed - firstFinishTime >= DOOMSDAY_POST_FINISH_GRACE_MS;
    const shouldSpawnDoomsday = pastFloor && (pastCeiling || raceDecided);
    if (!doomsdayBarActive && shouldSpawnDoomsday && unfinishedMarbles.length > 0) {
      let highestY = Infinity;
      for (const { body } of unfinishedMarbles) {
        if (body.translation().y < highestY) highestY = body.translation().y;
      }
      doomsdayBarStartY = highestY - 100;
      doomsdayBarStartTime = elapsed;
      doomsdayBarEndY = track.finishY + 50;
      doomsdayBarDuration = DOOMSDAY_SWEEP_MS;
      const dbDesc = R.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(W / 2, doomsdayBarStartY);
      doomsdayBarBody = world.createRigidBody(dbDesc);
      tag(world.createCollider(
        R.ColliderDesc.cuboid((W + 100) / 2, DOOMSDAY_BAR_HEIGHT / 2)
          .setFriction(0.1)
          .setRestitution(0.3)
          .setCollisionGroups(DOOMSDAY_GROUPS),
        doomsdayBarBody,
      ), 'doomsday-bar');
      doomsdayBarActive = true;
    }

    // Move doomsday bar.
    if (doomsdayBarActive && doomsdayBarBody) {
      const progress = Math.min(1, (elapsed - doomsdayBarStartTime) / Math.max(doomsdayBarDuration, 1));
      const newY = doomsdayBarStartY + progress * (doomsdayBarEndY - doomsdayBarStartY);
      if (newY >= track.finishY + 50) {
        world.removeRigidBody(doomsdayBarBody);
        doomsdayBarBody = null;
        doomsdayBarActive = false;
      } else {
        doomsdayBarBody.setNextKinematicTranslation({ x: W / 2, y: newY });
      }
    }

    // === PHYSICS LOOP ===
    physicsAccumulator += _dt;
    while (physicsAccumulator >= FRAME_DT) {
      // Rotate windmills
      wmBodies.forEach((wm) => {
        wm.angle += wm.speed;
        wm.body.setNextKinematicRotation(wm.angle);
      });

      // Swinging doors — sin-wave angle around their hinge.
      swingDoorBodies.forEach((d) => {
        const t = (elapsed + d.phase) / d.periodMs;
        const angle = d.baseAngle + Math.sin(t * Math.PI * 2) * d.arc;
        const cx = d.hingeX + (d.length / 2) * Math.cos(angle);
        const cy = d.hingeY + (d.length / 2) * Math.sin(angle);
        d.body.setNextKinematicTranslation({ x: cx, y: cy });
        d.body.setNextKinematicRotation(angle);
      });

      for (let s = 0; s < SUBSTEPS; s++) {
        world.timestep = FIXED_DT / 1000;
        world.step(eventQueue);

        // Drain collision events — route sensor contacts to spring /
        // trampoline / speedburst force application.
        eventQueue.drainCollisionEvents((h1, h2, started) => {
          if (!started) return;
          const label1 = labelOf.get(h1);
          const label2 = labelOf.get(h2);

          // Identify which side is the marble + which is the active element.
          let marbleEntry: MarbleBody | null = null;
          let otherHandle = -1;
          let otherLabel = '';
          if (marbleByColliderHandle.has(h1)) {
            marbleEntry = marbleByColliderHandle.get(h1)!;
            otherHandle = h2;
            otherLabel = label2 ?? '';
          } else if (marbleByColliderHandle.has(h2)) {
            marbleEntry = marbleByColliderHandle.get(h2)!;
            otherHandle = h1;
            otherLabel = label1 ?? '';
          }
          if (!marbleEntry) return;
          const marble = marbleEntry.body;
          const pos = marble.translation();
          const mass = marble.mass();

          // Spring — gentle redirect toward center + slight downward nudge.
          if (otherLabel === 'spring') {
            const toCenter = pos.x < W / 2 ? 1 : -1;
            marble.applyImpulse({
              x: toCenter * 2.0 * mass,
              y: 1.0 * mass,
            }, true);
            return;
          }

          // Trampoline — modest upward kick, max-bounce cap converts to
          // sensor after MAX_TRAMP_BOUNCES to prevent shelf trapping.
          if (otherLabel === 'trampoline') {
            const tramp = trampolineBodies.find((t) => t.collider.handle === otherHandle);
            if (!tramp) return;
            tramp.bounceCount += 1;
            if (tramp.bounceCount >= MAX_TRAMP_BOUNCES && !tramp.nowSensor) {
              tramp.collider.setSensor(true);
              tramp.nowSensor = true;
            }
            if (tramp.bounceCount > MAX_TRAMP_BOUNCES) return;
            marble.applyImpulse({
              x: (Math.random() - 0.5) * 1.0 * mass,
              y: -tramp.strength * 0.8 * mass,
            }, true);
            if (onHaptic) onHaptic('trampoline', marbleEntry.data.id);
            return;
          }

          // Speed burst — randomized activation, directional push.
          if (otherLabel === 'speedburst') {
            const sb = speedBurstBodies.find((s) => s.collider.handle === otherHandle);
            if (!sb) return;
            if (Math.random() >= sb.activationChance) return;
            const str = 3.0;
            let fx = 0, fy = 0;
            switch (sb.direction) {
              case 'left':  fx = -str * mass; fy = -0.5 * mass; break;
              case 'right': fx =  str * mass; fy = -0.5 * mass; break;
              case 'down':  fx = 0;           fy =  str * mass; break;
            }
            marble.applyImpulse({ x: fx, y: fy }, true);
            sb.activeUntil = elapsed + 300;
            if (onHaptic) onHaptic('speedBurst', marbleEntry.data.id);
            return;
          }

          // Telemetry — count contact + classify by label.
          const t = telemetry.get(marbleEntry.data.id);
          if (t) {
            t.bounces++;
            if (otherLabel === 'bumper') t.bumperHits++;
            else if (otherLabel === 'peg') t.pegContacts++;
            else if (otherLabel === 'wall' || otherLabel === 'ceiling' || otherLabel === 'channel-wall') {
              t.wallScrapes++;
            }
            else if (otherLabel === 'speedburst') t.speedBurstHits++;
          }

          // Generic haptic for any collision (matches Matter.js behavior).
          if (onHaptic) {
            if (otherLabel === 'bumper') onHaptic('bumper', marbleEntry.data.id);
            else if (otherLabel === 'pendulum-bob') onHaptic('pendulum', marbleEntry.data.id);
            else if (otherLabel === 'cradle-bob') onHaptic('cradle', marbleEntry.data.id);
            else onHaptic('bumper', marbleEntry.data.id);
          }
        });
      }

      physicsAccumulator -= FRAME_DT;
    }

    // Post-physics: doomsday bar upward-escape correction.
    if (doomsdayBarActive && doomsdayBarBody) {
      const barLeadingEdge = doomsdayBarBody.translation().y - DOOMSDAY_BAR_HEIGHT / 2;
      const MAX_SNAP = MARBLE_RADIUS * 2 * 2; // 44px
      for (const { body, data } of marbleBodies) {
        if (finishTimes[data.id]) continue;
        const pos = body.translation();
        const topOfMarble = pos.y - MARBLE_RADIUS;
        const overshoot = barLeadingEdge - topOfMarble;
        if (overshoot > 0 && overshoot <= MAX_SNAP) {
          body.setTranslation({ x: pos.x, y: barLeadingEdge + MARBLE_RADIUS + 1 }, true);
          const vel = body.linvel();
          if (vel.y < 0) body.setLinvel({ x: vel.x, y: 0 }, true);
        }
      }
    }

    // Post-step marble processing: velocity cap, finish detection.
    //
    // Matter's MAX_SPEED = 15 is measured in px/substep (Verlet) — at the
    // SUBSTEPS=2 + 60Hz frame rate that's 120 substeps/sec, so the
    // equivalent Rapier cap (which works in px/s) is 15 × 120 = 1800 px/s.
    // FINISH_CAP_VY is the same conversion applied to the "if vy > 10"
    // soft-cap for finished marbles (10 px/substep → 1200 px/s).
    const MAX_SPEED = 1800;
    const FINISH_CAP_VY = 1200;
    for (const { body, data } of marbleBodies) {
      if (finishTimes[data.id]) {
        // Soft cap on downward velocity for finished marbles so they don't
        // tunnel through shelves at top speed.
        const vel = body.linvel();
        if (vel.y > FINISH_CAP_VY) body.setLinvel({ x: vel.x, y: FINISH_CAP_VY }, true);
        continue;
      }
      const vel = body.linvel();
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;
        body.setLinvel({ x: vel.x * scale, y: vel.y * scale }, true);
      }
      // Telemetry velocity sample.
      const tel = telemetry.get(data.id);
      if (tel) {
        if (speed > tel.peakVelocity) tel.peakVelocity = speed;
        tel.velocitySum += speed;
        tel.velocitySamples += 1;
      }
      // Luck-based nudge.
      if (Math.random() < 0.005 * data.stats.luck) {
        body.applyImpulse({
          x: (Math.random() - 0.5) * 0.3 * body.mass(),
          y: 0,
        }, true);
      }
      // Finish detection.
      const pos = body.translation();
      if (pos.y >= track.finishY) {
        const overshoot = pos.y - track.finishY;
        const vyAbs = Math.max(Math.abs(vel.y), 0.1);
        finishTimes[data.id] = elapsed - (overshoot / vyAbs);
        if (!firstFinishTime) firstFinishTime = finishTimes[data.id];
        finishRankCounter += 1;
        const rank = finishRankCounter;
        // Spawn a static shelf in this marble's finish slot so the column
        // stacks visually instead of all marbles piling on the floor.
        if (rank >= 2) {
          const SLOT_H = 26;
          const shelfY = track.finishY + track.channelDepth - (rank - 1) * SLOT_H;
          tag(world.createCollider(
            R.ColliderDesc.cuboid((track.channelRight - track.channelLeft) / 2, 1.5)
              .setTranslation(track.channelCX, shelfY)
              .setFriction(0.6)
              .setRestitution(0)
              .setCollisionGroups(WALL_GROUPS),
            staticBody,
          ), 'slot-shelf');
        }
      }
    }

    const finishedCount = Object.keys(finishTimes).length;
    isFinished = finishedCount >= totalMarbleCount || elapsed > DOOMSDAY_DEADLINE_MS;

    // === PER-FRAME TELEMETRY SAMPLING (pure observation) ===
    // Runs once per render frame AFTER physics. Reads positions + finishTimes
    // and updates ranking-derived counters. Never mutates the simulation.
    if (gateOpen) {
      // Build the live ranking — same algorithm as getPositions(), inlined
      // so we don't allocate the full positions array every frame just for
      // the ID order.
      const ranked = marbleBodies
        .map(({ body, data }) => ({
          id: data.id,
          finished: !!finishTimes[data.id],
          time: finishTimes[data.id] || 0,
          y: body.translation().y,
        }))
        .sort((a, b) => {
          if (a.finished && b.finished) return a.time - b.time;
          if (a.finished) return -1;
          if (b.finished) return 1;
          return b.y - a.y;
        });
      const ranking: Record<string, number> = {};
      ranked.forEach((r, i) => { ranking[r.id] = i + 1; });

      // Lead-frame accounting — credit whoever is rank 1 this frame.
      const leaderId = ranked[0]?.id;
      if (leaderId) {
        const lt = telemetry.get(leaderId);
        if (lt) lt.leadFrames++;
      }

      // Overtake / times-passed detection vs the previous frame's ranking.
      // Lower rank number = closer to 1st place. A drop in rank between
      // frames = an overtake by this marble; a rise = it got passed.
      if (Object.keys(prevRanking).length > 0) {
        for (const r of ranked) {
          const prev = prevRanking[r.id];
          const now = ranking[r.id];
          if (prev === undefined) continue;
          if (now < prev) {
            const t = telemetry.get(r.id);
            if (t) t.overtakes += prev - now;
          } else if (now > prev) {
            const t = telemetry.get(r.id);
            if (t) t.timesPassed += now - prev;
          }
        }
      }
      prevRanking = ranking;

      // Quartile checkpoints — capture each marble's rank the first frame
      // the race-clock crosses the threshold. Same DOOMSDAY_DEADLINE_MS
      // denominator Matter uses so the meaning of "1st quartile" matches.
      const prog = elapsed / DOOMSDAY_DEADLINE_MS;
      if (!captured25 && prog >= 0.25) {
        captured25 = true;
        for (const r of ranked) {
          const t = telemetry.get(r.id);
          if (t) t.posAt25 = ranking[r.id];
        }
        // Initialize wire-to-wire candidate at first checkpoint.
        wireToWireId = leaderId ?? null;
      }
      if (!captured50 && prog >= 0.50) {
        captured50 = true;
        for (const r of ranked) {
          const t = telemetry.get(r.id);
          if (t) t.posAt50 = ranking[r.id];
        }
        // Wire-to-wire is broken if the leader changed by this checkpoint.
        if (wireToWireId && wireToWireId !== leaderId) wireToWireBroken = true;
      }
      if (!captured75 && prog >= 0.75) {
        captured75 = true;
        for (const r of ranked) {
          const t = telemetry.get(r.id);
          if (t) t.posAt75 = ranking[r.id];
        }
        if (wireToWireId && wireToWireId !== leaderId) wireToWireBroken = true;
      }
    }

    return buildState();
  }

  function buildState(): RaceState {
    return {
      marbles: marbleBodies.map(({ data, body }) => {
        const p = body.translation();
        return {
          data,
          x: p.x,
          y: p.y,
          finished: !!finishTimes[data.id],
          finishTime: finishTimes[data.id] || 0,
        };
      }),
      elapsed: elapsed / 1000,
      isFinished,
      windmills: wmBodies.map((wm) => ({
        x: wm.x, y: wm.y, angle: wm.angle, width: wm.width,
      })),
      pendulums: pendulumBobs.map((p) => {
        const pos = p.body.translation();
        return {
          anchorX: p.anchorX, anchorY: p.anchorY,
          bobX: pos.x, bobY: pos.y, bobRadius: p.bobRadius,
        };
      }),
      ballPitBalls: pitBallBodies.map((b) => {
        const pos = b.body.translation();
        return { x: pos.x, y: pos.y, r: b.r };
      }),
      cradles: cradleBobs.map((c) => {
        const pos = c.body.translation();
        return {
          anchorX: c.anchorX, anchorY: c.anchorY,
          bobX: pos.x, bobY: pos.y, bobRadius: c.ballRadius,
        };
      }),
      trampolines: trampolineBodies.map((t) => ({
        x: t.x, y: t.y, width: t.width,
        bouncesRemaining: Math.max(0, MAX_TRAMP_BOUNCES - t.bounceCount),
      })),
      speedBursts: speedBurstBodies.map((sb) => ({
        x: sb.x, y: sb.y, width: sb.width,
        direction: sb.direction as any,
        active: elapsed < sb.activeUntil,
      })),
      swingingDoors: swingDoorBodies.map((d) => {
        const t = (elapsed + d.phase) / d.periodMs;
        const angle = d.baseAngle + Math.sin(t * Math.PI * 2) * d.arc;
        return { hingeX: d.hingeX, hingeY: d.hingeY, length: d.length, angle };
      }),
      doomsdayBar: doomsdayBarActive && doomsdayBarBody
        ? { y: doomsdayBarBody.translation().y, active: true }
        : null,
    };
  }

  function getPositions(): { marble: MarbleData; time: number }[] {
    return marbleBodies
      .map(({ data, body }) => {
        const p = body.translation();
        return {
          marble: data,
          time: finishTimes[data.id] || elapsed / 1000 + (track.finishY - p.y) * 0.008,
          _y: p.y,
          _x: p.x,
        };
      })
      .sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        if (a._y !== b._y) return b._y - a._y;
        if (a._x !== b._x) return a._x - b._x;
        return a.marble.id.localeCompare(b.marble.id);
      })
      .map(({ marble, time }) => ({ marble, time }));
  }

  function getTelemetry(): MarbleTelemetry[] {
    const positions = getPositions();
    const placeById: Record<string, number> = {};
    positions.forEach((p, i) => { placeById[p.marble.id] = i + 1; });
    const totalLead = Array.from(telemetry.values()).reduce((s, t) => s + t.leadFrames, 0) || 1;
    return marbleBodies.map(({ data }) => {
      const t = telemetry.get(data.id) ?? {
        peakVelocity: 0, velocitySum: 0, velocitySamples: 0,
        bounces: 0, bumperHits: 0, pegContacts: 0, wallScrapes: 0, speedBurstHits: 0,
        posAt25: 0, posAt50: 0, posAt75: 0, posAtFinish: 0,
        overtakes: 0, timesPassed: 0, leadFrames: 0,
      };
      const place = placeById[data.id] ?? marbleBodies.length;
      return {
        marbleId: data.id,
        finishTime: finishTimes[data.id] || 0,
        finishPlace: place,
        peakVelocity: t.peakVelocity,
        avgVelocity: t.velocitySamples > 0 ? t.velocitySum / t.velocitySamples : 0,
        velocitySampleCount: t.velocitySamples,
        bounces: t.bounces,
        bumperHits: t.bumperHits,
        pegContacts: t.pegContacts,
        wallScrapes: t.wallScrapes,
        speedBurstHits: t.speedBurstHits,
        posAt25: t.posAt25 || place,
        posAt50: t.posAt50 || place,
        posAt75: t.posAt75 || place,
        posAtFinish: place,
        overtakes: t.overtakes,
        timesPassed: t.timesPassed,
        // Wire-to-wire = led at every captured quartile checkpoint AND
        // finished 1st. wireToWireId is only set if the marble was rank 1
        // at the 25% quartile and never lost the lead at 50% or 75%.
        wireToWire: !wireToWireBroken && wireToWireId === data.id && place === 1,
        leadTimeFraction: t.leadFrames / totalLead,
      };
    });
  }

  function destroy(): void {
    world.free();
  }

  const marbles = marbleBodies.map(({ data }) => data);

  function getStaticConfig() {
    return {
      windmills: wmBodies.map((wm) => ({ x: wm.x, y: wm.y, width: wm.width })),
      pendulums: pendulumBobs.map((p) => ({
        anchorX: p.anchorX, anchorY: p.anchorY, bobRadius: p.bobRadius,
      })),
      cradles: cradleBobs.map((c) => ({
        anchorX: c.anchorX, anchorY: c.anchorY, bobRadius: c.ballRadius,
      })),
      ballPitRadii: pitBallBodies.map((b) => b.r),
      trampolines: trampolineBodies.map((t) => ({ x: t.x, y: t.y, width: t.width })),
      speedBursts: speedBurstBodies.map((sb) => ({
        x: sb.x, y: sb.y, width: sb.width, direction: sb.direction as 'left' | 'right',
      })),
    };
  }

  return {
    step,
    getPositions,
    getTelemetry,
    destroy,
    releaseGate,
    track,
    marbles,
    getStaticConfig,
  };
}
