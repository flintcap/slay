/**
 * SLAY — the Rogue's own pictograms, spread into `GLYPHS` (`Glyphs.ts`).
 *
 * Same 128-unit canvas and painting rules as the shared set. Only `./Paint`
 * is imported at run time, so the shared module can spread this in without
 * a cycle. Every name starts `rg`, so the word fallback in `planFor` never
 * lands another class's skill on a Rogue picture.
 *
 * His steel is blackened, with one edge lit in the tree's light; his smoke is
 * violet-black with a pale rim; his venom glows.
 *
 *   rgblade    a stiletto. v0 alone, v1 two crossed in a scissor cut, v2 eaten
 *              by acid, v3 thrust out of the dark, v4 in a flurry of cuts,
 *              v5 one clean cut, v6 bleeding, v7 coated from a vial, v8 two
 *              blades meeting point to point and turning back.
 *   rgknives   v0 five in a fan, v1 a stream of thrown knives, v2 a ghost
 *              knife, v3 a starburst of tiny blades.
 *   rgneedle   v0 a venom dart, v1 a syringe, v2 a needle and nerve sparks,
 *              v3 a poisoned heart with a needle in it.
 *   rgflask    v0 a bubbling flask, v1 a vial tumbling through the air, v2 a
 *              pale antidote.
 *   rgvenom    a venom drop with a serpent's eye in it.
 *   rgadder    v0 an adder striking, v1 a cobra rising from its coils, v2 a
 *              serpent eating its own tail.
 *   rglotus    v0 a lotus of blades, v1 a sprout with venom on its leaves.
 *   rgrupture  a burst of venom flinging its drops.
 *   rgmiasma   v0 a cloud with a skull's face, v1 poisoned footprints, v2 a
 *              heart in a ring of smoke.
 *   rghood     the hood, face on. v0 eyes lit, v1 the cloak drawn across,
 *              v2 dissolving, v3 eyes shut behind a raised blade.
 *   rgtwin     hooded figures. v0 one and its shadow, v1 three, v2 two facing
 *              across a crack, v3 one stepping out of its afterimages.
 *   rgbomb     a smoke bomb with its fuse lit.
 *   rgeclipse  v0 a black sun whose light falls like a curtain, v1 a crescent
 *              round an hourglass, v2 a crescent crossed by a dagger.
 *   rgblink    v0 a swoop of smoke ending in a dagger, v1 a dagger between two
 *              rifts, v2 a soft boot trailing smoke.
 *   rgmark     v0 four blades closing on a point, v1 a cracked plate with its
 *              weak spot lit, v2 a dagger through a plate, v3 a dagger over a
 *              drained heart, v4 a dagger in a skull.
 *   rgtendon   a heel with a cut across it.
 *   rgdash     a pinwheel of blades spinning down a lane.
 *   rghalo     six knives turning in a ring.
 *   rgwaltz    four turning cuts round two blades driven in.
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
  mixC,
  polyP,
  rrectP,
  saturate,
  sink,
  smoothP,
  solid,
  spec,
  starP,
} from './Paint';

const BLADE = mat([0x0e1115, 0x2a323c, 0x5e6a76, 0xaebdca, 0xf6fbff], 0.9, 'brushed', 0.22);
const DARKSTEEL = mat([0x08090b, 0x17191e, 0x30343b, 0x575d66, 0x9097a2], 0.8, 'brushed', 0.3);
const PLATE = mat([0x121418, 0x2a2e35, 0x50575f, 0x858e98, 0xc8d0da], 0.8, 'hammered', 0.35);
const WRAP = mat([0x060907, 0x111a14, 0x1f3226, 0x355241, 0x5e8a70], 0.05, 'weave', 0.45);
const HOOD = mat([0x050407, 0x0f0c14, 0x1d1826, 0x332b42, 0x5a4e6e], 0.05, 'weave', 0.35);
const CLOAK = mat([0x07060a, 0x15121c, 0x272132, 0x40384f, 0x6c6084], 0.05, 'weave', 0.35);
const SMOKE = mat([0x040306, 0x0c0a12, 0x1a1624, 0x2e2840, 0x564c70], 0, 'mottle', 0.5, 0.8);
const VAPOUR = mat([0x061006, 0x10260e, 0x24481c, 0x4a7a30, 0x9ac860], 0, 'mottle', 0.5, 0.8);
const SCALES = mat([0x040805, 0x0b1a10, 0x183a22, 0x2f6a3e, 0x6ab07c], 0.25, 'scales', 0.55);
const GLASS = mat([0x0a1410, 0x1c3a2c, 0x3e6e58, 0x8ec4a8, 0xe8fff4], 0.3, 'fine', 0.15);
const CORK = mat([0x1a1008, 0x3a2614, 0x6a4a2a, 0x96704a, 0xc49c70], 0, 'pores', 0.5);
const BONE = mat([0x2a241a, 0x5a5140, 0x9a8f74, 0xcdc3a3, 0xf6eed6], 0.15, 'mottle', 0.3);
const MOON = mat([0x1a1e1c, 0x4a5450, 0x8a9a92, 0xc8d8d0, 0xf4fff8], 0.1, 'mottle', 0.3);
const BOMB = mat([0x060606, 0x141414, 0x262626, 0x444444, 0x8a8a8a], 0.6, 'hammered', 0.3);
const FLESH = mat([0x2a0808, 0x5a1414, 0x8e2420, 0xc04a3a, 0xf08a70], 0.2, 'pores', 0.3);
const BOOT = mat([0x0c0a08, 0x1e1912, 0x352c20, 0x564834, 0x84725a], 0.1, 'pores', 0.5);
const LEAF = mat([0x06140a, 0x0f2a14, 0x1e4a24, 0x3a7a3a, 0x8ad070], 0.1, 'fine', 0.3);
const GORE = mat([0x1a0204, 0x4a060a, 0x8a1018, 0xc0242a, 0xff9080], 0.35, 'fine', 0.1);

/** Blood, a cure and a ghost's steel keep their own light whatever the tree. */
const BLOOD: Tone = { core: 0xffb0a0, glow: 0xc0242a, dark: 0x2a0406 };
const CURE: Tone = { core: 0xffffff, glow: 0xbfeedd, dark: 0x16241e };
const PALE: Tone = { core: 0xffffff, glow: 0xcfe8dc, dark: 0x1a2620 };

type Puff = readonly [number, number, number];

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

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

/** A glowing line with a dark under-stroke for contrast. */
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

/** A line of points through `pts` on a Catmull-Rom curve, `n` per span. */
function spline(pts: readonly Pt[], n = 8): Pt[] {
  const at = (i: number): Pt => pts[Math.max(0, Math.min(pts.length - 1, i))]!;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const u2 = u * u;
      const u3 = u2 * u;
      const f = (j: 0 | 1): number =>
        0.5 * (2 * p1[j] + (p2[j] - p0[j]) * u + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * u2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * u3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(at(pts.length - 1));
  return out;
}

/** Points along an arc. */
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** A band of half-width `r(u)` along a dense line of points. */
function tube(s: readonly Pt[], r: (u: number) => number): Path2D {
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[Math.max(0, i - 1)]!;
    const b = s[Math.min(s.length - 1, i + 1)]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / d;
    const ny = (b[0] - a[0]) / d;
    const w = r(i / (s.length - 1));
    const p = s[i]!;
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  }
  return polyP([...left, ...right.reverse()]);
}

/** A cut in the air: a crescent of light, fat in the middle, pointed at both ends. */
function slash(x: Ctx, t: Tone, s: readonly Pt[], w: number, a = 1): void {
  const outer = tube(s, (u) => 0.3 + Math.sin(Math.PI * u) * w);
  const inner = tube(s, (u) => 0.15 + Math.sin(Math.PI * u) * w * 0.38);
  x.save();
  x.globalAlpha = a;
  x.lineJoin = 'round';
  x.lineWidth = 3;
  x.strokeStyle = css(sink(t.dark, 0.4), 0.7);
  x.stroke(outer);
  x.globalCompositeOperation = 'lighter';
  x.shadowColor = css(t.glow, 0.95);
  x.shadowBlur = 10;
  x.fillStyle = css(t.glow, 0.9);
  x.fill(outer);
  x.shadowBlur = 0;
  x.fillStyle = css(t.core, 1);
  x.fill(inner);
  x.restore();
}

/** A small arrowhead at the end of an arc, pointing along it. */
function arrowHead(x: Ctx, t: Tone, px: number, py: number, dir: number, s = 7): void {
  const c = Math.cos(dir);
  const n = Math.sin(dir);
  const p = polyP([
    [px + c * s, py + n * s],
    [px - c * s * 0.6 - n * s * 0.8, py - n * s * 0.6 + c * s * 0.8],
    [px - c * s * 0.6 + n * s * 0.8, py - n * s * 0.6 - c * s * 0.8],
  ]);
  energy(x, p, t, px, py, s * 1.4, 0.5);
}

/** Shadow smoke: soft dark puffs, caught at the rim by the light. */
function smoke(x: Ctx, t: Tone, puffs: readonly Puff[], m: Mat = SMOKE, a = 1): void {
  const p = new Path2D();
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (const [cx, cy, r] of puffs) {
    p.addPath(circleP(cx, cy, r));
    x0 = Math.min(x0, cx - r);
    y0 = Math.min(y0, cy - r);
    x1 = Math.max(x1, cx + r);
    y1 = Math.max(y1, cy + r);
  }
  x.save();
  x.globalAlpha = a;
  glow(x, (x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) * 0.6, t.glow, 0.22);
  solid(x, p, m, { a: [x0, y0], b: [x1, y1], size: 1.2, outline: 0, rim: 0.45, rimColor: lift(t.glow, 0.3) });
  innerEdge(x, p, css(t.glow, 0.75), 4, -2.5, -2.5, 2);
  x.restore();
}

