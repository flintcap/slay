/**
 * Does every skill sound like one thing, every time?
 *
 * Static and headless. Every active skill has a row in
 * `src/audio/SkillSounds.ts`; every stage it plays (cast, hit, minion)
 * resolves to exactly one `skill.*` recording, with no alias, fallback or
 * extra layer; a stage the skill's family never plays is empty; and every
 * blink and teleport is a quick sound, under 0.4 seconds.
 *
 *   node tools/check-skillsound.mjs           # pass or fail
 *   node tools/check-skillsound.mjs --table   # also print skill -> sounds
 */
import { readFileSync } from 'node:fs';
import { runEntry } from './feel-harness.mjs';

const QUICK_MAX = 0.4;

/** Length in seconds of an Ogg Vorbis file: the last page's granule over the rate. */
function oggSeconds(file) {
  const b = readFileSync(file);
  const v = b.indexOf('\x01vorbis');
  if (v < 0) throw new Error(`${file} is not Ogg Vorbis`);
  const rate = b.readUInt32LE(v + 12);
  const last = b.lastIndexOf('OggS');
  const granule = Number(b.readBigUInt64LE(last + 6));
  return granule / rate;
}

const res = await runEntry('tools/skillsound-entry.ts', '.skillsound');
const lengths = {};
for (const f of res.notes.files ?? []) {
  const s = oggSeconds(`public/assets/${f}`);
  lengths[f] = Number(s.toFixed(3));
  if (s >= QUICK_MAX) res.fails.push(`${f} is a blink or teleport and runs ${s.toFixed(2)}s (limit ${QUICK_MAX}s)`);
}
const table = res.notes.table ?? [];
res.notes.table = table.length;
res.notes.files = lengths;
if (res.fails.length) res.ok = false;
if (process.argv.includes('--table')) {
  for (const r of table) console.log([r.id, r.family, r.cast ?? '-', r.hit ?? '-', r.minion ?? '-'].join('\t'));
}
console.log(JSON.stringify(res.notes));
if (res.ok) console.log('OK: every skill has one sound per stage, and every blink is quick.');
else for (const f of res.fails) console.log('FAIL', f);
process.exit(res.ok ? 0 : 1);
