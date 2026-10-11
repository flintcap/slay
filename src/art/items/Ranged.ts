/**
 * SLAY — bows and crossbows.
 *
 * Bows keep the shape they always had in a hand: limbs up and down the Y
 * axis, bowed toward -Z with the string behind, so the arrow flies +Z (the
 * one exception to "wide on X"). Crossbows lie the usual way: stock along +Y,
 * prod across X near the front, thin on Z.
 *
 * One cut per base. A Short Bow is a plain D of wood; a Spider Bow has
 * segmented bone limbs with barbs like legs; a Double Bow has two limbs a
 * side; a Hydra Bow ends in serpent heads. A Siege Crossbow carries its
 * windlass; a Chu-Ko-Nu its magazine and lever.
 */
import * as THREE from 'three';
import type { Parts, Slot } from './Parts';
import { box, cone, curve, cyl, gem, horn, loft, lathe, slab, sphere, spike, torus, tube, v3, type V3 } from './Geo';
import { aim, band, cutOf, dressGems, grip, runes, skull, smooth, type V2, type Wrap } from './Kit';

const PI = Math.PI;

// ===========================================================================
// BOWS
// ===========================================================================

type Tip = 'nock' | 'horn' | 'blade' | 'curl' | 'head' | 'cap' | 'crystal';
type Riser = 'plain' | 'shelf' | 'heavy' | 'winged' | 'skull';

interface BowCut {
  /** Half the bow's length along Y. */
  span: number;
  /** How far the tips sit behind the grip. */
  depth: number;
  /** How hard the tips flick forward again. */
  recurve: number;
  /** Limbs that first bend forward off the riser. */
  reflex?: number;
  /** Limb half width (X) and thickness (Z) at the root. */
  w: number;
  t: number;
  limb: Slot;
  riser: Riser;
  tips: Tip;
  wrap: Wrap;
  double?: boolean;
  /** Bone segments per limb. */
  segments?: number;
  barbs?: number;
  bands?: number;
  /** Angular limbs (straight runs, hard knees). */
  angular?: boolean;
}

const BOW_CUTS: Record<string, BowCut> = {
  'bow.short': { span: 0.46, depth: 0.1, recurve: 0, w: 0.016, t: 0.012, limb: 'wood', riser: 'plain', tips: 'nock', wrap: 'leather' },
  'bow.hunters': { span: 0.5, depth: 0.11, recurve: 0.9, w: 0.017, t: 0.012, limb: 'wood', riser: 'plain', tips: 'horn', wrap: 'cord', bands: 2 },
  'bow.spider': { span: 0.5, depth: 0.12, recurve: 1.5, w: 0.014, t: 0.014, limb: 'bone', riser: 'skull', tips: 'curl', wrap: 'cord', segments: 4, barbs: 3 },
  'bow.long': { span: 0.82, depth: 0.13, recurve: 0, w: 0.016, t: 0.014, limb: 'wood', riser: 'plain', tips: 'nock', wrap: 'leather' },
  'bow.composite': { span: 0.68, depth: 0.15, recurve: 1.1, reflex: 0.05, w: 0.018, t: 0.013, limb: 'wood', riser: 'shelf', tips: 'horn', wrap: 'leather', bands: 3 },
  'bow.shadow': { span: 0.72, depth: 0.16, recurve: 1.7, w: 0.017, t: 0.013, limb: 'wood', riser: 'shelf', tips: 'blade', wrap: 'cloth', angular: true },
  'bow.war': { span: 0.62, depth: 0.15, recurve: 1.2, w: 0.022, t: 0.017, limb: 'wood', riser: 'heavy', tips: 'cap', wrap: 'leather', bands: 2 },
  'bow.double': { span: 0.62, depth: 0.16, recurve: 1.1, w: 0.015, t: 0.012, limb: 'main', riser: 'heavy', tips: 'blade', wrap: 'wire', double: true },
  'bow.diamond': { span: 0.62, depth: 0.15, recurve: 1.3, w: 0.016, t: 0.014, limb: 'crystal', riser: 'shelf', tips: 'crystal', wrap: 'wire', angular: true },
  'bow.great': { span: 0.76, depth: 0.19, recurve: 2.0, w: 0.022, t: 0.017, limb: 'wood', riser: 'heavy', tips: 'cap', wrap: 'leather', bands: 2 },
  'bow.rune': { span: 0.74, depth: 0.17, recurve: 1.5, w: 0.019, t: 0.015, limb: 'wood', riser: 'heavy', tips: 'horn', wrap: 'wire', bands: 4 },
  'bow.hydra': { span: 0.72, depth: 0.18, recurve: 1.6, w: 0.018, t: 0.016, limb: 'bone', riser: 'skull', tips: 'head', wrap: 'cord', segments: 5 },
  'bow.matron': { span: 0.8, depth: 0.15, recurve: 1.2, reflex: 0.04, w: 0.016, t: 0.013, limb: 'main', riser: 'winged', tips: 'curl', wrap: 'wire' },
};

