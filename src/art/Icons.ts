/**
 * Procedural inventory and skill icons.
 *
 * Everything is drawn to a canvas at generation time and cached as a data URI.
 * No image files, no icon fonts — the game ships zero assets.
 *
 * Item icons are driven by the base's authored `visual` block (shape family,
 * palette, ornateness) so a gold sceptre and an iron mace do not share art, and
 * rarity escalates visibly: trim, then gem settings, then a glowing rim.
 *
 * Skill icons encode what the skill *does*: the motif comes from the effect
 * handler (a burst, a beam, a forked bolt) and the colour language from the
 * damage type, so a fire nova and a cold nova read as siblings while a fire
 * nova and a fire beam read as different abilities.
 */
import type { Item, ItemRarity, DamageType } from '../types';
import { RARITY_COLOR } from '../types';

// ---------------------------------------------------------------------------
// Small deterministic RNG — icons must be stable across sessions.
// ---------------------------------------------------------------------------

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let h = seed >>> 0 || 1;
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

interface Swatch {
  /** Deepest shadow value. */
  dark: string;
  /** Mid / body value. */
  base: string;
  /** Lit value. */
  light: string;
  /** Specular hit. */
  spec: string;
  /** Secondary material (grip wrap, leather strap, wood haft). */
  accent: string;
  /** True for hard specular streaks; false for a soft diffuse roll. */
  metallic: boolean;
}

function sw(dark: string, base: string, light: string, spec: string, accent: string, metallic = true): Swatch {
  return { dark, base, light, spec, accent, metallic };
}

/**
 * Material swatches keyed by palette name. Values stay inside the physically
 * plausible albedo band — pure black or pure white kills the read at 32px.
 */
const SWATCHES: Record<string, Swatch> = {
  'metal.iron': sw('#2b2f36', '#5a626e', '#8e97a4', '#d6dde6', '#3d3229'),
  'metal.steel': sw('#333a45', '#6b7686', '#a3aebd', '#e8eef6', '#3a3027'),
  'metal.bronze': sw('#43301a', '#8a6033', '#c08b4a', '#f0cf92', '#3a2d1d'),
  'metal.gold': sw('#5c4310', '#b48a24', '#e3bb4c', '#fff0b0', '#4a3a12'),
  'metal.rusted': sw('#33221a', '#6d4630', '#9a6a45', '#c99a6c', '#2e2620'),
  'metal.dark': sw('#17191f', '#33383f', '#565d68', '#8e97a4', '#241f1c'),
  'metal.silver': sw('#39414c', '#7b8797', '#b6c2d0', '#f2f7ff', '#3a3027'),
  'wood.oak': sw('#2e2115', '#6b4a2c', '#95693f', '#c19566', '#4a3524', false),
  'wood.rotted': sw('#241f18', '#4a4232', '#6b6048', '#8d8064', '#332c22', false),
  'wood.charred': sw('#16130f', '#2e2822', '#4a4038', '#6a5c50', '#241d18', false),
  'wood.polished': sw('#33200f', '#7a4a20', '#a76b34', '#d19b5e', '#4a3018', false),
  'cloth.linen': sw('#3a3428', '#7d7360', '#a89c85', '#cfc4ad', '#544a3a', false),
  'cloth.silk': sw('#33283a', '#6c5a7d', '#9384a8', '#c0b3d2', '#463a52', false),
  'cloth.tattered': sw('#2a2620', '#5b5344', '#7d7461', '#9c9481', '#3d372c', false),
  'cloth.banner': sw('#3d1a1a', '#7e3030', '#a84a44', '#d07a६8'.replace('६', '6'), '#4a2320', false),
  'leather.worn': sw('#241a12', '#553c26', '#7a583a', '#9d7a55', '#3a2a1c', false),
  'leather.studded': sw('#1f1811', '#493422', '#6b4d33', '#8e6c4c', '#5a626e', false),
  'leather.fine': sw('#2a1d14', '#603f28', '#8a5e3d', '#b0825a', '#b48a24', false),
  'crystal.void': sw('#20143a', '#4a2a86', '#7d4fc4', '#c39dff', '#2a1a4a', false),
  'crystal.ice': sw('#153044', '#2f6f95', '#63a8c9', '#c2ecff', '#1d3d52', false),
  'crystal.arcane': sw('#3a1436', '#8a2a7a', '#c052ab', '#ffaee8', '#4a1a44', false),
  'bone.pale': sw('#3b352a', '#8e8571', '#bdb49c', '#e8e0c8', '#4a4336', false),
  'flesh.rotted': sw('#2a2a1e', '#5c6040', '#83885c', '#a8ac7e', '#3a2a2a', false),
};

/** Resolve a palette key to a swatch, falling back on its family. */
function swatchFor(palette: string | undefined): Swatch {
  if (!palette) return SWATCHES['metal.steel']!;
  const key = palette.split('|')[0]!.trim();
  if (SWATCHES[key]) return SWATCHES[key]!;
  const family = key.split('.')[0];
  for (const k of Object.keys(SWATCHES)) {
    if (k.startsWith(family + '.')) return SWATCHES[k]!;
  }
  return SWATCHES['metal.steel']!;
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function rgba(hex: number, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function hexStr(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

const S = 128; // internal draw resolution

function newCanvas(size = S): { c: HTMLCanvasElement; x: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = true;
  return { c, x };
}

/**
 * Light comes from the top-left, consistently across every icon. A shared light
 * direction is most of what makes a set of icons look like a set.
 */
function shade(
  x: CanvasRenderingContext2D,
  s: Swatch,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): CanvasGradient {
  const g = x.createLinearGradient(x0, y0, x1, y1);
  if (s.metallic) {
    // Metal: dark, quick ramp to a hard specular streak, then falls away.
    g.addColorStop(0.0, s.dark);
    g.addColorStop(0.22, s.base);
    g.addColorStop(0.44, s.spec);
    g.addColorStop(0.52, s.light);
    g.addColorStop(0.78, s.base);
    g.addColorStop(1.0, s.dark);
  } else {
    // Non-metal: soft diffuse roll, no mirror highlight.
    g.addColorStop(0.0, s.dark);
    g.addColorStop(0.35, s.base);
    g.addColorStop(0.62, s.light);
    g.addColorStop(1.0, s.dark);
  }
  return g;
}

function poly(x: CanvasRenderingContext2D, pts: Array<[number, number]>): void {
  x.beginPath();
  x.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) x.lineTo(pts[i]![0], pts[i]![1]);
  x.closePath();
}

/** Fills a shape and gives it a darker contact edge rather than a black outline. */
function fillShape(x: CanvasRenderingContext2D, s: Swatch, grad: CanvasGradient | string): void {
  x.fillStyle = grad;
  x.fill();
  x.strokeStyle = s.dark;
  x.lineWidth = 2;
  x.stroke();
}

/** Wood grain / cloth weave — breaks up flat fills on non-metals. */
function grain(x: CanvasRenderingContext2D, s: Swatch, rnd: () => number, n = 7): void {
  x.save();
  x.clip();
  x.globalAlpha = 0.18;
  x.strokeStyle = s.dark;
  x.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    const px = 20 + rnd() * 88;
    x.beginPath();
    x.moveTo(px, 0);
    x.bezierCurveTo(px + rnd() * 8 - 4, 40, px + rnd() * 8 - 4, 88, px + rnd() * 6 - 3, 128);
    x.stroke();
  }
  x.restore();
  x.globalAlpha = 1;
}

function gemAt(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, colour: number): void {
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, rgba(colour, 0.95));
  g.addColorStop(1, rgba(colour, 0.55));
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = 'rgba(0,0,0,.45)';
  x.lineWidth = 1.4;
  x.stroke();
}

// ---------------------------------------------------------------------------
// Item shape routines. Each draws into a 128×128 field.
// ---------------------------------------------------------------------------

type Draw = (x: CanvasRenderingContext2D, s: Swatch, rnd: () => number, ornate: number) => void;

function grip(x: CanvasRenderingContext2D, s: Swatch, cx: number, y0: number, y1: number, w = 7): void {
  const lg = x.createLinearGradient(cx - w, 0, cx + w, 0);
  lg.addColorStop(0, '#241a12');
  lg.addColorStop(0.5, s.accent);
  lg.addColorStop(1, '#1c1410');
  x.fillStyle = lg;
  x.fillRect(cx - w, y0, w * 2, y1 - y0);
  // Wrap bindings.
  x.strokeStyle = 'rgba(0,0,0,.4)';
  x.lineWidth = 1.4;
  for (let y = y0 + 4; y < y1 - 2; y += 6) {
    x.beginPath();
    x.moveTo(cx - w, y);
    x.lineTo(cx + w, y + 2.5);
    x.stroke();
  }
}

