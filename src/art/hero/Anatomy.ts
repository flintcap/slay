/**
 * SLAY — the human body as a distance field.
 *
 * Built in heads (`h = height / 7.5`) on the rig's own joints, so the skin and
 * the skeleton can never disagree. What makes a figure read as a body is its
 * landmarks: a ribcage wider than the waist, a pelvis under it, a shoulder
 * that caps the arm, knees and elbows narrower than the muscle either side,
 * thin wrists and ankles, hands and feet with real length.
 *
 * Groups name the part of the body each primitive belongs to; the skinning
 * reads them (`GROUP_CHAINS`).
 */
import * as THREE from 'three';
import { FieldBuilder, alongY, rot, type Field } from './Sdf';
import { headUnit, hipHalf, shoulderHalf, type BodyShape, type HeroBone, type JointMap } from './Rig';

export const G = {
  torso: 0,
  head: 1,
  armL: 2,
  armR: 3,
  handL: 4,
  handR: 5,
  fingersL: 6,
  fingersR: 7,
  thumbL: 8,
  thumbR: 9,
  legL: 10,
  legR: 11,
  footL: 12,
  footR: 13,
} as const;
export const GROUP_COUNT = 14;

/**
 * Each group's bone chain: the bones in order and the points between them
 * (`points.length = bones.length + 1`), plus how widely each joint between
 * two bones is blended, metres.
 */
export interface Chain {
  bones: HeroBone[];
  points: THREE.Vector3[];
  blend: number[];
}

