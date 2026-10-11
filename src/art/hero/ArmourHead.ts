/**
 * SLAY — helms, one cut per base.
 *
 * Hoods, caps and crowns are helm bases too. Each base in `HELMS` builds its
 * own shape on this hero's head: a leather hood, an iron skull cap, a
 * brimmed and crested casque, a nasal helm with a mail curtain, a visored
 * close helm, a flat-topped great helm, a bone cap, a horned bone mask, a
 * spired helm ringed with spikes, and the circlet, coronet, diadem and
 * corona that leave the face and hair free.
 */
import * as THREE from 'three';
import { G } from './Anatomy';
import type { Clip } from './Mesher';
import { FieldBuilder, rot } from './Sdf';
import { Kit, V, hem, sdBox, sdEll, smooth, type Anchor, type F3, type MatKey } from './ArmourKit';

/** Keeps everything above a plane through (0, back, -0.45) and (0, front, 0.45), head units. */
function capLine(k: Kit, front: number, back: number): Clip {
  const slope = (front - back) / 0.9;
  const n = V(0, -1, slope);
  const len = n.length();
  return { n: n.normalize(), d: (-(back + 0.45 * slope) * k.h) / len };
}

/** A cut made of many holes (each a distance field, negative inside): removes them all. */
function holes(list: F3[]): Clip {
  return {
    cut: (x, y, z) => {
      let d = Infinity;
      for (const f of list) d = Math.min(d, f(x, y, z));
      return d;
    },
  };
}

type HelmFn = (k: Kit) => void;

/** The skull: a dome a little larger than the head, room for the hair under it. */
function dome(F: FieldBuilder, k: Kit, grow = 1): void {
  F.ellipsoid(k.H(0, 7.13, -0.07), V(0.42 * grow * k.h, 0.46 * grow * k.h, 0.51 * grow * k.h), 0.08 * k.h);
}

function headShell(k: Kit, name: string, mat: MatKey, F: FieldBuilder, clips: Clip[], t: number, o: { groups?: number[]; trimW?: number; edge?: Clip[]; tris?: number; yLo?: number; force?: boolean } = {}): void {
  const h = k.h;
  const edges = (o.edge ?? clips).map((c) => k.inside(c));
  k.edged(name, mat, {
    groups: o.groups ?? [G.head],
    thickness: hem(t, edges, 0.03 * h, 0.7),
    clips,
    extra: F.prims,
    skinGroups: o.groups ?? [G.head],
    cell: 0.006,
    tris: o.tris ?? 2600,
    yRange: [(o.yLo ?? 6.2) * h, 8.0 * h],
  }, o.trimW ?? 0.05, o.edge, o.force);
}

/** A dark fill behind a slit or an eye hole, so it reads as shadow rather than a face. */
function shadow(k: Kit, c: THREE.Vector3, r: THREE.Vector3): void {
  k.fit('void', G.head, 0.005).ellipsoid(c, r, 0.01 * k.h);
}

function rivetRing(k: Kit, y: number, n: number, r: number, mat: MatKey): void {
  const h = k.h;
  const F = k.fit(mat, G.head, 0.004);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    F.ellipsoid(k.H(Math.sin(a) * r, y, Math.cos(a) * r * 1.16 - 0.07), V(0.028 * h, 0.028 * h, 0.028 * h), 0.003 * h);
  }
}

function horn(F: FieldBuilder, pts: THREE.Vector3[], r0: number, r1: number, k: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / (pts.length - 1);
    const t1 = (i + 1) / (pts.length - 1);
    F.cone(pts[i]!, pts[i + 1]!, r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, k);
  }
}

/** The face opening of a hood or open helm. */
const faceHole = (k: Kit, w = 0.27, hgt = 0.42): Clip => ({ cut: (x, y, z) => sdEll(x, y, z, k.H(0, 6.86, 0.5), k.H(w, hgt, 0.42)) });

