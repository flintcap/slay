/**
 * SLAY — monster AI.
 *
 * A utility-scored state machine with real perception. The design goals, in
 * order:
 *
 * 1. **Monsters must read differently by role.** A brute telegraphs and charges.
 *    An archer backpedals and plants caltrops. A caster channels from the back
 *    line and panics when you close. A support hides behind the line and heals.
 * 2. **A pack must look like a mob, not a conga line.** Every engaged monster
 *    claims an angular slot around the player and separates from its neighbours,
 *    so twenty enemies converging *surround* you.
 * 3. **Thinking is staggered, movement is not.** `think()` runs a few times a
 *    second on a per-entity phase offset; `steer()` runs every frame off the
 *    cached decision. Sixty enemies cost sixty cheap steers and about a dozen
 *    thinks per frame.
 */

import * as THREE from 'three';
import type { MonsterDef, MonsterRole } from '../types';
import type { CombatContext, AbilityDef } from './Abilities';
import { angleDelta, angleTo, clamp, dist, dist2, getAbility } from './Abilities';
import type { Enemy } from './Enemy';

export type AIMode =
  | 'dormant'
  | 'alert'
  | 'approach'
  | 'engage'
  | 'strafe'
  | 'kite'
  | 'reposition'
  | 'support'
  | 'retreat'
  | 'flee'
  | 'regroup'
  | 'hidden';

const TAU = Math.PI * 2;

/**
 * The player, whoever the acting monster is currently swinging at.
 *
 * `ctx.playerPos` is the *victim* position: the scene points it at a summon
 * while a monster that chose to fight that summon is updating. Perception,
 * waking and the choice of what to fight all mean the player specifically, so
 * they go through here instead.
 */
function hero(ctx: CombatContext): THREE.Vector3 {
  return ctx.heroPos ?? ctx.playerPos;
}

/** How close a monster must be to notice a Veiled player. Arm's length. */
const HIDDEN_NOTICE = 1.8;

/** How far a monster will look for a summon worth fighting. */
const MINION_NOTICE = 13;
/**
 * How much nearer than the player a summon must be before a monster switches
 * to it. Small, because a body in the way should be fought, not walked round.
 */
const MINION_SWITCH_MARGIN = 1.5;
/**
 * Once engaged, how much further the summon may be than the player before the
 * monster gives up on it. Wider than the switch margin so a fight does not
 * flicker between two targets at the boundary.
 */
const MINION_KEEP_MARGIN = 5;
/** A taunting summon counts as this fraction of its real distance. */
const TAUNT_PULL = 0.3;

// ---------------------------------------------------------------------------
// Role profiles — the whole personality of a monster in one table row
// ---------------------------------------------------------------------------

export interface RoleProfile {
  /** Distance the monster tries to hold from the player. */
  standoff: (def: MonsterDef) => number;
  /** Below this it actively backs off. */
  tooClose: (def: MonsterDef) => number;
  /** Sideways drift while holding position, 0..1. */
  strafe: number;
  /** Life fraction at which it starts to disengage. */
  fleeAt: number;
  /** How willing it is to break formation and dive in. */
  aggression: number;
  /** Sight cone half-angle in degrees. */
  fov: number;
  /** Sight distance. */
  sight: number;
  /** Hears you through walls inside this radius. */
  hearing: number;
  /** Seconds between full re-evaluations. */
  thinkPeriod: number;
  /** Prefers to keep allies between itself and the player. */
  hidesBehindLine: boolean;
  /** Waits, unseen, until the player is inside `ambushRange`. */
  ambush: boolean;
  ambushRange: number;
}

const PROFILES: Record<MonsterRole, RoleProfile> = {
  melee: {
    standoff: (d) => d.attackRange * 0.75,
    tooClose: () => 0,
    strafe: 0.35,
    fleeAt: 0.0,
    aggression: 0.9,
    fov: 100,
    sight: 18,
    hearing: 7,
    thinkPeriod: 0.28,
    hidesBehindLine: false,
    ambush: false,
    ambushRange: 0,
  },
  brute: {
    standoff: (d) => d.attackRange * 0.7,
    tooClose: () => 0,
    strafe: 0.12,
    fleeAt: 0.0,
    aggression: 1.0,
    fov: 120,
    sight: 22,
    hearing: 10,
    thinkPeriod: 0.36,
    hidesBehindLine: false,
    ambush: false,
    ambushRange: 0,
  },
  ranged: {
    standoff: (d) => d.attackRange * 0.7,
    tooClose: (d) => Math.min(6.5, d.attackRange * 0.35),
    strafe: 0.55,
    fleeAt: 0.2,
    aggression: 0.35,
    fov: 90,
    sight: 24,
    hearing: 8,
    thinkPeriod: 0.24,
    hidesBehindLine: true,
    ambush: false,
    ambushRange: 0,
  },
  caster: {
    standoff: (d) => d.attackRange * 0.72,
    tooClose: (d) => Math.min(8, d.attackRange * 0.45),
    strafe: 0.4,
    fleeAt: 0.25,
    aggression: 0.3,
    fov: 85,
    sight: 26,
    hearing: 8,
    thinkPeriod: 0.26,
    hidesBehindLine: true,
    ambush: false,
    ambushRange: 0,
  },
  swarm: {
    standoff: (d) => d.attackRange * 0.6,
    tooClose: () => 0,
    strafe: 0.75,
    fleeAt: 0.0,
    aggression: 1.0,
    fov: 140,
    sight: 16,
    hearing: 12,
    thinkPeriod: 0.32,
    hidesBehindLine: false,
    ambush: false,
    ambushRange: 0,
  },
  support: {
    standoff: (d) => Math.max(7, d.attackRange * 0.85),
    tooClose: () => 8,
    strafe: 0.3,
    fleeAt: 0.4,
    aggression: 0.15,
    fov: 80,
    sight: 22,
    hearing: 9,
    thinkPeriod: 0.3,
    hidesBehindLine: true,
    ambush: false,
    ambushRange: 0,
  },
  ambusher: {
    standoff: (d) => d.attackRange * 0.7,
    tooClose: () => 0,
    strafe: 0.5,
    fleeAt: 0.18,
    aggression: 0.8,
    fov: 70,
    sight: 20,
    hearing: 6,
    thinkPeriod: 0.22,
    hidesBehindLine: false,
    ambush: true,
    ambushRange: 6.5,
  },
};

