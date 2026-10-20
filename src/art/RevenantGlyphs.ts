/**
 * SLAY: the Revenant's own pictograms, spread into `GLYPHS` (`Glyphs.ts`).
 *
 * Same 128-unit canvas and painting rules as the shared set: solid objects
 * in a material, caught by the tone's back light; emissive shapes for souls,
 * bile and curse marks. Only `./Paint` is imported at run time, so the shared
 * module can spread this in without a cycle. Every name starts `rv`, so the
 * word fallback in `planFor` never lands another class's skill here.
 *
 * His bone is old and yellowed, his iron black, his light whatever the tree
 * burns with: pale grave teal, bile green, heart red.
 *
 *   rvlance    v0 a femur carved to a spear point, v1 two femurs crossed,
 *              v2 a femur snapped, marrow lit in the break.
 *   rvthrall   v0 a skeleton clawing out of grave earth, v1 a field of bone
 *              hands rising.
 *   rvribs     v0 a ribcage, a light kept in it; v1 ribs rising from the
 *              ground and closing over a trapped beast.
 *   rvskull    v0 a cracked skull, v1 a hooded skull chanting runes, v2 a
 *              skull in flight with a wisp tail, v3 a skull in a crown of
 *              bone spikes, v4 three skulls singing.
 *   rvcolossus a hulking giant of stone and bone, skulls on its shoulders.
 *   rvshards   v0 bone splinters in a whirl, v1 splinters flung out of a burst.
 *   rvhelm     v0 a skull in a kettle helm with a sword at its back, v1 a
 *              horned black greathelm, its slit burning.
 *   rvbones    loose bones pulled back together into a light.
 *   rvwilt     a sword wilting like a stem, bile at its tip.
 *   rvrose     a rose rotting on its stem, petals falling.
 *   rvflay     a hooked flaying knife, a strip of hide curling off it.
 *   rvglob     v0 a glob of bile with a skull's face, in flight; v1 a ring of
 *              bile bursting out of the ground; v2 a plague cloud with a
 *              face, flies round it; v3 one bubbling drop of bile.
 *   rvsigil    v0 three curse rings stacked, v1 a curse ring bleeding into
 *              its heart, v2 a cracked ring spitting its curse to two more,
 *              v3 a great ring with an eye.
 *   rvface     v0 a face screaming, terror lines round it; v1 a face with
 *              spiral eyes, a crooked mouth and a ring of whirls.
 *   rvcorpse   a body bursting: ribs splayed, splinters and bile flying.
 *   rvdoom     v0 a black orb cracking inside a burning fuse ring, v1 a
 *              cracked bone hourglass leaking its dust, v2 a bone candle
 *              melting down, its flame guttering.
 *   rvfray     a round ward unravelling into loose threads.
 *   rvtether   v0 a stream of life drawn from a heart into a bone hand, v1 a
 *              bone hand wringing a heart dry, v2 two souls chained.
 *   rvward     a bone-rimmed shield with a spirit's face.
 *   rvsoul     v0 a soul rising out of a fallen skull, v1 a soul in a bone
 *              lantern, v2 a sheaf of souls bound with bone.
 *   rvpact     v0 an open palm cut across, v1 a contract with a blood seal.
 *   rvgrave    hands bursting up out of a rift, a hood sinking into it.
 *   rvhand     v0 a gaunt clawed hand drinking through its fingertips, v1 two
 *              bone hands cradling a heart.
 *   rvwraith   v0 a hooded wraith, a skull in the hood, flames round it;
 *              v1 a cracked gravestone with a soul climbing out.
 *   rvheart    v0 a heart bursting into a ring of blood, v1 a cracked heart
 *              stitched shut over a heartbeat line, v2 a heart behind ribs.
 *   rvscythe   a bone-hafted scythe and the red arc of its swing.
 */
import type { Glyph, Tone } from './Glyphs';
import {
  type Ctx,
  type Mat,
  type Pt,
  circleP,
  css,
  ellipseP,
  glint,
  glow,
  innerEdge,
  lift,
  mat,
  polyP,
  rrectP,
  saturate,
  sink,
  smoothP,
  solid,
  spec,
  starP,
  emissiveStroke,
} from './Paint';

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const BONE = mat([0x2a241a, 0x5a5140, 0x9a8f74, 0xcdc3a3, 0xf6eed6], 0.15, 'mottle', 0.3);
const OLD_BONE = mat([0x1c1912, 0x423a2b, 0x726750, 0xa3977a, 0xd6caa8], 0.1, 'crack', 0.35);
const IRON = mat([0x101216, 0x24282e, 0x434a52, 0x737c86, 0xb8c0ca], 0.8, 'hammered', 0.35);
const BLACK_IRON = mat([0x060708, 0x121418, 0x24282e, 0x444a54, 0x868e9a], 0.85, 'hammered', 0.3);
const STONE = mat([0x131518, 0x2b2f33, 0x4e5358, 0x7a7f84, 0xa8adb2], 0, 'crack', 0.45);
const EARTH = mat([0x0a0806, 0x1c160e, 0x362a1c, 0x54442e, 0x766248], 0, 'grain', 0.5);
const CLOTH = mat([0x060608, 0x121218, 0x24242c, 0x3c3c46, 0x62626e], 0.05, 'weave', 0.35, 0.8);
const LEATHER = mat([0x170f09, 0x382515, 0x5c3f25, 0x85603b, 0xab8560], 0.1, 'pores', 0.5);
const BLOOD = mat([0x1a0204, 0x4a060a, 0x8a1016, 0xc42a26, 0xf07060], 0.2, null);
const PALE = mat([0x141318, 0x34333c, 0x5c5b66, 0x8e8c96, 0xc6c4cc], 0.1, 'pores', 0.35);
const HIDE = mat([0x1a0808, 0x461818, 0x7a3030, 0xa85a50, 0xd8968a], 0.1, 'pores', 0.4);
const ROSE = mat([0x1a0610, 0x4a0e1e, 0x82203a, 0xb04a5a, 0xe08a90], 0.1, 'mottle', 0.35);
const STEM = mat([0x0c0e06, 0x1e2410, 0x34401c, 0x4e5c2c, 0x76844a], 0.05, 'grain', 0.3);
const MIASMA = mat([0x101408, 0x283018, 0x48542a, 0x6c7a40, 0x9aa866], 0, 'mottle', 0.4);
const PARCH = mat([0x2a2010, 0x5a4828, 0x947a4a, 0xc4aa74, 0xeedcae], 0, 'fine', 0.3);
const WAX = mat([0x2a241a, 0x6a604a, 0xb0a482, 0xdcd2b4, 0xfaf4e2], 0.2, null);

const INK = '#0a0706';
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Paint modes
// ---------------------------------------------------------------------------

function obj(x: Ctx, p: Path2D, m: Mat, t: Tone, a: Pt = [34, 30], b: Pt = [94, 98], size = 1.4): void {
  solid(x, p, m, { a, b, size, outline: 2.2, outlineColor: 'rgba(6,5,6,.95)' });
  innerEdge(x, p, css(t.glow, 0.9), 3.5, -2.2, -2.2, 2);
}

/** A small solid (a finger bone, a rib, a link): a thinner edge, so it is not all outline. */
function part(x: Ctx, p: Path2D, m: Mat, t: Tone, a: Pt, b: Pt): void {
  solid(x, p, m, { a, b, size: 0.5, outline: 1.6, outlineColor: 'rgba(6,5,6,.95)', ao: 0.4 });
  innerEdge(x, p, css(t.glow, 0.85), 2, -1.4, -1.4, 1.4);
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

/** Runs `fn` turned by `rot` and scaled by `s` about (cx, cy), drawn as if about (64, 64). */
function placed(x: Ctx, cx: number, cy: number, s: number, rot: number, fn: () => void): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(s, s);
  x.translate(-64, -64);
  fn();
  x.restore();
}

/** A dark hole lit from inside: an eye socket, a mouth, a rift. */
function hole(x: Ctx, p: Path2D, t: Tone, cx: number, cy: number, r: number, a = 1): void {
  x.save();
  x.fillStyle = INK;
  x.fill(p);
  x.clip(p);
  glow(x, cx, cy, r, t.glow, a);
  x.restore();
}

function ink(x: Ctx, p: Path2D, a = 0.95): void {
  x.save();
  x.fillStyle = `rgba(10,7,6,${a})`;
  x.fill(p);
  x.restore();
}

function pathOf(pts: readonly Pt[]): Path2D {
  const p = new Path2D();
  pts.forEach(([px, py], i) => (i ? p.lineTo(px, py) : p.moveTo(px, py)));
  return p;
}

/** A dark stroke: a crack, a seam, a tooth line. */
function line(x: Ctx, pts: readonly Pt[], w: number, color = 'rgba(10,7,6,.9)'): void {
  x.save();
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = color;
  x.lineWidth = w;
  x.stroke(pathOf(pts));
  x.restore();
}

/** `ray` at an opacity. */
function faint(x: Ctx, p: Path2D, t: Tone, w: number, a: number): void {
  x.save();
  x.globalAlpha = a;
  ray(x, p, t, w);
  x.restore();
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** A capsule from a to b, w wide. Wound clockwise, so capsules and circles union. */
function capsuleP(a: Pt, b: Pt, w: number): Path2D {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const r = w / 2;
  const p = new Path2D();
  p.arc(a[0], a[1], r, ang + Math.PI / 2, ang + Math.PI * 1.5);
  p.arc(b[0], b[1], r, ang - Math.PI / 2, ang + Math.PI / 2);
  p.closePath();
  return p;
}

/** A long bone: a shaft with a pair of knobs at either end. */
function boneP(a: Pt, b: Pt, w: number, ka = true, kb = true): Path2D {
  const p = capsuleP(a, b, w);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  const ends: Array<[Pt, boolean, number]> = [[a, ka, -1], [b, kb, 1]];
  for (const [e, k, dir] of ends) {
    if (!k) continue;
    for (const sg of [-1, 1]) {
      p.addPath(circleP(e[0] + ux * dir * w * 0.2 - uy * sg * w * 0.42, e[1] + uy * dir * w * 0.2 + ux * sg * w * 0.42, w * 0.6));
    }
  }
  return p;
}

/** A tapering band along a line of points, `w0` wide at the first, `w1` at the last. */
function ribbonP(pts: readonly Pt[], w0: number, w1: number): Path2D {
  const L: Pt[] = [];
  const R: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    const p = pts[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    L.push([p[0] - (dy / l) * w, p[1] + (dx / l) * w]);
    R.push([p[0] + (dy / l) * w, p[1] - (dx / l) * w]);
  }
  return smoothP([...L, ...R.reverse()], 0.5);
}

function dropP(cx: number, cy: number, r: number): Path2D {
  return smoothP([[cx, cy - r * 1.8], [cx + r * 0.55, cy - r * 0.7], [cx + r, cy + r * 0.2], [cx + r * 0.7, cy + r * 0.85], [cx, cy + r], [cx - r * 0.7, cy + r * 0.85], [cx - r, cy + r * 0.2], [cx - r * 0.55, cy - r * 0.7]], 0.5);
}

function heartP(cx: number, cy: number, s: number): Path2D {
  const p = new Path2D();
  p.moveTo(cx, cy + s * 0.95);
  p.bezierCurveTo(cx - s * 0.2, cy + s * 0.7, cx - s, cy + s * 0.25, cx - s, cy - s * 0.25);
  p.bezierCurveTo(cx - s, cy - s * 0.8, cx - s * 0.25, cy - s * 0.95, cx, cy - s * 0.45);
  p.bezierCurveTo(cx + s * 0.25, cy - s * 0.95, cx + s, cy - s * 0.8, cx + s, cy - s * 0.25);
  p.bezierCurveTo(cx + s, cy + s * 0.25, cx + s * 0.2, cy + s * 0.7, cx, cy + s * 0.95);
  p.closePath();
  return p;
}

/** A bone splinter pointing along `ang`. */
function shardP(cx: number, cy: number, len: number, w: number, ang: number): Path2D {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const local: Pt[] = [[len / 2, 0], [len * 0.1, -w / 2], [-len / 2, -w * 0.3], [-len * 0.36, 0], [-len / 2, w * 0.35], [len * 0.05, w / 2]];
  return polyP(local.map(([lx, ly]) => [cx + lx * c - ly * s, cy + lx * s + ly * c] as Pt));
}

function flameP(cx: number, cy: number, s: number, lean = 0): Path2D {
  return smoothP([[cx + lean * s, cy - s * 2.2], [cx + s * 0.5, cy - s * 0.9], [cx + s * 0.9, cy + s * 0.1], [cx + s * 0.5, cy + s * 0.9], [cx - s * 0.5, cy + s * 0.9], [cx - s * 0.9, cy + s * 0.1], [cx - s * 0.35 + lean * s * 0.4, cy - s * 0.8]], 0.5);
}

/** An elliptical ring, w thick (the inner edge wound the other way, so it is a hole). */
function ringP(cx: number, cy: number, rx: number, ry: number, w: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, rot, 0, TAU);
  p.ellipse(cx, cy, Math.max(0.5, rx - w), Math.max(0.5, ry - w), rot, TAU, 0, true);
  return p;
}