const HELMS: Record<string, HelmFn> = {
  'helm.cap'(k) {
    // A leather hood with a peak behind, the face open.
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.head;
    F.ellipsoid(k.H(0, 7.12, -0.1), V(0.43 * h, 0.5 * h, 0.53 * h), 0.12 * h);
    F.cone(k.H(0, 7.3, -0.3), k.H(0, 7.02, -0.74), 0.17 * h, 0.03 * h, 0.12 * h);
    const clips = [faceHole(k), k.above(5.8)];
    k.edged('hood', 'main', {
      groups: [G.head, G.torso],
      thickness: (x, y, z) => 0.014 + 0.003 * Math.sin(x * 40 + z * 25) * Math.sin(y * 30),
      clips,
      extra: F.prims,
      skinGroups: [G.head, G.torso],
      cell: 0.007,
      tris: 2600,
      yRange: [5.7 * h, 7.9 * h],
    }, 0.05, [clips[0]!]);
    k.hides.push('hair');
  },
  'helm.skullcap'(k) {
    const F = new FieldBuilder();
    F.group = G.head;
    dome(F, k);
    headShell(k, 'cap', 'main', F, [capLine(k, 7.08, 6.95)], 0.0095, { force: true, trimW: 0.045 });
    rivetRing(k, 7.06, 10, 0.43, k.trimmed ? 'trim' : 'iron');
    // A raised band over the crown, front to back.
    k.fit('main', G.head, 0.005).box(k.H(0, 7.58, -0.06), V(0.05 * k.h, 0.03 * k.h, 0.42 * k.h), 0.02 * k.h, 0.05 * k.h, rot(0.05, 0, 0));
    k.hides.push('hair');
  },
  'helm.casque'(k) {
    // A brimmed, crested casque.
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.head;
    dome(F, k);
    F.ellipsoid(k.H(0, 7.0, -0.06), V(0.66 * h, 0.045 * h, 0.74 * h), 0.08 * h);
    headShell(k, 'casque', 'main', F, [capLine(k, 6.98, 6.92)], 0.0105);
    k.fit(k.trimmed ? 'trim' : 'main', G.head, 0.005).box(k.H(0, 7.66, -0.07), V(0.022 * h, 0.15 * h, 0.44 * h), 0.015 * h, 0.06 * h);
    // Upturned brim tips, front and back.
    const B = k.fit('main', G.head, 0.005);
    B.ellipsoid(k.H(0, 7.06, 0.66), V(0.2 * h, 0.03 * h, 0.12 * h), 0.04 * h, rot(-0.5, 0, 0));
    B.ellipsoid(k.H(0, 7.06, -0.8), V(0.2 * h, 0.03 * h, 0.12 * h), 0.04 * h, rot(0.5, 0, 0));
    k.hides.push('hair');
  },
  'helm.helm'(k) {
    // A conical nasal helm with cheek guards and a mail curtain.
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.head;
    dome(F, k);
    F.cone(k.H(0, 7.25, -0.06), k.H(0, 8.05, -0.1), 0.42 * h, 0.04 * h, 0.16 * h);
    headShell(k, 'helm', 'main', F, [capLine(k, 7.0, 6.92)], 0.0105, { force: true, trimW: 0.04 });
    const B = k.fit('main', G.head, 0.005);
    B.box(k.H(0, 6.94, 0.53), V(0.035 * h, 0.17 * h, 0.03 * h), 0.012 * h, 0.03 * h);
    for (const s of [1, -1]) B.box(k.H(s * 0.39, 6.78, 0.22), V(0.035 * h, 0.24 * h, 0.17 * h), 0.03 * h, 0.04 * h, rot(0.1, s * 0.35, s * -0.05));
    // Banded segments over the cone.
    const T = k.fit(k.trimmed ? 'trim' : 'iron', G.head, 0.005);
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      T.cone(k.H(Math.sin(a) * 0.45, 7.04, Math.cos(a) * 0.52 - 0.07), k.H(Math.sin(a) * 0.06, 7.95, Math.cos(a) * 0.06 - 0.1), 0.03 * h, 0.02 * h, 0.01 * h);
    }
    // Aventail: mail hanging from the rim round the neck.
    const A = new FieldBuilder();
    A.group = G.head;
    A.ellipsoid(k.H(0, 6.75, -0.12), V(0.45 * h, 0.55 * h, 0.5 * h), 0.12 * h);
    const clips: Clip[] = [faceHole(k, 0.3, 0.5), k.below(7.0), k.above(5.9)];
    k.shell('aventail', 'chain', {
      groups: [G.head, G.torso],
      thickness: 0.012,
      clips,
      extra: A.prims,
      skinGroups: [G.head, G.torso],
      cell: 0.008,
      tris: 1600,
      yRange: [5.8 * h, 7.1 * h],
    });
    k.hides.push('hair');
  },
  'helm.full'(k) {
    // A close helm: visor with an eye slit and breaths, a low comb.
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.head;
    dome(F, k, 1.02);
    F.ellipsoid(k.H(0, 6.74, 0.14), V(0.38 * h, 0.4 * h, 0.44 * h), 0.12 * h);
    F.ellipsoid(k.H(0, 6.86, 0.36), V(0.24 * h, 0.3 * h, 0.22 * h), 0.12 * h);
    const slit = (x: number, y: number, z: number) => sdBox(x, y, z, k.H(0, 7.0, 0.6), k.H(0.28, 0.035, 0.3), 0.015 * h);
    const breaths: F3[] = [slit];
    for (let i = -2; i <= 2; i++) breaths.push((x, y, z) => sdBox(x, y, z, k.H(i * 0.07, 6.68, 0.6), k.H(0.018, 0.09, 0.3), 0.01 * h));
    headShell(k, 'helm', 'main', F, [k.above(6.3), holes(breaths)], 0.0105, { edge: [k.above(6.3)] });
    shadow(k, k.H(0, 7.0, 0.36), V(0.26 * h, 0.05 * h, 0.06 * h));
    shadow(k, k.H(0, 6.68, 0.42), V(0.17 * h, 0.1 * h, 0.05 * h));
    k.fit(k.trimmed ? 'trim' : 'main', G.head, 0.005).box(k.H(0, 7.6, -0.08), V(0.02 * h, 0.05 * h, 0.4 * h), 0.015 * h, 0.05 * h);
    k.hides.push('hair', 'beard', 'brows');
  },
  'helm.great'(k) {
    // The great helm: a flat-topped bucket with a cross of slits.
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.head;
    F.cone(k.H(0, 6.3, -0.03), k.H(0, 7.8, -0.05), 0.54 * h, 0.5 * h, 0.04 * h);
    const slits: F3[] = [
      (x, y, z) => sdBox(x, y, z, k.H(0, 7.02, 0.6), k.H(0.36, 0.035, 0.2), 0.01 * h),
      (x, y, z) => sdBox(x, y, z, k.H(0, 6.75, 0.6), k.H(0.03, 0.22, 0.2), 0.01 * h),
    ];
    for (let i = 0; i < 6; i++) {
      const a = 0.5 + i * 0.12;
      for (const s of [1, -1]) slits.push((x, y, z) => sdEll(x, y, z, k.H(s * Math.sin(a) * 0.55, 6.62 + (i % 2) * 0.1, Math.cos(a) * 0.55), k.H(0.025, 0.025, 0.08)));
    }
    headShell(k, 'great', 'main', F, [k.below(7.78), k.above(6.32), holes(slits)], 0.009, { edge: [k.below(7.78), k.above(6.32)], tris: 2000 });
    shadow(k, k.H(0, 7.02, 0.42), V(0.34 * h, 0.05 * h, 0.06 * h));
    shadow(k, k.H(0, 6.75, 0.46), V(0.04 * h, 0.22 * h, 0.05 * h));
    // A cross of reinforcing bands.
    const T = k.fit(k.trimmed ? 'trim' : 'iron', G.head, 0.005);
    T.box(k.H(0, 7.42, 0.53), V(0.035 * h, 0.32 * h, 0.03 * h), 0.01 * h, 0.01 * h);
    T.cone(k.H(0, 7.13, -0.04), k.H(0, 7.21, -0.04), 0.585 * h, 0.585 * h, 0.01 * h);
    k.hides.push('hair', 'beard', 'brows');
  },
  'helm.bone'(k) {
    // A cap carved from a skull: heavy brow, cheekbones, two stub horns.
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.head;
    dome(F, k);
    F.ellipsoid(k.H(0, 7.14, 0.42), V(0.42 * h, 0.08 * h, 0.12 * h), 0.06 * h);
    headShell(k, 'skull', 'main', F, [capLine(k, 7.02, 6.88)], 0.011, { trimW: 0.04 });
    const B = k.fit('main', G.head, 0.005);
    for (const s of [1, -1]) {
      B.ellipsoid(k.H(s * 0.37, 6.86, 0.28), V(0.07 * h, 0.2 * h, 0.12 * h), 0.03 * h, rot(0, 0, s * 0.15));
      horn(B, [k.H(s * 0.28, 7.42, 0.1), k.H(s * 0.4, 7.7, 0.08), k.H(s * 0.42, 7.92, -0.04)], 0.08 * h, 0.01 * h, 0.03 * h);
    }
    // Sutures.
    const D = k.fit('void', G.head, 0.004);
    D.box(k.H(0, 7.6, -0.05), V(0.008 * h, 0.01 * h, 0.3 * h), 0.004 * h, 0.004 * h);
    k.hides.push('hair');
  },
  'helm.grim'(k) {
    // A bone mask over the upper face, teeth along its edge, horns curling back.
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.head;
    dome(F, k);
    F.ellipsoid(k.H(0, 7.1, 0.44), V(0.42 * h, 0.09 * h, 0.12 * h), 0.06 * h);
    F.ellipsoid(k.H(0, 6.86, 0.5), V(0.1 * h, 0.2 * h, 0.08 * h), 0.08 * h);
    const eyes: F3[] = [1, -1].map((s) => (x: number, y: number, z: number) => sdEll(x, y, z, k.H(s * 0.16, 6.98, 0.55), k.H(0.09, 0.07, 0.3)));
    // The lower edge: down to the nose in front, the dome's rim behind.
    const maskLine: Clip = { cut: (x, y, z) => y - (6.62 * h + 0.33 * h * smooth(0.15 * h, -0.2 * h, z)) };
    headShell(k, 'mask', 'main', F, [maskLine, holes(eyes)], 0.011, { edge: [maskLine] });
    for (const s of [1, -1]) shadow(k, k.H(s * 0.16, 6.98, 0.42), V(0.07 * h, 0.05 * h, 0.04 * h));
    const T = k.fit('bone', G.head, 0.0045);
    for (let i = 0; i < 8; i++) {
      const a = (i - 3.5) * 0.17;
      const p = k.H(Math.sin(a) * 0.46, 6.66, Math.cos(a) * 0.5);
      T.cone(p, p.clone().add(V(0, -0.1 * h, 0.01 * h)), 0.03 * h, 0.004 * h, 0.006 * h);
    }
    const Hn = k.fit('bone', G.head, 0.006);
    for (const s of [1, -1]) {
      horn(Hn, [k.H(s * 0.36, 7.35, 0.0), k.H(s * 0.7, 7.55, -0.1), k.H(s * 0.95, 7.32, -0.32), k.H(s * 0.92, 6.98, -0.18), k.H(s * 0.8, 6.9, 0.1)], 0.13 * h, 0.012 * h, 0.03 * h);
    }
    k.hides.push('hair', 'brows');
  },
  'helm.spired'(k) {
    // A dark close helm with a snouted visor, a crown of spikes and a tall spire.
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.head;
    dome(F, k, 1.03);
    F.ellipsoid(k.H(0, 6.74, 0.14), V(0.38 * h, 0.4 * h, 0.44 * h), 0.12 * h);
    F.cone(k.H(0, 6.86, 0.4), k.H(0, 6.8, 0.74), 0.2 * h, 0.07 * h, 0.08 * h);
    const cuts: F3[] = [(x, y, z) => sdBox(x, y, z, k.H(0, 7.02, 0.6), k.H(0.3, 0.03, 0.3), 0.012 * h)];
    for (let i = -1; i <= 1; i++) cuts.push((x, y, z) => sdBox(x, y, z, k.H(i * 0.07, 6.8, 0.8), k.H(0.012, 0.05, 0.2), 0.006 * h));
    headShell(k, 'helm', 'main', F, [k.above(6.3), holes(cuts)], 0.011, { edge: [k.above(6.3)] });
    shadow(k, k.H(0, 7.02, 0.38), V(0.28 * h, 0.045 * h, 0.06 * h));
    const S = k.fit(k.trimmed ? 'trim' : 'main', G.head, 0.006);
    S.cone(k.H(0, 7.5, -0.07), k.H(0, 8.75, -0.16), 0.14 * h, 0.008 * h, 0.08 * h);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = k.H(Math.sin(a) * 0.4, 7.42, Math.cos(a) * 0.46 - 0.07);
      S.cone(p, p.clone().add(V(Math.sin(a) * 0.14 * h, 0.36 * h, Math.cos(a) * 0.14 * h)), 0.05 * h, 0.004 * h, 0.02 * h);
    }
    k.hides.push('hair', 'beard', 'brows');
  },
  'helm.circlet'(k) {
    band(k, 0.042, 0.0065);
    gemAt(k, k.H(0, 7.22, 0.47), 0.045);
  },
  'helm.coronet'(k) {
    const h = k.h;
    band(k, 0.055, 0.0075);
    const F = k.fit('main', G.head, 0.0045);
    for (let i = 0; i < 7; i++) {
      const a = (i - 3) * 0.42;
      const p = k.H(Math.sin(a) * 0.44, 7.26, Math.cos(a) * 0.5 - 0.06);
      const tall = (i === 3 ? 0.24 : i % 2 ? 0.12 : 0.17) * h;
      F.cone(p, p.clone().add(V(Math.sin(a) * 0.03 * h, tall, Math.cos(a) * 0.03 * h)), 0.04 * h, 0.005 * h, 0.012 * h);
      if (i % 2 === 0) k.fit('gem', G.head, 0.004).ellipsoid(p.clone().add(V(Math.sin(a) * 0.04 * h, 0, Math.cos(a) * 0.04 * h)), V(0.025 * h, 0.025 * h, 0.02 * h), 0.004 * h);
    }
  },
  'helm.diadem'(k) {
    // A high mithril peak over the brow with a great stone, filigree sweeping back.
    const h = k.h;
    band(k, 0.05, 0.007);
    const F = k.fit('main', G.head, 0.0045);
    F.box(k.H(0, 7.48, 0.49), V(0.07 * h, 0.22 * h, 0.012 * h), 0.03 * h, 0.03 * h, rot(-0.25, 0, Math.PI / 4));
    F.cone(k.H(0, 7.5, 0.48), k.H(0, 7.98, 0.38), 0.05 * h, 0.004 * h, 0.02 * h);
    for (const s of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const a = s * (0.7 + i * 0.32);
        const p = k.H(Math.sin(a) * 0.45, 7.3, Math.cos(a) * 0.5 - 0.06);
        F.cone(p, p.clone().add(V(Math.sin(a) * 0.05 * h, (0.2 - 0.04 * i) * h, -0.12 * h)), 0.025 * h, 0.004 * h, 0.01 * h);
      }
    }
    gemAt(k, k.H(0, 7.36, 0.53), 0.07);
  },
  'helm.corona'(k) {
    // An open mithril helm crowned with a ring of rays behind the head.
    const h = k.h;
    const F = new FieldBuilder();
    F.group = G.head;
    dome(F, k);
    headShell(k, 'helm', 'main', F, [capLine(k, 7.04, 6.9)], 0.0105, { force: true, trimW: 0.045 });
    const B = k.fit('main', G.head, 0.005);
    for (const s of [1, -1]) B.box(k.H(s * 0.39, 6.8, 0.2), V(0.035 * h, 0.22 * h, 0.16 * h), 0.03 * h, 0.04 * h, rot(0.1, s * 0.35, s * -0.05));
    const R = k.fit('trim', G.head, 0.005);
    const c = k.H(0, 7.25, -0.5);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const d = V(Math.cos(a), Math.sin(a), 0);
      R.cone(c.clone().addScaledVector(d, 0.52 * h), c.clone().addScaledVector(d, (i % 2 ? 0.78 : 0.98) * h), 0.045 * h, 0.004 * h, 0.01 * h);
    }
    const Gl = k.fit('glow', G.head, 0.005);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      Gl.ellipsoid(c.clone().add(V(Math.cos(a) * 0.52 * h, Math.sin(a) * 0.52 * h, 0)), V(0.06 * h, 0.06 * h, 0.03 * h), 0.04 * h);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.4;
      const p = k.H(Math.sin(a) * 0.44, 7.3, Math.cos(a) * 0.5 - 0.06);
      R.cone(p, p.clone().add(V(0, (i === 2 ? 0.3 : 0.18) * h, 0)), 0.04 * h, 0.004 * h, 0.012 * h);
    }
    k.hides.push('hair');
  },
};

