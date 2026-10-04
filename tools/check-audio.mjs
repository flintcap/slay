/**
 * Is anything silent that should not be?
 *
 * Static and headless: every biome and boss track exists, every place has an
 * ambience bed and footsteps, every weapon swings and lands audibly, every UI
 * sound resolves, and monster abilities make sound (with an audible tell for
 * long wind-ups).
 *
 *   node tools/check-audio.mjs
 */
import { runEntry } from './feel-harness.mjs';

const res = await runEntry('tools/audio-entry.ts', '.audioaudit');
console.log(JSON.stringify(res.notes));
if (res.ok) console.log('OK — every track, bed, swing and monster ability is audible.');
else for (const f of res.fails) console.log('FAIL', f);
process.exit(res.ok ? 0 : 1);
