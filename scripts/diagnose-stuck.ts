// Diagnose stuck-marble locations on a specific track.
// Usage: npx tsx scripts/diagnose-stuck.ts <track-id> [runs]
//
// Runs the race exactly like test-all-tracks.ts BUT instead of just
// counting stuck events, it prints the exact (x, y) of every stuck
// position, the time it happened, and lists every nearby static body
// (ramp/funnel/peg/bumper) within 30px so we can see what geometry is
// pinning the marble.

import Matter from 'matter-js';
import { buildTrack, ENGINE_WIDTH } from '../engine/tracks';
import { MARBLES, MarbleData } from '../theme';

const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;
const W = ENGINE_WIDTH;
const SUBSTEPS = 3;
const FIXED_DT = (1000 / 60) / SUBSTEPS;
const MAX_SPEED = 15;
const REAL_STUCK_MS = 3000;
const STUCK_DIST_PX = 4;
const MAX_FRAMES = 65 * 60;

const CAT_WALL = 0x0001;
const CAT_MARBLE = 0x0002;
const CAT_OBS = 0x0004;
const MARBLE_F = { category: CAT_MARBLE, mask: CAT_WALL | CAT_MARBLE | CAT_OBS };
const OBS_F = { category: CAT_OBS, mask: CAT_WALL | CAT_MARBLE };
const CRADLE_F = { category: CAT_OBS, mask: CAT_WALL | CAT_MARBLE | CAT_OBS };

interface StuckSample {
  marble: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  time: string;
  nearbyBodies: string[];
}

