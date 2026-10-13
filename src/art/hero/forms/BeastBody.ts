/**
 * SLAY — the Shapeshifter's three beast bodies, as distance fields.
 *
 * Each form is a were-creature on two legs, grown on the hero's own joints so
 * it skins to the same skeleton and the same animator drives it:
 *
 *  - cat:  a black panther-man. Lean, long in the arm, a round skull with a
 *          short muzzle, tall ears, a long thin tail.
 *  - wolf: a grey wolf-man. Deep chest, a ruff of mane round the neck and
 *          down the chest, a long muzzle, pointed ears, a bushy tail.
 *  - bear: a brown bear-man. Huge shoulders and a hump, a belly, columns for
 *          legs, a broad head with small round ears, a stub of a tail.
 *
 * Everything is in heads (`h = height / 7.5`), character space, bind pose.
 * Claws and fangs are separate crisp meshes (a field fine enough for a claw
 * tip would cost the whole body seconds); the tail has its own little chain
 * of bones under the pelvis (see `FormBody.ts`).
 *
 * The pelt is painted into vertex colours: a cat's rosettes, a wolf's dark
 * saddle and pale belly, a bear's dark legs and light muzzle, over the
 * field's own ambient occlusion. The fur material adds the strands.
 */
import * as THREE from 'three';
import { FieldBuilder, alongY, rot, type Field } from '../Sdf';
import { G, GROUP_COUNT, bodyField, type BodyField, type Chain } from '../Anatomy';
import { headUnit, heroJoints, hipHalf, shoulderHalf, type BodyShape, type HeroBone, type JointMap } from '../Rig';
import { meshPart } from '../Body';
import { rampInflate, type Clip, type Inflate } from '../Mesher';
import { heroBoneIndex } from '../Skinning';
import { meshCached } from '../MeshCache';

export type BeastForm = 'cat' | 'wolf' | 'bear';
export const BEAST_FORMS: readonly BeastForm[] = ['cat', 'wolf', 'bear'];

/** How each form is built. */
interface Build {
  /** Trunk width and depth. */
  mass: number;
  /** Limb radius. */
  limb: number;
  /** The hump over the shoulders. */
  hump: number;
  /** Mane round the neck and down the chest. */
  ruff: number;
  /** Belly forward of the abdomen. */
  belly: number;
  /** Claw length, heads. */
  claw: number;
  /** Paw size. */
  paw: number;
  /** How far the body is scaled up in play (the root scale). */
  scale: number;
}

export const BEAST_BUILD: Readonly<Record<BeastForm, Build>> = {
  cat: { mass: 0.98, limb: 1.05, hump: 0.25, ruff: 0.15, belly: 0, claw: 0.22, paw: 1.05, scale: 1.04 },
  wolf: { mass: 1.1, limb: 1.14, hump: 0.45, ruff: 1, belly: 0, claw: 0.17, paw: 1.12, scale: 1.1 },
  bear: { mass: 1.42, limb: 1.5, hump: 1, ruff: 0.45, belly: 1, claw: 0.25, paw: 1.4, scale: 1.24 },
};

/** Eye colour (iris) and glow per form. */
export const BEAST_EYES: Readonly<Record<BeastForm, { iris: number; glow: number }>> = {
  cat: { iris: 0xc8d23a, glow: 0x6a7a10 },
  wolf: { iris: 0xe8a428, glow: 0x7a4a08 },
  bear: { iris: 0x8a4a16, glow: 0x3a1806 },
};

