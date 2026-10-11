/**
 * SLAY — posers for four-legged beasts, flyers and serpents.
 */
import * as THREE from 'three';
import type { CreatureAnimator } from './Animator';
import { key, type Key } from './Keys';
import { clamp01, pulse, ramp, settle } from './Motion';
import { TAU, dropFall, fidget, idleWeight, riseDepth, thud } from './PoseCommon';

const _p = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * Pitches the whole body by `pitch` around a point on the floor at `pz`
 * (the hind feet for a rear-up, the front feet for a buck), so the feet
 * there stay put.
 */
function pivotPitch(a: CreatureAnimator, pitch: number, pz: number, py = 0): void {
  if (Math.abs(pitch) < 1e-4) return;
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  // Rotating (0, py, pz) about X: y' = py c - pz s, z' = py s + pz c.
  const ry = py * c - pz * s;
  const rz = py * s + pz * c;
  a.body(0, py - ry, pz - rz, pitch);
}

/** Moves a leg's planned foot by the same pitch about the same pivot (front feet rise when it rears). */
function pitchFoot(a: CreatureAnimator, i: number, pitch: number, pz: number): void {
  const t = a.footTarget(i);
  if (!t) return;
  _p.set(t.x, t.y, t.z - pz);
  _e.set(pitch, 0, 0);
  _p.applyEuler(_e);
  t.set(_p.x, _p.y, _p.z + pz);
}

function legIs(a: CreatureAnimator, i: number, front: boolean): boolean {
  const d = a.legDef(i);
  return !!d && d.upper.startsWith('f') === front;
}

// ---------------------------------------------------------------------------
// Quadruped
// ---------------------------------------------------------------------------

const Q_BITE_W: Key = { $body: [0, -0.02, -0.12], chest: [-0.1], neck: [-0.35], head: [0.05], jaw: [0.85] };
const Q_BITE_H: Key = { $body: [0, -0.05, 0.28], chest: [0.15], neck: [0.45], head: [0.25], jaw: [0] };
const Q_GORE_W: Key = { $body: [0, -0.1, -0.08], chest: [0.12], neck: [0.65], head: [0.55] };
const Q_GORE_H: Key = { $body: [0, 0.06, 0.3], chest: [-0.2], neck: [-0.45], head: [-0.55], jaw: [0.3] };
const Q_HOWL: Key = { $body: [0, 0, -0.06], chest: [-0.12], neck: [-0.7], head: [-0.45], jaw: [0.9] };
const Q_SPIT_W: Key = { $body: [0, 0, -0.08], neck: [-0.5], head: [-0.25], jaw: [0.3] };
const Q_SPIT_H: Key = { $body: [0, -0.02, 0.06], neck: [0.3], head: [0.35], jaw: [1.0] };

