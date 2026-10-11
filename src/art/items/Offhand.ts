/**
 * SLAY — shields and quivers.
 *
 * Shields face +Z with their top up +Y and the handle at the origin on the
 * back. Every base has its own outline and face: a Buckler is a deep dish
 * round a big boss, a Luna a crescent, a Pavise a tall board with a spine
 * and feet, a Troll Nest a dome of woven sticks and bones, the Ward of Aeons
 * a clock face of rings.
 *
 * Quivers stand upright, mouth up, a fan of fletchings showing.
 */
import * as THREE from 'three';
import type { Parts, Slot } from './Parts';
import { box, cone, curve, cyl, lathe, rough, slab, smoothOutline, sphere, spike, torus, tube, v3, type V3 } from './Geo';
import { aim, arc2, circle2, cutOf, dressGems, qb, runes, skull, sphereDirs, type V2 } from './Kit';

const PI = Math.PI;

// ===========================================================================
// SHIELDS
// ===========================================================================

type Outline = 'round' | 'heater' | 'kite' | 'dragon' | 'monarch' | 'tower' | 'pavise' | 'luna' | 'grim';
type Face = 'buckler' | 'defender' | 'ridge' | 'planks' | 'rings' | 'moon' | 'cross' | 'scales' | 'crown' | 'rivets' | 'spine' | 'sun' | 'spokes' | 'skull' | 'nest' | 'clock';

interface ShieldCut {
  outline: Outline;
  /** Half width and half height. */
  w: number;
  h: number;
  face: Face;
  /** How far the centre bulges forward. */
  dish: number;
  /** Bend round the vertical axis only (tower shields). */
  barrel?: boolean;
  rim: Slot | 'none';
  plate: Slot;
}

const SHIELD_CUTS: Record<string, ShieldCut> = {
  'shield.buckler': { outline: 'round', w: 0.17, h: 0.17, face: 'buckler', dish: 0.05, rim: 'dark', plate: 'main' },
  'shield.defender': { outline: 'round', w: 0.2, h: 0.2, face: 'defender', dish: 0.045, rim: 'trim', plate: 'main' },
  'shield.heater': { outline: 'heater', w: 0.2, h: 0.26, face: 'ridge', dish: 0.03, rim: 'trim', plate: 'main' },
  'shield.small': { outline: 'round', w: 0.26, h: 0.26, face: 'planks', dish: 0.03, rim: 'dark', plate: 'main' },
  'shield.round': { outline: 'round', w: 0.3, h: 0.3, face: 'rings', dish: 0.04, rim: 'dark', plate: 'main' },
  'shield.luna': { outline: 'luna', w: 0.3, h: 0.3, face: 'moon', dish: 0.03, rim: 'trim', plate: 'main' },
  'shield.kite': { outline: 'kite', w: 0.22, h: 0.4, face: 'cross', dish: 0.035, rim: 'dark', plate: 'main' },
  'shield.dragon': { outline: 'dragon', w: 0.24, h: 0.42, face: 'scales', dish: 0.035, rim: 'trim', plate: 'main' },
  'shield.monarch': { outline: 'monarch', w: 0.25, h: 0.44, face: 'crown', dish: 0.035, rim: 'trim', plate: 'main' },
  'shield.tower': { outline: 'tower', w: 0.25, h: 0.48, face: 'rivets', dish: 0.06, barrel: true, rim: 'dark', plate: 'main' },
  'shield.pavise': { outline: 'pavise', w: 0.27, h: 0.52, face: 'spine', dish: 0.05, barrel: true, rim: 'trim', plate: 'main' },
  'shield.aegis': { outline: 'tower', w: 0.27, h: 0.5, face: 'sun', dish: 0.06, barrel: true, rim: 'trim', plate: 'main' },
  'shield.bone': { outline: 'round', w: 0.25, h: 0.25, face: 'spokes', dish: 0.03, rim: 'none', plate: 'bone' },
  'shield.grim': { outline: 'grim', w: 0.24, h: 0.3, face: 'skull', dish: 0.04, rim: 'bone', plate: 'bone' },
  'shield.trollnest': { outline: 'round', w: 0.28, h: 0.28, face: 'nest', dish: 0.08, rim: 'none', plate: 'main' },
  'shield.aeons': { outline: 'tower', w: 0.28, h: 0.5, face: 'clock', dish: 0.06, barrel: true, rim: 'trim', plate: 'main' },
};

