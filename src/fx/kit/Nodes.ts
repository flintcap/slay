/**
 * SLAY vfx kit: shader pieces shared by the instanced effect families, in
 * TSL (three.js's node shading language).
 *
 * Every family shades through the same three-stop ramp and premultiplied
 * blend: `rgb` is light added, `a` is how much of what is behind it hides.
 */
import * as THREE from 'three/webgpu';
import { Discard, Fn, attribute, dot, exp, float, floor, fract, mix, pow, sin, smoothstep, vec2, vec4 } from 'three/tsl';
import { unpackRGB } from './Palette';
import { FX_EXPOSURE } from './Exposure';
import { vary, type F, type V2, type V3, type V4 } from '../../core/Tsl';

/** Hash of a 2D point in 0..1. */
export const fxh = Fn(([p]: [V2]): F => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)), {
  name: 'fxh',
  type: 'float',
  inputs: [{ name: 'p', type: 'vec2' }],
}) as unknown as (p: V2) => F;

/** Smooth value noise in 0..1. */
export const fxn = Fn(([p]: [V2]): F => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2.0).add(3.0));
  return mix(mix(fxh(i), fxh(i.add(vec2(1.0, 0.0))), u.x), mix(fxh(i.add(vec2(0.0, 1.0))), fxh(i.add(vec2(1.0, 1.0))), u.x), u.y);
}, {
  name: 'fxn',
  type: 'float',
  inputs: [{ name: 'p', type: 'vec2' }],
}) as unknown as (p: V2) => F;

/** Four octaves of `fxn`. */
export const fxf = Fn(([p]: [V2]): F =>
  fxn(p).mul(0.5).add(fxn(p.mul(2.03)).mul(0.25)).add(fxn(p.mul(4.07)).mul(0.125)).add(fxn(p.mul(8.1)).mul(0.0625)), {
  name: 'fxf',
  type: 'float',
  inputs: [{ name: 'p', type: 'vec2' }],
}) as unknown as (p: V2) => F;

/** exp(-(x / w)^2): a soft band of width `w`. */
export function band(x: F, w: number): F {
  return exp(pow(x.div(w), 2.0).negate());
}

/** Heat through the ramp: tail -> body -> core. */
export function fxRamp(tail: V3, body: V3, core: V3, h: F): V3 {
  return mix(mix(tail, body, smoothstep(0.05, 0.5, h)), core, smoothstep(0.62, 0.98, h));
}

/** The per-instance colours and style row every family reads (iC, iD). */
export interface KitInstance {
  core: V3;
  body: V3;
  tail: V3;
  emit: F;
  /** style, fade (0..1), seed, param */
  D: V4;
}

/** The instance's ramp and style, handed from the vertex stage. */
export function kitInstance(): KitInstance {
  const iC = attribute<'vec4'>('iC', 'vec4');
  const iD = attribute<'vec4'>('iD', 'vec4');
  return {
    core: vary(unpackRGB(iC.x)),
    body: vary(unpackRGB(iC.y)),
    tail: vary(unpackRGB(iC.z)),
    emit: vary(iC.w),
    D: vary(iD),
  };
}

/**
 * The shared ending: ramp, light, premultiplied output, and a discard where
 * nothing shows. Call inside a `Fn` body.
 */
export function kitOut(v: KitInstance, heat0: F, cov0: F, occl: F, exposed = true): V4 {
  const heat = heat0.clamp(0.0, 1.0).toVar();
  const cov = cov0.toVar();
  Discard(cov.lessThan(0.003));
  const col = fxRamp(v.tail, v.body, v.core, heat);
  const light = col.mul(v.emit).mul(heat.mul(1.1).add(0.2));
  const rgb = light.mul(cov);
  return vec4(exposed ? rgb.mul(FX_EXPOSURE) : rgb, cov.mul(occl));
}

/** A kit material: unlit, no fog, its whole pixel output given by `frag`. */
export function kitMaterial(name: string, frag: () => V4, o: { vertex?: V4; position?: V3 } = {}): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial({ name, side: THREE.DoubleSide, depthTest: true });
  m.fog = false;
  // One pass for both faces: three would draw a see-through two-sided
  // material twice (back faces, then front), for nothing on a glow.
  m.forceSinglePass = true;
  if (o.vertex) m.vertexNode = o.vertex;
  if (o.position) m.positionNode = o.position;
  m.fragmentNode = Fn(frag)() as unknown as V4;
  return m;
}

/** A float that branches assign to (`heat`, `cov`, `occl`). */
export function slot(v = 0): F {
  return float(v).toVar();
}
