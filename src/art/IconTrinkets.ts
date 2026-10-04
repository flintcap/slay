/**
 * SLAY — jewellery, consumable, gem, rune and material icon painters.
 *
 * Small objects drawn big: a ring fills its slot the way a sword does. These
 * carry most of their identity in colour (a ruby, a mana potion, a void dust),
 * so each is also given a silhouette that differs by kind — cut by gem family,
 * bottle by potion type, tablet by rune — so they still sort apart in grey.
 */
import { type K, MATS, filigree, curl, rivet, runeMark, setStone, upright } from './IconKit';
import {
  type GemCut,
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
  saturate,
  shadowPool,
  sink,
  smoothP,
  solid,
  spec,
  texture,
} from './Paint';
import { skull } from './IconArmor';

type Painter = (k: K) => void;

// ---------------------------------------------------------------------------
// Jewellery
// ---------------------------------------------------------------------------

function chainArc(k: K, m: Mat, x0: number, y0: number, x1: number, y1: number, sag: number, links: number): void {
  const x = k.x;
  for (let i = 0; i <= links; i++) {
    const t = i / links;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
    const a = Math.atan2((y1 - y0) + Math.cos(t * Math.PI) * sag * Math.PI, x1 - x0);
    const link = ellipseP(px, py, i % 2 ? 4.2 : 3.6, i % 2 ? 2.2 : 3, a);
    x.save();
    x.lineWidth = i % 2 ? 2.2 : 1.8;
    x.strokeStyle = css(m.c[0]);
    x.stroke(link);
    x.lineWidth = i % 2 ? 1.2 : 1;
    x.strokeStyle = css(i % 2 ? m.c[3] : m.c[2]);
    x.stroke(link);
    x.restore();
  }
}

