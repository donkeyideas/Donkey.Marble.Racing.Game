// Procedural track generator — deterministic from seed
// Produces valid TrackConfig objects using proven constraint rules

import {
  TrackConfig, RampData, ObstacleInfo, WindmillConfig, FunnelData, SpringData,
  PendulumConfig, BallPitConfig, CradleConfig, TrampolineConfig, SpeedBurstConfig,
  ENGINE_WIDTH, ENTRY_MARGIN, EXIT_GAP,
  generateRampPoints, generateSprings, generatePegZone, generateFunnel,
  generateFinishZone, generateGapBumpers,
} from './tracks';

// ═══════════════════════════════════════════
// Seeded PRNG (mulberry32)
// ═══════════════════════════════════════════

function createRNG(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ═══════════════════════════════════════════
// Blueprint types
// ═══════════════════════════════════════════

type FeatureType = 'pendulums' | 'trampolines' | 'cradles' | 'ballPits';
type PegDensity = 'low' | 'medium';
type BgImage = 'grass' | 'lava' | 'ice' | 'cyber';

interface GapZone {
  startY: number;
  endY: number;
  height: number;
  purpose: 'pegZone' | 'feature' | 'filler';
}

interface TrackBlueprint {
  rampCount: number;
  rampDrop: number;
  gravityY: number;
  pegDensity: PegDensity;
  pegZoneCount: number;
  features: FeatureType[];
  useFunnels: boolean;
  bumperCount: number;
  windmillCount: number;
  bgImage: BgImage;
  useSpeedBursts: boolean;
}

// ═══════════════════════════════════════════
// Parameter selection
// ═══════════════════════════════════════════

function selectParameters(rng: () => number): TrackBlueprint {
  const rampCount = 6 + Math.floor(rng() * 4); // 6-9
  const rampDrop = 50 + Math.floor(rng() * 16); // 50-65
  const gravityY = 0.95 + rng() * 0.1; // 0.95-1.05 — natural default gravity
  const pegDensity: PegDensity = rng() < 0.6 ? 'low' : 'medium';
  const pegZoneCount = 1 + Math.floor(rng() * 2); // 1-2

  // Pick 0-2 features
  const allFeatures: FeatureType[] = ['pendulums', 'trampolines', 'cradles', 'ballPits'];
  const featureCount = Math.floor(rng() * 3); // 0, 1, or 2
  const shuffled = allFeatures.sort(() => rng() - 0.5);
  const features = shuffled.slice(0, featureCount);

  // No funnels — they create arch jams with 8 marbles
  const useFunnels = false;

  const bumperCount = 2 + Math.floor(rng() * 7); // 2-8
  const windmillCount = 1 + Math.floor(rng() * 4); // 1-4
  const bgImages: BgImage[] = ['grass', 'lava', 'ice', 'cyber'];
  const bgImage = bgImages[Math.floor(rng() * bgImages.length)];

  const useSpeedBursts = rng() < 0.3;

  return {
    rampCount, rampDrop, gravityY, pegDensity, pegZoneCount,
    features, useFunnels, bumperCount, windmillCount, bgImage, useSpeedBursts,
  };
}

// ═══════════════════════════════════════════
// Ramp layout
// ═══════════════════════════════════════════

function distributeRamps(count: number, rng: () => number): number[][] {
  // Split ramps into 2-3 groups
  if (count <= 6) {
    return [[3], [3]]; // 3 + 3
  } else if (count === 7) {
    return rng() < 0.5 ? [[4], [3]] : [[3], [4]];
  } else if (count === 8) {
    if (rng() < 0.4) return [[4], [4]];
    return rng() < 0.5 ? [[3], [2], [3]] : [[3], [3], [2]];
  } else {
    // 9
    if (rng() < 0.5) return [[5], [4]];
    return [[3], [3], [3]];
  }
}

function layoutRamps(bp: TrackBlueprint, rng: () => number): {
  rampCYs: number[];
  ramps: RampData[];
  gapZones: GapZone[];
} {
  const groups = distributeRamps(bp.rampCount, rng);
  const rampSpacing = 180 + Math.floor(rng() * 61); // 180-240
  const interGroupGap = 400 + Math.floor(rng() * 151); // 400-550

  let currentY = 280 + Math.floor(rng() * 41); // 280-320
  const rampCYs: number[] = [];
  const groupBounds: { start: number; end: number }[] = [];

  for (const [groupSize] of groups) {
    const groupStart = currentY;
    for (let i = 0; i < groupSize; i++) {
      rampCYs.push(Math.round(currentY));
      if (i < groupSize - 1) currentY += rampSpacing;
    }
    const groupEnd = currentY + bp.rampDrop + 30; // account for ramp drop + spring
    groupBounds.push({ start: groupStart - 50, end: groupEnd });
    currentY += interGroupGap;
  }

  // Build ramps
  const ramps: RampData[] = rampCYs.map((cy, i) => ({
    points: generateRampPoints(cy, i % 2 === 0, bp.rampDrop),
    engineCY: cy,
  }));

  // Compute gap zones (regions between groups)
  const gapZones: GapZone[] = [];
  for (let g = 0; g < groupBounds.length - 1; g++) {
    const gapStart = groupBounds[g].end;
    const gapEnd = groupBounds[g + 1].start;
    if (gapEnd - gapStart > 80) {
      gapZones.push({ startY: gapStart, endY: gapEnd, height: gapEnd - gapStart, purpose: 'filler' });
    }
  }

  // Add gap zone after last ramp group — extends 350px for content
  const lastEnd = groupBounds[groupBounds.length - 1].end;
  const finishApproach = lastEnd + 350;
  gapZones.push({ startY: lastEnd, endY: finishApproach, height: 350, purpose: 'filler' });

  return { rampCYs, ramps, gapZones };
}

// ═══════════════════════════════════════════
// Gap assignment
// ═══════════════════════════════════════════

function assignGaps(
  gapZones: GapZone[],
  bp: TrackBlueprint,
  rng: () => number,
): GapZone[] {
  // Sort by height (largest first) for assignment priority
  const sorted = [...gapZones].sort((a, b) => b.height - a.height);

  let pegZonesAssigned = 0;
  let featuresAssigned = 0;

  for (const gap of sorted) {
    if (pegZonesAssigned < bp.pegZoneCount && gap.height > 120) {
      gap.purpose = 'pegZone';
      pegZonesAssigned++;
    } else if (featuresAssigned < bp.features.length && gap.height > 150) {
      gap.purpose = 'feature';
      featuresAssigned++;
    } else {
      gap.purpose = 'filler';
    }
  }

  return gapZones;
}

// ═══════════════════════════════════════════
// Obstacle placement
// ═══════════════════════════════════════════

function placeObstacles(
  bp: TrackBlueprint,
  rampCYs: number[],
  gapZones: GapZone[],
  rng: () => number,
): { obstacles: ObstacleInfo[]; funnels: FunnelData[] } {
  const obstacles: ObstacleInfo[] = [];
  const funnels: FunnelData[] = [];

  // Peg zones in assigned gaps
  const pegGaps = gapZones.filter(g => g.purpose === 'pegZone');
  for (const gap of pegGaps) {
    const pegY = Math.round((gap.startY + gap.endY) / 2);
    if (bp.pegDensity === 'low') {
      obstacles.push(...generatePegZone(pegY, 3, 4, 70, 35));
    } else {
      obstacles.push(...generatePegZone(pegY, 4, 5, 60, 32));
    }
    if (bp.useFunnels) {
      funnels.push(generateFunnel(pegY, 180, 60));
    }
  }

  // Bumpers between ramp pairs
  let bumpersPlaced = 0;
  for (let i = 0; i < rampCYs.length - 1 && bumpersPlaced < bp.bumperCount; i++) {
    const midY = (rampCYs[i] + rampCYs[i + 1]) / 2;
    // Only place between consecutive ramps (not across group gaps)
    const spacing = rampCYs[i + 1] - rampCYs[i];
    if (spacing < 300) {
      const x = (i % 2 === 0) ? 130 + Math.floor(rng() * 40) : 230 + Math.floor(rng() * 40);
      obstacles.push({ x, y: Math.round(midY), r: 14, type: 'bumper' });
      bumpersPlaced++;
    }
  }

  // Filler content — scale with gap size
  const fillerGaps = gapZones.filter(g => g.purpose === 'filler');
  for (const gap of fillerGaps) {
    const centerY = Math.round((gap.startY + gap.endY) / 2);
    obstacles.push(...generateGapBumpers(centerY, 40));
    if (gap.height > 200) {
      obstacles.push(...generatePegZone(centerY, 2, 4, 70, 35));
    }
  }

  return { obstacles, funnels };
}

// ═══════════════════════════════════════════
// Windmill placement
// ═══════════════════════════════════════════

function placeWindmills(
  bp: TrackBlueprint,
  rampCYs: number[],
  gapZones: GapZone[],
  rng: () => number,
): WindmillConfig[] {
  const windmills: WindmillConfig[] = [];
  const sign = () => rng() < 0.5 ? 1 : -1;

  // Place windmills between ramp pairs and in gap zones
  const candidates: { x: number; y: number }[] = [];

  // Between ramp pairs
  for (let i = 0; i < rampCYs.length - 1; i++) {
    const spacing = rampCYs[i + 1] - rampCYs[i];
    if (spacing < 300) {
      candidates.push({ x: 200, y: Math.round((rampCYs[i] + rampCYs[i + 1]) / 2) });
    }
  }

  // In gap zones
  for (const gap of gapZones) {
    candidates.push({ x: 200, y: Math.round((gap.startY + gap.endY) / 2) });
  }

  // Pick windmillCount from candidates
  const shuffled = candidates.sort(() => rng() - 0.5);
  for (let i = 0; i < Math.min(bp.windmillCount, shuffled.length); i++) {
    const c = shuffled[i];
    windmills.push({
      x: c.x,
      y: c.y,
      width: 240 + Math.floor(rng() * 100), // 240-340
      speed: sign() * (0.005 + rng() * 0.006), // 0.005-0.011
    });
  }

  // Add peg zone windmills (small, fast spinners above peg zones)
  const pegGaps = gapZones.filter(g => g.purpose === 'pegZone');
  for (const gap of pegGaps) {
    const pegY = Math.round((gap.startY + gap.endY) / 2);
    windmills.push({
      x: 200,
      y: pegY - 80,
      width: 120 + Math.floor(rng() * 30),
      speed: sign() * (0.03 + rng() * 0.02),
    });
  }

  return windmills;
}

// ═══════════════════════════════════════════
// Feature placement
// ═══════════════════════════════════════════

function placeFeatures(
  bp: TrackBlueprint,
  rampCYs: number[],
  gapZones: GapZone[],
  rng: () => number,
): {
  pendulums?: PendulumConfig[];
  ballPits?: BallPitConfig[];
  cradles?: CradleConfig[];
  trampolines?: TrampolineConfig[];
} {
  const featureGaps = gapZones.filter(g => g.purpose === 'feature');
  const result: {
    pendulums?: PendulumConfig[];
    ballPits?: BallPitConfig[];
    cradles?: CradleConfig[];
    trampolines?: TrampolineConfig[];
  } = {};

  // Helper: check if Y is safe (>60px from any ramp CY)
  const isSafeFromRamps = (y: number, minDist: number) =>
    rampCYs.every(cy => Math.abs(y - cy) > minDist);

  let featureIdx = 0;
  for (const feature of bp.features) {
    // Use assigned gap zones first, then scatter in all gaps
    const targetGaps = featureIdx < featureGaps.length
      ? [featureGaps[featureIdx]]
      : gapZones.filter(g => g.height > 120);
    featureIdx++;

    switch (feature) {
      case 'pendulums': {
        const pends: PendulumConfig[] = [];
        // Place pendulums in all suitable gap zones
        const allBigGaps = gapZones.filter(g => g.height > 120);
        for (const gap of allBigGaps) {
          const count = gap.height > 300 ? 2 : 1;
          for (let p = 0; p < count; p++) {
            const anchorY = gap.startY + 20 + Math.floor(rng() * (gap.height - 150));
            const bobY = anchorY + 80 + Math.floor(rng() * 50); // bob hangs 80-130px below
            // Constraint: bob must be safe from ramps
            if (isSafeFromRamps(bobY, 60)) {
              const sign = rng() < 0.5 ? 1 : -1;
              pends.push({
                anchorX: 150 + Math.floor(rng() * 100), // 150-250
                anchorY: Math.round(anchorY),
                length: 80 + Math.floor(rng() * 51), // 80-130
                bobRadius: 16 + Math.floor(rng() * 5), // 16-20
                startVelocityX: sign * (6 + Math.floor(rng() * 3)), // ±6-8
              });
            }
          }
          if (pends.length >= 6) break; // cap at 6 pendulums
        }
        if (pends.length > 0) result.pendulums = pends;
        break;
      }

      case 'trampolines': {
        const tramps: TrampolineConfig[] = [];
        // Compute ramp exit Ys for safety check
        const rampExitYs = rampCYs.map(cy => cy + bp.rampDrop + 25);

        const allGaps = gapZones.filter(g => g.height > 100);
        for (const gap of allGaps) {
          const count = gap.height > 250 ? 3 : gap.height > 150 ? 2 : 1;
          for (let t = 0; t < count; t++) {
            const ty = gap.startY + 50 + Math.floor(rng() * (gap.height - 100));
            // Constraint: >80px from ramp exits
            const safeFromExits = rampExitYs.every(ey => Math.abs(ty - ey) > 80);
            if (safeFromExits && isSafeFromRamps(ty, 60)) {
              tramps.push({
                x: 80 + Math.floor(rng() * 240), // 80-320
                y: Math.round(ty),
                width: 50 + Math.floor(rng() * 30), // 50-80
                strength: 4 + Math.floor(rng() * 3), // 4-6
              });
            }
          }
          if (tramps.length >= 8) break;
        }
        if (tramps.length > 0) result.trampolines = tramps;
        break;
      }

      case 'cradles': {
        const cradles: CradleConfig[] = [];
        for (const gap of targetGaps) {
          if (gap.height >= 170) {
            cradles.push({
              x: 200,
              y: Math.round(gap.startY + 40 + rng() * (gap.height - 140)),
              count: 5,
              spacing: 22,
              length: 70 + Math.floor(rng() * 21), // 70-90
              ballRadius: 11,
            });
          }
        }
        // Also try other big gaps
        if (cradles.length < 2) {
          for (const gap of gapZones.filter(g => g.height > 170 && g.purpose !== 'pegZone')) {
            if (cradles.length >= 3) break;
            const already = cradles.some(c => Math.abs(c.y - (gap.startY + gap.height / 2)) < 100);
            if (!already) {
              cradles.push({
                x: 200,
                y: Math.round(gap.startY + 40 + rng() * (gap.height - 140)),
                count: 5,
                spacing: 22,
                length: 70 + Math.floor(rng() * 21),
                ballRadius: 11,
              });
            }
          }
        }
        if (cradles.length > 0) result.cradles = cradles;
        break;
      }

      case 'ballPits': {
        const pits: BallPitConfig[] = [];
        for (const gap of targetGaps) {
          // Constraint: ball pits need >170px tall gaps
          if (gap.height >= 170) {
            pits.push({
              x: 30,
              y: Math.round(gap.startY + 20),
              width: 340,
              height: Math.min(200, gap.height - 40),
              ballCount: 12 + Math.floor(rng() * 9), // 12-20
              ballRadius: 7 + Math.floor(rng() * 4), // 7-10
            });
          }
        }
        // Also try other big gaps
        if (pits.length < 2) {
          for (const gap of gapZones.filter(g => g.height > 170 && g.purpose !== 'pegZone')) {
            if (pits.length >= 3) break;
            const already = pits.some(p => Math.abs(p.y - gap.startY) < 100);
            if (!already) {
              pits.push({
                x: 30,
                y: Math.round(gap.startY + 20),
                width: 340,
                height: Math.min(200, gap.height - 40),
                ballCount: 12 + Math.floor(rng() * 9),
                ballRadius: 7 + Math.floor(rng() * 4),
              });
            }
          }
        }
        if (pits.length > 0) result.ballPits = pits;
        break;
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════
// Body count estimator
// ═══════════════════════════════════════════

function estimateBodyCount(
  rampCount: number,
  obstacles: ObstacleInfo[],
  windmills: WindmillConfig[],
  funnels: FunnelData[],
  features: {
    pendulums?: PendulumConfig[];
    ballPits?: BallPitConfig[];
    cradles?: CradleConfig[];
    trampolines?: TrampolineConfig[];
  },
): number {
  let count = 0;
  count += 4; // walls
  count += rampCount; // ramps
  count += obstacles.length; // pegs + bumpers
  count += windmills.length;
  count += rampCount; // springs
  count += funnels.length * 2; // funnel walls
  count += 5; // finish zone (funnel 2 + channel walls 2 + floor 1)
  count += 2; // gate + scrambler
  count += 8; // marbles

  if (features.pendulums) count += features.pendulums.length;
  if (features.trampolines) count += features.trampolines.length;
  if (features.cradles) count += features.cradles.reduce((s, c) => s + c.count, 0);
  if (features.ballPits) count += features.ballPits.reduce((s, p) => s + p.ballCount, 0);

  return count;
}

// ═══════════════════════════════════════════
// Speed burst placement
// ═══════════════════════════════════════════

function placeSpeedBursts(
  rampCYs: number[],
  rampDrop: number,
  rng: () => number,
): SpeedBurstConfig[] {
  const bursts: SpeedBurstConfig[] = [];
  // Pick from middle ramps (skip first and last)
  const candidates = rampCYs.filter((_, i) => i > 0 && i < rampCYs.length - 1);
  const shuffled = [...candidates].sort(() => rng() - 0.5);
  const count = 1 + (rng() < 0.4 ? 1 : 0); // 1-2 bursts

  for (let i = 0; i < Math.min(count, shuffled.length); i++) {
    const rampCY = shuffled[i];
    const rampIdx = rampCYs.indexOf(rampCY);
    const isRight = rampIdx % 2 === 0;
    const x = isRight
      ? ENGINE_WIDTH - EXIT_GAP - 30 + Math.floor(rng() * 20)
      : EXIT_GAP + 30 + Math.floor(rng() * 20);
    const y = Math.round(rampCY + rampDrop + 25 + rng() * 15);
    const directions: ('left' | 'right' | 'down')[] = ['left', 'right', 'down'];
    const direction = directions[Math.floor(rng() * directions.length)];

    bursts.push({
      x, y,
      width: 40 + Math.floor(rng() * 20),
      direction,
      activationChance: 0.5 + rng() * 0.2,
    });
  }
  return bursts;
}

// ═══════════════════════════════════════════
// New obstacle placement (portals, gravity zones, water zones, magnets)
// ═══════════════════════════════════════════

// ═══════════════════════════════════════════
// Main generator
// ═══════════════════════════════════════════

export function generateTrack(seed: number): TrackConfig {
  const rng = createRNG(seed);
  const bp = selectParameters(rng);

  // 1. Layout ramps
  const { rampCYs, ramps, gapZones } = layoutRamps(bp, rng);

  // 2. Assign gap purposes
  assignGaps(gapZones, bp, rng);

  // 3. Place obstacles (pegs, bumpers, funnels)
  const { obstacles, funnels } = placeObstacles(bp, rampCYs, gapZones, rng);

  // 4. Place windmills
  const windmills = placeWindmills(bp, rampCYs, gapZones, rng);

  // 5. Place features
  const features = placeFeatures(bp, rampCYs, gapZones, rng);

  // 6. Body count budget check — reduce pegs if over 80
  let bodyCount = estimateBodyCount(ramps.length, obstacles, windmills, funnels, features);
  if (bodyCount > 80) {
    // Remove some pegs to fit
    const excess = bodyCount - 75;
    const pegs = obstacles.filter(o => o.type === 'peg');
    const toRemove = Math.min(excess, Math.floor(pegs.length * 0.4));
    for (let i = 0; i < toRemove; i++) {
      const idx = obstacles.indexOf(pegs[pegs.length - 1 - i]);
      if (idx >= 0) obstacles.splice(idx, 1);
    }
  }

  // 7. Compute finish Y — must be below all content
  const lowestContent = Math.max(
    ...gapZones.map(g => g.endY),
    rampCYs[rampCYs.length - 1] + bp.rampDrop + 30,
  );
  const finishY = Math.round(lowestContent + 200);

  // 8. Build springs and finish zone
  const springs = generateSprings(rampCYs, bp.rampDrop);
  const finish = generateFinishZone(finishY);
  const totalHeight = finishY + finish.channelDepth + 10;

  // 9. Optional speed bursts
  const speedBursts = bp.useSpeedBursts ? placeSpeedBursts(rampCYs, bp.rampDrop, rng) : undefined;

  return {
    id: `gen-${seed}`,
    engineWidth: ENGINE_WIDTH,
    totalHeight,
    finishY,
    ...finish,
    ramps,
    obstacles,
    windmillConfigs: windmills,
    funnels,
    finishFunnel: finish.finishFunnel,
    springs,
    gravity: { x: 0, y: bp.gravityY, scale: 0.001 },
    bgImage: bp.bgImage,
    ...features,
    ...(speedBursts && speedBursts.length > 0 ? { speedBursts } : {}),
  };
}
