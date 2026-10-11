/**
 * SLAY — townsfolk at their work, at rest, and talking.
 *
 * Every resident has three loops, played by name through the hero animator
 * (`registerAction` in `hero/Actions.ts`):
 *
 * - `npc.<id>.work`: the trade. The smith hammers at the anvil, the
 *   quartermaster writes in her ledger, the vaultkeeper counts coins, the
 *   sister grinds at her mortar, the gravekeeper sweeps, the captain keeps
 *   watch, the Listener kneels with an ear to the ground, Gilder drinks, the
 *   surveyor reads her map and sights along her rod.
 * - `npc.<id>.rest`: standing as they stand: their posture, their tools
 *   carried, breathing. Played while they watch someone.
 * - `npc.<id>.talk`: their posture with gestures of the free hand, for a
 *   conversation.
 *
 * Some have a second work loop (`npc.<id>.work2`: the sister's prayer, the
 * gravekeeper leaning on his broom) that the resident's routine mixes in.
 *
 * Keys follow `hero/Actions.ts`: each starts from the stance's standing pose
 * and says only what it changes; arm numbers are `Pose.arm` order (raise
 * forward, raise out, inward turn, elbow, forearm turn, wrist flex, wrist
 * tilt). A loop's last key is its first, so it runs round without a seam.
 * Hand places (`reach`) are metres on a 1.88 m body, scaled to the body.
 */
import { CH, type Pose, type Side } from '../hero/Pose';
import { registerAction, type ActionCtx, type ActionDef, type ActionKey, type ActionStep } from '../hero/Actions';

type Arm = [number, number, number, number, number?, number?, number?];
type PoseFn = (p: Pose, c: ActionCtx) => void;

const arm = (p: Pose, side: Side, a: Arm) => p.arm(side, a[0], a[1], a[2], a[3], a[4] ?? 0, a[5] ?? 0, a[6] ?? 0);

/** Turns and bends the trunk: `yaw` + to the left, `lean` + forward, `roll` + tips the top right. */
function trunk(p: Pose, yaw: number, lean: number, roll = 0): void {
  p.add('pelvis', lean * 0.2, yaw * 0.3, roll * 0.3);
  p.add('spine', lean * 0.45, yaw * 0.35, roll * 0.4);
  p.add('chest', lean * 0.35, yaw * 0.45, roll * 0.3);
}

/** Where the head looks, relative to the trunk: `nod` + down, `turn` + left, `tilt` + right ear down. */
function head(p: Pose, nod: number, turn = 0, tilt = 0): void {
  p.add('neck', nod * 0.4, turn * 0.4, tilt * 0.4);
  p.add('head', nod * 0.6, turn * 0.6, tilt * 0.6);
}

/** Moves the weight: heads sideways (+ left), down, forward. */
function weight(p: Pose, c: ActionCtx, side: number, down: number, fwd: number): void {
  p.shift(side * c.h, -down * c.h, fwd * c.h);
}

/** A hand placed: grip at metres (1.88 m body, +X left, +Z ahead), held thing pointing `dir`. */
function reach(p: Pose, c: ActionCtx, side: Side, at: [number, number, number], dir: [number, number, number], cock = 0.3, flex = 0): void {
  const s = c.h * 4;
  p.set(side === 'R' ? 'handR' : 'handL', flex, cock, 0);
  p.reach(side, [at[0] * s, at[1] * s, at[2] * s], dir);
}

/** The shoulders rise and fall with a breath: `b` in -1..1. */
function breathe(p: Pose, b: number): void {
  p.add('spine', -0.012 * b, 0, 0);
  p.add('chest', -0.025 * b, 0, 0);
  p.add('clavL', 0.035 * b, 0, 0);
  p.add('clavR', 0.035 * b, 0, 0);
}

/** A loop through keys; the first key is repeated at `period` to close it. */
function loop(period: number, keys: Array<[number, PoseFn, boolean?]>, o: { full?: boolean; plant?: boolean; steps?: ActionStep[] } = {}): ActionDef {
  const out: ActionKey[] = keys.map(([t, pose, hold]) => ({ t, pose, hold: !!hold }));
  out.push({ t: period, pose: keys[0]![1], hold: !!keys[0]![2] });
  return { loop: true, full: o.full ?? false, plantFeet: o.plant ?? false, steps: o.steps, keys: out };
}