export function poseQuadruped(a: CreatureAnimator): void {
  const W = a.hipY;
  const L = a.info.length;
  const g = a.gait;
  const run = a.run;
  const heavy = a.style.heavy;
  const c = a.cycle * TAU;
  const hindZ = a.info.joints.hips?.z ?? -L * 0.4;
  const frontZ = a.info.joints.chest?.z ?? L * 0.4;

  if (a.phase === 'death') return deathQuad(a);

  // Stance: head carried a little low for predators, tail with life.
  const prowl = a.style.idle === 'prowl' ? 1 : 0;
  a.rot('neck', 0.1 + 0.15 * prowl);
  a.rot('head', -0.05);
  for (let i = 1; i <= 8; i++) {
    const n = `tail${i}`;
    if (!a.has(n)) break;
    a.rot(n, 0.1 - 0.12 * run * g, Math.sin(a.time * (1.5 + 2 * g) + a.offset - i * 0.55) * (0.1 + 0.1 * g), 0);
  }

  // Locomotion: walk bob, gallop flex.
  if (g > 1e-3) {
    const walk = 1 - run;
    const bob = -(0.02 + 0.02 * heavy) * W * g * walk * (0.5 + 0.5 * Math.cos(2 * c));
    // Gallop: the back flexes and extends, the body rocks.
    const flex = Math.sin(c) * 0.16 * run * g;
    const rock = Math.cos(c) * 0.08 * run * g;
    a.body(0, bob - Math.abs(Math.sin(c)) * 0.03 * W * run * g, 0, rock, 0, Math.max(-0.2, Math.min(0.2, -a.yawRate * 0.06)) * g);
    a.rot('hips', -flex * 0.6, 0.05 * walk * g * Math.cos(c), 0.04 * walk * g * Math.sin(c));
    a.rot('spine', flex, 0, 0);
    a.rot('chest', -flex * 0.5 + 0.08 * run * g, -0.05 * walk * g * Math.cos(c), 0);
    // Head steadies against the body: counter-bob.
    a.rot('neck', 0.12 * run * g - rock * 0.8 + 0.04 * Math.cos(2 * c) * g * walk);
    a.rot('head', -0.1 * run * g + rock * 0.4);
    for (let i = 0; i < a.legCount; i++) {
      const def = a.legDef(i)!;
      const p = a.legPhase(i);
      const d = a.duty;
      const curl = p < d ? 0 : Math.sin(((p - d) / (1 - d)) * Math.PI);
      a.rot(def.foot ?? def.end, (def.upper.startsWith('f') ? -0.9 : 0.5) * curl * g);
    }
  }
  // A frog or toad bounds instead of striding.
  if (a.style.gait === 'hop' && g > 0.05) {
    const hp = Math.abs(Math.sin(c * Math.PI * 0.5 + c * 0.5));
    a.body(0, hp * 0.25 * W * g, 0, -0.15 * hp * g);
  }

  // Idle: breathe, scan, sniff.
  const iw = idleWeight(a);
  if (iw > 1e-3) {
    const br = Math.sin(a.time * (1.6 - 0.6 * heavy) + a.offset);
    a.rot('spine', 0.02 * br * iw);
    a.rot('chest', -0.02 * br * iw);
    a.rot('head', 0, a.wobble(0.35) * 0.3 * iw, 0);
    if (a.style.idle === 'jitter') a.rot('head', a.wobble(5) * 0.08 * iw, a.wobble(3, 2) * 0.2 * iw, 0);
    const f = fidget(a);
    if (f.name === 'look') a.rot('neck', -0.2 * f.w, Math.sin(f.t * TAU) * 0.6 * f.w, 0);
    else if (f.name === 'shift') {
      // Sniff the floor.
      a.rot('neck', 0.55 * f.w);
      a.rot('head', 0.35 * f.w + Math.sin(f.t * 50) * 0.04 * f.w);
    } else if (f.name === 'shake') {
      a.rot('chest', 0, 0, Math.sin(f.t * 45) * 0.12 * f.w);
      a.rot('neck', 0, Math.sin(f.t * 45 + 1) * 0.25 * f.w, 0);
    } else if (f.name === 'roar') key(a, Q_HOWL, pulse(f.t, 0.1, 0.3, 0.7, 0.95));
  }

  // Actions.
  const t = a.t;
  switch (a.phase) {
    case 'windup': {
      const w = ramp(t, 0, 0.5 + 0.15 * heavy);
      if (a.style.ranged && !a.struck) {
        const rel = a.releaseAt();
        key(a, Q_SPIT_W, ramp(t, 0, rel * 0.85) * (1 - ramp(t, rel - 0.02, rel + 0.1)));
        key(a, Q_SPIT_H, ramp(t, rel - 0.02, Math.min(1, rel + 0.1)));
        break;
      }
      quadMove(a, a.attack, w, 0, hindZ, frontZ);
      break;
    }
    case 'strike': {
      const hit = ramp(t, 0, 0.24);
      const back = ramp(t, 0.42 + 0.15 * heavy, 1);
      quadMove(a, a.attack, (1 - hit) * (1 - back), hit * (1 - back), hindZ, frontZ);
      a.rot('chest', settle(t, 0.15, 20, 9) * 0.08);
      break;
    }
    case 'cast': {
      // A howl or a roar: head up, front lifts a little.
      const rel = a.releaseAt();
      const k = ramp(t, 0, rel * 0.6) * (1 - ramp(t, Math.min(0.99, rel + 0.08), 1) * 0.7);
      key(a, Q_HOWL, k);
      pivotPitch(a, -0.18 * k, hindZ);
      for (let i = 0; i < a.legCount; i++) if (legIs(a, i, true)) pitchFoot(a, i, -0.18 * k, hindZ);
      a.rot('head', Math.sin(a.time * 30) * 0.03 * k);
      break;
    }
    default:
  }

  // Flinch: jolt back and away.
  const f = a.flinch;
  if (Math.abs(f) > 1e-3) {
    a.body(-a.flinchSide * 0.04 * W * f, 0, -0.08 * W * f, -0.12 * f, 0, 0.1 * f * a.flinchSide);
    a.rot('neck', -0.35 * f, 0.3 * f * a.flinchSide, 0);
    a.rot('jaw', 0.4 * Math.abs(f));
  }
  if (a.stagger > 0) {
    const s = a.stagger;
    a.body(0, -0.12 * W * s, -0.05 * W * s, 0, 0, Math.sin((1 - s) * 8) * 0.06 * s);
    a.rot('neck', 0.3 * s);
  }
  if (a.phase === 'spawn') spawnQuad(a, hindZ);
}

