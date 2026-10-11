/**
 * SLAY — creature skeletons.
 *
 * Every monster, mini-boss and boss stands on one of these rigs. A rig is a
 * small tree of bones laid out from a handful of proportions, so one rig kind
 * covers a goblin and a grave titan alike, and the animator (`Animator.ts`)
 * reads the same bone names on both.
 *
 * Space: character space, +X the creature's left, +Y up, +Z forward, feet on
 * y = 0 (the same convention as the hero rig). Every bone has an identity
 * rotation in the bind pose, so a bone's local axes at rest are character
 * axes and a rotation authored on a bone reads the same way on every body.
 *
 * Rig kinds (see CONTRACTS.md, "Creature rigs"):
 *  - biped      upright two legs: skeletons, ghouls, cultists, imps, elementals
 *  - brute      the biped tree, hunched and heavy: armoured knights, bloats
 *  - giant      the biped tree, colossal and slow: titans, golems, treants
 *  - quadruped  four legs: hounds, wolves, bears, cats, rats, stags, frogs
 *  - spider     eight legs round a body and abdomen: spinners, ticks
 *  - insect     six legs, thorax and abdomen, optional wings and scythes
 *  - serpent    a body chain with a rearing front: worms, basilisks, vines
 *  - flyer      wings that carry it: bats, harpies, wyverns, succubi
 *  - specter    a floating torso over a trailing robe: wraiths, banshees
 *  - ooze       a blob with lobes and pseudopods
 *  - floater    a hovering core with orbiting parts or hanging tendrils
 *  - swarm      a cloud of motes round an empty centre
 */
import * as THREE from 'three';

export type RigKind =
  | 'biped'
  | 'brute'
  | 'giant'
  | 'quadruped'
  | 'spider'
  | 'insect'
  | 'serpent'
  | 'flyer'
  | 'specter'
  | 'ooze'
  | 'floater'
  | 'swarm';

/**
 * Named attach points for effects (creatures → vfx contract). Each is an
 * `Object3D` riding a bone; read its world position at the hit or release
 * frame. Every rig has every socket (mapped to the nearest sensible place).
 */
export type CreatureSocket = 'head' | 'mouth' | 'chest' | 'core' | 'handL' | 'handR' | 'weapon';
export const CREATURE_SOCKETS: readonly CreatureSocket[] = ['head', 'mouth', 'chest', 'core', 'handL', 'handR', 'weapon'];

/** One leg the animator plants: upper and lower bone, the bone at the ankle, and where it touches the floor. */
export interface LegChain {
  upper: string;
  lower: string;
  /** Bone at the end of `lower` (ankle, hock or claw). */
  end: string;
  /** Optional bone below `end` (a digitigrade foot). */
  foot?: string;
  /** Which way the middle joint bends, character space. */
  pole: THREE.Vector3;
  /** Character-space bind position of the floor contact. */
  contact: THREE.Vector3;
  /** Side, for step events and mirrored motion. */
  side: 'L' | 'R';
  /** Gait phase offset in turns (0..1): which legs move together. */
  phase: number;
}

export interface BoneSpec {
  name: string;
  parent: string | null;
  /** Character-space bind position of the joint. */
  at: THREE.Vector3;
}

export interface CreatureRig {
  kind: RigKind;
  root: THREE.Group;
  bones: Record<string, THREE.Bone>;
  /** Bone names, parents first: the skeleton's order and the sculpt's group ids. */
  order: string[];
  /** Bind positions, character space. */
  joints: Record<string, THREE.Vector3>;
  /** Extra named points (limb tips, the weapon tip), character space, with the bone they ride. */
  ends: Record<string, { bone: string; at: THREE.Vector3 }>;
  legs: LegChain[];
  sockets: Record<CreatureSocket, THREE.Object3D>;
  /** Overall size: crown or top height and body length, metres at scale 1. */
  height: number;
  length: number;
  /** Height of the body's centre of mass: the yardstick the animator scales motion by. */
  hipY: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Builds a rig's bone tree from specs. Sockets and legs are filled by the kind's builder. */
export class RigBuilder {
  readonly specs: BoneSpec[] = [];
  readonly ends: CreatureRig['ends'] = {};
  readonly legs: LegChain[] = [];
  readonly socketAt: Partial<Record<CreatureSocket, { bone: string; at: THREE.Vector3 }>> = {};
  private names = new Set<string>();

  constructor(readonly kind: RigKind) {
    this.bone('root', null, V(0, 0, 0));
  }

  bone(name: string, parent: string | null, at: THREE.Vector3): this {
    if (this.names.has(name)) throw new Error(`rig: bone ${name} twice`);
    if (parent && !this.names.has(parent)) throw new Error(`rig: ${name} before its parent ${parent}`);
    this.names.add(name);
    this.specs.push({ name, parent, at: at.clone() });
    return this;
  }

  has(name: string): boolean {
    return this.names.has(name);
  }

  at(name: string): THREE.Vector3 {
    const s = this.specs.find((sp) => sp.name === name);
    if (!s) throw new Error(`rig: no bone ${name}`);
    return s.at;
  }

  end(name: string, bone: string, at: THREE.Vector3): this {
    this.ends[name] = { bone, at: at.clone() };
    return this;
  }

  socket(name: CreatureSocket, bone: string, at: THREE.Vector3): this {
    this.socketAt[name] = { bone, at: at.clone() };
    return this;
  }

