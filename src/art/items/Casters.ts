/**
 * SLAY — wands, staves, scepters and orbs.
 *
 * Caster gear is read by its head: a Femur Wand is a thigh bone, a Lich Wand
 * a claw round a void stone, a Heartstone Wand a red heart in gold prongs. A
 * Gnarled Staff ends in roots knotted round a stone, a Worldtree Staff in
 * branches and a glowing seed. Scepters are crowns, sprinklers, serpents and
 * suns on a rod. Orbs are held up on a short stem: cracked, clutched in
 * talons, banded in gold, beating like a heart.
 *
 * Contract: grip at the origin, head toward +Y.
 */
import * as THREE from 'three';
import type { Parts, Slot } from './Parts';
import { box, cone, curve, cyl, gem, horn, lathe, rough, slab, sphere, spike, torus, tube, v3, xf, type V3 } from './Geo';
import { aim, band, cutOf, dressGems, grip, haft, pommel, runes, skull, sphereDirs, type V2, type Wrap } from './Kit';

const PI = Math.PI;

function wantsRunes(P: Parts): boolean {
  const L = P.look;
  return L.hasRunes || (L.glow > 0 && L.rarityTier >= 1) || !!L.design;
}

/** A twisted strand: points spiralling up the Y axis. */
function spiral(y0: number, y1: number, r: number, turns: number, phase: number, n = 24, rOf?: (t: number) => number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = phase + t * turns * PI * 2;
    const rr = rOf ? rOf(t) : r;
    out.push(v3(Math.cos(a) * rr, y0 + t * (y1 - y0), Math.sin(a) * rr));
  }
  return out;
}

/** Prongs rising from (0, y) and curling in to hold something at (0, top). */
function prongs(P: Parts, slot: Slot, n: number, y: number, top: number, r: number, phase = 0): void {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pts = curve([v3(ca * r * 0.25, y, sa * r * 0.25), v3(ca * r * 1.1, (y + top) / 2, sa * r * 1.1), v3(ca * r * 0.9, top, sa * r * 0.9), v3(ca * r * 0.45, top + r * 0.4, sa * r * 0.45)], 10);
    P.add(slot, tube(pts, (t) => r * 0.12 * (1 - 0.6 * t), 5));
  }
}

// ===========================================================================
// WANDS
// ===========================================================================

type WandKind = 'plain' | 'yew' | 'burnt' | 'femur' | 'bone' | 'grim' | 'lich' | 'tomb' | 'grave' | 'unearthed' | 'heartstone';

interface WandCut {
  kind: WandKind;
  len: number;
  r: number;
  wrap: Wrap;
}

const WAND_CUTS: Record<string, WandCut> = {
  'wand.wand': { kind: 'plain', len: 0.34, r: 0.011, wrap: 'leather' },
  'wand.yew': { kind: 'yew', len: 0.36, r: 0.01, wrap: 'cord' },
  'wand.burnt': { kind: 'burnt', len: 0.35, r: 0.011, wrap: 'cloth' },
  'wand.femur': { kind: 'femur', len: 0.34, r: 0.011, wrap: 'cord' },
  'wand.bone': { kind: 'bone', len: 0.34, r: 0.01, wrap: 'cord' },
  'wand.grim': { kind: 'grim', len: 0.36, r: 0.01, wrap: 'cord' },
  'wand.lich': { kind: 'lich', len: 0.38, r: 0.01, wrap: 'wire' },
  'wand.tomb': { kind: 'tomb', len: 0.34, r: 0.011, wrap: 'leather' },
  'wand.grave': { kind: 'grave', len: 0.35, r: 0.011, wrap: 'cloth' },
  'wand.unearthed': { kind: 'unearthed', len: 0.36, r: 0.012, wrap: 'cord' },
  'wand.heartstone': { kind: 'heartstone', len: 0.36, r: 0.01, wrap: 'wire' },
};

const WAND_BY_SHAPE: Record<string, string> = {
  wand: 'wand.wand',
  'wand.bone': 'wand.bone',
  'wand.crystal': 'wand.tomb',
};

