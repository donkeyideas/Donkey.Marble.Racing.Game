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

// Temporarily flipped TRUE for the TestFlight build (iOS 1.0.7 / build 95)
// so beta testers exercise the Rapier engine on real devices. Default
// remains false — Android build 60 still ships Matter.js. Flip back to
// false before any Play Store / App Store production release until the
// Rapier engine has soaked successfully on TestFlight.
export const USE_RAPIER = true;

/**
 * Whether Rapier's async init has completed. Set by initRapierEngine() in
 * engine/race-rapier.ts. The dispatcher checks this before routing to
 * Rapier; if init hasn't finished it falls back to Matter.js for safety
 * (better to silently use the proven engine than crash on a race start).
 */
export let RAPIER_READY = false;
export function setRapierReady(v: boolean): void { RAPIER_READY = v; }
