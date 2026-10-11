/**
 * SLAY — armour as it lies on the ground and in the inventory: helms, body
 * armour, gloves, boots and belts.
 *
 * Worn armour is drawn by the hero code from the same `ItemLook`; these are
 * the loose pieces. Each base has its own build: a Cap with stitched seams
 * and ear flaps, a Great Helm with a cross of breaths, a Kraken Shell of
 * spiral plates, Ogre Gauntlets with knuckle spikes, Striders of the Gale
 * with wings at the ankles.
 *
 * Every piece is centred near the origin, front toward +Z, up toward +Y.
 */
import * as THREE from 'three';
import type { Parts, Slot } from './Parts';
import { box, cone, curve, cyl, horn, lathe, loft, rough, slab, sphere, spike, torus, tube, v3, type V3 } from './Geo';
import { aim, cutOf, dressGems, runes, skull, smooth, type V2 } from './Kit';

const PI = Math.PI;

function glowing(P: Parts): boolean {
  const L = P.look;
  return L.hasRunes || (L.glow > 0 && L.rarityTier >= 1) || !!L.design;
}

/** An elliptical ring of points at height y. */
function ring(y: number, rx: number, rz: number, n: number, zOff = 0, mod?: (a: number) => number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    const k = mod ? mod(a) : 1;
    out.push(v3(Math.sin(a) * rx * k, y, Math.cos(a) * rz * k + zOff));
  }
  return out;
}

/** The point on an ellipse (rx, rz) at angle a (0 = front, +Z). */
function onRing(a: number, rx: number, rz: number, y: number): V3 {
  return v3(Math.sin(a) * rx, y, Math.cos(a) * rz);
}

// ===========================================================================
// HELMS
// ===========================================================================

type HelmKind = 'cap' | 'skullcap' | 'casque' | 'nasal' | 'full' | 'great' | 'bone' | 'grim' | 'spired' | 'circlet' | 'coronet' | 'diadem' | 'corona';

const HELM_CUTS: Record<string, { kind: HelmKind }> = {
  'helm.cap': { kind: 'cap' },
  'helm.skullcap': { kind: 'skullcap' },
  'helm.casque': { kind: 'casque' },
  'helm.helm': { kind: 'nasal' },
  'helm.full': { kind: 'full' },
  'helm.great': { kind: 'great' },
  'helm.bone': { kind: 'bone' },
  'helm.grim': { kind: 'grim' },
  'helm.spired': { kind: 'spired' },
  'helm.circlet': { kind: 'circlet' },
  'helm.coronet': { kind: 'coronet' },
  'helm.diadem': { kind: 'diadem' },
  'helm.corona': { kind: 'corona' },
};

const HELM_BY_SHAPE: Record<string, string> = {
  helm: 'helm.helm',
  'helm.cap': 'helm.cap',
  'helm.full': 'helm.full',
  'helm.horned': 'helm.grim',
  'helm.circlet': 'helm.circlet',
  hood: 'helm.cap',
  crown: 'helm.coronet',
};

/** A dome from the brim (y0) up, radius r, `peak` stretches the crown. */
function dome(r: number, y0: number, peak = 1, sx = 1, sz = 1.1, seg = 18, smoothSh = true): THREE.BufferGeometry {
  const prof: V2[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * PI * 0.5;
    prof.push([Math.cos(a) * r, y0 + Math.sin(a) * r * peak]);
  }
  prof[prof.length - 1] = [0.001, y0 + r * peak];
  return lathe(prof, seg, { sx, sz, smooth: smoothSh });
}

