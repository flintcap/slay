/**
 * Is the game usable by more people than its designers?
 *
 *   node tools/check-access.mjs
 *
 * Static, no browser. Checks:
 *
 *  - the colour-blind rarity palette keeps every pair of rarities at least
 *    MIN_DE apart (CIELAB ΔE) under protanopia, deuteranopia and tritanopia,
 *    and every colour readable (4.5:1) on the panel background. The default
 *    palette is reported for comparison, not failed: it is the art direction.
 *  - key rebinding stays a permutation through thousands of random changes:
 *    no action without a key, no key with two actions, reserved keys never
 *    taken
 *  - the settings sanitiser clamps text size and rejects broken key maps
 *  - the wiring is still there: Input and the UI's hotkeys translate keys
 *    through `remapKey`, the camera reads its settings, every rebindable key
 *    is still read by the game, and the settings menu shows the sections
 *  - how much UI text is sized in raw pixels and so ignores the text-size
 *    setting (reported; it belongs to the hud and menus streams)
 */
import { build } from 'vite';
import { rmSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { closestPairs, contrast } from './lib/color.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.accessaudit');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  configFile: false,
  logLevel: 'error',
  root: ROOT,
  build: {
    ssr: path.join(ROOT, 'tools/access-entry.ts'),
    outDir: OUT,
    rollupOptions: { output: { entryFileNames: 'e.mjs' } },
    minify: false,
  },
});
const raw = execFileSync('node', [path.join(OUT, 'e.mjs')], { encoding: 'utf8', maxBuffer: 1 << 26 });
rmSync(OUT, { recursive: true, force: true });
const lines = raw.trim().split('\n');
const { steps, problems, palettes, rebindable } = JSON.parse(lines[lines.length - 1]);

const MIN_DE = 20;
const PANEL_BG = 0x14110d;
const fails = [...problems];

console.log('rarity colours, closest pair under each kind of colour vision (ΔE, higher is better):');
for (const [name, pal] of Object.entries(palettes)) {
  const r = closestPairs(pal);
  const row = Object.entries(r)
    .map(([v, { min, pair }]) => `${v} ${min.toFixed(1)} (${pair})`)
    .join('  ');
  console.log(`  ${name.padEnd(11)} ${row}`);
  if (name === 'colorblind') {
    for (const [v, { min, pair }] of Object.entries(r)) {
      if (min < MIN_DE) fails.push(`colour-blind palette: ${pair} only ${min.toFixed(1)} apart for ${v}`);
    }
    for (const [k, hex] of Object.entries(pal)) {
      const c = contrast(hex, PANEL_BG);
      if (c < 4.5) fails.push(`colour-blind ${k} is ${c.toFixed(2)}:1 on the panel, under 4.5:1`);
    }
  }
}

// --- wiring ------------------------------------------------------------------
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const walk = (dir, out = []) => {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(n)) out.push(p);
  }
  return out;
};
const srcFiles = walk(path.join(ROOT, 'src')).filter((p) => !/core[\\/]Access\.ts$|AccessibilitySettings\.ts$/.test(p));
const src = srcFiles.map((p) => readFileSync(p, 'utf8')).join('\n');

const wiring = [
  ['src/core/Input.ts', /remapKey\(e\.code\)/, 'Input translates key presses through remapKey'],
  ['src/ui/UIRoot.ts', /remapKey\(e\.code\)/, 'panel hotkeys translate through remapKey'],
  ['src/fx/CameraRig.ts', /applySettings\(save\.settings\)/, 'the camera reads its settings (distance, shake, reduced motion)'],
  ['src/main.ts', /applyAccessibility\(save\.settings\)/, 'boot applies accessibility settings'],
  ['src/ui/SettingsPanel.ts', /accessibilitySection\(/, 'settings menu shows the Accessibility section'],
  ['src/ui/SettingsPanel.ts', /keybindSection\(/, 'settings menu shows the Key bindings section'],
];
for (const [file, re, what] of wiring) {
  let ok = false;
  try {
    ok = re.test(read(file));
  } catch {}
  if (!ok) fails.push(`wiring lost: ${what} (${file})`);
}
// A rebindable key the game no longer reads would show a binding that does nothing.
for (const a of rebindable) {
  if (!new RegExp(`['"\`]${a.code}['"\`]|\\b${a.code}\\s*:`).test(src)) {
    fails.push(`"${a.label}" is rebindable on ${a.code}, but nothing in src reads ${a.code} any more`);
  }
}

// --- raw pixel text (informational) ------------------------------------------
const cssFiles = readdirSync(path.join(ROOT, 'src/ui')).filter((f) => f.endsWith('.css'));
let rawPx = 0;
let tokens = 0;
for (const f of cssFiles) {
  const css = read(`src/ui/${f}`);
  rawPx += (css.match(/font-size:\s*\d+(\.\d+)?px/g) ?? []).length;
  tokens += (css.match(/font-size:\s*(var\(--fs-|calc\([^)]*--text-scale)/g) ?? []).length;
}

console.log(`\nkey rebinding: ${steps} random changes, every one a clean swap`);
console.log(`text size: ${tokens} font sizes follow the setting, ${rawPx} are raw pixels and do not`);
if (fails.length) {
  console.log('');
  for (const f of fails) console.log(`  FAIL ${f}`);
}
console.log(
  fails.length === 0
    ? '\nOK — colour-blind colours are distinct for every vision type, keys rebind safely, and every setting is wired.'
    : `\nFAILED — ${fails.length} accessibility problems.`,
);
process.exit(fails.length === 0 ? 0 : 1);
