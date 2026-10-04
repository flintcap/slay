/**
 * SLAY — armour and off-hand icon painters.
 *
 * Upright frame, centred, key light from the top left. Each family branches on
 * its authored sub-type: a leather jerkin, a mail hauberk, a plate cuirass, a
 * robe and a scale coat are five silhouettes. Rarity adds trim, studs, stones,
 * heraldry and finally glowing runes — on the object, not around it.
 */
import { type K, MATS, filigree, curl, maybeStone, rivet, runeMark, setStone, upright } from './IconKit';
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
  innerEdge,
  lift,
  polyP,
  rampOf,
  rrectP,
  shadowPool,
  sink,
  smoothP,
  solid,
  spec,
  texture,
} from './Paint';

type Painter = (k: K) => void;

/** Mirror a list of right-side points to make a symmetric closed outline. */
function sym(right: Pt[]): Pt[] {
  const left = right.slice().reverse().map(([x, y]) => [-x, y] as Pt);
  return [...right, ...left];
}

function metalOr(k: K, fallback: string): Mat {
  return k.pal.startsWith('metal') ? k.m : MATS[fallback]!;
}

// ---------------------------------------------------------------------------
// Shields
// ---------------------------------------------------------------------------

/** A painted heraldic device in the shield's field, by hash. */
function heraldry(k: K, field: Path2D, w: number, h: number, cy: number): void {
  if (k.rank < 1) return;
  const x = k.x;
  const col = k.rank >= 2 ? k.stone : 0x2a4a9a;
  const paint = rampOf(sink(col, 0.25), 0, 'mottle', 0.3);
  x.save();
  x.clip(field);
  const v = (k.h >>> 5) % 4;
  let p: Path2D;
  if (v === 0) p = polyP([[-w, cy - h * 0.1], [0, cy + h * 0.35], [w, cy - h * 0.1], [w, cy + h * 0.15], [0, cy + h * 0.6], [-w, cy + h * 0.15]]);
  else if (v === 1) p = rrectP(-w * 0.18, cy - h, w * 0.36, h * 2, 0);
  else if (v === 2) p = polyP([[-w, cy - h], [0, cy - h], [0, cy + h], [-w, cy + h]]);
  else {
    p = rrectP(-w * 0.16, cy - h, w * 0.32, h * 2, 0);
    p.addPath(rrectP(-w, cy - h * 0.2, w * 2, h * 0.32, 0));
  }
  x.globalAlpha = 0.85;
  solid(x, p, paint, { a: [-w, cy - h], b: [w, cy + h], outline: 0, ao: 0.2, rim: 0, size: 0.6 });
  x.restore();
}

