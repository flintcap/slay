/**
 * SLAY — rigged people: the six player classes and everyone in camp.
 *
 * Six classes, six silhouettes. Silhouette is the whole game at ARPG camera
 * distance: you read a character from a steep top-down view at fifteen metres,
 * where surface detail is two pixels wide and the outline is everything. So the
 * classes differ first in *shape* — the warden is a wall with a beard, the
 * pyromancer a lean figure with a mane of copper, the shadowblade a hooded
 * blade, the stormcaller trails braids, the revenant is a spindle of bone, the
 * ranger a ponytail and a long stride — and only second in colour.
 *
 * The rig is fixed and shared, so `Animation.ts` can drive any body:
 *   root, hips, spine, chest, head,
 *   shoulderL/R, elbowL/R, handL/R,
 *   hipL/R, kneeL/R, footL/R
 *
 * Limbs are single swept surfaces with the muscle masses built into their
 * cross-sections, not capsules joined by balls; heads are a cranium, a face
 * mass, a brow that throws the eyes into shadow, and hair that stops at a
 * hairline instead of a helmet-shaped shell. Skinning, the rig and the body's
 * measurements live in `BodyKit.ts`, which is also what `WornGear.ts` cuts
 * armour from, so gear fits whichever body it goes on.
 */

import * as THREE from 'three';
import type { CharClassId, EquipSlot, Item, ItemVisual, Rng } from '../types';
import { emissiveMaterial, surface, surfaceVariant } from './Materials';
import { resolvePalette } from './Palettes';
import { beveledBox, limb, normalizeGeometry, ring, taperedBox, transformed } from './Meshes';
import {
  ARM_L,
  ARM_R,
  LEG_L,
  LEG_R,
  SKIRT,
  TORSO,
  armNodes,
  blob,
  buildBones,
  buildSegments,
  deltoidGeo,
  footGeos,
  handGeos,
  legNodes,
  mergeSkinned,
  ringStack,
  shapedSphere,
  skinGeometry,
  smooth01,
  sweep,
  torsoRings,
  type BodyFit,
  type JointMap,
} from './BodyKit';
import { buildWorn } from './WornGear';

export { BONE_NAMES, type BoneName } from './BodyKit';

// ---------------------------------------------------------------------------
// Proportions
// ---------------------------------------------------------------------------

/**
 * Body proportions, in fractions of total height. Changing these is how a
 * class silhouette is really made — armour on top of the wrong proportions
 * still reads as the same character. The joints they produce are a contract
 * with the animation stream: never move them without agreeing it there.
 */
export interface BodyProfile {
  height: number;
  /** Half-distance between shoulder joints. */
  shoulder: number;
  /** Half-distance between hip joints. */
  hip: number;
  /** Limb radius multiplier. */
  thick: number;
  /** Torso depth multiplier. */
  depth: number;
  head: number;
  /** Forward lean of the whole spine, radians. */
  lean: number;
}

function jointsFor(p: BodyProfile): JointMap {
  const H = p.height;
  const j: JointMap = {};
  j.root = new THREE.Vector3(0, 0, 0);
  j.hips = new THREE.Vector3(0, H * 0.525, 0);
  j.spine = new THREE.Vector3(0, H * 0.615, 0);
  j.chest = new THREE.Vector3(0, H * 0.745, 0);
  j.head = new THREE.Vector3(0, H * 0.885, 0);
  j.shoulderL = new THREE.Vector3(p.shoulder * H, H * 0.8, 0);
  j.shoulderR = new THREE.Vector3(-p.shoulder * H, H * 0.8, 0);
  // Arms hang, they do not splay. Running the elbow and hand further out than
  // the shoulder held them off the body like a scarecrow's; a resting arm
  // actually comes slightly inward as it drops.
  j.elbowL = new THREE.Vector3(p.shoulder * H * 0.94, H * 0.64, H * 0.006);
  j.elbowR = new THREE.Vector3(-p.shoulder * H * 0.94, H * 0.64, H * 0.006);
  j.handL = new THREE.Vector3(p.shoulder * H * 0.88, H * 0.49, H * 0.014);
  j.handR = new THREE.Vector3(-p.shoulder * H * 0.88, H * 0.49, H * 0.014);
  j.hipL = new THREE.Vector3(p.hip * H, H * 0.5, 0);
  j.hipR = new THREE.Vector3(-p.hip * H, H * 0.5, 0);
  j.kneeL = new THREE.Vector3(p.hip * H * 1.02, H * 0.268, 0);
  j.kneeR = new THREE.Vector3(-p.hip * H * 1.02, H * 0.268, 0);
  j.footL = new THREE.Vector3(p.hip * H * 1.02, H * 0.035, 0);
  j.footR = new THREE.Vector3(-p.hip * H * 1.02, H * 0.035, 0);
  return j;
}

// ---------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------

/** How a head of hair is cut. */
export type HairStyle = 'crop' | 'long' | 'ponytail' | 'topknot' | 'braids' | 'bun' | 'shaved' | 'bald' | 'skull';

/** A material slot on a person: a palette and an optional multiplicative tint. */
export interface MatSpec {
  key: string;
  tint?: number;
}

/**
 * Everything that decides what one person looks like. The six classes are six
 * of these; the people in camp are more.
 */
export interface PersonLook {
  profile: BodyProfile;
  skin: MatSpec;
  hair: MatSpec;
  /** Undershirt and braies. */
  linen: MatSpec;
  leather: MatSpec;
  /** Hoods, scarves and other class cloth. */
  cloth: MatSpec;
  hairStyle: HairStyle;
  /** 0 clean-shaven, 1 short beard, 2 full beard. */
  beard?: number;
  /** Hairline height, -1..1 on the skull; higher is a receding hairline. */
  hairline?: number;
  /** A hood up over the head. Hidden by any helm. */
  hood?: boolean;
  /** A cloth mask over the lower face. Hidden by any helm. */
  mask?: boolean;
  /** Bare ribs and a lipless jaw: the revenant. */
  skeletal?: boolean;
  /** Eye colour if the eyes glow. */
  eyeGlow?: number;
  /** Shirt sleeves to the elbow rather than a sleeveless vest. */
  sleeves?: boolean;
  accent: number;
}

/**
 * Texture density per material bucket, in tiles across the body.
 *
 * Cloth and leather need many tiles, skin barely any — its texture is pores,
 * and pores should be invisible. Every bucket uses texture seed 0: boot warms
 * seed 0, and any other seed bakes a whole PBR set on the main thread the
 * first time a character is built.
 */
