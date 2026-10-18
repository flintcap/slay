/**
 * SLAY — the small things: amulets, rings, charms, gems, runes, potions and
 * crafting materials.
 *
 * Every piece faces +Z with up toward +Y, centred near the origin. Each base
 * has its own build: an Amulet is a bronze medallion, a Reliquary a gold
 * locket with a glowing cross, a Signet a ring with a flat crest. Gems take
 * their cut from the family and their finish from the quality (a Chipped
 * stone is broken and dull, a Divine one wears a halo). Each of the 33 runes
 * has its own glyph and its tier sets the stone. Potions differ by bottle,
 * and every material has its own container or form.
 */
import * as THREE from 'three';
import type { Parts, Slot } from './Parts';
import { box, chain, clean, cone, curve, cyl, flat, gem, horn, jitter, lathe, slab, smoothOutline, sphere, spike, torus, tube, v3, xf, type V3 } from './Geo';
import { arc2, aim, circle2, dressGems, setGem, skull, sphereDirs, type V2 } from './Kit';
import { hashString } from '../GearLook';
import { RUNES } from '../../data/gems';

const PI = Math.PI;
const FRONT = v3(0, 0, 1);

/** The part of the cut after the family: 'gem.ruby.flawed' gives ['ruby', 'flawed']. */
function idParts(P: Parts, family: string): string[] {
  const L = P.look;
  const src = L.cut.startsWith(`${family}.`) ? L.cut : L.silhouette.startsWith(`${family}.`) ? L.silhouette : `${family}.`;
  return src.split('.').slice(1);
}

