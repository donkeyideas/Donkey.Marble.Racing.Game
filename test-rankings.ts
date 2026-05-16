// Headless verification: prove that:
//  1. The engine's exposed `marbles` order matches step()'s `st.marbles` order
//     (this is what the renderer relies on to draw the right color at each index).
//  2. The leaderboard sort produces a ranking consistent with the underlying physics.
//  3. The "1st place" reported by getPositions matches the marble with the lowest
//     finishTime (or highest Y among unfinished).
//
// Run: npx tsx test-rankings.ts

import { createRaceEngine } from './engine/race';
import { buildTrack } from './engine/tracks';
import { MARBLES, MarbleData } from './theme';

const DT = 16.67;
const MAX_STEPS = 4000;

interface FrameSnapshot {
  step: number;
  elapsed: number;
  // What the renderer sees:
  marblesByIndex: { id: string; x: number; y: number; finished: boolean; finishTime: number }[];
  // What the leaderboard sort (mirrored from race.tsx) produces:
  leaderboardTop5: { id: string; rank: number }[];
  // What getPositions() reports (authoritative):
  enginePositions: { id: string; time: number; rank: number }[];
}

// Mirror of the leaderboard sort in app/race.tsx
function leaderboardSort(marbles: { data: { id: string }; y: number; finished: boolean; finishTime: number }[]) {
  return [...marbles].sort((a, b) => {
    if (a.finished && !b.finished) return -1;
    if (!a.finished && b.finished) return 1;
    if (a.finished && b.finished) return (a.finishTime || 0) - (b.finishTime || 0);
    return b.y - a.y;
  });
}

function runTest(trackId: string): void {
  console.log(`\n=== Track: ${trackId} ===`);
  const track = buildTrack(trackId);
  const engine = createRaceEngine(track, MARBLES);

  // ASSERTION 1: engine.marbles must be a 1:1 ordered match with the first
  // step()'s st.marbles. This is the contract the renderer relies on.
  const exposedOrder = engine.marbles.map(m => m.id);
  engine.releaseGate();
  const firstState = engine.step(DT);
  const stepOrder = firstState.marbles.map(m => m.data.id);

  const matches = exposedOrder.length === stepOrder.length &&
    exposedOrder.every((id, i) => id === stepOrder[i]);
  console.log(`  engine.marbles order:  [${exposedOrder.join(', ')}]`);
  console.log(`  st.marbles[*].id:       [${stepOrder.join(', ')}]`);
  console.log(`  ✓ Order match: ${matches ? 'YES' : '*** MISMATCH ***'}`);
  if (!matches) {
    console.log('  CRITICAL: renderer would draw wrong color at each physics index!');
    return;
  }

  // ASSERTION 2: at every frame, leaderboard's 1st place must match
  // getPositions()[0]. If these diverge, the HUD lies about who's winning.
  let leaderboardMismatches = 0;
  const samples: FrameSnapshot[] = [];

  for (let s = 0; s < MAX_STEPS; s++) {
    const state = engine.step(DT);

    // Sample every 30 frames (~0.5s)
    if (s % 30 === 0 || state.isFinished) {
      const lbSorted = leaderboardSort(state.marbles);
      const lb1stId = lbSorted[0]?.data.id;

      const enginePos = engine.getPositions();
      const engine1stId = enginePos[0]?.marble.id;

      if (lb1stId !== engine1stId) {
        leaderboardMismatches++;
        if (leaderboardMismatches <= 3) {
          console.log(`  [${(state.elapsed / 1000).toFixed(1)}s] HUD says 1st = ${lb1stId}, engine says 1st = ${engine1stId}`);
        }
      }

      if (s % 300 === 0 || state.isFinished) {
        samples.push({
          step: s,
          elapsed: state.elapsed,
          marblesByIndex: state.marbles.map(m => ({
            id: m.data.id, x: m.x, y: m.y, finished: m.finished, finishTime: m.finishTime,
          })),
          leaderboardTop5: lbSorted.slice(0, 5).map((m, i) => ({ id: m.data.id, rank: i + 1 })),
          enginePositions: enginePos.slice(0, 5).map((p, i) => ({ id: p.marble.id, time: p.time, rank: i + 1 })),
        });
      }
    }

    if (state.isFinished) break;
  }

  console.log(`  ✓ Leaderboard ↔ engine 1st place mismatches: ${leaderboardMismatches}`);

  // Print the final ranking and verify it matches finish-time order
  const final = samples[samples.length - 1];
  console.log(`  Final state @ ${(final.elapsed / 1000).toFixed(1)}s:`);
  console.log(`    Engine ranking: ${final.enginePositions.map(p => `${p.rank}.${p.id}(${p.time.toFixed(2)})`).join(' ')}`);
  console.log(`    HUD leaderboard: ${final.leaderboardTop5.map(p => `${p.rank}.${p.id}`).join(' ')}`);

  const rankingsAgree = final.enginePositions.every((ep, i) => ep.id === final.leaderboardTop5[i]?.id);
  console.log(`  ✓ Final ranking agreement: ${rankingsAgree ? 'YES' : '*** DISAGREE ***'}`);
}

// Test against 5 different track types
const TRACKS = ['classic-zigzag', 'bumper-blitz', 'pendulum-alley', 'cradle-drop', 'trampoline-park'];
for (const t of TRACKS) {
  try {
    runTest(t);
  } catch (e) {
    console.log(`  *** ERROR running ${t}: ${(e as Error).message}`);
  }
}

console.log('\n=== Test complete ===');
