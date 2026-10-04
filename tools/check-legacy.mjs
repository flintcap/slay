/**
 * Does Legacy move every run forward, and is what it buys real?
 *
 *   node tools/check-legacy.mjs
 *
 * See `tools/legacy-entry.ts`.
 */
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('legacy');
console.log('renown for one cleared run, by depth:', JSON.stringify(r.perRun));
console.log(`a cleared first run reaches rank ${r.firstRunRank}`);
console.log('rank after clearing depth N on run N:', JSON.stringify(r.rankAfter));
console.log('runs until each unlock:', JSON.stringify(r.unlockRuns));
console.log('\nperk             effect');
for (const p of r.perks) console.log(`${p.id.padEnd(16)} ${p.ok ? p.how : 'NOTHING'}`);
finish(r.problems, 'Legacy is earned every run and every perk is real.');
