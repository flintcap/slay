/**
 * SLAY — the wild and the road: dead trees, stumps, fallen logs, ferns,
 * thorn bushes, reeds, mangrove roots, root tangles, mushrooms, lily pads,
 * broken carts, tents, wayside shrines, beast skulls and frozen banners.
 */
import * as THREE from 'three';
import type { Rng } from '../../types';
import { PropKit, WALL_FACE, box, branchPath, cloth, cone, cyl, disc, jag, lathe, log, merge, mottle, plank, rock, shade, shadeY, smooth, sphere, torus, tube, chain } from './Kit';
import { type BuildCtx, type Builder, M, flameGeo } from './Ctx';
import { flameMat, propMat } from './PropMats';
import { weather } from './Stone';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const W = WALL_FACE;

function leafMat(c: BuildCtx, tint = c.pal.leaf) {
  const col = new THREE.Color(tint).multiplyScalar(1.5);
  return propMat('foliage.pine', { base: col.getHex(), side: THREE.DoubleSide, grime: 0.4, grimeHeight: 0.3 });
}

/** A branch and its children, as tubes, into `out`. */
function branch(out: THREE.BufferGeometry[], from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, rng: Rng, depth: number): void {
  const pts = branchPath(from, dir, len, rng, 0.35, 4);
  out.push(tube(pts, r, r * 0.35, 5, 8));
  if (depth <= 0) return;
  const n = rng.int(1, 2);
  for (let i = 0; i < n; i++) {
    const at = pts[rng.int(1, pts.length - 2)]!;
    const d = dir.clone().add(V(rng.range(-0.9, 0.9), rng.range(-0.1, 0.5), rng.range(-0.9, 0.9))).normalize();
    branch(out, at, d, len * rng.range(0.45, 0.65), r * 0.5, rng, depth - 1);
  }
}

/** Root flares spreading from a trunk's foot. */
function roots(out: THREE.BufferGeometry[], r: number, n: number, reach: number, rng: Rng): void {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const d = reach * rng.range(0.7, 1);
    out.push(tube([V(Math.cos(a) * r * 0.4, r * 1.2, Math.sin(a) * r * 0.4), V(Math.cos(a) * r * 1.1, r * 0.3, Math.sin(a) * r * 1.1), V(Math.cos(a) * d, -0.04, Math.sin(a) * d)], r * 0.45, r * 0.12, 5, 6));
  }
}

const deadTree: Builder = (k, c) => {
  const bark = M.bark(c);
  const v = c.variant;
  const parts: THREE.BufferGeometry[] = [];
  const h = v === 2 ? 2.0 : 3.8 + v * 0.6;
  const r = 0.25 + v * 0.03;
  parts.push(log(h, r, k.rng, { seg: 9, taper: v === 2 ? 0.75 : 0.35, bend: 0.06, knots: 2 }));
  roots(parts, r, 5, 0.42, k.rng);
  if (v === 2) {
    // A snapped snag: splinters standing up from the break.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(cone(0.05, k.rng.range(0.2, 0.5), 4).translate(Math.cos(a) * r * 0.5, h - 0.05, Math.sin(a) * r * 0.5));
    }
    parts.push(branch2(k.rng, V(0, h * 0.6, 0), r));
  } else {
    const nb = 4 + v;
    for (let i = 0; i < nb; i++) {
      const t = 0.45 + (i / nb) * 0.5;
      const a = (i / nb) * Math.PI * 2 * 1.618 + k.rng.range(-0.3, 0.3);
      const d = V(Math.cos(a), k.rng.range(0.3, 0.9), Math.sin(a)).normalize();
      branch(parts, V(0, h * t, 0), d, h * k.rng.range(0.35, 0.5) * (1 - t * 0.35), r * 0.55 * (1 - t * 0.4), k.rng, 2);
    }
  }
  const g = merge(parts);
  mottle(g, k.rng, c.pal.stainAmt, 1.5, c.pal.stain);
  shadeY(g, 0, 0.8, 0.55);
  k.add(bark, g);
};

function branch2(rng: Rng, at: THREE.Vector3, r: number): THREE.BufferGeometry {
  const out: THREE.BufferGeometry[] = [];
  branch(out, at, V(0.7, 0.6, 0.2).normalize(), 0.9, r * 0.35, rng, 1);
  return merge(out);
}

