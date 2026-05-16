/**
 * Reanimated SharedValue state for race rendering.
 *
 * EVERY per-frame animated value lives here so Skia's UI thread can read them
 * without triggering React re-renders. The React tree only re-renders for the
 * HUD (leaderboard, timer) at ~4Hz — the canvas is pure GPU after mount.
 *
 * Numeric arrays are flat for predictable Reanimated worklet access:
 *   - per-marble pair: [x0, y0, x1, y1, ...]
 *   - per-element scalar: [v0, v1, ...]
 */
import { useSharedValue, SharedValue } from 'react-native-reanimated';

export interface RaceSharedState {
  /** Camera Y in engine units. */
  cameraY: SharedValue<number>;
  /** Per-marble [x, y] pairs in engine units. */
  marblePositions: SharedValue<number[]>;
  /** Per-windmill angle in radians. */
  windmillAngles: SharedValue<number[]>;
  /** Per-pendulum bob [x, y] pairs in engine units. */
  pendulumBobs: SharedValue<number[]>;
  /** Per-cradle-pendulum bob [x, y] pairs in engine units. */
  cradleBobs: SharedValue<number[]>;
  /** Per-ball-pit-ball [x, y] pairs in engine units. */
  ballPitPositions: SharedValue<number[]>;
  /** Per-speedburst active flag (0 or 1). */
  speedBurstActive: SharedValue<number[]>;
  /** Doomsday bar Y in engine units; -1 means not active. */
  doomsdayBarY: SharedValue<number>;
  /** Doomsday bar active flag (0 or 1). */
  doomsdayBarActive: SharedValue<number>;
}

/**
 * Creates SharedValues for race state. Call once at the top of the race screen.
 * Initial array sizes are placeholders — values are written by the RAF loop on
 * the first physics step, after which the lengths stay constant for the race.
 */
export function useRaceSharedState(): RaceSharedState {
  return {
    cameraY: useSharedValue(0),
    marblePositions: useSharedValue<number[]>(new Array(16).fill(0)),
    windmillAngles: useSharedValue<number[]>([]),
    pendulumBobs: useSharedValue<number[]>([]),
    cradleBobs: useSharedValue<number[]>([]),
    ballPitPositions: useSharedValue<number[]>([]),
    speedBurstActive: useSharedValue<number[]>([]),
    doomsdayBarY: useSharedValue(-1),
    doomsdayBarActive: useSharedValue(0),
  };
}
