/**
 * Entry point for `tools/check-tactics.mjs`.
 *
 * Puts real monsters from the real bestiary into an open field around a
 * stand-in hero and runs their real brains and bodies, frame by frame, to see
 * whether each archetype fights the way it is meant to: rushers close fast,
 * flankers come in from behind, kiters keep their distance, tanks stand in
 * front of the archers, swarms dive together, supports mend, packs wake as one
 * and falter when their leader falls, and big telegraphs never land at once.
 */
import * as THREE from 'three';
import { Enemy, resetEnemyRuntime } from '../src/entities/Enemy';
import { MONSTERS } from '../src/data/monsters';
import { getAffix } from '../src/data/monsterAffixes';
import { Random } from '../src/core/RNG';
import type { CombatContext } from '../src/entities/Abilities';
import type { MonsterDef, MonsterRank, MonsterRole } from '../src/types';

const DT = 1 / 30;

const shrug: any = new Proxy(function () {}, {
  get: () => shrug,
  apply: () => shrug,
});

interface Arena {
  ctx: CombatContext;
  hero: THREE.Vector3;
  hits: Array<{ t: number; by: string; amount: number }>;
  landings: Array<{ t: number; by: string }>;
  enemies: Enemy[];
  step(seconds: number, each?: (t: number) => void): void;
  spawn(def: MonsterDef, x: number, z: number, rank?: MonsterRank, pack?: number, affixes?: string[]): Enemy;
}

function arena(seed = 1): Arena {
  resetEnemyRuntime();
  const hero = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const hits: Arena['hits'] = [];
  const landings: Arena['landings'] = [];
  const enemies: Enemy[] = [];
  let acting = '';
  const decals = new Proxy(
    {
      telegraph: (_k: string, _x: number, _z: number, _s: number, _r: number, duration: number) => {
        if (duration >= 0.5) landings.push({ t: ctx.elapsed + duration, by: acting });
        return { cancel() {} };
      },
    } as Record<string, unknown>,
    { get: (o, k) => (k in o ? o[k as string] : shrug) },
  );
  const ctx: CombatContext = {
    playerPos: aim,
    heroPos: hero,
    heroFacing: 0,
    heroLifeFrac: 1,
    playerStats: shrug,
    playerLevel: 10,
    damagePlayer: (p) => hits.push({ t: ctx.elapsed, by: acting, amount: p.amount }),
    nav: {
      lineOfSight: () => true,
      clampToWalkable: (x: number, z: number) => ({ x, y: z }),
      path: () => [],
    } as never,
    fx: shrug,
    decals: decals as never,
    rng: new Random(seed),
    elapsed: 1,
    enemies,
    scene: new THREE.Scene(),
  };
  return {
    ctx,
    hero,
    hits,
    landings,
    enemies,
    step(seconds, each) {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n; i++) {
        ctx.elapsed += DT;
        for (const e of [...enemies]) {
          acting = e.id;
          aim.copy(hero);
          e.update(DT, ctx);
        }
        acting = '';
        each?.(ctx.elapsed);
      }
    },
    spawn(def, x, z, rank = 'normal', pack = 1, affixes = []) {
      const list = affixes.map((id) => getAffix(id)).filter((a): a is NonNullable<typeof a> => !!a);
      const e = new Enemy(def, rank, list, 6, new Random(seed * 97 + enemies.length));
      e.root.position.set(x, 0, z);
      e.packId = pack;
      enemies.push(e);
      return e;
    },
  };
}

/** Real monsters of a role, early enough to be common, that can walk. */
function ofRole(role: MonsterRole, n: number): MonsterDef[] {
  const pool = MONSTERS.filter((m) => m.role === role && m.speed > 0.5 && m.weight > 0).sort(
    (a, b) => a.minDepth - b.minDepth,
  );
  const out: MonsterDef[] = [];
  for (let i = 0; i < n; i++) out.push(pool[i % pool.length]!);
  return out;
}

const cases: Array<{ name: string; ok: boolean; detail: string }> = [];
const check = (name: string, ok: boolean, detail: string): void => {
  cases.push({ name, ok, detail });
};

const dist = (e: Enemy, h: THREE.Vector3): number =>
  Math.hypot(e.root.position.x - h.x, e.root.position.z - h.z);

// --- packs wake as one --------------------------------------------------------
{
  const a = arena();
  const defs = ofRole('melee', 4);
  const pack = defs.map((d, i) => a.spawn(d, -6 + i * 4, 30));
  pack[0]!.ai!.wake(a.ctx);
  a.step(0.6);
  const awake = pack.filter((e) => !e.ai!.isDormant).length;
  check('a pack wakes together', awake === pack.length, `${awake}/${pack.length} awake`);
}

