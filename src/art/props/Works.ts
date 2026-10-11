/**
 * SLAY — the foundry's iron: anvils, pipe clusters and runs, valve wheels,
 * gears, ingot stacks, forges, smelting vats and iron-banded pillars.
 */
import * as THREE from 'three';
import { PropKit, WALL_FACE, box, cone, cyl, jag, lathe, merge, mottle, rock, shadeY, sphere, torus, tube } from './Kit';
import { type BuildCtx, type Builder, M, fireGeo } from './Ctx';
import { flameMat, glowMat, propMat } from './PropMats';
import { weather } from './Stone';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const W = WALL_FACE;

const black = () => propMat('prop.iron.black');
const rust = () => propMat('prop.iron.rust');
const molten = () => glowMat(0xff6a14, 2.2);

/** A riveted collar round a pipe. */
function collar(k: PropKit, r: number, t: Parameters<PropKit['add']>[2]): void {
  k.add(black(), cyl(r * 1.25, r * 1.25, 0.06, 10), t, 0.8);
}

const anvil: Builder = (k, c) => {
  const iron = black();
  // A stump, the anvil on it: waist, face and horn; tongs and a hammer laid by.
  k.add(M.bark(c), cyl(0.3, 0.34, 0.42, 10), undefined, 0.75);
  const body = merge([
    box(0.28, 0.12, 0.2, 0.02).translate(0, 0.06, 0),
    box(0.16, 0.14, 0.14, 0.02).translate(0, 0.19, 0),
    box(0.5, 0.11, 0.2, 0.015).translate(0.02, 0.31, 0),
    cone(0.07, 0.24, 8).rotateZ(-Math.PI / 2).scale(1, 0.75, 1).translate(0.27 + 0.12, 0.31, 0),
  ]);
  k.add(iron, body, { y: 0.42 }, 0.85);
  k.add(iron, box(0.04, 0.03, 0.3, 0.005), { x: -0.12, y: 0.84, z: 0.05, ry: 0.3 }, 0.8);
  k.add(M.wood(c), cyl(0.018, 0.018, 0.34, 6).rotateZ(Math.PI / 2), { x: 0.0, y: 0.82, z: -0.12, ry: 0.5 }, 0.8);
  k.add(iron, box(0.1, 0.05, 0.05, 0.01), { x: -0.15, y: 0.8, z: -0.2, ry: 0.5 }, 0.8);
  if (c.variant === 1) k.add(propMat('metal.dark', { emissive: 0xff5a14, emissiveIntensity: 0.6 }), box(0.22, 0.03, 0.06, 0.008), { x: 0.05, y: 0.86 }, 1);
};

const pipeCluster: Builder = (k, c) => {
  const iron = c.variant === 1 ? rust() : black();
  // Pipes rising out of the floor and bending away, with collars and a valve.
  const n = 3 + c.variant;
  for (let i = 0; i < n; i++) {
    const x = -0.3 + (i / Math.max(1, n - 1)) * 0.6;
    const r = 0.07 + (i % 2) * 0.03;
    const h = 1.0 + k.rng.range(0, 0.9);
    k.add(iron, tube([V(x, -0.05, 0), V(x, h * 0.7, 0), V(x, h, -0.1), V(x, h + 0.05, -0.45)], r, r, 8, 10), undefined, 0.8);
    collar(k, r, { x, y: 0.12 });
    collar(k, r, { x, y: h * 0.55 });
  }
  k.add(iron, torus(0.12, 0.018, 4, 12), { x: 0, y: 0.75, z: 0.12 }, 0.8);
  k.add(rust(), box(0.85, 0.08, 0.6, 0.02), { y: 0 }, 0.7);
};

const pipeRun: Builder = (k, c) => {
  const iron = c.variant === 2 ? rust() : black();
  // Horizontal pipes on the wall with brackets, one dropping to the floor.
  const ys = c.variant === 1 ? [1.6] : [1.4, 1.85];
  for (const y of ys) {
    const r = y > 1.5 ? 0.07 : 0.1;
    k.add(iron, cyl(r, r, 2.0, 10).rotateZ(Math.PI / 2), { y, z: W + r + 0.04 }, 0.8);
    for (const x of [-0.7, 0, 0.7]) {
      k.add(iron, box(0.06, 0.05, r * 2 + 0.06, 0.01), { x, y: y - r - 0.03, z: W + r / 2 + 0.04 }, 0.7);
      collar(k, r, { x: x + 0.15, y, z: W + r + 0.04, rz: Math.PI / 2 });
    }
  }
  if (c.variant !== 1) k.add(iron, tube([V(0.5, 1.4, W + 0.14), V(0.5, 1.0, W + 0.16), V(0.5, 0.2, W + 0.2), V(0.5, -0.05, W + 0.2)], 0.06, 0.06, 8, 8), undefined, 0.8);
  // Soot and rust weeping down the wall below the joints.
  k.add(propMat('ground.ash', { grime: 0 }), box(0.12, 0.7, 0.005, 0.001), { x: 0.15, y: 0.95, z: W + 0.005 }, 0.5);
};

