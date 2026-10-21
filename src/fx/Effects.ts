/**
 * SLAY fx: the spell and attack library.
 *
 * Every skill and monster attack is built from the kit (`fx/kit/`): one GPU
 * particle field, instanced cores, beams, light columns and shells, batched
 * ribbons, lit solid projectiles, the floor layers and a fixed pool of real
 * point lights. Each family is one draw call however many spells are alive,
 * and every family blends the same premultiplied way: light adds, smoke and
 * ice hide what is behind them, and ten fireballs on one spot stay orange.
 *
 * An impact is never one thing: a particle stack, a light that touches the
 * walls, a mark that cools on the floor, trauma and a sound.
 * `impact()` fires the whole recipe from one call.
 *
 * Live effects are pooled records updated by a switch: a frame allocates
 * nothing. Gameplay-carrying effects (a delayed hit, a projectile's damage
 * callback) are never culled; past `MAX_LIVE_EFFECTS` the oldest decoration
 * goes first.
 */

import * as THREE from 'three';
import type { QualityProfile } from '../core/Renderer';
import type { Rng } from '../types';
import { events } from '../core/Events';
import { Random } from '../core/RNG';
import type { FXSystem } from './Particles';
import type { DecalSystem } from './Decals';
import type { CameraRig } from './CameraRig';
import { RAMPS, SCHOOLS as KIT_SCHOOLS, ramp, packLinear, mixHex, darken, type School as KitSchool } from './kit/Palette';
import { InstancedPool, type SlotHandle } from './kit/Instanced';
import { makeCores, makeBeams, makeColumns, makeShells, CORE_STYLE, BEAM_STYLE, COLUMN_STYLE, SHELL_STYLE } from './kit/Shapes';
import { RibbonBatch, type RibbonHandle, type RibbonKind } from './kit/Ribbons';
import { LightPool, MAX_FX_LIGHTS, type LightHandle } from './kit/Lights';
import { SolidPool, type SolidHandle } from './kit/Solids';
import type { GroundHandle } from './kit/Ground';
import { floorAt } from './kit/Floor';
import { FX_COMFORT, FX_EXPOSURE } from './kit/Exposure';
import { FieldPool, type FieldOpts } from './Fields';
import { BOOST, setBoostRank, atRank } from './kit/Boost';
import { clearRipples, ripple } from '../core/Ripples';
import { MOTIF_SHAPES, MOTIF_MOTIONS, Path, pieceCap, thin, type MotifDraw, type MotifShape, type MotifMotion, type MotifFrame, type Piece } from './Motifs';

// ---------------------------------------------------------------------------
// Element looks
// ---------------------------------------------------------------------------

/** What a spell looks like is its school: its damage type, or bone. */
export type School = KitSchool;
export const SCHOOLS: readonly School[] = KIT_SCHOOLS;

export interface ElementLook {
  /** Hottest colour. */
  core: number;
  /** The colour the eye names. */
  body: number;
  /** Cooling colour. */
  tail: number;
  /** Colour of the light it throws on the room. */
  light: number;
  /** The mark it leaves on the floor (its cooling glow comes with it). */
  decal: string;
  /** The glow that cools over the mark, for hot schools. */
  glowDecal?: string;
  /** Ribbon preset behind its projectiles. */
  trail: string;
  /** Impact burst. */
  emitter: string;
  /** Flare at the caster's hand. */
  castEmitter: string;
  /** Shed by projectiles in flight. */
  shedEmitter: string;
  sfxHit: string;
  sfxCast: string;
}

/** Impact sprites against the impact's own scale. */
const IMPACT_SPRITE = 1.3;
/** Flash light (summed intensity) that may stack before effects dim. */
const GLARE_FREE = 90;
/** Motifs in the air before new ones thin, and seconds for that count to fall by e. */
const MOTIF_CROWD = 3;
const MOTIF_DECAY = 0.7;
/** Seconds for piled-up glare to fall by e. */
const GLARE_DECAY = 0.35;
/** Effects never dim below this share of their light. */
const EXPOSURE_FLOOR = 0.5;

const MARK: Record<School, [string, string | undefined]> = {
  physical: ['dust', undefined],
  fire: ['scorch', 'cinders'],
  cold: ['ice', 'frost'],
  lightning: ['fork', 'forkGlow'],
  poison: ['acid', 'acidGlow'],
  arcane: ['sigil', undefined],
  bone: ['bone', undefined],
};
const TRAIL_OF: Record<School, string> = {
  physical: 'sword', fire: 'fire', cold: 'frost', lightning: 'lightning', poison: 'poison', arcane: 'arcane', bone: 'bone',
};

export const ELEMENTS: Record<School, ElementLook> = (() => {
  const out = {} as Record<School, ElementLook>;
  for (const s of KIT_SCHOOLS) {
    const r = RAMPS[s];
    const [decal, glowDecal] = MARK[s];
    out[s] = {
      core: r.core, body: r.body, tail: r.tail, light: r.light, decal, glowDecal,
      trail: TRAIL_OF[s], emitter: `hit.${s}`, castEmitter: `cast.${s}`, shedEmitter: `trail.${s}`,
      sfxHit: `hit.${s}`, sfxCast: `cast.${s}`,
    };
  }
  return out;
})();

function element(s: School | undefined): ElementLook {
  return ELEMENTS[s ?? 'physical'] ?? ELEMENTS.physical;
}

export { hitMaterial, MATERIAL_BURST, MATERIAL_MARK, type HitMaterial } from './Materials';

/** Ribbon looks for projectile trails and swings. */
export interface RibbonPreset {
  kind: RibbonKind;
  /** Width as a multiple of the projectile size (trails) or metres (swings). */
  width: number;
  life: number;
  school: School;
  emit: number;
}

export const RIBBON_PRESETS: Record<string, RibbonPreset> = {
  sword: { kind: 'swing', width: 1, life: 0.16, school: 'physical', emit: 0.9 },
  arrow: { kind: 'trail', width: 0.35, life: 0.12, school: 'physical', emit: 0.5 },
  /** A steel glint behind a thrown knife or shield. */
  thrown: { kind: 'trail', width: 0.5, life: 0.1, school: 'physical', emit: 0.7 },
  fire: { kind: 'trail', width: 1.1, life: 0.22, school: 'fire', emit: 1 },
  frost: { kind: 'trail', width: 0.8, life: 0.26, school: 'cold', emit: 0.9 },
  lightning: { kind: 'bolt', width: 0.35, life: 0.1, school: 'lightning', emit: 1.2 },
  poison: { kind: 'trail', width: 0.9, life: 0.3, school: 'poison', emit: 0.8 },
  arcane: { kind: 'trail', width: 0.9, life: 0.24, school: 'arcane', emit: 1 },
  bone: { kind: 'trail', width: 0.6, life: 0.18, school: 'bone', emit: 0.6 },
};

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface EffectHandle {
  /** Stops the effect early (with its natural fade where one exists). */
  stop(): void;
  /** True once the effect has fully finished and been recycled. */
  readonly done: boolean;
  /** Re-aims an effect that follows a moving point (beams), or ripples a shield. */
  setEndpoint?(p: THREE.Vector3): void;
}

/** Composite effects alive at once before the oldest decoration is culled. */
export const MAX_LIVE_EFFECTS = 180;

export interface ImpactOpts {
  color?: number;
  scale?: number;
  dir?: THREE.Vector3;
  /** Screen trauma, 0..1. Defaults by element and scale. */
  shake?: number;
  /** Light intensity multiplier. 0 disables the flash. */
  light?: number;
  /** false skips the floor mark. */
  decal?: boolean;
  /** Sound id override; null stays silent. */
  sfx?: string | null;
  crit?: boolean;
  /** A skill's own burst, laid over the element's. */
  emitter?: string;
  /** Multiplier on the burst's particle count. */
  density?: number;
}

export interface ProjectileOpts {
  element?: School;
  color?: number;
  speed?: number;
  /** Radius of the projectile's heart. */
  size?: number;
  /** Arc height for lobbed shots. 0 = flat. */
  arc?: number;
  maxLife?: number;
  /** Homing strength, 0..1, with a live target getter. */
  homing?: number;
  target?: () => THREE.Vector3 | null;
  /** Ribbon preset name; null for none. */
  trail?: string | null;
  spin?: number;
  /** Fired when the projectile arrives. */
  onHit?: (p: THREE.Vector3) => void;
  /** false skips the impact recipe on arrival. */
  impact?: boolean;
  scale?: number;
  /**
   * Arrow (a solid shaft), bolt (the school's own body), a thrown knife,
   * shield, needle, vial or phantom blade, a skull (a bone skull flying
   * face first, with the school's glow and wake behind it), or an orb (a
   * round ball of ice that tumbles in the school's glow).
   */
  shape?: 'arrow' | 'bolt' | 'knife' | 'shield' | 'needle' | 'vial' | 'phantom' | 'skull' | 'orb';
  /** A skill's own particle wake, laid over the school's. */
  shed?: string;
  /** false skips the flare at the caster's hand. */
  flare?: boolean;
  /**
   * The caller flies it: `setEndpoint` moves it each frame (monster shots with
   * their own physics) and `stop` ends it. It never arrives on its own.
   */
  carried?: boolean;
  /** A monster's shot: a dark heart, a red rim and a red wake, whatever the school. */
  hostile?: boolean;
}

export interface BeamOpts {
  emitter?: string;
  density?: number;
  element?: School;
  color?: number;
  width?: number;
  duration?: number;
  /** Sparks at the far end. */
  endBurst?: boolean;
  power?: number;
}

export interface NovaOpts {
  emitter?: string;
  density?: number;
  element?: School;
  color?: number;
  duration?: number;
  /** Ring thickness as a fraction of the radius. */
  thickness?: number;
  particles?: boolean;
  shake?: number;
  /** Leave the school's mark at the centre. */
  mark?: boolean;
}

export interface CastContext {
  origin: THREE.Vector3;
  target?: THREE.Vector3;
  dir?: THREE.Vector3;
  element?: School;
  color?: number;
  radius?: number;
  duration?: number;
  scale?: number;
  rank?: number;
  source?: THREE.Object3D;
  targetGetter?: () => THREE.Vector3 | null;
  onHit?: (p: THREE.Vector3) => void;
}

// ---------------------------------------------------------------------------
// Looks: packed ramps per school and colour override
// ---------------------------------------------------------------------------

interface Look {
  core: number;
  body: number;
  tail: number;
  /** Emission scale (the school's glow). */
  glow: number;
  /** sRGB light colour. */
  light: number;
  bodyHex: number;
}

const _looks = new Map<number, Look>();

function saturated(hex: number): boolean {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return Math.max(r, g, b) - Math.min(r, g, b) >= 40;
}

/** The packed look of a school, optionally shifted toward a caller's colour. */
function lookOf(school: School, color?: number): Look {
  const si = KIT_SCHOOLS.indexOf(school);
  const key = color === undefined || !saturated(color) ? -1 - si : si * 16777216 + color;
  let l = _looks.get(key);
  if (!l) {
    const r = ramp(school);
    if (key < 0 || color === undefined) {
      l = { core: packLinear(r.core), body: packLinear(r.body), tail: packLinear(r.tail), glow: r.glow, light: r.light, bodyHex: r.body };
    } else {
      l = {
        core: packLinear(mixHex(color, r.core, 0.55)),
        body: packLinear(color),
        tail: packLinear(mixHex(darken(color, 0.5), r.tail, 0.5)),
        glow: r.glow,
        light: mixHex(color, r.light, 0.3),
        bodyHex: color,
      };
    }
    if (_looks.size > 512) _looks.clear();
    _looks.set(key, l);
  }
  return l;
}

/** A monster shot's colours: the rim and wake go red, a little of the school stays in the heart. */
const HOSTILE_RIM = 0xff3a22;
const HOSTILE_BODY = 0xc4140c;
const HOSTILE_TAIL = 0x420404;
/** The wake a monster's shot leaves. */
const HOSTILE_WAKE = 0xd01a10;
const _hostile = new Map<number, Look>();

function hostileLook(school: School, color?: number): Look {
  const base = lookOf(school, color);
  const key = base.bodyHex * 16 + KIT_SCHOOLS.indexOf(school);
  let l = _hostile.get(key);
  if (!l) {
    l = {
      core: packLinear(mixHex(HOSTILE_RIM, base.bodyHex, 0.22)),
      body: packLinear(HOSTILE_BODY),
      tail: packLinear(HOSTILE_TAIL),
      glow: Math.max(1, base.glow),
      light: mixHex(0xff3020, base.light, 0.25),
      bodyHex: HOSTILE_BODY,
    };
    if (_hostile.size > 256) _hostile.clear();
    _hostile.set(key, l);
  }
  return l;
}

// ---------------------------------------------------------------------------
// Live effect records
// ---------------------------------------------------------------------------

const enum K {
  Delay,
  Proj,
  Nova,
  Cone,
  Beam,
  Channel,
  Chain,
  Tether,
  Whirl,
  Summon,
  Aura,
  Shield,
  Pulse,
  /** One piece of a skill motif: a glow, a solid or a crescent on its own path. */
  Mote,
}

/** Which instanced family a Pulse animates. */
const enum Fam {
  Core,
  Beam,
  Column,
  Shell,
}

