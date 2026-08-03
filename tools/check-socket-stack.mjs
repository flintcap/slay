/**
 * Does socketing a rune out of a stack spend one, or the whole stack?
 *
 * Reported: four El runes, one set into a helm, all four gone. `insertGem`
 * never touched the inventory; the caller did, with a function that nulls the
 * whole slot. This is the regression guard.
 *
 *   node tools/check-socket-stack.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.sockaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/socket-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});

// The save manager reaches for `window` on touch, so the simulation needs the
// thinnest possible browser to run under Node.
const shim = `
globalThis.window = { setTimeout, clearTimeout, addEventListener(){}, localStorage: { getItem: () => null, setItem(){}, removeItem(){} } };
globalThis.localStorage = globalThis.window.localStorage;
globalThis.document = { createElement: () => ({ getContext: () => null, style: {} }), addEventListener(){} };
await import(${JSON.stringify(path.join(OUT, 'e.mjs'))});
`;
const raw = execFileSync('node', ['--input-type=module', '-e', shim], { encoding: 'utf8' });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const d = JSON.parse(lines[lines.length - 1]);

console.log(`inserted:      ${d.inserted}${d.reason ? `  (${d.reason})` : ''}`);
console.log(`socket filled: ${d.socketFilled ?? 'none'}`);
console.log(`stack before:  ${d.before}`);
console.log(`stack after:   ${d.after}`);

const ok = d.inserted && d.socketFilled && d.after === d.before - 1;
console.log(ok ? '\nOK — socketing spends exactly one unit of the stack.' : '\nFAILED — the stack did not lose exactly one.');
process.exit(ok ? 0 : 1);
