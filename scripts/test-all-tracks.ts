// Comprehensive track physics tester — tests ALL 112 tracks
// Usage: npx tsx scripts/test-all-tracks.ts [track-id]
// Uses actual game engine track builders + physics constants from race.ts

import Matter from 'matter-js';
import { buildTrack, TrackConfig, ENGINE_WIDTH } from '../engine/tracks';
import { ALL_COURSES } from '../data/courses';
import { MARBLES, MarbleData } from '../theme';

const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;

// ═══════════════════════════════════════════
// PHYSICS CONSTANTS (exact match to race.ts)
// ═══════════════════════════════════════════
const W = ENGINE_WIDTH; // 400
const SUBSTEPS = 3;
const FIXED_DT = (1000 / 60) / SUBSTEPS;
const MAX_SPEED = 15;
const DOOMSDAY_TRIGGER_MS = 55000;
const DOOMSDAY_DEADLINE_MS = 70000;
// Real stuck = a marble that hasn't moved 4px for >= 3 seconds.
// This matches the player perception of "stuck"; transient pauses
// (e.g., bouncing off a wall) don't count.
const REAL_STUCK_MS = 3000;
const STUCK_DIST_PX = 4;
const DOOMSDAY_BAR_HEIGHT = 20;
const MAX_FRAMES = 75 * 60; // 75s — beyond DOOMSDAY_DEADLINE_MS so the bar can finish its sweep

// Collision categories
const CAT_WALL = 0x0001;
const CAT_MARBLE = 0x0002;
const CAT_OBS = 0x0004;
const CAT_DOOMSDAY = 0x0008;
const MARBLE_F = { category: CAT_MARBLE, mask: CAT_WALL | CAT_MARBLE | CAT_OBS | CAT_DOOMSDAY };
const OBS_F = { category: CAT_OBS, mask: CAT_WALL | CAT_MARBLE };
const CRADLE_F = { category: CAT_OBS, mask: CAT_WALL | CAT_MARBLE | CAT_OBS };
const DOOMSDAY_F = { category: CAT_DOOMSDAY, mask: CAT_MARBLE };

interface RaceResult {
  trackId: string;
  bodyCount: number;
  totalTime: string;
  totalTimeMs: number;
  finishedNaturally: number;
  totalMarbles: number;
  stuckEvents: StuckEvent[];
  doomsdayTriggered: boolean;
  obstacleCount: number;
  trackHeight: number;
  finishY: number;
}

interface StuckEvent {
  marble: string;
  x: number;
  y: number;
  time: string;
  type?: string;
}