  leg(l: LegChain): this {
    this.legs.push(l);
    return this;
  }

  build(height: number, length: number, hipY: number): CreatureRig {
    const root = new THREE.Group();
    root.name = 'creature';
    const bones: Record<string, THREE.Bone> = {};
    const joints: Record<string, THREE.Vector3> = {};
    for (const s of this.specs) {
      const b = new THREE.Bone();
      b.name = s.name;
      joints[s.name] = s.at.clone();
      if (s.parent) {
        b.position.copy(s.at).sub(joints[s.parent]!);
        bones[s.parent]!.add(b);
      } else {
        b.position.copy(s.at);
        root.add(b);
      }
      bones[s.name] = b;
    }
    const sockets = {} as Record<CreatureSocket, THREE.Object3D>;
    for (const name of CREATURE_SOCKETS) {
      const s = this.socketAt[name] ?? this.socketAt.core ?? { bone: 'root', at: V(0, hipY, 0) };
      const o = new THREE.Object3D();
      o.name = `socket:${name}`;
      o.position.copy(s.at).sub(joints[s.bone] ?? V(0, 0, 0));
      (bones[s.bone] ?? bones.root!).add(o);
      sockets[name] = o;
    }
    root.updateMatrixWorld(true);
    return {
      kind: this.kind,
      root,
      bones,
      order: this.specs.map((s) => s.name),
      joints,
      ends: this.ends,
      legs: this.legs,
      sockets,
      height,
      length,
      hipY,
    };
  }
}

// ---------------------------------------------------------------------------
// Bipeds: biped, brute, giant
// ---------------------------------------------------------------------------

export interface BipedShape {
  /** Crown height, metres. */
  height: number;
  /** Hip joint height as a share of height (0.5 human, 0.42 brute). */
  hip?: number;
  /** Half the shoulder span, as a share of height (0.13 human, 0.2 brute). */
  shoulders?: number;
  /** Half the hip span, share of height. */
  hips?: number;
  /** Arm length as a multiple of human (1). Brutes 1.25, ghouls 1.3. */
  arms?: number;
  /** 0 upright .. 1 the head below the shoulder line, thrust forward. */
  hunch?: number;
  /** Knees forward, hocks back, walks on its toes. */
  digitigrade?: boolean;
  /** Tail segments (0 none) and length (share of height). */
  tail?: number;
  tailLen?: number;
  /** Wings on the back, span as a share of height. */
  wings?: number;
  /** A second pair of arms under the first. */
  arms2?: boolean;
  /** Head size multiple (1 human). */
  head?: number;
  /** Arms hang this far out from the body, radians (0.32 default). */
  armOut?: number;
}

export function bipedRig(kind: 'biped' | 'brute' | 'giant', s: BipedShape): CreatureRig {
  const H = s.height;
  const hipF = s.hip ?? (kind === 'biped' ? 0.5 : 0.44);
  const hunch = s.hunch ?? (kind === 'biped' ? 0 : 0.45);
  const sw = (s.shoulders ?? (kind === 'biped' ? 0.13 : 0.19)) * H;
  const hw = (s.hips ?? (kind === 'biped' ? 0.065 : 0.085)) * H;
  const arms = s.arms ?? (kind === 'biped' ? 1 : 1.22);
  const headK = s.head ?? 1;
  const b = new RigBuilder(kind);

  const hipY = H * hipF;
  const top = H - 0.13 * H * headK; // atlas: top of the neck
  b.bone('hips', 'root', V(0, hipY, 0));
  b.bone('spine', 'hips', V(0, hipY + (top - hipY) * 0.28, hunch * 0.03 * H));
  const chestY = hipY + (top - hipY) * 0.62;
  b.bone('chest', 'spine', V(0, chestY, hunch * 0.08 * H));
  // A hunched body carries its neck forward of the chest and below its top.
  const neckY = top - hunch * 0.07 * H;
  const neckZ = hunch * 0.2 * H;
  b.bone('neck', 'chest', V(0, neckY, neckZ));
  const headY = neckY + 0.05 * H * headK;
  const headZ = neckZ + 0.02 * H + hunch * 0.06 * H;
  b.bone('head', 'neck', V(0, headY, headZ));
  b.bone('jaw', 'head', V(0, headY - 0.025 * H * headK, headZ + 0.035 * H * headK));

  const shY = top - 0.035 * H - hunch * 0.05 * H;
  const shZ = hunch * 0.1 * H;
  const out = s.armOut ?? 0.32;
  const L1 = 0.175 * H * arms;
  const L2 = 0.155 * H * arms;
  const LH = 0.07 * H * arms;
  const armPair = (suffix: string, y: number, z: number, spread: number, outA: number) => {
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const sh = V(sx * spread, y, z);
      const d1 = V(sx * Math.sin(outA), -Math.cos(outA), 0.12 + hunch * 0.25).normalize();
      const el = sh.clone().addScaledVector(d1, L1);
      const d2 = V(sx * Math.sin(outA * 0.7), -Math.cos(outA * 0.7), 0.35 + hunch * 0.3).normalize();
      const wr = el.clone().addScaledVector(d2, L2);
      const tip = wr.clone().addScaledVector(d2, LH);
      b.bone(`arm${suffix}${side}`, 'chest', sh);
      b.bone(`fore${suffix}${side}`, `arm${suffix}${side}`, el);
      b.bone(`hand${suffix}${side}`, `fore${suffix}${side}`, wr);
      b.end(`hand${suffix}${side}Tip`, `hand${suffix}${side}`, tip);
    }
  };
  armPair('', shY, shZ, sw, out);
  if (s.arms2) armPair('2', shY - 0.12 * H, shZ - 0.01 * H, sw * 0.82, out + 0.25);