const BOW_BY_SHAPE: Record<string, string> = {
  bow: 'bow.short',
  'bow.short': 'bow.short',
  'bow.long': 'bow.long',
  'bow.war': 'bow.war',
  'bow.great': 'bow.great',
};

/** The limb's centre line, t from riser (0) to tip (1), for side s (+1 up). */
function limbPoint(c: BowCut, t: number, s: number): V3 {
  const y0 = 0.11;
  const y = y0 + t * (c.span - y0);
  let z: number;
  if (c.angular) {
    const knee = 0.72;
    z = t < knee ? -c.depth * 0.75 * (t / knee) : -c.depth * 0.75 - c.depth * 0.25 * ((t - knee) / (1 - knee)) + c.recurve * c.depth * 0.45 * ((t - knee) / (1 - knee));
  } else {
    z = -c.depth * Math.pow(t, 1.6) + c.recurve * c.depth * 0.5 * Math.pow(smooth(0.7, 1, t), 2);
  }
  if (c.reflex) z += c.reflex * Math.sin(PI * Math.min(1, t / 0.5)) * (1 - t);
  return v3(0, s * y, z);
}

/** A limb as lofted rings: wide on X, thin across the curve. */
function limbGeo(c: BowCut, s: number, zOff = 0, scale = 1): THREE.BufferGeometry {
  const n = 18;
  const rings: V3[][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = limbPoint(c, t, s).add(v3(0, 0, zOff));
    const q = limbPoint(c, Math.min(1, t + 0.02), s).sub(limbPoint(c, Math.max(0, t - 0.02), s)).normalize();
    const nrm = v3(0, -q.z, q.y).normalize();
    // Drawn bolder than life: at the game's distance a true-to-size limb
    // is a hairline and the bow reads as a stick.
    const wx = c.w * scale * 1.7 * (1 - 0.5 * t);
    const wn = c.t * scale * 2.5 * (1 - 0.45 * t);
    const ring: V3[] = [];
    const sides = c.limb === 'crystal' ? 4 : 8;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * PI * 2 + (sides === 4 ? PI / 4 : 0);
      ring.push(p.clone().add(v3(Math.cos(a) * wx, 0, 0)).addScaledVector(nrm, Math.sin(a) * wn * 0.5));
    }
    rings.push(ring);
  }
  return loft(rings, { capA: true, capB: true, smooth: c.limb !== 'crystal' && !c.angular });
}