const bladeWeapon = (len: number, wide: number, guardW: number): Draw =>
  (x, s, _rnd, ornate) => {
    const cx = 64;
    const tip = 128 - len;
    const guardY = 128 - len + len * 0.72;
    // Blade
    poly(x, [
      [cx, tip],
      [cx + wide, tip + 14],
      [cx + wide * 0.8, guardY],
      [cx - wide * 0.8, guardY],
      [cx - wide, tip + 14],
    ]);
    fillShape(x, s, shade(x, s, cx - wide, tip, cx + wide, guardY));
    // Fuller — the groove down the centre reads as forged steel.
    x.beginPath();
    x.moveTo(cx, tip + 10);
    x.lineTo(cx, guardY - 4);
    x.strokeStyle = rgba(0x000000, 0.35);
    x.lineWidth = 2.5;
    x.stroke();
    x.beginPath();
    x.moveTo(cx - 1.5, tip + 12);
    x.lineTo(cx - 1.5, guardY - 6);
    x.strokeStyle = rgba(0xffffff, 0.22);
    x.lineWidth = 1.2;
    x.stroke();
    // Guard
    poly(x, [
      [cx - guardW, guardY],
      [cx + guardW, guardY],
      [cx + guardW * 0.75, guardY + 8],
      [cx - guardW * 0.75, guardY + 8],
    ]);
    fillShape(x, s, shade(x, s, cx - guardW, guardY, cx + guardW, guardY + 8));
    grip(x, s, cx, guardY + 8, 118);
    // Pommel
    x.beginPath();
    x.arc(cx, 120, 7, 0, Math.PI * 2);
    fillShape(x, s, shade(x, s, cx - 7, 113, cx + 7, 127));
    if (ornate > 0.5) gemAt(x, cx, guardY + 3, 4.2, 0xc0504a);
  };

const axeLike = (heavy: boolean): Draw =>
  (x, s, rnd, ornate) => {
    const cx = 60;
    // Haft
    const wood = SWATCHES['wood.oak']!;
    x.save();
    poly(x, [[cx - 5, 16], [cx + 5, 16], [cx + 6, 124], [cx - 6, 124]]);
    fillShape(x, wood, shade(x, wood, cx - 6, 0, cx + 6, 0));
    poly(x, [[cx - 5, 16], [cx + 5, 16], [cx + 6, 124], [cx - 6, 124]]);
    grain(x, wood, rnd, 4);
    x.restore();
    // Head
    const top = 22;
    const h = heavy ? 52 : 40;
    poly(x, [
      [cx + 2, top],
      [cx + 34, top + 6],
      [cx + 44, top + h * 0.5],
      [cx + 34, top + h],
      [cx + 2, top + h - 4],
    ]);
    fillShape(x, s, shade(x, s, cx, top, cx + 44, top + h));
    // Edge highlight along the cutting face.
    x.beginPath();
    x.moveTo(cx + 34, top + 6);
    x.quadraticCurveTo(cx + 46, top + h * 0.5, cx + 34, top + h);
    x.strokeStyle = s.spec;
    x.lineWidth = 2.6;
    x.stroke();
    if (heavy) {
      // Mirrored bit for a double-headed axe.
      poly(x, [
        [cx - 2, top],
        [cx - 30, top + 6],
        [cx - 38, top + h * 0.5],
        [cx - 30, top + h],
        [cx - 2, top + h - 4],
      ]);
      fillShape(x, s, shade(x, s, cx - 38, top, cx, top + h));
    }
    if (ornate > 0.45) gemAt(x, cx + 14, top + h * 0.5, 4.5, 0x4aa8c0);
  };

const maceLike: Draw = (x, s, rnd, ornate) => {
  const cx = 64;
  grip(x, s, cx, 60, 122, 6);
  // Head
  x.beginPath();
  x.arc(cx, 42, 24, 0, Math.PI * 2);
  fillShape(x, s, shade(x, s, cx - 24, 18, cx + 24, 66));
  // Flanges
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const r0 = 20;
    const r1 = 33;
    poly(x, [
      [cx + Math.cos(a - 0.22) * r0, 42 + Math.sin(a - 0.22) * r0],
      [cx + Math.cos(a) * r1, 42 + Math.sin(a) * r1],
      [cx + Math.cos(a + 0.22) * r0, 42 + Math.sin(a + 0.22) * r0],
    ]);
    fillShape(x, s, shade(x, s, cx - 30, 12, cx + 30, 72));
  }
  x.beginPath();
  x.arc(cx - 7, 34, 7, 0, Math.PI * 2);
  x.fillStyle = rgba(0xffffff, s.metallic ? 0.3 : 0.15);
  x.fill();
  if (ornate > 0.5) gemAt(x, cx, 42, 6, 0xc06a2a);
  void rnd;
};

const daggerLike: Draw = bladeWeapon(74, 9, 16);
const swordLike: Draw = bladeWeapon(96, 13, 26);
const spearLike: Draw = (x, s, rnd, ornate) => {
  const cx = 64;
  const wood = SWATCHES['wood.oak']!;
  x.save();
  poly(x, [[cx - 5, 40], [cx + 5, 40], [cx + 5, 126], [cx - 5, 126]]);
  fillShape(x, wood, shade(x, wood, cx - 5, 0, cx + 5, 0));
  poly(x, [[cx - 5, 40], [cx + 5, 40], [cx + 5, 126], [cx - 5, 126]]);
  grain(x, wood, rnd, 3);
  x.restore();
  poly(x, [[cx, 6], [cx + 13, 30], [cx + 7, 46], [cx - 7, 46], [cx - 13, 30]]);
  fillShape(x, s, shade(x, s, cx - 13, 6, cx + 13, 46));
  x.beginPath();
  x.moveTo(cx, 10);
  x.lineTo(cx, 44);
  x.strokeStyle = rgba(0x000000, 0.32);
  x.lineWidth = 2;
  x.stroke();
  if (ornate > 0.5) {
    x.strokeStyle = hexStr(0xb48a24);
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(cx - 6, 50);
    x.lineTo(cx + 6, 50);
    x.stroke();
  }
};

const bowLike = (crossbow: boolean): Draw =>
  (x, s, rnd, ornate) => {
    const wood = SWATCHES['wood.polished']!;
    if (crossbow) {
      // Stock
      poly(x, [[52, 30], [74, 30], [78, 118], [50, 118]]);
      fillShape(x, wood, shade(x, wood, 50, 30, 78, 118));
      // Prod
      x.beginPath();
      x.moveTo(14, 44);
      x.quadraticCurveTo(64, 22, 114, 44);
      x.strokeStyle = s.base;
      x.lineWidth = 8;
      x.lineCap = 'round';
      x.stroke();
      x.strokeStyle = s.spec;
      x.lineWidth = 2.4;
      x.stroke();
      // String
      x.beginPath();
      x.moveTo(16, 46);
      x.lineTo(64, 62);
      x.lineTo(112, 46);
      x.strokeStyle = '#d8cfae';
      x.lineWidth = 1.8;
      x.stroke();
    } else {
      x.beginPath();
      x.moveTo(38, 10);
      x.bezierCurveTo(96, 40, 96, 88, 38, 118);
      x.strokeStyle = wood.dark;
      x.lineWidth = 11;
      x.lineCap = 'round';
      x.stroke();
      x.strokeStyle = wood.base;
      x.lineWidth = 7.5;
      x.stroke();
      x.strokeStyle = wood.light;
      x.lineWidth = 2.6;
      x.stroke();
      // String
      x.beginPath();
      x.moveTo(38, 10);
      x.lineTo(38, 118);
      x.strokeStyle = '#ddd4b6';
      x.lineWidth = 2;
      x.stroke();
      if (ornate > 0.45) gemAt(x, 84, 64, 5, 0x63c08a);
    }
    void rnd;
  };

const staffLike = (short: boolean): Draw =>
  (x, s, rnd, ornate) => {
    const cx = 64;
    const wood = SWATCHES['wood.oak']!;
    const top = short ? 56 : 30;
    x.save();
    poly(x, [[cx - 5, top], [cx + 5, top], [cx + 6, 126], [cx - 6, 126]]);
    fillShape(x, wood, shade(x, wood, cx - 6, 0, cx + 6, 0));
    poly(x, [[cx - 5, top], [cx + 5, top], [cx + 6, 126], [cx - 6, 126]]);
    grain(x, wood, rnd, 4);
    x.restore();
    // Crown holding a focus stone.
    const cy = top - 14;
    x.beginPath();
    x.moveTo(cx - 16, cy + 16);
    x.quadraticCurveTo(cx - 20, cy - 12, cx, cy - 18);
    x.quadraticCurveTo(cx + 20, cy - 12, cx + 16, cy + 16);
    x.strokeStyle = s.base;
    x.lineWidth = 5;
    x.stroke();
    x.strokeStyle = s.spec;
    x.lineWidth = 1.8;
    x.stroke();
    gemAt(x, cx, cy + 2, short ? 9 : 12, ornate > 0.5 ? 0xb050ff : 0x50a8ff);
  };

