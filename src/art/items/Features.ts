/**
 * SLAY — what makes a unique or a set piece more than its base.
 *
 * Each feature (wings, flames, frost, chains, an eye, arrows stuck in a
 * breastplate...) is drawn onto the anchors the family builder left: the
 * business axis, the head, the surface hardpoints and the emblem face. So
 * "flames" works on a sword, a helm or a boot without either knowing about
 * the other. Sets also stamp their emblem on the face anchor.
 *
 * Deterministic: placement jitter comes from the look's signature.
 */
import * as THREE from 'three';
import type { Feature } from './Designs';
import type { Emblem } from './Designs';
import { Parts, type Hardpoint } from './Parts';
import { box, chain, cone, curve, cyl, gem, horn, jitter, lathe, slab, smoothOutline, sphere, torus, tube, v3, type V3 } from './Geo';
import { skull } from './Kit';

/** A matrix putting local +Y along `n` at `p`, scaled by `s`, turned `spin` about n. */
function at(p: V3, n: V3, s = 1, spin = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), n.clone().normalize());
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), spin));
  return new THREE.Matrix4().compose(p, q, v3(s, s, s));
}

interface Frame {
  a: V3;
  b: V3;
  dir: V3;
  len: number;
  r: number;
  side: V3;
  head: { p: V3; r: number };
  points: Hardpoint[];
  face: Hardpoint;
  seed: number;
}

function frameOf(P: Parts): Frame {
  const A = P.anchors;
  const a = A.axis?.a ?? v3(0, 0, 0);
  const b = A.axis?.b ?? v3(0, 0.3, 0);
  const dir = b.clone().sub(a);
  const len = Math.max(0.05, dir.length());
  dir.normalize();
  const r = A.axis?.r ?? 0.04;
  const side = Math.abs(dir.y) > 0.9 ? v3(1, 0, 0) : v3(0, 1, 0).cross(dir).normalize();
  const head = A.head ?? { p: b.clone(), r: r * 1.5 };
  const face = A.face ?? { p: a.clone().lerp(b, 0.5).add(v3(0, 0, r * 0.5)), n: v3(0, 0, 1), s: Math.max(0.02, r * 0.8) };
  const points = A.points.length ? A.points : [{ p: head.p.clone().add(v3(0, 0, head.r)), n: v3(0, 0, 1), s: head.r }];
  return { a, b, dir, len, r, side, head, points, face, seed: P.look.signature };
}

function pick<T>(list: T[], n: number, seed: number): T[] {
  if (list.length <= n) return list;
  const out: T[] = [];
  const step = list.length / n;
  const off = Math.abs(Math.floor(jitter(1, seed) * step));
  for (let i = 0; i < n; i++) out.push(list[Math.min(list.length - 1, Math.floor(off + i * step))]!);
  return out;
}

function alongAxis(F: Frame, t: number, out = v3()): V3 {
  return out.copy(F.a).lerp(F.b, t);
}

