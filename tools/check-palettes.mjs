/**
 * Does every material key the world asks for actually exist?
 *
 *   node tools/check-palettes.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.paletteaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false, logLevel: 'error', root: ROOT,
  build: { ssr: path.join(ROOT, 'tools/palette-entry.ts'), outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } }, minify: false },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { keys } = JSON.parse(lines[lines.length - 1]);
const known = new Set(keys);

// Every material key the world and the item tables ask for.
const SOURCES = ['src/world/Props.ts', 'src/world/Biomes.ts', 'src/data/itemBases.ts'];
const FAMILIES = /^(stone|metal|wood|cloth|leather|bone|crystal|flesh|ground)\./;
const asked = new Map();
for (const file of SOURCES) {
  const src = readFileSync(path.join(ROOT, file), 'utf8');
  for (const m of src.matchAll(/'([a-z]+\.[a-zA-Z]+)'/g)) {
    const key = m[1];
    if (!FAMILIES.test(key)) continue;
    if (!asked.has(key)) asked.set(key, new Set());
    asked.get(key).add(file);
  }
}
const rows = [...asked.entries()].map(([key, files]) => ({ key, files: [...files], ok: known.has(key) }));
const bad = rows.filter((r) => !r.ok);
console.log(`${keys.length} palettes in the registry, ${rows.length} keys asked for\n`);
for (const r of bad) console.log(`  MISSING  ${r.key}   (${r.files.join(', ')})`);
console.log(
  bad.length === 0
    ? 'OK — every material key the world asks for is a real palette.'
    : `\nFAILED — ${bad.length} keys silently fall back to something else.`,
);
process.exit(bad.length === 0 ? 0 : 1);
