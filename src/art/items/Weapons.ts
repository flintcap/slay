/**
 * SLAY — axes, maces, hammers, mauls and polearms.
 *
 * One authored cut per base, the way `Blades.ts` does swords. A Hand Axe is a
 * small flared bit on a short haft; a Naga is a crescent whose horns curl
 * back; an Ettin Axe has two bits; a Decapitator is a moon of steel. Maces go
 * from a knotted club through flanges and stars to a stone block lashed to a
 * pole. Polearms are a leaf on a stick at the bottom and a vertebral pike of
 * the world's spine at the top.
 *
 * Contract: grip at the origin, head toward +Y, blades toward +X, thin on Z.
 */
import type { Parts, Slot } from './Parts';
import { blade, box, cone, curve, cyl, gem, horn, lathe, rough, slab, sphere, spike, torus, tube, v3, xf, type V3 } from './Geo';
import {
  aim,
  arc2,
  band,
  circle2,
  cutOf,
  dressGems,
  grip,
  haft,
  langets,
  pommel,
  qb,
  runes,

  smooth,
  sphereDirs,
  type PommelKind,
  type V2,
  type Wrap,
} from './Kit';

const PI = Math.PI;

/** Wood hafts take dark iron fittings; metal hafts take the trim. */
function fittingSlot(haftSlot: Slot): Slot {
  return haftSlot === 'wood' || haftSlot === 'bone' ? 'dark' : 'trim';
}

/** True when the look wants glowing marks on its working part. */
function wantsRunes(P: Parts): boolean {
  const L = P.look;
  return L.hasRunes || (L.glow > 0 && L.rarityTier >= 1) || !!L.design;
}

// ===========================================================================
// AXES
// ===========================================================================

type BitKind = 'hand' | 'cleaver' | 'tomahawk' | 'bearded' | 'crescent' | 'hooked' | 'broad' | 'moon' | 'gothic' | 'fan' | 'rune' | 'twin';

interface AxeCut {
  /** Haft length, metres. */
  len: number;
  r: number;
  bit: BitKind;
  /** Bit reach out from the haft (X) and height (Y). */
  bw: number;
  bh: number;
  back: 'none' | 'spike' | 'hammer' | 'bit' | 'small' | 'hook';
  top?: 'spike' | 'cap' | 'none';
  haft: Slot;
  wrap: Wrap;
  /** Top of the grip wrap. */
  grip: number;
  pommel: PommelKind;
  langets?: boolean;
  bands?: number;
  thick?: number;
}

function bitOutline(kind: BitKind, w: number, h: number): { pts: V2[]; holes?: V2[][] } {
  switch (kind) {
    case 'hand':
      return { pts: [[0, 0.17 * h], [0.32 * w, 0.14 * h], ...qb([0.8 * w, 0.5 * h], [1.12 * w, 0], [0.8 * w, -0.5 * h], 10), [0.32 * w, -0.14 * h], [0, -0.17 * h]] };
    case 'cleaver':
      return {
        pts: [[0, 0.36 * h], [0.94 * w, 0.5 * h], ...qb([1.0 * w, 0.46 * h], [1.03 * w, 0], [0.98 * w, -0.5 * h], 6), [0.2 * w, -0.48 * h], [0, -0.28 * h]],
        holes: [circle2(0.22 * w, 0.22 * h, 0.07 * h, 10)],
      };
    case 'tomahawk':
      return { pts: [[0, 0.09 * h], [0.58 * w, 0.1 * h], ...qb([0.86 * w, 0.4 * h], [1.08 * w, 0], [0.86 * w, -0.4 * h], 10), [0.58 * w, -0.1 * h], [0, -0.09 * h]] };
    case 'bearded':
      return { pts: [[0, 0.2 * h], [0.72 * w, 0.32 * h], ...qb([0.98 * w, 0.4 * h], [1.12 * w, -0.12 * h], [0.76 * w, -0.62 * h], 10), [0.5 * w, -0.48 * h], [0.24 * w, -0.2 * h], [0, -0.16 * h]] };
    case 'crescent':
      return {
        pts: [
          [0, 0.14 * h],
          [0.45 * w, 0.16 * h],
          [0.62 * w, 0.42 * h],
          [0.5 * w, 0.62 * h],
          ...arc2(0.38 * w, 0, 0.66 * w, 0.58 * h, 1.15, -1.15, 16),
          [0.5 * w, -0.62 * h],
          [0.62 * w, -0.42 * h],
          [0.45 * w, -0.16 * h],
          [0, -0.14 * h],
        ],
      };
    case 'hooked': {
      // A crescent edge bitten by three notches, and a hook below.
      const edge = arc2(0.3 * w, 0, 0.72 * w, 0.52 * h, 1.05, -1.05, 18).map(([x, y], i) => (i % 6 === 3 ? ([x - 0.12 * w, y] as V2) : ([x, y] as V2)));
      return { pts: [[0, 0.16 * h], [0.4 * w, 0.2 * h], ...edge, [0.52 * w, -0.72 * h], [0.4 * w, -0.4 * h], [0.2 * w, -0.18 * h], [0, -0.16 * h]] };
    }
    case 'broad':
      return { pts: [[0, 0.22 * h], [0.88 * w, 0.46 * h], ...qb([0.95 * w, 0.46 * h], [1.1 * w, -0.05 * h], [0.86 * w, -0.56 * h], 12), [0.55 * w, -0.62 * h], [0.38 * w, -0.34 * h], [0, -0.2 * h]] };
    case 'moon':
      return { pts: [[0, 0.16 * h], [0.25 * w, 0.18 * h], [0.32 * w, 0.48 * h], ...arc2(0.32 * w, 0, 0.68 * w, 0.5 * h, PI / 2, -PI / 2, 22), [0.25 * w, -0.18 * h], [0, -0.16 * h]] };
    case 'gothic':
      return { pts: [[0, 0.2 * h], [0.5 * w, 0.26 * h], [1.0 * w, 0.72 * h], [0.86 * w, 0.32 * h], ...qb([0.86 * w, 0.3 * h], [1.0 * w, 0], [0.86 * w, -0.3 * h], 8), [1.0 * w, -0.72 * h], [0.5 * w, -0.26 * h], [0, -0.2 * h]] };
    case 'fan':
      return {
        pts: [[0, 0.18 * h], [0.3 * w, 0.3 * h], ...arc2(0.3 * w, 0, 0.7 * w, 0.56 * h, 1.3, -1.3, 30, (t) => 1 - 0.07 * Math.abs(Math.sin(t * PI * 5))), [0.3 * w, -0.3 * h], [0, -0.18 * h]],
        holes: [circle2(0.42 * w, 0, 0.12 * h, 12)],
      };
    case 'rune':
      return {
        pts: [[0, 0.14 * h], [0.42 * w, 0.18 * h], [0.56 * w, 0.52 * h], ...arc2(0.36 * w, 0, 0.66 * w, 0.54 * h, 1.2, -1.2, 18), [0.56 * w, -0.52 * h], [0.42 * w, -0.18 * h], [0, -0.14 * h]],
        holes: [circle2(0.4 * w, 0.2 * h, 0.06 * h, 8), circle2(0.4 * w, -0.2 * h, 0.06 * h, 8), circle2(0.6 * w, 0, 0.07 * h, 8)],
      };
    case 'twin':
      return { pts: [[0, 0.2 * h], [0.6 * w, 0.24 * h], ...arc2(0.3 * w, 0, 0.72 * w, 0.62 * h, 1.0, -1.0, 16), [0.6 * w, -0.24 * h], [0, -0.2 * h]] };
  }
}

