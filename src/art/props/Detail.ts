/**
 * SLAY — ground detail: grit, chips, drifts, growth, stains. Scattered
 * thickly, never blocks, never casts a shadow, so every kind is a single
 * cheap layer a few centimetres high.
 */
import * as THREE from 'three';
import type { Rng } from '../../types';
import { PropKit, cone, disc, jag, longBone, merge, mottle, rock, shadeY, sphere, tube } from './Kit';
import { type BuildCtx, type Builder, M } from './Ctx';
import { glowMat, propMat } from './PropMats';

/** `n` small pieces from `make`, spread over a disc of radius `r`. */
function scatter(k: PropKit, mat: THREE.Material, n: number, r: number, make: (rng: Rng, i: number) => THREE.BufferGeometry, tone = 0.85): void {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const d = Math.sqrt(k.rng.next()) * r;
    const g = make(k.rng, i);
    g.rotateY(k.rng.range(0, Math.PI * 2));
    g.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(g);
  }
  k.add(mat, merge(parts), undefined, tone);
}

const stone = (s: number, flat = 0.5) => (rng: Rng) => rock(rng.range(s * 0.5, s), rng, { detail: 0, flat }).translate(0, s * 0.15, 0);

/** A low irregular drift of loose stuff (sand, ash, snow). */
function drift(k: PropKit, mat: THREE.Material, r: number, h: number): void {
  const g = new THREE.CircleGeometry(r, 14, 0, Math.PI * 2);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const d = Math.hypot(p.getX(i), p.getZ(i)) / r;
    p.setY(i, (1 - d * d) * h);
  }
  jag(g, k.rng, r * 0.12, 3 / r);
  g.computeVertexNormals();
  k.add(mat, g, { sx: k.rng.range(1, 1.6) }, 0.9);
}

/** A flat patch decal lying on the floor. */
function patch(k: PropKit, mat: THREE.Material, r: number, y = 0.008): void {
  const g = disc(r, 12, y);
  jag(g, k.rng, r * 0.15, 3 / r);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setY(i, y);
  k.add(mat, g, { sx: k.rng.range(0.8, 1.5), ry: k.rng.range(0, 3) });
}

const pebbles: Builder = (k, c) => scatter(k, M.rock(c), 5 + c.variant, 0.45, stone(0.07));
const boneChips: Builder = (k, c) =>
  scatter(k, M.bone(c), 4 + c.variant, 0.42, (rng, i) => (i % 3 === 0 ? sphere(0.03, 5, 4).scale(1, 0.6, 1.3).translate(0, 0.015, 0) : longBone(rng.range(0.08, 0.2), 0.012).translate(0, 0.014, 0)));
