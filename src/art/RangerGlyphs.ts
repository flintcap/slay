/**
 * SLAY — the Ranger's own pictograms, spread into `GLYPHS` (`Glyphs.ts`).
 *
 * Same 128-unit canvas and painting rules as the shared set: wood, gut,
 * leather, feather and steel painted as solids under the key light and
 * caught by the tone's back light; emissive strokes for flight and paths.
 * Only `./Paint` is imported at run time, so the shared module can spread
 * this one in without a cycle.
 *
 *   rnshaft   one arrow, posed. v0 through two rings, v1 barbed and bleeding,
 *             v2 bursting into splinters, v3 banked off a stone, v4 a burning
 *             pot for a head, v5 through a skull, v6 through an ankle, v7 at
 *             the end of a zigzag, v8 over a measured line, v9 through three.
 *   rnbow     a recurve at full draw. v0 one arrow, v1 two, v2 five fanned,
 *             v3 its string snapping back thrice, v4 sighted on a far ring,
 *             v5 under a closed, calm eye.
 *   rnmark    the hunter's daub. v0 alone on bark, v1 an arrow driven into
 *             it, v2 three, joined.
 *   rnhead    a broadhead, close. v0 with a feather bound to it, v1 on a
 *             whetstone in sparks, v2 three shafts in one bull, v3 an eye in
 *             cross-hairs, v4 a heart run through, v5 through a plank.
 *   rnhood    v0 eyes between leaves, v1 a hooded body tucked in a roll.
 *   rnstep    a soft boot. v0 pushing off backwards under an arrow, v1 on a
 *             leaf, v2 out of a broken shackle, v3 into a burrow.
 *   rnsnare   v0 a noose on a bent sapling, v1 a wire between two stakes,
 *             v2 a coil of cord in a trapper's knot.
 *   rnplate   v0 spikes up through a plate, v1 a floor of plates, v2 spikes
 *             up out of a footprint.
 *   rnbramble a wall of thorned brambles.
 *   rnherb    a bundle of herbs bound in linen.
 *   rnpot     a venom pot, arrowheads dipped in it.
 *   rnnest    a paper wasp nest on its twig, wasps out.
 *   rnkestrel v0 in the stoop, v1 soaring over tracks.
 *   rnquiver  v0 thrown open, arrows spilling, v1 with an arrow circling it,
 *             v2 packed full.
 *   rnvolley  v0 a rain into a ring, v1 three falls walking nearer, v2 a sky
 *             black with shafts, v3 shafts standing in the floor.
 *   rnwheel   v0 a wheel of arrows, v1 a stream, v2 a spray, v3 one arrow
 *             scattering into a flock.
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
  rrectP,
  saturate,
  sink,
  smoothP,
  solid,
  spec,
  starP,
} from './Paint';

// ---------------------------------------------------------------------------
// Materials and paint modes
// ---------------------------------------------------------------------------

const STEEL = mat([0x14171c, 0x323a46, 0x66727f, 0xa9b6c4, 0xf2f7fc], 0.9, 'brushed', 0.25);
const IRON = mat([0x121418, 0x2a2e35, 0x50575f, 0x858e98, 0xc8d0da], 0.8, 'hammered', 0.3);
const WOOD = mat([0x1c120a, 0x3c2816, 0x694829, 0x946b42, 0xbf9466], 0.05, 'grain', 0.45, 0.6);
const BOWWOOD = mat([0x160c06, 0x3a2210, 0x6a4420, 0x9a6a3a, 0xd0a070], 0.2, 'grain', 0.4, 0.6);
const LEATHER = mat([0x170f09, 0x382515, 0x5c3f25, 0x85603b, 0xab8560], 0.1, 'pores', 0.5);
const BONE = mat([0x2a241a, 0x5a5140, 0x9a8f74, 0xcdc3a3, 0xf6eed6], 0.15, 'mottle', 0.3);
const FEATHER = mat([0x1e1810, 0x4a3a28, 0x8a6e4a, 0xc0a47a, 0xeedcb8], 0, 'fine', 0.3);
const CORD = mat([0x1e160c, 0x3e3020, 0x6a5638, 0x9a845e, 0xc8b48a], 0, 'weave', 0.4);
const LINEN = mat([0x2a2620, 0x5a5448, 0x9a9282, 0xccc4b2, 0xf0eadc], 0, 'weave', 0.3);
const STONE = mat([0x131518, 0x2b2f33, 0x4e5358, 0x7a7f84, 0xa8adb2], 0, 'crack', 0.45);
const BARK = mat([0x140c06, 0x2e1e10, 0x4e3420, 0x6e4e32, 0x94704e], 0, 'grain', 0.55);
const EARTH = mat([0x0e0a06, 0x241a10, 0x3e2e1e, 0x5a4630, 0x7e6648], 0, 'mottle', 0.45);
const LEAF = mat([0x0c1a08, 0x1e3a14, 0x3a6a26, 0x6a9a44, 0xa8d080], 0, 'fine', 0.3);
const THORN = mat([0x100c06, 0x2a1c0e, 0x4a3218, 0x6e5030, 0x9a7a52], 0, 'grain', 0.5);
const PAPER = mat([0x2a2418, 0x5a4e38, 0x8e7e5c, 0xbcab84, 0xe6d8b2], 0, 'mottle', 0.4);
const CLAY = mat([0x200e06, 0x4a2410, 0x7a4220, 0xa8663a, 0xd09a6a], 0, 'pores', 0.4);
const KESTREL = mat([0x1e0e06, 0x4a2412, 0x8a4a22, 0xc07a40, 0xe8b880], 0, 'fine', 0.3);
const SLATE = mat([0x0e1014, 0x22262c, 0x3a4048, 0x5a626c, 0x828a94], 0.1, 'fine', 0.3);

/** The hunter's own red: the mark's daub, a heart, blood. */
const RED: Tone = { core: 0xffd8c8, glow: 0xd8382a, dark: 0x3a0806 };

function obj(x: Ctx, p: Path2D, m: Mat, t: Tone, a: Pt = [34, 30], b: Pt = [94, 98], size = 1.4): void {
  solid(x, p, m, { a, b, size, outline: 2.2, outlineColor: 'rgba(6,5,6,.95)' });
  innerEdge(x, p, css(t.glow, 0.9), 3.5, -2.2, -2.2, 2);
}

/** A glowing line with a dark under-stroke: flight, paths, strings. */
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

/** A dark line under everything else, for cracks and ink. */
function ink(x: Ctx, p: Path2D, w: number, a = 0.95): void {
  x.save();
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = `rgba(6,4,4,${a})`;
  x.lineWidth = w;
  x.stroke(p);
  x.restore();
}

function line(pts: readonly Pt[]): Path2D {
  return polyP(pts, false);
}

/** A falling drop, point up, centred on (cx, cy). */
function dropAt(cx: number, cy: number, r: number): Path2D {
  const p = new Path2D();
  p.moveTo(cx, cy - r * 1.9);
  p.bezierCurveTo(cx + r * 0.4, cy - r * 0.9, cx + r, cy - r * 0.3, cx + r, cy + r * 0.2);
  p.arc(cx, cy + r * 0.2, r, 0, Math.PI);
  p.bezierCurveTo(cx - r, cy - r * 0.3, cx - r * 0.4, cy - r * 0.9, cx, cy - r * 1.9);
  p.closePath();
  return p;
}

function at(x: Ctx, cx: number, cy: number, rot: number, s: number, fn: () => void): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(s, s);
  fn();
  x.restore();
}

// ---------------------------------------------------------------------------
// The arrow and the bow
// ---------------------------------------------------------------------------

interface ArrowOpts {
  /** Shaft thickness. */
  w?: number;
  head?: 'broad' | 'barb' | 'bodkin' | 'none';
  fletch?: boolean;
  /** Where the shaft stops short of the tail (0) or the head, as a share. */
  from?: number;
  /** A trail of light behind it, this long. */
  trail?: number;
}