export function roleProfile(role: MonsterRole): RoleProfile {
  return PROFILES[role];
}

// ---------------------------------------------------------------------------
// Archetypes — how a monster fights inside a pack
// ---------------------------------------------------------------------------

/**
 * What a monster *does* in a fight, as opposed to what it is.
 *
 * - **rusher** closes fast and hits first. It sprints while it is far away.
 * - **flanker** goes round you on a wide arc and comes in from behind.
 * - **kiter** holds a distance band, circles while it shoots, backs off when
 *   you close.
 * - **caster** stays at the back behind a body and channels.
 * - **support** keeps near its most wounded friends and away from you.
 * - **swarm** gathers in a ring just out of reach, then dives in all at once.
 * - **tank** plants itself between you and the pack's back line.
 */
export type Archetype = 'rusher' | 'flanker' | 'kiter' | 'caster' | 'support' | 'swarm' | 'tank';

const ROLE_ARCHETYPE: Record<MonsterRole, Archetype> = {
  melee: 'rusher',
  ambusher: 'flanker',
  ranged: 'kiter',
  caster: 'caster',
  support: 'support',
  swarm: 'swarm',
  brute: 'tank',
};

export function archetypeOf(def: MonsterDef): Archetype {
  // A "support" that fights with its teeth (a pack alpha) leads from the front.
  if (def.role === 'support' && def.attackRange < 4) return 'rusher';
  return ROLE_ARCHETYPE[def.role];
}

/** Archetypes that stand behind someone else. Tanks guard these. */
const BACK_LINE: ReadonlySet<Archetype> = new Set(['kiter', 'caster', 'support']);

/**
 * How fast a monster may run while it is closing on you. Fast enough that a
 * rush reads as a rush, never faster than the hero's own 4.6 m/s, so running
 * away is always still an answer.
 */
const RUSH_MUL = 1.3;
const RUSH_SPEED_CAP = 4.4;

/** Swarm rhythm: gather in a ring, then everyone dives at once. */
const SWARM_RING = 3.8;
const SWARM_GATHER_MAX = 1.8;
const SWARM_SURGE = 3.4;

/** Below this much life, the pack smells blood and stops being careful. */
const PRESS_AT = 0.35;

interface PackState {
  members: AIBrain[];
  phase: 'gather' | 'surge';
  phaseAt: number;
}

const packs = new Map<number, PackState>();