export function buildWand(P: Parts): void {
  const L = P.look;
  const c = cutOf(WAND_CUTS, WAND_BY_SHAPE, L, 'wand.wand');
  const top = c.len - 0.08;
  const main: Slot = L.material === 'bone' ? 'bone' : L.material === 'crystal' ? 'wood' : 'main';
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  let headP = v3(0, top, 0);
  let headR = 0.03;
  grip(P, -0.07, 0.04, c.r * 1.15, c.wrap);
  switch (c.kind) {
    case 'plain':
      haft(P, -0.08, top, c.r, main, { taper: 0.55 });
      pommel(P, 'knob', -0.075, c.r * 1.2, 'trim');
      P.add('trim', cone(c.r * 0.7, 0.03, 8), { p: [0, top + 0.012, 0] });
      band(P, 0.06, c.r * 0.95, 0.008, 'trim');
      headP = v3(0, top, 0);
      break;
    case 'yew': {
      // Two strands twisted round each other, budding leaves at the tip.
      for (const ph of [0, PI]) P.add(main, tube(spiral(-0.08, top, c.r * 0.55, 2.2, ph, 30, (t) => c.r * 0.55 * (1 - 0.4 * t)), (t) => c.r * 0.7 * (1 - 0.5 * t), 6));
      for (let i = 0; i < 4; i++) {
        const a = i * 1.7;
        const leaf: V2[] = [[0, 0], [0.008, 0.012], [0, 0.032], [-0.008, 0.012]];
        P.add('leaf', slab(leaf, 0.002), aim(v3(Math.cos(a) * c.r * 0.4, top - 0.01 * i, Math.sin(a) * c.r * 0.4), v3(Math.cos(a), 1.2, Math.sin(a)), 1, a));
      }
      P.add('glow', sphere(c.r * 0.7, 8, 6), { p: [0, top + 0.01, 0] });
      break;
    }
    case 'burnt': {
      // A charred branch splitting into three ember-tipped twigs.
      const g = rough(lathe([[0.001, -0.08], [c.r * 1.1, -0.08], [c.r, top * 0.6], [c.r * 0.9, top * 0.75], [0.001, top * 0.78]], 8), 0.0015, 7, 60);
      P.add('dark', g);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2 + 0.4;
        const pts = curve([v3(0, top * 0.72, 0), v3(Math.cos(a) * 0.012, top * 0.86, Math.sin(a) * 0.012), v3(Math.cos(a) * 0.024, top + 0.01 - i * 0.01, Math.sin(a) * 0.024)], 6);
        P.add('dark', tube(pts, (t) => c.r * 0.55 * (1 - 0.6 * t), 5));
        const e = pts[pts.length - 1]!;
        P.add('glow', sphere(c.r * 0.35, 6, 4), { p: [e.x, e.y, e.z] });
      }
      for (let i = 0; i < 5; i++) P.add('glow', box(0.0015, 0.012, 0.0015), { p: [Math.cos(i * 2.4) * c.r * 1.0, 0.08 + i * 0.04, Math.sin(i * 2.4) * c.r * 1.0], r: [0, 0, 0.4] });
      break;
    }
    case 'femur': {
      P.add('bone', lathe([[0.001, -0.09], [c.r * 1.3, -0.085], [c.r * 0.95, -0.05], [c.r * 0.85, top * 0.5], [c.r * 1.0, top - 0.02], [c.r * 1.6, top], [0.001, top + 0.004]], 9));
      for (const s of [-1, 1]) P.add('bone', sphere(c.r * 1.3, 8, 6), { p: [s * c.r * 0.9, -0.088, 0] });
      P.add('bone', sphere(c.r * 1.9, 9, 7), { p: [c.r * 0.6, top + c.r, 0] });
      P.add('bone', sphere(c.r * 1.0, 7, 5), { p: [-c.r * 1.2, top - c.r * 0.5, 0] });
      headP = v3(c.r * 0.6, top + c.r, 0);
      break;
    }
    case 'bone': {
      haft(P, -0.08, top, c.r, 'bone', { taper: 0.8 });
      for (let i = 0; i < 4; i++) band(P, 0.06 + i * 0.045, c.r * 0.95, 0.006, 'bone');
      // A bony hand closed round a small orb.
      P.add('glow', sphere(0.016, 10, 8), { p: [0, top + 0.022, 0] });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2;
        const pts = curve([v3(Math.cos(a) * 0.008, top, Math.sin(a) * 0.008), v3(Math.cos(a) * 0.022, top + 0.018, Math.sin(a) * 0.022), v3(Math.cos(a) * 0.012, top + 0.04, Math.sin(a) * 0.012)], 6);
        P.add('bone', tube(pts, 0.0032, 5));
      }
      headP = v3(0, top + 0.022, 0);
      break;
    }
    case 'grim': {
      // A short spine of vertebrae under a small skull.
      const n = 9;
      haft(P, -0.08, top, c.r * 0.55, 'bone', { taper: 0.9 });
      for (let i = 0; i < n; i++) {
        const y = -0.06 + ((i + 0.5) / n) * (top - 0.04);
        P.add('bone', lathe([[0.001, -0.012], [c.r * 1.2, -0.01], [c.r * 1.4, 0], [c.r * 1.2, 0.01], [0.001, 0.012]], 8), { p: [0, y, 0] });
        P.add('bone', cone(c.r * 0.4, c.r * 1.6, 4), { p: [0, y, -c.r * 1.4], r: [-PI / 2 - 0.3, 0, 0] });
      }
      skull(P, 'bone', v3(0, top + 0.02, 0), 0.04, v3(0, 0.2, 1));
      P.add('glow', sphere(0.004, 5, 4), { p: [0.007, top + 0.021, 0.017] });
      P.add('glow', sphere(0.004, 5, 4), { p: [-0.007, top + 0.021, 0.017] });
      headP = v3(0, top + 0.02, 0);
      break;
    }
    case 'lich': {
      haft(P, -0.08, top - 0.02, c.r, 'bone', { taper: 0.9 });
      skull(P, 'bone', v3(0, top - 0.04, 0.004), 0.032, v3(0, 0, 1));
      P.add('crystal', gem(0.05, 'shard'), { p: [0, top + 0.035, 0] });
      prongs(P, 'bone', 4, top - 0.02, top + 0.04, 0.02, PI / 4);
      headP = v3(0, top + 0.035, 0);
      break;
    }
    case 'tomb': {
      haft(P, -0.08, top - 0.03, c.r, 'wood', { taper: 0.85 });
      P.add('crystal', gem(0.06, 'shard'), { p: [0, top + 0.02, 0] });
      for (let i = 0; i < 3; i++) band(P, top - 0.01 + i * 0.022, 0.014 - i * 0.002, 0.004, 'dark');
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2;
        P.add('dark', box(0.003, 0.06, 0.003), { p: [Math.cos(a) * 0.014, top + 0.012, Math.sin(a) * 0.014], r: [Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2] });
      }
      headP = v3(0, top + 0.02, 0);
      break;
    }
    case 'grave': {
      haft(P, -0.08, top - 0.02, c.r, 'wood', { taper: 0.9 });
      P.add('dark', lathe([[c.r, top - 0.03], [c.r * 2.0, top], [c.r * 1.6, top + 0.008], [0.001, top + 0.01]], 8));
      for (const s of [-1, 1]) P.add('crystal', gem(0.05, 'shard'), { p: [s * 0.01, top + 0.03, 0], r: [0, 0, -s * 0.35] });
      P.add('crystal', gem(0.03, 'shard'), { p: [0, top + 0.02, 0.01], r: [0.4, 0, 0] });
      headP = v3(0, top + 0.03, 0);
      break;
    }
    case 'unearthed': {
      // A root dug up with crystals grown through it.
      P.add('wood', rough(lathe([[0.001, -0.08], [c.r * 1.2, -0.08], [c.r, top * 0.5], [c.r * 1.6, top], [0.001, top + 0.01]], 8), 0.002, 11, 50));
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        P.add('crystal', gem(0.025 + (i % 3) * 0.01, 'shard'), aim(v3(Math.cos(a) * c.r, top - 0.01 * i, Math.sin(a) * c.r), v3(Math.cos(a), 1.4, Math.sin(a))));
      }
      headP = v3(0, top, 0);
      break;
    }
    case 'heartstone': {
      haft(P, -0.08, top - 0.02, c.r, 'trim', { taper: 0.75 });
      for (let i = 0; i < 3; i++) band(P, 0.06 + i * 0.06, c.r, 0.008, 'trim');
      // A heart: two lobes and a point.
      const hy = top + 0.03;
      for (const s of [-1, 1]) P.add('crystal', sphere(0.013, 9, 7), { p: [s * 0.009, hy + 0.006, 0], s: [1, 1, 0.75] });
      P.add('crystal', cone(0.018, 0.026, 8), { p: [0, hy - 0.012, 0], r: [PI, 0, 0], s: [1, 1, 0.7] });
      prongs(P, 'trim', 3, top - 0.02, hy + 0.01, 0.02, PI / 2);
      headP = v3(0, hy, 0);
      headR = 0.025;
      break;
    }
  }
  if (L.hasTrim && c.kind !== 'heartstone') band(P, 0.048, c.r * 1.05, 0.006, 'trim');
  if (wantsRunes(P) && ['plain', 'bone', 'tomb', 'grave', 'lich'].includes(c.kind)) runes(P, 0.07, top - 0.06, c.r * 0.9, c.r * 0.9, L.signature, 3);
  P.anchors.axis = { a: v3(0, 0.05, 0), b: v3(0, top + 0.02, 0), r: c.r * 1.5 };
  P.anchors.head = { p: headP, r: headR };
  for (let i = 0; i < 6; i++) {
    const a = i * 2.2;
    P.point(v3(Math.cos(a) * c.r, 0.06 + i * 0.03, Math.sin(a) * c.r), v3(Math.cos(a), 0, Math.sin(a)), c.r * 1.5);
  }
  P.anchors.face = { p: v3(0, 0.05, c.r * 1.1), n: v3(0, 0, 1), s: 0.012 };
  spots.push({ p: v3(0, 0.05, c.r * 1.05), n: v3(0, 0, 1), s: 0.011 });
  spots.push({ p: v3(0, -0.07, c.r * 1.2), n: v3(0, 0, 1), s: 0.01 });
  spots.push({ p: v3(0, 0.05, -c.r * 1.05), n: v3(0, 0, -1), s: 0.011 });
  dressGems(P, spots);
}