const stump: Builder = (k, c) => {
  const bark = M.bark(c);
  const r = 0.28 + c.variant * 0.03;
  const h = 0.4 + c.variant * 0.15;
  const parts: THREE.BufferGeometry[] = [log(h, r, k.rng, { seg: 10, taper: 0.92, bend: 0.01, knots: 2 })];
  roots(parts, r, 5, 0.42, k.rng);
  const g = merge(parts);
  mottle(g, k.rng, c.pal.stainAmt, 2, c.pal.stain);
  k.add(bark, shadeY(g, 0, 0.5, 0.6));
  // The cut face: paler wood with rings, a little hollowed.
  const face = lathe([[0.0001, -0.02], [r * 0.4, 0], [r * 0.85, 0.01], [r * 0.92, 0]], 10);
  jag(face, k.rng, 0.01, 12);
  k.add(propMat('prop.timber.pale'), face, { y: h * 0.99 }, 0.9);
  if (c.variant === 2) k.add(M.iron(c), box(0.04, 0.3, 0.12, 0.008), { y: h - 0.05, rz: 0.4, x: 0.05 }, 0.8);
};

const fallenLog: Builder = (k, c) => {
  const bark = M.bark(c);
  const L = 1.0;
  const r = 0.2 + c.variant * 0.025;
  const g = log(L, r, k.rng, { seg: 9, taper: 0.85, bend: 0.03, knots: 2 });
  // Broken ends.
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > L - 0.01) p.setY(i, y + 0.08 * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 3 + 1));
  }
  g.computeVertexNormals();
  mottle(g, k.rng, c.pal.stainAmt * 1.2, 2.5, c.pal.leaf);
  k.add(bark, g, { x: -L / 2, y: r * 0.8, rz: -Math.PI / 2, ry: k.rng.range(-0.15, 0.15) });
  // A broken branch stub and some fungus.
  k.add(bark, log(0.35, 0.05, k.rng, { seg: 5, taper: 0.5 }), { x: 0.1, y: r * 1.3, z: 0.05, rz: -0.5, rx: 0.4 }, 0.9);
  const fung = propMat('flesh.rotted', { tint: 0x9a8a6a });
  for (let i = 0; i < 3; i++) {
    const s = lathe([[0.0001, 0.03], [0.05, 0.025], [0.07, 0], [0.0001, 0]], 7);
    k.add(fung, s, { x: k.rng.range(-0.3, 0.3), y: r * k.rng.range(0.6, 1.0), z: r * 0.95, rx: Math.PI / 2 }, 0.9);
  }
};

/** A curved frond strip, base at the origin, arching out along +Z. */
function frond(len: number, w: number, rng: Rng, arch = 0.5): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, len, 2, 6);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, len / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const t = z / len;
    const x = p.getX(i) * Math.sin(Math.min(1, t * 1.15) * Math.PI) * 1.2;
    p.setXYZ(i, x, Math.sin(t * Math.PI * 0.7) * len * arch - t * t * len * 0.3 + Math.abs(x) * 0.25, z);
  }
  g.computeVertexNormals();
  jag(g, rng, w * 0.05, 8);
  return g;
}

const fern: Builder = (k, c) => {
  const leaf = leafMat(c);
  const n = 7 + c.variant * 2;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const f = frond(k.rng.range(0.45, 0.75), k.rng.range(0.12, 0.18), k.rng, k.rng.range(0.35, 0.6));
    f.rotateY((i / n) * Math.PI * 2 + k.rng.range(-0.3, 0.3));
    shadeY(f, 0, 0.3, 0.45);
    mottle(f, k.rng, 0.5, 5, 0x8a7a40);
    parts.push(f);
  }
  k.add(leaf, merge(parts));
};

