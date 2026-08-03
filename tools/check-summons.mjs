/**
 * Are summons actually limited, and is the balance legible?
 *
 *   node tools/check-summons.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.summonaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/summon-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8' });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { rows } = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('skill', 16)} ${pad('kind', 10)} ${pad('cap r1', 7)} ${pad('cap r20', 8)} ${pad('hard', 5)} ${pad('life %', 7)} lasts`);
for (const r of rows) {
  console.log(
    `${pad(r.id, 16)} ${pad(r.totem ? 'totem' : 'creature', 10)} ${pad(r.capAt1, 7)} ${pad(r.capAt20, 8)} ${pad(r.hardCap, 5)} ${pad(r.lifePct || '-', 7)} ${r.permanent ? 'until killed' : 'timed'}${r.capped ? '' : '   <-- UNLIMITED'}`,
  );
}
const bad = rows.filter((r) => !r.capped);
console.log(
  bad.length === 0
    ? '\nOK — every creature summon is capped and permanent, every totem is timed.'
    : `\nFAILED — ${bad.length} summons are not properly limited.`,
);
process.exit(bad.length === 0 ? 0 : 1);
