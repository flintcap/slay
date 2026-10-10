/**
 * SLAY — quadric edge-collapse simplification (Garland and Heckbert).
 *
 * Surface nets give an even mesh, which spends as many triangles on a flat
 * back as on a nose. Collapsing the edges whose removal changes the shape
 * least puts the triangles where the shape is.
 */

export interface Simplified {
  pos: Float32Array;
  index: Uint32Array;
}

/**
 * Simplifies a closed triangle mesh to about `target` triangles.
 * `weight` (optional, per vertex) makes some vertices costlier to move,
 * e.g. the face over the back of the head.
 */
export function simplify(posIn: Float32Array, indexIn: Uint32Array, target: number, weight?: Float32Array): Simplified {
  const nv = posIn.length / 3;
  const nf = indexIn.length / 3;
  if (nf <= target) return { pos: posIn, index: indexIn };
  const pos = Float64Array.from(posIn);
  const tri = Int32Array.from(indexIn);
  const faceAlive = new Uint8Array(nf).fill(1);
  const vAlive = new Uint8Array(nv).fill(1);
  const Q = new Float64Array(nv * 10);
  const vf: number[][] = Array.from({ length: nv }, () => []);

  // Plane quadrics, area weighted.
  for (let f = 0; f < nf; f++) {
    const a = tri[f * 3];
    const b = tri[f * 3 + 1];
    const c = tri[f * 3 + 2];
    vf[a].push(f);
    vf[b].push(f);
    vf[c].push(f);
    const [nx, ny, nz, area] = faceNormal(pos, a, b, c);
    if (area <= 0) continue;
    const d = -(nx * pos[a * 3] + ny * pos[a * 3 + 1] + nz * pos[a * 3 + 2]);
    for (const v of [a, b, c]) {
      const w = area * (weight ? weight[v] : 1);
      addQ(Q, v, nx, ny, nz, d, w);
    }
  }

  // Edges.
  const edgeKey = (a: number, b: number) => (a < b ? a * nv + b : b * nv + a);
  const version = new Uint32Array(nv);
  const heap = new Heap();
  const opt = new Float64Array(3);
  const pushEdge = (a: number, b: number) => {
    const cost = collapseCost(Q, pos, a, b, opt);
    heap.push(cost, a, b, version[a], version[b], opt[0], opt[1], opt[2]);
  };
  const seen = new Set<number>();
  for (let f = 0; f < nf; f++) {
    for (let e = 0; e < 3; e++) {
      const a = tri[f * 3 + e];
      const b = tri[f * 3 + ((e + 1) % 3)];
      const k = edgeKey(a, b);
      if (seen.has(k)) continue;
      seen.add(k);
      pushEdge(a, b);
    }
  }
  seen.clear();

  let faces = nf;
  // Stamps instead of sets: a vertex is "in" when its mark equals the stamp.
  const markA = new Int32Array(nv);
  const markC = new Int32Array(nv);
  const markR = new Int32Array(nv);
  let stamp = 0;
  let rstamp = 0;
  while (faces > target && heap.size > 0) {
    const top = heap.pop();
    const { a, b, va, vb } = top;
    if (!vAlive[a] || !vAlive[b] || version[a] !== va || version[b] !== vb) continue;
    const px = top.x;
    const py = top.y;
    const pz = top.z;
    // Link condition: the two vertices may share exactly two neighbours.
    stamp++;
    for (const f of vf[a]) {
      if (!faceAlive[f]) continue;
      markA[tri[f * 3]] = stamp;
      markA[tri[f * 3 + 1]] = stamp;
      markA[tri[f * 3 + 2]] = stamp;
    }
    let shared = 0;
    for (const f of vf[b]) {
      if (!faceAlive[f]) continue;
      for (let e = 0; e < 3; e++) {
        const v = tri[f * 3 + e];
        if (v !== a && v !== b && markA[v] === stamp && markC[v] !== stamp) {
          markC[v] = stamp;
          shared++;
        }
      }
    }
    if (shared !== 2) continue;
    // No face may flip or collapse to a sliver.
    if (flips(pos, tri, faceAlive, vf[a], a, b, px, py, pz) || flips(pos, tri, faceAlive, vf[b], b, a, px, py, pz)) continue;

    // Collapse b into a.
    pos[a * 3] = px;
    pos[a * 3 + 1] = py;
    pos[a * 3 + 2] = pz;
    for (let t = 0; t < 10; t++) Q[a * 10 + t] += Q[b * 10 + t];
    vAlive[b] = 0;
    const fa = vf[a];
    for (const f of vf[b]) {
      if (!faceAlive[f]) continue;
      const hasA = tri[f * 3] === a || tri[f * 3 + 1] === a || tri[f * 3 + 2] === a;
      if (hasA) {
        faceAlive[f] = 0;
        faces--;
        continue;
      }
      for (let e = 0; e < 3; e++) if (tri[f * 3 + e] === b) tri[f * 3 + e] = a;
      fa.push(f);
    }
    vf[b] = [];
    // Compact a's face list in place.
    let w = 0;
    for (let r = 0; r < fa.length; r++) if (faceAlive[fa[r]]) fa[w++] = fa[r];
    fa.length = w;
    version[a]++;
    // Only edges touching a changed cost: a moved and took b's quadric.
    rstamp++;
    for (const f of fa) {
      for (let e = 0; e < 3; e++) {
        const v = tri[f * 3 + e];
        if (v !== a && markR[v] !== rstamp) {
          markR[v] = rstamp;
          pushEdge(a, v);
        }
      }
    }
  }

  // Compact.
  const remap = new Int32Array(nv).fill(-1);
  const outPos: number[] = [];
  const outIdx: number[] = [];
  for (let f = 0; f < nf; f++) {
    if (!faceAlive[f]) continue;
    for (let e = 0; e < 3; e++) {
      const v = tri[f * 3 + e];
      if (remap[v] < 0) {
        remap[v] = outPos.length / 3;
        outPos.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      }
      outIdx.push(remap[v]);
    }
  }
  return { pos: new Float32Array(outPos), index: new Uint32Array(outIdx) };
}