const AXE_CUTS: Record<string, AxeCut> = {
  // One-handed: hand axes, war axes.
  'axe.hand': { len: 0.5, r: 0.016, bit: 'hand', bw: 0.13, bh: 0.13, back: 'none', haft: 'wood', wrap: 'cord', grip: 0.1, pommel: 'none' },
  'axe.cleaver': { len: 0.46, r: 0.017, bit: 'cleaver', bw: 0.16, bh: 0.2, back: 'none', top: 'cap', haft: 'wood', wrap: 'leather', grip: 0.12, pommel: 'ring', bands: 1 },
  'axe.tomahawk': { len: 0.55, r: 0.013, bit: 'tomahawk', bw: 0.13, bh: 0.11, back: 'spike', haft: 'wood', wrap: 'cloth', grip: 0.14, pommel: 'knob', bands: 2 },
  'axe.war': { len: 0.62, r: 0.017, bit: 'bearded', bw: 0.15, bh: 0.2, back: 'none', haft: 'wood', wrap: 'leather', grip: 0.13, pommel: 'cap', langets: true },
  'axe.naga': { len: 0.64, r: 0.017, bit: 'crescent', bw: 0.17, bh: 0.24, back: 'spike', haft: 'wood', wrap: 'ribbed', grip: 0.14, pommel: 'spike', langets: true },
  'axe.berserker': { len: 0.66, r: 0.018, bit: 'hooked', bw: 0.18, bh: 0.26, back: 'hook', top: 'spike', haft: 'dark', wrap: 'cord', grip: 0.14, pommel: 'skull' },
  'axe.rune': { len: 0.66, r: 0.016, bit: 'rune', bw: 0.17, bh: 0.26, back: 'small', haft: 'main', wrap: 'wire', grip: 0.14, pommel: 'gem' },
  // Two-handed: battle axes, broad axes.
  'axe.battle': { len: 1.05, r: 0.021, bit: 'crescent', bw: 0.2, bh: 0.3, back: 'none', haft: 'wood', wrap: 'leather', grip: 0.3, pommel: 'cap', langets: true, thick: 0.026 },
  'axe.ettin': { len: 1.1, r: 0.022, bit: 'twin', bw: 0.19, bh: 0.3, back: 'bit', top: 'spike', haft: 'wood', wrap: 'leather', grip: 0.32, pommel: 'spike', langets: true, thick: 0.026 },
  'axe.glorious': { len: 1.12, r: 0.022, bit: 'fan', bw: 0.22, bh: 0.34, back: 'bit', top: 'spike', haft: 'main', wrap: 'wire', grip: 0.3, pommel: 'crown', thick: 0.026 },
  'axe.greataxe': { len: 1.18, r: 0.023, bit: 'broad', bw: 0.26, bh: 0.36, back: 'spike', haft: 'wood', wrap: 'leather', grip: 0.34, pommel: 'disc', langets: true, bands: 2, thick: 0.03 },
  'axe.gothic': { len: 1.2, r: 0.023, bit: 'gothic', bw: 0.25, bh: 0.4, back: 'spike', top: 'spike', haft: 'dark', wrap: 'cord', grip: 0.34, pommel: 'spike', thick: 0.03 },
  'axe.decapitator': { len: 1.22, r: 0.024, bit: 'moon', bw: 0.32, bh: 0.48, back: 'hammer', haft: 'dark', wrap: 'leather', grip: 0.36, pommel: 'skull', thick: 0.032 },
  'axe.worldcleaver': { len: 1.28, r: 0.025, bit: 'moon', bw: 0.3, bh: 0.46, back: 'bit', top: 'spike', haft: 'main', wrap: 'wire', grip: 0.36, pommel: 'gem', thick: 0.032 },
};

const AXE_BY_SHAPE: Record<string, string> = {
  axe: 'axe.hand',
  'axe.hand': 'axe.hand',
  'axe.war': 'axe.war',
  'axe.great': 'axe.battle',
  'axe.broad': 'axe.greataxe',
  cleaver: 'axe.cleaver',
  pick: 'axe.tomahawk',
};

