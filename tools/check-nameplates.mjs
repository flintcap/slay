/**
 * The auto quality mode steps down when that buys frame time, puts back a
 * step that bought none, and climbs back when calm. See
 * tools/nameplates-entry.ts.
 *
 *   node tools/check-autoquality.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.npaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/nameplates-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { first, rebuilt } = JSON.parse(lines[lines.length - 1]);
if (first > 0 && rebuilt === 0) console.log(`nameplates ok: ${first} badges built once, none rebuilt while the crowd shifted`);
else {
  console.log(`FAIL nameplates: ${first} badges built, ${rebuilt} rebuilt over 60 frames of a shifting crowd`);
  process.exit(1);
}
