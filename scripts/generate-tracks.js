// Procedural track generator + headless validator
// Usage:
//   node scripts/generate-tracks.js --count 100
//   node scripts/generate-tracks.js --seed 12345
//   node scripts/generate-tracks.js --count 100 --output validated-seeds.json --verbose

const Matter = require('matter-js');
const fs = require('fs');
const path = require('path');
const { Engine, Bodies, Body, Composite, Constraint, Events } = Matter;

// ═══════════════════════════════════════════
// CONSTANTS (matching race.ts)
// ═══════════════════════════════════════════
const W = 400, ENTRY = -30, GAP = 100;
const SUBSTEPS = 3;
const FIXED_DT = (1000 / 60) / SUBSTEPS;
const CAT_WALL = 0x0001, CAT_MARBLE = 0x0002, CAT_OBS = 0x0004, CAT_DOOMSDAY = 0x0008;
const MARBLE_F = { category: CAT_MARBLE, mask: CAT_WALL | CAT_MARBLE | CAT_OBS | CAT_DOOMSDAY };
const OBS_F = { category: CAT_OBS, mask: CAT_WALL | CAT_MARBLE };
const CRADLE_F = { category: CAT_OBS, mask: CAT_WALL | CAT_MARBLE | CAT_OBS };
const DOOMSDAY_F = { category: CAT_DOOMSDAY, mask: CAT_MARBLE };

const MARBLES = [
  { id: 'rocky', name: 'Rocky', stats: { speed: 3, power: 4, bounce: 2, luck: 3 } },
  { id: 'dash', name: 'Dash', stats: { speed: 5, power: 2, bounce: 3, luck: 2 } },
  { id: 'lucky', name: 'Lucky', stats: { speed: 3, power: 3, bounce: 2, luck: 5 } },
  { id: 'spike', name: 'Spike', stats: { speed: 2, power: 5, bounce: 4, luck: 2 } },
  { id: 'nova', name: 'Nova', stats: { speed: 4, power: 2, bounce: 3, luck: 4 } },
  { id: 'frosty', name: 'Frosty', stats: { speed: 3, power: 3, bounce: 4, luck: 3 } },
  { id: 'aqua', name: 'Aqua', stats: { speed: 4, power: 2, bounce: 2, luck: 4 } },
  { id: 'shadow', name: 'Shadow', stats: { speed: 3, power: 4, bounce: 3, luck: 3 } },
];

