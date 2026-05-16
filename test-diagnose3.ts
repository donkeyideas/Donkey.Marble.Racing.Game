import { createRaceEngine } from './engine/race';
import { buildBumperBlitz, buildTrack } from './engine/tracks';
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

  console.log(`\n=== ${id} (finishY=${track.finishY}) ===`);
  const sorted = [...state.marbles].sort((a,b) => (a.finishTime||999999) - (b.finishTime||999999));
  const slow = sorted.filter(m => !m.finished || m.finishTime > 40000);
  if (slow.length === 0) { console.log('All finished quickly!'); engine.destroy(); return; }

  for (const m of slow) {
    const log = posLog.get(m.data.id)!;
    const times = log.map(p => `t=${p.t}:(${p.x},${p.y})`).join(' → ');
    console.log(`  ${m.data.name}: ${m.finished ? (m.finishTime/1000).toFixed(1)+'s' : 'DNF at ('+Math.round(m.x)+','+Math.round(m.y)+')'} | ${times}`);
  }

  // Print funnels
  console.log(`  Funnels: ${track.funnels.length}`);
  track.funnels.forEach((f: any) => console.log(`    y: ${f.y1}-${f.y2}, exit: ${f.leftX2}-${f.rightX2} (width=${f.rightX2-f.leftX2})`));

  engine.destroy();
}

diagnose('bumper-blitz', buildBumperBlitz);
diagnose('gen-2000', () => buildTrack('gen-2000'));
diagnose('gen-9999', () => buildTrack('gen-9999'));
