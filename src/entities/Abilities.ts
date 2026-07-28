/**
 * SLAY — monster & boss ability registry.
 *
 * Every offensive or utility action a monster can take is an `AbilityDef`. An
 * ability runs through four phases:
 *
 *   idle -> windup -> active -> recovery -> idle
 *
 * `windup` is the telegraph window: the ground decal is placed the instant the
 * windup begins and the monster is (usually) rooted, so the player always has a
 * readable, dodgeable tell before anything lands. `active` covers persistent
 * effects (beams, whirlwinds, channels). `recovery` is the punish window where
 * the monster cannot act.
 *
 * Nothing in here calls Math.random — every roll goes through `ctx.rng`.
 */

import * as THREE from 'three';
import type {
  DamagePacket,
  DamageType,
  Rng,
  Stats,
  StatusApplication,
} from '../types';
import type { NavGrid } from '../world/Nav';
import type { FXSystem } from '../fx/Particles';
import type { DecalSystem } from '../fx/Decals';
import type { Enemy } from './Enemy';

// ---------------------------------------------------------------------------
// The world surface entities are handed each frame
// ---------------------------------------------------------------------------

/** What entities need to see the world. Provided by DungeonScene. */
export interface CombatContext {
  playerPos: THREE.Vector3;
  playerStats: Stats;
  playerLevel: number;
  damagePlayer(packet: DamagePacket): void;
  nav: NavGrid;
  fx: FXSystem;
  decals: DecalSystem;
  rng: Rng;
  elapsed: number;
  enemies: Enemy[];
  scene: THREE.Scene;
  /**
   * Solid props (pillars, sarcophagi, crates). The nav grid only knows about
   * wall tiles, so without these a projectile sails straight through a pillar
   * the player is quite reasonably hiding behind.
   */
  blockers?: Array<{ x: number; z: number; w: number; d: number }>;
}

/**
 * The slice of an entity an ability is allowed to touch. `Enemy` (and therefore
 * `Boss`) implements this; keeping abilities coded against the interface rather
 * than the class keeps the module graph acyclic.
 */
export interface Combatant {
  readonly id: string;
  readonly root: THREE.Group;
  readonly displayName: string;
  readonly isBoss: boolean;
  readonly family: string;
  life: number;
  maxLife: number;
  alive: boolean;
  /** World-space facing in radians (0 = +Z). */
  facing: number;
  /** Model scale multiplier, used to size telegraphs and reach. */
  sizeScale: number;
  level: number;
  stats: Stats;
  /** Multiplier folded into every ability packet this entity produces. */
  outgoingMul: number;
  /** Set by movement abilities; AI yields while this is non-null. */
  motionOverride: MotionOverride | null;
  /** Temporary absorb pool. */
  shield: number;
  /** Seconds of rooted-in-place remaining. */
  rootTimer: number;
  position(): THREE.Vector3;
  heal(amount: number, ctx: CombatContext): void;
  addShield(amount: number, duration: number): void;
  buff(id: string, duration: number, mods: Partial<BuffMods>): void;
  hasBuff(id: string): boolean;
  teleportTo(x: number, z: number, ctx: CombatContext): void;
  /** Fired when an ability wants a visual burst on the caster. */
  flashCast(color: number): void;
  notifyAbility(ability: AbilityDef, phase: AbilityPhase): void;
}

export interface BuffMods {
  damage: number;
  defense: number;
  speed: number;
  attackSpeed: number;
  lifeRegen: number;
  /** 0..1 fraction of incoming damage removed. */
  absorb: number;
  /** Makes the host untargetable / non-colliding. */
  phased: number;
  invulnerable: number;
}

/** A scripted movement the AI must not fight (charges, leaps, knockbacks). */
export interface MotionOverride {
  kind: 'dash' | 'leap' | 'knock' | 'burrow';
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  t: number;
  duration: number;
  /** Peak arc height for leaps. */
  arc: number;
  /** Fired when the movement lands. */
  onLand?: (self: Combatant, ctx: CombatContext) => void;
  /** Damage anything the mover passes through. */
  trample?: { mul: number; radius: number; type: DamageType; hit: boolean };
}

// ---------------------------------------------------------------------------
// Ability definition
// ---------------------------------------------------------------------------

export type AbilityPhase = 'idle' | 'windup' | 'active' | 'recovery';

export type AbilityKind =
  | 'melee'
  | 'ranged'
  | 'aoe'
  | 'cone'
  | 'beam'
  | 'buff'
  | 'debuff'
  | 'summon'
  | 'movement'
  | 'heal'
  | 'aura';

export interface TelegraphSpec {
  shape: 'circle' | 'cone' | 'line' | 'ring';
  /** World units. Multiplied by the caster's sizeScale. */
  size: number;
  color: number;
  /** Placed at the caster instead of the target point. */
  atSelf?: boolean;
}

export type AbilityFn = (self: Combatant, ctx: CombatContext, inst: AbilityInstance) => void;

export interface AbilityDef {
  id: string;
  name: string;
  kind: AbilityKind;
  /** Seconds between uses. */
  cooldown: number;
  /** Telegraph / charge-up time before the hit lands. */
  windup: number;
  /** Seconds the ability keeps ticking after execution. */
  activeTime?: number;
  /** Locked-out time after the ability finishes. */
  recovery: number;
  /** Max distance to the player for the AI to consider it. */
  range: number;
  /** AI will not use it closer than this. */
  minRange?: number;
  radius?: number;
  damageMul: number;
  damageType?: DamageType;
  requiresLos?: boolean;
  telegraph?: TelegraphSpec;
  /** Utility score baseline for the AI selector. Higher wins ties. */
  priority?: number;
  /** Only offered when the caster is below this life fraction. */
  belowLife?: number;
  /** Only offered when the caster is above this life fraction. */
  aboveLife?: number;
  /** Only offered when at least this many allies are nearby. */
  needsAllies?: number;
  /** Caster cannot move during windup. */
  rooted?: boolean;
  /** Taking damage during windup cancels it. */
  interruptible?: boolean;
  /** Cast on entering combat, once. */
  opener?: boolean;
  tags?: string[];
  params?: Record<string, number>;
  sfx?: string;
  onStart?: AbilityFn;
  onExecute?: AbilityFn;
  onTick?: (self: Combatant, ctx: CombatContext, inst: AbilityInstance, dt: number) => void;
  onEnd?: AbilityFn;
}

