/**
 * Entry point for `tools/check-readable.mjs`.
 *
 * Every monster and boss ability, as data: how long its tell is, whether it
 * puts a marker on the floor, and how hard it hits. A heavy blow with no
 * marker, or a marker too short to react to, is a hit the player cannot learn.
 */
import { ABILITIES, isHarmless } from '../src/entities/Abilities';
import { dangerTone, SAFE_TONE } from '../src/fx/Decals';
import { BOSSES } from '../src/data/bosses';
import { MONSTERS } from '../src/data/monsters';

const usedByBoss = new Set<string>();
for (const b of BOSSES) for (const p of b.phases) for (const a of p.abilities) usedByBoss.add(a);
const usedByMonster = new Set<string>();
for (const m of MONSTERS) for (const a of m.abilities) usedByMonster.add(a);

const rows = ABILITIES.map((a) => ({
  id: a.id,
  kind: a.kind,
  windup: a.windup,
  telegraph: a.telegraph?.shape ?? null,
  damageMul: a.damageMul,
  boss: usedByBoss.has(a.id),
  monster: usedByMonster.has(a.id),
  basic: a.tags?.includes('basic') ?? false,
  harmless: isHarmless(a),
  hurts: a.damageMul > 0 || a.kind === 'debuff',
}));

// One danger language: every warning colour lands in the warm family (hue
// 345-45, strong), and none can be mistaken for the one safe colour.
const hueOf = (hex: number): { h: number; s: number } => {
  const r = ((hex >> 16) & 255) / 255;
  const g = ((hex >> 8) & 255) / 255;
  const b = (hex & 255) / 255;
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  const d = hi - lo;
  if (d === 0) return { h: 0, s: 0 };
  const h = 60 * (hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4);
  return { h, s: d / (1 - Math.abs(hi + lo - 1)) };
};
const offTone: string[] = [];
const colours = new Set<number>([SAFE_TONE, 0xff3020]);
for (const a of ABILITIES) if (a.telegraph) colours.add(a.telegraph.color);
for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) colours.add((r << 16) | (g << 8) | b);
for (const c of colours) {
  const t = dangerTone(c);
  const { h, s } = hueOf(t);
  if (!(h >= 345 || h <= 45) || s < 0.8 || t === SAFE_TONE) offTone.push(`${c.toString(16)} -> ${t.toString(16)}`);
}
console.log(JSON.stringify({ rows, offTone, tones: colours.size }));
