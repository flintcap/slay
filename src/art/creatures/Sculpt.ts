/**
 * SLAY — sculpting a creature.
 *
 * A creature's body is a list of distance-field primitives (ellipsoids,
 * tapered capsules, rounded boxes), each riding one bone of its rig and
 * blended into its neighbours with smooth unions, so a ghoul's shoulder
 * flows into its neck the way flesh does. Thin things a field cannot resolve
 * at monster resolution (teeth, claws, ribs, spikes, bowstrings) are added as
 * explicit low-poly geometry, bound rigidly to their bone.
 *
 * Every primitive belongs to one of three materials:
 *   skin   the creature itself: bone, flesh, hide, chitin, stone, slime
 *   alt    what it wears or grows over itself: rags, robes, plates, shells
 *   metal  weapons and worn iron
 * Each material is meshed on its own and drawn as one skinned mesh, so a
 * creature is at most three draw calls.
 *
 * Glow is painted, not modelled: glow volumes (eyes, cores, runes) and
 * pattern glow (lava cracks, void veins) set a per-vertex glow the creature
 * material turns into emission. Eyes therefore cost nothing extra.
 *
 * All coordinates are character space at scale 1 (see `Rig.ts`).
 */
import * as THREE from 'three';
import { FieldBuilder, type Prim } from '../hero/Sdf';
import type { CreatureRig } from './Rig';

export type CMat = 'skin' | 'alt' | 'metal';
export const CMATS: readonly CMat[] = ['skin', 'alt', 'metal'];

export type RGB = [number, number, number];

export interface PrimOpt {
  mat?: CMat;
  /** Smooth-union radius, metres (default 0.02 of a 1.8 m body). */
  k?: number;
  sub?: boolean;
  q?: THREE.Quaternion;
  /** Only blend near this point (keeps legs from webbing at the knee). */
  blendAt?: THREE.Vector3;
  blendR?: number;
  round?: number;
}

/** A volume that paints colour (and optionally glow) onto whatever surface passes through it. */
export interface PaintRegion {
  c: THREE.Vector3;
  r: number;
  col?: RGB;
  glow?: number;
  /** Only these materials (default all). */
  mats?: CMat[];
}

/** How a material's surface is painted over its texture, in vertex colour and glow. */
export interface PaintSpec {
  /** Overall multiplier on the texture tint (default white). */
  base?: RGB;
  /** Darkening toward the floor, 0..1 (grime and shadow): the D2 value structure. */
  grime?: number;
  /** Ambient occlusion strength, 0..1 (default 0.8). */
  ao?: number;
  /** Mottling: blotches of a second colour. */
  mottle?: { scale: number; amount: number; col: RGB };
  /** Veins or cracks that glow (lava, void, runes): noise ridges above `cut`. */
  veins?: { scale: number; cut: number; glow: number; col?: RGB };
  /** Lighter on upward faces (dust, frost, sun-bleach). */
  top?: { amount: number; col: RGB };
  /** Bands around the body along Y or Z (chitin segments, rings). */
  bands?: { axis: 'y' | 'z'; period: number; amount: number };
  /** Tips (thin ends, far from the core) take this colour. */
  tips?: { amount: number; col: RGB };
}

export interface HardPart {
  bone: string;
  geo: THREE.BufferGeometry;
  mat: CMat;
  col?: RGB;
  glow?: number;
}

