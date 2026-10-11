/**
 * SLAY — the upright poser: bipeds, brutes, giants, and the specter's trunk.
 *
 * Locomotion is weight first: the hips drop just after each foot lands and
 * ride over the planted foot, the pelvis turns with the swinging leg and the
 * shoulders turn against it, and heavy bodies sway more and recover slower.
 * Attacks are key poses (`Keys.ts`) a wind-up holds and a strike snaps
 * through. Deaths end on the floor and stay there.
 */
import type { CreatureAnimator } from './Animator';
import { key, strike, type Key } from './Keys';
import { clamp01, kf, pulse, ramp, settle, type AttackKind } from './Motion';
import { TAU, dropFall, fidget, flinchTrunk, idleWeight, nameHash, riseDepth, staggerUpright, thud } from './PoseCommon';

// ---------------------------------------------------------------------------
// Key poses. Right hand leads; mirror for the left.
// ---------------------------------------------------------------------------

const CHOP_W: Key = { $hips: [0, -0.03, -0.05], spine: [-0.12, 0.25, 0], chest: [-0.18, 0.2, 0], neck: [0.05], head: [0.12, -0.2], armR: [-2.5, 0, -0.25], foreR: [-0.6], handR: [0.5], armL: [-0.5, 0, 0.35], foreL: [-0.7] };
const CHOP_H: Key = { $hips: [0, -0.1, 0.08], spine: [0.35, -0.2, 0], chest: [0.3, -0.15, 0], head: [-0.3, 0.1], armR: [-1.05, 0, -0.1], foreR: [-0.15], handR: [0.9], armL: [0.35, 0, 0.45], foreL: [-0.4] };
const CHOP2_W: Key = { $hips: [0, -0.04, -0.06], spine: [-0.18, 0.15, 0], chest: [-0.2, 0.1, 0], head: [0.15], armR: [-2.6, 0, -0.1], foreR: [-0.7], handR: [0.4], armL: [-2.5, 0, -0.35], foreL: [-0.9] };
const CHOP2_H: Key = { $hips: [0, -0.14, 0.1], spine: [0.5, -0.05, 0], chest: [0.35, 0, 0], head: [-0.35], armR: [-0.95, 0, 0.1], foreR: [-0.2], handR: [1.0], armL: [-1.0, 0, -0.3], foreL: [-0.35] };
const SWING_W: Key = { $hips: [0.03, -0.03, 0], hips: [0, -0.2, 0], spine: [0, -0.35, 0], chest: [-0.05, -0.4, 0], head: [0, 0.45], armR: [-0.7, 0, -1.25], foreR: [-0.9], handR: [0.2], armL: [-0.7, 0, 0.2], foreL: [-1.0] };
const SWING_H: Key = { $hips: [-0.04, -0.07, 0.06], hips: [0, 0.25, 0], spine: [0.15, 0.4, 0], chest: [0.15, 0.45, 0], head: [0.1, -0.5], armR: [-1.35, 0, 0.35], foreR: [-0.25], handR: [0.4], armL: [0.3, 0, 0.6], foreL: [-0.5] };
const THRUST_W: Key = { $hips: [0, -0.03, -0.07], spine: [-0.05, -0.35, 0], chest: [0, -0.3, 0], armR: [0.5, 0, -0.2], foreR: [-1.7], handR: [1.1], armL: [-0.9, 0, 0.3], foreL: [-0.6] };
const THRUST_H: Key = { $hips: [0, -0.08, 0.14], spine: [0.25, 0.3, 0], chest: [0.12, 0.25, 0], head: [-0.2, -0.2], armR: [-1.5, 0, 0], foreR: [-0.05], handR: [1.3], armL: [0.45, 0, 0.25], foreL: [-0.3] };
const SLAM_W: Key = { $hips: [0, 0.02, -0.06], spine: [-0.28, 0, 0], chest: [-0.25, 0, 0], neck: [0.1], head: [0.15], armL: [-2.75, 0, 0.25], armR: [-2.75, 0, -0.25], foreL: [-0.5], foreR: [-0.5], jaw: [0.5] };
const SLAM_H: Key = { $hips: [0, -0.2, 0.1], spine: [0.48, 0, 0], chest: [0.25, 0, 0], head: [-0.35], armL: [-0.6, 0, 0.1], armR: [-0.6, 0, -0.1], foreL: [-0.2], foreR: [-0.2], jaw: [0.2] };
const CLAW_W: Key = { $hips: [0, -0.03, -0.02], spine: [0.05, -0.35, 0], chest: [0, -0.3, 0], head: [-0.1, 0.2], armR: [-1.7, 0, -0.95], foreR: [-1.2], handR: [-0.5], jaw: [0.35] };
const CLAW_H: Key = { $hips: [0, -0.08, 0.08], spine: [0.3, 0.35, 0], chest: [0.2, 0.3, 0], head: [0.05, -0.2], armR: [-0.7, 0, 0.4], foreR: [-0.3], handR: [0.45], jaw: [0.15] };
const BITE_W: Key = { $hips: [0, -0.02, -0.06], spine: [-0.2], chest: [-0.15], neck: [-0.45], head: [-0.25], jaw: [0.7], armL: [-0.9, 0, 0.5], armR: [-0.9, 0, -0.5], foreL: [-0.8], foreR: [-0.8] };
const BITE_H: Key = { $hips: [0, -0.1, 0.14], spine: [0.45], chest: [0.3], neck: [0.5], head: [0.15], jaw: [0.05], armL: [-1.3, 0, 0.25], armR: [-1.3, 0, -0.25], foreL: [-0.4], foreR: [-0.4] };
const HURL_W: Key = { $hips: [0, -0.02, -0.06], spine: [-0.1, -0.4, 0], chest: [-0.18, -0.3, 0], head: [0, 0.35], armR: [-2.6, 0, -0.5], foreR: [-1.4], handR: [0.4], armL: [-1.25, 0, 0.3], foreL: [-0.2] };
const HURL_H: Key = { $hips: [0, -0.06, 0.08], spine: [0.3, 0.35, 0], chest: [0.2, 0.25, 0], head: [-0.1, -0.2], armR: [-1.25, 0, 0.1], foreR: [-0.1], handR: [0.7], armL: [0.4, 0, 0.25], foreL: [-0.6] };
const GORE_W: Key = { $hips: [0, -0.12, -0.05], spine: [0.5], chest: [0.15], neck: [0.4], head: [0.35], armL: [0.3, 0, 0.4], armR: [0.3, 0, -0.4] };
const GORE_H: Key = { $hips: [0, 0.04, 0.16], spine: [0.1], neck: [-0.45], head: [-0.45], armL: [-0.4, 0, 0.5], armR: [-0.4, 0, -0.5], jaw: [0.4] };
const LUNGE_W: Key = { $hips: [0, -0.16, -0.08], spine: [0.35], chest: [0.1], head: [-0.25], armL: [0.6, 0, 0.35], armR: [0.6, 0, -0.35], foreL: [-0.5], foreR: [-0.5] };
const LUNGE_H: Key = { $hips: [0, -0.04, 0.32], spine: [0.5], chest: [0.15], head: [-0.4], armL: [-1.6, 0, 0.2], armR: [-1.6, 0, -0.2], foreL: [-0.2], foreR: [-0.2], jaw: [0.6] };
const LASH_W: Key = { $hips: [0, -0.02, -0.03], spine: [-0.05, -0.3], chest: [-0.1, -0.3], armR: [-2.1, 0, -0.65], foreR: [-1.5], handR: [-0.3], armL: [-0.5, 0, 0.4] };
const LASH_H: Key = { $hips: [0, -0.06, 0.06], spine: [0.2, 0.3], chest: [0.15, 0.3], armR: [-0.55, 0, 0.3], foreR: [0], handR: [0.7], armL: [0.3, 0, 0.4] };
const STOMP_W: Key = { $hips: [-0.06, 0.04, -0.03], spine: [-0.1], chest: [-0.15], armL: [-0.3, 0, 0.7], armR: [-0.3, 0, -0.7], head: [0.2] };
const STOMP_H: Key = { $hips: [0.02, -0.16, 0.04], spine: [0.35], chest: [0.25], armL: [0.2, 0, 0.9], armR: [0.2, 0, -0.9], head: [-0.2], jaw: [0.5] };
// Bow: left arm holds the bow out, right draws to the cheek.
const DRAW: Key = { spine: [0.02, 0.35], chest: [0, 0.35], head: [0, -0.6], armL: [-1.5, 0, -0.1], foreL: [-0.05], handL: [0.1], armR: [-1.35, 0.4, -0.75], foreR: [-2.0], handR: [0.2] };
const LOOSE: Key = { armR: [0.2, 0.15, -0.25], foreR: [0.6], chest: [-0.05], head: [-0.05] };
// Crossbow: stock to the shoulder, both hands on it; the shot kicks it up.
const AIM: Key = { chest: [0, 0.18], head: [0.05, -0.18], armR: [-1.15, 0.25, -0.05], foreR: [-0.75], handR: [0.1], armL: [-1.35, 0, -0.5], foreL: [-0.55] };
const KICK: Key = { chest: [-0.08], head: [-0.06], armR: [-0.25], armL: [-0.25], foreR: [0.15] };
// Casts.
const GATHER: Key = { $hips: [0, -0.02, -0.02], spine: [-0.1], chest: [-0.22], head: [-0.2], armL: [-1.9, 0, 0.65], armR: [-1.9, 0, -0.65], foreL: [-0.9], foreR: [-0.9], handL: [-0.5], handR: [-0.5] };
const PUSH: Key = { $hips: [0, -0.05, 0.06], spine: [0.15], chest: [0.15], head: [0.05], armL: [-1.45, 0, 0.15], armR: [-1.45, 0, -0.15], foreL: [-0.1], foreR: [-0.1], handL: [-0.8], handR: [-0.8] };
const STAFF_UP: Key = { spine: [-0.1, 0.1], chest: [-0.2, 0.1], head: [-0.25], armR: [-2.65, 0, -0.2], foreR: [-0.35], armL: [-1.7, 0, 0.6], foreL: [-0.4], handL: [-0.6] };
const STAFF_DOWN: Key = { $hips: [0, -0.07, 0.04], spine: [0.25], chest: [0.15], head: [0.1], armR: [-1.05, 0, -0.15], foreR: [-0.7], armL: [-1.3, 0, 0.3], foreL: [-0.2], handL: [-0.8] };
const OFF_UP: Key = { chest: [-0.1, -0.25], head: [-0.1, 0.2], armL: [-2.2, 0, 0.45], foreL: [-0.8], handL: [-0.5] };
const OFF_PUSH: Key = { $hips: [0, -0.03, 0.04], chest: [0.1, 0.2], head: [0, -0.1], armL: [-1.5, 0, 0.05], foreL: [-0.05], handL: [-0.9] };

