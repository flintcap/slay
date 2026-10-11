/**
 * SLAY — the dead and what holds them: sarcophagi, coffins, bone piles,
 * skull heaps, wall skulls, hanging chains, banners, ossuaries, gibbets,
 * cages, stakes and impalers.
 */
import * as THREE from 'three';
import type { Rng } from '../../types';
import { PropKit, WALL_FACE, box, chain, cloth, cone, cyl, disc, jag, lathe, log, longBone, merge, mottle, rock, seat, shade, shadeY, skull, sphere, torus, tube } from './Kit';
import { type BuildCtx, type Builder, M } from './Ctx';
import { flameMat, propMat } from './PropMats';
import { weather } from './Stone';
import { flameGeo } from './Ctx';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const W = WALL_FACE;

/** A rib cage: a spine and curved ribs, lying along X, centred. */
function ribs(rng: Rng, s = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spine = cyl(0.018 * s, 0.018 * s, 0.42 * s, 5);
  spine.rotateZ(Math.PI / 2);
  spine.translate(0.21 * s, 0, 0);
  parts.push(spine);
  for (let i = 0; i < 6; i++) {
    const r = (0.1 - Math.abs(i - 2) * 0.012) * s;
    const rib = torus(r, 0.008 * s, 3, 10, Math.PI * 1.25);
    rib.rotateZ(-Math.PI * 0.125);
    rib.rotateY(Math.PI / 2);
    rib.translate((-0.17 + i * 0.065) * s, r * 0.9, 0);
    parts.push(rib);
  }
  const g = merge(parts);
  jag(g, rng, 0.004 * s, 20);
  return g;
}

/** A skeleton sprawled on its back, about 1.6 m, along X, head at -X. */
export function skeleton(k: PropKit, c: BuildCtx, t: { x?: number; y?: number; z?: number; ry?: number; s?: number } = {}): void {
  const bone = M.bone(c);
  const s = t.s ?? 1;
  const parts: THREE.BufferGeometry[] = [];
  const sk = skull(k.rng, s);
  sk.rotateX(-Math.PI / 2 + k.rng.range(-0.3, 0.3));
  sk.rotateY(k.rng.range(-0.5, 0.5));
  sk.translate(-0.72 * s, 0.08 * s, 0);
  parts.push(sk);
  parts.push(ribs(k.rng, s).translate(-0.3 * s, 0.02 * s, 0));
  const pelvis = sphere(0.09 * s, 7, 5);
  pelvis.scale(0.8, 0.5, 1.3);
  pelvis.translate(0.02 * s, 0.05 * s, 0);
  parts.push(pelvis);
  for (const side of [-1, 1]) {
    const a = k.rng.range(-0.25, 0.25);
    parts.push(longBone(0.42 * s, 0.022 * s).rotateY(a).translate(0.26 * s, 0.03 * s, side * 0.09 * s));
    parts.push(longBone(0.38 * s, 0.018 * s).rotateY(a * 1.5).translate(0.65 * s, 0.03 * s, side * (0.11 + a * 0.2) * s));
    const arm = k.rng.range(-0.8, 0.8);
    parts.push(longBone(0.28 * s, 0.016 * s).rotateY(arm).translate(-0.4 * s, 0.03 * s, side * 0.18 * s));
    parts.push(longBone(0.25 * s, 0.013 * s).rotateY(arm * 1.4).translate(-0.18 * s, 0.03 * s, side * (0.25 + arm * 0.05) * s));
  }
  const g = merge(parts);
  mottle(g, k.rng, 0.5, 6, 0x6a5a40);
  k.add(bone, g, { x: t.x, y: t.y, z: t.z, ry: t.ry });
}