/** Moves vertices toward or away from the centre by position-keyed noise: broken stone, ore. */
function chip(geo: THREE.BufferGeometry, amt: number, seed: number): THREE.BufferGeometry {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = (Math.round(x * 900) * 73856093) ^ (Math.round(y * 900) * 19349663) ^ (Math.round(z * 900) * 83492791);
    const k = 1 + amt * jitter(key & 0xffff, seed + (key >>> 16));
    pos.setXYZ(i, x * k, y * k, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

/** A closed tube along an outline in the XY plane at depth z. */
function rim(outline: V2[], z: number, r: number, sides = 6): THREE.BufferGeometry {
  const pts = outline.map(([x, y]) => v3(x, y, z));
  pts.push(pts[0]!.clone());
  if (pts.length > 2) pts.push(pts[1]!.clone());
  return tube(pts, r, sides, { capA: false, capB: false });
}

/** A four-point twinkle in front of a stone. */
function sparkle(P: Parts, p: V3, s: number): void {
  P.add('glow', box(s, s * 0.08, s * 0.04, 0), { p: [p.x, p.y, p.z] });
  P.add('glow', box(s * 0.08, s, s * 0.04, 0), { p: [p.x, p.y, p.z] });
  P.add('glow', box(s * 0.5, s * 0.06, s * 0.03, 0), { p: [p.x, p.y, p.z], r: [0, 0, PI / 4] });
  P.add('glow', box(s * 0.5, s * 0.06, s * 0.03, 0), { p: [p.x, p.y, p.z], r: [0, 0, -PI / 4] });
}

function frontAnchors(P: Parts, c: V3, r: number): void {
  P.anchors.head = { p: c.clone(), r };
  P.anchors.axis = { a: c.clone().add(v3(0, -r, 0)), b: c.clone().add(v3(0, r, 0)), r: r * 0.5 };
  P.anchors.face = { p: c.clone().add(v3(0, 0, r * 0.4)), n: FRONT.clone(), s: r * 0.5 };
  for (const d of sphereDirs(8)) P.point(c.clone().addScaledVector(d, r * 0.8), d, r * 0.15);
}

// ===========================================================================
// GEMS
// ===========================================================================

const QUALITIES = ['chipped', 'flawed', 'normal', 'flawless', 'perfect', 'divine'];

/** The family's stone, table up (+Y). `upright` stones stand as they are; the rest turn to face +Z. */
function gemStone(fam: string, s: number): { geos: Array<{ slot: Slot; g: THREE.BufferGeometry }>; upright: boolean } {
  const one = (g: THREE.BufferGeometry, slot: Slot = 'gem') => ({ geos: [{ slot, g }], upright: false });
  switch (fam) {
    case 'ruby':
      return one(gem(s, 'pear'));
    case 'sapphire':
      return one(gem(s, 'oval'));
    case 'topaz':
      return one(gem(s * 1.1, 'marquise'));
    case 'emerald': {
      // Step cut: an oblong with clipped corners and stepped crown rings.
      const g = lathe([[0, -s * 0.3], [s * 0.3, -s * 0.2], [s * 0.46, -s * 0.06], [s * 0.5, 0], [s * 0.5, s * 0.06], [s * 0.44, s * 0.13], [s * 0.36, s * 0.19], [s * 0.3, s * 0.22], [0, s * 0.22]], 8, { smooth: false, phase: PI / 8 });
      g.scale(0.9, 1, 1.4);
      return one(g);
    }
    case 'diamond': {
      // Brilliant: eight broad facets so the crown catches light in planes.
      const g = lathe([[0, -s * 0.55], [s * 0.24, -s * 0.3], [s * 0.5, 0], [s * 0.5, s * 0.04], [s * 0.4, s * 0.16], [s * 0.27, s * 0.27], [0, s * 0.27]], 8, { smooth: false, phase: PI / 8 });
      return one(g);
    }
    case 'amethyst': {
      // A cluster of points rising from a dark rock.
      const out: Array<{ slot: Slot; g: THREE.BufferGeometry }> = [];
      const rock = chip(sphere(s * 0.45, 9, 6), 0.25, 11);
      rock.scale(1.3, 0.5, 1);
      out.push({ slot: 'obsidian', g: rock });
      const pts: Array<[number, number, number, number]> = [[0, 0, 0, 1], [-0.28, 0.05, -0.45, 0.7], [0.3, -0.05, 0.5, 0.75], [0.12, 0.2, -0.2, 0.55], [-0.15, -0.2, 0.35, 0.5]];
      for (const [x, z, tilt, k] of pts) {
        const sh = lathe([[0, 0], [s * 0.16 * k, s * 0.05], [s * 0.16 * k, s * 0.7 * k], [0, s * 0.95 * k]], 6, { smooth: false });
        out.push({ slot: 'gem', g: xf(sh, { p: [x * s, s * 0.05, z * s], r: [z * 0.8, 0, -tilt] }) });
      }
      return { geos: out, upright: true };
    }
    case 'onyx': {
      const g = gem(s, 'cabochon');
      g.scale(0.85, 1, 1.25);
      const band = torus(s * 0.47, s * 0.045, 4, 20);
      band.rotateX(PI / 2);
      band.scale(0.85, 1, 1.25);
      band.translate(0, s * 0.02, 0);
      const band2 = torus(s * 0.32, s * 0.035, 4, 18);
      band2.rotateX(PI / 2);
      band2.scale(0.85, 1, 1.25);
      band2.translate(0, s * 0.21, 0);
      return { geos: [{ slot: 'gem', g }, { slot: 'bone', g: band }, { slot: 'bone', g: band2 }], upright: false };
    }
    case 'opal': {
      const g = gem(s * 1.05, 'cabochon');
      g.scale(1, 1.3, 1.3);
      const out: Array<{ slot: Slot; g: THREE.BufferGeometry }> = [{ slot: 'gem', g }];
      const flecks: Array<[number, number]> = [[0.15, 0.1], [-0.2, 0.05], [0.05, -0.25], [-0.1, 0.28], [0.28, -0.12], [-0.3, -0.18]];
      for (const [x, z] of flecks) {
        const f = new THREE.OctahedronGeometry(s * 0.07, 0);
        out.push({ slot: 'crystal', g: xf(flat(clean(f)), { p: [x * s, s * 0.3 * 1.3 - Math.hypot(x, z) * s * 0.5, z * s] }) });
      }
      return { geos: out, upright: false };
    }
    case 'garnet': {
      const g = flat(clean(new THREE.DodecahedronGeometry(s * 0.48, 0)));
      return one(g);
    }
    case 'citrine': {
      const g = lathe([[0, -s * 0.62], [s * 0.3, -s * 0.36], [s * 0.3, s * 0.36], [0, s * 0.66]], 6, { smooth: false });
      g.rotateZ(0.35);
      return { geos: [{ slot: 'gem', g }], upright: true };
    }
    default:
      return one(gem(s, 'round'));
  }
}

export function buildGem(P: Parts): void {
  const [fam = 'ruby', quality = 'normal'] = idParts(P, 'gem');
  let q = QUALITIES.indexOf(quality);
  if (q < 0) q = 2;
  const s = 0.058 + q * 0.009;
  const seed = hashString(P.look.cut) & 0xffff;
  if (fam === 'skull') {
    // A carved stone skull: chipped ones lose the jaw line, divine ones grow a crest.
    skull(P, 'gem', v3(0, 0, 0), s * 1.25);
    if (q >= 4) for (let i = 0; i < 5; i++) P.add('gem', spike(s * 0.25, s * 0.05, 4), { p: [(i - 2) * s * 0.12, s * 0.62, -s * 0.05], r: [-0.2, 0, (i - 2) * -0.25] });
  } else {
    const { geos, upright } = gemStone(fam, s);
    for (const { slot, g } of geos) {
      if (slot === 'gem' && q === 0) {
        chip(g, 0.28, seed);
        g.scale(1, 0.75, 0.85);
      }
      if (slot === 'gem' && q === 1) chip(g, 0.09, seed);
      P.add(slot, g, upright ? undefined : { r: [PI / 2, 0, 0] });
    }
  }
  // Flaws: dark cracks across the face.
  if (q === 1) {
    P.add('dark', box(s * 0.7, s * 0.03, s * 0.02, 0), { p: [0, s * 0.05, s * 0.24], r: [0, 0, 0.5] });
    P.add('dark', box(s * 0.35, s * 0.025, s * 0.02, 0), { p: [s * 0.12, -s * 0.08, s * 0.23], r: [0, 0, -0.7] });
  }
  if (q >= 3) sparkle(P, v3(s * 0.22, s * 0.22, s * 0.32), s * (0.3 + (q - 3) * 0.12));
  if (q >= 4) sparkle(P, v3(-s * 0.25, -s * 0.15, s * 0.3), s * 0.25);
  if (q >= 5) {
    P.add('glow', torus(s * 0.85, s * 0.02, 4, 32), { p: [0, 0, -s * 0.25] });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * PI * 2 + 0.3;
      P.add('glow', sphere(s * 0.045, 6, 4), { p: [Math.cos(a) * s * 0.85, Math.sin(a) * s * 0.85, -s * 0.25] });
    }
  }
  frontAnchors(P, v3(), s * 0.5);
}

// ===========================================================================
// RUNES
// ===========================================================================

/** Strokes a glyph can use, in a box from -1..1 on both axes. The stem is always there. */
const STROKES: Array<[V2, V2] | 'loop'> = [
  [[0, 1], [0.75, 0.45]],
  [[0, 1], [-0.75, 0.45]],
  [[0, 0.05], [0.75, 0.55]],
  [[0, 0.05], [-0.75, 0.55]],
  [[0, 0], [0.75, -0.5]],
  [[0, 0], [-0.75, -0.5]],
  [[0, -1], [0.75, -0.55]],
  [[0, -1], [-0.75, -0.55]],
  [[-0.65, 0.35], [0.65, 0.35]],
  [[-0.6, -0.4], [0.6, -0.4]],
  [[0.7, 0.55], [0.7, -0.55]],
  'loop',
];

/**
 * Stroke sets of three strokes, chosen so runes of one tier (one stone shape)
 * share as few strokes as possible: each rune takes the set furthest from the
 * ones its tier already uses, then from all runes so far.
 */
const GLYPHS: number[] = (() => {
  const bits = (m: number) => {
    let c = 0;
    for (let b = 0; b < STROKES.length; b++) if (m & (1 << b)) c++;
    return c;
  };
  const masks: number[] = [];
  for (let m = 0; m < 1 << STROKES.length; m++) if (bits(m) === 3) masks.push(m);
  const out: number[] = [];
  // One glyph per rune, cut by cut: the four veins of a cut share a stone shape.
  const perCut = RUNES.length / 6;
  for (let i = 0; i < RUNES.length; i++) {
    const tier = out.slice(Math.floor(i / perCut) * perCut, i);
    let best = masks[0]!;
    let score = -1;
    for (const m of masks) {
      if (out.includes(m)) continue;
      const near = (list: number[]) => list.reduce((lo, o) => Math.min(lo, bits(m ^ o)), 12);
      const sc = near(tier) * 16 + near(out);
      if (sc > score) {
        score = sc;
        best = m;
      }
    }
    out.push(best);
  }
  return out;
})();

function runeOutline(tier: number, W: number, H: number, idx: number): V2[] {
  switch (tier) {
    case 0:
      return arc2(0, 0, W, H, 0, PI * 2, 28, (t) => 1 + 0.07 * Math.sin(t * PI * 6 + idx)).slice(0, 28);
    case 1: {
      const r = Math.min(W, H) * 0.35;
      return [
        ...arc2(W - r, H - r, r, r, 0, PI / 2, 4),
        ...arc2(-W + r, H - r, r, r, PI / 2, PI, 4),
        ...arc2(-W + r, -H + r, r, r, PI, PI * 1.5, 4),
        ...arc2(W - r, -H + r, r, r, PI * 1.5, PI * 2, 4),
      ];
    }
    case 2:
      return circle2(0, 0, 1, 6).map(([x, y], i) => [x * W * (1.1 + 0.08 * jitter(i, idx)), y * H * (0.95 + 0.08 * jitter(i + 9, idx))] as V2).map(([x, y]) => [y, x] as V2);
    case 3:
      return smoothOutline([[-W, H], [0, H * 1.05], [W, H], [W * 0.95, 0], [0, -H * 1.15], [-W * 0.95, 0]], 30);
    case 4:
      return [[0, H * 1.2], [W * 1.1, 0], [0, -H * 1.2], [-W * 1.1, 0]];
    default:
      return circle2(0, 0, 1, 8).map(([x, y]) => [x * W * 1.1, y * H * 1.05] as V2);
  }
}

export function buildRune(P: Parts): void {
  const L = P.look;
  let idx = RUNES.findIndex((r) => r.id === L.cut);
  if (idx < 0) idx = hashString(L.cut) % RUNES.length;
  const tier = Math.min(5, (RUNES[idx]?.cut ?? 1) - 1);
  // Alternate runes of a tier stand tall or sit wide, so two that share a
  // stroke still differ at a glance.
  const wide = idx % 2 === 1;
  const W = 0.048 * (1 + 0.1 * jitter(idx, 3)) * (wide ? 1.12 : 0.92);
  const H = 0.062 * (1 + 0.08 * jitter(idx, 4)) * (wide ? 0.92 : 1.06);
  const D = 0.026;
  const outline = runeOutline(tier, W, H, idx);
  const stone: Slot = tier >= 4 ? 'obsidian' : 'main';
  const g = slab(outline, D, { bevel: tier === 0 ? 0.009 : 0.005, curveSegments: 6 });
  if (tier === 0) chip(g, 0.04, idx);
  P.add(stone, g);
  if (tier === 3) P.add('iron', rim(outline, 0, 0.0035));
  if (tier === 5) P.add('gold', rim(outline, 0, 0.004));
  if (tier === 5) for (const [x, y] of circle2(0, 0, 1, 8)) P.add('gold', sphere(0.004, 6, 4), { p: [x * W * 1.1, y * H * 1.05, D * 0.5] });
  // The glyph: a carved groove with light inside.
  const gw = W * 0.62;
  const gh = H * 0.72;
  const z = D * 0.5 + 0.0005;
  const stroke = (a: V2, b: V2) => {
    const ax = a[0] * gw;
    const ay = a[1] * gh;
    const bx = b[0] * gw;
    const by = b[1] * gh;
    const len = Math.hypot(bx - ax, by - ay);
    const ang = Math.atan2(by - ay, bx - ax);
    P.add('dark', box(len + 0.007, 0.0145, 0.002, 0), { p: [(ax + bx) / 2, (ay + by) / 2, z - 0.0006], r: [0, 0, ang] });
    P.add('glow', box(len + 0.003, 0.0078, 0.002, 0), { p: [(ax + bx) / 2, (ay + by) / 2, z + 0.0003], r: [0, 0, ang] });
  };
  stroke([0, -1], [0, 1]);
  const mask = GLYPHS[idx % GLYPHS.length]!;
  STROKES.forEach((st, b) => {
    if (!(mask & (1 << b))) return;
    if (st === 'loop') {
      P.add('dark', torus(gw * 0.32, 0.007, 4, 16), { p: [-gw * 0.45, gh * 0.1, z - 0.0006], s: [1, 1, 0.2] });
      P.add('glow', torus(gw * 0.32, 0.0038, 4, 16), { p: [-gw * 0.45, gh * 0.1, z + 0.0004], s: [1, 1, 0.4] });
    } else stroke(st[0], st[1]);
  });
  // Its place in the tier, as glowing pips down the right-hand edge.
  const place = (idx % 6) + 1;
  for (let i = 0; i < place; i++) P.add('glow', sphere(0.0035, 6, 4), { p: [W * 0.74, gh * (0.55 - i * 0.22), z + 0.001] });
  frontAnchors(P, v3(), Math.max(W, H));
}

// ===========================================================================
// POTIONS
// ===========================================================================

type Stopper = 'cork' | 'cap' | 'gold' | 'crystal' | 'wax' | 'skull' | 'wick' | 'tied';

interface PotionCut {
  body: V2[];
  fill: number;
  stopper: Stopper;
  seg?: number;
  sz?: number;
  opaque?: boolean;
}

/** Minor: a small bulb on a long thin neck. Light: a cone flask. Greater: a shouldered bottle. Super: a big caged bulb. */
const FLASK_S: V2[] = [[0, 0], [0.018, 0.003], [0.028, 0.018], [0.026, 0.034], [0.012, 0.046], [0.008, 0.052], [0.008, 0.085], [0.011, 0.088]];
const FLASK_M: V2[] = [[0, 0], [0.04, 0.002], [0.042, 0.008], [0.016, 0.07], [0.013, 0.104], [0.017, 0.108]];
const FLASK_L: V2[] = [[0, 0], [0.033, 0.002], [0.036, 0.068], [0.03, 0.084], [0.014, 0.098], [0.013, 0.128], [0.017, 0.132]];
const FLASK_XL: V2[] = [[0, 0], [0.04, 0.006], [0.058, 0.044], [0.052, 0.084], [0.02, 0.114], [0.016, 0.146], [0.021, 0.15]];

const POTION_CUTS: Record<string, PotionCut> = {
  'potion.heal.minor': { body: FLASK_S, fill: 0.036, stopper: 'cork' },
  'potion.heal.light': { body: FLASK_M, fill: 0.04, stopper: 'cork' },
  'potion.heal.greater': { body: FLASK_L, fill: 0.075, stopper: 'cork' },
  'potion.heal.super': { body: FLASK_XL, fill: 0.09, stopper: 'wax' },
  'potion.mana.minor': { body: FLASK_S, fill: 0.036, stopper: 'cap' },
  'potion.mana.light': { body: FLASK_M, fill: 0.04, stopper: 'cap' },
  'potion.mana.greater': { body: FLASK_L, fill: 0.075, stopper: 'cap' },
  'potion.mana.super': { body: FLASK_XL, fill: 0.09, stopper: 'cap' },
  'potion.heal.full': { body: [[0, 0], [0.03, 0.003], [0.05, 0.03], [0.05, 0.062], [0.03, 0.086], [0.012, 0.094], [0.012, 0.11], [0.016, 0.113]], fill: 0.075, stopper: 'gold' },
  'potion.rejuv.lesser': { body: [[0, 0], [0.02, 0.002], [0.036, 0.022], [0.036, 0.046], [0.018, 0.066], [0.009, 0.07], [0.009, 0.082], [0.012, 0.085]], fill: 0.05, stopper: 'tied' },
  'potion.rejuv.full': { body: [[0, 0], [0.026, 0.002], [0.047, 0.028], [0.047, 0.06], [0.024, 0.086], [0.011, 0.09], [0.011, 0.106], [0.015, 0.11]], fill: 0.07, stopper: 'crystal' },
  'potion.antidote': { body: [[0, 0], [0.012, 0.002], [0.015, 0.012], [0.015, 0.082], [0.011, 0.092], [0.011, 0.104], [0.014, 0.107]], fill: 0.07, stopper: 'cork' },
  'potion.thawing': { body: [[0, 0], [0.022, 0.002], [0.026, 0.01], [0.026, 0.07], [0.012, 0.084], [0.011, 0.096], [0.014, 0.099]], fill: 0.06, stopper: 'cap', seg: 6 },
  'potion.stamina': { body: [[0, 0], [0.008, 0.002], [0.013, 0.012], [0.013, 0.12], [0.016, 0.124]], fill: 0.095, stopper: 'cork' },
  'potion.oil.fire': { body: [[0, 0], [0.03, 0.003], [0.042, 0.03], [0.036, 0.055], [0.016, 0.066], [0.014, 0.072], [0.02, 0.076]], fill: 0.05, stopper: 'wick', opaque: true },
  'potion.oil.venom': { body: [[0, 0], [0.03, 0.003], [0.04, 0.035], [0.034, 0.064], [0.012, 0.078], [0.011, 0.09], [0.014, 0.093]], fill: 0.06, stopper: 'skull', sz: 0.5 },
};

const POTION_BY_SHAPE: Record<string, string> = {
  'potion.flask': 'potion.heal.light',
  'potion.round': 'potion.rejuv.lesser',
  'potion.vial': 'potion.antidote',
  potion: 'potion.heal.light',
  flask: 'potion.heal.light',
};

/** The radius of a lathe profile at height y. */
function radiusAt(body: V2[], y: number): number {
  for (let i = 1; i < body.length; i++) {
    const [r0, y0] = body[i - 1]!;
    const [r1, y1] = body[i]!;
    if (y >= y0 && y <= y1) return y1 === y0 ? r1 : r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
  }
  return body[body.length - 1]![0];
}

export function buildPotion(P: Parts): void {
  const L = P.look;
  const c = POTION_CUTS[L.cut] ?? POTION_CUTS[POTION_BY_SHAPE[L.silhouette] ?? ''] ?? POTION_CUTS['potion.heal.light']!;
  const seg = c.seg ?? 20;
  const sz = c.sz ?? 1;
  const top = c.body[c.body.length - 1]![1];
  const neckR = c.body[c.body.length - 1]![0];
  P.add(c.opaque ? 'clay' : 'glass', lathe(c.body, seg, { sz, smooth: seg > 8 }));
  if (!c.opaque) {
    const inner: V2[] = c.body.filter(([, y]) => y < c.fill).map(([r, y]) => [r * 0.86, y + 0.003] as V2);
    inner.push([radiusAt(c.body, c.fill) * 0.86, c.fill], [0, c.fill]);
    P.add('liquid', lathe(inner, seg, { sz, smooth: seg > 8 }));
  }
  // Stopper.
  switch (c.stopper) {
    case 'cork':
      P.add('wood', cyl(neckR * 0.95, neckR * 0.8, 0.018, 10), { p: [0, top + 0.004, 0] });
      break;
    case 'cap':
      P.add('iron', lathe([[neckR * 1.15, top - 0.012], [neckR * 1.2, top], [neckR * 1.0, top + 0.008], [0, top + 0.009]], 12));
      P.add('iron', sphere(neckR * 0.45, 8, 6), { p: [0, top + 0.012, 0] });
      break;
    case 'wax':
      P.add('wood', cyl(neckR * 0.95, neckR * 0.8, 0.016, 10), { p: [0, top + 0.002, 0] });
      P.add('blood', lathe([[neckR * 1.3, top - 0.01], [neckR * 1.35, top - 0.002], [neckR * 1.1, top + 0.012], [0, top + 0.014]], 12));
      // An iron cage round the bulb.
      for (const y of [0.012, 0.05, 0.08]) {
        const r = radiusAt(c.body, y) + 0.002;
        P.add('iron', torus(r, 0.0022, 4, 24), { p: [0, y, 0], r: [PI / 2, 0, 0] });
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        const pts = [0.006, 0.03, 0.05, 0.075, 0.1].map((y) => {
          const r = radiusAt(c.body, y) + 0.002;
          return v3(Math.sin(a) * r, y, Math.cos(a) * r);
        });
        P.add('iron', tube(curve(pts, 12), 0.0018, 4));
      }
      break;
    case 'gold':
      P.add('gold', lathe([[neckR * 1.2, top - 0.016], [neckR * 1.4, top - 0.004], [neckR * 1.1, top + 0.01], [neckR * 0.4, top + 0.018], [0, top + 0.03]], 14));
      P.add('gold', torus(0.05, 0.003, 4, 28), { p: [0, 0.046, 0], r: [PI / 2, 0, 0] });
      P.add('gold', torus(0.031, 0.003, 4, 24), { p: [0, 0.004, 0], r: [PI / 2, 0, 0] });
      // A heart on the front.
      P.add('gold', slab(smoothOutline([[0, -0.012], [0.012, 0.002], [0.007, 0.01], [0, 0.005], [-0.007, 0.01], [-0.012, 0.002]], 24), 0.003), { p: [0, 0.048, 0.051] });
      break;
    case 'crystal':
      P.add('crystal', flat(clean(new THREE.OctahedronGeometry(neckR * 1.4, 0))), { p: [0, top + neckR * 1.2, 0], s: [1, 1.5, 1] });
      for (const y of [0.026, 0.06]) P.add('trim', torus(radiusAt(c.body, y) + 0.002, 0.002, 4, 24), { p: [0, y, 0], r: [PI / 2, 0, 0] });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        P.add('trim', torus(0.008, 0.0015, 3, 10), aim(v3(Math.sin(a) * 0.049, 0.043, Math.cos(a) * 0.049), v3(Math.sin(a), 0, Math.cos(a)), 1, 0));
      }
      break;
    case 'tied':
      P.add('wood', cyl(neckR * 0.95, neckR * 0.8, 0.014, 10), { p: [0, top + 0.004, 0] });
      P.add('cloth', sphere(neckR * 1.9, 10, 6), { p: [0, top + 0.01, 0], s: [1, 0.6, 1] });
      P.add('string', torus(neckR * 1.1, 0.0015, 3, 14), { p: [0, top - 0.005, 0], r: [PI / 2, 0, 0] });
      P.add('string', tube(curve([v3(neckR, top - 0.005, 0.004), v3(0.016, top - 0.02, 0.012), v3(0.02, top - 0.035, 0.01)], 8), 0.0012, 3));
      break;
    case 'wick': {
      P.add('string', cyl(0.003, 0.003, 0.016, 5), { p: [0, top + 0.006, 0] });
      const flame = lathe([[0, 0], [0.006, 0.004], [0.004, 0.012], [0, 0.022]], 8);
      P.add('glow', flame, { p: [0, top + 0.014, 0] });
      // Oil running from the lip.
      P.add('liquid', tube(curve([v3(neckR * 1.1, top, 0.004), v3(0.03, top - 0.02, 0.016), v3(0.04, 0.03, 0.02)], 8), (t) => 0.003 * (1 - t * 0.5), 5));
      P.add('string', torus(0.04, 0.002, 3, 20), { p: [0, 0.03, 0], r: [PI / 2, 0, 0] });
      break;
    }
    case 'skull':
      P.add('wood', cyl(neckR * 0.95, neckR * 0.8, 0.012, 10), { p: [0, top + 0.002, 0] });
      skull(P, 'bone', v3(0, top + 0.016, 0), 0.024);
      break;
  }
  // Extras per base.
  switch (L.cut) {
    case 'potion.heal.greater':
    case 'potion.mana.greater':
      P.add('cloth', lathe([[0.0365, 0.028], [0.0375, 0.03], [0.0375, 0.052], [0.0365, 0.054]], 20));
      break;
    case 'potion.antidote':
      P.add('leaf', slab(smoothOutline([[0, 0], [0.012, 0.012], [0.004, 0.034], [-0.008, 0.016]], 20), 0.002), { p: [0.012, top - 0.03, 0.012], r: [0, 0.3, -0.5] });
      P.add('string', torus(neckR * 1.05, 0.0012, 3, 12), { p: [0, top - 0.012, 0], r: [PI / 2, 0, 0] });
      break;
    case 'potion.thawing':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        P.add('crystal', spike(0.016, 0.003, 4), aim(v3(Math.sin(a) * 0.022, 0.075, Math.cos(a) * 0.022), v3(Math.sin(a), 0.7, Math.cos(a))));
      }
      break;
    case 'potion.stamina':
      P.add('leather', lathe([[0.0145, 0.04], [0.0155, 0.042], [0.0155, 0.058], [0.0145, 0.06]], 14));
      P.add('leather', tube(curve([v3(0.015, 0.05, 0), v3(0.03, 0.08, 0.004), v3(0.02, 0.112, 0.002), v3(0.014, 0.112, 0)], 12), 0.0022, 4, { flat: 2 }));
      break;
    case 'potion.mana.super':
      for (const y of [0.012, 0.05, 0.08]) P.add('trim', torus(radiusAt(c.body, y) + 0.002, 0.0022, 4, 24), { p: [0, y, 0], r: [PI / 2, 0, 0] });
      break;
  }
  P.anchors.head = { p: v3(0, top * 0.4, 0), r: 0.04 };
  P.anchors.axis = { a: v3(0, 0, 0), b: v3(0, top, 0), r: 0.03 };
  P.anchors.face = { p: v3(0, top * 0.4, radiusAt(c.body, top * 0.4) * sz), n: FRONT.clone(), s: 0.018 };
  for (const d of sphereDirs(6)) P.point(v3(d.x * 0.03, top * 0.4 + d.y * 0.02, d.z * 0.03), d, 0.008);
}