// ---------------------------------------------------------------------------
// Postures
// ---------------------------------------------------------------------------

/** How each resident carries themselves, laid under every key of their loops. */
export interface Posture {
  /** 0 upright .. 1 bent with age. */
  stoop: number;
  /** Chin up (negative) or down. */
  chin?: number;
  /** A slow drunken sway, radians. */
  sway?: number;
}

function carry(p: Pose, q: Posture, t: number): void {
  p.add('spine', q.stoop * 0.25, 0, 0);
  p.add('chest', q.stoop * 0.3, 0, 0);
  p.add('neck', -q.stoop * 0.2 + (q.chin ?? 0) * 0.5, 0, 0);
  p.add('head', -q.stoop * 0.25 + (q.chin ?? 0) * 0.5, 0, 0);
  p.add('clavL', q.stoop * 0.08, q.stoop * 0.12, 0);
  p.add('clavR', q.stoop * 0.08, q.stoop * 0.12, 0);
  if (q.sway) {
    const s = Math.sin(t * 1.3) * q.sway;
    p.add('spine', 0, s * 0.3, s);
    p.add('chest', 0, 0, s * 0.6);
    p.add('head', 0, -s * 0.5, -s * 1.2);
  }
}

// Hand poses used across jobs.
const HANG: Arm = [0.1, 0.18, 0.15, 0.4, 0.2, 0.1];
/** Forearm across the belly, palm up: something held in front. */
const CRADLE_L: Arm = [0.3, 0.1, 0.55, 1.45, -1.25, 0.1];
/** Hand on the hip, elbow out. */
const HIP: Arm = [-0.15, 0.55, -0.35, 1.7, 0.4, 0.5];
/** Hands behind the back. */
const BEHIND: Arm = [-0.35, 0.18, 0.9, 1.0, 0.6, 0.3];

// ---------------------------------------------------------------------------
// The jobs
// ---------------------------------------------------------------------------

