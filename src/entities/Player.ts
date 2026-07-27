import * as THREE from 'three';
import type { Character, Stats, DamagePacket, EquipSlot } from '../types';
import { computeStats } from '../sim/Stats';
import { mitigate } from '../sim/Combat';
import { events } from '../core/Events';
import { buildPlayerModel, attachToSocket } from '../art/CharacterModels';
import { Animator } from '../art/Animation';
import { buildItemModel } from '../art/ItemModels';
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

  /** Cooldowns by skill id. */
  readonly cooldowns = new Map<string, number>();

  private regenAccum = 0;
  private rng: Rng;
  private equipMeshes = new Map<EquipSlot, THREE.Object3D>();

  /** Set by DungeonScene when the player has no business moving (dead, cutscene). */
  frozen = false;
  invulnerable = false;

  constructor(character: Character, seed = 1) {
    this.character = character;
    this.rng = new Random(seed);

    const built = buildPlayerModel(character.classId, this.rng);
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

  /** Rebuilds attached weapon/armor meshes from current equipment. */
  private refreshEquipmentVisuals(): void {
    for (const [slot, mesh] of this.equipMeshes) {
      mesh.removeFromParent();
      this.equipMeshes.delete(slot);
    }
    const eq = this.character.equipment;
    for (const slot of ['mainHand', 'offHand', 'helm', 'chest'] as EquipSlot[]) {
      const item = eq[slot];
      if (!item) continue;
      try {
        const mesh = buildItemModel(
          { shape: 'auto', palette: 'metal.steel' },
          this.rng,
          item.rarity
        );
        attachToSocket(this.root, this.bones, slot, mesh);
        this.equipMeshes.set(slot, mesh);
      } catch {
        // A missing visual must never break the run.
      }
    }
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

  /** Issue a click-to-move order. */
  moveTo(x: number, z: number): void {
    if (this.frozen || this.actionLock > 0) return;
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

  dodge(dirX: number, dirZ: number): boolean {
    if (this.frozen || this.dodgeTime > 0 || this.actionLock > 0) return false;
    const len = Math.hypot(dirX, dirZ) || 1;
    this.dodgeDir.set(dirX / len, 0, dirZ / len);
    this.dodgeTime = 0.32;
    this.actionLock = 0.32;
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

    this.regenAccum += dt;
    if (this.regenAccum >= 0.25) {
      const step = this.regenAccum;
      this.regenAccum = 0;
      if (this.alive) {
        this.life = Math.min(this.stats.life, this.life + this.stats.lifeRegen * step);
        this.mana = Math.min(this.stats.mana, this.mana + this.stats.manaRegen * step);
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
