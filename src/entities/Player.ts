import * as THREE from 'three';
import type { Character, Stats, DamagePacket, EquipSlot } from '../types';
import { computeStats } from '../sim/Stats';
import { mitigate } from '../sim/Combat';
import { StatusContainer } from '../sim/Status';
import { activeDifficulty } from '../data/difficulties';
import { events } from '../core/Events';
import { buildPlayerModel, attachToSocket, clearSocket, applyWornSlots } from '../art/CharacterModels';
import { disposeObject } from '../core/Engine';
import { Animator } from '../art/Animation';
import { buildItemModel } from '../art/ItemModels';
import { getBase } from '../sim/Loot';
import { Random } from '../core/RNG';
import type { Rng } from '../types';

export interface PlayerContext {
  colliders: Array<{ x: number; z: number; w: number; d: number }>;
  /** Returns true if the world position is standing on walkable ground. */
  walkableAt(x: number, z: number): boolean;
}

const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();

/**
 * Equipment slots that put geometry on the body. Rings and amulets are left
 * off: at gameplay camera distance they cost a draw call and show nothing.
 */
const VISUAL_SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'helm', 'chest', 'gloves', 'boots', 'belt'];

/** Which body-covering slots currently hold an item. */
export function wornSlots(c: Character): Set<EquipSlot> {
  const out = new Set<EquipSlot>();
  for (const slot of VISUAL_SLOTS) if (c.equipment[slot]) out.add(slot);
  return out;
}

/**
 * The player avatar: movement, collision, resources, and animation state.
 * Skill execution lives in DungeonScene — this class owns the body, not the
 * build.
 */
export class Player {
  readonly root = new THREE.Group();
  readonly character: Character;
  readonly bones: Record<string, THREE.Bone>;
  readonly animator: Animator;

  stats: Stats;
  life: number;
  mana: number;

  /** Radius used for collision and for enemies deciding when they're in range. */
  readonly radius = 0.42;

  /** Current click-to-move destination, or null when idle/keyboard-driven. */
  private moveTarget: THREE.Vector3 | null = null;
  private velocity = new THREE.Vector3();
  private facing = 0;
  private targetFacing = 0;

  /** Seconds remaining in an uninterruptible action (attack/cast/dodge). */
  private actionLock = 0;
  private dodgeTime = 0;
  private dodgeDir = new THREE.Vector3();
  /** Seconds until the dash is available again, and the full period. */
  private dodgeCd = 0;
  readonly dodgeCdMax = 3.5;

  /** Cooldowns by skill id. */
  readonly cooldowns = new Map<string, number>();

  /** Buffs and debuffs currently on the player. */
  readonly status = new StatusContainer('player');
  private regenAccum = 0;
  private rng: Rng;
  private equipMeshes = new Map<EquipSlot, THREE.Object3D>();
  /** Last-built item identity per slot, so unchanged gear is never rebuilt. */
  private equipKeys = new Map<EquipSlot, string>();
  /** The class model, kept so its cover pieces can be toggled on equip. */
  private body!: THREE.Object3D;

  /** Set by DungeonScene when the player has no business moving (dead, cutscene). */
  frozen = false;
  invulnerable = false;

  constructor(character: Character, seed = 1) {
    this.character = character;
    this.rng = new Random(seed);

    const built = buildPlayerModel(character.classId, this.rng, wornSlots(character));
    this.body = built.root;
    this.root.add(built.root);
    this.bones = built.bones;
    this.animator = new Animator(built.bones);

    this.stats = computeStats(character);
    this.life = this.stats.life;
    this.mana = this.stats.mana;

    this.refreshEquipmentVisuals();
  }

  /** Recompute stats after a gear or skill change, preserving resource ratios. */
  refreshStats(): void {
    const lifeRatio = this.stats.life > 0 ? this.life / this.stats.life : 1;
    const manaRatio = this.stats.mana > 0 ? this.mana / this.stats.mana : 1;
    this.stats = computeStats(this.character);
    this.life = Math.min(this.stats.life, this.stats.life * lifeRatio);
    this.mana = Math.min(this.stats.mana, this.stats.mana * manaRatio);
    this.refreshEquipmentVisuals();
  }