// ═══════════════════════════════════════════
// SEEDED PRNG (mulberry32)
// ═══════════════════════════════════════════
function createRNG(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════
// TRACK HELPERS (matching tracks.ts)
// ═══════════════════════════════════════════
function rampPts(cy, isR, drop) {
  const sx = isR ? ENTRY : GAP, ex = isR ? W - GAP : W - ENTRY;
  const sy = isR ? cy - drop : cy + drop, ey = isR ? cy + drop : cy - drop;
  return [{ x: sx, y: sy }, { x: ex, y: ey }];
}
function mkSprings(cys, drop) {
  return cys.map((cy, i) => {
    const isR = i % 2 === 0;
    return { x: isR ? W - GAP / 2 : GAP / 2, y: cy + drop + 25, w: 35, h: 12 };
  });
}
function mkPegs(pegY, rows, cols, hs, vs) {
  const o = [];
  for (let r = 0; r < rows; r++) {
    const off = r % 2 === 0 ? 0 : hs / 2;
    for (let c = 0; c < cols; c++) {
      const px = 40 + off + c * hs, py = pegY - (rows * vs) / 2 + r * vs;
      if (px > 25 && px < W - 25) o.push({ x: px, y: py, r: 6, type: 'peg' });
    }
  }
  return o;
}
function mkFunnel(pegY, above, below) {
  return { y1: pegY - above, y2: pegY - below, lx1: 15, lx2: 155, rx1: W - 15, rx2: W - 155 };
}
function mkFinish(fy) {
  const cw = 35, cx = W / 2, cl = cx - cw / 2, cr = cx + cw / 2, cd = 220;
  return { cx, cl, cr, cd, funnel: { y1: fy - 160, y2: fy, lx1: 0, lx2: cl, rx1: W, rx2: cr } };
}
function gapBumpers(cy, sp) {
  return [
    { x: 130, y: cy - sp * 0.5, r: 14, type: 'bumper' },
    { x: 270, y: cy + sp * 0.5, r: 14, type: 'bumper' },
  ];
}

// ═══════════════════════════════════════════
// PROCEDURAL TRACK GENERATOR
// ═══════════════════════════════════════════
function generateTrack(seed) {
  const rng = createRNG(seed);

  // Parameter selection
  const rampCount = 6 + Math.floor(rng() * 4); // 6-9
  const rampDrop = 50 + Math.floor(rng() * 16); // 50-65 (was 45-65, too shallow at low end)
  const gravityY = 1.1 + rng() * 0.4; // 1.1-1.5 (min 1.1 to ensure flow)
  const pegDensity = rng() < 0.6 ? 'low' : 'medium';
  const pegZoneCount = 1 + Math.floor(rng() * 2); // 1-2

  const allFeatures = ['pendulums', 'trampolines', 'cradles', 'ballPits'];
  const featureCount = Math.floor(rng() * 3); // 0-2
  const shuffled = allFeatures.sort(() => rng() - 0.5);
  const features = shuffled.slice(0, featureCount);

  const useFunnels = pegDensity === 'low' && rng() < 0.5;
  const bumperCount = 2 + Math.floor(rng() * 7); // 2-8
  const windmillCount = 1 + Math.floor(rng() * 4); // 1-4
  const bgImages = ['grass', 'lava', 'ice', 'cyber'];
  const bgImage = bgImages[Math.floor(rng() * bgImages.length)];
  const useSpeedBursts = rng() < 0.3;

  // Distribute ramps into groups
  let groups;
  if (rampCount <= 6) groups = [3, 3];
  else if (rampCount === 7) groups = rng() < 0.5 ? [4, 3] : [3, 4];
  else if (rampCount === 8) {
    if (rng() < 0.4) groups = [4, 4];
    else groups = rng() < 0.5 ? [3, 2, 3] : [3, 3, 2];
  } else {
    groups = rng() < 0.5 ? [5, 4] : [3, 3, 3];
  }

  const rampSpacing = 180 + Math.floor(rng() * 61); // 180-240
  const interGroupGap = 400 + Math.floor(rng() * 151); // 400-550 (was 400-700, too large)

  let currentY = 280 + Math.floor(rng() * 41); // 280-320
  const rampCYs = [];
  const groupBounds = [];

  for (const gs of groups) {
    const groupStart = currentY;
    for (let i = 0; i < gs; i++) {
      rampCYs.push(Math.round(currentY));
      if (i < gs - 1) currentY += rampSpacing;
    }
    const groupEnd = currentY + rampDrop + 30;
    groupBounds.push({ start: groupStart - 50, end: groupEnd });
    currentY += interGroupGap;
  }

  // Build ramps
  const ramps = rampCYs.map((cy, i) => ({ pts: rampPts(cy, i % 2 === 0, rampDrop), cy }));

  // Compute gap zones
  const gapZones = [];
  for (let g = 0; g < groupBounds.length - 1; g++) {
    const gapStart = groupBounds[g].end;
    const gapEnd = groupBounds[g + 1].start;
    if (gapEnd - gapStart > 80) {
      gapZones.push({ startY: gapStart, endY: gapEnd, height: gapEnd - gapStart, purpose: 'filler' });
    }
  }
  // Add gap zone after last ramp group — extends 350px for peg zone or content
  const lastEnd = groupBounds[groupBounds.length - 1].end;
  const finishApproach = lastEnd + 350;
  gapZones.push({ startY: lastEnd, endY: finishApproach, height: 350, purpose: 'filler' });

  // Assign gap purposes (largest get peg zones, next get features)
  const sorted = [...gapZones].sort((a, b) => b.height - a.height);
  let pegZonesAssigned = 0, featuresAssigned = 0;
  for (const gap of sorted) {
    if (pegZonesAssigned < pegZoneCount && gap.height > 120) {
      gap.purpose = 'pegZone'; pegZonesAssigned++;
    } else if (featuresAssigned < features.length && gap.height > 150) {
      gap.purpose = 'feature'; featuresAssigned++;
    }
  }

  // Place obstacles
  const obs = [];
  const funnels = [];
  const pegGaps = gapZones.filter(g => g.purpose === 'pegZone');
  for (const gap of pegGaps) {
    const pegY = Math.round((gap.startY + gap.endY) / 2);
    if (pegDensity === 'low') obs.push(...mkPegs(pegY, 3, 4, 70, 35));
    else obs.push(...mkPegs(pegY, 4, 5, 60, 32));
    if (useFunnels) funnels.push(mkFunnel(pegY, 180, 60));
  }

  // Bumpers between ramp pairs
  let bumpersPlaced = 0;
  for (let i = 0; i < rampCYs.length - 1 && bumpersPlaced < bumperCount; i++) {
    const spacing = rampCYs[i + 1] - rampCYs[i];
    if (spacing < 300) {
      const midY = (rampCYs[i] + rampCYs[i + 1]) / 2;
      const x = (i % 2 === 0) ? 130 + Math.floor(rng() * 40) : 230 + Math.floor(rng() * 40);
      obs.push({ x, y: Math.round(midY), r: 14, type: 'bumper' });
      bumpersPlaced++;
    }
  }

  // Filler content — scale with gap size
  for (const gap of gapZones.filter(g => g.purpose === 'filler')) {
    const centerY = Math.round((gap.startY + gap.endY) / 2);
    obs.push(...gapBumpers(centerY, 40));
    // Large filler gaps get extra pegs to prevent dead zones
    if (gap.height > 200) {
      obs.push(...mkPegs(centerY, 2, 4, 70, 35));
    }
  }

  // Windmills
  const wm = [];
  const wmCandidates = [];
  for (let i = 0; i < rampCYs.length - 1; i++) {
    if (rampCYs[i + 1] - rampCYs[i] < 300)
      wmCandidates.push({ x: 200, y: Math.round((rampCYs[i] + rampCYs[i + 1]) / 2) });
  }
  for (const gap of gapZones)
    wmCandidates.push({ x: 200, y: Math.round((gap.startY + gap.endY) / 2) });
  const wmShuf = wmCandidates.sort(() => rng() - 0.5);
  const sign = () => rng() < 0.5 ? 1 : -1;
  for (let i = 0; i < Math.min(windmillCount, wmShuf.length); i++) {
    wm.push({ x: wmShuf[i].x, y: wmShuf[i].y, w: 240 + Math.floor(rng() * 100), s: sign() * (0.005 + rng() * 0.006) });
  }
  for (const gap of pegGaps) {
    const pegY = Math.round((gap.startY + gap.endY) / 2);
    wm.push({ x: 200, y: pegY - 80, w: 120 + Math.floor(rng() * 30), s: sign() * (0.03 + rng() * 0.02) });
  }

  // Features
  const isSafe = (y, minD) => rampCYs.every(cy => Math.abs(y - cy) > minD);
  const rampExitYs = rampCYs.map(cy => cy + rampDrop + 25);
  let pend, tramps, cradles, pits;

  for (const feat of features) {
    const targetGaps = gapZones.filter(g => g.purpose === 'feature' || (g.purpose === 'filler' && g.height > 120));

    if (feat === 'pendulums') {
      pend = [];
      for (const gap of gapZones.filter(g => g.height > 120)) {
        const count = gap.height > 300 ? 2 : 1;
        for (let p = 0; p < count && pend.length < 6; p++) {
          const ay = gap.startY + 20 + Math.floor(rng() * Math.max(1, gap.height - 150));
          const len = 80 + Math.floor(rng() * 51);
          const bobY = ay + len;
          if (isSafe(bobY, 60)) {
            pend.push({ ax: 150 + Math.floor(rng() * 100), ay: Math.round(ay), len, br: 16 + Math.floor(rng() * 5), vx: sign() * (6 + Math.floor(rng() * 3)) });
          }
        }
      }
      if (pend.length === 0) pend = undefined;
    }

    if (feat === 'trampolines') {
      tramps = [];
      for (const gap of gapZones.filter(g => g.height > 100)) {
        const count = gap.height > 250 ? 3 : gap.height > 150 ? 2 : 1;
        for (let t = 0; t < count && tramps.length < 8; t++) {
          const ty = gap.startY + 50 + Math.floor(rng() * Math.max(1, gap.height - 100));
          if (rampExitYs.every(ey => Math.abs(ty - ey) > 80) && isSafe(ty, 60)) {
            tramps.push({ x: 80 + Math.floor(rng() * 240), y: Math.round(ty), w: 50 + Math.floor(rng() * 30), str: 4 + Math.floor(rng() * 3) });
          }
        }
      }
      if (tramps.length === 0) tramps = undefined;
    }

    if (feat === 'cradles') {
      cradles = [];
      for (const gap of gapZones.filter(g => g.height >= 170 && g.purpose !== 'pegZone')) {
        if (cradles.length >= 3) break;
        cradles.push({ x: 200, y: Math.round(gap.startY + 40 + rng() * Math.max(1, gap.height - 140)), n: 5, sp: 22, len: 70 + Math.floor(rng() * 21), br: 11 });
      }
      if (cradles.length === 0) cradles = undefined;
    }

    if (feat === 'ballPits') {
      pits = [];
      for (const gap of gapZones.filter(g => g.height >= 170 && g.purpose !== 'pegZone')) {
        if (pits.length >= 3) break;
        pits.push({ x: 30, y: Math.round(gap.startY + 20), w: 340, h: Math.min(200, gap.height - 40), n: 12 + Math.floor(rng() * 9), br: 7 + Math.floor(rng() * 4) });
      }
      if (pits.length === 0) pits = undefined;
    }
  }

  // Finish Y — must be below all content with enough room for finish funnel (160px above)
  const lowestContent = Math.max(
    ...gapZones.map(g => g.endY),
    rampCYs[rampCYs.length - 1] + rampDrop + 30,
  );
  const fy = Math.round(lowestContent + 200);
  const sp = mkSprings(rampCYs, rampDrop);
  const fi = mkFinish(fy);
  const h = fy + fi.cd + 10;

  // Speed bursts
  let speedBursts;
  if (useSpeedBursts) {
    speedBursts = [];
    const sbCandidates = rampCYs.filter((_, i) => i > 0 && i < rampCYs.length - 1);
    const sbShuffled = [...sbCandidates].sort(() => rng() - 0.5);
    const sbCount = 1 + (rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < Math.min(sbCount, sbShuffled.length); i++) {
      const rampCY = sbShuffled[i];
      const rampIdx = rampCYs.indexOf(rampCY);
      const isRight = rampIdx % 2 === 0;
      const x = isRight
        ? W - GAP - 30 + Math.floor(rng() * 20)
        : GAP + 30 + Math.floor(rng() * 20);
      const y = Math.round(rampCY + rampDrop + 25 + rng() * 15);
      const directions = ['left', 'right', 'down'];
      const direction = directions[Math.floor(rng() * directions.length)];
      speedBursts.push({ x, y, width: 40 + Math.floor(rng() * 20), direction, activationChance: 0.5 + rng() * 0.2 });
    }
    if (speedBursts.length === 0) speedBursts = undefined;
  }

  // Body count check — trim pegs if over 70 (target <=75 with marbles for 60fps)
  let bodyCount = 4 + rampCYs.length + obs.length + wm.length + rampCYs.length + funnels.length * 2 + 5 + 2 + 8;
  if (pend) bodyCount += pend.length;
  if (tramps) bodyCount += tramps.length;
  if (cradles) bodyCount += cradles.reduce((s, c) => s + c.n, 0);
  if (pits) bodyCount += pits.reduce((s, p) => s + p.n, 0);
  if (speedBursts) bodyCount += speedBursts.length;
  if (bodyCount > 70) {
    const pegs = obs.filter(o => o.type === 'peg');
    const toRemove = Math.min(bodyCount - 65, Math.floor(pegs.length * 0.5));
    for (let i = 0; i < toRemove; i++) {
      const idx = obs.indexOf(pegs[pegs.length - 1 - i]);
      if (idx >= 0) obs.splice(idx, 1);
    }
  }

  // Fingerprint for variety tracking
  const fingerprint = `${rampCount}-${features.sort().join('+') || 'none'}-${pegDensity}`;

  return {
    id: `gen-${seed}`, w: W, h, fy, ...fi, ramps, obs, wm, fn: funnels, sp,
    g: { x: 0, y: gravityY, scale: 0.001 },
    pend, tramps, cradles, pits, speedBursts,
    seed, fingerprint, rampCount, features: features.slice(), gravityY,
  };
}

// ═══════════════════════════════════════════
// RACE SIMULATION (from test-tracks.js)
// ═══════════════════════════════════════════
function simulateRace(track) {
  const engine = Engine.create({ gravity: track.g, positionIterations: 10, velocityIterations: 8 });
  const world = engine.world;

  // Walls
  Composite.add(world, [
    Bodies.rectangle(0, track.h / 2, 50, track.h + 200, { isStatic: true, friction: 0.05, restitution: 0.3 }),
    Bodies.rectangle(W, track.h / 2, 50, track.h + 200, { isStatic: true, friction: 0.05, restitution: 0.3 }),
    Bodies.rectangle(W / 2, -25, W + 100, 50, { isStatic: true, friction: 0.05, restitution: 0.5 }),
    Bodies.rectangle(W / 2, track.h + 25, W + 100, 50, { isStatic: true, friction: 0.5, restitution: 0.1 }),
  ]);

  // Ramps
  track.ramps.forEach(ramp => {
    for (let j = 0; j < ramp.pts.length - 1; j++) {
      const a = ramp.pts[j], b = ramp.pts[j + 1];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
      Composite.add(world, Bodies.rectangle((a.x + b.x) / 2, (a.y + b.y) / 2, len + 6, 14, {
        isStatic: true, angle: Math.atan2(dy, dx), friction: 0.03, restitution: 0.1, chamfer: { radius: 4 }, label: 'ramp',
      }));
    }
  });

  // Bumpers & pegs
  track.obs.forEach(o => {
    Composite.add(world, Bodies.circle(o.x, o.y, o.r, {
      isStatic: true, restitution: o.type === 'bumper' ? 1.0 : 0.5, friction: 0.01, label: o.type,
    }));
  });

  // Funnels
  track.fn.forEach(f => {
    const dy = f.y2 - f.y1;
    const ldx = f.lx2 - f.lx1, lLen = Math.sqrt(ldx * ldx + dy * dy);
    Composite.add(world, Bodies.rectangle((f.lx1 + f.lx2) / 2, (f.y1 + f.y2) / 2, lLen, 12, { isStatic: true, angle: Math.atan2(dy, ldx), friction: 0.02, restitution: 0.3, label: 'funnel' }));
    const rdx = f.rx2 - f.rx1, rLen = Math.sqrt(rdx * rdx + dy * dy);
    Composite.add(world, Bodies.rectangle((f.rx1 + f.rx2) / 2, (f.y1 + f.y2) / 2, rLen, 12, { isStatic: true, angle: Math.atan2(dy, rdx), friction: 0.02, restitution: 0.3, label: 'funnel' }));
  });

  // Finish zone
  const ff = track.funnel;
  const fdy = ff.y2 - ff.y1;
  const fldx = ff.lx2 - ff.lx1, flLen = Math.sqrt(fldx * fldx + fdy * fdy);
  Composite.add(world, Bodies.rectangle((ff.lx1 + ff.lx2) / 2, (ff.y1 + ff.y2) / 2, flLen, 14, { isStatic: true, angle: Math.atan2(fdy, fldx), friction: 0.02, restitution: 0.2 }));
  const frdx = ff.rx2 - ff.rx1, frLen = Math.sqrt(frdx * frdx + fdy * fdy);
  Composite.add(world, Bodies.rectangle((ff.rx1 + ff.rx2) / 2, (ff.y1 + ff.y2) / 2, frLen, 14, { isStatic: true, angle: Math.atan2(fdy, frdx), friction: 0.02, restitution: 0.2 }));
  Composite.add(world, Bodies.rectangle(track.cl - 5, track.fy + track.cd / 2, 10, track.cd + 20, { isStatic: true, friction: 0.02, restitution: 0.1 }));
  Composite.add(world, Bodies.rectangle(track.cr + 5, track.fy + track.cd / 2, 10, track.cd + 20, { isStatic: true, friction: 0.02, restitution: 0.1 }));
  Composite.add(world, Bodies.rectangle(track.cx, track.fy + track.cd + 10, (track.cr - track.cl) + 20, 14, { isStatic: true, friction: 0.5, restitution: 0.1 }));

  // Windmills
  const wmBodies = [];
  track.wm.forEach(wm => {
    const blade = Bodies.rectangle(wm.x, wm.y, wm.w, 8, { isStatic: true, friction: 0.01, restitution: 0.6, label: 'windmill' });
    Composite.add(world, blade);
    wmBodies.push({ body: blade, ...wm });
  });

  // Springs
  const springBounce = new Map();
  track.sp.forEach(sp => {
    const body = Bodies.rectangle(sp.x, sp.y, sp.w, sp.h, { isStatic: true, restitution: 0.3, friction: 0, label: 'spring', chamfer: { radius: 2 } });
    springBounce.set(body, 0);
    Composite.add(world, body);
  });

  // Pendulums
  if (track.pend) {
    track.pend.forEach(p => {
      const bob = Bodies.circle(p.ax, p.ay + p.len, p.br, {
        density: 0.04, restitution: 0.8, friction: 0.01, frictionAir: 0.005, label: 'pendulum-bob', collisionFilter: OBS_F,
      });
      Composite.add(world, [bob, Constraint.create({ pointA: { x: p.ax, y: p.ay }, bodyB: bob, length: p.len, stiffness: 1, damping: 0 })]);
      Body.setVelocity(bob, { x: p.vx, y: 0 });
    });
  }

  // Ball pits
  if (track.pits) {
    track.pits.forEach(pit => {
      const cols = Math.floor(pit.w / (pit.br * 3)), rows = Math.ceil(pit.n / cols);
      for (let i = 0; i < pit.n; i++) {
        const col = i % cols, row = Math.floor(i / cols), offX = row % 2 === 0 ? 0 : pit.br * 1.5;
        const bx = pit.x + pit.br * 2 + col * (pit.w / cols) + offX;
        const by = pit.y + pit.br * 2 + row * (pit.h / Math.max(1, rows));
        Composite.add(world, Bodies.circle(bx, by, pit.br, { density: 0.001, restitution: 0.5, friction: 0.00001, frictionAir: 0.01, label: 'pit-ball', collisionFilter: OBS_F }));
      }
    });
  }

  // Cradles
  if (track.cradles) {
    track.cradles.forEach(c => {
      const bobs = [];
      for (let i = 0; i < c.n; i++) {
        const bx = c.x - (c.n - 1) * c.sp / 2 + i * c.sp;
        const bob = Bodies.circle(bx, c.y + c.len, c.br, { inertia: Infinity, restitution: 1.0, friction: 0, frictionAir: 0, slop: c.br * 0.02, label: 'cradle-bob', collisionFilter: CRADLE_F });
        Composite.add(world, [bob, Constraint.create({ pointA: { x: bx, y: c.y }, bodyB: bob, length: c.len, stiffness: 1, damping: 0 })]);
        bobs.push(bob);
      }
      if (bobs.length > 0) Body.translate(bobs[0], { x: -c.sp * 1.5, y: -c.len * 0.15 });
    });
  }

  // Trampolines
  const trampBodies = [];
  const trampBounce = new Map();
  if (track.tramps) {
    track.tramps.forEach(t => {
      const body = Bodies.rectangle(t.x, t.y, t.w, 10, { isStatic: true, restitution: 0.3, friction: 0, label: 'trampoline', chamfer: { radius: 3 } });
      trampBounce.set(body, 0);
      Composite.add(world, body);
      trampBodies.push({ body, config: t });
    });
  }

  // Speed burst sensor bodies
  const speedBurstBodies = [];
  if (track.speedBursts) {
    track.speedBursts.forEach(sb => {
      const body = Bodies.rectangle(sb.x, sb.y, sb.width, 12, { isStatic: true, isSensor: true, label: 'speedburst' });
      Composite.add(world, body);
      speedBurstBodies.push({ body, config: sb, activeUntil: 0 });
    });
  }

  // Collision events
  Events.on(engine, 'collisionStart', e => {
    e.pairs.forEach(pair => {
      const { bodyA, bodyB } = pair;
      let marble = null, spring = null;
      if (bodyA.label === 'spring' && !bodyB.isStatic) { marble = bodyB; spring = bodyA; }
      else if (bodyB.label === 'spring' && !bodyA.isStatic) { marble = bodyA; spring = bodyB; }
      if (marble && spring) {
        const cnt = springBounce.get(spring) || 0;
        if (cnt >= 7) return; springBounce.set(spring, cnt + 1);
        if (cnt + 1 >= 7) spring.restitution = 0;
        const toC = marble.position.x < W / 2 ? 1 : -1;
        Body.setVelocity(marble, { x: marble.velocity.x * 0.5 + toC * 2.5, y: -Math.abs(marble.velocity.y) * 0.6 - 4 });
        return;
      }
      let tm = null, tb = null;
      if (bodyA.label === 'trampoline' && !bodyB.isStatic) { tm = bodyB; tb = bodyA; }
      else if (bodyB.label === 'trampoline' && !bodyA.isStatic) { tm = bodyA; tb = bodyB; }
      if (tm && tb) {
        const cnt = trampBounce.get(tb) || 0;
        if (cnt >= 10) return; trampBounce.set(tb, cnt + 1);
        if (cnt + 1 >= 10) tb.restitution = 0.1;
        const tc = trampBodies.find(t => t.body === tb);
        const str = tc ? tc.config.str : 6;
        Body.setVelocity(tm, { x: tm.velocity.x * 0.7 + (Math.random() - 0.5) * 2, y: -str });
        return;
      }
      // Speed burst activation
      let sbMarble = null, sbEntry = null;
      if (bodyA.label === 'speedburst' && !bodyB.isStatic) { sbMarble = bodyB; sbEntry = speedBurstBodies.find(s => s.body === bodyA); }
      else if (bodyB.label === 'speedburst' && !bodyA.isStatic) { sbMarble = bodyA; sbEntry = speedBurstBodies.find(s => s.body === bodyB); }
      if (sbMarble && sbEntry) {
        if (Math.random() < sbEntry.config.activationChance) {
          const str = 6;
          let ix = 0, iy = 0;
          if (sbEntry.config.direction === 'left') { ix = -str; iy = -1; }
          else if (sbEntry.config.direction === 'right') { ix = str; iy = -1; }
          else { ix = 0; iy = str; }
          Body.setVelocity(sbMarble, { x: sbMarble.velocity.x + ix, y: sbMarble.velocity.y + iy });
        }
      }
    });
  });

  // Scrambler + gate
  const scrambler = Bodies.rectangle(W / 2, 140, 280, 8, { isStatic: true, friction: 0.01, restitution: 0.6, label: 'windmill' });
  Composite.add(world, scrambler);
  wmBodies.push({ body: scrambler, x: W / 2, y: 140, w: 280, s: 0.04 });

  const gate = Bodies.rectangle(W / 2, 230, W - 20, 10, { isStatic: true, friction: 0.1, restitution: 0.3, label: 'gate' });
  Composite.add(world, gate);

  // Marbles
  const marbleBodies = [];
  const shuffledMarbles = [...MARBLES].sort(() => Math.random() - 0.5);
  shuffledMarbles.forEach((m, i) => {
    const sx = W / 2 + (Math.random() - 0.5) * 160, sy = 40 + i * 16 + (Math.random() - 0.5) * 8;
    const body = Bodies.circle(sx, sy, 11, {
      restitution: 0.4 + m.stats.bounce * 0.06, friction: 0.00001, frictionStatic: 0.02,
      density: 0.001 + m.stats.power * 0.0003, frictionAir: 0.008 - m.stats.speed * 0.001,
      label: m.id, collisionFilter: MARBLE_F,
    });
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 0.5 + Math.random() * 0.5 });
    Composite.add(world, body);
    marbleBodies.push({ body, data: m });
  });

  // Settle (60 frames behind gate)
  for (let i = 0; i < 60; i++) {
    wmBodies.forEach(wm => Body.setAngle(wm.body, wm.body.angle + wm.s));
    for (let s = 0; s < SUBSTEPS; s++) Engine.update(engine, FIXED_DT);
  }

  // Open gate
  Composite.remove(world, gate);
  Composite.remove(world, scrambler);
  const scrIdx = wmBodies.findIndex(w => w.body === scrambler);
  if (scrIdx >= 0) wmBodies.splice(scrIdx, 1);

  let elapsed = 0;
  const finishTimes = {};
  const stuckTracker = new Map();
  const stuckEvents = [];

  // Doomsday bar state
  const DOOMSDAY_TRIGGER_MS = 40000;
  const DOOMSDAY_DEADLINE_MS = 60000;
  const DOOMSDAY_BAR_HEIGHT = 50;
  let doomsdayBar = null;
  let doomsdayBarActive = false;
  let doomsdayBarStartY = 0;
  let doomsdayBarStartTime = 0;
  let doomsdayBarEndY = 0;
  let doomsdayBarDuration = 0;

  const MAX_FRAMES = 60 * 60; // 60 seconds max at 60fps

  for (let frame = 0; frame < MAX_FRAMES; frame++) {
    elapsed += 16.67;

    // === DOOMSDAY BAR — spawn and move BEFORE physics ===
    const unfinished = marbleBodies.filter(({ data }) => !finishTimes[data.id]);
    if (!doomsdayBarActive && elapsed >= DOOMSDAY_TRIGGER_MS && unfinished.length > 0) {
      let highestY = Infinity;
      for (const { body } of unfinished) {
        if (body.position.y < highestY) highestY = body.position.y;
      }
      doomsdayBarStartY = highestY - 100;
      doomsdayBarStartTime = elapsed;
      doomsdayBarEndY = track.fy + 50;
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
      if (newY >= track.fy + 50) {
        Composite.remove(world, doomsdayBar);
        doomsdayBar = null;
        doomsdayBarActive = false;
      } else {
        const speed = (doomsdayBarEndY - doomsdayBarStartY) / (doomsdayBarDuration / 16.67);
        Body.setVelocity(doomsdayBar, { x: 0, y: speed });
        Body.setPosition(doomsdayBar, { x: W / 2, y: newY });
      }
    }

    wmBodies.forEach(wm => Body.setAngle(wm.body, wm.body.angle + wm.s));
    for (let s = 0; s < SUBSTEPS; s++) Engine.update(engine, FIXED_DT);

    marbleBodies.forEach(({ body, data }) => {
      if (finishTimes[data.id]) return;

      if (Math.random() < 0.015 * data.stats.luck) {
        Body.applyForce(body, body.position, { x: (Math.random() - 0.5) * 0.0008, y: (Math.random() - 0.4) * 0.0004 });
      }

      const last = stuckTracker.get(data.id);
      if (last) {
        const dx = body.position.x - last.x, dy = body.position.y - last.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 5 && elapsed - last.t > 1000) {
          const hits = (last.hits || 0) + 1;
          const strength = Math.min(hits, 5);
          stuckEvents.push({ marble: data.name, y: Math.round(body.position.y), time: elapsed });
          Body.setVelocity(body, { x: (Math.random() - 0.5) * 8 * strength, y: 5 + Math.random() * 3 * strength });
          stuckTracker.set(data.id, { x: body.position.x, y: body.position.y, t: elapsed, hits });
        } else if (dist >= 5) {
          stuckTracker.set(data.id, { x: body.position.x, y: body.position.y, t: elapsed, hits: 0 });
        }
      } else {
        stuckTracker.set(data.id, { x: body.position.x, y: body.position.y, t: elapsed, hits: 0 });
      }

      if (body.position.y >= track.fy) {
        finishTimes[data.id] = elapsed;
        Body.setVelocity(body, { x: 0, y: 0.5 });
        body.frictionAir = 0.3;
        body.restitution = 0;
      }

      if (body.position.x < -20 || body.position.x > W + 20 || body.position.y < -100) {
        stuckEvents.push({ marble: data.name, y: Math.round(body.position.y), time: elapsed, type: 'ESCAPED' });
      }
    });

    if (Object.keys(finishTimes).length >= MARBLES.length) break;
  }

  const finishedNaturally = Object.keys(finishTimes).filter(id => {
    const m = marbleBodies.find(mb => mb.data.id === id);
    return m && m.body.position.y >= track.fy - 50;
  }).length;

  Engine.clear(engine);

  const bodyCount = Composite.allBodies(world).length;

  return {
    totalTime: elapsed / 1000,
    finishedNaturally,
    stuckEvents,
    winner: marbleBodies.sort((a, b) => (finishTimes[a.data.id] || Infinity) - (finishTimes[b.data.id] || Infinity))[0]?.data.name,
    bodyCount,
    hasEscapes: stuckEvents.some(e => e.type === 'ESCAPED'),
  };
}

