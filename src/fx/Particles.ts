/**
 * SLAY — GPU particle system + floating combat text.
 *
 * Design notes
 * ------------
 * Particles are simulated **entirely in the vertex shader**. `burst()` writes a
 * spawn record (position, velocity, life, size curve, colour ramp, gravity,
 * drag, turbulence, seed) into a ring buffer of instanced attributes; from then
 * on the CPU touches nothing but a single `uTime` uniform. A frame with no new
 * bursts uploads zero bytes.
 *
 * Geometry is an `InstancedBufferGeometry` quad rather than `THREE.Points`
 * because points cap out at the driver's `gl_PointSize` limit (which shreds big
 * explosion puffs), cannot rotate, and cannot be stretched along velocity —
 * and stretched sparks are half of what makes an impact read as fast.
 *
 * Two pools exist per scene, one per blend mode (additive for anything that
 * emits light, alpha for smoke/dust/blood). Local-space emitters get their own
 * small pool parented to the moving object, so trailing particles inherit the
 * emitter transform for free.
 *
 * Soft particles (depth-fade against scene geometry, so a smoke puff does not
 * slice a hard line through a wall) are supported via an optional half-res
 * depth prepass — call `enableSoftParticles(renderer, camera)`.
 *
 * Everything — every sprite, every glyph — is drawn into a canvas at runtime.
 * There is not one byte of external asset in this file.
 */

import * as THREE from 'three';
import type { QualityProfile } from '../core/Renderer';
import { Random } from '../core/RNG';
import { Noise, clamp01, smoothstep } from '../art/Noise';
import type { Rng } from '../types';

// ---------------------------------------------------------------------------
// Sprite atlas
// ---------------------------------------------------------------------------

/** Atlas cell ids. 4x4 grid; the shader derives UVs from the index. */
export const SPRITE = {
  glow: 0,
  spark: 1,
  smoke: 2,
  ember: 3,
  shard: 4,
  rune: 5,
  ring: 6,
  star: 7,
  blood: 8,
  dust: 9,
  flame: 10,
  snow: 11,
  bubble: 12,
  spore: 13,
  bolt: 14,
  chunk: 15,
} as const;

const ATLAS_GRID = 4;
const ATLAS_CELL = 128;

let atlasTexture: THREE.Texture | null = null;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, g: number, b: number, a: number): void {
  ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
  ctx.fillRect(x, y, 1, 1);
}

/**
 * Builds the 512x512 particle sprite sheet. Each cell is authored as a
 * white/grey mask in RGB with the shape in alpha — colour comes from the
 * per-particle ramp so one sheet serves every element.
 */
