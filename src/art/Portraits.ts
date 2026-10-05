/**
 * SLAY — class portraits.
 *
 * One painted bust per class for character select, drawn with the same brush
 * box as the icons (`Paint.ts`): one key light from the top left, a coloured
 * back light in the class's own colour, a ramp-and-rim material on every
 * form. The faces are mostly shadow — hoods, helms, a skull — with lit eyes,
 * because a painted face that is nearly right reads worse than a silhouette
 * that is exactly right, and because this is a game about the dark.
 *
 * Painted once per class and size, cached as a data URI. A few milliseconds.
 */
import { flamePath, skullPath } from './Glyphs';
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
  grain,
  innerEdge,
  lift,
  makeCanvas,
  mat,
  polyP,
  rampOf,
  sink,
  smoothP,
  solid,
  spec,
  texture,
  vignette,
} from './Paint';

const S = 256;
const A: Pt = [60, 40];
const B: Pt = [200, 240];

/** Class colours: the back light, the ground, and the frame metal. */
const LOOK: Record<string, { light: number; ground: number; frame: Mat }> = {
  warden: { light: 0xe0b860, ground: 0x2a2216, frame: mat([0x121418, 0x2a2e35, 0x50575f, 0x858e98, 0xc8d0da], 0.8, 'hammered', 0.3) },
  pyromancer: { light: 0xff8a3a, ground: 0x2e1408, frame: rampOf(0x9a6030, 0.85, 'hammered', 0.3) },
  shadowblade: { light: 0x6ad8a0, ground: 0x0e1a16, frame: rampOf(0x2c3138, 0.9, 'brushed', 0.3) },
  stormcaller: { light: 0xb0c8ff, ground: 0x141a2e, frame: mat([0x1a1f27, 0x3a4350, 0x6a7686, 0xa9b5c5, 0xf0f6fc], 0.9, 'brushed', 0.25) },
  revenant: { light: 0x9ae0c8, ground: 0x14201c, frame: mat([0x2a241a, 0x5a5140, 0x9a8f74, 0xcdc3a3, 0xf6eed6], 0.15, 'mottle', 0.3) },
  ranger: { light: 0xc8d890, ground: 0x1a2012, frame: mat([0x1c120a, 0x3c2816, 0x694829, 0x946b42, 0xbf9466], 0.05, 'grain', 0.45) },
};

const STEEL = mat([0x1a1f27, 0x3a4350, 0x6a7686, 0xa9b5c5, 0xf0f6fc], 0.9, 'brushed', 0.25);
const GOLD = mat([0x342104, 0x765014, 0xbd8823, 0xedc45a, 0xfff3bd], 0.9, 'brushed', 0.15);
const BONE = mat([0x2a241a, 0x5a5140, 0x9a8f74, 0xcdc3a3, 0xf6eed6], 0.15, 'mottle', 0.3);
const LEATHER = mat([0x170f09, 0x382515, 0x5c3f25, 0x85603b, 0xab8560], 0.1, 'pores', 0.5);
const WOOD = mat([0x1c120a, 0x3c2816, 0x694829, 0x946b42, 0xbf9466], 0.05, 'grain', 0.45);

/** Shoulders and chest, the base every bust stands on. */
function shouldersP(w = 1, top = 176): Path2D {
  const c = 128;
  return smoothP(
    [
      [c - 120 * w, 262],
      [c - 112 * w, top + 30],
      [c - 84 * w, top + 4],
      [c - 34, top - 6],
      [c + 34, top - 6],
      [c + 84 * w, top + 4],
      [c + 112 * w, top + 30],
      [c + 120 * w, 262],
    ],
    0.35,
  );
}

