/**
 * SLAY — weapon icon painters.
 *
 * One painter per weapon family, each branching on the authored sub-type so a
 * rapier, a broadsword and a greatsword are three silhouettes, not one sword at
 * three sizes. All drawn in the diagonal frame (see `IconKit`): local y runs
 * from the tip (negative) to the pommel (positive), key light from local -x.
 */
import {
  type K,
  MATS,
  band,
  blade,
  curl,
  diag,
  filigree,
  knob,
  maybeStone,
  rivet,
  runeMark,
  setStone,
  shaft,
  wrappedGrip,
} from './IconKit';
import {
  type Mat,
  type Pt,
  circleP,
  css,
  ellipseP,
  emissiveStroke,
  gem,
  glint,
  glow,
  lift,
  polyP,
  rampOf,
  rrectP,
  sink,
  smoothP,
  solid,
  spec,
} from './Paint';

type Painter = (k: K) => void;

/** Head metal for weapons whose palette is the haft (wooden spears, clubs). */
function headMetal(k: K): Mat {
  if (k.pal.startsWith('metal') || k.pal.startsWith('crystal') || k.pal.startsWith('bone')) return k.m;
  return k.rank >= 4 ? MATS['metal.silver']! : MATS['metal.steel']!;
}

/** Haft wood for weapons whose palette is the head (steel axes, iron maces). */
function haftWood(k: K): Mat {
  if (k.pal.startsWith('wood')) return k.m;
  if (k.pal === 'metal.dark' || k.pal === 'crystal.void') return MATS['wood.dark']!;
  if (k.pal === 'metal.gold' || k.pal === 'metal.mithril') return MATS['wood.polished']!;
  return MATS['wood.oak']!;
}

