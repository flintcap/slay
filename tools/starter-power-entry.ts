/**
 * Entry point for `tools/check-starter-power.mjs`.
 *
 * Reported: "pyromancer is unplayable at level 1".
 *
 * A class is unplayable at level one when the arithmetic of its opening minute
 * does not work, and that arithmetic can be read without playing. For a fresh
 * character of each class this reports:
 *
 *  - life and mana, and how much of a floor-one monster's hit the life is worth
 *  - the opening attack, its mana cost, and how many casts the pool holds
 *  - how long the pool takes to refill one cast at the starting regen
 *  - damage per cast against a floor-one monster's life, i.e. casts to kill
 *
 * The number to watch is casts-per-pool against casts-to-kill. A caster whose
 * pool holds four casts and needs three of them to kill one of the hundred and
 * fifty monsters on the floor is not a class, it is a countdown.
 */
import { createCharacter, startingSkillFor } from '../src/sim/Character';
import { computeStats } from '../src/sim/Stats';
import { CLASSES } from '../src/data/classes';
import { SKILL_BY_ID } from '../src/data/skills';
import { MONSTERS, pickMonstersForDepth } from '../src/data/monsters';
import { monsterBudget } from '../src/world/DungeonGen';
import { Random, streamFor } from '../src/core/RNG';

/** Roughly what a depth-1 normal monster has, averaged over the floor-one pool. */
function floorOneMonster(): { life: number; damage: number } {
  const pool = pickMonstersForDepth(1, 'crypt', streamFor(7, 'probe'), 12);
  const list = pool.length ? pool : MONSTERS.slice(0, 8);
  let life = 0;
  let dmg = 0;
  for (const m of list) {
    life += m.lifeMul;
    dmg += m.damageMul;
  }
  // The depth curve at depth 1, as the entity layer applies it.
  const base = 26;
  const hit = 5;
  return { life: (life / list.length) * base, damage: (dmg / list.length) * hit };
}

const mob = floorOneMonster();

const rows = CLASSES.map((cls) => {
  const c = createCharacter('Probe', cls.id, new Random(0x51a7));
  const s = computeStats(c);
  const skillId = startingSkillFor(cls.id);
  const def = skillId ? SKILL_BY_ID[skillId] : null;

  // Both are rank functions, not numbers; rank 1 is what a fresh character has.
  const manaCost = def?.manaCost ? Math.round(def.manaCost(1)) : 0;
  const dmgMul = def?.damageScale ? def.damageScale(1) : 1;
  // Elemental skills ride the elemental pool, which is where energy now lands.
  const elemental = def?.damageType && def.damageType !== 'physical' ? 1 + s.elementalDamagePct / 100 : 1;
  const hit = ((s.minDamage + s.maxDamage) / 2) * dmgMul * (1 + s.enhancedDamage / 100) * elemental;

  const castsPerPool = manaCost > 0 ? Math.floor(s.mana / manaCost) : Infinity;
  const refillOneCast = manaCost > 0 && s.manaRegen > 0 ? manaCost / s.manaRegen : Infinity;
  const castsToKill = hit > 0 ? Math.ceil(mob.life / hit) : Infinity;
  const hitsToDie = mob.damage > 0 ? Math.floor(s.life / mob.damage) : Infinity;

  return {
    cls: cls.id,
    life: Math.round(s.life),
    mana: Math.round(s.mana),
    manaRegen: +s.manaRegen.toFixed(2),
    skill: skillId ?? '(none)',
    manaCost,
    hit: Math.round(hit),
    castsPerPool: Number.isFinite(castsPerPool) ? castsPerPool : 99,
    refillOneCast: Number.isFinite(refillOneCast) ? +refillOneCast.toFixed(1) : 0,
    castsToKill,
    hitsToDie,
    /** Monsters the pool can kill before it runs dry. */
    killsPerPool: castsToKill > 0 ? +(castsPerPool / castsToKill).toFixed(1) : 0,
  };
});

console.log(
  JSON.stringify({
    mobLife: Math.round(mob.life),
    mobDamage: Math.round(mob.damage),
    floorOneMonsters: monsterBudget(1, 2600, 0, 3),
    rows,
  }),
);