export function buildHelm(P: Parts): void {
  const L = P.look;
  const c = cutOf(HELM_CUTS, HELM_BY_SHAPE, L, 'helm.helm');
  const main: Slot = L.material === 'bone' ? 'bone' : 'main';
  const r = 0.11;
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  let face = v3(0, 0.03, r * 1.12);
  let top = r;
  const brow = (slot: Slot, h = 0.022, y = 0.01) => P.add(slot, lathe([[r * 1.0, y - h / 2], [r * 1.06, y], [r * 1.0, y + h / 2]], 20, { sz: 1.1 }));
  switch (c.kind) {
    case 'cap': {
      P.add(main, dome(r, 0, 0.95));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        const pts: V3[] = [];
        for (let k = 0; k <= 8; k++) {
          const t = (k / 8) * PI * 0.5;
          pts.push(v3(Math.sin(a) * Math.cos(t) * r * 1.01, Math.sin(t) * r * 0.96, Math.cos(a) * Math.cos(t) * r * 1.11));
        }
        P.add('second', tube(pts, 0.0025, 4));
      }
      P.add('second', torus(r * 1.02, 0.008, 5, 22), { p: [0, 0.004, 0], r: [PI / 2, 0, 0], s: [1, 1.1, 1] });
      for (const s of [-1, 1]) P.add(main, slab([[-0.03, 0], [0.03, 0], [0.025, -0.06], [0, -0.07], [-0.025, -0.06]], 0.006), { p: [s * r * 1.0, 0.004, 0], r: [0, s * PI / 2, 0] });
      top = r * 0.95;
      break;
    }
    case 'skullcap':
      P.add(main, dome(r, 0, 0.9));
      brow('dark', 0.026, 0.012);
      for (let i = 0; i < 12; i++) {
        const p = onRing((i / 12) * PI * 2, r * 1.055, r * 1.16, 0.012);
        P.add('dark', sphere(0.004, 5, 4), { p: [p.x, p.y, p.z] });
      }
      top = r * 0.9;
      break;
    case 'casque': {
      P.add(main, dome(r, -0.02, 1.0));
      P.add(main, slab([[-r * 1.1, 0], [-r * 0.6, r * 0.7], [0, r * 0.95], [r * 0.6, r * 0.75], [r * 1.15, r * 0.05]], 0.008), { p: [0, r * 0.25, 0], r: [0, PI / 2, 0] });
      P.add(main, box(0.014, 0.06, 0.008, 0.003), { p: [0, -0.03, r * 1.12] });
      for (const s of [-1, 1]) P.add(main, slab([[0, 0], [0.05, 0.0], [0.045, -0.07], [0.01, -0.08]], 0.005), { p: [s * r * 0.95, -0.01, r * 0.35], r: [0, s * (PI / 2 - 0.5), 0], s: [s, 1, 1] });
      brow('trim', 0.016, -0.015);
      top = r * 1.2;
      break;
    }
    case 'nasal': {
      P.add(main, lathe([[r, -0.02], [r * 0.98, 0.04], [r * 0.75, r * 0.85], [r * 0.3, r * 1.25], [0.001, r * 1.38]], 16, { sz: 1.1, smooth: false }));
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2;
        const pts = [onRing(a, r * 1.01, r * 1.12, -0.02), onRing(a, r * 0.99, r * 1.09, 0.04), onRing(a, r * 0.77, r * 0.85, r * 0.85), onRing(a, r * 0.32, r * 0.35, r * 1.24)];
        P.add('dark', tube(curve(pts, 10), 0.005, 4, { flat: 0.4 }));
      }
      brow('dark', 0.024, -0.01);
      P.add('main', box(0.018, 0.075, 0.008, 0.003), { p: [0, -0.045, r * 1.13] });
      top = r * 1.38;
      break;
    }
    case 'full': {
      P.add(main, dome(r, 0, 1.0));
      P.add(main, lathe([[r * 0.98, -0.11], [r * 1.02, -0.06], [r, 0.001]], 18, { sz: 1.1 }));
      P.add('dark', box(r * 1.2, 0.012, 0.02), { p: [0, 0.0, r * 1.06] });
      P.add(main, lathe([[r * 1.01, -0.006], [r * 1.07, 0.004], [r * 1.01, 0.014]], 18, { sz: 1.12 }));
      for (let i = 0; i < 6; i++) for (const s of [-1, 1]) P.add('dark', sphere(0.0035, 4, 3), { p: [s * (0.015 + (i % 3) * 0.012), -0.04 - Math.floor(i / 3) * 0.014, r * 1.07] });
      P.add(main, slab([[-r * 0.9, 0], [0, r * 0.15], [r * 0.9, 0], [0, -r * 0.02]], 0.01), { p: [0, r * 0.9, 0], r: [0, PI / 2, 0] });
      face = v3(0, 0.05, r * 1.06);
      top = r * 1.05;
      break;
    }
    case 'great': {
      P.add(main, lathe([[r * 1.02, -0.12], [r * 1.05, 0], [r * 1.0, r * 0.9], [0.001, r * 0.92]], 16, { sz: 1.05 }));
      P.add('dark', box(r * 1.5, 0.012, 0.02), { p: [0, 0.03, r * 1.04] });
      P.add('dark', box(0.012, 0.11, 0.02), { p: [0, -0.02, r * 1.07] });
      for (let i = 0; i < 10; i++) {
        const a = -0.9 + (i % 5) * 0.2;
        P.add('dark', sphere(0.003, 4, 3), { p: [Math.sin(a + (i < 5 ? 0 : 0.1)) * r * 1.05, -0.05 - (i < 5 ? 0 : 0.016), Math.cos(a) * r * 1.03 + 0.001] });
      }
      P.add('trim', box(0.016, r * 1.0, 0.01, 0.003), { p: [0, r * 0.45, r * 1.05] });
      P.add('trim', torus(r * 1.03, 0.006, 4, 20), { p: [0, r * 0.88, 0], r: [PI / 2, 0, 0], s: [1, 1.05, 1] });
      face = v3(0, 0.07, r * 1.08);
      top = r * 0.92;
      break;
    }
    case 'bone':
    case 'grim': {
      // A skull worn as a helm.
      const g = sphere(r * 1.05, 16, 12);
      g.scale(0.95, 0.9, 1.1);
      P.add('bone', g, { p: [0, 0.02, 0] });
      P.add('bone', box(r * 1.5, 0.03, 0.04, 0.012), { p: [0, 0.01, r * 1.0] });
      for (const s of [-1, 1]) P.add('dark', sphere(r * 0.24, 8, 6), { p: [s * r * 0.36, -0.02, r * 0.98] });
      P.add('dark', cone(r * 0.12, r * 0.25, 3), { p: [0, -0.06, r * 1.08], r: [PI, 0, 0] });
      for (let i = 0; i < 6; i++) P.add('bone', box(0.012, 0.02, 0.01, 0.003), { p: [(i - 2.5) * 0.015, -0.1, r * 0.98] });
      if (c.kind === 'grim') {
        // Ram horns, a cracked jaw with fangs and a dark brow plate.
        for (const s of [-1, 1]) P.add('bone', horn(0.2, 0.024, 2.6, 8, 0.25), { p: [s * r * 0.72, r * 0.45, -0.01], r: [0, 0, -s * 0.9], s: [s, 1, 1] });
        P.add('bone', box(r * 1.1, 0.03, r * 0.9, 0.01), { p: [0, -0.12, r * 0.45], r: [0.25, 0, 0] });
        for (const s of [-1, 1]) P.add('bone', cone(0.008, 0.04, 4), { p: [s * r * 0.4, -0.1, r * 0.92], r: [PI, 0, 0] });
        P.add('dark', box(r * 1.6, 0.012, 0.03, 0.004), { p: [0, 0.035, r * 1.02], r: [0.2, 0, 0] });
      } else {
        for (let i = 0; i < 5; i++) P.add('bone', spike(0.04, 0.008, 4), { p: [0, r * 0.95 - i * 0.004, r * 0.6 - i * 0.05], r: [-0.4 - i * 0.2, 0, 0] });
      }
      face = v3(0, r * 0.7, r * 0.85);
      top = r;
      break;
    }
    case 'spired': {
      P.add(main, dome(r, -0.02, 1.0, 1, 1.1, 14, false));
      P.add(main, lathe([[r * 0.98, -0.12], [r * 1.02, -0.06], [r, 0.001]], 14, { sz: 1.1, smooth: false }));
      P.add('dark', box(r * 1.1, 0.01, 0.02), { p: [0, -0.01, r * 1.06] });
      for (let i = 0; i < 7; i++) {
        const a = -PI * 0.75 + (i / 6) * PI * 1.5;
        const p = onRing(a, r * 0.8, r * 0.88, r * 0.55);
        P.add(main, spike(0.09 + (i === 3 ? 0.07 : 0), 0.012, 4), aim(p, v3(Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3)));
      }
      face = v3(0, 0.02, r * 1.07);
      top = r * 1.6;
      break;
    }
    case 'circlet':
    case 'coronet':
    case 'diadem': {
      const slot: Slot = 'main';
      P.add(slot, lathe([[r * 0.98, -0.012], [r * 1.02, 0], [r * 0.98, 0.012]], 28, { sz: 1.1 }));
      if (c.kind === 'circlet') {
        P.add(slot, slab([[-0.02, 0], [0, 0.025], [0.02, 0]], 0.004), { p: [0, 0.008, r * 1.1] });
        face = v3(0, 0.014, r * 1.11);
        top = 0.04;
      } else if (c.kind === 'coronet') {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * PI * 2;
          const p = onRing(a, r * 1.0, r * 1.1, 0.01);
          P.add(slot, cone(0.009, i % 2 ? 0.03 : 0.045, 4), aim(p.clone().add(v3(0, 0.012, 0)), v3(0, 1, 0), [1, 1, 0.4], -a));
          if (i % 2 === 0) P.add('trim', sphere(0.004, 5, 4), { p: [p.x * 1.0, p.y + 0.05, p.z] });
        }
        face = v3(0, 0.005, r * 1.11);
        top = 0.06;
      } else {
        P.add(slot, slab([[-0.05, 0], [-0.03, 0.04], [0, 0.07], [0.03, 0.04], [0.05, 0]], 0.005), { p: [0, 0.006, r * 1.1] });
        for (const s of [-1, 1]) P.add(slot, slab([[0, 0], [0.04, 0.02], [0.06, 0.05], [0.03, 0.035], [0, 0.015]], 0.004), { p: [s * r * 0.75, 0.01, r * 0.85], r: [0, s * 0.8, 0], s: [s, 1, 1] });
        face = v3(0, 0.035, r * 1.13);
        top = 0.08;
      }
      break;
    }
    case 'corona': {
      P.add(main, dome(r, 0, 1.0));
      P.add(main, lathe([[r * 0.98, -0.11], [r * 1.02, -0.06], [r, 0.001]], 18, { sz: 1.1 }));
      P.add('dark', box(r * 1.15, 0.01, 0.02), { p: [0, 0.0, r * 1.06] });
      for (let i = 0; i < 13; i++) {
        const a = -PI * 0.55 + (i / 12) * PI * 1.1;
        const len = i % 2 ? 0.07 : 0.11;
        P.add('trim', cone(0.008, len, 4), aim(v3(Math.sin(a) * r * 1.05, r * 0.4 + Math.cos(a) * r * 0.85, -0.04), v3(Math.sin(a), Math.cos(a), -0.2), [1, 1, 0.4]));
      }
      P.add('glow', torus(r * 1.3, 0.004, 3, 32, PI * 1.2), { p: [0, r * 0.4, -0.05], r: [0, 0, -PI * 0.1] });
      face = v3(0, 0.05, r * 1.06);
      top = r * 1.6;
      break;
    }
  }
  if (L.hasTrim && !['circlet', 'coronet', 'diadem', 'bone', 'grim'].includes(c.kind)) brow('trim', 0.01, c.kind === 'full' || c.kind === 'great' || c.kind === 'spired' || c.kind === 'corona' ? -0.1 : -0.012);
  if (glowing(P) && !['circlet', 'coronet', 'diadem'].includes(c.kind)) {
    for (let i = 0; i < 5; i++) {
      const a = -0.8 + i * 0.4;
      const p = onRing(a, r * 1.04, r * 1.14, r * 0.45);
      P.add('glow', box(0.006, 0.014, 0.002), aim(p, v3(0, 1, 0), 1, a));
    }
  }
  P.anchors.head = { p: v3(0, top * 0.6, 0), r };
  P.anchors.axis = { a: v3(0, 0, 0), b: v3(0, top, 0), r };
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2;
    const p = onRing(a, r, r * 1.1, r * 0.4);
    P.point(p, v3(Math.sin(a), 0.4, Math.cos(a)), r * 0.25);
  }
  P.anchors.face = { p: face, n: v3(0, 0, 1), s: 0.022 };
  spots.push({ p: face.clone(), n: v3(0, 0, 1), s: 0.02 });
  for (const s of [-1, 1]) spots.push({ p: onRing(s * 0.7, r * 1.03, r * 1.12, 0.01), n: v3(s * 0.7, 0, 0.7), s: 0.014 });
  dressGems(P, spots);
}

// ===========================================================================
// BODY ARMOUR
// ===========================================================================

