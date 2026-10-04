/**
 * Entry point for `tools/check-elites.mjs`.
 *
 * Elite affixes and mini-bosses, exercised headlessly with real monsters:
 * every new affix does what its plate says, control affixes set off follow-up
 * affixes, buffs written on monsters actually change their numbers, most
 * generated floors get a mini-boss, and every mini-boss mechanic lands on a
 * hero who stands still and misses one who reads it.
 */
import { arena, caseLog, ofRole, distTo, type Arena } from './combat-arena';
import { attachMiniBoss, planMiniBoss, MINIBOSS_KINDS, type MiniBossController, type MiniBossKind } from '../src/entities/MiniBoss';
import { rollPacket } from '../src/entities/Abilities';
import { generateRun, setMonsterCatalog } from '../src/world/DungeonGen';
import { MONSTERS, pickMonstersForDepth } from '../src/data/monsters';
import { MONSTER_AFFIXES } from '../src/data/monsterAffixes';
import { pickBossForDepth } from '../src/data/bosses';
import { namedRaresFor } from '../src/data/namedRares';
import { streamFor } from '../src/core/RNG';
import type { Enemy } from '../src/entities/Enemy';
import type { MonsterDef } from '../src/types';

const { cases, check } = caseLog();
const melee = ofRole('melee', 1)[0]!;

const hitsBy = (a: Arena, ability: string): number => a.hits.filter((h) => h.ability === ability).length;
/** Holds a monster in place without stopping its affixes. */
const pin = (e: Enemy): void => {
  e.rootTimer = 999;
};

// --- desecrator: stand still and burn, keep moving and do not ---------------
{
  const run = (moving: boolean): number => {
    const a = arena({ seed: 2 });
    const e = a.spawn(melee, 0, 10, { rank: 'elite', affixes: ['desecrator'] });
    pin(e);
    e.ai!.wake(a.ctx, false);
    let t = 0;
    a.step(16, () => {
      t += 1 / 30;
      if (moving) a.hero.set(Math.sin(t * 0.8) * 6, 0, Math.cos(t * 0.8) * 6);
    });
    return hitsBy(a, 'desecrator');
  };
  const still = run(false);
  const moving = run(true);
  check('desecrator punishes standing still', still >= 4 && moving < still / 2, `${still} ticks standing, ${moving} moving`);
}

// --- fire chains burn the space between packmates ---------------------------
{
  const run = (heroZ: number): number => {
    const a = arena({ seed: 3 });
    const l = a.spawn(melee, -4, 6, { rank: 'elite', affixes: ['fire_chains'], pack: 7 });
    const r = a.spawn(melee, 4, 6, { rank: 'champion', pack: 7 });
    pin(l);
    pin(r);
    l.ai!.wake(a.ctx);
    a.hero.set(0, 0, heroZ);
    a.step(4);
    return hitsBy(a, 'fire_chains');
  };
  const between = run(6);
  const clear = run(0);
  check('fire chains burn between packmates', between >= 8 && clear === 0, `${between} burns standing on the chain, ${clear} off it`);
}

// --- bulwark wards its packmates ---------------------------------------------
{
  const a = arena({ seed: 4 });
  const w = a.spawn(melee, 0, 20, { rank: 'elite', affixes: ['bulwark'] });
  const near = a.spawn(melee, 2, 20);
  const far = a.spawn(melee, 30, 20);
  for (const e of [w, near, far]) pin(e);
  a.step(1.2);
  const hit = (e: Enemy): number => {
    const before = e.life;
    e.takeDamage({ amount: 40, type: 'arcane', crit: false, source: 'player' }, a.ctx);
    return before - e.life;
  };
  const n = hit(near);
  const f = hit(far);
  check('bulwark wards nearby packmates', n < f * 0.75, `near ${n.toFixed(1)} vs far ${f.toFixed(1)}`);
}

// --- splitting monsters become two -------------------------------------------
{
  const a = arena({ seed: 5 });
  const e = a.spawn(melee, 0, 6, { rank: 'elite', affixes: ['splitter'] });
  const before = a.enemies.length;
  e.takeDamage({ amount: e.maxLife * 20, type: 'arcane', crit: false, source: 'player' }, a.ctx);
  a.step(0.1);
  const kids = a.enemies.length - before;
  const nested = a.enemies.filter((x) => x !== e && x.affixes.length > 0).length;
  check('splitting monsters split once', kids === 2 && nested === 0, `${kids} copies, ${nested} carry affixes`);
}

// --- hexing blows curse ---------------------------------------------------------
{
  const a = arena({ seed: 6 });
  const e = a.spawn(melee, 0, 1.6, { rank: 'elite', affixes: ['hexing'] });
  e.ai!.wake(a.ctx);
  a.step(4);
  const cursed = a.hits.filter((h) => h.packet.applies?.some((s) => s.id === 'cursed')).length;
  check('hexing blows curse', a.hits.length > 0 && cursed === a.hits.length, `${cursed}/${a.hits.length} hits cursed`);
}