export interface BeastMesh {
  form: BeastForm;
  /** The pelt: one skinned geometry with vertex colours, bind pose = the rig's. */
  skin: THREE.BufferGeometry;
  /** Claws and fangs: rigid per bone, vertex colours dark root to pale tip. */
  horn: THREE.BufferGeometry;
  eyes: { L: THREE.Vector3; R: THREE.Vector3; r: number };
  /** Where the tail leaves the body, character space. */
  tailRoot: THREE.Vector3;
  h: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

interface BeastField {
  field: Field;
  chains: Chain[];
  eyes: { L: THREE.Vector3; R: THREE.Vector3; r: number };
  /** Claw and fang roots: base, direction, bend axis, length, radius, bone. */
  horns: Horn[];
  tailRoot: THREE.Vector3;
  neckCut: number;
  wrist: Array<{ at: THREE.Vector3; dir: THREE.Vector3 }>;
}

interface Horn {
  base: THREE.Vector3;
  dir: THREE.Vector3;
  /** The claw curls about this axis (toward the palm or the ground). */
  bend: THREE.Vector3;
  len: number;
  r: number;
  bone: HeroBone;
  /** Total curl, radians. */
  curl: number;
}

function beastField(form: BeastForm, shape: BodyShape, j: JointMap): BeastField {
  const h = headUnit(shape);
  const B = BEAST_BUILD[form];
  const sw = shoulderHalf(shape) * (form === 'bear' ? 1.12 : 1);
  const hw = hipHalf(shape);
  const F = new FieldBuilder();
  const H = (x: number, y: number, z: number) => V(x * h, y * h, z * h);
  const m = B.mass;
  const horns: Horn[] = [];

  // ------------------------------------------------------------------ trunk
  F.group = G.torso;
  const ribW = 0.62 * m * h + (sw - 0.7 * h) * 0.3;
  const depth = 0.44 * m * h;
  const waistW = (form === 'cat' ? 0.44 : 0.5) * m * h;
  const pelW = hw + 0.22 * h * m;
  F.ellipsoid(H(0, 5.28, -0.02), V(ribW, 0.8 * h, depth * 1.05), 0, rot(-0.08));
  F.ellipsoid(H(0, 5.76, -0.05), V(ribW * 1.08, 0.48 * h, depth), 0.18 * h);
  F.ellipsoid(H(0, 4.62, 0.02), V(waistW, 0.64 * h, depth * 0.86), 0.18 * h);
  F.ellipsoid(H(0, 4.0, -0.02), V(pelW, 0.5 * h, depth * 0.95), 0.2 * h);
  if (B.belly > 0) F.ellipsoid(H(0, 4.5, 0.16), V(waistW * 1.05, 0.6 * h, 0.4 * h * B.belly), 0.2 * h);
  // Glutes and the root of the tail.
  for (const s of [1, -1]) F.ellipsoid(H(s * 0.2, 3.88, -0.13), V(0.21 * h * m, 0.3 * h, 0.18 * h * m), 0.14 * h);
  // Pectorals: slabs of muscle under the fur.
  for (const s of [1, -1]) {
    F.box(H(s * 0.26, 5.62, 0.2 + 0.04 * m), V(0.26 * h * m, 0.19 * h, 0.11 * h), 0.09 * h, 0.15 * h, rot(0.12, s * 0.22, s * -0.2));
  }
  // Lats flare under the arms: the V of a back built for pulling things down.
  for (const s of [1, -1]) F.ellipsoid(H(s * 0.38 * m, 5.45, -0.14), V(0.3 * h, 0.56 * h, 0.28 * h), 0.13 * h, rot(0, 0, s * 0.2));
  // Trapezius sweeping up to the skull: no neck to speak of on a beast.
  for (const s of [1, -1]) F.cone(H(s * 0.06, 6.42, -0.14), V(s * sw * 0.9, 6.06 * h, -0.08 * h), 0.24 * h * m, 0.13 * h, 0.16 * h);
  // The hump over the shoulders.
  F.ellipsoid(H(0, 5.95, -0.3), V((0.32 + 0.22 * B.hump) * h * m, (0.42 + 0.14 * B.hump) * h, (0.18 + 0.2 * B.hump) * h), 0.22 * h);
  // Chest ruff: the wolf's mane runs down the breastbone.
  if (B.ruff > 0.3) {
    F.ellipsoid(H(0, 5.95, 0.3), V(0.34 * h * B.ruff, 0.5 * h, 0.16 * h * B.ruff), 0.14 * h);
    F.ellipsoid(H(0, 5.5, 0.34), V(0.22 * h * B.ruff, 0.42 * h, 0.12 * h * B.ruff), 0.12 * h);
  }
  // Ribs under the skin on the lean cat.
  if (form === 'cat') {
    for (let i = 0; i < 3; i++) {
      F.ellipsoid(H(0, 5.0 - i * 0.2, 0.06), V(ribW * 1.0, 0.03 * h, depth * 1.05), 0.04 * h, rot(-0.25), { sub: true });
    }
  }

  // ------------------------------------------------------------------ neck and head
  F.group = G.head;
  const neckR = 0.36 * h * m;
  F.cone(H(0, 6.0, -0.12), H(0, 6.86, 0.0), neckR, neckR * 0.78, 0.14 * h);
  // The mane: thick behind and round the sides of the neck.
  const ruffK = 0.45 + 0.55 * B.ruff;
  F.ellipsoid(H(0, 6.4, -0.22), V(0.42 * h * ruffK, 0.48 * h, 0.32 * h * ruffK), 0.16 * h);
  for (const s of [1, -1]) F.ellipsoid(H(s * 0.3, 6.45, -0.02), V(0.2 * h * ruffK, 0.36 * h, 0.24 * h * ruffK), 0.14 * h);
  const eyes = beastHead(F, form, h, horns);

  // ------------------------------------------------------------------ arms and paws
  const wrist: BeastField['wrist'] = [];
  for (const side of [1, -1] as const) {
    const L = side > 0;
    const S = j[L ? 'upperArmL' : 'upperArmR'];
    const E = j[L ? 'foreArmL' : 'foreArmR'];
    const Wr = j[L ? 'handL' : 'handR'];
    const K = j[L ? 'fingersL' : 'fingersR'];
    const upDir = E.clone().sub(S).normalize();
    const foDir = Wr.clone().sub(E).normalize();
    const fwd = V(0, 0, 1).sub(upDir.clone().multiplyScalar(upDir.z)).normalize();
    const out = new THREE.Vector3().crossVectors(fwd, upDir).multiplyScalar(-side).normalize();
    F.group = L ? G.armL : G.armR;
    const ua = 0.2 * h * B.limb;
    const fa = 0.17 * h * B.limb;
    F.cone(S, E, ua, 0.14 * h * B.limb, 0.07 * h, { blendAt: S, blendR: 0.5 * h });
    F.cone(E, Wr, fa, 0.11 * h * B.limb, 0.07 * h);
    // A shoulder like a boulder.
    const delt = S.clone().addScaledVector(upDir, 0.2 * h).addScaledVector(out, 0.07 * h);
    F.ellipsoid(delt, V(0.27 * h * B.limb, 0.38 * h, 0.26 * h * B.limb), 0.11 * h, alongY(upDir), { blendAt: S, blendR: 0.75 * h });
    const mid = S.clone().lerp(E, 0.5);
    F.ellipsoid(mid.clone().addScaledVector(fwd, 0.07 * h), V(ua * 0.9, 0.42 * h, ua * 0.84), 0.09 * h, alongY(upDir));
    F.ellipsoid(S.clone().lerp(E, 0.4).addScaledVector(fwd, -0.07 * h), V(ua * 0.92, 0.46 * h, ua * 0.86), 0.09 * h, alongY(upDir));
    // Forearm: a heavy belly near the elbow, then a fringe of fur trailing behind.
    F.ellipsoid(E.clone().lerp(Wr, 0.3).addScaledVector(out, 0.02 * h), V(fa * 1.2, 0.4 * h, fa * 1.0), 0.09 * h, alongY(foDir));
    F.ellipsoid(E.clone().lerp(Wr, 0.45).addScaledVector(fwd, -0.12 * h), V(fa * 0.7, 0.42 * h, fa * 0.85), 0.1 * h, alongY(foDir));
    // Elbow tuft, swept back.
    F.cone(E.clone().addScaledVector(fwd, -0.05 * h), E.clone().addScaledVector(fwd, -0.3 * h).addScaledVector(upDir, 0.12 * h), 0.1 * h * B.limb, 0.03 * h, 0.06 * h);

    // Paw: a broad palm, four thick fingers, claws, and a dew claw for a thumb.
    const along = K.clone().sub(Wr).normalize();
    const palmN = V(0, -1, 0).sub(along.clone().multiplyScalar(-along.y)).normalize();
    const thumbDir = new THREE.Vector3().crossVectors(along, palmN).multiplyScalar(-side).normalize();
    const basis = new THREE.Matrix4().makeBasis(thumbDir, along, new THREE.Vector3().crossVectors(thumbDir, along));
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    const palmLen = Wr.distanceTo(K);
    const P = B.paw;
    F.group = L ? G.handL : G.handR;
    F.box(Wr.clone().addScaledVector(along, palmLen * 0.55), V(0.21 * h * P, palmLen * 0.55, 0.085 * h * P), 0.06 * h, 0.06 * h, q);
    F.ellipsoid(Wr.clone().addScaledVector(along, 0.12 * h).addScaledVector(palmN, 0.04 * h), V(0.15 * h * P, 0.12 * h, 0.08 * h), 0.05 * h, q);
    // Wrist fur blends the paw into the arm.
    F.ellipsoid(Wr.clone().addScaledVector(along, -0.05 * h), V(0.16 * h * P, 0.16 * h, 0.13 * h * P), 0.08 * h, q);
    F.group = L ? G.fingersL : G.fingersR;
    const fingers = [0.15, 0.05, -0.05, -0.15];
    for (const off of fingers) {
      const base = K.clone().addScaledVector(thumbDir, off * h * P).addScaledVector(palmN, 0.01 * h);
      const d1 = along.clone().applyAxisAngle(thumbDir, side * -0.32).normalize();
      const k1 = base.clone().addScaledVector(d1, 0.2 * h);
      const d2 = along.clone().applyAxisAngle(thumbDir, side * -0.8).normalize();
      const k2 = k1.clone().addScaledVector(d2, 0.15 * h);
      const r = 0.055 * h * P;
      F.cone(base, k1, r * 1.05, r * 0.92, 0.02 * h);
      F.cone(k1, k2, r * 0.9, r * 0.75, 0.02 * h);
      horns.push({
        base: k2.clone().addScaledVector(d2, -0.02 * h),
        dir: along.clone().applyAxisAngle(thumbDir, side * -0.55).normalize(),
        bend: thumbDir.clone().multiplyScalar(side),
        len: B.claw * h,
        r: 0.034 * h * P,
        bone: L ? 'fingerTipsL' : 'fingerTipsR',
        curl: 1.1,
      });
    }
    F.group = L ? G.thumbL : G.thumbR;
    const T = j[L ? 'thumbL' : 'thumbR'];
    const td = along.clone().multiplyScalar(0.4).addScaledVector(thumbDir, 0.8).addScaledVector(palmN, 0.3).normalize();
    const t1 = T.clone().addScaledVector(td, 0.14 * h);
    F.cone(T, t1, 0.07 * h * P, 0.05 * h * P, 0.04 * h);
    horns.push({ base: t1, dir: td.clone(), bend: thumbDir.clone().multiplyScalar(side), len: B.claw * h * 0.55, r: 0.026 * h * P, bone: L ? 'thumbL' : 'thumbR', curl: 0.9 });
    wrist.push({ at: Wr.clone(), dir: Wr.clone().sub(E).normalize() });
  }

  // ------------------------------------------------------------------ legs and hind paws
  for (const side of [1, -1] as const) {
    const L = side > 0;
    const Hp = j[L ? 'thighL' : 'thighR'];
    const Kn = j[L ? 'shinL' : 'shinR'];
    const An = j[L ? 'footL' : 'footR'];
    const To = j[L ? 'toeL' : 'toeR'];
    F.group = L ? G.legL : G.legR;
    const th = 0.32 * h * m * B.limb * (form === 'bear' ? 0.9 : 1);
    const thighDir = Kn.clone().sub(Hp).normalize();
    F.cone(Hp.clone().add(H(side * 0.02, 0.1, 0)), Kn, th, 0.19 * h * B.limb, 0.13 * h, { blendAt: Hp, blendR: 0.8 * h });
    F.ellipsoid(Hp.clone().lerp(Kn, 0.45).add(H(0, 0, 0.11)), V(th * 0.85, 0.66 * h, th * 0.76), 0.12 * h, alongY(thighDir));
    F.ellipsoid(Hp.clone().lerp(Kn, 0.4).add(H(0, 0, -0.1)), V(th * 0.84, 0.64 * h, th * 0.74), 0.12 * h, alongY(thighDir));
    // A haunch: the big hind muscle a leaper pushes off.
    F.ellipsoid(Hp.clone().lerp(Kn, 0.25).add(H(side * 0.1, 0, -0.06)), V(th * 0.8, 0.56 * h, th * 0.8), 0.13 * h, alongY(thighDir));
    F.ellipsoid(Kn.clone().add(H(0, 0.02, 0.12)), V(0.12 * h, 0.13 * h, 0.08 * h), 0.07 * h);
    const sd = An.clone().sub(Kn).normalize();
    // Cat and wolf: a calf that rides high and a lean shin, so the leg reads
    // as a hind leg. Bear: a column all the way down.
    const calfAt = form === 'bear' ? 0.4 : 0.22;
    const shinR = form === 'bear' ? 0.2 : 0.15;
    F.cone(Kn, An, shinR * h * B.limb, (form === 'bear' ? 0.15 : 0.085) * h * B.limb, 0.08 * h);
    F.ellipsoid(Kn.clone().lerp(An, calfAt).add(H(0, 0, -0.09)), V(0.2 * h * B.limb, 0.44 * h, 0.2 * h * B.limb), 0.1 * h, alongY(sd));
    // The hock: the heel of a hind leg, standing proud behind the ankle.
    if (form !== 'bear') F.cone(An.clone().add(H(0, 0.4, -0.08)), An.clone().add(H(0, 0.05, -0.26)), 0.1 * h, 0.07 * h, 0.06 * h);
    F.group = L ? G.footL : G.footR;
    const fdir = To.clone().sub(An).setY(0).normalize();
    const fq = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), fdir);
    const P = B.paw;
    // A long hind paw: heel pad, arch, then four toes splayed round the front.
    F.ellipsoid(V(An.x, 0.13 * h, An.z - 0.18 * h), V(0.13 * h * P, 0.13 * h, 0.16 * h), 0.04 * h);
    F.box(An.clone().lerp(To, 0.5).setY(0.15 * h), V(0.17 * h * P, 0.12 * h, 0.44 * h), 0.09 * h, 0.12 * h, fq.clone().multiply(rot(0.15)));
    F.ellipsoid(An.clone().add(H(0, -0.04, 0.05)), V(0.15 * h * P, 0.16 * h, 0.17 * h), 0.09 * h);
    for (const [i, off] of [-0.15, -0.05, 0.05, 0.15].entries()) {
      const tip = To.clone()
        .addScaledVector(fdir, (0.14 + (i === 1 || i === 2 ? 0.04 : 0)) * h)
        .add(new THREE.Vector3(fdir.z, 0, -fdir.x).multiplyScalar(off * h * P * 1.1));
      F.ellipsoid(tip.clone().setY(0.075 * h), V(0.068 * h * P, 0.07 * h, 0.1 * h), 0.04 * h, fq);
      horns.push({
        base: tip.clone().addScaledVector(fdir, 0.07 * h).setY(0.08 * h),
        dir: fdir.clone().add(V(0, -0.35, 0)).normalize(),
        bend: new THREE.Vector3(fdir.z, 0, -fdir.x).multiplyScalar(side * -1),
        len: B.claw * h * 0.55,
        r: 0.026 * h * P,
        bone: L ? 'toeL' : 'toeR',
        curl: 0.8,
      });
    }
    // The flat sole, as on the man.
    F.box(V(An.x, -0.3 * h, An.z + 0.1 * h), V(0.6 * h, 0.3 * h, 1.0 * h), 0, 0.02 * h, undefined, { sub: true });
  }

  const chains = bodyField(shape, j, {}).chains;
  return {
    field: F.build(),
    chains,
    eyes,
    horns,
    tailRoot: H(0, 3.95, -0.38 * m),
    neckCut: 6.42 * h,
    wrist,
  };
}

