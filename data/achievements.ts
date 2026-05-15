import type { CoinTransaction, SeasonState, TournamentState } from '../state/gameStore';

// State snapshot passed to achievement check functions
export interface AchievementCheckState {
  totalRaces: number;
  totalWins: number;
  bestStreak: number;
  currentStreak: number;
  coinHistory: CoinTransaction[];
  marbleStats: Record<string, { wins: number; losses: number; betCount: number }>;
  season: SeasonState | null;
  tournaments: TournamentState | null;
  achievements: Record<string, { unlockedAt: string }>;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'races' | 'wins' | 'streak' | 'economy' | 'season' | 'tournament' | 'loyalty' | 'variety';
  check: (s: AchievementCheckState) => boolean;
  unlocksSkin?: { marbleId: string; skinId: string };
}

function totalPayouts(history: CoinTransaction[]): number {
  return history.filter(t => t.type === 'payout').reduce((sum, t) => sum + t.amount, 0);
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ── Race milestones ──
  { id: 'first-race', name: 'First Race', description: 'Complete your first race', icon: '1', category: 'races',
    check: s => s.totalRaces >= 1 },
  { id: '10-races', name: 'Getting Started', description: 'Complete 10 races', icon: '10', category: 'races',
    check: s => s.totalRaces >= 10 },
  { id: '50-races', name: 'Veteran Racer', description: 'Complete 50 races', icon: '50', category: 'races',
    check: s => s.totalRaces >= 50,
    unlocksSkin: { marbleId: 'rocky', skinId: 'rocky-crimson' } },
  { id: '100-races', name: 'Century Club', description: 'Complete 100 races', icon: '100', category: 'races',
    check: s => s.totalRaces >= 100 },
  { id: '500-races', name: 'Marathon Runner', description: 'Complete 500 races', icon: '500', category: 'races',
    check: s => s.totalRaces >= 500,
    unlocksSkin: { marbleId: 'shadow', skinId: 'shadow-obsidian' } },

  // ── Win milestones ──
  { id: 'first-win', name: 'First Win', description: 'Win your first race', icon: 'W', category: 'wins',
    check: s => s.totalWins >= 1 },
  { id: '10-wins', name: 'Double Digits', description: 'Win 10 races', icon: '10W', category: 'wins',
    check: s => s.totalWins >= 10,
    unlocksSkin: { marbleId: 'dash', skinId: 'dash-cobalt' } },
  { id: '50-wins', name: 'Half Century', description: 'Win 50 races', icon: '50W', category: 'wins',
    check: s => s.totalWins >= 50 },
  { id: '100-wins', name: 'Triple Digits', description: 'Win 100 races', icon: '100W', category: 'wins',
    check: s => s.totalWins >= 100,
    unlocksSkin: { marbleId: 'nova', skinId: 'nova-supernova' } },

  // ── Streak ──
  { id: '3-streak', name: 'Hot Streak', description: 'Win 3 races in a row', icon: '3x', category: 'streak',
    check: s => s.bestStreak >= 3 },
  { id: '5-streak', name: 'On Fire', description: 'Win 5 races in a row', icon: '5x', category: 'streak',
    check: s => s.bestStreak >= 5,
    unlocksSkin: { marbleId: 'spike', skinId: 'spike-inferno' } },
  { id: '10-streak', name: 'Unstoppable', description: 'Win 10 races in a row', icon: '10x', category: 'streak',
    check: s => s.bestStreak >= 10,
    unlocksSkin: { marbleId: 'lucky', skinId: 'lucky-emerald' } },

  // ── Economy ──
  { id: 'earn-10k', name: 'Money Maker', description: 'Earn 10,000 coins from payouts', icon: '$', category: 'economy',
    check: s => totalPayouts(s.coinHistory) >= 10000 },
  { id: 'earn-100k', name: 'High Roller', description: 'Earn 100,000 coins from payouts', icon: '$$', category: 'economy',
    check: s => totalPayouts(s.coinHistory) >= 100000,
    unlocksSkin: { marbleId: 'aqua', skinId: 'aqua-deepsea' } },

  // ── Season ──
  { id: 'season-champ', name: 'Season Champion', description: 'Win a season championship', icon: 'T', category: 'season',
    check: s => (s.season?.seasonHistory?.length ?? 0) >= 1,
    unlocksSkin: { marbleId: 'frosty', skinId: 'frosty-glacier' } },
  { id: '3-seasons', name: 'Dynasty', description: 'Win 3 season championships', icon: '3T', category: 'season',
    check: s => (s.season?.seasonHistory?.length ?? 0) >= 3 },

  // ── Tournament ──
  { id: 'tournament-win', name: 'Tournament Victor', description: 'Win any tournament', icon: 'TV', category: 'tournament',
    check: s => s.tournaments?.status === 'champion' },
  { id: 'champion-invite', name: 'Elite Champion', description: 'Win the Champion Invitational', icon: 'CI', category: 'tournament',
    check: s => s.tournaments?.status === 'champion' && s.tournaments?.tournamentId === 'champion-invitational',
    unlocksSkin: { marbleId: 'shadow', skinId: 'shadow-phantom' } },

  // ── Loyalty & Variety ──
  { id: 'marble-loyalty', name: 'Loyal Fan', description: 'Win 25 races with one marble', icon: 'LF', category: 'loyalty',
    check: s => Object.values(s.marbleStats).some(ms => ms.wins >= 25) },
  { id: 'all-marbles', name: 'Variety Show', description: 'Win at least 1 race with all 8 marbles', icon: '8M', category: 'variety',
    check: s => {
      const ids = ['rocky', 'dash', 'lucky', 'spike', 'nova', 'frosty', 'aqua', 'shadow'];
      return ids.every(id => (s.marbleStats[id]?.wins ?? 0) >= 1);
    },
    unlocksSkin: { marbleId: 'dash', skinId: 'dash-aurora' } },
];
