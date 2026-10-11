/**
 * SLAY — the prop kit.
 *
 * Every prop, interactable and town building is built here from code: a
 * handful of shape makers (chamfered boxes, planks, turned profiles, rocks,
 * tubes, cloth) and one builder, `PropKit`, that collects the shapes per
 * material and hands back one merged geometry per material. Instanced props
 * then cost one draw call per material, however many pieces they are made of.
 *
 * Conventions every builder keeps:
 *  - metres; the prop stands on y = 0 and faces +Z;
 *  - a wall prop's wall is behind it: its face sits at `WALL_FACE` (z < 0);
 *  - every geometry carries position, normal, colour and uv, so anything
 *    merges with anything; colour multiplies the material (cheap tonal
 *    variety and baked shading inside one draw);
 *  - randomness comes from the `Rng` the kit is given (seeded streams from
 *    `core/RNG.ts`), never from `Math.random`.
 *
 * Shapes are built heavy and worn: thick chamfers, sagging planks, chipped
 * stone, bent iron. Silhouette first; the photo textures carry the detail.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '../../types';
import { Noise } from '../Noise';
import { beveledBox, clothPanel, lathe as latheGeo } from '../Meshes';

/** Where the wall face sits behind a wall prop, in its own frame (tile centre is `wallOffset` in front). */
export const WALL_FACE = -0.25;

// ---------------------------------------------------------------------------
// Transforms
// ---------------------------------------------------------------------------

export interface Xf {
  x?: number;
  y?: number;
  z?: number;
  /** Euler angles, applied roll (z), then pitch (x), then yaw (y). */
  rx?: number;
  ry?: number;
  rz?: number;
  s?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Applies a transform to a geometry in place and returns it. */
export function xf(geo: THREE.BufferGeometry, t?: Xf): THREE.BufferGeometry {
  if (!t) return geo;
  const s = t.s ?? 1;
  _s.set((t.sx ?? 1) * s, (t.sy ?? 1) * s, (t.sz ?? 1) * s);
  _e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(t.x ?? 0, t.y ?? 0, t.z ?? 0);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

// ---------------------------------------------------------------------------
// Attribute hygiene and merging
// ---------------------------------------------------------------------------

/** Gives a geometry exactly position, normal, colour (white) and uv, indexed. */
export function clean(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  if (!pos) return geo;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  if (!geo.getAttribute('color')) {
    const c = new Float32Array(pos.count * 3);
    c.fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') geo.deleteAttribute(name);
  }
  if (!geo.index) {
    const n = pos.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  geo.clearGroups();
  return geo;
}

/** Merges cleaned geometries (position, normal, colour, uv, index) into one. */
export function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.filter((g) => g.getAttribute('position') && g.getAttribute('position').count > 0).map(clean);
  let v = 0;
  let i = 0;
  for (const g of parts) {
    v += g.getAttribute('position').count;
    i += g.index!.count;
  }
  const pos = new Float32Array(v * 3);
  const nor = new Float32Array(v * 3);
  const col = new Float32Array(v * 3);
  const uv = new Float32Array(v * 2);
  const idx = v > 65535 ? new Uint32Array(i) : new Uint16Array(i);
  let vo = 0;
  let io = 0;
  for (const g of parts) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    const t = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const a = (vo + k) * 3;
      pos[a] = p.getX(k);
      pos[a + 1] = p.getY(k);
      pos[a + 2] = p.getZ(k);
      nor[a] = n.getX(k);
      nor[a + 1] = n.getY(k);
      nor[a + 2] = n.getZ(k);
      col[a] = c.getX(k);
      col[a + 1] = c.getY(k);
      col[a + 2] = c.getZ(k);
      uv[(vo + k) * 2] = t.getX(k);
      uv[(vo + k) * 2 + 1] = t.getY(k);
    }
    const gi = g.index!;
    for (let k = 0; k < gi.count; k++) idx[io + k] = vo + gi.getX(k);
    io += gi.count;
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  for (const g of parts) g.dispose();
  return out;
}

// ---------------------------------------------------------------------------
// Colour (baked tone)
// ---------------------------------------------------------------------------

export type Shade = number | [number, number, number];

function rgb(s: Shade): [number, number, number] {
  if (Array.isArray(s)) return s;
  if (s <= 4) return [s, s, s];
  const c = new THREE.Color(s);
  return [c.r, c.g, c.b];
}

/** Multiplies a geometry's vertex colour by a tone (a grey level or an sRGB hex). */
export function shade(geo: THREE.BufferGeometry, s: Shade): THREE.BufferGeometry {
  clean(geo);
  const [r, g, b] = rgb(s);
  const c = geo.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * r, c.getY(i) * g, c.getZ(i) * b);
  c.needsUpdate = true;
  return geo;
}

