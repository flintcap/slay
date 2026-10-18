/**
 * Map polish: bare dead ends, props on crossings, props across seams.
 *
 *   node tools/check-polish.mjs
 *
 * Headless. See `tools/polish-entry.ts`.
 */
import { runEntry, finish } from './depth-ssr.mjs';

const r = await runEntry('polish');
for (const [k, v] of Object.entries(r.report)) console.log(`${k.padEnd(12)} ${v}`);
finish(r.problems, 'dead ends hold something, crossings are clear, and every prop belongs to its zone.');
