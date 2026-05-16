// Headless physics test — runs all tracks through the Matter.js engine
// Usage: cd E:\Donkey.Marble.Racing && npx tsx test-all-tracks.ts

import { createRaceEngine } from './engine/race';
import {
  buildClassicZigzag, buildBumperBlitz, buildPendulumAlley,
  buildBallPitRun, buildPegStorm, buildCradleDrop,
  buildTrampolinePark, buildTerrainValley, buildGauntlet,
  buildTrack,
} from './engine/tracks';
import { MARBLES } from './theme';

const DT = 16.67; // 60fps frame
const MAX_STEPS = 5000; // ~83s max simulation time
const TRIALS = 3;

interface TrialResult {
  trial: number;
  elapsed: number;
  finishedCount: number;
  totalCount: number;
  allFinished: boolean;
  winnerTime: number;
  lastFinishTime: number;
  usedDoomsday: boolean;
  stuckMarbles: string[];
  finishOrder: { name: string; time: number }[];
}

interface TrackResult {
  trackId: string;
  trials: TrialResult[];
  pass: boolean;
  issues: string[];
}

function runTrial(trackBuilder: () => any, trial: number): TrialResult {
  const track = trackBuilder();
  const engine = createRaceEngine(track, MARBLES);

  // Release gate immediately
  engine.releaseGate();

  let state = engine.step(DT);
  let usedDoomsday = false;

  // Track marble positions for stuck detection
  const lastPositions = new Map<string, { x: number; y: number; step: number }>();
  const stuckEvents = new Map<string, number>();

  for (let step = 1; step < MAX_STEPS; step++) {
    state = engine.step(DT);

    // Check for doomsday bar
    if (state.doomsdayBar?.active) usedDoomsday = true;

    // Check for stuck marbles every 120 steps (~2s)
    if (step % 120 === 0) {
      for (const m of state.marbles) {
        if (m.finished) continue;
        const last = lastPositions.get(m.data.id);
        if (last) {
          const dx = m.x - last.x;
          const dy = m.y - last.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 5) {
            stuckEvents.set(m.data.id, (stuckEvents.get(m.data.id) || 0) + 1);
          }
        }
        lastPositions.set(m.data.id, { x: m.x, y: m.y, step });
      }
    }

    if (state.isFinished) break;
  }

  const finished = state.marbles.filter(m => m.finished);
  const unfinished = state.marbles.filter(m => !m.finished);
  const stuckMarbles = Array.from(stuckEvents.entries())
    .filter(([_, count]) => count >= 3) // stuck for 6+ seconds
    .map(([id]) => id);

  const finishOrder = state.marbles
    .filter(m => m.finishTime > 0)
    .sort((a, b) => a.finishTime - b.finishTime)
    .map(m => ({ name: m.data.name, time: Math.round(m.finishTime) }));

  const winnerTime = finishOrder.length > 0 ? finishOrder[0].time : 0;
  const lastFinishTime = finishOrder.length > 0 ? finishOrder[finishOrder.length - 1].time : 0;

  engine.destroy();

  return {
    trial,
    elapsed: Math.round(state.elapsed),
    finishedCount: finished.length,
    totalCount: state.marbles.length,
    allFinished: finished.length === state.marbles.length,
    winnerTime,
    lastFinishTime,
    usedDoomsday,
    stuckMarbles,
    finishOrder,
  };
}

function testTrack(id: string, builder: () => any): TrackResult {
  const trials: TrialResult[] = [];
  const issues: string[] = [];

  for (let t = 0; t < TRIALS; t++) {
    try {
      const result = runTrial(builder, t + 1);
      trials.push(result);
    } catch (e: any) {
      issues.push(`Trial ${t + 1} CRASHED: ${e.message}`);
      trials.push({
        trial: t + 1, elapsed: 0, finishedCount: 0, totalCount: 8,
        allFinished: false, winnerTime: 0, lastFinishTime: 0,
        usedDoomsday: false, stuckMarbles: [], finishOrder: [],
      });
    }
  }

  // Analyze results — doomsday bar is a legitimate game mechanic, not a failure
  const anyDNF = trials.some(t => !t.allFinished);
  const anyDoomsday = trials.some(t => t.usedDoomsday);
  const avgWinnerTime = trials.reduce((s, t) => s + t.winnerTime, 0) / trials.length;
  const uniqueWinners = new Set(trials.map(t => t.finishOrder[0]?.name)).size;

  // FAIL conditions: DNF or unreasonable times
  if (anyDNF) issues.push('CRITICAL: Some marbles did not finish (DNF)');
  if (avgWinnerTime > 55000) issues.push(`CRITICAL: Avg winner time too slow: ${(avgWinnerTime/1000).toFixed(1)}s`);
  if (avgWinnerTime < 5000) issues.push(`CRITICAL: Avg winner time too fast: ${(avgWinnerTime/1000).toFixed(1)}s`);

  // WARN conditions: not ideal but acceptable
  if (anyDoomsday) issues.push('WARN: Doomsday bar was used (acceptable safety net)');
  if (uniqueWinners < 2 && TRIALS >= 3) issues.push(`WARN: Same winner in all ${TRIALS} trials`);

  const hasCritical = issues.some(i => i.startsWith('CRITICAL'));
  const pass = !hasCritical;

  return { trackId: id, trials, pass, issues };
}

