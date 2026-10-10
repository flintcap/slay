/**
 * SLAY — signed distance fields for bodies.
 *
 * A body is a list of primitives (ellipsoids and tapered capsules), each in a
 * named group, blended with polynomial smooth unions. Groups are what the
 * skinning reads: every vertex knows which part of the body it came from.
 *
 * Evaluation is a tight loop over flat arrays, because a body is sampled a few
 * hundred thousand times while it is meshed.
 */
import * as THREE from 'three';

/** Profiling counters. */
export const EVALS = { calls: 0, prims: 0 };

export const enum PrimKind {
  Ellipsoid = 0,
  Cone = 1,
  Box = 2,
}

export interface Prim {
  kind: PrimKind;
  group: number;
  /** Smooth-union radius against what came before, metres. */
  k: number;
  /** Subtracts instead of adding (smoothly, by k). */
  sub?: boolean;
  /** Ellipsoid / box: centre. Cone: start point. */
  a: THREE.Vector3;
  /** Cone: end point. */
  b?: THREE.Vector3;
  /** Ellipsoid / box: radii (box half extents). Cone: x = start radius, y = end radius. */
  r: THREE.Vector3;
  /** Ellipsoid / box orientation (world to local is the inverse). */
  q?: THREE.Quaternion;
  /** Box corner rounding. */
  round?: number;
  /**
   * The union with earlier primitives only blends within this distance of
   * `blendAt`. Keeps two thighs from webbing together at the knee while they
   * still flow into the pelvis at the top.
   */
  blendAt?: THREE.Vector3;
  blendR?: number;
}

/** A compiled field: flat arrays for the hot loop. */
export class Field {
  readonly n: number;
  private kind: Int8Array;
  private group: Int16Array;
  private k: Float32Array;
  private sub: Int8Array;
  /** Per prim: a(3) b(3) r(3) inverse rotation matrix(9) blendAt(3) blendR(1) round(1) */
  private d: Float32Array;
  /** Bounding boxes per prim, for culling: min(3) max(3). */
  readonly box: Float32Array;
  static readonly STRIDE = 23;

