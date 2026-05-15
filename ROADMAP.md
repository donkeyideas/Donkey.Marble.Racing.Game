# Donkey Marble Racing — Roadmap & Pickup Guide

**Last updated:** 2026-05-13
**Project location:** `E:\Donkey.Marble.Racing`
**Mock file:** `donkey-marble-racing-2d-v2.html` (the approved UI reference)

---

## Current State (What's Working)

### Core Racing Engine
- Matter.js 2D physics engine with fixed-timestep substeps (3 per frame)
- 8 marbles with unique stats (Dash, Spike, Rocky, Lucky, Frosty, Nova, Shadow, Aqua)
- Collision categories: walls, marbles, obstacles
- Race renderer with camera follow, position tracking, finish detection

### Tracks
- **9 hand-built tracks** — all pass 7+/8 marbles finishing:
  - Classic Zigzag, Bumper Blitz, Pendulum Alley, Ball Pit Run, Peg Storm, Cradle Drop, Trampoline Park, Terrain Valley, The Gauntlet
- **3 variant tracks** — Frozen Pendulums, Garden Ball Pit, Cyber Gauntlet
- **10 generated tracks** — procedurally generated, all validated (~60s avg)
- **Track obstacles:** ramps, pegs, bumpers, windmills, pendulums, trampolines, cradles, ball pits, funnels, springs

### Procedural Track Generator
- `engine/trackGenerator.ts` — deterministic from seed (mulberry32 PRNG)
- `scripts/generate-tracks.js` — headless physics validator
- 100 validated seeds stored in `validated-seeds.json`
- 55% acceptance rate, 49 unique fingerprints, 64.5s avg race time
- `buildTrack('gen-SEED')` routing in tracks.ts

### App Screens (Built)
- Splash / Welcome
- Season Hub (week progress, standings, daily schedule)
- Course Selection (filter by theme, play button)
- Race View (physics simulation, camera, HUD)
- Betting Screen (marble pick, bet amounts)

### Not Yet Built
- Everything below in the roadmap

---

## Roadmap — Features to Build

All new features must be mocked in `donkey-marble-racing-2d-v2.html` first and approved before code implementation.

---

### 1. Marble Analytics & Trading Card Stats

**Priority:** HIGH
**Status:** NOT STARTED

When a user starts a season, every race collects data on each marble. The user can tap any marble to see a baseball-trading-card-style stat card.

**Stats to track per marble per season:**
- Races entered / Races finished
- Wins (1st place) / Podiums (top 3)
- Average finish position
- Average race time
- Best race time / Worst race time
- Win rate (%) / Podium rate (%)
- Streak (current win streak / best win streak)
- Course performance breakdown (win rate per course/theme)
- Head-to-head record vs each other marble
- "Hot" / "Cold" indicator (trending up or down over last 5 races)
- Earnings generated for users who bet on this marble

**Trading Card UI:**
- Front: Marble visual, name, season record (W-L), overall rating
- Back: Full stat breakdown, sparkline charts, course heatmap
- Tap to flip between front and back
- Compare mode: hold two cards side by side

**Data storage:**
- `state/marbleStats.ts` — Zustand store tracking per-marble stats
- Stats persist across the season, reset at new season start
- Historical stats saved for past seasons

**Files to create/modify:**
- `state/marbleStats.ts` — new store
- `components/MarbleCard.tsx` — trading card component
- `app/marble-detail.tsx` — full stat screen
- `engine/race.ts` — emit stat events during race

---

### 2. Game Modes Breakdown

**Priority:** HIGH
**Status:** NOT STARTED — needs mock approval

#### Mode 1: Season Mode (Core Loop)
- 12-week seasons, 6 races per day at scheduled times
- Marble standings track W-L across the season
- Top 4 make playoffs, 5-6 are "bubble"
- User bets on races using virtual coins
- Daily login bonus with streak multiplier
- Season Pass rewards (Free / Premium / Plus tiers)

