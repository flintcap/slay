/**
 * Scratch: search for a rarity palette every vision type can tell apart.
 *
 *   node tools/lib/try-palettes.mjs '<json of {name: {rarity: "rrggbb"}}>' [--search]
 *
 * With --search, hill-climbs from the first palette, keeping each hue inside a
 * band around where it started so "magic" stays blue and "rare" stays yellow.
 */
import { closestPairs, contrast } from './color.mjs';

const BG = 0x14110d;
const score = (p) => {
  const r = closestPairs(p);
  const minC = Math.min(...Object.values(p).map((h) => contrast(h, BG)));
  const worst = Math.min(...Object.values(r).map((v) => v.min));
  return { r, minC, worst, s: worst - (minC < 4.5 ? (4.5 - minC) * 40 : 0) };
};
const show = (n, p) => {
  const { r, minC } = score(p);
  console.log(
    n.padEnd(8),
    Object.entries(r).map(([k, v]) => `${k.slice(0, 5)} ${v.min.toFixed(1)} ${v.pair}`).join(' | '),
    `contrast ${minC.toFixed(1)}`,
  );
};
const parse = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, parseInt(v, 16)]));
const cands = JSON.parse(process.argv[2]);
for (const [n, p] of Object.entries(cands)) show(n, parse(p));

if (process.argv.includes('--search')) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const start = parse(Object.values(cands)[0]);
  const toRgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const fromRgb = ([r, g, b]) => (r << 16) | (g << 8) | b;
  let best = { ...start };
  let bestS = score(best).s;
  for (let it = 0; it < 20000; it++) {
    const next = { ...best };
    const k = Object.keys(next).filter((x) => x !== 'normal')[Math.floor(rnd() * 6)];
    const rgb = toRgb(next[k]).map((v, i) => Math.max(0, Math.min(255, v + Math.round((rnd() - 0.5) * 40))));
    // Stay near the starting colour so the rarity keeps its identity.
    const o = toRgb(start[k]);
    if (rgb.some((v, i) => Math.abs(v - o[i]) > 70)) continue;
    next[k] = fromRgb(rgb);
    const s = score(next).s;
    if (s > bestS) {
      best = next;
      bestS = s;
    }
  }
  show('best', best);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.toString(16).padStart(6, '0')]))));
}
