/**
 * SLAY — things that burn or glow: wall torches and sconces, lanterns,
 * glowing growths, braziers, candles, lantern posts and camp fires.
 *
 * Wall lights put their flame about two metres up and a hand in front of the
 * wall (the light sits at `height 2.0, forward 0.3` in `Defs.ts`). Flames are
 * built with their base at the origin of the flame layer so the builder's
 * flicker grows them from the wick.
 */
import * as THREE from 'three';
import { PropKit, WALL_FACE, box, cone, cyl, jag, lathe, log, merge, mottle, rock, shadeY, sphere, torus, tube, chain, skull } from './Kit';
import { type BuildCtx, type Builder, M, fireGeo, flameGeo } from './Ctx';
import { flameMat, glowMat, propMat } from './PropMats';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const W = WALL_FACE;

/** Pitch-soaked rag around a torch head. */
const tar = () => propMat('cloth.rag', { tint: 0x2a221c, grime: 0 });
const coals = () => glowMat(0xff5a14, 1.7);

/** A wall plate with four rivets, for brackets. */
function plate(k: PropKit, c: BuildCtx, w: number, h: number, y: number): void {
  const iron = M.iron(c);
  k.box(iron, w, h, 0.035, { y, z: W + 0.018 }, 0.85, 0.01);
  for (const sx of [-1, 1]) for (const sy of [0, 1]) k.add(iron, sphere(0.014, 5, 4), { x: sx * (w / 2 - 0.025), y: y + 0.03 + sy * (h - 0.06), z: W + 0.04 }, 0.7);
}

const torch: Builder = (k, c) => {
  const iron = M.iron(c);
  const v = c.variant;
  plate(k, c, 0.13, 0.3, 1.42);
  // Arm: out from the plate, then up into the cup.
  k.add(iron, tube([V(0, 1.6, W + 0.02), V(0, 1.56, W + 0.15), V(0, 1.62, 0.04), V(0, 1.7, 0.06)], 0.018, 0.016, 5), undefined, 0.8);
  k.add(iron, torus(0.05, 0.012, 4, 10), { y: 1.7, z: 0.06, rx: Math.PI / 2 }, 0.8);
  if (v === 1) {
    // A second ring lower down and a hanging loop of chain.
    k.add(iron, torus(0.042, 0.01, 4, 10), { y: 1.56, z: 0.04, rx: Math.PI / 2 }, 0.8);
    k.add(iron, chain(V(-0.05, 1.6, W + 0.04), V(0.05, 1.6, W + 0.04), 0.16, 0.05), undefined, 0.75);
  }
  // Handle, leaning off the wall, and its tarred head.
  const handle = log(0.5, 0.03, k.rng, { seg: 6, taper: 1.15, bend: 0.01 });
  k.add(M.wood(c), handle, { y: 1.42, z: 0.035, rx: 0.12 }, 0.75);
  const head = cyl(0.058, 0.044, 0.15, 7);
  jag(head, k.rng, 0.008, 30);
  k.add(tar(), head, { y: 1.8, z: 0.085, rx: 0.12 }, 1);
  k.flame(flameMat(c.glow, 0.8), flameGeo(0.3, 0.075, k.rng), 1.93, 0.1);
};

const forgeSconce: Builder = (k, c) => {
  const iron = propMat('prop.iron.black');
  plate(k, c, 0.2, 0.36, 1.3);
  // A heavy bracket and a caged basket of coals.
  k.add(iron, tube([V(-0.08, 1.4, W + 0.03), V(-0.07, 1.56, 0.0), V(0, 1.66, 0.08)], 0.022, 0.02, 5), undefined, 0.8);
  k.add(iron, tube([V(0.08, 1.4, W + 0.03), V(0.07, 1.56, 0.0), V(0, 1.66, 0.08)], 0.022, 0.02, 5), undefined, 0.8);
  const bowl = lathe([[0.03, 0], [0.12, 0.03], [0.17, 0.1], [0.18, 0.16], [0.165, 0.16], [0.15, 0.1], [0.03, 0.04]], 10);
  k.add(iron, bowl, { y: 1.62, z: 0.08 }, 0.7);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.add(iron, box(0.02, 0.24, 0.02, 0.004), { x: Math.cos(a) * 0.17, y: 1.86, z: 0.08 + Math.sin(a) * 0.17, rz: Math.cos(a) * 0.18, rx: -Math.sin(a) * 0.18 }, 0.75);
  }
  k.add(iron, torus(0.2, 0.014, 4, 14), { y: 1.98, z: 0.08, rx: Math.PI / 2 }, 0.75);
  const coal = merge([0, 1, 2, 3, 4].map(() => {
    const g = rock(0.05, k.rng, { detail: 0 });
    g.translate(k.rng.range(-0.08, 0.08), 0, k.rng.range(-0.08, 0.08));
    return g;
  }));
  k.add(coals(), coal, { y: 1.77, z: 0.08 });
  if (c.variant === 1) {
    // A soot hood over the basket.
    const hood = cone(0.24, 0.3, 8);
    k.add(iron, hood, { y: 2.18, z: 0.04 }, 0.5);
  }
  k.flame(flameMat(c.glow), fireGeo(0.12, 0.42, k.rng, 4), 1.8, 0.08);
};