const shieldLike: Draw = (x, s, rnd, ornate) => {
  x.beginPath();
  x.moveTo(24, 20);
  x.lineTo(104, 20);
  x.lineTo(104, 72);
  x.quadraticCurveTo(104, 106, 64, 122);
  x.quadraticCurveTo(24, 106, 24, 72);
  x.closePath();
  fillShape(x, s, shade(x, s, 24, 20, 104, 122));
  // Rim
  x.save();
  x.beginPath();
  x.moveTo(24, 20);
  x.lineTo(104, 20);
  x.lineTo(104, 72);
  x.quadraticCurveTo(104, 106, 64, 122);
  x.quadraticCurveTo(24, 106, 24, 72);
  x.closePath();
  x.strokeStyle = s.light;
  x.lineWidth = 4;
  x.stroke();
  x.restore();
  // Boss
  x.beginPath();
  x.arc(64, 62, 15, 0, Math.PI * 2);
  fillShape(x, s, shade(x, s, 49, 47, 79, 77));
  if (ornate > 0.4) {
    x.strokeStyle = rgba(0xb48a24, 0.85);
    x.lineWidth = 2.2;
    x.beginPath();
    x.moveTo(64, 26);
    x.lineTo(64, 112);
    x.stroke();
    gemAt(x, 64, 62, 6, 0xd0442a);
  }
  void rnd;
};

const orbLike: Draw = (x, s, _rnd, ornate) => {
  const g = x.createRadialGradient(52, 50, 6, 64, 64, 40);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, s.light);
  g.addColorStop(0.7, s.base);
  g.addColorStop(1, s.dark);
  x.beginPath();
  x.arc(64, 64, 38, 0, Math.PI * 2);
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = rgba(0x000000, 0.4);
  x.lineWidth = 2;
  x.stroke();
  // Inner swirl suggests something alive inside the glass.
  x.save();
  x.beginPath();
  x.arc(64, 64, 36, 0, Math.PI * 2);
  x.clip();
  x.globalAlpha = 0.45;
  x.strokeStyle = s.spec;
  x.lineWidth = 3;
  x.beginPath();
  x.arc(72, 74, 22, 0.6, 2.6);
  x.stroke();
  x.restore();
  x.globalAlpha = 1;
  // Specular
  x.beginPath();
  x.ellipse(52, 48, 11, 7, -0.6, 0, Math.PI * 2);
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.fill();
  if (ornate > 0.4) {
    x.strokeStyle = rgba(0xb48a24, 0.9);
    x.lineWidth = 3;
    x.beginPath();
    x.arc(64, 64, 41, 0.4, 2.2);
    x.stroke();
  }
};

const helmLike: Draw = (x, s, _rnd, ornate) => {
  x.beginPath();
  x.moveTo(30, 84);
  x.quadraticCurveTo(30, 26, 64, 26);
  x.quadraticCurveTo(98, 26, 98, 84);
  x.lineTo(92, 100);
  x.lineTo(36, 100);
  x.closePath();
  fillShape(x, s, shade(x, s, 30, 26, 98, 100));
  // Visor slot
  x.fillStyle = 'rgba(0,0,0,.55)';
  x.fillRect(40, 62, 48, 9);
  x.fillRect(60, 70, 8, 20);
  // Brow ridge
  x.beginPath();
  x.moveTo(34, 60);
  x.quadraticCurveTo(64, 46, 94, 60);
  x.strokeStyle = s.light;
  x.lineWidth = 3.5;
  x.stroke();
  if (ornate > 0.45) {
    // Crest
    x.beginPath();
    x.moveTo(64, 24);
    x.quadraticCurveTo(74, 8, 64, 4);
    x.quadraticCurveTo(54, 8, 64, 24);
    x.fillStyle = hexStr(0xa03a2a);
    x.fill();
  }
};

const chestLike: Draw = (x, s, rnd, ornate) => {
  x.beginPath();
  x.moveTo(38, 30);
  x.lineTo(64, 22);
  x.lineTo(90, 30);
  x.lineTo(96, 84);
  x.quadraticCurveTo(64, 110, 32, 84);
  x.closePath();
  fillShape(x, s, shade(x, s, 32, 22, 96, 110));
  // Pauldrons
  for (const sx of [30, 98]) {
    x.beginPath();
    x.ellipse(sx, 40, 15, 11, sx < 64 ? 0.4 : -0.4, 0, Math.PI * 2);
    fillShape(x, s, shade(x, s, sx - 15, 29, sx + 15, 51));
  }
  // Sternum line + ribs
  x.strokeStyle = rgba(0x000000, 0.35);
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(64, 30);
  x.lineTo(64, 96);
  x.stroke();
  for (let i = 0; i < 3; i++) {
    const y = 48 + i * 14;
    x.beginPath();
    x.moveTo(42, y);
    x.quadraticCurveTo(64, y + 7, 86, y);
    x.strokeStyle = rgba(0xffffff, 0.14);
    x.lineWidth = 2;
    x.stroke();
  }
  if (!s.metallic) grain(x, s, rnd, 5);
  if (ornate > 0.5) gemAt(x, 64, 44, 5.5, 0x3aa0d0);
};

const glovesLike: Draw = (x, s, _rnd, ornate) => {
  x.beginPath();
  x.moveTo(42, 44);
  x.lineTo(84, 38);
  x.lineTo(92, 76);
  x.quadraticCurveTo(66, 96, 40, 80);
  x.closePath();
  fillShape(x, s, shade(x, s, 40, 38, 92, 96));
  // Fingers
  for (let i = 0; i < 4; i++) {
    const px = 48 + i * 12;
    x.beginPath();
    x.roundRect?.(px, 26, 9, 20, 4);
    if (!x.roundRect) x.rect(px, 26, 9, 20);
    fillShape(x, s, shade(x, s, px, 26, px + 9, 46));
  }
  // Cuff
  x.beginPath();
  x.roundRect?.(38, 78, 56, 16, 5);
  if (!x.roundRect) x.rect(38, 78, 56, 16);
  fillShape(x, s, shade(x, s, 38, 78, 94, 94));
  if (ornate > 0.5) gemAt(x, 66, 62, 5, 0xc0a030);
};

const bootsLike: Draw = (x, s, _rnd, ornate) => {
  x.beginPath();
  x.moveTo(44, 24);
  x.lineTo(74, 24);
  x.lineTo(78, 78);
  x.lineTo(102, 92);
  x.lineTo(102, 106);
  x.lineTo(40, 106);
  x.lineTo(40, 40);
  x.closePath();
  fillShape(x, s, shade(x, s, 40, 24, 102, 106));
  // Sole
  x.fillStyle = '#1b1712';
  x.fillRect(38, 100, 66, 8);
  // Cuff
  x.beginPath();
  x.roundRect?.(40, 22, 36, 13, 4);
  if (!x.roundRect) x.rect(40, 22, 36, 13);
  fillShape(x, s, shade(x, s, 40, 22, 76, 35));
  if (ornate > 0.5) {
    x.strokeStyle = rgba(0xb48a24, 0.9);
    x.lineWidth = 2.4;
    x.beginPath();
    x.moveTo(44, 62);
    x.lineTo(76, 62);
    x.stroke();
  }
};

const beltLike: Draw = (x, s, _rnd, ornate) => {
  x.beginPath();
  x.roundRect?.(16, 52, 96, 26, 6);
  if (!x.roundRect) x.rect(16, 52, 96, 26);
  fillShape(x, s, shade(x, s, 16, 52, 112, 78));
  // Buckle
  x.beginPath();
  x.roundRect?.(52, 44, 26, 42, 5);
  if (!x.roundRect) x.rect(52, 44, 26, 42);
  const metal = SWATCHES['metal.gold']!;
  fillShape(x, metal, shade(x, metal, 52, 44, 78, 86));
  x.fillStyle = 'rgba(0,0,0,.5)';
  x.fillRect(59, 52, 12, 26);
  // Studs
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const px = 64 + side * (30 + i * 14);
      x.beginPath();
      x.arc(px, 65, 3.2, 0, Math.PI * 2);
      x.fillStyle = metal.light;
      x.fill();
    }
  }
  if (ornate > 0.5) gemAt(x, 65, 65, 4.5, 0x50c07a);
};

const amuletLike: Draw = (x, s, _rnd, ornate) => {
  // Chain
  x.strokeStyle = SWATCHES['metal.gold']!.base;
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(38, 22);
  x.quadraticCurveTo(64, 58, 90, 22);
  x.stroke();
  x.strokeStyle = SWATCHES['metal.gold']!.spec;
  x.lineWidth = 1.2;
  x.stroke();
  // Setting
  x.beginPath();
  x.moveTo(64, 44);
  x.lineTo(88, 68);
  x.lineTo(64, 104);
  x.lineTo(40, 68);
  x.closePath();
  fillShape(x, s, shade(x, s, 40, 44, 88, 104));
  gemAt(x, 64, 72, 13, ornate > 0.5 ? 0xc050ff : 0x50a0ff);
};

