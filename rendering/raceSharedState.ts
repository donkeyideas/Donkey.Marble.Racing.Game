/**
 * Reanimated SharedValue state for race rendering.
 * Camera updates at full RAF rate (60fps) via SharedValue — bypasses React.
 * Element positions still flow through setFrame at a reduced rate.
 */
import { useSharedValue, SharedValue } from 'react-native-reanimated';

export interface RaceSharedState {
  /** Camera Y position in engine units — updated every RAF frame */
  cameraY: SharedValue<number>;
}

/**
 * Creates SharedValues for race state that bypasses React reconciliation.
 * Call once in the race screen component.
 */
export function useRaceSharedState(): RaceSharedState {
  return {
    cameraY: useSharedValue(0),
  };
}
