/**
 * Quest markers: who shows a "?", who shows a "!", who shows nothing, as
 * work is offered, taken, done and handed in. Real contract and bounty
 * code, real marker layer, no browser.
 *
 *   node tools/check-markers.mjs
 *
 * See tools/markers-entry.ts for the cases.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.markersaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/markers-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs'), ...process.argv.slice(2)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { cases } = JSON.parse(lines[lines.length - 1]);

for (const c of cases) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(62)} ${c.detail}`);
}
const bad = cases.filter((c) => !c.ok);
console.log(bad.length === 0 ? `\nOK — ${cases.length} marker cases pass.` : `\nFAILED — ${bad.length} of ${cases.length}.`);
process.exit(bad.length === 0 ? 0 : 1);