/** A hood: peak above the head, falling to the shoulders, open at the face. */
function hoodP(peak = 46, w = 1): Path2D {
  return smoothP(
    [
      [128, peak],
      [128 + 46 * w, peak + 22],
      [128 + 60 * w, 120],
      [128 + 70 * w, 186],
      [128 + 40, 200],
      [128 - 40, 200],
      [128 - 70 * w, 186],
      [128 - 60 * w, 120],
      [128 - 46 * w, peak + 22],
    ],
    0.38,
  );
}

function faceHoleP(cy = 122, rx = 30, ry = 40): Path2D {
  return smoothP(
    [
      [128, cy - ry],
      [128 + rx, cy - ry * 0.4],
      [128 + rx * 0.86, cy + ry * 0.55],
      [128, cy + ry],
      [128 - rx * 0.86, cy + ry * 0.55],
      [128 - rx, cy - ry * 0.4],
    ],
    0.4,
  );
}

/** A shadowed opening with two lit eyes in it. */
function shadowFace(x: Ctx, hole: Path2D, eyeY: number, eye: number, spread = 12): void {
  const g = x.createRadialGradient(118, eyeY - 10, 4, 128, eyeY + 10, 50);
  g.addColorStop(0, css(sink(eye, 0.8)));
  g.addColorStop(1, '#040305');
  x.fillStyle = g;
  x.fill(hole);
  innerEdge(x, hole, 'rgba(0,0,0,.9)', 10, 0, -4, 6);
  for (const s of [-1, 1]) {
    glow(x, 128 + s * spread, eyeY, 14, eye, 0.9);
    x.fillStyle = css(lift(eye, 0.6));
    x.beginPath();
    x.ellipse(128 + s * spread, eyeY, 4.2, 2.2, s * -0.15, 0, Math.PI * 2);
    x.fill();
  }
}

function drawWarden(x: Ctx, light: number): void {
  // Plate shoulders, a gold-trimmed breastplate and a great helm with a burning slit.
  const body = shouldersP(1.02, 180);
  solid(x, body, STEEL, { a: A, b: B, size: 1.6, rim: 0.6 });
  const cloak = smoothP([[8, 262], [14, 214], [36, 196], [60, 262]], 0.4);
  solid(x, cloak, rampOf(0x7a1c18, 0.1, 'weave', 0.3), { a: A, b: B, size: 2 });
  const cloak2 = smoothP([[248, 262], [242, 214], [220, 196], [196, 262]], 0.4);
  solid(x, cloak2, rampOf(0x7a1c18, 0.1, 'weave', 0.3), { a: A, b: B, size: 2 });
  for (const s of [-1, 1]) {
    const pl = ellipseP(128 + s * 78, 196, 46, 30, s * 0.25);
    solid(x, pl, STEEL, { a: [128 + s * 78 - 30, 170], b: [128 + s * 78 + 30, 226], size: 1.4 });
    const trim = ellipseP(128 + s * 78, 199, 40, 24, s * 0.25);
    x.save();
    x.lineWidth = 3;
    x.strokeStyle = css(GOLD.c[3]);
    x.stroke(trim);
    x.restore();
    spec(x, 128 + s * 78 - 14, 184, 18, 6, -0.3, 0.7);
  }
  const ridge = polyP([[124, 196], [132, 196], [136, 262], [120, 262]]);
  solid(x, ridge, GOLD, { a: [120, 196], b: [136, 262], size: 1.5 });
  // Gorget and helm.
  solid(x, ellipseP(128, 184, 40, 16), STEEL, { a: [90, 170], b: [168, 200], size: 2 });
  const helm = smoothP([[128, 44], [166, 60], [174, 110], [170, 172], [128, 186], [86, 172], [82, 110], [90, 60]], 0.35);
  solid(x, helm, STEEL, { a: [84, 46], b: [176, 186], size: 1.6, rim: 0.8 });
  const crest = smoothP([[124, 40], [132, 40], [134, 120], [122, 120]], 0.3);
  solid(x, crest, GOLD, { a: [122, 40], b: [134, 120], size: 1.2 });
  // T-slit, warm light behind it.
  const slit = polyP([[94, 110], [162, 110], [160, 120], [134, 120], [134, 160], [122, 160], [122, 120], [96, 120]]);
  x.fillStyle = '#060406';
  x.fill(slit);
  x.save();
  x.clip(slit);
  glow(x, 112, 115, 20, light, 1);
  glow(x, 144, 115, 20, light, 1);
  x.restore();
  for (let i = 0; i < 5; i++) {
    x.fillStyle = 'rgba(0,0,0,.8)';
    x.beginPath();
    x.arc(104 + i * 6, 146 + (i % 2) * 6, 1.8, 0, Math.PI * 2);
    x.arc(152 - i * 6, 146 + (i % 2) * 6, 1.8, 0, Math.PI * 2);
    x.fill();
  }
  spec(x, 104, 70, 22, 8, -0.6, 0.8);
  glint(x, 110, 64, 9);
}