// ===========================================================================
// AMULETS
// ===========================================================================

/** Two runs of chain from the bail up to a point above, like a hung pendant. */
function necklace(P: Parts, slot: Slot, y: number, span = 0.05, rise = 0.11): void {
  for (const s of [-1, 1]) P.addAll(slot, chain(v3(0, y, 0), v3(s * span, y + rise, -0.005), 9, 0.012));
  P.add(slot, torus(0.007, 0.0018, 4, 12), { p: [0, y - 0.002, 0], r: [0, PI / 2, 0] });
}

export function buildAmulet(P: Parts): void {
  const L = P.look;
  const [kind = 'amulet'] = idParts(P, 'amulet');
  const metal: Slot = L.material === 'crystal' ? 'iron' : 'main';
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  let top = 0.04;
  switch (kind) {
    case 'talisman': {
      // An inverted triangle with a spiral, a fang hanging below.
      const tri: V2[] = smoothOutline([[-0.04, 0.03], [0.04, 0.03], [0.004, -0.04], [-0.004, -0.04]], 24);
      P.add(metal, slab(tri, 0.007));
      P.add('trim', rim(tri, 0.0035, 0.0018));
      const sp: V3[] = [];
      for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        const a = t * PI * 4;
        sp.push(v3(Math.cos(a) * t * 0.016, 0.006 + Math.sin(a) * t * 0.016, 0.0045));
      }
      P.add('glow', tube(sp, 0.0012, 3));
      P.add('bone', horn(0.035, 0.005, 0.5, 6), { p: [0, -0.04, 0], r: [0, 0, PI - 0.25] });
      top = 0.032;
      spots.push({ p: v3(-0.022, 0.018, 0.004), n: FRONT, s: 0.008 }, { p: v3(0.022, 0.018, 0.004), n: FRONT, s: 0.008 });
      break;
    }
    case 'reliquary': {
      // A tall locket with an arched top and a cross-shaped window.
      const out: V2[] = [[-0.024, -0.035], [0.024, -0.035], [0.024, 0.015], ...arc2(0, 0.015, 0.024, 0.022, 0, PI, 10).slice(1, -1), [-0.024, 0.015]];
      P.add(metal, slab(out, 0.014));
      P.add('trim', rim(out, 0.007, 0.002));
      P.add('glow', box(0.006, 0.04, 0.003, 0), { p: [0, -0.004, 0.007] });
      P.add('glow', box(0.026, 0.006, 0.003, 0), { p: [0, 0.006, 0.007] });
      for (const y of [-0.025, 0.012]) P.add('dark', cyl(0.002, 0.002, 0.01, 6), { p: [-0.025, y, 0], r: [0, 0, 0] });
      for (const [x, y] of [[-0.018, -0.03], [0.018, -0.03], [-0.018, 0.02], [0.018, 0.02]] as V2[]) P.add('trim', sphere(0.0025, 6, 4), { p: [x, y, 0.0075] });
      top = 0.04;
      spots.push({ p: v3(0, -0.026, 0.007), n: FRONT, s: 0.008 });
      break;
    }
    case 'sigil': {
      // A void shard in a three-claw cage.
      const shard = flat(clean(new THREE.OctahedronGeometry(0.03, 0)));
      shard.scale(0.6, 1.4, 0.5);
      P.add('main', chip(shard, 0.12, 5));
      P.add('glow', sphere(0.007, 8, 6), { p: [0, 0, 0.008] });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2 + PI / 2;
        const pts = [v3(0, 0.046, 0), v3(Math.cos(a) * 0.016, 0.025, Math.sin(a) * 0.012), v3(Math.cos(a) * 0.02, -0.01, Math.sin(a) * 0.014), v3(Math.cos(a) * 0.006, -0.04, Math.sin(a) * 0.004)];
        P.add('dark', tube(curve(pts, 10), (t) => 0.0032 * (1 - t * 0.7), 5));
      }
      P.add('dark', sphere(0.006, 8, 6), { p: [0, 0.046, 0] });
      top = 0.05;
      spots.push({ p: v3(0, 0.04, 0.005), n: FRONT, s: 0.006 });
      break;
    }
    case 'heartstone': {
      // A heart stone in filigree with small wings.
      const heart: V2[] = smoothOutline([[0, -0.034], [0.026, -0.004], [0.022, 0.02], [0.009, 0.024], [0, 0.012], [-0.009, 0.024], [-0.022, 0.02], [-0.026, -0.004]], 40);
      P.add('gem', slab(heart, 0.012, { bevel: 0.005 }));
      P.add(metal, rim(heart.map(([x, y]) => [x * 1.12, y * 1.1 - 0.001] as V2), 0, 0.0028));
      for (const s of [-1, 1]) {
        const wing: V2[] = [[0, 0], [0.012, 0.016], [0.03, 0.03], [0.024, 0.016], [0.034, 0.016], [0.024, 0.004], [0.03, -0.004], [0.012, -0.006]];
        P.add(metal, slab(wing, 0.003), { p: [s * 0.026, 0.006, -0.002], s: [s, 1, 1] });
      }
      P.add('glow', sphere(0.005, 8, 6), { p: [0, -0.002, 0.007] });
      top = 0.03;
      spots.push({ p: v3(0, 0.03, 0.003), n: FRONT, s: 0.007 });
      break;
    }
    default: {
      // A bronze medallion: raised rim, a ring of dots, a stone in the middle.
      P.add(metal, lathe([[0, -0.004], [0.034, -0.004], [0.036, 0], [0.034, 0.004], [0.028, 0.003], [0.026, 0.002], [0, 0.003]], 24), { r: [PI / 2, 0, 0] });
      for (const [x, y] of circle2(0, 0, 0.022, 12)) P.add(metal, sphere(0.0022, 6, 4), { p: [x, y, 0.003] });
      setGem(P, v3(0, 0, 0.003), FRONT, 0.022, true, 'cabochon');
      top = 0.036;
      spots.push({ p: v3(0, -0.028, 0.004), n: FRONT, s: 0.006 });
    }
  }
  necklace(P, metal, top + 0.006);
  dressGems(P, spots);
  frontAnchors(P, v3(), 0.035);
}

