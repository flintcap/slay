/**
 * Entry point for `tools/check-roomrules.mjs`: the fifteen boss room rules
 * (src/entities/RoomRules.ts), each in its own test arena.
 *
 * Each rule is fought twice, or more. Once by a hero who solves it (breaks the
 * portals, rings the bells, walks the tiles) and once by one who gets it wrong.
 * The solver must see the rule work and the boss fall; the fumbler must pay in
 * time (the boss heals, wards or hides) and never in life: no fumble hurts,
 * and the fight clock gets the time back.
 *
 * The arena is a round room, 14 m out from where the boss stands, so a
 * charge has a wall to hit.
 */
import * as THREE from 'three';
import { arena, caseLog, type Arena } from './combat-arena';
import { Boss } from '../src/entities/Boss';
import { BOSSES } from '../src/data/bosses';
import { RULE_KINDS, SAFE_RING, type RoomRule } from '../src/entities/RoomRules';
import { Random } from '../src/core/RNG';
import { events } from '../src/core/Events';
import type { Enemy } from '../src/entities/Enemy';
import type { BossDef, BossPhase } from '../src/types';

declare const process: { argv: string[] };
const { cases, check } = caseLog();
const DT = 1 / 30;
const only = process.argv.find((x) => x.startsWith('--only='))?.split('=')[1]?.split(',');

interface Tel {
  kind: string;
  x: number;
  z: number;
  size: number;
  color: number;
  from: number;
  until: number;
}

interface Rig {
  a: Arena;
  boss: Boss;
  rule: () => RoomRule;
  tels: Tel[];
  status: string[];
  fumbleHits: number;
  now: () => number;
  /** A hero's blow worth `share` of the boss's life. */
  hit(share: number): number;
  objects(id: string): Enemy[];
  kill(e: Enemy): void;
  run(seconds: number, each?: (t: number) => void): void;
  life(): number;
}

const BASE = BOSSES.find((b) => b.id === 'butcher_grell')!;

function ruleDef(kind: string, phases: number, extra: Partial<BossDef> = {}): BossDef {
  const src = BASE.phases;
  const out: BossPhase[] = [];
  for (let i = 0; i < phases; i++) {
    const p = src[Math.min(i, src.length - 1)]!;
    out.push({ ...p, atLife: i === 0 ? 1 : 1 - i / phases, arena: kind, bark: undefined });
  }
  return { ...BASE, id: `test_${kind}`, name: `Test ${kind}`, phases: out, adds: ['skeleton_rattler'], ...extra };
}

function setup(kind: string, o: { phases?: number; seed?: number; def?: Partial<BossDef> } = {}): Rig {
  const seed = o.seed ?? 7;
  const a = arena({ seed, depth: 12, solid: (x, z) => Math.hypot(x, z - 7) > 14 });
  const tels: Tel[] = [];
  const status: string[] = [];
  const decals = a.ctx.decals as unknown as Record<string, unknown>;
  const realTel = decals.telegraph as (...args: unknown[]) => { cancel(): void };
  (a.ctx as { decals: unknown }).decals = new Proxy(decals, {
    get(t, k) {
      if (k === 'telegraph') {
        return (kind2: string, x: number, z: number, size: number, rot: number, duration: number, color = 0) => {
          tels.push({ kind: kind2, x, z, size, color, from: a.ctx.elapsed, until: a.ctx.elapsed + duration });
          return realTel(kind2, x, z, size, rot, duration, color);
        };
      }
      return t[k as string];
    },
  });
  a.ctx.applyHeroStatus = (id: string) => {
    status.push(id);
  };
  const boss = new Boss(ruleDef(kind, o.phases ?? 2, o.def), 12, new Random(seed));
  boss.root.position.set(0, 0, 7);
  a.enemies.push(boss);
  a.hero.set(0, 0, 0);
  boss.engage(a.ctx);
  const rig: Rig = {
    a,
    boss,
    rule: () => boss.rule!,
    tels,
    status,
    fumbleHits: 0,
    now: () => a.ctx.elapsed,
    hit(share) {
      const before = boss.life + boss.shield;
      boss.takeDamage({ amount: boss.maxLife * share, type: 'physical', crit: false, source: 'player' }, a.ctx);
      return before - (boss.life + boss.shield);
    },
    objects: (id) => a.enemies.filter((e) => e.alive && e.monsterId === id),
    kill(e) {
      e.takeDamage({ amount: e.maxLife * 5, type: 'physical', crit: false, source: 'player' }, a.ctx);
    },
    run(seconds, each) {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n && boss.alive; i++) {
        a.step(DT);
        each?.(a.ctx.elapsed);
      }
    },
    life: () => boss.life / boss.maxLife,
  };
  // A fumble must never come with a blow: note any rule hit in the same frame.
  let fumbledAt = -1;
  const off = events.on('boss:fumble', () => {
    fumbledAt = a.ctx.elapsed;
  });
  const realDamage = a.ctx.damagePlayer;
  a.ctx.damagePlayer = (p) => {
    if (Math.abs(a.ctx.elapsed - fumbledAt) < 1e-6 && (p.ability ?? '').startsWith('arena.')) rig.fumbleHits++;
    realDamage(p);
  };
  disposers.push(off);
  return rig;
}

