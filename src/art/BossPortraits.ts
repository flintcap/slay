/**
 * SLAY — boss and monster portraits.
 *
 * A painted head in a round iron medallion: one per boss for the intro card,
 * one per monster family for bestiary-style uses. Each family has its own
 * painter (a skull, a horned brute, a chitin head, a furnace helm, a hooded
 * figure, a mass of eyes...), fed by the creature's own `visual` block — skin
 * tint, eye colour, eye count, ornament, wings — so twenty bosses come out as
 * twenty faces from ten painters. Same brush box and light as the icons.
 */
import type { MonsterFamily, MonsterVisual } from '../types';
import { BOSSES } from '../data/bosses';
import { skullPath, flamePath } from './Glyphs';
import { Random, hashString } from '../core/RNG';
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
  makeCanvas,
  mat,
  mixC,
  polyP,
  rampOf,
  sink,
  smoothP,
  solid,
  texture,
  vignette,
} from './Paint';

interface Spec {
  skin: number;
  glow: number;
  eyes: number;
  ornate: number;
  wings: boolean;
  seed: number;
}

const A: Pt = [70, 50];
const B: Pt = [190, 230];
const IRON = mat([0x0e1012, 0x24272c, 0x454a52, 0x777e88, 0xb8c0ca], 0.8, 'hammered', 0.35);
const BONE = mat([0x2a241a, 0x5a5140, 0x9a8f74, 0xcdc3a3, 0xf6eed6], 0.15, 'mottle', 0.3);

/** The base colour a palette key suggests, or its explicit `|0xTINT`. */
function paletteColor(palette: string | undefined, fallback: number): number {
  const p = palette ?? '';
  const tint = p.split('|')[1];
  if (tint) {
    const n = Number(tint);
    if (Number.isFinite(n)) return n;
  }
  if (p.startsWith('bone')) return 0xcdc3a3;
  if (p.startsWith('flesh.rotted')) return 0x6f7a4a;
  if (p.startsWith('flesh.demon')) return 0x8a2a20;
  if (p.startsWith('flesh.chitin')) return 0x4a3a2a;
  if (p.startsWith('metal')) return 0x7a828c;
  if (p.startsWith('stone')) return 0x7a7f84;
  if (p.startsWith('crystal.ice')) return 0x8cc8e6;
  if (p.startsWith('crystal')) return 0x6a4aa0;
  if (p.startsWith('wood')) return 0x5a4a32;
  return fallback;
}

/** Glowing eyes: a dark socket, a halo and a hot pupil at each point. */
function eyesAt(x: Ctx, pts: Pt[], r: number, color: number, socket = true): void {
  for (const [ex, ey] of pts) {
    if (socket) {
      x.fillStyle = '#050405';
      x.beginPath();
      x.ellipse(ex, ey, r * 1.5, r * 1.15, 0, 0, Math.PI * 2);
      x.fill();
    }
    glow(x, ex, ey, r * 4, color, 0.9);
    x.fillStyle = css(lift(color, 0.65));
    x.beginPath();
    x.ellipse(ex, ey, r, r * 0.7, 0, 0, Math.PI * 2);
    x.fill();
  }
}

/** Points for `n` eyes spread across a face centred at (cx, cy). */
function eyeSpread(n: number, cx: number, cy: number, w: number, rng: Random): Pt[] {
  if (n <= 0) return [];
  if (n === 1) return [[cx, cy]];
  if (n === 2) return [[cx - w * 0.5, cy], [cx + w * 0.5, cy]];
  const out: Pt[] = [[cx - w * 0.5, cy], [cx + w * 0.5, cy]];
  for (let i = 2; i < n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.35, 1) * w;
    out.push([cx + Math.cos(a) * r, cy - Math.abs(Math.sin(a)) * r * 0.9 - 6]);
  }
  return out;
}

function shoulders(x: Ctx, m: Mat, top = 196): void {
  const p = smoothP([[0, 262], [6, top + 24], [60, top], [196, top], [250, top + 24], [256, 262]], 0.35);
  solid(x, p, m, { a: A, b: B, size: 1.6 });
}