function drawPyromancer(x: Ctx, light: number): void {
  const robe = rampOf(0x8a2e18, 0.05, 'weave', 0.35);
  solid(x, shouldersP(0.98, 184), robe, { a: A, b: B, size: 1.6 });
  // Gold-embroidered collar edges, then the hood.
  const hood = hoodP(40, 1.05);
  solid(x, hood, rampOf(0x6a2210, 0.05, 'weave', 0.35), { a: [70, 40], b: [190, 200], size: 1.6, rim: 0.5 });
  x.save();
  x.lineWidth = 3;
  x.strokeStyle = css(GOLD.c[3], 0.9);
  const edge = faceHoleP(124, 36, 48);
  x.stroke(edge);
  x.restore();
  shadowFace(x, faceHoleP(124, 33, 45), 118, light, 11);
  // A flame cupped in a raised hand, lighting the hood from below.
  glow(x, 70, 214, 70, light, 0.55);
  const hand = smoothP([[50, 262], [52, 232], [60, 222], [82, 224], [90, 238], [86, 262]], 0.35);
  solid(x, hand, rampOf(0x8a3a1c, 0.05, 'weave', 0.3), { a: [96, 200], b: [44, 262], size: 1.5, rimColor: light, rim: 1 });
  const flame = flamePath(70, 178, 0.85);
  x.save();
  x.shadowColor = css(light);
  x.shadowBlur = 24;
  const fg = x.createRadialGradient(70, 194, 2, 70, 178, 44);
  fg.addColorStop(0, '#ffffff');
  fg.addColorStop(0.3, css(0xffe08a));
  fg.addColorStop(0.7, css(light));
  fg.addColorStop(1, css(sink(light, 0.4)));
  x.fillStyle = fg;
  x.fill(flame);
  x.restore();
  innerEdge(x, hood, css(light, 0.7), 10, -6, 8, 4);
}

function drawShadowblade(x: Ctx, light: number): void {
  // Two daggers crossed behind the shoulders.
  for (const s of [-1, 1]) {
    x.save();
    x.translate(128 + s * 64, 150);
    x.rotate(s * -0.55);
    const blade = polyP([[0, -110], [8, -86], [7, -20], [-7, -20], [-8, -86]]);
    solid(x, blade, STEEL, { a: [-8, -110], b: [8, -20], size: 1.5 });
    solid(x, polyP([[-16, -22], [16, -22], [16, -14], [-16, -14]]), GOLD, { a: [-16, -22], b: [16, -14], size: 1 });
    x.restore();
  }
  const leather = rampOf(0x2a2a2e, 0.15, 'pores', 0.45);
  solid(x, shouldersP(0.96, 182), leather, { a: A, b: B, size: 1.6, rimColor: light, rim: 0.5 });
  // Crossed straps.
  for (const s of [-1, 1]) {
    const strap = polyP([[128 + s * 80, 188], [128 + s * 66, 186], [128 - s * 40, 262], [128 - s * 56, 262]]);
    solid(x, strap, LEATHER, { a: A, b: B, size: 1.2 });
  }
  const hood = hoodP(44, 0.95);
  solid(x, hood, rampOf(0x1e2226, 0.1, 'weave', 0.3), { a: [70, 44], b: [190, 200], size: 1.6, rimColor: light, rim: 0.6 });
  shadowFace(x, faceHoleP(122, 30, 42), 114, light, 11);
  // A mask across the lower face.
  const mask = smoothP([[96, 126], [160, 126], [156, 160], [128, 170], [100, 160]], 0.35);
  solid(x, mask, mat([0x050506, 0x0c0d10, 0x17191e, 0x262a30, 0x40464e], 0.1, 'weave', 0.15), { a: [96, 126], b: [160, 170], size: 1.5, rimColor: light, rim: 0.4 });
  innerEdge(x, hood, css(light, 0.6), 10, 8, -2, 3);
}