const bladeOpts = (k: K) => ({
  edgeGlow: k.rank === 1 ? 0.25 : k.rank >= 4 ? 0.55 : 0,
  etch: k.ornate,
  runes: k.rank >= 4,
  crystal: k.pal.startsWith('crystal'),
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function crossGuard(k: K, y: number, hw: number, h: number, style: 'straight' | 'droop' | 'up' | 'disc'): void {
  const x = k.x;
  const m = k.rank >= 1 ? k.trim : k.m.metal > 0.3 ? k.m : MATS['metal.iron']!;
  let pts: Pt[];
  if (style === 'droop') {
    pts = [[-hw, y + h * 1.6], [-hw * 0.7, y - h * 0.2], [0, y - h * 0.6], [hw * 0.7, y - h * 0.2], [hw, y + h * 1.6], [hw * 0.82, y + h * 1.6], [hw * 0.6, y + h * 0.6], [0, y + h * 0.7], [-hw * 0.6, y + h * 0.6], [-hw * 0.82, y + h * 1.6]];
  } else if (style === 'up') {
    pts = [[-hw, y - h * 1.6], [-hw * 0.82, y - h * 1.6], [-hw * 0.6, y - h * 0.5], [0, y - h * 0.7], [hw * 0.6, y - h * 0.5], [hw * 0.82, y - h * 1.6], [hw, y - h * 1.6], [hw * 0.7, y + h * 0.3], [0, y + h * 0.7], [-hw * 0.7, y + h * 0.3]];
  } else {
    pts = [[-hw, y - h * 0.5], [-hw * 0.2, y - h * 0.6], [0, y - h * 0.9], [hw * 0.2, y - h * 0.6], [hw, y - h * 0.5], [hw, y + h * 0.5], [hw * 0.2, y + h * 0.6], [0, y + h * 0.9], [-hw * 0.2, y + h * 0.6], [-hw, y + h * 0.5]];
  }
  const p = style === 'disc' ? ellipseP(0, y, hw, h) : polyP(pts);
  solid(x, p, m, { a: [-hw, y - h], b: [hw * 0.6, y + h], size: 0.6, tex: null });
  if (style === 'straight') {
    knob(k, -hw, y, h * 0.75, m);
    knob(k, hw, y, h * 0.75, m);
  }
  if (k.ornate > 0.35 && style !== 'disc') {
    filigree(k, curl(-hw * 0.45, y + h * 0.9, h * 0.9, 1, -Math.PI / 2), 1, m);
    filigree(k, curl(hw * 0.45, y + h * 0.9, h * 0.9, -1, -Math.PI / 2), 1, m);
  }
}

// ---------------------------------------------------------------------------
// Swords and daggers
// ---------------------------------------------------------------------------

const swordLike: Painter = (k) => {
  const sub = k.sub;
  diag(k.x, () => {
    if (sub === 'thin') {
      // Rapier: a needle with a swept hilt — the knuckle bow is the read.
      blade(k, [[-82, 0], [-74, 2.4], [-30, 3.4], [14, 3.8]], k.m, { ...bladeOpts(k), ridge: true });
      const m = k.rank >= 1 ? k.trim : k.m;
      const bow = new Path2D();
      bow.moveTo(-3, 16);
      bow.bezierCurveTo(-20, 22, -22, 46, -6, 58);
      filigree(k, bow, 2.6, m);
      const ring = ellipseP(0, 16, 12, 5);
      k.x.save();
      k.x.lineWidth = 3;
      k.x.strokeStyle = css(m.c[1]);
      k.x.stroke(ring);
      k.x.lineWidth = 1.4;
      k.x.strokeStyle = css(m.c[3]);
      k.x.stroke(ring);
      k.x.restore();
      crossGuard(k, 18, 22, 2.6, 'straight');
      wrappedGrip(k, 20, 52, 6.5, MATS['leather.dark']!);
      knob(k, 0, 58, 6.5, m, { stone: k.rank >= 2 });
      return;
    }
    if (sub === 'great') {
      const tip = -84;
      blade(k, [[tip, 0], [tip + 12, 8], [-20, 10], [14, 10.5], [18, 7]], k.m, { ...bladeOpts(k), fuller: [tip + 22, 10, 4.2] });
      // Ricasso and parrying lugs.
      for (const s of [-1, 1]) {
        const lug = polyP([[s * 7, 6], [s * 14, 3], [s * 12, 9]]);
        solid(k.x, lug, k.m, { a: [-10, 0], b: [10, 10], tex: null, size: 0.4 });
      }
      crossGuard(k, 22, 30, 4, k.ornate > 0.4 ? 'up' : 'straight');
      wrappedGrip(k, 25, 60, 7.5);
      knob(k, 0, 66, 7.5, k.rank >= 1 ? k.trim : k.m, { stone: k.rank >= 2, facets: k.ornate > 0.3 ? 8 : 0 });
      maybeStone(k, 0, 22, 3.2);
      return;
    }
    if (sub === 'broad') {
      blade(k, [[-74, 0], [-62, 12], [-20, 12.5], [14, 13.5]], k.m, { ...bladeOpts(k), fuller: [-56, 8, 5] });
      crossGuard(k, 18, 27, 4.5, 'droop');
      wrappedGrip(k, 22, 50, 8);
      knob(k, 0, 57, 9, k.rank >= 1 ? k.trim : k.m, { stone: k.rank >= 2, facets: 0 });
      maybeStone(k, 0, 18, 3.6);
      return;
    }
    // Arming sword.
    blade(k, [[-74, 0], [-60, 8.5], [10, 9.5], [14, 9]], k.m, { ...bladeOpts(k), fuller: [-54, 6, 3.6] });
    crossGuard(k, 18, 24, 3.6, k.ornate > 0.25 ? 'up' : 'straight');
    wrappedGrip(k, 21, 50, 7);
    knob(k, 0, 56, 7.5, k.rank >= 1 ? k.trim : k.m, { stone: k.rank >= 2 });
    maybeStone(k, 0, 18, 3.2);
  }, 1.0);
};

const daggerLike: Painter = (k) => {
  diag(k.x, () => {
    const sub = k.sub;
    if (sub === 'wavy') {
      const prof: Array<[number, number, number]> = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const y = -70 + t * 82;
        const hw = t < 0.08 ? t * 110 : 8.5 + t * 2.5;
        prof.push([y, hw, Math.sin(t * Math.PI * 5) * 3.6 * (1 - t * 0.6)]);
      }
      blade(k, prof, k.m, { ...bladeOpts(k), ridge: true });
      crossGuard(k, 15, 17, 4, 'droop');
      wrappedGrip(k, 19, 46, 8, MATS['leather.dark']!);
      knob(k, 0, 52, 7.5, k.rank >= 1 ? k.trim : k.m, { stone: k.rank >= 2 });
      maybeStone(k, 0, 15, 3);
      return;
    }
    if (sub === 'needle') {
      blade(k, [[-74, 0], [-60, 3], [8, 5.2], [12, 5.6]], k.m, { ...bladeOpts(k), ridge: true });
      // Disc guard, seen edge-on as a thick oval.
      crossGuard(k, 15, 12, 4.5, 'disc');
      wrappedGrip(k, 18, 48, 7.5);
      knob(k, 0, 54, 7, k.rank >= 1 ? k.trim : k.m, { stone: k.rank >= 2, facets: 6 });
      return;
    }
    // Leaf dagger: swollen belly, a wicked point.
    blade(k, [[-66, 0], [-52, 9], [-30, 13], [0, 11], [12, 9]], k.m, { ...bladeOpts(k), ridge: true });
    crossGuard(k, 15, 19, 4, 'up');
    wrappedGrip(k, 19, 46, 8.5);
    knob(k, 0, 52, 8, k.rank >= 1 ? k.trim : k.m, { stone: k.rank >= 2 });
    maybeStone(k, 0, 15, 3);
  }, 1.0);
};

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

/** One axe bit on the -x (lit) side, mirrored with `side` = 1. */
function axeBit(k: K, top: number, bottom: number, reach: number, beard: number, side: -1 | 1, m: Mat): void {
  const s = side;
  const mid = (top + bottom) / 2;
  const h = bottom - top;
  const pts: Pt[] = [
    [s * 4, top + h * 0.22],
    [s * reach * 0.55, top - h * 0.05],
    [s * reach, top - h * 0.2],
    [s * (reach + 4), mid - h * 0.05],
    [s * (reach - 1), bottom + beard * 0.6],
    [s * reach * 0.75, bottom + beard],
    [s * reach * 0.45, bottom + beard * 0.4],
    [s * 4, mid + h * 0.28],
  ];
  const p = smoothP(pts, 0.35);
  solid(k.x, p, m, { a: [s * reach, top], b: [s * 2, bottom], texRot: Math.PI / 2, size: 1 });
  // Bright bevel along the cutting edge.
  const e = new Path2D();
  e.moveTo(s * (reach - 1.5), top - h * 0.12);
  e.quadraticCurveTo(s * (reach + 2.5), mid, s * (reach - 3), bottom + beard * 0.55);
  k.x.save();
  k.x.lineCap = 'round';
  k.x.strokeStyle = css(m.c[4], 0.9);
  k.x.lineWidth = 2.2;
  k.x.stroke(e);
  k.x.restore();
  if (k.rank === 1 || k.rank >= 4) emissiveStroke(k.x, e, k.glowC, 1.2, k.rank >= 4 ? 0.7 : 0.35);
  if (k.ornate > 0.3) {
    const c = curl(s * reach * 0.42, mid, h * 0.22, s, 0);
    filigree(k, c, 1, k.rank >= 1 ? k.trim : MATS['metal.dark']!);
  }
  if (k.rank >= 4) runeMark(k, s * reach * 0.5, mid, h * 0.16);
  if (k.rank >= 2) glint(k.x, s * reach, top - h * 0.12, 6, 0xffffff, 0.8);
}

const axeLike: Painter = (k) => {
  const sub = k.sub;
  const wood = haftWood(k);
  diag(k.x, () => {
    // Heads sit nearer the centre than a blade tip: the corners have no room for a bit.
    k.x.translate(0, 12);
    if (sub === 'great' || sub === 'broad') {
      shaft(k, -72, 78, 7, 8, wood, { wobble: 0 });
      band(k, 56, 10, 4);
      wrappedGrip(k, 60, 76, 8.5);
      if (sub === 'great') {
        axeBit(k, -66, -30, 34, 8, -1, k.m);
        axeBit(k, -66, -30, 34, 8, 1, k.m);
      } else {
        axeBit(k, -70, -24, 40, 18, -1, k.m);
        // Back spike.
        solid(k.x, polyP([[3, -56], [22, -50], [3, -42]]), k.m, { a: [0, -56], b: [20, -42], tex: null, size: 0.5 });
      }
      const socket = rrectP(-6, -72, 12, 46, 3);
      solid(k.x, socket, k.rank >= 2 ? k.trim : MATS['metal.dark']!, { a: [-6, -70], b: [6, -30], tex: null, size: 0.5 });
      rivet(k, 0, -60, 2.2);
      rivet(k, 0, -38, 2.2);
      maybeStone(k, 0, -49, 4);
      knob(k, 0, 80, 5, MATS['metal.dark']!);
      return;
    }
    // One-handed: shorter haft drawn larger.
    const big = sub === 'war';
    shaft(k, -58, 64, 7, 8, wood);
    wrappedGrip(k, 34, 62, 8.5);
    knob(k, 0, 66, 5, MATS['metal.dark']!);
    axeBit(k, -56, big ? -18 : -26, big ? 40 : 30, big ? 14 : 18, -1, k.m);
    if (big) solid(k.x, polyP([[3, -46], [20, -40], [3, -30]]), k.m, { a: [0, -46], b: [20, -30], tex: null, size: 0.5 });
    const socket = rrectP(-5.5, -60, 11, big ? 44 : 36, 3);
    solid(k.x, socket, k.rank >= 2 ? k.trim : MATS['metal.dark']!, { a: [-6, -58], b: [6, -30], tex: null, size: 0.5 });
    rivet(k, 0, -48, 2);
    maybeStone(k, 0, -34, 3.6);
  }, 0.86);
};

// ---------------------------------------------------------------------------
// Maces, hammers, mauls
// ---------------------------------------------------------------------------

const maceLike: Painter = (k) => {
  const sub = k.sub;
  diag(k.x, () => {
    if (sub === 'club') {
      // A swelling cudgel with iron studs.
      const wood = k.pal.startsWith('wood') ? k.m : MATS['wood.dark']!;
      const pts: Pt[] = [[-5, 66], [-6, 30], [-9, -10], [-15, -50], [-13, -66], [0, -74], [13, -66], [15, -50], [9, -10], [6, 30], [5, 66]];
      const p = smoothP(pts, 0.45);
      solid(k.x, p, wood, { a: [-14, 0], b: [14, 0], texRot: 0, texScale: 0.6 });
      const studM = k.pal.startsWith('metal') ? k.m : k.rank >= 2 ? k.trim : MATS['metal.iron']!;
      const studs: Pt[] = [[-7, -58], [5, -62], [-10, -40], [8, -44], [-3, -48], [-9, -22], [6, -26]];
      for (const [sx, sy] of studs) {
        const sp = polyP([[sx - 2.6, sy + 1], [sx - 0.5, sy - 4.5], [sx + 2.6, sy + 1]]);
        solid(k.x, sp, studM, { a: [sx - 3, sy - 3], b: [sx + 3, sy + 2], tex: null, ao: 0, outline: 1, size: 0.3 });
      }
      band(k, 6, 15, 4.5, studM);
      wrappedGrip(k, 34, 64, 9.5);
      maybeStone(k, 0, 6, 3.4);
      return;
    }
    if (sub === 'war' || sub === 'great') {
      const maul = sub === 'great';
      const wood = haftWood(k);
      shaft(k, -50, 80, 7, 8, wood);
      wrappedGrip(k, 52, 78, 8.5);
      if (maul) {
        // A brutal block, banded.
        const head = rrectP(-30, -78, 60, 34, 4);
        solid(k.x, head, k.m, { a: [-30, -78], b: [30, -44], size: 1.2 });
        band(k, -72, 62, 5, k.rank >= 1 ? k.trim : MATS['metal.dark']!);
        band(k, -50, 62, 5, k.rank >= 1 ? k.trim : MATS['metal.dark']!);
        for (const sx of [-22, 22]) rivet(k, sx, -61, 2.4, MATS['metal.dark']!);
        if (k.rank >= 4) runeMark(k, 0, -61, 8);
        maybeStone(k, 0, -61, 5);
      } else {
        // War hammer: square face on the lit side, a beak on the other.
        const face = rrectP(-30, -68, 24, 24, 3);
        solid(k.x, face, k.m, { a: [-30, -68], b: [-6, -44], size: 0.9 });
        const neck = rrectP(-8, -66, 16, 20, 2);
        solid(k.x, neck, k.rank >= 1 ? k.trim : k.m, { a: [-8, -66], b: [8, -46], tex: null, size: 0.5 });
        const beak = polyP([[6, -64], [34, -50], [6, -48]]);
        solid(k.x, beak, k.m, { a: [6, -64], b: [30, -48], size: 0.7 });
        solid(k.x, polyP([[-5, -66], [0, -86], [5, -66]]), k.m, { a: [-5, -80], b: [5, -66], tex: null, size: 0.5 });
        spec(k.x, -24, -62, 8, 3, -0.3, 0.6);
        maybeStone(k, 0, -56, 3.6);
      }
      return;
    }
    // Flanged mace.
    const haftM = k.pal.startsWith('metal') ? MATS['metal.dark']! : headMetal(k);
    shaft(k, -36, 66, 6, 7, haftM);
    wrappedGrip(k, 34, 64, 8.5);
    knob(k, 0, 68, 5.5, k.rank >= 1 ? k.trim : MATS['metal.dark']!);
    const cy = -54;
    const n = k.ornate > 0.35 ? 7 : 6;
    // Flanges first, then the core over them.
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const r0 = 10;
      const r1 = 25;
      const fp = polyP([
        [ca * r0 - sa * 5, cy + sa * r0 + ca * 5],
        [ca * r1 - sa * 2, cy + sa * r1 + ca * 2],
        [ca * (r1 + 1), cy + sa * (r1 + 1)],
        [ca * r1 + sa * 2, cy + sa * r1 - ca * 2],
        [ca * r0 + sa * 5, cy + sa * r0 - ca * 5],
      ]);
      solid(k.x, fp, k.m, { a: [-25, cy - 25], b: [25, cy + 25], tex: null, size: 0.6 });
    }
    solid(k.x, circleP(0, cy, 12), k.m, { a: [-12, cy - 12], b: [12, cy + 12], tex: null, size: 0.6 });
    spec(k.x, -4, cy - 4, 6, 3.5, -0.5, 0.6);
    solid(k.x, polyP([[-4, cy - 10], [0, cy - 26], [4, cy - 10]]), k.rank >= 1 ? k.trim : k.m, { a: [-4, cy - 20], b: [4, cy - 10], tex: null, size: 0.4 });
    band(k, -30, 11, 5);
    if (k.rank >= 2) setStone(k, 0, cy, 4.2);
    if (k.rank >= 4) glow(k.x, 0, cy, 30, k.glowC, 0.35);
  }, 1.0);
};

