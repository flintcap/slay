/**
 * Does every worn set piece and unique show the colours its icon shows?
 *
 *   node tools/check-iconmatch.mjs [--only=<id part>]
 *
 * Builds each body piece twice in Node (no browser): the icon model and the
 * piece grown on a hero. Fails when the icon's main colour is missing from
 * the worn piece, or the other way round. See `tools/iconmatch-entry.ts`.
 * Takes a few minutes: every piece is grown on a real body.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.iconmatchaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/iconmatch-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs'), ...process.argv.slice(2)], { encoding: 'utf8', maxBuffer: 1 << 28 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { built, rows, problems } = JSON.parse(lines[lines.length - 1]);

const low = [...rows].sort((a, b) => Math.min(a.iconInWorn, a.wornInIcon) - Math.min(b.iconInWorn, b.wornInIcon))[0];
console.log(`${built} body pieces built as icon and as worn`);
if (low) console.log(`closest call: ${low.id}, ${Math.round(Math.min(low.iconInWorn, low.wornInIcon) * 100)}% shared`);
if (problems.length) {
  console.log('\nPROBLEMS');
  for (const p of problems) console.log('  - ' + p);
  console.log(`\nFAILED: ${problems.length} problem(s).`);
  process.exit(1);
}
console.log('\nOK: every worn piece shows its icon\'s colours.');
