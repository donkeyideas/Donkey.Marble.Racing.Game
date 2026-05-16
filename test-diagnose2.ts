import { createRaceEngine } from './engine/race';
import { buildClassicZigzag, buildCradleDrop, buildGauntlet } from './engine/tracks';
import { MARBLES } from './theme';

const DT = 16.67;
const MAX_STEPS = 4000;

function diagnose(id: string, builder: () => any) {
  const track = builder();
  const engine = createRaceEngine(track, MARBLES);
  engine.releaseGate();
  let state = engine.step(DT);
  const posLog: Map<string, { x: number; y: number; t: number }[]> = new Map();
  MARBLES.forEach(m => posLog.set(m.id, []));

  for (let step = 1; step < MAX_STEPS; step++) {
    state = engine.step(DT);
    if (step % 180 === 0) {
      for (const m of state.marbles) {
        if (!m.finished) posLog.get(m.data.id)!.push({ x: Math.round(m.x), y: Math.round(m.y), t: Math.round(state.elapsed/1000) });
      }
    }
    if (state.isFinished) break;
  }

  console.log(`\n=== ${id} ===`);
  const sorted = [...state.marbles].sort((a,b) => (a.finishTime||999999) - (b.finishTime||999999));
  const slow = sorted.filter(m => !m.finished || m.finishTime > 40000);
  if (slow.length === 0) { console.log('All finished quickly!'); engine.destroy(); return; }

  console.log(`Slow/stuck marbles (${slow.length}):`);
  for (const m of slow) {
    const log = posLog.get(m.data.id)!;
    const times = log.map(p => `t=${p.t}:(${p.x},${p.y})`).join(' → ');
    console.log(`  ${m.data.name}: ${m.finished ? (m.finishTime/1000).toFixed(1)+'s' : 'DNF'} | ${times}`);
  }
  engine.destroy();
}

diagnose('classic-zigzag', buildClassicZigzag);
diagnose('cradle-drop', buildCradleDrop);
diagnose('gauntlet', buildGauntlet);