function quadMove(a: CreatureAnimator, k: string, wind: number, hit: number, hindZ: number, frontZ: number): void {
  const W = a.hipY;
  switch (k) {
    case 'gore':
      key(a, Q_GORE_W, wind);
      key(a, Q_GORE_H, hit);
      return;
    case 'claw': {
      // A forepaw rakes: up and out, then down across.
      for (let i = 0; i < a.legCount; i++) {
        const d = a.legDef(i)!;
        if (!d.upper.startsWith('f') || d.side !== 'R') continue;
        const ft = a.footTarget(i)!;
        ft.y += a.legLen * (0.55 * wind + 0.15 * hit);
        ft.z += a.legLen * (0.25 * wind + 0.5 * hit);
        ft.x += a.legLen * 0.2 * hit;
      }
      a.body(0, 0.04 * W * wind, 0, -0.12 * wind, 0, -0.12 * wind + 0.08 * hit);
      a.rot('neck', -0.2 * wind + 0.2 * hit);
      a.rot('jaw', 0.6 * wind + 0.3 * hit);
      return;
    }
    case 'lunge': {
      // Crouch, then spring: the body flies forward and the feet leave the floor.
      a.body(0, -0.15 * W * wind + 0.25 * W * hit, -0.12 * W * wind + 0.7 * W * hit, 0.08 * wind - 0.2 * hit);
      a.ikW = 1 - 0.85 * hit;
      a.rot('fLegL', -0.9 * hit);
      a.rot('fLegR', -0.9 * hit);
      a.rot('hLegL', 0.7 * hit);
      a.rot('hLegR', 0.7 * hit);
      a.rot('neck', 0.3 * hit - 0.2 * wind);
      a.rot('jaw', 0.9 * hit + 0.3 * wind);
      return;
    }
    case 'stomp':
    case 'slam': {
      // Rear on the hind legs, then come down with the full weight on the forepaws.
      const up = -0.65 * wind;
      pivotPitch(a, up + 0.05 * hit, hindZ);
      for (let i = 0; i < a.legCount; i++) {
        if (!legIs(a, i, true)) continue;
        pitchFoot(a, i, up, hindZ);
        const ft = a.footTarget(i)!;
        ft.y += a.legLen * 0.25 * wind;
        ft.z += a.legLen * 0.3 * hit;
      }
      a.body(0, -0.08 * W * hit, 0);
      a.rot('neck', -0.3 * wind + 0.35 * hit);
      a.rot('jaw', 0.7 * wind);
      void frontZ;
      return;
    }
    default:
      key(a, Q_BITE_W, wind);
      key(a, Q_BITE_H, hit);
  }
}

