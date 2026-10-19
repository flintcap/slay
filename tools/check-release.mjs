/**
 * The release lock holds: a release build (`--mode release`, see
 * tools/lib/build-info.mjs) has no developer tools, no debug commands and no
 * test scenes in it. Builds both release flavours (the multi-file game and the
 * one-page artifact) into a scratch folder and reads every script they emit.
 *
 *   node tools/check-release.mjs
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.relaudit');
rmSync(OUT, { recursive: true, force: true });

const flavours = [
  { name: 'game', args: [] },
  { name: 'page', args: ['--config', 'vite.config.single.ts'] },
];

/** Words only the dev-only code has: the debug handle's commands, the studio scene. */
const MARKERS = ['makeCharacter', 'fillInventory', 'giveTrinket', 'revealMap', 'wearableWithout', 'inventoryOpenCost', 'positionRepairs', 'ShowcaseScene'];
/** The handles themselves: `window.SLAY = {...}` and `window.SLAY_STORY = {...}`. */
const HANDLES = [/\bSLAY\s*=\s*\{/, /\bSLAY_STORY\s*=\s*\{/];

const fails = [];
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f));
    else out.push(f);
  }
  return out;
}

for (const fl of flavours) {
  const dir = path.join(OUT, fl.name);
  execFileSync('npx', ['vite', 'build', ...fl.args, '--mode', 'release', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const files = walk(dir);
  const scripts = files.filter((f) => /\.(js|mjs|html)$/.test(f));
  let bytes = 0;
  for (const f of files) {
    const base = path.basename(f);
    if (/^(debug|shifterDebug|ShowcaseScene)[-.]/.test(base)) fails.push(`${fl.name}: dev-only file shipped: ${base}`);
  }
  for (const f of scripts) {
    const src = readFileSync(f, 'utf8');
    bytes += statSync(f).size;
    const rel = path.relative(dir, f);
    for (const m of MARKERS) if (src.includes(m)) fails.push(`${fl.name}: ${rel} holds dev-only code ("${m}")`);
    for (const h of HANDLES) if (h.test(src)) fails.push(`${fl.name}: ${rel} sets a debug handle (${h.source})`);
    if (/__SLAY_[A-Z]+__/.test(src)) fails.push(`${fl.name}: ${rel} has an unstamped build value`);
  }
  console.log(`${fl.name}: ${scripts.length} scripts, ${(bytes / 1024 / 1024).toFixed(1)} MB read`);
}
rmSync(OUT, { recursive: true, force: true });

if (fails.length === 0) console.log('OK — release builds carry no developer tools, debug handle or test scenes.');
else {
  for (const f of fails) console.log(`FAIL ${f}`);
  process.exit(1);
}
