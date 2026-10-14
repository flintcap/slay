/**
 * Is every name a player reads our own, and used only once?
 *
 *   node tools/check-names.mjs
 *
 * Covers uniques, sets and their pieces, bosses, floor wardens, runes,
 * runewords and named rares. The borrowed list lives in
 * `tools/borrowed-names.ts`; see `tools/names-entry.ts`.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.namesaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/names-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { count, groups, problems } = JSON.parse(lines[lines.length - 1]);

console.log(`${count} names read: ${groups.map(([g, n]) => `${n} ${g}`).join(', ')}`);
if (problems.length) {
  console.log('\nPROBLEMS');
  for (const p of problems) console.log('  - ' + p);
  console.log(`\nFAILED: ${problems.length} problem(s).`);
  process.exit(1);
}
console.log('\nOK: every name is our own, and no name is used twice.');