export interface AbilityInstance {
  def: AbilityDef;
  phase: AbilityPhase;
  /** Seconds spent in the current phase. */
  t: number;
  targetX: number;
  targetZ: number;
  facing: number;
  telegraph: { cancel(): void } | null;
  tickAccum: number;
  data: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Small maths helpers
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;

export function dist2(ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  return dx * dx + dz * dz;
}

export function dist(ax: number, az: number, bx: number, bz: number): number {
  return Math.sqrt(dist2(ax, az, bx, bz));
}

export function angleTo(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(bx - ax, bz - az);
}

export function angleDelta(a: number, b: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Is `point` inside a cone of half-angle `halfDeg` facing `facing` from origin? */
export function inCone(
  ox: number,
  oz: number,
  facing: number,
  halfDeg: number,
  range: number,
  px: number,
  pz: number,
): boolean {
  const d = dist(ox, oz, px, pz);
  if (d > range) return false;
  if (d < 0.001) return true;
  const a = angleTo(ox, oz, px, pz);
  return Math.abs(angleDelta(facing, a)) <= (halfDeg * Math.PI) / 180;
}

/** Distance from a point to a segment, for line telegraphs. */
export function distToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  if (len2 < 1e-6) return dist(px, pz, ax, az);
  let t = ((px - ax) * vx + (pz - az) * vz) / len2;
  t = clamp(t, 0, 1);
  return dist(px, pz, ax + vx * t, az + vz * t);
}

// ---------------------------------------------------------------------------
// Damage plumbing
// ---------------------------------------------------------------------------

/**
 * Builds a damage packet from a combatant's stat block. Wraps `rollDamage` from
 * the combat sim so ability code never has to think about crit rolls.
 */
export type DamageRoller = (
  stats: Stats,
  rng: Rng,
  opts?: { scale?: number; type?: DamageType; ability?: string; source?: string },
) => DamagePacket;

let rollDamageImpl: DamageRoller | null = null;

/** Enemy.ts installs the real `rollDamage` at module load. */
export function setDamageRoller(fn: DamageRoller): void {
  rollDamageImpl = fn;
}

function fallbackRoll(
  stats: Stats,
  rng: Rng,
  opts?: { scale?: number; type?: DamageType; ability?: string; source?: string },
): DamagePacket {
  const scale = opts?.scale ?? 1;
  const min = stats.minDamage || 1;
  const max = Math.max(min, stats.maxDamage || min + 1);
  const crit = rng.chance(clamp((stats.critChance || 0) / 100, 0, 0.9));
  let amount = rng.range(min, max) * scale;
  if (crit) amount *= 1 + (stats.critDamage || 50) / 100;
  return {
    amount,
    type: opts?.type ?? 'physical',
    crit,
    source: opts?.source ?? 'monster',
    ability: opts?.ability,
  };
}

export function rollPacket(
  self: Combatant,
  ctx: CombatContext,
  scale: number,
  type: DamageType,
  ability: string,
): DamagePacket {
  const roll = rollDamageImpl ?? fallbackRoll;
  const packet = roll(self.stats, ctx.rng, {
    scale: scale * self.outgoingMul,
    type,
    ability,
    source: self.id,
  });
  return packet;
}

export interface HitOpts {
  knockback?: number;
  applies?: StatusApplication[];
}

/** Rolls and applies a hit to the player. Returns the packet that landed. */
export function hitPlayer(
  self: Combatant,
  ctx: CombatContext,
  scale: number,
  type: DamageType,
  ability: string,
  opts?: HitOpts,
): DamagePacket {
  const packet = rollPacket(self, ctx, scale, type, ability);
  if (opts?.knockback) packet.knockback = opts.knockback;
  if (opts?.applies) packet.applies = opts.applies;
  ctx.damagePlayer(packet);
  return packet;
}

const FX_FOR_TYPE: Record<DamageType, string> = {
  physical: 'hit.physical',
  fire: 'hit.fire',
  cold: 'frost',
  lightning: 'shock',
  poison: 'poison',
  arcane: 'void',
};

const COLOR_FOR_TYPE: Record<DamageType, number> = {
  physical: 0xd8d0c0,
  fire: 0xff7a22,
  cold: 0x88d8ff,
  lightning: 0xffe066,
  poison: 0x8ee04a,
  arcane: 0xc060ff,
};

export function typeColor(type: DamageType): number {
  return COLOR_FOR_TYPE[type];
}

function impactFx(ctx: CombatContext, type: DamageType, x: number, y: number, z: number, count = 14): void {
  ctx.fx.burst(FX_FOR_TYPE[type], x, y, z, { count, color: COLOR_FOR_TYPE[type] });
}

// ---------------------------------------------------------------------------
// Shared area helpers used by dozens of abilities
// ---------------------------------------------------------------------------

/** True if the player is standing inside a circle. */
export function playerInCircle(ctx: CombatContext, x: number, z: number, r: number): boolean {
  return dist2(x, z, ctx.playerPos.x, ctx.playerPos.z) <= r * r;
}

export function circleHit(
  self: Combatant,
  ctx: CombatContext,
  x: number,
  z: number,
  radius: number,
  scale: number,
  type: DamageType,
  ability: string,
  opts?: HitOpts,
): boolean {
  impactFx(ctx, type, x, 0.4, z, Math.min(48, 10 + radius * 8));
  if (!playerInCircle(ctx, x, z, radius)) return false;
  hitPlayer(self, ctx, scale, type, ability, opts);
  return true;
}

export function coneHit(
  self: Combatant,
  ctx: CombatContext,
  halfDeg: number,
  range: number,
  scale: number,
  type: DamageType,
  ability: string,
  opts?: HitOpts,
): boolean {
  const p = self.position();
  if (!inCone(p.x, p.z, self.facing, halfDeg, range, ctx.playerPos.x, ctx.playerPos.z)) return false;
  hitPlayer(self, ctx, scale, type, ability, opts);
  return true;
}

export function lineHit(
  self: Combatant,
  ctx: CombatContext,
  toX: number,
  toZ: number,
  width: number,
  scale: number,
  type: DamageType,
  ability: string,
  opts?: HitOpts,
): boolean {
  const p = self.position();
  const d = distToSegment(ctx.playerPos.x, ctx.playerPos.z, p.x, p.z, toX, toZ);
  if (d > width) return false;
  hitPlayer(self, ctx, scale, type, ability, opts);
  return true;
}

/** Nearby living allies, cheapest-first (squared distance, no sqrt). */
export function alliesNear(ctx: CombatContext, x: number, z: number, radius: number, exclude?: string): Enemy[] {
  const out: Enemy[] = [];
  const r2 = radius * radius;
  for (const e of ctx.enemies) {
    if (!e.alive) continue;
    if (exclude && e.id === exclude) continue;
    const p = e.root.position;
    if (dist2(x, z, p.x, p.z) <= r2) out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Projectiles — pooled, ticked once per frame
// ---------------------------------------------------------------------------

interface Projectile {
  active: boolean;
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  radius: number;
  gravity: number;
  homing: number;
  scale: number;
  type: DamageType;
  ability: string;
  owner: Combatant | null;
  pierce: number;
  trail: string | null;
  /** Fires where the projectile stops. */
  onImpact: ((x: number, z: number, ctx: CombatContext, owner: Combatant | null) => void) | null;
  applies: StatusApplication[] | null;
  knockback: number;
  spin: number;
}

const projectiles: Projectile[] = [];
const projectileGeoCache = new Map<string, THREE.BufferGeometry>();
const projectileMatCache = new Map<number, THREE.MeshBasicMaterial>();

function projGeometry(shape: string): THREE.BufferGeometry {
  let g = projectileGeoCache.get(shape);
  if (g) return g;
  switch (shape) {
    case 'bolt':
      g = new THREE.ConeGeometry(0.09, 0.7, 6);
      g.rotateX(Math.PI * 0.5);
      break;
    case 'shard':
      g = new THREE.OctahedronGeometry(0.18, 0);
      g.scale(0.6, 0.6, 1.9);
      break;
    case 'blob':
      g = new THREE.IcosahedronGeometry(0.22, 0);
      break;
    case 'rock':
      g = new THREE.DodecahedronGeometry(0.3, 0);
      break;
    case 'ring':
      g = new THREE.TorusGeometry(0.28, 0.07, 6, 12);
      break;
    case 'orb':
    default:
      g = new THREE.SphereGeometry(0.2, 10, 8);
      break;
  }
  projectileGeoCache.set(shape, g);
  return g;
}

function projMaterial(color: number): THREE.MeshBasicMaterial {
  let m = projectileMatCache.get(color);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
  projectileMatCache.set(color, m);
  return m;
}

export interface ProjectileOpts {
  shape?: string;
  color?: number;
  speed?: number;
  radius?: number;
  gravity?: number;
  homing?: number;
  life?: number;
  pierce?: number;
  trail?: string | null;
  applies?: StatusApplication[];
  knockback?: number;
  scaleMul?: number;
  spin?: number;
  onImpact?: (x: number, z: number, ctx: CombatContext, owner: Combatant | null) => void;
}

/** Spawns a projectile travelling toward a world point. */
export function fireProjectile(
  self: Combatant,
  ctx: CombatContext,
  toX: number,
  toZ: number,
  scale: number,
  type: DamageType,
  ability: string,
  opts: ProjectileOpts = {},
): void {
  const p = self.position();
  const originY = 0.6 + self.sizeScale * 0.55;
  const speed = opts.speed ?? 13;
  const dx = toX - p.x;
  const dz = toZ - p.z;
  const len = Math.hypot(dx, dz) || 1;
  const gravity = opts.gravity ?? 0;
  // Lobbed shots solve for an arc that lands on the target.
  let vy = 0;
  if (gravity > 0) {
    const flight = len / speed;
    vy = (0.9 + gravity * flight * flight * 0.5) / Math.max(flight, 0.05);
  }

  let proj = projectiles.find((q) => !q.active);
  const color = opts.color ?? COLOR_FOR_TYPE[type];
  if (!proj) {
    const mesh = new THREE.Mesh(projGeometry(opts.shape ?? 'orb'), projMaterial(color));
    mesh.frustumCulled = false;
    proj = {
      active: false,
      mesh,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      radius: 0.4,
      gravity: 0,
      homing: 0,
      scale: 1,
      type: 'physical',
      ability: '',
      owner: null,
      pierce: 0,
      trail: null,
      onImpact: null,
      applies: null,
      knockback: 0,
      spin: 0,
    };
    projectiles.push(proj);
  }

  proj.mesh.geometry = projGeometry(opts.shape ?? 'orb');
  proj.mesh.material = projMaterial(color);
  const s = opts.scaleMul ?? 1;
  proj.mesh.scale.setScalar(s);
  proj.active = true;
  proj.x = p.x;
  proj.y = originY;
  proj.z = p.z;
  proj.vx = (dx / len) * speed;
  proj.vy = vy;
  proj.vz = (dz / len) * speed;
  proj.life = opts.life ?? 3.2;
  proj.radius = opts.radius ?? 0.55;
  proj.gravity = gravity;
  proj.homing = opts.homing ?? 0;
  proj.scale = scale;
  proj.type = type;
  proj.ability = ability;
  proj.owner = self;
  proj.pierce = opts.pierce ?? 0;
  proj.trail = opts.trail ?? null;
  proj.onImpact = opts.onImpact ?? null;
  proj.applies = opts.applies ?? null;
  proj.knockback = opts.knockback ?? 0;
  proj.spin = opts.spin ?? 0;
  proj.mesh.position.set(proj.x, proj.y, proj.z);
  proj.mesh.lookAt(toX, originY, toZ);
  if (!proj.mesh.parent) ctx.scene.add(proj.mesh);
  else if (proj.mesh.parent !== ctx.scene) {
    proj.mesh.parent.remove(proj.mesh);
    ctx.scene.add(proj.mesh);
  }
  proj.mesh.visible = true;
}

/** Fan of projectiles centred on a heading. */
export function fireSpread(
  self: Combatant,
  ctx: CombatContext,
  toX: number,
  toZ: number,
  count: number,
  spreadDeg: number,
  scale: number,
  type: DamageType,
  ability: string,
  opts: ProjectileOpts = {},
): void {
  const p = self.position();
  const base = angleTo(p.x, p.z, toX, toZ);
  const reach = Math.max(2, dist(p.x, p.z, toX, toZ));
  const half = (spreadDeg * Math.PI) / 360;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = base - half + half * 2 * t;
    fireProjectile(self, ctx, p.x + Math.sin(a) * reach, p.z + Math.cos(a) * reach, scale, type, ability, opts);
  }
}

function tickProjectiles(dt: number, ctx: CombatContext): void {
  for (const p of projectiles) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      retireProjectile(p, ctx);
      continue;
    }
    if (p.homing > 0) {
      const tx = ctx.playerPos.x - p.x;
      const tz = ctx.playerPos.z - p.z;
      const tl = Math.hypot(tx, tz) || 1;
      const speed = Math.hypot(p.vx, p.vz) || 1;
      const k = clamp(p.homing * dt, 0, 1);
      p.vx += ((tx / tl) * speed - p.vx) * k;
      p.vz += ((tz / tl) * speed - p.vz) * k;
      const norm = Math.hypot(p.vx, p.vz) || 1;
      p.vx = (p.vx / norm) * speed;
      p.vz = (p.vz / norm) * speed;
    }
    if (p.gravity > 0) p.vy -= p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.mesh.position.set(p.x, p.y, p.z);
    if (p.spin !== 0) {
      p.mesh.rotation.z += p.spin * dt;
    } else {
      p.mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
    }

    if (p.trail && ctx.rng.next() < dt * 22) {
      ctx.fx.burst(p.trail, p.x, p.y, p.z, { count: 2, color: (p.mesh.material as THREE.MeshBasicMaterial).color.getHex() });
    }

    // Ground, wall, and prop collision.
    let blocked = false;
    const bl = ctx.blockers;
    if (bl) {
      // Props are axis-aligned boxes; expand by the projectile radius so a
      // shot clips the edge of a pillar rather than passing through its corner.
      for (let bi = 0; bi < bl.length; bi++) {
        const b = bl[bi]!;
        const hw = b.w * 0.5 + p.radius * 0.5;
        const hd = b.d * 0.5 + p.radius * 0.5;
        if (Math.abs(p.x - b.x) < hw && Math.abs(p.z - b.z) < hd) {
          blocked = true;
          break;
        }
      }
    }
    if (p.y <= 0.12 || blocked || !ctx.nav.lineOfSight(p.x - p.vx * dt, p.z - p.vz * dt, p.x, p.z)) {
      if (p.onImpact) p.onImpact(p.x, p.z, ctx, p.owner);
      else impactFx(ctx, p.type, p.x, 0.3, p.z, 10);
      retireProjectile(p, ctx);
      continue;
    }

    // Player collision.
    const pd = dist2(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
    if (pd <= p.radius * p.radius && p.owner) {
      hitPlayer(p.owner, ctx, p.scale, p.type, p.ability, {
        knockback: p.knockback || undefined,
        applies: p.applies ?? undefined,
      });
      impactFx(ctx, p.type, p.x, p.y, p.z, 12);
      if (p.onImpact) p.onImpact(p.x, p.z, ctx, p.owner);
      if (p.pierce > 0) p.pierce--;
      else retireProjectile(p, ctx);
    }
  }
}

function retireProjectile(p: Projectile, _ctx: CombatContext): void {
  p.active = false;
  p.mesh.visible = false;
  p.owner = null;
  p.onImpact = null;
}

// ---------------------------------------------------------------------------
// Ground hazards — lava pools, poison clouds, void rifts, ice patches
// ---------------------------------------------------------------------------

interface Hazard {
  active: boolean;
  x: number;
  z: number;
  radius: number;
  life: number;
  maxLife: number;
  tickRate: number;
  accum: number;
  scale: number;
  type: DamageType;
  ability: string;
  owner: Combatant | null;
  mesh: THREE.Mesh;
  applies: StatusApplication[] | null;
  pulse: number;
  /** Hazards that pull the player toward the centre. */
  pull: number;
}

const hazards: Hazard[] = [];
let hazardGeo: THREE.BufferGeometry | null = null;
const hazardMatCache = new Map<number, THREE.MeshBasicMaterial>();

function hazardMaterial(color: number): THREE.MeshBasicMaterial {
  let m = hazardMatCache.get(color);
  if (m) return m;
  m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  hazardMatCache.set(color, m);
  return m;
}

export interface HazardOpts {
  color?: number;
  duration?: number;
  tickRate?: number;
  applies?: StatusApplication[];
  pull?: number;
  decal?: string;
}

/** Drops a persistent damaging zone on the ground. */
export function spawnHazard(
  self: Combatant | null,
  ctx: CombatContext,
  x: number,
  z: number,
  radius: number,
  scale: number,
  type: DamageType,
  ability: string,
  opts: HazardOpts = {},
): void {
  if (!hazardGeo) {
    hazardGeo = new THREE.CircleGeometry(1, 24);
    hazardGeo.rotateX(-Math.PI * 0.5);
  }
  const color = opts.color ?? COLOR_FOR_TYPE[type];
  let h = hazards.find((q) => !q.active);
  if (!h) {
    const mesh = new THREE.Mesh(hazardGeo, hazardMaterial(color));
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    h = {
      active: false,
      x: 0,
      z: 0,
      radius: 1,
      life: 0,
      maxLife: 1,
      tickRate: 2,
      accum: 0,
      scale: 1,
      type: 'fire',
      ability: '',
      owner: null,
      mesh,
      applies: null,
      pulse: 0,
      pull: 0,
    };
    hazards.push(h);
  }
  h.mesh.material = hazardMaterial(color);
  h.active = true;
  h.x = x;
  h.z = z;
  h.radius = radius;
  h.life = opts.duration ?? 6;
  h.maxLife = h.life;
  h.tickRate = opts.tickRate ?? 2;
  h.accum = 0;
  h.scale = scale;
  h.type = type;
  h.ability = ability;
  h.owner = self;
  h.applies = opts.applies ?? null;
  h.pulse = ctx.rng.next() * TAU;
  h.pull = opts.pull ?? 0;
  h.mesh.position.set(x, 0.06, z);
  h.mesh.scale.setScalar(radius);
  h.mesh.visible = true;
  if (h.mesh.parent !== ctx.scene) {
    h.mesh.parent?.remove(h.mesh);
    ctx.scene.add(h.mesh);
  }
  ctx.decals.add(opts.decal ?? (type === 'fire' ? 'scorch' : 'stain'), x, z, radius);
}

function tickHazards(dt: number, ctx: CombatContext): void {
  for (const h of hazards) {
    if (!h.active) continue;
    h.life -= dt;
    if (h.life <= 0) {
      h.active = false;
      h.mesh.visible = false;
      h.owner = null;
      continue;
    }
    const fade = clamp(h.life / Math.max(0.001, h.maxLife * 0.35), 0, 1);
    const mat = h.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = 0.42 * fade;
    h.mesh.scale.setScalar(h.radius * (1 + Math.sin(ctx.elapsed * 3 + h.pulse) * 0.03));
    h.accum += dt;
    const period = 1 / Math.max(0.1, h.tickRate);
    if (h.accum >= period) {
      h.accum -= period;
      if (h.owner && playerInCircle(ctx, h.x, h.z, h.radius)) {
        hitPlayer(h.owner, ctx, h.scale, h.type, h.ability, { applies: h.applies ?? undefined });
      }
      if (ctx.rng.chance(0.5)) {
        const a = ctx.rng.next() * TAU;
        const r = Math.sqrt(ctx.rng.next()) * h.radius;
        ctx.fx.burst(FX_FOR_TYPE[h.type], h.x + Math.sin(a) * r, 0.2, h.z + Math.cos(a) * r, {
          count: 3,
          color: COLOR_FOR_TYPE[h.type],
        });
      }
    }
  }
}

/** How many hazards are live — the AI avoids stacking pools on the same tile. */
export function hazardCount(): number {
  let n = 0;
  for (const h of hazards) if (h.active) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Delayed impacts (meteors, telegraphed slams that resolve after the caster
// has already moved on)
// ---------------------------------------------------------------------------

interface Delayed {
  t: number;
  fn: (ctx: CombatContext) => void;
}

const delayed: Delayed[] = [];

export function after(seconds: number, fn: (ctx: CombatContext) => void): void {
  delayed.push({ t: seconds, fn });
}

function tickDelayed(dt: number, ctx: CombatContext): void {
  for (let i = delayed.length - 1; i >= 0; i--) {
    const d = delayed[i]!;
    d.t -= dt;
    if (d.t <= 0) {
      delayed.splice(i, 1);
      try {
        d.fn(ctx);
      } catch (err) {
        console.error('[abilities] delayed callback threw', err);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Summoning — Enemy.ts installs the factory so this module stays acyclic
// ---------------------------------------------------------------------------

export type SummonFactory = (
  monsterId: string,
  x: number,
  z: number,
  depth: number,
  ctx: CombatContext,
  rank?: string,
) => Enemy | null;

let summonFactory: SummonFactory | null = null;

export function setSummonFactory(fn: SummonFactory): void {
  summonFactory = fn;
}

export function summon(
  self: Combatant,
  ctx: CombatContext,
  monsterId: string,
  count: number,
  spread: number,
  rank?: string,
): Enemy[] {
  if (!summonFactory) return [];
  const out: Enemy[] = [];
  const p = self.position();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + ctx.rng.next() * 0.6;
    const r = spread * (0.55 + ctx.rng.next() * 0.6);
    const tile = ctx.nav.clampToWalkable(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r);
    const e = summonFactory(monsterId, tile.x, tile.y, self.level, ctx, rank);
    if (e) {
      out.push(e);
      ctx.fx.burst('portal', tile.x, 0.6, tile.y, { count: 18, color: 0x9060ff });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// World tick — called once per frame by the first entity to update
// ---------------------------------------------------------------------------

let lastWorldTick = -1;

/**
 * Advances projectiles, hazards and delayed impacts. Safe to call from every
 * entity — it de-dupes on `ctx.elapsed` so the work happens once per frame.
 */
export function tickAbilityWorld(dt: number, ctx: CombatContext): void {
  if (ctx.elapsed === lastWorldTick) return;
  lastWorldTick = ctx.elapsed;
  tickProjectiles(dt, ctx);
  tickHazards(dt, ctx);
  tickDelayed(dt, ctx);
}

/** Clears every transient world object. Scenes call this on teardown. */
export function resetAbilityWorld(): void {
  for (const p of projectiles) {
    p.active = false;
    p.owner = null;
    p.onImpact = null;
    p.mesh.parent?.remove(p.mesh);
  }
  projectiles.length = 0;
  for (const h of hazards) {
    h.active = false;
    h.owner = null;
    h.mesh.parent?.remove(h.mesh);
  }
  hazards.length = 0;
  delayed.length = 0;
  lastWorldTick = -1;
}

/** Releases the pooled GPU resources. */
export function disposeAbilityWorld(): void {
  resetAbilityWorld();
  for (const g of projectileGeoCache.values()) g.dispose();
  projectileGeoCache.clear();
  for (const m of projectileMatCache.values()) m.dispose();
  projectileMatCache.clear();
  for (const m of hazardMatCache.values()) m.dispose();
  hazardMatCache.clear();
  hazardGeo?.dispose();
  hazardGeo = null;
}

// ---------------------------------------------------------------------------
// Motion helpers
// ---------------------------------------------------------------------------

export function dashToward(
  self: Combatant,
  ctx: CombatContext,
  tx: number,
  tz: number,
  speed: number,
  opts?: { arc?: number; trample?: { mul: number; radius: number; type: DamageType }; onLand?: MotionOverride['onLand']; kind?: MotionOverride['kind'] },
): void {
  const p = self.position();
  const clamped = ctx.nav.clampToWalkable(tx, tz);
  const d = dist(p.x, p.z, clamped.x, clamped.y);
  self.motionOverride = {
    kind: opts?.kind ?? 'dash',
    fromX: p.x,
    fromZ: p.z,
    toX: clamped.x,
    toZ: clamped.y,
    t: 0,
    duration: Math.max(0.12, d / Math.max(1, speed)),
    arc: opts?.arc ?? 0,
    onLand: opts?.onLand,
    trample: opts?.trample ? { ...opts.trample, hit: false } : undefined,
  };
  self.facing = angleTo(p.x, p.z, clamped.x, clamped.y);
}

/** Point `range` units past the player, clamped to walkable ground. */
export function overshoot(self: Combatant, ctx: CombatContext, extra: number): { x: number; z: number } {
  const p = self.position();
  const a = angleTo(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
  const d = dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) + extra;
  const t = ctx.nav.clampToWalkable(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d);
  return { x: t.x, z: t.y };
}

/** A walkable point `range` away from the player, away from the caster's side. */
export function retreatPoint(self: Combatant, ctx: CombatContext, range: number): { x: number; z: number } {
  const p = self.position();
  const a = angleTo(ctx.playerPos.x, ctx.playerPos.z, p.x, p.z);
  const t = ctx.nav.clampToWalkable(ctx.playerPos.x + Math.sin(a) * range, ctx.playerPos.z + Math.cos(a) * range);
  return { x: t.x, z: t.y };
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const REG: AbilityDef[] = [];

function def(a: AbilityDef): AbilityDef {
  REG.push(a);
  return a;
}

const P = (self: Combatant): THREE.Vector3 => self.position();

// --- Basic melee -----------------------------------------------------------

def({
  id: 'basic_strike',
  name: 'Strike',
  kind: 'melee',
  cooldown: 0,
  windup: 0.28,
  recovery: 0.18,
  range: 1.9,
  damageMul: 1,
  priority: 0.2,
  rooted: false,
  sfx: 'swing.light',
  onExecute: (self, ctx) => {
    coneHit(self, ctx, 60, 2.4 * self.sizeScale, 1, 'physical', 'basic_strike');
  },
});

def({
  id: 'cleave',
  name: 'Cleave',
  kind: 'cone',
  cooldown: 4.5,
  windup: 0.55,
  recovery: 0.4,
  range: 3.0,
  damageMul: 1.7,
  damageType: 'physical',
  priority: 0.5,
  rooted: true,
  interruptible: false,
  telegraph: { shape: 'cone', size: 3.2, color: 0xff6a4a, atSelf: true },
  sfx: 'swing.heavy',
  onExecute: (self, ctx) => {
    coneHit(self, ctx, 65, 3.4 * self.sizeScale, 1.7, 'physical', 'cleave', { knockback: 1.2 });
    const p = P(self);
    ctx.fx.burst('hit.physical', p.x + Math.sin(self.facing) * 2, 0.9, p.z + Math.cos(self.facing) * 2, { count: 20 });
  },
});

def({
  id: 'double_swipe',
  name: 'Double Swipe',
  kind: 'melee',
  cooldown: 5,
  windup: 0.3,
  recovery: 0.5,
  activeTime: 0.32,
  range: 2.6,
  damageMul: 0.85,
  priority: 0.4,
  onExecute: (self, ctx) => {
    coneHit(self, ctx, 70, 2.8 * self.sizeScale, 0.85, 'physical', 'double_swipe');
  },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    if (inst.tickAccum > 0.22 && inst.data.second !== 1) {
      inst.data.second = 1;
      coneHit(self, ctx, 70, 2.8 * self.sizeScale, 0.95, 'physical', 'double_swipe');
    }
  },
  onEnd: (_s, _c, inst) => {
    inst.data.second = 0;
  },
});

def({
  id: 'heavy_slam',
  name: 'Heavy Slam',
  kind: 'aoe',
  cooldown: 7,
  windup: 1.05,
  recovery: 0.65,
  range: 3.4,
  radius: 3.2,
  damageMul: 2.4,
  damageType: 'physical',
  priority: 0.65,
  rooted: true,
  telegraph: { shape: 'circle', size: 3.2, color: 0xffa040, atSelf: true },
  sfx: 'slam',
  onExecute: (self, ctx) => {
    const p = P(self);
    circleHit(self, ctx, p.x, p.z, 3.4 * self.sizeScale, 2.4, 'physical', 'heavy_slam', { knockback: 3 });
    ctx.fx.burst('bossSlam', p.x, 0.2, p.z, { count: 34 });
    ctx.decals.add('crack', p.x, p.z, 3.2 * self.sizeScale);
  },
});

def({
  id: 'ground_slam',
  name: 'Ground Slam',
  kind: 'aoe',
  cooldown: 9,
  windup: 1.2,
  recovery: 0.8,
  range: 5,
  radius: 4.5,
  damageMul: 2.1,
  damageType: 'physical',
  priority: 0.7,
  rooted: true,
  telegraph: { shape: 'ring', size: 5.2, color: 0xffb060, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    ctx.fx.burst('bossSlam', p.x, 0.15, p.z, { count: 44 });
    ctx.decals.add('crack', p.x, p.z, 4.6 * self.sizeScale);
    // An expanding shockwave: three rings you can outrun.
    for (let ring = 0; ring < 3; ring++) {
      after(0.12 * ring, (c) => {
        const r = (2.0 + ring * 1.6) * self.sizeScale;
        if (
          playerInCircle(c, p.x, p.z, r) &&
          !playerInCircle(c, p.x, p.z, r - 1.5 * self.sizeScale)
        ) {
          hitPlayer(self, c, 2.1, 'physical', 'ground_slam', { knockback: 4 });
        }
        c.fx.burst('dust', p.x, 0.1, p.z, { count: 12, scale: r });
      });
    }
  },
});

def({
  id: 'quake_stomp',
  name: 'Quake Stomp',
  kind: 'aoe',
  cooldown: 12,
  windup: 1.4,
  recovery: 1.0,
  range: 7,
  radius: 6,
  damageMul: 2.6,
  damageType: 'physical',
  priority: 0.75,
  rooted: true,
  telegraph: { shape: 'circle', size: 6.5, color: 0xd0a060, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    circleHit(self, ctx, p.x, p.z, 6.2 * self.sizeScale, 2.6, 'physical', 'quake_stomp', { knockback: 5 });
    // Leaves rubble hazards that block clean kiting lanes.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + ctx.rng.next();
      spawnHazard(self, ctx, p.x + Math.sin(a) * 4, p.z + Math.cos(a) * 4, 1.4, 0.5, 'physical', 'quake_stomp', {
        duration: 5,
        tickRate: 1.5,
        color: 0x9a8060,
      });
    }
  },
});

def({
  id: 'whirlwind',
  name: 'Whirlwind',
  kind: 'aoe',
  cooldown: 11,
  windup: 0.7,
  activeTime: 2.6,
  recovery: 0.7,
  range: 3.2,
  radius: 3,
  damageMul: 0.8,
  damageType: 'physical',
  priority: 0.6,
  telegraph: { shape: 'ring', size: 3.2, color: 0xff8060, atSelf: true },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    self.root.rotation.y += dt * 13;
    if (inst.tickAccum >= 0.35) {
      inst.tickAccum -= 0.35;
      const p = P(self);
      circleHit(self, ctx, p.x, p.z, 3.0 * self.sizeScale, 0.8, 'physical', 'whirlwind');
    }
  },
});

def({
  id: 'shield_bash',
  name: 'Shield Bash',
  kind: 'melee',
  cooldown: 6.5,
  windup: 0.6,
  recovery: 0.55,
  range: 2.6,
  damageMul: 1.4,
  priority: 0.55,
  rooted: true,
  telegraph: { shape: 'cone', size: 2.8, color: 0xc0c8d8, atSelf: true },
  onExecute: (self, ctx) => {
    coneHit(self, ctx, 45, 3 * self.sizeScale, 1.4, 'physical', 'shield_bash', {
      knockback: 4.5,
      applies: [{ id: 'stun', duration: 0.9, magnitude: 1 }],
    });
  },
});

def({
  id: 'impale',
  name: 'Impale',
  kind: 'melee',
  cooldown: 8,
  windup: 0.85,
  recovery: 0.6,
  range: 4.5,
  damageMul: 2.2,
  priority: 0.6,
  rooted: true,
  telegraph: { shape: 'line', size: 5, color: 0xff5555, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    const tx = p.x + Math.sin(self.facing) * 5 * self.sizeScale;
    const tz = p.z + Math.cos(self.facing) * 5 * self.sizeScale;
    lineHit(self, ctx, tx, tz, 0.8, 2.2, 'physical', 'impale', {
      applies: [{ id: 'bleed', duration: 5, magnitude: 1 }],
    });
    ctx.fx.burst('blood', tx, 0.8, tz, { count: 14 });
  },
});

def({
  id: 'rend',
  name: 'Rend',
  kind: 'melee',
  cooldown: 7,
  windup: 0.45,
  recovery: 0.4,
  range: 2.4,
  damageMul: 1.2,
  priority: 0.5,
  onExecute: (self, ctx) => {
    coneHit(self, ctx, 70, 2.6 * self.sizeScale, 1.2, 'physical', 'rend', {
      applies: [{ id: 'bleed', duration: 8, magnitude: 1.6, stacks: 1 }],
    });
  },
});

def({
  id: 'tail_sweep',
  name: 'Tail Sweep',
  kind: 'cone',
  cooldown: 8,
  windup: 0.75,
  recovery: 0.5,
  range: 4,
  damageMul: 1.6,
  priority: 0.5,
  rooted: true,
  telegraph: { shape: 'ring', size: 4.2, color: 0xc09050, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    if (playerInCircle(ctx, p.x, p.z, 4.2 * self.sizeScale) && !playerInCircle(ctx, p.x, p.z, 1.2)) {
      hitPlayer(self, ctx, 1.6, 'physical', 'tail_sweep', { knockback: 5 });
    }
    ctx.fx.burst('dust', p.x, 0.2, p.z, { count: 18, scale: 4 });
  },
});

def({
  id: 'gore_charge',
  name: 'Gore',
  kind: 'movement',
  cooldown: 10,
  windup: 0.95,
  recovery: 0.9,
  range: 16,
  minRange: 4,
  damageMul: 2.3,
  priority: 0.8,
  rooted: true,
  requiresLos: true,
  telegraph: { shape: 'line', size: 16, color: 0xff4030, atSelf: true },
  sfx: 'roar',
  onStart: (self, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
    inst.facing = angleTo(P(self).x, P(self).z, inst.targetX, inst.targetZ);
    self.facing = inst.facing;
  },
  onExecute: (self, ctx, inst) => {
    // Charges to where the player WAS — baiting it sideways is the counter.
    const p = P(self);
    const d = dist(p.x, p.z, inst.targetX, inst.targetZ) + 3;
    dashToward(
      self,
      ctx,
      p.x + Math.sin(inst.facing) * d,
      p.z + Math.cos(inst.facing) * d,
      18,
      { trample: { mul: 2.3, radius: 1.5 * self.sizeScale, type: 'physical' } },
    );
  },
});

def({
  id: 'charge',
  name: 'Charge',
  kind: 'movement',
  cooldown: 9,
  windup: 0.7,
  recovery: 0.7,
  range: 14,
  minRange: 3.5,
  damageMul: 1.8,
  priority: 0.75,
  rooted: true,
  requiresLos: true,
  telegraph: { shape: 'line', size: 12, color: 0xffa030, atSelf: true },
  onStart: (self, ctx, inst) => {
    inst.facing = angleTo(P(self).x, P(self).z, ctx.playerPos.x, ctx.playerPos.z);
    self.facing = inst.facing;
  },
  onExecute: (self, ctx, inst) => {
    const p = P(self);
    dashToward(self, ctx, p.x + Math.sin(inst.facing) * 12, p.z + Math.cos(inst.facing) * 12, 16, {
      trample: { mul: 1.8, radius: 1.3 * self.sizeScale, type: 'physical' },
    });
  },
});

def({
  id: 'leap_slam',
  name: 'Leap Slam',
  kind: 'movement',
  cooldown: 10,
  windup: 0.6,
  recovery: 0.75,
  range: 13,
  minRange: 4,
  damageMul: 2.0,
  priority: 0.8,
  rooted: true,
  telegraph: { shape: 'circle', size: 3.2, color: 0xff7040 },
  onStart: (self, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onExecute: (self, ctx, inst) => {
    dashToward(self, ctx, inst.targetX, inst.targetZ, 15, {
      arc: 3.2,
      kind: 'leap',
      onLand: (s, c) => {
        const p = P(s);
        circleHit(s, c, p.x, p.z, 3.2 * s.sizeScale, 2.0, 'physical', 'leap_slam', { knockback: 3.5 });
        c.fx.burst('bossSlam', p.x, 0.15, p.z, { count: 30 });
        c.decals.add('crack', p.x, p.z, 3);
      },
    });
  },
});

def({
  id: 'ambush_leap',
  name: 'Pounce',
  kind: 'movement',
  cooldown: 7,
  windup: 0.32,
  recovery: 0.5,
  range: 9,
  minRange: 3,
  damageMul: 1.7,
  priority: 0.9,
  rooted: true,
  onExecute: (self, ctx) => {
    dashToward(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 17, {
      arc: 2.2,
      kind: 'leap',
      onLand: (s, c) => {
        const p = P(s);
        if (playerInCircle(c, p.x, p.z, 2.4 * s.sizeScale)) {
          hitPlayer(s, c, 1.7, 'physical', 'ambush_leap', {
            applies: [{ id: 'slow', duration: 1.5, magnitude: 0.3 }],
          });
        }
      },
    });
  },
});

def({
  id: 'knockback_punt',
  name: 'Punt',
  kind: 'melee',
  cooldown: 9,
  windup: 0.6,
  recovery: 0.6,
  range: 2.8,
  damageMul: 1.1,
  priority: 0.45,
  telegraph: { shape: 'cone', size: 3, color: 0xd0d0f0, atSelf: true },
  onExecute: (self, ctx) => {
    coneHit(self, ctx, 55, 3 * self.sizeScale, 1.1, 'physical', 'knockback_punt', { knockback: 8 });
  },
});

def({
  id: 'grapple_pull',
  name: 'Hooked Chain',
  kind: 'ranged',
  cooldown: 11,
  windup: 0.8,
  recovery: 0.7,
  range: 12,
  minRange: 3,
  damageMul: 1.0,
  priority: 0.6,
  rooted: true,
  requiresLos: true,
  telegraph: { shape: 'line', size: 12, color: 0xb0a080, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    const tx = p.x + Math.sin(self.facing) * 12;
    const tz = p.z + Math.cos(self.facing) * 12;
    if (lineHit(self, ctx, tx, tz, 1.0, 1.0, 'physical', 'grapple_pull', { knockback: -7 })) {
      ctx.fx.burst('hit.physical', ctx.playerPos.x, 1, ctx.playerPos.z, { count: 10 });
    }
  },
});

def({
  id: 'execute_low',
  name: 'Execute',
  kind: 'melee',
  cooldown: 14,
  windup: 1.1,
  recovery: 0.9,
  range: 2.6,
  damageMul: 4.0,
  priority: 0.95,
  rooted: true,
  interruptible: true,
  telegraph: { shape: 'circle', size: 2.8, color: 0xff2020, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    circleHit(self, ctx, p.x, p.z, 2.8 * self.sizeScale, 4.0, 'physical', 'execute_low');
  },
});

// --- Ranged ----------------------------------------------------------------

def({
  id: 'arrow_shot',
  name: 'Arrow',
  kind: 'ranged',
  cooldown: 1.8,
  windup: 0.5,
  recovery: 0.25,
  range: 16,
  minRange: 3,
  damageMul: 1.0,
  requiresLos: true,
  priority: 0.4,
  rooted: true,
  onExecute: (self, ctx) => {
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 1.0, 'physical', 'arrow_shot', {
      shape: 'bolt',
      color: 0xd8c898,
      speed: 24,
    });
  },
});

def({
  id: 'arrow_volley',
  name: 'Volley',
  kind: 'ranged',
  cooldown: 8,
  windup: 0.9,
  recovery: 0.6,
  range: 18,
  minRange: 4,
  damageMul: 0.75,
  requiresLos: true,
  priority: 0.6,
  rooted: true,
  telegraph: { shape: 'cone', size: 18, color: 0xd8c898, atSelf: true },
  onExecute: (self, ctx) => {
    fireSpread(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 5, 34, 0.75, 'physical', 'arrow_volley', {
      shape: 'bolt',
      color: 0xd8c898,
      speed: 22,
    });
  },
});

def({
  id: 'piercing_shot',
  name: 'Piercing Shot',
  kind: 'ranged',
  cooldown: 6,
  windup: 1.0,
  recovery: 0.5,
  range: 20,
  minRange: 5,
  damageMul: 2.0,
  requiresLos: true,
  priority: 0.65,
  rooted: true,
  interruptible: true,
  telegraph: { shape: 'line', size: 20, color: 0xffd0a0, atSelf: true },
  onExecute: (self, ctx) => {
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 2.0, 'physical', 'piercing_shot', {
      shape: 'bolt',
      color: 0xffd0a0,
      speed: 34,
      pierce: 2,
      scaleMul: 1.4,
    });
  },
});

def({
  id: 'crossbow_bolt',
  name: 'Bolt',
  kind: 'ranged',
  cooldown: 3.0,
  windup: 0.65,
  recovery: 0.5,
  range: 17,
  minRange: 3,
  damageMul: 1.4,
  requiresLos: true,
  priority: 0.45,
  rooted: true,
  onExecute: (self, ctx) => {
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 1.4, 'physical', 'crossbow_bolt', {
      shape: 'bolt',
      color: 0xb8b0a0,
      speed: 30,
      knockback: 0.6,
    });
  },
});

def({
  id: 'ballista_bolt',
  name: 'Ballista Bolt',
  kind: 'ranged',
  cooldown: 7,
  windup: 1.6,
  recovery: 1.1,
  range: 26,
  minRange: 6,
  damageMul: 3.2,
  requiresLos: true,
  priority: 0.8,
  rooted: true,
  interruptible: true,
  telegraph: { shape: 'line', size: 26, color: 0xff8844, atSelf: true },
  onExecute: (self, ctx) => {
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 3.2, 'physical', 'ballista_bolt', {
      shape: 'bolt',
      color: 0xff8844,
      speed: 40,
      pierce: 3,
      scaleMul: 2.2,
      knockback: 3,
    });
  },
});

def({
  id: 'javelin_toss',
  name: 'Javelin',
  kind: 'ranged',
  cooldown: 4.5,
  windup: 0.7,
  recovery: 0.4,
  range: 13,
  minRange: 3,
  damageMul: 1.5,
  requiresLos: true,
  priority: 0.5,
  rooted: true,
  onExecute: (self, ctx) => {
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 1.5, 'physical', 'javelin_toss', {
      shape: 'bolt',
      color: 0xa89880,
      speed: 20,
      scaleMul: 1.6,
      applies: [{ id: 'bleed', duration: 4, magnitude: 1 }],
    });
  },
});

def({
  id: 'stone_hurl',
  name: 'Hurl Boulder',
  kind: 'ranged',
  cooldown: 6.5,
  windup: 1.0,
  recovery: 0.7,
  range: 15,
  minRange: 4,
  damageMul: 1.9,
  priority: 0.55,
  rooted: true,
  telegraph: { shape: 'circle', size: 2.2, color: 0x9a8878 },
  onStart: (_s, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onExecute: (self, ctx, inst) => {
    fireProjectile(self, ctx, inst.targetX, inst.targetZ, 1.9, 'physical', 'stone_hurl', {
      shape: 'rock',
      color: 0x9a8878,
      speed: 12,
      gravity: 9,
      spin: 7,
      radius: 1.0,
      onImpact: (x, z, c, owner) => {
        if (owner) circleHit(owner, c, x, z, 2.2, 1.9, 'physical', 'stone_hurl', { knockback: 2 });
      },
    });
  },
});

def({
  id: 'bomb_lob',
  name: 'Firebomb',
  kind: 'ranged',
  cooldown: 7,
  windup: 0.8,
  recovery: 0.6,
  range: 14,
  minRange: 4.5,
  damageMul: 1.8,
  damageType: 'fire',
  priority: 0.65,
  rooted: true,
  telegraph: { shape: 'circle', size: 2.6, color: 0xff8020 },
  onStart: (_s, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onExecute: (self, ctx, inst) => {
    fireProjectile(self, ctx, inst.targetX, inst.targetZ, 1.8, 'fire', 'bomb_lob', {
      shape: 'blob',
      color: 0xff8020,
      speed: 11,
      gravity: 9,
      radius: 0.9,
      onImpact: (x, z, c, owner) => {
        if (!owner) return;
        circleHit(owner, c, x, z, 2.6, 1.8, 'fire', 'bomb_lob');
        spawnHazard(owner, c, x, z, 1.9, 0.35, 'fire', 'bomb_lob', { duration: 3.5, tickRate: 3 });
      },
    });
  },
});

def({
  id: 'caltrops',
  name: 'Caltrops',
  kind: 'ranged',
  cooldown: 12,
  windup: 0.35,
  recovery: 0.3,
  range: 8,
  damageMul: 0.5,
  priority: 0.7,
  onExecute: (self, ctx) => {
    // Dropped between the archer and the player as it backpedals.
    const p = P(self);
    const a = angleTo(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z);
    for (let i = -1; i <= 1; i++) {
      const off = a + i * 0.5;
      const t = ctx.nav.clampToWalkable(p.x + Math.sin(off) * 2.4, p.z + Math.cos(off) * 2.4);
      spawnHazard(self, ctx, t.x, t.y, 1.3, 0.4, 'physical', 'caltrops', {
        duration: 14,
        tickRate: 1.2,
        color: 0xa0a0b0,
        applies: [{ id: 'slow', duration: 1.2, magnitude: 0.35 }],
      });
    }
  },
});

def({
  id: 'quill_burst',
  name: 'Quill Burst',
  kind: 'aoe',
  cooldown: 8,
  windup: 0.7,
  recovery: 0.5,
  range: 9,
  damageMul: 0.7,
  priority: 0.6,
  rooted: true,
  telegraph: { shape: 'ring', size: 9, color: 0xc8b090, atSelf: true },
  onExecute: (self, ctx) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const p = P(self);
      fireProjectile(self, ctx, p.x + Math.sin(a) * 10, p.z + Math.cos(a) * 10, 0.7, 'physical', 'quill_burst', {
        shape: 'shard',
        color: 0xc8b090,
        speed: 15,
      });
    }
  },
});

def({
  id: 'bone_shard_spray',
  name: 'Bone Spray',
  kind: 'cone',
  cooldown: 7,
  windup: 0.75,
  recovery: 0.5,
  range: 11,
  damageMul: 0.6,
  priority: 0.55,
  rooted: true,
  telegraph: { shape: 'cone', size: 11, color: 0xe8e0c8, atSelf: true },
  onExecute: (self, ctx) => {
    fireSpread(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 7, 50, 0.6, 'physical', 'bone_shard_spray', {
      shape: 'shard',
      color: 0xe8e0c8,
      speed: 18,
    });
  },
});

def({
  id: 'acid_spit',
  name: 'Acid Spit',
  kind: 'ranged',
  cooldown: 4,
  windup: 0.6,
  recovery: 0.4,
  range: 12,
  minRange: 2,
  damageMul: 1.2,
  damageType: 'poison',
  requiresLos: true,
  priority: 0.5,
  rooted: true,
  onExecute: (self, ctx) => {
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 1.2, 'poison', 'acid_spit', {
      shape: 'blob',
      color: 0x9ce03a,
      speed: 14,
      applies: [{ id: 'poison', duration: 5, magnitude: 1.2 }],
      onImpact: (x, z, c, owner) => {
        if (owner) spawnHazard(owner, c, x, z, 1.6, 0.3, 'poison', 'acid_spit', { duration: 4, tickRate: 2 });
      },
    });
  },
});

def({
  id: 'poison_spit',
  name: 'Venom Spray',
  kind: 'cone',
  cooldown: 6.5,
  windup: 0.8,
  recovery: 0.5,
  range: 8,
  damageMul: 1.1,
  damageType: 'poison',
  priority: 0.6,
  rooted: true,
  telegraph: { shape: 'cone', size: 8, color: 0x8ee04a, atSelf: true },
  onExecute: (self, ctx) => {
    coneHit(self, ctx, 32, 8.5, 1.1, 'poison', 'poison_spit', {
      applies: [{ id: 'poison', duration: 7, magnitude: 1.8, stacks: 2 }],
    });
    const p = P(self);
    for (let i = 0; i < 3; i++) {
      const d = 3 + i * 2.2;
      spawnHazard(
        self,
        ctx,
        p.x + Math.sin(self.facing) * d,
        p.z + Math.cos(self.facing) * d,
        1.5,
        0.3,
        'poison',
        'poison_spit',
        { duration: 5, tickRate: 2 },
      );
    }
  },
});

def({
  id: 'web_snare',
  name: 'Web Snare',
  kind: 'ranged',
  cooldown: 10,
  windup: 0.55,
  recovery: 0.4,
  range: 13,
  minRange: 2.5,
  damageMul: 0.4,
  requiresLos: true,
  priority: 0.75,
  rooted: true,
  onExecute: (self, ctx) => {
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 0.4, 'physical', 'web_snare', {
      shape: 'blob',
      color: 0xdcdce8,
      speed: 16,
      radius: 0.9,
      applies: [{ id: 'root', duration: 1.6, magnitude: 1 }],
      onImpact: (x, z, c, owner) => {
        if (owner)
          spawnHazard(owner, c, x, z, 2.2, 0.15, 'physical', 'web_snare', {
            duration: 9,
            tickRate: 1,
            color: 0xdcdce8,
            applies: [{ id: 'slow', duration: 1.2, magnitude: 0.5 }],
          });
      },
    });
  },
});

def({
  id: 'spore_burst',
  name: 'Spore Burst',
  kind: 'aoe',
  cooldown: 9,
  windup: 0.9,
  recovery: 0.6,
  range: 6,
  radius: 4,
  damageMul: 1.0,
  damageType: 'poison',
  priority: 0.6,
  rooted: true,
  telegraph: { shape: 'circle', size: 4.2, color: 0xa8e060, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    circleHit(self, ctx, p.x, p.z, 4.2, 1.0, 'poison', 'spore_burst', {
      applies: [{ id: 'poison', duration: 8, magnitude: 1.4 }],
    });
    spawnHazard(self, ctx, p.x, p.z, 3.4, 0.3, 'poison', 'spore_burst', { duration: 7, tickRate: 1.5 });
  },
});

// --- Elemental casts -------------------------------------------------------

def({
  id: 'fire_bolt',
  name: 'Fire Bolt',
  kind: 'ranged',
  cooldown: 2.6,
  windup: 0.75,
  recovery: 0.35,
  range: 15,
  minRange: 3,
  damageMul: 1.3,
  damageType: 'fire',
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.45,
  onExecute: (self, ctx) => {
    self.flashCast(0xff7a22);
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 1.3, 'fire', 'fire_bolt', {
      shape: 'orb',
      speed: 15,
      applies: [{ id: 'burn', duration: 3, magnitude: 1 }],
    });
  },
});

