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
import { spawnEffect, type EffectHandle } from '../fx/Effects';

interface Projectile {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  life: number;
  radius: number;
  pierce: number;
  hits: Set<string>;
  packet: () => DamagePacket;
  onImpact?: (pos: THREE.Vector3) => void;
  handle: EffectHandle | null;
  splash: number;
}

/**
 * Executes player skills: cost/cooldown checks, the hit resolution, and the
 * visual/audio payload. Enemy abilities live in entities/Abilities.ts; this is
 * the player half only.
 */
export class SkillRunner {
  private projectiles: Projectile[] = [];
  private tmp = new THREE.Vector3();

  /** Attempt to cast. Returns false if it was on cooldown, unaffordable, or busy. */
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
    const makePacket = (mult = 1): DamagePacket =>
      rollDamage(player.stats, ctx.rng, {
        scale: scale * mult,
        type,
        ability: def.name,
        source: 'player',
      });

    const attackTime = 0.42 / Math.max(0.4, 1 + player.stats.attackSpeed / 100);
    const castTime = 0.5 / Math.max(0.4, 1 + player.stats.castSpeed / 100);

    const effect = def.effect ?? 'melee';
    const params = def.params ?? {};
    const num = (k: string, d: number): number => {
      const v = params[k];
      return typeof v === 'number' ? v : d;
    };

    switch (effect) {
      case 'melee':
      case 'cleave': {
        player.beginAction('attack1', attackTime);
        const arc = num('arc', effect === 'cleave' ? 2.2 : 1.3);
        const reach = num('reach', 2.3);
        this.meleeSwing(player, target, arc, reach, makePacket, ctx, enemies, boss, type);
        break;
      }

      case 'whirlwind': {
        player.beginAction('attack2', attackTime * 1.4);
        this.meleeSwing(player, target, Math.PI * 2, num('reach', 2.8), makePacket, ctx, enemies, boss, type);
        spawnEffect('whirlwind', ctx.scene, player.position, { color: 0xd8e0ff, scale: num('reach', 2.8) });
        break;
      }

      case 'projectile':
      case 'bolt': {
        player.beginAction('cast', castTime);
        const dir = this.tmp.copy(target).sub(player.position).setY(0).normalize().clone();
        const origin = player.position.clone().setY(1.05);
        const count = Math.floor(num('count', 1));
        const spread = num('spread', 0.16);
        for (let i = 0; i < count; i++) {
          const a = count === 1 ? 0 : (i - (count - 1) / 2) * spread;
          const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
          this.projectiles.push({
            pos: origin.clone(),
            dir: d,
            speed: num('speed', 17),
            life: num('range', 18) / num('speed', 17),
            radius: num('radius', 0.42),
            pierce: Math.floor(num('pierce', 0)),
            hits: new Set(),
            splash: num('splash', 0),
            packet: () => makePacket(),
            handle: spawnEffect(`projectile.${type}`, ctx.scene, origin, { dir: d, color: this.colorFor(type) }),
          });
        }
        audio.play(`cast.${type}`);
        break;
      }

      case 'nova': {
        player.beginAction('cast', castTime);
        const radius = num('radius', 5.2);
        spawnEffect(`nova.${type}`, ctx.scene, player.position, { scale: radius, color: this.colorFor(type) });
        ctx.decals.add(type === 'fire' ? 'scorch' : 'frost', player.position.x, player.position.z, radius * 0.8);
        this.areaDamage(player.position, radius, makePacket, ctx, enemies, boss, type);
        events.emit('shake', { amount: 0.22, duration: 0.28 });
        audio.play(`nova.${type}`);
        break;
      }

      case 'slam': {
        player.beginAction('attack2', attackTime * 1.5);
        const radius = num('radius', 4.0);
        const at = target.clone().setY(0);
        // Telegraph even for the player: it reads as weight, and it lets the
        // impact land on a beat rather than instantly.
        spawnEffect('slam', ctx.scene, at, { scale: radius, color: this.colorFor(type) });
        ctx.decals.add('crack', at.x, at.z, radius * 0.9);
        this.areaDamage(at, radius, () => makePacket(1.25), ctx, enemies, boss, type);
        events.emit('shake', { amount: 0.4, duration: 0.35 });
        audio.play('slam');
        break;
      }

      case 'beam': {
        player.beginAction('cast', castTime);
        const dir = this.tmp.copy(target).sub(player.position).setY(0).normalize().clone();
        const length = num('length', 12);
        const width = num('width', 1.1);
        spawnEffect(`beam.${type}`, ctx.scene, player.position.clone().setY(1.1), {
          dir,
          scale: length,
          color: this.colorFor(type),
        });
        this.lineDamage(player.position, dir, length, width, makePacket, ctx, enemies, boss, type);
        audio.play(`beam.${type}`);
        break;
      }

      case 'cone': {
        player.beginAction('cast', castTime);
        const dir = this.tmp.copy(target).sub(player.position).setY(0).normalize().clone();
        const reach = num('reach', 6.5);
        spawnEffect(`cone.${type}`, ctx.scene, player.position.clone().setY(1.0), {
          dir,
          scale: reach,
          color: this.colorFor(type),
        });
        this.meleeSwing(player, target, num('arc', 1.1), reach, makePacket, ctx, enemies, boss, type);
        audio.play(`cone.${type}`);
        break;
      }

      case 'chain': {
        player.beginAction('cast', castTime);
        this.chainLightning(player, target, num('jumps', 4), num('range', 7), makePacket, ctx, enemies, boss, type);
        audio.play('chain');
        break;
      }

      case 'dash': {
        const d = this.tmp.copy(target).sub(player.position).setY(0);
        player.dodge(d.x, d.z);
        spawnEffect('dash', ctx.scene, player.position, { color: this.colorFor(type) });
        this.meleeSwing(player, target, Math.PI, num('reach', 2.4), makePacket, ctx, enemies, boss, type);
        break;
      }

      case 'buff':
      case 'heal': {
        player.beginAction('cast', castTime * 0.7);
        if (effect === 'heal') {
          player.heal(num('amount', 30) * (1 + rank * 0.15));
          spawnEffect('heal', ctx.scene, player.position, {});
          audio.play('heal');
        } else {
          spawnEffect('buff', ctx.scene, player.position, { color: this.colorFor(type) });
          audio.play('buff');
        }
        break;
      }

      default: {
        // Unknown effect ids fall back to a swing rather than doing nothing,
        // so a data-entry typo never produces a dead skill button.
        player.beginAction('attack1', attackTime);
        this.meleeSwing(player, target, 1.4, 2.3, makePacket, ctx, enemies, boss, type);
        break;
      }
    }

