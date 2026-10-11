/**
 * SLAY — things you open, search, pray at, pull or smash: chests by tier,
 * barrels, crates, urns, bookcases, shrines, levers and gold hoards.
 *
 * Builders that change when used read `c.state`: 'open' (chests: lid thrown
 * back), 'spent' (shrines: the light gone out), 'pulled' (levers: handle
 * down). `Remains.ts` asks for those versions when an interactable is used.
 */
import * as THREE from 'three';
import { PropKit, WALL_FACE, box, cone, cyl, disc, jag, lathe, merge, mottle, plank, rock, shade, shadeY, skull, sphere, torus } from './Kit';
import { type BuildCtx, type Builder, M } from './Ctx';
import { glowMat, propMat } from './PropMats';
import { weather } from './Stone';

const W = WALL_FACE;

// ---------------------------------------------------------------------------
// Chests
// ---------------------------------------------------------------------------

interface ChestStyle {
  w: number;
  d: number;
  h: number;
  /** Lid rise: 0 flat, >0 domed. */
  dome: number;
  wood: THREE.Material;
  band: THREE.Material;
  trim: THREE.Material | null;
  bands: number;
}

/** Body, bands, feet, lock; the lid hinged at the back (-Z), open when `c.state === 'open'`. */
function chestBody(k: PropKit, c: BuildCtx, s: ChestStyle, y0 = 0): void {
  const { w, d, h } = s;
  // Boards of the body: front/back planks, ends, bottom.
  for (let i = 0; i < 3; i++) {
    const y = y0 + 0.04 + (i + 0.5) * (h / 3);
    for (const z of [-1, 1]) k.plank(s.wood, w, h / 3 - 0.006, 0.04, { y, z: z * (d / 2 - 0.02), rx: Math.PI / 2 }, k.rng.range(0.72, 0.95), 0.3);
  }
  for (const x of [-1, 1]) k.box(s.wood, 0.045, h, d - 0.02, { x: x * (w / 2 - 0.02), y: y0 + 0.04 }, 0.8, 0.008);
  k.box(s.wood, w - 0.04, 0.04, d - 0.04, { y: y0 + 0.04 }, 0.6, 0.006);
  // Hollow: dark inside, read when the lid is open.
  k.add(s.wood, box(w - 0.1, 0.01, d - 0.1, 0.002), { y: y0 + h - 0.06 }, 0.12);
  // Iron feet, corner straps, bands.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    k.box(s.band, 0.08, 0.06, 0.08, { x: sx * (w / 2 - 0.03), y: y0, z: sz * (d / 2 - 0.03) }, 0.75, 0.01);
    k.box(s.band, 0.035, h + 0.01, 0.035, { x: sx * (w / 2 + 0.001), y: y0 + 0.04, z: sz * (d / 2 + 0.001) }, 0.8, 0.006);
  }
  for (let i = 0; i < s.bands; i++) {
    const x = -w / 2 + ((i + 1) / (s.bands + 1)) * w;
    k.box(s.band, 0.05, h + 0.012, d + 0.012, { x, y: y0 + 0.035 }, 0.8, 0.006);
  }
  // Lock plate and hasp on the front.
  k.box(s.trim ?? s.band, 0.13, 0.15, 0.025, { y: y0 + h - 0.12, z: d / 2 + 0.012 }, 0.85, 0.008);
  k.add(s.band, box(0.025, 0.05, 0.01, 0.003), { y: y0 + h - 0.06, z: d / 2 + 0.03 }, 0.3);
  // Handles on the ends.
  for (const x of [-1, 1]) k.add(s.band, torus(0.06, 0.012, 4, 10, Math.PI), { x: x * (w / 2 + 0.03), y: y0 + h * 0.62, ry: Math.PI / 2, rz: Math.PI }, 0.8);
  // The lid.
  const lid = new PropKit(k.rng);
  const lidH = 0.07 + s.dome;
  if (s.dome > 0) {
    const g = new THREE.CylinderGeometry(d / 2, d / 2, w, 12, 1, false, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    g.scale(1, s.dome / (d / 2), 1);
    jag(g, k.rng, 0.004, 10);
    lid.add(s.wood, g, { y: 0.07 }, 0.85);
    for (let i = 0; i < s.bands; i++) {
      const x = -w / 2 + ((i + 1) / (s.bands + 1)) * w;
      const bg = new THREE.CylinderGeometry(d / 2 + 0.008, d / 2 + 0.008, 0.05, 12, 1, true, 0, Math.PI);
      bg.rotateZ(Math.PI / 2);
      bg.scale(1, (s.dome + 0.008) / (d / 2 + 0.008), 1);
      lid.add(s.band, bg, { x, y: 0.07 }, 0.8);
    }
  }
  lid.add(s.wood, box(w + 0.02, 0.07, d + 0.02, 0.012), { y: 0.035 }, 0.82);
  lid.add(s.band, box(w + 0.03, 0.03, 0.04, 0.006), { y: 0.02, z: d / 2 - 0.005 }, 0.8);
  if (s.trim) for (const sx of [-1, 1]) lid.add(s.trim, box(0.08, 0.075, d + 0.03, 0.01), { x: sx * (w / 2 - 0.03), y: 0.035 }, 0.9);
  const out = lid.done();
  const open = c.state === 'open';
  const hinge = new THREE.Matrix4().makeTranslation(0, y0 + 0.04 + h, -d / 2);
  if (open) hinge.multiply(new THREE.Matrix4().makeRotationX(-1.9));
  hinge.multiply(new THREE.Matrix4().makeTranslation(0, 0, d / 2));
  for (const l of out.layers) {
    l.geometry.applyMatrix4(hinge);
    k.add(l.material, l.geometry);
  }
  void lidH;
  if (open) {
    // Spilled straw and a few coins inside.
    k.add(s.wood, box(w - 0.14, 0.02, d - 0.14, 0.01), { y: y0 + h - 0.08 }, [0.8, 0.7, 0.45]);
  }
}

