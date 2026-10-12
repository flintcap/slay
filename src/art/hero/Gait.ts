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
  /** Seconds the body has been nearly still while still striding. */
  private slowT = 0;
  /** In a snap turn: the feet swing round with the hips. */
  private spinning = false;
  private lastX = 0;
  private lastZ = 0;
  /** Ground acceleration, smoothed, world XZ. */
  private ax = 0;
  private az = 0;
  private lvx = 0;
  private lvz = 0;
  private lastYaw = 0;

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
    this.lastYaw = inp.yaw;
    this.lastX = inp.x;
    this.lastZ = inp.z;
  }

  /**
   * Cadence for a ground speed, scaled to leg length (long legs stride
   * slower). A run quickens more than a walk: short, quick steps, the speed
   * from the beat rather than from reaching (a long stride at running speed
   * read as the legs splayed fore and aft).
   */
  cadence(v: number): number {
    const k = Math.sqrt(0.88 / this.body.legLen);
    return Math.min(3.6, Math.max(0.75, (0.9 + 0.3 * v + 0.3 * Math.max(0, v - 2)) * k));
  }

  /** Where foot `i` should stand, `ahead` seconds from now, world. */
  private desired(inp: GaitInput, i: number, ahead: number, lead = 0): { x: number; z: number; yaw: number } {
    const st = inp.stance[i]!;
    // Ahead of a curve the foot turns to where the body will face. Not in a
    // snap turn: the feet already swing round with the hips there, and the
    // guess overshot the end of the turn, a foot thrown out to the side.
    const yaw = inp.yaw + (this.spinning ? 0 : Math.max(-0.7, Math.min(0.7, inp.yawRate * ahead)));
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // Moving, the feet come in to a narrow track near the centre line, about
    // a foot's width apart walking and closer running, whatever the stance
    // stood at: a wide fighting stance carried into the stride read as a
    // straddle. The toe-out mostly goes too.
    const side = i === 0 ? 1 : -1;
    const track = side * this.body.legLen * lerp(0.06, 0.034, this.runW);
    const lx = lerp(st.x, track, this.moveW);
    const lz = st.z * (1 - this.moveW);
    // Braking or speeding up bends the path the body takes to the landing:
    // the velocity eases toward where it is heading (as the mover's does),
    // so a reversal lands the foot near the hip, not out along the old line.
    const r = 10;
    let tx = inp.vx + this.ax / r;
    let tz = inp.vz + this.az / r;
    const cap = Math.max(this.speed, 6);
    const tm = Math.hypot(tx, tz);
    if (tm > cap) {
      tx *= cap / tm;
      tz *= cap / tm;
    }
    const t = Math.min(ahead, 0.3);
    const ease = (1 - Math.exp(-r * t)) / r;
    let mx = tx * t + (inp.vx - tx) * ease + inp.vx * (ahead - t + lead);
    let mz = tz * t + (inp.vz - tz) * ease + inp.vz * (ahead - t + lead);
    if (this.spinning) {
      // Mid snap turn the feet ride sideways with the body (see update), so
      // they aim along the new heading only.
      const fw = mx * s + mz * c;
      mx = fw * s;
      mz = fw * c;
    }
    return {
      x: inp.x + mx + lx * c + lz * s,
      z: inp.z + mz - lx * s + lz * c,
      yaw: yaw + st.yaw * (1 - 0.7 * this.moveW),
    };
  }

  update(dt: number, inp: GaitInput): void {
    if (!this.placed) this.place(inp);
    const speed = Math.hypot(inp.vx, inp.vz);
    this.speed = speed;
    // Where the body is heading next: a reversal brakes hard, and a foot
    // aimed by the old velocity alone landed far out along the old line.
    if (dt > 0) {
      const k = Math.min(1, dt * 20);
      this.ax += ((inp.vx - this.lvx) / dt - this.ax) * k;
      this.az += ((inp.vz - this.lvz) / dt - this.az) * k;
    }
    this.lvx = inp.vx;
    this.lvz = inp.vz;
    // Hysteresis: start at a real walk, stop only when nearly still, and
    // still for a moment: a reversal passes through zero speed, and stopping
    // there dropped a swinging foot mid stride.
    this.slowT = this.moving && speed < 0.22 ? this.slowT + dt : 0;
    if (!this.moving && speed > 0.45 && !inp.rooted) this.start(inp);
    else if (this.moving && (this.slowT > 0.12 || inp.rooted)) this.stop();

    const runTarget = smooth((speed - 2.2) / 1.4);
    // Quick into a run, slow out of it: a body that has already sped up
    // with the feet still on a walking beat leaves a foot planted far
    // behind (a lunge on every start).
    this.runW += (runTarget - this.runW) * Math.min(1, dt * (runTarget > this.runW ? 10 : 5));
    const moveTarget = this.moving ? Math.min(1, speed / 1.2) : 0;
    this.moveW += (moveTarget - this.moveW) * Math.min(1, dt * 8);
    // Running, each foot stays down a good share of the beat: a short float,
    // grounded rather than bounding.
    this.duty = lerp(0.58, 0.42, this.runW);
    this.freq = this.cadence(speed);
    if (this.moving) this.phase = (this.phase + this.freq * dt) % 1;

    // A snap turn on the move (a reversal, a hard cut sideways) swings the
    // feet round with the hips, as a game hero's legs do, instead of leaving
    // them planted along the old line: the body pivoted over them and the
    // legs did the splits. Slow curves keep their planted feet.
    const dyaw = wrapAngle(inp.yaw - this.lastYaw);
    this.lastYaw = inp.yaw;
    // Once a snap turn starts, the feet go round with it to the end: let go
    // part way, the tail of the turn swung the hips past planted feet and
    // left them out to the side.
    const rate = dt > 0 ? Math.abs(dyaw) / dt : 0;
    if (!this.moving || rate < 1.5) this.spinning = false;
    else if (rate > 5) this.spinning = true;
    if (this.spinning) {
      this.swivel(inp.x, inp.z, dyaw);
      // Mid turn the body still slides along its old line, across its new
      // heading: the feet ride along sideways rather than being left wide.
      const rx = Math.cos(inp.yaw);
      const rz = -Math.sin(inp.yaw);
      const side = (inp.x - this.lastX) * rx + (inp.z - this.lastZ) * rz;
      for (const f of this.feet) {
        f.x += rx * side;
        f.z += rz * side;
        f.sx += rx * side;
        f.sz += rz * side;
      }
    }
    this.lastX = inp.x;
    this.lastZ = inp.z;

    for (let i = 0; i < 2; i++) {
      const f = this.feet[i]!;
      f.since += dt;
      if (this.moving) this.stepPhased(f, i, inp);
      if (!f.planted && !f.phased) this.stepClock(f, i, dt, inp);
    }
    if (!this.moving && !inp.rooted && !inp.hold) this.standingSteps(inp);
  }

  /** Turns both feet (and their swing starts) by `a` about the body. */
  private swivel(cx: number, cz: number, a: number): void {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const turn = (x: number, z: number): [number, number] => {
      const dx = x - cx;
      const dz = z - cz;
      return [cx + dx * c + dz * s, cz - dx * s + dz * c];
    };
    for (const f of this.feet) {
      [f.x, f.z] = turn(f.x, f.z);
      [f.sx, f.sz] = turn(f.sx, f.sz);
      f.yaw += a;
      f.syaw += a;
    }
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
      // A foot left too far behind (a sudden start, a shove) goes early.
      const sp = Math.max(1e-3, this.speed);
      const behind = -((f.x - inp.x) * inp.vx + (f.z - inp.z) * inp.vz) / sp;
      // So does one left out to the side, the body having slid past it in a
      // reversal: planted on, it held the legs wide apart.
      const side = (f.x - inp.x) * Math.cos(inp.yaw) - (f.z - inp.z) * Math.sin(inp.yaw);
      const wide = Math.abs(side - (i === 0 ? 1 : -1) * this.body.legLen * 0.05) > 0.2 * this.body.legLen;
      const early = (behind > 0.45 * this.body.legLen && phi > 0.1) || (wide && phi > 0.08);
      if ((phi >= duty || early) && phi < 0.985 && f.since > 0.05) this.lift(f, true, phi);
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
        // A foot the body has run on past (a start, out of a reversal)
        // comes up onto its toes whatever the beat says, so the hips need
        // not sink to keep it on the floor.
        const L = this.body.legLen;
        if (behind > 0.2 * L) f.pitch = Math.max(f.pitch, pToe * smooth((behind - 0.2 * L) / (0.25 * L)));
        f.pitch *= this.moveW;
      }
      return;
    }
    if (!f.phased) return;
    // In the air: progress from lift-off to the next heel strike.
    const s = wrapped ? 1 : Math.min(1, Math.max(f.s, (phi - f.dutyAtLift) / (1 - f.dutyAtLift)));
    f.s = s;
    const tLand = ((1 - s) * (1 - f.dutyAtLift)) / this.freq;
    // Lands a little less ahead than it leaves behind when running: under
    // the body, not reaching out in front.
    // Facing across the travel (mid-pivot), a foot reaching ahead lands out
    // to the body's side: land it under the hip instead.
    const fwd = (inp.vx * Math.sin(inp.yaw) + inp.vz * Math.cos(inp.yaw)) / Math.max(1e-3, this.speed);
    const lead = (duty / this.freq) * lerp(0.5, 0.3, this.runW) * Math.max(0, fwd);
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
    // The foot keeps pace with the body through the swing: behind the hip
    // early (heel up), under it at mid swing, ahead only to land. Held back
    // longer it trailed far behind, the pelvis sank to reach it and the run
    // read as a string of lunges with the back knee near the floor.
    // Running, the foot leaves quickly and comes through under the hip with
    // the heel tucked up, then eases down onto its spot: eased in as well, it
    // hung far behind early in the swing, a long back leg in every frame.
    const m0 = 0.8 * run;
    const e = s <= 0 ? 0 : s >= 1 ? 1 : s * s * (3 - 2 * s) + m0 * s * (1 - s) * (1 - s);
    f.x = lerp(f.sx, d.x, e);
    f.z = lerp(f.sz, d.z, e);
    f.yaw = f.syaw + wrapAngle(d.yaw - f.syaw) * e;
    const dist = Math.hypot(d.x - f.sx, d.z - f.sz);
    const L = this.body.legLen;
    if (stride) {
      const walkH = 0.1 * L * Math.min(1.2, 0.4 + dist / (0.7 * L));
      // Running, the heel kicks up behind straight after toe-off (the knee
      // folds) and the foot comes through high, then reaches down to land.
      // A foot that trailed low along the floor read as a lunge, the legs
      // split wide in every frame. Not too high either: half a leg read as
      // prancing, the knee thrown up at every stride.
      const runH = 0.22 * L;
      const h = lerp(walkH, runH, run);
      const kick = s < 0.3 ? Math.sin((Math.PI / 2) * (s / 0.3)) : Math.pow(Math.cos((Math.PI / 2) * ((s - 0.3) / 0.7)), 1.4);
      const prof = lerp(Math.sin(Math.PI * Math.pow(s, 0.85)), kick, run);
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
