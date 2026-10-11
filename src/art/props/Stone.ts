/**
 * SLAY — worked and raw stone: pillars and columns, statues, altars,
 * obelisks, standing stones, rubble, rocks, boulders, stalagmites, ruined
 * walls, cairns, fountains, idol heads, wall reliefs and floor seals.
 *
 * Everything is chipped (`jag`), stained in the biome's damp, moss, soot or
 * frost (`mottle` with the palette stain) and darkened at the foot.
 */
import * as THREE from 'three';
import type { Rng } from '../../types';
import { PropKit, WALL_FACE, box, cone, cyl, disc, jag, lathe, merge, mottle, rock, shade, shadeY, smooth, sphere, taper, torus } from './Kit';
import { type BuildCtx, type Builder, M } from './Ctx';
import { glowMat, propMat } from './PropMats';

const W = WALL_FACE;

/** Stains and foot-darkens a stone part. */
export function weather(g: THREE.BufferGeometry, c: BuildCtx, rng: Rng, amt = 1, top = 0.6): THREE.BufferGeometry {
  mottle(g, rng, c.pal.stainAmt * amt, 2.4, c.pal.stain);
  mottle(g, rng, 0.35, 7);
  return shadeY(g, 0, top, 0.55);
}

/** A cylinder whose wall is pushed in and out `flutes` times (fluted column drums). */
function fluted(r: number, h: number, flutes: number, depth: number, hSeg = 4): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, flutes * 4, hSeg, false);
  g.translate(0, h / 2, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const d = Math.hypot(x, z);
    if (d < r * 0.98) continue;
    const a = Math.atan2(z, x);
    const k = 1 - depth * (0.5 + 0.5 * Math.cos(a * flutes));
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** A square stepped base: `steps` slabs narrowing upward. Returns the top height. */
function plinth(k: PropKit, mat: THREE.Material, c: BuildCtx, w: number, steps: number, stepH: number): number {
  let y = 0;
  for (let i = 0; i < steps; i++) {
    const s = w * (1 - i * 0.12);
    const g = box(s, stepH, s, 0.03, 2);
    jag(g, k.rng, 0.012, 6);
    g.translate(0, y + stepH / 2, 0);
    k.add(mat, weather(g, c, k.rng, 1, 0.4));
    y += stepH;
  }
  return y;
}

function pillarHeight(c: BuildCtx): number {
  return c.outdoor ? 3.2 : Math.max(3.2, c.art.wallHeight);
}

const pillarGothic: Builder = (k, c) => {
  const st = M.stone(c);
  const H = pillarHeight(c);
  const y0 = plinth(k, st, c, 1.15, 2, 0.18);
  // Clustered shaft: an octagonal core with four engaged colonnettes.
  const core = cyl(0.34, 0.34, H - y0 - 0.55, 8, false, 6);
  core.rotateY(Math.PI / 8);
  const parts = [core];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const col = cyl(0.12, 0.12, H - y0 - 0.55, 8, false, 6);
    col.translate(Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34);
    parts.push(col);
  }
  const shaft = merge(parts);
  shaft.translate(0, y0, 0);
  jag(shaft, k.rng, 0.012, 5);
  k.add(st, weather(shaft, c, k.rng, 1, y0 + 1));
  // Base mouldings and the capital.
  k.add(st, weather(lathe([[0.52, 0], [0.5, 0.08], [0.44, 0.12], [0.44, 0.2], [0.0001, 0.2]], 8), c, k.rng), { y: y0, ry: Math.PI / 8 });
  const cap = lathe([[0.4, 0], [0.42, 0.06], [0.48, 0.2], [0.58, 0.34], [0.6, 0.4], [0.0001, 0.4]], 8);
  k.add(st, weather(cap, c, k.rng), { y: H - 0.55, ry: Math.PI / 8 });
  k.box(st, 1.2, 0.15, 1.2, { y: H - 0.15 }, 0.85, 0.03);
  if (c.variant === 1) {
    // Iron bands and a hanging chain.
    const iron = M.iron(c);
    for (const y of [y0 + 0.9, y0 + 1.7]) k.add(iron, torus(0.45, 0.025, 4, 16), { y, rx: Math.PI / 2 }, 0.8);
  }
};