export interface BodyField {
  field: Field;
  chains: Chain[];
  /** Where the detail meshes overlap the body. */
  neckCut: number;
  wristL: { at: THREE.Vector3; dir: THREE.Vector3 };
  wristR: { at: THREE.Vector3; dir: THREE.Vector3 };
  /** Eye centres and radius, character space. */
  eyes: { L: THREE.Vector3; R: THREE.Vector3; r: number };
  h: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Options that change the body beyond its shape. */
export interface AnatomyOpts {
  /** Skull face: no nose, lipless jaw, sunken eyes. */
  skull?: boolean;
  /** Heavier brow and jaw (0..1). */
  rugged?: number;
}

export function bodyField(shape: BodyShape, j: JointMap, opts: AnatomyOpts = {}): BodyField {
  const h = headUnit(shape);
  const male = shape.sex === 'male';
  const b = shape.build;
  const w = shape.wasted ?? 0;
  const sw = shoulderHalf(shape);
  const hw = hipHalf(shape);
  const F = new FieldBuilder();
  const H = (x: number, y: number, z: number) => V(x * h, y * h, z * h);
  // Muscle and fat: build adds both, wasting takes them away.
  const mass = (1 + 0.22 * (b - 0.5)) * (1 - 0.32 * w);
  const muscle = Math.max(0, 0.6 + 0.6 * b - 0.9 * w);

  // ------------------------------------------------------------------ torso
  F.group = G.torso;
  const ribW = (male ? 0.6 : 0.52) * mass * h + (sw - 0.7 * h) * 0.3;
  const waistW = (male ? 0.5 : 0.45) * mass * h;
  const pelW = hw + (male ? 0.27 : 0.27) * h * mass;
  const depth = (male ? 0.4 : 0.37) * mass * h;
  // Ribcage: the widest mass of the trunk, tipped back a touch.
  F.ellipsoid(H(0, 5.28, -0.02), V(ribW * 0.96, 0.74 * h, depth * 1.02), 0, rot(-0.08));
  // Upper chest: the trunk is widest at the armpits, not at the ribs' middle.
  F.ellipsoid(H(0, 5.74, -0.04), V(ribW * 1.04, 0.44 * h, depth * 0.98), 0.16 * h);
  // Abdomen and waist.
  F.ellipsoid(H(0, 4.62, 0.05 - 0.06 * w), V(waistW, 0.62 * h, depth * (0.92 - 0.25 * w)), 0.16 * h);
  // Pelvis.
  F.ellipsoid(H(0, 4.0, -0.02), V(pelW, 0.48 * h, depth * 0.95), 0.18 * h);
  // Lower belly over the pelvis, the front curve under the navel.
  F.ellipsoid(H(0, 4.12, 0.12), V(waistW * 0.82, 0.36 * h, depth * 0.62), 0.12 * h);
  // Glutes.
  for (const s of [1, -1]) F.ellipsoid(H(s * 0.22 * (hw / (0.36 * h)), 3.84, -0.16), V(0.27 * h * mass, 0.34 * h, 0.24 * h * mass), 0.16 * h);
  // Chest: pectorals on a man, breasts on a woman.
  if (male) {
    for (const s of [1, -1]) {
      F.box(H(s * 0.25, 5.62, 0.16 + 0.03 * muscle), V(0.24 * h, 0.17 * h, (0.08 + 0.04 * muscle) * h), 0.08 * h, 0.14 * h, rot(0.12, s * 0.22, s * -0.2));
    }
  } else {
    for (const s of [1, -1]) {
      F.ellipsoid(H(s * 0.22, 5.62, 0.2), V(0.24 * h, 0.17 * h, 0.12 * h), 0.12 * h, rot(0, 0, s * -0.2));
      F.ellipsoid(H(s * 0.22, 5.44, 0.3), V(0.18 * h, 0.17 * h, 0.15 * h), 0.08 * h, rot(0.3, s * 0.25, 0));
    }
  }
  // Lats: the V of a back, wider under the arms.
  for (const s of [1, -1]) {
    F.ellipsoid(H(s * 0.34 * mass, 5.45, -0.12), V((0.2 + 0.1 * muscle) * h, 0.52 * h, 0.26 * h), 0.12 * h, rot(0, 0, s * 0.18));
  }
  // Trapezius: from the neck out to the shoulder, the slope that stops the head floating.
  for (const s of [1, -1]) {
    const tip = V(s * sw * 0.86, 6.06 * h, -0.08 * h);
    F.cone(H(s * 0.05, 6.32, -0.1), tip, (0.16 + 0.06 * muscle) * h, 0.1 * h, 0.14 * h);
  }
  // Collarbones show only on the starved.
  if (w > 0.3) {
    for (const s of [1, -1]) F.cone(H(s * 0.08, 6.08, 0.18), V(s * sw * 0.8, 6.08 * h, 0.04 * h), 0.03 * h, 0.025 * h, 0.08 * h);
  }
  // Spine groove and ribs on the wasted.
  if (w > 0.3) {
    F.ellipsoid(H(0, 4.6, 0.32), V(waistW * 0.7, 0.42 * h, 0.14 * h), 0.12 * h, undefined, { sub: true });
    for (let i = 0; i < 4; i++) {
      const y = 5.0 - i * 0.18;
      F.ellipsoid(H(0, y, 0.04), V(ribW * 0.96, 0.035 * h, depth * 1.02), 0.04 * h, rot(-0.25), { sub: true });
    }
  }

  // ------------------------------------------------------------------ head and neck
  F.group = G.head;
  const neckR = (male ? 0.25 : 0.2) * h * (1 + 0.15 * b) * (1 - 0.25 * w);
  F.cone(H(0, 6.0, -0.08), H(0, 6.85, -0.02), neckR * 1.08, neckR * 0.92, 0.1 * h);
  // Sternocleidomastoid: behind the ear down to the notch of the collarbones.
  for (const s of [1, -1]) F.cone(H(s * 0.26, 6.86, -0.08), H(s * 0.05, 6.14, 0.16), 0.06 * h, 0.05 * h, 0.06 * h);
  headField(F, h, male, b, w, opts);

  // ------------------------------------------------------------------ arms
  const chains: Chain[] = new Array(GROUP_COUNT);
  for (const side of [1, -1] as const) {
    const L = side > 0;
    const S = j[L ? 'upperArmL' : 'upperArmR'];
    const E = j[L ? 'foreArmL' : 'foreArmR'];
    const Wr = j[L ? 'handL' : 'handR'];
    const K = j[L ? 'fingersL' : 'fingersR'];
    const C = j[L ? 'clavL' : 'clavR'];
    const upDir = E.clone().sub(S).normalize();
    const foDir = Wr.clone().sub(E).normalize();
    // Forward of the arm: perpendicular to it, toward +Z.
    const fwd = V(0, 0, 1).sub(upDir.clone().multiplyScalar(upDir.z)).normalize();
    const out = new THREE.Vector3().crossVectors(fwd, upDir).multiplyScalar(-side).normalize();
    F.group = L ? G.armL : G.armR;
    const ua = (0.16 + 0.05 * muscle) * h * (1 - 0.2 * w);
    const fa = (0.135 + 0.035 * muscle) * h * (1 - 0.2 * w);
    // Upper arm and forearm as tapered limbs.
    F.cone(S, E, ua, 0.12 * h, 0.06 * h, { blendAt: S, blendR: 0.45 * h });
    F.cone(E, Wr, fa, 0.085 * h, 0.06 * h);
    // Deltoid: caps the arm, overhangs the joint.
    const delt = S.clone().addScaledVector(upDir, 0.2 * h).addScaledVector(out, 0.06 * h);
    F.ellipsoid(delt, V((0.21 + 0.06 * muscle) * h, 0.34 * h, (0.21 + 0.05 * muscle) * h), 0.1 * h, alongY(upDir), { blendAt: S, blendR: 0.7 * h });
    // Biceps in front, triceps behind.
    const mid = S.clone().lerp(E, 0.52);
    F.ellipsoid(mid.clone().addScaledVector(fwd, 0.07 * h), V(ua * 0.82, 0.38 * h, ua * 0.78), 0.08 * h, alongY(upDir));
    F.ellipsoid(S.clone().lerp(E, 0.4).addScaledVector(fwd, -0.06 * h), V(ua * 0.85, 0.42 * h, ua * 0.8), 0.08 * h, alongY(upDir));
    // Forearm belly near the elbow, the wrist flattened.
    const fb = E.clone().lerp(Wr, 0.28);
    F.ellipsoid(fb.addScaledVector(out, 0.02 * h), V(fa * 1.12, 0.36 * h, fa * 0.92), 0.08 * h, alongY(foDir));
    // Elbow point.
    F.ellipsoid(E.clone().addScaledVector(fwd, -0.06 * h), V(0.07 * h, 0.08 * h, 0.06 * h), 0.05 * h);

    // Hand: a palm with a heel, four fingers and a thumb.
    const along = K.clone().sub(Wr).normalize();
    const palmN = V(0, -1, 0).sub(along.clone().multiplyScalar(-along.y)).normalize();
    const thumbDir = new THREE.Vector3().crossVectors(along, palmN).multiplyScalar(-side).normalize();
    F.group = L ? G.handL : G.handR;
    const basis = new THREE.Matrix4().makeBasis(thumbDir, along, new THREE.Vector3().crossVectors(thumbDir, along));
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);
    const palmLen = Wr.distanceTo(K);
    const palmC = Wr.clone().addScaledVector(along, palmLen * 0.55);
    F.box(palmC, V(0.17 * h, palmLen * 0.5, 0.055 * h), 0.045 * h, 0.04 * h, q);
    // Heel of the palm and the thumb's ball.
    F.ellipsoid(Wr.clone().addScaledVector(along, 0.1 * h).addScaledVector(palmN, 0.03 * h), V(0.13 * h, 0.1 * h, 0.06 * h), 0.04 * h, q);
    F.ellipsoid(Wr.clone().addScaledVector(along, 0.16 * h).addScaledVector(thumbDir, 0.1 * h).addScaledVector(palmN, 0.04 * h), V(0.07 * h, 0.12 * h, 0.06 * h), 0.04 * h, q);
    // Fingers: relaxed, curling a little at each joint.
    F.group = L ? G.fingersL : G.fingersR;
    const fingers = [
      { off: 0.12, len: 1.0 },
      { off: 0.04, len: 1.08 },
      { off: -0.04, len: 1.02 },
      { off: -0.12, len: 0.84 },
    ];
    for (const f of fingers) {
      const base = K.clone().addScaledVector(thumbDir, f.off * h).addScaledVector(palmN, 0.01 * h);
      const d1 = along.clone().applyAxisAngle(thumbDir, side * -0.22).normalize();
      const k1 = base.clone().addScaledVector(d1, 0.2 * h * f.len);
      const d2 = along.clone().applyAxisAngle(thumbDir, side * -0.6).normalize();
      const k2 = k1.clone().addScaledVector(d2, 0.17 * h * f.len);
      const r = 0.038 * h * (1 + 0.15 * b);
      F.cone(base, k1, r * 1.05, r * 0.92, 0.012 * h);
      F.cone(k1, k2, r * 0.9, r * 0.78, 0.012 * h);
    }
    F.group = L ? G.thumbL : G.thumbR;
    const T = j[L ? 'thumbL' : 'thumbR'];
    const td = along.clone().multiplyScalar(0.55).addScaledVector(thumbDir, 0.75).addScaledVector(palmN, 0.2).normalize();
    const t1 = T.clone().addScaledVector(td, 0.17 * h);
    const t2 = t1.clone().addScaledVector(along.clone().multiplyScalar(0.7).addScaledVector(thumbDir, 0.5).normalize(), 0.14 * h);
    F.cone(T, t1, 0.055 * h, 0.045 * h, 0.03 * h);
    F.cone(t1, t2, 0.043 * h, 0.036 * h, 0.012 * h);

    chains[L ? G.armL : G.armR] = {
      bones: L ? ['clavL', 'upperArmL', 'foreArmL'] : ['clavR', 'upperArmR', 'foreArmR'],
      points: [C.clone(), S.clone(), E.clone(), Wr.clone()],
      blend: [0.22 * h, 0.16 * h],
    };
    chains[L ? G.handL : G.handR] = {
      bones: L ? ['foreArmL', 'handL'] : ['foreArmR', 'handR'],
      points: [E.clone(), Wr.clone(), K.clone()],
      blend: [0.08 * h],
    };
    const tipEnd = K.clone().addScaledVector(along, 0.4 * h);
    const M = j[L ? 'fingerTipsL' : 'fingerTipsR'];
    chains[L ? G.fingersL : G.fingersR] = {
      bones: L ? ['handL', 'fingersL', 'fingerTipsL'] : ['handR', 'fingersR', 'fingerTipsR'],
      points: [Wr.clone(), K.clone(), M.clone(), tipEnd],
      blend: [0.035 * h, 0.03 * h],
    };
    chains[L ? G.thumbL : G.thumbR] = {
      bones: L ? ['handL', 'thumbL'] : ['handR', 'thumbR'],
      points: [Wr.clone(), T.clone(), t2.clone()],
      blend: [0.04 * h],
    };
  }

