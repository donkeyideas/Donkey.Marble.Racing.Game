# Donkey Marble Racing — Feature Roadmap

**Last updated:** 2026-05-15
**Version:** 1.0.3 (build 8)

---

## Already Complete

- [x] **Core Racing Engine** — Matter.js with 3 substeps/frame, 8 marbles, collision categories
- [x] **96 Tracks** — 12 hand-crafted + 10 featured + 74 generated, 100% pass rate
- [x] **Speed Bursts** — gold activation zones with directional impulse
- [x] **Kenney Sprites** — themed backgrounds and obstacle sprites per track theme
- [x] **Haptic Feedback** — every marble collision triggers Heavy impact (50ms throttle)
- [x] **Season Mode** — 10-week schedule, points standings, franchise/bettor dual modes
- [x] **Playoffs & Championship** — 6-seed bracket, wildcard→semis→finals, Hall of Fame
- [x] **National Races** — 4 timed events (Grand Prix, Marble Mile, Speed Demon, Chaos Cup)
- [x] **Tournaments** — 3 tiers (Daily Blitz, Weekly Cup, Champion Invitational), bracket format
- [x] **Quick Race** — pick any course, no bet, 50% XP
- [x] **Custom Tracks** — seed input → generate → preview/race/save
- [x] **Achievements** — 20 achievements with pure check predicates
- [x] **Skins** — 10 unlockable marble color variants tied to achievements
- [x] **Daily/Weekly Challenges** — 3 daily + 2 weekly, deterministic from date seed
- [x] **Leaderboards** — 3 tabs (Marbles ranking, Records, Career stats)
- [x] **Daily Streak Coins** — 200-750 coins on app launch with animated toast
- [x] **Season Pass** — XP progression with tiered rewards
- [x] **Store/IAP** — in-app purchases with Play Billing
- [x] **Push Notifications** — daily event reminders 5 min before each national race
- [x] **Betting System** — odds engine, marble selection, bet amounts, payouts
- [x] **Economy System** — daily login, streak bonuses, coin history, bet limits

---

## Tier 1: High Impact

### Seasonal Visual Themes
- [ ] Background changes per season (spring flowers, summer sun, fall leaves, winter snow)
- [ ] Particle effects overlay during races (falling leaves, snowflakes, embers)
- [ ] Lobby gradient shifts per season
- [ ] Tie existing track themes (grass/lava/ice/cyber) to seasons or rotate weekly

### Race Camera & Finish Drama
- [ ] Slow-motion on final marble crossing finish line
- [ ] Camera shake on big collisions (pairs with existing haptics)
- [ ] Photo finish replay when top 2 finish within 0.5s
- [ ] Optional zoom-follow on player's marble

### New Obstacle Types
- [ ] Portals — enter one, exit another (teleport marble)
- [ ] Gravity zones — reverse or low-gravity patches
- [ ] Moving platforms — horizontal sliding walls
- [ ] Magnets — pull/push marbles toward a point
- [ ] Water/mud zones — increase frictionAir to slow marbles

### Marble Progression (Franchise Mode)
- [ ] Training between races, stat boosts from wins
- [ ] Equipment slots (lighter shell = speed, heavier = bounce)
- [ ] Fatigue system — overuse reduces performance
- [ ] Risk/reward tradeoffs for upgrades

---

## Tier 2: Content & Variety

### More Race Formats
- [ ] Multi-lap — marble loops the track 2-3 times
- [ ] Elimination — last place eliminated each lap
- [ ] Time trial — single marble, beat the clock
- [ ] Relay race — pick 3 marbles, each runs a leg
- [ ] Reverse tracks — flip existing tracks upside down
- [ ] Head-to-head — 1v1 bracket, best of 3

### Track Builder (Visual)
- [ ] Drag-and-drop grid editor (upgrade from seed-only input)
- [ ] Place ramps, bumpers, pegs, trampolines on a grid
- [ ] Save/share tracks with a code
- [ ] Community Picks — curated player-made tracks

### Track of the Day
- [ ] One featured track daily (deterministic from date seed)
- [ ] Bonus coins for racing it
- [ ] Separate daily leaderboard