const thornBush: Builder = (k, c) => {
  const wood = M.bark(c);
  const parts: THREE.BufferGeometry[] = [];
  const n = 7 + c.variant * 2;
  for (let i = 0; i < n; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const d = V(Math.cos(a), k.rng.range(0.4, 1.2), Math.sin(a)).normalize();
    branch(parts, V(0, 0, 0), d, k.rng.range(0.45, 0.8), 0.032, k.rng, 1);
  }
  // Thorns along the canes.
  for (let i = 0; i < 24; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const r = k.rng.range(0.05, 0.45);
    const t = cone(0.008, 0.06, 3);
    t.rotateZ(k.rng.range(-1.5, 1.5));
    t.rotateY(k.rng.range(0, 6));
    t.translate(Math.cos(a) * r, k.rng.range(0.05, 0.5), Math.sin(a) * r);
    parts.push(t);
  }
  const g = merge(parts);
  shadeY(g, 0, 0.4, 0.5);
  k.add(wood, g, undefined, 0.75);
  // A few dead leaves clinging on.
  const dl = propMat('ground.leaves', { side: THREE.DoubleSide, grime: 0 });
  for (let i = 0; i < 8; i++) {
    const l = new THREE.CircleGeometry(0.04, 5);
    l.scale(1, 1.6, 1);
    k.add(dl, l, { x: k.rng.range(-0.35, 0.35), y: k.rng.range(0.15, 0.55), z: k.rng.range(-0.35, 0.35), rx: k.rng.range(0, 3), ry: k.rng.range(0, 3) }, 0.8);
  }
};

const reeds: Builder = (k, c) => {
  const leaf = leafMat(c, 0x7a7a4a);
  const parts: THREE.BufferGeometry[] = [];
  const heads: THREE.BufferGeometry[] = [];
  const n = 14 + c.variant * 5;
  for (let i = 0; i < n; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const d = k.rng.range(0, 0.32);
    const h = k.rng.range(0.55, 1.25);
    const blade = new THREE.PlaneGeometry(0.035, h, 1, 4);
    blade.translate(0, h / 2, 0);
    const p = blade.getAttribute('position') as THREE.BufferAttribute;
    const lean = k.rng.range(0.05, 0.3);
    for (let j = 0; j < p.count; j++) {
      const t = p.getY(j) / h;
      p.setX(j, p.getX(j) * (1 - t * 0.85) + t * t * lean * h);
    }
    blade.computeVertexNormals();
    blade.rotateY(k.rng.range(0, Math.PI));
    blade.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    shadeY(blade, 0, h * 0.5, 0.45);
    parts.push(blade);
    if (i % 4 === 0) {
      const hd = cyl(0.018, 0.018, 0.12, 5);
      hd.translate(Math.cos(a) * d + lean * h * 0.6, h * 0.82, Math.sin(a) * d);
      heads.push(hd);
    }
  }
  k.add(leaf, merge(parts));
  if (heads.length) k.add(propMat('leather.dark'), merge(heads), undefined, 0.8);
};

const mangroveRoots: Builder = (k, c) => {
  const bark = M.bark(c);
  const parts: THREE.BufferGeometry[] = [];
  // A short knotted bole on arching stilt roots.
  const bole = log(1.1, 0.16, k.rng, { seg: 8, taper: 0.6, bend: 0.05 });
  bole.translate(0, 0.45, 0);
  parts.push(bole);
  const n = 6 + c.variant;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + k.rng.range(-0.2, 0.2);
    const d = k.rng.range(0.38, 0.48);
    parts.push(tube([V(0, 0.75, 0), V(Math.cos(a) * d * 0.5, 0.75, Math.sin(a) * d * 0.5), V(Math.cos(a) * d, 0.35, Math.sin(a) * d), V(Math.cos(a) * d * 1.05, -0.05, Math.sin(a) * d * 1.05)], 0.06, 0.035, 5, 10));
  }
  const g = merge(parts);
  mottle(g, k.rng, c.pal.stainAmt, 2, c.pal.stain);
  k.add(bark, shadeY(g, 0, 0.4, 0.4));
};

const rootTangle: Builder = (k, c) => {
  const bark = M.bark(c);
  const parts: THREE.BufferGeometry[] = [];
  const n = 5 + c.variant * 2;
  for (let i = 0; i < n; i++) {
    const x = k.rng.range(-0.6, 0.6);
    const y = k.rng.range(1.6, 2.8);
    const x2 = x + k.rng.range(-0.3, 0.3);
    parts.push(tube([V(x, y, W + 0.03), V(x + k.rng.range(-0.15, 0.15), y - 0.4, W + 0.1), V(x2, y * 0.4, W + k.rng.range(0.05, 0.25)), V(x2 + k.rng.range(-0.2, 0.2), 0.0, W + k.rng.range(0.25, 0.5))], k.rng.range(0.03, 0.06), 0.015, 5, 10));
  }
  const g = merge(parts);
  mottle(g, k.rng, c.pal.stainAmt, 2, c.pal.stain);
  k.add(bark, g, undefined, 0.85);
};

