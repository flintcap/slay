/**
 * SLAY — the Shapeshifter's own pictograms, spread into `GLYPHS` (`Glyphs.ts`).
 *
 * Same 128-unit canvas and painting rules as the shared set. Only `./Paint`
 * is imported at run time, so the shared module can spread this in without
 * a cycle. Every one of his skills has a glyph and variant of its own
 * (`icons/shifterIcons.ts`), so no two of his pictures are alike.
 *
 *   beast   a beast's head, face on, eyes lit. v0 the black cat, v1 the grey
 *           wolf, v2 the bear; v3 the cat crowned, v4 the wolf in its ruff,
 *           v5 the old grey bear among the four elements, v6 the bear with
 *           old scars over one eye, v7 the bear roaring.
 *   paw     a paw print, claws out. v0 cat, v1 wolf, v2 bear; v3 the cat's
 *           print in blood, v4 three wolf prints, v5 a cat's trail.
 *   howl    a wolf's head thrown back, howling at a moon. v1 the moon is
 *           red; v2 no moon, the howl itself bleeds.
 *   sstear  claw tears. v0 a cat's swipe, v1 across the back of a heel,
 *           v2 tears that bleed, v3 the bear's four, v4 tears all round a foe.
 *   sscat   the black cat, whole. v0 diving claws first, v1 at a flat run,
 *           v2 slinking low over its shadow, v3 walking tall, tail curled.
 *   sswolf  the grey wolf, whole. v0 in the lunge, v1 two at a trot,
 *           v2 on a rock, head high, v3 alone and bleeding, hackles up.
 *   ssbear  the bear, whole. v0 reared up and full of stars, v1 charging,
 *           v2 sat on bedrock, v3 stood firm with arrows in its back.
 *   ssjaw   jaws. v0 the wolf's snap, v1 a shaking bite, v2 the cat's
 *           snarl, fangs blooded, v3 a jawbone of sharp teeth, v4 three jaws
 *           biting outward.
 *   sseyes  eyes in the dark. v0 two cat's eyes, v1 a pack's eyes, v2 a
 *           cat's eyes in the brush under the moon, v3 two red eyes, snarling.
 *   sshide  hide. v0 a stretched pelt, v1 fur standing in spines, v2 scarred.
 *   ssheart a heart. v0 bitten and bleeding, v1 under thick fat, v2 the
 *           cat's own, eared and eyed.
 *   ssclaw  claws and arms. v0 one great hooked claw, v1 a raised paw
 *           striking back, v2 two paws slammed down, v3 a paw sweeping
 *           round, v4 two arms crushing a foe.
 */
import type { Glyph, Tone } from './Glyphs';
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
  polyP,
  saturate,
  sink,
  smoothP,
  solid,
  starP,
} from './Paint';

const BLACK_FUR = mat([0x07060a, 0x141220, 0x26223a, 0x3e3858, 0x6a6290], 0, 'mottle', 0.45, 0.7);
const GREY_FUR = mat([0x15140f, 0x34312a, 0x5c574a, 0x8a8370, 0xc4bca4], 0, 'mottle', 0.5, 0.7);
const BROWN_FUR = mat([0x140b05, 0x352010, 0x5c3a1e, 0x8a5c32, 0xb88a58], 0, 'mottle', 0.5, 0.7);
const OLD_FUR = mat([0x15130f, 0x3a352d, 0x686052, 0x9a9282, 0xd0c8b6], 0, 'mottle', 0.5, 0.7);
const RUFF = mat([0x1e1c16, 0x4a463a, 0x7a7462, 0xaaa28c, 0xdcd4bc], 0, 'mottle', 0.55, 0.7);
const HORN = mat([0x1a1610, 0x4a4234, 0x8a7e66, 0xc8bc9c, 0xf4ecd8], 0.15, 'fine', 0.2);
const BONE = mat([0x2a241a, 0x5a5140, 0x9a8f74, 0xcdc3a3, 0xf6eed6], 0.15, 'mottle', 0.3);
const PAD = mat([0x0c0808, 0x241818, 0x3c2a28, 0x5a4440, 0x806460], 0, 'pores', 0.4);
const BLOOD = mat([0x1a0204, 0x4a0608, 0x8a1010, 0xc42a20, 0xf07060], 0.3, 'fine', 0.15);
const PELT = mat([0x1c1008, 0x45291a, 0x74492c, 0xa0704a, 0xc89a70], 0.05, 'pores', 0.45);
const FAT = mat([0x2a2010, 0x6a5634, 0xb09464, 0xdcc494, 0xfaecc8], 0.1, 'fine', 0.25);
const SCAR = mat([0x2a1010, 0x6a3430, 0xa86a60, 0xd8a090, 0xf8d8c8], 0.1, 'fine', 0.2);
const STONE = mat([0x131518, 0x2b2f33, 0x4e5358, 0x7a7f84, 0xa8adb2], 0, 'crack', 0.45);
const WOOD = mat([0x1c120a, 0x3c2816, 0x694829, 0x946b42, 0xbf9466], 0.05, 'grain', 0.45, 0.6);
const GOLD = mat([0x342104, 0x765014, 0xbd8823, 0xedc45a, 0xfff3bd], 0.9, 'brushed', 0.15);
const FOE = mat([0x08080a, 0x141418, 0x24242a, 0x38383f, 0x55555e], 0, 'fine', 0.2);
const GUM = 0x3a080c;

const FURS: readonly Mat[] = [BLACK_FUR, GREY_FUR, BROWN_FUR];
const EYES: readonly number[] = [0xb89cff, 0xffc040, 0xff8a30];
const RED_EYE = 0xff3a20;

const FIRE: Tone = { core: 0xfff0b0, glow: 0xff6a1a, dark: 0x3a0e04 };
const COLD: Tone = { core: 0xf0faff, glow: 0x4ab4ff, dark: 0x08223a };
const SHOCK: Tone = { core: 0xf8f2ff, glow: 0xa47bff, dark: 0x1e1040 };
const VENOM: Tone = { core: 0xeeffb8, glow: 0x6cd030, dark: 0x14280a };

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------

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

/** A glowing line with a dark under-stroke. */
function ray(x: Ctx, p: Path2D, t: Tone, w: number, a = 1): void {
  x.save();
  x.globalAlpha = a;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = css(sink(t.dark, 0.5), 0.9);
  x.lineWidth = w + 3.5;
  x.stroke(p);
  x.restore();
  emissiveStroke(x, p, t.glow, w, a);
  x.save();
  x.globalAlpha = a;
  x.lineCap = 'round';
  x.strokeStyle = css(t.core, 0.95);
  x.lineWidth = Math.max(1.2, w * 0.38);
  x.stroke(p);
  x.restore();
}

/** An open polyline. */
function line(pts: readonly Pt[]): Path2D {
  const p = new Path2D();
  pts.forEach(([px, py], i) => (i ? p.lineTo(px, py) : p.moveTo(px, py)));
  return p;
}

/** Draws `fn` (painted about 64, 64) at (cx, cy), turned and scaled. */
function at(x: Ctx, cx: number, cy: number, rot: number, s: number, fn: () => void): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(s, s);
  x.translate(-64, -64);
  fn();
  x.restore();
}

/** A crescent from `a` to `b`, bowed `bend` to one side, `w` thick at its middle. */
function sliver(a: Pt, b: Pt, bend: number, w: number): Path2D {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const nx = -(b[1] - a[1]) / d;
  const ny = (b[0] - a[0]) / d;
  const p = new Path2D();
  p.moveTo(a[0], a[1]);
  p.quadraticCurveTo(mx + nx * (bend + w), my + ny * (bend + w), b[0], b[1]);
  p.quadraticCurveTo(mx + nx * (bend - w), my + ny * (bend - w), a[0], a[1]);
  p.closePath();
  return p;
}

/** A tapered limb, tail or neck along a polyline, `ws` its width at each point. */
function taper(pts: readonly Pt[], ws: readonly number[]): Path2D {
  const n = pts.length;
  const dirAt = (i: number): Pt => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  };
  const wAt = (i: number): number => (ws[Math.min(i, ws.length - 1)] ?? 4) / 2;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const [dx, dy] = dirAt(i);
    const w = wAt(i);
    const [px, py] = pts[i]!;
    left.push([px - dy * w, py + dx * w]);
    right.push([px + dy * w, py - dx * w]);
  }
  const [ex, ey] = dirAt(n - 1);
  const [sx, sy] = dirAt(0);
  const tip: Pt = [pts[n - 1]![0] + ex * wAt(n - 1), pts[n - 1]![1] + ey * wAt(n - 1)];
  const root: Pt = [pts[0]![0] - sx * wAt(0), pts[0]![1] - sy * wAt(0)];
  return smoothP([root, ...left, tip, ...right.reverse()], 0.3);
}

/** A sinking of every step of a material, for the far side of a body. */
function far(m: Mat): Mat {
  const [a, b, c, d, e] = m.c;
  return mat([sink(a, 0.3), sink(b, 0.35), sink(c, 0.4), sink(d, 0.45), sink(e, 0.5)], m.metal, m.tex, m.texAmt, m.texScale);
}

function dropP(cx: number, cy: number, s: number): Path2D {
  const p = new Path2D();
  p.moveTo(cx, cy - 48 * s);
  p.bezierCurveTo(cx + 18 * s, cy - 18 * s, cx + 34 * s, cy + 2 * s, cx + 34 * s, cy + 20 * s);
  p.bezierCurveTo(cx + 34 * s, cy + 40 * s, cx + 18 * s, cy + 50 * s, cx, cy + 50 * s);
  p.bezierCurveTo(cx - 18 * s, cy + 50 * s, cx - 34 * s, cy + 40 * s, cx - 34 * s, cy + 20 * s);
  p.bezierCurveTo(cx - 34 * s, cy + 2 * s, cx - 18 * s, cy - 18 * s, cx, cy - 48 * s);
  p.closePath();
  return p;
}

/** A drop of real blood, red whatever the tree's light. */
function bleed(x: Ctx, cx: number, cy: number, s: number): void {
  const p = dropP(cx, cy, s);
  solid(x, p, BLOOD, { a: [cx - 30 * s, cy - 40 * s], b: [cx + 30 * s, cy + 50 * s], size: Math.max(0.3, s * 2), outline: 1.4, outlineColor: 'rgba(10,2,2,.9)', tex: null, ao: 0.4 });
  glint(x, cx - 12 * s, cy + 12 * s, Math.max(1, 6 * s), 0xffd8c8, 0.85);
}