const SHIELD_BY_SHAPE: Record<string, string> = {
  shield: 'shield.round',
  'shield.buckler': 'shield.buckler',
  'shield.round': 'shield.round',
  'shield.kite': 'shield.kite',
  'shield.tower': 'shield.tower',
  'shield.bone': 'shield.bone',
  buckler: 'shield.buckler',
};

function shieldOutline(o: Outline, w: number, h: number): V2[] {
  switch (o) {
    case 'round':
      return circle2(0, 0, w, 44);
    case 'heater':
      return [[-w, h], [w, h], ...qb([w, h * 0.96], [w * 1.02, -h * 0.35], [0, -h], 12).slice(1), ...qb([0, -h], [-w * 1.02, -h * 0.35], [-w, h * 0.96], 12).slice(1, -1)];
    case 'kite':
      return [...arc2(0, h * 0.42, w, h * 0.58, 0, PI, 16), ...qb([-w, h * 0.42], [-w * 0.9, -h * 0.4], [0, -h], 14).slice(1), ...qb([0, -h], [w * 0.9, -h * 0.4], [w, h * 0.42], 14).slice(1, -1)];
    case 'dragon':
      return [[w * 1.25, h * 1.0], [w * 0.5, h * 0.8], [0, h * 0.92], [-w * 0.5, h * 0.8], [-w * 1.25, h * 1.0], [-w, h * 0.5], ...qb([-w, h * 0.5], [-w * 0.85, -h * 0.4], [0, -h], 14).slice(1), ...qb([0, -h], [w * 0.85, -h * 0.4], [w, h * 0.5], 14).slice(1, -1)];
    case 'monarch':
      return [[w, h * 0.78], [w * 0.62, h * 0.9], [w * 0.5, h * 1.06], [w * 0.3, h * 0.88], [0, h * 1.1], [-w * 0.3, h * 0.88], [-w * 0.5, h * 1.06], [-w * 0.62, h * 0.9], [-w, h * 0.78], ...qb([-w, h * 0.78], [-w * 0.95, -h * 0.35], [0, -h], 14).slice(1), ...qb([0, -h], [w * 0.95, -h * 0.35], [w, h * 0.78], 14).slice(1, -1)];
    case 'tower':
      return [[-w, -h], [w, -h], [w, h * 0.85], ...arc2(0, h * 0.85, w, h * 0.15, 0, PI, 12).slice(1, -1), [-w, h * 0.85]];
    case 'pavise':
      return [[-w * 0.92, -h], [w * 0.92, -h], [w, h * 0.7], [w * 0.7, h * 0.92], [0, h], [-w * 0.7, h * 0.92], [-w, h * 0.7]];
    case 'luna': {
      const outer = arc2(0, 0, w, h, PI * 0.08, PI * 1.92, 30);
      const inner = arc2(w * 0.42, 0, w * 0.55, h * 0.62, PI * 1.38, PI * 0.62, 20);
      return [...outer, ...inner];
    }
    case 'grim':
      return smoothOutline([[-w, h * 0.7], [-w * 0.5, h], [0, h * 0.82], [w * 0.5, h], [w, h * 0.7], [w * 0.95, -h * 0.2], [w * 0.45, -h * 0.8], [0, -h], [-w * 0.45, -h * 0.8], [-w * 0.95, -h * 0.2]], 48);
  }
}

/** How far forward the face sits at (x, y). */
function bulge(c: ShieldCut, x: number, y: number): number {
  const R = Math.max(c.w, c.h);
  if (c.barrel) return c.dish * (1 - (x * x) / (c.w * c.w)) - c.dish;
  return c.dish * (1 - (x * x + y * y) / (R * R)) - c.dish;
}

