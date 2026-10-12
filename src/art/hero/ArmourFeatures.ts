/**
 * SLAY — what uniques and sets carry on the body.
 *
 * Every unique has its own features and every set a motif (see
 * `items/Designs.ts`). On a worn piece each feature becomes shapes at the
 * piece's anchors: spikes and horns on the shoulders, a halo over the helm,
 * wings on the back, skulls at the belt, flames at the cuffs. A feature picks
 * the anchors it suits best, in order, so the same unique dresses a helm and
 * a chest differently but always reads as itself.
 */
import * as THREE from 'three';
import type { Feature } from '../ItemLook';
import { alongY } from './Sdf';
import { Kit, V, basis, frame, type Anchor, type MatKey } from './ArmourKit';

type Role = Anchor['role'];

const PREF: Record<Feature, Role[]> = {
  spikes: ['shoulder', 'knee', 'crown', 'hand', 'buckle', 'cuff', 'back'],
  thorns: ['shoulder', 'cuff', 'shin', 'hip', 'crown'],
  teeth: ['shoulder', 'buckle', 'brow', 'knee', 'cuff'],
  horns: ['crown', 'temple', 'shoulder', 'knee', 'buckle'],
  skulls: ['shoulder', 'buckle', 'chest', 'knee', 'brow', 'hand'],
  crystals: ['shoulder', 'crown', 'hand', 'knee', 'back'],
  wings: ['back', 'temple', 'heel'],
  halo: ['crown', 'back', 'buckle', 'hand', 'heel'],
  feathers: ['shoulder', 'temple', 'heel', 'hip', 'cuff'],
  leaves: ['shoulder', 'hip', 'temple', 'cuff', 'shin'],
  chains: ['chest', 'hip', 'cuff', 'shin', 'brow'],
  bones: ['shoulder', 'hip', 'shin', 'cuff', 'crown'],
  coins: ['chest', 'hip', 'buckle', 'brow', 'cuff', 'shin'],
  bells: ['hip', 'buckle', 'cuff', 'heel', 'temple'],
  stars: ['chest', 'brow', 'hand', 'shin', 'back', 'buckle'],
  eyes: ['chest', 'brow', 'hand', 'knee', 'buckle'],
  runes: ['chest', 'back', 'hand', 'cuff', 'shin', 'brow', 'buckle'],
  cracks: ['chest', 'back', 'shin', 'cuff', 'crown', 'buckle'],
  flames: ['shoulder', 'cuff', 'heel', 'crown', 'buckle'],
  frost: ['shoulder', 'crown', 'knee', 'cuff', 'buckle'],
  ghost: ['shoulder', 'back', 'heel', 'cuff', 'temple', 'buckle'],
  smoke: ['shoulder', 'back', 'heel', 'cuff', 'crown', 'buckle'],
  blood: ['chest', 'hand', 'shin', 'hip', 'brow'],
  coils: ['cuff', 'shin', 'hip', 'temple', 'shoulder'],
  web: ['chest', 'back', 'hip', 'hand', 'temple'],
  vines: ['chest', 'shin', 'cuff', 'hip', 'temple'],
  scales: ['shoulder', 'chest', 'shin', 'cuff', 'temple'],
  rivets: ['chest', 'shoulder', 'shin', 'cuff', 'buckle', 'brow'],
  gilded: ['chest', 'shoulder', 'brow', 'cuff', 'shin', 'buckle'],
  tatters: ['hip', 'back', 'shoulder', 'cuff', 'temple'],
  barnacles: ['shoulder', 'chest', 'knee', 'cuff', 'temple'],
  arrows: ['back', 'shoulder', 'chest', 'shin'],
  dragons: ['shoulder', 'crown', 'knee', 'hand', 'buckle', 'hip'],
  claws: ['hand', 'shoulder', 'knee', 'buckle', 'crown'],
  antlers: ['crown', 'temple', 'shoulder', 'knee', 'buckle'],
  crowns: ['crown', 'brow', 'shoulder', 'buckle', 'knee'],
  moons: ['shoulder', 'brow', 'chest', 'buckle', 'knee', 'hand'],
  bolts: ['shoulder', 'crown', 'cuff', 'shin', 'buckle'],
  spiders: ['chest', 'back', 'shoulder', 'hand', 'buckle', 'brow'],
  serpents: ['shoulder', 'cuff', 'shin', 'hip', 'temple', 'crown'],
  laurels: ['temple', 'brow', 'chest', 'buckle', 'shin'],
};

const DOWN = V(0, -1, 0);
const UP = V(0, 1, 0);

// ---------------------------------------------------------------------------
// Sculpted signatures: the shapes that tell a set or a unique from across
// the screen. Each one is a few bold prims, so it survives the mesher's cell
// and reads as a silhouette at the game camera.
// ---------------------------------------------------------------------------

type FB = ReturnType<Kit['fit']>;

/** Which way a sculpt at this anchor faces, and which way is its up. */
function sculptFrame(a: Anchor): { fwd: THREE.Vector3; up: THREE.Vector3; side: THREE.Vector3; sd: number } {
  const sd = a.p.x >= 0 ? 1 : -1;
  let fwd: THREE.Vector3;
  if (a.role === 'shoulder') fwd = V(sd * 0.55, 0.12, 0.85).normalize();
  else if (a.role === 'crown') fwd = V(0, 0.12, 1).normalize();
  else if (a.role === 'temple') fwd = V(sd * 0.35, 0.2, 0.9).normalize();
  else fwd = a.n.clone().addScaledVector(UP, 0.25).normalize();
  const side = new THREE.Vector3().crossVectors(UP, fwd).normalize();
  const up = new THREE.Vector3().crossVectors(fwd, side).normalize();
  return { fwd, up, side, sd };
}