/** A pile of grave earth, its top at cy. */
function mound(x: Ctx, t: Tone, cx: number, cy: number, w: number, h = 12): void {
  const p = smoothP([[cx - w, cy + h * 1.6], [cx - w * 0.8, cy + h * 0.2], [cx - w * 0.4, cy - h * 0.2], [cx, cy - h * 0.3], [cx + w * 0.4, cy - h * 0.2], [cx + w * 0.8, cy + h * 0.2], [cx + w, cy + h * 1.6], [cx, cy + h * 2.6]], 0.45);
  obj(x, p, EARTH, t, [cx - w, cy - h], [cx + w, cy + h * 2], 0.9);
  for (const [dx, dy, r] of [[-0.62, 0.35, 0.22], [0.5, 0.45, 0.18], [-0.1, 0.7, 0.16], [0.82, 0.95, 0.14]] as const) {
    part(x, circleP(cx + dx * w, cy + dy * h * 1.4, r * h), EARTH, t, [cx - w, cy - h], [cx + w, cy + h]);
  }
}

// ---------------------------------------------------------------------------
// Skulls, hands, souls
// ---------------------------------------------------------------------------

interface SkullOpts {
  /** Jaw dropped, in units of s. */
  open?: number;
  /** Socket light, 0..1.2. */
  eyes?: number;
  crack?: boolean;
  m?: Mat;
}

/** A skull face on, centred near (cx, cy), about 2s wide. */
function skull(x: Ctx, t: Tone, cx: number, cy: number, s: number, o: SkullOpts = {}): void {
  const g = (o.open ?? 0) * s;
  const m = o.m ?? BONE;
  const eyes = o.eyes ?? 1;
  const sz = s / 24;
  if (g > 0) {
    const mouth = ellipseP(cx, cy + s * 0.7 + g * 0.5, s * 0.4, s * 0.1 + g * 0.6);
    hole(x, mouth, t, cx, cy + s * 0.72 + g * 0.5, s * 0.6, 1);
  }
  const jaw = smoothP([[cx - s * 0.56, cy + s * 0.58 + g], [cx + s * 0.56, cy + s * 0.58 + g], [cx + s * 0.5, cy + s * 0.9 + g], [cx, cy + s * 1.05 + g], [cx - s * 0.5, cy + s * 0.9 + g]], 0.3);
  obj(x, jaw, m, t, [cx - s, cy + s * 0.5], [cx + s, cy + s * 1.1 + g], sz);
  const head = smoothP(
    [[cx, cy - s], [cx + s * 0.74, cy - s * 0.8], [cx + s * 0.96, cy - s * 0.2], [cx + s * 0.86, cy + s * 0.28], [cx + s * 0.62, cy + s * 0.46], [cx + s * 0.5, cy + s * 0.74], [cx, cy + s * 0.78], [cx - s * 0.5, cy + s * 0.74], [cx - s * 0.62, cy + s * 0.46], [cx - s * 0.86, cy + s * 0.28], [cx - s * 0.96, cy - s * 0.2], [cx - s * 0.74, cy - s * 0.8]],
    0.42,
  );
  obj(x, head, m, t, [cx - s, cy - s], [cx + s, cy + s * 0.8], sz * 1.3);
  spec(x, cx - s * 0.32, cy - s * 0.6, s * 0.38, s * 0.1, -0.45, 0.45);
  for (const sg of [-1, 1]) {
    const e = smoothP([[cx + sg * s * 0.1, cy - s * 0.04], [cx + sg * s * 0.4, cy - s * 0.2], [cx + sg * s * 0.62, cy - s * 0.1], [cx + sg * s * 0.58, cy + s * 0.18], [cx + sg * s * 0.36, cy + s * 0.3], [cx + sg * s * 0.16, cy + s * 0.18]], 0.45);
    hole(x, e, t, cx + sg * s * 0.36, cy + s * 0.08, s * 0.38, eyes);
    if (eyes > 0.6) glint(x, cx + sg * s * 0.36, cy + s * 0.08, s * 0.16, t.core, Math.min(1, eyes));
  }
  ink(x, polyP([[cx, cy + s * 0.26], [cx - s * 0.13, cy + s * 0.5], [cx, cy + s * 0.45], [cx + s * 0.13, cy + s * 0.5]]));
  const tw = Math.max(1, s * 0.05);
  for (let i = -2; i <= 2; i++) {
    const tx = cx + i * s * 0.14;
    line(x, [[tx, cy + s * 0.6], [tx, cy + s * 0.74]], tw, 'rgba(10,7,6,.85)');
    line(x, [[tx, cy + s * 0.64 + g], [tx, cy + s * 0.82 + g]], tw, 'rgba(10,7,6,.85)');
  }
  if (g <= 0) line(x, [[cx - s * 0.42, cy + s * 0.74], [cx + s * 0.42, cy + s * 0.74]], tw, 'rgba(10,7,6,.85)');
  if (o.crack) line(x, [[cx + s * 0.12, cy - s * 0.98], [cx + s * 0.02, cy - s * 0.72], [cx + s * 0.18, cy - s * 0.5], [cx + s * 0.08, cy - s * 0.22]], Math.max(1.2, s * 0.06));
}

/** A skull in profile, facing right. */
function skullSide(x: Ctx, t: Tone, cx: number, cy: number, s: number, eyes = 1): void {
  const sz = s / 24;
  const jaw = smoothP([[cx - s * 0.12, cy + s * 0.46], [cx + s * 0.16, cy + s * 0.62], [cx + s * 0.84, cy + s * 0.74], [cx + s * 0.8, cy + s * 0.96], [cx + s * 0.2, cy + s * 1.0], [cx - s * 0.22, cy + s * 0.8]], 0.35);
  obj(x, jaw, BONE, t, [cx - s, cy + s * 0.4], [cx + s, cy + s], sz);
  const head = smoothP(
    [[cx - s * 0.92, cy - s * 0.05], [cx - s * 0.72, cy - s * 0.72], [cx - s * 0.05, cy - s], [cx + s * 0.6, cy - s * 0.74], [cx + s * 0.8, cy - s * 0.3], [cx + s * 0.76, cy - s * 0.02], [cx + s * 0.98, cy + s * 0.26], [cx + s * 0.84, cy + s * 0.44], [cx + s * 0.9, cy + s * 0.66], [cx + s * 0.3, cy + s * 0.7], [cx - s * 0.1, cy + s * 0.5], [cx - s * 0.5, cy + s * 0.5], [cx - s * 0.84, cy + s * 0.3]],
    0.4,
  );
  obj(x, head, BONE, t, [cx - s, cy - s], [cx + s, cy + s * 0.7], sz * 1.3);
  spec(x, cx - s * 0.2, cy - s * 0.66, s * 0.4, s * 0.1, -0.2, 0.45);
  const e = smoothP([[cx + s * 0.2, cy - s * 0.22], [cx + s * 0.56, cy - s * 0.34], [cx + s * 0.7, cy - s * 0.06], [cx + s * 0.54, cy + s * 0.16], [cx + s * 0.26, cy + s * 0.08]], 0.5);
  hole(x, e, t, cx + s * 0.46, cy - s * 0.08, s * 0.4, eyes);
  if (eyes > 0.6) glint(x, cx + s * 0.48, cy - s * 0.08, s * 0.2, t.core, Math.min(1, eyes));
  ink(x, polyP([[cx + s * 0.74, cy + s * 0.1], [cx + s * 0.88, cy + s * 0.3], [cx + s * 0.7, cy + s * 0.34]]));
  ink(x, ellipseP(cx - s * 0.18, cy + s * 0.2, s * 0.2, s * 0.09, -0.2), 0.75);
  const tw = Math.max(1, s * 0.05);
  for (let i = 0; i < 4; i++) {
    const tx = cx + s * (0.44 + i * 0.13);
    line(x, [[tx, cy + s * 0.58], [tx, cy + s * 0.84]], tw, 'rgba(10,7,6,.85)');
  }
  line(x, [[cx + s * 0.36, cy + s * 0.7], [cx + s * 0.88, cy + s * 0.72]], tw, 'rgba(10,7,6,.85)');
}

/**
 * A skeletal hand and forearm, wrist at (wx, wy), reaching along `rot`
 * (0 is straight up). `curl` closes the fingers toward the middle.
 */
function boneHand(x: Ctx, t: Tone, wx: number, wy: number, s: number, rot: number, curl = 0, arm = 26, m: Mat = BONE): void {
  x.save();
  x.translate(wx, wy);
  x.rotate(rot);
  x.scale(s, s);
  const A: Pt = [-14, -50];
  const B: Pt = [14, 20];
  if (arm > 0) {
    part(x, boneP([-3.6, arm], [-3.2, 3], 5.6, true, false), m, t, A, B);
    part(x, boneP([3.8, arm], [3.2, 3], 5, true, false), m, t, A, B);
  }
  part(x, ellipseP(0, -1, 8.5, 5.5), m, t, A, B);
  // Thumb, behind the fingers.
  {
    let a = -Math.PI / 2 - 1.0;
    let p: Pt = [-6.5, -3];
    for (const [seg, w] of [[9, 5], [7.5, 4.6], [6, 4]] as const) {
      const q: Pt = [p[0] + Math.cos(a) * seg, p[1] + Math.sin(a) * seg];
      part(x, capsuleP(p, q, w), m, t, A, B);
      p = q;
      a += 0.25 + curl * 0.6;
    }
  }
  const lens = [0.86, 1, 0.95, 0.78];
  for (let i = 0; i < 4; i++) {
    const len = lens[i]!;
    const base: Pt = [-6 + i * 4, -4];
    const knuckle: Pt = [-10 + i * 6.6, -17 - len * 3];
    part(x, capsuleP(base, knuckle, 4.6), m, t, A, B);
    let a = -Math.PI / 2 + (i - 1.5) * 0.2;
    const inward = i < 2 ? 1 : -1;
    let p: Pt = knuckle;
    for (const [seg, w] of [[10, 4.8], [7.5, 4.4], [6, 3.8]] as const) {
      a += inward * curl * 0.55;
      const q: Pt = [p[0] + Math.cos(a) * seg * len, p[1] + Math.sin(a) * seg * len];
      part(x, capsuleP(p, q, w), m, t, A, B);
      p = q;
    }
  }
  x.restore();
}

