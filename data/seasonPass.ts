import { getConfig } from '../lib/remoteConfig';

export type PassTrack = 'free' | 'premium' | 'plus';

export interface PassReward {
  level: number;
  name: string;
  description: string;
  track: PassTrack;
  icon: string;
}

/**
 * XP required per level. Tuned 1000 → 3500 to slow progression to a crawl —
 * playtester hit lvl 17 in 2 days at the old rate, which trivialized the
 * pass-reward unlocks (the lvl 30 marble skin was reachable in a week).
 *
 * Math at the new value:
 *   Race base    250 XP, win bonus 500 XP → 750 XP per won race
 *   Avg player wins ~30% → ~ 350 XP / race average
 *   Heavy player: 30 races/day × 350 = 10500 XP/day = 3 levels/day
 *   Casual player: 8 races/day × 350 = 2800 XP/day = 0.8 levels/day
 * Lvl 30 takes ~10 days for a heavy grinder, several weeks casual.
 */
export const XP_PER_LEVEL = 3500;

/**
 * Reward definitions. Coin-reward rows have their `name` derived live from
 * remote config (pass_levelN_coins) so admin edits in the Economy page
 * reflect immediately. Cosmetic rewards (badges, skins, trails) stay
 * static because they're not numeric and they're auto-applied at the
 * level — no separate config or claim flow.
 *
 * NOTE: there is no claim action wired to grant the coins. The labels
 * here are display-only until a `pass_claim` economy action ships. Admins
 * editing the values updates what players SEE, not what they GET. The
 * mismatch is intentional for now — the unlock UX is the larger gap.
 */
export const PASS_REWARDS: PassReward[] = getStaticPassRewards();

export function getPassRewards(): PassReward[] {
  const pm = getConfig().passMilestones;
  const fmt = (n: number) => `${n.toLocaleString()} Coins`;
  // Coin amounts dynamic; cosmetic entries identical to the static defaults.
  return [
    { level: 2,  name: fmt(pm?.level2  ?? 200),  description: 'Free Track', track: 'free', icon: '$' },
    { level: 3,  name: 'Starter Badge',          description: 'Free Track — Profile flair', track: 'free', icon: '*' },
    { level: 5,  name: fmt(pm?.level5  ?? 500),  description: 'Free Track', track: 'free', icon: '$' },
    { level: 7,  name: 'Speed Trail',            description: 'Premium Track — Marble trail FX', track: 'premium', icon: '*' },
    { level: 10, name: fmt(pm?.level10 ?? 1000), description: 'Free Track', track: 'free', icon: '$' },
    { level: 12, name: 'Flame Skin — Rocky',     description: 'Premium Track', track: 'premium', icon: '*' },
    { level: 15, name: fmt(pm?.level15 ?? 2000), description: 'Free Track', track: 'free', icon: '$' },
    { level: 18, name: 'Neon Trail Effect',      description: 'Premium Track — Marble trail FX', track: 'premium', icon: '*' },
    { level: 20, name: fmt(pm?.level20 ?? 1500), description: 'Free Track', track: 'free', icon: '$' },
    { level: 22, name: 'Veteran Badge',          description: 'Free Track — Profile flair', track: 'free', icon: '*' },
    { level: 25, name: 'Galaxy Skin — Dash',     description: 'Plus Track — Exclusive', track: 'plus', icon: '*' },
    { level: 30, name: "Champion's Crown",       description: 'Plus Track — Season 1 Exclusive', track: 'plus', icon: '*' },
  ];
}

function getStaticPassRewards(): PassReward[] {
  // Same as getPassRewards() defaults — used as a one-time const for any
  // consumer that imports PASS_REWARDS directly. Live consumers should
  // call getPassRewards().
  return [
    { level: 2,  name: '200 Coins',              description: 'Free Track', track: 'free', icon: '$' },
    { level: 3,  name: 'Starter Badge',          description: 'Free Track — Profile flair', track: 'free', icon: '*' },
    { level: 5,  name: '500 Coins',              description: 'Free Track', track: 'free', icon: '$' },
    { level: 7,  name: 'Speed Trail',            description: 'Premium Track — Marble trail FX', track: 'premium', icon: '*' },
    { level: 10, name: '1,000 Coins',            description: 'Free Track', track: 'free', icon: '$' },
    { level: 12, name: 'Flame Skin — Rocky',     description: 'Premium Track', track: 'premium', icon: '*' },
    { level: 15, name: '2,000 Coins',            description: 'Free Track', track: 'free', icon: '$' },
    { level: 18, name: 'Neon Trail Effect',      description: 'Premium Track — Marble trail FX', track: 'premium', icon: '*' },
    { level: 20, name: '1,500 Coins',            description: 'Free Track', track: 'free', icon: '$' },
    { level: 22, name: 'Veteran Badge',          description: 'Free Track — Profile flair', track: 'free', icon: '*' },
    { level: 25, name: 'Galaxy Skin — Dash',     description: 'Plus Track — Exclusive', track: 'plus', icon: '*' },
    { level: 30, name: "Champion's Crown",       description: 'Plus Track — Season 1 Exclusive', track: 'plus', icon: '*' },
  ];
}