/**
 * Darkens toward the bottom of a part, from `low` at y0 to 1 at y1 (model
 * space, after placing): soot at a brazier's foot, damp at a stone's base.
 */
export function shadeY(geo: THREE.BufferGeometry, y0: number, y1: number, low: number): THREE.BufferGeometry {
  clean(geo);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const c = geo.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = THREE.MathUtils.clamp((p.getY(i) - y0) / Math.max(1e-4, y1 - y0), 0, 1);
    const k = low + (1 - low) * t * t * (3 - 2 * t);
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  c.needsUpdate = true;
  return geo;
}

/** Blotchy tone noise across a part: stains, moss, soot, sun bleach. */
export function mottle(geo: THREE.BufferGeometry, rng: Rng, amount: number, freq = 2.2, tint?: number): THREE.BufferGeometry {
  clean(geo);
  const n = new Noise(Math.floor(rng.next() * 0xffffffff));
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const c = geo.getAttribute('color') as THREE.BufferAttribute;
  const t = tint !== undefined ? rgb(tint) : null;
  for (let i = 0; i < p.count; i++) {
    const v = n.fbm3(p.getX(i) * freq, p.getY(i) * freq, p.getZ(i) * freq, 3) * 0.5 + 0.5;
    const k = THREE.MathUtils.clamp((v - 0.45) * 2.2, 0, 1) * amount;
    if (t) {
      c.setXYZ(i, c.getX(i) * (1 - k + k * t[0]), c.getY(i) * (1 - k + k * t[1]), c.getZ(i) * (1 - k + k * t[2]));
    } else {
      const d = 1 - k * 0.6;
      c.setXYZ(i, c.getX(i) * d, c.getY(i) * d, c.getZ(i) * d);
    }
  }
  c.needsUpdate = true;
  return geo;
}

// ---------------------------------------------------------------------------
// Deformers (crack-free: offsets depend on position only, so split vertices
// at one point move together)
// ---------------------------------------------------------------------------

/** Pushes vertices by a 3D noise field: chipped stone, lumpy earth, gnarled wood. */
export function jag(geo: THREE.BufferGeometry, rng: Rng, amount: number, freq = 3): THREE.BufferGeometry {
  const n = new Noise(Math.floor(rng.next() * 0xffffffff));
  const o = rng.range(-50, 50);
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const fx = x * freq + o;
    const fy = y * freq - o;
    const fz = z * freq + o * 0.5;
    p.setXYZ(
      i,
      x + n.fbm3(fx, fy, fz, 2) * amount,
      y + n.fbm3(fy + 19.1, fz, fx, 2) * amount,
      z + n.fbm3(fz - 7.3, fx, fy, 2) * amount,
    );
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Bows a long part along X: sagging planks, warped beams. `amount` is the drop at the middle. */
export function sag(geo: THREE.BufferGeometry, amount: number, axis: 'x' | 'z' = 'x'): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const lo = axis === 'x' ? bb.min.x : bb.min.z;
  const hi = axis === 'x' ? bb.max.x : bb.max.z;
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = ((axis === 'x' ? p.getX(i) : p.getZ(i)) - lo) / Math.max(1e-4, hi - lo);
    p.setY(i, p.getY(i) - Math.sin(u * Math.PI) * amount);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Scales X/Z by height: 1 at the bottom of the part, `top` at its top. */
export function taper(geo: THREE.BufferGeometry, top: number): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const p = geo.getAttribute('position') as THREE.BufferAttribute;
  const span = Math.max(1e-4, bb.max.y - bb.min.y);
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - bb.min.y) / span;
    const k = 1 + (top - 1) * t;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Welds coincident vertices and smooths the normals (rocks, mounds, flesh). */