// ═══════════════════════════════════════════
// RACE SIMULATION (mirrors race.ts exactly)
// ═══════════════════════════════════════════
function simulateRace(trackId: string): RaceResult {
  const track = buildTrack(trackId);
  const engine = Engine.create({
    gravity: track.gravity,
    positionIterations: 10,
    velocityIterations: 8,
  } as any);
  const world = engine.world;

  // Walls — match race.ts STATIC_FRICTION=0.005 exactly
  const SF = 0.005;
  Composite.add(world, [
    Bodies.rectangle(0, track.totalHeight / 2, 50, track.totalHeight + 200, { isStatic: true, friction: 0.01, frictionStatic: SF, restitution: 0.2 }),
    Bodies.rectangle(W, track.totalHeight / 2, 50, track.totalHeight + 200, { isStatic: true, friction: 0.01, frictionStatic: SF, restitution: 0.2 }),
    Bodies.rectangle(W / 2, -25, W + 100, 50, { isStatic: true, friction: 0.01, frictionStatic: SF, restitution: 0.2 }),
    Bodies.rectangle(W / 2, track.totalHeight + 25, W + 100, 50, { isStatic: true, friction: 0.3, frictionStatic: 0.3, restitution: 0.1 }),
  ]);

  // Ramps (using actual TrackConfig point arrays — multi-segment bezier curves)
  track.ramps.forEach(ramp => {
    for (let j = 0; j < ramp.points.length - 1; j++) {
      const a = ramp.points[j], b = ramp.points[j + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      Composite.add(world, Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len + 6, 14, {
        isStatic: true, angle: Math.atan2(dy, dx), friction: 0.005, frictionStatic: SF, restitution: 0.3,
        chamfer: { radius: 4 }, label: 'ramp',
      }));
    }
  });

  // Bumpers & pegs — apply same pinch-zone repair as race.ts.
  const MD = 22, WSL = 25, WSR = W - 25, PB = 4;
  const RHT = 7;
  const repaired = track.obstacles.map(o => {
    let x = o.x;
    const lg = (x - o.r) - WSL;
    if (lg > 0 && lg < MD + PB) x = WSL + o.r;
    const rg = WSR - (x + o.r);
    if (rg > 0 && rg < MD + PB) x = WSR - o.r;
    return { ...o, x };
  });
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < repaired.length; i++) {
      for (let j = i + 1; j < repaired.length; j++) {
        const a = repaired[i], b = repaired[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minSafe = a.r + b.r;
        const pinchMax = minSafe + MD + PB;
        if (dist > minSafe && dist < pinchMax) {
          const target = minSafe - 0.5;
          const need = dist - target;
          const ux = dx / dist, uy = dy / dist;
          if (a.r <= b.r) { a.x += ux * need; a.y += uy * need; }
          else { b.x -= ux * need; b.y -= uy * need; }
        }
      }
    }
  }
  // Peg-to-ramp-segment pinch repair
  function d2seg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
    const abx = bx - ax, aby = by - ay;
    const apx = px - ax, apy = py - ay;
    const ab2 = abx * abx + aby * aby;
    const t = Math.max(0, Math.min(1, ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2));
    const cx = ax + t * abx, cy = ay + t * aby;
    return { dist: Math.hypot(px - cx, py - cy), cx, cy };
  }
  for (const obs of repaired) {
    for (const ramp of track.ramps) {
      for (let s = 0; s < ramp.points.length - 1; s++) {
        const a = ramp.points[s], b = ramp.points[s + 1];
        const { dist, cx, cy } = d2seg(obs.x, obs.y, a.x, a.y, b.x, b.y);
        const minSafe = obs.r + RHT;
        const pinchMax = minSafe + MD + PB;
        if (dist > minSafe && dist < pinchMax) {
          const ux = (obs.x - cx) / dist, uy = (obs.y - cy) / dist;
          obs.x = cx + ux * (minSafe - 0.5);
          obs.y = cy + uy * (minSafe - 0.5);
        }
      }
    }
  }
  repaired.forEach(o => {
    Composite.add(world, Bodies.circle(o.x, o.y, o.r, {
      isStatic: true, restitution: o.type === 'bumper' ? 0.95 : 0.6, friction: 0.005, frictionStatic: SF, label: o.type,
    }));
  });

  // Funnels
  track.funnels.forEach(f => {
    const dy = f.y2 - f.y1;
    const ldx = f.leftX2 - f.leftX1, lLen = Math.sqrt(ldx * ldx + dy * dy);
    Composite.add(world, Bodies.rectangle((f.leftX1 + f.leftX2) / 2, (f.y1 + f.y2) / 2, lLen, 12, {
      isStatic: true, angle: Math.atan2(dy, ldx), friction: 0.005, frictionStatic: SF, restitution: 0.35, label: 'funnel',
    }));
    const rdx = f.rightX2 - f.rightX1, rLen = Math.sqrt(rdx * rdx + dy * dy);
    Composite.add(world, Bodies.rectangle((f.rightX1 + f.rightX2) / 2, (f.y1 + f.y2) / 2, rLen, 12, {
      isStatic: true, angle: Math.atan2(dy, rdx), friction: 0.005, frictionStatic: SF, restitution: 0.35, label: 'funnel',
    }));
  });

  // Finish zone — match race.ts (funnel + mini-funnel + channel walls + floor)
  const ff = track.finishFunnel;
  const fdy = ff.y2 - ff.y1;
  const fldx = ff.leftX2 - ff.leftX1, flLen = Math.sqrt(fldx * fldx + fdy * fdy);
  Composite.add(world, Bodies.rectangle((ff.leftX1 + ff.leftX2) / 2, (ff.y1 + ff.y2) / 2, flLen, 14, {
    isStatic: true, angle: Math.atan2(fdy, fldx), friction: 0.005, frictionStatic: SF, restitution: 0.3,
  }));
  const frdx = ff.rightX2 - ff.rightX1, frLen = Math.sqrt(frdx * frdx + fdy * fdy);
  Composite.add(world, Bodies.rectangle((ff.rightX1 + ff.rightX2) / 2, (ff.y1 + ff.y2) / 2, frLen, 14, {
    isStatic: true, angle: Math.atan2(fdy, frdx), friction: 0.005, frictionStatic: SF, restitution: 0.3,
  }));
  // Mini-funnel
  const miniH = track.miniFunnelH;
  const funnelExitLeft = ff.leftX2;
  const funnelExitRight = ff.rightX2;
  const mlDx = track.channelLeft - funnelExitLeft;
  const mlLen = Math.sqrt(mlDx * mlDx + miniH * miniH);
  Composite.add(world, Bodies.rectangle((funnelExitLeft + track.channelLeft) / 2, track.finishY + miniH / 2, mlLen, 10, {
    isStatic: true, angle: Math.atan2(miniH, mlDx), friction: 0.005, frictionStatic: SF, restitution: 0.3,
  }));
  const mrDx = track.channelRight - funnelExitRight;
  const mrLen = Math.sqrt(mrDx * mrDx + miniH * miniH);
  Composite.add(world, Bodies.rectangle((funnelExitRight + track.channelRight) / 2, track.finishY + miniH / 2, mrLen, 10, {
    isStatic: true, angle: Math.atan2(miniH, mrDx), friction: 0.005, frictionStatic: SF, restitution: 0.3,
  }));
  // Channel walls
  const channelTopY = track.finishY + miniH;
  const channelWallH = track.channelDepth - miniH;
  Composite.add(world, Bodies.rectangle(track.channelLeft - 5, channelTopY + channelWallH / 2, 10, channelWallH + 20, {
    isStatic: true, friction: 0.005, frictionStatic: SF, restitution: 0.2,
  }));
  Composite.add(world, Bodies.rectangle(track.channelRight + 5, channelTopY + channelWallH / 2, 10, channelWallH + 20, {
    isStatic: true, friction: 0.005, frictionStatic: SF, restitution: 0.2,
  }));
  Composite.add(world, Bodies.rectangle(track.channelCX, track.finishY + track.channelDepth + 10, (track.channelRight - track.channelLeft) + 20, 14, {
    isStatic: true, friction: 0.5, restitution: 0.1,
  }));

  // Windmills
  interface WMBody { body: Matter.Body; x: number; y: number; w: number; s: number }
  const wmBodies: WMBody[] = [];
  track.windmillConfigs.forEach(wm => {
    const blade = Bodies.rectangle(wm.x, wm.y, wm.width, 8, {
      isStatic: true, friction: 0.01, frictionStatic: SF, restitution: 0.5, label: 'windmill',
    });
    Composite.add(world, blade);
    wmBodies.push({ body: blade, x: wm.x, y: wm.y, w: wm.width, s: wm.speed });
  });

  // Springs (sensors — matching race.ts)
  track.springs.forEach(sp => {
    Composite.add(world, Bodies.rectangle(sp.x, sp.y, sp.w, sp.h, {
      isStatic: true, isSensor: true, label: 'spring',
    }));
  });

  // Trampoline tracking
  const MAX_TRAMP_BOUNCES = 5;
  const trampBodies: { body: Matter.Body; config: { strength: number } }[] = [];
  const trampBounceCount = new Map<Matter.Body, number>();

  // Pendulums
  if (track.pendulums) {
    track.pendulums.forEach(p => {
      const bob = Bodies.circle(p.anchorX, p.anchorY + p.length, p.bobRadius, {
        density: 0.008, restitution: 0.8, friction: 0.005, frictionAir: 0.005,
        label: 'pendulum-bob', collisionFilter: OBS_F,
      });
      Composite.add(world, [bob, Constraint.create({
        pointA: { x: p.anchorX, y: p.anchorY }, bodyB: bob, length: p.length, stiffness: 1, damping: 0,
      })]);
      Body.setVelocity(bob, { x: p.startVelocityX, y: 0 });
    });
  }

  // Ball pits
  if (track.ballPits) {
    track.ballPits.forEach(pit => {
      const cols = Math.floor(pit.width / (pit.ballRadius * 3));
      const rows = Math.ceil(pit.ballCount / cols);
      for (let i = 0; i < pit.ballCount; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const offX = row % 2 === 0 ? 0 : pit.ballRadius * 1.5;
        const bx = pit.x + pit.ballRadius * 2 + col * (pit.width / cols) + offX;
        const by = pit.y + pit.ballRadius * 2 + row * (pit.height / Math.max(1, rows));
        Composite.add(world, Bodies.circle(bx, by, pit.ballRadius, {
          density: 0.001, restitution: 0.5, friction: 0.005, frictionAir: 0.01,
          label: 'pit-ball', collisionFilter: OBS_F,
        }));
      }
    });
  }

  // Cradles
  if (track.cradles) {
    track.cradles.forEach(c => {
      const bobs: Matter.Body[] = [];
      for (let i = 0; i < c.count; i++) {
        const bx = c.x - (c.count - 1) * c.spacing / 2 + i * c.spacing;
        const bob = Bodies.circle(bx, c.y + c.length, c.ballRadius, {
          inertia: Infinity, restitution: 1.0, friction: 0, frictionAir: 0,
          slop: c.ballRadius * 0.02, label: 'cradle-bob', collisionFilter: CRADLE_F,
        });
        Composite.add(world, [bob, Constraint.create({
          pointA: { x: bx, y: c.y }, bodyB: bob, length: c.length, stiffness: 1, damping: 0,
        })]);
        bobs.push(bob);
      }
      if (bobs.length > 0) Body.translate(bobs[0], { x: -c.spacing * 1.5, y: -c.length * 0.15 });
    });
  }

  // Trampolines (matches race.ts: 2° outward tilt eliminates static rest)
  if (track.trampolines) {
    track.trampolines.forEach(t => {
      const tiltDir = t.x < W / 2 ? 1 : -1;
      const tilt = tiltDir * (2 * Math.PI / 180);
      const body = Bodies.rectangle(t.x, t.y, t.width, 10, {
        isStatic: true, angle: tilt, restitution: 0.5, friction: 0.005, frictionStatic: SF, label: 'trampoline', chamfer: { radius: 3 },
      });
      trampBounceCount.set(body, 0);
      Composite.add(world, body);
      trampBodies.push({ body, config: { strength: t.strength } });
    });
  }

  // Speed bursts (sensors)
  if (track.speedBursts) {
    track.speedBursts.forEach(sb => {
      Composite.add(world, Bodies.rectangle(sb.x, sb.y, sb.width, 12, {
        isStatic: true, isSensor: true, label: 'speedburst',
      }));
    });
  }

  // Collision handler (springs + trampolines + speed bursts)
  Events.on(engine, 'collisionStart', (event: any) => {
    event.pairs.forEach((pair: any) => {
      const { bodyA, bodyB } = pair;

      // Spring
      let marble: Matter.Body | null = null;
      if (bodyA.label === 'spring' && !bodyB.isStatic) marble = bodyB;
      else if (bodyB.label === 'spring' && !bodyA.isStatic) marble = bodyA;
      if (marble) {
        const toCenter = marble.position.x < W / 2 ? 1 : -1;
        Body.applyForce(marble, marble.position, {
          x: toCenter * 0.002 * marble.mass,
          y: 0.001 * marble.mass,
        });
        return;
      }

      // Trampoline
      let tMarble: Matter.Body | null = null;
      let trampBody: Matter.Body | null = null;
      if (bodyA.label === 'trampoline' && !bodyB.isStatic) { tMarble = bodyB; trampBody = bodyA; }
      else if (bodyB.label === 'trampoline' && !bodyA.isStatic) { tMarble = bodyA; trampBody = bodyB; }
      if (tMarble && trampBody) {
        const cnt = trampBounceCount.get(trampBody) || 0;
        if (cnt >= MAX_TRAMP_BOUNCES) return;
        trampBounceCount.set(trampBody, cnt + 1);
        if (cnt + 1 >= MAX_TRAMP_BOUNCES) trampBody.isSensor = true;
        const tc = trampBodies.find(t => t.body === trampBody);
        const str = tc ? tc.config.strength : 5;
        Body.applyForce(tMarble, tMarble.position, {
          x: (Math.random() - 0.5) * 0.001 * tMarble.mass,
          y: -str * 0.0008 * tMarble.mass,
        });
      }

      // Speed burst
      let sbMarble: Matter.Body | null = null;
      let sbBody: Matter.Body | null = null;
      if (bodyA.label === 'speedburst' && !bodyB.isStatic) { sbMarble = bodyB; sbBody = bodyA; }
      else if (bodyB.label === 'speedburst' && !bodyA.isStatic) { sbMarble = bodyA; sbBody = bodyB; }
      if (sbMarble && sbBody && track.speedBursts) {
        const sbConfig = track.speedBursts.find(sb =>
          Math.abs(sb.x - sbBody!.position.x) < 5 && Math.abs(sb.y - sbBody!.position.y) < 10
        );
        if (sbConfig && Math.random() < sbConfig.activationChance) {
          const str = 0.003;
          let fx = 0, fy = 0;
          switch (sbConfig.direction) {
            case 'left': fx = -str * sbMarble.mass; fy = -0.0005 * sbMarble.mass; break;
            case 'right': fx = str * sbMarble.mass; fy = -0.0005 * sbMarble.mass; break;
            case 'down': fx = 0; fy = str * sbMarble.mass; break;
          }
          Body.applyForce(sbMarble, sbMarble.position, { x: fx, y: fy });
        }
      }
    });
  });

  // Scrambler + gate
  const scrambler = Bodies.rectangle(W / 2, 140, 280, 8, {
    isStatic: true, friction: 0.01, frictionStatic: SF, restitution: 0.5, label: 'windmill',
  });
  Composite.add(world, scrambler);
  wmBodies.push({ body: scrambler, x: W / 2, y: 140, w: 280, s: 0.04 });

  const gate = Bodies.rectangle(W / 2, 230, W - 20, 10, {
    isStatic: true, friction: 0.1, frictionStatic: 0.1, restitution: 0.3, label: 'gate',
  });
  Composite.add(world, gate);

  // Marbles — exact race.ts physics (frictionStatic dropped from 0.1 to 0.001)
  const marbleBodies: { body: Matter.Body; data: MarbleData }[] = [];
  const shuffled = [...MARBLES].sort(() => Math.random() - 0.5);
  shuffled.forEach((m, i) => {
    const sx = W / 2 + (Math.random() - 0.5) * 160;
    const sy = 40 + i * 16 + (Math.random() - 0.5) * 8;
    const body = Bodies.circle(sx, sy, 11, {
      restitution: 0.48 + m.stats.bounce * 0.01,
      friction: 0.00001,
      frictionStatic: 0.001,
      density: 0.001 + m.stats.power * 0.00005,
      frictionAir: 0.008 - m.stats.speed * 0.0005,
      label: m.id,
      collisionFilter: MARBLE_F,
    });
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.5, y: 0.3 + Math.random() * 0.3 });
    Composite.add(world, body);
    marbleBodies.push({ body, data: m });
  });

  // Settle behind gate
  for (let i = 0; i < 60; i++) {
    wmBodies.forEach(wm => Body.setAngle(wm.body, wm.body.angle + wm.s));
    for (let s = 0; s < SUBSTEPS; s++) Engine.update(engine, FIXED_DT);
  }

  // Open gate
  Composite.remove(world, gate);
  Composite.remove(world, scrambler);
  const scrIdx = wmBodies.findIndex(w => w.body === scrambler);
  if (scrIdx >= 0) wmBodies.splice(scrIdx, 1);

  // Run race
  let elapsed = 0;
  const finishTimes: Record<string, number> = {};
  const stuckTracker = new Map<string, { x: number; y: number; t: number }>();
  const stuckEvents: StuckEvent[] = [];
  const stuckKickCount = new Map<string, number>();
  let doomsdayTriggered = false;

  // Doomsday state
  let doomsdayBar: Matter.Body | null = null;
  let doomsdayBarActive = false;
  let doomsdayBarStartY = 0;
  let doomsdayBarStartTime = 0;
  let doomsdayBarEndY = 0;
  let doomsdayBarDuration = 0;

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    elapsed += 16.67;

    // Doomsday bar
    const unfinished = marbleBodies.filter(({ data }) => !finishTimes[data.id]);
    if (!doomsdayBarActive && elapsed >= DOOMSDAY_TRIGGER_MS && unfinished.length > 0) {
      doomsdayTriggered = true;
      let highestY = Infinity;
      for (const { body } of unfinished) {
        if (body.position.y < highestY) highestY = body.position.y;
      }
      doomsdayBarStartY = highestY - 100;
      doomsdayBarStartTime = elapsed;
      doomsdayBarEndY = track.finishY + 50;
      doomsdayBarDuration = DOOMSDAY_DEADLINE_MS - elapsed;
      doomsdayBar = Bodies.rectangle(W / 2, doomsdayBarStartY, W + 100, DOOMSDAY_BAR_HEIGHT, {
        isStatic: true, friction: 0.1, restitution: 0.3,
        label: 'doomsday-bar', collisionFilter: DOOMSDAY_F,
      });
      Composite.add(world, doomsdayBar);
      doomsdayBarActive = true;
    }
    if (doomsdayBarActive && doomsdayBar) {
      const progress = Math.min(1, (elapsed - doomsdayBarStartTime) / Math.max(doomsdayBarDuration, 1));
      const newY = doomsdayBarStartY + progress * (doomsdayBarEndY - doomsdayBarStartY);
      if (newY >= track.finishY + 50) {
        Composite.remove(world, doomsdayBar);
        doomsdayBar = null;
        doomsdayBarActive = false;
      } else {
        const speed = (doomsdayBarEndY - doomsdayBarStartY) / (doomsdayBarDuration / 16.67);
        Body.setVelocity(doomsdayBar, { x: 0, y: speed });
        Body.setPosition(doomsdayBar, { x: W / 2, y: newY });
      }
    }

    // Windmill rotation
    wmBodies.forEach(wm => Body.setAngle(wm.body, wm.body.angle + wm.s));

    // Physics substeps
    for (let s = 0; s < SUBSTEPS; s++) Engine.update(engine, FIXED_DT);

    // Post-step
    marbleBodies.forEach(({ body, data }) => {
      if (finishTimes[data.id]) return;

      // Velocity cap
      const vx = body.velocity.x, vy = body.velocity.y;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > MAX_SPEED) {
        const sc = MAX_SPEED / speed;
        Body.setVelocity(body, { x: vx * sc, y: vy * sc });
      }

      // Luck nudge
      if (Math.random() < 0.005 * data.stats.luck) {
        Body.applyForce(body, body.position, {
          x: (Math.random() - 0.5) * 0.0003 * body.mass, y: 0,
        });
      }

      // HONEST stuck detection — no velocity kick, mirrors engine behavior.
      // A marble that hasn't moved STUCK_DIST_PX in REAL_STUCK_MS is a
      // genuine stuck event. We log it once per stuck-window and reset
      // the tracker so a marble pinned for 9s logs 3 events (one per 3s).
      const last = stuckTracker.get(data.id);
      if (last) {
        const dx = body.position.x - last.x, dy = body.position.y - last.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= STUCK_DIST_PX) {
          stuckTracker.set(data.id, { x: body.position.x, y: body.position.y, t: elapsed });
        } else if (elapsed - last.t >= REAL_STUCK_MS) {
          stuckEvents.push({
            marble: data.name, x: Math.round(body.position.x),
            y: Math.round(body.position.y), time: (elapsed / 1000).toFixed(1) + 's',
          });
          // Reset the timer so we don't log every frame after the threshold.
          stuckTracker.set(data.id, { x: body.position.x, y: body.position.y, t: elapsed });
        }
      } else {
        stuckTracker.set(data.id, { x: body.position.x, y: body.position.y, t: elapsed });
      }

      // Finish detection
      if (body.position.y >= track.finishY) {
        finishTimes[data.id] = elapsed;
        body.frictionAir = 0.15;
        body.restitution = 0.1;
        body.friction = 0.3;
      }

      // Escape detection
      if (body.position.x < -20 || body.position.x > W + 20 || body.position.y < -100) {
        stuckEvents.push({
          marble: data.name, x: Math.round(body.position.x), y: Math.round(body.position.y),
          time: (elapsed / 1000).toFixed(1) + 's', type: 'ESCAPED',
        });
      }
    });

    if (Object.keys(finishTimes).length >= MARBLES.length) break;
  }

  // Force-finish remaining
  marbleBodies.forEach(({ data, body }) => {
    if (!finishTimes[data.id]) finishTimes[data.id] = elapsed + (track.finishY - body.position.y) * 8;
  });

  const finishedNaturally = Object.keys(finishTimes).filter(id => {
    const m = marbleBodies.find(mb => mb.data.id === id);
    return m && m.body.position.y >= track.finishY - 50;
  }).length;

  const bodyCount = Composite.allBodies(world).length;
  Engine.clear(engine);

  return {
    trackId,
    bodyCount,
    totalTime: (elapsed / 1000).toFixed(1) + 's',
    totalTimeMs: elapsed,
    finishedNaturally,
    totalMarbles: MARBLES.length,
    stuckEvents,
    doomsdayTriggered,
    obstacleCount: track.obstacles.length,
    trackHeight: track.totalHeight,
    finishY: track.finishY,
  };
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
const targetTrack = process.argv[2];
const RUNS_PER_TRACK = 5;