const ringLike: Draw = (x, s, _rnd, ornate) => {
  x.beginPath();
  x.arc(64, 74, 30, 0, Math.PI * 2);
  x.strokeStyle = s.dark;
  x.lineWidth = 15;
  x.stroke();
  x.strokeStyle = s.base;
  x.lineWidth = 11;
  x.stroke();
  x.strokeStyle = s.spec;
  x.lineWidth = 3.5;
  x.beginPath();
  x.arc(64, 74, 30, Math.PI * 1.05, Math.PI * 1.6);
  x.stroke();
  gemAt(x, 64, 38, ornate > 0.5 ? 14 : 11, ornate > 0.5 ? 0xff5aa0 : 0x60d0ff);
};

/**
 * Which liquid to draw. Set by the resolver from the base id before the draw
 * runs: mana is blue, healing is red, and it is not negotiable — a potion whose
 * colour depended on its rarity meant a greater healing potion came out blue.
 */
let potionTint = 0xe03a4a;

const potionLike: Draw = (x, _s, _rnd, _ornate) => {
  const liquid = potionTint;
  // Glass body
  x.beginPath();
  x.moveTo(52, 34);
  x.lineTo(76, 34);
  x.lineTo(76, 52);
  x.quadraticCurveTo(98, 70, 92, 96);
  x.quadraticCurveTo(86, 116, 64, 116);
  x.quadraticCurveTo(42, 116, 36, 96);
  x.quadraticCurveTo(30, 70, 52, 52);
  x.closePath();
  const g = x.createLinearGradient(36, 40, 92, 116);
  g.addColorStop(0, rgba(liquid, 0.35));
  g.addColorStop(0.45, rgba(liquid, 0.95));
  g.addColorStop(1, rgba(liquid, 0.6));
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = 'rgba(220,235,255,.5)';
  x.lineWidth = 2.4;
  x.stroke();
  // Cork
  const wood = SWATCHES['wood.oak']!;
  x.beginPath();
  x.roundRect?.(50, 20, 28, 18, 4);
  if (!x.roundRect) x.rect(50, 20, 28, 18);
  fillShape(x, wood, shade(x, wood, 50, 20, 78, 38));
  // Highlight
  x.beginPath();
  x.ellipse(50, 74, 5, 16, 0.25, 0, Math.PI * 2);
  x.fillStyle = 'rgba(255,255,255,.4)';
  x.fill();
};

const gemLike: Draw = (x, s, _rnd, ornate) => {
  const c = ornate > 0.5 ? 0xff4aa0 : 0x4ad0ff;
  poly(x, [[64, 20], [96, 50], [82, 104], [46, 104], [32, 50]]);
  const g = x.createLinearGradient(32, 20, 96, 104);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, rgba(c, 0.95));
  g.addColorStop(1, rgba(c, 0.5));
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = rgba(0x000000, 0.4);
  x.lineWidth = 2;
  x.stroke();
  // Facets
  x.strokeStyle = 'rgba(255,255,255,.4)';
  x.lineWidth = 1.6;
  x.beginPath();
  x.moveTo(64, 20);
  x.lineTo(64, 104);
  x.moveTo(32, 50);
  x.lineTo(96, 50);
  x.moveTo(64, 20);
  x.lineTo(46, 104);
  x.moveTo(64, 20);
  x.lineTo(82, 104);
  x.stroke();
  void s;
};

const runeLike: Draw = (x, s, rnd, ornate) => {
  const stone = SWATCHES['bone.pale']!;
  x.beginPath();
  x.roundRect?.(34, 28, 60, 74, 8);
  if (!x.roundRect) x.rect(34, 28, 60, 74);
  fillShape(x, stone, shade(x, stone, 34, 28, 94, 102));
  // Carved glyph
  const c = ornate > 0.5 ? 0xffb040 : 0xff7a30;
  x.strokeStyle = rgba(c, 0.95);
  x.lineWidth = 5;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.shadowColor = rgba(c, 0.9);
  x.shadowBlur = 10;
  x.beginPath();
  const n = 3 + Math.floor(rnd() * 3);
  let px = 50 + rnd() * 10;
  let py = 40;
  x.moveTo(px, py);
  for (let i = 0; i < n; i++) {
    px = 44 + rnd() * 40;
    py = 40 + ((i + 1) / n) * 50;
    x.lineTo(px, py);
  }
  x.stroke();
  x.shadowBlur = 0;
  void s;
};

const materialLike: Draw = (x, s, rnd, _o) => {
  for (let i = 0; i < 5; i++) {
    const cx = 44 + rnd() * 40;
    const cy = 52 + rnd() * 40;
    const r = 9 + rnd() * 9;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    fillShape(x, s, shade(x, s, cx - r, cy - r, cx + r, cy + r));
  }
};

const quiverLike: Draw = (x, s, _rnd, ornate) => {
  const leather = SWATCHES['leather.worn']!;
  x.beginPath();
  x.roundRect?.(46, 46, 40, 72, 8);
  if (!x.roundRect) x.rect(46, 46, 40, 72);
  fillShape(x, leather, shade(x, leather, 46, 46, 86, 118));
  // Arrows
  for (let i = 0; i < 3; i++) {
    const px = 54 + i * 11;
    x.strokeStyle = SWATCHES['wood.oak']!.base;
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(px, 46);
    x.lineTo(px, 16);
    x.stroke();
    poly(x, [[px, 8], [px + 5, 18], [px - 5, 18]]);
    fillShape(x, s, shade(x, s, px - 5, 8, px + 5, 18));
  }
  if (ornate > 0.5) {
    x.strokeStyle = rgba(0xb48a24, 0.9);
    x.lineWidth = 2.5;
    x.beginPath();
    x.moveTo(46, 76);
    x.lineTo(86, 76);
    x.stroke();
  }
};

/** Shape family → drawing routine. */
const SHAPES: Record<string, Draw> = {
  sword: swordLike,
  greatsword: swordLike,
  dagger: daggerLike,
  knife: daggerLike,
  axe: axeLike(false),
  greataxe: axeLike(true),
  mace: maceLike,
  hammer: maceLike,
  club: maceLike,
  spear: spearLike,
  polearm: spearLike,
  bow: bowLike(false),
  crossbow: bowLike(true),
  wand: staffLike(true),
  scepter: staffLike(true),
  staff: staffLike(false),
  shield: shieldLike,
  buckler: shieldLike,
  orb: orbLike,
  quiver: quiverLike,
  helm: helmLike,
  chest: chestLike,
  armor: chestLike,
  gloves: glovesLike,
  boots: bootsLike,
  belt: beltLike,
  amulet: amuletLike,
  ring: ringLike,
  charm: gemLike,
  gem: gemLike,
  rune: runeLike,
  potion: potionLike,
  material: materialLike,
};

/** Red for life, blue for mana, purple for anything that restores both. */
export function potionColor(hay: string): number {
  const h = hay.toLowerCase();
  const life = /heal|life|health|blood|crimson|rejuv/.test(h);
  const mana = /mana|azure|sapphire|spirit|arcane|rejuv/.test(h);
  if (life && mana) return 0xb060ff;
  if (mana) return 0x3aa0ff;
  if (life) return 0xe03a4a;
  if (/antidote|venom|poison/.test(h)) return 0x6cc02c;
  if (/thaw|frost|cold/.test(h)) return 0x7fd8ff;
  if (/stamina|haste/.test(h)) return 0xe0c040;
  if (/oil|fire/.test(h)) return 0xff7a2a;
  return 0xe03a4a;
}

/** Infer a shape family from a base id when the visual block is unhelpful. */
function inferShape(baseId: string, category?: string): string {
  const hay = `${baseId} ${category ?? ''}`.toLowerCase();
  const table: Array<[string, string]> = [
    ['greatsword', 'sword'], ['sword', 'sword'], ['blade', 'sword'], ['falchion', 'sword'],
    ['dagger', 'dagger'], ['dirk', 'dagger'], ['kris', 'dagger'], ['knife', 'dagger'],
    ['greataxe', 'greataxe'], ['axe', 'axe'], ['cleaver', 'axe'],
    ['maul', 'mace'], ['hammer', 'mace'], ['mace', 'mace'], ['club', 'mace'], ['flail', 'mace'],
    ['spear', 'spear'], ['pike', 'spear'], ['halberd', 'spear'], ['glaive', 'spear'], ['lance', 'spear'],
    ['crossbow', 'crossbow'], ['bow', 'bow'],
    ['wand', 'wand'], ['scepter', 'scepter'], ['sceptre', 'scepter'], ['staff', 'staff'], ['rod', 'staff'],
    ['shield', 'shield'], ['buckler', 'shield'], ['aegis', 'shield'],
    ['orb', 'orb'], ['quiver', 'quiver'],
    ['helm', 'helm'], ['crown', 'helm'], ['cap', 'helm'], ['diadem', 'helm'], ['mask', 'helm'],
    ['chest', 'chest'], ['plate', 'chest'], ['mail', 'chest'], ['robe', 'chest'], ['armor', 'chest'], ['armour', 'chest'],
    ['glove', 'gloves'], ['gaunt', 'gloves'], ['grip', 'gloves'],
    ['boot', 'boots'], ['greave', 'boots'], ['sabaton', 'boots'], ['shoe', 'boots'],
    ['belt', 'belt'], ['sash', 'belt'], ['girdle', 'belt'],
    ['amulet', 'amulet'], ['necklace', 'amulet'], ['pendant', 'amulet'], ['talisman', 'amulet'],
    ['ring', 'ring'], ['band', 'ring'], ['loop', 'ring'],
    ['charm', 'charm'], ['gem', 'gem'], ['rune', 'rune'], ['potion', 'potion'], ['flask', 'potion'], ['elixir', 'potion'],
  ];
  for (const [needle, shape] of table) if (hay.includes(needle)) return shape;
  return 'material';
}