const MELEE: Partial<Record<AttackKind, [Key, Key]>> = {
  chop: [CHOP_W, CHOP_H],
  swing: [SWING_W, SWING_H],
  thrust: [THRUST_W, THRUST_H],
  slam: [SLAM_W, SLAM_H],
  claw: [CLAW_W, CLAW_H],
  bite: [BITE_W, BITE_H],
  gore: [GORE_W, GORE_H],
  lunge: [LUNGE_W, LUNGE_H],
  lash: [LASH_W, LASH_H],
  hurl: [HURL_W, HURL_H],
  stomp: [STOMP_W, STOMP_H],
  sting: [THRUST_W, THRUST_H],
  engulf: [SLAM_W, SLAM_H],
};

// ---------------------------------------------------------------------------

export function poseBiped(a: CreatureAnimator): void {
  if (a.phase === 'death') {
    deathUpright(a);
    return arms2(a);
  }
  stance(a);
  locomotion(a);
  idle(a);
  action(a);
  arms2(a);
  flinchTrunk(a, 1 - 0.4 * a.style.heavy);
  staggerUpright(a);
  if (a.phase === 'spawn') spawnUpright(a);
}

/**
 * A second pair of arms shadows the first a little behind it in strength,
 * held forward in a guard of their own that slackens as the body dies.
 */
