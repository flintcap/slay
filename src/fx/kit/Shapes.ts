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

import * as THREE from 'three';
import { InstancedPool } from './Instanced';
import { GLSL_UNPACK } from './Palette';
import { FX_EXPOSURE, GLSL_EXPOSURE } from './Exposure';

const GLSL_NOISE = /* glsl */ `
  float fxh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float fxn(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(fxh(i), fxh(i + vec2(1.0, 0.0)), u.x), mix(fxh(i + vec2(0.0, 1.0)), fxh(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fxf(vec2 p) { return 0.5 * fxn(p) + 0.25 * fxn(p * 2.03) + 0.125 * fxn(p * 4.07) + 0.0625 * fxn(p * 8.1); }
  vec3 fxRamp(vec3 tail, vec3 body, vec3 core, float h) {
    vec3 c = mix(tail, body, smoothstep(0.05, 0.5, h));
    return mix(c, core, smoothstep(0.62, 0.98, h));
  }
`;

const COMMON_VARYINGS = /* glsl */ `
  varying vec3 vCore;
  varying vec3 vBody;
  varying vec3 vTail;
  varying float vEmit;
  varying vec4 vD;
`;

const COMMON_VERT_SETUP = /* glsl */ `
  vCore = unpackRGB(iC.x);
  vBody = unpackRGB(iC.y);
  vTail = unpackRGB(iC.z);
  vEmit = iC.w;
  vD = iD;
`;

// ---------------------------------------------------------------------------
// Cores
// ---------------------------------------------------------------------------

export const CORE_STYLE = { orb: 0, fireball: 1, plasma: 2, flare: 3, glob: 4, frost: 5, void: 6, soft: 7, bone: 8 } as const;
export type CoreStyle = keyof typeof CORE_STYLE;

