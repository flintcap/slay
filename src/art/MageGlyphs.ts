/**
 * SLAY: the Mage's own pictograms, spread into `GLYPHS` (`Glyphs.ts`).
 *
 * Same 128-unit canvas and painting rules as the shared set: emissive shapes
 * for fire and lightning, solid objects (wood, bronze, basalt, scale) caught
 * by the tone's back light. Only `./Paint` is imported at run time, so the
 * shared module can spread this one in without a cycle.
 *
 * The fire tree (Conflagration), one picture per skill:
 *
 *   mgsigil     a ring of fire round a burning triangle (Fire Mastery)
 *   mgbolt      a slim dart of flame in flight, streaks behind (Firebolt)
 *   mgembers    tongues of flame flung out round a white heart (Ember Nova)
 *   mgmelt      an iron shield with a molten hole burned through (Scorch)
 *   mgfireball  a great ball of fire, its flames thrown back (Fireball)
 *   mgstream    a jet of fire widening from a bright source (Inferno Stream)
 *   mgkindling  two crossed logs just catching, a crit spark (Kindling)
 *   mgblast     a flash and two shock rings throwing rock out (Blast Wave)
 *   mgerupt     a row of lava fountains, each taller (Pyroclasm)
 *   mgbomb      a cracked black body, fire bursting out of it (Combustion)
 *   mgshimmer   heat rising off embers in wavering lines (Heat Shimmer)
 *   mgmeteors   burning stones raining down slantwise (Firestorm)
 *   mgcore      a molten core with a fire chevron rising (Searing Core)
 *   mgdragon    a dragon's head breathing a gout of fire (Dragon's Breath)
 *   mgchain     three blazes, each lit from the last (Cataclysm)
 *   mgimplode   streaks drawn in to a white sphere (Annihilate)
 *   mgsoul      a flame with a face over a drained crystal (Ember Soul)
 *
 * And the lightning tree's Sparkbolt:
 *
 *   mgspark     a crackling spark jinking along a broken path (Sparkbolt)
 */
import type { Glyph, Tone } from './Glyphs';
import {
  type Ctx,
  type Pt,
  circleP,
  css,
  ellipseP,
  emissiveStroke,
  gem,
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
  spec,
  starP,
} from './Paint';

const WOOD = mat([0x1c120a, 0x3c2816, 0x694829, 0x946b42, 0xbf9466], 0.05, 'grain', 0.45, 0.6);
const IRON = mat([0x101216, 0x24282e, 0x434a52, 0x737c86, 0xb8c0ca], 0.8, 'hammered', 0.35);
const BASALT = mat([0x0a0808, 0x1c1716, 0x342c2a, 0x564a46, 0x82746e], 0, 'crack', 0.5);
const SCALE = mat([0x0e0605, 0x2c120c, 0x52241a, 0x7e3c26, 0xb46a42], 0.3, 'scales', 0.55, 0.7);
const HORN = mat([0x1a1610, 0x3a3226, 0x6a5c46, 0x9c8a6c, 0xd6c6a2], 0.1, 'grain', 0.3, 0.5);

// ---------------------------------------------------------------------------
// Paint modes
// ---------------------------------------------------------------------------

function obj(x: Ctx, p: Path2D, m: typeof WOOD, t: Tone, a: Pt = [34, 30], b: Pt = [94, 98], size = 1.4): void {
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

/** Runs `fn` with `a` lowered to `alpha`. */
function faded(x: Ctx, alpha: number, fn: () => void): void {
  x.save();
  x.globalAlpha = alpha;
  fn();
  x.restore();
}

/** Turns a local point (tip up along -y) by `rot` and scales it by `s` and `len` about (cx, cy). */
function at(cx: number, cy: number, s: number, rot: number, len = 1): (px: number, py: number) => Pt {
  const c = Math.cos(rot);
  const n = Math.sin(rot);
  return (px, py) => {
    const lx = px * s;
    const ly = py * s * len;
    return [cx + lx * c - ly * n, cy + lx * n + ly * c];
  };
}

/**
 * A single tongue of flame, its base at (cx, cy) and its tip `50 * s * len`
 * away along `rot` (0 points up, PI/2 points right).
 */
function tonguePath(cx: number, cy: number, s: number, rot = 0, len = 1): Path2D {
  const P = at(cx, cy, s, rot, len);
  return smoothP([P(0, -50), P(10, -26), P(20, -8), P(22, 10), P(12, 24), P(0, 28), P(-12, 24), P(-22, 10), P(-18, -10), P(-8, -24)], 0.5);
}

/** A tongue of flame with a white-hot heart at its root. */
function tongue(x: Ctx, t: Tone, cx: number, cy: number, s: number, rot = 0, len = 1, hot = 0.45): void {
  const P = at(cx, cy, s, rot, len);
  const [hx, hy] = P(0, 10);
  energy(x, tonguePath(cx, cy, s, rot, len), t, hx, hy, 52 * s * Math.max(1, len), hot);
  const [ix, iy] = P(0, 12);
  const inner = tonguePath(ix, iy, s * 0.48, rot, len);
  x.save();
  x.globalCompositeOperation = 'lighter';
  const g = x.createRadialGradient(hx, hy, 1, hx, hy, 26 * s);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, css(t.core, 0.9));
  g.addColorStop(1, css(t.core, 0));
  x.fillStyle = g;
  x.fill(inner);
  x.restore();
}

