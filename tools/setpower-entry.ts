/**
 * Entry point for `tools/check-setpower.mjs`: is one set piece worth more than
 * a rare of the same base and level, before its set bonuses count? Set pieces
 * keep the item level they were written at, so only that level is checked.
 *
 * A line is scored as a share of a unique's usual top roll at that level
 * (`statCurve`), so +20 life and +5% fire resist are measured on one scale.
 * Implicit lines are left out: a set piece and a rare of one base share them.
 */
import { SETS } from '../src/data/sets';
import { statCurve } from '../src/data/uniqueBatches/kit';
import { buildSetPiece, createItem } from '../src/sim/Loot';
import { Random } from '../src/core/RNG';
import type { Item } from '../src/types';

const score = (it: Item, L: number): number =>
  it.mods.filter((m) => m.kind !== 'implicit').reduce((s, m) => s + Math.abs(m.value) / statCurve(m.stat, L), 0);

const rows: Array<Record<string, unknown>> = [];
const fails: string[] = [];
const noCurve = new Set<string>();
const rng = new Random(0x5e7);
for (const set of SETS) {
  for (const p of set.pieces) {
    {
      const L = p.ilvl;
      let setSum = 0;
      for (let i = 0; i < 40; i++) {
        const it = buildSetPiece(p, rng);
        for (const m of it.mods) if (m.kind !== 'implicit' && !statCurve.has(m.stat)) noCurve.add(m.stat);
        setSum += score(it, L);
      }
      const rare: number[] = [];
      for (let i = 0; i < 300; i++) {
        const it = createItem(p.baseId, L, rng, 'rare');
        for (const m of it.mods) if (m.kind !== 'implicit' && !statCurve.has(m.stat)) noCurve.add(m.stat);
        rare.push(score(it, L));
      }
      rare.sort((a, b) => a - b);
      const mean = rare.reduce((a, b) => a + b, 0) / rare.length;
      const p75 = rare[Math.floor(rare.length * 0.75)];
      const piece = setSum / 40;
      rows.push({ id: p.id, L, piece: +piece.toFixed(2), rare: +mean.toFixed(2), p75: +p75.toFixed(2) });
      // A few deep pieces whose lines rares outgrow may sit a touch under a
      // good rare; none may fall to a usual one.
      if (piece < Math.max(p75 * 0.9, mean * 1.15)) fails.push(`${p.id} at item level ${L}: ${piece.toFixed(2)} against a rare's ${mean.toFixed(2)} (good ${p75.toFixed(2)})`);
    }
  }
}
console.log(JSON.stringify({ rows, noCurve: [...noCurve], fails }));