export function buildBow(P: Parts): void {
  const L = P.look;
  const c = cutOf(BOW_CUTS, BOW_BY_SHAPE, L, 'bow.short');
  // A unique's limbs are made of its own main material, whatever the base's are.
  const limbSlot: Slot =
    c.limb === 'wood' && L.material === 'metal' ? 'main' : c.limb === 'wood' ? (L.material === 'bone' ? 'bone' : 'main') : L.design?.main && c.limb === 'bone' ? 'main' : c.limb;
  // The riser and grip.
  grip(P, -0.06, 0.06, 0.016, c.wrap);
  const rs: Slot = c.limb === 'crystal' ? 'trim' : limbSlot;
  switch (c.riser) {
    case 'plain':
      P.add(rs, lathe([[0.016, -0.12], [0.022, -0.07], [0.022, 0.07], [0.016, 0.12]], 8), {});
      break;
    case 'shelf':
      P.add(rs, box(0.03, 0.26, 0.03, 0.008), { p: [0, 0, 0.004] });
      P.add(rs, box(0.012, 0.02, 0.03, 0.003), { p: [0.018, 0.075, 0.004] });
      break;
    case 'heavy':
      P.add(rs, box(0.038, 0.3, 0.04, 0.01), { p: [0, 0, 0.006] });
      for (const s of [-1, 1]) P.add('trim', box(0.042, 0.02, 0.044, 0.004), { p: [0, s * 0.13, 0.006] });
      break;
    case 'winged': {
      P.add(rs, box(0.03, 0.28, 0.032, 0.008), { p: [0, 0, 0.004] });
      const wing: V2[] = [[0, 0], [0.04, 0.03], [0.1, 0.12], [0.06, 0.1], [0.08, 0.16], [0.03, 0.1], [0, 0.06]];
      for (const s of [-1, 1]) P.add('trim', slab(wing, 0.006), { p: [0, s * 0.06, 0.01], r: [s < 0 ? PI : 0, PI / 2, 0], s: [1, 1, 1] });
      break;
    }
    case 'skull':
      P.add(rs, lathe([[0.012, -0.12], [0.018, -0.07], [0.018, 0.07], [0.012, 0.12]], 8), {});
      skull(P, 'bone', v3(0, 0.09, 0.022), 0.04, v3(0, 0, 1));
      break;
  }
  // Limbs.
  for (const s of [-1, 1]) {
    if (c.segments) {
      // Bone limbs: segments with knuckles between.
      const n = c.segments;
      for (let i = 0; i < n; i++) {
        const a = limbPoint(c, i / n + 0.02, s);
        const b = limbPoint(c, (i + 1) / n - 0.02, s);
        const pts = curve([a, limbPoint(c, (i + 0.5) / n, s), b], 6);
        P.add(limbSlot, tube(pts, (t) => 1.35 * c.w * (1 - 0.5 * (i + t) / n) * (1 + 0.2 * Math.sin(t * PI)), 7));
        P.add(limbSlot, sphere(1.35 * c.w * (1.15 - 0.5 * i / n), 7, 5), { p: [b.x, b.y, b.z] });
      }
    } else {
      P.add(limbSlot, limbGeo(c, s));
      if (c.double) P.add(limbSlot, limbGeo(c, s, -0.035, 0.8));
    }
    for (let i = 0; i < (c.bands ?? 0); i++) {
      const t = 0.2 + (i / Math.max(1, c.bands! - 1)) * 0.55;
      const p = limbPoint(c, t, s);
      P.add(c.bands! > 2 ? 'dark' : 'second', torus(c.w * 1.05, 0.003, 4, 10), { p: [p.x, p.y, p.z], r: [PI / 2, 0, 0], s: [1, 0.7, 1] });
    }
    for (let i = 0; i < (c.barbs ?? 0); i++) {
      const p = limbPoint(c, 0.2 + i * 0.25, s);
      P.add('bone', horn(0.07, 0.005, 1.0, 5), { p: [p.x, p.y, p.z], r: [s * -0.4, 0, 0], s: [1, s, 1] });
      P.add('bone', horn(0.06, 0.005, 1.0, 5), { p: [p.x, p.y, p.z], r: [s * -0.4, 0, 0], s: [-1, s, 1] });
    }
    // Tips.
    const tip = limbPoint(c, 1, s);
    const dir = tip.clone().sub(limbPoint(c, 0.94, s)).normalize();
    switch (c.tips) {
      case 'nock':
        P.add(limbSlot, cone(c.w * 0.5, 0.03, 6), aim(tip, dir));
        break;
      case 'horn':
        P.add('bone', cone(c.w * 0.6, 0.045, 7), aim(tip, dir));
        break;
      case 'cap':
        P.add('trim', cyl(c.w * 0.5, c.w * 0.62, 0.035, 8), aim(tip, dir));
        break;
      case 'blade':
        P.add('main', spike(0.07, c.w * 0.7, 4), aim(tip, dir.clone().add(v3(0, 0, 0.5)).normalize(), [1, 1, 0.4]));
        break;
      case 'curl':
        P.add(limbSlot === 'bone' ? 'bone' : 'trim', torus(0.018, c.w * 0.3, 5, 12, PI * 1.4), { p: [tip.x, tip.y + s * 0.012, tip.z + 0.016], r: [0, PI / 2, s > 0 ? -PI / 2 : PI / 2] });
        break;
      case 'head': {
        const h = tip.clone().addScaledVector(dir, 0.02);
        const g = sphere(0.02, 8, 6);
        g.scale(0.8, 1.4, 1);
        P.add('bone', g, aim(h, dir.clone().add(v3(0, 0, 0.8)).normalize()));
        P.add('glow', sphere(0.004, 5, 4), { p: [h.x + 0.01, h.y, h.z + 0.012] });
        P.add('glow', sphere(0.004, 5, 4), { p: [h.x - 0.01, h.y, h.z + 0.012] });
        break;
      }
      case 'crystal':
        P.add('crystal', gem(0.06, 'shard'), aim(tip, dir));
        break;
    }
  }
  if (c.tips === 'head') {
    // The hydra's third head rises from the riser.
    P.add('bone', horn(0.12, 0.012, -0.8, 7), { p: [0, 0.1, 0.02], r: [PI / 2 - 0.5, 0, 0] });
  }
  // The string, tip to tip.
  const top = limbPoint(c, 1, 1);
  const bot = limbPoint(c, 1, -1);
  P.add('string', tube([top, bot], 0.0016, 4));
  if (c.double) P.add('string', tube([top.clone().add(v3(0, -0.01, -0.03)), bot.clone().add(v3(0, 0.01, -0.03))], 0.0014, 4));

  if (L.hasTrim) for (const s of [-1, 1]) P.add('trim', torus(0.019, 0.003, 4, 12), { p: [0, s * 0.065, 0], r: [PI / 2, 0, 0] });
  if (L.hasRunes || (L.glow > 0 && L.rarityTier >= 1) || L.design) {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const p = limbPoint(c, 0.25 + i * 0.18, s);
        P.add('glow', box(c.w * 0.9, 0.008, 0.002), { p: [p.x, p.y, p.z + c.t * 0.55] });
      }
    }
  }
  P.anchors.axis = { a: limbPoint(c, 0, 1), b: limbPoint(c, 1, 1), r: c.w * 2 };
  P.anchors.head = { p: v3(0, 0.1, 0.02), r: 0.05 };
  for (const s of [-1, 1]) {
    for (const t of [0.2, 0.45, 0.7]) {
      const p = limbPoint(c, t, s);
      P.point(p.clone().add(v3(0, 0, c.t * 0.5)), v3(0, 0, 1), c.w * 1.5);
    }
  }
  P.anchors.face = { p: v3(0, 0.1, 0.022), n: v3(0, 0, 1), s: 0.022 };
  dressGems(P, [
    { p: v3(0, 0.09, 0.024), n: v3(0, 0, 1), s: 0.018 },
    { p: v3(0, -0.09, 0.024), n: v3(0, 0, 1), s: 0.016 },
    { p: v3(0.02, 0, 0.01), n: v3(1, 0, 0), s: 0.012 },
  ]);
}