/** A dragon's head: skull, long snout, open jaw, swept horns, lit eyes, a crest down the neck. */
function dragonHead(M: FB, B: FB, G: FB, base: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, side: THREE.Vector3, s: number): void {
  const c = base.clone().addScaledVector(up, 0.28 * s);
  const q = basis(side, up);
  M.ellipsoid(c, V(0.3 * s, 0.26 * s, 0.34 * s), 0.06 * s, q);
  // Neck down into the plate.
  M.cone(base.clone().addScaledVector(fwd, -0.2 * s), c, 0.26 * s, 0.22 * s, 0.08 * s);
  const snoutEnd = c.clone().addScaledVector(fwd, 0.85 * s).addScaledVector(up, -0.02 * s);
  M.cone(c, snoutEnd, 0.2 * s, 0.1 * s, 0.05 * s);
  // Nostril bumps and a brow ridge.
  for (const k of [1, -1]) {
    M.ellipsoid(snoutEnd.clone().addScaledVector(side, k * 0.06 * s).addScaledVector(up, 0.06 * s), V(0.05 * s, 0.04 * s, 0.05 * s), 0.02 * s);
    M.cone(c.clone().addScaledVector(side, k * 0.16 * s).addScaledVector(up, 0.12 * s).addScaledVector(fwd, 0.18 * s), c.clone().addScaledVector(side, k * 0.12 * s).addScaledVector(up, 0.2 * s).addScaledVector(fwd, -0.05 * s), 0.07 * s, 0.05 * s, 0.03 * s);
  }
  // The jaw hangs open.
  const jaw0 = c.clone().addScaledVector(up, -0.16 * s).addScaledVector(fwd, -0.05 * s);
  const jaw1 = c.clone().addScaledVector(fwd, 0.72 * s).addScaledVector(up, -0.34 * s);
  M.cone(jaw0, jaw1, 0.15 * s, 0.07 * s, 0.04 * s);
  // Fangs.
  for (const k of [1, -1]) {
    const t = snoutEnd.clone().addScaledVector(fwd, -0.12 * s).addScaledVector(side, k * 0.07 * s).addScaledVector(up, -0.08 * s);
    B.cone(t, t.clone().addScaledVector(up, -0.16 * s), 0.035 * s, 0.006 * s, 0.006 * s);
    const t2 = jaw1.clone().addScaledVector(fwd, -0.1 * s).addScaledVector(side, k * 0.06 * s).addScaledVector(up, 0.04 * s);
    B.cone(t2, t2.clone().addScaledVector(up, 0.13 * s), 0.03 * s, 0.005 * s, 0.005 * s);
  }
  // Swept-back horns.
  for (const k of [1, -1]) {
    const h0 = c.clone().addScaledVector(side, k * 0.18 * s).addScaledVector(up, 0.16 * s).addScaledVector(fwd, -0.1 * s);
    const h1 = h0.clone().addScaledVector(fwd, -0.45 * s).addScaledVector(up, 0.25 * s).addScaledVector(side, k * 0.1 * s);
    const h2 = h1.clone().addScaledVector(fwd, -0.35 * s).addScaledVector(up, 0.28 * s);
    B.cone(h0, h1, 0.08 * s, 0.05 * s, 0.02 * s);
    B.cone(h1, h2, 0.05 * s, 0.008 * s, 0.01 * s);
  }
  // A crest of spines down the neck.
  for (let j = 0; j < 3; j++) {
    const p = c.clone().addScaledVector(fwd, -(0.2 + j * 0.2) * s).addScaledVector(up, (0.22 - j * 0.07) * s);
    M.cone(p, p.clone().addScaledVector(up, (0.2 - j * 0.04) * s).addScaledVector(fwd, -0.1 * s), 0.06 * s, 0.006 * s, 0.01 * s);
  }
  // Eyes lit from within.
  for (const k of [1, -1]) G.ellipsoid(c.clone().addScaledVector(fwd, 0.2 * s).addScaledVector(side, k * 0.17 * s).addScaledVector(up, 0.07 * s), V(0.06 * s, 0.04 * s, 0.06 * s), 0.01 * s);
}