function horns(x: Ctx, spec: Spec, m: Mat, base: number, len: number, curl: number): void {
  for (const s of [-1, 1]) {
    const bx = 128 + s * base;
    const p = smoothP(
      [
        [bx - s * 8, 96],
        [bx + s * len * 0.6, 70 - len * 0.2],
        [bx + s * len * (0.7 + curl * 0.3), 30 - len * 0.25 * curl],
        [bx + s * len * 0.45, 60 - len * 0.15],
        [bx + s * 6, 84],
      ],
      0.4,
    );
    solid(x, p, m, { a: [bx - 20, 20], b: [bx + 20, 100], size: 1.2 });
  }
  void spec;
}

function crown(x: Ctx, m: Mat, cy: number, w: number, points: number): void {
  const p = new Path2D();
  for (let i = 0; i < points; i++) {
    const cx = 128 - w / 2 + (i + 0.5) * (w / points);
    const h = i % 2 ? 18 : 30;
    p.addPath(polyP([[cx - w / points / 2, cy], [cx, cy - h], [cx + w / points / 2, cy]]));
  }
  p.addPath(polyP([[128 - w / 2, cy], [128 + w / 2, cy], [128 + w / 2 - 4, cy + 10], [128 - w / 2 + 4, cy + 10]]));
  solid(x, p, m, { a: [128 - w / 2, cy - 30], b: [128 + w / 2, cy + 10], size: 1 });
}

// ---------------------------------------------------------------------------
// Family painters
// ---------------------------------------------------------------------------

type Painter = (x: Ctx, s: Spec, rng: Random) => void;

const undead: Painter = (x, s, rng) => {
  shoulders(x, rampOf(sink(s.skin, 0.6), 0.05, 'weave', 0.4));
  const bone = mat([sink(s.skin, 0.8), sink(s.skin, 0.55), s.skin, lift(s.skin, 0.35), lift(s.skin, 0.75)], 0.15, 'mottle', 0.3);
  // Three ways to dress a skull, picked by the creature: a crown, horns, a hood.
  const v = s.seed % 3;
  if (v === 1) horns(x, s, bone, 34, 56 + s.ornate * 30, 0.9);
  if (v === 2) {
    const hood = smoothP([[128, 52], [184, 80], [200, 150], [206, 214], [50, 214], [56, 150], [72, 80]], 0.38);
    solid(x, hood, rampOf(sink(s.skin, 0.75), 0.05, 'weave', 0.4), { a: [60, 52], b: [200, 214], size: 2, rimColor: s.glow, rim: 0.5 });
  }
  const skull = skullPath(128, 128, 56);
  solid(x, skull, bone, { a: [76, 72], b: [184, 184], size: 2 });
  texture(x, skull, 'crack', 0.3, 1.2);
  if (v === 0 && s.ornate > 0.6) crown(x, mat([0x342104, 0x765014, 0xbd8823, 0xedc45a, 0xfff3bd], 0.9, 'brushed', 0.15), 86, 96, 7);
  eyesAt(x, [[107, 124], [149, 124]], 7, s.glow);
  x.fillStyle = '#060506';
  x.fill(polyP([[128, 140], [136, 158], [120, 158]]));
  for (let i = 0; i < 7; i++) x.fillRect(104 + i * 7.4, 170, 2, 12);
  void rng;
};

const demon: Painter = (x, s, rng) => {
  const skin = mat([sink(s.skin, 0.8), sink(s.skin, 0.5), s.skin, lift(s.skin, 0.3), lift(s.skin, 0.6)], 0.2, 'pores', 0.45);
  shoulders(x, skin, 190);
  horns(x, s, rampOf(0x2a2420, 0.2, 'grain', 0.4), 30, 70 + s.ornate * 30, 0.6 + rng.next() * 0.6);
  const head = smoothP([[128, 66], [170, 82], [182, 130], [166, 176], [128, 196], [90, 176], [74, 130], [86, 82]], 0.38);
  solid(x, head, skin, { a: [74, 66], b: [182, 196], size: 2, rimColor: s.glow, rim: 0.6 });
  // Brow ridge and a snarl.
  const brow = smoothP([[86, 112], [128, 120], [170, 112], [168, 124], [128, 132], [88, 124]], 0.35);
  solid(x, brow, skin, { a: [86, 110], b: [170, 132], size: 1 });
  eyesAt(x, eyeSpread(Math.max(2, s.eyes), 128, 138, 26, rng), 6, s.glow);
  const mouth = smoothP([[102, 168], [128, 176], [154, 168], [146, 182], [128, 186], [110, 182]], 0.35);
  x.fillStyle = '#120504';
  x.fill(mouth);
  glow(x, 128, 178, 20, s.glow, 0.5);
  for (const fx of [110, 146]) solid(x, polyP([[fx - 4, 168], [fx + 4, 168], [fx, 188]]), BONE, { a: [fx - 4, 168], b: [fx + 4, 188], size: 0.5, outline: 1 });
};