const pillarFluted: Builder = (k, c) => {
  const st = M.stone(c);
  const H = pillarHeight(c);
  const y0 = plinth(k, st, c, 1.15, 1, 0.22);
  k.add(st, weather(lathe([[0.5, 0], [0.5, 0.06], [0.44, 0.1], [0.46, 0.16], [0.4, 0.22], [0.0001, 0.22]], 16), c, k.rng), { y: y0 });
  // Drums stacked a little off true, as old columns stand.
  const drums = 3;
  const dh = (H - y0 - 0.22 - 0.5) / drums;
  for (let i = 0; i < drums; i++) {
    const d = fluted(0.38 - i * 0.015, dh - 0.01, 14, 0.07, 3);
    jag(d, k.rng, 0.01, 6);
    k.add(st, weather(d, c, k.rng, 1.1, 1.2), { y: y0 + 0.22 + i * dh, ry: k.rng.range(0, 1), x: k.rng.range(-0.01, 0.01) });
  }
  const capY = H - 0.5;
  k.add(st, weather(lathe([[0.35, 0], [0.38, 0.05], [0.36, 0.1], [0.52, 0.32], [0.0001, 0.32]], 16), c, k.rng), { y: capY });
  k.box(st, 1.15, 0.18, 1.15, { y: H - 0.18 }, 0.85, 0.03);
  if (c.variant === 1) {
    // Weed hanging off the capital.
    const weed = propMat('earth.moss', { tint: c.pal.leaf });
    for (let i = 0; i < 6; i++) {
      const a = k.rng.range(0, Math.PI * 2);
      const g = cone(0.05, k.rng.range(0.3, 0.8), 4);
      g.rotateX(Math.PI);
      k.add(weed, g, { x: Math.cos(a) * 0.5, y: capY + 0.3, z: Math.sin(a) * 0.5 }, 0.8);
    }
  }
};

const pillarBroken: Builder = (k, c) => {
  const st = M.stone(c);
  const y0 = plinth(k, st, c, 1.0, 1, 0.2);
  const h = [1.1, 1.8, 2.5][c.variant % 3]!;
  const shaft = fluted(0.36, h, 12, 0.06, 6);
  // Snap the top off unevenly.
  const p = shaft.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > h - 0.01) p.setY(i, h - 0.35 * (0.5 + 0.5 * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 2 + c.variant)));
  }
  shaft.computeVertexNormals();
  jag(shaft, k.rng, 0.03, 4);
  k.add(st, weather(shaft, c, k.rng, 1.2, 1), { y: y0 });
  // A fallen drum and chips at the foot.
  const drum = fluted(0.3, 0.45, 12, 0.06, 2);
  jag(drum, k.rng, 0.03, 4);
  k.add(st, weather(drum, c, k.rng), { x: 0.2, y: 0.05, z: 0.45, rz: Math.PI / 2, ry: k.rng.range(-1, 1), s: 0.8 });
  for (let i = 0; i < 4; i++) k.add(st, rock(0.07, k.rng, { flat: 0.6 }), { x: k.rng.range(-0.5, 0.5), y: 0.04, z: k.rng.range(-0.5, 0.5) }, 0.8);
};