export function buildAxe(P: Parts): void {
  const L = P.look;
  const c = cutOf(AXE_CUTS, AXE_BY_SHAPE, L, 'axe.hand');
  const hy = c.len - c.bh * 0.42;
  const fit = fittingSlot(c.haft);
  haft(P, -0.07, c.len + 0.005, c.r, c.haft, { taper: 0.92, sides: 10 });
  grip(P, -0.05, c.grip, c.r * 1.12, c.wrap);
  pommel(P, c.pommel, -0.06, c.r * 1.35, fit);
  for (let i = 0; i < (c.bands ?? 0); i++) band(P, c.grip + 0.03 + i * 0.05, c.r, 0.012, 'dark');

  // The bit: an outline extruded and thinned to its edge.
  const o = bitOutline(c.bit, c.bw, c.bh);
  const thick = c.thick ?? (c.bh > 0.22 ? 0.024 : 0.02);
  const taper = (x: number) => 1 - 0.86 * smooth(c.bw * 0.16, c.bw * 0.98, Math.abs(x));
  const mainSlot: Slot = L.material === 'bone' ? 'bone' : 'main';
  P.add(mainSlot, slab(o.pts, thick, { taper: (x) => taper(x), holes: o.holes, bevel: thick * 0.18 }), { p: [c.r * 0.5, hy, 0] });
  switch (c.back) {
    case 'bit':
      P.add(mainSlot, slab(o.pts, thick, { taper: (x) => taper(x), holes: o.holes, bevel: thick * 0.18 }), { p: [-c.r * 0.5, hy, 0], s: [-1, 1, 1] });
      break;
    case 'small': {
      const s = bitOutline(c.bit, c.bw * 0.5, c.bh * 0.55);
      P.add(mainSlot, slab(s.pts, thick, { taper: (x) => 1 - 0.8 * smooth(c.bw * 0.1, c.bw * 0.5, Math.abs(x)) }), { p: [-c.r * 0.5, hy, 0], s: [-1, 1, 1] });
      break;
    }
    case 'spike':
      P.add(mainSlot, spike(c.bw * 0.55, c.r * 0.9, 4), { p: [-c.r * 0.9, hy, 0], r: [0, 0, PI / 2], s: [1, 1, 0.7] });
      break;
    case 'hammer':
      P.add(mainSlot, box(c.r * 3.2, c.r * 3.2, c.r * 3.2, c.r * 0.4), { p: [-c.r * 2.4, hy, 0] });
      break;
    case 'hook':
      P.add(mainSlot, horn(c.bw * 0.6, c.r * 0.9, 1.3, 5), { p: [-c.r, hy + c.bh * 0.1, 0], r: [0, 0, PI / 2], s: [-1, 1, 0.7] });
      break;
    case 'none':
      break;
  }
  if (c.top === 'spike') P.add(mainSlot, spike(c.bh * 0.5, c.r * 1.1, 4), { p: [0, c.len, 0], s: [1, 1, 0.7] });
  else if (c.top === 'cap') P.add(fit, sphere(c.r * 1.25, 8, 6), { p: [0, c.len, 0] });
  // The socket that holds the bit on the haft.
  const sh = Math.min(c.bh * 0.55, 0.12);
  P.add(fit, cyl(c.r * 1.5, c.r * 1.5, sh, 10), { p: [0, hy, 0] });
  if (c.langets) langets(P, hy - sh * 0.5 - 0.14, hy - sh * 0.5, c.r, fit);
  if (L.hasTrim) {
    P.add('trim', torus(c.r * 1.55, c.r * 0.25, 4, 12), { p: [0, hy + sh * 0.5, 0], r: [PI / 2, 0, 0] });
    P.add('trim', torus(c.r * 1.55, c.r * 0.25, 4, 12), { p: [0, hy - sh * 0.5, 0], r: [PI / 2, 0, 0] });
    for (const s of [-1, 1]) P.add('trim', sphere(c.r * 0.35, 6, 4), { p: [c.bw * 0.22, hy, s * thick * 0.5 * taper(c.bw * 0.22)] });
  }
  const zAt = (x: number) => thick * 0.5 * taper(x) + 0.0008;
  if (wantsRunes(P)) runes(P, hy - c.bh * 0.18, hy + c.bh * 0.18, c.bh * 0.12, zAt(c.bw * 0.45), L.signature, 3, c.bw * 0.45);

  P.anchors.axis = { a: v3(0, c.len * 0.55, 0), b: v3(0, c.len, 0), r: c.r * 2 };
  P.anchors.head = { p: v3(c.bw * 0.5, hy, 0), r: c.bh * 0.5 };
  for (const t of [0.3, 0.55, 0.8]) {
    const x = c.r + t * c.bw * 0.9;
    P.point(v3(x, hy + c.bh * 0.12, zAt(x)), v3(0, 0, 1), c.bh * 0.12);
    P.point(v3(x, hy - c.bh * 0.12, -zAt(x)), v3(0, 0, -1), c.bh * 0.12);
  }
  P.point(v3(0, c.len * 0.75, c.r), v3(0, 0, 1), c.r * 2);
  P.anchors.face = { p: v3(c.bw * 0.36, hy, zAt(c.bw * 0.36)), n: v3(0, 0, 1), s: c.bh * 0.16 };
  dressGems(P, [
    { p: v3(0, hy, c.r * 1.5), n: v3(0, 0, 1), s: c.r * 1.3 },
    { p: v3(c.bw * 0.3, hy, zAt(c.bw * 0.3)), n: v3(0, 0, 1), s: c.bh * 0.14 },
    { p: v3(0, hy, -c.r * 1.5), n: v3(0, 0, -1), s: c.r * 1.3 },
    { p: v3(0, -0.06 - c.r * 1.4, c.r * 0.8), n: v3(0, 0, 1), s: c.r },
    { p: v3(c.bw * 0.3, hy, -zAt(c.bw * 0.3)), n: v3(0, 0, -1), s: c.bh * 0.14 },
    { p: v3(0, c.len * 0.7, c.r), n: v3(0, 0, 1), s: c.r },
  ]);
}

// ===========================================================================
// MACES, HAMMERS, MAULS
// ===========================================================================

type MaceHead = 'club' | 'cudgel' | 'truncheon' | 'knobbed' | 'flanged' | 'star' | 'holy' | 'hammer' | 'battlehammer' | 'legend' | 'maul' | 'greatmaul' | 'thunder' | 'ruin';

interface MaceCut {
  len: number;
  r: number;
  head: MaceHead;
  /** Head size, metres. */
  hs: number;
  haft: Slot;
  wrap: Wrap;
  grip: number;
  pommel: PommelKind;
  n?: number;
}

const MACE_CUTS: Record<string, MaceCut> = {
  'mace.club': { len: 0.6, r: 0.018, head: 'club', hs: 0.1, haft: 'main', wrap: 'cord', grip: 0.1, pommel: 'none' },
  'mace.cudgel': { len: 0.6, r: 0.018, head: 'cudgel', hs: 0.095, haft: 'main', wrap: 'leather', grip: 0.12, pommel: 'knob' },
  'mace.truncheon': { len: 0.56, r: 0.017, head: 'truncheon', hs: 0.075, haft: 'main', wrap: 'leather', grip: 0.13, pommel: 'disc' },
  'mace.mace': { len: 0.6, r: 0.016, head: 'knobbed', hs: 0.11, haft: 'wood', wrap: 'leather', grip: 0.13, pommel: 'ball', n: 8 },
  'mace.flanged': { len: 0.62, r: 0.016, head: 'flanged', hs: 0.14, haft: 'trim', wrap: 'cord', grip: 0.13, pommel: 'cap', n: 7 },
  'mace.devilstar': { len: 0.62, r: 0.016, head: 'star', hs: 0.12, haft: 'dark', wrap: 'leather', grip: 0.13, pommel: 'spike', n: 18 },
  'mace.sanctified': { len: 0.62, r: 0.016, head: 'holy', hs: 0.14, haft: 'trim', wrap: 'wire', grip: 0.13, pommel: 'crown', n: 6 },
  'mace.warhammer': { len: 1.0, r: 0.021, head: 'hammer', hs: 0.09, haft: 'wood', wrap: 'leather', grip: 0.3, pommel: 'cap' },
  'mace.battlehammer': { len: 1.05, r: 0.022, head: 'battlehammer', hs: 0.12, haft: 'wood', wrap: 'cord', grip: 0.32, pommel: 'disc' },
  'mace.legendhammer': { len: 1.08, r: 0.022, head: 'legend', hs: 0.13, haft: 'main', wrap: 'wire', grip: 0.32, pommel: 'crown' },
  'mace.maul': { len: 1.1, r: 0.024, head: 'maul', hs: 0.15, haft: 'wood', wrap: 'leather', grip: 0.34, pommel: 'none' },
  'mace.greatmaul': { len: 1.15, r: 0.026, head: 'greatmaul', hs: 0.2, haft: 'wood', wrap: 'leather', grip: 0.36, pommel: 'cap' },
  'mace.thundermaul': { len: 1.15, r: 0.026, head: 'thunder', hs: 0.19, haft: 'dark', wrap: 'wire', grip: 0.36, pommel: 'spike' },
  'mace.ruinhammer': { len: 1.2, r: 0.027, head: 'ruin', hs: 0.24, haft: 'main', wrap: 'wire', grip: 0.38, pommel: 'gem' },
};

const MACE_BY_SHAPE: Record<string, string> = {
  mace: 'mace.mace',
  'mace.club': 'mace.club',
  'mace.flanged': 'mace.flanged',
  'hammer.war': 'mace.warhammer',
  hammer: 'mace.warhammer',
  'maul.great': 'mace.maul',
  maul: 'mace.maul',
  club: 'mace.club',
  flail: 'mace.devilstar',
  torch: 'mace.club',
  tool: 'mace.warhammer',
};