// Get all course IDs
let courseIds: string[];
if (targetTrack) {
  courseIds = [targetTrack];
} else {
  courseIds = ALL_COURSES.map(c => c.trackType);
  // Deduplicate (some courses share trackType like pendulum-alley)
  courseIds = [...new Set(courseIds)];
}

console.log(`\nDonkeyMarbleRacing — Comprehensive Track Audit`);
console.log(`Testing ${courseIds.length} unique tracks × ${RUNS_PER_TRACK} runs each...\n`);

interface TrackAudit {
  id: string;
  avgTime: number;
  minFinished: number;
  avgFinished: number;
  totalStuck: number;
  maxStuck: number;
  doomsdayCount: number;
  bodyCount: number;
  pass: boolean;
  issues: string[];
}

const results: TrackAudit[] = [];
let passCount = 0;
let failCount = 0;

for (let idx = 0; idx < courseIds.length; idx++) {
  const id = courseIds[idx];
  const runs: RaceResult[] = [];

  for (let run = 0; run < RUNS_PER_TRACK; run++) {
    try {
      runs.push(simulateRace(id));
    } catch (e: any) {
      console.log(`  ERROR on ${id} run ${run + 1}: ${e.message}`);
      runs.push({
        trackId: id, bodyCount: 0, totalTime: '65.0s', totalTimeMs: 65000,
        finishedNaturally: 0, totalMarbles: 8, stuckEvents: [],
        doomsdayTriggered: false, obstacleCount: 0, trackHeight: 0, finishY: 0,
      });
    }
  }

  const avgTime = runs.reduce((s, r) => s + r.totalTimeMs, 0) / RUNS_PER_TRACK / 1000;
  const minFinished = Math.min(...runs.map(r => r.finishedNaturally));
  const avgFinished = Math.round(runs.reduce((s, r) => s + r.finishedNaturally, 0) / RUNS_PER_TRACK);
  const totalStuck = runs.reduce((s, r) => s + r.stuckEvents.length, 0);
  const maxStuck = Math.max(...runs.map(r => r.stuckEvents.length));
  const doomsdayCount = runs.filter(r => r.doomsdayTriggered).length;
  const bodyCount = runs[0].bodyCount;

  // Pass criteria — STRICT, post-nudge-removal:
  // - All 8 marbles must finish naturally (no doomsday rescue)
  // - Avg time under 55s (doomsday trigger; healthy tracks beat this)
  // - Zero "real stuck" events (3-second-motionless windows)
  // - No marble escapes
  // Body count > 100 is a perf concern, not a correctness one — informational only.
  const issues: string[] = [];
  if (minFinished < 8) issues.push(`Only ${minFinished}/8 finished in worst run`);
  if (avgTime > 55) issues.push(`Avg time ${avgTime.toFixed(1)}s > 55s`);
  if (maxStuck > 0) issues.push(`${maxStuck} real-stuck events in worst run`);
  if (doomsdayCount > 0) issues.push(`Doomsday triggered ${doomsdayCount}/${RUNS_PER_TRACK} runs`);

  const escaped = runs.some(r => r.stuckEvents.some(e => e.type === 'ESCAPED'));
  if (escaped) issues.push('Marble ESCAPED the course!');

  const pass = minFinished >= 8 && avgTime <= 55 && maxStuck === 0 && !escaped && doomsdayCount === 0;

  results.push({ id, avgTime, minFinished, avgFinished, totalStuck, maxStuck, doomsdayCount, bodyCount, pass, issues });

  if (pass) passCount++;
  else failCount++;

  const status = pass ? 'PASS' : 'FAIL';
  const progress = `[${idx + 1}/${courseIds.length}]`;
  const isGen = id.startsWith('gen-');
  console.log(`${progress} ${status} ${id.padEnd(22)} avg=${avgTime.toFixed(1)}s  fin=${minFinished}-${avgFinished}/8  stuck=${totalStuck}  doom=${doomsdayCount}  bodies=${bodyCount}${issues.length > 0 ? '  !! ' + issues[0] : ''}`);
}