const CORE_VERT = /* glsl */ `
  attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD;
  varying vec2 vP;
  ${COMMON_VARYINGS}
  ${GLSL_UNPACK}
  void main() {
    ${COMMON_VERT_SETUP}
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    // Orient the quad's -y along the travel direction as seen on screen, so the
    // tail trails behind.
    vec3 dir = iB.xyz;
    vec2 sd = vec2(dot(dir, camRight), dot(dir, camUp));
    float sl = length(sd);
    vec2 ax = sl > 1e-3 ? sd / sl : vec2(0.0, 1.0);
    vec2 ay = vec2(-ax.y, ax.x);
    float stretch = 1.0 + iB.w * min(sl, 1.0);
    vec2 c = position.xy;
    // Stretch only the tail half (behind the travel direction).
    float along = c.x < 0.0 ? c.x * stretch : c.x;
    vec2 q = ax * along + ay * c.y;
    vec3 wp = iA.xyz + (camRight * q.x + camUp * q.y) * iA.w;
    vP = vec2(along, c.y) * 2.0;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const CORE_FRAG = /* glsl */ `
  ${GLSL_EXPOSURE}
  uniform float uTime;
  varying vec2 vP;
  ${COMMON_VARYINGS}
  ${GLSL_NOISE}
  void main() {
    float style = vD.x;
    float fade = vD.y;
    float seed = vD.z * 37.0;
    vec2 p = vP;          // x along travel (+ ahead), y across; tail at x < -1
    float r = length(p);
    float t = uTime;
    float heat = 0.0;
    float cov = 0.0;
    float occl = 0.15;
    if (style < 0.5) {
      // Orb: hot heart, turbulent corona.
      float n = fxf(p * 2.6 + vec2(t * 1.7 + seed, t * 1.1));
      heat = pow(max(0.0, 1.0 - r * 0.95), 2.2) * 1.4 + n * 0.35 * smoothstep(1.0, 0.3, r);
      cov = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.35);
    } else if (style < 1.5) {
      // Fireball: dense heart, flame streaming back.
      vec2 q = vec2(p.x + 0.15, p.y * (1.0 + max(0.0, -p.x) * 0.25));
      float n = fxf(vec2(q.x * 2.2 + t * 6.0 + seed, q.y * 2.6));
      float tail = smoothstep(-3.0, -0.2, p.x);
      float d = length(vec2(min(q.x + 0.1, 0.0) * 0.45 + max(q.x, 0.0), q.y)) + (n - 0.5) * 0.7;
      cov = smoothstep(0.95, 0.35, d) * tail;
      heat = pow(max(0.0, 1.0 - length(p + vec2(-0.1, 0.0)) * 1.05), 1.6) * 1.5 + n * 0.45 * cov;
      occl = 0.3;
    } else if (style < 2.5) {
      // Ball lightning: white heart, crawling arcs that flicker.
      float fl = floor(t * 24.0);
      float n = fxn(vec2(atan(p.y, p.x) * 3.0 + fl * 1.3, r * 4.0 + seed));
      float arcs = smoothstep(0.92, 1.0, 1.0 - abs(n - 0.5) * 2.0) * smoothstep(1.0, 0.2, r);
      heat = pow(max(0.0, 1.0 - r * 1.3), 2.5) * 1.6 + arcs;
      cov = pow(max(0.0, 1.0 - r), 1.5) * 0.7 + arcs;
      occl = 0.0;
    } else if (style < 3.5) {
      // Flare: a star of light.
      float rays = exp(-p.x * p.x * 60.0) * max(0.0, 1.0 - abs(p.y)) + exp(-p.y * p.y * 60.0) * max(0.0, 1.0 - abs(p.x));
      heat = pow(max(0.0, 1.0 - r * 1.4), 2.0) * 1.3 + rays * 0.9;
      cov = clamp(heat, 0.0, 1.0);
      occl = 0.0;
    } else if (style < 4.5) {
      // Poison glob: wobbling, thick, with bright bubbles.
      float w = fxf(p * 2.0 + vec2(t * 2.0, seed));
      float d = r + (w - 0.5) * 0.45;
      cov = smoothstep(0.85, 0.6, d);
      float bub = smoothstep(0.75, 0.95, fxn(p * 6.0 + vec2(seed, t * 3.0)));
      heat = (0.35 + 0.5 * (1.0 - d) + bub * 0.6) * cov;
      occl = 0.55;
    } else if (style < 5.5) {
      // Frost orb: hard faceted ice with a bright heart.
      float a = atan(p.y, p.x);
      float facet = abs(fract(a * 0.954 + seed) - 0.5) * 2.0;
      float hexR = r * (1.0 + facet * 0.12);
      cov = smoothstep(0.85, 0.7, hexR) + 0.4 * smoothstep(1.0, 0.0, r);
      heat = pow(max(0.0, 1.0 - r * 1.1), 1.8) * 1.3 + (1.0 - facet) * 0.25 * cov;
      occl = 0.35;
    } else if (style < 6.5) {
      // Void: a dark heart ringed with light.
      float n = fxf(vec2(atan(p.y, p.x) * 2.0 + t * 2.0, r * 3.0 - t + seed));
      float rim = exp(-pow((r - 0.62 - (n - 0.5) * 0.2) / 0.16, 2.0));
      heat = rim * 1.2;
      cov = smoothstep(0.9, 0.5, r);
      occl = 0.85 * smoothstep(0.75, 0.3, r) + 0.2;
    } else if (style < 7.5) {
      // Soft glow.
      heat = pow(max(0.0, 1.0 - r), 2.4);
      cov = heat;
      occl = 0.0;
    } else {
      // Bone spirit: a pale skull-white heart, sickly halo.
      float n = fxf(p * 3.0 + vec2(t * 3.0, seed));
      heat = pow(max(0.0, 1.0 - r * 1.1), 2.0) * 1.2 + n * 0.3 * smoothstep(1.0, 0.4, r);
      cov = smoothstep(1.0, 0.35, r + (n - 0.5) * 0.3);
      occl = 0.25;
    }
    heat = clamp(heat, 0.0, 1.0);
    cov = clamp(cov, 0.0, 1.0) * fade;
    if (cov < 0.003) discard;
    vec3 col = fxRamp(vTail, vBody, vCore, heat);
    vec3 light = col * vEmit * (0.2 + 1.1 * heat);
    gl_FragColor = vec4(light * cov * uExposure, cov * occl);
  }
