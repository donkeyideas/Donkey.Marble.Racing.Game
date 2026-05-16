import { buildTrack } from './engine/tracks';
import { createRaceEngine } from './engine/race';
import { MARBLES } from './theme';

const DT = 16.67;
const MAX_STEPS = 4000; // ~67 seconds

function testTrack(id: string) {
  const t = buildTrack(id);
  console.log(`\n=== ${id} ===`);
  console.log('ramps:', t.ramps.length, 'obstacles:', t.obstacles.length, 'windmills:', t.windmillConfigs.length);

  const eng = createRaceEngine(t, MARBLES);
  eng.releaseGate();

  let state = eng.step(DT);
  for (let i = 1; i < MAX_STEPS && !state.isFinished; i++) {
    state = eng.step(DT);
  }

  const sorted = [...state.marbles].sort((a, b) => (a.finishTime || 999999) - (b.finishTime || 999999));
  const allFinished = sorted.every(m => m.finished);
  const avgTime = sorted.reduce((s, m) => s + (m.finishTime || 60000), 0) / sorted.length / 1000;

  console.log(`Finished: ${allFinished ? 'ALL 8/8' : sorted.filter(m => m.finished).length + '/8'}`);
  console.log(`Avg finish: ${avgTime.toFixed(1)}s`);
  if (allFinished) {
    console.log(`Range: ${(sorted[0].finishTime / 1000).toFixed(1)}s - ${(sorted[sorted.length - 1].finishTime / 1000).toFixed(1)}s`);
  }

  if (!allFinished) {
    console.log('DNF marbles:');
    sorted.filter(m => !m.finished).forEach(m => {
      console.log(`  ${m.data.name}: y=${Math.round(m.y)}`);
    });
  }

  eng.destroy();
  return allFinished;
}

// Test obstacle gauntlet (primary) + existing tracks
const tracks = ['obstacle-gauntlet', 'gauntlet', 'terrain-valley', 'pendulum-alley', 'trampoline-park'];
let allPass = true;

for (const id of tracks) {
  for (let run = 0; run < 3; run++) {
    console.log(`\n--- ${id} run ${run + 1} ---`);
    const pass = testTrack(id);
    if (!pass) allPass = false;
  }
}

console.log(`\n${'='.repeat(40)}`);
console.log(allPass ? 'ALL PASSED' : 'SOME FAILURES');
