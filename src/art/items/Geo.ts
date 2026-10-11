/**
 * SLAY — the geometry kit item models are built from.
 *
 * Small, exact builders: lofted rings (blades, axe bits, plates), lathes
 * (grips, pommels, flasks), swept tubes (bow limbs, horns, coils, chains),
 * bevelled boxes, extruded outlines with a wedge taper, faceted gems. Every
 * builder returns a fresh `BufferGeometry` with `position` and `normal` only,
 * so `Parts` can merge anything with anything.
 *
 * Units are metres. Weapons are authored grip at the origin, business end
 * along +Y, wide on X, thin on Z.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = THREE.Vector3;
export const v3 = (x = 0, y = 0, z = 0): V3 => new THREE.Vector3(x, y, z);

/** Keep only position and normal, so every part merges with every other. */
export function clean(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const name of Object.keys(geo.attributes)) {
    if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  geo.morphAttributes = {};
  geo.clearGroups();
  return geo;
}

/** Faceted shading: every triangle its own normal. */
export function flat(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return clean(g);
}

export interface Xf {
  /** Position. */
  p?: [number, number, number];
  /** Euler rotation, radians, XYZ. */
  r?: [number, number, number];
  /** Uniform or per-axis scale. */
  s?: number | [number, number, number];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function matrixOf(xf: Xf): THREE.Matrix4 {
  _p.set(...(xf.p ?? [0, 0, 0]));
  _q.setFromEuler(_e.set(...(xf.r ?? [0, 0, 0])));
  if (typeof xf.s === 'number') _s.setScalar(xf.s);
  else _s.set(...(xf.s ?? [1, 1, 1]));
  return _m.compose(_p, _q, _s).clone();
}

/** Applies a transform in place and returns the geometry. */
export function xf(geo: THREE.BufferGeometry, t: Xf | THREE.Matrix4): THREE.BufferGeometry {
  const m = t instanceof THREE.Matrix4 ? t : matrixOf(t);
  geo.applyMatrix4(m);
  // A mirrored transform turns triangles inside out.
  if (m.determinant() < 0) flipWinding(geo);
  return geo;
}

export function flipWinding(geo: THREE.BufferGeometry): void {
  if (geo.index) {
    const a = geo.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1]!;
      a[i + 1] = a[i + 2]!;
      a[i + 2] = t;
    }
    geo.index.needsUpdate = true;
  } else {
    for (const name of ['position', 'normal']) {
      const at = geo.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!at) continue;
      const arr = at.array as Float32Array;
      for (let i = 0; i < arr.length; i += 9) {
        for (let k = 0; k < 3; k++) {
          const t = arr[i + 3 + k]!;
          arr[i + 3 + k] = arr[i + 6 + k]!;
          arr[i + 6 + k] = t;
        }
      }
      at.needsUpdate = true;
    }
  }
}

/**
 * Lofts rings of equal length into a closed tube. Each ring is a loop of
 * points; consecutive rings are stitched. Caps fan to the ring's centre.
 * `smooth` false gives faceted shading (blades, cut stone).
 */
export function loft(rings: V3[][], opts: { capA?: boolean; capB?: boolean; smooth?: boolean; open?: boolean } = {}): THREE.BufferGeometry {
  const n = rings[0]!.length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const ring of rings) for (const p of ring) pos.push(p.x, p.y, p.z);
  const loop = opts.open ? n - 1 : n;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < loop; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      const c = (r + 1) * n + i;
      const d = (r + 1) * n + ((i + 1) % n);
      idx.push(a, b, d, a, d, c);
    }
  }
  const cap = (ri: number, flip: boolean) => {
    const ring = rings[ri]!;
    const c = new THREE.Vector3();
    for (const p of ring) c.add(p);
    c.divideScalar(ring.length);
    const ci = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    for (let i = 0; i < n; i++) {
      const a = ri * n + i;
      const b = ri * n + ((i + 1) % n);
      if (flip) idx.push(ci, a, b);
      else idx.push(ci, b, a);
    }
  };
  if (opts.capA) cap(0, false);
  if (opts.capB) cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (opts.smooth === false) return flat(g);
  g.computeVertexNormals();
  return g;
}

