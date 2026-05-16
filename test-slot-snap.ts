// Verify that finished marbles snap to their numbered slot positions.
// Run: npx tsx test-slot-snap.ts

import { createRaceEngine } from './engine/race';
import { buildTrack } from './engine/tracks';
import { MARBLES } from './theme';

const DT = 16.67;
const MAX_STEPS = 4000;
const SLOT_H = 26;

function testSlotSnap(trackId: string): void {
  console.log(`\n=== ${trackId} ===`);
  const track = buildTrack(trackId);
  const engine = createRaceEngine(track, MARBLES);
  engine.releaseGate();

  let state = engine.step(DT);
  while (!state.isFinished && state.elapsed < MAX_STEPS * DT) {
    state = engine.step(DT);
  }

  // After the race is over, every finished marble (with a finishTime set
  // during the per-frame finishY crossing — not via the doomsday fallback)
  // should be sitting at its slot Y. Print the actual positions.
  const finishOrder = engine.getPositions();
  console.log(`  Finished @ ${(state.elapsed / 1000).toFixed(1)}s, ${finishOrder.length} marbles ranked.`);
  console.log(`  finishY=${track.finishY}, channelDepth=${track.channelDepth}, channelCX=${track.channelCX}`);

  let snappedOk = 0;
  let chaotic = 0;
  finishOrder.forEach((p, i) => {
    const rank = i + 1;
    const expectedY = track.finishY + track.channelDepth - (rank - 0.5) * SLOT_H;
    const expectedX = track.channelCX;
    const m = state.marbles.find(sm => sm.data.id === p.marble.id);
    if (!m) return;
    const dx = m.x - expectedX;
    const dy = m.y - expectedY;
    const offset = Math.sqrt(dx * dx + dy * dy);
    const status = offset < 5 ? 'SNAPPED' : offset < 30 ? 'CLOSE  ' : 'CHAOTIC';
    if (offset < 5) snappedOk++; else chaotic++;
    console.log(`    rank ${rank} ${p.marble.id.padEnd(7)} pos=(${m.x.toFixed(1)}, ${m.y.toFixed(1)}) expected=(${expectedX.toFixed(1)}, ${expectedY.toFixed(1)}) off=${offset.toFixed(1)} ${status}`);
  });
  console.log(`  ✓ snapped=${snappedOk}/8, chaotic=${chaotic}/8`);
}

['bumper-blitz', 'classic-zigzag', 'cradle-drop', 'pendulum-alley'].forEach(t => {
  try { testSlotSnap(t); } catch (e) { console.log(`*** ${t}: ${(e as Error).message}`); }
});