`;

export function makeCores(capacity: number): InstancedPool {
  const base = new THREE.PlaneGeometry(1, 1);
  const mat = new THREE.ShaderMaterial({
    name: 'fx-cores',
    uniforms: { uTime: { value: 0 }, uExposure: FX_EXPOSURE },
    vertexShader: CORE_VERT,
    fragmentShader: CORE_FRAG,
    side: THREE.DoubleSide,
    depthTest: true,
  });
  return new InstancedPool('cores', base, mat, capacity, 22);
}

// ---------------------------------------------------------------------------
// Beams
// ---------------------------------------------------------------------------

export const BEAM_STYLE = { ray: 0, flame: 1, drain: 2, shaft: 3, frost: 4 } as const;
export type BeamStyle = keyof typeof BEAM_STYLE;

const BEAM_VERT = /* glsl */ `
  attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD;
  varying vec2 vQ;
  varying float vLen;
  ${COMMON_VARYINGS}
  ${GLSL_UNPACK}
  void main() {
    ${COMMON_VERT_SETUP}
    vec3 a = iA.xyz;
    vec3 b = iB.xyz;
    vec3 ab = b - a;
    float len = max(length(ab), 1e-3);
    vec3 p = a + ab * position.y;
    vec3 camPos = cameraPosition;
    vec3 side = normalize(cross(ab, camPos - p) + vec3(1e-5));
    // Width swells a touch in the middle and pinches at the emitter.
    float w = iA.w * mix(0.55, 1.0, smoothstep(0.0, 0.08, position.y));
    p += side * position.x * w;
    vQ = vec2(position.x * 2.0, position.y);
    vLen = len;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;

const BEAM_FRAG = /* glsl */ `
  ${GLSL_EXPOSURE}
  uniform float uTime;
  varying vec2 vQ;
  varying float vLen;
  ${COMMON_VARYINGS}
  ${GLSL_NOISE}
  void main() {
    float style = vD.x;
    float fade = vD.y;
    float seed = vD.z * 19.0;
    float x = vQ.x;           // -1 .. 1 across
    float v = vQ.y;           // 0 .. 1 along
    float s = v * vLen;       // metres along
    float t = uTime;
    float ends = smoothstep(0.0, 0.04, v) * smoothstep(1.0, 0.96, v);
    float heat;
    float cov;
    float occl = 0.1;
    if (style < 0.5) {
      // Ray: a straight core in a rippling sheath.
      float n = fxf(vec2(s * 1.6 - t * 9.0 + seed, x * 1.5));
      float core = exp(-x * x * 26.0);
      float sheath = exp(-x * x * 3.0) * (0.45 + 0.6 * n);
      heat = core * 1.2 + sheath * 0.45;
      cov = core + sheath * 0.8;
    } else if (style < 1.5) {
      // Flame breath: widening, billowing, rolling forward.
      float n = fxf(vec2(s * 1.2 - t * 7.0 + seed, x * 2.0 + t));
      float edge = 1.0 - smoothstep(0.35 + 0.5 * n, 1.0, abs(x));
      heat = edge * (0.4 + 0.8 * n) * (1.0 - v * 0.6);
      cov = edge * (0.5 + 0.6 * n);
      occl = 0.3;
    } else if (style < 2.5) {
      // Drain: a thin wavering cord with beads flowing toward A.
      float wave = sin(s * 3.0 + t * 6.0 + seed) * 0.35;
      float d = abs(x - wave * smoothstep(0.0, 0.2, v) * smoothstep(1.0, 0.8, v));
      float beads = smoothstep(0.65, 1.0, sin(s * 5.0 + t * 14.0) * 0.5 + 0.5);
      heat = exp(-d * d * 30.0) * (0.7 + 0.5 * beads);
      cov = exp(-d * d * 18.0) * (0.6 + 0.4 * beads);
    } else if (style < 3.5) {
      // Shaft: soft vertical light.
      heat = exp(-x * x * 4.0) * (0.6 + 0.3 * fxn(vec2(s * 2.0 - t * 2.0, x * 3.0 + seed)));
      cov = heat * 0.8;
      occl = 0.0;
    } else {
      // Frost: a pale ray shedding crystals.
      float n = fxf(vec2(s * 3.0 - t * 4.0 + seed, x * 3.0));
      float core = exp(-x * x * 20.0);
      float glit = smoothstep(0.8, 0.95, n) * exp(-x * x * 2.0);
      heat = core + glit * 0.8 + exp(-x * x * 4.0) * 0.25;
      cov = core * 0.9 + glit + exp(-x * x * 4.0) * 0.4;
      occl = 0.2;
    }
    heat = clamp(heat, 0.0, 1.0);
    cov = clamp(cov, 0.0, 1.0) * ends * fade;
    if (cov < 0.003) discard;
    vec3 col = fxRamp(vTail, vBody, vCore, heat);
    vec3 light = col * vEmit * (0.2 + 1.1 * heat);
    gl_FragColor = vec4(light * cov * uExposure, cov * occl);
  }
`;

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
  const mat = new THREE.ShaderMaterial({
    name: 'fx-beams',
    uniforms: { uTime: { value: 0 }, uExposure: FX_EXPOSURE },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    side: THREE.DoubleSide,
    depthTest: true,
  });
  return new InstancedPool('beams', base, mat, capacity, 22);
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export const COLUMN_STYLE = { light: 0, swirl: 1, fire: 2, strike: 3 } as const;
export type ColumnStyle = keyof typeof COLUMN_STYLE;

const COLUMN_VERT = /* glsl */ `
  attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD;
  varying vec2 vUv;
  varying float vFacing;
  ${COMMON_VARYINGS}
  ${GLSL_UNPACK}
  void main() {
    ${COMMON_VERT_SETUP}
    // Base geometry: open cylinder radius 1, y 0..1.
    float y = position.y;
    float r = iA.w * mix(1.0, iB.y, y);
    vec3 wp = iA.xyz + vec3(position.x * r, y * iB.x, position.z * r);
    vec3 n = normalize(vec3(position.x, 0.0, position.z));
    vec3 viewDir = normalize(cameraPosition - wp);
    vFacing = abs(dot(n, viewDir));
    vUv = vec2(uv.x + iB.z, y);
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const COLUMN_FRAG = /* glsl */ `
  ${GLSL_EXPOSURE}
  uniform float uTime;
  varying vec2 vUv;
  varying float vFacing;
  ${COMMON_VARYINGS}
  ${GLSL_NOISE}
  void main() {
    float style = vD.x;
    float fade = vD.y;
    float seed = vD.z * 23.0;
    float u = vUv.x;
    float y = vUv.y;
    float t = uTime;
    // Facing the camera is the thick part of a volume of light.
    float body = pow(vFacing, 1.6);
    float top = 1.0 - smoothstep(0.35, 1.0, y);
    float bottom = smoothstep(0.0, 0.04, y);
    float heat;
    float cov;
    float occl = 0.0;
    if (style < 0.5) {
      float streak = 0.55 + 0.45 * fxn(vec2(u * 18.0 + seed, y * 3.0 - t * 1.5));
      heat = body * (0.55 + 0.6 * (1.0 - y)) * streak;
      cov = body * streak * 0.85;
    } else if (style < 1.5) {
      float sp = fxf(vec2(u * 6.0 + y * 3.0 - t * 1.2 + seed, y * 2.0 - t * 2.5));
      heat = body * (0.35 + 0.8 * sp);
      cov = body * (0.3 + 0.8 * sp);
      occl = 0.15;
    } else if (style < 2.5) {
      float n = fxf(vec2(u * 7.0 + seed, y * 3.0 - t * 4.0));
      heat = body * (0.3 + 0.9 * n) * (1.1 - y);
      cov = body * smoothstep(0.25, 0.6, n + (1.0 - y) * 0.3);
      occl = 0.3;
    } else {
      float fl = 0.7 + 0.3 * fxh(vec2(floor(t * 30.0), seed));
      heat = pow(vFacing, 4.0) * 1.3 * fl;
      cov = pow(vFacing, 2.0) * fl;
    }
    heat = clamp(heat, 0.0, 1.0);
    cov = clamp(cov * top * bottom, 0.0, 1.0) * fade;
    if (cov < 0.003) discard;
    vec3 col = fxRamp(vTail, vBody, vCore, heat);
    vec3 light = col * vEmit * (0.2 + 1.1 * heat);
    gl_FragColor = vec4(light * cov * uExposure, cov * occl);
  }
`;

export function makeColumns(capacity: number): InstancedPool {
  const base = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
  base.translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    name: 'fx-columns',
    uniforms: { uTime: { value: 0 }, uExposure: FX_EXPOSURE },
    vertexShader: COLUMN_VERT,
    fragmentShader: COLUMN_FRAG,
    side: THREE.DoubleSide,
    depthTest: true,
  });
  return new InstancedPool('columns', base, mat, capacity, 19);
}

// ---------------------------------------------------------------------------
// Shells
// ---------------------------------------------------------------------------

export const SHELL_STYLE = { ward: 0, aura: 1, front: 2, ice: 3 } as const;
export type ShellStyle = keyof typeof SHELL_STYLE;

const SHELL_VERT = /* glsl */ `
  attribute vec4 iA; attribute vec4 iB; attribute vec4 iC; attribute vec4 iD;
  varying vec3 vLocal;
  varying float vRim;
  ${COMMON_VARYINGS}
  ${GLSL_UNPACK}
  void main() {
    ${COMMON_VERT_SETUP}
    vec3 lp = position * vec3(1.0, iB.x > 0.0 ? iB.x : 1.0, 1.0);
    vec3 wp = iA.xyz + lp * iA.w;
    vec3 n = normalize(position);
    vec3 viewDir = normalize(cameraPosition - wp);
    vRim = 1.0 - abs(dot(n, viewDir));
    vLocal = position;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;

const SHELL_FRAG = /* glsl */ `
  ${GLSL_EXPOSURE}
  uniform float uTime;
  varying vec3 vLocal;
  varying float vRim;
  ${COMMON_VARYINGS}
  ${GLSL_NOISE}
  void main() {
    float style = vD.x;
    float fade = vD.y;
    float seed = vD.z * 29.0;
    float t = uTime;
    vec2 sp = vec2(atan(vLocal.z, vLocal.x) * 1.59, vLocal.y);
    float heat;
    float cov;
    float occl = 0.0;
    if (style < 0.5) {
      // Ward: hex lattice that brightens at the rim.
      vec2 g = sp * vec2(6.0, 6.0);
      vec2 h = abs(fract(g + vec2(0.5 * floor(mod(g.y, 2.0)), 0.0)) - 0.5);
      float lat = smoothstep(0.42, 0.5, max(h.x * 1.15 + h.y * 0.5, h.y));
      float rim = pow(vRim, 2.5);
      float pulse = 0.75 + 0.25 * sin(t * 3.0 + seed);
      heat = (rim * 0.9 + lat * 0.35) * pulse;
      cov = rim * 0.8 + lat * 0.22;
    } else if (style < 1.5) {
      // Aura: rising rippled light, faint in the middle.
      float n = fxf(vec2(sp.x * 3.0 + seed, sp.y * 2.5 - t * 1.4));
      float rim = pow(vRim, 1.8);
      float base = smoothstep(1.0, 0.0, vLocal.y);
      heat = rim * (0.35 + 0.7 * n) * base;
      cov = rim * (0.25 + 0.6 * n) * base;
    } else if (style < 2.5) {
      // Front: an expanding wave, mostly rim.
      float n = fxn(vec2(sp.x * 5.0 + seed, sp.y * 5.0 - t * 3.0));
      heat = pow(vRim, 3.0) * (0.6 + 0.5 * n);
      cov = pow(vRim, 2.0) * (0.5 + 0.5 * n);
    } else {
      // Ice: faceted, pale, solid enough to hide what is inside.
      vec2 g = sp * vec2(4.0, 3.0);
      float f = fxh(floor(g) + seed);
      float edges = smoothstep(0.42, 0.5, max(abs(fract(g.x) - 0.5), abs(fract(g.y) - 0.5)));
      heat = 0.25 + 0.4 * f + edges * 0.5 + pow(vRim, 2.0) * 0.5;
      cov = 0.45 + edges * 0.3 + pow(vRim, 2.0) * 0.3;
      occl = 0.55;
    }
    heat = clamp(heat, 0.0, 1.0);
    cov = clamp(cov, 0.0, 1.0) * fade;
    if (cov < 0.003) discard;
    vec3 col = fxRamp(vTail, vBody, vCore, heat);
    vec3 light = col * vEmit * (0.2 + 1.1 * heat);
    gl_FragColor = vec4(light * cov * uExposure, cov * occl);
  }
`;

export function makeShells(capacity: number): InstancedPool {
  const base = new THREE.SphereGeometry(1, 24, 16);
  const mat = new THREE.ShaderMaterial({
    name: 'fx-shells',
    uniforms: { uTime: { value: 0 }, uExposure: FX_EXPOSURE },
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    side: THREE.DoubleSide,
    depthTest: true,
  });
  return new InstancedPool('shells', base, mat, capacity, 18);
}