const templeLantern: Builder = (k, c) => {
  const metal = M.fine(c);
  plate(k, c, 0.1, 0.22, 2.25);
  k.add(metal, tube([V(0, 2.36, W + 0.02), V(0, 2.42, -0.05), V(0, 2.38, 0.12)], 0.016, 0.014, 5), undefined, 0.8);
  k.add(metal, chain(V(0, 2.37, 0.12), V(0, 2.18, 0.12), 0.0, 0.045), undefined, 0.8);
  // A pierced bronze lantern: cap, frame, glowing panes, foot.
  const y0 = 1.82;
  k.add(metal, cone(0.13, 0.14, 6), { y: y0 + 0.3, z: 0.12 }, 0.85);
  k.add(metal, cyl(0.12, 0.12, 0.03, 6), { y: y0 + 0.28, z: 0.12 }, 0.75);
  k.add(metal, cyl(0.1, 0.12, 0.05, 6), { y: y0, z: 0.12 }, 0.75);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    k.add(metal, box(0.018, 0.25, 0.018, 0.004), { x: Math.cos(a) * 0.11, y: y0 + 0.165, z: 0.12 + Math.sin(a) * 0.11 }, 0.7);
  }
  k.add(glowMat(c.glow, 1.1), cyl(0.095, 0.095, 0.22, 6), { y: y0 + 0.05, z: 0.12 }, 0.8);
  k.flame(flameMat(c.glow), flameGeo(0.14, 0.04, k.rng), y0 + 0.08, 0.12);
};

const iceLantern: Builder = (k, c) => {
  const iron = M.iron(c);
  plate(k, c, 0.14, 0.26, 1.5);
  k.add(iron, tube([V(0, 1.62, W + 0.02), V(0, 1.6, -0.06), V(0, 1.68, 0.06)], 0.018, 0.016, 5), undefined, 0.8);
  // A cradle of iron prongs holding a block of glowing ice.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.add(iron, tube([V(0, 1.68, 0.08), V(Math.cos(a) * 0.1, 1.76, 0.08 + Math.sin(a) * 0.1), V(Math.cos(a) * 0.11, 1.98, 0.08 + Math.sin(a) * 0.11)], 0.011, 0.008, 4), undefined, 0.8);
  }
  const ice = new THREE.OctahedronGeometry(0.13, 0);
  ice.scale(0.8, 1.6, 0.8);
  jag(ice, k.rng, 0.012, 9);
  k.add(propMat('crystal.ice', { emissive: c.glow, emissiveIntensity: 0.9, grime: 0 }), ice, { y: 1.92, z: 0.08, ry: k.rng.range(0, 1) });
  k.add(glowMat(c.glow, 2.2), sphere(0.05, 6, 5), { y: 1.92, z: 0.08 });
  // Frost rime down the wall under it.
  const rime = rock(0.12, k.rng, { flat: 0.3 });
  rime.scale(1, 2, 0.4);
  k.add(propMat('crystal.frost'), rime, { y: 1.3, z: W + 0.02 }, 0.9);
  k.flame(flameMat(c.glow, 0.5), flameGeo(0.18, 0.05, k.rng), 1.84, 0.08);
};

