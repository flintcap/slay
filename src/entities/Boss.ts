/**
 * SLAY — boss encounters.
 *
 * A `Boss` is an `Enemy` with three things bolted on:
 *
 * 1. **A phase machine.** Phases fire on life thresholds and swap the entire
 *    ability list, the speed/damage multipliers, and the arena hook. Crossing a
 *    threshold costs the boss a beat of invulnerable stagger so the transition
 *    reads as an event rather than a stat change mid-swing.
 * 2. **Arena hooks.** Each phase can rewrite the room: lava creeps in, rifts
 *    open, the ceiling starts dropping, adds trickle, or a barrier makes the
 *    boss untouchable until its guards die. This is what stops phase two from
 *    being phase one with bigger numbers.
 * 3. **The presentation contract.** `boss:engaged` raises the name card,
 *    `boss:phase` barks the line, `boss:damaged` feeds the health bar, and
 *    `boss:killed` closes it out.
 *
 * Everything a boss actually *does* comes from the shared ability registry, so
 * a boss and a rare pack leader share one telegraph/windup/recovery pipeline.
 */

import * as THREE from 'three';
import type {
  BossDef,
  BossPhase,
  DamagePacket,
  MonsterDef,
  MonsterRank,
  Rng,
} from '../types';
import { events } from '../core/Events';
import { Enemy, depthCurve } from './Enemy';
import {
  after,
  alliesNear,
  angleTo,
  circleHit,
  clamp,
  dist,
  distToSegment,
  getAbility,
  hitPlayer,
  inCone,
  spawnHazard,
  summon,
  type AbilityDef,
  type CombatContext,
} from './Abilities';

/** Seconds of fight before the soft enrage, for a boss with `phases` phases. */
export function softEnrageAfter(phases: number): number {
  return 75 + 55 * phases;
}

/** Abilities long or heavy enough to be announced by name the first time. */
function isSignature(a: AbilityDef): boolean {
  return a.windup >= 0.8 || a.damageMul >= 2;
}

const TAU = Math.PI * 2;

/** Bosses are already enormous; this keeps a 3.6-scale model from filling the screen. */
const BOSS_RANK: MonsterRank = 'boss';

/**
 * Bosses need a MonsterDef to drive the shared Enemy machinery. We synthesise
 * one from the BossDef rather than duplicating the entity pipeline.
 */
function defFromBoss(def: BossDef): MonsterDef {
  const first = def.phases[0];
  return {
    id: def.id,
    name: def.name,
    family: def.family,
    role: 'brute',
    minDepth: def.minDepth,
    weight: 0,
    lifeMul: def.lifeMul,
    damageMul: def.damageMul,
    defenseMul: 1.35,
    // Deliberately below the player's 4.6 m/s. Phase multipliers run 1.15 to
    // 1.5, so a boss tops out near 3.1 and a hard enrage pushes it a little
    // past that — always slow enough that you can open ground while a telegraph
    // resolves. A boss that keeps pace turns every fight into stand-and-trade.
    speed: 2.05,
    scale: def.scale,
    attackRange: 3.4,
    attackSpeed: 0.85,
    damageType: 'physical',
    xpMul: 12,
    abilities: first ? first.abilities.slice() : ['cleave'],
    resists: {
      physical: 25,
      fire: 25,
      cold: 25,
      lightning: 25,
      poison: 40,
      arcane: 25,
    },
    biomes: def.biomes,
    visual: def.visual,
  };
}

interface ArenaState {
  kind: string;
  timer: number;
  /** Rotating index for hooks that cycle positions. */
  step: number;
}

export class Boss extends Enemy {
  readonly defId: string;
  readonly bossDef: BossDef;
  override readonly isBoss = true;

  /** Index into `bossDef.phases`. */
  phaseIndex = -1;
  get phase(): BossPhase | null {
    return this.bossDef.phases[this.phaseIndex] ?? null;
  }

  /** True while a barrier phase's guards are still alive. */
  barrierUp = false;