export function smooth(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(geo.attributes)) if (name !== 'position') geo.deleteAttribute(name);
  const out = mergeVertices(geo, 1e-4);
  out.computeVertexNormals();
  geo.dispose();
  return out;
}

// ---------------------------------------------------------------------------
// Shapes (fresh geometry; base-anchored ones say so)
// ---------------------------------------------------------------------------

/** Chamfered box, centred. */
export function box(w: number, h: number, d: number, bevel = 0.025, seg = 1): THREE.BufferGeometry {
  const b = Math.min(bevel, Math.min(w, h, d) * 0.45);
  return b > 0.002 ? beveledBox(w, h, d, b, seg) : new THREE.BoxGeometry(w, h, d, seg, seg, seg);
}

/** Cylinder, base at y = 0. */
export function cyl(rTop: number, rBot: number, h: number, seg = 10, open = false, hSeg = 1): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, hSeg, open);
  g.translate(0, h / 2, 0);
  return g;
}

/** Cone, base at y = 0. */
export function cone(r: number, h: number, seg = 8, hSeg = 1): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg, hSeg);
  g.translate(0, h / 2, 0);
  return g;
}

export function sphere(r: number, wSeg = 10, hSeg = 8): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, wSeg, hSeg);
}

export function torus(r: number, tube: number, radial = 6, tubular = 16, arc = Math.PI * 2): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r, tube, radial, tubular, arc);
}

/** Revolve `[radius, y]` pairs around Y (urns, bowls, candles, columns). Base-anchored as authored. */
export function lathe(profile: Array<[number, number]>, seg = 12): THREE.BufferGeometry {
  return latheGeo(profile, seg);
}

/**
 * A board: chamfered, a little warped and twisted, ends sometimes split.
 * Centred; length along X.
 */
export function plank(len: number, w: number, t: number, rng: Rng, wear = 0.5): THREE.BufferGeometry {
  const seg = Math.max(2, Math.round(len / 0.35));
  const g = new THREE.BoxGeometry(len, t, w, seg, 1, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const twist = rng.range(-0.06, 0.06) * wear;
  const bow = rng.range(-0.02, 0.02) * wear * len;
  const chip = rng.range(0.6, 1);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const u = x / len + 0.5;
    const a = twist * (u - 0.5) * 2;
    const y = p.getY(i);
    const z = p.getZ(i);
    // Rounded end: corners pull in a little at both ends.
    const end = Math.abs(u - 0.5) * 2;
    const pinch = end > 0.92 ? 1 - (end - 0.92) * 2.2 * wear * chip : 1;
    p.setXYZ(i, x, (y * Math.cos(a) - z * Math.sin(a)) * pinch + Math.sin(u * Math.PI) * bow, (y * Math.sin(a) + z * Math.cos(a)) * pinch);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** A rough log or post, base at y = 0: tapered, knotted, a little crooked. */
export function log(len: number, r: number, rng: Rng, o: { seg?: number; taper?: number; bend?: number; knots?: number } = {}): THREE.BufferGeometry {
  const rows = Math.max(3, Math.round(len / 0.3));
  const profile: Array<[number, number]> = [];
  const tp = o.taper ?? 0.8;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const bulge = 1 + Math.sin(t * 9.1 + rng.range(0, 6)) * 0.04 * (o.knots ?? 1);
    profile.push([r * (1 + (tp - 1) * t) * bulge, t * len]);
  }
  profile.unshift([r * 0.0001, 0]);
  profile.push([r * tp * 0.0001, len]);
  const g = latheGeo(profile, o.seg ?? 8);
  const bend = o.bend ?? 0.04;
  if (bend) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const dx = rng.range(-1, 1) * bend * len;
    const dz = rng.range(-1, 1) * bend * len;
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / len;
      p.setX(i, p.getX(i) + dx * t * t);
      p.setZ(i, p.getZ(i) + dz * t * t);
    }
    p.needsUpdate = true;
  }
  jag(g, rng, r * 0.12, 4 / Math.max(0.05, r));
  return g;
}

/** An irregular stone, centred. `flat` < 1 squashes it into a slab. */
export function rock(r: number, rng: Rng, o: { detail?: number; flat?: number; rough?: number } = {}): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, o.detail ?? 1);
  g = smooth(g);
  g.scale(rng.range(0.8, 1.2), (o.flat ?? 0.7) * rng.range(0.85, 1.1), rng.range(0.8, 1.2));
  jag(g, rng, r * 0.32 * (o.rough ?? 1), 1.6 / r);
  jag(g, rng, r * 0.08 * (o.rough ?? 1), 5 / r);
  return g;
}

