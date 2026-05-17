/**
 * Phase 6 lockdown — guard against direct coin mutations outside the
 * server-authoritative economy module.
 *
 * The server is the source of truth for player.coins. Any TS/TSX file
 * that contains an object-literal property `coins: ...` is a code smell:
 * it likely means the client is mutating local state without going
 * through /economy/transaction or syncRaceResult's reconciliation
 * callback.
 *
 * Allowed locations (curated allowlist):
 *   - state/gameStore.ts        — the store itself, which legitimately
 *                                  applies reconciled balances from
 *                                  server responses
 *   - app/lobby.tsx             — heartbeat reconciliation only
 *   - lib/economy.ts            — would-be coin reconciliation helper
 *                                  (currently no coins: literals; included
 *                                  for forward-compat)
 *
 * Anywhere else: fails the check. CI / pre-commit can hook this.
 *
 * Usage:
 *   npx tsx scripts/check-no-direct-coin-mutations.ts
 *
 * Exit code 0 if clean, 1 if any forbidden mutation is found.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = process.cwd();
const ALLOWED_FILES = new Set([
  'state/gameStore.ts',
  'app/lobby.tsx',
  'app/_layout.tsx',
  'lib/economy.ts',
]);

// Skip these directories entirely
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.expo', 'android', 'ios', 'dist', 'build',
  'scripts', '.qodo',
]);

// Match `coins: <expr>` inside object literals. False positives can happen
// for unrelated `coins:` keys in non-store contexts (e.g. an analytics
// payload), but those are rare and easy to allowlist explicitly.
const COIN_MUTATION_RE = /\bcoins\s*:/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function normalizePath(p: string): string {
  return relative(ROOT, p).replace(/\\/g, '/');
}

const files = walk(ROOT);
const violations: { file: string; line: number; text: string }[] = [];

for (const file of files) {
  const rel = normalizePath(file);
  if (ALLOWED_FILES.has(rel)) continue;
  // Also allow the check script itself
  if (rel.endsWith('check-no-direct-coin-mutations.ts')) continue;

  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    if (COIN_MUTATION_RE.test(line)) {
      // Filter out type-only declarations and interfaces
      // (e.g. `coins: number;` in an interface)
      if (/coins\s*:\s*(number|string|boolean|\{|Record|Array)/.test(line)) continue;
      // Filter `coins: coins,` (object shorthand-ish forwarding)
      // Real mutations look like `coins: <expression>` where expression is a value
      violations.push({ file: rel, line: i + 1, text: line.trim() });
    }
  }
}

if (violations.length === 0) {
  console.log('✓ No direct coin mutations found outside allowed files.');
  process.exit(0);
}

console.error(`✗ Found ${violations.length} direct coin mutation${violations.length === 1 ? '' : 's'} outside allowed files:\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.text}\n`);
}
console.error('Coin mutations belong in state/gameStore.ts, reconciled from server response.');
console.error('If this is a false positive (e.g. analytics payload), add the file to ALLOWED_FILES.');
process.exit(1);
