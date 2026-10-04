/**
 * SLAY — item icon kit.
 *
 * Materials, rarity looks and the reusable parts (shafts, wrapped grips,
 * bevelled blades, pommels, rivets, bands) that the item icon painters in
 * `IconWeapons`, `IconArmor` and `IconTrinkets` are assembled from.
 *
 * Two drawing frames:
 *
 *  - **diag** — long things (weapons, staves, quivers) are drawn along a local
 *    vertical axis, tip at negative y, and the frame is turned 45 degrees so the
 *    tip points to the top right. A diagonal uses 1.4x the length of a square,
 *    which is the difference between a sword and a toothpick at 40 pixels. In
 *    this frame the key light arrives from local -x.
 *  - **upright** — armour, jewellery and consumables, centred, light from the
 *    top left.
 *
 * Both frames span roughly -64..64 around the icon centre.
 */
import type { ItemRarity } from '../types';
import { RARITY_COLOR } from '../types';
import {
  type Ctx,
  type Mat,
  type Pt,
  circleP,
  css,
  emissiveStroke,
  gem,
  glint,
  lift,
  mat,
  mixC,
  polyP,
  rampOf,
  rrectP,
  sink,
  solid,
  spec,
  type GemCut,
} from './Paint';

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export const MATS: Record<string, Mat> = {
  'metal.iron': mat([0x17191d, 0x30343b, 0x596069, 0x8b939e, 0xd0d8e2], 0.8, 'brushed', 0.32),
  'metal.steel': mat([0x1a1f27, 0x3a4350, 0x6a7686, 0xa9b5c5, 0xf0f6fc], 0.9, 'brushed', 0.28),
  'metal.silver': mat([0x262c36, 0x515c6b, 0x8c99aa, 0xc8d3e0, 0xffffff], 0.95, 'brushed', 0.2),
  'metal.mithril': mat([0x1a2834, 0x3f5a74, 0x7aa0c0, 0xbde0f5, 0xf4feff], 0.95, 'brushed', 0.18),
  'metal.gold': mat([0x342104, 0x765014, 0xbd8823, 0xedc45a, 0xfff3bd], 0.9, 'brushed', 0.18),
  'metal.bronze': mat([0x2a180a, 0x5c3818, 0x99602e, 0xd09658, 0xf7d6a4], 0.85, 'hammered', 0.3),
  'metal.copper': mat([0x2a120a, 0x5e2a16, 0xa0522c, 0xd88a5a, 0xffcfa8], 0.85, 'hammered', 0.3),
  'metal.dark': mat([0x08090c, 0x171a20, 0x2c3139, 0x565e6c, 0xa4b0c4], 0.9, 'brushed', 0.3),
  'metal.rusted': mat([0x1d120b, 0x432818, 0x734429, 0x9f6a42, 0xc69768], 0.3, 'crack', 0.5),
  'metal.verdigris': mat([0x0e211a, 0x214a39, 0x3c8461, 0x79c198, 0xd0f5de], 0.7, 'mottle', 0.35),
  'metal.bloodgold': mat([0x2e0a04, 0x6a1c0c, 0xb2441c, 0xf08848, 0xffe0b0], 0.9, 'brushed', 0.18),
  'metal.voidgold': mat([0x1c0a26, 0x45204e, 0x8a5a5a, 0xd6a860, 0xfff0c8], 0.9, 'brushed', 0.18),
  'wood.oak': mat([0x1c120a, 0x3c2816, 0x694829, 0x946b42, 0xbf9466], 0.05, 'grain', 0.5, 0.7),
  'wood.ash': mat([0x201b16, 0x473d33, 0x786b5a, 0xa59884, 0xd0c5b0], 0.05, 'grain', 0.5, 0.7),
  'wood.dark': mat([0x0d0806, 0x22160f, 0x3c291b, 0x5d432f, 0x8a6a50], 0.1, 'grain', 0.45, 0.7),
  'wood.polished': mat([0x2a1608, 0x5a3014, 0x8e5426, 0xbd8448, 0xf0c48c], 0.3, 'grain', 0.35, 0.7),
  'wood.rotted': mat([0x1a1712, 0x37312a, 0x5a5142, 0x7e7460, 0x9c937e], 0, 'grain', 0.55, 0.7),
  'wood.charred': mat([0x0b0908, 0x1d1815, 0x342b25, 0x534538, 0x7a6450], 0.1, 'crack', 0.5),
  'leather.worn': mat([0x170f09, 0x382515, 0x5c3f25, 0x85603b, 0xab8560], 0.1, 'pores', 0.55),
  'leather.dark': mat([0x0c0907, 0x1f1611, 0x372a1f, 0x584534, 0x7e6852], 0.12, 'pores', 0.55),
  'leather.fine': mat([0x1e1109, 0x45260f, 0x74421c, 0xa86c3a, 0xd8a070], 0.2, 'pores', 0.4),
  'leather.studded': mat([0x150e09, 0x332217, 0x553b27, 0x7c5a3e, 0xa07e60], 0.1, 'pores', 0.55),
  'cloth.linen': mat([0x27221a, 0x4e4636, 0x7f735c, 0xada187, 0xd8ceb6], 0, 'weave', 0.45, 0.8),
  'cloth.silk': mat([0x1a1224, 0x3a2950, 0x634c86, 0x9480ba, 0xcab9ea], 0.25, 'weave', 0.2, 0.8),
  'cloth.tattered': mat([0x221e18, 0x48402f, 0x6e6450, 0x928871, 0xb0a890], 0, 'weave', 0.5, 0.8),
  'cloth.banner': mat([0x2a0a0a, 0x5c1818, 0x942a26, 0xc4504a, 0xe88a80], 0.1, 'weave', 0.35, 0.8),
  'bone.pale': mat([0x2a241a, 0x5a5140, 0x968b70, 0xc8be9e, 0xf2ead2], 0.15, 'mottle', 0.35),
  'stone.crypt': mat([0x131518, 0x2b2f33, 0x4e5358, 0x7a7f84, 0xa8adb2], 0, 'crack', 0.5),
  'crystal.void': mat([0x0a0516, 0x22113c, 0x472878, 0x7e56c0, 0xd2b2ff], 0.6, null, 0),
  'crystal.ice': mat([0x0c2232, 0x1e4c6c, 0x3f88b0, 0x8cc8e6, 0xe4f8ff], 0.6, null, 0),
  'crystal.arcane': mat([0x2a0a26, 0x5c1a54, 0x9a3290, 0xd070c4, 0xffc4f0], 0.6, null, 0),
  'flesh.rotted': mat([0x16160d, 0x363822, 0x5a5f3c, 0x81885a, 0xacb284], 0.1, 'mottle', 0.5),
};