  // Legs.
  const kneeY = hipY * 0.53;
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const hj = V(sx * hw, hipY - 0.03 * H, 0);
    b.bone(`leg${side}`, 'hips', hj);
    if (s.digitigrade) {
      const kn = V(sx * hw * 1.1, kneeY * 1.12, 0.07 * H);
      const hock = V(sx * hw * 1.12, 0.13 * H, -0.06 * H);
      const ball = V(sx * hw * 1.14, 0.025 * H, 0.0);
      b.bone(`shin${side}`, `leg${side}`, kn);
      b.bone(`hock${side}`, `shin${side}`, hock);
      b.bone(`foot${side}`, `hock${side}`, ball);
      b.end(`toe${side}`, `foot${side}`, V(sx * hw * 1.14, 0, 0.07 * H));
      b.leg({ upper: `leg${side}`, lower: `shin${side}`, end: `hock${side}`, foot: `foot${side}`, pole: V(0, 0, 1), contact: V(sx * hw * 1.14, 0, 0.02 * H), side, phase: side === 'L' ? 0 : 0.5 });
    } else {
      const kn = V(sx * hw * 1.05, kneeY, 0.012 * H);
      const an = V(sx * hw * 1.1, 0.045 * H, -0.01 * H);
      b.bone(`shin${side}`, `leg${side}`, kn);
      b.bone(`foot${side}`, `shin${side}`, an);
      b.end(`toe${side}`, `foot${side}`, V(sx * hw * 1.1, 0, 0.085 * H));
      b.leg({ upper: `leg${side}`, lower: `shin${side}`, end: `foot${side}`, pole: V(0, 0, 1), contact: V(sx * hw * 1.1, 0, 0.02 * H), side, phase: side === 'L' ? 0 : 0.5 });
    }
  }

  if (s.tail) {
    const n = s.tail;
    const len = (s.tailLen ?? 0.45) * H;
    let prev = 'hips';
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const at = V(0, hipY - 0.04 * H - t * t * hipY * 0.5, -0.06 * H - t * len);
      b.bone(`tail${i}`, prev, at);
      prev = `tail${i}`;
    }
    b.end('tailTip', prev, V(0, hipY - 0.04 * H - hipY * 0.55, -0.06 * H - len * 1.18));
  }
  if (s.wings) {
    const span = s.wings * H;
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const base = V(sx * sw * 0.45, shY + 0.01 * H, shZ - 0.06 * H);
      b.bone(`wing${side}`, 'chest', base);
      b.bone(`wing${side}2`, `wing${side}`, base.clone().add(V(sx * span * 0.22, span * 0.16, -span * 0.12)));
      b.bone(`wing${side}3`, `wing${side}2`, base.clone().add(V(sx * span * 0.42, span * 0.22, -span * 0.22)));
      b.end(`wing${side}Tip`, `wing${side}3`, base.clone().add(V(sx * span * 0.62, span * 0.06, -span * 0.3)));
    }
  }

  const head = b.at('head');
  const jaw = b.at('jaw');
  b.socket('head', 'head', head.clone().add(V(0, 0.04 * H * headK, 0)));
  b.socket('mouth', 'jaw', jaw.clone().add(V(0, -0.005 * H, 0.03 * H * headK)));
  b.socket('chest', 'chest', b.at('chest').clone().add(V(0, 0.02 * H, 0.09 * H)));
  b.socket('core', 'chest', b.at('chest').clone().add(V(0, -0.02 * H, 0.02 * H)));
  b.socket('handL', 'handL', b.ends.handLTip!.at.clone().lerp(b.at('handL'), 0.5));
  b.socket('handR', 'handR', b.ends.handRTip!.at.clone().lerp(b.at('handR'), 0.5));
  b.socket('weapon', 'handR', b.ends.handRTip!.at.clone());
  return b.build(H, 0.3 * H, hipY);
}

// ---------------------------------------------------------------------------
// Quadruped
// ---------------------------------------------------------------------------

export interface QuadShape {
  /** Height at the shoulder (withers), metres. */
  withers: number;
  /** Shoulder-to-haunch length, metres. */
  length: number;
  /** Half the body width at the legs, share of withers. */
  width?: number;
  /** Neck length and its rise, share of withers. */
  neck?: number;
  neckRise?: number;
  /** Head length, share of withers. */
  head?: number;
  /** Tail segments and length (share of body length). */
  tail?: number;
  tailLen?: number;
  /** Haunches higher (+) or lower (-) than the withers, share of withers. */
  slope?: number;
  /** Legs splay out to the sides (frogs, lizards), 0..1. */
  splay?: number;
}