/** Kale at the anvil: tongs hold the bar, the hammer rises and falls, the bar is turned. */
function forge(q: Posture): Record<string, ActionDef> {
  const tongs = (p: Pose, c: ActionCtx, turn = 0) => reach(p, c, 'L', [0.16, 0.96, 0.36], [-0.25 + turn * 0.2, -0.32, 0.92], 0.2);
  const raise = (lift: number): PoseFn => (p, c) => {
    carry(p, q, 0);
    tongs(p, c);
    reach(p, c, 'R', [-0.24, 1.25 + 0.5 * lift, 0.18 - 0.16 * lift], [0.05, 0.35 + 0.6 * lift, 0.92 - 1.6 * lift], 0.5);
    p.fist('L', 1);
    p.fist('R', 1);
    trunk(p, -0.12 * lift, 0.12 - 0.1 * lift);
    head(p, 0.35);
    weight(p, c, 0, 0.12 - 0.04 * lift, 0.04);
  };
  const strike: PoseFn = (p, c) => {
    carry(p, q, 0);
    tongs(p, c);
    reach(p, c, 'R', [-0.1, 1.02, 0.42], [0.08, -0.2, 0.97], 0.35);
    p.fist('L', 1);
    p.fist('R', 1);
    trunk(p, 0.08, 0.32);
    head(p, 0.3);
    weight(p, c, 0, 0.2, 0.08);
  };
  const rebound: PoseFn = (p, c) => {
    carry(p, q, 0);
    tongs(p, c);
    reach(p, c, 'R', [-0.12, 1.12, 0.38], [0.08, 0.15, 0.98], 0.4);
    p.fist('R', 1);
    trunk(p, 0.04, 0.26);
    head(p, 0.32);
    weight(p, c, 0, 0.16, 0.06);
  };
  const turnBar: PoseFn = (p, c) => {
    carry(p, q, 0);
    tongs(p, c, 1);
    p.add('foreArmL', 0, 0.9, 0);
    reach(p, c, 'R', [-0.3, 1.02, 0.12], [0.1, 0.9, 0.3], 0.3);
    trunk(p, 0.1, 0.18);
    head(p, 0.45, 0.1);
    weight(p, c, 0.02, 0.12, 0.04);
  };
  const look: PoseFn = (p, c) => {
    carry(p, q, 0);
    reach(p, c, 'L', [0.14, 1.32, 0.3], [-0.1, 0.55, 0.83], 0.2);
    reach(p, c, 'R', [-0.3, 1.0, 0.1], [0.1, 0.9, 0.3], 0.3);
    trunk(p, 0.05, 0.02);
    head(p, 0.15, 0.15, 0.1);
    weight(p, c, 0, 0.06, 0);
  };
  const stand: PoseFn = (p, c) => {
    carry(p, q, 0);
    arm(p, 'L', [0.15, 0.25, 0.2, 0.7, 0.3, 0]);
    reach(p, c, 'R', [-0.3, 0.95, 0.05], [0.1, 0.95, 0.2], 0.3);
    p.fist('L', 1);
    head(p, 0.05);
  };
  return {
    work: loop(3.6, [
      [0, raise(1), true],
      [0.34, strike],
      [0.46, rebound],
      [0.86, raise(1), true],
      [1.2, strike],
      [1.32, rebound],
      [1.72, raise(1), true],
      [2.06, strike],
      [2.2, rebound],
      [2.65, turnBar, true],
      [3.0, turnBar],
      [3.3, raise(0.6)],
    ], { full: true, plant: true }),
    work2: loop(4, [
      [0, look, true],
      [1.4, look],
      [2.6, (p, c) => { look(p, c); head(p, -0.05, -0.2, -0.1); }],
      [3.4, look],
    ], { full: true, plant: true }),
    rest: loop(4, [
      [0, (p, c) => { stand(p, c); breathe(p, -1); }],
      [2, (p, c) => { stand(p, c); breathe(p, 1); }],
    ]),
  };
}

/** Hesk: the ledger open on her left forearm, the quill moving, a look up now and then. */
function ledger(q: Posture): Record<string, ActionDef> {
  const book = (p: Pose, lift = 0) => {
    arm(p, 'L', [0.42 + lift, 0.12, 0.55, 1.5 - lift * 0.4, -1.3, 0.15]);
    p.fist('L', 0.15);
  };
  const write = (dx: number, dy: number, b: number): PoseFn => (p, c) => {
    carry(p, q, 0);
    book(p);
    reach(p, c, 'R', [0.02 + dx, 1.12 + dy, 0.36], [-0.3, 0.75, 0.55], 0.1, 0.2);
    p.fist('R', 0.75);
    trunk(p, 0.12, 0.12);
    head(p, 0.45, 0.1);
    breathe(p, b);
  };
  const think: PoseFn = (p, c) => {
    carry(p, q, 0);
    book(p, 0.1);
    reach(p, c, 'R', [-0.06, 1.42, 0.18], [-0.1, 0.95, 0.2], 0.2, 0.3);
    p.fist('R', 0.8);
    trunk(p, 0.05, 0.02);
    head(p, -0.05, -0.25, 0.08);
  };
  const stand = (b: number): PoseFn => (p, c) => {
    carry(p, q, 0);
    arm(p, 'L', [0.2, 0.15, 0.5, 1.55, -0.2, 0.2]);
    p.fist('L', 0.6);
    reach(p, c, 'R', [-0.08, 1.0, 0.2], [-0.4, 0.7, 0.5], 0.1, 0.2);
    p.fist('R', 0.8);
    head(p, 0.05);
    breathe(p, b);
  };
  return {
    work: loop(5.2, [
      [0, write(0, 0, -1)],
      [0.35, write(0.04, -0.01, -0.6)],
      [0.7, write(0.08, -0.005, -0.2)],
      [1.05, write(0.02, -0.03, 0.3)],
      [1.4, write(0.06, -0.035, 0.7)],
      [1.75, write(0.1, -0.03, 1)],
      [2.1, write(0.03, -0.06, 0.6)],
      [2.5, write(0.08, -0.065, 0.1)],
      [3.2, think, true],
      [4.3, think],
      [4.8, write(0.01, 0.0, -0.8)],
    ]),
    rest: loop(4, [
      [0, stand(-1)],
      [2, stand(1)],
    ]),
  };
}