// ===========================================================================
// STAVES
// ===========================================================================

type StaffKind = 'short' | 'long' | 'gnarled' | 'battle' | 'war' | 'elder' | 'cedar' | 'archon' | 'eldritch' | 'worldtree';

interface StaffCut {
  kind: StaffKind;
  len: number;
  r: number;
  shaft: Slot;
  wrap: Wrap;
}

const STAFF_CUTS: Record<string, StaffCut> = {
  'staff.short': { kind: 'short', len: 1.4, r: 0.017, shaft: 'main', wrap: 'leather' },
  'staff.long': { kind: 'long', len: 1.72, r: 0.018, shaft: 'main', wrap: 'leather' },
  'staff.gnarled': { kind: 'gnarled', len: 1.65, r: 0.02, shaft: 'main', wrap: 'cord' },
  'staff.battle': { kind: 'battle', len: 1.6, r: 0.019, shaft: 'wood', wrap: 'leather' },
  'staff.war': { kind: 'war', len: 1.62, r: 0.019, shaft: 'wood', wrap: 'cord' },
  'staff.elder': { kind: 'elder', len: 1.7, r: 0.018, shaft: 'main', wrap: 'wire' },
  'staff.cedar': { kind: 'cedar', len: 1.66, r: 0.018, shaft: 'main', wrap: 'cloth' },
  'staff.archon': { kind: 'archon', len: 1.72, r: 0.017, shaft: 'trim', wrap: 'wire' },
  'staff.eldritch': { kind: 'eldritch', len: 1.75, r: 0.017, shaft: 'dark', wrap: 'wire' },
  'staff.worldtree': { kind: 'worldtree', len: 1.8, r: 0.022, shaft: 'main', wrap: 'cord' },
};

const STAFF_BY_SHAPE: Record<string, string> = {
  staff: 'staff.long',
  'staff.battle': 'staff.battle',
  'staff.rune': 'staff.cedar',
  stave: 'staff.short',
};

