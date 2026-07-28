/**
 * SLAY — the Enemy entity.
 *
 * One class drives every non-boss monster in the game: stats derived from the
 * depth curve, the procedural model and its rig, the ability runner (with real
 * telegraphs), status effects, elite affix behaviours, hit reactions and death.
 *
 * Budget notes, because sixty of these run at once:
 *  - Geometry and materials come from the shared prototype cache in
 *    `MonsterModels`, so a spawn is a `clone()`.
 *  - Thinking is staggered inside `AIBrain`; only steering runs every frame.
 *  - Nothing allocates in `update()` — the scratch vectors are module-level.
 */

import * as THREE from 'three';
import type {
  DamagePacket,
  DamageType,
  MonsterAffixDef,
  MonsterDef,
  MonsterFamily,
  MonsterRank,
  MonsterRole,
  Rng,
  StatusApplication,
  Stats,
} from '../types';
import { events } from '../core/Events';
import { activeDifficulty } from '../data/difficulties';
import { emptyStats } from '../sim/Stats';
import { rollDamage, mitigate } from '../sim/Combat';
import { buildMonsterModel, monsterArchetype, RigAnimator, type RigAction } from './MonsterModels';
import { AIBrain, resetPacks } from './AI';
import {
  after,
  alliesNear,
  angleDelta,
  angleTo,
  clamp,
  circleHit,
  dist,
  fireProjectile,
  getAbility,
  hitPlayer,
  makeInstance,
  rollPacket,
  setDamageRoller,
  setSummonFactory,
  spawnHazard,
  summon,
  tickAbilityWorld,
  typeColor,
  type AbilityDef,
  type AbilityInstance,
  type BuffMods,
  type Combatant,
  type CombatContext,
  type MotionOverride,
} from './Abilities';
import { getMonster, MONSTERS, pickMonstersForDepth } from '../data/monsters';
import { getAffix, MONSTER_AFFIXES } from '../data/monsterAffixes';
import { BOSSES } from '../data/bosses';

// Re-exported so the scene layer can pull the whole monster surface from here,
// exactly as CONTRACTS.md specifies.
export type { CombatContext } from './Abilities';
export { MONSTERS, pickMonstersForDepth } from '../data/monsters';
export { MONSTER_AFFIXES } from '../data/monsterAffixes';
export { BOSSES } from '../data/bosses';

// ---------------------------------------------------------------------------
// Depth scaling
// ---------------------------------------------------------------------------

export interface DepthCurve {
  life: number;
  damage: number;
  defense: number;
  attackRating: number;
  xp: number;
  level: number;
}

/**
 * The monster power curve. Exponential with a linear floor so early depths stay
 * gentle and depth 40+ still climbs without integer overflow silliness.
 */
export function depthCurve(depth: number): DepthCurve {
  const d = Math.max(1, depth);
  const dif = activeDifficulty();

  // The early floors were tuned far too hot: a fresh level 1 character met
  // depth-1 damage it could not survive once two monsters connected. The base
  // damage term is lower and ramps in over the first few floors, which leaves
  // the late curve untouched — by depth 10 the eased term is ~1.
  const ease = 0.55 + 0.45 * Math.min(1, (d - 1) / 8);

  return {
    life: (24 * Math.pow(1.155, d - 1) + d * 11) * dif.monsterLife,
    damage: (3.1 * Math.pow(1.118, d - 1) + d * 1.15) * ease * dif.monsterDamage,
    defense: (8 * Math.pow(1.095, d - 1) + d * 3) * dif.monsterDefense,
    attackRating: 30 * Math.pow(1.1, d - 1) + d * 12,
    xp: 9 * Math.pow(1.105, d - 1) + d * 4,
    level: Math.max(1, Math.round(d * 1.05)),
  };
}

const RANK_MODS: Record<MonsterRank, { life: number; damage: number; defense: number; xp: number; scale: number }> = {
  normal: { life: 1, damage: 1, defense: 1, xp: 1, scale: 1 },
  champion: { life: 2.6, damage: 1.25, defense: 1.3, xp: 3, scale: 1.1 },
  elite: { life: 4.5, damage: 1.5, defense: 1.6, xp: 6, scale: 1.18 },
  rare: { life: 7.0, damage: 1.75, defense: 1.9, xp: 10, scale: 1.24 },
  boss: { life: 26, damage: 2.4, defense: 2.4, xp: 40, scale: 1 },
};

export const RANK_COLOR: Record<MonsterRank, number> = {
  normal: 0xc8c8c8,
  champion: 0x6f8cff,
  elite: 0xf5d76e,
  rare: 0xff9a3c,
  boss: 0xff4444,
};

// ---------------------------------------------------------------------------
// Status effects carried by monsters
// ---------------------------------------------------------------------------

interface ActiveStatus {
  id: string;
  time: number;
  magnitude: number;
  stacks: number;
  dotType: DamageType | null;
  dotPerSecond: number;
}

interface ActiveBuff {
  id: string;
  time: number;
  mods: Partial<BuffMods>;
}

// ---------------------------------------------------------------------------
// Scratch — no per-frame allocation
// ---------------------------------------------------------------------------

const _steer = new THREE.Vector3();
const _pos = new THREE.Vector3();
let _uid = 0;

let auraRingGeo: THREE.BufferGeometry | null = null;
const auraMatCache = new Map<number, THREE.MeshBasicMaterial>();

function auraMaterial(color: number): THREE.MeshBasicMaterial {
  let m = auraMatCache.get(color);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  auraMatCache.set(color, m);
  return m;
}

// ---------------------------------------------------------------------------
// Enemy
// ---------------------------------------------------------------------------

export class Enemy implements Combatant {
  readonly root: THREE.Group;
  readonly id: string;
  readonly def: MonsterDef;
  readonly monsterId: string;
  readonly rank: MonsterRank;
  readonly family: MonsterFamily;
  readonly role: MonsterRole;
  readonly affixes: MonsterAffixDef[];
  readonly depth: number;
  readonly ilvl: number;
  readonly level: number;
  readonly displayName: string;
  readonly name: string;
  readonly isBoss: boolean = false;
  readonly hitRadius: number;
  readonly sizeScale: number;
  readonly stats: Stats;
  readonly abilityIds: string[];
  readonly xpValue: number;

  life: number;
  maxLife: number;
  alive = true;
  readyToRemove = false;
  /** Set once the scene has paid out XP and loot, so it never pays twice. */
  lootGranted = false;
  facing = 0;
  shield = 0;
  rootTimer = 0;
  outgoingMul = 1;
  motionOverride: MotionOverride | null = null;
  /** Pack id from the spawn table; scenes set this after construction. */
  packId = -1;
  /** Set by summons so they can be capped / cleaned up. */
  summonedBy: string | null = null;