// ---------------------------------------------------------------------------
// Rarity treatment
// ---------------------------------------------------------------------------

const RARITY_RANK: Record<ItemRarity, number> = {
  normal: 0, magic: 1, rare: 2, set: 3, unique: 4, mythic: 5, ancient: 6,
};

/** Background wash + rim, drawn under and over the item respectively. */
function rarityUnder(x: CanvasRenderingContext2D, rarity: ItemRarity): void {
  const rank = RARITY_RANK[rarity];
  if (rank < 1) return;
  const c = RARITY_COLOR[rarity];
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, rgba(c, 0.1 + rank * 0.055));
  g.addColorStop(1, rgba(c, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
}

function rarityOver(x: CanvasRenderingContext2D, rarity: ItemRarity, rnd: () => number): void {
  const rank = RARITY_RANK[rarity];
  if (rank < 3) return;
  const c = RARITY_COLOR[rarity];
  // Emissive rim: composite the item's own silhouette in the rarity colour.
  x.save();
  x.globalCompositeOperation = 'source-atop';
  const g = x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, rgba(c, 0.05 + rank * 0.03));
  g.addColorStop(1, rgba(c, 0.02));
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  x.restore();

  // Orbiting motes for the true chase tiers.
  if (rank >= 5) {
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 40 + rnd() * 22;
      const px = 64 + Math.cos(a) * r;
      const py = 64 + Math.sin(a) * r * 0.85;
      const rr = 1.6 + rnd() * 2.4;
      const mg = x.createRadialGradient(px, py, 0, px, py, rr * 3);
      mg.addColorStop(0, rgba(c, 0.95));
      mg.addColorStop(1, rgba(c, 0));
      x.fillStyle = mg;
      x.beginPath();
      x.arc(px, py, rr * 3, 0, Math.PI * 2);
      x.fill();
    }
  }
}

// ---------------------------------------------------------------------------
// Public: item icons
// ---------------------------------------------------------------------------

const itemCache = new Map<string, string>();

/** Resolver injected at boot so this module needn't depend on the item sim. */
let baseLookup: ((baseId: string) => { visual?: { shape?: string; palette?: string; ornate?: number }; category?: string } | undefined) | null = null;

export function setIconBaseResolver(fn: typeof baseLookup): void {
  baseLookup = fn;
  itemCache.clear();
}

/**
 * Returns a data-URI icon for an item. Cached by the properties that actually
 * change the art, so an inventory redraw is a map lookup.
 */
export function itemIconUri(item: Item): string {
  const key = `${item.baseId}|${item.rarity}|${item.sockets?.length ?? 0}`;
  const hit = itemCache.get(key);
  if (hit) return hit;

  const base = baseLookup?.(item.baseId);
  const shapeName = base?.visual?.shape && base.visual.shape !== 'auto'
    ? base.visual.shape
    : inferShape(item.baseId, base?.category);
  const draw = SHAPES[shapeName] ?? SHAPES[inferShape(item.baseId, base?.category)] ?? materialLike;
  potionTint = potionColor(item.baseId);
  const swatch = swatchFor(base?.visual?.palette);
  const ornate = base?.visual?.ornate ?? Math.min(1, RARITY_RANK[item.rarity] / 4);
  const rnd = makeRng(hashStr(key));

  const { c, x } = newCanvas();
  rarityUnder(x, item.rarity);
  x.save();
  // Drop shadow gives the icon weight against the slot background.
  x.shadowColor = 'rgba(0,0,0,.55)';
  x.shadowBlur = 8;
  x.shadowOffsetY = 3;
  draw(x, swatch, rnd, Math.max(ornate, RARITY_RANK[item.rarity] >= 4 ? 0.7 : 0));
  x.restore();
  rarityOver(x, item.rarity, rnd);

  const uri = c.toDataURL('image/png');
  itemCache.set(key, uri);
  return uri;
}

// ---------------------------------------------------------------------------
// Public: skill icons
// ---------------------------------------------------------------------------

interface Element {
  core: number;
  glow: number;
  dark: number;
}

const ELEMENT: Record<DamageType, Element> = {
  physical: { core: 0xf0e6d2, glow: 0xa8b0bd, dark: 0x3a3f47 },
  fire: { core: 0xffd27a, glow: 0xff6a22, dark: 0x5a1a08 },
  cold: { core: 0xdff4ff, glow: 0x59b8ff, dark: 0x0e3350 },
  lightning: { core: 0xf2e6ff, glow: 0xa46bff, dark: 0x2a1450 },
  poison: { core: 0xdcffa8, glow: 0x76d43a, dark: 0x1e3a10 },
  arcane: { core: 0xffd8f4, glow: 0xff5ad0, dark: 0x4a0e3c },
};

function glowStroke(x: CanvasRenderingContext2D, e: Element, w: number): void {
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.shadowColor = rgba(e.glow, 0.9);
  x.shadowBlur = 14;
  x.strokeStyle = rgba(e.glow, 0.95);
  x.lineWidth = w;
  x.stroke();
  x.shadowBlur = 0;
  x.strokeStyle = rgba(e.core, 0.95);
  x.lineWidth = Math.max(1.4, w * 0.42);
  x.stroke();
}

type Motif = (x: CanvasRenderingContext2D, e: Element, rnd: () => number) => void;