export function buildStaff(P: Parts): void {
  const L = P.look;
  const c0 = cutOf(STAFF_CUTS, STAFF_BY_SHAPE, L, 'staff.long');
  // Stouter than life, so a staff reads as one from the game's camera.
  const c = { ...c0, r: c0.r * 1.25 };
  let shaft: Slot = c.shaft;
  if (shaft === 'main' && L.material === 'crystal') shaft = 'wood';
  if (shaft === 'main' && L.material === 'metal') shaft = 'wood';
  const top = c.len - 0.2;
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  let headP = v3(0, top, 0);
  let headR = 0.06;
  grip(P, -0.04, 0.22, c.r * 1.12, c.wrap);
  const plainShaft = (y1: number, knots = 0) => haft(P, -0.2, y1, c.r, shaft, { taper: 0.9, knots, seed: L.signature });
  switch (c.kind) {
    case 'short':
      // A quarterstaff whose top swells into a knotted burl, bound in iron.
      plainShaft(top);
      P.add('dark', cyl(c.r * 1.15, c.r * 1.15, 0.05, 10), { p: [0, -0.2, 0] });
      P.add(shaft, rough(sphere(c.r * 2.1, 10, 8), 0.005, L.signature % 13, 22), { p: [0, top + 0.05, 0], s: [1, 1.35, 1] });
      band(P, top - 0.015, c.r * 1.05, 0.03, 'dark');
      headP = v3(0, top + 0.06, 0);
      break;
    case 'long': {
      // A shepherd's crook.
      plainShaft(top);
      const crook = curve([v3(0, top - 0.01, 0), v3(0, top + 0.12, 0), v3(0.06, top + 0.2, 0), v3(0.12, top + 0.14, 0), v3(0.11, top + 0.07, 0)], 18);
      P.add(shaft, tube(crook, (t) => c.r * (1 - 0.35 * t), 9));
      band(P, top - 0.02, c.r, 0.02, 'dark');
      headP = v3(0.06, top + 0.12, 0);
      break;
    }
    case 'gnarled': {
      // Twisted, knotted, roots clawing round a stone.
      P.add(shaft, rough(lathe(Array.from({ length: 14 }, (_, i) => [c.r * (1 + 0.12 * Math.sin(i * 1.7)), -0.2 + (i / 13) * (top + 0.2)] as [number, number]).concat([[0.001, top]]), 9), 0.003, L.signature % 17, 30));
      for (let k = 0; k < 6; k++) P.add(shaft, sphere(c.r * 0.6, 6, 5), { p: [Math.cos(k * 2.1) * c.r, 0.3 + k * 0.18, Math.sin(k * 2.1) * c.r], s: [1, 1.6, 1] });
      P.add('gem', sphere(0.035, 10, 8), { p: [0, top + 0.06, 0] });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * PI * 2;
        const pts = curve([v3(Math.cos(a) * c.r * 0.6, top - 0.03, Math.sin(a) * c.r * 0.6), v3(Math.cos(a) * 0.04, top + 0.04, Math.sin(a) * 0.04), v3(Math.cos(a + 0.6) * 0.03, top + 0.11, Math.sin(a + 0.6) * 0.03), v3(Math.cos(a + 1.0) * 0.01, top + 0.13, Math.sin(a + 1.0) * 0.01)], 10);
        P.add(shaft, tube(pts, (t) => c.r * 0.45 * (1 - 0.7 * t), 5));
      }
      headP = v3(0, top + 0.06, 0);
      break;
    }
    case 'battle':
    case 'war': {
      // A fighting staff: shod at both ends, banded in iron.
      plainShaft(top + 0.18);
      const ends = [-0.2, top + 0.18];
      for (const [i, y] of ends.entries()) {
        const s = i === 0 ? -1 : 1;
        if (c.kind === 'battle') {
          P.add('dark', lathe([[c.r * 1.05, -0.1], [c.r * 1.35, -0.07], [c.r * 1.35, 0.02], [c.r * 1.1, 0.04], [0.001, 0.05]], 10), { p: [0, y - s * 0.04, 0], s: [1, s, 1] });
        } else {
          const fl: V2[] = [[0, -0.05], [0.02, -0.04], [0.026, 0.02], [0, 0.05]];
          for (let k = 0; k < 6; k++) {
            const g = slab(fl, 0.006);
            g.translate(c.r * 0.9, 0, 0);
            g.rotateY((k / 6) * PI * 2);
            P.add('dark', g, { p: [0, y - s * 0.05, 0] });
          }
          P.add('dark', cyl(c.r * 1.25, c.r * 1.25, 0.12, 10), { p: [0, y - s * 0.05, 0] });
        }
      }
      for (const y of [0.3, 0.55, top - 0.25, top - 0.05]) band(P, y, c.r, 0.02, 'dark');
      headP = v3(0, top + 0.12, 0);
      headR = 0.04;
      break;
    }
    case 'elder': {
      // A ring at the top with a stone floating inside.
      plainShaft(top + 0.02);
      P.add('trim', torus(0.075, 0.009, 6, 28), { p: [0, top + 0.09, 0] });
      for (const s of [-1, 1]) P.add('trim', horn(0.06, 0.006, 1.2, 5), { p: [s * 0.02, top + 0.015, 0], r: [0, 0, -s * 0.4], s: [s, 1, 1] });
      P.add('gem', gem(0.05, 'round'), { p: [0, top + 0.09, 0], r: [PI / 2, 0, 0] });
      P.add('glow', torus(0.03, 0.002, 3, 18), { p: [0, top + 0.09, 0] });
      headP = v3(0, top + 0.09, 0);
      break;
    }
    case 'cedar': {
      // Carved rune bands and a lantern cage holding a light.
      plainShaft(top);
      for (let i = 0; i < 5; i++) band(P, 0.4 + i * 0.22, c.r * 1.02, 0.03, 'second');
      P.add('dark', cyl(0.03, 0.022, 0.012, 8), { p: [0, top + 0.005, 0] });
      P.add('dark', cone(0.035, 0.04, 8), { p: [0, top + 0.15, 0] });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2 + PI / 4;
        P.add('dark', box(0.004, 0.13, 0.004), { p: [Math.cos(a) * 0.028, top + 0.07, Math.sin(a) * 0.028] });
      }
      P.add('glow', sphere(0.018, 8, 6), { p: [0, top + 0.07, 0] });
      P.add('dark', torus(0.012, 0.003, 4, 10), { p: [0, top + 0.18, 0] });
      headP = v3(0, top + 0.07, 0);
      break;
    }
    case 'archon': {
      plainShaft(top);
      P.add('trim', lathe([[c.r, top - 0.04], [c.r * 1.8, top], [c.r * 1.3, top + 0.02]], 10));
      P.add('crystal', xf(gem(0.14, 'shard'), { s: [1.1, 1, 1.1] }), { p: [0, top + 0.12, 0] });
      prongs(P, 'trim', 4, top, top + 0.12, 0.05);
      for (let i = 0; i < 3; i++) band(P, top - 0.1 - i * 0.06, c.r, 0.008, 'trim');
      headP = v3(0, top + 0.12, 0);
      break;
    }
    case 'eldritch': {
      // The shaft splits into a spiral cage round a void stone.
      plainShaft(top);
      for (let k = 0; k < 3; k++) P.add(shaft, tube(spiral(top - 0.02, top + 0.2, 0.04, 0.9, (k / 3) * PI * 2, 22, (t) => 0.012 + 0.04 * Math.sin(PI * t)), c.r * 0.45, 5));
      P.add('crystal', sphere(0.03, 10, 8), { p: [0, top + 0.1, 0] });
      for (const d of sphereDirs(6)) P.add('crystal', gem(0.018, 'shard'), aim(v3(0, top + 0.1, 0).addScaledVector(d, 0.065), d));
      headP = v3(0, top + 0.1, 0);
      break;
    }
    case 'worldtree': {
      // Branches spreading from the top, leaves, and a seed of light.
      plainShaft(top, 3);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2 + 0.3;
        const len = 0.14 + (i % 2) * 0.06;
        const pts = curve([v3(0, top - 0.04, 0), v3(Math.cos(a) * len * 0.35, top + len * 0.45, Math.sin(a) * len * 0.35), v3(Math.cos(a) * len * 0.7, top + len * 0.9, Math.sin(a) * len * 0.7)], 8);
        P.add(shaft, tube(pts, (t) => c.r * 0.5 * (1 - 0.75 * t), 5));
        const e = pts[pts.length - 1]!;
        for (let k = 0; k < 2; k++) {
          const leaf: V2[] = [[0, 0], [0.012, 0.02], [0, 0.045], [-0.012, 0.02]];
          P.add('leaf', slab(leaf, 0.002), aim(e, v3(Math.cos(a + k), 1, Math.sin(a + k)), 1, a));
        }
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * PI * 2;
        P.add(shaft, tube(curve([v3(0, -0.12, 0), v3(Math.cos(a) * 0.03, -0.18, Math.sin(a) * 0.03), v3(Math.cos(a) * 0.05, -0.24, Math.sin(a) * 0.05)], 6), (t) => c.r * 0.4 * (1 - 0.8 * t), 5));
      }
      P.add('glow', sphere(0.026, 10, 8), { p: [0, top + 0.08, 0] });
      headP = v3(0, top + 0.08, 0);
      headR = 0.1;
      break;
    }
  }
  if (L.hasTrim) {
    band(P, 0.24, c.r * 1.05, 0.012, 'trim');
    band(P, -0.05, c.r * 1.05, 0.012, 'trim');
  }
  if (wantsRunes(P)) runes(P, 0.3, 0.9, c.r * 1.2, c.r * 1.02, L.signature, 4);
  P.anchors.axis = { a: v3(0, top - 0.3, 0), b: v3(0, top + 0.1, 0), r: c.r * 2 };
  P.anchors.head = { p: headP, r: headR };
  P.anchors.grip = { a: v3(0, -0.04, 0), b: v3(0, 0.6, 0) };
  for (let i = 0; i < 8; i++) {
    const a = i * 2.3;
    P.point(v3(Math.cos(a) * c.r, top - 0.5 + i * 0.06, Math.sin(a) * c.r), v3(Math.cos(a), 0, Math.sin(a)), c.r * 2);
  }
  P.anchors.face = { p: v3(0, top - 0.06, c.r * 1.05), n: v3(0, 0, 1), s: 0.02 };
  spots.push({ p: v3(0, top - 0.06, c.r * 1.05), n: v3(0, 0, 1), s: c.r * 1.1 });
  spots.push({ p: v3(0, 0.24, c.r * 1.1), n: v3(0, 0, 1), s: c.r });
  spots.push({ p: v3(0, top - 0.06, -c.r * 1.05), n: v3(0, 0, -1), s: c.r * 1.1 });
  dressGems(P, spots);
}