const pillarVoid: Builder = (k, c) => {
  const st = propMat('stone.obsidian');
  const H = pillarHeight(c);
  const y0 = plinth(k, st, c, 1.1, 2, 0.16);
  // A twisted square shaft.
  const g = new THREE.BoxGeometry(0.62, H - y0 - 0.4, 0.62, 1, 12, 1);
  g.translate(0, (H - y0 - 0.4) / 2, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / (H - y0 - 0.4);
    const a = t * Math.PI * 0.5;
    const x = p.getX(i);
    const z = p.getZ(i);
    const s = 1 - Math.sin(t * Math.PI) * 0.18;
    p.setXYZ(i, (x * Math.cos(a) - z * Math.sin(a)) * s, p.getY(i), (x * Math.sin(a) + z * Math.cos(a)) * s);
  }
  g.computeVertexNormals();
  k.add(st, shadeY(g, 0, 1, 0.6), { y: y0 });
  // Rune channels glowing down each face.
  const rune = glowMat(c.pal.accent, 1.5);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    for (let j = 0; j < 5; j++) {
      const y = y0 + 0.4 + j * ((H - y0 - 1.2) / 5);
      k.add(rune, box(0.05, 0.22, 0.02, 0.005), { x: Math.sin(a) * 0.29, y, z: Math.cos(a) * 0.29, ry: a });
    }
  }
  k.box(st, 1.05, 0.4, 1.05, { y: H - 0.4 }, 0.9, 0.04);
  const ring = glowMat(c.pal.accent, 0.8);
  k.add(ring, torus(0.55, 0.02, 4, 24), { y: y0 + 1.2 + c.variant * 0.6, rx: Math.PI / 2 + 0.15 });
};

const stalacColumn: Builder = (k, c) => {
  const st = M.rock(c);
  const H = pillarHeight(c) + 0.3;
  const w = 0.6 + c.variant * 0.05;
  // Hourglass: a stalagmite and a stalactite that met.
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const pinch = 0.35 + 0.65 * Math.pow(Math.abs(t - 0.55) / 0.55, 1.6);
    prof.push([w * pinch * (t < 0.08 ? 1.25 : 1), t * H]);
  }
  prof.unshift([0.0001, 0]);
  let g = lathe(prof, 10);
  g = smooth(g);
  jag(g, k.rng, 0.12, 1.6);
  jag(g, k.rng, 0.03, 6);
  k.add(st, weather(g, c, k.rng, 1.2, 0.8));
  // Small stalagmites around the foot.
  for (let i = 0; i < 3; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const s = cone(0.1, k.rng.range(0.3, 0.6), 6, 3);
    jag(s, k.rng, 0.02, 8);
    k.add(st, weather(s, c, k.rng), { x: Math.cos(a) * 0.55, z: Math.sin(a) * 0.55 });
  }
};

const brokenColumn: Builder = (k, c) => {
  const st = M.stone(c);
  const v = c.variant;
  // A stump on its base, a drum or two fallen beside it.
  k.add(st, weather(lathe([[0.42, 0], [0.42, 0.1], [0.36, 0.14], [0.0001, 0.14]], 14), c, k.rng));
  const h = 0.4 + (v % 2) * 0.5;
  const stump = fluted(0.32, h, 12, 0.06, 3);
  const p = stump.getAttribute('position') as THREE.BufferAttribute;
  const ph = k.rng.range(0, 6);
  for (let i = 0; i < p.count; i++) if (p.getY(i) > h - 0.01) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, h - 0.1 - 0.1 * Math.sin(a * 2 + ph) - 0.04 * Math.sin(a * 5 + ph)); }
  stump.computeVertexNormals();
  jag(stump, k.rng, 0.025, 5);
  k.add(st, weather(stump, c, k.rng, 1.2), { y: 0.14 });
  if (v >= 2) {
    const drum = fluted(0.28, 0.5, 12, 0.06, 2);
    jag(drum, k.rng, 0.03, 4);
    k.add(st, weather(drum, c, k.rng), { x: -0.15, y: 0.02, z: 0.28, rz: Math.PI / 2, ry: 0.4 + v });
  }
  for (let i = 0; i < 5; i++) k.add(st, rock(0.06, k.rng, { flat: 0.6 }), { x: k.rng.range(-0.45, 0.45), y: 0.03, z: k.rng.range(-0.45, 0.45) }, 0.8);
};

