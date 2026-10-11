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

import * as THREE from 'three';
import { markRange, markAll } from './Upload';
import { premultiplied } from './Particles';
import { GLSL_UNPACK } from './Palette';
import { FX_EXPOSURE, GLSL_EXPOSURE } from './Exposure';

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

const VERT = /* glsl */ `
  uniform float uTime;
  attribute vec4 iX;   // x, z, size, rotation
  attribute vec4 iT;   // spawn, life, kind, param
  attribute vec4 iC;   // core, body, tail (packed), emission
  attribute vec4 iE;   // floor y, fadeIn, seed, param2
  varying vec2 vP;
  varying vec4 vT;
  varying vec4 vE;
  varying float vAge;
  varying float vSize;
  varying vec3 vCore;
  varying vec3 vBody;
  varying vec3 vTail;
  varying float vEmit;
  ${GLSL_UNPACK}
  void main() {
    float age = uTime - iT.x;
    float kind = iT.z;
    // Telegraphs stay one beat past their duration for the landing flash.
    float extra = kind > 31.5 ? 0.16 : 0.0;
    float alive = step(0.0, age) * step(age, iT.y + extra) * step(0.0001, iT.y);
    float c = cos(iX.w);
    float s = sin(iX.w);
    vec2 local = position.xz * 2.0;   // -1..1
    vec2 scaled = local * iX.z * alive;
    // Rotation follows the game's heading convention: local +y points along
    // (sin r, cos r), the way a body facing r looks.
    vec2 rot = vec2(scaled.x * c + scaled.y * s, -scaled.x * s + scaled.y * c);
    // Lift scales with kind so stacked layers never fight: marks lowest.
    float lift = kind < 15.5 ? 0.012 : kind < 31.5 ? 0.02 : 0.028;
    vec3 wp = vec3(iX.x + rot.x, iE.x + lift, iX.y + rot.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
    vP = local;
    vT = iT;
    vE = iE;
    vAge = age;
    vSize = iX.z;
    vCore = unpackRGB(iC.x);
    vBody = unpackRGB(iC.y);
    vTail = unpackRGB(iC.z);
    vEmit = iC.w;
  }
`;

