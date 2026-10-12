/**
 * The item grid: sizes, moves, swaps, sorting and old-save unpacking keep
 * every item and never overlap. See tools/grid-entry.ts.
 *
 *   node tools/check-grid.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.gridaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/grid-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { tabs, quarantined, fails } = JSON.parse(lines[lines.length - 1]);
console.log(`old save unpacked into ${tabs} vault tabs, ${quarantined} set aside`);
if (fails.length === 0) console.log('grid ok: nothing overlapped, nothing lost');
else {
  for (const f of fails.slice(0, 40)) console.log(`FAIL ${f}`);
  process.exit(1);
}