const MAT_REPEAT: Record<string, number> = {
  skin: 1.4,
  hair: 3,
  shadow: 1,
  linen: 11,
  cloth: 8,
  leather: 7,
  bone: 2,
};

const skinCache = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Skin keeps its palette's relief and roughness but drops the albedo map. The
 * palette's speckle and stain passes are right for weathered stone and wrong
 * for a face: at play distance they read as dirt, close up as a rash. Skin's
 * colour should come from form and light, so it is one flat tone.
 */
function skinMaterial(spec: MatSpec): THREE.MeshStandardMaterial {
  const ck = `${spec.key}|${spec.tint ?? 0xffffff}`;
  const hit = skinCache.get(ck);
  if (hit) return hit;
  const mat = surfaceVariant(spec.key, { repeat: MAT_REPEAT.skin, seed: 0, bump: 0.3 });
  mat.map = null;
  mat.color.setHex(resolvePalette(spec.key).base);
  if (spec.tint !== undefined) mat.color.multiply(new THREE.Color(spec.tint));
  mat.userData.shared = true;
  mat.needsUpdate = true;
  skinCache.set(ck, mat);
  return mat;
}

/** A shared, cached material for one bucket. */
function personMaterial(bucket: string, spec: MatSpec | undefined, look: PersonLook): THREE.Material {
  if (bucket === 'skin' && spec && !look.skeletal) return skinMaterial(spec);
  if (bucket === 'eye') return emissiveMaterial(look.eyeGlow ?? 0xffffff, 2.2);
  if (bucket === 'sclera') return surface('cloth.linen', { repeat: 1, seed: 0, tint: 0xf4ece4, roughness: 0.4, bump: 0.1 });
  if (bucket === 'shadow') return surface('metal.dark', { repeat: 1, seed: 0, tint: 0x3a3230, roughness: 0.9, metalness: 0 });
  const s = spec ?? { key: 'metal.iron' };
  const repeat = MAT_REPEAT[bucket] ?? 3;
  // Skin's normal map is pulled well back: relief that strong reads as
  // pockmarks at portrait scale and as shimmering grain in play.
  const bump = bucket === 'skin' ? 0.35 : bucket === 'hair' ? 0.8 : undefined;
  return surface(s.key, { repeat, seed: 0, tint: s.tint, bump });
}

export const CLASS_LOOKS: Record<CharClassId, PersonLook> = {
  // ---------------------------------------------------------------- WARDEN --
  warden: {
    profile: { height: 1.86, shoulder: 0.135, hip: 0.062, thick: 1.28, depth: 1.25, head: 1.0, lean: 0.03 },
    skin: { key: 'skin.tan' },
    hair: { key: 'hair.dark', tint: 0xc8a888 },
    linen: { key: 'cloth.undyed' },
    leather: { key: 'leather.worn' },
    cloth: { key: 'cloth.banner' },
    hairStyle: 'crop',
    beard: 2,
    hairline: 0.42,
    sleeves: true,
    accent: 0xd8b45a,
  },
  // ----------------------------------------------------------- PYROMANCER --
  pyromancer: {
    profile: { height: 1.76, shoulder: 0.098, hip: 0.05, thick: 0.94, depth: 0.92, head: 1.0, lean: 0.06 },
    skin: { key: 'skin.fair' },
    hair: { key: 'hair.fair', tint: 0xe08a5a },
    linen: { key: 'cloth.linen' },
    leather: { key: 'leather.fine' },
    cloth: { key: 'cloth.silk' },
    hairStyle: 'long',
    hairline: 0.34,
    accent: 0xff7a2a,
  },
  // ---------------------------------------------------------- SHADOWBLADE --
  shadowblade: {
    profile: { height: 1.78, shoulder: 0.105, hip: 0.052, thick: 0.88, depth: 0.86, head: 0.96, lean: 0.11 },
    skin: { key: 'skin.deep' },
    hair: { key: 'hair.dark' },
    linen: { key: 'cloth.tattered', tint: 0x9a9aa4 },
    leather: { key: 'leather.studded' },
    cloth: { key: 'cloth.tattered', tint: 0x6a6e78 },
    hairStyle: 'topknot',
    hood: true,
    mask: true,
    accent: 0x4ad69a,
  },
  // ----------------------------------------------------------- STORMCALLER --
  stormcaller: {
    profile: { height: 1.8, shoulder: 0.115, hip: 0.055, thick: 1.0, depth: 1.0, head: 1.0, lean: 0.05 },
    skin: { key: 'skin.fair', tint: 0xf4eee8 },
    hair: { key: 'hair.dark', tint: 0xb8c4d8 },
    linen: { key: 'cloth.undyed', tint: 0xd8dce4 },
    leather: { key: 'leather.studded' },
    cloth: { key: 'cloth.silk', tint: 0x9fb4d8 },
    hairStyle: 'braids',
    hairline: 0.38,
    beard: 1,
    accent: 0x6fc8ff,
  },
  // -------------------------------------------------------------- REVENANT --
  revenant: {
    profile: { height: 1.84, shoulder: 0.12, hip: 0.05, thick: 0.72, depth: 0.78, head: 1.02, lean: 0.14 },
    skin: { key: 'bone.pale' },
    hair: { key: 'bone.old' },
    linen: { key: 'cloth.tattered' },
    leather: { key: 'leather.worn' },
    cloth: { key: 'cloth.tattered', tint: 0x7a8a7e },
    hairStyle: 'skull',
    skeletal: true,
    eyeGlow: 0x7ce0a0,
    accent: 0x7ce0a0,
  },
  // ---------------------------------------------------------------- RANGER --
  ranger: {
    profile: { height: 1.79, shoulder: 0.112, hip: 0.053, thick: 0.92, depth: 0.9, head: 0.98, lean: 0.07 },
    skin: { key: 'skin.tan', tint: 0xf8e8dc },
    hair: { key: 'hair.fair' },
    linen: { key: 'cloth.undyed' },
    leather: { key: 'leather.studded' },
    cloth: { key: 'cloth.undyed', tint: 0x8a9a70 },
    hairStyle: 'ponytail',
    hairline: 0.36,
    sleeves: true,
    accent: 0x7fc46a,
  },
};

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

interface Part {
  geo: THREE.BufferGeometry;
  /** Material bucket key. */
  mat: string;
  /** Restrict which bones may claim this part. */
  bind?: string[];
  /** Softer blending across joints for loose things (hair, hoods). */
  falloff?: number;
  /**
   * What hides this part. An equipment slot means "hidden while that slot is
   * worn": a part tagged `chest` is the undershirt, and the moment real chest
   * armour is equipped it steps aside. `hair` (the cap of hair) and
   * `hairLong` (falls, braids, tails) are hidden by helms that close over the
   * head, as `WornGear` asks. Untagged parts are the person themself.
   */
  cover?: string;
}

