/**
 * Does every skill have a cast, a travel and an impact beat?
 *
 * Headless: casts each active skill through the real effect library at a row
 * of monsters and checks that something is seen and heard when it goes off,
 * that anything that flies is visible the whole way, and that the first blow
 * lands with a picture and a sound. See tools/beats-entry.ts.
 *
 *   node tools/check-beats.mjs
 *   node tools/check-beats.mjs --only=fireball     (prints that skill's timeline)
 */
import { runEntry } from './feel-harness.mjs';

const res = await runEntry('tools/beats-entry.ts', '.beatsaudit', process.argv.slice(2));
const fails = [];
const byFamily = {};
for (const r of res.rows) {
  const f = (byFamily[r.family] ??= { n: 0, hit: 0, travelChecked: 0 });
  f.n++;
  if (r.firstHit >= 0) f.hit++;
  if (r.travel !== null) f.travelChecked++;
  const why = [];
  if (r.note.startsWith('threw') || r.note.includes('REFUSED')) why.push(r.note);
  if (!r.cast) why.push('no cast visual');
  if (!r.castSound) why.push('silent cast');
  if (r.travel === false) why.push('invisible in flight');
  if (r.impact === false) why.push('no impact visual');
  if (r.impactSound === false) why.push('silent impact');
  if (r.firstHit < 0 && !res.noImpact.includes(r.family) && !r.note) why.push('never landed a blow');
  if (why.length) fails.push(`${r.id} [${r.family}]: ${why.join(', ')}`);
}
console.log('family        skills  landed  travel-checked');
for (const [k, v] of Object.entries(byFamily).sort()) {
  console.log(k.padEnd(14) + String(v.n).padStart(6) + String(v.hit).padStart(8) + String(v.travelChecked).padStart(16));
}
if (res.silent.length) fails.push(`sounds asked for that do not exist: ${res.silent.join(', ')}`);
for (const f of fails) console.log('FAIL', f);
if (!fails.length) console.log(`OK — all ${res.rows.length} active skills have their beats.`);
process.exit(fails.length ? 1 : 0);
