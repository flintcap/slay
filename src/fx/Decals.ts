/**
 * SLAY fx: the floor. Marks a fight leaves behind, glows that live on the
 * ground for a moment, and the telegraphs that tell you where not to stand.
 *
 * Three kit `GroundLayer`s, one draw call each:
 *  - marks: long-lived and dark. They hide the floor (premultiplied occlusion)
 *    instead of painting pale discs over it.
 *  - glows: short-lived light on the floor (cinders, rune circles, burning
 *    ground, poison pools). Effects drive these through `glow()`.
 *  - telegraphs: the danger area darkens and takes the attack's colour, a crisp
 *    edge draws the shape, the fill grows toward the edge and the shape flashes
 *    once on landing. Their own layer, so a busy fight's glows can never
 *    recycle a telegraph that is still counting down.
 *
 * Live counts are hard-capped ring buffers: a ten-minute fight costs exactly
 * what the first ten seconds cost.
 */

import * as THREE from 'three';
import type { QualityProfile } from '../core/Renderer';
import { Random } from '../core/RNG';
import { GroundLayer, G, GROUND, type GroundKind, type GroundHandle } from './kit/Ground';
import { RAMPS, packLinear, mixHex, darken, type School } from './kit/Palette';
import { setFloorFn } from './kit/Floor';

/** Handle returned by `telegraph()`. */
export interface TelegraphHandle {
  cancel(): void;
}

interface MarkStyle {
  /** The ground kind drawn. */
  g: GroundKind;
  /** Body colour (sRGB). Marks barely glow; glows use the full ramp. */
  color: number;
  emit: number;
  life: number;
  size: number;
  /** A short glow laid over the mark (hot things cool). */
  glow?: GroundKind;
  glowColor?: number;
  glowLife?: number;
  glowEmit?: number;
}

/** Every kind `add()` accepts, old names included so no caller breaks. */
const MARKS: Record<string, MarkStyle> = {
  scorch: { g: 'scorch', color: 0x2a1c14, emit: 1, life: 26, size: 1, glow: 'cinders', glowColor: RAMPS.fire.body, glowLife: 2.8, glowEmit: 1.8 },
  burn: { g: 'cinders', color: RAMPS.fire.body, emit: 1.8, life: 4, size: 1 },
  blood: { g: 'blood', color: 0x6e0808, emit: 4, life: 40, size: 1 },
  bloodSplatter: { g: 'blood', color: 0x7a0a0a, emit: 4, life: 32, size: 1.1 },
  gore: { g: 'gore', color: 0x5e0a08, emit: 4, life: 40, size: 1.1 },
  ice: { g: 'rime', color: 0x9fd8ff, emit: 1.2, life: 14, size: 1, glow: 'frostGlow', glowColor: RAMPS.cold.body, glowLife: 1.6, glowEmit: 1.2 },
  frost: { g: 'frostGlow', color: RAMPS.cold.body, emit: 1.2, life: 2.5, size: 1 },
  rime: { g: 'rime', color: 0xa8dcff, emit: 1.2, life: 16, size: 1.1 },
  rimeGlow: { g: 'frostGlow', color: RAMPS.cold.body, emit: 1.2, life: 2.4, size: 1.1 },
  poison: { g: 'acid', color: 0x5aa024, emit: 2, life: 16, size: 1 },
  ooze: { g: 'acid', color: 0x4a7a20, emit: 2, life: 22, size: 1 },
  acid: { g: 'acid', color: 0x5fae24, emit: 2, life: 18, size: 1, glow: 'acidGlow', glowColor: RAMPS.poison.body, glowLife: 3, glowEmit: 1.2 },
  acidGlow: { g: 'acidGlow', color: RAMPS.poison.body, emit: 1.2, life: 3.5, size: 1 },
  crack: { g: 'crack', color: 0x1c1917, emit: 1, life: 45, size: 1.2 },
  crater: { g: 'crater', color: 0x1e1a16, emit: 1, life: 30, size: 1.2 },
  ash: { g: 'ash', color: 0x4a453f, emit: 1.5, life: 30, size: 1.1 },
  water: { g: 'wet', color: 0x2a3a44, emit: 1, life: 18, size: 1 },
  dust: { g: 'scuff', color: 0x3e3830, emit: 1, life: 6, size: 0.85 },
  stain: { g: 'scuff', color: 0x2a2420, emit: 1, life: 14, size: 1 },
  shadow: { g: 'shadow', color: 0x000000, emit: 0, life: 1e6, size: 1 },
  bone: { g: 'bone', color: 0xd8cfb8, emit: 1, life: 22, size: 1.15 },
  fork: { g: 'fork', color: 0x1a1a22, emit: 1, life: 24, size: 1.25, glow: 'forkGlow', glowColor: RAMPS.lightning.body, glowLife: 1.1, glowEmit: 2 },
  forkGlow: { g: 'forkGlow', color: RAMPS.lightning.body, emit: 2, life: 1.1, size: 1.25 },
  lightning: { g: 'fork', color: 0x1a1a22, emit: 1, life: 20, size: 1.1, glow: 'forkGlow', glowColor: RAMPS.lightning.body, glowLife: 1, glowEmit: 2 },
  cinders: { g: 'cinders', color: RAMPS.fire.body, emit: 1.8, life: 6, size: 1.1 },
  glow: { g: 'lightPool', color: 0xffb050, emit: 1, life: 3, size: 1 },
  ring: { g: 'shockRing', color: 0xffc080, emit: 1.2, life: 0.55, size: 1 },
  shockwave: { g: 'shockRing', color: 0xffd090, emit: 1.2, life: 0.5, size: 1 },
  rune: { g: 'runeCircle', color: RAMPS.arcane.body, emit: 1.1, life: 5, size: 1 },
  arcane: { g: 'runeCircle', color: RAMPS.arcane.body, emit: 1.1, life: 6, size: 1 },
  sigil: { g: 'sigilBurn', color: 0x1a1020, emit: 1, life: 14, size: 1.1, glow: 'sigilGlow', glowColor: RAMPS.arcane.body, glowLife: 2.4, glowEmit: 1.6 },
};