  /**
   * Rebuilds attached weapon/armor meshes from current equipment.
   *
   * Only slots whose item actually changed are rebuilt. `refreshStats` calls
   * this, and `applyStatus` calls `refreshStats`, so a naive full rebuild threw
   * away and re-authored every equipped model on every buff tick.
   */
  private refreshEquipmentVisuals(): void {
    const eq = this.character.equipment;
    // Gear replaces the class's own covering rather than clipping through it.
    applyWornSlots(this.body, wornSlots(this.character));
    for (const slot of VISUAL_SLOTS) {
      const item = eq[slot];
      // baseId alone is not enough: rarity drives the dressing, and two items
      // can share a base with different rolls.
      const key = item ? `${item.uid}|${item.baseId}|${item.rarity}|${item.upgrade}` : '';
      if (this.equipKeys.get(slot) === key) continue;
      this.equipKeys.set(slot, key);

      const prev = this.equipMeshes.get(slot);
      if (prev) {
        clearSocket(this.bones, slot);
        disposeObject(prev);
        this.equipMeshes.delete(slot);
      }
      if (!item) continue;

      try {
        const visual = getBase(item.baseId)?.visual ?? { shape: 'auto', palette: 'metal.steel' };
        const mesh = buildItemModel(visual, this.rng, item.rarity);
        attachToSocket(this.root, this.bones, slot, mesh);
        this.equipMeshes.set(slot, mesh);
      } catch {
        // A missing visual must never break the run.
      }
    }
  }

  /**
   * Live buff/debuff list in the shape the HUD reads. `duration` is what the
   * application granted, so the timer sweep has something to divide by.
   */
  get statuses(): Array<{ id: string; remaining: number; duration: number; stacks: number }> {
    return this.status.list().map((a) => ({
      id: a.id,
      remaining: a.remaining,
      duration: a.duration,
      stacks: a.stacks,
    }));
  }

