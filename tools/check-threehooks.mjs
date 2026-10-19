/**
 * Are the game's hooks into three.js still there?
 *
 *   node tools/check-threehooks.mjs
 *
 * Static, no browser. The game reaches inside three.js in a few places
 * (src/core/ThreeHooks.ts lists them all). A new three.js can rename or drop
 * any of them without an error, so this fails when:
 *
 *  - three or @types/three is not pinned to one exact version in package.json
 *  - the installed three.js is not the release the hooks were checked on
 *    (`THREE_TESTED`)
 *  - a hook's three.js file is gone, or no longer holds the words it needs
 *  - a hook checked on three's classes does not find them (run here in Node)
 *  - the game reports a hook (`hookSeen`) that is not in the list, a hook
 *    checked "in use" never reports itself, or a hook names a game file that
 *    is gone
 *
 * Every browser check also fails on a startup self-test that finds a hook
 * missing (tools/lib/game.mjs).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const THREE_DIR = path.join(ROOT, 'node_modules/three');
const fails = [];
const read = (p) => readFileSync(p, 'utf8');

// --- the pin -----------------------------------------------------------------
const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
for (const name of ['three', '@types/three']) {
  const v = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
  if (!v) fails.push(`package.json does not list ${name}`);
  else if (!/^\d+\.\d+\.\d+$/.test(v)) fails.push(`package.json gives ${name} as "${v}", not one exact version`);
}
const installed = JSON.parse(read(path.join(THREE_DIR, 'package.json'))).version;
const pinned = pkg.dependencies?.three ?? pkg.devDependencies?.three;
if (installed !== pinned) fails.push(`three ${installed} is installed but package.json pins ${pinned}: run npm install`);

// --- the release -------------------------------------------------------------
const { HOOKS, THREE_TESTED, selfTest } = await import('../src/core/ThreeHooks.ts');
const revision = read(path.join(THREE_DIR, 'src/constants.js')).match(/REVISION = '(\d+)'/)?.[1];
if (revision !== THREE_TESTED) fails.push(`three.js is r${revision}, but the hooks were checked on r${THREE_TESTED}: check each hook below, then raise THREE_TESTED`);

// --- each hook's words in three.js ---------------------------------------------
for (const h of HOOKS) {
  const file = path.join(THREE_DIR, h.theirs);
  if (!existsSync(file)) {
    fails.push(`${h.id}: three.js has no ${h.theirs}`);
    continue;
  }
  const src = read(file);
  for (const w of h.needs) if (!src.includes(w)) fails.push(`${h.id}: ${h.theirs} no longer has "${w}"`);
  for (const ours of h.ours.split(',').map((s) => s.trim())) {
    if (!existsSync(path.join(ROOT, ours))) fails.push(`${h.id}: names ${ours}, which is gone`);
  }
}

// --- three's classes, as the game sees them --------------------------------------
const report = selfTest(null);
for (const m of report.missing) fails.push(`self-test: ${m}`);

// --- every hookSeen call is listed, and every "in use" hook reports --------------
const ids = new Set(HOOKS.map((h) => h.id));
const reported = new Set();
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(f) && !p.endsWith(path.join('core', 'ThreeHooks.ts'))) {
      const src = read(p);
      for (const m of src.matchAll(/hookSeen\(\s*'([^']+)'/g)) {
        reported.add(m[1]);
        if (!ids.has(m[1])) fails.push(`${path.relative(ROOT, p)}: hookSeen('${m[1]}') is not in HOOKS`);
      }
      if (/hookSeen\(\s*[^'\s]/.test(src)) fails.push(`${path.relative(ROOT, p)}: hookSeen is called without a quoted id, so it cannot be checked`);
    }
  }
};
walk(path.join(ROOT, 'src'));
for (const h of HOOKS) if (h.check.on === 'use' && !reported.has(h.id)) fails.push(`${h.id}: checked in use, but nothing calls hookSeen('${h.id}', ...)`);

console.log(`three.js ${installed} (r${revision}), hooks checked on r${THREE_TESTED}: ${HOOKS.length} hooks, ${reported.size} report themselves`);
if (fails.length) {
  for (const f of fails) console.log(`FAIL  ${f}`);
  process.exit(1);
}
console.log('ok    every hook is in place');