/** Projectile bodies. */
const enum Body {
  Arrow,
  Shard,
  Spear,
  Core,
  Rock,
  /** A thrown knife: steel, point first. */
  Knife,
  /** A thrown shield, flat and spinning. */
  Disc,
  /** A venom needle: thin steel, point first. */
  Needle,
  /** A glass vial, tumbling end over end. */
  Vial,
  /** A Phantom Blade: a ghost-steel knife, point first. */
  Phantom,
  /** A Hunting Skull: bone, face first, its glow trailing behind it. */
  Skull,
  /** A Frozen Orb: a round ball of ice, tumbling inside its glow. */
  Orb,
}

class Live {
  kind = K.Delay;
  gen = 0;
  active = false;
  essential = false;
  /** Started inside `EffectSystem.beginQuiet`: makes no sound, now or when it lands. */
  quiet = false;
  /** The skill rank it was started at: what it draws as it runs comes out at that rank (`kit/Boost.ts`). */
  rank = 1;
  stopped = false;
  born = 0;
  t = 0;
  dur = 0;
  fade = 0;
  school: School = 'physical';
  look: Look = lookOf('physical');
  color: number | undefined = undefined;
  scale = 1;
  size = 0;
  speed = 0;
  arc = 0;
  travelled = 0;
  total = 0;
  homing = 0;
  radius = 0;
  r1 = 0;
  height = 0;
  width = 0;
  power = 1;
  half = 0;
  count = 0;
  acc = 0;
  style = 0;
  body = Body.Core;
  fam = Fam.Core;
  flag = false;
  /** Motes: what draws the piece (0 core, 1 solid, 2 crescent) and its path (`Motifs.Path`). */
  mote = 0;
  path = 0;
  /** A projectile its caller moves (see `ProjectileOpts.carried`). */
  carried = false;
  readonly a = new THREE.Vector3();
  readonly b = new THREE.Vector3();
  readonly c = new THREE.Vector3();
  readonly d = new THREE.Vector3();
  readonly pts: THREE.Vector3[] = [];
  npts = 0;
  emitter = '';
  shed: string | null = null;
  fn: (() => void) | null = null;
  onHit: ((p: THREE.Vector3) => void) | null = null;
  target: (() => THREE.Vector3 | null) | null = null;
  getA: (() => THREE.Vector3) | null = null;
  getB: (() => THREE.Vector3) | null = null;
  follow: THREE.Object3D | null = null;
  slot: SlotHandle | null = null;
  /** The instanced family `slot` belongs to. */
  pool: InstancedPool | null = null;
  solid: SolidHandle | null = null;
  rib: RibbonHandle | null = null;
  ribs: Array<RibbonHandle | null> = [];
  light: LightHandle | null = null;
  ground: GroundHandle | null = null;

  reset(): void {
    this.essential = false;
    this.quiet = false;
    this.rank = 1;
    this.stopped = false;
    this.t = 0;
    this.dur = 0;
    this.fade = 0;
    this.color = undefined;
    this.scale = 1;
    this.size = this.speed = this.arc = this.travelled = this.total = this.homing = 0;
    this.radius = this.r1 = this.height = this.width = this.half = this.count = this.acc = this.style = 0;
    this.power = 1;
    this.flag = false;
    this.mote = 0;
    this.path = 0;
    this.carried = false;
    this.npts = 0;
    this.emitter = '';
    this.shed = null;
    this.fn = null;
    this.onHit = null;
    this.target = null;
    this.getA = this.getB = null;
    this.follow = null;
    this.slot = null;
    this.pool = null;
    this.solid = null;
    this.rib = null;
    this.ribs.length = 0;
    this.light = null;
    this.ground = null;
  }
}

class Handle implements EffectHandle {
  constructor(private sys: EffectSystem, private rec: Live, private gen: number) {}
  stop(): void {
    if (this.rec.gen === this.gen && this.rec.active) this.rec.stopped = true;
  }
  get done(): boolean {
    return this.rec.gen !== this.gen || !this.rec.active;
  }
  setEndpoint(p: THREE.Vector3): void {
    if (this.rec.gen === this.gen && this.rec.active) this.sys.retarget(this.rec, p);
  }
}

const DEAD_HANDLE: EffectHandle = { stop() {}, done: true, setEndpoint() {} };

// Scratch.
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

const NOVA_STEPS = 5;
const CONE_TICK = 0.06;
const BOLT_SEGS = 12;

/** Where a motif piece ends up, in floor-relative metres. */
function pieceEnd(p: Piece): [number, number, number] {
  if (p.path === Path.Swirl) {
    const a = p.a0 + p.sweep;
    return [p.sx + Math.cos(a) * p.r1, p.ey, p.sz + Math.sin(a) * p.r1];
  }
  return [p.ex, p.ey, p.ez];
}

// ---------------------------------------------------------------------------
// EffectSystem
// ---------------------------------------------------------------------------

export class EffectSystem {
  readonly scene: THREE.Scene;
  readonly fx: FXSystem;
  readonly decals: DecalSystem;
  readonly cores: InstancedPool;
  readonly beams: InstancedPool;
  readonly columns: InstancedPool;
  readonly shells: InstancedPool;
  readonly ribbons: RibbonBatch;
  readonly lights: LightPool;
  readonly solids: SolidPool;
  private readonly fields: FieldPool;
  /** Monster and boss ground spells, apart so a pack's pools never cut the hero's fields short. */
  private readonly hazardFields: FieldPool;
  private quality: QualityProfile;
  private rng: Rng;
  private rig: CameraRig | null = null;
  private camera: THREE.Camera | null = null;
  private live: Live[] = [];
  private free: Live[] = [];
  private stamp = 0;
  private clock = 0;
  /** Recent flash light (decays): how much brightness is piling up right now. */
  private glare = 0;
  /** Motifs started lately, decaying over `MOTIF_DECAY` seconds. */
  private motifLoad = 0;
  private liveAuras = 0;
  /** Decorative effects dropped by the budget since boot. */
  culled = 0;

  constructor(scene: THREE.Scene, fx: FXSystem, decals: DecalSystem, quality: QualityProfile, rng?: Rng) {
    this.scene = scene;
    this.fx = fx;
    this.decals = decals;
    this.quality = quality;
    this.rng = rng ?? new Random(0xfeed01);
    const q = quality.fxScale;
    this.cores = makeCores(96);
    this.beams = makeBeams(32);
    this.columns = makeColumns(24);
    this.shells = makeShells(24);
    this.ribbons = new RibbonBatch(48, 20);
    // Packed lights: a parked one costs nothing and a lit one only the
    // pixels it reaches, so the quality sets how many flashes light the
    // floor at once (6 on Low up to 24 on Ultra); the rest still glow and
    // bloom on their own.
    this.lights = new LightPool(scene, MAX_FX_LIGHTS, quality.fxLights ?? (q >= 0.9 ? 16 : 6));
    this.solids = new SolidPool(scene, 48);
    this.fields = new FieldPool(fx, decals, quality, this.rng);
    this.hazardFields = new FieldPool(fx, decals, quality, this.rng, 24);
    scene.add(this.cores.mesh, this.beams.mesh, this.columns.mesh, this.shells.mesh, this.ribbons.mesh);
    for (let i = 0; i < 64; i++) this.free.push(new Live());
    this.unQuality = events.on('quality:changed', ({ profile }) => this.setQuality(profile));
  }

  private unQuality: () => void;

  /** Follows a quality change live. Pools keep the size they were built with until the next scene. */
  setQuality(q: QualityProfile): void {
    this.quality = q;
    if (q.fxLights) this.lights.setLimit(q.fxLights);
    this.fields.setQuality(q);
    this.hazardFields.setQuality(q);
  }

  /** The quality's particle scale (0.35 Low .. 1.4 Ultra), for callers that trim detail. */
  get fxScale(): number {
    return this.quality.fxScale;
  }

  setRig(rig: CameraRig | null): void {
    this.rig = rig;
  }

  setCamera(camera: THREE.Camera | null): void {
    this.camera = camera;
  }

  get cameraRig(): CameraRig | null {
    return this.rig;
  }

  /** A roll on the effect stream, for presentation-only decisions. */
  chance(p: number): boolean {
    return this.rng.chance(p);
  }

  /** The packed look of a school (and a caller's colour), for systems built on this one. */
  lookFor(school: School, color?: number): { core: number; body: number; tail: number; glow: number; light: number } {
    return lookOf(school, color);
  }

  // -- plumbing -----------------------------------------------------------------

  private spawn(kind: K, essential = false): Live {
    const e = this.free.pop() ?? new Live();
    e.reset();
    e.kind = kind;
    e.gen = (e.gen + 1) | 0;
    e.active = true;
    e.essential = essential;
    e.quiet = this.hush > 0;
    e.rank = BOOST.rank;
    e.born = this.stamp++;
    this.live.push(e);
    return e;
  }

  /** Claims a slot of an instanced family for a record. */
  private take(e: Live, pool: InstancedPool): SlotHandle | null {
    e.slot = pool.alloc();
    e.pool = pool;
    return e.slot;
  }

  private handle(e: Live): EffectHandle {
    return new Handle(this, e, e.gen);
  }

  private release(e: Live): void {
    e.pool?.free(e.slot);
    this.solids.free(e.solid);
    if (e.rib) this.ribbons.retire(e.rib);
    for (const r of e.ribs) this.ribbons.retire(r);
    if (e.light) this.lights.release(e.light, 0.12);
    if (e.kind === K.Aura && e.flag) this.liveAuras = Math.max(0, this.liveAuras - 1);
    if (e.ground && (e.kind === K.Aura || e.kind === K.Cone || e.kind === K.Summon || e.kind === K.Whirl)) this.decals.glows.end(e.ground);
    e.active = false;
    e.gen = (e.gen + 1) | 0;
    e.fn = null;
    e.onHit = null;
    e.target = null;
    e.getA = e.getB = null;
    e.follow = null;
    this.free.push(e);
  }

  /** Moves a beam's far end, or ripples a shield at a world point. */
  retarget(e: Live, p: THREE.Vector3): void {
    if (e.kind === K.Shield) {
      this.fx.burst('shieldHit', p.x, p.y, p.z, { color: e.color });
      this.lights.flash(p.x, p.y, p.z, e.look.light, 4 * FX_COMFORT.light, 4, 0.12);
      e.acc = 0;
      this.sfx('block.magic', p.x, p.z);
      return;
    }
    if (e.kind === K.Proj && e.carried) {
      // Carried shots: the old position becomes the tail, so the body and its
      // wake point along the flight.
      const d = e.c.distanceTo(p);
      if (d < 1e-4) return;
      e.a.copy(e.c);
      e.b.copy(p);
      e.c.copy(p);
      e.acc += d;
      return;
    }
    e.b.copy(p);
  }

  private sfx(id: string, x: number, z: number, pitch?: number): void {
    if (this.hush > 0) return;
    events.emit('sfx', { id, x, z, pitch });
  }

  /** Above zero between `beginQuiet` and `endQuiet`, and while a quiet effect updates. */
  private hush = 0;

  /**
   * From here until `endQuiet`, effects make no sound, and neither do the
   * ones they start, now or later: a projectile landing, a delayed blast, a
   * slam coming down. A player skill sounds like the skill
   * (`audio/SkillSounds.ts`), not like the projectiles, novas and teleports
   * it is drawn with. Calls nest; pair each with `endQuiet` in a `finally`.
   *
   * A begin/end pair rather than a callback, so the stand-in effects the
   * headless checks use (which answer every call and run every callback
   * later) cannot delay the skill itself.
   */
  beginQuiet(): void {
    this.hush++;
  }

  endQuiet(): void {
    this.hush = Math.max(0, this.hush - 1);
  }

  private trauma(amount: number): void {
    if (amount <= 0) return;
    if (this.rig) this.rig.addTrauma(amount);
    else events.emit('shake', { amount, duration: 0.3 });
  }

  /** Writes a core instance (bigger and brighter at a high skill rank, `kit/Boost.ts`). */
  private putCore(h: SlotHandle | null, x: number, y: number, z: number, size: number, dx: number, dy: number, dz: number, stretch: number, l: Look, emit: number, style: number, fade: number, seed: number): void {
    const p = this.cores;
    p.set(h, 0, x, y, z, size * BOOST.size);
    p.set(h, 1, dx, dy, dz, stretch);
    p.set(h, 2, l.core, l.body, l.tail, emit * l.glow * BOOST.glow);
    p.set(h, 3, style, fade, seed, 0);
  }

  private putLook(pool: InstancedPool, h: SlotHandle | null, l: Look, emit: number, style: number, fade: number): void {
    pool.set(h, 2, l.core, l.body, l.tail, emit * l.glow * BOOST.glow);
    pool.set(h, 3, style, fade, this.rng.next(), 0);
  }

  // -- primitives -----------------------------------------------------------------

  /** A one-shot point light (sRGB colour). */
  flash(x: number, y: number, z: number, color: number, intensity = 8, distance = 9, duration = 0.16): void {
    this.glare += intensity;
    this.lights.flash(x, y, z, color, intensity * FX_EXPOSURE.value * FX_COMFORT.light, distance, duration);
  }

  /** The cast beat: a gathering flare at the caster's hand and a light on their armour. */
  castFlare(school: School, x: number, y: number, z: number, opts: { scale?: number; dir?: THREE.Vector3; light?: number } = {}): void {
    const el = element(school);
    const scale = opts.scale ?? 1;
    this.fx.burst(el.castEmitter, x, y, z, { scale, dir: opts.dir });
    if (opts.light !== 0) this.flash(x, y + 0.1, z, el.light, 6 * scale * (opts.light ?? 1), 5 + 2 * scale, 0.13);
  }