function spawnQuad(a: CreatureAnimator, hindZ: number): void {
  const u = a.spawnT;
  const H = a.info.height;
  if (a.style.spawn === 'drop' || a.style.spawn === 'swoop') {
    const d = dropFall(u, 0.5);
    a.body(0, d.y * H * 3, 0, 0.15 * d.y);
    if (u < 0.5) a.ikW = 0.2;
    else a.body(0, -0.3 * a.hipY * d.crouch, 0);
    return;
  }
  // Claws its way out of the floor, front first.
  const depth = riseDepth(u);
  const pitch = -0.5 * depth * (1 - ramp(u, 0.6, 0.95));
  a.body(0, -depth * H * 1.1, 0);
  pivotPitch(a, pitch, hindZ);
  a.ikW = ramp(u, 0.7, 0.95);
  // Forelegs scrabble.
  const sc = Math.sin(u * 30) * (1 - ramp(u, 0.6, 0.9));
  a.rot('fLegL', -0.8 * (1 - u) + 0.4 * sc);
  a.rot('fLegR', -0.8 * (1 - u) - 0.4 * sc);
  a.rot('neck', -0.4 * (1 - u));
  a.rot('jaw', 0.6 * pulse(u, 0.5, 0.65, 0.8, 1));
}

function deathQuad(a: CreatureAnimator): void {
  const u = a.deathT;
  const W = a.hipY;
  const kick = 1 - ramp(u, 0.0, 0.45);
  if (a.style.death === 'collapse' || a.style.death === 'crash') {
    // Legs fold under it and it settles on its belly, head down on the floor.
    const fold = ramp(u, 0, a.style.death === 'crash' ? 0.6 : 0.45);
    a.ikW = 1 - ramp(u, 0, 0.3);
    a.body(0, -(W * 0.62) * fold + thud(u, 0.45) * W, 0, 0, a.fallYaw * 0.5, 0.12 * a.fallDir * fold);
    for (const s of ['L', 'R'] as const) {
      a.rot(`fLeg${s}`, -1.0 * fold);
      a.rot(`fShin${s}`, 1.8 * fold);
      a.rot(`hLeg${s}`, -1.0 * fold);
      a.rot(`hShin${s}`, 1.6 * fold);
      a.rot(`hHock${s}`, -1.2 * fold);
    }
    const head = ramp(u, 0.3, 0.8);
    a.rot('neck', 0.75 * head, 0.3 * head * a.fallDir, 0);
    a.rot('head', 0.3 * head, 0, 0.4 * head * a.fallDir);
    a.rot('jaw', 0.4 * head);
    for (let i = 1; i <= 8; i++) a.rot(`tail${i}`, 0.15 * head, 0.2 * head * a.fallDir, 0);
    return;
  }
  // Over onto its side ('flop'), or onto its back ('flip'), legs kicking out stiff.
  const flip = a.style.death === 'flip';
  const f = clamp01((u - 0.1) / 0.45);
  const fall = f * f;
  a.ikW = 1 - ramp(u, 0, 0.25);
  const roll = a.fallDir * (flip ? Math.PI : 1.5) * fall;
  // Lying on its side the body rests about a shoulder-width up; on its back, half its depth.
  const hw = Math.abs(a.info.joints.fLegL?.x ?? W * 0.3);
  const thick = flip ? W * 0.4 : Math.min(W * 0.42, Math.max(W * 0.18, hw * 1.5));
  // Rolling about the floor line: the body centre swings out and down.
  const cr = Math.cos(roll);
  const want = thick + (W - thick) * Math.max(0, cr);
  a.body(Math.sin(roll) * W * 0.7, want - W * cr + thud(u, 0.55, 1.2) * W, 0, 0, a.fallYaw, roll);
  for (const s of ['L', 'R'] as const) {
    const sk = (s === 'L' ? 1 : -1) * Math.sin(a.t * 26) * 0.35 * kick * (1 - fall);
    a.rotS(`fLeg${s}`, s, -0.35 * fall + sk, 0, 0.25 * fall);
    a.rotS(`hLeg${s}`, s, 0.35 * fall - sk, 0, 0.25 * fall);
    a.rot(`fShin${s}`, flip ? 1.2 * fall : 0.3 * fall);
    a.rot(`hShin${s}`, flip ? 1.2 * fall : 0.2 * fall);
  }
  const lol = ramp(u, 0.4, 0.9);
  a.rot('neck', 0.2 * lol, 0, -0.4 * lol * a.fallDir);
  a.rot('head', 0, 0, -0.3 * lol * a.fallDir);
  a.rot('jaw', 0.5 * lol);
  for (let i = 1; i <= 8; i++) a.rot(`tail${i}`, 0, 0.2 * lol, 0);
}

