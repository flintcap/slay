/**
 * Can the right-click skill ever end up on the hotbar?
 *
 * Reported three times, because two places had to agree and only one did.
 * Static, so it costs a second.
 *
 *   node tools/check-hotbar.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.hotbaraudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/hotbar-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const shim = `
globalThis.window = { setTimeout, clearTimeout, addEventListener(){}, localStorage: { getItem: () => null, setItem(){}, removeItem(){} } };
globalThis.localStorage = globalThis.window.localStorage;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener(){} };
await import(${JSON.stringify(path.join(OUT, 'e.mjs'))});
`;
const raw = execFileSync('node', ['--input-type=module', '-e', shim], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { rows } = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('class', 13)} ${pad('scenario', 36)} ${pad('right click', 16)} bar`);
for (const r of rows) {
  const bar = r.hotbar.filter(Boolean).join(', ') || '(empty)';
  console.log(`${pad(r.cls, 13)} ${pad(r.scenario, 36)} ${pad(r.primary ?? '-', 16)} ${bar}${r.overlap ? '   <-- OVERLAP' : ''}`);
}

const bad = rows.filter((r) => r.overlap);
console.log(
  bad.length === 0
    ? '\nOK — the right-click skill is never on the hotbar, in any shape.'
    : `\nFAILED — ${bad.length} of ${rows.length} cases put it in both.`,
);
process.exit(bad.length === 0 ? 0 : 1);