interface Packed {
  core: number;
  body: number;
  tail: number;
}

const _packs = new Map<number, Packed>();
/** Packed three-stop ramp for a body colour, cached. */
function packFor(hex: number): Packed {
  let p = _packs.get(hex);
  if (!p) {
    p = { core: packLinear(mixHex(hex, 0xffffff, 0.55)), body: packLinear(hex), tail: packLinear(darken(hex, 0.55)) };
    if (_packs.size > 256) _packs.clear();
    _packs.set(hex, p);
  }
  return p;
}

const _schoolPacks = new Map<School, Packed>();
function packSchool(s: School): Packed {
  let p = _schoolPacks.get(s);
  if (!p) {
    const r = RAMPS[s];
    p = { core: packLinear(r.core), body: packLinear(r.body), tail: packLinear(r.tail) };
    _schoolPacks.set(s, p);
  }
  return p;
}

type TelegraphShape = 'circle' | 'cone' | 'line' | 'ring';
const SHAPE: Record<TelegraphShape, number> = { circle: GROUND.tgCircle, cone: GROUND.tgCone, line: GROUND.tgLine, ring: GROUND.tgRing };

/** A cancel handle that does nothing once its telegraph is gone. */
class Tell implements TelegraphHandle {
  constructor(private layer: GroundLayer, private h: GroundHandle) {}
  cancel(): void {
    this.layer.end(this.h);
  }
}

export class DecalSystem {
  /** Long-lived dark marks. */
  readonly marks: GroundLayer;
  /** Short light on the floor. */
  readonly glows: GroundLayer;
  /** Telegraphs. */
  readonly tells: GroundLayer;
  private scene: THREE.Scene;
  private quality: QualityProfile;
  private rng = new Random(0xdeca1);
  private groundAt: (x: number, z: number) => number = () => 0;

  constructor(scene: THREE.Scene, quality: QualityProfile) {
    this.scene = scene;
    this.quality = quality;
    const fx = Math.max(0.25, quality.fxScale);
    this.marks = new GroundLayer('marks', Math.round(320 * fx), 6);
    this.glows = new GroundLayer('glows', Math.round(140 * fx), 7);
    this.tells = new GroundLayer('tells', Math.max(24, Math.round(72 * fx)), 8);
    scene.add(this.marks.mesh, this.glows.mesh, this.tells.mesh);
    setFloorFn(null);
  }

  /** Tells the floor layers (and every effect that lands debris) where the floor is. */
  setGround(fn: (x: number, z: number) => number): void {
    this.groundAt = fn;
    setFloorFn(fn);
  }

  floorY(x: number, z: number): number {
    return this.groundAt(x, z);
  }

  has(kind: string): boolean {
    return kind in MARKS;
  }

  /** Drops a floor mark. Unknown kinds become a scorch, never an error. */
  add(kind: string, x: number, z: number, radius: number, rotation?: number, life?: number): void {
    const st = MARKS[kind] ?? MARKS.scorch!;
    const rng = this.rng;
    const isGlow = GROUND[st.g] >= 16;
    const layer = isGlow ? this.glows : this.marks;
    const pk = packFor(st.color);
    const y = this.groundAt(x, z);
    const size = Math.max(0.05, radius * st.size * rng.range(0.9, 1.12));
    G.x = x; G.z = z; G.y = y;
    G.size = size;
    G.rot = rotation ?? rng.next() * Math.PI * 2;
    G.life = life ?? st.life;
    G.kind = GROUND[st.g];
    G.param = 0; G.param2 = 0;
    G.core = pk.core; G.body = pk.body; G.tail = pk.tail;
    G.emit = st.emit * rng.range(0.86, 1.14);
    G.fadeIn = isGlow ? 0.05 : 0.18;
    G.seed = rng.next();
    G.delay = 0;
    layer.spawn(G);
    if (st.glow && !isGlow) {
      const gp = packFor(st.glowColor ?? st.color);
      G.kind = GROUND[st.glow];
      G.life = Math.min(G.life, st.glowLife ?? 2);
      G.core = gp.core; G.body = gp.body; G.tail = gp.tail;
      G.emit = st.glowEmit ?? 1.5;
      G.fadeIn = 0.04;
      this.glows.spawn(G);
    }
  }