const FRAG = /* glsl */ `
  ${GLSL_EXPOSURE}
  precision highp float;
  uniform float uTime;
  varying vec2 vP;
  varying vec4 vT;
  varying vec4 vE;
  varying float vAge;
  varying float vSize;
  varying vec3 vCore;
  varying vec3 vBody;
  varying vec3 vTail;
  varying float vEmit;

  float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gn(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(gh(i), gh(i + vec2(1.0, 0.0)), u.x), mix(gh(i + vec2(0.0, 1.0)), gh(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float gf(vec2 p) { return 0.5 * gn(p) + 0.25 * gn(p * 2.03) + 0.125 * gn(p * 4.01) + 0.0625 * gn(p * 8.07); }
  vec3 ramp3(float h) {
    vec3 c = mix(vTail, vBody, smoothstep(0.05, 0.5, h));
    return mix(c, vCore, smoothstep(0.62, 0.98, h));
  }
  // Cracks: distance to cell borders of a jittered grid.
  float cracks(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    float d1 = 8.0; float d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(gh(i + g), gh(i + g + 17.0));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
    return d2 - d1;
  }

  void main() {
    float kind = vT.z;
    float life = max(vT.y, 1e-3);
    float t = clamp(vAge / life, 0.0, 1.0);
    float seed = vE.z * 61.0;
    vec2 p = vP;
    float r = length(p);
    vec2 wp = p * vSize + seed;      // metre-scaled noise space
    float a = atan(p.y, p.x);
    float heat = 0.0;
    float cov = 0.0;
    float occl = 0.0;
    vec3 rgb = vec3(0.0);


    float fadeIn = smoothstep(0.0, max(vE.y, 1e-3), vAge);
    float fadeOut = 1.0 - smoothstep(0.7, 1.0, t);

    if (kind < 15.5) {
      // ------------------------------------------------------------ marks

      float n = gf(wp * 1.6);
      float edge = 0.0;
      vec3 base = vBody;
      float dark = 0.75;
      if (kind < 0.5) {            // scorch: charred core, ragged edge
        edge = 1.0 - smoothstep(0.55, 0.95, r + (n - 0.5) * 0.55);
        cov = edge * (0.75 + 0.25 * gn(wp * 6.0));
        dark = 0.85;
      } else if (kind < 1.5) {     // blood: pool and droplets
        float pool = 1.0 - smoothstep(0.45, 0.6, r + (n - 0.5) * 0.4);
        float drops = smoothstep(0.78, 0.86, gn(wp * 5.0)) * (1.0 - smoothstep(0.7, 1.0, r));
        cov = max(pool, drops);
        dark = 0.7;
      } else if (kind < 2.5) {     // gore: thrown splatter
        float sp = gf(vec2(a * 1.3 + seed, r * 2.0));
        float arm = smoothstep(0.55, 0.8, sp) * (1.0 - smoothstep(0.3, 1.0, r));
        float core = 1.0 - smoothstep(0.25, 0.45, r + (n - 0.5) * 0.3);
        cov = max(core, arm);
        dark = 0.75;
      } else if (kind < 3.5) {     // rime: crystalline sheet with spiky rim
        float spikes = 0.85 + 0.15 * abs(sin(a * 9.0 + seed)) + (n - 0.5) * 0.3;
        cov = 1.0 - smoothstep(spikes - 0.15, spikes, r);
        cov *= 0.55 + 0.45 * smoothstep(0.02, 0.12, cracks(wp * 2.5));
        dark = 0.35;
        heat = 0.25;
      } else if (kind < 4.5) {     // acid: pitted pool
        float pool = 1.0 - smoothstep(0.55, 0.75, r + (n - 0.5) * 0.45);
        float pits = smoothstep(0.65, 0.8, gn(wp * 7.0));
        cov = pool * (0.7 + 0.3 * pits);
        dark = 0.55;
        heat = 0.15;
      } else if (kind < 5.5) {     // crack: broken ground
        float c = 1.0 - smoothstep(0.0, 0.06, cracks(wp * 1.4));
        cov = c * (1.0 - smoothstep(0.5, 1.0, r)) + (1.0 - smoothstep(0.1, 0.35, r)) * 0.4;
        dark = 0.9;
      } else if (kind < 6.5) {     // crater: gouged centre, radial cuts
        float rays = smoothstep(0.7, 0.95, gn(vec2(a * 4.0 + seed, r * 1.5)));
        float bowl = 1.0 - smoothstep(0.3, 0.55, r + (n - 0.5) * 0.25);
        float rim = exp(-pow((r - 0.6) / 0.12, 2.0)) * 0.35;
        cov = max(bowl, rays * (1.0 - smoothstep(0.5, 1.0, r))) + rim;
        dark = 0.85;
      } else if (kind < 7.5) {     // bone: scattered splinters
        vec2 g = wp * 3.0;
        vec2 cell = floor(g);
        vec2 f = fract(g) - 0.5;
        float ang = gh(cell) * 6.28;
        vec2 q = vec2(f.x * cos(ang) - f.y * sin(ang), f.x * sin(ang) + f.y * cos(ang));
        float splinter = (1.0 - smoothstep(0.08, 0.12, abs(q.y))) * (1.0 - smoothstep(0.25, 0.35, abs(q.x)));
        float keep = step(0.5, gh(cell + 3.0)) * (1.0 - smoothstep(0.6, 1.0, r));
        cov = splinter * keep + (1.0 - smoothstep(0.2, 0.5, r)) * 0.25;
        dark = 0.0;
        heat = 0.3;
      } else if (kind < 8.5) {     // fork: branching scorch lines
        float br = abs(sin(a * 3.0 + gf(vec2(r * 3.0, seed)) * 4.0));
        float line = 1.0 - smoothstep(0.0, 0.12, br * r);
        cov = line * (1.0 - smoothstep(0.5, 1.0, r)) + (1.0 - smoothstep(0.08, 0.25, r)) * 0.6;
        dark = 0.9;
      } else if (kind < 9.5) {     // scuff: a dark smudge
        cov = (1.0 - smoothstep(0.2, 1.0, r + (n - 0.5) * 0.4)) * 0.5;
        dark = 0.8;
      } else if (kind < 10.5) {    // burnt sigil
        float ring = exp(-pow((r - 0.8) / 0.05, 2.0)) + exp(-pow((r - 0.6) / 0.03, 2.0)) * 0.7;
        float spokes = (1.0 - smoothstep(0.0, 0.05, abs(sin(a * 3.0)) * r)) * step(r, 0.8);
        cov = clamp(ring + spokes * 0.7, 0.0, 1.0);
        dark = 0.85;
      } else if (kind < 11.5) {    // ash
        cov = (1.0 - smoothstep(0.4, 0.95, r + (n - 0.5) * 0.5)) * (0.5 + 0.5 * gn(wp * 4.0));
        dark = 0.35;
      } else if (kind < 12.5) {    // wet
        cov = (1.0 - smoothstep(0.5, 0.9, r + (n - 0.5) * 0.4)) * 0.6;
        dark = 0.6;
      } else {                     // shadow
        cov = pow(max(0.0, 1.0 - r), 1.5) * 0.8;
        dark = 1.0;
      }
      float alpha = cov * fadeIn * fadeOut;
      // Marks hide the floor (occlusion) and add a little of their own colour.
      rgb = base * vEmit * (0.06 + heat) * alpha;
      occl = alpha * dark + alpha * (1.0 - dark) * 0.5;
      if (occl < 0.003 && dot(rgb, rgb) < 1e-6) discard;
      gl_FragColor = vec4(rgb, occl);
      return;
    }

    if (kind < 31.5) {
      // ------------------------------------------------------------ glows
      float n = gf(wp * 1.4 + vec2(0.0, -uTime * 0.3));
      if (kind < 16.5) {           // cinders: embers cooling to black
        float spots = smoothstep(0.55, 0.85, gf(wp * 3.0));
        float area = 1.0 - smoothstep(0.4, 0.95, r + (n - 0.5) * 0.4);
        float cool = 1.0 - t;
        heat = spots * area * cool * (0.75 + 0.25 * sin(uTime * 7.0 + seed + wp.x * 3.0));
        cov = heat;
        fadeOut = 1.0;
      } else if (kind < 19.5) {    // frost / fork / acid glow over their marks
        float area = 1.0 - smoothstep(0.35, 0.9, r + (n - 0.5) * 0.45);
        float lines = kind > 17.5 && kind < 18.5 ? (1.0 - smoothstep(0.0, 0.1, abs(sin(a * 3.0 + gf(vec2(r * 3.0, seed)) * 4.0)) * r)) : 1.0;
        heat = area * lines * (1.0 - t) * 0.8;
        cov = heat;
        fadeOut = 1.0;
      } else if (kind < 20.5) {    // shock ring: expands and thins
        float e = 1.0 - pow(1.0 - t, 2.5);
        float rr = mix(0.08, 1.0, e);
        float w = mix(0.14, 0.03, e);
        float band = exp(-pow((r - rr) / w, 2.0));
        float rough = 0.6 + 0.5 * gn(vec2(a * 6.0 + seed, rr * 8.0));
        heat = band * rough * (1.0 - t * 0.7);
        cov = band * rough * (1.0 - t);
        occl = cov * 0.15;
      } else if (kind < 21.5) {    // rune circle: rotating, glyph ticks
        float spin = uTime * (0.6 + vT.w);
        float aa = a + spin;
        float outer = exp(-pow((r - 0.92) / 0.025, 2.0));
        float inner = exp(-pow((r - 0.72) / 0.018, 2.0));
        float ticks = step(0.72, r) * step(r, 0.92) * smoothstep(0.85, 0.95, abs(sin(aa * 12.0)));
        float glyph = step(0.75, r) * step(r, 0.89) * smoothstep(0.6, 0.75, gn(vec2(aa * 6.0, r * 30.0) + seed));
        float star = (1.0 - smoothstep(0.0, 0.02, abs(sin(aa * 2.5 - spin * 2.0)) * r)) * step(r, 0.72) * 0.6;
        heat = outer + inner * 0.8 + ticks * 0.6 + glyph * 0.7 + star;
        cov = clamp(heat, 0.0, 1.0) * 0.9;
      } else if (kind < 22.5) {    // aura ring: soft ring and dashes
        float pulse = 0.8 + 0.2 * sin(uTime * 2.5 + seed);
        float ring = exp(-pow((r - 0.9) / 0.06, 2.0));
        float dash = smoothstep(0.3, 0.7, sin(a * 8.0 + uTime * 1.2)) * exp(-pow((r - 0.78) / 0.025, 2.0));
        float fill = (1.0 - smoothstep(0.0, 0.95, r)) * 0.1;
        heat = (ring * 0.8 + dash * 0.5 + fill) * pulse;
        cov = heat * 0.8;
      } else if (kind < 23.5) {    // light pool
        heat = pow(max(0.0, 1.0 - r), 2.0) * 0.8;
        cov = heat * 0.6;
      } else if (kind < 24.5) {    // burning ground
        float f = gf(wp * 1.8 + vec2(uTime * 0.4, -uTime * 1.1));
        float area = 1.0 - smoothstep(0.55, 1.0, r + (n - 0.5) * 0.35);
        heat = area * smoothstep(0.35, 0.8, f) * (0.85 + 0.15 * sin(uTime * 13.0 + wp.x));
        cov = area * (0.25 + 0.75 * smoothstep(0.3, 0.7, f));
        occl = area * 0.25;
      } else if (kind < 25.5) {    // poison pool
        float f = gf(wp * 1.5 + vec2(uTime * 0.2, uTime * 0.15));
        float bub = smoothstep(0.82, 0.92, gn(wp * 5.0 + vec2(0.0, uTime * 0.8)));
        float area = 1.0 - smoothstep(0.6, 1.0, r + (n - 0.5) * 0.35);
        heat = area * (0.25 + 0.45 * f + bub * 0.6);
        cov = area * (0.5 + 0.3 * f);
        occl = area * 0.45;
      } else if (kind < 26.5) {    // frost field: glitter on a pale sheet
        float glit = smoothstep(0.88, 0.97, gn(wp * 9.0 + floor(uTime * 6.0)));
        float area = 1.0 - smoothstep(0.6, 1.0, r + (n - 0.5) * 0.3);
        float sheet = 0.55 + 0.45 * smoothstep(0.02, 0.1, cracks(wp * 2.0));
        heat = area * (0.2 * sheet + glit);
        cov = area * (0.35 * sheet + glit);
        occl = area * 0.3;
      } else if (kind < 27.5) {    // void pool: dark swirl, bright rim
        float sw = gf(vec2(a * 2.0 + r * 4.0 - uTime * 1.5, r * 3.0) + seed);
        float area = 1.0 - smoothstep(0.7, 1.0, r);
        float rim = exp(-pow((r - 0.85 - (sw - 0.5) * 0.1) / 0.07, 2.0));
        heat = rim * 0.7 + area * sw * 0.25;
        cov = rim * 0.8 + area * 0.6;
        occl = area * 0.7;
      } else if (kind < 28.5) {    // wedge: flame or frost on the ground in a cone
        float half_ = max(vT.w, 0.05);
        float ang = abs(atan(p.x, p.y));
        float inCone = (1.0 - smoothstep(half_ * 0.8, half_, ang)) * (1.0 - smoothstep(0.75, 1.0, r)) * step(0.0, p.y + 0.05);
        float f = gf(vec2(r * 4.0 - uTime * 6.0, ang * 3.0) + seed);
        heat = inCone * (0.3 + 0.7 * f) * (1.0 - r * 0.6);
        cov = inCone * (0.3 + 0.6 * f);
        occl = cov * 0.15;
      } else if (kind < 29.5) {    // storm field: crawling arcs
        float fl = floor(uTime * 18.0);
        float c = cracks(wp * 1.2 + fl * 0.37);
        float arcs = 1.0 - smoothstep(0.0, 0.05, c);
        float area = 1.0 - smoothstep(0.6, 1.0, r);
        heat = arcs * area * (0.7 + 0.3 * gh(vec2(fl, seed)));
        cov = arcs * area + area * 0.08;
      } else if (kind < 30.5) {    // holy ground: rays from the centre
        float rays = smoothstep(0.6, 1.0, sin(a * 10.0 + uTime * 0.6) * 0.5 + 0.5);
        float area = pow(max(0.0, 1.0 - r), 1.3);
        heat = area * (0.35 + rays * 0.5);
        cov = area * (0.3 + rays * 0.4);
      } else {                     // sigil glow: a burning arcane sigil
        float ring = exp(-pow((r - 0.8) / 0.05, 2.0)) + exp(-pow((r - 0.6) / 0.03, 2.0)) * 0.7;
        float spokes = (1.0 - smoothstep(0.0, 0.05, abs(sin(a * 3.0 + uTime * 0.3)) * r)) * step(r, 0.8);
        heat = clamp(ring + spokes * 0.7, 0.0, 1.0) * (1.0 - t);
        cov = heat;
        fadeOut = 1.0;
      }
      heat = clamp(heat, 0.0, 1.0);
      float alpha = clamp(cov, 0.0, 1.0) * fadeIn * fadeOut;
      if (alpha < 0.003) discard;
      rgb = ramp3(heat) * vEmit * (0.2 + 1.1 * heat) * alpha * uExposure;
      gl_FragColor = vec4(rgb, clamp(occl, 0.0, 1.0) * fadeIn * fadeOut);
      return;
    }

    // -------------------------------------------------------------- telegraphs
    float dur = life;
    float tt = clamp(vAge / dur, 0.0, 1.0);
    float post = clamp((vAge - dur) / 0.16, 0.0, 1.0);
    float px = fwidth(r) * 1.5 + 0.004;
    float sd;
    float sweep;
    if (kind < 32.5) {
      sd = r - 1.0;
      sweep = r;
    } else if (kind < 33.5) {
      float half_ = max(vT.w, 0.05);
      float ang = abs(atan(p.x, p.y));
      sd = max(r - 1.0, (ang - half_) * max(r, 0.1));
      sweep = r;
    } else if (kind < 34.5) {
      // Line along +y from -1 to 1, half-width param (fraction of the half length).
      vec2 d = vec2(abs(p.x) - vT.w, abs(p.y) - 1.0);
      sd = min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
      sweep = p.y * 0.5 + 0.5;
    } else {
      float th = max(vT.w, 0.04);
      sd = abs(r - (1.0 - th)) - th;
      sweep = 1.0 - abs(r - (1.0 - th)) / th;
    }
    float inside = 1.0 - smoothstep(-px, px, sd);
    float edge = exp(-pow(sd / (px * 2.2), 2.0));
    float inner = exp(-pow((sd + 0.06) / (px * 1.6), 2.0)) * 0.45;
    float filled = (1.0 - smoothstep(tt - 0.02, tt + 0.02, sweep)) * inside;
    float front = exp(-pow((sweep - tt) / 0.035, 2.0)) * inside;
    float imminent = smoothstep(0.75, 1.0, tt);
    float pulse = 0.5 + 0.5 * sin(vAge * mix(10.0, 34.0, imminent));
    float hatch = smoothstep(0.55, 0.9, 0.5 + 0.5 * sin((p.x + p.y) * vSize * 3.2 - vAge * 4.0)) * inside;
    // Danger darkens the floor and takes the attack's colour; light lives on
    // the edges and the growing front, not in a bright disc.
    float shadowA = inside * (0.28 + 0.22 * filled);
    // The edge holds the attack's own colour; it only runs white-hot as the
    // strike lands, so packs of telegraphs do not wash the hero out.
    heat = clamp(edge * (0.58 + 0.22 * pulse * (0.4 + imminent) + 0.15 * imminent) + inner + front * 0.6 + filled * (0.12 + hatch * 0.1) + imminent * pulse * 0.15 * inside, 0.0, 1.0);
    float light = heat;
    // The landing flash.
    light += post * (1.0 - post) * 2.0 * (edge + inside * 0.3);
    float fadeStart = smoothstep(0.0, 0.08, tt);
    float alive = 1.0 - post;
    vec3 col = ramp3(clamp(light, 0.0, 1.0)) * vEmit * (0.2 + 1.1 * clamp(light, 0.0, 1.2));
    cov = clamp(edge + inner + front * 0.7 + filled * 0.35 + hatch * 0.1, 0.0, 1.0);
    rgb = col * cov * fadeStart * alive + vBody * vEmit * post * (1.0 - post) * 0.7 * inside;
    float oc = shadowA * fadeStart * alive;
    if (oc < 0.003 && dot(rgb, rgb) < 1e-6) discard;
    gl_FragColor = vec4(rgb, oc);
  }
`;

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
  private mat: THREE.ShaderMaterial;
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
    this.mat = new THREE.ShaderMaterial({
      name: `fx-ground-${name}`,
      uniforms: { uTime: { value: 0 }, uExposure: FX_EXPOSURE },
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
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
    this.mat.uniforms.uTime!.value = this.time;
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
