/**
 * SLAY — painterly canvas toolkit.
 *
 * The shared brush box behind every 2D illustration the game draws: item and
 * skill icons, portraits, key art and UI ornament. Nothing here knows what a
 * sword is. It knows how light falls on a material.
 *
 * The house style, enforced by these helpers so every caller gets it for free:
 *
 *  - **One light.** Key light from the top left, always, in screen space. A
 *    shared light direction is most of what makes a set of pictures a set.
 *  - **Silhouette first.** Every solid gets a dark contact outline, so a shape
 *    reads at 40 pixels before any interior detail does.
 *  - **Form, then texture.** A material is a value ramp across the form, then an
 *    inner shadow on the side away from the light (ambient occlusion), a thin
 *    bright edge on the lit side (rim), and only then a texture overlay
 *    (brushed metal, wood grain, leather pores, cloth weave, stone mottle).
 *  - **Painted metal is mostly dark.** Metal gets a hard specular streak and a
 *    dark environment band, which is what reads as polish rather than as grey.
 *
 * All randomness comes from `core/RNG` streams, keyed by a string, so a picture
 * is identical on every run and every machine.
 */
import { Random, hashString } from '../core/RNG';

export type Ctx = CanvasRenderingContext2D;
export type Pt = [number, number];

// ---------------------------------------------------------------------------
// Randomness
// ---------------------------------------------------------------------------

/** A deterministic `[0,1)` stream for a key. */
export function seeded(key: string): () => number {
  const r = new Random(hashString(key));
  return () => r.next();
}