function diagnose(trackId: string, runIdx: number): StuckSample[] {
  const track = buildTrack(trackId);
  const engine = Engine.create({
    gravity: track.gravity,
    positionIterations: 10,
    velocityIterations: 8,
  } as any);
  const world = engine.world;

  // Walls
  Composite.add(world, [
    Bodies.rectangle(0, track.totalHeight / 2, 50, track.totalHeight + 200, { isStatic: true, friction: 0.01, restitution: 0.2, label: 'wall-L' }),
    Bodies.rectangle(W, track.totalHeight / 2, 50, track.totalHeight + 200, { isStatic: true, friction: 0.01, restitution: 0.2, label: 'wall-R' }),
    Bodies.rectangle(W / 2, -25, W + 100, 50, { isStatic: true, friction: 0.01, restitution: 0.2, label: 'ceiling' }),
    Bodies.rectangle(W / 2, track.totalHeight + 25, W + 100, 50, { isStatic: true, friction: 0.3, restitution: 0.1, label: 'floor' }),
  ]);

  // Ramps
  track.ramps.forEach((ramp, ri) => {
    for (let j = 0; j < ramp.points.length - 1; j++) {
      const a = ramp.points[j], b = ramp.points[j + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      Composite.add(world, Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len + 6, 14, {
        isStatic: true, angle: Math.atan2(dy, dx), friction: 0.005, frictionStatic: 0.005, restitution: 0.3,
        chamfer: { radius: 4 }, label: `ramp${ri}-seg${j}`,
      }));
    }
  });

  // Obstacles — apply pinch-zone repair before placing
  const MD = 22, WSL = 25, WSR = W - 25, PB = 4, RHT = 7;
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
          const need = dist - (minSafe - 0.5);
          const ux = dx / dist, uy = dy / dist;
          if (a.r <= b.r) { a.x += ux * need; a.y += uy * need; }
          else { b.x -= ux * need; b.y -= uy * need; }
        }
      }
    }
  }
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
  repaired.forEach((o, oi) => {
    Composite.add(world, Bodies.circle(o.x, o.y, o.r, {
      isStatic: true, restitution: o.type === 'bumper' ? 0.95 : 0.6,
      friction: 0.005, frictionStatic: 0.005, label: `${o.type}${oi}_r${o.r}`,
    }));
  });

  // Funnels
  track.funnels.forEach((f, fi) => {
    const dy = f.y2 - f.y1;
    const ldx = f.leftX2 - f.leftX1, lLen = Math.sqrt(ldx * ldx + dy * dy);
    Composite.add(world, Bodies.rectangle((f.leftX1 + f.leftX2) / 2, (f.y1 + f.y2) / 2, lLen, 12, {
      isStatic: true, angle: Math.atan2(dy, ldx), friction: 0.005, restitution: 0.35, label: `funnel${fi}-L`,
    }));
    const rdx = f.rightX2 - f.rightX1, rLen = Math.sqrt(rdx * rdx + dy * dy);
    Composite.add(world, Bodies.rectangle((f.rightX1 + f.rightX2) / 2, (f.y1 + f.y2) / 2, rLen, 12, {
      isStatic: true, angle: Math.atan2(dy, rdx), friction: 0.005, restitution: 0.35, label: `funnel${fi}-R`,
    }));
  });

  // Finish funnel/channel (same as race.ts)
  const ff = track.finishFunnel;
  const fdy = ff.y2 - ff.y1;
  const fldx = ff.leftX2 - ff.leftX1, flLen = Math.sqrt(fldx * fldx + fdy * fdy);
  Composite.add(world, Bodies.rectangle((ff.leftX1 + ff.leftX2) / 2, (ff.y1 + ff.y2) / 2, flLen, 14, {
    isStatic: true, angle: Math.atan2(fdy, fldx), friction: 0.005, restitution: 0.3, label: 'finish-L',
  }));
  const frdx = ff.rightX2 - ff.rightX1, frLen = Math.sqrt(frdx * frdx + fdy * fdy);
  Composite.add(world, Bodies.rectangle((ff.rightX1 + ff.rightX2) / 2, (ff.y1 + ff.y2) / 2, frLen, 14, {
    isStatic: true, angle: Math.atan2(fdy, frdx), friction: 0.005, restitution: 0.3, label: 'finish-R',
  }));
  const miniH = track.miniFunnelH;
  const fEL = ff.leftX2, fER = ff.rightX2;
  const mlDx = track.channelLeft - fEL;
  const mlLen = Math.sqrt(mlDx * mlDx + miniH * miniH);
  Composite.add(world, Bodies.rectangle((fEL + track.channelLeft) / 2, track.finishY + miniH / 2, mlLen, 10, {
    isStatic: true, angle: Math.atan2(miniH, mlDx), friction: 0.005, restitution: 0.3, label: 'mini-L',
  }));
  const mrDx = track.channelRight - fER;
  const mrLen = Math.sqrt(mrDx * mrDx + miniH * miniH);
  Composite.add(world, Bodies.rectangle((fER + track.channelRight) / 2, track.finishY + miniH / 2, mrLen, 10, {
    isStatic: true, angle: Math.atan2(miniH, mrDx), friction: 0.005, restitution: 0.3, label: 'mini-R',
  }));
  const channelTopY = track.finishY + miniH;
  const channelWallH = track.channelDepth - miniH;
  Composite.add(world, Bodies.rectangle(track.channelLeft - 5, channelTopY + channelWallH / 2, 10, channelWallH + 20, {
    isStatic: true, friction: 0.005, restitution: 0.2, label: 'chan-L',
  }));
  Composite.add(world, Bodies.rectangle(track.channelRight + 5, channelTopY + channelWallH / 2, 10, channelWallH + 20, {
    isStatic: true, friction: 0.005, restitution: 0.2, label: 'chan-R',
  }));
  Composite.add(world, Bodies.rectangle(track.channelCX, track.finishY + track.channelDepth + 10, (track.channelRight - track.channelLeft) + 20, 14, {
    isStatic: true, friction: 0.5, restitution: 0.1, label: 'chan-floor',
  }));

  // Windmills
  interface WMBody { body: Matter.Body; s: number }
  const wmBodies: WMBody[] = [];
  track.windmillConfigs.forEach((wm, wi) => {
    const blade = Bodies.rectangle(wm.x, wm.y, wm.width, 8, {
      isStatic: true, friction: 0.01, restitution: 0.5, label: `wm${wi}`,
    });
    Composite.add(world, blade);
    wmBodies.push({ body: blade, s: wm.speed });
  });

  // Springs (sensors)
  track.springs.forEach((sp, si) => {
    Composite.add(world, Bodies.rectangle(sp.x, sp.y, sp.w, sp.h, {
      isStatic: true, isSensor: true, label: `spring${si}`,
    }));
  });

  // Pendulums
  if (track.pendulums) {
    track.pendulums.forEach((p, pi) => {
      const bob = Bodies.circle(p.anchorX, p.anchorY + p.length, p.bobRadius, {
        density: 0.008, restitution: 0.8, friction: 0.005, frictionAir: 0.005,
        label: `pendulum${pi}`, collisionFilter: OBS_F,
      });
      Composite.add(world, [bob, Constraint.create({
        pointA: { x: p.anchorX, y: p.anchorY }, bodyB: bob, length: p.length, stiffness: 1, damping: 0,
      })]);
      Body.setVelocity(bob, { x: p.startVelocityX, y: 0 });
    });
  }

  // Cradles
  if (track.cradles) {
    track.cradles.forEach((c, ci) => {
      const bobs: Matter.Body[] = [];
      for (let i = 0; i < c.count; i++) {
        const bx = c.x - (c.count - 1) * c.spacing / 2 + i * c.spacing;
        const bob = Bodies.circle(bx, c.y + c.length, c.ballRadius, {
          inertia: Infinity, restitution: 1.0, friction: 0, frictionAir: 0,
          slop: c.ballRadius * 0.02, label: `cradle${ci}-${i}`, collisionFilter: CRADLE_F,
        });
        Composite.add(world, [bob, Constraint.create({
          pointA: { x: bx, y: c.y }, bodyB: bob, length: c.length, stiffness: 1, damping: 0,
        })]);
        bobs.push(bob);
      }
      if (bobs.length > 0) Body.translate(bobs[0], { x: -c.spacing * 1.5, y: -c.length * 0.15 });
    });
  }

  // Trampolines (tilted 2° outward)
  if (track.trampolines) {
    track.trampolines.forEach((t, ti) => {
      const tiltDir = t.x < W / 2 ? 1 : -1;
      const tilt = tiltDir * (2 * Math.PI / 180);
      Composite.add(world, Bodies.rectangle(t.x, t.y, t.width, 10, {
        isStatic: true, angle: tilt, restitution: 0.5, friction: 0.005, frictionStatic: 0.005, label: `tramp${ti}`, chamfer: { radius: 3 },
      }));
    });
  }

  // Ball pits
  if (track.ballPits) {
    track.ballPits.forEach((pit, pi) => {
      const cols = Math.floor(pit.width / (pit.ballRadius * 3));
      const rows = Math.ceil(pit.ballCount / cols);
      for (let i = 0; i < pit.ballCount; i++) {
        const col = i % cols, row = Math.floor(i / cols);
        const offX = row % 2 === 0 ? 0 : pit.ballRadius * 1.5;
        const bx = pit.x + pit.ballRadius * 2 + col * (pit.width / cols) + offX;
        const by = pit.y + pit.ballRadius * 2 + row * (pit.height / Math.max(1, rows));
        Composite.add(world, Bodies.circle(bx, by, pit.ballRadius, {
          density: 0.001, restitution: 0.5, friction: 0.005, frictionAir: 0.01,
          label: `pit${pi}-${i}`, collisionFilter: OBS_F,
        }));
      }
    });
  }

  // Scrambler + gate
  const scrambler = Bodies.rectangle(W / 2, 140, 280, 8, {
    isStatic: true, friction: 0.01, restitution: 0.5, label: 'scrambler',
  });
  Composite.add(world, scrambler);
  wmBodies.push({ body: scrambler, s: 0.04 });

  const gate = Bodies.rectangle(W / 2, 230, W - 20, 10, {
    isStatic: true, friction: 0.1, restitution: 0.3, label: 'gate',
  });
  Composite.add(world, gate);

  // Marbles
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
      label: m.id, collisionFilter: MARBLE_F,
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

  Composite.remove(world, gate);
  Composite.remove(world, scrambler);
  const scrIdx = wmBodies.findIndex(w => w.body === scrambler);
  if (scrIdx >= 0) wmBodies.splice(scrIdx, 1);

  // Run
  let elapsed = 0;
  const finishTimes: Record<string, number> = {};
  const stuckTracker = new Map<string, { x: number; y: number; t: number }>();
  const stuckSamples: StuckSample[] = [];

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    elapsed += 16.67;
    wmBodies.forEach(wm => Body.setAngle(wm.body, wm.body.angle + wm.s));
    for (let s = 0; s < SUBSTEPS; s++) Engine.update(engine, FIXED_DT);

    marbleBodies.forEach(({ body, data }) => {
      if (finishTimes[data.id]) return;
      const vx = body.velocity.x, vy = body.velocity.y;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > MAX_SPEED) {
        const sc = MAX_SPEED / speed;
        Body.setVelocity(body, { x: vx * sc, y: vy * sc });
      }
      const last = stuckTracker.get(data.id);
      if (last) {
        const dx = body.position.x - last.x, dy = body.position.y - last.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= STUCK_DIST_PX) {
          stuckTracker.set(data.id, { x: body.position.x, y: body.position.y, t: elapsed });
        } else if (elapsed - last.t >= REAL_STUCK_MS) {
          // Find nearby bodies (within 40px of marble center) INCLUDING other marbles
          const nearby: string[] = [];
          for (const b of Composite.allBodies(world)) {
            if (b === body) continue;
            const bdx = b.position.x - body.position.x;
            const bdy = b.position.y - body.position.y;
            const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
            if (bdist <= 40) {
              const marbleEntry = marbleBodies.find(m => m.body === b);
              if (marbleEntry) {
                nearby.push(`MARBLE:${marbleEntry.data.name}@(${b.position.x.toFixed(0)},${b.position.y.toFixed(0)})d=${bdist.toFixed(0)}v=(${b.velocity.x.toFixed(1)},${b.velocity.y.toFixed(1)})`);
              } else if (b.isStatic || ['pit-ball', 'cradle-bob', 'pendulum-bob'].some(l => b.label.startsWith(l))) {
                nearby.push(`${b.label}@(${b.position.x.toFixed(0)},${b.position.y.toFixed(0)})d=${bdist.toFixed(0)}`);
              }
            }
          }
          stuckSamples.push({
            marble: data.name,
            x: Math.round(body.position.x),
            y: Math.round(body.position.y),
            vx: +vx.toFixed(2),
            vy: +vy.toFixed(2),
            time: (elapsed / 1000).toFixed(1) + 's',
            nearbyBodies: nearby,
          });
          stuckTracker.set(data.id, { x: body.position.x, y: body.position.y, t: elapsed });
        }
      } else {
        stuckTracker.set(data.id, { x: body.position.x, y: body.position.y, t: elapsed });
      }
      if (body.position.y >= track.finishY) {
        finishTimes[data.id] = elapsed;
        body.frictionAir = 0.15;
        body.restitution = 0.1;
        body.friction = 0.3;
      }
    });
    if (Object.keys(finishTimes).length >= MARBLES.length) break;
  }

  Engine.clear(engine);
  return stuckSamples;
}

