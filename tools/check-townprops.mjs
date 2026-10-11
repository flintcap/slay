/**
 * Is the town cheap to draw, lit within budget, and solid exactly where it
 * looks solid?
 *
 *   node tools/check-townprops.mjs
 *
 * Headless. See `tools/townprops-entry.ts`. Fails on more lights than
 * check-perf allows, a draw estimate over budget, a collider with nothing
 * drawn inside it, or a tall solid with no collider round it.
 */
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('townprops');
for (const [k, v] of Object.entries(r.report)) console.log(`${k.padEnd(16)} ${v}`);
finish(r.problems, 'the town is within budget and solid where it looks solid.');
