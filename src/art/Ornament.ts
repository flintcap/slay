/**
 * SLAY — UI ornament.
 *
 * Filigree corners, dividers, a nine-slice frame and heraldic crests, painted
 * in the same metal as the icons (`Paint.ts` ramps under one top-left light),
 * for the HUD and the menus to dress panels with. Every helper returns a
 * cached data URI, so CSS can use it as `background-image` or `border-image`:
 *
 *   el.style.borderImage = frameBorderImage('gold');   // one call, done
 *   img.src = dividerUri(320, 'silver');
 *   corner.style.backgroundImage = `url(${cornerUri(48, 'gold')})`;
 *   crest.src = crestUri('skull', 0xc24a3a, 64);
 *
 * Metals: 'gold', 'silver', 'iron', 'bronze', 'bone'. Everything is drawn at
 * 2x so it stays crisp on high-density screens.
 */
import { GLYPHS } from './Glyphs';
import { toneOf } from './SkillIconArt';
import { type Ctx, type Mat, circleP, css, glint, glow, lift, makeCanvas, mat, polyP, smoothP, solid, sink } from './Paint';

export type OrnamentMetal = 'gold' | 'silver' | 'iron' | 'bronze' | 'bone';

const METALS: Record<OrnamentMetal, Mat> = {
  gold: mat([0x342104, 0x765014, 0xbd8823, 0xedc45a, 0xfff3bd], 0.9, 'brushed', 0.15),
  silver: mat([0x262c36, 0x515c6b, 0x8c99aa, 0xc8d3e0, 0xffffff], 0.95, 'brushed', 0.2),
  iron: mat([0x121418, 0x2a2e35, 0x50575f, 0x858e98, 0xc8d0da], 0.8, 'hammered', 0.3),
  bronze: mat([0x2a180a, 0x5c3818, 0x99602e, 0xd09658, 0xf7d6a4], 0.85, 'hammered', 0.3),
  bone: mat([0x2a241a, 0x5a5140, 0x9a8f74, 0xcdc3a3, 0xf6eed6], 0.15, 'mottle', 0.3),
};

const cache = new Map<string, string>();

function cached(key: string, w: number, h: number, paint: (x: Ctx) => void): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, x } = makeCanvas(w * 2, h * 2);
  x.scale(2, 2);
  paint(x);
  const uri = c.toDataURL('image/png');
  cache.set(key, uri);
  return uri;
}

/** A stroked scroll: a line of metal with a lit top edge and a dark under-stroke. */
function metalLine(x: Ctx, p: Path2D, m: Mat, w: number): void {
  x.save();
  x.lineCap = 'round';
  x.lineJoin = 'round';
  x.strokeStyle = 'rgba(6,5,6,.9)';
  x.lineWidth = w + 2;
  x.stroke(p);
  x.strokeStyle = css(m.c[1]);
  x.lineWidth = w;
  x.stroke(p);
  x.strokeStyle = css(m.c[3]);
  x.lineWidth = w * 0.55;
  x.translate(-w * 0.18, -w * 0.18);
  x.stroke(p);
  x.strokeStyle = css(m.c[4], 0.8);
  x.lineWidth = Math.max(0.6, w * 0.2);
  x.translate(-w * 0.1, -w * 0.1);
  x.stroke(p);
  x.restore();
}

/** A spiral curl ending at (cx, cy), `turns` around, opening outward. */
function curlP(cx: number, cy: number, r: number, dir = 1, rot = 0, turns = 1.3): Path2D {
  const p = new Path2D();
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = rot + dir * t * Math.PI * 2 * turns;
    const rr = r * (1 - t * 0.8);
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) p.moveTo(px, py);
    else p.lineTo(px, py);
  }
  return p;
}

function stud(x: Ctx, cx: number, cy: number, r: number, m: Mat, gem?: number): void {
  solid(x, circleP(cx, cy, r), m, { a: [cx - r, cy - r], b: [cx + r, cy + r], size: 0.4, outline: 1, tex: null });
  if (gem !== undefined) {
    const g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r * 0.7);
    g.addColorStop(0, css(lift(gem, 0.7)));
    g.addColorStop(0.5, css(gem));
    g.addColorStop(1, css(sink(gem, 0.6)));
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
    x.fill();
    glint(x, cx - r * 0.25, cy - r * 0.25, r * 0.6);
  }
}

function paintCorner(x: Ctx, s: number, m: Mat, gem?: number): void {
  // An L of two bars meeting at a studded knot, each bar ending in a curl.
  const t = Math.max(2, s * 0.07);
  const bar = new Path2D();
  bar.moveTo(s * 0.12, s * 0.92);
  bar.lineTo(s * 0.12, s * 0.12);
  bar.lineTo(s * 0.92, s * 0.12);
  metalLine(x, bar, m, t);
  metalLine(x, curlP(s * 0.34, s * 0.34, s * 0.16, 1, Math.PI * 0.75, 1.15), m, t * 0.7);
  metalLine(x, curlP(s * 0.92, s * 0.24, s * 0.1, -1, -Math.PI * 0.5, 1.1), m, t * 0.6);
  metalLine(x, curlP(s * 0.24, s * 0.92, s * 0.1, 1, Math.PI, 1.1), m, t * 0.6);
  const leaf = smoothP(
    [
      [s * 0.12, s * 0.12],
      [s * 0.3, s * 0.18],
      [s * 0.46, s * 0.46],
      [s * 0.18, s * 0.3],
    ],
    0.4,
  );
  solid(x, leaf, m, { a: [0, 0], b: [s * 0.46, s * 0.46], size: 0.5, outline: 1, tex: null });
  stud(x, s * 0.12, s * 0.12, Math.max(2.5, s * 0.1), m, gem);
}