def({
  id: 'frost_bolt',
  name: 'Frost Bolt',
  kind: 'ranged',
  cooldown: 3.0,
  windup: 0.8,
  recovery: 0.35,
  range: 15,
  minRange: 3,
  damageMul: 1.2,
  damageType: 'cold',
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.45,
  onExecute: (self, ctx) => {
    self.flashCast(0x88d8ff);
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 1.2, 'cold', 'frost_bolt', {
      shape: 'shard',
      speed: 14,
      applies: [{ id: 'chill', duration: 3.5, magnitude: 0.35 }],
    });
  },
});

def({
  id: 'shock_bolt',
  name: 'Shock',
  kind: 'ranged',
  cooldown: 2.2,
  windup: 0.6,
  recovery: 0.3,
  range: 14,
  minRange: 2.5,
  damageMul: 1.15,
  damageType: 'lightning',
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.45,
  onExecute: (self, ctx) => {
    self.flashCast(0xffe066);
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 1.15, 'lightning', 'shock_bolt', {
      shape: 'shard',
      speed: 26,
    });
  },
});

def({
  id: 'arcane_orb',
  name: 'Arcane Orb',
  kind: 'ranged',
  cooldown: 6,
  windup: 1.0,
  recovery: 0.5,
  range: 17,
  minRange: 4,
  damageMul: 1.8,
  damageType: 'arcane',
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.6,
  telegraph: { shape: 'circle', size: 1.6, color: 0xc060ff, atSelf: true },
  onExecute: (self, ctx) => {
    self.flashCast(0xc060ff);
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 1.8, 'arcane', 'arcane_orb', {
      shape: 'orb',
      speed: 8,
      homing: 1.6,
      scaleMul: 1.8,
      radius: 0.9,
      life: 6,
    });
  },
});

