// Diagnostic test — tracks WHERE marbles spend time and get stuck
// Usage: cd E:\Donkey.Marble.Racing && npx tsx test-diagnose.ts

import { createRaceEngine } from './engine/race';
import { buildClassicZigzag, buildGauntlet, buildTerrainValley } from './engine/tracks';
import { MARBLES } from './theme';

const DT = 16.67;
const MAX_STEPS = 5000;

function diagnoseTrack(id: string, builder: () => any) {
  const track = builder();
  const engine = createRaceEngine(track, MARBLES);
  engine.releaseGate();

  console.log(`\n=== ${id} ===`);
  console.log(`Track: finishY=${track.finishY}, totalHeight=${track.totalHeight}`);
  console.log(`Ramps: ${track.ramps.length}, Obstacles: ${track.obstacles.length}`);
  console.log(`Springs: ${track.springs.length}, Funnels: ${track.funnels.length}`);
  console.log(`Channel: left=${track.channelLeft} right=${track.channelRight} width=${track.channelRight - track.channelLeft}`);

  // Track position history per marble
  const positionLog: Map<string, { x: number; y: number; t: number }[]> = new Map();
  MARBLES.forEach(m => positionLog.set(m.id, []));

  let state = engine.step(DT);

  for (let step = 1; step < MAX_STEPS; step++) {
    state = engine.step(DT);

    // Log positions every 300 steps (~5s)
    if (step % 300 === 0) {
      for (const m of state.marbles) {
        if (!m.finished) {
          positionLog.get(m.data.id)!.push({ x: Math.round(m.x), y: Math.round(m.y), t: Math.round(state.elapsed / 1000) });
        }
      }
    }

    if (state.isFinished) break;
  }

  // Report finish order
  const sorted = [...state.marbles].sort((a, b) => (a.finishTime || 999999) - (b.finishTime || 999999));
  console.log('\nFinish order:');
  sorted.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.data.name} — ${m.finished ? (m.finishTime / 1000).toFixed(1) + 's' : 'DNF'} (last pos: ${Math.round(m.x)}, ${Math.round(m.y)})`);
  });

  // Find slow/stuck marbles (finish > 45s or DNF)
  const slowMarbles = sorted.filter(m => !m.finished || m.finishTime > 45000);
  if (slowMarbles.length > 0) {
    console.log('\nSlow/stuck marble position traces:');
    for (const m of slowMarbles) {
      const log = positionLog.get(m.data.id)!;
      console.log(`  ${m.data.name}:`);
      for (const pos of log) {
        console.log(`    t=${pos.t}s: (${pos.x}, ${pos.y})`);
      }
    }
  }

  // Identify stuck zones — where do marbles linger?
  const zoneTime: Map<string, number> = new Map();
  for (const [id, log] of positionLog) {
    for (let i = 1; i < log.length; i++) {
      const dy = log[i].y - log[i - 1].y;
      if (Math.abs(dy) < 20) {
        // Marble barely moved vertically in 5s — stuck!
        const zone = `y≈${Math.round(log[i].y / 50) * 50}`;
        zoneTime.set(zone, (zoneTime.get(zone) || 0) + 1);
      }
    }
  }

  if (zoneTime.size > 0) {
    console.log('\nStuck zones (y-ranges where marbles linger):');
    const sorted = [...zoneTime.entries()].sort((a, b) => b[1] - a[1]);
    for (const [zone, count] of sorted.slice(0, 5)) {
      console.log(`  ${zone}: ${count} events`);
    }
  }

  // Check ramp and spring positions
  console.log('\nRamp Y ranges:');
  for (const ramp of track.ramps) {
    const ys = ramp.points.map((p: any) => p.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    console.log(`  engineCY=${ramp.engineCY}: y=${Math.round(minY)}-${Math.round(maxY)}`);
  }

  console.log('\nSpring positions:');
  for (const sp of track.springs) {
    console.log(`  (${sp.x}, ${sp.y}) ${sp.w}x${sp.h}`);
  }

  console.log('\nFinish funnel:');
  const ff = track.finishFunnel;
  console.log(`  y: ${ff.y1}-${ff.y2}`);
  console.log(`  left: ${ff.leftX1}-${ff.leftX2}`);
  console.log(`  right: ${ff.rightX1}-${ff.rightX2}`);

  engine.destroy();
}

// Diagnose the worst-performing tracks
diagnoseTrack('classic-zigzag', buildClassicZigzag);
diagnoseTrack('terrain-valley', buildTerrainValley);
diagnoseTrack('gauntlet', buildGauntlet);