// ===========================================================================
// SCEPTERS
// ===========================================================================

type ScepterKind = 'crown' | 'grand' | 'war' | 'sprinkler' | 'divine' | 'caduceus' | 'wrath' | 'mirrored' | 'solar' | 'judgement';

interface ScepterCut {
  kind: ScepterKind;
  len: number;
  r: number;
  hs: number;
}

const SCEPTER_CUTS: Record<string, ScepterCut> = {
  'scepter.scepter': { kind: 'crown', len: 0.5, r: 0.012, hs: 0.07 },
  'scepter.grand': { kind: 'grand', len: 0.54, r: 0.012, hs: 0.08 },
  'scepter.war': { kind: 'war', len: 0.56, r: 0.014, hs: 0.09 },
  'scepter.sprinkler': { kind: 'sprinkler', len: 0.52, r: 0.012, hs: 0.075 },
  'scepter.divine': { kind: 'divine', len: 0.55, r: 0.012, hs: 0.09 },
  'scepter.caduceus': { kind: 'caduceus', len: 0.58, r: 0.011, hs: 0.1 },
  'scepter.wrath': { kind: 'wrath', len: 0.54, r: 0.013, hs: 0.09 },
  'scepter.mirrored': { kind: 'mirrored', len: 0.55, r: 0.012, hs: 0.1 },
  'scepter.solar': { kind: 'solar', len: 0.56, r: 0.012, hs: 0.11 },
  'scepter.judgement': { kind: 'judgement', len: 0.58, r: 0.012, hs: 0.11 },
};

const SCEPTER_BY_SHAPE: Record<string, string> = {
  scepter: 'scepter.scepter',
  'scepter.orbed': 'scepter.divine',
  'scepter.spiked': 'scepter.wrath',
  rod: 'scepter.scepter',
};