const statue: Builder = (k, c) => {
  const st = M.stone(c);
  const v = c.variant;
  const y0 = plinth(k, st, c, 1.05, 2, 0.25);
  // A robed figure: the robe a flared cone, a hood, the arms folded on a sword.
  const robe = lathe([[0.36, 0], [0.33, 0.25], [0.26, 0.8], [0.22, 1.15], [0.24, 1.3], [0.18, 1.42], [0.0001, 1.44]], 12);
  jag(robe, k.rng, 0.02, 5);
  const parts = [robe];
  if (v !== 2) {
    const head = sphere(0.13, 10, 8);
    head.scale(0.9, 1.05, 1);
    head.translate(0, 1.55, 0.02);
    parts.push(head);
    const hood = lathe([[0.17, 0], [0.18, 0.12], [0.15, 0.26], [0.08, 0.34], [0.0001, 0.36]], 10);
    hood.translate(0, 1.42, -0.03);
    parts.push(hood);
  }
  // Arms: two bent tubes meeting at the chest.
  for (const s of [-1, 1]) {
    const arm = cyl(0.07, 0.08, 0.5, 6);
    arm.rotateZ(s * 0.5);
    arm.rotateX(-0.9);
    arm.translate(s * 0.2, 1.0, 0.12);
    parts.push(arm);
  }
  const body = merge(parts);
  jag(body, k.rng, 0.012, 9);
  k.add(st, weather(body, c, k.rng, 1.3, 0.6), { y: y0, s: 1.25 });
  if (v === 1) {
    // Wings: two layered slabs swept back.
    for (const s of [-1, 1]) {
      const wing = box(0.08, 1.1, 0.6, 0.02, 3);
      jag(wing, k.rng, 0.03, 4);
      taper(wing, 0.4);
      k.add(st, weather(wing, c, k.rng), { x: s * 0.4, y: y0 + 1.3, z: -0.36, rz: -s * 0.35, ry: s * 0.4, s: 1.2 });
    }
  }
  // The sword, point down in front.
  const sword = merge([box(0.08, 1.05, 0.03, 0.01), box(0.36, 0.06, 0.06, 0.01).translate(0, 0.45, 0)]);
  k.add(v === 2 ? M.iron(c) : st, sword, { y: y0 + 0.68, z: 0.36, s: 1.2 }, 0.85);
  if (v === 2) {
    // The head has fallen and lies at the foot.
    const head = sphere(0.13, 10, 8);
    jag(head, k.rng, 0.02, 9);
    k.add(st, weather(head, c, k.rng), { x: 0.35, y: 0.12, z: 0.42 });
  }
};

const altar: Builder = (k, c) => {
  const st = M.stone(c);
  // A heavy slab on two blocks.
  for (const s of [-1, 1]) {
    const leg = box(0.32, 0.7, 0.62, 0.03, 2);
    jag(leg, k.rng, 0.015, 6);
    leg.translate(s * 0.48, 0.35, 0);
    k.add(st, weather(leg, c, k.rng));
  }
  const slab = box(1.5, 0.2, 0.88, 0.04, 3);
  jag(slab, k.rng, 0.015, 5);
  slab.translate(0, 0.8, 0);
  k.add(st, weather(slab, c, k.rng, 0.8, 0.4));
  // A runner cloth over the slab, hanging down the front.
  const cloth = M.cloth(c);
  k.add(cloth, box(0.4, 0.015, 0.9, 0.003), { y: 0.905 }, 0.9);
  const hang = new THREE.PlaneGeometry(0.4, 0.5, 2, 5);
  hang.translate(0, -0.25, 0);
  jag(hang, k.rng, 0.012, 5);
  k.add(cloth, hang, { y: 0.9, z: 0.452 }, 0.85);
  // Offerings.
  const wax = propMat('bone.pale', { tint: 0xd8ccb0, grime: 0 });
  for (let i = 0; i < 3; i++) k.add(wax, cyl(0.03, 0.03, k.rng.range(0.1, 0.24), 6), { x: -0.55 + i * 0.07, y: 0.9, z: k.rng.range(-0.3, 0.3) }, 0.9);
  if (c.variant === 1) {
    k.add(M.bone(c), sphere(0.1, 8, 6), { x: 0.45, y: 1.0, z: 0.1, sz: 1.2 }, 0.9);
    k.add(M.fine(c), lathe([[0.0001, 0], [0.08, 0.01], [0.14, 0.06], [0.15, 0.1], [0.13, 0.1], [0.0001, 0.04]], 10), { x: 0.2, y: 0.9, z: -0.2 }, 0.8);
    k.add(glowMat(0x7a0a08, 0.6), disc(0.12, 10, 0), { x: 0.2, y: 0.985, z: -0.2 });
  } else {
    k.add(M.fine(c), lathe([[0.06, 0], [0.04, 0.1], [0.02, 0.2], [0.08, 0.3], [0.0001, 0.3]], 8), { x: 0.4, y: 0.9 }, 0.8);
  }
};

