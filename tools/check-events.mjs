/**
 * Dungeon events and generated quests: placed sanely, guaranteed what they
 * need, and working end to end.
 *
 *   node tools/check-events.mjs
 *
 * See `tools/events-entry.ts`.
 */
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('events');
console.log(`forced placement: ${r.forced.events} events on ${r.forced.floors} floors`, JSON.stringify(r.forced.byKind));
console.log('\nevents per ordinary floor, left to chance:');
for (const row of r.rates) console.log(`  depth ${String(row.depth).padStart(3)}  ${row.perFloor.toFixed(2)}  ${JSON.stringify(row.byKind)}`);
console.log(`\nfloors checked for chests: ${r.chests.floors}, without a chest: ${r.chests.chestless}, owed an altar but without: ${r.chests.altarless}`);
console.log('\ntightest supply for each quest pickup (have / need):');
for (const [k, v] of Object.entries(r.tightest)) console.log(`  ${k.padEnd(28)} ${String(v.ratio).padEnd(6)} ${v.where}`);
console.log('\nlive events:');
for (const [k, v] of Object.entries(r.live)) console.log(`  ${k.padEnd(13)} ${v}`);
finish(r.problems, 'events are placed sanely and work; every generated quest can be finished.');