const FEATURES: Record<Feature, (P: Parts, F: Frame) => void> = {
  arrows(P, F) {
    const pts = pick(F.points, 4, F.seed);
    pts.forEach((h, i) => {
      const len = Math.max(0.18, F.len * 0.5);
      const tilt = v3(jitter(i, F.seed) * 0.5, jitter(i + 3, F.seed) * 0.5, 0);
      const n = h.n.clone().add(tilt).normalize();
      const m = at(h.p.clone().addScaledVector(h.n, -0.01), n);
      P.add('wood', cyl(0.004, 0.004, len, 5), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, len * 0.5, 0)));
      for (let k = 0; k < 3; k++) {
        const fl = slab([[0, 0], [0.012, 0.01], [0.01, 0.05], [0, 0.045]], 0.0015, { bevel: 0 });
        P.add('cloth', fl, m.clone().multiply(at(v3(0, len - 0.05, 0), v3(0, 1, 0), 1, (k / 3) * Math.PI * 2)));
      }
    });
  },
  barnacles(P, F) {
    for (const [i, h] of pick(F.points, 6, F.seed).entries()) {
      for (let k = 0; k < 3; k++) {
        const off = v3(jitter(i * 7 + k, F.seed), jitter(i * 7 + k + 1, F.seed), jitter(i * 7 + k + 2, F.seed)).multiplyScalar(h.s * 0.5);
        const p = h.p.clone().add(off);
        const s = h.s * (0.18 + 0.1 * Math.abs(jitter(k, i)));
        P.add('bone', lathe([[s, 0], [s * 0.9, s * 0.6], [s * 0.45, s * 0.9], [s * 0.3, s * 0.7], [0.001, s * 0.6]], 7), at(p, h.n));
      }
    }
  },
  bells(P, F) {
    const top = alongAxis(F, 0.02);
    for (let i = 0; i < 2; i++) {
      const anchor = top.clone().addScaledVector(F.side, (i ? -1 : 1) * F.r * 1.4);
      const hang = anchor.clone().add(v3(0, -0.06, 0.01));
      P.addAll('dark', chain(anchor, hang, 3, 0.012));
      const s = 0.02;
      P.add('gold', lathe([[0.001, s * 1.2], [s * 0.3, s * 1.15], [s * 0.45, s * 0.6], [s * 0.6, 0], [s * 0.75, -s * 0.15], [s * 0.6, -s * 0.1], [0.001, s * 0.2]], 10), { p: [hang.x, hang.y - s * 1.2, hang.z] });
    }
  },
  blood(P, F) {
    for (let i = 0; i < 7; i++) {
      const t = 0.25 + 0.7 * Math.abs(jitter(i, F.seed));
      const p = alongAxis(F, t).addScaledVector(F.side, jitter(i + 11, F.seed) * F.r * 0.8);
      const z = (i % 2 ? 1 : -1) * F.r * 0.22;
      const drip = sphere(F.r * 0.16, 6, 5);
      drip.scale(1, 2.6 + Math.abs(jitter(i, 5)) * 2, 0.5);
      P.add('blood', drip, { p: [p.x, p.y, p.z + z] });
    }
  },
  bones(P, F) {
    const n = Math.max(4, Math.round(F.len / 0.06));
    for (let i = 0; i < n; i++) {
      const p = alongAxis(F, (i + 0.5) / n * 0.92);
      const m = at(p, F.dir);
      P.add('bone', cyl(F.r * 1.25, F.r * 1.1, F.len / n * 0.55, 8), m);
      P.add('bone', cone(F.r * 0.3, F.r * 1.4, 4), m.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, F.r * 1.4, 0)));
    }
  },
  chains(P, F) {
    const top = F.head.p.clone();
    for (const s of [-1, 1]) {
      const a = top.clone().addScaledVector(F.side, s * F.head.r * 0.9);
      const b = a.clone().add(v3(s * 0.02, -Math.max(0.12, F.len * 0.35), 0.02));
      P.addAll('dark', chain(a, b, Math.max(5, Math.round(a.distanceTo(b) / 0.018)), 0.02));
    }
  },
  coils(P, F) {
    const pts: V3[] = [];
    const turns = Math.max(4, Math.round(F.len / 0.05));
    const r = F.r * 1.15;
    const n = turns * 10;
    const side2 = F.dir.clone().cross(F.side).normalize();
    for (let i = 0; i <= n; i++) {
      const t = 0.08 + (i / n) * 0.6;
      const a = (i / 10) * Math.PI * 2;
      pts.push(alongAxis(F, t).addScaledVector(F.side, Math.cos(a) * r).addScaledVector(side2, Math.sin(a) * r * 0.6));
    }
    P.add('trim', tube(pts, 0.0025, 5));
    P.add('glow', sphere(F.r * 0.35, 8, 6), { p: alongAxis(F, 0.7).toArray() as [number, number, number] });
  },
  coins(P, F) {
    for (const [i, h] of pick(F.points, 5, F.seed).entries()) {
      const s = Math.max(0.012, h.s * 0.35);
      P.add('gold', cyl(s, s, s * 0.18, 12), at(h.p.clone().addScaledVector(h.n, s * 0.1), h.n, 1, i));
    }
  },
  cracks(P, F) {
    for (const [i, h] of pick(F.points, 8, F.seed + 1).entries()) {
      const n = h.n.clone().normalize();
      const t1 = Math.abs(n.y) > 0.9 ? v3(1, 0, 0) : v3(0, 1, 0).cross(n).normalize();
      const t2 = n.clone().cross(t1);
      let p = h.p.clone().addScaledVector(n, 0.0012);
      const seg = 4;
      const step = h.s * 0.45;
      for (let k = 0; k < seg; k++) {
        const ang = jitter(i * 13 + k, F.seed) * 1.2;
        const d = t1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(t2, Math.sin(ang)).multiplyScalar(step);
        const q = p.clone().add(d);
        const mid = p.clone().lerp(q, 0.5);
        const m = new THREE.Matrix4().lookAt(p, q, n).setPosition(mid);
        P.add('glow', box(h.s * 0.05, h.s * 0.05, step * 1.05, 0), m);
        p = q;
      }
    }
  },
  crystals(P, F) {
    const base = F.head.p;
    for (let i = 0; i < 6; i++) {
      const n = F.dir.clone().addScaledVector(F.side, jitter(i, F.seed) * 1.4).add(v3(0, 0, jitter(i + 5, F.seed))).normalize();
      const s = F.head.r * (0.5 + 0.4 * Math.abs(jitter(i + 9, F.seed)));
      P.add('crystal', gem(s, 'shard'), at(base.clone().addScaledVector(n, F.head.r * 0.6), n));
    }
  },
  eyes(P, F) {
    const spots: Hardpoint[] = [F.face];
    for (const h of spots) {
      const s = Math.max(0.012, h.s * 0.7);
      const m = at(h.p.clone().addScaledVector(h.n, s * 0.15), h.n);
      const ball = sphere(s * 0.5, 12, 8);
      ball.scale(1, 0.55, 1);
      P.add('bone', ball, m);
      P.add('glow', sphere(s * 0.24, 10, 6), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, s * 0.2, 0)));
      P.add('dark', sphere(s * 0.11, 8, 6), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, s * 0.33, 0)));
      // Lids: an almond rim.
      const lid = torus(s * 0.52, s * 0.08, 4, 16);
      lid.scale(1, 1, 0.55);
      P.add('main', lid, m.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    }
  },
  feathers(P, F) {
    const root = alongAxis(F, 0);
    for (let i = 0; i < 3; i++) {
      const a = root.clone().addScaledVector(F.side, (i - 1) * F.r * 0.9).add(v3(0, 0, F.r * 0.6));
      const b = a.clone().add(v3((i - 1) * 0.02, -0.06, 0.01));
      P.add('string', tube([a, b], 0.0012, 4));
      const f = slab(smoothOutline([[0, 0], [0.012, -0.03], [0.01, -0.07], [0, -0.09], [-0.01, -0.06], [-0.009, -0.025]], 24), 0.0016, { bevel: 0 });
      P.add('cloth', f, { p: [b.x, b.y, b.z], r: [0.2, 0, (i - 1) * 0.3] });
      P.add('string', box(0.0012, 0.09, 0.002, 0), { p: [b.x, b.y - 0.045, b.z + 0.001], r: [0.2, 0, (i - 1) * 0.3] });
    }
  },
  flames(P, F) {
    const n = Math.max(5, Math.round(F.len / 0.07));
    for (let i = 0; i < n; i++) {
      const t = 0.15 + (i / n) * 0.8;
      for (const s of [-1, 1]) {
        const base = alongAxis(F, t).addScaledVector(F.side, s * F.r * 0.9);
        const len = F.r * (1.3 + 0.8 * Math.abs(jitter(i * 2 + (s > 0 ? 1 : 0), F.seed)));
        const pts = curve([base, base.clone().addScaledVector(F.side, s * len * 0.35).addScaledVector(F.dir, len * 0.4), base.clone().addScaledVector(F.side, s * len * 0.2).addScaledVector(F.dir, len)], 8);
        P.add('glow', tube(pts, (u) => F.r * 0.22 * (1 - u) + 0.0006, 5));
      }
    }
  },
  frost(P, F) {
    const n = Math.max(6, Math.round(F.len / 0.05));
    for (let i = 0; i < n; i++) {
      const t = 0.1 + 0.85 * ((i + 0.5) / n);
      const s = i % 2 ? 1 : -1;
      const p = alongAxis(F, t).addScaledVector(F.side, s * F.r * 0.85);
      const dir = F.side.clone().multiplyScalar(s).addScaledVector(F.dir, 0.8).add(v3(0, 0, jitter(i, F.seed) * 0.6)).normalize();
      P.add('crystal', gem(F.r * (0.45 + 0.35 * Math.abs(jitter(i + 4, F.seed))), 'shard'), at(p, dir));
    }
  },
  ghost(P, F) {
    const g = sphere(F.head.r * 1.6, 12, 8);
    P.add('ghost', g, { p: F.head.p.toArray() as [number, number, number] });
  },
  gilded(P, F) {
    for (let i = 0; i < 3; i++) {
      const p = alongAxis(F, 0.15 + i * 0.25);
      const m = at(p, F.dir);
      P.add('gold', torus(F.r * 1.1, F.r * 0.1, 4, 16), m.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    }
    for (const h of pick(F.points, 4, F.seed + 3)) {
      const s = h.s * 0.4;
      P.add('gold', torus(s, s * 0.14, 3, 10, Math.PI * 1.4), at(h.p.clone().addScaledVector(h.n, 0.001), h.n).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    }
  },
  halo(P, F) {
    const p = F.b.clone().addScaledVector(F.dir, F.head.r * 1.2);
    const r = Math.max(0.05, F.head.r * 1.4);
    P.add('glow', torus(r, r * 0.06, 5, 28), at(p, F.dir).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
  },
  horns(P, F) {
    for (const s of [-1, 1]) {
      const h = horn(F.head.r * 2.2, F.head.r * 0.32, 1.5, 7);
      const p = F.head.p.clone().addScaledVector(F.side, s * F.head.r * 0.75);
      const m = at(p, F.side.clone().multiplyScalar(s).addScaledVector(F.dir, 1).normalize());
      m.multiply(new THREE.Matrix4().makeScale(s, 1, 1));
      P.add('bone', h, m);
    }
  },
  leaves(P, F) {
    for (let i = 0; i < 9; i++) {
      const t = 0.7 + 0.3 * Math.abs(jitter(i, F.seed));
      const p = alongAxis(F, t).addScaledVector(F.side, jitter(i + 2, F.seed) * F.head.r);
      const n = F.side.clone().multiplyScalar(jitter(i + 5, F.seed)).addScaledVector(F.dir, 0.6).add(v3(0, 0, jitter(i + 7, F.seed))).normalize();
      const s = F.head.r * 0.9;
      const leaf = slab(smoothOutline([[0, 0], [s * 0.3, s * 0.4], [0, s * 1.1], [-s * 0.3, s * 0.4]], 16), 0.002, { bevel: 0 });
      P.add('leaf', leaf, at(p, n, 1, i));
    }
  },
  rivets(P, F) {
    for (const h of F.points) P.add('dark', sphere(Math.max(0.003, h.s * 0.09), 6, 4), { p: h.p.clone().addScaledVector(h.n, 0.001).toArray() as [number, number, number] });
  },
  runes(P, F) {
    for (let i = 0; i < 5; i++) {
      const p = alongAxis(F, 0.15 + i * 0.16);
      for (const z of [1, -1]) {
        const q = p.clone().add(v3(0, 0, z * F.r * 0.45));
        P.add('glow', box(F.r * 0.22, F.r * 0.7, 0.002, 0), { p: q.toArray() as [number, number, number], r: [0, 0, jitter(i, F.seed) * 0.6] });
      }
    }
  },
  scales(P, F) {
    for (const h of pick(F.points, 10, F.seed)) {
      const s = h.s * 0.5;
      const sc = slab(smoothOutline([[-s * 0.5, 0], [0, -s * 0.2], [s * 0.5, 0], [0, s * 0.9]], 12), s * 0.12);
      P.add('trim', sc, at(h.p.clone().addScaledVector(h.n, 0.002), h.n).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)));
    }
  },
  skulls(P, F) {
    skull(P, 'bone', F.face.p.clone().addScaledVector(F.face.n, F.face.s * 0.3), Math.max(0.03, F.face.s * 1.3), F.face.n);
  },
  smoke(P, F) {
    for (let i = 0; i < 3; i++) {
      const pts: V3[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const a = t * Math.PI * 2.5 + i * 2.1;
        pts.push(F.head.p.clone().addScaledVector(F.dir, t * F.head.r * 3).addScaledVector(F.side, Math.cos(a) * F.head.r * (0.8 + t)).add(v3(0, 0, Math.sin(a) * F.head.r * (0.8 + t))));
      }
      P.add('ghost', tube(pts, (t) => F.head.r * 0.12 * (1 - t * 0.7), 5));
    }
  },
  spikes(P, F) {
    for (const h of pick(F.points, 8, F.seed + 2)) {
      const len = Math.max(0.03, h.s * 0.9);
      P.add('dark', cone(len * 0.18, len, 5), at(h.p.clone().addScaledVector(h.n, len * 0.45), h.n));
    }
  },
  stars(P, F) {
    for (let i = 0; i < 5; i++) {
      const p = F.head.p.clone().addScaledVector(F.side, jitter(i, F.seed) * F.head.r * 2).addScaledVector(F.dir, jitter(i + 3, F.seed) * F.head.r * 1.5).add(v3(0, 0, F.head.r * 0.8));
      const s = F.head.r * (0.18 + 0.12 * Math.abs(jitter(i + 6, F.seed)));
      const star = slab([[0, s], [s * 0.2, s * 0.2], [s, 0], [s * 0.2, -s * 0.2], [0, -s], [-s * 0.2, -s * 0.2], [-s, 0], [-s * 0.2, s * 0.2]], s * 0.15, { bevel: 0 });
      P.add('glow', star, { p: p.toArray() as [number, number, number], r: [0, 0, i] });
    }
  },
  tatters(P, F) {
    const root = alongAxis(F, 0.02);
    for (let i = 0; i < 3; i++) {
      const w = 0.018 + 0.01 * Math.abs(jitter(i, F.seed));
      const len = 0.1 + 0.08 * Math.abs(jitter(i + 1, F.seed));
      const ol: Array<[number, number]> = [[-w, 0], [w, 0], [w * 0.8, -len * 0.7], [w * 0.4, -len], [0, -len * 0.8], [-w * 0.5, -len * 0.95], [-w * 0.9, -len * 0.6]];
      const strip = slab(ol, 0.002, { bevel: 0 });
      P.add('cloth', strip, { p: [root.x + (i - 1) * F.r * 0.9, root.y, root.z + F.r * 0.4], r: [0.15, 0, (i - 1) * 0.25] });
    }
  },
  teeth(P, F) {
    const n = Math.max(5, Math.round(F.len / 0.04));
    for (let i = 0; i < n; i++) {
      const t = 0.2 + 0.7 * (i / n);
      const p = alongAxis(F, t).addScaledVector(F.side, F.r * 0.95);
      P.add('bone', cone(F.r * 0.16, F.r * 0.55, 4), at(p, F.side.clone().addScaledVector(F.dir, 0.3).normalize()));
    }
  },
  thorns(P, F) {
    const pts: V3[] = [];
    const n = 60;
    const side2 = F.dir.clone().cross(F.side).normalize();
    for (let i = 0; i <= n; i++) {
      const t = 0.05 + (i / n) * 0.7;
      const a = (i / n) * Math.PI * 2 * 3;
      pts.push(alongAxis(F, t).addScaledVector(F.side, Math.cos(a) * F.r * 1.05).addScaledVector(side2, Math.sin(a) * F.r * 0.5));
    }
    P.add('dark', tube(pts, F.r * 0.1, 5));
    for (let i = 4; i < n; i += 6) {
      const out = pts[i]!.clone().sub(alongAxis(F, 0.05 + (i / n) * 0.7)).normalize();
      P.add('dark', cone(F.r * 0.1, F.r * 0.5, 4), at(pts[i]!, out));
    }
  },
  vines(P, F) {
    const pts: V3[] = [];
    const n = 50;
    const side2 = F.dir.clone().cross(F.side).normalize();
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * 0.85;
      const a = (i / n) * Math.PI * 2 * 2.5;
      pts.push(alongAxis(F, t).addScaledVector(F.side, Math.cos(a) * F.r * 1.1).addScaledVector(side2, Math.sin(a) * F.r * 0.6));
    }
    P.add('leaf', tube(pts, F.r * 0.12, 5));
  },
  web(P, F) {
    const c = F.head.p;
    const r = F.head.r * 1.6;
    const spokes = 6;
    const side2 = F.dir.clone().cross(F.side).normalize();
    const pt = (a: number, rr: number) => c.clone().addScaledVector(F.side, Math.cos(a) * rr).addScaledVector(F.dir, Math.sin(a) * rr).addScaledVector(side2, F.r * 0.6);
    for (let i = 0; i < spokes; i++) P.add('string', tube([pt(0, 0), pt((i / spokes) * Math.PI * 2, r)], 0.0008, 3));
    for (const rr of [0.35, 0.65, 0.95]) {
      const ring: V3[] = [];
      for (let i = 0; i <= spokes; i++) ring.push(pt((i / spokes) * Math.PI * 2, r * rr));
      P.add('string', tube(ring, 0.0007, 3));
    }
  },
  wings(P, F) {
    const p = F.head.p;
    const s = Math.max(0.08, F.head.r * 2.4);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const len = s * (1 - k * 0.18);
        const f = slab(smoothOutline([[0, 0], [len * 0.25, len * 0.08], [len, len * 0.02], [len * 0.9, -len * 0.08], [len * 0.2, -len * 0.08]], 20), Math.max(0.002, s * 0.03));
        const m = new THREE.Matrix4().compose(
          p.clone().addScaledVector(F.side, side * F.head.r * 0.8),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side > 0 ? 0.5 - k * 0.32 : Math.PI - 0.5 + k * 0.32)),
          v3(1, 1, 1),
        );
        P.add('trim', f, m);
      }
    }
  },
};