  /**
   * A short-lived instanced shape that fades in, holds and fades out, growing
   * from r0 to r1 (columns grow height too). The workhorse behind flashes of
   * light columns, expanding fronts and summoning shafts.
   */
  private pulse(fam: Fam, style: number, x: number, y: number, z: number, r0: number, r1: number, height: number, dur: number, l: Look, emit: number, follow: THREE.Object3D | null = null): Live | null {
    const pool = fam === Fam.Core ? this.cores : fam === Fam.Beam ? this.beams : fam === Fam.Column ? this.columns : this.shells;
    const h = pool.alloc();
    if (!h) return null;
    const e = this.spawn(K.Pulse);
    e.fam = fam;
    e.style = style;
    e.slot = h;
    e.pool = pool;
    e.a.set(x, y, z);
    e.radius = r0;
    e.r1 = r1;
    e.height = height;
    e.dur = Math.max(0.05, dur);
    e.look = l;
    e.power = emit;
    e.follow = follow;
    this.putLook(pool, h, l, emit, style, 0);
    return e;
  }

  // -- impacts --------------------------------------------------------------------

  /** The full impact recipe: particles, light, floor mark, trauma, sound. */
  impact(school: School, x: number, y: number, z: number, opts: ImpactOpts = {}): void {
    this.impactAt(school, x, y, z, opts, opts.decal !== false);
  }

  private impactAt(school: School, x: number, y: number, z: number, opts: ImpactOpts, mark: boolean): void {
    const el = element(school);
    const scale = opts.scale ?? 1;
    // Sprites a little larger than the mark and shake: a hit must read from
    // the game camera, 15 m up.
    const ps = scale * IMPACT_SPRITE;
    const base = opts.crit ? 18 : 12;
    const count = Math.max(3, Math.round(base * (opts.density ?? 1)));
    if (opts.emitter && opts.emitter !== el.emitter) {
      this.fx.burst(opts.emitter, x, y, z, { color: opts.color, scale: ps, dir: opts.dir, count, school });
      this.fx.burst(el.emitter, x, y, z, { scale: ps * 0.7, dir: opts.dir, count: 6 });
    } else {
      this.fx.burst(el.emitter, x, y, z, { scale: ps, dir: opts.dir, count });
    }
    if (opts.crit) this.fx.burst('crit', x, y, z, { scale: ps * 0.9 });

    if (opts.light !== 0) {
      const boost = (opts.light ?? 1) * (opts.crit ? 1.7 : 1);
      const l = lookOf(school, opts.color);
      this.flash(x, y, z, l.light, 9 * scale * boost, 7 * scale + 3, 0.15 + 0.05 * scale);
    }

    if (mark && scale > 0.55) {
      const r = 0.5 * scale * this.rng.range(0.85, 1.2);
      const mark = school === 'physical' && scale >= 1.2 ? 'crater' : el.decal;
      this.decals.add(mark, x, z, r);
    }

    this.trauma(opts.shake ?? (opts.crit ? 0.24 : 0.12) * scale);
    if (opts.sfx !== null) this.sfx(opts.sfx ?? el.sfxHit, x, z);
  }

  /**
   * A weapon meeting a body: steel sparks, a slash flash and the swing's
   * element if it carries one. What flies off the body (blood, chips, ichor)
   * is the body's own business: `Enemy.takeDamage` throws it by material.
   */
  meleeHit(x: number, y: number, z: number, opts: ImpactOpts & { element?: School } = {}): void {
    const scale = opts.scale ?? 1;
    this.impactAt('physical', x, y, z, opts, false);
    const s = opts.element;
    if (s && s !== 'physical') this.fx.burst(element(s).emitter, x, y, z, { scale: scale * 0.8, dir: opts.dir, count: 7 });
  }

  /** A kill: gore, a pool, a light pop, and a harder shake for big ones. */
  kill(x: number, y: number, z: number, opts: { scale?: number; element?: School; heavy?: boolean; color?: number } = {}): void {
    const scale = opts.scale ?? 1;
    const l = lookOf(opts.element ?? 'physical', opts.color);
    this.fx.burst('gib', x, y + 0.3, z, { scale });
    this.fx.burst('dissolve', x, y + 0.3, z, { scale, color: l.bodyHex, school: opts.element });
    this.decals.splatter('gore', x, z, 0.7 * scale, 3);
    this.flash(x, y + 0.5, z, l.light, 6 * scale, 6, 0.2);
    this.trauma(opts.heavy ? 0.4 : 0.12 * scale);
    this.sfx(opts.heavy ? 'death.heavy' : 'death.normal', x, z);
  }

  // -- projectiles ------------------------------------------------------------------

  /**
   * A projectile with a body, a ribbon wake, shed particles and its own light,
   * landing with the full impact. The damage callback fires on arrival, exactly
   * when the shot gets there: timing is gameplay.
   */
  projectile(from: THREE.Vector3, to: THREE.Vector3, opts: ProjectileOpts = {}): EffectHandle {
    const school = opts.element ?? 'fire';
    const el = element(school);
    const scale = opts.scale ?? 1;
    const size = (opts.size ?? 0.22) * scale;
    const thrown =
      opts.shape === 'knife' ? Body.Knife :
      opts.shape === 'shield' ? Body.Disc :
      opts.shape === 'needle' ? Body.Needle :
      opts.shape === 'vial' ? Body.Vial :
      opts.shape === 'phantom' ? Body.Phantom : null;
    // Solid things that fly: arrows, knives and shields carry no glowing heart.
    const isArrow = thrown !== null || opts.shape === 'arrow' || (opts.shape !== 'bolt' && opts.shape !== 'orb' && school === 'physical');
    const body = thrown ?? (opts.shape === 'skull' && !isArrow ? Body.Skull : opts.shape === 'orb' && !isArrow ? Body.Orb : isArrow ? Body.Arrow : school === 'cold' ? Body.Shard : school === 'bone' ? Body.Spear : Body.Core);

    const e = this.spawn(K.Proj, !!opts.onHit);
    e.school = school;
    e.color = opts.color;
    e.look = opts.hostile ? hostileLook(school, opts.color) : lookOf(school, opts.color);
    e.scale = scale;
    e.size = size;
    e.speed = opts.speed ?? 18;
    e.arc = opts.arc ?? 0;
    e.dur = opts.maxLife ?? 6;
    e.homing = opts.homing ?? 0;
    e.target = opts.target ?? null;
    e.onHit = opts.onHit ?? null;
    e.flag = opts.impact !== false;
    e.carried = !!opts.carried;
    if (e.carried) e.dur = opts.maxLife ?? 12;
    e.body = body;
    e.a.copy(from);
    e.b.copy(to);
    e.c.copy(from);
    e.total = Math.max(0.001, Math.hypot(to.x - from.x, to.z - from.z));
    e.shed = opts.shed && opts.shed !== el.shedEmitter ? opts.shed : null;
    e.emitter = isArrow ? '' : el.shedEmitter;
    e.acc = 0.2;
    e.radius = opts.spin ?? 0;

    // Body.
    if (body === Body.Arrow) e.solid = this.solids.alloc('arrow');
    else if (body === Body.Knife) e.solid = this.solids.alloc('blade');
    else if (body === Body.Disc) e.solid = this.solids.alloc('buckler');
    else if (body === Body.Needle) e.solid = this.solids.alloc('needle');
    else if (body === Body.Vial) e.solid = this.solids.alloc('vial');
    else if (body === Body.Phantom) e.solid = this.solids.alloc('phantom');
    else if (body === Body.Shard) e.solid = this.solids.alloc('shard');
    else if (body === Body.Spear) e.solid = this.solids.alloc('spear');
    else if (body === Body.Skull) e.solid = this.solids.alloc('skull');
    else if (body === Body.Orb) e.solid = this.solids.alloc('orb');
    if (!isArrow) this.take(e, this.cores);
    e.style =
      school === 'fire' ? CORE_STYLE.fireball :
      school === 'lightning' ? CORE_STYLE.plasma :
      school === 'poison' ? CORE_STYLE.glob :
      school === 'cold' ? CORE_STYLE.frost :
      school === 'bone' ? CORE_STYLE.bone :
      school === 'physical' ? CORE_STYLE.soft : CORE_STYLE.orb;
    if (opts.hostile) e.style = CORE_STYLE.hostile;

    // Wake.
    const want = opts.trail === null ? null : opts.trail && RIBBON_PRESETS[opts.trail] ? opts.trail : thrown !== null ? 'thrown' : isArrow ? 'arrow' : el.trail;
    const preset = want ? RIBBON_PRESETS[want] : undefined;
    if (preset && preset.kind !== 'swing') {
      e.rib = this.ribbons.start(preset.kind, {
        life: preset.life,
        width: thrown !== null ? Math.max(0.08, size * preset.width) : isArrow ? 0.05 : Math.max(0.06, size * preset.width * 2),
        school,
        color: opts.hostile ? HOSTILE_WAKE : opts.color !== undefined && saturated(opts.color) ? opts.color : undefined,
        emit: preset.emit,
      });
    }
    // Travel light: fire and magic carry their own light; arrows and bone do not.
    if (body === Body.Core || body === Body.Shard || body === Body.Skull || body === Body.Orb) {
      if (this.quality.fxScale >= 0.5) e.light = this.lights.hold(from.x, from.y, from.z, e.look.light, 2.2 + size * 6, 4 + size * 8, school === 'fire' ? 0.35 : school === 'lightning' ? 0.6 : 0.1);
    }

    if (!e.carried) this.sfx(el.sfxCast, from.x, from.z);
    if (opts.flare !== false && !isArrow) {
      _v1.set(to.x - from.x, 0, to.z - from.z).normalize();
      this.castFlare(school, from.x, from.y, from.z, { scale: Math.max(0.6, Math.min(1.6, size / 0.3)), dir: _v1 });
    }
    this.placeProj(e, 0);
    return this.handle(e);
  }

  private placeProj(e: Live, t: number): void {
    const p = e.c;
    // Direction of travel (with the lob's slope).
    _v2.set(e.b.x - e.a.x, e.b.y - e.a.y, e.b.z - e.a.z).normalize();
    if (e.arc > 0) _v2.y += (Math.cos(t * Math.PI) * e.arc * Math.PI) / Math.max(1, e.total);
    _v2.normalize();
    if (e.solid) {
      if (e.body === Body.Disc) {
        // A shield flies flat and spins: its face turns about the up axis.
        const a = e.t * 22;
        const r = Math.max(0.55, e.size * 1.6);
        this.solids.place(e.solid, p.x, p.y, p.z, Math.cos(a), 0, Math.sin(a), 0, r, r);
      } else if (e.body === Body.Vial) {
        // A vial tumbles end over end along its flight.
        const a = e.t * 13;
        const c = Math.cos(a);
        const r = Math.max(0.7, e.size * 2.2);
        this.solids.place(e.solid, p.x, p.y, p.z, _v2.x * c, Math.sin(a), _v2.z * c, e.t * 3, r, r);
      } else if (e.body === Body.Skull) {
        // A skull flies face first and upright, rocking a little as it hunts.
        const r = Math.max(0.42, e.size * 1.7);
        this.solids.place(e.solid, p.x, p.y, p.z, _v2.x, _v2.y, _v2.z, Math.sin(e.t * 7) * 0.22, r, r);
      } else if (e.body === Body.Orb) {
        // An orb tumbles slowly on two axes as it rolls on, so its facets catch the light.
        const a = e.t * 2.6;
        const r = e.size * 1.5;
        this.solids.place(e.solid, p.x, p.y, p.z, Math.cos(a), Math.sin(a * 0.7) * 0.5, Math.sin(a), e.t * 1.9, r, r);
      } else {
        const knife = e.body === Body.Knife || e.body === Body.Phantom;
        const roll = e.body === Body.Shard ? e.t * 4.2 : e.body === Body.Spear ? e.t * 14 : knife ? 0.35 : 0;
        const len =
          e.body === Body.Arrow ? Math.max(0.7, e.size / 0.24) :
          knife ? Math.max(0.55, e.size * 1.6) :
          e.body === Body.Needle ? Math.max(0.6, e.size * 2) :
          e.body === Body.Shard ? e.size * 3.2 : e.size * 4.2;
        const girth = e.body === Body.Arrow || knife || e.body === Body.Needle ? len : e.body === Body.Shard ? e.size * 3.2 : e.size * 3;
        this.solids.place(e.solid, p.x, p.y, p.z, _v2.x, _v2.y, _v2.z, roll, len, girth);
      }
    }
    if (e.slot) {
      let sz = e.size * 3.4;
      let emit = 1;
      if (e.body === Body.Shard) { sz = e.size * 2.6; emit = 0.6; }
      if (e.body === Body.Spear) { sz = e.size * 2.6; emit = 0.45; }
      if (e.body === Body.Orb) { sz = e.size * 3.2; emit = 0.55; }
      // The skull's glow hangs behind it, so the bone is seen and not washed out.
      const back = e.body === Body.Skull ? e.size * 1.4 : 0;
      if (back > 0) { sz = e.size * 1.6; emit = 0.55; }
      if (e.school === 'lightning') sz *= this.rng.range(0.8, 1.25);
      const fadeIn = Math.min(1, e.t * 12);
      this.putCore(e.slot, p.x - _v2.x * back, p.y - _v2.y * back, p.z - _v2.z * back, sz, _v2.x, _v2.y, _v2.z, e.school === 'fire' ? 1.8 : 0.9, e.look, emit, e.style, fadeIn, (e.born % 97) / 97);
    }
  }

