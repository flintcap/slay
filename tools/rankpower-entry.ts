/**
 * Entry point for `tools/check-rankpower.mjs`.
 *
 * Every active skill, cast at rank 1 and at rank 10 by the real runner on a
 * real monster: something it does has to be bigger at 10 (damage, a ward, a
 * buff's or curse's numbers, its time, a heal, a summon). Mana and cooldown
 * do not count.
 */
import * as THREE from 'three';
import { arena, caseLog } from './combat-arena';
import { SKILLS, TREE_BY_ID } from '../src/data/skills';
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

const sumMods = (m: Record<string, number> | undefined): number =>
  m ? Object.values(m).reduce((a, v) => a + Math.abs(v), 0) : 0;

/** Trees whose skills need a weapon the class does not start with. */
const TREE_WEAPON: Record<string, string> = { palBlade: 'sword.short' };

function measure(classId: CharClassId, id: string, rank: number): number[] {
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
  return [
    dealt,
    mine.reduce((s, st) => s + st.absorb, 0),
    mine.reduce((s, st) => s + st.remaining, 0),
    mine.reduce((s, st) => s + sumMods((st.mods ?? st.def.mods) as Record<string, number>), 0),
    foe.reduce((s, st) => s + st.time, 0),
    foe.reduce((s, st) => s + st.magnitude + sumMods(st.mods), 0),
    turrets.length,
    turrets.reduce((s, t) => s + t.maxLife, 0),
    turrets.reduce((s, t) => s + t.life, 0),
    player.life - life0,
  ];
}

const flat: string[] = [];
for (const s of SKILLS) {
  if (s.targeting === 'passive') continue;
  if (only && !only.has(s.id)) continue;
  const cls = TREE_BY_ID[s.treeId]?.classId as CharClassId | undefined;
  if (!cls) continue;
  let lo: number[], hi: number[];
  try {
    lo = measure(cls, s.id, 1);
    hi = measure(cls, s.id, 10);
  } catch (err) {
    check(`${s.id} casts`, false, String(err).slice(0, 120));
    continue;
  }
  const grows = hi.some((v, i) => v > lo[i]! * 1.02 + 1e-6);
  if (!grows) flat.push(`${cls}:${s.id}`);
  if (only) console.error(s.id, lo.map((v) => +v.toFixed(1)).join(' '), '->', hi.map((v) => +v.toFixed(1)).join(' '));
}
check('every active skill is stronger at rank 10 than at rank 1', flat.length === 0, flat.length ? `flat: ${flat.join(', ')}` : 'all grow');
console.log(JSON.stringify({ cases }));
