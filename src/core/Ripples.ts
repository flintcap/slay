/**
 * SLAY — the screen bends: shockwaves, heat haze and portals.
 *
 * Effects drop a ripple at a world point (`ripple`), or hold one there while
 * something lasts (`holdRipple`, a gateway). Each frame the renderer projects
 * the strongest few onto the screen (`writeRipples`) and the grade pass moves
 * where it reads the finished frame by their sum (`rippleOffset`): the world
 * behind a blast rings outward, the air over a fire wavers, a portal's edge
 * swirls. It rides the pass that draws the frame anyway, so it is no extra
 * draw, and with no ripple live its loop runs no times.
 *
 * Reduced motion turns it down (`setRippleScale`).
 */
import * as THREE from 'three/webgpu';
import { Loop, exp, float, int, length, max, sin, smoothstep, uniform, uniformArray, vec2 } from 'three/tsl';
import type { V2 } from './Tsl';

export type RippleKind = 'shock' | 'heat' | 'portal';

const KIND: Record<RippleKind, number> = { shock: 0, heat: 1, portal: 2 };
/** Ripples drawn at once (the strongest on screen). */
const SLOTS = 8;
/** Ripples kept live; past this the faintest goes. */
const MAX_LIVE = 32;

interface Ripple {
  kind: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  dur: number;
  t: number;
  strength: number;
  /** Held until released (a portal). */
  held: boolean;
  /** Released: fading out over `dur`. */
  fading: boolean;
  gen: number;
}

export interface RippleHandle {
  readonly r: Ripple;
  readonly gen: number;
}

const live: Ripple[] = [];
let stamp = 0;

/** Two vec4 per slot: screen centre (y down), radius in frame heights, ring progress; kind, strength, age. */
const slots = Array.from({ length: SLOTS * 2 }, () => new THREE.Vector4());
const uSlots = uniformArray<'vec4'>(slots, 'vec4');
const uCount = uniform(0, 'int');
const uAspect = uniform(16 / 9);
const uTime = uniform(0);
const uScale = uniform(1);

/** A ripple that plays once: a shock rings out to `radius` (metres), heat wavers, a portal swirls. */
export function ripple(kind: RippleKind, x: number, y: number, z: number, radius: number, duration: number, strength = 1): void {
  if (!(radius > 0) || !(duration > 0) || !(strength > 0)) return;
  add({ kind: KIND[kind], x, y, z, radius, dur: duration, t: 0, strength, held: false, fading: false, gen: ++stamp });
}

/** A ripple that stays until `releaseRipple` (a gateway standing open, a burning floor). */
export function holdRipple(kind: RippleKind, x: number, y: number, z: number, radius: number, strength = 1): RippleHandle {
  const r: Ripple = { kind: KIND[kind], x, y, z, radius, dur: Infinity, t: 0, strength, held: true, fading: false, gen: ++stamp };
  add(r);
  return { r, gen: r.gen };
}

export function moveRipple(h: RippleHandle | null, x: number, y: number, z: number): void {
  if (!h || h.r.gen !== h.gen) return;
  h.r.x = x;
  h.r.y = y;
  h.r.z = z;
}

/** Lets a held ripple go, fading over `fade` seconds. */
export function releaseRipple(h: RippleHandle | null, fade = 0.35): void {
  if (!h || h.r.gen !== h.gen || !h.r.held) return;
  h.r.held = false;
  h.r.fading = true;
  h.r.t = 0;
  h.r.dur = Math.max(0.05, fade);
}

/** Drops every ripple (a scene change). */
export function clearRipples(): void {
  for (const r of live) r.gen = -1;
  live.length = 0;
  uCount.value = 0;
}

/** How far the screen may bend, 0..1 (reduced motion sets it low). */
export function setRippleScale(s: number): void {
  uScale.value = Math.max(0, Math.min(1, s));
}

function add(r: Ripple): void {
  if (live.length >= MAX_LIVE) {
    // The faintest held-or-not ripple gives way.
    let worst = 0;
    for (let i = 1; i < live.length; i++) if (weight(live[i]!) < weight(live[worst]!)) worst = i;
    if (weight(live[worst]!) >= weight(r)) return;
    live[worst]!.gen = -1;
    live[worst] = r;
    return;
  }
  live.push(r);
}

/** How much a ripple bends the screen right now, 0..strength. */
function amp(r: Ripple): number {
  if (r.held) return r.strength * Math.min(1, r.t / 0.3);
  const k = Math.min(1, r.t / r.dur);
  if (r.fading) return r.strength * (1 - k);
  // A shock is strongest as it leaves; heat and portals breathe in and out.
  if (r.kind === KIND.shock) return r.strength * Math.pow(1 - k, 1.5);
  return r.strength * Math.min(1, r.t / 0.2) * Math.min(1, (r.dur - r.t) / 0.4);
}

