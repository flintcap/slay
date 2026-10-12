/**
 * SLAY — body armour, one cut per base.
 *
 * Every chest base has its own entry in `CHEST_CUTS`: what layer it is (a
 * padded gambeson, a robe, a leather jerkin, a mail hauberk, a coat of
 * scales, a plate cuirass over mail), how long its sleeves and hem run, the
 * surface pattern pressed into it (quilting, rings, scales, splints,
 * flutes), and what it carries over that (pauldrons, faulds, tassets, a
 * gorget, a collar, a tabard, a cape). Higher bases are cut grander; rarity
 * adds trim, a breast stone and glowing runes; uniques and sets add a cape
 * and their features (`ArmourFeatures.ts`).
 */
import { G } from './Anatomy';
import type { GarmentSpec } from './Garment';
import type { Clip } from './Mesher';
import { Field, FieldBuilder, alongY, rot, type Prim } from './Sdf';
import { Kit, V, basis, fract, hem, smooth, type Anchor, type F3, type MatKey } from './ArmourKit';
import { patternedMaterial, type ArmourPattern } from './HeroMaterials';

type Layer = 'gambeson' | 'robe' | 'jerkin' | 'hauberk' | 'scales' | 'cuirass';
type Pattern = 'plain' | 'folds' | 'quilt' | 'lace' | 'rings' | 'chain' | 'scales' | 'hide' | 'splints' | 'shell' | 'fluted' | 'lames';
type Pauldron = 'pad' | 'leather' | 'hide' | 'round' | 'pointed' | 'dome' | 'winged' | 'shell' | 'bone' | 'mantle';
type Collar = 'cowl' | 'high' | 'spikes' | 'coif' | 'mantle' | 'stand';

interface ChestCut {
  layer: Layer;
  /** Sleeve end: 0..1 shoulder to elbow, 1..2 elbow to wrist; 0 bare arms. */
  sleeve: number;
  /** Hem height in head units: 4 the waist, 3.2 mid thigh, 2.2 the knee, 0.4 the floor. */
  hem: number;
  pattern: Pattern;
  /** Metres off the skin. */
  t: number;
  /** How much a long hem flares. */
  flare?: number;
  /** A mail shirt worn under it. */
  under?: { sleeve: number; hem: number };
  pauldron?: Pauldron;
  lames?: number;
  /** Lames of plate below the waist. */
  faulds?: number;
  /** Plates or strips over the thighs. */
  tassets?: 'plates' | 'strips' | 'tentacles';
  tassetLen?: number;
  /** Plate on the arms, with elbow cops. */
  arms?: boolean;
  gorget?: number;
  collar?: Collar;
  /** Hem height of a cloth tabard. */
  tabard?: number;
  cape?: number;
  /** Bell sleeves: radius at the cuff, head units. */
  bell?: number;
  ribs?: boolean;
  studs?: boolean;
  /** Breastplate keel: 0 none, 1 a rounded swell, 2 a sharp ridge. */
  keel?: number;
  sash?: boolean;
  /** Glowing runes along the hem. */
  hemRunes?: boolean;
  /** A sun or star at the breast. */
  sigil?: boolean;
  /** Surface the plain base is made of when its item palette would read as the bare linens. */
  tint?: string;
}

export const CHEST_CUTS: Record<string, ChestCut> = {
  // Cloth: a padded coat, then robes that grow longer and stranger.
  'chest.quilted': { layer: 'gambeson', sleeve: 1.85, hem: 3.1, pattern: 'quilt', t: 0.011, collar: 'stand', tint: 'cloth.homespun|0x8e6e4a' },
  'chest.ghost': { layer: 'robe', sleeve: 1.75, hem: 0.8, pattern: 'folds', t: 0.008, bell: 0.34, collar: 'mantle', sash: true, tint: 'cloth.silk|0xb8c4cc' },
  'chest.dusk': { layer: 'robe', sleeve: 1.9, hem: 0.4, pattern: 'folds', t: 0.008, bell: 0.44, collar: 'cowl', sash: true, hemRunes: true, flare: 1.3, tint: 'cloth.silk|0x3a2c4c' },
  'chest.aeonshroud': { layer: 'robe', sleeve: 1.85, hem: 0.3, pattern: 'folds', t: 0.008, bell: 0.4, collar: 'high', pauldron: 'mantle', cape: 5.4, hemRunes: true, sigil: true, flare: 1.4, tint: 'cloth.velvet|0x24204a' },
  // Leather: a vest, a studded coat with strips, a scaled hide with spikes.
  'chest.leather': { layer: 'jerkin', sleeve: 0, hem: 3.85, pattern: 'lace', t: 0.0095, pauldron: 'pad', lames: 1 },
  'chest.studded': { layer: 'jerkin', sleeve: 0.55, hem: 3.85, pattern: 'lace', t: 0.0105, pauldron: 'leather', lames: 2, studs: true, tassets: 'strips', tassetLen: 0.9 },
  'chest.wyrmhide': { layer: 'jerkin', sleeve: 1.0, hem: 3.3, pattern: 'hide', t: 0.0105, pauldron: 'hide', lames: 3, collar: 'spikes', tassets: 'strips', tassetLen: 1.1 },
  // Mail: short rings, a long hauberk with a mail mantle, bone woven with ribs.
  'chest.ringmail': { layer: 'hauberk', sleeve: 0.8, hem: 3.25, pattern: 'rings', t: 0.0085 },
  'chest.chainmail': { layer: 'hauberk', sleeve: 1.85, hem: 2.4, pattern: 'chain', t: 0.0085, collar: 'coif' },
  'chest.boneweave': { layer: 'hauberk', sleeve: 1.0, hem: 2.9, pattern: 'rings', t: 0.009, ribs: true, pauldron: 'bone', lames: 2 },
  // Scales: bronze shingles, steel splints, a dark shell.
  'chest.scale': { layer: 'scales', sleeve: 0.6, hem: 3.2, pattern: 'scales', t: 0.0085, pauldron: 'round', lames: 2 },
  'chest.splint': { layer: 'scales', sleeve: 1.0, hem: 2.9, pattern: 'splints', t: 0.0085, pauldron: 'round', lames: 3, gorget: 1 },
  'chest.kraken': { layer: 'scales', sleeve: 1.05, hem: 3.0, pattern: 'shell', t: 0.009, pauldron: 'shell', tassets: 'tentacles', tassetLen: 1.2, collar: 'spikes' },
  // Plate over mail, each grander than the last.
  'chest.plate': { layer: 'cuirass', sleeve: 0, hem: 4.02, pattern: 'plain', t: 0.016, keel: 1, under: { sleeve: 0.9, hem: 3.3 }, pauldron: 'round', lames: 2, faulds: 2 },
  'chest.gothic': {
    layer: 'cuirass', sleeve: 0, hem: 4.02, pattern: 'fluted', t: 0.017, keel: 2, under: { sleeve: 1.85, hem: 3.0 },
    pauldron: 'pointed', lames: 3, faulds: 3, tassets: 'plates', tassetLen: 0.6, arms: true, gorget: 1,
  },
  'chest.sacred': {
    layer: 'cuirass', sleeve: 0, hem: 4.02, pattern: 'plain', t: 0.018, keel: 1, under: { sleeve: 1.85, hem: 2.8 },
    pauldron: 'dome', lames: 4, faulds: 3, arms: true, gorget: 1, tabard: 2.2, sigil: true,
  },
  'chest.archon': {
    layer: 'cuirass', sleeve: 0, hem: 4.02, pattern: 'fluted', t: 0.019, keel: 2, under: { sleeve: 1.85, hem: 2.6 },
    pauldron: 'winged', lames: 5, faulds: 3, tassets: 'plates', tassetLen: 0.8, arms: true, gorget: 2, tabard: 2.0, cape: 5.6, sigil: true,
  },
};