const chest: Builder = (k, c) => {
  const v = c.variant;
  chestBody(k, c, {
    w: 0.86,
    d: 0.52,
    h: 0.42,
    dome: v === 1 ? 0.14 : 0,
    wood: propMat('prop.timber'),
    band: propMat('prop.iron'),
    trim: null,
    bands: v === 2 ? 3 : 2,
  });
};

const chestRare: Builder = (k, c) => {
  chestBody(k, c, {
    w: 0.96,
    d: 0.58,
    h: 0.46,
    dome: 0.17,
    wood: propMat('prop.timber.dark'),
    band: propMat('prop.iron.black'),
    trim: M.fine(c),
    bands: 3,
  });
  // Studs along the bands.
  const studs = M.fine(c);
  for (let i = 0; i < 3; i++) {
    const x = -0.48 + ((i + 1) / 4) * 0.96;
    for (const y of [0.15, 0.3, 0.45]) k.add(studs, sphere(0.014, 5, 3), { x, y, z: 0.3 }, 0.9);
  }
};

const chestVault: Builder = (k, c) => {
  const st = M.stone(c);
  // A stone dais, the chest on it, gilded and chained.
  const dais = box(1.2, 0.16, 0.85, 0.03, 2);
  jag(dais, k.rng, 0.01, 6);
  k.add(st, weather(dais.translate(0, 0.08, 0), c, k.rng, 1, 0.3));
  chestBody(k, c, {
    w: 1.0,
    d: 0.62,
    h: 0.5,
    dome: 0.2,
    wood: propMat('prop.timber.dark'),
    band: propMat('prop.gold'),
    trim: propMat('prop.gold'),
    bands: 3,
  }, 0.16);
  // A jewel on the lock.
  if (c.state !== 'open') k.add(glowMat(0xffc860, 1.8), sphere(0.03, 8, 6), { y: 0.16 + 0.5 - 0.1, z: 0.35 });
  else k.add(propMat('prop.gold'), merge(Array.from({ length: 14 }, () => cyl(0.025, 0.025, 0.008, 8).rotateX(k.rng.range(-0.4, 0.4)).translate(k.rng.range(-0.35, 0.35), k.rng.range(0, 0.04), k.rng.range(-0.2, 0.2)))), { y: 0.62 }, 1);
};

