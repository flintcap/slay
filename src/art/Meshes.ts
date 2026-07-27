/**
 * SLAY — procedural geometry.
 *
 * Two rules run through everything here:
 *
 *  1. **Bevel everything.** Nothing in the real world has a razor edge. A
 *     chamfer only a centimetre wide is what catches a highlight and separates
 *     a shape from its background; a raw `BoxGeometry` reads as programmer art
 *     from across the room no matter how good its texture is.
 *  2. **Break every primitive.** Anything that could read as a stock cylinder
 *     or sphere gets noise-displaced, tapered or profile-modulated first.
 *
 * All builders return centred, indexed `BufferGeometry` carrying position,
 * normal and uv, so anything here can be merged with anything else.
 *
 * UVs are box-projected in world units, which keeps texel density constant
 * across wildly different object sizes without per-object UV authoring.
 */

import * as THREE from 'three';
import { Noise, clamp01, lerp, smoothstep } from './Noise';
import type { Rng } from '../types';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * A small accumulator for hand-built polygon soup. Every face carries its own
 * vertices, so faces are flat-shaded by construction — exactly what you want
 * for chamfered, faceted, hand-forged looking props.
 */
export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uvs: number[] = [];
  private idx: number[] = [];
  /** World units per UV unit. */
  uvScale = 1;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  private push(p: THREE.Vector3, n: THREE.Vector3, u: number, v: number): number {
    const i = this.pos.length / 3;
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uvs.push(u, v);
    return i;
  }

  /** Box-projected UV for a point, chosen by the face's dominant axis. */
  private projectUV(p: THREE.Vector3, n: THREE.Vector3, out: { u: number; v: number }): void {
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    const s = 1 / this.uvScale;
    if (ax >= ay && ax >= az) {
      out.u = p.z * s;
      out.v = p.y * s;
    } else if (ay >= az) {
      out.u = p.x * s;
      out.v = p.z * s;
    } else {
      out.u = p.x * s;
      out.v = p.y * s;
    }
  }

  private static _uv = { u: 0, v: 0 };

  /**
   * Add a triangle. If `outward` is supplied the winding is corrected to match
   * it, so callers never have to reason about vertex order.
   */
  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, outward?: THREE.Vector3): void {
    _a.subVectors(b, a);
    _b.subVectors(c, a);
    _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-12) return;
    _n.normalize();
    let p0 = a;
    let p1 = b;
    let p2 = c;
    if (outward) {
      if (_n.dot(outward) < 0) {
        p1 = c;
        p2 = b;
        _n.negate();
      }
    }
    const uv = GeoBuilder._uv;
    this.projectUV(p0, _n, uv);
    const i0 = this.push(p0, _n, uv.u, uv.v);
    this.projectUV(p1, _n, uv);
    const i1 = this.push(p1, _n, uv.u, uv.v);
    this.projectUV(p2, _n, uv);
    const i2 = this.push(p2, _n, uv.u, uv.v);
    this.idx.push(i0, i1, i2);
  }

  /** Add a planar quad a-b-c-d (in order around the perimeter). */
  quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    outward?: THREE.Vector3,
  ): void {
    this.tri(a, b, c, outward);
    this.tri(a, c, d, outward);
  }

  /** Append an existing geometry, optionally transformed. */
  add(geo: THREE.BufferGeometry, matrix?: THREE.Matrix4): void {
    const src = matrix ? geo.clone().applyMatrix4(matrix) : geo;
    const pos = src.getAttribute('position');
    let nrm = src.getAttribute('normal');
    if (!nrm) {
      src.computeVertexNormals();
      nrm = src.getAttribute('normal');
    }
    const uv = src.getAttribute('uv');
    const base = this.pos.length / 3;
    for (let i = 0; i < pos.count; i++) {
      this.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      this.nor.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      if (uv) this.uvs.push(uv.getX(i), uv.getY(i));
      else this.uvs.push(0, 0);
    }
    const index = src.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    }
    if (matrix) src.dispose();
  }

  build(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    return geo;
  }
}

// ---------------------------------------------------------------------------
// Attribute normalisation + merging
// ---------------------------------------------------------------------------

/** Guarantees position + normal + uv + index, so anything can merge with anything. */
export function normalizeGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  if (!geo.getAttribute('uv')) {
    const n = geo.getAttribute('position').count;
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!geo.getIndex()) {
    const n = geo.getAttribute('position').count;
    const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) arr[i] = i;
    geo.setIndex(new THREE.BufferAttribute(arr, 1));
  }
  return geo;
}

