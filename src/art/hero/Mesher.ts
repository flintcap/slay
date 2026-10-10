/**
 * SLAY — turning a distance field into a mesh.
 *
 * Sparse surface nets: the domain is split into blocks of cells, and only the
 * blocks the surface passes through are ever sampled. Each cell the surface
 * crosses gets one vertex, placed at the mean of its edge crossings and then
 * pulled onto the surface along the gradient; each crossed edge gets a quad.
 * The result is a closed, well-shaped mesh with no seams between blocks.
 */
import * as THREE from 'three';
import type { Field } from './Sdf';

const B = 8; // cells per block side
const NC = B + 1; // corners per block side

export interface Clip {
  /** Plane normal pointing *out* of the kept region. */
  n: THREE.Vector3;
  /** Keeps points with dot(n, p) <= d. */
  d: number;
  /** Only cuts inside this sphere (centre xyz, radius), so a cut at a wrist leaves the thigh alone. */
  within?: [number, number, number, number];
}

/** Growth of the surface: a constant, or one that varies over space. */
export type Inflate = number | ((x: number, y: number, z: number) => number);

/**
 * Inflation that ramps across a plane: `inside` metres behind it (where the
 * detail mesh tucks under the body), `outside` metres beyond it (where the
 * detail mesh stands a hair proud), blended over `band` metres either side.
 */
export function rampInflate(n: THREE.Vector3, d: number, inside: number, outside: number, band: number): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    const t = (n.x * x + n.y * y + n.z * z - d) / band;
    const k = t <= -1 ? 0 : t >= 1 ? 1 : (t + 1) * 0.5;
    const s = k * k * (3 - 2 * k);
    return inside + (outside - inside) * s;
  };
}

/** The field with its cuts and inflation applied. */
export function clippedField(field: Field, clips: Clip[], inflate: Inflate): (x: number, y: number, z: number) => number {
  const g = listedField(field, clips, inflate);
  const all = field.listIn(-1e9, -1e9, -1e9, 1e9, 1e9, 1e9);
  return (x, y, z) => g(all, x, y, z);
}

/** As `clippedField`, evaluating only a list of primitives. */
export function listedField(field: Field, clips: Clip[], inflate: Inflate): (list: Int32Array, x: number, y: number, z: number) => number {
  return (list, x, y, z) => {
    let v = field.evalList(list, list.length, x, y, z) - (typeof inflate === 'number' ? inflate : inflate(x, y, z));
    for (const cl of clips) {
      if (cl.within) {
        const [cx, cy, cz, r] = cl.within;
        const dx = x - cx;
        const dy = y - cy;
        const dz = z - cz;
        if (dx * dx + dy * dy + dz * dz > r * r) continue;
      }
      const pv = cl.n.x * x + cl.n.y * y + cl.n.z * z - cl.d;
      if (pv > v) v = pv;
    }
    return v;
  };
}

export interface MeshOpts {
  /** Cell size, metres. */
  cell: number;
  /** Domain. Defaults to the field's bounds. */
  box?: THREE.Box3;
  /** Half-spaces the mesh is cut to; each cut is capped. */
  clips?: Clip[];
  /** Grows the surface outward, metres. */
  inflate?: Inflate;
  /** Newton steps that pull vertices onto the surface. */
  project?: number;
}

export interface RawMesh {
  pos: Float32Array;
  index: Uint32Array;
}