/** Resolves a palette key (optionally `key|0xTINT`) onto a material. */
export function matFor(palette: string | undefined, glow?: number): Mat {
  const key = (palette ?? 'metal.steel').split('|')[0]!.trim();
  if (key === 'crystal.gem') return rampOf(glow ?? 0x5aa8ff, 0.6, null, 0);
  const hit = MATS[key];
  if (hit) return hit;
  const fam = key.split('.')[0];
  for (const k of Object.keys(MATS)) if (k.startsWith(fam + '.')) return MATS[k]!;
  return MATS['metal.steel']!;
}

export function isMetal(palette: string): boolean {
  return palette.startsWith('metal');
}

// ---------------------------------------------------------------------------
// Rarity looks
// ---------------------------------------------------------------------------

export const RANK: Record<ItemRarity, number> = {
  normal: 0, magic: 1, rare: 2, set: 3, unique: 4, mythic: 5, ancient: 6,
};

/** Stones a rare might be set with: picked per base so a rack of rares is not one colour. */
const RARE_STONES = [0xd0283a, 0x2a6ae0, 0x2aa858, 0x9a40d8, 0xf0b428, 0x28b8c8];
/** Uniques get a stone of their own, picked per unique. */
const UNIQUE_STONES = [0xff8a1e, 0xe0283a, 0x30c0ff, 0x4ae07a, 0xc050ff, 0xffd040, 0xff4a8a, 0x40ffd8];

/** Everything an icon painter needs to know about the item it is drawing. */
export interface K {
  x: Ctx;
  rnd: () => number;
  /** Base id. */
  id: string;
  /** Shape family ('sword') and sub-type ('great'). */
  fam: string;
  sub: string;
  /** Primary material, from the base palette. */
  m: Mat;
  pal: string;
  /** Authored ornateness, 0..1 — climbs with the base tier. */
  ornate: number;
  rarity: ItemRarity;
  rank: number;
  /** Metal for guards, bands and settings: upgrades with rarity. */
  trim: Mat;
  /** Gem colour. */
  stone: number;
  /** Emissive colour for runes, edges and auras. */
  glowC: number;
  /** The base's own authored glow, if any. */
  baseGlow?: number;
  /** A stable per-item hash, for variants. */
  h: number;
}

