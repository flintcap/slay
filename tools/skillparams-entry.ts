/**
 * Entry point for `tools/check-skillparams.mjs`.
 *
 * Every skill's `params` block is wrapped so each read is recorded against
 * that skill. Then the game is made to use every skill the way a player
 * would: each class's passives are resolved and its sheet computed with every
 * skill learned, the attack estimate is taken for each active skill, and each
 * active skill is cast twice by the real runner at a small pack of real
 * monsters (some weak enough to die) and the fight is run on. A setting no
 * read ever touched is one the tooltip promises and nothing does.
 */
import * as THREE from 'three';
import { arena } from './combat-arena';
import { promisingEffects } from './sim-effects';
import { SKILLS, TREE_BY_ID } from '../src/data/skills';
import { SkillRunner } from '../src/scenes/SkillRunner';
import { Player } from '../src/entities/Player';
import { createCharacter, equipItem } from '../src/sim/Character';
import { passiveEffects } from '../src/sim/Passives';
import { computeStats } from '../src/sim/Stats';
import { estimateAttack } from '../src/ui/AttackEstimate';
import { MONSTERS } from '../src/data/monsters';
import { Random } from '../src/core/RNG';
import type { CharClassId, Item, SkillDef } from '../src/types';

const DT = 1 / 30;
const RANK = 4;

// 1. Record every read of every skill's settings.
const reads = new Map<string, Set<string>>();
/** The settings as written, for the tool's own looks (reads through these are not counted). */
const raw = new Map<string, Record<string, unknown>>();
for (const s of SKILLS) {
  if (!s.params) continue;
  raw.set(s.id, s.params);
  const got = new Set<string>();
  reads.set(s.id, got);
  s.params = new Proxy(s.params, {
    get(o, k, r) {
      if (typeof k === 'string') got.add(k);
      return Reflect.get(o, k, r);
    },
  });
}

const classOf = (s: SkillDef): CharClassId | undefined => TREE_BY_ID[s.treeId]?.classId as CharClassId | undefined;
const item = (baseId: string): Item => ({ uid: `${baseId}:sp`, baseId, name: baseId, rarity: 'normal', ilvl: 1, mods: [], upgrade: 0, sockets: [], value: 0 }) as Item;

/** Hands to try a skill with, in order, until the runner accepts the cast. */
const KITS: Array<Array<[string, 'mainHand' | 'offHand']>> = [
  [['sword.short', 'mainHand'], ['shield.buckler', 'offHand']],
  [['mace.club', 'mainHand'], ['shield.buckler', 'offHand']],
  [['bow.short', 'mainHand']],
  [['wand.wand', 'mainHand']],
  [['dagger.dagger', 'mainHand'], ['dagger.dagger', 'offHand']],
];
/** The kit each class reaches for first, so its coats and on-hit riders meet the weapon they ride on. */
const FIRST_KIT: Partial<Record<CharClassId, number>> = { ranger: 2, mage: 3, shadowblade: 4 };
const kitsFor = (cls: CharClassId): typeof KITS => {
  const first = FIRST_KIT[cls];
  return first === undefined ? KITS : [KITS[first]!, ...KITS.filter((_, i) => i !== first)];
};

// 2. Each class, every skill learned: passives, sheet.
const classes = [...new Set(SKILLS.map(classOf).filter((c): c is CharClassId => !!c))];
for (const cls of classes) {
  const c = createCharacter('Params', cls, new Random(3));
  c.skills = Object.fromEntries(SKILLS.filter((s) => classOf(s) === cls).map((s) => [s.id, RANK]));
  passiveEffects(c);
  const st = computeStats(c);
  for (const s of SKILLS) {
    if (classOf(s) !== cls || s.targeting === 'passive') continue;
    c.primaryAttack = s.id;
    try {
      estimateAttack(c, st);
    } catch {
      /* the estimate is not under test */
    }
  }
}

// 3. Each active skill, cast for real.
const errors: string[] = [];
const refused: string[] = [];
const brute = MONSTERS.find((m) => m.role === 'brute' && m.weight > 0) ?? MONSTERS[0]!;
for (const s of SKILLS) {
  if (s.targeting === 'passive') continue;
  const cls = classOf(s);
  if (!cls) continue;
  try {
    const kits = kitsFor(cls);
    for (const kit of kits) {
      const a = arena({ seed: 9 });
      const spots: Array<[number, number, number]> = [[0, 2, 60], [1.4, 3.5, 40], [-1.4, 3.5, 1e9], [0.8, 6, 30], [-0.8, 8, 1e9], [0, 11, 1e9]];
      for (const [x, z, life] of spots) {
        const e = a.spawn(brute, x, z);
        e.maxLife = 1e9;
        e.life = life;
      }
      // A skill that bursts a body is given one where it aims.
      if (s.effect === 'corpse.explode') a.enemies[0]!.life = 0;
      const c = createCharacter('Params', cls, new Random(5));
      c.skills = { ...Object.fromEntries(SKILLS.filter((o) => classOf(o) === cls).map((o) => [o.id, 1])), [s.id]: RANK };
      for (const [baseId, slot] of kit) equipItem(c, item(baseId), slot);
      const player = new Player(c, 1);
      const fx = promisingEffects();
      const runner = new SkillRunner(fx.fx as never);
      runner.setContext(a.ctx, a.enemies, null);
      const pctx = { colliders: [], walkableAt: () => true };
      // A skill struck only from the veil is given one.
      const veil = Number(raw.get(s.id)?.requiresStealth ?? 0) > 0;
      const aim = new THREE.Vector3(0, 0, 3);
      // After its own casts, the rest of its tree once each: a skill that shapes the
      // next one (an ambush, a form) is read when that next one goes off.
      const partners = SKILLS.filter((o) => o.treeId === s.treeId && o.id !== s.id && o.targeting !== 'passive');
      let next = 0;
      let cast = 0;
      for (let t = 0; t < 4; t += DT) {
        a.ctx.elapsed += DT;
        player.mana = 1e6;
        player.update(DT, pctx, null);
        runner.update(DT);
        fx.tick(DT);
        for (const e of a.enemies) (e as unknown as { tickStatuses(dt: number, ctx: unknown): void }).tickStatuses(DT, a.ctx);
        if (cast < 2 && !player.isBusy) {
          (player as unknown as { cooldowns?: Map<string, number> }).cooldowns?.clear();
          if (veil) player.applyStatus('veiled', 30);
          if (runner.cast(s.id, player, aim, a.ctx, a.enemies, null)) cast++;
          else if (cast === 0) break;
        } else if (cast >= 2 && !player.isBusy) {
          // Then plain weapon blows, for buffs that ride on them.
          (player as unknown as { cooldowns?: Map<string, number> }).cooldowns?.clear();
          if (next < partners.length) runner.cast(partners[next++]!.id, player, aim, a.ctx, a.enemies, null);
          else runner.basicAttack(player, aim, a.ctx, a.enemies, null);
        }
      }
      if (cast > 0) break;
      if (kit === kits[kits.length - 1]) refused.push(s.id);
    }
  } catch (err) {
    errors.push(`${s.id}: ${String(err).slice(0, 120)}`);
  }
}

const unread: Record<string, string[]> = {};
for (const s of SKILLS) {
  const got = reads.get(s.id);
  if (!got) continue;
  const miss = Object.keys(s.params ?? {}).filter((k) => !got.has(k));
  if (miss.length) unread[s.id] = miss;
}
console.log(JSON.stringify({ unread, errors, refused }));
