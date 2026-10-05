/**
 * SLAY — painted pictograms.
 *
 * One vocabulary of bold, lit symbols — a shield, a skull, a flame, a bolt —
 * shared by skill icons, status chips, monster affix badges and ornament. Each
 * glyph paints into a 128px field centred on (64, 64), inside a radius of about
 * 46, and takes a `Tone`: the element or status colours it is lit by.
 *
 * Two kinds of glyph, painted two ways:
 *
 *  - **Objects** (shield, axe, skull, chalice, boot) are painted as materials
 *    under the shared top-left key light, then caught by a coloured back light
 *    in the tone's glow, so a fire shield and a cold shield are the same steel
 *    in different light.
 *  - **Energies** (flame, bolt, frost, swirl, star) are painted as emissive
 *    gradients — white-hot core, saturated body, soft halo — with a dark
 *    contact edge so they still hold a silhouette against a bright backdrop.
 *
 * Every glyph keeps a strong light/dark split, because locked and cooling-down
 * skills are shown greyscaled and dimmed and must still read.
 */
import {
  type Ctx,
  type Mat,
  type Pt,
  circleP,
  css,
  ellipseP,
  emissiveStroke,
  glint,
  glow,
  innerEdge,
  lift,
  mat,
  mixC,
  polyP,
  rampOf,
  rrectP,
  saturate,
  sink,
  smoothP,
  solid,
  spec,
  starP,
} from './Paint';

export interface Tone {
  /** White-hot core. */
  core: number;
  /** Saturated body / halo. */
  glow: number;
  /** Deep shadow tone. */
  dark: number;
}

export type Glyph = (x: Ctx, t: Tone, v: number) => void;

// ---------------------------------------------------------------------------
// Materials and paint modes
// ---------------------------------------------------------------------------

const STEEL = mat([0x14171c, 0x323a46, 0x66727f, 0xa9b6c4, 0xf2f7fc], 0.9, 'brushed', 0.25);
const IRON = mat([0x121418, 0x2a2e35, 0x50575f, 0x858e98, 0xc8d0da], 0.8, 'brushed', 0.3);
const GOLD = mat([0x342104, 0x765014, 0xbd8823, 0xedc45a, 0xfff3bd], 0.9, 'brushed', 0.15);
const BONE = mat([0x2a241a, 0x5a5140, 0x9a8f74, 0xcdc3a3, 0xf6eed6], 0.15, 'mottle', 0.3);
const WOOD = mat([0x1c120a, 0x3c2816, 0x694829, 0x946b42, 0xbf9466], 0.05, 'grain', 0.45, 0.6);
const LEATHER = mat([0x170f09, 0x382515, 0x5c3f25, 0x85603b, 0xab8560], 0.1, 'pores', 0.5);
const CLOTH = mat([0x2a0a0a, 0x5c1818, 0x942a26, 0xc4504a, 0xe88a80], 0.1, 'weave', 0.3, 0.8);
const STONE = mat([0x131518, 0x2b2f33, 0x4e5358, 0x7a7f84, 0xa8adb2], 0, 'crack', 0.45);

/** Lighter steel and stone for glyphs that are one big dark mass (helm, boulder). */
const BRIGHT_STEEL = rampOf(0x8a96a4, 0.9, 'brushed', 0.25);
const BRIGHT_STONE = rampOf(0x8a8f94, 0.05, 'crack', 0.45);

export const GLYPH_MATS = { STEEL, IRON, GOLD, BONE, WOOD, LEATHER, CLOTH, STONE };

/** An object painted in a material, caught by the tone's coloured back light. */
function obj(x: Ctx, p: Path2D, m: Mat, t: Tone, a: Pt = [34, 30], b: Pt = [94, 98], size = 1.4): void {
  solid(x, p, m, { a, b, size, outline: 2.2, outlineColor: 'rgba(6,5,6,.95)' });
  innerEdge(x, p, css(t.glow, 0.9), 3.5, -2.2, -2.2, 2);
}

/** An emissive shape: dark contact edge, halo, saturated body, hot core. */
function energy(x: Ctx, p: Path2D, t: Tone, cx = 64, cy = 64, r = 40, hot = 0.55): void {
  x.save();
  x.lineJoin = 'round';
  x.strokeStyle = css(sink(t.dark, 0.4), 0.95);
  x.lineWidth = 4;
  x.stroke(p);
  x.shadowColor = css(t.glow, 0.9);
  x.shadowBlur = 12;
  const g = x.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
  g.addColorStop(0, css(0xffffff));
  g.addColorStop(hot * 0.5, css(t.core));
  g.addColorStop(hot, css(saturate(t.glow, 0.2)));
  g.addColorStop(1, css(sink(t.glow, 0.35)));
  x.fillStyle = g;
  x.fill(p);
  x.restore();
  innerEdge(x, p, css(lift(t.core, 0.5), 0.8), 2, 1.5, 1.5, 1.5);
}

/** A glowing line glyph with a dark under-stroke for contrast. */
function ray(x: Ctx, p: Path2D, t: Tone, w: number): void {
  x.save();
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = css(sink(t.dark, 0.5), 0.9);
  x.lineWidth = w + 3.5;
  x.stroke(p);
  x.restore();
  emissiveStroke(x, p, t.glow, w, 1);
  x.save();
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = css(t.core, 0.95);
  x.lineWidth = Math.max(1.2, w * 0.38);
  x.stroke(p);
  x.restore();
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

function shieldPath(s = 1, cx = 64, cy = 64): Path2D {
  return smoothP(
    [[cx, cy - 42 * s], [cx + 30 * s, cy - 38 * s], [cx + 36 * s, cy - 28 * s], [cx + 32 * s, cy + 6 * s], [cx + 16 * s, cy + 30 * s], [cx, cy + 42 * s], [cx - 16 * s, cy + 30 * s], [cx - 32 * s, cy + 6 * s], [cx - 36 * s, cy - 28 * s], [cx - 30 * s, cy - 38 * s]],
    0.3,
  );
}

const shield: Glyph = (x, t, v) => {
  const p = shieldPath();
  obj(x, p, STEEL, t);
  const inner = shieldPath(0.78, 64, 62);
  x.save();
  x.clip(inner);
  x.fillStyle = css(sink(t.glow, 0.55), 0.85);
  x.fill(inner);
  x.restore();
  x.save();
  x.lineWidth = 2.6;
  x.strokeStyle = css(GOLD.c[2]);
  x.stroke(inner);
  x.restore();
  if (v % 2 === 0) {
    const cross = new Path2D();
    cross.moveTo(64, 34);
    cross.lineTo(64, 90);
    cross.moveTo(42, 54);
    cross.lineTo(86, 54);
    ray(x, cross, t, 4.5);
  } else {
    glow(x, 64, 58, 22, t.glow, 0.8);
    solid(x, circleP(64, 58, 9), GOLD, { a: [55, 49], b: [73, 67], tex: null, size: 0.6 });
  }
  spec(x, 46, 36, 12, 4, -0.5, 0.6);
};

function bladePath(cx: number, tipY: number, baseY: number, hw: number): Path2D {
  return polyP([[cx, tipY], [cx + hw, tipY + hw * 2], [cx + hw, baseY], [cx - hw, baseY], [cx - hw, tipY + hw * 2]]);
}

const sword: Glyph = (x, t) => {
  x.save();
  x.translate(64, 64);
  x.rotate(Math.PI / 4);
  x.translate(-64, -64);
  obj(x, bladePath(64, 12, 82, 8), STEEL, t, [56, 30], [72, 30], 1);
  x.beginPath();
  x.moveTo(63, 22);
  x.lineTo(63, 80);
  x.strokeStyle = 'rgba(255,255,255,.5)';
  x.lineWidth = 1.2;
  x.stroke();
  obj(x, rrectP(42, 80, 44, 8, 3), GOLD, t, [42, 80], [86, 88], 0.6);
  obj(x, rrectP(59, 88, 10, 22, 3), LEATHER, t, [59, 88], [69, 110], 0.5);
  obj(x, circleP(64, 114, 6), GOLD, t, [58, 108], [70, 120], 0.5);
  x.restore();
};

const dagger: Glyph = (x, t, v) => {
  const n = v % 3 === 2 ? 3 : v % 3 === 1 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    x.save();
    x.translate(64, 64);
    x.rotate(n === 1 ? Math.PI / 4 : n === 2 ? (i ? -1 : 1) * 0.55 : -0.7 + i * 0.7);
    x.translate(-64, -64);
    obj(x, polyP([[64, 18], [73, 44], [70, 76], [58, 76], [55, 44]]), STEEL, t, [55, 30], [73, 30], 0.8);
    obj(x, rrectP(50, 76, 28, 6, 2), IRON, t, [50, 76], [78, 82], 0.4);
    obj(x, rrectP(60, 82, 8, 22, 3), LEATHER, t, [60, 82], [68, 104], 0.4);
    x.restore();
  }
};