#### Mode 2: Quick Race
- Pick any unlocked course, race anytime
- Lower stakes, good for practice
- No impact on season standings
- Earns reduced XP toward Season Pass

#### Mode 3: Daily Derby
- One special race per day, 3x payout multiplier
- Unique course rotation, resets at midnight
- Higher risk/reward

#### Mode 4: Playoffs (Weeks 11-12)
- Top 6 marbles qualify based on season standings
- Wildcard Round: #3 vs #6, #4 vs #5 (best of 3)
- Semifinals: #1 vs lowest remaining, #2 vs other (best of 3)
- Championship: Finals (best of 5)
- Special playoff betting with enhanced odds
- Users bet on individual games AND series outcomes

#### Mode 5: National Games (Scheduled Events)
- Fixed daily schedule with themed races:
  ```
  8:00 AM   Morning Brew Race       (low stakes, casual, 1x payout)
  12:00 PM  Lunch Sprint            (quick race, 1.5x payout)
  3:00 PM   Afternoon Match         (standard, 2x payout)
  6:00 PM   Happy Hour              (bigger payout, 2.5x multiplier)
  8:00 PM   PRIME TIME              (main event, 3x multiplier, biggest crowd)
  10:00 PM  Night Cap               (last chance, 4x multiplier)
  ```
- Winnings multiplied by time slot multiplier
- Prime Time is the flagship — biggest payouts, most viewers
- Night Cap is the "high roller" slot with highest multiplier

#### Mode 6: Tournaments
- Weekly or bi-weekly special events
- Entry fee (coins) with prize pool
- Bracket-style elimination
- Special tournament-only courses
- Leaderboard for tournament wins

---

### 3. Mock File Updates Required

**Priority:** BLOCKING — must be approved before building

All new features must be added to `donkey-marble-racing-2d-v2.html` as new screens:

**New screens to mock:**
1. **Marble Trading Card** — front and back views, stat bars, sparklines
2. **Marble Compare** — two cards side by side
3. **Quick Race Lobby** — course picker with race-now button
4. **Tournament Bracket** — entry, bracket view, results
5. **National Games Schedule** — daily schedule with multipliers
6. **Invite Friends** — referral screen with reward display
7. **Economy Dashboard** — coin balance breakdown, daily limits, spending history
8. **Store / Coin Purchase** — purchase tiers with daily limits
9. **Settings** — notification times, responsible gaming controls

---

### 4. Invite a Friend System

**Priority:** MEDIUM
**Status:** NOT STARTED

**Rules to prevent spam:**
- Each user gets a unique referral code/link
- Reward: 500 coins for inviter when friend completes 3 races (not on install)
- Maximum 10 referral rewards per user (lifetime cap = 5,000 bonus coins)
- Cooldown: max 3 invites per day can be sent
- Friend must be a new user (no re-referrals)
- No push notification spam — invite is via share sheet only (SMS, WhatsApp, etc.)
- Referral link expires after 7 days

**Anti-abuse:**
- Device fingerprint check (no self-referrals)
- IP-based duplicate detection
- Delayed reward (friend must play 3 races, not just install)

**UI Flow:**
1. Profile → "Invite Friends" button
2. Shows referral code + share button
3. Progress tracker: "3/10 friends invited" with reward status
4. Friend's perspective: opens app via link, sees "Invited by [name]" badge

**Files to create:**
- `app/invite.tsx` — invite screen
- `lib/referral.ts` — referral logic + validation
- Supabase table: `referrals` (inviter_id, invitee_id, status, created_at)

---

### 5. Economy Adjustments — Daily Coins & Spending Limits

**Priority:** HIGH
**Status:** NOT STARTED

**Core philosophy:** Be generous. The user should never feel forced to buy coins. Buying is for impatient players, not required players.