  /** Applies a buff or debuff and refreshes the stat sheet. */
  applyStatus(id: string, duration: number, magnitude = 1, stacks = 1): boolean {
    const ok = this.status.apply({ id, duration, magnitude, stacks }, 'player');
    if (ok) this.refreshStats();
    return ok;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  get alive(): boolean {
    return this.life > 0;
  }

  get isBusy(): boolean {
    return this.actionLock > 0;
  }

  /**
   * Issue a click-to-move order.
   *
   * The destination is clamped to a sane radius: the cursor is projected onto
   * the ground plane, so a click near the horizon lands hundreds of units away
   * and reads to the player as "it never stops running".
   */
  moveTo(x: number, z: number): void {
    if (this.frozen || this.actionLock > 0) return;
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    const d = Math.hypot(dx, dz);
    const MAX = 30;
    if (d > MAX) {
      this.moveTarget = new THREE.Vector3(
        this.root.position.x + (dx / d) * MAX,
        0,
        this.root.position.z + (dz / d) * MAX
      );
      return;
    }
    this.moveTarget = new THREE.Vector3(x, 0, z);
  }

  stop(): void {
    this.moveTarget = null;
    this.velocity.set(0, 0, 0);
  }

  /** Face a world point immediately — used when starting an attack. */
  faceTowards(x: number, z: number): void {
    this.targetFacing = Math.atan2(x - this.root.position.x, z - this.root.position.z);
  }

  /** Lock out movement for an attack/cast and play the matching clip. */
  beginAction(clip: string, duration: number): void {
    this.actionLock = duration;
    this.moveTarget = null;
    this.animator.play(clip, { fade: 0.08, speed: Math.max(0.5, 0.45 / Math.max(duration, 0.15)) });
  }

  /** 0 when the dash is ready, 1 the instant it is spent. */
  get dodgeCooldown(): number {
    return this.dodgeCdMax > 0 ? Math.max(0, this.dodgeCd) / this.dodgeCdMax : 0;
  }

  dodge(dirX: number, dirZ: number): boolean {
    // A real cooldown. Without one the dash was limited only by its own 0.32s
    // animation, so holding the key was simply a faster way to move and there
    // was never a moment where committing to it cost anything.
    if (this.frozen || this.dodgeTime > 0 || this.actionLock > 0 || this.dodgeCd > 0) return false;
    const len = Math.hypot(dirX, dirZ) || 1;
    this.dodgeDir.set(dirX / len, 0, dirZ / len);
    this.dodgeTime = 0.32;
    this.actionLock = 0.32;
    this.dodgeCd = this.dodgeCdMax;
    this.animator.play('dodge', { fade: 0.05 });
    this.targetFacing = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    events.emit('sfx', { id: 'dodge' });
    return true;
  }

  spendMana(amount: number): boolean {
    if (this.mana < amount) return false;
    this.mana -= amount;
    return true;
  }

  heal(amount: number): void {
    const before = this.life;
    this.life = Math.min(this.stats.life, this.life + amount);
    const gained = this.life - before;
    if (gained > 0.5) events.emit('player:healed', { amount: gained });
  }

  restoreMana(amount: number): void {
    this.mana = Math.min(this.stats.mana, this.mana + amount);
  }

  /** Apply an incoming attack. Returns damage actually taken. */
  takeDamage(packet: DamagePacket, rng: Rng): number {
    if (!this.alive || this.invulnerable || this.dodgeTime > 0) return 0;
    const result = mitigate(packet, this.stats, rng);
    if (result.blocked) {
      events.emit('sfx', { id: 'block' });
      this.animator.play('hurt', { fade: 0.05, once: true });
      return 0;
    }
    // Harder tiers make every hit land heavier, after mitigation.
    result.amount *= activeDifficulty().damageTaken;
    this.life -= result.amount;
    events.emit('player:damaged', {
      amount: result.amount,
      type: result.type,
      life: Math.max(0, this.life),
      maxLife: this.stats.life,
    });
    this.animator.play('hurt', { fade: 0.04, once: true });

    if (this.life <= 0) {
      this.life = 0;
      this.frozen = true;
      this.animator.play('death', { fade: 0.1, once: true, hold: true });
      events.emit('player:died', { killedBy: packet.source || 'the dark', depth: this.character.depthRecord });
    }
    return result.amount;
  }

  isOnCooldown(skillId: string): boolean {
    return (this.cooldowns.get(skillId) ?? 0) > 0;
  }

  cooldownRemaining(skillId: string): number {
    return Math.max(0, this.cooldowns.get(skillId) ?? 0);
  }

  startCooldown(skillId: string, seconds: number): void {
    const reduced = seconds * (1 - Math.min(0.6, this.stats.cooldownReduction / 100));
    this.cooldowns.set(skillId, reduced);
  }

  update(dt: number, ctx: PlayerContext, keyboardDir: THREE.Vector3 | null): void {
    // Cooldowns tick even while locked in an animation.
    for (const [id, t] of this.cooldowns) {
      const next = t - dt;
      if (next <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, next);
    }

    if (this.actionLock > 0) this.actionLock = Math.max(0, this.actionLock - dt);

    // Statuses tick before regen so a heal-over-time lands this frame.
    const res = this.status.update(dt, this.stats.life);
    if (res.heal > 0) this.heal(res.heal);
    if (res.mana > 0) this.restoreMana(res.mana);
    for (const d of res.damage) {
      this.life -= d.amount;
      events.emit('player:damaged', {
        amount: d.amount,
        type: d.type,
        life: Math.max(0, this.life),
        maxLife: this.stats.life,
      });
    }
    if (res.dirty) this.refreshStats();
    if (this.life <= 0 && this.alive === false) {
      /* death is handled below by the damage path */
    }

    this.regenAccum += dt;
    if (this.regenAccum >= 0.25) {
      const step = this.regenAccum;
      this.regenAccum = 0;
      if (this.alive) {
        const regen = activeDifficulty().regen;
        this.life = Math.min(this.stats.life, this.life + this.stats.lifeRegen * step * regen);
        this.mana = Math.min(this.stats.mana, this.mana + this.stats.manaRegen * step * regen);
      }
    }

    if (!this.frozen && this.alive) {
      this.updateMovement(dt, ctx, keyboardDir);
    }

    // Smoothly rotate toward the desired facing — snapping reads as robotic.
    let delta = this.targetFacing - this.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.facing += delta * Math.min(1, dt * 16);
    this.root.rotation.y = this.facing;

    this.animator.update(dt);
  }

  private updateMovement(dt: number, ctx: PlayerContext, keyboardDir: THREE.Vector3 | null): void {
    const speedStat = 1 + this.stats.moveSpeed / 100;
    const baseSpeed = 4.6 * speedStat;

    if (this.dodgeCd > 0) this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    if (this.dodgeTime > 0) {
      this.dodgeTime -= dt;
      const t = Math.max(0, this.dodgeTime / 0.32);
      // Ease out so the dash front-loads its distance and lands cleanly.
      const dashSpeed = baseSpeed * 2.9 * (0.25 + t * 0.75);
      this.tryMove(this.dodgeDir.x * dashSpeed * dt, this.dodgeDir.z * dashSpeed * dt, ctx);
      return;
    }

    if (this.actionLock > 0) {
      this.velocity.multiplyScalar(Math.max(0, 1 - dt * 12));
      return;
    }

    let dirX = 0;
    let dirZ = 0;

    if (keyboardDir && keyboardDir.lengthSq() > 0.001) {
      dirX = keyboardDir.x;
      dirZ = keyboardDir.z;
      this.moveTarget = null;
    } else if (this.moveTarget) {
      TMP.copy(this.moveTarget).sub(this.root.position);
      TMP.y = 0;
      const dist = TMP.length();
      if (dist < 0.22) {
        this.moveTarget = null;
      } else {
        TMP.divideScalar(dist);
        dirX = TMP.x;
        dirZ = TMP.z;
      }
    }

    const moving = dirX !== 0 || dirZ !== 0;
    if (moving) {
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len;
      dirZ /= len;
      this.targetFacing = Math.atan2(dirX, dirZ);
      // Accelerate rather than teleport to full speed — gives the character weight.
      this.velocity.x += (dirX * baseSpeed - this.velocity.x) * Math.min(1, dt * 14);
      this.velocity.z += (dirZ * baseSpeed - this.velocity.z) * Math.min(1, dt * 14);
    } else {
      this.velocity.multiplyScalar(Math.max(0, 1 - dt * 18));
    }

    this.tryMove(this.velocity.x * dt, this.velocity.z * dt, ctx);

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.4) {
      this.animator.play(speed > baseSpeed * 0.65 ? 'run' : 'walk', {
        fade: 0.14,
        speed: speed / baseSpeed,
      });
    } else {
      this.animator.play('idle', { fade: 0.2 });
    }
  }

  /**
   * Move with wall sliding: try the full step, then each axis alone. Without
   * the per-axis retry the player sticks on every corner, which feels awful.
   */
  private tryMove(dx: number, dz: number, ctx: PlayerContext): void {
    const p = this.root.position;
    if (this.canStand(p.x + dx, p.z + dz, ctx)) {
      p.x += dx;
      p.z += dz;
      return;
    }
    if (this.canStand(p.x + dx, p.z, ctx)) {
      p.x += dx;
      this.velocity.z *= 0.4;
      return;
    }
    if (this.canStand(p.x, p.z + dz, ctx)) {
      p.z += dz;
      this.velocity.x *= 0.4;
      return;
    }
    this.velocity.set(0, 0, 0);
    this.moveTarget = null;
  }

  private canStand(x: number, z: number, ctx: PlayerContext): boolean {
    if (!ctx.walkableAt(x, z)) return false;
    const r = this.radius;
    for (const c of ctx.colliders) {
      const hw = c.w * 0.5 + r;
      const hd = c.d * 0.5 + r;
      if (Math.abs(x - c.x) < hw && Math.abs(z - c.z) < hd) return false;
    }
    return true;
  }

  dispose(): void {
    this.equipMeshes.clear();
  }
}