/** A cut for chests outside the table (monster kit, new bases): by silhouette and tier. */
function fallbackCut(kind: string, tier: number): ChestCut {
  const by: Record<string, string[]> = {
    robe: ['chest.quilted', 'chest.ghost', 'chest.dusk'],
    leather: ['chest.leather', 'chest.studded', 'chest.wyrmhide'],
    mail: ['chest.ringmail', 'chest.chainmail', 'chest.boneweave'],
    scale: ['chest.scale', 'chest.splint', 'chest.kraken'],
    plate: ['chest.plate', 'chest.gothic', 'chest.sacred'],
  };
  const list = by[kind] ?? by.leather!;
  return CHEST_CUTS[list[Math.min(2, Math.max(0, tier))]!]!;
}

const LEGS = [G.torso, G.legL, G.legR];

/** The skirt of the last layer cut, so runes can be set on its hem. */
let lastSkirt: Prim[] = [];

/** Where the cloth sits below the waist, measured off this body's hips and legs. */
interface Hips {
  x: number;
  zf: number;
  zb: number;
}

function hips(k: Kit, y: number): Hips {
  const hx = Math.abs(k.j.thighL.x) / k.h;
  const side = k.around(y, Math.PI / 2, LEGS).p.x;
  const front = k.around(y, 0, LEGS, hx).p.z;
  const back = k.around(y, Math.PI, LEGS, hx).p.z;
  return { x: Math.max(side, 0.55 * k.h), zf: Math.max(front, 0.25 * k.h), zb: Math.min(back, -0.3 * k.h) };
}

/**
 * A skirt that hangs clear of the legs: stacked ellipsoids from the hips to
 * the hem, flaring. Added to a torso shell's field, the shell becomes a coat
 * skirt the legs move inside.
 */
function skirt(k: Kit, hemY: number, flare = 1, pad = 0.08): Prim[] {
  const h = k.h;
  const F = new FieldBuilder();
  F.group = G.torso;
  // Starts below the belt line so a belt still sits on the waist.
  const top = 3.82;
  const base = hips(k, 3.75);
  const bottom = Math.max(0.2, hemY - 0.2);
  const n = Math.max(2, Math.ceil((top - bottom) / 0.3));
  for (let i = 0; i <= n; i++) {
    const y = top - ((top - bottom) * i) / n;
    if (i === 0) {
      F.ellipsoid(V(0, y * h, (base.zf + base.zb) / 2), V(base.x * 1.04 + pad * 0.6 * h, 0.2 * h, (base.zf - base.zb) / 2 * 1.06 + pad * 0.6 * h), 0.2 * h);
      continue;
    }
    const drop = 4.05 - y;
    // Wide enough at the diagonals to clear both thighs, not only at the sides.
    const grow = 1 + 0.05 * flare * drop;
    const rx = (base.x * 1.08 + pad * h) * grow;
    const half = ((base.zf - base.zb) / 2 * 1.08 + pad * h) * (1 + 0.04 * flare * drop);
    const cz = (base.zf + base.zb) / 2;
    F.ellipsoid(V(0, y * h, cz), V(rx, ((top - bottom) / n) * 1.25 * h, half), 0.28 * h);
  }
  return F.prims;
}

/** Cylindrical position round the torso: (arc metres, height). */
function arc(k: Kit): (x: number, z: number) => number {
  const R = 0.62 * k.h;
  const cz = -0.04 * k.h;
  return (x, z) => Math.atan2(x, z - cz) * R;
}

/** Patterns drawn in the shader (`ARMOUR_PATTERNS`): the mesh under them stays smooth. */
const RELIEF: Partial<Record<Pattern, ArmourPattern>> = { quilt: 'quilt', rings: 'rings', scales: 'scales', hide: 'hide', splints: 'splints', shell: 'shell' };

/**
 * A layer's material, with its pattern drawn in when the pattern is a relief.
 * The twin takes the slot for the whole piece, so the parts cut from it
 * after the layer (pauldrons, a coif) carry the same relief and still merge
 * into one draw.
 */
function reliefMat(k: Kit, mat: MatKey, p: Pattern): MatKey {
  const r = RELIEF[p];
  if (r) k.useMat(mat, patternedMaterial(k.mat(mat), r, k.h));
  return mat;
}

/**
 * The surface pressed into a layer, as a thickness. Fine reliefs (quilting,
 * rings, scales, splints, a shell's ridges) are drawn by the material
 * instead (`reliefMat`): pressed into the mesh they were finer than its
 * cells and came out as crumpled facets.
 */
