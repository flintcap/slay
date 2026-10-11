/**
 * SLAY — posers for bodies without a skeleton to speak of: oozes, floaters
 * and swarms. Weight shows as squash and stretch, orbit and drift.
 */
import * as THREE from 'three';
import type { CreatureAnimator } from './Animator';
import { clamp01, pulse, ramp, settle } from './Motion';
import { TAU, dropFall, fidget, idleWeight, nameHash, thud } from './PoseCommon';

const _v = new THREE.Vector3();

/** A bone's bind offset from its parent (model units). */
function localBind(a: CreatureAnimator, name: string, parent: string): THREE.Vector3 {
  const j = a.info.joints[name];
  const p = a.info.joints[parent];
  return j && p ? _v.copy(j).sub(p) : _v.set(0, 0, 0);
}

// ---------------------------------------------------------------------------
// Ooze
// ---------------------------------------------------------------------------

export function poseOoze(a: CreatureAnimator): void {
  const H = a.info.height;
  const g = a.gait;
  const heavy = a.style.heavy;
  const c = a.cycle * TAU;
  if (a.phase === 'death') return deathOoze(a);
  // Rolling forward: it heaves up and spreads, twice a stride, but never
  // faster than a mass can heave (small fast oozes would buzz).
  const heave = Math.sin(a.spin(4, TAU * 2 * Math.min(a.strideRate, 1.6))) * g;
  const br = Math.sin(a.time * (1.6 - 0.6 * heavy) + a.offset);
  let sq = 1 + 0.1 * heave + 0.03 * br * (1 - g);
  a.rot('top', 0.25 * g * a.vel.z + 0.06 * heave, 0, -0.25 * g * a.vel.x);
  a.move('top', 0, 0.04 * H * heave, -0.06 * H * g);
  a.rot('body', 0.08 * g, 0, 0);
  for (let i = 0; i < 12; i++) {
    const n = `lobe${i}`;
    if (!a.has(n)) break;
    const ph = a.time * 2.2 + i * 1.7 + a.offset;
    a.move(n, 0, Math.sin(ph) * 0.03 * H, 0);
    a.rot(n, Math.sin(ph) * 0.15, 0, Math.cos(ph) * 0.15);
  }
  for (const s of ['L', 'R'] as const) {
    const ph = a.time * 1.8 + (s === 'L' ? 0 : 2) + a.offset;
    a.rotS(`pod${s}`, s, 0.25 * g + Math.sin(ph) * 0.2, Math.cos(ph) * 0.2, Math.sin(ph * 0.7) * 0.2);
    a.rotS(`pod${s}2`, s, Math.sin(ph - 0.8) * 0.3, 0, 0);
  }
  const f = fidget(a);
  if (f.name === 'roar' || f.name === 'shake') sq *= 1 + 0.12 * Math.sin(f.t * 25) * f.w;

  const t = a.t;
  const ranged = a.style.ranged && !a.struck && a.phase === 'windup';
  if (a.phase === 'windup' || a.phase === 'strike') {
    // A heavy mass takes longer to throw itself over (and must not teleport).
    const fast = 0.32 + 0.24 * heavy;
    const wind = a.phase === 'windup' ? ramp(t, 0, ranged ? a.releaseAt() * 0.85 : 0.5) : 1 - ramp(t, 0, fast);
    const hit = a.phase === 'strike' ? ramp(t, 0, fast) * (1 - ramp(t, 0.45 + 0.15 * heavy, 1)) : ranged ? ramp(t, a.releaseAt() - 0.02, Math.min(1, a.releaseAt() + 0.1)) : 0;
    if (ranged || a.attack === 'hurl') {
      // Spit: draw in tall, then heave it out.
      sq *= 1 + 0.25 * wind * (1 - hit) - 0.2 * hit;
      a.rot('top', -0.3 * wind + 0.5 * hit);
      a.move('top', 0, 0, 0.1 * H * hit);
    } else if (a.attack === 'thrust' || a.attack === 'lash' || a.attack === 'swing') {
      // A pseudopod whips out.
      a.rotS('podR', 'R', -0.8 * wind - 1.2 * hit, 0, 0.6 * wind - 0.2 * hit);
      a.rotS('podR2', 'R', -0.6 * wind + 0.2 * hit, 0, 0);
      a.move('podR', 0, 0, 0.25 * H * hit);
      sq *= 1 + 0.08 * wind - 0.05 * hit;
    } else {
      // Engulf or slam: rise up tall and throw itself over the target.
      sq *= 1 + 0.35 * wind - (0.4 - 0.15 * heavy) * hit;
      a.body(0, 0, -0.05 * H * wind + (0.26 - 0.06 * heavy) * H * hit, 0.4 * hit);
      a.rot('top', -0.3 * wind + (0.55 - 0.1 * heavy) * hit);
      a.rotS('podL', 'L', -1.4 * wind + 0.6 * hit, 0, 0.5 * wind);
      a.rotS('podR', 'R', -1.4 * wind + 0.6 * hit, 0, 0.5 * wind);
    }
    sq *= 1 + settle(t, 0.14, 20, 8) * 0.08 * (a.phase === 'strike' ? 1 : 0);
  } else if (a.phase === 'cast') {
    // A shudder and a pulse.
    const k = pulse(t, 0, 0.4, 0.85, 1);
    sq *= 1 + 0.12 * k * Math.sin(a.time * 22);
    a.rot('top', -0.2 * k);
  }
  const fl = a.flinch;
  sq *= 1 - 0.25 * Math.abs(fl);
  a.rot('top', -0.4 * fl, 0, 0.3 * fl * a.flinchSide);
  if (a.stagger > 0) sq *= 1 - 0.2 * a.stagger * Math.abs(Math.sin(a.time * 10));
  if (a.phase === 'spawn') {
    const u = a.spawnT;
    if (a.style.spawn === 'drop') {
      const d = dropFall(u, 0.45, 0, 11);
      a.body(0, d.y * H * 4, 0);
      // Stretched as it falls, easing round just before it lands, then the splat squat.
      sq *= 1 + 0.22 * (1 - ramp(u, 0.25, 0.45)) - 0.4 * d.crouch;
    } else {
      // Wells up out of a puddle.
      const k = ramp(u, 0, 0.8);
      sq *= 0.08 + 0.92 * k + 0.15 * Math.sin(k * Math.PI);
      a.pose.spread *= 1.5 - 0.5 * k;
    }
  }
  a.pose.squash *= sq;
  // Keeps its volume as it squashes; a smooth floor so a mass welling up from
  // a puddle does not hold wide and then snap in.
  const d = sq - 0.3;
  const floor = d > 0.2 ? sq : d < -0.2 ? 0.3 : 0.3 + ((d + 0.2) * (d + 0.2)) / 0.8;
  a.pose.spread *= 1 / Math.sqrt(floor);
}