/** A handful of loose bones and maybe a skull, scattered within `r`. */
function scatterBones(k: PropKit, c: BuildCtx, n: number, r: number, skulls: number): void {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const d = k.rng.range(0, r);
    const b = longBone(k.rng.range(0.18, 0.42), k.rng.range(0.012, 0.022));
    b.rotateY(k.rng.range(0, Math.PI));
    b.rotateZ(k.rng.range(-0.12, 0.12));
    b.translate(Math.cos(a) * d, 0.022 + i * 0.006, Math.sin(a) * d);
    parts.push(b);
  }
  for (let i = 0; i < skulls; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const d = k.rng.range(0, r * 0.7);
    const sk = skull(k.rng, k.rng.range(0.9, 1.05));
    sk.rotateY(k.rng.range(0, Math.PI * 2));
    sk.rotateZ(k.rng.range(-0.5, 0.5));
    sk.translate(Math.cos(a) * d, 0.09, Math.sin(a) * d);
    parts.push(sk);
  }
  const g = merge(parts);
  mottle(g, k.rng, 0.55, 5, 0x5a4a34);
  k.add(M.bone(c), g);
}

const sarcophagus: Builder = (k, c) => {
  const st = M.stone(c);
  const v = c.variant;
  const L = 1.5;
  const D = 0.74;
  // Plinth, chest with panelled sides, lid with a carved effigy.
  const base = box(L + 0.12, 0.12, D + 0.12, 0.03, 2);
  jag(base, k.rng, 0.01, 6);
  k.add(st, weather(base.translate(0, 0.06, 0), c, k.rng, 1, 0.3));
  const chest = box(L, 0.55, D, 0.03, 3);
  jag(chest, k.rng, 0.012, 5);
  k.add(st, weather(chest.translate(0, 0.395, 0), c, k.rng, 1.2, 0.6));
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) k.box(st, 0.36, 0.3, 0.03, { x: -0.48 + i * 0.48, y: 0.24, z: s * (D / 2 + 0.005) }, 0.78, 0.01);
  const lid = box(L + 0.06, 0.12, D + 0.06, 0.035, 2);
  jag(lid, k.rng, 0.01, 6);
  const effigy = merge([
    lathe([[0.2, 0], [0.18, 0.55], [0.15, 0.95], [0.0001, 1.0]], 8).rotateZ(-Math.PI / 2).scale(1, 0.32, 1),
    sphere(0.12, 8, 6).scale(1, 0.75, 1).translate(1.08, 0.02, 0),
  ]);
  effigy.translate(-0.6, 0.06, 0);
  jag(effigy, k.rng, 0.01, 8);
  const top = merge([lid, effigy]);
  weather(top, c, k.rng, 1.1, 0.2);
  if (v === 1) {
    // Shoved aside: the lid askew and the dark hollow showing.
    k.add(propMat('ground.mud', { tint: 0x1a1612 }), box(L - 0.12, 0.01, D - 0.12, 0.002), { y: 0.67 }, 0.4);
    k.add(st, top, { x: 0.18, y: 0.74, z: 0.22, ry: 0.32, rz: 0.06 });
    scatterBones(k, c, 4, 0.35, 1);
  } else {
    k.add(st, top, { y: 0.73 });
  }
  if (v === 2) {
    // Cracked open at the corner, bones spilled out.
    k.add(st, weather(rock(0.15, k.rng, { flat: 0.7 }), c, k.rng), { x: 0.75, y: 0.08, z: 0.5 });
    scatterBones(k, c, 5, 0.3, 1);
  }
};

const coffin: Builder = (k, c) => {
  const wood = M.wood(c);
  const iron = M.iron(c);
  const v = c.variant;
  // The classic six-sided shape, extruded.
  const sh = new THREE.Shape();
  const L = 1.0;
  sh.moveTo(-L / 2, -0.17);
  sh.lineTo(L * 0.18, -0.26);
  sh.lineTo(L / 2, -0.15);
  sh.lineTo(L / 2, 0.15);
  sh.lineTo(L * 0.18, 0.26);
  sh.lineTo(-L / 2, 0.17);
  sh.closePath();
  const body = new THREE.ExtrudeGeometry(sh, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1 });
  body.rotateX(-Math.PI / 2);
  jag(body, k.rng, 0.006, 8);
  const lid = new THREE.ExtrudeGeometry(sh, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.02, bevelSegments: 1 });
  lid.rotateX(-Math.PI / 2);
  jag(lid, k.rng, 0.006, 8);
  mottle(body, k.rng, 0.5, 4);
  mottle(lid, k.rng, 0.5, 4);
  k.add(wood, body, { y: 0.02 }, 0.8);
  if (v === 1) {
    k.add(wood, lid, { x: 0.12, y: 0.42, z: 0.18, ry: 0.4, rz: 0.12 }, 0.9);
    k.add(propMat('ground.mud', { tint: 0x16120e }), box(0.85, 0.01, 0.38, 0.002), { y: 0.36 }, 0.4);
  } else {
    k.add(wood, lid, { y: 0.38 }, 0.95);
    for (const x of [-0.3, 0.25]) k.box(iron, 0.05, 0.47, 0.54 + (x > 0 ? 0.04 : 0), { x, y: -0.02 }, 0.8, 0.005);
    if (v === 2) k.add(iron, chain(V(-0.45, 0.46, 0), V(0.45, 0.46, 0), 0.02, 0.06), undefined, 0.8);
  }
};