function patterned(k: Kit, p: Pattern, t: number): F3 {
  const h = k.h;
  const U = arc(k);
  switch (p) {
    case 'plain':
    case 'chain':
    case 'quilt':
    case 'rings':
    case 'scales':
    case 'hide':
    case 'splints':
      return () => t;
    case 'folds':
      return (x, y, z) => t + Math.max(-0.003, Math.sin(Math.atan2(x, z) * 9 + Math.sin(y * 9) * 0.6) * 0.011 * smooth(4.0 * h, 1.4 * h, y));
    case 'lace':
      // A laced seam down the front, panel seams down the sides.
      return (x, y, z) => {
        const front = smooth(0.1 * h, 0.3 * h, z);
        const seam = 1 - smooth(0.012 * h, 0.03 * h, Math.abs(x));
        const cross = Math.abs(fract(y / 0.045) - 0.5) < 0.16 && Math.abs(x) < 0.05 * h ? 0.0022 : 0;
        const side = 1 - smooth(0.004, 0.012, Math.abs(Math.abs(U(x, z)) - 0.2));
        return t - 0.0035 * front * seam + cross * front - 0.0015 * side;
      };
    case 'shell':
      // The keel stays in the mesh; the growth ridges are drawn.
      return (x, _y, z) => t + 0.004 * (1 - smooth(0, 0.14 * h, Math.abs(x))) * smooth(0, 0.2 * h, z);
    case 'fluted':
      return (x, y, z) => {
        const f = Math.cos((U(x, z) / 0.042) * Math.PI);
        return t + 0.0038 * Math.pow(Math.abs(f), 3) * smooth(4.0 * h, 4.7 * h, y);
      };
    case 'lames':
      return (x, y) => t + 0.0065 * fract(-y / 0.06);
  }
}

/**
 * Keeps a chest thin where a belt goes round it, so any belt sits on top,
 * and thick enough over the hips to cover the linen trousers under it.
 */
function waist(k: Kit, f: F3, max = 0.013): F3 {
  const h = k.h;
  return (x, y, z) => {
    let v = f(x, y, z);
    if (y < 4.5 * h) v = Math.max(v, 0.0125 * smooth(4.5 * h, 4.4 * h, y));
    const w = smooth(3.98 * h, 4.12 * h, y) * (1 - smooth(4.42 * h, 4.56 * h, y));
    return v - Math.max(0, v - max) * w;
  };
}

/** Sleeve and neck clips for a body layer. */
function bodyClips(k: Kit, sleeve: number, neckF: number, neckB: number): Clip[] {
  const out: Clip[] = [k.neck(neckF, neckB)];
  out.push(k.sleeve(true, sleeve), k.sleeve(false, sleeve));
  return out;
}

/** A body layer: torso and arms, cut at the neck, sleeves and hem, with a skirt if it runs below the hips. */
function layer(
  k: Kit,
  name: string,
  mat: MatKey,
  o: { sleeve: number; hem: number; t: F3; neck: [number, number]; flare?: number; tris?: number; skirtPad?: number; trimW?: number; extra?: Prim[]; noTrim?: boolean; relief?: Pattern },
): { spec: GarmentSpec; clips: Clip[] } {
  const h = k.h;
  const arms = o.sleeve > 0;
  const clips = arms ? bodyClips(k, o.sleeve, o.neck[0], o.neck[1]) : [k.neck(o.neck[0], o.neck[1])];
  clips.push(k.above(o.hem));
  const extra: Prim[] = [...(o.extra ?? [])];
  if (o.hem < 3.95) {
    const sk = skirt(k, o.hem, o.flare ?? 1, o.skirtPad ?? 0.08);
    extra.push(...sk);
    lastSkirt = sk;
  }
  const long = o.hem < 2.5;
  const edges = clips.map((c) => k.inside(c));
  const spec: GarmentSpec = {
    // Skirted layers take the legs too, so the thighs never push through the skirt's top.
    groups: [G.torso, ...(arms ? [G.armL, G.armR] : []), ...(o.hem < 3.95 ? [G.legL, G.legR] : [])],
    thickness: hem(waist(k, o.t), edges, 0.035 * h, 0.6),
    clips,
    extra: extra.length ? extra : undefined,
    skinGroups: o.hem < 3.6 ? [G.torso, G.armL, G.armR, G.legL, G.legR] : [G.torso, G.armL, G.armR],
    cell: long ? 0.011 : 0.01,
    tris: o.tris ?? (long ? 4600 : 3600),
    yRange: [(o.hem - 0.15) * h, 6.6 * h],
  };
  const m = o.relief ? reliefMat(k, mat, o.relief) : mat;
  if (o.noTrim) k.shell(name, m, spec);
  else k.edged(name, m, spec, o.trimW ?? 0.07);
  return { spec, clips };
}

// ---------------------------------------------------------------------------
// Pieces worn over the body layer
// ---------------------------------------------------------------------------

