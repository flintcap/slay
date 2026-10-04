/**
 * Can a damaged save ever lose the character?
 *
 *   node tools/check-save.mjs
 *
 * Runs the real save manager (src/core/Save.ts) under Node against an
 * in-memory store and throws every realistic kind of damage at it: truncated
 * writes, hand edits, a full disk, a second tab, a bad import, a newer build's
 * save, storage that throws on every call, and 400 randomly damaged saves.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.saveaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/save-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { cases } = JSON.parse(lines[lines.length - 1]);

for (const c of cases) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}${c.ok ? '' : `\n        ${c.detail}`}`);
const bad = cases.filter((c) => !c.ok).length;
console.log(
  bad === 0
    ? `\nOK — ${cases.length} cases: no damage to a save loses the character or crashes the game.`
    : `\nFAILED — ${bad} of ${cases.length} save-safety cases.`,
);
process.exit(bad === 0 ? 0 : 1);