/**
 * A blade along +Y from y = 0 to `len`. `half(t)` gives the half widths
 * [right, left] at t = y / len (left may differ for single-edged blades),
 * `spine(t)` the thickness at the centre, `fuller(t)` how deep the groove is
 * (0..1 of the spine). `bend(t)` shifts the blade along X (curved sabres).
 * Faceted, so every bevel catches light.
 */
export function blade(o: {
  len: number;
  steps?: number;
  half: (t: number) => [number, number];
  spine: (t: number) => number;
  edge?: number;
  fuller?: (t: number) => number;
  bend?: (t: number) => number;
  /** Where the bevel starts, 0..1 of the half width (0.45 default). */
  bevel?: number;
  /** Single-edged: the left side is a flat spine, not an edge. */
  backed?: boolean;
}): THREE.BufferGeometry {
  const steps = o.steps ?? 16;
  const edge = o.edge ?? 0.0015;
  const bev = o.bevel ?? 0.45;
  const rings: V3[][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * o.len;
    let [wr, wl] = o.half(t);
    wr = Math.max(wr, 0.0004);
    wl = Math.max(wl, 0.0004);
    const s = Math.max(o.spine(t), edge * 1.2);
    const f = o.fuller ? Math.min(0.85, Math.max(0, o.fuller(t))) : 0;
    const bx = o.bend ? o.bend(t) : 0;
    const zc = s * 0.5 * (1 - f);
    const zs = s * 0.5;
    const le = o.backed ? s * 0.42 : edge * 0.5;
    // Right edge, right shoulder, centre (fuller), left shoulder, left edge; front then back.
    const ring = [
      v3(bx + wr, y, 0),
      v3(bx + wr * bev, y, zs),
      v3(bx, y, zc),
      v3(bx - wl * bev, y, zs),
      v3(bx - wl, y, le),
      v3(bx - wl, y, -le),
      v3(bx - wl * bev, y, -zs),
      v3(bx, y, -zc),
      v3(bx + wr * bev, y, -zs),
    ];
    if (!o.backed) ring.splice(5, 1);
    rings.push(ring);
  }
  // Make every ring the same length (backed rings have one more point).
  return loft(rings, { capA: true, capB: true, smooth: false });
}

/** A lathe from [radius, y] points, `seg` sides. Oval with sx/sz. */
export function lathe(profile: Array<[number, number]>, seg = 16, o: { sx?: number; sz?: number; phase?: number; smooth?: boolean } = {}): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y));
  let g: THREE.BufferGeometry = new THREE.LatheGeometry(pts, seg, o.phase ?? 0);
  if (o.sx !== undefined || o.sz !== undefined) g.scale(o.sx ?? 1, 1, o.sz ?? 1);
  g = clean(g);
  // LatheGeometry duplicates the seam; recompute so it shades smooth.
  if (o.smooth === false) return flat(g);
  return mergeSeams(g);
}