// ---------------------------------------------------------------------------
// Breakables
// ---------------------------------------------------------------------------

/** Staves round a bulging profile, hoops, a lid. `stave` returns each stave's geometry for break pieces. */
export function barrelGeo(k: PropKit, c: BuildCtx, h = 0.86, r = 0.29): void {
  const wood = M.wood(c);
  const iron = M.iron(c);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const g = new THREE.BoxGeometry(2 * r * Math.sin(Math.PI / n) * 1.04, h, 0.035, 1, 6, 1);
    g.translate(0, h / 2, 0);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let j = 0; j < p.count; j++) {
      const t = p.getY(j) / h;
      const bulge = 1 + 0.16 * Math.sin(t * Math.PI);
      p.setZ(j, (p.getZ(j) + r) * bulge * 0.86);
      p.setX(j, p.getX(j) * bulge);
    }
    g.computeVertexNormals();
    g.rotateY(a);
    k.add(wood, g, undefined, k.rng.range(0.7, 1.0));
  }
  for (const t of [0.12, 0.35, 0.65, 0.88]) {
    const rr = r * 0.86 * (1 + 0.16 * Math.sin(t * Math.PI)) + 0.012;
    k.add(iron, cyl(rr, rr, 0.04, 16, true), { y: t * h - 0.02 }, 0.8);
  }
  k.add(wood, cyl(r * 0.84, r * 0.84, 0.03, 14), { y: h - 0.05 }, 0.75);
}

const barrel: Builder = (k, c) => {
  barrelGeo(k, c);
  if (c.variant === 1) k.add(propMat('cloth.undyed', { base: 0x6a5a40 }), sphere(0.2, 8, 5).scale(1, 0.4, 1), { y: 0.86 }, 0.85);
  if (c.variant === 2) k.add(propMat('ground.mud', { base: 0x2a1a10, rough: 0.3 }), disc(0.38, 12, 0.006), undefined, 0.8);
};