const amuletLike: Painter = (k) => {
  const metal = k.pal.startsWith('metal') ? k.m : MATS['metal.gold']!;
  const color = k.rank >= 2 ? k.stone : k.baseGlow ?? (k.pal === 'crystal.void' ? 0x9a50ff : 0x50a0ff);
  upright(k.x, () => {
    const x = k.x;
    chainArc(k, metal, -40, -52, 0, -8, 0, 7);
    chainArc(k, metal, 40, -52, 0, -8, 0, 7);
    const variant = (k.h >>> 4) % 4;
    const cy = 20;
    glow(x, 0, cy, 44, color, k.rank >= 4 ? 0.5 : 0.22);
    if (variant === 0) {
      // Teardrop pendant.
      const frame = smoothP([[0, -10], [18, 12], [20, 34], [0, 50], [-20, 34], [-18, 12]], 0.4);
      solid(x, frame, metal, { a: [-20, -10], b: [20, 50], tex: null, size: 1 });
      gem(x, 0, 26, 15, color, 'pear', { glow: 0.3, fire: 1 });
    } else if (variant === 1) {
      // Round medallion with an engraved sun.
      solid(x, circleP(0, cy, 26), metal, { a: [-26, cy - 26], b: [26, cy + 26], tex: 'hammered', texAmt: 0.25, size: 1 });
      const rays = new Path2D();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        rays.moveTo(Math.cos(a) * 12, cy + Math.sin(a) * 12);
        rays.lineTo(Math.cos(a) * 21, cy + Math.sin(a) * 21);
      }
      x.save();
      x.strokeStyle = css(metal.c[0], 0.8);
      x.lineWidth = 1.6;
      x.stroke(rays);
      x.translate(-0.6, -0.6);
      x.strokeStyle = css(metal.c[4], 0.6);
      x.lineWidth = 0.8;
      x.stroke(rays);
      x.restore();
      gem(x, 0, cy, 10, color, 'round', { glow: 0.3 });
    } else if (variant === 2) {
      // Reliquary: a tiny case with a window.
      const box = rrectP(-18, cy - 24, 36, 46, 6);
      solid(x, box, metal, { a: [-18, cy - 24], b: [18, cy + 22], tex: null, size: 1 });
      const win = rrectP(-10, cy - 14, 20, 26, 8);
      x.fillStyle = css(sink(color, 0.6));
      x.fill(win);
      x.save();
      x.clip(win);
      glow(x, 0, cy, 16, color, 0.9);
      x.restore();
      innerEdge(x, win, 'rgba(0,0,0,.8)', 3, 1.5, 2, 2);
      for (const [px, py] of [[-14, cy - 20], [14, cy - 20], [-14, cy + 18], [14, cy + 18]] as const) rivet(k, px, py, 2, metal);
      filigree(k, curl(0, cy - 30, 5, 1, Math.PI / 2), 1.4, metal);
    } else {
      // Sigil star.
      const pts: Pt[] = [];
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI / 2 + (i / 12) * Math.PI * 2;
        const r = i % 2 === 0 ? 30 : 13;
        pts.push([Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      solid(x, polyP(pts), metal, { a: [-30, cy - 30], b: [30, cy + 30], tex: null, size: 1 });
      gem(x, 0, cy, 9, color, 'round', { glow: 0.4 });
    }
    // Bail.
    solid(x, ellipseP(0, -8, 5, 7), metal, { a: [-5, -15], b: [5, -1], tex: null, size: 0.4 });
    if (k.rank >= 3) {
      filigree(k, curl(-24, cy + 4, 7, 1, 0), 1.3, k.trim);
      filigree(k, curl(24, cy + 4, 7, -1, Math.PI), 1.3, k.trim);
    }
    if (k.rank >= 4) for (const s of [-1, 1]) gem(x, s * 22, cy + 26, 4, k.stone, 'round', { glow: 0.5 });
  });
};

const ringLike: Painter = (k) => {
  const metal = k.pal.startsWith('metal') ? k.m : MATS['metal.gold']!;
  const id = k.id;
  const stoneC = k.rank >= 2 ? k.stone : k.baseGlow ?? (id.includes('circle') ? 0x9a2a2a : 0x4aa0ff);
  upright(k.x, () => {
    const x = k.x;
    const cy = 14;
    const R = 36;
    const T = id.includes('band') ? 13 : 9;
    shadowPool(x, 0, cy + 40, 40, 8, 0.45);
    // Back half of the band, then the stone, then the front half.
    const back = new Path2D();
    back.ellipse(0, cy, R, R * 0.5, 0, Math.PI, Math.PI * 2);
    back.ellipse(0, cy - T * 0.3, R - T, (R - T) * 0.5, 0, Math.PI * 2, Math.PI, true);
    back.closePath();
    solid(x, back, metal, { a: [-R, cy - R], b: [R, cy], tex: null, size: 0.8 });
    x.fillStyle = 'rgba(0,0,0,.35)';
    x.fill(back);
    const front = new Path2D();
    front.ellipse(0, cy, R, R * 0.5, 0, 0, Math.PI);
    front.lineTo(-R + T, cy - T * 0.3);
    front.ellipse(0, cy - T * 0.3, R - T, (R - T) * 0.5, 0, Math.PI, 0, true);
    front.closePath();
    // Thickness: the band's outer face as a second, lower ellipse.
    const face = new Path2D();
    face.ellipse(0, cy, R, R * 0.5, 0, 0, Math.PI);
    face.lineTo(-R, cy + T);
    face.ellipse(0, cy + T, R, R * 0.5, 0, Math.PI, 0, true);
    face.closePath();
    solid(x, face, metal, { a: [-R, cy], b: [R, cy + R * 0.5 + T], tex: id.includes('band') ? 'hammered' : null, texAmt: 0.3, size: 0.9 });
    solid(x, front, metal, { a: [-R, cy], b: [R, cy + R * 0.5], tex: null, size: 0.8, outline: 1.2 });
    if (id.includes('band') || id.includes('circle')) {
      // Engraved band: a running pattern on the face.
      x.save();
      x.clip(face);
      for (let i = -6; i <= 6; i++) {
        const a = Math.PI / 2 + i * 0.22;
        runeMark(k, Math.cos(a) * R, cy + Math.sin(a) * R * 0.5 + T * 0.5, T * 0.32, k.rank >= 1 ? k.glowC : sink(metal.c[2], 0.5), k.h + i * 11, k.rank >= 1 ? 0.8 : 0.5);
      }
      x.restore();
    }
    if (id.includes('eternity')) {
      for (let i = -4; i <= 4; i++) {
        const a = Math.PI / 2 + i * 0.3;
        gem(x, Math.cos(a) * R * 0.98, cy + Math.sin(a) * R * 0.5 + T * 0.5, 3.4, stoneC, 'round', { glow: 0.3 });
      }
    }
    if (id.includes('halo')) glow(x, 0, cy + T * 0.5, R * 1.3, stoneC, 0.35);
    // The setting at the top of the band.
    if (!id.includes('band')) {
      const sy = cy - R * 0.5 - 6;
      if (id.includes('signet')) {
        const plate = ellipseP(0, sy, 18, 12);
        solid(x, plate, metal, { a: [-18, sy - 12], b: [18, sy + 12], tex: null, size: 0.7 });
        const sig = new Path2D();
        sig.moveTo(-7, sy + 5);
        sig.lineTo(0, sy - 7);
        sig.lineTo(7, sy + 5);
        sig.moveTo(-4, sy);
        sig.lineTo(4, sy);
        x.save();
        x.strokeStyle = css(metal.c[0]);
        x.lineWidth = 2.2;
        x.stroke(sig);
        x.restore();
        if (k.rank >= 2) gem(x, 0, sy + 1, 4, stoneC, 'round');
      } else {
        solid(x, polyP([[-12, sy + 10], [-15, sy - 2], [15, sy - 2], [12, sy + 10]]), metal, { a: [-15, sy - 2], b: [15, sy + 10], tex: null, size: 0.5 });
        const r = id.includes('circle') ? 12 : 13 + (k.rank >= 3 ? 2 : 0);
        glow(x, 0, sy - 6, r * 2.4, stoneC, k.rank >= 4 ? 0.6 : 0.3);
        gem(x, 0, sy - 6, r, stoneC, id.includes('circle') ? 'cabochon' : k.rank >= 3 ? 'cushion' : 'round', { glow: 0.3, fire: 1 });
        for (const s of [-1, 1]) solid(x, polyP([[s * 9, sy + 2], [s * 13, sy - 10], [s * 11, sy + 4]]), metal, { a: [-13, sy - 10], b: [13, sy + 4], tex: null, outline: 0.8, size: 0.3 });
      }
    }
    glint(x, -R * 0.7, cy + 4, 6, 0xffffff, 0.7);
  }, 1.22, 0, -8);
};

const charmLike: Painter = (k) => {
  const sub = k.sub;
  const color = k.baseGlow ?? k.stone;
  upright(k.x, () => {
    const x = k.x;
    const stone = k.pal.startsWith('metal') ? k.m : k.pal === 'crystal.void' ? MATS['crystal.void']! : MATS['bone.pale']!;
    if (sub === 'grand') {
      // A tall carved totem tablet with feathers and a set stone.
      for (const s of [-1, 1]) {
        const f = smoothP([[s * 8, 30], [s * 22, 42], [s * 30, 60], [s * 18, 56], [s * 6, 40]], 0.4);
        solid(x, f, rampOf(s < 0 ? 0x8a3a2a : 0x2a3a5a, 0, 'weave', 0.3), { a: [s * 30, 30], b: [s * 6, 60], size: 0.5 });
      }
      const tab = smoothP([[-20, -52], [20, -52], [24, -30], [22, 30], [0, 42], [-22, 30], [-24, -30]], 0.25);
      solid(x, tab, stone, { a: [-24, -52], b: [24, 42], size: 1.3 });
      for (let i = 0; i < 3; i++) runeMark(k, 0, -34 + i * 18 + 18, 6, color, k.h + i * 19, 0.9);
      gem(x, 0, -34, 8, color, 'oval', { glow: 0.4 });
      solid(x, ellipseP(0, -60, 6, 8), MATS['leather.dark']!, { a: [-6, -68], b: [6, -52], size: 0.3 });
      return;
    }
    if (sub === 'large') {
      // A medallion on a cord.
      const cord = new Path2D();
      cord.moveTo(-30, -60);
      cord.quadraticCurveTo(0, -34, 30, -60);
      x.save();
      x.strokeStyle = css(MATS['leather.dark']!.c[2]);
      x.lineWidth = 3;
      x.stroke(cord);
      x.restore();
      solid(x, circleP(0, 6, 36), stone, { a: [-36, -30], b: [36, 42], size: 1.3 });
      const ring = new Path2D();
      ring.arc(0, 6, 28, 0, Math.PI * 2);
      x.save();
      x.strokeStyle = css(stone.c[0], 0.7);
      x.lineWidth = 2;
      x.stroke(ring);
      x.restore();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        runeMark(k, Math.cos(a) * 20, 6 + Math.sin(a) * 20, 4.5, color, k.h + i * 9, 0.85);
      }
      gem(x, 0, 6, 9, color, 'round', { glow: 0.4 });
      return;
    }
    // Small: a pierced token.
    const tok = smoothP([[0, -38], [26, -20], [28, 16], [0, 38], [-28, 16], [-26, -20]], 0.5);
    solid(x, tok, stone, { a: [-28, -38], b: [28, 38], size: 1.1 });
    runeMark(k, 0, 4, 14, color, k.h, 1);
    x.fillStyle = '#0a0806';
    x.beginPath();
    x.arc(0, -28, 4, 0, Math.PI * 2);
    x.fill();
    const cord = new Path2D();
    cord.moveTo(0, -28);
    cord.quadraticCurveTo(-18, -52, -6, -60);
    x.save();
    x.strokeStyle = css(MATS['leather.worn']!.c[3]);
    x.lineWidth = 2.4;
    x.stroke(cord);
    x.restore();
  }, 1.05);
};