const shieldLike: Painter = (k) => {
  const sub = k.sub;
  upright(k.x, () => {
    const x = k.x;
    if (sub === 'buckler' || sub === 'round') {
      const r = sub === 'buckler' ? 44 : 52;
      const face = circleP(0, 0, r);
      const fm = sub === 'buckler' && k.pal.startsWith('wood') ? k.m : k.m;
      solid(x, face, fm, { a: [-r, -r], b: [r, r], size: 1.6, texScale: 0.9 });
      if (fm.tex === 'grain') {
        // Planks.
        x.save();
        x.clip(face);
        for (let i = -2; i <= 2; i++) {
          x.beginPath();
          x.moveTo(i * r * 0.36, -r);
          x.lineTo(i * r * 0.36, r);
          x.strokeStyle = 'rgba(0,0,0,.45)';
          x.lineWidth = 1.4;
          x.stroke();
        }
        x.restore();
      } else heraldry(k, circleP(0, 0, r - 6), r, r, 0);
      // Rim.
      const rimM = k.rank >= 1 ? k.trim : MATS['metal.iron']!;
      const rim = new Path2D();
      rim.arc(0, 0, r, 0, Math.PI * 2);
      rim.moveTo(r - 6, 0);
      rim.arc(0, 0, r - 6, 0, Math.PI * 2, true);
      solid(x, rim, rimM, { a: [-r, -r], b: [r, r], tex: null, size: 0.8, ao: 0.3 });
      const n = sub === 'buckler' ? 8 : 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        rivet(k, Math.cos(a) * (r - 3), Math.sin(a) * (r - 3), 2, rimM);
      }
      // Boss.
      const br = sub === 'buckler' ? 15 : 13;
      solid(x, circleP(0, 0, br), metalOr(k, 'metal.iron'), { a: [-br, -br], b: [br, br], tex: null, size: 0.8 });
      spec(x, -br * 0.35, -br * 0.4, br * 0.5, br * 0.3, -0.7, 0.85);
      if (k.rank >= 2) setStone(k, 0, 0, 5.5);
      if (k.rank >= 4) for (let i = 0; i < 4; i++) runeMark(k, Math.cos(i * 1.57 + 0.78) * r * 0.6, Math.sin(i * 1.57 + 0.78) * r * 0.6, 5, k.glowC, k.h + i * 31);
      return;
    }
    if (sub === 'bone') {
      // Ribs lashed into a round, a skull at the boss.
      const bone = MATS['bone.pale']!;
      const r = 50;
      const back = circleP(0, 0, r);
      solid(x, back, k.pal.startsWith('flesh') ? k.m : MATS['leather.dark']!, { a: [-r, -r], b: [r, r], size: 1.6 });
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.33;
        const rib = new Path2D();
        rib.moveTo(Math.cos(a) * 12, Math.sin(a) * 12);
        rib.quadraticCurveTo(Math.cos(a + 0.18) * 34, Math.sin(a + 0.18) * 34, Math.cos(a) * (r - 2), Math.sin(a) * (r - 2));
        x.save();
        x.lineCap = 'round';
        x.strokeStyle = css(bone.c[0]);
        x.lineWidth = 7.5;
        x.stroke(rib);
        x.strokeStyle = css(bone.c[2]);
        x.lineWidth = 5.5;
        x.stroke(rib);
        x.strokeStyle = css(bone.c[4], 0.7);
        x.lineWidth = 1.6;
        x.stroke(rib);
        x.restore();
      }
      const lash = new Path2D();
      lash.arc(0, 0, r - 4, 0, Math.PI * 2);
      x.save();
      x.setLineDash([5, 4]);
      x.strokeStyle = css(MATS['leather.worn']!.c[3]);
      x.lineWidth = 3;
      x.stroke(lash);
      x.restore();
      skull(k, 0, 6, 20, bone);
      if (k.rank >= 2) for (const ex of [-7, 7]) glow(x, ex, 4, 7, k.glowC, 0.9);
      return;
    }
    // Kite and tower: tall heater/rect shapes with a painted field.
    const tower = sub === 'tower';
    const W = tower ? 42 : 46;
    const outline = tower
      ? rrectP(-W, -58, W * 2, 116, 12)
      : smoothP([[0, -58], [W * 0.75, -56], [W, -44], [W * 0.92, -6], [W * 0.5, 34], [0, 60], [-W * 0.5, 34], [-W * 0.92, -6], [-W, -44], [-W * 0.75, -56]], 0.3);
    solid(x, outline, metalOr(k, 'metal.steel'), { a: [-W, -58], b: [W, 60], size: 1.6 });
    const inner = tower ? rrectP(-W + 6, -52, W * 2 - 12, 104, 8) : smoothP([[0, -51], [W * 0.68, -49], [W - 7, -40], [W * 0.85 - 6, -6], [W * 0.45 - 4, 30], [0, 52], [-W * 0.45 + 4, 30], [-W * 0.85 + 6, -6], [-W + 7, -40], [-W * 0.68, -49]], 0.3);
    heraldry(k, inner, W, 52, -6);
    // Rim line and rivets.
    const rimM = k.rank >= 1 ? k.trim : MATS['metal.dark']!;
    x.save();
    x.lineJoin = 'round';
    x.strokeStyle = css(rimM.c[0]);
    x.lineWidth = 6;
    x.stroke(inner);
    x.strokeStyle = css(rimM.c[2]);
    x.lineWidth = 3.6;
    x.stroke(inner);
    x.translate(-0.7, -0.7);
    x.strokeStyle = css(rimM.c[4], 0.7);
    x.lineWidth = 1.2;
    x.stroke(inner);
    x.restore();
    if (tower) {
      for (const yy of [-36, 0, 36]) {
        for (const xx of [-W + 10, W - 10]) rivet(k, xx, yy, 2.4, rimM);
      }
      solid(x, rrectP(-6, -30, 12, 50, 4), rimM, { a: [-6, -30], b: [6, 20], tex: null, size: 0.6 });
    }
    const bossM = metalOr(k, 'metal.iron');
    solid(x, circleP(0, -8, 11), bossM, { a: [-11, -19], b: [11, 3], tex: null, size: 0.8 });
    spec(x, -4, -12, 5, 3, -0.7, 0.85);
    if (k.ornate > 0.35) {
      filigree(k, curl(-18, -36, 8, 1, 0), 1.4, rimM);
      filigree(k, curl(18, -36, 8, -1, Math.PI), 1.4, rimM);
    }
    if (k.rank >= 2) setStone(k, 0, -8, 5);
    if (k.rank >= 4) runeMark(k, 0, 24, 9);
    glint(x, -W * 0.6, -48, 7, 0xffffff, 0.6);
  });
};

function skull(k: K, cx: number, cy: number, s: number, bone: Mat): void {
  const x = k.x;
  const p = smoothP([[cx, cy - s], [cx + s * 0.85, cy - s * 0.55], [cx + s * 0.9, cy + s * 0.15], [cx + s * 0.5, cy + s * 0.5], [cx + s * 0.4, cy + s * 0.95], [cx - s * 0.4, cy + s * 0.95], [cx - s * 0.5, cy + s * 0.5], [cx - s * 0.9, cy + s * 0.15], [cx - s * 0.85, cy - s * 0.55]], 0.4);
  solid(x, p, bone, { a: [cx - s, cy - s], b: [cx + s, cy + s], size: s / 18 });
  x.save();
  x.fillStyle = '#100b08';
  for (const sx of [-1, 1]) {
    x.beginPath();
    x.ellipse(cx + sx * s * 0.38, cy + s * 0.05, s * 0.24, s * 0.28, sx * 0.2, 0, Math.PI * 2);
    x.fill();
  }
  x.beginPath();
  x.moveTo(cx, cy + s * 0.35);
  x.lineTo(cx - s * 0.1, cy + s * 0.55);
  x.lineTo(cx + s * 0.1, cy + s * 0.55);
  x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(16,11,8,.85)';
  x.lineWidth = Math.max(0.8, s * 0.06);
  for (let i = -2; i <= 2; i++) {
    x.beginPath();
    x.moveTo(cx + i * s * 0.14, cy + s * 0.68);
    x.lineTo(cx + i * s * 0.14, cy + s * 0.92);
    x.stroke();
  }
  x.restore();
}

// ---------------------------------------------------------------------------
// Orbs
// ---------------------------------------------------------------------------