/** Corvane: coins on his left palm, counted one by one into the right hand. */
function coins(q: Posture): Record<string, ActionDef> {
  const palm = (p: Pose) => {
    arm(p, 'L', [0.35, 0.1, 0.5, 1.45, -1.25, 0.05]);
    p.fist('L', 0.2);
  };
  const pick = (n: number): PoseFn => (p, c) => {
    carry(p, q, 0);
    palm(p);
    reach(p, c, 'R', [0.06, 1.1, 0.34], [0.2, 0.3, 0.93], 0.0, 0.5);
    p.fist('R', 0.55);
    trunk(p, 0.05, 0.08);
    head(p, 0.5, 0.05 * n);
  };
  const drop = (n: number): PoseFn => (p, c) => {
    carry(p, q, 0);
    palm(p);
    reach(p, c, 'R', [-0.18, 1.0, 0.28], [0.0, 0.5, 0.86], 0.0, 0.3);
    p.fist('R', 0.9);
    trunk(p, -0.02, 0.06);
    head(p, 0.45, -0.1 + 0.03 * n);
  };
  const tally: PoseFn = (p, c) => {
    carry(p, q, 0);
    palm(p);
    reach(p, c, 'R', [-0.12, 1.3, 0.22], [0.1, 0.9, 0.3], 0.1, 0.3);
    p.fist('R', 0.9);
    trunk(p, 0, 0);
    head(p, -0.02, -0.3);
  };
  return {
    work: loop(4.8, [
      [0, pick(0)],
      [0.45, drop(0)],
      [0.9, pick(1)],
      [1.35, drop(1)],
      [1.8, pick(2)],
      [2.25, drop(2)],
      [2.7, pick(3)],
      [3.15, drop(3)],
      [3.6, tally, true],
      [4.4, tally],
    ]),
    rest: loop(5, [
      [0, (p) => { carry(p, q, 0); arm(p, 'L', BEHIND); arm(p, 'R', BEHIND); p.fist('L', 0.4); p.fist('R', 0.6); breathe(p, -1); }],
      [2.5, (p) => { carry(p, q, 0); arm(p, 'L', BEHIND); arm(p, 'R', BEHIND); p.fist('L', 0.4); p.fist('R', 0.6); breathe(p, 1); head(p, 0, 0.1); }],
    ]),
  };
}

/** Sister Vell: grinding at the mortar, and now and then a prayer. */
function mortar(q: Posture): Record<string, ActionDef> {
  const bowl = (p: Pose) => {
    arm(p, 'L', CRADLE_L);
    p.fist('L', 0.3);
  };
  const grind = (a: number, b: number): PoseFn => (p, c) => {
    carry(p, q, 0);
    bowl(p);
    const r = 0.03;
    reach(p, c, 'R', [0.06 + Math.cos(a) * r, 1.08, 0.3 + Math.sin(a) * r], [Math.cos(a) * 0.15, 1, Math.sin(a) * 0.15], 0.3);
    p.fist('R', 1);
    trunk(p, 0.06 + 0.03 * Math.cos(a), 0.14);
    head(p, 0.45);
    breathe(p, b);
  };
  // The bowl stays cradled; the pestle hand rests over her heart.
  const pray = (b: number, nod: number): PoseFn => (p, c) => {
    carry(p, q, 0);
    bowl(p);
    reach(p, c, 'R', [0.03, 1.3, 0.16], [0.6, 0.75, 0.2], 0.0, 0.2);
    p.fist('R', 0.85);
    trunk(p, 0, 0.1);
    head(p, 0.55 + nod);
    breathe(p, b);
  };
  const stand = (b: number): PoseFn => (p) => {
    carry(p, q, 0);
    arm(p, 'L', [0.3, 0.1, 0.9, 1.6, 0.2, 0.2]);
    arm(p, 'R', [0.3, 0.1, 0.9, 1.6, 0.2, 0.2]);
    p.fist('L', 0.4);
    p.fist('R', 0.6);
    head(p, 0.12);
    breathe(p, b);
  };
  return {
    work: loop(2.4, [
      [0, grind(0, -1)],
      [0.4, grind(Math.PI / 2, -0.5)],
      [0.8, grind(Math.PI, 0)],
      [1.2, grind(Math.PI * 1.5, 0.5)],
      [1.6, grind(Math.PI * 2, 1)],
      [2.0, grind(Math.PI * 2.5, 0)],
    ]),
    work2: loop(6, [
      [0, pray(-1, 0), true],
      [3, pray(1, 0.08), true],
    ]),
    rest: loop(4, [
      [0, stand(-1)],
      [2, stand(1)],
    ]),
  };
}

