import { MARBLES } from '../theme';
import { ALL_COURSES } from './courses';

// ── Seeded PRNG (mulberry32, same as trackGenerator) ──

function createRNG(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Types ──

export type ChallengeCriteria =
  | { kind: 'win_with_marble'; marbleId: string }
  | { kind: 'top3_with_marble'; marbleId: string }
  | { kind: 'win_streak'; count: number }
  | { kind: 'win_count'; count: number }
  | { kind: 'win_different_marbles'; count: number; marbleIds: string[] };

export interface ChallengeProgress {
  id: string;
  type: 'daily' | 'weekly';
  description: string;
  target: number;
  current: number;
  completed: boolean;
  reward: number;
  claimed: boolean;
  criteria: ChallengeCriteria;
}

export interface ChallengeCheckState {
  won: boolean;
  playerPickId: string | null;
  playerPlacement: number;
  currentStreak: number;
}

// ── Date helpers ──

export function getWeekStartDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function dateToSeed(dateStr: string): number {
  return parseInt(dateStr.replace(/-/g, ''), 10);
}

// ── Challenge generation ──

const MARBLE_IDS = MARBLES.map(m => m.id);
const MARBLE_NAMES: Record<string, string> = Object.fromEntries(MARBLES.map(m => [m.id, m.name]));

function pickRandom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function generateDailyChallenges(dateStr: string): ChallengeProgress[] {
  const rng = createRNG(dateToSeed(dateStr));
  const challenges: ChallengeProgress[] = [];
  const usedTypes = new Set<string>();

  // Template pool for daily challenges
  const templates = [
    () => {
      const mid = pickRandom(MARBLE_IDS, rng);
      return {
        description: `Win a race with ${MARBLE_NAMES[mid]}`,
        target: 1, reward: 300,
        criteria: { kind: 'win_with_marble' as const, marbleId: mid },
      };
    },
    () => {
      const mid = pickRandom(MARBLE_IDS, rng);
      return {
        description: `Finish top 3 with ${MARBLE_NAMES[mid]}`,
        target: 1, reward: 200,
        criteria: { kind: 'top3_with_marble' as const, marbleId: mid },
      };
    },
    () => ({
      description: 'Win 2 races in a row',
      target: 2, reward: 400,
      criteria: { kind: 'win_streak' as const, count: 2 },
    }),
    () => ({
      description: 'Win 3 races today',
      target: 3, reward: 500,
      criteria: { kind: 'win_count' as const, count: 3 },
    }),
  ];

  // Pick 3 unique templates
  const shuffled = [...templates].sort(() => rng() - 0.5);
  for (let i = 0; i < 3 && i < shuffled.length; i++) {
    const tmpl = shuffled[i]();
    challenges.push({
      id: `daily-${dateStr}-${i}`,
      type: 'daily',
      description: tmpl.description,
      target: tmpl.target,
      current: 0,
      completed: false,
      reward: tmpl.reward,
      claimed: false,
      criteria: tmpl.criteria,
    });
  }

  return challenges;
}

export function generateWeeklyChallenges(weekStartDate: string): ChallengeProgress[] {
  const rng = createRNG(dateToSeed(weekStartDate) + 7777);
  const challenges: ChallengeProgress[] = [];

  const templates = [
    () => ({
      description: 'Win 5 races this week',
      target: 5, reward: 1500,
      criteria: { kind: 'win_count' as const, count: 5 },
    }),
    () => ({
      description: 'Win with 3 different marbles',
      target: 3, reward: 2000,
      criteria: { kind: 'win_different_marbles' as const, count: 3, marbleIds: [] as string[] },
    }),
    () => ({
      description: 'Win 10 races this week',
      target: 10, reward: 2000,
      criteria: { kind: 'win_count' as const, count: 10 },
    }),
    () => ({
      description: 'Win with 5 different marbles',
      target: 5, reward: 2500,
      criteria: { kind: 'win_different_marbles' as const, count: 5, marbleIds: [] as string[] },
    }),
  ];

  const shuffled = [...templates].sort(() => rng() - 0.5);
  for (let i = 0; i < 2; i++) {
    const tmpl = shuffled[i]();
    challenges.push({
      id: `weekly-${weekStartDate}-${i}`,
      type: 'weekly',
      description: tmpl.description,
      target: tmpl.target,
      current: 0,
      completed: false,
      reward: tmpl.reward,
      claimed: false,
      criteria: tmpl.criteria,
    });
  }

  return challenges;
}

/** Evaluate a single challenge against the latest race result, returning updated progress */
export function evaluateChallenge(
  challenge: ChallengeProgress,
  state: ChallengeCheckState,
): ChallengeProgress {
  if (challenge.completed || challenge.claimed) return challenge;

  const c = challenge.criteria;
  let newCurrent = challenge.current;

  switch (c.kind) {
    case 'win_with_marble':
      if (state.won && state.playerPickId === c.marbleId) {
        newCurrent = 1;
      }
      break;

    case 'top3_with_marble':
      if (state.playerPickId === c.marbleId && state.playerPlacement >= 1 && state.playerPlacement <= 3) {
        newCurrent = 1;
      }
      break;

    case 'win_streak':
      if (state.currentStreak >= c.count) {
        newCurrent = c.count;
      }
      break;

    case 'win_count':
      if (state.won) {
        newCurrent = challenge.current + 1;
      }
      break;

    case 'win_different_marbles':
      if (state.won && state.playerPickId && !c.marbleIds.includes(state.playerPickId)) {
        const updated = [...c.marbleIds, state.playerPickId];
        newCurrent = updated.length;
        // Mutate criteria to track which marbles have won
        return {
          ...challenge,
          current: newCurrent,
          completed: newCurrent >= challenge.target,
          criteria: { ...c, marbleIds: updated },
        };
      }
      break;
  }

  return {
    ...challenge,
    current: Math.min(newCurrent, challenge.target),
    completed: newCurrent >= challenge.target,
  };
}