const MOTIFS: Record<string, Motif> = {
  // A pair of sweeping slashes.
  melee: (x, e) => {
    for (const [o, w] of [[0, 8], [16, 5]] as const) {
      x.beginPath();
      x.moveTo(28 + o, 26);
      x.quadraticCurveTo(104, 52, 40 + o, 104);
      glowStroke(x, e, w);
    }
  },
  cleave: (x, e) => {
    x.beginPath();
    x.moveTo(20, 40);
    x.quadraticCurveTo(64, 96, 108, 40);
    glowStroke(x, e, 9);
    x.beginPath();
    x.moveTo(30, 30);
    x.quadraticCurveTo(64, 78, 98, 30);
    glowStroke(x, e, 4.5);
  },
  whirlwind: (x, e) => {
    x.beginPath();
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const a = t * Math.PI * 4.2;
      const r = 8 + t * 46;
      const px = 64 + Math.cos(a) * r;
      const py = 64 + Math.sin(a) * r * 0.82;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    glowStroke(x, e, 7);
  },
  projectile: (x, e) => {
    // Comet head with a tapering tail.
    const g = x.createRadialGradient(84, 50, 2, 84, 50, 24);
    g.addColorStop(0, rgba(e.core, 1));
    g.addColorStop(0.4, rgba(e.glow, 0.9));
    g.addColorStop(1, rgba(e.glow, 0));
    x.fillStyle = g;
    x.beginPath();
    x.arc(84, 50, 24, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.moveTo(74, 60);
    x.quadraticCurveTo(44, 78, 20, 100);
    glowStroke(x, e, 8);
    x.beginPath();
    x.moveTo(80, 66);
    x.quadraticCurveTo(56, 84, 34, 104);
    glowStroke(x, e, 4);
  },
  nova: (x, e) => {
    for (const [r, w] of [[46, 7], [30, 5], [15, 4]] as const) {
      x.beginPath();
      x.arc(64, 64, r, 0, Math.PI * 2);
      glowStroke(x, e, w);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      x.beginPath();
      x.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48);
      x.lineTo(64 + Math.cos(a) * 60, 64 + Math.sin(a) * 60);
      glowStroke(x, e, 4);
    }
  },
  slam: (x, e) => {
    // Impact point with radiating cracks.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      x.beginPath();
      x.moveTo(64, 70);
      const mx = 64 + Math.cos(a) * 26;
      const my = 70 + Math.sin(a) * 20;
      x.lineTo(mx, my);
      x.lineTo(64 + Math.cos(a + 0.16) * 50, 70 + Math.sin(a + 0.16) * 38);
      glowStroke(x, e, 5);
    }
    x.beginPath();
    x.ellipse(64, 70, 12, 9, 0, 0, Math.PI * 2);
    x.fillStyle = rgba(e.core, 0.9);
    x.shadowColor = rgba(e.glow, 1);
    x.shadowBlur = 18;
    x.fill();
    x.shadowBlur = 0;
  },
  meteor: (x, e) => {
    const g = x.createRadialGradient(80, 46, 3, 80, 46, 26);
    g.addColorStop(0, rgba(e.core, 1));
    g.addColorStop(0.45, rgba(e.glow, 0.95));
    g.addColorStop(1, rgba(e.glow, 0));
    x.fillStyle = g;
    x.beginPath();
    x.arc(80, 46, 26, 0, Math.PI * 2);
    x.fill();
    for (const o of [0, 10, -8]) {
      x.beginPath();
      x.moveTo(66 + o, 60);
      x.lineTo(30 + o, 108);
      glowStroke(x, e, 5);
    }
    x.beginPath();
    x.ellipse(40, 112, 30, 7, 0, 0, Math.PI);
    glowStroke(x, e, 4);
  },
  beam: (x, e) => {
    const g = x.createLinearGradient(16, 64, 116, 64);
    g.addColorStop(0, rgba(e.glow, 0.15));
    g.addColorStop(0.5, rgba(e.core, 0.95));
    g.addColorStop(1, rgba(e.glow, 0.2));
    x.fillStyle = g;
    x.shadowColor = rgba(e.glow, 1);
    x.shadowBlur = 16;
    x.fillRect(14, 56, 100, 16);
    x.shadowBlur = 0;
    x.fillStyle = rgba(e.core, 1);
    x.fillRect(14, 61, 100, 6);
    for (const px of [26, 104]) {
      x.beginPath();
      x.arc(px, 64, 9, 0, Math.PI * 2);
      x.fillStyle = rgba(e.core, 0.9);
      x.fill();
    }
  },
  cone: (x, e) => {
    poly(x, [[22, 64], [104, 26], [104, 102]]);
    const g = x.createLinearGradient(22, 64, 104, 64);
    g.addColorStop(0, rgba(e.core, 0.9));
    g.addColorStop(1, rgba(e.glow, 0.12));
    x.fillStyle = g;
    x.shadowColor = rgba(e.glow, 0.9);
    x.shadowBlur = 14;
    x.fill();
    x.shadowBlur = 0;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.moveTo(46 + i * 20, 40 + i * 6);
      x.lineTo(46 + i * 20, 88 - i * 6);
      glowStroke(x, e, 3);
    }
  },
  chain: (x, e, rnd) => {
    let px = 18;
    let py = 30;
    x.beginPath();
    x.moveTo(px, py);
    for (let i = 0; i < 6; i++) {
      px += 16 + rnd() * 6;
      py = 30 + (i % 2 === 0 ? 44 : -6) + rnd() * 22;
      x.lineTo(px, py);
    }
    glowStroke(x, e, 7);
    // A fork partway along sells the "chains between targets" read.
    x.beginPath();
    x.moveTo(64, 58);
    x.lineTo(78, 96);
    x.lineTo(96, 84);
    glowStroke(x, e, 4.5);
  },
  dash: (x, e) => {
    for (let i = 0; i < 4; i++) {
      const y = 40 + i * 14;
      const len = 70 - Math.abs(i - 1.5) * 16;
      x.beginPath();
      x.moveTo(24, y);
      x.lineTo(24 + len, y);
      glowStroke(x, e, 6 - i * 0.6);
    }
    poly(x, [[100, 46], [120, 64], [100, 82]]);
    x.fillStyle = rgba(e.core, 0.95);
    x.shadowColor = rgba(e.glow, 1);
    x.shadowBlur = 16;
    x.fill();
    x.shadowBlur = 0;
  },
  buff: (x, e) => {
    for (let i = 0; i < 3; i++) {
      const y = 92 - i * 24;
      x.beginPath();
      x.moveTo(38, y);
      x.lineTo(64, y - 20);
      x.lineTo(90, y);
      glowStroke(x, e, 7 - i);
    }
  },
  // --- families the skill data actually uses -----------------------------
  strike: (x, e) => {
    // A single committed thrust.
    x.beginPath();
    x.moveTo(24, 104);
    x.lineTo(100, 28);
    glowStroke(x, e, 10);
    poly(x, [[104, 24], [110, 46], [88, 40]]);
    x.fillStyle = rgba(e.core, 0.95);
    x.shadowColor = rgba(e.glow, 1);
    x.shadowBlur = 14;
    x.fill();
    x.shadowBlur = 0;
  },
  heavy: (x, e) => {
    // Overhead smash: a steep arc into a hard stop.
    x.beginPath();
    x.moveTo(30, 20);
    x.quadraticCurveTo(96, 40, 74, 96);
    glowStroke(x, e, 12);
    x.beginPath();
    x.ellipse(70, 104, 30, 8, 0, 0, Math.PI * 2);
    x.fillStyle = rgba(e.glow, 0.5);
    x.fill();
  },
  ground: (x, e) => {
    // A field on the floor: ellipse plus rising wisps.
    x.beginPath();
    x.ellipse(64, 86, 44, 18, 0, 0, Math.PI * 2);
    glowStroke(x, e, 7);
    x.beginPath();
    x.ellipse(64, 86, 26, 10, 0, 0, Math.PI * 2);
    glowStroke(x, e, 4);
    for (let i = 0; i < 4; i++) {
      const px = 36 + i * 19;
      x.beginPath();
      x.moveTo(px, 78);
      x.quadraticCurveTo(px + (i % 2 ? 9 : -9), 54, px, 32);
      glowStroke(x, e, 4);
    }
  },
  cloud: (x, e, rnd) => {
    for (let i = 0; i < 6; i++) {
      const cx = 36 + rnd() * 56;
      const cy = 44 + rnd() * 40;
      const r = 12 + rnd() * 14;
      const g = x.createRadialGradient(cx, cy, 1, cx, cy, r);
      g.addColorStop(0, rgba(e.core, 0.5));
      g.addColorStop(1, rgba(e.glow, 0));
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cy, r, 0, Math.PI * 2);
      x.fill();
    }
    x.beginPath();
    x.ellipse(64, 70, 38, 22, 0, 0, Math.PI * 2);
    glowStroke(x, e, 4);
  },
  aura: (x, e) => {
    // Radiating field centred on the caster.
    for (const [r, w, a] of [[20, 6, 1], [34, 4.5, 0.75], [48, 3.5, 0.5]] as const) {
      x.beginPath();
      x.arc(64, 64, r, 0, Math.PI * 2);
      x.shadowColor = rgba(e.glow, a);
      x.shadowBlur = 12;
      x.strokeStyle = rgba(e.glow, a);
      x.lineWidth = w;
      x.stroke();
      x.shadowBlur = 0;
    }
    x.beginPath();
    x.arc(64, 64, 9, 0, Math.PI * 2);
    x.fillStyle = rgba(e.core, 0.95);
    x.fill();
  },
  summon: (x, e) => {
    // A skull over a summoning ring.
    x.beginPath();
    x.ellipse(64, 84, 34, 12, 0, 0, Math.PI * 2);
    glowStroke(x, e, 5);
    x.beginPath();
    x.moveTo(46, 66);
    x.quadraticCurveTo(46, 34, 64, 34);
    x.quadraticCurveTo(82, 34, 82, 66);
    x.lineTo(76, 76);
    x.lineTo(52, 76);
    x.closePath();
    x.fillStyle = rgba(e.core, 0.9);
    x.shadowColor = rgba(e.glow, 0.9);
    x.shadowBlur = 14;
    x.fill();
    x.shadowBlur = 0;
    x.fillStyle = 'rgba(0,0,0,.75)';
    x.beginPath();
    x.arc(56, 58, 6, 0, Math.PI * 2);
    x.arc(72, 58, 6, 0, Math.PI * 2);
    x.fill();
    x.fillRect(60, 68, 8, 8);
  },
  curse: (x, e) => {
    // Downward-pointing sigil: the visual opposite of a buff.
    for (let i = 0; i < 3; i++) {
      const y = 36 + i * 24;
      x.beginPath();
      x.moveTo(38, y);
      x.lineTo(64, y + 20);
      x.lineTo(90, y);
      glowStroke(x, e, 7 - i);
    }
    x.beginPath();
    x.arc(64, 30, 7, 0, Math.PI * 2);
    x.fillStyle = rgba(e.core, 0.9);
    x.fill();
  },
  shout: (x, e) => {
    // Expanding sound arcs from a point on the left.
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.arc(34, 64, 16 + i * 16, -0.85, 0.85);
      glowStroke(x, e, 6 - i * 0.9);
    }
    x.beginPath();
    x.arc(30, 64, 9, 0, Math.PI * 2);
    x.fillStyle = rgba(e.core, 0.95);
    x.fill();
  },
  channel: (x, e) => {
    // A sustained stream with pulses travelling along it.
    x.beginPath();
    x.moveTo(22, 92);
    x.quadraticCurveTo(64, 76, 106, 34);
    glowStroke(x, e, 9);
    for (const t of [0.3, 0.55, 0.8]) {
      const px = 22 + (106 - 22) * t;
      const py = 92 - (92 - 34) * t * t;
      x.beginPath();
      x.arc(px, py, 6 - t * 2, 0, Math.PI * 2);
      x.fillStyle = rgba(e.core, 0.9);
      x.fill();
    }
  },
  teleport: (x, e) => {
    // Fading out on the left, arriving on the right.
    for (let i = 0; i < 3; i++) {
      x.globalAlpha = 0.25 + i * 0.1;
      x.beginPath();
      x.ellipse(34 + i * 6, 64, 12, 26, 0, 0, Math.PI * 2);
      x.strokeStyle = rgba(e.glow, 0.9);
      x.lineWidth = 3;
      x.stroke();
    }
    x.globalAlpha = 1;
    x.beginPath();
    x.ellipse(94, 64, 14, 30, 0, 0, Math.PI * 2);
    glowStroke(x, e, 6);
    for (let i = 0; i < 5; i++) {
      x.beginPath();
      x.arc(58 + i * 8, 64 + (i % 2 ? -8 : 8), 2.4, 0, Math.PI * 2);
      x.fillStyle = rgba(e.core, 0.8);
      x.fill();
    }
  },
  wave: (x, e) => {
    // A travelling front.
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.moveTo(30 + i * 18, 22);
      x.quadraticCurveTo(58 + i * 18, 64, 30 + i * 18, 106);
      glowStroke(x, e, 8 - i * 1.6);
    }
  },
  leap: (x, e) => {
    // An arc from a launch point to a landing crater.
    x.beginPath();
    x.moveTo(22, 100);
    x.quadraticCurveTo(64, 12, 104, 92);
    glowStroke(x, e, 7);
    x.beginPath();
    x.ellipse(104, 100, 20, 7, 0, 0, Math.PI * 2);
    x.fillStyle = rgba(e.glow, 0.55);
    x.fill();
    for (let i = 0; i < 4; i++) {
      const a = Math.PI + (i / 3) * Math.PI;
      x.beginPath();
      x.moveTo(104, 98);
      x.lineTo(104 + Math.cos(a) * 26, 98 + Math.sin(a) * 14);
      glowStroke(x, e, 3);
    }
  },
  detonate: (x, e, rnd) => {
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 46);
    g.addColorStop(0, rgba(e.core, 1));
    g.addColorStop(0.45, rgba(e.glow, 0.8));
    g.addColorStop(1, rgba(e.glow, 0));
    x.fillStyle = g;
    x.beginPath();
    x.arc(64, 64, 46, 0, Math.PI * 2);
    x.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rnd() * 0.2;
      x.beginPath();
      x.moveTo(64 + Math.cos(a) * 18, 64 + Math.sin(a) * 18);
      x.lineTo(64 + Math.cos(a) * (44 + rnd() * 14), 64 + Math.sin(a) * (44 + rnd() * 14));
      glowStroke(x, e, 4);
    }
  },
  capstone: (x, e, rnd) => {
    // Deliberately the most ornate icon in the tree — these change how a class
    // is played, and should look like it.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? 52 : 30;
      x.beginPath();
      x.moveTo(64, 64);
      x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
      glowStroke(x, e, i % 2 === 0 ? 6 : 3.5);
    }
    x.beginPath();
    x.arc(64, 64, 22, 0, Math.PI * 2);
    glowStroke(x, e, 5);
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 20);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.4, rgba(e.core, 0.95));
    g.addColorStop(1, rgba(e.glow, 0.1));
    x.fillStyle = g;
    x.beginPath();
    x.arc(64, 64, 20, 0, Math.PI * 2);
    x.fill();
    void rnd;
  },
  heal: (x, e) => {
    x.beginPath();
    x.moveTo(64, 30);
    x.lineTo(64, 98);
    x.moveTo(34, 64);
    x.lineTo(94, 64);
    glowStroke(x, e, 12);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.7;
      const px = 64 + Math.cos(a) * 44;
      const py = 64 + Math.sin(a) * 44;
      x.beginPath();
      x.arc(px, py, 3.2, 0, Math.PI * 2);
      x.fillStyle = rgba(e.core, 0.9);
      x.fill();
    }
  },
};