/** A run of blood down from a point. */
function stream(x: Ctx, pts: readonly Pt[], w: number): void {
  const p = taper(pts, [w, w * 0.8, w * 0.6, w * 0.45]);
  solid(x, p, BLOOD, { a: pts[0]!, b: pts[pts.length - 1]!, size: 0.4, outline: 1.2, outlineColor: 'rgba(10,2,2,.9)', tex: null, ao: 0.3 });
  const e = pts[pts.length - 1]!;
  bleed(x, e[0], e[1] + w * 0.9, w * 0.05);
}

/** One lit eye. */
function eyeAt(x: Ctx, cx: number, cy: number, r: number, color: number, slit: boolean, rot = -0.2): void {
  glow(x, cx, cy, r * 2.8, color, 0.9);
  x.fillStyle = css(color, 1);
  x.fill(ellipseP(cx, cy, r, r * 0.72, rot));
  x.fillStyle = 'rgba(4,3,6,.95)';
  x.fill(slit ? ellipseP(cx, cy, r * 0.2, r * 0.64, rot * 0.5) : circleP(cx, cy, r * 0.34));
  glint(x, cx - r * 0.3, cy - r * 0.3, r * 0.34, 0xffffff, 0.9);
}

/** Two lit eyes, slit for a cat, round for the rest. */
function eyes(x: Ctx, cx: number, y: number, gap: number, color: number, slit: boolean): void {
  for (const sg of [-1, 1]) {
    const ex = cx + sg * gap;
    glow(x, ex, y, 12, color, 0.9);
    x.fillStyle = css(color, 1);
    x.fill(ellipseP(ex, y, 5.5, slit ? 3.6 : 4.2, sg * -0.25));
    x.fillStyle = 'rgba(4,3,6,.95)';
    x.fill(slit ? ellipseP(ex, y, 1.1, 3.4) : circleP(ex, y, 1.8));
    glint(x, ex - 1.5, y - 1.5, 1.8, 0xffffff, 0.9);
  }
}

/** A row of teeth along a to b, pointing down (or up); `big` is the index of the long canine. */
function teethRow(x: Ctx, a: Pt, b: Pt, n: number, len: number, down: boolean, big = -1): void {
  const p = new Path2D();
  const sg = down ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const u0 = i / n;
    const u1 = (i + 1) / n;
    const um = (u0 + u1) / 2;
    const l = i === big ? len * 2.4 : len;
    p.moveTo(a[0] + (b[0] - a[0]) * u0, a[1] + (b[1] - a[1]) * u0);
    p.lineTo(a[0] + (b[0] - a[0]) * um, a[1] + (b[1] - a[1]) * um + sg * l);
    p.lineTo(a[0] + (b[0] - a[0]) * u1, a[1] + (b[1] - a[1]) * u1);
    p.closePath();
  }
  solid(x, p, HORN, { a: [a[0], a[1] - 4], b: [b[0], b[1] + 8], size: 0.4, outline: 1, outlineColor: 'rgba(10,6,6,.9)', tex: null, ao: 0.2 });
}

/** Three hooked claws out of the end of a limb. */
function clawsAt(x: Ctx, pts: readonly Pt[], w: number, len = 7): void {
  const n = pts.length;
  const e = pts[n - 1]!;
  const p = pts[n - 2]!;
  const d = Math.hypot(e[0] - p[0], e[1] - p[1]) || 1;
  const dx = (e[0] - p[0]) / d;
  const dy = (e[1] - p[1]) / d;
  for (const o of [-0.55, 0, 0.55]) {
    const bx = e[0] + dx * w * 0.3 - dy * o * w * 0.5;
    const by = e[1] + dy * w * 0.3 + dx * o * w * 0.5;
    const c = sliver([bx, by], [bx + dx * len, by + dy * len], 1.4, Math.max(1.8, w * 0.24));
    solid(x, c, HORN, { a: [bx - 3, by - 3], b: [bx + 3, by + 3], size: 0.3, outline: 0.8, outlineColor: 'rgba(8,6,6,.9)', tex: null, ao: 0 });
  }
}

/** A dark figure for the foe a skill is done to. */
function foe(x: Ctx, t: Tone, cx: number, cy: number, s: number): void {
  const head = circleP(cx, cy - 18 * s, 9 * s);
  const body = smoothP([[cx - 14 * s, cy - 6 * s], [cx + 14 * s, cy - 6 * s], [cx + 18 * s, cy + 16 * s], [cx + 8 * s, cy + 26 * s], [cx - 8 * s, cy + 26 * s], [cx - 18 * s, cy + 16 * s]], 0.4);
  for (const p of [body, head]) {
    solid(x, p, FOE, { a: [cx - 20 * s, cy - 30 * s], b: [cx + 20 * s, cy + 30 * s], size: s, outline: 1.6, outlineColor: 'rgba(0,0,0,.95)' });
    innerEdge(x, p, css(t.glow, 0.6), 2.5, -1.5, -1.5, 1.5);
  }
}

/** Speed lines trailing off to the left, for a beast at full stretch. */
function streaks(x: Ctx, t: Tone, dy: number): void {
  for (let i = 0; i < 4; i++) {
    const y = 40 + dy + i * 14;
    ray(x, line([[4 + (i % 2) * 6, y], [26 + (i % 2) * 4, y]]), t, 2.2, 0.4 + i * 0.12);
  }
}

// ---------------------------------------------------------------------------
// Whole beasts, side on, facing right
// ---------------------------------------------------------------------------

type Limb = readonly [readonly Pt[], readonly number[]];

interface Body {
  fur: Mat;
  body: readonly Pt[];
  head: Path2D;
  ears?: readonly Path2D[];
  tail?: Limb;
  /** Drawn behind the body, darker. */
  back?: readonly Limb[];
  /** Drawn over the body. */
  near?: readonly Limb[];
  /** Over the body, under the head: a neck, a hump of hackles. */
  extra?: readonly Path2D[];
  eye: Pt;
  eyeR?: number;
  eyeColor: number;
  slit?: boolean;
  nose?: Pt;
  claws?: boolean;
  /** An open mouth: the gum wedge behind the jaws and the jaw under it. */
  mouth?: { gum: Path2D; jaw: Path2D; upper: [Pt, Pt]; lower: [Pt, Pt] };
}

const LIT: Pt = [24, 16];
const SHADE: Pt = [104, 116];

function part(x: Ctx, t: Tone, p: Path2D, m: Mat, size = 1): void {
  solid(x, p, m, { a: LIT, b: SHADE, size, outline: 2.2, outlineColor: 'rgba(6,5,6,.95)' });
  innerEdge(x, p, css(lift(t.glow, 0.15), 0.95), 3.5, -2.4, -2.4, 2.4);
}

/**
 * How much heavier than its outline each beast is drawn, so it reads at
 * hotbar size: the body deepened, the limbs thickened, the head grown
 * about the eye.
 */
const BUILD = new Map<Mat, { deep: number; limb: number; head: number }>([
  [BLACK_FUR, { deep: 1.35, limb: 1.55, head: 1.35 }],
  [GREY_FUR, { deep: 1.25, limb: 1.45, head: 1.2 }],
  [BROWN_FUR, { deep: 1.1, limb: 1.2, head: 1.15 }],
]);

function creature(x: Ctx, t: Tone, q: Body): void {
  const b = BUILD.get(q.fur) ?? { deep: 1.25, limb: 1.45, head: 1.2 };
  const dim = far(q.fur);
  const thick = (ws: readonly number[]): number[] => ws.map((w) => w * b.limb);
  for (const [pts, ws] of q.back ?? []) {
    const w = thick(ws);
    part(x, t, taper(pts, w), dim, 0.6);
    if (q.claws) clawsAt(x, pts, w[w.length - 1]!);
  }
  if (q.tail) part(x, t, taper(q.tail[0], thick(q.tail[1])), q.fur, 0.6);
  const cy = q.body.reduce((s, p) => s + p[1], 0) / q.body.length;
  part(x, t, smoothP(q.body.map(([px, py]) => [px, cy + (py - cy) * b.deep] as Pt), 0.45), q.fur, 1.4);
  for (const e of q.extra ?? []) part(x, t, e, q.fur, 0.8);
  // The head and all on it, grown about the eye.
  x.save();
  x.translate(q.eye[0], q.eye[1]);
  x.scale(b.head, b.head);
  x.translate(-q.eye[0], -q.eye[1]);
  for (const e of q.ears ?? []) part(x, t, e, q.fur, 0.4);
  if (q.mouth) {
    x.fillStyle = css(GUM);
    x.fill(q.mouth.gum);
    teethRow(x, q.mouth.lower[0], q.mouth.lower[1], 4, 3, false, 3);
    part(x, t, q.mouth.jaw, q.fur, 0.5);
  }
  part(x, t, q.head, q.fur, 0.9);
  if (q.mouth) teethRow(x, q.mouth.upper[0], q.mouth.upper[1], 5, 3, true, 4);
  if (q.nose) {
    x.fillStyle = 'rgba(6,4,6,1)';
    x.fill(circleP(q.nose[0], q.nose[1], 2.8));
    glint(x, q.nose[0] - 0.8, q.nose[1] - 1, 1, 0xffffff, 0.6);
  }
  eyeAt(x, q.eye[0], q.eye[1], q.eyeR ?? 4.4, q.eyeColor, !!q.slit);
  x.restore();
  for (const [pts, ws] of q.near ?? []) {
    const w = thick(ws);
    part(x, t, taper(pts, w), q.fur, 0.7);
    if (q.claws) clawsAt(x, pts, w[w.length - 1]!);
  }
}

// The cat: lean, small-headed, a long tail.
const CAT_BODY: readonly Pt[] = [[30, 62], [40, 54], [58, 51], [78, 51], [92, 54], [100, 62], [96, 72], [80, 76], [58, 74], [40, 74], [30, 70]];
const CAT_HEAD: readonly Pt[] = [[96, 50], [101, 42], [110, 39], [118, 43], [125, 51], [121, 58], [112, 62], [102, 60]];
const catEars = (dx = 0, dy = 0, back = 0): Path2D[] => [
  polyP([[101 + dx, 45 + dy], [102 + dx - back, 29 + dy + back * 0.6], [110 + dx, 40 + dy]]),
  polyP([[109 + dx, 41 + dy], [116 + dx - back, 30 + dy + back * 0.6], [118 + dx, 45 + dy]]),
];
const shift = (pts: readonly Pt[], dx: number, dy: number): Pt[] => pts.map(([px, py]) => [px + dx, py + dy] as Pt);