export interface SculptQuality {
  /** Field cell size per material, metres at scale 1. */
  cell: number;
  /** Triangle budget per material. */
  tris: Record<CMat, number>;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class Sculpt {
  readonly fields: Record<CMat, FieldBuilder> = { skin: new FieldBuilder(), alt: new FieldBuilder(), metal: new FieldBuilder() };
  readonly parts: HardPart[] = [];
  readonly regions: PaintRegion[] = [];
  readonly paint: Record<CMat, PaintSpec> = { skin: {}, alt: {}, metal: { ao: 0.6, grime: 0.2 } };
  /** How softly each material bends between bones, metres (flesh soft, bone and plate stiff). */
  readonly soft: Record<CMat, number> = { skin: 0.035, alt: 0.05, metal: 0.004 };
  /** Lumpiness of each material's surface: noise displacement amplitude (m) and scale (1/m). */
  readonly lumps: Partial<Record<CMat, { amp: number; scale: number }>> = {};
  /** Scale on the default smooth-union radius. */
  k = 0.02;
  private readonly index: Record<string, number>;

  constructor(readonly rig: CreatureRig) {
    this.index = Object.fromEntries(rig.order.map((n, i) => [n, i]));
  }

  /** Bone index (group id) of a bone; unknown bones fall back to the root. */
  group(bone: string): number {
    return this.index[bone] ?? 0;
  }

  has(bone: string): boolean {
    return this.index[bone] !== undefined;
  }

  /** A bone's bind position, character space. */
  j(bone: string): THREE.Vector3 {
    return (this.rig.joints[bone] ?? this.rig.ends[bone]?.at ?? V(0, 0, 0)).clone();
  }

  private extra(o: PrimOpt): Partial<Prim> {
    const e: Partial<Prim> = {};
    if (o.sub) e.sub = true;
    if (o.blendAt) {
      e.blendAt = o.blendAt.clone();
      e.blendR = o.blendR ?? 0.1;
    }
    return e;
  }

  private fb(bone: string, o: PrimOpt): FieldBuilder {
    const f = this.fields[o.mat ?? 'skin'];
    f.group = this.group(bone);
    return f;
  }

  /** An ellipsoid (or sphere if `r` is a number). */
  ball(bone: string, c: THREE.Vector3, r: number | THREE.Vector3, o: PrimOpt = {}): this {
    const rv = typeof r === 'number' ? V(r, r, r) : r;
    this.fb(bone, o).ellipsoid(c, rv, o.k ?? this.k, o.q, this.extra(o));
    return this;
  }

  /** A capsule tapering from r1 at a to r2 at b. */
  limb(bone: string, a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number, o: PrimOpt = {}): this {
    this.fb(bone, o).cone(a, b, r1, r2, o.k ?? this.k, this.extra(o));
    return this;
  }

  /** A rounded box (half extents). */
  box(bone: string, c: THREE.Vector3, half: THREE.Vector3, o: PrimOpt = {}): this {
    this.fb(bone, o).box(c, half, o.round ?? Math.min(half.x, half.y, half.z) * 0.35, o.k ?? this.k, o.q, this.extra(o));
    return this;
  }

  /** A limb from one joint to the next, following the rig. */
  bone(bone: string, to: string, r1: number, r2: number, o: PrimOpt = {}): this {
    return this.limb(bone, this.j(bone), this.j(to), r1, r2, o);
  }

  /** Paints glow (and colour) onto the surface inside a sphere. */
  glow(c: THREE.Vector3, r: number, amount = 1, col?: RGB): this {
    this.regions.push({ c: c.clone(), r, glow: amount, col });
    return this;
  }

  /**
   * A burning eye: a small rigid ball that glows at full strength, plus a faint
   * painted halo. Painted glow alone smears over a coarse head; this stays a
   * crisp point at any mesh resolution.
   */
  eye(bone: string, c: THREE.Vector3, r: number, amount = 1): this {
    this.hard(bone, ballGeo(c, r, 1), 'skin', [0.6, 0.6, 0.6], Math.min(1, amount));
    if (amount > 0.3) this.regions.push({ c: c.clone(), r: r * 1.2, glow: Math.min(1, amount) * 0.2, mats: ['skin'] });
    return this;
  }

  /** A glowing boil, pustule or gem: a rigid half-sunk ball, crisp at any mesh resolution. */
  boil(bone: string, c: THREE.Vector3, r: number, glow = 0.8, col: RGB = [0.9, 0.85, 0.5]): this {
    return this.hard(bone, ballGeo(c, r, 1), 'skin', col, glow);
  }

  /** Paints colour onto the surface inside a sphere. */
  tint(c: THREE.Vector3, r: number, col: RGB, mats?: CMat[]): this {
    this.regions.push({ c: c.clone(), r, col, mats });
    return this;
  }

  /** Explicit geometry, character space, bound rigidly to `bone`. */
  hard(bone: string, geo: THREE.BufferGeometry, mat: CMat = 'skin', col?: RGB, glow?: number): this {
    this.parts.push({ bone: this.has(bone) ? bone : 'root', geo, mat, col, glow });
    return this;
  }

  /** Runs `fn` for both sides: side letter and the x sign (+1 left). */
  pair(fn: (s: 'L' | 'R', x: 1 | -1) => void): this {
    fn('L', 1);
    fn('R', -1);
    return this;
  }

  /** Total primitive count, for budgets and tests. */
  get primCount(): number {
    return this.fields.skin.prims.length + this.fields.alt.prims.length + this.fields.metal.prims.length;
  }
}

// ---------------------------------------------------------------------------
// Hard part geometry
// ---------------------------------------------------------------------------

const _q = new THREE.Quaternion();

/** A cone (spike, horn, claw, tooth) from `a` pointing to `b`, base radius r. Curves toward `bend` if given. */
export function spikeGeo(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 5, bend?: THREE.Vector3, rings = 3): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const p = a.clone().lerp(b, t);
    if (bend) p.addScaledVector(bend, Math.sin(t * Math.PI * 0.5) * t);
    pts.push(p);
  }
  return tubeGeo(pts, (t) => r * (1 - t) + r * 0.04, seg, true);
}