const axe: Glyph = (x, t, v) => {
  x.save();
  x.translate(64, 64);
  x.rotate(Math.PI / 5);
  x.translate(-64, -64);
  obj(x, rrectP(60, 22, 8, 92, 3), WOOD, t, [60, 60], [68, 60], 0.6);
  const head = smoothP([[66, 26], [86, 18], [100, 24], [102, 50], [96, 70], [84, 66], [66, 52]], 0.35);
  obj(x, head, STEEL, t, [100, 20], [66, 60], 1);
  if (v % 2) obj(x, smoothP([[62, 30], [44, 22], [34, 34], [36, 54], [62, 48]], 0.35), STEEL, t, [34, 22], [62, 54], 1);
  x.restore();
};

const hammer: Glyph = (x, t) => {
  x.save();
  x.translate(64, 64);
  x.rotate(-Math.PI / 6);
  x.translate(-64, -64);
  obj(x, rrectP(59, 40, 10, 76, 3), WOOD, t, [59, 60], [69, 60], 0.6);
  obj(x, rrectP(28, 16, 72, 32, 5), IRON, t, [28, 16], [100, 48], 1.2);
  for (const bx of [40, 88]) obj(x, rrectP(bx - 3, 14, 6, 36, 2), GOLD, t, [bx - 3, 14], [bx + 3, 50], 0.4);
  x.restore();
};

const anvil: Glyph = (x, t) => {
  const p = polyP([[18, 44], [92, 44], [110, 40], [104, 54], [86, 60], [78, 74], [92, 98], [36, 98], [50, 74], [42, 60], [26, 58]]);
  obj(x, p, IRON, t, [20, 40], [100, 98], 1.5);
  spec(x, 50, 47, 22, 3, 0, 0.6);
  glow(x, 64, 42, 24, t.glow, 0.6);
};

const fist: Glyph = (x, t) => {
  const knuckles = [[40, 40], [54, 36], [68, 36], [82, 40]] as const;
  obj(x, smoothP([[34, 50], [92, 46], [96, 80], [84, 100], [44, 100], [32, 80]], 0.35), LEATHER, t, [32, 46], [96, 100], 1.2);
  for (const [kx, ky] of knuckles) obj(x, rrectP(kx - 7, ky - 4, 14, 22, 6), LEATHER, t, [kx - 7, ky], [kx + 7, ky + 18], 0.5);
  obj(x, smoothP([[30, 64], [44, 58], [60, 64], [56, 74], [36, 76]], 0.4), LEATHER, t, [30, 58], [60, 76], 0.5);
  for (const [kx, ky] of knuckles) obj(x, rrectP(kx - 6, ky - 2, 12, 7, 2), STEEL, t, [kx - 6, ky - 2], [kx + 6, ky + 5], 0.3);
};

export function skullPath(cx = 64, cy = 60, s = 34): Path2D {
  return smoothP([[cx, cy - s], [cx + s * 0.85, cy - s * 0.55], [cx + s * 0.9, cy + s * 0.15], [cx + s * 0.5, cy + s * 0.5], [cx + s * 0.4, cy + s * 0.95], [cx - s * 0.4, cy + s * 0.95], [cx - s * 0.5, cy + s * 0.5], [cx - s * 0.9, cy + s * 0.15], [cx - s * 0.85, cy - s * 0.55]], 0.4);
}

const skull: Glyph = (x, t, v) => {
  const cx = 64;
  const cy = 60;
  const s = 36;
  if (v % 3 === 1) {
    // Horned.
    for (const sg of [-1, 1]) obj(x, smoothP([[cx + sg * 24, cy - 24], [cx + sg * 44, cy - 34], [cx + sg * 52, cy - 52], [cx + sg * 40, cy - 40], [cx + sg * 22, cy - 10]], 0.4), BONE, t, [cx + sg * 52, cy - 52], [cx + sg * 22, cy - 10], 0.8);
  }
  obj(x, skullPath(cx, cy, s), BONE, t, [cx - s, cy - s], [cx + s, cy + s], 1.5);
  x.save();
  for (const sg of [-1, 1]) {
    const e = ellipseP(cx + sg * s * 0.38, cy + s * 0.05, s * 0.24, s * 0.28, sg * 0.2);
    x.fillStyle = '#0c0807';
    x.fill(e);
    x.save();
    x.clip(e);
    glow(x, cx + sg * s * 0.38, cy + s * 0.1, s * 0.3, t.glow, 1);
    x.restore();
  }
  x.fillStyle = '#0c0807';
  x.fill(polyP([[cx, cy + s * 0.35], [cx - s * 0.12, cy + s * 0.58], [cx + s * 0.12, cy + s * 0.58]]));
  x.strokeStyle = 'rgba(12,8,7,.9)';
  x.lineWidth = 2;
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.moveTo(cx + i * s * 0.15, cy + s * 0.68);
    x.lineTo(cx + i * s * 0.15, cy + s * 0.92);
    x.stroke();
  }
  x.restore();
  if (v % 3 === 2) {
    // A crown of flame over it.
    const f = flamePath(cx, cy - s * 0.55, 0.5);
    energy(x, f, t, cx, cy - s * 0.7, 24);
  }
};

const bone: Glyph = (x, t, v) => {
  const n = v % 2 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    x.save();
    x.translate(64, 64);
    x.rotate(n === 1 ? Math.PI / 4 : (i ? -1 : 1) * Math.PI / 4);
    x.translate(-64, -64);
    const p = new Path2D();
    p.addPath(rrectP(55, 22, 18, 84, 7));
    for (const [ex, ey] of [[53, 18], [75, 18], [53, 110], [75, 110]] as const) p.addPath(circleP(ex, ey, 11));
    if (n === 1 && i === 0) glow(x, 64, 64, 46, t.glow, 0.45);
    obj(x, p, BONE, t, [42, 8], [86, 120], 1.1);
    x.restore();
  }
};

const chalice: Glyph = (x, t) => {
  const cup = smoothP([[34, 26], [94, 26], [90, 50], [74, 66], [54, 66], [38, 50]], 0.35);
  obj(x, rrectP(58, 64, 12, 22, 3), GOLD, t, [58, 64], [70, 86], 0.5);
  obj(x, ellipseP(64, 96, 24, 8), GOLD, t, [40, 88], [88, 104], 0.6);
  obj(x, cup, GOLD, t, [34, 26], [94, 66], 1.2);
  const liquid = ellipseP(64, 28, 28, 6);
  energy(x, liquid, t, 64, 28, 30, 0.4);
  for (const gx of [50, 64, 78]) solid(x, circleP(gx, 46, 3.2), rampOf(t.glow, 0.5, null), { a: [gx - 3, 43], b: [gx + 3, 49], tex: null, outline: 1, size: 0.3 });
};

const crown: Glyph = (x, t) => {
  const p = polyP([[24, 86], [22, 40], [40, 60], [52, 30], [64, 54], [76, 30], [88, 60], [106, 40], [104, 86]]);
  obj(x, p, GOLD, t, [22, 30], [106, 86], 1.4);
  obj(x, rrectP(22, 80, 84, 14, 4), GOLD, t, [22, 80], [106, 94], 0.6);
  for (const [gx, gy] of [[40, 87], [64, 87], [88, 87]] as const) solid(x, circleP(gx, gy, 4), rampOf(t.glow, 0.6, null), { a: [gx - 4, gy - 4], b: [gx + 4, gy + 4], tex: null, outline: 1, size: 0.3 });
  for (const [px, py] of [[22, 40], [52, 30], [76, 30], [106, 40]] as const) glint(x, px, py, 6, lift(t.core, 0.5), 0.9);
};

const banner: Glyph = (x, t, v) => {
  const n = v % 2 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const ox = n === 1 ? 0 : i ? 16 : -16;
    x.save();
    x.translate(ox, 0);
    obj(x, rrectP(38, 14, 6, 100, 2), WOOD, t, [38, 60], [44, 60], 0.5);
    const cl = mat([sink(t.glow, 0.85), sink(t.glow, 0.6), sink(t.glow, 0.25), t.glow, lift(t.glow, 0.5)], 0.1, 'weave', 0.3, 0.8);
    const flag = smoothP([[44, 20], [90, 22], [86, 44], [92, 70], [72, 62], [58, 76], [44, 66]], 0.25);
    obj(x, flag, cl, t, [44, 20], [92, 76], 1);
    knobAt(x, 41, 12, 5, t);
    x.restore();
  }
};

function knobAt(x: Ctx, cx: number, cy: number, r: number, t: Tone): void {
  obj(x, circleP(cx, cy, r), GOLD, t, [cx - r, cy - r], [cx + r, cy + r], 0.4);
}