  private engaged = false;
  /**
   * Waits in its arena and does not wake by distance: the scene engages it
   * when the hero walks through the gate (DungeonScene's arena gate). A hit
   * still wakes it.
   */
  dormant = false;
  private staggerTimer = 0;
  private arena: ArenaState | null = null;
  private addTimer = 0;
  private guards: Enemy[] = [];
  private enrageStacks = 0;
  private enrageTimer = 0;
  private lastBarUpdate = -1;
  private introTimer = 0;
  /** Where in the phase's rotation the boss is. */
  private rotIdx = 0;
  /** Seconds spent waiting for the next move in the rotation to be in reach. */
  private rotWait = 0;
  private fightTime = 0;
  /** True once the fight has run past its time limit. */
  softEnraged = false;
  private dreadTick = 0;
  private announced = new Set<string>();
  /** Abilities started per phase, for the checker. */
  readonly usedAbilities = new Set<string>();

  constructor(def: BossDef, depth: number, rng: Rng) {
    super(defFromBoss(def), BOSS_RANK, [], depth, rng);
    this.defId = def.id;
    this.bossDef = def;

    // Bosses ignore the pack systems entirely — they are their own encounter.
    this.packId = -1;
    // And they come for you, not for your skeletons. Ordinary monsters can be
    // held by a summoned line; a boss encounter is built around the player.
    if (this.ai) this.ai.fixateOnPlayer = true;
    // Immune to the soft CC that trivialises large targets.
    this.buff('boss_stability', Number.MAX_SAFE_INTEGER, {});
  }

  // --- engagement ----------------------------------------------------------

  /** Fires the name card and enters phase 0. Idempotent. */
  engage(ctx: CombatContext): void {
    if (this.engaged) return;
    this.engaged = true;
    this.introTimer = 1.2;
    events.emit('boss:engaged', {
      name: this.bossDef.name,
      title: this.bossDef.title,
      maxLife: this.maxLife,
    });
    events.emit('music', { track: this.bossDef.music, fade: 1.5 });
    // The intro is narrated as a subtitle by the story layer (ui/StoryBosses.ts);
    // as a toast it clipped long lines.
    this.enterPhase(0, ctx);
    this.ai?.wake(ctx, false);
  }

