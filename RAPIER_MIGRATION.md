# Rapier.js Physics Engine Migration

Tracking the swap from Matter.js → Rapier.js (via @dimforge/rapier2d-compat).
This file exists as a safety net so the Matter.js baseline can always be
restored if Rapier doesn't work out.

## Rollback point

**Last green Matter.js commit before Rapier work began:**

| Field | Value |
|---|---|
| **SHA** | `bd02759d41c1aae178dc32fd41f273095215fa83` |
| **Short SHA** | `bd02759` |
| **Branch** | `master` |
| **Date** | 2026-05-23 |
| **Title** | Offline play: fix subway bug + NetInfo banner + silent reconciliation (build 94 / versionCode 60) |
| **Repo** | https://github.com/donkeyideas/Donkey.Marble.Racing.Game |

This commit includes:
- Working Matter.js physics across all 93 tracks
- All offline-play fixes (subway bug, NetInfo banner, silent reconciliation)
- AdMob rewarded ads
- iOS build 94 / Android versionCode 60

## How to revert (full nuclear reset)

If Rapier turns out to be a mistake, run these commands from
`e:\Donkey.Marble.Racing\`:

```bash
# Throw away every Rapier-related change, return to the green Matter.js commit
git reset --hard bd02759d41c1aae178dc32fd41f273095215fa83

# If you've already pushed Rapier commits and want to wipe them from GitHub too
# (DESTRUCTIVE — only do this if you're sure no one else has pulled the branch)
git push --force-with-lease origin master
```

## How to revert (preserve Rapier work in a branch for later)

Safer option — keep Rapier code on a side branch instead of deleting it:

```bash
# Save current state as a branch you can come back to
git branch rapier-experiment

# Reset master back to the green commit
git reset --hard bd02759d41c1aae178dc32fd41f273095215fa83

# Force-push if needed
git push --force-with-lease origin master
```

Later you can `git checkout rapier-experiment` to resume the migration.

## How to partially revert (just disable Rapier, keep the code)

If the migration is in progress and Rapier is broken on device but you want to
keep the code, flip the feature flag and rebuild:

```ts
// In engine/engineConfig.ts (or wherever USE_RAPIER lives)
export const USE_RAPIER = false;  // ← flip back to Matter.js
```

This keeps the abstraction layer + Rapier code intact for later debugging
while shipping the proven Matter.js path.

## Migration status

- [x] Stage 1: Rapier installed (`@dimforge/rapier2d-compat@0.19.3`) + dispatcher built (`engine/createEngine.ts`) + `USE_RAPIER` flag (`engine/engineConfig.ts`)
- [x] Stage 2: All static-geometry ported — walls, ramps, bumpers + pegs with full pinch-repair, funnels, finish funnel, mini-funnel, channel walls + floor
- [x] Stage 3: Sensors + active kinematic — springs (sensor + impulse), trampolines (solid + max-bounce cap → sensor conversion), speed bursts (sensor + randomized directional impulse), doomsday bar (kinematic + upward-escape snap-back), windmills (kinematic rotation), swinging doors (kinematic sin-wave around hinge)
- [x] Stage 4: Joint elements — pendulums (revolute joints), Newton's cradles (revolute joints + lockRotations to prevent spin, first ball pull-back), ball pits (dynamic ball grids)
- [x] Stage 5: Full telemetry — per-frame ranking, lead-frame accounting, overtakes/timesPassed, quartile checkpoints (posAt25/50/75), wire-to-wire detection; `canSleep=false` on all marbles as stuck safeguard
- [x] Stage 6: All 164 courses validated via `scripts/test-all-tracks-rapier.ts` — **161 pass (98.2%)**, 3 fail (specific procedural seeds with stuck geometry — `gen-1620`, `gen-2101`, `gen-2182`)
- [x] Stage 7: TestFlight build with `USE_RAPIER = true` (iOS 1.0.7 build 95) — beta soak only, Android build 60 stays on Matter.js
- [ ] Stage 8: On-device performance measurement (iPhone 12, Pixel 6a) — pending physical device runs
- [ ] Stage 9: Per-track fix-or-remove decisions for the 3 failing procedural seeds
- [ ] Stage 10: Render-state integration verification (Reanimated shared values should keep working since the engine returns the same RaceState shape, but worth confirming on device)
- [ ] Stage 11: Production rollout decision — if TestFlight beta is positive, promote to remote-config flag `feature_rapier_engine` and A/B 10% → 50% → 100% on iOS first, then enable Android

## Stage 6 results (full validator output)

```
Total tracks tested: 164
PASS: 161  |  FAIL: 3
Pass rate: 98.2%
Avg time (passing tracks): 14.9s
Fastest: gen-2156 (9.2s)
Slowest: gen-2148 (30.5s)

FAILING TRACKS:
  gen-1620   avg=44.4s  fin=0/8  stuck=11  Only 0/8 finished naturally; doomsday triggered
  gen-2101   avg=45.3s  fin=0/8  stuck=9   Only 0/8 finished naturally; doomsday triggered
  gen-2182   avg=44.4s  fin=0/8  stuck=10  Only 0/8 finished naturally; doomsday triggered
```

All three failing tracks are procedural seeds where the generated layout traps marbles in a stable V-pocket the Rapier pinch-repair doesn't fully resolve. They run fine on Matter so the bug is in how Rapier's contact solver handles a specific edge case in those geometries. Options for resolution: (a) remove these seeds from the procedural pool, (b) regenerate with adjusted parameters, (c) add a Rapier-specific stuck-kick safety net.

## Key tuning constants applied during Stage 6

- `GRAVITY_BASE` = 1200 (was 600). Rapier's gravity at 600 gave ~58s races that timed out at the 55s doomsday trigger. 1200 matches Matter's effective acceleration after Verlet integration.
- `MAX_SPEED` = 1800 px/s (was 15). Matter's `MAX_SPEED = 15` is measured in px/substep (Verlet) — at SUBSTEPS=2 × 60Hz = 120 substeps/sec the equivalent in px/s is 15 × 120 = 1800.
- `FINISH_CAP_VY` = 1200 px/s (same conversion from Matter's `10` px/substep).