interface BuildCtx {
  fit: BodyFit;
  look: PersonLook;
  rng: Rng;
  parts: Part[];
}

/**
 * The person under the clothes: torso, limbs, hands, feet, neck.
 *
 * What makes a body read as a body is landmarks, not detail. A shoulder is a
 * mass that caps the arm, an elbow and a knee are narrower than the muscle
 * either side, a wrist and an ankle are genuinely thin, a waist is narrower
 * than the ribcage above it and the hips below it.
 */
function baseBody(ctx: BuildCtx): void {
  const { fit, parts, look } = ctx;
  const { H, shW, hipW, joints: j } = fit;
  const u = H * fit.limbT;

  parts.push({ geo: ringStack(torsoRings(fit), 20), mat: 'skin', bind: TORSO });

  // Neck, then the two trapezius wedges that stop the head floating.
  parts.push({
    geo: transformed(limb(H * 0.066, H * 0.03 * Math.sqrt(fit.t), H * 0.036 * Math.sqrt(fit.t), 10), {
      pos: [0, H * 0.818, -H * 0.006],
    }),
    mat: 'skin',
    bind: ['chest', 'head'],
  });
  for (const side of [-1, 1]) {
    parts.push({
      geo: transformed(blob(shW * 0.44, H * 0.024, hipW * 0.58 * fit.dep, 10), {
        pos: [side * shW * 0.42, H * 0.806, -H * 0.008],
        rot: [0, 0, side * -0.26],
      }),
      mat: 'skin',
      bind: ['chest'],
    });
  }

  for (const side of [1, -1] as const) {
    const bindArm = side > 0 ? ARM_L : ARM_R;
    const bindLeg = side > 0 ? LEG_L : LEG_R;
    const S = j[side > 0 ? 'shoulderL' : 'shoulderR'];

    // One continuous arm, shoulder to palm.
    parts.push({ geo: sweep(armNodes(fit, side), 12), mat: 'skin', bind: bindArm });
    parts.push({ geo: deltoidGeo(fit, side), mat: 'skin', bind: bindArm });
    for (const g of handGeos(fit, side)) parts.push({ geo: g, mat: 'skin', bind: bindArm, cover: 'gloves' });

    parts.push({ geo: sweep(legNodes(fit, side), 12), mat: 'skin', bind: bindLeg });
    for (const g of footGeos(fit, side)) parts.push({ geo: g, mat: 'skin', bind: bindLeg, cover: 'boots' });
  }

  if (look.skeletal) ribs(ctx);
}

/** The revenant's ribcage: bars of bone standing proud of a sunken chest. */
function ribs(ctx: BuildCtx): void {
  const { fit, parts } = ctx;
  const H = fit.H;
  const rings = torsoRings(fit, H * 0.004);
  const nearest = (y: number) => rings.reduce((best, cur) => (Math.abs(cur.y - y) < Math.abs(best.y - y) ? cur : best));
  for (let i = 0; i < 5; i++) {
    const y = H * (0.69 + i * 0.022);
    const r = nearest(y);
    const bar = ring(1, H * 0.0055, 18, 5);
    bar.rotateX(Math.PI * 0.5);
    bar.scale(r.w * (0.96 - i * 0.02), 1, r.df * 1.0);
    bar.translate(0, y, 0);
    parts.push({ geo: bar, mat: 'bone', bind: ['chest', 'spine'] });
  }
  // Sternum and the knuckles of the spine.
  parts.push({
    geo: transformed(taperedBox(H * 0.02, H * 0.012, H * 0.014, H * 0.01, H * 0.11, H * 0.003), {
      pos: [0, H * 0.73, nearest(H * 0.73).df + H * 0.004],
    }),
    mat: 'bone',
    bind: ['chest'],
  });
  for (let i = 0; i < 7; i++) {
    const y = H * (0.54 + i * 0.04);
    parts.push({
      geo: transformed(blob(H * 0.011, H * 0.009, H * 0.012, 6), { pos: [0, y, -(nearest(y).db + H * 0.002)] }),
      mat: 'bone',
      bind: TORSO,
    });
  }
}

function underGarments(ctx: BuildCtx): void {
  const { fit, parts, look } = ctx;
  const { H, hipW, joints: j } = fit;
  const t = fit.limbT;
  // Cloth sits a fixed distance off the body rather than a fixed percentage,
  // so it does not balloon at the chest and shrink-wrap at the waist.
  const g = H * 0.006;

  // Shirt: the torso's own rings, grown by the cloth's thickness.
  parts.push({
    geo: ringStack(torsoRings(fit, g, 0.54, 0.805), 20),
    mat: 'linen',
    // Body armour replaces the undershirt rather than sitting over it.
    cover: 'chest',
    bind: TORSO,
  });
  if (look.sleeves) {
    for (const side of [1, -1] as const) {
      parts.push({
        geo: sweep(armNodes(fit, side, H * 0.007, 0, 0.36), 12),
        mat: 'linen',
        cover: 'chest',
        bind: side > 0 ? ARM_L : ARM_R,
      });
      parts.push({ geo: deltoidGeo(fit, side, H * 0.007), mat: 'linen', cover: 'chest', bind: side > 0 ? ARM_L : ARM_R });
    }
  }

  // Braies: a waistband and two short legs, cut mid-thigh.
  parts.push({ geo: ringStack(torsoRings(fit, g, 0.44, 0.58), 18), mat: 'linen', bind: SKIRT });
  for (const side of [1, -1] as const) {
    parts.push({ geo: sweep(legNodes(fit, side, g * 1.1, 0.04, 0.26), 12), mat: 'linen', bind: side > 0 ? LEG_L : LEG_R });
  }

  // Waist cord. A torus, because a box here reads as a second belt buckle.
  const waist = torsoRings(fit, g * 1.6, 0.57, 0.585)[0] ?? { w: hipW * 1.06, df: hipW * 0.8, db: hipW * 0.74 };
  const cord = ring(1, H * 0.0085, 22, 6);
  cord.rotateX(Math.PI * 0.5);
  cord.scale(waist.w, 1, (waist.df + waist.db) * 0.5);
  cord.translate(0, H * 0.578, 0);
  parts.push({ geo: cord, mat: 'leather', bind: ['hips'] });
  parts.push({
    geo: transformed(limb(H * 0.05, H * 0.007, H * 0.005, 5), {
      pos: [H * 0.014, H * 0.548, waist.df],
      rot: [0.2, 0, 0.3],
    }),
    mat: 'leather',
    bind: ['hips'],
  });

  // Foot wraps: strips crossing the instep.
  for (const side of [1, -1] as const) {
    const f = j[side > 0 ? 'footL' : 'footR'];
    for (let i = 0; i < 2; i++) {
      parts.push({
        geo: transformed(beveledBox(H * 0.054 * Math.sqrt(t), H * 0.012, H * 0.026, H * 0.004), {
          pos: [f.x, f.y + H * 0.034 - i * H * 0.012, f.z + H * 0.012 + i * H * 0.03],
          rot: [i * 0.35, 0, 0],
        }),
        mat: 'linen',
        cover: 'boots',
        bind: side > 0 ? LEG_L : LEG_R,
      });
    }
  }
}