/** A metal band round the brow. */
function band(k: Kit, w: number, t: number): void {
  const h = k.h;
  const n = V(0, 1, -0.25).normalize();
  const mid = k.H(0, 7.22, 0);
  k.shell('band', 'main', {
    groups: [G.head],
    thickness: t,
    clips: [{ cut: (x, y, z) => w * h - Math.abs(n.x * x + n.y * y + n.z * z - n.dot(mid)) }],
    skinGroups: [G.head],
    cell: 0.0045,
    tris: 1200,
    yRange: [6.9 * h, 7.6 * h],
  });
}

function gemAt(k: Kit, p: THREE.Vector3, r: number): void {
  const h = k.h;
  k.fit('trim', G.head, 0.004).ellipsoid(p.clone().add(V(0, 0, -0.01 * h)), V((r + 0.02) * h, (r + 0.025) * h, 0.02 * h), 0.006 * h);
  k.fit('gem', G.head, 0.004).ellipsoid(p.clone().add(V(0, 0, 0.012 * h)), V(r * h, r * 1.2 * h, r * 0.7 * h), 0.006 * h);
}

/** A cut by silhouette and tier for helms outside the table. */
function fallback(kind: string, tier: number): HelmFn {
  const by: Record<string, string[]> = {
    cap: ['helm.cap', 'helm.skullcap', 'helm.casque'],
    full: ['helm.helm', 'helm.full', 'helm.great'],
    horned: ['helm.bone', 'helm.grim', 'helm.spired'],
    circlet: ['helm.circlet', 'helm.coronet', 'helm.diadem'],
  };
  const list = by[kind] ?? by.full!;
  return HELMS[list[Math.min(2, Math.max(0, tier))]!]!;
}

