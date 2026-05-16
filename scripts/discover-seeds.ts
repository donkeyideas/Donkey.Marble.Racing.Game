// Discover 100+ valid seeds for procedural track generation
// Usage: npx tsx scripts/discover-seeds.ts
// Scans seeds 2100-4000, validates with 3 runs each

import Matter from 'matter-js';
import { buildTrack, TrackConfig, ENGINE_WIDTH } from '../engine/tracks';
import { MARBLES } from '../theme';

const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;

const W = ENGINE_WIDTH;
const SUBSTEPS = 3;
const FIXED_DT = (1000 / 60) / SUBSTEPS;
const MAX_SPEED = 15;
const DOOMSDAY_TRIGGER_MS = 45000;
const DOOMSDAY_DEADLINE_MS = 60000;
const DOOMSDAY_BAR_HEIGHT = 20;
const MAX_FRAMES = 65 * 60;

const CAT_WALL = 0x0001;
const CAT_MARBLE = 0x0002;
const CAT_OBS = 0x0004;
const CAT_DOOMSDAY = 0x0008;
const MARBLE_F = { category: CAT_MARBLE, mask: CAT_WALL | CAT_MARBLE | CAT_OBS | CAT_DOOMSDAY };
const OBS_F = { category: CAT_OBS, mask: CAT_WALL | CAT_MARBLE };
const CRADLE_F = { category: CAT_OBS, mask: CAT_WALL | CAT_MARBLE | CAT_OBS };
const DOOMSDAY_F = { category: CAT_DOOMSDAY, mask: CAT_MARBLE };

const MAX_TRAMP_BOUNCES = 5;

interface RunResult {
  finished: number;
  avgTimeMs: number;
  stuckEvents: number;
  doomsday: boolean;
  escaped: boolean;
}