export function crateGeo(k: PropKit, c: BuildCtx, s = 0.7): void {
  const wood = M.planks(c);
  const frame = M.wood(c);
  // Slatted sides, a frame of battens on every edge, a diagonal brace.
  const slats = 4;
  const sw = s / slats;
  for (let f = 0; f < 4; f++) {
    const ry = (f / 4) * Math.PI * 2;
    for (let i = 0; i < slats; i++) {
      const y = (i + 0.5) * sw;
      const z = s / 2 - 0.015;
      const g = plank(s - 0.04, sw - 0.012, 0.03, k.rng, 0.4);
      g.translate(0, y, z);
      g.rotateY(ry);
      k.add(wood, g, undefined, k.rng.range(0.72, 1.0));
    }
    const brace = plank(Math.hypot(s, s) * 0.88, 0.07, 0.03, k.rng, 0.3);
    brace.rotateZ(Math.PI / 4 * (f % 2 ? 1 : -1));
    brace.translate(0, s / 2, s / 2 + 0.01);
    brace.rotateY(ry);
    k.add(frame, brace, undefined, 0.8);
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box(frame, 0.07, s, 0.07, { x: x * (s / 2 - 0.02), z: z * (s / 2 - 0.02) }, 0.75, 0.01);
  for (const y of [0, s - 0.06]) {
    for (const z of [-1, 1]) k.box(frame, s, 0.06, 0.07, { y, z: z * (s / 2 - 0.02) }, 0.75, 0.01);
    for (const x of [-1, 1]) k.box(frame, 0.07, 0.06, s, { y, x: x * (s / 2 - 0.02) }, 0.75, 0.01);
  }
  for (let i = 0; i < slats; i++) k.plank(wood, s - 0.04, sw - 0.012, 0.03, { y: s - 0.015, z: -s / 2 + (i + 0.5) * sw }, k.rng.range(0.72, 1.0), 0.4);
}

const crate: Builder = (k, c) => {
  const v = c.variant;
  crateGeo(k, c, v === 2 ? 0.62 : 0.72);
  if (v === 1) {
    // A small crate on top.
    const top = new PropKit(k.rng);
    crateGeo(top, c, 0.4);
    for (const l of top.done().layers) {
      l.geometry.applyMatrix4(new THREE.Matrix4().makeRotationY(0.5).setPosition(0.08, 0.72, -0.04));
      k.add(l.material, l.geometry);
    }
  }
};

const urn: Builder = (k, c) => {
  const v = c.variant;
  const clay = propMat('stone.brick', { base: c.biome === 'desert' || c.biome === 'desertTomb' ? 0x8a6448 : 0x6a5040, rough: 0.9 });
  const profiles: Array<Array<[number, number]>> = [
    [[0.0001, 0], [0.12, 0], [0.2, 0.12], [0.22, 0.28], [0.14, 0.46], [0.09, 0.5], [0.11, 0.56], [0.09, 0.57], [0.07, 0.52]],
    [[0.0001, 0], [0.1, 0], [0.13, 0.08], [0.17, 0.35], [0.12, 0.62], [0.06, 0.7], [0.08, 0.78], [0.065, 0.78]],
    [[0.0001, 0], [0.16, 0], [0.24, 0.1], [0.25, 0.22], [0.18, 0.32], [0.17, 0.36], [0.15, 0.36]],
    [[0.0001, 0], [0.12, 0], [0.19, 0.15], [0.2, 0.3], [0.15, 0.42], [0.12, 0.44], [0.0001, 0.48]],
  ];
  const g = lathe(profiles[v % 4]!, 14);
  jag(g, k.rng, 0.006, 10);
  mottle(g, k.rng, 0.5, 5);
  // Painted bands, faded.
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (Math.abs(y - 0.24) < 0.025 || Math.abs(y - 0.3) < 0.012) col.setXYZ(i, col.getX(i) * 0.4, col.getY(i) * 0.35, col.getZ(i) * 0.3);
  }
  k.add(clay, shadeY(g, 0, 0.3, 0.6));
  if (v === 3) k.add(clay, sphere(0.035, 6, 4), { y: 0.49 }, 0.8);
};

// ---------------------------------------------------------------------------
// Bookcase, shrine, lever, hoard
// ---------------------------------------------------------------------------

const bookcase: Builder = (k, c) => {
  const wood = M.wood(c);
  const back = -0.27;
  const D = 0.42;
  const Wd = 1.2;
  const H = 2.05;
  const zc = back + D / 2;
  for (const s of [-1, 1]) k.box(wood, 0.06, H, D, { x: s * (Wd / 2 - 0.03), z: zc }, 0.8, 0.012);
  k.box(wood, Wd, 0.08, D + 0.04, { y: H - 0.08, z: zc }, 0.8, 0.012);
  k.box(wood, Wd - 0.1, H - 0.1, 0.02, { y: 0.02, z: back + 0.01 }, 0.45, 0.004);
  const shelves = [0.08, 0.55, 1.02, 1.49];
  // One material for every book; the colour of each spine is baked in.
  const books = propMat('leather.worn', { base: 0x8a7a68, grime: 0.2 });
  const spines = [0x9a4a3a, 0x4a5a7a, 0x5a6a3a, 0x8a6a40, 0x6a3a5a, 0x7a7a6a];
  for (const y of shelves) {
    k.box(wood, Wd - 0.08, 0.04, D - 0.02, { y, z: zc }, 0.75, 0.008);
    let x = -Wd / 2 + 0.08;
    const gap = k.rng.int(0, 6);
    let i = 0;
    while (x < Wd / 2 - 0.12) {
      const bw = k.rng.range(0.035, 0.07);
      const bh = k.rng.range(0.24, 0.38);
      if (i === gap || (c.variant === 2 && k.rng.chance(0.3))) {
        x += bw * 2;
        i++;
        continue;
      }
      const lean = i === gap + 1 ? -0.3 : k.rng.range(-0.04, 0.04);
      k.add(books, shade(box(bw, bh, k.rng.range(0.2, 0.26), 0.006), spines[k.rng.int(0, spines.length - 1)]!), { x: x + bw / 2, y: y + 0.04 + bh / 2 * Math.cos(lean), z: zc + 0.04, rz: lean }, k.rng.range(0.6, 1.1));
      x += bw + 0.004;
      i++;
    }
  }
  if (c.variant === 1) {
    k.add(M.bone(c), skull(k.rng, 0.95), { x: 0.3, y: 1.6, z: zc + 0.04, ry: -0.3 }, 0.85);
  }
};