function arms2(a: CreatureAnimator): void {
  if (!a.has('arm2L')) return;
  const live = a.phase === 'death' ? 1 - ramp(a.deathT, 0, 0.45) : 1;
  for (const s of ['L', 'R'] as const) {
    a.echo(`arm${s}`, `arm2${s}`, 0.6);
    a.echo(`fore${s}`, `fore2${s}`, 0.6);
    a.echo(`hand${s}`, `hand2${s}`, 0.5);
    const ph = a.time * 1.4 + a.offset + (s === 'L' ? 0 : 1.7);
    a.rotS(`arm2${s}`, s, (-0.45 + Math.sin(ph) * 0.08) * live, 0, 0.1 * live);
    a.rot(`fore2${s}`, (-0.8 + Math.sin(ph + 0.6) * 0.1) * live);
  }
}

/** The specter: an upright trunk over robes, no legs. */
export function poseSpecter(a: CreatureAnimator): void {
  const H = a.info.height;
  const g = a.gait;
  // Hover and drift.
  const bob = Math.sin(a.time * 1.3 + a.offset) * 0.035 * H;
  a.body(0, bob + 0.04 * H, 0, 0, 0, Math.sin(a.time * 0.9 + a.offset) * 0.04);
  // Lean into travel, the robe trailing behind.
  const lean = 0.35 * g;
  a.rot('hips', lean * a.vel.z * 0.6, 0, -lean * a.vel.x * 0.6);
  a.rot('spine', 0.1 * g, 0, 0);
  a.rot('head', -0.2 * g + Math.sin(a.time * 0.7 + a.offset) * 0.08, a.wobble(0.5) * 0.25, 0);
  const trail = 0.5 * g + 0.08;
  for (const [n, k] of [['F', 0], ['B', 1], ['L', 2], ['R', 3]] as const) {
    const ph = a.time * 2.2 + a.offset + k * 1.3;
    const wv = Math.sin(ph) * (0.12 + 0.12 * g);
    a.rot(`robe${n}1`, trail * 0.6 + wv, 0, Math.cos(ph * 0.8) * 0.1);
    a.rot(`robe${n}2`, trail * 0.5 + Math.sin(ph - 0.9) * (0.18 + 0.15 * g), 0, Math.cos(ph * 0.8 - 0.7) * 0.15);
  }
  // Arms: claws reaching, or trailing when it rushes.
  const reach = 1 - g;
  a.rotS('armL', 'L', -0.5 * reach + 0.4 * g + Math.sin(a.time * 1.1 + a.offset) * 0.1, 0, 0.35);
  a.rotS('armR', 'R', -0.5 * reach + 0.4 * g + Math.sin(a.time * 1.1 + a.offset + 1) * 0.1, 0, 0.35);
  a.rot('foreL', -0.5 * reach);
  a.rot('foreR', -0.5 * reach);
  a.rot('handL', -0.4 + Math.sin(a.time * 3 + a.offset) * 0.1);
  a.rot('handR', -0.4 + Math.sin(a.time * 3 + a.offset + 2) * 0.1);
  if (a.phase === 'death') return deathSpecter(a);
  action(a);
  flinchTrunk(a, 1.1);
  if (a.stagger > 0) a.body(0, -0.05 * H * a.stagger, -0.06 * H * a.stagger, -0.25 * a.stagger);
  if (a.phase === 'spawn') {
    const u = a.spawnT;
    // Forms out of the floor, unfurling.
    const up = ramp(u, 0, 0.75);
    a.body(0, -(1 - up) * 0.7 * H, 0, 0, (1 - up) * 2.5, 0);
    a.pose.squash *= 0.3 + 0.7 * up;
    a.pose.spread *= 0.6 + 0.4 * up;
    a.rotS('armL', 'L', -1.6 * pulse(u, 0.3, 0.6, 0.8, 1), 0, 0.6);
    a.rotS('armR', 'R', -1.6 * pulse(u, 0.3, 0.6, 0.8, 1), 0, 0.6);
    a.rot('jaw', 0.8 * pulse(u, 0.5, 0.7, 0.85, 1));
  }
}

// ---------------------------------------------------------------------------

