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

/**
 * Counts an affix's casts as they start: its cooldown jumps back up. Only
 * bosses lay a ground mark, so this is the test's cue to dodge.
 */
const casts = (e: Enemy, slot = 0): (() => number) => {
  const timers = (e as unknown as { affixTimers: number[] }).affixTimers;
  let last = timers[slot] ?? 0;
  let n = 0;
  return () => {
    const now = timers[slot] ?? 0;
    if (now > last + 1) n++;
    last = now;
    return n;
  };
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
    // No ground mark (only bosses lay one): the lancer roots itself to wind up.
    let moved = false;
    let since = 0;
    a.step(10, () => {
      const winding = e.rootTimer > 0 && !e.busy;
      if (sidestep && winding && !moved) {
        moved = true;
        since = a.ctx.elapsed;
        a.hero.x += 3.5;
      }
      // Stay off the line until it is over, then come back for the next.
      if (sidestep && moved && a.ctx.elapsed > since + 2.5) {
        moved = false;
        a.hero.x = 0;
      }
    });
    return hitsBy(a, 'trample');
  };
  const stood = run(false);
  const stepped = run(true);
  check('lancers charge through you', stood >= 1 && stepped < stood, `${stood} trample hits standing, ${stepped} stepping aside`);
}

// --- the deep powers (depth 20 on) -------------------------------------------------
// Each can be beaten by doing the thing its plate says. Only bosses lay ground
// marks, so none of these may: a hit that lands as a mark ends counts as marked.

/** Hits by an ability, and how many of them landed as a ground marker ended. */
const told = (a: Arena, ability: string): { hits: number; marked: number } => {
  const hs = a.hits.filter((h) => h.ability === ability);
  return { hits: hs.length, marked: hs.filter((h) => a.landings.some((l) => Math.abs(l.t - h.t) < 0.06)).length };
};
const deep = (seed: number, affix: string, x = 0, z = 9, o: { pinned?: boolean; rank?: 'elite' | 'champion' } = {}) => {
  const a = arena({ seed, depth: 40 });
  const e = a.spawn(melee, x, z, { rank: o.rank ?? 'elite', affixes: [affix], pack: 5 });
  if (o.pinned !== false) pin(e);
  e.ai!.wake(a.ctx, false);
  return { a, e };
};

