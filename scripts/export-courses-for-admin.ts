/**
 * Snapshot all courses to a JSON file that the marble-admin app bundles.
 *
 * The admin needs to know every track id + name + theme + a representative
 * color so it can show a track grid with native-background previews. The
 * admin is a separate repo, so we generate a static JSON snapshot here and
 * commit it on both sides. Re-run this script whenever data/courses.ts
 * changes.
 *
 * Run:
 *   npx tsx scripts/export-courses-for-admin.ts
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { ALL_COURSES, THEME_COLORS } from '../data/courses';

const out = ALL_COURSES.map((c) => ({
  id: c.id,
  name: c.name,
  theme: c.theme,
  description: c.description,
  gradient: c.gradientColors,
  themeColor: THEME_COLORS[c.theme],
}));

const dest = process.argv[2] || 'C:/Users/beltr/Donkey.Ideas/apps/marble-admin/src/data/tracks.json';
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out, null, 2));

console.log(`Wrote ${out.length} tracks to ${dest}`);
