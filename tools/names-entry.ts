/**
 * Entry point for `tools/check-names.mjs`: every name a player reads on an
 * item, set, boss or rune is our own, and none is used twice.
 */
import { UNIQUES } from '../src/data/uniques';
import { SETS, SET_PIECES } from '../src/data/sets';
import { BOSSES } from '../src/data/bosses';
import { WARDENS } from '../src/data/wardens';
import { RUNES, RUNEWORDS } from '../src/data/gems';
import { NAMED_RARES } from '../src/data/namedRares';
import { BORROWED, BORROWED_RUNES, BORROWED_TITLES } from './borrowed-names';

type Entry = { group: string; id: string; name: string };
const entries: Entry[] = [
  ...UNIQUES.map((u) => ({ group: 'unique', id: u.id, name: u.name })),
  ...SETS.map((s) => ({ group: 'set', id: s.id, name: s.name })),
  ...SET_PIECES.map((p) => ({ group: 'set piece', id: p.id, name: p.name })),
  ...BOSSES.map((b) => ({ group: 'boss', id: b.id, name: b.name })),
  ...WARDENS.map((w) => ({ group: 'warden', id: w.id, name: w.name })),
  ...RUNES.map((r) => ({ group: 'rune', id: r.id, name: r.name })),
  ...RUNEWORDS.map((r) => ({ group: 'runeword', id: r.id, name: r.name })),
  ...NAMED_RARES.map((n) => ({ group: 'named rare', id: n.id, name: n.name })),
];

const problems: string[] = [];
const norm = (s: string): string => s.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Repeats: two things a player could mix up in a tooltip or a kill line.
const seen = new Map<string, Entry>();
for (const e of entries) {
  if (!e.name?.trim()) { problems.push(`${e.group} ${e.id}: no name`); continue; }
  const k = norm(e.name);
  const was = seen.get(k);
  if (was) problems.push(`"${e.name}" is both ${was.group} ${was.id} and ${e.group} ${e.id}`);
  else seen.set(k, e);
}

// Borrowed: a coined name anywhere in ours, or a plain-word name taken whole.
const coined = BORROWED.map((b) => ({ raw: b, k: norm(b) }));
const whole = new Map(BORROWED_TITLES.map((b) => [norm(b), b]));
for (const r of BORROWED_RUNES) { whole.set(norm(r), r); whole.set(norm(`${r} Rune`), `${r} Rune`); }
for (const e of entries) {
  const n = norm(e.name);
  const hit = whole.get(n) ?? coined.find((b) => ` ${n} `.includes(` ${b.k} `))?.raw;
  if (hit) problems.push(`${e.group} ${e.id} "${e.name}" uses "${hit}" from the game we draw on`);
}

console.log(JSON.stringify({ count: entries.length, groups: [...new Set(entries.map((e) => e.group))].map((g) => [g, entries.filter((e) => e.group === g).length]), problems }));
