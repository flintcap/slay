/**
 * Entry point for `tools/check-looks.mjs`: no two uniques of one kind look
 * alike, and none glows past its tier's budget.
 *
 * Read from the finished look (`itemLook`), so it sees what the icon, the
 * drop and the worn piece all draw from, after the tier rules have run.
 */
import { UNIQUES } from '../src/data/uniques';
import { ITEM_BASES } from '../src/data/itemBases';
import { glowTierOf, tierGlowStrength, UNIQUE_DESIGNS } from '../src/art/items/Designs';
import { itemLook, type ItemLook } from '../src/art/ItemLook';

/** Colours closer than this (0..441 in RGB) read as the same. */
const SAME_COLOUR = 46;
/** Shared axes that make two uniques look alike. */
const TOO_MANY = 4;

const baseById = new Map(ITEM_BASES.map((b) => [b.id, b]));
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const near = (a: number, b: number): boolean => {
  const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2) < SAME_COLOUR;
};

type Row = { id: string; name: string; cat: string; base: string; L: ItemLook; glows: boolean };
const rows: Row[] = [];
const problems: string[] = [];
for (const u of UNIQUES) {
  const base = baseById.get(u.baseId);
  if (!base) continue;
  const L = itemLook({ baseId: u.baseId, rarity: u.rarity, uniqueId: u.id }, base.visual);
  const tier = glowTierOf(u.rarity, u.ilvl);
  const d = UNIQUE_DESIGNS[u.id];
  // The budget: what this tier may burn at, and only mythics and ancients wear an aura.
  const cap = tierGlowStrength(tier, Infinity);
  if (d?.glowStrength !== undefined && d.glowStrength > cap + 1e-6) problems.push(`${u.id} (${u.name}) asks for glow ${d.glowStrength}, its tier (${tier}) allows ${cap}`);
  if (tier !== 'full' && L.aura !== 'none') problems.push(`${u.id} (${u.name}) wears an aura on a ${tier} tier`);
  rows.push({ id: u.id, name: u.name, cat: base.category, base: u.baseId, L, glows: tier === 'full' });
}

/** The look axes two uniques can share. */
function shared(a: Row, b: Row): string[] {
  const s: string[] = [];
  if (a.base === b.base) s.push('base');
  if (near(a.L.colors.main, b.L.colors.main)) s.push('main');
  if (near(a.L.colors.second, b.L.colors.second)) s.push('second');
  // A charm draws no trim, but its carved mark always burns in its glow colour.
  if (a.cat !== 'charm' && near(a.L.colors.trim, b.L.colors.trim)) s.push('trim');
  if (a.cat === 'charm' && near(a.L.glowColor, b.L.glowColor)) s.push('glow');
  if (a.L.features[0] && a.L.features[0] === b.L.features[0]) s.push('feature');
  if (a.L.finish && a.L.finish === b.L.finish) s.push('finish');
  if (a.glows && b.glows && a.L.aura === b.L.aura) s.push('aura');
  return s;
}

let pairs = 0;
const worst: Array<{ a: string; b: string; axes: string[] }> = [];
const cats = [...new Set(rows.map((r) => r.cat))];
for (const c of cats) {
  const rs = rows.filter((r) => r.cat === c);
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    pairs++;
    const ax = shared(rs[i]!, rs[j]!);
    if (ax.length >= TOO_MANY) worst.push({ a: `${rs[i]!.id} (${rs[i]!.name})`, b: `${rs[j]!.id} (${rs[j]!.name})`, axes: ax });
  }
}
for (const w of worst) problems.push(`${w.a} and ${w.b} share ${w.axes.length} looks: ${w.axes.join(', ')}`);

console.log(JSON.stringify({ uniques: rows.length, kinds: cats.length, pairs, problems }));