/** A soul: a tail along `pts` (tip first) and a head at the last point, with a face. */
function soul(x: Ctx, t: Tone, pts: readonly Pt[], s: number, face = true): void {
  const head = pts[pts.length - 1]!;
  energy(x, ribbonP(pts, 1, s * 1.7), t, head[0], head[1], s * 4, 0.3);
  const hp = smoothP([[head[0], head[1] - s * 1.15], [head[0] + s * 0.9, head[1] - s * 0.4], [head[0] + s * 0.85, head[1] + s * 0.55], [head[0], head[1] + s * 0.95], [head[0] - s * 0.85, head[1] + s * 0.55], [head[0] - s * 0.9, head[1] - s * 0.4]], 0.5);
  energy(x, hp, t, head[0], head[1] - s * 0.2, s * 1.6, 0.5);
  if (!face) return;
  for (const sg of [-1, 1]) ink(x, ellipseP(head[0] + sg * s * 0.36, head[1] - s * 0.1, s * 0.17, s * 0.3, sg * 0.35), 0.85);
  ink(x, ellipseP(head[0], head[1] + s * 0.45, s * 0.16, s * 0.24), 0.75);
}

/** A curse ring: outer and inner rings, runes between them. */
function sigil(x: Ctx, t: Tone, cx: number, cy: number, r: number, ry = r, ticks = 9, a = 1): void {
  x.save();
  x.globalAlpha = a;
  glow(x, cx, cy, r * 1.1, t.glow, 0.35);
  const outer = new Path2D();
  outer.ellipse(cx, cy, r, ry, 0, 0, TAU);
  ray(x, outer, t, Math.max(1.6, r * 0.08));
  const inner = new Path2D();
  inner.ellipse(cx, cy, r * 0.7, ry * 0.7, 0, 0, TAU);
  ray(x, inner, t, Math.max(1.1, r * 0.04));
  const rune = new Path2D();
  for (let i = 0; i < ticks; i++) {
    const ang = (i / ticks) * TAU + 0.3;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const mx = cx + c * r * 0.85;
    const my = cy + s * ry * 0.85;
    const k = r * 0.1;
    // A little rune: a stave and a hooked branch, alternating.
    rune.moveTo(mx - c * k, my - s * k * (ry / r));
    rune.lineTo(mx + c * k, my + s * k * (ry / r));
    if (i % 2) {
      rune.moveTo(mx, my);
      rune.lineTo(mx - s * k, my + c * k * (ry / r));
    } else {
      rune.moveTo(mx + c * k * 0.2, my + s * k * 0.2 * (ry / r));
      rune.lineTo(mx + s * k, my - c * k * (ry / r));
    }
  }
  ray(x, rune, t, Math.max(1, r * 0.035));
  x.restore();
}

// ---------------------------------------------------------------------------
// Ossuary
// ---------------------------------------------------------------------------

const rvlance: Glyph = (x, t, v) => {
  const k = v % 3;
  if (k === 0) {
    // A femur carved to a spear point, thrown point first.
    glow(x, 82, 46, 44, t.glow, 0.5);
    placed(x, 64, 64, 1, -Math.PI / 4, () => {
      const A: Pt = [40, 52];
      const B: Pt = [40, 78];
      obj(x, boneP([22, 64], [80, 64], 12, true, false), BONE, t, A, B, 0.8);
      obj(x, smoothP([[74, 57], [96, 59.5], [120, 64], [96, 68.5], [74, 71]], 0.25), BONE, t, A, B, 0.6);
      for (const bx of [70, 75, 80]) obj(x, rrectP(bx, 56.5, 3.6, 15, 1.4), LEATHER, t, A, B, 0.2);
      spec(x, 48, 60.5, 24, 2, 0, 0.5);
      ray(x, pathOf([[86, 60.5], [116, 63.6]]), t, 1.6);
      glint(x, 120, 64, 7, t.core, 1);
    });
    return;
  }
  if (k === 1) {
    // Two femurs crossed.
    glow(x, 64, 64, 44, t.glow, 0.45);
    for (const rot of [Math.PI / 4, -Math.PI / 4]) {
      placed(x, 64, 64, 1, rot, () => {
        obj(x, boneP([22, 64], [106, 64], 13), BONE, t, [40, 52], [40, 78], 0.9);
        spec(x, 58, 60, 28, 2, 0, 0.45);
      });
    }
    return;
  }
  // A femur snapped in two, the marrow lit in the break.
  glow(x, 64, 64, 34, t.glow, 0.8);
  const left = boneP([16, 64], [16, 64], 13, true, false);
  left.addPath(polyP([[16, 57.5], [52, 57.5], [57, 61], [53, 64], [59, 67.5], [52, 70.5], [16, 70.5]]));
  const right = boneP([112, 64], [112, 64], 13, true, false);
  right.addPath(polyP([[112, 70.5], [76, 70.5], [70, 67], [75, 64], [71, 60.5], [77, 57.5], [112, 57.5]]));
  for (const [p, rot, mx] of [[left, -Math.PI / 4 - 0.2, 56], [right, -Math.PI / 4 + 0.2, 72]] as const) {
    placed(x, 64, 64, 1, rot, () => {
      obj(x, p, BONE, t, [40, 52], [40, 78], 0.9);
      energy(x, ellipseP(mx, 64, 3.2, 5.5), t, mx, 64, 7, 0.6);
    });
  }
  glint(x, 64, 64, 10, t.core, 0.9);
};

const rvthrall: Glyph = (x, t, v) => {
  if (v % 2 === 1) {
    // A field of bone hands rising.
    glow(x, 64, 84, 52, t.glow, 0.55);
    const hands: Array<[number, number, number, number, number]> = [[22, 98, 0.62, -0.38, 0.35], [104, 98, 0.62, 0.38, 0.35], [42, 92, 0.8, -0.16, 0.2], [86, 92, 0.8, 0.16, 0.2], [64, 90, 1.02, 0, 0.1]];
    for (const [hx, hy, s, rot, curl] of hands) boneHand(x, t, hx, hy, s, rot, curl, 22);
    mound(x, t, 64, 100, 60, 10);
    for (const gx of [30, 52, 76, 98]) faint(x, pathOf([[gx, 104], [gx + 4, 112], [gx + 1, 118]]), t, 1.6, 0.8);
    return;
  }
  // A thrall clawing its way out of the earth.
  glow(x, 64, 64, 50, t.glow, 0.5);
  const A: Pt = [30, 20];
  const B: Pt = [98, 100];
  // Raised arm, left.
  part(x, boneP([48, 58], [32, 42], 7), BONE, t, A, B);
  part(x, boneP([32, 42], [27, 22], 6), BONE, t, A, B);
  for (const [tx, ty] of [[17, 8], [25, 5], [33, 8]] as const) part(x, capsuleP([27, 21], [tx, ty], 4.2), BONE, t, A, B);
  // Reaching arm, right.
  part(x, boneP([80, 58], [98, 68], 7), BONE, t, A, B);
  part(x, boneP([98, 68], [110, 54], 6), BONE, t, A, B);
  for (const [tx, ty] of [[118, 46], [114, 42], [107, 43]] as const) part(x, capsuleP([110, 54], [tx, ty], 4.2), BONE, t, A, B);
  // Spine.
  for (let i = 0; i < 6; i++) part(x, rrectP(59.5, 54 + i * 8, 9, 6, 2), BONE, t, A, B);
  // Ribs.
  for (let i = 0; i < 3; i++) {
    const y = 60 + i * 9;
    const ex = 22 - i * 2;
    for (const sg of [-1, 1]) {
      part(x, ribbonP([[64 + sg * 4, y], [64 + sg * 13, y - 3], [64 + sg * ex, y + 3], [64 + sg * (ex - 3), y + 9]], 5, 3.4), BONE, t, A, B);
    }
  }
  part(x, boneP([46, 55], [82, 55], 4.6), BONE, t, A, B);
  skull(x, t, 64, 34, 16, { eyes: 1.1 });
  mound(x, t, 64, 96, 58, 11);
};

/** A ribcage, front on, with a light kept in it. */
function ribcage(x: Ctx, t: Tone, cx: number, cy: number, s: number): void {
  const A: Pt = [cx - 40 * s, cy - 40 * s];
  const B: Pt = [cx + 40 * s, cy + 40 * s];
  glow(x, cx, cy + 4 * s, 30 * s, t.glow, 0.9);
  energy(x, ellipseP(cx, cy + 4 * s, 9 * s, 12 * s), t, cx, cy + 4 * s, 14 * s, 0.6);
  for (let i = 0; i < 7; i++) part(x, rrectP(cx - 5 * s, cy - 38 * s + i * 11 * s, 10 * s, 8 * s, 2.5 * s), OLD_BONE, t, A, B);
  for (let i = 0; i < 5; i++) {
    const y = cy - 30 * s + i * 12.5 * s;
    const ex = (i < 3 ? 36 : 34 - (i - 2) * 4) * s;
    for (const sg of [-1, 1]) {
      const pts: Pt[] = [[cx + sg * 5 * s, y], [cx + sg * 20 * s, y - 4 * s], [cx + sg * ex, y + 4 * s], [cx + sg * (ex + 1 * s), y + 14 * s], [cx + sg * (ex - 8 * s), y + 21 * s]];
      obj(x, ribbonP(pts, 8 * s, 4.5 * s), BONE, t, A, B, 0.5);
    }
  }
  obj(x, smoothP([[cx - 5 * s, cy - 36 * s], [cx + 5 * s, cy - 36 * s], [cx + 4 * s, cy + 14 * s], [cx, cy + 20 * s], [cx - 4 * s, cy + 14 * s]], 0.35), BONE, t, A, B, 0.6);
  for (const sg of [-1, 1]) obj(x, boneP([cx + sg * 6 * s, cy - 38 * s], [cx + sg * 34 * s, cy - 42 * s], 6 * s), BONE, t, A, B, 0.5);
}

const rvribs: Glyph = (x, t, v) => {
  if (v % 2 === 0) {
    ribcage(x, t, 64, 64, 1);
    return;
  }
  // Ribs out of the ground, closing over a trapped beast.
  glow(x, 64, 76, 46, t.glow, 0.55);
  const A: Pt = [20, 20];
  const B: Pt = [108, 110];
  const rib = (sg: number, bx: number, tip: number, w: number, m: Mat): void => {
    const pts: Pt[] = [[64 + sg * bx, 108], [64 + sg * (bx + 4), 76], [64 + sg * (bx - 2), 46], [64 + sg * (bx * 0.45), tip + 6], [64 + sg * 5, tip]];
    obj(x, ribbonP(pts, w, 2), m, t, A, B, 0.6);
  };
  for (const sg of [-1, 1]) rib(sg, 30, 20, 8, OLD_BONE);
  const beast = smoothP([[44, 108], [42, 88], [50, 74], [58, 70], [70, 70], [80, 76], [86, 90], [84, 108]], 0.45);
  x.save();
  x.fillStyle = css(sink(t.dark, 0.3));
  x.fill(beast);
  x.restore();
  innerEdge(x, beast, css(t.glow, 0.8), 3, -2, -2, 2);
  for (const sg of [-1, 1]) obj(x, smoothP([[64 + sg * 8, 74], [64 + sg * 16, 62], [64 + sg * 14, 74]], 0.3), OLD_BONE, t, A, B, 0.3);
  for (const sg of [-1, 1]) glint(x, 64 + sg * 7, 84, 4, t.core, 1);
  for (const sg of [-1, 1]) {
    rib(sg, 44, 30, 10, BONE);
    rib(sg, 16, 34, 7, BONE);
  }
  mound(x, t, 64, 104, 56, 8);
};