function buildSpriteAtlas(): THREE.Texture {
  if (atlasTexture) return atlasTexture;
  const size = ATLAS_GRID * ATLAS_CELL;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const noise = new Noise(0xa17e);
  const C = ATLAS_CELL;
  const H = C / 2;

  const cell = (i: number): { ox: number; oy: number } => ({
    ox: (i % ATLAS_GRID) * C,
    oy: Math.floor(i / ATLAS_GRID) * C,
  });

  const withCell = (i: number, fn: () => void): void => {
    const { ox, oy } = cell(i);
    ctx.save();
    ctx.translate(ox, oy);
    ctx.beginPath();
    ctx.rect(0, 0, C, C);
    ctx.clip();
    fn();
    ctx.restore();
  };

  // 0 — soft radial glow. The workhorse: an exponential falloff, not a linear
  // ramp, so it keeps a hot core when many overlap additively.
  withCell(SPRITE.glow, () => {
    const g = ctx.createRadialGradient(H, H, 0, H, H, H);
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const a = Math.pow(1 - t, 2.4);
      g.addColorStop(t, `rgba(255,255,255,${a})`);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C, C);
  });

  // 1 — spark streak: a thin bright lozenge, hot in the middle.
  withCell(SPRITE.spark, () => {
    const img = ctx.createImageData(C, C);
    const d = img.data;
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const u = (x - H) / H;
        const v = (y - H) / H;
        const along = clamp01(1 - Math.abs(v));
        const across = Math.exp(-(u * u) * 42);
        const a = clamp01(across * Math.pow(along, 1.6));
        const core = clamp01(Math.exp(-(u * u) * 260) * Math.pow(along, 0.7));
        const o = (y * C + x) * 4;
        const lum = 150 + 105 * core;
        d[o] = lum;
        d[o + 1] = lum;
        d[o + 2] = lum;
        d[o + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  // 2 — smoke puff: fbm-perturbed disc with soft, ragged edges.
  withCell(SPRITE.smoke, () => {
    const img = ctx.createImageData(C, C);
    const d = img.data;
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const u = (x - H) / H;
        const v = (y - H) / H;
        const r = Math.sqrt(u * u + v * v);
        const n = noise.fbm(x * 0.028, y * 0.028, 4) * 0.5 + 0.5;
        const n2 = noise.warp(x * 0.014 + 11, y * 0.014 + 7, 1.4, 3) * 0.5 + 0.5;
        const edge = smoothstep(1.0, 0.24, r + (n - 0.5) * 0.55);
        const a = clamp01(edge * (0.45 + 0.75 * n2));
        const o = (y * C + x) * 4;
        const lum = 190 + 65 * n2;
        d[o] = lum;
        d[o + 1] = lum;
        d[o + 2] = lum;
        d[o + 3] = a * 235;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  // 3 — ember: white-hot pinpoint core with a wide dim halo.
  withCell(SPRITE.ember, () => {
    const img = ctx.createImageData(C, C);
    const d = img.data;
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const u = (x - H) / H;
        const v = (y - H) / H;
        const r = Math.sqrt(u * u + v * v);
        const halo = Math.pow(clamp01(1 - r), 3.0) * 0.5;
        const core = Math.exp(-r * r * 46);
        const a = clamp01(halo + core);
        const o = (y * C + x) * 4;
        const lum = 120 + 135 * clamp01(core * 1.6);
        d[o] = lum;
        d[o + 1] = lum;
        d[o + 2] = lum;
        d[o + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  // 4 — crystal shard: hard-edged hexagonal sliver with a bright spine.
  withCell(SPRITE.shard, () => {
    ctx.translate(H, H);
    const pts: Array<[number, number]> = [
      [0, -H * 0.92],
      [H * 0.34, -H * 0.24],
      [H * 0.26, H * 0.7],
      [0, H * 0.95],
      [-H * 0.26, H * 0.7],
      [-H * 0.34, -H * 0.24],
    ];
    const g = ctx.createLinearGradient(-H * 0.34, 0, H * 0.34, 0);
    g.addColorStop(0, 'rgba(110,110,110,0.65)');
    g.addColorStop(0.45, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(110,110,110,0.65)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -H * 0.9);
    ctx.lineTo(0, H * 0.92);
    ctx.stroke();
  });

  // 5 — rune glyph: an angular sigil, deterministic per build.
  withCell(SPRITE.rune, () => {
    ctx.translate(H, H);
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 8;
    const rng = new Random(0x5eed);
    const R = H * 0.62;
    ctx.beginPath();
    let ax = 0;
    let ay = -R;
    ctx.moveTo(ax, ay);
    for (let i = 0; i < 5; i++) {
      const ang = rng.range(0, Math.PI * 2);
      const rad = rng.range(R * 0.45, R);
      ax = Math.cos(ang) * rad;
      ay = Math.sin(ang) * rad;
      ctx.lineTo(ax, ay);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.12, 0, Math.PI * 2);
    ctx.stroke();
  });

  // 6 — ring / halo: a thin annulus for shockwaves and pickup pops.
  withCell(SPRITE.ring, () => {
    const img = ctx.createImageData(C, C);
    const d = img.data;
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const u = (x - H) / H;
        const v = (y - H) / H;
        const r = Math.sqrt(u * u + v * v);
        const a = clamp01(Math.exp(-Math.pow((r - 0.78) * 9.0, 2)));
        const o = (y * C + x) * 4;
        d[o] = 255;
        d[o + 1] = 255;
        d[o + 2] = 255;
        d[o + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  // 7 — four-point star flare, the classic "bright thing" sparkle.
  withCell(SPRITE.star, () => {
    const img = ctx.createImageData(C, C);
    const d = img.data;
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const u = (x - H) / H;
        const v = (y - H) / H;
        const r = Math.sqrt(u * u + v * v) + 1e-4;
        const core = Math.exp(-r * r * 34);
        const spikeH = Math.exp(-(v * v) * 900) * Math.pow(clamp01(1 - Math.abs(u)), 2.2);
        const spikeV = Math.exp(-(u * u) * 900) * Math.pow(clamp01(1 - Math.abs(v)), 2.2);
        const diag = Math.exp(-Math.pow((u - v) * 0.7071, 2) * 2600) * Math.pow(clamp01(1 - r), 3) * 0.6
          + Math.exp(-Math.pow((u + v) * 0.7071, 2) * 2600) * Math.pow(clamp01(1 - r), 3) * 0.6;
        const a = clamp01(core + spikeH * 0.85 + spikeV * 0.85 + diag);
        const o = (y * C + x) * 4;
        d[o] = 255;
        d[o + 1] = 255;
        d[o + 2] = 255;
        d[o + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  // 8 — blood droplet: teardrop with a heavy head, slightly irregular.
  withCell(SPRITE.blood, () => {
    const img = ctx.createImageData(C, C);
    const d = img.data;
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const u = (x - H) / H;
        const v = (y - H) / H;
        const squash = v > 0 ? 1.0 : 1.0 + v * 0.5;
        const r = Math.sqrt((u / 0.62) * (u / 0.62) + (v / (0.9 * squash)) * (v / (0.9 * squash)));
        const wob = noise.simplex2(x * 0.06, y * 0.06) * 0.08;
        const a = smoothstep(1.0, 0.72, r + wob);
        const o = (y * C + x) * 4;
        const shade = 160 + 95 * clamp01(1 - r);
        d[o] = shade;
        d[o + 1] = shade;
        d[o + 2] = shade;
        d[o + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  // 9 — dust speck: very soft, very cheap, low contrast.
  withCell(SPRITE.dust, () => {
    const g = ctx.createRadialGradient(H, H, 0, H, H, H * 0.9);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, C, C);
  });

  // 10 — flame lick: teardrop pointing up with a turbulent silhouette.
  withCell(SPRITE.flame, () => {
    const img = ctx.createImageData(C, C);
    const d = img.data;
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const u = (x - H) / H;
        const v = (y - H) / H; // -1 top, +1 bottom
        const height = clamp01((1 - v) * 0.5); // 0 bottom, 1 top
        const width = 0.72 * Math.pow(1 - height, 0.55) + 0.04;
        const n = noise.fbm(x * 0.05, y * 0.05 - height * 3.0, 3) * 0.22;
        const a = smoothstep(width, width * 0.25, Math.abs(u) + n) * smoothstep(0.02, 0.22, height) *
          smoothstep(1.02, 0.86, height);
        const o = (y * C + x) * 4;
        const hot = clamp01(1 - height * 1.5) * clamp01(1 - Math.abs(u) / width);
        const lum = 130 + 125 * hot;
        d[o] = lum;
        d[o + 1] = lum;
        d[o + 2] = lum;
        d[o + 3] = clamp01(a) * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  // 11 — snowflake: six-fold dendrite.
  withCell(SPRITE.snow, () => {
    ctx.translate(H, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i / 6) * Math.PI * 2);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -H * 0.82);
      ctx.stroke();
      ctx.lineWidth = 4;
      for (const at of [0.4, 0.62, 0.8]) {
        const yy = -H * 0.82 * at;
        const len = H * 0.24 * (1 - at * 0.55);
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(len, yy - len * 0.75);
        ctx.moveTo(0, yy);
        ctx.lineTo(-len, yy - len * 0.75);
        ctx.stroke();
      }
      ctx.restore();
    }
  });

  // 12 — bubble: bright rim, hollow centre, tiny specular highlight.
  withCell(SPRITE.bubble, () => {
    const img = ctx.createImageData(C, C);
    const d = img.data;
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const u = (x - H) / H;
        const v = (y - H) / H;
        const r = Math.sqrt(u * u + v * v);
        const rim = Math.exp(-Math.pow((r - 0.82) * 8.5, 2));
        const fill = smoothstep(0.9, 0.6, r) * 0.14;
        const hi = Math.exp(-(Math.pow(u + 0.34, 2) + Math.pow(v + 0.4, 2)) * 60) * 0.9;
        const a = clamp01(rim * 0.9 + fill + hi);
        const o = (y * C + x) * 4;
        d[o] = 255;
        d[o + 1] = 255;
        d[o + 2] = 255;
        d[o + 3] = a * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  // 13 — spore: fuzzy seed head with a halo of filaments.
  withCell(SPRITE.spore, () => {
    ctx.translate(H, H);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, H * 0.3);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, H * 0.3, 0, Math.PI * 2);
    ctx.fill();
    const rng = new Random(0x513e);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 22; i++) {
      const a = rng.range(0, Math.PI * 2);
      const len = rng.range(H * 0.32, H * 0.86);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * H * 0.14, Math.sin(a) * H * 0.14);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.stroke();
    }
  });

  // 14 — bolt fragment: a jagged lightning segment.
  withCell(SPRITE.bolt, () => {
    ctx.translate(H, H);
    const rng = new Random(0xb017);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, a] of [[16, 0.28], [8, 0.6], [3.5, 1]] as Array<[number, number]>) {
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(0, -H * 0.92);
      const steps = 6;
      const seg = new Random(0xb017);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        ctx.lineTo(seg.range(-0.3, 0.3) * H * (1 - Math.abs(t - 0.5)), -H * 0.92 + t * H * 1.84);
      }
      ctx.stroke();
      void rng;
    }
  });

  // 15 — debris chunk: irregular opaque polygon (gibs, stone, bone).
  withCell(SPRITE.chunk, () => {
    ctx.translate(H, H);
    const rng = new Random(0xc401);
    ctx.beginPath();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = H * rng.range(0.5, 0.86);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(-H, -H, H, H);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(105,105,105,1)');
    ctx.fillStyle = g;
    ctx.fill();
  });

  void px;

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  atlasTexture = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------

const PARTICLE_VERT = /* glsl */ `
  uniform float uTime;
  uniform float uScale;

  attribute vec3 iPos;
  attribute vec3 iVel;
  attribute vec4 iTime;   // spawn, life, fadePow, spin
  attribute vec4 iSize;   // size0, size1, stretch, spriteIndex
  attribute vec3 iColA;
  attribute vec3 iColB;
  attribute vec4 iPhys;   // gravity, drag, turbulence, seed

  varying vec2 vUv;
  varying vec4 vColor;
  varying vec4 vClip;
  varying float vViewZ;

  void main() {
    float life = max(iTime.y, 1e-4);
    float age  = uTime - iTime.x;
    float alive = step(0.0, age) * step(age, life);
    float ta = clamp(age, 0.0, life);
    float t = ta / life;

    // --- integrate ---------------------------------------------------------
    // Exponential drag has a closed form, so the whole trajectory is a pure
    // function of age. That is the entire reason the CPU can stay idle.
    float k = iPhys.y;
    vec3 linear = iVel * ta;
    vec3 dragged = iVel * (1.0 - exp(-k * ta)) / max(k, 1e-4);
    vec3 disp = mix(linear, dragged, step(1e-3, k));
    disp.y += 0.5 * iPhys.x * ta * ta;

    float sd = iPhys.w;
    vec3 turb = vec3(
      sin(ta * 2.3 + sd * 17.0) + 0.5 * sin(ta * 5.1 + sd * 7.3),
      sin(ta * 1.7 + sd * 11.0) * 0.65,
      cos(ta * 2.1 + sd * 13.0) + 0.5 * cos(ta * 4.7 + sd * 5.1)
    );
    disp += turb * iPhys.z * ta;

    vec3 wpos = iPos + disp;

    // --- billboard ---------------------------------------------------------
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 camFwd   = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);

    float size = mix(iSize.x, iSize.y, t) * uScale * alive;
    vec2 corner = position.xy;
    vec3 offset;

    if (iSize.z > 0.001) {
      // Stretch along the instantaneous velocity — sparks and gibs read as
      // motion instead of as floating dots.
      vec3 vel = iVel + vec3(0.0, iPhys.x * ta, 0.0);
      float sp = length(vel);
      vec3 vdir = sp > 1e-4 ? vel / sp : camUp;
      vec3 side = normalize(cross(vdir, camFwd) + vec3(1e-5));
      float len = size * (1.0 + iSize.z * sp * 0.09);
      offset = side * corner.x * size + vdir * corner.y * len;
    } else {
      float ang = iTime.w * ta + sd * 6.2831853;
      float ca = cos(ang);
      float sa = sin(ang);
      vec2 rc = vec2(corner.x * ca - corner.y * sa, corner.x * sa + corner.y * ca);
      offset = camRight * rc.x * size + camUp * rc.y * size;
    }

    vec4 mv = modelViewMatrix * vec4(wpos, 1.0);
    mv.xyz += mat3(viewMatrix) * offset;
    vViewZ = -mv.z;
    vec4 clip = projectionMatrix * mv;
    gl_Position = clip;
    vClip = clip;

    // --- shade -------------------------------------------------------------
    float fadeIn  = smoothstep(0.0, 0.07, t);
    float fadeOut = pow(max(1.0 - t, 0.0), iTime.z);
    float ease = t * t * (3.0 - 2.0 * t);
    vColor = vec4(mix(iColA, iColB, ease), fadeIn * fadeOut * alive);

    float idx = iSize.w;
    float col = mod(idx, 4.0);
    float row = floor(idx * 0.25);
    vUv = (uv + vec2(col, row)) * 0.25;
  }
`;

function particleFragment(additive: boolean): string {
  return /* glsl */ `
  uniform sampler2D uAtlas;
  uniform sampler2D uDepth;
  uniform float uSoft;
  uniform float uSoftDist;
  uniform float uNear;
  uniform float uFar;
  uniform vec2 uInvRes;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFogMode; // 0 none, 1 linear, 2 exp2

  varying vec2 vUv;
  varying vec4 vColor;
  varying vec4 vClip;
  varying float vViewZ;

  float linearDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }

  void main() {
    vec4 tex = texture2D(uAtlas, vUv);
    float a = vColor.a * tex.a;
    if (a < 0.004) discard;
    vec3 col = vColor.rgb * tex.rgb;

    if (uSoft > 0.5) {
      vec2 suv = (vClip.xy / max(vClip.w, 1e-4)) * 0.5 + 0.5;
      float sceneZ = linearDepth(texture2D(uDepth, suv).x);
      a *= clamp((sceneZ - vViewZ) / uSoftDist, 0.0, 1.0);
    }

    if (uFogMode > 0.5) {
      float f = uFogMode < 1.5
        ? smoothstep(uFogNear, uFogFar, vViewZ)
        : 1.0 - exp(-uFogDensity * uFogDensity * vViewZ * vViewZ);
      f = clamp(f, 0.0, 1.0);
      ${additive
        ? '// Additive light is swallowed by fog, never tinted by it.\n      col *= (1.0 - f);'
        : 'col = mix(col, uFogColor, f);'}
    }

    gl_FragColor = vec4(col, a);
  }
`;
}

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

const FLOATS = {
  iPos: 3,
  iVel: 3,
  iTime: 4,
  iSize: 4,
  iColA: 3,
  iColB: 3,
  iPhys: 4,
} as const;

interface SpawnRecord {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  spawn: number; life: number; fadePow: number; spin: number;
  size0: number; size1: number; stretch: number; sprite: number;
  r0: number; g0: number; b0: number;
  r1: number; g1: number; b1: number;
  gravity: number; drag: number; turbulence: number; seed: number;
}

/** One draw call's worth of particles: a ring buffer of instanced quads. */
class ParticlePool {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private attrs: Record<keyof typeof FLOATS, THREE.InstancedBufferAttribute>;
  private head = 0;
  private dirtyLo = Infinity;
  private dirtyHi = -Infinity;
  /** Highest slot ever written — lets us skip drawing untouched tail slots. */
  private highWater = 0;

  constructor(capacity: number, additive: boolean, atlas: THREE.Texture) {
    this.capacity = Math.max(64, capacity | 0);

    const quad = new THREE.InstancedBufferGeometry();
    // Unit quad centred on the origin; the vertex shader billboards it.
    quad.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]),
        3,
      ),
    );
    quad.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2),
    );
    quad.setIndex([0, 1, 2, 0, 2, 3]);

    const attrs = {} as Record<keyof typeof FLOATS, THREE.InstancedBufferAttribute>;
    for (const key of Object.keys(FLOATS) as Array<keyof typeof FLOATS>) {
      const items = FLOATS[key];
      const a = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * items), items);
      a.setUsage(THREE.DynamicDrawUsage);
      quad.setAttribute(key, a);
      attrs[key] = a;
    }
    this.attrs = attrs;
    // Every slot starts with life 0 so nothing draws before its first spawn.
    quad.instanceCount = 0;
    this.geo = quad;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 1 },
        uAtlas: { value: atlas },
        uDepth: { value: null },
        uSoft: { value: 0 },
        uSoftDist: { value: 0.85 },
        uNear: { value: 0.1 },
        uFar: { value: 200 },
        uInvRes: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
        uFogColor: { value: new THREE.Color(0x000000) },
        uFogDensity: { value: 0 },
        uFogNear: { value: 1 },
        uFogFar: { value: 100 },
        uFogMode: { value: 0 },
      },
      vertexShader: PARTICLE_VERT,
      fragmentShader: particleFragment(additive),
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(quad, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 12 : 10;
    this.mesh.matrixAutoUpdate = true;
  }

  get material(): THREE.ShaderMaterial {
    return this.mat;
  }

  spawn(r: SpawnRecord): void {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    if (i + 1 > this.highWater) this.highWater = i + 1;

    const a = this.attrs;
    let o = i * 3;
    a.iPos.array[o] = r.x; a.iPos.array[o + 1] = r.y; a.iPos.array[o + 2] = r.z;
    a.iVel.array[o] = r.vx; a.iVel.array[o + 1] = r.vy; a.iVel.array[o + 2] = r.vz;
    a.iColA.array[o] = r.r0; a.iColA.array[o + 1] = r.g0; a.iColA.array[o + 2] = r.b0;
    a.iColB.array[o] = r.r1; a.iColB.array[o + 1] = r.g1; a.iColB.array[o + 2] = r.b1;
    o = i * 4;
    a.iTime.array[o] = r.spawn; a.iTime.array[o + 1] = r.life;
    a.iTime.array[o + 2] = r.fadePow; a.iTime.array[o + 3] = r.spin;
    a.iSize.array[o] = r.size0; a.iSize.array[o + 1] = r.size1;
    a.iSize.array[o + 2] = r.stretch; a.iSize.array[o + 3] = r.sprite;
    a.iPhys.array[o] = r.gravity; a.iPhys.array[o + 1] = r.drag;
    a.iPhys.array[o + 2] = r.turbulence; a.iPhys.array[o + 3] = r.seed;

    if (i < this.dirtyLo) this.dirtyLo = i;
    if (i > this.dirtyHi) this.dirtyHi = i;
  }

  /** Uploads only the slots written since the last frame. */
  flush(time: number, scale: number): void {
    this.mat.uniforms.uTime!.value = time;
    this.mat.uniforms.uScale!.value = scale;
    this.geo.instanceCount = this.highWater;
    if (this.dirtyHi < this.dirtyLo) return;
    const lo = this.dirtyLo;
    const count = this.dirtyHi - lo + 1;
    for (const key of Object.keys(FLOATS) as Array<keyof typeof FLOATS>) {
      const attr = this.attrs[key];
      const items = FLOATS[key];
      attr.clearUpdateRanges();
      attr.addUpdateRange(lo * items, count * items);
      attr.needsUpdate = true;
    }
    this.dirtyLo = Infinity;
    this.dirtyHi = -Infinity;
  }

  setFog(fog: THREE.Fog | THREE.FogExp2 | null): void {
    const u = this.mat.uniforms;
    if (fog instanceof THREE.FogExp2) {
      u.uFogMode!.value = 2;
      u.uFogDensity!.value = fog.density;
      (u.uFogColor!.value as THREE.Color).copy(fog.color);
    } else if (fog instanceof THREE.Fog) {
      u.uFogMode!.value = 1;
      u.uFogNear!.value = fog.near;
      u.uFogFar!.value = fog.far;
      (u.uFogColor!.value as THREE.Color).copy(fog.color);
    } else {
      u.uFogMode!.value = 0;
    }
  }

  setDepth(tex: THREE.Texture | null, near: number, far: number): void {
    const u = this.mat.uniforms;
    u.uDepth!.value = tex;
    u.uSoft!.value = tex ? 1 : 0;
    u.uNear!.value = near;
    u.uFar!.value = far;
  }

  clear(): void {
    this.attrs.iTime.array.fill(0);
    this.attrs.iTime.needsUpdate = true;
    this.head = 0;
    this.highWater = 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Emitter definitions — the art direction lives here
// ---------------------------------------------------------------------------

interface Layer {
  blend: 'add' | 'alpha';
  sprite: number;
  count: number;
  speed: [number, number];
  /** 0 = perfectly along `dir`, 1 = full sphere. */
  spread: number;
  upBias: number;
  radius: number;
  life: [number, number];
  size: [number, number];
  /** End size as a multiplier of the rolled start size. */
  grow: number;
  colorA: number;
  colorB: number;
  /** Emissive punch — values > 1 push into bloom. */
  intensity: number;
  gravity: number;
  drag: number;
  turbulence: number;
  spin: number;
  stretch: number;
  fade: number;
  /** Stagger spawn times across this many seconds. */
  stagger: number;
  /** When false, `opts.color` does not retint this layer (keeps smoke grey). */
  tintable: boolean;
}

const LAYER_DEFAULTS: Layer = {
  blend: 'add',
  sprite: SPRITE.glow,
  count: 12,
  speed: [1, 3],
  spread: 1,
  upBias: 0,
  radius: 0.08,
  life: [0.4, 0.8],
  size: [0.14, 0.26],
  grow: 0.4,
  colorA: 0xffffff,
  colorB: 0x000000,
  intensity: 1,
  gravity: -4,
  drag: 2.2,
  turbulence: 0,
  spin: 0,
  stretch: 0,
  fade: 1.6,
  stagger: 0,
  tintable: true,
};

function L(over: Partial<Layer>): Layer {
  return { ...LAYER_DEFAULTS, ...over };
}

/**
 * The emitter library. Each entry is a stack of layers — a fire hit is a hot
 * core, plus flame licks, plus lofting embers, plus grey smoke that outlives
 * all of them. Layering is what separates "a puff of orange dots" from "an
 * explosion".
 */
const EMITTERS: Record<string, Layer[]> = {
  // --- weapon impacts ------------------------------------------------------
  'hit.physical': [
    L({ sprite: SPRITE.spark, count: 14, speed: [4, 11], spread: 0.55, life: [0.12, 0.28], size: [0.05, 0.1], grow: 0.3, colorA: 0xfff3d0, colorB: 0xff9a3c, intensity: 2.6, gravity: -14, drag: 5, stretch: 1.5, fade: 1.2 }),
    L({ sprite: SPRITE.glow, count: 1, speed: [0, 0], radius: 0, life: [0.1, 0.14], size: [0.75, 0.95], grow: 1.7, colorA: 0xffe9c0, colorB: 0xff7a30, intensity: 3.2, gravity: 0, drag: 0, fade: 2.4 }),
    L({ blend: 'alpha', sprite: SPRITE.dust, count: 6, speed: [0.6, 2.0], spread: 0.9, life: [0.35, 0.7], size: [0.16, 0.3], grow: 2.0, colorA: 0x8d8377, colorB: 0x4a443c, intensity: 1, gravity: -1.2, drag: 3.4, turbulence: 0.3, spin: 1.2, fade: 1.4, tintable: false }),
  ],
  'hit.fire': [
    L({ sprite: SPRITE.glow, count: 1, speed: [0, 0], radius: 0, life: [0.14, 0.18], size: [1.1, 1.35], grow: 1.9, colorA: 0xfff0b0, colorB: 0xff5a10, intensity: 4.5, gravity: 0, drag: 0, fade: 2.6 }),
    L({ sprite: SPRITE.flame, count: 12, speed: [1.6, 4.4], spread: 0.75, upBias: 0.45, life: [0.28, 0.55], size: [0.3, 0.6], grow: 1.5, colorA: 0xffd070, colorB: 0xc02000, intensity: 2.6, gravity: 2.2, drag: 3.2, turbulence: 0.55, spin: 1.4, fade: 1.5 }),
    L({ sprite: SPRITE.ember, count: 16, speed: [2.4, 7.5], spread: 0.85, upBias: 0.35, life: [0.5, 1.3], size: [0.05, 0.11], grow: 0.35, colorA: 0xfff2c0, colorB: 0xff3a00, intensity: 3.4, gravity: 1.1, drag: 1.5, turbulence: 0.5, stretch: 0.5, fade: 1.1 }),
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 8, speed: [0.5, 1.8], spread: 0.9, upBias: 0.8, life: [0.9, 1.8], size: [0.35, 0.6], grow: 2.6, colorA: 0x3a332e, colorB: 0x14110f, intensity: 1, gravity: 0.7, drag: 1.9, turbulence: 0.35, spin: 0.6, fade: 1.8, stagger: 0.12, tintable: false }),
  ],
  'hit.cold': [
    L({ sprite: SPRITE.glow, count: 1, speed: [0, 0], radius: 0, life: [0.16, 0.2], size: [1.0, 1.25], grow: 1.7, colorA: 0xd8f6ff, colorB: 0x3f8fff, intensity: 3.6, gravity: 0, drag: 0, fade: 2.4 }),
    L({ sprite: SPRITE.shard, count: 14, speed: [3, 8], spread: 0.7, life: [0.3, 0.7], size: [0.09, 0.2], grow: 0.5, colorA: 0xffffff, colorB: 0x4aa8ff, intensity: 2.4, gravity: -9, drag: 2.6, spin: 5, fade: 1.5 }),
    L({ sprite: SPRITE.snow, count: 10, speed: [0.6, 2.2], spread: 1, life: [0.7, 1.5], size: [0.07, 0.14], grow: 0.7, colorA: 0xe8f8ff, colorB: 0x86c8ff, intensity: 1.8, gravity: -1.4, drag: 2.4, turbulence: 0.4, spin: 2.2, fade: 1.6 }),
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 5, speed: [0.4, 1.3], spread: 1, upBias: 0.3, life: [0.7, 1.3], size: [0.3, 0.5], grow: 2.1, colorA: 0x9fd0e6, colorB: 0x5a7f92, intensity: 1, gravity: -0.4, drag: 2.6, spin: 0.5, fade: 1.9, tintable: false }),
  ],
  'hit.lightning': [
    L({ sprite: SPRITE.star, count: 1, speed: [0, 0], radius: 0, life: [0.1, 0.13], size: [1.3, 1.7], grow: 1.5, colorA: 0xffffff, colorB: 0x88ccff, intensity: 6, gravity: 0, drag: 0, fade: 3 }),
    L({ sprite: SPRITE.bolt, count: 10, speed: [5, 14], spread: 1, life: [0.08, 0.2], size: [0.12, 0.3], grow: 0.4, colorA: 0xffffff, colorB: 0x5aa8ff, intensity: 5, gravity: 0, drag: 7, spin: 8, stretch: 0.8, fade: 1.1 }),
    L({ sprite: SPRITE.spark, count: 20, speed: [6, 18], spread: 1, life: [0.14, 0.34], size: [0.04, 0.08], grow: 0.25, colorA: 0xeaf6ff, colorB: 0x2f6fff, intensity: 4, gravity: -6, drag: 5.5, stretch: 2.2, fade: 1.2 }),
  ],
  'hit.poison': [
    L({ sprite: SPRITE.glow, count: 1, speed: [0, 0], radius: 0, life: [0.18, 0.22], size: [0.9, 1.1], grow: 1.8, colorA: 0xd2ff7a, colorB: 0x2f7a12, intensity: 2.4, gravity: 0, drag: 0, fade: 2.2 }),
    L({ sprite: SPRITE.blood, count: 14, speed: [1.6, 5], spread: 0.8, upBias: 0.3, life: [0.5, 1.0], size: [0.1, 0.2], grow: 0.8, colorA: 0xbaff62, colorB: 0x2c6a10, intensity: 1.7, gravity: -7, drag: 2.2, spin: 3, fade: 1.5 }),
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 9, speed: [0.4, 1.6], spread: 1, upBias: 0.6, life: [1.0, 2.0], size: [0.3, 0.55], grow: 2.4, colorA: 0x6f9a3a, colorB: 0x24401a, intensity: 1, gravity: 0.5, drag: 2.0, turbulence: 0.45, spin: 0.5, fade: 2.0, stagger: 0.15, tintable: false }),
  ],
  'hit.arcane': [
    L({ sprite: SPRITE.glow, count: 1, speed: [0, 0], radius: 0, life: [0.16, 0.2], size: [1.0, 1.3], grow: 1.9, colorA: 0xf2d6ff, colorB: 0x8a3cff, intensity: 4, gravity: 0, drag: 0, fade: 2.4 }),
    L({ sprite: SPRITE.rune, count: 6, speed: [1, 3.4], spread: 1, life: [0.5, 0.9], size: [0.18, 0.34], grow: 1.3, colorA: 0xe6c8ff, colorB: 0x6a1fd0, intensity: 3, gravity: 0.6, drag: 3, spin: 2.5, fade: 1.8 }),
    L({ sprite: SPRITE.star, count: 14, speed: [2.5, 7], spread: 1, life: [0.35, 0.8], size: [0.07, 0.16], grow: 0.4, colorA: 0xffffff, colorB: 0x9b4dff, intensity: 3.4, gravity: -1.5, drag: 3.4, turbulence: 0.5, fade: 1.4 }),
  ],

  // --- flesh & gore --------------------------------------------------------
  blood: [
    L({ blend: 'alpha', sprite: SPRITE.blood, count: 20, speed: [2.5, 8], spread: 0.6, upBias: 0.25, life: [0.4, 0.9], size: [0.08, 0.2], grow: 0.75, colorA: 0xb51f1f, colorB: 0x4a0a0a, intensity: 1, gravity: -18, drag: 0.9, spin: 2, stretch: 0.7, fade: 1.2 }),
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 6, speed: [0.8, 2.6], spread: 0.85, life: [0.3, 0.6], size: [0.16, 0.34], grow: 1.9, colorA: 0x8e1414, colorB: 0x2e0606, intensity: 1, gravity: -3, drag: 3.2, spin: 1, fade: 1.7 }),
    L({ blend: 'alpha', sprite: SPRITE.chunk, count: 5, speed: [2, 6], spread: 0.7, upBias: 0.3, life: [0.5, 0.9], size: [0.06, 0.13], grow: 0.9, colorA: 0x7d1010, colorB: 0x3a0808, intensity: 1, gravity: -22, drag: 0.5, spin: 7, fade: 1 }),
  ],
  gib: [
    L({ blend: 'alpha', sprite: SPRITE.chunk, count: 14, speed: [3, 9], spread: 0.9, upBias: 0.4, life: [0.7, 1.3], size: [0.09, 0.2], grow: 0.9, colorA: 0x8a1616, colorB: 0x300707, intensity: 1, gravity: -24, drag: 0.4, spin: 9, fade: 0.9 }),
    L({ blend: 'alpha', sprite: SPRITE.blood, count: 22, speed: [2, 9], spread: 1, upBias: 0.2, life: [0.4, 1.0], size: [0.07, 0.17], grow: 0.7, colorA: 0xb01c1c, colorB: 0x400808, intensity: 1, gravity: -20, drag: 0.8, stretch: 0.8, fade: 1.1 }),
  ],

  // --- environment / ambience ---------------------------------------------
  embers: [
    L({ sprite: SPRITE.ember, count: 10, speed: [0.3, 1.2], spread: 0.9, upBias: 0.9, radius: 0.3, life: [1.6, 3.4], size: [0.035, 0.075], grow: 0.5, colorA: 0xffc46a, colorB: 0xd12b00, intensity: 2.8, gravity: 0.55, drag: 0.7, turbulence: 0.32, fade: 1.5, stagger: 0.6 }),
  ],
  dust: [
    L({ blend: 'alpha', sprite: SPRITE.dust, count: 12, speed: [0.4, 1.6], spread: 1, upBias: 0.25, radius: 0.4, life: [1.2, 2.6], size: [0.06, 0.16], grow: 1.5, colorA: 0x9a9184, colorB: 0x4b463f, intensity: 1, gravity: -0.35, drag: 1.6, turbulence: 0.22, spin: 0.5, fade: 1.9, stagger: 0.4, tintable: false }),
  ],
  smoke: [
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 10, speed: [0.4, 1.5], spread: 0.8, upBias: 0.85, radius: 0.22, life: [1.2, 2.6], size: [0.35, 0.7], grow: 2.8, colorA: 0x3c3733, colorB: 0x141212, intensity: 1, gravity: 0.5, drag: 1.6, turbulence: 0.4, spin: 0.5, fade: 2.0, stagger: 0.25, tintable: false }),
  ],
  sparks: [
    L({ sprite: SPRITE.spark, count: 18, speed: [4, 13], spread: 0.85, upBias: 0.2, life: [0.25, 0.7], size: [0.04, 0.09], grow: 0.3, colorA: 0xfff0c8, colorB: 0xff7a10, intensity: 3.2, gravity: -13, drag: 1.6, stretch: 1.8, fade: 1.1 }),
  ],
  steam: [
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 9, speed: [0.5, 1.8], spread: 0.7, upBias: 1, life: [0.8, 1.6], size: [0.22, 0.45], grow: 2.6, colorA: 0xdfe6ea, colorB: 0x9aa6ad, intensity: 1, gravity: 1.2, drag: 1.8, turbulence: 0.35, fade: 1.9, tintable: false }),
  ],

  // --- player feedback -----------------------------------------------------
  heal: [
    L({ sprite: SPRITE.glow, count: 18, speed: [0.7, 2.0], spread: 0.35, upBias: 1, radius: 0.42, life: [0.8, 1.5], size: [0.12, 0.24], grow: 0.35, colorA: 0xd8ffd0, colorB: 0x2fd45a, intensity: 3, gravity: 2.4, drag: 1.1, turbulence: 0.22, fade: 1.6, stagger: 0.28 }),
    L({ sprite: SPRITE.star, count: 8, speed: [0.5, 1.6], spread: 0.5, upBias: 1, radius: 0.35, life: [0.7, 1.2], size: [0.1, 0.2], grow: 0.4, colorA: 0xffffff, colorB: 0x6fffa0, intensity: 3.6, gravity: 2.0, drag: 1.2, fade: 1.8, stagger: 0.3 }),
  ],
  mana: [
    L({ sprite: SPRITE.glow, count: 16, speed: [0.6, 1.8], spread: 0.4, upBias: 1, radius: 0.4, life: [0.8, 1.4], size: [0.11, 0.22], grow: 0.4, colorA: 0xd6e6ff, colorB: 0x3060ff, intensity: 3, gravity: 2.2, drag: 1.1, turbulence: 0.2, fade: 1.6, stagger: 0.25 }),
  ],
  levelup: [
    L({ sprite: SPRITE.ring, count: 3, speed: [0, 0], radius: 0, life: [0.7, 0.95], size: [0.6, 0.8], grow: 7.5, colorA: 0xfff4c0, colorB: 0xffb020, intensity: 4.5, gravity: 0, drag: 0, fade: 2.2, stagger: 0.22 }),
    L({ sprite: SPRITE.star, count: 40, speed: [2.5, 7], spread: 0.5, upBias: 0.8, radius: 0.5, life: [0.9, 1.8], size: [0.11, 0.26], grow: 0.4, colorA: 0xfffbe0, colorB: 0xffa016, intensity: 4, gravity: -2.2, drag: 1.3, turbulence: 0.35, fade: 1.5, stagger: 0.2 }),
    L({ sprite: SPRITE.glow, count: 26, speed: [0.6, 2.4], spread: 0.25, upBias: 1, radius: 0.55, life: [1.0, 2.0], size: [0.18, 0.36], grow: 0.5, colorA: 0xffe9a0, colorB: 0xff8a10, intensity: 3.2, gravity: 3.2, drag: 0.9, turbulence: 0.3, fade: 1.7, stagger: 0.5 }),
    L({ sprite: SPRITE.rune, count: 10, speed: [0.4, 1.4], spread: 0.6, upBias: 1, radius: 0.7, life: [1.0, 1.7], size: [0.22, 0.4], grow: 0.9, colorA: 0xfff0c0, colorB: 0xffae2a, intensity: 3, gravity: 1.8, drag: 1.4, spin: 1.6, fade: 1.9, stagger: 0.4 }),
  ],
  crit: [
    L({ sprite: SPRITE.star, count: 1, speed: [0, 0], radius: 0, life: [0.16, 0.2], size: [1.6, 2.0], grow: 1.6, colorA: 0xffffff, colorB: 0xffc040, intensity: 7, gravity: 0, drag: 0, fade: 3 }),
    L({ sprite: SPRITE.ring, count: 1, speed: [0, 0], radius: 0, life: [0.24, 0.3], size: [0.5, 0.6], grow: 5.5, colorA: 0xfff0c8, colorB: 0xff7a20, intensity: 4.5, gravity: 0, drag: 0, fade: 2.2 }),
    L({ sprite: SPRITE.spark, count: 26, speed: [7, 18], spread: 0.75, life: [0.16, 0.4], size: [0.05, 0.12], grow: 0.3, colorA: 0xfff8d8, colorB: 0xff6a10, intensity: 4.2, gravity: -12, drag: 4, stretch: 2.4, fade: 1.1 }),
  ],
  block: [
    L({ sprite: SPRITE.spark, count: 12, speed: [3, 9], spread: 0.5, life: [0.14, 0.3], size: [0.05, 0.1], grow: 0.3, colorA: 0xfff6e0, colorB: 0xffb040, intensity: 3, gravity: -12, drag: 4.5, stretch: 1.6, fade: 1.2 }),
    L({ sprite: SPRITE.ring, count: 1, speed: [0, 0], radius: 0, life: [0.2, 0.24], size: [0.5, 0.6], grow: 3.2, colorA: 0xdce8ff, colorB: 0x6f8cff, intensity: 3, gravity: 0, drag: 0, fade: 2 }),
  ],
  dodge: [
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 10, speed: [0.8, 2.6], spread: 0.9, life: [0.3, 0.6], size: [0.18, 0.36], grow: 2.2, colorA: 0x8a8378, colorB: 0x3a3630, intensity: 1, gravity: -1, drag: 3.6, spin: 1.4, fade: 1.7, tintable: false }),
  ],

  // --- magic ---------------------------------------------------------------
  frost: [
    L({ sprite: SPRITE.shard, count: 22, speed: [2, 7], spread: 1, life: [0.4, 0.9], size: [0.1, 0.24], grow: 0.55, colorA: 0xffffff, colorB: 0x3f9cff, intensity: 2.8, gravity: -8, drag: 2.2, spin: 4.5, fade: 1.4 }),
    L({ sprite: SPRITE.snow, count: 16, speed: [0.5, 2.4], spread: 1, life: [0.9, 1.8], size: [0.08, 0.16], grow: 0.6, colorA: 0xeaf9ff, colorB: 0x7cc0ff, intensity: 2, gravity: -1.6, drag: 2.6, turbulence: 0.4, spin: 1.8, fade: 1.7 }),
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 8, speed: [0.5, 2.0], spread: 1, life: [0.9, 1.7], size: [0.35, 0.65], grow: 2.3, colorA: 0xaddaee, colorB: 0x5b8296, intensity: 1, gravity: -0.5, drag: 2.4, fade: 2, tintable: false }),
  ],
  shock: [
    L({ sprite: SPRITE.bolt, count: 16, speed: [4, 15], spread: 1, life: [0.1, 0.26], size: [0.14, 0.36], grow: 0.4, colorA: 0xffffff, colorB: 0x5090ff, intensity: 5.5, gravity: 0, drag: 6, spin: 9, stretch: 0.7, fade: 1.1 }),
    L({ sprite: SPRITE.spark, count: 28, speed: [6, 20], spread: 1, life: [0.12, 0.35], size: [0.04, 0.09], grow: 0.25, colorA: 0xf0f8ff, colorB: 0x2060ff, intensity: 4.5, gravity: -4, drag: 5, stretch: 2.4, fade: 1.2 }),
    L({ sprite: SPRITE.ring, count: 2, speed: [0, 0], radius: 0, life: [0.18, 0.26], size: [0.5, 0.7], grow: 6, colorA: 0xffffff, colorB: 0x4090ff, intensity: 4, gravity: 0, drag: 0, fade: 2.4, stagger: 0.06 }),
  ],
  poison: [
    L({ sprite: SPRITE.glow, count: 14, speed: [0.8, 3.0], spread: 1, upBias: 0.4, life: [0.8, 1.7], size: [0.16, 0.34], grow: 1.4, colorA: 0xc8ff70, colorB: 0x2c7a14, intensity: 2, gravity: -1.2, drag: 2.4, turbulence: 0.4, fade: 1.8 }),
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 12, speed: [0.4, 1.8], spread: 1, upBias: 0.6, life: [1.2, 2.4], size: [0.35, 0.7], grow: 2.6, colorA: 0x6da03c, colorB: 0x22401a, intensity: 1, gravity: 0.4, drag: 1.8, turbulence: 0.4, spin: 0.4, fade: 2.0, stagger: 0.3, tintable: false }),
  ],
  void: [
    L({ sprite: SPRITE.glow, count: 20, speed: [1.5, 5], spread: 1, life: [0.6, 1.4], size: [0.14, 0.3], grow: 0.35, colorA: 0xb07cff, colorB: 0x1a0038, intensity: 2.6, gravity: 0, drag: 1.8, turbulence: 0.55, fade: 1.6 }),
    L({ sprite: SPRITE.star, count: 12, speed: [2, 6], spread: 1, life: [0.4, 0.9], size: [0.08, 0.18], grow: 0.4, colorA: 0xffffff, colorB: 0x7a2fd0, intensity: 4, gravity: 0, drag: 2.6, fade: 1.4 }),
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 10, speed: [0.3, 1.6], spread: 1, life: [1.0, 2.2], size: [0.4, 0.8], grow: 2.4, colorA: 0x2a1150, colorB: 0x060010, intensity: 1, gravity: 0, drag: 1.6, turbulence: 0.5, spin: 0.7, fade: 2.1, tintable: false }),
  ],
  arcane: [
    L({ sprite: SPRITE.star, count: 18, speed: [1.5, 5], spread: 1, life: [0.5, 1.1], size: [0.08, 0.2], grow: 0.45, colorA: 0xffffff, colorB: 0x9b4dff, intensity: 3.6, gravity: -1, drag: 2.6, turbulence: 0.45, fade: 1.5 }),
    L({ sprite: SPRITE.rune, count: 7, speed: [0.8, 2.6], spread: 1, life: [0.7, 1.3], size: [0.2, 0.36], grow: 1.1, colorA: 0xe8d0ff, colorB: 0x6a1fd0, intensity: 2.8, gravity: 0.4, drag: 2.4, spin: 2, fade: 1.9 }),
  ],
  fire: [
    L({ sprite: SPRITE.flame, count: 14, speed: [1.2, 4], spread: 0.8, upBias: 0.5, life: [0.3, 0.7], size: [0.28, 0.55], grow: 1.6, colorA: 0xffd880, colorB: 0xc02400, intensity: 2.8, gravity: 2.4, drag: 3, turbulence: 0.5, spin: 1.2, fade: 1.5 }),
    L({ sprite: SPRITE.ember, count: 14, speed: [2, 6.5], spread: 0.9, upBias: 0.4, life: [0.6, 1.4], size: [0.05, 0.1], grow: 0.35, colorA: 0xfff0b8, colorB: 0xff3c00, intensity: 3.2, gravity: 1.2, drag: 1.4, turbulence: 0.45, stretch: 0.4, fade: 1.1 }),
  ],

  // --- big set pieces ------------------------------------------------------
  bossSlam: [
    L({ sprite: SPRITE.ring, count: 3, speed: [0, 0], radius: 0, life: [0.5, 0.8], size: [1.0, 1.4], grow: 12, colorA: 0xffe0a0, colorB: 0xb04010, intensity: 4, gravity: 0, drag: 0, fade: 2.2, stagger: 0.1 }),
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 26, speed: [4, 12], spread: 1, upBias: -0.15, radius: 0.5, life: [1.0, 2.2], size: [0.5, 1.1], grow: 3.0, colorA: 0x6a5f52, colorB: 0x201c18, intensity: 1, gravity: -1.2, drag: 2.6, turbulence: 0.5, spin: 0.6, fade: 1.9, tintable: false }),
    L({ blend: 'alpha', sprite: SPRITE.chunk, count: 22, speed: [5, 14], spread: 0.75, upBias: 0.6, radius: 0.4, life: [0.8, 1.6], size: [0.1, 0.3], grow: 0.9, colorA: 0x8a7f70, colorB: 0x3a352f, intensity: 1, gravity: -26, drag: 0.35, spin: 7, fade: 1, tintable: false }),
    L({ sprite: SPRITE.spark, count: 24, speed: [6, 16], spread: 0.6, upBias: 0.4, life: [0.3, 0.7], size: [0.06, 0.13], grow: 0.3, colorA: 0xfff0c0, colorB: 0xff6010, intensity: 3.4, gravity: -14, drag: 2.2, stretch: 1.8, fade: 1.2 }),
  ],
  explosion: [
    L({ sprite: SPRITE.glow, count: 1, speed: [0, 0], radius: 0, life: [0.2, 0.26], size: [2.2, 2.6], grow: 2.2, colorA: 0xfff6d0, colorB: 0xff4000, intensity: 6, gravity: 0, drag: 0, fade: 2.8 }),
    L({ sprite: SPRITE.flame, count: 22, speed: [3, 10], spread: 1, upBias: 0.3, radius: 0.3, life: [0.35, 0.8], size: [0.4, 0.9], grow: 1.8, colorA: 0xffd070, colorB: 0xa81800, intensity: 3, gravity: 2.0, drag: 3.4, turbulence: 0.6, spin: 1.6, fade: 1.5 }),
    L({ sprite: SPRITE.ember, count: 30, speed: [4, 14], spread: 1, upBias: 0.25, life: [0.7, 1.7], size: [0.05, 0.12], grow: 0.35, colorA: 0xfff0b0, colorB: 0xff3000, intensity: 3.6, gravity: -3, drag: 1.2, turbulence: 0.5, stretch: 0.6, fade: 1.1 }),
    L({ blend: 'alpha', sprite: SPRITE.smoke, count: 18, speed: [1.2, 4.5], spread: 1, upBias: 0.55, life: [1.4, 2.8], size: [0.6, 1.2], grow: 2.8, colorA: 0x413830, colorB: 0x13100e, intensity: 1, gravity: 0.5, drag: 1.8, turbulence: 0.45, spin: 0.5, fade: 2.0, stagger: 0.2, tintable: false }),
  ],
  portal: [
    L({ sprite: SPRITE.glow, count: 22, speed: [0.6, 2.2], spread: 0.5, upBias: 0.8, radius: 0.75, life: [0.9, 1.8], size: [0.14, 0.3], grow: 0.5, colorA: 0xd8b0ff, colorB: 0x4a10a0, intensity: 3.4, gravity: 1.4, drag: 1.3, turbulence: 0.4, fade: 1.7, stagger: 0.55 }),
    L({ sprite: SPRITE.rune, count: 8, speed: [0.3, 1.2], spread: 0.4, upBias: 0.9, radius: 0.9, life: [1.2, 2.2], size: [0.24, 0.44], grow: 0.8, colorA: 0xf0dcff, colorB: 0x6a20c8, intensity: 3, gravity: 0.8, drag: 1.6, spin: 1.4, fade: 2.0, stagger: 0.7 }),
    L({ sprite: SPRITE.ring, count: 2, speed: [0, 0], radius: 0, life: [1.0, 1.4], size: [0.8, 1.0], grow: 3.4, colorA: 0xe8c8ff, colorB: 0x5a18b8, intensity: 3, gravity: 0, drag: 0, fade: 2.2, stagger: 0.5 }),
  ],
  teleport: [
    L({ sprite: SPRITE.spark, count: 30, speed: [1.5, 6], spread: 0.3, upBias: 1, radius: 0.4, life: [0.3, 0.7], size: [0.05, 0.12], grow: 0.35, colorA: 0xffffff, colorB: 0x7a5cff, intensity: 4.5, gravity: 3, drag: 2.4, stretch: 1.6, fade: 1.3, stagger: 0.12 }),
    L({ sprite: SPRITE.ring, count: 1, speed: [0, 0], radius: 0, life: [0.3, 0.4], size: [0.6, 0.8], grow: 4, colorA: 0xf0e8ff, colorB: 0x6a3cff, intensity: 4, gravity: 0, drag: 0, fade: 2.4 }),
  ],
  dissolve: [
    L({ sprite: SPRITE.ember, count: 34, speed: [0.3, 1.6], spread: 0.6, upBias: 0.9, radius: 0.45, life: [0.7, 1.6], size: [0.05, 0.13], grow: 0.3, colorA: 0xffd8a0, colorB: 0x802000, intensity: 3, gravity: 1.6, drag: 1.0, turbulence: 0.45, fade: 1.5, stagger: 0.5 }),
    L({ blend: 'alpha', sprite: SPRITE.dust, count: 20, speed: [0.2, 1.2], spread: 0.8, upBias: 0.6, radius: 0.45, life: [0.9, 1.9], size: [0.1, 0.24], grow: 1.6, colorA: 0x6a625a, colorB: 0x201d1a, intensity: 1, gravity: 0.4, drag: 1.4, turbulence: 0.35, spin: 0.8, fade: 1.9, stagger: 0.5, tintable: false }),
  ],
  summon: [
    L({ sprite: SPRITE.rune, count: 10, speed: [0.2, 1.0], spread: 0.35, upBias: 1, radius: 0.8, life: [1.0, 1.8], size: [0.24, 0.42], grow: 0.7, colorA: 0xffe0a0, colorB: 0xa03cff, intensity: 3, gravity: 0.6, drag: 1.5, spin: 1.8, fade: 1.9, stagger: 0.4 }),
    L({ sprite: SPRITE.glow, count: 24, speed: [0.4, 1.8], spread: 0.4, upBias: 1, radius: 0.85, life: [0.8, 1.6], size: [0.12, 0.28], grow: 0.4, colorA: 0xe0c0ff, colorB: 0x5010a0, intensity: 3.2, gravity: 1.6, drag: 1.2, turbulence: 0.35, fade: 1.7, stagger: 0.45 }),
  ],

  // --- loot ----------------------------------------------------------------
  itemDrop: [
    L({ sprite: SPRITE.star, count: 14, speed: [1.6, 4.5], spread: 0.8, upBias: 0.5, life: [0.5, 1.1], size: [0.09, 0.2], grow: 0.4, colorA: 0xffffff, colorB: 0xffd070, intensity: 3.4, gravity: -6, drag: 2.4, fade: 1.5 }),
    L({ sprite: SPRITE.ring, count: 1, speed: [0, 0], radius: 0, life: [0.35, 0.45], size: [0.4, 0.5], grow: 4.5, colorA: 0xfff0c0, colorB: 0xffa030, intensity: 3, gravity: 0, drag: 0, fade: 2.2 }),
  ],
  pickup: [
    L({ sprite: SPRITE.star, count: 12, speed: [1.2, 3.6], spread: 0.4, upBias: 1, radius: 0.15, life: [0.35, 0.7], size: [0.07, 0.16], grow: 0.35, colorA: 0xffffff, colorB: 0xffe090, intensity: 3.6, gravity: 3.5, drag: 2.6, fade: 1.6 }),
  ],
  gold: [
    L({ sprite: SPRITE.star, count: 16, speed: [1.5, 4.5], spread: 0.7, upBias: 0.6, life: [0.4, 0.9], size: [0.06, 0.14], grow: 0.35, colorA: 0xfff4c0, colorB: 0xd89020, intensity: 3.4, gravity: -8, drag: 2, fade: 1.4 }),
  ],

  // --- misc ----------------------------------------------------------------
  footstep: [
    L({ blend: 'alpha', sprite: SPRITE.dust, count: 4, speed: [0.3, 1.1], spread: 1, upBias: 0.3, radius: 0.1, life: [0.35, 0.7], size: [0.09, 0.18], grow: 2.0, colorA: 0x8a8175, colorB: 0x3c3830, intensity: 1, gravity: -0.5, drag: 3.2, spin: 0.8, fade: 1.8, tintable: false }),
  ],
  shieldHit: [
    L({ sprite: SPRITE.ring, count: 1, speed: [0, 0], radius: 0, life: [0.25, 0.32], size: [0.7, 0.9], grow: 2.6, colorA: 0xdff0ff, colorB: 0x4090ff, intensity: 3.4, gravity: 0, drag: 0, fade: 2.2 }),
    L({ sprite: SPRITE.spark, count: 10, speed: [2, 6], spread: 0.6, life: [0.15, 0.35], size: [0.04, 0.09], grow: 0.3, colorA: 0xffffff, colorB: 0x60a0ff, intensity: 3.4, gravity: -6, drag: 4, stretch: 1.5, fade: 1.2 }),
  ],
};