function pauldrons(k: Kit, kind: Pauldron, n: number, cut: ChestCut): void {
  const h = k.h;
  if (kind === 'mantle') {
    // A stiff shoulder mantle with upturned points.
    const clips: Clip[] = [k.neck(6.0, 6.25), k.above(5.35), k.sleeve(true, 0.42), k.sleeve(false, 0.42)];
    k.edged('mantle', 'main', {
      groups: [G.torso, G.armL, G.armR],
      thickness: hem(0.024, clips.map((c) => k.inside(c)), 0.03 * h, 0.5),
      clips,
      skinGroups: [G.torso, G.armL, G.armR],
      cell: 0.009,
      tris: 2200,
      yRange: [5.2 * h, 6.5 * h],
    }, 0.06, undefined, true);
    for (const L of [true, false]) {
      const s = L ? 1 : -1;
      const S = k.j[L ? 'upperArmL' : 'upperArmR'];
      const F = k.fit('trim', L ? G.armL : G.armR);
      F.cone(S.clone().add(k.H(s * 0.05, 0.3, 0)), S.clone().add(k.H(s * 0.42, 0.75, -0.05)), 0.12 * h, 0.01 * h, 0.04 * h);
    }
    return;
  }
  const metal = kind === 'round' || kind === 'pointed' || kind === 'dome' || kind === 'winged';
  const big = kind === 'winged' ? 1.35 : kind === 'dome' ? 1.25 : kind === 'pointed' ? 1.12 : kind === 'pad' ? 0.9 : 1;
  const mat: MatKey = kind === 'pad' || kind === 'leather' || kind === 'hide' ? (k.look.family === 'leather' ? 'main' : 'strap') : kind === 'bone' ? 'bone' : 'main';
  for (const L of [true, false]) {
    const s = L ? 1 : -1;
    const g = L ? G.armL : G.armR;
    const up = L ? 'upperArmL' : 'upperArmR';
    const fore = L ? 'foreArmL' : 'foreArmR';
    const S = k.j[up];
    const top = k.hit([G.torso, g], S.clone().add(k.H(s * 0.02, 1.6, -0.02)), V(0, -1, 0)) ?? { p: S.clone().add(k.H(0, 0.3, 0)), n: V(0, 1, 0) };
    const F = k.fit(mat, g, 0.006);
    const rimF = k.fit('trim', g, 0.006);
    const lameAt = (i: number) => {
      if (i === 0) return top;
      return k.onLimb(up, fore, 0.02 + 0.15 * i, V(s * 0.75, 0.66, -0.05), [g, G.torso]);
    };
    if (kind === 'shell') {
      // A ribbed sea shell over the shoulder: a broad dome, ridges fanning
      // from its crown, spines round its rim and a curl of whorl on top.
      const hp = lameAt(0);
      const q = alongY(hp.n);
      const crown = hp.p.clone().addScaledVector(hp.n, 0.1 * h);
      F.ellipsoid(crown, V(0.56 * h, 0.26 * h, 0.52 * h), 0.01 * h, q);
      const top = crown.clone().addScaledVector(hp.n, 0.25 * h);
      const rim = (a: number, r = 1) => crown.clone().add(V(s * Math.cos(a) * 0.54 * h * r, -0.06 * h, Math.sin(a) * 0.5 * h * r));
      for (let i = 0; i < 7; i++) {
        const a = -1.35 + i * 0.45;
        F.cone(top, rim(a, 1.02), 0.04 * h, 0.06 * h, 0.012 * h);
      }
      const sp = k.fit('bone', g);
      for (let i = 0; i < 5; i++) {
        const a = -1.2 + i * 0.6;
        const p0 = rim(a, 0.98);
        const out = p0.clone().sub(crown).normalize();
        sp.cone(p0, p0.clone().addScaledVector(out, 0.3 * h).add(V(0, 0.06 * h, 0)), 0.055 * h, 0.004 * h, 0.01 * h);
      }
      // The whorl: three shrinking turns on the crown.
      const c0 = top.clone().add(V(s * 0.04 * h, 0.12 * h, -0.1 * h));
      const at = (u: number) => {
        const a = u * Math.PI * 1.8;
        const R = 0.24 * h * (1 - 0.68 * u);
        return c0.clone().add(V(s * 0.06 * h * u, Math.sin(a) * R, Math.cos(a) * R));
      };
      for (let i = 0; i < 8; i++) F.cone(at(i / 8), at((i + 1) / 8), 0.1 * h * (1 - 0.7 * (i / 8)), 0.1 * h * (1 - 0.7 * ((i + 1) / 8)), 0.005 * h);
      continue;
    }
    for (let i = 0; i < Math.max(1, n); i++) {
      const hp = lameAt(i);
      const sc = big * (1 - 0.07 * i);
      const lift = (kind === 'pad' ? 0.03 : 0.045) * h;
      const c = hp.p.clone().addScaledVector(hp.n, lift);
      const q = alongY(hp.n);
      const rr = V((i === 0 ? 0.42 : 0.36) * sc * h, (kind === 'pad' ? 0.1 : 0.075) * h, (i === 0 ? 0.4 : 0.33) * sc * h);
      F.ellipsoid(c, rr, 0.015 * h, q);
      if ((kind === 'dome' || kind === 'winged' || (metal && k.trimmed)) && i > 0) {
        // A rim of trim peeking from under each lame.
        rimF.group = g;
        rimF.ellipsoid(c.clone().addScaledVector(hp.n, -0.025 * h), rr.clone().multiplyScalar(1.07).setY(0.04 * h), 0.01 * h, q);
      }
    }
    const top0 = lameAt(0);
    if (kind === 'pointed' || kind === 'winged' || kind === 'dome') {
      // The haute-piece: a flange standing up beside the neck.
      const hg = top0.p.clone().add(V(-s * 0.18 * h, 0.12 * h, 0));
      const tall = kind === 'winged' ? 0.42 : kind === 'pointed' ? 0.3 : 0.2;
      F.box(hg.clone().add(V(0, tall * 0.5 * h, 0)), V(0.025 * h, tall * 0.5 * h, 0.3 * h), 0.015 * h, 0.02 * h, rot(0, 0, s * 0.25));
      if (kind === 'pointed') F.box(top0.p.clone().addScaledVector(top0.n, 0.12 * h), V(0.03 * h, 0.04 * h, 0.38 * h), 0.02 * h, 0.03 * h, alongY(top0.n));
    }
    if (kind === 'winged') {
      // Lames sweeping up and out like wings, and two spikes.
      for (let w = 0; w < 3; w++) {
        const c = top0.p.clone().add(V(s * (0.25 + 0.12 * w) * h, (0.12 + 0.16 * w) * h, -0.06 * h));
        F.ellipsoid(c, V((0.34 - 0.06 * w) * h, 0.05 * h, (0.28 - 0.04 * w) * h), 0.012 * h, rot(0, 0, s * (0.7 + 0.25 * w)));
      }
      for (const dz of [0.12, -0.14]) {
        const a = top0.p.clone().add(V(s * 0.12 * h, 0.1 * h, dz * h));
        rimF.group = g;
        rimF.cone(a, a.clone().add(V(s * 0.2 * h, 0.55 * h, dz * 0.3 * h)), 0.07 * h, 0.006 * h, 0.02 * h);
      }
    }
    if (kind === 'hide') {
      const sp = k.fit('bone', g);
      for (let i = 0; i < 3; i++) {
        const hp = lameAt(Math.min(i, n - 1));
        const a = hp.p.clone().addScaledVector(hp.n, 0.08 * h).add(V(0, 0, (i - 1) * 0.14 * h));
        sp.cone(a, a.clone().addScaledVector(hp.n, 0.22 * h).add(V(0, 0.06 * h, 0)), 0.045 * h, 0.004 * h, 0.015 * h);
      }
    }
    if (kind === 'bone') {
      // A beast's skull capping the shoulder, tusks curling forward.
      const c = top0.p.clone().addScaledVector(top0.n, 0.1 * h);
      F.ellipsoid(c, V(0.3 * h, 0.2 * h, 0.34 * h), 0.04 * h);
      F.ellipsoid(c.clone().add(V(0, -0.02 * h, 0.26 * h)), V(0.16 * h, 0.12 * h, 0.14 * h), 0.04 * h);
      F.ellipsoid(c.clone().add(V(s * 0.1 * h, 0.04 * h, 0.3 * h)), V(0.06 * h, 0.05 * h, 0.06 * h), 0.01 * h, undefined, { sub: true });
      F.ellipsoid(c.clone().add(V(-s * 0.06 * h, 0.04 * h, 0.32 * h)), V(0.05 * h, 0.05 * h, 0.06 * h), 0.01 * h, undefined, { sub: true });
      const t0 = c.clone().add(V(s * 0.12 * h, -0.08 * h, 0.3 * h));
      F.cone(t0, t0.clone().add(V(s * 0.08 * h, 0.06 * h, 0.22 * h)), 0.04 * h, 0.025 * h, 0.01 * h);
      F.cone(t0.clone().add(V(s * 0.08 * h, 0.06 * h, 0.22 * h)), t0.clone().add(V(s * 0.04 * h, 0.22 * h, 0.3 * h)), 0.025 * h, 0.004 * h, 0.01 * h);
    }
    if (kind === 'pad' || kind === 'leather' || kind === 'hide') {
      // The strap under the arm that holds it.
      const st = k.fit('strap', g);
      const a = k.onLimb(up, fore, 0.32, V(s * 0.75, 0.66, -0.05), [g]);
      st.ellipsoid(a.p, V(0.2 * h, 0.03 * h, 0.2 * h), 0.01 * h, alongY(k.j[fore].clone().sub(S)));
    }
  }
  void cut;
}