  /** A cluster of marks thrown one way (a kill, a heavy hit). */
  splatter(kind: string, x: number, z: number, radius: number, count = 4): void {
    const rng = this.rng;
    const n = Math.max(1, Math.round(count * Math.max(0.4, this.quality.fxScale)));
    this.add(kind, x, z, radius);
    const dir = rng.next() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = dir + rng.range(-1.1, 1.1);
      const d = rng.range(0.25, 1.6) * radius;
      this.add(kind, x + Math.cos(a) * d, z + Math.sin(a) * d, radius * rng.range(0.2, 0.55));
    }
  }

  /**
   * Light on the floor, driven by effects: burning ground, rune circles, aura
   * rings, pools. `color` is a school (its curated ramp) or an sRGB body colour.
   * Returns a handle to move, resize or end it.
   */
  glow(kind: GroundKind, x: number, z: number, size: number, life: number, color: School | number, emit = 1.5, rot = 0, param = 0, delay = 0): GroundHandle {
    const pk = typeof color === 'number' ? packFor(color) : packSchool(color);
    G.x = x; G.z = z; G.y = this.groundAt(x, z);
    G.size = size; G.rot = rot; G.life = life;
    G.kind = GROUND[kind]; G.param = param; G.param2 = 0;
    G.core = pk.core; G.body = pk.body; G.tail = pk.tail;
    G.emit = emit; G.fadeIn = 0.06; G.seed = this.rng.next(); G.delay = delay;
    const layer = GROUND[kind] < 16 ? this.marks : this.glows;
    return layer.spawn(G);
  }

  /**
   * Ground telegraph for an enemy attack. `size` is the radius for circle,
   * ring and cone and the length for line (which starts at x, z and runs along
   * `rotation`). Fills over `duration`, pulses near the end, flashes on landing.
   */
  telegraph(kind: TelegraphShape, x: number, z: number, size: number, rotation: number, duration: number, color?: number): TelegraphHandle {
    const param = kind === 'cone' ? Math.PI * 0.25 : kind === 'line' ? 0.12 : kind === 'ring' ? 0.14 : 0;
    return this.telegraphEx(kind, x, z, size, rotation, duration, color ?? 0xff3020, param);
  }

  /** Telegraph with an explicit shape parameter: cone half-angle (radians), line half-width (fraction of length), ring thickness. */
  telegraphEx(kind: TelegraphShape, x: number, z: number, size: number, rotation: number, duration: number, color: number, param: number): TelegraphHandle {
    let cx = x;
    let cz = z;
    let s = Math.max(0.1, size);
    let p = param;
    if (kind === 'line') {
      // The shader's line is centred; the API's starts at the caster.
      cx = x + Math.sin(rotation) * s * 0.5;
      cz = z + Math.cos(rotation) * s * 0.5;
      s *= 0.5;
      p = param * 2;
    }
    const pk = packFor(color);
    G.x = cx; G.z = cz; G.y = this.groundAt(cx, cz);
    G.size = s; G.rot = rotation; G.life = Math.max(0.05, duration);
    G.kind = SHAPE[kind] ?? GROUND.tgCircle; G.param = p; G.param2 = 0;
    G.core = pk.core; G.body = pk.body; G.tail = pk.tail;
    G.emit = 0.7; G.fadeIn = 0.05; G.seed = this.rng.next(); G.delay = 0;
    return new Tell(this.tells, this.tells.spawn(G));
  }

  update(dt: number): void {
    this.marks.update(dt);
    this.glows.update(dt);
    this.tells.update(dt);
  }

  clear(): void {
    this.marks.clear();
    this.glows.clear();
    this.tells.clear();
  }

  dispose(): void {
    this.scene.remove(this.marks.mesh, this.glows.mesh, this.tells.mesh);
    this.marks.dispose();
    this.glows.dispose();
    this.tells.dispose();
  }
}

/** Kinds accepted by `DecalSystem.add`. */
export function decalKinds(): string[] {
  return Object.keys(MARKS).sort();
}

/** The ground kind each `add` kind draws, for the checks. */
export function decalStyles(): Record<string, { kind: string; glow?: string }> {
  const out: Record<string, { kind: string; glow?: string }> = {};
  for (const [k, v] of Object.entries(MARKS)) out[k] = v.glow ? { kind: v.g, glow: v.glow } : { kind: v.g };
  return out;
}