#### Daily Login Rewards (Streak-Based)
```
Day 1:    200 coins
Day 2:    250 coins
Day 3:    300 coins
Day 4:    350 coins
Day 5:    400 coins
Day 6:    500 coins
Day 7:    750 coins  (weekly bonus)
Day 8-13: repeat 200-500 pattern
Day 14:   1,000 coins (bi-weekly bonus)
Day 21:   1,500 coins
Day 28:   2,000 coins (monthly jackpot)
```
- Streak multiplier: after Day 7, all rewards get +10% per week of streak
- Missing a day resets to Day 1 (but show a "welcome back" bonus of 150 coins)
- Weekly total (Days 1-7): **2,750 coins minimum**

#### Race Rewards (Win or Lose)
- Watching a race (no bet): +50 coins
- Betting and losing: +25 coins consolation
- Betting and winning: bet × odds (already implemented)
- Finishing in the top 3 prediction: +100 bonus coins
- Perfect prediction (exact order): +500 bonus coins

#### Coin Purchase Tiers (IAP)
```
Starter Pack:     $0.99  →  1,000 coins
Popular Pack:     $4.99  →  6,000 coins   (20% bonus)
Big Spender:      $9.99  →  15,000 coins  (50% bonus)
Whale Pack:       $24.99 →  40,000 coins  (60% bonus)
```

#### Daily Purchase Cap
- **Maximum coin purchases per day: 3 transactions**
- **Maximum coins purchasable per day: 25,000 coins**
- After hitting the cap: "You've reached today's limit. Come back tomorrow!"
- This prevents compulsive spending and protects users
- Reset at midnight local time

#### Bet Limits
- **10 bets per day** (already in mock)
- Minimum bet: 25 coins
- Maximum bet: 500 coins (prevents going broke in one bet)
- Cannot bet more than 50% of current balance in a single bet

---

### 6. Financial Breakdown & Economy Model

**Priority:** HIGH
**Status:** NOT STARTED — document only, no code

#### Revenue Streams
```
1. Season Pass Premium:  $9.99/season  (one-time, not subscription)
2. Season Pass Plus:     $24.99/season (one-time, not subscription)
3. Coin Purchases:       $0.99 - $24.99 (consumable IAP)
4. Future: Cosmetic shop  (marble skins, trail effects — post-launch)
```

#### Economy Flow (Per Active User Per Week)
```
COINS IN (free):
  Daily login (7 days):           ~2,750 coins
  Race watching (6/day × 7):      ~2,100 coins (50 × 42)
  Consolation (losing bets):      ~350 coins (25 × 14 losses)
  Win payouts (average):          ~3,000 coins
  ─────────────────────────────────────────────
  Weekly free income:             ~8,200 coins

COINS OUT:
  Betting (10/day × 100avg × 7):  ~7,000 coins wagered
  Expected return (50% win rate): ~5,250 coins back
  ─────────────────────────────────────────────
  Net weekly loss from betting:   ~1,750 coins
  Net weekly balance:             +6,450 coins (user grows)
```

**Key insight:** Users should naturally accumulate coins through free play. Coin purchases are for impatient users who want to bet bigger or recover from a losing streak faster, NOT because they ran out.

#### Break-Even Analysis
- A free player betting 100 coins/race at 50% win rate **never runs out of coins**
- A free player betting max (500/race) at 50% win rate slowly depletes — this encourages smaller, smarter bets
- The daily login streak is the safety net — even a losing streak player gets 400+ coins/day free

#### Apple/Google Take
- 30% cut on all IAP (15% if under $1M/year via Small Business Program)
- Net revenue per $9.99 Season Pass: ~$7.00
- Net revenue per $4.99 coin pack: ~$3.50

#### Projected Revenue (Per 1,000 DAU)
```
Assuming:
  5% buy Season Pass Premium:    50 × $7.00  = $350/season
  2% buy Season Pass Plus:       20 × $17.50 = $350/season
  3% buy coins (avg $5/month):   30 × $3.50  = $105/month
  ──────────────────────────────────────────────────────────
  Revenue per season (3 months):  ~$1,015
  Monthly ARPDAU:                 ~$0.01
  Annual (4 seasons):             ~$4,060 per 1,000 DAU
```

