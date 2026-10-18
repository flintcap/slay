/**
 * Entry point for `tools/skill-dps.mjs`: how hard each damage skill really
 * hits per second, cast by the real runner on real (standing) monsters.
 *
 * Each skill is pressed whenever the hero is free and it is off cooldown,
 * for `SECONDS`, with endless mana, at rank 1 and rank 10, against one
 * target and against a cluster of five. Damage over time that lands inside
 * the window counts. The rank-1 hero's own sheet is used (no gear), so the
 * numbers compare skills, not builds. Effects keep their promises the way
 * they do in `tools/curve-entry.ts` (`sim-effects.ts`).
 */
import * as THREE from 'three';
import { arena } from './combat-arena';
import { promisingEffects } from './sim-effects';
import { SKILLS, TREE_BY_ID } from '../src/data/skills';
import { SkillRunner } from '../src/scenes/SkillRunner';
import { Player } from '../src/entities/Player';
import { createCharacter, equipItem } from '../src/sim/Character';
import { MONSTERS } from '../src/data/monsters';
import { Random } from '../src/core/RNG';
import type { CharClassId, DamagePacket, SkillDef } from '../src/types';
import type { Enemy } from '../src/entities/Enemy';

const DT = 1 / 30;
const SECONDS = 12;
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const only = env.DPS_ONLY ? new Set(env.DPS_ONLY.split(',')) : null;
const onlyClass = env.DPS_CLASS ?? null;

const TREE_WEAPON: Record<string, string> = { palBlade: 'sword.short' };

const isDamageActive = (s: SkillDef): boolean =>
  s.targeting !== 'passive' && !!s.damageScale && !/^(summon|corpse|buff|stance|banner|shout\.(heal|taunt)|self\.|capstone)/.test(s.effect ?? '');

function dps(classId: CharClassId, s: SkillDef, rank: number, crowd: boolean, dist: number): number {
  const a = arena({ seed: 7 });
  const def = MONSTERS.find((m) => m.role === 'brute' && m.weight > 0) ?? MONSTERS[0]!;
  const spots: Array<[number, number]> = crowd ? [[0, dist], [1.2, dist + 0.6], [-1.2, dist + 0.6], [0.7, dist - 0.9], [-0.7, dist - 0.9]] : [[0, dist]];
  let dealt = 0;
  for (const [x, z] of spots) {
    const e = a.spawn(def, x, z);
    e.maxLife = e.life = 1e9;
    const real = e.takeDamage.bind(e);
    (e as { takeDamage: Enemy['takeDamage'] }).takeDamage = (p: DamagePacket, ctx) => {
      dealt += p.amount;
      real(p, ctx);
    };
  }
  const c = createCharacter('Dps', classId, new Random(5));
  c.skills = { [s.id]: rank };
  const want = TREE_WEAPON[s.treeId];
  if (want) equipItem(c, { uid: `${want}:dps`, baseId: want, name: want, rarity: 'normal', ilvl: 1, mods: [], upgrade: 0, sockets: [], value: 0 }, 'mainHand');
  const player = new Player(c, 1);
  const effects = promisingEffects();
  const runner = new SkillRunner(effects.fx as never);
  runner.setContext(a.ctx, a.enemies, null);
  const pctx = { colliders: [], walkableAt: () => true };
  const target = new THREE.Vector3(0, 0, dist);
  for (let t = 0; t < SECONDS; t += DT) {
    a.ctx.elapsed += DT;
    player.mana = 1e6;
    player.update(DT, pctx, null);
    runner.update(DT);
    effects.tick(DT);
    for (const e of a.enemies) (e as unknown as { tickStatuses(dt: number, ctx: unknown): void }).tickStatuses(DT, a.ctx);
    if (!player.isBusy) runner.cast(s.id, player, target, a.ctx, a.enemies, null);
  }
  return dealt / SECONDS;
}

const rows: Array<Record<string, unknown>> = [];
for (const s of SKILLS) {
  if (!isDamageActive(s)) continue;
  if (only && !only.has(s.id)) continue;
  const cls = TREE_BY_ID[s.treeId]?.classId as CharClassId | undefined;
  if (!cls || (onlyClass && cls !== onlyClass)) continue;
  try {
    const melee = /^(melee|cleave|whirlwind|cone)/.test(s.effect ?? '');
    const dist = melee ? 1.8 : 4;
    rows.push({
      cls,
      tree: s.treeId,
      id: s.id,
      tier: s.tier,
      fx: s.effect,
      one1: Math.round(dps(cls, s, 1, false, dist)),
      crowd1: Math.round(dps(cls, s, 1, true, dist)),
      one10: Math.round(dps(cls, s, 10, false, dist)),
      crowd10: Math.round(dps(cls, s, 10, true, dist)),
    });
  } catch (err) {
    rows.push({ cls, tree: s.treeId, id: s.id, error: String(err).slice(0, 100) });
  }
}
console.log(JSON.stringify({ rows }));