const rvskull: Glyph = (x, t, v) => {
  const k = v % 5;
  if (k === 0) {
    glow(x, 64, 60, 44, t.glow, 0.45);
    skull(x, t, 64, 56, 34, { eyes: 1.1, crack: true });
    return;
  }
  if (k === 1) {
    // A hooded skull, chanting: runes rise out of its mouth.
    glow(x, 64, 70, 46, t.glow, 0.5);
    const hood = smoothP([[64, 8], [94, 34], [106, 82], [96, 116], [32, 116], [22, 82], [34, 34]], 0.4);
    obj(x, hood, CLOTH, t, [30, 10], [100, 116], 1.2);
    hole(x, smoothP([[64, 26], [86, 46], [92, 84], [80, 108], [48, 108], [36, 84], [42, 46]], 0.45), t, 64, 70, 40, 0.35);
    skull(x, t, 64, 62, 22, { open: 0.42, eyes: 1.2 });
    const r = new Path2D();
    for (const [rx, ry, s] of [[22, 34, 6], [106, 30, 6], [112, 62, 5], [16, 66, 5]] as const) {
      r.moveTo(rx, ry - s);
      r.lineTo(rx, ry + s);
      r.moveTo(rx - s * 0.7, ry - s * 0.5);
      r.lineTo(rx, ry);
      r.lineTo(rx + s * 0.7, ry - s * 0.5);
    }
    ray(x, r, t, 2.2);
    return;
  }
  if (k === 2) {
    // A skull hunting through the air, a wisp for a tail.
    glow(x, 76, 52, 44, t.glow, 0.6);
    energy(x, ribbonP([[10, 118], [20, 104], [34, 92], [50, 80], [66, 66]], 1, 34), t, 60, 70, 60, 0.3);
    faint(x, smoothP([[18, 112], [34, 96], [52, 82]], 0.5, false), t, 2, 0.9);
    x.save();
    x.translate(78, 50);
    x.rotate(0.32);
    skullSide(x, t, 0, 0, 25, 1.2);
    x.restore();
    for (const [sx, sy, r] of [[30, 82, 4], [46, 104, 3.5], [16, 92, 3]] as const) glint(x, sx, sy, r * 2, t.core, 0.9);
    return;
  }
  if (k === 3) {
    // A skull crowned in bone spikes.
    glow(x, 64, 50, 48, t.glow, 0.55);
    const A: Pt = [30, 10];
    const B: Pt = [98, 60];
    for (const [dx, h] of [[-24, 18], [-12, 25], [0, 32], [12, 25], [24, 18]] as const) {
      const bx = 64 + dx;
      const by = 44 + Math.abs(dx) * 0.22;
      obj(x, smoothP([[bx - 5, by + 4], [bx - 3, by - h * 0.5], [bx, by - h], [bx + 3, by - h * 0.5], [bx + 5, by + 4]], 0.3), BONE, t, A, B, 0.5);
    }
    skull(x, t, 64, 70, 30, { eyes: 1.2 });
    obj(x, ribbonP([[34, 52], [48, 45], [64, 43], [80, 45], [94, 52]], 9, 9), BLACK_IRON, t, A, B, 0.6);
    energy(x, polyP([[64, 39], [69, 45], [64, 51], [59, 45]]), t, 64, 45, 8, 0.5);
    return;
  }
  // Three skulls, singing.
  glow(x, 64, 60, 50, t.glow, 0.5);
  for (const [r, a] of [[48, 0.85], [56, 0.55]] as const) {
    const arc = new Path2D();
    arc.arc(64, 64, r, -Math.PI * 0.86, -Math.PI * 0.14);
    faint(x, arc, t, 2.2, a);
  }
  skull(x, t, 32, 56, 16, { open: 0.38, eyes: 0.9 });
  skull(x, t, 96, 56, 16, { open: 0.38, eyes: 0.9 });
  skull(x, t, 64, 64, 22, { open: 0.45, eyes: 1.2 });
};

const rvcolossus: Glyph = (x, t) => {
  glow(x, 64, 64, 50, t.glow, 0.45);
  const A: Pt = [20, 24];
  const B: Pt = [108, 112];
  for (const sg of [-1, 1]) {
    obj(x, capsuleP([64 + sg * 36, 56], [64 + sg * 42, 92], 20), STONE, t, A, B, 0.8);
    const fist = smoothP([[64 + sg * 30, 92], [64 + sg * 52, 90], [64 + sg * 56, 104], [64 + sg * 48, 116], [64 + sg * 32, 114], [64 + sg * 28, 102]], 0.45);
    obj(x, fist, STONE, t, A, B, 0.7);
    for (let i = 0; i < 3; i++) line(x, [[64 + sg * (33 + i * 6), 96], [64 + sg * (34 + i * 6), 104]], 1.6);
  }
  const torso = smoothP([[34, 38], [64, 32], [94, 38], [104, 62], [92, 96], [64, 108], [36, 96], [24, 62]], 0.4);
  obj(x, torso, STONE, t, A, B, 1.4);
  const chest = smoothP([[50, 54], [78, 54], [82, 76], [64, 90], [46, 76]], 0.5);
  hole(x, chest, t, 64, 72, 22, 1);
  energy(x, ellipseP(64, 72, 6, 8), t, 64, 72, 10, 0.6);
  for (let i = 0; i < 3; i++) {
    const y = 58 + i * 9;
    for (const sg of [-1, 1]) part(x, ribbonP([[64 + sg * 2, y], [64 + sg * 12, y - 1], [64 + sg * 20, y + 4]], 4.6, 3.2), BONE, t, A, B);
  }
  part(x, rrectP(61.5, 54, 5, 34, 2), BONE, t, A, B);
  skull(x, t, 30, 42, 11, { eyes: 0.8 });
  skull(x, t, 98, 42, 11, { eyes: 0.8 });
  skull(x, t, 64, 30, 13, { eyes: 1.3 });
};

const rvshards: Glyph = (x, t, v) => {
  const A: Pt = [20, 20];
  const B: Pt = [108, 108];
  if (v % 2 === 0) {
    // Splinters in a whirl.
    glow(x, 64, 64, 30, t.glow, 0.8);
    for (let i = 0; i < 3; i++) {
      const a0 = (i / 3) * TAU;
      const sw = new Path2D();
      for (let j = 0; j <= 16; j++) {
        const k = j / 16;
        const a = a0 + k * 2.2;
        const r = 12 + k * 36;
        if (j) sw.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
        else sw.moveTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      }
      faint(x, sw, t, 2.4, 0.85);
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.4;
      const r = 20 + (i % 3) * 11;
      obj(x, shardP(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 22 - (i % 3) * 3, 7, a + Math.PI / 2 + 0.35), BONE, t, A, B, 0.4);
    }
    energy(x, circleP(64, 64, 6), t, 64, 64, 8, 0.6);
    return;
  }
  // Splinters flung out of a burst.
  glow(x, 64, 64, 48, t.glow, 0.6);
  x.save();
  x.globalAlpha = 0.9;
  energy(x, starP(64, 64, 8, 10, 26, 0.2), t, 64, 64, 26, 0.35);
  x.restore();
  faint(x, circleP(64, 64, 30), t, 2, 0.6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    faint(x, pathOf([[64 + c * 22, 64 + s * 22], [64 + c * 32, 64 + s * 32]]), t, 1.6, 0.7);
    obj(x, shardP(64 + c * 42, 64 + s * 42, 20, 7, a), BONE, t, A, B, 0.4);
  }
};

const rvhelm: Glyph = (x, t, v) => {
  const A: Pt = [30, 20];
  const B: Pt = [98, 108];
  if (v % 2 === 0) {
    // A skull in a kettle helm, a sword at its back.
    glow(x, 64, 64, 48, t.glow, 0.5);
    placed(x, 64, 64, 1, Math.PI / 4, () => {
      obj(x, polyP([[60, 18], [64, 4], [68, 18], [68, 92], [60, 92]]), IRON, t, [56, 10], [72, 92], 0.6);
      obj(x, rrectP(42, 92, 44, 7, 2), IRON, t, [42, 92], [86, 99], 0.4);
      obj(x, rrectP(60.5, 99, 7, 16, 2), LEATHER, t, [60, 99], [68, 115], 0.3);
      obj(x, circleP(64, 119, 5), IRON, t, [59, 114], [69, 124], 0.3);
    });
    skull(x, t, 60, 70, 26, { eyes: 1.2 });
    obj(x, ellipseP(60, 56, 34, 6.5), IRON, t, [26, 50], [94, 62], 0.6);
    obj(x, smoothP([[34, 56], [36, 40], [60, 28], [84, 40], [86, 56]], 0.4), IRON, t, A, [90, 58], 1);
    obj(x, rrectP(57, 52, 6, 22, 2), IRON, t, [57, 52], [63, 74], 0.3);
    for (const rx of [42, 52, 68, 78]) glint(x, rx, 48 - (rx === 52 || rx === 68 ? 3 : 0), 2.5, 0xffffff, 0.7);
    spec(x, 50, 38, 12, 3, -0.5, 0.55);
    return;
  }
  // A horned black greathelm, its slit burning.
  glow(x, 64, 64, 52, t.glow, 0.55);
  energy(x, flameP(64, 18, 9, 0.2), t, 64, 14, 22, 0.4);
  for (const sg of [-1, 1]) {
    obj(x, ribbonP([[64 + sg * 28, 44], [64 + sg * 44, 34], [64 + sg * 52, 18], [64 + sg * 48, 6]], 12, 2), BONE, t, A, B, 0.6);
  }
  const helm = smoothP([[36, 32], [64, 22], [92, 32], [98, 76], [90, 106], [38, 106], [30, 76]], 0.35);
  obj(x, helm, BLACK_IRON, t, A, B, 1.4);
  const slit = new Path2D();
  slit.addPath(rrectP(40, 56, 48, 7, 3));
  slit.addPath(rrectP(60.5, 56, 7, 30, 3));
  hole(x, slit, t, 64, 62, 30, 1);
  for (const sg of [-1, 1]) glint(x, 64 + sg * 14, 59.5, 6, t.core, 1);
  line(x, [[64, 26], [64, 54]], 2, 'rgba(160,170,180,.35)');
  for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) ink(x, circleP(64 + sg * (14 + (i % 2) * 7), 92 + i * 4, 1.8));
  spec(x, 48, 38, 12, 3, -0.5, 0.5);
};

