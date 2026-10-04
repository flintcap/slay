/**
 * Entry point for `tools/check-readable.mjs`.
 *
 * Every monster and boss ability, as data: how long its tell is, whether it
 * puts a marker on the floor, and how hard it hits. A heavy blow with no
 * marker, or a marker too short to react to, is a hit the player cannot learn.
 */
import { ABILITIES } from '../src/entities/Abilities';
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
}));
console.log(JSON.stringify({ rows }));