/** Standing shape: a guard for what it holds, a crouch for brutes. */
function stance(a: CreatureAnimator): void {
  const heavy = a.style.heavy;
  const H = a.hipY;
  const boss = Math.min(2, a.bossPhase);
  // Heavy bodies sit into their knees; a boss in a later phase crouches lower and leans in.
  a.move('hips', 0, -H * (0.025 + 0.05 * heavy + 0.03 * boss), 0);
  a.rot('spine', 0.06 + 0.1 * heavy + 0.08 * boss);
  a.rot('neck', -0.05 - 0.06 * heavy - 0.04 * boss);
  a.rot('head', -0.04 - 0.05 * boss);
  switch (a.style.armed) {
    case 'one':
      a.rotS('armR', 'R', -0.35, 0, 0.18);
      a.rot('foreR', -0.85);
      a.rot('handR', 0.25);
      a.rotS('armL', 'L', -0.2, 0, 0.25);
      a.rot('foreL', -0.55);
      break;
    case 'two':
      a.rot('chest', 0, 0.12, 0);
      a.rotS('armR', 'R', -0.55, 0, 0.05);
      a.rot('foreR', -0.95);
      a.rot('handR', 0.3);
      a.rotS('armL', 'L', -0.6, 0, -0.35);
      a.rot('foreL', -1.2);
      break;
    case 'bow':
      a.rotS('armL', 'L', -0.4, 0, 0.12);
      a.rot('foreL', -0.25);
      a.rotS('armR', 'R', -0.1, 0, 0.12);
      a.rot('foreR', -0.35);
      break;
    case 'crossbow':
      a.rotS('armR', 'R', -0.45, 0, 0.1);
      a.rot('foreR', -1.0);
      a.rotS('armL', 'L', -0.6, 0, -0.3);
      a.rot('foreL', -1.15);
      break;
    case 'staff':
      a.rotS('armR', 'R', -0.3, 0, 0.12);
      a.rot('foreR', -1.15);
      a.rotS('armL', 'L', -0.15, 0, 0.2);
      a.rot('foreL', -0.4);
      break;
    default: {
      // Bare hands: claws ready, wider and lower the heavier it is.
      const r = 0.25 + 0.25 * heavy;
      a.rotS('armL', 'L', -0.3 * r, 0, 0.1 + 0.15 * heavy);
      a.rotS('armR', 'R', -0.3 * r, 0, 0.1 + 0.15 * heavy);
      a.rot('foreL', -0.5 - 0.3 * heavy);
      a.rot('foreR', -0.5 - 0.3 * heavy);
      a.rot('handL', -0.2);
      a.rot('handR', -0.2);
    }
  }
  // Wings rest folded, tail hangs with a little life.
  a.rotS('wingL', 'L', 0.2, 0.35, -0.2);
  a.rotS('wingR', 'R', 0.2, 0.35, -0.2);
  a.rotS('wingL2', 'L', 0, 0.4, -0.3);
  a.rotS('wingR2', 'R', 0, 0.4, -0.3);
  for (let i = 1; i <= 6; i++) {
    const n = `tail${i}`;
    if (!a.has(n)) break;
    a.rot(n, -0.05, Math.sin(a.time * 1.6 + a.offset - i * 0.6) * 0.12 * (1 + a.gait), 0);
  }
}

function locomotion(a: CreatureAnimator): void {
  const g = a.gait;
  if (g < 1e-3) return;
  const run = a.run;
  const heavy = a.style.heavy;
  const H = a.hipY;
  const gait = a.style.gait;
  const c = a.cycle * TAU;
  const lumber = gait === 'lumber' ? 1 : 0;
  const shamble = gait === 'shamble' ? 1 : 0;
  const stalk = gait === 'stalk' ? 1 : 0;
  const march = gait === 'march' ? 1 : 0;
  const hop = gait === 'hop' ? 1 : 0;

  // Hips: low just after each foot lands, over the planted foot.
  const bobK = (0.022 + 0.035 * run + 0.03 * heavy + 0.025 * lumber + 0.05 * hop) * H * g;
  const bob = -bobK * (0.5 + 0.5 * Math.cos(2 * c - 0.6));
  const swayK = (0.018 + 0.03 * heavy + 0.04 * lumber + 0.03 * shamble) * H * g * (1 - 0.6 * run);
  const sway = swayK * Math.sin(c + 0.4);
  // A shambler drags: one stride is longer and lower than the other.
  const drag = shamble * Math.max(0, Math.sin(c)) * 0.04 * H * g;
  a.move('hips', sway, bob - drag - stalk * 0.12 * H * g, 0);
  a.rot('hips', 0, -0.12 * g * Math.cos(c) * (1 - 0.3 * heavy), (0.06 + 0.05 * lumber) * g * Math.sin(c));
  // Trunk counters the pelvis; leans into speed and into turns.
  const lean = (0.07 + 0.2 * run + 0.25 * stalk + 0.12 * shamble) * g - march * 0.05 * g;
  const bank = Math.max(-0.25, Math.min(0.25, -a.yawRate * 0.05)) * g;
  a.rot('spine', lean * 0.6, 0.1 * g * Math.cos(c), bank * 0.7 - 0.04 * g * Math.sin(c));
  a.rot('chest', lean * 0.4 + 0.03 * Math.cos(2 * c) * g, 0.08 * g * Math.cos(c), -0.03 * g * Math.sin(c) * (1 + lumber));
  a.rot('neck', -lean * 0.5);
  a.rot('head', -lean * 0.35 + shamble * 0.15 * Math.sin(c * 0.5) * g, -0.06 * g * Math.cos(c), shamble * 0.2 * g * Math.sin(c + 1));

  // Arms swing against the legs, less on a weapon arm; elbows fold with speed.
  const armed = a.style.armed ?? 'none';
  const ampL = (0.32 + 0.4 * run) * g * (armed === 'bow' ? 0.4 : armed === 'two' || armed === 'crossbow' ? 0.15 : 1) * (1 - 0.6 * march);
  const ampR = (0.32 + 0.4 * run) * g * (armed === 'none' ? 1 : armed === 'two' ? 0.15 : 0.35) * (1 - 0.6 * march);
  const sh = shamble ? 0.5 : 1;
  a.rot('armL', ampL * Math.cos(c) * sh - shamble * 0.8 * g);
  a.rot('armR', -ampR * Math.cos(c) * sh - shamble * 0.8 * g);
  a.rot('foreL', -(0.15 + 0.85 * run) * g * (armed === 'none' ? 1 : 0.5) + 0.12 * g * Math.cos(c));
  a.rot('foreR', -(0.15 + 0.85 * run) * g * (armed === 'none' ? 1 : 0.3) - 0.12 * g * Math.cos(c));
  // Feet: toe up at the strike, roll through, push off.
  for (let i = 0; i < a.legCount; i++) {
    const def = a.legDef(i)!;
    const p = a.legPhase(i);
    const d = a.duty;
    const toe = p < d ? kf(p / d, [[0, -0.28], [0.15, 0], [0.75, 0.05], [1, 0.45]]) : kf((p - d) / (1 - d), [[0, 0.45], [0.4, 0.15], [1, -0.28]]);
    a.rot(def.foot ?? def.end, toe * g);
  }
  // Wings half open to balance at a run; the tail streams.
  a.rotS('wingL', 'L', 0, -0.2 * run * g, 0.2 * run * g);
  a.rotS('wingR', 'R', 0, -0.2 * run * g, 0.2 * run * g);
  for (let i = 1; i <= 6; i++) {
    const n = `tail${i}`;
    if (!a.has(n)) break;
    a.rot(n, -0.08 * g * (1 + run), Math.sin(c - i * 0.7) * 0.1 * g, 0);
  }
}