/** One arrow from its nock (x0, y0) to its point (x1, y1). */
function arrowAt(x: Ctx, t: Tone, x0: number, y0: number, x1: number, y1: number, o: ArrowOpts = {}): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const w = o.w ?? 5;
  const k = Math.max(0.55, w / 5);
  const hl = 17 * k;
  const hw = 7.5 * k;
  const from = (o.from ?? 0) * len;
  x.save();
  x.translate(x0, y0);
  x.rotate(ang);
  if (o.trail) {
    const tr = new Path2D();
    tr.moveTo(from - o.trail, 0);
    tr.lineTo(from + 4, 0);
    x.save();
    x.globalAlpha = 0.7;
    ray(x, tr, t, w * 0.6);
    x.restore();
  }
  obj(x, rrectP(from + 3, -w / 2, len - hl * 0.7 - from - 3, w, w / 2), WOOD, t, [0, -w], [0, w], 0.35);
  if (o.fletch !== false && from <= 0) {
    const fl = 19 * k;
    for (const sg of [-1, 1]) {
      obj(x, polyP([[3, sg * w * 0.3], [3 + fl, sg * w * 0.4], [2 + fl * 0.72, sg * (w / 2 + 7 * k)], [-1, sg * (w / 2 + 8 * k)]]), FEATHER, t, [0, sg * 12], [fl, 0], 0.35);
    }
    obj(x, rrectP(-1, -w / 2 - 1, 5, w + 2, 1.5), BONE, t, [-1, -w], [4, w], 0.2);
  }
  const head = o.head ?? 'broad';
  if (head !== 'none') {
    const b = len - hl;
    let pts: Pt[];
    if (head === 'barb') {
      pts = [[len, 0], [b + hl * 0.3, -hw], [b + hl * 0.42, -hw * 0.35], [b - 3 * k, -hw * 1.1], [b + hl * 0.12, -w / 2], [b + hl * 0.12, w / 2], [b - 3 * k, hw * 1.1], [b + hl * 0.42, hw * 0.35], [b + hl * 0.3, hw]];
    } else if (head === 'bodkin') {
      pts = [[len, 0], [b + hl * 0.2, -w * 0.75], [b + hl * 0.2, w * 0.75]];
    } else {
      pts = [[len, 0], [b + hl * 0.12, -hw], [b + hl * 0.32, -w / 2], [b + hl * 0.32, w / 2], [b + hl * 0.12, hw]];
    }
    obj(x, polyP(pts), STEEL, t, [b, -hw], [len, hw], 0.5);
    obj(x, rrectP(b + hl * 0.22, -w / 2 - 0.8, 5 * k, w + 1.6, 1), CORD, t, [b, -w], [b + 4, w], 0.2);
    glint(x, len - hl * 0.4, -hw * 0.3, 3.4 * k, 0xffffff, 0.75);
  }
  x.restore();
}

/**
 * A recurve bow with its grip at (cx, cy), loosing along `rot` (0 is to the
 * right), drawn `pull` (0 slack, 1 full). Its string is lit in the tone.
 * Returns the nock point, where a nocked arrow's tail sits.
 */
function bowAt(x: Ctx, t: Tone, cx: number, cy: number, rot: number, pull: number, s = 1): Pt {
  const tipX = -10 - pull * 9;
  const nockX = tipX - pull * 30;
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(s, s);
  const limb = new Path2D();
  for (const sg of [-1, 1]) {
    limb.moveTo(0, sg * 9);
    limb.bezierCurveTo(7, sg * 26, -2 + tipX * 0.2, sg * 44, tipX, sg * 50);
    // The recurve: the tips flick away from the archer.
    limb.quadraticCurveTo(tipX - 3, sg * 55, tipX + 4, sg * 58);
  }
  x.save();
  x.lineCap = 'round';
  x.strokeStyle = 'rgba(6,4,3,.95)';
  x.lineWidth = 11;
  x.stroke(limb);
  x.strokeStyle = css(BOWWOOD.c[1]);
  x.lineWidth = 8;
  x.stroke(limb);
  x.strokeStyle = css(BOWWOOD.c[3]);
  x.lineWidth = 4.5;
  x.stroke(limb);
  x.strokeStyle = css(lift(BOWWOOD.c[4], 0.2), 0.8);
  x.lineWidth = 1.6;
  x.translate(-1, -0.5);
  x.stroke(limb);
  x.restore();
  // The back light along the limbs' far edge.
  x.save();
  x.globalAlpha = 0.55;
  emissiveStroke(x, limb, t.glow, 1.4, 0.6);
  x.restore();
  // The string, drawn back to the nock.
  const str = line([[tipX, -50], [nockX, 0], [tipX, 50]]);
  x.save();
  x.lineCap = 'round';
  x.strokeStyle = 'rgba(6,4,3,.9)';
  x.lineWidth = 3.6;
  x.stroke(str);
  x.restore();
  emissiveStroke(x, str, t.glow, 1.6, 0.9);
  x.save();
  x.strokeStyle = css(t.core, 0.9);
  x.lineWidth = 0.9;
  x.stroke(str);
  x.restore();
  // Grip and its wrap.
  obj(x, rrectP(-4.5, -11, 9, 22, 3), LEATHER, t, [-4, -11], [4, 11], 0.4);
  for (const y of [-6, 0, 6]) {
    x.save();
    x.strokeStyle = css(LEATHER.c[0], 0.8);
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(-4.5, y);
    x.lineTo(4.5, y + 2);
    x.stroke();
    x.restore();
  }
  spec(x, 3, -32, 2, 9, 0.2, 0.45);
  x.restore();
  const c = Math.cos(rot);
  const sn = Math.sin(rot);
  return [cx + (nockX * c) * s, cy + (nockX * sn) * s];
}

/** An arrow nocked on a bow drawn by `bowAt`, `len` long, turned `spread` off the bow's line. */
function nocked(x: Ctx, t: Tone, nock: Pt, rot: number, len: number, spread = 0, w = 4.6): void {
  const a = rot + spread;
  arrowAt(x, t, nock[0], nock[1], nock[0] + Math.cos(a) * len, nock[1] + Math.sin(a) * len, { w });
}

// ---------------------------------------------------------------------------
// rnshaft
// ---------------------------------------------------------------------------

/** A stone block, its face toward the viewer. */
function stoneAt(x: Ctx, t: Tone, x0: number, y0: number, w: number, h: number): void {
  const p = polyP([[x0, y0 + 3], [x0 + w - 2, y0], [x0 + w, y0 + h - 3], [x0 + 2, y0 + h]]);
  obj(x, p, STONE, t, [x0, y0], [x0 + w, y0 + h], 1);
  ink(x, line([[x0 + w * 0.3, y0 + 2], [x0 + w * 0.42, y0 + h * 0.45], [x0 + w * 0.3, y0 + h * 0.7]]), 1.6, 0.8);
}

function skullAt(x: Ctx, t: Tone, cx: number, cy: number, s: number): void {
  at(x, cx, cy, 0, s, () => {
    const dome = smoothP([[0, -30], [22, -24], [28, -4], [22, 14], [14, 18], [14, 28], [-14, 28], [-14, 18], [-22, 14], [-28, -4], [-22, -24]], 0.35);
    obj(x, dome, BONE, t, [-28, -30], [28, 28], 1.2);
    for (const sg of [-1, 1]) {
      const eye = ellipseP(sg * 11, -2, 7.5, 8.5);
      x.save();
      x.fillStyle = 'rgba(8,5,4,.96)';
      x.fill(eye);
      x.restore();
    }
    x.save();
    x.fillStyle = 'rgba(8,5,4,.9)';
    x.fill(polyP([[0, 8], [4, 15], [-4, 15]]));
    x.restore();
    for (let i = -2; i <= 2; i++) ink(x, line([[i * 5, 21], [i * 5, 27]]), 1.4, 0.8);
    spec(x, -10, -18, 8, 4, -0.4, 0.4);
  });
}

function bootAt(x: Ctx, t: Tone, cx: number, cy: number, s: number, flip = false): void {
  at(x, cx, cy, 0, s, () => {
    if (flip) x.scale(-1, 1);
    const p = smoothP([[-18, -44], [12, -44], [12, -2], [34, 8], [38, 26], [-22, 26], [-22, -10]], 0.25);
    obj(x, p, LEATHER, t, [-22, -44], [38, 26], 1.3);
    obj(x, rrectP(-24, 22, 64, 7, 3), LEATHER, t, [-24, 22], [40, 29], 0.4);
    obj(x, rrectP(-20, -46, 34, 10, 4), LEATHER, t, [-20, -46], [14, -36], 0.5);
    for (const y of [-28, -18, -8]) ink(x, line([[-20, y], [10, y + 2]]), 1.2, 0.6);
  });
}