type ChestKind = 'quilted' | 'ghost' | 'dusk' | 'leather' | 'studded' | 'wyrmhide' | 'ringmail' | 'chainmail' | 'boneweave' | 'scale' | 'splint' | 'kraken' | 'plate' | 'gothic' | 'sacred' | 'archon' | 'aeons';

const CHEST_CUTS: Record<string, { kind: ChestKind }> = {
  'chest.quilted': { kind: 'quilted' },
  'chest.ghost': { kind: 'ghost' },
  'chest.dusk': { kind: 'dusk' },
  'chest.leather': { kind: 'leather' },
  'chest.studded': { kind: 'studded' },
  'chest.wyrmhide': { kind: 'wyrmhide' },
  'chest.ringmail': { kind: 'ringmail' },
  'chest.chainmail': { kind: 'chainmail' },
  'chest.boneweave': { kind: 'boneweave' },
  'chest.scale': { kind: 'scale' },
  'chest.splint': { kind: 'splint' },
  'chest.kraken': { kind: 'kraken' },
  'chest.plate': { kind: 'plate' },
  'chest.gothic': { kind: 'gothic' },
  'chest.sacred': { kind: 'sacred' },
  'chest.archon': { kind: 'archon' },
  'chest.aeonshroud': { kind: 'aeons' },
};

const CHEST_BY_SHAPE: Record<string, string> = {
  chest: 'chest.leather',
  'chest.robe': 'chest.quilted',
  'chest.leather': 'chest.leather',
  'chest.mail': 'chest.ringmail',
  'chest.scale': 'chest.scale',
  'chest.plate': 'chest.plate',
  robe: 'chest.quilted',
  armor: 'chest.leather',
  armour: 'chest.leather',
};

/** Torso half width and depth at height t (0 hips .. 1 shoulders). */
function torsoK(t: number): number {
  if (t < 0.3) return 0.86 - 0.08 * (t / 0.3);
  if (t < 0.75) return 0.78 + 0.22 * smooth(0.3, 0.75, t);
  return 1 - 0.08 * smooth(0.75, 1, t);
}

interface TorsoOpts {
  /** Extra length below the hips (robes, mail skirts), metres. */
  skirt?: number;
  flare?: number;
  /** Faceted (plate) or smooth. */
  faceted?: boolean;
  /** Ripples: horizontal quilting or mail rows. */
  rows?: number;
  rowDepth?: number;
  /** Flutes: vertical ridges. */
  flutes?: number;
}

const TW = 0.17;
const TD = 0.11;
const TH = 0.36;
const T0 = -0.18;

/** The torso shell as rings lofted from the hem to the neck. */
function torso(P: Parts, slot: Slot, o: TorsoOpts = {}): void {
  const n = o.faceted ? 12 : 22;
  const rings: V3[][] = [];
  const skirt = o.skirt ?? 0;
  const steps = 16 + Math.round(skirt * 30);
  const yBot = T0 - skirt;
  for (let i = 0; i <= steps; i++) {
    const y = yBot + (i / steps) * (TH + skirt);
    const t = (y - T0) / TH;
    let k = t >= 0 ? torsoK(t) : 0.86 + (o.flare ?? 0.15) * Math.min(1, -t * TH / Math.max(skirt, 0.01));
    if (o.rows) k *= 1 + (o.rowDepth ?? 0.015) * Math.abs(Math.sin(((y - yBot) / (TH + skirt)) * PI * o.rows));
    const shoulder = t > 0.85 ? 1 - smooth(0.85, 1, t) * 0.35 : 1;
    rings.push(ring(y, TW * k, TD * k * shoulder, n, 0, o.flutes ? (a) => 1 + 0.035 * Math.pow(Math.abs(Math.cos(a * o.flutes! * 0.5)), 4) * (Math.cos(a) > 0 ? 1 : 0) : undefined));
  }
  // Close the top round a neck hole by pulling the last ring in.
  rings.push(ring(T0 + TH + 0.02, TW * 0.42, TD * 0.55, n));
  P.add(slot, loft(rings, { capA: true, capB: true, smooth: !o.faceted }));
  // A dark neck opening.
  P.add('dark', cyl(TW * 0.38, TW * 0.38, 0.004, 16), { p: [0, T0 + TH + 0.021, 0], s: [1, 1, TD / TW * 1.2] });
}

/** Shoulder pieces or sleeves on both sides. */
function arms(P: Parts, slot: Slot, kind: 'sleeve' | 'long' | 'cap' | 'pauldron' | 'spiked' | 'layered' | 'shell', size = 1): void {
  for (const s of [-1, 1]) {
    const sh = v3(s * TW * 0.95, T0 + TH * 0.9, 0);
    switch (kind) {
      case 'sleeve':
      case 'long': {
        const len = kind === 'long' ? 0.3 : 0.12;
        const end = sh.clone().add(v3(s * len * 0.55, -len * 0.85, 0));
        P.add(slot, tube([sh.clone().add(v3(-s * 0.02, 0, 0)), end], (t) => (kind === 'long' ? 0.045 + t * 0.03 : 0.042), 10));
        break;
      }
      case 'cap':
        P.add(slot, sphere(0.05 * size, 12, 8), { p: [sh.x, sh.y, sh.z], s: [1, 0.7, 1] });
        break;
      case 'pauldron':
      case 'spiked':
      case 'layered': {
        const g = sphere(0.07 * size, 14, 10);
        g.scale(1, 0.75, 1.05);
        P.add(slot, g, { p: [sh.x + s * 0.01, sh.y + 0.005, 0], r: [0, 0, -s * 0.35] });
        if (kind === 'layered') for (let k = 1; k <= 2; k++) P.add(slot, torus(0.065 * size, 0.008, 4, 14, PI), { p: [sh.x + s * (0.02 + k * 0.012), sh.y - k * 0.022, 0], r: [PI / 2, 0, s > 0 ? -0.6 : PI + 0.6] });
        if (kind === 'spiked') for (let k = 0; k < 3; k++) P.add(slot, spike(0.06, 0.01, 4), aim(v3(sh.x + s * 0.03, sh.y + 0.03, (k - 1) * 0.04), v3(s * 0.6, 1, (k - 1) * 0.4)));
        break;
      }
      case 'shell': {
        const pts: V3[] = [];
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          const a = t * PI * 3;
          const rr = 0.05 * (1 - t * 0.7);
          pts.push(v3(sh.x + s * (0.02 + Math.cos(a) * rr), sh.y + Math.sin(a) * rr, (t - 0.5) * 0.06));
        }
        P.add(slot, tube(pts, (t) => 0.03 * (1 - t * 0.8), 8));
        break;
      }
    }
  }
}

/** Points on the torso's front for decorations: (u across -1..1, t up 0..1). */
function torsoAt(u: number, t: number, lift = 0): { p: V3; n: V3 } {
  const k = torsoK(t);
  const a = u * PI * 0.42;
  const n = v3(Math.sin(a) / TW, 0, Math.cos(a) / TD).normalize();
  const p = v3(Math.sin(a) * TW * k, T0 + t * TH, Math.cos(a) * TD * k).addScaledVector(n, lift);
  return { p, n };
}

