# 2D Marble Track Design Specification

This document is the source of truth for how courses must be built in Donkey Marble Racing.
Any track that violates these rules will not work as a physics simulation.

---

## CORE PHYSICS CONSTRAINTS

These come from Matter.js (or any 2D rigid body physics engine):

- **Gravity:** 1.0 in the +Y direction (downward, standard)
- **Marble radius:** 12 pixels
- **Marble friction:** 0.05 (low — they roll easily)
- **Marble restitution (bounce):** 0.4 (bouncy but not floaty)
- **Marble density:** 0.002 (light, responsive)
- **Platform friction:** 0.05 (matches marbles)
- **Platform restitution:** 0.3

These values are tuned. Do not change them per course.

---

## THE SEVEN RULES OF A WORKING TRACK

### Rule 1: Slope Angle
Every platform must have a slope between **25° and 60°** from horizontal.
- Recommended range: **30°–45°**
- Below 20°: marbles stop rolling (rolling friction > gravity component)
- Above 65°: marbles freefall, camera can't follow

### Rule 2: Platform Overlap
The end X-coordinate of platform N must be within the X-range of platform N+1.
Minimum horizontal overlap: **20% of screen width** (about 80px on a 400px-wide playfield).
A marble that reaches the edge of platform N must land on platform N+1, not in empty space.

### Rule 3: Alternating Direction (Zigzag Pattern)
Platforms alternate left-leaning and right-leaning to create a zigzag descent.
- Platform 1: slopes down to the right (left side high, right side low)
- Platform 2: slopes down to the left (right side high, left side low)
- Platform 3: slopes down to the right
- And so on.

### Rule 4: Obstacles Per Segment
Every platform that is longer than 30% of screen width must contain at least one obstacle.
Approved obstacles:
- **Spinner** (rotating bar that knocks marbles sideways)
- **Bumper** (round elastic peg that bounces marbles)
- **Speed pad** (applies +force in direction of travel)
- **Jump ramp** (45–60° kicker that launches marbles)
- **Splitter** (vertical wedge that splits marbles left/right)
- **Narrow gate** (forces 2–3 marble width passage)
- **Moving block** (oscillates horizontally, blocks part of platform)

### Rule 5: Start and Finish Zones
- **Start zone:** A funnel chute at the top that releases marbles in single file.
  The chute must be narrow enough (1.5x marble diameter = 36px) to prevent stacking.
  Marbles drop from this chute onto the first platform.
- **Finish zone:** A goal line at the bottom with collision detection.
  The first marble to cross wins. Detection must be a single line, not an area.

### Rule 6: Race Duration Target
Tune obstacle count and platform count so an average race lasts **45–60 seconds**.
- Too short: no drama, no position changes
- Too long: viewers lose attention
- Solo dev playtest: time 10 simulated races, aim for 50s ± 10s average

### Rule 7: No Dead Zones
Every part of the playfield reachable by a marble must lead somewhere.
- No "trap" pockets where a marble can come to rest and get stuck
- No platforms with no exit
- If a marble can fall off-screen, add a kill-plane that respawns or eliminates it

---

## COURSE 1: PEBBLE HILL (BEGINNER)

**Theme:** Green meadow, gentle introduction course.
**Difficulty:** Bronze League.
**Target race time:** 45 seconds.
**Favored stat:** Heavy marbles (Rocky, Goldie).

### Playfield dimensions
- Width: 400 units
- Height: 1200 units (vertical scroll)
- Background: linear gradient #88c870 (top) to #5a9a4a (bottom)

### Layout

```
START ZONE (Y: 0 - 100)
  Funnel chute centered at X: 200
  Width 40, height 80
  Releases marbles one per 100ms

PLATFORM 1 (Y: 150 - 230)
  Start: (60, 150)
  End: (340, 230)
  Slope: 16° down-right
  Length: 290 units
  Obstacle: SPINNER at (220, 195) — rotating bar, 60 unit radius, 90°/sec

PLATFORM 2 (Y: 350 - 440)
  Start: (320, 350)
  End: (60, 440)
  Slope: 19° down-left
  Length: 275 units
  Overlap with platform 1: 60 units on right side
  Obstacle: BUMPER at (200, 395) — round peg, radius 14, restitution 0.9

PLATFORM 3 (Y: 560 - 650)
  Start: (40, 560)
  End: (340, 650)
  Slope: 16° down-right
  Length: 305 units
  Overlap with platform 2: 80 units on left side
  Obstacle: SPEED PAD at (180, 600) — width 60, applies +0.005 X-force

PLATFORM 4 (Y: 770 - 860)
  Start: (340, 770)
  End: (60, 860)
  Slope: 19° down-left
  Length: 290 units
  Overlap with platform 3: 60 units on right side
  Obstacle: JUMP RAMP at (160, 815) — 35° kicker, launches +0.01 Y-force

PLATFORM 5 (Y: 980 - 1070) — FINAL STRAIGHT
  Start: (60, 980)
  End: (340, 1070)
  Slope: 16° down-right
  Length: 290 units
  No obstacles (clean run to finish)

FINISH LINE (Y: 1120)
  Horizontal line spanning full width
  Marble collision triggers finish event
  First marble to cross wins
```