const mushroomCluster: Builder = (k, c) => {
  const stem = propMat('flesh.pale', { tint: 0xb0a088 });
  const cap = propMat('flesh.rotted', { tint: c.biome === 'caverns' ? 0x8a6a50 : 0x7a5a40 });
  const n = 4 + c.variant * 2;
  for (let i = 0; i < n; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const d = i === 0 ? 0 : k.rng.range(0.08, 0.35);
    const h = i === 0 ? k.rng.range(0.3, 0.5) : k.rng.range(0.08, 0.28);
    const r = h * k.rng.range(0.4, 0.7);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const lean = k.rng.range(-0.2, 0.2);
    k.add(stem, cyl(r * 0.18, r * 0.25, h, 6), { x, z, rz: lean }, 0.9);
    const cp = lathe([[0.0001, r * 0.55], [r * 0.6, r * 0.5], [r, r * 0.15], [r * 0.92, 0], [0.0001, 0.02]], 9);
    jag(cp, k.rng, r * 0.05, 8 / r);
    mottle(cp, k.rng, 0.5, 9 / r, 0xd0c0a0);
    k.add(cap, cp, { x: x - Math.sin(lean) * h, y: h * Math.cos(lean) - 0.01, z, rz: lean });
  }
};

const lilyPad: Builder = (k, c) => {
  const leaf = leafMat(c, 0x5a6a3a);
  const n = 3 + c.variant;
  for (let i = 0; i < n; i++) {
    const r = k.rng.range(0.1, 0.2);
    const g = new THREE.CircleGeometry(r, 12, 0.3, Math.PI * 2 - 0.3);
    g.rotateX(-Math.PI / 2);
    jag(g, k.rng, 0.006, 10);
    k.add(leaf, g, { x: k.rng.range(-0.4, 0.4), y: 0.03, z: k.rng.range(-0.4, 0.4), ry: k.rng.range(0, 6) }, k.rng.range(0.7, 1));
  }
  if (c.variant === 2) k.add(propMat('cloth.linen', { tint: 0xd8d0c0, grime: 0 }), lathe([[0.0001, 0], [0.05, 0.03], [0.03, 0.07], [0.0001, 0.05]], 6), { y: 0.03 }, 0.95);
};

const cart: Builder = (k, c) => {
  const wood = M.planks(c);
  const timber = M.wood(c);
  const iron = M.iron(c);
  const v = c.variant;
  // Bed of boards on two beams, side rails, an axle, wheels (one fallen), shafts down.
  const tilt = v === 0 ? 0.12 : 0;
  const bedY = 0.55;
  for (const s of [-1, 1]) k.box(timber, 1.35, 0.1, 0.1, { y: bedY - 0.1, z: s * 0.32, rz: tilt }, 0.85);
  for (let i = 0; i < 6; i++) k.plank(wood, 0.78, 0.2, 0.04, { x: -0.55 + i * 0.22, y: bedY + i * 0.22 * Math.sin(tilt) * 0, z: 0, ry: Math.PI / 2, rz: 0 }, k.rng.range(0.7, 1));
  for (const s of [-1, 1]) {
    k.plank(wood, 1.3, 0.18, 0.04, { y: bedY + 0.2, z: s * 0.4, rx: Math.PI / 2 }, 0.85);
    for (const x of [-0.6, 0, 0.6]) k.box(timber, 0.06, 0.3, 0.06, { x, y: bedY, z: s * 0.4 }, 0.8);
  }
  k.add(timber, cyl(0.04, 0.04, 1.0, 6).rotateX(Math.PI / 2), { y: 0.38, x: 0.1 }, 0.75);
  const wheel = (t: Parameters<PropKit['add']>[2]) => {
    const parts: THREE.BufferGeometry[] = [torus(0.36, 0.045, 5, 18).scale(1, 1, 1.4)];
    for (let i = 0; i < 8; i++) parts.push(box(0.035, 0.66, 0.035, 0.005).rotateZ((i / 8) * Math.PI));
    parts.push(cyl(0.07, 0.07, 0.12, 8).rotateX(Math.PI / 2).translate(0, 0, -0.06));
    const g = merge(parts);
    jag(g, k.rng, 0.006, 10);
    k.add(timber, g, t, 0.8);
    k.add(iron, torus(0.37, 0.012, 3, 18).scale(1, 1, 3), t, 0.7);
  };
  wheel({ x: 0.1, y: 0.38, z: 0.5 });
  if (v === 0) wheel({ x: 0.3, y: 0.06, z: -0.62, rx: Math.PI / 2, ry: 0.3 });
  else wheel({ x: 0.1, y: 0.38, z: -0.5 });
  for (const s of [-1, 1]) k.box(timber, 0.9, 0.06, 0.06, { x: -1.0, y: 0.18, z: s * 0.22, rz: 0.4 }, 0.8);
  if (v === 1) {
    // Cargo: a barrel and sacks.
    k.add(propMat('cloth.undyed', { tint: 0x8a7a5a }), sphere(0.2, 8, 6).scale(1.2, 0.8, 1), { x: 0.3, y: bedY + 0.16, z: 0.1 }, 0.85);
    k.add(propMat('cloth.undyed', { tint: 0x8a7a5a }), sphere(0.18, 8, 6).scale(1.1, 0.8, 1), { x: -0.1, y: bedY + 0.14, z: -0.15 }, 0.75);
  }
};