/**
 * A head with actual structure.
 *
 * What reads at forty pixels is the egg of the cranium, a face mass narrowing
 * to a chin, a brow that throws the eyes into shadow, and hair. Hair most of
 * all: a big shape in a different colour from the skin is the cheapest thing
 * that separates a head from a boulder. It has to *stop*, though. The old hair
 * was a full ellipsoid around the skull that came down to the chin, which from
 * every angle but dead ahead read as a helmet.
 */
function baseHead(ctx: BuildCtx): void {
  const { fit, parts, look } = ctx;
  const r = fit.headR;
  const c = fit.joints.head;
  const O = new THREE.Vector3(c.x, c.y + r * 0.15, c.z);
  const at = (x: number, y: number, z: number): [number, number, number] => [O.x + x * r, O.y + y * r, O.z + z * r];
  const skull = look.hairStyle === 'skull';
  const HEAD = ['head'];

  // Cranium: an egg, taller than wide, set back over the neck.
  parts.push({ geo: transformed(blob(r * 0.9, r * 1.0, r * 0.94, 16), { pos: at(0, 0.12, -0.16) }), mat: 'skin', bind: ['head', 'chest'] });

  // Face: one smooth mass from the brow down to a narrow chin.
  const gaunt = skull ? 0.82 : 1;
  const face = ringStack(
    [
      { y: -1.0, w: 0.2, df: 0.26, db: 0.22, z: 0.4 },
      { y: -0.84, w: 0.36 * gaunt, df: 0.4, db: 0.36, z: 0.36 },
      { y: -0.6, w: 0.6 * gaunt, df: 0.48, db: 0.5, z: 0.22 },
      { y: -0.3, w: 0.76 * gaunt, df: 0.6, db: 0.6, z: 0.12 },
      { y: 0.0, w: 0.84, df: 0.68, db: 0.7, z: 0.06 },
      { y: 0.3, w: 0.86, df: 0.7, db: 0.7, z: 0.0 },
      { y: 0.52, w: 0.72, df: 0.58, db: 0.6, z: -0.04 },
    ].map((q) => ({ y: O.y + q.y * r, w: q.w * r, df: q.df * r, db: q.db * r, z: O.z + q.z * r })),
    14,
  );
  parts.push({ geo: face, mat: 'skin', bind: HEAD });

  // Brow ridge and cheekbones frame the eyes, so the sockets sit in shadow.
  parts.push({ geo: transformed(blob(r * 0.66, r * 0.1, r * 0.16, 10), { pos: at(0, 0.25, 0.64), rot: [-0.1, 0, 0] }), mat: 'skin', bind: HEAD });
  for (const s of [-1, 1]) {
    parts.push({ geo: transformed(blob(r * 0.16, r * 0.07, r * 0.1, 8), { pos: at(s * 0.5, -0.06, 0.52) }), mat: 'skin', bind: HEAD });
    // The socket, recessed between brow and cheek.
    parts.push({
      geo: transformed(blob(r * (skull ? 0.2 : 0.14), r * (skull ? 0.17 : 0.08), r * 0.06, 8), { pos: at(s * 0.31, 0.08, skull ? 0.66 : 0.68) }),
      mat: 'shadow',
      bind: HEAD,
    });
    if (look.eyeGlow !== undefined) {
      parts.push({ geo: transformed(blob(r * 0.07, r * 0.06, r * 0.04, 6), { pos: at(s * 0.32, 0.08, 0.73) }), mat: 'eye', bind: HEAD });
    } else if (!skull) {
      // An eye in the socket: a pale almond and a dark iris. Too small to see
      // in play; at portrait scale it is the difference between a face and a
      // mask with holes in it.
      parts.push({ geo: transformed(blob(r * 0.085, r * 0.045, r * 0.04, 8), { pos: at(s * 0.31, 0.08, 0.715) }), mat: 'sclera', bind: HEAD });
      parts.push({ geo: transformed(blob(r * 0.036, r * 0.036, r * 0.02, 6), { pos: at(s * 0.3, 0.08, 0.75) }), mat: 'shadow', bind: HEAD });
    }
    if (!skull) {
      parts.push({ geo: transformed(blob(r * 0.08, r * 0.2, r * 0.14, 8), { pos: at(s * 0.86, 0.02, -0.06) }), mat: 'skin', bind: HEAD });
    }
  }

  if (skull) {
    // A nasal cavity and a band of teeth where a living face has a nose and lips.
    parts.push({ geo: transformed(taperedBox(r * 0.16, r * 0.08, r * 0.04, r * 0.06, r * 0.22, r * 0.02), { pos: at(0, -0.2, 0.72) }), mat: 'shadow', bind: HEAD });
    parts.push({ geo: transformed(beveledBox(r * 0.46, r * 0.12, r * 0.1, r * 0.02), { pos: at(0, -0.58, 0.66) }), mat: 'hair', bind: HEAD });
    parts.push({ geo: transformed(beveledBox(r * 0.4, r * 0.03, r * 0.1, r * 0.01), { pos: at(0, -0.58, 0.69) }), mat: 'shadow', bind: HEAD });
  } else {
    // Nose: a wedge off the brow, catching the key light down the centre.
    parts.push({
      geo: transformed(taperedBox(r * 0.24, r * 0.28, r * 0.12, r * 0.12, r * 0.4, r * 0.03), { pos: at(0, -0.14, 0.76), rot: [0.32, 0, 0] }),
      mat: 'skin',
      bind: HEAD,
    });
    parts.push({ geo: transformed(beveledBox(r * 0.32, r * 0.04, r * 0.05, r * 0.015), { pos: at(0, -0.55, 0.7) }), mat: 'shadow', bind: HEAD });
  }

  hair(ctx, O, r);
  if (look.beard) beard(ctx, O, r, look.beard);
  if (look.mask) mask(ctx, O, r);
  if (look.hood) hood(ctx, O, r);
}

