/**
 * The level curve keeps the hero within a few levels of the depth number at
 * every depth, and level 99 comes near depth 100.
 *
 *   node tools/check-levels.mjs
 *
 * See `tools/levels-entry.ts`.
 */
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('levels');
for (const [k, v] of Object.entries(r.report)) console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
finish(r.problems, 'heroes keep step with the depth.');