const horn: Glyph = (x, t) => {
  const p = smoothP([[22, 82], [34, 60], [58, 44], [86, 34], [104, 26], [108, 40], [94, 56], [70, 72], [42, 90], [28, 94]], 0.4);
  obj(x, p, BONE, t, [22, 26], [108, 94], 1.3);
  obj(x, rrectP(16, 76, 18, 22, 5), GOLD, t, [16, 76], [34, 98], 0.5);
  for (const bx of [52, 76]) {
    const b = new Path2D();
    b.moveTo(bx - 6, 48 + (76 - bx) * 0.5);
    b.lineTo(bx + 6, 66 + (76 - bx) * 0.5);
    x.save();
    x.strokeStyle = css(GOLD.c[2]);
    x.lineWidth = 4;
    x.stroke(b);
    x.restore();
  }
  for (let i = 0; i < 3; i++) {
    const w = new Path2D();
    w.arc(108, 30, 10 + i * 9, -0.9, 0.5);
    ray(x, w, t, 2.6 - i * 0.5);
  }
};

const arrow: Glyph = (x, t, v) => {
  const n = v % 3 === 2 ? 3 : v % 3 === 1 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    x.save();
    x.translate(64 + (i - (n - 1) / 2) * 16, 64 - (i - (n - 1) / 2) * 0);
    x.rotate(Math.PI / 4);
    x.translate(-64, -64);
    obj(x, rrectP(61, 34, 6, 76, 2), WOOD, t, [61, 60], [67, 60], 0.4);
    obj(x, polyP([[64, 10], [74, 36], [64, 32], [54, 36]]), STEEL, t, [54, 10], [74, 36], 0.6);
    for (const sg of [-1, 1]) obj(x, polyP([[64, 96], [64 + sg * 10, 104], [64 + sg * 10, 118], [64, 110]]), CLOTH, t, [54, 96], [74, 118], 0.4);
    x.restore();
  }
};

const bow: Glyph = (x, t) => {
  const limb = new Path2D();
  limb.moveTo(36, 16);
  limb.bezierCurveTo(96, 34, 96, 94, 36, 112);
  x.save();
  x.lineCap = 'round';
  x.strokeStyle = css(WOOD.c[0]);
  x.lineWidth = 12;
  x.stroke(limb);
  x.strokeStyle = css(WOOD.c[2]);
  x.lineWidth = 8;
  x.stroke(limb);
  x.strokeStyle = css(WOOD.c[4], 0.7);
  x.lineWidth = 2.4;
  x.stroke(limb);
  x.restore();
  const str = new Path2D();
  str.moveTo(36, 16);
  str.lineTo(36, 112);
  ray(x, str, t, 2);
};

const target: Glyph = (x, t, v) => {
  for (const [r, c] of [[42, 0], [30, 1], [18, 0], [7, 1]] as const) {
    const p = circleP(64, 64, r);
    x.save();
    x.fillStyle = c ? css(sink(t.glow, 0.2)) : css(0xe8e0cc);
    x.fill(p);
    x.lineWidth = 2;
    x.strokeStyle = 'rgba(8,6,6,.9)';
    x.stroke(p);
    x.restore();
  }
  innerEdge(x, circleP(64, 64, 42), 'rgba(0,0,0,.6)', 6, -2, -3, 2);
  if (v % 2) {
    const ch = new Path2D();
    ch.moveTo(64, 10);
    ch.lineTo(64, 40);
    ch.moveTo(64, 88);
    ch.lineTo(64, 118);
    ch.moveTo(10, 64);
    ch.lineTo(40, 64);
    ch.moveTo(88, 64);
    ch.lineTo(118, 64);
    ray(x, ch, t, 3);
  }
};

const boot: Glyph = (x, t) => {
  const p = smoothP([[44, 18], [76, 18], [76, 70], [100, 82], [104, 102], [40, 102], [40, 60]], 0.25);
  obj(x, p, LEATHER, t, [40, 18], [104, 102], 1.4);
  obj(x, rrectP(38, 98, 68, 8, 3), IRON, t, [38, 98], [106, 106], 0.4);
  obj(x, rrectP(40, 16, 38, 12, 4), LEATHER, t, [40, 16], [78, 28], 0.5);
  for (let i = 0; i < 3; i++) {
    const w = new Path2D();
    w.moveTo(30 - i * 4, 40 + i * 16);
    w.lineTo(10 - i * 4, 40 + i * 16);
    ray(x, w, t, 3 - i * 0.6);
  }
};

const trap: Glyph = (x, t) => {
  // A sprung bear trap: two toothed jaws over a ring.
  obj(x, ringPath(64, 86, 40, 7), IRON, t, [24, 70], [104, 102], 1);
  for (const up of [true, false]) {
    const teeth: Pt[] = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI + (i / n) * Math.PI;
      const r = i % 2 ? 22 : 36;
      const yy = up ? 70 + Math.sin(a) * r * 1.1 : 74 - Math.sin(a) * r * 0.55;
      teeth.push([64 + Math.cos(a) * (up ? 38 : 36), yy]);
    }
    teeth.push([100, up ? 74 : 70], [28, up ? 74 : 70]);
    obj(x, polyP(teeth), STEEL, t, [26, 26], [102, 96], 1);
  }
  glow(x, 64, 70, 16, t.glow, 0.7);
};

const quiver: Glyph = (x, t) => {
  x.save();
  x.translate(64, 64);
  x.rotate(0.35);
  x.translate(-64, -64);
  for (let i = 0; i < 3; i++) {
    const ax = 54 + i * 10;
    obj(x, rrectP(ax - 1.5, 16, 3, 30, 1), WOOD, t, [ax - 2, 16], [ax + 2, 46], 0.3);
    obj(x, polyP([[ax, 8], [ax + 5, 20], [ax - 5, 20]]), CLOTH, t, [ax - 5, 8], [ax + 5, 20], 0.3);
  }
  obj(x, smoothP([[44, 40], [84, 40], [80, 112], [48, 112]], 0.2), LEATHER, t, [44, 40], [84, 112], 1.2);
  obj(x, rrectP(42, 38, 44, 8, 3), GOLD, t, [42, 38], [86, 46], 0.4);
  x.restore();
};

const helm: Glyph = (x, t, v) => {
  const p = smoothP([[30, 96], [26, 56], [36, 26], [64, 16], [92, 26], [102, 56], [98, 96], [64, 104]], 0.3);
  glow(x, 64, 60, 52, t.glow, 0.45);
  if (v % 2) {
    x.save();
    x.globalAlpha = 0.85;
  }
  obj(x, p, BRIGHT_STEEL, t, [26, 16], [102, 104], 1.4);
  const slit = polyP([[34, 56], [94, 56], [92, 64], [36, 64]]);
  x.fillStyle = '#060508';
  x.fill(slit);
  x.save();
  x.clip(slit);
  glow(x, 50, 60, 14, t.glow, 1);
  glow(x, 78, 60, 14, t.glow, 1);
  x.restore();
  x.beginPath();
  x.moveTo(64, 18);
  x.lineTo(64, 102);
  x.strokeStyle = 'rgba(255,255,255,.35)';
  x.lineWidth = 1.6;
  x.stroke();
  if (v % 2) x.restore();
};

const cage: Glyph = (x, t) => {
  glow(x, 64, 70, 26, t.glow, 0.9);
  energy(x, circleP(64, 72, 12), t, 64, 72, 14);
  for (let i = 0; i < 5; i++) {
    const bx = 34 + i * 15;
    const bar = new Path2D();
    bar.moveTo(bx, 34);
    bar.quadraticCurveTo(bx + (bx - 64) * 0.2, 70, bx, 106);
    x.save();
    x.lineCap = 'round';
    x.strokeStyle = css(IRON.c[0]);
    x.lineWidth = 6;
    x.stroke(bar);
    x.strokeStyle = css(IRON.c[3]);
    x.lineWidth = 3;
    x.stroke(bar);
    x.restore();
  }
  obj(x, ellipseP(64, 32, 34, 8), IRON, t, [30, 24], [98, 40], 0.6);
  obj(x, ellipseP(64, 106, 34, 8), IRON, t, [30, 98], [98, 114], 0.6);
};

const chain: Glyph = (x, t) => {
  for (let i = 0; i < 4; i++) {
    const cx = 30 + i * 22;
    const cy = 94 - i * 20;
    const l = ellipseP(cx, cy, i % 2 ? 9 : 16, i % 2 ? 16 : 9, -0.75);
    const r = new Path2D();
    r.addPath(l);
    x.save();
    x.lineWidth = 9;
    x.strokeStyle = css(STEEL.c[0]);
    x.stroke(l);
    x.lineWidth = 6;
    x.strokeStyle = css(STEEL.c[2]);
    x.stroke(l);
    x.lineWidth = 2;
    x.strokeStyle = css(STEEL.c[4], 0.8);
    x.translate(-1, -1);
    x.stroke(l);
    x.restore();
  }
  glow(x, 64, 64, 30, t.glow, 0.4);
};