/** The head of each form, onto the head group. Returns the eye sockets' centres. */
function beastHead(F: FieldBuilder, form: BeastForm, h: number, horns: Horn[]): BeastField['eyes'] {
  const H = (x: number, y: number, z: number) => V(x * h, y * h, z * h);
  const fang = (x: number, y: number, z: number, len: number) => {
    for (const s of [1, -1]) {
      horns.push({ base: H(s * x, y, z), dir: V(0, -1, 0.12).normalize(), bend: V(1, 0, 0), len: len * h, r: 0.028 * h, bone: 'head', curl: 0.35 });
    }
  };
  if (form === 'cat') {
    F.ellipsoid(H(0, 7.02, -0.02), V(0.4 * h, 0.4 * h, 0.46 * h), 0.12 * h);
    F.ellipsoid(H(0, 7.12, 0.2), V(0.3 * h, 0.2 * h, 0.3 * h), 0.1 * h);
    for (const s of [1, -1]) F.ellipsoid(H(s * 0.25, 6.86, 0.16), V(0.18 * h, 0.17 * h, 0.2 * h), 0.1 * h);
    F.ellipsoid(H(0, 6.8, 0.4), V(0.2 * h, 0.15 * h, 0.18 * h), 0.1 * h);
    for (const s of [1, -1]) F.ellipsoid(H(s * 0.085, 6.76, 0.5), V(0.1 * h, 0.08 * h, 0.08 * h), 0.04 * h);
    F.cone(H(0, 7.05, 0.36), H(0, 6.9, 0.55), 0.075 * h, 0.06 * h, 0.06 * h);
    F.ellipsoid(H(0, 6.88, 0.56), V(0.075 * h, 0.05 * h, 0.05 * h), 0.03 * h);
    F.ellipsoid(H(0, 6.63, 0.3), V(0.15 * h, 0.1 * h, 0.17 * h), 0.08 * h);
    for (const s of [1, -1]) {
      F.cone(H(s * 0.22, 7.26, -0.02), H(s * 0.31, 7.64, -0.07), 0.14 * h, 0.03 * h, 0.06 * h);
      F.cone(H(s * 0.22, 7.32, 0.06), H(s * 0.3, 7.58, 0.02), 0.085 * h, 0.012 * h, 0.03 * h, { sub: true });
      F.ellipsoid(H(s * 0.15, 6.98, 0.4), V(0.08 * h, 0.06 * h, 0.07 * h), 0.03 * h, undefined, { sub: true });
    }
    fang(0.07, 6.72, 0.5, 0.11);
    return { L: H(0.15, 6.98, 0.38), R: H(-0.15, 6.98, 0.38), r: 0.055 * h };
  }
  if (form === 'wolf') {
    F.ellipsoid(H(0, 7.0, -0.04), V(0.36 * h, 0.37 * h, 0.42 * h), 0.12 * h);
    F.cone(H(0, 6.88, 0.25), H(0, 6.79, 0.92), 0.2 * h, 0.11 * h, 0.12 * h);
    F.cone(H(0, 7.06, 0.24), H(0, 6.9, 0.9), 0.12 * h, 0.075 * h, 0.08 * h);
    F.ellipsoid(H(0, 6.87, 0.98), V(0.08 * h, 0.065 * h, 0.06 * h), 0.03 * h);
    F.cone(H(0, 6.66, 0.2), H(0, 6.69, 0.82), 0.13 * h, 0.065 * h, 0.06 * h);
    for (const s of [1, -1]) {
      F.ellipsoid(H(s * 0.3, 6.78, 0.0), V(0.22 * h, 0.27 * h, 0.24 * h), 0.12 * h);
      F.cone(H(s * 0.2, 7.26, -0.1), H(s * 0.27, 7.76, -0.17), 0.15 * h, 0.02 * h, 0.06 * h);
      F.cone(H(s * 0.2, 7.32, -0.03), H(s * 0.26, 7.68, -0.1), 0.09 * h, 0.01 * h, 0.03 * h, { sub: true });
      F.ellipsoid(H(s * 0.15, 6.99, 0.34), V(0.075 * h, 0.055 * h, 0.07 * h), 0.03 * h, undefined, { sub: true });
    }
    fang(0.07, 6.74, 0.86, 0.12);
    return { L: H(0.15, 6.99, 0.32), R: H(-0.15, 6.99, 0.32), r: 0.05 * h };
  }
  F.ellipsoid(H(0, 7.0, 0.0), V(0.48 * h, 0.42 * h, 0.48 * h), 0.12 * h);
  F.ellipsoid(H(0, 7.12, 0.25), V(0.36 * h, 0.22 * h, 0.3 * h), 0.1 * h);
  F.cone(H(0, 6.82, 0.35), H(0, 6.77, 0.8), 0.24 * h, 0.17 * h, 0.1 * h);
  F.ellipsoid(H(0, 6.87, 0.87), V(0.11 * h, 0.08 * h, 0.06 * h), 0.03 * h);
  F.cone(H(0, 6.62, 0.25), H(0, 6.64, 0.7), 0.16 * h, 0.11 * h, 0.06 * h);
  for (const s of [1, -1]) {
    F.ellipsoid(H(s * 0.3, 6.85, 0.1), V(0.26 * h, 0.26 * h, 0.26 * h), 0.12 * h);
    F.ellipsoid(H(s * 0.37, 7.33, -0.06), V(0.13 * h, 0.13 * h, 0.075 * h), 0.05 * h);
    F.ellipsoid(H(s * 0.37, 7.33, 0.0), V(0.08 * h, 0.08 * h, 0.05 * h), 0.02 * h, undefined, { sub: true });
    F.ellipsoid(H(s * 0.19, 7.0, 0.44), V(0.065 * h, 0.05 * h, 0.06 * h), 0.03 * h, undefined, { sub: true });
  }
  fang(0.11, 6.7, 0.78, 0.1);
  return { L: H(0.19, 7.0, 0.42), R: H(-0.19, 7.0, 0.42), r: 0.045 * h };
}

