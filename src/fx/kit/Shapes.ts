/**
 * SLAY vfx kit: the four instanced shape families.
 *
 * - `Cores`: camera-facing projectile hearts and flares, drawn by a
 *   procedural shader per style (fireball, frost orb, ball lightning, poison
 *   glob, arcane orb, void, flare, soft glow). Stretched against their travel
 *   direction so a fireball trails flame behind it.
 * - `Beams`: camera-facing strips from A to B (beams, tethers, breath).
 * - `Columns`: vertical light shafts (drop beams, level up, portals, sky
 *   strikes, fire pillars).
 * - `Shells`: spheres and domes (wards, auras, nova fronts, ice prisons).
 *
 * All of them shade through the same three-stop ramp and premultiplied blend
 * as particles, so they sit in the same visual language.
 */

import * as THREE from 'three/webgpu';
import {
  If, abs, atan, attribute, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, cameraWorldMatrix, clamp, cos, cross, dot, exp, floor,
  fract, length, max, min, mix, mod, normalize, positionGeometry, pow, sin, smoothstep, step, uniform, uv, vec2, vec3, vec4,
} from 'three/tsl';
import { InstancedPool } from './Instanced';
import { band, fxf, fxh, fxn, kitInstance, kitMaterial, kitOut, slot } from './Nodes';
import { vary, type F, type V3, type V4 } from '../../core/Tsl';

const iA = (): V4 => attribute<'vec4'>('iA', 'vec4');
const iB = (): V4 => attribute<'vec4'>('iB', 'vec4');

/** World position to clip space; the pools draw in world space. */
function clip(wp: V3): V4 {
  return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(wp, 1.0));
}

// ---------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------

export const CORE_STYLE = {
  orb: 0, fireball: 1, plasma: 2, flare: 3, glob: 4, frost: 5, void: 6, soft: 7, bone: 8,
  // Glyphs: drawn shapes rather than glows, for skill motifs (`fx/Motifs.ts`).
  skull: 9, rune: 10, crescent: 11, star: 12, ring: 13, eye: 14, petal: 15, smoke: 16, cross: 17, hex: 18, claw: 19, heart: 20,
  // A monster's shot, whatever its school: a black heart with a red rim.
  hostile: 21,
} as const;
export type CoreStyle = keyof typeof CORE_STYLE;

