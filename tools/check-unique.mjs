/**
 * Is every skill in the game 1 of 1?
 *
 * Static and headless. Across every class (new ones too), no two active
 * skills may share:
 *   - a body clip (each plays its own `skill.<id>` gesture),
 *   - a visual signature (what is drawn, colour and size aside: see
 *     `src/fx/SkillLooks.ts`), or a motif (its own shape in its own motion), or
 *   - a sound file.
 *
 * A class this stream does not own that has no gestures yet (a class still
 * being built) is reported as pending instead of failing; once it has one
 * gesture it must be fully unique. The same goes for motifs.
 *
 *   node tools/check-unique.mjs           # pass or fail, short summary
 *   node tools/check-unique.mjs --list    # also list every collision
 */
import { runEntry } from './feel-harness.mjs';

/** Classes whose skills must already be unique. Others may be pending. */
const OWNED = new Set(['warden', 'shadowblade', 'ranger', 'mage', 'revenant']);
const list = process.argv.includes('--list');

const rows = await runEntry('tools/unique-entry.ts', '.unique');
const classes = [...new Set(rows.map((r) => r.cls))];
const pendingClip = new Set(classes.filter((c) => !OWNED.has(c) && !rows.some((r) => r.cls === c && r.gesture)));
const pendingLook = new Set(classes.filter((c) => !OWNED.has(c) && !rows.some((r) => r.cls === c && r.motif)));

/** Groups rows by a key and returns the groups with more than one skill. */
function shared(key, skip) {
  const by = new Map();
  for (const r of rows) {
    if (skip.has(r.cls)) continue;
    for (const k of [].concat(key(r))) {
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(`${r.cls}:${r.id}`);
    }
  }
  return [...by.entries()].filter(([, v]) => v.length > 1);
}

const fails = [];
const report = (label, groups) => {
  const n = new Set(groups.flatMap(([, v]) => v)).size;
  console.log(`${label.padEnd(8)} ${groups.length ? 'FAIL' : 'ok  '}  ${n} skills in ${groups.length} shared groups`);
  if (groups.length) fails.push(label);
  if (list) for (const [k, v] of groups) console.log(`    ${k}\n      ${v.join(', ')}`);
};

console.log('class         skills  own gesture  own motif');
for (const c of classes) {
  const mine = rows.filter((r) => r.cls === c);
  const tag = pendingClip.has(c) ? '  (pending)' : '';
  console.log(`${c.padEnd(14)}${String(mine.length).padStart(5)}${String(mine.filter((r) => r.gesture).length).padStart(13)}${String(mine.filter((r) => r.motif).length).padStart(11)}${tag}`);
}
console.log('');
report('clips', shared((r) => r.clip, pendingClip));
report('visuals', shared((r) => r.look, pendingLook));
report('motifs', shared((r) => r.pair ?? [], pendingLook));
report('sounds', shared((r) => r.sounds, new Set()));
const missing = rows.filter((r) => !pendingClip.has(r.cls) && !r.gesture).map((r) => `${r.cls}:${r.id}`);
console.log(`no gesture: ${missing.length}${missing.length && list ? ' - ' + missing.join(', ') : ''}`);
if (missing.length) fails.push('gestures');
const bare = rows.filter((r) => !pendingLook.has(r.cls) && !r.motif).map((r) => `${r.cls}:${r.id}`);
console.log(`no motif: ${bare.length}${bare.length && list ? ' - ' + bare.join(', ') : ''}`);
if (bare.length) fails.push('motifs');

if (fails.length) console.log(`FAIL: shared ${fails.join(', ')}`);
else console.log('OK: every active skill has its own gesture, look and sound.');
process.exit(fails.length ? 1 : 0);