function faceNormal(p: Float64Array, a: number, b: number, c: number): [number, number, number, number] {
  const ux = p[b * 3] - p[a * 3];
  const uy = p[b * 3 + 1] - p[a * 3 + 1];
  const uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3];
  const vy = p[c * 3 + 1] - p[a * 3 + 1];
  const vz = p[c * 3 + 2] - p[a * 3 + 2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (l < 1e-18) return [0, 0, 0, 0];
  nx /= l;
  ny /= l;
  nz /= l;
  return [nx, ny, nz, l * 0.5];
}

function addQ(Q: Float64Array, v: number, a: number, b: number, c: number, d: number, w: number): void {
  const o = v * 10;
  Q[o] += w * a * a;
  Q[o + 1] += w * a * b;
  Q[o + 2] += w * a * c;
  Q[o + 3] += w * a * d;
  Q[o + 4] += w * b * b;
  Q[o + 5] += w * b * c;
  Q[o + 6] += w * b * d;
  Q[o + 7] += w * c * c;
  Q[o + 8] += w * c * d;
  Q[o + 9] += w * d * d;
}

function qError(q: Float64Array, x: number, y: number, z: number): number {
  return (
    q[0] * x * x + 2 * q[1] * x * y + 2 * q[2] * x * z + 2 * q[3] * x +
    q[4] * y * y + 2 * q[5] * y * z + 2 * q[6] * y +
    q[7] * z * z + 2 * q[8] * z + q[9]
  );
}

const QS = new Float64Array(10);

function collapseCost(Q: Float64Array, p: Float64Array, a: number, b: number, out: Float64Array): number {
  for (let t = 0; t < 10; t++) QS[t] = Q[a * 10 + t] + Q[b * 10 + t];
  const q = QS;
  // Solve the 3x3 system for the optimal point.
  const m00 = q[0], m01 = q[1], m02 = q[2], m11 = q[4], m12 = q[5], m22 = q[7];
  const det = m00 * (m11 * m22 - m12 * m12) - m01 * (m01 * m22 - m12 * m02) + m02 * (m01 * m12 - m11 * m02);
  const ax = p[a * 3], ay = p[a * 3 + 1], az = p[a * 3 + 2];
  const bx = p[b * 3], by = p[b * 3 + 1], bz = p[b * 3 + 2];
  const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5, mz = (az + bz) * 0.5;
  let best = Infinity;
  if (Math.abs(det) > 1e-14) {
    const r0 = -q[3], r1 = -q[6], r2 = -q[8];
    const x = (r0 * (m11 * m22 - m12 * m12) - m01 * (r1 * m22 - m12 * r2) + m02 * (r1 * m12 - m11 * r2)) / det;
    const y = (m00 * (r1 * m22 - m12 * r2) - r0 * (m01 * m22 - m12 * m02) + m02 * (m01 * r2 - r1 * m02)) / det;
    const z = (m00 * (m11 * r2 - r1 * m12) - m01 * (m01 * r2 - r1 * m02) + r0 * (m01 * m12 - m11 * m02)) / det;
    // Only trust it near the edge; far away it is an ill-conditioned guess.
    const el = Math.hypot(ax - bx, ay - by, az - bz);
    if (Math.hypot(x - mx, y - my, z - mz) < el * 1.5) {
      best = qError(q, x, y, z);
      out[0] = x;
      out[1] = y;
      out[2] = z;
    }
  }
  for (const [x, y, z] of [[mx, my, mz], [ax, ay, az], [bx, by, bz]]) {
    const e = qError(q, x, y, z);
    if (e < best) {
      best = e;
      out[0] = x;
      out[1] = y;
      out[2] = z;
    }
  }
  return Math.max(0, best);
}