### Why this design works
- 5 platforms × ~9 seconds each = 45s race
- 4 obstacles create position changes
- Zigzag pattern keeps marbles moving consistently downward
- Each platform overlaps the next by 60–80 units (15–20% of width)
- Final straight gives a 1–2 second photo-finish window

---

## COURSE 2: LAVA DROP (INTERMEDIATE)

**Theme:** Volcano, red/orange palette.
**Difficulty:** Silver League.
**Target race time:** 55 seconds.
**Favored stat:** Speed (Blaze, Turbo).
**Style:** Vertical Plinko-inspired drop.

### Playfield dimensions
- Width: 400 units
- Height: 1400 units
- Background: gradient #c84020 (top) to #6a1a00 (bottom)

### Layout

```
START ZONE (Y: 0 - 80)
  Wide release: 8 chutes at X: 50, 95, 140, 185, 230, 275, 320, 365
  Each chute drops one marble simultaneously
  This creates an immediate fan-out (not single file)

PEG ROW 1 (Y: 150)
  5 bumpers at X: 80, 160, 200, 240, 320
  Radius 14, restitution 0.95
  Marbles ricochet off these into different lanes

WALL DEFLECTOR (Y: 250 - 320)
  Angled wall at 30°, X: 100 to 200
  Pushes marbles to the right side of the playfield

WALL DEFLECTOR (Y: 320 - 390)
  Angled wall at 30°, X: 200 to 300, mirrored
  Pushes marbles to the left side
  Together these create an S-curve

SPINNING HAMMER (Y: 480)
  Center: (200, 480)
  Arm length: 120 units (extends from X: 80 to X: 320)
  Rotation: 180°/sec
  Knocks marbles sideways with large force

PEG ROW 2 (Y: 600)
  7 bumpers at X: 50, 100, 150, 200, 250, 300, 350
  Tighter spacing for more chaos

SPEED PAD (Y: 720)
  Wide pad, X: 100 to 300, Y: 720 to 740
  Applies +0.008 Y-force (downward boost)
  Marbles accelerate dramatically

FUNNEL (Y: 850 - 1100)
  Left wall: 35° angle from (50, 850) to (180, 1100)
  Right wall: 35° angle from (350, 850) to (220, 1100)
  Funnels all marbles to center
  Marbles bunch up here — passing opportunities

FINAL DROP (Y: 1100 - 1350)
  Narrow channel, X: 180 to 220
  Marbles fall single-file
  Whoever exits the funnel first wins

FINISH LINE (Y: 1380)
```

### Why this design works
- 8 simultaneous starts = chaos and randomness from the first frame
- 2 peg rows create probability spread (Plinko effect)
- S-curve walls force lateral movement
- Spinning hammer is the big drama moment around the 25–30s mark
- Funnel at the end forces a single-file finish — guaranteed close races

---

## COURSE 3: WINDY GULCH (INTERMEDIATE)

**Theme:** Meadow with stronger obstacles, transitions to dusty canyon.
**Difficulty:** Silver League.
**Target race time:** 50 seconds.
**Favored stat:** Maneuverable (Frost, Phantom).

### Layout summary (full coordinates omitted, follows same pattern)

Six platforms in zigzag pattern, but with two spinners on consecutive platforms (instead of alternating with bumpers/pads). The two spinners are positioned so a marble that gets deflected left by spinner 1 immediately encounters spinner 2 — creating cascading position changes. The course rewards marbles that can stay centered (high maneuverability stat).

---

## CHECKLIST FOR CLAUDE CODE WHEN BUILDING A NEW COURSE

Before submitting a new course, verify:

- [ ] Every platform has a slope between 25° and 60°
- [ ] Every consecutive platform pair overlaps by at least 60 units (20% of width)
- [ ] Platforms alternate slope direction (zigzag, not all the same way)
- [ ] Every platform longer than 120 units has at least one obstacle
- [ ] Start zone uses a funnel chute or fan-out structure (not a flat drop)
- [ ] Finish line is a single horizontal line, not an area
- [ ] No marble can come to rest anywhere on the track (no flat spots, no traps)
- [ ] Simulated race time averages 45–60 seconds across 10 test runs
- [ ] Different marbles win different test runs (not 100% favorite victories)

If any of these fail, the course is broken. Do not ship.

---

## TESTING PROTOCOL

1. **Solo simulation:** Run a single marble down the empty track. Should complete in 30–45s without any human intervention. Should not get stuck.

2. **Full simulation:** Run 8 marbles with default stats. Should complete in 45–65s. Race should produce different winners on different runs (random seed variation).

3. **Stat sensitivity:** Run 8 marbles where one has max favored stat (e.g., max speed for Lava Drop). This marble should win 30–50% of the time, not 100% (otherwise course is too deterministic) and not 12.5% (otherwise stats don't matter).

4. **Visual test:** Watch a race. Are there at least 3 position changes during the race? If not, add more obstacles. Are marbles bunching up too long anywhere? If yes, the slope or obstacle is wrong.

If a course fails any of these tests, it is not ready.