// ---------------------------------------------------------------------------
// Polearms
// ---------------------------------------------------------------------------

const spearLike: Painter = (k) => {
  const sub = k.sub;
  const head = headMetal(k);
  const wood = k.pal.startsWith('wood') ? k.m : k.pal.startsWith('bone') ? k.m : haftWood(k);
  diag(k.x, () => {
    shaft(k, -48, 86, 6, 6.5, wood);
    band(k, 24, 8.5, 3.5, MATS['metal.dark']!);
    band(k, 40, 8.5, 3.5, MATS['metal.dark']!);
    const opts = { ...bladeOpts(k), crystal: k.pal.startsWith('crystal') };
    if (sub === 'halberd') {
      blade(k, [[-88, 0], [-80, 4], [-58, 4.5]], head, { ...opts, ridge: true });
      // Axe blade on the lit side, hook on the other.
      const ax = smoothP([[-3, -62], [-20, -66], [-34, -70], [-36, -50], [-32, -32], [-18, -36], [-3, -40]], 0.35);
      solid(k.x, ax, head, { a: [-36, -66], b: [-3, -36], texRot: Math.PI / 2, size: 1 });
      const e = new Path2D();
      e.moveTo(-34, -68);
      e.quadraticCurveTo(-38, -50, -32, -33);
      k.x.save();
      k.x.strokeStyle = css(head.c[4], 0.9);
      k.x.lineWidth = 2;
      k.x.stroke(e);
      k.x.restore();
      solid(k.x, polyP([[3, -60], [22, -66], [18, -60], [3, -50]]), head, { a: [3, -66], b: [20, -50], tex: null, size: 0.5 });
      const socket = rrectP(-4.5, -62, 9, 28, 2.5);
      solid(k.x, socket, k.rank >= 2 ? k.trim : MATS['metal.dark']!, { a: [-5, -60], b: [5, -34], tex: null, size: 0.5 });
      maybeStone(k, 0, -48, 3.4);
      if (k.rank >= 4) runeMark(k, -22, -51, 7);
      return;
    }
    if (sub === 'trident') {
      for (const s of [-1, 0, 1]) {
        const xo = s * 12;
        const top = s === 0 ? -90 : -78;
        blade(k, [[top, 0, xo], [top + 8, 3.4, xo], [-56, 3, xo]], head, { ...opts, ridge: true, runes: false });
      }
      const bar = polyP([[-15, -58], [15, -58], [10, -50], [-10, -50]]);
      solid(k.x, bar, head, { a: [-15, -58], b: [15, -50], tex: null, size: 0.5 });
      const socket = rrectP(-4.5, -52, 9, 18, 2.5);
      solid(k.x, socket, k.rank >= 2 ? k.trim : MATS['metal.dark']!, { a: [-5, -52], b: [5, -34], tex: null, size: 0.5 });
      maybeStone(k, 0, -54, 3.4);
      return;
    }
    if (sub === 'pike') {
      blade(k, [[-92, 0], [-84, 4], [-58, 5.5], [-50, 3.8]], head, { ...opts, ridge: true });
      // Lugs that stop the haft running through the target.
      for (const s of [-1, 1]) solid(k.x, polyP([[0, -48], [s * 13, -44], [0, -40]]), head, { a: [-10, -48], b: [10, -40], tex: null, size: 0.4 });
      const socket = rrectP(-4.5, -50, 9, 18, 2.5);
      solid(k.x, socket, MATS['metal.dark']!, { a: [-5, -50], b: [5, -32], tex: null, size: 0.5 });
      // Tassel.
      const tas = MATS['cloth.banner']!;
      solid(k.x, smoothP([[-2, -34], [-11, -26], [-14, -12], [-8, -16], [-2, -24]], 0.5), k.rank >= 2 ? rampOf(k.stone) : tas, { a: [-14, -34], b: [0, -12], tex: 'weave', size: 0.4 });
      maybeStone(k, 0, -41, 3);
      return;
    }
    // Leaf spear.
    blade(k, [[-90, 0], [-80, 8], [-62, 11], [-50, 4.5]], head, { ...opts, ridge: true });
    const socket = rrectP(-4.5, -52, 9, 20, 2.5);
    solid(k.x, socket, k.rank >= 2 ? k.trim : MATS['metal.dark']!, { a: [-5, -52], b: [5, -32], tex: null, size: 0.5 });
    // A bound collar of cord.
    wrappedGrip(k, -34, -26, 7.5, MATS['leather.dark']!);
    maybeStone(k, 0, -44, 3);
    knob(k, 0, 86, 4.5, MATS['metal.dark']!);
  }, 0.94);
};

