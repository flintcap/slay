/**
 * Every base looks different: renders the inventory icon of every base,
 * unique and set piece (the model alone, without the rarity light) and fails
 * when two bases of one category, two specials on one base, or a special and
 * its plain base draw nearly the same picture.
 *
 *   SLAY_PORT=4326 timeout 900 node tools/check-item-icons.mjs [--min=0.05]
 *
 * Runs the `distinct` sheet of `tools/item-page.ts` through `tools/item-sheet.mjs`.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const r = spawnSync(process.execPath, [path.join(import.meta.dirname, 'item-sheet.mjs'), 'distinct', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
