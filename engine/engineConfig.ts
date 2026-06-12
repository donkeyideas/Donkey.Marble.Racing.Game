/**
 * Physics engine dispatcher config.
 *
 * Rapier routing is now driven by remote config (`feature_rapier_engine`)
 * with the build-time `USE_RAPIER_FALLBACK` constant as the offline /
 * pre-fetch default. This means we can flip Rapier on for a cohort
 * without an app rebuild — useful once the native-module bridge ships
 * and we want to A/B against Matter.js on real devices.
 *
 * `useRapier()` is the runtime check the dispatcher should call.
 *
 * Rollback safety: if remote config is unreachable, the build-time
 * default keeps production on Matter.js. If Rapier init hasn't completed
 * yet (`RAPIER_READY === false`), the dispatcher falls back to Matter.js
 * for that race regardless of the flag.
 */

import { getConfig } from '../lib/remoteConfig';

/* Build-time default. Stays false in production so a fresh install
 * (no cached remote config) races on Matter.js until the first fetch
 * returns. Set to true ONLY for local dev when you want to test the
 * Rapier path before the admin server is reachable. */
const USE_RAPIER_FALLBACK = false;

/** Live engine flag — reads remote config every call so a server-side
 *  flip propagates on the NEXT race (without an app rebuild). The
 *  dispatcher in createEngine.ts and any boot-time init code should
 *  call this function instead of reading a build-time constant. */
export function useRapier(): boolean {
  try {
    const cfg = getConfig();
    if (typeof cfg.feature_rapier_engine === 'boolean') return cfg.feature_rapier_engine;
  } catch {
    // getConfig() can throw if remote config hasn't initialized yet.
    // Fall through to the build-time default.
  }
  return USE_RAPIER_FALLBACK;
}

/**
 * Whether Rapier's async init has completed. Set by initRapierEngine() in
 * engine/race-rapier.ts. The dispatcher checks this before routing to
 * Rapier; if init hasn't finished it falls back to Matter.js for safety
 * (better to silently use the proven engine than crash on a race start).
 */
export let RAPIER_READY = false;
export function setRapierReady(v: boolean): void { RAPIER_READY = v; }