const scythe: Glyph = (x, t) => {
  glow(x, 50, 44, 44, t.glow, 0.5);
  x.save();
  x.translate(64, 64);
  x.rotate(0.25);
  x.translate(-64, -64);
  obj(x, rrectP(66, 14, 12, 104, 4), WOOD, t, [66, 60], [78, 60], 0.7);
  const blade = new Path2D();
  blade.moveTo(74, 18);
  blade.bezierCurveTo(44, -4, 8, 10, 4, 52);
  blade.bezierCurveTo(22, 28, 48, 30, 74, 40);
  blade.closePath();
  // A spectral blade, so it reads as the reaper's and never as a dark smear.
  energy(x, blade, t, 60, 30, 64, 0.3);
  // A cold glint running the cutting edge.
  const edge = new Path2D();
  edge.moveTo(8, 46);
  edge.bezierCurveTo(24, 26, 48, 28, 70, 37);
  ray(x, edge, t, 2.2);
  x.restore();
};

const claw: Glyph = (x, t) => {
  for (let i = 0; i < 3; i++) {
    const p = new Path2D();
    const ox = (i - 1) * 20;
    p.moveTo(46 + ox, 18);
    p.quadraticCurveTo(74 + ox, 54, 64 + ox, 110);
    p.quadraticCurveTo(60 + ox, 60, 46 + ox, 18);
    energy(x, p, t, 60 + ox, 64, 50, 0.4);
  }
};

const tower: Glyph = (x, t, v) => {
  if (v % 2) {
    // A wall of stone blocks.
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const bx = 18 + c * 24 + (r % 2 ? 12 : 0) - (r % 2 ? 12 : 0) * (c === 3 ? 1 : 0);
        const by = 30 + r * 18;
        obj(x, rrectP(bx, by, 22, 16, 2), STONE, t, [bx, by], [bx + 22, by + 16], 0.4);
      }
    }
    return;
  }
  const p = polyP([[38, 108], [40, 40], [34, 40], [34, 20], [46, 20], [46, 28], [58, 28], [58, 20], [70, 20], [70, 28], [82, 28], [82, 20], [94, 20], [94, 40], [88, 40], [90, 108]]);
  obj(x, p, STONE, t, [34, 20], [94, 108], 1.4);
  const door = smoothP([[56, 108], [56, 84], [64, 76], [72, 84], [72, 108]], 0.3);
  x.fillStyle = '#080608';
  x.fill(door);
  x.save();
  x.clip(door);
  glow(x, 64, 100, 16, t.glow, 0.9);
  x.restore();
  x.fillStyle = '#080608';
  x.fill(rrectP(60, 46, 8, 14, 3));
};

const boulder: Glyph = (x, t) => {
  const p = smoothP([[30, 50], [52, 26], [86, 28], [104, 56], [96, 92], [62, 104], [30, 90], [22, 70]], 0.45);
  glow(x, 64, 64, 52, t.glow, 0.4);
  obj(x, p, BRIGHT_STONE, t, [22, 26], [104, 104], 1.6);
  const cr = new Path2D();
  cr.moveTo(52, 40);
  cr.lineTo(60, 58);
  cr.lineTo(54, 72);
  cr.moveTo(60, 58);
  cr.lineTo(80, 66);
  ray(x, cr, t, 2.4);
};

const spikes: Glyph = (x, t) => {
  for (let i = 0; i < 5; i++) {
    const bx = 22 + i * 21;
    const h = i % 2 ? 62 : 82;
    obj(x, polyP([[bx - 10, 104], [bx, 104 - h], [bx + 10, 104]]), STEEL, t, [bx - 10, 104 - h], [bx + 10, 104], 0.6);
  }
  obj(x, rrectP(12, 100, 104, 10, 3), IRON, t, [12, 100], [116, 110], 0.5);
};

const fang: Glyph = (x, t, v) => {
  for (const sg of [-1, 1]) {
    const p = smoothP([[64 + sg * 4, 18], [64 + sg * 30, 26], [64 + sg * 26, 64], [64 + sg * 14, 104], [64 + sg * 8, 60]], 0.4);
    obj(x, p, BONE, t, [64 + sg * 30, 18], [64 + sg * 4, 104], 1);
  }
  const drop = dropPath(64 + (v % 2 ? 14 : -14), 104, 0.4);
  energy(x, drop, t, 64, 104, 12);
};

const serpent: Glyph = (x, t) => {
  const body = new Path2D();
  body.moveTo(28, 108);
  body.bezierCurveTo(100, 100, 20, 64, 72, 54);
  body.bezierCurveTo(100, 48, 86, 22, 66, 26);
  x.save();
  x.lineCap = 'round';
  x.strokeStyle = 'rgba(6,8,4,.95)';
  x.lineWidth = 17;
  x.stroke(body);
  x.strokeStyle = css(sink(t.glow, 0.45));
  x.lineWidth = 13;
  x.stroke(body);
  x.strokeStyle = css(t.glow, 0.85);
  x.lineWidth = 6;
  x.translate(-1.5, -1.5);
  x.stroke(body);
  x.restore();
  obj(x, smoothP([[52, 22], [70, 14], [82, 24], [72, 36], [54, 32]], 0.4), rampOf(sink(t.glow, 0.3), 0.3, 'scales', 0.5), t, [52, 14], [82, 36], 0.6);
  x.fillStyle = css(t.core);
  x.beginPath();
  x.arc(66, 22, 2.4, 0, Math.PI * 2);
  x.fill();
};

const leaf: Glyph = (x, t, v) => {
  const petals = v % 2 ? 7 : 1;
  if (petals === 1) {
    const p = smoothP([[64, 14], [96, 48], [86, 90], [64, 110], [42, 90], [32, 48]], 0.4);
    const lm = rampOf(sink(t.glow, 0.2), 0.1, 'fine', 0.3);
    obj(x, p, lm, t, [32, 14], [96, 110], 1.3);
    const vein = new Path2D();
    vein.moveTo(64, 20);
    vein.lineTo(64, 106);
    for (let i = 0; i < 4; i++) {
      vein.moveTo(64, 40 + i * 16);
      vein.lineTo(80 - i * 2, 30 + i * 16);
      vein.moveTo(64, 40 + i * 16);
      vein.lineTo(48 + i * 2, 30 + i * 16);
    }
    x.save();
    x.strokeStyle = css(lift(t.glow, 0.4), 0.7);
    x.lineWidth = 1.6;
    x.stroke(vein);
    x.restore();
    return;
  }
  for (let i = 0; i < petals; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42;
    x.save();
    x.translate(64, 92);
    x.rotate(a + Math.PI / 2);
    const p = smoothP([[0, 0], [12, -26], [0, -60], [-12, -26]], 0.5);
    energy(x, p, t, 0, -30, 40, 0.5);
    x.restore();
  }
};

const vial: Glyph = (x, t, v) => {
  x.save();
  if (v % 2) {
    x.translate(64, 64);
    x.rotate(0.5);
    x.translate(-64, -64);
  }
  const glass = new Path2D();
  glass.moveTo(56, 18);
  glass.lineTo(56, 44);
  glass.bezierCurveTo(26, 56, 28, 108, 64, 110);
  glass.bezierCurveTo(100, 108, 102, 56, 72, 44);
  glass.lineTo(72, 18);
  glass.closePath();
  x.fillStyle = css(sink(t.glow, 0.8), 0.7);
  x.fill(glass);
  x.save();
  x.clip(glass);
  const lq = x.createLinearGradient(0, 60, 0, 110);
  lq.addColorStop(0, css(lift(t.glow, 0.3)));
  lq.addColorStop(1, css(sink(t.glow, 0.4)));
  x.fillStyle = lq;
  x.fillRect(20, 62, 90, 60);
  glow(x, 66, 86, 26, t.core, 0.6);
  x.restore();
  x.save();
  x.lineWidth = 3;
  x.strokeStyle = 'rgba(6,6,8,.95)';
  x.stroke(glass);
  x.lineWidth = 1.4;
  x.strokeStyle = 'rgba(220,235,255,.7)';
  x.stroke(glass);
  x.restore();
  spec(x, 46, 80, 4, 14, 0.2, 0.7);
  obj(x, rrectP(52, 10, 24, 14, 4), WOOD, t, [52, 10], [76, 24], 0.5);
  x.restore();
};

const totem: Glyph = (x, t) => {
  obj(x, rrectP(48, 20, 32, 90, 6), WOOD, t, [48, 20], [80, 110], 1.2);
  for (const [fy, ey] of [[26, 38], [62, 74]] as const) {
    x.fillStyle = 'rgba(8,6,4,.9)';
    x.fill(rrectP(52, fy, 24, 28, 4));
    for (const ex of [58, 70]) {
      x.fillStyle = '#0a0806';
      x.beginPath();
      x.arc(ex, ey, 3.6, 0, Math.PI * 2);
      x.fill();
      glow(x, ex, ey, 7, t.glow, 1);
    }
  }
  for (const sg of [-1, 1]) obj(x, polyP([[64 + sg * 16, 30], [64 + sg * 38, 20], [64 + sg * 34, 34], [64 + sg * 16, 42]]), WOOD, t, [64 + sg * 38, 20], [64 + sg * 16, 42], 0.5);
};