def({
  id: 'homing_bolt',
  name: 'Seeker',
  kind: 'ranged',
  cooldown: 7,
  windup: 0.9,
  recovery: 0.5,
  range: 20,
  minRange: 3,
  damageMul: 1.1,
  damageType: 'arcane',
  interruptible: true,
  rooted: true,
  priority: 0.6,
  onExecute: (self, ctx) => {
    self.flashCast(0xc060ff);
    for (let i = 0; i < 3; i++) {
      after(i * 0.18, (c) => {
        if (!self.alive) return;
        fireProjectile(self, c, c.playerPos.x, c.playerPos.z, 1.1, 'arcane', 'homing_bolt', {
          shape: 'orb',
          speed: 10,
          homing: 2.4,
          life: 5,
        });
      });
    }
  },
});

def({
  id: 'chain_lightning',
  name: 'Chain Lightning',
  kind: 'beam',
  cooldown: 9,
  windup: 1.1,
  recovery: 0.6,
  range: 15,
  damageMul: 1.9,
  damageType: 'lightning',
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.7,
  telegraph: { shape: 'line', size: 15, color: 0xffe066, atSelf: true },
  onExecute: (self, ctx) => {
    self.flashCast(0xffe066);
    const p = P(self);
    // Arcs along the ground: three staggered ticks the player can run out of.
    let ax = p.x;
    let az = p.z;
    for (let i = 0; i < 3; i++) {
      const t = (i + 1) / 3;
      const bx = ax + (ctx.playerPos.x - p.x) * (t / 3) * 3;
      const bz = az + (ctx.playerPos.z - p.z) * (t / 3) * 3;
      ctx.fx.burst('shock', bx, 0.9, bz, { count: 10, color: 0xffe066 });
      ax = bx;
      az = bz;
    }
    if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) < 15 && ctx.nav.lineOfSight(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z)) {
      hitPlayer(self, ctx, 1.9, 'lightning', 'chain_lightning', {
        applies: [{ id: 'shocked', duration: 3, magnitude: 1 }],
      });
    }
  },
});

