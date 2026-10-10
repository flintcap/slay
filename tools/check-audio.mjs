/**
 * Is anything silent that should not be?
 *
 * Static and headless: every biome and boss track exists, every place has an
 * ambience bed and footsteps, every weapon swings and lands audibly, every UI
 * sound resolves, and monster abilities make sound (with an audible tell for
 * long wind-ups). Every recorded file the manifest names exists and is in
 * ASSETS.md.
 *
 *   node tools/check-audio.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { runEntry } from './feel-harness.mjs';

const res = await runEntry('tools/audio-entry.ts', '.audioaudit');
// Every file the manifest names is on disk and has its ASSETS.md row.
const files = res.notes.files ?? [];
const ledger = readFileSync('ASSETS.md', 'utf8');
for (const f of files) {
  if (!existsSync(`public/assets/${f}`)) res.fails.push(`${f} is in the manifest but not on disk`);
  if (!ledger.includes(`| ${f} |`)) res.fails.push(`${f} has no row in ASSETS.md`);
}
res.notes.files = files.length;
if (res.fails.length) res.ok = false;
console.log(JSON.stringify(res.notes));
if (res.ok) console.log('OK — every track, bed, swing and monster ability is audible.');
else for (const f of res.fails) console.log('FAIL', f);
process.exit(res.ok ? 0 : 1);
