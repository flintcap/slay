/**
 * Entry point for `tools/check-bosses.mjs`. Pure data and pure logic; runs
 * under Node with no DOM.
 *
 * Two questions:
 *  1. Which boss does a player actually meet, floor by floor? A roster of
 *     twenty-four is worthless if the gating only ever surfaces one.
 *  2. Is every boss internally sound — real phases, real abilities, an arena
 *     hook the runtime knows, adds that exist?
 */
import { BOSSES, BOSS_PROFILES, bossSize, pickBossForDepth } from '../src/data/bosses';
import { MONSTERS } from '../src/data/monsters';
import { biomeForDepth } from '../src/world/Biomes';
import { streamFor } from '../src/core/RNG';
import { ABILITIES } from '../src/entities/Abilities';
import { WARDENS } from '../src/data/wardens';
import { hasLook } from '../src/art/creatures/Looks';

const monsterIds = new Set(MONSTERS.map((m) => m.id));
const abilityIds = new Set(ABILITIES.map((a) => a.id));

// --- how often each boss is actually met -----------------------------------
const DEPTHS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 26, 30, 40, 60, 66, 72, 78, 84, 90, 96];
const seenAt: Record<number, Record<string, number>> = {};
const everSeen = new Set<string>();
for (const depth of DEPTHS) {
  const tally: Record<string, number> = {};
  for (let s = 0; s < 400; s++) {
    const rng = streamFor(s * 2654435761, `run:${depth}`);
    const biome = biomeForDepth(depth, rng);
    const id = pickBossForDepth(depth, biome, rng.fork('boss')).id;
    tally[id] = (tally[id] ?? 0) + 1;
    everSeen.add(id);
  }
  seenAt[depth] = tally;
}

// --- structural soundness ---------------------------------------------------
const defects: Array<{ id: string; problem: string }> = [];
for (const b of BOSSES) {
  if (b.phases.length === 0) defects.push({ id: b.id, problem: 'no phases' });
  b.phases.forEach((ph, i) => {
    if (!ph.abilities || ph.abilities.length === 0) {
      defects.push({ id: b.id, problem: `phase ${i} has no abilities` });
    }
    for (const a of ph.abilities ?? []) {
      if (!abilityIds.has(a)) defects.push({ id: b.id, problem: `phase ${i} ability "${a}" does not exist` });
    }
  });
  for (const a of b.adds ?? []) {
    if (!monsterIds.has(a)) defects.push({ id: b.id, problem: `add "${a}" is not a monster` });
  }
  if (!b.intro) defects.push({ id: b.id, problem: 'no intro line' });
  if (!b.music) defects.push({ id: b.id, problem: 'no music track' });
  if ((b.lifeMul ?? 1) <= 0 || (b.damageMul ?? 1) <= 0) defects.push({ id: b.id, problem: 'zero life or damage multiplier' });
  if (!b.biomes || b.biomes.length === 0) defects.push({ id: b.id, problem: 'belongs to no biome' });
  if (!(b.profile in BOSS_PROFILES)) defects.push({ id: b.id, problem: `unknown profile "${b.profile}"` });
  if (!['straight', 'phased', 'puzzle'].includes(b.shape)) defects.push({ id: b.id, problem: `unknown shape "${b.shape}"` });
  if (b.shape === 'straight' && b.phases.length > 2) defects.push({ id: b.id, problem: 'a straight fight has at most two phases' });
  if (b.shape === 'phased' && b.phases.length < 3) defects.push({ id: b.id, problem: 'a phased fight has at least three phases' });
}

// Every boss and floor warden is drawn in its own body (its portrait is that
// body), has a size, and speaks when its fight turns.
for (const b of [...BOSSES, ...WARDENS]) {
  if (!hasLook(b.id)) defects.push({ id: b.id, problem: 'no look of its own, so no portrait of its own' });
  if (!(b.scale > 0) || !['person', 'tall', 'large', 'giant'].includes(bossSize(b))) defects.push({ id: b.id, problem: 'no size' });
  if (!b.intro) defects.push({ id: b.id, problem: 'no intro line' });
  // The first phase may open in silence (the intro speaks for it); every
  // turn after that is announced.
  if (!b.phases.some((ph) => ph.bark?.trim())) defects.push({ id: b.id, problem: 'no barks' });
  b.phases.forEach((ph, i) => {
    if (i > 0 && !ph.bark?.trim()) defects.push({ id: b.id, problem: `phase ${i} (${ph.name}) has no bark` });
  });
}

console.log(
  JSON.stringify({
    roster: BOSSES.map((b) => ({
      id: b.id,
      name: b.name,
      minDepth: b.minDepth,
      biomes: b.biomes,
      phases: b.phases.length,
      abilities: b.phases.reduce((n, p) => n + (p.abilities?.length ?? 0), 0),
      arenas: b.phases.map((p) => p.arena ?? null).filter(Boolean),
      adds: b.adds ?? [],
    })),
    seenAt,
    everSeen: [...everSeen],
    defects,
  }),
);