def({
  id: 'meteor',
  name: 'Meteor',
  kind: 'aoe',
  cooldown: 14,
  windup: 1.3,
  recovery: 0.9,
  range: 22,
  radius: 3.6,
  damageMul: 3.0,
  damageType: 'fire',
  interruptible: true,
  rooted: true,
  priority: 0.85,
  telegraph: { shape: 'circle', size: 3.8, color: 0xff5a20 },
  onStart: (_s, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onExecute: (self, ctx, inst) => {
    self.flashCast(0xff5a20);
    const tx = inst.targetX;
    const tz = inst.targetZ;
    const tel = ctx.decals.telegraph('circle', tx, tz, 3.8, 0, 0.75, 0xff5a20);
    after(0.75, (c) => {
      tel.cancel();
      circleHit(self, c, tx, tz, 3.8, 3.0, 'fire', 'meteor', { knockback: 3 });
      c.fx.burst('hit.fire', tx, 0.4, tz, { count: 50, scale: 3 });
      c.decals.add('scorch', tx, tz, 3.6);
      spawnHazard(self, c, tx, tz, 2.4, 0.45, 'fire', 'meteor', { duration: 5, tickRate: 2 });
    });
  },
});

def({
  id: 'firestorm',
  name: 'Firestorm',
  kind: 'aoe',
  cooldown: 18,
  windup: 1.4,
  activeTime: 5,
  recovery: 1.0,
  range: 20,
  radius: 9,
  damageMul: 1.4,
  damageType: 'fire',
  interruptible: true,
  rooted: true,
  priority: 0.9,
  telegraph: { shape: 'ring', size: 9, color: 0xff7020, atSelf: true },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    if (inst.tickAccum < 0.45) return;
    inst.tickAccum -= 0.45;
    const p = P(self);
    const a = ctx.rng.next() * TAU;
    const r = Math.sqrt(ctx.rng.next()) * 8;
    const tx = p.x + Math.sin(a) * r;
    const tz = p.z + Math.cos(a) * r;
    const tel = ctx.decals.telegraph('circle', tx, tz, 2.2, 0, 0.6, 0xff7020);
    after(0.6, (c) => {
      tel.cancel();
      circleHit(self, c, tx, tz, 2.2, 1.4, 'fire', 'firestorm');
    });
  },
});

def({
  id: 'lava_pool',
  name: 'Magma Well',
  kind: 'aoe',
  cooldown: 11,
  windup: 0.9,
  recovery: 0.6,
  range: 16,
  radius: 3,
  damageMul: 0.7,
  damageType: 'fire',
  interruptible: true,
  rooted: true,
  priority: 0.7,
  telegraph: { shape: 'circle', size: 3, color: 0xff4400 },
  onStart: (_s, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onExecute: (self, ctx, inst) => {
    spawnHazard(self, ctx, inst.targetX, inst.targetZ, 3.0, 0.7, 'fire', 'lava_pool', {
      duration: 11,
      tickRate: 2.5,
      applies: [{ id: 'burn', duration: 2, magnitude: 1 }],
    });
  },
});

def({
  id: 'molten_trail',
  name: 'Molten Trail',
  kind: 'aura',
  cooldown: 1.2,
  windup: 0,
  recovery: 0,
  range: 99,
  damageMul: 0.35,
  damageType: 'fire',
  priority: 0.05,
  onExecute: (self, ctx) => {
    const p = P(self);
    spawnHazard(self, ctx, p.x, p.z, 1.4 * self.sizeScale, 0.35, 'fire', 'molten_trail', {
      duration: 4,
      tickRate: 2.5,
    });
  },
});

def({
  id: 'ice_nova',
  name: 'Ice Nova',
  kind: 'aoe',
  cooldown: 9,
  windup: 0.8,
  recovery: 0.55,
  range: 6,
  radius: 5.5,
  damageMul: 1.7,
  damageType: 'cold',
  interruptible: true,
  rooted: true,
  priority: 0.7,
  telegraph: { shape: 'ring', size: 5.6, color: 0x88d8ff, atSelf: true },
  onExecute: (self, ctx) => {
    self.flashCast(0x88d8ff);
    const p = P(self);
    circleHit(self, ctx, p.x, p.z, 5.6 * self.sizeScale, 1.7, 'cold', 'ice_nova', {
      applies: [{ id: 'chill', duration: 4, magnitude: 0.45 }],
    });
    ctx.fx.burst('frost', p.x, 0.5, p.z, { count: 40, scale: 5 });
  },
});

def({
  id: 'frozen_pulse',
  name: 'Frozen Pulse',
  kind: 'aoe',
  cooldown: 6,
  windup: 0.5,
  recovery: 0.4,
  range: 12,
  damageMul: 0.9,
  damageType: 'cold',
  priority: 0.4,
  onExecute: (self, ctx) => {
    const p = P(self);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + ctx.elapsed;
      fireProjectile(self, ctx, p.x + Math.sin(a) * 12, p.z + Math.cos(a) * 12, 0.9, 'cold', 'frozen_pulse', {
        shape: 'shard',
        speed: 9,
        life: 2.4,
        applies: [{ id: 'chill', duration: 3, magnitude: 0.3 }],
      });
    }
  },
});

def({
  id: 'blizzard',
  name: 'Blizzard',
  kind: 'aoe',
  cooldown: 16,
  windup: 1.5,
  activeTime: 6,
  recovery: 1.0,
  range: 18,
  radius: 6,
  damageMul: 0.6,
  damageType: 'cold',
  interruptible: true,
  rooted: true,
  priority: 0.8,
  telegraph: { shape: 'circle', size: 6.2, color: 0x9ce0ff },
  onStart: (_s, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onExecute: (self, ctx, inst) => {
    spawnHazard(self, ctx, inst.targetX, inst.targetZ, 6.2, 0.6, 'cold', 'blizzard', {
      duration: 6,
      tickRate: 2,
      applies: [{ id: 'chill', duration: 2, magnitude: 0.4 }],
    });
  },
});

def({
  id: 'cone_breath_fire',
  name: 'Flame Breath',
  kind: 'cone',
  cooldown: 11,
  windup: 1.15,
  activeTime: 1.6,
  recovery: 0.8,
  range: 10,
  damageMul: 0.85,
  damageType: 'fire',
  interruptible: false,
  rooted: true,
  priority: 0.8,
  telegraph: { shape: 'cone', size: 10, color: 0xff6a20, atSelf: true },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    if (inst.tickAccum < 0.2) return;
    inst.tickAccum -= 0.2;
    coneHit(self, ctx, 30, 10 * self.sizeScale, 0.85, 'fire', 'cone_breath_fire', {
      applies: [{ id: 'burn', duration: 3, magnitude: 1.2 }],
    });
    const p = P(self);
    ctx.fx.burst('hit.fire', p.x + Math.sin(self.facing) * 4, 1.2, p.z + Math.cos(self.facing) * 4, {
      count: 14,
      scale: 3,
    });
  },
});

def({
  id: 'cone_breath_frost',
  name: 'Rime Breath',
  kind: 'cone',
  cooldown: 12,
  windup: 1.2,
  activeTime: 1.5,
  recovery: 0.8,
  range: 9,
  damageMul: 0.8,
  damageType: 'cold',
  rooted: true,
  priority: 0.8,
  telegraph: { shape: 'cone', size: 9, color: 0x9ce0ff, atSelf: true },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    if (inst.tickAccum < 0.22) return;
    inst.tickAccum -= 0.22;
    coneHit(self, ctx, 32, 9 * self.sizeScale, 0.8, 'cold', 'cone_breath_frost', {
      applies: [{ id: 'chill', duration: 3, magnitude: 0.5 }],
    });
  },
});

def({
  id: 'cone_breath_poison',
  name: 'Miasma Breath',
  kind: 'cone',
  cooldown: 12,
  windup: 1.1,
  activeTime: 1.8,
  recovery: 0.8,
  range: 9,
  damageMul: 0.7,
  damageType: 'poison',
  rooted: true,
  priority: 0.78,
  telegraph: { shape: 'cone', size: 9, color: 0x8ee04a, atSelf: true },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    if (inst.tickAccum < 0.25) return;
    inst.tickAccum -= 0.25;
    coneHit(self, ctx, 34, 9 * self.sizeScale, 0.7, 'poison', 'cone_breath_poison', {
      applies: [{ id: 'poison', duration: 6, magnitude: 1.5 }],
    });
  },
});

def({
  id: 'cone_breath_void',
  name: 'Unmaking Breath',
  kind: 'cone',
  cooldown: 13,
  windup: 1.35,
  activeTime: 1.7,
  recovery: 0.9,
  range: 11,
  damageMul: 1.0,
  damageType: 'arcane',
  rooted: true,
  priority: 0.85,
  telegraph: { shape: 'cone', size: 11, color: 0xc060ff, atSelf: true },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    if (inst.tickAccum < 0.2) return;
    inst.tickAccum -= 0.2;
    coneHit(self, ctx, 28, 11 * self.sizeScale, 1.0, 'arcane', 'cone_breath_void');
  },
});