/**
 * Effect id → motif. The skill data uses dotted family ids ('melee.strike',
 * 'ground.cloud'), so resolve the specific sub-type first, then the family,
 * then a small alias table. Collapsing everything to one fallback is what made
 * a whole tree look like the same icon repeated.
 */
/**
 * Rotates an element palette by a per-skill amount, keeping it inside its own
 * family so a cold skill never comes out orange.
 */
function tintElement(e: Element, seed: number): Element {
  const shift = (((seed >>> 5) % 21) - 10) / 100;
  const rot = (hex: number): number => {
    const r = ((hex >> 16) & 255) / 255;
    const g = ((hex >> 8) & 255) / 255;
    const b = (hex & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return hex;
    const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h =
      max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h / 6 + shift + 1) % 1;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const ch = (t: number): number => {
      let tt = (t + 1) % 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    const to = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)));
    return (to(ch(h + 1 / 3)) << 16) | (to(ch(h)) << 8) | to(ch(h - 1 / 3));
  };
  return { core: rot(e.core), glow: rot(e.glow), dark: rot(e.dark) };
}

function motifFor(iconKey: string | undefined, effect?: string | undefined): Motif {
  // The skill's authored icon name wins; the effect family is the fallback.
  const named = (iconKey ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (named && MOTIFS[named]) return MOTIFS[named]!;
  const raw = (effect ?? iconKey ?? 'melee').toLowerCase();
  const [family, sub] = raw.split('.');

  // Most specific first: 'melee.strike' prefers the `strike` motif.
  if (sub && MOTIFS[sub]) return MOTIFS[sub]!;
  if (MOTIFS[raw]) return MOTIFS[raw]!;
  if (family && MOTIFS[family]) return MOTIFS[family]!;

  const alias: Record<string, string> = {
    bolt: 'projectile',
    orb: 'projectile',
    explode: 'detonate',
    explosion: 'detonate',
    blast: 'detonate',
    aoe: 'detonate',
    point: 'slam',
    sky: 'meteor',
    minion: 'summon',
    corpse: 'summon',
    totem: 'summon',
    banner: 'buff',
    stance: 'buff',
    self: 'buff',
    absorb: 'buff',
    debuff: 'curse',
    apply: 'curse',
    drain: 'beam',
    multislash: 'cleave',
    line: 'wave',
    damage: 'aura',
    dash: 'dash',
  };
  const bySub = sub ? alias[sub] : undefined;
  if (bySub && MOTIFS[bySub]) return MOTIFS[bySub]!;
  const byFamily = family ? alias[family] : undefined;
  if (byFamily && MOTIFS[byFamily]) return MOTIFS[byFamily]!;

  return MOTIFS.melee!;
}

const skillCache = new Map<string, string>();

/**
 * Returns a data-URI icon for a skill. `passive` gets a quieter, framed
 * treatment so the tree reads at a glance.
 */
export function skillIconUri(
  skillId: string,
  effect: string | undefined,
  damageType: DamageType | undefined,
  passive = false,
  /**
   * The skill's own authored icon name. Every skill definition carries one and
   * they were all being ignored: the motif came from the effect family alone,
   * so ~285 skills collapsed onto about fifteen pictures, and every skill that
   * shared a family and a damage type came out identical.
   */
  iconKey?: string,
): string {
  const key = `${skillId}|${effect ?? '-'}|${damageType ?? '-'}|${passive ? 'p' : 'a'}|${iconKey ?? '-'}`;
  const hit = skillCache.get(key);
  if (hit) return hit;

  // Shift the element palette per skill. The damage type still sets the family
  // — fire is warm, cold is blue — but two fire skills are no longer the same
  // orange, which is most of what made a tree look like one icon repeated.
  const e = tintElement(ELEMENT[damageType ?? 'physical'], hashStr(skillId));
  const rnd = makeRng(hashStr(key));
  const { c, x } = newCanvas();

  // Ground: a dark disc so the glow has something to sit on.
  const bg = x.createRadialGradient(64, 58, 6, 64, 64, 64);
  bg.addColorStop(0, rgba(e.dark, 0.95));
  bg.addColorStop(0.7, rgba(e.dark, 0.55));
  bg.addColorStop(1, 'rgba(6,6,9,0.9)');
  x.fillStyle = bg;
  x.beginPath();
  x.arc(64, 64, 62, 0, Math.PI * 2);
  x.fill();

  if (passive) {
    // Passives: hexagonal frame, motif drawn small and calm inside it.
    x.save();
    x.translate(64, 64);
    x.scale(0.62, 0.62);
    x.translate(-64, -64);
    x.globalAlpha = 0.85;
    motifFor(effect)(x, e, rnd);
    x.restore();
    x.globalAlpha = 1;
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = 64 + Math.cos(a) * 52;
      const py = 64 + Math.sin(a) * 52;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.closePath();
    x.strokeStyle = rgba(e.glow, 0.7);
    x.lineWidth = 3;
    x.stroke();
  } else {
    motifFor(iconKey ?? effect, effect)(x, e, rnd);
  }

  // Signature ring: a short arc whose length, offset and tick count come from
  // the skill id. Cheap, and it makes any two icons distinguishable at a glance
  // even when they share a motif.
  const sig = hashStr(skillId + ':sig');
  const arc = 0.5 + ((sig >>> 3) % 7) * 0.18;
  const off = ((sig >>> 7) % 12) * (Math.PI / 6);
  x.strokeStyle = rgba(e.glow, 0.75);
  x.lineWidth = 3;
  x.beginPath();
  x.arc(64, 64, 57, off, off + arc);
  x.stroke();
  const ticks = 2 + (sig % 4);
  for (let i = 0; i < ticks; i++) {
    const a2 = off + arc + 0.5 + i * 0.34;
    x.beginPath();
    x.moveTo(64 + Math.cos(a2) * 50, 64 + Math.sin(a2) * 50);
    x.lineTo(64 + Math.cos(a2) * 58, 64 + Math.sin(a2) * 58);
    x.stroke();
  }

  // Vignette keeps the glow from bleeding to the slot edge.
  const vg = x.createRadialGradient(64, 64, 40, 64, 64, 64);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.55)');
  x.fillStyle = vg;
  x.beginPath();
  x.arc(64, 64, 63, 0, Math.PI * 2);
  x.fill();

  const uri = c.toDataURL('image/png');
  skillCache.set(key, uri);
  return uri;
}