function catPose(k: number): Body {
  const base = { fur: BLACK_FUR, eyeColor: EYES[0]!, slit: true, claws: true, eyeR: 4.2 };
  if (k === 0 || k === 1) {
    // Stretched out: diving onto prey (0) or at a flat run (1).
    const dive = k === 0;
    return {
      ...base,
      body: CAT_BODY,
      head: smoothP(CAT_HEAD, 0.4),
      ears: catEars(0, 0, 4),
      tail: [[[30, 60], [18, 54], [8, 56], [2, 62]], [8, 6, 5, 3]],
      back: dive
        ? [[[[92, 62], [108, 62], [122, 58]], [9, 6, 5]], [[[38, 66], [24, 64], [10, 60]], [10, 7, 5]]]
        : [[[[90, 68], [102, 84], [112, 94]], [9, 6, 5]], [[[36, 68], [22, 74], [8, 76]], [10, 7, 5]]],
      near: dive
        ? [[[[94, 66], [110, 72], [124, 76]], [10, 7, 6]], [[[40, 70], [26, 74], [12, 72]], [11, 8, 6]]]
        : [[[[94, 68], [108, 80], [122, 86]], [10, 7, 5]], [[[40, 70], [26, 82], [10, 88]], [11, 8, 5]]],
      eye: [113, 48],
      nose: [124, 51],
    };
  }
  if (k === 2) {
    // Slinking: belly to the floor, head low, ears flat.
    return {
      ...base,
      body: [[28, 80], [40, 70], [60, 66], [80, 68], [94, 74], [98, 84], [86, 90], [60, 90], [38, 90], [28, 86]],
      head: smoothP(shift(CAT_HEAD, 0, 30), 0.4),
      ears: catEars(-4, 30, 12),
      tail: [[[28, 80], [16, 84], [6, 84], [0, 80]], [8, 6, 5, 3]],
      back: [[[[88, 84], [96, 96], [104, 100]], [9, 6, 5]], [[[34, 84], [42, 96], [50, 100]], [10, 7, 5]]],
      near: [[[[92, 86], [104, 94], [114, 98]], [9, 6, 5]], [[[38, 86], [48, 98], [58, 100]], [11, 8, 5]]],
      eye: [113, 78],
      eyeR: 4.8,
      nose: [124, 81],
    };
  }
  // Walking tall, tail curled up like a hook.
  return {
    ...base,
    body: CAT_BODY,
    head: smoothP(shift(CAT_HEAD, 0, -6), 0.4),
    ears: catEars(0, -6),
    tail: [[[30, 60], [22, 46], [22, 32], [30, 24], [38, 26]], [8, 7, 6, 5, 3]],
    back: [[[[88, 68], [88, 86], [90, 102]], [9, 7, 6]], [[[38, 70], [46, 84], [50, 100]], [10, 7, 6]]],
    near: [[[[94, 68], [102, 80], [100, 92]], [10, 7, 6]], [[[42, 70], [36, 86], [38, 102]], [11, 8, 6]]],
    eye: [113, 42],
    nose: [124, 45],
    claws: false,
  };
}

// The wolf: deep chest, long muzzle, a brush of a tail.
const WOLF_BODY: readonly Pt[] = [[24, 62], [36, 52], [60, 48], [82, 48], [96, 54], [102, 64], [94, 76], [72, 76], [48, 74], [30, 72]];
const WOLF_HEAD: readonly Pt[] = [[92, 46], [98, 38], [108, 36], [114, 42], [126, 50], [124, 56], [112, 58], [100, 60], [94, 56]];
const wolfEar = (dx = 0, dy = 0): Path2D => polyP([[99 + dx, 41 + dy], [101 + dx, 24 + dy], [110 + dx, 38 + dy]]);

function wolfPose(k: number, fur: Mat = GREY_FUR): Body {
  const base = { fur, eyeColor: EYES[1]!, eyeR: 3.8 };
  if (k === 0) {
    // In the lunge: stretched out, jaws open.
    return {
      ...base,
      body: WOLF_BODY,
      head: smoothP([[92, 46], [98, 38], [108, 36], [114, 42], [127, 47], [125, 52], [112, 53], [104, 56], [98, 58]], 0.35),
      mouth: {
        gum: polyP([[102, 52], [126, 50], [122, 66], [102, 60]]),
        jaw: smoothP([[100, 58], [114, 59], [124, 65], [120, 69], [104, 66]], 0.3),
        upper: [[106, 53], [124, 51]],
        lower: [[106, 62], [121, 65]],
      },
      ears: [wolfEar()],
      tail: [[[26, 58], [14, 56], [2, 58]], [13, 11, 4]],
      back: [[[[92, 64], [108, 66], [122, 64]], [8, 6, 5]], [[[32, 66], [18, 68], [4, 66]], [10, 7, 5]]],
      near: [[[[94, 68], [110, 74], [124, 78]], [9, 7, 5]], [[[36, 70], [22, 78], [8, 82]], [11, 8, 5]]],
      eye: [108, 43],
      nose: [126, 48],
      claws: true,
    };
  }
  if (k === 1) {
    // At a trot.
    return {
      ...base,
      body: WOLF_BODY,
      head: smoothP(WOLF_HEAD, 0.35),
      ears: [wolfEar()],
      tail: [[[26, 60], [14, 66], [6, 76]], [13, 11, 4]],
      back: [[[[90, 70], [84, 86], [80, 100]], [9, 7, 6]], [[[40, 70], [46, 86], [52, 100]], [11, 8, 6]]],
      near: [[[[94, 70], [100, 86], [106, 100]], [9, 7, 6]], [[[36, 70], [28, 86], [22, 100]], [11, 8, 6]]],
      eye: [108, 44],
      nose: [125, 51],
    };
  }
  if (k === 2) {
    // Stood square, head raised.
    return {
      ...base,
      body: WOLF_BODY,
      head: smoothP([[90, 38], [94, 28], [104, 24], [110, 28], [122, 30], [122, 36], [110, 42], [98, 48], [92, 46]], 0.35),
      extra: [taper([[86, 60], [94, 42]], [24, 18])],
      ears: [polyP([[96, 30], [96, 12], [106, 26]])],
      tail: [[[26, 58], [14, 52], [6, 44]], [13, 11, 4]],
      back: [[[[88, 70], [88, 86], [90, 98]], [9, 7, 6]], [[[42, 70], [42, 86], [44, 98]], [11, 8, 6]]],
      near: [[[[94, 70], [96, 86], [96, 98]], [9, 7, 6]], [[[36, 70], [32, 86], [34, 98]], [11, 8, 6]]],
      eye: [104, 31],
      nose: [122, 31],
    };
  }
  // Braced on splayed legs, head low and out, tail down.
  return {
    ...base,
    body: WOLF_BODY,
    head: smoothP(shift(WOLF_HEAD, 0, 12), 0.35),
    ears: [wolfEar(-2, 12)],
    tail: [[[26, 60], [18, 70], [14, 84]], [13, 11, 4]],
    back: [[[[88, 72], [86, 88], [84, 102]], [9, 7, 6]], [[[40, 70], [44, 88], [46, 102]], [11, 8, 6]]],
    near: [[[[94, 72], [104, 88], [110, 102]], [9, 7, 6]], [[[34, 70], [24, 86], [18, 100]], [11, 8, 6]]],
    eye: [108, 56],
    nose: [125, 63],
    claws: true,
  };
}

// The bear: a great hump, a broad head, thick legs.
const BEAR_BODY: readonly Pt[] = [[16, 74], [24, 52], [46, 38], [72, 38], [92, 46], [104, 60], [102, 78], [88, 88], [46, 90], [24, 86]];
const BEAR_HEAD: readonly Pt[] = [[94, 54], [100, 46], [112, 46], [122, 54], [126, 64], [120, 70], [108, 72], [98, 68]];

function bearPose(k: number): Body {
  const base = { fur: BROWN_FUR, eyeColor: EYES[2]!, eyeR: 3.6, claws: true };
  if (k === 0) {
    // Reared up on its hind legs, arms high.
    return {
      ...base,
      body: [[40, 116], [36, 90], [42, 64], [54, 48], [72, 44], [86, 54], [90, 80], [86, 104], [80, 118]],
      head: smoothP([[66, 40], [70, 28], [82, 22], [94, 26], [104, 34], [100, 44], [88, 50], [72, 48]], 0.4),
      ears: [ellipseP(73, 26, 6, 6)],
      back: [[[[56, 56], [46, 40], [42, 22]], [14, 11, 10]], [[[50, 108], [46, 124]], [18, 16]]],
      near: [[[[80, 58], [96, 44], [106, 26]], [15, 12, 11]], [[[74, 108], [80, 124]], [18, 16]]],
      eye: [92, 32],
      nose: [104, 36],
    };
  }
  if (k === 1) {
    // Charging, head down.
    return {
      ...base,
      body: BEAR_BODY,
      head: smoothP(shift(BEAR_HEAD, 0, 8), 0.4),
      ears: [ellipseP(101, 54, 5, 5)],
      back: [[[[90, 80], [96, 96], [100, 106]], [15, 12, 11]], [[[40, 84], [46, 98], [50, 108]], [16, 13, 11]]],
      near: [[[[96, 80], [108, 94], [118, 104]], [16, 13, 12]], [[[30, 82], [20, 96], [10, 104]], [17, 14, 12]]],
      eye: [112, 63],
      nose: [125, 69],
    };
  }
  if (k === 2) {
    // Sat down like a boulder, forelegs straight.
    return {
      ...base,
      body: [[20, 110], [18, 86], [30, 62], [52, 50], [74, 52], [88, 66], [90, 90], [84, 112]],
      head: smoothP([[74, 42], [80, 32], [94, 30], [104, 36], [112, 46], [106, 54], [94, 58], [80, 56]], 0.4),
      ears: [ellipseP(82, 33, 6, 6)],
      extra: [ellipseP(36, 100, 22, 15)],
      back: [[[[72, 80], [74, 98], [74, 112]], [15, 14, 14]]],
      near: [[[[80, 80], [86, 98], [88, 112]], [16, 14, 14]]],
      eye: [98, 40],
      nose: [111, 45],
      claws: false,
    };
  }
  // Stood square on all fours, head up.
  return {
    ...base,
    body: BEAR_BODY,
    head: smoothP(shift(BEAR_HEAD, 0, -6), 0.4),
    ears: [ellipseP(101, 41, 5, 5)],
    back: [[[[86, 80], [86, 96], [88, 110]], [15, 14, 13]], [[[40, 84], [42, 98], [44, 110]], [16, 15, 14]]],
    near: [[[[94, 80], [96, 96], [96, 110]], [16, 15, 14]], [[[30, 82], [28, 98], [28, 110]], [18, 16, 15]]],
    eye: [112, 50],
    nose: [125, 56],
    claws: false,
  };
}