/** Short parallel speed streaks behind something flying along (dx, dy). */
function streaks(x: Ctx, t: Tone, cx: number, cy: number, dx: number, dy: number, n: number, gap: number, len: number, w = 2.6): void {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * gap;
    const sx = cx - uy * o;
    const sy = cy + ux * o;
    const k = 1 - Math.abs(o) / (gap * n);
    const p = new Path2D();
    p.moveTo(sx, sy);
    p.lineTo(sx - ux * len * k, sy - uy * len * k);
    faded(x, 0.5 + 0.4 * k, () => ray(x, p, t, w));
  }
}

/** A chunk of rock, roughly round. */
function rock(x: Ctx, t: Tone, cx: number, cy: number, r: number, seed: number): void {
  const pts: Pt[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + seed;
    const k = 0.75 + 0.25 * Math.abs(Math.sin(seed * 13 + i * 2.7));
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]);
  }
  obj(x, polyP(pts), BASALT, t, [cx - r, cy - r], [cx + r, cy + r], 0.4);
}

/** Glowing cracks clipped into a shape. */
function cracks(x: Ctx, clip: Path2D, t: Tone, lines: readonly (readonly Pt[])[], w = 2.4): void {
  const p = new Path2D();
  for (const l of lines) {
    p.moveTo(l[0]![0], l[0]![1]);
    for (let i = 1; i < l.length; i++) p.lineTo(l[i]![0], l[i]![1]);
  }
  x.save();
  x.clip(clip);
  ray(x, p, t, w);
  x.restore();
}

// ---------------------------------------------------------------------------
// The fire tree
// ---------------------------------------------------------------------------

/** Fire Mastery: a ring of fire round a burning triangle, the fire rune. */
const mgsigil: Glyph = (x, t) => {
  glow(x, 64, 64, 56, t.glow, 0.55);
  ray(x, circleP(64, 64, 44), t, 4.5);
  // Six small flames standing on the ring.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    tongue(x, t, 64 + Math.sin(a) * 44, 64 - Math.cos(a) * 44, 0.18, a, 1.1, 0.5);
  }
  const tri = polyP([[64, 24], [98, 84], [30, 84]]);
  ray(x, tri, t, 4);
  tongue(x, t, 64, 74, 0.5, 0, 1.05);
};

/** Firebolt: a slim dart of flame in flight, its head bright, streaks behind. */
const mgbolt: Glyph = (x, t) => {
  glow(x, 86, 42, 44, t.glow, 0.6);
  const dir = Math.PI / 4;
  streaks(x, t, 52, 76, 1, -1, 3, 14, 34);
  // The dart: a long tongue pointing up and right, its root at the lower left.
  tongue(x, t, 40, 88, 0.62, dir, 1.55, 0.4);
  // A hot round head where it leads.
  energy(x, circleP(88, 40, 11), t, 86, 38, 14, 0.75);
  glint(x, 90, 36, 12, 0xffffff, 0.9);
};

/** Ember Nova: tongues of flame flung out round a white-hot heart. */
const mgembers: Glyph = (x, t) => {
  glow(x, 64, 64, 60, t.glow, 0.6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 22 + (i % 2) * 6;
    tongue(x, t, 64 + Math.sin(a) * r, 64 - Math.cos(a) * r, 0.24 + (i % 2) * 0.05, a, 1.25, 0.5);
  }
  energy(x, circleP(64, 64, 14), t, 62, 62, 16, 0.8);
  glint(x, 64, 64, 16, 0xffffff, 1);
};