  private upProj(e: Live, dt: number): boolean {
    if (e.stopped || e.t > e.dur) return false;
    if (e.carried) {
      const p = e.c;
      this.placeProj(e, 0);
      if (e.rib) this.ribbons.pushPoint(e.rib, p.x, p.y, p.z);
      if (e.light) this.lights.move(e.light, p.x, p.y, p.z);
      if (e.emitter) {
        const step = this.fx.pressure > 0.7 ? 0.8 : 0.42;
        while (e.acc >= step) {
          e.acc -= step;
          this.fx.burst(e.emitter, p.x, p.y, p.z, { scale: 0.75 * e.scale });
        }
      } else e.acc = 0;
      return true;
    }
    if (e.target && e.homing) {
      const t = e.target();
      if (t) e.b.lerp(t, Math.min(1, e.homing * dt * 6));
    }
    e.travelled += e.speed * dt;
    const t = Math.min(1, e.travelled / e.total);
    const p = e.c;
    p.set(
      e.a.x + (e.b.x - e.a.x) * t,
      e.a.y + (e.b.y - e.a.y) * t + (e.arc > 0 ? Math.sin(t * Math.PI) * e.arc : 0),
      e.a.z + (e.b.z - e.a.z) * t,
    );
    this.placeProj(e, t);
    if (e.rib) this.ribbons.pushPoint(e.rib, p.x, p.y, p.z);
    if (e.light) this.lights.move(e.light, p.x, p.y, p.z);
    if (e.emitter) {
      e.acc += e.speed * dt;
      const step = this.fx.pressure > 0.7 ? 0.8 : 0.42;
      while (e.acc >= step) {
        e.acc -= step;
        e.count++;
        this.fx.burst(e.emitter, p.x, p.y, p.z, { scale: 0.75 * e.scale });
        if (e.shed && e.count % 2 === 0) this.fx.burst(e.shed, p.x, p.y, p.z, { count: 2, scale: 0.5 * e.scale, color: e.color, school: e.school });
      }
    }
    if (t >= 1) {
      if (e.flag) {
        if (e.body === Body.Arrow) {
          this.impact(e.school, p.x, p.y, p.z, { scale: e.scale * 0.6, color: e.color, shake: 0.02, light: 0, decal: false, sfx: 'arrow.thunk' });
        } else if (e.body === Body.Knife || e.body === Body.Phantom || e.body === Body.Disc || e.body === Body.Needle) {
          this.impact(e.school, p.x, p.y, p.z, { scale: e.scale * (e.body === Body.Disc ? 0.9 : 0.6), color: e.color, shake: e.body === Body.Disc ? 0.06 : 0.02, light: 0.4, decal: false });
        } else {
          this.impact(e.school, p.x, p.y, p.z, { scale: e.scale, color: e.color });
        }
      }
      const cb = e.onHit;
      e.onHit = null;
      cb?.(p.clone());
      return false;
    }
    return true;
  }

  /** A meteor: a telegraph, then something falls (rock, bolt, or arrows). */
  meteor(x: number, z: number, opts: { height?: number; delay?: number; radius?: number; color?: number; element?: School; onHit?: (p: THREE.Vector3) => void; emitter?: string; density?: number } = {}): EffectHandle {
    const school = opts.element ?? 'fire';
    const el = element(school);
    const height = opts.height ?? 22;
    const radius = opts.radius ?? 3;
    const delay = opts.delay ?? 1.1;
    const tg = this.decals.aim(x, z, radius, delay, opts.color ?? el.body);
    const to = new THREE.Vector3(x, floorAt(x, z) + 0.3, z);
    if (school === 'lightning') {
      return this.delay(delay, () => {
        tg.cancel();
        this.skyBolt(x, z, { radius, color: opts.color });
        opts.onHit?.(to);
      });
    }
    if (school === 'physical') {
      return this.delay(Math.max(0.15, delay * 0.6), () => {
        tg.cancel();
        this.arrowRain(x, z, radius, () => opts.onHit?.(to));
      });
    }
    const from = new THREE.Vector3(x + this.rng.range(-4, 4), height, z + this.rng.range(-4, 4));
    // Same clock as ever: the rock drops when the telegraph closes, at speed 42
    // over the ground distance, so the damage lands when it always did.
    return this.delay(delay, () => {
      this.projectile(from, to, {
        element: school, color: opts.color, speed: 42, size: 0.55, impact: false, flare: false,
        onHit: (p) => {
          tg.cancel();
          this.explosion(p.x, p.y, p.z, { radius, element: school, color: opts.color });
          if (opts.emitter) this.fx.burst(opts.emitter, p.x, p.y + 0.3, p.z, { scale: radius / 3, count: 12 * (opts.density ?? 1), school });
          opts.onHit?.(p);
        },
      });
      this.sfx('spell.meteor', x, z);
    });
  }

  /** A bolt from the sky: a jagged arc to the ground, a white flash, a scar. */
  skyBolt(x: number, z: number, opts: { radius?: number; color?: number } = {}): void {
    const r = opts.radius ?? 2.6;
    const gy = floorAt(x, z);
    const top = _v1.set(x + this.rng.range(-1.6, 1.6), gy + 22, z + this.rng.range(-1.6, 1.6)).clone();
    const mid = _v2.set(x + this.rng.range(-0.9, 0.9), gy + 9, z + this.rng.range(-0.9, 0.9)).clone();
    const ground = new THREE.Vector3(x, gy + 0.15, z);
    this.chainLightning([top, mid, ground], { color: opts.color, width: 0.42, duration: 0.3, jumpDelay: 0.012, silent: true });
    const l = lookOf('lightning', opts.color);
    this.pulse(Fam.Column, COLUMN_STYLE.strike, x, gy, z, 0.5, 0.25, 24, 0.22, l, 1.6);
    this.flash(x, gy + 3, z, 0xdfeaff, 46, 22, 0.24);
    this.fx.burst('hit.lightning', x, gy + 0.4, z, { scale: 1.6 });
    this.fx.burst('shock', x, gy + 0.3, z, { scale: r / 2.4 });
    this.decals.add('fork', x, z, r * 0.8);
    this.nova(x, z, r, { element: 'lightning', color: opts.color, duration: 0.3, particles: false });
    this.trauma(0.32);
    this.sfx('spell.thunder', x, z);
  }

