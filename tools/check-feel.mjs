/**
 * Does a blow feel like a blow?
 *
 * Static and headless: bundles `tools/feel-entry.ts` for Node and runs the hit
 * feedback layer against stubs — hit-stop budget, flash restore, knockback
 * against walls, pooled shake — and checks every sound and emitter it asks
 * for exists.
 *
 *   node tools/check-feel.mjs
 */
import { runEntry } from './feel-harness.mjs';

const res = await runEntry('tools/feel-entry.ts', '.feelaudit');
console.log(JSON.stringify(res.notes));
if (res.ok) console.log('OK — hits stop, flash, shove and sound within budget.');
else for (const f of res.fails) console.log('FAIL', f);
process.exit(res.ok ? 0 : 1);