// ---------------------------------------------------------------------------
// Flyer
// ---------------------------------------------------------------------------

export function poseFlyer(a: CreatureAnimator): void {
  const Y = a.hipY;
  const B = a.info.length / 1.6;
  const g = a.gait;
  const heavy = a.style.heavy;
  const upright = (a.info.joints.chest?.y ?? 0) - Y > 0.2 * B;
  if (a.phase === 'death') return deathFlyer(a);
  const t = a.t;

  // Wingbeat: a fast downstroke, a slower folded upstroke. Bats beat fast, wyverns slow.
  const rate = (11 - 6 * heavy) * (1 + 0.25 * g);
  let ph = a.time * rate + a.offset;
  let amp = 0.75 + 0.15 * g;
  // Casting or shooting: the wings flare wide and hold.
  const flare = a.phase === 'cast' ? ramp(t, 0, 0.3) * (1 - ramp(t, 0.85, 1)) : 0;
  amp *= 1 - 0.6 * flare;
  if (flare > 0) ph = ph * (1 - 0.5 * flare);
  wings(a, ph, amp, flare);
  // The body lifts on each downstroke.
  const lift = -Math.cos(ph) * 0.05 * Y;
  const bank = Math.max(-0.4, Math.min(0.4, -a.yawRate * 0.12)) * g;
  a.body(0, lift + Math.sin(a.time * 0.9 + a.offset) * 0.03 * Y, 0, (upright ? 0.15 : 0.25) * g, 0, bank);
  a.rot('chest', Math.cos(ph) * 0.04, 0, 0);
  a.rot('neck', -0.15 * g + Math.cos(ph - 0.5) * 0.05);
  a.rot('head', a.wobble(0.6) * 0.1, a.wobble(0.4, 1) * 0.3 * (1 - g), 0);
  // Legs hang and trail.
  for (const s of ['L', 'R'] as const) {
    a.rot(`leg${s}`, 0.35 * g + Math.sin(ph + 1) * 0.06, 0, 0);
    a.rot(`shin${s}`, 0.4, 0, 0);
    a.rot(`foot${s}`, 0.5, 0, 0);
  }
  a.rotS('armL', 'L', -0.3 + Math.sin(ph) * 0.05, 0, 0.2);
  a.rotS('armR', 'R', -0.3 + Math.sin(ph + 0.4) * 0.05, 0, 0.2);
  a.rot('foreL', -0.6);
  a.rot('foreR', -0.6);
  for (let i = 1; i <= 8; i++) {
    const n = `tail${i}`;
    if (!a.has(n)) break;
    a.rot(n, Math.sin(ph - i * 0.6) * 0.06, Math.sin(a.time * 1.4 + a.offset - i * 0.7) * 0.15, 0);
  }

  // Attacks.
  if (a.phase === 'windup' || a.phase === 'strike') {
    const wind = a.phase === 'windup' ? ramp(t, 0, 0.5) : 1 - ramp(t, 0, 0.15);
    const hit = a.phase === 'strike' ? ramp(t, 0, 0.15) * (1 - ramp(t, 0.45, 1)) : 0;
    const back = a.phase === 'strike' ? ramp(t, 0.45, 1) : 0;
    const w = wind * (1 - back);
    if (a.style.ranged && !a.struck) {
      // Screech or spit: rear back, then thrust the head out.
      const rel = a.releaseAt();
      const d = ramp(t, 0, rel * 0.85);
      const fly = ramp(t, rel - 0.02, Math.min(1, rel + 0.1));
      a.body(0, 0.1 * Y * d, -0.2 * B * d + 0.15 * B * fly, -0.35 * d + 0.3 * fly);
      a.rot('neck', -0.5 * d + 0.6 * fly);
      a.rot('head', -0.3 * d + 0.3 * fly);
      a.rot('jaw', 0.4 * d + 0.6 * fly);
      a.rotS('armL', 'L', -1.6 * fly, 0, 0.3);
      a.rotS('armR', 'R', -1.6 * fly, 0, 0.3);
    } else if (a.attack === 'claw' || a.attack === 'stomp') {
      // Rear back and rake with the talons.
      a.body(0, 0.15 * Y * w, -0.1 * B * w + 0.35 * B * hit, -0.7 * w - 0.4 * hit);
      for (const s of ['L', 'R'] as const) {
        a.rot(`leg${s}`, -1.4 * w - 1.0 * hit);
        a.rot(`shin${s}`, -0.4 * w + 0.6 * hit);
        a.rot(`foot${s}`, -0.6 * w + 0.6 * hit);
      }
      a.rot('jaw', 0.6 * (w + hit));
    } else if (a.attack === 'sting' || a.attack === 'lash') {
      // The tail comes over and strikes past the head.
      for (let i = 1; i <= 8; i++) a.rot(`tail${i}`, -0.4 * w + 0.25 * hit);
      a.body(0, 0.05 * Y * w, 0.3 * B * hit, -0.2 * w + 0.3 * hit);
      a.rotS('armR', 'R', -1.8 * w - 0.8 * hit, 0, 0.4 * w);
      a.rot('foreR', -0.8 * w);
    } else {
      // Dive and bite (or swoop): pull up, then drop onto the target.
      a.body(0, 0.18 * Y * w - 0.35 * Y * hit, -0.15 * B * w + 0.6 * B * hit, -0.25 * w + 0.5 * hit);
      a.rot('neck', -0.4 * w + 0.5 * hit);
      a.rot('jaw', 0.8 * w + 0.2 * hit);
      a.rotS('armL', 'L', -1.4 * hit, 0, 0.4 * hit);
      a.rotS('armR', 'R', -1.4 * hit, 0, 0.4 * hit);
    }
  } else if (a.phase === 'cast') {
    const rel = a.releaseAt();
    const k = ramp(t, 0, rel * 0.7);
    const p = ramp(t, rel - 0.05, Math.min(1, rel + 0.06));
    a.body(0, 0.15 * Y * k * (1 - p * 0.5), -0.1 * B * k, -0.35 * k + 0.25 * p);
    a.rot('neck', -0.4 * k + 0.4 * p);
    a.rot('jaw', 0.5 * k + 0.4 * p);
    a.rotS('armL', 'L', -2.0 * k + 0.6 * p, 0, 0.6 * k - 0.4 * p);
    a.rotS('armR', 'R', -2.0 * k + 0.6 * p, 0, 0.6 * k - 0.4 * p);
    a.rot('foreL', -0.8 * k * (1 - p));
    a.rot('foreR', -0.8 * k * (1 - p));
  }

  const f = a.flinch;
  if (Math.abs(f) > 1e-3) {
    a.body(-a.flinchSide * 0.06 * Y * f, 0.05 * Y * f, -0.1 * Y * f, -0.3 * f, 0, 0.25 * f * a.flinchSide);
    a.rot('neck', -0.4 * f);
  }
  if (a.stagger > 0) a.body(0, -0.25 * Y * a.stagger, 0, 0.2 * a.stagger, 0, Math.sin(a.time * 12) * 0.2 * a.stagger);

  if (a.phase === 'spawn') {
    const u = a.spawnT;
    // Swoops in from high behind, flares and settles into its hover.
    const k = 1 - ramp(u, 0, 0.8);
    a.body(0, k * k * a.info.height * 3, -k * k * a.info.length * 3, 0.5 * k, 0, Math.sin(u * 6) * 0.3 * k);
    a.pose.squash *= 0.3 + 0.7 * ramp(u, 0, 0.3);
    a.pose.spread *= 0.3 + 0.7 * ramp(u, 0, 0.3);
  }
}