/** A tube along points (roots, branches, rope, chain runs, pipes). */
export function tube(points: THREE.Vector3[], r0: number, r1 = r0, seg = 6, steps?: number): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const n = steps ?? Math.max(4, points.length * 4);
  const g = new THREE.TubeGeometry(curve, n, 1, seg, false);
  // Taper from r0 to r1 by rescaling each ring about the curve.
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const ringSize = seg + 1;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * t;
    for (let j = 0; j < ringSize; j++) {
      const k = i * ringSize + j;
      if (k >= p.count) break;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r);
    }
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** A hanging cloth (banner, tarp, rag), top edge at y = 0 hanging down -Y, centred on X. */
export function cloth(w: number, h: number, rng: Rng, o: { ripple?: number; flare?: number; tatter?: number; segsX?: number; segsY?: number } = {}): THREE.BufferGeometry {
  return clothPanel(w, h, rng, { segsX: o.segsX ?? 5, segsY: o.segsY ?? 8, ripple: o.ripple ?? 0.05, flare: o.flare ?? 0.1, tatter: o.tatter ?? 0.2 });
}

/** A run of chain links from `a` to `b`, sagging by `drop`. */
export function chain(a: THREE.Vector3, b: THREE.Vector3, drop: number, link = 0.07): THREE.BufferGeometry {
  const len = a.distanceTo(b) + drop;
  const n = Math.max(2, Math.round(len / (link * 1.5)));
  const parts: THREE.BufferGeometry[] = [];
  const pt = new THREE.Vector3();
  const nx = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    pt.lerpVectors(a, b, t);
    pt.y -= Math.sin(t * Math.PI) * drop;
    const t2 = Math.min(1, t + 0.5 / n);
    nx.lerpVectors(a, b, t2);
    nx.y -= Math.sin(t2 * Math.PI) * drop;
    const l = new THREE.TorusGeometry(link * 0.5, link * 0.14, 4, 8);
    l.scale(1, 1.5, 1);
    // Align the link's long axis with the run, alternate links turned 90°.
    const dir = nx.sub(pt).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i % 2) * Math.PI * 0.5);
    l.applyQuaternion(q2);
    l.applyQuaternion(q);
    l.translate(pt.x, pt.y, pt.z);
    parts.push(l);
  }
  return merge(parts);
}

/** A crude human skull, centred, facing +Z. About 0.2 m. */
export function skull(rng: Rng, s = 1): THREE.BufferGeometry {
  const cranium = new THREE.SphereGeometry(0.1 * s, 10, 8);
  cranium.scale(0.9, 0.95, 1.1);
  cranium.translate(0, 0.03 * s, -0.01 * s);
  const jaw = new THREE.BoxGeometry(0.11 * s, 0.07 * s, 0.09 * s);
  jaw.translate(0, -0.06 * s, 0.05 * s);
  const g = smooth(merge([cranium, jaw]));
  // Eye sockets and nose: push the face in where the holes are.
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (z < 0.05 * s) continue;
    const eye = Math.max(0, 1 - Math.hypot(Math.abs(x) - 0.038 * s, y - 0.02 * s) / (0.03 * s));
    const nose = Math.max(0, 1 - Math.hypot(x, y + 0.025 * s) / (0.018 * s));
    p.setZ(i, z - (eye * 0.035 + nose * 0.02) * s);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  jag(g, rng, 0.006 * s, 30 / s);
  return g;
}

/** A long bone (femur-ish) along X, centred. */
export function longBone(len: number, r: number): THREE.BufferGeometry {
  const shaftG = new THREE.CylinderGeometry(r * 0.7, r * 0.7, len * 0.8, 6);
  shaftG.rotateZ(Math.PI / 2);
  const k1 = new THREE.SphereGeometry(r * 1.25, 6, 5);
  k1.translate(-len * 0.42, 0, r * 0.4);
  const k2 = new THREE.SphereGeometry(r * 1.25, 6, 5);
  k2.translate(-len * 0.42, 0, -r * 0.4);
  const k3 = new THREE.SphereGeometry(r * 1.3, 6, 5);
  k3.translate(len * 0.42, 0, 0);
  return merge([shaftG, k1, k2, k3]);
}

