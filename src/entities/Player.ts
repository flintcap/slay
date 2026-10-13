import * as THREE from 'three';
import type { Character, Stats, DamagePacket, EquipSlot } from '../types';
import { charmKey, computeStats } from '../sim/Stats';
import { mitigate } from '../sim/Combat';
import { StatusContainer, adoptStatuses, releaseAdopted } from '../sim/Status';
import { activeDifficulty } from '../data/difficulties';
import { events } from '../core/Events';
import { HeroAnimator, type BodyCondition } from '../art/hero/Animator';
import { strikesAt } from '../art/hero/gestures';
import { DressedHero } from '../scenes/HeroModel';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { collidersNear } from '../world/BodyWalk';
import { Random } from '../core/RNG';
import type { Rng } from '../types';
import { passiveEffects, newPassiveState, type PassiveEffects, type PassiveState } from '../sim/Passives';

export interface PlayerContext {
  /** Boxes, or circles where `r` is set (round props: barrels, pillars). `moves` marks one that walks (a resident). */
  colliders: Array<{ x: number; z: number; w: number; d: number; r?: number; moves?: boolean }>;
  /** Returns true if the world position is standing on walkable ground. */
  walkableAt(x: number, z: number): boolean;
  /**
   * Waypoints (world x, z as x, y) around whatever is in the way, ending on
   * the destination. Empty when there is no way. Optional: town has none.
   */
  path?(fromX: number, fromZ: number, toX: number, toZ: number): Array<{ x: number; y: number }>;
}

const TMP = new THREE.Vector3();
const TMP2 = new THREE.Vector3();

/** What a Shadow Clone is made of: near black, lit from inside in violet. Shared. */
const SHADOW_MAT = new THREE.MeshStandardMaterial({
  color: 0x0a0712,
  roughness: 0.6,
  metalness: 0.15,
  emissive: 0x2a1046,
  emissiveIntensity: 0.85,
});

/** Frees a shadow double's skeletons. Geometry is the hero's; the material is shared. */
export function releaseShadowDouble(root: THREE.Object3D): void {
  root.removeFromParent();
  root.traverse((o) => {
    const sk = (o as THREE.SkinnedMesh).isSkinnedMesh ? (o as THREE.SkinnedMesh).skeleton : null;
    sk?.dispose();
  });
}

/**
 * Equipment slots that put geometry on the body. Rings and amulets are left
 * off: at gameplay camera distance they cost a draw call and show nothing.
 */
/**
 * When a weapon swing connects, as a share of the action's length, per clip.
 * Melee damage waits for this moment (`Player.contactIn`) instead of landing on
 * the click. Clips not listed (casts, the dash, blinks) land at once.
 * Animation: author each strike to land here, capped at `CONTACT_CAP` seconds.
 */
export const CLIP_CONTACT: Readonly<Record<string, number>> = {
  attack1: 0.35,
  attack2: 0.33,
  slam: 0.4,
  thrust: 0.32,
  lunge: 0.32,
  stomp: 0.38,
};
/** Contact share of a skill's own weapon-blow gesture (`SkillActions` `hit`). */
const SKILL_BLOW_CONTACT = 0.35;
/** No swing waits longer than this to connect, however slow the weapon. */
export const CONTACT_CAP = 0.16;