function wings(a: CreatureAnimator, ph: number, amp: number, flare: number): void {
  const down = Math.sin(ph);
  // Upstroke folds the outer wing back; the downstroke spreads it.
  const fold = Math.max(0, Math.cos(ph)) * 0.5;
  for (const s of ['L', 'R'] as const) {
    const lag = s === 'L' ? 0 : 0.05;
    a.rotS(`wing${s}`, s, 0, 0.1 - 0.4 * flare, amp * Math.sin(ph + lag) * 0.9 + 0.1 + 0.25 * flare);
    a.rotS(`wing${s}2`, s, 0, 0.5 * fold * (1 - flare), amp * Math.sin(ph - 0.6) * 0.4 - fold * 0.3);
    a.rotS(`wing${s}3`, s, 0, 0.35 * fold * (1 - flare), amp * Math.sin(ph - 1.2) * 0.35);
  }
  void down;
}

function deathFlyer(a: CreatureAnimator): void {
  const u = a.deathT;
  const Y = a.hipY;
  const B = a.info.length / 1.6;
  // A few failing beats, then the wings fold and it drops; a broken sprawl on the floor.
  const beat = 1 - ramp(u, 0, 0.3);
  const f = clamp01((u - 0.1) / 0.5);
  const fall = f * f;
  const ground = ramp(u, 0.55, 0.8);
  wings(a, a.time * 14 + a.offset, 0.6 * beat, 0);
  for (const s of ['L', 'R'] as const) {
    // Folded as it falls, splayed when it lands.
    const sx = s === 'L' ? 1 : -1;
    a.rotS(`wing${s}`, s, 0.3 * fall * (1 - ground), 0.5 * fall * (1 - ground), -0.8 * fall * (1 - ground) - 0.25 * ground);
    a.rotS(`wing${s}2`, s, 0, 0.3 * ground * sx * a.fallDir, -0.3 * ground);
    a.rot(`leg${s}`, -0.6 * ground);
    a.rot(`shin${s}`, 1.0 * ground);
  }
  const thick = 0.18 * B;
  a.body(0, (-Y + thick) * fall + thud(u, 0.6, 1.2) * Y, 0.2 * B * fall, 0.4 * fall, a.fallYaw, 0.35 * a.fallDir * ground);
  a.rot('neck', 0.4 * ground, 0.5 * ground * a.fallDir, 0);
  a.rot('head', 0, 0, 0.5 * ground * a.fallDir);
  a.rot('jaw', 0.5 * ramp(u, 0.2, 0.6));
  a.rotS('armL', 'L', -0.4 * ground, 0, 0.8 * ground);
  a.rotS('armR', 'R', -0.9 * ground, 0, 0.5 * ground);
  for (let i = 1; i <= 8; i++) a.rot(`tail${i}`, 0, 0.25 * ground * a.fallDir, 0);
}

