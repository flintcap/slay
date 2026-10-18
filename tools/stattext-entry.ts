/**
 * Entry point for `tools/check-stattext.mjs`.
 *
 * A passive's tooltip lists the stats it really gives, rank by rank, under
 * the text the tree wrote for it. Each of those stats has to show up in the
 * text with one of its real numbers: what rank 1 gives, what a rank adds,
 * the first rank that gives anything, or the cap it grows toward. A stat
 * whose number is nowhere in the text is one the text gets wrong or hides.
 */
import { SKILLS } from '../src/data/skills';

const near = (n: number, v: number): boolean => Math.abs(n - Math.abs(v)) <= Math.max(0.051, Math.abs(v) * 0.03);
const wrong: Array<{ id: string; key: string; v: string; desc: string }> = [];
for (const s of SKILLS) {
  if (!s.passive) continue;
  const nums = [...s.desc.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  for (const [key, f] of Object.entries(s.passive)) {
    if (typeof f !== 'function') continue;
    const first = [1, 2, 3, 4, 5].map(f).find((x) => x !== 0) ?? 0;
    const top = s.maxRank ?? 20;
    const real = [f(1), f(2) - f(1), first, f(1000), f(top)];
    if (!nums.some((n) => real.some((v) => near(n, v)))) wrong.push({ id: s.id, key, v: `rank 1 ${f(1)}, rank 2 ${f(2)}, top ${f(top)}`, desc: s.desc });
  }
}
console.log(JSON.stringify({ wrong }));