const orbLike: Painter = (k) => {
  const sub = k.sub;
  const color = k.baseGlow ?? (k.pal === 'crystal.void' ? 0x8a50e0 : k.pal.startsWith('flesh') ? 0xc04040 : 0x60a8ff);
  upright(k.x, () => {
    const x = k.x;
    const cy = -6;
    const r = 34;
    // Claw cradle behind.
    const claw = k.rank >= 1 ? k.trim : MATS['metal.dark']!;
    shadowPool(x, 0, 50, 30, 7, 0.5);
    const stem = smoothP([[-10, 34], [10, 34], [7, 44], [16, 54], [-16, 54], [-7, 44]], 0.3);
    solid(x, stem, claw, { a: [-16, 34], b: [16, 54], tex: null, size: 0.8 });
    glow(x, 0, cy, r * 1.9, color, k.rank >= 4 ? 0.65 : 0.4);
    if (sub === 'faceted') {
      const pts: Pt[] = [];
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
        pts.push([Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      gem(x, 0, cy, r, color, 'round', { fire: 1, glow: 0.3 });
    } else {
      const om = k.pal.startsWith('flesh') ? k.m : rampOf(color, 0.4, null, 0);
      const ball = circleP(0, cy, r);
      const g = x.createRadialGradient(-r * 0.35, cy - r * 0.4, r * 0.05, 0, cy, r);
      g.addColorStop(0, css(lift(color, 0.75)));
      g.addColorStop(0.3, css(om.c[3]));
      g.addColorStop(0.7, css(om.c[1]));
      g.addColorStop(1, css(om.c[0]));
      x.fillStyle = g;
      x.fill(ball);
      // A storm inside the glass.
      x.save();
      x.clip(ball);
      if (k.pal.startsWith('flesh')) texture(x, ball, 'mottle', 0.6, 0.8);
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const sw = new Path2D();
        const a0 = i * 2.1 + (k.h & 7);
        for (let t = 0; t <= 30; t++) {
          const a = a0 + t * 0.18;
          const rr = r * (0.15 + t / 42);
          const px = Math.cos(a) * rr;
          const py = cy + Math.sin(a) * rr * 0.8;
          if (t === 0) sw.moveTo(px, py);
          else sw.lineTo(px, py);
        }
        x.strokeStyle = css(lift(color, 0.4), 0.35);
        x.lineWidth = 2.4 - i * 0.5;
        x.stroke(sw);
      }
      glow(x, 0, cy + 4, r * 0.55, lift(color, 0.5), 0.8);
      if (sub === 'rune') {
        for (let i = 0; i < 5; i++) {
          const a = -0.4 + i * 0.4;
          runeMark(k, Math.sin(a) * r * 0.8, cy + 6 + Math.cos(a * 2) * 3, 5, lift(color, 0.3), k.h + i * 13, 0.9);
        }
      }
      x.restore();
      innerEdge(x, ball, css(om.c[0], 0.8), 8, -3, -4, 3);
      x.save();
      x.lineWidth = 1.6;
      x.strokeStyle = 'rgba(8,6,10,.9)';
      x.stroke(ball);
      x.restore();
      spec(x, -r * 0.38, cy - r * 0.42, r * 0.38, r * 0.2, -0.7, 0.95);
      glint(x, -r * 0.45, cy - r * 0.45, 8, 0xffffff, 0.8);
    }
    // Claws in front.
    for (const s of [-1, 0, 1]) {
      const c = new Path2D();
      c.moveTo(s * 6, 36);
      c.quadraticCurveTo(s * 30 + (s === 0 ? 0 : 0), 30, s * 26, s === 0 ? 24 : 6);
      if (s === 0) continue;
      filigree(k, c, 3.2, claw);
    }
    if (k.rank >= 2) setStone(k, 0, 40, 3.6);
  });
};

// ---------------------------------------------------------------------------
// Helms
// ---------------------------------------------------------------------------

const helmLike: Painter = (k) => {
  const sub = k.sub;
  upright(k.x, () => {
    const x = k.x;
    if (sub === 'circlet') {
      // A circlet in three-quarter view, a stone at the brow.
      const m = k.pal.startsWith('metal') ? k.m : MATS['metal.gold']!;
      const back = new Path2D();
      back.ellipse(0, 6, 46, 20, 0, Math.PI, Math.PI * 2);
      x.save();
      x.lineWidth = 9;
      x.strokeStyle = css(m.c[0]);
      x.stroke(back);
      x.lineWidth = 6;
      x.strokeStyle = css(m.c[1]);
      x.stroke(back);
      x.restore();
      const front = new Path2D();
      front.ellipse(0, 6, 46, 20, 0, 0, Math.PI);
      front.lineTo(-38, 2);
      front.ellipse(0, 4, 38, 14, 0, Math.PI, 0, true);
      front.closePath();
      const band = new Path2D();
      band.ellipse(0, 6, 46, 20, 0, -0.05, Math.PI + 0.05);
      band.ellipse(0, -2, 46, 20, 0, Math.PI + 0.05, -0.05, true);
      band.closePath();
      solid(x, band, m, { a: [-46, 0], b: [46, 20], tex: null, size: 0.9 });
      // Brow points.
      const pts = k.ornate > 0.4 ? 5 : 3;
      for (let i = 0; i < pts; i++) {
        const px = (i - (pts - 1) / 2) * 15;
        const yb = 18 - Math.abs(px) * 0.12;
        const h = i === (pts - 1) / 2 ? 30 : 18;
        solid(x, polyP([[px - 6, yb - 6], [px, yb - h], [px + 6, yb - 6]]), m, { a: [px - 6, yb - h], b: [px + 6, yb], tex: null, size: 0.5 });
      }
      setStone(k, 0, 12, k.rank >= 2 ? 7 : 5.5);
      if (k.rank < 2) gem(x, 0, 12, 5.5, k.baseGlow ?? 0x60b0ff, 'oval');
      glint(x, -26, 4, 6, 0xffffff, 0.7);
      return;
    }
    if (sub === 'cap') {
      const m = k.m;
      const dome = smoothP([[-40, 14], [-38, -16], [-22, -38], [0, -44], [22, -38], [38, -16], [40, 14]], 0.35, false);
      dome.closePath();
      solid(x, dome, m, { a: [-40, -44], b: [40, 14], size: 1.4 });
      if (m.tex === 'pores') {
        // Leather panels stitched together.
        x.save();
        x.clip(dome);
        x.setLineDash([3, 2.5]);
        x.strokeStyle = css(m.c[4], 0.55);
        x.lineWidth = 1;
        for (const s of [-1, 0, 1]) {
          x.beginPath();
          x.moveTo(s * 20, 14);
          x.quadraticCurveTo(s * 18, -30, 0, -44);
          x.stroke();
        }
        x.restore();
      } else {
        // A riveted spangen frame.
        const fr = k.rank >= 1 ? k.trim : MATS['metal.dark']!;
        solid(x, rrectP(-4, -44, 8, 56, 3), fr, { a: [-4, -44], b: [4, 12], tex: null, size: 0.5 });
        for (const yy of [-30, -10]) rivet(k, 0, yy, 2, fr);
      }
      // Brim band.
      const brim = rrectP(-44, 8, 88, 14, 6);
      solid(x, brim, k.rank >= 1 ? k.trim : sink(m.c[2], 0) === m.c[2] ? m : m, { a: [-44, 8], b: [44, 22], tex: null, size: 0.7 });
      for (let i = -3; i <= 3; i++) rivet(k, i * 12, 15, 2, k.rank >= 1 ? k.trim : MATS['metal.iron']!);
      // Nasal.
      if (!m.tex || m.metal > 0.5) solid(x, polyP([[-4, 20], [4, 20], [3, 44], [0, 48], [-3, 44]]), m, { a: [-4, 20], b: [4, 48], tex: null, size: 0.4 });
      maybeStone(k, 0, -24, 4.5);
      if (k.rank >= 4) runeMark(k, -20, -14, 6);
      spec(x, -16, -26, 12, 5, -0.6, m.metal > 0.5 ? 0.7 : 0.2);
      return;
    }
    if (sub === 'horned') {
      const bone = MATS['bone.pale']!;
      // Horns behind the helm.
      for (const s of [-1, 1]) {
        const horn = smoothP([[s * 22, -18], [s * 44, -28], [s * 58, -50], [s * 56, -62], [s * 50, -48], [s * 36, -36], [s * 24, -4]], 0.4);
        solid(x, horn, bone, { a: [s * 60, -60], b: [s * 22, -4], size: 0.9 });
        x.save();
        x.clip(horn);
        for (let i = 0; i < 6; i++) {
          x.beginPath();
          x.arc(s * (30 + i * 4.5), -24 - i * 5, 9, 0, Math.PI * 2);
          x.strokeStyle = css(bone.c[0], 0.35);
          x.lineWidth = 1;
          x.stroke();
        }
        x.restore();
      }
      const m = k.pal.startsWith('bone') ? MATS['metal.dark']! : k.m;
      const shell = smoothP([[-34, 36], [-38, 0], [-30, -30], [0, -42], [30, -30], [38, 0], [34, 36], [14, 44], [-14, 44]], 0.4);
      solid(x, shell, m, { a: [-38, -42], b: [38, 44], size: 1.4 });
      // A skull face plate.
      skull(k, 0, 6, 24, bone);
      if (k.rank >= 1) for (const ex of [-9, 9]) glow(x, ex, 7, 8, k.glowC, k.rank >= 4 ? 1 : 0.6);
      maybeStone(k, 0, -26, 4.2);
      return;
    }
    // Full helm: a great helm with an eye slit and breaths.
    const m = k.m;
    const shell = smoothP([[-36, 46], [-40, 6], [-36, -26], [-18, -44], [0, -48], [18, -44], [36, -26], [40, 6], [36, 46], [0, 52]], 0.3);
    solid(x, shell, m, { a: [-40, -48], b: [40, 52], size: 1.5 });
    // Centre ridge.
    x.save();
    x.clip(shell);
    x.beginPath();
    x.moveTo(-1, -48);
    x.lineTo(-1, 52);
    x.strokeStyle = css(m.c[4], 0.6);
    x.lineWidth = 1.6;
    x.stroke();
    x.beginPath();
    x.moveTo(1.4, -48);
    x.lineTo(1.4, 52);
    x.strokeStyle = css(m.c[0], 0.6);
    x.lineWidth = 1.6;
    x.stroke();
    x.restore();
    // Eye slit.
    const slit = polyP([[-30, -6], [-3, -3], [-3, 2], [3, 2], [3, -3], [30, -6], [28, 3], [-28, 3]]);
    x.fillStyle = '#07060a';
    x.fill(slit);
    if (k.rank >= 3) {
      x.save();
      x.clip(slit);
      glow(x, -14, -1, 14, k.glowC, 0.9);
      glow(x, 14, -1, 14, k.glowC, 0.9);
      x.restore();
    }
    // Breaths.
    for (let i = 0; i < 4; i++) {
      for (const s of [-1, 1]) {
        x.beginPath();
        x.ellipse(s * (10 + i * 5), 20 + i * 4, 1.6, 2.6, 0, 0, Math.PI * 2);
        x.fillStyle = '#0a0809';
        x.fill();
      }
    }
    // Brow band.
    const bandM = k.rank >= 1 ? k.trim : MATS['metal.dark']!;
    const brow = new Path2D();
    brow.moveTo(-39, -14);
    brow.quadraticCurveTo(0, -24, 39, -14);
    brow.lineTo(39, -9);
    brow.quadraticCurveTo(0, -19, -39, -9);
    brow.closePath();
    solid(x, brow, bandM, { a: [-39, -24], b: [39, -9], tex: null, size: 0.6 });
    if (k.ornate > 0.35 || k.rank >= 3) {
      // Crest.
      const crest = smoothP([[-3, -46], [0, -64], [16, -70], [30, -62], [6, -52], [3, -46]], 0.4);
      solid(x, crest, k.rank >= 2 ? rampOf(k.stone, 0.1, 'weave', 0.3) : MATS['cloth.banner']!, { a: [0, -70], b: [30, -46], size: 0.7 });
    }
    maybeStone(k, 0, -18, 4.2);
    if (k.rank >= 4) runeMark(k, -20, 30, 6);
    spec(x, -20, -28, 12, 5, -0.8, 0.8);
  });
};

// ---------------------------------------------------------------------------
// Body armour
// ---------------------------------------------------------------------------

const chestLike: Painter = (k) => {
  const sub = k.sub;
  upright(k.x, () => {
    const x = k.x;
    const m = k.m;
    if (sub === 'robe') {
      // Hooded robe: wide sleeves, sash, deep hood shadow.
      const body = smoothP([[0, -46], [16, -44], [30, -36], [52, -6], [58, 18], [44, 22], [30, 0], [30, 58], [0, 62], [-30, 58], [-30, 0], [-44, 22], [-58, 18], [-52, -6], [-30, -36], [-16, -44]], 0.3);
      solid(x, body, m, { a: [-50, -46], b: [50, 62], size: 1.6, texScale: 0.7 });
      // Folds.
      x.save();
      x.clip(body);
      for (const fx of [-16, -4, 12]) {
        x.beginPath();
        x.moveTo(fx, 10);
        x.quadraticCurveTo(fx + 4, 36, fx - 2, 62);
        x.strokeStyle = css(m.c[0], 0.5);
        x.lineWidth = 3;
        x.stroke();
        x.beginPath();
        x.moveTo(fx + 3, 10);
        x.quadraticCurveTo(fx + 7, 36, fx + 1, 62);
        x.strokeStyle = css(m.c[4], 0.25);
        x.lineWidth = 1.5;
        x.stroke();
      }
      x.restore();
      // Hood opening.
      const hood = smoothP([[0, -44], [14, -40], [16, -26], [0, -16], [-16, -26], [-14, -40]], 0.5);
      solid(x, hood, m, { a: [-16, -44], b: [16, -16], size: 0.7 });
      x.fillStyle = 'rgba(6,4,8,.85)';
      x.fill(smoothP([[0, -38], [9, -34], [9, -26], [0, -21], [-9, -26], [-9, -34]], 0.5));
      // Trim down the front and on the cuffs.
      const tm = k.rank >= 1 ? k.trim : sink(m.c[2], 0.3) ? MATS['cloth.linen']! : m;
      const front = new Path2D();
      front.moveTo(0, -16);
      front.lineTo(0, 60);
      filigree(k, front, 3.4, k.rank >= 1 ? k.trim : MATS['metal.bronze']!);
      // Sash.
      const sash = polyP([[-30, 6], [30, 2], [31, 12], [-30, 16]]);
      solid(x, sash, k.rank >= 2 ? rampOf(k.stone, 0.1, 'weave', 0.3) : MATS['cloth.banner']!, { a: [-30, 2], b: [30, 16], size: 0.5 });
      void tm;
      maybeStone(k, 0, 9, 4.2);
      if (k.rank >= 4) for (let i = 0; i < 3; i++) runeMark(k, -18 + i * 18, 40, 5, k.glowC, k.h + i * 7);
      return;
    }
    // Shared torso silhouette for jerkin, mail, plate and scale.
    const mail = sub === 'mail';
    const torso = sym([[0, -40], [14, -42], [26, -38], [32, -16], [30, 14], [28, 44], [16, 52], [0, 54]]);
    const sleeves = mail || sub === 'leather' || sub === 'scale';
    if (sleeves) {
      for (const s of [-1, 1]) {
        const sl = polyP([[s * 26, -38], [s * 50, -22], [s * 56, 6], [s * 42, 12], [s * 34, -8]]);
        solid(x, sl, m, { a: [s * 56, -38], b: [s * 30, 12], tex: mail ? 'mail' : undefined, texAmt: mail ? 0.9 : undefined, texScale: 0.6, size: 1 });
      }
    }
    const tp = smoothP(torso, 0.25);
    const texKind = mail ? 'mail' : sub === 'scale' ? 'scales' : undefined;
    solid(x, tp, m, { a: [-32, -42], b: [32, 54], size: 1.6, tex: texKind, texAmt: texKind ? 0.85 : undefined, texScale: mail ? 0.6 : 0.8 });
    if (sub === 'plate') {
      // Sculpted cuirass: a keel down the centre, a fauld at the waist.
      x.save();
      x.clip(tp);
      const keel = x.createLinearGradient(-6, 0, 6, 0);
      keel.addColorStop(0, css(m.c[4], 0.5));
      keel.addColorStop(0.5, css(m.c[2], 0));
      keel.addColorStop(1, css(m.c[0], 0.45));
      x.fillStyle = keel;
      x.fillRect(-6, -40, 12, 70);
      for (let i = 0; i < 3; i++) {
        const y = 30 + i * 8;
        const lame = new Path2D();
        lame.moveTo(-30, y);
        lame.quadraticCurveTo(0, y + 6, 30, y);
        x.strokeStyle = css(m.c[0], 0.8);
        x.lineWidth = 2;
        x.stroke(lame);
        x.translate(0, 1.6);
        x.strokeStyle = css(m.c[4], 0.5);
        x.lineWidth = 1;
        x.stroke(lame);
        x.translate(0, -1.6);
      }
      x.restore();
      // Pauldrons, layered.
      for (const s of [-1, 1]) {
        for (let i = 2; i >= 0; i--) {
          const pl = ellipseP(s * (38 + i * 4), -32 + i * 10, 20 - i * 3, 12 - i * 2, s * 0.45);
          solid(x, pl, m, { a: [s * 56, -44], b: [s * 22, -10], tex: null, size: 0.9 });
        }
        if (k.rank >= 1) {
          const tr = new Path2D();
          tr.ellipse(s * 38, -32, 18, 10, s * 0.45, Math.PI * 1.05, Math.PI * 1.95);
          filigree(k, tr, 1.6);
        }
      }
      // Gorget.
      solid(x, smoothP([[-16, -42], [0, -36], [16, -42], [12, -32], [0, -28], [-12, -32]], 0.4), k.rank >= 1 ? k.trim : m, { a: [-16, -42], b: [16, -28], tex: null, size: 0.5 });
      if (k.ornate > 0.35) {
        filigree(k, curl(-12, -10, 9, 1, 0), 1.3);
        filigree(k, curl(12, -10, 9, -1, Math.PI), 1.3);
      }
      maybeStone(k, 0, -12, 5);
      if (k.rank >= 4) runeMark(k, 0, 12, 8);
      spec(x, -16, -20, 12, 6, -0.9, 0.7);
      return;
    }
    if (sub === 'leather') {
      // Lacing up the front, a stitched yoke, a belt.
      x.save();
      x.clip(tp);
      x.setLineDash([3, 2.5]);
      x.strokeStyle = css(m.c[4], 0.5);
      x.lineWidth = 1;
      const yoke = new Path2D();
      yoke.moveTo(-30, -18);
      yoke.quadraticCurveTo(0, -8, 30, -18);
      x.stroke(yoke);
      x.restore();
      x.fillStyle = 'rgba(8,6,4,.75)';
      x.fill(polyP([[-3, -36], [3, -36], [2, 0], [-2, 0]]));
      x.save();
      x.strokeStyle = css(MATS['cloth.linen']!.c[3]);
      x.lineWidth = 1.4;
      for (let i = 0; i < 5; i++) {
        const y = -32 + i * 7;
        x.beginPath();
        x.moveTo(-6, y);
        x.lineTo(6, y + 5);
        x.moveTo(6, y);
        x.lineTo(-6, y + 5);
        x.stroke();
      }
      x.restore();
      if (k.rank >= 1 || k.ornate > 0.2) {
        for (const [sx, sy] of [[-20, -26], [20, -26], [-22, 6], [22, 6], [-18, 26], [18, 26]] as const) rivet(k, sx, sy, 2.4, k.rank >= 1 ? k.trim : MATS['metal.iron']!);
      }
      const belt = rrectP(-30, 30, 60, 9, 2);
      solid(x, belt, MATS['leather.dark']!, { a: [-30, 30], b: [30, 39], size: 0.5 });
      solid(x, rrectP(-6, 28, 12, 13, 2), k.rank >= 1 ? k.trim : MATS['metal.iron']!, { a: [-6, 28], b: [6, 41], tex: null, size: 0.4 });
      maybeStone(k, 0, -8, 4.2);
      if (k.rank >= 4) runeMark(k, -16, 14, 6);
      return;
    }
    if (sub === 'scale') {
      solid(x, smoothP([[-16, -42], [0, -36], [16, -42], [12, -32], [0, -28], [-12, -32]], 0.4), k.rank >= 1 ? k.trim : MATS['leather.dark']!, { a: [-16, -42], b: [16, -28], tex: null, size: 0.5 });
      maybeStone(k, 0, -18, 4.6);
      if (k.rank >= 4) runeMark(k, 0, 18, 8);
      spec(x, -16, -16, 14, 6, -0.9, 0.5);
      return;
    }
    // Mail: a leather collar and a hem band.
    solid(x, smoothP([[-18, -44], [0, -36], [18, -44], [14, -32], [0, -26], [-14, -32]], 0.4), MATS['leather.dark']!, { a: [-18, -44], b: [18, -26], size: 0.5 });
    if (k.rank >= 1) {
      const hem = new Path2D();
      hem.moveTo(-28, 48);
      hem.quadraticCurveTo(0, 58, 28, 48);
      filigree(k, hem, 2.6);
    }
    maybeStone(k, 0, -30, 4);
    if (k.rank >= 4) runeMark(k, 0, 10, 8);
  });
};

// ---------------------------------------------------------------------------
// Gloves, boots, belts
// ---------------------------------------------------------------------------

const glovesLike: Painter = (k) => {
  const sub = k.sub;
  upright(k.x, () => {
    const x = k.x;
    x.rotate(-0.18);
    const m = k.m;
    const plate = sub === 'plate';
    const cuffM = plate ? m : sub === 'silk' ? m : MATS['leather.dark']!;
    // Fingers, back to front, so the knuckles overlap the palm.
    const fingers: Array<[number, number, number, number]> = [
      [-22, -14, 8.5, 30], [-9, -22, 9, 38], [5, -22, 9, 36], [18, -16, 8, 30],
    ];
    for (const [fx, fy, w, h] of fingers) {
      if (plate) {
        for (let i = 0; i < 3; i++) {
          const seg = rrectP(fx - w / 2, fy - h + i * (h / 3), w, h / 3 + 2, 3);
          solid(x, seg, m, { a: [fx - w, fy - h], b: [fx + w, fy], tex: null, size: 0.4 });
        }
      } else {
        const f = rrectP(fx - w / 2, fy - h, w, h + 6, w / 2);
        solid(x, f, m, { a: [fx - w, fy - h], b: [fx + w, fy], size: 0.5 });
      }
    }
    // Thumb.
    const thumb = smoothP([[-28, 14], [-40, 0], [-44, -12], [-36, -14], [-26, -2], [-18, 6]], 0.4);
    solid(x, thumb, m, { a: [-44, -14], b: [-18, 14], size: 0.6, tex: plate ? null : undefined });
    // Back of the hand.
    const back = smoothP([[-27, -12], [24, -14], [27, 20], [20, 32], [-22, 32], [-29, 14]], 0.3);
    solid(x, back, m, { a: [-28, -14], b: [27, 32], size: 1.1, tex: plate ? null : undefined });
    if (plate) {
      for (let i = 0; i < 3; i++) {
        const lame = new Path2D();
        lame.moveTo(-26, -8 + i * 11);
        lame.quadraticCurveTo(0, -4 + i * 11, 25, -9 + i * 11);
        x.strokeStyle = css(m.c[0], 0.8);
        x.lineWidth = 1.8;
        x.stroke(lame);
      }
      for (const fx of [-13, 0, 13]) {
        solid(x, polyP([[fx - 3, -8], [fx, -17], [fx + 3, -8]]), k.rank >= 1 ? k.trim : m, { a: [fx - 3, -17], b: [fx + 3, -8], tex: null, size: 0.3 });
      }
    } else if (sub === 'silk') {
      const emb = new Path2D();
      emb.moveTo(-18, 6);
      emb.bezierCurveTo(-8, -6, 8, 18, 18, 4);
      filigree(k, emb, 1.4, k.rank >= 1 ? k.trim : MATS['metal.gold']!);
    } else {
      x.save();
      x.setLineDash([2.5, 2]);
      x.strokeStyle = css(m.c[4], 0.55);
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(-24, 22);
      x.quadraticCurveTo(0, 26, 24, 20);
      x.stroke();
      x.restore();
      if (k.rank >= 1) for (const sx of [-14, 0, 14]) rivet(k, sx, -4, 2.4, k.trim);
    }
    // Cuff.
    const cuff = plate
      ? smoothP([[-28, 28], [28, 26], [36, 56], [-34, 58]], 0.2)
      : rrectP(-27, 28, 54, 26, 5);
    solid(x, cuff, cuffM, { a: [-34, 26], b: [36, 58], size: 1, tex: plate ? null : undefined });
    if (k.rank >= 1) {
      const tr = new Path2D();
      tr.moveTo(plate ? -32 : -26, 50);
      tr.lineTo(plate ? 34 : 26, 48);
      filigree(k, tr, 2.4);
    }
    maybeStone(k, 0, 40, 4.4);
    if (k.rank >= 4) runeMark(k, 0, 10, 7);
    if (plate) spec(x, -14, 0, 12, 4, -0.2, 0.6);
  });
};

const bootsLike: Painter = (k) => {
  const sub = k.sub;
  upright(k.x, () => {
    const x = k.x;
    const m = k.m;
    const plate = sub === 'plate';
    const silk = sub === 'silk';
    // A pair: the far boot behind, darker.
    for (const far of [true, false]) {
      x.save();
      if (far) {
        x.translate(16, -8);
        x.globalAlpha = 1;
      } else x.translate(-8, 4);
      const shaft = smoothP([[-14, -48], [14, -48], [14, 14], [36, 26], [40, 40], [-16, 40], [-18, 10]], 0.25);
      solid(x, shaft, m, { a: [-18, -48], b: [40, 40], size: 1.1, tex: plate ? null : undefined });
      if (far) {
        x.fillStyle = 'rgba(0,0,0,.35)';
        x.fill(shaft);
      }
      // Sole.
      const sole = rrectP(-18, 36, 60, 7, 3);
      solid(x, sole, MATS['leather.dark']!, { a: [-18, 36], b: [42, 43], size: 0.4, tex: null });
      if (plate) {
        // Knee cop and sabaton lames.
        for (let i = 0; i < 3; i++) {
          const lame = new Path2D();
          lame.moveTo(14 + i * 8, 18 + i * 3);
          lame.quadraticCurveTo(20 + i * 8, 26 + i * 3, 18 + i * 8, 38);
          x.strokeStyle = css(m.c[0], 0.8);
          x.lineWidth = 1.8;
          x.stroke(lame);
        }
        const cop = ellipseP(0, -42, 15, 10);
        solid(x, cop, k.rank >= 1 ? k.trim : m, { a: [-15, -52], b: [15, -32], tex: null, size: 0.6 });
        spec(x, -6, -20, 6, 14, 0, 0.5);
      } else if (silk) {
        // Wrapped bindings.
        x.save();
        x.clip(shaft);
        for (let i = 0; i < 6; i++) {
          const y = -40 + i * 9;
          x.beginPath();
          x.moveTo(-18, y);
          x.lineTo(16, y + 6);
          x.strokeStyle = css(MATS['cloth.linen']!.c[3], 0.7);
          x.lineWidth = 3;
          x.stroke();
          x.strokeStyle = css(MATS['cloth.linen']!.c[0], 0.6);
          x.lineWidth = 1;
          x.stroke();
        }
        x.restore();
      } else {
        // Folded cuff and laces.
        const cuff = rrectP(-17, -50, 34, 14, 4);
        solid(x, cuff, sink(m.c[2], 0) ? m : m, { a: [-17, -50], b: [17, -36], size: 0.5 });
        x.save();
        x.strokeStyle = css(MATS['cloth.linen']!.c[2]);
        x.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) {
          const y = -30 + i * 9;
          x.beginPath();
          x.moveTo(4, y);
          x.lineTo(12, y + 4);
          x.stroke();
        }
        x.restore();
      }
      if (!far && k.rank >= 1) {
        const tr = new Path2D();
        tr.moveTo(-17, plate ? -30 : -36);
        tr.lineTo(15, plate ? -30 : -36);
        filigree(k, tr, 2.4);
      }
      if (!far) {
        maybeStone(k, 0, -20, 4);
        if (k.rank >= 4) runeMark(k, 0, 0, 6);
      }
      x.restore();
    }
  }, 1, -6, 2);
};