const shrine: Builder = (k, c) => {
  const st = M.stone(c);
  const v = c.variant;
  const lit = c.state !== 'spent';
  const glow = 0x9fd8ff;
  // A stepped dais, then one of three forms: a basin, a stele, an orb on a column.
  const y0 = (() => {
    let y = 0;
    for (let i = 0; i < 2; i++) {
      const s = 1.15 - i * 0.25;
      const g = new THREE.CylinderGeometry(s / 2, s / 2 + 0.03, 0.14, 10);
      jag(g, k.rng, 0.01, 6);
      k.add(st, weather(g.translate(0, y + 0.07, 0), c, k.rng, 1, 0.3));
      y += 0.14;
    }
    return y;
  })();
  if (v === 0) {
    const basin = lathe([[0.12, 0], [0.1, 0.5], [0.16, 0.6], [0.36, 0.72], [0.4, 0.84], [0.34, 0.86], [0.3, 0.78], [0.0001, 0.76]], 12);
    jag(basin, k.rng, 0.012, 7);
    k.add(st, weather(basin, c, k.rng), { y: y0 });
    k.add(lit ? glowMat(glow, 1.6) : propMat('ground.mud', { base: 0x1a1a1a, rough: 0.2 }), disc(0.31, 14, 0), { y: y0 + 0.8 });
  } else if (v === 1) {
    const stele = box(0.62, 1.5, 0.22, 0.04, 3);
    jag(stele, k.rng, 0.02, 4);
    k.add(st, weather(stele.translate(0, 0.75, 0), c, k.rng), { y: y0 });
    k.add(st, cone(0.42, 0.25, 4), { y: y0 + 1.5, ry: Math.PI / 4, sz: 0.5 }, 0.9);
    const rune = lit ? glowMat(glow, 1.8) : propMat('stone.void');
    k.add(rune, torus(0.16, 0.022, 3, 18), { y: y0 + 1.05, z: 0.115 });
    k.add(rune, box(0.035, 0.5, 0.02, 0.005), { y: y0 + 0.62, z: 0.115 });
    for (const s of [-1, 1]) k.add(rune, box(0.02, 0.2, 0.02, 0.005), { x: s * 0.1, y: y0 + 0.75, z: 0.115, rz: s * 0.5 });
  } else {
    const col = lathe([[0.2, 0], [0.14, 0.1], [0.1, 0.2], [0.09, 0.9], [0.14, 1.0], [0.2, 1.08], [0.0001, 1.08]], 10);
    jag(col, k.rng, 0.01, 7);
    k.add(st, weather(col, c, k.rng), { y: y0 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      k.add(M.fine(c), cone(0.025, 0.28, 4), { x: Math.cos(a) * 0.15, y: y0 + 1.06, z: Math.sin(a) * 0.15, rz: Math.cos(a) * 0.3, rx: -Math.sin(a) * 0.3 }, 0.85);
    }
    if (lit) k.add(glowMat(glow, 2.2), sphere(0.15, 12, 10), { y: y0 + 1.28 });
    else k.add(propMat('stone.obsidian'), sphere(0.15, 12, 10), { y: y0 + 1.28 }, 0.7);
  }
};

const lever: Builder = (k, c) => {
  const iron = M.iron(c);
  // A plate with a slot, the handle up (or pulled down).
  k.box(iron, 0.26, 0.5, 0.05, { y: 1.05, z: W + 0.025 }, 0.75, 0.012);
  for (const [x, y] of [[-0.1, 1.1], [0.1, 1.1], [-0.1, 1.5], [0.1, 1.5]]) k.add(iron, sphere(0.018, 5, 3), { x, y, z: W + 0.06 }, 0.8);
  k.add(propMat('metal.dark'), box(0.05, 0.36, 0.01, 0.003), { y: 1.3, z: W + 0.052 }, 0.4);
  const down = c.state === 'pulled';
  const a = down ? 2.4 : 0.6;
  k.add(iron, cyl(0.028, 0.028, 0.5, 6).translate(0, 0, 0).rotateX(a), { y: 1.3, z: W + 0.06 }, 0.85);
  k.add(M.wood(c), sphere(0.055, 8, 6).scale(1, 1.3, 1), { y: 1.3 + Math.cos(a) * 0.5, z: W + 0.06 + Math.sin(a) * 0.5 }, 0.85);
};

const goldHoard: Builder = (k, c) => {
  const gold = propMat('prop.gold');
  // A heap of coin, goblets and plate tipped into it.
  const mound = lathe([[0.0001, 0.42], [0.25, 0.36], [0.5, 0.16], [0.68, 0], [0.0001, 0]], 16);
  jag(mound, k.rng, 0.05, 5);
  jag(mound, k.rng, 0.02, 14);
  mottle(mound, k.rng, 0.6, 8);
  k.add(gold, mound, undefined, 0.8);
  const coins: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 60; i++) {
    const a = k.rng.range(0, Math.PI * 2);
    const d = k.rng.range(0, 0.7);
    const y = Math.max(0, 0.42 * (1 - d / 0.68) * (d < 0.25 ? 1 : 1.05)) + 0.01;
    coins.push(cyl(0.03, 0.03, 0.008, 8).rotateX(k.rng.range(-0.8, 0.8)).rotateZ(k.rng.range(-0.8, 0.8)).translate(Math.cos(a) * d, d > 0.68 ? 0.005 : y, Math.sin(a) * d));
  }
  k.add(gold, merge(coins), undefined, 1.05);
  k.add(gold, lathe([[0.04, 0], [0.015, 0.03], [0.012, 0.12], [0.05, 0.16], [0.07, 0.26], [0.06, 0.26], [0.0001, 0.18]], 10), { x: 0.2, y: 0.28, z: 0.15, rz: 0.4 }, 0.9);
  k.add(gold, cyl(0.16, 0.16, 0.02, 14), { x: -0.25, y: 0.3, z: 0.05, rx: 0.9, ry: 0.4 }, 0.85);
  if (c.variant === 1) {
    const g = glowMat(0x9a1010, 1.4);
    for (let i = 0; i < 4; i++) k.add(g, new THREE.OctahedronGeometry(0.03, 0), { x: k.rng.range(-0.4, 0.4), y: 0.25, z: k.rng.range(-0.4, 0.4) });
    k.add(M.bone(c), skull(k.rng, 1), { x: 0.4, y: 0.12, z: -0.25, ry: 0.7 }, 0.85);
  }
};

export const CONTAINERS: Record<string, Builder> = {
  chest,
  chestRare,
  chestVault,
  barrel,
  crate,
  urn,
  bookcase,
  shrine,
  lever,
  goldHoard,
};

void rock;
void shade;