// ---------------------------------------------------------------------------
// Potions
// ---------------------------------------------------------------------------

/** Which liquid a potion holds, from its id when the base has no glow. */
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

const potionLike: Painter = (k) => {
  const sub = k.sub;
  // Mana is blue and healing is red, whatever the rarity.
  const liquid = /heal|mana|rejuv/.test(k.id) ? potionColor(k.id) : k.baseGlow ?? potionColor(k.id);
  const tier = /minor/.test(k.id) ? 0 : /light|lesser/.test(k.id) ? 1 : /greater/.test(k.id) ? 2 : /super|full/.test(k.id) ? 3 : 1;
  upright(k.x, () => {
    const x = k.x;
    let glass: Path2D;
    let fillTop: number;
    let neckTop: number;
    let neckW: number;
    if (sub === 'round') {
      glass = new Path2D();
      glass.moveTo(-7, -40);
      glass.lineTo(-7, -18);
      glass.bezierCurveTo(-40, -12, -46, 34, -18, 48);
      glass.quadraticCurveTo(0, 56, 18, 48);
      glass.bezierCurveTo(46, 34, 40, -12, 7, -18);
      glass.lineTo(7, -40);
      glass.closePath();
      fillTop = -2;
      neckTop = -40;
      neckW = 7;
    } else if (sub === 'vial') {
      glass = smoothP([[-9, -44], [9, -44], [12, -34], [14, 34], [9, 50], [0, 54], [-9, 50], [-14, 34], [-12, -34]], 0.2);
      fillTop = -14;
      neckTop = -44;
      neckW = 9;
    } else {
      // Flask: a broad shoulder that narrows to the neck.
      glass = new Path2D();
      glass.moveTo(-8, -42);
      glass.lineTo(-8, -20);
      glass.lineTo(-34, 30);
      glass.quadraticCurveTo(-38, 50, -18, 52);
      glass.lineTo(18, 52);
      glass.quadraticCurveTo(38, 50, 34, 30);
      glass.lineTo(8, -20);
      glass.lineTo(8, -42);
      glass.closePath();
      fillTop = 2 - tier * 4;
      neckTop = -42;
      neckW = 8;
    }
    shadowPool(x, 0, 52, 34, 7, 0.55);
    // Glass back wall.
    x.save();
    x.fillStyle = css(sink(liquid, 0.85), 0.55);
    x.fill(glass);
    // Liquid.
    x.clip(glass);
    const lq = x.createLinearGradient(-30, fillTop, 30, 56);
    lq.addColorStop(0, css(lift(saturate(liquid, 0.2), 0.25)));
    lq.addColorStop(0.45, css(saturate(liquid, 0.2)));
    lq.addColorStop(1, css(sink(liquid, 0.6)));
    x.fillStyle = lq;
    x.fillRect(-50, fillTop, 100, 70);
    // Meniscus.
    x.fillStyle = css(lift(liquid, 0.5), 0.7);
    x.fillRect(-50, fillTop - 1, 100, 2.4);
    // Inner glow and bubbles.
    glow(x, 6, fillTop + 30, 26, lift(liquid, 0.3), 0.55);
    for (let i = 0; i < 5 + tier; i++) {
      const bx = -16 + k.rnd() * 30;
      const by = fillTop + 6 + k.rnd() * 36;
      const br = 1 + k.rnd() * 2.2;
      x.beginPath();
      x.arc(bx, by, br, 0, Math.PI * 2);
      x.strokeStyle = css(lift(liquid, 0.7), 0.7);
      x.lineWidth = 0.8;
      x.stroke();
    }
    x.restore();
    // Glass: edge darkening, a hard window highlight and a soft side sheen.
    innerEdge(x, glass, 'rgba(10,14,20,.55)', 6, -2, -2, 3);
    x.save();
    x.clip(glass);
    spec(x, -16, 12, 18, 5, -1.25, 0.55);
    x.fillStyle = 'rgba(255,255,255,.55)';
    x.beginPath();
    x.ellipse(-18, 18, 3.2, 12, 0.35, 0, Math.PI * 2);
    x.fill();
    x.restore();
    x.save();
    x.lineJoin = 'round';
    x.strokeStyle = 'rgba(200,225,255,.55)';
    x.lineWidth = 1.4;
    x.stroke(glass);
    x.strokeStyle = 'rgba(6,8,12,.85)';
    x.lineWidth = 1;
    x.translate(0.6, 0.8);
    x.stroke(glass);
    x.restore();
    // Lip and cork.
    const lip = rrectP(-neckW - 3, neckTop - 2, (neckW + 3) * 2, 6, 2.5);
    solid(x, lip, rampOf(0x9ab0c0, 0.5, null), { a: [-neckW - 3, neckTop], b: [neckW + 3, neckTop + 4], tex: null, size: 0.3, ao: 0.2 });
    const cork = smoothP([[-neckW + 1, neckTop + 2], [-neckW - 1, neckTop - 12], [0, neckTop - 15], [neckW + 1, neckTop - 12], [neckW - 1, neckTop + 2]], 0.3);
    solid(x, cork, MATS['wood.oak']!, { a: [-neckW, neckTop - 15], b: [neckW, neckTop + 2], tex: 'pores', texAmt: 0.5, size: 0.4 });
    // A seal of wax, cord-tied, for the stronger brews.
    if (tier >= 2) {
      const wax = rampOf(tier >= 3 ? 0xb08a28 : 0x8a2020, 0.3, 'mottle', 0.3);
      solid(x, ellipseP(0, neckTop - 9, neckW + 2, 6), wax, { a: [-neckW, neckTop - 15], b: [neckW, neckTop - 3], size: 0.4 });
    }
    const tie = new Path2D();
    tie.moveTo(-neckW, neckTop + 8);
    tie.quadraticCurveTo(0, neckTop + 11, neckW, neckTop + 8);
    x.save();
    x.strokeStyle = css(MATS['cloth.linen']!.c[3]);
    x.lineWidth = 2;
    x.stroke(tie);
    x.restore();
    glint(x, -18, 8, 7, 0xffffff, 0.85);
  }, 1.02);
};