/** Seconds from the start of an action to its contact frame. */
export function contactDelay(clip: string, duration: number): number {
  // A skill's own weapon blow lands where a plain swing would.
  const f = CLIP_CONTACT[clip] ?? (strikesAt(clip) ? SKILL_BLOW_CONTACT : undefined);
  return f === undefined ? 0 : Math.min(CONTACT_CAP, f * Math.max(0, duration));
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
  readonly animator: HeroAnimator;

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

  /**
   * The body's footprint for walls and props. Smaller than `radius` (reach):
   * a wide footprint snagged on every barrel and door frame.
   */
  private readonly bodyR = 0.32;
  /** Current click-to-move destination, or null when idle/keyboard-driven. */
  private moveTarget: THREE.Vector3 | null = null;
  /** The way round obstacles to `moveTarget`, next waypoint first. */
  private route: Array<{ x: number; y: number }> = [];
  /** The destination `route` was planned for, and when to plan again. */
  private routeFor: THREE.Vector3 | null = null;
  private replanIn = 0;
  /** Seconds a click-to-move order has made no headway. */
  private stuckFor = 0;
  /** Which way the body last stepped round something head on: 1 left, -1 right. */
  private slipSide = 1;
  private velocity = new THREE.Vector3();
  private facing = 0;
  private targetFacing = 0;

  /** Seconds remaining in an uninterruptible action (attack/cast/dodge). */
  private actionLock = 0;
  /** Full length of the current action, so its recovery tail can be cancelled. */
  private actionTotal = 0;
  /** Bumped by every new action and every dodge, so a queued blow can tell it was cut off. */
  private actionSerial = 0;
  /** Seconds into the current action at which its blow connects. */
  private contactAt = 0;
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
  /** The body, its gear and its animator (`src/scenes/HeroModel.ts`). */
  private hero: DressedHero;

  /** Set by DungeonScene when the player has no business moving (dead, cutscene). */
  frozen = false;
  invulnerable = false;
  /** Seconds of timed invulnerability left, from Phoenix Heart and friends. */
  private invulnTimer = 0;
  /** How solid the body currently reads, 1 normal and lower while Veiled. */
  private bodyFade = 1;
  private appliedFade = 1;
  private appliedCoat = false;
  /** Each mesh's own opaque material, and each one's see-through veil twin. */
  private ownMats = new WeakMap<THREE.Mesh, THREE.MeshStandardMaterial>();
  private veilMats = new WeakMap<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();

  constructor(character: Character, seed = 1) {
    this.character = character;
    this.rng = new Random(seed);
    // computeStats finds statuses by character id; without this no buff on the
    // player ever reached the sheet.
    adoptStatuses(character.id, this.status);

    this.hero = new DressedHero(character.classId, seed);
    this.root.add(this.hero.root);
    this.bones = this.hero.bones;
    this.animator = this.hero.animator;
    // The animator reads real ground motion from the body so feet plant.
    this.animator.follow(this.root);

    this.stats = computeStats(character);
    this.life = this.stats.life;
    this.mana = this.stats.mana;

    // The full recompute, passives included. Passives were only ever worked
    // out by `refreshStats`, which nothing called on arrival, so every passive
    // skill (Toxicology, Corrosive Edge, the masteries) did nothing in a fresh
    // town or map until a level-up, a gear change or a buff happened to call it.
    this.refreshStats();
    this.life = this.stats.life;
    this.mana = this.stats.mana;
  }

  private charmCheck = 0;
  private charmSeen: string | null = null;

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
    if (!this.hero.dress(this.character.equipment)) return;
    // A new model brings fresh shared materials, so the tint has to be
    // reapplied rather than skipped by the change guard.
    this.appliedFade = -1;
    this.appliedCoat = !this.appliedCoat;
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
    return this.actionLock > 0 || this.incapacitated;
  }

  /**
   * Stunned, frozen, petrified, knocked down: no attacks, no casts, no dash.
   * Monsters put these on the hero all along and nothing read them, so a
   * stun from a Thunderclap was a stat line and a sound.
   */
  get incapacitated(): boolean {
    return this.status.isIncapacitated();
  }

  /** Rooted or grasped (or worse): the feet stay put, the hands still work. */
  get immobilised(): boolean {
    return this.status.isImmobilised();
  }

  /**
   * Issue a click-to-move order.
   *
   * The destination is clamped to a sane radius: the cursor is projected onto
   * the ground plane, so a click near the horizon lands hundreds of units away
   * and reads to the player as "it never stops running".
   */
  moveTo(x: number, z: number): void {
    if (this.frozen) return;
    // A move order during an attack's recovery cancels it; earlier than that
    // the order is kept and the hero sets off the instant the swing ends,
    // rather than the click being thrown away.
    this.cancelRecovery();
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
  beginAction(clip: string, duration: number, side?: 'L' | 'R'): void {
    this.actionLock = duration;
    this.actionTotal = duration;
    this.actionSerial++;
    this.contactAt = contactDelay(clip, duration);
    this.moveTarget = null;
    // The clip is bent so its blow lands on the contact frame above; anything
    // that resolves on the click releases a beat in, before the eye can tell.
    this.animator.play(clip, {
      fade: 0.08,
      speed: Math.max(0.5, 0.45 / Math.max(duration, 0.15)),
      restart: true,
      contact: this.contactAt > 0 ? this.contactAt : Math.min(0.1, duration * 0.3),
      side,
    });
  }

  /**
   * One blade's blow inside an action already running (two blades: the off
   * hand answering a skill the main hand led). Plays that hand's swing
   * without starting a new action; returns the seconds until it connects.
   */
  handBlow(side: 'L' | 'R', duration: number): number {
    const contact = Math.max(0.05, Math.min(CONTACT_CAP, CLIP_CONTACT.attack2! * duration));
    this.animator.play('attack2', {
      fade: 0.06,
      speed: Math.max(0.5, 0.45 / Math.max(duration, 0.15)),
      restart: true,
      contact,
      side,
    });
    return contact;
  }

  /** Identifies the current action. Changes when a new one starts or a dodge cuts it off. */
  get actionId(): number {
    return this.actionSerial;
  }

  /** Seconds until the current swing connects. 0 with no swing, or once it has. */
  get contactIn(): number {
    if (this.actionLock <= 0 || this.actionTotal <= 0) return 0;
    return Math.max(0, this.contactAt - (this.actionTotal - this.actionLock));
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
    // A real shove throws the body back a step; a nudge is just the flinch.
    if (f >= 1.5 && this.alive) this.animator.play('stagger', { fade: 0.05 });
  }

  /**
   * Fraction of an action after which movement may cut it short. Every hit in
   * the game resolves by then (melee at its contact frame, `CLIP_CONTACT`, at
   * most 40% in), so what remains is follow-through; letting a move order take it back is what makes the
   * controls feel instant without letting anyone attack faster.
   */
  static readonly RECOVERY_CANCEL_AT = 0.55;

  /** True once the current action is far enough along to be walked out of. */
  get inRecovery(): boolean {
    if (this.actionLock <= 0 || this.dodgeTime > 0 || this.actionTotal <= 0) return false;
    return 1 - this.actionLock / this.actionTotal >= Player.RECOVERY_CANCEL_AT;
  }

  /** Ends the current action early if it is in its recovery tail. */
  cancelRecovery(): boolean {
    if (!this.inRecovery) return false;
    this.actionLock = 0;
    this.actionTotal = 0;
    return true;
  }

  /** Seconds until a dodge would be accepted. Zero when it is ready now. */
  get dodgeReadyIn(): number {
    if (this.frozen) return Infinity;
    return Math.max(this.dodgeCd, this.dodgeTime > 0 ? this.dodgeTime : 0);
  }

  /**
   * Rolls along (dirX, dirZ). `quiet` leaves the sound to the caller: a dash
   * skill plays its own (audio/SkillSounds.ts), not the plain dodge.
   */
  dodge(dirX: number, dirZ: number, quiet = false, clip = 'dodge'): boolean {
    // A real cooldown. Without one the dash was limited only by its own 0.32s
    // animation, so holding the key was simply a faster way to move and there
    // was never a moment where committing to it cost anything.
    //
    // It does not wait for an attack to finish, though. The evade is the answer
    // to a telegraph, and an answer that is refused because you were swinging
    // is not one: it cancels whatever the hero was doing.
    if (this.frozen || this.dodgeTime > 0 || this.dodgeCd > 0) return false;
    // A root holds the feet and a stun the whole body: no dash out of either.
    if (this.immobilised) return false;
    this.actionLock = 0;
    // A swing dodged out of before it connects never lands.
    this.actionSerial++;
    this.contactAt = 0;
    const len = Math.hypot(dirX, dirZ) || 1;
    this.dodgeDir.set(dirX / len, 0, dirZ / len);
    this.dodgeTime = 0.32;
    this.actionLock = 0.32;
    this.actionTotal = 0.32;
    this.dodgeCd = this.dodgeCdMax;
    // A dash skill moves the same way but plays its own gesture.
    this.animator.play(clip, { fade: 0.05 });
    this.targetFacing = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    if (!quiet) events.emit('sfx', { id: 'dodge' });
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
    if (!this.alive || this.invulnerable) return 0;
    if (this.dodgeTime > 0) {
      // Slipped it. Said out loud so the feel layer can reward a timed evade.
      if (packet.amount > 0) events.emit('player:evaded', { ability: packet.ability ?? '', source: packet.source });
      return 0;
    }
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
    // Charms work from the pack, and the pack changes through a dozen doors
    // (pickup, drag, vendor, vault). Watch what is carried instead.
    this.charmCheck -= dt;
    if (this.charmCheck <= 0) {
      this.charmCheck = 0.4;
      const key = charmKey(this.character);
      if (key !== this.charmSeen) {
        const first = this.charmSeen === null;
        this.charmSeen = key;
        if (!first) this.refreshStats();
      }
    }
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

    this.animator.setCondition(this.bodyCondition);
    this.animator.update(dt);
    this.updateBodyTint(dt);
  }

  /** What the hero's statuses are doing to the body, for the animator. */
  private get bodyCondition(): BodyCondition {
    if (!this.alive) return 'none';
    const st = this.status;
    if (st.has('frozen') || st.has('petrified')) return 'frozen';
    if (st.has('knockedDown')) return 'down';
    if (this.incapacitated) return 'stunned';
    if (this.immobilised) return 'rooted';
    return 'none';
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
      const own = this.ownMaterial(mesh);
      if (!own) return;
      // Fading swaps to a see-through twin rather than flipping `transparent`
      // on the one material: that flip is a new shader program for every part
      // of the hero, linked on the frame Veil was first cast (seconds, cold).
      // The twins are compiled behind the loading curtain (`veilStandIns`).
      const veil = translucent ? this.veilMaterial(own) : null;
      const mat = veil ?? own;
      if (mesh.material !== mat) mesh.material = mat;
      mat.opacity = veil ? 0.15 + dim * 0.85 : 1;
      // Darken as it fades, so a veiled hero reads as a shadow rather than a
      // ghost of themselves.
      mat.color.copy(own.userData.baseColor as THREE.Color).multiplyScalar(0.35 + dim * 0.65);
      if (mesh.userData.weaponPart && mat.emissive) {
        mat.emissive.setHex(coated ? 0x2fbf4a : (own.userData.baseEmissive as number) ?? 0x000000);
        mat.emissiveIntensity = coated ? 1.5 : 1;
      }
    });
  }

  /**
   * One copy of each hero part wearing its see-through veil material, for the
   * scene's warmup: drawn once behind the loading curtain so the shaders are
   * linked before the first Veil. Skinned copies share the hero's skeleton.
   */
  /**
   * A dark double of this hero as they stand now: the same body, armour and
   * weapons, with its own skeleton and animator, all in shadow. What Shadow
   * Clone raises (scenes/SkillRunner.ts). The caller owns it; free it with
   * `releaseShadowDouble`.
   */
  shadowDouble(): { root: THREE.Object3D; animator: HeroAnimator } {
    const copy = cloneSkinned(this.hero.root);
    const drop: THREE.Object3D[] = [];
    copy.traverse((o) => {
      // Lights, glows and auras would read as the hero's own; a shadow has none.
      if ((o as THREE.Light).isLight || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite || (o as THREE.Line).isLine) {
        drop.push(o);
        return;
      }
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = SHADOW_MAT;
      mesh.castShadow = false;
    });
    for (const o of drop) o.removeFromParent();
    const bones: Record<string, THREE.Bone> = {};
    copy.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone;
    });
    // The copy was taken mid-step; its animator reads the bind from the bones.
    bones.pelvis?.position.copy(this.animator.restPelvis());
    const animator = new HeroAnimator(bones);
    animator.copyCarry(this.animator);
    const root = new THREE.Group();
    root.name = 'shadow-double';
    root.userData.shadowDouble = true;
    root.add(copy);
    animator.follow(root);
    animator.play('idle', { fade: 0 });
    return { root, animator };
  }

  /** The shadow material's programs, linked behind the curtain rather than on first cast. */
  shadowStandIns(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const seen = new Set<string>();
    this.hero.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const key = `${(mesh as THREE.SkinnedMesh).isSkinnedMesh ? 1 : 0}|${Object.keys(mesh.geometry.morphAttributes).join(',')}`;
      if (seen.has(key)) return;
      seen.add(key);
      const copy = mesh.clone(false) as THREE.Mesh;
      copy.material = SHADOW_MAT;
      copy.frustumCulled = false;
      copy.castShadow = false;
      out.push(copy);
    });
    return out;
  }

  veilStandIns(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const seen = new Set<string>();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const own = this.ownMaterial(mesh);
      if (!own) return;
      const veil = this.veilMaterial(own);
      const key = `${veil.uuid}|${(mesh as THREE.SkinnedMesh).isSkinnedMesh ? 1 : 0}|${Object.keys(mesh.geometry.morphAttributes).join(',')}`;
      if (seen.has(key)) return;
      seen.add(key);
      const copy = mesh.clone(false) as THREE.Mesh;
      copy.material = veil;
      copy.frustumCulled = false;
      copy.castShadow = false;
      out.push(copy);
    });
    return out;
  }

  /** The see-through twin of one of this player's own materials, made once. */
  private veilMaterial(own: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    let veil = this.veilMats.get(own);
    if (!veil) {
      veil = own.clone() as THREE.MeshStandardMaterial;
      veil.userData = { ...own.userData, playerOwned: true, veilOf: own.uuid };
      veil.onBeforeCompile = own.onBeforeCompile;
      veil.customProgramCacheKey = own.customProgramCacheKey;
      veil.transparent = true;
      veil.depthWrite = false;
      veil.opacity = 0.42;
      this.veilMats.set(own, veil);
    }
    return veil;
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
    // Glows and eyes may be unlit (basic) materials: no emissive, but a colour.
    if (!std || !std.isMaterial || !std.color) return null;
    // Already wearing its veil twin: hand back the opaque original.
    if (std.userData.veilOf) {
      const own = this.ownMats.get(mesh);
      if (own) return own;
    }
    if (!std.userData.playerOwned) {
      const copy = std.clone() as THREE.MeshStandardMaterial;
      copy.userData = { ...std.userData, playerOwned: true, shared: false };
      copy.userData.baseColor = copy.color.clone();
      copy.userData.baseEmissive = copy.emissive?.getHex() ?? 0;
      // A clone drops shader patches (the hero's triplanar maps): keep them.
      copy.onBeforeCompile = std.onBeforeCompile;
      copy.customProgramCacheKey = std.customProgramCacheKey;
      mesh.material = copy;
      this.ownMats.set(mesh, copy);
      return copy;
    }
    this.ownMats.set(mesh, std);
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

    // Held in place: the order is kept and resumed the moment it wears off.
    if (this.immobilised) {
      this.velocity.set(0, 0, 0);
      return;
    }

    // Steering by hand walks out of an attack's follow-through.
    if (this.actionLock > 0 && keyboardDir && keyboardDir.lengthSq() > 0.001) this.cancelRecovery();
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
        this.route = [];
      } else {
        // Walk the way round anything in between, not straight into it.
        const way = this.steer(dt, ctx);
        if (way) {
          dirX = way.x - this.root.position.x;
          dirZ = way.y - this.root.position.z;
        } else {
          TMP.divideScalar(dist);
          dirX = TMP.x;
          dirZ = TMP.z;
        }
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
   * The next point to walk at for a click-to-move order, or null to head
   * straight for it. Plans a route when the straight line is blocked (a
   * table, a pillar, a wall corner between you and the click), plans again
   * when the order changes or stalls, and drops waypoints as they are reached.
   */
  private steer(dt: number, ctx: PlayerContext): { x: number; y: number } | null {
    const t = this.moveTarget;
    if (!t || !ctx.path) return null;
    const p = this.root.position;
    this.replanIn -= dt;
    const changed = !this.routeFor || this.routeFor.distanceToSquared(t) > 0.25;
    if (changed || (this.stuckFor > 0.2 && this.replanIn <= 0)) {
      this.routeFor = t.clone();
      this.replanIn = 0.4;
      this.route = this.lineClear(p.x, p.z, t.x, t.z, ctx) ? [] : ctx.path(p.x, p.z, t.x, t.z);
      // The route's last point is the tile it could reach; the click itself
      // is the goal once the way to it is open.
      if (this.route.length) this.route[this.route.length - 1] = { x: t.x, y: t.z };
    }
    // Skip waypoints already reached, or ones the next can be seen past.
    while (this.route.length) {
      const w = this.route[0]!;
      const near = (w.x - p.x) ** 2 + (w.y - p.z) ** 2 < 0.35 * 0.35;
      const next = this.route[1];
      if (near || (next && this.lineClear(p.x, p.z, next.x, next.y, ctx))) this.route.shift();
      else break;
    }
    return this.route[0] ?? null;
  }

  /** True when the body could walk the straight line from a to b. */
  private lineClear(ax: number, az: number, bx: number, bz: number, ctx: PlayerContext): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / 0.3));
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      if (!this.canStand(ax + (bx - ax) * k, az + (bz - az) * k, ctx)) return false;
    }
    return true;
  }

  /**
   * Moves the body, sliding round whatever it meets. The step is taken, then
   * the body is pushed back out of anything it went into, along the surface
   * normal: flat faces slide, box corners and round props roll the body
   * round them instead of catching it. Speed along the surface is kept (the
   * old per-axis retry cut it on every touch). If the push leaves it
   * somewhere it cannot stand, each axis is tried alone, then nothing.
   */
  private tryMove(dx: number, dz: number, ctx: PlayerContext): void {
    const p = this.root.position;
    const ox = p.x;
    const oz = p.z;
    const want = dx * dx + dz * dz;
    const hit = this.resolve(ox + dx, oz + dz, ox, oz, ctx);
    let nx = hit.x;
    let nz = hit.z;
    // Head on into something round (or a box corner dead ahead): the push
    // undoes the whole step and nothing is left along the surface, so the
    // body would stand there pressing. Step round it instead, on the side the
    // order leans to, else the side it last went round, so it never dithers.
    if (hit.nx !== 0 || hit.nz !== 0) {
      const got = (nx - ox) ** 2 + (nz - oz) ** 2;
      if (got < want * 0.25 && want > 1e-8) {
        let tx = -hit.nz;
        let tz = hit.nx;
        const lean = (tx * dx + tz * dz) / Math.sqrt(want);
        if (Math.abs(lean) > 0.08) this.slipSide = lean > 0 ? 1 : -1;
        tx *= this.slipSide;
        tz *= this.slipSide;
        const step = Math.sqrt(want);
        const slip = this.resolve(ox + tx * step, oz + tz * step, ox, oz, ctx);
        if (this.canStand(slip.x, slip.z, ctx)) {
          nx = slip.x;
          nz = slip.z;
        }
      }
    }
    if (this.canStand(nx, nz, ctx)) {
      p.x = nx;
      p.z = nz;
    } else if (this.canStand(ox + dx, oz, ctx)) {
      p.x = ox + dx;
    } else if (this.canStand(ox, oz + dz, ctx)) {
      p.z = oz + dz;
    } else {
      this.velocity.set(0, 0, 0);
    }
    // An order that has stopped getting anywhere plans again, and is given up
    // only if that does not help.
    const got = (p.x - ox) ** 2 + (p.z - oz) ** 2;
    if (this.moveTarget && want > 1e-8 && got < want * 0.04) {
      this.stuckFor += 1 / 60;
      if (this.stuckFor > 1.2) {
        this.moveTarget = null;
        this.route = [];
        this.stuckFor = 0;
      }
    } else this.stuckFor = Math.max(0, this.stuckFor - 1 / 30);
  }

  /**
   * Pushes a body at (x, z), arriving from (ox, oz), back out of everything
   * it overlaps, along each surface's normal. Velocity into a surface is
   * removed; along it is kept. Returns where it ends and the normal of the
   * deepest contact (0, 0 when it touched nothing).
   */
  private resolve(x: number, z: number, ox: number, oz: number, ctx: PlayerContext): { x: number; z: number; nx: number; nz: number } {
    const r = this.bodyR;
    let nx = x;
    let nz = z;
    let best = 0;
    let bnx = 0;
    let bnz = 0;
    // Only what is near: a floor holds several hundred colliders.
    const near = [...collidersNear(ctx.colliders, x, z, r + Math.hypot(x - ox, z - oz) + 0.5)];
    for (let pass = 0; pass < 3; pass++) {
      let pushed = false;
      for (const c of near) {
        let px: number;
        let pz: number;
        let reach: number;
        if (c.r !== undefined) {
          px = c.x;
          pz = c.z;
          reach = c.r + r;
        } else {
          const hw = c.w * 0.5;
          const hd = c.d * 0.5;
          if (Math.abs(nx - c.x) > hw + r || Math.abs(nz - c.z) > hd + r) continue;
          px = Math.max(c.x - hw, Math.min(c.x + hw, nx));
          pz = Math.max(c.z - hd, Math.min(c.z + hd, nz));
          reach = r;
        }
        let ex = nx - px;
        let ez = nz - pz;
        const e = Math.hypot(ex, ez);
        if (e >= reach) continue;
        if (e < 1e-5) {
          // Centre inside the box: out the way it came in.
          ex = ox - nx;
          ez = oz - nz;
          const m = Math.hypot(ex, ez) || 1;
          ex /= m;
          ez /= m;
        } else {
          ex /= e;
          ez /= e;
        }
        const depth = reach - e + 1e-4;
        nx += ex * depth;
        nz += ez * depth;
        if (depth > best) {
          best = depth;
          bnx = ex;
          bnz = ez;
        }
        const vn = this.velocity.x * ex + this.velocity.z * ez;
        if (vn < 0) {
          this.velocity.x -= vn * ex;
          this.velocity.z -= vn * ez;
        }
        pushed = true;
      }
      if (!pushed) break;
    }
    return { x: nx, z: nz, nx: bnx, nz: bnz };
  }

  private canStand(x: number, z: number, ctx: PlayerContext): boolean {
    if (!ctx.walkableAt(x, z)) return false;
    const r = this.bodyR - 0.01;
    for (const c of collidersNear(ctx.colliders, x, z, r)) {
      if (c.r !== undefined) {
        const rr = c.r + r;
        if ((x - c.x) ** 2 + (z - c.z) ** 2 < rr * rr) return false;
        continue;
      }
      const hw = c.w * 0.5;
      const hd = c.d * 0.5;
      const qx = Math.max(0, Math.abs(x - c.x) - hw);
      const qz = Math.max(0, Math.abs(z - c.z) - hd);
      if (qx * qx + qz * qz < r * r) return false;
    }
    return true;
  }

  dispose(): void {
    releaseAdopted(this.character.id, this.status);
  }
}