/**
 * Hair: the skull's own shape grown outward, then sunk back under the skin
 * wherever this cut does not reach, so it ends at a hairline, above the ears
 * or at the nape like real hair.
 */
function hair(ctx: BuildCtx, O: THREE.Vector3, r: number): void {
  const { parts, look } = ctx;
  const style = look.hairStyle;
  if (style === 'bald' || style === 'skull') return;
  const HEAD = ['head'];
  const line = look.hairline ?? 0.36;
  const close = style === 'shaved' || style === 'topknot';
  const short = style === 'crop' || close;
  const vol = close ? 1.04 : 1.1;
  const cap = shapedSphere(
    r * 0.9 * vol,
    r * 1.0 * vol,
    r * 0.94 * vol,
    (n) => {
      const front = smooth01(0.05, 0.4, n.z) * smooth01(line + 0.06, line - 0.12, n.y);
      const side = (short ? 1 : 0.15) * smooth01(0.5, 0.82, Math.abs(n.x)) * smooth01(0.02, -0.28, n.y) * smooth01(-0.4, 0.1, n.z);
      const nape = short ? smooth01(-0.5, -0.78, n.y) : 0;
      const under = smooth01(-0.62, -0.9, n.y) * smooth01(-0.8, -0.3, n.z);
      return 1 - 0.16 * Math.max(front, side, nape, under);
    },
    18,
  );
  cap.translate(O.x, O.y + r * 0.12, O.z - r * 0.16);
  parts.push({ geo: cap, mat: 'hair', bind: HEAD, cover: 'hair' });

  const back = (y: number, z: number): THREE.Vector3 => new THREE.Vector3(O.x, O.y + y * r, O.z + z * r);
  if (style === 'long' || style === 'braids') {
    // A fall of hair down the back to the shoulder blades.
    const fall = ringStack(
      [
        { y: -2.6, w: 0.62, df: 0.08, db: 0.16, z: -0.98 },
        { y: -1.9, w: 0.72, df: 0.14, db: 0.24, z: -0.98 },
        { y: -1.1, w: 0.84, df: 0.3, db: 0.3, z: -0.86 },
        { y: -0.4, w: 0.9, df: 0.5, db: 0.32, z: -0.62 },
        { y: 0.2, w: 0.86, df: 0.5, db: 0.3, z: -0.56 },
      ].map((q) => ({ y: O.y + q.y * r, w: q.w * r, df: q.df * r, db: q.db * r, z: O.z + q.z * r })),
      12,
    );
    parts.push({ geo: fall, mat: 'hair', bind: ['head', 'chest'], falloff: 1.5, cover: 'hairLong' });
  }
  if (style === 'braids') {
    for (const s of [-1, 1]) {
      const nodes = [0, 1, 2, 3, 4].map((i) => ({
        p: new THREE.Vector3(O.x + s * r * (0.82 + i * 0.04), O.y - r * (0.1 + i * 0.42), O.z - r * (0.2 - i * 0.02)),
        rx: r * (0.13 - i * 0.012),
        rz: r * (0.13 - i * 0.012),
      }));
      parts.push({ geo: sweep(nodes, 6), mat: 'hair', bind: ['head', 'chest'], falloff: 1.5, cover: 'hairLong' });
      const end = nodes[4].p;
      parts.push({ geo: transformed(blob(r * 0.08, r * 0.08, r * 0.08, 6), { pos: [end.x, end.y - r * 0.08, end.z] }), mat: 'leather', bind: ['head', 'chest'], cover: 'hairLong' });
    }
  }
  if (style === 'ponytail') {
    const tie = back(0.05, -1.02);
    parts.push({ geo: transformed(blob(r * 0.16, r * 0.16, r * 0.14, 8), { pos: [tie.x, tie.y, tie.z] }), mat: 'leather', bind: HEAD, cover: 'hair' });
    const nodes = [0, 1, 2, 3, 4].map((i) => ({
      p: back(0.05 - i * 0.48, -1.08 - Math.sin(i * 0.7) * 0.14),
      rx: r * [0.17, 0.22, 0.2, 0.15, 0.06][i],
      rz: r * [0.15, 0.18, 0.16, 0.12, 0.05][i],
    }));
    parts.push({ geo: sweep(nodes, 8), mat: 'hair', bind: ['head', 'chest'], falloff: 1.5, cover: 'hairLong' });
  }
  if (style === 'topknot' || style === 'bun') {
    const knot = style === 'topknot' ? back(1.02, -0.3) : back(0.2, -1.02);
    parts.push({ geo: transformed(blob(r * 0.24, r * 0.22, r * 0.24, 10), { pos: [knot.x, knot.y, knot.z] }), mat: 'hair', bind: HEAD, cover: 'hair' });
    parts.push({
      geo: transformed(ring(r * 0.15, r * 0.04, 10, 5), { pos: [knot.x, knot.y - r * 0.14, knot.z], rot: [Math.PI * 0.5, 0, 0] }),
      mat: 'leather',
      bind: HEAD,
      cover: 'hair',
    });
  }
}

/** A beard: the jaw grown outward and cut back above the mouth. */
function beard(ctx: BuildCtx, O: THREE.Vector3, r: number, amount: number): void {
  const full = amount >= 2;
  const g = full ? 0.12 : 0.04;
  const rings = [
    { y: full ? -1.32 : -1.06, w: 0.12, df: 0.16, db: 0.1, z: full ? 0.46 : 0.42 },
    { y: -1.0, w: 0.3 + g, df: 0.3 + g, db: 0.26, z: 0.4 },
    { y: -0.84, w: 0.4 + g, df: 0.44 + g, db: 0.4, z: 0.36 },
    { y: -0.6, w: 0.64 + g, df: 0.5 + g, db: 0.5, z: 0.22 },
    { y: -0.28, w: 0.8 + g * 0.5, df: 0.34, db: 0.6, z: 0.08 },
  ].map((q) => ({ y: O.y + q.y * r, w: q.w * r, df: q.df * r, db: q.db * r, z: O.z + q.z * r }));
  ctx.parts.push({ geo: ringStack(rings, 14), mat: 'hair', bind: ['head'] });
  if (full) {
    // Moustache over the mouth line.
    ctx.parts.push({
      geo: transformed(taperedBox(r * 0.5, r * 0.1, r * 0.3, r * 0.12, r * 0.12, r * 0.04), { pos: [O.x, O.y - r * 0.44, O.z + r * 0.76] }),
      mat: 'hair',
      bind: ['head'],
    });
  }
}

