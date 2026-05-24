/**
 * Rapier engine track-validation runner.
 *
 * Mirrors scripts/test-all-tracks.ts but routes simulations through the
 * new Rapier engine in engine/race-rapier.ts. Same pass criteria so the
 * two runs are directly comparable side-by-side.
 *
 * Usage:
 *   npx tsx scripts/test-all-tracks-rapier.ts             # all 164 courses
 *   npx tsx scripts/test-all-tracks-rapier.ts <track-id>  # one course
 *
 * Output: per-track PASS/FAIL line + summary block at the end matching
 * the Matter test format so a diff between the two runs is meaningful.
 */

import { buildTrack } from '../engine/tracks';
import { ALL_COURSES } from '../data/courses';
import { MARBLES } from '../theme';
import { initRapierEngine, createRaceEngineRapier } from '../engine/race-rapier';

const STEP_DT = 1000 / 60;
const MAX_FRAMES = 75 * 60; // 75s — matches Matter test
const REAL_STUCK_MS = 3000;
const STUCK_DIST_PX = 4;
const RUNS_PER_TRACK = 1; // Bump to 3+ later if we need stability across seeds.

interface RaceResult {
  trackId: string;
  totalTimeMs: number;
  finishedNaturally: number;
  totalMarbles: number;
  doomsdayTriggered: boolean;
  stuckEvents: number;
  escaped: boolean;
}

async function simulateRace(trackId: string): Promise<RaceResult> {
  const track = buildTrack(trackId);
  const engine = createRaceEngineRapier(track, MARBLES);
  engine.releaseGate();

  // Per-marble stuck detection — Y must move >= STUCK_DIST_PX within
  // REAL_STUCK_MS window. Mirrors the Matter test's "real stuck" definition.
  const lastMoveY = new Map<string, number>();
  const lastMoveTime = new Map<string, number>();
  for (const m of MARBLES) {
    lastMoveY.set(m.id, -Infinity);
    lastMoveTime.set(m.id, 0);
  }
  let stuckEvents = 0;
  let escaped = false;
  let lastDoomsdayState = false;
  let doomsdayTriggered = false;

  let frame = 0;
  let lastState = engine.step(STEP_DT);
  while (!lastState.isFinished && frame < MAX_FRAMES) {
    lastState = engine.step(STEP_DT);
    frame += 1;
    const tMs = lastState.elapsed * 1000;

    if (lastState.doomsdayBar?.active) {
      if (!lastDoomsdayState) doomsdayTriggered = true;
      lastDoomsdayState = true;
    }

    for (const m of lastState.marbles) {
      if (m.finished) continue;
      // Escape detection: marble outside the playable bounds.
      if (m.x < -50 || m.x > track.engineWidth + 50 || m.y < -100 || m.y > track.totalHeight + 100) {
        escaped = true;
      }
      const prevY = lastMoveY.get(m.data.id) ?? -Infinity;
      if (Math.abs(m.y - prevY) >= STUCK_DIST_PX) {
        lastMoveY.set(m.data.id, m.y);
        lastMoveTime.set(m.data.id, tMs);
      } else {
        const sinceMove = tMs - (lastMoveTime.get(m.data.id) ?? 0);
        if (sinceMove >= REAL_STUCK_MS) {
          stuckEvents += 1;
          // Reset so we don't double-count the same stuck event next frame.
          lastMoveTime.set(m.data.id, tMs);
        }
      }
    }
  }

  const finishedNaturally = lastState.marbles.filter((m) => m.finished && !doomsdayTriggered).length;
  // If doomsday triggered, count only marbles that finished BEFORE the bar
  // closed the race. This matches the Matter test's "natural finish" rule.
  const finishedNaturalCount = doomsdayTriggered
    ? lastState.marbles.filter((m) => m.finished && m.finishTime > 0 && m.finishTime * 1000 < 50000).length
    : finishedNaturally;

  const totalTimeMs = Math.round(lastState.elapsed * 1000);
  engine.destroy();

  return {
    trackId,
    totalTimeMs,
    finishedNaturally: finishedNaturalCount,
    totalMarbles: MARBLES.length,
    doomsdayTriggered,
    stuckEvents,
    escaped,
  };
}