/** A rising thread of fume. */
function fume(x: Ctx, t: Tone, cx: number, cy: number, h: number, a = 0.6): void {
  const p = smoothP([[cx, cy], [cx - 5, cy - h * 0.33], [cx + 5, cy - h * 0.66], [cx - 1, cy - h]], 0.5, false);
  x.save();
  x.globalAlpha = a;
  emissiveStroke(x, p, t.glow, 2.4, 0.8);
  x.restore();
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

/** A glowing venom drop, `s` = 1 is about 100 tall. */
function venom(x: Ctx, t: Tone, cx: number, cy: number, s: number): void {
  energy(x, dropP(cx, cy, s), t, cx - 6 * s, cy + 16 * s, 54 * s, 0.4);
}

/** A drop of blood: wet and dark, with one highlight. */
function bloodDrop(x: Ctx, cx: number, cy: number, s: number): void {
  const p = dropP(cx, cy, s);
  solid(x, p, GORE, { a: [cx - 30 * s, cy], b: [cx + 30 * s, cy + 40 * s], size: s * 2, outline: 1.6, outlineColor: 'rgba(8,2,2,.95)' });
  spec(x, cx - 10 * s, cy + 14 * s, 6 * s, 12 * s, 0.3, 0.8);
}

function heartP(cx: number, cy: number, s: number): Path2D {
  const p = new Path2D();
  p.moveTo(cx, cy + 30 * s);
  p.bezierCurveTo(cx - 8 * s, cy + 22 * s, cx - 38 * s, cy + 4 * s, cx - 38 * s, cy - 14 * s);
  p.bezierCurveTo(cx - 38 * s, cy - 32 * s, cx - 16 * s, cy - 38 * s, cx, cy - 22 * s);
  p.bezierCurveTo(cx + 16 * s, cy - 38 * s, cx + 38 * s, cy - 32 * s, cx + 38 * s, cy - 14 * s);
  p.bezierCurveTo(cx + 38 * s, cy + 4 * s, cx + 8 * s, cy + 22 * s, cx, cy + 30 * s);
  p.closePath();
  return p;
}

function heart(x: Ctx, t: Tone, cx: number, cy: number, s: number): Path2D {
  const p = heartP(cx, cy, s);
  glow(x, cx, cy, 44 * s, BLOOD.glow, 0.45);
  obj(x, p, FLESH, t, [cx - 38 * s, cy - 36 * s], [cx + 38 * s, cy + 30 * s], s * 1.4);
  spec(x, cx - 20 * s, cy - 18 * s, 9 * s, 5 * s, -0.6, 0.6);
  return p;
}

function skullP(cx: number, cy: number, s: number): Path2D {
  return smoothP(
    [[cx, cy - s], [cx + s * 0.85, cy - s * 0.55], [cx + s * 0.9, cy + s * 0.15], [cx + s * 0.5, cy + s * 0.5], [cx + s * 0.4, cy + s * 0.95], [cx - s * 0.4, cy + s * 0.95], [cx - s * 0.5, cy + s * 0.5], [cx - s * 0.9, cy + s * 0.15], [cx - s * 0.85, cy - s * 0.55]],
    0.4,
  );
}

/** Sockets, nose and teeth cut into a skull's face. */
function skullFace(x: Ctx, cx: number, cy: number, s: number, fill: string, eyes?: Tone): void {
  x.save();
  x.fillStyle = fill;
  for (const sg of [-1, 1]) x.fill(ellipseP(cx + sg * s * 0.36, cy + s * 0.08, s * 0.25, s * 0.21, sg * 0.25));
  x.fill(polyP([[cx, cy + s * 0.32], [cx + s * 0.11, cy + s * 0.5], [cx - s * 0.11, cy + s * 0.5]]));
  for (let i = -2; i <= 2; i++) x.fill(rrectP(cx + i * s * 0.14 - s * 0.05, cy + s * 0.66, s * 0.1, s * 0.22, s * 0.03));
  x.restore();
  if (eyes) {
    for (const sg of [-1, 1]) {
      glow(x, cx + sg * s * 0.36, cy + s * 0.08, s * 0.4, eyes.glow, 0.9);
      glint(x, cx + sg * s * 0.36, cy + s * 0.08, s * 0.16, eyes.core, 1);
    }
  }
}

/** A crescent opening to the right, tips at ±`tip` radians, `d` the bite. */
function crescentP(cx: number, cy: number, r: number, tip: number, d: number): Path2D {
  const ty = r * Math.sin(tip);
  const tx = r * Math.cos(tip);
  const r2 = Math.hypot(tx - d, ty);
  const f = Math.atan2(ty, tx - d);
  const p = new Path2D();
  p.arc(cx, cy, r, -tip, tip, true);
  p.arc(cx + d, cy, r2, f, Math.PI * 2 - f, false);
  p.closePath();
  return p;
}

// ---------------------------------------------------------------------------
// Knives
// ---------------------------------------------------------------------------

interface KnifeOpts {
  /** Blade half-width at the guard. */
  w?: number;
  m?: Mat;
  /** The edge lit in the tone's light. */
  edge?: boolean;
}

function bladeP(len: number, w: number): Path2D {
  return polyP([[0, -len], [w * 0.55, -len * 0.7], [w, -len * 0.22], [w * 0.85, 0], [-w * 0.85, 0], [-w, -len * 0.22], [-w * 0.55, -len * 0.7]]);
}

/** Length behind the guard: grip and pommel. */
function tailOf(len: number, w: number): number {
  return Math.max(3, w * 0.7) - 1 + len * 0.38 + w * 1.35;
}

/** A stiletto with its guard at the origin and its point straight up at -len. */
function knifeLocal(x: Ctx, t: Tone, len: number, o: KnifeOpts): void {
  const w = o.w ?? len * 0.12;
  const sz = len / 60;
  obj(x, bladeP(len, w), o.m ?? BLADE, t, [-w, 0], [w, 0], sz);
  // The fuller, then the edge catching the light.
  x.save();
  x.strokeStyle = 'rgba(0,0,0,.5)';
  x.lineWidth = Math.max(0.8, w * 0.22);
  x.beginPath();
  x.moveTo(0, -len * 0.1);
  x.lineTo(0, -len * 0.66);
  x.stroke();
  x.restore();
  if (o.edge !== false) {
    emissiveStroke(x, polyP([[-w * 0.95, -len * 0.18], [-w * 0.55, -len * 0.7], [0, -len]], false), t.glow, Math.max(0.8, w * 0.24), 0.85);
  }
  const gw = w * 2.3;
  const gh = Math.max(3, w * 0.7);
  obj(x, rrectP(-gw, -1, gw * 2, gh, gh * 0.45), DARKSTEEL, t, [-gw, 0], [gw, 0], sz * 0.5);
  const gl = len * 0.38;
  const hw = w * 0.62;
  const grip = rrectP(-hw, gh - 1, hw * 2, gl, hw * 0.6);
  obj(x, grip, WRAP, t, [-hw, 0], [hw, 0], sz * 0.5);
  x.save();
  x.clip(grip);
  x.strokeStyle = 'rgba(0,0,0,.65)';
  x.lineWidth = Math.max(0.7, len / 60);
  const step = Math.max(2.5, len * 0.06);
  for (let y = gh + 1; y < gh + gl; y += step) {
    x.beginPath();
    x.moveTo(-hw, y);
    x.lineTo(hw, y + hw * 0.8);
    x.stroke();
  }
  x.restore();
  obj(x, circleP(0, gh - 1 + gl + w * 0.6, w * 0.75), DARKSTEEL, t, [-w, 0], [w, 0], sz * 0.4);
}

/** A knife centred on (cx, cy), its point turned `ang` clockwise from straight up. */
function knife(x: Ctx, t: Tone, cx: number, cy: number, ang: number, len: number, o: KnifeOpts = {}): void {
  const w = o.w ?? len * 0.12;
  x.save();
  x.translate(cx, cy);
  x.rotate(ang);
  x.translate(0, (len - tailOf(len, w)) / 2);
  knifeLocal(x, t, len, { ...o, w });
  x.restore();
}

/** A knife placed by its point. */
function knifeAt(x: Ctx, t: Tone, px: number, py: number, ang: number, len: number, o: KnifeOpts = {}): void {
  x.save();
  x.translate(px, py);
  x.rotate(ang);
  x.translate(0, len);
  knifeLocal(x, t, len, o);
  x.restore();
}

/** A bare blade, no hilt, placed by its base: for petals, pinwheels and starbursts. */
function bareBlade(x: Ctx, t: Tone, bx: number, by: number, ang: number, len: number, w: number, m: Mat = BLADE): void {
  x.save();
  x.translate(bx, by);
  x.rotate(ang);
  obj(x, bladeP(len, w), m, t, [-w, 0], [w, 0], len / 60);
  emissiveStroke(x, polyP([[-w * 0.95, -len * 0.18], [-w * 0.55, -len * 0.7], [0, -len]], false), t.glow, Math.max(0.8, w * 0.24), 0.8);
  x.restore();
}

/** A spectral knife: pale light for steel, the tone's light along its edge. */
function ghostKnife(x: Ctx, t: Tone, cx: number, cy: number, ang: number, len: number, a = 1): void {
  const w = len * 0.12;
  x.save();
  x.translate(cx, cy);
  x.rotate(ang);
  x.translate(0, (len - tailOf(len, w)) / 2);
  x.globalAlpha = a;
  glow(x, 0, -len * 0.4, len * 0.8, t.glow, 0.3);
  energy(x, bladeP(len, w), PALE, 0, -len * 0.6, len, 0.45);
  emissiveStroke(x, polyP([[-w * 0.95, -len * 0.18], [-w * 0.55, -len * 0.7], [0, -len], [w * 0.55, -len * 0.7], [w * 0.95, -len * 0.18]], false), t.glow, 1.8, 1);
  const gw = w * 2.3;
  ray(x, rrectP(-gw, 0, gw * 2, 3, 1.5), t, 1.4);
  ray(x, rrectP(-w * 0.55, 5, w * 1.1, len * 0.34, 2), t, 1.2);
  x.restore();
}

// ---------------------------------------------------------------------------
// rgblade
// ---------------------------------------------------------------------------

const rgblade: Glyph = (x, t, v) => {
  switch (v) {
    case 1: {
      // Scissor Cut: two cuts crossing, the two blades that made them.
      slash(x, t, spline([[18, 30], [64, 58], [110, 100]]), 6, 0.85);
      slash(x, t, spline([[110, 28], [64, 60], [18, 102]]), 6, 0.85);
      knife(x, t, 64, 66, -0.62, 64);
      knife(x, t, 64, 66, 0.62, 64);
      glint(x, 64, 60, 12, t.core, 1);
      return;
    }
    case 2: {
      // Corrosive Edge: the blade pitted and smoking where the acid eats it.
      glow(x, 64, 60, 48, t.glow, 0.3);
      knife(x, t, 62, 66, Math.PI / 4, 76);
      const pits: readonly Puff[] = [[66, 52, 3.5], [76, 44, 3], [84, 34, 2.6], [58, 58, 2.4], [90, 28, 2]];
      for (const [px, py, r] of pits) {
        x.fillStyle = 'rgba(4,8,2,.95)';
        x.fill(circleP(px, py, r));
        emissiveStroke(x, circleP(px, py, r), t.glow, 1.2, 0.9);
      }
      for (const [fx, fy, h] of [[70, 40, 26], [86, 26, 20], [58, 50, 22]] as const) fume(x, t, fx, fy, h, 0.55);
      venom(x, t, 52, 96, 0.13);
      venom(x, t, 66, 108, 0.1);
      return;
    }
    case 3: {
      // Umbral Ambush: the blade comes out of the dark, point first.
      smoke(x, t, [[36, 40, 26], [20, 58, 16], [56, 24, 16], [52, 52, 16], [24, 30, 14]]);
      knife(x, t, 70, 70, Math.PI * 0.75, 70);
      smoke(x, t, [[34, 42, 16], [46, 32, 10]], SMOKE, 0.9);
      energy(x, starP(98, 98, 8, 5, 20, 0.2), t, 98, 98, 20, 0.5);
      return;
    }
    case 4: {
      // Flurry: one blade, quick cuts all round it, and the stacks it builds.
      slash(x, t, arcPts(64, 58, 44, -2.6, -1.2), 4, 0.8);
      slash(x, t, arcPts(64, 58, 44, -0.6, 0.8), 4, 0.8);
      slash(x, t, arcPts(64, 58, 44, 1.4, 2.6), 4, 0.8);
      knife(x, t, 64, 58, Math.PI / 4, 62);
      for (let i = 0; i < 6; i++) {
        const px = 34 + i * 12;
        const py = 112 - Math.abs(i - 2.5) * 2.4;
        energy(x, polyP([[px, py - 5], [px + 4, py], [px, py + 5], [px - 4, py]]), t, px, py, 6, 0.5);
      }
      return;
    }
    case 5: {
      // Precise Cut: one long, clean line, and the blade drawn through it.
      slash(x, t, spline([[10, 96], [50, 60], [118, 22]]), 5.5);
      knife(x, t, 56, 80, Math.PI * 0.42, 62);
      glint(x, 86, 42, 14, t.core, 1);
      return;
    }
    case 6: {
      // Bleeding Edge: red down the edge, falling from the point.
      knife(x, t, 64, 62, Math.PI / 4, 76);
      x.save();
      x.translate(64, 62);
      x.rotate(Math.PI / 4);
      const w = 76 * 0.12;
      const len = 76;
      x.translate(0, (len - tailOf(len, w)) / 2);
      const smear = polyP([[0, -len], [-w * 0.55, -len * 0.7], [-w, -len * 0.3], [-w * 0.4, -len * 0.42], [-w * 0.1, -len * 0.75]]);
      x.fillStyle = css(BLOOD.glow, 0.92);
      x.fill(smear);
      x.restore();
      bloodDrop(x, 102, 44, 0.14);
      bloodDrop(x, 94, 70, 0.11);
      bloodDrop(x, 100, 92, 0.09);
      return;
    }
    case 7: {
      // Coat Blades: a vial tipped over the blade, the coat running off it.
      knife(x, t, 52, 70, 0, 74);
      x.save();
      x.translate(92, 30);
      x.rotate(-2.2);
      flaskBody(x, t, 0, 0, 0.42);
      x.restore();
      const stream = smoothP([[80, 30], [70, 34], [58, 36], [54, 42]], 0.5, false);
      ray(x, stream, t, 3.4);
      // The coat down the blade.
      const coat = smoothP([[48, 34], [56, 34], [58, 60], [57, 76], [53, 78], [49, 70], [47, 50]], 0.35);
      x.save();
      x.globalAlpha = 0.85;
      energy(x, coat, t, 52, 50, 30, 0.45);
      x.restore();
      venom(x, t, 50, 106, 0.12);
      venom(x, t, 60, 118, 0.08);
      return;
    }
    case 8: {
      // Counter-Cut: two points meet in a spark, and the answer comes back round.
      const back = arcPts(64, 58, 46, 0.4, Math.PI - 0.4, 24).reverse();
      x.save();
      x.globalAlpha = 0.9;
      ray(x, polyP(back, false), t, 3);
      x.restore();
      const end = back[back.length - 1]!;
      arrowHead(x, t, end[0], end[1], -0.35, 8);
      knifeAt(x, t, 62, 52, Math.PI * 0.62, 50);
      knifeAt(x, t, 66, 52, -Math.PI * 0.62, 50, { m: DARKSTEEL });
      energy(x, starP(64, 50, 8, 4, 18, 0.1), t, 64, 50, 18, 0.5);
      glint(x, 64, 50, 16, t.core, 1);
      return;
    }
    default:
      glow(x, 64, 64, 46, t.glow, 0.3);
      knife(x, t, 64, 64, Math.PI / 4, 80);
  }
};

// ---------------------------------------------------------------------------
// rgknives
// ---------------------------------------------------------------------------

const rgknives: Glyph = (x, t, v) => {
  switch (v) {
    case 1: {
      // Throwing Spree: knives in flight, right hand then left, each with its streak.
      const spots: readonly Pt[] = [[30, 90], [48, 106], [56, 64], [74, 80], [82, 38], [100, 54]];
      spots.forEach(([kx, ky], i) => {
        const s = new Path2D();
        s.moveTo(kx - 30, ky + 30);
        s.lineTo(kx - 12, ky + 12);
        x.save();
        x.globalAlpha = 0.35 + i * 0.08;
        ray(x, s, t, 1.6);
        x.restore();
        knife(x, t, kx, ky, Math.PI / 4, 26);
      });
      return;
    }
    case 2: {
      // Phantom Blades: a knife of pale light, and the two it has already sent.
      ghostKnife(x, t, 40, 84, Math.PI / 4, 34, 0.35);
      ghostKnife(x, t, 86, 98, Math.PI / 4, 30, 0.3);
      for (const [wx, wy] of [[30, 104], [44, 112], [22, 92]] as const) glow(x, wx, wy, 8, t.glow, 0.5);
      ghostKnife(x, t, 66, 58, Math.PI / 4, 70, 1);
      return;
    }
    case 3: {
      // A Thousand Cuts: a burst of small blades, and cuts everywhere.
      glow(x, 64, 64, 50, t.glow, 0.45);
      const cuts: readonly (readonly [number, number, number])[] = [[22, 30, 0.5], [96, 22, -0.4], [108, 86, 0.6], [26, 98, -0.6], [64, 112, 0.1], [112, 56, -0.1]];
      for (const [cx, cy, a] of cuts) slash(x, t, [[cx - Math.cos(a) * 12, cy - Math.sin(a) * 12], [cx, cy], [cx + Math.cos(a) * 12, cy + Math.sin(a) * 12]], 2.2, 0.8);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r0 = i % 2 ? 20 : 16;
        bareBlade(x, t, 64 + Math.sin(a) * r0, 64 - Math.cos(a) * r0, a, i % 2 ? 22 : 32, i % 2 ? 3.4 : 4.4);
      }
      energy(x, circleP(64, 64, 7), t, 64, 64, 10, 0.6);
      glint(x, 64, 64, 14, t.core, 1);
      return;
    }
    default: {
      // Fan of Knives: five thrown at once in an arc.
      const arc = new Path2D();
      arc.arc(64, 124, 92, -Math.PI / 2 - 0.75, -Math.PI / 2 + 0.75);
      x.save();
      x.globalAlpha = 0.6;
      ray(x, arc, t, 2);
      x.restore();
      for (let i = 0; i < 5; i++) {
        const a = -0.6 + i * 0.3;
        const d = 60;
        knife(x, t, 64 + Math.sin(a) * d, 124 - Math.cos(a) * d, a, 30);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// rgneedle
// ---------------------------------------------------------------------------

/** A dart, point up, centred on the origin. */
function dartLocal(x: Ctx, t: Tone, s: number): void {
  // Fletching: a vane to each side of the shaft.
  for (const sg of [-1, 1]) {
    const vane = polyP([[sg * 1.5 * s, 8 * s], [sg * 12 * s, 30 * s], [sg * 5 * s, 27 * s], [sg * 1.5 * s, 31 * s]]);
    obj(x, vane, CLOAK, t, [-12 * s, 8 * s], [12 * s, 30 * s], s * 0.5);
  }
  obj(x, rrectP(-1.6 * s, 6 * s, 3.2 * s, 26 * s, 1.5 * s), DARKSTEEL, t, [-2 * s, 0], [2 * s, 0], s * 0.4);
  // The barrel, with its venom showing through.
  const barrel = rrectP(-5 * s, -18 * s, 10 * s, 26 * s, 4 * s);
  obj(x, barrel, GLASS, t, [-5 * s, 0], [5 * s, 0], s * 0.6);
  x.save();
  x.globalAlpha = 0.9;
  energy(x, rrectP(-3 * s, -14 * s, 6 * s, 18 * s, 2.5 * s), t, 0, -6 * s, 14 * s, 0.5);
  x.restore();
  // The needle.
  obj(x, polyP([[0, -48 * s], [2 * s, -18 * s], [-2 * s, -18 * s]]), BLADE, t, [-2 * s, 0], [2 * s, 0], s * 0.4);
}

const rgneedle: Glyph = (x, t, v) => {
  switch (v) {
    case 1: {
      // Blood Toxin: a syringe, full, a bead on the needle.
      x.save();
      x.translate(64, 64);
      x.rotate(-Math.PI / 4);
      glow(x, 0, -6, 46, t.glow, 0.35);
      // Plunger, thumb rest, finger flanges.
      obj(x, rrectP(-2.5, 18, 5, 30, 2), DARKSTEEL, t, [-3, 0], [3, 0], 0.4);
      obj(x, rrectP(-11, 46, 22, 5, 2), DARKSTEEL, t, [-11, 46], [11, 51], 0.4);
      obj(x, rrectP(-18, 18, 36, 5, 2), DARKSTEEL, t, [-18, 18], [18, 23], 0.4);
      const barrel = rrectP(-10, -28, 20, 48, 4);
      obj(x, barrel, GLASS, t, [-10, 0], [10, 0], 0.8);
      energy(x, rrectP(-7, -24, 14, 34, 3), t, 0, -10, 26, 0.5);
      obj(x, rrectP(-7, 10, 14, 6, 1.5), DARKSTEEL, t, [-7, 10], [7, 16], 0.3);
      x.save();
      x.strokeStyle = 'rgba(0,0,0,.7)';
      x.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        x.beginPath();
        x.moveTo(-10, -20 + i * 7);
        x.lineTo(-4, -20 + i * 7);
        x.stroke();
      }
      x.restore();
      spec(x, 5, -10, 3, 14, 0, 0.6);
      obj(x, rrectP(-4, -34, 8, 7, 2), DARKSTEEL, t, [-4, -34], [4, -27], 0.3);
      obj(x, polyP([[0, -60], [1.6, -34], [-1.6, -34]]), BLADE, t, [-2, 0], [2, 0], 0.3);
      x.restore();
      venom(x, t, 102, 26, 0.12);
      return;
    }
    case 2: {
      // Paralytic Toxin: the needle in, and the nerves jumping round it.
      const at: Pt = [64, 82];
      glow(x, at[0], at[1], 40, t.glow, 0.5);
      for (const [a, len] of [[-2.6, 42], [-0.5, 44], [0.4, 34], [2.7, 36], [-1.6, 30]] as const) {
        const pts: Pt[] = [at];
        for (let i = 1; i <= 4; i++) {
          const r = (len * i) / 4;
          const j = (i % 2 ? 1 : -1) * 6;
          pts.push([at[0] + Math.cos(a) * r - Math.sin(a) * j, at[1] + Math.sin(a) * r + Math.cos(a) * j]);
        }
        ray(x, polyP(pts, false), t, 2);
      }
      x.save();
      x.translate(at[0] - 4, at[1] - 30);
      x.rotate(Math.PI - 0.2);
      dartLocal(x, t, 0.95);
      x.restore();
      for (const [sx, sy] of [[30, 30], [96, 24], [108, 64]] as const) energy(x, starP(sx, sy, 4, 2.5, 9), t, sx, sy, 9, 0.6);
      return;
    }
    case 3: {
      // Hemotoxin: a heart with the venom in its veins, and the needle that put it there.
      const h = heart(x, t, 60, 70, 1.05);
      x.save();
      x.clip(h);
      const veins: Pt[][] = [[[40, 52], [50, 62], [46, 76], [56, 88]], [[72, 48], [66, 62], [74, 74], [66, 92]], [[86, 60], [78, 68], [82, 80]]];
      for (const pts of veins) ray(x, smoothP(pts, 0.5, false), t, 2);
      x.restore();
      x.save();
      x.translate(96, 34);
      x.rotate(-2.4);
      dartLocal(x, t, 0.8);
      x.restore();
      return;
    }
    default: {
      // Venom Dart: thrown, point first, a drop trailing.
      for (let i = 0; i < 3; i++) {
        const s = new Path2D();
        s.moveTo(12 + i * 8, 92 + i * 10);
        s.lineTo(38 + i * 8, 66 + i * 10);
        x.save();
        x.globalAlpha = 0.4 + i * 0.12;
        ray(x, s, t, 1.6);
        x.restore();
      }
      x.save();
      x.translate(66, 60);
      x.rotate(Math.PI / 4);
      dartLocal(x, t, 1.25);
      x.restore();
      venom(x, t, 104, 26, 0.13);
    }
  }
};

// ---------------------------------------------------------------------------
// rgflask
// ---------------------------------------------------------------------------

/** A round-bellied flask of venom, its belly centred on (cx, cy). */
function flaskBody(x: Ctx, t: Tone, cx: number, cy: number, s: number, liquid: Tone = t): void {
  const neck = rrectP(cx - 8 * s, cy - 58 * s, 16 * s, 30 * s, 3 * s);
  const belly = circleP(cx, cy, 32 * s);
  obj(x, neck, GLASS, t, [cx - 8 * s, 0], [cx + 8 * s, 0], s);
  obj(x, belly, GLASS, t, [cx - 32 * s, cy - 32 * s], [cx + 32 * s, cy + 32 * s], s * 1.4);
  x.save();
  x.clip(belly);
  energy(x, rrectP(cx - 40 * s, cy - 6 * s, 80 * s, 50 * s, 2), liquid, cx, cy + 18 * s, 40 * s, 0.45);
  x.restore();
  spec(x, cx - 14 * s, cy - 14 * s, 8 * s, 14 * s, 0.6, 0.65);
  obj(x, rrectP(cx - 10 * s, cy - 64 * s, 20 * s, 12 * s, 3 * s), CORK, t, [cx - 10 * s, cy - 64 * s], [cx + 10 * s, cy - 52 * s], s * 0.5);
}

const rgflask: Glyph = (x, t, v) => {
  switch (v) {
    case 1: {
      // Plague Vial: lobbed, turning end over end, the cork already loose.
      const arc = new Path2D();
      arc.arc(64, 132, 86, Math.PI + 0.45, Math.PI * 1.5 - 0.1);
      x.save();
      x.globalAlpha = 0.7;
      ray(x, arc, t, 2.4);
      x.restore();
      x.save();
      x.translate(70, 72);
      x.rotate(0.7);
      flaskBody(x, t, 0, 10, 0.78);
      x.restore();
      // A skull scratched on the belly.
      skullFace(x, 66, 76, 10, 'rgba(6,14,4,.85)');
      venom(x, t, 104, 24, 0.12);
      venom(x, t, 92, 14, 0.08);
      return;
    }
    case 2: {
      // Antivenom: a tall pale vial with a leaf on its label.
      glow(x, 64, 64, 50, CURE.glow, 0.4);
      const body = rrectP(44, 30, 40, 82, 12);
      obj(x, body, GLASS, t, [44, 0], [84, 0], 1.2);
      x.save();
      x.clip(body);
      energy(x, rrectP(40, 50, 48, 70, 2), CURE, 64, 84, 40, 0.5);
      x.restore();
      obj(x, rrectP(54, 18, 20, 16, 3), GLASS, t, [54, 0], [74, 0], 0.5);
      obj(x, rrectP(52, 8, 24, 13, 3), CORK, t, [52, 8], [76, 21], 0.5);
      // The label and its leaf.
      obj(x, rrectP(48, 70, 32, 26, 3), BONE, t, [48, 70], [80, 96], 0.5);
      const leaf = smoothP([[56, 90], [60, 78], [72, 74], [70, 86]], 0.45);
      solid(x, leaf, LEAF, { a: [56, 74], b: [72, 90], size: 0.4, outline: 1.2 });
      spec(x, 52, 50, 4, 16, 0, 0.6);
      return;
    }
    default: {
      // Toxicology: a flask on the boil, its marks up the side.
      glow(x, 64, 72, 50, t.glow, 0.35);
      flaskBody(x, t, 64, 78, 1.05);
      x.save();
      x.strokeStyle = 'rgba(0,0,0,.6)';
      x.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        x.beginPath();
        x.moveTo(36 + i * 1.5, 70 + i * 8);
        x.lineTo(44 + i * 1.5, 70 + i * 8);
        x.stroke();
      }
      x.restore();
      for (const [bx, by, r] of [[70, 92, 4], [58, 86, 3], [76, 80, 2.5], [64, 72, 2.2], [60, 48, 3], [68, 34, 2.4], [62, 22, 2]] as const) {
        x.save();
        x.globalCompositeOperation = 'lighter';
        x.strokeStyle = css(t.core, 0.9);
        x.lineWidth = 1.2;
        x.stroke(circleP(bx, by, r));
        x.restore();
      }
    }
  }
};

// ---------------------------------------------------------------------------
// rgvenom
// ---------------------------------------------------------------------------

const rgvenom: Glyph = (x, t) => {
  venom(x, t, 64, 58, 0.95);
  // A serpent's eye looking out of it.
  const eye = ellipseP(60, 80, 20, 13);
  const g = x.createRadialGradient(56, 76, 2, 60, 80, 20);
  g.addColorStop(0, css(0xfff6a0));
  g.addColorStop(0.6, css(0xd8b020));
  g.addColorStop(1, css(0x6a4a08));
  x.save();
  x.fillStyle = g;
  x.fill(eye);
  x.lineWidth = 2;
  x.strokeStyle = 'rgba(6,10,2,.95)';
  x.stroke(eye);
  x.fillStyle = 'rgba(4,4,2,1)';
  x.fill(ellipseP(60, 80, 3.4, 12));
  x.restore();
  glint(x, 54, 75, 4, 0xffffff, 0.9);
};

// ---------------------------------------------------------------------------
// rgadder
// ---------------------------------------------------------------------------

/** Diamond markings down a serpent's back. */
function markings(x: Ctx, s: readonly Pt[], every: number, size: number): void {
  x.save();
  x.fillStyle = 'rgba(2,6,3,.6)';
  for (let i = every; i < s.length - 2; i += every) {
    const [px, py] = s[i]!;
    const [qx, qy] = s[i + 1]!;
    const a = Math.atan2(qy - py, qx - px);
    x.save();
    x.translate(px, py);
    x.rotate(a);
    x.fill(polyP([[-size, 0], [0, -size * 0.6], [size, 0], [0, size * 0.6]]));
    x.restore();
  }
  x.restore();
}

const rgadder: Glyph = (x, t, v) => {
  switch (v) {
    case 1: {
      // Call the Viper: a spectral cobra rising out of its coils, hood spread.
      glow(x, 64, 56, 60, t.glow, 0.55);
      for (const [cy, rx, ry] of [[108, 40, 11], [98, 32, 10]] as const) {
        const coil = ellipseP(64, cy, rx, ry);
        obj(x, coil, SCALES, t, [24, cy - ry], [104, cy + ry], 0.9);
      }
      const rise = spline([[70, 98], [58, 80], [66, 62]], 8);
      obj(x, tube(rise, () => 9), SCALES, t, [56, 60], [76, 100], 0.8);
      const hood = smoothP([[64, 14], [82, 22], [92, 40], [86, 62], [72, 70], [64, 66], [56, 70], [42, 62], [36, 40], [46, 22]], 0.32);
      obj(x, hood, SCALES, t, [36, 14], [92, 70], 1.2);
      // The hood's eye spots, the belly plates and the head.
      x.save();
      x.clip(hood);
      x.fillStyle = 'rgba(2,6,3,.55)';
      for (const sg of [-1, 1]) x.fill(ellipseP(64 + sg * 15, 44, 5, 7));
      for (let i = 0; i < 5; i++) {
        x.fillStyle = css(lift(SCALES.c[3], 0.1), 0.55);
        x.fill(rrectP(58, 34 + i * 7, 12, 5, 2));
      }
      x.restore();
      const head = smoothP([[64, 12], [74, 18], [72, 30], [64, 34], [56, 30], [54, 18]], 0.4);
      obj(x, head, SCALES, t, [54, 12], [74, 34], 0.6);
      for (const sg of [-1, 1]) {
        glow(x, 64 + sg * 5, 22, 6, t.glow, 1);
        x.fillStyle = css(t.core);
        x.fill(ellipseP(64 + sg * 5, 22, 2, 1.3, sg * 0.4));
      }
      const tongue = polyP([[64, 34], [64, 42], [61, 46], [64, 43], [67, 46], [64, 42]], false);
      x.save();
      x.strokeStyle = css(0xd03040);
      x.lineWidth = 1.4;
      x.stroke(tongue);
      x.restore();
      // A spectral edge round all of it.
      x.save();
      x.globalAlpha = 0.55;
      emissiveStroke(x, hood, t.glow, 1.8, 0.8);
      x.restore();
      return;
    }
    case 2: {
      // Apex Predator: the serpent that eats its own tail.
      glow(x, 64, 64, 54, t.glow, 0.4);
      const ring = arcPts(64, 66, 36, -Math.PI / 2 + 0.55, Math.PI * 1.5 - 0.35, 48);
      const body = tube(ring, (u) => 4 + 7 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1 - u * 0.2));
      obj(x, body, SCALES, t, [28, 30], [100, 102], 1.2);
      markings(x, ring, 5, 4);
      // The head at the top, jaws round the tail.
      const hx = 64 + Math.cos(Math.PI * 1.5 - 0.35) * 36;
      const hy = 66 + Math.sin(Math.PI * 1.5 - 0.35) * 36;
      x.save();
      x.translate(hx, hy);
      x.rotate(0.15);
      const head = smoothP([[-16, -6], [0, -11], [18, -6], [22, 0], [16, 6], [0, 9], [-14, 6]], 0.4);
      obj(x, head, SCALES, t, [-16, -11], [22, 9], 0.6);
      glow(x, 4, -3, 6, t.glow, 1);
      x.fillStyle = css(t.core);
      x.fill(ellipseP(4, -3, 2.4, 1.4));
      obj(x, polyP([[18, 2], [21, 2], [19, 11]]), BONE, t, [18, 2], [21, 11], 0.2);
      x.restore();
      return;
    }
    default: {
      // Adder's Kiss: the strike, jaws wide, venom on the fang.
      const neck = spline([[56, 60], [40, 70], [34, 88], [48, 102], [70, 106], [90, 118]], 8);
      obj(x, tube(neck, (u) => 10 - u * 5), SCALES, t, [30, 60], [90, 118], 1);
      markings(x, neck, 6, 5);
      const upper = smoothP([[44, 52], [60, 36], [84, 32], [104, 40], [100, 48], [78, 50], [58, 60]], 0.35);
      const lower = smoothP([[52, 62], [72, 60], [96, 72], [92, 78], [70, 74], [50, 68]], 0.35);
      x.fillStyle = css(0x501018);
      x.fill(polyP([[60, 54], [98, 46], [94, 72], [62, 64]]));
      obj(x, lower, SCALES, t, [50, 60], [96, 78], 0.7);
      obj(x, upper, SCALES, t, [44, 32], [104, 60], 1);
      for (const [fx, fy, len] of [[94, 46, 16], [82, 48, 11]] as const) {
        obj(x, polyP([[fx - 2.6, fy], [fx + 2.6, fy], [fx + 0.8, fy + len]]), BONE, t, [fx - 3, fy], [fx + 3, fy + len], 0.3);
      }
      glow(x, 70, 40, 8, t.glow, 1);
      x.fillStyle = css(0xe8f070);
      x.fill(ellipseP(70, 40, 4, 3, -0.2));
      x.fillStyle = 'rgba(2,2,2,1)';
      x.fill(ellipseP(70, 40, 1, 2.8, -0.2));
      venom(x, t, 95, 72, 0.13);
    }
  }
};

// ---------------------------------------------------------------------------
// rglotus
// ---------------------------------------------------------------------------

const rglotus: Glyph = (x, t, v) => {
  if (v === 1) {
    // Cultivate: a sprout, a bead of venom on every leaf tip.
    glow(x, 64, 70, 50, t.glow, 0.35);
    const stem = spline([[64, 118], [60, 92], [66, 66], [62, 40]], 8);
    obj(x, tube(stem, (u) => 4 - u * 1.6), LEAF, t, [56, 40], [70, 118], 0.6);
    const leaves: readonly (readonly [Pt, number, number])[] = [[[62, 92], -1, 30], [[65, 72], 1, 34], [[63, 52], -1, 26]];
    const tips: Pt[] = [];
    for (const [[lx, ly], sg, len] of leaves) {
      const tip: Pt = [lx + sg * len, ly - len * 0.45];
      tips.push(tip);
      const leaf = smoothP([[lx, ly], [lx + sg * len * 0.4, ly - len * 0.5], tip, [lx + sg * len * 0.6, ly - len * 0.05]], 0.4);
      obj(x, leaf, LEAF, t, [Math.min(lx, tip[0]), tip[1]], [Math.max(lx, tip[0]), ly], 0.6);
    }
    obj(x, smoothP([[62, 22], [70, 32], [66, 42], [58, 42], [55, 32]], 0.4), LEAF, t, [55, 22], [70, 42], 0.5);
    for (const [tx, ty] of tips) venom(x, t, tx, ty + 8, 0.11);
    venom(x, t, 62, 18, 0.1);
    return;
  }
  // Death Lotus: a flower of blades, the venom at its heart.
  glow(x, 64, 64, 56, t.glow, 0.5);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    bareBlade(x, t, 64 + Math.sin(a) * 10, 64 - Math.cos(a) * 10, a, 38, 7, DARKSTEEL);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    bareBlade(x, t, 64 + Math.sin(a) * 8, 64 - Math.cos(a) * 8, a, 48, 8.5);
  }
  energy(x, circleP(64, 64, 12), t, 62, 62, 16, 0.6);
  glint(x, 62, 60, 10, t.core, 1);
};