const valveWheel: Builder = (k, c) => {
  const iron = black();
  k.add(iron, cyl(0.06, 0.06, 0.25, 8).rotateX(Math.PI / 2), { y: 1.35, z: W + 0.12 }, 0.8);
  const wheel = merge([torus(0.24, 0.025, 5, 18), ...[0, 1, 2].map((i) => box(0.48, 0.03, 0.03, 0.006).rotateZ((i / 3) * Math.PI))]);
  k.add(c.variant ? rust() : propMat('prop.bronze'), wheel, { y: 1.35, z: W + 0.26 }, 0.85);
  k.add(iron, cyl(0.1, 0.1, 1.6, 10).rotateZ(Math.PI / 2), { y: 1.35, z: W + 0.12 }, 0.75);
};

const gear: Builder = (k, c) => {
  const iron = c.variant === 2 ? rust() : black();
  // A great cog lying broken, or leaning, half sunk.
  const R = 0.5;
  const teeth = 14;
  const parts: THREE.BufferGeometry[] = [cyl(R, R, 0.12, 24), cyl(0.12, 0.12, 0.2, 10).translate(0, -0.04, 0)];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    parts.push(box(0.12, 0.12, 0.1, 0.01).translate(0, 0.06, 0).rotateY(-a).translate(Math.cos(a) * (R + 0.04), 0, Math.sin(a) * (R + 0.04)));
  }
  const g = merge(parts);
  mottle(g, k.rng, 0.5, 3);
  const lean = c.variant === 1;
  k.add(iron, g, lean ? { y: 0.5, rx: Math.PI / 2 - 0.35, z: -0.1 } : { y: 0.02, rz: 0.08 }, 0.85);
  for (let i = 0; i < 3; i++) k.add(iron, box(0.05, 0.05, 0.05, 0.01), { x: k.rng.range(-0.5, 0.5), y: 0.0, z: k.rng.range(0.2, 0.5) }, 0.7);
};

const ingotStack: Builder = (k, c) => {
  const metal = c.variant === 2 ? propMat('prop.bronze') : propMat('prop.iron');
  // A crossed stack of ingots on a pallet.
  k.add(M.planks(c), box(0.6, 0.06, 0.5, 0.01), undefined, 0.8);
  const ingot = () => {
    const g = box(0.26, 0.07, 0.1, 0.02);
    return g;
  };
  const layers = 2 + c.variant;
  for (let l = 0; l < layers; l++) {
    for (let i = 0; i < 3; i++) {
      const t = l % 2 ? { x: -0.12 + i * 0.12, y: 0.095 + l * 0.075, ry: Math.PI / 2 } : { z: -0.12 + i * 0.12, y: 0.095 + l * 0.075 };
      k.add(metal, ingot(), t, k.rng.range(0.75, 1));
    }
  }
};