/** Scorch: an iron shield with a molten hole burned through it; resistance gone. */
const mgmelt: Glyph = (x, t) => {
  glow(x, 64, 70, 50, t.glow, 0.4);
  const shield = smoothP([[30, 22], [64, 16], [98, 22], [100, 56], [88, 88], [64, 112], [40, 88], [28, 56]], 0.25);
  obj(x, shield, IRON, t, [30, 16], [100, 112], 1.2);
  // The burn: a ragged molten hole, glowing at its lip, dripping.
  const hole = smoothP([[52, 44], [66, 38], [82, 48], [84, 62], [74, 76], [58, 74], [46, 62]], 0.6);
  energy(x, hole, t, 66, 58, 26, 0.6);
  x.save();
  x.clip(hole);
  x.fillStyle = 'rgba(10,4,2,.85)';
  x.fill(smoothP([[58, 50], [68, 46], [76, 54], [74, 66], [64, 70], [55, 62]], 0.6));
  x.restore();
  for (const [dx, len] of [[56, 20], [72, 28]] as const) {
    const d = new Path2D();
    d.moveTo(dx, 74);
    d.lineTo(dx + 1, 74 + len);
    ray(x, d, t, 3.6);
    energy(x, circleP(dx + 1, 76 + len, 3.6), t, dx + 1, 76 + len, 4, 0.7);
  }
  tongue(x, t, 56, 44, 0.3, -0.25, 1.1);
  tongue(x, t, 78, 46, 0.24, 0.3, 1.1);
  spec(x, 40, 30, 10, 3, -0.4, 0.5);
};

/** Fireball: a great ball of fire flying, its flames thrown back behind it. */
const mgfireball: Glyph = (x, t) => {
  glow(x, 72, 56, 58, t.glow, 0.65);
  const back = Math.PI * 1.25;
  for (const [o, s, len] of [[-0.32, 0.5, 1.5], [0.32, 0.5, 1.4], [0, 0.62, 1.7]] as const) {
    tongue(x, t, 72, 56, s, back + o, len, 0.45);
  }
  energy(x, circleP(74, 54, 30), t, 80, 48, 34, 0.55);
  // Roiling on its face.
  for (const [r, a0, a1] of [[20, 2.4, 4.4], [12, 0.2, 2.2]] as const) {
    const sw = new Path2D();
    sw.arc(74, 54, r, a0, a1);
    faded(x, 0.85, () => ray(x, sw, t, 2.2));
  }
  glint(x, 84, 44, 14, 0xffffff, 0.95);
};

/** Inferno Stream: a jet of fire pouring from a bright source and widening. */
const mgstream: Glyph = (x, t) => {
  glow(x, 70, 58, 58, t.glow, 0.55);
  const dir = Math.PI * 0.32;
  // Three layered tongues, the outer ones fanned, all from the one mouth.
  tongue(x, t, 22, 96, 0.82, dir - 0.2, 1.6, 0.35);
  tongue(x, t, 22, 96, 0.82, dir + 0.2, 1.6, 0.35);
  tongue(x, t, 22, 96, 0.9, dir, 1.75, 0.4);
  energy(x, circleP(22, 98, 13), t, 22, 98, 15, 0.8);
  glint(x, 22, 98, 15, 0xffffff, 1);
};

/** Kindling: two crossed logs just catching, a crit spark flaring off them. */
const mgkindling: Glyph = (x, t) => {
  glow(x, 64, 70, 44, t.glow, 0.45);
  const log = (rot: number): void => {
    x.save();
    x.translate(64, 92);
    x.rotate(rot);
    const p = ellipseP(0, 0, 44, 9);
    obj(x, p, WOOD, t, [-44, -9], [44, 9], 0.6);
    // A cut end: rings on its face.
    solid(x, ellipseP(41, 0, 5, 8.5), WOOD, { tex: null, size: 0.3, outline: 1.2 });
    x.restore();
  };
  log(-0.42);
  log(0.42);
  tongue(x, t, 64, 86, 0.56, 0, 1.1);
  // The crit: a four-point star flaring off the flame.
  energy(x, starP(96, 30, 4, 5, 18, 0), t, 96, 30, 18, 0.6);
  glint(x, 96, 30, 14, 0xffffff, 1);
  for (const [gx, gy, r] of [[40, 40, 2.6], [78, 24, 2.2], [104, 56, 2]] as const) glint(x, gx, gy, r * 2, t.core, 1);
};