export function buildChest(P: Parts): void {
  const L = P.look;
  const c = cutOf(CHEST_CUTS, CHEST_BY_SHAPE, L, 'chest.leather');
  const main: Slot = L.material === 'bone' ? 'bone' : 'main';
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  let face = torsoAt(0, 0.66, 0.01);
  const belt = (slot: Slot, y = T0 + 0.05, h = 0.03) => P.add(slot, lathe([[TW * 0.82, y - h / 2], [TW * 0.86, y], [TW * 0.82, y + h / 2]], 20, { sz: TD / TW }));
  const studs = (slot: Slot, rows: number, cols: number, s = 0.005, t0 = 0.15, t1 = 0.8) => {
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const { p } = torsoAt(-0.85 + (k / (cols - 1)) * 1.7, t0 + (r / Math.max(1, rows - 1)) * (t1 - t0), 0.002);
        P.add(slot, sphere(s, 5, 4), { p: [p.x, p.y, p.z] });
      }
    }
  };
  switch (c.kind) {
    case 'quilted':
      torso(P, main, { rows: 9, rowDepth: 0.03 });
      arms(P, main, 'sleeve');
      P.add(main, torus(TW * 0.42, 0.012, 6, 18), { p: [0, T0 + TH + 0.015, 0], r: [PI / 2, 0, 0], s: [1, TD / TW * 1.3, 1] });
      break;
    case 'ghost':
    case 'dusk':
    case 'aeons': {
      torso(P, main, { skirt: 0.22, flare: 0.35 });
      arms(P, main, 'long');
      P.add('second', lathe([[TW * 0.8, T0 + 0.04], [TW * 0.84, T0 + 0.06], [TW * 0.8, T0 + 0.08]], 20, { sz: TD / TW }));
      if (c.kind === 'dusk') {
        // The hood, up.
        const g = sphere(0.1, 16, 12, );
        g.scale(1, 1.15, 1.1);
        P.add(main, g, { p: [0, T0 + TH + 0.07, -0.02] });
        P.add('dark', sphere(0.075, 12, 8), { p: [0, T0 + TH + 0.06, 0.03], s: [0.9, 1.1, 0.8] });
        face = torsoAt(0, 0.5, 0.01);
      } else if (c.kind === 'ghost') {
        P.add(main, torus(0.09, 0.03, 8, 20), { p: [0, T0 + TH + 0.01, -0.04], r: [PI / 2 + 0.5, 0, 0] });
        P.add('ghost', sphere(0.2, 14, 10), { p: [0, 0, 0], s: [1.1, 1.3, 0.8] });
      } else {
        for (const [i, tilt] of [0.4, -0.5, 0.1].entries()) P.add('glow', torus(0.26 + i * 0.03, 0.003, 3, 40), { p: [0, -0.05 + i * 0.12, 0], r: [PI / 2 + tilt, 0, 0] });
      }
      break;
    }
    case 'leather':
    case 'studded':
    case 'wyrmhide': {
      torso(P, main);
      arms(P, main, 'cap', 0.9);
      for (const s of [-1, 1]) {
        const a = torsoAt(s * 0.5, 0.98, 0.003).p;
        const b = torsoAt(-s * 0.4, 0.15, 0.003).p;
        if (c.kind === 'leather') P.add('second', tube(curve([a, torsoAt(0, 0.55, 0.006).p, b], 12), 0.007, 4, { flat: 0.35 }));
      }
      belt('second');
      P.add('trim', box(0.03, 0.026, 0.008, 0.003), { p: [0, T0 + 0.05, TD * 0.88] });
      if (c.kind === 'studded') studs('trim', 6, 7, 0.0055);
      if (c.kind === 'wyrmhide') {
        for (let r = 0; r < 7; r++) {
          for (let k = 0; k < 6; k++) {
            const { p, n } = torsoAt(-0.8 + (k / 5) * 1.6 + (r % 2) * 0.12, 0.12 + r * 0.11, 0.001);
            P.add(main, sphere(0.018, 6, 4), aim(p, n, [1, 0.35, 1.2]));
          }
        }
        for (const s of [-1, 1]) for (let k = 0; k < 3; k++) P.add('bone', horn(0.06, 0.01, 0.8, 5), { p: [s * TW * 0.95, T0 + TH * 0.95, (k - 1) * 0.035], r: [0, 0, -s * 0.3], s: [s, 1, 1] });
      }
      break;
    }
    case 'ringmail':
    case 'chainmail':
    case 'boneweave': {
      const longer = c.kind !== 'ringmail';
      torso(P, main, { rows: longer ? 26 : 18, rowDepth: 0.012, skirt: longer ? 0.08 : 0.02, flare: 0.12 });
      arms(P, main, longer ? 'long' : 'sleeve');
      belt('second');
      if (c.kind === 'chainmail') P.add(main, torus(0.07, 0.03, 8, 18), { p: [0, T0 + TH + 0.03, -0.01], r: [PI / 2, 0, 0], s: [1.4, 1, 1] });
      if (c.kind === 'ringmail') {
        // Big iron rings sewn on a leather coat, in staggered rows.
        for (let row = 0; row < 6; row++) {
          for (let k = 0; k < 7; k++) {
            const u = -0.9 + (k + (row % 2) * 0.5) * 0.27;
            if (u > 0.95) continue;
            const at = torsoAt(u, 0.18 + row * 0.11, 0.004);
            P.add('trim', torus(0.012, 0.003, 4, 10), aim(at.p, at.n));
          }
        }
      }
      if (c.kind === 'boneweave') {
        for (let i = 0; i < 5; i++) {
          const t = 0.42 + i * 0.1;
          for (const s of [-1, 1]) P.add('bone', tube(curve([torsoAt(s * 0.05, t, 0.008).p, torsoAt(s * 0.45, t - 0.04, 0.008).p, torsoAt(s * 0.85, t - 0.1, 0.004).p], 8), 0.007, 5));
        }
        P.add('bone', box(0.022, TH * 0.5, 0.012, 0.005), { p: [0, T0 + TH * 0.65, TD * 1.02] });
      }
      break;
    }
    case 'scale': {
      torso(P, main);
      for (let r = 0; r < 9; r++) {
        for (let k = 0; k < 9; k++) {
          const { p, n } = torsoAt(-0.92 + (k / 8) * 1.84 + (r % 2) * 0.1, 0.08 + r * 0.1, 0.002);
          P.add(main, slab([[-0.014, 0.008], [0.014, 0.008], [0.012, -0.012], [0, -0.022], [-0.012, -0.012]], 0.003), aim(p, v3(0, 1, 0), 1, Math.atan2(n.x, n.z)));
        }
      }
      arms(P, main, 'cap');
      belt('second');
      break;
    }
    case 'splint': {
      torso(P, 'second');
      for (let k = 0; k < 13; k++) {
        const u = -0.95 + (k / 12) * 1.9;
        const { p, n } = torsoAt(u, 0.45, 0.004);
        P.add(main, box(0.018, TH * 0.75, 0.006, 0.003), aim(p, v3(0, 1, 0), 1, Math.atan2(n.x, n.z)));
      }
      for (const t of [0.15, 0.75]) belt('dark', T0 + t * TH, 0.016);
      arms(P, main, 'layered', 0.85);
      break;
    }
    case 'kraken': {
      // Banded shell plates and spiral shells on the shoulders.
      torso(P, main, { rows: 6, rowDepth: 0.05, faceted: false });
      arms(P, main, 'shell');
      for (let i = 0; i < 4; i++) {
        const s = i % 2 ? 1 : -1;
        const a = torsoAt(s * 0.7, 0.05).p;
        P.add('bone', tube(curve([a, a.clone().add(v3(s * 0.02, -0.06, 0.02)), a.clone().add(v3(s * 0.05, -0.09, -0.01)), a.clone().add(v3(s * 0.04, -0.12, 0.02))], 10), (t) => 0.012 * (1 - t) + 0.002, 6));
      }
      break;
    }
    case 'plate':
    case 'gothic':
    case 'sacred':
    case 'archon': {
      const archon = c.kind === 'archon';
      torso(P, main, { faceted: archon, flutes: c.kind === 'gothic' ? 9 : undefined });
      // The ridge down the breastplate and the lames of the fauld.
      P.add(main, tube(curve([torsoAt(0, 0.95, 0.002).p, torsoAt(0, 0.6, 0.012).p, torsoAt(0, 0.25, 0.004).p], 12), 0.006, 5));
      for (let i = 0; i < 3; i++) P.add(main, lathe([[TW * (0.9 + i * 0.03), T0 - 0.01 - i * 0.03], [TW * (0.95 + i * 0.03), T0 - 0.02 - i * 0.03], [TW * (0.93 + i * 0.03), T0 - 0.04 - i * 0.03]], archon ? 12 : 22, { sz: TD / TW }));
      arms(P, main, c.kind === 'gothic' ? 'spiked' : c.kind === 'sacred' ? 'layered' : 'pauldron', c.kind === 'sacred' ? 1.15 : 1);
      if (c.kind === 'sacred') {
        const p = torsoAt(0, 0.66, 0.01).p;
        P.add('gold', cyl(0.03, 0.03, 0.006, 16), { p: [p.x, p.y, p.z], r: [PI / 2, 0, 0] });
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * PI * 2;
          P.add('gold', cone(0.006, i % 2 ? 0.02 : 0.032, 4), aim(p.clone().add(v3(Math.cos(a) * 0.04, Math.sin(a) * 0.04, 0)), v3(Math.cos(a), Math.sin(a), 0), [1, 1, 0.3]));
        }
        face = { p: p.clone().add(v3(0, 0, 0.004)), n: v3(0, 0, 1) };
      }
      if (archon) {
        const p = torsoAt(0, 0.66, 0.006).p;
        P.add('glow', new THREE.OctahedronGeometry(0.022, 0), { p: [p.x, p.y, p.z], s: [1, 1.3, 0.5] });
        P.add(main, lathe([[TW * 0.5, T0 + TH], [TW * 0.55, T0 + TH + 0.05], [TW * 0.45, T0 + TH + 0.06]], 8, { sz: 1.3, smooth: false }));
        face = { p: p.clone().add(v3(0, 0, 0.012)), n: v3(0, 0, 1) };
      }
      if (L.hasTrim) for (const s of [-1, 1]) P.add('trim', tube(curve([torsoAt(s * 0.35, 0.98, 0.003).p, torsoAt(s * 0.5, 0.7, 0.006).p, torsoAt(s * 0.3, 0.3, 0.004).p], 10), 0.004, 4));
      break;
    }
  }
  if (glowing(P)) {
    for (let i = 0; i < 5; i++) {
      const { p, n } = torsoAt(-0.5 + i * 0.25, 0.3, 0.003);
      P.add('glow', box(0.008, 0.016, 0.002), aim(p, v3(0, 1, 0), 1, Math.atan2(n.x, n.z)));
    }
  }
  if (L.hasTrim && !['plate', 'gothic', 'sacred', 'archon'].includes(c.kind)) P.add('trim', torus(TW * 0.43, 0.005, 4, 20), { p: [0, T0 + TH + 0.02, 0], r: [PI / 2, 0, 0], s: [1, TD / TW * 1.3, 1] });
  P.anchors.head = { p: v3(0, T0 + TH * 0.6, 0), r: TW };
  P.anchors.axis = { a: v3(0, T0, 0), b: v3(0, T0 + TH, 0), r: TW };
  for (let i = 0; i < 10; i++) {
    const { p, n } = torsoAt(-0.8 + (i % 5) * 0.4, i < 5 ? 0.35 : 0.75, 0.002);
    P.point(p, n, 0.03);
  }
  P.anchors.face = { p: face.p, n: face.n, s: 0.035 };
  spots.push({ p: face.p.clone(), n: face.n.clone(), s: 0.03 });
  for (const s of [-1, 1]) spots.push({ p: torsoAt(s * 0.45, 0.8, 0.004).p, n: torsoAt(s * 0.45, 0.8).n, s: 0.018 });
  dressGems(P, spots);
}