const rnshaft: Glyph = (x, t, v) => {
  switch (v % 10) {
    case 0: {
      // Pierce Shot: through two, and on.
      glow(x, 70, 58, 50, t.glow, 0.35);
      for (const [cx, cy] of [[48, 80], [80, 48]] as const) {
        const ring = ellipseP(cx, cy, 9, 17, Math.PI / 4);
        x.save();
        x.globalAlpha = 0.9;
        ray(x, ring, t, 2.4);
        x.restore();
      }
      arrowAt(x, t, 12, 116, 116, 12, { w: 5.2, trail: 0 });
      for (const [cx, cy] of [[48, 80], [80, 48]] as const) {
        // The near half of each ring passes in front of the shaft.
        const half = new Path2D();
        half.ellipse(cx, cy, 9, 17, Math.PI / 4, -Math.PI / 2, Math.PI / 2);
        ray(x, half, t, 2.4);
        glint(x, cx + 4, cy + 4, 5, t.core, 0.8);
      }
      break;
    }
    case 1: {
      // Bleeding Arrow: barbed, and what it leaves.
      glow(x, 70, 70, 44, RED.glow, 0.3);
      arrowAt(x, t, 16, 18, 96, 98, { w: 5.6, head: 'barb' });
      for (const [dx, dy, r] of [[96, 108, 4.2], [84, 118, 3], [106, 120, 2.6]] as const) energy(x, dropAt(dx, dy, r), RED, dx, dy, r * 2.4, 0.4);
      energy(x, ellipseP(90, 92, 6, 3.5, Math.PI / 4), RED, 90, 92, 8, 0.4);
      break;
    }
    case 2: {
      // Splinter Shot: the head bursts into needles.
      glow(x, 84, 44, 40, t.glow, 0.5);
      arrowAt(x, t, 12, 116, 72, 56, { w: 5.2, head: 'none' });
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 4 + (i - 2) * 0.32;
        const r0 = 14;
        const r1 = 40 + (i % 2) * 8;
        const ox = 78 + Math.cos(a) * r0;
        const oy = 50 + Math.sin(a) * r0;
        const ex = 78 + Math.cos(a) * r1;
        const ey = 50 + Math.sin(a) * r1;
        const tr = line([[ox, oy], [ex, ey]]);
        x.save();
        x.globalAlpha = 0.6;
        ray(x, tr, t, 1.4);
        x.restore();
        obj(x, polyP([[ex, ey], [ex - Math.cos(a) * 12 - Math.sin(a) * 2.6, ey - Math.sin(a) * 12 + Math.cos(a) * 2.6], [ex - Math.cos(a) * 12 + Math.sin(a) * 2.6, ey - Math.sin(a) * 12 - Math.cos(a) * 2.6]]), WOOD, t, [ex - 6, ey - 6], [ex + 6, ey + 6], 0.3);
      }
      energy(x, starP(76, 52, 7, 5, 15, 0.2), t, 76, 52, 15, 0.5);
      // The shaft cracking along its length.
      ink(x, line([[36, 92], [44, 86], [50, 82], [58, 72]]), 1.3, 0.8);
      break;
    }
    case 3: {
      // Bank Shot: off the stone and on.
      stoneAt(x, t, 92, 22, 28, 84);
      const path = line([[14, 110], [90, 64], [30, 22]]);
      x.save();
      x.globalAlpha = 0.85;
      ray(x, path, t, 2.4);
      x.restore();
      energy(x, starP(90, 64, 6, 4, 13, 0.3), t, 90, 64, 13, 0.5);
      arrowAt(x, t, 74, 54, 26, 20, { w: 5 });
      break;
    }
    case 4: {
      // Explosive Tip: a fire pot for a head.
      arrowAt(x, t, 12, 116, 76, 52, { w: 5, head: 'none' });
      obj(x, ellipseP(82, 46, 15, 13, -Math.PI / 4), CLAY, t, [68, 32], [96, 60], 0.8);
      obj(x, rrectP(70, 52, 10, 6, 2), CORD, t, [70, 52], [80, 58], 0.3);
      const flame = smoothP([[86, 36], [96, 22], [100, 10], [108, 18], [112, 6], [116, 24], [108, 40], [94, 46]], 0.4);
      energy(x, flame, t, 100, 30, 24, 0.5);
      for (const [sx, sy, r] of [[118, 40, 3], [104, 4, 2.4], [90, 16, 2.2]] as const) glint(x, sx, sy, r * 2, t.core, 0.9);
      glint(x, 76, 40, 4, 0xffffff, 0.7);
      break;
    }
    case 5: {
      // One Shot, One Grave: through the eye.
      glow(x, 62, 62, 46, t.glow, 0.3);
      skullAt(x, t, 60, 66, 1.25);
      arrowAt(x, t, 8, 18, 118, 104, { w: 5 });
      // Where it went in: the socket lit.
      glow(x, 46, 63, 12, t.glow, 0.8);
      break;
    }
    case 6: {
      // Crippling Shot: through the ankle.
      bootAt(x, t, 58, 70, 1);
      arrowAt(x, t, 6, 82, 112, 52, { w: 4.8 });
      for (const [dx, dy, r] of [[62, 92, 3], [72, 98, 2.4]] as const) energy(x, dropAt(dx, dy, r), RED, dx, dy, r * 2.4, 0.4);
      // It drags: two weight lines under the heel.
      for (let i = 0; i < 2; i++) ray(x, line([[30 - i * 8, 112 + i * 6], [12 - i * 8, 112 + i * 6]]), t, 2.2 - i * 0.6);
      break;
    }
    case 7: {
      // Carom Shot: from one to the next to the next.
      const path = line([[10, 104], [40, 40], [72, 96], [104, 30]]);
      x.save();
      x.globalAlpha = 0.85;
      ray(x, path, t, 2.4);
      x.restore();
      for (const [cx, cy] of [[40, 40], [72, 96]] as const) energy(x, starP(cx, cy, 6, 4, 12, 0.2), t, cx, cy, 12, 0.5);
      arrowAt(x, t, 86, 66, 112, 14, { w: 4.8 });
      break;
    }
    case 8: {
      // Long Eye: the further, the harder.
      const rule = new Path2D();
      rule.moveTo(12, 96);
      rule.lineTo(116, 96);
      for (let i = 0; i < 6; i++) {
        const rx = 16 + i * 19;
        const h = 5 + i * 2.4;
        rule.moveTo(rx, 96 - h);
        rule.lineTo(rx, 96 + h * 0.4);
      }
      ray(x, rule, t, 2);
      arrowAt(x, t, 10, 72, 120, 52, { w: 4.6, trail: 0 });
      // The far mark it is meant for, small.
      x.save();
      x.globalAlpha = 0.9;
      ray(x, circleP(110, 28, 8), t, 2);
      x.restore();
      glow(x, 110, 28, 12, t.glow, 0.6);
      break;
    }
    default: {
      // Through and Through: three in a line, and stronger at each.
      const foes = [[34, 92, 0.85], [62, 66, 1], [92, 38, 1.15]] as const;
      for (const [cx, cy, s] of foes) foeAt(x, t, cx, cy, s);
      arrowAt(x, t, 6, 120, 118, 14, { w: 5.4 });
      for (const [cx, cy, s] of foes) {
        const r = 4 + s * 4;
        energy(x, starP(cx, cy, 8, r * 0.4, r, 0.1), t, cx, cy, r, 0.45);
        glint(x, cx, cy, 6, t.core, 0.9);
      }
    }
  }
};

/** A foe's head and shoulders in shadow, chest at (cx, cy). */
function foeAt(x: Ctx, t: Tone, cx: number, cy: number, s: number): void {
  const body = smoothP([[cx - 12 * s, cy + 16 * s], [cx - 11 * s, cy - 4 * s], [cx - 5 * s, cy - 9 * s], [cx + 5 * s, cy - 9 * s], [cx + 11 * s, cy - 4 * s], [cx + 12 * s, cy + 16 * s]], 0.35);
  body.addPath(circleP(cx, cy - 16 * s, 7 * s));
  obj(x, body, LINEN, t, [cx - 12 * s, cy - 23 * s], [cx + 12 * s, cy + 16 * s], 1.2);
}

// ---------------------------------------------------------------------------
// rnbow
// ---------------------------------------------------------------------------