export function buildScepter(P: Parts): void {
  const L = P.look;
  const c = cutOf(SCEPTER_CUTS, SCEPTER_BY_SHAPE, L, 'scepter.scepter');
  const hs = c.hs;
  const top = c.len - 0.08 - hs * 0.6;
  const hy = top + hs * 0.5;
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  grip(P, -0.07, 0.07, c.r * 1.15, 'wire');
  pommel(P, 'gem', -0.07, c.r * 1.3, 'trim');
  haft(P, 0.06, top + 0.01, c.r, 'main', { taper: 0.9 });
  for (const y of [0.075, top - 0.03]) band(P, y, c.r, 0.012, 'trim');
  switch (c.kind) {
    case 'crown':
    case 'grand':
    case 'war': {
      const grand = c.kind === 'grand';
      P.add('main', lathe([[c.r, top], [hs * 0.3, top + hs * 0.15], [hs * 0.48, top + hs * 0.5], [hs * 0.42, top + hs * 0.6], [hs * 0.3, top + hs * 0.35], [0.001, top + hs * 0.4]], 14));
      const pts = c.kind === 'war' ? 6 : grand ? 8 : 5;
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * PI * 2;
        if (c.kind === 'war') {
          const fl: V2[] = [[0, 0], [hs * 0.25, hs * 0.1], [hs * 0.3, hs * 0.5], [hs * 0.1, hs * 0.8], [0, hs * 0.7]];
          const g = slab(fl, 0.006);
          g.translate(hs * 0.2, 0, 0);
          g.rotateY(a);
          P.add('main', g, { p: [0, top + hs * 0.2, 0] });
        } else {
          P.add('main', cone(hs * 0.07, hs * 0.4, 4), { p: [Math.cos(a) * hs * 0.44, top + hs * 0.78, Math.sin(a) * hs * 0.44] });
          P.add('trim', sphere(hs * 0.05, 6, 4), { p: [Math.cos(a) * hs * 0.44, top + hs * 1.0, Math.sin(a) * hs * 0.44] });
        }
      }
      if (grand) {
        P.add('gem', gem(hs * 0.45, 'round'), { p: [0, top + hs * 0.6, 0] });
        P.add('trim', torus(hs * 0.45, hs * 0.04, 4, 20), { p: [0, top + hs * 0.25, 0], r: [PI / 2, 0, 0] });
      } else if (c.kind === 'crown') {
        P.add('trim', sphere(hs * 0.15, 8, 6), { p: [0, top + hs * 0.55, 0] });
      } else {
        P.add('main', spike(hs * 0.5, hs * 0.12, 6), { p: [0, top + hs * 0.6, 0] });
      }
      spots.push({ p: v3(0, top + hs * 0.35, hs * 0.38), n: v3(0, 0, 1), s: hs * 0.2 });
      break;
    }
    case 'sprinkler': {
      // A pierced ball for holy water.
      P.add('main', sphere(hs * 0.48, 14, 10), { p: [0, hy, 0] });
      for (const d of sphereDirs(16)) {
        if (d.y < -0.6) continue;
        P.add('dark', sphere(hs * 0.06, 5, 4), { p: [d.x * hs * 0.47, hy + d.y * hs * 0.47, d.z * hs * 0.47] });
      }
      P.add('trim', torus(hs * 0.49, hs * 0.04, 4, 20), { p: [0, hy, 0], r: [PI / 2, 0, 0] });
      P.add('trim', cone(hs * 0.1, hs * 0.25, 6), { p: [0, hy + hs * 0.55, 0] });
      spots.push({ p: v3(0, hy, hs * 0.5), n: v3(0, 0, 1), s: hs * 0.18 });
      break;
    }
    case 'divine': {
      // An orb in a cross of bands, a cross above.
      P.add('gem', sphere(hs * 0.32, 14, 10), { p: [0, hy, 0] });
      P.add('trim', torus(hs * 0.42, hs * 0.04, 4, 22), { p: [0, hy, 0] });
      P.add('trim', torus(hs * 0.42, hs * 0.04, 4, 22), { p: [0, hy, 0], r: [0, PI / 2, 0] });
      P.add('trim', box(hs * 0.06, hs * 0.4, hs * 0.06, 0.003), { p: [0, hy + hs * 0.6, 0] });
      P.add('trim', box(hs * 0.26, hs * 0.06, hs * 0.06, 0.003), { p: [0, hy + hs * 0.66, 0] });
      spots.push({ p: v3(0, hy - hs * 0.45, hs * 0.1), n: v3(0, 0, 1), s: hs * 0.14 });
      break;
    }
    case 'caduceus': {
      // Two serpents twined up the rod, wings at the top.
      for (const ph of [0, PI]) {
        const s = spiral(0.1, top + hs * 0.3, c.r * 2.4, 2.5, ph, 40);
        P.add('trim', tube(s, (t) => c.r * 0.45 * (0.6 + 0.4 * Math.sin(PI * t)), 5));
        const e = s[s.length - 1]!;
        P.add('trim', sphere(c.r * 0.8, 6, 5), { p: [e.x, e.y, e.z], s: [1, 0.8, 1.5] });
      }
      const wing: V2[] = [[0, 0], [hs * 0.3, hs * 0.1], [hs * 0.6, hs * 0.4], [hs * 0.45, hs * 0.38], [hs * 0.5, hs * 0.55], [hs * 0.3, hs * 0.4], [hs * 0.25, hs * 0.5], [0, hs * 0.2]];
      for (const s of [-1, 1]) P.add('trim', slab(wing, 0.005), { p: [0, top + hs * 0.4, 0], s: [s, 1, 1] });
      P.add('trim', sphere(hs * 0.12, 8, 6), { p: [0, top + hs * 0.6, 0] });
      spots.push({ p: v3(0, top + hs * 0.6, hs * 0.1), n: v3(0, 0, 1), s: hs * 0.12 });
      break;
    }
    case 'wrath': {
      // A crown of thorns rising round a black spike.
      P.add('main', lathe([[c.r, top], [hs * 0.3, top + hs * 0.2], [hs * 0.3, top + hs * 0.4], [0.001, top + hs * 0.45]], 10));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * PI * 2;
        P.add('main', spike(hs * (i % 2 ? 0.5 : 0.75), hs * 0.06, 4), aim(v3(Math.cos(a) * hs * 0.25, top + hs * 0.3, Math.sin(a) * hs * 0.25), v3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6)));
      }
      P.add('main', spike(hs * 1.0, hs * 0.1, 5), { p: [0, top + hs * 0.4, 0] });
      for (let i = 0; i < 6; i++) P.add('main', spike(0.018, 0.004, 4), aim(v3(Math.cos(i * 2.5) * c.r, 0.12 + i * 0.04, Math.sin(i * 2.5) * c.r), v3(Math.cos(i * 2.5), 0.3, Math.sin(i * 2.5))));
      spots.push({ p: v3(0, top + hs * 0.3, hs * 0.3), n: v3(0, 0, 1), s: hs * 0.16 });
      break;
    }
    case 'mirrored': {
      // A lozenge mirror in a frame.
      const lz: V2[] = [[0, -hs * 0.5], [hs * 0.36, 0], [0, hs * 0.6], [-hs * 0.36, 0]];
      P.add('trim', slab(lz, 0.016), { p: [0, hy, 0] });
      P.add('glass', slab(lz.map(([x, y]) => [x * 0.82, y * 0.82] as V2), 0.018), { p: [0, hy, 0] });
      for (const [x, y] of lz) P.add('trim', sphere(hs * 0.06, 6, 4), { p: [x * 1.05, hy + y * 1.05, 0] });
      spots.push({ p: v3(0, hy - hs * 0.52, 0.01), n: v3(0, 0, 1), s: hs * 0.14 });
      break;
    }
    case 'solar': {
      P.add('trim', cyl(hs * 0.3, hs * 0.3, hs * 0.1, 18), { p: [0, hy, 0], r: [PI / 2, 0, 0] });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * PI * 2;
        const len = hs * (i % 2 ? 0.28 : 0.45);
        P.add('trim', cone(hs * 0.06, len, 4), aim(v3(Math.cos(a) * (hs * 0.3 + len * 0.5), hy + Math.sin(a) * (hs * 0.3 + len * 0.5), 0), v3(Math.cos(a), Math.sin(a), 0), [1, 1, 0.4]));
      }
      P.add('glow', cyl(hs * 0.2, hs * 0.2, hs * 0.11, 16), { p: [0, hy, 0], r: [PI / 2, 0, 0] });
      spots.push({ p: v3(0, hy, hs * 0.06), n: v3(0, 0, 1), s: hs * 0.2 });
      break;
    }
    case 'judgement': {
      // An upright ring with an eye-stone, wings either side.
      P.add('trim', torus(hs * 0.32, hs * 0.05, 6, 24), { p: [0, hy, 0] });
      P.add('gem', gem(hs * 0.3, 'oval'), { p: [0, hy, 0], r: [PI / 2, 0, 0] });
      const wing: V2[] = [[0, 0], [hs * 0.35, -hs * 0.05], [hs * 0.7, hs * 0.25], [hs * 0.5, hs * 0.22], [hs * 0.6, hs * 0.4], [hs * 0.35, hs * 0.3], [0, hs * 0.18]];
      for (const s of [-1, 1]) P.add('trim', slab(wing, 0.006), { p: [s * hs * 0.3, hy - hs * 0.05, 0], s: [s, 1, 1] });
      P.add('trim', cone(hs * 0.08, hs * 0.3, 6), { p: [0, hy + hs * 0.48, 0] });
      spots.push({ p: v3(0, top, hs * 0.1), n: v3(0, 0, 1), s: hs * 0.12 });
      break;
    }
  }
  if (L.hasTrim) band(P, 0.2, c.r * 1.05, 0.01, 'trim');
  if (wantsRunes(P)) runes(P, 0.1, top - 0.05, c.r * 1.1, c.r * 0.98, L.signature, 3);
  P.anchors.axis = { a: v3(0, top - 0.1, 0), b: v3(0, top + hs, 0), r: hs * 0.4 };
  P.anchors.head = { p: v3(0, hy, 0), r: hs * 0.55 };
  for (let i = 0; i < 6; i++) {
    const a = i * 2.1;
    P.point(v3(Math.cos(a) * c.r, 0.12 + i * 0.04, Math.sin(a) * c.r), v3(Math.cos(a), 0, Math.sin(a)), c.r * 1.6);
  }
  P.anchors.face = { p: v3(0, top - 0.03, c.r * 1.1), n: v3(0, 0, 1), s: 0.016 };
  spots.push({ p: v3(0, top - 0.03, c.r * 1.1), n: v3(0, 0, 1), s: c.r });
  spots.push({ p: v3(0, top - 0.03, -c.r * 1.1), n: v3(0, 0, -1), s: c.r });
  dressGems(P, spots);
}