// ===========================================================================
// GLOVES
// ===========================================================================

type GloveKind = 'leather' | 'heavy' | 'bramble' | 'gauntlets' | 'war' | 'ogre' | 'silk' | 'vampirebone' | 'sorcerer' | 'eclipse';

const GLOVE_CUTS: Record<string, { kind: GloveKind }> = {
  'gloves.leather': { kind: 'leather' },
  'gloves.heavy': { kind: 'heavy' },
  'gloves.bramble': { kind: 'bramble' },
  'gloves.gauntlets': { kind: 'gauntlets' },
  'gloves.war': { kind: 'war' },
  'gloves.ogre': { kind: 'ogre' },
  'gloves.silk': { kind: 'silk' },
  'gloves.vampirebone': { kind: 'vampirebone' },
  'gloves.sorcerer': { kind: 'sorcerer' },
  'gloves.eclipse': { kind: 'eclipse' },
};

const GLOVE_BY_SHAPE: Record<string, string> = {
  gloves: 'gloves.leather',
  'gloves.light': 'gloves.leather',
  'gloves.plate': 'gloves.gauntlets',
  'gloves.silk': 'gloves.silk',
  glove: 'gloves.leather',
  gauntlet: 'gloves.gauntlets',
};

/** A hand, fingers up, back of the hand toward +Z. Returns the knuckle points. */
function hand(P: Parts, slot: Slot, k: number, plated: boolean, claws: Slot | null): V3[] {
  const pw = 0.044 * k;
  const pd = 0.018 * k;
  const ph = 0.05 * k;
  P.add(slot, plated ? box(pw * 2, ph * 2, pd * 2, pd * 0.6) : rough(box(pw * 2, ph * 2, pd * 2, pd * 0.9), 0.0008, 3, 80), { p: [0, 0, 0] });
  const knuckles: V3[] = [];
  const lens = [0.07, 0.08, 0.076, 0.06];
  for (let f = 0; f < 4; f++) {
    const x = (-0.75 + f * 0.5) * pw;
    const len = lens[f]! * k;
    const base = v3(x, ph * 0.9, 0);
    knuckles.push(base.clone().add(v3(0, 0, pd)));
    const curl = 0.25 + f * 0.05;
    const pts = [base, base.clone().add(v3(0, len * 0.45, len * 0.05)), base.clone().add(v3(0, len * 0.82, -len * curl * 0.3)), base.clone().add(v3(0, len, -len * curl * 0.7))];
    if (plated) {
      for (let s = 0; s < 3; s++) {
        const a = pts[s]!;
        const b = pts[s + 1]!;
        P.add(slot, box(pw * 0.42, a.distanceTo(b) * 1.05, pd * 1.3, 0.002), aim(a.clone().lerp(b, 0.5), b.clone().sub(a)));
      }
    } else {
      P.add(slot, tube(curve(pts, 8), (t) => pw * 0.2 * (1 - 0.15 * t), 7));
    }
    if (claws) P.add(claws, cone(pw * 0.14, len * 0.35, 4), aim(pts[3]!, pts[3]!.clone().sub(pts[2]!)));
  }
  // The thumb, out to the side and forward.
  const t0 = v3(pw * 0.95, -ph * 0.2, 0);
  const tp = [t0, t0.clone().add(v3(0.025 * k, 0.025 * k, 0.012 * k)), t0.clone().add(v3(0.035 * k, 0.055 * k, 0.018 * k))];
  if (plated) P.add(slot, box(pw * 0.45, 0.06 * k, pd * 1.4, 0.003), aim(tp[0]!.clone().lerp(tp[2]!, 0.5), tp[2]!.clone().sub(tp[0]!)));
  else P.add(slot, tube(curve(tp, 6), pw * 0.22, 7));
  if (claws) P.add(claws, cone(pw * 0.14, 0.02 * k, 4), aim(tp[2]!, tp[2]!.clone().sub(tp[1]!)));
  return knuckles;
}

/** A cuff from the wrist (y0) down `len`, flaring to `flare` times. */
function cuff(P: Parts, slot: Slot, y0: number, len: number, r: number, flare: number, faceted = false): void {
  P.add(slot, lathe([[r * 0.95, y0 + 0.006], [r, y0], [r * flare, y0 - len], [r * flare * 1.04, y0 - len - 0.004], [r * flare * 0.9, y0 - len - 0.004]], faceted ? 8 : 16, { sz: 0.6, smooth: !faceted }));
}