function idle(a: CreatureAnimator): void {
  const w = idleWeight(a);
  if (w < 1e-3) return;
  const t = a.time;
  const o = a.offset;
  const heavy = a.style.heavy;
  const br = Math.sin(t * (1.9 - 0.8 * heavy) + o);
  switch (a.style.idle) {
    case 'still':
      // Constructs and the patient dead: a slow mechanical look round.
      a.rot('head', 0, Math.sin(t * 0.35 + o) * 0.25 * w, 0);
      a.rot('chest', 0.01 * br * w);
      break;
    case 'twitch': {
      a.rot('chest', 0.03 * br * w);
      // Sudden small jerks of the head and a hand.
      const j = Math.max(0, Math.sin(t * 0.9 + o) - 0.85) * 6.6;
      a.rot('head', 0.15 * j * w, 0.3 * j * w * Math.sin(o * 3), 0.2 * j * w);
      a.rot('handL', -0.4 * j * w);
      a.rot('jaw', 0.25 * j * w);
      break;
    }
    case 'sway':
      a.move('hips', Math.sin(t * 0.8 + o) * 0.03 * a.hipY * w, 0, 0);
      a.rot('spine', 0.04 * br * w, 0, Math.sin(t * 0.8 + o) * 0.06 * w);
      a.rot('head', 0.1 * w, 0, Math.sin(t * 0.8 + o + 1) * 0.15 * w);
      a.rotS('armL', 'L', Math.sin(t * 0.8 + o) * 0.1 * w, 0, 0);
      a.rotS('armR', 'R', -Math.sin(t * 0.8 + o) * 0.1 * w, 0, 0);
      break;
    case 'jitter':
      a.move('hips', 0, Math.abs(Math.sin(t * 5 + o)) * 0.03 * a.hipY * w, 0);
      a.rot('head', a.wobble(6) * 0.12 * w, a.wobble(4, 1) * 0.3 * w, 0);
      a.rot('chest', 0.04 * Math.sin(t * 5 + o) * w);
      break;
    case 'prowl':
      a.move('hips', 0, -0.06 * a.hipY * w, 0);
      a.rot('spine', 0.15 * w);
      a.rot('head', -0.1 * w, Math.sin(t * 0.6 + o) * 0.4 * w, 0);
      break;
    default:
      // Breathe: the chest lifts, the shoulders rise with it.
      a.rot('chest', -0.03 * br * w * (1 + heavy));
      a.rotS('armL', 'L', 0, 0, 0.03 * br * w);
      a.rotS('armR', 'R', 0, 0, 0.03 * br * w);
      a.rot('head', 0.02 * br * w, a.wobble(0.3) * 0.15 * w, 0);
      a.move('hips', 0, -0.006 * a.hipY * (1 + br) * w, 0);
  }
  // Fidgets.
  const f = fidget(a);
  if (!f.name) return;
  const k = f.w;
  switch (f.name) {
    case 'look':
      a.rot('neck', 0, Math.sin(f.t * Math.PI * 2) * 0.35 * k, 0);
      a.rot('head', -0.08 * k, Math.sin(f.t * Math.PI * 2) * 0.45 * k, 0);
      a.rot('chest', 0, Math.sin(f.t * Math.PI * 2) * 0.12 * k, 0);
      break;
    case 'shift':
      a.move('hips', Math.sin(f.t * Math.PI) * 0.05 * a.hipY * k, -0.02 * a.hipY * k, 0);
      a.rot('hips', 0, 0, 0.06 * k);
      a.rot('spine', 0, 0, -0.08 * k);
      break;
    case 'shake':
      a.rot('head', 0, Math.sin(f.t * 40) * 0.2 * k, Math.sin(f.t * 33) * 0.1 * k);
      a.rot('chest', 0, Math.sin(f.t * 40 + 1) * 0.06 * k, 0);
      break;
    case 'roar': {
      const r = pulse(f.t, 0.15, 0.35, 0.7, 0.95);
      a.rot('spine', -0.15 * r);
      a.rot('chest', -0.25 * r);
      a.rot('neck', -0.2 * r);
      a.rot('head', -0.35 * r, 0, Math.sin(f.t * 30) * 0.04 * r);
      a.rot('jaw', 0.75 * r);
      a.rotS('armL', 'L', -0.3 * r, 0, 0.6 * r);
      a.rotS('armR', 'R', -0.3 * r, 0, 0.6 * r);
      a.rot('foreL', -0.6 * r);
      a.rot('foreR', -0.6 * r);
      break;
    }
  }
}