// ---------------------------------------------------------------------------
// Claws and fangs
// ---------------------------------------------------------------------------

/** A curved horn: rings along an arc, tapering to a point. */
function hornGeo(c: Horn, rings = 6, sides = 6): { pos: number[]; nor: number[]; t: number[]; idx: number[] } {
  const pos: number[] = [];
  const nor: number[] = [];
  const t: number[] = [];
  const idx: number[] = [];
  const dir = c.dir.clone().normalize();
  const bend = c.bend.clone().sub(dir.clone().multiplyScalar(c.bend.dot(dir))).normalize();
  const side = new THREE.Vector3().crossVectors(dir, bend).normalize();
  // Bending about `bend` curls the tip toward `side`'s cross: away from the back of the claw.
  const p = c.base.clone();
  const d = dir.clone();
  const step = c.len / rings;
  const spine: Array<{ p: THREE.Vector3; d: THREE.Vector3 }> = [];
  for (let i = 0; i <= rings; i++) {
    spine.push({ p: p.clone(), d: d.clone() });
    p.addScaledVector(d, step);
    d.applyAxisAngle(bend, c.curl / rings).normalize();
  }
  for (let i = 0; i <= rings; i++) {
    const s = spine[i]!;
    const u = i / rings;
    // Flattened sideways, like a real claw; a tip that is a point.
    const r = c.r * (1 - u) ** 0.8;
    const a1 = new THREE.Vector3().crossVectors(s.d, bend).normalize();
    const a2 = new THREE.Vector3().crossVectors(a1, s.d).normalize();
    for (let k = 0; k < sides; k++) {
      const ang = (k / sides) * Math.PI * 2;
      const n = a1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(a2, Math.sin(ang) * 0.62);
      const q = s.p.clone().addScaledVector(n, r);
      pos.push(q.x, q.y, q.z);
      n.normalize();
      nor.push(n.x, n.y, n.z);
      t.push(u);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k;
      const b = i * sides + ((k + 1) % sides);
      const c2 = a + sides;
      const d2 = b + sides;
      idx.push(a, c2, b, b, c2, d2);
    }
  }
  void side;
  return { pos, nor, t, idx };
}

