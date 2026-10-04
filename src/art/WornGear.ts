/**
 * SLAY — armour cut to the body that wears it.
 *
 * Worn armour used to be the same rigid model that lies on the floor, bolted
 * to one bone at one size. A breastplate built for nobody floated off a broad
 * warden's chest and swallowed a thin pyromancer, gloves were boxes beside the
 * hand, and nothing bent at the elbow. Here every piece is cut from the very
 * rings and limb stations the body was built from (`BodyKit`), grown outward
 * by the thickness of the material, and skinned to the body's own skeleton,
 * so it fits whoever wears it and moves with them.
 *
 * What the item *is* decides the shape:
 *  - the sub-type in `visual.shape` (`chest.robe|leather|mail|scale|plate`,
 *    `helm.cap|full|horned|circlet`, `gloves.light|plate|silk`,
 *    `boots.light|plate|silk`, `belt.sash|plate|chain`) picks the cut;
 *  - the base tier (entry, mid, elite base) grows the cut: a Plate Mail, a
 *    Gothic Plate and an Archon Plate are three different suits;
 *  - rarity adds trim, then fittings, then gems, then glowing runes, in the
 *    same order the dropped model and the icon use (`GearLook`);
 *  - uniques get a signature feature picked from their id, and every piece of
 *    a set wears the set's colour.
 *
 * Everything is authored in character space (+X the character's left, +Y up,
 * +Z forward) because bones carry no bind-pose rotation.
 */

import * as THREE from 'three';
import type { EquipSlot, Item, ItemVisual } from '../types';
import { Random } from '../core/RNG';
import { emissiveMaterial, surface } from './Materials';
import { beveledBox, clothPanel, dome, lathe, limb, normalizeGeometry, ring, spike, taperedBox, transformed } from './Meshes';
import {
  BONE_NAMES,
  armNodes,
  blob,
  footGeos,
  handGeos,
  legNodes,
  lerpV,
  mergeSkinned,
  ringStack,
  shapedSphere,
  skinGeometry,
  skinRigid,
  smooth01,
  sweep,
  torsoAt,
  torsoRings,
  type BodyFit,
  type SweepNode,
  type TorsoRing,
} from './BodyKit';
import { gearLook, type GearLook } from './GearLook';

export interface WornPiece {
  object: THREE.Object3D;
  /** Body cover keys this piece hides beyond its own slot (e.g. `hair`). */
  hides: string[];
}

// ---------------------------------------------------------------------------
// Parts and materials
// ---------------------------------------------------------------------------

/**
 * A material key: `main` (the item's own palette), `trim`, `glow`, or
 * `pal:<palette>[:<tint hex>]` for anything else (a surcoat, a leather strap).
 */
type MatKey = string;

interface GearPart {
  geo: THREE.BufferGeometry;
  mat: MatKey;
  /** Bones that may claim the part. */
  bind?: string[];
  /** Rigid to one bone: helms, pauldrons, knee cops. */
  rigid?: string;
  falloff?: number;
}

interface Ctx {
  fit: BodyFit;
  look: GearLook;
  rng: Random;
  parts: GearPart[];
}

const REPEAT: Record<string, number> = { metal: 3, leather: 6, cloth: 8, bone: 2.5, other: 3 };

const DARK = 'pal:leather.studded';
const STRAP = 'pal:leather.worn';

function material(key: MatKey, look: GearLook): THREE.Material {
  if (key === 'main') {
    // `key|0xRRGGBB` tints a palette: the people in camp wear dyed cloth.
    const [pal, tint] = look.palette.split('|');
    return surface(pal!, { repeat: REPEAT[look.family] ?? 3, seed: 0, tint: tint ? Number(tint) : undefined });
  }
  if (key === 'trim') return surface(look.trimKey, { repeat: 5, seed: 0, tint: look.trimTint });
  if (key === 'glow') return emissiveMaterial(look.accent, Math.max(1.1, look.glow));
  // Stones glow less than runes: a gem at full rune strength reads as a lamp.
  if (key === 'gem') return emissiveMaterial(look.accent, 0.7 + look.glow * 0.25);
  if (key.startsWith('pal:')) {
    const [, pal, tint, rep] = key.split(':');
    return surface(pal!, { repeat: rep ? Number(rep) : 6, seed: 0, tint: tint ? parseInt(tint, 16) : undefined });
  }
  return surface('metal.iron', { repeat: 3, seed: 0 });
}

/** A heraldic cloth in the item's accent: surcoats, sashes, plumes. */
function heraldry(look: GearLook): MatKey {
  return `pal:cloth.linen:${look.accent.toString(16).padStart(6, '0')}:6`;
}

function boneIndex(name: string): number {
  return Math.max(0, (BONE_NAMES as readonly string[]).indexOf(name));
}