const insect: Painter = (x, s, rng) => {
  const chitin = mat([sink(s.skin, 0.85), sink(s.skin, 0.55), s.skin, lift(s.skin, 0.35), lift(s.skin, 0.8)], 0.55, 'scales', 0.35);
  shoulders(x, chitin, 200);
  for (const sd of [-1, 1]) {
    const ant = new Path2D();
    ant.moveTo(128 + sd * 14, 80);
    ant.quadraticCurveTo(128 + sd * 40, 30, 128 + sd * 86, 26);
    x.save();
    x.lineWidth = 4;
    x.lineCap = 'round';
    x.strokeStyle = css(chitin.c[1]);
    x.stroke(ant);
    x.restore();
  }
  const head = smoothP([[128, 74], [168, 92], [176, 140], [150, 182], [128, 190], [106, 182], [80, 140], [88, 92]], 0.4);
  solid(x, head, chitin, { a: [80, 74], b: [176, 190], size: 2 });
  // Mandibles.
  for (const sd of [-1, 1]) {
    const md = smoothP([[128 + sd * 10, 178], [128 + sd * 40, 192], [128 + sd * 30, 228], [128 + sd * 6, 206]], 0.4);
    solid(x, md, chitin, { a: [100, 178], b: [160, 228], size: 1 });
  }
  // Compound eyes: big glossy domes, then the extra eyes in a cluster.
  for (const sd of [-1, 1]) {
    const ey = ellipseP(128 + sd * 30, 126, 18, 24, sd * 0.3);
    const g = x.createRadialGradient(128 + sd * 30 - 6, 118, 2, 128 + sd * 30, 126, 24);
    g.addColorStop(0, css(lift(s.glow, 0.6)));
    g.addColorStop(0.5, css(s.glow));
    g.addColorStop(1, css(sink(s.glow, 0.7)));
    x.fillStyle = g;
    x.fill(ey);
    texture(x, ey, 'scales', 0.4, 0.5);
    glow(x, 128 + sd * 30, 126, 30, s.glow, 0.4);
  }
  if (s.eyes > 2) eyesAt(x, eyeSpread(s.eyes - 2, 128, 100, 16, rng), 3, s.glow, false);
};

const construct: Painter = (x, s, rng) => {
  const iron = mat([sink(s.skin, 0.85), sink(s.skin, 0.55), s.skin, lift(s.skin, 0.3), lift(s.skin, 0.7)], 0.85, 'hammered', 0.35);
  shoulders(x, iron, 192);
  for (const sd of [-1, 1]) solid(x, ellipseP(128 + sd * 86, 204, 52, 34, sd * 0.2), iron, { a: [40, 170], b: [216, 240], size: 1.6 });
  const head = polyP([[84, 70], [172, 70], [184, 100], [178, 180], [128, 194], [78, 180], [72, 100]]);
  solid(x, head, iron, { a: [72, 70], b: [184, 194], size: 2 });
  // A furnace grille for a face: slits of fire.
  for (let i = 0; i < 4; i++) {
    const r = polyP([[96, 150 + i * 9], [160, 150 + i * 9], [158, 155 + i * 9], [98, 155 + i * 9]]);
    x.fillStyle = css(lift(s.glow, 0.3));
    x.fill(r);
  }
  glow(x, 128, 162, 40, s.glow, 0.55);
  const v = s.seed % 3;
  if (v === 2) {
    // A crest of spikes along the crown.
    for (let i = 0; i < 5; i++) {
      const cx = 96 + i * 16;
      solid(x, polyP([[cx - 6, 72], [cx, 40 - (i % 2) * 10], [cx + 6, 72]]), iron, { a: [cx - 6, 40], b: [cx + 6, 72], size: 0.6 });
    }
  }
  const n = v === 1 ? 1 : Math.max(2, Math.min(4, s.eyes));
  const pts: Pt[] = n === 1 ? [[128, 120]] : n === 4 ? [[104, 116], [152, 116], [114, 132], [142, 132]] : [[106, 122], [150, 122]];
  for (const [ex, ey] of pts) {
    if (n === 1) {
      // A single great lens.
      solid(x, circleP(ex, ey, 18), iron, { a: [ex - 18, ey - 18], b: [ex + 18, ey + 18], size: 0.6 });
      eyesAt(x, [[ex, ey]], 9, s.glow);
      continue;
    }
    x.fillStyle = '#050405';
    x.fillRect(ex - 10, ey - 5, 20, 10);
    glow(x, ex, ey, 18, s.glow, 1);
    x.fillStyle = css(lift(s.glow, 0.6));
    x.fillRect(ex - 7, ey - 2.5, 14, 5);
  }
  for (const [rx, ry] of [[82, 80], [174, 80], [80, 170], [176, 170]] as const) {
    solid(x, circleP(rx, ry, 4), iron, { a: [rx - 4, ry - 4], b: [rx + 4, ry + 4], size: 0.3, tex: null, outline: 1 });
  }
  void rng;
};

