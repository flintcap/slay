/**
 * SLAY — parts every weapon family shares: grips, guards, pommels, bands,
 * gem settings and rune inlays.
 *
 * Each takes the `Parts` being built and adds to it. Kinds are named so the
 * per-base tables in the family builders read like a smith's order: "leaf
 * blade, block guard, ribbed bone grip, ball pommel".
 */
import * as THREE from 'three';
import type { ItemLook } from '../ItemLook';
import { Parts, type Hardpoint, type Slot } from './Parts';
import { box, cone, curve, cyl, gem, horn, jitter, lathe, mergeSeams, slab, smoothOutline, sphere, torus, tube, v3, type V3 } from './Geo';

export type Wrap = 'leather' | 'cord' | 'wire' | 'bone' | 'wood' | 'ribbed' | 'cloth';
export type GuardKind = 'none' | 'bar' | 'crescent' | 'drooping' | 'disc' | 'block' | 'swept' | 'cup' | 'ringed' | 'winged' | 'sun' | 'lugs' | 'claw' | 'shell';
export type PommelKind = 'none' | 'disc' | 'wheel' | 'ball' | 'scent' | 'fishtail' | 'ring' | 'spike' | 'crown' | 'skull' | 'gem' | 'cap' | 'knob';

/**
 * A grip along Y, centred on `y0`..`y1`. Wraps read as a spiral ridge
 * (leather), tight rings (cord), fine lines (wire) or knuckled segments (bone).
 */
export function grip(P: Parts, y0: number, y1: number, r: number, wrap: Wrap, slot: Slot = 'second'): void {
  const len = y1 - y0;
  const seg = 12;
  const steps = Math.max(8, Math.round(len / 0.006));
  const g = new THREE.CylinderGeometry(r, r, len, seg, steps, false);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const turns = wrap === 'cord' ? len / 0.007 : wrap === 'wire' ? len / 0.004 : len / 0.016;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const rad = Math.hypot(x, z);
    if (rad < 1e-6) continue;
    const a = Math.atan2(z, x);
    const t = (y + len / 2) / len;
    // Swell in the middle of the hand, flare at the ends.
    let k = 1 + 0.06 * Math.sin(t * Math.PI);
    if (wrap === 'leather' || wrap === 'cloth') k *= 1 + 0.07 * Math.pow(Math.abs(Math.sin(a + t * turns * Math.PI * 2)), 6);
    else if (wrap === 'cord' || wrap === 'wire') k *= 1 + (wrap === 'cord' ? 0.1 : 0.05) * Math.abs(Math.sin(t * turns * Math.PI));
    else if (wrap === 'bone') k *= 1 + 0.16 * Math.pow(Math.abs(Math.cos(t * Math.PI * 3)), 8);
    else if (wrap === 'ribbed') k *= 1 + 0.1 * Math.pow(Math.abs(Math.cos(t * Math.PI * 4)), 4);
    pos.setXYZ(i, (x / rad) * r * k, y, (z / rad) * r * k);
  }
  g.translate(0, (y0 + y1) / 2, 0);
  const slotFor: Slot = wrap === 'wire' ? 'trim' : wrap === 'bone' ? 'bone' : wrap === 'wood' ? 'wood' : wrap === 'cloth' ? 'cloth' : slot;
  P.add(slotFor, mergeSeams(g));
  P.anchors.grip = { a: v3(0, y0, 0), b: v3(0, y1, 0) };
}

/** A straight or curved bar along X through (0, y), tapering out to finials. */
function quillon(P: Parts, slot: Slot, w: number, r: number, y: number, bendUp: number, finial: 'ball' | 'flare' | 'curl' | 'none'): void {
  const pts: V3[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (t - 0.5) * w;
    const e = Math.pow(Math.abs(2 * t - 1), 2);
    pts.push(v3(x, y + bendUp * e * w * 0.5, 0));
  }
  P.add(slot, tube(pts, (t) => r * (0.85 + 0.45 * Math.pow(Math.abs(2 * t - 1), 3)), 6, { flat: 0.75 }));
  for (const s of [-1, 1]) {
    const end = v3(s * w * 0.5, y + bendUp * w * 0.5, 0);
    if (finial === 'ball') P.add(slot, sphere(r * 1.35, 8, 6), { p: [end.x, end.y, end.z] });
    else if (finial === 'flare') P.add(slot, cone(r * 1.7, r * 2.6, 6), { p: [end.x + s * r * 0.8, end.y, 0], r: [0, 0, s * -Math.PI / 2] });
    else if (finial === 'curl') P.add(slot, torus(r * 1.6, r * 0.55, 5, 10), { p: [end.x + s * r * 1.2, end.y + r, 0] });
  }
}