const rvbones: Glyph = (x, t) => {
  // Loose bones pulled back together into a light.
  glow(x, 64, 64, 34, t.glow, 1);
  energy(x, circleP(64, 64, 8), t, 64, 64, 10, 0.6);
  const A: Pt = [20, 20];
  const B: Pt = [108, 108];
  const pieces: Array<[number, number]> = [[64, 22], [104, 50], [96, 98], [34, 100], [22, 50]];
  for (const [px, py] of pieces) {
    const dx = 64 - px;
    const dy = 64 - py;
    const l = Math.hypot(dx, dy);
    faint(x, pathOf([[px + (dx / l) * 14, py + (dy / l) * 14], [64 - (dx / l) * 14, 64 - (dy / l) * 14]]), t, 2.2, 0.85);
  }
  skull(x, t, 64, 20, 12, { eyes: 1 });
  obj(x, boneP([94, 40], [114, 58], 7), BONE, t, A, B, 0.4);
  obj(x, boneP([84, 104], [108, 92], 7), BONE, t, A, B, 0.4);
  obj(x, ribbonP([[22, 92], [30, 104], [42, 110], [50, 106]], 7, 4), BONE, t, A, B, 0.4);
  obj(x, smoothP([[12, 46], [32, 44], [30, 52], [22, 58], [14, 54]], 0.4), BONE, t, A, B, 0.4);
  for (const [gx, gy] of [[22, 52], [26, 50]] as const) line(x, [[gx, gy - 3], [gx, gy + 2]], 1.2, 'rgba(10,7,6,.8)');
};

// ---------------------------------------------------------------------------
// Blight
// ---------------------------------------------------------------------------

const rvwilt: Glyph = (x, t) => {
  // A sword wilting like a stem, bile at its tip.
  sigil(x, t, 64, 58, 44, 44, 9, 0.45);
  const A: Pt = [30, 30];
  const B: Pt = [98, 98];
  obj(x, ribbonP([[54, 86], [54, 66], [57, 48], [66, 36], [80, 36], [90, 48], [93, 66]], 12, 2), IRON, t, A, B, 0.8);
  spec(x, 58, 54, 10, 2, -1.3, 0.5);
  for (const [sx, sy] of [[72, 38], [88, 54], [56, 62]] as const) ink(x, ellipseP(sx, sy, 3, 2), 0.5);
  obj(x, rrectP(36, 84, 36, 7, 3), IRON, t, [36, 84], [72, 91], 0.4);
  obj(x, rrectP(50, 91, 8, 18, 2), LEATHER, t, [50, 91], [58, 109], 0.3);
  obj(x, circleP(54, 112, 5), IRON, t, [49, 107], [59, 117], 0.3);
  energy(x, dropP(94, 80, 4.5), t, 94, 78, 8, 0.5);
  energy(x, dropP(95, 98, 3.4), t, 95, 96, 6, 0.5);
};

const rvrose: Glyph = (x, t) => {
  // A rose rotting on its stem.
  glow(x, 82, 58, 48, t.glow, 0.75);
  const A: Pt = [30, 24];
  const B: Pt = [110, 110];
  obj(x, ribbonP([[34, 120], [36, 96], [42, 70], [54, 46], [72, 30], [90, 30], [100, 40]], 8, 6), STEM, t, A, B, 0.6);
  for (const [tx, ty, a] of [[37, 96, 2.9], [44, 66, -0.5], [62, 38, -1.6]] as const) {
    obj(x, polyP([[tx, ty - 3.5], [tx + Math.cos(a) * 8, ty + Math.sin(a) * 8], [tx, ty + 3.5]]), STEM, t, A, B, 0.2);
  }
  obj(x, smoothP([[42, 84], [26, 72], [16, 76], [26, 90], [40, 90]], 0.45), STEM, t, A, B, 0.4);
  line(x, [[40, 88], [22, 78]], 1.4, 'rgba(10,7,6,.6)');
  // The head, hung over and going to rot.
  const petals: Pt[][] = [
    [[74, 48], [98, 34], [120, 50], [116, 76], [96, 90], [76, 80]],
    [[80, 52], [100, 42], [114, 56], [108, 76], [88, 80]],
    [[88, 56], [102, 52], [106, 66], [94, 74]],
  ];
  for (const pts of petals) obj(x, smoothP(pts, 0.5), ROSE, t, [74, 34], [120, 90], 0.8);
  line(x, [[90, 62], [98, 60], [100, 66]], 1.6, 'rgba(10,7,6,.6)');
  for (const [mx, my, r] of [[108, 66, 5.5], [88, 80, 4], [112, 50, 3.4], [80, 64, 3]] as const) energy(x, circleP(mx, my, r), t, mx, my, r * 1.6, 0.5);
  obj(x, smoothP([[94, 96], [106, 100], [100, 108], [90, 104]], 0.5), ROSE, t, [90, 96], [106, 108], 0.4);
  obj(x, smoothP([[66, 106], [80, 104], [76, 114], [66, 114]], 0.5), ROSE, t, [66, 104], [80, 114], 0.4);
  energy(x, dropP(104, 96, 3.6), t, 104, 94, 7, 0.5);
};

const rvflay: Glyph = (x, t) => {
  // A hooked flaying knife, a strip of hide curling off its edge.
  glow(x, 74, 54, 44, t.glow, 0.5);
  const A: Pt = [30, 20];
  const B: Pt = [100, 100];
  obj(x, capsuleP([42, 86], [22, 110], 11), BONE, t, A, B, 0.5);
  for (const [bx, by] of [[36, 94], [30, 102]] as const) obj(x, capsuleP([bx - 4, by - 4], [bx + 4, by + 4], 4), LEATHER, t, A, B, 0.2);
  const blade = smoothP([[38, 82], [50, 60], [70, 40], [96, 28], [114, 30], [100, 38], [84, 52], [68, 72], [52, 92]], 0.35);
  obj(x, blade, IRON, t, A, B, 0.9);
  ray(x, smoothP([[54, 88], [68, 70], [84, 54], [100, 40], [112, 32]], 0.5, false), t, 1.8);
  obj(x, ribbonP([[86, 54], [96, 64], [100, 80], [92, 92], [82, 90], [84, 80], [90, 78]], 8, 3), HIDE, t, [80, 50], [104, 94], 0.5);
  line(x, [[95, 66], [97, 80], [91, 88]], 1.2, 'rgba(10,7,6,.55)');
  for (const [dx, dy, r] of [[84, 100, 3.6], [96, 110, 3]] as const) {
    obj(x, dropP(dx, dy, r), BLOOD, t, [dx - r, dy - r * 2], [dx + r, dy + r], 0.2);
  }
  glint(x, 112, 31, 6, t.core, 1);
};

const rvglob: Glyph = (x, t, v) => {
  const k = v % 4;
  if (k === 0) {
    // A glob of bile with a skull's face, in flight.
    glow(x, 74, 54, 46, t.glow, 0.6);
    x.save();
    x.globalAlpha = 0.9;
    energy(x, ribbonP([[12, 116], [24, 102], [40, 88], [56, 74], [70, 60]], 2, 30), t, 56, 72, 60, 0.3);
    x.restore();
    const blob = smoothP([[74, 28], [94, 34], [102, 52], [98, 72], [82, 82], [62, 78], [52, 62], [56, 40]], 0.5);
    energy(x, blob, t, 80, 50, 36, 0.4);
    for (const sg of [-1, 1]) ink(x, ellipseP(78 + sg * 9, 50, 5, 6.5, sg * 0.3), 0.8);
    ink(x, polyP([[78, 58], [75, 63], [81, 63]]), 0.75);
    for (let i = -1; i <= 1; i++) ink(x, rrectP(75 + i * 6, 67, 3.4, 5, 1), 0.7);
    for (const [bx, by, r] of [[64, 44, 2.4], [92, 64, 2], [88, 38, 1.6]] as const) glint(x, bx, by, r * 2.4, t.core, 0.9);
    energy(x, dropP(60, 92, 3.6), t, 60, 90, 6, 0.5);
    energy(x, dropP(40, 104, 3), t, 40, 102, 5, 0.5);
    return;
  }
  if (k === 1) {
    // A ring of bile bursting out of the ground.
    glow(x, 64, 78, 54, t.glow, 0.55);
    const ring = new Path2D();
    ring.ellipse(64, 82, 46, 16, 0, 0, TAU);
    ray(x, ring, t, 3.2);
    energy(x, ellipseP(64, 82, 16, 5.5), t, 64, 82, 18, 0.5);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.2;
      const gx = 64 + Math.cos(a) * 46;
      const gy = 82 + Math.sin(a) * 16;
      const front = Math.sin(a) > 0;
      const r = front ? 6.5 : 4.5;
      x.save();
      x.globalAlpha = front ? 1 : 0.75;
      energy(x, smoothP([[gx, gy - r * 3.2], [gx + r, gy - r * 0.8], [gx + r * 0.7, gy + r * 0.6], [gx - r * 0.7, gy + r * 0.6], [gx - r, gy - r * 0.8]], 0.5), t, gx, gy - r, r * 2.4, 0.45);
      x.restore();
    }
    for (const [dx, dy, r] of [[30, 40, 3.6], [98, 36, 3.2], [64, 30, 4], [46, 54, 2.6], [84, 52, 2.6]] as const) energy(x, circleP(dx, dy, r), t, dx, dy, r * 1.5, 0.5);
    return;
  }
  if (k === 2) {
    // A plague cloud with a face, flies round it.
    glow(x, 64, 62, 50, t.glow, 0.75);
    // Puffs back to front, so the cloud has depth; the face is on the front one.
    for (const [cx, cy, r] of [[64, 32, 15], [36, 62, 19], [92, 62, 19], [48, 86, 17], [80, 86, 17], [64, 62, 26]] as const) {
      obj(x, circleP(cx, cy, r), MIASMA, t, [cx - r, cy - r], [cx + r, cy + r], r / 18);
    }
    for (const sg of [-1, 1]) hole(x, ellipseP(64 + sg * 10, 58, 6.5, 8, sg * 0.3), t, 64 + sg * 10, 58, 10, 1);
    for (const sg of [-1, 1]) glint(x, 64 + sg * 10, 58, 4.5, t.core, 1);
    ink(x, polyP([[64, 66], [61, 71], [67, 71]]), 0.8);
    hole(x, smoothP([[54, 76], [64, 73], [74, 76], [71, 84], [57, 84]], 0.5), t, 64, 79, 12, 0.8);
    for (let i = -1; i <= 1; i++) line(x, [[64 + i * 5, 74], [64 + i * 5, 78]], 1.4, 'rgba(10,7,6,.8)');
    for (const [fx, fy] of [[18, 40], [108, 44], [24, 98], [104, 96], [70, 14], [40, 22]] as const) {
      ink(x, ellipseP(fx, fy, 2.6, 2));
      x.save();
      x.globalAlpha = 0.7;
      x.fillStyle = css(t.core);
      x.fill(ellipseP(fx - 2, fy - 2.4, 2, 1.1, -0.5));
      x.fill(ellipseP(fx + 2, fy - 2.4, 2, 1.1, 0.5));
      x.restore();
    }
    return;
  }
  // One bubbling drop of bile.
  glow(x, 64, 66, 44, t.glow, 0.6);
  energy(x, dropP(64, 72, 30), t, 58, 70, 40, 0.4);
  for (const [bx, by, r] of [[56, 78, 6], [72, 64, 4.5], [64, 88, 3.4], [76, 82, 3]] as const) {
    x.save();
    x.strokeStyle = css(lift(t.core, 0.4), 0.8);
    x.lineWidth = 1.4;
    x.stroke(circleP(bx, by, r));
    x.restore();
    glint(x, bx - r * 0.35, by - r * 0.35, r * 0.7, 0xffffff, 0.8);
  }
};

