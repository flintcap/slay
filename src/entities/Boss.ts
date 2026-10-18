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
  BossMood,
  BossPhase,
  DamagePacket,
  DamageType,
  MonsterDef,
  MonsterRank,
  Rng,
} from '../types';
import { events } from '../core/Events';
import { monsterFX } from '../fx/MonsterFX';
import { prepareBossPortrait } from '../art/BossPortraits';
import { FUMBLE_HEAL_MAX, HEAVY_MUL, WARN_MIN } from '../sim/FairFight';
import { BOSS_MOODS, bossNumbers, withMood } from '../data/bosses';
import { Enemy, depthCurve } from './Enemy';
import { isRoomRule, makeRule, type RoomRule } from './RoomRules';
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
  type Combatant,
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
  const n = bossNumbers(def);
  return {
    id: def.id,
    name: def.name,
    family: def.family,
    role: 'brute',
    minDepth: def.minDepth,
    weight: 0,
    lifeMul: n.life,
    damageMul: n.damage,
    defenseMul: n.defense,
    // Deliberately below the player's 4.6 m/s. Phase multipliers run 1.15 to
    // 1.5, so a boss tops out near 3.1 and a hard enrage pushes it a little
    // past that — always slow enough that you can open ground while a telegraph
    // resolves. A boss that keeps pace turns every fight into stand-and-trade.
    speed: 2.05 * n.speed,
    scale: def.scale,
    attackRange: n.range,
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
  /** Its moves keep the reach they were tuned at, even on a smaller body. */
  override readonly reach: number;

  /** Index into `bossDef.phases`. */
  phaseIndex = -1;
  get phase(): BossPhase | null {
    return this.bossDef.phases[this.phaseIndex] ?? null;
  }

  /**
   * The intro-card portrait being rendered. Its render builds an offscreen
   * context and compiles shaders, so the area waits for it behind the
   * loading curtain rather than let it land mid-play.
   */
  readonly portrait: Promise<string>;

  /** True while a barrier phase's guards are still alive. */
  barrierUp = false;

  private engaged = false;
  /** Awake and fighting: the hero may not walk out of this. */
  get isEngaged(): boolean {
    return this.engaged && this.alive;
  }
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
  /**
   * Seconds the room may hand back to the fight clock (fumbles, frozen
   * stretches), half the time limit. Once spent, the clock runs whatever the
   * room does, so a stalled fight still ends in the enrage.
   */
  private grace = 0;
  /** Life when the current phase began: a fumble never heals past it. */
  private phaseStartLife = 0;
  /** Life the hero has taken off it so far, for the fumble clock. */
  private dealt = 0;
  /** Seconds of fight the fumbles have handed back to the clock. */
  fumbleTime = 0;
  /** Fumbles so far, for the checker and the log. */
  fumbles = 0;
  /** Seconds since the hero last hurt it. */
  private sinceHit = 99;
  /**
   * Recent fumbles, cooling by one every 15 s. Each fumble on the heels of
   * another gains the boss less, so a hero who gets everything wrong is slow,
   * never stuck.
   */
  private fumbleHeat = 0;
  /** True once the fight has run past its time limit. */
  softEnraged = false;
  private dreadTick = 0;
  private announced = new Set<string>();
  /** Abilities started per phase, for the checker. */
  readonly usedAbilities = new Set<string>();

  /** Its mood this run (tier 15 and down), or null. */
  readonly mood: BossMood | null;
  /** Multiplier the mood puts on every phase's damage. */
  private moodDamage = 1;
  /** A hungry boss feeds at most once a second. */
  private fedAt = -99;
  /** A haunted boss's fallen adds, waiting to rise. */
  private haunts: Array<{ e: Enemy; id: string; rank?: string; wait: number }> = [];

  /** The room rule the current phase runs (entities/RoomRules), if any. */
  rule: RoomRule | null = null;
  /** Where it stood when the fight began. */
  spawnAt = { x: 0, z: 0 };
  /** The centre its room rule works round. A chase moves it room to room. */
  home = { x: 0, z: 0 };
  /** Metres from `spawnAt` to the arena wall. The scene sets it from the room. */
  arenaRadius = 12;
  /** Where a chase boss runs to, one per phase after the first. Set by the scene. */
  chasePoints: Array<{ x: number; z: number }> | null = null;
  /** Seconds it is busy with its room rule (a long cast, a charge) and starts no move. */
  channel = 0;
  private hidden = false;
  /** Set when its room rule lets it fall. */
  private letGo = false;
  /** Running to the next room (a chase), and where to. */
  private flight: { to: { x: number; z: number }; t: number } | null = null;
  /** Rooms fled to so far. */
  private legs = 0;
  /** Elements it has already said it turns aside. */
  private immuneSaid = new Set<string>();

  constructor(base: BossDef, depth: number, rng: Rng, mood: BossMood | null = null) {
    const def = withMood(base, mood);
    super(defFromBoss(def), BOSS_RANK, [], depth, rng);
    this.defId = def.id;
    this.bossDef = def;
    this.mood = mood;
    this.reach = this.sizeScale * ((def.reach ?? def.scale) / def.scale);

    // Bosses ignore the pack systems entirely — they are their own encounter.
    this.packId = -1;
    // And they come for you, not for your skeletons. Ordinary monsters can be
    // held by a summoned line; a boss encounter is built around the player.
    if (this.ai) this.ai.fixateOnPlayer = true;
    // Immune to the soft CC that trivialises large targets.
    this.buff('boss_stability', Number.MAX_SAFE_INTEGER, {});
    // Its intro-card portrait, rendered from this body before the fight.
    this.portrait = prepareBossPortrait(def.id, 96);

    if (mood === 'wounded') {
      // Already hurt: less to chew through, and angrier for it.
      this.maxLife = Math.round(this.maxLife * 0.7);
      this.life = this.maxLife;
      this.moodDamage = 1.25;
    } else if (mood === 'ancient') {
      this.maxLife = Math.round(this.maxLife * 1.4);
      this.life = this.maxLife;
      this.buff('mood_ancient', Number.MAX_SAFE_INTEGER, { speed: 0.85, attackSpeed: 0.9 });
    }
  }

  /** The title its name card shows: its own, and its mood if it has one. */
  get cardTitle(): string {
    return this.mood ? `${this.bossDef.title} \u00b7 ${BOSS_MOODS[this.mood].name}` : this.bossDef.title;
  }

  /** A blow of its landed on the hero for `amount`. A hungry boss feeds on it. */
  landed(amount: number): void {
    if (this.mood !== 'hungry' || amount <= 0 || !this.alive) return;
    if (this.fightTime - this.fedAt < 1) return;
    this.fedAt = this.fightTime;
    const room = Math.max(0, this.maxLife - this.life);
    const gain = Math.min(room, this.maxLife * 0.008);
    if (gain <= 0) return;
    this.life += gain;
    events.emit('boss:damaged', { life: this.life, maxLife: this.maxLife });
  }

  /** Abilities tell it what it called up; a haunted boss remembers, to raise them. */
  onSummoned(spawned: readonly Enemy[], monsterId: string, rank?: string): void {
    if (this.mood !== 'haunted') return;
    for (const e of spawned) this.haunts.push({ e, id: monsterId, rank, wait: 3 });
  }

  /** Haunted: a fallen add rises once, three seconds after it dies. */
  private tickHaunts(dt: number, ctx: CombatContext): void {
    for (let i = this.haunts.length - 1; i >= 0; i--) {
      const h = this.haunts[i]!;
      if (h.e.alive) continue;
      h.wait -= dt;
      if (h.wait > 0) continue;
      this.haunts.splice(i, 1);
      const p = h.e.root.position;
      ctx.fx.burst('void', p.x, 0.8, p.z, { count: 20, color: 0x9fd8ff });
      // Raised where it fell, by a stand-in caller with no `onSummoned`:
      // the risen stay down.
      const at = p.clone();
      const caller = { position: () => at, level: this.level } as unknown as Combatant;
      summon(caller, ctx, h.id, 1, 0.4, h.rank);
    }
  }

  // --- engagement ----------------------------------------------------------

  /** Fires the name card and enters phase 0. Idempotent. */
  engage(ctx: CombatContext): void {
    if (this.engaged) return;
    this.engaged = true;
    this.grace = softEnrageAfter(this.bossDef.phases.length) * 0.5;
    const at = this.root.position;
    this.spawnAt = { x: at.x, z: at.z };
    this.home = { x: at.x, z: at.z };
    this.introTimer = 1.2;
    events.emit('boss:engaged', {
      name: this.bossDef.name,
      title: this.cardTitle,
      maxLife: this.maxLife,
      id: this.bossDef.id,
      mood: this.mood ?? undefined,
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
    this.phaseStartLife = this.life;
    // The body shows the phase: stands lower, glows hotter, moves harder.
    this.rig?.setPhase(index);

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
    this.outgoingMul = (phase.damage ?? 1) * this.moodDamage;
    this.buff('phase_speed', Number.MAX_SAFE_INTEGER, { speed: phase.speed ?? 1 });

    // Stagger window: brief invulnerable pause so the transition reads.
    if (index > 0) {
      this.staggerTimer = 1.1;
      this.buff('phase_stagger', 1.1, { invulnerable: 1 });
      const p = this.root.position;
      // The phase erupts in the school its new kit fights with.
      let school: DamageType = 'physical';
      for (const id of this.abilityIds) {
        const t = getAbility(id)?.damageType;
        if (t && t !== 'physical') {
          school = t;
          break;
        }
      }
      const fx = monsterFX();
      if (fx) fx.bossPhase(p.x, p.z, this.sizeScale, school);
      else {
        ctx.fx.burst('bossSlam', p.x, 1.2 * this.sizeScale, p.z, { scale: 2 });
        ctx.decals.add('crack', p.x, p.z, 6 * this.sizeScale);
      }
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
    // The body changes with the phase (a hag melting smaller), and a chase moves on.
    this.root.scale.setScalar(phase.body ?? 1);
    if (index > 0 && phase.flee && this.rule?.kind !== 'chase') this.fleeTo(this.nextChasePoint(), ctx);
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

    // A room rule runs beside the phase; the same rule carries on into the next.
    if (this.rule && this.rule.kind !== kind) {
      this.rule.stop(ctx);
      this.rule = null;
    }
    if (isRoomRule(kind)) {
      this.arena = null;
      this.rule ??= makeRule(kind, this);
      this.rule.start(ctx);
      return;
    }

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
    this.rule?.tick(dt, ctx);
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
          // Missed the ring: a hard blow, but under the hit cap, and the
          // boss wards itself, so the ring still matters (fair-fight rules).
          if (!inSafe) {
            hitPlayer(this, c, 4.0, 'physical', 'arena.pillars', { knockback: 6 });
            this.fumble('shield', c);
          }
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
          c.decals.telegraph('cone', t.x, t.y, 4 * Math.min(1.5, this.reach * 0.6), facing, 0.65, 0x6040a0);
          c.fx.burst('void', t.x, 1.5, t.y, { count: 30, color: 0x201830 });
          after(0.65, (cc) => {
            if (!this.alive) return;
            const reach = 4 * Math.min(1.5, this.reach * 0.6);
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
        // It hardens rather than hits harder: a slow fight gets slower, never
        // deadly (fair-fight rules). Six stacks at most, so it always dies.
        if (this.enrageTimer >= 12 && this.enrageStacks < 6) {
          this.enrageTimer = 0;
          this.enrageStacks++;
          this.buff('hard_enrage', Number.MAX_SAFE_INTEGER, {
            taken: 1 - this.enrageStacks * 0.05,
            speed: Math.min(1.2, 1 + this.enrageStacks * 0.03),
          });
          events.emit('toast', {
            text: `${this.bossDef.name} hardens (${this.enrageStacks})`,
            kind: 'bad',
          });
          ctx.fx.burst('crit', p.x, 1.4 * this.sizeScale, p.z, { count: 30, color: 0xff3020 });
        }
        // And knits while it is left alone: a little life back each second,
        // never past where the phase began. A hero still hitting it keeps it
        // from knitting, so the fight always ends.
        if (this.enrageStacks > 0 && this.sinceHit > 2 && this.life < this.phaseStartLife) {
          this.life = Math.min(this.phaseStartLife, this.life + this.maxLife * 0.0015 * this.enrageStacks * dt);
        }
        break;
      }
      default:
        break;
    }
  }

  // --- room rule hooks -----------------------------------------------------

  /** Hidden by its room rule: the body fades and the cursor cannot pick it. */
  override get untargetable(): boolean {
    return this.hidden;
  }

  setHidden(on: boolean, ctx: CombatContext): void {
    if (on === this.hidden) return;
    this.hidden = on;
    this.bodyRoot.visible = !on;
    const p = this.root.position;
    ctx.fx.burst('void', p.x, 1.2 * this.sizeScale, p.z, { count: 16, color: 0x201830 });
  }

  /** A step its room rule makes it take (a flight, a chain's pull). */
  ruleStep(dx: number, dz: number, ctx: CombatContext): void {
    this.moveBy(dx, dz, ctx);
  }

  /** Its room rule is satisfied: let it fall. */
  letDie(ctx: CombatContext): void {
    this.letGo = true;
    this.life = 0;
    this.die(ctx);
  }

  /** Life when the current phase began. */
  get phaseStart(): number {
    return this.phaseStartLife;
  }

  /** True while it runs for the next room. */
  get fleeing(): boolean {
    return this.flight !== null;
  }

  /** The next room of a chase: the scene's, else round the arena. */
  nextChasePoint(): { x: number; z: number } {
    const pts = this.chasePoints?.length
      ? this.chasePoints
      : [0, 1, 2].map((i) => ({
          x: this.spawnAt.x + Math.sin(i * 2.1 + 0.5) * this.arenaRadius * 0.75,
          z: this.spawnAt.z + Math.cos(i * 2.1 + 0.5) * this.arenaRadius * 0.75,
        }));
    return pts[this.legs++ % pts.length]!;
  }

  /** Out of reach, it runs for `to`, and turns at bay there. */
  fleeTo(to: { x: number; z: number }, ctx: CombatContext): void {
    this.flight = { to, t: 7 };
    this.buff('fleeing', 7, { invulnerable: 1 });
    this.channel = 7;
    this.rootTimer = 7;
    events.emit('toast', { text: `${this.bossDef.name} flees!`, kind: 'info' });
    void ctx;
  }

  private tickFlight(dt: number, ctx: CombatContext): void {
    const f = this.flight!;
    f.t -= dt;
    const p = this.root.position;
    const d = dist(p.x, p.z, f.to.x, f.to.z);
    if (d > 1 && f.t > 0) {
      const step = Math.min(d, 8 * dt);
      const a = angleTo(p.x, p.z, f.to.x, f.to.z);
      this.facing = a;
      this.moveBy(Math.sin(a) * step, Math.cos(a) * step, ctx);
      return;
    }
    if (d > 1) this.teleportTo(f.to.x, f.to.z, ctx);
    this.flight = null;
    this.unbuff('fleeing');
    this.channel = 0;
    this.rootTimer = 0;
    this.home = { x: f.to.x, z: f.to.z };
    ctx.fx.burst('dust', f.to.x, 0.5, f.to.z, { count: 30, scale: 2 });
    events.emit('toast', { text: `${this.bossDef.name} turns at bay.`, kind: 'bad' });
  }

  /**
   * The hero struck into its parry: a quick answer (hit-capped, like every
   * boss blow) and a little life back, never past where the phase began. The
   * clock gets the time back.
   */
  private riposte(ctx: CombatContext): void {
    this.unbuff('parry');
    const p = this.root.position;
    ctx.fx.burst('crit', p.x, 1.3 * this.sizeScale, p.z, { count: 24, color: 0xe0f0ff });
    // Hitting into a guard costs time, never life: the blade turns yours aside.
    const back = Math.min(this.maxLife * 0.02, Math.max(0, this.phaseStartLife - this.life));
    if (back > 0) this.heal(back, ctx);
    this.giveClock(2);
    if (!this.announced.has('riposte')) {
      this.announced.add('riposte');
      events.emit('toast', { text: `${this.bossDef.name} parries! Wait out the guard.`, kind: 'bad' });
    }
  }

  // --- fumbles -------------------------------------------------------------

  /**
   * The hero got a room rule wrong. The boss gains time, never damage: it
   * heals a little, wards itself, hides, or calls a few adds. Whatever it
   * gains, the fight clock gets back, so a fumble never brings the enrage
   * closer. Returns the seconds it cost.
   */
  fumble(cost: 'heal' | 'shield' | 'hold' | 'adds' | 'reset', ctx: CombatContext, seconds = 0): number {
    if (!this.alive) return 0;
    // What the hero has been doing to it, per second, so life and shields
    // turn into seconds. A floor keeps the very first seconds sane.
    const dps = Math.max(this.maxLife * 0.004, this.dealt / Math.max(8, this.fightTime));
    const p = this.root.position;
    const gain = 1 / (1 + this.fumbleHeat);
    this.fumbleHeat += 1;
    let spent = seconds * gain;
    switch (cost) {
      case 'heal': {
        const room = Math.max(0, this.phaseStartLife - this.life);
        const amount = Math.min(room, this.maxLife * FUMBLE_HEAL_MAX * gain);
        if (amount > 0) this.heal(amount, ctx);
        spent = Math.max(spent, amount / dps);
        break;
      }
      case 'shield': {
        // Layers stack, to a ceiling: a run of misses is slow, not endless.
        const amount = Math.max(0, Math.min(this.maxLife * 0.06 * gain, this.maxLife * 0.15 - this.shield));
        this.addShield(this.shield + amount, 20);
        ctx.fx.burst('shock', p.x, 1.2 * this.sizeScale, p.z, { count: 20, color: 0x80c8ff });
        spent = Math.max(spent, amount / dps);
        break;
      }
      case 'hold': {
        const d = Math.max(1, (seconds || 3) * gain);
        this.buff('fumble_hold', d, { invulnerable: 1 });
        spent = d;
        break;
      }
      case 'adds': {
        const ids = this.bossDef.adds ?? [];
        const id = ids[this.fumbles % Math.max(1, ids.length)];
        if (id) summon(this, ctx, id, gain > 0.5 ? 2 : 1, 5);
        spent = Math.max(spent, 8 * gain);
        break;
      }
      case 'reset':
        spent = Math.max(spent, 6 * gain);
        break;
    }
    spent = clamp(spent, 1, 40);
    this.fumbles++;
    this.fumbleTime += spent;
    this.giveClock(spent);
    events.emit('boss:fumble', { name: this.bossDef.name, cost, seconds: spent });
    return spent;
  }

  /** Hands seconds back to the fight clock, out of what grace is left. */
  private giveClock(seconds: number): void {
    const back = Math.min(seconds, this.grace, this.fightTime);
    this.grace -= back;
    this.fightTime -= back;
  }

  // --- tick ----------------------------------------------------------------

  override update(dt: number, ctx: CombatContext): void {
    this.sinceHit += dt;
    this.channel = Math.max(0, this.channel - dt);
    this.fumbleHeat = Math.max(0, this.fumbleHeat - dt / 15);
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
      if (this.flight) this.tickFlight(dt, ctx);
      this.tickArena(dt, ctx);
      this.tickSoftEnrage(dt, ctx);
      if (this.haunts.length) this.tickHaunts(dt, ctx);
    }

    // Trickle adds independent of arena hooks, so a boss room never feels empty.
    this.addTimer -= dt;
    if (this.addTimer <= 0 && this.engaged && (this.bossDef.adds?.length ?? 0) > 0) {
      this.addTimer = 16;
      const p = this.root.position;
      const nearby = alliesNear(ctx, p.x, p.z, 34, this.id).filter((e) => !e.def.object).length;
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
    // While its room rule keeps it out of reach, or it is fleeing, the clock
    // waits, out of the grace the room has left to give.
    const frozen = (!!this.rule?.freezesClock() || !!this.flight) && this.grace > 0;
    if (frozen) this.grace = Math.max(0, this.grace - dt);
    else this.fightTime += dt;
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
    if (this.channel > 0) return null;
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

  /**
   * A heavy blow is always seen coming: at least 0.8 s from the start of the
   * move to the hit, however fast the boss swings (fair-fight rules).
   */
  protected override windupFor(def: AbilityDef, speed: number): number {
    const base = def.windup / speed;
    return def.damageMul >= HEAVY_MUL && def.windup > 0 ? Math.max(WARN_MIN, base) : base;
  }

  override notifyAbility(ability: AbilityDef, phase: string): void {
    // The base hook is where the audio layer voices a move (MonsterAudio
    // wraps Enemy's). Skipping it left every boss move silent.
    super.notifyAbility(ability, phase);
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
    let working = packet.amount > cap ? { ...packet, amount: cap + (packet.amount - cap) * 0.35 } : packet;

    // A parry: the blow is turned, and answered.
    if (packet.source !== this.id && this.hasBuff('parry')) {
      this.riposte(ctx);
      return;
    }
    // Gold plates (or a ward) turn one element aside this phase.
    const immune = this.phase?.immune;
    if (immune && packet.type === immune && packet.source !== this.id) {
      working = { ...working, amount: working.amount * 0.15 };
      if (!this.immuneSaid.has(immune)) {
        this.immuneSaid.add(immune);
        events.emit('toast', { text: `${this.bossDef.name} turns ${immune} aside. Try another element.`, kind: 'bad' });
      }
    }

    // The room rule decides how much of a hero's blow lands.
    const rule = packet.source !== this.id ? this.rule : null;
    const raw = working.amount;
    if (rule) {
      const share = rule.intake(working, ctx);
      if (share <= 0) {
        const p = this.root.position;
        ctx.fx.burst('shock', p.x, 1.1 * this.sizeScale, p.z, { count: 8, color: 0x60c0ff });
        events.emit('enemy:damaged', { id: this.id, amount: 0, type: packet.type, crit: false, x: p.x, y: 1.1 * this.sizeScale, z: p.z });
        rule.struck(0, raw, ctx);
        return;
      }
      if (share !== 1) working = { ...working, amount: working.amount * share };
    }

    const before = this.life;
    super.takeDamage(working, ctx);
    this.dealt += Math.max(0, before - this.life);
    if (rule && this.rule === rule) rule.struck(Math.max(0, before - Math.max(0, this.life)), raw, ctx);
    if (working.amount > 0) this.sinceHit = 0;
    if (this.alive) events.emit('boss:damaged', { life: this.life, maxLife: this.maxLife });
  }

  protected override die(ctx: CombatContext): void {
    // Its room rule may keep it standing (a linked pair waits on its other half).
    if (this.alive && !this.letGo && this.rule?.holdDeath(ctx)) {
      this.life = Math.max(1, this.life);
      return;
    }
    const wasAlive = this.alive;
    super.die(ctx);
    if (!wasAlive || this.alive) return;
    this.rule?.stop(ctx);
    this.rule = null;
    this.channel = 0;

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
    this.rule = null;
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
