/**
 * How much variety does a run actually have?
 *
 *   node tools/check-variety.mjs
 *
 * A report, not a pass/fail gate. Measures what a player meets — biomes,
 * layouts, distinct monsters, pack shapes, elite rates — over many runs, so a
 * conversation about "every run feels the same" has numbers in it.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.varietyaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/variety-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
console.log(JSON.stringify(JSON.parse(lines[lines.length - 1]), null, 1));