// ---------------------------------------------------------------------------
// rgrupture
// ---------------------------------------------------------------------------

const rgrupture: Glyph = (x, t) => {
  glow(x, 64, 64, 60, t.glow, 0.6);
  x.save();
  x.globalAlpha = 0.95;
  energy(x, starP(64, 64, 9, 14, 40, 0.3), t, 64, 64, 40, 0.35);
  x.restore();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.1;
    const r = i % 2 ? 46 : 50;
    const dx = 64 + Math.cos(a) * r;
    const dy = 64 + Math.sin(a) * r;
    x.save();
    x.translate(dx, dy);
    x.rotate(a - Math.PI / 2);
    venom(x, t, 0, 0, i % 2 ? 0.12 : 0.15);
    x.restore();
  }
  energy(x, circleP(64, 64, 10), t, 64, 64, 12, 0.7);
};

// ---------------------------------------------------------------------------
// rgmiasma
// ---------------------------------------------------------------------------

const rgmiasma: Glyph = (x, t, v) => {
  switch (v) {
    case 1: {
      // Miasma Trail: footprints, each one smoking.
      const steps: readonly (readonly [number, number, number])[] = [[34, 100, 0.55], [60, 76, 0.75], [88, 52, 0.95]];
      steps.forEach(([sx, sy, a], i) => {
        x.save();
        x.globalAlpha = a;
        x.translate(sx, sy);
        x.rotate(0.75 + (i % 2 ? 0.25 : -0.15));
        const sole = smoothP([[0, -16], [7, -12], [8, 0], [5, 6], [-5, 6], [-7, -2], [-6, -12]], 0.4);
        energy(x, sole, t, 0, -4, 18, 0.5);
        energy(x, ellipseP(0, 13, 5.5, 5), t, 0, 13, 7, 0.5);
        x.restore();
        fume(x, t, sx - 2, sy - 8, 28 + i * 4, 0.55);
        fume(x, t, sx + 8, sy - 4, 20 + i * 3, 0.4);
      });
      return;
    }
    case 2: {
      // Gloom Shroud: the heart held in a ring of smoke.
      const ring: Puff[] = [];
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        ring.push([64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, 13 + (i % 3) * 2]);
      }
      smoke(x, t, ring);
      heart(x, t, 64, 68, 0.72);
      const plus = new Path2D();
      plus.moveTo(64, 54);
      plus.lineTo(64, 70);
      plus.moveTo(56, 62);
      plus.lineTo(72, 62);
      ray(x, plus, t, 2.6);
      return;
    }
    default: {
      // Noxious Cloud: a bank of fume with a death's face in it.
      smoke(x, t, [[64, 54, 32], [32, 66, 22], [96, 66, 22], [46, 38, 18], [82, 36, 20], [64, 80, 22]], VAPOUR);
      skullFace(x, 64, 52, 24, 'rgba(4,10,2,.9)', t);
    }
  }
};