/** Places a sculpted signature. False when `f` is not one. */
function sculpt(k: Kit, f: Feature, a: Anchor, fit: (m: MatKey) => FB): boolean {
  const s = a.s;
  const { u, v } = frame(a.n);
  const at = (du: number, dv: number, dn: number) => a.p.clone().addScaledVector(u, du * s).addScaledVector(v, dv * s).addScaledVector(a.n, dn * s);
  const metal = k.look.material === 'metal';
  switch (f) {
    case 'dragons': {
      const { fwd, up, side } = sculptFrame(a);
      const big = a.role === 'shoulder' || a.role === 'crown' ? 1.15 : 0.95;
      dragonHead(fit(metal ? 'main' : 'trim'), fit('bone'), fit('glow'), at(0, 0, 0.02), fwd, up, side, s * big);
      return true;
    }
    case 'claws': {
      const F = fit(metal ? 'trim' : 'dark');
      const { fwd, sd } = sculptFrame(a);
      const out = a.role === 'shoulder' ? V(sd, 0.2, 0).normalize() : a.n;
      for (let j = 0; j < 4; j++) {
        const b = at((j - 1.5) * 0.24, 0.1, 0.05);
        const m = b.clone().addScaledVector(out, 0.55 * s).addScaledVector(UP, 0.42 * s).addScaledVector(fwd, 0.1 * s);
        const t = m.clone().addScaledVector(out, 0.3 * s).addScaledVector(UP, -0.4 * s).addScaledVector(fwd, 0.16 * s);
        F.cone(b, m, 0.12 * s, 0.08 * s, 0.025 * s);
        F.cone(m, t, 0.08 * s, 0.006 * s, 0.01 * s);
      }
      return true;
    }
    case 'antlers': {
      // A set's rack is spectral, lit in its glow, so it stands out from the crest it grows from.
      const F = fit(k.look.motif?.sculpt === 'antlers' ? 'glow' : 'bone');
      // A crown carries a full rack, larger than the crest it grows from.
      const S = a.s * (a.role === 'crown' ? 1.45 : 1);
      const sides = a.role === 'crown' ? [1, -1] : [a.p.x >= 0 ? 1 : -1];
      for (const sd of sides) {
        const out = V(sd, 0, 0);
        const p0 = a.role === 'crown' ? a.p.clone().add(V(sd * 0.32 * S, -0.15 * S, 0)) : at(0, 0, 0.02);
        const p1 = p0.clone().addScaledVector(out, 0.5 * S).addScaledVector(UP, 0.55 * S).add(V(0, 0, -0.1 * S));
        const p2 = p1.clone().addScaledVector(out, 0.35 * S).addScaledVector(UP, 0.65 * S).add(V(0, 0, -0.15 * S));
        const p3 = p2.clone().addScaledVector(out, 0.1 * S).addScaledVector(UP, 0.55 * S);
        F.cone(p0, p1, 0.14 * S, 0.1 * S, 0.025 * S);
        F.cone(p1, p2, 0.1 * S, 0.075 * S, 0.02 * S);
        F.cone(p2, p3, 0.075 * S, 0.012 * S, 0.01 * S);
        // Tines branch forward and out.
        for (const [q, l, o] of [[p1, 0.42, 0.1], [p2, 0.38, -0.25], [p2.clone().lerp(p3, 0.5), 0.3, 0.3]] as const) {
          const tip = q.clone().addScaledVector(out, o * S).addScaledVector(UP, l * S).add(V(0, 0, 0.3 * S));
          F.cone(q, tip, 0.065 * S, 0.008 * S, 0.01 * S);
        }
      }
      return true;
    }
    case 'crowns': {
      const F = fit(k.trimmed ? 'trim' : 'gold');
      const Gm = fit('gem');
      if (a.role === 'crown') {
        const n = 7;
        for (let j = 0; j < n; j++) {
          const t = (j / n) * Math.PI * 2;
          const dir = V(Math.sin(t), 0, Math.cos(t));
          const b = a.p.clone().addScaledVector(dir, 1.05 * s).addScaledVector(UP, -0.35 * s);
          const tall = j === 0 ? 1.15 : 0.75 + 0.15 * Math.cos(t * 2);
          F.cone(b, b.clone().addScaledVector(UP, tall * s).addScaledVector(dir, 0.12 * s), 0.13 * s, 0.01 * s, 0.03 * s);
          if (j % 2 === 0) Gm.ellipsoid(b.clone().addScaledVector(dir, 0.1 * s).addScaledVector(UP, 0.1 * s), V(0.08 * s, 0.08 * s, 0.08 * s), 0.01 * s);
        }
      } else {
        for (let j = -1; j <= 1; j++) {
          const b = at(j * 0.32, 0, 0.04);
          F.cone(b, b.clone().addScaledVector(a.n, (j === 0 ? 0.7 : 0.48) * s).addScaledVector(UP, 0.2 * s), 0.1 * s, 0.008 * s, 0.02 * s);
        }
        Gm.ellipsoid(at(0, -0.15, 0.08), V(0.09 * s, 0.09 * s, 0.07 * s), 0.01 * s);
      }
      return true;
    }
    case 'moons': {
      const F = fit('trim');
      const { side, sd } = sculptFrame(a);
      const crown = a.role === 'crown';
      const c = crown ? a.p.clone().addScaledVector(UP, 0.75 * s) : at(0, 0.1, 0.4);
      // The crescent lies in the plane facing out of the body; its gap faces
      // away from the head (straight up on a crown), so it reads as a moon.
      const h0 = crown || a.role === 'shoulder' ? side.clone() : u.clone();
      const n0 = new THREE.Vector3().crossVectors(h0, UP).normalize();
      const g = crown ? UP.clone() : h0.clone().multiplyScalar(sd).addScaledVector(UP, 0.6).normalize();
      const h = new THREE.Vector3().crossVectors(n0, g).normalize();
      const R = (crown ? 0.75 : 0.6) * s;
      const m = 12;
      const t0 = Math.PI * 0.3;
      const t1 = Math.PI * 1.7;
      let prev: THREE.Vector3 | null = null;
      for (let j = 0; j <= m; j++) {
        const t = t0 + (j / m) * (t1 - t0);
        const p = c.clone().addScaledVector(g, Math.cos(t) * R).addScaledVector(h, Math.sin(t) * R);
        const w = 0.22 * Math.pow(Math.sin((j / m) * Math.PI), 1.3) * s + 0.02 * s;
        if (prev) F.cone(prev, p, w, w, 0.03 * s);
        prev = p;
      }
      fit('glow').ellipsoid(c.clone().addScaledVector(g, 0.15 * R), V(0.1 * s, 0.1 * s, 0.1 * s), 0.02 * s);
      return true;
    }
    case 'bolts': {
      const F = fit('glow');
      const T = fit('trim');
      const { side } = sculptFrame(a);
      for (const k2 of [-1, 1]) {
        const lat = a.role === 'shoulder' || a.role === 'crown' ? side : u;
        const p0 = a.p.clone().addScaledVector(lat, k2 * 0.22 * s).addScaledVector(a.n, 0.03 * s);
        const p1 = p0.clone().addScaledVector(a.n, 0.35 * s).addScaledVector(UP, 0.3 * s).addScaledVector(lat, k2 * 0.18 * s);
        const p2 = p1.clone().addScaledVector(UP, 0.12 * s).addScaledVector(lat, -k2 * 0.2 * s);
        const p3 = p2.clone().addScaledVector(a.n, 0.3 * s).addScaledVector(UP, 0.35 * s).addScaledVector(lat, k2 * 0.22 * s);
        T.cone(p0, p1, 0.07 * s, 0.06 * s, 0.01 * s);
        F.cone(p1, p2, 0.06 * s, 0.05 * s, 0.01 * s);
        F.cone(p2, p3, 0.05 * s, 0.006 * s, 0.01 * s);
      }
      return true;
    }
    case 'spiders': {
      const D = fit('dark');
      const c = at(0, 0, 0.12);
      const q = basis(u, v);
      D.ellipsoid(c.clone().addScaledVector(v, -0.18 * s), V(0.24 * s, 0.3 * s, 0.17 * s), 0.04 * s, q);
      D.ellipsoid(c.clone().addScaledVector(v, 0.17 * s), V(0.16 * s, 0.15 * s, 0.12 * s), 0.04 * s, q);
      for (let j = 0; j < 4; j++) {
        for (const k2 of [-1, 1]) {
          const root = c.clone().addScaledVector(v, (0.22 - j * 0.1) * s).addScaledVector(u, k2 * 0.1 * s);
          const knee = root.clone().addScaledVector(u, k2 * 0.32 * s).addScaledVector(v, (0.18 - j * 0.14) * s).addScaledVector(a.n, 0.2 * s);
          const foot = knee.clone().addScaledVector(u, k2 * 0.22 * s).addScaledVector(v, (0.12 - j * 0.12) * s).addScaledVector(a.n, -0.3 * s);
          D.cone(root, knee, 0.04 * s, 0.035 * s, 0.01 * s);
          D.cone(knee, foot, 0.035 * s, 0.01 * s, 0.01 * s);
        }
      }
      // An hourglass of venom on its back, and its eyes.
      const G = fit('glow');
      G.ellipsoid(c.clone().addScaledVector(v, -0.18 * s).addScaledVector(a.n, 0.15 * s), V(0.08 * s, 0.13 * s, 0.04 * s), 0.01 * s, q);
      for (const k2 of [-1, 1]) G.ellipsoid(c.clone().addScaledVector(v, 0.27 * s).addScaledVector(u, k2 * 0.05 * s).addScaledVector(a.n, 0.09 * s), V(0.035 * s, 0.035 * s, 0.035 * s), 0.005 * s);
      return true;
    }
    case 'serpents': {
      const F = fit(metal ? 'trim' : 'main');
      const lat = a.role === 'shoulder' ? sculptFrame(a).side : u;
      const fw = new THREE.Vector3().crossVectors(lat, a.n).normalize();
      // One and a half turns coiled flat on the plate, rising.
      let prev: THREE.Vector3 | null = null;
      const m = 14;
      for (let j = 0; j <= m; j++) {
        const t = (j / m) * Math.PI * 3;
        const r = (0.45 - 0.15 * (j / m)) * s;
        const p = a.p.clone().addScaledVector(lat, Math.cos(t) * r).addScaledVector(fw, Math.sin(t) * r).addScaledVector(a.n, (0.05 + 0.08 * (j / m)) * s);
        const w = (0.06 + 0.05 * (j / m)) * s;
        if (prev) F.cone(prev, p, w, w, 0.02 * s);
        prev = p;
      }
      // The neck rears up and the head strikes forward.
      const neck0 = prev!;
      const neck1 = neck0.clone().addScaledVector(a.n, 0.45 * s).addScaledVector(UP, 0.25 * s);
      const head = neck1.clone().addScaledVector(fw, 0.2 * s).addScaledVector(UP, 0.08 * s);
      F.cone(neck0, neck1, 0.11 * s, 0.1 * s, 0.03 * s);
      F.cone(neck1, head, 0.1 * s, 0.13 * s, 0.03 * s);
      F.ellipsoid(head.clone().addScaledVector(fw, 0.08 * s), V(0.14 * s, 0.09 * s, 0.18 * s), 0.03 * s, basis(lat, UP));
      for (const k2 of [-1, 1]) fit('glow').ellipsoid(head.clone().addScaledVector(lat, k2 * 0.08 * s).addScaledVector(UP, 0.05 * s).addScaledVector(fw, 0.08 * s), V(0.035 * s, 0.03 * s, 0.035 * s), 0.005 * s);
      return true;
    }
    case 'laurels': {
      const F = fit('gold');
      const lat = a.role === 'temple' ? V(0, 0, 1) : u;
      for (const k2 of [-1, 1]) {
        for (let j = 0; j < 5; j++) {
          const t = 0.2 + j * 0.28;
          const p = at(0, 0, 0.05).addScaledVector(lat, k2 * Math.sin(t) * 0.5 * s).addScaledVector(UP, (Math.cos(t) * -0.45 + 0.2) * s);
          const dir = lat.clone().multiplyScalar(k2 * Math.cos(t)).addScaledVector(UP, Math.sin(t)).normalize();
          F.ellipsoid(p, V(0.06 * s, 0.13 * s, 0.025 * s), 0.01 * s, basis(dir.clone().cross(a.n).normalize(), dir));
        }
      }
      return true;
    }
  }
  return false;
}