// --- rushers close fast, never faster than the hero ---------------------------
{
  const a = arena();
  const defs = ofRole('melee', 3);
  const pack = defs.map((d, i) => a.spawn(d, -3 + i * 3, 16));
  pack[0]!.ai!.wake(a.ctx);
  let reached = -1;
  let peak = 0;
  const last = pack.map((e) => e.root.position.clone());
  a.step(8, (t) => {
    pack.forEach((e, i) => {
      // Walking pace only: a leap or a charge is an ability, not a stride.
      if (!e.motionOverride && !e.busy) peak = Math.max(peak, e.root.position.distanceTo(last[i]!) / DT);
      last[i]!.copy(e.root.position);
    });
    if (reached < 0 && pack.some((e) => dist(e, a.hero) < 3)) reached = t - 1;
  });
  const sprinted = pack.some((e) => e.ai!.archetype === 'rusher');
  check(
    'rushers close the gap quickly',
    sprinted && reached > 0 && reached < 4.5 && peak <= 4.6 + 0.05,
    `contact after ${reached.toFixed(1)}s, top speed ${peak.toFixed(2)} m/s`,
  );
}

// --- flankers come round the back --------------------------------------------
{
  const a = arena(3);
  a.ctx.heroFacing = 0; // facing +Z, straight at them
  const defs = ofRole('ambusher', 3);
  const pack = defs.map((d, i) => a.spawn(d, -4 + i * 4, 12));
  for (const e of pack) e.ai!.wake(a.ctx, false);
  let behindFrames = 0;
  let frames = 0;
  a.step(9, () => {
    for (const e of pack) {
      const ang = Math.atan2(e.root.position.x, e.root.position.z);
      frames++;
      if (Math.abs(ang) > (100 * Math.PI) / 180) behindFrames++;
    }
  });
  const behindAtEnd = pack.filter((e) => Math.abs(Math.atan2(e.root.position.x, e.root.position.z)) > (100 * Math.PI) / 180).length;
  check(
    'flankers get behind the hero',
    behindAtEnd >= 2 || behindFrames / frames > 0.35,
    `${behindAtEnd}/${pack.length} behind at the end, ${Math.round((behindFrames / frames) * 100)}% of the time behind`,
  );
}

// --- every third swordsman in a pack flanks -----------------------------------
{
  const a = arena();
  const defs = ofRole('melee', 6);
  const pack = defs.map((d, i) => a.spawn(d, -10 + i * 4, 14));
  pack[0]!.ai!.wake(a.ctx);
  a.step(0.8);
  const flankers = pack.filter((e) => e.ai!.archetype === 'flanker').length;
  check('melee packs send some round the side', flankers === 2, `${flankers} of 6 flank`);
}

// --- kiters back off and keep shooting -----------------------------------------
{
  const a = arena();
  const defs = ofRole('ranged', 3);
  const pack = defs.map((d, i) => a.spawn(d, -4 + i * 4, 10));
  for (const e of pack) e.ai!.wake(a.ctx, false);
  a.step(3);
  const start = pack.reduce((s, e) => s + dist(e, a.hero), 0) / pack.length;
  // The hero walks straight at them for four seconds at 3.5 m/s.
  a.step(4, () => {
    a.hero.z += 3.5 * DT;
  });
  const after = pack.reduce((s, e) => s + dist(e, a.hero), 0) / pack.length;
  const shots = a.hits.length;
  check(
    'kiters keep their distance and shoot',
    after > 4 && shots > 0,
    `mean gap ${start.toFixed(1)}m -> ${after.toFixed(1)}m while chased, ${shots} hits`,
  );
}

// --- tanks stand between you and the back line ---------------------------------
{
  const a = arena(5);
  const tank = a.spawn(ofRole('brute', 1)[0]!, 0, 8);
  const archers = ofRole('ranged', 2).map((d, i) => a.spawn(d, -3 + i * 6, 14));
  tank.ai!.wake(a.ctx);
  a.step(5);
  const ta = Math.atan2(tank.root.position.x, tank.root.position.z);
  const offs = archers.map((e) => {
    const ea = Math.atan2(e.root.position.x, e.root.position.z);
    let d = Math.abs(ta - ea);
    if (d > Math.PI) d = Math.PI * 2 - d;
    return d;
  });
  const between = Math.min(...offs) < 0.7 && dist(tank, a.hero) < Math.min(...archers.map((e) => dist(e, a.hero)));
  check(
    'tanks guard the back line',
    between,
    `tank ${dist(tank, a.hero).toFixed(1)}m out, ${((Math.min(...offs) * 180) / Math.PI).toFixed(0)}° off the nearest archer's line`,
  );
}