---

## Tier 3: Social & Competitive

### Async Multiplayer
- [ ] Race against friends' ghost data
- [ ] Share challenge links ("Beat my time on Track X")
- [ ] Weekly global tournament with real leaderboard

### Betting Upgrades
- [ ] Exacta — pick 1st and 2nd in order
- [ ] Trifecta — pick top 3 in order
- [ ] Prop bets — "Will any marble finish under 15s?"
- [ ] Parlay — chain multiple race bets for big multiplier

### Clans/Teams
- [ ] Join a team of players
- [ ] Team challenges (combined wins per week)
- [ ] Team vs team tournaments

### Invite a Friend
- [ ] Unique referral code/link per user
- [ ] 500 coins reward when friend completes 3 races
- [ ] Lifetime cap of 10 referrals (5,000 coins max)
- [ ] Share via native share sheet

---

## Tier 4: Polish & Feel

### Race Commentary
- [ ] Auto-generated text bubbles during race ("Rocky takes the lead!")
- [ ] Based on actual marble positions/events from the engine

### Sound Design
- [ ] Collision sounds per material (metal clang, wood thud, bounce)
- [ ] Crowd roar at finish, gasp on lead changes
- [ ] Background music per theme

### Replay System
- [ ] Record marble positions each frame
- [ ] Post-race replay with scrub bar, slow-mo, follow cam
- [ ] Share replay as video/gif

### Weather Effects on Physics
- [ ] Rain — more frictionAir, wet surfaces
- [ ] Wind — constant horizontal force
- [ ] Ice — near-zero friction everywhere
- [ ] Tie to seasons or randomize per race

### Trading Card UI
- [ ] Front: marble visual, name, season record, overall rating
- [ ] Back: full stat breakdown, sparkline charts, course heatmap
- [ ] Tap to flip between front and back
- [ ] Compare mode: two cards side by side

---

## Priority Picks (Best ROI)

| # | Feature | Why |
|---|---------|-----|
| 1 | Seasonal backgrounds + particles | Instant visual freshness, low code effort |
| 2 | Slow-mo finish + camera shake | Makes every race feel dramatic |
| 3 | Race commentary text | Free engagement from data already tracked |
| 4 | Exacta/Trifecta betting | Deepens economy with zero new screens |
| 5 | Track of the Day | Daily engagement hook, minimal code |

---

## Key Files Reference

```
E:\Donkey.Marble.Racing\
├── app/                    # Expo Router screens
│   ├── race.tsx            # Race view + physics
│   ├── betting.tsx         # Bet placement
│   ├── results.tsx         # Win/loss results
│   ├── lobby.tsx           # Main hub + daily streak
│   ├── courses.tsx         # Course selection
│   ├── season.tsx          # Season hub
│   ├── playoffs.tsx        # Playoff bracket
│   ├── championship.tsx    # Champion screen
│   ├── national-races.tsx  # Timed national events
│   ├── tournament-bracket.tsx # Tournament bracket
│   ├── achievements.tsx    # Achievement gallery
│   ├── challenges.tsx      # Daily/weekly challenges
│   ├── custom-track.tsx    # Seed-based track generator
│   ├── leaderboards.tsx    # Marble rankings + records
│   ├── store.tsx           # IAP store
│   └── roster.tsx          # Marble roster + skin selector
├── engine/
│   ├── race.ts             # Physics engine (Matter.js)
│   ├── tracks.ts           # Track layouts + buildTrack()
│   └── trackGenerator.ts   # Procedural track generator
├── state/
│   └── gameStore.ts        # Zustand store (v4)
├── data/
│   ├── courses.ts          # 96 course definitions
│   ├── achievements.ts     # 20 achievement definitions
│   ├── skins.ts            # 10 skin definitions
│   ├── challenges.ts       # Challenge generation
│   ├── seasonSchedule.ts   # Season schedule generator
│   └── nationalRaces.ts    # National race events
├── utils/
│   ├── haptics.ts          # Haptic feedback
│   └── eventNotifications.ts # Push notifications
├── theme/                  # Colors, fonts, marble data
└── assets/kenney/          # Sprite assets
```