/**
 * The guard at height `y`, `w` wide. `d` is its depth (Z). Returns the
 * height where the blade should start.
 */
export function guard(P: Parts, kind: GuardKind, y: number, w: number, d: number, slot: Slot = 'trim'): number {
  const r = d * 0.5;
  switch (kind) {
    case 'none':
      return y;
    case 'bar':
      quillon(P, slot, w, r, y + r, 0, 'ball');
      P.add(slot, box(Math.max(r * 3, w * 0.18), r * 2.6, d * 1.15, r * 0.4), { p: [0, y + r * 1.3, 0] });
      return y + r * 2.4;
    case 'crescent':
      quillon(P, slot, w, r, y + r, 0.55, 'flare');
      P.add(slot, box(w * 0.2, r * 2.8, d * 1.2, r * 0.5), { p: [0, y + r * 1.4, 0] });
      return y + r * 2.6;
    case 'drooping':
      quillon(P, slot, w, r, y + r * 1.5, -0.6, 'curl');
      P.add(slot, box(w * 0.22, r * 3, d * 1.2, r * 0.5), { p: [0, y + r * 1.5, 0] });
      return y + r * 2.8;
    case 'disc': {
      P.add(slot, cyl(w * 0.5, w * 0.5, r * 1.6, 16), { p: [0, y + r * 0.8, 0] });
      P.add(slot, torus(w * 0.5, r * 0.45, 5, 18), { p: [0, y + r * 0.8, 0], r: [Math.PI / 2, 0, 0] });
      return y + r * 1.6;
    }
    case 'block': {
      const g = sphere(0.5, 14, 8);
      g.scale(w, r * 3.2, d * 1.6);
      P.add(slot, g, { p: [0, y + r * 1.3, 0] });
      P.add(slot, torus(w * 0.42, r * 0.3, 4, 16), { p: [0, y + r * 1.3, 0], r: [Math.PI / 2, 0, 0], s: [1, d * 1.6 / w * 1.25, 1] });
      return y + r * 2.4;
    }
    case 'swept': {
      quillon(P, slot, w, r * 0.8, y + r, 0.25, 'ball');
      // Knuckle bow from the guard round to the pommel, on the edge side.
      const bow = curve([v3(w * 0.18, y + r, 0), v3(w * 0.32, y - 0.04, 0), v3(w * 0.3, y - 0.12, 0), v3(0.012, y - 0.155, 0)], 16);
      P.add(slot, tube(bow, r * 0.6, 6));
      // Side rings either side of the blade root.
      for (const s of [-1, 1]) P.add(slot, torus(w * 0.16, r * 0.4, 4, 14), { p: [0, y + r * 2.2, s * w * 0.06], r: [s * 0.5, 0, 0] });
      return y + r * 2;
    }
    case 'cup': {
      P.add(slot, lathe([[0.004, y + r * 2.2], [w * 0.22, y + r * 1.8], [w * 0.42, y + r * 0.6], [w * 0.5, y - r * 0.6], [w * 0.47, y - r * 0.8], [w * 0.38, y + r * 0.3], [0.004, y + r * 1.4]], 20));
      quillon(P, slot, w * 0.95, r * 0.6, y + r * 2.3, 0, 'ball');
      return y + r * 2.6;
    }
    case 'ringed': {
      quillon(P, slot, w, r * 0.9, y + r, 0.15, 'ball');
      for (const s of [-1, 1]) P.add(slot, torus(w * 0.11, r * 0.42, 5, 16), { p: [s * w * 0.13, y + r * 2.4 + w * 0.09, 0] });
      P.add(slot, box(w * 0.16, r * 3, d * 1.2, r * 0.5), { p: [0, y + r * 1.5, 0] });
      return y + r * 2.8;
    }
    case 'winged': {
      for (const s of [-1, 1]) {
        const h = horn(w * 0.55, r * 1.1, 1.4, 6);
        // Bend toward +X; mirror for the left wing; lay it outward and up.
        P.add(slot, h, { p: [s * w * 0.06, y + r, 0], r: [0, 0, s * -1.4], s: [-s, 1, 0.7] });
      }
      P.add(slot, box(w * 0.22, r * 3.2, d * 1.3, r * 0.6), { p: [0, y + r * 1.4, 0] });
      return y + r * 2.8;
    }
    case 'sun': {
      P.add(slot, cyl(w * 0.24, w * 0.24, d * 1.1, 16), { p: [0, y + w * 0.16, 0], r: [Math.PI / 2, 0, 0] });
      const rays = 9;
      for (let i = 0; i < rays; i++) {
        const a = Math.PI * (0.05 + (0.9 * i) / (rays - 1));
        const len = i % 2 ? w * 0.22 : w * 0.34;
        P.add(slot, cone(r * 0.9, len, 4), { p: [Math.cos(a) * (w * 0.24 + len * 0.45), y + w * 0.16 - Math.sin(a) * (w * 0.24 + len * 0.45) * 0.55, 0], r: [0, 0, a + Math.PI / 2], s: [1, 1, 0.6] });
      }
      return y + w * 0.3;
    }
    case 'lugs': {
      quillon(P, slot, w, r, y + r, -0.1, 'flare');
      return y + r * 2.2;
    }
    case 'claw': {
      for (const s of [-1, 1]) P.add(slot, horn(w * 0.5, r, 1.6, 6), { p: [s * w * 0.05, y, 0], r: [0, 0, s * -0.5], s: [-s, 1, 0.8] });
      P.add(slot, box(w * 0.2, r * 2.4, d * 1.2, r * 0.5), { p: [0, y + r, 0] });
      return y + r * 2;
    }
    case 'shell': {
      const o = smoothOutline([[-w * 0.5, 0], [-w * 0.3, r * 2], [0, r * 3], [w * 0.3, r * 2], [w * 0.5, 0], [0, -r * 1.2]], 32);
      P.add(slot, slab(o, d * 1.2), { p: [0, y + r, 0] });
      return y + r * 3;
    }
  }
}

