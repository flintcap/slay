/**
 * SLAY — the Paladin's own pictograms, spread into `GLYPHS` (`Glyphs.ts`).
 *
 * Same 128-unit canvas and painting rules as the shared set: solid objects
 * in a material, caught by the tone's back light; emissive shapes for heat
 * and sound. Only `./Paint` is imported at run time, so the shared module
 * can spread this one in without a cycle.
 *
 *   mace    a flanged mace. v1 two crossed, v2 haloed.
 *   bell    a bronze bell. v1 cracked, v2 ringing.
 *   censer  a pierced censer on its chain, smoking. v1 swung.
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
  sink,
  smoothP,
  solid,
  spec,
} from './Paint';

const IRON = mat([0x121418, 0x2a2e35, 0x50575f, 0x858e98, 0xc8d0da], 0.8, 'hammered', 0.35);
const BRONZE = mat([0x241406, 0x5a3612, 0x94602a, 0xc89450, 0xf0d29a], 0.85, 'hammered', 0.25);
const WOOD = mat([0x1c120a, 0x3c2816, 0x694829, 0x946b42, 0xbf9466], 0.05, 'grain', 0.45, 0.6);
const LEATHER = mat([0x170f09, 0x382515, 0x5c3f25, 0x85603b, 0xab8560], 0.1, 'pores', 0.5);

function obj(x: Ctx, p: Path2D, m: Mat, t: Tone, a: Pt = [34, 30], b: Pt = [94, 98], size = 1.4): void {
  solid(x, p, m, { a, b, size, outline: 2.2, outlineColor: 'rgba(6,5,6,.95)' });
  innerEdge(x, p, css(t.glow, 0.9), 3.5, -2.2, -2.2, 2);
}

/** A glowing line with a dark under-stroke, for sound and heat. */
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

// ---------------------------------------------------------------------------
// Mace
// ---------------------------------------------------------------------------

/** One flanged mace, head up, drawn about (64, 64) before rotation. */
function maceAt(x: Ctx, t: Tone, rot: number): void {
  x.save();
  x.translate(64, 64);
  x.rotate(rot);
  x.translate(-64, -64);
  obj(x, rrectP(60, 46, 8, 70, 3), WOOD, t, [60, 70], [68, 70], 0.6);
  for (const y of [94, 100, 106]) obj(x, rrectP(58, y, 12, 4, 1.5), LEATHER, t, [58, y], [70, y + 4], 0.3);
  obj(x, circleP(64, 118, 5), IRON, t, [59, 113], [69, 123], 0.4);
  // Six flanges seen side-on: three to each side of the core, tapering to the haft.
  const flanges = new Path2D();
  for (const sg of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y0 = 16 + i * 10;
      flanges.addPath(polyP([[64 + sg * 6, y0], [64 + sg * (22 - i * 2), y0 + 4], [64 + sg * (22 - i * 2), y0 + 12], [64 + sg * 6, y0 + 16]]));
    }
  }
  obj(x, flanges, IRON, t, [40, 14], [88, 52], 1);
  obj(x, rrectP(55, 12, 18, 40, 6), IRON, t, [55, 12], [73, 52], 1.1);
  obj(x, rrectP(56, 50, 16, 6, 2), BRONZE, t, [56, 50], [72, 56], 0.4);
  spec(x, 60, 22, 3, 12, 0, 0.6);
  x.restore();
}

const mace: Glyph = (x, t, v) => {
  const k = v % 3;
  if (k === 2) {
    const halo = ellipseP(64, 34, 34, 34);
    x.save();
    glow(x, 64, 34, 46, t.glow, 0.7);
    ray(x, halo, t, 3);
    x.restore();
  }
  if (k === 1) {
    maceAt(x, t, -0.62);
    maceAt(x, t, 0.62);
  } else {
    maceAt(x, t, -0.55);
  }
};

// ---------------------------------------------------------------------------
// Bell
// ---------------------------------------------------------------------------

function bellBody(): Path2D {
  return smoothP(
    [[64, 20], [78, 24], [84, 38], [86, 60], [92, 78], [104, 88], [64, 92], [24, 88], [36, 78], [42, 60], [44, 38], [50, 24]],
    0.32,
  );
}