  constructor(readonly prims: Prim[]) {
    const n = prims.length;
    this.n = n;
    this.kind = new Int8Array(n);
    this.group = new Int16Array(n);
    this.k = new Float32Array(n);
    this.sub = new Int8Array(n);
    this.d = new Float32Array(n * Field.STRIDE);
    this.box = new Float32Array(n * 6);
    const m = new THREE.Matrix3();
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const p = prims[i];
      this.kind[i] = p.kind;
      this.group[i] = p.group;
      this.k[i] = p.k;
      this.sub[i] = p.sub ? 1 : 0;
      const o = i * Field.STRIDE;
      const d = this.d;
      d[o] = p.a.x;
      d[o + 1] = p.a.y;
      d[o + 2] = p.a.z;
      const b = p.b ?? p.a;
      d[o + 3] = b.x;
      d[o + 4] = b.y;
      d[o + 5] = b.z;
      d[o + 6] = p.r.x;
      d[o + 7] = p.r.y;
      d[o + 8] = p.r.z;
      m4.makeRotationFromQuaternion(p.q ?? new THREE.Quaternion());
      m.setFromMatrix4(m4).transpose();
      const e = m.elements;
      for (let t = 0; t < 9; t++) d[o + 9 + t] = e[t];
      const ba = p.blendAt;
      d[o + 18] = ba ? ba.x : 0;
      d[o + 19] = ba ? ba.y : 0;
      d[o + 20] = ba ? ba.z : 0;
      d[o + 21] = ba ? (p.blendR ?? 0.1) : -1;
      d[o + 22] = p.round ?? 0;
      // Conservative bounds: the largest radius around the shape plus its blend.
      const pad = p.k + 0.002;
      const bx = this.box;
      if (p.kind === PrimKind.Cone) {
        const rr = Math.max(p.r.x, p.r.y) + pad;
        bx[i * 6] = Math.min(p.a.x, b.x) - rr;
        bx[i * 6 + 1] = Math.min(p.a.y, b.y) - rr;
        bx[i * 6 + 2] = Math.min(p.a.z, b.z) - rr;
        bx[i * 6 + 3] = Math.max(p.a.x, b.x) + rr;
        bx[i * 6 + 4] = Math.max(p.a.y, b.y) + rr;
        bx[i * 6 + 5] = Math.max(p.a.z, b.z) + rr;
      } else {
        const rr = Math.max(p.r.x, p.r.y, p.r.z) * (p.kind === PrimKind.Box ? 1.75 : 1) + pad;
        bx[i * 6] = p.a.x - rr;
        bx[i * 6 + 1] = p.a.y - rr;
        bx[i * 6 + 2] = p.a.z - rr;
        bx[i * 6 + 3] = p.a.x + rr;
        bx[i * 6 + 4] = p.a.y + rr;
        bx[i * 6 + 5] = p.a.z + rr;
      }
    }
  }

  /** The whole field's bounds. */
  bounds(): THREE.Box3 {
    const b = new THREE.Box3();
    for (let i = 0; i < this.n; i++) {
      if (this.sub[i]) continue;
      b.expandByPoint(new THREE.Vector3(this.box[i * 6], this.box[i * 6 + 1], this.box[i * 6 + 2]));
      b.expandByPoint(new THREE.Vector3(this.box[i * 6 + 3], this.box[i * 6 + 4], this.box[i * 6 + 5]));
    }
    return b;
  }

  /** A field of the primitives that pass a test. */
  select(keep: (p: Prim) => boolean): Field {
    return new Field(this.prims.filter(keep));
  }

  /** A field holding only the primitives that can touch a box. */
  cull(box: THREE.Box3, margin = 0.02): Field {
    const keep: Prim[] = [];
    for (let i = 0; i < this.n; i++) {
      const bx = this.box;
      if (
        bx[i * 6 + 3] < box.min.x - margin ||
        bx[i * 6 + 4] < box.min.y - margin ||
        bx[i * 6 + 5] < box.min.z - margin ||
        bx[i * 6] > box.max.x + margin ||
        bx[i * 6 + 1] > box.max.y + margin ||
        bx[i * 6 + 2] > box.max.z + margin
      )
        continue;
      keep.push(this.prims[i]);
    }
    return new Field(keep);
  }

  /** Distance of one primitive. */
  private prim(i: number, x: number, y: number, z: number): number {
    const d = this.d;
    const o = i * Field.STRIDE;
    const kind = this.kind[i];
    if (kind === PrimKind.Cone) {
      return roundCone(x, y, z, d[o], d[o + 1], d[o + 2], d[o + 3], d[o + 4], d[o + 5], d[o + 6], d[o + 7]);
    }
    // To local space.
    const px = x - d[o];
    const py = y - d[o + 1];
    const pz = z - d[o + 2];
    const lx = d[o + 9] * px + d[o + 12] * py + d[o + 15] * pz;
    const ly = d[o + 10] * px + d[o + 13] * py + d[o + 16] * pz;
    const lz = d[o + 11] * px + d[o + 14] * py + d[o + 17] * pz;
    if (kind === PrimKind.Box) {
      const rr = d[o + 22];
      const qx = Math.abs(lx) - d[o + 6] + rr;
      const qy = Math.abs(ly) - d[o + 7] + rr;
      const qz = Math.abs(lz) - d[o + 8] + rr;
      const mx = Math.max(qx, 0);
      const my = Math.max(qy, 0);
      const mz = Math.max(qz, 0);
      return Math.sqrt(mx * mx + my * my + mz * mz) + Math.min(Math.max(qx, qy, qz), 0) - rr;
    }
    // Ellipsoid, the gradient-corrected bound (Quilez).
    const rx = d[o + 6];
    const ry = d[o + 7];
    const rz = d[o + 8];
    const ax = lx / rx;
    const ay = ly / ry;
    const az = lz / rz;
    const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
    const bx = lx / (rx * rx);
    const by = ly / (ry * ry);
    const bz = lz / (rz * rz);
    const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
    if (k1 < 1e-9) return -Math.min(rx, ry, rz);
    return (k0 * (k0 - 1)) / k1;
  }

  /** Signed distance at a point. */
  eval(x: number, y: number, z: number): number {
    return this.evalList(this.all, this.n, x, y, z);
  }

  private _all: Int32Array | null = null;
  private get all(): Int32Array {
    if (!this._all) {
      this._all = new Int32Array(this.n);
      for (let i = 0; i < this.n; i++) this._all[i] = i;
    }
    return this._all;
  }

  /** Indices of the primitives whose bounds touch a box (in field order). */
  listIn(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Int32Array {
    const out: number[] = [];
    const bx = this.box;
    for (let i = 0; i < this.n; i++) {
      if (bx[i * 6 + 3] < x0 || bx[i * 6 + 4] < y0 || bx[i * 6 + 5] < z0 || bx[i * 6] > x1 || bx[i * 6 + 1] > y1 || bx[i * 6 + 2] > z1) continue;
      out.push(i);
    }
    return Int32Array.from(out);
  }

  /**
   * Distance using only the listed primitives. Exact wherever the point lies
   * inside the box the list was made for; outside it the sign is still right.
   */
  evalList(list: Int32Array, len: number, x: number, y: number, z: number): number {
    EVALS.calls++;
    EVALS.prims += len;
    let f = 1e9;
    const d = this.d;
    for (let n = 0; n < len; n++) {
      const i = list[n];
      const v = this.prim(i, x, y, z);
      let k = this.k[i];
      const o = i * Field.STRIDE;
      const br = d[o + 21];
      if (br > 0 && k > 0) {
        const dx = x - d[o + 18];
        const dy = y - d[o + 19];
        const dz = z - d[o + 20];
        const t = Math.sqrt(dx * dx + dy * dy + dz * dz) / br;
        k *= t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
      }
      if (this.sub[i]) f = smax(f, -v, k);
      else f = smin(f, v, k);
    }
    return f;
  }

  /**
   * Which group owns a point: the group of the primitive nearest it, with the
   * distances per group written into `out` (one slot per group id, 1e9 when
   * the group has nothing here).
   */
  groups(x: number, y: number, z: number, out: Float32Array): void {
    out.fill(1e9);
    for (let i = 0; i < this.n; i++) {
      if (this.sub[i]) continue;
      const g = this.group[i];
      const v = this.prim(i, x, y, z);
      // Within a group, the same smooth union the surface uses.
      out[g] = smin(out[g], v, this.k[i]);
    }
  }

  /** Gradient by central differences. */
  grad(x: number, y: number, z: number, e: number, out: THREE.Vector3): THREE.Vector3 {
    out.set(
      this.eval(x + e, y, z) - this.eval(x - e, y, z),
      this.eval(x, y + e, z) - this.eval(x, y - e, z),
      this.eval(x, y, z + e) - this.eval(x, y, z - e),
    );
    const l = out.length();
    return l > 1e-12 ? out.multiplyScalar(1 / l) : out.set(0, 1, 0);
  }
}