function action(a: CreatureAnimator): void {
  const t = a.t;
  const heavy = a.style.heavy;
  switch (a.phase) {
    case 'windup': {
      if (a.style.ranged && !a.struck) return rangedWindup(a);
      const pair = melee(a);
      // Anticipation: quick into the wind-up, then a slow coil while it holds.
      const w = ramp(t, 0, 0.45 + 0.15 * heavy);
      const coil = ramp(t, 0.5, 1) * 0.12;
      key(a, pair[0], w * (1 + coil));
      if (a.attack === 'claw') a.rot('foreL', -0.5 * w);
      if (a.attack === 'stomp') stompFoot(a, w, 0);
      // Brutes shudder as they gather.
      if (heavy > 0.5) a.rot('chest', Math.sin(a.time * 30) * 0.015 * w * heavy);
      return;
    }
    case 'strike': {
      const pair = melee(a);
      const hold = 0.4 + 0.15 * heavy;
      if (a.attack === 'claw') {
        // A rake with the right, then the left.
        strike(a, pair[0], pair[1], t * 1.5, 0.2, 0.55);
        const t2 = (t - 0.3) / 0.7;
        strike(a, CLAW_W, CLAW_H, t2, 0.22, 0.55, true, ramp(t, 0.1, 0.32));
      } else strike(a, pair[0], pair[1], t, 0.15, hold);
      if (a.attack === 'stomp') stompFoot(a, 1 - ramp(t, 0, 0.15), ramp(t, 0.15, 0.2) * (1 - ramp(t, hold, 1)));
      // Impact: a jolt through the body.
      const jolt = settle(t, 0.15, 22, 9);
      a.rot('chest', 0.06 * jolt * (1 + heavy));
      a.rot('head', 0.08 * jolt);
      return;
    }
    case 'cast':
      return castPose(a);
    case 'shoot':
      return bowPose(a, t, a.releaseAt());
    case 'hit':
      a.rot('head', 0.1 * (1 - t));
      return;
    default:
  }
}

function melee(a: CreatureAnimator): [Key, Key] {
  if (a.style.armed === 'two' && (a.attack === 'chop' || a.attack === 'slam')) return [CHOP2_W, CHOP2_H];
  return MELEE[a.attack] ?? [SWING_W, SWING_H];
}

/** The right foot comes up (`up`) and down hard (`down` holds the landing). */
function stompFoot(a: CreatureAnimator, up: number, down: number): void {
  for (let i = 0; i < a.legCount; i++) {
    const def = a.legDef(i)!;
    if (def.side !== 'R') continue;
    const ft = a.footTarget(i)!;
    ft.y += a.legLen * 0.38 * up;
    ft.z += a.legLen * (0.12 * up + 0.15 * down);
    a.rot(def.foot ?? def.end, -0.3 * up);
  }
}

/** A shot or throw that leaves at the end of its wind-up. */
function rangedWindup(a: CreatureAnimator): void {
  const rel = a.releaseAt();
  if (a.style.armed === 'bow' || a.style.armed === 'crossbow' || a.attack === 'shoot') return bowPose(a, a.t, rel);
  // Throw (hurl) or spit.
  const t = a.t;
  const draw = ramp(t, 0, rel * 0.85);
  const fly = ramp(t, rel - 0.02, Math.min(1, rel + 0.12));
  const [w, h] = a.attack === 'hurl' || a.style.armed !== 'none' ? [HURL_W, HURL_H] : [BITE_W, BITE_H];
  key(a, w, draw * (1 - fly));
  key(a, h, fly);
}

function bowPose(a: CreatureAnimator, t: number, rel: number): void {
  const draw = ramp(t, 0, rel * 0.8);
  const loose = ramp(t, rel - 0.01, Math.min(1, rel + 0.06));
  if (a.style.armed === 'crossbow') {
    key(a, AIM, draw * (1 - ramp(t, rel + 0.15, 1) * 0.7));
    key(a, KICK, loose * (1 - ramp(t, rel + 0.05, rel + 0.3)));
    return;
  }
  key(a, DRAW, draw);
  key(a, LOOSE, loose * (1 - ramp(t, rel + 0.1, 1) * 0.6));
  // The draw strains a little before the release.
  a.rot('armR', Math.sin(a.time * 40) * 0.01 * draw * (1 - loose));
}

function castPose(a: CreatureAnimator): void {
  const t = a.t;
  const rel = a.releaseAt();
  const g = ramp(t, 0, rel * 0.7);
  const p = ramp(t, rel - 0.06, Math.min(1, rel + 0.05));
  const back = ramp(t, Math.min(0.98, rel + 0.08), 1);
  const armed = a.style.armed;
  if (armed === 'staff') {
    key(a, STAFF_UP, g * (1 - p));
    key(a, STAFF_DOWN, p * (1 - back * 0.5));
  } else if (armed === 'one' || armed === 'two' || armed === 'bow' || armed === 'crossbow') {
    key(a, OFF_UP, g * (1 - p));
    key(a, OFF_PUSH, p * (1 - back * 0.5));
  } else {
    key(a, GATHER, g * (1 - p));
    key(a, PUSH, p * (1 - back * 0.5));
  }
  // A long cast trembles with what it holds.
  const tr = g * (1 - p) * clamp01((a.actionLen - 0.5) * 2);
  a.rot('chest', Math.sin(a.time * 37) * 0.025 * tr, Math.sin(a.time * 29) * 0.02 * tr, 0);
  a.rot('head', -0.1 * tr);
  a.rot('jaw', 0.4 * tr + 0.3 * p * (1 - back));
  // Wings flare as a winged caster releases.
  a.rotS('wingL', 'L', -0.3 * p, -0.6 * p, 0.6 * p);
  a.rotS('wingR', 'R', -0.3 * p, -0.6 * p, 0.6 * p);
}

// ---------------------------------------------------------------------------
// Spawns
// ---------------------------------------------------------------------------