  // ------------------------------------------------------------------ legs
  for (const side of [1, -1] as const) {
    const L = side > 0;
    const Hp = j[L ? 'thighL' : 'thighR'];
    const Kn = j[L ? 'shinL' : 'shinR'];
    const An = j[L ? 'footL' : 'footR'];
    const To = j[L ? 'toeL' : 'toeR'];
    F.group = L ? G.legL : G.legR;
    const th = (male ? 0.32 : 0.33) * h * mass * (1 + 0.1 * muscle);
    const thighDir = Kn.clone().sub(Hp).normalize();
    // The thigh starts high and wide, inside the pelvis.
    const top = Hp.clone().add(H(side * 0.02, 0.1, 0));
    F.cone(top, Kn, th, 0.17 * h, 0.12 * h, { blendAt: Hp, blendR: 0.75 * h });
    // Quadriceps in front, a teardrop over the knee on the inside.
    F.ellipsoid(Hp.clone().lerp(Kn, 0.45).add(H(0, 0, 0.1)), V(th * 0.82, 0.62 * h, th * 0.72), 0.12 * h, alongY(thighDir));
    F.ellipsoid(Hp.clone().lerp(Kn, 0.8).add(H(-side * 0.06, 0, 0.06)), V(0.13 * h, 0.2 * h, 0.12 * h), 0.08 * h, alongY(thighDir));
    // Hamstrings and the outer sweep.
    F.ellipsoid(Hp.clone().lerp(Kn, 0.42).add(H(0, 0, -0.08)), V(th * 0.8, 0.6 * h, th * 0.7), 0.12 * h, alongY(thighDir));
    F.ellipsoid(Hp.clone().lerp(Kn, 0.3).add(H(side * 0.08, 0, 0)), V(th * 0.7, 0.5 * h, th * 0.7), 0.12 * h, alongY(thighDir));
    // Knee cap.
    F.ellipsoid(Kn.clone().add(H(0, 0.02, 0.12)), V(0.1 * h, 0.12 * h, 0.07 * h), 0.06 * h);
    // Shin and calf.
    const sd = An.clone().sub(Kn).normalize();
    const calf = (0.19 + 0.04 * muscle) * h * (1 - 0.25 * w);
    F.cone(Kn, An, 0.17 * h * mass, 0.085 * h, 0.08 * h);
    F.ellipsoid(Kn.clone().lerp(An, 0.3).add(H(side * 0.01, 0, -0.07)), V(calf * 0.95, 0.46 * h, calf * 0.9), 0.1 * h, alongY(sd));
    // Ankle bones.
    for (const s of [1, -1]) F.ellipsoid(An.clone().add(H(s * 0.075, 0.0, 0)), V(0.04 * h, 0.05 * h, 0.04 * h), 0.04 * h);

    // Foot: heel, arch and the ball, toes flattened.
    F.group = L ? G.footL : G.footR;
    const heel = V(An.x, 0.12 * h, An.z - 0.22 * h);
    F.ellipsoid(heel, V(0.12 * h, 0.13 * h, 0.15 * h), 0.03 * h);
    const fdir = To.clone().sub(heel).setY(0).normalize();
    const fq = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), fdir);
    const arch = heel.clone().lerp(To, 0.5).setY(0.14 * h);
    F.box(arch, V(0.14 * h, 0.1 * h, 0.42 * h), 0.08 * h, 0.12 * h, fq.clone().multiply(rot(0.18)));
    F.ellipsoid(To.clone().setY(0.085 * h), V(0.17 * h, 0.085 * h, 0.14 * h), 0.06 * h, fq);
    const toeTip = To.clone().addScaledVector(fdir, 0.26 * h).setY(0.06 * h);
    F.box(To.clone().lerp(toeTip, 0.55).setY(0.06 * h), V(0.16 * h, 0.06 * h, 0.15 * h), 0.05 * h, 0.04 * h, fq);
    F.ellipsoid(An.clone().add(H(0, -0.05, 0.04)), V(0.12 * h, 0.14 * h, 0.15 * h), 0.08 * h);
    // A flat sole: whatever of the foot dips under the ground is planed off.
    F.box(V(An.x, -0.3 * h, An.z + 0.1 * h), V(0.5 * h, 0.3 * h, 0.9 * h), 0, 0.02 * h, undefined, { sub: true });

    chains[L ? G.legL : G.legR] = {
      bones: L ? ['pelvis', 'thighL', 'shinL'] : ['pelvis', 'thighR', 'shinR'],
      points: [H(0, 4.3, 0), Hp.clone(), Kn.clone(), An.clone()],
      blend: [0.3 * h, 0.2 * h],
    };
    chains[L ? G.footL : G.footR] = {
      bones: L ? ['shinL', 'footL', 'toeL'] : ['shinR', 'footR', 'toeR'],
      points: [An.clone().add(H(0, 0.6, 0)), An.clone().add(H(0, 0.05, 0)), To.clone(), toeTip.clone()],
      blend: [0.12 * h, 0.08 * h],
    };
  }

  chains[G.torso] = {
    bones: ['pelvis', 'spine', 'chest'],
    points: [j.pelvis.clone(), j.spine.clone(), j.chest.clone(), H(0, 6.4, 0)],
    blend: [0.4 * h, 0.45 * h],
  };
  chains[G.head] = {
    bones: ['chest', 'neck', 'head'],
    points: [j.chest.clone(), j.neck.clone(), j.head.clone(), H(0, 7.6, 0)],
    blend: [0.16 * h, 0.14 * h],
  };

  const wrist = (L: boolean) => {
    const E = j[L ? 'foreArmL' : 'foreArmR'];
    const Wr = j[L ? 'handL' : 'handR'];
    return { at: Wr.clone(), dir: Wr.clone().sub(E).normalize() };
  };
  const eyeY = 7.02;
  return {
    field: F.build(),
    chains,
    neckCut: 6.4 * h,
    wristL: wrist(true),
    wristR: wrist(false),
    eyes: { L: H(0.135, eyeY, 0.335), R: H(-0.135, eyeY, 0.335), r: 0.056 * h },
    h,
  };
}

