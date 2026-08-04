/**
 * How full does a floor actually feel?
 *
 *   node tools/check-density.mjs
 *
 * Props and monsters per hundred walkable tiles, plus the share of the floor
 * with nothing within three tiles of it — the number that matches "the maps
 * feel empty" better than any total does.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.densityaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/density-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const d = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
const table = (title, rows) => {
  console.log(`\n=== ${title} ===`);
  console.log(
    `${pad('', 14)} ${pad('tiles', 7)} ${pad('props', 7)} ${pad('/100', 7)} ${pad('mobs', 6)} ${pad('/100', 7)} bare`,
  );
  for (const r of rows) {
    console.log(
      `${pad(r.key, 14)} ${pad(r.tiles, 7)} ${pad(r.props, 7)} ${pad(r.propsPer100, 7)} ${pad(r.monsters, 6)} ${pad(r.monstersPer100, 7)} ${r.barePct}%`,
    );
  }
};
console.log(`${d.floors} floors`);
table('by layout', d.byLayout);
table('by biome', d.byBiome);
table('by depth', d.byDepth);
