/**
 * Are boss fights fair? The fair-fight rules (src/sim/FairFight.ts).
 *
 *   node tools/check-fair.mjs
 *
 * Hit cap, warning time, hold limit, fumble costs and the fight clock. See
 * tools/fair-entry.ts.
 */
import { build } from 'vite';
import { rmSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.fairaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/fair-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs'), ...process.argv.slice(2)], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { cases } = JSON.parse(lines[lines.length - 1]);
// The wiring: the dungeon marks every boss blow, its arena's and its traps', with the cap.
const scene = readFileSync(path.join(ROOT, 'src/scenes/DungeonScene.ts'), 'utf8');
const wired = /packet\.fair = bossHitCap\(this\.run\.depth\)/.test(scene) && /isBossSource\(packet\.source\)/.test(scene);
cases.push({ name: 'wired: the dungeon marks boss blows with the cap', ok: wired, detail: 'DungeonScene damagePlayer' });

for (const c of cases) {
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(44)} ${c.detail}`);
}
const bad = cases.filter((c) => !c.ok);
console.log(bad.length === 0 ? '\nOK — no boss one-shots, holds you long, or kills you for a fumble.' : `\nFAILED — ${bad.length} of ${cases.length}.`);
process.exit(bad.length === 0 ? 0 : 1);