  /** A volley called down: arrows fall across the circle over a beat. */
  arrowRain(x: number, z: number, radius: number, onLand?: () => void): void {
    const n = Math.round(9 * Math.max(0.5, Math.min(1.4, this.quality.fxScale)));
    let landed = false;
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * Math.PI * 2;
      const d = Math.sqrt(this.rng.next()) * radius;
      const tx = x + Math.cos(a) * d;
      const tz = z + Math.sin(a) * d;
      const from = new THREE.Vector3(tx - 3.5, 15 + this.rng.range(0, 3), tz - 3.5);
      const to = new THREE.Vector3(tx, floorAt(tx, tz) + 0.05, tz);
      this.delay(i * 0.035, () => {
        this.projectile(from, to, {
          element: 'physical', speed: 46, size: 0.3, impact: false, flare: false,
          onHit: (p) => {
            this.fx.burst('dust', p.x, p.y + 0.05, p.z, { count: 5, scale: 0.6 });
            this.fx.burst('sparks', p.x, p.y + 0.05, p.z, { count: 3, scale: 0.5 });
            this.decals.add('dust', p.x, p.z, 0.3);
            if (!landed) {
              landed = true;
              onLand?.();
            }
          },
        });
      });
    }
    this.sfx('spell.volley', x, z);
  }

  // -- areas ------------------------------------------------------------------------

  /** A blast: a ball of the element, a shock ring, a lit room, a mark, a big shake. */
  explosion(x: number, y: number, z: number, opts: { radius?: number; element?: School; color?: number; shake?: number } = {}): void {
    const school = opts.element ?? 'fire';
    const el = element(school);
    const r = opts.radius ?? 3;
    const scale = r / 3;
    const l = lookOf(school, opts.color);
    this.fx.burst('explosion', x, y + 0.2, z, { scale, school, color: opts.color });
    if (school !== 'fire') this.fx.burst(el.emitter, x, y + 0.3, z, { scale: scale * 1.2, count: 14 });
    this.flash(x, y + 0.6, z, l.light, 34 * scale, 14 * scale + 4, 0.34);
    // The ball itself: a hot core that swells and dies in a third of a second.
    // It sits up off the floor so it reads as a ball, not a plate on the stone.
    this.pulse(Fam.Core, school === 'fire' ? CORE_STYLE.fireball : school === 'lightning' ? CORE_STYLE.plasma : school === 'cold' ? CORE_STYLE.frost : school === 'poison' ? CORE_STYLE.glob : CORE_STYLE.orb,
      x, y + 0.85 * scale, z, 0.8 * scale, 1.9 * scale, 0, 0.26, l, 1.1);
    // The billowing ball is the burst's fireball sprites; the floor front is
    // the nova below. A big core or a second front read as a glowing plate.
    this.decals.add(el.decal, x, z, r * 0.75);
    if (school === 'fire') {
      this.decals.glow('firePool', x, z, r * 0.6, 2.6, 'fire', 1.6);
      ripple('heat', x, y + 1.0, z, r * 0.8, 2.2, 0.8);
    }
    this.nova(x, z, r, { element: school, color: opts.color, duration: 0.45, particles: false });
    this.trauma(opts.shake ?? Math.min(0.75, 0.32 * scale));
    this.sfx('spell.explosion', x, z);
  }

  /**
   * A boss changes phase: power bursts up out of the body in its school, the
   * floor breaks and two waves throw the light across the room. `size` is the
   * boss's model scale. Shake and knockback are the caller's.
   */
  bossPhase(x: number, z: number, size: number, school: School = 'physical'): void {
    const el = element(school);
    const l = lookOf(school);
    const y = floorAt(x, z);
    this.fx.burst('bossSlam', x, y + 0.2, z, { scale: size * 1.2 });
    this.fx.burst(el.castEmitter, x, y + 1.4 * size, z, { scale: size * 1.6 });
    if (school !== 'physical') this.fx.burst(el.emitter, x, y + 1.0 * size, z, { scale: size * 1.2, count: 18 });
    this.pulse(Fam.Column, COLUMN_STYLE.light, x, y, z, 0.5 * size, 1.2 * size, 7 * size, 0.8, l, 0.9);
    this.pulse(Fam.Core, CORE_STYLE.flare, x, y + 1.3 * size, z, 0.8 * size, 2.4 * size, 0, 0.35, l, 1.0);
    this.nova(x, z, 5 * size, { element: school, duration: 0.6, thickness: 0.2 });
    this.nova(x, z, 8 * size, { element: school, duration: 0.95, thickness: 0.08, particles: false });
    this.flash(x, y + 2 * size, z, l.light, 30, 14 + 4 * size, 0.55);
    this.decals.add('crater', x, z, 2.2 * size);
    this.decals.add('crack', x, z, 6 * size);
    if (el.glowDecal) this.decals.add(el.glowDecal, x, z, 3 * size);
  }

  /** An expanding wave along the floor. */
  nova(x: number, z: number, radius: number, opts: NovaOpts = {}): EffectHandle {
    const school = opts.element ?? 'physical';
    const el = element(school);
    const l = lookOf(school, opts.color);
    const dur = opts.duration ?? 0.55;
    const e = this.spawn(K.Nova);
    e.school = school;
    e.look = l;
    e.color = opts.color;
    e.a.set(x, floorAt(x, z), z);
    e.radius = radius;
    e.dur = dur;
    e.flag = opts.particles !== false;
    e.emitter = opts.emitter ?? el.emitter;
    e.power = opts.density ?? 1;
    e.ground = this.decals.glow('shockRing', x, z, radius, dur, opts.color ?? school, 1.4 + (opts.thickness ?? 0.16));
    this.take(e, this.shells);
    this.putLook(this.shells, e.slot, l, 0.8, SHELL_STYLE.front, 0);
    if (opts.shake) this.trauma(opts.shake);
    // The wave bends the frame as it runs out (`core/Ripples.ts`), harder for
    // a bigger wave and a higher-rank skill.
    if (radius >= 2) ripple('shock', x, e.a.y + 0.4, z, radius * 1.1, dur * 1.15, Math.min(1.2, (0.35 + radius / 10) * BOOST.size));
    if (opts.mark) {
      this.fx.burst(el.castEmitter, x, e.a.y + 0.4, z, { scale: Math.min(2, radius / 3) });
      this.flash(x, e.a.y + 1.2, z, l.light, 14 * Math.min(1.6, radius / 4), radius * 2.4, 0.22);
      this.decals.add(el.decal, x, z, radius * 0.45);
    }
    return this.handle(e);
  }

  private upNova(e: Live, dt: number): boolean {
    void dt;
    const p = e.t / e.dur;
    if (e.slot) {
      const k = 1 - Math.pow(1 - Math.min(1, p), 2.2);
      const r = e.radius * (0.1 + 0.95 * k);
      this.shells.set(e.slot, 0, e.a.x, e.a.y, e.a.z, r);
      this.shells.set(e.slot, 1, 0.22, 0, 0, 0);
      this.shells.put(e.slot, 3, 1, Math.min(1, p * 8) * (1 - p) * 0.9);
    }
    if (e.flag) {
      const want = Math.floor(Math.min(1, p) * NOVA_STEPS);
      while (e.count < want) {
        e.count++;
        this.fx.burst(e.emitter, e.a.x, e.a.y + 0.25, e.a.z, {
          count: Math.round(14 * e.power), scale: 0.4, ring: e.radius * (e.count / NOVA_STEPS), school: e.school, color: e.color,
        });
      }
    }
    if (e.stopped) this.decals.glows.end(e.ground);
    return !(e.stopped || p >= 1);
  }

  /** Ground slam: telegraph, then a heavy landing that breaks the floor. */
  slam(x: number, z: number, radius: number, opts: { windup?: number; element?: School; color?: number; emitter?: string; density?: number; onFire?: () => void } = {}): EffectHandle {
    const school = opts.element ?? 'physical';
    const windup = opts.windup ?? 0.9;
    const tg = this.decals.aim(x, z, radius, windup, opts.color ?? lookOf(school).bodyHex);
    this.sfx('boss.windup', x, z);
    return this.delay(windup, () => {
      tg.cancel();
      const l = lookOf(school, opts.color);
      const y = floorAt(x, z);
      this.fx.burst('bossSlam', x, y + 0.2, z, { scale: radius / 3.5 });
      if (school !== 'physical') this.fx.burst(element(school).emitter, x, y + 0.3, z, { scale: radius / 3, count: 16 });
      if (opts.emitter) this.fx.burst(opts.emitter, x, y + 0.3, z, { scale: radius / 3.5, count: 12 * (opts.density ?? 1), school });
      this.flash(x, y + 1, z, l.light, 26 * (radius / 3.5), 16, 0.3);
      this.decals.add('crater', x, z, radius * 0.6);
      this.decals.add('crack', x, z, radius * 0.9);
      for (let i = 0; i < 3; i++) {
        this.nova(x, z, radius * (0.75 + i * 0.28), { element: school, color: opts.color, duration: 0.45 + i * 0.16, thickness: 0.12, particles: i === 0 });
      }
      const spokes = Math.round(7 * Math.max(0.4, this.quality.fxScale));
      for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * Math.PI * 2 + this.rng.range(-0.2, 0.2);
        const d = radius * this.rng.range(0.45, 0.95);
        this.decals.add('crack', x + Math.cos(a) * d, z + Math.sin(a) * d, radius * 0.32, a);
      }
      this.trauma(0.85);
      if (this.rig) this.rig.setRumble(0);
      this.sfx('boss.slam', x, z);
      opts.onFire?.();
    });
  }

  /**
   * A cone: breath, frost spray, a war cry. Lights the floor in its shape.
   * `jet` is an emitter fired from the mouth down the cone on every tick of
   * its first two thirds, so a breath pours out of the caster and reaches as
   * far as it hits (its speed is scaled to the cone's length).
   */
  cone(origin: THREE.Vector3, direction: THREE.Vector3, halfAngle: number, range: number, opts: { element?: School; color?: number; duration?: number; emitter?: string; density?: number; jet?: string } = {}): EffectHandle {
    const school = opts.element ?? 'physical';
    const el = element(school);
    const l = lookOf(school, opts.color);
    const dur = opts.duration ?? 0.7;
    const e = this.spawn(K.Cone);
    e.school = school;
    e.look = l;
    e.color = opts.color;
    e.a.copy(origin);
    e.d.set(direction.x, 0, direction.z);
    if (e.d.lengthSq() < 1e-6) e.d.set(0, 0, 1);
    e.d.normalize();
    e.half = halfAngle;
    e.radius = range;
    e.dur = dur;
    e.acc = CONE_TICK;
    e.emitter = opts.emitter ?? el.emitter;
    // A cone has no wake, so its `shed` holds the jet.
    e.shed = opts.jet ?? null;
    e.power = opts.density ?? 1;
    const yaw = Math.atan2(e.d.x, e.d.z);
    e.ground = this.decals.glow('wedge', origin.x, origin.z, range, dur, opts.color ?? school, 1.5, yaw, halfAngle);
    if (school !== 'physical') {
      this.take(e, this.beams);
      const st = school === 'cold' ? BEAM_STYLE.frost : school === 'fire' || school === 'poison' ? BEAM_STYLE.flame : BEAM_STYLE.ray;
      this.putLook(this.beams, e.slot, l, 0.9, st, 0);
    }
    e.light = this.lights.hold(origin.x + e.d.x * range * 0.4, origin.y + 0.6, origin.z + e.d.z * range * 0.4, l.light, 10, range * 1.4, 0.3);
    this.sfx(el.sfxCast, origin.x, origin.z);
    return this.handle(e);
  }

  private upCone(e: Live, dt: number): boolean {
    const p = e.t / e.dur;
    const env = Math.min(1, p * 6) * (1 - Math.max(0, (p - 0.6) / 0.4));
    if (e.slot) {
      const len = e.radius * Math.min(1, p * 5);
      this.beams.set(e.slot, 0, e.a.x, e.a.y + 0.1, e.a.z, Math.max(0.3, Math.sin(e.half) * e.radius * 1.6));
      this.beams.set(e.slot, 1, e.a.x + e.d.x * len, e.a.y + 0.1, e.a.z + e.d.z * len, 0);
      this.beams.put(e.slot, 3, 1, env);
    }
    if (e.light) this.lights.set(e.light, 10 * env);
    e.acc += dt;
    if (e.acc >= CONE_TICK && !e.stopped) {
      e.acc = 0;
      const mid = e.radius * 0.55;
      _v1.set(e.d.x, 0.1, e.d.z).normalize();
      this.fx.burst(e.emitter, e.a.x + e.d.x * mid, e.a.y + 0.15, e.a.z + e.d.z * mid, {
        count: Math.round(16 * e.power), scale: 0.7, dir: _v1, speed: 1.6, school: e.school, color: e.color,
        scatter: Math.max(0.6, Math.sin(e.half) * mid),
      });
      if (e.shed && p < 0.68) {
        _v1.set(e.d.x, 0.04, e.d.z);
        this.fx.burst(e.shed, e.a.x + e.d.x * 0.5, e.a.y + 0.05, e.a.z + e.d.z * 0.5, {
          count: Math.round(12 * e.power), dir: _v1, speed: e.radius / 10, school: e.school, scatter: 0.15,
        });
      }
    }
    return !(e.stopped || p >= 1);
  }

  // -- beams --------------------------------------------------------------------------

  /** A straight beam between two points. */
  beam(from: THREE.Vector3, to: THREE.Vector3, opts: BeamOpts = {}): EffectHandle {
    const school = opts.element ?? 'arcane';
    const el = element(school);
    const l = lookOf(school, opts.color);
    const e = this.spawn(K.Beam);
    e.school = school;
    e.look = l;
    e.color = opts.color;
    e.a.copy(from);
    e.b.copy(to);
    e.width = opts.width ?? 0.28;
    e.dur = opts.duration ?? 0.35;
    e.power = opts.power ?? 1;
    e.flag = opts.endBurst !== false;
    e.emitter = opts.emitter ?? el.emitter;
    this.take(e, this.beams);
    this.putLook(this.beams, e.slot, l, 1, school === 'cold' ? BEAM_STYLE.frost : BEAM_STYLE.ray, 0);
    e.light = this.lights.hold(to.x, to.y, to.z, l.light, 6 * e.power, 7, 0.2);
    this.sfx(el.sfxCast, from.x, from.z);
    this.flash(from.x, from.y, from.z, l.light, 8, 7, 0.14);
    return this.handle(e);
  }

  private upBeam(e: Live, dt: number): boolean {
    const p = e.t / e.dur;
    const env = Math.min(1, p * 9) * (1 - Math.max(0, (p - 0.55) / 0.45));
    this.beams.set(e.slot, 0, e.a.x, e.a.y, e.a.z, e.width * (0.6 + 0.4 * env));
    this.beams.set(e.slot, 1, e.b.x, e.b.y, e.b.z, 0);
    this.beams.put(e.slot, 3, 1, env * Math.min(1.5, e.power));
    if (e.light) {
      this.lights.move(e.light, e.b.x, e.b.y, e.b.z);
      this.lights.set(e.light, 6 * env * e.power);
    }
    if (e.flag) {
      e.acc += dt;
      if (e.acc > 0.05) {
        e.acc = 0;
        this.fx.burst(e.emitter, e.b.x, e.b.y, e.b.z, { count: 3, scale: 0.6, school: e.school, color: e.color });
      }
    }
    return !(e.stopped || p >= 1);
  }

  /** A channelled beam that lasts until stopped; both ends are re-read each frame. */
  channel(getFrom: () => THREE.Vector3, getTo: () => THREE.Vector3, opts: BeamOpts & { maxDuration?: number; tickSfx?: string } = {}): EffectHandle {
    const school = opts.element ?? 'arcane';
    const el = element(school);
    const l = lookOf(school, opts.color);
    const e = this.spawn(K.Channel);
    e.school = school;
    e.look = l;
    e.color = opts.color;
    e.getA = getFrom;
    e.getB = getTo;
    e.width = opts.width ?? 0.24;
    e.dur = opts.maxDuration ?? 30;
    e.power = opts.power ?? 1;
    e.emitter = opts.emitter ?? el.emitter;
    this.take(e, this.beams);
    const st = school === 'fire' ? BEAM_STYLE.flame : school === 'cold' ? BEAM_STYLE.frost : school === 'poison' || school === 'bone' ? BEAM_STYLE.drain : BEAM_STYLE.ray;
    this.putLook(this.beams, e.slot, l, 1, st, 0);
    const b = getTo();
    e.light = this.lights.hold(b.x, b.y, b.z, l.light, 5 * e.power, 6, 0.3);
    return this.handle(e);
  }

  private upChannel(e: Live, dt: number): boolean {
    const a = e.getA!();
    const b = e.getB!();
    if (e.stopped) e.fade = Math.min(1, e.fade + dt * 7);
    const power = (1 - e.fade) * Math.min(1, e.t * 6) * e.power;
    const breathe = 1 + Math.sin(this.clock * 11) * 0.09;
    this.beams.set(e.slot, 0, a.x, a.y, a.z, e.width * breathe * (1 - e.fade));
    this.beams.set(e.slot, 1, b.x, b.y, b.z, 0);
    this.beams.put(e.slot, 3, 1, Math.min(1.5, power));
    if (e.light) {
      this.lights.move(e.light, b.x, b.y, b.z);
      this.lights.set(e.light, 5 * power);
    }
    if (!e.stopped) {
      e.acc += dt;
      if (e.acc > 0.06) {
        e.acc = 0;
        this.fx.burst(e.emitter, b.x, b.y, b.z, { count: 2, scale: 0.5, school: e.school, color: e.color });
      }
    }
    return !((e.stopped && e.fade >= 1) || e.t > e.dur);
  }

  /** Writes a jagged path from a to b into a bolt ribbon. */
  private boltPath(h: RibbonHandle | null, a: THREE.Vector3, b: THREE.Vector3, jitter: number): void {
    if (!h) return;
    this.ribbons.reset(h);
    const len = a.distanceTo(b);
    const amp = Math.min(1.2, len * jitter * 0.18);
    // Perpendicular basis.
    _v1.subVectors(b, a);
    _v2.crossVectors(_v1, _UP);
    if (_v2.lengthSq() < 1e-6) _v2.set(1, 0, 0);
    _v2.normalize();
    _v3.crossVectors(_v1, _v2).normalize();
    for (let i = 0; i < BOLT_SEGS; i++) {
      const t = i / (BOLT_SEGS - 1);
      const env = Math.sin(t * Math.PI);
      const o1 = (this.rng.next() * 2 - 1) * amp * env;
      const o2 = (this.rng.next() * 2 - 1) * amp * env;
      this.ribbons.pushPoint(h,
        a.x + _v1.x * t + _v2.x * o1 + _v3.x * o2,
        a.y + _v1.y * t + _v2.y * o1 + _v3.y * o2,
        a.z + _v1.z * t + _v2.z * o1 + _v3.z * o2);
    }
  }

  /** Chain lightning: `points` in jump order, starting at the caster. */
  chainLightning(points: THREE.Vector3[], opts: { color?: number; duration?: number; jumpDelay?: number; width?: number; silent?: boolean } = {}): EffectHandle {
    if (points.length < 2) return DEAD_HANDLE;
    const e = this.spawn(K.Chain);
    e.school = 'lightning';
    e.look = lookOf('lightning', opts.color);
    e.color = opts.color;
    e.dur = opts.duration ?? 0.34;
    e.half = opts.jumpDelay ?? 0.045;
    e.width = opts.width ?? 0.14;
    const n = Math.min(points.length, 10);
    while (e.pts.length < n) e.pts.push(new THREE.Vector3());
    for (let i = 0; i < n; i++) e.pts[i]!.copy(points[i]!);
    e.npts = n;
    for (let i = 0; i < n - 1; i++) e.ribs.push(null);
    e.count = 0; // links whose impact has fired
    if (!opts.silent) this.sfx('spell.chainLightning', points[0]!.x, points[0]!.z);
    return this.handle(e);
  }

  private upChain(e: Live, dt: number): boolean {
    e.acc += dt;
    const flick = e.acc >= 1 / 30;
    if (flick) e.acc = 0;
    for (let i = 0; i < e.npts - 1; i++) {
      const local = (e.t - i * e.half) / e.dur;
      if (local <= 0) continue;
      const a = e.pts[i]!;
      const b = e.pts[i + 1]!;
      if (local < 1) {
        if (!e.ribs[i]) {
          e.ribs[i] = this.ribbons.start('bolt', { life: 0.09, width: e.width * 2.2, school: 'lightning', color: e.color !== undefined && saturated(e.color) ? e.color : undefined, emit: 1.4 });
          this.boltPath(e.ribs[i]!, a, b, 1);
        } else if (flick) this.boltPath(e.ribs[i]!, a, b, 1);
      } else if (e.ribs[i]) {
        this.ribbons.retire(e.ribs[i]!);
        e.ribs[i] = null;
      }
      if (i + 1 > e.count) {
        e.count = i + 1;
        this.impact('lightning', b.x, b.y, b.z, { scale: 0.85, shake: 0.1, light: 1.2, decal: false, sfx: null });
      }
    }
    return !(e.stopped || e.t > e.dur + e.half * e.npts);
  }

  /** A persistent link (leash, drain, soul tether) between two live points. */
  tether(getFrom: () => THREE.Vector3, getTo: () => THREE.Vector3, opts: { color?: number; element?: School; width?: number; jitter?: number } = {}): EffectHandle {
    const school = opts.element ?? 'arcane';
    const e = this.spawn(K.Tether);
    e.school = school;
    e.look = lookOf(school, opts.color);
    e.getA = getFrom;
    e.getB = getTo;
    e.width = opts.width ?? 0.1;
    this.take(e, this.beams);
    this.putLook(this.beams, e.slot, e.look, 0.9, BEAM_STYLE.drain, 0);
    return this.handle(e);
  }

  private upTether(e: Live, dt: number): boolean {
    if (e.stopped) e.fade = Math.min(1, e.fade + dt * 6);
    const a = e.getA!();
    const b = e.getB!();
    this.beams.set(e.slot, 0, a.x, a.y, a.z, e.width * 2.5);
    this.beams.set(e.slot, 1, b.x, b.y, b.z, 0);
    this.beams.put(e.slot, 3, 1, (1 - e.fade) * Math.min(1, e.t * 5));
    return !(e.stopped && e.fade >= 1);
  }

  // -- things that follow a body ---------------------------------------------------------

  /** A whirlwind that follows a body: a spinning column of wind and grit. */
  whirlwind(follow: THREE.Object3D, opts: { radius?: number; height?: number; color?: number; element?: School; duration?: number } = {}): EffectHandle {
    const school = opts.element ?? 'physical';
    const e = this.spawn(K.Whirl);
    e.school = school;
    e.look = lookOf(school, opts.color);
    e.color = opts.color;
    e.follow = follow;
    e.radius = opts.radius ?? 1.6;
    e.height = opts.height ?? 2.4;
    e.dur = opts.duration ?? 2.5;
    this.take(e, this.columns);
    this.putLook(this.columns, e.slot, e.look, 0.8, COLUMN_STYLE.swirl, 0);
    this.sfx('spell.whirlwind', follow.position.x, follow.position.z);
    return this.handle(e);
  }

  private upWhirl(e: Live, dt: number): boolean {
    e.follow!.getWorldPosition(_v1);
    const fadeIn = Math.min(1, e.t * 5);
    const fadeOut = 1 - Math.max(0, (e.t - (e.dur - 0.3)) / 0.3);
    this.columns.set(e.slot, 0, _v1.x, _v1.y, _v1.z, e.radius);
    this.columns.set(e.slot, 1, e.height, 1.25, this.clock * 2.2, 0);
    this.columns.put(e.slot, 3, 1, fadeIn * Math.max(0, fadeOut) * 0.8);
    e.acc += dt;
    if (e.acc > 0.05) {
      e.acc = 0;
      const a = this.rng.next() * Math.PI * 2;
      _v2.set(-Math.sin(a), 0.4, Math.cos(a));
      this.fx.burst('dust', _v1.x + Math.cos(a) * e.radius * 0.9, _v1.y + this.rng.range(0.1, e.height * 0.6), _v1.z + Math.sin(a) * e.radius * 0.9, { count: 4, scale: 0.7, dir: _v2, speed: 2 });
      if (e.school !== 'physical') this.fx.burst(element(e.school).shedEmitter, _v1.x + Math.cos(a) * e.radius, _v1.y + 1, _v1.z + Math.sin(a) * e.radius, { scale: 0.7 });
    }
    return !(e.stopped || e.t >= e.dur);
  }

  /**
   * A lingering spell field (burning ground, a blizzard, a poison cloud...):
   * its floor glow and its own particles for `duration` seconds
   * (`fx/Fields.ts`). `stop()` ends it early.
   */
  field(x: number, z: number, radius: number, duration: number, opts: FieldOpts): EffectHandle {
    return this.fields.start(x, z, radius, duration, opts);
  }

  /**
   * A monster's or boss's lingering ground spell (`entities/Abilities.ts`
   * `spawnHazard`), drawn as the same living field as the hero's.
   */
  hazardField(x: number, z: number, radius: number, duration: number, opts: FieldOpts): EffectHandle {
    // A pack can lay many pools at once (a molten trail, a plague's death
    // clouds): on Low and Medium they fire half the bursts of a hero's field.
    opts.density = (opts.density ?? 1) * (this.quality.fxScale >= 0.9 ? 1 : 0.5);
    return this.hazardFields.start(x, z, radius, duration, opts);
  }

  /**
   * Power let out from the caster's own body: a buff, a stance, a war cry, a
   * banner. Never drawn as a blow (no slash, no gore): the school's flare at
   * the chest, a ring of its light rising round the body, and for a shout a
   * shock thrown out along the floor to `radius`. Grows a little with rank.
   */
  selfCast(kind: 'rise' | 'stance' | 'shout' | 'banner', school: School, x: number, z: number, opts: { color?: number; emitter?: string; density?: number; rank?: number; radius?: number } = {}): void {
    // Drawn at the skill's rank: denser, bigger and brighter on every preset.
    atRank(opts.rank ?? BOOST.rank, () => this.selfCastNow(kind, school, x, z, opts));
  }

  private selfCastNow(kind: 'rise' | 'stance' | 'shout' | 'banner', school: School, x: number, z: number, opts: { color?: number; emitter?: string; density?: number; radius?: number }): void {
    // The ring carries the rank's size; particles and light take it on their own.
    const size = BOOST.size;
    const dens = opts.density ?? 1;
    const count = Math.round(12 * dens);
    const y = floorAt(x, z);
    const el = element(school);
    const l = lookOf(school, opts.color);
    // Low and Medium skip the gathering flare: a self cast there spawns no
    // more than the impact it replaced.
    const rich = this.quality.fxScale >= 0.9;
    if (rich) this.fx.burst(el.castEmitter, x, y + 1.1, z);
    // The skill's own particles, unless they are a hit's: a self cast strikes nothing.
    const own = opts.emitter;
    if (own && !own.startsWith('hit.') && own !== 'impact') this.fx.burst(own, x, y + 1.0, z, { count: Math.round(8 * dens), scale: 0.8, color: opts.color, school });
    if (kind === 'shout') {
      this.fx.burst('self.roar', x, y + 0.1, z, { count, color: opts.color, school });
      this.decals.glow('shockRing', x, z, Math.max(2, Math.min(12, opts.radius ?? 6)), 0.5, opts.color ?? school, 1.5);
      this.trauma(0.1);
    } else {
      this.fx.burst('self.rise', x, y + 0.1, z, { count, color: opts.color, school });
      this.decals.glow('auraRing', x, z, 1.3 * size, 0.7, opts.color ?? school, 1.2);
      if (kind === 'stance' || kind === 'banner' || school === 'physical' || school === 'bone') this.fx.burst('self.stance', x, y + 0.05, z, { count });
      if (kind === 'banner') this.fx.burst('self.banner', x, y + 0.1, z, { count, color: opts.color, school });
    }
    this.flash(x, y + 1.2, z, l.light, 6, 6, 0.22);
  }

  /** A summoning circle that inscribes itself, with a shaft of the school's light. */
  summonCircle(x: number, z: number, radius: number, duration: number, color = 0xa855ff): EffectHandle {
    const school: School = color === 0xa855ff ? 'arcane' : 'bone';
    const l = lookOf(school, color);
    const e = this.spawn(K.Summon);
    e.look = l;
    e.color = color;
    e.school = school;
    e.a.set(x, floorAt(x, z), z);
    e.radius = radius;
    e.dur = duration;
    e.ground = this.decals.glow('runeCircle', x, z, radius, duration, color, 1.4, 0, 0.4);
    this.take(e, this.columns);
    this.putLook(this.columns, e.slot, l, 0.6, COLUMN_STYLE.light, 0);
    this.sfx('spell.summon', x, z);
    return this.handle(e);
  }

  private upSummon(e: Live, dt: number): boolean {
    const p = e.t / e.dur;
    const env = Math.min(1, e.t * 3) * (1 - Math.max(0, (e.t - (e.dur - 0.4)) / 0.4));
    this.columns.set(e.slot, 0, e.a.x, e.a.y, e.a.z, e.radius * 0.55);
    this.columns.set(e.slot, 1, 1.5 + 2.5 * Math.min(1, p * 2), 0.7, this.clock * 0.3, 0);
    this.columns.put(e.slot, 3, 1, env * 0.55);
    e.acc += dt;
    if (e.acc > 0.08) {
      e.acc = 0;
      const a = this.rng.next() * Math.PI * 2;
      const d = this.rng.range(0.3, 1) * e.radius;
      this.fx.burst('summon', e.a.x + Math.cos(a) * d, e.a.y + 0.1, e.a.z + Math.sin(a) * d, { count: 3, scale: 0.6, color: e.color });
    }
    return !(e.stopped || e.t >= e.dur);
  }

  /** A persistent aura around a body: buffs, elite auras, boss phases. */
  aura(follow: THREE.Object3D, opts: { radius?: number; height?: number; color?: number; element?: School; groundRing?: boolean } = {}): EffectHandle {
    const school = opts.element ?? 'arcane';
    const e = this.spawn(K.Aura);
    e.school = school;
    e.look = lookOf(school, opts.color);
    e.color = opts.color;
    e.follow = follow;
    e.radius = opts.radius ?? 1.1;
    e.height = opts.height ?? 2.2;
    this.take(e, this.shells);
    this.putLook(this.shells, e.slot, e.look, 0.7, SHELL_STYLE.aura, 0);
    if (opts.groundRing !== false) e.ground = this.decals.glow('auraRing', follow.position.x, follow.position.z, e.radius * 1.3, 1e6, opts.color ?? school, 1.1);
    e.flag = true;
    this.liveAuras++;
    return this.handle(e);
  }

  private upAura(e: Live, dt: number): boolean {
    e.follow!.getWorldPosition(_v1);
    if (e.stopped) e.fade = Math.min(1, e.fade + dt * 3);
    // Crowd cap: a pack of auras on one patch of floor stays about as bright as four.
    const crowd = Math.min(1, 4 / Math.max(1, this.liveAuras));
    const power = (1 - e.fade) * Math.min(1, e.t * 3) * crowd;
    this.shells.set(e.slot, 0, _v1.x, _v1.y, _v1.z, e.radius);
    this.shells.set(e.slot, 1, e.height / Math.max(0.1, e.radius), 0, 0, 0);
    this.shells.put(e.slot, 3, 1, power * 0.75);
    if (e.ground) this.decals.glows.move(e.ground, _v1.x, _v1.z, _v1.y);
    e.acc += dt;
    if (e.acc > 0.12 / Math.max(0.2, this.quality.fxScale * crowd)) {
      e.acc = 0;
      const a = this.rng.next() * Math.PI * 2;
      this.fx.burst(e.school === 'fire' ? 'embers' : element(e.school).shedEmitter, _v1.x + Math.cos(a) * e.radius, _v1.y + 0.2, _v1.z + Math.sin(a) * e.radius, { count: 4, scale: 0.6, color: e.color });
    }
    return !(e.stopped && e.fade >= 1);
  }

  /** A ward dome around a body. `handle.setEndpoint(p)` ripples it where it was struck. */
  shield(follow: THREE.Object3D, radius: number, color = 0x60a0ff, duration = 6): EffectHandle {
    const school: School = color === 0x60a0ff ? 'cold' : 'arcane';
    const e = this.spawn(K.Shield);
    e.school = school;
    e.look = lookOf(school, color);
    e.color = color;
    e.follow = follow;
    e.radius = radius;
    e.dur = duration;
    e.acc = 99;
    this.take(e, this.shells);
    this.putLook(this.shells, e.slot, e.look, 0.9, SHELL_STYLE.ward, 0);
    this.sfx('spell.shield', follow.position.x, follow.position.z);
    return this.handle(e);
  }

  private upShield(e: Live, dt: number): boolean {
    e.acc += dt;
    e.follow!.getWorldPosition(_v1);
    if (e.stopped || e.t > e.dur - 0.4) e.fade = Math.min(1, e.fade + dt * 2.6);
    const hit = Math.max(0, 1 - e.acc * 5);
    this.shells.set(e.slot, 0, _v1.x, _v1.y + e.radius * 0.55, _v1.z, e.radius * (1 + hit * 0.06));
    this.shells.put(e.slot, 3, 1, (1 - e.fade) * Math.min(1, e.t * 4) * (0.7 + hit * 0.8));
    return e.fade < 1;
  }

  private upPulse(e: Live): boolean {
    const p = Math.min(1, e.t / e.dur);
    const env = Math.min(1, p * 8) * (1 - p) * (1 - p) * 1.3;
    const r = e.radius + (e.r1 - e.radius) * (1 - Math.pow(1 - p, 2));
    let x = e.a.x;
    let y = e.a.y;
    let z = e.a.z;
    if (e.follow) {
      e.follow.getWorldPosition(_v1);
      x = _v1.x; y = _v1.y; z = _v1.z;
    }
    switch (e.fam) {
      case Fam.Core:
        this.cores.set(e.slot, 0, x, y, z, r);
        this.cores.set(e.slot, 1, 0, 1, 0, 0);
        break;
      case Fam.Column:
        this.columns.set(e.slot, 0, x, y, z, r);
        this.columns.set(e.slot, 1, e.height * (0.4 + 0.6 * Math.min(1, p * 4)), 1, this.clock * 0.5, 0);
        break;
      case Fam.Shell:
        this.shells.set(e.slot, 0, x, y, z, r);
        this.shells.set(e.slot, 1, e.height, 0, 0, 0);
        break;
      case Fam.Beam:
        break;
    }
    const pool = e.fam === Fam.Core ? this.cores : e.fam === Fam.Column ? this.columns : e.fam === Fam.Shell ? this.shells : this.beams;
    pool.put(e.slot, 3, 1, Math.min(1, env));
    return !(e.stopped || p >= 1);
  }

  // -- arrivals and departures -------------------------------------------------------

  /** Vanish: motes fly up, a shaft of light, a collapsing ring. */
  teleportOut(x: number, y: number, z: number, color = 0x8a5cff): void {
    const l = lookOf('arcane', color);
    this.fx.burst('teleport', x, y + 0.5, z, { color });
    this.fx.burst('dissolve', x, y + 0.5, z, { color, scale: 1.1 });
    this.pulse(Fam.Column, COLUMN_STYLE.light, x, y, z, 0.7, 0.35, 3.2, 0.35, l, 1.1);
    this.flash(x, y + 1, z, l.light, 12, 8, 0.22);
    this.decals.glow('runeCircle', x, z, 1.0, 0.8, color, 1.2);
    this.nova(x, z, 1.4, { color, duration: 0.35, particles: false, element: 'arcane' });
    ripple('portal', x, y + 1.0, z, 1.3, 0.5, 0.8);
    this.sfx('spell.teleportOut', x, z);
  }

  /** Arrive: an implosion, a bright pop, a shaft that snaps shut. */
  teleportIn(x: number, y: number, z: number, color = 0x8a5cff): void {
    const l = lookOf('arcane', color);
    this.fx.burst('teleport', x, y + 0.5, z, { color, scale: 1.2 });
    this.fx.burst('arcane', x, y + 0.7, z, { color });
    this.pulse(Fam.Column, COLUMN_STYLE.light, x, y, z, 0.3, 0.8, 3.6, 0.4, l, 1.2);
    this.flash(x, y + 1, z, l.light, 16, 9, 0.26);
    this.decals.glow('runeCircle', x, z, 1.2, 1.2, color, 1.2);
    this.nova(x, z, 1.8, { color, duration: 0.4, particles: false, element: 'arcane' });
    ripple('portal', x, y + 1.0, z, 1.5, 0.55, 0.9);
    this.sfx('spell.teleportIn', x, z);
  }

  /**
   * A way between places: `open` when a portal tears open (a spiralling
   * shaft, a rune ring that lingers, a wave), `use` when someone steps
   * through (motes pulled in, a bright shaft). Sound is the caller's.
   */
  gateway(x: number, y: number, z: number, color: number, kind: 'open' | 'use' = 'open'): void {
    const l = lookOf('arcane', color);
    this.fx.burst('portal', x, y + 1.0, z, { color, scale: kind === 'open' ? 1.4 : 1.1 });
    if (kind === 'open') {
      this.pulse(Fam.Column, COLUMN_STYLE.swirl, x, y, z, 1.3, 0.8, 3.6, 1.1, l, 0.8);
      this.pulse(Fam.Column, COLUMN_STYLE.light, x, y, z, 0.35, 0.9, 4.8, 0.7, l, 0.9);
      this.decals.glow('runeCircle', x, z, 2.0, 2.6, color, 1.1, 0, 0.5);
      this.nova(x, z, 3.2, { color, duration: 0.5, particles: false, element: 'arcane', thickness: 0.12 });
      this.flash(x, y + 1.4, z, l.light, 20, 11, 0.5);
      ripple('portal', x, y + 1.3, z, 2.4, 2.6, 1.0);
      this.trauma(0.12);
    } else {
      ripple('portal', x, y + 1.0, z, 1.6, 0.7, 1.0);
      this.pulse(Fam.Column, COLUMN_STYLE.light, x, y, z, 0.6, 0.3, 4.2, 0.45, l, 1.1);
      this.decals.glow('shockRing', x, z, 1.8, 0.45, color, 1.2);
      this.flash(x, y + 1.0, z, l.light, 16, 8, 0.35);
    }
  }

  /** Runs `fn` after `seconds` on the effect clock (so it respects slow motion). Never culled. */
  delay(seconds: number, fn: () => void): EffectHandle {
    const e = this.spawn(K.Delay, true);
    e.dur = seconds;
    e.fn = fn;
    return this.handle(e);
  }

  /** A small drop beacon: sparkle, light and a pool of light on the floor. */
  dropBeacon(x: number, y: number, z: number, color: number): void {
    this.fx.burst('itemDrop', x, y + 0.3, z, { color });
    this.flash(x, y + 0.6, z, color, 5, 5, 0.35);
    this.decals.glow('lightPool', x, z, 0.7, 1.4, color, 1.2);
  }

  /** Level up: a golden shaft, rings on the floor, a real light bloom. */
  levelUp(x: number, y: number, z: number): void {
    const gold = lookOf('fire', 0xffc040);
    // A slim gold shaft and one ring: a moment of light on the hero, not a
    // flood over the room.
    this.fx.burst('levelup', x, y, z, { scale: 0.9 });
    this.pulse(Fam.Column, COLUMN_STYLE.light, x, y, z, 0.45, 0.75, 6, 1.1, gold, 0.85);
    this.pulse(Fam.Column, COLUMN_STYLE.swirl, x, y, z, 0.9, 0.7, 2.4, 0.9, gold, 0.6);
    this.flash(x, y + 1.2, z, 0xffc040, 18, 10, 0.6);
    this.decals.glow('shockRing', x, z, 2.8, 0.7, 0xffc040, 1.3);
    this.decals.glow('runeCircle', x, z, 1.9, 1.6, 0xffc040, 1.0, 0, 0.6);
    this.trauma(0.2);
    if (this.rig) this.rig.punchIn(0.07, 0.9);
    this.sfx('levelup', x, z);
  }

  // -- skill motifs ---------------------------------------------------------------------

  /**
   * A skill's own drawing (`fx/Motifs.ts`): `shape` laid out in `motion`
   * round `frame`, in the skill's school and colour, starting `delay`
   * seconds from now. Pure decoration: nothing waits on it and the budget
   * may drop it.
   */
  motif(shape: MotifShape, motion: MotifMotion, frame: MotifFrame, opts: { element?: School; color?: number; delay?: number; size?: number } = {}): void {
    const draw: MotifDraw = MOTIF_SHAPES[shape];
    const school = opts.element ?? 'arcane';
    const l = lookOf(school, opts.color);
    const lead = Math.max(0, opts.delay ?? 0);
    // A high-rank skill's pieces are bigger: cores grow where they are
    // written (`putCore`), the rest here (`kit/Boost.ts`).
    const size = (opts.size ?? 1) * (draw.k === 'core' ? 1 : BOOST.size);
    // Fewer pieces on the lower quality steps, and fewer again in a busy
    // fight: past three motifs in the air at once, each new one thins (down
    // to two pieces) and skips its flash, so a screen full of spells stays
    // drawable. Big soft pieces piling up is what drops the frame rate.
    const crowd = Math.min(1, MOTIF_CROWD / Math.max(1, this.motifLoad));
    this.motifLoad += 1;
    const cap = Math.max(2, Math.ceil(pieceCap(draw) * Math.min(1, this.quality.fxScale) * crowd));
    const ps = thin(MOTIF_MOTIONS[motion](frame, this.rng), cap);
    const fy = floorAt(frame.x, frame.z);
    const tint = opts.color !== undefined && saturated(opts.color) ? opts.color : undefined;
    const outward = (p: Piece): number => {
      const [x, , z] = pieceEnd(p);
      const dx = x - frame.x;
      const dz = z - frame.z;
      return dx * dx + dz * dz > 0.09 ? Math.atan2(dz, dx) : Math.atan2(frame.fz, frame.fx);
    };
    switch (draw.k) {
      case 'core':
      case 'solid':
      case 'slash':
        for (const p of ps) this.mote(draw, p, lead, size, school, l, tint, fy, outward(p));
        break;
      case 'column':
        for (const p of ps) {
          const [x, , z] = pieceEnd(p);
          const r = draw.size * size * p.grow;
          this.delay(lead + p.delay, () => this.pulse(Fam.Column, COLUMN_STYLE[draw.style], x, floorAt(x, z), z, r * 0.6, r, draw.height * size, p.dur + 0.3, l, 1.0));
        }
        break;
      case 'shell':
        for (const p of ps) {
          const [x, y, z] = pieceEnd(p);
          const r = draw.size * size * p.grow;
          this.delay(lead + p.delay, () => this.pulse(Fam.Shell, SHELL_STYLE[draw.style], x, floorAt(x, z) + Math.max(0, y - 0.6), z, r * 0.4, r, 0, p.dur + 0.25, l, 0.9));
        }
        break;
      case 'glow':
        for (const p of ps) {
          const [x, , z] = pieceEnd(p);
          const a = outward(p);
          // Floor rotation follows the heading convention: +y along (sin r, cos r).
          this.decals.glow(draw.kind, x, z, draw.size * size * p.grow, draw.life, tint ?? school, 1.4, Math.atan2(Math.cos(a), Math.sin(a)), draw.kind === 'wedge' ? 0.5 : 0, lead + p.delay);
        }
        break;
      case 'mark':
        for (const p of ps) {
          const [x, , z] = pieceEnd(p);
          const a = outward(p);
          this.delay(lead + p.delay + p.dur * 0.3, () => this.decals.add(draw.kind, x, z, draw.size * size * p.grow * this.rng.range(0.85, 1.15), a));
        }
        break;
      case 'arc': {
        const pts = ps.map((p) => {
          const [x, y, z] = pieceEnd(p);
          return new THREE.Vector3(x, fy + y + 0.3, z);
        });
        if (pts.length >= 3) {
          let seg = 0;
          for (let i = 1; i < pts.length; i++) seg += pts[i]!.distanceTo(pts[i - 1]!);
          if (pts[0]!.distanceTo(pts[pts.length - 1]!) < (2 * seg) / (pts.length - 1)) pts.push(pts[0]!.clone());
        }
        this.delay(lead + (ps[0]?.delay ?? 0), () => this.chainLightning(pts, { color: tint, duration: 0.4, jumpDelay: 0.03, width: draw.width * size, silent: true }));
        break;
      }
      case 'puff':
        for (const p of ps) {
          const [x, y, z] = pieceEnd(p);
          this.delay(lead + p.delay, () => this.fx.burst(draw.emitter, x, fy + Math.max(0.2, y), z, { scale: draw.scale * size * p.grow, color: tint, school }));
        }
        break;
    }
    if (crowd >= 1) this.delay(lead, () => this.flash(frame.x, fy + 1.3, frame.z, l.light, 5, 6, 0.22));
  }

  /** Starts one moving piece of a motif. */
  private mote(draw: MotifDraw, p: Piece, lead: number, size: number, school: School, l: Look, tint: number | undefined, fy: number, facing: number): void {
    const e = this.spawn(K.Mote);
    e.school = school;
    e.look = l;
    e.color = tint;
    e.a.set(p.sx, fy + p.sy, p.sz);
    e.b.set(p.ex, fy + p.ey, p.ez);
    e.c.copy(e.a);
    e.d.copy(e.a);
    e.t = -(lead + p.delay);
    e.dur = Math.max(0.1, p.dur);
    e.path = p.path;
    e.arc = p.arc;
    e.radius = p.r0;
    e.r1 = p.r1;
    e.half = p.a0;
    e.speed = p.sweep;
    e.power = p.grow;
    e.emitter = '';
    if (draw.k === 'core') {
      e.mote = 0;
      e.size = draw.size * size * p.grow * 1.6;
      e.style = CORE_STYLE[draw.style];
      e.flag = 'trail' in draw && !!draw.trail;
      this.take(e, this.cores);
      this.putCore(e.slot, e.a.x, e.a.y, e.a.z, e.size, 0, 1, 0, 0, l, 1, e.style, 0, (e.born % 97) / 97);
    } else if (draw.k === 'solid') {
      e.mote = 1;
      e.size = draw.size * size * p.grow;
      e.solid = this.solids.alloc(draw.shape);
      e.emitter = ('land' in draw && draw.land) || '';
      // Spin about the length, radians a second: saws whirl, knives and crystals turn.
      e.style = draw.shape === 'saw' ? 18 : draw.shape === 'shard' || draw.shape === 'crystal' ? 3 : draw.shape === 'blade' ? 9 : draw.shape === 'icicle' ? 0.6 : 0;
    } else if (draw.k === 'slash') {
      e.mote = 2;
      e.size = draw.size * size * p.grow;
      e.half = facing - 1.2;
      e.speed = 2.4;
      if (e.b.y < fy + 0.7) e.b.y = fy + 0.7;
    }
  }

  private upMote(e: Live): boolean {
    if (e.stopped) return false;
    if (e.t < 0) return true;
    const k = Math.min(1, e.t / e.dur);
    const p = e.c;
    e.d.copy(p);
    switch (e.path) {
      case Path.Line: {
        const u = 1 - (1 - k) * (1 - k);
        p.lerpVectors(e.a, e.b, u);
        p.y += Math.sin(Math.PI * k) * e.arc;
        break;
      }
      case Path.Fall:
        p.lerpVectors(e.a, e.b, k * k);
        break;
      case Path.Swirl: {
        const r = e.radius + (e.r1 - e.radius) * k;
        const a = e.half + e.speed * k;
        p.set(e.a.x + Math.cos(a) * r, e.a.y + (e.b.y - e.a.y) * k, e.a.z + Math.sin(a) * r);
        break;
      }
      case Path.Rise: {
        const u = Math.min(1, k * 3.5);
        p.lerpVectors(e.a, e.b, 1 - Math.pow(1 - u, 3));
        break;
      }
      default:
        p.copy(e.b);
    }
    const first = !e.acc;
    e.acc = 1;
    const env = Math.min(1, k * 6) * Math.min(1, (1 - k) * 4);
    const moving = e.path === Path.Line || e.path === Path.Fall || e.path === Path.Swirl;
    _v1.subVectors(p, e.d);
    if (!moving || first || _v1.lengthSq() < 1e-8) _v1.copy(_UP);
    _v1.normalize();
    if (e.mote === 0) {
      const grow = e.path === Path.Hold ? 0.6 + 0.6 * k : 1;
      // A little under full glow: small cores at full glow burn white and lose their school's colour.
      this.putCore(e.slot, p.x, p.y, p.z, e.size * grow, _v1.x, _v1.y, _v1.z, moving && e.flag ? 0.8 : 0, e.look, 0.78, e.style, env, (e.born % 97) / 97);
      if (e.flag) {
        if (!e.rib && !first) e.rib = this.ribbons.start('trail', { life: 0.3, width: e.size * 0.35, school: e.school, color: e.color, emit: 1 });
        this.ribbons.pushPoint(e.rib, p.x, p.y, p.z);
      }
    } else if (e.mote === 1) {
      const len = e.size * (e.path === Path.Rise ? 0.35 + 0.65 * env : Math.max(0.05, env));
      this.solids.place(e.solid, p.x, p.y, p.z, _v1.x, _v1.y, _v1.z, e.t * e.style, len, len * (e.path === Path.Rise ? 0.9 : 1));
      if (first && e.path === Path.Rise && e.emitter) this.fx.burst(e.emitter, e.b.x, floorAt(e.b.x, e.b.z) + 0.1, e.b.z, { count: 4, scale: 0.5, school: e.school });
    } else {
      if (first) e.rib = this.ribbons.start('swing', { school: e.school, color: e.color, life: 0.28, emit: e.school === 'physical' ? 1.05 : 1.2 });
      const a = e.half + e.speed * (1 - Math.pow(1 - k, 2));
      const c = Math.cos(a);
      const s = Math.sin(a);
      const lift = 0.3 * Math.sin(k * Math.PI);
      this.ribbons.pushEdges(e.rib, e.b.x + c * e.size * 0.45, e.b.y + lift, e.b.z + s * e.size * 0.45, e.b.x + c * e.size, e.b.y + lift * 1.6, e.b.z + s * e.size);
    }
    if (k >= 1) {
      if ((e.path === Path.Line || e.path === Path.Fall) && e.mote !== 2) {
        const em = e.emitter || element(e.school).emitter;
        this.fx.burst(em, p.x, p.y, p.z, { count: 3, scale: 0.45, school: e.school, color: e.color });
      }
      return false;
    }
    return true;
  }

  // -- named casts ----------------------------------------------------------------------

  /** Resolves an `effect` id to a concrete visual; unknown ids fall back by context. */
  cast(id: string, ctx: CastContext): EffectHandle {
    const el = ctx.element ?? 'arcane';
    const color = ctx.color;
    const radius = ctx.radius ?? 3;
    const dur = ctx.duration ?? 0.6;
    const o = ctx.origin;
    const t = ctx.target;
    switch (id) {
      case 'projectile': case 'fireball': case 'frostbolt': case 'boltSpell': case 'arrow': case 'spit':
        if (!t) break;
        return this.projectile(o, t, {
          element: el, color, scale: ctx.scale, speed: id === 'arrow' ? 34 : 20,
          shape: id === 'arrow' ? 'arrow' : undefined,
          target: ctx.targetGetter, homing: ctx.targetGetter ? 0.25 : 0, onHit: ctx.onHit,
        });
      case 'lob': case 'grenade': case 'mortar':
        if (!t) break;
        return this.projectile(o, t, { element: el, color, speed: 14, arc: 3.5, onHit: ctx.onHit });
      case 'meteor': case 'meteorStrike':
        return this.meteor(t?.x ?? o.x, t?.z ?? o.z, { radius, color, element: el, onHit: ctx.onHit });
      case 'beam': case 'ray': case 'lance': case 'disintegrate':
        if (!t) break;
        return this.beam(o, t, { element: el, color, duration: dur });
      case 'channel': case 'drain': case 'flamethrower':
        if (!ctx.targetGetter) break;
        return this.channel(() => o, () => ctx.targetGetter!() ?? o, { element: el, color });
      case 'chain': case 'chainLightning': case 'arc': {
        const pts = [o.clone()];
        if (t) pts.push(t.clone());
        return this.chainLightning(pts, { color });
      }
      case 'nova': case 'frostNova': case 'shockNova': case 'bloodNova':
        return this.nova(o.x, o.z, radius, { element: el, color, duration: dur, shake: 0.2 });
      case 'explosion': case 'blast':
        this.explosion(o.x, o.y, o.z, { radius, element: el, color });
        return DEAD_HANDLE;
      case 'slam': case 'groundSlam': case 'quake':
        return this.slam(o.x, o.z, radius, { element: el, color, windup: ctx.duration ?? 0.9, onFire: () => ctx.onHit?.(o) });
      case 'cone': case 'breath': case 'shout': case 'cleave':
        return this.cone(o, ctx.dir ?? _v3.set(0, 0, 1), id === 'cleave' ? Math.PI * 0.35 : Math.PI * 0.22, radius, { element: el, color, duration: dur });
      case 'whirlwind': case 'spin':
        if (!ctx.source) break;
        return this.whirlwind(ctx.source, { radius: radius * 0.5, color, element: el, duration: ctx.duration ?? 2.5 });
      case 'summon': case 'raise':
        return this.summonCircle(o.x, o.z, radius * 0.6, ctx.duration ?? 1.6, color ?? 0xa855ff);
      case 'aura': case 'buff':
        if (!ctx.source) break;
        return this.aura(ctx.source, { color, element: el, radius: radius * 0.4 });
      case 'shield': case 'barrier': case 'ward':
        if (!ctx.source) break;
        return this.shield(ctx.source, radius * 0.5, color ?? 0x60a0ff, ctx.duration ?? 6);
      case 'teleport': case 'blink': case 'shadowStep':
        this.teleportOut(o.x, o.y, o.z, color ?? 0x8a5cff);
        if (t) this.teleportIn(t.x, t.y, t.z, color ?? 0x8a5cff);
        return DEAD_HANDLE;
      case 'heal':
        this.fx.burst('heal', o.x, o.y + 0.4, o.z, { scale: ctx.scale ?? 1 });
        this.flash(o.x, o.y + 1, o.z, 0x50ff90, 8, 7, 0.3);
        this.sfx('spell.heal', o.x, o.z);
        return DEAD_HANDLE;
      case 'levelup':
        this.levelUp(o.x, o.y, o.z);
        return DEAD_HANDLE;
      case 'impact': case 'hit':
        this.impact(el, o.x, o.y, o.z, { color, scale: ctx.scale });
        return DEAD_HANDLE;
      default:
        break;
    }
    if (t) return this.projectile(o, t, { element: el, color, onHit: ctx.onHit });
    if (ctx.dir) return this.cone(o, ctx.dir, Math.PI * 0.25, radius, { element: el, color, duration: dur });
    return this.nova(o.x, o.z, radius, { element: el, color, duration: dur });
  }

  // -- frame ----------------------------------------------------------------------------

  private step(e: Live, dt: number): boolean {
    e.t += dt;
    switch (e.kind) {
      case K.Delay:
        if (e.stopped) return false;
        if (e.t >= e.dur) {
          const fn = e.fn;
          e.fn = null;
          fn?.();
          return false;
        }
        return true;
      case K.Proj: return this.upProj(e, dt);
      case K.Nova: return this.upNova(e, dt);
      case K.Cone: return this.upCone(e, dt);
      case K.Beam: return this.upBeam(e, dt);
      case K.Channel: return this.upChannel(e, dt);
      case K.Chain: return this.upChain(e, dt);
      case K.Tether: return this.upTether(e, dt);
      case K.Whirl: return this.upWhirl(e, dt);
      case K.Summon: return this.upSummon(e, dt);
      case K.Aura: return this.upAura(e, dt);
      case K.Shield: return this.upShield(e, dt);
      case K.Pulse: return this.upPulse(e);
      case K.Mote: return this.upMote(e);
    }
    return false;
  }

  update(dt: number, elapsed: number, camera?: THREE.Camera): void {
    void elapsed;
    this.clock += dt;
    if (camera) this.camera = camera;
    this.lights.update(dt);
    // Exposure: one blast is full brightness; a pile of them dims every
    // effect together (fast down, slow back up) so a busy fight stays coloured
    // instead of going white.
    this.glare *= Math.exp(-dt / GLARE_DECAY);
    this.motifLoad *= Math.exp(-dt / MOTIF_DECAY);
    const want = Math.min(FX_COMFORT.ceiling, Math.max(EXPOSURE_FLOOR, Math.min(1, Math.sqrt(GLARE_FREE / Math.max(GLARE_FREE, this.glare)))));
    const ex = FX_EXPOSURE.value;
    FX_EXPOSURE.value = ex + (want - ex) * Math.min(1, dt * (want < ex ? 14 : 2.5));
    // Index loop over a list that may grow while we walk it (a delay firing a projectile).
    const rankWas = BOOST.rank;
    for (let i = 0; i < this.live.length; ) {
      const e = this.live[i]!;
      let alive: boolean;
      // A quiet effect stays quiet when it lands, and so does anything it starts.
      // Read once: the slot can be released and reused while it steps.
      const quiet = e.quiet;
      if (quiet) this.hush++;
      // Its trail, its landing and anything it starts are drawn at its rank.
      setBoostRank(e.rank);
      try {
        alive = this.step(e, dt);
      } catch (err) {
        console.error('[fx] effect update threw', err);
        alive = false;
      } finally {
        if (quiet) this.hush--;
      }
      if (alive) {
        i++;
        continue;
      }
      this.release(e);
      // Swap-remove: order is tracked by `born`, not by position.
      const last = this.live.pop()!;
      if (last !== e) this.live[i] = last;
    }
    setBoostRank(rankWas);
    // Budget: past the cap the oldest decoration goes; gameplay never does.
    while (this.live.length > MAX_LIVE_EFFECTS) {
      let oldest = -1;
      let born = Infinity;
      for (let i = 0; i < this.live.length; i++) {
        const e = this.live[i]!;
        if (!e.essential && e.born < born) {
          born = e.born;
          oldest = i;
        }
      }
      if (oldest < 0) break;
      const e = this.live[oldest]!;
      if (e.ground && e.kind === K.Nova) this.decals.glows.end(e.ground);
      this.release(e);
      const last = this.live.pop()!;
      if (last !== e) this.live[oldest] = last;
      this.culled++;
    }
    this.fields.update(dt);
    this.hazardFields.update(dt);
    this.ribbons.update(dt, camera ?? this.camera);
    this.cores.flush(this.clock);
    this.beams.flush(this.clock);
    this.columns.flush(this.clock);
    this.shells.flush(this.clock);
    this.solids.flush();
  }

  /** Live composite effects, for debug overlays and checks. */
  get liveCount(): number {
    return this.live.length;
  }

  /** Stops and frees every live effect without tearing the system down. */
  /**
   * Stand-ins for the scene's warm-up: one instance of each core, beam,
   * column and shell family and of every thrown or summoned solid, so none
   * links its shader mid-fight (speed's notes: `fx:solid-shard`, `fx:cores`,
   * `fx:columns`). Fields, self casts and death looks draw through the
   * particle field and ground layers, which are already warm.
   */
  standIns(): THREE.Object3D[] {
    return [this.cores.standIn(), this.beams.standIn(), this.columns.standIn(), this.shells.standIn(), ...this.solids.standIns()];
  }

  clear(): void {
    while (this.live.length) this.release(this.live.pop()!);
    this.fields.clear();
    this.hazardFields.clear();
    this.cores.clear();
    this.beams.clear();
    this.columns.clear();
    this.shells.clear();
    this.ribbons.clear();
    this.solids.clear();
    this.lights.clear();
    this.liveAuras = 0;
    this.glare = 0;
    FX_EXPOSURE.value = FX_COMFORT.ceiling;
    clearRipples();
  }

  dispose(): void {
    this.unQuality();
    this.clear();
    this.scene.remove(this.cores.mesh, this.beams.mesh, this.columns.mesh, this.shells.mesh, this.ribbons.mesh);
    this.cores.dispose();
    this.beams.dispose();
    this.columns.dispose();
    this.shells.dispose();
    this.ribbons.dispose();
    this.lights.dispose();
    this.solids.dispose();
  }
}