  ai: AIBrain | null;

  protected readonly rng: Rng;
  protected readonly rig: RigAnimator | null;
  protected readonly baseSpeed: number;
  protected readonly bodyRoot: THREE.Group;

  private readonly cooldowns = new Map<string, number>();
  private inst: AbilityInstance | null = null;
  private statuses: ActiveStatus[] = [];
  private buffs: ActiveBuff[] = [];
  private shieldTimer = 0;
  private action: RigAction = 'idle';
  private actionT = 0;
  private actionLen = 0;
  private deathT = 0;
  private spawnT = 1;
  private hitFlash = 0;
  private locomotion = 0;
  private aura: THREE.Mesh | null = null;
  private affixTimers: number[] = [];
  private affixStacks = 0;
  private revives = 0;
  private lastDamagedAt = -99;
  private killedBy = 'physical';
  private summonCount = 0;
  private disposed = false;

  constructor(
    def: MonsterDef,
    rank: MonsterRank,
    affixes: MonsterAffixDef[],
    depth: number,
    rng: Rng,
  ) {
    this.def = def;
    this.monsterId = def.id;
    this.rank = rank;
    this.family = def.family;
    this.role = def.role;
    this.affixes = affixes;
    this.depth = depth;
    this.rng = rng;
    this.id = `e${(_uid++).toString(36)}`;

    const curve = depthCurve(depth);
    const rm = RANK_MODS[rank];
    this.level = curve.level;
    this.ilvl = Math.max(1, Math.round(depth * 1.15 + (rank === 'normal' ? 0 : 2)));

    // --- affix multipliers -------------------------------------------------
    let lifeAffix = 1;
    let dmgAffix = 1;
    let defAffix = 1;
    let spdAffix = 1;
    let asAffix = 1;
    for (const a of affixes) {
      lifeAffix *= a.mods?.life ?? 1;
      dmgAffix *= a.mods?.damage ?? 1;
      defAffix *= a.mods?.defense ?? 1;
      spdAffix *= a.mods?.speed ?? 1;
      asAffix *= a.mods?.attackSpeed ?? 1;
      this.affixTimers.push(rng.range(0, 2));
    }

    this.maxLife = Math.round(curve.life * def.lifeMul * rm.life * lifeAffix);
    this.life = this.maxLife;
    const dmg = curve.damage * def.damageMul * rm.damage * dmgAffix;

    // --- stat block --------------------------------------------------------
    const s = emptyStats();
    s.life = this.maxLife;
    s.minDamage = dmg * 0.78;
    s.maxDamage = dmg * 1.32;
    s.attackRating = curve.attackRating;
    s.defense = curve.defense * def.defenseMul * rm.defense * defAffix;
    s.attackSpeed = def.attackSpeed * asAffix;
    s.critChance = 5 + (rank === 'normal' ? 0 : 5);
    s.critDamage = 60;
    s.moveSpeed = 0;
    for (const [type, value] of Object.entries(def.resists ?? {})) {
      switch (type as DamageType) {
        case 'physical': s.physicalResist += value; break;
        case 'fire': s.fireResist += value; break;
        case 'cold': s.coldResist += value; break;
        case 'lightning': s.lightningResist += value; break;
        case 'poison': s.poisonResist += value; break;
        case 'arcane': s.arcaneResist += value; break;
        default: break;
      }
    }
    if (rank !== 'normal') {
      const bump = rank === 'champion' ? 8 : rank === 'elite' ? 14 : 20;
      s.physicalResist += bump * 0.5;
      s.fireResist += bump;
      s.coldResist += bump;
      s.lightningResist += bump;
      s.poisonResist += bump;
      s.arcaneResist += bump;
    }
    this.stats = s;

    this.baseSpeed = def.speed * spdAffix;
    this.sizeScale = def.scale * rm.scale;
    this.hitRadius = Math.max(0.35, 0.42 * this.sizeScale);
    this.xpValue = Math.round(curve.xp * def.xpMul * rm.xp);
    this.abilityIds = def.abilities.slice();
    if (!this.abilityIds.includes('basic_strike') && def.attackRange <= 4.5) {
      this.abilityIds.push('basic_strike');
    }

    // --- name --------------------------------------------------------------
    this.name = rank === 'normal' ? def.name : `${affixes[0]?.name ?? ''} ${def.name}`.trim();
    this.displayName = this.name;

    // --- model -------------------------------------------------------------
    this.root = new THREE.Group();
    this.root.name = `enemy:${def.id}`;
    const model = buildMonsterModel(def.visual, rng, this.sizeScale);
    this.bodyRoot = model.root;
    this.root.add(model.root);
    this.rig = new RigAnimator(model.root, model.bones, monsterArchetype(def.visual.body), rng);
    this.ai = new AIBrain(this, def, rng);

    if (affixes.length > 0) this.buildAura(affixes[0]!.color);
    this.root.userData.enemy = this;
  }

  // --- Combatant surface ---------------------------------------------------

  position(): THREE.Vector3 {
    return this.root.position;
  }

  get isElite(): boolean {
    return this.rank !== 'normal';
  }

  /** True while an ability is winding up, executing or recovering. */
  get busy(): boolean {
    return this.inst !== null;
  }

  get lifeFraction(): number {
    return this.maxLife > 0 ? this.life / this.maxLife : 0;
  }

  /** Nameplate payload for the UI layer. */
  get nameplate(): {
    name: string;
    rank: MonsterRank;
    affixes: string[];
    life: number;
    maxLife: number;
    color: number;
    level: number;
    affixBehaviors: string[];
    affixColors: number[];
  } {
    return {
      name: this.name,
      rank: this.rank,
      affixes: this.affixes.map((a) => a.name),
      life: this.life,
      maxLife: this.maxLife,
      color: RANK_COLOR[this.rank],
      level: this.level,
      // Parallel arrays so the nameplate can pick a glyph and tint per affix.
      affixBehaviors: this.affixes.map((a) => a.behavior ?? 'none'),
      affixColors: this.affixes.map((a) => a.color),
    };
  }

  heal(amount: number, ctx: CombatContext): void {
    if (!this.alive || amount <= 0) return;
    this.life = Math.min(this.maxLife, this.life + amount);
    ctx.fx.burst('heal', this.root.position.x, this.centerY, this.root.position.z, {
      count: 6,
      color: 0x60ff90,
    });
  }

  addShield(amount: number, duration: number): void {
    this.shield = Math.max(this.shield, amount);
    this.shieldTimer = Math.max(this.shieldTimer, duration);
  }

