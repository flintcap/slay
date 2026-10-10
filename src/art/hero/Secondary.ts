/**
 * SLAY — things that hang off the hero and swing after it: the cape.
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
      const share = i === 0 ? 1 : 0.35;
      let tx = i === 0 ? inp.pitch : 0;
      tx += (0.05 * Math.max(0, inp.fwd) + 0.04 * Math.min(8, Math.max(0, inp.accel))) * share * (0.7 + k);
      tx += Math.max(0, inp.legBack) * (i === 0 ? 0.15 : 0.05);
      tx -= inp.vy * 0.05 * k;
      // Flutter: a fast ripple down the cloth, stronger toward the hem.
      tx += Math.sin(this.t * (6 + 2 * speed) - i * 1.3) * 0.025 * Math.min(1, speed / 3) * k;
      let tz = (i === 0 ? -inp.roll : 0) - (0.06 * inp.side + 0.05 * inp.yawRate) * share;
      tz = Math.max(-0.5, Math.min(0.5, tz));
      tx = Math.max(i === 0 ? -0.1 : -0.25, Math.min(i === 0 ? 1.2 : 0.6, tx));
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