/** Lames below the cuirass: a short plated skirt. */
function faulds(k: Kit, n: number): void {
  const h = k.h;
  const top = 4.06;
  const bottom = top - n * 0.21;
  const clips: Clip[] = [k.below(top), k.above(bottom)];
  k.edged('faulds', 'main', {
    groups: [G.torso],
    thickness: hem(patterned(k, 'lames', 0.017), clips.map((c) => k.inside(c)), 0.02 * h, 0.7),
    clips,
    extra: skirt(k, bottom, 0.6, 0.12),
    skinGroups: [G.torso, G.legL, G.legR],
    cell: 0.008,
    tris: 1800,
    yRange: [(bottom - 0.1) * h, (top + 0.1) * h],
  }, 0.05, [k.above(bottom)]);
}

function tassets(k: Kit, kind: 'plates' | 'strips' | 'tentacles', len: number, startY: number): void {
  const h = k.h;
  if (kind === 'strips') {
    // Leather strips hanging round the hips.
    const F = k.fit('strap', G.torso, 0.006);
    const base = hips(k, startY);
    for (let i = 0; i < 9; i++) {
      const a = -1.9 + (i * 3.8) / 8;
      const p = V(Math.sin(a) * (base.x + 0.06 * h), startY * h, (base.zf + base.zb) / 2 + Math.cos(a) * ((base.zf - base.zb) / 2 + 0.06 * h));
      const L = len * (0.85 + 0.15 * Math.cos(a * 2));
      F.group = Math.abs(a) < 0.3 ? G.torso : a > 0 ? G.legL : G.legR;
      F.box(p.clone().add(V(0, -L * 0.5 * h, 0)), V(0.1 * h, L * 0.5 * h, 0.012 * h), 0.008 * h, 0.004 * h, rot(-0.12 * Math.cos(a), a, 0));
      const st = k.fit('trim', F.group, 0.006);
      st.ellipsoid(p.clone().add(V(0, -L * h + 0.05 * h, 0)).addScaledVector(V(Math.sin(a), 0, Math.cos(a)), 0.014 * h), V(0.035 * h, 0.035 * h, 0.02 * h), 0.004 * h, rot(0, a, 0));
    }
    return;
  }
  for (const L of [true, false]) {
    const s = L ? 1 : -1;
    const g = L ? G.legL : G.legR;
    if (kind === 'tentacles') {
      const F = k.fit('main', g, 0.006);
      for (let i = 0; i < 3; i++) {
        const a0 = 0.35 + i * 0.55;
        const p = k.onLimb(L ? 'thighL' : 'thighR', L ? 'shinL' : 'shinR', 0.08, V(s * Math.sin(a0), 0, Math.cos(a0)), [g]);
        let a = p.p.clone().addScaledVector(p.n, 0.06 * h);
        let r = 0.08 * h;
        for (let sgm = 0; sgm < 4; sgm++) {
          const b = a.clone().add(V(s * Math.sin(sgm * 1.3 + i) * 0.06 * h, -len * 0.25 * h, Math.cos(sgm * 1.1) * 0.05 * h)).addScaledVector(p.n, 0.015 * h);
          F.cone(a, b, r, r * 0.75, 0.015 * h);
          a = b;
          r *= 0.75;
        }
      }
      continue;
    }
    // Plates: overlapping lames over the front and side of the thigh.
    const F = k.fit('main', g, 0.006);
    const rows = Math.max(2, Math.round(len / 0.22));
    for (let i = 0; i < rows; i++) {
      const t = 0.05 + (i * len * 0.8) / rows / 2.0;
      const p = k.onLimb(L ? 'thighL' : 'thighR', L ? 'shinL' : 'shinR', t, V(s * 0.5, 0, 1), [g]);
      const c = p.p.clone().addScaledVector(p.n, (0.05 + 0.012 * (rows - i)) * h);
      const out = p.n.clone().setY(0).normalize();
      F.box(c, V(0.27 * h, 0.13 * h, 0.018 * h), 0.015 * h, 0.006 * h, basis(V(out.z, 0, -out.x), V(0, 1, 0)));
    }
    if (k.trimmed) {
      const p = k.onLimb(L ? 'thighL' : 'thighR', L ? 'shinL' : 'shinR', 0.05 + (len * 0.8) / 2.0, V(s * 0.5, 0, 1), [g]);
      k.fit('trim', g).ellipsoid(p.p.clone().addScaledVector(p.n, 0.06 * h), V(0.05 * h, 0.05 * h, 0.03 * h), 0.005 * h);
    }
  }
}

