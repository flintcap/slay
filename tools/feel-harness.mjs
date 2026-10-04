/**
 * Shared runner for the feel stream's static checks.
 *
 * Bundles a TypeScript entry for Node with `vite build --ssr`, runs it under a
 * small browser shim (enough DOM for canvas-built textures to import), and
 * returns the JSON the entry prints on its last line.
 */
import { build } from 'vite';
import { rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

export async function runEntry(entry, outDirName) {
  const OUT = path.join(ROOT, outDirName);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  await build({
    configFile: false,
    logLevel: 'error',
    root: ROOT,
    build: {
      ssr: path.join(ROOT, entry),
      outDir: OUT,
      rollupOptions: { output: { entryFileNames: 'e.mjs' } },
      minify: false,
    },
  });
  const shim = `
const noop = () => {};
const grad = { addColorStop: noop };
const ctx2d = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'getImageData' || k === 'createImageData') return (_x, _y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h });
    if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'canvas') return { width: 1, height: 1 };
    return noop;
  },
  set: () => true,
});
const canvas = () => ({ width: 1, height: 1, style: {}, getContext: () => ctx2d, toDataURL: () => '', addEventListener: noop });
globalThis.window = {
  setTimeout, clearTimeout, setInterval, clearInterval, innerWidth: 1280, innerHeight: 720,
  addEventListener: noop, removeEventListener: noop, devicePixelRatio: 1,
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
};
globalThis.localStorage = globalThis.window.localStorage;
globalThis.document = { createElement: canvas, addEventListener: noop, removeEventListener: noop, hidden: false, body: { appendChild: noop } };
await import(${JSON.stringify(path.join(OUT, 'e.mjs'))});
`;
  let raw;
  try {
    raw = execFileSync('node', ['--input-type=module', '-e', shim], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
  } finally {
    rmSync(OUT, { recursive: true, force: true });
  }
  const lines = raw.trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}