export function buildShield(P: Parts): void {
  const L = P.look;
  const c = cutOf(SHIELD_CUTS, SHIELD_BY_SHAPE, L, 'shield.round');
  const thick = c.face === 'nest' ? 0.03 : 0.018;
  const outline = shieldOutline(c.outline, c.w, c.h);
  const zf = (x: number, y: number) => bulge(c, x, y) + c.dish;
  // The board: an extruded outline bent forward into a dish.
  const board = slab(outline, thick, { bevel: 0.004, curveSegments: 2 });
  const pos = board.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + zf(pos.getX(i), pos.getY(i)));
  board.computeVertexNormals();
  let plate: Slot = c.plate;
  if (plate === 'main' && L.material === 'bone') plate = 'bone';
  if (c.face === 'nest') plate = 'dark';
  if (c.face !== 'spokes') P.add(plate, c.face === 'nest' ? rough(board, 0.006, 3, 20) : board);
  const front = (x: number, y: number, lift = 0) => v3(x, y, zf(x, y) + thick * 0.5 + lift);
  // The rim, following the edge.
  if (c.rim !== 'none') {
    const pts = outline.map(([x, y]) => v3(x, y, zf(x, y)));
    pts.push(pts[0]!.clone());
    P.add(c.rim, tube(pts, thick * 0.75, 6));
  }
  const spots: Array<{ p: V3; n: V3; s: number }> = [];
  const R = Math.min(c.w, c.h);
  let faceP = front(0, 0, 0.01);
  const boss = (r: number, slot: Slot, spikeLen = 0) => {
    const p = front(0, 0);
    P.add(slot, lathe([[r, 0], [r * 0.96, r * 0.2], [r * 0.75, r * 0.45], [r * 0.4, r * 0.6], [0.001, r * 0.64]], 16), { p: [p.x, p.y, p.z - 0.002], r: [PI / 2, 0, 0] });
    P.add(slot, torus(r, r * 0.08, 4, 20), { p: [p.x, p.y, p.z] });
    if (spikeLen) P.add(slot, spike(spikeLen, r * 0.3, 6), { p: [p.x, p.y, p.z + r * 0.55], r: [PI / 2, 0, 0] });
    faceP = p.clone().add(v3(0, 0, r * 0.64));
  };
  const rivetRing = (n: number, rr: number, slot: Slot, s = 0.007) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      const p = front(Math.cos(a) * rr, Math.sin(a) * rr);
      P.add(slot, sphere(s, 6, 4), { p: [p.x, p.y, p.z] });
    }
  };
  switch (c.face) {
    case 'buckler':
      boss(R * 0.42, 'main');
      rivetRing(6, R * 0.72, 'dark');
      break;
    case 'defender':
      boss(R * 0.32, 'main', R * 0.4);
      rivetRing(12, R * 0.86, 'trim', 0.008);
      P.add('main', torus(R * 0.62, 0.006, 4, 32), { p: [0, 0, zf(0, R * 0.62) + thick * 0.5] });
      break;
    case 'ridge': {
      const pts = [front(0, c.h * 0.95), front(0, 0), front(0, -c.h * 0.9)];
      P.add('trim', tube(curve(pts, 12), 0.008, 5));
      P.add('trim', box(c.w * 1.9, 0.02, 0.01, 0.003), { p: [0, c.h * 0.88, zf(0, c.h * 0.88) + thick * 0.5] });
      faceP = front(0, c.h * 0.3, 0.004);
      break;
    }
    case 'planks':
      for (let i = -2; i <= 2; i++) {
        const x = (i + 0.5) * c.w * 0.36;
        if (Math.abs(x) > c.w * 0.95) continue;
        const hh = Math.sqrt(Math.max(0, c.w * c.w - x * x)) * 0.97;
        P.add('dark', tube([front(x, -hh, -0.0005), front(x, 0), front(x, hh, -0.0005)], 0.0018, 3));
      }
      boss(R * 0.24, 'dark');
      rivetRing(10, R * 0.9, 'dark', 0.006);
      break;
    case 'rings':
      for (const k of [0.45, 0.68, 0.88]) P.add('main', torus(R * k, 0.007, 4, 40), { p: [0, 0, zf(0, R * k) + thick * 0.5] });
      boss(R * 0.26, 'main');
      rivetRing(8, R * 0.56, 'dark');
      break;
    case 'moon': {
      // A face in the crescent, stars in the hollow.
      const p = front(-c.w * 0.45, -c.h * 0.1, 0.002);
      P.add('trim', sphere(0.02, 8, 6), { p: [p.x, p.y, p.z], s: [1, 1, 0.4] });
      for (let i = 0; i < 4; i++) {
        const sp = v3(c.w * (0.45 + 0.12 * Math.sin(i * 2.2)), c.h * (-0.36 + 0.24 * i), 0.012);
        P.add('glow', new THREE.OctahedronGeometry(0.012, 0), { p: [sp.x, sp.y, sp.z], s: [1, 1, 0.3] });
      }
      faceP = p;
      break;
    }
    case 'cross':
      P.add('trim', tube(curve([front(0, c.h * 0.95), front(0, 0), front(0, -c.h * 0.92)], 14), 0.009, 5));
      P.add('trim', tube(curve([front(-c.w * 0.95, c.h * 0.42), front(0, c.h * 0.42), front(c.w * 0.95, c.h * 0.42)], 14), 0.009, 5));
      faceP = front(0, c.h * 0.42, 0.01);
      break;
    case 'scales':
      for (let row = 0; row < 6; row++) {
        for (let k = -3; k <= 3; k++) {
          const x = k * c.w * 0.26 + (row % 2) * c.w * 0.13;
          const y = c.h * (0.55 - row * 0.2);
          if (Math.abs(x) > c.w * (0.9 - row * 0.1)) continue;
          const p = front(x, y, 0.001);
          P.add('main', sphere(c.w * 0.13, 6, 4), { p: [p.x, p.y, p.z], s: [1, 1.1, 0.25] });
        }
      }
      for (const s of [-1, 1]) P.add('main', spike(0.07, 0.012, 4), { p: [s * c.w * 1.22, c.h * 1.0, zf(s * c.w, c.h)], r: [0, 0, -s * 0.8] });
      break;
    case 'crown': {
      P.add('trim', tube(curve([front(0, c.h * 0.85), front(0, 0), front(0, -c.h * 0.9)], 14), 0.01, 5));
      P.add('trim', tube(curve([front(-c.w * 0.9, c.h * 0.35), front(0, c.h * 0.35), front(c.w * 0.9, c.h * 0.35)], 14), 0.01, 5));
      const inner = shieldOutline('monarch', c.w * 0.86, c.h * 0.86).map(([x, y]) => front(x, y, 0.001));
      inner.push(inner[0]!.clone());
      P.add('trim', tube(inner, 0.005, 4));
      const p = front(0, c.h * 0.35, 0.01);
      for (let i = 0; i < 3; i++) P.add('trim', cone(0.012, 0.035, 4), { p: [(i - 1) * 0.022, p.y + 0.03, p.z], s: [1, 1, 0.5] });
      faceP = p;
      break;
    }
    case 'rivets':
      P.add('main', box(0.03, c.h * 1.8, 0.012, 0.004), { p: [0, -c.h * 0.05, zf(0, 0) + thick * 0.5] });
      for (let row = 0; row < 9; row++) {
        for (const x of [-c.w * 0.85, c.w * 0.85]) {
          const p = front(x, -c.h * 0.9 + row * c.h * 0.22);
          P.add('dark', sphere(0.006, 6, 4), { p: [p.x, p.y, p.z] });
        }
      }
      for (const y of [-c.h * 0.5, c.h * 0.4]) {
        const band = [front(-c.w, y), front(0, y, 0.002), front(c.w, y)];
        P.add('dark', tube(curve(band, 12), 0.006, 4));
      }
      faceP = front(0, c.h * 0.15, 0.012);
      break;
    case 'spine': {
      P.add('trim', box(0.06, c.h * 1.85, 0.03, 0.01), { p: [0, 0, zf(0, 0) + thick * 0.5 + 0.008] });
      for (const s of [-1, 1]) P.add('dark', spike(0.06, 0.012, 4), { p: [s * c.w * 0.7, -c.h - 0.04, 0], r: [PI, 0, 0] });
      for (const y of [-c.h * 0.7, 0, c.h * 0.6]) P.add('trim', box(c.w * 1.6, 0.012, 0.01, 0.003), { p: [0, y, zf(0, y) + thick * 0.5] });
      faceP = front(0, c.h * 0.3, 0.03);
      break;
    }
    case 'sun': {
      boss(R * 0.3, 'trim');
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * PI * 2;
        const len = R * (i % 2 ? 0.35 : 0.55);
        const p = front(Math.cos(a) * (R * 0.32 + len * 0.5), Math.sin(a) * (R * 0.32 + len * 0.5), 0.002);
        P.add('trim', cone(R * 0.06, len, 4), aim(p, v3(Math.cos(a), Math.sin(a), 0), [1, 1, 0.3]));
      }
      break;
    }
    case 'spokes': {
      // Bones laid out like the spokes of a wheel, lashed with cord.
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * PI * 2;
        const a0 = front(Math.cos(a) * R * 0.15, Math.sin(a) * R * 0.15, -0.006);
        const a1 = front(Math.cos(a) * R, Math.sin(a) * R, -0.006);
        P.add('bone', tube([a0, a1], (t) => 0.012 * (1 + 0.5 * Math.pow(Math.abs(2 * t - 1), 6)), 6));
        P.add('bone', sphere(0.015, 6, 5), { p: [a1.x, a1.y, a1.z] });
      }
      for (const k of [0.45, 0.8]) P.add('second', torus(R * k, 0.004, 4, 40), { p: [0, 0, zf(0, R * k) + 0.004] });
      skull(P, 'bone', front(0, 0, 0.02), R * 0.36, v3(0, 0, 1));
      faceP = front(0, 0, 0.05);
      break;
    }
    case 'skull': {
      skull(P, 'bone', front(0, 0, 0.03), c.w * 0.9, v3(0, 0, 1));
      for (const s of [-1, 1]) P.add('bone', tube(curve([front(s * c.w * 0.5, c.h * 0.9), v3(s * c.w * 0.9, c.h * 1.2, 0.04), v3(s * c.w * 1.0, c.h * 1.45, 0.0)], 10), (t) => 0.022 * (1 - t) + 0.002, 6));
      faceP = front(0, -c.h * 0.6, 0.004);
      break;
    }
    case 'nest': {
      // Sticks woven over the dome, bones pushed through.
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * PI;
        const d = v3(Math.cos(a), Math.sin(a), 0);
        const pts = [-1, -0.5, 0, 0.5, 1].map((t) => front(d.x * t * R, d.y * t * R, 0.006 * Math.sin(t * 9 + i)));
        P.add('wood', tube(curve(pts, 10), 0.007, 4));
      }
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        const p = front(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6);
        P.add('bone', tube([p, p.clone().add(v3(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.06))], 0.008, 5));
      }
      for (const d of sphereDirs(5)) {
        const p = front(d.x * R * 0.3, d.y * R * 0.3, 0.015);
        P.add('bone', sphere(0.022, 8, 6), { p: [p.x, p.y, p.z], s: [0.8, 1, 0.8] });
      }
      faceP = front(0, 0, 0.03);
      break;
    }
    case 'clock': {
      const p0 = front(0, c.h * 0.15);
      for (const k of [0.4, 0.7, 0.95]) P.add('trim', torus(c.w * k, 0.006, 4, 40), { p: [p0.x, p0.y, p0.z + 0.004] });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * PI * 2;
        P.add('trim', box(0.008, i % 3 === 0 ? 0.04 : 0.022, 0.006), aim(v3(Math.cos(a) * c.w * 0.82, p0.y + Math.sin(a) * c.w * 0.82, p0.z + 0.006), v3(Math.cos(a), Math.sin(a), 0)));
      }
      P.add('glow', box(0.01, c.w * 0.6, 0.004), { p: [c.w * 0.1, p0.y + c.w * 0.28, p0.z + 0.01], r: [0, 0, -0.35] });
      P.add('glow', box(0.012, c.w * 0.4, 0.004), { p: [-c.w * 0.18, p0.y + c.w * 0.05, p0.z + 0.012], r: [0, 0, 1.4] });
      P.add('trim', sphere(0.018, 8, 6), { p: [p0.x, p0.y, p0.z + 0.012] });
      faceP = p0.clone().add(v3(0, 0, 0.02));
      break;
    }
  }
  // The back: a handle and an arm strap.
  P.add('dark', tube(curve([v3(-0.05, 0, -0.004), v3(-0.035, 0, -0.04), v3(0.035, 0, -0.04), v3(0.05, 0, -0.004)], 10), 0.008, 6));
  P.add('second', box(0.03, Math.min(c.h, 0.2) * 1.2, 0.006), { p: [0, 0.06, -0.012], r: [0, 0, PI / 2] });
  if (L.hasTrim && c.rim === 'none') {
    const pts = outline.map(([x, y]) => v3(x * 0.98, y * 0.98, zf(x, y) + thick * 0.4));
    pts.push(pts[0]!.clone());
    P.add('trim', tube(pts, 0.004, 4));
  }
  if (L.hasTrim && c.rim !== 'none' && c.rim !== 'trim') {
    const inner = outline.map(([x, y]) => front(x * 0.88, y * 0.88, 0.001));
    inner.push(inner[0]!.clone());
    P.add('trim', tube(inner, 0.004, 4));
  }
  if (L.hasRunes || (L.glow > 0 && L.rarityTier >= 1) || L.design) {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2 + 0.2;
      const x = Math.cos(a) * c.w * 0.72;
      const y = Math.sin(a) * c.h * 0.72;
      const p = front(x, y, 0.0015);
      P.add('glow', box(0.012, 0.02, 0.002), { p: [p.x, p.y, p.z], r: [0, 0, a] });
    }
  }
  P.anchors.axis = { a: v3(0, -c.h, zf(0, -c.h)), b: v3(0, c.h, zf(0, c.h)), r: c.w * 0.5 };
  P.anchors.head = { p: front(0, c.h * 0.6), r: c.w * 0.5 };
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * PI * 2;
    const x = Math.cos(a) * c.w * 0.75;
    const y = Math.sin(a) * c.h * 0.75;
    P.point(front(x, y), v3(0, 0, 1), c.w * 0.15);
  }
  P.anchors.face = { p: faceP, n: v3(0, 0, 1), s: Math.min(c.w, c.h) * 0.3 };
  P.anchors.grip = { a: v3(-0.035, 0, -0.04), b: v3(0.035, 0, -0.04) };
  spots.push({ p: faceP.clone(), n: v3(0, 0, 1), s: R * 0.18 });
  for (const s of [-1, 1]) spots.push({ p: front(s * c.w * 0.6, c.h * 0.55, 0.004), n: v3(0, 0, 1), s: R * 0.1 });
  spots.push({ p: front(0, -c.h * 0.7, 0.004), n: v3(0, 0, 1), s: R * 0.1 });
  dressGems(P, spots);
}