export function quadRig(s: QuadShape): CreatureRig {
  const W = s.withers;
  const L = s.length;
  const hw = (s.width ?? 0.17) * W;
  const splay = s.splay ?? 0;
  const b = new RigBuilder('quadruped');
  const slope = (s.slope ?? -0.04) * W;
  const hipY = W * 0.98 + slope;
  const chestY = W * 1.0;
  b.bone('hips', 'root', V(0, hipY, -L * 0.5));
  b.bone('spine', 'hips', V(0, (hipY + chestY) * 0.5 + 0.03 * W, 0));
  b.bone('chest', 'spine', V(0, chestY, L * 0.42));
  const nl = (s.neck ?? 0.42) * W;
  const rise = s.neckRise ?? 0.6;
  const neck = V(0, chestY + 0.12 * W, L * 0.5 + 0.05 * W);
  b.bone('neck', 'chest', neck);
  const head = neck.clone().add(V(0, nl * rise, nl * Math.sqrt(Math.max(0.05, 1 - rise * rise))));
  b.bone('head', 'neck', head);
  const hl = (s.head ?? 0.42) * W;
  b.bone('jaw', 'head', head.clone().add(V(0, -0.08 * W, 0.12 * hl)));
  b.end('snout', 'head', head.clone().add(V(0, -0.05 * W, hl)));

  const legX = hw * (1 + splay * 0.9);
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    // Front: shoulder, elbow, wrist, paw.
    const fs = V(sx * hw * 0.85, chestY - 0.12 * W, L * 0.44);
    const fe = V(sx * legX * 1.0, chestY * 0.55 + splay * 0.12 * W, L * 0.4 - 0.04 * W);
    const fw = V(sx * legX * 1.02, 0.07 * W, L * 0.44);
    b.bone(`fLeg${side}`, 'chest', fs);
    b.bone(`fShin${side}`, `fLeg${side}`, fe);
    b.bone(`fFoot${side}`, `fShin${side}`, fw);
    b.end(`fToe${side}`, `fFoot${side}`, V(sx * legX * 1.02, 0, L * 0.44 + 0.1 * W));
    b.leg({ upper: `fLeg${side}`, lower: `fShin${side}`, end: `fFoot${side}`, pole: splay > 0.4 ? V(sx, 0, -0.3) : V(0, 0, -1), contact: V(sx * legX * 1.02, 0, L * 0.44 + 0.03 * W), side, phase: side === 'L' ? 0.5 : 0 });
    // Hind: hip, knee (forward), hock (back), paw.
    const hh = V(sx * hw * 0.9, hipY - 0.1 * W, -L * 0.5);
    const hk = V(sx * legX * 1.0, hipY * 0.55 + splay * 0.12 * W, -L * 0.42 + 0.06 * W);
    const hc = V(sx * legX * 1.02, 0.24 * W, -L * 0.56);
    const hp = V(sx * legX * 1.03, 0.05 * W, -L * 0.5);
    b.bone(`hLeg${side}`, 'hips', hh);
    b.bone(`hShin${side}`, `hLeg${side}`, hk);
    b.bone(`hHock${side}`, `hShin${side}`, hc);
    b.bone(`hFoot${side}`, `hHock${side}`, hp);
    b.end(`hToe${side}`, `hFoot${side}`, V(sx * legX * 1.03, 0, -L * 0.5 + 0.1 * W));
    b.leg({ upper: `hLeg${side}`, lower: `hShin${side}`, end: `hHock${side}`, foot: `hFoot${side}`, pole: splay > 0.4 ? V(sx, 0, 0.3) : V(0, 0, 1), contact: V(sx * legX * 1.03, 0, -L * 0.5 + 0.03 * W), side, phase: side === 'L' ? 0.0 : 0.5 });
  }
  if (s.tail) {
    const n = s.tail;
    const len = (s.tailLen ?? 0.6) * L;
    let prev = 'hips';
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      b.bone(`tail${i}`, prev, V(0, hipY + 0.04 * W - t * 0.25 * W, -L * 0.5 - 0.06 * W - t * len));
      prev = `tail${i}`;
    }
    b.end('tailTip', prev, V(0, hipY - 0.25 * W, -L * 0.5 - len * 1.15));
  }
  b.socket('head', 'head', head.clone().add(V(0, 0.04 * W, 0.1 * hl)));
  b.socket('mouth', 'jaw', head.clone().add(V(0, -0.08 * W, hl * 0.9)));
  b.socket('chest', 'chest', V(0, chestY - 0.05 * W, L * 0.5 + 0.08 * W));
  b.socket('core', 'spine', V(0, (hipY + chestY) * 0.5, 0));
  b.socket('handL', 'fFootL', V(legX, 0.04 * W, L * 0.44 + 0.06 * W));
  b.socket('handR', 'fFootR', V(-legX, 0.04 * W, L * 0.44 + 0.06 * W));
  b.socket('weapon', 'jaw', head.clone().add(V(0, -0.08 * W, hl * 0.95)));
  return b.build(head.y + 0.1 * W, L + hl + nl * 0.6, (hipY + chestY) * 0.5);
}

// ---------------------------------------------------------------------------
// Many legs: spider, insect
// ---------------------------------------------------------------------------

export interface ManyLegShape {
  /** Body (cephalothorax or thorax) half length, metres. */
  body: number;
  /** Height of the body's centre above the floor. */
  ride: number;
  /** Abdomen half length (share of body). */
  abdomen?: number;
  /** How far the legs reach out from the body (share of body). */
  reach?: number;
  /** Legs per side: 4 spider, 3 insect. */
  pairs: number;
  /** Insect: front pair are raised scythes, not walked on. */
  scythes?: boolean;
  /** Insect: wings (pairs). */
  wings?: number;
  /** Abdomen ends in a sting. */
  sting?: boolean;
  /** Head ahead of the body (insects), share of body. */
  head?: number;
}

