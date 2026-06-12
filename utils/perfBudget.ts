/**
 * Pure-TS performance budget table. No React Native imports — safe to
 * pull into engine/race.ts which is also consumed by Node-side test
 * scripts. The Platform-aware tier detection + AsyncStorage caching
 * lives in utils/perfTier.ts.
 *
 * Tier semantics: see the TS-doc on `RemoteConfig.perfTier` in
 * lib/remoteConfig.ts.
 */

export type PerfTier = 'low' | 'medium' | 'high';

export interface PerfBudget {
  /** Physics substeps per render frame. */
  substeps: number;
  /** Telemetry sort cadence (every N render frames). */
  telemetryEvery: number;
  /** Multiplier on procedural-track peg counts. */
  pegDensityMul: number;
  /** Cap on ball-pit ball count per track (Infinity = uncapped). */
  ballPitMax: number;
  /** Whether decorative motion (e.g. layered wobbles) is enabled. */
  enableDecorMotion: boolean;
}

export const BUDGETS: Record<PerfTier, PerfBudget> = {
  low: {
    substeps: 1,
    telemetryEvery: 6,
    pegDensityMul: 0.7,
    ballPitMax: 12,
    enableDecorMotion: false,
  },
  medium: {
    substeps: 2,
    telemetryEvery: 3,
    pegDensityMul: 1.0,
    ballPitMax: Infinity,
    enableDecorMotion: true,
  },
  high: {
    substeps: 2,
    telemetryEvery: 1,
    pegDensityMul: 1.0,
    ballPitMax: Infinity,
    enableDecorMotion: true,
  },
};

export function budgetFor(tier: PerfTier): PerfBudget {
  return BUDGETS[tier];
}

/** Default budget used by the engine when no tier is supplied — mirrors
 *  the historical 2-substep / every-3-frame-telemetry tuning. */
export const DEFAULT_BUDGET: PerfBudget = BUDGETS.medium;
