/**
 * Does the UI scale reach everything?
 *
 *   node tools/check-uiscale.mjs
 *
 * Static, no browser. The menus and the HUD are drawn bigger or smaller with
 * CSS `zoom` on `#ui` (src/core/UiScale.ts). Inside that layer one CSS pixel
 * is not one screen pixel, so this fails when:
 *
 *  - `#ui` stops being the scaled size container `ui`, or the HUD and the
 *    minimap lose their own scales
 *  - a UI stylesheet or inline style sizes something by the window with
 *    `vw`/`vh` (use `cqw`/`cqh`) or changes layout with a size `@media`
 *    query (use `@container ui`): both measure screen pixels
 *  - UI code reads `window.innerWidth`/`innerHeight` outside the layers
 *    that cover the screen pixel for pixel (use `uiWidth()`/`uiHeight()`)
 *  - a full-screen overlay that is drawn pixel for pixel stops undoing the
 *    scale
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const UI = path.join(ROOT, 'src/ui');
const fails = [];
const read = (p) => readFileSync(p, 'utf8');
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
const stripTsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const lineOf = (s, i) => s.slice(0, i).split('\n').length;

// --- the layer ----------------------------------------------------------------
const styles = stripCssComments(read(path.join(UI, 'styles.css')));
const rule = (sel) => {
  const i = styles.search(new RegExp(`(^|\\n)${sel.replace(/[.#]/g, '\\$&')}\\s*\\{`));
  return i < 0 ? '' : styles.slice(i, styles.indexOf('}', i));
};
const uiRule = rule('#ui');
if (!/zoom:\s*var\(--ui-scale/.test(uiRule)) fails.push('#ui is not scaled by --ui-scale');
if (!/container:\s*ui\s*\/\s*size/.test(uiRule)) fails.push('#ui is not the size container `ui`');
if (!/zoom:\s*var\(--hud-scale/.test(rule('.hud'))) fails.push('.hud is not scaled by --hud-scale');
if (!/--minimap-scale/.test(rule('.minimap'))) fails.push('.minimap is not sized by --minimap-scale');
for (const sel of ['.combat-text', '.map-overlay']) {
  if (!new RegExp(`${sel.replace('.', '\\.')}[^{]*\\{[^}]*zoom:\\s*calc\\(1\\s*/\\s*var\\(--ui-scale`).test(styles)) {
    fails.push(`${sel} covers the screen pixel for pixel but does not undo the UI scale`);
  }
}

// --- stylesheets ----------------------------------------------------------------
let cssFiles = 0;
for (const f of readdirSync(UI).filter((n) => n.endsWith('.css'))) {
  cssFiles++;
  const css = stripCssComments(read(path.join(UI, f)));
  for (const m of css.matchAll(/\d(vw|vh|vmin|vmax|dvw|dvh|svw|svh|lvw|lvh)\b/g)) {
    fails.push(`${f}:${lineOf(css, m.index)} uses ${m[1]}: use cqw/cqh so it follows the UI scale`);
  }
  for (const m of css.matchAll(/@media[^{]*\b(width|height|aspect-ratio)\b[^{]*\{/g)) {
    fails.push(`${f}:${lineOf(css, m.index)} has a size @media query: use @container ui`);
  }
}

// --- code -----------------------------------------------------------------------
/** Layers that cover the screen pixel for pixel, so the window's own size is right. */
const SCREEN_LAYERS = new Set(['CombatText.ts', 'MapOverlay.ts']);
const walk = (dir, out = []) => {
  for (const n of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, n.name);
    if (n.isDirectory()) walk(p, out);
    else if (n.name.endsWith('.ts')) out.push(p);
  }
  return out;
};
let tsFiles = 0;
for (const p of walk(UI)) {
  tsFiles++;
  const name = path.basename(p);
  const src = stripTsComments(read(p));
  for (const m of src.matchAll(/['"`][^'"`\n]*\d(vw|vh)\b[^'"`\n]*['"`]/g)) {
    fails.push(`${path.relative(ROOT, p)}:${lineOf(src, m.index)} sets a ${m[1]} length: use cqw/cqh`);
  }
  if (SCREEN_LAYERS.has(name)) continue;
  for (const m of src.matchAll(/window\.inner(Width|Height)/g)) {
    fails.push(`${path.relative(ROOT, p)}:${lineOf(src, m.index)} reads window.inner${m[1]}: use ui${m[1]}() from core/UiScale`);
  }
}

console.log(`${cssFiles} stylesheets and ${tsFiles} UI modules read`);
for (const f of fails) console.log(`FAIL ${f}`);
console.log(fails.length ? `\n${fails.length} problems` : '\nOK — the UI scale reaches every menu, the HUD and the minimap.');
process.exit(fails.length ? 1 : 0);