const tent: Builder = (k, c) => {
  const canvas = propMat('cloth.homespun', { base: c.outdoor ? 0x8a7a60 : 0x6a5a48, side: THREE.DoubleSide, grime: 0.8, grimeHeight: 0.6 });
  const wood = M.wood(c);
  const L = 1.6;
  const Wd = 1.5;
  const H = 1.35;
  // Two sagging canvas slopes over a ridge pole; a dark opening at the front.
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(L, Math.hypot(Wd / 2, H), 6, 4);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / L + 0.5;
      const t = p.getY(i) / Math.hypot(Wd / 2, H) + 0.5;
      p.setZ(i, -Math.sin(u * Math.PI) * Math.sin(t * Math.PI) * 0.06);
    }
    g.computeVertexNormals();
    jag(g, k.rng, 0.01, 6);
    mottle(g, k.rng, 0.6, 2.5);
    shadeY(g, -0.7, 0.2, 0.55);
    const ang = Math.atan2(H, Wd / 2);
    k.add(canvas, g, { x: 0, y: H / 2, z: s * Wd / 4, rx: -s * (Math.PI / 2 - ang), ry: 0 });
  }
  // The back wall, a triangle; the front left open.
  const tri = new THREE.Shape();
  tri.moveTo(-Wd / 2, 0);
  tri.lineTo(Wd / 2, 0);
  tri.lineTo(0, H);
  tri.closePath();
  k.add(canvas, new THREE.ShapeGeometry(tri), { x: -L / 2, ry: Math.PI / 2 }, 0.7);
  k.add(propMat('ground.mud', { tint: 0x14100c, side: THREE.DoubleSide }), new THREE.ShapeGeometry(tri), { x: -L / 2 + 0.3, ry: Math.PI / 2, s: 0.92 }, 0.4);
  for (const x of [-L / 2, L / 2]) k.add(wood, log(H + 0.15, 0.03, k.rng, { seg: 5 }), { x }, 0.8);
  k.add(wood, cyl(0.03, 0.03, L + 0.2, 5).rotateZ(Math.PI / 2).translate(0, 0, 0), { y: H }, 0.8);
  // Guy ropes and pegs.
  const rope = propMat('cloth.undyed', { tint: 0x8a7a5a });
  for (const [x, z] of [[L / 2 + 0.25, 0], [-L / 2 - 0.25, 0]]) {
    k.add(rope, tube([V(x > 0 ? L / 2 : -L / 2, H, 0), V(x, 0.02, z)], 0.008, 0.008, 3, 2), undefined, 0.9);
    k.add(wood, cone(0.02, 0.12, 4), { x, y: 0.1, rx: Math.PI }, 0.8);
  }
  if (c.variant === 1) k.add(propMat('leather.hide', { side: THREE.DoubleSide }), box(0.7, 0.02, 0.5, 0.005), { x: 0.9, y: 0.0, z: 0.1, ry: 0.2 }, 0.8);
};

