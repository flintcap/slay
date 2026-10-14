/**
 * Headless half of `check-legend.mjs`: does every set and unique have its
 * own signature? See CONTRACTS.md, "Signatures".
 */
import { SETS } from '../src/data/sets';
import { UNIQUES } from '../src/data/uniques';
import { ITEM_BASES } from '../src/data/itemBases';
import { glowTierOf, SET_MOTIFS, UNIQUE_DESIGNS } from '../src/art/items/Designs';
import { itemLook, keyColor } from '../src/art/ItemLook';

const problems: string[] = [];
const dist = (a: number, b: number): number => Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
const CLOSE = 36;

// Every set has a motif; no two share a palette or a sculpt.
const sets = SETS.map((s) => ({ id: s.id, m: SET_MOTIFS[s.id] }));
for (const s of sets) if (!s.m) problems.push(`set ${s.id} has no signature`);
const pal = (m: NonNullable<(typeof sets)[number]['m']>): number[] => [keyColor(m.metal), keyColor(m.leather), keyColor(m.cloth), m.glow];
let nearest = { a: '', b: '', d: Infinity };
for (let i = 0; i < sets.length; i++) {
  for (let j = i + 1; j < sets.length; j++) {
    const A = sets[i]!;
    const B = sets[j]!;
    if (!A.m || !B.m) continue;
    if (A.m.sculpt === B.m.sculpt) problems.push(`${A.id} and ${B.id} share the sculpt ${A.m.sculpt}`);
    const pa = pal(A.m);
    const pb = pal(B.m);
    const ds = pa.map((c, k) => dist(c, pb[k]!));
    if (ds.every((d) => d < CLOSE)) problems.push(`${A.id} and ${B.id} share a palette`);
    const sum = ds.reduce((x, y) => x + y, 0);
    if (sum < nearest.d) nearest = { a: A.id, b: B.id, d: sum };
  }
}

// Every unique has a design, every mythic and ancient an aura, and no two look alike.
const baseById = new Map(ITEM_BASES.map((b) => [b.id, b]));
const seen = new Map<string, string>();
let auras = 0;
for (const u of UNIQUES) {
  const d = UNIQUE_DESIGNS[u.id];
  if (!d) {
    problems.push(`unique ${u.id} has no signature`);
    continue;
  }
  // Only the tiers with a full glow budget wear their aura (see `glowTierOf`).
  if (glowTierOf(u.rarity, u.ilvl) === 'full') {
    if (!d.aura || d.aura === 'none') problems.push(`unique ${u.id} has no aura`);
    else auras++;
  }
  const base = baseById.get(u.baseId);
  if (!base) continue;
  const L = itemLook({ baseId: u.baseId, rarity: u.rarity, uniqueId: u.id }, base.visual);
  const sig = `${u.baseId}|${L.palette}|${L.trimKey}|${L.glowColor}|${[...L.features].sort().join(',')}|${L.aura}`;
  const other = seen.get(sig);
  if (other) problems.push(`${u.id} looks the same as ${other}`);
  seen.set(sig, u.id);
}
// Set pieces carry their set's sculpt first.
let pieces = 0;
for (const s of SETS) {
  const m = SET_MOTIFS[s.id];
  if (!m) continue;
  for (const p of s.pieces) {
    const base = baseById.get(p.baseId);
    if (!base) continue;
    const L = itemLook({ baseId: p.baseId, rarity: 'set', setId: s.id }, base.visual);
    if (L.features[0] !== m.sculpt) problems.push(`${p.id} does not carry ${m.sculpt}`);
    if (L.glowColor !== m.glow) problems.push(`${p.id} does not glow in its set's colour`);
    pieces++;
  }
}

console.log(JSON.stringify({ sets: sets.length, uniques: UNIQUES.length, auras, pieces, nearest, problems }));