/** A flange outline, x outward from the axis, centred on y = 0. */
function flangeOutline(F: number, H: number, kind: 'gothic' | 'wing' | 'round'): V2[] {
  if (kind === 'wing') return [[0, -0.5 * H], [0.5 * F, -0.38 * H], [F, 0.1 * H], [1.05 * F, 0.55 * H], [0.6 * F, 0.32 * H], [0.3 * F, 0.5 * H], [0, 0.42 * H]];
  if (kind === 'round') return [[0, -0.42 * H], ...qb([0.3 * F, -0.42 * H], [1.15 * F, 0], [0.3 * F, 0.42 * H], 8), [0, 0.42 * H]];
  return [[0, -0.5 * H], [0.55 * F, -0.42 * H], [F, -0.08 * H], [0.92 * F, 0.28 * H], [0.42 * F, 0.5 * H], [0, 0.56 * H]];
}

function flanges(P: Parts, slot: Slot, n: number, y: number, F: number, H: number, kind: 'gothic' | 'wing' | 'round', core: number, thick: number): void {
  const o = flangeOutline(F, H, kind);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    const g = slab(o, thick, { taper: (x) => 1 - 0.55 * smooth(F * 0.2, F, x) });
    g.translate(core * 0.8, 0, 0);
    g.rotateY(a);
    g.translate(0, y, 0);
    P.add(slot, g);
  }
}

/** A hammer face block along X, centred on (x, y). */
function hammerFace(P: Parts, slot: Slot, x: number, y: number, s: number, sides: number): void {
  const g = lathe([[0.001, -s * 0.5], [s * 0.42, -s * 0.5], [s * 0.5, -s * 0.38], [s * 0.5, s * 0.38], [s * 0.42, s * 0.5], [0.001, s * 0.5]], sides, { smooth: false, phase: sides === 4 ? PI / 4 : PI / 8 });
  P.add(slot, g, { p: [x, y, 0], r: [0, 0, PI / 2] });
}