const humanoid: Painter = (x, s, rng) => {
  const cloth = rampOf(s.skin, 0.05, 'weave', 0.4);
  shoulders(x, cloth, 190);
  if (s.wings) {
    for (const sd of [-1, 1]) {
      const w = smoothP([[128 + sd * 40, 150], [128 + sd * 120, 40], [128 + sd * 124, 140], [128 + sd * 90, 200]], 0.35);
      solid(x, w, rampOf(sink(s.skin, 0.3), 0.1, 'grain', 0.4), { a: [20, 40], b: [236, 200], size: 1.5, rimColor: s.glow, rim: 0.7 });
    }
  }
  const hood = smoothP([[128, 50], [176, 74], [188, 130], [196, 196], [60, 196], [68, 130], [80, 74]], 0.38);
  solid(x, hood, cloth, { a: [70, 50], b: [190, 200], size: 2, rimColor: s.glow, rim: 0.4 });
  const hole = smoothP([[128, 86], [160, 104], [156, 158], [128, 176], [100, 158], [96, 104]], 0.4);
  x.fillStyle = '#050406';
  x.fill(hole);
  innerEdge(x, hole, 'rgba(0,0,0,.9)', 10, 0, -4, 6);
  if (s.ornate > 0.75) {
    // A mask: pale, blank, catching the light.
    const mask = smoothP([[128, 98], [152, 110], [150, 150], [128, 166], [106, 150], [104, 110]], 0.4);
    solid(x, mask, BONE, { a: [104, 98], b: [152, 166], size: 1.2 });
  }
  eyesAt(x, eyeSpread(Math.max(0, s.eyes), 128, 126, 22, rng), 5, s.glow, s.ornate > 0.75);
  if (s.eyes === 0) {
    glow(x, 128, 130, 36, s.glow, 0.5);
  }
};

const ooze: Painter = (x, s, rng) => {
  const mass = smoothP(
    [[30, 250], [36, 170], [70, 100], [128, 70], [186, 96], [222, 160], [228, 250], [190, 236], [160, 252], [128, 238], [96, 252], [64, 236]],
    0.42,
  );
  const g = x.createRadialGradient(110, 120, 10, 128, 170, 140);
  g.addColorStop(0, css(lift(s.skin, 0.5), 0.95));
  g.addColorStop(0.6, css(s.skin, 0.92));
  g.addColorStop(1, css(sink(s.skin, 0.6), 0.95));
  x.fillStyle = g;
  x.fill(mass);
  innerEdge(x, mass, css(lift(s.skin, 0.7), 0.8), 6, 3, 4, 3);
  innerEdge(x, mass, 'rgba(0,0,0,.6)', 14, -6, -8, 6);
  // Things suspended in it.
  for (let i = 0; i < 5; i++) {
    const bx = rng.range(60, 196);
    const by = rng.range(120, 230);
    solid(x, circleP(bx, by, rng.range(4, 9)), BONE, { a: [bx - 6, by - 6], b: [bx + 6, by + 6], size: 0.4, outline: 0 });
  }
  eyesAt(x, eyeSpread(Math.max(3, s.eyes), 128, 140, 50, rng), 6, s.glow);
  x.save();
  x.globalCompositeOperation = 'lighter';
  glow(x, 96, 104, 22, 0xffffff, 0.3);
  x.restore();
};