  buff(id: string, duration: number, mods: Partial<BuffMods>): void {
    const existing = this.buffs.find((b) => b.id === id);
    if (existing) {
      existing.time = Math.max(existing.time, duration);
      existing.mods = mods;
      return;
    }
    this.buffs.push({ id, time: duration, mods });
  }

  hasBuff(id: string): boolean {
    return this.buffs.some((b) => b.id === id);
  }

  private buffMul(key: keyof BuffMods): number {
    let m = 1;
    for (const b of this.buffs) {
      const v = b.mods[key];
      if (v !== undefined) m *= v;
    }
    return m;
  }

  private buffSum(key: keyof BuffMods): number {
    let m = 0;
    for (const b of this.buffs) {
      const v = b.mods[key];
      if (v !== undefined) m += v;
    }
    return m;
  }

  teleportTo(x: number, z: number, ctx: CombatContext): void {
    this.root.position.set(x, this.root.position.y, z);
    this.motionOverride = null;
    void ctx;
  }

  flashCast(color: number): void {
    this.hitFlash = 0;
    void color;
  }

  notifyAbility(_ability: AbilityDef, _phase: string): void {
    /* hook point for FX/audio layers */
  }

  /** Wakes this monster into combat — used by rally abilities and aggro pings. */
  wake(ctx: CombatContext): void {
    this.ai?.wake(ctx, false);
  }

  onAmbushSprung(ctx: CombatContext): void {
    ctx.fx.burst('dust', this.root.position.x, 0.4, this.root.position.z, { count: 16 });
    events.emit('sfx', { id: 'ambush', x: this.root.position.x, z: this.root.position.z });
  }

  private get centerY(): number {
    return 0.7 * this.sizeScale;
  }

  // --- ability runner ------------------------------------------------------

  abilityReady(id: string, ctx: CombatContext): boolean {
    const until = this.cooldowns.get(id);
    return until === undefined || ctx.elapsed >= until;
  }

  /** Starts an ability. Returns false when it could not begin. */
  beginAbility(def: AbilityDef, ctx: CombatContext): boolean {
    if (this.inst || !this.alive || this.rootTimer > 0) return false;
    const inst = makeInstance(def);
    inst.phase = 'windup';
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
    inst.facing = angleTo(this.root.position.x, this.root.position.z, ctx.playerPos.x, ctx.playerPos.z);
    this.facing = inst.facing;
    this.inst = inst;

    const speed = Math.max(0.35, this.stats.attackSpeed * this.buffMul('attackSpeed'));
    const windup = def.windup / speed;

    // The telegraph goes down the instant the windup starts — this is the whole
    // contract with the player: every dangerous thing is readable and dodgeable.
    if (def.telegraph && windup > 0.12) {
      const t = def.telegraph;
      const size = t.size * (t.atSelf ? this.sizeScale : 1);
      const ox = t.atSelf ? this.root.position.x : inst.targetX;
      const oz = t.atSelf ? this.root.position.z : inst.targetZ;
      try {
        inst.telegraph = ctx.decals.telegraph(t.shape, ox, oz, size, inst.facing, windup, t.color);
      } catch {
        inst.telegraph = null;
      }
    }
    this.setAction(def.kind === 'buff' || def.kind === 'heal' || def.kind === 'summon' ? 'cast' : def.windup > 0.5 ? 'cast' : 'attack', windup + 0.1);
    def.onStart?.(this, ctx, inst);
    if (def.sfx) events.emit('sfx', { id: def.sfx, x: this.root.position.x, z: this.root.position.z });
    this.notifyAbility(def, 'windup');
    return true;
  }

  private tickAbility(dt: number, ctx: CombatContext): void {
    const inst = this.inst;
    if (!inst) return;
    const def = inst.def;
    const speed = Math.max(0.35, this.stats.attackSpeed * this.buffMul('attackSpeed'));
    inst.t += dt;

    switch (inst.phase) {
      case 'windup': {
        // Track the player during the wind-up for non-committed abilities so the
        // attack still connects if you sidestep a little — but committed ones
        // (charges, meteors) locked their target in `onStart` and stay locked.
        if (!def.rooted) {
          const want = angleTo(this.root.position.x, this.root.position.z, ctx.playerPos.x, ctx.playerPos.z);
          this.facing += angleDelta(this.facing, want) * Math.min(1, dt * 6);
        }
        if (inst.t >= def.windup / speed) {
          inst.telegraph?.cancel();
          inst.telegraph = null;
          inst.phase = 'active';
          inst.t = 0;
          inst.tickAccum = 0;
          def.onExecute?.(this, ctx, inst);
          this.notifyAbility(def, 'active');
          if (def.kind === 'melee' || def.kind === 'cone') this.setAction('attack', 0.4);
        }
        break;
      }
      case 'active': {
        def.onTick?.(this, ctx, inst, dt);
        if (inst.t >= (def.activeTime ?? 0)) {
          def.onEnd?.(this, ctx, inst);
          inst.phase = 'recovery';
          inst.t = 0;
        }
        break;
      }
      case 'recovery': {
        if (inst.t >= def.recovery / speed) {
          this.cooldowns.set(def.id, ctx.elapsed + def.cooldown / Math.max(0.5, speed * 0.6 + 0.4));
          this.inst = null;
          this.notifyAbility(def, 'idle');
        }
        break;
      }
      default:
        this.inst = null;
        break;
    }
  }

  private interrupt(ctx: CombatContext): void {
    const inst = this.inst;
    if (!inst) return;
    if (inst.phase !== 'windup' || !inst.def.interruptible) return;
    inst.telegraph?.cancel();
    this.cooldowns.set(inst.def.id, ctx.elapsed + inst.def.cooldown * 0.4);
    this.inst = null;
    this.setAction('hit', 0.32);
    ctx.fx.burst('hit.physical', this.root.position.x, this.centerY, this.root.position.z, {
      count: 8,
      color: 0xffffff,
    });
  }

  /** Movement lock: rooted abilities, hard CC, and scripted motion. */
  private get canMove(): boolean {
    if (!this.alive) return false;
    if (this.rootTimer > 0) return false;
    if (this.motionOverride) return false;
    const inst = this.inst;
    if (inst && inst.def.rooted && inst.phase !== 'recovery') return false;
    if (inst && inst.def.kind === 'beam') return false;
    return true;
  }

  // --- main tick -----------------------------------------------------------