/** A cloth mask over the nose and mouth. */
function mask(ctx: BuildCtx, O: THREE.Vector3, r: number): void {
  const g = r * 0.06;
  const rings = [
    { y: -1.04, w: 0.26, df: 0.32, db: 0.3, z: 0.38 },
    { y: -0.84, w: 0.44, df: 0.46, db: 0.44, z: 0.34 },
    { y: -0.6, w: 0.66, df: 0.54, db: 0.58, z: 0.2 },
    { y: -0.3, w: 0.82, df: 0.66, db: 0.7, z: 0.1 },
    { y: -0.06, w: 0.9, df: 0.76, db: 0.76, z: 0.04 },
  ].map((q) => ({ y: O.y + q.y * r, w: q.w * r + g, df: q.df * r + g, db: q.db * r + g, z: O.z + q.z * r }));
  ctx.parts.push({ geo: ringStack(rings, 14), mat: 'cloth', bind: ['head'], cover: 'helm' });
}

/**
 * A hood: a shaped shell over the head, open at the face, with a cowl that
 * drapes onto the shoulders. The shadow it casts over the eyes is most of a
 * rogue's silhouette.
 */
function hood(ctx: BuildCtx, O: THREE.Vector3, r: number): void {
  const { fit } = ctx;
  const shell = shapedSphere(
    r * 1.08,
    r * 1.16,
    r * 1.2,
    (n) => {
      // Open at the face: sink a forward oval under the skin.
      const face = smooth01(0.25, 0.62, n.z) * smooth01(0.66, 0.34, n.y) * smooth01(0.8, 0.5, Math.abs(n.x));
      return 1 - 0.4 * face;
    },
    20,
  );
  // A hood is not a ball: its crown runs back to a point, the sides hang
  // straight past the cheeks, and the front edge peaks over the brow.
  const pos = shell.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const back = smooth01(0, -1.1 * r, z) * smooth01(-0.2 * r, 0.9 * r, y);
    let nx = x * (1 - 0.3 * back);
    let ny = y + back * r * 0.22;
    let nz = z - back * r * 0.42;
    // Straight sides below the temples.
    if (y < 0) nx *= 1 + smooth01(0, -0.9 * r, y) * 0.08;
    // The brim, pulled forward and down over the brow.
    const brim = smooth01(0.5 * r, 1.0 * r, z) * smooth01(0.2 * r, 0.8 * r, y);
    nz += brim * r * 0.18;
    ny -= brim * r * 0.08;
    pos.setXYZ(i, nx, ny, nz);
  }
  shell.computeVertexNormals();
  shell.translate(O.x, O.y + r * 0.12, O.z - r * 0.1);
  ctx.parts.push({ geo: shell, mat: 'cloth', bind: ['head'], cover: 'helm' });
  // Cowl over the shoulders.
  const cowl = ringStack(torsoRings(fit, fit.H * 0.022, 0.755, 0.84), 18);
  ctx.parts.push({ geo: cowl, mat: 'cloth', bind: ['chest', 'head'], falloff: 2, cover: 'helm' });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface PlayerModel {
  root: THREE.Group;
  skeleton: THREE.Skeleton;
  bones: Record<string, THREE.Bone>;
}

/**
 * Builds any rigged person from a look. The player classes and every camp
 * resident come through here, so they share one rig the animator drives.
 */
