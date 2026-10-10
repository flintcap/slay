/**
 * SLAY — where the hero's feet go.
 *
 * Feet live on the floor in world space. A planted foot does not move until
 * it lifts, whatever the body does above it, so nothing slides: the legs are
 * solved onto the feet afterwards. Two ways a foot lifts:
 *
 * - Moving: one gait cycle drives both feet half a cycle apart. Cadence and
 *   the share of the cycle a foot spends on the ground come from the real
 *   ground speed, so the stride is the distance actually travelled. A
 *   swinging foot aims at where the body will be when it lands, half a stance
 *   ahead, so it lands under the hip and leaves behind it.
 * - Standing: a foot steps when it is too far from where the stance wants it
 *   or turned too far from the body (turn in place, stopping, a shove). One
 *   foot at a time, the worse one first.
 */
const TAU = Math.PI * 2;

export interface GaitBody {
  /** Hip-to-ankle length, metres. */
  legLen: number;
  /** Bind ankle height above the floor. */
  ankleY: number;
  /** Ball-of-foot and heel contact points, forward of the ankle, metres. */
  ballZ: number;
  heelZ: number;
}

export interface Foot {
  /** Ground point under the ankle, world XZ, and the foot's heading. */
  x: number;
  z: number;
  yaw: number;
  planted: boolean;
  /** Toes down positive (heel up, rolling over the ball); toes up negative. */
  pitch: number;
  /** Ankle height above its flat-foot height. */
  lift: number;
  // Swing.
  sx: number;
  sz: number;
  syaw: number;
  spitch: number;
  s: number;
  dur: number;
  /** Swing driven by the gait phase (moving) or by its own clock (a step). */
  phased: boolean;
  dutyAtLift: number;
  prevPhi: number;
  /** Seconds since this foot last landed. */
  since: number;
  /** An action's step: where this swing lands instead of the stance spot, and how high it lifts. */
  goal: { x: number; z: number; yaw: number; height: number } | null;
}

export interface GaitInput {
  /** Body position (world XZ), heading, and velocity (world XZ). */
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  yawRate: number;
  /** Where each foot stands relative to the body when still, character space [L, R]. */
  stance: [{ x: number; z: number; yaw: number }, { x: number; z: number; yaw: number }];
  /** No steps at all (rooted). */
  rooted: boolean;
  /** No new standing steps (an action owns the feet). */
  hold: boolean;
}