export { hashString };

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export function rgbOf(n: number): [number, number, number] {
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** CSS colour string for a 0xRRGGBB number. */
export function css(n: number, a = 1): string {
  const [r, g, b] = rgbOf(n);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${Math.max(0, a).toFixed(3)})`;
}

export function mixC(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

/** Toward white. */
export function lift(n: number, t: number): number {
  return mixC(n, 0xffffff, t);
}

/** Toward black. */
export function sink(n: number, t: number): number {
  return mixC(n, 0x000000, t);
}

/** Rec. 709 luma, 0..1. */
export function luma(n: number): number {
  const [r, g, b] = rgbOf(n);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Pushes saturation up (t > 0) or down (t < 0) around the colour's own luma. */
export function saturate(n: number, t: number): number {
  const [r, g, b] = rgbOf(n);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const f = (c: number): number => Math.max(0, Math.min(255, Math.round(l + (c - l) * (1 + t))));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/** Parses '0xRRGGBB', '#rrggbb' or a number. */
export function parseColor(v: string | number | undefined, fallback: number): number {
  if (typeof v === 'number') return v;
  if (!v) return fallback;
  const s = v.trim().replace(/^#/, '0x');
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Canvases
// ---------------------------------------------------------------------------

export function makeCanvas(w: number, h = w): { c: HTMLCanvasElement; x: Ctx } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  return { c, x };
}

const scratchPool = new Map<string, { c: HTMLCanvasElement; x: Ctx }>();

/**
 * A reusable canvas, cleared. One per (slot, size): drawing a hundred icons
 * should not allocate a hundred backing stores.
 */
export function scratch(slot: string, w: number, h = w): { c: HTMLCanvasElement; x: Ctx } {
  const key = `${slot}:${w}x${h}`;
  let s = scratchPool.get(key);
  if (!s) {
    s = makeCanvas(w, h);
    scratchPool.set(key, s);
  } else {
    s.x.setTransform(1, 0, 0, 1, 0, 0);
    s.x.globalAlpha = 1;
    s.x.globalCompositeOperation = 'source-over';
    s.x.filter = 'none';
    s.x.shadowBlur = 0;
    s.x.shadowColor = 'rgba(0,0,0,0)';
    s.x.shadowOffsetX = 0;
    s.x.shadowOffsetY = 0;
    s.x.clearRect(0, 0, w, h);
  }
  return s;
}

/** Resets the transient state a helper may have left on a context. */
export function resetCtx(x: Ctx): void {
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.shadowBlur = 0;
  x.shadowColor = 'rgba(0,0,0,0)';
  x.shadowOffsetX = 0;
  x.shadowOffsetY = 0;
  x.filter = 'none';
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export function polyP(pts: readonly Pt[], close = true): Path2D {
  const p = new Path2D();
  p.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i]![0], pts[i]![1]);
  if (close) p.closePath();
  return p;
}

/**
 * A closed Catmull-Rom curve through the points — organic outlines (bone,
 * leather, cloth, faces) without hand-placing every bezier handle.
 */
export function smoothP(pts: readonly Pt[], tension = 0.5, close = true, into?: Path2D): Path2D {
  const p = into ?? new Path2D();
  const n = pts.length;
  const at = (i: number): Pt => (close ? pts[((i % n) + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
  p.moveTo(pts[0]![0], pts[0]![1]);
  const last = close ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const k = tension / 3;
    p.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) * k,
      p1[1] + (p2[1] - p0[1]) * k,
      p2[0] - (p3[0] - p1[0]) * k,
      p2[1] - (p3[1] - p1[1]) * k,
      p2[0],
      p2[1],
    );
  }
  if (close) p.closePath();
  return p;
}

export function circleP(cx: number, cy: number, r: number): Path2D {
  const p = new Path2D();
  p.arc(cx, cy, r, 0, Math.PI * 2);
  return p;
}

export function ellipseP(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
  return p;
}

export function rrectP(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  const rr = Math.min(r, w / 2, h / 2);
  p.moveTo(x + rr, y);
  p.arcTo(x + w, y, x + w, y + h, rr);
  p.arcTo(x + w, y + h, x, y + h, rr);
  p.arcTo(x, y + h, x, y, rr);
  p.arcTo(x, y, x + w, y, rr);
  p.closePath();
  return p;
}

/** A ring (annulus) as one even-odd path. */
export function ringP(cx: number, cy: number, r0: number, r1: number, sx = 1): Path2D {
  const p = new Path2D();
  p.ellipse(cx, cy, r1 * sx, r1, 0, 0, Math.PI * 2);
  p.moveTo(cx + r0 * sx, cy);
  p.ellipse(cx, cy, r0 * sx, r0, 0, 0, Math.PI * 2, true);
  return p;
}

/** Polar star / burst outline. */
export function starP(cx: number, cy: number, n: number, r0: number, r1: number, rot = -Math.PI / 2): Path2D {
  const pts: Pt[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? r1 : r0;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return polyP(pts);
}

// ---------------------------------------------------------------------------
// Texture tiles
// ---------------------------------------------------------------------------

export type TexKind = 'fine' | 'brushed' | 'grain' | 'pores' | 'weave' | 'mottle' | 'crack' | 'scales' | 'mail' | 'hammered';

const TILE = 128;
const tiles = new Map<TexKind, HTMLCanvasElement>();

/** Tileable value noise, octave-summed, into a Float32 field of 0..1. */
function valueNoise(rnd: () => number, cells: number, octaves: number, sx = 1, sy = 1): Float32Array {
  const out = new Float32Array(TILE * TILE);
  let amp = 1;
  let total = 0;
  let cx = Math.max(1, Math.round(cells * sx));
  let cy = Math.max(1, Math.round(cells * sy));
  for (let o = 0; o < octaves; o++) {
    const grid = new Float32Array(cx * cy);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    for (let y = 0; y < TILE; y++) {
      const fy = (y / TILE) * cy;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy0 = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < TILE; x++) {
        const fx = (x / TILE) * cx;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx0 = tx * tx * (3 - 2 * tx);
        const a = grid[(y0 % cy) * cx + (x0 % cx)]!;
        const b = grid[(y0 % cy) * cx + ((x0 + 1) % cx)]!;
        const c = grid[((y0 + 1) % cy) * cx + (x0 % cx)]!;
        const d = grid[((y0 + 1) % cy) * cx + ((x0 + 1) % cx)]!;
        out[y * TILE + x]! += amp * (a + (b - a) * sx0 + (c - a) * sy0 + (a - b - c + d) * sx0 * sy0);
      }
    }
    total += amp;
    amp *= 0.5;
    cx *= 2;
    cy *= 2;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i]! / total;
  return out;
}

function fieldToCanvas(f: Float32Array, contrast = 1): HTMLCanvasElement {
  const { c, x } = makeCanvas(TILE);
  const img = x.createImageData(TILE, TILE);
  for (let i = 0; i < f.length; i++) {
    const v = Math.max(0, Math.min(255, Math.round(128 + (f[i]! - 0.5) * 255 * contrast)));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

/**
 * A grey 128px tile centred on mid-grey, for `overlay` compositing: lighter
 * than 50% lifts, darker sinks, so the material's own colour survives.
 */
export function texTile(kind: TexKind): HTMLCanvasElement {
  const hit = tiles.get(kind);
  if (hit) return hit;
  const rnd = seeded(`tex:${kind}`);
  let c: HTMLCanvasElement;
  switch (kind) {
    case 'fine':
      c = fieldToCanvas(valueNoise(rnd, 16, 4), 1.6);
      break;
    case 'mottle':
      c = fieldToCanvas(valueNoise(rnd, 4, 5), 2.0);
      break;
    case 'brushed': {
      // Long horizontal streaks: noise stretched along x.
      const f = valueNoise(rnd, 8, 4, 0.12, 4);
      const g = valueNoise(rnd, 32, 2);
      for (let i = 0; i < f.length; i++) f[i] = f[i]! * 0.8 + g[i]! * 0.2;
      c = fieldToCanvas(f, 2.2);
      break;
    }
    case 'grain': {
      // Wood: stretched noise warped into wavy rings, plus dark pores.
      const warp = valueNoise(rnd, 3, 3);
      const f = new Float32Array(TILE * TILE);
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const w = warp[y * TILE + x]!;
          const v = Math.sin((x / TILE) * Math.PI * 2 * 7 + w * 9 + Math.sin((y / TILE) * Math.PI * 2) * 0.6);
          f[y * TILE + x] = 0.5 + v * 0.35;
        }
      }
      const fine = valueNoise(rnd, 64, 1, 4, 0.25);
      for (let i = 0; i < f.length; i++) f[i] = f[i]! * 0.75 + fine[i]! * 0.25;
      c = fieldToCanvas(f, 1.2);
      break;
    }
    case 'pores': {
      const f = valueNoise(rnd, 10, 4);
      c = fieldToCanvas(f, 1.4);
      const x = c.getContext('2d')!;
      for (let i = 0; i < 520; i++) {
        const px = rnd() * TILE;
        const py = rnd() * TILE;
        const r = 0.5 + rnd() * 1.2;
        x.fillStyle = rnd() < 0.7 ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.3)';
        x.beginPath();
        x.arc(px, py, r, 0, Math.PI * 2);
        x.fill();
      }
      // A few creases.
      x.strokeStyle = 'rgba(0,0,0,.35)';
      x.lineWidth = 0.8;
      for (let i = 0; i < 18; i++) {
        const px = rnd() * TILE;
        const py = rnd() * TILE;
        x.beginPath();
        x.moveTo(px, py);
        x.quadraticCurveTo(px + rnd() * 16 - 8, py + rnd() * 10 - 5, px + rnd() * 24 - 12, py + rnd() * 14 - 7);
        x.stroke();
      }
      break;
    }
    case 'weave': {
      const f = new Float32Array(TILE * TILE);
      const n = valueNoise(rnd, 24, 2);
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const u = (x % 4) / 4;
          const v = (y % 4) / 4;
          const over = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
          const s = over ? Math.sin(u * Math.PI) : Math.sin(v * Math.PI);
          f[y * TILE + x] = 0.35 + s * 0.35 + n[y * TILE + x]! * 0.3;
        }
      }
      c = fieldToCanvas(f, 1.2);
      break;
    }
    case 'crack': {
      c = fieldToCanvas(valueNoise(rnd, 6, 5), 1.8);
      const x = c.getContext('2d')!;
      x.lineCap = 'round';
      for (let i = 0; i < 14; i++) {
        let px = rnd() * TILE;
        let py = rnd() * TILE;
        x.strokeStyle = 'rgba(0,0,0,.55)';
        x.lineWidth = 0.6 + rnd() * 1.1;
        x.beginPath();
        x.moveTo(px, py);
        let a = rnd() * Math.PI * 2;
        for (let k = 0; k < 6; k++) {
          a += rnd() * 1.2 - 0.6;
          px += Math.cos(a) * (4 + rnd() * 7);
          py += Math.sin(a) * (4 + rnd() * 7);
          x.lineTo(px, py);
        }
        x.stroke();
      }
      break;
    }
    case 'hammered': {
      c = fieldToCanvas(valueNoise(rnd, 8, 3), 1.0);
      const x = c.getContext('2d')!;
      for (let i = 0; i < 90; i++) {
        const px = rnd() * TILE;
        const py = rnd() * TILE;
        const r = 3 + rnd() * 5;
        const g = x.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r);
        g.addColorStop(0, 'rgba(255,255,255,.35)');
        g.addColorStop(0.6, 'rgba(128,128,128,0)');
        g.addColorStop(1, 'rgba(0,0,0,.3)');
        x.fillStyle = g;
        x.beginPath();
        x.arc(px, py, r, 0, Math.PI * 2);
        x.fill();
      }
      break;
    }
    case 'scales': {
      const { c: cc, x } = makeCanvas(TILE);
      x.fillStyle = '#808080';
      x.fillRect(0, 0, TILE, TILE);
      const s = 12;
      for (let row = -1; row < TILE / (s * 0.6) + 1; row++) {
        for (let col = -1; col < TILE / s + 1; col++) {
          const px = col * s + (row % 2 ? s / 2 : 0);
          const py = row * s * 0.6;
          const g = x.createLinearGradient(px, py, px, py + s);
          g.addColorStop(0, '#b8b8b8');
          g.addColorStop(0.7, '#707070');
          g.addColorStop(1, '#303030');
          x.fillStyle = g;
          x.beginPath();
          x.moveTo(px - s / 2, py);
          x.quadraticCurveTo(px - s / 2, py + s * 0.9, px, py + s);
          x.quadraticCurveTo(px + s / 2, py + s * 0.9, px + s / 2, py);
          x.closePath();
          x.fill();
          x.strokeStyle = 'rgba(0,0,0,.5)';
          x.lineWidth = 0.8;
          x.stroke();
        }
      }
      c = cc;
      break;
    }
    case 'mail': {
      const { c: cc, x } = makeCanvas(TILE);
      x.fillStyle = '#3a3a3a';
      x.fillRect(0, 0, TILE, TILE);
      const s = 6.4;
      for (let row = 0; row < TILE / (s * 0.7) + 1; row++) {
        for (let col = 0; col < TILE / s + 1; col++) {
          const px = col * s + (row % 2 ? s / 2 : 0);
          const py = row * s * 0.7;
          x.beginPath();
          x.ellipse(px, py, s * 0.42, s * 0.36, 0, 0, Math.PI * 2);
          x.strokeStyle = '#b8b8b8';
          x.lineWidth = 1.5;
          x.stroke();
          x.beginPath();
          x.ellipse(px - 0.6, py - 0.6, s * 0.42, s * 0.36, 0, Math.PI * 1.1, Math.PI * 1.6);
          x.strokeStyle = '#f0f0f0';
          x.lineWidth = 0.8;
          x.stroke();
        }
      }
      c = cc;
      break;
    }
  }
  tiles.set(kind, c);
  return c;
}

const patternCache = new WeakMap<Ctx, Map<TexKind, CanvasPattern>>();

function patternFor(x: Ctx, kind: TexKind): CanvasPattern | null {
  let m = patternCache.get(x);
  if (!m) {
    m = new Map();
    patternCache.set(x, m);
  }
  let p = m.get(kind);
  if (!p) {
    p = x.createPattern(texTile(kind), 'repeat') ?? undefined;
    if (!p) return null;
    m.set(kind, p);
  }
  return p;
}

/**
 * Overlays a texture tile inside `path`. `scale` and `rot` orient it — grain
 * should run along a haft, brushing along a blade.
 */
export function texture(x: Ctx, path: Path2D, kind: TexKind, amt: number, scale = 1, rot = 0, mode: GlobalCompositeOperation = 'overlay'): void {
  if (amt <= 0) return;
  const pat = patternFor(x, kind);
  if (!pat) return;
  const t = x.getTransform();
  // Pattern transform is applied in the current user space, so the texture
  // follows the object's rotation and scale.
  pat.setTransform(new DOMMatrix().rotate((rot * 180) / Math.PI).scale(scale));
  x.save();
  x.globalCompositeOperation = mode;
  x.globalAlpha = Math.min(1, amt);
  x.fillStyle = pat;
  x.fill(path);
  x.restore();
  void t;
}

// ---------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------

/**
 * Draws a blurred copy of the path's *edge* inside the path, offset in screen
 * space. With a dark colour and a negative offset it is ambient occlusion on
 * the shadow side; with a light colour and a positive offset it is the bright
 * rim on the lit side. Uses the offscreen-stroke trick: the stroke itself is
 * drawn far outside the canvas and only its shadow lands.
 */
export function innerEdge(x: Ctx, path: Path2D, color: string, blur: number, dx: number, dy: number, width = 2): void {
  const t = x.getTransform();
  x.save();
  x.clip(path);
  if (blur <= 2.5) {
    // Small radius: a hard offset stroke reads the same at icon size and
    // skips the blur, which is most of a software canvas's cost.
    x.setTransform(1, 0, 0, 1, dx, dy);
    x.transform(t.a, t.b, t.c, t.d, t.e, t.f);
    x.lineWidth = width + blur * 0.8;
    x.strokeStyle = color;
    x.lineJoin = 'round';
    x.stroke(path);
    x.restore();
    return;
  }
  x.setTransform(1, 0, 0, 1, -4096, 0);
  x.transform(t.a, t.b, t.c, t.d, t.e, t.f);
  x.shadowColor = color;
  x.shadowBlur = blur;
  x.shadowOffsetX = 4096 + dx;
  x.shadowOffsetY = dy;
  x.lineWidth = width;
  x.strokeStyle = '#000';
  x.lineJoin = 'round';
  x.stroke(path);
  x.restore();
}

export interface Mat {
  /** Darkest core shadow, shadow, mid, light, specular. */
  c: [number, number, number, number, number];
  /** 0 = diffuse, 1 = mirror: drives the streak and the environment band. */
  metal: number;
  tex: TexKind | null;
  texAmt: number;
  /** Texture scale. */
  texScale: number;
}

export function mat(c: [number, number, number, number, number], metal: number, tex: TexKind | null, texAmt = 0.3, texScale = 1): Mat {
  return { c, metal, tex, texAmt, texScale };
}

/** A five-step ramp around one colour. */
export function rampOf(n: number, metal = 0, tex: TexKind | null = 'fine', texAmt = 0.25): Mat {
  return mat([sink(n, 0.78), sink(n, 0.48), n, lift(n, 0.28), lift(n, 0.7)], metal, tex, texAmt);
}

export function tintMat(m: Mat, tint: number, t: number): Mat {
  return {
    ...m,
    c: m.c.map((v) => mixC(v, sink(tint, 1 - luma(v) * 1.1), t)) as Mat['c'],
  };
}

/** The value ramp across a form, from the lit side `a` to the shadow side `b`. */
export function rampGradient(x: Ctx, m: Mat, a: Pt, b: Pt): CanvasGradient {
  const g = x.createLinearGradient(a[0], a[1], b[0], b[1]);
  const [c0, c1, c2, c3, c4] = m.c;
  if (m.metal > 0.5) {
    // Painted metal: lit edge, a hard specular streak, then a dark band where
    // it reflects the ground, then reflected light at the far edge.
    g.addColorStop(0, css(c2));
    g.addColorStop(0.12, css(c3));
    g.addColorStop(0.24, css(c4));
    g.addColorStop(0.34, css(c3));
    g.addColorStop(0.5, css(c1));
    g.addColorStop(0.7, css(c0));
    g.addColorStop(0.88, css(c1));
    g.addColorStop(1, css(c2));
  } else if (m.metal > 0.15) {
    // Satin: a softer streak.
    g.addColorStop(0, css(c3));
    g.addColorStop(0.25, css(c4));
    g.addColorStop(0.45, css(c2));
    g.addColorStop(0.8, css(c1));
    g.addColorStop(1, css(c0));
  } else {
    g.addColorStop(0, css(c3));
    g.addColorStop(0.4, css(c2));
    g.addColorStop(0.82, css(c1));
    g.addColorStop(1, css(c0));
  }
  return g;
}

export interface SolidOpts {
  /** Lit side of the form, in current coordinates. */
  a?: Pt;
  /** Shadow side of the form. */
  b?: Pt;
  /** Fill override (a gradient the caller built). */
  fill?: string | CanvasGradient | CanvasPattern;
  /** Texture override; null for none. */
  tex?: TexKind | null;
  texAmt?: number;
  texScale?: number;
  texRot?: number;
  /** Inner shadow strength on the side away from the light. */
  ao?: number;
  /** Lit-edge rim strength. */
  rim?: number;
  /** Rim colour; defaults to the material's specular value. */
  rimColor?: number;
  /** Contact outline width; 0 for none. */
  outline?: number;
  outlineColor?: string;
  /** Overall size of the form in screen pixels, which scales blur radii. */
  size?: number;
}

/**
 * Paints one solid: ramp, texture, ambient occlusion, rim light, outline.
 * The workhorse every illustrated object is built from.
 */
export function solid(x: Ctx, path: Path2D, m: Mat, o: SolidOpts = {}): void {
  const size = o.size ?? 1;
  x.save();
  x.fillStyle = o.fill ?? rampGradient(x, m, o.a ?? [-20, -20], o.b ?? [20, 20]);
  x.fill(path);
  const tex = o.tex === undefined ? m.tex : o.tex;
  if (tex) texture(x, path, tex, o.texAmt ?? m.texAmt, o.texScale ?? m.texScale, o.texRot ?? 0);
  const ao = o.ao ?? 0.55;
  if (ao > 0) {
    // Broad occlusion on the shadow side, then a tight contact darkening all
    // round so every edge turns away from the eye.
    innerEdge(x, path, css(m.c[0], ao), 7 * size, -3 * size, -3.5 * size, 3);
    innerEdge(x, path, css(m.c[0], ao * 0.6), 2.2 * size, 0, 0, 1.5);
  }
  const rim = o.rim ?? 0.7;
  if (rim > 0) innerEdge(x, path, css(o.rimColor ?? m.c[4], rim), 1.6 * size, 1.4 * size, 1.6 * size, 1.4);
  x.restore();
  const ow = o.outline ?? 1.5;
  if (ow > 0) {
    x.save();
    x.lineJoin = 'round';
    x.lineWidth = ow;
    x.strokeStyle = o.outlineColor ?? 'rgba(10,8,7,0.9)';
    x.stroke(path);
    x.restore();
  }
}

/** A soft additive light. */
export function glow(x: Ctx, cx: number, cy: number, r: number, color: number, a = 1, mode: GlobalCompositeOperation = 'lighter'): void {
  if (r <= 0 || a <= 0) return;
  x.save();
  x.globalCompositeOperation = mode;
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, css(color, a));
  g.addColorStop(0.35, css(color, a * 0.45));
  g.addColorStop(1, css(color, 0));
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
  x.restore();
}

/** A soft dark pool — ambient occlusion under an object or in a recess. */
export function shadowPool(x: Ctx, cx: number, cy: number, rx: number, ry: number, a = 0.6): void {
  x.save();
  x.translate(cx, cy);
  x.scale(1, ry / rx);
  const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(-rx, -rx, rx * 2, rx * 2);
  x.restore();
}

/** An elongated specular highlight. */
export function spec(x: Ctx, cx: number, cy: number, rx: number, ry: number, rot = -0.7, a = 0.8, color = 0xffffff): void {
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.scale(1, Math.max(0.05, ry / Math.max(0.01, rx)));
  const g = x.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, css(color, a));
  g.addColorStop(0.5, css(color, a * 0.35));
  g.addColorStop(1, css(color, 0));
  x.fillStyle = g;
  x.globalCompositeOperation = 'lighter';
  x.fillRect(-rx, -rx, rx * 2, rx * 2);
  x.restore();
}

/** A four-point star glint, the "this is polished" sparkle. */
export function glint(x: Ctx, cx: number, cy: number, r: number, color = 0xffffff, a = 1): void {
  x.save();
  x.globalCompositeOperation = 'lighter';
  glow(x, cx, cy, r * 0.7, color, a * 0.6);
  x.fillStyle = css(color, a);
  x.beginPath();
  const w = r * 0.13;
  x.moveTo(cx, cy - r);
  x.quadraticCurveTo(cx + w, cy - w, cx + r, cy);
  x.quadraticCurveTo(cx + w, cy + w, cx, cy + r);
  x.quadraticCurveTo(cx - w, cy + w, cx - r, cy);
  x.quadraticCurveTo(cx - w, cy - w, cx, cy - r);
  x.fill();
  x.restore();
}

/** Strokes a path as an emissive line: wide soft halo, then a hot core. */
export function emissiveStroke(x: Ctx, path: Path2D, color: number, width: number, a = 1): void {
  x.save();
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.globalCompositeOperation = 'lighter';
  x.shadowColor = css(color, a);
  x.shadowBlur = width * 3;
  x.strokeStyle = css(color, 0.75 * a);
  x.lineWidth = width;
  x.stroke(path);
  x.shadowBlur = 0;
  x.strokeStyle = css(lift(color, 0.65), a);
  x.lineWidth = Math.max(0.6, width * 0.4);
  x.stroke(path);
  x.restore();
}

// ---------------------------------------------------------------------------
// Gems
// ---------------------------------------------------------------------------

export type GemCut = 'round' | 'oval' | 'cushion' | 'emerald' | 'pear' | 'trillion' | 'marquise' | 'cabochon' | 'rose';

/** Outline points for a cut, unit radius, centred. */
function cutOutline(cut: GemCut): Pt[] {
  const pts: Pt[] = [];
  const ring = (n: number, sx: number, sy: number, rot = -Math.PI / 2): void => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      pts.push([Math.cos(a) * sx, Math.sin(a) * sy]);
    }
  };
  switch (cut) {
    case 'round':
    case 'rose':
    case 'cabochon':
      ring(cut === 'cabochon' ? 24 : 8, 1, 1, -Math.PI / 2 + Math.PI / 8);
      break;
    case 'oval':
      ring(10, 0.78, 1);
      break;
    case 'cushion':
      return [[-0.6, -0.95], [0.6, -0.95], [0.95, -0.6], [0.95, 0.6], [0.6, 0.95], [-0.6, 0.95], [-0.95, 0.6], [-0.95, -0.6]];
    case 'emerald':
      return [[-0.45, -1], [0.45, -1], [0.75, -0.7], [0.75, 0.7], [0.45, 1], [-0.45, 1], [-0.75, 0.7], [-0.75, -0.7]];
    case 'pear':
      return [[0, -1.05], [0.42, -0.55], [0.78, 0.1], [0.72, 0.6], [0.35, 0.95], [-0.35, 0.95], [-0.72, 0.6], [-0.78, 0.1], [-0.42, -0.55]];
    case 'trillion':
      return [[0, -1], [0.3, -0.62], [0.95, 0.62], [0.72, 0.85], [-0.72, 0.85], [-0.95, 0.62], [-0.3, -0.62]];
    case 'marquise':
      return [[0, -1.05], [0.38, -0.6], [0.55, 0], [0.38, 0.6], [0, 1.05], [-0.38, 0.6], [-0.55, 0], [-0.38, -0.6]];
  }
  return pts;
}

/**
 * A cut stone: dark girdle, a table that catches the light, crown facets that
 * alternate light and dark, internal fire, and a hard white glint.
 */
export function gem(x: Ctx, cx: number, cy: number, r: number, color: number, cut: GemCut = 'round', opts: { facets?: number; glow?: number; rot?: number; fire?: number } = {}): void {
  const outline = cutOutline(cut);
  const rot = opts.rot ?? 0;
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  const P = (p: Pt, k = 1): Pt => [cx + (p[0] * cs - p[1] * sn) * r * k, cy + (p[0] * sn + p[1] * cs) * r * k];
  const outer = outline.map((p) => P(p));
  const path = cut === 'cabochon' || cut === 'rose' ? circleP(cx, cy, r) : polyP(outer);
  if ((opts.glow ?? 0) > 0) glow(x, cx, cy, r * 2.4, color, 0.5 * (opts.glow ?? 0));
  x.save();
  // Body: deep at the girdle, saturated mid, light toward the lit corner.
  const body = x.createRadialGradient(cx - r * 0.25, cy - r * 0.3, r * 0.05, cx, cy, r * 1.05);
  body.addColorStop(0, css(lift(color, 0.55)));
  body.addColorStop(0.35, css(saturate(color, 0.25)));
  body.addColorStop(0.8, css(sink(color, 0.45)));
  body.addColorStop(1, css(sink(color, 0.75)));
  x.fillStyle = body;
  x.fill(path);
  x.clip(path);
  if (cut === 'cabochon') {
    // Polished dome: one big soft highlight and a bright lower crescent.
    spec(x, cx - r * 0.3, cy - r * 0.38, r * 0.55, r * 0.3, -0.6, 0.85);
    x.globalCompositeOperation = 'lighter';
    x.strokeStyle = css(lift(color, 0.3), 0.6);
    x.lineWidth = r * 0.12;
    x.beginPath();
    x.arc(cx, cy, r * 0.82, 0.3, Math.PI - 0.3);
    x.stroke();
  } else {
    // Crown facets: triangles from the table edge to the girdle, lit by angle.
    const table = outline.map((p) => P(p, 0.48));
    const n = outer.length;
    for (let i = 0; i < n; i++) {
      const a0 = outer[i]!;
      const a1 = outer[(i + 1) % n]!;
      const t0 = table[i]!;
      const t1 = table[(i + 1) % n]!;
      const mx = (a0[0] + a1[0]) / 2 - cx;
      const my = (a0[1] + a1[1]) / 2 - cy;
      const lit = (-mx - my) / (Math.hypot(mx, my) * 1.414 + 1e-6); // -1..1 toward top-left
      x.beginPath();
      x.moveTo(a0[0], a0[1]);
      x.lineTo(a1[0], a1[1]);
      x.lineTo(t1[0], t1[1]);
      x.lineTo(t0[0], t0[1]);
      x.closePath();
      x.fillStyle = lit > 0 ? css(0xffffff, 0.08 + lit * 0.32) : css(0x000000, 0.1 - lit * 0.3);
      x.fill();
      x.strokeStyle = css(lift(color, 0.6), 0.35);
      x.lineWidth = Math.max(0.5, r * 0.04);
      x.stroke();
    }
    // Table.
    const tp = polyP(table);
    const tg = x.createLinearGradient(cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy + r * 0.5);
    tg.addColorStop(0, css(lift(color, 0.5), 0.9));
    tg.addColorStop(0.5, css(color, 0.5));
    tg.addColorStop(1, css(sink(color, 0.3), 0.7));
    x.fillStyle = tg;
    x.fill(tp);
    x.strokeStyle = css(lift(color, 0.75), 0.55);
    x.lineWidth = Math.max(0.5, r * 0.05);
    x.stroke(tp);
    // Internal fire: a couple of bright flecks in complementary hues.
    const fire = opts.fire ?? 0.5;
    if (fire > 0) {
      x.globalCompositeOperation = 'lighter';
      glow(x, cx + r * 0.3, cy + r * 0.35, r * 0.45, lift(color, 0.4), 0.5 * fire);
      glow(x, cx - r * 0.2, cy + r * 0.1, r * 0.25, 0xffffff, 0.25 * fire);
    }
  }
  x.restore();
  // Girdle: a dark rim, then a hairline of light on the lit edge.
  x.save();
  x.lineJoin = 'round';
  x.lineWidth = Math.max(0.8, r * 0.1);
  x.strokeStyle = css(sink(color, 0.8), 0.95);
  x.stroke(path);
  x.restore();
  glint(x, cx - r * 0.38, cy - r * 0.42, Math.min(r * 0.75, 11), 0xffffff, 0.95);
}

/** A metal bezel (setting) behind a gem: a ring with prongs. */
export function bezel(x: Ctx, cx: number, cy: number, r: number, m: Mat, prongs = 4): void {
  const p = circleP(cx, cy, r * 1.28);
  solid(x, p, m, { a: [cx - r, cy - r], b: [cx + r, cy + r], ao: 0.5, rim: 0.6, outline: 1.2, tex: null, size: r / 8 });
  for (let i = 0; i < prongs; i++) {
    const a = -Math.PI / 4 + (i / prongs) * Math.PI * 2;
    const px = cx + Math.cos(a) * r * 1.05;
    const py = cy + Math.sin(a) * r * 1.05;
    solid(x, circleP(px, py, r * 0.26), m, { a: [px - 2, py - 2], b: [px + 2, py + 2], ao: 0, rim: 0.5, outline: 0.8, tex: null });
  }
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/**
 * Draws `src` onto `x` with a soft cast shadow and, optionally, a coloured
 * halo hugging the silhouette. One shadow for the whole object reads far
 * better than a shadow per part.
 */
export function composite(
  x: Ctx,
  src: HTMLCanvasElement,
  opts: { shadow?: number; shadowBlur?: number; dx?: number; dy?: number; halo?: number; haloColor?: number; haloBlur?: number } = {},
): void {
  const w = src.width;
  const h = src.height;
  x.save();
  if ((opts.halo ?? 0) > 0) {
    x.shadowColor = css(opts.haloColor ?? 0xffffff, opts.halo!);
    x.shadowBlur = opts.haloBlur ?? 10;
    x.shadowOffsetX = 0;
    x.shadowOffsetY = 0;
    x.drawImage(src, 0, 0, w, h);
  }
  x.shadowColor = `rgba(0,0,0,${opts.shadow ?? 0.65})`;
  x.shadowBlur = opts.shadowBlur ?? 6;
  x.shadowOffsetX = opts.dx ?? 2;
  x.shadowOffsetY = opts.dy ?? 3.5;
  x.drawImage(src, 0, 0, w, h);
  x.restore();
}

/** Fills the canvas with `color` wherever `src` is opaque — a silhouette copy. */
export function silhouette(src: HTMLCanvasElement, color: string, slot = 'sil'): HTMLCanvasElement {
  const { c, x } = scratch(slot, src.width, src.height);
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'source-over';
  return c;
}

/** A vignette that darkens toward the edges of a rectangle. */
export function vignette(x: Ctx, w: number, h: number, a = 0.6, inner = 0.45): void {
  const r = Math.hypot(w, h) / 2;
  const g = x.createRadialGradient(w / 2, h / 2, r * inner, w / 2, h / 2, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${a})`);
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
}

/** Film-grain style noise over the whole canvas, for painterly unity. */
export function grain(x: Ctx, w: number, h: number, amt = 0.08): void {
  const pat = patternFor(x, 'fine');
  if (!pat) return;
  pat.setTransform(new DOMMatrix().scale(0.7));
  x.save();
  x.globalCompositeOperation = 'overlay';
  x.globalAlpha = amt;
  x.fillStyle = pat;
  x.fillRect(0, 0, w, h);
  x.restore();
}