// ---------------------------------------------------------------------------
// Bows and crossbows
// ---------------------------------------------------------------------------

/** A limb from the grip (y=0) out to y=±len, back bowed toward -x. */
function limbPath(len: number, depth: number, w0: number, w1: number, recurve: number, sign: 1 | -1): Path2D {
  const n = 18;
  const L: Pt[] = [];
  const R: Pt[] = [];
  const cx = (t: number): number => -depth * Math.sin(t * Math.PI * 0.5) * (1 - t * 0.2) + recurve * Math.pow(t, 6) * depth;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const y = sign * t * len;
    const hw = (w0 + (w1 - w0) * t) / 2;
    const c = cx(t);
    L.push([c - hw, y]);
    R.push([c + hw, y]);
  }
  return polyP([...L, ...R.reverse()]);
}

const bowLike: Painter = (k) => {
  const sub = k.sub;
  const wood = k.pal.startsWith('wood') || k.pal.startsWith('bone') ? k.m : k.pal.startsWith('crystal') ? k.m : MATS['wood.dark']!;
  diag(k.x, () => {
    const len = sub === 'short' ? 66 : sub === 'great' ? 84 : 80;
    const depth = sub === 'short' ? 22 : sub === 'long' ? 20 : 28;
    const recurve = sub === 'war' || sub === 'great' ? 1.4 : 0.2;
    const w0 = sub === 'great' ? 15 : 13;
    // String first, behind the limbs.
    const tipX = -depth * (1 - 0.2) + recurve * depth;
    const s = new Path2D();
    s.moveTo(tipX + 2, -len + 2);
    s.lineTo(8, 0);
    s.lineTo(tipX + 2, len - 2);
    k.x.save();
    k.x.strokeStyle = 'rgba(20,16,12,.8)';
    k.x.lineWidth = 2.2;
    k.x.stroke(s);
    k.x.strokeStyle = '#e8dfc4';
    k.x.lineWidth = 1.1;
    k.x.stroke(s);
    k.x.restore();
    // An arrow on the string reads as "bow" instantly.
    const arrowWood = MATS['wood.ash']!;
    solid(k.x, rrectP(-30, -1.6, 40, 3.2, 1.4), arrowWood, { a: [-30, -2], b: [10, 2], tex: null, outline: 1, size: 0.3 });
    solid(k.x, polyP([[-40, 0], [-30, -4.5], [-30, 4.5]]), MATS['metal.steel']!, { a: [-40, -4], b: [-30, 4], tex: null, size: 0.3 });
    for (const sg of [-1, 1]) solid(k.x, polyP([[6, 0], [12, sg * 6], [16, sg * 6], [11, 0]]), MATS['cloth.banner']!, { a: [6, 0], b: [16, 6], tex: null, outline: 0.8, size: 0.3 });
    for (const sign of [-1, 1] as const) {
      const p = limbPath(len, depth, w0, 3.5, recurve, sign);
      solid(k.x, p, wood, { a: [-depth - 6, 0], b: [-depth + 8, 0], texRot: 0, texScale: 0.5, size: 0.7 });
      // Horn nocks at the tips.
      knob(k, tipX, sign * len, 3.2, k.rank >= 2 ? k.trim : MATS['bone.pale']!);
      if (sub === 'great' || (k.ornate > 0.35 && sub !== 'short')) {
        // Plates along the belly.
        for (let i = 1; i <= 2; i++) {
          const t = 0.25 + i * 0.18;
          const yy = sign * t * len;
          const cxv = -depth * Math.sin(t * Math.PI * 0.5) * (1 - t * 0.2);
          band(k, yy, w0 * 0.9 + 2, 3, k.rank >= 1 ? k.trim : MATS['metal.dark']!);
          void cxv;
        }
      }
    }
    // Riser and grip wrap.
    wrappedGrip(k, -10, 10, 10, k.rank >= 3 ? MATS['leather.fine']! : MATS['leather.dark']!);
    if (k.rank >= 2) setStone(k, -1, -16, 3.6);
    if (k.rank >= 4) {
      const e = limbPath(len * 0.95, depth, 1, 1, recurve, -1);
      emissiveStroke(k.x, e, k.glowC, 1, 0.6);
      emissiveStroke(k.x, limbPath(len * 0.95, depth, 1, 1, recurve, 1), k.glowC, 1, 0.6);
    }
  }, 0.95);
};