// ===========================================================================
// RINGS
// ===========================================================================

export function buildRing(P: Parts): void {
  const L = P.look;
  const [kind = 'ring'] = idParts(P, 'ring');
  const metal: Slot = L.material === 'crystal' ? 'main' : 'main';
  const R = 0.036;
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  switch (kind) {
    case 'signet': {
      const b = torus(R, 0.0055, 8, 32);
      b.scale(1, 1, 1.5);
      P.add(metal, b);
      P.add(metal, cyl(0.016, 0.014, 0.008, 18), { p: [0, R + 0.006, 0], s: [1, 1, 0.8] });
      // A crest: a little tower and two dots, cut into the face.
      P.add('dark', box(0.006, 0.0015, 0.008, 0), { p: [0, R + 0.0105, 0] });
      P.add('dark', box(0.014, 0.0015, 0.003, 0), { p: [0, R + 0.0105, -0.004] });
      for (const s of [-1, 1]) P.add('dark', sphere(0.0018, 6, 4), { p: [s * 0.008, R + 0.0102, 0.005] });
      spots.push({ p: v3(0.011, R + 0.006, 0.007), n: v3(0.5, 0.3, 1), s: 0.006 });
      break;
    }
    case 'band': {
      const b = lathe([[R - 0.003, -0.012], [R + 0.004, -0.011], [R + 0.005, 0], [R + 0.004, 0.011], [R - 0.003, 0.012]], 40);
      P.add(metal, b, { r: [PI / 2, 0, 0] });
      for (const z of [-0.006, 0.006]) P.add('dark', torus(R + 0.0048, 0.0011, 3, 40), { p: [0, 0, z] });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2 + PI / 2;
        P.add('trim', sphere(0.0022, 6, 4), { p: [Math.cos(a) * (R + 0.005), Math.sin(a) * (R + 0.005), 0] });
      }
      spots.push({ p: v3(0, R + 0.005, 0), n: v3(0, 1, 0), s: 0.008 });
      break;
    }
    case 'circle': {
      // Two strands twisted into a rope, a stone held in claws.
      for (const ph of [0, PI]) {
        const pts: V3[] = [];
        for (let i = 0; i <= 64; i++) {
          const a = (i / 64) * PI * 2;
          const w = a * 6 + ph;
          const rr = R + Math.cos(w) * 0.0035;
          pts.push(v3(Math.cos(a) * rr, Math.sin(a) * rr, Math.sin(w) * 0.0035));
        }
        P.add(metal, tube(pts, 0.0032, 5, { capA: false, capB: false }));
      }
      setGem(P, v3(0, R + 0.004, 0), v3(0, 1, 0), 0.018, true, 'round');
      for (const s of [-1, 1]) P.add('dark', horn(0.014, 0.003, 1.4, 5), { p: [s * 0.01, R, 0], r: [0, 0, s * 0.4], s: [-s, 1, 1] });
      break;
    }
    case 'halo': {
      const b = torus(R, 0.0045, 8, 36);
      b.scale(1, 1, 1.2);
      P.add(metal, b);
      // A crown of stones on top and a halo of light behind.
      setGem(P, v3(0, R + 0.004, 0), v3(0, 1, 0), 0.016, true, 'marquise');
      for (const s of [-1, 1]) setGem(P, v3(s * 0.012, R + 0.0, 0), v3(s * 0.5, 1, 0), 0.009, false, 'round');
      P.add('glow', torus(R * 1.5, 0.0012, 4, 48), { p: [0, 0.004, -0.008] });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2;
        P.add('glow', spike(0.008, 0.0012, 3), aim(v3(Math.cos(a) * R * 1.55, 0.004 + Math.sin(a) * R * 1.55, -0.008), v3(Math.cos(a), Math.sin(a), 0)));
      }
      break;
    }
    case 'eternity': {
      // A serpent eating its tail, stones along its back.
      const pts: V3[] = [];
      for (let i = 0; i <= 60; i++) {
        const a = PI / 2 + 0.25 + (i / 60) * (PI * 2 - 0.35);
        pts.push(v3(Math.cos(a) * R, Math.sin(a) * R, 0));
      }
      P.add(metal, tube(pts, (t) => 0.0025 + 0.004 * Math.min(1, t * 1.4), 7));
      // The head sits at the thick end, jaws closing on the thin tail.
      const ha = PI / 2 + 0.04;
      const head = sphere(0.0085, 12, 8);
      head.scale(1.5, 0.95, 1.05);
      P.add(metal, head, { p: [Math.cos(ha) * R, Math.sin(ha) * R + 0.001, 0], r: [0, 0, ha - PI / 2] });
      P.add(metal, cone(0.004, 0.008, 6), { p: [Math.cos(ha) * R - 0.012, Math.sin(ha) * R + 0.001, 0], r: [0, 0, PI / 2] });
      for (const z of [-1, 1]) P.add('glow', sphere(0.0017, 6, 4), { p: [Math.cos(ha) * R - 0.004, Math.sin(ha) * R + 0.005, z * 0.006] });
      for (let i = 0; i < 7; i++) {
        const a = PI / 2 + 0.8 + (i / 6) * PI * 1.45;
        setGem(P, v3(Math.cos(a) * R, Math.sin(a) * R, 0.004), FRONT, 0.008, false, 'round');
      }
      break;
    }
    default: {
      // A plain band with a ridge down the middle.
      const b = torus(R, 0.005, 8, 32);
      b.scale(1, 1, 1.3);
      P.add(metal, b);
      P.add(metal, torus(R + 0.004, 0.0016, 4, 32));
      spots.push({ p: v3(0, R + 0.005, 0), n: v3(0, 1, 0), s: 0.009 });
    }
  }
  dressGems(P, spots);
  frontAnchors(P, v3(), R);
  // Decorations sit on the band, never in the hole.
  P.anchors.points.length = 0;
  for (let i = 0; i < 10; i++) {
    const a = PI / 2 + 0.5 + (i / 9) * (PI * 2 - 1);
    const n = v3(Math.cos(a), Math.sin(a), 0.4);
    P.point(v3(Math.cos(a) * (R + 0.004), Math.sin(a) * (R + 0.004), 0.003), n, 0.006);
  }
  P.anchors.face = { p: v3(0, R + 0.006, 0.004), n: v3(0, 0.6, 1).normalize(), s: 0.008 };
  P.anchors.head = { p: v3(0, R, 0), r: 0.012 };
  P.anchors.axis = { a: v3(0, R * 0.7, 0), b: v3(0, R * 1.08, 0), r: 0.004 };
}