---

### 7. App Flow & Organization Audit

**Priority:** HIGH
**Status:** NOT STARTED

Verify the complete user flow works end-to-end:

```
FIRST LAUNCH:
  Splash → Welcome → Tutorial Race (1 free race) → Season Hub

DAILY FLOW:
  Open App → Season Hub → See today's schedule → Collect daily bonus
    → Tap race → Betting screen → Pick marble → Lock bet
    → Watch race → Win/Loss result → Back to Season Hub
    → Repeat for next race

BROWSING:
  Season Hub → Courses (browse/filter tracks)
  Season Hub → Marbles (roster, tap for trading card stats)
  Season Hub → Profile (stats, store, settings)
  Season Hub → Season Pass (rewards track)
  Season Hub → Standings (full season table)
  Season Hub → Playoffs (when Week 11-12)

SOCIAL:
  Profile → Invite Friends
  Win Screen → Share Result
```

**Checklist:**
- [ ] Every screen has a back button that works
- [ ] Coin balance shows on every screen with betting
- [ ] Navigation between all screens is smooth
- [ ] No dead-end screens
- [ ] Loading states for race initialization
- [ ] Error states for network failures
- [ ] Empty states for first-time screens

---

### 8. Generate & Test 100 Races Under 60 Seconds

**Priority:** HIGH
**Status:** PARTIALLY DONE

**What's done:**
- Track generator built (`engine/trackGenerator.ts`)
- Validation script built (`scripts/generate-tracks.js`)
- 100 seeds validated and stored in `validated-seeds.json`
- 10 tracks added to app for testing

**What's remaining:**
- Tighten acceptance criteria to 50-70s average (currently 30-90s allowed)
- Regenerate 100 seeds with stricter time window
- Add all 100 to `data/courses.ts` via `getGeneratedCourses()`
- Wire `getGeneratedCourses()` into the course selection screen
- Visual spot-check 10+ generated tracks in the app
- Verify no track has marbles getting permanently stuck

**Command to regenerate:**
```bash
node scripts/generate-tracks.js --count 100 --output validated-seeds.json
```

---

### 9. Season Structure — Playoffs, Championship, Tournaments, National Games

**Priority:** HIGH
**Status:** NOT STARTED

#### Season Calendar (12 Weeks)
```
Weeks 1-10:   Regular Season (6 races/day, standings accumulate)
Week 11:      Playoffs (Wildcard + Semifinals)
Week 12:      Championship (Best of 5 Finals)
Off-season:   1 week break, then new season
```

#### Playoffs Structure
```
WILDCARD ROUND (Mon-Wed of Week 11):
  Game 1: #3 seed vs #6 seed (best of 3)
  Game 2: #4 seed vs #5 seed (best of 3)

SEMIFINALS (Thu-Sat of Week 11):
  Semi 1: #1 seed vs lowest remaining winner (best of 3)
  Semi 2: #2 seed vs other winner (best of 3)

CHAMPIONSHIP (Week 12, Sunday):
  Finals: Semi winners face off (best of 5)
```

#### National Games (Daily Schedule)
```
TIME        NAME              STAKES    MULTIPLIER   DESCRIPTION
8:00 AM     Morning Brew      Low       1.0x         Casual start, small bets
12:00 PM    Lunch Sprint      Medium    1.5x         Quick race for lunch break
3:00 PM     Afternoon Match   Standard  2.0x         Regular stakes
6:00 PM     Happy Hour        Higher    2.5x         After-work crowd
8:00 PM     PRIME TIME        Peak      3.0x         Main event of the day
10:00 PM    Night Cap         High      4.0x         Last chance, biggest multiplier
```