const obelisk: Builder = (k, c) => {
  const st = M.stone(c);
  const y0 = plinth(k, st, c, 1.3, 3, 0.16);
  const h = 2.6 + c.variant * 0.5;
  const needle = box(0.62, h, 0.62, 0.02, 1);
  needle.translate(0, h / 2, 0);
  taper(needle, 0.62);
  jag(needle, k.rng, 0.012, 5);
  k.add(st, weather(needle, c, k.rng, 1, 1.4), { y: y0 });
  k.add(st, cone(0.27, 0.36, 4), { y: y0 + h, ry: Math.PI / 4 }, 0.9);
  // Carved runes down the front and back, faintly lit.
  const rune = glowMat(c.pal.accent, 1.1);
  for (const face of [0, Math.PI]) {
    for (let j = 0; j < 6; j++) {
      const y = y0 + 0.35 + j * 0.34;
      const t = 1 - (y - y0) / h * 0.38;
      k.add(rune, box(0.08 + k.rng.range(0, 0.1), 0.05, 0.02, 0.004), { x: Math.sin(face) * 0.31 * t, y, z: Math.cos(face) * 0.31 * t, ry: face });
    }
  }
};

const runeStone: Builder = (k, c) => {
  const st = M.rock(c);
  const h = 1.3 + c.variant * 0.25;
  const g = box(0.6, h, 0.34, 0.08, 4);
  g.translate(0, h / 2, 0);
  taper(g, 0.7);
  jag(g, k.rng, 0.05, 2.5);
  k.add(st, weather(g, c, k.rng, 1.2, 0.8), { rz: k.rng.range(-0.06, 0.06) });
  const rune = glowMat(c.pal.accent, 0.7);
  // A carved sigil: a ring with a cross through it.
  k.add(rune, torus(0.13, 0.014, 3, 16), { y: h * 0.6, z: 0.17 });
  k.add(rune, box(0.02, 0.4, 0.02, 0.004), { y: h * 0.6 - 0.2, z: 0.175 });
  k.add(rune, box(0.24, 0.02, 0.02, 0.004), { y: h * 0.6, z: 0.175 });
};

/** Broken blocks and stones, low. */
const rubblePile: Builder = (k, c) => {
  const st = M.stone(c);
  const n = 5 + c.variant * 2;
  for (let i = 0; i < n; i++) {
    const big = i < 2;
    const s = big ? k.rng.range(0.18, 0.28) : k.rng.range(0.05, 0.12);
    const g = big ? box(s * 1.4, s * 0.8, s, 0.02, 2) : rock(s, k.rng, { flat: 0.6 });
    if (big) jag(g, k.rng, s * 0.15, 4 / s);
    const a = k.rng.range(0, Math.PI * 2);
    const d = k.rng.range(0, 0.45);
    k.add(st, weather(g, c, k.rng, 1, 0.3), { x: Math.cos(a) * d, y: big ? s * 0.3 : s * 0.4, z: Math.sin(a) * d, ry: k.rng.range(0, 3), rz: k.rng.range(-0.3, 0.3) }, k.rng.range(0.75, 1));
  }
};

const rockCluster: Builder = (k, c) => {
  const st = M.rock(c);
  const n = 3 + c.variant;
  for (let i = 0; i < n; i++) {
    const s = i === 0 ? k.rng.range(0.16, 0.24) : k.rng.range(0.06, 0.14);
    const a = k.rng.range(0, Math.PI * 2);
    const d = i === 0 ? 0 : k.rng.range(0.15, 0.45);
    k.add(st, weather(rock(s, k.rng, { flat: 0.6 }), c, k.rng, 1, 0.3), { x: Math.cos(a) * d, y: s * 0.3, z: Math.sin(a) * d });
  }
};