// ---------------------------------------------------------------------------
// Gems
// ---------------------------------------------------------------------------

const GEM_FAMILY: Record<string, { cut: GemCut; rot?: number }> = {
  ruby: { cut: 'oval' },
  sapphire: { cut: 'cushion' },
  topaz: { cut: 'emerald', rot: 0.0 },
  emerald: { cut: 'emerald', rot: Math.PI / 2 },
  amethyst: { cut: 'pear' },
  diamond: { cut: 'round' },
  onyx: { cut: 'cabochon' },
  opal: { cut: 'cabochon' },
  garnet: { cut: 'rose' },
  citrine: { cut: 'trillion' },
  skull: { cut: 'cabochon' },
};

const QUALITY: Record<string, number> = { chipped: 0, flawed: 1, normal: 2, flawless: 3, perfect: 4, divine: 5 };

const gemLike: Painter = (k) => {
  const family = k.sub || 'ruby';
  const qual = QUALITY[k.id.split('.')[2] ?? 'normal'] ?? 2;
  const color = family === 'diamond' ? 0xe8f2ff : family === 'onyx' ? 0x2a2a34 : k.baseGlow ?? 0x4ad0ff;
  const spec0 = GEM_FAMILY[family] ?? { cut: 'round' as GemCut };
  upright(k.x, () => {
    const x = k.x;
    const r = 30 + qual * 4;
    shadowPool(x, 0, r * 0.9 + 6, r * 0.9, r * 0.22, 0.6);
    if (qual >= 4) glow(x, 0, 0, r * 2.2, color, qual === 5 ? 0.75 : 0.4);
    if (qual === 5) {
      // Divine stones radiate.
      x.save();
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const ray = polyP([[0, 0], [Math.cos(a - 0.06) * r * 2, Math.sin(a - 0.06) * r * 2], [Math.cos(a + 0.06) * r * 2, Math.sin(a + 0.06) * r * 2]]);
        const g = x.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 2);
        g.addColorStop(0, css(lift(color, 0.5), 0.5));
        g.addColorStop(1, css(color, 0));
        x.fillStyle = g;
        x.fill(ray);
      }
      x.restore();
    }
    if (family === 'skull') {
      skull(k, 0, 0, r * 0.95, rampOf(0xd8d0c0, 0.4, 'mottle', 0.25));
      x.save();
      for (const ex of [-r * 0.36, r * 0.36]) glow(x, ex, 2, r * 0.35, 0xff4030, 0.4 + qual * 0.1);
      x.restore();
    } else if (qual === 0) {
      // Chipped: a rough broken fragment.
      const pts: Pt[] = [];
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (0.7 + k.rnd() * 0.35);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.85]);
      }
      const p = polyP(pts);
      const m = rampOf(color, 0.6, null, 0);
      solid(x, p, m, { a: [-r, -r], b: [r, r], tex: null, size: 1 });
      x.save();
      x.clip(p);
      x.strokeStyle = css(m.c[4], 0.5);
      x.lineWidth = 1;
      for (let i = 0; i < n; i += 2) {
        x.beginPath();
        x.moveTo(pts[i]![0], pts[i]![1]);
        x.lineTo(r * 0.1, -r * 0.1);
        x.stroke();
      }
      x.restore();
      glint(x, -r * 0.3, -r * 0.3, 6, 0xffffff, 0.8);
    } else {
      gem(x, 0, 0, r, color, spec0.cut, { rot: spec0.rot ?? 0, fire: 0.4 + qual * 0.15, glow: qual >= 3 ? 0.3 : 0 });
      if (family === 'opal') {
        // Play of colour.
        x.save();
        x.beginPath();
        x.arc(0, 0, r * 0.95, 0, Math.PI * 2);
        x.clip();
        x.globalCompositeOperation = 'lighter';
        const hues = [0xff4080, 0x40ff90, 0x4090ff, 0xffd040];
        for (let i = 0; i < 6; i++) glow(x, (k.rnd() - 0.5) * r, (k.rnd() - 0.5) * r, r * 0.4, hues[i % 4]!, 0.35);
        x.restore();
      }
      if (qual === 1) {
        // A visible flaw.
        x.save();
        x.strokeStyle = 'rgba(255,255,255,.55)';
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(-r * 0.4, r * 0.1);
        x.lineTo(-r * 0.05, r * 0.25);
        x.lineTo(r * 0.2, r * 0.05);
        x.stroke();
        x.restore();
      }
      if (qual >= 4) glint(x, r * 0.5, -r * 0.55, 9, 0xffffff, 0.9);
    }
  });
};