// ===========================================================================
// CROSSBOWS
// ===========================================================================

type XbowKind = 'light' | 'arbalest' | 'pellet' | 'heavy' | 'siege' | 'ballista' | 'repeat' | 'chukonu' | 'demon' | 'colossus';

interface XbowCut {
  kind: XbowKind;
  /** Stock length from butt to nose, and its half width. */
  len: number;
  sw: number;
  /** Half span of the prod. */
  prod: number;
  sweep: number;
  stock: Slot;
  prodSlot: Slot;
}

const XBOW_CUTS: Record<string, XbowCut> = {
  'xbow.light': { kind: 'light', len: 0.58, sw: 0.022, prod: 0.28, sweep: 0.06, stock: 'wood', prodSlot: 'wood' },
  'xbow.arbalest': { kind: 'arbalest', len: 0.66, sw: 0.025, prod: 0.32, sweep: 0.07, stock: 'wood', prodSlot: 'main' },
  'xbow.pellet': { kind: 'pellet', len: 0.6, sw: 0.022, prod: 0.3, sweep: 0.05, stock: 'wood', prodSlot: 'main' },
  'xbow.crossbow': { kind: 'heavy', len: 0.72, sw: 0.028, prod: 0.36, sweep: 0.08, stock: 'wood', prodSlot: 'main' },
  'xbow.siege': { kind: 'siege', len: 0.8, sw: 0.032, prod: 0.42, sweep: 0.09, stock: 'wood', prodSlot: 'main' },
  'xbow.ballista': { kind: 'ballista', len: 0.86, sw: 0.034, prod: 0.46, sweep: 0.05, stock: 'dark', prodSlot: 'main' },
  'xbow.repeating': { kind: 'repeat', len: 0.62, sw: 0.024, prod: 0.26, sweep: 0.06, stock: 'wood', prodSlot: 'wood' },
  'xbow.chukonu': { kind: 'chukonu', len: 0.66, sw: 0.025, prod: 0.28, sweep: 0.06, stock: 'wood', prodSlot: 'main' },
  'xbow.demon': { kind: 'demon', len: 0.7, sw: 0.026, prod: 0.32, sweep: 0.1, stock: 'dark', prodSlot: 'main' },
  'xbow.colossus': { kind: 'colossus', len: 0.9, sw: 0.034, prod: 0.48, sweep: 0.08, stock: 'main', prodSlot: 'main' },
};