export function meshField(field: Field, opts: MeshOpts): RawMesh {
  const c = opts.cell;
  const box = (opts.box ?? field.bounds()).clone().expandByScalar(c * 2);
  const clips = opts.clips ?? [];
  const inflate = opts.inflate ?? 0;
  const fl = listedField(field, clips, inflate);

  const ox = box.min.x;
  const oy = box.min.y;
  const oz = box.min.z;
  const nx = Math.ceil((box.max.x - ox) / c);
  const ny = Math.ceil((box.max.y - oy) / c);
  const nz = Math.ceil((box.max.z - oz) / c);
  const bx = Math.ceil(nx / B);
  const by = Math.ceil(ny / B);
  const bz = Math.ceil(nz / B);

  // --- Find the blocks the surface passes through.
  const blocks = new Map<number, Float32Array>();
  const queued = new Set<number>();
  const queue: number[] = [];
  const half = c * B * 0.5;
  const reach = half * Math.sqrt(3) * 1.6 + c;
  // Each block evaluates only the primitives that can reach it.
  const lists = new Map<number, Int32Array>();
  const listFor = (id: number): Int32Array => {
    let l = lists.get(id);
    if (!l) {
      const i = id % bx;
      const j = Math.floor(id / bx) % by;
      const k = Math.floor(id / (bx * by));
      const x0 = ox + i * B * c;
      const y0 = oy + j * B * c;
      const z0 = oz + k * B * c;
      const m = reach;
      l = field.listIn(x0 - m, y0 - m, z0 - m, x0 + B * c + m, y0 + B * c + m, z0 + B * c + m);
      lists.set(id, l);
    }
    return l;
  };
  for (let k = 0; k < bz; k++)
    for (let j = 0; j < by; j++)
      for (let i = 0; i < bx; i++) {
        const id0 = i + bx * (j + by * k);
        const l0 = listFor(id0);
        if (l0.length === 0) {
          lists.delete(id0);
          continue;
        }
        const v = fl(l0, ox + (i * B + B * 0.5) * c, oy + (j * B + B * 0.5) * c, oz + (k * B + B * 0.5) * c);
        if (Math.abs(v) < reach) {
          const id = i + bx * (j + by * k);
          queued.add(id);
          queue.push(id);
        }
      }

  // Two levels: every other corner first, then exact samples only in the
  // coarse cells the surface can pass through. The rest is interpolated,
  // which is safe because there the sign cannot change.
  const need = new Uint8Array(NC * NC * NC);
  const safe = 2 * c * Math.sqrt(3) * 1.35;
  const sampleBlock = (id: number): Float32Array => {
    const i = id % bx;
    const j = Math.floor(id / bx) % by;
    const k = Math.floor(id / (bx * by));
    const a = new Float32Array(NC * NC * NC);
    const l = listFor(id);
    const X = (u: number) => ox + (i * B + u) * c;
    const Y = (v: number) => oy + (j * B + v) * c;
    const Z = (w: number) => oz + (k * B + w) * c;
    const I = (u: number, v: number, w: number) => u + NC * (v + NC * w);
    for (let w = 0; w < NC; w += 2) for (let v = 0; v < NC; v += 2) for (let u = 0; u < NC; u += 2) a[I(u, v, w)] = fl(l, X(u), Y(v), Z(w));
    need.fill(0);
    for (let w = 0; w < B; w += 2)
      for (let v = 0; v < B; v += 2)
        for (let u = 0; u < B; u += 2) {
          let lo = Infinity;
          let neg = false;
          let pos = false;
          for (let t = 0; t < 8; t++) {
            const val = a[I(u + (t & 1) * 2, v + ((t >> 1) & 1) * 2, w + ((t >> 2) & 1) * 2)];
            if (Math.abs(val) < lo) lo = Math.abs(val);
            if (val < 0) neg = true;
            else pos = true;
          }
          if (neg && pos) lo = 0;
          if (lo > safe) continue;
          for (let dw = 0; dw <= 2; dw++) for (let dv = 0; dv <= 2; dv++) for (let du = 0; du <= 2; du++) need[I(u + du, v + dv, w + dw)] = 1;
        }
    for (let w = 0; w < NC; w++)
      for (let v = 0; v < NC; v++)
        for (let u = 0; u < NC; u++) {
          if (!(u & 1) && !(v & 1) && !(w & 1)) continue;
          const t = I(u, v, w);
          if (need[t]) {
            a[t] = fl(l, X(u), Y(v), Z(w));
            continue;
          }
          // Trilinear from the coarse cell.
          const cu = Math.min(B - 2, u & ~1);
          const cv = Math.min(B - 2, v & ~1);
          const cw = Math.min(B - 2, w & ~1);
          const fu = (u - cu) * 0.5;
          const fv = (v - cv) * 0.5;
          const fw = (w - cw) * 0.5;
          const c000 = a[I(cu, cv, cw)], c100 = a[I(cu + 2, cv, cw)], c010 = a[I(cu, cv + 2, cw)], c110 = a[I(cu + 2, cv + 2, cw)];
          const c001 = a[I(cu, cv, cw + 2)], c101 = a[I(cu + 2, cv, cw + 2)], c011 = a[I(cu, cv + 2, cw + 2)], c111 = a[I(cu + 2, cv + 2, cw + 2)];
          const x00 = c000 + (c100 - c000) * fu;
          const x10 = c010 + (c110 - c010) * fu;
          const x01 = c001 + (c101 - c001) * fu;
          const x11 = c011 + (c111 - c011) * fu;
          const y0 = x00 + (x10 - x00) * fv;
          const y1 = x01 + (x11 - x01) * fv;
          a[t] = y0 + (y1 - y0) * fw;
        }
    return a;
  };

  const enqueue = (i: number, j: number, k: number) => {
    if (i < 0 || j < 0 || k < 0 || i >= bx || j >= by || k >= bz) return;
    const id = i + bx * (j + by * k);
    if (queued.has(id)) return;
    queued.add(id);
    queue.push(id);
  };

  // Sample queued blocks; a block with a crossing on a face wakes its neighbour.
  while (queue.length) {
    const id = queue.pop()!;
    const a = sampleBlock(id);
    let any = false;
    let lo = false;
    let hi = false;
    for (let t = 0; t < a.length; t++) {
      if (a[t] < 0) lo = true;
      else hi = true;
      if (lo && hi) {
        any = true;
        break;
      }
    }
    if (!any) continue;
    blocks.set(id, a);
    const i = id % bx;
    const j = Math.floor(id / bx) % by;
    const k = Math.floor(id / (bx * by));
    // Faces: check sign changes on each face plane.
    const faceHas = (axis: number, at: number): boolean => {
      let l = false;
      let h = false;
      for (let p = 0; p < NC; p++)
        for (let q = 0; q < NC; q++) {
          const idx = axis === 0 ? at + NC * (p + NC * q) : axis === 1 ? p + NC * (at + NC * q) : p + NC * (q + NC * at);
          if (a[idx] < 0) l = true;
          else h = true;
          if (l && h) return true;
        }
      return false;
    };
    if (faceHas(0, 0)) enqueue(i - 1, j, k);
    if (faceHas(0, B)) enqueue(i + 1, j, k);
    if (faceHas(1, 0)) enqueue(i, j - 1, k);
    if (faceHas(1, B)) enqueue(i, j + 1, k);
    if (faceHas(2, 0)) enqueue(i, j, k - 1);
    if (faceHas(2, B)) enqueue(i, j, k + 1);
    // Diagonal neighbours can share an edge crossing; wake them too.
    for (let dk = -1; dk <= 1; dk++)
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (Math.abs(di) + Math.abs(dj) + Math.abs(dk) < 2) continue;
          // Only when the shared corner region has a crossing; cheap test on the edge line.
          const u0 = di < 0 ? 0 : di > 0 ? B : -1;
          const v0 = dj < 0 ? 0 : dj > 0 ? B : -1;
          const w0 = dk < 0 ? 0 : dk > 0 ? B : -1;
          let l = false;
          let h = false;
          for (let s = 0; s < NC; s++) {
            const uu = u0 < 0 ? s : u0;
            const vv = v0 < 0 ? s : v0;
            const ww = w0 < 0 ? s : w0;
            if (a[uu + NC * (vv + NC * ww)] < 0) l = true;
            else h = true;
            if (u0 >= 0 && v0 >= 0 && w0 >= 0) break;
          }
          if (l && h) enqueue(i + di, j + dj, k + dk);
          else if (u0 >= 0 && v0 >= 0 && w0 >= 0) {
            // A corner: wake if it is near zero.
            if (Math.abs(a[u0 + NC * (v0 + NC * w0)]) < c * 1.5) enqueue(i + di, j + dj, k + dk);
          }
        }
  }

  // --- One vertex per crossed cell.
  const cellVert = new Map<number, number>();
  const pos: number[] = [];
  const vblock: number[] = [];
  const vgrad: number[] = [];
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const corner = new Float32Array(8);
  const cx = [0, 1, 0, 1, 0, 1, 0, 1];
  const cy = [0, 0, 1, 1, 0, 0, 1, 1];
  const cz = [0, 0, 0, 0, 1, 1, 1, 1];
  for (const [id, a] of blocks) {
    const bi = id % bx;
    const bj = Math.floor(id / bx) % by;
    const bk = Math.floor(id / (bx * by));
    for (let w = 0; w < B; w++)
      for (let v = 0; v < B; v++)
        for (let u = 0; u < B; u++) {
          let mask = 0;
          for (let t = 0; t < 8; t++) {
            const val = a[u + cx[t] + NC * (v + cy[t] + NC * (w + cz[t]))];
            corner[t] = val;
            if (val < 0) mask |= 1 << t;
          }
          if (mask === 0 || mask === 255) continue;
          let sx = 0;
          let sy = 0;
          let sz = 0;
          let n = 0;
          for (const [e0, e1] of EDGES) {
            const a0 = corner[e0];
            const a1 = corner[e1];
            if (a0 < 0 === a1 < 0) continue;
            const t = a0 / (a0 - a1);
            sx += cx[e0] + (cx[e1] - cx[e0]) * t;
            sy += cy[e0] + (cy[e1] - cy[e0]) * t;
            sz += cz[e0] + (cz[e1] - cz[e0]) * t;
            n++;
          }
          const gi = bi * B + u;
          const gj = bj * B + v;
          const gk = bk * B + w;
          cellVert.set(gi + nx * (gj + ny * gk), pos.length / 3);
          vblock.push(id);
          {
            // Trilinear gradient at the vertex, per metre.
            const fu = sx / n, fv = sy / n, fw = sz / n;
            const [c0, c1, c2, c3, c4, c5, c6, c7] = corner;
            const gxv = ((c1 - c0) * (1 - fv) + (c3 - c2) * fv) * (1 - fw) + ((c5 - c4) * (1 - fv) + (c7 - c6) * fv) * fw;
            const gyv = ((c2 - c0) * (1 - fu) + (c3 - c1) * fu) * (1 - fw) + ((c6 - c4) * (1 - fu) + (c7 - c5) * fu) * fw;
            const gzv = ((c4 - c0) * (1 - fu) + (c5 - c1) * fu) * (1 - fv) + ((c6 - c2) * (1 - fu) + (c7 - c3) * fu) * fv;
            vgrad.push(gxv / c, gyv / c, gzv / c);
          }
          pos.push(ox + (gi + sx / n) * c, oy + (gj + sy / n) * c, oz + (gk + sz / n) * c);
        }
  }

  // --- Pull each vertex onto the surface, staying inside its own cell: one
  // exact sample along the cell's own gradient per step.
  const steps = opts.project ?? 2;
  if (steps > 0) {
    for (let t = 0; t < pos.length; t += 3) {
      const l = listFor(vblock[t / 3]);
      const gx = vgrad[t];
      const gy = vgrad[t + 1];
      const gz = vgrad[t + 2];
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-8) continue;
      let x = pos[t];
      let y = pos[t + 1];
      let z = pos[t + 2];
      const x0 = x;
      const y0 = y;
      const z0 = z;
      for (let st = 0; st < steps; st++) {
        const v = fl(l, x, y, z);
        x -= (v * gx) / g2;
        y -= (v * gy) / g2;
        z -= (v * gz) / g2;
      }
      // Never let a vertex wander more than a cell, or thin parts fold.
      const dx = x - x0;
      const dy = y - y0;
      const dz = z - z0;
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const lim = c * 0.75;
      const sc = dl > lim ? lim / dl : 1;
      pos[t] = x0 + dx * sc;
      pos[t + 1] = y0 + dy * sc;
      pos[t + 2] = z0 + dz * sc;
    }
  }

  // --- A quad for each crossed edge.
  const index: number[] = [];
  const P = (i: number) => i * 3;
  const quad = (a: number, b: number, cc: number, d: number, flip: boolean) => {
    // Split along the shorter diagonal.
    const d1 = dist2(pos, P(a), P(cc));
    const d2 = dist2(pos, P(b), P(d));
    if (flip) {
      if (d1 <= d2) index.push(a, cc, b, a, d, cc);
      else index.push(a, d, b, b, d, cc);
    } else if (d1 <= d2) index.push(a, b, cc, a, cc, d);
    else index.push(a, b, d, b, cc, d);
  };
  const look = (i: number, j: number, k: number) => cellVert.get(i + nx * (j + ny * k));
  for (const [id, a] of blocks) {
    const bi = id % bx;
    const bj = Math.floor(id / bx) % by;
    const bk = Math.floor(id / (bx * by));
    for (let w = 0; w < B; w++)
      for (let v = 0; v < B; v++)
        for (let u = 0; u < B; u++) {
          const gi = bi * B + u;
          const gj = bj * B + v;
          const gk = bk * B + w;
          const a0 = a[u + NC * (v + NC * w)];
          const inside = a0 < 0;
          // +X edge
          if (inside !== a[u + 1 + NC * (v + NC * w)] < 0 && gj > 0 && gk > 0) {
            const q0 = look(gi, gj, gk), q1 = look(gi, gj - 1, gk), q2 = look(gi, gj - 1, gk - 1), q3 = look(gi, gj, gk - 1);
            if (q0 !== undefined && q1 !== undefined && q2 !== undefined && q3 !== undefined) quad(q0, q1, q2, q3, !inside);
          }
          // +Y edge
          if (inside !== a[u + NC * (v + 1 + NC * w)] < 0 && gi > 0 && gk > 0) {
            const q0 = look(gi, gj, gk), q1 = look(gi, gj, gk - 1), q2 = look(gi - 1, gj, gk - 1), q3 = look(gi - 1, gj, gk);
            if (q0 !== undefined && q1 !== undefined && q2 !== undefined && q3 !== undefined) quad(q0, q1, q2, q3, !inside);
          }
          // +Z edge
          if (inside !== a[u + NC * (v + NC * (w + 1))] < 0 && gi > 0 && gj > 0) {
            const q0 = look(gi, gj, gk), q1 = look(gi - 1, gj, gk), q2 = look(gi - 1, gj - 1, gk), q3 = look(gi, gj - 1, gk);
            if (q0 !== undefined && q1 !== undefined && q2 !== undefined && q3 !== undefined) quad(q0, q1, q2, q3, !inside);
          }
        }
  }
  return { pos: new Float32Array(pos), index: new Uint32Array(index) };
}

function dist2(p: ArrayLike<number>, a: number, b: number): number {
  const dx = p[a] - p[b];
  const dy = p[a + 1] - p[b + 1];
  const dz = p[a + 2] - p[b + 2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Normals from the field's own gradient: smooth and exact, where face normals
 * from a decimated mesh would facet.
 */
export function fieldNormals(field: Field, pos: Float32Array, e = 0.0015, clips: Clip[] = [], inflate: Inflate = 0): Float32Array {
  const out = new Float32Array(pos.length);
  const f = clippedField(field, clips, inflate);
  for (let t = 0; t < pos.length; t += 3) {
    const x = pos[t];
    const y = pos[t + 1];
    const z = pos[t + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z);
    let gy = f(x, y + e, z) - f(x, y - e, z);
    let gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    gx /= l;
    gy /= l;
    gz /= l;
    out[t] = gx;
    out[t + 1] = gy;
    out[t + 2] = gz;
  }
  return out;
}