/**
 * Merge a list of geometries into one draw call. Deliberately hand-rolled
 * rather than pulled from the addons: it normalises attributes first, so a
 * lathe, a beveled box and a displaced sphere merge without complaint.
 * The inputs are left untouched — the caller still owns them.
 */
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const usable = list.filter((g) => g && g.getAttribute('position'));
  if (usable.length === 0) return new THREE.BufferGeometry();
  if (usable.length === 1) return normalizeGeometry(usable[0].clone());

  let vTotal = 0;
  let iTotal = 0;
  for (const g of usable) {
    normalizeGeometry(g);
    vTotal += g.getAttribute('position').count;
    const idx = g.getIndex();
    iTotal += idx ? idx.count : g.getAttribute('position').count;
  }

  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const idxArr = vTotal > 65535 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);

  let vo = 0;
  let io = 0;
  for (const g of usable) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const t = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos[(vo + i) * 3] = p.getX(i);
      pos[(vo + i) * 3 + 1] = p.getY(i);
      pos[(vo + i) * 3 + 2] = p.getZ(i);
      nor[(vo + i) * 3] = n.getX(i);
      nor[(vo + i) * 3 + 1] = n.getY(i);
      nor[(vo + i) * 3 + 2] = n.getZ(i);
      uv[(vo + i) * 2] = t.getX(i);
      uv[(vo + i) * 2 + 1] = t.getY(i);
    }
    const gi = g.getIndex();
    if (gi) {
      for (let i = 0; i < gi.count; i++) idxArr[io + i] = vo + gi.getX(i);
      io += gi.count;
    } else {
      for (let i = 0; i < p.count; i++) idxArr[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idxArr, 1));
  out.computeBoundingSphere();
  return out;
}

/** Convenience: place a geometry without mutating the original. */
export function transformed(
  geo: THREE.BufferGeometry,
  opts: {
    pos?: [number, number, number];
    rot?: [number, number, number];
    scale?: [number, number, number] | number;
  },
): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  if (opts.rot) q.setFromEuler(new THREE.Euler(opts.rot[0], opts.rot[1], opts.rot[2]));
  const s = opts.scale;
  const sv = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...(s ?? [1, 1, 1]));
  m.compose(new THREE.Vector3(...(opts.pos ?? [0, 0, 0])), q, sv);
  return geo.clone().applyMatrix4(m);
}

// ---------------------------------------------------------------------------
// Beveled box
// ---------------------------------------------------------------------------

const CORNERS: Array<[number, number, number]> = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, 1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
  [1, -1, 1],
  [1, 1, 1],
  [-1, 1, 1],
];

/**
 * A box with all twelve edges chamfered and all eight corners cut. This is the
 * workhorse: crates, blocks, plate armour, weapon fittings, furniture.
 *
 * `segments` subdivides the six main faces, which is what makes the result
 * useful as input to `displace()`.
 */