/** Every claw and fang as one geometry: rigid to its bone, dark at the root, pale at the tip. */
function hornMesh(horns: Horn[], form: BeastForm): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  const idx: number[] = [];
  const root = form === 'bear' ? [0.1, 0.08, 0.07] : [0.06, 0.055, 0.05];
  const tip = form === 'cat' ? [0.86, 0.84, 0.78] : [0.78, 0.74, 0.66];
  for (const c of horns) {
    const g = hornGeo(c);
    const o = pos.length / 3;
    const bone = heroBoneIndex(c.bone);
    const fang = c.bone === 'head';
    for (let i = 0; i < g.t.length; i++) {
      const u = fang ? 1 : g.t[i]!;
      const k = Math.min(1, u * 1.4);
      col.push(root[0]! + (tip[0]! - root[0]!) * k, root[1]! + (tip[1]! - root[1]!) * k, root[2]! + (tip[2]! - root[2]!) * k);
      si.push(bone, 0, 0, 0);
      sw.push(1, 0, 0, 0);
    }
    pos.push(...g.pos);
    nor.push(...g.nor);
    for (const i of g.idx) idx.push(i + o);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------------------
// Pelt
// ---------------------------------------------------------------------------

function hash3(x: number, y: number, z: number): number {
  let n = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return ((n >>> 0) % 10000) / 10000;
}

/** Smooth value noise, 0..1. Deterministic: a pelt is the same every time. */
export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(fx);
  const v = s(fy);
  const w = s(fz);
  let out = 0;
  for (let dz = 0; dz < 2; dz++) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const k = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
        out += k * hash3(xi + dx, yi + dy, zi + dz);
      }
    }
  }
  return out;
}

