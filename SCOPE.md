# Donkey Marble Racing — Project Scope

---

## Vision

A casual mobile marble racing game where players bet virtual coins on marbles rolling down obstacle-filled courses. Think "marble run toy" meets "horse racing betting" — pick your marble, place your bet, watch the chaos unfold.

**Platforms:** iOS + Android (single codebase via Expo)
**Monetization:** TBD (ads, IAP for coins, or premium features)
**Target audience:** Casual mobile gamers who enjoy watching physics-based races

---

## Phase 1: Core Game Loop (CURRENT)

**Goal:** A fun, working race you can bet on and watch.

### Done
- [x] 8 screens: splash, lobby, betting, race, results, roster, profile
- [x] 8 unique marbles with stats (speed, power, bounce, luck)
- [x] Virtual coin economy (start 1250, bet 25/100/250/500)
- [x] Stats-based odds calculation
- [x] Matter.js physics engine with vertical scrolling course
- [x] Curved ramps (quadratic bezier), windmills, bumpers, pegs
- [x] Scrolling camera following race leaders
- [x] Race results with payout calculation
- [x] Component library (MarbleCard, MarbleDot, CoinPill, StatBar, etc.)

### Remaining
- [ ] Tune race duration to 30-60 seconds
- [ ] Test on physical device for performance and feel
- [ ] Ensure no marbles get permanently stuck
- [ ] Ensure good spread between marbles (not all clumped)
- [ ] Add race countdown / starting gate animation

---

## Phase 2: Polish & Feel

**Goal:** Make it feel like a real game, not a prototype.

- [ ] Sound effects (marble rolling, bumper hits, windmill, finish cheer)
- [ ] Race start countdown (3-2-1-GO)
- [ ] Confetti / celebration on win
- [ ] Screen shake on big bumper hits
- [ ] Marble trail effects while rolling
- [ ] Better marble visuals (maybe emoji faces or patterns)
- [ ] Haptic feedback on key moments
- [ ] Loading transitions between screens
- [ ] Empty/broke state when coins run out (free coins or watch ad)

---

## Phase 3: Persistence & Progression

**Goal:** Players come back because their progress matters.

- [ ] AsyncStorage for local persistence (coins, stats, history)
- [ ] Race history log (last 20 races with results)
- [ ] Per-marble win/loss tracking
- [ ] Player level / XP system
- [ ] Daily free coins bonus
- [ ] Achievement system (first win, 10 wins, lucky streak, etc.)
- [ ] Unlock new marbles through progression

---

## Phase 4: Course Variety

**Goal:** Every race feels different.

- [ ] Multiple course layouts (not just zigzag)
  - Funnel course (wide to narrow)
  - Spiral course
  - Split-path course (marbles choose left or right)
  - Obstacle gauntlet (heavy obstacles, short course)
- [ ] Random course selection per race
- [ ] Course-specific obstacles (pendulums, seesaws, trampolines)
- [ ] Visual themes per course (desert, ice, lava, space)
- [ ] Course preview before betting

---

## Phase 5: Social & Multiplayer

**Goal:** Play with friends.

- [ ] Backend (Supabase or Firebase)
- [ ] User accounts
- [ ] Friends list
- [ ] Shared betting rooms (bet on same race with friends)
- [ ] Leaderboard (most coins, best win streak)
- [ ] Share race replay as short video/GIF
- [ ] Push notifications for friend challenges

---

## Phase 6: Monetization

**Goal:** Make money without ruining the game.

- [ ] Rewarded ads (watch ad for free coins)
- [ ] IAP coin packs
- [ ] Premium pass (remove ads, bonus daily coins, exclusive marbles)
- [ ] Cosmetic marble skins (purchasable)
- [ ] VIP courses (premium only)

---

## Out of Scope (Not Building)

- Real-money gambling (this is virtual coins only)
- 3D rendering (staying 2D with Matter.js)
- User-generated courses (too complex for v1)
- Cross-platform web version (mobile only)
- Tournaments/esports features
- Chat system

---

## Tech Decisions (Locked)

| Choice | Reasoning |
|--------|-----------|
| React Native + Expo | Single codebase, fast iteration, Expo Go for testing |
| Matter.js | Lightweight 2D physics, runs in JS thread |
| Zustand | Simple state management, no boilerplate |
| expo-router | File-based routing, standard for Expo apps |
| TypeScript | Type safety, better DX |

---

## Key Metrics to Track (Future)

- Average race duration (target: 30-60 sec)
- Session length
- Races per session
- Retention (D1, D7, D30)
- Coin economy balance (are players going broke? hoarding?)
- Most/least bet on marbles
- Ad revenue per user (if ads added)