// ===========================================================================
// QUIVERS
// ===========================================================================

type QuiverKind = 'ragged' | 'hunters' | 'runic' | 'endless';

const QUIVER_CUTS: Record<string, { kind: QuiverKind; len: number; r: number; arrows: number }> = {
  'quiver.ragged': { kind: 'ragged', len: 0.5, r: 0.05, arrows: 5 },
  'quiver.hunters': { kind: 'hunters', len: 0.56, r: 0.056, arrows: 9 },
  'quiver.runic': { kind: 'runic', len: 0.58, r: 0.058, arrows: 11 },
  'quiver.endless': { kind: 'endless', len: 0.6, r: 0.06, arrows: 13 },
};

export function buildQuiver(P: Parts): void {
  const L = P.look;
  const c = cutOf(QUIVER_CUTS, { quiver: 'quiver.ragged' }, L, 'quiver.ragged');
  const y0 = -c.len * 0.5;
  const y1 = c.len * 0.5;
  const body: Slot = c.kind === 'endless' ? 'trim' : c.kind === 'ragged' ? 'cloth' : 'main';
  const prof: V2[] = [[0.001, y0], [c.r * 0.8, y0], [c.r * 0.95, y0 + 0.03], [c.r, y1 - 0.06], [c.r * 1.08, y1], [c.r * 0.98, y1 + 0.002]];
  let g = lathe(prof, 14, { sz: 0.75 });
  if (c.kind === 'ragged') g = rough(g, 0.003, 9, 35);
  P.add(body, g);
  // Arrows: shafts fanning out of the mouth, fletched.
  for (let i = 0; i < c.arrows; i++) {
    const a = i * 2.4;
    const rr = c.r * 0.55 * Math.sqrt((i + 0.5) / c.arrows);
    const base = v3(Math.cos(a) * rr, y1 - 0.05, Math.sin(a) * rr * 0.75);
    const tip = base.clone().add(v3(Math.cos(a) * 0.02, 0.14 + (i % 3) * 0.015, Math.sin(a) * 0.015));
    P.add('wood', tube([base, tip], 0.0035, 4));
    const dir = tip.clone().sub(base).normalize();
    const fl = c.kind === 'endless' ? 'glow' : 'cloth';
    for (let k = 0; k < 3; k++) {
      const vane: V2[] = [[0, 0], [0.012, 0.01], [0.012, 0.05], [0, 0.06]];
      P.add(fl, slab(vane, 0.0012), aim(tip.clone().addScaledVector(dir, -0.06), dir, 1, (k / 3) * PI * 2 + a));
    }
  }
  const strapSlot: Slot = c.kind === 'endless' ? 'trim' : 'second';
  switch (c.kind) {
    case 'ragged': {
      for (const y of [y0 + 0.12, y1 - 0.14]) P.add('second', torus(c.r * 1.01, 0.004, 4, 16), { p: [0, y, 0], r: [PI / 2, 0, 0], s: [1, 0.75, 1] });
      for (let i = 0; i < 3; i++) P.add('second', box(0.04, 0.05, 0.002), { p: [Math.cos(i * 2) * c.r, y0 + 0.15 + i * 0.1, Math.sin(i * 2) * c.r * 0.75], r: [0, -i * 2 + PI / 2, 0.2 * i] });
      break;
    }
    case 'hunters': {
      P.add('cloth', rough(torus(c.r * 1.08, 0.016, 6, 18), 0.004, 4, 60), { p: [0, y1 - 0.01, 0], r: [PI / 2, 0, 0], s: [1, 0.75, 1] });
      for (const y of [y0 + 0.1, y1 - 0.15]) {
        P.add(strapSlot, torus(c.r * 1.02, 0.006, 4, 18), { p: [0, y, 0], r: [PI / 2, 0, 0], s: [1, 0.75, 1] });
        P.add('trim', box(0.018, 0.016, 0.006, 0.002), { p: [0, y, c.r * 0.78] });
      }
      break;
    }
    case 'runic': {
      for (const y of [y0 + 0.015, y1 - 0.02]) P.add('dark', cyl(c.r * 1.06, c.r * 1.06, 0.04, 14), { p: [0, y, 0], s: [1, 1, 0.75] });
      runes(P, y0 + 0.08, y1 - 0.1, 0.02, c.r * 0.78, L.signature, 4);
      break;
    }
    case 'endless': {
      for (const y of [y0 + 0.02, y1 - 0.03]) P.add('trim', torus(c.r * 1.03, 0.008, 5, 18), { p: [0, y, 0], r: [PI / 2, 0, 0], s: [1, 0.75, 1] });
      const wing: V2[] = [[0, 0], [0.04, 0.02], [0.08, 0.08], [0.05, 0.07], [0.06, 0.11], [0.02, 0.07], [0, 0.05]];
      for (const s of [-1, 1]) P.add('trim', slab(wing, 0.004), { p: [s * c.r * 0.9, y1 - 0.12, 0], s: [s, 1, 1] });
      P.add('glow', torus(c.r * 0.7, 0.003, 3, 18), { p: [0, y1 + 0.02, 0], r: [PI / 2, 0, 0] });
      break;
    }
  }
  // The shoulder strap.
  P.add(strapSlot, tube(curve([v3(0, y0 + 0.06, -c.r * 0.75), v3(0, 0, -c.r * 1.1), v3(0, y1 - 0.04, -c.r * 0.8)], 10), 0.006, 4, { flat: 0.3 }));
  P.anchors.axis = { a: v3(0, y0, 0), b: v3(0, y1, 0), r: c.r };
  P.anchors.head = { p: v3(0, y1 + 0.06, 0), r: c.r };
  for (let i = 0; i < 8; i++) {
    const a = i * 2.2;
    P.point(v3(Math.cos(a) * c.r, y0 + 0.08 + i * 0.05, Math.sin(a) * c.r * 0.75), v3(Math.cos(a), 0, Math.sin(a)), c.r * 0.3);
  }
  P.anchors.face = { p: v3(0, 0, c.r * 0.76), n: v3(0, 0, 1), s: c.r * 0.5 };
  dressGems(P, [
    { p: v3(0, y1 - 0.03, c.r * 0.82), n: v3(0, 0, 1), s: 0.014 },
    { p: v3(0, y0 + 0.03, c.r * 0.8), n: v3(0, 0, 1), s: 0.012 },
    { p: v3(0, 0, c.r * 0.76), n: v3(0, 0, 1), s: 0.014 },
  ]);
}