const disposers: Array<() => void> = [];
/** What a 2% blow takes off a boss with no rule, after its armour: the bar for "takes it all". */
const FULL = ((): number => {
  const a = arena({ seed: 3, depth: 12 });
  const b = new Boss({ ...ruleDef('none', 2), phases: ruleDef('none', 2).phases.map((p) => ({ ...p, arena: undefined })) }, 12, new Random(3));
  b.root.position.set(0, 0, 7);
  a.enemies.push(b);
  b.engage(a.ctx);
  a.step(1.5);
  const before = b.life;
  b.takeDamage({ amount: b.maxLife * 0.02, type: 'physical', crit: false, source: 'player' }, a.ctx);
  return (before - b.life) / b.maxLife;
})();
const pct = (x: number, b: Boss): string => `${((x / b.maxLife) * 100).toFixed(2)}% (full ${(FULL * 100).toFixed(2)}%)`;
const want = (k: string): boolean => !only || only.includes(k);
/** Fight clock seconds, read off the boss. */
const clock = (b: Boss): number => (b as unknown as { fightTime: number }).fightTime;
/** Hits the boss steadily, `share` of its life every half second, for `secs`. */
function pound(r: Rig, share: number, secs: number, each?: (t: number) => void): void {
  let acc = 0;
  r.run(secs, (t) => {
    acc += DT;
    if (acc >= 0.5) {
      acc = 0;
      r.hit(share);
    }
    each?.(t);
  });
}
function fair(r: Rig, name: string): void {
  check(`${name}: fumbles cost time, never life`, r.fumbleHits === 0 && (r.boss.fumbles === 0 || r.boss.fumbleTime > 0), `${r.boss.fumbles} fumbles, ${r.boss.fumbleTime.toFixed(1)} s handed back, ${r.fumbleHits} rule blows on a fumble`);
}

// --- 1. ward portals --------------------------------------------------------
if (want('wardPortals')) {
  const lazy = setup('wardPortals');
  lazy.run(14);
  const warded = lazy.boss.shield;
  check('wardPortals: portals left up feed it a ward', lazy.objects('ward_portal').length === 3 && warded > 0 && lazy.rule().fumbled > 0, `3 portals, shield ${Math.round(warded)} after 14 s`);
  fair(lazy, 'wardPortals');
  const good = setup('wardPortals');
  good.run(7);
  for (const p of good.objects('ward_portal')) good.kill(p);
  good.run(0.2);
  check('wardPortals: breaking them drops the ward', good.boss.shield === 0 && good.rule().solved === 1 && good.boss.hasBuff('ward_down'), `shield ${Math.round(good.boss.shield)}, solved ${good.rule().solved}`);
  good.run(24.5);
  check('wardPortals: they open again later', good.objects('ward_portal').length === 3, `${good.objects('ward_portal').length} portals after 25 s`);
}

// --- 2. heartstones ---------------------------------------------------------
if (want('heartstones')) {
  const r = setup('heartstones');
  r.run(1.5);
  const t0 = clock(r.boss);
  pound(r, 0.02, 6);
  check('heartstones: no harm while the stones beat', r.life() === 1 && Math.abs(clock(r.boss) - t0) < 0.01, `life ${(r.life() * 100).toFixed(1)}%, fight clock ran ${(clock(r.boss) - t0).toFixed(2)} s`);
  for (const s of r.objects('heartstone')) r.kill(s);
  r.run(0.1);
  pound(r, 0.02, 5);
  check('heartstones: still stones bare its heart', r.life() < 0.9 && r.rule().solved === 1, `life ${(r.life() * 100).toFixed(0)}% after 5 s`);
  r.run(10);
  check('heartstones: they grow back', r.objects('heartstone').length === 3, `${r.objects('heartstone').length} stones`);
}