/** Old Marrow: sweeping the stones before the memorial, and leaning on the broom to rest his back. */
function sweep(q: Posture): Record<string, ActionDef> {
  const stroke = (s: number): PoseFn => (p, c) => {
    carry(p, q, 0);
    reach(p, c, 'R', [-0.12 - 0.05 * s, 1.0, 0.2], [0.42 * s - 0.1, 0.82, -0.32], 0.3);
    p.c[CH.offGrip] = 1;
    p.c[CH.gripGap] = 0.36;
    p.fist('R', 1);
    p.fist('L', 1);
    trunk(p, 0.22 * s, 0.25);
    head(p, 0.3, -0.15 * s);
    weight(p, c, 0.04 * s, 0.1, 0.02);
  };
  const lean = (b: number): PoseFn => (p, c) => {
    carry(p, q, 0);
    reach(p, c, 'R', [-0.03, 1.12, 0.32], [0, 1, -0.05], 0.4);
    reach(p, c, 'L', [0.03, 1.16, 0.33], [0, 1, -0.05], 0.4);
    p.fist('R', 1);
    p.fist('L', 0.9);
    trunk(p, 0, 0.18);
    head(p, -0.05, 0.1);
    weight(p, c, 0, 0.06, 0.04);
    breathe(p, b);
  };
  const rub: PoseFn = (p, c) => {
    carry(p, q, 0);
    reach(p, c, 'R', [-0.03, 1.12, 0.32], [0, 1, -0.05], 0.4);
    arm(p, 'L', [-0.4, 0.35, -0.6, 1.9, 0.3, 0.4]);
    p.fist('L', 0.3);
    trunk(p, 0.05, -0.08);
    head(p, -0.2, 0.15);
    weight(p, c, 0, 0.04, 0);
  };
  return {
    work: loop(2.6, [
      [0, stroke(1)],
      [0.65, stroke(-0.6)],
      [1.3, stroke(1)],
      [1.95, stroke(-0.6)],
    ]),
    work2: loop(6, [
      [0, lean(-1), true],
      [2.4, lean(1)],
      [3.4, rub, true],
      [4.6, rub],
      [5.4, lean(0)],
    ]),
    rest: loop(5, [
      [0, lean(-1)],
      [2.5, lean(1)],
    ]),
  };
}

/** Captain Renn: spear grounded, a hand on her hip, the gate watched; a hand up against the glare. */
function watch(q: Posture): Record<string, ActionDef> {
  const stand = (look: number, b: number): PoseFn => (p) => {
    carry(p, q, 0);
    arm(p, 'L', HIP);
    p.fist('L', 0.7);
    head(p, -0.02, look);
    trunk(p, look * 0.15, 0);
    breathe(p, b);
  };
  const shade: PoseFn = (p) => {
    carry(p, q, 0);
    arm(p, 'L', [1.6, 0.6, 1.2, 2.1, 0.5, -0.3]);
    p.fist('L', 0.1);
    head(p, -0.12, 0.25);
    trunk(p, 0.1, -0.02);
  };
  return {
    work: loop(9, [
      [0, stand(0, -1)],
      [1.6, stand(0.45, 0.5)],
      [3.4, stand(0.4, -0.5)],
      [4.6, shade, true],
      [6.0, shade],
      [7.2, stand(-0.35, 0.5)],
      [8.2, stand(-0.3, -0.2)],
    ]),
    rest: loop(4, [
      [0, stand(0, -1)],
      [2, stand(0.05, 1)],
    ]),
  };
}

