/**
 * SLAY vfx kit: what lies on the floor.
 *
 * Three families, all instanced quads lying on the ground and drawn by one
 * analytic shader (no texture: every edge stays crisp at any size, and each
 * mark gets its own noise so no two look alike):
 *
 *  - **Marks** (long-lived, dark): scorch, blood, rime, acid, cracks, craters,
 *    bone, lightning scars, scuffs, burnt sigils, ash. They darken the floor
 *    (premultiplied occlusion) and barely glow, so they read on dark ground
 *    without becoming pale discs.
 *  - **Glows** (short, light): cooling cinders, expanding shock rings, rune
 *    circles, aura rings, light pools, burning ground, poison pools, frost
 *    fields, void pools, flame wedges, storm fields, holy ground.
 *  - **Telegraphs** (the read-the-boss layer): the danger area darkens and
 *    takes the attack's colour, a crisp saturated edge draws the shape, the
 *    fill grows from the centre to the edge as the strike comes, the edge
 *    pulses in the last beat and the shape flashes once when it lands.
 *
 * The CPU writes a record per mark; the shader animates it from its age.
 * Glows and telegraphs can be moved (an aura follows its owner).
 */

import * as THREE from 'three/webgpu';
import {
  Discard, Fn, If, abs, atan, attribute, clamp, cos, dot, exp, float, floor, fract, fwidth, length, max, min, mix, positionGeometry, pow,
  sin, smoothstep, step, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import { markRange, markAll } from './Upload';
import { premultiplied } from './Particles';
import { FX_EXPOSURE } from './Exposure';
import { band, fxh, fxn, fxRamp, kitInstance, kitMaterial, slot } from './Nodes';
import { vary, type F, type V2, type V3, type V4 } from '../../core/Tsl';

export const GROUND = {
  // marks
  scorch: 0, blood: 1, gore: 2, rime: 3, acid: 4, crack: 5, crater: 6, bone: 7,
  fork: 8, scuff: 9, sigilBurn: 10, ash: 11, wet: 12, shadow: 13,
  // glows
  cinders: 16, frostGlow: 17, forkGlow: 18, acidGlow: 19, shockRing: 20, runeCircle: 21,
  auraRing: 22, lightPool: 23, firePool: 24, poisonPool: 25, frostField: 26, voidPool: 27,
  wedge: 28, stormField: 29, holyField: 30, sigilGlow: 31,
  // telegraphs
  tgCircle: 32, tgCone: 33, tgLine: 34, tgRing: 35,
} as const;
export type GroundKind = keyof typeof GROUND;

const gh = fxh;
const gn = fxn;

/** Four octaves of `gn` (slightly different lacunarity from `fxf`). */
const gf = Fn(([p]: [V2]): F =>
  gn(p).mul(0.5).add(gn(p.mul(2.03)).mul(0.25)).add(gn(p.mul(4.01)).mul(0.125)).add(gn(p.mul(8.07)).mul(0.0625)), {
  name: 'groundFbm',
  type: 'float',
  inputs: [{ name: 'p', type: 'vec2' }],
}) as unknown as (p: V2) => F;

/** Cracks: distance to cell borders of a jittered grid. */
const cracks = Fn(([p]: [V2]): F => {
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const d1 = float(8.0).toVar();
  const d2 = float(8.0).toVar();
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const g = vec2(x, y);
      const o = vec2(gh(i.add(g)), gh(i.add(g).add(17.0)));
      const d = length(g.add(o).sub(f)).toVar();
      If(d.lessThan(d1), () => {
        d2.assign(d1);
        d1.assign(d);
      }).ElseIf(d.lessThan(d2), () => {
        d2.assign(d);
      });
    }
  }
  return d2.sub(d1);
}, {
  name: 'groundCracks',
  type: 'float',
  inputs: [{ name: 'p', type: 'vec2' }],
}) as unknown as (p: V2) => F;

/** 1 - smoothstep(a, b, x). */
function under(a: number | F, b: number | F, x: F): F {
  return smoothstep(a, b, x).oneMinus();
}

