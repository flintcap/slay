/**
 * UI design tokens stay the one source of colour, spacing, radius and motion.
 *
 *   node tools/check-uitokens.mjs
 *
 * Fails when a stylesheet in src/ui/ brings back a raw value the tokens cover
 * (an rgba() of a palette colour, #000, a spacing step, a radius step or a
 * transition time), uses a custom property that nothing defines, or sets a
 * small font size in raw pixels (it would ignore the Text size setting:
 * use a --fs-* token or calc(Npx * var(--text-scale, 1))).
 * Lines inside inline SVG data URIs are skipped: CSS variables do not reach
 * into those.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const UI = path.join(ROOT, 'src/ui');
const css = readdirSync(UI).filter((f) => f.endsWith('.css'));

const CHANNELS = new Set([
  '0,0,0', '201,162,39', '214,178,96', '224,80,60', '255,255,255', '232,190,96',
  '255,232,186', '79,191,106', '147,133,108', '107,95,76', '242,217,137',
]);
const SPACE = new Set(['4px', '6px', '9px', '13px', '18px', '26px', '38px']);
const RADIUS = new Set(['2px', '3px', '4px', '5px', '6px', '99px', '999px']);

// Custom properties set from code (style.setProperty / inline style strings).
const defined = new Set();
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|css)$/.test(e.name)) {
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) defined.add(m[1]);
      for (const m of src.matchAll(/setProperty\(\s*[`'"](--[a-zA-Z0-9-]+)/g)) defined.add(m[1]);
      for (const m of src.matchAll(/setProperty\(\s*`--([a-z]+)-\$\{/g)) defined.add(`--${m[1]}-*`);
    }
  }
};
walk(path.join(ROOT, 'src'));

const problems = [];
let checked = 0;
for (const f of css) {
  const lines = readFileSync(path.join(UI, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (line.includes('url(')) return;
    checked++;
    const at = `${f}:${i + 1}`;
    for (const m of line.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
      if (CHANNELS.has(`${m[1]},${m[2]},${m[3]}`)) problems.push(`${at} raw rgba of a palette colour: use rgb(var(--…-rgb) / a)`);
    }
    if (/#000(?![0-9a-fA-F])/.test(line)) problems.push(`${at} raw #000: use var(--shade)`);
    const fs = /font-size:\s*([0-9.]+)px\s*[;}]/.exec(line);
    if (fs && Number(fs[1]) < 48) problems.push(`${at} font-size ${fs[1]}px ignores Text size: use var(--fs-*) or calc(${fs[1]}px * var(--text-scale, 1))`);
    let m;
    if ((m = line.match(/^\s*(?:gap|row-gap|column-gap|padding|margin)(?:-[a-z]+)?:\s*([^;]+);/)) && !m[1].includes('(')) {
      for (const v of m[1].trim().split(/\s+/)) if (SPACE.has(v)) problems.push(`${at} raw spacing ${v}: use var(--s1…s7)`);
    }
    if ((m = line.match(/^\s*border-radius:\s*([^;]+);/)) && !m[1].includes('(')) {
      for (const v of m[1].trim().split(/\s+/)) if (RADIUS.has(v)) problems.push(`${at} raw radius ${v}: use var(--radius-*)`);
    }
    if ((m = line.match(/^\s*transition(?:-duration)?:\s*(.+);/))) {
      for (const g of m[1].split(/,(?![^(]*\))/)) {
        const t = g.includes("var(--dur") ? null : g.match(/\b(\d+)ms\b/);
        if (t && Number(t[1]) >= 80 && Number(t[1]) <= 950) problems.push(`${at} raw transition ${t[1]}ms: use var(--dur-1…5)`);
      }
    }
    for (const v of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*([,)])/g)) {
      if (v[2] === ',') continue; // has a fallback
      const name = v[1];
      const wild = name.replace(/^(--[a-z]+)-.*$/, '$1-*');
      if (!defined.has(name) && !defined.has(wild)) problems.push(`${at} ${name} is never defined`);
    }
  });
}

for (const p of problems.slice(0, 40)) console.log('  ' + p);
if (problems.length > 40) console.log(`  … and ${problems.length - 40} more`);
console.log(`${problems.length ? 'FAIL' : 'PASS'} uitokens: ${css.length} stylesheets, ${checked} lines, ${problems.length} problems`);
process.exit(problems.length ? 1 : 0);