def({
  id: 'death_beam',
  name: 'Annihilation Beam',
  kind: 'beam',
  cooldown: 16,
  windup: 1.6,
  activeTime: 3.0,
  recovery: 1.2,
  range: 24,
  damageMul: 0.9,
  damageType: 'arcane',
  rooted: true,
  interruptible: true,
  priority: 0.95,
  telegraph: { shape: 'line', size: 24, color: 0xff40ff, atSelf: true },
  onTick: (self, ctx, inst, dt) => {
    // The beam sweeps — stand behind the caster or run with it.
    self.facing += angleDelta(self.facing, angleTo(P(self).x, P(self).z, ctx.playerPos.x, ctx.playerPos.z)) * clamp(dt * 0.9, 0, 1);
    inst.tickAccum += dt;
    if (inst.tickAccum < 0.15) return;
    inst.tickAccum -= 0.15;
    const p = P(self);
    const tx = p.x + Math.sin(self.facing) * 24;
    const tz = p.z + Math.cos(self.facing) * 24;
    ctx.fx.burst('void', (p.x + tx) * 0.5, 1.2, (p.z + tz) * 0.5, { count: 8, color: 0xff40ff });
    lineHit(self, ctx, tx, tz, 1.1, 0.9, 'arcane', 'death_beam');
  },
});

def({
  id: 'life_drain',
  name: 'Life Drain',
  kind: 'beam',
  cooldown: 12,
  windup: 0.9,
  activeTime: 2.4,
  recovery: 0.7,
  range: 11,
  damageMul: 0.7,
  damageType: 'arcane',
  rooted: true,
  interruptible: true,
  priority: 0.7,
  telegraph: { shape: 'line', size: 11, color: 0x9040c0, atSelf: true },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    if (inst.tickAccum < 0.3) return;
    inst.tickAccum -= 0.3;
    const p = P(self);
    if (dist(p.x, p.z, ctx.playerPos.x, ctx.playerPos.z) > 12) return;
    const packet = hitPlayer(self, ctx, 0.7, 'arcane', 'life_drain');
    self.heal(packet.amount * 0.6, ctx);
    ctx.fx.burst('heal', p.x, 1.2 * self.sizeScale, p.z, { count: 6, color: 0x9040c0 });
  },
});

def({
  id: 'void_rift',
  name: 'Void Rift',
  kind: 'aoe',
  cooldown: 15,
  windup: 1.3,
  recovery: 0.9,
  range: 16,
  radius: 4,
  damageMul: 0.8,
  damageType: 'arcane',
  interruptible: true,
  rooted: true,
  priority: 0.85,
  telegraph: { shape: 'ring', size: 4.2, color: 0x8020c0 },
  onStart: (_s, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onExecute: (self, ctx, inst) => {
    spawnHazard(self, ctx, inst.targetX, inst.targetZ, 4.0, 0.8, 'arcane', 'void_rift', {
      duration: 8,
      tickRate: 2,
      pull: 3.5,
      color: 0x8020c0,
    });
    ctx.fx.burst('void', inst.targetX, 0.6, inst.targetZ, { count: 34 });
  },
});

def({
  id: 'vortex_pull',
  name: 'Vortex',
  kind: 'aoe',
  cooldown: 14,
  windup: 1.0,
  activeTime: 2.2,
  recovery: 0.8,
  range: 12,
  radius: 8,
  damageMul: 0.5,
  damageType: 'arcane',
  rooted: true,
  priority: 0.75,
  telegraph: { shape: 'ring', size: 8, color: 0x7040d0, atSelf: true },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    if (inst.tickAccum < 0.4) return;
    inst.tickAccum -= 0.4;
    const p = P(self);
    if (playerInCircle(ctx, p.x, p.z, 8)) {
      hitPlayer(self, ctx, 0.5, 'arcane', 'vortex_pull', { knockback: -3.5 });
    }
    ctx.fx.burst('void', p.x, 0.8, p.z, { count: 14, scale: 6 });
  },
});

def({
  id: 'arcane_nova',
  name: 'Arcane Nova',
  kind: 'aoe',
  cooldown: 10,
  windup: 1.0,
  recovery: 0.6,
  range: 7,
  radius: 6,
  damageMul: 2.0,
  damageType: 'arcane',
  interruptible: true,
  rooted: true,
  priority: 0.7,
  telegraph: { shape: 'ring', size: 6.2, color: 0xc060ff, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    circleHit(self, ctx, p.x, p.z, 6.2 * self.sizeScale, 2.0, 'arcane', 'arcane_nova', { knockback: 4 });
  },
});

def({
  id: 'hex_bolt',
  name: 'Hex',
  kind: 'debuff',
  cooldown: 12,
  windup: 1.0,
  recovery: 0.6,
  range: 14,
  damageMul: 0.5,
  damageType: 'arcane',
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.65,
  onExecute: (self, ctx) => {
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 0.5, 'arcane', 'hex_bolt', {
      shape: 'ring',
      color: 0x9060c0,
      speed: 12,
      spin: 6,
      applies: [{ id: 'weaken', duration: 8, magnitude: 0.25 }],
    });
  },
});

def({
  id: 'curse_frailty',
  name: 'Curse of Frailty',
  kind: 'debuff',
  cooldown: 16,
  windup: 1.2,
  recovery: 0.7,
  range: 13,
  damageMul: 0,
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.6,
  telegraph: { shape: 'circle', size: 3, color: 0x604070 },
  onExecute: (self, ctx) => {
    self.flashCast(0x604070);
    if (dist(P(self).x, P(self).z, ctx.playerPos.x, ctx.playerPos.z) < 14) {
      const packet = rollPacket(self, ctx, 0.01, 'arcane', 'curse_frailty');
      packet.applies = [
        { id: 'frailty', duration: 12, magnitude: 0.3 },
        { id: 'slow', duration: 6, magnitude: 0.2 },
      ];
      ctx.damagePlayer(packet);
    }
  },
});

def({
  id: 'mind_lash',
  name: 'Mind Lash',
  kind: 'debuff',
  cooldown: 10,
  windup: 1.0,
  recovery: 0.6,
  range: 15,
  damageMul: 1.4,
  damageType: 'arcane',
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.65,
  telegraph: { shape: 'line', size: 15, color: 0xd070ff, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    lineHit(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 1.2, 1.4, 'arcane', 'mind_lash', {
      applies: [{ id: 'confuse', duration: 2.5, magnitude: 1 }],
    });
    ctx.fx.burst('void', p.x, 1.4, p.z, { count: 16 });
  },
});

def({
  id: 'banshee_wail',
  name: 'Wail of the Grave',
  kind: 'aoe',
  cooldown: 15,
  windup: 1.5,
  recovery: 1.0,
  range: 10,
  radius: 9,
  damageMul: 1.5,
  damageType: 'cold',
  interruptible: true,
  rooted: true,
  priority: 0.8,
  telegraph: { shape: 'ring', size: 9, color: 0xa0e0ff, atSelf: true },
  sfx: 'wail',
  onExecute: (self, ctx) => {
    const p = P(self);
    circleHit(self, ctx, p.x, p.z, 9, 1.5, 'cold', 'banshee_wail', {
      applies: [{ id: 'fear', duration: 2, magnitude: 1 }],
    });
    // Rallies the dead nearby.
    for (const a of alliesNear(ctx, p.x, p.z, 12, self.id)) {
      a.buff('wail_rage', 8, { damage: 1.25, speed: 1.15 });
    }
  },
});

def({
  id: 'petrify_gaze',
  name: 'Petrifying Gaze',
  kind: 'debuff',
  cooldown: 14,
  windup: 1.7,
  recovery: 1.0,
  range: 13,
  damageMul: 0.8,
  damageType: 'physical',
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.8,
  telegraph: { shape: 'cone', size: 13, color: 0xd8d060, atSelf: true },
  onExecute: (self, ctx) => {
    coneHit(self, ctx, 22, 13, 0.8, 'physical', 'petrify_gaze', {
      applies: [{ id: 'petrified', duration: 1.8, magnitude: 1 }],
    });
  },
});

def({
  id: 'corpse_burst',
  name: 'Corpse Burst',
  kind: 'aoe',
  cooldown: 9,
  windup: 0.9,
  recovery: 0.5,
  range: 14,
  radius: 3,
  damageMul: 1.6,
  damageType: 'poison',
  interruptible: true,
  rooted: true,
  priority: 0.6,
  telegraph: { shape: 'circle', size: 3, color: 0x90b040 },
  onStart: (_s, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onExecute: (self, ctx, inst) => {
    circleHit(self, ctx, inst.targetX, inst.targetZ, 3, 1.6, 'poison', 'corpse_burst', {
      applies: [{ id: 'poison', duration: 6, magnitude: 1.4 }],
    });
    ctx.fx.burst('blood', inst.targetX, 0.5, inst.targetZ, { count: 26 });
  },
});

def({
  id: 'death_explode',
  name: 'Volatile Death',
  kind: 'aoe',
  cooldown: 0,
  windup: 0,
  recovery: 0,
  range: 0,
  radius: 4,
  damageMul: 2.6,
  damageType: 'fire',
  priority: 0,
  tags: ['ondeath'],
  onExecute: (self, ctx) => {
    const p = P(self);
    const tel = ctx.decals.telegraph('circle', p.x, p.z, 4, 0, 0.8, 0xff6020);
    after(0.8, (c) => {
      tel.cancel();
      circleHit(self, c, p.x, p.z, 4 * self.sizeScale, 2.6, 'fire', 'death_explode', { knockback: 4 });
      c.fx.burst('hit.fire', p.x, 0.6, p.z, { count: 46, scale: 3 });
    });
  },
});

def({
  id: 'plague_death',
  name: 'Plague Burst',
  kind: 'aoe',
  cooldown: 0,
  windup: 0,
  recovery: 0,
  range: 0,
  radius: 3.4,
  damageMul: 1.4,
  damageType: 'poison',
  priority: 0,
  tags: ['ondeath'],
  onExecute: (self, ctx) => {
    const p = P(self);
    circleHit(self, ctx, p.x, p.z, 3.4 * self.sizeScale, 1.4, 'poison', 'plague_death', {
      applies: [{ id: 'poison', duration: 8, magnitude: 2 }],
    });
    spawnHazard(self, ctx, p.x, p.z, 2.6, 0.4, 'poison', 'plague_death', { duration: 8, tickRate: 2 });
  },
});

def({
  id: 'shatter_death',
  name: 'Shatter',
  kind: 'aoe',
  cooldown: 0,
  windup: 0,
  recovery: 0,
  range: 0,
  radius: 4,
  damageMul: 1.5,
  damageType: 'cold',
  priority: 0,
  tags: ['ondeath'],
  onExecute: (self, ctx) => {
    const p = P(self);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      fireProjectile(self, ctx, p.x + Math.sin(a) * 8, p.z + Math.cos(a) * 8, 1.0, 'cold', 'shatter_death', {
        shape: 'shard',
        speed: 13,
        life: 1.2,
      });
    }
  },
});

// --- Movement / evasion ----------------------------------------------------

def({
  id: 'teleport_strike',
  name: 'Blink Strike',
  kind: 'movement',
  cooldown: 8,
  windup: 0.45,
  recovery: 0.55,
  range: 18,
  minRange: 3,
  damageMul: 2.0,
  damageType: 'arcane',
  priority: 0.85,
  rooted: true,
  telegraph: { shape: 'circle', size: 2.6, color: 0xa060ff },
  onStart: (self, ctx, inst) => {
    const a = ctx.rng.next() * TAU;
    const t = ctx.nav.clampToWalkable(ctx.playerPos.x + Math.sin(a) * 2.0, ctx.playerPos.z + Math.cos(a) * 2.0);
    inst.targetX = t.x;
    inst.targetZ = t.y;
    ctx.fx.burst('portal', P(self).x, 1, P(self).z, { count: 18, color: 0xa060ff });
  },
  onExecute: (self, ctx, inst) => {
    self.teleportTo(inst.targetX, inst.targetZ, ctx);
    self.facing = angleTo(inst.targetX, inst.targetZ, ctx.playerPos.x, ctx.playerPos.z);
    ctx.fx.burst('portal', inst.targetX, 1, inst.targetZ, { count: 22, color: 0xa060ff });
    coneHit(self, ctx, 90, 3 * self.sizeScale, 2.0, 'arcane', 'teleport_strike');
  },
});

def({
  id: 'blink_away',
  name: 'Blink',
  kind: 'movement',
  cooldown: 7,
  windup: 0.25,
  recovery: 0.3,
  range: 6,
  damageMul: 0,
  priority: 0.9,
  tags: ['escape'],
  onExecute: (self, ctx) => {
    const t = retreatPoint(self, ctx, 9);
    ctx.fx.burst('portal', P(self).x, 1, P(self).z, { count: 14, color: 0x80a0ff });
    self.teleportTo(t.x, t.z, ctx);
    ctx.fx.burst('portal', t.x, 1, t.z, { count: 14, color: 0x80a0ff });
  },
});

def({
  id: 'phase_shift',
  name: 'Phase Shift',
  kind: 'buff',
  cooldown: 16,
  windup: 0.3,
  recovery: 0.3,
  range: 99,
  damageMul: 0,
  priority: 0.8,
  belowLife: 0.5,
  tags: ['defensive'],
  onExecute: (self, ctx) => {
    self.buff('phased', 2.5, { phased: 1, absorb: 0.7, speed: 1.4 });
    ctx.fx.burst('void', P(self).x, 1, P(self).z, { count: 20, color: 0x8080ff });
  },
});

def({
  id: 'burrow_emerge',
  name: 'Burrow',
  kind: 'movement',
  cooldown: 13,
  windup: 0.7,
  recovery: 0.8,
  range: 20,
  minRange: 2,
  damageMul: 2.2,
  priority: 0.85,
  rooted: true,
  telegraph: { shape: 'circle', size: 3, color: 0xc0a070 },
  onStart: (self, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
    self.buff('burrowed', 1.6, { phased: 1, absorb: 0.9, invulnerable: 1 });
    ctx.fx.burst('dust', P(self).x, 0.2, P(self).z, { count: 26 });
  },
  onExecute: (self, ctx, inst) => {
    const t = ctx.nav.clampToWalkable(ctx.playerPos.x, ctx.playerPos.z);
    self.teleportTo(t.x, t.y, ctx);
    const tel = ctx.decals.telegraph('circle', t.x, t.y, 3, 0, 0.55, 0xc0a070);
    after(0.55, (c) => {
      tel.cancel();
      circleHit(self, c, t.x, t.y, 3.2 * self.sizeScale, 2.2, 'physical', 'burrow_emerge', { knockback: 4 });
      c.fx.burst('dust', t.x, 0.3, t.y, { count: 34, scale: 3 });
    });
    void inst;
  },
});