export function manyLegRig(kind: 'spider' | 'insect', s: ManyLegShape): CreatureRig {
  const B = s.body;
  const R = s.ride;
  const reach = (s.reach ?? (kind === 'spider' ? 2.6 : 2.0)) * B;
  const ab = (s.abdomen ?? (kind === 'spider' ? 1.35 : 1.5)) * B;
  const b = new RigBuilder(kind);
  b.bone('body', 'root', V(0, R, 0));
  b.bone('abdomen', 'body', V(0, R + 0.1 * B, -B * 0.9));
  b.end('abdomenTip', 'abdomen', V(0, R + 0.05 * B, -B * 0.9 - ab * 1.9));
  if (s.sting) {
    b.bone('sting', 'abdomen', V(0, R, -B * 0.9 - ab * 1.75));
    b.end('stingTip', 'sting', V(0, R - 0.25 * B, -B * 0.9 - ab * 2.25));
  }
  const hz = B * (s.head ?? (kind === 'spider' ? 0.75 : 1.05));
  b.bone('head', 'body', V(0, R + 0.05 * B, hz));
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    b.bone(`mand${side}`, 'head', V(sx * 0.18 * B, R - 0.08 * B, hz + 0.35 * B));
    b.end(`mand${side}Tip`, `mand${side}`, V(sx * 0.05 * B, R - 0.22 * B, hz + 0.75 * B));
  }
  const n = s.pairs;
  for (let i = 0; i < n; i++) {
    // Legs fan from front to back round the body.
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = (kind === 'spider' ? 0.95 - t * 1.9 : 0.75 - t * 1.5);
    const scythe = kind === 'insect' && s.scythes && i === 0;
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const hip = V(sx * B * 0.42, R - 0.02 * B, B * 0.55 * Math.sin(a) + (kind === 'insect' ? B * 0.25 : 0));
      const dir = V(sx * Math.cos(a), 0, Math.sin(a)).normalize();
      const name = `leg${i}${side}`;
      if (scythe) {
        const kn = hip.clone().add(V(sx * 0.25 * B, 0.55 * B, 0.55 * B));
        const tip = kn.clone().add(V(-sx * 0.05 * B, -0.5 * B, 0.75 * B));
        b.bone(name, 'body', hip);
        b.bone(`knee${i}${side}`, name, kn);
        b.bone(`foot${i}${side}`, `knee${i}${side}`, tip);
        b.end(`tip${i}${side}`, `foot${i}${side}`, tip.clone().add(V(0, -0.35 * B, -0.15 * B)));
        continue;
      }
      const kn = hip.clone().addScaledVector(dir, reach * 0.45).add(V(0, R * 0.75, 0));
      const tip = hip.clone().addScaledVector(dir, reach);
      tip.y = 0;
      b.bone(name, 'body', hip);
      b.bone(`knee${i}${side}`, name, kn);
      b.bone(`foot${i}${side}`, `knee${i}${side}`, tip.clone().add(V(0, 0.001, 0)));
      b.end(`tip${i}${side}`, `foot${i}${side}`, tip);
      // Alternating tetrapod (spider) or tripod (insect).
      const phase = ((i + (side === 'L' ? 0 : 1)) % 2) * 0.5;
      b.leg({ upper: name, lower: `knee${i}${side}`, end: `foot${i}${side}`, pole: V(0, 1, 0), contact: tip, side, phase });
    }
  }
  if (s.wings) {
    for (let w = 0; w < s.wings; w++) {
      for (const side of ['L', 'R'] as const) {
        const sx = side === 'L' ? 1 : -1;
        const base = V(sx * B * 0.25, R + 0.4 * B, B * (0.2 - w * 0.35));
        const name = w === 0 ? `wing${side}` : `wing${side}${w + 1}`;
        b.bone(name, 'body', base);
        b.end(`${name}Tip`, name, base.clone().add(V(sx * B * 0.9, 0.25 * B, -B * 1.6)));
      }
    }
  }
  b.socket('head', 'head', V(0, R + 0.2 * B, hz + 0.1 * B));
  b.socket('mouth', 'head', V(0, R - 0.1 * B, hz + 0.6 * B));
  b.socket('chest', 'body', V(0, R + 0.1 * B, B * 0.5));
  b.socket('core', 'body', V(0, R, 0));
  b.socket('handL', kind === 'insect' && s.scythes ? 'foot0L' : 'mandL', b.ends.mandLTip!.at);
  b.socket('handR', kind === 'insect' && s.scythes ? 'foot0R' : 'mandR', b.ends.mandRTip!.at);
  b.socket('weapon', s.sting ? 'sting' : 'head', s.sting ? b.ends.stingTip!.at : V(0, R - 0.1 * B, hz + 0.7 * B));
  return b.build(R + B * 0.9, hz + B + B * 0.9 + ab * 2, R);
}

// ---------------------------------------------------------------------------
// Serpent
// ---------------------------------------------------------------------------

export interface SerpentShape {
  /** Whole length, metres. */
  length: number;
  /** Body radius at its thickest. */
  girth: number;
  /** Front segments that rear up, and how high the head rides (metres). */
  front?: number;
  rear?: number;
  rise?: number;
  /** Head length, share of length. */
  head?: number;
}