/** Frees cached icons — used when the item database is swapped in tests. */
export function clearIconCaches(): void {
  itemCache.clear();
  skillCache.clear();
}


// ---------------------------------------------------------------------------
// Public: monster affix badges
// ---------------------------------------------------------------------------

type Glyph = (x: CanvasRenderingContext2D, c: string) => void;

/** Bold, high-contrast marks — these are read at ~14px on a nameplate. */
const GLYPHS: Record<string, Glyph> = {
  flame: (x, c) => {
    x.beginPath();
    x.moveTo(32, 6);
    x.quadraticCurveTo(52, 30, 44, 44);
    x.quadraticCurveTo(40, 58, 32, 58);
    x.quadraticCurveTo(24, 58, 20, 44);
    x.quadraticCurveTo(12, 30, 32, 6);
    x.fillStyle = c;
    x.fill();
  },
  flake: (x, c) => {
    x.strokeStyle = c;
    x.lineWidth = 6;
    x.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      x.beginPath();
      x.moveTo(32 - Math.cos(a) * 24, 32 - Math.sin(a) * 24);
      x.lineTo(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24);
      x.stroke();
    }
  },
  bolt: (x, c) => {
    x.beginPath();
    x.moveTo(38, 4);
    x.lineTo(18, 34);
    x.lineTo(30, 34);
    x.lineTo(24, 60);
    x.lineTo(46, 28);
    x.lineTo(33, 28);
    x.closePath();
    x.fillStyle = c;
    x.fill();
  },
  drop: (x, c) => {
    x.beginPath();
    x.moveTo(32, 6);
    x.quadraticCurveTo(52, 34, 32, 58);
    x.quadraticCurveTo(12, 34, 32, 6);
    x.fillStyle = c;
    x.fill();
  },
  shield: (x, c) => {
    x.beginPath();
    x.moveTo(32, 6);
    x.lineTo(52, 16);
    x.lineTo(52, 34);
    x.quadraticCurveTo(52, 50, 32, 58);
    x.quadraticCurveTo(12, 50, 12, 34);
    x.lineTo(12, 16);
    x.closePath();
    x.fillStyle = c;
    x.fill();
  },
  spikes: (x, c) => {
    x.fillStyle = c;
    for (let i = 0; i < 4; i++) {
      const px = 10 + i * 15;
      x.beginPath();
      x.moveTo(px, 54);
      x.lineTo(px + 7, 12);
      x.lineTo(px + 14, 54);
      x.closePath();
      x.fill();
    }
  },
  wings: (x, c) => {
    x.fillStyle = c;
    x.beginPath();
    x.moveTo(32, 20);
    x.quadraticCurveTo(6, 12, 4, 40);
    x.quadraticCurveTo(20, 34, 32, 44);
    x.quadraticCurveTo(44, 34, 60, 40);
    x.quadraticCurveTo(58, 12, 32, 20);
    x.fill();
  },
  chain: (x, c) => {
    x.strokeStyle = c;
    x.lineWidth = 6;
    for (const [cx, cy] of [[22, 24], [42, 40]] as const) {
      x.beginPath();
      x.ellipse(cx, cy, 12, 9, -0.7, 0, Math.PI * 2);
      x.stroke();
    }
  },
  skull: (x, c) => {
    x.fillStyle = c;
    x.beginPath();
    x.moveTo(14, 34);
    x.quadraticCurveTo(14, 6, 32, 6);
    x.quadraticCurveTo(50, 6, 50, 34);
    x.lineTo(44, 46);
    x.lineTo(20, 46);
    x.closePath();
    x.fill();
    x.fillRect(24, 50, 16, 8);
    x.fillStyle = 'rgba(0,0,0,.8)';
    x.beginPath();
    x.arc(25, 30, 6, 0, Math.PI * 2);
    x.arc(39, 30, 6, 0, Math.PI * 2);
    x.fill();
  },
  eye: (x, c) => {
    x.beginPath();
    x.ellipse(32, 32, 26, 15, 0, 0, Math.PI * 2);
    x.fillStyle = c;
    x.fill();
    x.beginPath();
    x.arc(32, 32, 9, 0, Math.PI * 2);
    x.fillStyle = 'rgba(0,0,0,.85)';
    x.fill();
  },
  swirl: (x, c) => {
    x.strokeStyle = c;
    x.lineWidth = 6;
    x.lineCap = 'round';
    x.beginPath();
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = t * Math.PI * 3;
      const r = 4 + t * 24;
      const px = 32 + Math.cos(a) * r;
      const py = 32 + Math.sin(a) * r;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.stroke();
  },
  arrows: (x, c) => {
    x.fillStyle = c;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.moveTo(8 + i * 16, 16);
      x.lineTo(24 + i * 16, 32);
      x.lineTo(8 + i * 16, 48);
      x.closePath();
      x.fill();
    }
  },
  wall: (x, c) => {
    x.fillStyle = c;
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 3; i++) {
        x.fillRect(6 + i * 18 + (r % 2 ? 9 : 0), 12 + r * 15, 15, 11);
      }
    }
  },
  heart: (x, c) => {
    x.beginPath();
    x.moveTo(32, 56);
    x.bezierCurveTo(2, 34, 14, 6, 32, 22);
    x.bezierCurveTo(50, 6, 62, 34, 32, 56);
    x.fillStyle = c;
    x.fill();
  },
  star: (x, c) => {
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 27 : 12;
      const px = 32 + Math.cos(a) * r;
      const py = 32 + Math.sin(a) * r;
      if (i === 0) x.moveTo(px, py);
      else x.lineTo(px, py);
    }
    x.closePath();
    x.fillStyle = c;
    x.fill();
  },
};

/** Affix behaviour → glyph. Anything unmapped falls back to a star. */
const AFFIX_GLYPH: Record<string, string> = {
  fire_enchanted: 'flame', molten_trail: 'flame', unstable: 'flame', storm_death: 'bolt',
  cold_enchanted: 'flake', frozen_ground: 'flake', frozen_pulse: 'flake', chilling_death: 'flake',
  lightning_enchanted: 'bolt', electrified: 'bolt', arcane_enchanted: 'swirl', arcane_sentry: 'swirl',
  poison_aura: 'drop', plagued: 'drop', mana_burn: 'drop',
  shielded: 'shield', stoneskin: 'shield', missile_dampening: 'shield', juggernaut: 'shield',
  thorns: 'spikes', reflect_damage: 'spikes',
  teleporter: 'wings', phasing: 'wings', wormhole: 'wings', gravity: 'swirl', vortex: 'swirl',
  jailer: 'chain', entangling: 'chain', waller: 'wall', knockback: 'arrows', hasted_pack: 'arrows',
  berserker: 'arrows', empowered: 'star', avenger: 'star', nightmarish: 'eye', illusionist: 'eye',
  summoner: 'skull', soul_bound: 'skull', blood_thirsty: 'heart', vampiric: 'heart',
  life_leech: 'heart', regenerating: 'heart', health_link: 'chain', orbiter: 'swirl',
  mortar: 'arrows',
};

const affixCache = new Map<string, string>();

/** Small badge for a monster affix, drawn from its behaviour and colour. */
export function affixIconUri(behavior: string | undefined, color: number): string {
  const key = `${behavior ?? 'none'}|${color}`;
  const hit = affixCache.get(key);
  if (hit) return hit;

  const glyphName = AFFIX_GLYPH[behavior ?? ''] ?? 'star';
  const glyph = GLYPHS[glyphName] ?? GLYPHS.star!;

  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d')!;

  // Dark disc so the mark reads against any dungeon background.
  x.beginPath();
  x.arc(32, 32, 31, 0, Math.PI * 2);
  x.fillStyle = 'rgba(8,8,12,.88)';
  x.fill();
  x.strokeStyle = rgba(color, 0.9);
  x.lineWidth = 4;
  x.stroke();

  x.save();
  x.shadowColor = rgba(color, 0.9);
  x.shadowBlur = 8;
  glyph(x, hexStr(color));
  x.restore();

  const uri = c.toDataURL('image/png');
  affixCache.set(key, uri);
  return uri;
}