// --- adaptive hardens against one element, not another --------------------------
{
  const a = arena({ seed: 7 });
  const e = a.spawn(melee, 0, 20, { rank: 'elite', affixes: ['adaptive'] });
  pin(e);
  const hit = (type: 'fire' | 'cold'): number => {
    const before = e.life;
    e.takeDamage({ amount: 30, type, crit: false, source: 'player' }, a.ctx);
    return before - e.life;
  };
  const first = hit('fire');
  for (let i = 0; i < 4; i++) hit('fire');
  const fireLater = hit('fire');
  const cold = hit('cold');
  check('adaptive resists the element you spam', fireLater < first * 0.7 && cold > fireLater * 1.3, `fire ${first.toFixed(1)} -> ${fireLater.toFixed(1)}, cold ${cold.toFixed(1)}`);
}

// --- lancer charges through you, unless you step aside ----------------------------
{
  const run = (sidestep: boolean): number => {
    const a = arena({ seed: 8 });
    const e = a.spawn(ofRole('brute', 1)[0]!, 0, 10, { rank: 'elite', affixes: ['lancer'] });
    e.ai!.wake(a.ctx);
    let moved = false;
    a.step(10, () => {
      const charged = a.landings.some((l) => l.kind === 'line' && l.by === e.id);
      if (sidestep && charged && !moved) {
        moved = true;
        a.hero.x += 3.5;
      }
      if (sidestep && moved) {
        // Stay off the line until it is over, then come back for the next.
        const last = a.landings.filter((l) => l.kind === 'line' && l.by === e.id).pop();
        if (last && a.ctx.elapsed > last.t + 1.5) {
          moved = false;
          a.hero.x = 0;
          a.landings.length = 0;
        }
      }
    });
    return hitsBy(a, 'trample');
  };
  const stood = run(false);
  const stepped = run(true);
  check('lancers charge through you', stood >= 1 && stepped < stood, `${stood} trample hits standing, ${stepped} stepping aside`);
}

// --- a control affix sets off the follow-up ----------------------------------------
{
  const a = arena({ seed: 9 });
  const e = a.spawn(ofRole('ranged', 1)[0]!, 0, 9, { rank: 'elite', affixes: ['jailer', 'mortar'] });
  pin(e);
  e.ai!.wake(a.ctx, false);
  const roots: number[] = [];
  a.step(30, () => {
    const last = a.hits[a.hits.length - 1];
    if (last && last.ability === 'jailer' && roots[roots.length - 1] !== last.t) roots.push(last.t);
  });
  // A mortar telegraph that went down within a beat of a root.
  const mortars = a.landings.filter((l) => l.by === e.id && l.kind === 'circle').map((l) => l.t - 0.9);
  const followed = roots.filter((r) => mortars.some((m) => m >= r - 0.01 && m - r < 0.25)).length;
  check('jailer sets off mortar', roots.length >= 2 && followed >= 1, `${roots.length} roots, ${followed} followed straight up by a shell`);
}

// --- buffs written on monsters change their numbers ----------------------------------
{
  const a = arena({ seed: 10 });
  const e = a.spawn(melee, 0, 20);
  const mean = (): number => {
    let s = 0;
    for (let i = 0; i < 300; i++) s += rollPacket(e, a.ctx, 1, 'physical', 't').amount;
    return s / 300;
  };
  const plain = mean();
  e.buff('test_war_cry', 99, { damage: 1.5 });
  const buffed = mean();
  check('damage buffs are real', buffed > plain * 1.35, `mean blow ${plain.toFixed(1)} -> ${buffed.toFixed(1)}`);
}

// --- most generated floors have a mini-boss --------------------------------------------
setMonsterCatalog({
  pick: (depth, biome, rng, count) => pickMonstersForDepth(depth, biome, rng, count).map((m) => m.id),
  affixes: (depth, rng, count) => {
    const pool = MONSTER_AFFIXES.filter((x) => x.minDepth <= depth);
    const out: string[] = [];
    const taken = new Set<string>();
    for (let i = 0; i < count && taken.size < pool.length; i++) {
      const legal = pool.filter((x) => !taken.has(x.id) && !(x.excludes ?? []).some((y) => taken.has(y)));
      if (legal.length === 0) break;
      const chosen = rng.weighted(legal, (x) => x.weight);
      taken.add(chosen.id);
      out.push(chosen.id);
    }
    return out;
  },
  bossFor: (depth, biome, rng) => pickBossForDepth(depth, biome, rng).id,
  nameFor: (monsterId, biome, depth, rng) => {
    const def = MONSTERS.find((m) => m.id === monsterId);
    if (!def) return null;
    const pool = namedRaresFor(def.family, monsterId, biome, depth);
    return pool.length ? rng.weighted(pool, (n) => n.weight).id : null;
  },
});
{
  let floors = 0;
  let withMini = 0;
  let onBoss = 0;
  const kinds = new Set<string>();
  for (const depth of [2, 4, 7, 10, 14, 18, 24, 30]) {
    for (let s = 0; s < 6; s++) {
      const run = generateRun(depth, 1000 + s * 7919 + depth, 'warden');
      run.levels.forEach((level, index) => {
        const plan = planMiniBoss(level.spawns, depth, level.isBossLevel, streamFor(level.seed, `miniboss:${index}`));
        if (level.isBossLevel) {
          if (plan) onBoss++;
          return;
        }
        floors++;
        if (plan) {
          withMini++;
          kinds.add(plan.kind);
        }
      });
    }
  }
  const share = withMini / Math.max(1, floors);
  check(
    'most floors have a mini-boss',
    share >= 0.7 && onBoss === 0 && kinds.size >= 5,
    `${withMini}/${floors} floors (${Math.round(share * 100)}%), ${onBoss} on boss floors, kinds seen: ${[...kinds].join(', ')}`,
  );
}