export function buildGloves(P: Parts): void {
  const L = P.look;
  const c = cutOf(GLOVE_CUTS, GLOVE_BY_SHAPE, L, 'gloves.leather');
  const main: Slot = L.material === 'bone' ? 'bone' : 'main';
  const plated = ['gauntlets', 'war', 'ogre', 'eclipse'].includes(c.kind);
  const k = c.kind === 'ogre' ? 1.3 : c.kind === 'heavy' || c.kind === 'war' ? 1.1 : 1;
  const claws: Slot | null = c.kind === 'vampirebone' || c.kind === 'eclipse' ? 'bone' : c.kind === 'bramble' ? 'leaf' : null;
  const knuckles = hand(P, c.kind === 'vampirebone' ? 'cloth' : main, k, plated, c.kind === 'eclipse' ? 'trim' : claws);
  const wy = -0.05 * k;
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  let face = v3(0, 0, 0.02 * k);
  switch (c.kind) {
    case 'leather':
      cuff(P, main, wy, 0.05, 0.05, 1.25);
      break;
    case 'heavy':
      cuff(P, main, wy, 0.07, 0.054, 1.3);
      P.add('second', box(0.1 * k, 0.014, 0.012, 0.004), { p: [0, 0.042 * k, 0.018 * k] });
      for (const y of [wy - 0.02, wy - 0.05]) P.add('second', torus(0.06, 0.004, 4, 16), { p: [0, y, 0], r: [PI / 2, 0, 0], s: [1, 0.6, 1] });
      break;
    case 'bramble':
      cuff(P, main, wy, 0.06, 0.05, 1.3);
      for (let i = 0; i < 9; i++) P.add('leaf', spike(0.014, 0.003, 4), aim(v3(-0.03 + (i % 3) * 0.03, -0.03 + Math.floor(i / 3) * 0.03, 0.019), v3(0.2, 0.4, 1)));
      P.add('leaf', tube(curve([v3(-0.04, -0.06, 0.02), v3(0.03, -0.02, 0.022), v3(-0.02, 0.02, 0.021), v3(0.04, 0.05, 0.02)], 14), 0.003, 4));
      break;
    case 'gauntlets':
    case 'war':
    case 'ogre':
    case 'eclipse': {
      cuff(P, main, wy, c.kind === 'ogre' ? 0.08 : 0.07, 0.055 * k, 1.45, c.kind === 'ogre');
      P.add(main, box(0.1 * k, 0.02 * k, 0.012, 0.004), { p: [0, 0.046 * k, 0.019 * k] });
      for (let i = 0; i < 3; i++) P.add(main, box(0.092 * k, 0.012, 0.01, 0.003), { p: [0, 0.03 * k - i * 0.022 * k, 0.021 * k], r: [0.1, 0, 0] });
      if (c.kind === 'war' || c.kind === 'ogre') for (const p of knuckles) P.add(main, spike(c.kind === 'ogre' ? 0.03 : 0.018, 0.006 * k, 4), aim(p.clone().add(v3(0, 0, 0.006)), v3(0, 0.3, 1)));
      if (c.kind === 'ogre') for (let i = 0; i < 6; i++) P.add('dark', sphere(0.005, 5, 4), { p: [-0.05 + (i % 3) * 0.05, wy - 0.02 - Math.floor(i / 3) * 0.04, 0.045] });
      if (c.kind === 'eclipse') {
        P.add('dark', cyl(0.022, 0.022, 0.004, 18), { p: [0, 0, 0.022], r: [PI / 2, 0, 0] });
        P.add('glow', torus(0.025, 0.002, 3, 24), { p: [0, 0, 0.022] });
        face = v3(0, 0, 0.026);
      }
      break;
    }
    case 'silk':
      cuff(P, main, wy, 0.12, 0.046, 1.15);
      P.add('trim', torus(0.053, 0.0025, 4, 16), { p: [0, wy - 0.12, 0], r: [PI / 2, 0, 0], s: [1, 0.6, 1] });
      break;
    case 'vampirebone': {
      cuff(P, 'cloth', wy, 0.1, 0.046, 1.15);
      for (const p of knuckles) P.add('bone', tube([p.clone().add(v3(0, -0.06, 0.002)), p.clone().add(v3(0, 0.005, 0.004))], 0.004, 5));
      P.add('bone', box(0.06, 0.03, 0.006, 0.003), { p: [0, -0.02, 0.02] });
      break;
    }
    case 'sorcerer': {
      cuff(P, main, wy, 0.1, 0.046, 1.1);
      const s: V3[] = [];
      for (let i = 0; i <= 50; i++) {
        const t = i / 50;
        const a = t * PI * 2 * 7;
        s.push(v3(Math.cos(a) * 0.05, wy - 0.1 + t * 0.15, Math.sin(a) * 0.026));
      }
      P.add('cloth', tube(s, 0.004, 4, { flat: 0.4 }));
      runes(P, -0.03, 0.03, 0.02, 0.021, L.signature, 3);
      break;
    }
  }
  if (L.hasTrim && !['silk'].includes(c.kind)) P.add('trim', torus(0.053 * k, 0.003, 4, 16), { p: [0, wy - 0.004, 0], r: [PI / 2, 0, 0], s: [1, 0.6, 1] });
  if (glowing(P) && c.kind !== 'sorcerer') P.add('glow', box(0.04, 0.003, 0.002), { p: [0, wy - 0.03, 0.035] });
  P.anchors.head = { p: v3(0, 0.02, 0), r: 0.06 * k };
  P.anchors.axis = { a: v3(0, wy - 0.06, 0), b: v3(0, 0.12 * k, 0), r: 0.04 };
  for (const p of knuckles) P.point(p.clone(), v3(0, 0, 1), 0.012);
  for (let i = 0; i < 4; i++) P.point(v3((i - 1.5) * 0.025, wy - 0.03, 0.04), v3(0, 0, 1), 0.012);
  P.anchors.face = { p: face, n: v3(0, 0, 1), s: 0.018 };
  spots.push({ p: face.clone(), n: v3(0, 0, 1), s: 0.016 });
  spots.push({ p: v3(0, wy - 0.035, 0.042), n: v3(0, 0, 1), s: 0.012 });
  dressGems(P, spots);
}

// ===========================================================================
// BOOTS
// ===========================================================================

type BootKind = 'boots' | 'heavy' | 'sharkskin' | 'greaves' | 'war' | 'myrmidon' | 'slippers' | 'scarabshell' | 'wyrmhide' | 'gale';

const BOOT_CUTS: Record<string, { kind: BootKind }> = {
  'boots.boots': { kind: 'boots' },
  'boots.heavy': { kind: 'heavy' },
  'boots.sharkskin': { kind: 'sharkskin' },
  'boots.greaves': { kind: 'greaves' },
  'boots.war': { kind: 'war' },
  'boots.myrmidon': { kind: 'myrmidon' },
  'boots.slippers': { kind: 'slippers' },
  'boots.scarabshell': { kind: 'scarabshell' },
  'boots.wyrmhide': { kind: 'wyrmhide' },
  'boots.gale': { kind: 'gale' },
};

const BOOT_BY_SHAPE: Record<string, string> = {
  boots: 'boots.boots',
  'boots.light': 'boots.boots',
  'boots.plate': 'boots.greaves',
  'boots.silk': 'boots.slippers',
  boot: 'boots.boots',
  greave: 'boots.greaves',
};

/** The foot from heel to toe along +Z, sole at y = 0. */
function foot(P: Parts, slot: Slot, len: number, w: number, h: number, toe: 'round' | 'point' | 'curl' | 'square', faceted = false): void {
  const rings: V3[][] = [];
  const n = 14;
  const z0 = -len * 0.28;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const z = z0 + t * len;
    const heel = Math.sqrt(Math.max(0.05, Math.min(1, t * 6)));
    const tip = toe === 'point' || toe === 'curl' ? Math.pow(Math.max(0.04, 1 - smooth(0.55, 1, t)), 0.7) : Math.sqrt(Math.max(0.04, 1 - smooth(0.75, 1, t)));
    const ww = w * heel * tip * (0.85 + 0.25 * Math.sin(t * PI * 0.9));
    const hh = h * (1 - 0.55 * smooth(0.35, 1, t)) * heel * (toe === 'square' ? 1 : tip * 0.6 + 0.4);
    const lift = toe === 'curl' ? 0.04 * Math.pow(smooth(0.7, 1, t), 2) : 0;
    const ring: V3[] = [];
    const sides = faceted ? 8 : 12;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * PI * 2;
      const y = Math.sin(a) > 0 ? Math.sin(a) * hh : Math.sin(a) * 0.004;
      ring.push(v3(Math.cos(a) * ww, y + 0.006 + lift, z));
    }
    rings.push(ring);
  }
  P.add(slot, loft(rings, { capA: true, capB: true, smooth: !faceted }));
}

