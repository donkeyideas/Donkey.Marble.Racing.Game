# Donkey Marble Racing — Project Status

**Last updated:** 2026-05-12

---

## What Is This?

A mobile marble racing game where players bet coins on marbles rolling down a vertical zigzag course with obstacles. Built with React Native + Expo + Matter.js physics.

---

## Current State: Alpha (Playable Prototype)

The app runs on Expo Go. All core screens are built and connected. The race engine uses Matter.js physics with a vertical scrolling downhill course.

### What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Splash screen | Done | Animated logo, tap to enter |
| Lobby screen | Done | Shows coins, bet count, race/roster/profile navigation |
| Betting screen | Done | 8 marble cards with odds, 4 bet amounts (25/100/250/500) |
| Race screen | Done | Vertical scrolling course, camera follows leaders |
| Results screen | Done | Podium, payout display, play again flow |
| Roster screen | Done | All 8 marbles with stats |
| Profile screen | Done | Win/loss stats display |
| Coin economy | Done | Start with 1250, bet and win/lose |
| Odds system | Done | Stats-based odds with slight randomness |
| 8 unique marbles | Done | Each with speed/power/bounce/luck stats |
| Physics engine | Done | Matter.js, gravity-driven, stat-based marble properties |
| Curved ramps | Done | Quadratic bezier curves, 8 segments per ramp |
| Windmill obstacles | Done | 4 rotating windmills that interact with marbles |
| Bumper obstacles | Done | High-restitution bouncing obstacles |
| Peg rows | Done | Scatter marbles for randomness |
| Scrolling camera | Done | Smooth lerp following top 4 marbles |
| Viewport culling | Done | Only renders elements near camera for performance |
| HUD overlay | Done | Live position leaderboard + race timer |
| Finish line | Done | Visual finish line with "FINISH" text |

### Known Issues / In Progress

- **Race duration tuning** — may need adjustment to hit 30-60 second target
- **Marble spread** — marbles may cluster together; needs testing
- **Stuck marbles** — anti-stuck force exists but may need tuning
- **No sound** — no audio yet
- **No persistence** — coins/stats reset on app restart
- **No backend** — everything is local

---

## Tech Stack

- **Framework:** React Native + Expo SDK 55 (managed workflow)
- **Language:** TypeScript
- **Physics:** Matter.js 0.20
- **State:** Zustand 5.0
- **Navigation:** expo-router (file-based routing)
- **Fonts:** Lilita One (display), Fredoka (body)
- **Animations:** react-native-reanimated

---

## Project Structure

```
/app                    Expo Router screens (8 screens)
  _layout.tsx           Root layout with font loading
  index.tsx             Splash screen
  lobby.tsx             Main hub
  betting.tsx           Marble selection + bet placement
  race.tsx              Race renderer (vertical scrolling)
  results.tsx           Race results + payout
  roster.tsx            All marbles gallery
  profile.tsx           Player stats
/components             Reusable UI (6 components)
  BackButton.tsx        Navigation back button
  CoinPill.tsx          Coin balance display
  MarbleCard.tsx        Betting card for each marble
  MarbleDot.tsx         3D marble visual
  PrimaryButton.tsx     Main action button (3 variants)
  StatBar.tsx           Stat visualization bar
/engine
  race.ts               Matter.js physics engine + track generation
/state
  gameStore.ts          Zustand store (coins, bets, results, stats)
/theme
  index.ts              Colors, fonts, spacing, marble data
```

---

## Race Course Design

The race is a vertical downhill marble run:
- **18 alternating curved ramps** zigzagging left-right
- Ramps are asymmetric: entry end hugs the wall, exit end leaves a gap for marbles to drop through
- **4 windmills** that rotate and knock marbles around
- **Bumper fields** (after ramps 3 and 11) with high-bounce obstacles
- **Peg rows** (after ramps 7 and 15) that scatter marbles
- Side walls contain everything
- Camera scrolls down following the leading marbles
- 90-second timeout forces race end

---

## The 8 Marbles

| Name | Color | Speed | Power | Bounce | Luck |
|------|-------|-------|-------|--------|------|
| Rocky | Red | 3 | 4 | 2 | 3 |
| Dash | Blue | 5 | 2 | 3 | 2 |
| Lucky | Green | 3 | 3 | 2 | 5 |
| Spike | Yellow | 2 | 5 | 4 | 2 |
| Nova | Purple | 4 | 2 | 3 | 4 |
| Frosty | Orange | 3 | 3 | 4 | 3 |
| Aqua | Teal | 4 | 2 | 2 | 4 |
| Shadow | Gray | 3 | 4 | 3 | 3 |

Stats affect physics: speed → friction/air resistance, power → density/force, bounce → restitution, luck → random nudges.