/** Blast Wave: a flash at the heart and two shock rings throwing rock outward. */
const mgblast: Glyph = (x, t) => {
  glow(x, 64, 64, 60, t.glow, 0.6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.5;
    rock(x, t, 64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54, 7, i);
  }
  // The outer ring broken into shards of pressure.
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + 0.1;
    const p = new Path2D();
    p.arc(64, 64, 42, a0, a0 + 0.55);
    ray(x, p, t, 4.5);
  }
  ray(x, circleP(64, 64, 28), t, 6);
  energy(x, starP(64, 64, 8, 7, 18, 0), t, 64, 64, 18, 0.7);
  glint(x, 64, 64, 14, 0xffffff, 1);
};

/** Pyroclasm: a row of lava fountains marching away, each taller than the last. */
const mgerupt: Glyph = (x, t) => {
  glow(x, 70, 70, 54, t.glow, 0.45);
  // The ground, cracked and lit along the line the eruptions walk.
  const ground = polyP([[4, 104], [124, 86], [124, 128], [4, 128]]);
  obj(x, ground, BASALT, t, [4, 86], [124, 128], 0.8);
  cracks(x, ground, t, [[[10, 112], [40, 106], [72, 100], [104, 94], [122, 90]]], 2.4);
  for (const [cx, cy, s] of [[24, 106, 0.32], [58, 100, 0.44], [96, 94, 0.58]] as const) {
    energy(x, ellipseP(cx, cy, 13 * s * 2, 4 * s * 2), t, cx, cy, 14 * s * 2, 0.6);
    tongue(x, t, cx, cy - 2, s, 0, 1.6, 0.4);
    for (let k = 0; k < 2; k++) {
      const bx = cx + (k ? 1 : -1) * 18 * s;
      const by = cy - 70 * s;
      energy(x, circleP(bx, by, 4.5 * s * 2), t, bx, by, 6 * s * 2, 0.7);
    }
  }
};

/** Combustion: a cracked black body, fire bursting out of every split. */
const mgbomb: Glyph = (x, t) => {
  glow(x, 64, 64, 60, t.glow, 0.6);
  energy(x, starP(64, 64, 9, 30, 58, 0.2), t, 64, 64, 58, 0.35);
  const body = circleP(64, 66, 30);
  obj(x, body, BASALT, t, [34, 36], [94, 96], 1.1);
  cracks(x, body, t, [
    [[48, 44], [60, 60], [54, 72], [66, 92]],
    [[60, 60], [82, 54], [94, 62]],
    [[54, 72], [36, 78]],
  ], 3);
  for (const [fx, fy, s, r] of [[60, 40, 0.3, -0.2], [86, 52, 0.24, 1.0], [40, 76, 0.22, -1.2]] as const) tongue(x, t, fx, fy, s, r, 1.2);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.9;
    rock(x, t, 64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50, 4.5, i + 3);
  }
};

/** Heat Shimmer: heat rising off a bed of embers in wavering lines. */
const mgshimmer: Glyph = (x, t) => {
  glow(x, 64, 104, 48, t.glow, 0.55);
  for (let i = 0; i < 3; i++) {
    const bx = 40 + i * 24;
    const p = new Path2D();
    p.moveTo(bx, 96);
    for (let k = 1; k <= 6; k++) {
      const y = 96 - k * 13;
      p.quadraticCurveTo(bx + (k % 2 ? 10 : -10), y + 6.5, bx, y);
    }
    // Ghosts of the line, a little off: the air will not hold still.
    faded(x, 0.3, () => {
      x.save();
      x.translate(4, -2);
      ray(x, p, t, 2.4);
      x.restore();
    });
    faded(x, 0.85 - i * 0.05, () => ray(x, p, t, 3.4));
  }
  const bed = ellipseP(64, 106, 46, 11);
  obj(x, bed, BASALT, t, [18, 95], [110, 117], 0.6);
  for (let i = 0; i < 6; i++) energy(x, circleP(28 + i * 14, 104 + (i % 2) * 4, 4.5), t, 28 + i * 14, 104, 6, 0.7);
};