const rvsigil: Glyph = (x, t, v) => {
  const k = v % 4;
  if (k === 0) {
    // Three curse rings stacked, each over the last.
    for (const [cy, a] of [[90, 0.6], [64, 0.8], [38, 1]] as const) sigil(x, t, 64, cy, 42, 15, 9, a);
    const stave = new Path2D();
    stave.moveTo(64, 30);
    stave.lineTo(64, 98);
    faint(x, stave, t, 2.6, 0.7);
    energy(x, polyP([[64, 28], [70, 38], [64, 48], [58, 38]]), t, 64, 38, 10, 0.5);
    return;
  }
  if (k === 1) {
    // A curse ring bleeding into its heart.
    sigil(x, t, 64, 58, 40, 40, 9, 1);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.5;
      const p = new Path2D();
      p.moveTo(64 + Math.cos(a) * 26, 58 + Math.sin(a) * 26);
      p.quadraticCurveTo(64 + Math.cos(a + 0.4) * 16, 58 + Math.sin(a + 0.4) * 16, 64 + Math.cos(a) * 10, 60 + Math.sin(a) * 10);
      faint(x, p, t, 1.8, 0.85);
    }
    obj(x, dropP(64, 62, 12), BLOOD, t, [52, 40], [76, 74], 0.6);
    glint(x, 60, 56, 6, 0xffd0c8, 0.8);
    for (const [dx, dy, r] of [[58, 104, 3.6], [72, 112, 3]] as const) obj(x, dropP(dx, dy, r), BLOOD, t, [dx - r, dy - r * 2], [dx + r, dy + r], 0.2);
    return;
  }
  if (k === 2) {
    // A cracked ring, spitting its curse to two more.
    sigil(x, t, 64, 44, 28, 28, 7, 1);
    line(x, [[52, 20], [60, 34], [54, 44], [64, 56], [60, 70]], 2.6);
    sigil(x, t, 26, 96, 15, 15, 5, 0.9);
    sigil(x, t, 102, 96, 15, 15, 5, 0.9);
    for (const sg of [-1, 1]) {
      const p = pathOf([[64 + sg * 18, 64], [64 + sg * 24, 72], [64 + sg * 22, 78], [64 + sg * 30, 84]]);
      ray(x, p, t, 2.6);
    }
    return;
  }
  // A great ring with an eye in it.
  sigil(x, t, 64, 64, 44, 44, 11, 1);
  const eye = smoothP([[34, 64], [64, 46], [94, 64], [64, 82]], 0.6);
  obj(x, eye, BONE, t, [34, 46], [94, 82], 0.7);
  energy(x, circleP(64, 64, 12), t, 64, 64, 14, 0.5);
  ink(x, ellipseP(64, 64, 3.2, 10));
  glint(x, 59, 59, 4, 0xffffff, 0.9);
};

const rvface: Glyph = (x, t, v) => {
  const A: Pt = [30, 14];
  const B: Pt = [98, 114];
  if (v % 2 === 0) {
    // A face screaming, terror lines round it.
    glow(x, 64, 64, 50, t.glow, 0.55);
    for (const sg of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y0 = 36 + i * 22;
        const p = pathOf([[64 + sg * 40, y0], [64 + sg * 48, y0 + 5], [64 + sg * 44, y0 + 9], [64 + sg * 54, y0 + 14]]);
        ray(x, p, t, 2.4 - i * 0.3);
      }
    }
    const face = smoothP([[64, 12], [86, 22], [94, 52], [88, 90], [64, 118], [40, 90], [34, 52], [42, 22]], 0.45);
    obj(x, face, PALE, t, A, B, 1.3);
    for (const sg of [-1, 1]) {
      hole(x, ellipseP(64 + sg * 14, 50, 7, 11, sg * 0.25), t, 64 + sg * 14, 52, 10, 0.8);
      glint(x, 64 + sg * 14, 52, 3.5, t.core, 1);
      line(x, [[64 + sg * 6, 34], [64 + sg * 20, 30]], 2, 'rgba(10,7,6,.7)');
    }
    hole(x, ellipseP(64, 92, 10, 17), t, 64, 96, 16, 0.85);
    line(x, [[60, 66], [64, 74], [68, 66]], 1.6, 'rgba(10,7,6,.6)');
    return;
  }
  // A face with spiral eyes and a crooked mouth.
  glow(x, 64, 64, 50, t.glow, 0.5);
  const orbit = new Path2D();
  orbit.ellipse(64, 30, 40, 12, 0, Math.PI * 0.95, Math.PI * 2.05);
  faint(x, orbit, t, 2.4, 0.9);
  const face = smoothP([[64, 22], [90, 30], [98, 60], [88, 96], [64, 112], [40, 96], [30, 60], [38, 30]], 0.45);
  obj(x, face, PALE, t, A, B, 1.3);
  for (const sg of [-1, 1]) {
    const cx = 64 + sg * 15;
    const cy = 58;
    ink(x, circleP(cx, cy, 11), 0.9);
    const sp = new Path2D();
    for (let j = 0; j <= 28; j++) {
      const a = sg * j * 0.42;
      const r = 1 + j * 0.34;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (j) sp.lineTo(px, py);
      else sp.moveTo(px, py);
    }
    ray(x, sp, t, 1.8);
  }
  line(x, [[46, 90], [54, 86], [62, 92], [72, 86], [82, 90]], 3.4);
  for (const [sx, sy] of [[24, 30], [104, 30], [64, 18]] as const) glint(x, sx, sy, 6, t.core, 1);
};

const rvcorpse: Glyph = (x, t) => {
  // A body bursting: ribs splayed, splinters and bile flying.
  glow(x, 64, 64, 54, t.glow, 0.7);
  x.save();
  x.globalAlpha = 0.95;
  energy(x, starP(64, 64, 9, 16, 46, 0.1), t, 64, 64, 46, 0.3);
  x.restore();
  const A: Pt = [20, 20];
  const B: Pt = [108, 108];
  for (const sg of [-1, 1]) {
    placed(x, 64, 64, 1, sg * 0.35, () => {
      for (let i = 0; i < 3; i++) {
        const y = 48 + i * 12;
        const pts: Pt[] = [[64 + sg * 8, y], [64 + sg * 22, y - 4], [64 + sg * 32, y + 4], [64 + sg * 30, y + 14]];
        obj(x, ribbonP(pts, 7, 4), BONE, t, A, B, 0.4);
      }
    });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.5;
    obj(x, shardP(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48, 16, 6, a), BONE, t, A, B, 0.3);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 1.1;
    const gx = 64 + Math.cos(a) * 36;
    const gy = 64 + Math.sin(a) * 36;
    energy(x, circleP(gx, gy, 4.5), t, gx, gy, 7, 0.5);
  }
  energy(x, circleP(64, 64, 9), t, 64, 64, 12, 0.6);
};

const rvdoom: Glyph = (x, t, v) => {
  const k = v % 3;
  const A: Pt = [30, 20];
  const B: Pt = [98, 108];
  if (k === 0) {
    // A black orb cracking inside a burning fuse ring.
    glow(x, 64, 64, 50, t.glow, 0.5);
    for (let i = 0; i < 12; i++) {
      const a = -Math.PI / 2 + (i / 12) * TAU;
      const p = pathOf([[64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44], [64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52]]);
      if (i < 4) ray(x, p, t, 3.2);
      else line(x, [[64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44], [64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52]], 3.6, 'rgba(10,7,6,.85)');
    }
    const fuse = new Path2D();
    fuse.arc(64, 64, 40, -Math.PI / 2, -Math.PI / 2 + TAU * 0.3);
    ray(x, fuse, t, 3);
    const fa = -Math.PI / 2 + TAU * 0.3;
    energy(x, starP(64 + Math.cos(fa) * 40, 64 + Math.sin(fa) * 40, 6, 3, 9), t, 64 + Math.cos(fa) * 40, 64 + Math.sin(fa) * 40, 10, 0.5);
    obj(x, circleP(64, 66, 26), BLACK_IRON, t, [40, 42], [90, 92], 1.2);
    const cracks = pathOf([[50, 52], [58, 62], [54, 72], [62, 80]]);
    cracks.addPath(pathOf([[58, 62], [72, 58], [80, 66]]));
    cracks.addPath(pathOf([[72, 58], [76, 46]]));
    ray(x, cracks, t, 2);
    spec(x, 54, 52, 9, 3, -0.6, 0.6);
    return;
  }
  if (k === 1) {
    // A cracked bone hourglass, leaking its dust.
    glow(x, 64, 64, 46, t.glow, 0.45);
    const glass = smoothP([[44, 28], [84, 28], [70, 60], [70, 68], [84, 100], [44, 100], [58, 68], [58, 60]], 0.3);
    x.save();
    x.fillStyle = css(sink(t.dark, 0.2), 0.75);
    x.fill(glass);
    x.restore();
    obj(x, smoothP([[52, 44], [76, 44], [66, 58], [62, 58]], 0.4), OLD_BONE, t, [50, 40], [78, 60], 0.3);
    obj(x, smoothP([[50, 98], [64, 80], [78, 98]], 0.4), OLD_BONE, t, [50, 80], [78, 100], 0.3);
    faint(x, pathOf([[64, 60], [64, 84]]), t, 1.4, 0.9);
    x.save();
    x.strokeStyle = css(lift(t.glow, 0.4), 0.8);
    x.lineWidth = 1.6;
    x.stroke(glass);
    x.restore();
    for (const sg of [-1, 1]) obj(x, boneP([64 + sg * 30, 26], [64 + sg * 30, 102], 6.5), BONE, t, A, B, 0.5);
    obj(x, ellipseP(64, 24, 36, 7), BONE, t, [28, 17], [100, 31], 0.6);
    obj(x, ellipseP(64, 104, 36, 7), BONE, t, [28, 97], [100, 111], 0.6);
    line(x, [[74, 80], [78, 86], [76, 92]], 1.8);
    for (const [dx, dy] of [[82, 88], [88, 96], [92, 106], [96, 114]] as const) energy(x, circleP(dx, dy, 1.8), t, dx, dy, 3, 0.5);
    return;
  }
  // A bone candle melting down, its flame guttering.
  glow(x, 64, 40, 40, t.glow, 0.6);
  energy(x, flameP(66, 36, 7.5, 0.6), t, 66, 32, 18, 0.45);
  line(x, [[64, 44], [64, 50]], 2);
  const body = smoothP([[50, 52], [64, 48], [78, 52], [79, 98], [64, 102], [49, 98]], 0.25);
  obj(x, body, WAX, t, [48, 48], [80, 102], 0.8);
  for (const [rx, len] of [[54, 22], [70, 32], [76, 16]] as const) obj(x, capsuleP([rx, 52], [rx, 52 + len], 5), WAX, t, [rx - 3, 52], [rx + 3, 52 + len], 0.3);
  obj(x, smoothP([[30, 104], [50, 96], [78, 96], [98, 104], [80, 112], [46, 112]], 0.45), WAX, t, [30, 96], [98, 112], 0.6);
  const smoke = new Path2D();
  smoke.moveTo(72, 18);
  smoke.bezierCurveTo(78, 12, 70, 8, 78, 2);
  faint(x, smoke, t, 1.6, 0.6);
};