const bonepile: Builder = (k, c) => {
  scatterBones(k, c, 7 + c.variant * 3, 0.45, c.variant === 0 ? 1 : 2);
  if (c.variant === 3) skeleton(k, c, { ry: k.rng.range(0, 3), s: 0.85 });
};

const skullPile: Builder = (k, c) => {
  // A dirt-and-bone mound with skulls set into its skin.
  const mound = sphere(0.42, 12, 8);
  mound.scale(1, 0.55, 1);
  mound.translate(0, 0.14, 0);
  jag(mound, k.rng, 0.05, 4);
  seat(mound);
  k.add(propMat('ground.dirt'), shadeY(mound, -0.1, 0.25, 0.7));
  const parts: THREE.BufferGeometry[] = [];
  const n = 10 + c.variant * 4;
  for (let i = 0; i < n; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const el = k.rng.range(0.1, 1.3);
    const x = Math.cos(a) * Math.cos(el) * 0.38;
    const z = Math.sin(a) * Math.cos(el) * 0.38;
    const y = Math.sin(el) * 0.22 + 0.04;
    const sk = skull(k.rng, k.rng.range(0.85, 1.05));
    sk.rotateX(k.rng.range(-0.6, 0.3));
    sk.rotateY(a + Math.PI / 2 + k.rng.range(-0.8, 0.8) - Math.PI / 2);
    sk.translate(x, y, z);
    parts.push(sk);
  }
  const top = skull(k.rng, 1.05);
  top.translate(0, 0.3, 0);
  parts.push(top);
  const g = merge(parts);
  mottle(g, k.rng, 0.5, 6, 0x5a4a34);
  k.add(M.bone(c), g);
};

const wallSkull: Builder = (k, c) => {
  const bone = M.bone(c);
  const v = c.variant;
  if (v === 1) {
    // A burial niche with skulls stacked in it.
    const st = M.stone(c);
    k.box(st, 0.8, 0.08, 0.3, { y: 1.1, z: W + 0.15 }, 0.85, 0.02);
    k.box(st, 0.8, 0.08, 0.3, { y: 1.6, z: W + 0.15 }, 0.85, 0.02);
    k.add(propMat('ground.mud', { tint: 0x14110e }), box(0.72, 0.42, 0.01), { y: 1.39, z: W + 0.01 }, 0.4);
    for (let i = 0; i < 3; i++) k.add(bone, skull(k.rng, 1.0), { x: -0.24 + i * 0.24, y: 1.27, z: W + 0.13, ry: k.rng.range(-0.3, 0.3) }, k.rng.range(0.75, 0.95));
    for (let i = 0; i < 4; i++) k.add(bone, longBone(0.36, 0.018), { y: 1.46 + i * 0.03, z: W + 0.12 + k.rng.range(-0.04, 0.04), ry: k.rng.range(-0.15, 0.15) }, 0.8);
    return;
  }
  // A skull on an iron spike, crossed bones under it (v 2) or a candle on it (v 0).
  const iron = M.iron(c);
  k.add(iron, cone(0.02, 0.32, 5).rotateX(Math.PI / 2), { y: 1.7, z: W }, 0.75);
  k.add(bone, skull(k.rng, 1.15), { y: 1.7, z: W + 0.12, rx: 0.15 }, 0.88);
  if (v === 2) {
    for (const s of [-1, 1]) k.add(bone, longBone(0.5, 0.022), { y: 1.42, z: W + 0.05, rz: s * 0.7 }, 0.85);
  } else {
    const wax = propMat('bone.pale', { tint: 0xd8ccb0, grime: 0 });
    k.add(wax, cyl(0.022, 0.025, 0.1, 6), { y: 1.81, z: W + 0.1 }, 0.9);
    k.add(wax, lathe([[0.0001, 0], [0.03, 0.01], [0.02, 0.1], [0.0001, 0.12]], 6), { y: 1.72, z: W + 0.13, sy: 1.1 }, 0.85);
  }
};

