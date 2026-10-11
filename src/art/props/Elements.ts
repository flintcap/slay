/**
 * SLAY — props made of the biome's element: crystal, ice, frozen dead, lava
 * rock, bone spires, void shards, floating stones and void rifts.
 */
import * as THREE from 'three';
import type { Rng } from '../../types';
import { PropKit, WALL_FACE, box, cone, cyl, jag, lathe, merge, mottle, rock, seat, shadeY, skull, smooth, sphere, torus, tube } from './Kit';
import { type BuildCtx, type Builder, M } from './Ctx';
import { ghostMat, glowMat, propMat } from './PropMats';
import { weather } from './Stone';
import { skeleton } from './Crypt';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const W = WALL_FACE;

/** A long faceted crystal, base at the origin, pointing up. */
function crystal(len: number, r: number, rng: Rng, sides = 6): THREE.BufferGeometry {
  const g = lathe([[0.0001, -0.05], [r, 0], [r * rng.range(0.85, 1.05), len * 0.72], [0.0001, len]], sides);
  jag(g, rng, r * 0.06, 3 / r);
  return g;
}

function crystalMat(c: BuildCtx): THREE.Material {
  const key = c.biome === 'frostvault' || c.biome === 'tundra' ? 'crystal.ice' : c.biome === 'voidspire' ? 'crystal.void' : 'crystal.arcane';
  return propMat(key, { emissive: c.pal.accent, emissiveIntensity: 0.55, grime: 0.3, rough: 0.6 });
}

/** A cluster of crystals splaying out of a rock base. */
function cluster(k: PropKit, c: BuildCtx, n: number, len: number, spread: number): void {
  const mat = crystalMat(c);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + k.rng.range(-0.4, 0.4);
    const tilt = i === 0 ? k.rng.range(0, 0.15) : k.rng.range(0.3, 0.8);
    const l = len * (i === 0 ? 1 : k.rng.range(0.4, 0.75));
    const g = crystal(l, l * 0.16, k.rng);
    g.rotateZ(tilt);
    g.rotateY(a);
    const d = i === 0 ? 0 : spread * k.rng.range(0.3, 0.8);
    g.translate(Math.cos(a) * d, 0, -Math.sin(a) * d);
    parts.push(g);
  }
  k.add(mat, shadeY(seat(merge(parts)), 0, len * 0.5, 0.55));
  const base = seat(rock(spread * 0.7, k.rng, { flat: 0.4 }).translate(0, spread * 0.22, 0));
  k.add(M.rock(c), weather(base, c, k.rng));
}

const crystalShard: Builder = (k, c) => cluster(k, c, 2 + c.variant, 0.35 + c.variant * 0.08, 0.15);
const crystalCluster: Builder = (k, c) => {
  cluster(k, c, 6 + c.variant * 2, 1.4 + c.variant * 0.2, 0.55);
  k.add(glowMat(c.pal.accent, 0.8), sphere(0.12, 6, 5), { y: 0.15 });
};

function iceMat(): THREE.Material {
  return propMat('crystal.ice', { grime: 0.2, rough: 0.5 });
}

const iceShard: Builder = (k, c) => {
  // A jagged blade of ice, frozen dirt in its foot.
  const parts: THREE.BufferGeometry[] = [];
  const h = 1.1 + c.variant * 0.25;
  const main = crystal(h, 0.2, k.rng, 5);
  main.scale(1, 1, 0.6);
  main.rotateZ(k.rng.range(-0.15, 0.15));
  parts.push(main);
  for (let i = 0; i < 2; i++) {
    const g = crystal(h * k.rng.range(0.3, 0.55), 0.1, k.rng, 5);
    g.rotateZ(k.rng.range(0.3, 0.6) * (i ? 1 : -1));
    g.translate((i ? 1 : -1) * 0.1, 0, k.rng.range(-0.08, 0.08));
    parts.push(g);
  }
  k.add(iceMat(), shadeY(merge(parts), 0, 0.4, 0.6));
  k.add(propMat('ground.snow'), sphere(0.26, 8, 5).scale(1, 0.25, 1), undefined, 0.95);
};

const icicleRow: Builder = (k, c) => {
  // Icicles hanging from a crust of ice on the wall, two metres up and higher.
  const mat = iceMat();
  const crust = box(1.4, 0.12, 0.16, 0.05, 3);
  jag(crust, k.rng, 0.03, 6);
  k.add(mat, crust, { y: 2.7, z: W + 0.08 });
  const parts: THREE.BufferGeometry[] = [];
  const n = 9 + c.variant * 3;
  for (let i = 0; i < n; i++) {
    const l = k.rng.range(0.15, 0.7);
    const g = cone(k.rng.range(0.025, 0.05), l, 5);
    g.rotateX(Math.PI);
    g.translate(-0.65 + (i / (n - 1)) * 1.3 + k.rng.range(-0.03, 0.03), 2.68, W + 0.06 + k.rng.range(0, 0.08));
    parts.push(g);
  }
  k.add(mat, merge(parts));
};