// --- 3. bells ---------------------------------------------------------------
if (want('bells')) {
  const lazy = setup('bells');
  pound(lazy, 0.01, 8.6);
  check('bells: the knell brings three bells', lazy.objects('rite_bell').length === 3 && lazy.boss.channel > 0, `${lazy.objects('rite_bell').length} bells, channel ${lazy.boss.channel.toFixed(1)} s`);
  const mid = lazy.life();
  lazy.run(11);
  check('bells: unbroken, it mends and wards', lazy.rule().fumbled === 1 && lazy.life() > mid && lazy.boss.shield > 0 && lazy.objects('rite_bell').length === 0, `life ${(mid * 100).toFixed(0)}% -> ${(lazy.life() * 100).toFixed(0)}%, shield ${Math.round(lazy.boss.shield)}`);
  fair(lazy, 'bells');
  const good = setup('bells');
  good.run(8.5);
  for (const b of good.objects('rite_bell')) good.kill(b);
  good.run(0.2);
  check('bells: ringing all three breaks it', good.rule().solved === 1 && good.boss.channel === 0 && good.boss.hasBuff('knell_broken'), `solved ${good.rule().solved}`);
}

// --- 4. braziers ------------------------------------------------------------
if (want('braziers')) {
  const r = setup('braziers');
  r.run(0.5);
  const dark = r.hit(0.02);
  check('braziers: unseen in the dark, and hard to hurt', r.boss.untargetable && dark < r.boss.maxLife * 0.02 * 0.5, `untargetable ${r.boss.untargetable}, a 2% blow took ${((dark / r.boss.maxLife) * 100).toFixed(2)}%`);
  const b = r.objects('rite_brazier');
  r.kill(b[0]!);
  r.kill(b[1]!);
  r.run(0.2);
  const lit = r.hit(0.02);
  check('braziers: two lit and it is seen', !r.boss.untargetable && lit > r.boss.maxLife * FULL * 0.9 && r.rule().solved === 1, `untargetable ${r.boss.untargetable}, a 2% blow took ${pct(lit, r.boss)}`);
  r.run(16);
  check('braziers: one gutters out after a while', r.objects('rite_brazier').length === 3 && r.boss.untargetable, `${r.objects('rite_brazier').length} cold braziers`);
}

// --- 5. linked pair ---------------------------------------------------------
if (want('linked')) {
  const r = setup('linked');
  r.run(0.5);
  const partner = (): Enemy | undefined => r.a.enemies.find((e) => e !== r.boss && e.monsterId === 'skeleton_rattler' && e.rank === 'champion');
  const p = partner()!;
  check('linked: a partner stands beside it', !!p && p.maxLife > r.boss.maxLife * 0.5, p ? `partner life ${Math.round(p.maxLife)} vs boss ${Math.round(r.boss.maxLife)}` : 'none');
  r.kill(p);
  r.run(9);
  const back = r.a.enemies.find((e) => e !== p && e.alive && e.rank === 'champion');
  check('linked: a lone kill rises again', !!back && r.rule().fumbled === 1, `risen ${!!back}, fumbles ${r.rule().fumbled}`);
  fair(r, 'linked');
  // Boss first: it kneels, waiting on the other half.
  const r2 = setup('linked');
  r2.run(2);
  for (let i = 0; i < 40 && r2.boss.life > 1; i++) {
    r2.hit(0.1);
    r2.run(1.2);
  }
  check('linked: brought down first, it kneels', r2.boss.alive && r2.boss.hasBuff('kneel'), `alive ${r2.boss.alive}, kneeling ${r2.boss.hasBuff('kneel')}`);
  const p2 = r2.a.enemies.find((e) => e !== r2.boss && e.alive && e.rank === 'champion')!;
  r2.kill(p2);
  r2.run(0.3);
  check('linked: both down together and it dies', !r2.boss.alive, `alive ${r2.boss.alive}`);
}