export function helm(k: Kit): Anchor[] {
  const h = k.h;
  (HELMS[k.look.cut] ?? fallback(k.look.kind, k.look.baseTier))(k);
  const crown = !k.hides.includes('hair');
  // Rare and better helms carry a stone at the brow (crowns place their own).
  if (k.look.hasGems && !crown) gemAt(k, k.H(0, 7.22, 0.53), 0.04);
  if (k.look.hasRunes && !crown) {
    const F = k.fit('glow', G.head, 0.004);
    for (let i = 0; i < 6; i++) {
      const a = (i - 2.5) * 0.35;
      F.box(k.H(Math.sin(a) * 0.46, 7.36, Math.cos(a) * 0.53 - 0.07), V(0.03 * h, 0.012 * h, 0.006 * h), 0.003 * h, 0.002 * h, rot(0, a, 0));
    }
  }
  const top = crown ? 7.5 : 7.68;
  return [
    { p: k.H(0, top, -0.05), n: V(0, 1, 0), g: G.head, s: 0.25 * h, role: 'crown' },
    { p: k.H(0.44, 7.25, -0.05), n: V(1, 0.2, 0).normalize(), g: G.head, s: 0.18 * h, role: 'temple' },
    { p: k.H(-0.44, 7.25, -0.05), n: V(-1, 0.2, 0).normalize(), g: G.head, s: 0.18 * h, role: 'temple' },
    { p: k.H(0, 7.3, 0.5), n: V(0, 0.3, 1).normalize(), g: G.head, s: 0.15 * h, role: 'brow' },
  ];
}