const mirror: Glyph = (x, t) => {
  obj(x, ellipseP(64, 56, 32, 40), GOLD, t, [32, 16], [96, 96], 1.2);
  const glass = ellipseP(64, 56, 24, 32);
  const g = x.createLinearGradient(40, 24, 88, 88);
  g.addColorStop(0, css(lift(t.glow, 0.6)));
  g.addColorStop(0.5, css(sink(t.glow, 0.5)));
  g.addColorStop(1, css(t.glow));
  x.fillStyle = g;
  x.fill(glass);
  x.save();
  x.clip(glass);
  x.fillStyle = 'rgba(255,255,255,.35)';
  x.fill(polyP([[40, 40], [60, 24], [70, 24], [44, 56]]));
  x.restore();
  obj(x, rrectP(59, 94, 10, 22, 3), GOLD, t, [59, 94], [69, 116], 0.4);
};

const figure: Glyph = (x, t, v) => {
  const n = v % 3 === 2 ? 3 : v % 3 === 1 ? 2 : 1;
  // A hooded silhouette, back-lit so it reads on any dark ground: a halo
  // behind it, a body that lightens toward the shoulders and a bright rim.
  glow(x, 64, 58, 50, t.glow, 0.55);
  for (let i = n - 1; i >= 0; i--) {
    const ox = n === 1 ? 0 : (i - (n - 1) / 2) * 22;
    const a = n === 1 ? 1 : i === 0 ? 1 : 0.6;
    x.save();
    x.globalAlpha = a;
    x.translate(ox, 0);
    const p = smoothP([[64, 14], [78, 24], [78, 40], [72, 47], [92, 56], [98, 112], [30, 112], [36, 56], [56, 47], [50, 40], [50, 24]], 0.35);
    const g = x.createLinearGradient(40, 18, 88, 112);
    g.addColorStop(0, css(mixC(t.glow, t.dark, 0.35)));
    g.addColorStop(0.45, css(mixC(t.glow, t.dark, 0.62)));
    g.addColorStop(1, css(sink(t.dark, 0.3)));
    x.fillStyle = g;
    x.fill(p);
    // The face, in shadow under the hood.
    const face = smoothP([[64, 24], [72, 30], [71, 40], [64, 44], [57, 40], [56, 30]], 0.4);
    x.fillStyle = css(sink(t.dark, 0.6));
    x.fill(face);
    innerEdge(x, p, css(lift(t.glow, 0.35), 1), 5, -3, -2.5, 3);
    x.lineJoin = 'round';
    x.lineWidth = 3.2;
    x.strokeStyle = 'rgba(4,4,6,.9)';
    x.stroke(p);
    x.lineWidth = 2;
    x.strokeStyle = css(lift(t.glow, 0.25), 0.95);
    x.stroke(p);
    for (const ex of [60, 68]) glow(x, ex, 35, 5, t.core, 1);
    x.restore();
  }
};

const hand: Glyph = (x, t) => {
  const p = smoothP([[40, 108], [38, 70], [30, 50], [36, 46], [46, 60], [46, 24], [54, 22], [56, 54], [58, 16], [66, 16], [68, 52], [72, 20], [80, 22], [80, 56], [86, 32], [94, 34], [90, 76], [80, 108]], 0.35);
  obj(x, p, rampOf(0xb8957a, 0.1, 'fine', 0.2), t, [30, 16], [94, 108], 1.2);
  glow(x, 66, 60, 18, t.glow, 0.7);
};

const heart: Glyph = (x, t) => {
  const p = new Path2D();
  p.moveTo(64, 108);
  p.bezierCurveTo(10, 72, 16, 18, 64, 40);
  p.bezierCurveTo(112, 18, 118, 72, 64, 108);
  p.closePath();
  const m = rampOf(sink(saturate(t.glow, 0.2), 0.15), 0.4, 'mottle', 0.25);
  obj(x, p, m, t, [20, 24], [108, 108], 1.5);
  spec(x, 44, 46, 10, 5, -0.6, 0.7);
};

const coil: Glyph = (x, t) => {
  const p = new Path2D();
  for (let i = 0; i <= 80; i++) {
    const tt = i / 80;
    const a = tt * Math.PI * 9;
    const px = 64 + Math.cos(a) * 26;
    const py = 18 + tt * 92 + Math.sin(a) * 8;
    if (i === 0) p.moveTo(px, py);
    else p.lineTo(px, py);
  }
  x.save();
  x.lineCap = 'round';
  x.strokeStyle = css(STEEL.c[0]);
  x.lineWidth = 7;
  x.stroke(p);
  x.strokeStyle = css(mixC(STEEL.c[3], t.glow, 0.4));
  x.lineWidth = 4;
  x.stroke(p);
  x.restore();
  const arc = new Path2D();
  arc.moveTo(40, 30);
  arc.lineTo(54, 50);
  arc.lineTo(46, 62);
  arc.lineTo(62, 84);
  ray(x, arc, t, 2.6);
};

const crack: Glyph = (x, t) => {
  const p = new Path2D();
  p.moveTo(56, 12);
  p.lineTo(66, 40);
  p.lineTo(50, 60);
  p.lineTo(72, 84);
  p.lineTo(60, 116);
  p.moveTo(66, 40);
  p.lineTo(92, 46);
  p.moveTo(50, 60);
  p.lineTo(28, 66);
  p.moveTo(72, 84);
  p.lineTo(96, 96);
  ray(x, p, t, 5);
};

const footprints: Glyph = (x, t) => {
  for (let i = 0; i < 3; i++) {
    const fx = 44 + (i % 2) * 26;
    const fy = 96 - i * 32;
    const p = smoothP([[fx, fy - 14], [fx + 9, fy - 6], [fx + 7, fy + 12], [fx - 3, fy + 14], [fx - 8, fy]], 0.5);
    x.save();
    x.globalAlpha = 0.45 + i * 0.27;
    energy(x, p, t, fx, fy, 18);
    x.restore();
  }
};

// ---------------------------------------------------------------------------
// Energies
// ---------------------------------------------------------------------------

export function flamePath(cx = 64, cy = 64, s = 1): Path2D {
  const P = (px: number, py: number): Pt => [cx + px * s, cy + py * s];
  const p = new Path2D();
  const pts = [P(0, -50), P(16, -18), P(30, -30), P(34, 4), P(26, 34), P(0, 46), P(-26, 34), P(-34, 4), P(-24, -14), P(-14, -4)];
  return smoothP(pts, 0.42, true, p);
}

const flame: Glyph = (x, t, v) => {
  const outer = flamePath(64, 66, 1);
  energy(x, outer, t, 64, 82, 54, 0.45);
  const inner = flamePath(64, 82, 0.48);
  x.save();
  x.globalCompositeOperation = 'lighter';
  const g = x.createRadialGradient(64, 88, 2, 64, 82, 26);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, css(t.core, 0.9));
  g.addColorStop(1, css(t.core, 0));
  x.fillStyle = g;
  x.fill(inner);
  x.restore();
  if (v % 3 === 1) for (let i = 0; i < 5; i++) glow(x, 30 + i * 17, 26 + ((i * 37) % 30), 4, t.core, 1);
};

export function dropPath(cx = 64, cy = 64, s = 1): Path2D {
  const p = new Path2D();
  p.moveTo(cx, cy - 48 * s);
  p.bezierCurveTo(cx + 18 * s, cy - 18 * s, cx + 34 * s, cy + 2 * s, cx + 34 * s, cy + 20 * s);
  p.bezierCurveTo(cx + 34 * s, cy + 40 * s, cx + 18 * s, cy + 50 * s, cx, cy + 50 * s);
  p.bezierCurveTo(cx - 18 * s, cy + 50 * s, cx - 34 * s, cy + 40 * s, cx - 34 * s, cy + 20 * s);
  p.bezierCurveTo(cx - 34 * s, cy + 2 * s, cx - 18 * s, cy - 18 * s, cx, cy - 48 * s);
  p.closePath();
  return p;
}

const drop: Glyph = (x, t, v) => {
  energy(x, dropPath(64, 60, 0.95), t, 54, 76, 50, 0.4);
  spec(x, 50, 70, 6, 12, 0.3, 0.8);
  if (v % 2) for (const [dx, dy] of [[28, 30], [100, 42], [96, 96]] as const) energy(x, dropPath(dx, dy, 0.2), t, dx, dy, 10);
};

const bolt: Glyph = (x, t) => {
  const p = polyP([[74, 8], [36, 66], [60, 66], [44, 120], [94, 52], [68, 52], [86, 8]]);
  energy(x, p, t, 64, 60, 60, 0.5);
};