/** The Listener kneels with her back to the gate, a palm on the earth, and bends to put her ear to it. */
function listen(q: Posture): Record<string, ActionDef> {
  const kneel = (bend: number, b: number): PoseFn => (p, c) => {
    carry(p, q, 0);
    trunk(p, 0.12 * bend, 0.18 + 0.75 * bend, -0.15 * bend);
    weight(p, c, -0.05, 1.3 + 0.25 * bend, 0.2 + 0.1 * bend);
    arm(p, 'L', [0.75 + 0.3 * bend, 0.3, 0.3, 0.2 + 0.5 * (1 - bend), 0.9, -1.0 * bend]);
    p.fist('L', 0.05);
    head(p, 0.2 + 0.25 * bend, 0.5 * bend, 0.85 * bend);
    breathe(p, b);
  };
  const steps: ActionStep[] = [{ t: 0, side: 'L', dx: 0.1, dz: 0.9, lift: 0.15, land: 0.3 }];
  const talk = (g: number): PoseFn => (p, c) => {
    kneel(0, 0)(p, c);
    arm(p, 'L', [0.6 + 0.4 * g, 0.4, 0.4, 1.0 - 0.3 * g, -0.6, -0.2]);
    p.fist('L', 0.1);
    head(p, -0.1, 0, 0.12);
  };
  return {
    work: loop(8, [
      [0, kneel(0, -1), true],
      [2, kneel(0, 1)],
      [3.2, kneel(1, -0.3), true],
      [5.6, kneel(1, 0.3)],
      [7, kneel(0.2, -0.6)],
    ], { full: true, plant: true, steps }),
    rest: loop(5, [
      [0, kneel(0, -1)],
      [2.5, kneel(0, 1)],
    ], { full: true, plant: true, steps }),
    talk: loop(6, [
      [0, talk(0)],
      [1.6, talk(1)],
      [3.2, talk(0.2)],
      [4.6, talk(0.8)],
    ], { full: true, plant: true, steps }),
  };
}

/** Gilder: swaying, the tankard raised and drunk from, the free hand telling a story. */
function drink(q: Posture): Record<string, ActionDef> {
  const hold = (p: Pose) => {
    arm(p, 'R', [0.45, 0.2, 0.25, 1.4, 0.3, -0.2]);
    p.fist('R', 1);
  };
  const tell = (g: number, t: number): PoseFn => (p) => {
    carry(p, q, t);
    hold(p);
    arm(p, 'L', [0.45 + 0.5 * g, 0.35 + 0.3 * g, -0.1, 1.2 - 0.5 * g, -0.8, -0.3]);
    p.fist('L', 0.15);
    head(p, -0.05, 0.1 * g);
  };
  const sip: PoseFn = (p) => {
    carry(p, q, 1);
    arm(p, 'R', [1.25, 0.35, 0.75, 2.3, 0.6, -0.5]);
    p.fist('R', 1);
    arm(p, 'L', HANG);
    p.fist('L', 0.6);
    head(p, -0.35);
    trunk(p, 0, -0.1);
  };
  const wipe: PoseFn = (p) => {
    carry(p, q, 2);
    hold(p);
    arm(p, 'L', [0.8, 0.1, 1.1, 2.4, 0.5, 0.2]);
    p.fist('L', 0.6);
    head(p, 0.05, -0.1);
  };
  return {
    work: loop(7, [
      [0, tell(0, 0)],
      [1.2, tell(1, 1.2)],
      [2.2, tell(0.3, 2.2)],
      [3.2, sip, true],
      [4.4, sip],
      [5.0, wipe],
      [6.0, tell(0.2, 6)],
    ]),
    rest: loop(5, [
      [0, (p) => { carry(p, q, 0); hold(p); arm(p, 'L', HANG); p.fist('L', 0.6); breathe(p, -1); }],
      [2.5, (p) => { carry(p, q, 2.5); hold(p); arm(p, 'L', HANG); p.fist('L', 0.6); breathe(p, 1); }],
    ]),
  };
}