/** Emblem outlines in a unit square (-1..1), extruded and set in the set's colour. */
function emblemShape(e: Emblem): Array<Array<[number, number]>> {
  const star = (n: number, r0: number, r1: number): Array<[number, number]> => {
    const o: Array<[number, number]> = [];
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 ? r1 : r0;
      o.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return o;
  };
  switch (e) {
    case 'hand':
      return [smoothOutline([[-0.5, -0.9], [0.5, -0.9], [0.55, -0.1], [0.75, 0.2], [0.55, 0.3], [0.45, 0.9], [0.25, 0.95], [0.1, 0.4], [0, 1], [-0.2, 1], [-0.25, 0.4], [-0.45, 0.85], [-0.62, 0.8], [-0.55, -0.1]], 40)];
    case 'flame':
    case 'ember':
      return [smoothOutline([[0, -0.9], [0.6, -0.5], [0.5, 0.2], [0.2, 0.4], [0.3, 0.95], [-0.15, 0.5], [-0.45, 0.6], [-0.55, -0.4]], 36)];
    case 'feather':
      return [smoothOutline([[0, -1], [0.35, -0.4], [0.4, 0.4], [0, 1], [-0.3, 0.3], [-0.3, -0.5]], 30)];
    case 'skull':
      return [smoothOutline([[0, 0.95], [0.75, 0.55], [0.7, -0.1], [0.4, -0.35], [0.4, -0.85], [-0.4, -0.85], [-0.4, -0.35], [-0.7, -0.1], [-0.75, 0.55]], 36)];
    case 'eye':
      return [smoothOutline([[-1, 0], [0, 0.6], [1, 0], [0, -0.6]], 32)];
    case 'snowflake':
      return [star(6, 1, 0.3)];
    case 'bolt':
      return [[[-0.15, 1], [0.5, 1], [0.15, 0.2], [0.55, 0.2], [-0.3, -1], [0, -0.1], [-0.4, -0.1]]];
    case 'web':
      return [star(8, 1, 0.75)];
    case 'shield':
      return [smoothOutline([[-0.8, 0.9], [0.8, 0.9], [0.75, 0], [0, -1], [-0.75, 0]], 30)];
    case 'coin':
      return [smoothOutline([[1, 0], [0, 1], [-1, 0], [0, -1]], 32)];
    case 'moon':
      return [smoothOutline([[0.2, 1], [-0.6, 0.6], [-0.75, -0.2], [-0.2, -0.9], [0.4, -0.85], [-0.2, -0.5], [-0.3, 0.2], [0.05, 0.75]], 36)];
    case 'star':
      return [star(5, 1, 0.42)];
    case 'laurel':
      return [smoothOutline([[0, -1], [0.7, -0.6], [0.95, 0.2], [0.6, 0.9], [0.5, 0.2], [0.3, -0.4], [0, -0.6], [-0.3, -0.4], [-0.5, 0.2], [-0.6, 0.9], [-0.95, 0.2], [-0.7, -0.6]], 44)];
    case 'crown':
      return [[[-0.9, -0.6], [0.9, -0.6], [0.95, 0.8], [0.5, 0.2], [0, 0.95], [-0.5, 0.2], [-0.95, 0.8]]];
  }
}