/** Firestorm: burning stones raining down slantwise, one striking the floor. */
const mgmeteors: Glyph = (x, t) => {
  glow(x, 60, 70, 56, t.glow, 0.5);
  const fall = Math.PI * 1.25;
  for (const [cx, cy, r] of [[96, 22, 7], [104, 64, 6], [62, 56, 10]] as const) {
    tongue(x, t, cx, cy, r / 22, fall + Math.PI, 2.1, 0.4);
    rock(x, t, cx - r * 0.3, cy + r * 0.3, r, cx);
  }
  // The one that landed.
  energy(x, ellipseP(32, 108, 24, 7), t, 32, 108, 24, 0.6);
  energy(x, starP(32, 102, 6, 6, 18, -Math.PI / 2), t, 32, 102, 18, 0.6);
  for (const [gx, gy] of [[16, 92], [50, 90], [24, 82]] as const) glint(x, gx, gy, 5, t.core, 1);
};

/** Searing Core: a molten core, rings of heat round it, a fire chevron rising. */
const mgcore: Glyph = (x, t) => {
  glow(x, 64, 74, 56, t.glow, 0.6);
  for (const [rx, ry, rot] of [[44, 14, -0.35], [44, 14, 0.35]] as const) faded(x, 0.85, () => ray(x, ellipseP(64, 78, rx, ry, rot), t, 3));
  const core = circleP(64, 78, 24);
  energy(x, core, t, 58, 72, 28, 0.6);
  cracks(x, core, t, [[[50, 66], [62, 76], [56, 90]], [[62, 76], [78, 72]]], 1.8);
  // The ceiling rises: a chevron of fire above it, and a second fainter.
  for (const [cy, a] of [[34, 1], [18, 0.6]] as const) {
    const c = new Path2D();
    c.moveTo(42, cy + 14);
    c.lineTo(64, cy);
    c.lineTo(86, cy + 14);
    faded(x, a, () => ray(x, c, t, 5));
  }
  glint(x, 56, 70, 12, 0xffffff, 0.9);
};

/** Dragon's Breath: a horned dragon's head in profile, a gout of fire from its jaws. */
const mgdragon: Glyph = (x, t) => {
  glow(x, 84, 70, 52, t.glow, 0.55);
  // The gout first, so the jaws sit over its root.
  tongue(x, t, 56, 76, 0.66, Math.PI / 2 - 0.12, 1.3, 0.4);
  tongue(x, t, 56, 80, 0.5, Math.PI / 2 + 0.22, 1.25, 0.45);
  // Horns swept back.
  obj(x, smoothP([[26, 40], [10, 16], [8, 8], [20, 20], [38, 36]], 0.4), HORN, t, [8, 8], [38, 40], 0.5);
  obj(x, smoothP([[36, 34], [30, 12], [32, 4], [40, 18], [46, 32]], 0.4), HORN, t, [30, 4], [46, 34], 0.5);
  // Upper jaw and skull, snout to the right.
  const head = smoothP([[14, 60], [20, 40], [40, 30], [58, 38], [74, 56], [66, 66], [44, 68], [24, 74]], 0.35);
  obj(x, head, SCALE, t, [14, 30], [74, 74], 1.1);
  // Lower jaw, dropped open.
  const jaw = smoothP([[22, 80], [42, 78], [62, 86], [56, 94], [36, 96], [22, 92]], 0.35);
  obj(x, jaw, SCALE, t, [22, 78], [62, 96], 0.8);
  // Teeth along both jaws.
  for (let i = 0; i < 4; i++) {
    const tx = 40 + i * 7;
    x.save();
    x.fillStyle = css(0xf4ead2);
    x.fill(polyP([[tx, 66 - i * 0.5], [tx + 3, 66 - i * 0.5], [tx + 1.5, 72]]));
    x.fill(polyP([[tx - 2, 82 + i], [tx + 1, 82 + i], [tx - 0.5, 77 + i]]));
    x.restore();
  }
  // The eye, lit by the same fire.
  energy(x, ellipseP(42, 44, 5, 3, -0.3), t, 42, 44, 6, 0.8);
  glint(x, 43, 43, 5, 0xffffff, 0.9);
  // A ridge of scales down the brow.
  for (let i = 0; i < 4; i++) obj(x, polyP([[20 + i * 8, 40 - i * 2], [26 + i * 8, 30 - i * 2], [28 + i * 8, 40 - i * 2]]), SCALE, t, [20, 28], [52, 42], 0.3);
};