/** Skins, buckets and binds a list of parts into one object of skinned meshes. */
function assemble(ctx: Ctx, name: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  const buckets = new Map<string, THREE.BufferGeometry[]>();
  for (const part of ctx.parts) {
    normalizeGeometry(part.geo);
    if (part.rigid) skinRigid(part.geo, boneIndex(part.rigid));
    else skinGeometry(part.geo, ctx.fit.segs, part.bind, part.falloff ?? 3);
    const list = buckets.get(part.mat) ?? [];
    list.push(part.geo);
    buckets.set(part.mat, list);
  }
  for (const [key, list] of buckets) {
    const geo = mergeSkinned(list);
    for (const g of list) g.dispose();
    const mesh = new THREE.SkinnedMesh(geo, material(key, ctx.look));
    mesh.name = `${name}:${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Bind-pose bounds go stale the moment the body moves.
    mesh.frustumCulled = false;
    group.add(mesh);
    // Geometry is in character space and the skeleton's inverses were taken
    // in that space, so the identity bind matrix holds wherever the group is
    // parented: attached-mode skinning cancels the parent's transform out.
    mesh.bind(ctx.fit.skeleton, new THREE.Matrix4());
  }
  return group;
}

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

/** A band of the torso between two heights, grown by `g`, sampled densely. */
function torsoBand(
  fit: BodyFit,
  g: number,
  y0: number,
  y1: number,
  rows: number,
  opts: { arc?: number; cols?: number; caps?: boolean; widen?: (t: number) => number } = {},
): THREE.BufferGeometry {
  const rings = torsoRings(fit, g);
  const out: TorsoRing[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const r = torsoAt(rings, fit.H * (y0 + (y1 - y0) * t));
    const k = opts.widen ? opts.widen(t) : 0;
    out.push({ ...r, w: r.w + k, df: r.df + k, db: r.db + k });
  }
  return ringStack(out, opts.cols ?? 22, { arc: opts.arc, caps: opts.caps ?? false });
}

/**
 * Rings for a skirt hanging from the hips: the torso's own shape down to the
 * widest point of the seat, then an ellipse that keeps clear of both legs and
 * flares by `flare` metres per metre of drop. Bottom to top, as `ringStack`
 * expects.
 */
function skirtRings(fit: BodyFit, g: number, yTop: number, yBot: number, flare: number, rows: number): TorsoRing[] {
  const H = fit.H;
  const torso = torsoRings(fit, g);
  const seatY = H * 0.505;
  const seat = torsoAt(torso, seatY);
  const legR = 0.047 * H * fit.limbT;
  const minW = fit.hipW * 1.04 + legR + g;
  const minD = legR * 1.1 + g;
  const out: TorsoRing[] = [];
  for (let i = 0; i <= rows; i++) {
    const y = H * (yBot + (yTop - yBot) * (i / rows));
    if (y >= seatY) {
      out.push(torsoAt(torso, y));
    } else {
      const drop = seatY - y;
      out.push({
        y,
        w: Math.max(seat.w, minW) + flare * drop,
        df: Math.max(seat.df, minD) + flare * 0.75 * drop,
        db: Math.max(seat.db, minD) + flare * 0.8 * drop,
      });
    }
  }
  return out;
}

const SKIRT_BIND = ['hips', 'hipL', 'hipR', 'kneeL', 'kneeR'];

/** Pushes vertices along their normals by `fn(u, v)`: ribbing, scales, ridges. */
function relief(geo: THREE.BufferGeometry, fn: (u: number, v: number) => number): THREE.BufferGeometry {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const d = fn(uv.getX(i), uv.getY(i));
    if (d === 0) continue;
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * d, pos.getY(i) + nor.getY(i) * d, pos.getZ(i) + nor.getZ(i) * d);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Fine horizontal ribbing: what mail looks like from more than a metre away. */
function mailRelief(amp: number, rows: number) {
  return (_u: number, v: number) => amp * (0.5 + 0.5 * Math.sin(v * rows * Math.PI * 2));
}

/** Overlapping scales: each row bulges at its lower edge, offset every row. */
function scaleRelief(amp: number, rows: number, cols: number) {
  return (u: number, v: number) => {
    const rv = (1 - v) * rows;
    const row = Math.floor(rv);
    const f = rv - row;
    const cu = u * cols + (row % 2) * 0.5;
    const across = Math.abs(Math.sin(cu * Math.PI));
    return amp * f * (0.45 + 0.55 * across);
  };
}

/** A raised ridge down the front centre line (u = 0.25 on a full ring). */
function ridgeRelief(amp: number, width = 0.025) {
  return (u: number) => amp * Math.exp(-Math.pow((u - 0.25) / width, 2));
}

/** A thin ring lying on a torso ring: hems, collars, belt edges. */
function hoop(r: TorsoRing, tube: number, seg = 28): THREE.BufferGeometry {
  const pts: SweepNode[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const s = Math.sin(a);
    pts.push({
      p: new THREE.Vector3(Math.cos(a) * r.w, r.y, (r.z ?? 0) + s * (s > 0 ? r.df : r.db)),
      rx: tube,
      rz: tube,
    });
  }
  return sweep(pts, 6, false);
}

/** A point on the surface of a torso ring at angle `a` (0 = left side, pi/2 = front). */
function onRing(r: TorsoRing, a: number, out = 0): THREE.Vector3 {
  const s = Math.sin(a);
  const c = Math.cos(a);
  const w = r.w + out;
  const d = (s > 0 ? r.df : r.db) + out;
  return new THREE.Vector3(c * w, r.y, (r.z ?? 0) + s * d);
}

/** Outward unit direction on a torso ring at angle `a`. */
function ringNormal(r: TorsoRing, a: number): THREE.Vector3 {
  const s = Math.sin(a);
  const d = s > 0 ? r.df : r.db;
  return new THREE.Vector3(Math.cos(a) / r.w, 0, s / d).normalize();
}

/** Orients a +Y-up geometry so +Z points along `n`, placed at `p`. */
function placeOn(geo: THREE.BufferGeometry, p: THREE.Vector3, n: THREE.Vector3, spin = 0): THREE.BufferGeometry {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.clone().normalize());
  if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), spin));
  const m = new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(m);
}

/** A stud: a small dome standing out of a surface. */
function stud(p: THREE.Vector3, n: THREE.Vector3, r: number): THREE.BufferGeometry {
  const g = dome(r, 0.7, 7, 3);
  g.rotateX(Math.PI * 0.5);
  return placeOn(g, p, n);
}

/** A cut gem standing proud of a surface, facing out along `n`. */
function setGem(ctx: Ctx, p: THREE.Vector3, n: THREE.Vector3, r: number, bind: Partial<GearPart>): void {
  const bezel = ring(r * 1.25, r * 0.28, 12, 5);
  ctx.parts.push({ geo: placeOn(bezel, p, n), mat: 'trim', ...bind });
  const stone = blob(r, r, r * 0.6, 8);
  ctx.parts.push({ geo: placeOn(stone, p.clone().addScaledVector(n, r * 0.25), n), mat: 'gem', ...bind });
}

/** Grows the last stations of a sleeve into a bell. */
function bell(nodes: SweepNode[], amount: number, count = 2): SweepNode[] {
  return nodes.map((n, i) => {
    const k = Math.max(0, i - (nodes.length - 1 - count)) / count;
    return { ...n, rx: n.rx + amount * k, rz: n.rz + amount * k };
  });
}

function sides(): Array<1 | -1> {
  return [1, -1];
}

// ---------------------------------------------------------------------------
// Chest
// ---------------------------------------------------------------------------

function buildChest(ctx: Ctx): string[] {
  const { look } = ctx;
  switch (look.kind) {
    case 'robe':
      robe(ctx);
      break;
    case 'leather':
      jerkin(ctx);
      break;
    case 'mail':
      hauberk(ctx, false);
      break;
    case 'scale':
      hauberk(ctx, true);
      break;
    case 'coat':
      coat(ctx);
      break;
    case 'apron':
      apron(ctx);
      break;
    case 'plate':
    default:
      if (look.family === 'cloth') robe(ctx);
      else if (look.family === 'leather') jerkin(ctx);
      else plate(ctx);
  }
  chestSignature(ctx);
  return [];
}

function robe(ctx: Ctx): void {
  const { fit, look, parts } = ctx;
  const H = fit.H;
  const g = H * 0.011;
  // Longer and fuller up the tiers: a quilted gambeson to the shin, a silk
  // robe to the ankle, an elite shroud pooling at the feet.
  const hem = [0.2, 0.09, 0.035][look.baseTier]!;
  const flare = [0.12, 0.18, 0.26][look.baseTier]!;
  parts.push({ geo: torsoBand(fit, g, 0.5, 0.818, 14), mat: 'main', bind: ['hips', 'spine', 'chest'] });
  const skirt = ringStack(skirtRings(fit, g, 0.52, hem, flare, 12), 24, { caps: false });
  if (look.baseTier === 0) relief(skirt, mailRelief(H * 0.0025, 9)); // quilting
  parts.push({ geo: skirt, mat: 'main', bind: SKIRT_BIND, falloff: 1.4 });
  for (const s of sides()) {
    const arm = s > 0 ? ['chest', 'shoulderL', 'elbowL', 'handL'] : ['chest', 'shoulderR', 'elbowR', 'handR'];
    let nodes = armNodes(fit, s, H * 0.01, 0, 0.95);
    if (look.baseTier >= 1 || look.palette.includes('silk')) nodes = bell(nodes, H * (0.018 + 0.012 * look.baseTier));
    parts.push({ geo: sweep(nodes, 12, false), mat: 'main', bind: arm });
    if (look.hasTrim) {
      const last = nodes[nodes.length - 1]!;
      parts.push({ geo: sweep([{ ...last, p: last.p.clone().add(new THREE.Vector3(0, H * 0.008, 0)), rx: last.rx + H * 0.003, rz: last.rz + H * 0.003 }, { ...last, rx: last.rx + H * 0.003, rz: last.rz + H * 0.003 }], 12, false), mat: 'trim', bind: arm });
    }
  }
  // Collar.
  const torso = torsoRings(fit, g);
  parts.push({ geo: hoop(torsoAt(torso, H * 0.815), H * 0.008), mat: look.hasTrim ? 'trim' : 'main', bind: ['chest'] });
  // Sash at the waist in the item's colour.
  if (look.rarityTier >= 1) {
    const w = torsoAt(torsoRings(fit, g + H * 0.006), H * 0.575);
    parts.push({ geo: ringStack([{ ...w, y: H * 0.56 }, { ...w, y: H * 0.59 }], 22, { caps: false }), mat: heraldry(look), bind: ['hips', 'spine'] });
  }
  // Hem band.
  if (look.hasTrim) {
    const rings = skirtRings(fit, g + H * 0.002, 0.52, hem, flare, 12);
    parts.push({ geo: hoop(rings[0]!, H * 0.006), mat: 'trim', bind: SKIRT_BIND, falloff: 1.4 });
  }
  // An embroidered placket down the front, from collar to hem.
  if (look.hasFittings) {
    const nodes: SweepNode[] = [];
    const skirtR = skirtRings(fit, g, 0.52, hem, flare, 12);
    for (let i = 0; i <= 10; i++) {
      const y = H * (0.81 - (0.81 - hem) * (i / 10));
      const r = y >= H * 0.52 ? torsoAt(torso, y) : torsoAt([...skirtR], y);
      nodes.push({ p: onRing(r, Math.PI * 0.5, H * 0.002), rx: H * 0.018, rz: H * 0.003 });
    }
    parts.push({ geo: sweep(nodes, 8), mat: look.hasRunes ? 'glow' : 'trim', bind: SKIRT_BIND.concat(['spine', 'chest']), falloff: 1.6 });
  }
  // Elite robes carry a mantle over the shoulders.
  if (look.baseTier >= 2) {
    parts.push({ geo: torsoBand(fit, g + H * 0.016, 0.73, 0.83, 6, { widen: (t) => H * 0.012 * (1 - t) }), mat: look.hasTrim ? heraldry(look) : 'main', bind: ['chest', 'spine'] });
    parts.push({ geo: hoop(torsoAt(torsoRings(fit, g + H * 0.03), H * 0.732), H * 0.006), mat: 'trim', bind: ['chest', 'spine'] });
  }
}

/** A long coat open down the front, with full sleeves and a turned collar. */
function coat(ctx: Ctx): void {
  const { fit, parts } = ctx;
  const H = fit.H;
  const g = H * 0.012;
  parts.push({ geo: torsoBand(fit, g, 0.5, 0.816, 14), mat: 'main', bind: ['hips', 'spine', 'chest'] });
  // Skirts open at the front: an arc that stops short of the centre line.
  const rings = skirtRings(fit, g, 0.52, 0.2, 0.16, 10).map((r) => ({ ...r }));
  const skirt = ringStack(rings, 24, { arc: 0.93 });
  skirt.rotateY(Math.PI);
  parts.push({ geo: skirt, mat: 'main', bind: SKIRT_BIND, falloff: 1.4 });
  for (const s of sides()) {
    const arm = s > 0 ? ['chest', 'shoulderL', 'elbowL', 'handL'] : ['chest', 'shoulderR', 'elbowR', 'handR'];
    const nodes = armNodes(fit, s, H * 0.011, 0, 0.92);
    parts.push({ geo: sweep(nodes, 12, false), mat: 'main', bind: arm });
    const cuff = nodes[nodes.length - 1]!;
    parts.push({ geo: sweep([{ ...cuff, p: cuff.p.clone().add(new THREE.Vector3(0, H * 0.02, 0)), rx: cuff.rx + H * 0.004, rz: cuff.rz + H * 0.004 }, { ...cuff, rx: cuff.rx + H * 0.004, rz: cuff.rz + H * 0.004 }], 12, false), mat: DARK, bind: arm });
  }
  const torso = torsoRings(fit, g);
  parts.push({ geo: torsoBand(fit, g + H * 0.006, 0.79, 0.835, 3, { widen: (t) => H * 0.012 * t }), mat: DARK, bind: ['chest'] });
  for (let i = 0; i < 5; i++) {
    const r = torsoAt(torso, H * (0.6 + i * 0.04));
    parts.push({ geo: stud(onRing(r, Math.PI * 0.5 + 0.12), ringNormal(r, Math.PI * 0.5 + 0.12), H * 0.005), mat: 'pal:metal.bronze', bind: ['spine', 'chest'] });
  }
}

/** A work shirt with rolled sleeves under a heavy leather apron. */
function apron(ctx: Ctx): void {
  const { fit, parts } = ctx;
  const H = fit.H;
  parts.push({ geo: torsoBand(fit, H * 0.006, 0.52, 0.81, 12), mat: 'pal:cloth.undyed', bind: ['hips', 'spine', 'chest'] });
  for (const s of sides()) {
    parts.push({ geo: sweep(armNodes(fit, s, H * 0.008, 0, 0.36), 12), mat: 'pal:cloth.undyed', bind: s > 0 ? ['chest', 'shoulderL', 'elbowL'] : ['chest', 'shoulderR', 'elbowR'] });
  }
  // The bib and skirt of the apron: the front of the body, then down past the knee.
  const rings = skirtRings(fit, H * 0.016, 0.79, 0.26, 0.06, 14);
  parts.push({ geo: ringStack(rings, 10, { arc: 0.3 }), mat: 'main', bind: SKIRT_BIND.concat(['spine', 'chest']), falloff: 1.5 });
  // Neck strap and waist tie.
  const torso = torsoRings(fit, H * 0.014);
  const neck: SweepNode[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.5 - 0.5 + (i / 10) * (Math.PI * 2 - 1.0);
    neck.push({ p: onRing(torsoAt(torso, H * 0.815), a), rx: H * 0.005, rz: H * 0.002 });
  }
  parts.push({ geo: sweep(neck, 4), mat: DARK, bind: ['chest'] });
  parts.push({ geo: hoop(torsoAt(torsoRings(fit, H * 0.018), H * 0.575), H * 0.005), mat: DARK, bind: ['hips', 'spine'] });
}

function jerkin(ctx: Ctx): void {
  const { fit, look, parts } = ctx;
  const H = fit.H;
  const g = H * 0.011;
  // Panel seams across the body, so it reads as stitched hide, not paint.
  parts.push({
    geo: relief(torsoBand(fit, g, 0.47, 0.814, 16), (u, v) => H * 0.0025 * (Math.abs(Math.sin(v * Math.PI * 4)) > 0.96 ? -1 : 0) + H * 0.002 * Math.exp(-Math.pow((u - 0.25) / 0.02, 2))),
    mat: 'main',
    bind: ['hips', 'spine', 'chest'],
  });
  const hem = [0.4, 0.37, 0.34][look.baseTier]!;
  const skirt = ringStack(skirtRings(fit, g, 0.49, hem, 0.12, 4), 24, { caps: false });
  // Four flaps: notch the hem at the sides and the front.
  relief(skirt, (u, v) => (v < 0.4 ? -H * 0.008 * Math.pow(Math.abs(Math.cos(u * Math.PI * 4)), 30) : 0));
  parts.push({ geo: skirt, mat: 'main', bind: SKIRT_BIND, falloff: 1.4 });
  // Short sleeves.
  for (const s of sides()) {
    const arm = s > 0 ? ['chest', 'shoulderL', 'elbowL'] : ['chest', 'shoulderR', 'elbowR'];
    parts.push({ geo: sweep(armNodes(fit, s, H * 0.009, 0, 0.2), 12, false), mat: 'main', bind: arm });
    // Shoulder cap of boiled leather, bigger up the tiers.
    const S = fit.joints[s > 0 ? 'shoulderL' : 'shoulderR'];
    const cap = dome(H * (0.05 + 0.008 * look.baseTier) * fit.limbT, 0.7, 12, 5);
    cap.rotateZ(-s * 0.95);
    cap.translate(S.x + s * H * 0.006, S.y - H * 0.002, S.z);
    parts.push({ geo: cap, rigid: s > 0 ? 'shoulderL' : 'shoulderR', mat: look.hasTrim ? 'main' : 'main' });
    if (look.hasTrim) {
      const rim = ring(H * (0.05 + 0.008 * look.baseTier) * fit.limbT, H * 0.004, 16, 4);
      rim.rotateX(Math.PI * 0.5);
      rim.rotateZ(-s * 0.95);
      rim.translate(S.x + s * H * 0.006, S.y - H * 0.002, S.z);
      parts.push({ geo: rim, rigid: s > 0 ? 'shoulderL' : 'shoulderR', mat: 'trim' });
    }
    if (look.baseTier >= 2 || look.hasFittings) {
      for (let k = 0; k < 3; k++) {
        const sp = spike(H * 0.03, H * 0.008, 5, 0.1);
        sp.rotateZ(-s * (0.6 + k * 0.35));
        sp.translate(S.x + s * H * (0.02 + k * 0.012), S.y + H * (0.03 - k * 0.012), S.z);
        parts.push({ geo: sp, rigid: s > 0 ? 'shoulderL' : 'shoulderR', mat: 'trim' });
      }
    }
  }
  // Front lacing, a zigzag of cord between eyelets.
  const torso = torsoRings(fit, g);
  const lace: SweepNode[] = [];
  for (let i = 0; i <= 8; i++) {
    const y = H * (0.6 + i * 0.022);
    const r = torsoAt(torso, y);
    const a = Math.PI * 0.5 + (i % 2 ? 0.07 : -0.07);
    lace.push({ p: onRing(r, a, H * 0.003), rx: H * 0.0028, rz: H * 0.0028 });
  }
  parts.push({ geo: sweep(lace, 4), mat: DARK, bind: ['spine', 'chest'] });
  // Studs: rows over the chest and back, densest on studded and elite hides.
  const studRows = look.ornate > 0.15 || look.hasFittings ? 4 : look.hasTrim ? 2 : 0;
  for (let row = 0; row < studRows; row++) {
    const y = H * (0.64 + row * 0.04);
    const r = torsoAt(torso, y);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + (row % 2) * 0.3;
      if (Math.abs(Math.sin(a) - 1) < 0.02) continue;
      parts.push({ geo: stud(onRing(r, a), ringNormal(r, a), H * 0.006), mat: 'trim', bind: ['spine', 'chest'] });
    }
  }
  if (look.baseTier >= 2) {
    // Wyrmhide: a crest of scales down the spine.
    for (let i = 0; i < 6; i++) {
      const y = H * (0.56 + i * 0.045);
      const r = torsoAt(torso, y);
      const sp = spike(H * (0.03 - i * 0.002), H * 0.01, 4, 0.3);
      sp.rotateX(-Math.PI * 0.5 - 0.5);
      sp.translate(0, y, -(r.db));
      parts.push({ geo: sp, mat: 'trim', bind: ['spine', 'chest'] });
    }
  }
  // A plain belt line at the waist so the cut reads.
  parts.push({ geo: hoop(torsoAt(torsoRings(fit, g + H * 0.003), H * 0.575), H * 0.007), mat: DARK, bind: ['hips', 'spine'] });
  if (look.hasGems) setGem(ctx, onRing(torsoAt(torso, H * 0.735), Math.PI * 0.5, H * 0.006), new THREE.Vector3(0, 0, 1), H * 0.011, { bind: ['chest'] });
}

/** Mail or scale: a hauberk with sleeves and a skirt split for riding. */
function hauberk(ctx: Ctx, scales: boolean): void {
  const { fit, look, parts } = ctx;
  const H = fit.H;
  const g = H * 0.012;
  const surf = scales ? scaleRelief(H * 0.006, 22, 26) : mailRelief(H * 0.0016, 40);
  parts.push({ geo: relief(torsoBand(fit, g, 0.5, 0.816, 24), surf), mat: 'main', bind: ['hips', 'spine', 'chest'] });
  const hem = scales ? [0.38, 0.33, 0.3][look.baseTier]! : [0.3, 0.26, 0.22][look.baseTier]!;
  const skirt = ringStack(skirtRings(fit, g, 0.52, hem, 0.14, 12), 26, { caps: false });
  relief(skirt, scales ? scaleRelief(H * 0.006, 10, 26) : mailRelief(H * 0.0016, 18));
  parts.push({ geo: skirt, mat: 'main', bind: SKIRT_BIND, falloff: 1.4 });
  for (const s of sides()) {
    const arm = s > 0 ? ['chest', 'shoulderL', 'elbowL', 'handL'] : ['chest', 'shoulderR', 'elbowR', 'handR'];
    const len = scales ? 0.3 : look.baseTier >= 1 ? 0.62 : 0.4;
    parts.push({ geo: relief(sweep(armNodes(fit, s, H * 0.01, 0, len), 12, false), surf), mat: 'main', bind: arm });
    if (scales || look.hasFittings) {
      // Layered shoulder lames.
      const S = fit.joints[s > 0 ? 'shoulderL' : 'shoulderR'];
      for (let k = 0; k < 2 + look.baseTier; k++) {
        const cap = dome(H * (0.052 - k * 0.004) * fit.limbT, 0.55, 12, 5);
        cap.rotateZ(-s * (0.9 + k * 0.12));
        cap.translate(S.x + s * H * (0.008 + k * 0.006), S.y - H * (0.004 + k * 0.022), S.z);
        parts.push({ geo: cap, rigid: s > 0 ? 'shoulderL' : 'shoulderR', mat: k === 0 && look.hasTrim ? 'trim' : 'main' });
      }
    }
  }
  const torso = torsoRings(fit, g);
  // Coif roll at the neck and a leather waist strap.
  parts.push({ geo: hoop(torsoAt(torso, H * 0.814), H * 0.01), mat: 'main', bind: ['chest'] });
  parts.push({ geo: hoop(torsoAt(torsoRings(fit, g + H * 0.004), H * 0.575), H * 0.009), mat: DARK, bind: ['hips', 'spine'] });
  // A surcoat over the mail: front and back panels in the item's colour.
  if (look.rarityTier >= 1 && !scales) {
    for (const [arc0, side] of [
      [0.5, 1],
      [-0.5, -1],
    ] as Array<[number, number]>) {
      const rings = skirtRings(fit, g + H * 0.008, 0.79, look.baseTier >= 1 ? 0.24 : 0.3, 0.1, 14);
      const panel = ringStack(rings, 8, { arc: 0.16 });
      if (side < 0) panel.rotateY(Math.PI);
      void arc0;
      parts.push({ geo: panel, mat: heraldry(look), bind: SKIRT_BIND.concat(['spine', 'chest']), falloff: 1.5 });
    }
    if (look.hasTrim) {
      const r = torsoAt(torsoRings(fit, g + H * 0.011), H * 0.7);
      setGem(ctx, onRing(r, Math.PI * 0.5), new THREE.Vector3(0, 0, 1), H * 0.012, { bind: ['chest'] });
    }
  }
  if (scales && look.baseTier >= 2) {
    // Kraken shell: a ridge of spines down the back.
    for (let i = 0; i < 5; i++) {
      const y = H * (0.6 + i * 0.045);
      const r = torsoAt(torso, y);
      const sp = spike(H * 0.04, H * 0.012, 5, 0.4);
      sp.rotateX(-Math.PI * 0.5 - 0.4);
      sp.translate(0, y, -(r.db + H * 0.004));
      parts.push({ geo: sp, mat: 'trim', bind: ['spine', 'chest'] });
    }
  }
}

function plate(ctx: Ctx): void {
  const { fit, look, parts } = ctx;
  const H = fit.H;
  const g = H * 0.022;
  const tier = look.baseTier;
  // Breast and back plate, with a keel down the front; elite suits are fluted.
  const cuirass = torsoBand(fit, g, 0.585, 0.81, 18, { cols: 28 });
  relief(cuirass, (u, v) => {
    let d = ridgeRelief(H * 0.006, 0.03)(u) * Math.sin(Math.min(1, v * 1.4) * Math.PI * 0.5);
    if (tier >= 1) d += H * 0.003 * Math.pow(Math.abs(Math.sin(u * Math.PI * 14)), 3) * (1 - v) * (Math.sin(u * Math.PI * 2) > 0 ? 1 : 0);
    // A swell over the chest.
    d += H * 0.006 * Math.exp(-Math.pow((v - 0.62) / 0.25, 2)) * Math.max(0, Math.sin(u * Math.PI * 2));
    return d;
  });
  parts.push({ geo: cuirass, mat: 'main', bind: ['spine', 'chest'] });
  const torso = torsoRings(fit, g);
  // Rolled edges at the neck and the waist.
  parts.push({ geo: hoop(torsoAt(torso, H * 0.81), H * 0.007), mat: look.hasTrim ? 'trim' : 'main', bind: ['chest'] });
  parts.push({ geo: hoop(torsoAt(torso, H * 0.586), H * 0.006), mat: look.hasTrim ? 'trim' : 'main', bind: ['spine'] });
  // Gorget.
  parts.push({ geo: torsoBand(fit, g * 0.8, 0.812, 0.84, 3, { widen: (t) => -H * 0.03 * t }), mat: 'main', bind: ['chest', 'head'], falloff: 2 });
  // Fauld: overlapping lames down over the hips.
  for (let k = 0; k < 3; k++) {
    const y1 = 0.585 - k * 0.032;
    const lame = ringStack(skirtRings(fit, g + H * (0.004 + k * 0.005), y1, y1 - 0.038, 0.3, 2), 26, { caps: false });
    parts.push({ geo: lame, mat: 'main', bind: ['hips', 'spine'] });
    if (look.hasTrim) parts.push({ geo: hoop(skirtRings(fit, g + H * (0.005 + k * 0.005), y1, y1 - 0.038, 0.3, 2)[0]!, H * 0.004), mat: 'trim', bind: ['hips'] });
  }
  // Mail skirt under the fauld.
  const mail = ringStack(skirtRings(fit, H * 0.014, 0.5, tier >= 1 ? 0.3 : 0.36, 0.1, 8), 26, { caps: false });
  relief(mail, mailRelief(H * 0.0016, 14));
  parts.push({ geo: mail, mat: 'pal:metal.iron:ffffff:4', bind: SKIRT_BIND, falloff: 1.4 });
  // Tassets over the thighs.
  for (const s of sides()) {
    const P = fit.joints[s > 0 ? 'hipL' : 'hipR'];
    const K = fit.joints[s > 0 ? 'kneeL' : 'kneeR'];
    const legR = 0.047 * H * fit.limbT;
    const top = lerpV(P, K, -0.05);
    const bot = lerpV(P, K, tier >= 1 ? 0.55 : 0.42);
    for (let k = 0; k < 2 + tier; k++) {
      const t0 = k / (2 + tier);
      const t1 = (k + 1.25) / (2 + tier);
      const a = lerpV(top, bot, t0);
      const b = lerpV(top, bot, Math.min(1, t1));
      const rings: TorsoRing[] = [
        { y: b.y, w: legR + H * (0.024 + k * 0.002), df: legR + H * (0.03 + k * 0.003), db: legR * 0.4, x: b.x, z: b.z } as TorsoRing,
        { y: a.y, w: legR + H * (0.02 + k * 0.002), df: legR + H * (0.026 + k * 0.003), db: legR * 0.4, x: a.x, z: a.z } as TorsoRing,
      ];
      parts.push({ geo: ringStack(rings, 12, { arc: 0.42 }), mat: 'main', bind: s > 0 ? ['hips', 'hipL'] : ['hips', 'hipR'], falloff: 2 });
    }
  }
  // Pauldrons: stacked lames over each shoulder, flaring and spiking up the tiers.
  for (const s of sides()) {
    const S = fit.joints[s > 0 ? 'shoulderL' : 'shoulderR'];
    const bone = s > 0 ? 'shoulderL' : 'shoulderR';
    const big = (0.06 + 0.01 * tier) * H * fit.limbT;
    for (let k = 0; k < 3 + tier; k++) {
      const cap = dome(big * (1 - k * 0.09), 0.62 - k * 0.04, 14, 6);
      cap.rotateZ(-s * (0.85 + k * 0.16));
      cap.translate(S.x + s * H * (0.012 + k * 0.007), S.y + H * (0.008 - k * 0.022), S.z);
      parts.push({ geo: cap, rigid: bone, mat: 'main' });
      if (k === 0 && look.hasTrim) {
        const rim = ring(big, H * 0.0045, 18, 4);
        rim.rotateX(Math.PI * 0.5);
        rim.rotateZ(-s * 0.85);
        rim.translate(S.x + s * H * 0.012, S.y + H * 0.008, S.z);
        parts.push({ geo: rim, rigid: bone, mat: 'trim' });
      }
    }
    if (tier >= 2 || look.hasFittings) {
      // A raised haute-piece guarding the neck.
      const guard = taperedBox(H * 0.07, H * 0.012, H * 0.05, H * 0.008, H * 0.05, H * 0.004);
      guard.rotateY(Math.PI * 0.5);
      guard.rotateX(0);
      guard.translate(S.x - s * H * 0.01, S.y + H * 0.05, S.z);
      parts.push({ geo: guard, rigid: bone, mat: look.hasTrim ? 'trim' : 'main' });
    }
    if (tier >= 2) {
      for (let k = 0; k < 3; k++) {
        const sp = spike(H * (0.05 - k * 0.008), H * 0.011, 6, 0.2);
        sp.rotateZ(-s * (0.35 + k * 0.4));
        sp.translate(S.x + s * H * (0.03 + k * 0.012), S.y + H * (0.045 - k * 0.012), S.z - H * 0.01);
        parts.push({ geo: sp, rigid: bone, mat: look.hasTrim ? 'trim' : 'main' });
      }
    }
    // Rerebrace and couter.
    const arm = s > 0 ? ['shoulderL', 'elbowL'] : ['shoulderR', 'elbowR'];
    parts.push({ geo: sweep(armNodes(fit, s, H * 0.012, 0.12, 0.42), 12), mat: 'main', bind: arm });
    const E = fit.joints[s > 0 ? 'elbowL' : 'elbowR'];
    const couter = dome(H * 0.03 * fit.limbT, 0.6, 10, 4);
    couter.rotateX(-Math.PI * 0.5);
    couter.translate(E.x, E.y, E.z - H * 0.022 * fit.limbT);
    parts.push({ geo: couter, rigid: s > 0 ? 'elbowL' : 'elbowR', mat: look.hasTrim ? 'trim' : 'main' });
  }
  // Rivets along the cuirass edges.
  if (look.hasFittings) {
    for (const y of [0.6, 0.795]) {
      const r = torsoAt(torso, H * y);
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        parts.push({ geo: stud(onRing(r, a, H * 0.001), ringNormal(r, a), H * 0.005), mat: 'trim', bind: ['spine', 'chest'] });
      }
    }
  }
  // Runes or a set sigil on the breast.
  if (look.hasRunes || look.set) {
    const r = torsoAt(torso, H * 0.72);
    const glyph: SweepNode[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const p = onRing(r, Math.PI * 0.5 + Math.cos(a) * 0.22, H * 0.006);
      p.y += Math.sin(a) * H * 0.035;
      glyph.push({ p, rx: H * 0.003, rz: H * 0.003 });
    }
    parts.push({ geo: sweep(glyph, 5), mat: 'glow', bind: ['chest'] });
  }
  if (look.hasGems) setGem(ctx, onRing(torsoAt(torso, H * 0.72), Math.PI * 0.5, H * 0.007), new THREE.Vector3(0, 0, 1), H * 0.012, { bind: ['chest'] });
}

/** What makes a unique chest piece unlike any other. */
function chestSignature(ctx: Ctx): void {
  const { fit, look, parts } = ctx;
  if (!look.unique) return;
  const H = fit.H;
  const pick = look.signature % 3;
  const torso = torsoRings(fit, H * 0.03);
  if (pick === 0 || look.rarityTier >= 4) {
    // A cape from the shoulders, in the item's colour.
    const back = torsoAt(torso, H * 0.79);
    const cape = clothPanel(back.w * 1.25, H * 0.56, ctx.rng, { segsX: 8, segsY: 12, ripple: 0.03, flare: 0.5, tatter: look.family === 'cloth' ? 0.15 : 0 });
    cape.rotateY(Math.PI);
    cape.translate(0, back.y, -(back.db + H * 0.004));
    // Hang it away from the back as it falls, so it clears the seat.
    const pos = cape.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const drop = Math.max(0, back.y - pos.getY(i));
      pos.setZ(i, pos.getZ(i) - drop * 0.18);
    }
    cape.computeVertexNormals();
    parts.push({ geo: cape, mat: heraldry(look), bind: ['chest', 'spine', 'hips'], falloff: 1.4 });
    // Clasps.
    for (const s of sides()) {
      const p = onRing(back, Math.PI * 0.5 + s * 0.9, H * 0.004);
      setGem(ctx, p, ringNormal(back, Math.PI * 0.5 + s * 0.9), H * 0.01, { bind: ['chest'] });
    }
  }
  if (pick === 1) {
    // A fur mantle over the shoulders.
    const fur = relief(torsoBand(fit, H * 0.03, 0.76, 0.83, 4, { widen: (t) => H * 0.02 * (1 - t), cols: 32 }), (u) => H * 0.006 * Math.abs(Math.sin(u * Math.PI * 22)));
    parts.push({ geo: fur, mat: 'pal:leather.worn:d8c8b0:3', bind: ['chest'] });
  }
  if (pick === 2) {
    // Glowing veins across the chest.
    for (let k = 0; k < 3; k++) {
      const nodes: SweepNode[] = [];
      for (let i = 0; i <= 8; i++) {
        const y = H * (0.62 + i * 0.022);
        const r = torsoAt(torsoRings(fit, H * 0.024), y);
        const a = Math.PI * 0.5 + (k - 1) * 0.5 + Math.sin(i * 1.3 + k) * 0.12;
        nodes.push({ p: onRing(r, a, H * 0.002), rx: H * 0.0028, rz: H * 0.0028 });
      }
      parts.push({ geo: sweep(nodes, 4), mat: 'glow', bind: ['spine', 'chest'] });
    }
  }
}

// ---------------------------------------------------------------------------
// Helm
// ---------------------------------------------------------------------------

function buildHelm(ctx: Ctx): string[] {
  const { fit, look, parts } = ctx;
  const r = fit.headR;
  const c = fit.joints.head;
  const O = new THREE.Vector3(c.x, c.y + r * 0.15, c.z);
  const at = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(O.x + x * r, O.y + y * r, O.z + z * r);
  const R = { rigid: 'head' };
  const tier = look.baseTier;
  if (look.kind === 'hat' || look.kind === 'hood' || look.kind === 'blindfold') return softHeadwear(ctx, O, r, look.kind);
  const kind = look.kind === 'cap' || look.kind === 'full' || look.kind === 'horned' || look.kind === 'circlet' ? look.kind : 'full';

  if (kind === 'circlet') {
    // A band at the brow, never a hat: the hair stays.
    const band = ring(1, r * 0.04, 28, 5);
    band.rotateX(Math.PI * 0.5);
    band.scale(r * 1.02, 1, r * 1.04);
    band.rotateX(-0.12);
    band.translate(O.x, O.y + r * 0.42, O.z - r * 0.1);
    parts.push({ geo: band, mat: 'main', ...R });
    const points = tier >= 1 ? 5 + tier * 2 : 0;
    for (let k = 0; k < points; k++) {
      const a = Math.PI * 0.5 + (k - (points - 1) / 2) * 0.26;
      const p = new THREE.Vector3(O.x + Math.cos(a) * r * 1.02, O.y + r * 0.42 + Math.sin(a) * r * 0.12, O.z - r * 0.1 + Math.sin(a) * r * 1.04);
      const sp = spike(r * (0.22 + (k === (points - 1) / 2 ? 0.2 : 0) - Math.abs(k - (points - 1) / 2) * 0.03), r * 0.05, 4, 0);
      sp.rotateX(-0.12);
      sp.translate(p.x, p.y, p.z);
      parts.push({ geo: sp, mat: 'main', ...R });
    }
    setGem(ctx, at(0, 0.48, 0.92), new THREE.Vector3(0, 0.1, 1).normalize(), r * (0.07 + tier * 0.015), R);
    if (look.unique) helmSignature(ctx, O, r);
    return [];
  }

  // The skull: the head's own egg grown outward, cut at the brow and ears for
  // a cap, carried down to the jaw for a full helm.
  const closed = kind === 'full' && tier >= 1;
  const shell = shapedSphere(
    r * (kind === 'full' ? 1.08 : 1.0),
    r * (kind === 'full' ? 1.16 : 1.08),
    r * (kind === 'full' ? 1.12 : 1.04),
    (n) => {
      if (kind === 'full') {
        // An open-faced helm sinks a face opening; a closed one keeps it.
        const face = closed ? 0 : smooth01(0.3, 0.6, n.z) * smooth01(0.42, 0.2, n.y) * smooth01(0.7, 0.4, Math.abs(n.x));
        return 1 - 0.3 * face;
      }
      // Caps and horned helms come down to the brow and over the tops of
      // the ears, and stop.
      const brow = smooth01(0.12, -0.02, n.y) * smooth01(-0.2, 0.4, n.z);
      const ears = smooth01(-0.12, -0.32, n.y);
      return 1 - 0.3 * Math.max(brow, ears);
    },
    20,
  );
  if (kind === 'full') {
    // Carry the lower half straight down to the jaw instead of curving in.
    const pos = shell.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < 0) {
        const k = 1 + smooth01(0, -r * 1.1, y) * 0.18;
        pos.setX(i, pos.getX(i) * k);
        pos.setZ(i, pos.getZ(i) * k);
        pos.setY(i, y * (1 + 0.12 * smooth01(0, -r, y)));
      }
    }
    shell.computeVertexNormals();
  }
  shell.translate(O.x, O.y + r * 0.12, O.z - r * 0.12);
  parts.push({ geo: shell, mat: 'main', ...R });

  // Rim band where a cap or open helm ends.
  if (kind !== 'full' || !closed) {
    const rim = ring(1, r * 0.05, 28, 5);
    rim.rotateX(Math.PI * 0.5);
    rim.scale(r * (kind === 'full' ? 1.1 : 1.02), 1, r * (kind === 'full' ? 1.14 : 1.06));
    rim.rotateX(-0.18);
    rim.translate(O.x, O.y + r * (kind === 'full' ? 0.32 : 0.16), O.z - r * 0.1);
    parts.push({ geo: rim, mat: look.hasTrim ? 'trim' : 'main', ...R });
  }

  if (kind === 'full') {
    if (closed) {
      // The eye slit and breaths: dark, recessed, the face of a closed helm.
      parts.push({ geo: placeOn(beveledBox(r * 0.9, r * 0.1, r * 0.06, r * 0.02), at(0, 0.12, 1.08), new THREE.Vector3(0, 0, 1)), mat: 'pal:metal.dark:302820:1', ...R });
      for (let k = 0; k < 6; k++) {
        const x = (k - 2.5) * 0.12;
        parts.push({ geo: placeOn(blob(r * 0.025, r * 0.025, r * 0.02, 5), at(x, -0.32, 1.1 - Math.abs(x) * 0.3), new THREE.Vector3(0, 0, 1)), mat: 'pal:metal.dark:302820:1', ...R });
      }
      // Brow reinforcement.
      parts.push({ geo: placeOn(taperedBox(r * 1.2, r * 0.08, r * 1.3, r * 0.08, r * 0.14, r * 0.03), at(0, 0.3, 1.0), new THREE.Vector3(0, 0, 1)), mat: look.hasTrim ? 'trim' : 'main', ...R });
    } else {
      // Nasal bar on an open helm.
      parts.push({ geo: placeOn(taperedBox(r * 0.16, r * 0.05, r * 0.12, r * 0.04, r * 0.6, r * 0.02), at(0, 0.0, 1.06), new THREE.Vector3(0, 0, 1)), mat: 'main', ...R });
    }
    // A ridge over the crown, and a crest for the grand helms.
    const ridge: SweepNode[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = -0.25 + (i / 10) * Math.PI * 0.95;
      ridge.push({ p: at(0, 0.12 + Math.sin(a) * 1.18, -0.12 + Math.cos(a) * 1.15), rx: r * 0.05, rz: r * 0.05 });
    }
    parts.push({ geo: sweep(ridge, 6), mat: look.hasTrim ? 'trim' : 'main', ...R });
    if (tier >= 2 || look.hasFittings) {
      const crest: SweepNode[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = 0.25 + (i / 10) * Math.PI * 0.8;
        crest.push({ p: at(0, 0.12 + Math.sin(a) * 1.42, -0.12 + Math.cos(a) * 1.3), rx: r * 0.03, rz: r * (0.2 - Math.abs(i - 5) * 0.025) });
      }
      parts.push({ geo: sweep(crest, 6), mat: look.rarityTier >= 1 ? heraldry(look) : 'main', ...R });
    }
    // Cheek plates for the open helm.
    if (!closed) {
      for (const s of [-1, 1]) {
        const cheek = ringStack(
          [
            { y: -0.85, w: 0.2, d: 0.06 },
            { y: -0.2, w: 0.3, d: 0.06 },
          ].map((q) => ({ y: O.y + q.y * r, w: q.w * r, d: q.d * r, x: O.x + s * r * 0.98, z: O.z + r * 0.35 })),
          8,
        );
        parts.push({ geo: cheek, mat: 'main', ...R });
      }
    }
  }

  if (kind === 'cap' && tier >= 1) {
    // A casque grows a brim and a comb.
    const brim = ring(1, r * 0.06, 28, 4);
    brim.rotateX(Math.PI * 0.5);
    brim.scale(r * 1.24, 1, r * 1.3);
    brim.rotateX(-0.22);
    brim.translate(O.x, O.y + r * 0.2, O.z - r * 0.06);
    parts.push({ geo: brim, mat: 'main', ...R });
    if (tier >= 2 || look.hasFittings) {
      const comb: SweepNode[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = 0.3 + (i / 8) * Math.PI * 0.7;
        comb.push({ p: at(0, 0.12 + Math.sin(a) * 1.2, -0.12 + Math.cos(a) * 1.16), rx: r * 0.025, rz: r * 0.12 * Math.sin((i / 8) * Math.PI) });
      }
      parts.push({ geo: sweep(comb, 5), mat: look.hasTrim ? 'trim' : 'main', ...R });
    }
  }

  if (kind === 'horned') {
    // Horns sweep out from the temples, up, then forward. Longer and more
    // curled up the tiers.
    const len = 1.2 + tier * 0.6;
    for (const s of [-1, 1]) {
      const nodes: SweepNode[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const a = t * (1.6 + tier * 0.5);
        nodes.push({
          p: at(s * (0.85 + Math.sin(a) * 0.55 * len), 0.55 + (1 - Math.cos(a)) * 0.42 * len, -0.2 + Math.sin(a * 0.7) * 0.25 * len * (tier >= 1 ? 1 : -0.3)),
          rx: r * 0.17 * (1 - t * 0.85),
          rz: r * 0.17 * (1 - t * 0.85),
        });
      }
      parts.push({ geo: sweep(nodes, 7), mat: look.family === 'bone' ? 'main' : 'pal:bone.old', ...R });
    }
    // A brow plate and cheek guards.
    parts.push({ geo: placeOn(taperedBox(r * 1.4, r * 0.1, r * 1.5, r * 0.1, r * 0.22, r * 0.04), at(0, 0.32, 0.9), new THREE.Vector3(0, 0, 1)), mat: look.hasTrim ? 'trim' : 'main', ...R });
    if (look.hasRunes) {
      for (const s of [-1, 1]) parts.push({ geo: transformed(blob(r * 0.08, r * 0.05, r * 0.04, 6), { pos: [O.x + s * r * 0.32, O.y + r * 0.1, O.z + r * 0.78] }), mat: 'glow', ...R });
    }
  }

  if (look.hasGems) setGem(ctx, at(0, 0.36, 1.08), new THREE.Vector3(0, 0.15, 1).normalize(), r * 0.09, R);
  if (look.unique) helmSignature(ctx, O, r);
  return kind === 'cap' ? ['hair'] : ['hair', 'hairLong'];
}

/** Hats, hoods and bands: what people wear who do not expect to be hit. */
function softHeadwear(ctx: Ctx, O: THREE.Vector3, r: number, kind: string): string[] {
  const { parts, fit } = ctx;
  const R = { rigid: 'head' };
  if (kind === 'blindfold') {
    const band = ring(1, r * 0.09, 28, 5);
    band.rotateX(Math.PI * 0.5);
    band.scale(r * 0.98, 1.6, r * 1.06);
    band.translate(O.x, O.y + r * 0.1, O.z - r * 0.08);
    parts.push({ geo: band, mat: 'main', ...R });
    // The knot and its trailing ends at the back.
    parts.push({ geo: transformed(blob(r * 0.12, r * 0.1, r * 0.08, 6), { pos: [O.x, O.y + r * 0.1, O.z - r * 1.08] }), mat: 'main', ...R });
    for (const s of [-1, 1]) {
      parts.push({ geo: transformed(taperedBox(r * 0.14, r * 0.02, r * 0.08, r * 0.02, r * 0.7, r * 0.01), { pos: [O.x + s * r * 0.08, O.y - r * 0.28, O.z - r * 1.12], rot: [0.15, 0, s * 0.2] }), mat: 'main', ...R });
    }
    return [];
  }
  if (kind === 'hat') {
    // A broad-brimmed hat: a crown, a band, and a brim that shades the face.
    const crown = shapedSphere(r * 0.98, r * 1.0, r * 1.04, (n) => 1 - 0.3 * smooth01(0.1, -0.05, n.y), 16);
    crown.scale(1, 1.1, 1);
    crown.translate(O.x, O.y + r * 0.34, O.z - r * 0.12);
    parts.push({ geo: crown, mat: 'main', ...R });
    const brim = lathe(
      [
        [r * 0.9, 0],
        [r * 1.9, -r * 0.08],
        [r * 1.94, -r * 0.03],
        [r * 0.9, r * 0.05],
      ],
      24,
    );
    brim.translate(O.x, O.y + r * 0.36, O.z - r * 0.1);
    parts.push({ geo: brim, mat: 'main', ...R });
    const band = ring(1, r * 0.06, 24, 4);
    band.rotateX(Math.PI * 0.5);
    band.scale(r * 1.0, 1, r * 1.04);
    band.translate(O.x, O.y + r * 0.48, O.z - r * 0.12);
    parts.push({ geo: band, mat: DARK, ...R });
    return ['hair'];
  }
  // A cloth hood with a cowl over the shoulders.
  const shell = shapedSphere(
    r * 1.12,
    r * 1.18,
    r * 1.2,
    (n) => 1 - 0.38 * smooth01(0.25, 0.62, n.z) * smooth01(0.62, 0.3, n.y) * smooth01(0.8, 0.5, Math.abs(n.x)),
    18,
  );
  shell.translate(O.x, O.y + r * 0.12, O.z - r * 0.1);
  parts.push({ geo: shell, mat: 'main', ...R });
  parts.push({ geo: torsoBand(fit, fit.H * 0.024, 0.76, 0.84, 4), mat: 'main', bind: ['chest', 'head'], falloff: 2 });
  return ['hair', 'hairLong'];
}

function helmSignature(ctx: Ctx, O: THREE.Vector3, r: number): void {
  const { look, parts } = ctx;
  const R = { rigid: 'head' };
  const pick = look.signature % 4;
  if (pick === 0) {
    // A crown of spikes.
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const sp = spike(r * (0.4 + (k % 2) * 0.2), r * 0.07, 5, 0);
      sp.translate(O.x + Math.cos(a) * r * 0.8, O.y + r * 0.85, O.z - r * 0.12 + Math.sin(a) * r * 0.82);
      parts.push({ geo: sp, mat: 'trim', ...R });
    }
  } else if (pick === 1) {
    // Wings at the temples.
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const f = taperedBox(r * 0.12, r * 0.04, r * 0.04, r * 0.02, r * (0.9 - k * 0.15), r * 0.01);
        f.rotateZ(-s * (0.5 + k * 0.28));
        f.rotateY(s * 0.4);
        f.translate(O.x + s * r * 1.05, O.y + r * (0.55 + k * 0.05), O.z - r * (0.2 + k * 0.08));
        parts.push({ geo: f, mat: 'trim', ...R });
      }
    }
  } else if (pick === 2) {
    // A plume in the item's colour.
    const nodes: SweepNode[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      nodes.push({ p: new THREE.Vector3(O.x, O.y + r * (1.2 + Math.sin(t * 2) * 0.5), O.z - r * (0.1 + t * 1.4)), rx: r * 0.08, rz: r * 0.3 * Math.sin(t * Math.PI) + r * 0.03 });
    }
    parts.push({ geo: sweep(nodes, 6), mat: heraldry(look), ...R });
  } else {
    // A halo.
    const halo = ring(r * 1.1, r * 0.035, 32, 5);
    halo.rotateX(Math.PI * 0.5 + 0.3);
    halo.translate(O.x, O.y + r * 1.45, O.z - r * 0.6);
    parts.push({ geo: halo, mat: 'glow', ...R });
  }
}

// ---------------------------------------------------------------------------
// Gloves
// ---------------------------------------------------------------------------

function buildGloves(ctx: Ctx): string[] {
  const { fit, look, parts } = ctx;
  const H = fit.H;
  const kind = look.kind === 'plate' || look.kind === 'silk' ? look.kind : 'light';
  const tier = look.baseTier;
  for (const s of sides()) {
    const bind = s > 0 ? ['elbowL', 'handL'] : ['elbowR', 'handR'];
    const hand = s > 0 ? 'handL' : 'handR';
    const g = kind === 'plate' ? H * 0.006 : kind === 'silk' ? H * 0.0018 : H * 0.0035;
    for (const geo of handGeos(fit, s, g)) parts.push({ geo, mat: 'main', bind });
    if (kind === 'light') {
      // A flared cuff.
      const nodes = armNodes(fit, s, H * 0.006, 0.78, 0.95);
      nodes[0] = { ...nodes[0]!, rx: nodes[0]!.rx + H * (0.01 + tier * 0.004), rz: nodes[0]!.rz + H * (0.01 + tier * 0.004) };
      parts.push({ geo: sweep(nodes, 10, false), mat: 'main', bind });
      if (look.hasTrim) parts.push({ geo: sweep([nodes[0]!, { ...nodes[0]!, p: nodes[0]!.p.clone().add(new THREE.Vector3(0, -H * 0.006, 0)) }], 10, false), mat: 'trim', bind });
      if (look.ornate > 0.15 || look.hasFittings) {
        const D = fit.joints[hand];
        for (let k = 0; k < 3; k++) parts.push({ geo: stud(new THREE.Vector3(D.x + (k - 1) * H * 0.01, D.y - H * 0.012, D.z - H * 0.012), new THREE.Vector3(0, 0, -1), H * 0.004), mat: 'trim', bind: [hand] });
      }
    } else if (kind === 'plate') {
      // Vambrace to mid-forearm, flared at the cuff.
      const nodes = armNodes(fit, s, H * 0.01, 0.62, 0.95);
      nodes[0] = { ...nodes[0]!, rx: nodes[0]!.rx + H * 0.012, rz: nodes[0]!.rz + H * 0.012 };
      parts.push({ geo: sweep(nodes, 12, false), mat: 'main', bind });
      parts.push({ geo: sweep([nodes[0]!, { ...nodes[0]!, p: nodes[0]!.p.clone().add(new THREE.Vector3(0, -H * 0.008, 0)) }], 12, false), mat: look.hasTrim ? 'trim' : 'main', bind });
      // Knuckle and finger lames across the back of the hand (-Z: hands hang palm-in, back facing out and back).
      const D = fit.joints[hand];
      for (let k = 0; k < 3; k++) {
        const lame = taperedBox(H * 0.04 * fit.limbT, H * 0.012, H * 0.038 * fit.limbT, H * 0.01, H * 0.014, H * 0.003);
        lame.translate(D.x, D.y - H * (0.004 + k * 0.016), D.z - H * 0.006);
        parts.push({ geo: lame, rigid: hand, mat: 'main' });
      }
      if (tier >= 2 || look.hasFittings) {
        for (let k = 0; k < 3; k++) {
          const sp = spike(H * 0.02, H * 0.005, 4, 0);
          sp.rotateX(Math.PI * 0.5);
          sp.translate(D.x + (k - 1) * H * 0.012, D.y - H * 0.03, D.z + H * 0.012);
          parts.push({ geo: sp, rigid: hand, mat: 'trim' });
        }
      }
    } else {
      // Silk: wraps spiralling up the wrist.
      const W = armNodes(fit, s, H * 0.004, 0.62, 0.95);
      const a = W[0]!.p;
      const b = W[W.length - 1]!.p;
      for (let k = 0; k < 4; k++) {
        const p = lerpV(a, b, k / 4);
        const n = W[Math.min(W.length - 1, Math.round((k / 4) * (W.length - 1)))]!;
        const band = ring(1, H * 0.003, 12, 4);
        band.rotateX(Math.PI * 0.5);
        band.scale(n.rx + H * 0.002, 1, n.rz + H * 0.002);
        band.rotateZ(0.25);
        band.translate(p.x, p.y, p.z);
        parts.push({ geo: band, mat: look.hasTrim ? 'trim' : 'main', bind });
      }
    }
    if (look.hasGems || look.set) {
      const D = fit.joints[hand];
      setGem(ctx, new THREE.Vector3(D.x + s * H * 0.006, D.y - H * 0.008, D.z - H * 0.014), new THREE.Vector3(s * 0.4, 0, -1).normalize(), H * 0.007, { rigid: hand });
    }
    if (look.unique) {
      const D = fit.joints[hand];
      const pick = look.signature % 3;
      if (pick === 0) {
        // Claws.
        for (let k = 0; k < 4; k++) {
          const cl = spike(H * 0.035, H * 0.004, 4, 0.5);
          cl.rotateX(Math.PI);
          cl.translate(D.x + (k / 3 - 0.5) * H * 0.026, D.y - H * 0.05, D.z + H * 0.008);
          parts.push({ geo: cl, rigid: hand, mat: 'trim' });
        }
      } else if (pick === 1) {
        // Glowing knuckles.
        for (let k = 0; k < 4; k++) parts.push({ geo: transformed(blob(H * 0.005, H * 0.005, H * 0.005, 6), { pos: [D.x + (k / 3 - 0.5) * H * 0.026, D.y - H * 0.03, D.z - H * 0.01] }), rigid: hand, mat: 'glow' });
      } else {
        // A spiked cuff.
        const nodes = armNodes(fit, s, H * 0.012, 0.78, 0.8);
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const sp = spike(H * 0.022, H * 0.005, 4, 0);
          sp.rotateZ(-Math.PI * 0.5);
          sp.rotateY(-a);
          const n = nodes[0]!;
          sp.translate(n.p.x + Math.cos(a) * n.rx, n.p.y, n.p.z + Math.sin(a) * n.rz);
          parts.push({ geo: sp, mat: 'trim', bind });
        }
      }
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Boots
// ---------------------------------------------------------------------------

function buildBoots(ctx: Ctx): string[] {
  const { fit, look, parts } = ctx;
  const H = fit.H;
  const kind = look.kind === 'plate' || look.kind === 'silk' ? look.kind : 'light';
  const tier = look.baseTier;
  for (const s of sides()) {
    const leg = s > 0 ? ['kneeL', 'footL'] : ['kneeR', 'footR'];
    const foot = s > 0 ? 'footL' : 'footR';
    const knee = s > 0 ? 'kneeL' : 'kneeR';
    if (kind === 'silk') {
      for (const geo of footGeos(fit, s, H * 0.003, 1.08)) parts.push({ geo, mat: 'main', bind: leg });
      // Wraps up the ankle.
      const nodes = legNodes(fit, s, H * 0.004, 0.8, 1);
      parts.push({ geo: sweep(nodes, 10, false), mat: 'main', bind: leg });
      if (look.hasTrim) parts.push({ geo: sweep([nodes[0]!, { ...nodes[0]!, p: nodes[0]!.p.clone().add(new THREE.Vector3(0, -H * 0.006, 0)), rx: nodes[0]!.rx + H * 0.002, rz: nodes[0]!.rz + H * 0.002 }], 10, false), mat: 'trim', bind: leg });
    } else if (kind === 'light') {
      for (const geo of footGeos(fit, s, H * 0.007, 1.04)) parts.push({ geo, mat: 'main', bind: leg });
      // A shaft to mid-calf (higher up the tiers), with a turned-down cuff.
      const from = [0.74, 0.7, 0.66][tier]!;
      const nodes = legNodes(fit, s, H * 0.008, from, 1);
      parts.push({ geo: sweep(nodes, 12, false), mat: 'main', bind: leg });
      const top = nodes[0]!;
      parts.push({
        geo: sweep([{ ...top, rx: top.rx + H * 0.006, rz: top.rz + H * 0.006 }, { ...top, p: top.p.clone().add(new THREE.Vector3(0, -H * 0.022, 0)), rx: top.rx + H * 0.005, rz: top.rz + H * 0.005 }], 12, false),
        mat: look.hasTrim ? 'trim' : 'main',
        bind: leg,
      });
      // Sole.
      const F = fit.joints[foot];
      parts.push({ geo: transformed(beveledBox(H * 0.06 * Math.sqrt(fit.limbT), H * 0.012, H * 0.15, H * 0.004), { pos: [F.x, F.y - H * 0.012, F.z + H * 0.03] }), mat: DARK, bind: [foot] });
      // Straps.
      for (let k = 0; k < (look.hasFittings ? 3 : 2); k++) {
        const n = legNodes(fit, s, H * 0.011, 0.85 - k * 0.07, 0.85 - k * 0.07)[0];
        if (!n) continue;
        const band = ring(1, H * 0.003, 12, 4);
        band.rotateX(Math.PI * 0.5);
        band.scale(n.rx, 1, n.rz);
        band.translate(n.p.x, n.p.y, n.p.z);
        parts.push({ geo: band, mat: look.hasFittings ? 'trim' : DARK, bind: leg });
      }
    } else {
      // Sabatons: the foot in lames, and a greave to the knee.
      for (const geo of footGeos(fit, s, H * 0.011, 1.1)) parts.push({ geo: relief(geo, (u, v) => H * 0.002 * Math.abs(Math.sin(v * Math.PI * 5))), mat: 'main', bind: leg });
      const nodes = legNodes(fit, s, H * 0.012, 0.56, 1);
      const greave = sweep(nodes, 14, false);
      relief(greave, (u) => H * 0.004 * Math.exp(-Math.pow((u - 0.75) / 0.06, 2)));
      parts.push({ geo: greave, mat: 'main', bind: leg });
      // The knee cop, flared for the grander suits.
      const K = fit.joints[knee];
      const cop = dome(H * (0.034 + tier * 0.006) * fit.limbT, 0.7, 12, 5);
      cop.rotateX(Math.PI * 0.5);
      cop.translate(K.x, K.y, K.z + H * 0.018 * fit.limbT);
      parts.push({ geo: cop, rigid: knee, mat: look.hasTrim ? 'trim' : 'main' });
      if (tier >= 1) {
        const wing = taperedBox(H * 0.012, H * 0.03, H * 0.006, H * 0.012, H * 0.05, H * 0.003);
        wing.rotateZ(s * 0.3);
        wing.translate(K.x + s * H * 0.036 * fit.limbT, K.y, K.z + H * 0.006);
        parts.push({ geo: wing, rigid: knee, mat: 'main' });
      }
      if (look.hasTrim) parts.push({ geo: sweep([nodes[0]!, { ...nodes[0]!, p: nodes[0]!.p.clone().add(new THREE.Vector3(0, -H * 0.008, 0)) }], 14, false), mat: 'trim', bind: leg });
    }
    if (look.hasGems || look.set) {
      const n = legNodes(fit, s, H * 0.014, 0.82, 0.82)[0];
      if (n) setGem(ctx, n.p.clone().add(new THREE.Vector3(0, 0, n.rz)), new THREE.Vector3(0, 0, 1), H * 0.006, { bind: leg });
    }
    if (look.unique) {
      const F = fit.joints[foot];
      const pick = look.signature % 3;
      if (pick === 0) {
        // Wings at the ankle.
        for (let k = 0; k < 3; k++) {
          const f = taperedBox(H * 0.012, H * 0.004, H * 0.004, H * 0.002, H * (0.07 - k * 0.012), H * 0.002);
          f.rotateZ(-s * (0.9 + k * 0.3));
          f.rotateX(-0.6);
          f.translate(F.x + s * H * 0.03, F.y + H * (0.06 + k * 0.01), F.z - H * 0.02);
          parts.push({ geo: f, rigid: foot, mat: 'trim' });
        }
      } else if (pick === 1) {
        // A spiked toe and spur.
        const toe = spike(H * 0.03, H * 0.008, 5, 0);
        toe.rotateX(Math.PI * 0.5);
        toe.translate(F.x, F.y + H * 0.014, F.z + H * 0.12);
        parts.push({ geo: toe, rigid: foot, mat: 'trim' });
        const spur = spike(H * 0.04, H * 0.006, 5, 0.2);
        spur.rotateX(-Math.PI * 0.5);
        spur.translate(F.x, F.y + H * 0.03, F.z - H * 0.04);
        parts.push({ geo: spur, rigid: foot, mat: 'trim' });
      } else {
        // A glowing seam round the sole.
        parts.push({ geo: transformed(beveledBox(H * 0.05, H * 0.003, H * 0.13, H * 0.001), { pos: [F.x, F.y - H * 0.006, F.z + H * 0.03] }), rigid: foot, mat: 'glow' });
      }
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// Belt
// ---------------------------------------------------------------------------

function buildBelt(ctx: Ctx): string[] {
  const { fit, look, parts } = ctx;
  const H = fit.H;
  const kind = look.kind === 'sash' || look.kind === 'chain' ? look.kind : 'plate';
  // Outside any chest armour, which grows the body by up to ~2.4% of height.
  const g = H * 0.03;
  const rings = torsoRings(fit, g);
  const y = H * 0.565;
  const mid = torsoAt(rings, y);
  const B = ['hips', 'spine'];
  const width = kind === 'sash' ? H * 0.04 : H * 0.028;
  const band = ringStack(
    [
      { ...torsoAt(rings, y - width * 0.5), y: y - width * 0.5 },
      { ...torsoAt(rings, y + width * 0.5), y: y + width * 0.5 },
    ],
    26,
    { caps: false },
  );
  parts.push({ geo: band, mat: kind === 'chain' ? DARK : 'main', bind: B });
  for (const dy of [-0.5, 0.5]) parts.push({ geo: hoop(torsoAt(rings, y + width * dy), H * 0.0035), mat: kind === 'sash' ? 'main' : look.hasTrim ? 'trim' : 'main', bind: B });
  const front = onRing(mid, Math.PI * 0.5, H * 0.002);
  if (kind === 'sash') {
    // A knot at the hip with two tails hanging from it.
    const side = onRing(mid, Math.PI * 0.5 + 0.7, H * 0.004);
    parts.push({ geo: transformed(blob(H * 0.018, H * 0.016, H * 0.012, 8), { pos: [side.x, side.y, side.z] }), mat: 'main', bind: B });
    for (let k = 0; k < 2; k++) {
      const tail = clothPanel(H * 0.03, H * (0.16 + k * 0.04 + look.baseTier * 0.03), ctx.rng, { segsX: 2, segsY: 6, ripple: 0.04, flare: 0.3 });
      tail.rotateY(0.6);
      tail.translate(side.x + (k - 0.5) * H * 0.012, side.y - H * 0.01, side.z + H * 0.004);
      parts.push({ geo: tail, mat: 'main', bind: ['hips', s1(side.x)], falloff: 1.5 });
    }
  } else if (kind === 'plate') {
    // Buckle, tongue and pouches.
    parts.push({ geo: placeOn(beveledBox(H * 0.04, H * 0.034, H * 0.008, H * 0.003), front, new THREE.Vector3(0, 0, 1)), mat: look.hasTrim ? 'trim' : 'pal:metal.iron', bind: B });
    for (const a of [0.55, -0.4]) {
      const p = onRing(mid, Math.PI * 0.5 + a * 2, H * 0.012);
      parts.push({ geo: placeOn(taperedBox(H * 0.04, H * 0.022, H * 0.036, H * 0.02, H * 0.045, H * 0.006), p.clone().add(new THREE.Vector3(0, -H * 0.02, 0)), ringNormal(mid, Math.PI * 0.5 + a * 2)), mat: STRAP, bind: ['hips', s1(p.x)], falloff: 2 });
    }
    if (look.hasFittings || look.baseTier >= 2) {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        if (Math.abs(a - Math.PI * 0.5) < 0.3) continue;
        parts.push({ geo: stud(onRing(mid, a), ringNormal(mid, a), H * 0.005), mat: 'trim', bind: B });
      }
    }
  } else {
    // Chain: a run of links, and plates hanging at the front for the grand ones.
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      const link = ring(H * 0.01, H * 0.003, 8, 4);
      link.rotateY(-a + (k % 2) * Math.PI * 0.5);
      const p = onRing(mid, a, H * 0.004);
      link.translate(p.x, p.y, p.z);
      parts.push({ geo: link, mat: 'main', bind: B });
    }
    parts.push({ geo: placeOn(blob(H * 0.024, H * 0.024, H * 0.008, 10), front, new THREE.Vector3(0, 0, 1)), mat: look.hasTrim ? 'trim' : 'main', bind: B });
    if (look.baseTier >= 1) {
      for (const a of [-0.35, 0, 0.35]) {
        const p = onRing(mid, Math.PI * 0.5 + a, H * 0.006);
        parts.push({ geo: placeOn(taperedBox(H * 0.036, H * 0.006, H * 0.03, H * 0.006, H * 0.06, H * 0.002), p.clone().add(new THREE.Vector3(0, -H * 0.04, 0)), ringNormal(mid, Math.PI * 0.5 + a)), mat: 'main', bind: ['hips', s1(p.x)], falloff: 2 });
      }
    }
  }
  if (look.hasGems || look.set) setGem(ctx, front.clone().add(new THREE.Vector3(0, 0, H * 0.006)), new THREE.Vector3(0, 0, 1), H * 0.008, { bind: B });
  if (look.unique) {
    const pick = look.signature % 3;
    if (pick === 0) {
      // A skull at the buckle.
      parts.push({ geo: transformed(blob(H * 0.02, H * 0.022, H * 0.016, 10), { pos: [front.x, front.y + H * 0.004, front.z + H * 0.012] }), mat: 'pal:bone.pale', bind: B });
      for (const s of [-1, 1]) parts.push({ geo: transformed(blob(H * 0.005, H * 0.005, H * 0.004, 6), { pos: [front.x + s * H * 0.008, front.y + H * 0.008, front.z + H * 0.026] }), mat: 'glow', bind: B });
    } else if (pick === 1) {
      // Trophies on chains at the hips.
      for (const a of [0.9, -0.9]) {
        const p = onRing(mid, Math.PI * 0.5 + a, H * 0.01);
        parts.push({ geo: transformed(limb(H * 0.06, H * 0.002, H * 0.002, 4), { pos: [p.x, p.y - H * 0.06, p.z] }), mat: 'pal:metal.iron', bind: ['hips', s1(p.x)], falloff: 2 });
        parts.push({ geo: transformed(spike(H * 0.04, H * 0.008, 5, 0.6), { pos: [p.x, p.y - H * 0.1, p.z], rot: [Math.PI, 0, 0] }), mat: 'pal:bone.pale', bind: ['hips', s1(p.x)], falloff: 2 });
      }
    } else {
      // A ring of small glowing stones.
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.2;
        parts.push({ geo: transformed(blob(H * 0.004, H * 0.004, H * 0.004, 6), { pos: onRing(mid, a, H * 0.004).toArray() as [number, number, number] }), mat: 'glow', bind: B });
      }
    }
  }
  return [];
}

/** The thigh bone on the side of a point. */
function s1(x: number): string {
  return x >= 0 ? 'hipL' : 'hipR';
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

const BUILDERS: Partial<Record<EquipSlot, (ctx: Ctx) => string[]>> = {
  chest: buildChest,
  helm: buildHelm,
  gloves: buildGloves,
  boots: buildBoots,
  belt: buildBelt,
};

/**
 * Skins one-off pieces to a body, for things that are not items: a smith's
 * burn-scarred forearms, a satchel strap. Each part names a material as
 * `pal:<palette>[:<tint hex>]`, and either `bind` bones or one `rigid` bone.
 */
export function buildFitted(
  fit: BodyFit,
  name: string,
  parts: Array<{ geo: THREE.BufferGeometry; mat: string; bind?: string[]; rigid?: string; falloff?: number }>,
): THREE.Object3D {
  const look = gearLook({ baseId: name, rarity: 'normal' }, { shape: 'none', palette: 'metal.iron' });
  return assemble({ fit, look, rng: new Random(1), parts: parts.map((p) => ({ ...p })) }, name);
}

/**
 * Builds the worn form of an armour item for one body. Null for slots that are
 * held rather than worn (weapons, shields, jewellery).
 */
export function buildWorn(
  fit: BodyFit,
  slot: EquipSlot,
  item: Pick<Item, 'baseId' | 'rarity' | 'uniqueId' | 'setId'>,
  visual: ItemVisual,
): WornPiece | null {
  const build = BUILDERS[slot];
  if (!build) return null;
  const look = gearLook(item, visual);
  const ctx: Ctx = { fit, look, rng: new Random(look.signature || 1), parts: [] };
  const hides = build(ctx);
  if (ctx.parts.length === 0) return null;
  const object = assemble(ctx, `worn:${slot}`);
  object.userData.gearLook = look;
  return { object, hides };
}
