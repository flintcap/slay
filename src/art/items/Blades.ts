/**
 * SLAY — swords and daggers.
 *
 * One authored cut per base. A Gladius is a leaf blade on a block guard with a
 * ribbed grip; a Falchion is a single-edged blade that swells to a clipped
 * point over drooping quillons; an Estoc is a long stiff triangle on a ringed
 * hilt. Tiers in a family share a role, never a silhouette.
 *
 * `w` is the blade's half width at its root, metres.
 */
import type { Parts } from './Parts';
import { blade, box, cone, spike, v3 } from './Geo';
import { clamp01, grip, guard, pommel, runes, setGem, smooth, type GuardKind, type PommelKind, type Wrap } from './Kit';

export type Tip = 'point' | 'spear' | 'round' | 'leaf' | 'clip' | 'needle' | 'flame' | 'tusk' | 'cleaver' | 'fang';

export interface BladeCut {
  len: number;
  w: number;
  /** Width at the tip end of the body, as a share of `w`. */
  taper?: number;
  tip: Tip;
  /** Spine thickness, metres (default from width). */
  thick?: number;
  /** Fuller length as a share of the blade, 0 for none. */
  fuller?: number;
  /** Diamond section with a hard central ridge. */
  ridge?: boolean;
  /** Square section (needles): all point, no edge. */
  square?: boolean;
  /** Single edge with a flat back. */
  backed?: boolean;
  /** Sideways bend of the tip, metres. */
  curve?: number;
  /** Edge waves (flame blades). */
  waves?: number;
  /** Saw teeth on the back edge. */
  serrate?: number;
  /** Leather-wrapped ricasso length above the guard, with parrying lugs. */
  ricasso?: number;
  /** A glowing window down the fuller. */
  window?: boolean;
  /** The blade in floating segments joined by light. */
  phase?: boolean;
  /** Half a blade, snapped (with `ghost` the rest is light). */
  broken?: boolean;
  guard: GuardKind;
  guardW: number;
  guardD?: number;
  grip: number;
  gripR?: number;
  wrap: Wrap;
  pommel: PommelKind;
  pommelS?: number;
}

/** Half widths [edge side, back side] along the blade for a tip kind. */
function halfWidths(c: BladeCut): (t: number) => [number, number] {
  const w = c.w;
  const tap = c.taper ?? 0.8;
  const body = (t: number) => w * (1 - (1 - tap) * t);
  const ogive = (t: number, from: number) => (t <= from ? 1 : Math.sqrt(Math.max(0, 1 - ((t - from) / (1 - from)) ** 2)));
  const point = (t: number, from: number, pw = 1) => (t <= from ? 1 : Math.pow(Math.max(0, 1 - (t - from) / (1 - from)), pw));
  switch (c.tip) {
    case 'point':
      return (t) => {
        const k = body(t) * ogive(t, 0.8) * point(t, 0.9, 0.6);
        return [k, k];
      };
    case 'spear':
      return (t) => {
        const k = body(t) * point(t, 0.5, 0.9);
        return [k, k];
      };
    case 'round':
      return (t) => {
        const k = body(t) * ogive(t, 0.9);
        return [k, k];
      };
    case 'leaf':
      return (t) => {
        const k = w * (0.86 + 0.24 * Math.sin(Math.PI * clamp01(t / 0.82))) * point(t, 0.72, 1.3);
        return [k, k];
      };
    case 'clip':
      return (t) => {
        const edge = w * (0.92 + 0.42 * smooth(0, 0.72, t)) * ogive(t, 0.74);
        const back = w * 0.42 * point(t, 0.8, 1.2);
        return [edge, back];
      };
    case 'needle':
      return (t) => {
        const k = body(t) * point(t, 0.86, 1);
        return [k, k];
      };
    case 'flame':
      return (t) => {
        const wave = 1 + 0.16 * Math.sin(t * Math.PI * 2 * (c.waves ?? 5)) * (1 - smooth(0.75, 0.95, t));
        const k = body(t) * wave * point(t, 0.82, 0.8);
        return [k, k];
      };
    case 'tusk':
      return (t) => {
        const k = w * (1 - 0.75 * Math.pow(t, 1.4));
        return [k, k * 0.45];
      };
    case 'cleaver':
      return (t) => {
        const k = w * (0.85 + 0.3 * t) * (t > 0.9 ? 1 - (t - 0.9) * 4 : 1);
        const back = w * 0.7 * (t > 0.82 ? Math.max(0.05, 1 - (t - 0.82) * 5.2) : 1);
        return [k, back];
      };
    case 'fang':
      return (t) => {
        const k = w * (1.05 - 0.4 * t) * point(t, 0.55, 1.1);
        return [k, k * 0.55];
      };
  }
}