const XBOW_BY_SHAPE: Record<string, string> = {
  crossbow: 'xbow.light',
  'crossbow.light': 'xbow.light',
  'crossbow.heavy': 'xbow.crossbow',
  'crossbow.repeat': 'xbow.repeating',
  xbow: 'xbow.light',
};

function prodGeo(c: XbowCut, s: number, y: number, w: number, t: number): { geo: THREE.BufferGeometry; tip: V3 } {
  const pts: V3[] = [];
  for (let i = 0; i <= 12; i++) {
    const u = i / 12;
    const x = s * (c.sw * 0.6 + u * c.prod);
    const yy = y - c.sweep * Math.pow(u, 1.8) + (c.kind === 'demon' ? 0.03 * Math.pow(smooth(0.7, 1, u), 2) : 0);
    pts.push(v3(x, yy, 0));
  }
  const geo = tube(pts, (u) => w * (1 - 0.5 * u), 6, { flat: t / w });
  return { geo, tip: pts[pts.length - 1]! };
}

export function buildCrossbow(P: Parts): void {
  const L = P.look;
  const c = cutOf(XBOW_CUTS, XBOW_BY_SHAPE, L, 'xbow.light');
  const fit: Slot = c.stock === 'wood' ? 'dark' : 'trim';
  const butt = -0.18;
  const nose = butt + c.len;
  const py = nose - 0.05;
  // The stock: a tapered beam with a butt and a pistol drop at the hand.
  const prof: V2[] = [[c.sw * 1.4, butt], [c.sw * 1.6, butt + 0.12], [c.sw, butt + 0.22], [c.sw, nose - 0.02], [c.sw * 0.8, nose]];
  const stockGeo = lathe(prof, 4, { phase: PI / 4, sz: 1.3, smooth: false });
  P.add(c.stock, stockGeo, {});
  P.add(c.stock, box(c.sw * 1.6, 0.11, c.sw * 1.8, 0.008), { p: [0, -0.02, -c.sw * 0.9], r: [0.25, 0, 0] });
  P.add('second', box(c.sw * 1.7, 0.09, c.sw * 1.9, 0.006), { p: [0, -0.02, -c.sw * 0.95], r: [0.25, 0, 0] });
  // The trigger and its guard.
  P.add(fit, box(0.004, 0.03, 0.006), { p: [0, 0.03, -c.sw * 1.5], r: [0.4, 0, 0] });
  P.add(fit, torus(0.018, 0.0025, 4, 10, PI), { p: [0, 0.04, -c.sw * 1.3], r: [0, PI / 2, PI] });
  // The prod.
  const pw = c.kind === 'ballista' || c.kind === 'colossus' ? 0.028 : 0.02;
  const tips: V3[] = [];
  for (const s of [-1, 1]) {
    const { geo, tip } = prodGeo(c, s, py, pw, pw * 0.6);
    P.add(c.prodSlot, geo);
    tips.push(tip);
    if (c.kind === 'colossus') P.add(c.prodSlot, prodGeo(c, s, py - 0.05, pw * 0.8, pw * 0.5).geo);
    if (c.kind === 'demon') {
      P.add('bone', horn(0.09, 0.008, 1.2, 5), { p: [tip.x, tip.y, 0], r: [0, 0, -s * 0.6], s: [s, 1, 0.8] });
      for (let i = 1; i < 4; i++) P.add('main', spike(0.03, 0.005, 4), { p: [s * (c.sw + i * c.prod * 0.22), py - c.sweep * Math.pow(i * 0.22, 1.8) + 0.005, 0] });
    }
    if (c.kind === 'ballista') {
      // Torsion springs: twisted skeins either side of the nose.
      P.add('cloth', cyl(0.022, 0.022, 0.07, 10), { p: [s * (c.sw + 0.03), py, 0], r: [PI / 2, 0, 0] });
      for (const z of [-0.04, 0.04]) P.add(fit, cyl(0.026, 0.026, 0.008, 10), { p: [s * (c.sw + 0.03), py, z], r: [PI / 2, 0, 0] });
    }
  }
  P.add(fit, box(c.sw * 2.6, 0.04, c.sw * 2.4, 0.006), { p: [0, py, 0] });
  // The string, drawn back to the nut.
  const nutY = nose - c.len * 0.42;
  P.add('string', tube([tips[0]!, v3(0, nutY, c.sw * 0.6), tips[1]!], 0.0018, 4));
  P.add(fit, cyl(0.008, 0.008, c.sw * 2.4, 8), { p: [0, nutY, c.sw * 0.3], r: [0, 0, PI / 2] });
  // A bolt in the groove.
  const boltLen = c.len * 0.45;
  P.add('wood', cyl(0.0035, 0.0035, boltLen, 5), { p: [0, nutY + boltLen * 0.5, c.sw * 0.75] });
  P.add('dark', cone(0.006, 0.025, 4), { p: [0, nutY + boltLen + 0.012, c.sw * 0.75] });
  for (const a of [0, PI / 2]) P.add('cloth', box(0.016, 0.03, 0.001), { p: [0, nutY + 0.03, c.sw * 0.75], r: [0, a, 0] });

  switch (c.kind) {
    case 'light':
    case 'heavy':
      // A stirrup loop for the foot.
      P.add(fit, torus(0.035, 0.004, 4, 14, PI), { p: [0, nose + 0.005, 0], r: [0, 0, 0] });
      break;
    case 'arbalest':
      P.add(fit, torus(0.04, 0.005, 4, 14, PI), { p: [0, nose + 0.005, 0] });
      for (const s of [-1, 1]) P.add(fit, cyl(0.012, 0.012, 0.012, 10), { p: [s * (c.sw + 0.006), butt + 0.3, 0], r: [0, 0, PI / 2] });
      break;
    case 'pellet':
      // A front sight frame with a bead, and a pouch on the string.
      for (const s of [-1, 1]) P.add(fit, box(0.004, 0.05, 0.004), { p: [s * 0.018, py + 0.01, c.sw + 0.025], r: [0.2, 0, 0] });
      P.add(fit, box(0.04, 0.004, 0.004), { p: [0, py + 0.01, c.sw + 0.05] });
      P.add('trim', sphere(0.005, 6, 4), { p: [0, py + 0.01, c.sw + 0.05] });
      P.add('second', sphere(0.012, 7, 5), { p: [0, nutY, c.sw * 0.6], s: [1.4, 0.8, 0.6] });
      break;
    case 'siege':
    case 'colossus': {
      // A windlass at the butt: drum and two cranks.
      const wy = butt + 0.06;
      P.add(fit, cyl(0.022, 0.022, c.sw * 3.6, 10), { p: [0, wy, 0], r: [0, 0, PI / 2] });
      for (const s of [-1, 1]) {
        P.add(fit, box(0.008, 0.08, 0.008), { p: [s * c.sw * 1.9, wy + 0.04, 0], r: [0, 0, s * 0.3] });
        P.add('wood', cyl(0.008, 0.008, 0.04, 6), { p: [s * (c.sw * 1.9 + 0.035), wy + 0.075, 0], r: [0, 0, PI / 2] });
      }
      P.add('string', tube([v3(0, wy, 0.02), v3(0, nutY, c.sw * 0.6)], 0.0016, 4));
      for (let i = 0; i < 3; i++) band(P, butt + 0.25 + i * 0.12, c.sw * 1.05, 0.012, fit);
      break;
    }
    case 'ballista':
      P.add(fit, torus(0.05, 0.006, 4, 14, PI), { p: [0, nose + 0.005, 0] });
      for (let i = 0; i < 4; i++) band(P, butt + 0.2 + i * 0.14, c.sw * 1.05, 0.014, 'trim');
      break;
    case 'repeat':
    case 'chukonu': {
      // A magazine box over the groove and the lever that cocks it.
      const my = nutY + 0.02;
      P.add(c.stock, box(c.sw * 1.6, c.len * 0.42, 0.06, 0.006), { p: [0, my + c.len * 0.21, c.sw + 0.03] });
      for (let i = 0; i < 4; i++) P.add('wood', cyl(0.0025, 0.0025, 0.03, 4), { p: [-0.008 + (i % 2) * 0.016, my + c.len * 0.42 + 0.012, c.sw + 0.02 + Math.floor(i / 2) * 0.02] });
      const lever = curve([v3(0, nose - 0.04, c.sw + 0.06), v3(0, nose - 0.12, c.sw + 0.16), v3(0, butt + 0.2, c.sw + 0.12)], 10);
      P.add(c.kind === 'chukonu' ? 'trim' : 'wood', tube(lever, 0.007, 6));
      if (c.kind === 'chukonu') for (let i = 0; i < 3; i++) P.add('trim', box(c.sw * 1.7, 0.008, 0.062), { p: [0, my + 0.04 + i * 0.09, c.sw + 0.03] });
      break;
    }
    case 'demon':
      skull(P, 'bone', v3(0, nose + 0.02, 0.01), 0.05, v3(0, 1, 0.4));
      for (let i = 0; i < 4; i++) P.add('main', spike(0.03, 0.006, 4), { p: [0, butt + 0.12 + i * 0.1, -c.sw * 1.2], r: [-PI / 2, 0, 0] });
      break;
  }
  if (L.hasTrim) {
    P.add('trim', box(c.sw * 2.1, 0.012, c.sw * 2.7, 0.003), { p: [0, butt + 0.005, 0] });
    for (const y of [py - 0.035, py + 0.025]) P.add('trim', box(c.sw * 2.7, 0.006, c.sw * 2.5, 0.002), { p: [0, y, 0] });
  }
  if (L.hasRunes || (L.glow > 0 && L.rarityTier >= 1) || L.design) runes(P, butt + 0.25, nutY - 0.04, c.sw * 1.2, c.sw * 1.32, L.signature, 3);
  P.anchors.axis = { a: v3(0, nutY, 0), b: v3(0, nose, 0), r: c.sw * 2 };
  P.anchors.head = { p: v3(0, py, 0), r: c.prod * 0.4 };
  for (const s of [-1, 1]) for (const u of [0.3, 0.6, 0.9]) P.point(v3(s * (c.sw + u * c.prod), py - c.sweep * Math.pow(u, 1.8), 0.01), v3(0, 0, 1), 0.02);
  P.point(v3(0, butt + 0.08, c.sw * 1.3), v3(0, 0, 1), 0.03);
  P.anchors.face = { p: v3(0, butt + 0.1, c.sw * 1.35), n: v3(0, 0, 1), s: 0.025 };
  P.anchors.grip = { a: v3(0, -0.06, -c.sw), b: v3(0, 0.04, -c.sw) };
  dressGems(P, [
    { p: v3(0, py, c.sw * 1.25), n: v3(0, 0, 1), s: 0.018 },
    { p: v3(c.sw * 1.45, butt + 0.08, 0), n: v3(1, 0, 0), s: 0.016 },
    { p: v3(-c.sw * 1.45, butt + 0.08, 0), n: v3(-1, 0, 0), s: 0.016 },
  ]);
}