const forge: Builder = (k, c) => {
  const st = M.stone(c);
  // A brick hearth, a hood and chimney, glowing coals, bellows at the side.
  const hearth = box(1.5, 0.8, 1.1, 0.04, 3);
  jag(hearth, k.rng, 0.012, 5);
  k.add(st, weather(hearth.translate(0, 0.4, -0.2), c, k.rng));
  k.add(black(), box(1.0, 0.06, 0.7, 0.01), { y: 0.8, z: -0.12 }, 0.7);
  const coal = merge(Array.from({ length: 12 }, () => rock(0.07, k.rng, { detail: 0 }).translate(k.rng.range(-0.38, 0.38), 0, k.rng.range(-0.2, 0.2))));
  k.add(molten(), coal, { y: 0.88, z: -0.12 });
  // Hood on four posts, then the chimney up to the ceiling.
  const hood = lathe([[0.75, 0], [0.4, 0.6], [0.28, 0.75]], 4);
  hood.rotateY(Math.PI / 4);
  hood.scale(1.15, 1, 0.85);
  k.add(black(), hood, { y: 1.7, z: -0.25 }, 0.5);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.add(black(), box(0.06, 0.95, 0.06, 0.01), { x: sx * 0.62, y: 0.78, z: -0.25 + sz * 0.38 }, 0.7);
  k.add(st, weather(box(0.5, 1.6, 0.5, 0.03).translate(0, 0.8, 0), c, k.rng), { y: 2.4, z: -0.3 }, 0.8);
  // Bellows.
  k.add(propMat('leather.worn'), box(0.5, 0.16, 0.34, 0.06), { x: 0.95, y: 0.5, z: 0.0, ry: 0.2 }, 0.85);
  k.add(M.wood(c), box(0.55, 0.04, 0.38, 0.01), { x: 0.95, y: 0.66, z: 0.0, ry: 0.2 }, 0.85);
  if (c.variant === 1) k.add(propMat('metal.dark', { emissive: 0xff5a14, emissiveIntensity: 1 }), box(0.5, 0.04, 0.06, 0.01), { y: 0.92, z: 0.1, ry: 0.3 });
  k.flame(flameMat(0xff7a26), fireGeo(0.3, 0.45, k.rng, 6), 0.9, -0.12);
};

const smeltingVat: Builder = (k, c) => {
  const iron = black();
  // A riveted iron crucible on legs, brimming with metal, a pour spout.
  const vat = lathe([[0.0001, 0.3], [0.55, 0.32], [0.72, 0.6], [0.78, 1.15], [0.82, 1.22], [0.74, 1.24], [0.68, 1.2]], 14);
  jag(vat, k.rng, 0.01, 6);
  mottle(vat, k.rng, 0.5, 3);
  k.add(iron, vat, undefined, 0.8);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.add(iron, box(0.1, 0.45, 0.1, 0.02), { x: Math.cos(a) * 0.5, z: Math.sin(a) * 0.5, rz: Math.cos(a) * 0.15, rx: -Math.sin(a) * 0.15 }, 0.75);
  }
  for (const y of [0.7, 1.05]) k.add(rust(), torus(0.76, 0.025, 4, 24).rotateX(Math.PI / 2), { y }, 0.8);
  k.add(molten(), cyl(0.68, 0.68, 0.02, 18), { y: 1.14 });
  k.add(iron, cyl(0.08, 0.12, 0.35, 6).rotateZ(-Math.PI / 2 - 0.3), { x: 0.75, y: 1.18 }, 0.8);
  k.add(propMat('ground.ash'), cyl(0.45, 0.55, 0.12, 10), { y: 0 }, 0.6);
  k.add(molten(), cyl(0.2, 0.3, 0.06, 8), { y: 0.06 });
  k.flame(flameMat(0xff8a30, 0.5), fireGeo(0.4, 0.25, k.rng, 5), 1.15, 0);
};

const pillarIron: Builder = (k, c) => {
  const st = M.stone(c);
  const iron = black();
  const H = Math.max(3.2, c.art.wallHeight);
  const core = box(0.9, H, 0.9, 0.04, 6);
  core.translate(0, H / 2, 0);
  jag(core, k.rng, 0.012, 5);
  k.add(st, weather(core, c, k.rng, 1.2, 1.2));
  // Iron corner angles, bands with rivets, a pipe up one face.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    k.add(iron, box(0.14, H - 0.1, 0.03, 0.006), { x: sx * 0.46, y: 0.05, z: sz * 0.42 }, 0.75);
    k.add(iron, box(0.03, H - 0.1, 0.14, 0.006), { x: sx * 0.42, y: 0.05, z: sz * 0.46 }, 0.75);
  }
  for (const y of [0.3, H * 0.45, H - 0.4]) {
    k.box(iron, 1.0, 0.14, 1.0, { y }, 0.7, 0.01);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      for (const o of [-0.3, 0, 0.3]) k.add(iron, sphere(0.02, 5, 3), { x: Math.cos(a) * 0.5 - Math.sin(a) * o, y: y + 0.07, z: Math.sin(a) * 0.5 + Math.cos(a) * o }, 0.8);
    }
  }
  k.add(c.variant ? rust() : iron, cyl(0.07, 0.07, H, 8), { x: 0.2, z: 0.54 }, 0.8);
};

export const WORKS: Record<string, Builder> = {
  anvil,
  pipeCluster,
  pipeRun,
  valveWheel,
  gear,
  ingotStack,
  forge,
  smeltingVat,
  pillarIron,
};

void shadeY;
void (null as unknown as BuildCtx);