// --- 6. lure ----------------------------------------------------------------
if (want('lure')) {
  const r = setup('lure');
  r.run(0.5);
  const t0 = clock(r.boss);
  pound(r, 0.02, 2);
  check('lure: glazed, it cannot be hurt', r.life() === 1 && clock(r.boss) - t0 < 0.01, `life ${(r.life() * 100).toFixed(1)}%`);
  // Stand still for the pool, then step past it so the boss walks through.
  let cracked = false;
  r.run(30, () => {
    const pools = r.tels.filter((t) => t.color === 0x40c0ff && t.until <= r.now() && t.until > r.now() - 12);
    const pool = pools[pools.length - 1];
    if (pool) {
      const b = r.boss.root.position;
      const a = Math.atan2(pool.x - b.x, pool.z - b.z);
      r.a.hero.set(pool.x + Math.sin(a) * 4, 0, pool.z + Math.cos(a) * 4);
    }
    if (!cracked && r.boss.hasBuff('glaze_cracked')) cracked = true;
  });
  const before = r.life();
  const took = r.hit(0.02);
  check('lure: led into its pool, the glaze cracks', cracked && r.rule().solved >= 1 && before < 1, `cracks ${r.rule().solved}, life ${(before * 100).toFixed(0)}%, last blow ${((took / r.boss.maxLife) * 100).toFixed(1)}%`);
}

// --- 7. tiles ---------------------------------------------------------------
if (want('tiles')) {
  const r = setup('tiles');
  // Walk to each lit tile as it lights.
  r.run(16, () => {
    const lit = r.tels.filter((t) => t.color === SAFE_RING && t.from <= r.now() && t.until > r.now());
    const t = lit[lit.length - 1];
    if (t) r.a.hero.set(t.x, 0, t.z);
  });
  const open = r.hit(0.02);
  check('tiles: walking the order opens it', r.rule().solved >= 1 && open > r.boss.maxLife * FULL * 0.9, `solved ${r.rule().solved}, a 2% blow took ${pct(open, r.boss)}`);
  const w = setup('tiles');
  w.run(5.2);
  const decoy = w.tels.find((t) => t.color === 0xff4040);
  if (decoy) w.a.hero.set(decoy.x, 0, decoy.z);
  w.run(1);
  const shut = w.hit(0.02);
  check('tiles: a wrong tile slows you and wards it', !!decoy && w.status.includes('chill') && w.boss.shield > 0 && shut < w.boss.maxLife * 0.01, `slowed ${w.status.includes('chill')}, shield ${Math.round(w.boss.shield)}`);
  fair(w, 'tiles');
}

// --- 8. stalker -------------------------------------------------------------
if (want('stalker')) {
  const r = setup('stalker');
  r.run(0.5);
  check('stalker: it fades from sight', r.boss.untargetable, `untargetable ${r.boss.untargetable}`);
  r.a.hero.set(12, 0, -4);
  r.run(3);
  r.hit(0.01);
  r.run(0.1);
  check('stalker: a blow shows it', !r.boss.untargetable && r.rule().solved === 1, `untargetable ${r.boss.untargetable}`);
  r.run(4);
  check('stalker: it fades again', r.boss.untargetable, `untargetable ${r.boss.untargetable}`);
}

// --- 9. mirror --------------------------------------------------------------
if (want('mirror')) {
  const r = setup('mirror');
  r.run(3.5);
  const echoes = r.objects('hero_echo');
  const half = r.hit(0.02);
  check('mirror: an echo of you steps out, and it takes half', echoes.length >= 1 && half < r.boss.maxLife * FULL * 0.6, `${echoes.length} echo, a 2% blow took ${((half / r.boss.maxLife) * 100).toFixed(2)}%`);
  for (const e of echoes) r.kill(e);
  r.run(0.2);
  const full = r.hit(0.02);
  check('mirror: echoes down, it takes it all', full > r.boss.maxLife * FULL * 0.9 && r.rule().solved >= 1, `a 2% blow took ${pct(full, r.boss)}`);
}

// --- 10. breaking cast ------------------------------------------------------
if (want('breakingCast')) {
  const lazy = setup('breakingCast');
  pound(lazy, 0.005, 12.5);
  const mid = lazy.life();
  check('breakingCast: a great cast begins', lazy.boss.channel > 0, `channel ${lazy.boss.channel.toFixed(1)} s`);
  lazy.run(8.5);
  const adds = lazy.a.enemies.filter((e) => e.alive && e.monsterId === 'skeleton_rattler').length;
  check('breakingCast: unbroken, it heals and calls adds', lazy.rule().fumbled === 1 && lazy.life() > mid && adds > 0, `life ${(mid * 100).toFixed(0)}% -> ${(lazy.life() * 100).toFixed(0)}%, ${adds} adds`);
  fair(lazy, 'breakingCast');
  const good = setup('breakingCast');
  good.run(11);
  for (let i = 0; i < 120 && good.boss.channel <= 0; i++) good.run(0.1);
  pound(good, 0.04, 4);
  check('breakingCast: enough damage breaks it', good.rule().solved === 1 && good.boss.hasBuff('cast_broken'), `solved ${good.rule().solved}`);
}