export function serpentRig(s: SerpentShape): CreatureRig {
  const L = s.length;
  const g = s.girth;
  const nf = s.front ?? 4;
  const nr = s.rear ?? 5;
  const rise = s.rise ?? 0.6;
  const b = new RigBuilder('serpent');
  // The body's middle rides on the floor; the front chain rears toward the head.
  b.bone('body', 'root', V(0, g, 0));
  const frontLen = L * 0.42;
  let prev = 'body';
  const frontAt: THREE.Vector3[] = [];
  for (let i = 1; i <= nf; i++) {
    const t = i / nf;
    const at = V(0, g + rise * Math.pow(t, 1.6), frontLen * t * (1 - 0.25 * t * rise));
    b.bone(`f${i}`, prev, at);
    frontAt.push(at);
    prev = `f${i}`;
  }
  const last = frontAt[frontAt.length - 1]!;
  const hl = (s.head ?? 0.09) * L;
  const head = last.clone().add(V(0, 0.02 * L, hl * 0.25));
  b.bone('head', prev, head);
  b.bone('jaw', 'head', head.clone().add(V(0, -g * 0.35, hl * 0.15)));
  b.end('snout', 'head', head.clone().add(V(0, -g * 0.1, hl)));
  prev = 'body';
  for (let i = 1; i <= nr; i++) {
    const t = i / nr;
    b.bone(`t${i}`, prev, V(0, g * (1 - 0.6 * t), -L * 0.5 * t));
    prev = `t${i}`;
  }
  b.end('tailTip', prev, V(0, g * 0.3, -L * 0.58));
  b.socket('head', 'head', head.clone().add(V(0, g * 0.4, hl * 0.3)));
  b.socket('mouth', 'jaw', head.clone().add(V(0, -g * 0.3, hl * 0.95)));
  b.socket('chest', `f${Math.max(1, nf - 1)}`, frontAt[Math.max(0, nf - 2)]!.clone().add(V(0, 0, g * 0.8)));
  b.socket('core', 'body', V(0, g, 0));
  b.socket('handL', 'head', head.clone().add(V(g * 0.6, 0, hl * 0.5)));
  b.socket('handR', 'head', head.clone().add(V(-g * 0.6, 0, hl * 0.5)));
  b.socket('weapon', 'jaw', head.clone().add(V(0, -g * 0.3, hl)));
  return b.build(head.y + g, L, g + rise * 0.5);
}

// ---------------------------------------------------------------------------
// Flyer
// ---------------------------------------------------------------------------

export interface FlyerShape {
  /** Body length (head to tail root), metres. */
  body: number;
  /** Height it hovers at (body centre). */
  hover: number;
  /** Full wingspan, metres. */
  span: number;
  /** Has arms as well as wings (succubus, djinn-like). */
  arms?: boolean;
  /** Upright torso (harpy, succubus) rather than horizontal (bat, wyvern). */
  upright?: boolean;
  tail?: number;
  tailLen?: number;
  /** Neck length, share of body. */
  neck?: number;
}

export function flyerRig(s: FlyerShape): CreatureRig {
  const B = s.body;
  const Y = s.hover;
  const span = s.span;
  const up = !!s.upright;
  const b = new RigBuilder('flyer');
  b.bone('body', 'root', V(0, Y, 0));
  const chest = up ? V(0, Y + B * 0.35, 0.02 * B) : V(0, Y + 0.05 * B, B * 0.3);
  b.bone('chest', 'body', chest);
  const nl = (s.neck ?? (up ? 0.12 : 0.25)) * B;
  const neck = up ? V(0, chest.y + B * 0.22, chest.z) : V(0, chest.y + 0.06 * B, chest.z + B * 0.2);
  b.bone('neck', 'chest', neck);
  const head = up ? V(0, neck.y + nl + 0.06 * B, neck.z + 0.02 * B) : V(0, neck.y + nl * 0.5, neck.z + nl);
  b.bone('head', 'neck', head);
  b.bone('jaw', 'head', head.clone().add(V(0, -0.06 * B, 0.07 * B)));
  const shoulder = up ? V(0, chest.y + B * 0.12, chest.z - 0.06 * B) : V(0, chest.y + 0.08 * B, chest.z - 0.02 * B);
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const base = shoulder.clone().add(V(sx * B * 0.14, 0, 0));
    const elbow = base.clone().add(V(sx * span * 0.17, span * 0.06, -0.04 * span));
    const wrist = base.clone().add(V(sx * span * 0.32, span * 0.02, -0.02 * span));
    b.bone(`wing${side}`, 'chest', base);
    b.bone(`wing${side}2`, `wing${side}`, elbow);
    b.bone(`wing${side}3`, `wing${side}2`, wrist);
    b.end(`wing${side}Tip`, `wing${side}3`, base.clone().add(V(sx * span * 0.5, -span * 0.02, -0.1 * span)));
    if (s.arms) {
      const sh = V(sx * B * 0.2, chest.y + B * 0.08, chest.z + 0.03 * B);
      const el = sh.clone().add(V(sx * 0.06 * B, -0.32 * B, 0.05 * B));
      const wr = el.clone().add(V(sx * 0.02 * B, -0.28 * B, 0.12 * B));
      b.bone(`arm${side}`, 'chest', sh);
      b.bone(`fore${side}`, `arm${side}`, el);
      b.bone(`hand${side}`, `fore${side}`, wr);
      b.end(`hand${side}Tip`, `hand${side}`, wr.clone().add(V(0, -0.1 * B, 0.05 * B)));
    }
    // Legs hang under the body, talons down.
    const hip = up ? V(sx * B * 0.12, Y - B * 0.1, 0) : V(sx * B * 0.12, Y - 0.05 * B, -B * 0.15);
    const knee = hip.clone().add(V(sx * 0.02 * B, -B * 0.28, 0.08 * B));
    const ankle = knee.clone().add(V(0, -B * 0.26, -0.06 * B));
    b.bone(`leg${side}`, 'body', hip);
    b.bone(`shin${side}`, `leg${side}`, knee);
    b.bone(`foot${side}`, `shin${side}`, ankle);
    b.end(`toe${side}`, `foot${side}`, ankle.clone().add(V(0, -0.06 * B, 0.08 * B)));
  }
  if (s.tail) {
    const n = s.tail;
    const len = (s.tailLen ?? 0.8) * B;
    let prev = 'body';
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      b.bone(`tail${i}`, prev, V(0, Y - (up ? B * 0.2 : 0) - t * 0.1 * B, -B * 0.25 - t * len));
      prev = `tail${i}`;
    }
    b.end('tailTip', prev, V(0, Y - 0.15 * B, -B * 0.25 - len * 1.15));
  }
  b.socket('head', 'head', head.clone().add(V(0, 0.08 * B, 0)));
  b.socket('mouth', 'jaw', head.clone().add(V(0, -0.06 * B, 0.15 * B)));
  b.socket('chest', 'chest', chest.clone().add(V(0, 0, 0.12 * B)));
  b.socket('core', 'body', V(0, Y, 0));
  if (s.arms) {
    b.socket('handL', 'handL', b.ends.handLTip!.at);
    b.socket('handR', 'handR', b.ends.handRTip!.at);
    b.socket('weapon', 'handR', b.ends.handRTip!.at);
  } else {
    b.socket('handL', 'footL', b.ends.toeL!.at);
    b.socket('handR', 'footR', b.ends.toeR!.at);
    b.socket('weapon', 'jaw', head.clone().add(V(0, -0.06 * B, 0.18 * B)));
  }
  return b.build(head.y + 0.15 * B, B * 1.6, Y);
}