function armPlates(k: Kit): void {
  const h = k.h;
  const clips: Clip[] = [];
  for (const L of [true, false]) {
    clips.push(k.limb(L ? 'upperArmL' : 'upperArmR', L ? 'foreArmL' : 'foreArmR', 0.22, 'b'));
    clips.push(k.sleeve(L, 1.8));
  }
  k.edged('vambraces', 'main', {
    groups: [G.armL, G.armR],
    thickness: hem(0.0125, clips.map((c) => k.inside(c)), 0.02 * h, 0.6),
    clips,
    skinGroups: [G.armL, G.armR],
    cell: 0.0075,
    tris: 2400,
    yRange: [2.6 * h, 6.0 * h],
  }, 0.04);
  for (const L of [true, false]) {
    const s = L ? 1 : -1;
    const g = L ? G.armL : G.armR;
    const e = k.onLimb(L ? 'foreArmL' : 'foreArmR', L ? 'handL' : 'handR', 0.0, V(s * 0.3, 0, -1), [g]);
    const F = k.fit('main', g, 0.006);
    F.ellipsoid(e.p.clone().addScaledVector(e.n, 0.035 * h), V(0.17 * h, 0.07 * h, 0.17 * h), 0.015 * h, alongY(e.n));
    // A fan on the outside of the cop.
    F.ellipsoid(e.p.clone().addScaledVector(e.n, 0.02 * h).add(V(s * 0.1 * h, 0, 0)), V(0.05 * h, 0.2 * h, 0.16 * h), 0.015 * h);
  }
}

function gorget(k: Kit, tall: number): void {
  const h = k.h;
  const F = k.fit('main', G.torso, 0.006);
  F.cone(k.H(0, 5.92, -0.06), k.H(0, 6.22 + 0.12 * tall, -0.09), 0.5 * h, (0.36 + 0.03 * tall) * h, 0.06 * h);
  if (k.trimmed) k.fit('trim', G.torso).cone(k.H(0, 6.18 + 0.12 * tall, -0.09), k.H(0, 6.26 + 0.12 * tall, -0.09), (0.39 + 0.03 * tall) * h, (0.38 + 0.03 * tall) * h, 0.01 * h);
}

function collar(k: Kit, kind: Collar, mat: MatKey): void {
  const h = k.h;
  if (kind === 'stand') {
    const F = k.fit(mat, G.torso, 0.006);
    F.cone(k.H(0, 5.95, -0.08), k.H(0, 6.2, -0.1), 0.43 * h, 0.37 * h, 0.04 * h);
    return;
  }
  if (kind === 'cowl') {
    // A hood thrown back: a soft roll round the neck and the hood bunched behind.
    const F = k.fit(mat, G.torso, 0.007);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      F.ellipsoid(k.H(Math.sin(a) * 0.46, 5.98 - 0.08 * Math.cos(a), Math.cos(a) * 0.4 - 0.1), V(0.22 * h, 0.15 * h, 0.22 * h), 0.1 * h);
    }
    F.ellipsoid(k.H(0, 6.1, -0.58), V(0.42 * h, 0.4 * h, 0.24 * h), 0.14 * h);
    F.ellipsoid(k.H(0, 5.75, -0.66), V(0.28 * h, 0.36 * h, 0.14 * h), 0.14 * h);
    return;
  }
  if (kind === 'high') {
    // A standing collar round the back of the neck, flaring at the top.
    const F = k.fit('trim', G.torso, 0.006);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + (i - 4) * 0.3;
      const p = k.H(Math.sin(a) * 0.46, 6.25, Math.cos(a) * 0.4 - 0.1);
      F.box(p, V(0.1 * h, 0.32 * h, 0.012 * h), 0.008 * h, 0.03 * h, rot(-Math.cos(a) * 0.35, a, 0));
    }
    return;
  }
  if (kind === 'spikes') {
    const F = k.fit(k.look.material === 'leather' ? 'bone' : 'main', G.torso, 0.006);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i - 3) * 0.42;
      const p = k.H(Math.sin(a) * 0.4, 6.0, Math.cos(a) * 0.34 - 0.08);
      F.cone(p, p.clone().add(V(Math.sin(a) * 0.12 * h, (0.28 + 0.06 * (3 - Math.abs(i - 3))) * h, Math.cos(a) * 0.12 * h)), 0.055 * h, 0.005 * h, 0.02 * h);
    }
    return;
  }
  if (kind === 'coif' || kind === 'mantle') {
    const mail = kind === 'coif';
    const clips: Clip[] = [k.neck(mail ? 6.15 : 6.0, mail ? 6.3 : 6.22), k.above(mail ? 5.45 : 5.25), k.sleeve(true, mail ? 0.35 : 0.5), k.sleeve(false, mail ? 0.35 : 0.5)];
    k.edged(mail ? 'coif' : 'mantle', mail ? reliefMat(k, 'chain', 'rings') : mat, {
      groups: [G.torso, G.armL, G.armR],
      thickness: hem(mail ? patterned(k, 'rings', 0.0145) : 0.03, clips.map((c) => k.inside(c)), 0.03 * h, 0.6),
      clips,
      skinGroups: [G.torso, G.armL, G.armR],
      cell: 0.009,
      tris: 2200,
      yRange: [5.1 * h, 6.6 * h],
    }, 0.06);
  }
}

function tabard(k: Kit, hemY: number): void {
  const h = k.h;
  const clips: Clip[] = [k.below(4.1), k.above(hemY), { cut: (x) => 0.26 * h - Math.abs(x) }];
  k.edged('tabard', 'banner', {
    groups: [G.torso],
    thickness: (x, y) => 0.032 + 0.004 * Math.sin(x * 60 + y * 8),
    clips,
    extra: skirt(k, hemY, 0.5, 0.14),
    skinGroups: [G.torso, G.legL, G.legR],
    cell: 0.009,
    tris: 1600,
    yRange: [(hemY - 0.1) * h, 4.2 * h],
  }, 0.05, [k.above(hemY), { cut: (x) => 0.26 * h - Math.abs(x) }], true);
}

