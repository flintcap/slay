/**
 * SLAY — the hive: webs, chitin spikes and columns, cocoons, flesh growths
 * and brood mounds.
 */
import * as THREE from 'three';
import { WALL_FACE, cone, jag, lathe, merge, mottle, rock, seat, shadeY, skull, smooth, sphere, tube, xf } from './Kit';
import { type BuildCtx, type Builder } from './Ctx';
import { ghostMat, glowMat, propMat } from './PropMats';
import { webTexture } from '../../fx/UtilityTextures';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const W = WALL_FACE;

const web = () => ghostMat(0xd8d4c8, 0.55, { map: webTexture() });
const chitin = () => propMat('flesh.chitin', { base: 0x6e5a40, rough: 0.7 });
const flesh = () => propMat('flesh.rotted', { tint: 0xa07a6a });
const resin = () => propMat('flesh.chitin', { base: 0x6a4a22, rough: 0.5 });

const webClump: Builder = (k, c) => {
  // Crossed sheets of web strung low between nothing much, a wrapped bundle in it.
  const n = 2 + c.variant;
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(k.rng.range(0.6, 1.0), k.rng.range(0.4, 0.7), 3, 3);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let j = 0; j < p.count; j++) p.setZ(j, Math.sin(p.getX(j) * 3) * 0.05);
    k.add(web(), g, { y: 0.3, ry: (i / n) * Math.PI + k.rng.range(-0.2, 0.2), rx: k.rng.range(-0.3, 0.3) }, 1, true);
  }
  if (c.variant === 2) k.add(propMat('cloth.linen', { tint: 0xc8c0b0 }), smooth(new THREE.IcosahedronGeometry(0.12, 1)).scale(1, 1.6, 1), { y: 0.25 }, 0.9);
};

const webSheet: Builder = (k, c) => {
  // A web stretched across the wall corner, sagging, torn.
  const g = new THREE.PlaneGeometry(1.6, 1.8, 6, 6);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let j = 0; j < p.count; j++) {
    const x = p.getX(j);
    const y = p.getY(j);
    p.setZ(j, (1 - (x * x) / 0.64) * (1 - (y * y) / 0.81) * 0.35);
  }
  k.add(web(), g, { y: 1.9 + c.variant * 0.15, z: W + 0.03 }, 1, true);
};

const chitinSpike: Builder = (k, c) => {
  // A curved horn of plated chitin breaking out of the floor.
  const h = 1.0 + c.variant * 0.3;
  const curve = k.rng.range(0.2, 0.45);
  const g = tube([V(0, -0.05, 0), V(0, h * 0.35, 0), V(curve * 0.4, h * 0.7, 0), V(curve, h, 0)], 0.2, 0.01, 7, 12);
  // Plate ridges.
  const pp = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pp.count; i++) {
    const y = pp.getY(i);
    const s = 1 + 0.08 * Math.sin(y * 28);
    pp.setX(i, pp.getX(i) * s);
    pp.setZ(i, pp.getZ(i) * s);
  }
  g.computeVertexNormals();
  mottle(g, k.rng, 0.5, 4);
  k.add(chitin(), shadeY(g, 0, h * 0.5, 0.5), { ry: k.rng.range(0, 6) });
  k.add(resin(), rock(0.24, k.rng, { flat: 0.35 }), { y: 0.02 }, 0.8);
};