const flake: Glyph = (x, t) => {
  const p = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    p.moveTo(64, 64);
    p.lineTo(64 + ca * 46, 64 + sa * 46);
    for (const d of [20, 32]) {
      const bx = 64 + ca * d;
      const by = 64 + sa * d;
      const l = d === 20 ? 12 : 9;
      p.moveTo(bx, by);
      p.lineTo(bx + Math.cos(a - 0.7) * l, by + Math.sin(a - 0.7) * l);
      p.moveTo(bx, by);
      p.lineTo(bx + Math.cos(a + 0.7) * l, by + Math.sin(a + 0.7) * l);
    }
  }
  ray(x, p, t, 5);
  energy(x, starP(64, 64, 6, 6, 12, 0), t, 64, 64, 12);
};

const eye: Glyph = (x, t, v) => {
  const closed = v % 3 === 2;
  const lid = new Path2D();
  lid.moveTo(14, 64);
  lid.quadraticCurveTo(64, closed ? 84 : 18, 114, 64);
  lid.quadraticCurveTo(64, closed ? 92 : 110, 14, 64);
  lid.closePath();
  if (closed) {
    ray(x, lid, t, 3);
    for (let i = 0; i < 5; i++) {
      const l = new Path2D();
      const lx = 34 + i * 15;
      l.moveTo(lx, 80);
      l.lineTo(lx - 4 + i * 2, 94);
      ray(x, l, t, 2);
    }
    return;
  }
  x.save();
  x.fillStyle = css(0xe8e2d4);
  x.fill(lid);
  x.clip(lid);
  energy(x, circleP(64, 64, 22), t, 64, 64, 22, 0.6);
  x.fillStyle = '#050406';
  x.beginPath();
  x.ellipse(64, 64, v % 2 ? 4 : 8, v % 2 ? 16 : 8, 0, 0, Math.PI * 2);
  x.fill();
  innerEdge(x, lid, 'rgba(0,0,0,.7)', 6, 0, 4, 3);
  x.restore();
  x.save();
  x.lineWidth = 3.5;
  x.strokeStyle = 'rgba(6,5,6,.95)';
  x.stroke(lid);
  x.restore();
  glint(x, 56, 56, 6, 0xffffff, 0.9);
};

const orb: Glyph = (x, t) => {
  glow(x, 64, 64, 50, t.glow, 0.7);
  energy(x, circleP(64, 64, 30), t, 56, 56, 34, 0.5);
  const sw = new Path2D();
  sw.arc(64, 64, 20, 0.4, 2.6);
  ray(x, sw, t, 2);
  spec(x, 52, 50, 10, 5, -0.7, 0.9);
};

const star: Glyph = (x, t, v) => {
  const n = v % 2 ? 8 : 5;
  energy(x, starP(64, 64, n, n === 5 ? 18 : 14, 46), t, 64, 64, 46, 0.4);
};

const sun: Glyph = (x, t, v) => {
  glow(x, 64, 64, 60, t.glow, 0.7);
  if (v % 3 === 2) {
    // Eclipse: a black disc rimmed in fire.
    const rim = circleP(64, 64, 34);
    energy(x, rim, t, 64, 64, 36, 0.8);
    x.fillStyle = '#050307';
    x.beginPath();
    x.arc(68, 62, 30, 0, Math.PI * 2);
    x.fill();
    return;
  }
  energy(x, starP(64, 64, 12, 30, 50), t, 64, 64, 50, 0.4);
  energy(x, circleP(64, 64, 26), t, 58, 58, 28, 0.55);
};

const moon: Glyph = (x, t) => {
  const p = new Path2D();
  p.arc(64, 64, 40, Math.PI * 0.35, Math.PI * 1.65);
  p.arc(84, 56, 32, Math.PI * 1.45, Math.PI * 0.6, true);
  p.closePath();
  energy(x, p, t, 44, 64, 44, 0.5);
  for (const [sx, sy, r] of [[96, 30, 5], [104, 80, 4], [86, 100, 3]] as const) glint(x, sx, sy, r * 2, t.core, 1);
};

const cloud: Glyph = (x, t, v) => {
  const p = new Path2D();
  for (const [cx, cy, r] of [[40, 70, 20], [62, 56, 26], [88, 66, 20], [70, 80, 18], [48, 82, 16]] as const) p.addPath(circleP(cx, cy, r));
  x.save();
  x.globalAlpha = 0.95;
  const g = x.createLinearGradient(30, 30, 100, 100);
  g.addColorStop(0, css(lift(t.glow, 0.4)));
  g.addColorStop(1, css(sink(t.glow, 0.5)));
  x.fillStyle = g;
  x.fill(p);
  x.restore();
  innerEdge(x, p, css(t.dark, 0.8), 6, -2, -3, 2);
  if (v % 2) {
    const b = polyP([[70, 82], [56, 104], [66, 104], [58, 122], [80, 98], [70, 98], [78, 82]]);
    energy(x, b, { ...t, glow: mixC(t.glow, 0xffffff, 0.3) }, 66, 100, 22);
  } else {
    for (let i = 0; i < 4; i++) {
      const r = new Path2D();
      r.moveTo(42 + i * 14, 98);
      r.lineTo(36 + i * 14, 116);
      ray(x, r, t, 2.4);
    }
  }
};

const swirl: Glyph = (x, t, v) => {
  const arms = v % 2 ? 3 : 1;
  for (let k = 0; k < arms; k++) {
    const p = new Path2D();
    for (let i = 0; i <= 60; i++) {
      const tt = i / 60;
      const a = tt * Math.PI * (arms === 1 ? 3.6 : 2) + (k / arms) * Math.PI * 2;
      const r = 4 + tt * 44;
      const px = 64 + Math.cos(a) * r;
      const py = 64 + Math.sin(a) * r * (arms === 1 ? 0.8 : 1);
      if (i === 0) p.moveTo(px, py);
      else p.lineTo(px, py);
    }
    ray(x, p, t, arms === 1 ? 6 : 5);
  }
};

const tornado: Glyph = (x, t) => {
  for (let i = 0; i < 6; i++) {
    const y = 24 + i * 16;
    const w = 44 - i * 6.5;
    const e = new Path2D();
    e.ellipse(64 + Math.sin(i) * 4, y, w, 6, 0, Math.PI * 0.05, Math.PI * 1.95);
    ray(x, e, t, 4.6 - i * 0.4);
  }
};

