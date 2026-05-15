export type PassTrack = 'free' | 'premium' | 'plus';

export interface PassReward {
  level: number;
  name: string;
  description: string;
  track: PassTrack;
  icon: string;
}

/** XP required per level */
export const XP_PER_LEVEL = 1000;

/** Reward definitions — state computed dynamically from player's level */
export const PASS_REWARDS: PassReward[] = [
  { level: 2, name: '200 Coins', description: 'Free Track', track: 'free', icon: '$' },
  { level: 3, name: 'Starter Badge', description: 'Free Track — Profile flair', track: 'free', icon: '*' },
  { level: 5, name: '500 Coins', description: 'Free Track', track: 'free', icon: '$' },
  { level: 7, name: 'Speed Trail', description: 'Premium Track — Marble trail FX', track: 'premium', icon: '*' },
  { level: 10, name: '1,000 Coins', description: 'Free Track', track: 'free', icon: '$' },
  { level: 12, name: 'Flame Skin — Rocky', description: 'Premium Track', track: 'premium', icon: '*' },
  { level: 15, name: '2,000 Coins', description: 'Free Track', track: 'free', icon: '$' },
  { level: 18, name: 'Neon Trail Effect', description: 'Premium Track — Marble trail FX', track: 'premium', icon: '*' },
  { level: 20, name: '1,500 Coins', description: 'Free Track', track: 'free', icon: '$' },
  { level: 22, name: 'Veteran Badge', description: 'Free Track — Profile flair', track: 'free', icon: '*' },
  { level: 25, name: 'Galaxy Skin — Dash', description: 'Plus Track — Exclusive', track: 'plus', icon: '*' },
  { level: 30, name: "Champion's Crown", description: 'Plus Track — Season 1 Exclusive', track: 'plus', icon: '*' },
];