/** The pommel below the grip at `y` (its top), `s` its size. */
export function pommel(P: Parts, kind: PommelKind, y: number, s: number, slot: Slot = 'trim'): void {
  switch (kind) {
    case 'none':
      return;
    case 'disc':
      P.add(slot, cyl(s, s, s * 0.7, 14), { p: [0, y - s * 0.95, 0], r: [Math.PI / 2, 0, 0] });
      P.add(slot, cyl(s * 0.35, s * 0.5, s * 0.4, 8), { p: [0, y - s * 0.2, 0] });
      return;
    case 'wheel':
      P.add(slot, lathe([[0.001, -s * 0.45], [s * 0.7, -s * 0.45], [s, -s * 0.2], [s, s * 0.2], [s * 0.7, s * 0.45], [0.001, s * 0.45]], 16), { p: [0, y - s, 0], r: [Math.PI / 2, 0, 0] });
      P.add(slot, sphere(s * 0.38, 8, 6), { p: [0, y - s, s * 0.42] });
      P.add(slot, sphere(s * 0.38, 8, 6), { p: [0, y - s, -s * 0.42] });
      return;
    case 'ball':
      P.add(slot, sphere(s, 12, 8), { p: [0, y - s * 0.85, 0] });
      P.add(slot, cyl(s * 0.4, s * 0.55, s * 0.4, 8), { p: [0, y - s * 0.1, 0] });
      return;
    case 'scent':
      P.add(slot, lathe([[s * 0.35, 0], [s * 0.8, -s * 0.5], [s, -s * 1.2], [s * 0.7, -s * 1.9], [s * 0.2, -s * 2.3], [0.001, -s * 2.4]], 12), { p: [0, y, 0] });
      return;
    case 'fishtail': {
      const o = smoothOutline([[-s * 0.3, 0], [-s * 1.2, -s * 1.4], [-s * 0.4, -s * 1.1], [0, -s * 1.5], [s * 0.4, -s * 1.1], [s * 1.2, -s * 1.4], [s * 0.3, 0]], 30);
      P.add(slot, slab(o, s * 0.8), { p: [0, y, 0] });
      return;
    }
    case 'ring':
      P.add(slot, torus(s * 0.8, s * 0.26, 6, 14), { p: [0, y - s * 0.95, 0] });
      return;
    case 'spike':
      P.add(slot, cone(s * 0.6, s * 2.6, 6), { p: [0, y - s * 1.3, 0], r: [Math.PI, 0, 0] });
      P.add(slot, sphere(s * 0.6, 8, 6), { p: [0, y - s * 0.2, 0] });
      return;
    case 'crown': {
      P.add(slot, lathe([[s * 0.4, 0], [s * 0.9, -s * 0.4], [s, -s * 1.1], [0.001, -s * 1.3]], 12), { p: [0, y, 0] });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        P.add(slot, cone(s * 0.18, s * 0.7, 4), { p: [Math.cos(a) * s * 0.85, y - s * 1.2, Math.sin(a) * s * 0.85], r: [Math.PI, 0, 0] });
      }
      return;
    }
    case 'skull':
      skull(P, slot, v3(0, y - s * 1.05, 0), s * 1.1, v3(0, -1, 0));
      return;
    case 'gem':
      P.add(slot, lathe([[s * 0.45, 0], [s, -s * 0.6], [s * 0.85, -s * 1.3], [0.001, -s * 1.4]], 10), { p: [0, y, 0] });
      setGem(P, v3(0, y - s * 0.9, 0), v3(0, 0, 1), s * 0.9, false);
      setGem(P, v3(0, y - s * 0.9, 0), v3(0, 0, -1), s * 0.9, false);
      return;
    case 'cap':
      P.add(slot, lathe([[s * 0.8, 0], [s, -s * 0.3], [s * 0.85, -s * 0.8], [0.001, -s * 0.9]], 10), { p: [0, y, 0] });
      return;
    case 'knob':
      P.add(slot, lathe([[s * 0.5, 0], [s * 0.9, -s * 0.5], [s * 0.6, -s * 1.1], [0.001, -s * 1.15]], 10), { p: [0, y, 0] });
      return;
  }
}