/**
 * A filigree corner for the top-left of a panel, `size` CSS pixels square.
 * Mirror it with `transform: scale(-1, 1)` (and so on) for the other corners.
 */
export function cornerUri(size = 48, metal: OrnamentMetal = 'gold', gem?: number): string {
  return cached(`corner|${size}|${metal}|${gem ?? ''}`, size, size, (x) => paintCorner(x, size, METALS[metal], gem));
}

/** A horizontal divider: a tapering bar with a lozenge at its centre and curls either side. */
export function dividerUri(width = 320, metal: OrnamentMetal = 'gold', gem?: number): string {
  const h = 24;
  return cached(`divider|${width}|${metal}|${gem ?? ''}`, width, h, (x) => {
    const m = METALS[metal];
    const cy = h / 2;
    const cx = width / 2;
    for (const s of [-1, 1]) {
      const bar = polyP([
        [cx + s * 14, cy - 1.8],
        [cx + s * (width / 2 - 6), cy - 0.4],
        [cx + s * (width / 2 - 6), cy + 0.4],
        [cx + s * 14, cy + 1.8],
      ]);
      solid(x, bar, m, { a: [0, cy - 2], b: [0, cy + 2], size: 0.3, outline: 0.8, tex: null, ao: 0.2 });
      metalLine(x, curlP(cx + s * 24, cy - 4, 5, s, s > 0 ? Math.PI : 0, 1.1), m, 1.4);
      metalLine(x, curlP(cx + s * 24, cy + 4, 5, -s, s > 0 ? Math.PI : 0, 1.1), m, 1.4);
    }
    const loz = polyP([
      [cx, cy - 9],
      [cx + 10, cy],
      [cx, cy + 9],
      [cx - 10, cy],
    ]);
    solid(x, loz, m, { a: [cx - 8, cy - 8], b: [cx + 8, cy + 8], size: 0.5, outline: 1, tex: null });
    stud(x, cx, cy, 4, m, gem);
  });
}

/**
 * A nine-slice frame image: a metal border with filigree corners. Use with
 * `border-image: url(...) 24 fill / 24px stretch` — or just call
 * `frameBorderImage()` for the whole declaration.
 */
export function frameUri(metal: OrnamentMetal = 'gold', gem?: number): string {
  const S = 72;
  return cached(`frame|${metal}|${gem ?? ''}`, S, S, (x) => {
    const m = METALS[metal];
    // The rails, inset a little, then a corner in each corner.
    const rail = new Path2D();
    rail.rect(6, 6, S - 12, S - 12);
    metalLine(x, rail, m, 2.6);
    const inner = new Path2D();
    inner.rect(10.5, 10.5, S - 21, S - 21);
    x.save();
    x.strokeStyle = css(m.c[0], 0.9);
    x.lineWidth = 1;
    x.stroke(inner);
    x.restore();
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const) {
      x.save();
      x.translate(sx > 0 ? 0 : S, sy > 0 ? 0 : S);
      x.scale(sx, sy);
      paintCorner(x, 24, m, gem);
      x.restore();
    }
  });
}

/** The full CSS `border-image` value for an ornate metal frame. */
export function frameBorderImage(metal: OrnamentMetal = 'gold', width = 18, gem?: number): string {
  return `url(${frameUri(metal, gem)}) 48 / ${width}px / 0 stretch`;
}

/**
 * A heraldic crest: a metal-rimmed shield in `color` with a pictogram from the
 * icon vocabulary (`Glyphs`) on it — 'skull', 'flame', 'sword', 'crown'...
 */
export function crestUri(glyph: string, color: number, size = 64, metal: OrnamentMetal = 'gold'): string {
  return cached(`crest|${glyph}|${color}|${size}|${metal}`, size, size, (x) => {
    const m = METALS[metal];
    const k = size / 128;
    x.save();
    x.scale(k, k);
    const shield = smoothP(
      [
        [64, 8],
        [112, 18],
        [116, 26],
        [112, 70],
        [92, 104],
        [64, 122],
        [36, 104],
        [16, 70],
        [12, 26],
        [16, 18],
      ],
      0.25,
    );
    solid(x, shield, m, { a: [12, 8], b: [116, 122], size: 1.2, outline: 2 });
    const field = smoothP(
      [
        [64, 18],
        [104, 26],
        [102, 68],
        [86, 96],
        [64, 111],
        [42, 96],
        [26, 68],
        [24, 26],
      ],
      0.25,
    );
    const fg = x.createLinearGradient(30, 18, 100, 110);
    fg.addColorStop(0, css(lift(color, 0.1)));
    fg.addColorStop(1, css(sink(color, 0.65)));
    x.fillStyle = fg;
    x.fill(field);
    x.save();
    x.clip(field);
    glow(x, 64, 56, 44, lift(color, 0.4), 0.35);
    const g = GLYPHS[glyph] ?? GLYPHS.star!;
    x.translate(64, 62);
    x.scale(0.62, 0.62);
    x.translate(-64, -64);
    g(x, toneOf(lift(color, 0.25)), 0);
    x.restore();
    stud(x, 64, 14, 5, m);
    x.restore();
  });
}

export const ORNAMENT_METALS = Object.keys(METALS) as OrnamentMetal[];