/** A thin flat disc on the ground (y ≈ 0): stains, rugs, seals. */
export function disc(r: number, seg = 24, y = 0.012): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, seg);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export interface KitLayer {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  ghost?: boolean;
}

export interface KitFlame {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Height of the flame's origin above the prop base. */
  y: number;
  /** Forward offset along the prop's facing. */
  forward: number;
}

export interface KitOut {
  layers: KitLayer[];
  flame: KitFlame | null;
}

/**
 * Collects shapes per material and merges them. Builders call `add` (or the
 * shape shortcuts) and finish with `done()`.
 */
export class PropKit {
  readonly rng: Rng;
  private readonly buckets = new Map<THREE.Material, { ghost: boolean; list: THREE.BufferGeometry[] }>();
  private flameParts: THREE.BufferGeometry[] = [];
  private flameMatl: THREE.Material | null = null;
  private flameY = 0;
  private flameFwd = 0;

  constructor(rng: Rng) {
    this.rng = rng;
  }

  /** Adds a shape under a material, after a transform and a tone. */
  add(mat: THREE.Material, geo: THREE.BufferGeometry, t?: Xf, tone?: Shade, ghost = false): this {
    xf(geo, t);
    clean(geo);
    if (tone !== undefined) shade(geo, tone);
    let b = this.buckets.get(mat);
    if (!b) this.buckets.set(mat, (b = { ghost, list: [] }));
    b.list.push(geo);
    return this;
  }

  /** A chamfered box whose bottom sits at `t.y` before rotation (rotates about its centre). */
  box(mat: THREE.Material, w: number, h: number, d: number, t: Xf = {}, tone?: Shade, bevel = 0.025): this {
    return this.add(mat, box(w, h, d, bevel), { ...t, y: (t.y ?? 0) + h / 2 * (t.sy ?? t.s ?? 1) }, tone);
  }

  /** A board whose centre is at `t` (length along X before rotation). */
  plank(mat: THREE.Material, len: number, w: number, th: number, t: Xf = {}, tone?: Shade, wear = 0.5): this {
    return this.add(mat, plank(len, w, th, this.rng, wear), t, tone ?? this.rng.range(0.78, 1.08));
  }

  cyl(mat: THREE.Material, rTop: number, rBot: number, h: number, t: Xf = {}, tone?: Shade, seg = 10, open = false): this {
    return this.add(mat, cyl(rTop, rBot, h, seg, open), t, tone);
  }

  /** A self-lit flame body, instanced on its own so the builder can flicker it. */
  flame(mat: THREE.Material, geo: THREE.BufferGeometry, y: number, forward = 0): this {
    clean(geo);
    this.flameParts.push(geo);
    this.flameMatl = mat;
    this.flameY = y;
    this.flameFwd = forward;
    return this;
  }

  done(): KitOut {
    const layers: KitLayer[] = [];
    // Opaque first, see-through after: the builder draws ghosts late.
    const entries = [...this.buckets.entries()].sort((a, b) => Number(a[1].ghost) - Number(b[1].ghost));
    for (const [material, b] of entries) {
      if (b.list.length === 0) continue;
      layers.push({ geometry: merge(b.list), material, ghost: b.ghost || undefined });
    }
    this.buckets.clear();
    const flame = this.flameMatl && this.flameParts.length
      ? { geometry: merge(this.flameParts), material: this.flameMatl, y: this.flameY, forward: this.flameFwd }
      : null;
    this.flameParts = [];
    return { layers, flame };
  }
}

/** Points along a gnarled branch from `from` heading `dir`, for `tube`. */
export function branchPath(from: THREE.Vector3, dir: THREE.Vector3, len: number, rng: Rng, wander = 0.35, steps = 4): THREE.Vector3[] {
  const pts = [from.clone()];
  const d = dir.clone().normalize();
  const at = from.clone();
  for (let i = 0; i < steps; i++) {
    d.x += rng.range(-wander, wander);
    d.z += rng.range(-wander, wander);
    d.y += rng.range(-wander, wander) * 0.5;
    d.normalize();
    at.addScaledVector(d, len / steps);
    pts.push(at.clone());
  }
  return pts;
}
