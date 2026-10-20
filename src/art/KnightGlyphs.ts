/**
 * SLAY — the Knight's own pictograms, spread into `GLYPHS` (`Glyphs.ts`).
 *
 * Same 128-unit canvas and painting rules as the shared set: solid objects
 * in a material, caught by the tone's back light; emissive shapes for cuts
 * and shock. Only `./Paint` is imported at run time, so the shared module
 * can spread this one in without a cycle.
 *
 *   heater      a heater shield, iron face, gold chevron. v1 an arrow glancing
 *               off it, v2 a sword set behind it (a guard), v3 falling point
 *               first into cracked stone, v4 a spiked rim, v5 blazing with
 *               stored light.
 *   buckler     a round iron buckler with a gold boss and four straps.
 *   cuirass     a breastplate. v1 cloven down the middle, shards flying.
 *   slash       a cut of steel light. v0 a sawing draw cut with a blood spray,
 *               v1 one deep rising diagonal, v2 five crossing cuts, v3 a wide
 *               flat sweep led by an axe head.
 *   greatsword  a two-handed sword. v0 driven point first into broken floor,
 *               v1 coming down from overhead with its arc behind it.
 *   greathelm   a barrel helm, eye slit lit. v1 roaring: sound pours out.
 *   gauntlet    a plate gauntlet, clenched. v1 pulling: chevrons drawn in.
 */