function spawnUpright(a: CreatureAnimator): void {
  const u = a.spawnT;
  const H = a.info.height;
  switch (a.style.spawn) {
    case 'drop':
    case 'swoop': {
      const d = dropFall(u, 0.5, 0.7, 20);
      a.body(0, d.y * H * 2.6, 0, -0.1 * d.y, 0, 0);
      // In the air: legs tucked, arms and wings out. The pose hands over to
      // the landing across touchdown instead of snapping off.
      const air = 1 - ramp(u, 0.44, 0.62);
      a.ikW = ramp(u, 0.46, 0.58);
      a.rot('legL', -0.3 * air);
      a.rot('legR', -0.1 * air);
      a.rot('shinL', 0.4 * air);
      a.rot('shinR', 0.6 * air);
      a.rotS('armL', 'L', -0.8 * air, 0, 0.9 * air);
      a.rotS('armR', 'R', -0.8 * air, 0, 0.9 * air);
      a.rotS('wingL', 'L', -0.3 * air, -0.8 * air, 0.8 * air);
      a.rotS('wingR', 'R', -0.3 * air, -0.8 * air, 0.8 * air);
      // The landing: down into the knees, one hand to the floor, up.
      const c = d.crouch;
      a.move('hips', 0, -0.4 * a.hipY * c, -0.05 * a.hipY * c);
      a.rot('spine', 0.6 * c);
      a.rot('head', -0.5 * c);
      a.rotS('armL', 'L', -0.6 * c, 0, 0.3 * c);
      a.rotS('armR', 'R', -0.3 * c, 0, 0.7 * c);
      return;
    }
    case 'assemble': {
      // The pieces fly together out of a heap.
      const k = 1 - ramp(u, 0.05, 0.8);
      a.body(0, -k * 0.25 * H, 0, 0, 0, 0);
      for (const n of a.names) {
        if (n === 'root') continue;
        const h1 = nameHash(n, 1) - 0.5;
        const h2 = nameHash(n, 2) - 0.5;
        const h3 = nameHash(n, 3) - 0.5;
        a.move(n, h1 * 0.5 * H * k * k, -Math.abs(h2) * 0.3 * H * k, h3 * 0.5 * H * k * k);
        a.rot(n, h2 * 2 * k, h3 * 2 * k, h1 * 2 * k);
      }
      a.ikW *= 1 - k;
      a.rot('jaw', 0.6 * pulse(u, 0.7, 0.8, 0.9, 1));
      return;
    }
    case 'form': {
      const k = ramp(u, 0, 0.7);
      a.pose.squash *= 0.05 + 0.95 * k;
      a.pose.spread *= 0.4 + 0.6 * k + 0.15 * Math.sin(k * Math.PI);
      a.body(0, 0, 0, 0, (1 - k) * 3, 0);
      a.rotS('armL', 'L', -2.4 * pulse(u, 0.4, 0.65, 0.8, 1), 0, 0.5);
      a.rotS('armR', 'R', -2.4 * pulse(u, 0.4, 0.65, 0.8, 1), 0, 0.5);
      return;
    }
    case 'emerge':
    case 'rise':
    default: {
      // Climbs out of the floor: a hand first, then it hauls itself up and steps clear.
      const depth = riseDepth(u);
      a.body(0, -depth * H, 0, 0.35 * ramp(u, 0, 0.3) * (1 - ramp(u, 0.6, 0.95)), a.style.spawn === 'emerge' ? (1 - u) * 1.5 : 0, 0);
      const reach = 1 - ramp(u, 0.25, 0.55);
      const haul = pulse(u, 0.25, 0.45, 0.7, 0.92);
      a.ikW = ramp(u, 0.75, 0.95);
      a.rotS('armR', 'R', -2.8 * reach - 0.5 * haul, 0, 0.2 + 0.5 * haul);
      a.rotS('armL', 'L', -2.4 * clamp01(reach * 1.4 - 0.2) - 0.5 * haul, 0, 0.2 + 0.5 * haul);
      a.rot('foreR', -1.4 * haul);
      a.rot('foreL', -1.4 * haul);
      a.rot('spine', 0.5 * haul);
      a.rot('head', -0.4 * haul - 0.3 * reach);
      a.rot('jaw', 0.5 * reach);
      // A knee comes up as it climbs onto the floor.
      const knee = pulse(u, 0.45, 0.65, 0.8, 0.98);
      a.rot('legL', -1.2 * knee);
      a.rot('shinL', 1.3 * knee);
      a.rot('legR', 0.3 * haul);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Deaths. Every one ends on the floor (hips at or under a third of their height) and holds.
// ---------------------------------------------------------------------------

function deathUpright(a: CreatureAnimator): void {
  switch (a.style.death) {
    case 'topple':
      return fallBack(a);
    case 'crash':
      return fallForward(a, 0.45, 0.4, 0.78, 1.4);
    case 'scatter':
      fallForward(a, 0.3, 0.22, 0.6, 1);
      return scatterBones(a);
    case 'fade':
      fallForward(a, 0.4, 0.35, 0.8, 0.8);
      a.pose.squash *= 1 - 0.15 * ramp(a.deathT, 0.5, 1);
      return;
    default:
      return fallForward(a, 0.35, 0.25, 0.7, 1);
  }
}

/** Knees buckle, then it pitches onto its face, arms loose, head turned. */
function fallForward(a: CreatureAnimator, buckleEnd: number, fallStart: number, fallEnd: number, weight: number): void {
  const u = a.deathT;
  const H = a.info.height;
  const buckle = ramp(u, 0, buckleEnd);
  const f = clamp01((u - fallStart) / (fallEnd - fallStart));
  const fall = f * f;
  const sideRoll = a.fallDir * 0.25;
  a.ikW = 1 - ramp(u, 0.02, buckleEnd * 0.7);
  // Kneel, then the legs trail out behind as it goes down.
  const kneel = buckle * (1 - fall);
  for (const s of ['L', 'R'] as const) {
    const lag = s === 'L' ? 1 : 0.8;
    a.rot(`leg${s}`, -1.05 * kneel * lag + 0.12 * fall);
    a.rot(`shin${s}`, 1.7 * kneel * lag + 0.35 * fall * lag);
    a.rot(`foot${s}`, -0.4 * kneel + 0.7 * fall);
    a.rot(`hock${s}`, -0.5 * kneel);
  }
  a.move('hips', 0, -0.3 * a.legLen * kneel, 0);
  a.rot('spine', 0.45 * buckle * (1 - fall * 0.8), 0, 0);
  a.rot('chest', 0.25 * buckle * (1 - fall), 0, 0);
  a.rot('neck', 0.3 * buckle * (1 - fall));
  // The face turns to the side on the floor.
  a.rot('head', 0.35 * buckle * (1 - fall) - 0.2 * fall, 0.9 * fall * a.fallDir, 0.3 * fall * a.fallDir);
  a.rot('jaw', 0.4 * buckle);
  // Arms: limp, then thrown out on the floor.
  a.rotS('armL', 'L', 0.3 * buckle - 0.2 * fall, 0, 0.15 * buckle + 0.55 * fall);
  a.rotS('armR', 'R', 0.3 * buckle - 0.6 * fall, 0, 0.15 * buckle + 0.35 * fall);
  a.rot('foreL', -0.3 * buckle * (1 - fall) - 0.4 * fall);
  a.rot('foreR', -0.3 * buckle * (1 - fall) - 0.9 * fall);
  // Wings follow through past the impact (a wide span stopping dead jolts at the tips).
  const ft = u > fallEnd ? 0.4 * (1 - Math.exp(-(u - fallEnd) / 0.06)) : 0;
  a.rotS('wingL', 'L', 0.2 * fall + ft, 0.4 * fall, 0.5 * fall);
  a.rotS('wingR', 'R', 0.2 * fall + ft, 0.4 * fall, 0.5 * fall);
  for (let i = 1; i <= 6; i++) a.rot(`tail${i}`, 0.15 * fall, 0.25 * fall * a.fallDir, 0);
  const bounce = thud(u, fallEnd, weight);
  a.body(0, 0.02 * H * fall + bounce * H, 0, 1.42 * fall + bounce, a.fallYaw, sideRoll * fall);
}

/** Stiff, backward: one knee up, arms flung wide, head back. */
function fallBack(a: CreatureAnimator): void {
  const u = a.deathT;
  const H = a.info.height;
  const reel = ramp(u, 0, 0.25);
  const f = clamp01((u - 0.15) / 0.55);
  const fall = f * f;
  a.ikW = 1 - ramp(u, 0.05, 0.3);
  a.move('hips', 0, -0.08 * a.legLen * reel * (1 - fall), -0.05 * a.hipY * reel);
  a.rot('spine', -0.2 * reel, 0, 0);
  a.rot('chest', -0.2 * reel + 0.1 * fall);
  a.rot('head', -0.4 * reel + 0.2 * fall, 0.7 * fall * a.fallDir, 0);
  a.rot('jaw', 0.6 * reel);
  a.rotS('armL', 'L', -0.6 * reel - 0.6 * fall, 0, 0.5 * reel + 0.7 * fall);
  a.rotS('armR', 'R', -0.4 * reel - 1.1 * fall, 0, 0.4 * reel + 0.5 * fall);
  a.rot('foreL', -0.3 * fall);
  a.rot('foreR', -0.6 * fall);
  const up = a.fallDir > 0 ? 'L' : 'R';
  a.rot(`leg${up}`, -0.7 * fall);
  a.rot(`shin${up}`, 1.2 * fall);
  a.rot(`foot${up === 'L' ? 'R' : 'L'}`, -0.6 * fall);
  const bounce = thud(u, 0.7, 1);
  a.body(0, 0.03 * H * fall + bounce * H, -0.05 * H * fall, -1.45 * fall - bounce, a.fallYaw, -0.15 * a.fallDir * fall);
}

/** After the fall, the frame comes apart a little: bones spread over the floor. */
function scatterBones(a: CreatureAnimator): void {
  const k = ramp(a.deathT, 0.55, 0.9);
  if (k <= 0) return;
  const H = a.info.height;
  for (const n of a.names) {
    if (n === 'root' || n === 'hips') continue;
    const h1 = nameHash(n, 7) - 0.5;
    const h2 = nameHash(n, 9) - 0.5;
    a.move(n, h1 * 0.08 * H * k, 0, h2 * 0.08 * H * k);
    a.rot(n, 0, h2 * 0.6 * k, h1 * 0.6 * k);
  }
  a.rot('jaw', 0.5 * k);
}

/** The specter's death: it rears, shudders, and its robes fold down onto the floor. */
function deathSpecter(a: CreatureAnimator): void {
  const u = a.deathT;
  const H = a.info.height;
  const rear = pulse(u, 0, 0.2, 0.35, 0.6);
  const sink = ramp(u, 0.25, 0.9);
  a.body(0, 0.06 * H * rear - 0.4 * H * sink, 0, -0.3 * rear + 0.9 * sink, a.fallYaw, 0.2 * a.fallDir * sink);
  a.rot('chest', -0.4 * rear + 0.3 * sink, Math.sin(a.time * 40) * 0.08 * rear, 0);
  a.rot('head', -0.6 * rear + 0.5 * sink);
  a.rot('jaw', 0.9 * rear + 0.4 * sink);
  a.rotS('armL', 'L', -1.6 * rear + 0.4 * sink, 0, 0.8 * rear + 0.6 * sink);
  a.rotS('armR', 'R', -1.6 * rear + 0.4 * sink, 0, 0.8 * rear + 0.6 * sink);
  for (const n of ['F', 'B', 'L', 'R']) {
    a.rot(`robe${n}1`, -0.5 * sink, 0, 0);
    a.rot(`robe${n}2`, -0.6 * sink, 0, 0);
  }
  a.pose.squash *= 1 - 0.45 * sink;
  a.pose.spread *= 1 + 0.25 * sink;
}