export function makeCores(capacity: number): InstancedPool {
  const base = new THREE.PlaneGeometry(1, 1);
  const uTime = uniform(0);
  const A = iA();
  const B = iB();
  const camRight = cameraWorldMatrix.mul(vec4(1.0, 0.0, 0.0, 0.0)).xyz;
  const camUp = cameraWorldMatrix.mul(vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  // Orient the quad's -y along the travel direction as seen on screen, so the
  // tail trails behind.
  const dir = B.xyz;
  const sd = vec2(dot(dir, camRight), dot(dir, camUp));
  const sl = length(sd);
  const ax = sl.greaterThan(1e-3).select(sd.div(max(sl, 1e-3)), vec2(0.0, 1.0)).uniformFlow().toVar();
  const ay = vec2(ax.y.negate(), ax.x);
  const stretch = B.w.mul(min(sl, 1.0)).add(1.0);
  const c = positionGeometry.xy;
  // Stretch only the tail half (behind the travel direction).
  const along = c.x.lessThan(0.0).select(c.x.mul(stretch), c.x).uniformFlow().toVar();
  const q0 = ax.mul(along).add(ay.mul(c.y));
  const wp = A.xyz.add(camRight.mul(q0.x).add(camUp.mul(q0.y)).mul(A.w));
  const vP = vary(vec2(along, c.y).mul(2.0));
  const v = kitInstance();

  const frag = (): V4 => {
    const style = v.D.x;
    const seed = v.D.z.mul(37.0).toVar();
    // x along travel (+ ahead), y across; tail at x < -1
    const p = vP;
    const r = length(p).toVar();
    const t = uTime;
    const heat = slot();
    const cov = slot();
    const occl = slot(0.15);
    If(style.lessThan(0.5), () => {
      // Orb: hot heart, turbulent corona.
      const n = fxf(p.mul(2.6).add(vec2(t.mul(1.7).add(seed), t.mul(1.1)))).toVar();
      heat.assign(pow(max(0.0, r.mul(0.95).oneMinus()), 2.2).mul(1.4).add(n.mul(0.35).mul(smoothstep(1.0, 0.3, r))));
      cov.assign(smoothstep(1.0, 0.25, r.add(n.sub(0.5).mul(0.35))));
    })
      .ElseIf(style.lessThan(1.5), () => {
        // Fireball: dense heart, flame streaming back.
        const q = vec2(p.x.add(0.15), p.y.mul(max(0.0, p.x.negate()).mul(0.25).add(1.0))).toVar();
        const n = fxf(vec2(q.x.mul(2.2).add(t.mul(6.0)).add(seed), q.y.mul(2.6))).toVar();
        const tail = smoothstep(-3.0, -0.2, p.x);
        const d = length(vec2(min(q.x.add(0.1), 0.0).mul(0.45).add(max(q.x, 0.0)), q.y)).add(n.sub(0.5).mul(0.7));
        cov.assign(smoothstep(0.95, 0.35, d).mul(tail));
        heat.assign(pow(max(0.0, length(p.add(vec2(-0.1, 0.0))).mul(1.05).oneMinus()), 1.6).mul(1.5).add(n.mul(0.45).mul(cov)));
        occl.assign(0.3);
      })
      .ElseIf(style.lessThan(2.5), () => {
        // Ball lightning: white heart, crawling arcs that flicker.
        const fl = floor(t.mul(24.0));
        const n = fxn(vec2(atan(p.y, p.x).mul(3.0).add(fl.mul(1.3)), r.mul(4.0).add(seed)));
        const arcs = smoothstep(0.92, 1.0, abs(n.sub(0.5)).mul(2.0).oneMinus()).mul(smoothstep(1.0, 0.2, r)).toVar();
        heat.assign(pow(max(0.0, r.mul(1.3).oneMinus()), 2.5).mul(1.6).add(arcs));
        cov.assign(pow(max(0.0, r.oneMinus()), 1.5).mul(0.7).add(arcs));
        occl.assign(0.0);
      })
      .ElseIf(style.lessThan(3.5), () => {
        // Flare: a star of light.
        const rays = exp(p.x.mul(p.x).mul(-60.0))
          .mul(max(0.0, abs(p.y).oneMinus()))
          .add(exp(p.y.mul(p.y).mul(-60.0)).mul(max(0.0, abs(p.x).oneMinus())));
        heat.assign(pow(max(0.0, r.mul(1.4).oneMinus()), 2.0).mul(1.3).add(rays.mul(0.9)));
        cov.assign(clamp(heat, 0.0, 1.0));
        occl.assign(0.0);
      })
      .ElseIf(style.lessThan(4.5), () => {
        // Poison glob: wobbling, thick, with bright bubbles.
        const w = fxf(p.mul(2.0).add(vec2(t.mul(2.0), seed)));
        const d = r.add(w.sub(0.5).mul(0.45)).toVar();
        cov.assign(smoothstep(0.85, 0.6, d));
        const bub = smoothstep(0.75, 0.95, fxn(p.mul(6.0).add(vec2(seed, t.mul(3.0)))));
        heat.assign(d.oneMinus().mul(0.5).add(0.35).add(bub.mul(0.6)).mul(cov));
        occl.assign(0.55);
      })
      .ElseIf(style.lessThan(5.5), () => {
        // Frost orb: hard faceted ice with a bright heart.
        const a = atan(p.y, p.x);
        const facet = abs(fract(a.mul(0.954).add(seed)).sub(0.5)).mul(2.0).toVar();
        const hexR = r.mul(facet.mul(0.12).add(1.0));
        cov.assign(smoothstep(0.85, 0.7, hexR).add(smoothstep(1.0, 0.0, r).mul(0.4)));
        heat.assign(pow(max(0.0, r.mul(1.1).oneMinus()), 1.8).mul(1.3).add(facet.oneMinus().mul(0.25).mul(cov)));
        occl.assign(0.35);
      })
      .ElseIf(style.lessThan(6.5), () => {
        // Void: a dark heart ringed with light.
        const n = fxf(vec2(atan(p.y, p.x).mul(2.0).add(t.mul(2.0)), r.mul(3.0).sub(t).add(seed)));
        const rim = band(r.sub(0.62).sub(n.sub(0.5).mul(0.2)), 0.16);
        heat.assign(rim.mul(1.2));
        cov.assign(smoothstep(0.9, 0.5, r));
        occl.assign(smoothstep(0.75, 0.3, r).mul(0.85).add(0.2));
      })
      .ElseIf(style.lessThan(7.5), () => {
        // Soft glow.
        heat.assign(pow(max(0.0, r.oneMinus()), 2.4));
        cov.assign(heat);
        occl.assign(0.0);
      })
      .ElseIf(style.lessThan(8.5), () => {
        // Bone spirit: a pale skull-white heart, sickly halo.
        const n = fxf(p.mul(3.0).add(vec2(t.mul(3.0), seed))).toVar();
        heat.assign(pow(max(0.0, r.mul(1.1).oneMinus()), 2.0).mul(1.2).add(n.mul(0.3).mul(smoothstep(1.0, 0.4, r))));
        cov.assign(smoothstep(1.0, 0.35, r.add(n.sub(0.5).mul(0.3))));
        occl.assign(0.25);
      })
      .ElseIf(style.greaterThan(20.5), () => {
        // Hostile bolt: a black heart that hides what is behind it, a red rim
        // that flickers, and a ragged tail streaming back. Read at a glance
        // as "theirs" beside the hero's own bright shots.
        const fl = fxn(vec2(floor(t.mul(20.0)).add(seed), seed.mul(0.37)));
        const n = fxf(vec2(atan(p.y, p.x).mul(2.0).sub(t.mul(5.0)), r.mul(3.5).add(seed))).toVar();
        // Swept back like a fireball: the shape widens toward the tail.
        const q = vec2(p.x.add(0.1), p.y.mul(max(0.0, p.x.negate()).mul(0.3).add(1.0))).toVar();
        const d = length(vec2(min(q.x, 0.0).mul(0.42).add(max(q.x, 0.0)), q.y)).add(n.sub(0.5).mul(0.5)).toVar();
        const tail = smoothstep(-3.2, -0.3, p.x);
        const rim = band(r.sub(0.56).sub(n.sub(0.5).mul(0.18)), 0.17).mul(fl.mul(0.4).add(0.75));
        const streak = smoothstep(0.55, 0.9, n).mul(smoothstep(0.0, -0.8, p.x)).mul(tail);
        cov.assign(max(smoothstep(0.95, 0.4, d).mul(tail), rim));
        heat.assign(rim.mul(1.35).add(streak.mul(0.55)).add(smoothstep(0.25, 0.0, r).mul(0.04)));
        occl.assign(smoothstep(0.62, 0.2, r).mul(0.8).add(0.18));
      })
      .Else(() => {
        // Glyphs. Upright on screen when still: q.y is up, q.x across.
        const q = vec2(p.y, p.x).toVar();
        const a = atan(q.y, q.x).toVar();
        const spin = t.mul(1.5).add(seed).toVar();
        const n = fxn(q.mul(5.0).add(vec2(seed, t.mul(2.0)))).toVar();
        If(style.lessThan(9.5), () => {
          // Skull: a pale cranium and jaw with burning eye sockets.
          const head = length(q.sub(vec2(0.0, 0.16)).mul(vec2(1.0, 1.08))).sub(0.6);
          const jq = abs(q.sub(vec2(0.0, -0.42))).sub(vec2(0.3, 0.2)).toVar();
          const jaw = length(max(jq, 0.0)).add(min(max(jq.x, jq.y), 0.0)).sub(0.06);
          const sk = min(head, jaw).toVar();
          const eyes = length(vec2(abs(q.x).sub(0.24), q.y.sub(0.06))).sub(0.15).toVar();
          const nose = max(abs(q.x).mul(1.6).add(q.y.add(0.12).mul(0.9)), q.y.add(0.24).negate());
          const teeth = step(0.5, fract(q.x.mul(7.0))).mul(step(abs(q.y.add(0.42)), 0.05));
          const hole = min(eyes, nose.sub(0.06));
          cov.assign(
            smoothstep(0.04, -0.02, sk)
              .mul(smoothstep(0.03, -0.03, hole).mul(0.85).oneMinus())
              .mul(teeth.mul(0.6).oneMinus()),
          );
          heat.assign(n.mul(0.25).add(0.32).add(smoothstep(0.12, -0.06, eyes).mul(1.2)).add(smoothstep(0.05, -0.02, sk).mul(0.1)));
          cov.assign(max(cov, smoothstep(0.1, -0.05, eyes).mul(0.9)));
          occl.assign(0.45);
        })
          .ElseIf(style.lessThan(10.5), () => {
            // Rune wheel: a ring, ticks around it and a turning triangle inside.
            const ring = band(r.sub(0.8), 0.05);
            const ticks = step(0.82, abs(cos(a.add(spin.mul(0.3)).mul(6.0)))).mul(step(abs(r.sub(0.66)), 0.07));
            const ta = a.sub(spin);
            const tri = cos(mod(ta, 2.0944).sub(1.0472)).reciprocal().mul(Math.cos(Math.PI / 3) * 0.48);
            const tri2 = band(r.sub(tri), 0.035);
            cov.assign(clamp(ring.add(ticks).add(tri2), 0.0, 1.0));
            heat.assign(cov.mul(0.45).add(0.55));
            occl.assign(0.0);
          })
          .ElseIf(style.lessThan(11.5), () => {
            // Crescent: a curved blade of light, horns up.
            const outer = length(q).sub(0.82);
            const inner = length(q.sub(vec2(0.0, 0.34))).sub(0.7);
            const d = max(outer, inner.negate()).toVar();
            cov.assign(smoothstep(0.03, -0.03, d));
            heat.assign(smoothstep(0.0, -0.12, d).mul(smoothstep(-0.25, -0.05, d)).mul(0.6).add(0.5).add(n.mul(0.2)));
            occl.assign(0.0);
          })
          .ElseIf(style.lessThan(12.5), () => {
            // Star: five sharp points round a white heart.
            const k = abs(cos(a.add(1.5708).mul(2.5)));
            const edge = pow(k, 6.0).mul(0.6).add(0.3).toVar();
            cov.assign(smoothstep(edge.add(0.04), edge.sub(0.04), r));
            heat.assign(pow(max(0.0, r.mul(1.2).oneMinus()), 1.4).mul(1.4).add(0.25));
            occl.assign(0.0);
          })
          .ElseIf(style.lessThan(13.5), () => {
            // Ring: a hollow hoop with a bright rim.
            const w = band(r.sub(0.72), 0.09).toVar();
            cov.assign(w.add(smoothstep(0.75, 0.0, r).mul(0.12)));
            heat.assign(w.mul(0.7).add(0.4).add(n.mul(0.2)));
            occl.assign(0.0);
          })
          .ElseIf(style.lessThan(14.5), () => {
            // Eye: an almond lid, a burning iris and a black slit.
            const lid = length(vec2(q.x.mul(0.62), abs(q.y).add(0.55))).sub(0.82);
            const iris = r.sub(0.34).toVar();
            const slit = abs(q.x).sub(abs(q.y).mul(2.0).oneMinus().mul(0.06));
            cov.assign(smoothstep(0.03, -0.03, lid).mul(smoothstep(0.02, -0.02, max(slit, iris)).mul(0.9).oneMinus()));
            heat.assign(smoothstep(0.05, -0.08, iris).add(0.25).add(n.mul(0.2)));
            occl.assign(0.5);
          })
          .ElseIf(style.lessThan(15.5), () => {
            // Petal or leaf: a pointed blade with a bright vein.
            const d = length(vec2(abs(q.x).add(0.5), q.y)).sub(0.78).toVar();
            const vein = exp(q.x.mul(q.x).mul(-220.0)).mul(step(abs(q.y), 0.7));
            cov.assign(smoothstep(0.03, -0.03, d));
            heat.assign(smoothstep(0.0, -0.3, d).mul(0.5).add(0.35).add(vein.mul(0.6)));
            occl.assign(0.35);
          })
          .ElseIf(style.lessThan(16.5), () => {
            // Smoke: a dark, rolling puff that hides what is behind it.
            const w = fxf(q.mul(2.2).add(vec2(seed, t.mul(-0.8)))).toVar();
            const d = r.add(w.sub(0.5).mul(0.6));
            cov.assign(smoothstep(0.95, 0.4, d).mul(0.85));
            heat.assign(w.mul(0.18).add(0.08));
            occl.assign(0.95);
          })
          .ElseIf(style.lessThan(17.5), () => {
            // Cross: a long upright bar and a short one, white-hot where they meet.
            const vb = max(abs(q.x).sub(0.11), abs(q.y.add(0.05)).sub(0.85));
            const hb = max(abs(q.y.sub(0.3)).sub(0.11), abs(q.x).sub(0.5));
            const d = min(vb, hb);
            cov.assign(smoothstep(0.04, -0.04, d).add(smoothstep(0.9, 0.0, r).mul(0.25)));
            heat.assign(smoothstep(0.5, 0.0, length(q.sub(vec2(0.0, 0.3)))).mul(0.6).add(0.55));
            occl.assign(0.0);
          })
          .ElseIf(style.lessThan(18.5), () => {
            // Hex sigil: a six-sided frame with a hot point in the middle.
            const ha = mod(a.add(spin.mul(0.4)), 1.0472).sub(0.5236);
            const hr = r.mul(cos(ha)).div(0.866).toVar();
            const frame = band(hr.sub(0.72), 0.05);
            const dot0 = exp(r.mul(r).mul(-30.0));
            cov.assign(clamp(frame.add(dot0).add(smoothstep(0.7, 0.0, hr).mul(0.1)), 0.0, 1.0));
            heat.assign(cov.mul(0.5).add(0.5));
            occl.assign(0.0);
          })
          .ElseIf(style.lessThan(19.5), () => {
            // Claw: three raking slashes.
            const s = q.x.sub(q.y.mul(0.35)).toVar();
            const bands = abs(fract(s.mul(2.2).add(0.5)).sub(0.5)).toVar();
            const m = step(abs(s), 0.75).mul(smoothstep(0.85, 0.3, abs(q.y))).toVar();
            cov.assign(smoothstep(0.12, 0.04, bands).mul(m));
            heat.assign(smoothstep(0.08, 0.0, bands).mul(m).mul(0.7).add(0.5));
            occl.assign(0.2);
          })
          .Else(() => {
            // Heart: a dark beating heart, glowing at its core.
            const h = vec2(abs(q.x), q.y.mul(1.15).add(0.2)).toVar();
            const d0 = length(h.sub(vec2(0.3, 0.3))).sub(0.36);
            const tip = h.x.add(h.y.negate().add(0.65)).mul(0.7071).sub(0.36);
            const d = min(d0, max(tip, h.y.negate().add(0.05))).toVar();
            const beat = sin(t.mul(9.0).add(seed)).mul(0.2).add(0.8).toVar();
            cov.assign(smoothstep(0.03, -0.03, d.div(beat)));
            heat.assign(smoothstep(0.0, -0.35, d).mul(beat).mul(0.8).add(0.3));
            occl.assign(0.6);
          });
      });
    return kitOut(v, heat, clamp(cov, 0.0, 1.0).mul(v.D.y), occl);
  };
  const mat = kitMaterial('fx-cores', frag, { vertex: clip(wp) });
  return new InstancedPool('cores', base, mat, uTime, capacity, 22);
}

// ---------------------------------------------------------------------------
// Beams
// ---------------------------------------------------------------------------

export const BEAM_STYLE = { ray: 0, flame: 1, drain: 2, shaft: 3, frost: 4 } as const;
export type BeamStyle = keyof typeof BEAM_STYLE;

export function makeBeams(capacity: number): InstancedPool {
  // A strip across x (-0.5..0.5), along y (0..1), 24 segments for the swell.
  const segs = 24;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const y = i / segs;
    pos.push(-0.5, y, 0, 0.5, y, 0);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  base.setIndex(idx);

  const uTime = uniform(0);
  const A = iA();
  const B = iB();
  const pg = positionGeometry;
  const a = A.xyz;
  const ab = B.xyz.sub(a).toVar();
  const len = max(length(ab), 1e-3);
  const p0 = a.add(ab.mul(pg.y)).toVar();
  const side = normalize(cross(ab, cameraPosition.sub(p0)).add(vec3(1e-5)));
  // Width swells a touch in the middle and pinches at the emitter.
  const w = A.w.mul(mix(0.55, 1.0, smoothstep(0.0, 0.08, pg.y)));
  const wp = p0.add(side.mul(pg.x).mul(w));
  const vQ = vary(vec2(pg.x.mul(2.0), pg.y));
  const vLen = vary(len);
  const v = kitInstance();

  const frag = (): V4 => {
    const style = v.D.x;
    const seed = v.D.z.mul(19.0).toVar();
    // -1 .. 1 across
    const x = vQ.x.toVar();
    // 0 .. 1 along
    const vv = vQ.y.toVar();
    // metres along
    const s = vv.mul(vLen).toVar();
    const t = uTime;
    const ends = smoothstep(0.0, 0.04, vv).mul(smoothstep(1.0, 0.96, vv)).toVar();
    const heat = slot();
    const cov = slot();
    const occl = slot(0.1);
    const xx = x.mul(x).toVar();
    If(style.lessThan(0.5), () => {
      // Ray: a straight core in a rippling sheath.
      const n = fxf(vec2(s.mul(1.6).sub(t.mul(9.0)).add(seed), x.mul(1.5)));
      const core = exp(xx.mul(-26.0)).toVar();
      const sheath = exp(xx.mul(-3.0)).mul(n.mul(0.6).add(0.45)).toVar();
      heat.assign(core.mul(1.2).add(sheath.mul(0.45)));
      cov.assign(core.add(sheath.mul(0.8)));
    })
      .ElseIf(style.lessThan(1.5), () => {
        // Flame breath: widening, billowing, rolling forward.
        const n = fxf(vec2(s.mul(1.2).sub(t.mul(7.0)).add(seed), x.mul(2.0).add(t))).toVar();
        const edge = smoothstep(n.mul(0.5).add(0.35), 1.0, abs(x)).oneMinus().toVar();
        heat.assign(edge.mul(n.mul(0.8).add(0.4)).mul(vv.mul(0.6).oneMinus()));
        cov.assign(edge.mul(n.mul(0.6).add(0.5)));
        occl.assign(0.3);
      })
      .ElseIf(style.lessThan(2.5), () => {
        // Drain: a thin wavering cord with beads flowing toward A.
        const wave = sin(s.mul(3.0).add(t.mul(6.0)).add(seed)).mul(0.35);
        const d = abs(x.sub(wave.mul(smoothstep(0.0, 0.2, vv)).mul(smoothstep(1.0, 0.8, vv)))).toVar();
        const beads = smoothstep(0.65, 1.0, sin(s.mul(5.0).add(t.mul(14.0))).mul(0.5).add(0.5)).toVar();
        heat.assign(exp(d.mul(d).mul(-30.0)).mul(beads.mul(0.5).add(0.7)));
        cov.assign(exp(d.mul(d).mul(-18.0)).mul(beads.mul(0.4).add(0.6)));
      })
      .ElseIf(style.lessThan(3.5), () => {
        // Shaft: soft vertical light.
        heat.assign(exp(xx.mul(-4.0)).mul(fxn(vec2(s.mul(2.0).sub(t.mul(2.0)), x.mul(3.0).add(seed))).mul(0.3).add(0.6)));
        cov.assign(heat.mul(0.8));
        occl.assign(0.0);
      })
      .Else(() => {
        // Frost: a pale ray shedding crystals.
        const n = fxf(vec2(s.mul(3.0).sub(t.mul(4.0)).add(seed), x.mul(3.0)));
        const core = exp(xx.mul(-20.0)).toVar();
        const glit = smoothstep(0.8, 0.95, n).mul(exp(xx.mul(-2.0))).toVar();
        const halo = exp(xx.mul(-4.0)).toVar();
        heat.assign(core.add(glit.mul(0.8)).add(halo.mul(0.25)));
        cov.assign(core.mul(0.9).add(glit).add(halo.mul(0.4)));
        occl.assign(0.2);
      });
    return kitOut(v, heat, clamp(cov, 0.0, 1.0).mul(ends).mul(v.D.y), occl);
  };
  const mat = kitMaterial('fx-beams', frag, { vertex: clip(wp) });
  return new InstancedPool('beams', base, mat, uTime, capacity, 22);
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export const COLUMN_STYLE = { light: 0, swirl: 1, fire: 2, strike: 3 } as const;
export type ColumnStyle = keyof typeof COLUMN_STYLE;

export function makeColumns(capacity: number): InstancedPool {
  const base = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
  base.translate(0, 0.5, 0);

  const uTime = uniform(0);
  const A = iA();
  const B = iB();
  const pg = positionGeometry;
  // Base geometry: open cylinder radius 1, y 0..1.
  const y = pg.y;
  const r = A.w.mul(mix(1.0, B.y, y));
  const wp = A.xyz.add(vec3(pg.x.mul(r), y.mul(B.x), pg.z.mul(r))).toVar();
  const n = normalize(vec3(pg.x, 0.0, pg.z));
  const viewDir = normalize(cameraPosition.sub(wp));
  const vFacing = vary(abs(dot(n, viewDir)));
  const vUv = vary(vec2(uv().x.add(B.z), y));
  const v = kitInstance();

  const frag = (): V4 => {
    const style = v.D.x;
    const seed = v.D.z.mul(23.0).toVar();
    const u = vUv.x.toVar();
    const yy = vUv.y.toVar();
    const t = uTime;
    // Facing the camera is the thick part of a volume of light.
    const body = pow(vFacing, 1.6).toVar();
    const top = smoothstep(0.35, 1.0, yy).oneMinus().toVar();
    const bottom = smoothstep(0.0, 0.04, yy).toVar();
    const heat = slot();
    const cov = slot();
    const occl = slot(0.0);
    If(style.lessThan(0.5), () => {
      const streak = fxn(vec2(u.mul(18.0).add(seed), yy.mul(3.0).sub(t.mul(1.5)))).mul(0.45).add(0.55).toVar();
      heat.assign(body.mul(yy.oneMinus().mul(0.6).add(0.55)).mul(streak));
      cov.assign(body.mul(streak).mul(0.85));
    })
      .ElseIf(style.lessThan(1.5), () => {
        const sp = fxf(vec2(u.mul(6.0).add(yy.mul(3.0)).sub(t.mul(1.2)).add(seed), yy.mul(2.0).sub(t.mul(2.5)))).toVar();
        heat.assign(body.mul(sp.mul(0.8).add(0.35)));
        cov.assign(body.mul(sp.mul(0.8).add(0.3)));
        occl.assign(0.15);
      })
      .ElseIf(style.lessThan(2.5), () => {
        const nn = fxf(vec2(u.mul(7.0).add(seed), yy.mul(3.0).sub(t.mul(4.0)))).toVar();
        heat.assign(body.mul(nn.mul(0.9).add(0.3)).mul(yy.negate().add(1.1)));
        cov.assign(body.mul(smoothstep(0.25, 0.6, nn.add(yy.oneMinus().mul(0.3)))));
        occl.assign(0.3);
      })
      .Else(() => {
        const fl = fxh(vec2(floor(t.mul(30.0)), seed)).mul(0.3).add(0.7).toVar();
        heat.assign(pow(vFacing, 4.0).mul(1.3).mul(fl));
        cov.assign(pow(vFacing, 2.0).mul(fl));
      });
    return kitOut(v, heat, clamp(cov.mul(top).mul(bottom), 0.0, 1.0).mul(v.D.y), occl);
  };
  const mat = kitMaterial('fx-columns', frag, { vertex: clip(wp) });
  return new InstancedPool('columns', base, mat, uTime, capacity, 19);
}

// ---------------------------------------------------------------------------
// Shells
// ---------------------------------------------------------------------------

export const SHELL_STYLE = { ward: 0, aura: 1, front: 2, ice: 3 } as const;
export type ShellStyle = keyof typeof SHELL_STYLE;

export function makeShells(capacity: number): InstancedPool {
  const base = new THREE.SphereGeometry(1, 24, 16);

  const uTime = uniform(0);
  const A = iA();
  const B = iB();
  const pg = positionGeometry;
  const lp = pg.mul(vec3(1.0, B.x.greaterThan(0.0).select(B.x, 1.0).uniformFlow().toVar(), 1.0));
  const wp = A.xyz.add(lp.mul(A.w)).toVar();
  const n = normalize(pg);
  const viewDir = normalize(cameraPosition.sub(wp));
  const vRim = vary(abs(dot(n, viewDir)).oneMinus());
  const vLocal = vary(pg);
  const v = kitInstance();

  const frag = (): V4 => {
    const style = v.D.x;
    const seed = v.D.z.mul(29.0).toVar();
    const t = uTime;
    const sp = vec2(atan(vLocal.z, vLocal.x).mul(1.59), vLocal.y).toVar();
    const heat = slot();
    const cov = slot();
    const occl = slot(0.0);
    If(style.lessThan(0.5), () => {
      // Ward: hex lattice that brightens at the rim.
      const g = sp.mul(6.0).toVar();
      const h = abs(fract(g.add(vec2(floor(mod(g.y, 2.0)).mul(0.5), 0.0))).sub(0.5)).toVar();
      const lat = smoothstep(0.42, 0.5, max(h.x.mul(1.15).add(h.y.mul(0.5)), h.y)).toVar();
      const rim = pow(vRim, 2.5).toVar();
      const pulse = sin(t.mul(3.0).add(seed)).mul(0.25).add(0.75);
      heat.assign(rim.mul(0.9).add(lat.mul(0.35)).mul(pulse));
      cov.assign(rim.mul(0.8).add(lat.mul(0.22)));
    })
      .ElseIf(style.lessThan(1.5), () => {
        // Aura: rising rippled light, faint in the middle.
        const nn = fxf(vec2(sp.x.mul(3.0).add(seed), sp.y.mul(2.5).sub(t.mul(1.4)))).toVar();
        const rim = pow(vRim, 1.8).toVar();
        const foot = smoothstep(1.0, 0.0, vLocal.y).toVar();
        heat.assign(rim.mul(nn.mul(0.7).add(0.35)).mul(foot));
        cov.assign(rim.mul(nn.mul(0.6).add(0.25)).mul(foot));
      })
      .ElseIf(style.lessThan(2.5), () => {
        // Front: an expanding wave, mostly rim.
        const nn = fxn(vec2(sp.x.mul(5.0).add(seed), sp.y.mul(5.0).sub(t.mul(3.0)))).toVar();
        heat.assign(pow(vRim, 3.0).mul(nn.mul(0.5).add(0.6)));
        cov.assign(pow(vRim, 2.0).mul(nn.mul(0.5).add(0.5)));
      })
      .Else(() => {
        // Ice: faceted, pale, solid enough to hide what is inside.
        const g = sp.mul(vec2(4.0, 3.0)).toVar();
        const f = fxh(floor(g).add(seed));
        const edges = smoothstep(0.42, 0.5, max(abs(fract(g.x).sub(0.5)), abs(fract(g.y).sub(0.5)))).toVar();
        const rim2 = pow(vRim, 2.0).toVar();
        heat.assign(f.mul(0.4).add(0.25).add(edges.mul(0.5)).add(rim2.mul(0.5)));
        cov.assign(edges.mul(0.3).add(0.45).add(rim2.mul(0.3)));
        occl.assign(0.55);
      });
    return kitOut(v, heat, clamp(cov, 0.0, 1.0).mul(v.D.y), occl);
  };
  const mat = kitMaterial('fx-shells', frag, { vertex: clip(wp) });
  return new InstancedPool('shells', base, mat, uTime, capacity, 18);
}
