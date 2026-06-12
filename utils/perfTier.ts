/**
 * Device performance tier resolution.
 *
 * Each race loop and several track-generator knobs read `getPerfTier()`
 * to decide how much physics + telemetry work to do per frame. Older /
 * mid-range phones drop to "low" so the framerate stays playable;
 * flagships sit on "high" and pay full cost for the visual richness.
 *
 * Resolution order:
 *   1. Remote config override (`perfTier` in remoteConfig). Lets ops
 *      pin a problematic device model to "low" after a support ticket.
 *   2. Locally detected tier (cached in AsyncStorage after first run).
 *   3. Heuristic detection (this module) — Platform + model + total
 *      memory probe. Default `medium` if nothing is conclusive.
 *
 * The resolved tier is cached in module-level memory so the lookup is
 * O(1) for the rest of the session.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getConfig } from '../lib/remoteConfig';
import { BUDGETS, type PerfBudget, type PerfTier } from './perfBudget';

export type { PerfTier, PerfBudget } from './perfBudget';

const CACHE_KEY = 'dmr-perf-tier-local';
let detected: PerfTier | null = null;

/**
 * Initial heuristic detection. Runs once per install; the result is
 * persisted so subsequent launches are instant.
 *
 * Heuristic — kept intentionally simple so it's auditable:
 *   - iOS: anything pre-iPhone-12 family is "low", iPhone 12 / 13 mid,
 *          14+ high. We can't always read model precisely without a
 *          native module, so we err toward "medium" when uncertain.
 *   - Android: we don't have a clean RAM/CPU API in the managed
 *          workflow. Default to "medium"; rely on the remote-config
 *          override for the long tail of low-end Android.
 */
function detectHeuristic(): PerfTier {
  if (Platform.OS === 'ios') {
    // Without a native module we can only read Platform.constants.osVersion.
    // Use OS major as a proxy for device age — iOS 17+ devices are
    // generally iPhone XR or newer (3GB+ RAM). Anything older we treat
    // as "low" to be safe.
    const osVersion = (Platform.Version as unknown as string) ?? '';
    const major = parseInt(String(osVersion).split('.')[0] ?? '', 10);
    if (Number.isFinite(major)) {
      if (major >= 18) return 'high';
      if (major >= 16) return 'medium';
      return 'low';
    }
    return 'medium';
  }
  if (Platform.OS === 'android') {
    // API level proxy. Android 13+ (API 33) usually means a phone made
    // 2022 or later — most of those run mid-range CPUs comfortably.
    const apiLevel = Number(Platform.Version);
    if (Number.isFinite(apiLevel)) {
      if (apiLevel >= 34) return 'medium';
      if (apiLevel >= 31) return 'medium';
      return 'low';
    }
    return 'medium';
  }
  return 'medium';
}

/**
 * Resolve + cache the active tier. Always returns a tier; the synchronous
 * `getPerfTier()` reads the cached value, so call this once at app boot.
 */
export async function ensurePerfTierLoaded(): Promise<PerfTier> {
  if (detected) return detected;
  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached === 'low' || cached === 'medium' || cached === 'high') {
      detected = cached;
      return detected;
    }
  } catch {
    // ignore
  }
  detected = detectHeuristic();
  AsyncStorage.setItem(CACHE_KEY, detected).catch(() => {});
  return detected;
}

/**
 * Synchronous tier lookup. The race engine + track generator call this
 * every frame, so it MUST be cheap.
 *
 * Order of precedence:
 *   1. Remote-config override
 *   2. Locally cached + detected tier
 *   3. Hard fallback `medium`
 */
export function getPerfTier(): PerfTier {
  try {
    const cfg = getConfig();
    if (cfg.perfTier === 'low' || cfg.perfTier === 'medium' || cfg.perfTier === 'high') {
      return cfg.perfTier;
    }
  } catch {
    // remote config not yet loaded — fall through
  }
  return detected ?? 'medium';
}

/** Tier-keyed budget knobs. Inlined for callers that want them at once. */
export function getPerfBudget(tier: PerfTier = getPerfTier()): PerfBudget {
  return BUDGETS[tier];
}

/** Test-only: clear the cached tier so the next call re-detects. */
export function _resetPerfTierForTests(): void {
  detected = null;
}