const ashDrift: Builder = (k) => drift(k, propMat('ground.ash', { grime: 0 }), 0.42, 0.04);
const sandDrift: Builder = (k, c) => drift(k, propMat('ground.sand', { base: c.biome === 'desert' || c.biome === 'desertTomb' ? undefined : 0x8a7a60, grime: 0 }), 0.48, 0.07);
const mossPatch: Builder = (k, c) => {
  patch(k, propMat('earth.moss', { base: new THREE.Color(c.pal.leaf).multiplyScalar(1.3).getHex(), grime: 0 }), 0.36, 0.01);
  scatter(k, propMat('earth.moss', { grime: 0 }), 4, 0.3, (rng) => sphere(rng.range(0.03, 0.06), 5, 4).scale(1, 0.45, 1));
};
const grassTuft: Builder = (k, c) => {
  const leaf = propMat('ground.grass', { base: new THREE.Color(c.pal.leaf).multiplyScalar(1.5).getHex(), side: THREE.DoubleSide, grime: 0.5, grimeHeight: 0.15 });
  const parts: THREE.BufferGeometry[] = [];
  const n = 10 + c.variant * 3;
  for (let i = 0; i < n; i++) {
    const h = k.rng.range(0.1, 0.28);
    const b = cone(0.025, h, 3);
    b.rotateZ(k.rng.range(-0.5, 0.5));
    b.rotateY(k.rng.range(0, 6));
    const a = k.rng.range(0, Math.PI * 2);
    const d = k.rng.range(0, 0.18);
    b.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
    parts.push(b);
  }
  k.add(leaf, shadeY(merge(parts), 0, 0.2, 0.5));
};
const sporeTuft: Builder = (k, c) => {
  scatter(k, propMat('flesh.rotted', { base: 0x6a5a48 }), 4 + c.variant, 0.3, (rng) => cone(rng.range(0.02, 0.04), rng.range(0.06, 0.14), 5));
  scatter(k, glowMat(c.glow, 0.6), 3, 0.3, (rng) => sphere(rng.range(0.012, 0.022), 5, 4).translate(0, rng.range(0.08, 0.16), 0));
};
const iceCrust: Builder = (k, c) => {
  patch(k, propMat('crystal.frost', { grime: 0 }), 0.38, 0.01);
  scatter(k, propMat('crystal.ice', { grime: 0 }), 3 + c.variant, 0.3, (rng) => new THREE.OctahedronGeometry(rng.range(0.03, 0.07), 0).scale(1, 1.6, 1));
};
const slagChunk: Builder = (k, c) => {
  scatter(k, propMat('metal.dark', { emissive: 0xff5a14, emissiveIntensity: 0.9, crackGlow: true }), 3 + c.variant, 0.4, stone(0.08, 0.6));
};
const shellFragment: Builder = (k, c) =>
  scatter(k, propMat('flesh.chitin', { base: 0x7a6448 }), 4 + c.variant, 0.42, (rng) => {
    const g = new THREE.SphereGeometry(rng.range(0.05, 0.1), 6, 4, 0, rng.range(1.5, 3), 0, 1.2);
    g.scale(1, 0.5, 1);
    return g;
  });
const voidMote: Builder = (k, c) => {
  scatter(k, propMat('crystal.void', { emissive: c.pal.accent, emissiveIntensity: 1.0, grime: 0 }), 3 + (c.variant % 3), 0.35, (rng) => new THREE.OctahedronGeometry(rng.range(0.02, 0.05), 0).scale(0.6, 1.6, 0.6).translate(0, rng.range(0.1, 0.5), 0));
};
const scorchMark: Builder = (k) => patch(k, propMat('ground.ash', { base: 0x141210, grime: 0 }), 0.45, 0.007);
const bloodStain: Builder = (k) => {
  const m = propMat('ground.blood', { base: 0x3a0a08, rough: 0.35, grime: 0 });
  patch(k, m, 0.3, 0.009);
  scatter(k, m, 4, 0.5, (rng) => disc(rng.range(0.02, 0.06), 6, 0.009));
};
const leafLitter: Builder = (k, c) => {
  const leaf = propMat('ground.leaves', { side: THREE.DoubleSide, grime: 0 });
  scatter(k, leaf, 9 + c.variant * 2, 0.45, (rng) => {
    const g = new THREE.CircleGeometry(rng.range(0.03, 0.055), 5);
    g.scale(1, 1.7, 1);
    g.rotateX(-Math.PI / 2 + rng.range(-0.4, 0.4));
    return g.translate(0, 0.012, 0);
  });
};
const twigs: Builder = (k, c) =>
  scatter(k, M.bark(c), 4 + c.variant, 0.42, (rng) => {
    const l = rng.range(0.15, 0.4);
    return tube([new THREE.Vector3(-l / 2, 0.012, 0), new THREE.Vector3(0, 0.02, rng.range(-0.04, 0.04)), new THREE.Vector3(l / 2, 0.012, rng.range(-0.06, 0.06))], 0.01, 0.005, 4, 3);
  }, 0.8);

export const DETAIL: Record<string, Builder> = {
  pebbles,
  boneChips,
  ashDrift,
  mossPatch,
  sporeTuft,
  iceCrust,
  slagChunk,
  shellFragment,
  sandDrift,
  voidMote,
  scorchMark,
  grassTuft,
  leafLitter,
  twigs,
  bloodStain,
};

void mottle;
void (null as unknown as BuildCtx);