// ===========================================================================
// CHARMS
// ===========================================================================

export function buildCharm(P: Parts): void {
  const [kind = 'small'] = idParts(P, 'charm');
  // A named charm is carved from its own design: its body in the main
  // surface and its bindings in the second. Plain charms keep stone and bone.
  const own = !!P.look.design;
  const bone: Slot = own ? 'main' : 'bone';
  const tie: Slot = own ? 'second' : 'leather';
  switch (kind) {
    case 'large': {
      // A carved bone plaque with a glowing mark and a bead on a cord.
      const out: V2[] = smoothOutline([[-0.024, -0.045], [0.024, -0.045], [0.028, 0.0], [0.022, 0.045], [-0.022, 0.045], [-0.028, 0]], 32);
      P.add(bone, slab(out, 0.009));
      // A crow's-foot rune: one stroke, two branches, three cut notches.
      P.add('glow', box(0.0025, 0.05, 0.002, 0), { p: [0, -0.004, 0.0048] });
      for (const s of [-1, 1]) P.add('glow', box(0.0024, 0.022, 0.002, 0), { p: [s * 0.007, 0.024, 0.0048], r: [0, 0, s * 0.55] });
      for (let i = 0; i < 3; i++) P.add('glow', box(0.008, 0.0018, 0.002, 0), { p: [0, -0.02 + i * 0.008, 0.0048], r: [0, 0, 0.35] });
      P.add('string', tube(curve([v3(0, 0.045, 0), v3(0.01, 0.06, 0), v3(0.02, 0.05, 0.004), v3(0.026, 0.03, 0.006)], 10), 0.0012, 3));
      P.add('gem', sphere(0.006, 8, 6), { p: [0.026, 0.026, 0.006] });
      break;
    }
    case 'grand': {
      // Two horns bound into a totem with leather, a skull at the binding,
      // feathers trailing and old marks that still burn.
      P.add(bone, horn(0.13, 0.026, 0.85, 10), { p: [0.016, -0.06, 0], r: [0, 0, 0.3] });
      P.add(bone, horn(0.1, 0.02, 0.9, 9), { p: [-0.012, -0.058, -0.004], r: [0, PI, 0.38] });
      for (const y of [-0.04, -0.026, -0.012]) P.add(tie, torus(0.024, 0.0036, 4, 16), { p: [0.004, y, 0], r: [PI / 2, 0, -0.08] });
      for (let f = 0; f < 3; f++) {
        const feather: V2[] = [[0, 0], [0.007, -0.014], [0.005, -0.05], [0, -0.056], [-0.005, -0.05], [-0.006, -0.014]];
        P.add('cloth', slab(feather, 0.002), { p: [-0.014 + f * 0.012, -0.05, 0.01], r: [0, 0, 0.35 - f * 0.35] });
      }
      skull(P, bone, v3(0.002, -0.03, 0.022), 0.036);
      P.add('glow', sphere(0.0045, 8, 6), { p: [-0.004, -0.028, 0.04] });
      P.add('glow', sphere(0.0045, 8, 6), { p: [0.009, -0.028, 0.04] });
      for (let i = 0; i < 3; i++) P.add('glow', box(0.008, 0.0018, 0.002, 0), { p: [0.022 + i * 0.002, 0.008 + i * 0.013, 0.016], r: [0, 0, 0.6] });
      break;
    }
    case 'medium': {
      // Two finger bones crossed and lashed with dyed cord, an iron ring to
      // hang it by and a mark scratched into the knuckle that still glows.
      for (const s of [-1, 1]) {
        const tilt = s * 0.32;
        P.add(bone, cyl(0.0045, 0.0055, 0.07, 8), { r: [0, 0, tilt] });
        for (const e of [-1, 1]) {
          const dx = -Math.sin(tilt) * 0.035 * e;
          const dy = Math.cos(tilt) * 0.035 * e;
          P.add(bone, sphere(0.0072, 10, 8), { p: [dx, dy, 0], s: [1, 0.8, 0.85] });
        }
      }
      for (let i = 0; i < 4; i++) P.add(tie, torus(0.0085, 0.0018, 4, 14), { p: [0, -0.006 + i * 0.004, 0], r: [PI / 2, 0, (i % 2 ? 0.3 : -0.3)] });
      P.add('dark', torus(0.008, 0.0016, 4, 16), { p: [0, 0.052, 0] });
      P.add('string', tube(curve([v3(0, 0.044, 0), v3(-0.004, 0.05, 0.002), v3(0, 0.06, 0)], 8), 0.001, 3));
      for (let i = 0; i < 3; i++) P.add('glow', box(0.0018, 0.008 - i * 0.002, 0.0015, 0), { p: [-0.003 + i * 0.003, 0.03 + (i % 2) * 0.002, 0.0062], r: [0, 0, 0.25 - i * 0.25] });
      P.add('gem', sphere(0.0035, 8, 6), { p: [0.006, -0.03, 0.004] });
      break;
    }
    default: {
      // A little dark stone with a glowing spiral, tied with cord.
      const g = chip(sphere(0.024, 12, 8), 0.06, 3);
      g.scale(1, 1.15, 0.55);
      P.add(own ? 'main' : 'obsidian', g);
      const sp: V3[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const a = t * PI * 3.5;
        sp.push(v3(Math.cos(a) * t * 0.014, Math.sin(a) * t * 0.014, 0.0135 - t * t * 0.002));
      }
      P.add('glow', tube(sp, 0.0013, 3));
      P.add('string', torus(0.024, 0.0014, 3, 20), { r: [0, PI / 2, 0], s: [1, 1.15, 1] });
      P.add('string', torus(0.006, 0.0014, 3, 10), { p: [0, 0.031, 0], r: [0, PI / 2, 0] });
    }
  }
  frontAnchors(P, v3(), 0.035);
}

