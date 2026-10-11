/**
 * Are the townsfolk cheap to draw, quick to build, and are their loops sound?
 *
 *   SLAY_PORT=4328 node tools/check-npcdraws.mjs
 *
 * The nine residents stand in town all the time, so each one's mesh count is
 * paid every frame there, twice over for the ones that cast shadows. The
 * residents need a browser (their eyes and skin paint canvases), so this runs
 * the `check` sheet of `tools/npc-sheet.mjs`: every resident built cold, at
 * most 16 meshes each, all nine within 240 draws (colour plus one shadow
 * pass), and every work, rest and talk loop registered and run for ten
 * seconds without a bone going bad. Exits non-zero on any failure.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/npc-sheet.mjs'), 'check', ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status ?? 1);