const glowShroom: Builder = (k, c) => {
  // Shelf fungus up the wall: thick woody caps with a softly lit rim and
  // gills, in the biome's own light colour (never a saturated pool).
  const cap = propMat('flesh.rotted', { tint: 0x8a7a68 });
  const gill = glowMat(c.glow, 0.9);
  const n = 3 + c.variant;
  for (let i = 0; i < n; i++) {
    const y = 1.4 + i * (0.75 / n) + k.rng.range(-0.06, 0.06);
    const x = k.rng.range(-0.28, 0.28);
    const r = k.rng.range(0.13, 0.22) * (i === n - 1 ? 1.3 : 1);
    const shelf = lathe([[0.0001, r * 0.55], [r * 0.5, r * 0.5], [r * 0.9, r * 0.3], [r, r * 0.12], [r * 0.9, 0], [0.0001, 0]], 10);
    shelf.scale(1, 1, 0.62);
    jag(shelf, k.rng, r * 0.06, 6 / r);
    k.add(cap, shadeY(shelf, 0, r * 0.5, 0.55), { x, y, z: W + r * 0.5 });
    const rim = torus(r * 0.93, r * 0.07, 4, 14);
    rim.rotateX(Math.PI / 2);
    rim.scale(1, 1, 0.62);
    k.add(gill, rim, { x, y: y + r * 0.08, z: W + r * 0.5 });
    const under = lathe([[0.0001, 0], [r * 0.88, 0]], 10);
    under.scale(1, 1, 0.6);
    k.add(gill, under, { x, y: y - 0.004, z: W + r * 0.5, rx: Math.PI });
  }
  // A clump of stalked caps on the plinth.
  for (let i = 0; i < 4; i++) {
    const x = k.rng.range(-0.3, 0.3);
    const h = k.rng.range(0.12, 0.26);
    const r = k.rng.range(0.05, 0.08);
    k.add(cap, cyl(0.016, 0.024, h, 6), { x, y: 0.42, z: W + 0.2 }, 0.8);
    k.add(cap, lathe([[0.0001, r * 0.6], [r * 0.7, r * 0.5], [r, 0.01], [0.0001, 0]], 8), { x, y: 0.42 + h - 0.01, z: W + 0.2 }, 0.9);
    k.add(gill, cyl(r * 0.9, r * 0.9, 0.008, 8), { x, y: 0.42 + h - 0.012, z: W + 0.2 });
  }
  k.flame(flameMat(c.glow, 0.25), sphere(0.06, 5, 4), 1.9, 0.05);
};

const eggSac: Builder = (k, c) => {
  const resin = propMat('flesh.chitin', { tint: 0x6a5030 });
  const yolk = glowMat(c.glow, 1.4);
  // Resin smeared on the wall, and a sagging cluster of sacs hanging off it.
  const smear = sphere(0.3, 12, 10);
  smear.scale(1.0, 1.6, 0.22);
  jag(smear, k.rng, 0.03, 5);
  k.add(resin, smear, { y: 1.95, z: W + 0.07 }, 0.6);
  const n = 3 + c.variant;
  for (let i = 0; i < n; i++) {
    const r = k.rng.range(0.07, 0.13);
    const g = sphere(r, 9, 7);
    g.scale(1, 1.35, 1);
    jag(g, k.rng, r * 0.08, 10 / r);
    const x = k.rng.range(-0.2, 0.2);
    const y = k.rng.range(1.65, 2.2);
    k.add(yolk, g, { x, y, z: W + 0.1 + k.rng.range(0, 0.08) }, 0.9);
    k.add(resin, tube([V(x, y + r * 1.2, W + 0.08), V(x * 0.7, y + 0.25, W + 0.03)], 0.012, 0.006, 4), undefined, 0.8);
  }
  k.flame(flameMat(c.glow, 0.25), sphere(0.08, 5, 4), 1.9, 0.12);
};