function addEmblem(P: Parts, F: Frame, e: Emblem): void {
  const f = F.face;
  const s = Math.max(0.018, f.s);
  const m = at(f.p.clone().addScaledVector(f.n, 0.001), f.n);
  // A dark disc under it so the colour reads on any metal.
  P.add('dark', cyl(s * 1.15, s * 1.2, s * 0.12, 18), m);
  P.add('trim', torus(s * 1.18, s * 0.1, 4, 20), m.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
  for (const ol of emblemShape(e)) {
    const g = slab(ol.map(([x, y]) => [x * s * 0.85, y * s * 0.85] as [number, number]), s * 0.14, { bevel: s * 0.03 });
    // Slab lies in XY facing +Z; turn it to face along the normal (+Y local).
    P.add('glow', g, m.clone().multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, 0, s * 0.1)));
  }
}

/** Draws the look's features and the set emblem onto the built parts. */
export function addFeatures(P: Parts): void {
  const L = P.look;
  if (!L.features.length && !L.emblem) return;
  const F = frameOf(P);
  for (const f of L.features) {
    const fn = FEATURES[f];
    if (!fn) continue;
    try {
      fn(P, F);
    } catch (err) {
      if (typeof console !== 'undefined') console.warn(`feature ${f} failed on ${L.cut}`, err);
    }
  }
  if (L.emblem) addEmblem(P, F, L.emblem);
}