// ---------------------------------------------------------------------------
// Specter: a floating torso over a trailing robe
// ---------------------------------------------------------------------------

export interface SpecterShape {
  /** Crown height when hovering, metres. */
  height: number;
  /** Arm length multiple. */
  arms?: number;
  /** Robe hem height above the floor (share of height). */
  hem?: number;
}

export function specterRig(s: SpecterShape): CreatureRig {
  const H = s.height;
  const arms = s.arms ?? 1.15;
  const b = new RigBuilder('specter');
  const hipY = H * 0.48;
  b.bone('hips', 'root', V(0, hipY, 0));
  b.bone('spine', 'hips', V(0, H * 0.6, 0.01 * H));
  b.bone('chest', 'spine', V(0, H * 0.72, 0.03 * H));
  b.bone('neck', 'chest', V(0, H * 0.84, 0.06 * H));
  b.bone('head', 'neck', V(0, H * 0.89, 0.09 * H));
  b.bone('jaw', 'head', V(0, H * 0.86, 0.12 * H));
  for (const side of ['L', 'R'] as const) {
    const sx = side === 'L' ? 1 : -1;
    const sh = V(sx * 0.13 * H, H * 0.8, 0.04 * H);
    const el = sh.clone().add(V(sx * 0.07 * H * arms, -0.15 * H * arms, 0.07 * H));
    const wr = el.clone().add(V(sx * 0.03 * H * arms, -0.14 * H * arms, 0.1 * H));
    b.bone(`arm${side}`, 'chest', sh);
    b.bone(`fore${side}`, `arm${side}`, el);
    b.bone(`hand${side}`, `fore${side}`, wr);
    b.end(`hand${side}Tip`, `hand${side}`, wr.clone().add(V(0, -0.08 * H, 0.05 * H)));
  }
  // Four robe chains hang from the hips: front, back, left, right.
  const hem = (s.hem ?? 0.06) * H;
  const dirs: Array<[string, number, number]> = [['F', 0, 1], ['B', 0, -1], ['L', 1, 0], ['R', -1, 0]];
  for (const [n, dx, dz] of dirs) {
    const r = 0.11 * H;
    const a = V(dx * r, hipY - 0.05 * H, dz * r);
    const m = V(dx * r * 1.35, (hipY + hem) * 0.5, dz * r * 1.35 - 0.04 * H);
    const e = V(dx * r * 1.6, hem, dz * r * 1.6 - 0.1 * H);
    b.bone(`robe${n}1`, 'hips', a);
    b.bone(`robe${n}2`, `robe${n}1`, m);
    b.end(`robe${n}Tip`, `robe${n}2`, e);
  }
  b.socket('head', 'head', V(0, H * 0.93, 0.1 * H));
  b.socket('mouth', 'jaw', V(0, H * 0.86, 0.16 * H));
  b.socket('chest', 'chest', V(0, H * 0.72, 0.13 * H));
  b.socket('core', 'chest', V(0, H * 0.68, 0.04 * H));
  b.socket('handL', 'handL', b.ends.handLTip!.at);
  b.socket('handR', 'handR', b.ends.handRTip!.at);
  b.socket('weapon', 'handR', b.ends.handRTip!.at);
  return b.build(H, 0.3 * H, hipY);
}