// Aliases so callers can use either the element name or the `hit.x` form.
EMITTERS['hit.blood'] = EMITTERS['blood']!;
EMITTERS['hit.void'] = EMITTERS['void']!;
EMITTERS['impact'] = EMITTERS['hit.physical']!;
EMITTERS['cast.fire'] = EMITTERS['fire']!;
EMITTERS['cast.cold'] = EMITTERS['frost']!;
EMITTERS['cast.lightning'] = EMITTERS['shock']!;
EMITTERS['cast.poison'] = EMITTERS['poison']!;
EMITTERS['cast.arcane'] = EMITTERS['arcane']!;
EMITTERS['cast.physical'] = EMITTERS['sparks']!;
EMITTERS['death'] = EMITTERS['dissolve']!;
EMITTERS['ash'] = EMITTERS['dust']!;

/** Continuous biome moods. `rate` is particles per second at fxScale 1. */
interface AmbientDef {
  rate: number;
  layer: Layer;
  /** Height band above the bounds floor where particles spawn. */
  yMin: number;
  yMax: number;
  /** Spawn radius around the focus point (keeps budget near the camera). */
  spread: number;
}

const AMBIENT: Record<string, AmbientDef> = {
  dust: {
    rate: 26, yMin: 0.2, yMax: 3.2, spread: 13,
    layer: L({ blend: 'alpha', sprite: SPRITE.dust, count: 1, speed: [0.05, 0.28], spread: 1, radius: 0, life: [4.5, 9], size: [0.035, 0.08], grow: 1, colorA: 0xb9ad99, colorB: 0x6e6658, intensity: 1.5, gravity: -0.02, drag: 0.25, turbulence: 0.09, fade: 1.6, tintable: false }),
  },
  motes: {
    rate: 22, yMin: 0.3, yMax: 3.5, spread: 13,
    layer: L({ sprite: SPRITE.glow, count: 1, speed: [0.05, 0.3], spread: 1, radius: 0, life: [4, 8], size: [0.03, 0.07], grow: 1, colorA: 0xffe8bc, colorB: 0x806038, intensity: 2.2, gravity: 0.01, drag: 0.2, turbulence: 0.1, fade: 1.5 }),
  },
  embers: {
    rate: 20, yMin: 0.0, yMax: 1.4, spread: 14,
    layer: L({ sprite: SPRITE.ember, count: 1, speed: [0.1, 0.5], spread: 0.8, upBias: 1, radius: 0, life: [3.5, 7.5], size: [0.03, 0.075], grow: 0.6, colorA: 0xffb050, colorB: 0xc02000, intensity: 3, gravity: 0.16, drag: 0.35, turbulence: 0.16, fade: 1.5 }),
  },
  snow: {
    rate: 34, yMin: 3.0, yMax: 6.5, spread: 15,
    layer: L({ blend: 'alpha', sprite: SPRITE.snow, count: 1, speed: [0.05, 0.3], spread: 1, radius: 0, life: [6, 11], size: [0.045, 0.1], grow: 1, colorA: 0xf2fbff, colorB: 0xc8e4f6, intensity: 1.4, gravity: -0.14, drag: 0.35, turbulence: 0.2, spin: 0.7, fade: 1.5, tintable: false }),
  },
  spores: {
    rate: 20, yMin: 0.2, yMax: 3.0, spread: 13,
    layer: L({ sprite: SPRITE.spore, count: 1, speed: [0.05, 0.28], spread: 1, radius: 0, life: [5, 10], size: [0.05, 0.12], grow: 1.1, colorA: 0xc4f07a, colorB: 0x4e7a24, intensity: 1.9, gravity: 0.015, drag: 0.22, turbulence: 0.16, spin: 0.4, fade: 1.6 }),
  },
  ash: {
    rate: 30, yMin: 2.5, yMax: 6.0, spread: 15,
    layer: L({ blend: 'alpha', sprite: SPRITE.dust, count: 1, speed: [0.06, 0.3], spread: 1, radius: 0, life: [6, 11], size: [0.04, 0.1], grow: 1, colorA: 0x8f8880, colorB: 0x3d3934, intensity: 1, gravity: -0.1, drag: 0.3, turbulence: 0.22, spin: 0.5, fade: 1.5, tintable: false }),
  },
  void: {
    rate: 22, yMin: 0.2, yMax: 4.0, spread: 13,
    layer: L({ sprite: SPRITE.star, count: 1, speed: [0.08, 0.4], spread: 1, radius: 0, life: [4, 8.5], size: [0.035, 0.09], grow: 0.9, colorA: 0xc79cff, colorB: 0x2a0a58, intensity: 2.6, gravity: 0.02, drag: 0.2, turbulence: 0.24, fade: 1.5 }),
  },
  bubbles: {
    rate: 16, yMin: 0.0, yMax: 0.6, spread: 12,
    layer: L({ sprite: SPRITE.bubble, count: 1, speed: [0.15, 0.5], spread: 0.35, upBias: 1, radius: 0, life: [3.5, 7], size: [0.04, 0.11], grow: 1.3, colorA: 0xbfe8ff, colorB: 0x6fa8c8, intensity: 1.8, gravity: 0.1, drag: 0.28, turbulence: 0.14, fade: 1.4 }),
  },
};