// ---------------------------------------------------------------------------
// Serpent
// ---------------------------------------------------------------------------

function chain(a: CreatureAnimator, prefix: string): string[] {
  const out: string[] = [];
  for (let i = 1; i < 20; i++) {
    const n = `${prefix}${i}`;
    if (!a.has(n)) break;
    out.push(n);
  }
  return out;
}

export function poseSerpent(a: CreatureAnimator): void {
  const f = chain(a, 'f');
  const tl = chain(a, 't');
  const g = a.gait;
  const L = a.info.length;
  const heavy = a.style.heavy;
  if (a.phase === 'death') return deathSerpent(a, f, tl);
  // Slither: a wave runs from head to tail, bigger toward the tail.
  const ph = a.cycle * TAU * 2 + a.time * 0.8 * (1 - g);
  const amp = 0.18 + 0.22 * g;
  for (let i = 0; i < tl.length; i++) {
    const k = (i + 1) / tl.length;
    a.rot(tl[i]!, 0, amp * (0.6 + 0.6 * k) * Math.sin(ph - (i + 1) * 0.9), 0);
  }
  // The reared front sways slowly, steadier at the head, lower when it moves fast.
  const sway = Math.sin(a.time * 1.1 + a.offset);
  for (let i = 0; i < f.length; i++) {
    const k = 1 - i / f.length;
    a.rot(f[i]!, 0.12 * g * k, (0.12 * sway + 0.15 * g * Math.sin(ph + (i + 1) * 0.9)) * k, 0.04 * sway);
  }
  a.rot('body', 0, amp * 0.5 * Math.sin(ph), 0);
  a.rot('head', -0.12 * g, -0.1 * sway + a.wobble(0.5) * 0.15, 0);
  // Tongue-flick of the jaw now and then.
  a.rot('jaw', Math.max(0, Math.sin(a.time * 2.3 + a.offset) - 0.8) * 1.5);

  const t = a.t;
  if (a.phase === 'windup' || a.phase === 'strike' || a.phase === 'cast') {
    const wind = a.phase === 'strike' ? 1 - ramp(t, 0, 0.12) : ramp(t, 0, 0.5);
    const hit = a.phase === 'strike' ? ramp(t, 0, 0.12) * (1 - ramp(t, 0.45 + 0.15 * heavy, 1)) : 0;
    const cast = a.phase === 'cast' ? ramp(t, 0, 0.5) * (1 - ramp(t, 0.92, 1)) : 0;
    const ranged = a.style.ranged && !a.struck && a.phase === 'windup';
    const lash = a.attack === 'lash' || a.attack === 'swing';
    if (lash && !ranged) {
      // The tail sweeps round.
      for (let i = 0; i < tl.length; i++) a.rot(tl[i]!, 0, (-0.35 * wind + 0.45 * hit) * (1 + i * 0.2), 0);
      a.rot('body', 0, -0.25 * wind + 0.35 * hit, 0);
    } else if ((a.attack === 'slam' || a.attack === 'engulf') && !ranged) {
      // Rear high and crash down.
      for (let i = 0; i < f.length; i++) a.rot(f[i]!, -0.25 * wind + 0.4 * hit);
      a.body(0, 0.1 * L * wind - 0.05 * L * hit, 0.12 * L * hit);
      a.rot('jaw', 0.9 * (wind + hit) * 0.6);
    } else {
      // Coil back into an S, then strike straight out.
      const w = ranged ? ramp(t, 0, a.releaseAt() * 0.85) : wind;
      const out = ranged ? ramp(t, a.releaseAt() - 0.02, Math.min(1, a.releaseAt() + 0.1)) : hit;
      const k = Math.max(cast, 0);
      for (let i = 0; i < f.length; i++) {
        const s = i % 2 === 0 ? -1 : 1;
        a.rot(f[i]!, (s * 0.35 - 0.1) * Math.max(w, k) * (1 - out) + 0.22 * out);
      }
      a.rot('head', 0.25 * Math.max(w, k) - 0.1 * out);
      a.rot('jaw', 0.9 * Math.max(w * 0.6, out) + 0.5 * k);
      a.body(0, 0, -0.06 * L * w + 0.18 * L * out);
    }
  }
  const fl = a.flinch;
  if (Math.abs(fl) > 1e-3) {
    for (let i = 0; i < f.length; i++) a.rot(f[i]!, -0.2 * fl, 0.2 * fl * a.flinchSide, 0);
    a.rot('jaw', 0.5 * Math.abs(fl));
  }
  if (a.stagger > 0) for (let i = 0; i < f.length; i++) a.rot(f[i]!, 0.25 * a.stagger, 0, Math.sin(a.time * 10) * 0.1 * a.stagger);
  if (a.phase === 'spawn') {
    // Bursts up out of the floor, head first, and settles into its rear.
    const u = a.spawnT;
    const depth = riseDepth(u);
    a.body(0, -depth * a.info.height * 1.2, 0, -0.6 * depth);
    for (let i = 0; i < f.length; i++) a.rot(f[i]!, -0.2 * pulse(u, 0.3, 0.5, 0.7, 1));
    a.rot('jaw', 1.0 * pulse(u, 0.4, 0.55, 0.75, 1));
  }
}

function deathSerpent(a: CreatureAnimator, f: string[], tl: string[]): void {
  const u = a.deathT;
  const H = a.hipY;
  const thrash = (1 - ramp(u, 0.1, 0.5)) * Math.sin(a.t * 22);
  const drop = ramp(u, 0.15, 0.7);
  // The front falls to the floor, the body curls and rolls to show its belly.
  for (let i = 0; i < f.length; i++) a.rot(f[i]!, 0.5 * drop, 0.3 * thrash + 0.25 * drop * a.fallDir, 0);
  const coil = a.style.death === 'coil' ? 0.45 : 0.18;
  for (let i = 0; i < tl.length; i++) a.rot(tl[i]!, 0, (coil * drop + 0.25 * thrash) * a.fallDir, 0);
  a.rot('head', 0.3 * drop, 0, 0.6 * drop * a.fallDir);
  a.rot('jaw', 0.7 * ramp(u, 0.2, 0.6));
  a.body(0, -0.3 * H * drop + thud(u, 0.7) * H, 0, 0, a.fallYaw, 0.9 * a.fallDir * drop);
}