// ===========================================================================
// MATERIALS
// ===========================================================================

/** An open pouch, mouth up, from y = 0 to `h`. */
function pouch(P: Parts, slot: Slot, r: number, h: number): void {
  P.add(slot, lathe([[0, 0], [r * 0.7, 0.002], [r, h * 0.3], [r * 0.95, h * 0.65], [r * 0.6, h * 0.85], [r * 0.75, h], [r * 0.7, h * 1.02]], 14, { sz: 0.85 }));
  P.add('string', torus(r * 0.62, 0.0018, 3, 14), { p: [0, h * 0.85, 0], r: [PI / 2, 0, 0], s: [1, 0.85, 1] });
}

/** A mound of powder or grains at height y. */
function heap(P: Parts, slot: Slot, r: number, y: number, h: number, seed: number): void {
  const g = lathe([[0, 0], [r, 0], [r * 0.7, h * 0.45], [r * 0.3, h * 0.9], [0, h]], 12);
  P.add(slot, chip(g, 0.12, seed), { p: [0, y, 0] });
}

function bowl(P: Parts, slot: Slot, r: number, h: number): void {
  P.add(slot, lathe([[0, 0], [r * 0.6, 0], [r, h * 0.6], [r * 1.05, h], [r * 0.95, h], [r * 0.88, h * 0.62], [0, h * 0.5]], 16));
}