function sash(k: Kit): void {
  const h = k.h;
  const clips: Clip[] = [k.below(4.4), k.above(4.16)];
  k.shell('sash', k.trimmed ? 'trim' : 'cloth', {
    groups: [G.torso],
    thickness: 0.016,
    clips,
    skinGroups: [G.torso],
    cell: 0.007,
    tris: 900,
    yRange: [4.05 * h, 4.5 * h],
  });
  const F = k.fit(k.trimmed ? 'trim' : 'cloth', G.torso);
  const p = k.around(4.28, 0.5).p;
  F.ellipsoid(p.clone().add(V(0, 0, 0.03 * h)), V(0.08 * h, 0.07 * h, 0.05 * h), 0.02 * h);
  F.box(p.clone().add(V(0.02 * h, -0.45 * h, 0.06 * h)), V(0.06 * h, 0.42 * h, 0.012 * h), 0.008 * h, 0.03 * h, rot(0.08, 0.5, 0.05));
  F.box(p.clone().add(V(0.1 * h, -0.36 * h, 0.04 * h)), V(0.055 * h, 0.34 * h, 0.012 * h), 0.008 * h, 0.03 * h, rot(0.1, 0.5, -0.12));
}

function bells(k: Kit, r: number): void {
  // Bell sleeves: open cones from the elbow to past the wrist.
  const h = k.h;
  for (const L of [true, false]) {
    const g = L ? G.armL : G.armR;
    const E = k.j[L ? 'foreArmL' : 'foreArmR'];
    const W = k.j[L ? 'handL' : 'handR'];
    const F = new FieldBuilder();
    F.group = g;
    F.cone(E.clone().lerp(W, 0.1), E.clone().lerp(W, 0.92), 0.2 * h, r * h, 0.1 * h);
    const clips: Clip[] = [k.limb(L ? 'foreArmL' : 'foreArmR', L ? 'handL' : 'handR', 0.88, 'a'), k.limb(L ? 'upperArmL' : 'upperArmR', L ? 'foreArmL' : 'foreArmR', 0.8, 'b')];
    k.edged(L ? 'bellL' : 'bellR', 'main', {
      groups: [g],
      thickness: hem(0.007, clips.map((c) => k.inside(c)), 0.02 * h, 0.7),
      clips,
      extra: F.prims,
      skinGroups: [g],
      cell: 0.008,
      tris: 1200,
      yRange: [2.4 * h, 5.6 * h],
    }, 0.06, [clips[0]!]);
  }
}

function ribs(k: Kit): void {
  const h = k.h;
  const F = k.fit('bone', G.torso, 0.0055);
  for (let i = 0; i < 5; i++) {
    const y = 5.55 - i * 0.24;
    for (const s of [1, -1]) {
      const a = k.around(y, s * 0.16);
      const b = k.around(y - 0.12, s * 1.15);
      const m = k.around(y - 0.03, s * 0.65);
      const lift = 0.016;
      const pa = a.p.clone().addScaledVector(a.n, lift);
      const pm = m.p.clone().addScaledVector(m.n, lift + 0.003);
      const pb = b.p.clone().addScaledVector(b.n, lift);
      F.cone(pa, pm, 0.045 * h, 0.04 * h, 0.01 * h);
      F.cone(pm, pb, 0.04 * h, 0.03 * h, 0.01 * h);
    }
  }
  const t = k.around(5.75, 0);
  const b = k.around(4.55, 0);
  F.cone(t.p.clone().addScaledVector(t.n, 0.018), b.p.clone().addScaledVector(b.n, 0.018), 0.055 * h, 0.04 * h, 0.01 * h);
}

function studs(k: Kit, hemY: number, t: number): void {
  const h = k.h;
  const F = k.fit(k.trimmed ? 'trim' : 'iron', G.torso, 0.005);
  for (let r = 0; r < 7; r++) {
    const y = 5.55 - r * ((5.55 - Math.max(hemY, 4.0) - 0.1) / 6);
    for (let c = 0; c < 6; c++) {
      for (const back of [false, true]) {
        const a = (back ? Math.PI : 0) + (c - 2.5) * 0.36;
        const hp = k.around(y, a);
        if (Math.abs(hp.p.x) < 0.06 * h && !back) continue;
        F.ellipsoid(hp.p.clone().addScaledVector(hp.n, t + 0.001), V(0.032 * h, 0.032 * h, 0.032 * h), 0.004 * h);
      }
    }
  }
}

function hemRunes(k: Kit, y: number, t: number): void {
  const h = k.h;
  const F = k.fit('glow', G.torso, 0.005);
  const field = new Field([...k.field(LEGS).prims, ...lastSkirt]);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const dir = V(Math.sin(a), 0, Math.cos(a));
    const hp = k.hitField(field, V(0, y * h, -0.04 * h).addScaledVector(dir, 3 * h), dir.clone().negate());
    if (!hp) continue;
    F.box(hp.p.clone().addScaledVector(hp.n, t + 0.004), V(0.05 * h, (i % 3 === 0 ? 0.1 : 0.06) * h, 0.006 * h), 0.004 * h, 0.002 * h, rot(0, a, 0));
  }
}

function sigil(k: Kit, t: number): void {
  const h = k.h;
  const hp = k.around(5.45, 0);
  const c = hp.p.clone().addScaledVector(hp.n, t + 0.01);
  const F = k.fit('trim', G.torso, 0.005);
  const q = alongY(hp.n);
  F.ellipsoid(c, V(0.2 * h, 0.03 * h, 0.2 * h), 0.01 * h, q);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const d = V(Math.cos(a), Math.sin(a), 0);
    F.cone(c.clone().addScaledVector(d, 0.16 * h), c.clone().addScaledVector(d, (i % 2 ? 0.28 : 0.36) * h), 0.035 * h, 0.004 * h, 0.01 * h);
  }
  k.fit('gem', G.torso, 0.004).ellipsoid(c.clone().addScaledVector(hp.n, 0.025 * h), V(0.08 * h, 0.08 * h, 0.05 * h), 0.01 * h);
}