export function buildMace(P: Parts): void {
  const L = P.look;
  const c = cutOf(MACE_CUTS, MACE_BY_SHAPE, L, 'mace.mace');
  const hs = c.hs;
  const hy = c.len - hs * 0.5;
  const fit = fittingSlot(c.haft);
  const main: Slot = L.material === 'bone' ? 'bone' : 'main';
  const wooden = c.head === 'club' || c.head === 'cudgel';
  if (!wooden) haft(P, -0.07, c.len - hs * 0.3, c.r, c.haft, { taper: 0.95 });
  grip(P, -0.05, c.grip, c.r * 1.12, c.wrap);
  pommel(P, c.pommel, -0.06, c.r * 1.35, fit);
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  let faceP = v3(0, hy, hs * 0.5);
  switch (c.head) {
    case 'club':
    case 'cudgel': {
      // One piece of wood swelling from the hand to a heavy knotted end.
      const prof: V2[] = [[0.001, -0.07]];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const y = -0.07 + t * (c.len + 0.07);
        const sw = c.head === 'club' ? Math.pow(t, 1.8) : Math.pow(t, 1.2) * 0.85;
        prof.push([c.r + (hs * 0.5 - c.r) * sw, y]);
      }
      prof.push([hs * 0.38, c.len + hs * 0.08], [0.001, c.len + hs * 0.12]);
      P.add(main, rough(lathe(prof, 11), 0.0025, L.signature % 97, 30));
      const knots = c.head === 'club' ? 6 : 3;
      for (let k = 0; k < knots; k++) {
        const t = 0.55 + 0.4 * (k / knots);
        const a = k * 2.3;
        const rr = c.r + (hs * 0.5 - c.r) * Math.pow(t, 1.8);
        P.add(main, sphere(hs * 0.12, 6, 5), { p: [Math.cos(a) * rr, -0.07 + t * (c.len + 0.07), Math.sin(a) * rr], s: [1, 1.4, 1] });
      }
      if (c.head === 'cudgel') {
        for (const t of [0.62, 0.78, 0.93]) {
          const y = -0.07 + t * (c.len + 0.07);
          const rr = c.r + (hs * 0.5 - c.r) * Math.pow(t, 1.2) * 0.85;
          band(P, y, rr, 0.016, 'dark');
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * PI * 2 + t * 3;
            P.add('dark', cone(0.007, 0.018, 4), aim(v3(Math.cos(a) * rr * 1.08, y, Math.sin(a) * rr * 1.08), v3(Math.cos(a), 0, Math.sin(a))));
          }
        }
      }
      faceP = v3(0, c.len * 0.8, hs * 0.42);
      spots.push({ p: v3(0, c.len * 0.86, hs * 0.44), n: v3(0, 0, 1), s: hs * 0.2 });
      break;
    }
    case 'truncheon': {
      const prof: V2[] = [[0.001, c.grip], [c.r * 1.2, c.grip]];
      const rings = 6;
      for (let i = 0; i <= rings * 2; i++) {
        const t = i / (rings * 2);
        const y = c.grip + 0.01 + t * (c.len - c.grip - hs * 0.4);
        prof.push([(c.r * 1.25 + t * c.r * 0.6) * (i % 2 ? 1.18 : 1), y]);
      }
      prof.push([hs * 0.5, c.len - hs * 0.35], [hs * 0.55, c.len - hs * 0.15], [hs * 0.35, c.len], [0.001, c.len + 0.004]);
      P.add(main, lathe(prof, 10, { smooth: false }));
      P.add(fit, sphere(hs * 0.22, 8, 6), { p: [0, c.len + hs * 0.08, 0] });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2;
        P.add(main, box(0.008, hs * 0.5, hs * 0.18, 0.002), { p: [Math.cos(a) * hs * 0.5, c.len - hs * 0.2, Math.sin(a) * hs * 0.5], r: [0, -a, 0] });
      }
      spots.push({ p: v3(0, c.len - hs * 0.25, hs * 0.56), n: v3(0, 0, 1), s: hs * 0.25 });
      break;
    }
    case 'knobbed': {
      P.add(main, sphere(hs * 0.42, 14, 10), { p: [0, hy, 0] });
      const n = c.n ?? 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2;
        P.add(main, cone(hs * 0.13, hs * 0.2, 4), aim(v3(Math.cos(a) * hs * 0.4, hy, Math.sin(a) * hs * 0.4), v3(Math.cos(a), 0, Math.sin(a))));
        const b = a + PI / n;
        for (const s of [-1, 1]) P.add(main, cone(hs * 0.09, hs * 0.14, 4), aim(v3(Math.cos(b) * hs * 0.3, hy + s * hs * 0.28, Math.sin(b) * hs * 0.3), v3(Math.cos(b), s * 1.1, Math.sin(b))));
      }
      P.add(main, cone(hs * 0.1, hs * 0.18, 4), { p: [0, hy + hs * 0.46, 0] });
      P.add(fit, cyl(c.r * 1.5, c.r * 1.8, hs * 0.3, 10), { p: [0, hy - hs * 0.48, 0] });
      spots.push({ p: v3(0, hy, hs * 0.42), n: v3(0, 0, 1), s: hs * 0.2 });
      break;
    }
    case 'flanged':
    case 'holy': {
      const holy = c.head === 'holy';
      P.add(main, cyl(c.r * 1.6, c.r * 1.8, hs, 10), { p: [0, hy, 0] });
      flanges(P, main, c.n ?? 7, hy, hs * 0.38, hs, holy ? 'wing' : 'gothic', c.r * 1.6, 0.007);
      P.add(main, cone(c.r * 1.6, hs * 0.3, 8), { p: [0, hy + hs * 0.62, 0] });
      if (holy) {
        P.add('trim', box(hs * 0.05, hs * 0.5, hs * 0.05, 0.003), { p: [0, hy + hs * 0.95, 0] });
        P.add('trim', box(hs * 0.3, hs * 0.05, hs * 0.05, 0.003), { p: [0, hy + hs * 1.05, 0] });
        P.add('trim', torus(hs * 0.48, hs * 0.025, 4, 24), { p: [0, hy + hs * 0.28, 0], r: [PI / 2, 0, 0] });
      }
      P.add(fit, cyl(c.r * 1.7, c.r * 1.5, hs * 0.18, 10), { p: [0, hy - hs * 0.55, 0] });
      spots.push({ p: v3(0, hy - hs * 0.55, c.r * 1.7), n: v3(0, 0, 1), s: c.r * 1.4 });
      faceP = v3(0, hy, c.r * 1.8);
      break;
    }
    case 'star': {
      P.add(main, sphere(hs * 0.38, 14, 10), { p: [0, hy, 0] });
      for (const d of sphereDirs(c.n ?? 18)) {
        if (d.y < -0.8) continue;
        P.add(main, spike(hs * 0.34, hs * 0.07, 5), aim(v3(0, hy, 0).addScaledVector(d, hs * 0.32), d));
      }
      P.add(fit, cyl(c.r * 1.4, c.r * 1.7, hs * 0.25, 10), { p: [0, hy - hs * 0.42, 0] });
      spots.push({ p: v3(0, hy - hs * 0.42, c.r * 1.6), n: v3(0, 0, 1), s: c.r * 1.3 });
      break;
    }
    case 'hammer': {
      // A square face one side, a curved beak the other, a spike on top.
      P.add(main, box(hs * 1.5, hs * 0.55, hs * 0.55, hs * 0.06), { p: [0, hy, 0] });
      hammerFace(P, main, hs * 0.85, hy, hs * 0.8, 4);
      P.add(main, horn(hs * 1.4, hs * 0.26, 0.9, 6), { p: [-hs * 0.7, hy, 0], r: [0, 0, PI / 2], s: [-1, 1, 0.8] });
      P.add(main, spike(hs * 0.7, hs * 0.18, 4), { p: [0, hy + hs * 0.25, 0] });
      langets(P, hy - 0.2, hy - hs * 0.28, c.r, fit);
      spots.push({ p: v3(0, hy, hs * 0.29), n: v3(0, 0, 1), s: hs * 0.32 });
      break;
    }
    case 'battlehammer': {
      const g = lathe(
        [[0.001, -hs * 1.2], [hs * 0.5, -hs * 1.2], [hs * 0.55, -hs * 0.75], [hs * 0.3, -hs * 0.35], [hs * 0.3, hs * 0.35], [hs * 0.55, hs * 0.75], [hs * 0.5, hs * 1.2], [0.001, hs * 1.2]],
        8,
        { smooth: false, phase: PI / 8 },
      );
      P.add(main, g, { p: [0, hy, 0], r: [0, 0, PI / 2] });
      for (const s of [-1, 1]) {
        for (let i = 0; i < 9; i++) {
          const yy = ((i % 3) - 1) * hs * 0.26;
          const zz = (Math.floor(i / 3) - 1) * hs * 0.26;
          P.add(main, cone(hs * 0.1, hs * 0.1, 4), { p: [s * hs * 1.23, hy + yy, zz], r: [0, 0, -s * PI / 2] });
        }
      }
      P.add(fit, cyl(hs * 0.34, hs * 0.34, hs * 0.66, 10), { p: [0, hy, 0], r: [PI / 2, 0, 0] });
      spots.push({ p: v3(0, hy, hs * 0.34), n: v3(0, 0, 1), s: hs * 0.3 });
      break;
    }
    case 'legend': {
      // Two bell faces either side of a sun disc, a crown of points above.
      for (const s of [-1, 1]) {
        const bell = lathe([[0.001, 0], [hs * 0.22, 0], [hs * 0.3, hs * 0.4], [hs * 0.46, hs * 0.85], [hs * 0.48, hs], [0.001, hs]], 12);
        P.add(main, bell, { p: [0, hy, 0], r: [0, 0, -s * PI / 2] });
      }
      P.add('trim', cyl(hs * 0.42, hs * 0.42, hs * 0.22, 18), { p: [0, hy, 0], r: [PI / 2, 0, 0] });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * PI * 2;
        P.add('trim', cone(hs * 0.06, hs * (i % 2 ? 0.16 : 0.26), 4), aim(v3(Math.cos(a) * hs * 0.44, hy + Math.sin(a) * hs * 0.44, 0), v3(Math.cos(a), Math.sin(a), 0), [1, 1, 0.5]));
      }
      for (let i = 0; i < 5; i++) P.add(main, spike(hs * 0.32, hs * 0.05, 4), { p: [(i - 2) * hs * 0.16, hy + hs * 0.36, 0] });
      faceP = v3(0, hy, hs * 0.12);
      spots.push({ p: v3(0, hy, hs * 0.12), n: v3(0, 0, 1), s: hs * 0.3 });
      break;
    }
    case 'maul': {
      // A rough stone block lashed on with leather.
      const block = rough(box(hs * 1.7, hs, hs, hs * 0.12), hs * 0.04, L.signature % 31, 18);
      P.add(main, block, { p: [0, hy, 0] });
      for (const x of [-hs * 0.45, hs * 0.45]) P.add('second', box(hs * 0.14, hs * 1.06, hs * 1.06, 0.003), { p: [x, hy, 0] });
      for (const s of [-1, 1]) {
        P.add('second', box(hs * 0.08, hs * 1.3, 0.006), { p: [0, hy, s * hs * 0.52], r: [0, 0, 0.7] });
        P.add('second', box(hs * 0.08, hs * 1.3, 0.006), { p: [0, hy, s * hs * 0.52], r: [0, 0, -0.7] });
      }
      spots.push({ p: v3(0, hy, hs * 0.53), n: v3(0, 0, 1), s: hs * 0.25 });
      break;
    }
    case 'greatmaul': {
      const drum = lathe([[0.001, -hs * 0.95], [hs * 0.42, -hs * 0.95], [hs * 0.5, -hs * 0.85], [hs * 0.52, 0], [hs * 0.5, hs * 0.85], [hs * 0.42, hs * 0.95], [0.001, hs * 0.95]], 12);
      P.add(main, rough(drum, hs * 0.015, L.signature % 13, 22), { p: [0, hy, 0], r: [0, 0, PI / 2] });
      for (const x of [-hs * 0.62, hs * 0.62]) {
        P.add('dark', cyl(hs * 0.545, hs * 0.545, hs * 0.14, 14), { p: [x, hy, 0], r: [0, 0, PI / 2] });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * PI * 2;
          P.add('dark', sphere(hs * 0.04, 5, 4), { p: [x, hy + Math.cos(a) * hs * 0.56, Math.sin(a) * hs * 0.56] });
        }
      }
      spots.push({ p: v3(0, hy, hs * 0.52), n: v3(0, 0, 1), s: hs * 0.22 });
      break;
    }
    case 'thunder': {
      const prof: V2[] = [[0.001, -hs * 0.9]];
      for (let i = 0; i <= 8; i++) prof.push([hs * (i % 2 ? 0.46 : 0.42), -hs * 0.9 + (i / 8) * hs * 1.8]);
      prof.push([0.001, hs * 0.9]);
      P.add(main, lathe(prof, 12, { smooth: false }), { p: [0, hy, 0], r: [0, 0, PI / 2] });
      for (const s of [-1, 1]) {
        P.add('trim', cyl(hs * 0.3, hs * 0.38, hs * 0.1, 12), { p: [s * hs * 0.95, hy, 0], r: [0, 0, PI / 2] });
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * PI * 2;
          P.add('trim', spike(hs * 0.22, hs * 0.04, 4), { p: [s * hs * 1.0, hy + Math.cos(a) * hs * 0.22, Math.sin(a) * hs * 0.22], r: [0, 0, -s * PI / 2] });
        }
      }
      // A lightning fork round the drum.
      const zig: V3[] = [];
      for (let i = 0; i <= 8; i++) zig.push(v3(-hs * 0.8 + (i / 8) * hs * 1.6, hy + (i % 2 ? 0.3 : -0.3) * hs, hs * 0.47));
      P.add('glow', tube(zig, hs * 0.025, 4));
      const zig2 = zig.map((p) => v3(p.x, 2 * hy - p.y, -p.z));
      P.add('glow', tube(zig2, hs * 0.025, 4));
      spots.push({ p: v3(0, hy + hs * 0.46, 0), n: v3(0, 1, 0), s: hs * 0.2 });
      break;
    }
    case 'ruin': {
      P.add(main, box(hs * 1.4, hs * 0.8, hs * 0.8, hs * 0.05), { p: [0, hy, 0] });
      for (const s of [-1, 1]) {
        P.add(main, box(hs * 0.2, hs * 0.95, hs * 0.95, hs * 0.04), { p: [s * hs * 0.72, hy, 0] });
        hammerFace(P, main, s * hs * 0.9, hy, hs * 0.75, 8);
        P.add('crystal', gem(hs * 0.35, 'shard'), { p: [0, hy, s * hs * 0.42], r: [PI / 2, 0, PI / 4] });
        for (const x of [-hs * 0.55, hs * 0.55]) P.add(main, spike(hs * 0.3, hs * 0.07, 4), { p: [x, hy + s * hs * 0.4, 0], r: s < 0 ? [PI, 0, 0] : [0, 0, 0] });
      }
      faceP = v3(0, hy, hs * 0.41);
      spots.push({ p: v3(hs * 0.5, hy, hs * 0.41), n: v3(0, 0, 1), s: hs * 0.14 });
      break;
    }
  }
  if (L.hasTrim && !wooden) {
    P.add('trim', torus(c.r * 1.4, c.r * 0.3, 4, 12), { p: [0, c.grip + 0.012, 0], r: [PI / 2, 0, 0] });
  }
  if (wantsRunes(P)) runes(P, c.grip + 0.04, Math.min(hy - hs * 0.6, c.grip + 0.04 + 0.2), c.r * 1.2, c.r * 0.98, L.signature, 3);
  P.anchors.axis = { a: v3(0, hy - hs * 0.5, 0), b: v3(0, hy + hs * 0.5, 0), r: hs * 0.5 };
  P.anchors.head = { p: v3(0, hy, 0), r: hs * 0.55 };
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2;
    P.point(v3(Math.cos(a) * hs * 0.5, hy + (i % 2 ? 0.2 : -0.2) * hs, Math.sin(a) * hs * 0.5), v3(Math.cos(a), 0, Math.sin(a)), hs * 0.2);
  }
  P.anchors.face = { p: faceP, n: v3(0, 0, 1), s: hs * 0.22 };
  spots.push({ p: v3(0, -0.06 - c.r * 1.3, c.r), n: v3(0, 0, 1), s: c.r });
  spots.push({ p: v3(0, c.grip + 0.06, c.r * 1.1), n: v3(0, 0, 1), s: c.r });
  dressGems(P, spots);
}

