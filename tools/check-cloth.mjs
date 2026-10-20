/**
 * Do the bosses' capes and banners make sound cloth?
 *
 *   node tools/check-cloth.mjs
 *
 * Sculpts every boss and warden look as the game does for a boss and checks
 * each cloth sheet: the grid, what holds it, what may swing, the bones, and
 * that its rest shape hangs clear of what it falls against. See
 * `tools/cloth-entry.ts`.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.clothaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/cloth-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { looks, sheets, points, kinds, problems } = JSON.parse(lines[lines.length - 1]);

console.log(`${sheets} cloth sheets on ${looks} boss looks (${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(', ')}), ${points} points`);
if (!sheets) problems.push('no boss wears any cloth');
if (problems.length) {
  for (const p of problems) console.log(`  FAIL ${p}`);
  process.exit(1);
}
console.log('OK');