const voidFlame: Builder = (k, c) => {
  const iron = propMat('prop.iron.black');
  plate(k, c, 0.16, 0.3, 1.4);
  k.add(iron, tube([V(0, 1.56, W + 0.02), V(0, 1.5, 0.0), V(0, 1.66, 0.08)], 0.02, 0.018, 5), undefined, 0.8);
  // A clawed bowl holding a cold flame, with shards drifting round it.
  const bowl = lathe([[0.02, 0], [0.09, 0.02], [0.13, 0.08], [0.14, 0.12], [0.12, 0.11], [0.08, 0.06], [0.02, 0.04]], 8);
  k.add(iron, bowl, { y: 1.64, z: 0.08 }, 0.75);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    k.add(iron, cone(0.02, 0.14, 4), { x: Math.cos(a) * 0.13, y: 1.74, z: 0.08 + Math.sin(a) * 0.13, rz: Math.cos(a) * 0.4, rx: -Math.sin(a) * 0.4 }, 0.8);
  }
  const shard = glowMat(c.pal.accent, 1.6);
  for (let i = 0; i < 3; i++) {
    const g = new THREE.OctahedronGeometry(0.03, 0);
    g.scale(0.6, 1.8, 0.6);
    const a = k.rng.range(0, Math.PI * 2);
    k.add(shard, g, { x: Math.cos(a) * 0.24, y: 1.9 + k.rng.range(-0.1, 0.15), z: 0.08 + Math.sin(a) * 0.15, rz: k.rng.range(-0.5, 0.5) });
  }
  k.flame(flameMat(c.glow), fireGeo(0.08, 0.36, k.rng, 3), 1.76, 0.08);
};

// --- standing lights --------------------------------------------------------

const brazier: Builder = (k, c) => {
  const iron = M.iron(c);
  const v = c.variant;
  let top: number;
  if (v === 2) {
    // A squat stone pedestal bowl.
    const stone = M.stone(c);
    const ped = lathe([[0.28, 0], [0.28, 0.08], [0.2, 0.12], [0.15, 0.2], [0.13, 0.6], [0.17, 0.66], [0.26, 0.74], [0.3, 0.86], [0.27, 0.9], [0.2, 0.84], [0.0001, 0.84]], 12);
    jag(ped, k.rng, 0.012, 10);
    mottle(ped, k.rng, c.pal.stainAmt, 3, c.pal.stain);
    k.add(stone, shadeY(ped, 0, 0.4, 0.6));
    top = 0.86;
  } else {
    // Three splayed iron legs, a ring and a deep bowl.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      const leg = tube([V(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3), V(Math.cos(a) * 0.22, 0.45, Math.sin(a) * 0.22), V(Math.cos(a) * 0.2, 0.9, Math.sin(a) * 0.2)], 0.022, 0.018, 5);
      k.add(iron, leg, undefined, 0.8);
      k.add(iron, sphere(0.035, 6, 4), { x: Math.cos(a) * 0.3, y: 0.02, z: Math.sin(a) * 0.3 }, 0.7);
    }
    k.add(iron, torus(0.22, 0.014, 4, 16), { y: 0.42, rx: Math.PI / 2 }, 0.75);
    const bowl = lathe([[0.04, 0], [0.18, 0.04], [0.27, 0.14], [0.3, 0.24], [0.28, 0.25], [0.24, 0.16], [0.04, 0.06]], 12);
    jag(bowl, k.rng, 0.008, 12);
    k.add(iron, bowl, { y: 0.82 }, 0.7);
    if (v === 1) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        k.add(iron, cone(0.022, 0.16, 4), { x: Math.cos(a) * 0.29, y: 1.04, z: Math.sin(a) * 0.29, rz: Math.cos(a) * 0.3, rx: -Math.sin(a) * 0.3 }, 0.75);
      }
    }
    top = 1.04;
  }
  const coal = merge([0, 1, 2, 3, 4, 5, 6].map(() => {
    const g = rock(0.07, k.rng, { detail: 0 });
    g.translate(k.rng.range(-0.14, 0.14), k.rng.range(-0.02, 0.03), k.rng.range(-0.14, 0.14));
    return g;
  }));
  k.add(coals(), coal, { y: top - 0.04 });
  k.add(propMat('prop.timber.charred'), log(0.4, 0.035, k.rng, { seg: 5 }), { y: top - 0.02, x: -0.15, rz: -1.3, ry: k.rng.range(0, 3) }, 0.7);
  k.flame(flameMat(c.pal.flame), fireGeo(0.18, 0.6, k.rng, 5), top, 0);
};