const beltLike: Painter = (k) => {
  const sub = k.sub;
  upright(k.x, () => {
    const x = k.x;
    if (sub === 'sash') {
      const cloth = k.pal.startsWith('cloth') ? k.m : k.pal.startsWith('leather') ? k.m : MATS['cloth.banner']!;
      // A knotted sash: a soft loop, a knot at the front, two tails.
      const back = new Path2D();
      back.ellipse(0, -8, 50, 26, 0, Math.PI, Math.PI * 2);
      back.ellipse(0, -8, 50, 17, 0, Math.PI * 2, Math.PI, true);
      back.closePath();
      solid(x, back, cloth, { a: [-50, -34], b: [50, -8], size: 0.8 });
      x.fillStyle = 'rgba(0,0,0,.35)';
      x.fill(back);
      const front = new Path2D();
      front.ellipse(0, -8, 50, 26, 0, 0, Math.PI);
      front.ellipse(0, 4, 50, 26, 0, Math.PI, 0, true);
      front.closePath();
      solid(x, front, cloth, { a: [-50, -8], b: [50, 30], size: 1 });
      x.save();
      x.clip(front);
      for (const fx of [-30, -12, 12, 30]) {
        x.beginPath();
        x.moveTo(fx, 6);
        x.quadraticCurveTo(fx + 4, 16, fx, 30);
        x.strokeStyle = css(cloth.c[0], 0.45);
        x.lineWidth = 2;
        x.stroke();
      }
      x.restore();
      for (const s of [-1, 1]) {
        const tail = smoothP([[s * 3, 22], [s * 14, 38], [s * 10, 60], [s * 22, 58], [s * 24, 34], [s * 10, 20]], 0.35);
        solid(x, tail, cloth, { a: [s * 24, 20], b: [s * 3, 60], size: 0.7 });
      }
      solid(x, ellipseP(0, 22, 12, 10), cloth, { a: [-12, 12], b: [12, 32], size: 0.5 });
      if (k.rank >= 1) {
        const tr = new Path2D();
        tr.ellipse(0, -2, 50, 26, 0, Math.PI * 0.08, Math.PI * 0.4);
        filigree(k, tr, 1.4);
        const tl = new Path2D();
        tl.ellipse(0, -2, 50, 26, 0, Math.PI * 0.6, Math.PI * 0.92);
        filigree(k, tl, 1.4);
      }
      maybeStone(k, 0, 22, 4);
      if (k.rank >= 4) runeMark(k, 0, -24, 5);
      return;
    }
    // A buckled belt coiled into a loop, seen in three-quarter.
    const leather = k.pal.startsWith('leather') ? k.m : MATS['leather.dark']!;
    const metal = k.pal.startsWith('metal') ? k.m : MATS['metal.iron']!;
    const back = new Path2D();
    back.ellipse(0, 2, 54, 30, 0, Math.PI, Math.PI * 2);
    back.ellipse(0, 2, 54, 20, 0, Math.PI * 2, Math.PI, true);
    back.closePath();
    solid(x, back, leather, { a: [-54, -28], b: [54, 2], size: 0.8 });
    x.fillStyle = 'rgba(0,0,0,.3)';
    x.fill(back);
    const front = new Path2D();
    front.ellipse(0, 2, 54, 30, 0, 0, Math.PI);
    front.ellipse(0, 12, 54, 30, 0, Math.PI, 0, true);
    front.closePath();
    solid(x, front, leather, { a: [-54, 2], b: [54, 42], size: 1 });
    if (sub === 'chain') {
      // Linked plaques over the leather.
      for (let i = -3; i <= 3; i++) {
        const a = Math.PI / 2 + i * 0.3;
        const px = Math.cos(a) * 54 * 0.98;
        const py = 2 + Math.sin(a) * 30 + 5;
        solid(x, rrectP(px - 6, py - 7, 12, 14, 2.5), metal, { a: [px - 6, py - 7], b: [px + 6, py + 7], tex: null, size: 0.4 });
        if (k.rank >= 3) gem(x, px, py, 2.6, k.stone, 'round');
      }
    } else {
      for (let i = -4; i <= 4; i++) {
        const a = Math.PI / 2 + i * 0.27;
        rivet(k, Math.cos(a) * 52, 9 + Math.sin(a) * 30, 2.2, k.rank >= 1 ? k.trim : metal);
      }
      // Pouch.
      const pouch = smoothP([[24, 26], [44, 22], [46, 46], [26, 52]], 0.35);
      solid(x, pouch, MATS['leather.worn']!, { a: [24, 22], b: [46, 52], size: 0.6 });
      solid(x, smoothP([[23, 24], [45, 20], [45, 32], [24, 36]], 0.3), MATS['leather.dark']!, { a: [23, 20], b: [45, 36], size: 0.4 });
    }
    // Buckle.
    const bm = k.rank >= 1 ? k.trim : metal;
    const buckle = rrectP(-17, 22, 34, 26, 5);
    const hole = rrectP(-10, 28, 20, 14, 3);
    const bp = new Path2D();
    bp.addPath(buckle);
    bp.addPath(hole);
    x.save();
    solid(x, buckle, bm, { a: [-17, 22], b: [17, 48], tex: null, size: 0.7 });
    x.fillStyle = css(leather.c[1]);
    x.fill(hole);
    innerEdge(x, hole, 'rgba(0,0,0,.7)', 3, 1.5, 2, 2);
    x.restore();
    solid(x, rrectP(-1.6, 26, 3.2, 18, 1.2), bm, { a: [-2, 26], b: [2, 44], tex: null, size: 0.3 });
    if (k.rank >= 2) setStone(k, 0, 35, 4.4);
    if (k.rank >= 4) runeMark(k, -32, 30, 5);
    glint(x, -12, 24, 5, 0xffffff, 0.7);
  });
};

export const ARMOR_PAINTERS: Record<string, Painter> = {
  shield: shieldLike,
  buckler: (k) => shieldLike({ ...k, sub: 'buckler' }),
  orb: orbLike,
  helm: helmLike,
  chest: chestLike,
  armor: chestLike,
  gloves: glovesLike,
  boots: bootsLike,
  belt: beltLike,
};

export { skull, emissiveStroke };