/** The ground shader: marks, glows and telegraphs, chosen per instance by kind. */
function groundMaterial(name: string, uTime: F): THREE.MeshBasicNodeMaterial {
  // x, z, size, rotation
  const iX = attribute<'vec4'>('iX', 'vec4');
  // spawn, life, kind, param
  const iT = attribute<'vec4'>('iT', 'vec4');
  // floor y, fadeIn, seed, param2
  const iE = attribute<'vec4'>('iE', 'vec4');
  const age = uTime.sub(iT.x).toVar();
  const kindV = iT.z;
  // Telegraphs stay one beat past their duration for the landing flash.
  const extra = kindV.greaterThan(31.5).select(0.16, 0.0).uniformFlow().toVar();
  const alive = step(0.0, age).mul(step(age, iT.y.add(extra))).mul(step(0.0001, iT.y));
  const c = cos(iX.w);
  const s = sin(iX.w);
  // -1..1
  const local = positionGeometry.xz.mul(2.0);
  const scaled = local.mul(iX.z).mul(alive);
  // Rotation follows the game's heading convention: local +y points along
  // (sin r, cos r), the way a body facing r looks.
  const rot = vec2(scaled.x.mul(c).add(scaled.y.mul(s)), scaled.x.negate().mul(s).add(scaled.y.mul(c)));
  // Lift scales with kind so stacked layers never fight: marks lowest.
  const lift = kindV.lessThan(15.5).select(0.012, kindV.lessThan(31.5).select(0.02, 0.028)).uniformFlow().toVar();
  const wpos = vec3(iX.x.add(rot.x), iE.x.add(lift), iX.y.add(rot.y));
  const vP = vary(local);
  const vT = vary(iT);
  const vE = vary(iE);
  const vAge = vary(age);
  const vSize = vary(iX.z);
  const v = kitInstance();

  const frag = (): V4 => {
    const kind = vT.z;
    const life = max(vT.y, 1e-3).toVar();
    const t = clamp(vAge.div(life), 0.0, 1.0).toVar();
    const seed = vE.z.mul(61.0).toVar();
    const p = vP;
    const r = length(p).toVar();
    // metre-scaled noise space
    const wp = p.mul(vSize).add(seed).toVar();
    const a = atan(p.y, p.x).toVar();
    // Before any branch: derivatives need every pixel of the quad.
    const px = fwidth(r).mul(1.5).add(0.004).toVar();
    const heat = slot();
    const cov = slot();
    const occl = slot();
    const out = vec4(0.0).toVar();
    const fadeIn = smoothstep(0.0, max(vE.y, 1e-3), vAge).toVar();
    const fadeOut = under(0.7, 1.0, t).toVar();
    const ramp3 = (h: F): V3 => fxRamp(v.tail, v.body, v.core, h);

    If(kind.lessThan(15.5), () => {
      // ------------------------------------------------------------ marks
      const n = gf(wp.mul(1.6)).toVar();
      const dark = slot(0.75);
      If(kind.lessThan(0.5), () => {
        // scorch: charred core, ragged edge
        const edge = under(0.55, 0.95, r.add(n.sub(0.5).mul(0.55)));
        cov.assign(edge.mul(gn(wp.mul(6.0)).mul(0.25).add(0.75)));
        dark.assign(0.85);
      })
        .ElseIf(kind.lessThan(1.5), () => {
          // blood: pool and droplets
          const pool = under(0.45, 0.6, r.add(n.sub(0.5).mul(0.4)));
          const drops = smoothstep(0.78, 0.86, gn(wp.mul(5.0))).mul(under(0.7, 1.0, r));
          cov.assign(max(pool, drops));
          dark.assign(0.7);
        })
        .ElseIf(kind.lessThan(2.5), () => {
          // gore: thrown splatter
          const sp = gf(vec2(a.mul(1.3).add(seed), r.mul(2.0)));
          const arm = smoothstep(0.55, 0.8, sp).mul(under(0.3, 1.0, r));
          const core = under(0.25, 0.45, r.add(n.sub(0.5).mul(0.3)));
          cov.assign(max(core, arm));
          dark.assign(0.75);
        })
        .ElseIf(kind.lessThan(3.5), () => {
          // rime: crystalline sheet with spiky rim
          const spikes = abs(sin(a.mul(9.0).add(seed))).mul(0.15).add(0.85).add(n.sub(0.5).mul(0.3)).toVar();
          cov.assign(under(spikes.sub(0.15), spikes, r).mul(smoothstep(0.02, 0.12, cracks(wp.mul(2.5))).mul(0.45).add(0.55)));
          dark.assign(0.35);
          heat.assign(0.25);
        })
        .ElseIf(kind.lessThan(4.5), () => {
          // acid: pitted pool
          const pool = under(0.55, 0.75, r.add(n.sub(0.5).mul(0.45)));
          const pits = smoothstep(0.65, 0.8, gn(wp.mul(7.0)));
          cov.assign(pool.mul(pits.mul(0.3).add(0.7)));
          dark.assign(0.55);
          heat.assign(0.15);
        })
        .ElseIf(kind.lessThan(5.5), () => {
          // crack: broken ground
          const cr = under(0.0, 0.06, cracks(wp.mul(1.4)));
          cov.assign(cr.mul(under(0.5, 1.0, r)).add(under(0.1, 0.35, r).mul(0.4)));
          dark.assign(0.9);
        })
        .ElseIf(kind.lessThan(6.5), () => {
          // crater: gouged centre, radial cuts
          const rays = smoothstep(0.7, 0.95, gn(vec2(a.mul(4.0).add(seed), r.mul(1.5))));
          const bowl = under(0.3, 0.55, r.add(n.sub(0.5).mul(0.25)));
          const rim = band(r.sub(0.6), 0.12).mul(0.35);
          cov.assign(max(bowl, rays.mul(under(0.5, 1.0, r))).add(rim));
          dark.assign(0.85);
        })
        .ElseIf(kind.lessThan(7.5), () => {
          // bone: scattered splinters
          const g = wp.mul(3.0).toVar();
          const cell = floor(g).toVar();
          const f = fract(g).sub(0.5).toVar();
          const ang = gh(cell).mul(6.28).toVar();
          const q = vec2(f.x.mul(cos(ang)).sub(f.y.mul(sin(ang))), f.x.mul(sin(ang)).add(f.y.mul(cos(ang)))).toVar();
          const splinter = under(0.08, 0.12, abs(q.y)).mul(under(0.25, 0.35, abs(q.x)));
          const keep = step(0.5, gh(cell.add(3.0))).mul(under(0.6, 1.0, r));
          cov.assign(splinter.mul(keep).add(under(0.2, 0.5, r).mul(0.25)));
          dark.assign(0.0);
          heat.assign(0.3);
        })
        .ElseIf(kind.lessThan(8.5), () => {
          // fork: branching scorch lines
          const br = abs(sin(a.mul(3.0).add(gf(vec2(r.mul(3.0), seed)).mul(4.0))));
          const line = under(0.0, 0.12, br.mul(r));
          cov.assign(line.mul(under(0.5, 1.0, r)).add(under(0.08, 0.25, r).mul(0.6)));
          dark.assign(0.9);
        })
        .ElseIf(kind.lessThan(9.5), () => {
          // scuff: a dark smudge
          cov.assign(under(0.2, 1.0, r.add(n.sub(0.5).mul(0.4))).mul(0.5));
          dark.assign(0.8);
        })
        .ElseIf(kind.lessThan(10.5), () => {
          // burnt sigil
          const ring = band(r.sub(0.8), 0.05).add(band(r.sub(0.6), 0.03).mul(0.7));
          const spokes = under(0.0, 0.05, abs(sin(a.mul(3.0))).mul(r)).mul(step(r, 0.8));
          cov.assign(clamp(ring.add(spokes.mul(0.7)), 0.0, 1.0));
          dark.assign(0.85);
        })
        .ElseIf(kind.lessThan(11.5), () => {
          // ash
          cov.assign(under(0.4, 0.95, r.add(n.sub(0.5).mul(0.5))).mul(gn(wp.mul(4.0)).mul(0.5).add(0.5)));
          dark.assign(0.35);
        })
        .ElseIf(kind.lessThan(12.5), () => {
          // wet
          cov.assign(under(0.5, 0.9, r.add(n.sub(0.5).mul(0.4))).mul(0.6));
          dark.assign(0.6);
        })
        .Else(() => {
          // shadow
          cov.assign(pow(max(0.0, r.oneMinus()), 1.5).mul(0.8));
          dark.assign(1.0);
        });
      const alpha = cov.mul(fadeIn).mul(fadeOut).toVar();
      // Marks hide the floor (occlusion) and add a little of their own colour.
      const rgb = v.body.mul(v.emit).mul(heat.add(0.06)).mul(alpha).toVar();
      const oc = alpha.mul(dark).add(alpha.mul(dark.oneMinus()).mul(0.5)).toVar();
      Discard(oc.lessThan(0.003).and(dot(rgb, rgb).lessThan(1e-6)));
      out.assign(vec4(rgb, oc));
    })
      .ElseIf(kind.lessThan(31.5), () => {
        // ------------------------------------------------------------ glows
        const n = gf(wp.mul(1.4).add(vec2(0.0, uTime.mul(-0.3)))).toVar();
        If(kind.lessThan(16.5), () => {
          // cinders: embers cooling to black
          const spots = smoothstep(0.55, 0.85, gf(wp.mul(3.0)));
          const area = under(0.4, 0.95, r.add(n.sub(0.5).mul(0.4)));
          heat.assign(spots.mul(area).mul(t.oneMinus()).mul(sin(uTime.mul(7.0).add(seed).add(wp.x.mul(3.0))).mul(0.25).add(0.75)));
          cov.assign(heat);
          fadeOut.assign(1.0);
        })
          .ElseIf(kind.lessThan(19.5), () => {
            // frost / fork / acid glow over their marks
            const area = under(0.35, 0.9, r.add(n.sub(0.5).mul(0.45)));
            const forked = under(0.0, 0.1, abs(sin(a.mul(3.0).add(gf(vec2(r.mul(3.0), seed)).mul(4.0)))).mul(r));
            const lines = kind.greaterThan(17.5).and(kind.lessThan(18.5)).select(forked, float(1.0)).uniformFlow().toVar();
            heat.assign(area.mul(lines).mul(t.oneMinus()).mul(0.8));
            cov.assign(heat);
            fadeOut.assign(1.0);
          })
          .ElseIf(kind.lessThan(20.5), () => {
            // shock ring: expands and thins
            const e = pow(t.oneMinus(), 2.5).oneMinus().toVar();
            const rr = mix(0.08, 1.0, e).toVar();
            const w = mix(0.14, 0.03, e);
            const b = exp(pow(r.sub(rr).div(w), 2.0).negate()).toVar();
            const rough = gn(vec2(a.mul(6.0).add(seed), rr.mul(8.0))).mul(0.5).add(0.6).toVar();
            heat.assign(b.mul(rough).mul(t.mul(0.7).oneMinus()));
            cov.assign(b.mul(rough).mul(t.oneMinus()));
            occl.assign(cov.mul(0.15));
          })
          .ElseIf(kind.lessThan(21.5), () => {
            // rune circle: rotating, glyph ticks
            const spin = uTime.mul(vT.w.add(0.6)).toVar();
            const aa = a.add(spin).toVar();
            const outer = band(r.sub(0.92), 0.025);
            const inner = band(r.sub(0.72), 0.018);
            const ticks = step(0.72, r).mul(step(r, 0.92)).mul(smoothstep(0.85, 0.95, abs(sin(aa.mul(12.0)))));
            const glyph = step(0.75, r).mul(step(r, 0.89)).mul(smoothstep(0.6, 0.75, gn(vec2(aa.mul(6.0), r.mul(30.0)).add(seed))));
            const star = under(0.0, 0.02, abs(sin(aa.mul(2.5).sub(spin.mul(2.0)))).mul(r)).mul(step(r, 0.72)).mul(0.6);
            heat.assign(outer.add(inner.mul(0.8)).add(ticks.mul(0.6)).add(glyph.mul(0.7)).add(star));
            cov.assign(clamp(heat, 0.0, 1.0).mul(0.9));
          })
          .ElseIf(kind.lessThan(22.5), () => {
            // aura ring: soft ring and dashes
            const pulse = sin(uTime.mul(2.5).add(seed)).mul(0.2).add(0.8);
            const ring = band(r.sub(0.9), 0.06);
            const dash = smoothstep(0.3, 0.7, sin(a.mul(8.0).add(uTime.mul(1.2)))).mul(band(r.sub(0.78), 0.025));
            const fill = under(0.0, 0.95, r).mul(0.1);
            heat.assign(ring.mul(0.8).add(dash.mul(0.5)).add(fill).mul(pulse));
            cov.assign(heat.mul(0.8));
          })
          .ElseIf(kind.lessThan(23.5), () => {
            // light pool
            heat.assign(pow(max(0.0, r.oneMinus()), 2.0).mul(0.8));
            cov.assign(heat.mul(0.6));
          })
          .ElseIf(kind.lessThan(24.5), () => {
            // burning ground
            const f = gf(wp.mul(1.8).add(vec2(uTime.mul(0.4), uTime.mul(-1.1)))).toVar();
            const area = under(0.55, 1.0, r.add(n.sub(0.5).mul(0.35))).toVar();
            heat.assign(area.mul(smoothstep(0.35, 0.8, f)).mul(sin(uTime.mul(13.0).add(wp.x)).mul(0.15).add(0.85)));
            cov.assign(area.mul(smoothstep(0.3, 0.7, f).mul(0.75).add(0.25)));
            occl.assign(area.mul(0.25));
          })
          .ElseIf(kind.lessThan(25.5), () => {
            // poison pool
            const f = gf(wp.mul(1.5).add(vec2(uTime.mul(0.2), uTime.mul(0.15)))).toVar();
            const bub = smoothstep(0.82, 0.92, gn(wp.mul(5.0).add(vec2(0.0, uTime.mul(0.8)))));
            const area = under(0.6, 1.0, r.add(n.sub(0.5).mul(0.35))).toVar();
            heat.assign(area.mul(f.mul(0.45).add(0.25).add(bub.mul(0.6))));
            cov.assign(area.mul(f.mul(0.3).add(0.5)));
            occl.assign(area.mul(0.45));
          })
          .ElseIf(kind.lessThan(26.5), () => {
            // frost field: glitter on a pale sheet
            const glit = smoothstep(0.88, 0.97, gn(wp.mul(9.0).add(floor(uTime.mul(6.0))))).toVar();
            const area = under(0.6, 1.0, r.add(n.sub(0.5).mul(0.3))).toVar();
            const sheet = smoothstep(0.02, 0.1, cracks(wp.mul(2.0))).mul(0.45).add(0.55).toVar();
            heat.assign(area.mul(sheet.mul(0.2).add(glit)));
            cov.assign(area.mul(sheet.mul(0.35).add(glit)));
            occl.assign(area.mul(0.3));
          })
          .ElseIf(kind.lessThan(27.5), () => {
            // void pool: dark swirl, bright rim
            const sw = gf(vec2(a.mul(2.0).add(r.mul(4.0)).sub(uTime.mul(1.5)), r.mul(3.0)).add(seed)).toVar();
            const area = under(0.7, 1.0, r).toVar();
            const rim = band(r.sub(0.85).sub(sw.sub(0.5).mul(0.1)), 0.07).toVar();
            heat.assign(rim.mul(0.7).add(area.mul(sw).mul(0.25)));
            cov.assign(rim.mul(0.8).add(area.mul(0.6)));
            occl.assign(area.mul(0.7));
          })
          .ElseIf(kind.lessThan(28.5), () => {
            // wedge: flame or frost on the ground in a cone
            const half = max(vT.w, 0.05).toVar();
            const ang = abs(atan(p.x, p.y)).toVar();
            const inCone = under(half.mul(0.8), half, ang).mul(under(0.75, 1.0, r)).mul(step(0.0, p.y.add(0.05))).toVar();
            const f = gf(vec2(r.mul(4.0).sub(uTime.mul(6.0)), ang.mul(3.0)).add(seed)).toVar();
            heat.assign(inCone.mul(f.mul(0.7).add(0.3)).mul(r.mul(0.6).oneMinus()));
            cov.assign(inCone.mul(f.mul(0.6).add(0.3)));
            occl.assign(cov.mul(0.15));
          })
          .ElseIf(kind.lessThan(29.5), () => {
            // storm field: crawling arcs
            const fl = floor(uTime.mul(18.0)).toVar();
            const cr = cracks(wp.mul(1.2).add(fl.mul(0.37)));
            const arcs = under(0.0, 0.05, cr).toVar();
            const area = under(0.6, 1.0, r).toVar();
            heat.assign(arcs.mul(area).mul(gh(vec2(fl, seed)).mul(0.3).add(0.7)));
            cov.assign(arcs.mul(area).add(area.mul(0.08)));
          })
          .ElseIf(kind.lessThan(30.5), () => {
            // holy ground: rays from the centre
            const rays = smoothstep(0.6, 1.0, sin(a.mul(10.0).add(uTime.mul(0.6))).mul(0.5).add(0.5)).toVar();
            const area = pow(max(0.0, r.oneMinus()), 1.3).toVar();
            heat.assign(area.mul(rays.mul(0.5).add(0.35)));
            cov.assign(area.mul(rays.mul(0.4).add(0.3)));
          })
          .Else(() => {
            // sigil glow: a burning arcane sigil
            const ring = band(r.sub(0.8), 0.05).add(band(r.sub(0.6), 0.03).mul(0.7));
            const spokes = under(0.0, 0.05, abs(sin(a.mul(3.0).add(uTime.mul(0.3)))).mul(r)).mul(step(r, 0.8));
            heat.assign(clamp(ring.add(spokes.mul(0.7)), 0.0, 1.0).mul(t.oneMinus()));
            cov.assign(heat);
            fadeOut.assign(1.0);
          });
        const h = clamp(heat, 0.0, 1.0).toVar();
        const alpha = clamp(cov, 0.0, 1.0).mul(fadeIn).mul(fadeOut).toVar();
        Discard(alpha.lessThan(0.003));
        const rgb = ramp3(h).mul(v.emit).mul(h.mul(1.1).add(0.2)).mul(alpha).mul(FX_EXPOSURE);
        out.assign(vec4(rgb, clamp(occl, 0.0, 1.0).mul(fadeIn).mul(fadeOut)));
      })
      .Else(() => {
        // -------------------------------------------------------------- telegraphs
        const dur = life;
        const tt = clamp(vAge.div(dur), 0.0, 1.0).toVar();
        const post = clamp(vAge.sub(dur).div(0.16), 0.0, 1.0).toVar();
        const sd = slot();
        const sweep = slot();
        If(kind.lessThan(32.5), () => {
          sd.assign(r.sub(1.0));
          sweep.assign(r);
        })
          .ElseIf(kind.lessThan(33.5), () => {
            const half = max(vT.w, 0.05);
            const ang = abs(atan(p.x, p.y));
            sd.assign(max(r.sub(1.0), ang.sub(half).mul(max(r, 0.1))));
            sweep.assign(r);
          })
          .ElseIf(kind.lessThan(34.5), () => {
            // Line along +y from -1 to 1, half-width param (fraction of the half length).
            const d = vec2(abs(p.x).sub(vT.w), abs(p.y).sub(1.0)).toVar();
            sd.assign(min(max(d.x, d.y), 0.0).add(length(max(d, 0.0))));
            sweep.assign(p.y.mul(0.5).add(0.5));
          })
          .Else(() => {
            const th = max(vT.w, 0.04).toVar();
            const dd = abs(r.sub(th.oneMinus())).toVar();
            sd.assign(dd.sub(th));
            sweep.assign(dd.div(th).oneMinus());
          });
        const inside = under(px.negate(), px, sd).toVar();
        const edge = exp(pow(sd.div(px.mul(2.2)), 2.0).negate()).toVar();
        const inner = exp(pow(sd.add(0.06).div(px.mul(1.6)), 2.0).negate()).mul(0.45).toVar();
        const filled = under(tt.sub(0.02), tt.add(0.02), sweep).mul(inside).toVar();
        const front = band(sweep.sub(tt), 0.035).mul(inside).toVar();
        const imminent = smoothstep(0.75, 1.0, tt).toVar();
        const pulse = sin(vAge.mul(mix(10.0, 34.0, imminent))).mul(0.5).add(0.5).toVar();
        const hatch = smoothstep(0.55, 0.9, sin(p.x.add(p.y).mul(vSize).mul(3.2).sub(vAge.mul(4.0))).mul(0.5).add(0.5)).mul(inside).toVar();
        // Danger darkens the floor and takes the attack's colour; light lives on
        // the edges and the growing front, not in a bright disc.
        const shadowA = inside.mul(filled.mul(0.22).add(0.28));
        // The edge holds the attack's own colour; it only runs white-hot as the
        // strike lands, so packs of telegraphs do not wash the hero out.
        const h = clamp(
          edge
            .mul(pulse.mul(0.22).mul(imminent.add(0.4)).add(0.58).add(imminent.mul(0.15)))
            .add(inner)
            .add(front.mul(0.6))
            .add(filled.mul(hatch.mul(0.1).add(0.12)))
            .add(imminent.mul(pulse).mul(0.15).mul(inside)),
          0.0,
          1.0,
        ).toVar();
        // The landing flash.
        const light = h.add(post.mul(post.oneMinus()).mul(2.0).mul(edge.add(inside.mul(0.3)))).toVar();
        const fadeStart = smoothstep(0.0, 0.08, tt);
        const live = post.oneMinus();
        const col = ramp3(clamp(light, 0.0, 1.0)).mul(v.emit).mul(clamp(light, 0.0, 1.2).mul(1.1).add(0.2));
        const cv = clamp(edge.add(inner).add(front.mul(0.7)).add(filled.mul(0.35)).add(hatch.mul(0.1)), 0.0, 1.0);
        const rgb = col
          .mul(cv)
          .mul(fadeStart)
          .mul(live)
          .add(v.body.mul(v.emit).mul(post).mul(post.oneMinus()).mul(0.7).mul(inside))
          .toVar();
        const oc = shadowA.mul(fadeStart).mul(live).toVar();
        Discard(oc.lessThan(0.003).and(dot(rgb, rgb).lessThan(1e-6)));
        out.assign(vec4(rgb, oc));
      });
    return out;
  };
  const m = kitMaterial(`fx-ground-${name}`, frag, { position: wpos });
  m.polygonOffset = true;
  m.polygonOffsetFactor = -4;
  m.polygonOffsetUnits = -4;
  return m;
}