export function beveledBox(w: number, h: number, d: number, bevel = 0.06, segments = 1): THREE.BufferGeometry {
  const hx = w * 0.5;
  const hy = h * 0.5;
  const hz = d * 0.5;
  const b = Math.max(0.0005, Math.min(bevel, Math.min(hx, hy, hz) * 0.48));
  const g = new GeoBuilder();
  g.uvScale = 1;

  const ix = hx - b;
  const iy = hy - b;
  const iz = hz - b;

  // --- six main faces, inset by the bevel and optionally subdivided ---
  const faceAxes: Array<{ n: THREE.Vector3; o: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3 }> = [
    { n: new THREE.Vector3(1, 0, 0), o: new THREE.Vector3(hx, 0, 0), u: new THREE.Vector3(0, 0, iz), v: new THREE.Vector3(0, iy, 0) },
    { n: new THREE.Vector3(-1, 0, 0), o: new THREE.Vector3(-hx, 0, 0), u: new THREE.Vector3(0, 0, iz), v: new THREE.Vector3(0, iy, 0) },
    { n: new THREE.Vector3(0, 1, 0), o: new THREE.Vector3(0, hy, 0), u: new THREE.Vector3(ix, 0, 0), v: new THREE.Vector3(0, 0, iz) },
    { n: new THREE.Vector3(0, -1, 0), o: new THREE.Vector3(0, -hy, 0), u: new THREE.Vector3(ix, 0, 0), v: new THREE.Vector3(0, 0, iz) },
    { n: new THREE.Vector3(0, 0, 1), o: new THREE.Vector3(0, 0, hz), u: new THREE.Vector3(ix, 0, 0), v: new THREE.Vector3(0, iy, 0) },
    { n: new THREE.Vector3(0, 0, -1), o: new THREE.Vector3(0, 0, -hz), u: new THREE.Vector3(ix, 0, 0), v: new THREE.Vector3(0, iy, 0) },
  ];

  const seg = Math.max(1, Math.floor(segments));
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const r = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (const f of faceAxes) {
    for (let j = 0; j < seg; j++) {
      const v0 = (j / seg) * 2 - 1;
      const v1 = ((j + 1) / seg) * 2 - 1;
      for (let i = 0; i < seg; i++) {
        const u0 = (i / seg) * 2 - 1;
        const u1 = ((i + 1) / seg) * 2 - 1;
        p.copy(f.o).addScaledVector(f.u, u0).addScaledVector(f.v, v0);
        q.copy(f.o).addScaledVector(f.u, u1).addScaledVector(f.v, v0);
        r.copy(f.o).addScaledVector(f.u, u1).addScaledVector(f.v, v1);
        s.copy(f.o).addScaledVector(f.u, u0).addScaledVector(f.v, v1);
        g.quad(p, q, r, s, f.n);
      }
    }
  }

  // --- corner points: three per corner, one per adjacent face plane ---
  const cp: Array<{ x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 }> = CORNERS.map(([sx, sy, sz]) => ({
    x: new THREE.Vector3(sx * hx, sy * iy, sz * iz),
    y: new THREE.Vector3(sx * ix, sy * hy, sz * iz),
    z: new THREE.Vector3(sx * ix, sy * iy, sz * hz),
  }));

  // --- twelve edge chamfers ---
  // Each entry: the two corner indices the edge spans, and which face-plane
  // point on each corner the chamfer connects.
  type EdgeSpec = [number, number, 'x' | 'y' | 'z', 'x' | 'y' | 'z'];
  const edges: EdgeSpec[] = [
    // edges along X (vary sx): connect the y-plane and z-plane points
    [0, 1, 'y', 'z'],
    [3, 2, 'y', 'z'],
    [4, 5, 'y', 'z'],
    [7, 6, 'y', 'z'],
    // edges along Y (vary sy): connect x-plane and z-plane points
    [0, 3, 'x', 'z'],
    [1, 2, 'x', 'z'],
    [4, 7, 'x', 'z'],
    [5, 6, 'x', 'z'],
    // edges along Z (vary sz): connect x-plane and y-plane points
    [0, 4, 'x', 'y'],
    [1, 5, 'x', 'y'],
    [2, 6, 'x', 'y'],
    [3, 7, 'x', 'y'],
  ];
  const out = new THREE.Vector3();
  for (const [ca, cb, k0, k1] of edges) {
    const A0 = cp[ca][k0];
    const A1 = cp[ca][k1];
    const B0 = cp[cb][k0];
    const B1 = cp[cb][k1];
    out.set(0, 0, 0).add(A0).add(A1).add(B0).add(B1).multiplyScalar(0.25).normalize();
    g.quad(A0, A1, B1, B0, out);
  }

  // --- eight corner cuts ---
  for (let i = 0; i < 8; i++) {
    const [sx, sy, sz] = CORNERS[i];
    out.set(sx, sy, sz).normalize();
    g.tri(cp[i].x, cp[i].y, cp[i].z, out);
  }

  return g.build();
}

// ---------------------------------------------------------------------------
// Displacement
// ---------------------------------------------------------------------------

/**
 * Displaces vertices along their normals by domain-warped noise — turns
 * primitives into rock, flesh and ice. Two octaves of scale so the result gets
 * both a broad silhouette break and fine surface tooth.
 */
export function displace(geo: THREE.BufferGeometry, rng: Rng, amount: number, scale: number): THREE.BufferGeometry {
  const noise = new Noise(Math.floor(rng.next() * 0xffffffff));
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const ox = rng.range(-40, 40);
  const oy = rng.range(-40, 40);
  const oz = rng.range(-40, 40);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const wx = x * scale + ox;
    const wy = y * scale + oy;
    const wz = z * scale + oz;
    // Warp the lookup itself so the bumps are not axis-aligned blobs.
    const w = noise.fbm3(wx * 0.5, wy * 0.5, wz * 0.5, 2) * 0.9;
    const broad = noise.fbm3(wx + w, wy - w, wz + w * 0.5, 3);
    const fine = noise.fbm3(wx * 2.7 - w, wy * 2.7, wz * 2.7 + w, 2);
    const off = broad * amount + fine * amount * 0.32;
    pos.setXYZ(i, x + nrm.getX(i) * off, y + nrm.getY(i) * off, z + nrm.getZ(i) * off);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Bends a geometry around the X axis — capes, banners, curved plate. */
export function bend(geo: THREE.BufferGeometry, amount: number, axis: 'x' | 'z' = 'z'): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (axis === 'z') pos.setZ(i, z + x * x * amount);
    else pos.setX(i, x + z * z * amount);
    void y;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Tapers along Y: scale 1 at the bottom, `top` at the top. */
export function taper(geo: THREE.BufferGeometry, top: number, bottom = 1): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return geo;
  const y0 = bb.min.y;
  const y1 = bb.max.y;
  const span = Math.max(1e-5, y1 - y0);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - y0) / span;
    const k = lerp(bottom, top, t);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Twists around Y by `radians` from bottom to top. */
