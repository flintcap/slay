/**
 * Do run themes change the mood without making monsters fewer or weaker?
 *
 *   node tools/check-themes.mjs
 *
 * Headless. See `tools/themes-entry.ts`. Fails when a theme changes the
 * monster count, a rank, affixes or a spawn place, puts a monster below its
 * depth, lowers its favoured families, never shows its props, or puts sky
 * weather under a roof.
 */
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('themes');
for (const [k, v] of Object.entries(r.report)) console.log(`${k.padEnd(12)} ${v}`);
finish(r.problems, 'run themes change the mood, never the monster count or strength.');