const bell: Glyph = (x, t, v) => {
  const k = v % 3;
  if (k === 2) {
    // Rung: the air around it shaking in arcs.
    for (const sg of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const r = 46 + i * 9;
        const p = new Path2D();
        p.arc(64, 62, r, sg > 0 ? -0.5 : Math.PI - 0.5, sg > 0 ? 0.5 : Math.PI + 0.5);
        ray(x, p, t, 3 - i * 0.6);
      }
    }
  }
  glow(x, 64, 70, 40, t.glow, 0.45);
  // Crown loop and yoke.
  obj(x, rrectP(44, 10, 40, 8, 3), WOOD, t, [44, 10], [84, 18], 0.5);
  obj(x, rrectP(58, 14, 12, 10, 4), BRONZE, t, [58, 14], [70, 24], 0.4);
  const body = bellBody();
  obj(x, body, BRONZE, t, [24, 20], [104, 92], 1.5);
  // The sound bow, a raised band near the lip.
  obj(x, rrectP(30, 80, 68, 6, 3), BRONZE, t, [30, 80], [98, 86], 0.4);
  spec(x, 54, 40, 4, 16, 0.1, 0.55);
  // Clapper hanging under the mouth.
  obj(x, circleP(64, 102, 8), IRON, t, [56, 94], [72, 110], 0.6);
  if (k === 1) {
    const crack = polyP([[70, 26], [66, 40], [74, 52], [66, 66], [72, 80], [68, 90]], false);
    x.save();
    x.strokeStyle = 'rgba(8,5,4,.95)';
    x.lineWidth = 3.2;
    x.lineJoin = 'miter';
    x.stroke(crack);
    x.restore();
    ray(x, crack, t, 1.4);
  }
  glint(x, 84, 40, 5, lift(t.core, 0.5), 0.8);
};

// ---------------------------------------------------------------------------
// Censer
// ---------------------------------------------------------------------------

const censer: Glyph = (x, t, v) => {
  const swung = v % 2 === 1;
  x.save();
  if (swung) {
    x.translate(64, 8);
    x.rotate(-0.5);
    x.translate(-64, -8);
    // The arc it is swung through.
    const arc = new Path2D();
    arc.arc(64, 8, 84, Math.PI / 2 - 0.2, Math.PI / 2 + 0.9);
    ray(x, arc, t, 2.2);
  }
  // Chain: a column of small links.
  for (let y = 6; y < 50; y += 8) obj(x, ellipseP(64, y + 3, 3.2, 4.6), IRON, t, [61, y], [67, y + 8], 0.25);
  // Lid, pierced body and foot.
  const lid = smoothP([[64, 48], [76, 54], [82, 64], [46, 64], [52, 54]], 0.35);
  obj(x, lid, BRONZE, t, [46, 48], [82, 64], 0.8);
  const body = smoothP([[44, 64], [84, 64], [88, 78], [78, 94], [50, 94], [40, 78]], 0.35);
  obj(x, body, BRONZE, t, [40, 64], [88, 94], 1.2);
  obj(x, rrectP(54, 94, 20, 8, 3), BRONZE, t, [54, 94], [74, 102], 0.4);
  // Coals seen through the piercings.
  for (const [hx, hy] of [[52, 76], [64, 74], [76, 76], [58, 86], [70, 86]] as const) {
    const h = circleP(hx, hy, 3.2);
    x.fillStyle = css(t.core, 1);
    x.fill(h);
    glow(x, hx, hy, 8, t.glow, 0.8);
  }
  x.restore();
  // Smoke rising: soft emissive curls.
  for (let i = 0; i < 3; i++) {
    const ox = (swung ? 20 : 0) + (i - 1) * 14;
    const p = smoothP([[64 + ox, 52], [58 + ox, 40], [68 + ox, 28], [60 + ox, 14]], 0.5, false);
    x.save();
    x.globalAlpha = 0.55;
    x.lineCap = 'round';
    x.strokeStyle = css(lift(t.dark, 0.35), 0.6);
    x.lineWidth = 6 - i;
    x.stroke(p);
    x.restore();
  }
};

export const PALADIN_GLYPHS: Record<string, Glyph> = { mace, bell, censer };