// --- every mini-boss mechanic lands on a hero who stands still ------------------------
const HOST: Record<MiniBossKind, MonsterDef> = {
  warlord: melee,
  executioner: ofRole('brute', 1)[0]!,
  stalker: ofRole('ambusher', 1)[0]!,
  pyrelord: ofRole('caster', 1)[0]!,
  broodmother: ofRole('swarm', 1)[0]!,
  deadeye: ofRole('ranged', 1)[0]!,
  rampager: ofRole('brute', 1)[0]!,
};
const SIGNATURE: Record<MiniBossKind, string> = {
  warlord: '',
  executioner: 'execution',
  stalker: 'shadow_strike',
  pyrelord: 'pyre_cage',
  broodmother: '',
  deadeye: 'deadeye_volley',
  rampager: 'trample',
};

function miniArena(kind: MiniBossKind, seed: number, solid?: (x: number, z: number) => boolean) {
  const a = arena({ seed, solid });
  const def = HOST[kind];
  const named = {
    id: `miniboss.${kind}`, name: `${def.name} X`, title: 't', minDepth: 1, weight: 0, affixes: [], lifeMul: 2, damageMul: 1.2,
  };
  const e = a.spawn(def, 0, 9, { rank: 'rare', named, pack: 3 });
  const c = attachMiniBoss(e, { kind }) as MiniBossController;
  e.ai!.wake(a.ctx);
  return { a, e, c };
}

for (const k of MINIBOSS_KINDS) {
  const kind = k.id;
  const { a, e, c } = miniArena(kind, 20 + kind.length);
  let warded = false;
  const startCount = a.enemies.length;
  if (kind === 'warlord') e.life = e.maxLife * 0.6;
  a.step(25, () => {
    if (c.warded) warded = true;
  });
  let ok: boolean;
  let detail: string;
  if (kind === 'warlord') {
    const kin = a.enemies.length - startCount;
    ok = kin >= 2 && c.uses >= 1;
    detail = `${kin} kin answered the horn, ${c.uses} war cries`;
  } else if (kind === 'broodmother') {
    const kin = a.enemies.length - startCount;
    ok = kin >= 4 && warded;
    detail = `${kin} brood, warded by them: ${warded}`;
  } else {
    const n = hitsBy(a, SIGNATURE[kind]);
    ok = c.uses >= 2 && n >= 1;
    detail = `${c.uses} uses, ${n} landed on a hero standing still`;
  }
  check(`mini-boss ${kind} works`, ok, detail);
}

// --- ...and misses a hero who reads it ------------------------------------------------
{
  // Executioner: move once the mark locks.
  const { a, e } = miniArena('executioner', 41);
  let lockSeen = -1;
  a.step(25, () => {
    const lock = a.landings.find((l) => l.by === e.id && l.kind === 'circle' && l.t - a.ctx.elapsed > 0.5);
    if (lock && lockSeen !== lock.t) {
      lockSeen = lock.t;
      a.hero.x += 4;
    }
  });
  check('executioner misses a hero who moves on the lock', hitsBy(a, 'execution') === 0, `${hitsBy(a, 'execution')} executions landed`);
}
{
  // Rampager: a wall behind the hero stops it cold.
  const { a, e } = miniArena('rampager', 43, (_x, z) => z < -4);
  a.hero.set(0, 0, 0);
  e.root.position.set(0, 0, 10);
  let dazed = false;
  a.step(20, () => {
    if (e.hasBuff('rampager_dazed')) dazed = true;
  });
  check('rampager stuns itself on a wall', dazed, `dazed: ${dazed}`);
}
{
  // Stalker comes from behind.
  const { a, e } = miniArena('stalker', 47);
  a.ctx.heroFacing = 0;
  let behind = 0;
  a.step(25, () => {
    if (e.hasBuff('shadow_step')) return;
    if (distTo(e, a.hero) < 3 && e.root.position.z < -1) behind++;
  });
  check('stalker strikes from behind', behind > 0, `${behind} frames at the hero's back`);
}

console.log(JSON.stringify({ cases }));