export function trimFor(rarity: ItemRarity, pal: string): Mat {
  switch (rarity) {
    case 'normal':
      return pal.startsWith('metal') ? MATS[pal] ?? MATS['metal.iron']! : MATS['metal.iron']!;
    case 'magic':
      return MATS['metal.silver']!;
    case 'rare':
      return MATS['metal.gold']!;
    case 'set':
      return MATS['metal.verdigris']!;
    case 'unique':
      return MATS['metal.gold']!;
    case 'mythic':
      return MATS['metal.voidgold']!;
    case 'ancient':
      return MATS['metal.bloodgold']!;
  }
}

export function stoneFor(rarity: ItemRarity, h: number, uniqueKey?: string, baseGlow?: number): number {
  if (baseGlow !== undefined && RANK[rarity] < 4) return baseGlow;
  switch (rarity) {
    case 'normal':
    case 'magic':
      return baseGlow ?? 0x5a8cff;
    case 'rare':
      return RARE_STONES[h % RARE_STONES.length]!;
    case 'set':
      return 0x2fd25a;
    case 'unique':
      return uniqueKey ? UNIQUE_STONES[(h >>> 3) % UNIQUE_STONES.length]! : 0xff8a1e;
    case 'mythic':
      return 0xc060ff;
    case 'ancient':
      return 0xff4a24;
  }
}

export function glowFor(rarity: ItemRarity, baseGlow?: number): number {
  if (RANK[rarity] >= 5) return RARITY_COLOR[rarity];
  if (rarity === 'unique') return baseGlow ?? 0xffa040;
  if (rarity === 'set') return 0x5aff7a;
  return baseGlow ?? (rarity === 'magic' ? 0x7a9cff : rarity === 'rare' ? 0xffd870 : 0xb8c8ff);
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/** Runs `fn` in the diagonal weapon frame: local +y is down-left, tip up-right. */
export function diag(x: Ctx, fn: () => void, scale = 1): void {
  x.save();
  x.translate(64, 64);
  x.rotate(Math.PI / 4);
  // Widen across the weapon's own axis: at hotbar size a true-to-life blade
  // is a hairline, and a chunkier read beats a correct one.
  x.scale(scale * 1.22, scale);
  fn();
  x.restore();
}

/** Runs `fn` centred, unrotated. */
export function upright(x: Ctx, fn: () => void, scale = 1, dx = 0, dy = 0): void {
  x.save();
  x.translate(64 + dx, 64 + dy);
  x.scale(scale, scale);
  fn();
  x.restore();
}

// ---------------------------------------------------------------------------
// Parts (diag frame unless noted)
// ---------------------------------------------------------------------------

/** A turned shaft along local y, tapering from `w0` at `y0` to `w1` at `y1` (full widths). */
export function shaft(k: K, y0: number, y1: number, w0: number, w1: number, m: Mat, opts: { wobble?: number; outline?: number } = {}): Path2D {
  const wob = opts.wobble ?? 0;
  const n = wob > 0 ? 10 : 1;
  const L: Pt[] = [];
  const R: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = y0 + (y1 - y0) * t;
    const hw = (w0 + (w1 - w0) * t) / 2;
    const off = wob > 0 ? Math.sin(t * 9 + k.h * 0.001) * wob + (k.rnd() - 0.5) * wob * 0.6 : 0;
    L.push([off - hw, y]);
    R.push([off + hw, y]);
  }
  const p = polyP([...L, ...R.reverse()]);
  const w = Math.max(w0, w1) / 2;
  solid(k.x, p, m, { a: [-w, 0], b: [w, 0], texRot: 0, outline: opts.outline ?? 1.4, size: 0.6 });
  return p;
}

/** A leather-wrapped grip: a shaft with diagonal cord bands. */
export function wrappedGrip(k: K, y0: number, y1: number, w: number, m: Mat = MATS['leather.worn']!): void {
  const x = k.x;
  const p = shaft(k, y0, y1, w, w * 0.92, m);
  x.save();
  x.clip(p);
  const step = Math.max(3.2, w * 0.55);
  for (let y = y0 - step; y < y1 + step; y += step) {
    x.beginPath();
    x.moveTo(-w, y);
    x.lineTo(w, y + step * 0.75);
    x.strokeStyle = 'rgba(0,0,0,.55)';
    x.lineWidth = 1.3;
    x.stroke();
    x.beginPath();
    x.moveTo(-w, y + 1.3);
    x.lineTo(w, y + step * 0.75 + 1.3);
    x.strokeStyle = css(m.c[4], 0.35);
    x.lineWidth = 0.8;
    x.stroke();
  }
  x.restore();
}

