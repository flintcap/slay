/**
 * Checks the new hero bodies headlessly: height, skin weights, budgets,
 * eyes in their sockets, and the mesh cache.
 *
 *   SLAY_PORT=4324 timeout 900 node tools/check-hero.mjs
 *
 * Runs the `check` sheet of `tools/hero-page.ts` through `tools/hero-sheet.mjs`.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const r = spawnSync(process.execPath, [path.join(import.meta.dirname, 'hero-sheet.mjs'), 'check', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