export function buildMaterial(P: Parts): void {
  const L = P.look;
  const id = L.cut.startsWith('material.') ? L.cut.slice(9) : L.cut;
  const seed = hashString(id) & 0xffff;
  let c = v3(0, 0.03, 0);
  switch (id) {
    // ---- Dust: each in its own container, a mound of colour on top ----
    case 'dust.grave':
      pouch(P, 'cloth', 0.03, 0.05);
      heap(P, 'crystal', 0.022, 0.048, 0.014, seed);
      for (let i = 0; i < 3; i++) P.add('bone', box(0.012, 0.003, 0.003, 0.001), { p: [(i - 1) * 0.008, 0.058, (i % 2) * 0.006], r: [0, i * 1.2, 0.3] });
      break;
    case 'dust.ember':
      bowl(P, 'clay', 0.034, 0.026);
      heap(P, 'crystal', 0.03, 0.014, 0.016, seed);
      for (let i = 0; i < 5; i++) P.add('glow', chip(sphere(0.005, 6, 4), 0.2, i), { p: [Math.cos(i * 1.3) * 0.015, 0.026 + (i % 2) * 0.003, Math.sin(i * 1.3) * 0.015] });
      c = v3(0, 0.02, 0);
      break;
    case 'dust.frost':
      P.add('glass', lathe([[0, 0], [0.024, 0], [0.026, 0.004], [0.026, 0.05], [0.02, 0.056], [0.02, 0.06]], 16));
      P.add('crystal', lathe([[0, 0.002], [0.022, 0.002], [0.022, 0.032], [0, 0.034]], 14));
      P.add('wood', cyl(0.021, 0.02, 0.01, 14), { p: [0, 0.062, 0] });
      for (let i = 0; i < 4; i++) P.add('crystal', spike(0.016, 0.003, 4), aim(v3(Math.cos(i * 1.6) * 0.012, 0.064, Math.sin(i * 1.6) * 0.012), v3(Math.cos(i * 1.6) * 0.5, 1, Math.sin(i * 1.6) * 0.5)));
      break;
    case 'dust.storm':
      P.add('iron', cyl(0.03, 0.03, 0.022, 18), { p: [0, 0.011, 0] });
      P.add('iron', torus(0.03, 0.002, 4, 24), { p: [0, 0.022, 0], r: [PI / 2, 0, 0] });
      heap(P, 'crystal', 0.026, 0.022, 0.012, seed);
      P.add('glow', tube([v3(-0.004, 0.034, 0), v3(0.006, 0.048, 0.002), v3(-0.002, 0.05, 0.002), v3(0.008, 0.066, 0.004)], 0.0016, 4));
      P.add('iron', cyl(0.031, 0.031, 0.004, 18), { p: [0.03, 0.03, -0.01], r: [0, 0, 1.2] });
      break;
    case 'dust.venom':
      pouch(P, 'leather', 0.03, 0.05);
      heap(P, 'crystal', 0.022, 0.048, 0.012, seed);
      for (let i = 0; i < 3; i++) P.add('liquid', sphere(0.004, 8, 6), { p: [0.02 - i * 0.012, 0.03 - i * 0.008, 0.026], s: [1, 1.4, 1] });
      P.add('liquid', tube(curve([v3(0.016, 0.056, 0.016), v3(0.024, 0.04, 0.024), v3(0.024, 0.02, 0.026)], 8), (t) => 0.002 + t * 0.001, 4));
      break;
    case 'dust.void':
      bowl(P, 'obsidian', 0.03, 0.022);
      heap(P, 'crystal', 0.026, 0.012, 0.012, seed);
      P.add('glow', torus(0.028, 0.0012, 3, 30), { p: [0, 0.045, 0], r: [PI / 2 - 0.3, 0, 0] });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        P.add('glow', sphere(0.0028, 6, 4), { p: [Math.cos(a) * 0.028, 0.045 + Math.sin(a) * 0.008, Math.sin(a) * 0.027] });
      }
      break;
    // ---- Shards: metal in its raw or broken form ----
    case 'shard.iron':
      P.add('tint', chip(flat(clean(new THREE.DodecahedronGeometry(0.028, 0))), 0.25, seed), { p: [0, 0.024, 0], s: [1.2, 0.8, 1] });
      P.add('tint', chip(flat(clean(new THREE.DodecahedronGeometry(0.014, 0))), 0.3, seed + 1), { p: [0.03, 0.01, 0.012] });
      P.add('clay', chip(flat(clean(new THREE.DodecahedronGeometry(0.01, 0))), 0.3, seed + 2), { p: [-0.026, 0.008, 0.016] });
      break;
    case 'shard.steel': {
      const frag: V2[] = [[-0.012, -0.03], [0.012, -0.03], [0.014, 0.012], [0.004, 0.022], [0.008, 0.03], [-0.006, 0.026], [-0.01, 0.034], [-0.013, 0.01]];
      P.add('tint', slab(frag, 0.006, { taper: (x) => 1 - Math.abs(x) * 30 }), { p: [0, 0.035, 0], r: [0, 0, 0.2] });
      P.add('tint', slab([[-0.008, 0], [0.01, 0.002], [0.002, 0.024]], 0.004), { p: [0.022, 0.006, 0.006], r: [-1.2, 0, 0.4] });
      P.add('dark', box(0.024, 0.004, 0.007), { p: [-0.003, 0.004, 0] });
      break;
    }
    case 'shard.mithral':
      for (let i = 0; i < 5; i++) P.add('tint', spike(0.05 + (i % 3) * 0.008, 0.0045, 5), { p: [(i - 2) * 0.004, 0.004, (i % 2) * 0.003], r: [0, 0, (i - 2) * 0.12] });
      for (const y of [0.016, 0.026]) P.add('trim', torus(0.012, 0.0014, 3, 14), { p: [0, y, 0], r: [PI / 2, 0, 0] });
      c = v3(0, 0.03, 0);
      break;
    case 'shard.adamant':
      P.add('tint', lathe([[0, -0.03], [0.014, -0.028], [0.016, 0.028], [0, 0.03]], 6, { smooth: false }), { p: [0, 0.016, 0], r: [0, 0, PI / 2] });
      P.add('dark', box(0.012, 0.012, 0.002, 0.001), { p: [0, 0.016, 0.0145] });
      P.add('glow', box(0.006, 0.0018, 0.002, 0), { p: [0, 0.016, 0.0156] });
      P.add('tint', lathe([[0, -0.022], [0.011, -0.02], [0.012, 0.02], [0, 0.022]], 6, { smooth: false }), { p: [0.004, 0.042, -0.004], r: [0, 0.4, PI / 2] });
      break;
    case 'shard.starmetal': {
      const rock = chip(sphere(0.03, 14, 10), 0.22, seed);
      P.add('obsidian', rock, { p: [0, 0.03, 0] });
      for (let i = 0; i < 4; i++) {
        const d = sphereDirs(4)[i]!;
        const a = d.clone().multiplyScalar(0.026).add(v3(0, 0.03, 0));
        const b = d.clone().multiplyScalar(0.03).add(v3(0, 0.03, 0)).add(v3(0.01, 0.01, 0));
        P.add('glow', tube([a, a.clone().lerp(b, 0.5).add(v3(0, 0, 0.004)), b], 0.0018, 4));
      }
      for (let i = 0; i < 5; i++) P.add('tint', flat(clean(new THREE.OctahedronGeometry(0.005, 0))), { p: [Math.cos(i * 1.7) * 0.026, 0.03 + Math.sin(i * 2.3) * 0.018, Math.abs(Math.sin(i * 1.7)) * 0.024] });
      break;
    }
    // ---- Reagents: hides, cords, thread, cloth ----
    case 'reagent.hide':
      P.add('leather', cyl(0.018, 0.018, 0.07, 14), { p: [0, 0.018, 0], r: [0, 0, PI / 2] });
      P.add('leather', torus(0.014, 0.005, 6, 14), { p: [0.036, 0.018, 0], r: [0, PI / 2, 0] });
      for (const x of [-0.018, 0.018]) P.add('string', torus(0.0185, 0.0016, 3, 16), { p: [x, 0.018, 0], r: [0, PI / 2, 0] });
      P.add('leather', slab([[0, 0], [0.03, 0.004], [0.034, 0.02], [0.006, 0.014]], 0.002), { p: [-0.03, 0.0, 0.016], r: [-PI / 2 + 0.2, 0, 0] });
      c = v3(0, 0.018, 0);
      break;
    case 'reagent.sinew': {
      const pts: V3[] = [];
      for (let i = 0; i <= 90; i++) {
        const t = i / 90;
        const a = t * PI * 2 * 5;
        pts.push(v3(Math.cos(a) * 0.024, 0.004 + t * 0.022, Math.sin(a) * 0.024));
      }
      P.add('blood', tube(pts, 0.0035, 5));
      P.add('string', torus(0.026, 0.002, 3, 6), { p: [0, 0.015, 0], r: [0, 0, PI / 2], s: [1, 0.6, 1] });
      P.add('blood', tube(curve([v3(0.024, 0.026, 0), v3(0.036, 0.02, 0.01), v3(0.04, 0.004, 0.02)], 8), 0.0032, 5));
      c = v3(0, 0.015, 0);
      break;
    }
    case 'reagent.silk':
      P.add('wood', cyl(0.018, 0.018, 0.006, 14), { p: [0, 0.003, 0] });
      P.add('wood', cyl(0.018, 0.018, 0.006, 14), { p: [0, 0.047, 0] });
      P.add('wood', cyl(0.006, 0.006, 0.05, 10), { p: [0, 0.025, 0] });
      P.add('string', lathe([[0.006, 0.006], [0.014, 0.008], [0.015, 0.025], [0.014, 0.042], [0.006, 0.044]], 16));
      P.add('string', tube(curve([v3(0.015, 0.03, 0), v3(0.026, 0.02, 0.01), v3(0.03, 0.002, 0.02)], 8), 0.0009, 3));
      break;
    case 'reagent.starcloth': {
      // A folded square of night-blue cloth with stars caught in it.
      for (let i = 0; i < 3; i++) P.add('ghost', box(0.06 - i * 0.004, 0.006, 0.05 - i * 0.004, 0.003), { p: [0, 0.004 + i * 0.007, 0], r: [0, i * 0.08, 0] });
      for (let i = 0; i < 7; i++) P.add('glow', flat(clean(new THREE.OctahedronGeometry(0.0022, 0))), { p: [Math.cos(i * 2.1) * 0.02, 0.022, Math.sin(i * 2.7) * 0.016] });
      P.add('ghost', slab([[0, 0], [0.026, 0], [0.02, -0.03]], 0.004), { p: [0.018, 0.02, 0.018], r: [-1.2, 0, 0] });
      c = v3(0, 0.014, 0);
      break;
    }
    // ---- Essences: light that floats ----
    case 'essence.lesser':
      P.add('glow', sphere(0.012, 12, 8), { p: [0, 0.04, 0] });
      P.add('crystal', torus(0.022, 0.0016, 4, 28), { p: [0, 0.04, 0], r: [PI / 2 - 0.4, 0, 0] });
      c = v3(0, 0.04, 0);
      break;
    case 'essence.greater':
      P.add('glow', sphere(0.016, 12, 8), { p: [0, 0.04, 0] });
      P.add('crystal', torus(0.028, 0.0018, 4, 30), { p: [0, 0.04, 0], r: [PI / 2 - 0.4, 0, 0] });
      P.add('crystal', torus(0.026, 0.0018, 4, 30), { p: [0, 0.04, 0], r: [0.4, 0.8, 0] });
      c = v3(0, 0.04, 0);
      break;
    case 'essence.pure': {
      const drop = lathe([[0, -0.026], [0.012, -0.018], [0.016, -0.004], [0.01, 0.012], [0, 0.03]], 14);
      P.add('crystal', drop, { p: [0, 0.04, 0] });
      P.add('glow', sphere(0.007, 10, 8), { p: [0, 0.034, 0] });
      for (let i = 0; i < 3; i++) P.add('glow', sphere(0.0024, 6, 4), { p: [Math.cos(i * 2.1) * 0.024, 0.024 + i * 0.012, Math.sin(i * 2.1) * 0.024] });
      c = v3(0, 0.04, 0);
      break;
    }
    case 'essence.mythic':
      P.add('glow', sphere(0.012, 12, 8), { p: [0, 0.042, 0] });
      for (const d of sphereDirs(10)) P.add('crystal', spike(0.018 + (Math.abs(d.y) < 0.3 ? 0.01 : 0), 0.003, 4), aim(v3(0, 0.042, 0).addScaledVector(d, 0.01), d));
      P.add('glow', torus(0.034, 0.0012, 3, 36), { p: [0, 0.042, 0], r: [PI / 2 - 0.25, 0, 0] });
      c = v3(0, 0.042, 0);
      break;
    // ---- Cores: hearts of things ----
    case 'core.beast': {
      const g = chip(sphere(0.022, 14, 10), 0.08, seed);
      g.scale(1, 1.2, 0.9);
      P.add('blood', g, { p: [0, 0.03, 0], r: [0, 0, 0.3] });
      for (let i = 0; i < 3; i++) P.add('blood', cyl(0.006 - i * 0.001, 0.007, 0.016, 8), { p: [-0.008 + i * 0.008, 0.056, 0], r: [0, 0, 0.3 - i * 0.3] });
      for (let i = 0; i < 3; i++) P.add('liquid', tube(curve([v3(-0.012 + i * 0.01, 0.046, 0.017), v3(-0.006 + i * 0.008, 0.03, 0.02), v3(-0.01 + i * 0.01, 0.014, 0.016)], 8), 0.0012, 3));
      break;
    }
    case 'core.demon':
      P.add('obsidian', chip(sphere(0.024, 14, 10), 0.1, seed), { p: [0, 0.028, 0] });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + 0.4;
        P.add('glow', tube(curve([v3(Math.cos(a) * 0.004, 0.05, 0.02), v3(Math.cos(a) * 0.014, 0.032, 0.022), v3(Math.cos(a) * 0.022, 0.016, 0.012)], 8), 0.0016, 4));
      }
      for (const s of [-1, 1]) P.add('bone', horn(0.03, 0.005, 1.2, 6), { p: [s * 0.012, 0.046, -0.004], r: [0, 0, -s * 0.5], s: [s, 1, 1] });
      break;
    case 'core.titan': {
      // A split geode: rough rock outside, crystals inside.
      const outer = chip(sphere(0.03, 14, 10, ), 0.14, seed);
      outer.scale(1, 0.9, 0.6);
      P.add('obsidian', outer, { p: [0, 0.028, -0.006] });
      P.add('clay', lathe([[0, 0], [0.026, 0.0], [0.024, 0.004], [0, 0.004]], 16), { p: [0, 0.028, 0.012], r: [PI / 2, 0, 0], s: [1, 1, 0.9] });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * PI * 2;
        const rr = i % 2 ? 0.014 : 0.008;
        P.add('crystal', spike(0.012, 0.0035, 5), aim(v3(Math.cos(a) * rr, 0.028 + Math.sin(a) * rr, 0.012), v3(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 1)));
      }
      P.add('glow', sphere(0.005, 8, 6), { p: [0, 0.028, 0.016] });
      break;
    }
    case 'core.godsblood':
      P.add('liquid', sphere(0.02, 16, 12), { p: [0, 0.04, 0] });
      P.add('glow', sphere(0.008, 10, 8), { p: [0, 0.04, 0] });
      for (const r of [[PI / 2, 0, 0], [0, 0, 0], [0, PI / 2, 0]] as Array<[number, number, number]>) P.add('gold', torus(0.025, 0.0016, 4, 32), { p: [0, 0.04, 0], r });
      for (let i = 0; i < 3; i++) P.add('liquid', lathe([[0, -0.004], [0.003, -0.002], [0.002, 0.002], [0, 0.005]], 8), { p: [(i - 1) * 0.008, 0.012 - i * 0.003, 0.004] });
      c = v3(0, 0.04, 0);
      break;
    // ---- Catalysts: order, chaos, time ----
    case 'catalyst.order':
      P.add('crystal', flat(clean(new THREE.OctahedronGeometry(0.02, 0))), { p: [0, 0.04, 0], s: [1, 1.3, 1] });
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as V2[]) P.add('gold', sphere(0.003, 6, 4), { p: [x * 0.024, 0.04 + y * 0.024, 0] });
      P.add('gold', rim([[-0.024, -0.024], [0.024, -0.024], [0.024, 0.024], [-0.024, 0.024]].map(([x, y]) => [x, y + 0.04] as V2), 0, 0.0018, 4));
      c = v3(0, 0.04, 0);
      break;
    case 'catalyst.chaos':
      for (let i = 0; i < 9; i++) {
        const d = v3(jitter(i, seed), jitter(i + 20, seed) * 0.8 + 0.3, jitter(i + 40, seed)).normalize();
        P.add('crystal', spike(0.02 + 0.014 * Math.abs(jitter(i + 60, seed)), 0.004, 4), aim(v3(0, 0.03, 0), d));
      }
      P.add('obsidian', chip(sphere(0.012, 10, 8), 0.2, seed), { p: [0, 0.03, 0] });
      P.add('glow', sphere(0.005, 8, 6), { p: [0, 0.03, 0.01] });
      break;
    case 'catalyst.eternity':
      P.add('crystal', sphere(0.01, 12, 8), { p: [0, 0.04, 0] });
      P.add('gold', torus(0.02, 0.0018, 4, 30), { p: [0, 0.04, 0], r: [PI / 2, 0, 0] });
      P.add('gold', torus(0.024, 0.0018, 4, 30), { p: [0, 0.04, 0], r: [0, 0.6, 0] });
      P.add('gold', torus(0.028, 0.0018, 4, 32), { p: [0, 0.04, 0], r: [0.7, 0, 0.5] });
      P.add('gold', cyl(0.003, 0.006, 0.012, 8), { p: [0, 0.006, 0] });
      P.add('gold', cyl(0.012, 0.014, 0.004, 14), { p: [0, 0.002, 0] });
      c = v3(0, 0.04, 0);
      break;
    default: {
      // Unknown materials still look like something: by kind.
      const kind = id.split('.')[0];
      if (kind === 'dust') {
        pouch(P, 'leather', 0.03, 0.05);
        heap(P, 'crystal', 0.022, 0.048, 0.012, seed);
      } else if (kind === 'shard') P.add('tint', chip(flat(clean(new THREE.DodecahedronGeometry(0.026, 0))), 0.25, seed), { p: [0, 0.024, 0] });
      else P.add('crystal', flat(clean(new THREE.OctahedronGeometry(0.02, 0))), { p: [0, 0.03, 0] });
    }
  }
  frontAnchors(P, c, 0.03);
}