export function twist(geo: THREE.BufferGeometry, radians: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  if (!bb) return geo;
  const y0 = bb.min.y;
  const span = Math.max(1e-5, bb.max.y - y0);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - y0) / span;
    const a = t * radians;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setX(i, x * ca - z * sa);
    pos.setZ(i, x * sa + z * ca);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Stone
// ---------------------------------------------------------------------------

/**
 * A quarried block: chamfered, subdivided and eroded. `roughness` scales how
 * badly weathered it is, from a crisp temple ashlar to a tumbled cave boulder.
 */
export function stoneBlock(w: number, h: number, d: number, rng: Rng, roughness = 0.5): THREE.BufferGeometry {
  const smallest = Math.min(w, h, d);
  const bevel = smallest * lerp(0.05, 0.16, roughness);
  const seg = roughness > 0.35 ? 4 : 2;
  const geo = beveledBox(w, h, d, bevel, seg);
  displace(geo, rng, smallest * 0.055 * roughness, 2.6 / Math.max(0.35, smallest));
  // A slight random shear stops a wall of blocks from reading as a grid.
  const shear = new THREE.Matrix4().makeShear(
    rng.range(-0.012, 0.012) * roughness,
    0,
    rng.range(-0.012, 0.012) * roughness,
    0,
    0,
    0,
  );
  geo.applyMatrix4(shear);
  geo.computeVertexNormals();
  return geo;
}

/** An irregular boulder / rubble chunk. */
export function rock(radius: number, rng: Rng, detail = 1): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail + 1);
  // Flatten it slightly so it sits like a rock rather than floating like a ball.
  geo.scale(rng.range(0.85, 1.2), rng.range(0.55, 0.85), rng.range(0.85, 1.2));
  displace(geo, rng, radius * 0.34, 2.2 / radius);
  normalizeGeometry(geo);
  return geo;
}

// ---------------------------------------------------------------------------
// Lathe / revolve
// ---------------------------------------------------------------------------

/**
 * Revolve a profile around Y. `profile` is a list of `[radius, y]` pairs from
 * bottom to top. Normals are computed analytically from the profile tangent so
 * the result is smooth without needing a vertex weld.
 *
 * Goblets, urns, torch sconces, pommels, boss cores, columns.
 */