const crossbowLike: Painter = (k) => {
  const sub = k.sub;
  const wood = k.pal.startsWith('wood') ? k.m : MATS['wood.dark']!;
  const metal = k.pal.startsWith('metal') ? k.m : MATS['metal.iron']!;
  diag(k.x, () => {
    // Stock with a shoulder butt.
    const stock = smoothP([[-6, -46], [6, -46], [7, 30], [12, 52], [10, 76], [-8, 78], [-10, 52], [-7, 30]], 0.25);
    solid(k.x, stock, wood, { a: [-10, 0], b: [12, 0], texRot: 0, texScale: 0.5 });
    // Rail.
    solid(k.x, rrectP(-2.5, -50, 5, 64, 2), MATS['metal.dark']!, { a: [-3, 0], b: [3, 0], tex: null, size: 0.4 });
    // Prod.
    const heavy = sub === 'heavy';
    const span = heavy ? 52 : 44;
    const prod = new Path2D();
    prod.moveTo(-span, -26);
    prod.quadraticCurveTo(0, -60, span, -26);
    prod.lineTo(span - 3, -17);
    prod.quadraticCurveTo(0, -46, -span + 3, -17);
    prod.closePath();
    solid(k.x, prod, metal, { a: [-span, -50], b: [span, -20], size: 0.8 });
    // String.
    k.x.save();
    k.x.beginPath();
    k.x.moveTo(-span + 1, -23);
    k.x.lineTo(0, -6);
    k.x.lineTo(span - 1, -23);
    k.x.strokeStyle = 'rgba(15,12,10,.85)';
    k.x.lineWidth = 2;
    k.x.stroke();
    k.x.strokeStyle = '#e4dbc0';
    k.x.lineWidth = 1;
    k.x.stroke();
    k.x.restore();
    // Bolt in the groove.
    solid(k.x, rrectP(-1.6, -58, 3.2, 52, 1.2), MATS['wood.ash']!, { a: [-2, 0], b: [2, 0], tex: null, outline: 0.9, size: 0.3 });
    solid(k.x, polyP([[0, -68], [4, -57], [-4, -57]]), MATS['metal.steel']!, { a: [-4, -66], b: [4, -57], tex: null, size: 0.3 });
    if (sub === 'repeat') {
      // Magazine box riding the stock.
      const box = rrectP(-9, -44, 18, 30, 3);
      solid(k.x, box, wood, { a: [-9, -44], b: [9, -14], size: 0.6 });
      band(k, -38, 18, 3.5);
      band(k, -20, 18, 3.5);
    }
    if (heavy) {
      // Stirrup at the nose.
      const st = new Path2D();
      st.ellipse(0, -60, 9, 7, 0, 0, Math.PI * 2);
      k.x.save();
      k.x.lineWidth = 4;
      k.x.strokeStyle = css(MATS['metal.dark']!.c[1]);
      k.x.stroke(st);
      k.x.lineWidth = 1.5;
      k.x.strokeStyle = css(MATS['metal.dark']!.c[3]);
      k.x.stroke(st);
      k.x.restore();
    }
    // Trigger and lock plate.
    solid(k.x, rrectP(-5, -4, 10, 14, 2), k.rank >= 1 ? k.trim : MATS['metal.dark']!, { a: [-5, -4], b: [5, 10], tex: null, size: 0.4 });
    solid(k.x, polyP([[2, 14], [10, 22], [6, 24], [0, 18]]), MATS['metal.dark']!, { a: [0, 14], b: [10, 24], tex: null, size: 0.3 });
    maybeStone(k, 0, 3, 3.2);
    if (k.rank >= 4) runeMark(k, 0, 46, 7);
    if (k.rank >= 2) glint(k.x, -span + 6, -28, 6, 0xffffff, 0.8);
  }, 0.95);
};