const ghost: Glyph = (x, t) => {
  const p = smoothP([[64, 16], [92, 34], [96, 74], [104, 112], [88, 100], [76, 114], [64, 100], [52, 114], [40, 100], [24, 112], [32, 74], [36, 34]], 0.4);
  x.save();
  x.globalAlpha = 0.92;
  energy(x, p, t, 64, 50, 70, 0.3);
  x.restore();
  for (const ex of [52, 76]) {
    x.fillStyle = '#05040a';
    x.beginPath();
    x.ellipse(ex, 52, 6, 9, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#05040a';
  x.beginPath();
  x.ellipse(64, 76, 6, 9, 0, 0, Math.PI * 2);
  x.fill();
};

const wing: Glyph = (x, t, v) => {
  const sides = v % 2 ? [-1, 1] : [1];
  for (const sg of sides) {
    const ox = sides.length === 1 ? -14 : 0;
    for (let i = 0; i < 4; i++) {
      const p = smoothP([[64 + ox + sg * 4, 50 + i * 4], [64 + ox + sg * (30 + i * 4), 22 + i * 18], [64 + ox + sg * (50 - i * 6), 34 + i * 22], [64 + ox + sg * 6, 62 + i * 4]], 0.4);
      x.save();
      x.globalAlpha = 1 - i * 0.12;
      energy(x, p, t, 64 + ox + sg * 30, 40 + i * 14, 40, 0.5);
      x.restore();
    }
  }
};

const rune: Glyph = (x, t, v) => {
  const r = circleP(64, 64, 42);
  ray(x, r, t, 3);
  const inner = new Path2D();
  const n = 3 + (v % 4);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const b = -Math.PI / 2 + (((i + Math.floor(n / 2)) % n) / n) * Math.PI * 2;
    inner.moveTo(64 + Math.cos(a) * 42, 64 + Math.sin(a) * 42);
    inner.lineTo(64 + Math.cos(b) * 42, 64 + Math.sin(b) * 42);
  }
  ray(x, inner, t, 3);
  energy(x, circleP(64, 64, 8), t, 64, 64, 10);
};

const nova: Glyph = (x, t) => {
  glow(x, 64, 64, 56, t.glow, 0.8);
  energy(x, starP(64, 64, 16, 22, 50), t, 64, 64, 50, 0.35);
  energy(x, circleP(64, 64, 16), t, 64, 64, 18, 0.6);
};

const beam: Glyph = (x, t) => {
  const p = new Path2D();
  p.moveTo(18, 110);
  p.lineTo(110, 18);
  ray(x, p, t, 12);
  energy(x, circleP(22, 106, 12), t, 22, 106, 14);
  for (let i = 0; i < 4; i++) {
    const s = new Path2D();
    const c = 34 + i * 20;
    s.moveTo(c - 10, 128 - c - 10);
    s.lineTo(c + 10, 128 - c + 10);
    ray(x, s, t, 2);
  }
};

const wave: Glyph = (x, t) => {
  for (let i = 0; i < 3; i++) {
    const p = new Path2D();
    const y = 40 + i * 22;
    p.moveTo(14, y + 10);
    p.bezierCurveTo(40, y - 16, 56, y + 24, 80, y);
    p.bezierCurveTo(94, y - 12, 104, y - 6, 114, y + 4);
    ray(x, p, t, 6 - i * 1.3);
  }
};

const hourglass: Glyph = (x, t) => {
  const g = polyP([[38, 22], [90, 22], [68, 64], [90, 106], [38, 106], [60, 64]]);
  x.fillStyle = css(sink(t.glow, 0.7), 0.7);
  x.fill(g);
  energy(x, polyP([[50, 98], [78, 98], [64, 80]]), t, 64, 92, 16);
  energy(x, polyP([[48, 30], [80, 30], [64, 54]]), t, 64, 38, 18);
  x.save();
  x.lineWidth = 2.5;
  x.strokeStyle = 'rgba(220,235,255,.6)';
  x.stroke(g);
  x.restore();
  obj(x, rrectP(30, 14, 68, 10, 3), WOOD, t, [30, 14], [98, 24], 0.4);
  obj(x, rrectP(30, 104, 68, 10, 3), WOOD, t, [30, 104], [98, 114], 0.4);
};

const lungs: Glyph = (x, t) => {
  for (const sg of [-1, 1]) {
    const p = smoothP([[64 + sg * 6, 34], [64 + sg * 34, 40], [64 + sg * 40, 84], [64 + sg * 26, 104], [64 + sg * 8, 96]], 0.4);
    energy(x, p, t, 64 + sg * 24, 70, 44, 0.4);
  }
  const tr = new Path2D();
  tr.moveTo(64, 14);
  tr.lineTo(64, 44);
  tr.moveTo(64, 44);
  tr.lineTo(54, 54);
  tr.moveTo(64, 44);
  tr.lineTo(74, 54);
  ray(x, tr, t, 4);
};

const coin: Glyph = (x, t) => {
  obj(x, circleP(64, 64, 40), GOLD, t, [24, 24], [104, 104], 1.4);
  const r = new Path2D();
  r.arc(64, 64, 32, 0, Math.PI * 2);
  x.save();
  x.strokeStyle = css(GOLD.c[0], 0.7);
  x.lineWidth = 2;
  x.stroke(r);
  x.restore();
  crown(x, t, 0);
};

const brand: Glyph = (x, t) => {
  energy(x, starP(64, 64, 4, 10, 46, -Math.PI / 2), t, 64, 64, 46, 0.4);
  ray(x, circleP(64, 64, 30), t, 3);
};

const anchor: Glyph = (x, t) => {
  const p = new Path2D();
  p.moveTo(64, 26);
  p.lineTo(64, 104);
  p.moveTo(40, 44);
  p.lineTo(88, 44);
  p.moveTo(26, 78);
  p.quadraticCurveTo(34, 104, 64, 106);
  p.quadraticCurveTo(94, 104, 102, 78);
  x.save();
  x.lineCap = 'round';
  x.strokeStyle = css(IRON.c[0]);
  x.lineWidth = 12;
  x.stroke(p);
  x.strokeStyle = css(IRON.c[2]);
  x.lineWidth = 8;
  x.stroke(p);
  x.strokeStyle = css(IRON.c[4], 0.6);
  x.lineWidth = 2;
  x.translate(-1.5, -1.5);
  x.stroke(p);
  x.restore();
  obj(x, ringPath(64, 20, 9, 4), IRON, t, [55, 11], [73, 29], 0.4);
};

function ringPath(cx: number, cy: number, r: number, w: number): Path2D {
  const p = new Path2D();
  p.arc(cx, cy, r, 0, Math.PI * 2);
  p.moveTo(cx + r - w, cy);
  p.arc(cx, cy, r - w, 0, Math.PI * 2, true);
  return p;
}

const wilt: Glyph = (x, t) => {
  const stem = new Path2D();
  stem.moveTo(54, 112);
  stem.quadraticCurveTo(58, 54, 86, 44);
  ray(x, stem, { ...t, glow: sink(t.glow, 0.2) }, 4);
  for (const [px, py, a] of [[84, 46, 0.9], [62, 74, -0.6], [58, 92, 0.5]] as const) {
    x.save();
    x.translate(px, py);
    x.rotate(a);
    energy(x, smoothP([[0, 0], [10, 14], [0, 30], [-10, 14]], 0.5), t, 0, 14, 20, 0.4);
    x.restore();
  }
};

const mute: Glyph = (x, t) => {
  const mouth = ellipseP(64, 64, 34, 18);
  energy(x, mouth, t, 64, 64, 34, 0.4);
  const bar = new Path2D();
  bar.moveTo(22, 102);
  bar.lineTo(106, 26);
  x.save();
  x.lineCap = 'round';
  x.strokeStyle = 'rgba(8,6,6,.95)';
  x.lineWidth = 13;
  x.stroke(bar);
  x.strokeStyle = css(0xd04040);
  x.lineWidth = 8;
  x.stroke(bar);
  x.restore();
};

const lens: Glyph = (x, t) => {
  obj(x, ringPath(56, 56, 34, 8), GOLD, t, [22, 22], [90, 90], 1);
  const glass = circleP(56, 56, 26);
  x.fillStyle = css(t.glow, 0.35);
  x.fill(glass);
  spec(x, 46, 44, 12, 6, -0.7, 0.8);
  obj(x, polyP([[78, 84], [86, 76], [112, 102], [104, 110]]), WOOD, t, [78, 76], [112, 110], 0.6);
};

const feather: Glyph = (x, t) => {
  const p = smoothP([[90, 14], [98, 40], [78, 80], [44, 108], [40, 100], [56, 66], [76, 30]], 0.4);
  energy(x, p, t, 76, 50, 60, 0.4);
  const q = new Path2D();
  q.moveTo(94, 18);
  q.quadraticCurveTo(70, 60, 30, 116);
  x.save();
  x.strokeStyle = 'rgba(10,8,8,.85)';
  x.lineWidth = 2.4;
  x.stroke(q);
  x.restore();
};

const link: Glyph = (x, t) => chain(x, t, 0);

const gear: Glyph = (x, t) => {
  const p = new Path2D();
  const n = 10;
  for (let i = 0; i < n * 2; i++) {
    const a0 = (i / (n * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? 34 : 44;
    if (i === 0) p.moveTo(64 + Math.cos(a0) * r, 64 + Math.sin(a0) * r);
    p.lineTo(64 + Math.cos(a0) * r, 64 + Math.sin(a0) * r);
    p.lineTo(64 + Math.cos(a1) * r, 64 + Math.sin(a1) * r);
  }
  p.closePath();
  p.moveTo(78, 64);
  p.arc(64, 64, 14, 0, Math.PI * 2, true);
  obj(x, p, IRON, t, [20, 20], [108, 108], 1.4);
  glow(x, 64, 64, 14, t.glow, 0.8);
};

const bubble: Glyph = (x, t) => {
  const b = circleP(64, 64, 46);
  glow(x, 64, 64, 54, t.glow, 0.45);
  x.save();
  x.fillStyle = css(t.glow, 0.18);
  x.fill(b);
  x.restore();
  innerEdge(x, b, css(lift(t.glow, 0.3), 0.95), 10, 0, 0, 4);
  spec(x, 46, 40, 16, 7, -0.7, 0.85);
  x.save();
  x.lineWidth = 2;
  x.strokeStyle = css(lift(t.glow, 0.5), 0.9);
  x.stroke(b);
  x.restore();
};

const rift: Glyph = (x, t) => {
  const p = smoothP([[64, 10], [76, 40], [70, 64], [80, 92], [64, 118], [54, 90], [60, 64], [48, 38]], 0.4);
  glow(x, 64, 64, 52, t.glow, 0.8);
  x.fillStyle = '#04020a';
  x.fill(p);
  innerEdge(x, p, css(t.glow, 1), 6, 0, 0, 3);
  x.save();
  x.lineWidth = 2;
  x.strokeStyle = css(t.core);
  x.stroke(p);
  x.restore();
};

// ---------------------------------------------------------------------------
// Elite affix pictograms (each says what the affix asks of the player)
// ---------------------------------------------------------------------------

/** Desecrator: a fouled pool on the ground, fumes rising. */
const pool: Glyph = (x, t) => {
  x.save();
  x.translate(64, 88);
  x.scale(1, 0.4);
  glow(x, 0, 0, 60, t.glow, 0.7);
  const splat = smoothP([[-46, -6], [-30, -34], [0, -40], [34, -30], [48, -4], [36, 28], [4, 38], [-34, 30]], 0.45);
  energy(x, splat, t, 0, 0, 46, 0.35);
  x.restore();
  for (const [bx, by, r] of [[46, 84, 5], [76, 90, 4], [62, 80, 3]] as const) {
    x.save();
    x.lineWidth = 1.6;
    x.strokeStyle = css(lift(t.core, 0.3), 0.9);
    x.beginPath();
    x.arc(bx, by, r, 0, Math.PI * 2);
    x.stroke();
    x.restore();
  }
  for (const [fx, h] of [[44, 50], [64, 62], [84, 46]] as const) {
    const f = new Path2D();
    f.moveTo(fx, 78);
    f.bezierCurveTo(fx - 10, 78 - h * 0.35, fx + 10, 78 - h * 0.65, fx, 78 - h);
    ray(x, f, t, 3.2);
  }
};

/** Fire Chains: links of burning chain, flames licking off them. */
const firechain: Glyph = (x, t) => {
  glow(x, 64, 64, 50, t.glow, 0.55);
  for (let i = 0; i < 4; i++) {
    const cx = 28 + i * 24;
    const cy = 96 - i * 22;
    const l = ellipseP(cx, cy, i % 2 ? 9 : 17, i % 2 ? 17 : 9, -0.75);
    x.save();
    x.lineWidth = 11;
    x.strokeStyle = css(sink(t.dark, 0.5), 0.95);
    x.stroke(l);
    x.restore();
    emissiveStroke(x, l, t.glow, 7, 1);
    x.save();
    x.lineWidth = 2.4;
    x.strokeStyle = css(t.core);
    x.stroke(l);
    x.restore();
  }
  for (const [fx, fy, k] of [[38, 62, 0.42], [72, 46, 0.48], [90, 96, 0.36]] as const) energy(x, flamePath(fx, fy, k), t, fx, fy + 4, 16, 0.6);
};

/** Bulwark: a shield under a dome that shelters the pack behind it. */
const ward: Glyph = (x, t) => {
  const dome = new Path2D();
  dome.arc(64, 92, 52, Math.PI * 1.05, Math.PI * 1.95);
  glow(x, 64, 70, 54, t.glow, 0.45);
  ray(x, dome, t, 4);
  const dome2 = new Path2D();
  dome2.arc(64, 92, 42, Math.PI * 1.1, Math.PI * 1.9);
  x.save();
  x.globalAlpha = 0.55;
  ray(x, dome2, t, 2.4);
  x.restore();
  for (const px of [24, 104]) energy(x, circleP(px, 96, 7), t, px, 96, 8, 0.5);
  x.save();
  x.translate(64, 76);
  x.scale(0.62, 0.62);
  x.translate(-64, -64);
  shield(x, t, 1);
  x.restore();
};

/** Splitting: one body tearing into two, the seam glowing. */
const split: Glyph = (x, t) => {
  glow(x, 64, 64, 48, t.glow, 0.5);
  for (const sg of [-1, 1]) {
    x.save();
    x.translate(sg * 9, sg * -2);
    x.rotate(sg * 0.12);
    const half = new Path2D();
    const cx = 64;
    half.moveTo(cx, 20);
    half.bezierCurveTo(cx + sg * 44, 22, cx + sg * 50, 92, cx + sg * 4, 108);
    half.lineTo(cx + sg * 8, 92);
    half.lineTo(cx - sg * 2, 78);
    half.lineTo(cx + sg * 8, 62);
    half.lineTo(cx - sg * 2, 46);
    half.lineTo(cx + sg * 6, 32);
    half.closePath();
    energy(x, half, t, cx + sg * 22, 54, 50, 0.3);
    for (const ey of [48]) glow(x, cx + sg * 20, ey, 5, 0xffffff, 1);
    x.restore();
  }
  const seam = new Path2D();
  seam.moveTo(64, 14);
  seam.lineTo(60, 40);
  seam.lineTo(68, 60);
  seam.lineTo(60, 80);
  seam.lineTo(66, 112);
  ray(x, seam, { core: 0xffffff, glow: t.glow, dark: t.dark }, 2);
};

/** Hexing: a ward cracked through by a curse rune. */
const hexshield: Glyph = (x, t) => {
  glow(x, 64, 64, 52, t.glow, 0.5);
  const p = shieldPath(0.92);
  obj(x, p, BRIGHT_STEEL, t);
  const inner = shieldPath(0.7, 64, 62);
  x.fillStyle = css(sink(t.glow, 0.6), 0.9);
  x.fill(inner);
  // An inverted triangle rune over the boss of the shield.
  const r = new Path2D();
  r.moveTo(44, 40);
  r.lineTo(84, 40);
  r.lineTo(64, 76);
  r.closePath();
  r.moveTo(64, 30);
  r.lineTo(64, 88);
  ray(x, r, t, 3.4);
  const cr = new Path2D();
  cr.moveTo(30, 22);
  cr.lineTo(46, 46);
  cr.lineTo(40, 60);
  cr.lineTo(58, 82);
  cr.lineTo(54, 106);
  x.save();
  x.lineWidth = 5;
  x.lineJoin = 'round';
  x.strokeStyle = '#050407';
  x.stroke(cr);
  x.restore();
  ray(x, cr, t, 1.8);
};

/** Adaptive: a carapace plate ringed by the four elements it learns. */
const adapt: Glyph = (x, t) => {
  glow(x, 64, 64, 46, t.glow, 0.45);
  const hex: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
    hex.push([64 + Math.cos(a) * 30, 64 + Math.sin(a) * 30]);
  }
  obj(x, polyP(hex), BRIGHT_STEEL, t, [36, 36], [92, 92], 1);
  const facets = new Path2D();
  for (const [hx, hy] of hex) {
    facets.moveTo(64, 64);
    facets.lineTo(hx, hy);
  }
  x.save();
  x.strokeStyle = 'rgba(0,0,0,.45)';
  x.lineWidth = 1.4;
  x.stroke(facets);
  x.restore();
  energy(x, circleP(64, 64, 8), t, 64, 64, 9, 0.6);
  const ELEM: Array<[number, number, number]> = [[0xff6a1a, 64, 18], [0x4ab4ff, 110, 64], [0xa47bff, 64, 110], [0x6cd030, 18, 64]];
  for (const [c, ex, ey] of ELEM) energy(x, circleP(ex, ey, 9), { core: lift(c, 0.7), glow: c, dark: sink(c, 0.8) }, ex, ey, 10, 0.55);
};

/** Lancer: a couched lance driving forward, speed lines behind. */
const lance: Glyph = (x, t) => {
  x.save();
  x.translate(64, 64);
  x.rotate(-Math.PI / 4);
  x.translate(-64, -64);
  for (let i = 0; i < 3; i++) {
    const p = new Path2D();
    const oy = (i - 1) * 16;
    p.moveTo(6, 64 + oy);
    p.lineTo(34 - Math.abs(oy) * 0.6, 64 + oy);
    x.save();
    x.globalAlpha = 0.85;
    ray(x, p, t, 3);
    x.restore();
  }
  // A tapering jousting lance, banded in the affix colour, behind a steel guard.
  const cone = polyP([[40, 50], [122, 62], [122, 66], [40, 78]]);
  obj(x, cone, rampOf(0xc8a070, 0.05, 'grain', 0.3), t, [40, 50], [40, 78], 0.8);
  x.save();
  x.clip(cone);
  for (let i = 0; i < 4; i++) {
    const bx = 52 + i * 18;
    x.fillStyle = css(t.glow, 0.85);
    x.beginPath();
    x.moveTo(bx, 40);
    x.lineTo(bx + 8, 40);
    x.lineTo(bx + 2, 90);
    x.lineTo(bx - 6, 90);
    x.closePath();
    x.fill();
  }
  x.restore();
  obj(x, ellipseP(38, 64, 7, 20), BRIGHT_STEEL, t, [31, 44], [45, 84], 0.7);
  x.restore();
  glint(x, 104, 24, 10, lift(t.core, 0.5), 1);
};

export const GLYPHS: Record<string, Glyph> = {
  shield, sword, dagger, axe, hammer, anvil, fist, skull, bone, chalice, crown, banner, horn, arrow, bow, target,
  boot, trap, quiver, helm, cage, chain, scythe, claw, tower, boulder, spikes, fang, serpent, leaf, vial, totem,
  mirror, figure, hand, heart, coil, crack, footprints, flame, drop, bolt, flake, eye, orb, star, sun, moon, cloud,
  swirl, tornado, ghost, wing, rune, nova, beam, wave, hourglass, lungs, coin, brand, anchor, wilt, mute, lens,
  feather, link, gear, bubble, rift, pool, firechain, ward, split, hexshield, adapt, lance,
};

export { obj as paintObject, energy as paintEnergy, ray as paintRay };