const wayShrine: Builder = (k, c) => {
  const wood = M.wood(c);
  const st = M.stone(c);
  // A post with a little roofed box, a candle inside, offerings at its foot.
  const ring = merge([0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2;
    return rock(0.1, k.rng, { flat: 0.7 }).translate(Math.cos(a) * 0.17, 0.05, Math.sin(a) * 0.17);
  }));
  k.add(M.rock(c), ring, undefined, 0.8);
  if (c.variant === 0) {
    k.add(wood, log(1.0, 0.07, k.rng, { seg: 6, taper: 0.9 }), undefined, 0.8);
    k.box(wood, 0.36, 0.34, 0.28, { y: 0.95 }, 0.8);
    for (const s of [-1, 1]) k.plank(wood, 0.36, 0.3, 0.03, { y: 1.38, z: s * 0.1, rx: s * 0.65 }, 0.8);
  } else {
    k.add(st, weather(box(0.3, 0.95, 0.26, 0.03).translate(0, 0.475, 0), c, k.rng));
    k.box(st, 0.4, 0.08, 0.34, { y: 1.28 }, 0.85);
  }
  k.add(c.variant === 0 ? wood : st, box(0.24, 0.22, 0.01, 0.002), { y: c.variant === 0 ? 1.07 : 1.0, z: 0.14 }, 0.12);
  const wax = propMat('bone.pale', { tint: 0xd8ccb0, grime: 0 });
  const cy = c.variant === 0 ? 0.97 : 0.9;
  k.add(wax, cyl(0.025, 0.028, 0.1, 6), { y: cy, z: 0.12 }, 0.9);
  k.flame(flameMat(c.pal.flame), flameGeo(0.07, 0.016, k.rng), cy + 0.1, 0.12);
};

const beastSkull: Builder = (k, c) => {
  const bone = M.bone(c);
  // A long horned skull and a few vertebrae.
  const head = sphere(0.16, 10, 8);
  head.scale(0.9, 0.75, 1.0);
  const snout = cyl(0.06, 0.11, 0.38, 8);
  snout.rotateX(Math.PI / 2);
  snout.translate(0, -0.02, 0.15);
  const g = smooth(merge([head, snout]));
  jag(g, k.rng, 0.01, 12);
  k.add(bone, g, { y: 0.1, rx: 0.15 }, 0.85);
  for (const s of [-1, 1]) {
    const horn = tube([V(s * 0.1, 0.18, -0.02), V(s * 0.3, 0.26, -0.1), V(s * 0.42, 0.38, 0.05), V(s * 0.4, 0.5, 0.2)], 0.045, 0.008, 6, 10);
    k.add(bone, horn, undefined, 0.75);
  }
  for (let i = 0; i < 3 + c.variant; i++) k.add(bone, cyl(0.04, 0.04, 0.05, 6).rotateX(Math.PI / 2), { z: -0.25 - i * 0.07, y: 0.04, x: Math.sin(i) * 0.03 }, 0.8);
};

const frozenBanner: Builder = (k, c) => {
  const wood = M.wood(c);
  const h = 2.4;
  k.add(wood, log(h, 0.05, k.rng, { seg: 6, taper: 0.8 }), { rz: k.rng.range(-0.08, 0.08) }, 0.8);
  k.add(wood, cyl(0.025, 0.025, 0.7, 5).rotateZ(Math.PI / 2), { y: h - 0.1, x: 0.33 }, 0.8);
  const cl = cloth(0.6, 1.1, k.rng, { tatter: 0.45, ripple: 0.02, flare: 0.02 });
  mottle(cl, k.rng, 0.5, 3);
  k.add(M.cloth(c), cl, { y: h - 0.12, x: 0.33, z: 0.03 });
  // Frost: rime caked on top and icicles hanging off the hem.
  const rime = propMat('crystal.frost');
  k.add(rime, box(0.7, 0.05, 0.07, 0.02), { y: h - 0.08, x: 0.33 }, 0.95);
  for (let i = 0; i < 5; i++) {
    const ic = cone(0.015, k.rng.range(0.08, 0.2), 4);
    ic.rotateX(Math.PI);
    k.add(rime, ic, { x: 0.08 + i * 0.12, y: h - 0.12 - 1.0 + k.rng.range(-0.1, 0.1), z: 0.04 }, 0.95);
  }
  k.add(propMat('ground.snow'), sphere(0.22, 8, 5).scale(1, 0.35, 1), { y: 0.0 }, 1);
};

export const WILD: Record<string, Builder> = {
  deadTree,
  stump,
  fallenLog,
  fern,
  thornBush,
  reeds,
  mangroveRoots,
  rootTangle,
  mushroomCluster,
  lilyPad,
  cart,
  tent,
  wayShrine,
  beastSkull,
  frozenBanner,
};

void shade;
void disc;
void plank;
void chain;