// ---------------------------------------------------------------------------
// beast: heads, face on
// ---------------------------------------------------------------------------

const HEADS: readonly (readonly Pt[])[] = [
  // Cat: tall pointed ears, round skull, short muzzle.
  [[64, 30], [48, 30], [34, 10], [28, 44], [24, 64], [30, 86], [44, 102], [56, 110], [64, 112]],
  // Wolf: ears back and up, wide ruff, long muzzle.
  [[64, 34], [50, 32], [38, 8], [32, 38], [16, 56], [24, 70], [20, 84], [40, 92], [52, 116], [64, 120]],
  // Bear: small round ears, a broad heavy skull.
  [[64, 26], [46, 26], [40, 16], [26, 20], [26, 36], [16, 58], [20, 84], [38, 104], [54, 112], [64, 114]],
];

/** Mirrors a half outline (x <= 64) into a whole one. */
function mirror(half: readonly Pt[]): Pt[] {
  const back = [...half].reverse().map(([px, py]) => [128 - px, py] as Pt);
  return [...half, ...back.filter(([px]) => Math.abs(px - 64) > 0.01)];
}

/** Which beast each variant is: cat, wolf, bear, crowned cat, ruffed wolf, grey bear, scarred bear, roaring bear. */
const KIND = [0, 1, 2, 0, 1, 2, 2, 2] as const;

const beast: Glyph = (x, t, v) => {
  const n = ((v % 8) + 8) % 8;
  const k = KIND[n]!;
  const fur = n === 5 ? OLD_FUR : FURS[k]!;
  glow(x, 64, 66, 54, t.glow, 0.35);
  if (n === 4) {
    // A thick ruff of fur stood out round the head.
    const ruff: Pt[] = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const r = i % 2 ? 46 : 60;
      ruff.push([64 + Math.cos(a) * r, 76 + Math.sin(a) * r * 0.9]);
    }
    obj(x, polyP(ruff), RUFF, t, [10, 20], [118, 128], 1.4);
  }
  const head = smoothP(mirror(HEADS[k]!), k === 1 ? 0.18 : 0.28);
  obj(x, head, fur, t, [20, 14], [108, 116], 1.5);
  // Inner ears.
  for (const sg of [-1, 1]) {
    const ear = k === 0
      ? polyP([[64 + sg * 22, 34], [64 + sg * 29, 18], [64 + sg * 32, 42]])
      : k === 1
        ? polyP([[64 + sg * 18, 34], [64 + sg * 25, 16], [64 + sg * 30, 40]])
        : ellipseP(64 + sg * 28, 26, 6, 5);
    x.fillStyle = 'rgba(30,18,22,.85)';
    x.fill(ear);
  }
  if (n === 7) {
    // Roaring: the jaw dropped, every fang out.
    obj(x, ellipseP(64, 92, 21, 19), fur, t, [44, 74], [84, 112], 0.6);
    x.fillStyle = css(GUM);
    x.fill(ellipseP(64, 99, 14, 12));
    glow(x, 64, 102, 10, 0xff4020, 0.5);
    for (const sg of [-1, 1]) {
      obj(x, polyP([[64 + sg * 9, 88], [64 + sg * 4, 88], [64 + sg * 7, 100]]), HORN, t, [60, 88], [70, 100], 0.3);
      obj(x, polyP([[64 + sg * 9, 110], [64 + sg * 4, 110], [64 + sg * 7, 101]]), HORN, t, [60, 101], [70, 110], 0.3);
    }
    x.fillStyle = 'rgba(6,4,6,1)';
    x.fill(smoothP([[58, 78], [70, 78], [64, 85]], 0.4));
  } else {
    // Muzzle and nose.
    const muzzle = k === 1
      ? smoothP([[52, 78], [76, 78], [72, 112], [64, 118], [56, 112]], 0.3)
      : k === 2
        ? ellipseP(64, 88, 18, 15)
        : ellipseP(64, 88, 14, 11);
    obj(x, muzzle, n === 5 ? RUFF : k === 0 ? BLACK_FUR : fur, t, [46, 74], [82, 116], 0.6);
    const ny = k === 1 ? 104 : 84;
    x.fillStyle = 'rgba(6,4,6,1)';
    x.fill(smoothP([[64 - 6, ny - 3], [64 + 6, ny - 3], [64, ny + 4]], 0.4));
    glint(x, 62, ny - 2, 1.6, 0xffffff, 0.6);
    // Fangs showing.
    const fy = k === 1 ? 114 : 98;
    for (const sg of [-1, 1]) obj(x, polyP([[64 + sg * 7, fy - 4], [64 + sg * 3, fy - 4], [64 + sg * 5, fy + 6]]), HORN, t, [60, fy - 4], [70, fy + 6], 0.3);
  }
  const ey = k === 1 ? 58 : 60;
  eyes(x, 64, ey, k === 2 ? 15 : 14, EYES[k]!, k === 0);
  if (n === 7) {
    // Brows down hard over the eyes.
    for (const sg of [-1, 1]) {
      x.fillStyle = 'rgba(8,5,4,.95)';
      x.fill(polyP([[64 + sg * 6, ey - 2], [64 + sg * 24, ey - 9], [64 + sg * 22, ey - 4]]));
    }
  }
  if (n === 6) {
    // Old scars across the left eye, which has gone milky.
    x.fillStyle = css(0xb8c0c4);
    x.fill(ellipseP(49, ey, 5.5, 4.2, 0.25));
    x.fillStyle = css(0x8a949a, 0.8);
    x.fill(circleP(49, ey, 1.8));
    for (const o of [-8, 0, 8]) {
      const p = line([[30 + o, ey - 26], [56 + o, ey + 22]]);
      x.save();
      x.lineCap = 'round';
      x.strokeStyle = 'rgba(20,8,6,.9)';
      x.lineWidth = 6;
      x.stroke(p);
      x.strokeStyle = css(SCAR.c[3]);
      x.lineWidth = 3.4;
      x.stroke(p);
      x.strokeStyle = css(SCAR.c[4], 0.8);
      x.lineWidth = 1.2;
      x.stroke(p);
      x.restore();
    }
  }
  if (n === 3) {
    // A crown of gold set between the ears.
    const crown = polyP([[46, 40], [42, 18], [53, 30], [58, 10], [64, 26], [70, 10], [75, 30], [86, 18], [82, 40]]);
    obj(x, crown, GOLD, t, [42, 10], [86, 40], 0.7);
    glow(x, 64, 34, 8, EYES[0]!, 0.9);
    x.fillStyle = css(lift(EYES[0]!, 0.3));
    x.fill(circleP(64, 34, 3.4));
    glint(x, 63, 33, 1.4, 0xffffff, 0.9);
  }
  if (n === 5) {
    // Fire, frost, storm and venom, all shrugged off.
    energy(x, smoothP([[22, 10], [28, 20], [28, 28], [22, 33], [16, 28], [16, 20]], 0.4), FIRE, 22, 26, 14, 0.5);
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) ray(x, line([[106 - Math.cos(a) * 9, 22 - Math.sin(a) * 9], [106 + Math.cos(a) * 9, 22 + Math.sin(a) * 9]]), COLD, 2);
    energy(x, polyP([[20, 96], [27, 96], [23, 104], [29, 104], [17, 120], [20, 108], [14, 108]]), SHOCK, 21, 106, 14, 0.5);
    energy(x, dropP(108, 108, 0.2), VENOM, 108, 110, 12, 0.5);
  }
};

// ---------------------------------------------------------------------------
// paw: prints
// ---------------------------------------------------------------------------

/** A print; with no pad material it is pressed in light (a trail that glows). */
function print(x: Ctx, t: Tone, k: number, pad: Mat | null): void {
  const big = [1, 1.1, 1.25][k]!;
  const main = k === 2
    ? smoothP([[34, 78], [94, 78], [98, 96], [84, 110], [44, 110], [30, 96]], 0.35)
    : smoothP([[44, 80], [84, 80], [92, 98], [78, 112], [50, 112], [36, 98]], 0.4);
  if (pad) obj(x, main, pad, t, [34, 78], [94, 112], 1.0);
  else energy(x, main, t, 64, 96, 34, 0.45);
  // Toes, and a claw out of each.
  const toes: Pt[] = k === 2 ? [[28, 64], [46, 52], [64, 48], [82, 52], [100, 64]] : [[38, 60], [54, 46], [74, 46], [90, 60]];
  toes.forEach(([tx, ty], i) => {
    const toe = ellipseP(tx, ty, 8 * big, 10 * big, (tx - 64) * 0.01);
    if (pad) obj(x, toe, pad, t, [tx - 8, ty - 10], [tx + 8, ty + 10], 0.5);
    else energy(x, toe, t, tx, ty, 12, 0.45);
    if (!pad) return;
    const lean = (tx - 64) * 0.18;
    const len = [22, 18, 26][k]!;
    const claw = smoothP([[tx - 3.5, ty - 9], [tx + 3.5, ty - 9], [tx + lean * 0.6, ty - 9 - len]], 0.25);
    obj(x, claw, HORN, t, [tx - 4, ty - 9 - len], [tx + 4, ty - 9], 0.4);
    if (i % 2 === 0) glint(x, tx + lean * 0.5, ty - 9 - len * 0.8, 1.6, 0xffffff, 0.7);
  });
}