export function buildPerson(look: PersonLook, rng: Rng, name = 'person'): PlayerModel {
  const p = look.profile;
  const joints = jointsFor(p);
  const { bones, order, rootBone } = buildBones(joints);
  const segs = buildSegments(joints, order);
  const skeleton = new THREE.Skeleton(order);
  const fit: BodyFit = {
    H: p.height,
    shW: p.shoulder * p.height,
    hipW: p.hip * p.height,
    dep: p.depth,
    t: p.thick,
    limbT: Math.pow(p.thick, 0.6),
    headR: p.height * 0.056 * p.head,
    joints,
    segs,
    skeleton,
  };

  const ctx: BuildCtx = { fit, look, rng, parts: [] };
  // Every class starts as bare body plus underwear. What a character wears
  // beyond that is decided entirely by their equipment slots.
  baseBody(ctx);
  baseHead(ctx);
  underGarments(ctx);

  const root = new THREE.Group();
  root.name = name;
  root.add(rootBone);

  // Bucket parts by material so the whole character is a handful of draw
  // calls. The cover joins the key: pieces that gear replaces live in their
  // own mesh so they can be hidden independently of the body they sit on.
  const buckets = new Map<string, THREE.BufferGeometry[]>();
  for (const part of ctx.parts) {
    normalizeGeometry(part.geo);
    skinGeometry(part.geo, segs, part.bind, part.falloff ?? 3);
    const key = `${part.mat}#${part.cover ?? ''}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(part.geo);
  }

  const specs: Record<string, MatSpec | undefined> = {
    skin: look.skin,
    hair: look.hair,
    linen: look.linen,
    leather: look.leather,
    cloth: look.cloth,
    bone: look.skin,
  };
  for (const [key, list] of buckets) {
    const [matKey, coverKey] = key.split('#');
    const geo = mergeSkinned(list);
    for (const g of list) g.dispose();
    const mesh = new THREE.SkinnedMesh(geo, personMaterial(matKey, specs[matKey], look));
    mesh.name = `${name}:${matKey}`;
    if (coverKey) mesh.userData.coverSlot = coverKey;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Skinned bounds are computed from the bind pose and go stale the moment a
    // limb swings; culling on them pops characters out at the screen edge.
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
  }

  root.userData.accent = look.accent;
  root.userData.height = p.height;
  root.userData.bodyFit = fit;
  root.userData.look = look;
  return { root, skeleton, bones };
}

/**
 * Builds a rigged player model. Bone names are fixed so the animation layer can
 * drive any class: 'root','hips','spine','chest','head','shoulderL/R',
 * 'elbowL/R','handL/R','hipL/R','kneeL/R','footL/R'.
 */
export function buildPlayerModel(classId: CharClassId, rng: Rng, worn?: Iterable<EquipSlot>): PlayerModel {
  const look = CLASS_LOOKS[classId] ?? CLASS_LOOKS.warden;
  const built = buildPerson(look, rng, `player:${classId}`);
  built.root.userData.classId = classId;
  applyWornSlots(built.root, worn ?? []);
  return built;
}

/**
 * Hides the body's own covering for every slot that has real gear in it, and
 * whatever else that gear asked to hide (a closed helm hides the hair).
 *
 * This is what makes equipment change how you look. A fresh character wears
 * nothing but linen; equip a breastplate and the undershirt steps aside for it
 * rather than clipping through it. Cheap enough to call on every equip — it
 * only flips `visible`.
 */
export function applyWornSlots(root: THREE.Object3D, worn: Iterable<EquipSlot>): void {
  const set = new Set<string>(worn as Iterable<string>);
  root.userData.wornSlots = new Set(set);
  const extra = (root.userData.extraCovers ?? {}) as Record<string, string[]>;
  for (const [slot, keys] of Object.entries(extra)) {
    if (!set.has(slot)) continue;
    for (const k of keys) set.add(k);
  }
  root.traverse((o) => {
    const slot = o.userData?.coverSlot as string | undefined;
    if (slot) o.visible = !set.has(slot);
  });
}

/** The class accent colour, for rim lights and UI tinting. */
export function classAccent(classId: CharClassId): number {
  return (CLASS_LOOKS[classId] ?? CLASS_LOOKS.warden).accent;
}

/**
 * Puts a piece of armour on the body itself — helm, chest, gloves, boots or
 * belt — cut to this body's measurements and skinned to its skeleton, so it
 * bends with the arm and fits a broad warden and a thin pyromancer alike.
 *
 * Returns the object it attached (under a bone, tagged with `socketSlot`, so
 * `clearSocket` removes it like any socketed item), or null for slots and
 * bodies it does not handle; callers then fall back to `attachToSocket`.
 */
export function wearItem(
  body: THREE.Object3D,
  bones: Record<string, THREE.Bone>,
  slot: EquipSlot,
  item: Pick<Item, 'baseId' | 'rarity' | 'uniqueId' | 'setId'>,
  visual: ItemVisual | undefined,
): THREE.Object3D | null {
  const fit = body.userData?.bodyFit as BodyFit | undefined;
  const host = bones.hips ?? bones.root;
  if (!fit || !visual || !host) return null;
  const worn = buildWorn(fit, slot, item, visual);
  if (!worn) return null;
  clearSocket(bones, slot);
  worn.object.userData.socketSlot = slot;
  host.add(worn.object);
  // What this piece hides on the body beyond its own slot.
  const extra = (body.userData.extraCovers ??= {}) as Record<string, string[]>;
  extra[slot] = worn.hides;
  const now = new Set<EquipSlot>((body.userData.wornSlots as Set<EquipSlot> | undefined) ?? []);
  now.add(slot);
  applyWornSlots(body, now);
  return worn.object;
}

// ---------------------------------------------------------------------------
// Equipment sockets
// ---------------------------------------------------------------------------

interface Socket {
  bone: string;
  pos: [number, number, number];
  rot: [number, number, number];
  scale?: number;
  /** A second bone that gets a mirrored clone (gloves, boots). */
  mirror?: string;
}

/**
 * Socket transforms are expressed in bone space. Item models are authored with
 * the grip at the origin and the business end along +Y, so a weapon socket is
 * mostly a rotation that turns +Y down the line of the fist.
 */
const SOCKETS: Record<string, Socket> = {
  mainHand: { bone: 'handR', pos: [0, -0.04, 0.02], rot: [Math.PI * 0.92, 0, 0] },
  offHand: { bone: 'handL', pos: [0, -0.04, 0.02], rot: [Math.PI * 0.92, 0, 0] },
  helm: { bone: 'head', pos: [0, 0.012, 0], rot: [0, 0, 0] },
  // Chest armour hangs from the shoulders, so it sits *below* the chest bone,
  // not level with it. At the bone's own height it rode up around the collar.
  chest: { bone: 'chest', pos: [0, -0.075, 0.01], rot: [0, 0, 0] },
  gloves: { bone: 'handR', pos: [0, -0.02, 0], rot: [0, 0, 0], mirror: 'handL' },
  boots: { bone: 'footR', pos: [0, 0.01, 0.02], rot: [0, 0, 0], mirror: 'footL' },
  belt: { bone: 'hips', pos: [0, 0.03, 0], rot: [0, 0, 0] },
  amulet: { bone: 'chest', pos: [0, 0.02, 0.08], rot: [0, 0, 0] },
  // Worn across the back, canted over the shoulder, mouth up.
  quiver: { bone: 'chest', pos: [-0.06, -0.02, -0.1], rot: [-0.28, 0, -0.42] },
  ring1: { bone: 'handR', pos: [0.015, -0.05, 0.01], rot: [Math.PI * 0.5, 0, 0] },
  ring2: { bone: 'handL', pos: [-0.015, -0.05, 0.01], rot: [Math.PI * 0.5, 0, 0] },
};

// ---------------------------------------------------------------------------
// Grips — how each kind of weapon is actually held
// ---------------------------------------------------------------------------

/**
 * Every weapon used one socket, so every weapon was held the same way: tipped
 * down and forward in the right fist. A greatsword was carried like a dagger, a
 * bow was clutched in the drawing hand rather than the bow hand, and a sword
 * hung point-down as if it had been dropped.
 *
 * A grip is a weapon's carry pose. Bones are unrotated in bind pose, so a
 * socket rotation is expressed directly in character space: **+X is the
 * character's left, +Y is up, +Z is forward**. Weapon models are authored with
 * the grip at the origin, the business end along +Y, the blade wide on X and
 * thin on Z, so these rotations are just "point the tip there, turn the flat
 * that way".
 */
export type WeaponGrip =
  | 'sword'
  | 'axe'
  | 'mace'
  | 'wand'
  | 'dagger'
  | 'twoHand'
  | 'staff'
  | 'bow'
  | 'none';

interface Grip {
  rot: [number, number, number];
  pos?: [number, number, number];
  /** Forces a hand, whatever slot the item sits in. Bows go in the bow hand. */
  bone?: string;
  /** True when the free hand comes across to help hold it. */
  bothHands: boolean;
}

/**
 * Solved by `tools/solve-grips.mjs`, not typed by hand.
 *
 * A socket rotation lives in the hand bone's frame, and by the time a weapon is
 * being carried that bone has been turned through most of a right angle by the
 * pose. Numbers authored against the bind pose come out pointing somewhere
 * else, so the tool settles the animation first and then solves the rotation
 * that lands the tip where it belongs.
 */
const GRIPS: Record<WeaponGrip, Grip> = {
  // Shouldered, leaning *outward*. Two things were wrong before: bolt upright
  // read as a rifle at attention, and tilting it backward ran the blade through
  // the shoulder and past the ear. A carried weapon leans away from its owner.
  sword: { rot: [0.391, 0.147, 1.03], pos: [0, -0.03, 0.02], bothHands: false },
  // Head-heavy, so it rides higher and closer in than a sword: the weight is
  // what you brace against the shoulder, not the haft.
  axe: { rot: [1.31, -0.493, 1.072], pos: [0, -0.03, 0.02], bothHands: false },
  // Blunt weapons rest on the shoulder outright, near vertical.
  mace: { rot: [0.423, 0.06, 0.796], pos: [0, -0.03, 0.02], bothHands: false },
  // A wand is a baton, not a blade. Held low at the side, pointing out ahead —
  // shouldering it like a sword made every caster look like a swordsman.
  wand: { rot: [-0.965, 0.007, 2.969], pos: [0, -0.03, 0.02], bothHands: false },
  // Straight down, reverse grip, barely canted. A knife rides point-down.
  dagger: { rot: [0.016, -0.199, -2.939], pos: [0, -0.04, 0.02], bothHands: false },
  // Up and across the body to the off side, both hands on the haft.
  twoHand: { rot: [0.548, -0.414, -0.761], pos: [0, -0.02, 0.03], bothHands: true },
  // Vertical, like a walking staff, second hand further down the shaft.
  staff: { rot: [0.802, -0.043, -0.136], pos: [0, -0.02, 0.02], bothHands: true },
  // Bow hand, not string hand: limbs diagonal across the body, string inward.
  bow: { rot: [-1.807, 0.175, 2.748], pos: [0, -0.03, 0.04], bone: 'handL', bothHands: true },
  none: { rot: [Math.PI * 0.92, 0, 0], bothHands: false },
};

/** Which grip a weapon category wants. Non-weapons keep the plain hand socket. */
export function weaponGrip(category: string | undefined, twoHanded: boolean): WeaponGrip {
  switch (category) {
    case 'bow':
    case 'crossbow':
      return 'bow';
    case 'dagger':
      return 'dagger';
    case 'staff':
    case 'spear':
      return 'staff';
    case 'sword':
      return twoHanded ? 'twoHand' : 'sword';
    case 'axe':
      return twoHanded ? 'twoHand' : 'axe';
    case 'mace':
      return twoHanded ? 'twoHand' : 'mace';
    case 'wand':
    case 'scepter':
      return 'wand';
    default:
      return 'none';
  }
}

/** True when this grip needs the free hand brought onto the weapon. */
export function gripUsesBothHands(grip: WeaponGrip): boolean {
  return GRIPS[grip].bothHands;
}

/**
 * The body pose a weapon asks for, as opposed to where the weapon itself sits.
 *
 * The socket says where the weapon is; this says what the other arm does about
 * it. One rule so the world character, the character sheet and the checker
 * cannot drift apart.
 */
export function carryGrip(
  category: string | undefined,
  twoHanded: boolean,
): 'none' | 'twoHand' | 'staff' | 'bow' {
  if (!twoHanded) return 'none';
  const grip = weaponGrip(category, true);
  return grip === 'bow' || grip === 'staff' || grip === 'twoHand' ? grip : 'none';
}

/** Which hand a grip actually puts the weapon in. */
export function gripBone(grip: WeaponGrip, slot: EquipSlot): string {
  return GRIPS[grip].bone ?? SOCKETS[slot]?.bone ?? 'handR';
}

/**
 * Removes anything previously socketed into `slot`, across every bone.
 *
 * Sweeping every bone rather than just the socket's own bone is what clears the
 * mirrored twin that paired slots (gloves, boots) put on the opposite limb.
 */
export function clearSocket(bones: Record<string, THREE.Bone>, slot: EquipSlot): void {
  for (const name of Object.keys(bones)) {
    const bone = bones[name];
    for (let i = bone.children.length - 1; i >= 0; i--) {
      const child = bone.children[i];
      if (child.userData && child.userData.socketSlot === slot) child.removeFromParent();
    }
  }
}

/**
 * Attaches an equipped item's model to the correct hand/body socket. Any
 * previous occupant of that slot — including the mirrored copy paired slots
 * create — is removed first, so repeated calls never stack geometry.
 */
export function attachToSocket(
  model: THREE.Object3D,
  bones: Record<string, THREE.Bone>,
  slot: EquipSlot,
  mesh: THREE.Object3D,
  /**
   * Overrides the socket for items that live somewhere other than their slot's
   * default. A quiver is an off-hand item you wear on your back, not a thing
   * you hold — socketing it into the hand put it in the fist like a club.
   */
  socketKey?: string,
  /**
   * How this weapon is held. Overrides the socket's own pose, and may move it
   * to the other hand — a bow belongs in the bow hand, not the string hand.
   */
  grip?: WeaponGrip,
): void {
  void model;
  const socket = SOCKETS[socketKey ?? slot];
  if (!socket) return;
  const g = grip && grip !== 'none' ? GRIPS[grip] : null;
  // The off hand is the mirror of the main hand, so the same grip reads there
  // by flipping the two rotations that lean the weapon sideways.
  const offHand = slot === 'offHand';
  const bone = bones[g?.bone ?? socket.bone];
  if (!bone) return;

  clearSocket(bones, slot);

  mesh.userData.socketSlot = slot;
  mesh.position.set(...(g?.pos ?? socket.pos));
  const rot = g?.rot ?? socket.rot;
  mesh.rotation.set(rot[0], offHand && g ? -rot[1] : rot[1], offHand && g ? -rot[2] : rot[2]);
  if (socket.scale) mesh.scale.setScalar(socket.scale);
  mesh.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  bone.add(mesh);

  // Paired slots put a mirrored copy on the opposite limb.
  if (socket.mirror && bones[socket.mirror]) {
    const twin = mesh.clone(true);
    twin.userData.socketSlot = slot;
    twin.userData.socketMirror = true;
    twin.position.set(-socket.pos[0], socket.pos[1], socket.pos[2]);
    twin.rotation.set(socket.rot[0], -socket.rot[1], -socket.rot[2]);
    twin.scale.set(-mesh.scale.x, mesh.scale.y, mesh.scale.z);
    bones[socket.mirror].add(twin);
  }
}

/** Where a socket lives, for FX that need a muzzle/hand position. */
export function socketBone(slot: EquipSlot): string | null {
  return SOCKETS[slot]?.bone ?? null;
}