function deathOoze(a: CreatureAnimator): void {
  const u = a.deathT;
  // Bulges, then bursts flat into a spreading pool.
  const swell = pulse(u, 0, 0.15, 0.2, 0.35);
  const splat = ramp(u, 0.2, 0.6);
  const sq = (1 + 0.2 * swell) * (1 - 0.82 * splat) + settle(u, 0.6, 18, 7) * 0.05;
  a.pose.squash *= sq;
  a.pose.spread *= (1 + 0.1 * swell) * (1 + 0.7 * splat);
  a.rot('top', 0.3 * splat * a.fallDir, 0, 0.2 * splat);
  for (const s of ['L', 'R'] as const) a.rotS(`pod${s}`, s, 0.6 * splat, 0, 0.6 * splat);
  for (let i = 0; i < 12; i++) a.move(`lobe${i}`, 0, -0.05 * a.info.height * splat, 0);
}

// ---------------------------------------------------------------------------
// Floater
// ---------------------------------------------------------------------------

export function poseFloater(a: CreatureAnimator): void {
  const Y = a.hipY;
  const R = a.info.length / 2;
  const g = a.gait;
  const t = a.t;
  if (a.phase === 'death') return deathFloater(a);
  const spin = a.phase === 'cast' ? 1 + 3 * pulse(t, 0, 0.3, 0.8, 1) : 1;
  // Hover and drift; tip into travel.
  a.body(0, Math.sin(a.time * 1.5 + a.offset) * 0.06 * Y, 0, 0.25 * g * a.vel.z + Math.sin(a.time * 0.7 + a.offset) * 0.05, 0, -0.25 * g * a.vel.x);
  // The eye looks round, darting now and then.
  const dart = Math.floor(a.time * 0.6 + a.offset);
  const look = (nameHash(String(dart), 3) - 0.5) * 0.9 * idleWeight(a);
  a.rot('eye', (nameHash(String(dart), 5) - 0.5) * 0.4 * idleWeight(a), look, 0);
  // Integrated, so the orbit speeds up for a cast without jumping.
  const orbit = a.spin(3, 0.9 * spin);
  a.rot('crown', 0, orbit / 3, Math.sin(a.time * 1.1) * 0.05);
  // Orbiting satellites.
  for (let i = 0; i < 12; i++) {
    const n = `orb${i}`;
    if (!a.has(n)) break;
    const p = localBind(a, n, 'core');
    const ang = orbit;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const out = 1 + 0.3 * (spin - 1) * 0.3;
    a.move(n, (p.x * c + p.z * s) * out - p.x, Math.sin(a.time * 2 + i) * 0.08 * R, (-p.x * s + p.z * c) * out - p.z);
    a.rot(n, a.time * 1.3, a.time * 0.7 + i, 0);
  }
  // Tendrils hang and sway, trailing behind when it moves.
  for (let i = 0; i < 16; i++) {
    if (!a.has(`ten${i}_1`)) break;
    for (let k = 1; k <= 6; k++) {
      const n = `ten${i}_${k}`;
      if (!a.has(n)) break;
      const ph = a.time * 1.8 + i * 1.3 + k * 0.7 + a.offset;
      a.rot(n, 0.3 * g * a.vel.z / k + Math.sin(ph) * 0.15, 0, -0.3 * g * a.vel.x / k + Math.cos(ph * 0.8) * 0.12);
    }
  }
  if (a.phase === 'windup' || a.phase === 'strike') {
    // Tall floaters (pylons, totems) swing their tops far, so the lunge eases in.
    const wind = a.phase === 'windup' ? ramp(t, 0, 0.6) : 1 - ramp(t, 0, 0.26);
    const hit = a.phase === 'strike' ? ramp(t, 0, 0.26) * (1 - ramp(t, 0.55, 1)) : 0;
    const ranged = a.style.ranged && !a.struck && a.phase === 'windup';
    const fly = ranged ? ramp(t, a.releaseAt() - 0.02, Math.min(1, a.releaseAt() + 0.1)) : 0;
    // Draws back and swells, then lunges (or recoils as its bolt leaves).
    a.body(0, 0.05 * Y * wind, -0.15 * R * wind + 0.5 * R * hit - 0.2 * R * fly, -0.2 * wind + 0.3 * hit);
    a.pose.spread *= 1 + 0.1 * wind - 0.05 * fly;
    a.rot('eye', -0.2 * wind, 0, 0);
    for (let i = 0; i < 16; i++) for (let k = 1; k <= 6; k++) a.rot(`ten${i}_${k}`, -0.5 * hit / k - 0.2 * wind, 0, 0);
  } else if (a.phase === 'cast') {
    const k = pulse(t, 0, 0.4, 0.85, 1);
    a.body(0, 0.1 * Y * k, 0, -0.15 * k);
    a.pose.spread *= 1 + 0.06 * Math.sin(a.time * 20) * k;
    for (let i = 0; i < 16; i++) for (let s = 1; s <= 6; s++) a.rot(`ten${i}_${s}`, -0.4 * k, 0, 0);
  }
  const fl = a.flinch;
  a.body(-a.flinchSide * 0.08 * R * fl, 0.05 * Y * Math.abs(fl), -0.12 * R * fl, -0.4 * fl, 0, 0.3 * fl * a.flinchSide);
  if (a.stagger > 0) a.body(0, -0.2 * Y * a.stagger, 0, 0.3 * a.stagger * Math.sin(a.time * 8), 0, 0.3 * a.stagger * Math.cos(a.time * 7));
  if (a.phase === 'spawn') {
    const u = a.spawnT;
    const k = ramp(u, 0, 0.7);
    a.pose.squash *= 0.05 + 0.95 * k;
    a.pose.spread *= 0.05 + 0.95 * k + 0.2 * Math.sin(k * Math.PI);
    a.body(0, -(1 - k) * Y * 0.6, 0, 0, (1 - k) * 4);
  }
}