// ---------------------------------------------------------------------------
// Floating combat text
// ---------------------------------------------------------------------------

const GLYPHS = '0123456789.,+-!?%*ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GLYPH_COLS = 8;
const GLYPH_CELL = 96;

interface GlyphAtlas {
  texture: THREE.Texture;
  /** Advance width per glyph, normalised to the cell size. */
  advance: Float32Array;
  index: Record<string, number>;
}

let glyphAtlas: GlyphAtlas | null = null;

function buildGlyphAtlas(): GlyphAtlas {
  if (glyphAtlas) return glyphAtlas;
  const rows = Math.ceil(GLYPHS.length / GLYPH_COLS);
  const cv = document.createElement('canvas');
  cv.width = GLYPH_COLS * GLYPH_CELL;
  cv.height = rows * GLYPH_CELL;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, cv.width, cv.height);

  const font = `900 ${Math.round(GLYPH_CELL * 0.74)}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const advance = new Float32Array(GLYPHS.length);
  const index: Record<string, number> = {};

  for (let i = 0; i < GLYPHS.length; i++) {
    const ch = GLYPHS[i]!;
    index[ch] = i;
    const cx = (i % GLYPH_COLS) * GLYPH_CELL + GLYPH_CELL / 2;
    const cy = Math.floor(i / GLYPH_COLS) * GLYPH_CELL + GLYPH_CELL / 2;
    // Outline first (RGB 0), then the fill (RGB 1). The shader tints only the
    // white core, so every number keeps a readable dark rim over any backdrop.
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = GLYPH_CELL * 0.13;
    ctx.strokeText(ch, cx, cy);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ch, cx, cy);
    advance[i] = Math.min(1, (ctx.measureText(ch).width + GLYPH_CELL * 0.1) / GLYPH_CELL);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;

  glyphAtlas = { texture: tex, advance, index };
  return glyphAtlas;
}

const TEXT_VERT = /* glsl */ `
  uniform float uTime;
  uniform vec2 uCell;      // 1/cols, 1/rows

  attribute vec3 iOrigin;
  attribute vec4 iCell;    // col, row, glyphOffsetX, glyphWidth
  attribute vec4 iAnim;    // spawn, life, scale, crit
  attribute vec4 iMotion;  // driftX, driftZ, rise, spinAmp
  attribute vec3 iColor;

  varying vec2 vUv;
  varying vec4 vColor;

  void main() {
    float age = uTime - iAnim.x;
    float life = max(iAnim.y, 1e-3);
    float alive = step(0.0, age) * step(age, life);
    float t = clamp(age / life, 0.0, 1.0);

    // Overshoot pop: crits snap harder and settle slower.
    float pop = 1.0 + (0.55 + iAnim.w * 0.75) * exp(-age * (16.0 - iAnim.w * 5.0)) * sin(age * 34.0);
    float scale = iAnim.z * pop * mix(1.0, 1.0 - 0.25 * t, 1.0);

    // Ballistic arc — up fast, then settle. Reads as "popped out of the body".
    float rise = iMotion.z * age - 2.6 * age * age;
    vec3 wpos = iOrigin;
    wpos.y += rise;
    wpos.x += iMotion.x * age;
    wpos.z += iMotion.y * age;

    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    float wob = sin(age * 9.0 + iAnim.x * 3.0) * iMotion.w * (1.0 - t);
    vec2 corner = position.xy;
    vec2 rc = vec2(
      corner.x * cos(wob) - corner.y * sin(wob),
      corner.x * sin(wob) + corner.y * cos(wob)
    );
    vec3 local = camRight * (rc.x + iCell.z) * scale * alive
               + camUp    * rc.y * scale * alive;

    vec4 mv = modelViewMatrix * vec4(wpos, 1.0);
    mv.xyz += mat3(viewMatrix) * local;
    gl_Position = projectionMatrix * mv;

    float fade = 1.0 - smoothstep(0.62, 1.0, t);
    float flashIn = smoothstep(0.0, 0.05, t);
    vColor = vec4(iColor, fade * flashIn * alive);

    vUv = (uv * vec2(iCell.w, 1.0) + vec2(iCell.x, iCell.y)) * uCell;
  }