// ===========================================================================
// POLEARMS
// ===========================================================================

type PoleHead = 'leaf' | 'winged' | 'flame' | 'awl' | 'lance' | 'shard' | 'halberd' | 'bardiche' | 'glaive' | 'trident' | 'brandistock' | 'catcher' | 'spine';

interface PoleCut {
  len: number;
  r: number;
  head: PoleHead;
  /** Head length and half width. */
  hl: number;
  hw: number;
  haft: Slot;
  butt: 'spike' | 'cap' | 'ball' | 'none';
  tassel?: boolean;
  bands?: number;
}

const POLE_CUTS: Record<string, PoleCut> = {
  'spear.spear': { len: 1.55, r: 0.016, head: 'leaf', hl: 0.26, hw: 0.034, haft: 'wood', butt: 'cap' },
  'spear.warspear': { len: 1.7, r: 0.017, head: 'winged', hl: 0.34, hw: 0.04, haft: 'wood', butt: 'spike', tassel: true },
  'spear.hyperion': { len: 1.75, r: 0.017, head: 'flame', hl: 0.42, hw: 0.04, haft: 'main', butt: 'ball', bands: 3 },
  'spear.pike': { len: 2.1, r: 0.016, head: 'awl', hl: 0.22, hw: 0.014, haft: 'wood', butt: 'none' },
  'spear.lance': { len: 2.0, r: 0.022, head: 'lance', hl: 1.2, hw: 0.05, haft: 'main', butt: 'cap' },
  'spear.ghost': { len: 2.0, r: 0.015, head: 'shard', hl: 0.48, hw: 0.04, haft: 'main', butt: 'spike' },
  'spear.worldspine': { len: 2.05, r: 0.018, head: 'spine', hl: 0.4, hw: 0.04, haft: 'bone', butt: 'spike' },
  'spear.halberd': { len: 1.75, r: 0.019, head: 'halberd', hl: 0.42, hw: 0.17, haft: 'wood', butt: 'spike', bands: 2 },
  'spear.bardiche': { len: 1.7, r: 0.02, head: 'bardiche', hl: 0.62, hw: 0.14, haft: 'wood', butt: 'cap' },
  'spear.thresher': { len: 1.8, r: 0.021, head: 'glaive', hl: 0.6, hw: 0.11, haft: 'dark', butt: 'spike' },
  'spear.trident': { len: 1.65, r: 0.017, head: 'trident', hl: 0.3, hw: 0.08, haft: 'wood', butt: 'cap' },
  'spear.brandistock': { len: 1.7, r: 0.017, head: 'brandistock', hl: 0.46, hw: 0.08, haft: 'wood', butt: 'ball', bands: 2 },
  'spear.mancatcher': { len: 1.75, r: 0.018, head: 'catcher', hl: 0.34, hw: 0.11, haft: 'dark', butt: 'spike' },
};

const POLE_BY_SHAPE: Record<string, string> = {
  spear: 'spear.spear',
  pike: 'spear.pike',
  halberd: 'spear.halberd',
  trident: 'spear.trident',
  glaive: 'spear.thresher',
  scythe: 'spear.thresher',
  polearm: 'spear.halberd',
  lance: 'spear.lance',
  shovel: 'spear.spear',
};