const chainK: Builder = (k, c) => {
  const iron = M.iron(c);
  const v = c.variant;
  // Rings in the wall, chains sagging between them or hanging with shackles.
  const rings: Array<[number, number]> = v === 0 ? [[-0.35, 2.1], [0.35, 2.1]] : v === 1 ? [[0, 2.3]] : [[-0.4, 2.2], [0.1, 1.9]];
  for (const [x, y] of rings) {
    k.add(iron, box(0.07, 0.07, 0.04, 0.01), { x, y, z: W + 0.02 }, 0.7);
    k.add(iron, torus(0.04, 0.009, 4, 10), { x, y: y - 0.04, z: W + 0.05 }, 0.8);
  }
  if (v === 0) {
    k.add(iron, chain(V(-0.35, 2.05, W + 0.06), V(0.35, 2.05, W + 0.06), 0.45, 0.06), undefined, 0.8);
    k.add(iron, chain(V(-0.35, 2.05, W + 0.07), V(-0.35, 1.25, W + 0.1), 0, 0.06), undefined, 0.8);
    k.add(iron, torus(0.06, 0.016, 4, 10), { x: -0.35, y: 1.2, z: W + 0.1 }, 0.8);
  } else {
    for (const [x, y] of rings) {
      const end = y - k.rng.range(0.9, 1.3);
      k.add(iron, chain(V(x, y - 0.06, W + 0.06), V(x + 0.02, end, W + 0.08), 0, 0.06), undefined, 0.8);
      k.add(iron, torus(0.065, 0.018, 4, 10), { x, y: end - 0.06, z: W + 0.09, ry: 0.5 }, 0.75);
    }
  }
};

const banner: Builder = (k, c) => {
  const iron = M.iron(c);
  const v = c.variant;
  // An iron rod on two brackets, a long tattered banner with a sigil.
  const y = 2.6;
  for (const s of [-1, 1]) k.add(iron, box(0.04, 0.1, 0.14, 0.01), { x: s * 0.36, y: y - 0.05, z: W + 0.07 }, 0.75);
  k.add(iron, cyl(0.018, 0.018, 0.86, 6).rotateZ(Math.PI / 2), { y: y + 0.02, z: W + 0.12 }, 0.8);
  for (const s of [-1, 1]) k.add(iron, sphere(0.03, 6, 4), { x: s * 0.44, y: y + 0.02, z: W + 0.12 }, 0.8);
  const h = 1.5 - v * 0.15;
  const cl = cloth(0.66, h, k.rng, { tatter: 0.3 + v * 0.15, ripple: 0.03, flare: 0.05 });
  mottle(cl, k.rng, 0.6, 3);
  shadeY(cl, -h, 0, 0.5);
  k.add(M.cloth(c), cl, { y: y, z: W + 0.13 });
  // The sigil, a paler cloth patch.
  const sig = propMat('cloth.linen', { tint: 0x9a8a6a, side: THREE.DoubleSide, grime: 0 });
  const mark = new THREE.CircleGeometry(0.16, v === 1 ? 3 : v === 2 ? 4 : 12);
  k.add(sig, mark, { y: y - 0.5, z: W + 0.16 }, 0.9);
};