import type { Glyph, Tone } from './Glyphs';
import {
  type Ctx,
  type Pt,
  circleP,
  css,
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

const STEEL = mat([0x14171c, 0x323a46, 0x66727f, 0xa9b6c4, 0xf2f7fc], 0.9, 'brushed', 0.25);
const IRON = mat([0x101216, 0x24282e, 0x434a52, 0x737c86, 0xb8c0ca], 0.8, 'hammered', 0.35);
const GOLD = mat([0x342104, 0x765014, 0xbd8823, 0xedc45a, 0xfff3bd], 0.9, 'brushed', 0.15);
const LEATHER = mat([0x170f09, 0x382515, 0x5c3f25, 0x85603b, 0xab8560], 0.1, 'pores', 0.5);
const WOOD = mat([0x1c120a, 0x3c2816, 0x694829, 0x946b42, 0xbf9466], 0.05, 'grain', 0.45, 0.6);
const BLOOD = mat([0x1a0204, 0x4a060a, 0x8a1016, 0xc42a26, 0xf07060], 0.2, null);

function obj(x: Ctx, p: Path2D, m: typeof STEEL, t: Tone, a: Pt = [34, 30], b: Pt = [94, 98], size = 1.4): void {
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

/** A crescent of light from angle `a0` to `a1`, thickest in the middle. */
function crescent(cx: number, cy: number, r: number, a0: number, a1: number, w: number, ry = 1): Path2D {
  const n = 18;
  const out: Pt[] = [];
  const inn: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const a = a0 + (a1 - a0) * k;
    const th = w * Math.sin(Math.PI * Math.pow(k, 0.8));
    out.push([cx + Math.cos(a) * (r + th * 0.5), cy + Math.sin(a) * (r + th * 0.5) * ry]);
    inn.push([cx + Math.cos(a) * (r - th * 0.5), cy + Math.sin(a) * (r - th * 0.5) * ry]);
  }
  return polyP([...out, ...inn.reverse()]);
}

/** A drop of blood, point up. */
function bloodDrop(x: Ctx, cx: number, cy: number, r: number): void {
  const p = smoothP([[cx, cy - r * 1.9], [cx + r, cy], [cx, cy + r], [cx - r, cy]], 0.6);
  solid(x, p, BLOOD, { a: [cx - r, cy - r], b: [cx + r, cy + r], tex: null, size: 0.4, outline: 1.2, outlineColor: 'rgba(10,2,2,.9)' });
  glint(x, cx - r * 0.3, cy - r * 0.2, r * 0.7, 0xffd0c8, 0.7);
}

// ---------------------------------------------------------------------------
// Heater shield
// ---------------------------------------------------------------------------

function heaterPath(s = 1, cx = 64, cy = 62): Path2D {
  return smoothP(
    [[cx - 34 * s, cy - 40 * s], [cx, cy - 43 * s], [cx + 34 * s, cy - 40 * s], [cx + 35 * s, cy - 10 * s], [cx + 26 * s, cy + 18 * s], [cx, cy + 46 * s], [cx - 26 * s, cy + 18 * s], [cx - 35 * s, cy - 10 * s]],
    0.2,
  );
}

/** The shield itself, centred on (64, 62): steel rim, iron face, gold chevron, rivets. */
function heaterBody(x: Ctx, t: Tone, blaze = false): void {
  obj(x, heaterPath(), STEEL, t, [30, 20], [98, 108]);
  const face = heaterPath(0.84, 64, 61);
  solid(x, face, IRON, { a: [34, 24], b: [94, 104], size: 1.1, outline: 1.4 });
  x.save();
  x.clip(face);
  glow(x, 64, 58, 34, t.glow, blaze ? 0.55 : 0.22);
  x.restore();
  const chevron = polyP([[30, 74], [64, 40], [98, 74], [98, 90], [64, 56], [30, 90]]);
  x.save();
  x.clip(face);
  if (blaze) energy(x, chevron, t, 64, 58, 44, 0.5);
  else obj(x, chevron, GOLD, t, [40, 40], [90, 90], 0.8);
  x.restore();
  for (const [rx, ry] of [[36, 30], [64, 27], [92, 30], [94, 52], [34, 52], [84, 82], [44, 82], [64, 100]] as const) {
    solid(x, circleP(rx, ry, 2.6), GOLD, { a: [rx - 2, ry - 2], b: [rx + 2, ry + 2], tex: null, size: 0.25, outline: 0.8 });
  }
  spec(x, 46, 32, 14, 4, -0.4, 0.55);
}

const heater: Glyph = (x, t, v) => {
  const k = v % 6;
  if (k === 1) {
    // Deflect: the shield turned, a whole arrow struck aside at its face.
    placed(x, 52, 72, 0.74, -0.25, () => heaterBody(x, t));
    placed(x, 86, 42, 0.8, Math.PI / 4, () => {
      obj(x, rrectP(61, 24, 6, 52, 2), WOOD, t, [61, 40], [67, 40], 0.5);
      for (const sg of [-1, 1]) {
        obj(x, polyP([[64, 22], [64 + sg * 9, 14], [64 + sg * 9, 28], [64, 38]]), LEATHER, t, [55, 14], [73, 38], 0.4);
      }
      obj(x, polyP([[64, 94], [54, 74], [64, 79], [74, 74]]), STEEL, t, [54, 74], [74, 94], 0.6);
    });
    energy(x, starP(66, 56, 8, 5, 18, 0.2), t, 66, 56, 18, 0.5);
    for (const [gx, gy, r] of [[50, 44, 4], [80, 66, 4], [58, 40, 3]] as const) glint(x, gx, gy, r * 2, t.core, 0.9);
  } else if (k === 2) {
    // Guard: two swords crossed behind the shield, points high.
    for (const sg of [-1, 1]) {
      placed(x, 64, 62, 1.02, sg * Math.PI / 4, () => {
        obj(x, polyP([[64, 4], [73, 20], [73, 84], [55, 84], [55, 20]]), STEEL, t, [55, 30], [73, 30], 0.8);
        obj(x, rrectP(40, 84, 48, 8, 3), GOLD, t, [40, 84], [88, 92], 0.5);
        obj(x, rrectP(59, 92, 10, 20, 3), LEATHER, t, [59, 92], [69, 112], 0.4);
        obj(x, circleP(64, 116, 5), GOLD, t, [59, 111], [69, 121], 0.3);
      });
    }
    placed(x, 64, 70, 0.66, 0, () => heaterBody(x, t));
  } else if (k === 3) {
    // Gatefall: point first into the stone, the floor breaking under it.
    x.save();
    x.translate(64, 108);
    x.scale(1, 0.3);
    glow(x, 0, 0, 52, t.glow, 0.85);
    x.restore();
    const crack = new Path2D();
    for (const [ex, ey] of [[18, 112], [34, 100], [94, 100], [112, 110], [64, 122]] as const) {
      crack.moveTo(64, 106);
      crack.lineTo((64 + ex) / 2 + (ex < 64 ? 4 : -4), (106 + ey) / 2 - 3);
      crack.lineTo(ex, ey);
    }
    ray(x, crack, t, 2.6);
    for (let i = 0; i < 3; i++) {
      const p = new Path2D();
      const sx = 34 + i * 30;
      p.moveTo(sx, 6 + (i % 2) * 6);
      p.lineTo(sx + 2, 30 + (i % 2) * 6);
      x.save();
      x.globalAlpha = 0.8 + (i % 2) * 0.2;
      ray(x, p, t, 4);
      x.restore();
    }
    placed(x, 64, 62, 0.8, 0.12, () => heaterBody(x, t));
  } else if (k === 4) {
    // Spiked rim.
    const spikes = new Path2D();
    for (const [sx, sy, a] of [[28, 30, -2.4], [64, 16, -Math.PI / 2], [100, 30, -0.7], [104, 62, 0], [24, 62, Math.PI], [86, 92, 0.7], [42, 92, 2.4], [64, 112, Math.PI / 2]] as const) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      spikes.addPath(polyP([[sx - s * 5, sy + c * 5], [sx + c * 14, sy + s * 14], [sx + s * 5, sy - c * 5]]));
    }
    obj(x, spikes, STEEL, t, [20, 10], [108, 118], 0.6);
    placed(x, 64, 64, 0.86, 0, () => heaterBody(x, t));
    obj(x, polyP([[58, 60], [64, 44], [70, 60], [64, 66]]), STEEL, t, [58, 44], [70, 66], 0.4);
  } else if (k === 5) {
    // Retribution: stored light leaking from every seam.
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.42;
      const p = new Path2D();
      p.moveTo(64 + Math.cos(a) * 44, 62 + Math.sin(a) * 44);
      p.lineTo(64 + Math.cos(a) * 58, 62 + Math.sin(a) * 58);
      x.save();
      x.globalAlpha = 0.85;
      ray(x, p, t, 2.6);
      x.restore();
    }
    glow(x, 64, 62, 56, t.glow, 0.5);
    placed(x, 64, 66, 0.9, 0, () => heaterBody(x, t, true));
  } else {
    heaterBody(x, t);
  }
};