// ---------------------------------------------------------------------------
// rghood
// ---------------------------------------------------------------------------

function hoodBust(x: Ctx, t: Tone): Path2D {
  const bust = smoothP([[64, 8], [82, 20], [92, 44], [90, 62], [108, 76], [120, 120], [8, 120], [20, 76], [38, 62], [36, 44], [46, 20]], 0.3);
  obj(x, bust, HOOD, t, [24, 10], [104, 120], 1.6);
  const opening = smoothP([[64, 26], [80, 36], [84, 56], [76, 76], [64, 82], [52, 76], [44, 56], [48, 36]], 0.35);
  x.save();
  x.lineWidth = 5;
  x.strokeStyle = css(HOOD.c[3], 0.85);
  x.stroke(opening);
  const g = x.createRadialGradient(64, 58, 2, 64, 56, 30);
  g.addColorStop(0, css(mixC(0x020104, t.dark, 0.4)));
  g.addColorStop(1, '#010002');
  x.fillStyle = g;
  x.fill(opening);
  // Folds where the hood meets the shoulders.
  x.strokeStyle = 'rgba(0,0,0,.6)';
  x.lineWidth = 2;
  for (const sg of [-1, 1]) {
    x.beginPath();
    x.moveTo(64 + sg * 22, 84);
    x.quadraticCurveTo(64 + sg * 30, 100, 64 + sg * 26, 120);
    x.stroke();
  }
  x.restore();
  return opening;
}

