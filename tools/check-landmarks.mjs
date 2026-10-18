/**
 * Are the landmark set pieces placed whole, fair and findable?
 *
 *   node tools/check-landmarks.mjs
 *
 * Headless. See `tools/landmarks-entry.ts`. Fails on a set piece without its
 * heart, in the wrong biome or inside the arena, a reward that cannot be
 * walked up to, too many rewards that failed to place, a rate outside 15 to
 * 50% of areas, or a set piece that never turns up.
 */
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('landmarks');
for (const [k, v] of Object.entries(r.report)) console.log(`${k.padEnd(12)} ${v}`);
finish(r.problems, 'every landmark stands whole, outside the arena, with its reward in reach.');