// ---------------------------------------------------------------------------
// Buckler
// ---------------------------------------------------------------------------

const buckler: Glyph = (x, t) => {
  obj(x, circleP(64, 64, 40), STEEL, t, [26, 26], [104, 104], 1.4);
  solid(x, circleP(64, 64, 33), IRON, { a: [32, 32], b: [96, 96], size: 1, outline: 1.2 });
  glow(x, 64, 64, 30, t.glow, 0.22);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    placed(x, 64, 64, 1, a, () => obj(x, rrectP(60, 30, 8, 24, 2), STEEL, t, [60, 30], [68, 54], 0.4));
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rx = 64 + Math.cos(a) * 36.5;
    const ry = 64 + Math.sin(a) * 36.5;
    solid(x, circleP(rx, ry, 2.2), GOLD, { a: [rx - 2, ry - 2], b: [rx + 2, ry + 2], tex: null, size: 0.2, outline: 0.7 });
  }
  obj(x, circleP(64, 64, 13), GOLD, t, [52, 52], [76, 76], 0.7);
  spec(x, 59, 58, 7, 3, -0.6, 0.8);
  spec(x, 44, 40, 12, 3, -0.7, 0.5);
};

// ---------------------------------------------------------------------------
// Cuirass
// ---------------------------------------------------------------------------