/** A tube along points with radius by t (0..1); `cap` closes the far end to a point. */
export function tubeGeo(pts: THREE.Vector3[], radius: (t: number) => number, seg = 6, cap = false): THREE.BufferGeometry {
  const n = pts.length;
  const pos: number[] = [];
  const idx: number[] = [];
  let prevN = V(1, 0, 0);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = pts[i]!;
    const d = (i < n - 1 ? pts[i + 1]!.clone().sub(p) : p.clone().sub(pts[i - 1]!)).normalize();
    // A frame that does not twist: carry the previous normal across.
    let nn = prevN.clone().addScaledVector(d, -prevN.dot(d));
    if (nn.lengthSq() < 1e-6) nn = Math.abs(d.y) < 0.9 ? V(0, 1, 0).cross(d) : V(1, 0, 0).cross(d);
    nn.normalize();
    prevN = nn;
    const bn = d.clone().cross(nn).normalize();
    const r = radius(t);
    for (let s = 0; s < seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push(p.x + (nn.x * Math.cos(a) + bn.x * Math.sin(a)) * r, p.y + (nn.y * Math.cos(a) + bn.y * Math.sin(a)) * r, p.z + (nn.z * Math.cos(a) + bn.z * Math.sin(a)) * r);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let s = 0; s < seg; s++) {
      const a = i * seg + s;
      const b = i * seg + ((s + 1) % seg);
      const c = (i + 1) * seg + s;
      const d = (i + 1) * seg + ((s + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  // Base cap.
  const base = pos.length / 3;
  pos.push(pts[0]!.x, pts[0]!.y, pts[0]!.z);
  for (let s = 0; s < seg; s++) idx.push(base, s, (s + 1) % seg);
  if (cap) {
    const tip = pos.length / 3;
    const e = pts[n - 1]!;
    const d = e.clone().sub(pts[n - 2]!).normalize().multiplyScalar(radius(1) * 2);
    pos.push(e.x + d.x, e.y + d.y, e.z + d.z);
    const o = (n - 1) * seg;
    for (let s = 0; s < seg; s++) idx.push(tip, o + ((s + 1) % seg), o + s);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A flat membrane (wing, fin, frill) through a fan of points from a root, with thickness. */
export function membraneGeo(root: THREE.Vector3, rim: THREE.Vector3[], thick = 0.01, sag = 0.0): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const n = rim.length;
  // Two layers, front and back, offset along the fan's normal.
  const normal = rim[n - 1]!.clone().sub(root).cross(rim[0]!.clone().sub(root)).normalize();
  for (const sgn of [1, -1]) {
    const off = normal.clone().multiplyScalar(thick * 0.5 * sgn);
    const o = pos.length / 3;
    pos.push(root.x + off.x, root.y + off.y, root.z + off.z);
    for (let i = 0; i < n; i++) {
      const p = rim[i]!.clone().add(off);
      // Membrane between ribs sags toward the root.
      if (sag && i > 0 && i < n - 1 && i % 2 === 1) p.lerp(root, sag);
      pos.push(p.x, p.y, p.z);
    }
    for (let i = 0; i < n - 1; i++) {
      if (sgn > 0) idx.push(o, o + 1 + i, o + 2 + i);
      else idx.push(o, o + 2 + i, o + 1 + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A box, rotated and placed (hard plates, blades). */
export function boxGeo(c: THREE.Vector3, size: THREE.Vector3, q?: THREE.Quaternion): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(size.x, size.y, size.z);
  g.deleteAttribute('uv');
  if (q) g.applyQuaternion(q);
  g.translate(c.x, c.y, c.z);
  return g;
}

/** A blade: a flattened diamond prism from `a` to `b`, `w` wide (along `edge`), thin. */
export function bladeGeo(a: THREE.Vector3, b: THREE.Vector3, w: number, thick: number, edge: THREE.Vector3, tipK = 0.25): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const len = d.length();
  d.normalize();
  const e = edge.clone().addScaledVector(d, -edge.dot(d)).normalize();
  const f = d.clone().cross(e).normalize();
  const pos: number[] = [];
  const idx: number[] = [];
  const ring = (t: number, hw: number, ht: number) => {
    const p = a.clone().addScaledVector(d, t * len);
    for (const [u, v] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const q = p.clone().addScaledVector(e, u * hw).addScaledVector(f, v * ht);
      pos.push(q.x, q.y, q.z);
    }
  };
  ring(0, w * 0.5, thick * 0.5);
  ring(1 - tipK, w * 0.5, thick * 0.5);
  pos.push(b.x, b.y, b.z);
  for (let s = 0; s < 4; s++) {
    const s1 = (s + 1) % 4;
    idx.push(s, 4 + s, s1, s1, 4 + s, 4 + s1);
    idx.push(4 + s, 8, 4 + s1);
  }
  idx.push(0, 1, 2, 0, 2, 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  g.dispose();
  return ng;
}

/**
 * A flat slab from `a` to `b` whose width (along `wide`) and thickness change
 * from one end to the other: axe heads, cleavers, plates, fins.
 */
export function slabGeo(a: THREE.Vector3, b: THREE.Vector3, wide: THREE.Vector3, w0: number, w1: number, t0: number, t1: number): THREE.BufferGeometry {
  const d = b.clone().sub(a).normalize();
  const e = wide.clone().addScaledVector(d, -wide.dot(d)).normalize();
  const f = d.clone().cross(e).normalize();
  const pos: number[] = [];
  for (const [p, w, t] of [[a, w0, t0], [b, w1, t1]] as const) {
    for (const [u, v] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
      const q = p.clone().addScaledVector(e, u * w * 0.5).addScaledVector(f, v * t * 0.5);
      pos.push(q.x, q.y, q.z);
    }
  }
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7];
  for (let s = 0; s < 4; s++) {
    const s1 = (s + 1) % 4;
    idx.push(s, 4 + s1, 4 + s, s, s1, 4 + s1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  g.dispose();
  return ng;
}

/** A low-poly ball (eyes, knobs, pustules). */
export function ballGeo(c: THREE.Vector3, r: number, detail = 0): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv');
  g.translate(c.x, c.y, c.z);
  return g;
}

/** A ring (bands, halos, collars) in the plane with normal `n`. */
export function ringGeo(c: THREE.Vector3, r: number, tube: number, n: THREE.Vector3, seg = 16): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r, tube, 4, seg);
  g.deleteAttribute('uv');
  _q.setFromUnitVectors(V(0, 0, 1), n.clone().normalize());
  g.applyQuaternion(_q);
  g.translate(c.x, c.y, c.z);
  return g;
}