// ===========================================================================
// ORBS
// ===========================================================================

type OrbKind = 'cracked' | 'eagle' | 'sacred' | 'smoked' | 'crystalline' | 'glowing' | 'heavenly' | 'eldritch' | 'demonheart' | 'vortex' | 'void';

const ORB_CUTS: Record<string, { kind: OrbKind; r: number }> = {
  'orb.cracked': { kind: 'cracked', r: 0.06 },
  'orb.eagle': { kind: 'eagle', r: 0.062 },
  'orb.sacred': { kind: 'sacred', r: 0.065 },
  'orb.smoked': { kind: 'smoked', r: 0.066 },
  'orb.crystalline': { kind: 'crystalline', r: 0.07 },
  'orb.glowing': { kind: 'glowing', r: 0.068 },
  'orb.heavenly': { kind: 'heavenly', r: 0.066 },
  'orb.eldritch': { kind: 'eldritch', r: 0.066 },
  'orb.demonheart': { kind: 'demonheart', r: 0.07 },
  'orb.vortex': { kind: 'vortex', r: 0.07 },
  'orb.void': { kind: 'void', r: 0.072 },
};

const ORB_BY_SHAPE: Record<string, string> = {
  orb: 'orb.cracked',
  'orb.faceted': 'orb.crystalline',
  'orb.rune': 'orb.eldritch',
  focus: 'orb.cracked',
};