const boulder: Builder = (k, c) => {
  const st = M.rock(c);
  const r = 0.52;
  const g = rock(r, k.rng, { detail: 2, flat: 0.75 });
  g.translate(0, r * 0.45, 0);
  weather(g, c, k.rng, 1.3, 0.5);
  // Moss or snow settles on the top.
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  const top = new THREE.Color(c.pal.leaf);
  for (let i = 0; i < n.count; i++) {
    const t = THREE.MathUtils.clamp((n.getY(i) - 0.55) * 2.5, 0, 1) * c.pal.stainAmt;
    col.setXYZ(i, col.getX(i) * (1 - t + t * top.r * 1.4), col.getY(i) * (1 - t + t * top.g * 1.4), col.getZ(i) * (1 - t + t * top.b * 1.4));
  }
  k.add(st, g);
  if (c.variant >= 2) k.add(st, weather(rock(0.22, k.rng, { flat: 0.7 }), c, k.rng), { x: 0.42, y: 0.1, z: 0.25 });
};

const stalagmite: Builder = (k, c) => {
  const st = M.rock(c);
  const h = 1.1 + c.variant * 0.35;
  const g = lathe([[0.0001, 0], [0.3, 0], [0.26, h * 0.15], [0.16, h * 0.5], [0.07, h * 0.85], [0.0001, h]], 9);
  const s = smooth(g);
  jag(s, k.rng, 0.05, 4);
  k.add(st, weather(s, c, k.rng, 1.2, 0.5));
  for (let i = 0; i < 2; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const sh = k.rng.range(0.25, 0.5);
    const g2 = smooth(lathe([[0.0001, 0], [0.11, 0], [0.05, sh * 0.6], [0.0001, sh]], 7));
    jag(g2, k.rng, 0.02, 8);
    k.add(st, weather(g2, c, k.rng), { x: Math.cos(a) * 0.24, z: Math.sin(a) * 0.24 });
  }
};

const ruinWall: Builder = (k, c) => {
  const st = M.stone(c);
  // Coursed blocks, the top course broken away unevenly.
  const len = 1.35;
  const courses = 5;
  const ch = 0.3;
  const tops = [1, 0.75, 0.55][c.variant % 3]!;
  for (let row = 0; row < courses; row++) {
    const y = row * ch;
    let x = -len / 2 + (row % 2 ? 0.18 : 0);
    if (row % 2) {
      // A half block at the start of odd courses.
      k.add(st, weather(box(0.17, ch - 0.02, 0.44, 0.03), c, k.rng, 1, 0.5), { x: -len / 2 + 0.09, y: y + ch / 2 });
    }
    while (x < len / 2 - 0.05) {
      const bw = Math.min(len / 2 - x, k.rng.range(0.32, 0.44));
      const t = (x + len / 2) / len;
      const keep = row < 2 || (row / courses) < tops * (0.55 + 0.45 * Math.sin(t * Math.PI * (1 + c.variant * 0.5) + 0.6));
      if (keep) {
        const g = box(bw - 0.02, ch - 0.02, 0.44, 0.035, 2);
        jag(g, k.rng, 0.012, 7);
        k.add(st, weather(g, c, k.rng, 1.1, 0.6), { x: x + bw / 2, y: y + ch / 2, ry: k.rng.range(-0.02, 0.02) }, k.rng.range(0.8, 1.05));
      }
      x += bw;
    }
  }
  for (let i = 0; i < 3; i++) {
    const g = box(0.3, 0.26, 0.24, 0.03, 2);
    jag(g, k.rng, 0.02, 7);
    k.add(st, weather(g, c, k.rng), { x: k.rng.range(-0.5, 0.5), y: 0.12, z: k.rng.range(0.3, 0.55) * (k.rng.chance(0.5) ? 1 : -1), ry: k.rng.range(0, 3), rz: k.rng.range(-0.3, 0.3) });
  }
};