function drawStormcaller(x: Ctx, light: number): void {
  // A high collared coat, pale hair streaming, a silver circlet and lightning.
  const coat = rampOf(0x2a3a66, 0.15, 'weave', 0.3);
  solid(x, shouldersP(1, 184), coat, { a: A, b: B, size: 1.6, rimColor: light, rim: 0.6 });
  for (const s of [-1, 1]) {
    const collar = polyP([[128 + s * 30, 196], [128 + s * 70, 150], [128 + s * 76, 196], [128 + s * 44, 222]]);
    solid(x, collar, coat, { a: [90, 150], b: [170, 222], size: 1.5 });
    x.save();
    x.lineWidth = 2;
    x.strokeStyle = css(STEEL.c[4], 0.8);
    x.stroke(collar);
    x.restore();
  }
  const hair = smoothP([[128, 52], [176, 70], [196, 140], [200, 200], [170, 186], [160, 130], [128, 112], [96, 130], [86, 186], [56, 200], [60, 140], [80, 70]], 0.4);
  solid(x, hair, rampOf(0xc8ccd8, 0.2, 'grain', 0.6), { a: [80, 52], b: [200, 200], size: 1.6 });
  // The face, lit cold from the storm.
  const face = smoothP([[128, 74], [154, 92], [156, 134], [140, 162], [128, 168], [116, 162], [100, 134], [102, 92]], 0.4);
  solid(x, face, rampOf(0xb8a69c, 0.05, 'fine', 0.15), { a: [100, 74], b: [156, 168], size: 2, rimColor: light, rim: 0.9 });
  shadowPool(x, 128, 118, 30, 12, 0.55);
  for (const s of [-1, 1]) {
    glow(x, 128 + s * 12, 116, 12, light, 1);
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.ellipse(128 + s * 12, 116, 4, 2, 0, 0, Math.PI * 2);
    x.fill();
  }
  const circ = smoothP([[98, 98], [128, 86], [158, 98], [158, 104], [128, 92], [98, 104]], 0.3);
  solid(x, circ, STEEL, { a: [98, 86], b: [158, 104], size: 1 });
  glint(x, 128, 90, 8, light);
  // Lightning forking off the shoulders.
  for (const [sx, sy, dir] of [[40, 176, -1], [216, 170, 1]] as const) {
    const p = new Path2D();
    p.moveTo(sx, sy);
    p.lineTo(sx + dir * 10, sy - 30);
    p.lineTo(sx - dir * 2, sy - 44);
    p.lineTo(sx + dir * 14, sy - 86);
    p.moveTo(sx - dir * 2, sy - 44);
    p.lineTo(sx - dir * 16, sy - 60);
    emissiveStroke(x, p, light, 3, 1);
    x.save();
    x.strokeStyle = '#ffffff';
    x.lineWidth = 1.2;
    x.stroke(p);
    x.restore();
  }
}

