/**
 * Scratch solver for weapon carry poses. Not a check — an authoring tool.
 *
 *   node tools/solve-grips.mjs
 *
 * Two numbers per weapon, and neither can be eyeballed.
 *
 * 1. **The socket rotation**, solved against the *idle* hand. A socket lives in
 *    the hand bone's frame, and the weapon is parented to that bone, so every
 *    attack clip swings the weapon with the arm. Solve the socket against a
 *    posed arm and the compensation bakes in: the blade reads perfectly while
 *    standing and points back over the shoulder the moment you swing.
 *
 * 2. **Where the free hand goes.** The holding arm keeps whatever the clip gave
 *    it. Only the free hand moves, onto a point measured along the real haft,
 *    which is what "held with both hands" actually means and what keeps the
 *    swing untouched.
 */
import * as THREE from 'three';
import { buildPlayerModel } from '../src/art/CharacterModels';
import { Animator } from '../src/art/Animation';
import { Random } from '../src/core/RNG';

type V3 = [number, number, number];

interface Case {
  name: string;
  /** Which hand the weapon hangs off. The other one is the free hand. */
  hand: 'handL' | 'handR';
  /** Where the business end should point, in character space: +X left, +Y up. */
  tip: V3;
  /** Where the flat of the blade — a bow's string side — should face. */
  flat: V3;
  /**
   * How far along the haft the free hand grips, in metres. Positive is toward
   * the business end. Zero means "right beside the other hand".
   */
  alongHaft?: number;
  /**
   * Where the *holding* hand goes, offset from the chest.
   *
   * Deliberately modest. The socket has to compensate for however this arm is
   * posed, and the weapon is parented to the hand, so a heavily bent holding
   * elbow bakes a big correction into the socket and the blade swings
   * somewhere silly the moment an attack clip takes the arm back.
   */
  hold?: V3;
}

const CASES: Case[] = [
  // One-handed. No free hand involved; just point the thing.
  // Shouldered, not shouldered arms. Bolt upright reads as a rifle at
  // attention; a carried sword leans back over the shoulder and out from the
  // body, roughly forty degrees off vertical.
  { name: 'sword', hand: 'handR', tip: [-0.42, 0.7, -0.58], flat: [0.1, 0, -0.99] },
  { name: 'dagger', hand: 'handR', tip: [-0.05, -0.98, 0.19], flat: [0.1, 0, -0.99] },
  // Both hands. The tip goes up and across the body, so the free hand grips
  // further along the haft — which is toward the far shoulder, and reachable.
  {
    name: 'twoHand',
    hand: 'handR',
    tip: [0.5, 0.84, -0.2],
    flat: [0.2, 0, -0.96],
    hold: [-0.11, -0.3, 0.17],
    alongHaft: 0.2,
  },
  {
    name: 'staff',
    hand: 'handR',
    tip: [-0.08, 0.99, 0.06],
    flat: [0, 0, -1],
    hold: [-0.14, -0.28, 0.14],
    alongHaft: 0.32,
  },
  {
    name: 'bow',
    hand: 'handL',
    tip: [-0.4, 0.9, 0.15],
    flat: [-0.55, 0.1, 0.83],
    hold: [0.15, -0.28, 0.2],
    alongHaft: 0.04,
  },
];

/** A holding arm may only bend this far, or the socket has to fight the swing. */
function legalHold(a: number[]): boolean {
  return (
    Math.abs(a[0]!) <= 0.7 && Math.abs(a[1]!) <= 0.8 && Math.abs(a[2]!) <= 0.7 && a[3]! <= 0 && a[3]! >= -0.95
  );
}

/** Angles a shoulder and an elbow can actually make. */
function legal(a: number[]): boolean {
  return (
    Math.abs(a[0]!) <= 2.2 && Math.abs(a[1]!) <= 1.2 && Math.abs(a[2]!) <= 1.2 && a[3]! <= 0 && a[3]! >= -2.4
  );
}

