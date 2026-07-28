import * as THREE from 'three';
import type { DamagePacket, DamageType } from '../types';
import { events } from '../core/Events';
import { audio } from '../audio/Audio';
import { SKILLS } from '../data/skills';
import { rollDamage } from '../sim/Combat';
import { skillRank } from '../sim/Character';
import type { Player } from '../entities/Player';
import type { Enemy, CombatContext } from '../entities/Enemy';
import type { Boss } from '../entities/Boss';
import { EffectSystem, ELEMENTS } from '../fx/Effects';
import { getStatus, synthesizeSkillBuff } from '../data/statuses';
import { getBase } from '../sim/Loot';
import type { ItemCategory } from '../types';

/** How the equipped main hand wants to be fought with. */
export type WeaponStyle = 'melee' | 'ranged' | 'caster' | 'unarmed';

const MELEE_CATEGORIES: ItemCategory[] = ['sword', 'axe', 'mace', 'dagger', 'spear'];
const RANGED_CATEGORIES: ItemCategory[] = ['bow', 'crossbow'];
const CASTER_CATEGORIES: ItemCategory[] = ['wand', 'staff', 'scepter', 'orb'];

/** Resolves the style of whatever is in the character's main hand. */
export function weaponStyle(player: Player): WeaponStyle {
  const item = player.character.equipment.mainHand;
  if (!item) return 'unarmed';
  try {
    const cat = getBase(item.baseId)?.category;
    if (!cat) return 'unarmed';
    if (RANGED_CATEGORIES.includes(cat)) return 'ranged';
    if (CASTER_CATEGORIES.includes(cat)) return 'caster';
    if (MELEE_CATEGORIES.includes(cat)) return 'melee';
  } catch {
    /* fall through */
  }
  return 'unarmed';
}

/** Effect families that swing a weapon and therefore need one in hand. */
const MELEE_EFFECTS = new Set([
  'melee', 'cleave', 'whirlwind', 'strike', 'heavy', 'multislash', 'leap', 'dash',
]);

/**
 * True when a skill physically swings the main hand. Spells are deliberately
 * exempt: a caster with a bow can still cast, the same way Diablo II allowed.
 */
export function needsMeleeWeapon(effect: string | undefined, damageType: string | undefined): boolean {
  const raw = (effect ?? 'melee').toLowerCase();
  const [family, sub] = raw.split('.');
  const hit = MELEE_EFFECTS.has(family ?? '') || MELEE_EFFECTS.has(sub ?? '');
  // Only physical swings are gated; an elemental "cleave" is a spell shaped
  // like a swing and should not demand a sword.
  return hit && (damageType ?? 'physical') === 'physical';
}

/** Anything the player can hit. Enemy and Boss both satisfy this. */
type Target = Enemy | Boss;

/**
 * Executes player skills: cost and cooldown checks, hit resolution, and the
 * visual/audio payload. Enemy abilities live in entities/Abilities.ts — this is
 * the player half only.
 *
 * Travel and timing for projectiles belong to EffectSystem; this class supplies
 * the damage callback it fires on impact.
 */
export class SkillRunner {
  private effects: EffectSystem;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(effects: EffectSystem) {
    this.effects = effects;
  }