const LAYOUT = ['iX', 'iT', 'iC', 'iE'] as const;

export interface GroundHandle {
  readonly slot: number;
  readonly gen: number;
}

export interface GroundSpawn {
  x: number;
  z: number;
  y: number;
  size: number;
  rot: number;
  life: number;
  kind: number;
  param: number;
  core: number;
  body: number;
  tail: number;
  emit: number;
  fadeIn: number;
  seed: number;
  param2: number;
  /** Seconds from now before it appears. */
  delay: number;
}

/** Shared scratch record for `GroundLayer.spawn`. */
export const G: GroundSpawn = {
  x: 0, z: 0, y: 0, size: 1, rot: 0, life: 1, kind: 0, param: 0,
  core: 0, body: 0, tail: 0, emit: 1, fadeIn: 0.1, seed: 0, param2: 0, delay: 0,
};

/** One instanced layer of ground quads with a ring allocator. */
export class GroundLayer {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.MeshBasicNodeMaterial;
  private uTime = uniform(0);
  private arr: Record<(typeof LAYOUT)[number], Float32Array>;
  private attr: Record<(typeof LAYOUT)[number], THREE.InstancedBufferAttribute>;
  private gen: Int32Array;
  private head = 0;
  private high = 0;
  private lo = Infinity;
  private hi = -Infinity;
  private time = 0;

