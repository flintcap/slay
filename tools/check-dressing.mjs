/**
 * Is every zone dressed as its own biome, lit, and free of props hanging on
 * thin air?
 *
 *   node tools/check-dressing.mjs
 *
 * Headless. Generates real runs and fails on: a wall prop outdoors that is not
 * on a ruin (a torch floating at the foot of a tree line), a chest whose model
 * does not match its tier, and a vault chest with no lever to open it. Prints
 * per biome how densely it is lit and dressed, and warns about zones with no
 * light and kinds placed that the zone's dressing does not name.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.dressing');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/dressing-entry.ts'), outDir: OUT, rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const d = JSON.parse(lines[lines.length - 1]);

console.log(`levels ${d.levels}`);
console.log('biome                 zones  lights/100  props/100  detail/100  wall/100  dark  top kinds');
for (const r of d.rows.sort((a, b) => a.biome.localeCompare(b.biome))) {
  const per = (n) => ((n / Math.max(1, r.floor)) * 100).toFixed(1).padStart(9);
  const top = Object.entries(r.kinds)
    .filter(([k]) => !k.endsWith('Seal'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k)
    .join(' ');
  console.log(`${r.biome.padEnd(20)} ${String(r.zones).padStart(6)} ${per(r.lights)}  ${per(r.clutter)}  ${per(r.detail)}  ${per(r.wall)}  ${String(r.dark).padStart(4)}  ${top}`);
}
for (const w of d.warns.slice(0, 20)) console.log(`warn  ${w}`);
const fails = [...new Set(d.fails)];
for (const f of fails.slice(0, 30)) console.log(`FAIL  ${f}`);
console.log(fails.length ? `FAIL (${fails.length})` : 'OK');
process.exit(fails.length ? 1 : 0);
