/**
 * Engine dispatcher.
 *
 * Routes createRaceEngine() calls to either the Matter.js implementation
 * (engine/race.ts) or the Rapier.js implementation (engine/race-rapier.ts)
 * based on USE_RAPIER in engineConfig.ts.
 *
 * Safety: if USE_RAPIER is true but Rapier hasn't finished its async init
 * yet, falls back to Matter.js for that call rather than throwing. This
 * means the first race after a cold start *might* use Matter.js even with
 * the flag on, which is acceptable — a slightly-different first race is
 * better than a crash.
 *
 * To enable Rapier in testing:
 *   1. Flip USE_RAPIER in engine/engineConfig.ts to true
 *   2. Ensure initRapierEngine() is called at app boot (see app/_layout.tsx)
 *   3. Reload the app
 */

import { createRaceEngine as createRaceEngineMatter } from './race';
import { createRaceEngineRapier } from './race-rapier';
import { useRapier, RAPIER_READY } from './engineConfig';
import type { TrackConfig } from './tracks';
import type { RaceEngineOptions } from './race';
import type { MarbleData } from '../theme';

export function createRaceEngine(
  configOrOpts?: TrackConfig | RaceEngineOptions,
  raceMarbles?: MarbleData[],
): ReturnType<typeof createRaceEngineMatter> {
  if (useRapier() && RAPIER_READY) {
    // The Rapier engine returns the same surface shape as Matter.js, but
    // TypeScript can't prove it because the two implementations don't share
    // an interface declaration (yet — Stage 2 cleanup). Cast through unknown
    // is the pragmatic intermediate; structural compatibility is verified by
    // the parallel return-type definitions in race-rapier.ts.
    return createRaceEngineRapier(configOrOpts, raceMarbles) as unknown as ReturnType<
      typeof createRaceEngineMatter
    >;
  }
  return createRaceEngineMatter(configOrOpts, raceMarbles);
}

// Re-export the eager init helper so the boot path can await it.
export { initRapierEngine } from './race-rapier';