function shadowPool(x: Ctx, cx: number, cy: number, rx: number, ry: number, a: number): void {
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

function drawRevenant(x: Ctx, light: number): void {
  // A tattered shroud, a bare skull with a crown of bone, grave-light in the sockets.
  const shroud = rampOf(0x3a3e36, 0.05, 'weave', 0.4);
  const body = smoothP([[6, 262], [14, 214], [44, 186], [96, 172], [160, 172], [212, 186], [242, 214], [250, 262], [224, 250], [200, 262], [176, 248], [150, 262], [128, 250], [104, 262], [80, 248], [56, 262], [32, 250]], 0.3);
  solid(x, body, shroud, { a: A, b: B, size: 1.6, rimColor: light, rim: 0.5 });
  // Ribs glimpsed through the shroud.
  for (let i = 0; i < 4; i++) {
    const rib = smoothP([[100, 200 + i * 14], [128, 194 + i * 14], [156, 200 + i * 14], [156, 205 + i * 14], [128, 199 + i * 14], [100, 205 + i * 14]], 0.4);
    solid(x, rib, BONE, { a: [100, 190], b: [156, 210 + i * 14], size: 1, outline: 1 });
  }
  const crown = new Path2D();
  for (let i = 0; i < 7; i++) {
    const cx = 92 + i * 12;
    const h = i % 2 ? 22 : 34;
    crown.addPath(polyP([[cx - 5, 76], [cx, 76 - h], [cx + 5, 76]]));
  }
  solid(x, crown, BONE, { a: [80, 40], b: [176, 80], size: 1.2 });
  const skull = skullPath(128, 120, 46);
  solid(x, skull, BONE, { a: [84, 74], b: [172, 170], size: 1.6, rim: 0.8 });
  texture(x, skull, 'crack', 0.3, 1.2);
  for (const s of [-1, 1]) {
    const sock = ellipseP(128 + s * 17, 118, 11, 13, s * 0.2);
    x.fillStyle = '#050605';
    x.fill(sock);
    glow(x, 128 + s * 17, 120, 18, light, 1);
    x.fillStyle = css(lift(light, 0.6));
    x.beginPath();
    x.arc(128 + s * 17, 120, 3, 0, Math.PI * 2);
    x.fill();
  }
  x.fillStyle = '#050605';
  x.fill(polyP([[128, 132], [134, 146], [122, 146]]));
  for (let i = 0; i < 6; i++) {
    x.fillStyle = 'rgba(0,0,0,.7)';
    x.fillRect(110 + i * 6.4, 156, 1.6, 9);
  }
  glow(x, 128, 210, 60, light, 0.25);
}

function drawRanger(x: Ctx, light: number): void {
  // A bow over one shoulder, fletching over the other, a deep green hood.
  x.save();
  x.lineCap = 'round';
  const bow = new Path2D();
  bow.moveTo(44, 250);
  bow.quadraticCurveTo(12, 120, 92, 22);
  x.lineWidth = 11;
  x.strokeStyle = css(WOOD.c[0]);
  x.stroke(bow);
  x.lineWidth = 7;
  x.strokeStyle = css(WOOD.c[2]);
  x.stroke(bow);
  x.lineWidth = 2;
  x.strokeStyle = css(WOOD.c[4], 0.8);
  x.stroke(bow);
  x.lineWidth = 1;
  x.strokeStyle = 'rgba(230,220,200,.7)';
  x.beginPath();
  x.moveTo(44, 250);
  x.lineTo(92, 22);
  x.stroke();
  x.restore();
  for (let i = 0; i < 4; i++) {
    const fx = 176 + i * 10;
    const fy = 40 + (i % 2) * 8;
    solid(x, rrect(fx - 2, fy, 4, 90), WOOD, { a: [fx - 2, fy], b: [fx + 2, fy + 90], size: 0.6, outline: 0.8 });
    const fl = smoothP([[fx, fy - 18], [fx + 7, fy - 4], [fx + 4, fy + 14], [fx - 4, fy + 14], [fx - 7, fy - 4]], 0.4);
    solid(x, fl, rampOf(i % 2 ? 0xd8d0c0 : 0x8a2a20, 0, 'fine', 0.2), { a: [fx - 7, fy - 18], b: [fx + 7, fy + 14], size: 0.8 });
  }
  const cloak = rampOf(0x3a4a26, 0.05, 'weave', 0.4);
  solid(x, shouldersP(1, 184), LEATHER, { a: A, b: B, size: 1.6 });
  const mantle = smoothP([[12, 262], [20, 210], [70, 184], [186, 184], [236, 210], [244, 262], [200, 236], [128, 246], [56, 236]], 0.35);
  solid(x, mantle, cloak, { a: A, b: B, size: 1.6, rimColor: light, rim: 0.5 });
  const hood = hoodP(42, 1);
  solid(x, hood, cloak, { a: [70, 42], b: [190, 200], size: 1.6, rimColor: light, rim: 0.5 });
  shadowFace(x, faceHoleP(124, 30, 42), 116, light, 11);
  // A leaf brooch at the throat.
  solid(x, smoothP([[128, 186], [138, 196], [128, 210], [118, 196]], 0.4), GOLD, { a: [118, 186], b: [138, 210], size: 1 });
  glint(x, 125, 192, 7);
}

function rrect(x: number, y: number, w: number, h: number): Path2D {
  const p = new Path2D();
  p.rect(x, y, w, h);
  return p;
}

const DRAW: Record<string, (x: Ctx, light: number) => void> = {
  warden: drawWarden,
  pyromancer: drawPyromancer,
  shadowblade: drawShadowblade,
  stormcaller: drawStormcaller,
  revenant: drawRevenant,
  ranger: drawRanger,
};

/** Paints the portrait for `classId` onto a 256px square context. */
export function paintClassPortrait(x: Ctx, classId: string): void {
  const look = LOOK[classId] ?? LOOK.warden!;
  const inner = smoothP([[128, 8], [210, 30], [244, 110], [244, 248], [12, 248], [12, 110], [46, 30]], 0.32);
  // Painted through the arch, so the corners stay clear and nothing spills.
  x.save();
  x.clip(inner);
  // Ground: the class's dark, a back light behind the head, grain.
  const bg = x.createRadialGradient(128, 100, 10, 128, 140, 190);
  bg.addColorStop(0, css(lift(look.ground, 0.25)));
  bg.addColorStop(0.55, css(look.ground));
  bg.addColorStop(1, '#050507');
  x.fillStyle = bg;
  x.fillRect(0, 0, S, S);
  glow(x, 128, 96, 120, look.light, 0.35);
  texture(x, circleP(128, 128, 200), 'mottle', 0.25, 1.6);
  (DRAW[classId] ?? drawWarden)(x, look.light);
  vignette(x, S, S, 0.65, 0.5);
  grain(x, S, S, 0.12);
  x.restore();
  // An arched frame in the class metal.
  x.save();
  x.lineJoin = 'round';
  x.lineWidth = 7;
  x.strokeStyle = css(look.frame.c[1]);
  x.stroke(inner);
  x.lineWidth = 4;
  x.strokeStyle = css(look.frame.c[3]);
  x.stroke(inner);
  x.lineWidth = 1;
  x.strokeStyle = css(look.frame.c[4], 0.8);
  x.translate(-1, -1);
  x.stroke(inner);
  x.restore();
  glint(x, 128, 9, 9, look.light);
}

const cache = new Map<string, string>();

/** A cached data URI of the class portrait, `size` pixels square. */
export function classPortraitUri(classId: string, size = 256): string {
  const key = `${classId}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, x } = makeCanvas(size, size);
  x.scale(size / S, size / S);
  paintClassPortrait(x, classId);
  const uri = c.toDataURL('image/png');
  cache.set(key, uri);
  return uri;
}