function bladeBody(P: Parts, c: BladeCut, y0: number): { tipY: number } {
  const L = P.look;
  let len = c.len;
  const half = halfWidths(c);
  const thick = c.thick ?? (c.square ? c.w * 1.6 : c.w * 0.36);
  const fullerLen = c.fuller ?? 0;
  const bend = c.curve ? (t: number) => c.curve! * t * t : undefined;
  const backed = c.backed || c.tip === 'tusk' || c.tip === 'cleaver' || c.tip === 'fang';
  const spine = (t: number) => thick * (1 - 0.55 * t);
  const fuller = fullerLen > 0 ? (t: number) => 0.6 * smooth(0.02, 0.08, t) * (1 - smooth(fullerLen - 0.08, fullerLen, t)) : undefined;
  const bevel = c.square ? 0.02 : c.ridge ? 0.12 : 0.45;
  const slot = L.material === 'bone' ? 'bone' : 'main';
  const make = (from: number, to: number, mainSlot: 'main' | 'bone' | 'ghost') => {
    const g = blade({
      len: (to - from) * len,
      steps: Math.max(4, Math.round(18 * (to - from))),
      half: (t) => half(from + t * (to - from)),
      spine: (t) => spine(from + t * (to - from)),
      fuller: fuller ? (t) => fuller(from + t * (to - from)) : undefined,
      bend: bend ? (t) => bend(from + t * (to - from)) - bend(from) : undefined,
      bevel,
      backed,
    });
    g.translate(bend ? bend(from) : 0, y0 + from * len, 0);
    P.add(mainSlot === 'bone' ? 'bone' : mainSlot, g);
  };
  if (c.broken || L.cutOverride?.broken) {
    // Snapped at the middle; with `ghost` the missing half is light.
    make(0, 0.52, slot === 'bone' ? 'bone' : 'main');
    for (let i = 0; i < 4; i++) {
      const t = 0.52;
      const [wr, wl] = half(t);
      const x = -wl + ((i + 0.5) / 4) * (wr + wl);
      P.add('main', cone(Math.min(wr, wl) * 0.35, len * 0.05 * (1 + (i % 2)), 3), { p: [x, y0 + t * len + len * 0.02, 0], s: [1, 1, 0.4] });
    }
    if (L.features.includes('ghost')) make(0.5, 1, 'ghost');
  } else if (c.phase) {
    // Three shards hanging in a line, joined by light.
    const cuts: Array<[number, number]> = [
      [0, 0.38],
      [0.45, 0.7],
      [0.77, 1],
    ];
    for (const [a, b] of cuts) make(a, b, 'main');
    for (const [a, b] of [
      [0.38, 0.45],
      [0.7, 0.77],
    ] as Array<[number, number]>) {
      const [wr] = half(a);
      P.add('glow', box(wr * 1.1, (b - a) * len * 1.05, thick * 0.4, 0.002), { p: [0, y0 + ((a + b) / 2) * len, 0] });
    }
  } else {
    make(0, 1, slot === 'bone' ? 'bone' : 'main');
  }
  if (c.serrate) {
    const n = c.serrate;
    for (let i = 0; i < n; i++) {
      const t = 0.12 + (0.62 * (i + 0.5)) / n;
      const [, wl] = half(t);
      const x = -wl + (bend ? bend(t) : 0);
      P.add(slot, cone(c.w * 0.14, c.w * 0.42, 3), { p: [x - c.w * 0.12, y0 + t * len, 0], r: [0, 0, Math.PI * 0.62], s: [1, 1, 0.45] });
    }
  }
  if (c.ricasso) {
    grip(P, y0, y0 + c.ricasso, c.w * 0.62, 'leather');
    for (const s of [-1, 1]) {
      P.add('trim', spike(c.w * 1.1, c.w * 0.18, 5), { p: [s * c.w * 0.6, y0 + c.ricasso + c.w * 0.1, 0], r: [0, 0, -s * 1.15] });
    }
  }
  if (c.window) {
    P.add('glow', box(c.w * 0.32, len * 0.42, thick * 1.02, 0.002), { p: [0, y0 + len * 0.28, 0] });
  }
  len = c.len;
  P.anchors.axis = { a: v3(0, y0, 0), b: v3(bend ? bend(1) : 0, y0 + len, 0), r: c.w };
  P.anchors.head = { p: v3(bend ? bend(0.8) : 0, y0 + len * 0.8, 0), r: c.w };
  for (let i = 0; i < 6; i++) {
    const t = 0.12 + (i / 5) * 0.7;
    const x = bend ? bend(t) : 0;
    const z = spine(t) * 0.5;
    P.point(v3(x, y0 + t * len, z), v3(0, 0, 1), c.w);
    P.point(v3(x, y0 + t * len, -z), v3(0, 0, -1), c.w);
  }
  // Rarity: a trim collar at the root, runes down the fuller.
  if (L.hasTrim && !c.ricasso && c.guard !== 'none') {
    const [wr, wl] = half(0.02);
    P.add('trim', box(wr + wl + 0.004, c.w * 0.4, thick * 1.25, 0.002), { p: [(wr - wl) / 2, y0 + c.w * 0.2, 0] });
  }
  const glowBase = L.glowColor !== undefined && (L.hasRunes || (L.glow > 0 && L.rarityTier >= 1) || !!L.design);
  if (glowBase && L.material !== 'crystal' && !c.window) {
    runes(P, y0 + len * 0.1, y0 + len * Math.max(0.45, fullerLen * 0.9), c.w * 0.55, spine(0.3) * 0.5 * (fuller ? 0.45 : 1) + 0.0008, L.signature, undefined);
  }
  return { tipY: y0 + len };
}