function simulateRace(trackId: string): RunResult {
  let track: TrackConfig;
  try {
    track = buildTrack(trackId);
  } catch {
    return { finished: 0, avgTimeMs: 99000, stuckEvents: 999, doomsday: true, escaped: true };
  }

  const engine = Engine.create({ gravity: track.gravity, positionIterations: 10, velocityIterations: 8 } as any);
  const world = engine.world;

  // Walls
  Composite.add(world, [
    Bodies.rectangle(0, track.totalHeight / 2, 50, track.totalHeight + 200, { isStatic: true, friction: 0.01, restitution: 0.2 }),
    Bodies.rectangle(W, track.totalHeight / 2, 50, track.totalHeight + 200, { isStatic: true, friction: 0.01, restitution: 0.2 }),
    Bodies.rectangle(W / 2, -25, W + 100, 50, { isStatic: true, friction: 0.01, restitution: 0.2 }),
    Bodies.rectangle(W / 2, track.totalHeight + 25, W + 100, 50, { isStatic: true, friction: 0.3, restitution: 0.1 }),
  ]);

  // Ramps
  track.ramps.forEach(ramp => {
    for (let j = 0; j < ramp.points.length - 1; j++) {
      const a = ramp.points[j], b = ramp.points[j + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      Composite.add(world, Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len + 6, 14, {
        isStatic: true, angle: Math.atan2(dy, dx), friction: 0.005, restitution: 0.3, chamfer: { radius: 4 }, label: 'ramp',
      }));
    }
  });

  // Obstacles
  track.obstacles.forEach(o => {
    Composite.add(world, Bodies.circle(o.x, o.y, o.r, {
      isStatic: true, restitution: o.type === 'bumper' ? 0.6 : 0.3, friction: 0.005, label: o.type,
    }));
  });

  // Funnels
  track.funnels.forEach(f => {
    const dy = f.y2 - f.y1;
    const ldx = f.leftX2 - f.leftX1, lLen = Math.sqrt(ldx * ldx + dy * dy);
    Composite.add(world, Bodies.rectangle((f.leftX1 + f.leftX2) / 2, (f.y1 + f.y2) / 2, lLen, 12, {
      isStatic: true, angle: Math.atan2(dy, ldx), friction: 0.005, restitution: 0.35, label: 'funnel',
    }));
    const rdx = f.rightX2 - f.rightX1, rLen = Math.sqrt(rdx * rdx + dy * dy);
    Composite.add(world, Bodies.rectangle((f.rightX1 + f.rightX2) / 2, (f.y1 + f.y2) / 2, rLen, 12, {
      isStatic: true, angle: Math.atan2(dy, rdx), friction: 0.005, restitution: 0.35, label: 'funnel',
    }));
  });

  // Finish zone
  const ff = track.finishFunnel;
  const fdy = ff.y2 - ff.y1;
  const fldx = ff.leftX2 - ff.leftX1, flLen = Math.sqrt(fldx * fldx + fdy * fdy);
  Composite.add(world, Bodies.rectangle((ff.leftX1 + ff.leftX2) / 2, (ff.y1 + ff.y2) / 2, flLen, 14, {
    isStatic: true, angle: Math.atan2(fdy, fldx), friction: 0.005, restitution: 0.3,
  }));
  const frdx = ff.rightX2 - ff.rightX1, frLen = Math.sqrt(frdx * frdx + fdy * fdy);
  Composite.add(world, Bodies.rectangle((ff.rightX1 + ff.rightX2) / 2, (ff.y1 + ff.y2) / 2, frLen, 14, {
    isStatic: true, angle: Math.atan2(fdy, frdx), friction: 0.005, restitution: 0.3,
  }));
  const miniH = track.miniFunnelH;
  const funnelExitLeft = ff.leftX2, funnelExitRight = ff.rightX2;
  const mlDx = track.channelLeft - funnelExitLeft;
  Composite.add(world, Bodies.rectangle((funnelExitLeft + track.channelLeft) / 2, track.finishY + miniH / 2, Math.sqrt(mlDx * mlDx + miniH * miniH), 10, {
    isStatic: true, angle: Math.atan2(miniH, mlDx), friction: 0.005, restitution: 0.3,
  }));
  const mrDx = track.channelRight - funnelExitRight;
  Composite.add(world, Bodies.rectangle((funnelExitRight + track.channelRight) / 2, track.finishY + miniH / 2, Math.sqrt(mrDx * mrDx + miniH * miniH), 10, {
    isStatic: true, angle: Math.atan2(miniH, mrDx), friction: 0.005, restitution: 0.3,
  }));
  Composite.add(world, Bodies.rectangle(track.channelLeft - 5, track.finishY + miniH + (track.channelDepth - miniH) / 2, 10, track.channelDepth - miniH + 20, { isStatic: true, friction: 0.005, restitution: 0.2 }));
  Composite.add(world, Bodies.rectangle(track.channelRight + 5, track.finishY + miniH + (track.channelDepth - miniH) / 2, 10, track.channelDepth - miniH + 20, { isStatic: true, friction: 0.005, restitution: 0.2 }));
  Composite.add(world, Bodies.rectangle(track.channelCX, track.finishY + track.channelDepth + 10, (track.channelRight - track.channelLeft) + 20, 14, { isStatic: true, friction: 0.5, restitution: 0.1 }));

  // Windmills
  const wmBodies: { body: Matter.Body; s: number }[] = [];
  track.windmillConfigs.forEach(wm => {
    const blade = Bodies.rectangle(wm.x, wm.y, wm.width, 8, { isStatic: true, friction: 0.01, restitution: 0.5, label: 'windmill' });
    Composite.add(world, blade);
    wmBodies.push({ body: blade, s: wm.speed });
  });

  // Springs
  track.springs.forEach(sp => {
    Composite.add(world, Bodies.rectangle(sp.x, sp.y, sp.w, sp.h, { isStatic: true, isSensor: true, label: 'spring' }));
  });

  // Trampoline tracking
  const trampBodies: { body: Matter.Body; strength: number }[] = [];
  const trampBounceCount = new Map<Matter.Body, number>();

  // Pendulums
  if (track.pendulums) {
    track.pendulums.forEach(p => {
      const bob = Bodies.circle(p.anchorX, p.anchorY + p.length, p.bobRadius, {
        density: 0.008, restitution: 0.8, friction: 0.005, frictionAir: 0.005, label: 'pendulum-bob', collisionFilter: OBS_F,
      });
      Composite.add(world, [bob, Constraint.create({ pointA: { x: p.anchorX, y: p.anchorY }, bodyB: bob, length: p.length, stiffness: 1, damping: 0 })]);
      Body.setVelocity(bob, { x: p.startVelocityX, y: 0 });
    });
  }

  // Ball pits
  if (track.ballPits) {
    track.ballPits.forEach(pit => {
      const cols = Math.floor(pit.width / (pit.ballRadius * 3));
      for (let i = 0; i < pit.ballCount; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const offX = row % 2 === 0 ? 0 : pit.ballRadius * 1.5;
        const bx = pit.x + pit.ballRadius * 2 + col * (pit.width / cols) + offX;
        const by = pit.y + pit.ballRadius * 2 + row * (pit.height / Math.max(1, Math.ceil(pit.ballCount / cols)));
        Composite.add(world, Bodies.circle(bx, by, pit.ballRadius, {
          density: 0.001, restitution: 0.5, friction: 0.005, frictionAir: 0.01, label: 'pit-ball', collisionFilter: OBS_F,
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
          inertia: Infinity, restitution: 1.0, friction: 0, frictionAir: 0, slop: c.ballRadius * 0.02,
          label: 'cradle-bob', collisionFilter: CRADLE_F,
        });
        Composite.add(world, [bob, Constraint.create({ pointA: { x: bx, y: c.y }, bodyB: bob, length: c.length, stiffness: 1, damping: 0 })]);
        bobs.push(bob);
      }
      if (bobs.length > 0) Body.translate(bobs[0], { x: -c.spacing * 1.5, y: -c.length * 0.15 });
    });
  }

  // Trampolines
  if (track.trampolines) {
    track.trampolines.forEach(t => {
      const body = Bodies.rectangle(t.x, t.y, t.width, 10, {
        isStatic: true, restitution: 0.5, friction: 0.005, label: 'trampoline', chamfer: { radius: 3 },
      });
      trampBounceCount.set(body, 0);
      Composite.add(world, body);
      trampBodies.push({ body, strength: t.strength });
    });
  }

  // Speed bursts
  if (track.speedBursts) {
    track.speedBursts.forEach(sb => {
      Composite.add(world, Bodies.rectangle(sb.x, sb.y, sb.width, 12, { isStatic: true, isSensor: true, label: 'speedburst' }));
    });
  }

  // Collision handler
  Events.on(engine, 'collisionStart', (event: any) => {
    event.pairs.forEach((pair: any) => {
      const { bodyA, bodyB } = pair;
      let marble: Matter.Body | null = null;
      if (bodyA.label === 'spring' && !bodyB.isStatic) marble = bodyB;
      else if (bodyB.label === 'spring' && !bodyA.isStatic) marble = bodyA;
      if (marble) {
        const toCenter = marble.position.x < W / 2 ? 1 : -1;
        Body.applyForce(marble, marble.position, { x: toCenter * 0.002 * marble.mass, y: 0.001 * marble.mass });
        return;
      }

      let tMarble: Matter.Body | null = null, trampBody: Matter.Body | null = null;
      if (bodyA.label === 'trampoline' && !bodyB.isStatic) { tMarble = bodyB; trampBody = bodyA; }
      else if (bodyB.label === 'trampoline' && !bodyA.isStatic) { tMarble = bodyA; trampBody = bodyB; }
      if (tMarble && trampBody) {
        const cnt = trampBounceCount.get(trampBody) || 0;
        if (cnt >= MAX_TRAMP_BOUNCES) return;
        trampBounceCount.set(trampBody, cnt + 1);
        if (cnt + 1 >= MAX_TRAMP_BOUNCES) trampBody.isSensor = true;
        const tb = trampBodies.find(t => t.body === trampBody);
        Body.applyForce(tMarble, tMarble.position, {
          x: (Math.random() - 0.5) * 0.001 * tMarble.mass,
          y: -(tb ? tb.strength : 5) * 0.0008 * tMarble.mass,
        });
      }

      let sbMarble: Matter.Body | null = null, sbBody: Matter.Body | null = null;
      if (bodyA.label === 'speedburst' && !bodyB.isStatic) { sbMarble = bodyB; sbBody = bodyA; }
      else if (bodyB.label === 'speedburst' && !bodyA.isStatic) { sbMarble = bodyA; sbBody = bodyB; }
      if (sbMarble && sbBody && track.speedBursts) {
        const sbConfig = track.speedBursts.find(sb => Math.abs(sb.x - sbBody!.position.x) < 5 && Math.abs(sb.y - sbBody!.position.y) < 10);
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
  const scrambler = Bodies.rectangle(W / 2, 140, 280, 8, { isStatic: true, friction: 0.01, restitution: 0.5, label: 'windmill' });
  Composite.add(world, scrambler);
  wmBodies.push({ body: scrambler, s: 0.04 });
  const gate = Bodies.rectangle(W / 2, 230, W - 20, 10, { isStatic: true, friction: 0.1, restitution: 0.3, label: 'gate' });
  Composite.add(world, gate);

  // Marbles
  const marbleBodies: { body: Matter.Body; id: string }[] = [];
  const shuffled = [...MARBLES].sort(() => Math.random() - 0.5);
  shuffled.forEach((m, i) => {
    const body = Bodies.circle(W / 2 + (Math.random() - 0.5) * 160, 40 + i * 16 + (Math.random() - 0.5) * 8, 11, {
      restitution: 0.48 + m.stats.bounce * 0.01, friction: 0.00001, frictionStatic: 0.1,
      density: 0.001 + m.stats.power * 0.00005, frictionAir: 0.008 - m.stats.speed * 0.0005,
      label: m.id, collisionFilter: MARBLE_F,
    });
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.5, y: 0.3 + Math.random() * 0.3 });
    Composite.add(world, body);
    marbleBodies.push({ body, id: m.id });
  });

  // Settle
  for (let i = 0; i < 60; i++) {
    wmBodies.forEach(wm => Body.setAngle(wm.body, wm.body.angle + wm.s));
    for (let s = 0; s < SUBSTEPS; s++) Engine.update(engine, FIXED_DT);
  }
  Composite.remove(world, gate);
  Composite.remove(world, scrambler);
  const scrIdx = wmBodies.findIndex(w => w.body === scrambler);
  if (scrIdx >= 0) wmBodies.splice(scrIdx, 1);

  // Run
  let elapsed = 0;
  const finishTimes: Record<string, number> = {};
  const stuckTracker = new Map<string, { x: number; y: number; t: number }>();
  let stuckEvents = 0;
  let doomsdayTriggered = false;
  let escaped = false;

  let doomsdayBar: Matter.Body | null = null;
  let doomsdayBarActive = false;
  let doomsdayBarStartY = 0, doomsdayBarStartTime = 0, doomsdayBarEndY = 0, doomsdayBarDuration = 0;

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    elapsed += 16.67;

    const unfinished = marbleBodies.filter(({ id }) => !finishTimes[id]);
    if (!doomsdayBarActive && elapsed >= DOOMSDAY_TRIGGER_MS && unfinished.length > 0) {
      doomsdayTriggered = true;
      let highestY = Infinity;
      for (const { body } of unfinished) if (body.position.y < highestY) highestY = body.position.y;
      doomsdayBarStartY = highestY - 100;
      doomsdayBarStartTime = elapsed;
      doomsdayBarEndY = track.finishY + 50;
      doomsdayBarDuration = DOOMSDAY_DEADLINE_MS - elapsed;
      doomsdayBar = Bodies.rectangle(W / 2, doomsdayBarStartY, W + 100, DOOMSDAY_BAR_HEIGHT, {
        isStatic: true, friction: 0.1, restitution: 0.3, label: 'doomsday-bar', collisionFilter: DOOMSDAY_F,
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
        Body.setVelocity(doomsdayBar, { x: 0, y: (doomsdayBarEndY - doomsdayBarStartY) / (doomsdayBarDuration / 16.67) });
        Body.setPosition(doomsdayBar, { x: W / 2, y: newY });
      }
    }

    wmBodies.forEach(wm => Body.setAngle(wm.body, wm.body.angle + wm.s));
    for (let s = 0; s < SUBSTEPS; s++) Engine.update(engine, FIXED_DT);

    marbleBodies.forEach(({ body, id }) => {
      if (finishTimes[id]) return;
      const vx = body.velocity.x, vy = body.velocity.y;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > MAX_SPEED) { const sc = MAX_SPEED / speed; Body.setVelocity(body, { x: vx * sc, y: vy * sc }); }

      const last = stuckTracker.get(id);
      if (last) {
        const dx = body.position.x - last.x, dy = body.position.y - last.y;
        if (Math.sqrt(dx * dx + dy * dy) < 4 && elapsed - last.t > 800) {
          const kicks = 1;
          stuckEvents++;
          Body.setVelocity(body, { x: (Math.random() - 0.5) * 5 * kicks, y: 4 + Math.random() * 2 * kicks });
          stuckTracker.set(id, { x: body.position.x, y: body.position.y, t: elapsed });
        } else if (Math.sqrt(dx * dx + dy * dy) >= 4) {
          stuckTracker.set(id, { x: body.position.x, y: body.position.y, t: elapsed });
        }
      } else {
        stuckTracker.set(id, { x: body.position.x, y: body.position.y, t: elapsed });
      }

      if (body.position.y >= track.finishY) {
        finishTimes[id] = elapsed;
        body.frictionAir = 0.15; body.restitution = 0.1; body.friction = 0.3;
      }
      if (body.position.x < -20 || body.position.x > W + 20 || body.position.y < -100) escaped = true;
    });

    if (Object.keys(finishTimes).length >= MARBLES.length) break;
  }

  const finishedNaturally = marbleBodies.filter(({ body, id }) => finishTimes[id] && body.position.y >= track.finishY - 50).length;
  const times = Object.values(finishTimes);
  const avgTimeMs = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 99000;

  Engine.clear(engine);
  return { finished: finishedNaturally, avgTimeMs, stuckEvents, doomsday: doomsdayTriggered, escaped };
}

// ═══════════════════════════════════════════
// MAIN — scan seeds and find valid ones
// ═══════════════════════════════════════════
const SEED_START = 2100;
const SEED_END = 4500;
const TARGET_COUNT = 110; // find 110 to have buffer
const RUNS_PER_SEED = 3;

const validSeeds: number[] = [];
let tested = 0;

console.log(`Scanning seeds ${SEED_START}-${SEED_END} for ${TARGET_COUNT} valid tracks...\n`);

for (let seed = SEED_START; seed <= SEED_END && validSeeds.length < TARGET_COUNT; seed++) {
  tested++;
  const trackId = `gen-${seed}`;
  let allPass = true;
  let totalAvg = 0;
  let maxStuck = 0;

  for (let run = 0; run < RUNS_PER_SEED; run++) {
    try {
      const result = simulateRace(trackId);
      totalAvg += result.avgTimeMs;
      maxStuck = Math.max(maxStuck, result.stuckEvents);
      if (result.finished < 8 || result.avgTimeMs > 55000 || result.stuckEvents > 30 || result.escaped) {
        allPass = false;
        break;
      }
    } catch {
      allPass = false;
      break;
    }
  }

  if (allPass) {
    validSeeds.push(seed);
    const avg = (totalAvg / RUNS_PER_SEED / 1000).toFixed(1);
    if (validSeeds.length % 10 === 0) {
      console.log(`  Found ${validSeeds.length}/${TARGET_COUNT} valid seeds (tested ${tested}, latest: ${seed}, avg=${avg}s)`);
    }
  }

  if (tested % 100 === 0 && validSeeds.length < TARGET_COUNT) {
    console.log(`  Progress: tested ${tested} seeds, found ${validSeeds.length} valid so far...`);
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`  DISCOVERY COMPLETE`);
console.log(`${'═'.repeat(60)}`);
console.log(`  Seeds tested: ${tested}`);
console.log(`  Valid seeds found: ${validSeeds.length}`);
console.log(`  Pass rate: ${((validSeeds.length / tested) * 100).toFixed(1)}%`);
console.log('');
console.log(`  // Add these to VALIDATED_SEEDS in data/courses.ts:`);

// Format in rows of 8
const rows: string[] = [];
for (let i = 0; i < validSeeds.length; i += 8) {
  rows.push('  ' + validSeeds.slice(i, i + 8).join(', ') + ',');
}
console.log(`  const NEW_SEEDS: number[] = [\n${rows.join('\n')}\n  ];`);
console.log('');