// --- 11. chase --------------------------------------------------------------
if (want('chase')) {
  const r = setup('chase', { phases: 3 });
  r.run(1);
  const start = r.boss.root.position.clone();
  while (r.boss.phaseIndex < 1 && r.boss.alive) {
    r.hit(0.05);
    r.run(0.3);
  }
  const from = r.boss.root.position.clone();
  const t0 = clock(r.boss);
  const fleeing = r.boss.hasBuff('fleeing');
  let flight = 0;
  for (; flight < 8 && r.boss.hasBuff('fleeing'); flight += 0.1) r.run(0.1);
  const moved = r.boss.root.position.distanceTo(from);
  const at = Math.hypot(r.boss.root.position.x - r.boss.home.x, r.boss.root.position.z - r.boss.home.z);
  check('chase: each new phase it flees to the next room', fleeing && at < 1.5 && clock(r.boss) - t0 < 0.2, `fled ${moved.toFixed(1)} m in ${flight.toFixed(1)} s, fight clock ran ${(clock(r.boss) - t0).toFixed(2)} s meanwhile`);
  const home = new THREE.Vector3(r.boss.home.x, 0, r.boss.home.z);
  check('chase: the room rules move with it', home.distanceTo(start) > 5 && !r.boss.hasBuff('fleeing'), `new centre ${home.distanceTo(start).toFixed(1)} m away`);
}

// --- 12. defend -------------------------------------------------------------
if (want('defend')) {
  const lazy = setup('defend');
  lazy.a.hero.set(-10, 0, 10);
  pound(lazy, 0.01, 30);
  const mid = lazy.life();
  check('defend: unguarded, the lantern goes out', lazy.rule().fumbled >= 1, `fumbles ${lazy.rule().fumbled}, life ${(mid * 100).toFixed(0)}%`);
  fair(lazy, 'defend');
  const ring = lazy.tels.filter((t) => t.color === SAFE_RING).pop()!;
  lazy.a.hero.set(ring.x, 0, ring.z);
  lazy.run(3);
  check('defend: stand by it to relight it', lazy.rule().solved === 1, `solved ${lazy.rule().solved}`);
  const good = setup('defend');
  good.run(0.2);
  const g = good.tels.filter((t) => t.color === SAFE_RING).pop()!;
  good.a.hero.set(g.x, 0, g.z);
  good.run(30);
  check('defend: guarded, it stays lit', good.rule().fumbled === 0, `fumbles ${good.rule().fumbled}`);
}

// --- 13. guard break --------------------------------------------------------
if (want('guardBreak')) {
  const r = setup('guardBreak');
  r.run(0.5);
  const guarded = r.hit(0.02);
  let n = 0;
  while (!r.boss.hasBuff('guard_broken') && n++ < 40) {
    r.hit(0.02);
    r.run(0.2);
  }
  const broken = r.hit(0.02);
  check('guardBreak: the guard turns blows aside', guarded < r.boss.maxLife * FULL * 0.5, `a 2% blow took ${((guarded / r.boss.maxLife) * 100).toFixed(2)}%`);
  check('guardBreak: break it for big damage', r.rule().solved === 1 && broken > guarded * 2.5, `broke after ${n} blows; a 2% blow took ${((broken / r.boss.maxLife) * 100).toFixed(2)}%`);
  r.run(7);
  const again = r.hit(0.02);
  check('guardBreak: the guard comes back', again < r.boss.maxLife * FULL * 0.5, `a 2% blow took ${((again / r.boss.maxLife) * 100).toFixed(2)}%`);
}