// ---------------------------------------------------------------------------
// Wands, staves, sceptres
// ---------------------------------------------------------------------------

function focusStone(k: K, cx: number, cy: number, r: number, color: number): void {
  glow(k.x, cx, cy, r * 3.2, color, k.rank >= 4 ? 0.75 : 0.45);
  gem(k.x, cx, cy, r, color, k.ornate > 0.45 ? 'marquise' : 'oval', { glow: 0.4, fire: 1 });
}

const wandLike: Painter = (k) => {
  const sub = k.sub;
  const color = k.baseGlow ?? (k.rank >= 2 ? k.stone : 0x58b8ff);
  diag(k.x, () => {
    if (sub === 'bone') {
      const bone = MATS['bone.pale']!;
      const p = smoothP([[-5, 56], [-8, 64], [0, 70], [8, 64], [5, 56], [4, -10], [6, -40], [9, -46], [0, -52], [-9, -46], [-6, -40], [-4, -10]], 0.4);
      solid(k.x, p, bone, { a: [-8, 0], b: [8, 0], size: 0.6 });
      // A small skull crowns it.
      const sk = smoothP([[-11, -54], [-12, -68], [0, -76], [12, -68], [11, -54], [6, -48], [-6, -48]], 0.45);
      solid(k.x, sk, bone, { a: [-12, -72], b: [12, -48], size: 0.6 });
      k.x.save();
      for (const ex of [-4.6, 4.6]) {
        k.x.beginPath();
        k.x.ellipse(ex, -60, 3.4, 4, 0, 0, Math.PI * 2);
        k.x.fillStyle = '#120c0a';
        k.x.fill();
        glow(k.x, ex, -60, 7, color, 0.9);
      }
      k.x.restore();
      wrappedGrip(k, 26, 50, 8, MATS['leather.dark']!);
      if (k.rank >= 2) setStone(k, 0, 16, 3.2);
      return;
    }
    if (sub === 'crystal') {
      const handle = k.rank >= 1 ? k.trim : MATS['metal.dark']!;
      shaft(k, -24, 60, 7, 7.5, handle);
      wrappedGrip(k, 14, 52, 8.5, MATS['leather.dark']!);
      knob(k, 0, 64, 6, handle);
      const cm = rampOf(color, 0.6, null, 0);
      const shard = polyP([[0, -84], [8, -60], [6, -30], [0, -24], [-6, -30], [-8, -60]]);
      glow(k.x, 0, -56, 34, color, 0.55);
      solid(k.x, shard, cm, { a: [-8, -70], b: [8, -30], tex: null, size: 0.7 });
      k.x.save();
      k.x.beginPath();
      k.x.moveTo(0, -84);
      k.x.lineTo(0, -24);
      k.x.strokeStyle = css(cm.c[4], 0.7);
      k.x.lineWidth = 1;
      k.x.stroke();
      k.x.restore();
      for (const s of [-1, 1]) {
        const prong = new Path2D();
        prong.moveTo(s * 4, -22);
        prong.quadraticCurveTo(s * 14, -36, s * 6, -50);
        filigree(k, prong, 2.2, handle);
      }
      glint(k.x, -3, -66, 7, 0xffffff, 0.9);
      return;
    }
    // A twisted twig.
    const wood = k.pal.startsWith('wood') ? k.m : MATS['wood.dark']!;
    const pts: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push([Math.sin(t * 7 + 1) * 2.5 - 4 + t * 1.5, -60 + t * 126]);
    }
    for (let i = 10; i >= 0; i--) {
      const t = i / 10;
      pts.push([Math.sin(t * 7 + 1) * 2.5 + 4 + t * 3, -60 + t * 126]);
    }
    solid(k.x, smoothP(pts, 0.3), wood, { a: [-6, 0], b: [8, 0], texScale: 0.5, size: 0.5 });
    // Twig claws hold the stone.
    for (const s of [-1, 1]) {
      const c = new Path2D();
      c.moveTo(s * 2, -56);
      c.quadraticCurveTo(s * 12, -66, s * 5, -78);
      k.x.save();
      k.x.lineCap = 'round';
      k.x.strokeStyle = css(wood.c[0]);
      k.x.lineWidth = 4;
      k.x.stroke(c);
      k.x.strokeStyle = css(wood.c[2]);
      k.x.lineWidth = 2.4;
      k.x.stroke(c);
      k.x.restore();
    }
    focusStone(k, 0, -68, 7.5, color);
    wrappedGrip(k, 30, 56, 9);
    if (k.ornate > 0.3) band(k, 26, 10, 3.5);
  }, 1.0);
};