const elemental: Painter = (x, s, rng) => {
  // A crown of shards around a burning core: the element is the face.
  glow(x, 128, 128, 110, s.glow, 0.45);
  const shards = 9 + Math.round(s.ornate * 6);
  for (let i = 0; i < shards; i++) {
    const a = -Math.PI / 2 + (i - (shards - 1) / 2) * 0.32 + rng.range(-0.08, 0.08);
    const len = rng.range(70, 120);
    const bx = 128 + Math.cos(a) * 30;
    const by = 140 + Math.sin(a) * 30;
    const p = polyP([
      [bx + Math.cos(a + 1.5) * 12, by + Math.sin(a + 1.5) * 12],
      [128 + Math.cos(a) * len, 140 + Math.sin(a) * len],
      [bx + Math.cos(a - 1.5) * 12, by + Math.sin(a - 1.5) * 12],
    ]);
    solid(x, p, mat([sink(s.skin, 0.8), sink(s.skin, 0.5), s.skin, lift(s.skin, 0.4), lift(s.skin, 0.85)], 0.6, null, 0), { a: [60, 40], b: [200, 200], size: 1, rimColor: s.glow, rim: 0.9 });
  }
  const core = smoothP([[128, 84], [170, 110], [176, 160], [150, 200], [128, 210], [106, 200], [80, 160], [86, 110]], 0.4);
  solid(x, core, mat([sink(s.skin, 0.85), sink(s.skin, 0.6), s.skin, lift(s.skin, 0.3), lift(s.skin, 0.7)], 0.5, 'crack', 0.4), { a: [80, 84], b: [176, 210], size: 2 });
  // Cracks of light through the body.
  const cr = new Path2D();
  cr.moveTo(110, 100);
  cr.lineTo(122, 140);
  cr.lineTo(112, 176);
  cr.moveTo(122, 140);
  cr.lineTo(150, 160);
  emissiveStroke(x, cr, s.glow, 3, 0.9);
  eyesAt(x, eyeSpread(Math.max(2, s.eyes), 128, 132, 22, rng), 6, s.glow);
  const flame = flamePath(128, 60, 0.5);
  x.save();
  x.globalAlpha = 0.6;
  x.fillStyle = css(s.glow);
  x.fill(flame);
  x.restore();
};