// ═══════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════
function validateTrack(seed, verbose, mode = 'generate') {
  const track = generateTrack(seed);
  const NUM_RUNS = 5;
  const runs = [];
  for (let r = 0; r < NUM_RUNS; r++) runs.push(simulateRace(track));

  const avgTime = runs.reduce((s, r) => s + r.totalTime, 0) / NUM_RUNS;
  const avgFinished = Math.round(runs.reduce((s, r) => s + r.finishedNaturally, 0) / NUM_RUNS);
  const minFinished = Math.min(...runs.map(r => r.finishedNaturally));
  const totalStuck = runs.reduce((s, r) => s + r.stuckEvents.length, 0);
  const hasEscapes = runs.some(r => r.hasEscapes);
  const winners = new Set(runs.map(r => r.winner));

  const maxBodies = Math.max(...runs.map(r => r.bodyCount));
  // Generation uses stricter criteria for buffer; single-seed validation uses user-facing criteria
  const passed = mode === 'generate'
    // Generation: strict buffer — avg <=55s, min 8 finish every run, <=75 bodies
    ? (minFinished >= 8 && avgTime >= 15 && avgTime <= 55 && !hasEscapes && maxBodies <= 75)
    // Validation: user requirements — avg <=60s, all 8 finish, <=75 bodies
    : (minFinished >= 8 && avgTime >= 15 && Math.round(avgTime * 10) / 10 <= 60 && maxBodies <= 75);

  if (verbose || !passed) {
    const status = passed ? '✓' : '✗';
    const fp = track.fingerprint;
    console.log(`  ${status} seed=${seed} fp=${fp} avg=${avgTime.toFixed(1)}s finished=${avgFinished}/8 stuck=${totalStuck} bodies=${maxBodies} winners=${[...winners].join(',')}`);
  }

  return { seed, passed, avgTime, avgFinished, totalStuck, fingerprint: track.fingerprint, maxBodies };
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 && i + 1 < args.length ? args[i + 1] : null; };
const hasFlag = (flag) => args.includes(flag);