function deathFloater(a: CreatureAnimator): void {
  const u = a.deathT;
  const Y = a.hipY;
  const R = a.info.length / 2;
  // Shudders, then drops out of the air and comes to rest on the floor.
  const shake = (1 - ramp(u, 0.1, 0.35)) * Math.sin(a.t * 40) * 0.1;
  const f = clamp01((u - 0.15) / 0.45);
  const fall = f * f;
  // Down until the core rests on the floor.
  const drop = Math.max(0, Y - R * 0.75);
  a.body(shake * R, -drop * fall + thud(u, 0.6, 1.4) * Y, 0, 0.7 * fall * a.fallDir, a.fallYaw, shake + 0.4 * fall * a.fallDir);
  for (let i = 0; i < 12; i++) {
    const n = `orb${i}`;
    if (!a.has(n)) break;
    // Satellites fall and roll away.
    const p = localBind(a, n, 'core');
    const h = nameHash(n, 4) - 0.5;
    a.move(n, h * R * fall, -Math.max(0, Y + p.y - R * 0.3) * ramp(u, 0.1, 0.5) * 0.9, (nameHash(n, 6) - 0.5) * R * fall);
  }
  for (let i = 0; i < 16; i++) for (let k = 1; k <= 6; k++) a.rot(`ten${i}_${k}`, (nameHash(`t${i}`, k) - 0.5) * 1.2 * fall, 0, 0.6 * fall);
  a.rot('eye', 0.5 * fall, 0, 0);
}