const paw: Glyph = (x, t, v) => {
  const n = ((v % 6) + 6) % 6;
  if (n < 3) {
    glow(x, 64, 74, 48, t.glow, 0.35);
    print(x, t, n, PAD);
    return;
  }
  if (n === 3) {
    // The cat's print, left in blood, spattered.
    glow(x, 64, 74, 50, 0xc42a20, 0.4);
    print(x, t, 0, BLOOD);
    for (const [dx, dy, s] of [[20, 34, 0.1], [108, 40, 0.08], [112, 92, 0.1], [16, 90, 0.07], [100, 116, 0.07]] as const) bleed(x, dx, dy, s);
    stream(x, [[52, 110], [52, 118], [51, 124]], 5);
    stream(x, [[76, 110], [77, 116], [77, 120]], 4);
    return;
  }
  glow(x, 64, 64, 54, t.glow, 0.35);
  if (n === 4) {
    // Three wolves' prints, close together: a pack on the move.
    for (const [px, py, rot] of [[36, 46, -0.35], [92, 44, 0.3], [64, 92, 0]] as const) at(x, px, py, rot, 0.64, () => print(x, t, 1, PAD));
    return;
  }
  // A cat's trail, winding off into the dark, each print smaller.
  for (const [px, py, s, rot] of [[36, 98, 0.5, -0.5], [74, 76, 0.42, 0.2], [52, 44, 0.35, -0.3], [86, 22, 0.28, 0.35]] as const) {
    at(x, px, py, rot, s, () => print(x, t, 0, null));
  }
};

// ---------------------------------------------------------------------------
// howl
// ---------------------------------------------------------------------------

const howl: Glyph = (x, t, v) => {
  const n = ((v % 3) + 3) % 3;
  if (n < 2) {
    const moon = n === 1 ? 0xe02020 : 0xf4ecd0;
    glow(x, 92, 30, 34, moon, 0.8);
    x.fillStyle = css(moon, 1);
    x.fill(circleP(92, 30, 16));
    x.fillStyle = css(0x000000, 0.18);
    x.fill(circleP(87, 26, 4));
    x.fill(circleP(98, 36, 3));
  } else {
    // No moon: a heart of blood hangs where it would be.
    glow(x, 92, 30, 36, 0xc42a20, 0.7);
    const h = heartP(92, 30, 0.38);
    solid(x, h, BLOOD, { a: [76, 14], b: [108, 46], size: 0.6, outline: 1.6, outlineColor: 'rgba(10,2,2,.9)' });
    spec(x, 85, 24, 3, 5);
  }
  // A wolf's head and neck, thrown back toward the moon.
  const head = smoothP(
    [[24, 120], [26, 92], [34, 70], [44, 56], [54, 40], [70, 26], [76, 30], [66, 44], [74, 50], [64, 56], [62, 68], [70, 80], [62, 100], [58, 120]],
    0.28,
  );
  obj(x, head, GREY_FUR, t, [22, 24], [78, 120], 1.4);
  const ear = polyP([[44, 54], [40, 36], [52, 48]]);
  obj(x, ear, GREY_FUR, t, [40, 36], [52, 54], 0.4);
  glow(x, 54, 50, 6, 0xffc040, 0.9);
  x.fillStyle = css(0xffc040, 1);
  x.fill(ellipseP(54, 50, 2.6, 1.8, -0.7));
  // The howl itself: arcs from the open jaw.
  const arcs = n === 2 ? 4 : 3;
  const wave = n === 2 ? 0xe83020 : t.glow;
  for (let i = 0; i < arcs; i++) {
    const p = new Path2D();
    p.arc(74, 38, 12 + i * 8, -1.4, -0.3);
    emissiveStroke(x, p, wave, 2.8 - i * 0.5, 0.9 - i * 0.16);
  }
  if (n === 2) {
    // A low, wet howl: blood off the jaw.
    bleed(x, 74, 62, 0.11);
    bleed(x, 80, 80, 0.09);
    bleed(x, 84, 96, 0.07);
  }
};

// ---------------------------------------------------------------------------
// sstear: claw tears
// ---------------------------------------------------------------------------

const sstear: Glyph = (x, t, v) => {
  const n = ((v % 5) + 5) % 5;
  glow(x, 64, 64, 52, t.glow, 0.3);
  if (n === 0) {
    // Rake: a cat's forepaw in from high right, three tears behind its claws.
    const d: Pt = [-0.656, 0.755];
    const nrm: Pt = [0.755, 0.656];
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * 15;
      const s: Pt = [78 + nrm[0] * o, 42 + nrm[1] * o];
      const e: Pt = [s[0] + d[0] * 84, s[1] + d[1] * 84];
      energy(x, sliver(s, e, 9, 8), t, (s[0] + e[0]) / 2, (s[1] + e[1]) / 2, 50, 0.45);
      energy(x, circleP(e[0] - 5, e[1] + 8, 2.6), t, e[0] - 5, e[1] + 8, 4);
    }
    const arm: Pt[] = [[132, -6], [106, 18], [90, 32]];
    part(x, t, taper(arm, [28, 22, 18]), BLACK_FUR, 0.8);
    clawsAt(x, arm, 18, 9);
    return;
  }
  if (n === 1) {
    // Hamstring: low across the back of a heel.
    const leg = smoothP([[48, 0], [76, 0], [78, 40], [80, 72], [96, 88], [106, 100], [104, 110], [54, 110], [52, 90], [50, 60]], 0.2);
    solid(x, leg, FOE, { a: [40, 0], b: [110, 110], size: 1.2, outline: 2, outlineColor: 'rgba(0,0,0,.95)' });
    innerEdge(x, leg, css(t.glow, 0.6), 3, -2, -2, 2);
    for (let i = 0; i < 3; i++) {
      const y = 70 + i * 11;
      energy(x, sliver([20, y + 6], [100, y - 6], -5, 7), t, 60, y, 44, 0.45);
    }
    for (const [dx, dy, s] of [[48, 106, 0.1], [56, 118, 0.08], [42, 120, 0.07]] as const) bleed(x, dx, dy, s);
    return;
  }
  if (n === 2) {
    // Open veins: three tears, and blood running out of every one.
    for (let i = 0; i < 3; i++) {
      const o = i * 24;
      const s: Pt = [20 + o, 16 + i * 4];
      const e: Pt = [48 + o, 62 + i * 4];
      energy(x, sliver(s, e, 6, 8), t, (s[0] + e[0]) / 2, (s[1] + e[1]) / 2, 34, 0.45);
      stream(x, [[e[0] - 1, e[1] - 4], [e[0] + 1, e[1] + 14], [e[0] - 1, e[1] + 30], [e[0], e[1] + 40]], 6);
    }
    return;
  }
  if (n === 3) {
    // Maul: the bear's four, wide and deep, chips flying.
    for (let i = 0; i < 4; i++) {
      const s: Pt = [10 + 22 * i, 30 - 5 * i];
      const e: Pt = [58 + 20 * i, 114 - 8 * i];
      energy(x, sliver(s, e, 9, 12), t, (s[0] + e[0]) / 2, (s[1] + e[1]) / 2, 54, 0.45);
    }
    for (const [cx, cy] of [[116, 98], [108, 114], [122, 80]] as const) energy(x, polyP([[cx, cy - 4], [cx + 4, cy + 2], [cx - 3, cy + 3]]), t, cx, cy, 5);
    return;
  }
  // Killing dance: a tear on every side of the one foe.
  foe(x, t, 64, 66, 1);
  for (let j = 0; j < 6; j++) {
    const a = (j / 6) * Math.PI * 2 - Math.PI / 2;
    const cx = 64 + Math.cos(a) * 42;
    const cy = 64 + Math.sin(a) * 42;
    const dx = -Math.sin(a);
    const dy = Math.cos(a);
    energy(x, sliver([cx - dx * 16, cy - dy * 16], [cx + dx * 16, cy + dy * 16], -4, 7), t, cx, cy, 20, 0.45);
  }
};

// ---------------------------------------------------------------------------
// sscat: the black cat, whole
// ---------------------------------------------------------------------------

const sscat: Glyph = (x, t, v) => {
  const n = ((v % 4) + 4) % 4;
  glow(x, 64, 64, 54, t.glow, 0.55);
  if (n === 0) {
    // Pounce: diving down onto it, claws first, and the strike where they land.
    for (let i = 0; i < 3; i++) ray(x, line([[8 + i * 10, 8 + i * 14], [30 + i * 10, 22 + i * 14]]), t, 2.2, 0.45 + i * 0.15);
    at(x, 58, 54, 0.36, 0.95, () => creature(x, t, catPose(0)));
    energy(x, starP(108, 100, 8, 6, 20, 0.3), t, 108, 100, 20, 0.5);
    return;
  }
  if (n === 1) {
    streaks(x, t, 8);
    at(x, 68, 58, 0, 0.98, () => creature(x, t, catPose(1)));
    return;
  }
  if (n === 2) {
    // Slink: low over a pool of its own shadow.
    x.save();
    x.translate(62, 98);
    x.scale(1, 0.18);
    glow(x, 0, 0, 58, sink(t.glow, 0.3), 0.6);
    x.fillStyle = 'rgba(0,0,0,.6)';
    x.fill(circleP(0, 0, 54));
    x.restore();
    at(x, 64, 54, 0, 0.98, () => creature(x, t, catPose(2)));
    return;
  }
  at(x, 64, 62, 0, 0.92, () => creature(x, t, catPose(3)));
};

// ---------------------------------------------------------------------------
// sswolf: the grey wolf, whole
// ---------------------------------------------------------------------------

const sswolf: Glyph = (x, t, v) => {
  const n = ((v % 4) + 4) % 4;
  glow(x, 64, 64, 54, t.glow, 0.55);
  if (n === 0) {
    streaks(x, t, 0);
    at(x, 66, 60, -0.12, 0.96, () => creature(x, t, wolfPose(0)));
    return;
  }
  if (n === 1) {
    // Two of them out of the dark, the far one dimmer.
    at(x, 48, 44, 0, 0.62, () => creature(x, t, wolfPose(1, far(GREY_FUR))));
    at(x, 70, 72, 0, 0.74, () => creature(x, t, wolfPose(1)));
    return;
  }
  if (n === 2) {
    // The alpha, stood on a rock with its head up.
    glow(x, 70, 34, 34, lift(t.glow, 0.3), 0.5);
    const rock = smoothP([[4, 128], [8, 98], [30, 84], [66, 80], [100, 84], [122, 98], [126, 128]], 0.35);
    obj(x, rock, STONE, t, [10, 80], [120, 128], 1.2);
    at(x, 64, 50, 0, 0.8, () => creature(x, t, wolfPose(2)));
    return;
  }
  // The last one standing, bleeding, hackles up.
  x.save();
  x.translate(64, 106);
  x.scale(1, 0.16);
  x.fillStyle = 'rgba(0,0,0,.55)';
  x.fill(circleP(0, 0, 56));
  x.restore();
  at(x, 64, 56, 0, 0.9, () => creature(x, t, wolfPose(3)));
  bleed(x, 58, 86, 0.11);
  bleed(x, 66, 102, 0.09);
  bleed(x, 52, 112, 0.07);
};

