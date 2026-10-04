/**
 * Does the front end still agree with the data it shows?
 *
 * Checks the class showcase kits against the item bases, the skill previews
 * against the skill list, and the character-name rules against a table of
 * names that must be accepted or refused. Static: no browser, a few seconds.
 *
 *   node tools/check-menus.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.menusaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/menus-entry.ts'),
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
let raw;
try {
  raw = execFileSync('node', ['--input-type=module', '-e', shim], { encoding: 'utf8' });
} finally {
  rmSync(OUT, { recursive: true, force: true });
}
const lines = raw.trim().split('\n');
const res = JSON.parse(lines[lines.length - 1]);
console.log(`classes ${res.classes}, name cases ${res.cases}, tips ${res.tips}`);
if (res.problems.length) {
  for (const p of res.problems) console.log('FAIL ' + p);
  process.exit(1);
}
console.log('ok   front-end data checks pass');