const ossuary: Builder = (k, c) => {
  const st = M.stone(c);
  const bone = M.bone(c);
  // A stone frame, three shelves deep in skulls and long bones, candles on the ledge.
  const wd = 1.6;
  for (const s of [-1, 1]) {
    const post = box(0.22, 2.2, 0.6, 0.03, 3);
    jag(post, k.rng, 0.012, 5);
    k.add(st, weather(post.translate(s * (wd / 2 - 0.11), 1.1, -0.1), c, k.rng));
  }
  k.add(st, weather(box(wd + 0.16, 0.22, 0.7, 0.03).translate(0, 2.28, -0.1), c, k.rng), undefined, 0.9);
  k.add(st, weather(box(wd, 0.12, 0.6, 0.03).translate(0, 0.06, -0.1), c, k.rng));
  k.add(st, box(wd - 0.44, 2.1, 0.08, 0.02), { y: 1.05, z: -0.38 }, 0.45);
  const shelfY = [0.12, 0.78, 1.44];
  for (const y of shelfY) {
    if (y > 0.2) k.box(st, wd - 0.44, 0.07, 0.56, { y: y - 0.07, z: -0.1 }, 0.8, 0.015);
    const parts: THREE.BufferGeometry[] = [];
    // A course of long bones, ends out, under a row of skulls.
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 1; j++) {
        const b = longBone(0.48, 0.02);
        b.rotateY(Math.PI / 2 + k.rng.range(-0.08, 0.08));
        b.translate(-0.5 + i * 0.165, y + 0.03 + j * 0.045, -0.12);
        parts.push(b);
      }
    }
    for (let i = 0; i < 5; i++) {
      const sk = skull(k.rng, 1.05);
      sk.rotateY(k.rng.range(-0.25, 0.25));
      sk.translate(-0.46 + i * 0.23, y + 0.21, 0.04);
      parts.push(sk);
    }
    const g = merge(parts);
    mottle(g, k.rng, 0.5, 6, 0x5a4a34);
    shadeY(g, y, y + 0.5, 0.65);
    k.add(bone, g);
  }
  // Candles on the bottom ledge, and their flames (the light sits here).
  const wax = propMat('bone.pale', { tint: 0xd8ccb0, grime: 0 });
  const flames: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const x = -0.45 + i * 0.3 + k.rng.range(-0.05, 0.05);
    const h = k.rng.range(0.08, 0.2);
    k.add(wax, cyl(0.026, 0.03, h, 6), { x, y: 0.12, z: 0.12 }, 0.9);
    const f = flameGeo(0.07, 0.016, k.rng);
    f.translate(x, 0.12 + h - 0.3, 0.12);
    flames.push(f);
  }
  k.flame(flameMat(c.pal.flame), merge(flames), 0.3, 0);
};

const gibbet: Builder = (k, c) => {
  const wood = M.wood(c);
  const iron = M.iron(c);
  // A tall post with a braced arm, an iron cage hanging off it with someone's remains.
  k.add(wood, log(3.1, 0.11, k.rng, { seg: 7, taper: 0.85, bend: 0.01 }), undefined, 0.8);
  k.add(wood, box(0.12, 0.12, 1.1, 0.02), { y: 2.9, z: 0.45 }, 0.8);
  k.add(wood, box(0.08, 0.08, 0.7, 0.015), { y: 2.6, z: 0.22, rx: -0.75 }, 0.75);
  const ring = merge([0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2;
    return rock(0.1, k.rng, { flat: 0.7 }).translate(Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2);
  }));
  k.add(M.rock(c), ring, undefined, 0.8);
  const cz = 0.85;
  k.add(iron, chain(V(0, 2.85, cz), V(0, 2.4, cz), 0, 0.05), undefined, 0.8);
  // A body-shaped cage: rings and bars.
  const top = 2.35;
  const bot = 1.05 + c.variant * 0.1;
  for (const [y, r] of [[top, 0.16], [top - 0.35, 0.24], [(top + bot) / 2 - 0.1, 0.22], [bot + 0.08, 0.18]] as const) k.add(iron, torus(r, 0.012, 4, 12), { y, z: cz, rx: Math.PI / 2 }, 0.8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.add(iron, tube([V(Math.cos(a) * 0.14, top, cz + Math.sin(a) * 0.14), V(Math.cos(a) * 0.24, top - 0.35, cz + Math.sin(a) * 0.24), V(Math.cos(a) * 0.17, bot + 0.08, cz + Math.sin(a) * 0.17), V(0, bot, cz)], 0.01, 0.01, 4), undefined, 0.8);
  }
  const bone = M.bone(c);
  k.add(bone, skull(k.rng, 1), { y: top - 0.16, z: cz, rx: 0.5, rz: 0.3 }, 0.85);
  k.add(bone, ribs(k.rng, 0.9).rotateZ(Math.PI / 2), { y: top - 0.75, z: cz }, 0.85);
};