/** Cataclysm: three blazes, each lit from the last by an arc of fire. */
const mgchain: Glyph = (x, t) => {
  glow(x, 64, 64, 58, t.glow, 0.5);
  const spots: readonly [number, number, number][] = [[30, 92, 0.52], [70, 64, 0.4], [100, 30, 0.3]];
  for (let i = 0; i < spots.length - 1; i++) {
    const [ax, ay] = spots[i]!;
    const [bx, by] = spots[i + 1]!;
    const p = new Path2D();
    p.moveTo(ax + 6, ay - 18);
    p.quadraticCurveTo((ax + bx) / 2 - 8, Math.min(ay, by) - 30, bx - 4, by - 6);
    ray(x, p, t, 3.4);
    energy(x, starP(bx - 4, by - 6, 4, 2, 6, 0), t, bx - 4, by - 6, 7, 0.7);
  }
  for (const [cx, cy, s] of spots) tongue(x, t, cx, cy, s, 0, 1.15);
};

/** Annihilate: streaks drawn in from all round to a white sphere about to break. */
const mgimplode: Glyph = (x, t) => {
  glow(x, 64, 64, 60, t.glow, 0.6);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const r0 = 30 + (i % 2) * 6;
    const r1 = 56 - (i % 3) * 4;
    const p = new Path2D();
    p.moveTo(64 + Math.cos(a) * r1, 64 + Math.sin(a) * r1);
    p.lineTo(64 + Math.cos(a) * r0, 64 + Math.sin(a) * r0);
    faded(x, 0.6 + (i % 2) * 0.35, () => ray(x, p, t, 2.6 + (i % 2)));
  }
  ray(x, circleP(64, 64, 24), t, 3);
  energy(x, circleP(64, 64, 17), t, 62, 62, 20, 0.85);
  glint(x, 64, 64, 22, 0xffffff, 1);
};

/** Ember Soul: a flame with a face rising from a drained mana crystal. */
const mgsoul: Glyph = (x, t) => {
  glow(x, 64, 52, 50, t.glow, 0.55);
  tongue(x, t, 64, 72, 0.86, 0, 1.05, 0.4);
  // Two dark eyes and a mouth in the flame.
  x.save();
  x.fillStyle = css(sink(t.dark, 0.6), 0.95);
  x.fill(ellipseP(54, 58, 4.5, 6.5, 0.25));
  x.fill(ellipseP(74, 58, 4.5, 6.5, -0.25));
  x.fill(ellipseP(64, 74, 6, 3.4));
  x.restore();
  // The crystal under it, its blue nearly gone.
  gem(x, 64, 104, 15, 0x2c3c6a, 'trillion', { glow: 0.2, rot: Math.PI });
  glint(x, 60, 100, 6, 0x9ab4ff, 0.6);
};

// ---------------------------------------------------------------------------
// The lightning tree
// ---------------------------------------------------------------------------

/** Sparkbolt: a crackling spark jinking along a broken path, forks off it. */
const mgspark: Glyph = (x, t) => {
  glow(x, 88, 40, 46, t.glow, 0.6);
  // The path it jinked along, dimmer the older it is.
  const path: Pt[] = [[12, 114], [30, 92], [22, 80], [46, 70], [40, 56], [66, 52], [64, 42], [84, 40]];
  for (let i = 0; i < path.length - 1; i++) {
    const p = new Path2D();
    p.moveTo(path[i]![0], path[i]![1]);
    p.lineTo(path[i + 1]![0], path[i + 1]![1]);
    faded(x, 0.3 + (i / (path.length - 1)) * 0.7, () => ray(x, p, t, 2 + i * 0.35));
  }
  // The spark: a small hot ball wrapped in short forks.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const p = new Path2D();
    p.moveTo(88 + Math.cos(a) * 12, 36 + Math.sin(a) * 12);
    p.lineTo(88 + Math.cos(a + 0.3) * 20, 36 + Math.sin(a + 0.3) * 20);
    p.lineTo(88 + Math.cos(a - 0.1) * 28, 36 + Math.sin(a - 0.1) * 28);
    ray(x, p, t, 2.2);
  }
  energy(x, circleP(88, 36, 13), t, 86, 34, 15, 0.8);
  glint(x, 88, 36, 16, 0xffffff, 1);
};

export const MAGE_GLYPHS: Record<string, Glyph> = {
  mgsigil, mgbolt, mgembers, mgmelt, mgfireball, mgstream, mgkindling, mgblast, mgerupt, mgbomb,
  mgshimmer, mgmeteors, mgcore, mgdragon, mgchain, mgimplode, mgsoul, mgspark,
};
