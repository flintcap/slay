/**
 * Can every class actually equip what it starts with?
 *
 *   node tools/check-starter.mjs
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.starteraudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/starter-entry.ts'),
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
const raw = execFileSync('node', ['--input-type=module', '-e', shim], { encoding: 'utf8' });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { rows } = JSON.parse(lines[lines.length - 1]);

const pad = (s, n) => String(s).padEnd(n);
console.log(`${pad('class', 13)} ${pad('item', 24)} ${pad('lvl', 4)} ${pad('str', 8)} ${pad('dex', 8)} status`);
for (const r of rows) {
  console.log(
    `${pad(r.cls, 13)} ${pad(r.name, 24)} ${pad(r.levelReq, 4)} ${pad(`${r.strReq}/${r.str}`, 8)} ${pad(`${r.dexReq}/${r.dex}`, 8)} ${r.ok ? 'ok' : `CANNOT EQUIP — ${r.why}`}`,
  );
}
const bad = rows.filter((r) => !r.ok);
console.log(bad.length === 0 ? '\nOK — every class can equip its own starting gear.' : `\nFAILED — ${bad.length} unusable starting items.`);
process.exit(bad.length === 0 ? 0 : 1);