function hoodEyes(x: Ctx, t: Tone, y: number, gap: number, bright: number): void {
  for (const sg of [-1, 1]) {
    const ex = 64 + sg * gap;
    glow(x, ex, y, 12 * bright, t.glow, 0.95);
    x.fillStyle = css(t.core);
    x.fill(ellipseP(ex, y, 4.6, 2.2, -sg * 0.18));
  }
}

const rghood: Glyph = (x, t, v) => {
  switch (v) {
    case 1: {
      // Veil: the cloak drawn across, only the eyes left.
      hoodBust(x, t);
      hoodEyes(x, t, 54, 9, 1);
      const fold = smoothP([[6, 120], [12, 88], [40, 74], [72, 66], [96, 54], [116, 62], [122, 120]], 0.35);
      obj(x, fold, CLOAK, t, [20, 54], [120, 120], 1.4);
      x.save();
      x.strokeStyle = 'rgba(0,0,0,.55)';
      x.lineWidth = 2;
      for (const [x0, y0, x1, y1] of [[30, 96, 100, 74], [40, 110, 110, 88]] as const) {
        x.beginPath();
        x.moveTo(x0, y0);
        x.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - 6, x1, y1);
        x.stroke();
      }
      x.restore();
      return;
    }
    case 2: {
      // Vanish: the left half still there, the right going to smoke.
      const cut = polyP([[0, 0], [70, 0], [62, 30], [74, 52], [60, 80], [72, 104], [64, 128], [0, 128]]);
      x.save();
      x.clip(cut);
      hoodBust(x, t);
      hoodEyes(x, t, 56, 9, 1);
      x.restore();
      smoke(x, t, [[82, 40, 12], [96, 64, 14], [86, 92, 13], [104, 104, 10], [80, 64, 8]], SMOKE, 0.85);
      for (let i = 0; i < 12; i++) {
        const px = 76 + ((i * 37) % 44);
        const py = 18 + ((i * 53) % 96);
        const r = 1.5 + (i % 3);
        x.save();
        x.globalAlpha = 0.9 - (px - 76) / 60;
        x.fillStyle = css(i % 2 ? HOOD.c[3] : lift(t.glow, 0.2));
        x.fillRect(px, py, r * 1.6, r * 1.6);
        x.restore();
      }
      return;
    }
    case 3: {
      // The Unseen Blade: eyes shut, the blade raised before the face.
      glow(x, 64, 60, 50, t.glow, 0.25);
      hoodBust(x, t);
      x.save();
      x.strokeStyle = css(t.glow, 0.8);
      x.lineWidth = 1.8;
      x.lineCap = 'round';
      for (const sg of [-1, 1]) {
        x.beginPath();
        x.arc(64 + sg * 11, 52, 5, 0.3, Math.PI - 0.3);
        x.stroke();
      }
      x.restore();
      knife(x, t, 64, 70, 0, 66);
      glint(x, 64, 24, 10, t.core, 1);
      return;
    }
    default: {
      // Night Eyes: nothing in the hood but the eyes.
      hoodBust(x, t);
      hoodEyes(x, t, 56, 10, 1.4);
      for (const sg of [-1, 1]) spec(x, 64 + sg * 10, 56, 16, 1.4, 0, 0.9, t.core);
      glint(x, 74, 55, 9, t.core, 1);
    }
  }
};