function newFoot(): Foot {
  return {
    x: 0,
    z: 0,
    yaw: 0,
    planted: true,
    pitch: 0,
    lift: 0,
    sx: 0,
    sz: 0,
    syaw: 0,
    spitch: 0,
    s: 1,
    dur: 0.3,
    phased: false,
    dutyAtLift: 0.6,
    prevPhi: 0,
    since: 9,
    goal: null,
  };
}

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export class Gait {
  readonly feet: [Foot, Foot] = [newFoot(), newFoot()];
  /** 0..1, left heel strike at 0, right at 0.5. */
  phase = 0;
  moving = false;
  /** 0 standing .. 1 in full stride, eased. */
  moveW = 0;
  /** 0 walking .. 1 running, eased. */
  runW = 0;
  /** Cycles per second right now. */
  freq = 1;
  /** Share of the cycle a foot is down. */
  duty = 0.6;
  speed = 0;
  /** Set when a foot lands, for the step event. Cleared by the reader. */
  landed: Array<'L' | 'R'> = [];
  /** Small settling steps still allowed after stopping. */
  private settle = 0;
  private placed = false;

  constructor(readonly body: GaitBody) {}

  /** Puts both feet where the stance wants them, planted. */
  place(inp: GaitInput): void {
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i]!;
      const d = this.desired(inp, i, 0);
      f.x = d.x;
      f.z = d.z;
      f.yaw = d.yaw;
      f.planted = true;
      f.pitch = 0;
      f.lift = 0;
      f.s = 1;
    }
    this.moving = false;
    this.moveW = 0;
    this.placed = true;
  }

  /** Cadence for a ground speed, scaled to leg length (long legs stride slower). */
  cadence(v: number): number {
    const k = Math.sqrt(0.88 / this.body.legLen);
    return Math.min(2.6, Math.max(0.75, (0.8 + 0.3 * v) * k));
  }

  /** Where foot `i` should stand, `ahead` seconds from now, world. */
  private desired(inp: GaitInput, i: number, ahead: number, lead = 0): { x: number; z: number; yaw: number } {
    const st = inp.stance[i]!;
    const yaw = inp.yaw + Math.max(-0.7, Math.min(0.7, inp.yawRate * ahead));
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const narrow = 1 - 0.45 * this.runW * this.moveW;
    const lx = st.x * narrow;
    const lz = st.z * (1 - this.moveW);
    return {
      x: inp.x + inp.vx * (ahead + lead) + lx * c + lz * s,
      z: inp.z + inp.vz * (ahead + lead) - lx * s + lz * c,
      yaw: yaw + st.yaw,
    };
  }

  update(dt: number, inp: GaitInput): void {
    if (!this.placed) this.place(inp);
    const speed = Math.hypot(inp.vx, inp.vz);
    this.speed = speed;
    // Hysteresis: start at a real walk, stop only when nearly still.
    if (!this.moving && speed > 0.45 && !inp.rooted) this.start(inp);
    else if (this.moving && (speed < 0.22 || inp.rooted)) this.stop();

    const runTarget = smooth((speed - 2.2) / 1.4);
    this.runW += (runTarget - this.runW) * Math.min(1, dt * 5);
    const moveTarget = this.moving ? Math.min(1, speed / 1.2) : 0;
    this.moveW += (moveTarget - this.moveW) * Math.min(1, dt * 8);
    this.duty = lerp(0.6, 0.36, this.runW);
    this.freq = this.cadence(speed);
    if (this.moving) this.phase = (this.phase + this.freq * dt) % 1;

    for (let i = 0; i < 2; i++) {
      const f = this.feet[i]!;
      f.since += dt;
      if (this.moving) this.stepPhased(f, i, inp);
      if (!f.planted && !f.phased) this.stepClock(f, i, dt, inp);
    }
    if (!this.moving && !inp.rooted && !inp.hold) this.standingSteps(inp);
  }

  private start(inp: GaitInput): void {
    this.moving = true;
    // The foot to lift first: one already stepping, else the one further
    // behind along the direction of travel.
    let k = -1;
    for (let i = 0; i < 2; i++) if (!this.feet[i]!.planted) k = i;
    const dx = inp.vx;
    const dz = inp.vz;
    const along = (f: Foot) => (f.x - inp.x) * dx + (f.z - inp.z) * dz;
    if (k < 0) k = along(this.feet[0]) < along(this.feet[1]) ? 0 : 1;
    const f = this.feet[k]!;
    const duty = 0.6;
    const s = f.planted ? 0 : f.s;
    this.phase = (((duty + s * (1 - duty) - 0.5 * k) % 1) + 1) % 1;
    for (let i = 0; i < 2; i++) {
      const g = this.feet[i]!;
      g.prevPhi = (this.phase + 0.5 * i) % 1 - 1e-4;
      if (!g.planted) {
        g.phased = true;
        g.dutyAtLift = duty;
      }
    }
  }

  private stop(): void {
    this.moving = false;
    this.settle = 3;
    for (const f of this.feet) {
      if (f.planted) continue;
      // Finish the swing on its own clock, toward the standing spot.
      f.phased = false;
      f.dur = Math.max(0.12, ((1 - f.dutyAtLift) / this.freq) * 0.9);
    }
  }

  private stepPhased(f: Foot, i: number, inp: GaitInput): void {
    const phi = (this.phase + 0.5 * i) % 1;
    const prev = f.prevPhi;
    f.prevPhi = phi;
    const wrapped = phi < prev - 0.5;
    const duty = this.duty;
    if (f.planted) {
      // Lift-off: the foot's share of the cycle on the ground is spent.
      // (Lifting at the phase it actually leaves at keeps the swing from
      // jumping when the duty shrinks under a planted foot.)
      if (phi >= duty && phi < 0.985 && f.since > 0.05) this.lift(f, true, phi);
      else {
        // Rolling over the planted foot: heel strike down to flat, then up onto the ball.
        const q = Math.min(1, phi / duty);
        const pLand = lerp(-0.26, -0.06, this.runW);
        const qh = lerp(0.6, 0.48, this.runW);
        const pToe = lerp(0.55, 0.75, this.runW);
        if (q < 0.15) f.pitch = lerp(pLand, 0, smooth(q / 0.15));
        else if (q < qh) f.pitch = 0;
        else {
          const t = (q - qh) / (1 - qh);
          f.pitch = pToe * t * t;
        }
        f.pitch *= this.moveW;
      }
      return;
    }
    if (!f.phased) return;
    // In the air: progress from lift-off to the next heel strike.
    const s = wrapped ? 1 : Math.min(1, Math.max(f.s, (phi - f.dutyAtLift) / (1 - f.dutyAtLift)));
    f.s = s;
    const tLand = ((1 - s) * (1 - f.dutyAtLift)) / this.freq;
    const lead = (duty / this.freq) * 0.5;
    const d = this.desired(inp, i, tLand, lead);
    this.swingTo(f, d, s, true);
    if (s >= 1) this.land(f, i);
  }

  private stepClock(f: Foot, i: number, dt: number, inp: GaitInput): void {
    f.s = Math.min(1, f.s + dt / Math.max(0.05, f.dur));
    const d = f.goal ?? this.desired(inp, i, 0);
    this.swingTo(f, d, f.s, false, f.goal?.height);
    if (f.s >= 1) this.land(f, i);
  }

  private lift(f: Foot, phased: boolean, duty: number): void {
    f.planted = false;
    f.phased = phased;
    f.sx = f.x;
    f.sz = f.z;
    f.syaw = f.yaw;
    f.spitch = f.pitch;
    f.s = 0;
    f.dutyAtLift = duty;
  }

  private swingTo(f: Foot, d: { x: number; z: number; yaw: number }, s: number, stride: boolean, height?: number): void {
    const run = stride ? this.runW : 0;
    const e = smooth(run > 0 ? Math.pow(s, 1 + 0.35 * run) : s);
    f.x = lerp(f.sx, d.x, e);
    f.z = lerp(f.sz, d.z, e);
    f.yaw = f.syaw + wrapAngle(d.yaw - f.syaw) * e;
    const dist = Math.hypot(d.x - f.sx, d.z - f.sz);
    const L = this.body.legLen;
    if (stride) {
      const walkH = 0.1 * L * Math.min(1.2, 0.4 + dist / (0.7 * L));
      const runH = 0.28 * L;
      const h = lerp(walkH, runH, run);
      const prof = lerp(Math.sin(Math.PI * Math.pow(s, 0.85)), Math.sin(Math.PI * s) * (1.3 - 0.6 * s), run);
      f.lift = h * Math.max(0, prof);
      const pLand = lerp(-0.26, -0.06, this.runW) * this.moveW;
      f.pitch = f.spitch * (1 - smooth(Math.min(1, s / 0.45))) + pLand * smooth(s);
    } else {
      // A shuffle: low, quick, the foot barely leaves the floor. An action's
      // stamp lifts it high and drives it down late.
      const h = height ?? Math.min(0.09 * L, 0.04 * L + dist * 0.25);
      f.lift = h * Math.sin(Math.PI * s);
      f.pitch = f.spitch * (1 - smooth(Math.min(1, s / 0.4))) + 0.12 * Math.sin(Math.PI * s);
    }
  }

  private land(f: Foot, i: number): void {
    f.planted = true;
    f.phased = false;
    f.lift = 0;
    f.s = 1;
    f.since = 0;
    f.goal = null;
    this.landed.push(i === 0 ? 'L' : 'R');
  }

  private standingSteps(inp: GaitInput): void {
    if (!this.feet[0].planted || !this.feet[1].planted) return;
    const L = this.body.legLen;
    let best = -1;
    let bestErr = 0;
    let bestDur = 0.3;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i]!;
      if (f.since < 0.08) continue;
      const d = this.desired(inp, i, 0);
      const err = Math.hypot(d.x - f.x, d.z - f.z);
      const yawErr = Math.abs(wrapAngle(d.yaw - f.yaw));
      const limit = this.settle > 0 ? 0.06 * L : 0.2 * L;
      if (err < limit && yawErr < 0.6) continue;
      const score = err / L + yawErr * 0.4;
      if (score > bestErr) {
        bestErr = score;
        best = i;
        bestDur = yawErr > 1.2 ? 0.2 : 0.24 + Math.min(0.16, err * 0.4);
      }
    }
    if (best < 0) {
      if (this.feet[0].since > 0.5 && this.feet[1].since > 0.5) this.settle = 0;
      return;
    }
    const f = this.feet[best]!;
    this.lift(f, false, this.duty);
    f.dur = bestDur;
    if (this.settle > 0) this.settle--;
  }

  /**
   * An action moves foot `i`: `dx`, `dz` metres from its stance spot
   * (character space, + left and forward), over `dur` seconds, lifted
   * `height` metres at the top. Lands planted like any step.
   */
  actionStep(i: number, inp: GaitInput, dx: number, dz: number, dur: number, height: number): void {
    const f = this.feet[i]!;
    const d = this.desired(inp, i, 0);
    const c = Math.cos(inp.yaw);
    const s = Math.sin(inp.yaw);
    if (!f.planted) this.land(f, i);
    this.lift(f, false, this.duty);
    f.dur = Math.max(0.06, dur);
    f.goal = { x: d.x + dx * c + dz * s, z: d.z - dx * s + dz * c, yaw: d.yaw, height };
  }

  /** Re-places both feet under the body, planted (while the legs are not on IK). */
  follow(inp: GaitInput): void {
    this.place(inp);
  }

  /** Mean heading of the feet, relative to `yaw`. */
  footTwist(yaw: number): number {
    return wrapAngle((wrapAngle(this.feet[0].yaw - yaw) + wrapAngle(this.feet[1].yaw - yaw)) * 0.5);
  }
}

export { wrapAngle };