/** Builds a sword or dagger from its cut. */
export function buildBlade(P: Parts, c: BladeCut): void {
  const L = P.look;
  const half = c.grip / 2;
  const gr = c.gripR ?? (c.grip > 0.2 ? 0.017 : c.grip > 0.11 ? 0.015 : 0.012);
  grip(P, -half, half, gr, c.wrap);
  const ps = c.pommelS ?? gr * 1.6;
  pommel(P, c.pommel, -half, ps);
  const gd = c.guardD ?? Math.max(0.016, c.w * 0.55);
  const y0 = guard(P, c.guard, half, c.guardW, gd);
  bladeBody(P, c, y0);
  P.anchors.face = { p: v3(0, half + gd * 0.6, gd * 0.7), n: v3(0, 0, 1), s: Math.min(c.guardW * 0.3, 0.03) };
  // Stones: the pommel first, then the guard's face.
  let gems = L.gemCount;
  if (gems > 0 && c.pommel !== 'gem' && c.pommel !== 'none') {
    setGem(P, v3(0, -half - ps * 0.95, ps * 0.62), v3(0, 0, 1), ps * 0.8);
    gems--;
  }
  if (gems > 0 && c.guard !== 'none') {
    setGem(P, v3(0, half + gd * 0.55, gd * 0.68), v3(0, 0, 1), Math.min(0.02, c.guardW * 0.12));
    setGem(P, v3(0, half + gd * 0.55, -gd * 0.68), v3(0, 0, -1), Math.min(0.02, c.guardW * 0.12));
    gems--;
  }
  if (gems > 0) {
    for (const s of [-1, 1]) setGem(P, v3(s * c.guardW * 0.36, half + gd * 0.6, gd * 0.5), v3(0, 0, 1), Math.min(0.014, c.guardW * 0.08));
  }
}

