/**
 * Entry point for `tools/check-rankpower.mjs`.
 *
 * Every active skill, cast at rank 1, rank 2 and its top rank by the real
 * runner on a real monster: something it does (damage, a ward, a buff's or
 * curse's numbers, its time, a heal, a summon) has to be a few percent
 * bigger at rank 2 and far bigger at the top, and the numbers a rank buys
 * must move at every rank. Mana and cooldown do not count.
 */
import * as THREE from 'three';
import { arena, caseLog } from './combat-arena';
import { SKILLS, TREE_BY_ID } from '../src/data/skills';
import { FOE_POWER, SELF_POWER, burstGrowth, minionLifeGrowth } from '../src/data/skillPower';
import { SkillRunner } from '../src/scenes/SkillRunner';
import { Player } from '../src/entities/Player';
import { createCharacter, equipItem } from '../src/sim/Character';
import { MONSTERS } from '../src/data/monsters';
import { Random } from '../src/core/RNG';
import type { CharClassId, DamagePacket } from '../src/types';
import type { Enemy } from '../src/entities/Enemy';

const { cases, check } = caseLog();
const DT = 1 / 60;
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const only = env.RANK_ONLY ? new Set(env.RANK_ONLY.split(',')) : null;

/**
 * Effects that answer like the real ones where it matters here: a projectile
 * or a falling strike lands at once, so its hit callback runs.
 */
const fx: any = new Proxy(function () {}, {
  get: () => fx,
  apply: (_t, _this, args: unknown[]) => {
    const at = [...args].reverse().find((v) => v instanceof THREE.Vector3) as THREE.Vector3 | undefined;
    for (const v of args) {
      if (!v || typeof v !== 'object' || v instanceof THREE.Vector3) continue;
      for (const [k, f] of Object.entries(v as Record<string, unknown>)) {
        if (/^on[A-Z]/.test(k) && typeof f === 'function') {
          try {
            (f as (p: THREE.Vector3) => void)(at ? at.clone() : new THREE.Vector3(0, 0, 1.8));
          } catch {
            /* a callback that wanted more than a point */
          }
        }
      }
    }
    return fx;
  },
});

/** Trees whose skills need a weapon the class does not start with. */
const TREE_WEAPON: Record<string, string> = { palBlade: 'sword.short' };

type Measure = Record<string, number>;