/** Places one feature at one anchor. */
function place(k: Kit, f: Feature, a: Anchor, i: number): void {
  const s = a.s;
  const { u, v } = frame(a.n);
  const at = (du: number, dv: number, dn: number) => a.p.clone().addScaledVector(u, du * s).addScaledVector(v, dv * s).addScaledVector(a.n, dn * s);
  const fit = (m: MatKey) => k.fit(m, a.g, 0.005);
  if (sculpt(k, f, a, fit)) return;
  switch (f) {
    case 'spikes': {
      const F = fit(k.look.material === 'metal' ? 'main' : 'trim');
      for (let j = -1; j <= 1; j++) {
        const b = at(j * 0.35, 0, 0.05);
        const dir = a.n.clone().multiplyScalar(0.8).addScaledVector(UP, 0.35).addScaledVector(u, j * 0.25).normalize();
        F.cone(b, b.clone().addScaledVector(dir, (j === 0 ? 1.1 : 0.8) * s), 0.13 * s, 0.01 * s, 0.03 * s);
      }
      break;
    }
    case 'thorns': {
      const F = fit('wood');
      for (let j = 0; j < 4; j++) {
        const b = at(Math.cos(j * 1.9) * 0.4, Math.sin(j * 1.9) * 0.4, 0.02);
        F.cone(b, b.clone().addScaledVector(a.n, 0.4 * s).addScaledVector(v, -0.12 * s), 0.07 * s, 0.006 * s, 0.01 * s);
      }
      break;
    }
    case 'teeth': {
      const F = fit('bone');
      for (let j = 0; j < 5; j++) {
        const b = at((j - 2) * 0.2, -0.25, 0.06);
        F.cone(b, b.clone().addScaledVector(DOWN, 0.32 * s).addScaledVector(a.n, 0.1 * s), 0.06 * s, 0.006 * s, 0.01 * s);
      }
      break;
    }
    case 'horns': {
      const F = fit('bone');
      const side = a.role === 'crown' ? [1, -1] : [a.p.x >= 0 ? 1 : -1];
      for (const sd of side) {
        const out = a.role === 'crown' ? V(sd, 0, 0) : a.n.clone();
        const p0 = a.role === 'crown' ? a.p.clone().add(V(sd * 0.3 * s, -0.2 * s, 0)) : at(0, 0, 0);
        const p1 = p0.clone().addScaledVector(out, 0.55 * s).addScaledVector(UP, 0.35 * s);
        const p2 = p1.clone().addScaledVector(out, 0.35 * s).addScaledVector(UP, 0.7 * s).add(V(0, 0, -0.2 * s));
        const p3 = p2.clone().addScaledVector(out, -0.1 * s).addScaledVector(UP, 0.5 * s).add(V(0, 0, 0.15 * s));
        F.cone(p0, p1, 0.22 * s, 0.15 * s, 0.04 * s);
        F.cone(p1, p2, 0.15 * s, 0.07 * s, 0.03 * s);
        F.cone(p2, p3, 0.07 * s, 0.01 * s, 0.02 * s);
      }
      break;
    }
    case 'skulls': {
      const F = fit('bone');
      const c = at(0, 0, 0.36);
      const q = basis(u, v);
      F.ellipsoid(c, V(0.38 * s, 0.4 * s, 0.36 * s), 0.05 * s, q);
      F.ellipsoid(c.clone().addScaledVector(v, -0.34 * s).addScaledVector(a.n, 0.14 * s), V(0.22 * s, 0.14 * s, 0.2 * s), 0.05 * s, q);
      for (const sd of [1, -1]) {
        const eye = c.clone().addScaledVector(u, sd * 0.15 * s).addScaledVector(a.n, 0.32 * s).addScaledVector(v, -0.03 * s);
        F.ellipsoid(eye, V(0.1 * s, 0.1 * s, 0.1 * s), 0.02 * s, undefined, { sub: true });
        fit('glow').ellipsoid(eye.clone().addScaledVector(a.n, -0.05 * s), V(0.055 * s, 0.055 * s, 0.04 * s), 0.01 * s);
        if (i === 0) {
          const h0 = c.clone().addScaledVector(u, sd * 0.3 * s).addScaledVector(v, 0.22 * s);
          const h1 = h0.clone().addScaledVector(u, sd * 0.35 * s).addScaledVector(v, 0.3 * s);
          F.cone(h0, h1, 0.09 * s, 0.01 * s, 0.02 * s);
        }
      }
      break;
    }
    case 'crystals': {
      const F = fit('gem');
      for (let j = 0; j < 3; j++) {
        const dir = a.n.clone().addScaledVector(UP, 0.5).addScaledVector(u, (j - 1) * 0.5).normalize();
        const len = (0.55 - 0.12 * Math.abs(j - 1)) * s;
        F.box(a.p.clone().addScaledVector(dir, len * 0.8), V(0.08 * s, len, 0.08 * s), 0.02 * s, 0.02 * s, alongY(dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 4)));
      }
      break;
    }
    case 'wings': {
      const F = fit('trim');
      const back = a.role === 'back';
      const sides = back ? [1, -1] : [a.p.x >= 0 ? 1 : -1];
      const n = back ? 6 : 3;
      for (const sd of sides) {
        const root = back ? a.p.clone().add(V(sd * 0.25 * s, 0.25 * s, -0.1 * s)) : at(0, 0, 0.05);
        for (let j = 0; j < n; j++) {
          const th = (back ? 0.15 : 0.5) + j * (back ? 0.24 : 0.35);
          const dir = V(sd * Math.cos(th), Math.sin(th), back ? -0.35 : -0.6).normalize();
          const len = (back ? 1.5 - 0.12 * j : 0.7 - 0.12 * j) * s;
          F.ellipsoid(root.clone().addScaledVector(dir, len * 0.75), V(0.13 * s, len, 0.035 * s), 0.02 * s, basis(V(-dir.y, dir.x, 0).normalize(), dir));
        }
      }
      break;
    }
    case 'halo': {
      const F = fit('glow');
      const crown = a.role === 'crown';
      const c = crown ? a.p.clone().add(V(0, 0.9 * s, 0)) : a.role === 'back' ? a.p.clone().add(V(0, 1.6 * s, -0.4 * s)) : at(0, 0, 0.1);
      const R = (crown ? 1.7 : a.role === 'back' ? 1.4 : 0.4) * s;
      const m = crown || a.role === 'back' ? 18 : 10;
      for (let j = 0; j < m; j++) {
        const t = (j / m) * Math.PI * 2;
        const off = crown ? V(Math.cos(t) * R, 0, Math.sin(t) * R) : a.role === 'back' ? V(Math.cos(t) * R, Math.sin(t) * R, 0) : u.clone().multiplyScalar(Math.cos(t) * R).addScaledVector(v, Math.sin(t) * R);
        F.ellipsoid(c.clone().add(off), V(0.1 * s, 0.1 * s, 0.1 * s).multiplyScalar(crown ? 0.8 : 1), 0.12 * s);
      }
      break;
    }
    case 'feathers':
    case 'leaves': {
      const fe = f === 'feathers';
      const F = fit(fe ? 'trim' : 'leaf');
      const n = fe ? 5 : 3;
      for (let j = 0; j < n; j++) {
        const o = j - (n - 1) / 2;
        const dir = a.n.clone().multiplyScalar(0.4).addScaledVector(UP, 0.8).addScaledVector(u, o * (fe ? 0.32 : 0.45)).normalize();
        const len = (fe ? 0.95 - 0.1 * Math.abs(o) : 0.4) * s;
        F.ellipsoid(at(o * 0.12, 0, 0.05).addScaledVector(dir, len * 0.8), V((fe ? 0.14 : 0.16) * s, len, 0.025 * s), 0.02 * s, basis(u, dir));
        if (fe) fit('glow').cone(at(o * 0.12, 0, 0.07), at(o * 0.12, 0, 0.07).addScaledVector(dir, len * 1.5), 0.018 * s, 0.006 * s, 0.006 * s);
      }
      break;
    }
    case 'chains': {
      const F = fit('iron');
      const n = i === 0 ? 10 : 8;
      for (let j = 0; j <= n; j++) {
        const t = j / n;
        const p = at((t - 0.5) * 1.7, -0.6 * Math.sin(t * Math.PI), 0.07);
        F.ellipsoid(p, V(0.12 * s, 0.075 * s, 0.04 * s), 0.01 * s, basis(u, v).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), j % 2 ? Math.PI / 2 : 0)));
      }
      if (i === 0) {
        const lock = at(0, -0.85, 0.1);
        fit('gold').box(lock, V(0.16 * s, 0.14 * s, 0.06 * s), 0.02 * s, 0.01 * s, basis(u, v));
        fit('gold').ellipsoid(lock.clone().addScaledVector(v, 0.16 * s), V(0.1 * s, 0.1 * s, 0.03 * s), 0.01 * s, basis(u, v));
      }
      break;
    }
    case 'bones': {
      const F = fit('bone');
      for (const sd of [1, -1]) {
        const p0 = at(-0.45, sd * 0.35, 0.08);
        const p1 = at(0.45, -sd * 0.35, 0.08);
        F.cone(p0, p1, 0.05 * s, 0.05 * s, 0.01 * s);
        for (const e of [p0, p1]) F.ellipsoid(e, V(0.09 * s, 0.09 * s, 0.07 * s), 0.02 * s);
      }
      break;
    }
    case 'coins': {
      const F = fit('gold');
      for (let j = 0; j < 4; j++) F.ellipsoid(at((j - 1.5) * 0.24, -0.25 - 0.05 * Math.abs(j - 1.5), 0.05), V(0.1 * s, 0.1 * s, 0.018 * s), 0.004 * s, basis(u, v));
      break;
    }
    case 'bells': {
      const F = fit('gold');
      for (const sd of [1, -1]) {
        const p = at(sd * 0.25, -0.35, 0.08);
        F.ellipsoid(p, V(0.1 * s, 0.11 * s, 0.1 * s), 0.02 * s);
        F.cone(p, p.clone().addScaledVector(DOWN, 0.16 * s), 0.08 * s, 0.14 * s, 0.03 * s);
      }
      break;
    }
    case 'stars': {
      const F = fit('glow');
      const c = at(0, 0, 0.04);
      for (const [x, y] of [[0.45, 0.06], [0.06, 0.45]] as const) F.box(c, V(x * s, y * s, 0.015 * s), 0.01 * s, 0.01 * s, basis(u, v).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), i * 0.4)));
      break;
    }
    case 'eyes': {
      const c = at(0, 0, 0.12);
      const big = i === 0 ? 1.5 : 1;
      const T = fit(k.trimmed ? 'trim' : 'gold');
      T.ellipsoid(c, V(0.36 * s * big, 0.2 * s * big, 0.1 * s), 0.02 * s, basis(u, v));
      fit('bone').ellipsoid(c.clone().addScaledVector(a.n, 0.05 * s), V(0.28 * s * big, 0.14 * s * big, 0.1 * s), 0.02 * s, basis(u, v));
      fit('glow').ellipsoid(c.clone().addScaledVector(a.n, 0.12 * s), V(0.1 * s * big, 0.1 * s * big, 0.06 * s), 0.01 * s);
      if (i === 0) for (const sd of [1, -1]) T.cone(c.clone().addScaledVector(u, sd * 0.3 * s * big), c.clone().addScaledVector(u, sd * 0.62 * s * big).addScaledVector(v, -0.08 * s), 0.05 * s, 0.006 * s, 0.01 * s);
      break;
    }
    case 'runes':
    case 'cracks': {
      const F = fit('glow');
      const segs = f === 'runes' ? [[0, 0.25, 0, -0.25], [-0.15, 0.1, 0.15, 0.1], [-0.12, -0.15, 0.12, -0.25]] : [[-0.4, 0.3, -0.1, 0.05], [-0.1, 0.05, 0.1, 0.15], [0.1, 0.15, 0.35, -0.2], [-0.1, 0.05, -0.05, -0.35]];
      for (const [x0, y0, x1, y1] of segs) {
        const p0 = at(x0!, y0!, 0.03);
        const p1 = at(x1!, y1!, 0.03);
        F.cone(p0, p1, 0.035 * s, 0.03 * s, 0.005 * s);
      }
      break;
    }
    case 'flames': {
      const F = fit('glow');
      for (let j = 0; j < 4; j++) {
        const b = at((j - 1.5) * 0.25, 0, 0.08);
        const top = b.clone().addScaledVector(UP, (0.55 + 0.25 * Math.sin(j * 2.3)) * s).addScaledVector(a.n, 0.15 * s).addScaledVector(u, Math.sin(j * 1.7) * 0.12 * s);
        F.cone(b, top, 0.12 * s, 0.01 * s, 0.05 * s);
      }
      break;
    }
    case 'frost': {
      const F = fit('gem');
      for (let j = 0; j < 4; j++) {
        const dir = a.n.clone().addScaledVector(UP, 0.4).addScaledVector(u, Math.cos(j * 1.6) * 0.6).addScaledVector(v, Math.sin(j * 1.6) * 0.3).normalize();
        const len = (0.3 + 0.08 * j) * s;
        F.box(a.p.clone().addScaledVector(dir, len * 0.7), V(0.05 * s, len, 0.05 * s), 0.01 * s, 0.01 * s, alongY(dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 4)));
      }
      break;
    }
    case 'ghost':
    case 'smoke': {
      const F = fit('ghost');
      for (let j = 0; j < 3; j++) {
        const c = at(Math.sin(j * 2.1) * 0.25, 0.25 + j * 0.3, 0.25 + 0.05 * j);
        F.ellipsoid(c, V((0.2 - 0.04 * j) * s, (0.3 - 0.05 * j) * s, (0.16 - 0.03 * j) * s), 0.15 * s);
      }
      break;
    }
    case 'blood': {
      const F = fit('blood');
      for (let j = 0; j < 3; j++) {
        const c = at((j - 1) * 0.3, -0.1 * j, 0.02);
        F.ellipsoid(c, V(0.07 * s, (0.22 + 0.08 * j) * s, 0.025 * s), 0.02 * s, basis(u, UP));
        F.ellipsoid(c.clone().addScaledVector(DOWN, (0.24 + 0.08 * j) * s), V(0.06 * s, 0.06 * s, 0.04 * s), 0.02 * s);
      }
      break;
    }
    case 'coils': {
      const F = fit('trim');
      for (let j = 0; j < 12; j++) {
        const t = (j / 12) * Math.PI * 2;
        F.ellipsoid(at(Math.cos(t) * 0.4, Math.sin(t) * 0.4, 0.04 + 0.015 * Math.sin(t * 3)), V(0.06 * s, 0.06 * s, 0.05 * s), 0.05 * s);
      }
      break;
    }
    case 'web': {
      const F = fit('bone');
      for (let j = 0; j < 4; j++) {
        const t = (j / 4) * Math.PI;
        const d = u.clone().multiplyScalar(Math.cos(t)).addScaledVector(v, Math.sin(t));
        F.cone(a.p.clone().addScaledVector(d, -0.5 * s).addScaledVector(a.n, 0.03 * s), a.p.clone().addScaledVector(d, 0.5 * s).addScaledVector(a.n, 0.03 * s), 0.012 * s, 0.012 * s, 0.004 * s);
      }
      for (let j = 0; j < 8; j++) {
        const t0 = (j / 8) * Math.PI * 2;
        const t1 = ((j + 1) / 8) * Math.PI * 2;
        F.cone(at(Math.cos(t0) * 0.3, Math.sin(t0) * 0.3, 0.03), at(Math.cos(t1) * 0.3, Math.sin(t1) * 0.3, 0.03), 0.01 * s, 0.01 * s, 0.004 * s);
      }
      break;
    }
    case 'vines': {
      const F = fit('leaf');
      let prev = at(-0.1, 0.5, 0.03);
      for (let j = 1; j <= 6; j++) {
        const p = at(Math.sin(j * 1.3) * 0.25, 0.5 - j * 0.18, 0.04);
        F.cone(prev, p, 0.04 * s, 0.035 * s, 0.01 * s);
        if (j % 2 === 0) F.ellipsoid(p.clone().addScaledVector(u, 0.1 * s), V(0.1 * s, 0.05 * s, 0.02 * s), 0.01 * s, basis(u, v));
        prev = p;
      }
      break;
    }
    case 'scales': {
      const F = fit('main');
      for (let j = 0; j < 6; j++) {
        const c = at(((j % 3) - 1) * 0.28 + (j >= 3 ? 0.14 : 0), j >= 3 ? -0.18 : 0.08, 0.05 + (j >= 3 ? 0.02 : 0));
        F.ellipsoid(c, V(0.16 * s, 0.14 * s, 0.03 * s), 0.01 * s, basis(u, v));
      }
      break;
    }
    case 'rivets': {
      const F = fit(k.trimmed ? 'trim' : 'iron');
      for (let j = 0; j < 6; j++) {
        const t = (j / 6) * Math.PI * 2;
        F.ellipsoid(at(Math.cos(t) * 0.4, Math.sin(t) * 0.3, 0.02), V(0.06 * s, 0.06 * s, 0.05 * s), 0.005 * s);
      }
      break;
    }
    case 'gilded': {
      const F = fit('gold');
      for (let j = 0; j < 7; j++) {
        const t0 = Math.PI * (0.1 + j * 0.115);
        const t1 = Math.PI * (0.1 + (j + 1) * 0.115);
        F.cone(at(Math.cos(t0) * 0.45, Math.sin(t0) * 0.3 - 0.1, 0.03), at(Math.cos(t1) * 0.45, Math.sin(t1) * 0.3 - 0.1, 0.03), 0.03 * s, 0.03 * s, 0.01 * s);
      }
      F.ellipsoid(at(0, 0.05, 0.04), V(0.08 * s, 0.08 * s, 0.04 * s), 0.01 * s);
      break;
    }
    case 'tatters': {
      const F = fit('cloth');
      for (let j = 0; j < 4; j++) {
        const top = at((j - 1.5) * 0.25, 0, 0.06);
        const len = (0.6 + 0.3 * ((j * 7) % 3)) * s;
        F.box(top.clone().addScaledVector(DOWN, len * 0.5), V(0.08 * s, len * 0.5, 0.012 * s), 0.008 * s, 0.006 * s, basis(u, UP).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), (j - 1.5) * 0.12)));
      }
      break;
    }
    case 'barnacles': {
      const F = fit('bone');
      for (let j = 0; j < 6; j++) {
        const t = j * 2.4;
        const c = at(Math.cos(t) * 0.3 * (j / 6), Math.sin(t) * 0.3 * (j / 6), 0.06);
        F.cone(c, c.clone().addScaledVector(a.n, 0.12 * s), (0.11 - 0.01 * j) * s, (0.06 - 0.005 * j) * s, 0.02 * s);
      }
      break;
    }
    case 'arrows': {
      const W = fit('wood');
      const C = fit('cloth');
      for (const sd of [1, -1]) {
        const b = at(sd * 0.2, sd * 0.15, 0);
        const dir = a.n.clone().addScaledVector(UP, 0.3).addScaledVector(u, sd * 0.3).normalize();
        const end = b.clone().addScaledVector(dir, 0.9 * s);
        W.cone(b, end, 0.022 * s, 0.022 * s, 0.004 * s);
        C.box(end.clone().addScaledVector(dir, -0.12 * s), V(0.07 * s, 0.14 * s, 0.006 * s), 0.004 * s, 0.002 * s, alongY(dir));
      }
      break;
    }
  }
}