export function lathe(profile: Array<[number, number]>, segments = 24): THREE.BufferGeometry {
  const rows = profile.length;
  if (rows < 2) return new THREE.BufferGeometry();
  const cols = Math.max(3, Math.floor(segments));
  const vTotal = rows * (cols + 1);
  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);

  // Profile-space normals: rotate the tangent by 90 degrees in the (r,y) plane.
  const pn: Array<[number, number]> = [];
  for (let i = 0; i < rows; i++) {
    const prev = profile[Math.max(0, i - 1)];
    const next = profile[Math.min(rows - 1, i + 1)];
    const dr = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dr, dy) || 1;
    pn.push([dy / len, -dr / len]);
  }

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const [, y] of profile) {
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const ySpan = Math.max(1e-5, yMax - yMin);

  for (let i = 0; i < rows; i++) {
    const [r, y] = profile[i];
    const [nr, ny] = pn[i];
    for (let j = 0; j <= cols; j++) {
      const t = j / cols;
      const ang = t * Math.PI * 2;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const vi = i * (cols + 1) + j;
      pos[vi * 3] = r * ca;
      pos[vi * 3 + 1] = y;
      pos[vi * 3 + 2] = r * sa;
      nor[vi * 3] = nr * ca;
      nor[vi * 3 + 1] = ny;
      nor[vi * 3 + 2] = nr * sa;
      uv[vi * 2] = t;
      uv[vi * 2 + 1] = (y - yMin) / ySpan;
    }
  }

  const idx: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = (i + 1) * (cols + 1) + j;
      const c = (i + 1) * (cols + 1) + j + 1;
      const d = i * (cols + 1) + j + 1;
      idx.push(a, b, c, a, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * A revolve where the radius is also a function of angle — flutes, spirals,
 * knurling, twisted horns. `mod(t, angle)` returns a multiplier on the radius.
 */
export function latheModulated(
  profile: Array<[number, number]>,
  segments: number,
  mod: (t: number, angle: number) => number,
): THREE.BufferGeometry {
  const geo = lathe(profile, segments);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const y0 = bb.min.y;
  const span = Math.max(1e-5, bb.max.y - y0);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = pos.getY(i);
    const ang = Math.atan2(z, x);
    const k = mod((y - y0) / span, ang);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Architecture
// ---------------------------------------------------------------------------

export type PillarStyle = 'plain' | 'fluted' | 'carved' | 'broken' | 'twisted' | 'gothic';

/**
 * A column with a plinth, shaft and capital. The profile is built first, then
 * the style modulates it: flutes cut vertical channels, carved adds banding,
 * broken truncates and rubbles the top, twisted spirals the whole shaft.
 */
export function pillar(
  radius: number,
  height: number,
  sides: number,
  rng: Rng,
  style: string = 'plain',
): THREE.BufferGeometry {
  const seg = Math.max(6, Math.floor(sides));
  const st = style as PillarStyle;
  const breakAt = st === 'broken' ? rng.range(0.42, 0.72) : 1;
  const top = height * breakAt;

  const R = radius;
  const profile: Array<[number, number]> = [];
  // Plinth
  profile.push([R * 1.34, 0]);
  profile.push([R * 1.34, height * 0.035]);
  profile.push([R * 1.2, height * 0.05]);
  profile.push([R * 1.14, height * 0.075]);
  // Torus base moulding
  profile.push([R * 1.2, height * 0.09]);
  profile.push([R * 1.06, height * 0.115]);
  // Shaft with entasis — real columns swell slightly, which is why they do not
  // look like pipes.
  const shaftTop = st === 'broken' ? breakAt : 0.86;
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = lerp(0.115, shaftTop, t);
    const swell = Math.sin(t * Math.PI * 0.85) * 0.045;
    profile.push([R * (1.0 + swell - t * 0.11), height * y]);
  }
  if (st === 'broken') {
    // A jagged snapped-off crown.
    profile.push([R * 0.86, top]);
    profile.push([R * 0.5, top + R * rng.range(0.1, 0.35)]);
    profile.push([0.0001, top + R * rng.range(0.15, 0.5)]);
  } else {
    // Capital
    profile.push([R * 0.98, height * 0.87]);
    profile.push([R * 1.16, height * 0.905]);
    profile.push([R * 1.1, height * 0.93]);
    profile.push([R * 1.34, height * 0.955]);
    profile.push([R * 1.34, height * 0.99]);
    profile.push([R * 1.2, height]);
    profile.push([0.0001, height]);
  }

  let geo: THREE.BufferGeometry;
  const flutes = Math.max(6, Math.round(seg / 2));
  switch (st) {
    case 'fluted':
      geo = latheModulated(profile, seg * 2, (t, a) => {
        const inShaft = smoothstep(0.1, 0.16, t) * (1 - smoothstep(0.82, 0.88, t));
        return 1 - inShaft * 0.055 * (0.5 + 0.5 * Math.cos(a * flutes));
      });
      break;
    case 'carved':
      geo = latheModulated(profile, seg * 2, (t, a) => {
        const band = Math.abs(Math.sin(t * Math.PI * 9));
        const ring = smoothstep(0.12, 0.2, t) * (1 - smoothstep(0.8, 0.86, t));
        return 1 + ring * 0.035 * band * (0.7 + 0.3 * Math.cos(a * 8));
      });
      break;
    case 'twisted':
      geo = latheModulated(profile, seg * 2, (t, a) => 1 - 0.05 * (0.5 + 0.5 * Math.cos(a * 6 + t * 9)));
      break;
    case 'gothic':
      // A cluster of engaged colonettes reads instantly as gothic.
      geo = latheModulated(profile, seg * 3, (t, a) => {
        const inShaft = smoothstep(0.08, 0.14, t) * (1 - smoothstep(0.84, 0.9, t));
        return 1 + inShaft * 0.09 * Math.pow(Math.abs(Math.cos(a * 4)), 3);
      });
      break;
    default:
      geo = lathe(profile, seg);
      break;
  }

  displace(geo, rng, radius * (st === 'broken' ? 0.075 : 0.03), 2.4 / Math.max(0.3, radius));
  return geo;
}

/**
 * A doorway: two jambs and a semicircular arch built from individual voussoir
 * blocks, plus a keystone. Centred on the origin, opening facing +Z.
 */
export function archway(width: number, height: number, thickness: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const jambW = Math.max(0.12, width * 0.16);
  const springLine = height - width * 0.5;
  const bevel = Math.min(jambW, thickness) * 0.12;

  // Jambs
  for (const s of [-1, 1]) {
    parts.push(
      transformed(beveledBox(jambW, springLine, thickness, bevel, 2), {
        pos: [s * (width * 0.5 + jambW * 0.5), springLine * 0.5, 0],
      }),
    );
  }

  // Voussoirs: wedge blocks around a semicircle.
  const inner = width * 0.5;
  const outer = inner + jambW;
  const count = 9;
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * Math.PI;
    const a1 = ((i + 1) / count) * Math.PI;
    const mid = (a0 + a1) * 0.5;
    const arc = (a1 - a0) * inner;
    const blockW = arc * 1.02;
    const blockH = outer - inner;
    const isKey = i === (count - 1) / 2;
    const g = beveledBox(blockW, blockH * (isKey ? 1.16 : 1), thickness, bevel, 1);
    const rMid = (inner + outer) * 0.5 + (isKey ? blockH * 0.08 : 0);
    parts.push(
      transformed(g, {
        pos: [Math.cos(mid) * rMid, springLine + Math.sin(mid) * rMid, 0],
        rot: [0, 0, mid - Math.PI * 0.5],
      }),
    );
  }

  // Impost blocks where the arch meets the jambs.
  for (const s of [-1, 1]) {
    parts.push(
      transformed(beveledBox(jambW * 1.5, jambW * 0.4, thickness * 1.12, bevel, 1), {
        pos: [s * (width * 0.5 + jambW * 0.5), springLine, 0],
      }),
    );
  }

  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}

/** A flight of steps, centred, rising along +Z. */
export function stairs(width: number, rise: number, run: number, count: number, bevel = 0.02): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const h = rise * (i + 1);
    parts.push(
      transformed(beveledBox(width, h, run, bevel, 1), {
        pos: [0, h * 0.5, (i + 0.5) * run - (count * run) * 0.5],
      }),
    );
  }
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}