const frozenCorpse: Builder = (k, c) => {
  // Someone caught in a block of ice, half sunk in snow.
  const v = c.variant;
  if (v === 2) {
    skeleton(k, c, { s: 0.75, ry: 0.4, y: 0.06 });
  } else {
    const body = merge([
      lathe([[0.16, 0], [0.18, 0.5], [0.15, 0.95], [0.0001, 1.0]], 8),
      sphere(0.11, 8, 6).translate(0, 1.1, 0),
    ]);
    jag(body, k.rng, 0.02, 6);
    k.add(propMat('flesh.pale', { tint: 0x8a9aa8 }), body, { y: 0.05, rz: v === 1 ? 1.35 : 0.12, x: v === 1 ? 0.55 : 0, s: 0.75 }, 0.8);
  }
  const block = box(v === 1 || v === 2 ? 0.78 : 0.5, v === 1 || v === 2 ? 0.42 : 0.95, 0.5, 0.06, 3);
  jag(block, k.rng, 0.04, 4);
  block.translate(0, (v === 1 || v === 2 ? 0.42 : 0.95) / 2, 0);
  k.add(propMat('crystal.ice', { transparent: true, opacity: 0.55, grime: 0, rough: 0.3 }), block, undefined, 1, true);
  k.add(propMat('ground.snow'), sphere(0.42, 10, 6).scale(1, 0.22, 1), undefined, 0.95);
};

const iceMonolith: Builder = (k, c) => {
  const mat = iceMat();
  const h = 2.6 + c.variant * 0.5;
  const g = box(0.85, h, 0.65, 0.12, 4);
  g.translate(0, h / 2, 0);
  jag(g, k.rng, 0.08, 1.8);
  k.add(mat, shadeY(g, 0, 1, 0.55), { ry: k.rng.range(-0.2, 0.2) });
  // Something dark frozen in its heart.
  k.add(propMat('stone.void', { emissive: c.pal.accent, emissiveIntensity: 0.4 }), smooth(new THREE.IcosahedronGeometry(0.2, 1)), { y: h * 0.55 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const s = crystal(k.rng.range(0.4, 0.8), 0.12, k.rng, 5);
    s.rotateZ(0.5);
    s.rotateY(a);
    k.add(mat, s, { x: Math.cos(a) * 0.5, z: -Math.sin(a) * 0.5 });
  }
};

const pillarIce: Builder = (k, c) => {
  const st = M.stone(c);
  const H = Math.max(3.2, c.art.wallHeight);
  const core = box(0.7, H, 0.7, 0.04, 6);
  core.translate(0, H / 2, 0);
  jag(core, k.rng, 0.015, 5);
  k.add(st, weather(core, c, k.rng));
  // An ice sheath grown over the stone, thickest at the foot.
  const sheath = lathe([[0.62, 0], [0.58, H * 0.25], [0.48, H * 0.55], [0.44, H * 0.8], [0.5, H], [0.0001, H]], 9);
  jag(sheath, k.rng, 0.06, 2.5);
  k.add(propMat('crystal.ice', { transparent: true, opacity: 0.7, grime: 0, rough: 0.35 }), sheath, undefined, 1, true);
  for (let i = 0; i < 5; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const s = crystal(k.rng.range(0.3, 0.6), 0.09, k.rng, 5);
    s.rotateZ(0.6);
    s.rotateY(a);
    k.add(iceMat(), s, { x: Math.cos(a) * 0.5, z: -Math.sin(a) * 0.5 });
  }
};

const lavaRock: Builder = (k, c) => {
  const g = rock(0.5, k.rng, { detail: 2, flat: 0.7 });
  g.translate(0, 0.36, 0);
  mottle(g, k.rng, 0.4, 3);
  k.add(propMat('stone.ash', { emissive: 0xff4a10, emissiveIntensity: 1.2, crackGlow: true }), shadeY(g, 0, 0.5, 0.6));
  if (c.variant > 0) {
    const g2 = rock(0.24, k.rng, { flat: 0.7 });
    k.add(propMat('stone.ash', { emissive: 0xff4a10, emissiveIntensity: 1.2, crackGlow: true }), g2, { x: 0.38, y: 0.16, z: 0.2 });
  }
};

const boneSpire: Builder = (k, c) => {
  const bone = M.bone(c);
  // Long bones and ribs fused into a twisted spike, skulls set in its foot.
  const h = 1.8 + c.variant * 0.4;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(tube([V(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), V(Math.cos(a + 0.8) * 0.18, h * 0.4, Math.sin(a + 0.8) * 0.18), V(Math.cos(a + 1.6) * 0.06, h * 0.8, Math.sin(a + 1.6) * 0.06), V(0, h, 0)], 0.07, 0.015, 5, 10));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const s = skull(k.rng, 1.1);
    s.rotateY(-a + Math.PI / 2);
    s.translate(Math.cos(a) * 0.3, 0.12, Math.sin(a) * 0.3);
    parts.push(s);
  }
  const g = merge(parts);
  mottle(g, k.rng, 0.6, 4, 0x5a4a34);
  k.add(bone, shadeY(g, 0, 0.5, 0.55));
};