- Each time slot uses a different course (rotated from the course library)
- PRIME TIME is always the best/most exciting course
- Night Cap has the highest multiplier but smallest window (30 min)
- Users get push notification opt-in for their favorite time slots

#### Tournaments (Future)
- Weekly tournaments with coin entry fee (500-2,000 coins)
- 16 or 32 player brackets
- Prize pool = total entry fees × 0.9 (10% house take)
- Winner takes 50%, runner-up 30%, semifinalists 10% each
- Special tournament-exclusive courses

#### Hall of Fame
- Season champions recorded permanently
- Championship marble gets a special badge for the next season
- Users who bet on the champion in the finals get a "Champion's Pick" badge

---

### 10. Advanced Features & Ideas

**Priority:** LOW — future consideration

1. **Marble Drafting** — At season start, user picks 3 "favorite" marbles for bonus XP when they win
2. **Custom Marble Names** — Premium users can nickname their favorite marble
3. **Race Replay** — Rewatch any race from the current season
4. **Spectator Chat** — Live emoji reactions during Prime Time races
5. **Daily Challenges** — "Bet on an underdog and win" for bonus coins
6. **Marble Rivalries** — Track head-to-head records, highlight rivalry races
7. **Weather Effects** — Random weather on courses (rain = slippery, wind = drift)
8. **Course Creator Lite** — Let users arrange obstacles on a template (UGC, post-launch)
9. **Seasonal Themes** — Summer Season, Winter Season with themed courses and cosmetics
10. **Achievement System** — "Won 10 bets in a row", "Bet on every marble", etc.

---

## Implementation Order

Build in this sequence. Each phase must be mocked → approved → built → tested.

```
PHASE A — Mock Updates (do first, no code)
  → Add all new screens to donkey-marble-racing-2d-v2.html
  → Get approval before any code

PHASE B — Economy & Stats Foundation
  1. Marble stats tracking (per-race data collection)
  2. Economy system (daily login rewards, bet limits, coin balance)
  3. Purchase system with daily caps

PHASE C — Trading Card & UI
  4. Marble trading card component
  5. Marble detail screen with full stats
  6. Compare mode

PHASE D — Season Structure
  7. National Games schedule (6 daily time slots with multipliers)
  8. Playoff bracket system
  9. Championship flow
  10. Hall of Fame

PHASE E — Social & Growth
  11. Invite friend system with referral tracking
  12. Share improvements
  13. Push notification opt-in for race times

PHASE F — Content & Polish
  14. Generate + validate 100 tracks (tighter time window)
  15. Wire all tracks into course rotation
  16. Full app flow audit
  17. Responsible gaming features
```

---

## Key Files Reference

```
E:\Donkey.Marble.Racing\
├── app/                    # Expo Router screens
│   ├── race.tsx            # Race view + physics
│   ├── betting.tsx         # Bet placement
│   ├── courses.tsx         # Course selection
│   ├── season.tsx          # Season hub
│   └── ...
├── components/             # Reusable UI
├── data/
│   └── courses.ts          # Course definitions + generated courses
├── engine/
│   ├── race.ts             # Physics engine (Matter.js)
│   ├── tracks.ts           # Track layouts + buildTrack()
│   └── trackGenerator.ts   # Procedural generator
├── scripts/
│   └── generate-tracks.js  # Headless track validator
├── state/
│   └── gameStore.ts        # Zustand store
├── theme/                  # Colors, fonts, marble data
├── donkey-marble-racing-2d-v2.html  # UI mock (source of truth)
├── validated-seeds.json    # 100 validated track seeds
└── ROADMAP.md              # THIS FILE
```

---

## Notes

- The mock file (`donkey-marble-racing-2d-v2.html`) is the **source of truth** for UI design
- No feature gets coded until it's mocked and approved
- Economy numbers are estimates — tune after real user testing
- "Virtual coins only — No real money gambling" — this must be on every screen with betting
- Age gate: 17+ (required by App Store for simulated gambling)