function packState(id: number): PackState | null {
  if (id < 0) return null;
  let p = packs.get(id);
  if (!p) {
    p = { members: [], phase: 'gather', phaseAt: -99 };
    packs.set(id, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Telegraph schedule — big blows land one after another, not on top of each other
// ---------------------------------------------------------------------------

/**
 * When each committed, telegraphed blow is due to land. A heavy slam and a
 * cleave whose markers resolve in the same instant cannot be read, let alone
 * dodged, so a monster about to start one that would land within
 * TELEGRAPH_GAP of another picks something else this beat instead.
 */
const landings: Array<{ at: number; by: string }> = [];
export const TELEGRAPH_GAP = 0.3;
/** Windups at least this long count as "big" for the schedule. */
const BIG_WINDUP = 0.5;

function telegraphClash(at: number, by: string, now: number): boolean {
  for (let i = landings.length - 1; i >= 0; i--) {
    const l = landings[i]!;
    if (l.at < now - 0.5) {
      landings.splice(i, 1);
      continue;
    }
    if (l.by !== by && Math.abs(l.at - at) < TELEGRAPH_GAP) return true;
  }
  return false;
}

/** Big-telegraph landing times currently scheduled. Exposed for the checker. */
export function scheduledLandings(): ReadonlyArray<{ at: number; by: string }> {
  return landings;
}

// ---------------------------------------------------------------------------
// Pack registry — shared aggro and slot bookkeeping
// ---------------------------------------------------------------------------

const packAggro = new Map<number, number>();

/** Marks a pack as engaged so stragglers join instead of idling. */
export function alertPack(packId: number, elapsed: number): void {
  if (packId < 0) return;
  packAggro.set(packId, elapsed);
}

export function packIsAlerted(packId: number, elapsed: number): boolean {
  if (packId < 0) return false;
  const t = packAggro.get(packId);
  return t !== undefined && elapsed - t < 30;
}

export function resetPacks(): void {
  packAggro.clear();
  packs.clear();
  landings.length = 0;
}

// ---------------------------------------------------------------------------
// The brain
// ---------------------------------------------------------------------------

const _tmpA = new THREE.Vector3();

export class AIBrain {
  mode: AIMode = 'dormant';
  /** Desired world position this frame. */
  readonly desired = new THREE.Vector3();
  /** Smoothed separation push from neighbours. */
  private sepX = 0;
  private sepZ = 0;
  /** Angular slot around the player, radians. */
  private slot = 0;
  private slotLocked = 0;
  /** Cached path to the player when line of sight is blocked. */
  private path: Array<{ x: number; y: number }> = [];
  private pathAge = 999;
  private pathTarget = new THREE.Vector2(9999, 9999);

  private thinkTimer: number;
  private readonly profile: RoleProfile;
  private strafeDir = 1;
  private strafeTimer = 0;
  private losCache = false;
  private losAge = 99;
  /** True while executing a telegraphed ability that roots us. */
  private lastDistance = 999;
  private hesitate = 0;
  private regroupTimer = 0;

  /**
   * What this monster is currently fighting.
   *
   * Everything positional reads this rather than `ctx.playerPos`. Normally it
   * *is* the player, but a summon standing in the way takes it over, which is
   * the whole difference between a pack that holds a line and a pack that gets
   * jogged past.
   *
   * Perception deliberately stays on the player: a skeleton should not wake a
   * sleeping room. Monsters still notice a minion the moment it hits them,
   * through the ordinary damage path.
   */
  private readonly anchor = new THREE.Vector3();
  private anchorId: number | null = null;

  /**
   * Set on bosses. A boss fight is a set piece built around the player, and a
   * boss that walks off to swing at a skeleton stops being one.
   */
  fixateOnPlayer = false;

  /** How this monster fights in a pack. See the Archetype type. */
  archetype: Archetype;
  /** Multiplier the body applies to its walk speed this beat. */
  speedMul = 1;
  private pack: PackState | null = null;
  private joined = false;
  /** Which side a flanker goes round, -1 or 1. */
  private readonly flankSide: number;
  /** Seconds spent trying to get round; a flanker gives up eventually. */
  private flankTry = 0;
  /** Seconds left committed to the current line of attack. */
  private commit = 0;
  /** Seconds left reeling from the pack leader's death. */
  private shaken = 0;

  /** The summoned ally this monster has decided to fight, if any. */
  get aggroMinion(): number | null {
    return this.anchorId;
  }


  constructor(
    private readonly self: Enemy,
    private readonly def: MonsterDef,
    rng: { next(): number },
  ) {
    this.profile = PROFILES[def.role];
    this.archetype = archetypeOf(def);
    // Stagger the first think so a freshly spawned pack does not all think on
    // the same frame.
    this.thinkTimer = rng.next() * this.profile.thinkPeriod;
    this.slot = rng.next() * TAU;
    this.strafeDir = rng.next() < 0.5 ? -1 : 1;
    this.strafeTimer = 1 + rng.next() * 2;
    this.flankSide = rng.next() < 0.5 ? -1 : 1;
  }

  /**
   * Joins the pack's roster the first time this monster is awake. Every third
   * plain melee member of a pack goes round the side instead of straight in,
   * which is what turns a line of swordsmen into a pincer.
   */
  private joinPack(): void {
    if (this.joined) return;
    this.joined = true;
    if (this.fixateOnPlayer) return;
    this.pack = packState(this.self.packId);
    if (!this.pack) return;
    let melee = 0;
    for (const m of this.pack.members) if (m.def.role === 'melee') melee++;
    this.pack.members.push(this);
    if (this.def.role === 'melee' && melee % 3 === 2) this.archetype = 'flanker';
  }

  /** The pack leader fell: hesitate, and come on slower for a moment. */
  shake(seconds: number): void {
    this.shaken = Math.max(this.shaken, seconds);
    this.hesitate = Math.max(this.hesitate, seconds * 0.6);
  }

  /** True while this monster is waiting for its pack's swarm to gather. */
  get holdingForSwarm(): boolean {
    return this.archetype === 'swarm' && this.pack !== null && this.pack.phase === 'gather';
  }

  get isDormant(): boolean {
    return this.mode === 'dormant' || this.mode === 'hidden';
  }

  // --- perception ---------------------------------------------------------

  private lineOfSight(ctx: CombatContext): boolean {
    if (this.losAge < 0.2) return this.losCache;
    this.losAge = 0;
    const p = this.self.root.position;
    try {
      this.losCache = ctx.nav.lineOfSight(p.x, p.z, this.anchor.x, this.anchor.z);
    } catch {
      this.losCache = true;
    }
    return this.losCache;
  }

  /**
   * Sight cone + hearing + LOS. Returns true when the player is perceived.
   *
   * Veil collapses this to arm's length. The `veiled` status was authored with
   * real modifiers and the skill applied it correctly, but nothing in the AI
   * ever asked whether the player was hidden, so monsters kept walking straight
   * at you and the skill read as doing nothing. A monster you are practically
   * standing on still finds you — total invisibility would let you walk a whole
   * floor untouched.
   */
  private perceives(ctx: CombatContext): boolean {
    const p = this.self.root.position;
    const d = dist(p.x, p.z, hero(ctx).x, hero(ctx).z);
    if (ctx.playerHidden) return d <= HIDDEN_NOTICE;
    if (d > this.profile.sight) return d <= this.profile.hearing;
    if (d <= this.profile.hearing) return true;
    if (!this.lineOfSight(ctx)) return false;
    const a = angleTo(p.x, p.z, hero(ctx).x, hero(ctx).z);
    return Math.abs(angleDelta(this.self.facing, a)) <= (this.profile.fov * Math.PI) / 180;
  }

  /** Wakes this monster and propagates aggro through its pack and neighbours. */
  wake(ctx: CombatContext, propagate = true): void {
    if (this.mode !== 'dormant' && this.mode !== 'hidden') return;
    this.mode = 'approach';
    alertPack(this.self.packId, ctx.elapsed);
    if (!propagate) return;
    const p = this.self.root.position;
    for (const e of ctx.enemies) {
      if (e === this.self || !e.alive) continue;
      const q = e.root.position;
      const near = dist2(p.x, p.z, q.x, q.z) < 100;
      if (near || (e.packId >= 0 && e.packId === this.self.packId)) {
        e.ai?.softWake(ctx);
      }
    }
  }

  /** Wake without re-propagating — prevents an aggro cascade across the level. */
  softWake(ctx: CombatContext): void {
    if (this.mode === 'dormant') {
      this.mode = 'approach';
      alertPack(this.self.packId, ctx.elapsed);
    } else if (this.mode === 'hidden') {
      // Ambushers stay hidden until you are genuinely close.
      const p = this.self.root.position;
      if (dist(p.x, p.z, hero(ctx).x, hero(ctx).z) < this.profile.ambushRange * 1.6) {
        this.mode = 'approach';
      }
    }
  }

  // --- the main tick -------------------------------------------------------

  update(dt: number, ctx: CombatContext): void {
    this.losAge += dt;
    this.pathAge += dt;
    this.strafeTimer -= dt;
    this.hesitate = Math.max(0, this.hesitate - dt);
    this.regroupTimer = Math.max(0, this.regroupTimer - dt);
    this.commit = Math.max(0, this.commit - dt);
    this.shaken = Math.max(0, this.shaken - dt);
    if (this.strafeTimer <= 0) {
      this.strafeDir = -this.strafeDir;
      this.strafeTimer = 1.4 + (this.self.root.position.x % 1) * 2;
    }

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = this.profile.thinkPeriod;
      this.think(ctx);
    }
  }

  /**
   * Decides what this monster is fighting: you, or one of your summons.
   *
   * Nearest wins, with taunting summons weighted heavily toward themselves. The
   * two margins give the decision hysteresis, so a monster caught between a
   * skeleton and you commits to one instead of stuttering between them.
   */
  private pickAnchor(ctx: CombatContext): void {
    this.anchor.copy(hero(ctx));
    const list = ctx.minions;
    if (this.fixateOnPlayer || !list?.length) {
      this.anchorId = null;
      return;
    }
    const p = this.self.root.position;
    const toPlayer = dist(p.x, p.z, hero(ctx).x, hero(ctx).z);

    let best: (typeof list)[number] | null = null;
    let bestScore = Infinity;
    let bestReal = Infinity;
    for (const m of list) {
      const real = dist(p.x, p.z, m.x, m.z);
      if (real > MINION_NOTICE) continue;
      const score = m.taunt ? real * TAUNT_PULL : real;
      if (score < bestScore) {
        bestScore = score;
        bestReal = real;
        best = m;
      }
    }
    if (!best) {
      this.anchorId = null;
      return;
    }
    // Already committed to this one? Hold on to it for longer.
    const holding = this.anchorId === best.id;
    const margin = holding ? MINION_KEEP_MARGIN : MINION_SWITCH_MARGIN;
    if (best.taunt || bestReal <= toPlayer + margin) {
      this.anchor.set(best.x, 0, best.z);
      this.anchorId = best.id;
    } else {
      this.anchorId = null;
    }
  }

  private think(ctx: CombatContext): void {
    const self = this.self;
    const p = self.root.position;
    let d = dist(p.x, p.z, hero(ctx).x, hero(ctx).z);
    this.lastDistance = d;
    this.anchor.copy(hero(ctx));

    // --- wake checks -------------------------------------------------------
    if (this.mode === 'dormant') {
      if (packIsAlerted(self.packId, ctx.elapsed) || this.perceives(ctx)) {
        if (this.profile.ambush && d > this.profile.ambushRange) this.mode = 'hidden';
        else this.wake(ctx);
      }
      if (this.mode === 'dormant') return;
    }

    // Awake: from here on, everything positional aims at whatever this monster
    // has decided to fight, which may be a summon rather than you. Waking above
    // stayed on the player deliberately.
    this.pickAnchor(ctx);
    if (this.anchorId !== null) d = dist(p.x, p.z, this.anchor.x, this.anchor.z);

    if (this.mode === 'hidden') {
      if (d <= this.profile.ambushRange) {
        this.mode = 'approach';
        self.onAmbushSprung(ctx);
      } else {
        this.computeSeparation(ctx);
        this.desired.copy(p);
        return;
      }
    }

    // Veil applies to a monster already hunting you, not only a sleeping one.
    // Gating perception alone would have left everything that had already
    // noticed you walking straight at your back.
    // A summon it is already fighting is not hidden by your Veil.
    if (ctx.playerHidden && this.anchorId === null && d > HIDDEN_NOTICE) {
      this.computeSeparation(ctx);
      this.desired.copy(p);
      return;
    }

    // --- flee / regroup ----------------------------------------------------
    const lifeFrac = self.life / Math.max(1, self.maxLife);
    if (this.profile.fleeAt > 0 && lifeFrac < this.profile.fleeAt && !self.isElite) {
      this.mode = this.regroupTimer > 0 ? 'regroup' : 'flee';
    } else if (this.mode === 'flee' && lifeFrac > this.profile.fleeAt + 0.18) {
      this.mode = 'approach';
    }

    this.computeSeparation(ctx);
    this.joinPack();
    const pressing = (ctx.heroLifeFrac ?? 1) < PRESS_AT;
    if (this.archetype === 'swarm') this.tickSwarm(ctx, pressing);

    // --- ability selection --------------------------------------------------
    // Casters and supports pick first; if something fires, movement yields.
    const chosen = this.chooseAbility(ctx, d);
    if (chosen) {
      const speed = Math.max(0.35, self.stats.attackSpeed);
      const lands = ctx.elapsed + chosen.windup / speed;
      if (self.beginAbility(chosen, ctx)) {
        if (chosen.telegraph && chosen.windup >= BIG_WINDUP) landings.push({ at: lands, by: self.id });
        this.mode = chosen.kind === 'movement' ? 'approach' : 'engage';
        this.desired.copy(p);
        return;
      }
    }

    // --- positioning --------------------------------------------------------
    let standoff = this.profile.standoff(this.def);
    const tooClose = this.profile.tooClose(this.def);
    this.speedMul = this.shaken > 0 ? 0.6 : 1;
    // Closing from range: rushers sprint, and everything with a blade sprints
    // once the hero is on the ropes.
    const closer = this.archetype === 'rusher' || this.archetype === 'flanker' || this.archetype === 'swarm';
    if (this.shaken <= 0 && ((this.archetype === 'rusher' && d > standoff + 3) || (pressing && closer) ||
      (this.archetype === 'swarm' && this.pack?.phase === 'surge'))) {
      this.speedMul = Math.max(1, Math.min(RUSH_MUL, RUSH_SPEED_CAP / Math.max(0.1, this.def.speed)));
    }
    if (pressing && closer) standoff *= 0.8;

    if (this.mode === 'flee') {
      this.setRetreatTarget(ctx, 16);
      this.regroupTimer = 4;
      return;
    }
    if (this.mode === 'regroup') {
      // Fall back to the nearest ally and hold there.
      const ally = this.nearestAlly(ctx, 22);
      if (ally) {
        this.desired.set(ally.root.position.x, 0, ally.root.position.z);
        if (dist(p.x, p.z, ally.root.position.x, ally.root.position.z) < 3) this.mode = 'approach';
      } else this.mode = 'approach';
      return;
    }

    if (tooClose > 0 && d < tooClose) {
      this.mode = 'kite';
      this.setRetreatTarget(ctx, standoff + 2);
      return;
    }

    // Archetype movement. Each returns true when it has set where to go.
    switch (this.archetype) {
      case 'flanker':
        if (!pressing && this.flank(ctx, d, standoff)) return;
        break;
      case 'tank':
        if (this.guard(ctx, standoff)) return;
        break;
      case 'support':
        if (this.tend(ctx, standoff, tooClose)) return;
        break;
      case 'swarm':
        if (this.gather(ctx)) return;
        break;
      case 'kiter':
        // Keep circling while shooting, so a kiter is never a stationary turret.
        if (d <= standoff + 1.2) this.slot += this.strafeDir * 0.16;
        break;
      default:
        break;
    }

    if (d > standoff + 1.2) {
      this.mode = 'approach';
      this.setApproachTarget(ctx, standoff);
      return;
    }

    // In position — hold the ring, drift sideways, keep facing the player.
    this.mode = this.profile.strafe > 0.25 ? 'strafe' : 'engage';
    this.claimSlot(ctx);
    const ring = Math.max(0.6, standoff);
    const a = this.slot + this.strafeDir * this.profile.strafe * 0.35;
    let tx = this.anchor.x + Math.sin(a) * ring;
    let tz = this.anchor.z + Math.cos(a) * ring;
    if (this.profile.hidesBehindLine) {
      const behind = this.behindLineOffset(ctx);
      tx += behind.x;
      tz += behind.z;
    }
    this.setDesiredWalkable(ctx, tx, tz);
  }

  // --- archetype movement --------------------------------------------------

  /**
   * Flanker: work round to the hero's back on a wide arc, then come in. Gives
   * up and goes straight in after a few seconds of being turned on, so a
   * player who keeps facing it is not simply immune.
   */
  private flank(ctx: CombatContext, d: number, standoff: number): boolean {
    if (this.anchorId !== null || ctx.heroFacing === undefined || this.commit > 0) return false;
    const p = this.self.root.position;
    const goal = ctx.heroFacing + Math.PI + this.flankSide * 0.5;
    const mine = angleTo(this.anchor.x, this.anchor.z, p.x, p.z);
    const off = angleDelta(mine, goal);
    if (Math.abs(off) < 0.7 || this.flankTry > 4) {
      // Round the back (or out of patience): commit and close in on that line.
      this.slot = Math.abs(off) < 0.7 ? goal : mine;
      this.slotLocked = 8;
      this.commit = 3;
      this.flankTry = 0;
      return false;
    }
    this.flankTry += this.profile.thinkPeriod;
    const ring = Math.max(standoff + 3.2, Math.min(d, 8));
    const a = mine + Math.sign(off) * Math.min(Math.abs(off), 0.8);
    this.mode = 'reposition';
    this.setDesiredWalkable(ctx, this.anchor.x + Math.sin(a) * ring, this.anchor.z + Math.cos(a) * ring);
    return true;
  }

  /**
   * Tank: stand on the line between the hero and the nearest back-liner, so
   * reaching the archer means going through the shield.
   */
  private guard(ctx: CombatContext, standoff: number): boolean {
    if (this.anchorId !== null || this.fixateOnPlayer) return false;
    const ward = this.nearestBackLiner(ctx, 16);
    if (!ward) return false;
    const w = ward.root.position;
    const wd = dist(this.anchor.x, this.anchor.z, w.x, w.z);
    if (wd < 2.5) return false;
    const along = Math.min(wd * 0.5, standoff + 0.8);
    const a = angleTo(this.anchor.x, this.anchor.z, w.x, w.z);
    this.mode = 'engage';
    this.setDesiredWalkable(ctx, this.anchor.x + Math.sin(a) * along, this.anchor.z + Math.cos(a) * along);
    return true;
  }

  /**
   * Support: hover by the wounded, on the far side of them from the hero.
   */
  private tend(ctx: CombatContext, standoff: number, tooClose: number): boolean {
    const p = this.self.root.position;
    let wx = 0;
    let wz = 0;
    let wsum = 0;
    for (const e of ctx.enemies) {
      if (e === this.self || !e.alive || e.ai?.isDormant) continue;
      const q = e.root.position;
      if (dist2(p.x, p.z, q.x, q.z) > 18 * 18) continue;
      const weight = 0.25 + (1 - e.life / Math.max(1, e.maxLife)) * 2;
      wx += q.x * weight;
      wz += q.z * weight;
      wsum += weight;
    }
    if (wsum <= 0) return false;
    wx /= wsum;
    wz /= wsum;
    const away = angleTo(this.anchor.x, this.anchor.z, wx, wz);
    const keep = Math.max(standoff * 0.8, tooClose + 1.5);
    const fromHero = Math.max(keep, dist(this.anchor.x, this.anchor.z, wx, wz) + 3);
    this.mode = 'support';
    this.setDesiredWalkable(ctx, this.anchor.x + Math.sin(away) * fromHero, this.anchor.z + Math.cos(away) * fromHero);
    return true;
  }

  /** Swarm, gathering: wait on the ring until the pack is ready to dive. */
  private gather(ctx: CombatContext): boolean {
    if (!this.pack || this.pack.phase !== 'gather' || this.anchorId !== null) return false;
    this.claimSlot(ctx);
    this.mode = 'strafe';
    this.setDesiredWalkable(
      ctx,
      this.anchor.x + Math.sin(this.slot) * SWARM_RING,
      this.anchor.z + Math.cos(this.slot) * SWARM_RING,
    );
    return true;
  }

  /** Advances the pack's gather/surge rhythm. Any member may call it. */
  private tickSwarm(ctx: CombatContext, pressing: boolean): void {
    const pack = this.pack;
    if (!pack) return;
    const now = ctx.elapsed;
    if (pack.phase === 'surge') {
      if (now - pack.phaseAt > SWARM_SURGE && !pressing) {
        pack.phase = 'gather';
        pack.phaseAt = now;
      } else {
        // Diving together: quicker blows for as long as the surge lasts.
        this.self.buff('swarm_surge', 0.6, { attackSpeed: 1.3 });
      }
      return;
    }
    if (pack.phaseAt < 0) pack.phaseAt = now;
    let swarm = 0;
    let ready = 0;
    const h = hero(ctx);
    for (const m of pack.members) {
      if (m.archetype !== 'swarm' || !m.self.alive || m.isDormant) continue;
      swarm++;
      const q = m.self.root.position;
      const r = dist(q.x, q.z, h.x, h.z);
      if (r > SWARM_RING - 1.4 && r < SWARM_RING + 1.6) ready++;
    }
    if (pressing || ready >= Math.min(3, swarm) || now - pack.phaseAt > SWARM_GATHER_MAX) {
      pack.phase = 'surge';
      pack.phaseAt = now;
    }
  }

  private nearestBackLiner(ctx: CombatContext, radius: number): Enemy | null {
    const p = this.self.root.position;
    let best: Enemy | null = null;
    let bestD = radius * radius;
    for (const e of ctx.enemies) {
      if (e === this.self || !e.alive || !e.ai || e.ai.isDormant) continue;
      if (!BACK_LINE.has(e.ai.archetype)) continue;
      const q = e.root.position;
      const d = dist2(p.x, p.z, q.x, q.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // --- targeting helpers ---------------------------------------------------

  private setDesiredWalkable(ctx: CombatContext, x: number, z: number): void {
    try {
      const t = ctx.nav.clampToWalkable(x, z);
      this.desired.set(t.x, 0, t.y);
    } catch {
      this.desired.set(x, 0, z);
    }
  }

  private setApproachTarget(ctx: CombatContext, standoff: number): void {
    const p = this.self.root.position;
    this.claimSlot(ctx);
    const ring = Math.max(0.5, standoff);
    const gx = this.anchor.x + Math.sin(this.slot) * ring;
    const gz = this.anchor.z + Math.cos(this.slot) * ring;

    if (this.lineOfSight(ctx)) {
      this.path.length = 0;
      this.setDesiredWalkable(ctx, gx, gz);
      return;
    }
    // No line of sight — path around the geometry, refreshing sparingly.
    const moved = dist2(this.pathTarget.x, this.pathTarget.y, this.anchor.x, this.anchor.z) > 9;
    if (this.pathAge > 1.1 || moved || this.path.length === 0) {
      this.pathAge = 0;
      this.pathTarget.set(this.anchor.x, this.anchor.z);
      try {
        this.path = ctx.nav.path({ x: p.x, y: p.z }, { x: gx, y: gz }) ?? [];
      } catch {
        this.path = [];
      }
    }
    while (this.path.length && dist(p.x, p.z, this.path[0]!.x, this.path[0]!.y) < 1.0) this.path.shift();
    const next = this.path[0];
    if (next) this.desired.set(next.x, 0, next.y);
    else this.setDesiredWalkable(ctx, gx, gz);
  }

  private setRetreatTarget(ctx: CombatContext, range: number): void {
    const p = this.self.root.position;
    const away = angleTo(this.anchor.x, this.anchor.z, p.x, p.z);
    // Try a small fan of escape headings and take the first walkable one — stops
    // kiters from backing themselves into a wall and standing there.
    for (const spread of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) {
      const a = away + spread;
      const tx = this.anchor.x + Math.sin(a) * range;
      const tz = this.anchor.z + Math.cos(a) * range;
      let ok = true;
      try {
        ok = ctx.nav.lineOfSight(p.x, p.z, tx, tz);
      } catch {
        ok = true;
      }
      if (ok) {
        this.setDesiredWalkable(ctx, tx, tz);
        return;
      }
    }
    this.setDesiredWalkable(ctx, p.x + Math.sin(away) * 3, p.z + Math.cos(away) * 3);
  }

  /**
   * Picks the least-contested angular slot around the player. This is what turns
   * a converging blob into an encirclement.
   */
  private claimSlot(ctx: CombatContext): void {
    if (this.archetype === 'kiter' && this.mode === 'strafe') return;
    if (this.slotLocked > 0) {
      this.slotLocked--;
      return;
    }
    this.slotLocked = 6;
    const p = this.self.root.position;
    const mine = angleTo(hero(ctx).x, hero(ctx).z, p.x, p.z);
    const SLOTS = 10;
    let best = mine;
    let bestScore = -Infinity;
    for (let i = 0; i < SLOTS; i++) {
      const a = (i / SLOTS) * TAU;
      // Prefer slots near where we already stand (no silly orbiting) but heavily
      // penalise slots another enemy has taken.
      let score = -Math.abs(angleDelta(mine, a)) * 0.9;
      for (const e of ctx.enemies) {
        if (e === this.self || !e.alive || e.ai?.isDormant) continue;
        const q = e.root.position;
        const ea = angleTo(hero(ctx).x, hero(ctx).z, q.x, q.z);
        const delta = Math.abs(angleDelta(ea, a));
        if (delta < 0.55) score -= (0.55 - delta) * 6;
      }
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    this.slot = best;
  }

  /** Nudge that keeps back-liners behind the nearest front-liner. */
  private behindLineOffset(ctx: CombatContext): { x: number; z: number } {
    const p = this.self.root.position;
    let bestD = Infinity;
    let shieldX = 0;
    let shieldZ = 0;
    for (const e of ctx.enemies) {
      if (e === this.self || !e.alive) continue;
      if (e.role !== 'melee' && e.role !== 'brute' && e.role !== 'swarm') continue;
      const q = e.root.position;
      const d = dist2(p.x, p.z, q.x, q.z);
      if (d < bestD) {
        bestD = d;
        shieldX = q.x;
        shieldZ = q.z;
      }
    }
    if (bestD === Infinity) return { x: 0, z: 0 };
    // Push away from the player along the line through the front-liner.
    const a = angleTo(hero(ctx).x, hero(ctx).z, shieldX, shieldZ);
    return { x: Math.sin(a) * 1.6, z: Math.cos(a) * 1.6 };
  }

  private nearestAlly(ctx: CombatContext, radius: number): Enemy | null {
    const p = this.self.root.position;
    let best: Enemy | null = null;
    let bestD = radius * radius;
    for (const e of ctx.enemies) {
      if (e === this.self || !e.alive || e.ai?.isDormant) continue;
      const q = e.root.position;
      const d = dist2(p.x, p.z, q.x, q.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /**
   * Local avoidance. Recomputed on the think tick and applied smoothly every
   * frame, so it costs O(n) per thinking entity rather than O(n²) per frame.
   */
  private computeSeparation(ctx: CombatContext): void {
    const p = this.self.root.position;
    const myR = this.self.hitRadius;
    let sx = 0;
    let sz = 0;
    for (const e of ctx.enemies) {
      if (e === this.self || !e.alive) continue;
      const q = e.root.position;
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      const want = myR + e.hitRadius + 0.25;
      const d2 = dx * dx + dz * dz;
      if (d2 > want * want || d2 < 1e-5) continue;
      const d = Math.sqrt(d2);
      const push = (want - d) / want;
      sx += (dx / d) * push;
      sz += (dz / d) * push;
    }
    // Also avoid standing on top of whatever it is fighting.
    const pdx = p.x - this.anchor.x;
    const pdz = p.z - this.anchor.z;
    const pd = Math.hypot(pdx, pdz);
    const minPd = myR + 0.55;
    if (pd < minPd && pd > 1e-4) {
      const push = (minPd - pd) / minPd;
      sx += (pdx / pd) * push * 1.6;
      sz += (pdz / pd) * push * 1.6;
    }
    this.sepX = sx;
    this.sepZ = sz;
  }

  /** Steering output for this frame: a unit-ish direction plus separation. */
  steer(out: THREE.Vector3, ctx: CombatContext): number {
    const p = this.self.root.position;
    if (this.mode === 'dormant' || this.mode === 'hidden') {
      out.set(0, 0, 0);
      return 0;
    }
    let dx = this.desired.x - p.x;
    let dz = this.desired.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001) {
      dx /= d;
      dz /= d;
    } else {
      dx = 0;
      dz = 0;
    }
    // Arrival damping so monsters settle into their slot instead of jittering.
    const arrive = clamp(d / 1.2, 0, 1);
    out.set(dx * arrive + this.sepX * 1.35, 0, dz * arrive + this.sepZ * 1.35);
    const len = Math.hypot(out.x, out.z);
    if (len > 1) {
      out.x /= len;
      out.z /= len;
    }
    void ctx;
    return Math.min(1, Math.hypot(out.x, out.z));
  }

  // --- ability scoring -----------------------------------------------------

  /**
   * Utility scoring over the monster's ability list. Each candidate is filtered
   * on cooldown, range, line of sight, life gates and ally requirements, then
   * scored — with a healthy bias toward whatever the role is supposed to do.
   */
  private chooseAbility(ctx: CombatContext, d: number): AbilityDef | null {
    const self = this.self;
    if (self.busy || this.hesitate > 0) return null;
    // A boss fights in a rotation you can learn, not a dice roll.
    const preferred = self.preferredAbility(d, ctx);
    if (preferred !== undefined) {
      if (preferred) return preferred;
      const strike = getAbility('basic_strike');
      if (strike && d <= this.def.attackRange + self.hitRadius && self.abilityReady('basic_strike', ctx)) return strike;
      return null;
    }
    const lifeFrac = self.life / Math.max(1, self.maxLife);
    // A gathering swarm waits for the others, unless you walk into it.
    const reach = this.def.attackRange + self.hitRadius;
    if (this.holdingForSwarm && d > reach) return null;
    const speed = Math.max(0.35, self.stats.attackSpeed);
    let best: AbilityDef | null = null;
    let bestScore = 0.12; // don't act at all below this

    for (const id of self.abilityIds) {
      const a = getAbility(id);
      if (!a) continue;
      if (a.tags?.includes('ondeath')) continue;
      if (!self.abilityReady(id, ctx)) continue;
      if (a.belowLife !== undefined && lifeFrac > a.belowLife) continue;
      if (a.aboveLife !== undefined && lifeFrac < a.aboveLife) continue;
      if (d > a.range) continue;
      if (a.minRange !== undefined && d < a.minRange) continue;
      if (a.requiresLos && !this.lineOfSight(ctx)) continue;
      if (a.needsAllies !== undefined && this.countAllies(ctx, 14) < a.needsAllies) continue;
      // A flanker saves its leap for when it is round the side.
      if (this.archetype === 'flanker' && a.kind === 'movement' && this.commit <= 0 && (ctx.heroLifeFrac ?? 1) >= PRESS_AT) continue;
      // Two big blows landing in the same instant cannot be read. Wait a beat.
      if (a.telegraph && a.windup >= BIG_WINDUP && telegraphClash(ctx.elapsed + a.windup / speed, self.id, ctx.elapsed)) {
        continue;
      }
      // Healing nobody is a wasted turn: mend only when someone is hurt.
      let healNeed = 1;
      if (a.kind === 'heal' && a.needsAllies !== undefined) {
        healNeed = Math.min(lifeFrac, this.mostWoundedAlly(ctx, a.range));
        if (healNeed > 0.85) continue;
      }
      // A ward on allies is for allies in the fight.
      if (a.kind === 'buff' && a.needsAllies !== undefined && !this.alliesEngaged(ctx)) continue;

      let score = a.priority ?? 0.35;
      // Prefer abilities whose sweet spot is where we already are.
      const sweet = a.minRange !== undefined ? (a.minRange + a.range) * 0.5 : a.range * 0.6;
      score *= 1 - clamp(Math.abs(d - sweet) / Math.max(2, a.range), 0, 0.6);
      // Desperation raises the value of defensive and escape tools.
      if (a.kind === 'heal' || a.kind === 'buff') score *= 1 + (1 - Math.min(lifeFrac, healNeed)) * 1.4;
      if (a.tags?.includes('escape')) score *= 1 + (1 - lifeFrac) * 1.8;
      if (a.tags?.includes('defensive')) score *= 1 + (1 - lifeFrac);
      // Don't stack more ground hazards than the arena can carry.
      if (a.kind === 'aoe' && a.activeTime === undefined && ctx.rng.next() < 0.15) score *= 0.7;
      // Long telegraphs are only worth it when the player is committed close.
      if (a.windup > 1.0 && d > a.range * 0.85) score *= 0.6;
      score *= 0.85 + ctx.rng.next() * 0.3;

      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    if (!best) {
      // Fall back to the basic attack when in reach.
      const basic = getAbility('basic_strike');
      if (basic && d <= this.def.attackRange + self.hitRadius && self.abilityReady('basic_strike', ctx)) {
        return basic;
      }
      return null;
    }
    return best;
  }

  /** Life fraction of the most wounded awake ally in range. 1 when none. */
  private mostWoundedAlly(ctx: CombatContext, radius: number): number {
    const p = this.self.root.position;
    const r2 = radius * radius;
    let worst = 1;
    for (const e of ctx.enemies) {
      if (e === this.self || !e.alive) continue;
      const q = e.root.position;
      if (dist2(p.x, p.z, q.x, q.z) > r2) continue;
      worst = Math.min(worst, e.life / Math.max(1, e.maxLife));
    }
    return worst;
  }

  /** True when any ally is close enough to the hero to be trading blows. */
  private alliesEngaged(ctx: CombatContext): boolean {
    const h = hero(ctx);
    for (const e of ctx.enemies) {
      if (e === this.self || !e.alive || e.ai?.isDormant) continue;
      const q = e.root.position;
      if (dist2(h.x, h.z, q.x, q.z) < 7 * 7) return true;
    }
    return false;
  }

  private countAllies(ctx: CombatContext, radius: number): number {
    const p = this.self.root.position;
    const r2 = radius * radius;
    let n = 0;
    for (const e of ctx.enemies) {
      if (e === this.self || !e.alive) continue;
      const q = e.root.position;
      if (dist2(p.x, p.z, q.x, q.z) <= r2) n++;
    }
    return n;
  }

  /** Called when the host takes a hit — interrupts channels, triggers flinch AI. */
  onDamaged(ctx: CombatContext): void {
    if (this.mode === 'dormant' || this.mode === 'hidden') this.wake(ctx);
    // Casters and supports scatter briefly when struck at range.
    if ((this.def.role === 'caster' || this.def.role === 'support') && ctx.rng.next() < 0.5) {
      this.hesitate = 0.35;
      this.thinkTimer = 0;
    }
  }

  /** Facing the brain wants this frame. */
  desiredFacing(ctx: CombatContext): number {
    const p = this.self.root.position;
    if (this.mode === 'flee' || this.mode === 'kite' || this.mode === 'regroup') {
      const dx = this.desired.x - p.x;
      const dz = this.desired.z - p.z;
      if (dx * dx + dz * dz > 0.04 && this.mode !== 'kite') return Math.atan2(dx, dz);
    }
    // The anchor is only trustworthy once this brain has thought at least once;
    // before that it is still zeroed, so fall back to the player.
    _tmpA.copy(this.anchorId !== null ? this.anchor : hero(ctx));
    return angleTo(p.x, p.z, _tmpA.x, _tmpA.z);
  }

  get distanceToPlayer(): number {
    return this.lastDistance;
  }
}
