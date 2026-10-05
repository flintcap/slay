/**
 * SLAY — key art for the boot screen and the loading card.
 *
 * One composition, painted to a canvas in code: a broken stair descending
 * between two ruined pillars into a burning pit, a lone hooded figure at the
 * top of the steps with their back to us, mist lying in the stairwell and
 * embers rising out of the dark. Everything is lit from the pit, so the
 * picture is mostly black with hot edges, and the middle top stays quiet for
 * a title to sit on.
 *
 * Painted straight onto a canvas the caller places in the page (no image
 * encode), at whatever size the screen is. Shapes are generated from a seed,
 * so the same seed always paints the same picture.
 */
import { Random } from '../core/RNG';
import { type Ctx, css, glow, lift, sink, smoothP, polyP, vignette } from './Paint';

const PIT = 0xff6a24;
const PIT_HOT = 0xffd28a;
const COLD = 0x1a2238;

/** Paints the key art into a `w` x `h` context. */
export function paintKeyArt(x: Ctx, w: number, h: number, seed = 0x51a7): void {
  const rng = new Random(seed);
  const cx = w * 0.5;
  // The pit's mouth, where every light comes from.
  const py = h * 0.66;
  const pr = Math.min(w, h) * 0.2;

  // Night: cold at the top, ember-warm toward the pit.
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, css(0x05060b));
  sky.addColorStop(0.45, css(sink(COLD, 0.35)));
  sky.addColorStop(0.62, css(0x2a120c));
  sky.addColorStop(1, css(0x08060a));
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);

  // Far wall: a vaulted chamber, arches dissolving into the dark.
  x.save();
  for (let i = 0; i < 5; i++) {
    const ax = cx + (i - 2) * w * 0.17;
    const aw = w * 0.07;
    const top = h * (0.28 + Math.abs(i - 2) * 0.03);
    const arch = new Path2D();
    arch.moveTo(ax - aw, py);
    arch.lineTo(ax - aw, top + aw);
    arch.quadraticCurveTo(ax - aw, top, ax, top - aw * 0.4);
    arch.quadraticCurveTo(ax + aw, top, ax + aw, top + aw);
    arch.lineTo(ax + aw, py);
    x.fillStyle = css(sink(PIT, 0.92), 0.6);
    x.fill(arch);
  }
  x.restore();

  // Light pouring up out of the pit in shafts.
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const a = -Math.PI / 2 + rng.range(-0.75, 0.75);
    const len = h * rng.range(0.45, 0.8);
    const spread = rng.range(0.015, 0.04);
    const g = x.createLinearGradient(cx, py, cx + Math.cos(a) * len, py + Math.sin(a) * len);
    g.addColorStop(0, css(PIT, 0.1));
    g.addColorStop(1, css(PIT, 0));
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(cx - pr * 0.3, py);
    x.lineTo(cx + Math.cos(a - spread) * len, py + Math.sin(a - spread) * len);
    x.lineTo(cx + Math.cos(a + spread) * len, py + Math.sin(a + spread) * len);
    x.lineTo(cx + pr * 0.3, py);
    x.fill();
  }
  x.restore();
  glow(x, cx, py, pr * 3.2, PIT, 0.55);
  glow(x, cx, py, pr * 1.3, PIT_HOT, 0.7);

  // The pit itself: a ragged hole, white-hot in the middle.
  const pit = new Path2D();
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = pr * rng.range(0.82, 1.05);
    const px = cx + Math.cos(a) * r;
    const pyy = py + Math.sin(a) * r * 0.28;
    if (i === 0) pit.moveTo(px, pyy);
    else pit.lineTo(px, pyy);
  }
  pit.closePath();
  const pg = x.createRadialGradient(cx, py, 2, cx, py, pr);
  pg.addColorStop(0, css(0xffffff));
  pg.addColorStop(0.25, css(PIT_HOT));
  pg.addColorStop(0.7, css(PIT));
  pg.addColorStop(1, css(sink(PIT, 0.5)));
  x.fillStyle = pg;
  x.fill(pit);

  // The stair: steps narrowing toward the pit, lit along their front edges.
  const steps = 11;
  const y0 = h * 1.02;
  for (let i = steps - 1; i >= 0; i--) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const ease = (t: number): number => 1 - Math.pow(1 - t, 1.6);
    const yA = y0 + (py - y0) * ease(t0);
    const yB = y0 + (py - y0) * ease(t1);
    const wA = w * 0.36 * (1 - t0 * 0.72);
    const wB = w * 0.36 * (1 - t1 * 0.72);
    const broken = rng.next() < 0.35 ? rng.range(-0.06, 0.06) * w : 0;
    const tread = polyP([
      [cx - wA, yA],
      [cx + wA + broken, yA],
      [cx + wB + broken * 0.6, yB],
      [cx - wB, yB],
    ]);
    const near = 1 - t0;
    const tg = x.createLinearGradient(0, yB, 0, yA);
    tg.addColorStop(0, css(mixDark(PIT, 0.55 + near * 0.35)));
    tg.addColorStop(1, css(0x0a0809));
    x.fillStyle = tg;
    x.fill(tread);
    // The riser's lip catches the pit light.
    x.save();
    x.globalCompositeOperation = 'lighter';
    x.strokeStyle = css(PIT, 0.25 + t0 * 0.5);
    x.lineWidth = 1.5 + t0;
    x.beginPath();
    x.moveTo(cx - wB, yB);
    x.lineTo(cx + wB + broken * 0.6, yB);
    x.stroke();
    x.restore();
  }

  // Two ruined pillars framing it all, black against the glow, rimmed in fire.
  for (const s of [-1, 1]) {
    const px0 = cx + s * w * 0.42;
    const pw = w * 0.06;
    const top = h * rng.range(0.06, 0.2);
    const pillar = new Path2D();
    pillar.moveTo(px0 - pw, h);
    pillar.lineTo(px0 - pw * 0.92, top + pw * 0.4);
    // A broken top: jagged.
    for (let k = 0; k <= 5; k++) pillar.lineTo(px0 - pw * 0.92 + (k / 5) * pw * 1.84, top + rng.range(-pw * 0.5, pw * 0.4));
    pillar.lineTo(px0 + pw, h);
    pillar.closePath();
    const pgr = x.createLinearGradient(px0 - s * pw, 0, px0 + s * pw, 0);
    pgr.addColorStop(0, css(0x0d0a0b));
    pgr.addColorStop(1, css(0x050405));
    x.fillStyle = pgr;
    x.fill(pillar);
    // Rim light on the side facing the pit.
    x.save();
    x.clip(pillar);
    const rim = x.createLinearGradient(px0 - s * pw, 0, px0 - s * pw * 0.6, 0);
    rim.addColorStop(0, css(PIT, 0.55));
    rim.addColorStop(1, css(PIT, 0));
    x.fillStyle = rim;
    x.globalCompositeOperation = 'lighter';
    x.fillRect(0, 0, w, h);
    // Masonry joints.
    x.globalCompositeOperation = 'source-over';
    x.strokeStyle = 'rgba(0,0,0,.55)';
    x.lineWidth = 2;
    for (let yy = top + pw; yy < h; yy += pw * 0.9) {
      x.beginPath();
      x.moveTo(px0 - pw, yy);
      x.lineTo(px0 + pw, yy + rng.range(-3, 3));
      x.stroke();
    }
    x.restore();
  }

  // Mist lying in the stairwell.
  for (let i = 0; i < 6; i++) {
    const my = py + (h - py) * (i / 6) + rng.range(-10, 10);
    const mg = x.createLinearGradient(0, my - h * 0.05, 0, my + h * 0.05);
    mg.addColorStop(0, 'rgba(0,0,0,0)');
    mg.addColorStop(0.5, css(lift(sink(PIT, 0.6), 0.1), 0.14));
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = mg;
    x.fillRect(0, my - h * 0.05, w, h * 0.1);
  }

  // The figure: hooded, cloaked, a sword hanging point-down, back to us.
  const fh = h * 0.24;
  const fx = cx - w * 0.03;
  const fy = h * 0.985;
  const S = (px: number, py2: number): [number, number] => [fx + px * fh, fy + py2 * fh];
  const cloak = smoothP(
    [
      S(0, -1), S(0.065, -0.97), S(0.08, -0.88), S(0.07, -0.82), S(0.16, -0.76), S(0.19, -0.62),
      S(0.2, -0.3), S(0.27, -0.02), S(0.12, 0), S(0, -0.03), S(-0.14, 0), S(-0.24, -0.04),
      S(-0.19, -0.32), S(-0.18, -0.62), S(-0.15, -0.76), S(-0.07, -0.82), S(-0.08, -0.88), S(-0.065, -0.97),
    ],
    0.3,
  );
  x.fillStyle = '#040304';
  x.fill(cloak);
  const sword = new Path2D();
  sword.addPath(polyP([S(0.205, -0.5), S(0.225, -0.5), S(0.34, -0.04), S(0.33, -0.02)]));
  sword.addPath(polyP([S(0.15, -0.53), S(0.27, -0.49), S(0.268, -0.47), S(0.148, -0.51)]));
  sword.addPath(polyP([S(0.19, -0.6), S(0.205, -0.6), S(0.215, -0.52), S(0.2, -0.52)]));
  x.fill(sword);
  // Rim light from the pit, on the edges facing away from us.
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.strokeStyle = css(PIT_HOT, 0.55);
  x.lineWidth = Math.max(1, h / 500);
  x.stroke(cloak);
  x.strokeStyle = css(PIT_HOT, 0.75);
  x.stroke(sword);
  x.restore();
  glow(x, fx, fy - fh * 0.9, fh * 0.25, PIT, 0.25);

  // Embers rising out of the pit.
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90; i++) {
    const ex = cx + rng.range(-1, 1) * w * 0.4 * Math.pow(rng.next(), 0.7);
    const ey = py - rng.next() * h * 0.65;
    const r = rng.range(0.6, 2.2) * (h / 720);
    const a = rng.range(0.3, 1) * (1 - (py - ey) / h);
    x.fillStyle = css(rng.next() < 0.3 ? PIT_HOT : PIT, a);
    x.beginPath();
    x.arc(ex, ey, r, 0, Math.PI * 2);
    x.fill();
  }
  x.restore();

  vignette(x, w, h, 0.75, 0.35);

}

