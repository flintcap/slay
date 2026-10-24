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
import type { NamedRare } from '../data/namedRares';
import { events } from '../core/Events';
import { emptyStats } from '../sim/Stats';
import { depthCurve } from '../sim/Difficulty';
import { payoutIlvl } from '../sim/Payout';
import { KNOCKBACK_METRES, rollDamage, mitigate, usualAttackRating } from '../sim/Combat';
import { buildMonsterModel, creatureDetail, monsterArchetype, releaseMonsterModel, RigAnimator, type RigAction } from './MonsterModels';
import type { RigDriveOpts } from '../art/creatures/Animator';
import { AIBrain, resetPacks } from './AI';
import {
  after,
  alliesNear,
  angleDelta,
  angleTo,
  clamp,
  circleHit,
  dashToward,
  dist,
  distToSegment,
  fireProjectile,
  heroControlled,
  noteControl,
  getAbility,
  hitPlayer,
  isHarmless,
  makeInstance,
  resetAbilityWorld,
  rollPacket,
  setDamageRoller,
  setSummonFactory,
  spawnHazard,
  summon,
  tickAbilityWorld,
  tell,
  typeColor,
  warnsOnGround,
  NO_TELL,
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
import { hitMaterial, MATERIAL_BURST, MATERIAL_MARK } from '../fx/Materials';
import { getStatus } from '../data/statuses';
import { HoldFade, dotRate, durationOf, isHold, modScale, reapply, stackCap, statusDef } from '../sim/StatusRules';
import { powerHooks } from '../sim/ItemPowers';
import { resolveCombo, type ComboHit } from './Combos';
import { tr } from '../core/I18n';


/** Fastest a monster may move while backing away from the hero (the hero walks at 4.6). */
const RETREAT_SPEED_CAP = 3.4;
/**
 * Every monster but a boss walks at this share of its catalogue speed (owner:
 * monsters felt too fast). Dashes, leaps and charges move on their own clocks
 * and keep their full pace, so the threat is in the moves, not the chase.
 */
const MOVE_SCALE = 0.85;
/**
 * Fastest any non-boss walks, after hastes, affixes and sprints: well under the
 * hero's 4.6, so a hero on foot can always pull away from a chaser.
 */
const CHASE_SPEED_CAP = 3.9;

// Re-exported so the scene layer can pull the whole monster surface from here,
// exactly as CONTRACTS.md specifies.

export type { CombatContext } from './Abilities';

/** A monster with no special moves swings this much faster, so it loses no threat. */
const PLAIN_SWING = 1.15;

function isPlainShot(id: string): boolean {
  const a = getAbility(id);
  return !!a && a.kind === 'ranged' && (a.tags?.includes('basic') ?? false);
}

/** True when every move a monster has is a plain attack, a death burst or an aura. */
function plainFighter(def: MonsterDef): boolean {
  return def.abilities.every((id) => {
    const a = getAbility(id);
    return !a || a.kind === 'aura' || (a.tags?.includes('basic') ?? false) || (a.tags?.includes('ondeath') ?? false);
  });
}
export { MONSTERS, pickMonstersForDepth } from '../data/monsters';
export { MONSTER_AFFIXES } from '../data/monsterAffixes';
export { BOSSES } from '../data/bosses';

// ---------------------------------------------------------------------------
// Depth scaling
// ---------------------------------------------------------------------------

// The curve itself lives with the rest of the depth rules in sim/Difficulty.ts.
export { depthCurve, type DepthCurve } from '../sim/Difficulty';

/**
 * Affixes that fire early when the hero has just been pinned by something.
 * This is what makes a pair of affixes a threat rather than two timers.
 */
const COMBO_FOLLOWUPS: ReadonlySet<string> = new Set([
  'mortar', 'desecrator', 'lancer', 'electrified', 'lightning_enchanted', 'frozen_pulse', 'arcane_enchanted',
  'emberfall',
]);
/** Seconds before the same affix can be set off by a combo again. */
const COMBO_COOLDOWN = 6;

/** What `Enemy` needs from a mini-boss mechanic. Implemented in `MiniBoss.ts`. */
export interface MiniBossHook {
  readonly kind: string;
  /** While true, ordinary abilities wait: the mechanic has the floor. */
  readonly wantsTurn: boolean;
  tick(dt: number, ctx: CombatContext): void;
  onDeath(ctx: CombatContext): void;
  /** Monsters its mechanic calls up, so the floor can build them behind the curtain. */
  summons?(): string[];
}

/** Half-angle of a braced tank's guard, radians, and how much it turns aside. */
export const TANK_GUARD_ARC = 1.0;
export const TANK_GUARD_CUT = 0.3;
/** Seconds a pack falters when its leader dies. */
const LEADER_FALL_SHAKE = 1.2;

const RANK_MODS: Record<MonsterRank, { life: number; damage: number; defense: number; scale: number }> = {
  normal: { life: 1, damage: 1, defense: 1, scale: 1 },
  champion: { life: 2.6, damage: 1.25, defense: 1.3, scale: 1.1 },
  elite: { life: 4.5, damage: 1.5, defense: 1.6, scale: 1.18 },
  rare: { life: 7.0, damage: 1.75, defense: 1.9, scale: 1.24 },
  boss: { life: 26, damage: 2.4, defense: 2.4, scale: 1 },
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
  /** Stat changes set by the application (a curse at its rank), over the def's. */
  mods?: Partial<Stats>;
  /** Gash's burst when it runs out, as a percent of its full run, and that run's length. */
  burst?: number;
  full?: number;
  /** Unrelenting: below this percent of life the effect does not run down. */
  holdBelow?: number;
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
  m.userData.shared = true;
  auraMatCache.set(color, m);
  return m;
}

// ---------------------------------------------------------------------------
// Enemy
// ---------------------------------------------------------------------------

/** What a monster's nameplate shows (`Enemy.nameplate`). */
export interface EnemyPlate {
  name: string;
  /** Only a named rare has one. */
  title?: string;
  rank: MonsterRank;
  affixes: string[];
  life: number;
  maxLife: number;
  color: number;
  level: number;
  affixBehaviors: string[];
  affixColors: number[];
}

/** How many times a monster's position went non-finite and was repaired (soak reads it). */
export let enemyPositionRepairs = 0;

/** What a body's rig is driven with, one object refilled for every solve (the rig reads it, never keeps it). */
const _drive: RigDriveOpts = { locomotion: 0, action: 'idle', actionT: 0, time: 0, deathT: 0 };

/** The camera a body's draw detail is judged from (`Enemy.setDetailFor`). */
export interface DetailView {
  cam: THREE.Vector3;
  /** Pixels per metre at one metre from the camera. */
  pxPerM: number;
  /** Bodies shorter on screen than this draw their lower-detail copies. */
  lowPx: number;
}

/** Hands out each body's pose slot (Enemy.poseSlot). */
let nextPoseSlot = 0;

export class Enemy implements Combatant {
  private lastGoodX = 0;
  private lastGoodZ = 0;
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
  /** Set when this monster is a named rare rather than a generated one. */
  readonly named: NamedRare | null = null;
  readonly name: string;
  readonly isBoss: boolean = false;
  readonly hitRadius: number;
  readonly sizeScale: number;
  /** Reach of its moves as a scale, when not its body's. Bosses set it. */
  readonly reach?: number;
  readonly stats: Stats;
  readonly abilityIds: string[];

  life: number;
  maxLife: number;
  alive = true;
  readyToRemove = false;
  /** Set once the scene has paid out XP and loot, so it never pays twice. */
  lootGranted = false;
  facing = 0;
  shield = 0;
  rootTimer = 0;
  /** How holds wear off on it: the same rule as on the hero (`StatusRules.ts`). */
  private readonly holds = new HoldFade();
  outgoingMul = 1;
  motionOverride: MotionOverride | null = null;
  /** Pack id from the spawn table; scenes set this after construction. */
  packId = -1;
  /** Its place in the level's spawn table, or -1 for anything summoned or called. */
  spawnIndex = -1;
  /** Set by summons so they can be capped / cleaned up. */
  summonedBy: string | null = null;

  ai: AIBrain | null;

  protected readonly rng: Rng;
  /** The creature animator (read its `creature` for hit and release events). */
  readonly rig: RigAnimator | null;
  /**
   * False while the body is well outside the camera's view (the scene calls
   * `setInView` each step). The living pose is only solved, and the body
   * only casts a shadow, while it is true; the monster still thinks and
   * moves, and a fall always plays out.
   */
  inView = true;
  /**
   * Frames per pose solve while in view (the scene sets it each step): 2 for
   * bodies far from the hero, whose motion reads the same at half rate.
   */
  poseEvery = 1;
  private poseTick = 0;
  /** Spreads bodies posed every few frames over those frames, not all on one. */
  private readonly poseSlot = nextPoseSlot++ & 3;
  private poseDt = 0;
  private shadowCasters: THREE.Mesh[] | null = null;

  setInView(v: boolean): void {
    if (v === this.inView) return;
    this.inView = v;
    if (!this.shadowCasters) {
      const list: THREE.Mesh[] = [];
      this.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.castShadow) list.push(o as THREE.Mesh);
      });
      this.shadowCasters = list;
    }
    for (const m of this.shadowCasters) m.castShadow = v;
  }

  /** The body, while it may share a pack draw (`art/creatures/Packs.ts`): alive and in view. */
  get packBody(): THREE.Object3D | null {
    return this.alive && this.inView ? this.bodyRoot : null;
  }

  /** Drawn from its parts' lower-detail copies (`creatureDetail`). */
  private lowDetail = false;

  /**
   * Draws the body from its lower-detail copies while it stands under
   * `lowPx` pixels tall on screen, seen from `cam` by a camera that shows
   * `pxPerM` pixels per metre at one metre. A margin each way keeps a body
   * near the line from flickering between the two.
   */
  setDetailFor(view: DetailView): void {
    const info = this.bodyRoot.userData.creature as { height: number; length: number } | undefined;
    if (!info) return;
    const dist = view.cam.distanceTo(this.root.position);
    const tall = (Math.max(info.height, 0.7 * info.length) * this.bodyRoot.scale.y * view.pxPerM) / Math.max(1, dist);
    const low = tall < view.lowPx * (this.lowDetail ? 1.15 : 0.87);
    if (low === this.lowDetail) return;
    this.lowDetail = low;
    creatureDetail(this.bodyRoot, low);
  }
  protected readonly baseSpeed: number;
  protected readonly bodyRoot: THREE.Group;

  private readonly cooldowns = new Map<string, number>();
  private inst: AbilityInstance | null = null;
  private statuses: ActiveStatus[] = [];
  /** Damage the killing blow spilled past zero life. Read once, on death. */
  overkill = 0;
  /** Damage-over-time banked since the last floating number. */
  private dotAccum = 0;
  private dotShow = 0;
  private buffs: ActiveBuff[] = [];
  private shieldTimer = 0;
  private action: RigAction = 'idle';
  private actionT = 0;
  private actionLen = 0;
  private deathT = 0;
  /**
   * The floor under the body, eased so a step up or down reads as a step.
   * The scene sets `groundTarget` from the level each frame; raised and
   * sunken floors used to leave every body at the height it spawned at.
   */
  groundY = 0;
  groundTarget = 0;
  private grounded = false;
  private spawnT = 1;
  private hitFlash = 0;
  private locomotion = 0;
  private aura: THREE.Mesh | null = null;
  private affixTimers: number[] = [];
  /** When each follow-up affix may next be set off by a combo. */
  private comboAt: number[] = [];
  /** Adaptive: recent hits by element, and the element it has hardened to. */
  private adaptHits: Array<{ type: DamageType; t: number }> = [];
  private adapted: { type: DamageType; until: number } | null = null;
  /** When Echoing, Splintering and Funereal may next fire (their own cooldowns). */
  private echoAt = -99;
  private splinterAt = -99;
  private funeralAt = -99;
  /** Mini-boss mechanic, when this monster is one. See `MiniBoss.ts`. */
  miniBoss: MiniBossHook | null = null;
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
    /**
     * A named rare's definition, when this one is somebody in particular. It
     * replaces the generated "Frenzied Skeleton" name with a fixed one, adds a
     * title, and multiplies life and damage on top of the rank.
     */
    named?: NamedRare | null,
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
    this.ilvl = payoutIlvl(depth, rank === 'normal' ? 0 : 2);

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
    s.attackSpeed = def.attackSpeed * asAffix * (plainFighter(def) ? PLAIN_SWING : 1);
    s.critChance = 5 + (rank === 'normal' ? 0 : 5);
    // Total multiplier, as for the hero (Stats.baseCritDamage is 150): the
    // roller floors it at 100, so the 60 written here made crits do nothing.
    s.critDamage = 160;
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
    this.abilityIds = def.abilities.slice();
    if (!this.abilityIds.includes('basic_strike') && def.attackRange <= 4.5) {
      this.abilityIds.push('basic_strike');
    }
    // A shooter always has a plain shot to throw between its special moves.
    const shooter = def.role === 'ranged' || def.role === 'caster' || def.role === 'support';
    if (shooter && def.attackRange > 4.5 && !this.abilityIds.some((id) => isPlainShot(id))) {
      this.abilityIds.push('basic_shot');
    }

    // --- name --------------------------------------------------------------
    // A named rare keeps its own name; no rank prefix is bolted onto it,
    // because "Frenzied The Choirmaster" is not a name.
    this.named = named ?? null;
    this.name = named
      ? named.name
      : rank === 'normal'
        ? def.name
        : `${affixes[0]?.name ?? ''} ${def.name}`.trim();
    this.displayName = this.name;
    if (named) {
      this.maxLife = Math.round(this.maxLife * named.lifeMul);
      this.life = this.maxLife;
      this.stats.life = this.maxLife;
      this.stats.minDamage = Math.round(this.stats.minDamage * named.damageMul);
      this.stats.maxDamage = Math.round(this.stats.maxDamage * named.damageMul);
    }

    // --- model -------------------------------------------------------------
    this.root = new THREE.Group();
    this.root.name = `enemy:${def.id}`;
    // Family and rank shape the look: an elite wears its rank, a boss looks like one.
    const model = buildMonsterModel(def.visual, rng, this.sizeScale, { family: def.family, rank });
    this.bodyRoot = model.root;
    this.root.add(model.root);
    this.rig = new RigAnimator(model.root, model.bones, monsterArchetype(def.visual.body), rng);
    this.ai = new AIBrain(this, def, rng);

    if (affixes.length > 0) this.buildAura(affixes[0]!.color);

    // An affix that describes a buff now wears it, permanently, so its stat
    // modifiers are real. A Stoneskin elite used to be a name and a colour.
    for (const a of affixes) {
      const buff = a.behavior ? AFFIX_BUFF[a.behavior] : undefined;
      if (!buff || !statusDef(buff)) continue;
      this.statuses.push({
        id: buff,
        // Longer than any fight it will be in. These are what the monster is,
        // not something that wears off.
        time: 9999,
        magnitude: 1,
        stacks: 1,
        dotType: null,
        dotPerSecond: 0,
      });
    }
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
  /**
   * What the nameplate shows. Read for every monster every frame, so it is one
   * object per monster, built once (name, rank, level and affixes never change
   * after construction) with only life refreshed: building it fresh, three
   * arrays included, was the biggest allocator in a fight.
   */
  get nameplate(): EnemyPlate {
    const c = (this.plateCache ??= this.buildPlate());
    c.life = this.life;
    c.maxLife = this.maxLife;
    return c;
  }

  private plateCache: EnemyPlate | null = null;

  private buildPlate(): EnemyPlate {
    return {
      name: this.name,
      title: this.named?.title,
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
    // A soul in Soul Cage's grip cannot mend.
    if (!this.alive || amount <= 0 || this.hasStatus('grasped')) return;
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

  /** Ends a buff early. */
  unbuff(id: string): void {
    const i = this.buffs.findIndex((b) => b.id === id);
    if (i >= 0) this.buffs.splice(i, 1);
  }

  /**
   * True while the cursor cannot pick it: a boss hidden in the dark. Area
   * blows and anything aimed at the ground still land.
   */
  get untargetable(): boolean {
    return false;
  }

  hasBuff(id: string): boolean {
    return this.buffs.some((b) => b.id === id);
  }

  /** Outgoing damage multiplier from active buffs. Read by `rollPacket`. */
  get buffDamageMul(): number {
    return this.buffMul('damage');
  }

  /**
   * The stats its blows are rolled from, statuses included, so Weakened and
   * the like really cut what it deals. Read by `rollPacket`.
   */
  get combatStats(): Stats {
    return this.statusAdjustedStats();
  }

  /**
   * How fast its moves play: its own speed, buffs, and statuses such as
   * Chilled (-15% attack speed), never below a third.
   */
  private actionSpeed(): number {
    let pct = 0;
    for (let si = 0; si < this.statuses.length; si++) {
      const st = this.statuses[si]!;
      const own = st.mods;
      const v = (own ?? statusDef(st.id)?.mods)?.attackSpeed;
      if (typeof v === 'number') pct += v * modScale(!!own, st.magnitude, st.stacks);
    }
    return Math.max(0.35, this.stats.attackSpeed * this.buffMul('attackSpeed') * Math.max(0.3, 1 + pct / 100));
  }

  private buffMul(key: keyof BuffMods): number {
    let m = 1;
    for (let bi = 0; bi < this.buffs.length; bi++) {
      const b = this.buffs[bi]!;
      const v = b.mods[key];
      if (v !== undefined) m *= v;
    }
    return m;
  }

  private buffSum(key: keyof BuffMods): number {
    let m = 0;
    for (let bi = 0; bi < this.buffs.length; bi++) {
      const b = this.buffs[bi]!;
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

  /**
   * An ability this monster insists on using next, ahead of the brain's own
   * scoring. `undefined` means no opinion; `null` means "nothing yet, close the
   * distance". Bosses override it to fight in a learnable rotation.
   */
  preferredAbility(_d: number, _ctx: CombatContext): AbilityDef | null | undefined {
    return undefined;
  }

  /**
   * Distance this monster wants to open before its next move (a charge needs a
   * run-up). The brain backs off to it. 0 means no such wish. Set by bosses.
   */
  gapWanted = 0;

  /** Wakes this monster into combat — used by rally abilities and aggro pings. */
  wake(ctx: CombatContext): void {
    this.ai?.wake(ctx, false);
  }

  /**
   * The summoned ally this monster is fighting instead of you, if any.
   *
   * The scene reads this while the monster is acting, so a blow aimed at "the
   * player" lands on the thing it actually walked over to hit.
   */
  get aggroMinion(): number | null {
    return this.ai?.aggroMinion ?? null;
  }

  onAmbushSprung(ctx: CombatContext): void {
    ctx.fx.burst('dust', this.root.position.x, 0.4, this.root.position.z, { count: 16 });
    events.emit('sfx', { id: 'ambush', x: this.root.position.x, z: this.root.position.z });
  }

  get centerY(): number {
    return this.groundY + 0.7 * this.sizeScale;
  }

  // --- ability runner ------------------------------------------------------

  abilityReady(id: string, ctx: CombatContext): boolean {
    const until = this.cooldowns.get(id);
    return until === undefined || ctx.elapsed >= until;
  }

  /** Starts an ability. Returns false when it could not begin. */
  beginAbility(def: AbilityDef, ctx: CombatContext): boolean {
    if (this.inst || !this.alive || this.rootTimer > 0) return false;
    if (this.miniBoss?.wantsTurn) return false;
    const inst = makeInstance(def);
    inst.phase = 'windup';
    // `playerPos` is the victim position: the scene points it at a summon when
    // this monster has decided to fight one, so this aims itself.
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
    inst.facing = angleTo(this.root.position.x, this.root.position.z, ctx.playerPos.x, ctx.playerPos.z);
    this.facing = inst.facing;
    this.inst = inst;

    const speed = this.actionSpeed();
    const windup = this.windupFor(def, speed);

    // A boss's telegraph goes down the instant the windup starts, so its
    // dangerous moves are readable and dodgeable. Other monsters lay no ground
    // mark (`warnsOnGround`); their wind-up pose and sound are the tell.
    if (def.telegraph && windup > 0.12 && warnsOnGround(this)) {
      const t = def.telegraph;
      const size = t.size * (t.atSelf ? (this.reach ?? this.sizeScale) : 1);
      const ox = t.atSelf ? this.root.position.x : inst.targetX;
      const oz = t.atSelf ? this.root.position.z : inst.targetZ;
      try {
        inst.telegraph = isHarmless(def)
          ? ctx.decals.cue(t.shape, ox, oz, size, inst.facing, windup, t.color)
          : ctx.decals.telegraph(t.shape, ox, oz, size, inst.facing, windup, t.color);
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

  /** Seconds from the start of a move to its hit. Bosses hold heavy ones longer. */
  protected windupFor(def: AbilityDef, speed: number): number {
    return def.windup / speed;
  }

  private tickAbility(dt: number, ctx: CombatContext): void {
    const inst = this.inst;
    if (!inst) return;
    const def = inst.def;
    const speed = this.actionSpeed();
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
        if (inst.t >= this.windupFor(def, speed)) {
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

  protected interrupt(ctx: CombatContext, force = false): void {
    const inst = this.inst;
    if (!inst) return;
    if (inst.phase !== 'windup' || (!inst.def.interruptible && !force)) return;
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
    // A marker drawn round the body is a promise about where the blow lands:
    // the body stays on it until the blow does, or walking out of it is futile.
    if (inst && inst.phase === 'windup' && inst.telegraph && inst.def.telegraph?.atSelf) return false;
    return true;
  }

  // --- main tick -----------------------------------------------------------

  update(dt: number, ctx: CombatContext): void {
    if (this.disposed) return;
    tickAbilityWorld(dt, ctx);

    if (!this.grounded) {
      this.grounded = true;
      this.groundY = this.groundTarget;
    } else this.groundY += (this.groundTarget - this.groundY) * Math.min(1, dt * 16);

    if (!this.alive) {
      this.tickDeath(dt, ctx);
      return;
    }
    if (!this.motionOverride) this.root.position.y = this.groundY;

    // A non-finite position (a bad motion target, a zero-length push) makes
    // an invisible monster that every area check still hits, and its damage
    // numbers threw in the HUD. Put it back where it last stood.
    const pos = this.root.position;
    if (Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
      this.lastGoodX = pos.x;
      this.lastGoodZ = pos.z;
    } else {
      pos.set(this.lastGoodX, this.groundY, this.lastGoodZ);
      this.motionOverride = null;
      enemyPositionRepairs++;
    }

    // Timers ---------------------------------------------------------------
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.rootTimer = Math.max(0, this.rootTimer - dt);
    this.holds.tick(dt);
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
      this.confusedSwing = Math.max(0, this.confusedSwing - dt);
      if (brain.confusedFoe) this.tickConfusion(brain.confusedFoe, ctx);
    }

    // Affixes ---------------------------------------------------------------
    if (this.affixes.length) this.tickAffixes(dt, ctx);
    this.miniBoss?.tick(dt, ctx);
    if (!this.alive) return;

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
    if (!this.inView) {
      this.poseDt = 0;
      this.poseTick = this.poseSlot;
    } else {
      this.poseDt = Math.min(0.1, this.poseDt + dt);
      if (++this.poseTick >= this.poseEvery) this.solvePose(ctx.elapsed);
    }
    if (this.aura) {
      this.aura.rotation.z += dt * 0.9;
      const s = 1 + Math.sin(ctx.elapsed * 2.6) * 0.06;
      this.aura.scale.setScalar(this.hitRadius * 2.6 * s);
    }
  }

  /** Seconds to this monster's next blow while confused. */
  private confusedSwing = 0;

  /**
   * Mass Confusion: a confused monster that has reached another monster
   * strikes it with its own blow (its rolled damage, at its own attack
   * pace). The brain walked it there and starts nothing else meanwhile.
   */
  private tickConfusion(foe: Enemy, ctx: CombatContext): void {
    if (this.confusedSwing > 0 || this.inst || !foe.alive || foe.disposed || !this.hasStatus('confused')) return;
    for (const st of this.statuses) if (statusDef(st.id)?.incapacitates) return;
    const p = this.root.position;
    const q = foe.root.position;
    const reach = this.hitRadius + foe.hitRadius + 1.1 * this.sizeScale;
    if ((p.x - q.x) ** 2 + (p.z - q.z) ** 2 > reach * reach) return;
    this.confusedSwing = 1.3 / this.actionSpeed();
    this.facing = angleTo(p.x, p.z, q.x, q.z);
    this.setAction('attack', 0.4);
    const amount = ctx.rng.range(this.stats.minDamage, this.stats.maxDamage);
    foe.takeDamage({ amount, type: 'physical', crit: false, source: this.id, ability: tr('Confused'), from: { x: p.x, z: p.z } }, ctx);
  }

  /** Solves the living pose for the time gathered since the last solve. */
  private solvePose(elapsed: number): void {
    const dt = this.poseDt;
    this.poseTick = 0;
    this.poseDt = 0;
    const o = _drive;
    o.locomotion = this.locomotion;
    o.action = this.spawnT > 0 ? 'spawn' : this.action;
    o.actionT = this.spawnT > 0 ? 1 - this.spawnT : this.actionT;
    o.time = elapsed;
    o.deathT = 0;
    this.rig?.update(dt, o);
  }

  private get currentSpeed(): number {
    // The brain's own pace: a rusher sprinting in, a shaken pack faltering.
    let s = this.baseSpeed * this.buffMul('speed') * (this.ai?.speedMul ?? 1);
    if (!this.isBoss) s = Math.min(s * MOVE_SCALE, CHASE_SPEED_CAP);
    for (let si = 0; si < this.statuses.length; si++) {
      const st = this.statuses[si]!;
      const d = statusDef(st.id);
      if (!d) continue;
      // Anything the catalogue says cuts move speed does, rather than the two
      // ids this used to name. `immobilises` stops it dead.
      if (d.immobilises || d.incapacitates) return 0;
      const slow = (st.mods ?? d.mods)?.moveSpeed;
      if (typeof slow === 'number' && slow < 0) s *= Math.max(0.15, 1 + (slow / 100) * modScale(!!st.mods, st.magnitude, st.stacks));
    }
    if (this.inst && this.inst.phase === 'recovery') s *= 0.4;
    // Backing off, fleeing or falling back is never quicker than this, so a
    // hasted archer or a wounded runner can always be caught on foot.
    const m = this.ai?.mode;
    if (!this.isBoss && (m === 'kite' || m === 'flee' || m === 'regroup')) s = Math.min(s, RETREAT_SPEED_CAP);
    return s;
  }

  protected moveBy(dx: number, dz: number, ctx: CombatContext): void {
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
    if (m.t === 0 && m.kind === 'leap') events.emit('sfx', { id: 'jump', x: this.root.position.x, z: this.root.position.z });
    m.t += dt;
    const k = clamp(m.t / m.duration, 0, 1);
    const p = this.root.position;
    const nx = m.fromX + (m.toX - m.fromX) * k;
    const nz = m.fromZ + (m.toZ - m.fromZ) * k;
    // A shove, a throw or a drag stops where a wall or a prop is in the way,
    // so a body never ends inside one, however short the move.
    if (m.kind === 'knock' && this.knockBlocked(p.x, p.z, nx, nz, ctx)) {
      this.motionOverride = null;
      return;
    }
    p.x = nx;
    p.z = nz;
    p.y = this.groundY + (m.arc > 0 ? Math.sin(k * Math.PI) * m.arc : 0);
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
      p.y = this.groundY;
      const land = m.onLand;
      this.motionOverride = null;
      // A body coming down from a leap is heard landing.
      if (m.kind === 'leap') events.emit('sfx', { id: 'land', x: p.x, z: p.z, pitch: 1 / Math.max(0.7, Math.min(1.6, this.sizeScale)) });
      land?.(this, ctx);
    }
  }

  /** True when a body moving from (x, z) to (nx, nz) would meet a wall or end inside a prop. */
  private knockBlocked(x: number, z: number, nx: number, nz: number, ctx: CombatContext): boolean {
    try {
      if (!ctx.nav.lineOfSight(x, z, nx, nz)) return true;
    } catch {
      /* no grid: nothing to stop it */
    }
    const bl = ctx.blockers;
    if (!bl) return false;
    const r = this.hitRadius * 0.5;
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i]!;
      const hw = b.w * 0.5 + r;
      const hd = b.d * 0.5 + r;
      // Into a prop it was not already against.
      if (Math.abs(nx - b.x) < hw && Math.abs(nz - b.z) < hd && !(Math.abs(x - b.x) < hw && Math.abs(z - b.z) < hd)) return true;
    }
    return false;
  }

  /** True when any status with this tag is running. Used by passive queries. */
  hasStatusTag(tag: string): boolean {
    for (let si = 0; si < this.statuses.length; si++) {
      const s = this.statuses[si]!;
      const def = statusDef(s.id);
      if (def?.tags?.includes(tag as never)) return true;
    }
    return false;
  }

  /** True when the named status is running. */
  hasStatus(id: string): boolean {
    // Plain loops: these run per monster per step, and a closure per call adds up.
    for (let si = 0; si < this.statuses.length; si++) {
      const s = this.statuses[si]!;
      if (s.id === id) return true;
    }
    return false;
  }

  /** How many stacks of a status are running. Zero when it is not. */
  stacksOf(id: string): number {
    for (let si = 0; si < this.statuses.length; si++) {
      const s = this.statuses[si]!;
      if (s.id === id) return s.stacks ?? 0;
    }
    return 0;
  }

  /** Ends a status outright and says how many stacks it had (the Paladin spends his dents). */
  /** Removes an effect and returns the damage it had left to deal. Gorefeast. */
  /**
   * The curses on this monster, as fresh applications at their full time:
   * what Contagion and Corpse Explosion hand on to the pack.
   */
  cursesCarried(): StatusApplication[] {
    const out: StatusApplication[] = [];
    for (const s of this.statuses) {
      const def = getStatus(s.id);
      if (!def || !def.tags.includes('curse')) continue;
      out.push({
        id: s.id,
        duration: s.full ?? def.baseDuration ?? Math.max(1, s.time),
        magnitude: s.magnitude,
        stacks: s.stacks,
        ...(s.mods ? { mods: s.mods } : {}),
      });
    }
    return out;
  }

  /** Seconds left on a status, or 0 when it is not running. */
  statusLeft(id: string): number {
    for (let si = 0; si < this.statuses.length; si++) {
      const s = this.statuses[si]!;
      if (s.id === id) return s.time;
    }
    return 0;
  }

  /** How many of the named statuses are running, each counted once. Hex Upon Hex. */
  countStatuses(ids: ReadonlySet<string>): number {
    let n = 0;
    for (let si = 0; si < this.statuses.length; si++) {
      const s = this.statuses[si]!;
      if (ids.has(s.id)) n++;
    }
    return n;
  }

  drainStatus(id: string): number {
    for (let i = 0; i < this.statuses.length; i++) {
      const s = this.statuses[i]!;
      if (s.id !== id) continue;
      this.statuses.splice(i, 1);
      return Math.max(0, s.dotPerSecond * s.stacks * s.time);
    }
    return 0;
  }

  consumeStatus(id: string): number {
    for (let i = 0; i < this.statuses.length; i++) {
      const s = this.statuses[i]!;
      if (s.id !== id) continue;
      this.statuses.splice(i, 1);
      return s.stacks ?? 0;
    }
    return 0;
  }

  /** True when anything the player put on it is still running. */
  get isDebuffed(): boolean {
    for (let si = 0; si < this.statuses.length; si++) {
      const s = this.statuses[si]!;
      const def = statusDef(s.id);
      if (def && def.polarity < 0) return true;
    }
    return false;
  }

  /** True when a bleed is running — the condition several passives read. */
  get isBleeding(): boolean {
    for (let si = 0; si < this.statuses.length; si++) {
      const s = this.statuses[si]!;
      if (s.dotType === 'physical') return true;
      const def = statusDef(s.id);
      if (def?.dot?.type === 'physical') return true;
    }
    return false;
  }

  // --- statuses ------------------------------------------------------------

  /**
   * How long a stun, freeze or root really holds this monster: every hold
   * shortens the next, by the rule the hero is held by too
   * (`StatusRules.HoldFade`). A boss is never held this way: it turns control
   * into poise (`absorbControl`, sim/Poise.ts).
   */
  private controlFor(duration: number): number {
    return this.holds.take(duration);
  }

  /**
   * Takes a stun, freeze or root some other way than being held by it. True
   * when it did, and the control must not land. A boss builds poise.
   */
  protected absorbControl(_app: StatusApplication, _ctx: CombatContext): boolean {
    return false;
  }

  /**
   * Holds it fast for `seconds`, past any fade, and cuts short any wind-up:
   * a boss whose poise broke. Counts as stunned for everything that asks.
   */
  protected holdFast(seconds: number, ctx: CombatContext): void {
    const s = this.statuses.find((x) => x.id === 'stunned');
    if (s) s.time = Math.max(s.time, seconds);
    else this.statuses.push({ id: 'stunned', time: seconds, magnitude: 1, stacks: 1, dotType: null, dotPerSecond: 0 });
    this.rootTimer = Math.max(this.rootTimer, seconds);
    this.interrupt(ctx, true);
  }

  /**
   * Puts statuses on it by the one rule book (`StatusRules.ts`): a short name
   * finds its entry, a second application resolves by the entry's stacking,
   * holds wear off, and a damage over time ticks on the depth curve.
   */
  applyStatuses(list: StatusApplication[], ctx: CombatContext): void {
    for (const raw of list) {
      const def = statusDef(raw.id);
      if (!def) continue;
      const hold = isHold(def);
      // Only a hold that stops the body (a stun, a freeze, a root, a fall)
      // pins it. Fear and confusion the brain walks (it runs, or turns on its
      // own kind); blind, silence and disarm take its eyes, its spells or its
      // weapon, and leave its legs (`AI.think`, `AI.chooseAbility`).
      const pins = hold && (!!def.incapacitates || !!def.immobilises);
      if (this.isImmuneToControl && hold) continue;
      if (hold && this.absorbControl(raw, ctx)) continue;
      const duration = hold ? this.controlFor(durationOf(def, raw)) : durationOf(def, raw);
      if (duration <= 0.05) continue;
      const app = { ...raw, id: def.id, duration };
      // Passives may raise the ceiling on a stacking affliction.
      const cap = stackCap(def, app);
      const existing = this.statuses.find((s) => s.id === app.id);
      if (existing) {
        const run = { remaining: existing.time, duration: existing.full ?? existing.time, magnitude: existing.magnitude, stacks: existing.stacks };
        reapply(def, run, app.duration, app.magnitude, app.stacks ?? 0, cap);
        existing.time = run.remaining;
        existing.magnitude = run.magnitude;
        existing.stacks = run.stacks;
        // A harder blow's venom takes over from a weaker one. `dotRate` folds
        // the tick scale in once; multiplying the running rate by it on every
        // re-apply grew a poison or burn without limit.
        if (existing.dotType) existing.dotPerSecond = Math.max(existing.dotPerSecond, dotRate(def, this.depth, app));
        if (app.mods) existing.mods = app.mods;
        if (app.burstPct) {
          existing.burst = Math.max(existing.burst ?? 0, app.burstPct);
          existing.full = Math.max(existing.full ?? 0, app.duration);
        }
        if (app.holdBelow) existing.holdBelow = Math.max(existing.holdBelow ?? 0, app.holdBelow);
        // A second hold keeps it held as long as the hero would be.
        if (pins) this.rootTimer = Math.max(this.rootTimer, existing.time);
        continue;
      }
      const dotType = def.dot?.type ?? null;
      this.statuses.push({
        id: app.id,
        time: app.duration,
        magnitude: app.magnitude,
        stacks: Math.min(cap, app.stacks ?? 1),
        dotType,
        dotPerSecond: dotType ? dotRate(def, this.depth, app) : 0,
        ...(app.mods ? { mods: app.mods } : {}),
        ...(app.burstPct ? { burst: app.burstPct, full: app.duration } : {}),
        ...(app.holdBelow ? { holdBelow: app.holdBelow } : {}),
      });
      if (hold) {
        if (pins) this.rootTimer = Math.max(this.rootTimer, app.duration);
        this.interrupt(ctx);
      }
    }
  }

  private get isImmuneToControl(): boolean {
    return this.affixes.some((a) => a.behavior === 'juggernaut');
  }

  /**
   * The monster's stats with every active status folded in.
   *
   * Rebuilt on the hit rather than cached: a monster is hit a handful of times
   * a second at most, and a cache here is a stale-resistance bug waiting to
   * happen. Returns the base object untouched when nothing is active, which is
   * the overwhelmingly common case.
   */
  private statusAdjustedStats(): Stats {
    let out: Stats | null = null;
    for (let si = 0; si < this.statuses.length; si++) {
      const s = this.statuses[si]!;
      const own = s.mods;
      const mods = own ?? statusDef(s.id)?.mods;
      if (!mods) continue;
      if (!out) out = { ...this.stats };
      // A rank's own numbers are already the full effect; only the def's
      // reference numbers scale by magnitude.
      const scale = own ? s.stacks : s.magnitude * s.stacks;
      for (const [k, v] of Object.entries(mods)) {
        const key = k as keyof Stats;
        if (typeof v !== 'number') continue;
        (out[key] as number) = ((out[key] as number) ?? 0) + v * scale;
      }
    }
    return out ?? this.stats;
  }

  private tickStatuses(dt: number, ctx: CombatContext): void {
    for (let i = this.statuses.length - 1; i >= 0; i--) {
      const s = this.statuses[i]!;
      // Unrelenting: a bleed on a target low enough does not run out.
      if (!(s.holdBelow && (this.life / Math.max(1, this.maxLife)) * 100 < s.holdBelow)) s.time -= dt;
      if (s.dotType && s.dotPerSecond > 0) {
        const amount = s.dotPerSecond * s.stacks * dt;
        this.life -= amount;
        // Damage over time was completely silent. A poison that visibly ticks
        // is the difference between "this does nothing" and "this is working".
        // Accumulated and shown about twice a second — one number per frame
        // would be a green blizzard.
        this.dotAccum += amount;
        this.dotShow -= dt;
        if (this.dotShow <= 0 && this.dotAccum >= 1) {
          events.emit('enemy:damaged', {
            id: this.id,
            amount: this.dotAccum,
            type: s.dotType,
            crit: false,
            x: this.root.position.x,
            y: this.centerY + 0.25,
            z: this.root.position.z,
          });
          this.dotAccum = 0;
          this.dotShow = 0.55;
        }
        if (ctx.rng.next() < dt * 3) {
          ctx.fx.burst(s.dotType === 'poison' ? 'poison' : s.dotType === 'fire' ? 'hit.fire' : MATERIAL_BURST[hitMaterial(this.family)],
            this.root.position.x, this.centerY, this.root.position.z, { count: 2, color: typeColor(s.dotType) });
        }
      }
      if (s.time <= 0) {
        // Gash: the wound bursts as it closes.
        if (s.burst && s.full && s.dotPerSecond > 0) {
          const amount = s.dotPerSecond * s.stacks * s.full * (s.burst / 100);
          this.life -= amount;
          events.emit('enemy:damaged', {
            id: this.id, amount, type: s.dotType ?? 'physical', crit: false,
            x: this.root.position.x, y: this.centerY + 0.25, z: this.root.position.z,
          });
          // It bursts where you can see it, not only in the numbers.
          ctx.fx.burst('blood', this.root.position.x, this.centerY, this.root.position.z, { count: 30, scale: 1.4 });
        }
        this.statuses.splice(i, 1);
      }
    }
    if (this.life <= 0 && this.alive) this.die(ctx);
  }

  // --- damage --------------------------------------------------------------

  /** Combo memory (`Combos.ts`): the last skill of yours that hit this, and when. */
  lastSkillHit = '';
  lastSkillHitAt = -99;

  /** A combo landed: say so over the target and deliver the class's follow-up. */
  private onCombo(hit: ComboHit, ctx: CombatContext): void {
    const p = this.root.position;
    const c = hit.combo;
    ctx.fx.damageNumber(`${c.name}!`, p.x, this.centerY + 0.9, p.z, c.color, true);
    ctx.fx.burst('crit', p.x, this.centerY, p.z, { count: 14, color: c.color });
    events.emit('combat:combo', {
      id: this.id,
      name: c.name,
      setup: hit.setup,
      payoff: hit.payoff.id,
      bonusPct: hit.bonusPct,
      x: p.x,
      y: this.centerY,
      z: p.z,
    });
    // On a boss the stagger builds poise instead (applyStatuses).
    if (c.stagger) this.applyStatuses([{ id: 'stunned', duration: c.stagger, magnitude: 1 }], ctx);
    if (c.arc) {
      let best: Enemy | null = null;
      let bestD = 6;
      for (const e of ctx.enemies) {
        if (e === this || !e.alive) continue;
        const d = Math.hypot(e.root.position.x - p.x, e.root.position.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      if (best) {
        ctx.fx.burst('shock', best.root.position.x, best.centerY, best.root.position.z, { count: 10, color: c.color });
        best.takeDamage(
          { amount: hit.packet.amount * c.arc, type: hit.packet.type, crit: false, source: 'player', ability: c.name },
          ctx,
        );
      }
    }
  }

  /**
   * How hard a weapon blow is to land on this body (`hitChance` in
   * sim/Combat.ts): the attack rating a hero of its level usually has, grown
   * by how armoured it stands for its depth right now. Rank, armoured kinds,
   * affixes, defense buffs and breaks all count. The square root keeps a
   * walking fortress hard to hit, never untouchable.
   */
  /** The hero's blow missed: the body sways out of its line. */
  evade(): void {
    this.rig?.creature.evade();
  }

  guard(): number {
    const usual = depthCurve(this.depth).defense;
    const now = this.statusAdjustedStats().defense * this.buffMul('defense');
    return usualAttackRating(this.level) * Math.sqrt(Math.max(0.1, now / Math.max(1, usual)));
  }

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

    // Item powers (conversion, slayer bonuses, life tap) shape the player's blow.
    if (packet.source === 'player' && powerHooks.outgoing) packet = powerHooks.outgoing(this, packet, ctx);
    let working = packet;
    // Combos: a different skill landing on the heels of another hits harder.
    if (packet.source === 'player') {
      const combo = resolveCombo(working, this, ctx.elapsed);
      if (combo) {
        working = combo.packet;
        this.onCombo(combo, ctx);
      }
    }
    // Adaptive: hardens against an element that keeps landing.
    const adapt = this.affixes.find((a) => a.behavior === 'adaptive');
    if (adapt) working = this.adapt(working, adapt, ctx);

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
      // Mitigate against the stats as they are *right now*, debuffs included.
      // Shred effects — scorched, brittle, unmade, vulnerable — are authored as
      // flat resistance modifiers and were being computed against the monster's
      // untouched base stats, so lowering a resistance lowered nothing.
      // Defense buffs and debuffs (a barrier breaking, a stuck executioner)
      // scale armour for this hit.
      let st = this.statusAdjustedStats();
      const defMul = this.buffMul('defense');
      if (defMul !== 1) st = { ...st, defense: st.defense * defMul };
      const res = mitigate(working, st, ctx.rng);
      taken = res.amount;
      type = res.type;
    } catch {
      taken = working.amount;
    }
    taken *= 1 - clamp(this.buffSum('absorb'), 0, 0.9);
    taken *= this.buffMul('taken');
    // A tank braced behind its guard turns blows aside from the front. Hit it
    // from the side or the back, or while it is committed to a swing.
    if (this.braced && working.source === 'player') {
      const h = ctx.heroPos ?? ctx.playerPos;
      const from = angleTo(this.root.position.x, this.root.position.z, h.x, h.z);
      if (Math.abs(angleDelta(this.facing, from)) < TANK_GUARD_ARC) {
        taken *= 1 - TANK_GUARD_CUT;
        ctx.fx.burst('hit.physical', this.root.position.x, this.centerY, this.root.position.z, {
          count: 4,
          color: 0xc0c8d8,
        });
      }
    }
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

    // What the body actually had to give: reflect works off this, so a blow
    // far past zero does not come back bigger than the monster was.
    const absorbed = Math.min(taken, Math.max(0, this.life));
    this.life -= taken;
    // How far past zero the blow landed. Cataclysm carries this to the pack.
    this.overkill = this.life < 0 ? -this.life : 0;
    this.lastDamagedAt = ctx.elapsed;
    this.killedBy = type;
    this.hitFlash = 1;

    events.emit('enemy:damaged', {
      id: this.id,
      amount: taken,
      type,
      // A conversion (Transformer, a combo) makes the whole hit one element.
      parts: type === working.type ? working.parts : undefined,
      crit: working.crit,
      x: this.root.position.x,
      y: this.centerY,
      z: this.root.position.z,
    });
    // What flies off depends on what the body is made of (fx/Effects).
    const mat = hitMaterial(this.family);
    ctx.fx.burst(type === 'physical' ? MATERIAL_BURST[mat] : `hit.${type}`, this.root.position.x, this.centerY, this.root.position.z, {
      count: working.crit ? 20 : 10,
      color: typeColor(type),
    });
    // Mark the floor. Hits used to be pure particles, so a fight left no trace
    // and the only blood on the ground was one pool where something died.
    const mark = MATERIAL_MARK[mat];
    if (type === 'physical' && mark && ctx.rng.chance(working.crit ? 0.9 : 0.45)) {
      ctx.decals.splatter(
        mark,
        this.root.position.x, this.root.position.z,
        (working.crit ? 0.55 : 0.36) * this.sizeScale,
        working.crit ? 3 : 1,
      );
    }

    // Reactions -------------------------------------------------------------
    this.ai?.onDamaged(ctx);
    this.interrupt(ctx);
    if (this.action !== 'attack' && !this.busy) this.setAction('hit', 0.28);
    // Shoved: a quick slide away from where the blow came from, as far as
    // it says (`KNOCKBACK_METRES` a point), stopped by walls and props
    // (`tickMotion`). A body already sliding is not shoved again, so a spray
    // of arrows shoves it once, as its tooltip says.
    if (working.knockback && !this.isImmuneToControl && !this.isBoss && !this.motionOverride) {
      const from = working.from ?? ctx.playerPos;
      const a = angleTo(from.x, from.z, this.root.position.x, this.root.position.z);
      const push = (clamp(working.knockback, 0, 6) * KNOCKBACK_METRES) / Math.max(0.6, this.sizeScale);
      const p = this.root.position;
      if (push > 0.05) {
        this.motionOverride = {
          kind: 'knock', fromX: p.x, fromZ: p.z, toX: p.x + Math.sin(a) * push, toZ: p.z + Math.cos(a) * push,
          t: 0, duration: 0.1 + push * 0.07, arc: 0,
        };
      }
    }
    if (working.applies?.length) this.applyStatuses(venomOf(working, working.applies), ctx);

    // Elements leave a mark. A skill that names its own statuses above keeps
    // them; everything else afflicts whatever its damage type is made of, which
    // is what makes fire different from cold rather than a resistance lookup.
    if (taken > 0 && working.source === 'player' && !working.applies?.length) {
      const affliction = ELEMENT_AFFLICTION[type];
      const chance = AFFLICTION_CHANCE[type] ?? 0;
      if (affliction && ctx.rng.chance(chance)) {
        const def = statusDef(affliction);
        this.applyStatuses(
          venomOf(working, [{ id: affliction, duration: def?.baseDuration ?? 4, magnitude: 1, stacks: 1 }]),
          ctx,
        );
      }
      // A critical blow shreds as well as hurts, which is what the shred tier
      // of the catalogue is for and what makes a crit worth more than a number.
      const shred = working.crit ? CRIT_SHRED[type] ?? undefined : undefined;
      if (shred) {
        const def = statusDef(shred);
        this.applyStatuses(
          [{ id: shred, duration: def?.baseDuration ?? 6, magnitude: 1, stacks: 1 }],
          ctx,
        );
      }
    }

    // Retaliation affixes ---------------------------------------------------
    for (const a of this.affixes) {
      if (a.behavior === 'thorns' && (working.ability === undefined || working.ability === 'melee')) {
        const back = rollPacket(this, ctx, (a.params?.ratio ?? 0.18) * 0.6, 'physical', 'thorns');
        back.amount = taken * (a.params?.ratio ?? 0.18);
        ctx.damagePlayer(back);
      } else if (a.behavior === 'reflect_damage') {
        const back = rollPacket(this, ctx, 0.1, working.type, 'reflect');
        back.amount = absorbed * (a.params?.ratio ?? 0.2);
        ctx.damagePlayer(back);
      } else if (a.behavior === 'splintering' && working.source === 'player' && taken >= this.maxLife * (a.params?.share ?? 0.06) &&
        ctx.elapsed >= this.splinterAt) {
        // A heavy blow knocks a shard loose; it comes down near the hero.
        this.splinterAt = ctx.elapsed + (a.params?.cooldown ?? 0.7);
        const hero = ctx.heroPos ?? ctx.playerPos;
        const ang = ctx.rng.next() * Math.PI * 2;
        const off = ctx.rng.next() * 1.4;
        const tx = hero.x + Math.sin(ang) * off;
        const tz = hero.z + Math.cos(ang) * off;
        const r = a.params?.radius ?? 1.3;
        const delay = a.params?.delay ?? 0.8;
        ctx.fx.burst('chips.stone', this.root.position.x, this.centerY, this.root.position.z, { count: 10, color: a.color });
        const tel = tell(this, ctx, 'circle', tx, tz, r, 0, delay, a.color);
        const self = this;
        after(delay, (c) => {
          tel.cancel();
          circleHit(self, c, tx, tz, r, a.params?.mul ?? 0.9, 'physical', 'splintering', {
            applies: [{ id: 'bleed', duration: 3, magnitude: 1, stacks: 1 }],
          });
        });
      } else if (a.behavior === 'illusionist' && ctx.rng.chance(0.06)) {
        summon(this, ctx, 'mirror_image', a.params?.count ?? 2, 2.2);
      }
    }

    // Item powers that act once a blow has landed: leech, chill, cleave, echo.
    if (working.source === 'player' && powerHooks.afterHit) powerHooks.afterHit(this, working, taken, ctx);

    if (this.life <= 0) this.die(ctx);
  }

  /** True while this monster is a tank with its guard up (not mid-swing). */
  get braced(): boolean {
    return !this.isBoss && this.ai?.archetype === 'tank' && !this.busy && this.rootTimer <= 0;
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
      events.emit('toast', { text: tr('{0} rises again!', this.name), kind: 'bad' });
      return;
    }

    this.alive = false;
    this.life = 0;
    this.deathT = 0;
    this.inst?.telegraph?.cancel();
    this.inst = null;
    this.motionOverride = null;

    const p = this.root.position;
    const mat = hitMaterial(this.family);
    ctx.fx.burst(MATERIAL_BURST[mat], p.x, this.centerY, p.z, {
      count: 26,
      color: this.def.visual.glow ?? 0xaa2020,
    });
    if (mat === 'stone' || mat === 'ether') {
      ctx.decals.splatter('ash', p.x, p.z, 0.7 * this.sizeScale, 3);
    } else if (mat === 'bone') {
      ctx.decals.splatter('bone', p.x, p.z, 0.7 * this.sizeScale, 3);
    } else if (mat === 'ichor') {
      ctx.decals.splatter('stain', p.x, p.z, 0.75 * this.sizeScale, 3);
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
    this.miniBoss?.onDeath(ctx);

    events.emit('enemy:killed', {
      id: this.id,
      monsterId: this.monsterId,
      rank: this.rank,
      x: p.x,
      z: p.z,
    });

    // A pack that watches its leader fall falters for a moment. Killing the
    // champion first is a choice the player can make, and it should pay.
    if (this.isElite && this.packId >= 0) {
      for (const ally of alliesNear(ctx, p.x, p.z, 18, this.id)) {
        if (ally.packId === this.packId && !ally.isElite) ally.ai?.shake(LEADER_FALL_SHAKE);
      }
    }

    // Avenger: the pack gets angrier every time one of them falls.
    for (const ally of alliesNear(ctx, p.x, p.z, 16, this.id)) {
      const av = ally.affixes.find((a) => a.behavior === 'avenger');
      if (av) ally.stackAvenger(av.params?.perDeath ?? 0.15, av.params?.cap ?? 1.8);
    }

    // Funereal: a packmate that watches this one fall lights the body.
    for (const ally of alliesNear(ctx, p.x, p.z, 14, this.id)) {
      const fu = ally.affixes.find((a) => a.behavior === 'funereal');
      if (fu) ally.lightTheDead(p.x, p.z, fu, ctx);
    }
  }

  /** Funereal: marks a fallen packmate's body, which bursts a beat later. */
  lightTheDead(x: number, z: number, a: MonsterAffixDef, ctx: CombatContext): void {
    const params = a.params ?? {};
    if (!this.alive || ctx.elapsed < this.funeralAt) return;
    if (dist(x, z, this.root.position.x, this.root.position.z) > (params.range ?? 14)) return;
    this.funeralAt = ctx.elapsed + (params.cooldown ?? 1.2);
    const r = params.radius ?? 3;
    const delay = params.delay ?? 1.0;
    const tel = tell(this, ctx, 'circle', x, z, r, 0, delay, a.color);
    const self = this;
    after(delay, (c) => {
      tel.cancel();
      if (!self.alive) return;
      c.fx.burst('frost', x, 0.6, z, { count: 34, scale: 2.2, color: a.color });
      circleHit(self, c, x, z, r, params.mul ?? 1.6, 'cold', 'funereal');
    });
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
          const tel = tell(this, ctx, 'circle', p.x, p.z, r, 0, a.params?.delay ?? 0.9, a.color);
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
        case 'restless': {
          // Its ghost climbs out of the body a beat later: a harmless notice
          // first, then a fast, frail shade that hits cold.
          const delay = a.params?.delay ?? 1.2;
          const x = p.x;
          const z = p.z;
          ctx.decals.cue('ring', x, z, 1.2 * this.sizeScale, 0, delay, a.color);
          const self = this;
          const life = a.params?.life ?? 0.6;
          after(delay, (c) => {
            c.fx.burst('void', x, 1.0, z, { count: 26, color: a.color });
            for (const k of summon(self, c, 'restless_shade', 1, 0.2)) {
              k.packId = self.packId;
              k.life = k.maxLife * life;
            }
          });
          break;
        }
        case 'splitter': {
          // Plain copies, so a split never splits again.
          const kids = summon(this, ctx, this.monsterId, a.params?.count ?? 2, 1.4);
          for (const k of kids) k.packId = this.packId;
          ctx.fx.burst('blood', p.x, this.centerY, p.z, { count: 30, color: a.color });
          break;
        }
        default:
          break;
      }
    }
  }

  /** Adaptive affix: tracks hits by element and hardens against a repeated one. */
  private adapt(packet: DamagePacket, a: MonsterAffixDef, ctx: CombatContext): DamagePacket {
    const params = a.params ?? {};
    const now = ctx.elapsed;
    if (this.adapted && now < this.adapted.until && this.adapted.type === packet.type) {
      ctx.fx.burst('shock', this.root.position.x, this.centerY, this.root.position.z, { count: 3, color: a.color });
      return { ...packet, amount: packet.amount * (1 - (params.resist ?? 45) / 100) };
    }
    const window = params.window ?? 3;
    this.adaptHits.push({ type: packet.type, t: now });
    while (this.adaptHits.length && now - this.adaptHits[0]!.t > window) this.adaptHits.shift();
    if (this.adaptHits.length > 12) this.adaptHits.shift();
    let same = 0;
    for (const h of this.adaptHits) if (h.type === packet.type) same++;
    if (same >= (params.hits ?? 4)) {
      this.adapted = { type: packet.type, until: now + (params.duration ?? 6) };
      this.adaptHits.length = 0;
      ctx.fx.burst('heal', this.root.position.x, this.centerY, this.root.position.z, { count: 16, color: typeColor(packet.type) });
    }
    return packet;
  }

  /** The element an Adaptive monster has hardened against right now, if any. */
  adaptedTo(now: number): DamageType | null {
    return this.adapted && now < this.adapted.until ? this.adapted.type : null;
  }

  private tickDeath(dt: number, ctx: CombatContext): void {
    this.deathT += dt * 1.25;
    const k = Math.min(1, this.deathT);
    const o = _drive;
    o.locomotion = 0;
    o.action = 'death';
    o.actionT = k;
    o.time = ctx.elapsed;
    o.deathT = k;
    this.rig?.update(dt, o);
    // Collapse, then sink and shrink away — no per-instance material clone
    // needed, which keeps the shared-material contract intact.
    if (this.deathT > 1) {
      const s = Math.max(0, 1 - (this.deathT - 1) * 1.6);
      this.bodyRoot.scale.setScalar(this.sizeScale * (0.6 + s * 0.4));
      this.root.position.y = this.groundY - (1 - s) * 1.4 * this.sizeScale;
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
      // A follow-up affix fires straight away when the hero has just been
      // pinned by anything: the trap springs and the shell lands on it.
      if (brainAwake && a.behavior && COMBO_FOLLOWUPS.has(a.behavior) && heroControlled(ctx) &&
        ctx.elapsed >= (this.comboAt[i] ?? 0)) {
        this.affixTimers[i] = 0;
        this.comboAt[i] = ctx.elapsed + COMBO_COOLDOWN;
      }
      const ready = (this.affixTimers[i] ?? 0) <= 0;
      const params = a.params ?? {};

      switch (a.behavior) {
        case 'berserker':
          this.outgoingMul = 1 + (1 - this.lifeFraction) * ((params.maxBonus ?? 1.8) - 1);
          break;
        case 'regenerating':
          if (ctx.elapsed - this.lastDamagedAt > (params.delay ?? 3) && !this.hasStatus('grasped')) {
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
          const tel = tell(this, ctx, 'circle', tx, tz, params.radius ?? 2.6, 0, 0.9, a.color);
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
          const tel = tell(this, ctx, 'ring', tx, tz, 1.8, 0, 0.8, a.color);
          const self = this;
          after(0.8, (c) => {
            tel.cancel();
            if (dist(tx, tz, c.playerPos.x, c.playerPos.z) < 1.8) {
              const packet = rollPacket(self, c, 0.15, 'arcane', 'jailer');
              packet.applies = [{ id: 'root', duration: params.duration ?? 1.6, magnitude: 1 }];
              noteControl(c, packet);
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
          noteControl(ctx, packet);
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
          noteControl(ctx, packet);
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
        case 'desecrator': {
          if (!ready || !brainAwake) break;
          if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) > 16) break;
          this.affixTimers[i] = params.interval ?? 5;
          const tx = ctx.playerPos.x;
          const tz = ctx.playerPos.z;
          const r = params.radius ?? 2.2;
          const delay = params.delay ?? 0.9;
          const tel = tell(this, ctx, 'circle', tx, tz, r, 0, delay, a.color);
          const self = this;
          after(delay, (c) => {
            tel.cancel();
            if (!self.alive) return;
            spawnHazard(self, c, tx, tz, r, params.dps ?? 0.5, 'arcane', a.id, {
              duration: params.life ?? 7,
              tickRate: 2,
              color: a.color,
            });
          });
          break;
        }
        case 'fire_chains': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = 0.25;
          const range = params.range ?? 12;
          let links = 0;
          for (const ally of alliesNear(ctx, p.x, p.z, range, this.id)) {
            if (links >= (params.links ?? 2)) break;
            if (this.packId < 0 || ally.packId !== this.packId) continue;
            // Both ends chained? Only one of them burns the link.
            if (ally.affixes.some((x) => x.behavior === 'fire_chains') && ally.id < this.id) continue;
            links++;
            const q = ally.root.position;
            if (distToSegment(ctx.playerPos.x, ctx.playerPos.z, p.x, p.z, q.x, q.z) < (params.width ?? 0.7)) {
              hitPlayer(this, ctx, params.mul ?? 0.22, 'fire', a.id);
            }
            const k = ctx.rng.next();
            ctx.fx.burst('embers', p.x + (q.x - p.x) * k, 0.9, p.z + (q.z - p.z) * k, { count: 3, color: a.color });
          }
          break;
        }
        case 'bulwark': {
          if (!ready) break;
          this.affixTimers[i] = 1;
          for (const ally of alliesNear(ctx, p.x, p.z, params.radius ?? 7, this.id)) {
            ally.buff('bulwark', 1.3, { absorb: params.absorb ?? 0.4 });
          }
          if (brainAwake) ctx.fx.burst('heal', p.x, this.centerY + 0.4, p.z, { count: 3, color: a.color });
          break;
        }
        case 'lancer': {
          if (!ready || !brainAwake || this.busy || this.motionOverride || this.rootTimer > 0) break;
          const d = dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
          if (d < (params.minRange ?? 5) || d > (params.range ?? 14)) break;
          this.affixTimers[i] = params.interval ?? 7;
          const windup = params.windup ?? 1.0;
          const ang = angleTo(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
          const len = d + 3;
          const tx = p.x + Math.sin(ang) * len;
          const tz = p.z + Math.cos(ang) * len;
          this.facing = ang;
          this.rootTimer = windup;
          const tel = tell(this, ctx, 'line', p.x, p.z, len, ang, windup, a.color);
          const self = this;
          after(windup, (c) => {
            tel.cancel();
            if (!self.alive) return;
            dashToward(self, c, tx, tz, 17, { trample: { mul: params.mul ?? 1.8, radius: 0.9, type: 'physical' } });
          });
          break;
        }
        case 'lampblack': {
          if (!ready || !brainAwake) break;
          const every = params.interval ?? 0.5;
          this.affixTimers[i] = every;
          const r = params.radius ?? 6;
          // The soot's reach, drawn as a harmless ring: it hurts nothing, it snuffs.
          ctx.decals.cue('ring', p.x, p.z, r, 0, every + 0.1, a.color);
          if (ctx.rng.chance(0.6)) {
            const ang = ctx.rng.next() * Math.PI * 2;
            const d = r * Math.sqrt(ctx.rng.next());
            ctx.fx.burst('smoke', p.x + Math.sin(ang) * d, 0.8, p.z + Math.cos(ang) * d, { count: 4, color: a.color });
          }
          const hero = ctx.heroPos ?? ctx.playerPos;
          if (dist(p.x, p.z, hero.x, hero.z) < r) ctx.applyHeroStatus?.('snuffed', every + 0.5);
          break;
        }
        case 'knelling': {
          if (!ready || !brainAwake || this.busy || this.motionOverride) break;
          const outer = params.outer ?? 7.5;
          if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) > outer + 3) break;
          this.affixTimers[i] = params.interval ?? 7;
          const inner = params.inner ?? 2.4;
          const windup = params.windup ?? 1.0;
          const x = p.x;
          const z = p.z;
          // It plants its feet and rings: the wave covers the band from the
          // inner edge out, so the safe places are against it or well clear.
          this.rootTimer = Math.max(this.rootTimer, windup);
          const tel = warnsOnGround(this) ? ctx.decals.telegraphEx('ring', x, z, outer, 0, windup, a.color, (1 - inner / outer) / 2) : NO_TELL;
          const self = this;
          after(windup, (c) => {
            tel.cancel();
            if (!self.alive) return;
            c.fx.burst('shock', x, 0.6, z, { count: 30, scale: 2.5, color: a.color });
            const d = dist(x, z, c.playerPos.x, c.playerPos.z);
            if (d >= inner && d <= outer) {
              hitPlayer(self, c, params.mul ?? 1.5, 'physical', 'knelling', {
                applies: [{ id: 'slowed', duration: 2, magnitude: params.slow ?? 0.35, stacks: 1 }],
              });
            }
          });
          break;
        }
        case 'stitching': {
          if (!ready || !brainAwake) break;
          this.affixTimers[i] = 0.25;
          // The most hurt packmate in reach.
          let worst: Enemy | null = null;
          for (const ally of alliesNear(ctx, p.x, p.z, params.range ?? 12, this.id)) {
            if (this.packId < 0 || ally.packId !== this.packId || ally.isBoss) continue;
            if (ally.lifeFraction < 0.98 && (!worst || ally.lifeFraction < worst.lifeFraction)) worst = ally;
          }
          if (!worst) break;
          const q = worst.root.position;
          const hero = ctx.heroPos ?? ctx.playerPos;
          if (distToSegment(hero.x, hero.z, p.x, p.z, q.x, q.z) < (params.width ?? 0.8)) {
            // Cut: the thread snaps and stays down for a while.
            this.affixTimers[i] = params.snap ?? 6;
            ctx.fx.burst('shock', hero.x, 1, hero.z, { count: 14, color: a.color });
            break;
          }
          worst.heal(worst.maxLife * (params.heal ?? 0.08) * 0.25, ctx);
          for (let k = 0; k < 3; k++) {
            const t = ctx.rng.next();
            ctx.fx.burst('heal', p.x + (q.x - p.x) * t, 1.0, p.z + (q.z - p.z) * t, { count: 2, color: a.color });
          }
          break;
        }
        case 'grappling': {
          // A held monster can still throw: only a swing or a dash stops it.
          if (!ready || !brainAwake || this.busy || this.motionOverride) break;
          const d = dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
          if (d < (params.minRange ?? 4) || d > (params.range ?? 13)) break;
          this.affixTimers[i] = params.interval ?? 8;
          const windup = params.windup ?? 0.8;
          const ang = angleTo(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
          const len = d + 2;
          const x = p.x;
          const z = p.z;
          const tx = x + Math.sin(ang) * len;
          const tz = z + Math.cos(ang) * len;
          this.facing = ang;
          this.rootTimer = Math.max(this.rootTimer, windup);
          const tel = tell(this, ctx, 'line', x, z, len, ang, windup, a.color);
          const self = this;
          after(windup, (c) => {
            tel.cancel();
            if (!self.alive) return;
            const hd = distToSegment(c.playerPos.x, c.playerPos.z, x, z, tx, tz);
            if (hd > (params.width ?? 0.9)) return;
            const pull = dist(x, z, c.playerPos.x, c.playerPos.z) - 1.6;
            hitPlayer(self, c, params.mul ?? 0.6, 'physical', 'grappling', {
              knockback: -Math.max(0, pull),
              from: { x, z },
              applies: [{ id: 'slowed', duration: 1.5, magnitude: 0.4, stacks: 1 }],
            });
          });
          break;
        }
        case 'refracting': {
          if (!ready || !brainAwake || this.busy || this.motionOverride) break;
          const range = params.range ?? 15;
          if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) > range) break;
          this.affixTimers[i] = params.interval ?? 8;
          const windup = params.windup ?? 0.9;
          const spread = params.spread ?? 0.42;
          const mid = angleTo(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
          const x = p.x;
          const z = p.z;
          this.facing = mid;
          this.rootTimer = Math.max(this.rootTimer, windup);
          const beams = [mid - spread, mid, mid + spread];
          const tels = beams.map((ang) => tell(this, ctx, 'line', x, z, range, ang, windup, a.color));
          const self = this;
          after(windup, (c) => {
            for (const t of tels) t.cancel();
            if (!self.alive) return;
            let struck = false;
            for (const ang of beams) {
              const ex = x + Math.sin(ang) * range;
              const ez = z + Math.cos(ang) * range;
              for (let k = 1; k <= 4; k++) c.fx.burst('shock', x + (ex - x) * k / 4, 1.0, z + (ez - z) * k / 4, { count: 3, color: a.color });
              if (!struck && distToSegment(c.playerPos.x, c.playerPos.z, x, z, ex, ez) < (params.width ?? 0.65)) {
                struck = true;
                hitPlayer(self, c, params.mul ?? 1.3, 'lightning', 'refracting');
              }
            }
          });
          break;
        }
        case 'hemming': {
          if (!ready || !brainAwake) break;
          if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) > 15) break;
          this.affixTimers[i] = params.interval ?? 12;
          const r = params.radius ?? 4.5;
          const windup = params.windup ?? 1.0;
          const tx = ctx.playerPos.x;
          const tz = ctx.playerPos.z;
          // The ring itself is the warning: where the nails come up.
          const tel = tell(this, ctx, 'ring', tx, tz, r, 0, windup, a.color);
          const self = this;
          after(windup, (c) => {
            tel.cancel();
            if (!self.alive) return;
            const n = params.nails ?? 14;
            for (let k = 0; k < n; k++) {
              const ang = (k / n) * Math.PI * 2;
              spawnHazard(self, c, tx + Math.sin(ang) * r, tz + Math.cos(ang) * r, 0.75, params.dps ?? 0.55, 'physical', 'hemming', {
                duration: params.life ?? 4.5,
                tickRate: 2,
                color: a.color,
              });
            }
          });
          break;
        }
        case 'emberfall': {
          if (!ready || !brainAwake) break;
          if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) > 16) break;
          this.affixTimers[i] = params.interval ?? 6;
          const r = params.radius ?? 1.4;
          const delay = params.delay ?? 1.0;
          const ring = params.ring ?? 4;
          const spread = params.spread ?? 2.9;
          const tx = ctx.playerPos.x;
          const tz = ctx.playerPos.z;
          // One on you and a ring around it, far enough apart to step between.
          const spots = [{ x: tx, z: tz }];
          const turn = ctx.rng.next() * Math.PI * 2;
          for (let k = 0; k < ring; k++) {
            const ang = turn + (k / ring) * Math.PI * 2;
            spots.push({ x: tx + Math.sin(ang) * spread, z: tz + Math.cos(ang) * spread });
          }
          const tels = spots.map((q) => tell(this, ctx, 'circle', q.x, q.z, r, 0, delay, a.color));
          const self = this;
          after(delay, (c) => {
            for (const t of tels) t.cancel();
            if (!self.alive) return;
            let struck = false;
            for (const q of spots) {
              if (struck) {
                c.fx.burst('hit.fire', q.x, 0.4, q.z, { count: 18, scale: 1.4 });
                continue;
              }
              struck = circleHit(self, c, q.x, q.z, r, params.mul ?? 1.1, 'fire', 'emberfall');
            }
          });
          break;
        }
        case 'eclipsing': {
          if (!ready || !brainAwake || this.busy || this.motionOverride) break;
          const r = params.radius ?? 7;
          if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) > r + 2) break;
          this.affixTimers[i] = params.interval ?? 11;
          const windup = params.windup ?? 1.3;
          const x = p.x;
          const z = p.z;
          this.rootTimer = Math.max(this.rootTimer, windup);
          const tel = tell(this, ctx, 'circle', x, z, r, 0, windup, a.color);
          const self = this;
          after(windup, (c) => {
            tel.cancel();
            if (!self.alive) return;
            c.fx.burst('void', x, 1.0, z, { count: 40, scale: 3, color: a.color });
            if (dist(x, z, c.playerPos.x, c.playerPos.z) <= r) {
              hitPlayer(self, c, params.mul ?? 1.1, 'arcane', 'eclipsing', {
                applies: [{ id: 'blinded', duration: params.blind ?? 3, magnitude: 1, stacks: 1 }],
              });
            }
          });
          break;
        }
        default:
          break;
      }
    }
  }

  /** Called by the ability layer when this monster lands a hit on the player. */
  onDealtDamage(amount: number, packet: DamagePacket, ctx: CombatContext): void {
    for (const a of this.affixes) {
      const params = a.params ?? {};
      switch (a.behavior) {
        case 'echoing': {
          // Only its own blows echo: not its powers, its pools, or an echo.
          if (!this.alive || ctx.elapsed < this.echoAt || !packet.ability || !this.abilityIds.includes(packet.ability)) break;
          this.echoAt = ctx.elapsed + (params.cooldown ?? 2.2);
          const hero = ctx.heroPos ?? ctx.playerPos;
          const tx = hero.x;
          const tz = hero.z;
          const r = params.radius ?? 1.7;
          const delay = params.delay ?? 0.8;
          const tel = tell(this, ctx, 'circle', tx, tz, r, 0, delay, a.color);
          const self = this;
          after(delay, (c) => {
            tel.cancel();
            if (!self.alive) return;
            circleHit(self, c, tx, tz, r, params.mul ?? 0.8, packet.type, 'echoing');
          });
          break;
        }
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
    // The instance's own skeleton (its bone texture) is the one thing it owns.
    releaseMonsterModel(this.bodyRoot);
    // Geometry and materials belong to the shared prototype cache in
    // MonsterModels — releasing them here would break every other spawn.
    // `disposeMonsterCache()` handles them at run teardown.
  }
}

/**
 * Each second, a stack of the hero's poison deals this share of the blow
 * that applied it, scaled by the status's own strength (Poisoned is 5, so
 * 4% a second: a stack is worth about a third of the hit over its 8s).
 */
const VENOM_SHARE = 0.04 / 5;

/** The hero's poison statuses on a blow, given that blow's power. */
function venomOf(packet: DamagePacket, list: StatusApplication[]): StatusApplication[] {
  if (packet.source !== 'player') return list;
  let out: StatusApplication[] | null = null;
  for (let i = 0; i < list.length; i++) {
    const app = list[i]!;
    const dot = statusDef(app.id)?.dot;
    if (!dot || dot.type !== 'poison' || app.power) continue;
    out ??= list.slice();
    out[i] = { ...app, power: packet.amount * VENOM_SHARE * dot.perSecond };
  }
  return out ?? list;
}

/**
 * What each damage type leaves behind.
 *
 * Nothing in the game applied a damage-over-time. Fire did not burn, poison did
 * not poison, and every one of those effects sat authored and unreachable — so
 * an element was only ever a resistance number, and picking fire over cold
 * changed nothing you could see. A hit now afflicts its own element.
 */
const ELEMENT_AFFLICTION: Partial<Record<DamageType, string>> = {
  fire: 'burning',
  cold: 'chilled',
  lightning: 'electrified',
  poison: 'poisoned',
  arcane: 'soulburn',
  physical: 'bleeding',
};

/**
 * How often a hit of each element sticks.
 *
 * Physical is rare because every basic attack is physical and a permanent bleed
 * on everything is not a mechanic. The elements land often enough to matter and
 * seldom enough that resistances still decide fights.
 */
/**
 * The authored buff each elite affix wears.
 *
 * These statuses were written with full modifiers — `stoneform` grants damage
 * reduction and physical resistance, `frenzy` stacks attack speed per kill —
 * and nothing granted any of them. The affixes that describe exactly those
 * things already existed too; the two were never joined, so a Stoneskin elite
 * was a name and a colour.
 */
const AFFIX_BUFF: Record<string, string> = {
  stoneskin: 'stoneform',
  berserker: 'frenzy',
  blood_thirsty: 'bloodlust',
  vampiric: 'siphoning',
  arcane_enchanted: 'voidtouched',
  plagued: 'hexbrand',
  juggernaut: 'stoneform',
};

/**
 * Statuses a heavy elemental blow leaves on top of its own affliction.
 *
 * The catalogue calls these the shred tier: charred armour, bone-deep cold, a
 * weapon knocked wide. They are the reason a critical hit should mean something
 * beyond a bigger number, and nothing applied them.
 */
const CRIT_SHRED: Partial<Record<DamageType, string>> = {
  fire: 'scorched',
  cold: 'frostbite',
  physical: 'disarmed',
};

const AFFLICTION_CHANCE: Partial<Record<DamageType, number>> = {
  fire: 0.35,
  cold: 0.4,
  lightning: 0.28,
  poison: 0.45,
  arcane: 0.25,
  physical: 0.12,
};

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
  // Projectiles, ground hazards and delayed impacts from the floor being left.
  resetAbilityWorld();
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