// ═══════════════════════════════════════════
// Run all tests
// ═══════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════╗');
console.log('║  DONKEY MARBLE RACING — HEADLESS TRACK TESTER   ║');
console.log('╚══════════════════════════════════════════════════╝\n');

const handcraftedTracks: [string, () => any][] = [
  ['classic-zigzag', buildClassicZigzag],
  ['bumper-blitz', buildBumperBlitz],
  ['pendulum-alley', buildPendulumAlley],
  ['ball-pit-run', buildBallPitRun],
  ['peg-storm', buildPegStorm],
  ['cradle-drop', buildCradleDrop],
  ['trampoline-park', buildTrampolinePark],
  ['terrain-valley', buildTerrainValley],
  ['gauntlet', buildGauntlet],
];

const results: TrackResult[] = [];

console.log('=== HAND-CRAFTED TRACKS ===\n');
for (const [id, builder] of handcraftedTracks) {
  process.stdout.write(`Testing ${id}...`);
  const result = testTrack(id, builder);
  results.push(result);

  const status = result.pass ? 'PASS' : 'FAIL';
  const avgTime = (result.trials.reduce((s, t) => s + t.winnerTime, 0) / result.trials.length / 1000).toFixed(1);
  const finishCounts = result.trials.map(t => `${t.finishedCount}/${t.totalCount}`).join(', ');
  console.log(` ${status}`);
  console.log(`  Finished: [${finishCounts}]  Avg winner: ${avgTime}s`);
  for (const t of result.trials) {
    const winner = t.finishOrder[0];
    console.log(`  Trial ${t.trial}: ${winner?.name || 'N/A'} won at ${(t.winnerTime/1000).toFixed(1)}s | last at ${(t.lastFinishTime/1000).toFixed(1)}s${t.usedDoomsday ? ' [DOOMSDAY]' : ''}${t.stuckMarbles.length > 0 ? ` [STUCK: ${t.stuckMarbles.join(',')}]` : ''}`);
  }
  if (result.issues.length > 0) {
    console.log(`  ISSUES: ${result.issues.join('; ')}`);
  }
  console.log();
}

// Test ALL 100 validated procedural tracks
console.log('=== ALL 100 VALIDATED PROCEDURAL TRACKS ===\n');
const VALIDATED_SEEDS = [
  1004, 1006, 1013, 1028, 1041, 1043, 1055, 1068, 1081, 1094,
  1098, 1106, 1109, 1123, 1130, 1139, 1143, 1144, 1150, 1165,
  1172, 1175, 1177, 1178, 1187, 1192, 1203, 1204, 1206, 1214,
  1219, 1240, 1241, 1250, 1262, 1280, 1299, 1300, 1322, 1325,
  1337, 1351, 1353, 1360, 1365, 1368, 1387, 1390, 1403, 1410,
  1411, 1425, 1426, 1428, 1432, 1433, 1435, 1436, 1466, 1473,
  1479, 1488, 1489, 1494, 1510, 1520, 1523, 1548, 1561, 1564,
  1579, 1580, 1581, 1592, 1598, 1604, 1608, 1618, 1620, 1638,
  1639, 1646, 1657, 1663, 1667, 1670, 1691, 1693, 1694, 1725,
  1750, 1805, 1840, 1895, 1910, 1940, 1970, 2005, 2010, 2015,
];

let genPassed = 0, genFailed = 0;
const failedGen: string[] = [];

for (let i = 0; i < VALIDATED_SEEDS.length; i++) {
  const seed = VALIDATED_SEEDS[i];
  const id = `gen-${seed}`;
  process.stdout.write(`  [${i+1}/100] ${id}...`);
  const result = testTrack(id, () => buildTrack(id));
  results.push(result);

  if (result.pass) {
    genPassed++;
    const avgTime = (result.trials.reduce((s, t) => s + t.winnerTime, 0) / result.trials.length / 1000).toFixed(1);
    const warns = result.issues.filter(i => i.startsWith('WARN'));
    console.log(` PASS (${avgTime}s)${warns.length > 0 ? ' [DOOMSDAY]' : ''}`);
  } else {
    genFailed++;
    failedGen.push(id);
    console.log(` FAIL`);
    console.log(`    ${result.issues.join('; ')}`);
    for (const t of result.trials) {
      console.log(`    Trial ${t.trial}: ${t.finishedCount}/${t.totalCount} finished, winner ${(t.winnerTime/1000).toFixed(1)}s, last ${(t.lastFinishTime/1000).toFixed(1)}s${t.usedDoomsday ? ' [DOOM]' : ''}${t.stuckMarbles.length ? ' stuck:'+t.stuckMarbles.join(',') : ''}`);
    }
  }
}
console.log(`\nProcedural summary: ${genPassed}/100 passed, ${genFailed} failed`);
if (failedGen.length > 0) console.log(`Failed: ${failedGen.join(', ')}`);

// Summary
console.log('═══════════════════════════════════════════');
console.log('SUMMARY');
console.log('═══════════════════════════════════════════');

const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
console.log(`Total: ${results.length} tracks tested`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.log('\nFailing tracks:');
  for (const r of results.filter(r => !r.pass)) {
    console.log(`  ${r.trackId}: ${r.issues.join('; ')}`);
  }
}

console.log('\n' + (failed === 0 ? 'ALL TRACKS PASS!' : `${failed} TRACK(S) NEED FIXING`));