const aberration: Painter = (x, s, rng) => {
  // Tentacles below, a lidded mass above, one great eye and many small ones.
  const flesh = mat([sink(s.skin, 0.85), sink(s.skin, 0.55), s.skin, lift(s.skin, 0.3), lift(s.skin, 0.65)], 0.2, 'pores', 0.5);
  for (let i = 0; i < 6; i++) {
    const t = new Path2D();
    const bx = 70 + i * 23;
    t.moveTo(bx, 170);
    t.bezierCurveTo(bx + rng.range(-30, 30), 210, bx + rng.range(-40, 40), 230, bx + rng.range(-20, 20), 262);
    x.save();
    x.lineCap = 'round';
    x.lineWidth = 16 - i % 2 * 4;
    x.strokeStyle = css(flesh.c[1]);
    x.stroke(t);
    x.lineWidth = 8;
    x.strokeStyle = css(flesh.c[2]);
    x.stroke(t);
    x.restore();
  }
  const body = smoothP([[128, 50], [190, 80], [206, 140], [176, 190], [128, 204], [80, 190], [50, 140], [66, 80]], 0.42);
  solid(x, body, flesh, { a: [50, 50], b: [206, 204], size: 2, rimColor: s.glow, rim: 0.6 });
  const eye = ellipseP(128, 128, 40, 30);
  const g = x.createRadialGradient(118, 120, 2, 128, 128, 40);
  g.addColorStop(0, '#fff8ee');
  g.addColorStop(0.7, '#d8c8b0');
  g.addColorStop(1, '#6a5a48');
  x.fillStyle = g;
  x.fill(eye);
  innerEdge(x, eye, 'rgba(60,20,20,.8)', 8, 0, 0, 4);
  glow(x, 128, 128, 30, s.glow, 0.7);
  x.fillStyle = css(s.glow);
  x.beginPath();
  x.arc(128, 128, 15, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#050405';
  x.beginPath();
  x.ellipse(128, 128, 4, 13, 0, 0, Math.PI * 2);
  x.fill();
  glint(x, 120, 120, 7);
  const extra = Math.max(0, s.eyes - 1);
  const pts: Pt[] = [];
  for (let i = 0; i < extra; i++) {
    const a = (i / Math.max(1, extra)) * Math.PI * 2 + 0.3;
    pts.push([128 + Math.cos(a) * 62, 128 + Math.sin(a) * 50]);
  }
  eyesAt(x, pts, 4, s.glow);
};

const plant: Painter = (x, s, rng) => {
  const bark = mat([sink(s.skin, 0.85), sink(s.skin, 0.55), s.skin, lift(s.skin, 0.3), lift(s.skin, 0.6)], 0.05, 'grain', 0.6);
  // Branching antlers, leaves.
  for (const sd of [-1, 1]) {
    const br = new Path2D();
    br.moveTo(128 + sd * 30, 90);
    br.quadraticCurveTo(128 + sd * 60, 50, 128 + sd * 100, 20);
    br.moveTo(128 + sd * 60, 56);
    br.quadraticCurveTo(128 + sd * 50, 30, 128 + sd * 60, 8);
    br.moveTo(128 + sd * 84, 32);
    br.quadraticCurveTo(128 + sd * 110, 40, 128 + sd * 120, 60);
    x.save();
    x.lineCap = 'round';
    x.lineWidth = 9;
    x.strokeStyle = css(bark.c[1]);
    x.stroke(br);
    x.lineWidth = 5;
    x.strokeStyle = css(bark.c[2]);
    x.stroke(br);
    x.restore();
    for (let i = 0; i < 5; i++) {
      const lx = 128 + sd * rng.range(50, 120);
      const ly = rng.range(10, 70);
      solid(x, ellipseP(lx, ly, 8, 4, rng.range(0, 3)), rampOf(0x4a7a30, 0.05, 'fine', 0.2), { a: [lx - 8, ly - 4], b: [lx + 8, ly + 4], size: 0.3, outline: 1 });
    }
  }
  shoulders(x, bark, 196);
  const head = smoothP([[128, 70], [166, 84], [176, 140], [160, 196], [128, 210], [96, 196], [80, 140], [90, 84]], 0.35);
  solid(x, head, bark, { a: [80, 70], b: [176, 210], size: 2, texScale: 0.8 });
  eyesAt(x, eyeSpread(Math.max(2, s.eyes), 128, 128, 24, rng), 6, s.glow);
  const mouth = smoothP([[108, 168], [128, 162], [148, 168], [140, 186], [116, 186]], 0.4);
  x.fillStyle = '#080503';
  x.fill(mouth);
  glow(x, 128, 176, 16, s.glow, 0.4);
};

const beast: Painter = (x, s, rng) => {
  const fur = mat([sink(s.skin, 0.85), sink(s.skin, 0.5), s.skin, lift(s.skin, 0.3), lift(s.skin, 0.6)], 0.05, 'grain', 0.7);
  shoulders(x, fur, 186);
  for (const sd of [-1, 1]) solid(x, polyP([[128 + sd * 30, 90], [128 + sd * 64, 36], [128 + sd * 70, 104]]), fur, { a: [60, 36], b: [196, 104], size: 1 });
  const head = smoothP([[128, 64], [168, 84], [176, 126], [156, 160], [146, 206], [128, 218], [110, 206], [100, 160], [80, 126], [88, 84]], 0.38);
  solid(x, head, fur, { a: [80, 64], b: [176, 218], size: 2, texRot: Math.PI / 2 });
  solid(x, ellipseP(128, 206, 12, 8), rampOf(0x1a1414, 0.3, null), { a: [116, 198], b: [140, 214], size: 0.4 });
  for (const fx of [116, 140]) solid(x, polyP([[fx - 3, 214], [fx + 3, 214], [fx, 230]]), BONE, { a: [fx - 3, 214], b: [fx + 3, 230], size: 0.3, outline: 1 });
  eyesAt(x, eyeSpread(Math.max(2, s.eyes), 128, 128, 22, rng), 5, s.glow);
};

const PAINTERS: Record<MonsterFamily, Painter> = { undead, demon, insect, construct, humanoid, ooze, elemental, aberration, plant, beast };

/** Default look for a family when no creature is named. */
const FAMILY_SPEC: Record<MonsterFamily, Omit<Spec, 'seed'>> = {
  undead: { skin: 0xd6cfb4, glow: 0x66ff99, eyes: 2, ornate: 0.5, wings: false },
  demon: { skin: 0x8e2f2a, glow: 0xff5020, eyes: 2, ornate: 0.6, wings: false },
  beast: { skin: 0x6a5238, glow: 0xffc040, eyes: 2, ornate: 0.3, wings: false },
  construct: { skin: 0x8b8f96, glow: 0xffaa22, eyes: 2, ornate: 0.5, wings: false },
  insect: { skin: 0x3d4a35, glow: 0x99ff33, eyes: 6, ornate: 0.6, wings: false },
  aberration: { skin: 0x4a2a6e, glow: 0xff40e0, eyes: 7, ornate: 0.7, wings: false },
  elemental: { skin: 0x3a6ea8, glow: 0x40d0ff, eyes: 2, ornate: 0.6, wings: false },
  humanoid: { skin: 0x5a5244, glow: 0xff8822, eyes: 2, ornate: 0.5, wings: false },
  plant: { skin: 0x5a4a32, glow: 0x66ff88, eyes: 2, ornate: 0.5, wings: false },
  ooze: { skin: 0x4a5c30, glow: 0x99ff33, eyes: 5, ornate: 0.5, wings: false },
};

function paintPortrait(x: Ctx, family: MonsterFamily, spec: Spec): void {
  const S = 256;
  // Everything inside the medallion is painted through a clip, so nothing
  // spills past the rim.
  x.save();
  x.clip(circleP(128, 128, 124));
  const bg = x.createRadialGradient(128, 110, 10, 128, 128, 180);
  bg.addColorStop(0, css(mixC(sink(spec.glow, 0.7), 0x101014, 0.4)));
  bg.addColorStop(1, '#040406');
  x.fillStyle = bg;
  x.fillRect(0, 0, S, S);
  glow(x, 128, 110, 110, spec.glow, 0.22);
  texture(x, circleP(128, 128, 200), 'mottle', 0.25, 1.4);
  (PAINTERS[family] ?? humanoid)(x, spec, new Random(spec.seed));
  vignette(x, S, S, 0.7, 0.45);
  x.restore();
  // The round iron medallion.
  const rim = new Path2D();
  rim.arc(128, 128, 124, 0, Math.PI * 2);
  rim.moveTo(244, 128);
  rim.arc(128, 128, 116, 0, Math.PI * 2, true);
  solid(x, rim, IRON, { a: [10, 10], b: [246, 246], size: 1, outline: 1.5 });
  innerEdge(x, circleP(128, 128, 116), 'rgba(0,0,0,.85)', 8, 0, 2, 4);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rx = 128 + Math.cos(a) * 120;
    const ry = 128 + Math.sin(a) * 120;
    solid(x, circleP(rx, ry, 3), IRON, { a: [rx - 3, ry - 3], b: [rx + 3, ry + 3], size: 0.2, tex: null, outline: 0.8 });
  }
  glow(x, 128, 248, 14, spec.glow, 0.8);
}