  /** Attempt to cast. Returns false if on cooldown, unaffordable, or busy. */
  cast(
    skillId: string,
    player: Player,
    target: THREE.Vector3,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): boolean {
    if (player.isBusy || !player.alive) return false;

    const def = SKILLS.find((s) => s.id === skillId);
    if (!def || def.targeting === 'passive') return false;

    const rank = skillRank(player.character, skillId);
    if (rank <= 0) return false;
    if (player.isOnCooldown(skillId)) return false;

    // A bow cannot swing. Blocking this here is what makes weapon choice a
    // real decision rather than a stat stick.
    if (needsMeleeWeapon(def.effect, def.damageType)) {
      const style = weaponStyle(player);
      if (style === 'ranged' || style === 'caster') {
        events.emit('toast', {
          text: `${def.name} needs a melee weapon.`,
          kind: 'bad',
        });
        audio.play('ui.error');
        return false;
      }
    }

    const cost = def.manaCost ? def.manaCost(rank) : 0;
    if (cost > 0 && !player.spendMana(cost)) {
      audio.play('ui.error');
      return false;
    }

    const cd = def.cooldown ? def.cooldown(rank) : 0;
    if (cd > 0) player.startCooldown(skillId, cd);

    player.faceTowards(target.x, target.z);

    const scale = def.damageScale ? def.damageScale(rank) : 1;
    const type: DamageType = def.damageType ?? 'physical';
    const color = ELEMENTS[type]?.core ?? 0xffe3b0;

    const makePacket = (mult = 1): DamagePacket =>
      rollDamage(player.stats, ctx.rng, {
        scale: scale * mult,
        type,
        ability: def.name,
        source: 'player',
      });

    const attackTime = 0.42 / Math.max(0.4, 1 + player.stats.attackSpeed / 100);
    const castTime = 0.5 / Math.max(0.4, 1 + player.stats.castSpeed / 100);

    const params = def.params ?? {};
    const num = (k: string, d: number): number => {
      const v = params[k];
      return typeof v === 'number' ? v : d;
    };

    const origin = player.position.clone().setY(1.05);
    const dir = this.tmp.copy(target).sub(player.position).setY(0).normalize().clone();

    // Skill effects are dotted families ('buff.self', 'aura.damage'); switch on
    // the family so every variant lands on the right handler.
    const family = (def.effect ?? 'melee').split('.')[0] ?? 'melee';

    switch (family) {
      case 'melee':
      case 'cleave': {
        player.beginAction('attack1', attackTime);
        const wide = (def.effect ?? '').includes('cleave') || (def.effect ?? '').includes('multiSlash');
        this.meleeSwing(player, dir, num('arc', wide ? 2.2 : 1.3), num('reach', 2.3), makePacket, ctx, enemies, boss, type);
        break;
      }

      case 'whirlwind': {
        player.beginAction('attack2', attackTime * 1.4);
        this.meleeSwing(player, dir, Math.PI * 2, num('reach', 2.8), makePacket, ctx, enemies, boss, type);
        break;
      }

      case 'projectile':
      case 'bolt': {
        player.beginAction('cast', castTime);
        const range = num('range', 18);
        const count = Math.max(1, Math.floor(num('count', 1)));
        const spread = num('spread', 0.16);
        const pierce = Math.floor(num('pierce', 0));
        const splash = num('splash', 0);

        for (let i = 0; i < count; i++) {
          const a = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
          const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
          const from = origin.clone();
          // Stop the shot at the first thing it would actually hit, so the
          // visual lands on the target instead of sailing through it.
          const stop = this.firstHitAlong(from, d, range, enemies, boss, num('radius', 0.42));
          const to = from.clone().addScaledVector(d, stop);

          this.effects.projectile(from, to, {
            element: type,
            color,
            speed: num('speed', 17),
            size: num('radius', 0.42),
            onHit: (p) => {
              if (pierce > 0) {
                // Piercing shots damage everything along the flight path.
                this.lineDamage(from, d, stop, num('radius', 0.42) * 2, makePacket, ctx, enemies, boss);
              } else if (splash > 0) {
                this.areaDamage(p, splash, makePacket, ctx, enemies, boss);
              } else {
                this.pointDamage(p, num('radius', 0.42), makePacket, ctx, enemies, boss);
              }
            },
          });
        }
        audio.play(`cast.${type}`);
        break;
      }

      case 'nova': {
        player.beginAction('cast', castTime);
        const radius = num('radius', 5.2);
        this.effects.nova(player.position.x, player.position.z, radius, { element: type, color });
        this.areaDamage(player.position, radius, makePacket, ctx, enemies, boss);
        audio.play(`nova.${type}`);
        break;
      }

      case 'slam': {
        player.beginAction('attack2', attackTime * 1.5);
        const radius = num('radius', 4.0);
        const at = target.clone().setY(0);
        // The wind-up is what gives a slam weight; damage lands on the beat.
        this.effects.slam(at.x, at.z, radius, {
          element: type,
          color,
          windup: num('windup', 0.25),
          onFire: () => this.areaDamage(at, radius, () => makePacket(1.25), ctx, enemies, boss),
        });
        audio.play('slam');
        break;
      }

      case 'meteor': {
        player.beginAction('cast', castTime);
        const radius = num('radius', 3.4);
        const at = target.clone().setY(0);
        this.effects.meteor(at.x, at.z, {
          radius,
          element: type,
          color,
          onHit: (p) => this.areaDamage(p, radius, () => makePacket(1.4), ctx, enemies, boss),
        });
        break;
      }

      case 'beam': {
        player.beginAction('cast', castTime);
        const length = num('length', 12);
        const to = origin.clone().addScaledVector(dir, length);
        this.effects.beam(origin, to, { element: type, color, width: num('width', 1.1), endBurst: true });
        this.lineDamage(player.position, dir, length, num('width', 1.1), makePacket, ctx, enemies, boss);
        audio.play(`beam.${type}`);
        break;
      }

      case 'cone': {
        player.beginAction('cast', castTime);
        const reach = num('reach', 6.5);
        const half = num('arc', 1.1) * 0.5;
        this.effects.cone(player.position.clone().setY(1.0), dir, half, reach, { element: type, color });
        this.meleeSwing(player, dir, half * 2, reach, makePacket, ctx, enemies, boss, type, false);
        audio.play(`cone.${type}`);
        break;
      }

      case 'chain': {
        player.beginAction('cast', castTime);
        this.chainLightning(player, target, Math.floor(num('jumps', 4)), num('range', 7), makePacket, ctx, enemies, boss, type, color);
        audio.play('chain');
        break;
      }

      case 'dash': {
        player.dodge(dir.x, dir.z);
        this.meleeSwing(player, dir, Math.PI, num('reach', 2.4), makePacket, ctx, enemies, boss, type);
        break;
      }

      case 'heal': {
        player.beginAction('cast', castTime * 0.7);
        player.heal(num('amount', 30) * (1 + rank * 0.15));
        this.effects.impact('arcane', player.position.x, 1.0, player.position.z, {
          color: 0x7dffb0,
          decal: false,
          shake: 0,
          sfx: 'heal',
        });
        break;
      }

      case 'buff':
      case 'aura':
      case 'stance':
      case 'shout':
      case 'banner':
      case 'self':
      case 'absorb': {
        player.beginAction('cast', castTime * 0.7);
        this.applyBuff(player, def, rank, num, color);
        this.effects.impact(type, player.position.x, 1.0, player.position.z, {
          color,
          decal: false,
          shake: 0,
          sfx: 'buff',
        });
        break;
      }

      default: {
        // An unknown effect id falls back to a swing rather than a dead button,
        // so a data-entry typo never silently breaks a skill.
        player.beginAction('attack1', attackTime);
        this.meleeSwing(player, dir, 1.4, 2.3, makePacket, ctx, enemies, boss, type);
        break;
      }
    }

    return true;
  }