const candleCluster: Builder = (k, c) => {
  const wax = propMat('bone.pale', { tint: 0xd8ccb0, rough: 0.7, grime: 0.3 });
  const n = 3 + c.variant * 2;
  const flames: THREE.BufferGeometry[] = [];
  // A puddle of old wax that the candles stand in.
  const puddle = lathe([[0.0001, 0.015], [0.13, 0.012], [0.19, 0], [0.0001, 0]], 12);
  jag(puddle, k.rng, 0.02, 8);
  k.add(wax, puddle, undefined, 0.6);
  if (c.variant === 2) k.add(M.bone(c), skull(k.rng, 0.9), { y: 0.09, ry: k.rng.range(-0.6, 0.6) }, 0.85);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + k.rng.range(-0.4, 0.4);
    const d = i === 0 ? 0.03 : k.rng.range(0.07, 0.19);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = k.rng.range(0.06, i === 0 ? 0.32 : 0.24);
    const r = k.rng.range(0.016, 0.028);
    const body = lathe([[r * 1.4, 0], [r, 0.02], [r, h - 0.01], [r * 0.85, h], [0.0001, h]], 7);
    jag(body, k.rng, 0.003, 50);
    k.add(wax, body, { x, z, y: c.variant === 2 && i === 0 ? 0.17 : 0 }, k.rng.range(0.85, 1));
    const f = flameGeo(0.06, 0.012, k.rng);
    f.translate(x, (c.variant === 2 && i === 0 ? 0.17 : 0) + h + 0.005 - 0.2, z);
    flames.push(f);
  }
  k.flame(flameMat(c.pal.flame), merge(flames), 0.2, 0);
};

const candelabra: Builder = (k, c) => {
  const iron = c.variant === 0 ? M.iron(c) : M.fine(c);
  const wax = propMat('bone.pale', { tint: 0xd8ccb0, rough: 0.7, grime: 0 });
  // Three clawed feet, a turned shaft, three arms.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.add(iron, tube([V(0, 0.22, 0), V(Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15), V(Math.cos(a) * 0.23, 0, Math.sin(a) * 0.23)], 0.03, 0.02, 5), undefined, 0.8);
  }
  const shaft = lathe([[0.05, 0.1], [0.07, 0.2], [0.035, 0.34], [0.03, 1.1], [0.06, 1.16], [0.035, 1.24], [0.03, 1.42], [0.0001, 1.44]], 8);
  k.add(iron, shaft, undefined, 0.8);
  const flames: THREE.BufferGeometry[] = [];
  const tips: Array<[number, number, number]> = [[0, 1.46, 0]];
  for (const s of [-1, 1]) {
    k.add(iron, tube([V(0, 1.2, 0), V(s * 0.16, 1.22, 0), V(s * 0.24, 1.32, 0), V(s * 0.24, 1.42, 0)], 0.022, 0.018, 5), undefined, 0.8);
    tips.push([s * 0.24, 1.42, 0]);
  }
  for (const [x, y, z] of tips) {
    k.add(iron, cyl(0.045, 0.02, 0.04, 7), { x, y, z }, 0.75);
    const h = k.rng.range(0.12, 0.24);
    k.add(wax, cyl(0.02, 0.022, h, 6), { x, y: y + 0.03, z }, k.rng.range(0.85, 1));
    const f = flameGeo(0.07, 0.014, k.rng);
    f.translate(x, y + 0.03 + h - 1.6, z);
    flames.push(f);
  }
  k.flame(flameMat(c.pal.flame), merge(flames), 1.6, 0);
};

const lanternPost: Builder = (k, c) => {
  const wood = M.wood(c);
  const iron = M.iron(c);
  // A crooked post, a brace and a crossarm with a lantern hung off the end.
  k.add(wood, log(2.55, 0.08, k.rng, { seg: 7, taper: 0.8, bend: 0.015 }), undefined, 0.8);
  k.add(wood, box(0.1, 0.1, 0.72, 0.02), { y: 2.4, z: 0.26 }, 0.75);
  k.add(wood, box(0.06, 0.06, 0.5, 0.012), { y: 2.2, z: 0.15, rx: -0.75 }, 0.7);
  if (c.variant !== 1) {
    // A stone collar at the foot keeps it upright.
    const ring = merge([0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2;
      const g = rock(0.09, k.rng, { flat: 0.7 });
      g.translate(Math.cos(a) * 0.15, 0.04, Math.sin(a) * 0.15);
      return g;
    }));
    k.add(M.rock(c), ring, undefined, 0.85);
  }
  const lz = 0.52;
  k.add(iron, chain(V(0, 2.38, lz), V(0, 2.22, lz), 0, 0.04), undefined, 0.8);
  const y0 = 1.95;
  k.add(iron, cone(0.12, 0.13, 4), { y: y0 + 0.26, z: lz, ry: Math.PI / 4 }, 0.8);
  k.add(iron, box(0.2, 0.025, 0.2, 0.006), { y: y0, z: lz }, 0.75);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(iron, box(0.016, 0.26, 0.016, 0.003), { x: sx * 0.09, y: y0 + 0.01, z: lz + sz * 0.09 }, 0.7);
  k.add(glowMat(c.glow, 1.0), box(0.16, 0.2, 0.16, 0.004), { y: y0 + 0.035, z: lz }, 0.8);
  if (c.variant === 2) {
    // A second, shorter arm with a hook, nothing on it.
    k.add(iron, box(0.04, 0.04, 0.4, 0.01), { y: 1.7, z: -0.18 }, 0.75);
  }
  k.flame(flameMat(c.glow), flameGeo(0.1, 0.03, k.rng), y0 + 0.05, lz);
};