/** A round pommel or knob at (cx, cy). */
export function knob(k: K, cx: number, cy: number, r: number, m: Mat, opts: { stone?: boolean; facets?: number } = {}): void {
  const x = k.x;
  const n = opts.facets ?? 0;
  let p: Path2D;
  if (n > 2) {
    const pts: Pt[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    p = polyP(pts);
  } else p = circleP(cx, cy, r);
  solid(x, p, m, { a: [cx - r, cy - r * 0.3], b: [cx + r, cy + r * 0.3], size: r / 10, tex: null });
  spec(x, cx - r * 0.35, cy - r * 0.15, r * 0.45, r * 0.25, -0.4, m.metal > 0.5 ? 0.7 : 0.25);
  if (opts.stone) gem(x, cx, cy, r * 0.55, k.stone, 'round', { glow: k.rank >= 4 ? 0.6 : 0 });
}

/** A metal band around a shaft at y. */
export function band(k: K, y: number, w: number, h: number, m: Mat = k.trim): void {
  const p = rrectP(-w / 2, y - h / 2, w, h, Math.min(1.5, h / 3));
  solid(k.x, p, m, { a: [-w / 2, y], b: [w / 2, y], ao: 0.3, rim: 0.6, outline: 1.1, tex: null, size: 0.4 });
}

/** A domed rivet. Works in either frame. */
export function rivet(k: K, cx: number, cy: number, r: number, m: Mat = k.trim): void {
  const x = k.x;
  const g = x.createRadialGradient(cx - r * 0.4, cy - r * 0.4, 0, cx, cy, r);
  g.addColorStop(0, css(m.c[4]));
  g.addColorStop(0.45, css(m.c[2]));
  g.addColorStop(1, css(m.c[0]));
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = 'rgba(0,0,0,.6)';
  x.lineWidth = 0.7;
  x.stroke();
}

export interface BladeOpts {
  /** [yStart, yEnd, width] of the central groove. */
  fuller?: [number, number, number];
  /** Draw a hard centre ridge (diamond section) instead of a flat. */
  ridge?: boolean;
  /** Edge glow strength (enchantment). */
  edgeGlow?: number;
  /** Decorative etching near the base, 0..1. */
  etch?: number;
  /** Glowing rune marks along the blade. */
  runes?: boolean;
  /** Translucent crystal blade. */
  crystal?: boolean;
}

/**
 * A bevelled blade from a profile of `[y, halfWidth, centreOffset?]` samples,
 * tip first. The lit facet and the shadow facet are painted separately, which
 * is the single thing that makes a flat shape read as forged steel.
 */
export function blade(k: K, prof: Array<[number, number, number?]>, m: Mat, o: BladeOpts = {}): Path2D {
  const x = k.x;
  const L: Pt[] = prof.map(([y, hw, off = 0]) => [off - hw, y]);
  const R: Pt[] = prof.map(([y, hw, off = 0]) => [off + hw, y]);
  const C: Pt[] = prof.map(([y, , off = 0]) => [off, y]);
  const whole = polyP([...L, ...R.slice().reverse()]);
  const right = polyP([...C, ...R.slice().reverse()]);
  const maxW = Math.max(...prof.map((p) => p[1]));
  const y0 = prof[0]![0];
  const y1 = prof[prof.length - 1]![0];
  const crystal = !!o.crystal;

  x.save();
  if (crystal) x.globalAlpha = 0.92;
  solid(x, whole, m, { a: [-maxW, y0], b: [maxW, y0 + maxW], texRot: Math.PI / 2, texScale: 0.8, outline: 0, size: 0.7, ao: 0.4 });
  x.restore();
  // Shadow facet.
  x.save();
  x.clip(whole);
  const sg = x.createLinearGradient(0, y0, maxW, y0);
  sg.addColorStop(0, 'rgba(0,0,0,0.42)');
  sg.addColorStop(1, 'rgba(0,0,0,0.18)');
  x.fillStyle = sg;
  x.fill(right);
  // A broad sheen on the lit facet near the tip end.
  const sh = x.createLinearGradient(0, y0, 0, y1);
  sh.addColorStop(0, css(m.c[4], 0.0));
  sh.addColorStop(0.18, css(m.c[4], m.metal > 0.5 ? 0.38 : 0.14));
  sh.addColorStop(0.55, css(m.c[4], 0.05));
  sh.addColorStop(1, css(m.c[4], 0.0));
  x.globalCompositeOperation = 'lighter';
  x.fillStyle = sh;
  x.fill(polyP([...L, ...C.slice().reverse()]));
  x.globalCompositeOperation = 'source-over';
  // Fuller.
  if (o.fuller) {
    const [fy0, fy1, fw] = o.fuller;
    const offAt = (y: number): number => {
      for (let i = 1; i < prof.length; i++) {
        const a = prof[i - 1]!;
        const b = prof[i]!;
        if (y >= a[0] && y <= b[0]) {
          const t = (y - a[0]) / (b[0] - a[0] || 1);
          return (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t;
        }
      }
      return 0;
    };
    const fp: Pt[] = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const y = fy0 + ((fy1 - fy0) * i) / steps;
      const taper = i === 0 ? 0.3 : 1;
      fp.push([offAt(y) - (fw / 2) * taper, y]);
    }
    for (let i = steps; i >= 0; i--) {
      const y = fy0 + ((fy1 - fy0) * i) / steps;
      const taper = i === 0 ? 0.3 : 1;
      fp.push([offAt(y) + (fw / 2) * taper, y]);
    }
    const f = polyP(fp);
    const fg = x.createLinearGradient(-fw / 2, 0, fw / 2, 0);
    fg.addColorStop(0, css(m.c[0], 0.85));
    fg.addColorStop(0.6, css(m.c[1], 0.7));
    fg.addColorStop(1, css(m.c[3], 0.8));
    x.fillStyle = fg;
    x.fill(f);
  } else if (o.ridge !== false) {
    x.beginPath();
    for (let i = 0; i < C.length; i++) (i ? x.lineTo : x.moveTo).call(x, C[i]![0] - 0.4, C[i]![1]);
    x.strokeStyle = css(m.c[4], 0.55);
    x.lineWidth = 0.9;
    x.stroke();
  }
  // Etching.
  if ((o.etch ?? 0) > 0) {
    x.strokeStyle = css(m.c[0], 0.55);
    x.lineWidth = 0.8;
    const ey = y1 - (y1 - y0) * 0.08;
    const len = (y1 - y0) * 0.28 * (o.etch ?? 0);
    for (const s of [-1, 1]) {
      x.beginPath();
      for (let i = 0; i <= 14; i++) {
        const y = ey - (len * i) / 14;
        const xx = s * (maxW * 0.45 + Math.sin(i * 1.3) * maxW * 0.18);
        (i ? x.lineTo : x.moveTo).call(x, xx, y);
      }
      x.stroke();
    }
  }
  // Cutting-edge hairlines: bright on the lit edge, cool on the far edge.
  x.lineJoin = 'round';
  x.beginPath();
  for (let i = 0; i < L.length; i++) (i ? x.lineTo : x.moveTo).call(x, L[i]![0] + 0.7, L[i]![1]);
  x.strokeStyle = css(m.c[4], m.metal > 0.5 ? 0.85 : 0.4);
  x.lineWidth = 1.1;
  x.stroke();
  x.beginPath();
  for (let i = 0; i < R.length; i++) (i ? x.lineTo : x.moveTo).call(x, R[i]![0] - 0.7, R[i]![1]);
  x.strokeStyle = css(m.c[3], 0.3);
  x.lineWidth = 0.9;
  x.stroke();
  if (crystal) {
    x.globalCompositeOperation = 'lighter';
    const cg = x.createLinearGradient(0, y0, 0, y1);
    cg.addColorStop(0, css(m.c[3], 0.5));
    cg.addColorStop(1, css(m.c[2], 0.1));
    x.fillStyle = cg;
    x.fill(whole);
    x.globalCompositeOperation = 'source-over';
  }
  if (o.runes) {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const y = y1 - (y1 - y0) * (0.18 + i * 0.13);
      const s = maxW * 0.32;
      const rp = new Path2D();
      const v = (k.h >>> (i * 3)) & 7;
      rp.moveTo(-s * 0.6, y + s * 0.5);
      rp.lineTo(0, y - s * 0.7);
      rp.lineTo(s * 0.6, y + s * 0.5);
      if (v & 1) {
        rp.moveTo(-s * 0.5, y);
        rp.lineTo(s * 0.5, y);
      }
      if (v & 2) {
        rp.moveTo(0, y - s * 0.7);
        rp.lineTo(0, y + s * 0.7);
      }
      emissiveStroke(x, rp, k.glowC, 1.6, 0.95);
    }
  }
  x.restore();
  // Silhouette outline last, over everything.
  x.save();
  x.lineJoin = 'round';
  x.lineWidth = 1.5;
  x.strokeStyle = 'rgba(8,7,6,0.92)';
  x.stroke(whole);
  x.restore();
  if ((o.edgeGlow ?? 0) > 0) {
    const ep = new Path2D();
    for (let i = 0; i < L.length; i++) (i ? ep.lineTo : ep.moveTo).call(ep, L[i]![0], L[i]![1]);
    for (let i = R.length - 1; i >= 0; i--) ep.lineTo(R[i]![0], R[i]![1]);
    emissiveStroke(x, ep, k.glowC, 1.2, o.edgeGlow!);
  }
  if (k.rank >= 2 && m.metal > 0.3) glint(x, L[1]![0] + 1, L[1]![1] + 3, 5 + k.rank, 0xffffff, 0.85);
  return whole;
}