export function buildOrb(P: Parts): void {
  const L = P.look;
  const c = cutOf(ORB_CUTS, ORB_BY_SHAPE, L, 'orb.cracked');
  const r = c.r;
  const oy = 0.08 + r;
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  // A short handle and a cup the orb sits on.
  grip(P, -0.05, 0.05, 0.012, 'leather');
  pommel(P, 'knob', -0.05, 0.014, 'trim');
  const cup = () => P.add('trim', lathe([[0.012, 0.05], [0.02, 0.07], [r * 0.55, 0.08 + r * 0.2], [r * 0.5, 0.08 + r * 0.3]], 12));
  switch (c.kind) {
    case 'cracked': {
      cup();
      P.add('crystal', sphere(r, 16, 12), { p: [0, oy, 0] });
      for (let i = 0; i < 7; i++) {
        const d = sphereDirs(7)[i]!;
        P.add('dark', box(0.0025, r * 0.6, 0.0025), aim(v3(0, oy, 0).addScaledVector(d, r * 1.0), v3(d.z, 0.3, -d.x), 1));
      }
      break;
    }
    case 'eagle': {
      P.add('crystal', sphere(r, 16, 12), { p: [0, oy, 0] });
      // Three talons from below.
      P.add('dark', lathe([[0.012, 0.04], [0.02, 0.07], [0.016, 0.085]], 8));
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2;
        const pts = curve([v3(Math.cos(a) * 0.012, 0.08, Math.sin(a) * 0.012), v3(Math.cos(a) * r * 0.9, oy - r * 0.6, Math.sin(a) * r * 0.9), v3(Math.cos(a) * r * 1.05, oy, Math.sin(a) * r * 1.05), v3(Math.cos(a) * r * 0.7, oy + r * 0.6, Math.sin(a) * r * 0.7)], 12);
        P.add('dark', tube(pts, (t) => 0.007 * (1 - 0.7 * t), 5));
      }
      break;
    }
    case 'sacred': {
      cup();
      P.add('crystal', sphere(r, 16, 12), { p: [0, oy, 0] });
      P.add('gold', torus(r * 1.02, 0.004, 4, 28), { p: [0, oy, 0], r: [PI / 2, 0, 0] });
      P.add('gold', torus(r * 1.02, 0.004, 4, 28), { p: [0, oy, 0] });
      P.add('gold', box(0.008, 0.05, 0.008, 0.002), { p: [0, oy + r + 0.022, 0] });
      P.add('gold', box(0.03, 0.008, 0.008, 0.002), { p: [0, oy + r + 0.03, 0] });
      break;
    }
    case 'smoked': {
      P.add('glass', sphere(r, 16, 12), { p: [0, oy, 0] });
      P.add('ghost', sphere(r * 0.7, 10, 8), { p: [0, oy, 0] });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * PI * 2;
        P.add('dark', torus(r * 1.02, 0.0025, 4, 24, PI), { p: [0, oy, 0], r: [0, a, 0] });
      }
      P.add('dark', lathe([[0.012, 0.05], [0.025, 0.08], [r * 0.4, 0.08 + r * 0.12]], 8));
      break;
    }
    case 'crystalline': {
      cup();
      const g = new THREE.IcosahedronGeometry(r, 0);
      P.add('crystal', xf(g, {}), { p: [0, oy, 0] });
      prongs(P, 'trim', 4, 0.07, oy, r * 0.75);
      break;
    }
    case 'glowing': {
      cup();
      P.add('crystal', new THREE.DodecahedronGeometry(r, 0), { p: [0, oy, 0] });
      P.add('glow', sphere(r * 0.45, 10, 8), { p: [0, oy, 0] });
      break;
    }
    case 'heavenly': {
      cup();
      P.add('gold', new THREE.OctahedronGeometry(r, 1), { p: [0, oy, 0] });
      const wing: V2[] = [[0, 0], [0.04, 0.01], [0.09, 0.05], [0.07, 0.055], [0.08, 0.08], [0.05, 0.06], [0.045, 0.08], [0, 0.03]];
      for (const s of [-1, 1]) P.add('gold', slab(wing, 0.005), { p: [s * r * 0.7, oy - 0.01, 0], s: [s, 1, 1] });
      P.add('glow', torus(r * 0.6, 0.003, 3, 20), { p: [0, oy + r + 0.03, 0], r: [PI / 2, 0, 0] });
      break;
    }
    case 'eldritch': {
      cup();
      P.add('crystal', sphere(r * 0.8, 14, 10), { p: [0, oy, 0] });
      P.add('trim', torus(r * 1.15, 0.004, 4, 28), { p: [0, oy, 0], r: [PI / 2 + 0.5, 0.3, 0] });
      P.add('trim', torus(r * 1.3, 0.003, 4, 30), { p: [0, oy, 0], r: [PI / 2 - 0.6, -0.4, 0] });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        P.add('glow', box(0.008, 0.012, 0.002), aim(v3(Math.cos(a) * r * 1.15, 0, Math.sin(a) * r * 1.15).applyEuler(new THREE.Euler(0.5, 0.3, 0)).add(v3(0, oy, 0)), v3(0, 1, 0)));
      }
      break;
    }
    case 'demonheart': {
      // A lump of a heart, veined, its arteries cut short.
      const g = sphere(r, 14, 10);
      g.scale(0.9, 1.1, 0.85);
      P.add('blood', rough(g, r * 0.06, 5, 30), { p: [0, oy, 0], r: [0, 0, 0.25] });
      for (let i = 0; i < 3; i++) {
        const a = -0.6 + i * 0.6;
        P.add('blood', cyl(0.009, 0.012, 0.05, 7), aim(v3(Math.sin(a) * r * 0.4, oy + r * 0.85, 0), v3(Math.sin(a), 1, 0.2)));
      }
      for (let i = 0; i < 6; i++) {
        const d = sphereDirs(6)[i]!;
        const pts = curve([v3(0, oy, 0).addScaledVector(d, r * 0.95), v3(0, oy, 0).addScaledVector(d.clone().add(v3(0.3, -0.3, 0)).normalize(), r * 1.0)], 4);
        P.add('glow', tube(pts, 0.0025, 3));
      }
      P.add('dark', lathe([[0.012, 0.05], [0.02, 0.08], [r * 0.4, 0.08 + r * 0.1]], 8));
      break;
    }
    case 'vortex': {
      // A shell twisting to a point.
      const pts: V3[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const a = t * PI * 5;
        const rr = r * (1 - t) * 0.9;
        pts.push(v3(Math.cos(a) * rr, oy - r * 0.6 + t * r * 1.8, Math.sin(a) * rr));
      }
      P.add('main', tube(pts, (t) => r * 0.45 * (1 - t) + 0.002, 8));
      P.add('glow', sphere(r * 0.25, 8, 6), { p: [0, oy - r * 0.2, 0] });
      cup();
      break;
    }
    case 'void': {
      P.add('dark', sphere(r * 0.85, 16, 12), { p: [0, oy, 0] });
      P.add('glow', torus(r * 1.2, 0.003, 3, 32), { p: [0, oy, 0], r: [PI / 2 + 0.3, 0, 0] });
      for (const d of sphereDirs(10)) P.add('crystal', gem(0.022, 'shard'), aim(v3(0, oy, 0).addScaledVector(d, r * 1.25), d));
      cup();
      break;
    }
  }
  if (L.hasTrim) P.add('trim', torus(0.016, 0.003, 4, 12), { p: [0, 0.05, 0], r: [PI / 2, 0, 0] });
  P.anchors.axis = { a: v3(0, 0.06, 0), b: v3(0, oy + r, 0), r: r * 0.6 };
  P.anchors.head = { p: v3(0, oy, 0), r };
  for (const d of sphereDirs(10)) P.point(v3(0, oy, 0).addScaledVector(d, r), d, r * 0.25);
  P.anchors.face = { p: v3(0, 0.065, 0.02), n: v3(0, 0, 1), s: 0.014 };
  spots.push({ p: v3(0, 0.0, 0.013), n: v3(0, 0, 1), s: 0.011 });
  spots.push({ p: v3(0, 0.065, 0.022), n: v3(0, 0.3, 1), s: 0.01 });
  spots.push({ p: v3(0, 0.065, -0.022), n: v3(0, 0.3, -1), s: 0.01 });
  dressGems(P, spots);
}