/** Dresses the chest. Returns the anchors decorations may use. */
export function chest(k: Kit): Anchor[] {
  const h = k.h;
  const look = k.look;
  const cut: ChestCut = { ...(CHEST_CUTS[look.cut] ?? fallbackCut(look.kind, look.baseTier)) };
  k.hides.push('wrap');
  if (cut.layer === 'robe') k.hides.push('shorts');
  if (cut.tint && !look.design?.main && !look.motif) k.setMat('main', cut.tint);
  const t = cut.t;

  if (cut.under) {
    layer(k, 'hauberk', 'chain', { sleeve: cut.under.sleeve, hem: cut.under.hem, t: patterned(k, 'chain', 0.0085), neck: [6.05, 6.25], noTrim: true, relief: 'rings' });
  }
  const mat: MatKey = 'main';
  if (cut.layer === 'cuirass') {
    const F = new FieldBuilder();
    F.group = G.torso;
    const front = k.around(5.3, 0).p.z;
    if (cut.keel === 2) F.box(V(0, 5.25 * h, front - 0.22 * h), V(0.26 * h, 0.62 * h, 0.26 * h), 0.04 * h, 0.2 * h, rot(0, Math.PI / 4, 0));
    else if (cut.keel) F.ellipsoid(V(0, 5.3 * h, front - 0.12 * h), V(0.4 * h, 0.66 * h, 0.17 * h), 0.2 * h);
    layer(k, 'cuirass', mat, { sleeve: 0, hem: cut.hem, t: patterned(k, cut.pattern, t + 0.003 * look.baseTier), neck: [6.02, 6.22], extra: F.prims, trimW: 0.07, relief: cut.pattern });
  } else {
    const mailKey: MatKey = cut.layer === 'hauberk' && look.material === 'metal' ? 'chain' : mat;
    layer(k, cut.layer, mailKey, {
      sleeve: cut.sleeve,
      hem: cut.hem,
      t: patterned(k, cut.pattern, t),
      relief: cut.pattern,
      neck: cut.layer === 'robe' ? [5.92, 6.2] : cut.layer === 'jerkin' ? [5.9, 6.18] : [6.02, 6.24],
      flare: cut.flare ?? (cut.layer === 'robe' ? 1.2 : 0.5),
      skirtPad: cut.layer === 'robe' ? 0.1 : 0.08,
    });
  }

  if (cut.bell) bells(k, cut.bell);
  if (cut.sash) sash(k);
  if (cut.collar) collar(k, cut.collar, mat);
  if (cut.gorget) gorget(k, cut.gorget);
  if (cut.faulds) faulds(k, cut.faulds);
  if (cut.arms) armPlates(k);
  if (cut.ribs) ribs(k);
  if (cut.studs) studs(k, cut.hem, t);
  if (cut.tabard) tabard(k, cut.tabard);

  // Uniques and sets: shoulders on anything that has none, and a cape.
  let pauldron = cut.pauldron;
  if (!pauldron && k.grand) pauldron = look.material === 'metal' ? 'round' : look.material === 'bone' ? 'bone' : cut.layer === 'robe' ? 'mantle' : 'leather';
  if (pauldron) pauldrons(k, pauldron, cut.lames ?? 2, cut);
  const tas = cut.tassets ?? (k.grand && cut.layer === 'cuirass' ? 'plates' : undefined);
  if (tas) tassets(k, tas, cut.tassetLen ?? 0.6, cut.faulds ? 4.06 - cut.faulds * 0.21 + 0.05 : Math.min(cut.hem, 3.95));

  // Rarity: a stone at the breast, runes, a sigil.
  if (cut.sigil || (look.hasGems && cut.layer === 'cuirass')) sigil(k, cut.layer === 'cuirass' ? t + 0.004 : t);
  else if (look.hasGems) {
    const hp = k.around(5.6, 0);
    k.fit('gem', G.torso, 0.004).ellipsoid(hp.p.clone().addScaledVector(hp.n, t + 0.012), V(0.06 * h, 0.08 * h, 0.045 * h), 0.01 * h);
  }
  if (cut.hemRunes || (look.hasRunes && cut.layer === 'robe')) hemRunes(k, cut.hem + 0.25, t + 0.008);
  if (look.hasRunes && cut.layer === 'cuirass') {
    const F = k.fit('glow', G.torso, 0.005);
    for (let i = 0; i < 5; i++) {
      const hp = k.around(5.05 - i * 0.18, 0.45 * (i % 2 ? 1 : -1));
      F.box(hp.p.clone().addScaledVector(hp.n, t + 0.006), V(0.07 * h, 0.018 * h, 0.006 * h), 0.004 * h, 0.002 * h, alongY(V(0, 1, 0)));
    }
  }
  k.cape = cut.cape ?? (k.grand ? (cut.layer === 'robe' ? 0 : 4.6 + 0.3 * look.baseTier) : 0);

  // Where decorations go.
  const S = (L: boolean) => {
    const sj = k.j[L ? 'upperArmL' : 'upperArmR'];
    const hp = k.hit([G.torso, L ? G.armL : G.armR], sj.clone().add(k.H(L ? 0.02 : -0.02, 1.6, 0)), V(0, -1, 0));
    const p = hp ? hp.p : sj.clone();
    return { p: p.add(V(0, 0.09 * h, 0)), n: V(L ? 0.5 : -0.5, 0.86, 0).normalize(), g: L ? G.armL : G.armR, s: 0.3 * h, role: 'shoulder' as const };
  };
  const breast = k.around(5.5, 0);
  const back = k.around(5.45, Math.PI);
  const hipL = k.around(3.95, 1.2);
  const hipR = k.around(3.95, -1.2);
  return [
    S(true),
    S(false),
    { p: breast.p.addScaledVector(breast.n, t + 0.008), n: breast.n, g: G.torso, s: 0.3 * h, role: 'chest' },
    { p: back.p.addScaledVector(back.n, t + 0.01), n: back.n, g: G.torso, s: 0.4 * h, role: 'back' },
    { p: hipL.p.addScaledVector(hipL.n, t + 0.01), n: hipL.n, g: G.torso, s: 0.22 * h, role: 'hip' },
    { p: hipR.p.addScaledVector(hipR.n, t + 0.01), n: hipR.n, g: G.torso, s: 0.22 * h, role: 'hip' },
  ];
}