const rnbow: Glyph = (x, t, v) => {
  switch (v % 6) {
    case 0: {
      // Steady Hand: full draw, held.
      glow(x, 70, 64, 46, t.glow, 0.3);
      const nock = bowAt(x, t, 74, 64, 0, 1, 0.92);
      nocked(x, t, nock, 0, 82);
      // The held breath: a still line under it.
      ray(x, line([[22, 112], [106, 112]]), t, 1.6);
      break;
    }
    case 1: {
      // Twin Shot: two on the string.
      const rot = -0.25;
      const nock = bowAt(x, t, 70, 70, rot, 0.9, 0.9);
      nocked(x, t, nock, rot, 84, -0.09, 4.2);
      nocked(x, t, nock, rot, 84, 0.09, 4.2);
      break;
    }
    case 2: {
      // Fan Fire: a sweep of five.
      const rot = -0.15;
      const nock = bowAt(x, t, 60, 78, rot, 0.85, 0.82);
      for (let i = 0; i < 5; i++) nocked(x, t, nock, rot, 70, (i - 2) * 0.2, 3.6);
      break;
    }
    case 3: {
      // Quick Draw: the string's ghosts as it goes again and again.
      for (let i = 2; i >= 0; i--) {
        const gx = 56 - i * 12;
        const g = line([[66, 14], [gx, 64], [66, 114]]);
        x.save();
        x.globalAlpha = 0.25 + (2 - i) * 0.2;
        ray(x, g, t, 2 - i * 0.4);
        x.restore();
      }
      const nock = bowAt(x, t, 84, 64, 0, 0.55, 0.92);
      nocked(x, t, nock, 0, 64);
      for (let i = 0; i < 3; i++) ray(x, line([[14, 30 + i * 34], [30, 30 + i * 34]]), t, 2.6 - i * 0.4);
      break;
    }
    case 4: {
      // Aimed Shot: a long line to a far ring.
      const nock = bowAt(x, t, 46, 70, 0, 1, 0.8);
      nocked(x, t, nock, 0, 60);
      const sight = new Path2D();
      sight.moveTo(72, 70);
      sight.lineTo(102, 70);
      x.save();
      x.setLineDash([4, 5]);
      x.globalAlpha = 0.8;
      ray(x, sight, t, 1.6);
      x.restore();
      ray(x, circleP(110, 70, 11), t, 2.4);
      ray(x, line([[110, 52], [110, 62]]), t, 1.8);
      ray(x, line([[110, 78], [110, 88]]), t, 1.8);
      glint(x, 110, 70, 6, t.core, 1);
      break;
    }
    default: {
      // Cold Focus: under a closed, calm eye.
      const nock = bowAt(x, t, 72, 78, 0, 0.9, 0.75);
      nocked(x, t, nock, 0, 68);
      const lid = new Path2D();
      lid.moveTo(36, 22);
      lid.quadraticCurveTo(64, 40, 92, 22);
      ray(x, lid, t, 2.6);
      for (let i = 0; i < 5; i++) {
        const lx = 42 + i * 11;
        const ly = 26 + Math.sin((i / 4) * Math.PI) * 8;
        ray(x, line([[lx, ly], [lx - 2 + i, ly + 7]]), t, 1.4);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// rnmark
// ---------------------------------------------------------------------------

/** The daub: a ring, a stroke down it and three dots, in the hunter's red. */
function daubAt(x: Ctx, cx: number, cy: number, s: number): void {
  at(x, cx, cy, 0, s, () => {
    glow(x, 0, 0, 34, RED.glow, 0.6);
    const ring = new Path2D();
    ring.arc(0, 0, 20, -1.3, 4.6);
    ray(x, ring, RED, 5);
    ray(x, line([[-2, -30], [2, 30]]), RED, 4.4);
    for (const [dx, dy] of [[-30, 14], [30, 14], [0, -38]] as const) energy(x, circleP(dx, dy, 4), RED, dx, dy, 6, 0.4);
  });
}

function barkAt(x: Ctx, t: Tone, cx: number, cy: number, rx: number, ry: number): void {
  const p = smoothP([[cx - rx, cy - ry * 0.7], [cx - rx * 0.3, cy - ry], [cx + rx * 0.6, cy - ry * 0.85], [cx + rx, cy - ry * 0.1], [cx + rx * 0.8, cy + ry * 0.8], [cx, cy + ry], [cx - rx * 0.9, cy + ry * 0.6]], 0.35);
  obj(x, p, BARK, t, [cx - rx, cy - ry], [cx + rx, cy + ry], 1.2);
  for (let i = 0; i < 4; i++) {
    const lx = cx - rx * 0.6 + i * rx * 0.4;
    ink(x, line([[lx, cy - ry * 0.7], [lx + 3, cy], [lx - 1, cy + ry * 0.7]]), 1.3, 0.5);
  }
}

const rnmark: Glyph = (x, t, v) => {
  switch (v % 3) {
    case 0:
      barkAt(x, t, 64, 64, 44, 46);
      daubAt(x, 64, 66, 1);
      break;
    case 1:
      // Quarry's End: the mark, and the arrow it was for.
      barkAt(x, t, 58, 72, 40, 40);
      daubAt(x, 58, 74, 0.8);
      arrowAt(x, t, 120, 6, 62, 72, { w: 5.2, trail: 0 });
      energy(x, starP(60, 74, 8, 5, 16, 0.25), RED, 60, 74, 16, 0.45);
      break;
    default: {
      // Open Season: one mark, and two more near it.
      const link = line([[36, 92], [64, 46], [94, 92]]);
      x.save();
      x.globalAlpha = 0.7;
      x.setLineDash([4, 6]);
      ray(x, link, RED, 1.6);
      x.restore();
      daubAt(x, 64, 46, 0.72);
      daubAt(x, 32, 94, 0.5);
      daubAt(x, 96, 94, 0.5);
    }
  }
};

// ---------------------------------------------------------------------------
// rnhead
// ---------------------------------------------------------------------------

/** A broadhead, point toward `rot`, centred at (cx, cy). */
function broadheadAt(x: Ctx, t: Tone, cx: number, cy: number, rot: number, s: number): void {
  at(x, cx, cy, rot, s, () => {
    const p = polyP([[34, 0], [-10, -20], [-4, -6], [-20, -6], [-20, 6], [-4, 6], [-10, 20]]);
    obj(x, p, STEEL, t, [-20, -20], [34, 20], 1);
    // The edge ground bright, and the central ridge.
    ray(x, line([[-6, -14], [30, -1]]), t, 1.2);
    ink(x, line([[-18, 0], [30, 0]]), 1.4, 0.6);
    obj(x, rrectP(-30, -4, 12, 8, 2), CORD, t, [-30, -4], [-18, 4], 0.3);
    glint(x, 14, -6, 5, 0xffffff, 0.85);
  });
}

function heartAt(x: Ctx, cx: number, cy: number, s: number): void {
  at(x, cx, cy, 0, s, () => {
    const p = new Path2D();
    p.moveTo(0, 30);
    p.bezierCurveTo(-44, 2, -30, -34, 0, -16);
    p.bezierCurveTo(30, -34, 44, 2, 0, 30);
    p.closePath();
    solid(x, p, mat([0x1a0404, 0x4a0c0c, 0x8a1a18, 0xc23a30, 0xf08070], 0.3, 'fine', 0.2), { a: [-30, -30], b: [30, 30], size: 1.2, outline: 2.2, outlineColor: 'rgba(6,5,6,.95)' });
    innerEdge(x, p, css(RED.glow, 0.9), 3.5, -2.2, -2.2, 2);
    spec(x, -14, -12, 8, 4, -0.6, 0.55);
  });
}

const rnhead: Glyph = (x, t, v) => {
  switch (v % 6) {
    case 0: {
      // Fletcher's Art: the head and the feather, bound by your own hand.
      at(x, 60, 70, -0.9, 1, () => {
        const vane = smoothP([[-40, 0], [-20, -16], [20, -20], [44, -8], [40, 2], [-36, 4]], 0.4);
        obj(x, vane, FEATHER, t, [-40, -20], [44, 4], 1);
        for (let i = 0; i < 7; i++) ink(x, line([[-30 + i * 10, 2], [-22 + i * 10, -14 + Math.abs(i - 3)]]), 1, 0.45);
        ray(x, line([[-44, 2], [46, 2]]), t, 1.4);
      });
      broadheadAt(x, t, 80, 42, -0.7, 0.95);
      const thread = smoothP([[52, 62], [64, 52], [70, 64], [60, 72]], 0.5);
      ray(x, thread, t, 1.8);
      break;
    }
    case 1: {
      // Arrowsmith: on the whetstone, in sparks.
      const stone = polyP([[16, 96], [104, 82], [112, 100], [24, 114]]);
      obj(x, stone, SLATE, t, [16, 82], [112, 114], 1.1);
      broadheadAt(x, t, 62, 76, -0.16, 1.05);
      for (let i = 0; i < 6; i++) {
        const a = -1.9 + i * 0.28;
        const sx = 96 + Math.cos(a) * 6;
        const sy = 80 + Math.sin(a) * 6;
        ray(x, line([[sx, sy], [sx + Math.cos(a) * (14 + i * 3), sy + Math.sin(a) * (14 + i * 3)]]), t, 1.6);
      }
      glint(x, 96, 80, 10, t.core, 1);
      break;
    }
    case 2: {
      // Close Grouping: three into one bull.
      for (const [r, c] of [[44, 0], [32, 1], [20, 0], [9, 1]] as const) {
        const p = circleP(60, 70, r);
        x.save();
        x.fillStyle = c ? css(sink(t.glow, 0.35)) : css(0xd8ccb0);
        x.fill(p);
        x.lineWidth = 2;
        x.strokeStyle = 'rgba(8,6,6,.9)';
        x.stroke(p);
        x.restore();
      }
      innerEdge(x, circleP(60, 70, 44), 'rgba(0,0,0,.6)', 6, -2, -3, 2);
      for (const [x0, y0, x1, y1] of [[118, 14, 62, 68], [112, 4, 58, 70], [122, 30, 62, 72]] as const) arrowAt(x, t, x0, y0, x1, y1, { w: 4, head: 'none' });
      glow(x, 60, 70, 12, t.glow, 0.8);
      break;
    }
    case 3: {
      // Headshot: the eye, in the cross-hairs.
      const eye = new Path2D();
      eye.moveTo(14, 64);
      eye.quadraticCurveTo(64, 22, 114, 64);
      eye.quadraticCurveTo(64, 106, 14, 64);
      eye.closePath();
      obj(x, eye, BONE, t, [14, 30], [114, 98], 1.2);
      x.save();
      x.clip(eye);
      const iris = circleP(64, 64, 20);
      x.fillStyle = css(sink(t.glow, 0.45));
      x.fill(iris);
      x.fillStyle = 'rgba(6,4,4,.95)';
      x.fill(circleP(64, 64, 9));
      x.restore();
      ray(x, circleP(64, 64, 30), RED, 2.2);
      const ch = new Path2D();
      for (const [ax, ay, bx, by] of [[64, 8, 64, 30], [64, 98, 64, 120], [8, 64, 30, 64], [98, 64, 120, 64]] as const) {
        ch.moveTo(ax, ay);
        ch.lineTo(bx, by);
      }
      ray(x, ch, RED, 2.6);
      glint(x, 58, 58, 5, 0xffffff, 0.9);
      break;
    }
    case 4: {
      // Clean Kill: the first, to the heart.
      heartAt(x, 60, 70, 1.1);
      arrowAt(x, t, 4, 24, 116, 112, { w: 4.8 });
      glow(x, 60, 70, 14, RED.glow, 0.6);
      break;
    }
    default: {
      // Punch Through: out the far side of a plank.
      const plank = polyP([[40, 10], [62, 6], [70, 118], [48, 122]]);
      obj(x, plank, WOOD, t, [40, 6], [70, 122], 1.2);
      for (let i = 0; i < 5; i++) ink(x, line([[46 + i * 4, 12 + i * 3], [52 + i * 4, 118]]), 1, 0.35);
      arrowAt(x, t, 4, 74, 116, 56, { w: 5.2 });
      for (let i = 0; i < 5; i++) {
        const a = -0.9 + i * 0.45;
        const sx = 70 + Math.cos(a) * 6;
        const sy = 64 + Math.sin(a) * 10;
        obj(x, polyP([[sx, sy], [sx + Math.cos(a) * 16, sy + Math.sin(a) * 16 - 2], [sx + Math.cos(a) * 14, sy + Math.sin(a) * 14 + 3]]), WOOD, t, [sx, sy - 6], [sx + 16, sy + 6], 0.3);
      }
      energy(x, starP(70, 63, 7, 4, 12, 0.3), t, 70, 63, 12, 0.5);
    }
  }
};

// ---------------------------------------------------------------------------
// rnhood
// ---------------------------------------------------------------------------

function leafAt(x: Ctx, t: Tone, cx: number, cy: number, rot: number, s: number, m: Mat = LEAF): void {
  at(x, cx, cy, rot, s, () => {
    const p = new Path2D();
    p.moveTo(-26, 0);
    p.quadraticCurveTo(-4, -16, 26, 0);
    p.quadraticCurveTo(-4, 16, -26, 0);
    p.closePath();
    obj(x, p, m, t, [-26, -12], [26, 12], 0.8);
    ink(x, line([[-24, 0], [22, 0]]), 1.2, 0.5);
    for (const sg of [-1, 1]) for (let i = 0; i < 3; i++) ink(x, line([[-12 + i * 10, 0], [-6 + i * 10, sg * 8]]), 0.9, 0.35);
  });
}

const rnhood: Glyph = (x, t, v) => {
  if (v % 2 === 0) {
    // Camouflage: eyes between the leaves.
    x.save();
    x.fillStyle = 'rgba(4,6,3,.9)';
    x.fill(ellipseP(64, 64, 44, 26));
    x.restore();
    for (const sg of [-1, 1]) {
      const eye = new Path2D();
      const ex = 64 + sg * 16;
      eye.moveTo(ex - 9, 64);
      eye.quadraticCurveTo(ex, 57, ex + 9, 64);
      eye.quadraticCurveTo(ex, 69, ex - 9, 64);
      energy(x, eye, t, ex, 64, 10, 0.5);
      x.save();
      x.fillStyle = 'rgba(4,3,2,.95)';
      x.fill(circleP(ex, 63.5, 2.4));
      x.restore();
    }
    for (const [lx, ly, r, s] of [[26, 44, 0.5, 1.05], [96, 40, -0.6, 1.0], [40, 92, -0.3, 1.1], [94, 90, 0.5, 1.05], [64, 30, 0.1, 0.9], [64, 102, -0.1, 0.85], [16, 72, 1.3, 0.8], [112, 70, -1.2, 0.8]] as const) {
      leafAt(x, t, lx, ly, r, s);
    }
    return;
  }
  // Roll Away: tucked, and turning over.
  const arc = new Path2D();
  arc.arc(64, 68, 48, -2.6, 0.2);
  ray(x, arc, t, 3);
  energy(x, polyP([[112, 72], [104, 60], [118, 62]]), t, 112, 66, 10, 0.4);
  const body = circleP(62, 70, 30);
  obj(x, body, LEATHER, t, [32, 40], [92, 100], 1.3);
  const hood = smoothP([[38, 58], [48, 36], [68, 30], [86, 40], [76, 52], [58, 56]], 0.4);
  obj(x, hood, mat([0x0c140a, 0x1e2e18, 0x34502a, 0x527440, 0x7ea060], 0.05, 'weave', 0.35), t, [38, 30], [86, 58], 1);
  x.save();
  x.fillStyle = 'rgba(4,3,2,.95)';
  x.fill(ellipseP(62, 48, 10, 6, -0.3));
  x.restore();
  obj(x, rrectP(40, 70, 46, 8, 4), LEATHER, t, [40, 70], [86, 78], 0.4);
  // Dust where it left the floor.
  for (const [dx, dy, r] of [[22, 108, 7], [36, 114, 5], [12, 116, 4]] as const) {
    x.save();
    x.globalAlpha = 0.55;
    energy(x, circleP(dx, dy, r), { core: 0xe8dcc0, glow: 0x9a8a6a, dark: 0x2a2418 }, dx, dy, r, 0.3);
    x.restore();
  }
};

// ---------------------------------------------------------------------------
// rnstep
// ---------------------------------------------------------------------------

const rnstep: Glyph = (x, t, v) => {
  switch (v % 4) {
    case 0: {
      // Disengage: off backwards, the arrow forwards.
      bootAt(x, t, 46, 82, 0.8, true);
      for (let i = 0; i < 3; i++) ray(x, line([[76 + i * 6, 74 + i * 12], [104 + i * 6, 74 + i * 12]]), t, 2.6 - i * 0.6);
      arrowAt(x, t, 24, 30, 120, 30, { w: 4.6, trail: 14 });
      break;
    }
    case 1: {
      // Light Foot: on a leaf, and it does not bend.
      leafAt(x, t, 64, 104, 0, 1.6);
      bootAt(x, t, 58, 60, 0.82);
      for (let i = 0; i < 3; i++) {
        const p = new Path2D();
        p.arc(64, 86, 30 + i * 8, Math.PI + 0.5, Math.PI * 2 - 0.5);
        x.save();
        x.globalAlpha = 0.7 - i * 0.18;
        ray(x, p, t, 1.8);
        x.restore();
      }
      break;
    }
    case 2: {
      // Slip Free: out of the shackle, broken.
      for (const [cx, rot] of [[30, -0.5], [98, 0.5]] as const) {
        at(x, cx, 98, rot, 1, () => {
          const cuff = new Path2D();
          cuff.arc(0, 0, 16, Math.PI * 0.15, Math.PI * 0.95);
          cuff.arc(0, 0, 9, Math.PI * 0.95, Math.PI * 0.15, true);
          cuff.closePath();
          obj(x, cuff, IRON, t, [-16, 0], [16, 16], 0.7);
        });
      }
      energy(x, starP(64, 104, 7, 4, 14, 0.2), t, 64, 104, 14, 0.5);
      bootAt(x, t, 60, 50, 0.72);
      for (let i = 0; i < 3; i++) ray(x, line([[34 + i * 14, 92 - i * 2], [40 + i * 14, 80 - i * 2]]), t, 2.2);
      break;
    }
    default: {
      // Bolt-Hole: into the burrow.
      const mound = smoothP([[4, 112], [22, 70], [64, 54], [106, 70], [124, 112]], 0.4);
      obj(x, mound, EARTH, t, [4, 54], [124, 112], 1.3);
      x.save();
      x.fillStyle = 'rgba(2,1,1,.98)';
      x.fill(ellipseP(64, 92, 28, 18));
      x.restore();
      innerEdge(x, ellipseP(64, 92, 28, 18), css(t.glow, 0.7), 4, 0, -3, 2);
      for (let i = 0; i < 3; i++) {
        const cy = 18 + i * 14;
        ray(x, line([[50, cy], [64, cy + 10], [78, cy]]), t, 3 - i * 0.5);
      }
      for (const [gx, gy, r] of [[18, 80, -0.5], [108, 80, 0.5]] as const) leafAt(x, t, gx, gy, r, 0.55);
    }
  }
};

// ---------------------------------------------------------------------------
// rnsnare
// ---------------------------------------------------------------------------

function stakeAt(x: Ctx, t: Tone, cx: number, top: number, bottom: number): void {
  obj(x, polyP([[cx - 4, top], [cx + 4, top], [cx + 4, bottom - 8], [cx, bottom], [cx - 4, bottom - 8]]), WOOD, t, [cx - 4, top], [cx + 4, bottom], 0.6);
  obj(x, rrectP(cx - 5, top + 6, 10, 5, 2), CORD, t, [cx - 5, top + 6], [cx + 5, top + 11], 0.3);
}

const rnsnare: Glyph = (x, t, v) => {
  switch (v % 3) {
    case 0: {
      // Snare Trap: a sapling bent down, the noose open under it.
      const ground = smoothP([[8, 112], [40, 104], [88, 106], [122, 114], [122, 124], [8, 124]], 0.3);
      obj(x, ground, EARTH, t, [8, 104], [122, 124], 0.9);
      const sap = new Path2D();
      sap.moveTo(20, 110);
      sap.bezierCurveTo(14, 50, 60, 10, 100, 34);
      x.save();
      x.lineCap = 'round';
      x.strokeStyle = 'rgba(6,4,3,.95)';
      x.lineWidth = 10;
      x.stroke(sap);
      x.strokeStyle = css(WOOD.c[2]);
      x.lineWidth = 6.5;
      x.stroke(sap);
      x.strokeStyle = css(WOOD.c[4], 0.7);
      x.lineWidth = 2;
      x.stroke(sap);
      x.restore();
      leafAt(x, t, 104, 26, -0.4, 0.5);
      leafAt(x, t, 78, 20, 0.4, 0.45);
      ray(x, line([[100, 36], [94, 70]]), t, 1.8);
      const noose = ellipseP(86, 96, 24, 9);
      ray(x, noose, t, 3);
      obj(x, rrectP(89, 66, 9, 10, 3), CORD, t, [89, 66], [98, 76], 0.3);
      break;
    }
    case 1: {
      // Tripwire: run taut between two stakes, and struck.
      stakeAt(x, t, 18, 46, 112);
      stakeAt(x, t, 110, 46, 112);
      const wire = line([[22, 60], [64, 66], [106, 60]]);
      ray(x, wire, t, 2.2);
      energy(x, starP(64, 66, 8, 5, 16, 0.2), t, 64, 66, 16, 0.5);
      // What went over it, going down.
      for (let i = 0; i < 3; i++) {
        const p = new Path2D();
        p.arc(64, 66, 22 + i * 10, -2.4, -0.7);
        x.save();
        x.globalAlpha = 0.65 - i * 0.15;
        ray(x, p, t, 2);
        x.restore();
      }
      break;
    }
    default: {
      // Trap Mastery: a coil of cord in a trapper's knot, and its hook.
      for (let i = 0; i < 4; i++) {
        const ring = ellipseP(58, 70 - i * 4, 34 - i * 3, 22 - i * 2);
        x.save();
        x.lineWidth = 7;
        x.strokeStyle = 'rgba(6,4,3,.95)';
        x.stroke(ring);
        x.lineWidth = 4.5;
        x.strokeStyle = css(CORD.c[2 + (i % 2)]);
        x.stroke(ring);
        x.lineWidth = 1.2;
        x.strokeStyle = css(CORD.c[4], 0.6);
        x.stroke(ring);
        x.restore();
      }
      const knot = smoothP([[80, 46], [96, 38], [104, 52], [92, 60], [84, 54]], 0.5);
      obj(x, knot, CORD, t, [80, 38], [104, 60], 0.6);
      const hook = new Path2D();
      hook.moveTo(100, 56);
      hook.lineTo(104, 92);
      hook.arc(96, 92, 8, 0, Math.PI * 0.9);
      x.save();
      x.lineCap = 'round';
      x.lineWidth = 6;
      x.strokeStyle = 'rgba(6,4,3,.95)';
      x.stroke(hook);
      x.lineWidth = 3.5;
      x.strokeStyle = css(IRON.c[3]);
      x.stroke(hook);
      x.restore();
      glint(x, 104, 76, 5, t.core, 0.9);
      ray(x, circleP(58, 66, 46), t, 1.4);
    }
  }
};

// ---------------------------------------------------------------------------
// rnplate
// ---------------------------------------------------------------------------

/** A plate in the floor seen from above and in front, `w` wide. */
function plateAt(x: Ctx, t: Tone, cx: number, cy: number, w: number): void {
  const h = w * 0.42;
  const p = polyP([[cx - w / 2, cy], [cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2]]);
  obj(x, p, WOOD, t, [cx - w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], 0.8);
  ink(x, line([[cx - w * 0.25, cy - h * 0.25], [cx + w * 0.25, cy + h * 0.25]]), 1.2, 0.5);
}

function spikeAt(x: Ctx, t: Tone, cx: number, base: number, h: number, lean: number, w = 6): void {
  const p = polyP([[cx - w / 2, base], [cx + lean, base - h], [cx + w / 2, base]]);
  obj(x, p, IRON, t, [cx - w, base - h], [cx + w, base], 0.6);
  glint(x, cx + lean, base - h + 2, 3, t.core, 0.8);
}

const rnplate: Glyph = (x, t, v) => {
  switch (v % 3) {
    case 0: {
      // Spike Trap: up through the plate.
      glow(x, 64, 86, 44, t.glow, 0.4);
      plateAt(x, t, 64, 92, 100);
      for (const [sx, h, lean] of [[34, 40, -6], [50, 58, -3], [64, 70, 0], [78, 58, 3], [94, 40, 6]] as const) spikeAt(x, t, sx, 94, h, lean, 9);
      for (const [sx, sy] of [[26, 84], [104, 84], [64, 108]] as const) glint(x, sx, sy, 6, t.core, 0.6);
      break;
    }
    case 1: {
      // The Whole Floor Is A Trap: every board of it.
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const cx = 64 + (c - r) * 22;
          const cy = 52 + (c + r) * 11;
          plateAt(x, t, cx, cy, 40);
          if ((r + c) % 2 === 0) for (const [dx, h] of [[-6, 16], [0, 24], [6, 16]] as const) spikeAt(x, t, cx + dx, cy + 2, h, dx * 0.3, 4.5);
        }
      }
      ray(x, ellipseP(64, 74, 58, 30), t, 1.6);
      break;
    }
    default: {
      // Lay of the Land: spikes up out of the print you stood in, the next
      // step already gone on ahead.
      glow(x, 62, 100, 44, t.glow, 0.45);
      const print = (fx: number, fy: number, s: number, a: number): void => {
        x.save();
        x.globalAlpha = a;
        x.translate(fx, fy);
        x.scale(s, s * 0.5);
        x.rotate(0.9);
        const sole = smoothP([[-9, -22], [3, -26], [11, -16], [10, -2], [2, 4], [-8, 2], [-12, -10]], 0.4);
        sole.addPath(smoothP([[-8, 10], [6, 10], [8, 20], [0, 26], [-8, 22]], 0.4));
        x.fillStyle = 'rgba(4,3,2,.9)';
        x.fill(sole);
        x.fillStyle = css(t.glow, 0.3);
        x.fill(sole);
        ray(x, sole, t, 2.6 / s);
        x.restore();
      };
      print(100, 52, 1.1, 0.6);
      print(52, 100, 1.7, 1);
      for (const [sx, base, h, lean] of [[30, 108, 16, -3], [40, 105, 20, -2], [58, 98, 32, -3], [68, 95, 48, 0], [78, 93, 40, 3], [87, 91, 26, 5]] as const) spikeAt(x, t, sx, base, h, lean, 8);
      for (const [gx, gy] of [[20, 110], [96, 96]] as const) glint(x, gx, gy, 5, t.core, 0.6);
    }
  }
};

// ---------------------------------------------------------------------------
// rnbramble, rnherb, rnpot, rnnest
// ---------------------------------------------------------------------------

const rnbramble: Glyph = (x, t) => {
  // Thorn Barrier: a wall of it, across.
  x.save();
  x.translate(64, 108);
  x.scale(1, 0.25);
  glow(x, 0, 0, 60, t.glow, 0.7);
  x.restore();
  for (const [cx, r, lw] of [[30, 30, 7], [64, 40, 8], [98, 30, 7], [46, 22, 5], [82, 22, 5]] as const) {
    const vine = new Path2D();
    vine.arc(cx, 108, r, Math.PI, Math.PI * 2);
    x.save();
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(6,4,3,.95)';
    x.lineWidth = lw + 3;
    x.stroke(vine);
    x.strokeStyle = css(THORN.c[2]);
    x.lineWidth = lw;
    x.stroke(vine);
    x.strokeStyle = css(THORN.c[4], 0.6);
    x.lineWidth = 1.4;
    x.stroke(vine);
    x.restore();
    const n = Math.round(r / 5);
    for (let i = 1; i < n; i++) {
      const a = Math.PI + (i / n) * Math.PI;
      const px = cx + Math.cos(a) * r;
      const py = 108 + Math.sin(a) * r;
      const out = i % 2 ? 1 : -1;
      const tx = px + Math.cos(a) * 9 * out;
      const ty = py + Math.sin(a) * 9 * out;
      obj(x, polyP([[px - Math.sin(a) * 2.6, py + Math.cos(a) * 2.6], [tx, ty], [px + Math.sin(a) * 2.6, py - Math.cos(a) * 2.6]]), THORN, t, [px - 3, py - 3], [tx, ty], 0.25);
    }
  }
  leafAt(x, t, 30, 70, -0.6, 0.5);
  leafAt(x, t, 100, 74, 0.6, 0.5);
  leafAt(x, t, 64, 62, 0.2, 0.45);
};

const rnherb: Glyph = (x, t) => {
  // Survivalist: herbs from the wayside, bound in linen.
  for (const [rot, s, y] of [[-0.5, 1, 40], [0.05, 1.1, 32], [0.55, 1, 42]] as const) {
    at(x, 64, 84, rot, 1, () => {
      x.save();
      x.lineCap = 'round';
      x.strokeStyle = 'rgba(6,4,3,.9)';
      x.lineWidth = 5;
      x.beginPath();
      x.moveTo(0, 34);
      x.lineTo(0, -y);
      x.stroke();
      x.strokeStyle = css(LEAF.c[2]);
      x.lineWidth = 2.6;
      x.stroke();
      x.restore();
    });
    const tx = 64 + Math.sin(rot) * (y + 10);
    const ty = 84 - Math.cos(rot) * (y + 10);
    leafAt(x, t, tx, ty, rot - Math.PI / 2, 0.7 * s);
    leafAt(x, t, 64 + Math.sin(rot) * y * 0.55 + 10, 84 - Math.cos(rot) * y * 0.55, rot - 0.6, 0.42 * s);
  }
  const wrap = polyP([[44, 90], [84, 86], [86, 106], [42, 110]]);
  obj(x, wrap, LINEN, t, [42, 86], [86, 110], 0.8);
  for (const y of [94, 102]) ink(x, line([[44, y], [85, y - 3]]), 1.1, 0.5);
  energy(x, polyP([[58, 92], [70, 92], [70, 96], [58, 96]]), RED, 64, 94, 8, 0.3);
  energy(x, polyP([[62, 88], [66, 88], [66, 100], [62, 100]]), RED, 64, 94, 8, 0.3);
};

const rnpot: Glyph = (x, t) => {
  // Venom Coat: the heads dipped, the pot brimming.
  for (const [x0, rot] of [[44, -0.4], [64, 0], [84, 0.4]] as const) {
    at(x, x0, 60, rot, 1, () => {
      obj(x, rrectP(-2.5, -54, 5, 50, 2), WOOD, { ...t }, [-2, -54], [2, 0], 0.3);
      obj(x, polyP([[0, 8], [-8, -6], [-2.5, -4], [2.5, -4], [8, -6]]), STEEL, t, [-8, -6], [8, 8], 0.4);
    });
  }
  const pot = smoothP([[30, 70], [98, 70], [104, 92], [88, 116], [40, 116], [24, 92]], 0.35);
  obj(x, pot, CLAY, t, [24, 70], [104, 116], 1.3);
  obj(x, ellipseP(64, 70, 36, 8), CLAY, t, [28, 62], [100, 78], 0.6);
  energy(x, ellipseP(64, 70, 30, 5.5), t, 64, 70, 30, 0.45);
  for (const [dx, dy, r] of [[40, 84, 3.4], [88, 86, 3], [62, 98, 2.6]] as const) energy(x, dropAt(dx, dy, r), t, dx, dy, r * 2.4, 0.4);
  for (let i = 0; i < 3; i++) {
    const p = new Path2D();
    const sx = 50 + i * 14;
    p.moveTo(sx, 60);
    p.quadraticCurveTo(sx - 8, 44, sx + 2, 32 - i * 4);
    x.save();
    x.globalAlpha = 0.5;
    ray(x, p, t, 2);
    x.restore();
  }
};

const rnnest: Glyph = (x, t) => {
  // Wasp Nest: paper on a twig, and they are out.
  const twig = new Path2D();
  twig.moveTo(8, 22);
  twig.quadraticCurveTo(64, 10, 120, 26);
  x.save();
  x.lineCap = 'round';
  x.strokeStyle = 'rgba(6,4,3,.95)';
  x.lineWidth = 8;
  x.stroke(twig);
  x.strokeStyle = css(BARK.c[3]);
  x.lineWidth = 4.5;
  x.stroke(twig);
  x.restore();
  const nest = smoothP([[58, 18], [76, 22], [86, 44], [84, 74], [72, 96], [60, 100], [46, 90], [38, 66], [42, 38]], 0.4);
  obj(x, nest, PAPER, t, [38, 18], [86, 100], 1.3);
  x.save();
  x.clip(nest);
  for (let i = 0; i < 6; i++) {
    const p = new Path2D();
    p.ellipse(62, 30 + i * 12, 28, 6, 0, 0, Math.PI);
    x.strokeStyle = css(PAPER.c[1], 0.8);
    x.lineWidth = 2;
    x.stroke(p);
  }
  x.restore();
  x.save();
  x.fillStyle = 'rgba(4,2,1,.95)';
  x.fill(ellipseP(60, 92, 8, 5));
  x.restore();
  // The swarm: small bodies with wings lit.
  for (const [wx, wy, r] of [[86, 100, 0.4], [100, 82, -0.3], [36, 108, 0.8], [104, 112, 0.1], [24, 84, -0.6], [76, 118, 0.3]] as const) {
    at(x, wx, wy, r, 1, () => {
      for (const sg of [-1, 1]) {
        x.save();
        x.globalAlpha = 0.8;
        energy(x, ellipseP(sg * 3, -4, 4, 2.4, sg * 0.6), t, sg * 3, -4, 5, 0.4);
        x.restore();
      }
      const body = ellipseP(0, 0, 5, 2.8);
      solid(x, body, mat([0x0a0804, 0x2a2208, 0x8a6a10, 0xd8b030, 0xfff0a0], 0.2, null), { a: [-5, -3], b: [5, 3], size: 0.3, outline: 1.2, outlineColor: 'rgba(6,5,6,.95)' });
    });
  }
  ray(x, line([[70, 102], [84, 100], [96, 84]]), t, 1.2);
};

// ---------------------------------------------------------------------------
// rnkestrel
// ---------------------------------------------------------------------------

/** The bird. `fold` 0 wings spread wide, 1 swept back in the stoop. */
function kestrelAt(x: Ctx, t: Tone, cx: number, cy: number, rot: number, s: number, fold: number): void {
  at(x, cx, cy, rot, s, () => {
    // Facing +x. Tail fanned behind, wings above and below the body.
    const tail = polyP([[-20, 0], [-44, -9 + fold * 4], [-48, 0], [-44, 9 - fold * 4]]);
    obj(x, tail, KESTREL, t, [-48, -9], [-20, 9], 0.6);
    for (let i = 0; i < 3; i++) ink(x, line([[-42 + i * 6, -6], [-42 + i * 6, 6]]), 1, 0.5);
    for (const sg of [-1, 1]) {
      const reach = 46 - fold * 18;
      const back = -10 - fold * 20;
      const wing = smoothP([[6, sg * 3], [-4 + back * 0.3, sg * (reach * 0.55)], [back, sg * reach], [back - 6, sg * (reach - 6)], [-14, sg * 6]], 0.3);
      obj(x, wing, KESTREL, t, [back, sg * reach], [6, 0], 0.9);
      for (let i = 0; i < 4; i++) {
        const f = (i + 1) / 5;
        ink(x, line([[back * f - 2, sg * (reach * f * 0.9)], [back * f - 10, sg * (reach * f * 0.9 + 4)]]), 1, 0.5);
      }
    }
    const body = ellipseP(0, 0, 22, 8);
    obj(x, body, KESTREL, t, [-22, -8], [22, 8], 0.8);
    const head = circleP(20, 0, 7.5);
    obj(x, head, mat([0x14161c, 0x2e3440, 0x5a6474, 0x8a96a8, 0xc8d0dc], 0, 'fine', 0.3), t, [12, -7], [28, 7], 0.5);
    obj(x, polyP([[27, -2.5], [33, 0], [27, 3]]), BONE, t, [27, -3], [33, 3], 0.2);
    glint(x, 22, -2.5, 2.4, 0xffffff, 0.9);
  });
}

const rnkestrel: Glyph = (x, t, v) => {
  if (v % 2 === 0) {
    // Kestrel: in the stoop.
    for (let i = 0; i < 4; i++) {
      const o = (i - 1.5) * 10;
      x.save();
      x.globalAlpha = 0.45 + i * 0.12;
      ray(x, line([[22 + o, 8 - o * 0.2], [48 + o, 38 - o * 0.2]]), t, 2.2);
      x.restore();
    }
    kestrelAt(x, t, 72, 72, Math.PI * 0.27, 1, 0.55);
    energy(x, starP(104, 110, 6, 4, 12, 0.2), t, 104, 110, 12, 0.5);
    return;
  }
  // Huntcraft: high over the tracks it reads.
  for (const [px, py] of [[30, 112], [52, 100], [76, 110], [98, 98]] as const) {
    x.save();
    x.fillStyle = 'rgba(4,3,2,.85)';
    x.fill(ellipseP(px, py, 5, 3.5));
    for (const [dx, dy] of [[-5, -6], [0, -8], [5, -6]] as const) x.fill(circleP(px + dx, py + dy, 1.8));
    x.restore();
    innerEdge(x, ellipseP(px, py, 5, 3.5), css(t.glow, 0.7), 2, 0, -1, 1);
  }
  kestrelAt(x, t, 64, 46, -Math.PI / 2, 0.95, 0);
  const arc = new Path2D();
  arc.ellipse(64, 50, 54, 18, 0, Math.PI * 0.1, Math.PI * 0.9);
  x.save();
  x.globalAlpha = 0.6;
  ray(x, arc, t, 1.6);
  x.restore();
};

// ---------------------------------------------------------------------------
// rnquiver
// ---------------------------------------------------------------------------

/** A quiver with its mouth at (mx, my), lying along `rot` (mouth end first). */
function quiverAt(x: Ctx, t: Tone, cx: number, cy: number, rot: number, s: number, arrows: number, spread: number): void {
  at(x, cx, cy, rot, s, () => {
    // Fletchings out of the mouth (the mouth is at y = -40).
    for (let i = 0; i < arrows; i++) {
      const a = (arrows === 1 ? 0 : (i / (arrows - 1) - 0.5)) * spread;
      const len = 26 + (i % 2) * 6;
      const tx = Math.sin(a) * len;
      const ty = -40 - Math.cos(a) * len;
      x.save();
      x.translate(tx * 0.3, -40);
      x.restore();
      arrowAt(x, t, tx, ty, Math.sin(a) * -10, -40 + Math.cos(a) * 30, { w: 3.6, head: 'none' });
    }
    const body = smoothP([[-14, -42], [14, -42], [12, 44], [-12, 44]], 0.2);
    obj(x, body, LEATHER, t, [-14, -42], [14, 44], 1.2);
    obj(x, rrectP(-16, -46, 32, 8, 3), LEATHER, t, [-16, -46], [16, -38], 0.4);
    for (const y of [-14, 16]) obj(x, rrectP(-14, y, 28, 5, 2), CORD, t, [-14, y], [14, y + 5], 0.3);
    obj(x, rrectP(-11, 40, 22, 8, 3), BONE, t, [-11, 40], [11, 48], 0.3);
    spec(x, -6, -10, 3, 18, 0.05, 0.4);
  });
}

const rnquiver: Glyph = (x, t, v) => {
  switch (v % 3) {
    case 0: {
      // Open Quiver: the flap thrown back and the arrows coming.
      quiverAt(x, t, 46, 78, -Math.PI * 0.3, 0.9, 5, 0.9);
      for (const [fx, fy, r] of [[96, 22, 0.5], [110, 52, -0.4], [80, 12, 1.1]] as const) {
        at(x, fx, fy, r, 0.5, () => {
          const vane = smoothP([[-24, 0], [-10, -9], [14, -11], [26, -4], [24, 2], [-20, 3]], 0.4);
          obj(x, vane, FEATHER, t, [-24, -11], [26, 3], 0.6);
        });
      }
      for (let i = 0; i < 3; i++) {
        const p = new Path2D();
        p.arc(48, 76, 44 + i * 9, -1.4, -0.3);
        x.save();
        x.globalAlpha = 0.6 - i * 0.15;
        ray(x, p, t, 1.8);
        x.restore();
      }
      break;
    }
    case 1: {
      // Endless Quiver: an arrow that comes round again.
      const loop = new Path2D();
      loop.ellipse(64, 66, 50, 24, -0.35, 0.3, Math.PI * 1.8);
      ray(x, loop, t, 2.4);
      quiverAt(x, t, 64, 74, 0.2, 0.95, 4, 0.5);
      const a = Math.PI * 1.8;
      const ex = 64 + Math.cos(a) * 50 * Math.cos(-0.35) - Math.sin(a) * 24 * Math.sin(-0.35);
      const ey = 66 + Math.cos(a) * 50 * Math.sin(-0.35) + Math.sin(a) * 24 * Math.cos(-0.35);
      arrowAt(x, t, ex - 26, ey + 14, ex + 6, ey - 4, { w: 4.2 });
      break;
    }
    default:
      // Volley Mastery: packed full.
      quiverAt(x, t, 64, 74, -0.1, 0.95, 8, 1.1);
  }
};

// ---------------------------------------------------------------------------
// rnvolley
// ---------------------------------------------------------------------------

/** A falling arrow, point down along `a` (radians from straight down). */
function fallAt(x: Ctx, t: Tone, cx: number, cy: number, len: number, a: number, w = 3.4, trail = 10): void {
  const dx = Math.sin(a) * len;
  const dy = Math.cos(a) * len;
  arrowAt(x, t, cx - dx, cy - dy, cx, cy, { w, trail });
}

const rnvolley: Glyph = (x, t, v) => {
  switch (v % 4) {
    case 0: {
      // Arrow Rain: down into the ring.
      x.save();
      x.translate(64, 104);
      x.scale(1, 0.3);
      glow(x, 0, 0, 56, t.glow, 0.7);
      ray(x, circleP(0, 0, 48), t, 5);
      x.restore();
      for (const [cx, cy, s] of [[34, 98, 0.9], [52, 106, 1], [70, 96, 0.95], [88, 104, 1], [104, 96, 0.85], [44, 70, 0.8], [80, 66, 0.85], [62, 52, 0.75]] as const) {
        fallAt(x, t, cx, cy, 38 * s, -0.35, 3.4 * s, 8);
      }
      break;
    }
    case 1: {
      // Creeping Barrage: each fall a step nearer.
      for (let row = 0; row < 3; row++) {
        const y = 52 + row * 30;
        const s = 0.55 + row * 0.22;
        x.save();
        x.translate(64, y + 4);
        x.scale(1, 0.18);
        glow(x, 0, 0, 30 + row * 14, t.glow, 0.5 + row * 0.15);
        x.restore();
        for (let i = 0; i < 3 + row; i++) {
          const cx = 64 + (i - (2 + row) / 2) * (20 + row * 4);
          fallAt(x, t, cx, y, 30 * s, -0.3, 3.4 * s, 4);
        }
      }
      for (let i = 0; i < 2; i++) ray(x, line([[54, 30 + i * 30], [64, 38 + i * 30], [74, 30 + i * 30]]), t, 2.2);
      break;
    }
    case 2: {
      // Darken The Sky: so many the light goes.
      const cloud = smoothP([[6, 30], [24, 10], [52, 14], [70, 4], [98, 10], [122, 26], [116, 44], [10, 46]], 0.4);
      x.save();
      x.fillStyle = 'rgba(8,8,12,.92)';
      x.fill(cloud);
      x.restore();
      innerEdge(x, cloud, css(t.glow, 0.8), 5, 0, 3, 2);
      // The sun's rim behind it.
      const rim = new Path2D();
      rim.arc(98, 18, 20, Math.PI * 0.95, Math.PI * 1.9);
      ray(x, rim, t, 2.4);
      for (let i = 0; i < 9; i++) {
        const cx = 16 + i * 12;
        const cy = 78 + ((i * 37) % 3) * 14;
        fallAt(x, t, cx, cy, 30, -0.25, 3, 6);
      }
      break;
    }
    default: {
      // Thicket of Shafts: the floor bristles where it fell.
      const ground = smoothP([[4, 100], [64, 92], [124, 100], [124, 124], [4, 124]], 0.3);
      obj(x, ground, EARTH, t, [4, 92], [124, 124], 1);
      for (const [cx, base, h, lean] of [[22, 104, 44, -0.3], [36, 100, 58, 0.15], [50, 104, 40, -0.1], [62, 98, 66, 0.05], [76, 104, 46, 0.25], [90, 100, 56, -0.2], [104, 104, 42, 0.3]] as const) {
        const tx = cx + Math.sin(lean) * h;
        const ty = base - Math.cos(lean) * h;
        // Point in the floor: drawn from the fletching down.
        arrowAt(x, t, tx, ty, cx, base + 6, { w: 3.4, head: 'none' });
      }
      x.save();
      x.translate(64, 106);
      x.scale(1, 0.2);
      glow(x, 0, 0, 56, t.glow, 0.6);
      x.restore();
    }
  }
};

// ---------------------------------------------------------------------------
// rnwheel
// ---------------------------------------------------------------------------

const rnwheel: Glyph = (x, t, v) => {
  switch (v % 4) {
    case 0: {
      // Arrow Wheel: every way at once.
      glow(x, 64, 64, 30, t.glow, 0.7);
      ray(x, circleP(64, 64, 12), t, 2.4);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        arrowAt(x, t, 64 + Math.cos(a) * 16, 64 + Math.sin(a) * 16, 64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58, { w: 3.6 });
      }
      break;
    }
    case 1: {
      // Suppressing Fire: one after another down the line, never a gap.
      for (let i = 0; i < 4; i++) {
        const o = i * 26;
        x.save();
        x.globalAlpha = 0.45 + i * 0.18;
        arrowAt(x, t, 8 + o, 120 - o, 30 + o, 98 - o, { w: 4.2 + i * 0.4, trail: 10 });
        x.restore();
      }
      glow(x, 112, 16, 16, t.glow, 0.7);
      break;
    }
    case 2: {
      // Scattershot: sprayed from the hip.
      glow(x, 22, 104, 18, t.glow, 0.7);
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 4 + (i - 2.5) * 0.17;
        const len = 66 + ((i * 7) % 3) * 10;
        arrowAt(x, t, 22 + Math.cos(a) * 10, 104 + Math.sin(a) * 10, 22 + Math.cos(a) * len, 104 + Math.sin(a) * len, { w: 3.4 });
      }
      energy(x, starP(22, 104, 6, 4, 11, 0.3), t, 22, 104, 11, 0.5);
      break;
    }
    default: {
      // Murmuration: one becomes two, two become four.
      arrowAt(x, t, 4, 70, 40, 64, { w: 4.6, trail: 0 });
      energy(x, starP(44, 64, 6, 4, 10, 0.2), t, 44, 64, 10, 0.5);
      const forks: Array<[number, number, number, number]> = [
        [46, 62, 76, 40], [46, 66, 76, 88],
        [78, 38, 112, 22], [78, 40, 114, 50], [78, 86, 114, 78], [78, 90, 112, 108],
      ];
      for (const [x0, y0, x1, y1] of forks) {
        const p = line([[x0, y0], [x1, y1]]);
        x.save();
        x.globalAlpha = 0.5;
        ray(x, p, t, 1.4);
        x.restore();
      }
      for (const [x0, y0, x1, y1] of forks.slice(2)) arrowAt(x, t, x0 + (x1 - x0) * 0.35, y0 + (y1 - y0) * 0.35, x1, y1, { w: 2.8, fletch: true });
      for (const [cx, cy] of [[78, 39], [78, 88]] as const) glint(x, cx, cy, 5, t.core, 0.9);
    }
  }
};

export const RANGER_GLYPHS: Record<string, Glyph> = {
  rnshaft, rnbow, rnmark, rnhead, rnhood, rnstep, rnsnare, rnplate, rnbramble, rnherb, rnpot, rnnest, rnkestrel, rnquiver, rnvolley, rnwheel,
};
