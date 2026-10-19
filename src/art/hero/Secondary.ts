/**
 * SLAY — things that hang off the hero and swing after it: the cape, long
 * hair and the hem of a robe.
 *
 * The cape's bone chain (`Cape.ts`) hangs under the chest. Each bone is a
 * damped spring toward an angle that keeps the cloth hanging under gravity
 * while the chest leans, trails it back when the body runs or speeds up,
 * throws it aside on a turn, and keeps it off the heels. Lower bones are
 * softer and flutter at speed.
 */
import type * as THREE from 'three';

export interface SwingInput {
  /** Forward and sideways (+ left) ground speed, m/s, character space. */
  fwd: number;
  side: number;
  /** Forward acceleration, m/s². */
  accel: number;
  /** Turn rate, rad/s (+ left). */
  yawRate: number;
  /** Chest lean forward and tip right, radians, world. */
  pitch: number;
  roll: number;
  /** How far back the legs reach right now, radians of thigh swing. */
  legBack: number;
  /** Bounce of the body, m/s vertical. */
  vy: number;
}

/** How far the cape hangs out from the back at rest, radians at the shoulders. */
const REST_TILT = 0.14;

export class CapeSpring {
  private ax: Float32Array;
  private vx: Float32Array;
  private az: Float32Array;
  private vz: Float32Array;
  private t = 0;

  constructor(readonly bones: THREE.Bone[]) {
    const n = bones.length;
    this.ax = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.az = new Float32Array(n);
    this.vz = new Float32Array(n);
  }

  update(dt: number, inp: SwingInput): void {
    if (dt <= 0) return;
    this.t += dt;
    const n = this.bones.length;
    const speed = Math.hypot(inp.fwd, inp.side);
    for (let i = 0; i < n; i++) {
      const k = i / Math.max(1, n - 1);
      // Bone 0 is relative to the chest; its children relative to it, so a
      // share of the total angle goes on each.
      const share = i === 0 ? 1 : 0.25;
      // Lean forward turns the chest's down axis back, so cancelling it is
      // minus the pitch. (It was plus: the lean doubled, and a running cape
      // rose past level and streamed out flat like a banner.)
      let tx = i === 0 ? -inp.pitch : 0;
      tx += (0.05 * Math.max(0, inp.fwd) + 0.04 * Math.min(8, Math.max(0, inp.accel))) * share * (0.7 + k);
      if (i === 0) tx += Math.min(1, Math.max(0, inp.legBack)) * 0.15;
      // Standing still it hangs a touch out from the back, clear of the
      // shoulder blades and the arms held out with weapons. (Straight down,
      // the body showed through it at rest; moving, the stride already did this.)
      if (i === 0) tx += REST_TILT;
      tx -= inp.vy * 0.05 * k;
      // Flutter: a fast ripple down the cloth, stronger toward the hem.
      tx += Math.sin(this.t * (6 + 2 * speed) - i * 1.3) * 0.025 * Math.min(1, speed / 3) * k;
      let tz = (i === 0 ? -inp.roll : 0) - (0.06 * inp.side + 0.05 * inp.yawRate) * share;
      tz = Math.max(-0.5, Math.min(0.5, tz));
      tx = Math.max(i === 0 ? -0.1 : -0.25, Math.min(i === 0 ? 0.9 : 0.35, tx));
      const stiff = 70 - 35 * k;
      const damp = 2 * Math.sqrt(stiff) * 0.55;
      this.vx[i]! += (stiff * (tx - this.ax[i]!) - damp * this.vx[i]!) * dt;
      this.vz[i]! += (stiff * (tz - this.az[i]!) - damp * this.vz[i]!) * dt;
      this.ax[i]! += this.vx[i]! * dt;
      this.az[i]! += this.vz[i]! * dt;
      this.bones[i]!.rotation.set(this.ax[i]!, 0, this.az[i]!);
    }
  }
}

