/**
 * Run variety: every run modifier is real and pays, depth milestones pay
 * once, waypoints and pacts work. Plus the wiring the live game needs.
 *
 *   node tools/check-runmods.mjs
 *
 * See `tools/runmods-entry.ts`.
 */
import { readFileSync } from 'node:fs';
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('runmods');
console.log('what each modifier does (tier 2):');
for (const [k, v] of Object.entries(r.report.effects)) console.log(`  ${k.padEnd(36)} ${v}`);
for (const [k, v] of Object.entries(r.report)) if (k !== 'effects') console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const need = [
  ['src/scenes/DungeonScene.ts', /new RunModifiers\(/, 'DungeonScene runs the modifiers'],
  ['src/scenes/DungeonScene.ts', /this\.runMods\?\.update\(dt\)/, 'modifiers tick'],
  ['src/scenes/DungeonScene.ts', /this\.runMods\?\.onKill\(e\)/, 'modifiers see kills'],
  ['src/scenes/DungeonScene.ts', /new RunDirector\(depth, pacts\.length\)/, 'pacts reach the director'],
  ['src/scenes/TownScene.ts', /planDescent\(/, 'the gate plans the descent'],
  ['src/scenes/RunDirector.ts', /payMilestones\(\)/, 'cleared runs pay milestones'],
];
for (const [file, re, what] of need) {
  if (!re.test(src(file))) r.problems.push(`not wired: ${what} (${file})`);
}
finish(r.problems, 'every modifier is real, danger pays, milestones, waypoints and pacts work.');