const targetTrack = process.argv[2];
const runs = parseInt(process.argv[3] || '5');
if (!targetTrack) {
  console.error('Usage: npx tsx scripts/diagnose-stuck.ts <track-id> [runs]');
  process.exit(1);
}

console.log(`\nDiagnosing ${targetTrack} over ${runs} runs...\n`);
const allSamples: StuckSample[] = [];
for (let r = 0; r < runs; r++) {
  const samples = diagnose(targetTrack, r);
  if (samples.length > 0) {
    console.log(`Run ${r + 1}: ${samples.length} stuck events`);
    samples.forEach(s => allSamples.push(s));
  }
}

// Aggregate by location bucket (round to nearest 20px) — shows hotspots
const hotspots = new Map<string, { count: number; samples: StuckSample[] }>();
for (const s of allSamples) {
  const bucket = `(${Math.floor(s.x / 20) * 20},${Math.floor(s.y / 20) * 20})`;
  const ex = hotspots.get(bucket) || { count: 0, samples: [] };
  ex.count++;
  ex.samples.push(s);
  hotspots.set(bucket, ex);
}

console.log(`\n=== STUCK HOTSPOTS (location bucketed to nearest 20px) ===`);
const sorted = [...hotspots.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [bucket, info] of sorted) {
  const sample = info.samples[0];
  console.log(`\n${bucket} — ${info.count} events`);
  console.log(`  Example: ${sample.marble} @ (${sample.x},${sample.y}) v=(${sample.vx},${sample.vy}) t=${sample.time}`);
  console.log(`  Nearby static bodies (<=40px):`);
  for (const nb of sample.nearbyBodies) console.log(`    ${nb}`);
}

console.log(`\nTotal stuck samples: ${allSamples.length} across ${runs} runs`);