/** How a hanging chain moves: its springs, what pushes it, how far it may go. */
export interface SwingFeel {
  /** Spring stiffness at the top; the tip is `soften` of it softer. */
  stiff: number;
  soften: number;
  /** Damping as a share of critical. */
  damp: number;
  /** Share of the parent's tilt the top undoes: 1 hangs plumb, 0 rides with it. */
  plumb: number;
  /** Trailing back per m/s forward and per m/s² of speeding up. */
  drag: number;
  surge: number;
  /** Swing aside per m/s sideways and per rad/s of turn. */
  sway: number;
  turn: number;
  /** Lift on a bounce, per m/s up. */
  bob: number;
  /** Ripple at speed, radians at the tip. */
  flutter: number;
  /** Tilt back from the parent at rest, at the top. */
  rest: number;
  /** Swing limits: back and forward at the top, and below it, and aside. */
  topBack: number;
  topFore: number;
  back: number;
  fore: number;
  aside: number;
}

export const SWING_FEEL: Record<'hair' | 'robe', SwingFeel> = {
  // Light and quick: trails a run, flicks on a turn, settles in a breath.
  hair: { stiff: 55, soften: 0.45, damp: 0.5, plumb: 0.55, drag: 0.06, surge: 0.035, sway: 0.06, turn: 0.07, bob: 0.06, flutter: 0.03, rest: 0.05, topBack: 0.7, topFore: -0.12, back: 0.3, fore: -0.1, aside: 0.35 },
  // Heavy cloth: a slower, smaller swing that never lifts far off the legs.
  robe: { stiff: 48, soften: 0.35, damp: 0.6, plumb: 0.6, drag: 0.045, surge: 0.03, sway: 0.05, turn: 0.04, bob: 0.03, flutter: 0.012, rest: 0, topBack: 0.35, topFore: -0.15, back: 0.15, fore: -0.08, aside: 0.2 },
};

/**
 * A hanging chain (`Swing.ts`) as damped springs, like the cape's: each
 * bone springs toward an angle that keeps it hanging while its parent tilts,
 * trails it on a run and throws it aside on a turn. `pitch` and `roll` in
 * the input are the parent bone's.
 */
export class SwingChain {
  private ax: Float32Array;
  private vx: Float32Array;
  private az: Float32Array;
  private vz: Float32Array;
  private t = 0;

  constructor(readonly bones: THREE.Bone[], private feel: SwingFeel) {
    const n = bones.length;
    this.ax = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.az = new Float32Array(n);
    this.vz = new Float32Array(n);
  }

  update(dt: number, inp: SwingInput): void {
    if (dt <= 0) return;
    // A long hitch would throw the springs: step at most a thirtieth at a time.
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    const f = this.feel;
    const n = this.bones.length;
    const speed = Math.hypot(inp.fwd, inp.side);
    for (let i = 0; i < n; i++) {
      const k = i / Math.max(1, n - 1);
      const top = i === 0;
      const share = top ? 1 : 0.3;
      let tx = top ? f.rest - f.plumb * inp.pitch : 0;
      tx += (f.drag * Math.max(0, inp.fwd) + f.surge * Math.min(8, Math.max(0, inp.accel))) * share * (0.7 + k);
      tx -= inp.vy * f.bob * k;
      tx += Math.sin(this.t * (7 + 2 * speed) - i * 1.4) * f.flutter * Math.min(1, speed / 3) * k;
      let tz = (top ? -f.plumb * inp.roll : 0) - (f.sway * inp.side + f.turn * inp.yawRate) * share;
      tz = Math.max(-f.aside, Math.min(f.aside, tz));
      tx = Math.max(top ? f.topFore : f.fore, Math.min(top ? f.topBack : f.back, tx));
      const stiff = f.stiff * (1 - f.soften * k);
      const damp = 2 * Math.sqrt(stiff) * f.damp;
      this.vx[i]! += (stiff * (tx - this.ax[i]!) - damp * this.vx[i]!) * dt;
      this.vz[i]! += (stiff * (tz - this.az[i]!) - damp * this.vz[i]!) * dt;
      this.ax[i]! += this.vx[i]! * dt;
      this.az[i]! += this.vz[i]! * dt;
      this.bones[i]!.rotation.set(this.ax[i]!, 0, this.az[i]!);
    }
  }
}