// ---------------------------------------------------------------------------
// Runes
// ---------------------------------------------------------------------------

const runeLike: Painter = (k) => {
  const color = k.baseGlow ?? 0xff9a3a;
  upright(k.x, () => {
    const x = k.x;
    const stone = MATS['stone.crypt']!;
    const v = (k.h >>> 2) % 3;
    let p: Path2D;
    if (v === 0) p = smoothP([[-26, -40], [24, -42], [30, 0], [26, 40], [-24, 42], [-30, 2]], 0.35);
    else if (v === 1) p = smoothP([[0, -46], [30, -22], [32, 24], [4, 46], [-30, 30], [-32, -18]], 0.4);
    else p = rrectP(-28, -44, 56, 88, 14);
    shadowPool(x, 0, 46, 32, 6, 0.6);
    solid(x, p, stone, { a: [-30, -46], b: [30, 46], size: 1.4 });
    // The carved glyph: a dark cut, then the light pouring out of it.
    const gp = new Path2D();
    const h = k.h;
    const name = k.id.split('.')[1] ?? 'el';
    const seed = h ^ (name.length * 2654435761);
    gp.moveTo(0, -28);
    gp.lineTo(0, 28);
    const arms: Array<[Pt, Pt]> = [
      [[0, -24], [16, -34]], [[0, -24], [-16, -34]], [[0, -6], [16, 6]], [[0, -6], [-16, 6]],
      [[0, 12], [16, 26]], [[0, 12], [-16, 26]], [[0, -14], [14, -14]], [[0, 4], [-14, 4]],
    ];
    let n = 0;
    for (let i = 0; i < arms.length && n < 3; i++) {
      if ((seed >>> (i * 2)) & 1) {
        gp.moveTo(arms[i]![0][0], arms[i]![0][1]);
        gp.lineTo(arms[i]![1][0], arms[i]![1][1]);
        n++;
      }
    }
    if (n === 0) {
      gp.moveTo(0, -20);
      gp.lineTo(14, -6);
      gp.lineTo(0, 8);
    }
    x.save();
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.strokeStyle = 'rgba(0,0,0,.85)';
    x.lineWidth = 7;
    x.stroke(gp);
    x.restore();
    emissiveStroke(x, gp, color, 3.4, 1);
    glow(x, 0, 0, 30, color, 0.25);
    glint(x, -18, -30, 5, 0xffffff, 0.4);
  });
};

