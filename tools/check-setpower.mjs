/**
 * The auto quality mode steps down when that buys frame time, puts back a
 * step that bought none, and climbs back when calm. See
 * tools/setpower-entry.ts.
 *
 *   node tools/check-autoquality.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.setaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/setpower-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { rows, noCurve, fails } = JSON.parse(lines[lines.length - 1]);
if (process.argv.includes('--rows')) for (const r of rows) console.log(`${r.id.padEnd(30)} L${String(r.L).padStart(3)}  piece ${r.piece}  rare ${r.rare}  good rare ${r.p75}`);
if (noCurve.length) console.log(`stats with no curve (scored against 10): ${noCurve.join(', ')}`);
const beat = rows.filter((r) => r.piece >= r.p75).length;
if (fails.length === 0) console.log(`set power ok: every piece beats a usual rare; ${beat} of ${rows.length} piece and level pairs beat a good one`);
else {
  for (const f of fails) console.log(`FAIL ${f}`);
  process.exit(1);
}