function flips(
  p: Float64Array,
  tri: Int32Array,
  alive: Uint8Array,
  faces: number[],
  v: number,
  other: number,
  x: number,
  y: number,
  z: number,
): boolean {
  for (let r = 0; r < faces.length; r++) {
    const f = faces[r];
    if (!alive[f]) continue;
    let i0 = tri[f * 3], i1 = tri[f * 3 + 1], i2 = tri[f * 3 + 2];
    if (i0 === other || i1 === other || i2 === other) continue;
    // Rotate so v is first; winding is kept.
    if (i1 === v) {
      const t = i0;
      i0 = i1;
      i1 = i2;
      i2 = t;
    } else if (i2 === v) {
      const t = i2;
      i2 = i1;
      i1 = i0;
      i0 = t;
    }
    const ax = p[i0 * 3], ay = p[i0 * 3 + 1], az = p[i0 * 3 + 2];
    const bx = p[i1 * 3], by = p[i1 * 3 + 1], bz = p[i1 * 3 + 2];
    const cx = p[i2 * 3], cy = p[i2 * 3 + 1], cz = p[i2 * 3 + 2];
    // Old normal.
    let ux = bx - ax, uy = by - ay, uz = bz - az;
    let wx = cx - ax, wy = cy - ay, wz = cz - az;
    const ox = uy * wz - uz * wy, oy = uz * wx - ux * wz, oz = ux * wy - uy * wx;
    // New normal with v moved.
    ux = bx - x;
    uy = by - y;
    uz = bz - z;
    wx = cx - x;
    wy = cy - y;
    wz = cz - z;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const lo = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (l < 1e-14 || lo < 1e-18) return true;
    if ((nx * ox + ny * oy + nz * oz) / (l * lo) < 0.3) return true;
    // Sliver test: area against the longest edge.
    const e2 = Math.max(ux * ux + uy * uy + uz * uz, wx * wx + wy * wy + wz * wz, (wx - ux) ** 2 + (wy - uy) ** 2 + (wz - uz) ** 2);
    if (l / e2 < 0.08) return true;
  }
  return false;
}

/** A binary min-heap of edge collapses: records in a pool, the heap holds ids. */
class Heap {
  private cost: number[] = [];
  private rec: number[] = [];
  private pos: number[] = [];
  private heap: number[] = [];
  private free: number[] = [];
  get size(): number {
    return this.heap.length;
  }
  push(cost: number, a: number, b: number, va: number, vb: number, x: number, y: number, z: number): void {
    const id = this.free.length ? this.free.pop()! : this.cost.length;
    this.cost[id] = cost;
    this.rec[id * 4] = a;
    this.rec[id * 4 + 1] = b;
    this.rec[id * 4 + 2] = va;
    this.rec[id * 4 + 3] = vb;
    this.pos[id * 3] = x;
    this.pos[id * 3 + 1] = y;
    this.pos[id * 3 + 2] = z;
    const h = this.heap;
    let i = h.length;
    h.push(id);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cost[h[p]] <= cost) break;
      h[i] = h[p];
      i = p;
    }
    h[i] = id;
  }
  pop(): { a: number; b: number; va: number; vb: number; x: number; y: number; z: number } {
    const h = this.heap;
    const id = h[0];
    const r = {
      a: this.rec[id * 4], b: this.rec[id * 4 + 1], va: this.rec[id * 4 + 2], vb: this.rec[id * 4 + 3],
      x: this.pos[id * 3], y: this.pos[id * 3 + 1], z: this.pos[id * 3 + 2],
    };
    this.free.push(id);
    const last = h.pop()!;
    const n = h.length;
    if (n > 0) {
      const c = this.cost[last];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const rr = l + 1;
        const m = rr < n && this.cost[h[rr]] < this.cost[h[l]] ? rr : l;
        if (this.cost[h[m]] >= c) break;
        h[i] = h[m];
        i = m;
      }
      h[i] = last;
    }
    return r;
  }
}