// ---------------------------------------------------------------------------
// Shapes the model builders lean on
// ---------------------------------------------------------------------------

/**
 * A tapered, chamfered slab — limbs, blade tangs, straps, plate segments.
 * Built along +Y, centred at the origin.
 */
export function taperedBox(
  bottomW: number,
  bottomD: number,
  topW: number,
  topD: number,
  height: number,
  bevel = 0.02,
): THREE.BufferGeometry {
  const geo = beveledBox(Math.max(bottomW, topW), height, Math.max(bottomD, topD), bevel, 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const wMax = Math.max(bottomW, topW);
  const dMax = Math.max(bottomD, topD);
  for (let i = 0; i < pos.count; i++) {
    const t = clamp01(pos.getY(i) / height + 0.5);
    pos.setX(i, pos.getX(i) * (lerp(bottomW, topW, t) / wMax));
    pos.setZ(i, pos.getZ(i) * (lerp(bottomD, topD, t) / dMax));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * A blade: a lenticular cross-section that tapers to a point, with an optional
 * fuller (the blood groove) that catches a specular line down its length.
 */
export function blade(
  length: number,
  width: number,
  thickness: number,
  opts: { taper?: number; fuller?: number; curve?: number; tip?: number; edges?: number } = {},
): THREE.BufferGeometry {
  const rows = 14;
  const cols = Math.max(6, opts.edges ?? 8);
  const taperK = opts.taper ?? 0.55;
  const fuller = opts.fuller ?? 0;
  const curve = opts.curve ?? 0;
  const tipAt = opts.tip ?? 0.82;

  const pts: THREE.Vector3[][] = [];
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    // Width falls off gently, then hard at the point.
    const wide = t < tipAt ? lerp(1, taperK, t / tipAt) : lerp(taperK, 0.02, (t - tipAt) / (1 - tipAt));
    const thick = t < tipAt ? lerp(1, 0.62, t / tipAt) : lerp(0.62, 0.05, (t - tipAt) / (1 - tipAt));
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j < cols; j++) {
      const a = (j / cols) * Math.PI * 2;
      // Lenticular section: wide on X, thin on Z, with a flat-ish spine.
      const cx = Math.cos(a);
      const cz = Math.sin(a);
      const sharp = Math.pow(Math.abs(cx), 0.55) * Math.sign(cx);
      let zr = cz * thickness * 0.5 * thick;
      if (fuller > 0) {
        // A groove either side of the centreline.
        const g = Math.exp(-Math.pow((Math.abs(cx) - 0.32) / 0.22, 2));
        zr *= 1 - fuller * g * smoothstep(0.02, 0.2, t) * (1 - smoothstep(tipAt - 0.1, tipAt + 0.05, t));
      }
      ring.push(new THREE.Vector3(sharp * width * 0.5 * wide, t * length + curve * Math.sin(t * Math.PI) * length * 0.06, zr));
    }
    pts.push(ring);
  }

  const g = new GeoBuilder();
  g.uvScale = 0.5;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < cols; j++) {
      const j2 = (j + 1) % cols;
      g.quad(pts[i][j], pts[i + 1][j], pts[i + 1][j2], pts[i][j2]);
    }
  }
  // Cap the base.
  const centre = new THREE.Vector3(0, 0, 0);
  const down = new THREE.Vector3(0, -1, 0);
  for (let j = 0; j < cols; j++) {
    const j2 = (j + 1) % cols;
    g.tri(centre, pts[0][j], pts[0][j2], down);
  }
  return g.build();
}