def({
  id: 'swarm_dive',
  name: 'Dive',
  kind: 'movement',
  cooldown: 5,
  windup: 0.3,
  recovery: 0.4,
  range: 11,
  minRange: 2.5,
  damageMul: 1.1,
  priority: 0.7,
  onExecute: (self, ctx) => {
    const o = overshoot(self, ctx, 2.5);
    dashToward(self, ctx, o.x, o.z, 20, {
      arc: 1.2,
      trample: { mul: 1.1, radius: 1.2, type: 'physical' },
    });
  },
});

def({
  id: 'split_self',
  name: 'Split',
  kind: 'summon',
  cooldown: 30,
  windup: 0.5,
  recovery: 0.6,
  range: 99,
  damageMul: 0,
  priority: 0.6,
  belowLife: 0.55,
  params: { count: 2 },
  onExecute: (self, ctx, inst) => {
    const n = inst.def.params?.count ?? 2;
    summon(self, ctx, 'ooze_spawn', n, 2.0);
    ctx.fx.burst('poison', P(self).x, 0.6, P(self).z, { count: 24, color: 0x8ee04a });
  },
});

// --- Summons ---------------------------------------------------------------

def({
  id: 'summon_adds',
  name: 'Call Reinforcements',
  kind: 'summon',
  cooldown: 22,
  windup: 1.4,
  recovery: 0.9,
  range: 20,
  damageMul: 0,
  interruptible: true,
  rooted: true,
  priority: 0.8,
  params: { count: 3 },
  telegraph: { shape: 'ring', size: 4, color: 0x60ff90, atSelf: true },
  onExecute: (self, ctx, inst) => {
    summon(self, ctx, 'skeleton_rattler', inst.def.params?.count ?? 3, 3.0);
  },
});

def({
  id: 'raise_dead',
  name: 'Raise Dead',
  kind: 'summon',
  cooldown: 18,
  windup: 1.6,
  recovery: 1.0,
  range: 18,
  damageMul: 0,
  interruptible: true,
  rooted: true,
  priority: 0.85,
  params: { count: 2 },
  telegraph: { shape: 'ring', size: 5, color: 0x80ffa0, atSelf: true },
  onExecute: (self, ctx, inst) => {
    summon(self, ctx, 'skeleton_rattler', inst.def.params?.count ?? 2, 3.5);
    ctx.fx.burst('portal', P(self).x, 0.4, P(self).z, { count: 26, color: 0x80ffa0 });
  },
});

def({
  id: 'summon_swarm',
  name: 'Release Brood',
  kind: 'summon',
  cooldown: 20,
  windup: 1.2,
  recovery: 0.8,
  range: 18,
  damageMul: 0,
  interruptible: true,
  rooted: true,
  priority: 0.8,
  params: { count: 4 },
  onExecute: (self, ctx, inst) => {
    summon(self, ctx, 'hive_drone', inst.def.params?.count ?? 4, 2.6);
  },
});

def({
  id: 'summon_imps',
  name: 'Open the Gate',
  kind: 'summon',
  cooldown: 24,
  windup: 1.5,
  recovery: 1.0,
  range: 18,
  damageMul: 0,
  interruptible: true,
  rooted: true,
  priority: 0.82,
  params: { count: 3 },
  telegraph: { shape: 'ring', size: 4.5, color: 0xff5030, atSelf: true },
  onExecute: (self, ctx, inst) => {
    summon(self, ctx, 'imp_scamperer', inst.def.params?.count ?? 3, 3.0);
  },
});

def({
  id: 'summon_totem',
  name: 'Plant Totem',
  kind: 'summon',
  cooldown: 20,
  windup: 1.0,
  recovery: 0.7,
  range: 12,
  damageMul: 0,
  interruptible: true,
  rooted: true,
  priority: 0.7,
  onExecute: (self, ctx) => {
    summon(self, ctx, 'arcane_sentry_totem', 1, 2.4);
  },
});

def({
  id: 'arcane_sentry',
  name: 'Arcane Sentry',
  kind: 'ranged',
  cooldown: 3.5,
  windup: 0.55,
  recovery: 0.3,
  range: 16,
  damageMul: 0.9,
  damageType: 'arcane',
  requiresLos: true,
  rooted: true,
  priority: 0.5,
  onExecute: (self, ctx) => {
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 0.9, 'arcane', 'arcane_sentry', {
      shape: 'orb',
      speed: 16,
      color: 0xc060ff,
    });
  },
});

def({
  id: 'wall_of_bone',
  name: 'Bone Prison',
  kind: 'debuff',
  cooldown: 18,
  windup: 1.0,
  recovery: 0.6,
  range: 15,
  damageMul: 0.3,
  interruptible: true,
  rooted: true,
  priority: 0.7,
  telegraph: { shape: 'ring', size: 3.4, color: 0xe8e0c8 },
  onStart: (_s, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onExecute: (self, ctx, inst) => {
    // A ring of spikes: it hurts crossing the wall, not standing in it.
    const r = 3.4;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      spawnHazard(
        self,
        ctx,
        inst.targetX + Math.sin(a) * r,
        inst.targetZ + Math.cos(a) * r,
        0.9,
        0.9,
        'physical',
        'wall_of_bone',
        { duration: 6, tickRate: 2, color: 0xe8e0c8 },
      );
    }
  },
});

// --- Buffs / support -------------------------------------------------------

def({
  id: 'enrage',
  name: 'Enrage',
  kind: 'buff',
  cooldown: 30,
  windup: 0.8,
  recovery: 0.4,
  range: 99,
  damageMul: 0,
  priority: 0.7,
  belowLife: 0.4,
  telegraph: { shape: 'ring', size: 2.5, color: 0xff3020, atSelf: true },
  sfx: 'roar',
  onExecute: (self, ctx) => {
    self.buff('enraged', 14, { damage: 1.6, speed: 1.35, attackSpeed: 1.4, defense: 0.75 });
    ctx.fx.burst('crit', P(self).x, 1.2 * self.sizeScale, P(self).z, { count: 24, color: 0xff3020 });
  },
});

def({
  id: 'shield_self',
  name: 'Ward',
  kind: 'buff',
  cooldown: 20,
  windup: 0.9,
  recovery: 0.5,
  range: 99,
  damageMul: 0,
  interruptible: true,
  priority: 0.75,
  belowLife: 0.7,
  telegraph: { shape: 'ring', size: 2.2, color: 0x60c0ff, atSelf: true },
  onExecute: (self, ctx) => {
    self.addShield(self.maxLife * 0.28, 12);
    ctx.fx.burst('heal', P(self).x, 1.0 * self.sizeScale, P(self).z, { count: 18, color: 0x60c0ff });
  },
});

def({
  id: 'shield_ally',
  name: 'Aegis',
  kind: 'buff',
  cooldown: 14,
  windup: 1.0,
  recovery: 0.5,
  range: 14,
  damageMul: 0,
  interruptible: true,
  needsAllies: 1,
  priority: 0.8,
  onExecute: (self, ctx) => {
    const p = P(self);
    const allies = alliesNear(ctx, p.x, p.z, 14, self.id).sort((a, b) => a.life / a.maxLife - b.life / b.maxLife);
    for (const a of allies.slice(0, 3)) {
      a.addShield(a.maxLife * 0.25, 10);
      ctx.fx.burst('heal', a.root.position.x, 1, a.root.position.z, { count: 12, color: 0x60c0ff });
    }
  },
});

def({
  id: 'heal_ally',
  name: 'Mend',
  kind: 'heal',
  cooldown: 10,
  windup: 1.3,
  recovery: 0.6,
  range: 14,
  damageMul: 0,
  interruptible: true,
  rooted: true,
  needsAllies: 1,
  priority: 0.9,
  telegraph: { shape: 'line', size: 14, color: 0x60ff90, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    const allies = alliesNear(ctx, p.x, p.z, 14, self.id)
      .filter((a) => a.life < a.maxLife * 0.95)
      .sort((a, b) => a.life / a.maxLife - b.life / b.maxLife);
    const target = allies[0];
    if (!target) {
      self.heal(self.maxLife * 0.18, ctx);
      return;
    }
    target.heal(target.maxLife * 0.3, ctx);
    ctx.fx.burst('heal', target.root.position.x, 1.2, target.root.position.z, { count: 22, color: 0x60ff90 });
  },
});

def({
  id: 'heal_self',
  name: 'Knit Flesh',
  kind: 'heal',
  cooldown: 16,
  windup: 1.4,
  recovery: 0.7,
  range: 99,
  damageMul: 0,
  interruptible: true,
  rooted: true,
  priority: 0.95,
  belowLife: 0.5,
  telegraph: { shape: 'ring', size: 2.4, color: 0x60ff90, atSelf: true },
  onExecute: (self, ctx) => {
    self.heal(self.maxLife * 0.25, ctx);
    ctx.fx.burst('heal', P(self).x, 1.2 * self.sizeScale, P(self).z, { count: 26, color: 0x60ff90 });
  },
});

def({
  id: 'battle_cry',
  name: 'Battle Cry',
  kind: 'buff',
  cooldown: 24,
  windup: 0.9,
  recovery: 0.5,
  range: 99,
  damageMul: 0,
  needsAllies: 1,
  priority: 0.75,
  opener: true,
  telegraph: { shape: 'ring', size: 10, color: 0xffc040, atSelf: true },
  sfx: 'roar',
  onExecute: (self, ctx) => {
    const p = P(self);
    for (const a of alliesNear(ctx, p.x, p.z, 12)) {
      a.buff('rallied', 15, { damage: 1.3, attackSpeed: 1.25, speed: 1.12 });
    }
    ctx.fx.burst('levelup', p.x, 0.6, p.z, { count: 24, color: 0xffc040 });
  },
});

def({
  id: 'haste_aura',
  name: 'Frenzy Chant',
  kind: 'buff',
  cooldown: 18,
  windup: 1.1,
  recovery: 0.6,
  range: 99,
  damageMul: 0,
  needsAllies: 1,
  interruptible: true,
  rooted: true,
  priority: 0.7,
  telegraph: { shape: 'ring', size: 9, color: 0x60ffe0, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    for (const a of alliesNear(ctx, p.x, p.z, 10)) a.buff('hasted', 12, { speed: 1.4, attackSpeed: 1.5 });
  },
});

def({
  id: 'repair_construct',
  name: 'Field Repair',
  kind: 'heal',
  cooldown: 12,
  windup: 1.5,
  recovery: 0.8,
  range: 10,
  damageMul: 0,
  interruptible: true,
  rooted: true,
  needsAllies: 1,
  priority: 0.9,
  telegraph: { shape: 'line', size: 10, color: 0xffb040, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    const hurt = alliesNear(ctx, p.x, p.z, 10, self.id)
      .filter((a) => a.family === 'construct' && a.life < a.maxLife)
      .sort((a, b) => a.life / a.maxLife - b.life / b.maxLife);
    const t = hurt[0];
    if (t) {
      t.heal(t.maxLife * 0.35, ctx);
      t.buff('reinforced', 10, { defense: 1.4 });
      ctx.fx.burst('embers', t.root.position.x, 1, t.root.position.z, { count: 20, color: 0xffb040 });
    }
  },
});

def({
  id: 'blood_link',
  name: 'Blood Link',
  kind: 'buff',
  cooldown: 26,
  windup: 1.2,
  recovery: 0.6,
  range: 99,
  damageMul: 0,
  needsAllies: 2,
  interruptible: true,
  priority: 0.7,
  opener: true,
  onExecute: (self, ctx) => {
    const p = P(self);
    for (const a of alliesNear(ctx, p.x, p.z, 14)) a.buff('bloodlinked', 20, { absorb: 0.2, lifeRegen: 6 });
    ctx.fx.burst('blood', p.x, 1, p.z, { count: 20 });
  },
});

def({
  id: 'resurrect_ally',
  name: 'Unearth',
  kind: 'summon',
  cooldown: 26,
  windup: 2.0,
  recovery: 1.0,
  range: 16,
  damageMul: 0,
  interruptible: true,
  rooted: true,
  priority: 0.85,
  telegraph: { shape: 'ring', size: 6, color: 0xa0ff60, atSelf: true },
  onExecute: (self, ctx) => {
    summon(self, ctx, 'skeleton_rattler', 2, 3.2, 'normal');
    ctx.fx.burst('portal', P(self).x, 0.5, P(self).z, { count: 30, color: 0xa0ff60 });
  },
});

def({
  id: 'cleanse_allies',
  name: 'Purge',
  kind: 'buff',
  cooldown: 20,
  windup: 1.0,
  recovery: 0.5,
  range: 99,
  damageMul: 0,
  needsAllies: 1,
  priority: 0.6,
  onExecute: (self, ctx) => {
    const p = P(self);
    for (const a of alliesNear(ctx, p.x, p.z, 10)) {
      a.buff('purged', 8, { defense: 1.25, absorb: 0.15 });
      a.heal(a.maxLife * 0.08, ctx);
    }
  },
});