function measure(classId: CharClassId, id: string, rank: number): Measure {
  const a = arena({ seed: 5 });
  const def = MONSTERS.find((m) => m.role === 'brute' && m.weight > 0) ?? MONSTERS[0]!;
  const e = a.spawn(def, 0, 1.8);
  e.maxLife = e.life = 1e7;
  const c = createCharacter('Test', classId, new Random(5));
  c.skills = { [id]: rank };
  // A tree that needs another weapon than the class starts with gets it here.
  const want = TREE_WEAPON[SKILLS.find((s) => s.id === id)?.treeId ?? ''];
  if (want) {
    equipItem(c, { uid: `${want}:test`, baseId: want, name: want, rarity: 'normal', ilvl: 1, mods: [], upgrade: 0, sockets: [], value: 0 }, 'mainHand');
  }
  const player = new Player(c, 1);
  player.mana = 1e6;
  player.life = player.stats.life * 0.3;
  const life0 = player.life;
  const runner = new SkillRunner(fx);
  runner.setContext(a.ctx, a.enemies, null);
  const pctx = { colliders: [], walkableAt: () => true };
  let dealt = 0;
  const real = e.takeDamage.bind(e);
  (e as { takeDamage: Enemy['takeDamage'] }).takeDamage = (p: DamagePacket, ctx) => {
    dealt += p.amount;
    real(p, ctx);
  };
  const turrets = (runner as unknown as { turrets: Array<{ life: number; maxLife: number }> }).turrets ?? [];
  // A skill that mends the host needs a hurt host to mend.
  if (SKILLS.find((s) => s.id === id)?.effect === 'minion.heal') {
    c.skills.raiseSkeleton = 1;
    runner.cast('raiseSkeleton', player, new THREE.Vector3(0, 0, 1.8), a.ctx, a.enemies, null);
    for (const t of turrets) t.life = t.maxLife * 0.1;
    (player as unknown as { cooldowns?: Map<string, number> }).cooldowns?.clear();
    for (let i = 0; i < 60; i++) {
      a.ctx.elapsed += DT;
      player.update(DT, pctx, null);
    }
  }
  // What some skills need on the field: the veil (Umbral Ambush), a body
  // (Corpse Explosion), a Shocked enemy (The Eye of the Storm).
  const skill = SKILLS.find((s) => s.id === id);
  if (Number(skill?.params?.requiresStealth ?? 0) > 0) player.applyStatus('veiled', 30);
  if (skill?.effect === 'corpse.explode') {
    const body = a.spawn(def, 0, 2.2);
    body.maxLife = 1000;
    body.life = 0;
    runner.update(DT);
  }
  if ((skill?.effect ?? '').includes('eyeOfStorm')) e.applyStatuses([{ id: 'shocked', duration: 60, magnitude: 1, stacks: 1 }], a.ctx);
  runner.cast(id, player, new THREE.Vector3(0, 0, 1.8), a.ctx, a.enemies, null);
  // Long enough for a delayed burst (Doom Brand) to go off.
  type Foe = Array<{ id: string; time: number; magnitude: number; mods?: Record<string, number> }>;
  const foeOf = (): Foe => (e as unknown as { statuses: Foe }).statuses ?? [];
  // Buffs and curses are read a second in, before the short ones run out.
  let mine = player.status.list();
  let foe: Foe = [];
  for (let i = 0; i < Math.ceil(9 / DT); i++) {
    a.ctx.elapsed += DT;
    player.update(DT, pctx, null);
    runner.update(DT);
    (e as unknown as { tickStatuses(dt: number, ctx: unknown): void }).tickStatuses(DT, a.ctx);
    if (i === Math.ceil(1 / DT)) {
      mine = player.status.list().map((st) => ({ ...st }));
      foe = foeOf().map((st) => ({ ...st }));
    }
  }
  // Each status and each of its numbers on its own line, so a form held all
  // the while (or a big fixed bonus) does not drown what the rank changed.
  const out: Measure = { dealt, summons: turrets.length, heal: player.life - life0 };
  out.sumLife = turrets.reduce((t, m) => t + m.maxLife, 0);
  out.sumLifeNow = turrets.reduce((t, m) => t + m.life, 0);
  for (const st of mine) {
    const key = `self:${st.def.id}`;
    out[`${key}:absorb`] = st.absorb;
    if (Number.isFinite(st.remaining) && st.remaining < 1e5) out[`${key}:time`] = st.remaining;
    for (const [m, v] of Object.entries((st.mods ?? st.def.mods ?? {}) as Record<string, number>)) out[`${key}:${m}`] = Math.abs(v);
  }
  for (const st of foe) {
    const key = `foe:${st.id}`;
    out[`${key}:time`] = st.time;
    out[`${key}:mag`] = st.magnitude;
    for (const [m, v] of Object.entries(st.mods ?? {})) out[`${key}:${m}`] = Math.abs(v);
  }
  return out;
}

/** How much bigger the measure that grows most is at `hi` than at `lo`. */
function growth(lo: Measure, hi: Measure): number {
  let best = 1;
  for (const [k, v] of Object.entries(hi)) {
    const a = lo[k] ?? 0;
    if (a > 1e-6) best = Math.max(best, v / a);
    else if (v > 1e-6) best = Math.max(best, 10);
  }
  // A heal that already fills its target at the top rank has grown all it can.
  if (hi.sumLife! > 0 && hi.sumLifeNow! >= hi.sumLife! - 1e-6 && lo.sumLifeNow! < lo.sumLife! - 1e-6) best = Math.max(best, 10);
  return best;
}

/**
 * The owner's rule: a point must make the skill itself stronger, not only
 * cheaper or quicker. Rank 2 must add a few percent to something it does;
 * the top rank must be well past rank 1.
 */
const STEP = 1.03;
const topNeed = (max: number): number => (max >= 20 ? 1.5 : max >= 10 ? 1.3 : 1.15);