/** A spearhead along +Y from y0, `half(t)` its half width. */
function spearhead(P: Parts, slot: Slot, y0: number, len: number, hw: number, half: (t: number) => number, thick: number, ridge = true): void {
  const g = blade({ len, steps: 14, half: (t) => [hw * half(t), hw * half(t)], spine: (t) => thick * (1 - 0.7 * t), bevel: ridge ? 0.14 : 0.45 });
  g.translate(0, y0, 0);
  P.add(slot, g);
}

const leafHalf = (t: number) => (0.35 + 0.65 * Math.sin(PI * Math.min(1, t / 0.7) * 0.5 + 0.2)) * (t > 0.55 ? Math.pow(1 - (t - 0.55) / 0.45, 0.9) : 1);

export function buildPole(P: Parts): void {
  const L = P.look;
  const c = cutOf(POLE_CUTS, POLE_BY_SHAPE, L, 'spear.spear');
  const fit = fittingSlot(c.haft);
  const main: Slot = L.material === 'bone' ? 'bone' : L.material === 'crystal' ? 'crystal' : 'main';
  const top = c.len;
  const hy0 = top - c.hl;
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  let faceP = v3(0, hy0 - 0.02, c.r * 1.4);

  if (c.head === 'spine') {
    // A shaft of vertebrae, each a disc with its spur, up to a fang.
    const n = 26;
    const y0 = -0.18;
    const step = (hy0 - y0) / n;
    for (let i = 0; i < n; i++) {
      const y = y0 + (i + 0.5) * step;
      P.add('bone', lathe([[0.001, -step * 0.5], [c.r * 1.2, -step * 0.45], [c.r * 1.45, -step * 0.1], [c.r * 1.45, step * 0.1], [c.r * 1.2, step * 0.45], [0.001, step * 0.5]], 9), { p: [0, y, 0] });
      P.add('bone', cone(c.r * 0.5, c.r * 2.2, 4), { p: [0, y, -c.r * 1.6], r: [-PI / 2 - 0.4, 0, 0], s: [1, 1, 0.6] });
      if (i % 2 === 0) for (const s of [-1, 1]) P.add('bone', cone(c.r * 0.35, c.r * 1.6, 4), { p: [s * c.r * 1.5, y, 0], r: [0, 0, -s * (PI / 2 - 0.3)], s: [1, 1, 0.6] });
    }
    P.add('bone', horn(c.hl, c.hw, 0.35, 7), { p: [0, hy0, 0] });
    P.add('bone', sphere(c.r * 2, 9, 7), { p: [0, hy0, 0] });
  } else {
    haft(P, -0.18, hy0 + 0.02, c.r, c.haft, { taper: 0.95 });
  }
  // Sockets and the butt.
  if (c.head !== 'spine' && c.head !== 'lance') {
    P.add(fit, lathe([[c.r * 1.05, hy0 - 0.08], [c.r * 1.25, hy0 - 0.01], [c.r * 1.5, hy0 + 0.01], [c.r * 0.8, hy0 + 0.04]], 10), {});
    band(P, hy0 - 0.08, c.r * 1.05, 0.012, fit);
  }
  if (c.butt === 'spike') P.add(fit, cone(c.r * 1.05, 0.1, 6), { p: [0, -0.23, 0], r: [PI, 0, 0] });
  else if (c.butt === 'cap') P.add(fit, cyl(c.r * 1.15, c.r * 1.05, 0.05, 10), { p: [0, -0.18, 0] });
  else if (c.butt === 'ball') P.add(fit, sphere(c.r * 1.5, 9, 7), { p: [0, -0.19, 0] });
  for (let i = 0; i < (c.bands ?? 0); i++) band(P, 0.35 + i * 0.35, c.r, 0.014, fit === 'dark' ? 'dark' : 'trim');
  if (c.tassel) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2;
      P.add('cloth', tube(curve([v3(0, hy0 - 0.09, 0), v3(Math.cos(a) * 0.02, hy0 - 0.12, Math.sin(a) * 0.02), v3(Math.cos(a) * 0.035, hy0 - 0.2, Math.sin(a) * 0.035)], 5), (t) => 0.005 * (1 - t * 0.6), 4));
    }
  }

  switch (c.head) {
    case 'leaf':
      spearhead(P, main, hy0, c.hl, c.hw, leafHalf, c.hw * 0.5);
      break;
    case 'winged':
      spearhead(P, main, hy0 + 0.04, c.hl - 0.04, c.hw, leafHalf, c.hw * 0.5);
      for (const s of [-1, 1]) P.add(main, slab([[0, 0], [0.07, 0.02], [0.05, 0.035], [0, 0.03]], 0.008), { p: [s * c.r, hy0, 0], s: [s, 1, 1] });
      break;
    case 'flame': {
      spearhead(P, main, hy0 + 0.05, c.hl - 0.05, c.hw, (t) => (0.75 + 0.22 * Math.sin(t * PI * 7)) * (t > 0.6 ? Math.pow(1 - (t - 0.6) / 0.4, 0.8) : 1), c.hw * 0.45);
      P.add(fit, box(0.16, 0.014, 0.014, 0.004), { p: [0, hy0 + 0.04, 0] });
      for (const s of [-1, 1]) P.add(fit, torus(0.02, 0.004, 4, 10, PI), { p: [s * 0.08, hy0 + 0.04, 0], r: [0, 0, s > 0 ? -PI / 2 : PI / 2] });
      break;
    }
    case 'awl':
      spearhead(P, main, hy0, c.hl, c.hw, (t) => 1 - 0.95 * t, c.hw * 1.5, true);
      P.add(fit, cyl(c.r * 2.2, c.r * 2.2, 0.01, 10), { p: [0, hy0 - 0.12, 0] });
      break;
    case 'lance': {
      // A long cone from a round vamplate near the hand.
      const vy = 0.16;
      P.add(main, lathe([[0.001, vy - 0.05], [0.09, vy], [0.1, vy + 0.015], [c.r * 1.6, vy + 0.13], [0.001, vy + 0.14]], 16));
      P.add(main, lathe([[c.r * 1.6, vy + 0.12], [c.hw, vy + 0.2], [c.hw * 0.8, vy + 0.5], [c.hw * 0.25, top - 0.05], [0.001, top]], 12));
      for (let i = 0; i < 4; i++) band(P, vy + 0.3 + i * 0.25, c.hw * (0.93 - i * 0.16), 0.012, 'trim');
      faceP = v3(0, vy + 0.06, 0.06);
      spots.push({ p: v3(0, vy + 0.045, 0.07), n: v3(0, 0.6, 1), s: 0.02 });
      break;
    }
    case 'shard': {
      P.add('crystal', xf(gem(c.hl, 'shard'), { s: [c.hw * 3.5 / c.hl, 1, c.hw * 2 / c.hl] }), { p: [0, hy0 + c.hl * 0.5, 0] });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * PI * 2;
        P.add('crystal', gem(0.05, 'shard'), { p: [Math.cos(a) * 0.05, hy0 + 0.04, Math.sin(a) * 0.05], r: [Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4] });
      }
      break;
    }
    case 'halberd': {
      // Axe blade forward, spike up, hook back.
      spearhead(P, main, hy0 + c.hl * 0.45, c.hl * 0.55, 0.022, (t) => 1 - t, 0.016);
      const bit = bitOutline('broad', c.hw, c.hl * 0.42);
      P.add(main, slab(bit.pts, 0.012, { taper: (x) => 1 - 0.85 * smooth(c.hw * 0.2, c.hw, x) }), { p: [c.r, hy0 + c.hl * 0.3, 0] });
      P.add(main, horn(c.hw * 0.7, 0.012, 1.1, 5), { p: [-c.r, hy0 + c.hl * 0.3, 0], r: [0, 0, PI / 2], s: [-1, 1, 0.6] });
      langets(P, hy0 - 0.2, hy0, c.r, fit);
      faceP = v3(c.hw * 0.5, hy0 + c.hl * 0.3, 0.006);
      break;
    }
    case 'bardiche': {
      // A long crescent fixed to the shaft at two points, its tip past the top.
      const o: V2[] = [[0, -0.5 * c.hl], [0.3 * c.hw, -0.46 * c.hl], ...qb([0.7 * c.hw, -0.3 * c.hl], [1.15 * c.hw, 0.1 * c.hl], [0.2 * c.hw, 0.56 * c.hl], 14), [0, 0.42 * c.hl]];
      P.add(main, slab(o, 0.012, { taper: (x) => 1 - 0.85 * smooth(c.hw * 0.25, c.hw, x) }), { p: [c.r * 0.8, hy0 + c.hl * 0.4, 0] });
      for (const y of [hy0 + c.hl * 0.0, hy0 + c.hl * 0.6]) band(P, y, c.r * 1.05, 0.03, fit);
      faceP = v3(c.hw * 0.4, hy0 + c.hl * 0.35, 0.006);
      break;
    }
    case 'glaive': {
      // A great single-edged knife on a pole, its back notched.
      const g = blade({
        len: c.hl,
        steps: 16,
        half: (t) => [c.hw * (0.7 + 0.5 * Math.sin(PI * t * 0.8)) * (t > 0.85 ? (1 - t) / 0.15 : 1), c.hw * 0.35 * (1 - t)],
        spine: (t) => 0.018 * (1 - 0.6 * t),
        bend: (t) => -0.08 * t * t,
        backed: true,
      });
      g.translate(c.hw * 0.25, hy0, 0);
      P.add(main, g);
      P.add(main, spike(0.07, 0.01, 4), { p: [-c.hw * 0.15, hy0 + c.hl * 0.3, 0], r: [0, 0, PI / 2 - 0.3], s: [1, 1, 0.6] });
      P.add(main, spike(0.05, 0.008, 4), { p: [-c.hw * 0.2, hy0 + c.hl * 0.55, 0], r: [0, 0, PI / 2 - 0.4], s: [1, 1, 0.6] });
      langets(P, hy0 - 0.2, hy0, c.r, fit);
      faceP = v3(c.hw * 0.4, hy0 + c.hl * 0.3, 0.008);
      break;
    }
    case 'trident': {
      P.add(fit, tube(curve([v3(-c.hw, hy0 + 0.1, 0), v3(-c.hw * 0.8, hy0 + 0.04, 0), v3(0, hy0 + 0.02, 0), v3(c.hw * 0.8, hy0 + 0.04, 0), v3(c.hw, hy0 + 0.1, 0)], 14), 0.009, 6));
      for (const s of [-1, 0, 1]) {
        const x = s * c.hw;
        const y0 = s === 0 ? hy0 + 0.02 : hy0 + 0.1;
        const len = s === 0 ? c.hl : c.hl * 0.65;
        P.add(main, cyl(0.006, 0.008, len * 0.75, 6), { p: [x, y0 + len * 0.37, 0] });
        spearhead(P, main, y0 + len * 0.7, len * 0.3, 0.016, (t) => (t < 0.3 ? 1 + t : 1.3 * (1 - (t - 0.3) / 0.7)), 0.01);
      }
      break;
    }
    case 'brandistock': {
      spearhead(P, main, hy0 + 0.04, c.hl, 0.016, (t) => 1 - 0.9 * t, 0.012);
      for (const s of [-1, 1]) {
        const g = blade({ len: c.hl * 0.4, steps: 8, half: (t) => [0.01 * (1 - t), 0.01 * (1 - t)], spine: () => 0.008 });
        P.add(main, g, { p: [s * 0.012, hy0 + 0.05, 0], r: [0, 0, -s * 0.45] });
      }
      P.add(fit, box(0.06, 0.02, 0.022, 0.004), { p: [0, hy0 + 0.04, 0] });
      break;
    }
    case 'catcher': {
      // A forked U lined with inward spikes, a short point between.
      const u = curve([v3(-c.hw, hy0 + c.hl, 0), v3(-c.hw, hy0 + c.hl * 0.4, 0), v3(0, hy0 + 0.02, 0), v3(c.hw, hy0 + c.hl * 0.4, 0), v3(c.hw, hy0 + c.hl, 0)], 22);
      P.add(main, tube(u, 0.009, 6));
      for (let i = 2; i < u.length - 2; i += 3) {
        const p = u[i]!;
        const inward = v3(-p.x, 0, 0).add(v3(0, hy0 + c.hl * 0.6 - p.y, 0)).normalize();
        P.add(main, spike(0.03, 0.005, 4), aim(p, inward));
      }
      for (const s of [-1, 1]) P.add(main, spike(0.06, 0.008, 4), { p: [s * c.hw, hy0 + c.hl, 0], r: [0, 0, s * 0.5] });
      spearhead(P, main, hy0 + 0.02, c.hl * 0.45, 0.014, (t) => 1 - t, 0.01);
      break;
    }
    case 'spine':
      break;
  }

  if (L.hasTrim && c.head !== 'spine') {
    P.add('trim', torus(c.r * 1.3, c.r * 0.3, 4, 12), { p: [0, hy0 - 0.1, 0], r: [PI / 2, 0, 0] });
    P.add('trim', torus(c.r * 1.2, c.r * 0.3, 4, 12), { p: [0, 0.12, 0], r: [PI / 2, 0, 0] });
  }
  if (wantsRunes(P)) runes(P, hy0 - 0.4, hy0 - 0.12, c.r * 1.3, c.r * 1.02, L.signature, 3);
  P.anchors.axis = { a: v3(0, hy0, 0), b: v3(0, top, 0), r: Math.max(c.hw * 0.6, 0.02) };
  P.anchors.head = { p: v3(0, hy0 + c.hl * 0.5, 0), r: Math.max(c.hw, 0.04) };
  P.anchors.grip = { a: v3(0, -0.1, 0), b: v3(0, 0.5, 0) };
  for (let i = 0; i < 6; i++) {
    const y = hy0 - 0.5 + i * 0.08;
    const a = i * 2.1;
    P.point(v3(Math.cos(a) * c.r, y, Math.sin(a) * c.r), v3(Math.cos(a), 0, Math.sin(a)), c.r * 2);
  }
  P.anchors.face = { p: faceP, n: v3(0, 0, 1), s: 0.025 };
  spots.unshift({ p: v3(0, hy0 - 0.03, c.r * 1.35), n: v3(0, 0, 1), s: c.r * 1.2 });
  spots.push({ p: v3(0, hy0 - 0.03, -c.r * 1.35), n: v3(0, 0, -1), s: c.r * 1.2 });
  spots.push({ p: v3(0, -0.19, c.r * 1.2), n: v3(0, 0, 1), s: c.r });
  dressGems(P, spots);

}
