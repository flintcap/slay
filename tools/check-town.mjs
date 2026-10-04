/**
 * The camp services Legacy unlocks: the Gambler, the Enchanter and the
 * Bounty Board. Saves, odds, rules, payment, progress and wiring.
 *
 *   node tools/check-town.mjs
 *
 * See `tools/town-entry.ts`.
 */
import { readFileSync } from 'node:fs';
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('town');
for (const [k, v] of Object.entries(r.report)) {
  if (Array.isArray(v)) {
    console.log(`${k}:`);
    for (const line of v) console.log(`  ${line}`);
  } else console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
}
// Every seam the live game needs, present in the source.
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const need = [
  ['src/scenes/TownScene.ts', /mountTownStations\(/, 'TownScene mounts the stations'],
  ['src/ui/DepthUI.ts', /registerPanel\('gambler'/, 'gambler panel registered'],
  ['src/ui/DepthUI.ts', /registerPanel\('enchanter'/, 'enchanter panel registered'],
  ['src/ui/DepthUI.ts', /registerPanel\('bounties'/, 'bounty panel registered'],
  ['src/scenes/RunDirector.ts', /bountyProgress\(/, 'RunDirector advances bounties'],
  ['src/scenes/DungeonScene.ts', /renown: \(amount, event\) => this\.director\?\.award\(amount, event\)/, 'events reach the director by name'],
  ['src/sim/Character.ts', /repairTownState\(c\)/, 'repairCharacter repairs town state'],
];
for (const [file, re, what] of need) {
  if (!re.test(src(file))) r.problems.push(`not wired: ${what} (${file})`);
  else console.log(`wired: ${what}`);
}
finish(r.problems, 'the gambler, the enchanter and the bounty board work and are wired.');