// ---------------------------------------------------------------------------
// ssbear: the bear, whole
// ---------------------------------------------------------------------------

const STARS: readonly Pt[] = [[40, 26], [52, 52], [62, 72], [56, 96], [76, 90], [84, 62], [100, 40]];

const ssbear: Glyph = (x, t, v) => {
  const n = ((v % 4) + 4) % 4;
  glow(x, 64, 64, 54, t.glow, 0.55);
  if (n === 0) {
    // The great bear of the old stories: reared up, stars in its hide.
    at(x, 64, 62, 0, 0.9, () => creature(x, t, bearPose(0)));
    x.save();
    x.globalAlpha = 0.75;
    ray(x, line(STARS), t, 1.4, 0.75);
    x.restore();
    STARS.forEach(([sx, sy], i) => {
      glow(x, sx, sy, 9, lift(t.glow, 0.4), 0.9);
      glint(x, sx, sy, i % 2 ? 3.4 : 4.4, 0xfff6e0, 1);
    });
    return;
  }
  if (n === 1) {
    // Overrun: charging, dust thrown up behind.
    for (const [dx, dy, r] of [[12, 104, 10], [24, 112, 8], [6, 92, 7]] as const) glow(x, dx, dy, r, 0x8a6a4a, 0.7, 'source-over');
    streaks(x, t, -4);
    at(x, 68, 60, 0, 0.98, () => creature(x, t, bearPose(1)));
    return;
  }
  if (n === 2) {
    // Immovable: sat on bedrock, the stone cracked under it.
    const slab = polyP([[0, 108], [128, 108], [128, 128], [0, 128]]);
    obj(x, slab, STONE, t, [0, 108], [128, 128], 0.8);
    ray(x, line([[40, 110], [34, 120], [38, 128]]), t, 1.4, 0.7);
    ray(x, line([[92, 110], [100, 118], [96, 128]]), t, 1.4, 0.7);
    // Sat face on, a great heap of bear.
    const body = smoothP([[64, 46], [94, 52], [112, 78], [108, 104], [86, 112], [64, 110], [42, 112], [20, 104], [16, 78], [34, 52]], 0.4);
    obj(x, body, BROWN_FUR, t, [16, 46], [112, 112], 1.5);
    obj(x, ellipseP(64, 84, 20, 19), PELT, t, [44, 66], [84, 104], 0.8);
    for (const sg of [-1, 1]) {
      part(x, t, taper([[64 + sg * 28, 62], [64 + sg * 26, 88], [64 + sg * 23, 104]], [22, 20, 20]), BROWN_FUR, 0.8);
      obj(x, ellipseP(64 + sg * 23, 108, 14, 8), BROWN_FUR, t, [64 + sg * 23 - 14, 100], [64 + sg * 23 + 14, 116], 0.5);
      for (const o of [-7, 0, 7]) {
        const cx = 64 + sg * 23 + o;
        solid(x, sliver([cx, 112], [cx + o * 0.15, 121], 1, 2.6), HORN, { a: [cx - 3, 112], b: [cx + 3, 121], size: 0.3, outline: 0.8, outlineColor: 'rgba(8,6,6,.9)', tex: null, ao: 0 });
      }
    }
    at(x, 64, 36, 0, 0.5, () => beast(x, t, 2));
    return;
  }
  // Unbowed: stood firm, three broken arrows in its back.
  at(x, 64, 64, 0, 0.9, () => creature(x, t, bearPose(3)));
  for (const [sx, sy, a, len] of [[36, 36, -2.2, 26], [54, 32, -1.9, 20], [72, 32, -1.4, 24]] as const) {
    const ex = sx + Math.cos(a) * len;
    const ey = sy + Math.sin(a) * len;
    const shaft = line([[sx, sy], [ex, ey]]);
    x.save();
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(6,4,2,.95)';
    x.lineWidth = 5;
    x.stroke(shaft);
    x.strokeStyle = css(WOOD.c[3]);
    x.lineWidth = 2.6;
    x.stroke(shaft);
    x.restore();
    const fx = Math.cos(a);
    const fy = Math.sin(a);
    energy(x, polyP([[ex, ey], [ex + fx * 7 - fy * 4, ey + fy * 7 + fx * 4], [ex + fx * 9, ey + fy * 9], [ex + fx * 7 + fy * 4, ey + fy * 7 - fx * 4]]), t, ex, ey, 8, 0.5);
  }
};

// ---------------------------------------------------------------------------
// ssjaw: jaws
// ---------------------------------------------------------------------------

/** A wolf's head side on, mouth `open` radians. */
function jawSide(x: Ctx, t: Tone, open: number, fur: Mat = GREY_FUR, held = false): void {
  const c = Math.cos(open);
  const s = Math.sin(open);
  const tip: Pt = [26 + 84 * c - 4 * s, 60 + 84 * s + 4 * c];
  x.fillStyle = css(GUM);
  x.fill(polyP([[30, 56], [116, 50], [tip[0], tip[1] - 6], [30, 66]]));
  glow(x, 80, 60, 20 * open + 4, 0xff3020, 0.4);
  x.save();
  x.translate(26, 60);
  x.rotate(open);
  x.translate(-26, -60);
  teethRow(x, [50, 63], [108, 65], 7, 5, false, 5);
  part(x, t, smoothP([[20, 62], [50, 64], [90, 66], [112, 64], [110, 72], [86, 80], [50, 82], [22, 80]], 0.35), fur, 0.8);
  x.restore();
  if (held) {
    // A foe's arm hanging out of the bite.
    const arm = taper([[100, 46], [98, 78], [90, 106], [82, 126]], [20, 18, 16, 15]);
    solid(x, arm, FOE, { a: [80, 46], b: [110, 126], size: 0.8, outline: 2, outlineColor: 'rgba(0,0,0,.95)' });
    innerEdge(x, arm, css(t.glow, 0.7), 3, -2, -2, 2);
    stream(x, [[94, 70], [93, 84], [94, 96]], 5);
  }
  // A shaggy cheek, the tall ear, then the head: a flat skull sloping into a long muzzle.
  part(x, t, polyP([[10, 46], [0, 56], [8, 60], [0, 72], [12, 70], [8, 82], [22, 74], [30, 80], [34, 62]]), fur, 0.5);
  part(x, t, polyP([[24, 30], [30, 2], [48, 26]]), fur, 0.5);
  x.fillStyle = 'rgba(30,18,22,.85)';
  x.fill(polyP([[30, 26], [32, 10], [42, 25]]));
  teethRow(x, [44, 56], [116, 51], 8, 6, true, 6);
  part(x, t, smoothP([[6, 64], [4, 48], [12, 34], [28, 26], [46, 24], [62, 28], [80, 36], [104, 42], [120, 45], [126, 50], [121, 55], [92, 57], [58, 58], [30, 63], [12, 68]], 0.35), fur, 1.2);
  x.fillStyle = 'rgba(6,4,6,1)';
  x.fill(circleP(122, 47, 4));
  glint(x, 121, 46, 1.2, 0xffffff, 0.6);
  x.fillStyle = 'rgba(6,4,6,.9)';
  x.fill(polyP([[48, 33], [70, 34], [66, 37], [50, 37]]));
  eyeAt(x, 60, 40, 4.4, EYES[1]!, false);
}

/** The marks one bite leaves: two arcs of punctures, the canines deepest. */
function biteMark(x: Ctx, t: Tone, cx: number, cy: number, s: number, rot: number): void {
  at(x, cx, cy, rot, s, () => {
    glow(x, 64, 64, 48, 0xc42a20, 0.5);
    x.fillStyle = css(0x5a0a0c, 0.8);
    x.fill(ellipseP(64, 64, 38, 20));
    for (const upper of [true, false]) {
      for (let i = 0; i < 6; i++) {
        const u = (i + 0.5) / 6;
        const a = upper ? Math.PI + 0.35 + u * (Math.PI - 0.7) : 0.35 + u * (Math.PI - 0.7);
        const px = 64 + Math.cos(a) * 44;
        const py = 64 + Math.sin(a) * 26;
        const canine = i === 0 || i === 5;
        const r = canine ? 9 : 6;
        // Each puncture points in toward the middle of the bite.
        const dx = 64 - px;
        const dy = 64 - py;
        const d = Math.hypot(dx, dy) || 1;
        const tipP: Pt = [px + (dx / d) * r * 1.6, py + (dy / d) * r * 1.6];
        const p = polyP([[px - (dy / d) * r, py + (dx / d) * r], tipP, [px + (dy / d) * r, py - (dx / d) * r]]);
        energy(x, p, t, px, py, r * 1.6, 0.4);
        if (canine) bleed(x, tipP[0], tipP[1] + 10, 0.12);
      }
    }
  });
}