/** How many anchors a feature takes on one piece. */
const SPREAD: Partial<Record<Feature, number>> = { wings: 1, halo: 1, chains: 2, arrows: 1, web: 2 };
/** Sculpts that carry a whole piece and are drawn larger still. */
const BIG_ROLES = new Set<Feature>(['dragons', 'antlers', 'spiders', 'moons', 'serpents']);

/** Features that dress both sides of the head from the crown alone. */
const PAIRED = new Set<Feature>(['horns', 'antlers', 'crowns']);

/** Dresses a piece with its unique's or set's features. */
export function dress(k: Kit, anchors: Anchor[]): void {
  const feats = k.look.features.slice(0, 3);
  const taken = new Set<Anchor>();
  for (const [fi, f] of feats.entries()) {
    // The signature (a set's sculpt, a unique's first feature) is drawn big
    // enough to read from the game camera; the rest stay accents.
    const big = fi === 0 ? (k.look.set ? 1.7 : k.look.unique ? 1.35 : 1) * (BIG_ROLES.has(f) ? 1.2 : 1) : 1;
    const pref = PREF[f] ?? ['chest'];
    const want = SPREAD[f] ?? 4;
    // Later features take spots the earlier ones left free, when there are any.
    const pick = (free: boolean): Anchor[] => {
      const used: Anchor[] = [];
      for (const role of pref) {
        for (const a of anchors) if (a.role === role && used.length < want && (!free || !taken.has(a))) used.push(a);
        const n = used.length + (PAIRED.has(f) && used.some((a) => a.role === 'crown') ? 1 : 0);
        if (n >= Math.min(want, 2)) break;
      }
      return used;
    };
    let used = pick(true);
    if (!used.length) used = pick(false);
    used.forEach((a, i) => {
      taken.add(a);
      place(k, f, big === 1 ? a : { ...a, s: a.s * big }, i);
    });
  }
}