  /**
   * The free basic attack. No rank, no mana, no cooldown — this is the floor
   * that guarantees left click always does something, whatever the player has
   * (or has not) bound.
   */
  basicAttack(
    player: Player,
    target: THREE.Vector3,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): boolean {
    if (player.isBusy || !player.alive) return false;

    player.faceTowards(target.x, target.z);
    const dir = this.tmp.copy(target).sub(player.position).setY(0).normalize().clone();
    const style = weaponStyle(player);

    const packet = (mult = 1): DamagePacket =>
      rollDamage(player.stats, ctx.rng, {
        scale: mult,
        type: 'physical',
        ability: 'Attack',
        source: 'player',
      });

    // The weapon decides what a basic attack even is.
    if (style === 'ranged' || style === 'caster') {
      const castTime = 0.46 / Math.max(0.4, 1 + player.stats.attackSpeed / 100);
      player.beginAction('cast', castTime);

      const type: DamageType = style === 'ranged' ? 'physical' : 'arcane';
      const colour = style === 'ranged' ? 0xd8c9a0 : (ELEMENTS.arcane?.core ?? 0xff7de8);
      const from = player.position.clone().setY(1.05);
      const range = style === 'ranged' ? 20 : 16;
      const stop = this.firstHitAlong(from, dir, range, enemies, boss, 0.4);
      const to = from.clone().addScaledVector(dir, stop);

      this.effects.projectile(from, to, {
        element: type,
        color: colour,
        speed: style === 'ranged' ? 30 : 19,
        size: style === 'ranged' ? 0.24 : 0.4,
        onHit: (p) => this.pointDamage(p, 0.5, packet, ctx, enemies, boss),
      });
      audio.play(style === 'ranged' ? 'cast.physical' : 'cast.arcane');
      return true;
    }

    const attackTime = 0.42 / Math.max(0.4, 1 + player.stats.attackSpeed / 100);
    player.beginAction('attack1', attackTime);
    this.meleeSwing(player, dir, 1.5, 2.4, packet, ctx, enemies, boss, 'physical');
    return true;
  }