function cuirassPath(): Path2D {
  const half: Pt[] = [[64, 32], [52, 24], [38, 20], [26, 26], [28, 42], [36, 54], [34, 76], [38, 94], [50, 104]];
  const pts: Pt[] = [...half, [64, 108], ...half.slice(1).reverse().map(([px, py]) => [128 - px, py] as Pt)];
  return smoothP(pts, 0.3);
}

const cuirass: Glyph = (x, t, v) => {
  const cloven = v % 2 === 1;
  const body = cuirassPath();
  obj(x, body, STEEL, t, [28, 20], [100, 108], 1.5);
  // The keel down the middle, and the lames of the fauld.
  const keel = new Path2D();
  keel.moveTo(64, 34);
  keel.lineTo(64, 92);
  x.save();
  x.clip(body);
  x.strokeStyle = 'rgba(8,8,10,.7)';
  x.lineWidth = 2;
  x.stroke(keel);
  spec(x, 58, 52, 16, 4, -1.4, 0.6);
  for (const y of [90, 99]) {
    solid(x, rrectP(28, y, 72, 8, 3), IRON, { a: [28, y], b: [100, y + 8], tex: null, size: 0.4, outline: 1.2 });
  }
  x.restore();
  // Gold edging at the neck and arm holes.
  const trim = new Path2D();
  trim.moveTo(40, 22);
  trim.quadraticCurveTo(52, 26, 64, 34);
  trim.quadraticCurveTo(76, 26, 88, 22);
  x.save();
  x.lineCap = 'round';
  x.strokeStyle = css(GOLD.c[3]);
  x.lineWidth = 3.4;
  x.stroke(trim);
  x.restore();
  if (cloven) {
    // Split from the collar to the belly; plate thrown off to the side.
    const split = polyP([[70, 18], [62, 38], [70, 50], [58, 70], [66, 84], [62, 96], [58, 84], [52, 70], [62, 50], [54, 38]]);
    x.save();
    x.fillStyle = '#060406';
    x.fill(split);
    x.restore();
    energy(x, split, t, 62, 56, 44, 0.45);
    for (const [sx, sy, r] of [[98, 26, 0.5], [108, 46, -0.4], [22, 34, 2.2]] as const) {
      placed(x, sx, sy, 1, r, () => obj(x, polyP([[58, 58], [72, 60], [66, 72]]), STEEL, t, [58, 58], [72, 72], 0.3));
    }
  } else {
    glow(x, 64, 56, 22, t.glow, 0.3);
  }
};

// ---------------------------------------------------------------------------
// Cuts
// ---------------------------------------------------------------------------

const slash: Glyph = (x, t, v) => {
  const k = v % 4;
  if (k === 0) {
    // Rend: a sawing draw cut pulled back across, blood thrown off it.
    energy(x, crescent(70, -6, 76, 2.1, 0.9, 14), t, 66, 66, 52, 0.45);
    for (const [bx, by, r] of [[40, 86, 5], [56, 96, 4], [74, 92, 4.5], [90, 102, 3.5], [30, 102, 3]] as const) bloodDrop(x, bx, by, r);
  } else if (k === 1) {
    // Gash: one deep rising cut from low left to high right.
    const p = crescent(100, 100, 70, -Math.PI, -Math.PI / 2, 20);
    energy(x, p, t, 52, 52, 56, 0.4);
    const wound = crescent(100, 100, 70, -Math.PI + 0.18, -Math.PI / 2 - 0.18, 6);
    x.save();
    x.fillStyle = css(0x2a0206, 0.9);
    x.fill(wound);
    x.restore();
  } else if (k === 2) {
    // Massacre: five cuts crossing back and forth.
    const cuts: Array<[number, number, number, number]> = [
      [64, 64, -0.7, 52], [64, 60, 0.75, 50], [62, 72, -0.35, 46], [66, 54, 0.3, 44], [64, 66, -1.2, 40],
    ];
    for (let i = 0; i < cuts.length; i++) {
      const [cx, cy, a, len] = cuts[i]!;
      placed(x, cx, cy, 1, a, () => {
        x.save();
        x.globalAlpha = 0.75 + i * 0.05;
        energy(x, crescent(64, 64 + len * 1.6, len * 1.7, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5, 8), t, 64, 64, len, 0.5);
        x.restore();
      });
    }
  } else {
    // Cleave: a wide flat sweep, an axe head at its leading edge.
    energy(x, crescent(64, 78, 48, Math.PI * 1.05, Math.PI * 1.95, 18, 0.62), t, 64, 52, 60, 0.4);
    placed(x, 92, 82, 0.62, 0.6, () => {
      obj(x, rrectP(60, 30, 8, 70, 3), WOOD, t, [60, 60], [68, 60], 0.5);
      obj(x, smoothP([[66, 26], [86, 18], [100, 24], [102, 50], [96, 70], [84, 66], [66, 52]], 0.35), STEEL, t, [100, 20], [66, 60], 0.9);
    });
  }
};

