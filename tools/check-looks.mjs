/**
 * Does every unique look like itself?
 *
 *   node tools/check-looks.mjs
 *
 * Fails when two uniques of one kind share four or more look axes (base,
 * main, second and trim colours, lead decoration, finish, aura), or when a
 * unique glows past its tier's budget. See `tools/looks-entry.ts`.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.looksaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/looks-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { uniques, kinds, pairs, problems } = JSON.parse(lines[lines.length - 1]);

console.log(`${uniques} uniques in ${kinds} kinds, ${pairs} pairs compared`);
if (problems.length) {
  console.log('\nPROBLEMS');
  for (const p of problems) console.log('  - ' + p);
  console.log(`\nFAILED: ${problems.length} problem(s).`);
  process.exit(1);
}
console.log('\nOK: every unique looks like itself, and none glows past its tier.');