/** Welds coincident vertices and recomputes normals (smooth lathes, closed seams). */
export function mergeSeams(geo: THREE.BufferGeometry, tol = 1e-5): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const map = new Map<string, number>();
  const remap: number[] = [];
  const out: number[] = [];
  const inv = 1 / tol;
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * inv)},${Math.round(pos.getY(i) * inv)},${Math.round(pos.getZ(i) * inv)}`;
    let j = map.get(k);
    if (j === undefined) {
      j = out.length / 3;
      map.set(k, j);
      out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    remap.push(j);
  }
  const src = geo.index ? Array.from(geo.index.array) : [...Array(pos.count).keys()];
  const idx: number[] = [];
  for (let i = 0; i < src.length; i += 3) {
    const a = remap[src[i]!]!;
    const b = remap[src[i + 1]!]!;
    const c = remap[src[i + 2]!]!;
    if (a !== b && b !== c && a !== c) idx.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  geo.dispose();
  return g;
}

/** Parallel-transport frames along a polyline. */
function frames(pts: V3[]): { t: V3[]; n: V3[]; b: V3[] } {
  const t: V3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    t.push(b.clone().sub(a).normalize());
  }
  const n: V3[] = [];
  const b: V3[] = [];
  let up = Math.abs(t[0]!.z) < 0.9 ? v3(0, 0, 1) : v3(1, 0, 0);
  let nn = up.clone().cross(t[0]!).normalize();
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) {
      const axis = t[i - 1]!.clone().cross(t[i]!);
      const s = axis.length();
      if (s > 1e-6) {
        const ang = Math.asin(Math.min(1, s));
        nn = nn.clone().applyAxisAngle(axis.normalize(), t[i - 1]!.dot(t[i]!) < 0 ? Math.PI - ang : ang);
      }
    }
    n.push(nn.clone());
    b.push(t[i]!.clone().cross(nn).normalize());
  }
  up = n[0]!;
  return { t, n, b };
}

/**
 * Sweeps a circle (or an ellipse, `flat` < 1 squashes along the binormal)
 * along points. `radius(t)` tapers it. Ends capped.
 */
export function tube(pts: V3[], radius: number | ((t: number) => number), sides = 8, o: { flat?: number; capA?: boolean; capB?: boolean; twist?: number } = {}): THREE.BufferGeometry {
  const fr = frames(pts);
  const rings: V3[][] = [];
  const total = pts.length - 1;
  for (let i = 0; i < pts.length; i++) {
    const t = total > 0 ? i / total : 0;
    const r = typeof radius === 'number' ? radius : radius(t);
    const ring: V3[] = [];
    const tw = (o.twist ?? 0) * t;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + tw;
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r * (o.flat ?? 1);
      ring.push(pts[i]!.clone().addScaledVector(fr.n[i]!, c).addScaledVector(fr.b[i]!, s));
    }
    rings.push(ring);
  }
  return loft(rings, { capA: o.capA ?? true, capB: o.capB ?? true });
}

/** Points on a Catmull-Rom curve through `ctrl`. */
export function curve(ctrl: V3[], n = 16): V3[] {
  if (ctrl.length < 2) return ctrl.map((p) => p.clone());
  return new THREE.CatmullRomCurve3(ctrl, false, 'centripetal').getPoints(n);
}

/** A bevelled box centred on the origin. */
export function box(w: number, h: number, d: number, bevel = 0.004): THREE.BufferGeometry {
  const r = Math.min(bevel, w * 0.49, h * 0.49, d * 0.49);
  if (r <= 1e-4) return clean(new THREE.BoxGeometry(w, h, d));
  return clean(new RoundedBoxGeometry(w, h, d, 1, r));
}

export function sphere(r: number, ws = 12, hs = 8): THREE.BufferGeometry {
  return mergeSeams(clean(new THREE.SphereGeometry(r, ws, hs)));
}

export function cyl(rTop: number, rBot: number, h: number, seg = 12, open = false): THREE.BufferGeometry {
  return clean(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open));
}

export function cone(r: number, h: number, seg = 8): THREE.BufferGeometry {
  return clean(new THREE.ConeGeometry(r, h, seg));
}

export function torus(R: number, r: number, radial = 6, tubular = 20, arc = Math.PI * 2): THREE.BufferGeometry {
  return mergeSeams(clean(new THREE.TorusGeometry(R, r, radial, tubular, arc)));
}

/** A spike along +Y from the origin. */
export function spike(len: number, r: number, sides = 6): THREE.BufferGeometry {
  return xf(cone(r, len, sides), { p: [0, len * 0.5, 0] });
}

/**
 * A curved horn along +Y that bends toward +X, tapering to a point.
 * `curl` is the total bend in radians.
 */
export function horn(len: number, r: number, curl = 1.2, sides = 7, twist = 0): THREE.BufferGeometry {
  const n = 10;
  const pts: V3[] = [];
  let ang = 0;
  const p = v3();
  for (let i = 0; i <= n; i++) {
    pts.push(p.clone().add(v3(0, 0, Math.sin((i / n) * Math.PI) * twist * len)));
    const step = len / n;
    p.x += Math.sin(ang) * step;
    p.y += Math.cos(ang) * step;
    ang += curl / n;
  }
  return tube(pts, (t) => r * Math.pow(1 - t, 0.85) + 0.0006, sides);
}

/**
 * An extruded outline in the XY plane, `depth` thick on Z, with a bevel.
 * `taper(x, y)` (optional) scales the thickness per vertex (1 at full), so an
 * axe bit can thin to its edge.
 */
export function slab(outline: Array<[number, number]>, depth: number, o: { bevel?: number; taper?: (x: number, y: number) => number; curveSegments?: number; holes?: Array<Array<[number, number]>> } = {}): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of o.holes ?? []) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const bevel = o.bevel ?? Math.min(depth * 0.35, 0.006);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 1,
    curveSegments: o.curveSegments ?? 4,
  });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  if (o.taper) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) * Math.max(0.04, o.taper(pos.getX(i), pos.getY(i))));
  }
  return flat(g);
}

/** Sample a closed outline from a list of control points (smooth corners). */
export function smoothOutline(ctrl: Array<[number, number]>, n = 48, closed = true): Array<[number, number]> {
  const c = new THREE.CatmullRomCurve3(ctrl.map(([x, y]) => v3(x, y, 0)), closed, 'centripetal');
  return c.getPoints(n).slice(0, closed ? n : n + 1).map((p) => [p.x, p.y] as [number, number]);
}

/** A faceted gem, table up (+Y), centred. */
export function gem(size: number, cut: 'round' | 'oval' | 'square' | 'marquise' | 'pear' | 'cabochon' | 'shard' = 'round'): THREE.BufferGeometry {
  if (cut === 'cabochon') return xf(lathe([[0, -size * 0.18], [size * 0.5, -size * 0.12], [size * 0.48, size * 0.08], [size * 0.32, size * 0.26], [0, size * 0.32]], 12), {});
  if (cut === 'shard') {
    const g = new THREE.OctahedronGeometry(size * 0.5, 0);
    g.scale(0.55, 1.5, 0.45);
    return flat(clean(g));
  }
  const seg = cut === 'square' ? 4 : 8;
  const g = lathe(
    [
      [0, -size * 0.42],
      [size * 0.5, 0],
      [size * 0.5, size * 0.06],
      [size * 0.32, size * 0.2],
      [0, size * 0.2],
    ],
    seg,
    { smooth: false, phase: cut === 'square' ? Math.PI / 4 : 0 },
  );
  if (cut === 'oval') g.scale(0.75, 1, 1.05);
  if (cut === 'marquise') g.scale(0.5, 1, 1.15);
  if (cut === 'pear') {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      pos.setX(i, pos.getX(i) * (z > 0 ? 1 - z / size : 1) * 0.8);
    }
    g.computeVertexNormals();
  }
  return g;
}

/** A ring of `n` copies of a geometry around the Y axis at radius r. */
export function around(make: () => THREE.BufferGeometry, n: number, r: number, y = 0, tilt = 0, phase = 0): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push(xf(make(), new THREE.Matrix4().compose(v3(Math.sin(a) * r, y, Math.cos(a) * r), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, a, 0, 'YXZ')), v3(1, 1, 1))));
  }
  return out;
}

/** A link chain hanging from `a` toward `b`, `links` torus links alternating 90 degrees. */
export function chain(a: V3, b: V3, links: number, size: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const dir = b.clone().sub(a);
  const len = dir.length();
  dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir);
  for (let i = 0; i < links; i++) {
    const g = torus(size * 0.5, size * 0.12, 4, 10);
    g.scale(0.7, 1, 1);
    const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (i % 2) * Math.PI * 0.5, 0));
    const p = a.clone().addScaledVector(dir, (i + 0.5) * (len / links));
    out.push(xf(g, new THREE.Matrix4().compose(p, q.clone().multiply(turn), v3(1, 1, 1))));
  }
  return out;
}

/** Deterministic hash noise in -1..1 for jitter that never uses Math.random. */
export function jitter(i: number, seed: number): number {
  let h = Math.imul(i + 1, 374761393) ^ Math.imul(seed + 7, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

/** Pushes vertices out along their normals by noise: hammered metal, rough stone, bark. */
export function rough(geo: THREE.BufferGeometry, amount: number, seed: number, freq = 40): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
  if (!nor) geo.computeVertexNormals();
  const n = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = Math.sin(x * freq + seed) * Math.sin(y * freq * 1.3 + seed * 2.1) * Math.sin(z * freq * 0.9 + seed * 0.7);
    const d = amount * k;
    pos.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}