// ---------------------------------------------------------------------------
// Greatsword
// ---------------------------------------------------------------------------

/** A two-handed sword, point down, centred on x = 64, pommel at y = 6, tip at y = 122. */
function greatswordBody(x: Ctx, t: Tone): void {
  obj(x, polyP([[55, 44], [73, 44], [72, 104], [64, 122], [56, 104]]), STEEL, t, [55, 60], [73, 60], 1);
  x.save();
  x.strokeStyle = 'rgba(255,255,255,.45)';
  x.lineWidth = 1.4;
  x.beginPath();
  x.moveTo(63, 48);
  x.lineTo(63, 112);
  x.stroke();
  x.restore();
  obj(x, polyP([[30, 36], [98, 36], [102, 44], [26, 44]]), IRON, t, [26, 36], [102, 44], 0.6);
  obj(x, rrectP(60, 12, 8, 24, 3), LEATHER, t, [60, 12], [68, 36], 0.4);
  obj(x, circleP(64, 9, 6), GOLD, t, [58, 3], [70, 15], 0.4);
  for (const gx of [28, 100]) obj(x, circleP(gx, 40, 4.4), GOLD, t, [gx - 4, 36], [gx + 4, 44], 0.3);
}

const greatsword: Glyph = (x, t, v) => {
  if (v % 2 === 1) {
    // Overhead: the arc it fell along, then the blade near the end of it.
    energy(x, crescent(64, 72, 52, -Math.PI * 0.98, -Math.PI * 0.3, 9), t, 44, 30, 60, 0.45);
    placed(x, 68, 62, 0.96, 0.62, () => greatswordBody(x, t));
    return;
  }
  // Ruin: driven point first into a floor that breaks.
  x.save();
  x.translate(64, 110);
  x.scale(1, 0.28);
  glow(x, 0, 0, 56, t.glow, 0.9);
  x.restore();
  const crack = new Path2D();
  for (const [ex, ey] of [[14, 108], [30, 120], [100, 120], [116, 104], [50, 126], [80, 126]] as const) {
    crack.moveTo(64, 110);
    crack.lineTo((64 + ex) / 2, (110 + ey) / 2 - 4);
    crack.lineTo(ex, ey);
  }
  ray(x, crack, t, 2.4);
  placed(x, 64, 58, 0.86, 0, () => greatswordBody(x, t));
  for (const [sx, sy] of [[40, 98], [90, 96], [30, 86], [98, 84]] as const) {
    obj(x, polyP([[sx - 4, sy + 3], [sx, sy - 4], [sx + 4, sy + 2]]), IRON, t, [sx - 4, sy - 4], [sx + 4, sy + 3], 0.2);
  }
};

// ---------------------------------------------------------------------------
// Great helm
// ---------------------------------------------------------------------------