// ═══════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════
console.log(`\n${'═'.repeat(70)}`);
console.log(`  AUDIT SUMMARY`);
console.log(`${'═'.repeat(70)}`);
console.log(`  Total tracks tested: ${courseIds.length}`);
console.log(`  PASS: ${passCount}  |  FAIL: ${failCount}`);
console.log(`  Pass rate: ${((passCount / courseIds.length) * 100).toFixed(1)}%`);
console.log('');

if (failCount > 0) {
  console.log(`  FAILING TRACKS:`);
  results.filter(r => !r.pass).forEach(r => {
    console.log(`    ${r.id.padEnd(22)} avg=${r.avgTime.toFixed(1)}s  fin=${r.minFinished}/8  stuck=${r.totalStuck}  issues: ${r.issues.join('; ')}`);
  });
  console.log('');
}

// Stats
const avgTimes = results.map(r => r.avgTime);
const avgOverall = avgTimes.reduce((s, t) => s + t, 0) / avgTimes.length;
const slowest = results.reduce((a, b) => a.avgTime > b.avgTime ? a : b);
const fastest = results.reduce((a, b) => a.avgTime < b.avgTime ? a : b);
console.log(`  Avg race time: ${avgOverall.toFixed(1)}s`);
console.log(`  Fastest: ${fastest.id} (${fastest.avgTime.toFixed(1)}s)`);
console.log(`  Slowest: ${slowest.id} (${slowest.avgTime.toFixed(1)}s)`);
console.log('');

// Output failing seed list for easy removal/fixing
const failingSeeds = results.filter(r => !r.pass && r.id.startsWith('gen-')).map(r => parseInt(r.id.slice(4)));
if (failingSeeds.length > 0) {
  console.log(`  FAILING GENERATED SEEDS (${failingSeeds.length}):`);
  console.log(`  ${JSON.stringify(failingSeeds)}`);
}
console.log('');