/** Polynomial smooth minimum. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

export function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/** Exact distance to a capsule whose radius tapers from r1 at A to r2 at B (Quilez). */
export function roundCone(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r1: number, r2: number,
): number {
  const bax = bx - ax;
  const bay = by - ay;
  const baz = bz - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - ax;
  const pay = py - ay;
  const paz = pz - az;
  const y = pax * bax + pay * bay + paz * baz;
  const z = y - l2;
  const xx = pax * l2 - bax * y;
  const xy = pay * l2 - bay * y;
  const xz = paz * l2 - baz * y;
  const x2 = xx * xx + xy * xy + xz * xz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

// ---------------------------------------------------------------------------
// Builder helpers
// ---------------------------------------------------------------------------

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A quaternion from Euler angles (XYZ), radians. */
export function rot(x: number, y = 0, z = 0): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
}

/** A quaternion turning +Y onto a direction. */
export function alongY(dir: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
}

export class FieldBuilder {
  readonly prims: Prim[] = [];
  group = 0;

  ellipsoid(c: THREE.Vector3, r: THREE.Vector3, k: number, q?: THREE.Quaternion, extra: Partial<Prim> = {}): this {
    this.prims.push({ kind: PrimKind.Ellipsoid, group: this.group, k, a: c.clone(), r: r.clone(), q, ...extra });
    return this;
  }

  cone(a: THREE.Vector3, b: THREE.Vector3, r1: number, r2: number, k: number, extra: Partial<Prim> = {}): this {
    this.prims.push({ kind: PrimKind.Cone, group: this.group, k, a: a.clone(), b: b.clone(), r: V(r1, r2, 0), ...extra });
    return this;
  }

  box(c: THREE.Vector3, half: THREE.Vector3, round: number, k: number, q?: THREE.Quaternion, extra: Partial<Prim> = {}): this {
    this.prims.push({ kind: PrimKind.Box, group: this.group, k, a: c.clone(), r: half.clone(), q, round, ...extra });
    return this;
  }

  /** Mirror every primitive added since `from` across x = 0, into another group. */
  mirror(from: number, group: number): this {
    const end = this.prims.length;
    const flip = (v: THREE.Vector3) => V(-v.x, v.y, v.z);
    for (let i = from; i < end; i++) {
      const p = this.prims[i];
      let q: THREE.Quaternion | undefined;
      if (p.q) {
        // Reflect the rotation across the YZ plane: (x, y, z, w) -> (x, -y, -z, w).
        q = new THREE.Quaternion(p.q.x, -p.q.y, -p.q.z, p.q.w);
      }
      this.prims.push({
        ...p,
        group,
        a: flip(p.a),
        b: p.b ? flip(p.b) : undefined,
        q,
        blendAt: p.blendAt ? flip(p.blendAt) : undefined,
      });
    }
    return this;
  }

  build(): Field {
    return new Field(this.prims);
  }
}