const out: Record<string, unknown> = {};
for (const c of CASES) {
  const built = buildPlayerModel('warden', new Random(0x51a7));
  const bones = built.bones;
  const animator = new Animator(bones);
  animator.play('idle', { fade: 0 });
  // Settle on idle with no carry pose at all. This is the frame the socket has
  // to be right in, because it is the frame every clip starts from.
  for (let i = 0; i < 120; i++) animator.update(1 / 60);
  built.root.updateMatrixWorld(true);

  const chest = new THREE.Vector3();
  bones.chest!.getWorldPosition(chest);

  /** Moves one arm's hand as close to a world point as its joints allow. */
  const solveArm = (
    side: 'L' | 'R',
    target: THREE.Vector3,
    limit: (a: number[]) => boolean,
  ): { arm: number[]; error: number } => {
    const shoulder = `shoulder${side}`;
    const elbow = `elbow${side}`;
    const hand = `hand${side}`;
    const at = new THREE.Vector3();
    const probe = (a: number[]): number => {
      bones[shoulder]!.rotation.set(a[0]!, a[1]!, a[2]!);
      bones[elbow]!.rotation.set(a[3]!, 0, 0);
      bones[hand]!.rotation.set(0, 0, 0);
      built.root.updateMatrixWorld(true);
      bones[hand]!.getWorldPosition(at);
      return at.distanceTo(target);
    };
    let best = [-0.3, 0, side === 'L' ? -0.2 : 0.2, -0.6];
    let bd = probe(best);
    for (let step = 0.6; step > 0.001; step *= 0.6) {
      let moved = true;
      while (moved) {
        moved = false;
        for (let i = 0; i < 4; i++) {
          for (const s of [step, -step]) {
            const trial = [...best];
            trial[i] = trial[i]! + s;
            if (!limit(trial)) continue;
            const d = probe(trial);
            if (d < bd - 1e-6) {
              bd = d;
              best = trial;
              moved = true;
            }
          }
        }
      }
    }
    probe(best);
    return { arm: best.map((v) => +v.toFixed(3)), error: +bd.toFixed(4) };
  };

  // --- the holding arm, first and gently ------------------------------------
  const holdSide = c.hand === 'handR' ? 'R' : 'L';
  let holdArm: number[] | null = null;
  let holdError = 0;
  if (c.hold) {
    const r = solveArm(holdSide, chest.clone().add(new THREE.Vector3(...c.hold)), legalHold);
    holdArm = r.arm;
    holdError = r.error;
  }

  // --- the socket, in whatever frame the holding hand ended up in -----------
  const handQ = bones[c.hand]!.getWorldQuaternion(new THREE.Quaternion());
  const tip = new THREE.Vector3(...c.tip).normalize();
  const flat = new THREE.Vector3(...c.flat).normalize();
  // Right-handed frame: the model's +Y is the tip and its -Z is the flat, so +Z
  // is the flat reversed and orthogonalised, and +X completes the basis.
  const zAxis = flat.clone().addScaledVector(tip, -flat.dot(tip)).normalize().negate();
  const xAxis = new THREE.Vector3().crossVectors(tip, zAxis).normalize();
  const wanted = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xAxis, tip, zAxis),
  );
  const e = new THREE.Euler().setFromQuaternion(handQ.clone().invert().multiply(wanted), 'XYZ');
  const socketRot: V3 = [+e.x.toFixed(3), +e.y.toFixed(3), +e.z.toFixed(3)];

  // --- the free hand, onto the haft ----------------------------------------
  if (c.alongHaft === undefined) {
    out[c.name] = { socketRot };
    continue;
  }
  const freeSide = holdSide === 'R' ? 'L' : 'R';
  const gripAt = new THREE.Vector3();
  bones[c.hand]!.getWorldPosition(gripAt);
  const free = solveArm(freeSide, gripAt.clone().addScaledVector(tip, c.alongHaft), legal);

  const l = new THREE.Vector3();
  const r = new THREE.Vector3();
  bones.handL!.getWorldPosition(l);
  bones.handR!.getWorldPosition(r);
  // The real measure of "both hands on it": how far the free hand sits off the
  // line of the haft, not how far it is from the other hand. Hands on a staff
  // are a third of a metre apart and still very much both on the staff.
  const off = new THREE.Vector3().subVectors(freeSide === 'L' ? l : r, gripAt);
  const offHaft = +off.clone().addScaledVector(tip, -off.dot(tip)).length().toFixed(3);

  out[c.name] = {
    socketRot,
    hold: { side: holdSide, arm: holdArm, error: holdError },
    free: { side: freeSide, arm: free.arm, error: free.error },
    handGap: +l.distanceTo(r).toFixed(3),
    offHaft,
  };
}

console.log(JSON.stringify(out));