    return true;
  }

  private colorFor(type: DamageType): number {
    switch (type) {
      case 'fire': return 0xff6a22;
      case 'cold': return 0x7fd4ff;
      case 'lightning': return 0xc9a6ff;
      case 'poison': return 0x8ee34a;
      case 'arcane': return 0xff7de8;
      default: return 0xffe3b0;
    }
  }

  private meleeSwing(
    player: Player,
    target: THREE.Vector3,
    arc: number,
    reach: number,
    packet: (m?: number) => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    type: DamageType
  ): void {
    const origin = player.position;
    const facing = new THREE.Vector3().subVectors(target, origin).setY(0).normalize();
    const half = arc * 0.5;
    let hits = 0;

    const consider = (e: Enemy | Boss) => {
      const to = new THREE.Vector3().subVectors(e.root.position, origin).setY(0);
      const dist = to.length();
      if (dist > reach + e.hitRadius) return;
      if (arc < Math.PI * 1.99) {
        to.normalize();
        if (facing.dot(to) < Math.cos(half)) return;
      }
      e.takeDamage(packet(), ctx);
      hits++;
    };

    for (const e of enemies) if (e.life > 0) consider(e);
    if (boss && boss.life > 0) consider(boss);

    spawnEffect('swing', ctx.scene, origin.clone().setY(1.0), {
      dir: facing,
      scale: reach,
      color: this.colorFor(type),
    });
    audio.play(hits > 0 ? 'hit.melee' : 'swing.miss');
    if (hits > 0) events.emit('shake', { amount: 0.06 + Math.min(0.12, hits * 0.03), duration: 0.12 });
  }

  private areaDamage(
    center: THREE.Vector3,
    radius: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    _type: DamageType
  ): void {
    const consider = (e: Enemy | Boss) => {
      const d = e.root.position.distanceTo(center);
      if (d > radius + e.hitRadius) return;
      // Falloff so the centre of a nova genuinely rewards positioning.
      const falloff = 1 - Math.min(1, d / (radius + e.hitRadius)) * 0.35;
      const p = packet();
      p.amount *= falloff;
      e.takeDamage(p, ctx);
    };
    for (const e of enemies) if (e.life > 0) consider(e);
    if (boss && boss.life > 0) consider(boss);
  }

  private lineDamage(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    length: number,
    width: number,
    packet: () => DamagePacket,
    ctx: CombatContext,
    enemies: Enemy[],
    boss: Boss | null,
    _type: DamageType
  ): void {
    const consider = (e: Enemy | Boss) => {
      const to = new THREE.Vector3().subVectors(e.root.position, origin).setY(0);
      const along = to.dot(dir);
      if (along < 0 || along > length) return;
      const perp = to.clone().addScaledVector(dir, -along).length();
      if (perp > width * 0.5 + e.hitRadius) return;
      e.takeDamage(packet(), ctx);
    };
    for (const e of enemies) if (e.life > 0) consider(e);
    if (boss && boss.life > 0) consider(boss);
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
    type: DamageType
  ): void {
    const pool: Array<Enemy | Boss> = enemies.filter((e) => e.life > 0);
    if (boss && boss.life > 0) pool.push(boss);
    if (pool.length === 0) return;

    let from = player.position.clone().setY(1.1);
    const struck = new Set<Enemy | Boss>();

    for (let j = 0; j < jumps; j++) {
      let best: Enemy | Boss | null = null;
      let bestD = Infinity;
      const anchor = j === 0 ? target : from;
      for (const e of pool) {
        if (struck.has(e)) continue;
        const d = e.root.position.distanceTo(anchor);
        if (d < bestD && d <= range) {
          bestD = d;
          best = e;
        }
      }
      if (!best) break;
      struck.add(best);
      const to = best.root.position.clone().setY(1.0);
      spawnEffect('chain.lightning', ctx.scene, from, { target: to, color: this.colorFor(type) });
      // Each jump loses a little punch — otherwise chain skills trivialise packs.
      const p = packet();
      p.amount *= Math.pow(0.82, j);
      best.takeDamage(p, ctx);
      from = to;
    }
  }

  update(dt: number, ctx: CombatContext, enemies: Enemy[], boss: Boss | null): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      const step = p.speed * dt;
      p.pos.addScaledVector(p.dir, step);
      p.life -= dt;
      p.handle?.setPosition(p.pos);

      let consumed = false;
      const consider = (e: Enemy | Boss) => {
        if (consumed) return;
        if (p.hits.has(e.id)) return;
        if (e.life <= 0) return;
        if (e.root.position.distanceTo(p.pos) > p.radius + e.hitRadius) return;
        p.hits.add(e.id);
        e.takeDamage(p.packet(), ctx);
        if (p.splash > 0) {
          for (const other of enemies) {
            if (other === e || other.life <= 0) continue;
            if (other.root.position.distanceTo(p.pos) > p.splash) continue;
            const sp = p.packet();
            sp.amount *= 0.6;
            other.takeDamage(sp, ctx);
          }
        }
        if (p.pierce > 0) p.pierce--;
        else consumed = true;
      };

      for (const e of enemies) consider(e);
      if (boss) consider(boss);

      if (consumed || p.life <= 0) {
        p.onImpact?.(p.pos);
        p.handle?.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const p of this.projectiles) p.handle?.dispose();
    this.projectiles = [];
  }
}