const cage: Builder = (k, c) => {
  const iron = M.iron(c);
  const v = c.variant;
  const w = 0.95;
  const h = 1.5;
  // Frame, bars, a door that may hang open, a skeleton inside.
  for (const y of [0.04, h]) {
    for (const s of [-1, 1]) {
      k.box(iron, w, 0.06, 0.06, { y: y - 0.03, z: s * w / 2 }, 0.75, 0.01);
      k.box(iron, 0.06, 0.06, w, { y: y - 0.03, x: s * w / 2 }, 0.75, 0.01);
    }
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(iron, 0.07, h, 0.07, { x: sx * w / 2, z: sz * w / 2 }, 0.7, 0.01);
  const bars = 5;
  for (let i = 1; i < bars; i++) {
    const t = -w / 2 + (i / bars) * w;
    for (const s of [-1, 1]) {
      k.add(iron, cyl(0.013, 0.013, h - 0.06, 5), { x: t, y: 0.03, z: s * w / 2 }, 0.8);
      if (!(v === 1 && s === 1)) k.add(iron, cyl(0.013, 0.013, h - 0.06, 5), { x: s * w / 2, y: 0.03, z: t }, 0.8);
    }
  }
  if (v === 1) {
    // The door swung open.
    for (let i = 1; i < bars; i++) k.add(iron, cyl(0.013, 0.013, h - 0.1, 5), { x: w / 2 + Math.sin(1.2) * (i / bars) * w, y: 0.05, z: -w / 2 + Math.cos(1.2) * (i / bars) * w }, 0.8);
  }
  k.add(iron, cone(0.55, 0.3, 4), { y: h, ry: Math.PI / 4 }, 0.6);
  if (v !== 1) skeleton(k, c, { ry: 0.7, s: 0.6, y: 0.02 });
};

const spikes: Builder = (k, c) => {
  const wood = M.wood(c);
  const n = 5 + c.variant * 2;
  // Sharpened stakes driven in at angles, splayed outward.
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + k.rng.range(-0.2, 0.2);
    const d = k.rng.range(0.05, 0.3);
    const h = k.rng.range(0.7, 1.3);
    const stake = log(h, 0.06, k.rng, { seg: 6, taper: 0.12 });
    k.add(wood, stake, { x: Math.cos(a) * d, z: Math.sin(a) * d, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35 }, 0.8);
  }
  if (c.variant === 2) k.add(M.bone(c), skull(k.rng, 1.0), { y: 1.05, x: 0.1 }, 0.85);
};

const impaler: Builder = (k, c) => {
  const wood = M.wood(c);
  // One tall stake, a skull on its point, rags tied on it, a stone collar.
  const h = 2.0 + c.variant * 0.2;
  k.add(wood, log(h, 0.09, k.rng, { seg: 7, taper: 0.45 }), undefined, 0.8);
  k.add(M.bone(c), skull(k.rng, 1.1), { y: h - 0.12, rx: 0.2, ry: k.rng.range(-0.5, 0.5) }, 0.85);
  const rag = propMat('cloth.rags', { base: c.pal.clothTint, side: THREE.DoubleSide });
  const cl = cloth(0.24, 0.6, k.rng, { tatter: 0.5 });
  k.add(rag, mottle(cl, k.rng, 0.5), { y: h - 0.45, z: 0.06 });
  const ring = merge([0, 1, 2, 3].map((i) => {
    const a = (i / 4) * Math.PI * 2;
    return rock(0.1, k.rng, { flat: 0.7 }).translate(Math.cos(a) * 0.16, 0.05, Math.sin(a) * 0.16);
  }));
  k.add(M.rock(c), ring, undefined, 0.8);
  if (c.variant === 2) scatterBones(k, c, 4, 0.28, 0);
};

export const CRYPT: Record<string, Builder> = {
  sarcophagus,
  coffin,
  bonepile,
  skullPile,
  wallSkull,
  chain: chainK,
  banner,
  ossuary,
  gibbet,
  cage,
  spikes,
  impaler,
};

void shade;