function mixDark(c: number, t: number): number {
  return sink(c, t);
}

const cache = new Map<string, HTMLCanvasElement>();

/**
 * A canvas with the key art for a `w` x `h` area (painted at half that, so
 * size it with CSS). Cached per size and seed; place it in the page directly (cloning it with `drawImage` if it must be
 * shown twice).
 */
export function keyArtCanvas(w: number, h: number, seed = 0x51a7): HTMLCanvasElement {
  const W = Math.max(64, Math.round(w));
  const H = Math.max(64, Math.round(h));
  const key = `${W}x${H}|${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  // Painted at half resolution and scaled up by the page: it is soft, dark
  // art, and a quarter of the pixels keeps the boot screen from stalling.
  const c = document.createElement('canvas');
  c.width = Math.round(W / 2);
  c.height = Math.round(H / 2);
  const x = c.getContext('2d');
  if (x) paintKeyArt(x, c.width, c.height, seed);
  cache.set(key, c);
  return c;
}

/**
 * Places the key art as a full-bleed backdrop at the back of `parent` (which
 * must be positioned), behind its other children. Returns the canvas so the
 * caller can fade it.
 */
export function mountKeyArt(parent: HTMLElement, opacity = 0.6): HTMLCanvasElement {
  const w = Math.min(1920, Math.max(320, window.innerWidth || 960));
  const h = Math.min(1200, Math.max(320, window.innerHeight || 540));
  const art = keyArtCanvas(w, h);
  art.setAttribute('aria-hidden', 'true');
  Object.assign(art.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    opacity: String(opacity),
    pointerEvents: 'none',
    zIndex: '0',
  });
  parent.insertBefore(art, parent.firstChild);
  return art;
}