const rvfray: Glyph = (x, t) => {
  // A round ward coming apart into loose threads.
  glow(x, 64, 60, 46, t.glow, 0.45);
  x.save();
  x.clip(polyP([[0, 0], [128, 0], [128, 40], [104, 54], [100, 68], [86, 76], [82, 90], [66, 96], [52, 106], [0, 128]]));
  obj(x, circleP(64, 58, 40), IRON, t, [24, 18], [104, 98], 1.2);
  obj(x, circleP(64, 58, 32), CLOTH, t, [32, 26], [96, 90], 1);
  const r = new Path2D();
  r.moveTo(64, 34);
  r.lineTo(64, 82);
  r.moveTo(42, 50);
  r.lineTo(64, 60);
  r.lineTo(86, 50);
  ray(x, r, t, 2.4);
  x.restore();
  const edge: Pt[] = [[104, 54], [100, 68], [86, 76], [82, 90], [66, 96], [52, 106]];
  edge.forEach(([ex, ey], i) => {
    const p = new Path2D();
    p.moveTo(ex - 2, ey);
    p.bezierCurveTo(ex + 4, ey + 8, ex - 6, ey + 14, ex + (i % 2 ? 4 : -2), ey + 22 - i);
    x.save();
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(6,5,6,.9)';
    x.lineWidth = 4;
    x.stroke(p);
    x.strokeStyle = css(0x6a6a76);
    x.lineWidth = 2;
    x.stroke(p);
    x.restore();
  });
  for (const [sx, sy] of [[96, 84], [76, 104], [108, 72]] as const) glint(x, sx, sy, 5, t.core, 0.8);
};

// ---------------------------------------------------------------------------
// Grave Pact
// ---------------------------------------------------------------------------

const rvtether: Glyph = (x, t, v) => {
  const k = v % 3;
  if (k === 0) {
    // Life drawn from a heart into a bone hand.
    glow(x, 64, 64, 50, t.glow, 0.45);
    const beam = smoothP([[42, 80], [48, 70], [56, 72], [62, 62], [70, 60]], 0.5, false);
    ray(x, beam, t, 4.6);
    for (const [dx, dy] of [[50, 70], [60, 64]] as const) energy(x, circleP(dx, dy, 3), t, dx, dy, 5, 0.6);
    obj(x, heartP(32, 90, 21), BLOOD, t, [12, 70], [52, 110], 1);
    spec(x, 24, 80, 6, 3, -0.6, 0.6);
    boneHand(x, t, 102, 26, 1.1, Math.PI * 1.25, 0.3, 20);
    return;
  }
  if (k === 1) {
    // A bone hand wringing a heart dry.
    glow(x, 60, 66, 46, t.glow, 0.55);
    for (const [dx, dy, r, a] of [[30, 40, 4, -2.4], [24, 70, 3.6, 3.0], [40, 100, 3.6, 2.2], [60, 26, 3.2, -1.8]] as const) {
      energy(x, ribbonP([[52 + Math.cos(a) * 6, 64 + Math.sin(a) * 6], [dx, dy]], 5, 1), t, dx, dy, 10, 0.5);
      obj(x, dropP(dx, dy, r), BLOOD, t, [dx - r, dy - r * 2], [dx + r, dy + r], 0.2);
    }
    obj(x, heartP(56, 64, 28), BLOOD, t, [28, 36], [84, 96], 1.2);
    const A: Pt = [40, 40];
    const B: Pt = [110, 100];
    obj(x, smoothP([[82, 44], [100, 46], [108, 64], [100, 88], [82, 90], [76, 66]], 0.4), BONE, t, A, B, 0.7);
    part(x, boneP([104, 60], [124, 52], 7, false, true), BONE, t, A, B);
    part(x, boneP([104, 72], [124, 70], 6, false, true), BONE, t, A, B);
    for (let i = 0; i < 4; i++) {
      const y = 50 + i * 11;
      const len = [30, 36, 34, 26][i]!;
      let p: Pt = [84, y];
      let a = Math.PI + 0.1 - i * 0.04;
      for (const [seg, w] of [[len * 0.44, 6.2], [len * 0.32, 5.6], [len * 0.24, 5]] as const) {
        const q: Pt = [p[0] + Math.cos(a) * seg, p[1] + Math.sin(a) * seg];
        part(x, capsuleP(p, q, w), BONE, t, A, B);
        p = q;
        a += 0.32;
      }
    }
    return;
  }
  // Two souls, chained.
  glow(x, 64, 60, 50, t.glow, 0.45);
  soul(x, t, [[10, 100], [18, 84], [28, 66], [32, 48]], 13);
  soul(x, t, [[118, 100], [110, 84], [100, 66], [96, 48]], 13);
  const A: Pt = [30, 50];
  const B: Pt = [98, 100];
  for (let i = 0; i < 6; i++) {
    const k2 = (i + 0.5) / 6;
    const cx = 40 + k2 * 48;
    const cy = 62 + Math.sin(k2 * Math.PI) * 18;
    const rot = Math.cos(k2 * Math.PI) * -0.6;
    const p = i % 2 ? ringP(cx, cy, 6, 3.4, 2.6, rot) : ringP(cx, cy, 7, 5, 2.8, rot);
    obj(x, p, BLACK_IRON, t, A, B, 0.3);
  }
};

const rvward: Glyph = (x, t) => {
  // A bone-rimmed shield whose face is a spirit.
  glow(x, 64, 62, 48, t.glow, 0.55);
  const shield = smoothP([[64, 14], [98, 22], [104, 50], [92, 86], [64, 114], [36, 86], [24, 50], [30, 22]], 0.4);
  x.save();
  x.globalAlpha = 0.85;
  energy(x, shield, t, 64, 56, 60, 0.3);
  x.restore();
  const rim = new Path2D();
  rim.addPath(shield);
  obj(x, ribbonP([[30, 22], [64, 14], [98, 22]], 8, 8), BONE, t, [30, 12], [98, 30], 0.5);
  x.save();
  x.lineJoin = 'round';
  x.strokeStyle = 'rgba(6,5,6,.95)';
  x.lineWidth = 9;
  x.stroke(rim);
  x.strokeStyle = css(0xcdc3a3);
  x.lineWidth = 5;
  x.stroke(rim);
  x.strokeStyle = css(0xf6eed6, 0.7);
  x.lineWidth = 1.4;
  x.translate(-0.8, -0.8);
  x.stroke(rim);
  x.restore();
  for (const sg of [-1, 1]) ink(x, ellipseP(64 + sg * 13, 54, 7, 11, sg * 0.3), 0.85);
  ink(x, ellipseP(64, 84, 7, 11), 0.75);
  for (const [rx, ry] of [[64, 18], [101, 36], [27, 36], [64, 112]] as const) energy(x, circleP(rx, ry, 3.2), t, rx, ry, 5, 0.6);
};

const rvsoul: Glyph = (x, t, v) => {
  const k = v % 3;
  if (k === 0) {
    // A soul rising out of a fallen skull.
    glow(x, 64, 64, 48, t.glow, 0.5);
    soul(x, t, [[44, 98], [54, 84], [60, 66], [72, 50], [78, 36]], 15);
    x.save();
    x.translate(42, 104);
    x.rotate(-0.5);
    skullSide(x, t, 0, 0, 15, 0.5);
    x.restore();
    for (const [sx, sy] of [[98, 30], [92, 60], [56, 30]] as const) glint(x, sx, sy, 5, t.core, 0.9);
    return;
  }
  if (k === 1) {
    // A soul in a bone lantern.
    glow(x, 64, 70, 40, t.glow, 0.9);
    const A: Pt = [30, 20];
    const B: Pt = [98, 112];
    obj(x, ringP(64, 12, 7, 7, 3), BLACK_IRON, t, [56, 4], [72, 20], 0.3);
    for (const sg of [-1, 1]) obj(x, ribbonP([[64 + sg * 9, 30], [64 + sg * 30, 52], [64 + sg * 32, 80], [64 + sg * 22, 100]], 5, 5), OLD_BONE, t, A, B, 0.4);
    soul(x, t, [[64, 96], [60, 86], [66, 76], [64, 66]], 12);
    for (const sg of [-1, 1]) {
      obj(x, ribbonP([[64 + sg * 4, 30], [64 + sg * 16, 52], [64 + sg * 18, 80], [64 + sg * 12, 100]], 5, 5), BONE, t, A, B, 0.4);
      obj(x, ribbonP([[64 + sg * 12, 28], [64 + sg * 40, 54], [64 + sg * 42, 80], [64 + sg * 30, 104]], 6, 6), BONE, t, A, B, 0.4);
    }
    obj(x, smoothP([[46, 30], [64, 20], [82, 30], [64, 34]], 0.4), BONE, t, [46, 20], [82, 34], 0.5);
    obj(x, ellipseP(64, 106, 34, 7), BONE, t, [30, 99], [98, 113], 0.6);
    return;
  }
  // A sheaf of souls bound with bone.
  glow(x, 64, 58, 48, t.glow, 0.5);
  soul(x, t, [[60, 104], [54, 84], [44, 62], [34, 42]], 12);
  soul(x, t, [[68, 104], [74, 84], [84, 62], [94, 42]], 12);
  soul(x, t, [[64, 106], [64, 84], [64, 56], [64, 32]], 13);
  const A: Pt = [44, 86];
  const B: Pt = [84, 100];
  obj(x, ribbonP([[46, 88], [64, 92], [82, 88]], 8, 8), BONE, t, A, B, 0.4);
  obj(x, circleP(64, 92, 5), BONE, t, [59, 87], [69, 97], 0.3);
};

const rvpact: Glyph = (x, t, v) => {
  const A: Pt = [30, 16];
  const B: Pt = [98, 112];
  if (v % 2 === 0) {
    // An open palm, cut across.
    glow(x, 64, 60, 48, t.glow, 0.45);
    obj(x, capsuleP([64, 108], [64, 90], 22), PALE, t, A, B, 0.8);
    const lens = [26, 32, 30, 24];
    for (let i = 0; i < 4; i++) {
      const bx = 46 + i * 12;
      obj(x, capsuleP([bx, 60], [bx + (i - 1.5) * 3, 60 - lens[i]!], 10.5), PALE, t, A, B, 0.5);
      line(x, [[bx - 3 + (i - 1.5) * 1.6, 60 - lens[i]! * 0.55], [bx + 3 + (i - 1.5) * 1.6, 60 - lens[i]! * 0.55]], 1.2, 'rgba(10,7,6,.5)');
    }
    obj(x, capsuleP([36, 84], [24, 60], 11), PALE, t, A, B, 0.5);
    obj(x, smoothP([[38, 58], [90, 58], [92, 86], [80, 100], [48, 100], [36, 86]], 0.4), PALE, t, A, B, 1);
    ray(x, pathOf([[44, 90], [62, 76], [86, 66]]), t, 3.4);
    return;
  }
  // A contract with a blood seal.
  glow(x, 64, 64, 48, t.glow, 0.45);
  obj(x, rrectP(30, 24, 68, 80, 3), PARCH, t, [30, 24], [98, 104], 1);
  obj(x, capsuleP([24, 22], [104, 22], 11), PARCH, t, [24, 16], [104, 28], 0.6);
  obj(x, capsuleP([24, 106], [104, 106], 11), PARCH, t, [24, 100], [104, 112], 0.6);
  for (let i = 0; i < 6; i++) {
    const w = i === 5 ? 26 : 48 - (i % 2) * 8;
    line(x, [[38, 36 + i * 9], [38 + w, 36 + i * 9]], 2, 'rgba(40,24,14,.7)');
  }
  for (const [rx, ry] of [[44, 78], [56, 82], [64, 92]] as const) obj(x, dropP(rx, ry, 3), BLOOD, t, [rx - 3, ry - 6], [rx + 3, ry + 3], 0.2);
  obj(x, ribbonP([[82, 90], [76, 104], [72, 116]], 7, 4), BLOOD, t, [70, 86], [86, 116], 0.3);
  obj(x, ribbonP([[86, 90], [92, 104], [96, 114]], 7, 4), BLOOD, t, [80, 86], [98, 116], 0.3);
  obj(x, smoothP([[84, 74], [96, 78], [100, 88], [94, 98], [82, 100], [72, 92], [72, 80]], 0.5), BLOOD, t, [70, 72], [100, 100], 0.6);
  energy(x, starP(85, 87, 5, 3.4, 8.5), t, 85, 87, 10, 0.5);
};