{
  // Echoing: the blow comes again where you stood. Step away and it misses.
  const run = (step: boolean) => {
    const { a, e } = deep(61, 'echoing', 0, 1.6, { pinned: false });
    let seen = 0;
    a.step(12, () => {
      const own = a.hits.filter((h) => h.ability !== 'echoing').length;
      if (step && own > seen) {
        seen = own;
        a.hero.x += a.hero.x > 0 ? -3.5 : 3.5;
      }
    });
    void e;
    return told(a, 'echoing');
  };
  const still = run(false);
  const moving = run(true);
  check('echoing blows come again, unmarked', still.hits >= 2 && still.marked === 0 && moving.hits < still.hits,
    `${still.hits} echoes standing (${still.marked} marked), ${moving.hits} stepping away`);
}
{
  // Lampblack: inside the soot your mana stops; outside it does not.
  const run = (heroZ: number): number => {
    const { a } = deep(62, 'lampblack', 0, 0);
    let snuffed = 0;
    a.ctx.applyHeroStatus = (id) => {
      if (id === 'snuffed') snuffed++;
    };
    a.hero.set(0, 0, heroZ);
    a.step(4);
    return snuffed;
  };
  const inside = run(4);
  const outside = run(9);
  check('lampblack snuffs inside its soot only', inside >= 4 && outside === 0, `${inside} snuffs at 4 m, ${outside} at 9 m`);
}
{
  // Restless: its ghost climbs out a beat after it falls.
  const { a, e } = deep(63, 'restless', 0, 6);
  e.takeDamage({ amount: e.maxLife * 20, type: 'arcane', crit: false, source: 'player' }, a.ctx);
  a.step(0.6);
  const early = a.enemies.filter((x) => x.monsterId === 'restless_shade').length;
  a.step(1.2);
  const shades = a.enemies.filter((x) => x.monsterId === 'restless_shade');
  const frac = shades[0] ? shades[0].life / shades[0].maxLife : 0;
  check('restless rises once as a shade, a beat later', early === 0 && shades.length === 1 && frac > 0.5 && frac < 0.7 && shades[0]!.affixes.length === 0,
    `${early} at 0.6 s, ${shades.length} at 1.8 s at ${Math.round(frac * 100)}% life`);
}
{
  // Knelling: the wave covers its band. Hug it and it misses.
  const run = (heroZ: number) => {
    const { a } = deep(64, 'knelling', 0, 0);
    a.hero.set(0, 0, heroZ);
    a.step(3);
    return told(a, 'knelling');
  };
  const band = run(5);
  const hug = run(1.4);
  check('knelling hits the band, not beside it', band.hits === 1 && band.marked === 0 && hug.hits === 0,
    `${band.hits} hit in the band (${band.marked} marked), ${hug.hits} hugging it`);
}
{
  // Splintering: heavy blows knock shards down near you.
  const { a, e } = deep(65, 'splintering', 0, 6);
  a.step(0.2);
  for (let k = 0; k < 4; k++) {
    e.takeDamage({ amount: e.maxLife * 0.12, type: 'arcane', crit: false, source: 'player' }, a.ctx);
    a.step(1.2);
  }
  const light = deep(66, 'splintering', 0, 6);
  for (let k = 0; k < 4; k++) {
    light.e.takeDamage({ amount: light.e.maxLife * 0.01, type: 'arcane', crit: false, source: 'player' }, light.a.ctx);
    light.a.step(1.2);
  }
  const heavy = told(a, 'splintering');
  const small = told(light.a, 'splintering');
  check('splintering sheds shards on heavy blows', heavy.hits >= 2 && heavy.marked === 0 && small.hits === 0,
    `${heavy.hits} shards from heavy blows (${heavy.marked} marked), ${small.hits} from light ones`);
}
{
  // Stitching: heals the hurt packmate, unless you stand on the thread.
  const run = (onThread: boolean): number => {
    const { a, e } = deep(67, 'stitching', -4, 8);
    const hurt = a.spawn(melee, 4, 8, { rank: 'champion', pack: 5 });
    pin(hurt);
    hurt.life = hurt.maxLife * 0.5;
    a.hero.set(0, 0, onThread ? 8 : 0);
    void e;
    a.step(4);
    return hurt.life / hurt.maxLife;
  };
  const healed = run(false);
  const cut = run(true);
  check('stitching sews packmates; the thread can be cut', healed > 0.65 && cut < 0.52, `${Math.round(healed * 100)}% healed off the thread, ${Math.round(cut * 100)}% standing on it`);
}
{
  // Grappling: a hook along its line drags you in. Step off it.
  const run = (dodge: boolean) => {
    const { a, e } = deep(68, 'grappling', 0, 9);
    let seen = 0;
    const thrown = casts(e);
    a.step(18, () => {
      const lines = thrown();
      if (dodge && lines > seen) {
        seen = lines;
        a.hero.x += a.hero.x > 0 ? -2.5 : 2.5;
      }
    });
    const hs = a.hits.filter((h) => h.ability === 'grappling');
    return { ...told(a, 'grappling'), pulled: hs.filter((h) => (h.packet.knockback ?? 0) < 0).length };
  };
  const still = run(false);
  const dodge = run(true);
  check('grappling hooks drag in along their line', still.hits >= 2 && still.pulled === still.hits && still.marked === 0 && dodge.hits < still.hits,
    `${still.hits} hooks standing (${still.pulled} pulled, ${still.marked} marked), ${dodge.hits} stepping off`);
}
{
  // Refracting: three beams. Stand between them.
  const run = (dodge: boolean) => {
    const { a, e } = deep(69, 'refracting', 0, 10);
    let seen = 0;
    const fired = casts(e);
    a.step(18, () => {
      const lines = fired();
      if (dodge && lines > seen) {
        seen = lines;
        // Between the middle beam and the next one, wherever it aimed.
        a.hero.x += 1.8;
      }
    });
    return told(a, 'refracting');
  };
  const still = run(false);
  const dodge = run(true);
  check('refracting beams land on their lines only', still.hits >= 2 && still.marked === 0 && dodge.hits === 0,
    `${still.hits} beams standing (${still.marked} marked), ${dodge.hits} between them`);
}
{
  // Funereal: a fallen packmate's body bursts.
  const run = (heroOnBody: boolean) => {
    const { a } = deep(70, 'funereal', 0, 10);
    const mate = a.spawn(melee, 0, 3, { rank: 'champion', pack: 5 });
    pin(mate);
    a.hero.set(0, 0, heroOnBody ? 3 : -3);
    a.step(0.2);
    mate.takeDamage({ amount: mate.maxLife * 20, type: 'arcane', crit: false, source: 'player' }, a.ctx);
    a.step(1.5);
    return told(a, 'funereal');
  };
  const on = run(true);
  const off = run(false);
  check('funereal bursts the dead', on.hits === 1 && on.marked === 0 && off.hits === 0, `${on.hits} burst on the body (${on.marked} marked), ${off.hits} standing clear`);
}
{
  // Hemming: nails ring you in. Stay put and nothing hurts; walk through and it does.
  const run = (walk: boolean): number => {
    const { a } = deep(71, 'hemming', 0, 10);
    let t = 0;
    a.step(4.5, () => {
      t += 1 / 30;
      if (walk && t > 1.3 && a.hero.z > -7) a.hero.z -= 0.08;
    });
    return a.hits.filter((h) => h.ability === 'hemming').length;
  };
  const stay = run(false);
  const walk = run(true);
  check('hemming nails hurt only when crossed', stay === 0 && walk >= 1, `${stay} hits staying inside, ${walk} walking through`);
}
{
  // Emberfall: one ember on you, a ring of them round you. Each its own volley.
  const { a } = deep(72, 'emberfall', 0, 8);
  a.step(14);
  const r = told(a, 'emberfall');
  // One hit a volley: no two ember hits land together.
  const ts = a.hits.filter((h) => h.ability === 'emberfall').map((h) => h.t);
  const doubled = ts.filter((t, i) => i > 0 && t - ts[i - 1]! < 0.1).length;
  check('emberfall lands one hit a volley, unmarked', r.hits >= 2 && r.marked === 0 && doubled === 0,
    `${r.hits} hits, ${doubled} doubled (${r.marked} marked)`);
}
{
  // Eclipsing: anyone still inside the mark is struck blind.
  const run = (heroZ: number) => {
    const { a } = deep(73, 'eclipsing', 0, 0);
    a.hero.set(0, 0, heroZ);
    a.step(2);
    const hs = a.hits.filter((h) => h.ability === 'eclipsing');
    return { ...told(a, 'eclipsing'), blind: hs.filter((h) => h.packet.applies?.some((x) => x.id === 'blinded')).length };
  };
  const inside = run(5);
  const outside = run(8.5);
  check('eclipsing blinds inside its reach only', inside.hits === 1 && inside.blind === 1 && inside.marked === 0 && outside.hits === 0,
    `${inside.hits} hit inside (${inside.blind} blinded, ${inside.marked} marked), ${outside.hits} outside`);
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
  // A mortar shell (0.9 s fuse) fired within a beat of a root.
  const mortars = a.hits.filter((h) => h.ability === 'mortar').map((h) => h.t - 0.9);
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