export function buildBoots(P: Parts): void {
  const L = P.look;
  const c = cutOf(BOOT_CUTS, BOOT_BY_SHAPE, L, 'boots.boots');
  const main: Slot = L.material === 'bone' ? 'bone' : 'main';
  const plated = ['greaves', 'war', 'myrmidon'].includes(c.kind);
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  const shaftTop = c.kind === 'slippers' ? 0.07 : c.kind === 'scarabshell' ? 0.16 : plated || c.kind === 'gale' ? 0.3 : 0.24;
  const r = c.kind === 'heavy' ? 0.05 : 0.045;
  const toe = c.kind === 'slippers' ? 'curl' : c.kind === 'wyrmhide' || c.kind === 'sharkskin' ? 'point' : plated ? 'square' : 'round';
  // The sole, the foot and the shaft.
  P.add('dark', box(0.085, c.kind === 'heavy' ? 0.02 : 0.012, 0.25, 0.005), { p: [0, 0.004, 0.06] });
  foot(P, main, 0.27, 0.042, 0.07, toe, plated);
  P.add(main, lathe([[r * 1.05, 0.02], [r, 0.08], [r * 0.95, shaftTop * 0.55], [r * 1.08, shaftTop], [r * 0.9, shaftTop + 0.003]], plated ? 10 : 16, { sz: 1.05, smooth: !plated }));
  let face = v3(0, shaftTop * 0.6, r * 1.05);
  switch (c.kind) {
    case 'boots':
      P.add(main, lathe([[r * 1.08, shaftTop - 0.04], [r * 1.18, shaftTop - 0.03], [r * 1.16, shaftTop + 0.005], [r * 1.06, shaftTop + 0.006]], 16, { sz: 1.05 }));
      break;
    case 'heavy':
      for (let i = 0; i < 5; i++) {
        const y = 0.07 + i * 0.03;
        P.add('second', box(0.03, 0.003, 0.003), { p: [0, y, r * 1.02], r: [0, 0, i % 2 ? 0.4 : -0.4] });
      }
      P.add('second', torus(r * 1.1, 0.008, 5, 16), { p: [0, shaftTop, 0], r: [PI / 2, 0, 0] });
      break;
    case 'sharkskin':
      P.add(main, slab([[0, 0], [0.04, 0.02], [0.012, 0.07], [0, 0.06]], 0.004), { p: [0, shaftTop * 0.55, -r * 0.95], r: [0, -PI / 2, 0] });
      for (let i = 0; i < 4; i++) P.add('dark', box(0.002, 0.03, 0.002), { p: [r * 0.95, 0.08 + i * 0.03, 0], r: [0.3, 0, 0] });
      break;
    case 'greaves':
    case 'war':
    case 'myrmidon': {
      P.add(main, lathe([[r * 1.1, 0.06], [r * 1.18, shaftTop * 0.5], [r * 1.12, shaftTop - 0.02]], 12, { sx: 1, sz: 1.2, phase: 0 }), { p: [0, 0, 0.01] });
      // Knee cop.
      const kn = sphere(0.034, 12, 8);
      kn.scale(1.15, 1.0, 0.55);
      P.add(main, kn, { p: [0, shaftTop - 0.025, r * 1.05] });
      // Sabaton lames following the top of the foot.
      const lames: Array<[number, number]> = [[0.02, 0.074], [0.055, 0.064], [0.088, 0.052], [0.12, 0.042]];
      lames.forEach(([z, y], i) => P.add(main, box(0.09 - i * 0.008, 0.01, 0.036, 0.004), { p: [0, y, z], r: [0.3 + i * 0.08, 0, 0] }));
      if (c.kind === 'war') P.add(main, spike(0.04, 0.008, 4), { p: [0, shaftTop - 0.025, r * 1.3], r: [PI / 2 - 0.2, 0, 0] });
      if (c.kind === 'myrmidon') {
        const wing: V2[] = [[0, 0], [0.03, 0.01], [0.07, 0.05], [0.05, 0.05], [0.06, 0.08], [0.03, 0.06], [0, 0.04]];
        for (const s of [-1, 1]) P.add('trim', slab(wing, 0.004), { p: [s * r * 1.15, shaftTop * 0.55, -0.01], r: [0, s > 0 ? -PI / 2 : PI / 2, 0], s: [1, 1, 1] });
      }
      face = v3(0, shaftTop - 0.025, r * 1.3);
      break;
    }
    case 'slippers':
      P.add('trim', sphere(0.008, 6, 4), { p: [0, 0.05, 0.21] });
      P.add('second', torus(r * 1.02, 0.004, 4, 16), { p: [0, shaftTop, 0], r: [PI / 2, 0, 0] });
      face = v3(0, 0.05, 0.08);
      break;
    case 'scarabshell': {
      for (let i = 0; i < 3; i++) {
        const g = sphere(0.035, 10, 8);
        g.scale(1.2, 0.5, 1);
        P.add(main, g, { p: [0, 0.05 + i * 0.03, 0.06 + i * -0.03], r: [0.8, 0, 0] });
      }
      P.add('dark', box(0.002, 0.06, 0.03), { p: [0, 0.08, 0.04], r: [0.8, 0, 0] });
      face = v3(0, 0.09, 0.06);
      break;
    }
    case 'wyrmhide': {
      for (let i = 0; i < 18; i++) {
        const a = (i % 6) * (PI / 3);
        const y = 0.06 + Math.floor(i / 6) * 0.05;
        P.add(main, sphere(0.012, 6, 4), aim(v3(Math.sin(a) * r * 1.02, y, Math.cos(a) * r * 1.02), v3(Math.sin(a), 0, Math.cos(a)), [1, 0.4, 1.2]));
      }
      for (let i = 0; i < 3; i++) P.add('bone', cone(0.006, 0.025, 4), { p: [(i - 1) * 0.015, 0.012, 0.205], r: [PI / 2, 0, 0] });
      break;
    }
    case 'gale': {
      for (const s of [-1, 1]) {
        for (let f = 0; f < 3; f++) {
          const feather: V2[] = [[0, 0], [0.012, 0.03], [0.006, 0.09 - f * 0.015], [-0.004, 0.03]];
          P.add('cloth', slab(feather, 0.002), { p: [s * r * 1.05, 0.08, -0.01 - f * 0.012], r: [0, s * PI / 2, -s * (0.9 + f * 0.25)] });
        }
      }
      P.add('glow', torus(r * 1.1, 0.002, 3, 18), { p: [0, 0.07, 0], r: [PI / 2, 0, 0] });
      break;
    }
  }
  if (L.hasTrim) P.add('trim', torus(r * 1.09, 0.003, 4, 16), { p: [0, shaftTop, 0], r: [PI / 2, 0, 0] });
  if (glowing(P)) for (let i = 0; i < 3; i++) P.add('glow', box(0.008, 0.012, 0.002), { p: [(i - 1) * 0.016, shaftTop * 0.45, r * 1.1] });
  P.anchors.head = { p: v3(0, shaftTop * 0.5, 0.03), r: 0.08 };
  P.anchors.axis = { a: v3(0, 0, 0), b: v3(0, shaftTop, 0), r };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    P.point(v3(Math.sin(a) * r, 0.06 + (i % 3) * 0.05, Math.cos(a) * r), v3(Math.sin(a), 0, Math.cos(a)), 0.014);
  }
  P.anchors.face = { p: face, n: v3(0, 0, 1), s: 0.02 };
  spots.push({ p: face.clone(), n: v3(0, 0, 1), s: 0.016 });
  for (const s of [-1, 1]) spots.push({ p: v3(s * r * 1.08, shaftTop * 0.8, 0), n: v3(s, 0, 0), s: 0.012 });
  dressGems(P, spots);
}

// ===========================================================================
// BELTS
// ===========================================================================

type BeltKind = 'sash' | 'light' | 'spiderweb' | 'belt' | 'war' | 'troll' | 'girdle' | 'vampirefang' | 'colossus' | 'worldheart';

const BELT_CUTS: Record<string, { kind: BeltKind; h: number }> = {
  'belt.sash': { kind: 'sash', h: 0.05 },
  'belt.light': { kind: 'light', h: 0.03 },
  'belt.spiderweb': { kind: 'spiderweb', h: 0.05 },
  'belt.belt': { kind: 'belt', h: 0.045 },
  'belt.war': { kind: 'war', h: 0.06 },
  'belt.troll': { kind: 'troll', h: 0.07 },
  'belt.girdle': { kind: 'girdle', h: 0.06 },
  'belt.vampirefang': { kind: 'vampirefang', h: 0.055 },
  'belt.colossus': { kind: 'colossus', h: 0.08 },
  'belt.worldheart': { kind: 'worldheart', h: 0.06 },
};

const BELT_BY_SHAPE: Record<string, string> = {
  belt: 'belt.belt',
  'belt.sash': 'belt.sash',
  'belt.plate': 'belt.belt',
  'belt.chain': 'belt.girdle',
  sash: 'belt.sash',
};