// --- 14. weak points --------------------------------------------------------
if (want('weakPoints')) {
  const r = setup('weakPoints');
  r.run(0.5);
  const kit = r.boss.abilityIds.length;
  // Strike from in front: an arm.
  r.boss.facing = Math.PI;
  for (let i = 0; i < 40 && r.rule().solved === 0; i++) {
    r.boss.facing = Math.PI;
    r.hit(0.02);
    r.run(0.2);
  }
  check('weakPoints: a broken limb takes an attack away', r.rule().solved === 1 && r.boss.abilityIds.length === kit - 1, `kit ${kit} -> ${r.boss.abilityIds.length}`);
  while (r.boss.phaseIndex < 1 && r.boss.alive) {
    r.hit(0.04);
    r.run(0.3);
  }
  r.run(0.2);
  const phase2 = BASE.phases[1]!.abilities.filter((id) => r.boss.abilityIds.includes(id)).length;
  check('weakPoints: it stays broken into the next phase', r.boss.abilityIds.length < BASE.phases[1]!.abilities.length || phase2 < BASE.phases[1]!.abilities.length, `phase 2 kit ${r.boss.abilityIds.length} of ${BASE.phases[1]!.abilities.length}`);
}

// --- 15. chains -------------------------------------------------------------
if (want('chains')) {
  const r = setup('chains');
  r.a.hero.set(0, 0, 0);
  r.run(6);
  const p = r.boss.root.position;
  check('chains: chained near the middle', Math.hypot(p.x, p.z - 7) < 3.6, `${Math.hypot(p.x, p.z - 7).toFixed(1)} m from the centre`);
  // Stand by the wall so its charge carries on into it.
  r.a.hero.set(0, 0, -5);
  r.kill(r.objects('chain_anchor')[0]!);
  let stunned = false;
  let warned = 0;
  r.run(4, () => {
    if (r.boss.hasBuff('wall_stunned')) stunned = true;
  });
  const line = r.tels.find((t) => t.kind === 'line' && t.color === 0xff8030);
  if (line) warned = line.until - line.from;
  check('chains: a cut chain sets off a warned charge', !!line && warned >= 0.8, `warned ${warned.toFixed(2)} s`);
  check('chains: into a wall, it is stunned and open', stunned && r.rule().solved >= 1, `stunned ${stunned}`);
  for (const a of r.objects('chain_anchor')) r.kill(a);
  r.run(1);
  const free = r.hit(0.02);
  check('chains: all cut, it takes full blows', free > r.boss.maxLife * FULL * 0.9, `a 2% blow took ${pct(free, r.boss)}`);
}

// --- every rule: a hero who just fights still wins --------------------------
{
  const slow: string[] = [];
  for (const kind of RULE_KINDS) {
    if (!want(kind)) continue;
    const r = setup(kind, { seed: 31 });
    // A plain player: hits the boss, breaks whatever is in the room, stands by
    // a green ring if there is one.
    let acc = 0;
    let t = 0;
    let lurePool: Tel | null = null;
    for (; t < 400 && r.boss.alive; t += DT) {
      r.a.step(DT);
      acc += DT;
      const ring = r.tels.filter((q) => q.color === SAFE_RING && q.from <= r.now() && q.until > r.now()).pop();
      if (ring) r.a.hero.set(ring.x, 0, ring.z);
      if (acc < 0.5) continue;
      acc = 0;
      const others = r.a.enemies.filter((e) => e !== r.boss && e.alive);
      others.sort((x, y) => Number(!!y.def.object) - Number(!!x.def.object));
      if (others[0]) others[0].takeDamage({ amount: others[0].maxLife * 0.3, type: 'physical', crit: false, source: 'player' }, r.a.ctx);
      // A lure boss is hurt by its pools, not by you: walk it through them.
      if (kind === 'lure') {
        const pool = r.tels.filter((q) => q.color === 0x40c0ff && q.until <= r.now()).pop();
        if (pool && pool !== lurePool) {
          // Once per pool: step past it, so the boss comes on through.
          lurePool = pool;
          const b = r.boss.root.position;
          const ang = Math.atan2(pool.x - b.x, pool.z - b.z);
          r.a.hero.set(pool.x + Math.sin(ang) * 3.4, 0, pool.z + Math.cos(ang) * 3.4);
        }
      }
      r.hit(0.012);
    }
    if (r.boss.alive) slow.push(`${kind} (${Math.round(r.life() * 100)}% left)`);
    else cases.push({ name: `fight: ${kind}`, ok: true, detail: `down in ${Math.round(t)} s, ${r.boss.fumbles} fumbles` });
  }
  check('every rule: a plain fighter brings it down', slow.length === 0, slow.length ? slow.join(', ') : 'all fell inside 400 s');
}

for (const d of disposers) d();
console.log(JSON.stringify({ cases }));
