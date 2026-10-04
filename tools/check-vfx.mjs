/**
 * Does every element look and sound like itself?
 *
 * Static and headless: checks that each school (physical, fire, cold,
 * lightning, poison, arcane, bone) has a cast flare, a wake, an impact, a
 * lingering mark with a cooling glow, a ribbon and sounds that all exist; that
 * every active skill maps to a school; and that both texture atlases are
 * uploaded the right way up with every referenced cell inside the sheet.
 *
 *   node tools/check-vfx.mjs
 */
import { runEntry } from './feel-harness.mjs';

const res = await runEntry('tools/vfx-entry.ts', '.vfxaudit');
console.log(JSON.stringify(res.notes));
if (res.ok) console.log('OK — every school has a cast, a wake, an impact and a mark.');
else for (const f of res.fails) console.log('FAIL', f);
process.exit(res.ok ? 0 : 1);