export function buildBelt(P: Parts): void {
  const L = P.look;
  const c = cutOf(BELT_CUTS, BELT_BY_SHAPE, L, 'belt.belt');
  const R = 0.15;
  const RZ = 0.11;
  const h = c.h;
  const strap: Slot = c.kind === 'sash' || c.kind === 'spiderweb' ? 'cloth' : c.kind === 'girdle' || c.kind === 'colossus' || c.kind === 'worldheart' ? 'main' : 'second';
  const strapSlot: Slot = strap === 'second' && L.material === 'leather' ? 'main' : strap;
  // The band, a closed loop standing upright.
  P.add(strapSlot, lathe([[R, -h / 2], [R * 1.03, -h * 0.42], [R * 1.03, h * 0.42], [R, h / 2], [R * 0.96, h / 2], [R * 0.96, -h / 2], [R, -h / 2]], 32, { sz: RZ / R }));
  const front = (a: number, y = 0, lift = 0) => onRing(a, R * 1.03 + lift, RZ * 1.03 + lift, y);
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  let face = front(0, 0, 0.012);
  const buckle = (w: number, hh: number, slot: Slot) => {
    const p = front(0, 0, 0.004);
    P.add(slot, torus(Math.max(w, hh) * 0.5, 0.004, 4, 4), { p: [p.x, p.y, p.z], r: [0, 0, PI / 4], s: [w / Math.max(w, hh) / 1.414 * 2, hh / Math.max(w, hh) / 1.414 * 2, 1] });
    P.add(slot, box(0.004, hh * 0.9, 0.004), { p: [p.x, p.y, p.z + 0.003] });
  };
  const pouch = (a: number, s = 1) => {
    const p = front(a, -h * 0.2, 0.018 * s);
    P.add('second', box(0.05 * s, 0.06 * s, 0.03 * s, 0.01 * s), aim(p, v3(0, 1, 0), 1, a));
    P.add('second', box(0.052 * s, 0.022 * s, 0.032 * s, 0.006 * s), aim(p.clone().add(v3(0, 0.022 * s, 0)), v3(0, 1, 0), 1, a));
  };
  switch (c.kind) {
    case 'sash': {
      const p = front(0.35, 0, 0.008);
      P.add('cloth', sphere(0.02, 8, 6), { p: [p.x, p.y, p.z] });
      for (const s of [-1, 1]) P.add('cloth', tube(curve([p, p.clone().add(v3(0.01 * s, -0.05, 0.01)), p.clone().add(v3(0.02 * s + 0.01, -0.12, 0.0))], 8), 0.009, 5, { flat: 0.3 }));
      face = p.clone().add(v3(0, 0, 0.02));
      break;
    }
    case 'light':
      buckle(0.03, 0.03, 'trim');
      pouch(0.9, 0.8);
      break;
    case 'spiderweb': {
      for (let i = 0; i < 8; i++) {
        const a = -1 + i * 0.25;
        P.add('glow', tube([front(a, -h / 2, 0.001), front(a + 0.15, h / 2, 0.001)], 0.0008, 3));
        P.add('glow', tube([front(a, h / 2, 0.001), front(a + 0.15, -h / 2, 0.001)], 0.0008, 3));
      }
      const p = front(0, 0, 0.01);
      P.add('dark', sphere(0.012, 8, 6), { p: [p.x, p.y, p.z], s: [1, 1.3, 0.7] });
      for (let i = 0; i < 8; i++) {
        const s = i < 4 ? -1 : 1;
        const k = i % 4;
        P.add('dark', tube([p, p.clone().add(v3(s * 0.02, 0.012 - k * 0.008, 0)), p.clone().add(v3(s * 0.03, 0.002 - k * 0.012, -0.002))], 0.0015, 3));
      }
      face = p;
      break;
    }
    case 'belt':
      buckle(0.04, 0.04, 'trim');
      pouch(0.8);
      pouch(-0.8);
      break;
    case 'war':
      buckle(0.05, 0.05, 'trim');
      for (let i = 0; i < 10; i++) {
        const a = 0.45 + i * 0.55;
        const p = front(a, 0, 0.002);
        P.add('main', box(0.04, h * 0.8, 0.004, 0.002), aim(p, v3(0, 1, 0), 1, a));
        P.add('dark', sphere(0.004, 5, 4), aim(p.clone().add(v3(Math.sin(a) * 0.003, 0, Math.cos(a) * 0.003)), v3(0, 1, 0)));
      }
      break;
    case 'troll': {
      P.add('cloth', rough(torus(R * 1.03, 0.014, 6, 32), 0.004, 6, 50), { p: [0, h / 2, 0], r: [PI / 2, 0, 0], s: [1, RZ / R, 1] });
      const p = front(0, 0, 0.008);
      P.add('dark', cyl(0.035, 0.035, 0.01, 14), { p: [p.x, p.y, p.z], r: [PI / 2, 0, 0] });
      for (let i = 0; i < 3; i++) P.add('bone', cyl(0.004, 0.004, 0.03, 5), { p: [front(0.5 + i * 0.3).x, 0, front(0.5 + i * 0.3).z + 0.01], r: [0, 0, PI / 2] });
      face = p.clone().add(v3(0, 0, 0.006));
      break;
    }
    case 'girdle':
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * PI * 2;
        P.add('main', box(0.055, h * 0.95, 0.006, 0.003), aim(front(a, 0, 0.002), v3(0, 1, 0), 1, a));
      }
      for (const y of [-h / 2, h / 2]) P.add('dark', torus(R * 1.04, 0.003, 4, 40), { p: [0, y, 0], r: [PI / 2, 0, 0], s: [1, RZ / R, 1] });
      buckle(0.05, 0.05, 'trim');
      break;
    case 'vampirefang':
      buckle(0.05, 0.045, 'trim');
      for (let i = 0; i < 9; i++) {
        const a = 0.5 + i * 0.6;
        const p = front(a, -h / 2, 0.003);
        P.add('bone', cone(0.005, 0.03, 5), { p: [p.x, p.y - 0.014, p.z], r: [PI, 0, 0] });
      }
      break;
    case 'colossus': {
      for (let i = 0; i < 8; i++) {
        const a = 0.5 + i * 0.66;
        const p = front(a, 0, 0.003);
        P.add('main', box(0.06, h * 0.9, 0.008, 0.003), aim(p, v3(0, 1, 0), 1, a));
      }
      const p = front(0, 0, 0.01);
      P.add('trim', lathe([[0.001, -0.006], [0.04, -0.006], [0.044, 0], [0.036, 0.008], [0.001, 0.008]], 16), { p: [p.x, p.y, p.z], r: [PI / 2, 0, 0] });
      face = p.clone().add(v3(0, 0, 0.012));
      break;
    }
    case 'worldheart': {
      const p = front(0, 0, 0.01);
      for (const s of [-1, 1]) P.add('crystal', sphere(0.014, 9, 7), { p: [p.x + s * 0.01, p.y + 0.005, p.z + 0.004] });
      P.add('crystal', cone(0.02, 0.026, 8), { p: [p.x, p.y - 0.012, p.z + 0.004], r: [PI, 0, 0] });
      for (let i = 0; i < 6; i++) {
        const s = i < 3 ? -1 : 1;
        const k = i % 3;
        P.add('wood', tube(curve([p.clone().add(v3(s * 0.015, 0, 0)), front(s * (0.4 + k * 0.25), (k - 1) * h * 0.3, 0.004), front(s * (0.8 + k * 0.3), (k - 1) * h * 0.35, 0.002)], 10), 0.003, 4));
      }
      face = p.clone().add(v3(0, 0, 0.02));
      break;
    }
  }
  if (L.hasTrim && !['war', 'girdle', 'colossus'].includes(c.kind)) for (const y of [-h / 2, h / 2]) P.add('trim', torus(R * 1.035, 0.002, 4, 40), { p: [0, y, 0], r: [PI / 2, 0, 0], s: [1, RZ / R, 1] });
  if (glowing(P) && c.kind !== 'spiderweb') for (let i = 0; i < 6; i++) {
    const a = PI * 0.6 + i * 0.3;
    P.add('glow', box(0.006, h * 0.4, 0.002), aim(front(a, 0, 0.002), v3(0, 1, 0), 1, a));
  }
  P.anchors.head = { p: v3(0, 0, 0), r: R };
  P.anchors.axis = { a: v3(-R, 0, 0), b: v3(R, 0, 0), r: h };
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2;
    P.point(front(a), v3(Math.sin(a), 0, Math.cos(a)), h * 0.3);
  }
  P.anchors.face = { p: face, n: v3(0, 0, 1), s: Math.min(0.03, h * 0.5) };
  spots.push({ p: face.clone(), n: v3(0, 0, 1), s: Math.min(0.026, h * 0.5) });
  for (const s of [-1, 1]) spots.push({ p: front(s * 0.5, 0, 0.004), n: v3(Math.sin(s * 0.5), 0, Math.cos(s * 0.5)), s: h * 0.3 });
  dressGems(P, spots);
}