// ---------------------------------------------------------------------------
// Ooze, floater, swarm
// ---------------------------------------------------------------------------

export interface BlobShape {
  /** Height of the mass, metres. */
  height: number;
  /** Radius at the base. */
  radius: number;
  /** Lobes round the base. */
  lobes?: number;
  /** Pseudopods it strikes with. */
  pods?: boolean;
}

export function oozeRig(s: BlobShape): CreatureRig {
  const H = s.height;
  const R = s.radius;
  const n = s.lobes ?? 5;
  const b = new RigBuilder('ooze');
  b.bone('body', 'root', V(0, H * 0.32, 0));
  b.bone('top', 'body', V(0, H * 0.72, -0.02 * R));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    b.bone(`lobe${i}`, 'body', V(Math.sin(a) * R * 0.75, H * 0.14, Math.cos(a) * R * 0.75));
  }
  if (s.pods ?? true) {
    for (const side of ['L', 'R'] as const) {
      const sx = side === 'L' ? 1 : -1;
      const a = V(sx * R * 0.5, H * 0.55, R * 0.35);
      b.bone(`pod${side}`, 'body', a);
      b.bone(`pod${side}2`, `pod${side}`, a.clone().add(V(sx * R * 0.25, H * 0.05, R * 0.4)));
      b.end(`pod${side}Tip`, `pod${side}2`, a.clone().add(V(sx * R * 0.35, H * 0.02, R * 0.75)));
    }
  }
  b.socket('head', 'top', V(0, H * 0.95, 0));
  b.socket('mouth', 'top', V(0, H * 0.62, R * 0.8));
  b.socket('chest', 'body', V(0, H * 0.45, R * 0.85));
  b.socket('core', 'body', V(0, H * 0.4, 0));
  if (s.pods ?? true) {
    b.socket('handL', 'podL2', b.ends.podLTip!.at);
    b.socket('handR', 'podR2', b.ends.podRTip!.at);
    b.socket('weapon', 'podR2', b.ends.podRTip!.at);
  }
  return b.build(H, R * 2, H * 0.32);
}

export interface FloaterShape {
  /** Height of the core's centre above the floor. */
  hover: number;
  /** Core radius. */
  radius: number;
  /** Satellites orbiting the core. */
  orbs?: number;
  /** Hanging tendrils, and their segments. */
  tendrils?: number;
  segments?: number;
}

export function floaterRig(s: FloaterShape): CreatureRig {
  const Y = s.hover;
  const R = s.radius;
  const b = new RigBuilder('floater');
  b.bone('core', 'root', V(0, Y, 0));
  b.bone('eye', 'core', V(0, Y, R * 0.6));
  b.bone('crown', 'core', V(0, Y + R * 0.8, 0));
  for (let i = 0; i < (s.orbs ?? 0); i++) {
    const a = (i / (s.orbs ?? 1)) * Math.PI * 2;
    b.bone(`orb${i}`, 'core', V(Math.sin(a) * R * 1.8, Y + Math.cos(a * 2) * R * 0.3, Math.cos(a) * R * 1.8));
  }
  const nt = s.tendrils ?? 0;
  const seg = s.segments ?? 3;
  for (let i = 0; i < nt; i++) {
    const a = (i / Math.max(1, nt)) * Math.PI * 2 + 0.4;
    let prev = 'core';
    for (let k = 1; k <= seg; k++) {
      const t = k / seg;
      const at = V(Math.sin(a) * R * (0.55 + 0.35 * t), Y - R * 0.5 - (Y - R) * 0.85 * t, Math.cos(a) * R * (0.55 + 0.35 * t));
      b.bone(`ten${i}_${k}`, prev, at);
      prev = `ten${i}_${k}`;
    }
    b.end(`ten${i}Tip`, prev, V(Math.sin(a) * R, Math.max(0.05, Y - R * 0.5 - (Y - R) * 1.0), Math.cos(a) * R));
  }
  b.socket('head', 'crown', V(0, Y + R, 0));
  b.socket('mouth', 'eye', V(0, Y, R * 1.05));
  b.socket('chest', 'core', V(0, Y, R * 0.95));
  b.socket('core', 'core', V(0, Y, 0));
  b.socket('handL', 'core', V(R * 0.9, Y, R * 0.3));
  b.socket('handR', 'core', V(-R * 0.9, Y, R * 0.3));
  b.socket('weapon', 'eye', V(0, Y, R * 1.1));
  return b.build(Y + R, R * 2, Y);
}

export function swarmRig(s: { hover: number; radius: number; motes: number }): CreatureRig {
  const b = new RigBuilder('swarm');
  b.bone('core', 'root', V(0, s.hover, 0));
  for (let i = 0; i < s.motes; i++) {
    const a = i * 2.39996;
    const r = s.radius * (0.4 + 0.6 * ((i * 0.618) % 1));
    b.bone(`mote${i}`, 'core', V(Math.sin(a) * r, s.hover + Math.sin(i * 1.7) * s.radius * 0.5, Math.cos(a) * r));
  }
  for (const n of CREATURE_SOCKETS) b.socket(n, 'core', V(0, s.hover, n === 'mouth' || n === 'weapon' ? s.radius * 0.5 : 0));
  return b.build(s.hover + s.radius, s.radius * 2, s.hover);
}