/**
 * A stone in a bezel at `p`, table facing `n`. `bezel` false skips the
 * metal cup (for stones set flush in a pommel).
 */
export function setGem(P: Parts, p: V3, n: V3, size: number, bezel = true, cut: Parameters<typeof gem>[1] = 'round'): void {
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), n.clone().normalize());
  const m = new THREE.Matrix4().compose(p.clone().addScaledVector(n, size * 0.08), q, v3(1, 1, 1));
  P.add('gem', gem(size, cut), m);
  if (bezel) {
    const b = torus(size * 0.52, size * 0.1, 4, 12);
    b.rotateX(Math.PI / 2);
    P.add('trim', b, m);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const prong = cone(size * 0.08, size * 0.3, 4);
      prong.translate(Math.cos(a) * size * 0.5, size * 0.12, Math.sin(a) * size * 0.5);
      P.add('trim', prong, m);
    }
  }
}

/** A ring band round the Y axis at height y. */
export function band(P: Parts, y: number, r: number, h: number, slot: Slot = 'trim', seg = 14): void {
  P.add(slot, lathe([[r, y - h / 2], [r * 1.12, y - h * 0.3], [r * 1.12, y + h * 0.3], [r, y + h / 2]], seg));
}

/** Glowing rune marks running up an axis on the +Z and -Z faces. */
export function runes(P: Parts, y0: number, y1: number, w: number, z: number, seed: number, n?: number, x = 0): void {
  const count = n ?? Math.max(3, Math.round((y1 - y0) / (w * 1.8)));
  for (let i = 0; i < count; i++) {
    const y = y0 + ((i + 0.5) / count) * (y1 - y0);
    const kind = Math.abs(Math.floor(jitter(i, seed) * 4));
    const s = w * 0.5;
    for (const side of [1, -1]) {
      const zz = z * side;
      if (kind === 0) P.add('glow', box(s * 0.25, s * 1.6, 0.0016), { p: [x, y, zz] });
      if (kind <= 1) P.add('glow', box(s * 1.1, s * 0.22, 0.0016), { p: [x, y + s * 0.3, zz], r: [0, 0, 0.5] });
      if (kind === 2) P.add('glow', torus(s * 0.45, s * 0.12, 3, 8), { p: [x, y, zz] });
      if (kind >= 2) P.add('glow', box(s * 0.22, s * 1.3, 0.0016), { p: [x + s * 0.25, y, zz], r: [0, 0, -0.35] });
      if (kind === 3) P.add('glow', box(s * 0.9, s * 0.2, 0.0016), { p: [x, y - s * 0.4, zz] });
    }
  }
}