const flat: string[] = [];
const weak: string[] = [];
for (const s of SKILLS) {
  if (s.targeting === 'passive') continue;
  if (only && !only.has(s.id)) continue;
  const cls = TREE_BY_ID[s.treeId]?.classId as CharClassId | undefined;
  if (!cls) continue;
  const top = Math.min(20, s.maxRank);
  let lo: Measure, two: Measure, hi: Measure;
  try {
    lo = measure(cls, s.id, 1);
    two = measure(cls, s.id, 2);
    hi = measure(cls, s.id, top);
  } catch (err) {
    check(`${s.id} casts`, false, String(err).slice(0, 120));
    continue;
  }
  const g2 = growth(lo, two);
  const gTop = growth(lo, hi);
  if (g2 < STEP) flat.push(`${cls}:${s.id} x${g2.toFixed(2)}`);
  if (gTop < topNeed(top)) weak.push(`${cls}:${s.id} x${gTop.toFixed(2)} at ${top}`);
  if (only || env.RANK_REPORT) console.error(`${cls}\t${s.id}\tx2=${g2.toFixed(2)}\tx${top}=${gTop.toFixed(2)}`);
}
check('rank 2 adds to what the skill does (+3%)', flat.length === 0, flat.length ? `small: ${flat.join(', ')}` : 'all step up');

// Every rank, not just the second: the numbers a point buys must move at
// each one. Rounded to tenths, a small damage step used to buy nothing at
// some ranks.
const dead: string[] = [];
const num = (s: (typeof SKILLS)[number]) => (key: string, d: number): number => (typeof s.params?.[key] === 'number' ? (s.params[key] as number) : d);
for (const s of SKILLS) {
  if (s.targeting === 'passive') continue;
  const n = num(s);
  const top = Math.min(20, s.maxRank);
  for (let r = 1; r < top; r++) {
    const at = (rank: number): string =>
      JSON.stringify([
        s.damageScale ? s.damageScale(rank) : burstGrowth(s.id, rank - 1, n),
        SELF_POWER[s.id]?.(rank - 1, n),
        FOE_POWER[s.id]?.(rank - 1, n),
        /^summon\./.test(s.effect ?? '') ? minionLifeGrowth(s.id, rank - 1, n) : 0,
      ]);
    if (at(r) === at(r + 1)) {
      dead.push(`${s.id}@${r + 1}`);
      break;
    }
  }
}
check('every rank buys something', dead.length === 0, dead.length ? `nothing new at: ${dead.join(', ')}` : 'every rank counts');
// A summon stays until it falls, so a point spent while it stands must reach
// it: cast at rank 1, learn rank 5, and the one at your side hits harder and
// has more life without a recast.
const stale: string[] = [];
for (const s of SKILLS) {
  if (!/^summon\./.test(s.effect ?? '') || (only && !only.has(s.id))) continue;
  const cls = TREE_BY_ID[s.treeId]?.classId as CharClassId | undefined;
  if (!cls) continue;
  const a = arena({ seed: 7 });
  const c = createCharacter('Test', cls, new Random(7));
  // Sworn Brother rises when a banner is planted, not when it is cast.
  const via = s.effect === 'summon.fromBanner' ? 'bannerOfTheGate' : s.id;
  c.skills = { [s.id]: 1, [via]: 1 };
  const player = new Player(c, 1);
  player.mana = 1e6;
  const runner = new SkillRunner(fx);
  runner.setContext(a.ctx, a.enemies, null);
  runner.cast(via, player, new THREE.Vector3(0, 0, 1.8), a.ctx, a.enemies, null);
  type T = { life: number; maxLife: number; power: number };
  const ts = (runner as unknown as { turrets: T[] }).turrets;
  // A spell that lets go on its release frame (a Knight's standard) raises its body a beat later.
  for (let i = 0; i < 30 && ts.length === 0; i++) runner.update(DT);
  const before = ts.map((t) => [t.maxLife, t.power]);
  c.skills[s.id] = 5;
  for (let i = 0; i < 60; i++) runner.update(DT);
  const grew = ts.length > 0 && ts.every((t, i) => t.power > before[i]![1]! * 1.02 && t.maxLife >= before[i]![0]!);
  if (!grew) stale.push(s.id);
}
check('a standing summon grows when you spend a point', stale.length === 0, stale.length ? `stuck: ${stale.join(', ')}` : 'all grow in place');
check('the top rank is far past rank 1', weak.length === 0, weak.length ? `weak: ${weak.join(', ')}` : 'all grow');
console.log(JSON.stringify({ cases }));