  constructor(name: string, capacity: number, renderOrder: number) {
    this.capacity = Math.max(16, capacity | 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]), 3));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    const arr = {} as Record<(typeof LAYOUT)[number], Float32Array>;
    const attr = {} as Record<(typeof LAYOUT)[number], THREE.InstancedBufferAttribute>;
    for (const k of LAYOUT) {
      const a = new Float32Array(this.capacity * 4);
      const ia = new THREE.InstancedBufferAttribute(a, 4);
      ia.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(k, ia);
      arr[k] = a;
      attr[k] = ia;
    }
    geo.instanceCount = 0;
    this.geo = geo;
    this.arr = arr;
    this.attr = attr;
    this.gen = new Int32Array(this.capacity);
    this.mat = groundMaterial(name, this.uTime);
    premultiplied(this.mat);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = `fx:ground-${name}`;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  get now(): number {
    return this.time;
  }

  spawn(g: GroundSpawn = G): GroundHandle {
    const i = this.head;
    this.head = (i + 1) % this.capacity;
    if (i + 1 > this.high) this.high = i + 1;
    const gen = (this.gen[i] = (this.gen[i]! + 1) | 0);
    const o = i * 4;
    const A = this.arr;
    A.iX[o] = g.x; A.iX[o + 1] = g.z; A.iX[o + 2] = Math.max(0.02, g.size); A.iX[o + 3] = g.rot;
    A.iT[o] = this.time + g.delay; A.iT[o + 1] = g.life; A.iT[o + 2] = g.kind; A.iT[o + 3] = g.param;
    A.iC[o] = g.core; A.iC[o + 1] = g.body; A.iC[o + 2] = g.tail; A.iC[o + 3] = g.emit;
    A.iE[o] = g.y; A.iE[o + 1] = g.fadeIn; A.iE[o + 2] = g.seed; A.iE[o + 3] = g.param2;
    this.dirty(i);
    return { slot: i, gen };
  }

  ok(h: GroundHandle | null): h is GroundHandle {
    return !!h && this.gen[h.slot] === h.gen;
  }

  move(h: GroundHandle | null, x: number, z: number, y?: number): void {
    if (!this.ok(h)) return;
    const o = h.slot * 4;
    this.arr.iX[o] = x;
    this.arr.iX[o + 1] = z;
    if (y !== undefined) this.arr.iE[o] = y;
    this.dirty(h.slot);
  }

  resize(h: GroundHandle | null, size: number): void {
    if (!this.ok(h)) return;
    this.arr.iX[h.slot * 4 + 2] = Math.max(0.02, size);
    this.dirty(h.slot);
  }

  /** Ends a glow or telegraph now (telegraphs skip their landing flash). */
  end(h: GroundHandle | null, keepFlash = false): void {
    if (!this.ok(h)) return;
    const o = h.slot * 4;
    if (keepFlash) {
      // Pull the end in to now so the flash plays.
      this.arr.iT[o + 1] = Math.max(0.001, this.time - this.arr.iT[o]!);
    } else this.arr.iT[o + 1] = 0;
    this.dirty(h.slot);
  }

  /** Extends a glow's life to at least `seconds` from now. */
  extend(h: GroundHandle | null, seconds: number): void {
    if (!this.ok(h)) return;
    const o = h.slot * 4;
    const want = this.time + seconds - this.arr.iT[o]!;
    if (want > this.arr.iT[o + 1]!) {
      this.arr.iT[o + 1] = want;
      this.dirty(h.slot);
    }
  }

  private dirty(i: number): void {
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  update(dt: number): void {
    this.time += dt;
    this.uTime.value = this.time;
    this.geo.instanceCount = this.high;
    if (this.hi < this.lo) return;
    const n = this.hi - this.lo + 1;
    for (const k of LAYOUT) {
      const a = this.attr[k];
      markRange(a, this.lo * 4, n * 4);
    }
    this.lo = Infinity;
    this.hi = -Infinity;
  }

  clear(): void {
    this.arr.iT.fill(0);
    markAll(this.attr.iT);
    this.head = 0;
    this.high = 0;
    this.geo.instanceCount = 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