const rvgrave: Glyph = (x, t) => {
  // Hands bursting up out of a rift; a hood sinking into it.
  glow(x, 64, 80, 56, t.glow, 0.8);
  mound(x, t, 64, 92, 62, 12);
  const rift = ellipseP(64, 96, 34, 10);
  hole(x, rift, t, 64, 92, 30, 1);
  const rim = new Path2D();
  rim.ellipse(64, 96, 34, 10, 0, 0, TAU);
  ray(x, rim, t, 2.6);
  const hood = smoothP([[48, 98], [50, 80], [64, 68], [78, 80], [80, 98]], 0.45);
  obj(x, hood, CLOTH, t, [46, 66], [82, 98], 0.8);
  hole(x, smoothP([[56, 96], [58, 84], [64, 78], [70, 84], [72, 96]], 0.45), t, 64, 90, 10, 0.4);
  for (const sg of [-1, 1]) glint(x, 64 + sg * 4, 88, 3, t.core, 1);
  boneHand(x, t, 34, 96, 0.92, -0.42, 0.35, 18);
  boneHand(x, t, 94, 96, 0.92, 0.42, 0.35, 18);
  for (const [cx, cy, r] of [[22, 54, 4], [106, 50, 3.6], [64, 40, 3], [30, 34, 2.4], [98, 30, 2.6]] as const) {
    part(x, circleP(cx, cy, r), EARTH, t, [cx - r, cy - r], [cx + r, cy + r]);
  }
};

const rvhand: Glyph = (x, t, v) => {
  const A: Pt = [20, 20];
  const B: Pt = [108, 108];
  if (v % 2 === 0) {
    // A gaunt clawed hand, drinking through its fingertips.
    glow(x, 78, 44, 46, t.glow, 0.5);
    placed(x, 64, 64, 1, 0.5, () => {
      obj(x, capsuleP([62, 122], [62, 96], 20), PALE, t, A, B, 0.8);
      obj(x, smoothP([[44, 70], [80, 70], [82, 94], [72, 104], [52, 104], [42, 92]], 0.4), PALE, t, A, B, 1);
      obj(x, capsuleP([44, 92], [32, 70], 9), PALE, t, A, B, 0.4);
      const lens = [28, 34, 32, 26];
      for (let i = 0; i < 4; i++) {
        const bx = 47 + i * 10;
        const tip: Pt = [bx + (i - 1.5) * 4, 70 - lens[i]!];
        obj(x, capsuleP([bx, 72], tip, 8), PALE, t, A, B, 0.4);
        for (const kk of [0.35, 0.68]) ink(x, ellipseP(bx + (tip[0] - bx) * kk, 72 + (tip[1] - 72) * kk, 3.4, 1.2), 0.45);
        obj(x, polyP([[tip[0] - 3.4, tip[1] + 2], [tip[0], tip[1] - 8], [tip[0] + 3.4, tip[1] + 2]]), BLACK_IRON, t, A, B, 0.2);
        const vein = pathOf([[tip[0], tip[1] + 4], [bx + (tip[0] - bx) * 0.4, 72 + (tip[1] - 72) * 0.4], [60 + (i - 1.5) * 4, 90]]);
        ray(x, vein, t, 1.4);
      }
    });
    for (const [dx, dy, r] of [[110, 18, 3.6], [116, 40, 3], [98, 10, 3]] as const) energy(x, dropP(dx, dy, r), t, dx, dy - r, r * 2, 0.5);
    return;
  }
  // Two bone hands cradling a heart.
  glow(x, 64, 52, 46, t.glow, 0.7);
  obj(x, heartP(64, 52, 24), BLOOD, t, [40, 28], [88, 76], 1.1);
  spec(x, 54, 40, 7, 3, -0.6, 0.6);
  energy(x, smoothP([[62, 30], [58, 20], [64, 10], [66, 20], [70, 26]], 0.5), t, 64, 22, 12, 0.5);
  boneHand(x, t, 24, 108, 0.9, 0.62, 0.42, 22);
  boneHand(x, t, 104, 108, 0.9, -0.62, 0.42, 22);
};

const rvwraith: Glyph = (x, t, v) => {
  const A: Pt = [30, 10];
  const B: Pt = [98, 118];
  if (v % 2 === 0) {
    // A hooded wraith, a skull in the hood, flames round it.
    glow(x, 64, 60, 52, t.glow, 0.6);
    for (const [fx, fy, s, l] of [[22, 70, 9, -0.4], [106, 70, 9, 0.4], [30, 40, 7, -0.6], [98, 40, 7, 0.6]] as const) energy(x, flameP(fx, fy, s, l), t, fx, fy - s, s * 2.4, 0.45);
    const shroud = smoothP([[64, 8], [88, 26], [96, 56], [104, 92], [110, 118], [94, 108], [84, 120], [72, 108], [64, 122], [56, 108], [44, 120], [34, 108], [18, 118], [24, 92], [32, 56], [40, 26]], 0.35);
    obj(x, shroud, CLOTH, t, A, B, 1.4);
    hole(x, smoothP([[64, 22], [82, 38], [86, 64], [76, 78], [52, 78], [42, 64], [46, 38]], 0.45), t, 64, 54, 30, 0.4);
    skull(x, t, 64, 52, 17, { eyes: 1.3, m: OLD_BONE });
    return;
  }
  // A cracked gravestone, a soul climbing out of it.
  glow(x, 64, 52, 48, t.glow, 0.6);
  soul(x, t, [[64, 70], [70, 52], [62, 36], [66, 22]], 13);
  const stoneL = smoothP([[30, 106], [30, 44], [40, 30], [60, 24], [56, 44], [62, 60], [54, 76], [60, 106]], 0.3);
  const stoneR = smoothP([[64, 106], [66, 76], [74, 60], [66, 44], [70, 24], [88, 30], [98, 44], [98, 106]], 0.3);
  placed(x, 64, 106, 1, -0.08, () => obj(x, stoneL, STONE, t, [30, 24], [60, 106], 1));
  placed(x, 64, 106, 1, 0.08, () => obj(x, stoneR, STONE, t, [64, 24], [98, 106], 1));
  for (const [cx, cy] of [[42, 56], [84, 56]] as const) line(x, [[cx - 5, cy], [cx + 5, cy]], 2, 'rgba(10,7,6,.7)');
  mound(x, t, 64, 104, 56, 8);
};

const rvheart: Glyph = (x, t, v) => {
  const k = v % 3;
  if (k === 0) {
    // A heart bursting into a ring of blood.
    glow(x, 64, 64, 54, t.glow, 0.6);
    x.save();
    x.globalAlpha = 0.85;
    energy(x, starP(64, 64, 10, 22, 44, 0.15), t, 64, 64, 44, 0.3);
    x.restore();
    faint(x, circleP(64, 64, 46), t, 2.6, 0.8);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.2;
      const dx = 64 + Math.cos(a) * 46;
      const dy = 64 + Math.sin(a) * 46;
      placed(x, dx, dy, 1, a + Math.PI / 2, () => obj(x, dropP(64, 64, 5), BLOOD, t, [59, 55], [69, 69], 0.3));
    }
    obj(x, heartP(64, 64, 24), BLOOD, t, [40, 40], [88, 88], 1.1);
    spec(x, 54, 52, 7, 3, -0.6, 0.6);
    return;
  }
  if (k === 1) {
    // A cracked heart stitched shut, over a heartbeat line.
    glow(x, 64, 62, 50, t.glow, 0.5);
    ray(x, pathOf([[8, 70], [36, 70], [42, 58], [50, 84], [58, 44], [66, 92], [74, 70], [120, 70]]), t, 2.6);
    obj(x, heartP(64, 62, 30), BLOOD, t, [34, 32], [94, 92], 1.2);
    spec(x, 50, 46, 8, 3, -0.6, 0.6);
    const crack = pathOf([[64, 38], [58, 50], [68, 60], [60, 72], [66, 86]]);
    ray(x, crack, t, 2.4);
    for (const [sx, sy] of [[61, 46], [64, 60], [62, 76]] as const) {
      line(x, [[sx - 7, sy - 4], [sx + 7, sy + 4]], 3.6, 'rgba(6,5,6,.95)');
      line(x, [[sx - 7, sy - 4], [sx + 7, sy + 4]], 1.8, css(0xcdc3a3));
    }
    return;
  }
  // A heart behind ribs.
  glow(x, 64, 62, 50, t.glow, 0.9);
  obj(x, heartP(64, 64, 27), BLOOD, t, [37, 37], [91, 91], 1.1);
  spec(x, 52, 52, 8, 3, -0.6, 0.6);
  const A: Pt = [20, 20];
  const B: Pt = [108, 108];
  for (let i = 0; i < 2; i++) {
    const y = 42 + i * 26;
    for (const sg of [-1, 1]) obj(x, ribbonP([[64 + sg * 6, y], [64 + sg * 24, y - 5], [64 + sg * 40, y + 6], [64 + sg * 36, y + 20]], 6, 3.6), BONE, t, A, B, 0.4);
  }
  obj(x, smoothP([[60, 30], [68, 30], [67, 96], [64, 100], [61, 96]], 0.35), BONE, t, A, B, 0.5);
};

const rvscythe: Glyph = (x, t) => {
  // A bone-hafted scythe and the arc of its swing.
  glow(x, 64, 60, 50, t.glow, 0.5);
  x.save();
  x.globalAlpha = 0.85;
  const arc = new Path2D();
  const n = 20;
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const a = -0.6 + k * 2.8;
    const th = 16 * Math.sin(Math.PI * Math.pow(k, 0.7));
    outer.push([64 + Math.cos(a) * (48 + th * 0.3), 64 + Math.sin(a) * (48 + th * 0.3)]);
    inner.push([64 + Math.cos(a) * (48 - th), 64 + Math.sin(a) * (48 - th)]);
  }
  arc.addPath(polyP([...outer, ...inner.reverse()]));
  energy(x, arc, t, 64, 100, 60, 0.3);
  x.restore();
  const A: Pt = [30, 10];
  const B: Pt = [98, 118];
  obj(x, boneP([40, 116], [74, 20], 8), BONE, t, A, B, 0.6);
  for (const [bx, by] of [[52, 82], [62, 52]] as const) obj(x, capsuleP([bx - 5, by - 1], [bx + 5, by + 2], 4.5), LEATHER, t, A, B, 0.2);
  const blade = smoothP([[72, 22], [56, 12], [34, 12], [12, 26], [36, 22], [54, 28], [70, 34]], 0.4);
  obj(x, blade, BLACK_IRON, t, [12, 10], [72, 34], 0.8);
  ray(x, smoothP([[16, 25], [36, 19], [56, 22], [70, 30]], 0.5, false), t, 1.8);
  glint(x, 14, 26, 6, t.core, 1);
};

export const REVENANT_GLYPHS: Record<string, Glyph> = {
  rvlance,
  rvthrall,
  rvribs,
  rvskull,
  rvcolossus,
  rvshards,
  rvhelm,
  rvbones,
  rvwilt,
  rvrose,
  rvflay,
  rvglob,
  rvsigil,
  rvface,
  rvcorpse,
  rvdoom,
  rvfray,
  rvtether,
  rvward,
  rvsoul,
  rvpact,
  rvgrave,
  rvhand,
  rvwraith,
  rvheart,
  rvscythe,
};