const voidShard: Builder = (k, c) => {
  const mat = propMat('crystal.void', { emissive: c.pal.accent, emissiveIntensity: 0.9, grime: 0 });
  const n = 2 + (c.variant % 3);
  for (let i = 0; i < n; i++) {
    const g = new THREE.OctahedronGeometry(k.rng.range(0.06, 0.12), 0);
    g.scale(0.6, 2.2, 0.6);
    k.add(mat, g, { x: k.rng.range(-0.3, 0.3), y: k.rng.range(0.4, 1.1), z: k.rng.range(-0.3, 0.3), rz: k.rng.range(-0.4, 0.4), rx: k.rng.range(-0.4, 0.4) });
  }
  k.add(glowMat(c.pal.accent, 0.6), new THREE.RingGeometry(0.1, 0.16, 12).rotateX(-Math.PI / 2), { y: 0.02 });
};

const floatingStone: Builder = (k, c) => {
  const st = M.stone(c);
  // Chunks of broken floor hanging in the air above a crack.
  const n = 2 + (c.variant % 3);
  for (let i = 0; i < n; i++) {
    const g = box(k.rng.range(0.2, 0.4), k.rng.range(0.1, 0.18), k.rng.range(0.2, 0.35), 0.02, 2);
    jag(g, k.rng, 0.02, 6);
    // Ragged underside.
    const lump = rock(0.12, k.rng, { flat: 0.6 }).translate(0, -0.08, 0);
    k.add(st, weather(merge([g, lump]), c, k.rng, 1, 0), { x: k.rng.range(-0.35, 0.35), y: k.rng.range(0.6, 1.5), z: k.rng.range(-0.35, 0.35), ry: k.rng.range(0, 3), rz: k.rng.range(-0.3, 0.3) });
  }
  k.add(glowMat(c.pal.accent, 0.5), box(0.5, 0.01, 0.04, 0.002), { y: 0.005, ry: k.rng.range(0, 3) });
};

const voidRift: Builder = (k, c) => {
  // A torn vertical eye of light, ragged lips, shards orbiting it.
  const h = 2.0 + c.variant * 0.3;
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.quadraticCurveTo(0.55, h * 0.5, 0, h);
  sh.quadraticCurveTo(-0.55, h * 0.5, 0, 0);
  const core = new THREE.ShapeGeometry(sh, 10);
  jag(core, k.rng, 0.04, 3);
  k.add(ghostMat(c.pal.accent, 0.85, { additive: true }), core, { y: 0.35 }, 1, true);
  const inner = new THREE.ShapeGeometry(sh, 10);
  inner.scale(0.45, 0.85, 1);
  k.add(ghostMat(0xffffff, 0.6, { additive: true }), inner, { y: 0.35 + h * 0.075, z: 0.01 }, 1, true);
  const halo = new THREE.RingGeometry(0.7, 1.15, 24);
  halo.scale(0.6, h / 2.1, 1);
  k.add(ghostMat(c.pal.accent, 0.25, { additive: true }), halo, { y: 0.35 + h / 2, z: -0.01 }, 1, true);
  const shardMat = propMat('crystal.void', { emissive: c.pal.accent, emissiveIntensity: 1.0, grime: 0 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const g = new THREE.OctahedronGeometry(0.07, 0);
    g.scale(0.6, 1.8, 0.6);
    k.add(shardMat, g, { x: Math.cos(a) * 0.75, y: 0.35 + h / 2 + Math.sin(a) * h * 0.45, z: Math.sin(a * 2) * 0.2, rz: a });
  }
  k.add(glowMat(c.pal.accent, 0.5), torus(0.5, 0.02, 3, 20).rotateX(Math.PI / 2), { y: 0.02 });
};

export const ELEMENTS: Record<string, Builder> = {
  crystalShard,
  crystalCluster,
  iceShard,
  icicleRow,
  frozenCorpse,
  iceMonolith,
  pillarIce,
  lavaRock,
  boneSpire,
  voidShard,
  floatingStone,
  voidRift,
};

void cyl;