const cache = new Map<string, string>();

function render(key: string, size: number, family: MonsterFamily, spec: Spec): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, x } = makeCanvas(size, size);
  x.scale(size / 256, size / 256);
  paintPortrait(x, family, spec);
  const uri = c.toDataURL('image/png');
  cache.set(key, uri);
  return uri;
}

function specFrom(visual: MonsterVisual | undefined, family: MonsterFamily, seed: number): Spec {
  const d = FAMILY_SPEC[family] ?? FAMILY_SPEC.humanoid;
  return {
    skin: paletteColor(visual?.palette, d.skin),
    glow: visual?.glow ?? d.glow,
    eyes: visual?.eyes ?? d.eyes,
    ornate: visual?.ornate ?? d.ornate,
    wings: visual?.wings ?? d.wings,
    seed,
  };
}

/** The intro-card portrait of one boss, by id or by its name. */
export function bossPortraitUri(idOrName: string, size = 128): string | null {
  const b = BOSSES.find((x) => x.id === idOrName || x.name === idOrName);
  if (!b) return null;
  return render(`boss|${b.id}|${size}`, size, b.family, specFrom(b.visual, b.family, hashString(b.id)));
}

/** A bestiary portrait for a monster family, optionally coloured by one monster's visual. */
export function familyPortraitUri(family: MonsterFamily, size = 128, visual?: MonsterVisual, key = ''): string {
  return render(`fam|${family}|${key}|${size}`, size, family, specFrom(visual, family, hashString(family + key)));
}

/** Every boss id, for sheets and tests. */
export function bossIds(): string[] {
  return BOSSES.map((b) => b.id);
}