const singleSeed = getArg('--seed');
const targetCount = parseInt(getArg('--count') || '0', 10);
const outputFile = getArg('--output');
const verbose = hasFlag('--verbose');

if (singleSeed) {
  console.log(`\nValidating seed ${singleSeed}...`);
  const result = validateTrack(parseInt(singleSeed, 10), true, 'validate');
  console.log(result.passed ? '\n✓ Track passes validation' : '\n✗ Track fails validation');
  process.exit(result.passed ? 0 : 1);
}

if (targetCount > 0) {
  console.log(`\nGenerating ${targetCount} validated tracks...\n`);

  const valid = [];
  const fingerprints = new Map(); // track variety
  let seed = 1000;
  let attempts = 0;
  const maxAttempts = targetCount * 10;

  while (valid.length < targetCount && attempts < maxAttempts) {
    const result = validateTrack(seed, verbose);
    attempts++;

    if (result.passed) {
      valid.push({ seed: result.seed, avgTime: result.avgTime, fingerprint: result.fingerprint });
      const fp = result.fingerprint;
      fingerprints.set(fp, (fingerprints.get(fp) || 0) + 1);

      if (!verbose) {
        process.stdout.write(`\r  Progress: ${valid.length}/${targetCount} (${attempts} attempts, ${(valid.length / attempts * 100).toFixed(0)}% accept rate)`);
      }
    }

    seed++;
  }

  console.log(`\n\n═══════════════════════════════════════════`);
  console.log(`  RESULTS`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`  Generated: ${valid.length}/${targetCount}`);
  console.log(`  Attempts: ${attempts}`);
  console.log(`  Accept rate: ${(valid.length / attempts * 100).toFixed(1)}%`);
  console.log(`  Unique fingerprints: ${fingerprints.size}`);

  const avgTrackTime = valid.reduce((s, v) => s + v.avgTime, 0) / valid.length;
  console.log(`  Avg race time: ${avgTrackTime.toFixed(1)}s`);

  console.log(`\n  Fingerprint distribution:`);
  [...fingerprints.entries()].sort((a, b) => b[1] - a[1]).forEach(([fp, count]) => {
    console.log(`    ${fp}: ${count} tracks`);
  });

  const seeds = valid.map(v => v.seed);
  console.log(`\n  Seeds: [${seeds.join(', ')}]`);

  if (outputFile) {
    const outPath = path.resolve(outputFile);
    fs.writeFileSync(outPath, JSON.stringify({ seeds, tracks: valid }, null, 2));
    console.log(`\n  Saved to: ${outPath}`);
  }
} else if (!singleSeed) {
  console.log('Usage:');
  console.log('  node scripts/generate-tracks.js --seed 12345');
  console.log('  node scripts/generate-tracks.js --count 100 [--output seeds.json] [--verbose]');
}