/** A gem set in a small bezel of the trim metal. */
export function setStone(k: K, cx: number, cy: number, r: number, cut: GemCut = 'round'): void {
  const x = k.x;
  const p = circleP(cx, cy, r * 1.35);
  solid(x, p, k.trim, { a: [cx - r, cy - r], b: [cx + r, cy + r], ao: 0.4, rim: 0.5, outline: 1.1, tex: null, size: 0.4 });
  gem(x, cx, cy, r, k.stone, cut, { glow: k.rank >= 4 ? 0.7 : k.rank >= 2 ? 0.25 : 0 });
}

/**
 * The stone a piece carries at this rarity, or nothing. Normal items carry no
 * stone; magic only when the base is ornate; rare and above always.
 */
export function maybeStone(k: K, cx: number, cy: number, r: number, cut: GemCut = 'round'): void {
  if (k.rank >= 2 || (k.rank === 1 && k.ornate > 0.4)) setStone(k, cx, cy, r, cut);
}

/** A glowing rune mark — a stave and branches from the hash — centred at (cx, cy). */
export function runeMark(k: K, cx: number, cy: number, s: number, color = k.glowC, seed = k.h, a = 1): void {
  const p = new Path2D();
  p.moveTo(cx, cy - s);
  p.lineTo(cx, cy + s);
  const v = seed >>> 2;
  const arms = [
    [[0, -0.6], [0.6, -1]],
    [[0, -0.6], [-0.6, -1]],
    [[0, 0], [0.6, -0.4]],
    [[0, 0], [-0.6, 0.4]],
    [[0, 0.5], [0.6, 1]],
    [[0, -0.2], [0.6, 0.3]],
  ] as const;
  let used = 0;
  for (let i = 0; i < arms.length && used < 3; i++) {
    if ((v >>> i) & 1) {
      const [[ax, ay], [bx, by]] = arms[i]!;
      p.moveTo(cx + ax * s, cy + ay * s);
      p.lineTo(cx + bx * s, cy + by * s);
      used++;
    }
  }
  if (used === 0) {
    p.moveTo(cx, cy - s * 0.4);
    p.lineTo(cx + s * 0.6, cy);
    p.lineTo(cx, cy + s * 0.4);
  }
  emissiveStroke(k.x, p, color, Math.max(1, s * 0.22), a);
}

/** Bright embossed trim line along a path (filigree), in the trim metal. */
export function filigree(k: K, p: Path2D, w = 1.4, m: Mat = k.trim): void {
  const x = k.x;
  x.save();
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = css(m.c[0], 0.9);
  x.lineWidth = w + 1.2;
  x.stroke(p);
  x.strokeStyle = css(m.c[2]);
  x.lineWidth = w;
  x.stroke(p);
  x.translate(-0.4, -0.4);
  x.strokeStyle = css(m.c[4], 0.8);
  x.lineWidth = w * 0.4;
  x.stroke(p);
  x.restore();
}

/** A C-scroll curl, the basic filigree unit. */
export function curl(cx: number, cy: number, r: number, dir = 1, rot = 0): Path2D {
  const p = new Path2D();
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = rot + dir * t * Math.PI * 1.6;
    const rr = r * (1 - t * 0.65);
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) p.moveTo(px, py);
    else p.lineTo(px, py);
  }
  return p;
}

export { mixC, lift, sink, css };