// ---------------------------------------------------------------------------
// Crafting materials
// ---------------------------------------------------------------------------

const materialLike: Painter = (k) => {
  const kind = k.sub;
  const color = k.baseGlow ?? 0x9a9382;
  const tier = Math.max(1, Math.round((k.ornate - 0.2) / 0.1));
  upright(k.x, () => {
    const x = k.x;
    if (kind === 'dust') {
      // A heap of powder on a scrap of cloth, sparkling.
      const cloth = smoothP([[-50, 30], [-30, 18], [20, 14], [52, 26], [44, 46], [-40, 48]], 0.35);
      solid(x, cloth, MATS['cloth.tattered']!, { a: [-50, 14], b: [52, 48], size: 0.8 });
      const heap = smoothP([[-40, 34], [-20, 6], [-4, -12], [8, -14], [24, 4], [42, 32], [0, 40]], 0.4);
      const m = rampOf(color, 0.1, 'fine', 0.6);
      solid(x, heap, m, { a: [-30, -14], b: [30, 40], size: 1.2, texScale: 0.4 });
      for (let i = 0; i < 6 + tier * 3; i++) {
        const px = -30 + k.rnd() * 60;
        const py = -6 + k.rnd() * 38;
        glint(x, px, py, 2 + k.rnd() * 3.5, lift(color, 0.6), 0.85);
      }
      if (tier >= 3) glow(x, 0, 10, 40, color, 0.3);
      return;
    }
    if (kind === 'shard') {
      glow(x, 0, 6, 50, color, 0.25 + tier * 0.05);
      const m = rampOf(color, 0.85, 'brushed', 0.2);
      const shards: Array<[number, number, number, number]> = [
        [-18, 34, -0.35, 52], [16, 36, 0.4, 44], [0, 38, 0, 70], [-30, 40, -0.8, 30], [30, 42, 0.9, 28],
      ];
      for (let i = 0; i < Math.min(shards.length, 2 + tier); i++) {
        const [bx, by, a, h] = shards[i]!;
        x.save();
        x.translate(bx, by);
        x.rotate(a);
        const p = polyP([[-7, 0], [-8, -h * 0.6], [0, -h], [8, -h * 0.65], [7, 0]]);
        solid(x, p, m, { a: [-8, -h], b: [8, 0], texRot: Math.PI / 2, size: 0.7 });
        x.beginPath();
        x.moveTo(0, -h);
        x.lineTo(-1, 0);
        x.strokeStyle = css(m.c[4], 0.6);
        x.lineWidth = 1;
        x.stroke();
        x.restore();
      }
      solid(x, smoothP([[-40, 40], [40, 40], [32, 50], [-32, 50]], 0.3), MATS['stone.crypt']!, { a: [-40, 40], b: [40, 50], size: 0.5 });
      glint(x, -2, -26, 8, 0xffffff, 0.9);
      return;
    }
    if (kind === 'essence' || kind === 'core') {
      const core = kind === 'core';
      glow(x, 0, 0, 58, color, 0.55);
      if (core) {
        // A heart-stone veined with light.
        const p = smoothP([[0, -36], [26, -24], [34, 6], [18, 32], [-4, 38], [-28, 22], [-34, -8], [-22, -30]], 0.45);
        const m = rampOf(sink(color, 0.45), 0.2, 'crack', 0.6);
        solid(x, p, m, { a: [-34, -36], b: [34, 38], size: 1.3 });
        x.save();
        x.clip(p);
        for (let i = 0; i < 6; i++) {
          const vp = new Path2D();
          let px = 0;
          let py = 0;
          vp.moveTo(px, py);
          let a = (i / 6) * Math.PI * 2;
          for (let s = 0; s < 4; s++) {
            a += (k.rnd() - 0.5) * 0.9;
            px += Math.cos(a) * 9;
            py += Math.sin(a) * 9;
            vp.lineTo(px, py);
          }
          emissiveStroke(x, vp, color, 1.6, 0.9);
        }
        x.restore();
        glow(x, 0, 0, 16, lift(color, 0.6), 1);
      } else {
        // A wisp held in a glass sphere.
        const ball = circleP(0, 0, 36);
        x.fillStyle = css(sink(color, 0.8), 0.6);
        x.fill(ball);
        x.save();
        x.clip(ball);
        x.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const w = new Path2D();
          const a0 = i * 1.6 + (k.h & 3);
          for (let t = 0; t <= 24; t++) {
            const a = a0 + t * 0.26;
            const rr = 4 + t * 1.1;
            const px = Math.cos(a) * rr;
            const py = Math.sin(a) * rr * 0.8 - t * 0.4;
            if (t === 0) w.moveTo(px, py);
            else w.lineTo(px, py);
          }
          x.strokeStyle = css(lift(color, 0.5), 0.5);
          x.lineWidth = 3 - i * 0.5;
          x.stroke(w);
        }
        glow(x, 0, 0, 20, lift(color, 0.7), 1);
        x.restore();
        innerEdge(x, ball, 'rgba(0,0,0,.6)', 6, -2, -3, 3);
        x.save();
        x.strokeStyle = 'rgba(210,230,255,.6)';
        x.lineWidth = 1.4;
        x.stroke(ball);
        x.restore();
        spec(x, -13, -15, 12, 6, -0.7, 0.85);
      }
      return;
    }
    if (kind === 'catalyst') {
      // An alchemical prism ringed with sigils.
      glow(x, 0, 0, 56, color, 0.4);
      const ring = new Path2D();
      ring.arc(0, 0, 44, 0, Math.PI * 2);
      emissiveStroke(x, ring, color, 2, 0.7);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        runeMark(k, Math.cos(a) * 44, Math.sin(a) * 44, 5, color, k.h + i * 3, 0.9);
      }
      const m = rampOf(color, 0.7, null, 0);
      const pr = polyP([[0, -34], [22, -6], [14, 30], [-14, 30], [-22, -6]]);
      solid(x, pr, m, { a: [-22, -34], b: [22, 30], tex: null, size: 1 });
      x.save();
      x.clip(pr);
      x.strokeStyle = css(m.c[4], 0.6);
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(0, -34);
      x.lineTo(0, 30);
      x.moveTo(-22, -6);
      x.lineTo(14, 30);
      x.moveTo(22, -6);
      x.lineTo(-14, 30);
      x.stroke();
      x.restore();
      glint(x, -6, -18, 9, 0xffffff, 0.9);
      return;
    }
    // Reagents: hide, sinew, silk, starcloth.
    const id = k.id;
    if (/sinew/.test(id)) {
      const m = rampOf(color, 0.2, 'fine', 0.3);
      for (let i = 0; i < 4; i++) {
        const c = new Path2D();
        c.ellipse(0, 6 - i * 6, 38 - i * 4, 22 - i * 3, -0.2, 0, Math.PI * 2);
        x.save();
        x.strokeStyle = css(m.c[0]);
        x.lineWidth = 6;
        x.stroke(c);
        x.strokeStyle = css(m.c[2]);
        x.lineWidth = 4;
        x.stroke(c);
        x.strokeStyle = css(m.c[4], 0.6);
        x.lineWidth = 1.2;
        x.stroke(c);
        x.restore();
      }
      return;
    }
    if (/silk|starcloth/.test(id)) {
      // A folded bolt of cloth.
      const m = rampOf(color, 0.3, 'weave', 0.35);
      for (let i = 2; i >= 0; i--) {
        const p = smoothP([[-44, -14 + i * 14], [40, -24 + i * 14], [46, -8 + i * 14], [-38, 4 + i * 14]], 0.2);
        solid(x, p, m, { a: [-44, -24], b: [46, 4 + i * 14], size: 0.7 });
      }
      if (/star/.test(id)) for (let i = 0; i < 8; i++) glint(x, -36 + k.rnd() * 72, -16 + k.rnd() * 40, 2 + k.rnd() * 3, 0xfff4c0, 0.9);
      const tie = rrectP(-6, -30, 12, 64, 3);
      solid(x, tie, MATS['leather.dark']!, { a: [-6, -30], b: [6, 34], size: 0.4 });
      return;
    }
    // Rolled hide, tied.
    const hide = MATS['leather.worn']!;
    const roll = rrectP(-46, -20, 92, 40, 20);
    solid(x, roll, hide, { a: [-46, -20], b: [46, 20], size: 1.2 });
    solid(x, ellipseP(40, 0, 10, 20), MATS['leather.fine']!, { a: [30, -20], b: [50, 20], size: 0.6 });
    x.save();
    x.strokeStyle = css(hide.c[0], 0.8);
    x.lineWidth = 1.6;
    x.beginPath();
    x.arc(40, 0, 6, 0, Math.PI * 2);
    x.stroke();
    x.restore();
    for (const tx of [-22, 14]) solid(x, rrectP(tx - 3, -22, 6, 44, 2), MATS['cloth.linen']!, { a: [tx - 3, -22], b: [tx + 3, 22], size: 0.3 });
    texture(x, roll, 'pores', 0.2);
  }, 1);
};

export const TRINKET_PAINTERS: Record<string, Painter> = {
  amulet: amuletLike,
  ring: ringLike,
  charm: charmLike,
  potion: potionLike,
  gem: gemLike,
  rune: runeLike,
  material: materialLike,
};

export { setStone };
