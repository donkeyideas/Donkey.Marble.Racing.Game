import { buildTrack } from './engine/tracks';
import { createRaceEngine } from './engine/race';
import { MARBLES } from './theme';

const DT = 16.67;
const MAX_STEPS = 4500; // ~75 seconds

function diagnoseTrack(id: string) {
  const t = buildTrack(id);
  console.log(`\n${'='.repeat(50)}`);
  console.log(`=== ${id} ===`);
  console.log(`ramps: ${t.ramps.length}, obstacles: ${t.obstacles.length}, windmills: ${t.windmillConfigs.length}`);

  const eng = createRaceEngine(t, MARBLES);
  eng.releaseGate();

  // Track marble positions over time
  const stuckEvents: { name: string; y: number; time: number }[] = [];
  const posHistory: Record<string, { y: number; time: number }[]> = {};
  MARBLES.forEach(m => posHistory[m.name] = []);

  let doomsdayTriggered = false;
  let doomsdayTime = 0;

  let state = eng.step(DT);
  for (let i = 1; i < MAX_STEPS && !state.isFinished; i++) {
    state = eng.step(DT);
    const timeS = state.elapsed / 1000;

    // Sample every 2 seconds
    if (i % 120 === 0) {
      for (const m of state.marbles) {
        posHistory[m.data.name].push({ y: Math.round(m.y), time: Math.round(timeS) });
      }
    }

    // Detect stuck: check every 3 seconds if any marble moved < 20px
    if (i % 180 === 0 && i > 180) {
      for (const m of state.marbles) {
        if (m.finished) continue;
        const hist = posHistory[m.data.name];
        if (hist.length >= 2) {
          const prev = hist[hist.length - 2];
          const curr = hist[hist.length - 1];
          const moved = Math.abs(curr.y - prev.y);
          if (moved < 20) {
            stuckEvents.push({ name: m.data.name, y: curr.y, time: curr.time });
          }
        }
      }
    }

    // Detect doomsday
    if (state.doomsdayBar && !doomsdayTriggered) {
      doomsdayTriggered = true;
      doomsdayTime = timeS;
    }
  }

  // Results
  const sorted = [...state.marbles].sort((a, b) => (a.finishTime || 999999) - (b.finishTime || 999999));
  const allFinished = sorted.every(m => m.finished);
  const finishedCount = sorted.filter(m => m.finished).length;

  console.log(`\nFinished: ${allFinished ? 'ALL 8/8' : finishedCount + '/8'}`);
  if (allFinished) {
    const times = sorted.map(m => (m.finishTime / 1000).toFixed(1));
    console.log(`Finish times: ${times.join(', ')}s`);
    console.log(`Avg: ${(sorted.reduce((s, m) => s + m.finishTime, 0) / sorted.length / 1000).toFixed(1)}s`);
  }

  if (doomsdayTriggered) {
    console.log(`\n** DOOMSDAY BAR triggered at ${doomsdayTime.toFixed(1)}s **`);
  }

  if (stuckEvents.length > 0) {
    console.log(`\n** ${stuckEvents.length} STUCK events detected: **`);
    // Group by Y zone
    const zones: Record<string, number> = {};
    for (const ev of stuckEvents) {
      const zone = `y=${Math.round(ev.y / 100) * 100}`;
      zones[zone] = (zones[zone] || 0) + 1;
    }
    for (const [zone, count] of Object.entries(zones).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${zone}: ${count} stuck events`);
    }
    // Show individual events
    const unique = new Map<string, { y: number; times: number[] }>();
    for (const ev of stuckEvents) {
      const key = `${ev.name}@y${Math.round(ev.y / 50) * 50}`;
      if (!unique.has(key)) unique.set(key, { y: ev.y, times: [] });
      unique.get(key)!.times.push(ev.time);
    }
    for (const [key, data] of unique) {
      console.log(`  ${key}: stuck at ${data.times.join(', ')}s`);
    }
  } else {
    console.log('\nNo stuck events detected — good flow!');
  }

  // Show position trace for each marble (every 5s)
  console.log('\nMarble Y-positions over time:');
  for (const m of MARBLES) {
    const hist = posHistory[m.name];
    const samples = hist.filter((_, i) => i % 2 === 0).map(h => `${h.time}s:${h.y}`);
    console.log(`  ${m.name}: ${samples.join(' → ')}`);
  }

  eng.destroy();
}

// Run 5 times to catch variance
for (let run = 1; run <= 5; run++) {
  console.log(`\n${'#'.repeat(60)}`);
  console.log(`# RUN ${run}`);
  diagnoseTrack('grand-prix');
}