type RGB = [number, number, number];
const mixc = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const band = (v: number, a: number, b: number) => Math.max(0, Math.min(1, (v - a) / (b - a)));

/**
 * The pelt's colour at a point (heads), before occlusion. `paw` is 0..1 near
 * a hand. `pad` is the paw's underside.
 */
export function peltColour(form: BeastForm, X: number, Y: number, Z: number, paw: number, pad: number): RGB {
  const grain = noise3(X * 7, Y * 7, Z * 7);
  if (form === 'cat') {
    // Black on black: rosettes show only where the light catches them.
    let c: RGB = [0.075, 0.072, 0.085];
    const ro = noise3(X * 3.4 + 7, Y * 3.4, Z * 3.4);
    const ring = 1 - Math.min(1, Math.abs(ro - 0.55) * 9);
    c = mixc(c, [0.035, 0.032, 0.04], ring * 0.85);
    c = mixc(c, [0.12, 0.11, 0.12], band(grain, 0.6, 1) * 0.5);
    // Chin and the whisker pads a shade lighter.
    if (Y > 6.5 && Y < 6.85 && Z > 0.3) c = mixc(c, [0.16, 0.15, 0.16], band(Z, 0.3, 0.5));
    if (Y > 6.8 && Y < 6.95 && Z > 0.5) c = [0.03, 0.025, 0.03];
    c = mixc(c, [0.05, 0.045, 0.05], pad);
    return c;
  }
  if (form === 'wolf') {
    let c: RGB = [0.44, 0.42, 0.39];
    // The saddle: dark down the back and the top of the head.
    const back = band(-Z, 0.05, 0.35) * band(Y, 4.3, 5.2) * (1 - band(Y, 6.6, 7.3));
    c = mixc(c, [0.19, 0.18, 0.17], back);
    if (Y > 6.9 && Z < 0.2) c = mixc(c, [0.25, 0.24, 0.22], band(Y, 6.9, 7.3));
    // Pale throat, chest, belly and the insides of the legs.
    const front = band(Z, 0.18, 0.4) * band(Y, 3.9, 4.4) * (1 - band(Y, 6.75, 6.95));
    c = mixc(c, [0.76, 0.72, 0.64], front);
    if (Y < 3.8 && Math.abs(X) < 0.32) c = mixc(c, [0.7, 0.66, 0.58], 0.6);
    // Muzzle pale underneath, dark on top, black nose; dark ear tips.
    if (Z > 0.3 && Y < 6.8) c = mixc(c, [0.72, 0.68, 0.6], 0.7);
    if (Z > 0.92) c = [0.04, 0.035, 0.035];
    if (Y > 7.5) c = mixc(c, [0.1, 0.09, 0.09], band(Y, 7.5, 7.7));
    // Darker lower legs.
    c = mixc(c, [0.28, 0.26, 0.24], band(1.2 - Y, 0, 1) * 0.6);
    c = mixc(c, [0.12, 0.11, 0.11], pad);
    return mixc(c, [c[0] * 1.25, c[1] * 1.25, c[2] * 1.25], (grain - 0.5) * 0.6);
  }
  // Bear.
  let c: RGB = [0.27, 0.175, 0.105];
  // Grizzled: lighter tips on the hump and the shoulders.
  const griz = band(Y, 5.4, 6.4) * band(-Z, -0.1, 0.3);
  c = mixc(c, [0.42, 0.31, 0.2], griz * band(grain, 0.35, 0.9));
  // Dark legs and forearms, darker paws.
  c = mixc(c, [0.13, 0.085, 0.055], band(2.6 - Y, 0, 1.2));
  c = mixc(c, [0.1, 0.065, 0.045], paw * 0.8);
  // A pale muzzle and a black nose.
  if (Z > 0.4 && Y > 6.5 && Y < 6.95) c = mixc(c, [0.48, 0.36, 0.24], band(Z, 0.4, 0.6));
  if (Z > 0.82 && Y > 6.78) c = [0.035, 0.03, 0.03];
  c = mixc(c, [0.06, 0.05, 0.045], pad);
  return mixc(c, [c[0] * 1.2, c[1] * 1.15, c[2] * 1.1], (grain - 0.5) * 0.5);
}

