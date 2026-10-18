/**
 * The blacksmith's targeted crafts: a reroll that keeps bound lines, and
 * honing one line a rung up its ladder.
 *
 *   node tools/check-craft.mjs
 *
 * See `tools/craft-entry.ts`.
 */
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('craft');
for (const [k, v] of Object.entries(r.report)) console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
finish(r.problems, 'bound rerolls and honing follow their rules.');