/** A small skull facing `face`, centre `p`, size `s` (its height). */
export function skull(P: Parts, slot: Slot, p: V3, s: number, face: V3 = v3(0, 0, 1)): void {
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), face.clone().normalize());
  const m = new THREE.Matrix4().compose(p, q, v3(1, 1, 1));
  const cran = sphere(s * 0.5, 12, 9);
  cran.scale(0.9, 0.95, 1);
  P.add(slot, cran, m.clone().multiply(new THREE.Matrix4().makeTranslation(0, s * 0.12, 0)));
  P.add(slot, box(s * 0.62, s * 0.36, s * 0.55, s * 0.12), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, -s * 0.25, s * 0.1)));
  // Eye sockets: dark recesses read as holes from a distance.
  for (const sx of [-1, 1]) P.add('dark', sphere(s * 0.13, 8, 6), m.clone().multiply(new THREE.Matrix4().makeTranslation(sx * s * 0.17, s * 0.02, s * 0.4)));
  P.add('dark', cone(s * 0.07, s * 0.14, 3), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, -s * 0.13, s * 0.44)));
}

/** A haft along Y from y0 to y1 (wood by default), slightly swelled. */
export function haft(P: Parts, y0: number, y1: number, r: number, slot: Slot = 'wood', o: { taper?: number; knots?: number; seed?: number; sides?: number } = {}): void {
  const len = y1 - y0;
  const taper = o.taper ?? 0.85;
  const prof: Array<[number, number]> = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    prof.push([r * (1 - (1 - taper) * t) * (1 + 0.04 * Math.sin(t * Math.PI)), y0 + t * len]);
  }
  prof.unshift([0.001, y0]);
  prof.push([0.001, y1]);
  P.add(slot, lathe(prof, o.sides ?? 10));
  for (let k = 0; k < (o.knots ?? 0); k++) {
    const t = 0.15 + 0.7 * ((jitter(k, o.seed ?? 3) + 1) / 2);
    const a = jitter(k + 9, o.seed ?? 3) * Math.PI;
    P.add(slot, sphere(r * 0.45, 6, 5), { p: [Math.cos(a) * r * 0.85, y0 + t * len, Math.sin(a) * r * 0.85], s: [1, 1.5, 1] });
  }
}

/** Langets: metal strips running down a haft from the head. */
export function langets(P: Parts, y0: number, y1: number, r: number, slot: Slot = 'trim'): void {
  for (const s of [-1, 1]) {
    P.add(slot, box(r * 0.7, y1 - y0, r * 0.25, r * 0.1), { p: [0, (y0 + y1) / 2, s * r * 1.02] });
    for (let i = 0; i < 3; i++) P.add(slot, sphere(r * 0.22, 6, 4), { p: [0, y0 + ((i + 0.5) / 3) * (y1 - y0), s * r * 1.15] });
  }
}

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};


/** Merges a unique's cut override onto a base cut. */
export function withOverride<T extends object>(cut: T, o: Record<string, number | string | boolean> | undefined): T {
  if (!o) return cut;
  const out = { ...cut } as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) out[k] = v;
  return out as T;
}

/**
 * The cut for this item: its own base, else the shape's stand-in, else the
 * family default; then the unique's overrides on top.
 */
export function cutOf<T extends object>(table: Record<string, T>, byShape: Record<string, string>, L: ItemLook, def: string): T {
  const s = L.silhouette;
  const base = table[L.cut] ?? table[byShape[s] ?? ''] ?? table[byShape[s.split('.')[0]!] ?? ''] ?? table[def]!;
  return withOverride(base, L.cutOverride);
}

/** Sets the look's stones on the given spots, in order, as many as it has. */
export function dressGems(P: Parts, spots: Hardpoint[], cut: Parameters<typeof gem>[1] = 'round'): void {
  const n = Math.min(P.look.gemCount, spots.length);
  for (let i = 0; i < n; i++) setGem(P, spots[i]!.p, spots[i]!.n, spots[i]!.s, true, cut);
}

/** A transform that puts a +Y-built part at `p` pointing along `dir`. */
export function aim(p: V3, dir: V3, s: number | [number, number, number] = 1, spin = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir.clone().normalize());
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), spin));
  const sc = typeof s === 'number' ? v3(s, s, s) : v3(...s);
  return new THREE.Matrix4().compose(p, q, sc);
}

export type V2 = [number, number];

/** Points on a quadratic curve from a through control c to b (n + 1 points). */
export function qb(a: V2, c: V2, b: V2, n = 8): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** Points on an elliptical arc, angles in radians (n + 1 points). */
export function arc2(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 12, wobble?: (t: number) => number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    const k = wobble ? wobble(t) : 1;
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}

/** Points spread evenly over a sphere (Fibonacci), unit length. */
export function sphereDirs(n: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * 2.399963;
    out.push(v3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  return out;
}

/** Rings of a circle in the XY plane: n points, radius r, centre (cx, cy). */
export function circle2(cx: number, cy: number, r: number, n = 12): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}
