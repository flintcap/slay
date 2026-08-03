import * as THREE from 'three';
import type { Character, Stats, DamagePacket, EquipSlot } from '../types';
import { computeStats } from '../sim/Stats';
import { mitigate } from '../sim/Combat';
import { StatusContainer } from '../sim/Status';
import { activeDifficulty } from '../data/difficulties';
import { events } from '../core/Events';
import { buildPlayerModel, attachToSocket, clearSocket, applyWornSlots, weaponGrip, carryGrip } from '../art/CharacterModels';
import { disposeObject } from '../core/Engine';
import { Animator } from '../art/Animation';
import { buildItemModel } from '../art/ItemModels';
import { getBase } from '../sim/Loot';
import { Random } from '../core/RNG';
import type { Rng } from '../types';
import { passiveEffects, newPassiveState, type PassiveEffects, type PassiveState } from '../sim/Passives';

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

  /**
   * What this character's passives add up to, and what the engine remembers
   * between hits. Recomputed alongside `stats`, which is the only time either
   * can change.
   */
  passives: PassiveEffects = passiveEffects({ skills: {} } as never);
  readonly passiveState: PassiveState = newPassiveState();

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
  /** Seconds of timed invulnerability left, from Phoenix Heart and friends. */
  private invulnTimer = 0;
  /** How solid the body currently reads, 1 normal and lower while Veiled. */
  private bodyFade = 1;
  private appliedFade = 1;
  private appliedCoat = false;

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
    // Passives resolve on the same trigger as stats: both only change when gear
    // or the skill tree changes.
    this.passives = passiveEffects(this.character);
    // Death's Embrace: a slice of the mana pool becomes life outright.
    if (this.passives.manaToLifePct > 0) {
      const moved = this.stats.mana * (this.passives.manaToLifePct / 100);
      this.stats.mana = Math.max(1, this.stats.mana - moved);
      this.stats.life += moved;
    }
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
        const base = getBase(item.baseId);
        const visual = base?.visual ?? { shape: 'auto', palette: 'metal.steel' };
        // Quivers are worn on the back rather than held.
        const socketKey = base?.category === 'quiver' ? 'quiver' : undefined;
        // How it is carried: a greatsword is not held like a dagger.
        const grip =
          slot === 'mainHand' || slot === 'offHand'
            ? weaponGrip(base?.category, base?.slot === 'twoHand')
            : undefined;
        const mesh = buildItemModel(visual, this.rng, item.rarity);
        attachToSocket(this.root, this.bones, slot, mesh, socketKey, grip);
        // Marks the weapon so a poison coat can glow on the blade and nowhere
        // else. Cheap to stamp here; walking the tree for it later is not.
        if (slot === 'mainHand' || slot === 'offHand') {
          mesh.traverse((o) => {
            o.userData.weaponPart = true;
          });
        }
        this.equipMeshes.set(slot, mesh);
        // A new model brings fresh shared materials, so the tint has to be
        // reapplied rather than skipped by the change guard.
        this.appliedFade = -1;
        this.appliedCoat = !this.appliedCoat;
      } catch {
        // A missing visual must never break the run.
      }
    }
    // Two-handed weapons need both hands on them and a bow needs the string
    // hand brought across, which is a body pose rather than a socket transform.
    const main = eq.mainHand ? getBase(eq.mainHand.baseId) : undefined;
    this.animator.setGrip(carryGrip(main?.category, main?.slot === 'twoHand'));
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

  /**
   * Shoved backwards by a hit. Cancels the move order, because being knocked
   * across a room and then walking straight back to where you were standing is
   * not a knockback.
   */
  shove(force: number): void {
    const f = Math.max(0, Math.min(6, force));
    if (f <= 0) return;
    // Away from wherever the blow came from, which is whatever the player is
    // facing: monsters hit you from the front in almost every case.
    const push = f * 0.16;
    this.root.position.x -= Math.sin(this.root.rotation.y) * push;
    this.root.position.z -= Math.cos(this.root.rotation.y) * push;
    this.moveTarget = null;
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
    // Routed through the cost path so Crimson Covenant's life payment applies
    // to every caster in the game rather than one call site.
    return this.paySkillCost(amount);
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
    // Gloom Shroud and Undying both cut what actually lands, after mitigation
    // rather than as armour, because both are written as "you take less".
    const e = this.passives;
    let cut = 0;
    if (e.stealthReductionPct > 0 && this.status.has('veiled')) cut += e.stealthReductionPct;
    if (e.lowLifeReductionPct > 0 && (this.life / Math.max(1, this.stats.life)) * 100 <= e.lowLifeThreshold) {
      cut += e.lowLifeReductionPct;
    }
    if (cut > 0) result.amount *= Math.max(0.1, 1 - cut / 100);
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

    // Whatever the hit carried, the player now has.
    //
    // `DamagePacket.applies` has always existed and monsters have always filled
    // it in — nothing ever read it on this side, so a hit that was supposed to
    // slow, terrify or poison you did its damage and nothing else. Every debuff
    // a monster can inflict was dead on arrival here.
    if (packet.applies?.length) {
      for (const a of packet.applies) {
        this.applyStatus(a.id, a.duration, a.magnitude, a.stacks ?? 1);
      }
    }
    // Knockback is carried the same way and was equally ignored.
    if (packet.knockback && packet.knockback > 0) {
      this.shove(packet.knockback);
    }

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

  /**
   * Attack speed including the Flurry stack, which is not a stat grant — it
   * builds on landed hits and decays when you stop connecting, so it cannot
   * live in the stat sheet.
   */
  get attackSpeedPct(): number {
    const e = this.passives;
    return this.stats.attackSpeed + e.hitStackAttackSpeed * this.passiveState.hitStacks;
  }

  /**
   * Pays a skill's cost, spending life when mana runs short.
   *
   * Crimson Covenant is the only thing that lets you do that, and it is what
   * makes the Revenant's low-mana damage bonus reachable rather than a trap.
   */
  paySkillCost(mana: number): boolean {
    if (this.mana >= mana) {
      this.mana -= mana;
      return true;
    }
    const rate = this.passives.lifePerMana;
    if (rate <= 0) return false;
    const short = mana - this.mana;
    const life = short * rate;
    if (this.life <= life) return false;
    this.mana = 0;
    this.life -= life;
    return true;
  }

  /** Makes the player untouchable for a while. Used by the cheat-death passives. */
  grantInvulnerability(seconds: number): void {
    this.invulnTimer = Math.max(this.invulnTimer, seconds);
    this.invulnerable = true;
  }

  update(dt: number, ctx: PlayerContext, keyboardDir: THREE.Vector3 | null): void {
    if (this.invulnTimer > 0) {
      this.invulnTimer -= dt;
      if (this.invulnTimer <= 0) this.invulnerable = false;
    }
    // Passive cooldowns tick here too — a cheat death you cannot spend twice.
    if (this.passiveState.cheatDeathCd > 0) {
      this.passiveState.cheatDeathCd = Math.max(0, this.passiveState.cheatDeathCd - dt);
    }
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
        // Each banked Soul is mana regeneration on top of the sheet.
        const souls = this.passives.soulManaRegen * this.passiveState.souls;
        this.life = Math.min(this.stats.life, this.life + this.stats.lifeRegen * step * regen);
        this.mana = Math.min(
          this.stats.mana,
          this.mana + (this.stats.manaRegen + souls) * step * regen,
        );
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
    this.updateBodyTint(dt);
  }

  /**
   * How the body reads while a status is changing what you are.
   *
   * Veil is the case that needs it: enemies stop seeing you, and without a
   * visual the skill looks like it did nothing at all. The whole model fades
   * toward a dark, half-there silhouette and comes back when the status drops.
   * Coated Blades is the other: a poison on the weapon should be visible on the
   * weapon, so the blade takes a green rim.
   *
   * Materials are cloned once per model on first use — the shared cache must
   * never be tinted, or every character in the game turns green.
   */
  private updateBodyTint(dt: number): void {
    const hidden = this.status.has('veiled');
    const coated = this.status.has('envenomed') || this.status.has('skill.coatBlades');
    const wantFade = hidden ? 0.32 : 1;
    this.bodyFade += (wantFade - this.bodyFade) * Math.min(1, dt * 6);

    const fadeChanged = Math.abs(this.bodyFade - this.appliedFade) > 0.01;
    const coatChanged = coated !== this.appliedCoat;
    if (!fadeChanged && !coatChanged) return;
    this.appliedFade = this.bodyFade;
    this.appliedCoat = coated;

    const dim = this.bodyFade;
    const translucent = dim < 0.99;
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = this.ownMaterial(mesh);
      if (!mat) return;
      mat.transparent = translucent;
      mat.opacity = 0.15 + dim * 0.85;
      mat.depthWrite = !translucent;
      // Darken as it fades, so a veiled hero reads as a shadow rather than a
      // ghost of themselves.
      mat.color.copy(mat.userData.baseColor as THREE.Color).multiplyScalar(0.35 + dim * 0.65);
      if (mesh.userData.weaponPart) {
        mat.emissive.setHex(coated ? 0x2fbf4a : (mat.userData.baseEmissive as number) ?? 0x000000);
        mat.emissiveIntensity = coated ? 1.5 : 1;
      }
      mat.needsUpdate = fadeChanged !== coatChanged;
    });
  }

  /**
   * A material this player owns outright.
   *
   * `surface()` hands out shared, cached materials; tinting one would tint
   * every wall and every other character using it. The first time a mesh needs
   * to be tinted it gets its own clone, and the original colour is stashed so
   * the effect can be undone exactly.
   */
  private ownMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial | null {
    const m = mesh.material;
    if (Array.isArray(m)) return null;
    const std = m as THREE.MeshStandardMaterial;
    if (!std || !std.isMaterial) return null;
    if (!std.userData.playerOwned) {
      const copy = std.clone() as THREE.MeshStandardMaterial;
      copy.userData = { ...std.userData, playerOwned: true, shared: false };
      copy.userData.baseColor = copy.color.clone();
      copy.userData.baseEmissive = copy.emissive.getHex();
      mesh.material = copy;
      return copy;
    }
    return std;
  }

  private updateMovement(dt: number, ctx: PlayerContext, keyboardDir: THREE.Vector3 | null): void {
    // Tailwind pays for running: once you have banked enough distance without
    // stopping, you move and cast faster. `passiveState.moving` is the banked
    // metres, kept by the scene.
    const pass = this.passives;
    const tail =
      pass.momentumMovePct > 0 && this.passiveState.moving >= (pass.momentumMoveCap || 5)
        ? pass.momentumMovePct
        : 0;
    const speedStat = 1 + (this.stats.moveSpeed + tail) / 100;
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