`;

const TEXT_FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec4 vColor;

  void main() {
    vec4 tex = texture2D(uAtlas, vUv);
    float a = tex.a * vColor.a;
    if (a < 0.01) discard;
    // tex.rgb is 0 on the outline and 1 in the core: tint only the core.
    gl_FragColor = vec4(vColor.rgb * tex.r, a);
  }
`;

/** Instanced glyph quads: one draw call for every damage number on screen. */
class DamageTextPool {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private atlas: GlyphAtlas;
  private cap: number;
  private head = 0;
  private high = 0;
  private lo = Infinity;
  private hi = -Infinity;
  private a: Record<string, THREE.InstancedBufferAttribute> = {};

  constructor(capacity: number) {
    this.cap = Math.max(64, capacity | 0);
    this.atlas = buildGlyphAtlas();
    const rows = Math.ceil(GLYPHS.length / GLYPH_COLS);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]),
        3,
      ),
    );
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);

    const spec: Array<[string, number]> = [
      ['iOrigin', 3], ['iCell', 4], ['iAnim', 4], ['iMotion', 4], ['iColor', 3],
    ];
    for (const [name, items] of spec) {
      const attr = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * items), items);
      attr.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, attr);
      this.a[name] = attr;
    }
    geo.instanceCount = 0;
    this.geo = geo;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAtlas: { value: this.atlas.texture },
        uCell: { value: new THREE.Vector2(1 / GLYPH_COLS, 1 / rows) },
      },
      vertexShader: TEXT_VERT,
      fragmentShader: TEXT_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 900;
  }

  push(
    text: string,
    x: number, y: number, z: number,
    color: THREE.Color,
    scale: number,
    crit: boolean,
    life: number,
    driftX: number, driftZ: number, rise: number, wobble: number,
    now: number,
  ): void {
    const rows = Math.ceil(GLYPHS.length / GLYPH_COLS);
    void rows;
    const up = text.toUpperCase();
    // Measure first so the string can be centred on its anchor.
    let total = 0;
    for (const ch of up) {
      const gi = this.atlas.index[ch];
      total += gi === undefined ? 0.34 : this.atlas.advance[gi]!;
    }
    let cursor = -total * 0.5;

    for (const ch of up) {
      const gi = this.atlas.index[ch];
      if (gi === undefined) {
        cursor += 0.34;
        continue;
      }
      const w = this.atlas.advance[gi]!;
      const i = this.head;
      this.head = (this.head + 1) % this.cap;
      if (i + 1 > this.high) this.high = i + 1;

      const o3 = i * 3;
      const o4 = i * 4;
      const A = this.a;
      A.iOrigin!.array[o3] = x;
      A.iOrigin!.array[o3 + 1] = y;
      A.iOrigin!.array[o3 + 2] = z;
      A.iColor!.array[o3] = color.r;
      A.iColor!.array[o3 + 1] = color.g;
      A.iColor!.array[o3 + 2] = color.b;
      A.iCell!.array[o4] = gi % GLYPH_COLS;
      A.iCell!.array[o4 + 1] = Math.floor(gi / GLYPH_COLS);
      A.iCell!.array[o4 + 2] = cursor + w * 0.5;
      A.iCell!.array[o4 + 3] = w;
      A.iAnim!.array[o4] = now;
      A.iAnim!.array[o4 + 1] = life;
      A.iAnim!.array[o4 + 2] = scale;
      A.iAnim!.array[o4 + 3] = crit ? 1 : 0;
      A.iMotion!.array[o4] = driftX;
      A.iMotion!.array[o4 + 1] = driftZ;
      A.iMotion!.array[o4 + 2] = rise;
      A.iMotion!.array[o4 + 3] = wobble;

      if (i < this.lo) this.lo = i;
      if (i > this.hi) this.hi = i;
      cursor += w;
    }
  }

  flush(time: number): void {
    this.mat.uniforms.uTime!.value = time;
    this.geo.instanceCount = this.high;
    if (this.hi < this.lo) return;
    const spec: Array<[string, number]> = [
      ['iOrigin', 3], ['iCell', 4], ['iAnim', 4], ['iMotion', 4], ['iColor', 3],
    ];
    const count = this.hi - this.lo + 1;
    for (const [name, items] of spec) {
      const attr = this.a[name]!;
      attr.clearUpdateRanges();
      attr.addUpdateRange(this.lo * items, count * items);
      attr.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -Infinity;
  }

  clear(): void {
    this.a.iAnim!.array.fill(0);
    this.a.iAnim!.needsUpdate = true;
    this.head = 0;
    this.high = 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------
// FXSystem
// ---------------------------------------------------------------------------

export interface BurstOpts {
  count?: number;
  color?: number;
  scale?: number;
  dir?: THREE.Vector3;
  /** Extra speed multiplier. */
  speed?: number;
  /** Extra life multiplier. */
  life?: number;
  /** Emit into a pool parented to this object so particles inherit its motion. */
  parent?: THREE.Object3D;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _cA = new THREE.Color();
const _cB = new THREE.Color();
const _tint = new THREE.Color();

/**
 * One pooled GPU particle system per scene.
 *
 * `burst()` is the whole API surface for gameplay code. Everything is budgeted
 * off `QualityProfile.fxScale`, so a low-end machine emits a third of the
 * particles without any call site changing.
 */
export class FXSystem {
  private scene: THREE.Scene;
  private quality: QualityProfile;
  private rng: Rng;
  private atlas: THREE.Texture;

  private addPool: ParticlePool;
  private alphaPool: ParticlePool;
  private text: DamageTextPool;
  private localPools = new Map<string, { pool: ParticlePool; parent: THREE.Object3D; blend: 'add' | 'alpha'; lastUsed: number }>();

  private time = 0;
  /** Global size multiplier — lets a scene dial the whole look up or down. */
  scale = 1;

  // Ambient emission state.
  private ambientKind: string | null = null;
  private ambientBounds = new THREE.Box3();
  private ambientAccum = 0;
  private focus = new THREE.Vector3();

  // Optional soft-particle depth prepass.
  private depthRT: THREE.WebGLRenderTarget | null = null;
  private depthMat: THREE.MeshDepthMaterial | null = null;
  private glRef: THREE.WebGLRenderer | null = null;
  private camRef: THREE.Camera | null = null;
  private softWanted = false;

  constructor(scene: THREE.Scene, quality: QualityProfile) {
    this.scene = scene;
    this.quality = quality;
    this.rng = new Random(0x1f0c5a);
    this.atlas = buildSpriteAtlas();

    const fx = Math.max(0.2, quality.fxScale);
    this.addPool = new ParticlePool(Math.round(5000 * fx), true, this.atlas);
    this.alphaPool = new ParticlePool(Math.round(2600 * fx), false, this.atlas);
    this.text = new DamageTextPool(Math.round(900 * Math.max(0.5, fx)));

    scene.add(this.addPool.mesh);
    scene.add(this.alphaPool.mesh);
    scene.add(this.text.mesh);
  }

  /** Total particle slots across the two world pools — useful for debug HUDs. */
  get capacity(): number {
    return this.addPool.capacity + this.alphaPool.capacity;
  }

  /**
   * Turns on depth-faded ("soft") particles. Costs one extra half-resolution
   * depth-only pass per frame, so it is gated on the quality profile.
   */
  enableSoftParticles(gl: THREE.WebGLRenderer, camera: THREE.Camera): void {
    this.glRef = gl;
    this.camRef = camera;
    this.softWanted = this.quality.fxScale >= 0.9;
    if (!this.softWanted || this.depthRT) return;
    const w = Math.max(64, Math.floor(gl.domElement.width * 0.5));
    const h = Math.max(64, Math.floor(gl.domElement.height * 0.5));
    const rt = new THREE.WebGLRenderTarget(w, h);
    rt.depthTexture = new THREE.DepthTexture(w, h);
    rt.depthTexture.type = THREE.UnsignedShortType;
    rt.texture.minFilter = THREE.NearestFilter;
    rt.texture.magFilter = THREE.NearestFilter;
    this.depthRT = rt;
    this.depthMat = new THREE.MeshDepthMaterial();
  }

  disableSoftParticles(): void {
    this.softWanted = false;
    this.addPool.setDepth(null, 0.1, 200);
    this.alphaPool.setDepth(null, 0.1, 200);
  }

  /** Point ambient emission at the camera/player so budget is spent on screen. */
  setFocus(x: number, y: number, z: number): void {
    this.focus.set(x, y, z);
  }

  // -- emission -------------------------------------------------------------

  /**
   * Fire a named emitter. Unknown ids fall back to `hit.physical` rather than
   * throwing — a missing effect must never take a run down.
   */
  burst(id: string, x: number, y: number, z: number, opts?: BurstOpts): void {
    const layers = EMITTERS[id] ?? EMITTERS['hit.physical']!;
    const countMul = opts?.count !== undefined ? opts.count / 12 : 1;
    for (const layer of layers) this.emitLayer(layer, x, y, z, opts, countMul);
  }

  /** Emits a single ad-hoc layer. Effects.ts uses this for composite spells. */
  emitCustom(layer: Partial<Layer>, x: number, y: number, z: number, opts?: BurstOpts): void {
    this.emitLayer(L(layer), x, y, z, opts, 1);
  }

  private emitLayer(layer: Layer, x: number, y: number, z: number, opts: BurstOpts | undefined, countMul: number): void {
    const fx = this.quality.fxScale;
    let n = Math.round(layer.count * countMul * fx);
    if (layer.count > 0 && n < 1) n = this.rng.chance(layer.count * countMul * fx) ? 1 : 0;
    if (n <= 0) return;

    const pool = this.poolFor(layer.blend, opts?.parent);
    const sizeMul = opts?.scale ?? 1;
    const speedMul = opts?.speed ?? 1;
    const lifeMul = opts?.life ?? 1;

    // Colour: tintable layers accept the caller's override, blended toward the
    // authored ramp so a red fireball still fades to dark red, not to grey.
    _cA.setHex(layer.colorA);
    _cB.setHex(layer.colorB);
    if (opts?.color !== undefined && layer.tintable) {
      _tint.setHex(opts.color);
      _cA.lerp(_tint, 0.72);
      _cB.lerp(_tint, 0.35);
      _cB.multiplyScalar(0.55);
    }
    const ir = _cA.r * layer.intensity;
    const ig = _cA.g * layer.intensity;
    const ib = _cA.b * layer.intensity;
    const er = _cB.r * layer.intensity * 0.85;
    const eg = _cB.g * layer.intensity * 0.85;
    const eb = _cB.b * layer.intensity * 0.85;

    // Local pools receive positions in the parent's space.
    let ox = x;
    let oy = y;
    let oz = z;
    if (opts?.parent) {
      _v.set(x, y, z);
      opts.parent.worldToLocal(_v);
      ox = _v.x; oy = _v.y; oz = _v.z;
    }

    const dir = opts?.dir;
    const rng = this.rng;

    for (let i = 0; i < n; i++) {
      // Direction: a cone around `dir` when supplied, otherwise a sphere with
      // an optional vertical bias.
      let dx: number;
      let dy: number;
      let dz: number;
      const u = rng.range(-1, 1);
      const phi = rng.range(0, Math.PI * 2);
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      dx = s * Math.cos(phi);
      dy = u;
      dz = s * Math.sin(phi);
      if (dir) {
        const k = layer.spread;
        dx = dir.x + dx * k;
        dy = dir.y + dy * k;
        dz = dir.z + dz * k;
      }
      dy += layer.upBias;
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len; dy /= len; dz /= len;

      const sp = rng.range(layer.speed[0], layer.speed[1]) * speedMul;
      const size0 = rng.range(layer.size[0], layer.size[1]) * sizeMul;
      const rad = layer.radius * sizeMul;

      pool.spawn({
        x: ox + rng.range(-rad, rad),
        y: oy + rng.range(-rad, rad),
        z: oz + rng.range(-rad, rad),
        vx: dx * sp,
        vy: dy * sp,
        vz: dz * sp,
        spawn: this.time + (layer.stagger > 0 ? rng.range(0, layer.stagger) : 0),
        life: rng.range(layer.life[0], layer.life[1]) * lifeMul,
        fadePow: layer.fade,
        spin: layer.spin === 0 ? 0 : rng.range(-layer.spin, layer.spin),
        size0,
        size1: size0 * layer.grow,
        stretch: layer.stretch,
        sprite: layer.sprite,
        r0: ir, g0: ig, b0: ib,
        r1: er, g1: eg, b1: eb,
        gravity: layer.gravity,
        drag: layer.drag,
        turbulence: layer.turbulence,
        seed: rng.next(),
      });
    }
  }

  private poolFor(blend: 'add' | 'alpha', parent?: THREE.Object3D): ParticlePool {
    if (!parent) return blend === 'add' ? this.addPool : this.alphaPool;
    const key = `${parent.uuid}:${blend}`;
    let entry = this.localPools.get(key);
    if (!entry) {
      // Cheap cap: recycle the least recently used local pool.
      if (this.localPools.size >= 12) {
        let oldestKey: string | null = null;
        let oldest = Infinity;
        for (const [k, v] of this.localPools) {
          if (v.lastUsed < oldest) { oldest = v.lastUsed; oldestKey = k; }
        }
        if (oldestKey) {
          const dead = this.localPools.get(oldestKey)!;
          dead.parent.remove(dead.pool.mesh);
          dead.pool.dispose();
          this.localPools.delete(oldestKey);
        }
      }
      const pool = new ParticlePool(Math.round(320 * Math.max(0.3, this.quality.fxScale)), blend === 'add', this.atlas);
      parent.add(pool.mesh);
      entry = { pool, parent, blend, lastUsed: this.time };
      this.localPools.set(key, entry);
    }
    entry.lastUsed = this.time;
    return entry.pool;
  }

  // -- ambient --------------------------------------------------------------

  /**
   * Sets the continuous biome mood. Pass `null` to stop. `bounds` is used to
   * keep particles inside the playable volume; emission concentrates around
   * `setFocus()` so budget follows the camera rather than the whole level.
   */
  setAmbient(kind: string | null, bounds: THREE.Box3): void {
    this.ambientKind = kind && AMBIENT[kind] ? kind : null;
    this.ambientBounds.copy(bounds);
    if (this.ambientBounds.isEmpty()) {
      this.ambientBounds.set(new THREE.Vector3(-40, 0, -40), new THREE.Vector3(40, 8, 40));
    }
    this.focus.copy(this.ambientBounds.getCenter(_v));
    this.ambientAccum = 0;
  }

  private tickAmbient(dt: number): void {
    if (!this.ambientKind) return;
    const def = AMBIENT[this.ambientKind]!;
    this.ambientAccum += def.rate * this.quality.fxScale * dt;
    let n = Math.floor(this.ambientAccum);
    if (n <= 0) return;
    this.ambientAccum -= n;
    if (n > 40) n = 40; // never let a frame spike blow the budget

    const b = this.ambientBounds;
    const rng = this.rng;
    const layer = def.layer;
    const pool = layer.blend === 'add' ? this.addPool : this.alphaPool;

    _cA.setHex(layer.colorA).multiplyScalar(layer.intensity);
    _cB.setHex(layer.colorB).multiplyScalar(layer.intensity * 0.85);

    for (let i = 0; i < n; i++) {
      // Disc around the focus, clamped into the level bounds.
      const ang = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * def.spread;
      const x = THREE.MathUtils.clamp(this.focus.x + Math.cos(ang) * r, b.min.x, b.max.x);
      const z = THREE.MathUtils.clamp(this.focus.z + Math.sin(ang) * r, b.min.z, b.max.z);
      const y = b.min.y + rng.range(def.yMin, def.yMax);

      const u = rng.range(-1, 1);
      const phi = rng.range(0, Math.PI * 2);
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      let dx = s * Math.cos(phi);
      let dy = u + layer.upBias;
      let dz = s * Math.sin(phi);
      const len = Math.hypot(dx, dy, dz) || 1;
      dx /= len; dy /= len; dz /= len;

      const sp = rng.range(layer.speed[0], layer.speed[1]);
      const size0 = rng.range(layer.size[0], layer.size[1]);

      pool.spawn({
        x, y, z,
        vx: dx * sp, vy: dy * sp, vz: dz * sp,
        spawn: this.time,
        life: rng.range(layer.life[0], layer.life[1]),
        fadePow: layer.fade,
        spin: layer.spin === 0 ? 0 : rng.range(-layer.spin, layer.spin),
        size0,
        size1: size0 * layer.grow,
        stretch: 0,
        sprite: layer.sprite,
        r0: _cA.r, g0: _cA.g, b0: _cA.b,
        r1: _cB.r, g1: _cB.g, b1: _cB.b,
        gravity: layer.gravity,
        drag: layer.drag,
        turbulence: layer.turbulence,
        seed: rng.next(),
      });
    }
  }

  // -- combat text ----------------------------------------------------------

  /**
   * Floating combat text. Crits are larger, warmer, and arc further so a big
   * hit is legible from the number alone, without reading the digits.
   */
  damageNumber(text: string, x: number, y: number, z: number, color: number, crit: boolean): void {
    const rng = this.rng;
    _cA.setHex(color);
    if (crit) {
      // Push crits toward white-hot so they punch through bloom.
      _cA.lerp(_cB.setRGB(1, 0.92, 0.72), 0.35).multiplyScalar(1.9);
    } else {
      _cA.multiplyScalar(1.25);
    }
    const ang = rng.range(0, Math.PI * 2);
    const drift = crit ? rng.range(0.5, 1.1) : rng.range(0.25, 0.7);
    this.text.push(
      text,
      x + rng.range(-0.12, 0.12), y, z + rng.range(-0.12, 0.12),
      _cA,
      crit ? rng.range(0.52, 0.6) : rng.range(0.3, 0.36),
      crit,
      crit ? 1.35 : 1.0,
      Math.cos(ang) * drift,
      Math.sin(ang) * drift,
      crit ? 3.4 : 2.5,
      crit ? 0.16 : 0.05,
      this.time,
    );
    if (crit) {
      // A tiny sparkle behind the number tells the eye "this one mattered".
      this.burst('crit', x, y + 0.1, z, { scale: 0.55, count: 8 });
    }
  }

  /** Non-damage floating text (MISS, BLOCK, IMMUNE, +LEVEL). */
  statusText(text: string, x: number, y: number, z: number, color = 0xd8d8d8): void {
    _cA.setHex(color).multiplyScalar(1.1);
    this.text.push(text, x, y, z, _cA, 0.26, false, 1.2, 0, 0, 2.0, 0, this.time);
  }

  // -- frame ----------------------------------------------------------------

  /**
   * Advances the simulation clock and uploads any newly spawned particles.
   * Pass the active camera to enable soft particles and camera-tracked ambient
   * emission; it is optional so the contract signature still holds.
   */
  update(dt: number, elapsed: number, camera?: THREE.Camera): void {
    this.time = elapsed;
    if (camera) {
      this.camRef = camera;
      camera.getWorldPosition(_v2);
      // Look slightly ahead of the camera along its forward axis: for a
      // top-down ARPG that lands the ambient volume on the play area.
      this.focus.set(_v2.x, this.focus.y, _v2.z);
    }
    this.tickAmbient(dt);

    const fog = this.scene.fog ?? null;
    this.addPool.setFog(fog);
    this.alphaPool.setFog(fog);

    this.renderDepthPrepass();

    this.addPool.flush(elapsed, this.scale);
    this.alphaPool.flush(elapsed, this.scale);
    for (const entry of this.localPools.values()) entry.pool.flush(elapsed, this.scale);
    this.text.flush(elapsed);
  }

  private renderDepthPrepass(): void {
    const gl = this.glRef;
    const cam = this.camRef;
    if (!this.softWanted || !gl || !cam || !this.depthRT || !this.depthMat) return;
    if (!(cam instanceof THREE.PerspectiveCamera)) return;

    // Hide the particle meshes so they do not occlude themselves.
    this.addPool.mesh.visible = false;
    this.alphaPool.mesh.visible = false;
    this.text.mesh.visible = false;
    for (const e of this.localPools.values()) e.pool.mesh.visible = false;

    const prevTarget = gl.getRenderTarget();
    const prevOverride = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this.depthMat;
    gl.setRenderTarget(this.depthRT);
    gl.clear(true, true, false);
    gl.render(this.scene, cam);
    gl.setRenderTarget(prevTarget);
    this.scene.overrideMaterial = prevOverride;

    this.addPool.mesh.visible = true;
    this.alphaPool.mesh.visible = true;
    this.text.mesh.visible = true;
    for (const e of this.localPools.values()) e.pool.mesh.visible = true;

    const depth = this.depthRT.depthTexture;
    this.addPool.setDepth(depth, cam.near, cam.far);
    this.alphaPool.setDepth(depth, cam.near, cam.far);
  }

  /** Kills everything in flight — used on scene transitions. */
  clear(): void {
    this.addPool.clear();
    this.alphaPool.clear();
    this.text.clear();
    for (const e of this.localPools.values()) e.pool.clear();
  }

  dispose(): void {
    this.scene.remove(this.addPool.mesh);
    this.scene.remove(this.alphaPool.mesh);
    this.scene.remove(this.text.mesh);
    this.addPool.dispose();
    this.alphaPool.dispose();
    this.text.dispose();
    for (const e of this.localPools.values()) {
      e.parent.remove(e.pool.mesh);
      e.pool.dispose();
    }
    this.localPools.clear();
    this.depthRT?.dispose();
    this.depthMat?.dispose();
    this.depthRT = null;
    this.depthMat = null;
    this.glRef = null;
    this.camRef = null;
  }
}

/** Emitter ids available to `FXSystem.burst`. Exposed for tooling/debug UI. */
export function emitterIds(): string[] {
  return Object.keys(EMITTERS).sort();
}

/** Ambient mood ids available to `FXSystem.setAmbient`. */
export function ambientIds(): string[] {
  return Object.keys(AMBIENT).sort();
}