const cocoon: Builder = (k, c) => {
  // A body-sized wrapped husk, stood on end or slumped, strands holding it.
  const g = lathe([[0.0001, 0], [0.18, 0.08], [0.26, 0.4], [0.24, 0.85], [0.16, 1.15], [0.0001, 1.25]], 10);
  jag(g, k.rng, 0.03, 5);
  // Wrapping bands.
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const s = 1 + 0.05 * Math.sin(p.getY(i) * 30 + Math.atan2(p.getZ(i), p.getX(i)) * 2);
    p.setX(i, p.getX(i) * s);
    p.setZ(i, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  mottle(g, k.rng, 0.5, 4, 0x8a7a5a);
  const slump = c.variant === 1;
  k.add(propMat('cloth.linen', { base: 0xa89c84, grime: 1 }), seat(xf(g, slump ? { y: 0.26, rz: 1.25, x: 0.55 } : { rz: k.rng.range(-0.1, 0.1) })));
  if (c.variant === 2) k.add(glowMat(c.pal.accent, 0.6), sphere(0.08, 6, 5), { y: 0.7, z: 0.2 });
  k.add(resin(), seat(rock(0.3, k.rng, { flat: 0.3 }).translate(0, 0.02, 0)), undefined, 0.8);
};

const fleshGrowth: Builder = (k, c) => {
  // Lumpy flesh pooled on the floor, a few blisters, veins.
  const g = smooth(new THREE.IcosahedronGeometry(0.35, 2));
  g.scale(1, 0.3, 1);
  jag(g, k.rng, 0.08, 4);
  k.add(flesh(), shadeY(g, -0.05, 0.1, 0.6), { y: 0.08 });
  for (let i = 0; i < 2 + c.variant; i++) k.add(glowMat(c.pal.accent, 0.4), sphere(k.rng.range(0.04, 0.08), 7, 5), { x: k.rng.range(-0.2, 0.2), y: 0.08, z: k.rng.range(-0.2, 0.2) });
  for (let i = 0; i < 3; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    k.add(flesh(), tube([V(0, 0.05, 0), V(Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3), V(Math.cos(a + 0.4) * 0.55, 0.0, Math.sin(a + 0.4) * 0.55)], 0.025, 0.008, 4, 6), undefined, 0.7);
  }
};

const broodMound: Builder = (k, c) => {
  // A resin mound studded with eggs, glowing from inside, bones caught in it.
  const m = smooth(new THREE.IcosahedronGeometry(0.9, 2));
  m.scale(1, 0.55, 1);
  m.translate(0, 0.38, 0);
  jag(m, k.rng, 0.12, 2);
  seat(m);
  k.add(resin(), shadeY(m, -0.1, 0.4, 0.6));
  const eggs = glowMat(c.pal.accent, 1.0);
  for (let i = 0; i < 9 + c.variant * 3; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const el = k.rng.range(0.2, 1.2);
    const r = k.rng.range(0.08, 0.14);
    const e = sphere(r, 8, 6);
    e.scale(1, 1.3, 1);
    k.add(eggs, e, { x: Math.cos(a) * Math.cos(el) * 0.82, y: Math.sin(el) * 0.46 + 0.4, z: Math.sin(a) * Math.cos(el) * 0.82 });
  }
  k.add(propMat('bone.old'), skull(k.rng, 1), { x: 0.5, y: 0.7, z: 0.45, rz: 0.6 }, 0.8);
};

const chitinColumn: Builder = (k, c) => {
  const H = Math.max(3.2, c.art.wallHeight) + 0.2;
  // Ribbed chitin plates wrapped round a resin core, flaring at both ends.
  const prof: Array<[number, number]> = [[0.0001, 0]];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const flare = 0.32 + 0.25 * Math.pow(Math.abs(t - 0.5) * 2, 2.2);
    prof.push([flare * (1 + 0.1 * (i % 2)), t * H]);
  }
  const g = lathe(prof, 9);
  jag(g, k.rng, 0.04, 3);
  mottle(g, k.rng, 0.6, 3);
  k.add(chitin(), shadeY(g, 0, 0.8, 0.5));
  for (let i = 0; i < 3 + c.variant; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const sp = cone(0.06, 0.35, 5);
    sp.rotateZ(-1.0);
    sp.rotateY(-a);
    k.add(chitin(), sp, { x: Math.cos(a) * 0.32, y: k.rng.range(0.6, H - 0.6), z: Math.sin(a) * 0.32 }, 0.85);
  }
};

export const HIVE: Record<string, Builder> = {
  webClump,
  webSheet,
  chitinSpike,
  cocoon,
  fleshGrowth,
  broodMound,
  chitinColumn,
};

void merge;
void (null as unknown as BuildCtx);