const ssjaw: Glyph = (x, t, v) => {
  const n = ((v % 5) + 5) % 5;
  glow(x, 64, 64, 54, t.glow, 0.35);
  if (n === 0) {
    // Snap: jaws coming shut, quick as a trap.
    at(x, 60, 70, -0.05, 0.92, () => jawSide(x, t, 0.3));
    for (const [a, b] of [[[108, 40], [122, 32]], [[112, 64], [126, 64]], [[106, 86], [118, 96]]] as const) ray(x, line([a as Pt, b as Pt]), t, 2.4);
    return;
  }
  if (n === 1) {
    // Worry: clamped shut and shaking, the shakes blurred either side.
    for (const r of [-0.32, 0.32]) {
      x.save();
      x.globalAlpha = 0.34;
      at(x, 54, 56, r, 0.8, () => jawSide(x, t, 0.04, far(GREY_FUR)));
      x.restore();
    }
    at(x, 54, 56, 0, 0.8, () => jawSide(x, t, 0.04, GREY_FUR, true));
    for (const a0 of [-1.1, 2.0]) {
      const p = new Path2D();
      p.arc(64, 64, 56, a0, a0 + 0.9);
      ray(x, p, t, 3);
    }
    return;
  }
  if (n === 2) {
    // Throat Tear: the cat's snarl face on, long fangs blooded.
    x.fillStyle = css(GUM);
    x.fill(ellipseP(64, 80, 36, 24));
    glow(x, 64, 84, 24, 0xff3020, 0.4);
    teethRow(x, [50, 98], [78, 98], 4, 4, false);
    obj(x, smoothP([[26, 96], [46, 104], [64, 108], [82, 104], [102, 96], [94, 114], [64, 124], [34, 114]], 0.4), BLACK_FUR, t, [26, 96], [102, 124], 0.8);
    obj(x, smoothP([[12, 54], [26, 24], [64, 14], [102, 24], [116, 54], [102, 64], [82, 62], [64, 68], [46, 62], [26, 64]], 0.4), BLACK_FUR, t, [12, 14], [116, 68], 1.3);
    teethRow(x, [52, 63], [76, 63], 4, 4, true);
    for (const sg of [-1, 1]) {
      obj(x, sliver([64 + sg * 23, 58], [64 + sg * 17, 104], sg * 2, 7), HORN, t, [60, 58], [70, 104], 0.4);
      obj(x, sliver([64 + sg * 17, 104], [64 + sg * 15, 88], sg * -1, 3), HORN, t, [60, 88], [70, 104], 0.3);
      bleed(x, 64 + sg * 17, 102, 0.07);
    }
    x.fillStyle = 'rgba(6,4,6,1)';
    x.fill(smoothP([[56, 44], [72, 44], [64, 54]], 0.4));
    eyeAt(x, 40, 34, 6, EYES[0]!, true, 0.3);
    eyeAt(x, 88, 34, 6, EYES[0]!, true, -0.3);
    return;
  }
  if (n === 3) {
    // Sharp Teeth: a jawbone, every tooth honed.
    const jaw = smoothP([[8, 76], [30, 72], [96, 72], [114, 64], [122, 70], [112, 86], [62, 94], [32, 100], [16, 114], [8, 98]], 0.35);
    teethRow(x, [30, 73], [114, 66], 6, 14, false, 5);
    obj(x, jaw, BONE, t, [8, 64], [122, 114], 1.2);
    for (const [gx, gy] of [[105, 34], [74, 56], [46, 58]] as const) glint(x, gx, gy, 3, 0xffffff, 0.9);
    energy(x, starP(105, 30, 4, 2, 11, 0.2), t, 105, 30, 11, 0.5);
    return;
  }
  // Ravening: bite after bite, all round.
  biteMark(x, t, 40, 40, 0.58, -0.45);
  biteMark(x, t, 92, 58, 0.52, 0.55);
  biteMark(x, t, 54, 96, 0.6, 0.12);
};

// ---------------------------------------------------------------------------
// sseyes: eyes in the dark
// ---------------------------------------------------------------------------

/** One almond eye with a slit or round pupil, brow-shadowed. */
function bigEye(x: Ctx, cx: number, cy: number, rx: number, ry: number, rot: number, color: number, slit: boolean): void {
  glow(x, cx, cy, rx * 2.2, color, 0.85);
  const e = new Path2D();
  e.moveTo(-rx, 0);
  e.quadraticCurveTo(0, -ry * 2, rx, 0);
  e.quadraticCurveTo(0, ry * 2, -rx, 0);
  e.closePath();
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  const g = x.createRadialGradient(0, 0, 1, 0, 0, rx);
  g.addColorStop(0, css(lift(color, 0.6)));
  g.addColorStop(0.6, css(color));
  g.addColorStop(1, css(sink(color, 0.5)));
  x.fillStyle = g;
  x.fill(e);
  x.fillStyle = 'rgba(4,3,6,.96)';
  x.fill(slit ? ellipseP(0, 0, rx * 0.12, ry * 0.95) : circleP(0, 0, ry * 0.55));
  x.lineWidth = 2;
  x.strokeStyle = 'rgba(4,3,6,.95)';
  x.stroke(e);
  x.restore();
  glint(x, cx - rx * 0.3, cy - ry * 0.35, Math.max(1.4, ry * 0.3), 0xffffff, 0.95);
}

const sseyes: Glyph = (x, t, v) => {
  const n = ((v % 4) + 4) % 4;
  // The dark the eyes are in.
  x.fillStyle = 'rgba(0,0,0,.45)';
  x.fill(circleP(64, 64, 62));
  if (n === 0) {
    // Cat's Eyes: two great slit eyes, a black face round them.
    glow(x, 64, 64, 50, t.glow, 0.25);
    const face = smoothP([[6, 70], [16, 40], [34, 30], [64, 34], [94, 30], [112, 40], [122, 70], [104, 90], [64, 96], [24, 90]], 0.4);
    obj(x, face, BLACK_FUR, t, [10, 30], [118, 96], 1.2);
    bigEye(x, 38, 62, 20, 11, 0.22, EYES[0]!, true);
    bigEye(x, 90, 62, 20, 11, -0.22, EYES[0]!, true);
    return;
  }
  if (n === 1) {
    // Many Mouths: the pack's eyes all round in the dark, near and far.
    glow(x, 64, 64, 54, t.glow, 0.3);
    for (const [cx, cy, s] of [[64, 34, 0.7], [26, 56, 0.8], [102, 56, 0.8], [40, 92, 1], [88, 92, 1]] as const) {
      const ear = [polyP([[cx - 13 * s, cy - 4 * s], [cx - 11 * s, cy - 20 * s], [cx - 3 * s, cy - 8 * s]]), polyP([[cx + 13 * s, cy - 4 * s], [cx + 11 * s, cy - 20 * s], [cx + 3 * s, cy - 8 * s]])];
      for (const e of ear) part(x, t, e, far(GREY_FUR), 0.4);
      eyeAt(x, cx - 7 * s, cy, 4.4 * s, EYES[1]!, false, 0.25);
      eyeAt(x, cx + 7 * s, cy, 4.4 * s, EYES[1]!, false, -0.25);
    }
    return;
  }
  if (n === 2) {
    // Night Hunt: a crescent moon, and under it two eyes in the brush.
    glow(x, 88, 32, 30, 0xf4ecd0, 0.6);
    const moon = new Path2D();
    moon.arc(88, 32, 18, 0, Math.PI * 2);
    x.save();
    x.fillStyle = css(0xf4ecd0);
    x.fill(moon);
    x.globalCompositeOperation = 'destination-out';
    x.fill(circleP(80, 26, 16));
    x.restore();
    glow(x, 60, 84, 40, t.glow, 0.35);
    const brush: Pt[] = [[0, 128], [0, 80]];
    for (let i = 0; i <= 12; i++) brush.push([i * 10.6, i % 2 ? 58 + (i % 3) * 4 : 74]);
    brush.push([128, 80], [128, 128]);
    obj(x, polyP(brush), far(BLACK_FUR), t, [0, 58], [128, 128], 1);
    bigEye(x, 46, 90, 13, 7, 0.2, EYES[0]!, true);
    bigEye(x, 80, 90, 13, 7, -0.2, EYES[0]!, true);
    return;
  }
  // Blood Frenzy: two red eyes, slanted hard, red trails off them, teeth bared.
  glow(x, 64, 56, 54, 0xc42a20, 0.45);
  for (const sg of [-1, 1]) {
    for (let i = 0; i < 3; i++) ray(x, line([[64 + sg * (52 + i * 4), 34 + i * 10], [64 + sg * 92, 30 + i * 12]]), { core: 0xffd0c0, glow: 0xe02818, dark: 0x2a0404 }, 2.2, 0.75 - i * 0.18);
  }
  const brow = smoothP([[8, 40], [40, 46], [64, 58], [88, 46], [120, 40], [112, 30], [64, 40], [16, 30]], 0.3);
  obj(x, brow, far(GREY_FUR), t, [8, 30], [120, 58], 0.6);
  bigEye(x, 42, 58, 17, 8, 0.38, RED_EYE, false);
  bigEye(x, 86, 58, 17, 8, -0.38, RED_EYE, false);
  x.fillStyle = css(GUM);
  x.fill(smoothP([[30, 92], [64, 86], [98, 92], [90, 108], [64, 112], [38, 108]], 0.4));
  teethRow(x, [32, 92], [96, 92], 8, 7, true, 0);
  teethRow(x, [38, 108], [90, 108], 7, 6, false, 6);
};

// ---------------------------------------------------------------------------
// sshide: hide
// ---------------------------------------------------------------------------

const sshide: Glyph = (x, t, v) => {
  const n = ((v % 3) + 3) % 3;
  glow(x, 64, 64, 54, t.glow, 0.35);
  if (n === 0) {
    // Thick Hide: a whole bear's pelt, pegged out and stitched.
    const pelt = smoothP([
      [64, 10], [74, 14], [76, 28], [96, 26], [114, 14], [116, 28], [100, 42], [104, 64], [100, 88], [114, 104], [112, 118], [94, 108], [78, 104],
      [70, 118], [58, 118], [50, 104], [34, 108], [16, 118], [14, 104], [28, 88], [24, 64], [28, 42], [12, 28], [14, 14], [32, 26], [52, 28], [54, 14],
    ], 0.3);
    obj(x, pelt, BROWN_FUR, t, [14, 10], [114, 118], 1.4);
    const inner = smoothP([[64, 34], [88, 44], [92, 66], [88, 90], [64, 98], [40, 90], [36, 66], [40, 44]], 0.4);
    obj(x, inner, PELT, t, [36, 34], [92, 98], 0.9);
    x.save();
    x.setLineDash([3, 4]);
    x.lineWidth = 1.6;
    x.strokeStyle = css(HORN.c[3], 0.9);
    x.stroke(inner);
    x.restore();
    for (const [px, py] of [[16, 16], [112, 16], [14, 114], [112, 116], [64, 118], [64, 12]] as const) {
      obj(x, circleP(px, py, 4), HORN, t, [px - 4, py - 4], [px + 4, py + 4], 0.3);
    }
    return;
  }
  if (n === 1) {
    // Bristle: the fur on its back stood up in spines, the tips lit.
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + 0.2 + (i / 8) * (Math.PI - 0.4);
      const bx = 64 + Math.cos(a) * 40;
      const by = 100 + Math.sin(a) * 34;
      const tx = 64 + Math.cos(a) * (i % 2 ? 66 : 80);
      const ty = 100 + Math.sin(a) * (i % 2 ? 62 : 82);
      obj(x, sliver([bx, by], [tx, ty], 0, 5), HORN, t, [bx, by], [tx, ty], 0.4);
      glow(x, tx, ty, 6, t.glow, 0.9);
      glint(x, tx, ty, 2, 0xffffff, 0.9);
    }
    const back = smoothP([[10, 128], [14, 96], [34, 72], [64, 64], [94, 72], [114, 96], [118, 128]], 0.4);
    obj(x, back, BROWN_FUR, t, [14, 64], [114, 128], 1.3);
    return;
  }
  // Scar Tissue: a patch of hide, three old tears healed over thick.
  const patch = smoothP([[20, 40], [40, 18], [72, 14], [102, 26], [114, 56], [106, 92], [80, 112], [46, 112], [20, 92], [12, 64]], 0.4);
  obj(x, patch, BROWN_FUR, t, [12, 14], [114, 112], 1.4);
  for (let i = 0; i < 3; i++) {
    const o = (i - 1) * 22;
    const s: Pt = [44 + o, 26];
    const e: Pt = [80 + o, 104];
    const scar = sliver(s, e, 4, 9);
    glow(x, (s[0] + e[0]) / 2, (s[1] + e[1]) / 2, 30, t.glow, 0.3);
    obj(x, scar, SCAR, t, s, e, 0.6);
    // Stitches across each scar.
    for (let j = 1; j < 5; j++) {
      const u = j / 5;
      const cx = s[0] + (e[0] - s[0]) * u + 2;
      const cy = s[1] + (e[1] - s[1]) * u;
      x.save();
      x.lineCap = 'round';
      x.strokeStyle = 'rgba(20,8,6,.9)';
      x.lineWidth = 2;
      x.stroke(line([[cx - 7, cy - 2], [cx + 7, cy + 2]]));
      x.restore();
    }
  }
};