const staffLike: Painter = (k) => {
  const sub = k.sub;
  const color = k.baseGlow ?? (k.rank >= 2 ? k.stone : 0x58b8ff);
  diag(k.x, () => {
    if (sub === 'battle') {
      const wood = k.pal.startsWith('wood') ? k.m : MATS['wood.dark']!;
      const metal = k.pal.startsWith('metal') ? k.m : MATS['metal.iron']!;
      shaft(k, -84, 84, 7.5, 7.5, wood);
      for (const [y0, y1] of [[-86, -66], [66, 86]] as const) {
        solid(k.x, rrectP(-5.5, y0, 11, y1 - y0, 3), metal, { a: [-6, 0], b: [6, 0], size: 0.5 });
      }
      for (const y of [-56, -30, 30, 56]) band(k, y, 10, 3.6, metal);
      wrappedGrip(k, -12, 12, 9);
      solid(k.x, polyP([[-4, -86], [0, -96], [4, -86]]), metal, { a: [-4, -92], b: [4, -86], tex: null, size: 0.3 });
      if (k.rank >= 2) setStone(k, 0, -76, 3.6);
      if (k.rank >= 4) runeMark(k, 0, -43, 7);
      return;
    }
    if (sub === 'rune') {
      const wood = k.pal.startsWith('wood') ? k.m : MATS['wood.dark']!;
      const metal = k.rank >= 1 ? k.trim : MATS['metal.silver']!;
      shaft(k, -50, 86, 7, 6.5, wood);
      for (const y of [-40, 0, 40]) band(k, y, 9.5, 4, metal);
      wrappedGrip(k, 6, 34, 8.5);
      // A ring crown holding a floating crystal.
      const ring = new Path2D();
      ring.ellipse(0, -72, 20, 22, 0, 0, Math.PI * 2);
      k.x.save();
      k.x.lineWidth = 6;
      k.x.strokeStyle = css(metal.c[0]);
      k.x.stroke(ring);
      k.x.lineWidth = 4;
      k.x.strokeStyle = css(metal.c[2]);
      k.x.stroke(ring);
      k.x.lineWidth = 1.4;
      k.x.translate(-0.8, -0.8);
      k.x.strokeStyle = css(metal.c[4], 0.85);
      k.x.stroke(ring);
      k.x.restore();
      solid(k.x, polyP([[-8, -50], [0, -46], [8, -50], [4, -40], [-4, -40]]), metal, { a: [-8, -50], b: [8, -40], tex: null, size: 0.4 });
      const cm = rampOf(color, 0.6, null, 0);
      glow(k.x, 0, -72, 36, color, 0.6);
      solid(k.x, polyP([[0, -90], [8, -74], [0, -56], [-8, -74]]), cm, { a: [-8, -86], b: [8, -60], tex: null, size: 0.6 });
      glint(k.x, -2, -78, 7, 0xffffff, 0.9);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.5;
        runeMark(k, Math.cos(a) * 20, -72 + Math.sin(a) * 22, 3.6, color, k.h + i * 77, 0.8);
      }
      return;
    }
    // Gnarled staff with a crook cradling a stone.
    const wood = k.pal.startsWith('wood') ? k.m : MATS['wood.dark']!;
    shaft(k, -46, 88, 8, 7, wood, { wobble: 1.2 });
    const crook = new Path2D();
    crook.moveTo(0, -44);
    crook.bezierCurveTo(-2, -70, 22, -86, 22, -66);
    crook.bezierCurveTo(22, -56, 12, -54, 10, -62);
    k.x.save();
    k.x.lineCap = 'round';
    k.x.strokeStyle = css(wood.c[0]);
    k.x.lineWidth = 9.5;
    k.x.stroke(crook);
    k.x.strokeStyle = css(wood.c[2]);
    k.x.lineWidth = 7;
    k.x.stroke(crook);
    k.x.strokeStyle = css(wood.c[3], 0.8);
    k.x.lineWidth = 2;
    k.x.translate(-1.2, -0.5);
    k.x.stroke(crook);
    k.x.restore();
    focusStone(k, 6, -68, 8.5, color);
    wrappedGrip(k, 4, 30, 9.5);
    if (k.ornate > 0.25 || k.rank >= 1) band(k, -36, 10, 4);
  }, 0.92);
};