/** A spike / fang / horn: a tapered cone with a slight curve and facets. */
export function spike(length: number, radius: number, sides = 6, curve = 0.2): THREE.BufferGeometry {
  const rows = 8;
  const pts: THREE.Vector3[][] = [];
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const r = radius * Math.pow(1 - t, 0.8);
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      ring.push(new THREE.Vector3(Math.cos(a) * r + curve * t * t * length * 0.5, t * length, Math.sin(a) * r));
    }
    pts.push(ring);
  }
  const g = new GeoBuilder();
  g.uvScale = 0.4;
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const j2 = (j + 1) % sides;
      g.quad(pts[i][j], pts[i + 1][j], pts[i + 1][j2], pts[i][j2]);
    }
  }
  const base = new THREE.Vector3(0, 0, 0);
  const down = new THREE.Vector3(0, -1, 0);
  for (let j = 0; j < sides; j++) g.tri(base, pts[0][j], pts[0][(j + 1) % sides], down);
  return g.build();
}

/**
 * A faceted gemstone: a table, a crown of facets and a pointed pavilion.
 * Flat-shaded so every facet catches its own highlight.
 */
export function gem(radius: number, sides = 8, tableRatio = 0.55): THREE.BufferGeometry {
  const g = new GeoBuilder();
  g.uvScale = 0.2;
  const crownY = radius * 0.42;
  const girdleY = radius * 0.1;
  const tipY = -radius * 1.15;
  const table: THREE.Vector3[] = [];
  const crown: THREE.Vector3[] = [];
  const girdle: THREE.Vector3[] = [];
  for (let j = 0; j < sides; j++) {
    const a = (j / sides) * Math.PI * 2;
    const a2 = ((j + 0.5) / sides) * Math.PI * 2;
    table.push(new THREE.Vector3(Math.cos(a) * radius * tableRatio, crownY, Math.sin(a) * radius * tableRatio));
    crown.push(new THREE.Vector3(Math.cos(a2) * radius * 0.86, girdleY + radius * 0.14, Math.sin(a2) * radius * 0.86));
    girdle.push(new THREE.Vector3(Math.cos(a) * radius, girdleY, Math.sin(a) * radius));
  }
  const centreTop = new THREE.Vector3(0, crownY, 0);
  const tip = new THREE.Vector3(0, tipY, 0);
  const up = new THREE.Vector3(0, 1, 0);
  for (let j = 0; j < sides; j++) {
    const j2 = (j + 1) % sides;
    g.tri(centreTop, table[j], table[j2], up);
    g.quad(table[j], girdle[j], crown[j], table[j2]);
    g.quad(table[j2], crown[j], girdle[j2], table[j2]);
    g.tri(girdle[j], tip, girdle[j2]);
  }
  return g.build();
}

/**
 * A curved shell — shields, pauldrons, breastplates, helm domes. `curve` is how
 * far the centre bulges toward +Z.
 */
export function shell(
  width: number,
  height: number,
  curve: number,
  segsX = 8,
  segsY = 10,
  thickness = 0.03,
  shape: (u: number, v: number) => number = () => 1,
): THREE.BufferGeometry {
  const front: THREE.Vector3[][] = [];
  const back: THREE.Vector3[][] = [];
  for (let j = 0; j <= segsY; j++) {
    const v = j / segsY;
    const rowF: THREE.Vector3[] = [];
    const rowB: THREE.Vector3[] = [];
    for (let i = 0; i <= segsX; i++) {
      const u = i / segsX;
      const k = clamp01(shape(u, v));
      const x = (u - 0.5) * width * k;
      const y = (v - 0.5) * height;
      const bulge = Math.cos((u - 0.5) * Math.PI) * Math.cos((v - 0.5) * Math.PI * 0.8) * curve;
      rowF.push(new THREE.Vector3(x, y, bulge + thickness * 0.5));
      rowB.push(new THREE.Vector3(x, y, bulge - thickness * 0.5));
    }
    front.push(rowF);
    back.push(rowB);
  }
  const g = new GeoBuilder();
  g.uvScale = 0.6;
  const outF = new THREE.Vector3(0, 0, 1);
  const outB = new THREE.Vector3(0, 0, -1);
  for (let j = 0; j < segsY; j++) {
    for (let i = 0; i < segsX; i++) {
      g.quad(front[j][i], front[j][i + 1], front[j + 1][i + 1], front[j + 1][i], outF);
      g.quad(back[j][i], back[j][i + 1], back[j + 1][i + 1], back[j + 1][i], outB);
    }
  }
  // Rim
  for (let j = 0; j < segsY; j++) {
    g.quad(front[j][0], back[j][0], back[j + 1][0], front[j + 1][0]);
    g.quad(front[j][segsX], back[j][segsX], back[j + 1][segsX], front[j + 1][segsX]);
  }
  for (let i = 0; i < segsX; i++) {
    g.quad(front[0][i], back[0][i], back[0][i + 1], front[0][i + 1]);
    g.quad(front[segsY][i], back[segsY][i], back[segsY][i + 1], front[segsY][i + 1]);
  }
  return g.build();
}