const cairn: Builder = (k, c) => {
  const st = M.rock(c);
  let y = 0;
  const n = 5 + c.variant;
  for (let i = 0; i < n; i++) {
    const r = 0.36 * (1 - i / (n + 1.5));
    const g = rock(r, k.rng, { flat: 0.42 });
    g.computeBoundingBox();
    const hh = g.boundingBox!.max.y - g.boundingBox!.min.y;
    k.add(st, weather(g, c, k.rng, 1, 0.4), { y: y + hh * 0.45, x: k.rng.range(-0.03, 0.03), z: k.rng.range(-0.03, 0.03), ry: k.rng.range(0, 3) });
    y += hh * 0.78;
  }
  if (c.variant === 2) k.add(M.bone(c), sphere(0.08, 8, 6), { y: y + 0.05, sz: 1.2 }, 0.9);
};

const fountain: Builder = (k, c) => {
  const st = M.stone(c);
  // A round basin, a central column with a bowl, dark still water.
  const basin = lathe([[0.95, 0], [0.98, 0.08], [0.95, 0.45], [1.0, 0.5], [0.96, 0.56], [0.86, 0.56], [0.84, 0.12], [0.0001, 0.12]], 24);
  jag(basin, k.rng, 0.015, 5);
  k.add(st, weather(basin, c, k.rng, 1.2, 0.5));
  const water = propMat('ground.mud', { tint: 0x26343a, rough: 0.08, grime: 0 });
  k.add(water, disc(0.85, 24, 0), { y: 0.42 });
  const col = lathe([[0.22, 0], [0.18, 0.1], [0.12, 0.2], [0.11, 0.9], [0.14, 0.95], [0.38, 1.05], [0.42, 1.12], [0.36, 1.14], [0.0001, 1.1]], 14);
  jag(col, k.rng, 0.01, 7);
  k.add(st, weather(col, c, k.rng, 1.3), { y: 0.12 });
  k.add(water, disc(0.34, 14, 0), { y: 1.2 });
  if (c.variant === 1) k.add(st, weather(sphere(0.12, 10, 8), c, k.rng), { y: 1.32 });
};

const idolHead: Builder = (k, c) => {
  const st = M.stone(c);
  // A colossal head sunk to the chin, crowned with a headdress.
  const skullG = sphere(0.75, 16, 12);
  skullG.scale(0.92, 1.1, 0.95);
  const parts = [skullG];
  const nose = box(0.22, 0.4, 0.3, 0.06, 2);
  nose.translate(0, 0.0, 0.72);
  parts.push(nose);
  const brow = box(1.1, 0.16, 0.35, 0.05, 2);
  brow.translate(0, 0.28, 0.6);
  parts.push(brow);
  const lips = box(0.5, 0.14, 0.2, 0.05, 2);
  lips.translate(0, -0.42, 0.66);
  parts.push(lips);
  const head = merge(parts);
  jag(head, k.rng, 0.04, 2.5);
  head.translate(0, 0.6, 0);
  k.add(st, weather(head, c, k.rng, 1.5, 0.7));
  const crown = cyl(0.5, 0.66, 0.36, 12);
  jag(crown, k.rng, 0.03, 3);
  k.add(st, weather(crown, c, k.rng), { y: 1.3 }, 0.9);
  // The eyes: sockets with a faint light deep inside.
  const eye = glowMat(c.pal.accent, c.variant === 1 ? 1.6 : 0.7);
  for (const s of [-1, 1]) k.add(eye, sphere(0.08, 8, 6), { x: s * 0.27, y: 0.75, z: 0.64, sz: 0.4 });
  for (let i = 0; i < 6; i++) k.add(st, rock(0.12, k.rng, { flat: 0.6 }), { x: k.rng.range(-1, 1), y: 0.05, z: k.rng.range(-0.9, 0.9) }, 0.8);
};