// --- a braced tank turns aside blows from the front ------------------------------
{
  const a = arena();
  const tank = a.spawn(ofRole('brute', 1)[0]!, 0, 3);
  tank.ai!.wake(a.ctx);
  tank.facing = Math.PI; // looking at the hero
  const packet = () => ({ amount: 100, type: 'physical' as const, crit: false, source: 'player' });
  const l0 = tank.life;
  tank.takeDamage(packet(), a.ctx);
  const front = l0 - tank.life;
  tank.facing = 0; // turned away
  const l1 = tank.life;
  tank.takeDamage(packet(), a.ctx);
  const back = l1 - tank.life;
  check('tanks guard their front', front < back * 0.8, `front ${front.toFixed(1)} vs back ${back.toFixed(1)}`);
}

// --- swarms gather, then dive together ------------------------------------------
{
  const a = arena(7);
  const pack = ofRole('swarm', 6).map((d, i) => a.spawn(d, -10 + i * 4, 16));
  pack[0]!.ai!.wake(a.ctx);
  let surges = 0;
  let wasHolding = true;
  a.step(14, () => {
    const holding = pack.some((e) => e.alive && e.ai!.holdingForSwarm);
    if (wasHolding && !holding) surges++;
    wasHolding = holding;
  });
  const total = a.hits.length;
  check('swarms dive in waves', surges >= 2 && total > 0, `${surges} surges, ${total} hits`);
}

// --- supports mend the wounded and stay back -------------------------------------
{
  const a = arena(9);
  const support = a.spawn(MONSTERS.find((m) => m.abilities.includes('heal_ally'))!, 0, 12);
  const guards = ofRole('melee', 3).map((d, i) => a.spawn(d, -3 + i * 3, 8));
  support.ai!.wake(a.ctx);
  a.step(2);
  for (const g of guards) g.life = g.maxLife * 0.4;
  const before = guards.reduce((s, g) => s + g.life, 0);
  a.step(7);
  const after = guards.reduce((s, g) => s + g.life, 0);
  const sd = dist(support, a.hero);
  const gd = Math.min(...guards.map((g) => dist(g, a.hero)));
  check('supports heal and keep back', sd > gd + 1 && after > before, `support ${sd.toFixed(1)}m out vs front ${gd.toFixed(1)}m, allies life ${Math.round(before)} -> ${Math.round(after)}`);
}

// --- big telegraphs never land on top of each other ------------------------------
{
  const a = arena(11);
  const brutes = ofRole('brute', 8);
  const ring = brutes.map((d, i) => {
    const ang = (i / brutes.length) * Math.PI * 2;
    return a.spawn(d, Math.sin(ang) * 2.5, Math.cos(ang) * 2.5);
  });
  ring[0]!.ai!.wake(a.ctx);
  a.step(20);
  const t = a.landings.slice().sort((x, y) => x.t - y.t);
  let clashes = 0;
  for (let i = 1; i < t.length; i++) {
    if (t[i]!.by !== t[i - 1]!.by && t[i]!.t - t[i - 1]!.t < 0.2) clashes++;
  }
  check('big telegraphs are staggered', t.length >= 4 && clashes === 0, `${t.length} big telegraphs, ${clashes} landing within 0.2s of another`);
}

// --- a pack falters when its leader dies ------------------------------------------
{
  const a = arena(13);
  const defs = ofRole('melee', 4);
  const leader = a.spawn(defs[0]!, 0, 6, 'champion', 4, ['berserker']);
  const pack = defs.slice(1).map((d, i) => a.spawn(d, -3 + i * 3, 7, 'normal', 4));
  leader.ai!.wake(a.ctx);
  a.step(0.5);
  leader.takeDamage({ amount: leader.maxLife * 50, type: 'arcane', crit: false, source: 'player' }, a.ctx);
  a.step(0.2);
  const slowed = pack.filter((e) => e.ai!.speedMul < 1).length;
  check('the pack falters when its leader dies', !leader.alive && slowed === pack.length, `${slowed}/${pack.length} faltering`);
}

// --- a hero on the ropes gets pressed harder ---------------------------------------
{
  const run = (lifeFrac: number): number => {
    const a = arena(17);
    a.ctx.heroLifeFrac = lifeFrac;
    const pack = ofRole('ambusher', 3).map((d, i) => a.spawn(d, -4 + i * 4, 14));
    for (const e of pack) e.ai!.wake(a.ctx, false);
    let reached = 99;
    a.step(10, (t) => {
      if (reached === 99 && pack.some((e) => dist(e, a.hero) < 3)) reached = t - 1;
    });
    return reached;
  };
  const calm = run(1);
  const bleeding = run(0.2);
  check('a wounded hero is pressed', bleeding < calm, `contact after ${calm.toFixed(1)}s at full life, ${bleeding.toFixed(1)}s when low`);
}

console.log(JSON.stringify({ cases }));
