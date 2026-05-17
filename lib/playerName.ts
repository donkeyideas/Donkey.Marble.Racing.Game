const ADJECTIVES = [
  'Speedy', 'Lucky', 'Mighty', 'Swift', 'Rapid', 'Bouncy', 'Spinny', 'Shiny',
  'Cosmic', 'Neon', 'Royal', 'Golden', 'Wild', 'Bold', 'Quick', 'Sneaky',
  'Brave', 'Sharp', 'Crazy', 'Turbo', 'Sonic', 'Hyper', 'Nimble', 'Fierce',
];

const NOUNS = [
  'Marble', 'Racer', 'Dasher', 'Chaser', 'Roller', 'Champ', 'Star', 'Bolt',
  'Comet', 'Rocket', 'Streak', 'Sprint', 'Glider', 'Whirl', 'Zoom', 'Flash',
  'Bullet', 'Hero', 'Legend', 'King', 'Ace', 'Wizard', 'Ninja', 'Pilot',
];

/**
 * Generates a friendly auto-name like "SpeedyMarble42", "CosmicBolt07".
 * Output is always 8-16 chars (matches the in-app 2-16 char validation).
 */
export function generatePlayerName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = String(Math.floor(Math.random() * 100)).padStart(2, '0');
  return `${adj}${noun}${num}`;
}