const scepterLike: Painter = (k) => {
  const sub = k.sub;
  const metal = k.pal.startsWith('metal') ? k.m : MATS['metal.gold']!;
  const color = k.baseGlow ?? (k.rank >= 2 ? k.stone : 0xffd870);
  diag(k.x, () => {
    shaft(k, -40, 64, 6.5, 7.5, metal);
    wrappedGrip(k, 26, 58, 8.5, MATS['leather.fine']!);
    knob(k, 0, 64, 6.5, metal, { facets: 8 });
    for (const y of [-30, 20]) band(k, y, 11, 4, k.rank >= 1 ? k.trim : metal);
    const cy = -58;
    if (sub === 'orbed') {
      // An orb held in a cage of curved bars.
      glow(k.x, 0, cy, 34, color, 0.6);
      const om = rampOf(color, 0.5, null, 0);
      solid(k.x, circleP(0, cy, 14), om, { a: [-14, cy - 14], b: [14, cy + 14], tex: null, size: 0.8 });
      spec(k.x, -5, cy - 6, 7, 4, -0.6, 0.85);
      for (const s of [-1, 0, 1]) {
        const bar = new Path2D();
        bar.moveTo(0, cy + 18);
        bar.bezierCurveTo(s * 22, cy + 12, s * 22, cy - 16, 0, cy - 20);
        filigree(k, bar, 2.2, metal);
      }
      knob(k, 0, cy - 22, 3.6, metal);
      return;
    }
    if (sub === 'spiked') {
      const pts: Pt[] = [];
      const n = 7;
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const r = i % 2 === 0 ? 24 : 11;
        pts.push([Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      solid(k.x, polyP(pts), metal, { a: [-20, cy - 20], b: [20, cy + 20], tex: null, size: 0.7 });
      setStone(k, 0, cy, 6);
      if (k.rank >= 4) glow(k.x, 0, cy, 34, color, 0.45);
      return;
    }
    // Crowned sceptre.
    const crown = polyP([[-14, cy + 14], [-17, cy - 10], [-9, cy - 2], [-6, cy - 18], [0, cy - 8], [6, cy - 18], [9, cy - 2], [17, cy - 10], [14, cy + 14]]);
    solid(k.x, crown, metal, { a: [-16, cy - 16], b: [16, cy + 14], tex: null, size: 0.7 });
    for (const px of [-17, -6, 6, 17]) knob(k, px, px === -17 || px === 17 ? cy - 10 : cy - 18, 2.4, metal);
    glow(k.x, 0, cy + 2, 22, color, 0.4);
    gem(k.x, 0, cy + 3, 6.5, color, 'oval', { glow: 0.4 });
  }, 1.0);
};

const quiverLike: Painter = (k) => {
  const leather = k.pal.startsWith('leather') ? k.m : MATS['leather.dark']!;
  diag(k.x, () => {
    // Arrows first, fanned from the mouth.
    for (let i = 0; i < 5; i++) {
      const xo = -12 + i * 6;
      const top = -82 + Math.abs(i - 2) * 4;
      solid(k.x, rrectP(xo - 1.3, top + 8, 2.6, 40, 1), MATS['wood.ash']!, { a: [xo - 2, 0], b: [xo + 2, 0], tex: null, outline: 0.8, size: 0.2 });
      const fl = k.rank >= 2 ? rampOf(k.stone, 0, 'weave', 0.2) : i % 2 ? MATS['cloth.banner']! : MATS['cloth.linen']!;
      solid(k.x, polyP([[xo - 4, top + 6], [xo, top - 4], [xo + 4, top + 6], [xo + 3, top + 18], [xo - 3, top + 18]]), fl, { a: [xo - 4, top], b: [xo + 4, top + 18], tex: null, outline: 0.9, size: 0.3 });
    }
    // Tube.
    const tube = smoothP([[-17, -44], [17, -44], [15, 40], [12, 74], [-12, 74], [-15, 40]], 0.2);
    solid(k.x, tube, leather, { a: [-17, 0], b: [17, 0], texRot: 0, size: 1 });
    band(k, -40, 36, 6, k.rank >= 1 ? k.trim : MATS['metal.dark']!);
    band(k, 68, 26, 6, k.rank >= 1 ? k.trim : MATS['metal.dark']!);
    // Stitched seam and a strap.
    k.x.save();
    k.x.setLineDash([3, 3]);
    k.x.strokeStyle = css(leather.c[4], 0.6);
    k.x.lineWidth = 1;
    k.x.beginPath();
    k.x.moveTo(8, -34);
    k.x.lineTo(7, 62);
    k.x.stroke();
    k.x.restore();
    solid(k.x, rrectP(-19, 8, 38, 8, 2), MATS['leather.worn']!, { a: [-19, 8], b: [19, 16], size: 0.4 });
    maybeStone(k, 0, 12, 4.2);
    if (k.rank >= 4) runeMark(k, -2, 40, 8);
  }, 1.0);
};

export const WEAPON_PAINTERS: Record<string, Painter> = {
  sword: swordLike,
  dagger: daggerLike,
  axe: axeLike,
  mace: maceLike,
  hammer: (k) => maceLike({ ...k, sub: 'war' }),
  maul: (k) => maceLike({ ...k, sub: 'great' }),
  spear: spearLike,
  pike: (k) => spearLike({ ...k, sub: 'pike' }),
  halberd: (k) => spearLike({ ...k, sub: 'halberd' }),
  trident: (k) => spearLike({ ...k, sub: 'trident' }),
  polearm: (k) => spearLike({ ...k, sub: 'halberd' }),
  bow: bowLike,
  crossbow: crossbowLike,
  wand: wandLike,
  staff: staffLike,
  scepter: scepterLike,
  quiver: quiverLike,
};

export { lift, sink };