function paintPelt(form: BeastForm, bf: BeastField, h: number, geo: THREE.BufferGeometry, joints: JointMap): Float32Array {
  const pos = geo.getAttribute('position').array as Float32Array;
  const nor = geo.getAttribute('normal').array as Float32Array;
  const f = bf.field;
  const out = new Float32Array(pos.length);
  const hands = [joints.fingersL, joints.fingersR];
  for (let t = 0; t < pos.length; t += 3) {
    const x = pos[t]!;
    const y = pos[t + 1]!;
    const z = pos[t + 2]!;
    const nx = nor[t]!;
    const ny = nor[t + 1]!;
    const nz = nor[t + 2]!;
    let occ = 0;
    for (const [d, wgt] of [[0.014, 0.5], [0.035, 0.3], [0.07, 0.2]] as const) {
      const v = f.eval(x + nx * d, y + ny * d, z + nz * d);
      occ += wgt * Math.max(0, Math.min(1, (d - v) / d));
    }
    const ao = 1 - 0.7 * Math.min(1, occ * 1.4);
    let paw = 0;
    for (const k of hands) paw = Math.max(paw, 1 - Math.min(1, k.distanceTo(V(x, y, z)) / (0.6 * h)));
    // Pads: the underside of a paw and the sole of a foot.
    const pad = Math.max(paw > 0.4 && ny < -0.5 ? 1 : 0, y < 0.06 * h && ny < -0.6 ? 1 : 0);
    const c = peltColour(form, x / h, y / h, z / h, paw, pad);
    out[t] = c[0] * ao;
    out[t + 1] = c[1] * ao;
    out[t + 2] = c[2] * ao;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Meshing
// ---------------------------------------------------------------------------

export interface BeastQuality {
  bodyCell: number;
  headCell: number;
  bodyTris: number;
  headTris: number;
}

/** Play quality: a touch coarser than the human body, which is seen closer and longer. */
export const BEAST_QUALITY: BeastQuality = { bodyCell: 0.0105, headCell: 0.0055, bodyTris: 8600, headTris: 3400 };

function concatColoured(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const g of list) {
    nv += g.getAttribute('position').count;
    ni += g.getIndex()!.count;
  }
  const names = ['position', 'normal', 'skinIndex', 'skinWeight'] as const;
  const sizes = { position: 3, normal: 3, skinIndex: 4, skinWeight: 4 };
  const arrays = {
    position: new Float32Array(nv * 3),
    normal: new Float32Array(nv * 3),
    skinIndex: new Uint16Array(nv * 4),
    skinWeight: new Float32Array(nv * 4),
  };
  const idx = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const c = g.getAttribute('position').count;
    for (const n of names) arrays[n].set(g.getAttribute(n).array as never, vo * sizes[n]);
    const ix = g.getIndex()!.array;
    for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i]! + vo;
    vo += c;
    io += ix.length;
  }
  const out = new THREE.BufferGeometry();
  for (const n of names) out.setAttribute(n, new THREE.BufferAttribute(arrays[n], sizes[n]));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