/**
 * The head: cranium, jaw, cheekbones, a brow over recessed sockets, nose,
 * lips and ears. The eyes are separate meshes set into the sockets.
 */
function headField(F: FieldBuilder, h: number, male: boolean, b: number, w: number, opts: AnatomyOpts): void {
  const H = (x: number, y: number, z: number) => V(x * h, y * h, z * h);
  const rug = opts.rugged ?? (male ? 0.6 : 0.1);
  const skull = !!opts.skull;
  const gaunt = skull ? 1 : w;
  const fem = male ? 0 : 1;
  // Cranium: wider at the back than the brow, flat-sided over the ears.
  F.ellipsoid(H(0, 7.06, -0.08), V(0.37 * h, 0.44 * h, 0.45 * h), 0.08 * h);
  // Forehead: a near-vertical plane over the brow.
  F.ellipsoid(H(0, 7.2, 0.12), V(0.31 * h, 0.26 * h, 0.27 * h), 0.12 * h);
  // Face block, eye level to mouth.
  F.ellipsoid(H(0, 6.92, 0.16), V(0.3 * h, 0.27 * h, 0.27 * h), 0.12 * h);
  // Cheekbones, high on a woman.
  for (const s of [1, -1]) F.ellipsoid(H(s * 0.24, 6.92 + 0.02 * fem, 0.24), V(0.11 * h, 0.075 * h, 0.1 * h), 0.12 * h, rot(0, s * 0.5, 0));
  // Jaw: lower face mass, the angles under the ears and the chin.
  const jawW = (male ? 0.25 : 0.21) + 0.03 * rug;
  F.ellipsoid(H(0, 6.68, 0.14), V(jawW * h * 0.92, 0.2 * h, 0.27 * h), 0.12 * h);
  for (const s of [1, -1]) F.ellipsoid(H(s * jawW, 6.7, -0.02), V(0.07 * h, 0.13 * h, 0.12 * h), 0.12 * h);
  const chin = H(0, 6.52 - 0.02 * rug, 0.3 + 0.02 * rug);
  F.ellipsoid(chin, V((0.09 + 0.04 * rug) * h, (0.07 + 0.01 * rug) * h, 0.08 * h), 0.1 * h);
  // Muzzle: the curve of the teeth under the lips.
  F.ellipsoid(H(0, 6.73, 0.3), V(0.17 * h, 0.15 * h, 0.14 * h), 0.08 * h);
  // Brow ridge.
  F.ellipsoid(H(0, 7.11, 0.36), V(0.29 * h, (0.045 + 0.03 * rug) * h, (0.07 + 0.03 * rug) * h), 0.08 * h, rot(-0.1));
  // Sunken cheeks on the starved and the dead.
  if (gaunt > 0.2) {
    for (const s of [1, -1]) F.ellipsoid(H(s * 0.25, 6.74, 0.25), V(0.1 * h, 0.12 * h, 0.08 * h), 0.08 * h * gaunt, undefined, { sub: true });
  }
  // Eye sockets.
  for (const s of [1, -1]) {
    F.ellipsoid(H(s * 0.135, 7.02, 0.41), V((skull ? 0.1 : 0.088) * h, (skull ? 0.088 : 0.062) * h, 0.08 * h), 0.05 * h, undefined, { sub: true });
  }
  if (skull) {
    // Nasal cavity and a band of teeth.
    F.ellipsoid(H(0, 6.86, 0.44), V(0.04 * h, 0.07 * h, 0.06 * h), 0.02 * h, undefined, { sub: true });
    F.box(H(0, 6.67, 0.41), V(0.12 * h, 0.05 * h, 0.04 * h), 0.02 * h, 0.03 * h);
    F.box(H(0, 6.67, 0.45), V(0.1 * h, 0.006 * h, 0.03 * h), 0.003 * h, 0.01 * h, undefined, { sub: true });
  } else {
    // Eyelids: a shell over the eyeball, opened in an almond.
    for (const s of [1, -1]) {
      const e = H(s * 0.135, 7.02, 0.335);
      F.ellipsoid(e.clone().add(H(0, 0.004, 0.004)), V(0.066 * h, 0.064 * h, 0.064 * h), 0.02 * h);
      F.ellipsoid(e.clone().add(H(s * 0.004, -0.002, 0.06)), V((0.056 + 0.006 * fem) * h, (0.018 + 0.005 * fem) * h, 0.06 * h), 0.01 * h, rot(0, 0, s * 0.08), { sub: true });
    }
    // Nose: bridge, tip and wings.
    const nl = male ? 1 : 0.86;
    F.cone(H(0, 7.06, 0.42), H(0, 6.87, 0.5 + 0.03 * nl), 0.028 * h, 0.04 * h * nl, 0.035 * h);
    F.ellipsoid(H(0, 6.855, 0.5 + 0.02 * nl), V(0.05 * h * nl, 0.045 * h, 0.05 * h * nl), 0.025 * h);
    for (const s of [1, -1]) F.ellipsoid(H(s * 0.048, 6.845, 0.455), V(0.035 * h, 0.03 * h, 0.035 * h), 0.025 * h);
    // Lips, fuller on a woman, with a soft line between them.
    const lip = 1 + 0.35 * fem;
    F.ellipsoid(H(0, 6.722, 0.405), V(0.1 * h, 0.022 * h * lip, 0.035 * h), 0.025 * h);
    F.ellipsoid(H(0, 6.674, 0.395), V(0.09 * h, 0.025 * h * lip, 0.035 * h), 0.025 * h);
    F.box(H(0, 6.698, 0.44), V(0.095 * h, 0.003 * h, 0.03 * h), 0.003 * h, 0.006 * h, undefined, { sub: true });
    for (const s of [1, -1]) F.ellipsoid(H(s * 0.1, 6.7, 0.39), V(0.018 * h, 0.018 * h, 0.02 * h), 0.015 * h, undefined, { sub: true });
    // Ears.
    for (const s of [1, -1]) {
      F.ellipsoid(H(s * 0.36, 6.96, -0.06), V(0.045 * h, 0.14 * h, 0.095 * h), 0.04 * h, rot(0.12, s * -0.4, 0));
      F.ellipsoid(H(s * 0.395, 6.97, -0.05), V(0.022 * h, 0.085 * h, 0.055 * h), 0.02 * h, rot(0.12, s * -0.4, 0), { sub: true });
    }
  }
  void b;
}