// ---------------------------------------------------------------------------
// rgtwin
// ---------------------------------------------------------------------------

interface FigureOpts {
  m?: Mat;
  eyes?: boolean;
  a?: number;
  /** Drawn as shadow: smoke-dark, outlined only by light. */
  ghost?: boolean;
  /** Mirrored left to right. */
  flip?: boolean;
  /** A knife held out to one side (+1 right, -1 left). */
  blade?: number;
}

/** A hooded figure standing with its feet at (cx, foot), `h` tall. */
function figure(x: Ctx, t: Tone, cx: number, foot: number, h: number, o: FigureOpts = {}): void {
  const s = h / 100;
  const P = (px: number, py: number): Pt => [cx + (o.flip ? -px : px) * s, foot - h + py * s];
  const body = smoothP([P(2, 0), P(12, 6), P(17, 18), P(15, 28), P(28, 36), P(33, 58), P(37, 100), P(-37, 100), P(-33, 58), P(-28, 36), P(-15, 28), P(-17, 18), P(-11, 6)], 0.3);
  x.save();
  x.globalAlpha = o.a ?? 1;
  if (o.blade) {
    const [bx, by] = P(o.blade * 30, 54);
    knife(x, t, bx + o.blade * 8 * s, by - 6 * s, o.blade * 0.9, 40 * s);
  }
  if (o.ghost) {
    solid(x, body, SMOKE, { a: P(-30, 0), b: P(30, 100), size: s, outline: 0, rim: 0 });
    innerEdge(x, body, css(t.glow, 0.95), 4, -2, -2, 2.5);
    x.save();
    x.globalAlpha = (o.a ?? 1) * 0.7;
    emissiveStroke(x, body, t.glow, 1.4, 0.8);
    x.restore();
  } else {
    obj(x, body, o.m ?? HOOD, t, P(-30, 0), P(30, 100), h / 70);
  }
  x.strokeStyle = 'rgba(0,0,0,.55)';
  x.lineWidth = Math.max(1, 1.8 * s);
  for (const [x0, y0, x1, y1] of [[0, 40, -3, 100], [12, 50, 18, 100], [-12, 50, -18, 100]] as const) {
    const a = P(x0, y0);
    const b = P(x1, y1);
    x.beginPath();
    x.moveTo(a[0], a[1]);
    x.lineTo(b[0], b[1]);
    x.stroke();
  }
  const [fx, fy] = P(0, 18);
  x.fillStyle = 'rgba(2,1,4,.97)';
  x.fill(ellipseP(fx, fy, 8 * s, 9 * s));
  if (o.eyes !== false) {
    for (const sg of [-1, 1]) {
      glow(x, fx + sg * 3.6 * s, fy, 7 * s, t.glow, 0.95);
      x.fillStyle = css(t.core);
      x.fill(ellipseP(fx + sg * 3.6 * s, fy, 2.2 * s, 1.2 * s, -sg * 0.2));
    }
  }
  x.restore();
}