function meshPelt(form: BeastForm, bf: BeastField, h: number, joints: JointMap, q: BeastQuality): THREE.BufferGeometry {
  const anatomy = { field: bf.field, chains: bf.chains } as unknown as BodyField;
  const up = new THREE.Vector3(0, 1, 0);
  // Trunk and limbs below the neck cut; the head finer above it, tucked under
  // and standing a hair proud at the join, the same way the man is meshed.
  const neckIn = rampInflate(up, bf.neckCut - 0.03 * h, 0, -0.005, 0.03 * h);
  const bodyClips: Clip[] = [{ n: up.clone(), d: bf.neckCut }];
  const body = meshPart(bf.field, anatomy, undefined, q.bodyCell, bodyClips, neckIn as Inflate, q.bodyTris);
  const headBox = new THREE.Box3(new THREE.Vector3(-0.9 * h, bf.neckCut - 0.16 * h, -0.9 * h), new THREE.Vector3(0.9 * h, 7.9 * h, 1.15 * h));
  const headField = bf.field.cull(headBox);
  const headInf = rampInflate(up, bf.neckCut - 0.07 * h, -0.006, 0.0008, 0.03 * h);
  const head = meshPart(headField, anatomy, headBox, q.headCell, [{ n: new THREE.Vector3(0, -1, 0), d: -(bf.neckCut - 0.12 * h) }], headInf, q.headTris);
  const skin = concatColoured([body, head]);
  body.dispose();
  head.dispose();
  skin.setAttribute('color', new THREE.BufferAttribute(paintPelt(form, bf, h, skin, joints), 3));
  return skin;
}

const built = new Map<string, BeastMesh>();

/** The beast body for a form on a hero's shape, meshed once and cached (memory and IndexedDB). */
export function meshBeast(form: BeastForm, shape: BodyShape, q: BeastQuality = BEAST_QUALITY): BeastMesh {
  const key = JSON.stringify([form, shape, q]);
  const hit = built.get(key);
  if (hit) return hit;
  const joints = heroJoints(shape);
  const h = headUnit(shape);
  const bf = beastField(form, shape, joints);
  const skin = meshCached(`beast|${form}|${bf.field.hash()}|${JSON.stringify(q)}`, () => meshPelt(form, bf, h, joints, q));
  const out: BeastMesh = { form, skin, horn: hornMesh(bf.horns, form), eyes: bf.eyes, tailRoot: bf.tailRoot, h };
  built.set(key, out);
  return out;
}

/** True when a form's body is already in memory (no meshing cost to show it). */
export function beastReady(form: BeastForm, shape: BodyShape, q: BeastQuality = BEAST_QUALITY): boolean {
  return built.has(JSON.stringify([form, shape, q]));
}

// ---------------------------------------------------------------------------
// Tail
// ---------------------------------------------------------------------------

export const TAIL_BONES = 5;

/** Per form: length (heads), radius profile, droop (radians down from straight back). */
export const TAIL_SHAPE: Readonly<Record<BeastForm, { len: number; r: (u: number) => number; droop: number }>> = {
  // Long and whip thin, a little thicker at the root.
  cat: { len: 3.4, r: (u) => 0.1 * (1 - 0.45 * u) * (u > 0.94 ? (1 - u) / 0.06 : 1), droop: 0.9 },
  // A brush: thin at the root, full in the middle, a soft point.
  wolf: { len: 2.6, r: (u) => (0.08 + 0.17 * Math.sin(Math.PI * Math.min(1, u * 1.1)) ** 0.8) * (u > 0.9 ? (1 - u) / 0.1 : 1), droop: 1.15 },
  // A stub.
  bear: { len: 0.55, r: (u) => 0.13 * (1 - 0.6 * u * u), droop: 0.6 },
};

/**
 * The tail in its own bind space: from the origin straight back along -Z,
 * skinned across `TAIL_BONES` bones spaced evenly along it. Vertex colours
 * from the pelt, with a darker tip on the wolf and a black whip on the cat.
 */
export function tailGeometry(form: BeastForm, h: number): THREE.BufferGeometry {
  const T = TAIL_SHAPE[form];
  const len = T.len * h;
  const rings = form === 'bear' ? 5 : 22;
  const sides = 12;
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const u = i / rings;
    const z = -u * len;
    const r = Math.max(0.002, T.r(u) * h);
    // Bone weights: linear between the two nearest bones.
    const bf = u * (TAIL_BONES - 1);
    const b0 = Math.min(TAIL_BONES - 1, Math.floor(bf));
    const b1 = Math.min(TAIL_BONES - 1, b0 + 1);
    const w1 = bf - b0;
    let c: RGB;
    if (form === 'cat') c = [0.06, 0.058, 0.07];
    else if (form === 'wolf') c = mixc([0.36, 0.34, 0.31], [0.1, 0.09, 0.09], band(u, 0.75, 0.95));
    else c = [0.22, 0.14, 0.085];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      pos.push(nx * r, ny * r, z);
      nor.push(nx, ny, 0);
      // The underside a touch lighter on the wolf.
      const under = form === 'wolf' ? Math.max(0, -ny) * 0.35 : 0;
      col.push(c[0] + under * 0.3, c[1] + under * 0.28, c[2] + under * 0.25);
      si.push(b0, b1, 0, 0);
      sw.push(1 - w1, w1, 0, 0);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k;
      const b = i * sides + ((k + 1) % sides);
      idx.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

void GROUP_COUNT;