def({
  id: 'tentacle_grasp',
  name: 'Tentacle Grasp',
  kind: 'aoe',
  cooldown: 13,
  windup: 1.1,
  recovery: 0.8,
  range: 14,
  radius: 2.6,
  damageMul: 1.3,
  damageType: 'physical',
  interruptible: true,
  rooted: true,
  priority: 0.75,
  telegraph: { shape: 'circle', size: 2.8, color: 0x8060a0 },
  onStart: (_s, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onExecute: (self, ctx, inst) => {
    circleHit(self, ctx, inst.targetX, inst.targetZ, 2.8, 1.3, 'physical', 'tentacle_grasp', {
      applies: [{ id: 'root', duration: 1.8, magnitude: 1 }],
    });
  },
});

def({
  id: 'thorn_lash',
  name: 'Thorn Lash',
  kind: 'melee',
  cooldown: 5,
  windup: 0.55,
  recovery: 0.4,
  range: 5.5,
  damageMul: 1.3,
  damageType: 'physical',
  priority: 0.5,
  telegraph: { shape: 'line', size: 5.5, color: 0x70a040, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    lineHit(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 0.9, 1.3, 'physical', 'thorn_lash', {
      applies: [{ id: 'bleed', duration: 4, magnitude: 1 }],
    });
    void p;
  },
});

def({
  id: 'root_snare',
  name: 'Grasping Roots',
  kind: 'aoe',
  cooldown: 12,
  windup: 0.9,
  recovery: 0.6,
  range: 13,
  radius: 3,
  damageMul: 0.8,
  damageType: 'physical',
  interruptible: true,
  rooted: true,
  priority: 0.7,
  telegraph: { shape: 'circle', size: 3.2, color: 0x70a040 },
  onStart: (_s, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onExecute: (self, ctx, inst) => {
    circleHit(self, ctx, inst.targetX, inst.targetZ, 3.2, 0.8, 'physical', 'root_snare', {
      applies: [{ id: 'root', duration: 2.2, magnitude: 1 }],
    });
    spawnHazard(self, ctx, inst.targetX, inst.targetZ, 3.0, 0.25, 'physical', 'root_snare', {
      duration: 6,
      tickRate: 1,
      color: 0x70a040,
      applies: [{ id: 'slow', duration: 1.5, magnitude: 0.4 }],
    });
  },
});

def({
  id: 'mana_burn',
  name: 'Mana Burn',
  kind: 'debuff',
  cooldown: 11,
  windup: 0.9,
  recovery: 0.5,
  range: 12,
  damageMul: 0.9,
  damageType: 'arcane',
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.6,
  onExecute: (self, ctx) => {
    fireProjectile(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 0.9, 'arcane', 'mana_burn', {
      shape: 'ring',
      color: 0x4060ff,
      speed: 14,
      spin: 8,
      applies: [{ id: 'manaburn', duration: 6, magnitude: 1 }],
    });
  },
});

def({
  id: 'static_field',
  name: 'Static Field',
  kind: 'aoe',
  cooldown: 8,
  windup: 0.7,
  recovery: 0.5,
  range: 8,
  radius: 7,
  damageMul: 1.0,
  damageType: 'lightning',
  rooted: true,
  priority: 0.65,
  telegraph: { shape: 'ring', size: 7, color: 0xffe066, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    circleHit(self, ctx, p.x, p.z, 7 * self.sizeScale, 1.0, 'lightning', 'static_field', {
      applies: [{ id: 'shocked', duration: 4, magnitude: 1 }],
    });
  },
});

def({
  id: 'lightning_storm',
  name: 'Storm Call',
  kind: 'aoe',
  cooldown: 17,
  windup: 1.4,
  activeTime: 4.5,
  recovery: 0.9,
  range: 20,
  radius: 10,
  damageMul: 1.6,
  damageType: 'lightning',
  interruptible: true,
  rooted: true,
  priority: 0.85,
  telegraph: { shape: 'ring', size: 10, color: 0xffe066, atSelf: true },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    if (inst.tickAccum < 0.7) return;
    inst.tickAccum -= 0.7;
    // Strikes track the player with a beat of delay — keep moving.
    const tx = ctx.playerPos.x;
    const tz = ctx.playerPos.z;
    const tel = ctx.decals.telegraph('circle', tx, tz, 2.0, 0, 0.5, 0xffe066);
    after(0.5, (c) => {
      tel.cancel();
      circleHit(self, c, tx, tz, 2.0, 1.6, 'lightning', 'lightning_storm');
      c.fx.burst('shock', tx, 1.5, tz, { count: 22 });
    });
  },
});

def({
  id: 'shrapnel_nova',
  name: 'Shrapnel Nova',
  kind: 'aoe',
  cooldown: 10,
  windup: 1.0,
  recovery: 0.6,
  range: 10,
  damageMul: 0.9,
  damageType: 'physical',
  rooted: true,
  priority: 0.65,
  telegraph: { shape: 'ring', size: 10, color: 0xc0b0a0, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    for (let ring = 0; ring < 2; ring++) {
      after(ring * 0.2, (c) => {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU + ring * 0.31;
          fireProjectile(self, c, p.x + Math.sin(a) * 11, p.z + Math.cos(a) * 11, 0.9, 'physical', 'shrapnel_nova', {
            shape: 'shard',
            color: 0xc0b0a0,
            speed: 16,
            life: 1.3,
          });
        }
      });
    }
  },
});

def({
  id: 'siphon_soul',
  name: 'Siphon Soul',
  kind: 'debuff',
  cooldown: 14,
  windup: 1.3,
  recovery: 0.8,
  range: 13,
  damageMul: 1.8,
  damageType: 'arcane',
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.8,
  telegraph: { shape: 'line', size: 13, color: 0x60ffc0, atSelf: true },
  onExecute: (self, ctx) => {
    const packet = hitPlayer(self, ctx, 1.8, 'arcane', 'siphon_soul', {
      applies: [{ id: 'weaken', duration: 10, magnitude: 0.2 }],
    });
    const p = P(self);
    for (const a of alliesNear(ctx, p.x, p.z, 12)) a.heal(packet.amount * 0.3, ctx);
  },
});

def({
  id: 'flame_wave',
  name: 'Flame Wave',
  kind: 'cone',
  cooldown: 12,
  windup: 1.1,
  recovery: 0.7,
  range: 14,
  damageMul: 1.9,
  damageType: 'fire',
  rooted: true,
  interruptible: true,
  priority: 0.8,
  telegraph: { shape: 'line', size: 14, color: 0xff6020, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    const f = self.facing;
    // A wall of fire that walks outward — sidestep the lane.
    for (let step = 0; step < 7; step++) {
      after(step * 0.11, (c) => {
        const d = 2 + step * 1.9;
        const cx = p.x + Math.sin(f) * d;
        const cz = p.z + Math.cos(f) * d;
        c.fx.burst('hit.fire', cx, 0.6, cz, { count: 12, scale: 2 });
        if (dist(cx, cz, c.playerPos.x, c.playerPos.z) < 2.0) {
          hitPlayer(self, c, 1.9, 'fire', 'flame_wave', { applies: [{ id: 'burn', duration: 4, magnitude: 1.4 }] });
        }
      });
    }
  },
});

def({
  id: 'ink_cloud',
  name: 'Ink Cloud',
  kind: 'aoe',
  cooldown: 15,
  windup: 0.6,
  recovery: 0.5,
  range: 8,
  radius: 5,
  damageMul: 0.4,
  damageType: 'poison',
  priority: 0.75,
  belowLife: 0.6,
  tags: ['escape'],
  onExecute: (self, ctx) => {
    const p = P(self);
    spawnHazard(self, ctx, p.x, p.z, 5, 0.4, 'poison', 'ink_cloud', {
      duration: 7,
      tickRate: 1.5,
      color: 0x203040,
      applies: [{ id: 'blind', duration: 2, magnitude: 1 }],
    });
    self.buff('obscured', 5, { absorb: 0.35 });
  },
});

def({
  id: 'gaze_beam',
  name: 'Disintegration Gaze',
  kind: 'beam',
  cooldown: 10,
  windup: 1.2,
  activeTime: 1.8,
  recovery: 0.9,
  range: 18,
  damageMul: 0.8,
  damageType: 'arcane',
  rooted: true,
  interruptible: true,
  priority: 0.8,
  telegraph: { shape: 'line', size: 18, color: 0xff60c0, atSelf: true },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    if (inst.tickAccum < 0.18) return;
    inst.tickAccum -= 0.18;
    const p = P(self);
    const tx = p.x + Math.sin(self.facing) * 18;
    const tz = p.z + Math.cos(self.facing) * 18;
    lineHit(self, ctx, tx, tz, 0.9, 0.8, 'arcane', 'gaze_beam');
    ctx.fx.burst('void', p.x + Math.sin(self.facing) * 3, 1.4, p.z + Math.cos(self.facing) * 3, {
      count: 6,
      color: 0xff60c0,
    });
  },
});

def({
  id: 'sunder_armor',
  name: 'Sunder',
  kind: 'melee',
  cooldown: 9,
  windup: 0.8,
  recovery: 0.6,
  range: 2.8,
  damageMul: 1.5,
  priority: 0.6,
  rooted: true,
  telegraph: { shape: 'cone', size: 3, color: 0xd0a060, atSelf: true },
  onExecute: (self, ctx) => {
    coneHit(self, ctx, 55, 3 * self.sizeScale, 1.5, 'physical', 'sunder_armor', {
      applies: [{ id: 'sundered', duration: 10, magnitude: 0.25 }],
    });
  },
});

def({
  id: 'terrify',
  name: 'Terrify',
  kind: 'debuff',
  cooldown: 20,
  windup: 1.2,
  recovery: 0.7,
  range: 9,
  radius: 8,
  damageMul: 0.3,
  damageType: 'arcane',
  rooted: true,
  interruptible: true,
  priority: 0.7,
  telegraph: { shape: 'ring', size: 8, color: 0x402050, atSelf: true },
  onExecute: (self, ctx) => {
    const p = P(self);
    circleHit(self, ctx, p.x, p.z, 8, 0.3, 'arcane', 'terrify', {
      applies: [{ id: 'fear', duration: 2.2, magnitude: 1 }],
    });
  },
});

def({
  id: 'iron_maiden',
  name: 'Iron Maiden',
  kind: 'debuff',
  cooldown: 18,
  windup: 1.1,
  recovery: 0.6,
  range: 14,
  damageMul: 0.2,
  damageType: 'physical',
  requiresLos: true,
  interruptible: true,
  rooted: true,
  priority: 0.65,
  onExecute: (self, ctx) => {
    const packet = rollPacket(self, ctx, 0.2, 'physical', 'iron_maiden');
    packet.applies = [{ id: 'reflect', duration: 12, magnitude: 0.25 }];
    if (dist(P(self).x, P(self).z, ctx.playerPos.x, ctx.playerPos.z) < 15) ctx.damagePlayer(packet);
  },
});

def({
  id: 'gravity_well',
  name: 'Gravity Well',
  kind: 'aoe',
  cooldown: 16,
  windup: 1.2,
  activeTime: 3.0,
  recovery: 0.8,
  range: 16,
  radius: 6,
  damageMul: 0.55,
  damageType: 'arcane',
  interruptible: true,
  rooted: true,
  priority: 0.8,
  telegraph: { shape: 'ring', size: 6, color: 0x6040a0 },
  onStart: (_s, ctx, inst) => {
    inst.targetX = ctx.playerPos.x;
    inst.targetZ = ctx.playerPos.z;
  },
  onTick: (self, ctx, inst, dt) => {
    inst.tickAccum += dt;
    if (inst.tickAccum < 0.35) return;
    inst.tickAccum -= 0.35;
    if (playerInCircle(ctx, inst.targetX, inst.targetZ, 6)) {
      hitPlayer(self, ctx, 0.55, 'arcane', 'gravity_well', { knockback: -4 });
    }
    ctx.fx.burst('void', inst.targetX, 0.8, inst.targetZ, { count: 10, scale: 5 });
  },
});

def({
  id: 'flesh_hooks',
  name: 'Flesh Hooks',
  kind: 'ranged',
  cooldown: 12,
  windup: 0.9,
  recovery: 0.7,
  range: 13,
  minRange: 4,
  damageMul: 1.4,
  damageType: 'physical',
  requiresLos: true,
  rooted: true,
  priority: 0.7,
  telegraph: { shape: 'cone', size: 13, color: 0xa03040, atSelf: true },
  onExecute: (self, ctx) => {
    fireSpread(self, ctx, ctx.playerPos.x, ctx.playerPos.z, 3, 22, 1.4, 'physical', 'flesh_hooks', {
      shape: 'bolt',
      color: 0xa03040,
      speed: 20,
      knockback: -5,
      applies: [{ id: 'bleed', duration: 5, magnitude: 1.2 }],
    });
  },
});

def({
  id: 'rally_pack',
  name: 'Howl',
  kind: 'buff',
  cooldown: 22,
  windup: 0.8,
  recovery: 0.5,
  range: 99,
  damageMul: 0,
  needsAllies: 1,
  priority: 0.7,
  opener: true,
  sfx: 'howl',
  onExecute: (self, ctx) => {
    const p = P(self);
    for (const a of alliesNear(ctx, p.x, p.z, 16)) {
      a.buff('pack_frenzy', 12, { speed: 1.28, damage: 1.2 });
      a.wake(ctx);
    }
  },
});

def({
  id: 'stealth',
  name: 'Fade',
  kind: 'buff',
  cooldown: 18,
  windup: 0.4,
  recovery: 0.3,
  range: 99,
  damageMul: 0,
  priority: 0.6,
  belowLife: 0.45,
  tags: ['escape'],
  onExecute: (self, ctx) => {
    self.buff('stealthed', 4, { phased: 1, speed: 1.3, absorb: 0.4 });
    ctx.fx.burst('void', P(self).x, 1, P(self).z, { count: 12, color: 0x304050 });
  },
});

def({
  id: 'mirror_images',
  name: 'Mirror Images',
  kind: 'summon',
  cooldown: 28,
  windup: 1.0,
  recovery: 0.6,
  range: 99,
  damageMul: 0,
  priority: 0.75,
  belowLife: 0.75,
  onExecute: (self, ctx) => {
    summon(self, ctx, 'mirror_image', 2, 2.4);
    self.buff('illusory', 6, { absorb: 0.3 });
    ctx.fx.burst('portal', P(self).x, 1, P(self).z, { count: 20, color: 0x80c0ff });
  },
});

/** Registry lookup. */
const BY_ID = new Map<string, AbilityDef>();
for (const a of REG) BY_ID.set(a.id, a);

export const ABILITIES: readonly AbilityDef[] = REG;

export function getAbility(id: string): AbilityDef | undefined {
  return BY_ID.get(id);
}

export function abilityIds(): string[] {
  return REG.map((a) => a.id);
}

/** Builds a fresh instance record for a caster. */
export function makeInstance(defn: AbilityDef): AbilityInstance {
  return {
    def: defn,
    phase: 'idle',
    t: 0,
    targetX: 0,
    targetZ: 0,
    facing: 0,
    telegraph: null,
    tickAccum: 0,
    data: {},
  };
}