/**
 * A hanging cloth panel with a wind ripple baked in — capes, tabards, banners,
 * robes. Rippled at build time so it reads as fabric even standing still.
 */
export function clothPanel(
  width: number,
  height: number,
  rng: Rng,
  opts: { segsX?: number; segsY?: number; ripple?: number; flare?: number; tatter?: number } = {},
): THREE.BufferGeometry {
  const sx = opts.segsX ?? 8;
  const sy = opts.segsY ?? 12;
  const ripple = opts.ripple ?? 0.06;
  const flare = opts.flare ?? 0.25;
  const tatter = opts.tatter ?? 0;
  const noise = new Noise(Math.floor(rng.next() * 0xffffffff));
  const phase = rng.range(0, 10);

  const grid: THREE.Vector3[][] = [];
  for (let j = 0; j <= sy; j++) {
    const v = j / sy;
    const row: THREE.Vector3[] = [];
    const hem = tatter > 0 ? 1 - tatter * clamp01(noise.fbm(v * 3 + phase, 5.5, 3) * 0.5 + 0.5) * smoothstep(0.6, 1, v) : 1;
    for (let i = 0; i <= sx; i++) {
      const u = i / sx;
      const w = width * (1 + flare * v) * 0.5;
      const x = (u - 0.5) * 2 * w;
      const y = -v * height * hem;
      // Standing waves down the drape, deeper toward the hem.
      const z =
        Math.sin(u * Math.PI * 3 + phase) * ripple * height * v +
        noise.fbm(u * 2.5 + phase, v * 3, 3) * ripple * height * 0.7 * v;
      row.push(new THREE.Vector3(x, y, z));
    }
    grid.push(row);
  }

  const g = new GeoBuilder();
  g.uvScale = 0.7;
  for (let j = 0; j < sy; j++) {
    for (let i = 0; i < sx; i++) {
      g.quad(grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]);
      // Back faces so the cloth is solid from both sides without needing
      // DoubleSide (which breaks shadow rendering).
      g.quad(grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]);
    }
  }
  return g.build();
}

/**
 * A chamfered ring — finger rings, belt buckles, sword collars, shield bosses.
 */
export function ring(radius: number, tube: number, radialSegments = 20, tubularSegments = 8): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(radius, tube, tubularSegments, radialSegments);
  normalizeGeometry(geo);
  return geo;
}

/** A capsule limb segment, subtly tapered so it never reads as a stock capsule. */
export function limb(length: number, rTop: number, rBottom: number, segments = 8): THREE.BufferGeometry {
  const profile: Array<[number, number]> = [];
  const rows = 9;
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    // Muscle belly: fattest around a third of the way up.
    const belly = Math.sin(t * Math.PI) * 0.13;
    profile.push([lerp(rBottom, rTop, t) * (1 + belly), t * length]);
  }
  // Round the ends instead of leaving open tubes.
  profile.unshift([rBottom * 0.42, -rBottom * 0.28]);
  profile.unshift([0.0001, -rBottom * 0.42]);
  profile.push([rTop * 0.42, length + rTop * 0.28]);
  profile.push([0.0001, length + rTop * 0.42]);
  return lathe(profile, segments);
}

/** A dome / hemisphere, optionally squashed — helms, skulls, boss cores. */
export function dome(radius: number, squash = 1, segments = 16, rows = 8): THREE.BufferGeometry {
  const profile: Array<[number, number]> = [];
  for (let i = 0; i <= rows; i++) {
    const a = (i / rows) * Math.PI * 0.5;
    profile.push([Math.cos(a) * radius, Math.sin(a) * radius * squash]);
  }
  profile[rows] = [0.0001, radius * squash];
  profile.unshift([radius * 0.999, -radius * 0.02]);
  return lathe(profile, segments);
}

/** A hollow tube — hafts, staves, quivers, torch bodies. */
export function shaft(length: number, radius: number, segments = 10, taperTop = 0.85): THREE.BufferGeometry {
  const profile: Array<[number, number]> = [
    [0.0001, 0],
    [radius * 0.9, 0],
    [radius, length * 0.06],
    [radius * lerp(1, taperTop, 0.5), length * 0.5],
    [radius * taperTop, length * 0.94],
    [radius * taperTop * 0.9, length],
    [0.0001, length],
  ];
  return lathe(profile, segments);
}
