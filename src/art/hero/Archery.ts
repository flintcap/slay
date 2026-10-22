/**
 * SLAY — how an archer holds a bow.
 *
 * Every bow pose is placed rather than turned (`Pose.reach`): the bow hand
 * at the grip with the top limb pointing where it should, the string hand
 * on the string. The bow sits in the fist the way a real one does, the grip
 * up through the fist, the arrow out along the knuckles and the string back
 * toward the wrist (`Hold.ts`), so the bow faces wherever the forearm does.
 *
 * Places are in heads, character space (+X left, +Y up, +Z ahead), for a
 * right-handed archer turned side-on to the target (`SIDE_ON`): the bow arm
 * straight out at the target, the string drawn back under the chin.
 */
import * as THREE from 'three';

/** A hand's place: the grip, and which way the held thing points (the bow's top limb). */
export interface BowPlace {
  at: [number, number, number];
  dir: [number, number, number];
}

export interface BowAim {
  /** Aim above level, radians: 0.85 is a high lob, -0.3 at the legs. */
  up?: number;
  /** The bow canted over, 0 upright .. 1 lying flat. */
  cant?: number;
  /** Extra trunk turn (+ to the character's left): the aim swings with it. */
  turn?: number;
  /** Trunk lean (+ forward) and roll (+ top to the right): the face moves with them. */
  lean?: number;
  roll?: number;
}

/** The trunk turn that sets the shoulders side-on to the target. */
export const SIDE_ON = -1.0;
/** How much of a `trunk` turn reaches the chest (pelvis, spine and chest shares). */
const TURN_SHARE = 1.1;
/** Where the string comes to at full draw: under the right of the jaw. */
const ANCHOR = new THREE.Vector3(-0.1, 6.38, 0.32);
/** From the anchor to the bow hand at full draw, heads (about 0.73 m on a 1.88 m body). */
const DRAW = 2.9;
/** How far above the grip the arrow crosses the bow. */
const REST = 0.2;
/** How far behind the grip the string hangs at rest. */
const BRACE = 0.55;
/** The pelvis, which the trunk turns about. */
const PELVIS_Y = 4.02;

const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3();
const _f = new THREE.Vector3();
const _u = new THREE.Vector3();
const _r = new THREE.Vector3();
const _d = new THREE.Vector3();
const _g = new THREE.Vector3();
const _n = new THREE.Vector3();

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const out = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];

/** Moves a point that rides on the trunk by the trunk's extra lean, roll and turn. */
function onTrunk(p: THREE.Vector3, o: BowAim): THREE.Vector3 {
  p.y -= PELVIS_Y;
  if (o.lean) p.applyAxisAngle(new THREE.Vector3(1, 0, 0), o.lean);
  if (o.roll) p.applyAxisAngle(new THREE.Vector3(0, 0, 1), o.roll);
  if (o.turn) p.applyAxisAngle(Y, o.turn * TURN_SHARE);
  p.y += PELVIS_Y;
  return p;
}

/**
 * The aim's frame: `f` along the arrow, `u` up the bow's plane, `r` to the
 * archer's right of the arrow, and the top limb `d` canted over toward it.
 */
function frame(o: BowAim): void {
  const up = o.up ?? 0;
  const az = (o.turn ?? 0) * TURN_SHARE;
  _f.set(0, Math.sin(up), Math.cos(up)).applyAxisAngle(Y, az);
  _u.set(0, Math.cos(up), -Math.sin(up)).applyAxisAngle(Y, az);
  _r.crossVectors(_f, _u);
  const c = (o.cant ?? 0) * Math.PI * 0.5 + (o.roll ?? 0);
  _d.copy(_u).multiplyScalar(Math.cos(c)).addScaledVector(_r, Math.sin(c));
}

/** The bow hand: out at the target, the arm straightening as the string comes back. */
function bowGrip(d: number): THREE.Vector3 {
  return _g.copy(_a).addScaledVector(_f, 2.2 + (DRAW - 2.2) * clamp01(d)).addScaledVector(_d, -REST);
}

/**
 * Both hands for a draw `d` of the way from the bow (0, the arrow just
 * nocked) to the chin (1); a little past 1 is a long draw.
 */
export function drawPlaces(d: number, o: BowAim = {}): { L: BowPlace; R: BowPlace } {
  frame(o);
  onTrunk(_a.copy(ANCHOR), o);
  const grip = bowGrip(d);
  // The nock: on the string at arrow height, drawn from the brace to the anchor.
  _n.copy(grip).addScaledVector(_d, REST).addScaledVector(_f, -BRACE);
  _n.lerp(_a, d);
  // The string runs through the curled fingers, the nock on the index.
  _n.addScaledVector(_d, -0.06);
  return {
    L: { at: out(grip), dir: out(_d) },
    R: { at: out(_n), dir: out(_d) },
  };
}

/** The string let go: the fingers open and the hand flies back along the jaw, `far` how hard. */
export function loosePlaces(o: BowAim = {}, far = 1): { L: BowPlace; R: BowPlace } {
  frame(o);
  onTrunk(_a.copy(ANCHOR), o);
  const grip = bowGrip(1);
  _n.copy(_a).addScaledVector(_f, -0.32 * far).addScaledVector(_r, 0.2 * far).addScaledVector(_d, 0.04);
  const back = _d.clone().addScaledVector(_f, -0.5).normalize();
  return {
    L: { at: out(grip), dir: out(_d) },
    R: { at: out(_n), dir: out(back) },
  };
}

/**
 * The bow at rest in the bow hand: low by the left hip, the top limb tipped
 * forward and across the body, the arrow pointed at the ground ahead. `run`
 * carries it a little higher and more upright, out of the knees' way;
 * `turn` swings it round with a trunk turned that much.
 */
export function restPlace(run = 0, turn = 0): BowPlace {
  const at = _g.set(0.66 + 0.06 * run, 4.0 + 0.1 * run, 0.95 + 0.15 * run).applyAxisAngle(Y, turn * TURN_SHARE);
  const dir = _d.set(-0.42 + 0.12 * run, 0.66 + 0.1 * run, 0.62).normalize().applyAxisAngle(Y, turn * TURN_SHARE);
  return { at: out(at), dir: out(dir) };
}

/** A place in the gesture convention: written for the right hand, mirrored for the left. */
export function mirrored(side: 'L' | 'R', p: BowPlace): BowPlace {
  if (side === 'R') return p;
  return { at: [-p.at[0], p.at[1], p.at[2]], dir: [-p.dir[0], p.dir[1], p.dir[2]] };
}