async function main() {
  await initRapierEngine();

  const arg = process.argv[2];
  const courseIds = arg
    ? [arg]
    : ALL_COURSES.map((c) => c.id);

  console.log(`Rapier track validator — testing ${courseIds.length} courses\n`);

  interface Summary {
    id: string;
    avgTime: number;
    minFinished: number;
    avgFinished: number;
    totalStuck: number;
    doomsdayCount: number;
    pass: boolean;
    issues: string[];
  }
  const results: Summary[] = [];
  let passCount = 0;
  let failCount = 0;

  for (let idx = 0; idx < courseIds.length; idx++) {
    const id = courseIds[idx];
    const runs: RaceResult[] = [];
    let crashed = false;
    for (let r = 0; r < RUNS_PER_TRACK; r++) {
      try {
        runs.push(await simulateRace(id));
      } catch (e: any) {
        crashed = true;
        console.log(`[${idx + 1}/${courseIds.length}] CRASH ${id} — ${e?.message ?? e}`);
        if (e?.stack) console.log(e.stack.split('\n').slice(0, 8).join('\n'));
        break;
      }
    }
    if (crashed) {
      results.push({
        id, avgTime: 0, minFinished: 0, avgFinished: 0, totalStuck: 0,
        doomsdayCount: 0, pass: false, issues: ['CRASH'],
      });
      failCount += 1;
      continue;
    }

    const avgTime = runs.reduce((s, r) => s + r.totalTimeMs, 0) / runs.length / 1000;
    const minFinished = Math.min(...runs.map((r) => r.finishedNaturally));
    const avgFinished = Math.round(runs.reduce((s, r) => s + r.finishedNaturally, 0) / runs.length);
    const totalStuck = runs.reduce((s, r) => s + r.stuckEvents, 0);
    const doomsdayCount = runs.filter((r) => r.doomsdayTriggered).length;
    const escaped = runs.some((r) => r.escaped);

    const issues: string[] = [];
    if (minFinished < MARBLES.length) issues.push(`Only ${minFinished}/${MARBLES.length} finished naturally`);
    if (avgTime > 55) issues.push(`Avg time ${avgTime.toFixed(1)}s > 55s`);
    if (totalStuck > 0) issues.push(`${totalStuck} real-stuck events`);
    if (doomsdayCount > 0) issues.push(`Doomsday triggered ${doomsdayCount}/${RUNS_PER_TRACK} runs`);
    if (escaped) issues.push('Marble ESCAPED the course');

    const pass = minFinished >= MARBLES.length && avgTime <= 55 && totalStuck === 0 && !escaped && doomsdayCount === 0;
    results.push({ id, avgTime, minFinished, avgFinished, totalStuck, doomsdayCount, pass, issues });
    if (pass) passCount += 1; else failCount += 1;

    const status = pass ? 'PASS' : 'FAIL';
    console.log(`[${idx + 1}/${courseIds.length}] ${status} ${id.padEnd(22)} avg=${avgTime.toFixed(1)}s  fin=${minFinished}-${avgFinished}/${MARBLES.length}  stuck=${totalStuck}  doom=${doomsdayCount}${issues.length > 0 ? '  !! ' + issues[0] : ''}`);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  RAPIER AUDIT SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Total tracks tested: ${courseIds.length}`);
  console.log(`  PASS: ${passCount}  |  FAIL: ${failCount}`);
  console.log(`  Pass rate: ${((passCount / courseIds.length) * 100).toFixed(1)}%`);

  if (failCount > 0) {
    console.log('\n  FAILING TRACKS:');
    results.filter((r) => !r.pass).forEach((r) => {
      console.log(`    ${r.id.padEnd(22)} avg=${r.avgTime.toFixed(1)}s  fin=${r.minFinished}/${MARBLES.length}  stuck=${r.totalStuck}  issues: ${r.issues.join('; ')}`);
    });
  }

  const passedTimes = results.filter((r) => r.pass).map((r) => r.avgTime);
  if (passedTimes.length > 0) {
    const avgOverall = passedTimes.reduce((s, t) => s + t, 0) / passedTimes.length;
    const slowest = results.filter((r) => r.pass).reduce((a, b) => (a.avgTime > b.avgTime ? a : b));
    const fastest = results.filter((r) => r.pass).reduce((a, b) => (a.avgTime < b.avgTime ? a : b));
    console.log(`\n  Avg time (passing tracks): ${avgOverall.toFixed(1)}s`);
    console.log(`  Fastest: ${fastest.id} (${fastest.avgTime.toFixed(1)}s)`);
    console.log(`  Slowest: ${slowest.id} (${slowest.avgTime.toFixed(1)}s)`);
  }
  console.log('');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