const rgtwin: Glyph = (x, t, v) => {
  switch (v) {
    case 1: {
      // Shadow Legion: three of him.
      figure(x, t, 30, 108, 70, { ghost: true, a: 0.85 });
      figure(x, t, 98, 108, 70, { ghost: true, a: 0.85, flip: true });
      figure(x, t, 64, 120, 92, {});
      return;
    }
    case 2: {
      // Mirror Gambit: he and his shadow face each other across a crack.
      const crack = polyP([[64, 6], [60, 30], [68, 52], [60, 76], [67, 98], [63, 122]], false);
      x.save();
      x.strokeStyle = 'rgba(0,0,0,.9)';
      x.lineWidth = 5;
      x.stroke(crack);
      x.restore();
      ray(x, crack, t, 2);
      figure(x, t, 34, 116, 84, { blade: 1 });
      figure(x, t, 94, 116, 84, { ghost: true, flip: true, blade: -1 });
      return;
    }
    case 3: {
      // Silhouette: he steps clear of where he was.
      figure(x, t, 36, 116, 86, { ghost: true, a: 0.35, eyes: false });
      figure(x, t, 54, 116, 86, { ghost: true, a: 0.6, eyes: false });
      for (let i = 0; i < 3; i++) {
        const p = new Path2D();
        p.moveTo(20, 50 + i * 18);
        p.lineTo(44, 50 + i * 18);
        x.save();
        x.globalAlpha = 0.5;
        ray(x, p, t, 1.6);
        x.restore();
      }
      figure(x, t, 76, 118, 92, {});
      return;
    }
    default: {
      // Shadow Clone: one of flesh and one of shadow, side by side.
      figure(x, t, 82, 112, 88, { ghost: true });
      figure(x, t, 48, 120, 96, {});
    }
  }
};

// ---------------------------------------------------------------------------
// rgbomb
// ---------------------------------------------------------------------------

const rgbomb: Glyph = (x, t) => {
  smoke(x, t, [[26, 98, 16], [16, 80, 10], [102, 100, 15], [112, 82, 9], [64, 114, 13], [42, 112, 11], [86, 114, 11]]);
  const body = circleP(60, 76, 32);
  obj(x, body, BOMB, t, [36, 52], [88, 104], 1.5);
  x.save();
  x.clip(body);
  obj(x, rrectP(20, 70, 84, 8, 3), DARKSTEEL, t, [20, 70], [104, 78], 0.5);
  x.restore();
  spec(x, 48, 62, 10, 5, -0.6, 0.55);
  obj(x, rrectP(50, 38, 20, 10, 3), DARKSTEEL, t, [50, 38], [70, 48], 0.5);
  const fuse = smoothP([[60, 39], [64, 26], [78, 22], [88, 13]], 0.5, false);
  x.save();
  x.strokeStyle = '#2a1e12';
  x.lineWidth = 3.5;
  x.lineCap = 'round';
  x.stroke(fuse);
  x.restore();
  glow(x, 90, 12, 20, 0xffa040, 0.9);
  glint(x, 90, 12, 10, 0xfff0c0, 1);
  for (const [sx, sy] of [[100, 6], [98, 20], [82, 6]] as const) glint(x, sx, sy, 3, 0xffd080, 0.9);
};

// ---------------------------------------------------------------------------
// rgeclipse
// ---------------------------------------------------------------------------

/** An hourglass whose sand is shadow. */
function hourglass(x: Ctx, t: Tone, cx: number, cy: number, s: number): void {
  const glass = new Path2D();
  glass.addPath(smoothP([[cx - 12 * s, cy - 20 * s], [cx + 12 * s, cy - 20 * s], [cx + 2 * s, cy], [cx - 2 * s, cy]], 0.3));
  glass.addPath(smoothP([[cx - 2 * s, cy], [cx + 2 * s, cy], [cx + 12 * s, cy + 20 * s], [cx - 12 * s, cy + 20 * s]], 0.3));
  obj(x, glass, GLASS, t, [cx - 12 * s, cy], [cx + 12 * s, cy], s * 0.6);
  x.save();
  x.clip(glass);
  energy(x, rrectP(cx - 14 * s, cy + 9 * s, 28 * s, 14 * s, 1), t, cx, cy + 16 * s, 14 * s, 0.5);
  x.restore();
  for (const y of [cy - 24 * s, cy + 20 * s]) obj(x, rrectP(cx - 15 * s, y, 30 * s, 4 * s, 1.5), DARKSTEEL, t, [cx - 15 * s, y], [cx + 15 * s, y + 4 * s], s * 0.3);
}

const rgeclipse: Glyph = (x, t, v) => {
  switch (v) {
    case 1: {
      // Dark Pact: a pale crescent holding an hourglass of shadow.
      glow(x, 64, 64, 54, t.glow, 0.4);
      x.save();
      x.translate(58, 64);
      x.rotate(-0.5);
      obj(x, crescentP(0, 0, 46, 1.2, 14), MOON, t, [-46, -46], [10, 46], 1.4);
      x.restore();
      hourglass(x, t, 78, 58, 1.1);
      return;
    }
    case 2: {
      // Shadow Mastery: the crescent and a dagger across it.
      glow(x, 64, 64, 54, t.glow, 0.4);
      x.save();
      x.translate(60, 62);
      x.rotate(-0.3);
      obj(x, crescentP(0, 0, 44, 1.25, 13), MOON, t, [-44, -44], [10, 44], 1.4);
      x.restore();
      knife(x, t, 70, 64, Math.PI / 4, 64);
      return;
    }
    default: {
      // Nightfall: a black sun; its light comes down like a curtain.
      glow(x, 64, 48, 64, t.glow, 0.7);
      for (let i = 0; i < 8; i++) {
        const cx = 22 + i * 12;
        const p = new Path2D();
        p.moveTo(cx, 72 + (i % 2) * 6);
        p.lineTo(cx + 3, 124);
        x.save();
        x.globalAlpha = 0.3 + (i % 3) * 0.14;
        ray(x, p, t, 2);
        x.restore();
      }
      x.save();
      x.globalAlpha = 0.95;
      energy(x, starP(64, 48, 16, 30, 50, 0.1), t, 64, 48, 52, 0.3);
      x.restore();
      const disc = circleP(64, 48, 28);
      const g = x.createRadialGradient(58, 42, 2, 64, 48, 28);
      g.addColorStop(0, css(mixC(0x030206, t.dark, 0.5)));
      g.addColorStop(1, '#010103');
      x.fillStyle = g;
      x.fill(disc);
      emissiveStroke(x, disc, t.core, 2.4, 1);
    }
  }
};

// ---------------------------------------------------------------------------
// rgblink
// ---------------------------------------------------------------------------

const rgblink: Glyph = (x, t, v) => {
  switch (v) {
    case 1: {
      // Void Walk: through one rift and out of the next, blade first.
      for (const cx of [24, 104]) {
        const rift = ellipseP(cx, 64, 12, 34);
        glow(x, cx, 64, 34, t.glow, 0.6);
        const g = x.createRadialGradient(cx, 64, 2, cx, 64, 34);
        g.addColorStop(0, '#000000');
        g.addColorStop(1, css(mixC(0x0a0612, t.dark, 0.5)));
        x.fillStyle = g;
        x.fill(rift);
        ray(x, rift, t, 2.6);
      }
      ghostKnife(x, t, 44, 64, Math.PI / 2, 40, 0.3);
      ghostKnife(x, t, 54, 64, Math.PI / 2, 40, 0.55);
      knife(x, t, 68, 64, Math.PI / 2, 44);
      return;
    }
    case 2: {
      // Fleetfoot: a soft boot mid-stride, smoke where it was.
      for (let i = 0; i < 3; i++) {
        const p = smoothP([[44, 72 + i * 12], [30, 76 + i * 12], [16, 70 + i * 12], [6, 76 + i * 12]], 0.5, false);
        x.save();
        x.globalAlpha = 0.65 - i * 0.15;
        emissiveStroke(x, p, t.glow, 3 - i * 0.6, 0.8);
        x.restore();
      }
      smoke(x, t, [[36, 100, 10], [24, 92, 8], [30, 110, 7]], SMOKE, 0.9);
      x.save();
      x.translate(70, 64);
      x.rotate(-0.22);
      x.translate(-70, -64);
      const boot = smoothP([[46, 14], [70, 14], [72, 56], [84, 66], [104, 74], [110, 88], [106, 96], [44, 96], [40, 70], [44, 40]], 0.3);
      obj(x, boot, BOOT, t, [40, 14], [110, 96], 1.4);
      obj(x, rrectP(42, 92, 70, 8, 4), DARKSTEEL, t, [42, 92], [112, 100], 0.4);
      for (const y of [28, 44]) obj(x, rrectP(42, y, 32, 6, 2), WRAP, t, [42, y], [74, y + 6], 0.3);
      x.restore();
      return;
    }
    default: {
      // Shadow Step: a swoop of smoke round behind, and the blade at its end.
      smoke(x, t, [[22, 104, 14], [36, 112, 10], [12, 90, 9]]);
      const swoop = spline([[22, 100], [24, 62], [48, 30], [84, 24], [104, 46]], 10);
      const band = tube(swoop, (u) => 12 * (1 - u) + 1.5);
      solid(x, band, SMOKE, { a: [20, 20], b: [104, 104], size: 1.2, outline: 0, rim: 0.4, rimColor: lift(t.glow, 0.3) });
      innerEdge(x, band, css(t.glow, 0.85), 4, -2.5, -2.5, 2);
      x.save();
      x.globalAlpha = 0.8;
      emissiveStroke(x, polyP(swoop.slice(Math.floor(swoop.length / 3)), false), t.glow, 1.4, 0.8);
      x.restore();
      knife(x, t, 94, 80, Math.PI * 0.92, 46);
    }
  }
};