function weight(r: Ripple): number {
  return amp(r) * r.radius;
}

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _right = new THREE.Vector3();
const _order: Ripple[] = [];

/**
 * Ages the ripples by `dt` and writes the strongest on screen into the
 * grade's slots, seen from `camera` on a frame `aspect` wide.
 */
export function writeRipples(camera: THREE.Camera, aspect: number, dt: number, time: number): void {
  uTime.value = time;
  uAspect.value = aspect;
  for (let i = live.length - 1; i >= 0; i--) {
    const r = live[i]!;
    r.t += dt;
    if (!r.held && r.t >= r.dur) {
      r.gen = -1;
      live[i] = live[live.length - 1]!;
      live.pop();
    }
  }
  if (!live.length || uScale.value <= 0) {
    uCount.value = 0;
    return;
  }
  _order.length = 0;
  for (const r of live) if (amp(r) > 0.01) _order.push(r);
  if (_order.length > SLOTS) _order.sort((a, b) => weight(b) - weight(a));
  _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  let n = 0;
  for (const r of _order) {
    if (n >= SLOTS) break;
    _p.set(r.x, r.y, r.z).project(camera);
    if (_p.z > 1 || Math.abs(_p.x) > 1.8 || Math.abs(_p.y) > 1.8) continue;
    _q.set(r.x, r.y, r.z).addScaledVector(_right, r.radius).project(camera);
    // Radius in frame heights (the bend is round on screen).
    const rad = Math.hypot((_q.x - _p.x) * 0.5 * aspect, (_q.y - _p.y) * 0.5);
    if (rad < 1e-3) continue;
    const k = Math.min(1, r.t / r.dur);
    // The shock's ring runs out fast and slows (ease out).
    const prog = r.kind === KIND.shock ? 1 - (1 - k) * (1 - k) : 0;
    slots[n * 2]!.set(_p.x * 0.5 + 0.5, 0.5 - _p.y * 0.5, Math.min(rad, 0.9), prog);
    slots[n * 2 + 1]!.set(r.kind, amp(r), r.t, 0);
    n++;
  }
  uCount.value = n;
}

/**
 * Where the grade should read instead of `p` (a frame position, y down):
 * `p` plus the bend of every live ripple. Built inside the grade's `Fn`.
 */
export function rippleOffset(p0: V2): V2 {
  // Held in variables before the loop: a value first built inside it is
  // only set there, so with no ripple live it would read as zero after it.
  const p = p0.toVar();
  const asp = vec2(uAspect, 1.0).toVar();
  const off = vec2(0.0).toVar();
  Loop(uCount, ({ i }) => {
    const a = uSlots.element(int(i).mul(2)).toVar();
    const b = uSlots.element(int(i).mul(2).add(1)).toVar();
    // Offset from the centre in frame heights, so the bend is round.
    const d = p.sub(a.xy).mul(asp).toVar();
    const r = length(d).toVar();
    const n = d.div(max(r, 1e-4)).toVar();
    const R = a.z;
    const s = b.y;
    const kind = b.x;
    // Shock: a ring of lens running out from the blast.
    const w = R.mul(0.16).add(0.008);
    const x = r.sub(R.mul(a.w)).div(w).toVar();
    const shock = n.mul(x.mul(exp(x.mul(x).negate())).negate().mul(0.022).mul(s));
    // Heat: the air inside wavers, most at the heart.
    const m = smoothstep(R, R.mul(0.15), r).toVar();
    const t = uTime.add(float(i).mul(1.7));
    const heat = vec2(sin(p.y.mul(190.0).add(t.mul(7.0))), sin(p.x.mul(150.0).sub(t.mul(6.0))).mul(0.6)).mul(m.mul(s).mul(0.0026));
    // Portal: the edge swirls round the heart and draws a little in.
    const perp = vec2(n.y.negate(), n.x);
    const swirl = sin(r.div(max(R, 1e-3)).mul(10.0).sub(t.mul(3.0)));
    const portal = perp.mul(swirl.mul(0.5).add(0.7)).mul(0.011).sub(n.mul(0.004)).mul(m.mul(s));
    off.addAssign(kind.lessThan(0.5).select(shock, kind.lessThan(1.5).select(heat, portal)));
  });
  return p.add(off.mul(uScale).div(asp));
}