const campfire: Builder = (k, c) => {
  const v = c.variant;
  // A ring of blackened stones.
  const stones: THREE.BufferGeometry[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + k.rng.range(-0.1, 0.1);
    const g = rock(k.rng.range(0.09, 0.13), k.rng, { flat: 0.65 });
    g.translate(Math.cos(a) * 0.44, 0.05, Math.sin(a) * 0.44);
    stones.push(g);
  }
  const ring = merge(stones);
  shadeY(ring, 0, 0.15, 0.4);
  k.add(M.rock(c), ring, undefined, 0.75);
  // Ash bed, crossed logs, coals.
  const ash = lathe([[0.0001, 0.03], [0.3, 0.02], [0.38, 0]], 12);
  jag(ash, k.rng, 0.015, 9);
  k.add(propMat('ground.ash'), ash, undefined, 0.6);
  const charred = propMat('prop.timber.charred');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + k.rng.range(-0.2, 0.2);
    k.add(charred, log(0.5, 0.045, k.rng, { seg: 6 }), { x: Math.cos(a) * 0.24, y: 0.04, z: Math.sin(a) * 0.24, ry: -a + Math.PI / 2, rz: 1.15 }, 0.7);
  }
  const coal = merge([0, 1, 2, 3, 4, 5].map(() => {
    const g = rock(0.06, k.rng, { detail: 0 });
    g.translate(k.rng.range(-0.15, 0.15), 0.04, k.rng.range(-0.15, 0.15));
    return g;
  }));
  k.add(coals(), coal);
  const wood = M.wood(c);
  if (v === 1) {
    // A spit: two forked sticks and a bar across.
    for (const s of [-1, 1]) {
      k.add(wood, log(0.75, 0.025, k.rng, { seg: 5 }), { x: s * 0.5, rz: s * 0.06 }, 0.8);
      k.add(wood, log(0.14, 0.015, k.rng, { seg: 4 }), { x: s * 0.5, y: 0.68, rz: s * 0.5 }, 0.8);
    }
    k.add(wood, log(1.1, 0.02, k.rng, { seg: 5, taper: 1 }), { x: -0.55, y: 0.72, rz: -Math.PI / 2 }, 0.75);
  } else if (v === 2) {
    // A tripod and a blackened pot.
    const iron = M.iron(c);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      k.add(wood, tube([V(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5), V(0, 1.0, 0)], 0.022, 0.018, 5), undefined, 0.75);
    }
    k.add(iron, chain(V(0, 0.98, 0), V(0, 0.72, 0), 0, 0.04), undefined, 0.8);
    const pot = lathe([[0.0001, 0], [0.1, 0.01], [0.15, 0.08], [0.15, 0.18], [0.12, 0.24], [0.13, 0.26], [0.11, 0.26], [0.1, 0.22]], 10);
    k.add(iron, pot, { y: 0.44 }, 0.5);
  }
  k.flame(flameMat(c.pal.flame), fireGeo(0.22, 0.6, k.rng, 6), 0.06, 0);
};

export const LIGHTS: Record<string, Builder> = {
  torch,
  forgeSconce,
  templeLantern,
  iceLantern,
  glowShroom,
  eggSac,
  voidFlame,
  brazier,
  candleCluster,
  candelabra,
  lanternPost,
  campfire,
};