const greathelm: Glyph = (x, t, v) => {
  const roar = v % 2 === 1;
  if (roar) {
    for (const sg of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const r = 44 + i * 8;
        const p = new Path2D();
        const a0 = sg > 0 ? -0.55 : Math.PI - 0.55;
        p.arc(64, 66, r, a0, a0 + 1.1);
        x.save();
        x.globalAlpha = 1 - i * 0.2;
        ray(x, p, t, 3.4 - i * 0.7);
        x.restore();
      }
    }
    glow(x, 64, 58, 36, t.glow, 0.6);
  }
  const body = smoothP([[36, 30], [64, 20], [92, 30], [96, 66], [92, 104], [36, 104], [32, 66]], 0.28);
  obj(x, body, STEEL, t, [32, 20], [96, 104], 1.5);
  // Eye slit, lit from inside.
  const slit = new Path2D();
  slit.addPath(rrectP(38, 52, 22, 7, 2));
  slit.addPath(rrectP(68, 52, 22, 7, 2));
  x.save();
  x.fillStyle = '#050406';
  x.fill(slit);
  x.clip(slit);
  glow(x, 64, 55, 28, t.glow, roar ? 1 : 0.85);
  x.restore();
  // Gold cross: brow band and nasal.
  obj(x, rrectP(34, 44, 60, 6, 2), GOLD, t, [34, 44], [94, 50], 0.4);
  obj(x, rrectP(60, 24, 8, 76, 2), GOLD, t, [60, 24], [68, 100], 0.5);
  // Breaths on both cheeks.
  for (const sg of [-1, 1]) {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 2; c++) {
        const hx = 64 + sg * (14 + c * 8);
        const hy = 72 + r * 8;
        x.save();
        x.fillStyle = '#060507';
        x.fill(circleP(hx, hy, 2));
        if (roar) glow(x, hx, hy, 5, t.glow, 0.7);
        x.restore();
      }
    }
  }
  spec(x, 46, 34, 12, 4, -0.5, 0.6);
};

// ---------------------------------------------------------------------------
// Gauntlet
// ---------------------------------------------------------------------------

function gauntletBody(x: Ctx, t: Tone): void {
  obj(x, rrectP(42, 84, 44, 26, 6), STEEL, t, [42, 84], [86, 110], 0.8);
  obj(x, rrectP(40, 104, 48, 8, 3), GOLD, t, [40, 104], [88, 112], 0.4);
  obj(x, smoothP([[36, 52], [92, 48], [96, 76], [88, 90], [42, 90], [34, 76]], 0.35), STEEL, t, [34, 48], [96, 90], 1.2);
  // Four finger lames curled over, front on.
  for (let i = 0; i < 4; i++) {
    const fx = 40 + i * 13;
    obj(x, rrectP(fx, 34 + (i === 0 || i === 3 ? 4 : 0), 12, 22, 5), STEEL, t, [fx, 34], [fx + 12, 56], 0.5);
    solid(x, rrectP(fx + 1, 46 + (i === 0 || i === 3 ? 4 : 0), 10, 3, 1), IRON, { tex: null, size: 0.2, outline: 0.6 });
  }
  // Thumb across the front.
  obj(x, smoothP([[30, 66], [46, 58], [64, 64], [60, 74], [36, 78]], 0.4), STEEL, t, [30, 58], [64, 78], 0.5);
  spec(x, 52, 60, 14, 3, -0.2, 0.55);
}

const gauntlet: Glyph = (x, t, v) => {
  if (v % 2 === 1) {
    // Pulling: chevrons on both sides, drawn in to the fist.
    for (const sg of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const cx = 64 + sg * (36 + i * 14);
        const p = new Path2D();
        p.moveTo(cx + sg * 8, 50);
        p.lineTo(cx, 64);
        p.lineTo(cx + sg * 8, 78);
        x.save();
        x.globalAlpha = 1 - i * 0.3;
        ray(x, p, t, 3.6 - i);
        x.restore();
      }
    }
    placed(x, 64, 64, 0.72, 0, () => gauntletBody(x, t));
    return;
  }
  glow(x, 64, 70, 40, t.glow, 0.35);
  placed(x, 64, 64, 0.94, 0, () => gauntletBody(x, t));
};

export const KNIGHT_GLYPHS: Record<string, Glyph> = { heater, buckler, cuirass, slash, greatsword, greathelm, gauntlet };