  /**
   * True when something is close enough for a basic swing to connect. Called
   * every frame the attack button is held, so it walks the arrays directly and
   * compares squared distances rather than building a target list.
   */
  hasTargetInReach(player: Player, enemies: Enemy[], boss: Boss | null, reach = 2.4): boolean {
    // Bows and staves reach across the room; they always have a shot.
    const style = weaponStyle(player);
    if (style === 'ranged' || style === 'caster') return true;
    const px = player.position.x;
    const pz = player.position.z;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      if (e.life <= 0) continue;
      const r = reach + e.hitRadius;
      const dx = e.root.position.x - px;
      const dz = e.root.position.z - pz;
      if (dx * dx + dz * dz <= r * r) return true;
    }
    if (boss && boss.life > 0) {
      const r = reach + boss.hitRadius;
      const dx = boss.root.position.x - px;
      const dz = boss.root.position.z - pz;
      if (dx * dx + dz * dz <= r * r) return true;
    }
    return false;
  }

  /**
   * Applies a skill's buff so it shows on the HUD with a running timer.
   * Most buff skills declare their duration in `params.duration`; anything
   * without one gets a sensible default rather than no feedback at all.
   */
  private applyBuff(
    player: Player,
    def: { id: string; name: string; params?: Record<string, number | number[]> },
    rank: number,
    num: (k: string, d: number) => number,
    color: number
  ): void {
    const duration = num('duration', 10) + num('durationPerRank', 0) * (rank - 1);

    // Prefer an authored status if the skill names one, else synthesize one
    // carrying the skill's own name so the tooltip reads correctly.
    const authored = typeof def.params?.statusId === 'string' ? (def.params.statusId as string) : null;
    const id = authored && getStatus(authored) ? authored : `skill.${def.id}`;
    if (!getStatus(id)) {
      synthesizeSkillBuff(def.id, def.name, color, 'sparkle', duration);
    }
    player.applyStatus(id, Math.max(1, duration), 1, 1);
  }

  /** Distance along `dir` to the nearest target, or `max` if nothing is hit. */
  private firstHitAlong(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    max: number,
    enemies: Enemy[],
    boss: Boss | null,
    radius: number
  ): number {
    let best = max;
    const consider = (t: Target) => {
      if (t.life <= 0) return;
      const to = this.tmp2.copy(t.root.position).sub(from).setY(0);
      const along = to.dot(dir);
      if (along <= 0 || along >= best) return;
      const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (perp > radius + t.hitRadius) return;
      best = along;
    };
    for (const e of enemies) consider(e);
    if (boss) consider(boss);
    return best;
  }

  private allTargets(enemies: Enemy[], boss: Boss | null): Target[] {
    const list: Target[] = [];
    for (const e of enemies) if (e.life > 0) list.push(e);
    if (boss && boss.life > 0) list.push(boss);
    return list;
  }

  private meleeSwing(
    player: Player,
    facing: THREE.Vector3,
    arc: number,
    reach: number,
    packet: (m?: number) => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    type: DamageType,
    playVisual = true
  ): void {
    const origin = player.position;
    const half = arc * 0.5;
    let hits = 0;

    for (const t of this.allTargets(enemies, boss)) {
      const to = this.tmp2.copy(t.root.position).sub(origin).setY(0);
      const dist = to.length();
      if (dist > reach + t.hitRadius) continue;
      if (arc < Math.PI * 1.99) {
        to.normalize();
        if (facing.dot(to) < Math.cos(half)) continue;
      }
      t.takeDamage(packet(), ctx);
      this.effects.meleeHit(t.root.position.x, 1.0, t.root.position.z, { dir: facing, color: ELEMENTS[type]?.core });
      hits++;
    }

    if (playVisual && hits === 0) audio.play('swing.miss');
  }

  private pointDamage(
    at: THREE.Vector3,
    radius: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): void {
    let closest: Target | null = null;
    let bestD = Infinity;
    for (const t of this.allTargets(enemies, boss)) {
      const d = t.root.position.distanceTo(at) - t.hitRadius;
      if (d < bestD && d <= radius) {
        bestD = d;
        closest = t;
      }
    }
    closest?.takeDamage(packet(), ctx);
  }

  private areaDamage(
    center: THREE.Vector3,
    radius: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): void {
    for (const t of this.allTargets(enemies, boss)) {
      const d = t.root.position.distanceTo(center);
      if (d > radius + t.hitRadius) continue;
      // Falloff so the centre of a nova genuinely rewards positioning.
      const p = packet();
      p.amount *= 1 - Math.min(1, d / (radius + t.hitRadius)) * 0.35;
      t.takeDamage(p, ctx);
    }
  }

  private lineDamage(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    length: number,
    width: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null
  ): void {
    for (const t of this.allTargets(enemies, boss)) {
      const to = this.tmp2.copy(t.root.position).sub(origin).setY(0);
      const along = to.dot(dir);
      if (along < 0 || along > length) continue;
      const perp = Math.sqrt(Math.max(0, to.lengthSq() - along * along));
      if (perp > width * 0.5 + t.hitRadius) continue;
      t.takeDamage(packet(), ctx);
    }
  }

  private chainLightning(
    player: Player,
    target: THREE.Vector3,
    jumps: number,
    range: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    type: DamageType,
    color: number
  ): void {
    const pool = this.allTargets(enemies, boss);
    if (pool.length === 0) return;

    let from = player.position.clone().setY(1.1);
    const struck = new Set<Target>();

    for (let j = 0; j < jumps; j++) {
      let best: Target | null = null;
      let bestD = Infinity;
      const anchor = j === 0 ? target : from;
      for (const t of pool) {
        if (struck.has(t)) continue;
        const d = t.root.position.distanceTo(anchor);
        if (d < bestD && d <= range) {
          bestD = d;
          best = t;
        }
      }
      if (!best) break;
      struck.add(best);
      const to = best.root.position.clone().setY(1.0);
      this.effects.beam(from, to, { element: type, color, width: 0.35, duration: 0.16, endBurst: true });
      // Each jump loses punch, or chain skills trivialise every pack.
      const p = packet();
      p.amount *= Math.pow(0.82, j);
      best.takeDamage(p, ctx);
      from = to;
    }
  }

  /** Kept for symmetry with scene lifecycles; EffectSystem owns live effects. */
  update(_dt: number): void {}

  dispose(): void {}
}