  update(dt: number, ctx: CombatContext): void {
    if (this.disposed) return;
    tickAbilityWorld(dt, ctx);

    if (!this.alive) {
      this.tickDeath(dt, ctx);
      return;
    }

    // Timers ---------------------------------------------------------------
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.rootTimer = Math.max(0, this.rootTimer - dt);
    if (this.spawnT > 0) this.spawnT = Math.max(0, this.spawnT - dt * 1.6);
    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) this.shield = 0;
    }
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i]!;
      b.time -= dt;
      if (b.time <= 0) this.buffs.splice(i, 1);
    }
    this.tickStatuses(dt, ctx);
    if (!this.alive) return;

    // Scripted motion (charges, leaps, knockbacks) -------------------------
    if (this.motionOverride) {
      this.tickMotion(dt, ctx);
    }

    // Abilities -------------------------------------------------------------
    this.tickAbility(dt, ctx);

    // AI --------------------------------------------------------------------
    const brain = this.ai;
    if (brain) {
      brain.update(dt, ctx);
      if (this.canMove && !brain.isDormant) {
        const want = brain.steer(_steer, ctx);
        const speed = this.currentSpeed;
        if (want > 0.02 && speed > 0.01) {
          this.moveBy(_steer.x * speed * dt, _steer.z * speed * dt, ctx);
          this.locomotion += (Math.min(1, want * (speed / 3.2)) - this.locomotion) * Math.min(1, dt * 6);
        } else {
          this.locomotion += (0 - this.locomotion) * Math.min(1, dt * 5);
        }
        const wantFacing = brain.desiredFacing(ctx);
        this.facing += angleDelta(this.facing, wantFacing) * Math.min(1, dt * 7);
      } else {
        this.locomotion += (0 - this.locomotion) * Math.min(1, dt * 8);
      }
    }

    // Affixes ---------------------------------------------------------------
    if (this.affixes.length) this.tickAffixes(dt, ctx);

    // Presentation ----------------------------------------------------------
    this.root.rotation.y = this.facing;
    if (this.actionLen > 0) {
      this.actionT += dt / this.actionLen;
      if (this.actionT >= 1) {
        this.actionT = 0;
        this.actionLen = 0;
        this.action = 'idle';
      }
    }
    this.rig?.update(dt, {
      locomotion: this.locomotion,
      action: this.spawnT > 0 ? 'spawn' : this.action,
      actionT: this.spawnT > 0 ? 1 - this.spawnT : this.actionT,
      time: ctx.elapsed,
      deathT: 0,
    });
    if (this.aura) {
      this.aura.rotation.z += dt * 0.9;
      const s = 1 + Math.sin(ctx.elapsed * 2.6) * 0.06;
      this.aura.scale.setScalar(this.hitRadius * 2.6 * s);
    }
  }

  private get currentSpeed(): number {
    let s = this.baseSpeed * this.buffMul('speed');
    for (const st of this.statuses) {
      if (st.id === 'chill' || st.id === 'slow') s *= Math.max(0.15, 1 - st.magnitude);
    }
    if (this.inst && this.inst.phase === 'recovery') s *= 0.4;
    return s;
  }

  private moveBy(dx: number, dz: number, ctx: CombatContext): void {
    const p = this.root.position;
    const nx = p.x + dx;
    const nz = p.z + dz;
    let ok = true;
    try {
      ok = ctx.nav.lineOfSight(p.x, p.z, nx, nz);
    } catch {
      ok = true;
    }
    if (ok) {
      p.x = nx;
      p.z = nz;
      return;
    }
    // Wall slide: try each axis alone before giving up.
    try {
      if (ctx.nav.lineOfSight(p.x, p.z, nx, p.z)) p.x = nx;
      else if (ctx.nav.lineOfSight(p.x, p.z, p.x, nz)) p.z = nz;
    } catch {
      /* ignore */
    }
  }

  private tickMotion(dt: number, ctx: CombatContext): void {
    const m = this.motionOverride;
    if (!m) return;
    m.t += dt;
    const k = clamp(m.t / m.duration, 0, 1);
    const p = this.root.position;
    p.x = m.fromX + (m.toX - m.fromX) * k;
    p.z = m.fromZ + (m.toZ - m.fromZ) * k;
    p.y = m.arc > 0 ? Math.sin(k * Math.PI) * m.arc : 0;
    if (m.trample && !m.trample.hit) {
      const d = dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
      if (d < m.trample.radius + 0.6) {
        m.trample.hit = true;
        hitPlayer(this, ctx, m.trample.mul, m.trample.type, 'trample', { knockback: 4 });
        ctx.fx.burst('hit.physical', ctx.playerPos.x, 1, ctx.playerPos.z, { count: 18 });
        events.emit('shake', { amount: 0.4, duration: 0.2 });
      }
    }
    if (k >= 1) {
      p.y = 0;
      const land = m.onLand;
      this.motionOverride = null;
      land?.(this, ctx);
    }
  }

  // --- statuses ------------------------------------------------------------

  applyStatuses(list: StatusApplication[], ctx: CombatContext): void {
    for (const app of list) {
      if (this.isImmuneToControl && CONTROL_STATUSES.has(app.id)) continue;
      const existing = this.statuses.find((s) => s.id === app.id);
      if (existing) {
        existing.time = Math.max(existing.time, app.duration);
        existing.magnitude = Math.max(existing.magnitude, app.magnitude);
        existing.stacks = Math.min(12, existing.stacks + (app.stacks ?? 0));
        continue;
      }
      const dotType = DOT_TYPES[app.id] ?? null;
      this.statuses.push({
        id: app.id,
        time: app.duration,
        magnitude: app.magnitude,
        stacks: app.stacks ?? 1,
        dotType,
        dotPerSecond: dotType ? depthCurve(this.depth).damage * 0.22 * app.magnitude : 0,
      });
      if (CONTROL_STATUSES.has(app.id)) {
        this.rootTimer = Math.max(this.rootTimer, app.duration);
        this.interrupt(ctx);
      }
    }
  }

  private get isImmuneToControl(): boolean {
    return this.affixes.some((a) => a.behavior === 'juggernaut');
  }

  private tickStatuses(dt: number, ctx: CombatContext): void {
    for (let i = this.statuses.length - 1; i >= 0; i--) {
      const s = this.statuses[i]!;
      s.time -= dt;
      if (s.dotType && s.dotPerSecond > 0) {
        const amount = s.dotPerSecond * s.stacks * dt;
        this.life -= amount;
        if (ctx.rng.next() < dt * 3) {
          ctx.fx.burst(s.dotType === 'poison' ? 'poison' : s.dotType === 'fire' ? 'hit.fire' : 'blood',
            this.root.position.x, this.centerY, this.root.position.z, { count: 2, color: typeColor(s.dotType) });
        }
      }
      if (s.time <= 0) this.statuses.splice(i, 1);
    }
    if (this.life <= 0 && this.alive) this.die(ctx);
  }

  // --- damage --------------------------------------------------------------

  takeDamage(packet: DamagePacket, ctx: CombatContext): void {
    if (!this.alive || this.disposed) return;

    // Invulnerability windows (Shielded affix, burrow, phase).
    if (this.buffSum('invulnerable') > 0) {
      ctx.fx.burst('shock', this.root.position.x, this.centerY, this.root.position.z, {
        count: 6,
        color: 0x60c0ff,
      });
      return;
    }
    // Phasing: a slice of hits simply pass through.
    const phaseAffix = this.affixes.find((a) => a.behavior === 'phasing');
    if (phaseAffix && ctx.rng.chance(phaseAffix.params?.dodge ?? 0.2)) {
      ctx.fx.burst('void', this.root.position.x, this.centerY, this.root.position.z, {
        count: 5,
        color: phaseAffix.color,
      });
      return;
    }

    let working = packet;
    // Stoneskin / missile dampening chip the packet before mitigation.
    for (const a of this.affixes) {
      if (a.behavior === 'stoneskin' && working.type === 'physical') {
        working = { ...working, amount: working.amount * (1 - (a.params?.physicalReduction ?? 0.4)) };
      }
      if (a.behavior === 'missile_dampening' && working.ability && working.ability !== 'melee') {
        working = { ...working, amount: working.amount * (1 - (a.params?.rangedReduction ?? 0.4) * 0.5) };
      }
    }

    let taken: number;
    let type: DamageType = working.type;
    try {
      const res = mitigate(working, this.stats, ctx.rng);
      taken = res.amount;
      type = res.type;
    } catch {
      taken = working.amount;
    }
    taken *= 1 - clamp(this.buffSum('absorb'), 0, 0.9);
    if (taken <= 0) return;

    // Health Link spreads a share across the pack.
    const link = this.affixes.find((a) => a.behavior === 'health_link');
    if (link) {
      const share = link.params?.share ?? 0.5;
      const partners = alliesNear(ctx, this.root.position.x, this.root.position.z, link.params?.radius ?? 14, this.id)
        .filter((e) => e.affixes.some((x) => x.id === 'health_link'));
      if (partners.length) {
        const spread = (taken * share) / partners.length;
        taken *= 1 - share;
        for (const partner of partners) partner.absorbLinked(spread, ctx);
      }
    }

    // Shield pool eats damage first.
    if (this.shield > 0) {
      const used = Math.min(this.shield, taken);
      this.shield -= used;
      taken -= used;
      ctx.fx.burst('shock', this.root.position.x, this.centerY, this.root.position.z, {
        count: 4,
        color: 0x60c0ff,
      });
      if (taken <= 0) return;
    }

    this.life -= taken;
    this.lastDamagedAt = ctx.elapsed;
    this.killedBy = type;
    this.hitFlash = 1;

    events.emit('enemy:damaged', {
      id: this.id,
      amount: taken,
      type,
      crit: working.crit,
      x: this.root.position.x,
      y: this.centerY,
      z: this.root.position.z,
    });
    ctx.fx.burst(type === 'physical' ? 'blood' : `hit.${type}`, this.root.position.x, this.centerY, this.root.position.z, {
      count: working.crit ? 20 : 10,
      color: typeColor(type),
    });
    // Mark the floor. Hits used to be pure particles, so a fight left no trace
    // and the only blood on the ground was one pool where something died.
    if (type === 'physical' && this.family !== 'construct' && ctx.rng.chance(working.crit ? 0.9 : 0.45)) {
      ctx.decals.splatter(
        'bloodSplatter',
        this.root.position.x, this.root.position.z,
        (working.crit ? 0.55 : 0.36) * this.sizeScale,
        working.crit ? 3 : 1,
      );
    }

    // Reactions -------------------------------------------------------------
    this.ai?.onDamaged(ctx);
    this.interrupt(ctx);
    if (this.action !== 'attack' && !this.busy) this.setAction('hit', 0.28);
    if (working.knockback && !this.isImmuneToControl && !this.isBoss) {
      const a = angleTo(ctx.playerPos.x, ctx.playerPos.z, this.root.position.x, this.root.position.z);
      const push = clamp(working.knockback, 0, 6) / Math.max(0.6, this.sizeScale);
      this.moveBy(Math.sin(a) * push * 0.35, Math.cos(a) * push * 0.35, ctx);
    }
    if (working.applies?.length) this.applyStatuses(working.applies, ctx);

    // Retaliation affixes ---------------------------------------------------
    for (const a of this.affixes) {
      if (a.behavior === 'thorns' && (working.ability === undefined || working.ability === 'melee')) {
        const back = rollPacket(this, ctx, (a.params?.ratio ?? 0.18) * 0.6, 'physical', 'thorns');
        back.amount = taken * (a.params?.ratio ?? 0.18);
        ctx.damagePlayer(back);
      } else if (a.behavior === 'reflect_damage') {
        const back = rollPacket(this, ctx, 0.1, working.type, 'reflect');
        back.amount = taken * (a.params?.ratio ?? 0.2);
        ctx.damagePlayer(back);
      } else if (a.behavior === 'illusionist' && ctx.rng.chance(0.06)) {
        summon(this, ctx, 'mirror_image', a.params?.count ?? 2, 2.2);
      }
    }

    if (this.life <= 0) this.die(ctx);
  }

  /** Health Link partner intake — bypasses mitigation so links can't double-dip. */
  absorbLinked(amount: number, ctx: CombatContext): void {
    if (!this.alive) return;
    this.life -= amount;
    ctx.fx.burst('void', this.root.position.x, this.centerY, this.root.position.z, {
      count: 4,
      color: 0xff60c0,
    });
    if (this.life <= 0) this.die(ctx);
  }

  // --- death ---------------------------------------------------------------

  protected die(ctx: CombatContext): void {
    if (!this.alive) return;

    // Soul Bound gets back up once, at reduced strength.
    const soul = this.affixes.find((a) => a.behavior === 'soul_bound');
    if (soul && this.revives === 0) {
      this.revives = 1;
      this.life = this.maxLife * (soul.params?.reviveFraction ?? 0.45);
      this.buff('risen', 999, { damage: 0.8, speed: 1.15 });
      ctx.fx.burst('portal', this.root.position.x, this.centerY, this.root.position.z, {
        count: 30,
        color: soul.color,
      });
      events.emit('toast', { text: `${this.name} rises again!`, kind: 'bad' });
      return;
    }

    this.alive = false;
    this.life = 0;
    this.deathT = 0;
    this.inst?.telegraph?.cancel();
    this.inst = null;
    this.motionOverride = null;

    const p = this.root.position;
    ctx.fx.burst(this.family === 'construct' ? 'dust' : 'blood', p.x, this.centerY, p.z, {
      count: 26,
      color: this.def.visual.glow ?? 0xaa2020,
    });
    if (this.family === 'construct') {
      ctx.decals.splatter('ash', p.x, p.z, 0.7 * this.sizeScale, 3);
    } else {
      // A pool where the body fell, and thrown blood around it.
      ctx.decals.splatter('gore', p.x, p.z, 0.62 * this.sizeScale, 2);
      ctx.decals.splatter('bloodSplatter', p.x, p.z, 0.85 * this.sizeScale, 5);
    }

    // On-death abilities and affixes.
    for (const id of this.abilityIds) {
      const a = getAbility(id);
      if (a?.tags?.includes('ondeath')) a.onExecute?.(this, ctx, makeInstance(a));
    }
    this.runDeathAffixes(ctx);

    events.emit('enemy:killed', {
      id: this.id,
      monsterId: this.monsterId,
      rank: this.rank,
      x: p.x,
      z: p.z,
    });

    // Avenger: the pack gets angrier every time one of them falls.
    for (const ally of alliesNear(ctx, p.x, p.z, 16, this.id)) {
      const av = ally.affixes.find((a) => a.behavior === 'avenger');
      if (av) ally.stackAvenger(av.params?.perDeath ?? 0.15, av.params?.cap ?? 1.8);
    }
  }

  stackAvenger(perDeath: number, cap: number): void {
    this.affixStacks = Math.min((cap - 1) / perDeath, this.affixStacks + 1);
    this.outgoingMul = Math.min(cap, 1 + this.affixStacks * perDeath);
  }

  private runDeathAffixes(ctx: CombatContext): void {
    const p = this.root.position;
    for (const a of this.affixes) {
      switch (a.behavior) {
        case 'unstable': {
          const r = a.params?.radius ?? 4.5;
          const tel = ctx.decals.telegraph('circle', p.x, p.z, r, 0, a.params?.delay ?? 0.9, a.color);
          const self = this;
          after(a.params?.delay ?? 0.9, (c) => {
            tel.cancel();
            circleHit(self, c, p.x, p.z, r, a.params?.mul ?? 2.6, 'fire', 'unstable', { knockback: 4 });
            c.fx.burst('hit.fire', p.x, 0.5, p.z, { count: 44, scale: 3 });
          });
          break;
        }
        case 'fire_enchanted':
          circleHit(this, ctx, p.x, p.z, a.params?.deathRadius ?? 4.5, 1.8, 'fire', 'fire_enchanted');
          spawnHazard(this, ctx, p.x, p.z, 2.4, 0.4, 'fire', 'fire_enchanted', { duration: 5, tickRate: 2 });
          break;
        case 'cold_enchanted':
        case 'chilling_death': {
          circleHit(this, ctx, p.x, p.z, a.params?.radius ?? 5, a.params?.mul ?? 1.5, 'cold', 'chilling_death', {
            applies: [{ id: 'chill', duration: 3, magnitude: 0.4 }],
          });
          const shards = a.params?.shards ?? 8;
          for (let i = 0; i < shards; i++) {
            const ang = (i / shards) * Math.PI * 2;
            fireProjectile(this, ctx, p.x + Math.sin(ang) * 9, p.z + Math.cos(ang) * 9, 0.9, 'cold', 'shatter', {
              shape: 'shard',
              speed: 13,
              life: 1.3,
            });
          }
          break;
        }
        case 'storm_death': {
          const bolts = a.params?.bolts ?? 8;
          for (let i = 0; i < bolts; i++) {
            const ang = (i / bolts) * Math.PI * 2;
            fireProjectile(this, ctx, p.x + Math.sin(ang) * 12, p.z + Math.cos(ang) * 12, a.params?.mul ?? 1.3, 'lightning', 'storm_death', {
              shape: 'shard',
              speed: 20,
              life: 1.1,
            });
          }
          break;
        }
        case 'plagued':
          circleHit(this, ctx, p.x, p.z, a.params?.deathRadius ?? 4, 1.4, 'poison', 'plagued', {
            applies: [{ id: 'poison', duration: 8, magnitude: 1.6 }],
          });
          spawnHazard(this, ctx, p.x, p.z, 3, 0.35, 'poison', 'plagued', { duration: 8, tickRate: 2 });
          break;
        case 'arcane_sentry':
          summon(this, ctx, 'arcane_sentry_totem', 1, 1.5);
          break;
        default:
          break;
      }
    }
  }

  private tickDeath(dt: number, ctx: CombatContext): void {
    this.deathT += dt * 1.25;
    const k = Math.min(1, this.deathT);
    this.rig?.update(dt, {
      locomotion: 0,
      action: 'death',
      actionT: k,
      time: ctx.elapsed,
      deathT: k,
    });
    // Collapse, then sink and shrink away — no per-instance material clone
    // needed, which keeps the shared-material contract intact.
    if (this.deathT > 1) {
      const s = Math.max(0, 1 - (this.deathT - 1) * 1.6);
      this.bodyRoot.scale.setScalar(this.sizeScale * (0.6 + s * 0.4));
      this.root.position.y = -(1 - s) * 1.4 * this.sizeScale;
      if (this.aura) this.aura.visible = false;
    }
    if (this.deathT >= 1.45) this.readyToRemove = true;
  }

  /**
   * Loot is owed as soon as the body starts falling, not when it finishes
   * sinking. Waiting for the full death animation meant a two second gap
   * between the kill and anything hitting the floor, which reads as the game
   * having forgotten about you.
   */
  get readyToLoot(): boolean {
    return !this.alive && this.deathT >= 0.25;
  }

  // --- affix behaviours ----------------------------------------------------

  private tickAffixes(dt: number, ctx: CombatContext): void {
    const p = this.root.position;
    const brainAwake = this.ai ? !this.ai.isDormant : true;
    for (let i = 0; i < this.affixes.length; i++) {
      const a = this.affixes[i]!;
      this.affixTimers[i] = (this.affixTimers[i] ?? 0) - dt;
      const ready = (this.affixTimers[i] ?? 0) <= 0;
      const params = a.params ?? {};

      switch (a.behavior) {
        case 'berserker':
          this.outgoingMul = 1 + (1 - this.lifeFraction) * ((params.maxBonus ?? 1.8) - 1);
          break;
        case 'regenerating':
          if (ctx.elapsed - this.lastDamagedAt > (params.delay ?? 3)) {
            this.life = Math.min(this.maxLife, this.life + this.maxLife * (params.pctPerSecond ?? 0.03) * dt);
          }
          break;
        case 'fire_enchanted':
        case 'poison_aura':
        case 'vampiric': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = 1.0;
          const radius = params.radius ?? params.auraRadius ?? 3;
          const type: DamageType = a.behavior === 'fire_enchanted' ? 'fire' : a.behavior === 'poison_aura' ? 'poison' : 'arcane';
          if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) < radius) {
            const packet = hitPlayer(this, ctx, params.auraDps ?? params.dps ?? 0.25, type, a.id);
            if (a.behavior === 'vampiric') this.heal(packet.amount * (params.healRatio ?? 1), ctx);
          }
          break;
        }
        case 'cold_enchanted': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = 1.0;
          if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) < (params.auraRadius ?? 3)) {
            hitPlayer(this, ctx, params.auraDps ?? 0.2, 'cold', a.id, {
              applies: [{ id: 'chill', duration: 2, magnitude: 0.3 }],
            });
          }
          break;
        }
        case 'lightning_enchanted': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 3.5;
          const n = params.arcs ?? 6;
          for (let k = 0; k < n; k++) {
            const ang = (k / n) * Math.PI * 2 + ctx.elapsed;
            fireProjectile(this, ctx, p.x + Math.sin(ang) * 10, p.z + Math.cos(ang) * 10, 0.7, 'lightning', a.id, {
              shape: 'shard',
              speed: 11,
              life: 1.4,
              color: a.color,
            });
          }
          break;
        }
        case 'arcane_enchanted': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = 0.35;
          const beams = params.beams ?? 2;
          const sweep = ctx.elapsed * (params.sweepSpeed ?? 0.8);
          for (let k = 0; k < beams; k++) {
            const ang = sweep + (k / beams) * Math.PI * 2;
            const pa = angleTo(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
            if (Math.abs(angleDelta(ang, pa)) < 0.14 && dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) < 14) {
              hitPlayer(this, ctx, params.dps ?? 0.5, 'arcane', a.id);
            }
            ctx.fx.burst('void', p.x + Math.sin(ang) * 4, 1.0, p.z + Math.cos(ang) * 4, { count: 2, color: a.color });
          }
          break;
        }
        case 'molten_trail':
        case 'frozen_ground': {
          if (!ready || !brainAwake || this.locomotion < 0.15) break;
          this.affixTimers[i] = params.interval ?? 1.0;
          const isFire = a.behavior === 'molten_trail';
          spawnHazard(this, ctx, p.x, p.z, params.radius ?? 1.6, params.dps ?? 0.3, isFire ? 'fire' : 'cold', a.id, {
            duration: params.life ?? 4,
            tickRate: 2,
            color: a.color,
            applies: isFire ? undefined : [{ id: 'chill', duration: 2, magnitude: params.slow ?? 0.4 }],
          });
          break;
        }
        case 'frozen_pulse': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 5;
          const n = params.count ?? 5;
          for (let k = 0; k < n; k++) {
            const ang = (k / n) * Math.PI * 2 + ctx.elapsed * 0.7;
            fireProjectile(this, ctx, p.x + Math.sin(ang) * 12, p.z + Math.cos(ang) * 12, 0.8, 'cold', a.id, {
              shape: 'shard',
              speed: 7,
              life: 2.6,
              color: a.color,
              applies: [{ id: 'chill', duration: 3, magnitude: 0.3 }],
            });
          }
          break;
        }
        case 'electrified': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 2.6;
          const n = params.bolts ?? 4;
          for (let k = 0; k < n; k++) {
            const ang = ctx.rng.next() * Math.PI * 2;
            fireProjectile(this, ctx, p.x + Math.sin(ang) * 9, p.z + Math.cos(ang) * 9, 0.6, 'lightning', a.id, {
              shape: 'shard',
              speed: 14,
              life: 1.1,
              color: a.color,
            });
          }
          break;
        }
        case 'orbiter': {
          const orbs = params.orbs ?? 3;
          const r = params.radius ?? 2.4;
          for (let k = 0; k < orbs; k++) {
            const ang = ctx.elapsed * (params.spin ?? 1.6) + (k / orbs) * Math.PI * 2;
            const ox = p.x + Math.sin(ang) * r;
            const oz = p.z + Math.cos(ang) * r;
            if (ctx.rng.next() < dt * 4) ctx.fx.burst('embers', ox, 0.9, oz, { count: 2, color: a.color });
            if (dist(ox, oz, ctx.playerPos.x, ctx.playerPos.z) < 0.8 && ready) {
              this.affixTimers[i] = 0.7;
              hitPlayer(this, ctx, params.dps ?? 0.45, 'fire', a.id);
            }
          }
          break;
        }
        case 'mortar': {
          if (!ready || !brainAwake) break;
          const d = dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
          if (d < (params.minRange ?? 6)) break;
          this.affixTimers[i] = params.interval ?? 4.5;
          const tx = ctx.playerPos.x;
          const tz = ctx.playerPos.z;
          const tel = ctx.decals.telegraph('circle', tx, tz, params.radius ?? 2.6, 0, 0.9, a.color);
          const self = this;
          after(0.9, (c) => {
            tel.cancel();
            circleHit(self, c, tx, tz, params.radius ?? 2.6, 1.4, 'fire', 'mortar');
          });
          break;
        }
        case 'teleporter': {
          if (!ready || !brainAwake) break;
          const d = dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
          if (d < (params.minRange ?? 7)) break;
          this.affixTimers[i] = params.interval ?? 6;
          const ang = ctx.rng.next() * Math.PI * 2;
          const t = ctx.nav.clampToWalkable(ctx.playerPos.x + Math.sin(ang) * 2.5, ctx.playerPos.z + Math.cos(ang) * 2.5);
          ctx.fx.burst('portal', p.x, this.centerY, p.z, { count: 16, color: a.color });
          this.teleportTo(t.x, t.y, ctx);
          ctx.fx.burst('portal', t.x, this.centerY, t.y, { count: 16, color: a.color });
          break;
        }
        case 'wormhole': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 11;
          const px = ctx.playerPos.x;
          const pz = ctx.playerPos.z;
          ctx.fx.burst('portal', p.x, this.centerY, p.z, { count: 20, color: a.color });
          this.teleportTo(px, pz, ctx);
          ctx.fx.burst('portal', px, this.centerY, pz, { count: 20, color: a.color });
          break;
        }
        case 'jailer': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 8;
          const tx = ctx.playerPos.x;
          const tz = ctx.playerPos.z;
          const tel = ctx.decals.telegraph('ring', tx, tz, 1.8, 0, 0.8, a.color);
          const self = this;
          after(0.8, (c) => {
            tel.cancel();
            if (dist(tx, tz, c.playerPos.x, c.playerPos.z) < 1.8) {
              const packet = rollPacket(self, c, 0.15, 'arcane', 'jailer');
              packet.applies = [{ id: 'root', duration: params.duration ?? 1.6, magnitude: 1 }];
              c.damagePlayer(packet);
            }
          });
          break;
        }
        case 'waller': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 9;
          const segs = params.segments ?? 5;
          const base = angleTo(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) + Math.PI * 0.5;
          for (let k = 0; k < segs; k++) {
            const off = (k - (segs - 1) / 2) * 1.5;
            spawnHazard(
              this, ctx,
              ctx.playerPos.x + Math.sin(base) * off,
              ctx.playerPos.z + Math.cos(base) * off,
              0.9, 0.5, 'physical', 'waller',
              { duration: params.life ?? 8, tickRate: 2, color: a.color },
            );
          }
          break;
        }
        case 'vortex': {
          if (!ready || !brainAwake) break;
          const d = dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
          if (d < 3 || d > (params.range ?? 12)) break;
          this.affixTimers[i] = params.interval ?? 7;
          const packet = rollPacket(this, ctx, 0.2, 'arcane', 'vortex');
          packet.knockback = -Math.min(10, d);
          ctx.damagePlayer(packet);
          ctx.fx.burst('void', ctx.playerPos.x, 1, ctx.playerPos.z, { count: 18, color: a.color });
          break;
        }
        case 'gravity': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 2.4;
          if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) > (params.radius ?? 10)) break;
          const packet = rollPacket(this, ctx, 0.08, 'arcane', 'gravity');
          packet.knockback = -(params.pull ?? 2.2);
          ctx.damagePlayer(packet);
          break;
        }
        case 'shielded': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 11;
          this.buff('affix_shield', params.duration ?? 2.6, { invulnerable: 1 });
          ctx.fx.burst('heal', p.x, this.centerY, p.z, { count: 20, color: a.color });
          break;
        }
        case 'summoner': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 14;
          if (this.summonCount >= (params.cap ?? 6)) break;
          const kin = MONSTERS.find(
            (m) => m.family === this.family && m.role === 'swarm' && m.minDepth <= this.depth && m.weight > 0,
          );
          const spawned = summon(this, ctx, kin?.id ?? 'hive_drone', params.count ?? 2, 2.6);
          this.summonCount += spawned.length;
          for (const s of spawned) s.summonedBy = this.id;
          break;
        }
        case 'arcane_sentry': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 12;
          summon(this, ctx, 'arcane_sentry_totem', params.count ?? 1, 2.2);
          break;
        }
        case 'illusionist': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 13;
          summon(this, ctx, 'mirror_image', params.count ?? 2, 2.2);
          break;
        }
        case 'empowered':
        case 'hasted_pack': {
          if (!ready) break;
          this.affixTimers[i] = 2.5;
          const isDamage = a.behavior === 'empowered';
          for (const ally of alliesNear(ctx, p.x, p.z, params.radius ?? 10, this.id)) {
            ally.buff(a.id, 3.2, isDamage
              ? { damage: params.damage ?? 1.3 }
              : { speed: params.speed ?? 1.3, attackSpeed: params.attackSpeed ?? 1.3 });
          }
          break;
        }
        case 'plagued': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = params.interval ?? 3.5;
          spawnHazard(this, ctx, p.x, p.z, params.radius ?? 2.6, params.dps ?? 0.3, 'poison', a.id, {
            duration: 6,
            tickRate: 2,
            color: a.color,
          });
          break;
        }
        default:
          break;
      }
    }
  }

  /** Called by the ability layer when this monster lands a hit on the player. */
  onDealtDamage(amount: number, ctx: CombatContext): void {
    for (const a of this.affixes) {
      const params = a.params ?? {};
      switch (a.behavior) {
        case 'life_leech':
          this.heal(amount * (params.ratio ?? 0.33), ctx);
          break;
        case 'blood_thirsty':
          this.affixStacks = Math.min(params.maxStacks ?? 10, this.affixStacks + 1);
          this.outgoingMul = 1 + this.affixStacks * (params.perStack ?? 0.06);
          break;
        default:
          break;
      }
    }
  }

  // --- misc ----------------------------------------------------------------

  private setAction(action: RigAction, length: number): void {
    this.action = action;
    this.actionT = 0;
    this.actionLen = Math.max(0.08, length);
  }

  private buildAura(color: number): void {
    if (!auraRingGeo) {
      auraRingGeo = new THREE.RingGeometry(0.78, 1.0, 22);
      auraRingGeo.rotateX(-Math.PI * 0.5);
    }
    const ring = new THREE.Mesh(auraRingGeo, auraMaterial(color));
    ring.position.y = 0.05;
    ring.scale.setScalar(this.hitRadius * 2.6);
    ring.renderOrder = 1;
    this.aura = ring;
    this.root.add(ring);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.inst?.telegraph?.cancel();
    this.inst = null;
    this.ai = null;
    this.root.parent?.remove(this.root);
    // Geometry and materials belong to the shared prototype cache in
    // MonsterModels — releasing them here would break every other spawn.
    // `disposeMonsterCache()` handles them at run teardown.
  }
}