const wallRelief: Builder = (k, c) => {
  const st = M.stone(c);
  // A framed panel on the wall with a figure in low relief.
  const z = W + 0.04;
  k.add(st, weather(box(1.1, 1.4, 0.08, 0.02), c, k.rng), { y: 1.5, z });
  k.add(st, box(1.22, 0.12, 0.14, 0.02), { y: 2.26, z: z + 0.02 }, 0.9);
  k.add(st, box(1.22, 0.12, 0.14, 0.02), { y: 0.74, z: z + 0.02 }, 0.9);
  const fig = merge([
    lathe([[0.2, 0], [0.16, 0.4], [0.12, 0.75], [0.0001, 0.78]], 8).scale(1, 1, 0.25),
    sphere(0.09, 8, 6).scale(1, 1.1, 0.4).translate(0, 0.86, 0),
  ]);
  jag(fig, k.rng, 0.01, 10);
  k.add(st, weather(fig, c, k.rng), { y: 0.95, z: z + 0.05 }, 0.95);
  if (c.variant === 1) {
    for (const s of [-1, 1]) k.add(st, box(0.06, 0.7, 0.04, 0.01), { x: s * 0.3, y: 1.2, z: z + 0.06, rz: s * 0.3 }, 0.9);
  } else if (c.variant === 2) {
    k.add(glowMat(c.pal.accent, 0.9), torus(0.12, 0.012, 3, 16), { y: 2.0, z: z + 0.05 });
  }
};

/** An inlaid seal flat on the floor: stone rings, metal inlay, rune ticks. */
function seal(k: PropKit, c: BuildCtx, R: number): void {
  const st = M.stone(c, { grime: 0 });
  const metal = M.fine(c, { grime: 0 });
  k.add(st, disc(R, 32, 0.006), undefined, 0.75);
  for (const [r, w] of [[R * 0.96, 0.04], [R * 0.78, 0.03], [R * 0.42, 0.025]] as const) {
    const ring = new THREE.RingGeometry(r - w, r, 40);
    ring.rotateX(-Math.PI / 2);
    k.add(metal, ring, { y: 0.014 }, 0.8);
  }
  const ticks = 12 + c.variant * 4;
  const rune = R > 1.2 ? glowMat(c.pal.accent, 0.7) : metal;
  for (let i = 0; i < ticks; i++) {
    const a = (i / ticks) * Math.PI * 2;
    const g = new THREE.PlaneGeometry(0.03 * R, 0.12 * R);
    g.rotateX(-Math.PI / 2);
    k.add(rune, g, { x: Math.cos(a) * R * 0.87, y: 0.016, z: Math.sin(a) * R * 0.87, ry: -a }, 0.9);
  }
  // A star in the middle.
  const star = new THREE.Shape();
  const pts = 5 + (c.variant % 3);
  for (let i = 0; i <= pts * 2; i++) {
    const a = (i / (pts * 2)) * Math.PI * 2;
    const r = (i % 2 ? 0.16 : 0.38) * R;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const sg = new THREE.ShapeGeometry(star);
  sg.rotateX(-Math.PI / 2);
  k.add(metal, sg, { y: 0.012 }, 0.7);
}

const floorSeal: Builder = (k, c) => seal(k, c, 1);
const arenaSeal: Builder = (k, c) => seal(k, c, 1.9);

/** A flat-sided dressed block (used by others). */
export function block(k: PropKit, mat: THREE.Material, c: BuildCtx, w: number, h: number, d: number, t: Parameters<PropKit['add']>[2] = {}): void {
  const g = box(w, h, d, 0.03, 2);
  jag(g, k.rng, Math.min(w, h, d) * 0.04, 6);
  g.translate(0, h / 2, 0);
  k.add(mat, weather(g, c, k.rng), t);
}

export const STONE: Record<string, Builder> = {
  pillarGothic,
  pillarFluted,
  pillarBroken,
  pillarVoid,
  stalacColumn,
  brokenColumn,
  statue,
  altar,
  obelisk,
  runeStone,
  rubblePile,
  rockCluster,
  boulder,
  stalagmite,
  ruinWall,
  cairn,
  fountain,
  idolHead,
  wallRelief,
  floorSeal,
  arenaSeal,
};

void shade;