  private enterPhase(index: number, ctx: CombatContext): void {
    const phase = this.bossDef.phases[index];
    if (!phase || index === this.phaseIndex) return;
    this.phaseIndex = index;

    // Swap the whole kit. `abilityIds` is a mutable array behind a readonly
    // binding, so we rewrite it in place rather than rebuilding the entity.
    this.rotIdx = 0;
    this.rotWait = 0;
    this.abilityIds.length = 0;
    for (const id of phase.abilities) {
      if (getAbility(id)) this.abilityIds.push(id);
    }
    if (this.abilityIds.length === 0) this.abilityIds.push('cleave');

    // Phase multipliers stack on the base statline.
    this.outgoingMul = phase.damage ?? 1;
    this.buff('phase_speed', Number.MAX_SAFE_INTEGER, { speed: phase.speed ?? 1 });

    // Stagger window: brief invulnerable pause so the transition reads.
    if (index > 0) {
      this.staggerTimer = 1.1;
      this.buff('phase_stagger', 1.1, { invulnerable: 1 });
      const p = this.root.position;
      ctx.fx.burst('bossSlam', p.x, 1.2 * this.sizeScale, p.z, { count: 60, scale: 4 });
      ctx.decals.add('crack', p.x, p.z, 6 * this.sizeScale);
      events.emit('shake', { amount: 1.0, duration: 0.6 });
      // Everyone gets pushed off — a free reposition beat for both sides.
      const packet: DamagePacket = {
        amount: 0,
        type: 'physical',
        crit: false,
        source: this.id,
        ability: 'phase_shift',
        knockback: 7,
      };
      if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) < 9) ctx.damagePlayer(packet);
    }

    this.setArena(phase.arena ?? null, ctx);
    events.emit('boss:phase', { name: phase.name, bark: phase.bark, index });
    // The bark shows under the boss bar (HUD) and is spoken as a subtitle by
    // the story layer (ui/StoryBosses.ts); a toast as well said it three times.
    events.emit('sfx', { id: 'boss.phase', x: this.root.position.x, z: this.root.position.z });
  }

  // --- arena hooks ---------------------------------------------------------

  private setArena(kind: string | null, ctx: CombatContext): void {
    // Clear anything the previous phase was maintaining.
    this.barrierUp = false;
    this.guards.length = 0;
    this.enrageTimer = 0;
    this.enrageStacks = 0;

    if (!kind) {
      this.arena = null;
      return;
    }
    this.arena = { kind, timer: 0, step: 0 };

    switch (kind) {
      case 'barrier': {
        // Untouchable until the summoned guard is dead. This is the "kill the
        // adds to drop the shield" mechanic, and it is announced loudly.
        const addIds = this.bossDef.adds ?? [];
        const count = Math.min(3, Math.max(2, addIds.length));
        for (let i = 0; i < count; i++) {
          const id = addIds[i % Math.max(1, addIds.length)] ?? 'skeleton_rattler';
          const spawned = summon(this, ctx, id, 1, 4.5 + i * 0.8, 'champion');
          for (const s of spawned) this.guards.push(s);
        }
        if (this.guards.length > 0) {
          this.barrierUp = true;
          this.addShield(this.maxLife * 0.35, 999);
          events.emit('toast', { text: 'A barrier holds. Kill the guardians.', kind: 'bad' });
        }
        break;
      }
      case 'enrageTimer':
        this.enrageTimer = 0;
        events.emit('toast', { text: 'It is done holding back. Finish this.', kind: 'bad' });
        break;
      case 'shatter':
        summon(this, ctx, 'mirror_image', 3, 3.4);
        break;
      case 'sentries':
        summon(this, ctx, 'arcane_sentry_totem', 3, 6.0);
        break;
      default:
        break;
    }
  }

  private tickArena(dt: number, ctx: CombatContext): void {
    const a = this.arena;
    if (!a) return;
    a.timer -= dt;
    const p = this.root.position;

    switch (a.kind) {
      case 'lavaFloor': {
        if (a.timer > 0) break;
        a.timer = 2.4;
        // Pools creep outward from the boss — the safe ring shrinks over time.
        const r = 4 + (a.step % 4) * 2.6;
        for (let i = 0; i < 3; i++) {
          const ang = ((a.step * 0.7 + i / 3) % 1) * TAU;
          spawnHazard(this, ctx, p.x + Math.sin(ang) * r, p.z + Math.cos(ang) * r, 2.4, 0.55, 'fire', 'arena.lava', {
            duration: 9,
            tickRate: 2,
          });
        }
        a.step++;
        break;
      }
      case 'iceField': {
        if (a.timer > 0) break;
        a.timer = 2.0;
        const ang = ctx.rng.next() * TAU;
        const r = ctx.rng.range(2, 10);
        spawnHazard(this, ctx, p.x + Math.sin(ang) * r, p.z + Math.cos(ang) * r, 2.8, 0.3, 'cold', 'arena.ice', {
          duration: 8,
          tickRate: 1.5,
          applies: [{ id: 'chill', duration: 3, magnitude: 0.5 }],
        });
        break;
      }
      case 'voidRifts': {
        if (a.timer > 0) break;
        a.timer = 3.6;
        // Rifts open under the player's *last* position — keep moving.
        const tx = ctx.playerPos.x;
        const tz = ctx.playerPos.z;
        const tel = ctx.decals.telegraph('ring', tx, tz, 3.6, 0, 1.0, 0x8020c0);
        after(1.0, (c) => {
          tel.cancel();
          spawnHazard(this, c, tx, tz, 3.4, 0.65, 'arcane', 'arena.rift', {
            duration: 7,
            tickRate: 2,
            pull: 3,
            color: 0x8020c0,
          });
          c.fx.burst('void', tx, 0.6, tz, { count: 30 });
        });
        break;
      }
      case 'collapse': {
        if (a.timer > 0) break;
        a.timer = 1.5;
        // Ceiling debris: three telegraphed impacts per beat, one always near you.
        for (let i = 0; i < 3; i++) {
          const nearPlayer = i === 0;
          const ang = ctx.rng.next() * TAU;
          const r = nearPlayer ? ctx.rng.range(0, 3) : ctx.rng.range(3, 13);
          const tx = (nearPlayer ? ctx.playerPos.x : p.x) + Math.sin(ang) * r;
          const tz = (nearPlayer ? ctx.playerPos.z : p.z) + Math.cos(ang) * r;
          const tel = ctx.decals.telegraph('circle', tx, tz, 2.4, 0, 0.85, 0xc0a070);
          after(0.85, (c) => {
            tel.cancel();
            circleHit(this, c, tx, tz, 2.4, 1.5, 'physical', 'arena.collapse', { knockback: 3 });
            c.fx.burst('dust', tx, 0.4, tz, { count: 20, scale: 2.5 });
            c.decals.add('crack', tx, tz, 2.2);
          });
        }
        events.emit('shake', { amount: 0.25, duration: 0.4 });
        break;
      }
      case 'pillars': {
        if (a.timer > 0) break;
        a.timer = 8.5;
        // Safe zones: three rings you must stand inside when the blast lands.
        const safe: Array<{ x: number; z: number }> = [];
        for (let i = 0; i < 3; i++) {
          const ang = (i / 3) * TAU + a.step * 0.6;
          safe.push({ x: p.x + Math.sin(ang) * 7, z: p.z + Math.cos(ang) * 7 });
        }
        a.step++;
        const tels = safe.map((s) => ctx.decals.telegraph('ring', s.x, s.z, 2.4, 0, 3.0, 0x60ffa0));
        events.emit('toast', { text: 'Get behind a pillar!', kind: 'bad' });
        after(3.0, (c) => {
          for (const t of tels) t.cancel();
          const inSafe = safe.some((s) => dist(s.x, s.z, c.playerPos.x, c.playerPos.z) < 2.4);
          c.fx.burst('bossSlam', p.x, 1.0, p.z, { count: 60, scale: 6 });
          events.emit('shake', { amount: 1.2, duration: 0.5 });
          if (!inSafe) hitPlayer(this, c, 4.0, 'physical', 'arena.pillars', { knockback: 6 });
        });
        break;
      }
      case 'floodTide': {
        if (a.timer > 0) break;
        a.timer = 6.0;
        // A wave crosses the arena along one axis; sidestep or take the hit.
        const heading = ctx.rng.next() * TAU;
        const tel = ctx.decals.telegraph('line', p.x, p.z, 22, heading, 1.6, 0x40a0ff);
        after(1.6, (c) => {
          tel.cancel();
          for (let step = 0; step < 10; step++) {
            after(step * 0.09, (cc) => {
              const d = 1 + step * 2.4;
              const cx = p.x + Math.sin(heading) * d;
              const cz = p.z + Math.cos(heading) * d;
              cc.fx.burst('frost', cx, 0.5, cz, { count: 8, scale: 3 });
              if (dist(cx, cz, cc.playerPos.x, cc.playerPos.z) < 2.6) {
                hitPlayer(this, cc, 1.8, 'cold', 'arena.flood', { knockback: 5 });
              }
            });
          }
        });
        break;
      }
      case 'darkness': {
        if (a.timer > 0) break;
        a.timer = 6.5;
        // The dark is the boss's: it steps out of it at your side. The cone
        // goes down where it will land; turn and move, or take it.
        if (this.busy || this.motionOverride) {
          a.timer = 0.5;
          break;
        }
        ctx.fx.burst('void', p.x, 1.5, p.z, { count: 24, color: 0x201830 });
        this.buff('darkness_step', 0.7, { invulnerable: 1 });
        after(0.7, (c) => {
          if (!this.alive) return;
          const h = c.heroPos ?? c.playerPos;
          const side = (c.heroFacing ?? 0) + (c.rng.next() < 0.5 ? 1 : -1) * Math.PI * 0.6;
          const t = c.nav.clampToWalkable(h.x + Math.sin(side) * 2.6, h.z + Math.cos(side) * 2.6);
          this.teleportTo(t.x, t.y, c);
          this.facing = angleTo(t.x, t.y, h.x, h.z);
          this.rootTimer = 0.65;
          const facing = this.facing;
          c.decals.telegraph('cone', t.x, t.y, 4 * Math.min(1.5, this.sizeScale * 0.6), facing, 0.65, 0x6040a0);
          c.fx.burst('void', t.x, 1.5, t.y, { count: 30, color: 0x201830 });
          after(0.65, (cc) => {
            if (!this.alive) return;
            const reach = 4 * Math.min(1.5, this.sizeScale * 0.6);
            if (inCone(t.x, t.y, facing, 60, reach, cc.playerPos.x, cc.playerPos.z)) {
              hitPlayer(this, cc, 2.2, 'arcane', 'arena.darkness', { knockback: 3 });
            }
          });
        });
        break;
      }
      case 'hookSweep': {
        if (a.timer > 0) break;
        a.timer = 6.5;
        // Chains whip across the room in a cross through the boss. The cross
        // turns an eighth each time, so the safe wedges move.
        const base = (a.step % 2) * (Math.PI / 4);
        a.step++;
        const LEN = 18;
        const x = p.x;
        const z = p.z;
        const tels = [0, 1, 2, 3].map((k) =>
          ctx.decals.telegraph('line', x, z, LEN, base + (k * Math.PI) / 2, 1.3, 0xc04030),
        );
        after(1.3, (c) => {
          for (const t of tels) t.cancel();
          for (let k = 0; k < 4; k++) {
            const ang = base + (k * Math.PI) / 2;
            const ex = x + Math.sin(ang) * LEN;
            const ez = z + Math.cos(ang) * LEN;
            if (distToSegment(c.playerPos.x, c.playerPos.z, x, z, ex, ez) < 1.0) {
              hitPlayer(this, c, 1.9, 'physical', 'arena.hookSweep', { knockback: 3 });
              break;
            }
          }
          c.fx.burst('blood', x, 1, z, { count: 30, scale: 3 });
          events.emit('shake', { amount: 0.3, duration: 0.25 });
        });
        break;
      }
      case 'swarmCall': {
        if (a.timer > 0) break;
        a.timer = 7.5;
        const addIds = this.bossDef.adds ?? ['hive_drone'];
        const living = alliesNear(ctx, p.x, p.z, 40, this.id).length;
        if (living < 12) {
          const id = addIds[a.step % addIds.length] ?? 'hive_drone';
          summon(this, ctx, id, 3, 6);
          a.step++;
        }
        break;
      }
      case 'sentries': {
        if (a.timer > 0) break;
        a.timer = 11;
        const living = alliesNear(ctx, p.x, p.z, 30, this.id).filter(
          (e) => e.monsterId === 'arcane_sentry_totem',
        ).length;
        if (living < 3) summon(this, ctx, 'arcane_sentry_totem', 3 - living, 6.5);
        break;
      }
      case 'shatter': {
        if (a.timer > 0) break;
        a.timer = 9;
        const clones = alliesNear(ctx, p.x, p.z, 24, this.id).filter((e) => e.monsterId === 'mirror_image').length;
        if (clones < 3) summon(this, ctx, 'mirror_image', 3 - clones, 3.4);
        break;
      }
      case 'barrier': {
        // Drop the shield the moment the last guardian falls.
        if (!this.barrierUp) break;
        const alive = this.guards.filter((g) => g.alive).length;
        if (alive === 0) {
          this.barrierUp = false;
          this.shield = 0;
          events.emit('toast', { text: 'The barrier shatters!', kind: 'good' });
          ctx.fx.burst('crit', p.x, 1.4 * this.sizeScale, p.z, { count: 50, color: 0xffe066 });
          events.emit('shake', { amount: 0.7, duration: 0.4 });
          // Punished for taking too long: a free window while it recovers.
          this.buff('barrier_broken', 5, { defense: 0.7 });
        }
        break;
      }
      case 'enrageTimer': {
        this.enrageTimer += dt;
        if (this.enrageTimer >= 12) {
          this.enrageTimer = 0;
          this.enrageStacks++;
          this.buff('hard_enrage', Number.MAX_SAFE_INTEGER, {
            damage: 1 + this.enrageStacks * 0.25,
            // Capped: enrage should make the fight lethal, not make the boss
            // outrun you and remove kiting from the answer set.
            speed: Math.min(1.35, 1 + this.enrageStacks * 0.05),
          });
          events.emit('toast', {
            text: `${this.bossDef.name} grows stronger (${this.enrageStacks})`,
            kind: 'bad',
          });
          ctx.fx.burst('crit', p.x, 1.4 * this.sizeScale, p.z, { count: 30, color: 0xff3020 });
        }
        break;
      }
      default:
        break;
    }
  }

  // --- tick ----------------------------------------------------------------

  override update(dt: number, ctx: CombatContext): void {
    if (!this.engaged && this.alive && !this.dormant) {
      // Auto-engage once the player is in the room.
      const p = this.root.position;
      if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) < 22) this.engage(ctx);
    }

    if (this.introTimer > 0) {
      this.introTimer = Math.max(0, this.introTimer - dt);
    }
    if (this.staggerTimer > 0) this.staggerTimer = Math.max(0, this.staggerTimer - dt);

    super.update(dt, ctx);

    if (!this.alive) return;

    // Phase advancement — checked after damage has landed for the frame.
    const frac = this.lifeFraction;
    for (let i = this.bossDef.phases.length - 1; i > this.phaseIndex; i--) {
      const ph = this.bossDef.phases[i]!;
      if (frac <= ph.atLife) {
        this.enterPhase(i, ctx);
        break;
      }
    }

    if (this.engaged) {
      this.tickArena(dt, ctx);
      this.tickSoftEnrage(dt, ctx);
    }

    // Trickle adds independent of arena hooks, so a boss room never feels empty.
    this.addTimer -= dt;
    if (this.addTimer <= 0 && this.engaged && (this.bossDef.adds?.length ?? 0) > 0) {
      this.addTimer = 16;
      const p = this.root.position;
      const nearby = alliesNear(ctx, p.x, p.z, 34, this.id).length;
      if (nearby < 5) {
        const ids = this.bossDef.adds!;
        summon(this, ctx, ids[Math.floor(ctx.rng.next() * ids.length)] ?? ids[0]!, 2, 7);
      }
    }

    // Health bar feed — throttled to whole percent changes.
    const pct = Math.round(this.lifeFraction * 200);
    if (pct !== this.lastBarUpdate) {
      this.lastBarUpdate = pct;
      events.emit('boss:damaged', { life: this.life, maxLife: this.maxLife });
    }
  }

  /**
   * The fight's time limit. Past it the boss is enraged for good, and anyone
   * near it fights through dread. Not a wall: a clock you can see coming.
   */
  private tickSoftEnrage(dt: number, ctx: CombatContext): void {
    this.fightTime += dt;
    const limit = softEnrageAfter(this.bossDef.phases.length);
    if (!this.softEnraged && this.fightTime >= limit - 15 && this.fightTime - dt < limit - 15) {
      events.emit('toast', { text: `${this.bossDef.name} is losing patience...`, kind: 'bad' });
    }
    if (!this.softEnraged && this.fightTime >= limit) {
      this.softEnraged = true;
      this.buff('soft_enrage', Number.MAX_SAFE_INTEGER, { damage: 1.6, attackSpeed: 1.25, speed: 1.15 });
      this.applyStatuses([{ id: 'bossEnrage', duration: 9999, magnitude: 1 }], ctx);
      const p = this.root.position;
      ctx.fx.burst('crit', p.x, 1.4 * this.sizeScale, p.z, { count: 60, color: 0xff2d2d });
      events.emit('boss:enraged', { name: this.bossDef.name });
      events.emit('toast', { text: `${this.bossDef.name} is ENRAGED.`, kind: 'bad' });
      events.emit('shake', { amount: 0.8, duration: 0.5 });
    }
    if (this.softEnraged && ctx.applyHeroStatus) {
      this.dreadTick -= dt;
      if (this.dreadTick <= 0) {
        this.dreadTick = 1;
        const p = this.root.position;
        const h = ctx.heroPos ?? ctx.playerPos;
        if (dist(p.x, p.z, h.x, h.z) < 10) ctx.applyHeroStatus('dreadaura', 1.5, 1);
      }
    }
  }

  /**
   * The boss's rotation: the current phase's abilities, in the order the phase
   * lists them, round and round. A move that is cooling down or gated is
   * skipped; one that is out of reach is walked into for a few seconds before
   * the boss gives up on it. Learn the order and you know what comes next.
   */
  override preferredAbility(d: number, ctx: CombatContext): AbilityDef | null | undefined {
    const list = this.abilityIds;
    if (!this.engaged || list.length === 0) return undefined;
    this.gapWanted = 0;
    const lifeFrac = this.lifeFraction;
    for (let tries = 0; tries < list.length; tries++) {
      const id = list[this.rotIdx % list.length]!;
      const a = getAbility(id);
      const usable =
        !!a &&
        !a.tags?.includes('ondeath') &&
        this.abilityReady(id, ctx) &&
        (a.belowLife === undefined || lifeFrac <= a.belowLife) &&
        (a.aboveLife === undefined || lifeFrac >= a.aboveLife) &&
        (a.needsAllies === undefined || alliesNear(ctx, this.root.position.x, this.root.position.z, 14, this.id).length >= a.needsAllies);
      if (!usable) {
        this.rotIdx++;
        this.rotWait = 0;
        continue;
      }
      if (d <= a!.range && (a!.minRange === undefined || d >= a!.minRange)) {
        this.rotIdx++;
        this.rotWait = 0;
        this.gapWanted = 0;
        return a!;
      }
      // Next move is out of reach: close in for it, or back off to give a
      // charge its run-up (the brain reads `gapWanted`).
      this.gapWanted = a!.minRange !== undefined && d < a!.minRange ? a!.minRange + 0.8 : 0;
      this.rotWait += 0.3;
      if (this.rotWait > 3) {
        this.rotIdx++;
        this.rotWait = 0;
        this.gapWanted = 0;
        continue;
      }
      return null;
    }
    return null;
  }

  override notifyAbility(ability: AbilityDef, phase: string): void {
    if (phase !== 'windup') return;
    this.usedAbilities.add(ability.id);
    events.emit('boss:cast', { name: this.bossDef.name, ability: ability.name, windup: ability.windup });
    // Name each big move the first time it comes, so it can be learned.
    if (isSignature(ability) && !this.announced.has(ability.id)) {
      this.announced.add(ability.id);
      events.emit('toast', { text: `${this.bossDef.name}: ${ability.name}`, kind: 'bad' });
    }
  }

  override takeDamage(packet: DamagePacket, ctx: CombatContext): void {
    if (!this.engaged) this.engage(ctx);

    // Barrier / stagger: the boss is genuinely untouchable, and says so.
    if (this.barrierUp || this.staggerTimer > 0) {
      const p = this.root.position;
      ctx.fx.burst('shock', p.x, 1.1 * this.sizeScale, p.z, { count: 8, color: 0x60c0ff });
      events.emit('enemy:damaged', {
        id: this.id,
        amount: 0,
        type: packet.type,
        crit: false,
        x: p.x,
        y: 1.1 * this.sizeScale,
        z: p.z,
      });
      return;
    }

    // Bosses take reduced damage from single enormous hits so a lucky crit can
    // never skip a phase outright — every fight plays all of its beats.
    const cap = this.maxLife * 0.16;
    const working = packet.amount > cap ? { ...packet, amount: cap + (packet.amount - cap) * 0.35 } : packet;

    super.takeDamage(working, ctx);
    if (this.alive) events.emit('boss:damaged', { life: this.life, maxLife: this.maxLife });
  }

  protected override die(ctx: CombatContext): void {
    const wasAlive = this.alive;
    super.die(ctx);
    if (!wasAlive || this.alive) return;

    const p = this.root.position;
    events.emit('boss:killed', { name: this.bossDef.name });
    events.emit('boss:damaged', { life: 0, maxLife: this.maxLife });
    events.emit('toast', { text: `${this.bossDef.name} falls.`, kind: 'epic' });
    events.emit('shake', { amount: 1.6, duration: 1.2 });
    events.emit('music', { track: 'ambient', fade: 3 });

    // A death worth the build-up: staggered detonations across the corpse.
    for (let i = 0; i < 6; i++) {
      after(i * 0.18, (c) => {
        const ang = c.rng.next() * TAU;
        const r = c.rng.range(0, 2.5) * this.sizeScale;
        c.fx.burst('bossSlam', p.x + Math.sin(ang) * r, 0.6 + c.rng.next() * 2, p.z + Math.cos(ang) * r, {
          count: 34,
          scale: 3,
          color: this.bossDef.visual.glow ?? 0xffaa33,
        });
      });
    }
    ctx.decals.add('scorch', p.x, p.z, 5 * this.sizeScale);

    // Clean up anything the encounter was maintaining.
    for (const g of this.guards) {
      if (g.alive) g.takeDamage(
        { amount: g.maxLife * 10, type: 'arcane', crit: false, source: this.id, ability: 'boss_end' },
        ctx,
      );
    }
    this.guards.length = 0;
    this.arena = null;
    this.barrierUp = false;
  }

  override dispose(): void {
    this.guards.length = 0;
    this.arena = null;
    super.dispose();
  }

  /** XP reward, scaled by phase count so longer fights pay more. */
  get bossXp(): number {
    return Math.round(depthCurve(this.depth).xp * 40 * this.bossDef.phases.length * 0.35);
  }

  /** Loot tier hook for the drop generator. */
  get lootTier(): number {
    return this.bossDef.lootTier;
  }
}

/** Spawns a boss at a world position and wires it into the scene's enemy list. */
export function spawnBoss(
  def: BossDef,
  depth: number,
  x: number,
  z: number,
  rng: Rng,
  ctx: CombatContext,
): Boss {
  const b = new Boss(def, depth, rng);
  b.root.position.set(x, 0, z);
  ctx.scene.add(b.root);
  ctx.enemies.push(b);
  return b;
}

void clamp;
void THREE;