const DOT_TYPES: Record<string, DamageType> = {
  burn: 'fire',
  poison: 'poison',
  bleed: 'physical',
  corrode: 'poison',
};

const CONTROL_STATUSES = new Set(['stun', 'freeze', 'root', 'petrified', 'web']);

// ---------------------------------------------------------------------------
// Spawning helpers
// ---------------------------------------------------------------------------

/** Builds an Enemy from a monster id, resolving affixes by id. */
export function spawnEnemy(
  monsterId: string,
  rank: MonsterRank,
  affixIds: string[],
  depth: number,
  rng: Rng,
): Enemy | null {
  const def = getMonster(monsterId);
  if (!def) {
    console.warn(`[enemy] unknown monster id "${monsterId}"`);
    return null;
  }
  const affixes: MonsterAffixDef[] = [];
  for (const id of affixIds) {
    const a = getAffix(id);
    if (a) affixes.push(a);
  }
  return new Enemy(def, rank, affixes, depth, rng);
}

/** Clears per-run AI state. Scenes call this when tearing a level down. */
export function resetEnemyRuntime(): void {
  resetPacks();
}

// Wire the ability layer to the combat sim and to Enemy construction. Done here
// rather than in Abilities.ts so that module stays free of runtime cycles.
setDamageRoller(rollDamage);
setSummonFactory((monsterId, x, z, depth, ctx, rank) => {
  const def = getMonster(monsterId);
  if (!def) return null;
  const e = new Enemy(def, (rank as MonsterRank) ?? 'normal', [], depth, ctx.rng);
  const t = ctx.nav.clampToWalkable(x, z);
  e.root.position.set(t.x, 0, t.y);
  e.ai?.wake(ctx, false);
  ctx.scene.add(e.root);
  ctx.enemies.push(e);
  return e;
});

void MONSTER_AFFIXES;
void BOSSES;
void _pos;
