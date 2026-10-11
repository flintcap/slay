/**
 * SLAY — what a creature's motion is made of: its style, and the pose it is
 * written into each frame.
 *
 * A pose is plain numbers: three angles per bone (deltas from the bind pose,
 * applied as an XYZ Euler), a position offset per bone, and a whole-body
 * transform on the root (lift, sink, tip, roll) for spawns and deaths. Layers
 * add, so a flinch laid over a stride is arithmetic.
 *
 * Angle conventions follow from every bone's identity bind rotation:
 *  - x on a bone pointing up (spine, neck, head) bends it forward; on a bone
 *    pointing down (arm, leg) it swings it backward; on a jaw it opens it.
 *  - z on a left limb raises it out to the side (use -z on the right; the
 *    helpers mirror with the side sign).
 *  - y turns: the trunk toward the creature's left.
 */
export type AttackKind =
  | 'chop' // overhead blow down onto the target
  | 'swing' // flat sweep across
  | 'thrust' // straight stab or punch
  | 'slam' // both arms brought down together
  | 'claw' // a raking swipe, then the other hand
  | 'bite' // head darts in, jaw snaps
  | 'gore' // head down, horns up through the target
  | 'stomp' // a foot comes down
  | 'sting' // tail or abdomen strikes forward over the body
  | 'lunge' // the whole body springs at the target
  | 'shoot' // draw and loose (bows, crossbows)
  | 'hurl' // throw overhand (bombs, spit)
  | 'lash' // whip or tendril crack
  | 'engulf'; // a mass surges forward and over

export type SpawnKind = 'rise' | 'drop' | 'swoop' | 'form' | 'emerge' | 'assemble';
export type DeathKind = 'collapse' | 'topple' | 'flip' | 'flop' | 'crash' | 'fade' | 'splat' | 'scatter' | 'coil';
export type IdleKind = 'still' | 'twitch' | 'sway' | 'jitter' | 'prowl' | 'hover' | 'breathe';
export type GaitKind = 'walk' | 'march' | 'shamble' | 'lope' | 'scuttle' | 'lumber' | 'stalk' | 'hop' | 'glide' | 'slither' | 'roll';

export interface MotionStyle {
  /** 0 light and quick .. 1 colossal: slows strides, deepens the bob, lengthens recovery. */
  heavy: number;
  /** Attack moves it picks between, in turn. */
  attacks: AttackKind[];
  /** A wind-up with no strike after it is a shot or a throw that releases at its end. */
  ranged?: boolean;
  /** Casts with both hands (true) or the off hand. */
  castBoth?: boolean;
  spawn: SpawnKind;
  death: DeathKind;
  idle: IdleKind;
  gait: GaitKind;
  /** Stride length as a multiple of leg length (default by gait). */
  stride?: number;
  /** Holds a weapon in the right hand (shapes the guard and the moves). */
  armed?: 'one' | 'two' | 'bow' | 'crossbow' | 'staff' | 'none';
}

export const STYLE_DEFAULT: MotionStyle = {
  heavy: 0.3,
  attacks: ['swing', 'chop'],
  spawn: 'rise',
  death: 'collapse',
  idle: 'breathe',
  gait: 'walk',
  armed: 'none',
};

/** A frame's pose, as deltas from bind. */
export class PoseBuf {
  readonly rot: Float32Array;
  readonly pos: Float32Array;
  /** Root (whole body) offset and tilt: x y z, then pitch yaw roll. */
  readonly body = new Float32Array(6);
  /** Whole-body squash (y) and spread (xz), multipliers around 1. */
  squash = 1;
  spread = 1;
  constructor(readonly n: number) {
    this.rot = new Float32Array(n * 3);
    this.pos = new Float32Array(n * 3);
  }
  clear(): void {
    this.rot.fill(0);
    this.pos.fill(0);
    this.body.fill(0);
    this.squash = 1;
    this.spread = 1;
  }
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (t: number): number => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
/** 0 → 1 over [a, b]. */
export const ramp = (t: number, a: number, b: number): number => smooth((t - a) / (b - a));
/** Rises over [a, b], holds, falls over [c, d]. */
export const pulse = (t: number, a: number, b: number, c: number, d: number): number => ramp(t, a, b) * (1 - ramp(t, c, d));
/** Keyframes [t, v], smoothstep between them. */
export function kf(t: number, keys: ReadonlyArray<readonly [number, number]>): number {
  if (t <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]!;
    if (t <= t1) {
      const [t0, v0] = keys[i - 1]!;
      return v0 + (v1 - v0) * smooth((t - t0) / Math.max(1e-6, t1 - t0));
    }
  }
  return keys[keys.length - 1]![1];
}
/** A damped overshoot after an impact at `at`: 0 before, a decaying wobble after. */
export function settle(t: number, at: number, freq = 18, decay = 9): number {
  if (t < at) return 0;
  const u = t - at;
  return Math.exp(-u * decay) * Math.sin(u * freq);
}