// ---------------------------------------------------------------------------
// The cuts. One per base.
// ---------------------------------------------------------------------------

export const BLADE_CUTS: Record<string, BladeCut> = {
  // Short swords: point, leaf, clip, shards.
  'sword.short': { len: 0.6, w: 0.033, taper: 0.75, tip: 'point', fuller: 0.55, guard: 'bar', guardW: 0.16, grip: 0.12, wrap: 'leather', pommel: 'disc', pommelS: 0.022 },
  'sword.gladius': { len: 0.54, w: 0.036, tip: 'leaf', ridge: true, guard: 'block', guardW: 0.1, guardD: 0.04, grip: 0.11, wrap: 'ribbed', pommel: 'ball', pommelS: 0.03 },
  'sword.falchion': { len: 0.62, w: 0.036, tip: 'clip', backed: true, curve: 0.035, fuller: 0.4, guard: 'drooping', guardW: 0.17, grip: 0.12, wrap: 'cord', pommel: 'scent', pommelS: 0.018 },
  'sword.phase': { len: 0.72, w: 0.032, taper: 0.7, tip: 'spear', ridge: true, phase: true, guard: 'winged', guardW: 0.2, grip: 0.13, wrap: 'wire', pommel: 'gem', pommelS: 0.02 },
  // Broad swords: round, tusk, ridged under a sun.
  'sword.broad': { len: 0.72, w: 0.05, taper: 0.9, tip: 'round', fuller: 0.72, guard: 'bar', guardW: 0.26, grip: 0.14, wrap: 'leather', pommel: 'wheel', pommelS: 0.028 },
  'sword.tusk': { len: 0.66, w: 0.05, tip: 'tusk', curve: 0.12, serrate: 7, guard: 'claw', guardW: 0.13, grip: 0.13, wrap: 'cord', pommel: 'knob', pommelS: 0.026 },
  'sword.conquest': { len: 0.76, w: 0.052, taper: 0.78, tip: 'point', ridge: true, ricasso: 0.06, guard: 'sun', guardW: 0.22, grip: 0.14, wrap: 'wire', pommel: 'crown', pommelS: 0.026 },
  'sword.sunblade': { len: 0.78, w: 0.046, taper: 0.8, tip: 'flame', waves: 5, fuller: 0.5, guard: 'sun', guardW: 0.26, grip: 0.14, wrap: 'wire', pommel: 'gem', pommelS: 0.024 },
  // Thin blades: swept hilt, cup hilt, ringed hilt.
  'sword.rapier': { len: 0.9, w: 0.016, taper: 0.6, tip: 'needle', ridge: true, guard: 'swept', guardW: 0.2, grip: 0.13, wrap: 'wire', pommel: 'ball', pommelS: 0.024 },
  'sword.foil': { len: 0.88, w: 0.0075, taper: 0.55, tip: 'needle', square: true, guard: 'cup', guardW: 0.15, grip: 0.12, wrap: 'cord', pommel: 'disc', pommelS: 0.02 },
  'sword.estoc': { len: 0.95, w: 0.024, taper: 0.45, tip: 'spear', ridge: true, thick: 0.02, guard: 'ringed', guardW: 0.25, grip: 0.17, wrap: 'leather', pommel: 'scent', pommelS: 0.022 },
  // Great swords: plain, ricasso and lugs, a cleaver of a blade, a winged relic.
  'sword.great': { len: 1.05, w: 0.05, taper: 0.75, tip: 'point', fuller: 0.6, guard: 'bar', guardW: 0.36, grip: 0.26, wrap: 'leather', pommel: 'wheel', pommelS: 0.034 },
  'sword.zweihander': { len: 1.14, w: 0.047, taper: 0.8, tip: 'point', fuller: 0.5, ricasso: 0.15, guard: 'ringed', guardW: 0.42, grip: 0.3, wrap: 'leather', pommel: 'scent', pommelS: 0.03 },
  'sword.colossus': { len: 1.08, w: 0.085, tip: 'cleaver', fuller: 0.45, serrate: 9, guard: 'shell', guardW: 0.3, guardD: 0.04, grip: 0.3, wrap: 'cord', pommel: 'spike', pommelS: 0.035 },
  'sword.godslayer': { len: 1.16, w: 0.06, taper: 0.7, tip: 'spear', ridge: true, window: true, guard: 'winged', guardW: 0.46, grip: 0.3, wrap: 'wire', pommel: 'gem', pommelS: 0.034 },
  // Daggers: leaf, spear, bone; wavy kris, clipped blade, fang; needles.
  'dagger.dagger': { len: 0.24, w: 0.024, taper: 0.8, tip: 'point', fuller: 0.5, guard: 'bar', guardW: 0.08, grip: 0.09, wrap: 'leather', pommel: 'disc', pommelS: 0.016 },
  'dagger.dirk': { len: 0.31, w: 0.02, taper: 0.55, tip: 'spear', ridge: true, guard: 'lugs', guardW: 0.05, grip: 0.1, wrap: 'ribbed', pommel: 'cap', pommelS: 0.02 },
  'dagger.boneknife': { len: 0.26, w: 0.028, tip: 'tusk', curve: 0.05, serrate: 5, guard: 'none', guardW: 0.05, grip: 0.1, wrap: 'cord', pommel: 'knob', pommelS: 0.018 },
  'dagger.kris': { len: 0.27, w: 0.022, taper: 0.7, tip: 'flame', waves: 3.5, guard: 'shell', guardW: 0.07, guardD: 0.018, grip: 0.09, wrap: 'wood', pommel: 'knob', pommelS: 0.017 },
  'dagger.blade': { len: 0.3, w: 0.028, tip: 'clip', backed: true, curve: 0.025, fuller: 0.35, guard: 'drooping', guardW: 0.09, grip: 0.1, wrap: 'wire', pommel: 'fishtail', pommelS: 0.016 },
  'dagger.fanged': { len: 0.27, w: 0.03, tip: 'fang', curve: 0.07, serrate: 4, guard: 'claw', guardW: 0.08, grip: 0.1, wrap: 'cord', pommel: 'spike', pommelS: 0.014 },
  'dagger.mindrender': { len: 0.31, w: 0.028, taper: 0.75, tip: 'flame', waves: 4, guard: 'winged', guardW: 0.11, grip: 0.1, wrap: 'wire', pommel: 'gem', pommelS: 0.016 },
  'dagger.stiletto': { len: 0.26, w: 0.0065, taper: 0.6, tip: 'needle', square: true, guard: 'disc', guardW: 0.045, guardD: 0.012, grip: 0.1, wrap: 'wire', pommel: 'ball', pommelS: 0.016 },
  'dagger.poignard': { len: 0.28, w: 0.016, taper: 0.3, tip: 'spear', ridge: true, thick: 0.012, guard: 'bar', guardW: 0.09, grip: 0.1, wrap: 'ribbed', pommel: 'scent', pommelS: 0.014 },
  'dagger.nightblade': { len: 0.3, w: 0.011, taper: 0.5, tip: 'needle', ridge: true, guard: 'crescent', guardW: 0.1, grip: 0.1, wrap: 'leather', pommel: 'spike', pommelS: 0.014 },
};

/** The fallback cuts for free-form shapes ('sword', 'dagger.wavy' on a monster). */
export const BLADE_BY_SHAPE: Record<string, string> = {
  sword: 'sword.short',
  'sword.short': 'sword.short',
  'sword.broad': 'sword.broad',
  'sword.thin': 'sword.rapier',
  'sword.great': 'sword.great',
  dagger: 'dagger.dagger',
  'dagger.wavy': 'dagger.kris',
  'dagger.needle': 'dagger.stiletto',
};

export { withOverride } from './Kit';
