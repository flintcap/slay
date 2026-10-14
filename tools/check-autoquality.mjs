/**
 * The auto quality mode steps down when that buys frame time, puts back a
 * step that bought none, and climbs back when calm. See
 * tools/autoquality-entry.ts.
 *
 *   node tools/check-autoquality.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.aqaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/autoquality-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { out, fails } = JSON.parse(lines[lines.length - 1]);
console.log(JSON.stringify(out));
if (fails.length === 0) console.log('auto quality ok: steps that pay stay, steps that do not go back');
else {
  for (const f of fails) console.log(`FAIL ${f}`);
  process.exit(1);
}