// ---------------------------------------------------------------------------
// rgmark
// ---------------------------------------------------------------------------

const rgmark: Glyph = (x, t, v) => {
  switch (v) {
    case 1: {
      // Exploit Weakness: a breastplate, cracked, the weak spot lit.
      const plate = smoothP([[28, 26], [64, 18], [100, 26], [102, 60], [90, 94], [64, 110], [38, 94], [26, 60]], 0.3);
      obj(x, plate, PLATE, t, [28, 18], [100, 110], 1.5);
      x.save();
      x.strokeStyle = 'rgba(0,0,0,.5)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(64, 22);
      x.lineTo(64, 106);
      x.stroke();
      x.restore();
      spec(x, 44, 40, 14, 4, -0.4, 0.5);
      const crack = polyP([[74, 20], [64, 38], [74, 50], [62, 62], [70, 74], [64, 86]], false);
      x.save();
      x.strokeStyle = 'rgba(0,0,0,.95)';
      x.lineWidth = 4.5;
      x.stroke(crack);
      x.restore();
      ray(x, crack, t, 1.6);
      glow(x, 62, 62, 18, t.glow, 0.9);
      ray(x, circleP(62, 62, 11), t, 2);
      const ticks = new Path2D();
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]] as const) {
        ticks.moveTo(62 + dx * 14, 62 + dy * 14);
        ticks.lineTo(62 + dx * 20, 62 + dy * 20);
      }
      ray(x, ticks, t, 2);
      return;
    }
    case 2: {
      // Lethality: through the plate, and the crit bursting out the far side.
      x.save();
      x.translate(58, 70);
      x.rotate(-0.25);
      const plate = rrectP(-34, -26, 68, 52, 8);
      obj(x, plate, PLATE, t, [-34, -26], [34, 26], 1.4);
      for (const [rx, ry] of [[-26, -18], [26, -18], [-26, 18], [26, 18]] as const) obj(x, circleP(rx, ry, 3), DARKSTEEL, t, [rx - 3, ry - 3], [rx + 3, ry + 3], 0.2);
      x.restore();
      knife(x, t, 64, 64, Math.PI / 4, 82);
      x.save();
      x.strokeStyle = 'rgba(0,0,0,.85)';
      x.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        x.beginPath();
        x.moveTo(68 + Math.cos(a) * 6, 58 + Math.sin(a) * 6);
        x.lineTo(68 + Math.cos(a) * 15, 58 + Math.sin(a) * 15);
        x.stroke();
      }
      x.restore();
      energy(x, starP(102, 26, 8, 6, 22, 0.2), t, 102, 26, 22, 0.5);
      glint(x, 102, 26, 14, t.core, 1);
      return;
    }
    case 3: {
      // Finisher: the heart with a third left in it, and the blade coming down.
      const h = heartP(64, 86, 0.9);
      x.save();
      x.fillStyle = 'rgba(14,6,8,.92)';
      x.fill(h);
      x.clip(h);
      const g = x.createLinearGradient(0, 96, 0, 116);
      g.addColorStop(0, css(BLOOD.glow));
      g.addColorStop(1, css(sink(BLOOD.glow, 0.5)));
      x.fillStyle = g;
      x.fillRect(0, 98, 128, 30);
      glow(x, 64, 104, 18, BLOOD.glow, 0.7);
      x.restore();
      x.save();
      x.lineWidth = 2.4;
      x.strokeStyle = 'rgba(6,2,3,.95)';
      x.stroke(h);
      x.restore();
      innerEdge(x, h, css(t.glow, 0.9), 3.5, -2, -2, 2);
      knife(x, t, 64, 34, Math.PI, 42);
      return;
    }
    case 4: {
      // Assassinate: the blade driven into the skull.
      glow(x, 62, 76, 44, t.glow, 0.35);
      const sk = skullP(60, 86, 30);
      obj(x, sk, BONE, t, [30, 56], [90, 114], 1.4);
      skullFace(x, 60, 86, 30, 'rgba(8,6,6,.95)');
      x.save();
      x.strokeStyle = 'rgba(10,6,4,.9)';
      x.lineWidth = 1.8;
      const cracks: Pt[][] = [[[62, 62], [56, 70], [58, 76]], [[64, 62], [72, 68], [70, 74]], [[62, 62], [52, 62]]];
      for (const pts of cracks) x.stroke(polyP(pts, false));
      x.restore();
      knifeAt(x, t, 62, 64, Math.PI + 0.35, 38);
      const trickle = polyP([[60, 64], [57, 72], [58, 80]], false);
      x.save();
      x.strokeStyle = css(BLOOD.glow, 0.95);
      x.lineWidth = 2.2;
      x.lineCap = 'round';
      x.stroke(trickle);
      x.restore();
      bloodDrop(x, 58, 82, 0.07);
      return;
    }
    default: {
      // Deadly Aim: four blades closing on one point.
      x.save();
      x.globalAlpha = 0.7;
      ray(x, circleP(64, 64, 32), t, 1.8);
      x.restore();
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * (Math.PI / 2);
        knifeAt(x, t, 64 + Math.cos(a) * 11, 64 + Math.sin(a) * 11, a - Math.PI / 2, 28);
      }
      energy(x, circleP(64, 64, 5), t, 64, 64, 8, 0.6);
      glint(x, 64, 64, 10, t.core, 1);
    }
  }
};

// ---------------------------------------------------------------------------
// rgtendon, rgdash, rghalo, rgwaltz
// ---------------------------------------------------------------------------

/** Cripple Tendon: the back of the heel, cut through. */
const rgtendon: Glyph = (x, t) => {
  const leg = smoothP([[48, 6], [76, 6], [80, 40], [78, 70], [84, 90], [80, 104], [24, 108], [12, 100], [20, 88], [46, 82], [50, 50]], 0.3);
  obj(x, leg, BOOT, t, [12, 6], [84, 108], 1.5);
  for (const y of [26, 42, 58]) {
    x.save();
    x.clip(leg);
    obj(x, rrectP(40, y, 50, 7, 2), WRAP, t, [40, y], [90, y + 7], 0.3);
    x.restore();
  }
  slash(x, t, spline([[60, 56], [82, 74], [108, 98]]), 5.5);
  bloodDrop(x, 88, 96, 0.12);
  bloodDrop(x, 96, 112, 0.09);
  bloodDrop(x, 78, 112, 0.07);
};

/** Razor Dash: a pinwheel of blades, spinning down its lane. */
const rgdash: Glyph = (x, t) => {
  for (let i = 0; i < 4; i++) {
    const p = new Path2D();
    const o = (i - 1.5) * 10;
    p.moveTo(6 + o * 0.6, 112 - o * 0.6 + 4);
    p.lineTo(46 + o * 0.6, 80 - o * 0.6);
    x.save();
    x.globalAlpha = 0.4 + i * 0.12;
    ray(x, p, t, 2.2);
    x.restore();
  }
  const cx = 76;
  const cy = 54;
  for (let k = 0; k < 3; k++) slash(x, t, arcPts(cx, cy, 42, -2.4 + k * 2.09, -1.4 + k * 2.09, 12), 3.5, 0.8);
  for (let k = 0; k < 3; k++) {
    const a = 0.4 + (k * Math.PI * 2) / 3;
    bareBlade(x, t, cx + Math.sin(a) * 8, cy - Math.cos(a) * 8, a + 0.35, 36, 7);
  }
  obj(x, circleP(cx, cy, 10), DARKSTEEL, t, [cx - 10, cy - 10], [cx + 10, cy + 10], 0.6);
  obj(x, circleP(cx, cy, 4), WRAP, t, [cx - 4, cy - 4], [cx + 4, cy + 4], 0.3);
};

/** Knife Halo: six knives turning round the one who holds them. */
const rghalo: Glyph = (x, t) => {
  glow(x, 64, 64, 30, t.glow, 0.4);
  x.save();
  x.globalAlpha = 0.45;
  ray(x, circleP(64, 64, 40), t, 1.4);
  x.restore();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    slash(x, t, arcPts(64, 64, 40, a - 0.75, a - 0.12, 10), 2.6, 0.75);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    knife(x, t, 64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40, a + Math.PI, 22);
  }
};

/** Steel Waltz: four turning cuts, and both blades driven in at the end. */
const rgwaltz: Glyph = (x, t) => {
  for (let q = 0; q < 4; q++) {
    const a0 = q * (Math.PI / 2) - Math.PI / 2 + 0.25;
    const a1 = a0 + 1.1;
    slash(x, t, arcPts(64, 64, 46, a0, a1, 14), 4.2, 0.9);
    arrowHead(x, t, 64 + Math.cos(a1) * 46, 64 + Math.sin(a1) * 46, a1 + Math.PI / 2, 6);
  }
  knifeAt(x, t, 60, 86, Math.PI - 0.3, 42);
  knifeAt(x, t, 68, 86, Math.PI + 0.3, 42, { m: DARKSTEEL });
  energy(x, starP(64, 88, 8, 4, 16, 0.2), t, 64, 88, 16, 0.5);
};

export const ROGUE_GLYPHS: Record<string, Glyph> = {
  rgblade,
  rgknives,
  rgneedle,
  rgflask,
  rgvenom,
  rgadder,
  rglotus,
  rgrupture,
  rgmiasma,
  rghood,
  rgtwin,
  rgbomb,
  rgeclipse,
  rgblink,
  rgmark,
  rgtendon,
  rgdash,
  rghalo,
  rgwaltz,
};