/** Wenna: the map raised and read, a sight taken along the rod, a note made. */
function survey(q: Posture): Record<string, ActionDef> {
  const map = (p: Pose, up: number) => {
    arm(p, 'L', [0.35 + 0.8 * up, 0.2, 0.6, 1.5 + 0.3 * up, -0.6, -0.2]);
    p.fist('L', 0.8);
  };
  const read = (up: number, b: number): PoseFn => (p) => {
    carry(p, q, 0);
    map(p, up);
    head(p, 0.35 - 0.1 * up, 0.15);
    breathe(p, b);
  };
  const sight: PoseFn = (p) => {
    carry(p, q, 0);
    map(p, 0);
    head(p, 0.05, -0.55, -0.1);
    trunk(p, -0.15, 0.05);
  };
  return {
    work: loop(8, [
      [0, read(0, -1)],
      [1.2, read(1, 0.5), true],
      [3.2, read(1, -0.5)],
      [4.2, read(0.1, 0.2)],
      [5.0, sight, true],
      [6.6, sight],
      [7.4, read(0, 0)],
    ]),
    rest: loop(4, [
      [0, read(0, -1)],
      [2, read(0, 1)],
    ]),
  };
}

// ---------------------------------------------------------------------------
// Talk
// ---------------------------------------------------------------------------

/** How a resident talks: which hand is free and how big the gestures are. */
export interface TalkStyle {
  free: Side | 'none';
  size: number;
}

/** A conversation loop: posture, the free hand opening and pointing, a nod. */
function talkLoop(q: Posture, s: TalkStyle, base: PoseFn): ActionDef {
  const g = s.size;
  const hand = s.free === 'none' ? null : s.free;
  const gesture = (k: number, nod: number, out: number): PoseFn => (p, c) => {
    base(p, c);
    carry(p, q, k * 2);
    if (hand) {
      arm(p, hand, [0.35 + 0.6 * g * k, 0.25 + out * 0.3 * g, 0.2 - 0.2 * k, 1.35 - 0.5 * g * k, -0.9 * k, -0.25 * k]);
      p.fist(hand, 0.6 - 0.45 * k);
    }
    head(p, nod, 0, 0.06 * (k - 0.5));
  };
  return loop(6.4, [
    [0, gesture(0.1, 0.0, 0)],
    [0.9, gesture(0.9, -0.05, 0.4)],
    [1.8, gesture(0.4, 0.08, 0.1)],
    [2.6, gesture(0.7, -0.02, 1)],
    [3.6, gesture(0.15, 0.1, 0)],
    [4.4, gesture(1, -0.08, 0.6)],
    [5.4, gesture(0.3, 0.04, 0.2)],
  ]);
}

// ---------------------------------------------------------------------------

export type JobKind = 'forge' | 'ledger' | 'coins' | 'mortar' | 'sweep' | 'watch' | 'listen' | 'drink' | 'survey';

const JOBS: Record<JobKind, (q: Posture) => Record<string, ActionDef>> = { forge, ledger, coins, mortar, sweep, watch, listen, drink, survey };

/**
 * Registers a resident's loops under `npc.<id>.*` and returns their names.
 * Safe to call more than once.
 */
export function registerJob(id: string, job: JobKind, q: Posture, talk: TalkStyle): { work: string; work2?: string; rest: string; talk: string } {
  const defs = JOBS[job](q);
  const names: Record<string, string> = {};
  for (const [k, def] of Object.entries(defs)) {
    names[k] = `npc.${id}.${k}`;
    registerAction(names[k]!, def);
  }
  if (!defs.talk) {
    // Talking keeps the rest pose's tools, with the free hand doing the talking.
    const rest = defs.rest!;
    const base: PoseFn = (p, c) => rest.keys[0]!.pose(p, c);
    names.talk = `npc.${id}.talk`;
    registerAction(names.talk, talkLoop(q, talk, base));
  }
  return { work: names.work!, work2: names.work2, rest: names.rest!, talk: names.talk! };
}