// ---------------------------------------------------------------------------
// Swarm
// ---------------------------------------------------------------------------

export function poseSwarm(a: CreatureAnimator): void {
  const Y = a.hipY;
  const R = a.info.length / 2;
  const g = a.gait;
  const t = a.t;
  const u = a.deathT;
  let tight = 1;
  let surge = 0;
  if (a.phase === 'windup') {
    tight = 1 - 0.4 * ramp(t, 0, 0.6);
  } else if (a.phase === 'strike') {
    surge = ramp(t, 0, 0.14) * (1 - ramp(t, 0.5, 1));
    tight = 0.6 + 0.4 * ramp(t, 0.2, 1);
  } else if (a.phase === 'cast') tight = 1 - 0.5 * pulse(t, 0, 0.4, 0.85, 1);
  const form = a.phase === 'spawn' ? ramp(a.spawnT, 0, 0.8) : 1;
  const dead = a.phase === 'death';
  a.body(0, Math.sin(a.time * 1.2 + a.offset) * 0.05 * Y, 0, 0.2 * g, 0, 0);
  for (let i = 0; i < 72; i++) {
    const n = `mote${i}`;
    if (!a.has(n)) break;
    const p = localBind(a, n, 'core');
    const sp = (0.8 + nameHash(n, 1) * 1.6) * (1 + (1 - tight) * 2);
    const ang = a.spin(8 + i, sp) + nameHash(n, 2) * TAU;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const r = tight * (1 + (1 - form) * 3);
    let x = (p.x * c + p.z * s) * r;
    let z = (-p.x * s + p.z * c) * r;
    let y = p.y * r + Math.sin(3 * ang + i) * 0.1 * R;
    // Trails behind as it moves; surges forward to strike.
    z -= g * 0.3 * R * nameHash(n, 3) - surge * R * (0.6 + nameHash(n, 5));
    if (dead) {
      // Scatter: out, then down to the floor.
      const k = ramp(u, 0, 0.5);
      const fall = ramp(u, 0.2, 0.9);
      x += (nameHash(n, 7) - 0.5) * 3 * R * k;
      z += (nameHash(n, 8) - 0.5) * 3 * R * k;
      y += (0.03 - Y - y) * fall;
    }
    a.move(n, x - p.x, y - p.y, z - p.z);
    a.rot(n, ang * 2, ang, 0);
  }
  const fl = a.flinch;
  a.body(-a.flinchSide * 0.1 * R * fl, 0, -0.15 * R * fl);
  if (a.phase === 'spawn') a.pose.spread *= 0.6 + 0.4 * form;
}