// ---------------------------------------------------------------------------
// ssheart: a heart
// ---------------------------------------------------------------------------

function heartP(cx: number, cy: number, s: number): Path2D {
  const p = new Path2D();
  p.moveTo(cx, cy + 40 * s);
  p.bezierCurveTo(cx - 50 * s, cy + 6 * s, cx - 44 * s, cy - 42 * s, cx, cy - 20 * s);
  p.bezierCurveTo(cx + 44 * s, cy - 42 * s, cx + 50 * s, cy + 6 * s, cx, cy + 40 * s);
  p.closePath();
  return p;
}

const ssheart: Glyph = (x, t, v) => {
  const n = ((v % 3) + 3) % 3;
  glow(x, 64, 64, 54, t.glow, 0.35);
  if (n === 0) {
    // Pack Blood: a heart bitten through, the blood running.
    const h = heartP(64, 62, 1.12);
    solid(x, h, BLOOD, { a: [24, 20], b: [104, 110], size: 1.4, outline: 2.2, outlineColor: 'rgba(10,2,2,.95)' });
    innerEdge(x, h, css(t.glow, 0.8), 3.5, -2.2, -2.2, 2);
    for (const sg of [-1, 1]) {
      x.fillStyle = 'rgba(14,2,2,.95)';
      x.fill(ellipseP(64 + sg * 18, 48, 4.5, 6));
      obj(x, sliver([64 + sg * 22, 8], [64 + sg * 18, 46], sg * 2, 6), HORN, t, [60, 8], [70, 46], 0.4);
      stream(x, [[64 + sg * 18, 54], [64 + sg * 19, 70], [64 + sg * 17, 86]], 5);
    }
    spec(x, 44, 46, 6, 10);
    return;
  }
  if (n === 1) {
    // Fat Reserves: a heart under a thick, soft layer of fat.
    const outer = heartP(64, 62, 1.24);
    obj(x, outer, FAT, t, [20, 16], [108, 114], 1.5);
    const inner = heartP(64, 64, 0.78);
    solid(x, inner, BLOOD, { a: [34, 34], b: [94, 96], size: 1, outline: 1.6, outlineColor: 'rgba(30,10,6,.8)' });
    spec(x, 40, 40, 8, 12);
    spec(x, 52, 56, 4, 7);
    return;
  }
  // Ninth Life: the cat's own heart, eared and eyed, a halo over it.
  const halo = new Path2D();
  halo.ellipse(64, 16, 24, 7, 0, 0, Math.PI * 2);
  ray(x, halo, t, 2.6);
  const ears = [polyP([[30, 46], [30, 18], [52, 38]]), polyP([[98, 46], [98, 18], [76, 38]])];
  for (const e of ears) obj(x, e, BLACK_FUR, t, [30, 18], [98, 46], 0.5);
  const h = heartP(64, 66, 1.1);
  obj(x, h, BLACK_FUR, t, [20, 24], [108, 112], 1.4);
  eyeAt(x, 48, 62, 6, EYES[0]!, true, 0.3);
  eyeAt(x, 80, 62, 6, EYES[0]!, true, -0.3);
};

/** A soft white highlight, for wet and round things. */
function spec(x: Ctx, cx: number, cy: number, rx: number, ry: number): void {
  x.save();
  x.globalAlpha = 0.6;
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  g.addColorStop(0, 'rgba(255,255,255,.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fill(ellipseP(cx, cy, rx, ry, 0.5));
  x.restore();
}

// ---------------------------------------------------------------------------
// ssclaw: claws and arms
// ---------------------------------------------------------------------------

/** A bear's forearm along `pts`, its paw at the end, claws out. */
function bearArm(x: Ctx, t: Tone, pts: readonly Pt[], ws: readonly number[], fur: Mat = BROWN_FUR): void {
  part(x, t, taper(pts, ws), fur, 0.9);
  clawsAt(x, pts, ws[ws.length - 1]!, 11);
}

const ssclaw: Glyph = (x, t, v) => {
  const n = ((v % 5) + 5) % 5;
  glow(x, 64, 64, 54, t.glow, 0.35);
  if (n === 0) {
    // Keen Claws: one great hooked claw, its inner edge honed bright.
    const claw = new Path2D();
    claw.moveTo(26, 110);
    claw.bezierCurveTo(28, 62, 58, 24, 104, 10);
    claw.bezierCurveTo(80, 30, 64, 62, 66, 112);
    claw.closePath();
    obj(x, claw, HORN, t, [26, 10], [104, 112], 1.3);
    const edge = new Path2D();
    edge.moveTo(102, 12);
    edge.bezierCurveTo(80, 30, 64, 62, 65, 104);
    ray(x, edge, t, 2);
    energy(x, starP(104, 12, 4, 2, 12, 0.3), t, 104, 12, 12, 0.5);
    obj(x, ellipseP(46, 116, 30, 14), BLACK_FUR, t, [16, 102], [76, 128], 0.8);
    return;
  }
  if (n === 1) {
    // Bruiser: a paw raised and striking back, the blow bursting off it.
    energy(x, starP(64, 52, 10, 26, 54, 0.15), t, 64, 52, 54, 0.3);
    part(x, t, taper([[64, 132], [64, 100], [64, 76]], [44, 40, 38]), BROWN_FUR, 1);
    obj(x, smoothP([[42, 70], [86, 70], [92, 86], [78, 98], [50, 98], [36, 86]], 0.4), PAD, t, [36, 70], [92, 98], 0.8);
    for (const [tx, ty] of [[38, 54], [54, 44], [74, 44], [90, 54]] as const) {
      obj(x, ellipseP(tx, ty, 8, 10), PAD, t, [tx - 8, ty - 10], [tx + 8, ty + 10], 0.5);
      const lean = (tx - 64) * 0.18;
      obj(x, smoothP([[tx - 3.5, ty - 9], [tx + 3.5, ty - 9], [tx + lean, ty - 30]], 0.25), HORN, t, [tx - 4, ty - 30], [tx + 4, ty - 9], 0.4);
    }
    return;
  }
  if (n === 2) {
    // Hammerfall: both paws down on the floor, the floor split.
    glow(x, 64, 104, 40, t.glow, 0.7);
    const cracks: readonly (readonly Pt[])[] = [[[64, 102], [40, 112], [14, 108]], [[64, 102], [90, 114], [116, 106]], [[64, 102], [60, 122]], [[64, 102], [30, 98]], [[64, 102], [100, 96]]];
    for (const p of cracks) ray(x, line(p), t, 2.4);
    energy(x, starP(64, 100, 10, 8, 30, 0.2), t, 64, 100, 30, 0.4);
    for (const [cx, lean] of [[38, -30], [90, 30]] as const) {
      part(x, t, taper([[cx + lean, -10], [cx + lean * 0.45, 36], [cx, 76]], [30, 29, 28]), BROWN_FUR, 0.9);
      // The paw flat on the floor, claws dug in.
      for (const o of [-13, -4.5, 4.5, 13]) {
        const c = sliver([cx + o, 94], [cx + o * 1.25, 110], o > 0 ? 1.5 : -1.5, 3.4);
        solid(x, c, HORN, { a: [cx + o - 3, 94], b: [cx + o + 3, 110], size: 0.3, outline: 1, outlineColor: 'rgba(8,6,6,.9)', tex: null, ao: 0 });
      }
      obj(x, smoothP([[cx - 20, 92], [cx - 18, 78], [cx, 72], [cx + 18, 78], [cx + 20, 92], [cx, 98]], 0.4), BROWN_FUR, t, [cx - 20, 72], [cx + 20, 98], 0.8);
    }
    return;
  }
  if (n === 3) {
    // Reaping Swipe: a paw swung all the way round, claw trails behind it.
    for (let i = 0; i < 4; i++) {
      const p = new Path2D();
      p.arc(64, 70, 26 + i * 8, Math.PI * 0.75, Math.PI * 2.15);
      ray(x, p, t, 3 - i * 0.4, 0.95 - i * 0.12);
    }
    bearArm(x, t, [[30, 120], [42, 96], [52, 80]], [26, 22, 20]);
    return;
  }
  // Bear Hug: two great arms crossed round one foe, crushing.
  foe(x, t, 64, 52, 1.5);
  bearArm(x, t, [[2, 54], [36, 82], [76, 78], [100, 58]], [28, 24, 20, 18]);
  bearArm(x, t, [[126, 54], [92, 88], [52, 84], [28, 62]], [28, 24, 20, 18]);
  for (const [a, b] of [[[14, 30], [24, 38]], [[114, 30], [104, 38]], [[64, 4], [64, 14]]] as const) ray(x, line([a as Pt, b as Pt]), t, 2.4);
};

export const SHIFTER_GLYPHS: Record<string, Glyph> = { beast, paw, howl, sstear, sscat, sswolf, ssbear, ssjaw, sseyes, sshide, ssheart, ssclaw };
