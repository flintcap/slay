/**
 * SLAY — the Shapeshifter's own pictograms, spread into `GLYPHS` (`Glyphs.ts`).
 *
 * Same 128-unit canvas and painting rules as the shared set. Only `./Paint`
 * is imported at run time, so the shared module can spread this in without
 * a cycle.
 *
 *   beast  a beast's head, face on, eyes lit. v0 the black cat, v1 the grey
 *          wolf, v2 the bear.
 *   paw    a paw print with its claws out. v0 cat, v1 wolf, v2 bear.
 *   howl   a wolf's head thrown back, howling at a moon. v1 the moon is red.
 */
import type { Glyph, Tone } from './Glyphs';
import { type Ctx, type Mat, type Pt, circleP, css, ellipseP, emissiveStroke, glint, glow, innerEdge, mat, polyP, smoothP, solid } from './Paint';

const BLACK_FUR = mat([0x07060a, 0x141220, 0x26223a, 0x3e3858, 0x6a6290], 0, 'mottle', 0.45, 0.7);
const GREY_FUR = mat([0x15140f, 0x34312a, 0x5c574a, 0x8a8370, 0xc4bca4], 0, 'mottle', 0.5, 0.7);
const BROWN_FUR = mat([0x140b05, 0x352010, 0x5c3a1e, 0x8a5c32, 0xb88a58], 0, 'mottle', 0.5, 0.7);
const HORN = mat([0x1a1610, 0x4a4234, 0x8a7e66, 0xc8bc9c, 0xf4ecd8], 0.15, 'fine', 0.2);
const PAD = mat([0x0c0808, 0x241818, 0x3c2a28, 0x5a4440, 0x806460], 0, 'pores', 0.4);

const FURS: readonly Mat[] = [BLACK_FUR, GREY_FUR, BROWN_FUR];
const EYES: readonly number[] = [0xb89cff, 0xffc040, 0xff8a30];

function obj(x: Ctx, p: Path2D, m: Mat, t: Tone, a: Pt = [34, 30], b: Pt = [94, 98], size = 1.4): void {
  solid(x, p, m, { a, b, size, outline: 2.2, outlineColor: 'rgba(6,5,6,.95)' });
  innerEdge(x, p, css(t.glow, 0.9), 3.5, -2.2, -2.2, 2);
}

/** Mirrors a half outline (x <= 64) into a whole one. */
function mirror(half: readonly Pt[]): Pt[] {
  const back = [...half].reverse().map(([px, py]) => [128 - px, py] as Pt);
  return [...half, ...back.filter(([px]) => Math.abs(px - 64) > 0.01)];
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

// ---------------------------------------------------------------------------
// Beast heads
// ---------------------------------------------------------------------------

const HEADS: readonly (readonly Pt[])[] = [
  // Cat: tall pointed ears, round skull, short muzzle.
  [[64, 30], [48, 30], [34, 10], [28, 44], [24, 64], [30, 86], [44, 102], [56, 110], [64, 112]],
  // Wolf: ears back and up, wide ruff, long muzzle.
  [[64, 34], [50, 32], [38, 8], [32, 38], [16, 56], [24, 70], [20, 84], [40, 92], [52, 116], [64, 120]],
  // Bear: small round ears, a broad heavy skull.
  [[64, 26], [46, 26], [40, 16], [26, 20], [26, 36], [16, 58], [20, 84], [38, 104], [54, 112], [64, 114]],
];

const beast: Glyph = (x, t, v) => {
  const k = ((v % 3) + 3) % 3;
  const fur = FURS[k]!;
  glow(x, 64, 66, 54, t.glow, 0.35);
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
  // Muzzle and nose.
  const muzzle = k === 1
    ? smoothP([[52, 78], [76, 78], [72, 112], [64, 118], [56, 112]], 0.3)
    : k === 2
      ? ellipseP(64, 88, 18, 15)
      : ellipseP(64, 88, 14, 11);
  obj(x, muzzle, k === 0 ? BLACK_FUR : fur, t, [46, 74], [82, 116], 0.6);
  const ny = k === 1 ? 104 : 84;
  x.fillStyle = 'rgba(6,4,6,1)';
  x.fill(smoothP([[64 - 6, ny - 3], [64 + 6, ny - 3], [64, ny + 4]], 0.4));
  glint(x, 62, ny - 2, 1.6, 0xffffff, 0.6);
  // Fangs showing.
  const fy = k === 1 ? 114 : 98;
  for (const sg of [-1, 1]) obj(x, polyP([[64 + sg * 7, fy - 4], [64 + sg * 3, fy - 4], [64 + sg * 5, fy + 6]]), HORN, t, [60, fy - 4], [70, fy + 6], 0.3);
  eyes(x, 64, k === 1 ? 58 : 60, k === 2 ? 15 : 14, EYES[k]!, k === 0);
};

// ---------------------------------------------------------------------------
// Paw prints
// ---------------------------------------------------------------------------

const paw: Glyph = (x, t, v) => {
  const k = ((v % 3) + 3) % 3;
  const big = [1, 1.1, 1.25][k]!;
  glow(x, 64, 74, 48, t.glow, 0.35);
  // The main pad.
  const pad = k === 2
    ? smoothP([[34, 78], [94, 78], [98, 96], [84, 110], [44, 110], [30, 96]], 0.35)
    : smoothP([[44, 80], [84, 80], [92, 98], [78, 112], [50, 112], [36, 98]], 0.4);
  obj(x, pad, PAD, t, [34, 78], [94, 112], 1.0);
  // Toes, and a claw out of each.
  const toes: Pt[] = k === 2 ? [[28, 64], [46, 52], [64, 48], [82, 52], [100, 64]] : [[38, 60], [54, 46], [74, 46], [90, 60]];
  toes.forEach(([tx, ty], i) => {
    obj(x, ellipseP(tx, ty, 8 * big, 10 * big, (tx - 64) * 0.01), PAD, t, [tx - 8, ty - 10], [tx + 8, ty + 10], 0.5);
    const lean = (tx - 64) * 0.18;
    const len = [22, 18, 26][k]!;
    const claw = smoothP([[tx - 3.5, ty - 9], [tx + 3.5, ty - 9], [tx + lean * 0.6, ty - 9 - len]], 0.25);
    obj(x, claw, HORN, t, [tx - 4, ty - 9 - len], [tx + 4, ty - 9], 0.4);
    if (i % 2 === 0) glint(x, tx + lean * 0.5, ty - 9 - len * 0.8, 1.6, 0xffffff, 0.7);
  });
};

// ---------------------------------------------------------------------------
// Howl
// ---------------------------------------------------------------------------

const howl: Glyph = (x, t, v) => {
  const red = v % 2 === 1;
  const moon = red ? 0xe02020 : 0xf4ecd0;
  glow(x, 92, 30, 34, moon, 0.8);
  x.fillStyle = css(moon, 1);
  x.fill(circleP(92, 30, 16));
  x.fillStyle = css(0x000000, 0.18);
  x.fill(circleP(87, 26, 4));
  x.fill(circleP(98, 36, 3));
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
  for (let i = 0; i < 3; i++) {
    const p = new Path2D();
    p.arc(74, 38, 12 + i * 8, -1.4, -0.3);
    emissiveStroke(x, p, t.glow, 2.6 - i * 0.6, 0.85 - i * 0.2);
  }
};

export const SHIFTER_GLYPHS: Record<string, Glyph> = { beast, paw, howl };
