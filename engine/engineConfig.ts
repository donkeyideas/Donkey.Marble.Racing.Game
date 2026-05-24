/**
 * Physics engine dispatcher config.
 *
 * Flip USE_RAPIER to true to route createRaceEngine() to the Rapier-based
 * implementation. Default false = Matter.js (proven, all 93 tracks work).
 *
 * Rollback safety: see RAPIER_MIGRATION.md at the repo root for the
 * green-Matter.js commit SHA and revert instructions.
 *
 * Once Rapier ships in production this flag will move to remoteConfig
 * (feature_rapier_engine) so we can A/B without a rebuild. For now it's
 * a build-time constant because the migration is mid-flight and we don't
 * want any chance of accidentally serving Rapier to real users.
 */

// Reverted to false after TestFlight beta on iOS 1.0.7 build 98 showed
// poor performance on older devices. Root cause: the asm.js compat build
// of Rapier we ship (because Hermes WASM is fragile in React Native) is
// ~30-50% slower than true WASM Rapier, which puts it BELOW Matter.js's
// raw JS speed on older CPUs. The track extensions and tuning work
// stay in — they're engine-agnostic — but every race now runs on
// Matter.js for the production path. The Rapier engine implementation
// is kept in engine/race-rapier.ts behind this flag so we can revisit
// once Hermes WASM matures or a native-module Rapier bridge ships.
export const USE_RAPIER = false;

/**
 * Whether Rapier's async init has completed. Set by initRapierEngine() in
 * engine/race-rapier.ts. The dispatcher checks this before routing to
 * Rapier; if init hasn't finished it falls back to Matter.js for safety
 * (better to silently use the proven engine than crash on a race start).
 */
export let RAPIER_READY = false;
export function setRapierReady(v: boolean): void { RAPIER_READY = v; }
