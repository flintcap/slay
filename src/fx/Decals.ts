/**
 * SLAY — ground decals and ability telegraphs.
 *
 * Two instanced quad meshes, both lying in the XZ plane:
 *
 *  1. **Stains** — scorch marks, blood pools, ice patches, poison puddles,
 *     cracks. Textured from a procedurally generated atlas, tinted per
 *     instance, faded and recycled through a ring buffer with a hard cap.
 *
 *  2. **Telegraphs** — the read-the-boss layer. These are drawn with an
 *     analytic SDF in the fragment shader rather than from a texture, because
 *     a telegraph must stay razor-crisp at any radius; a 256px circle stretched
 *     over an 8m slam is exactly the mush that gets players killed unfairly.
 *     The wind-up sweep, the border, the hatching and the pre-fire flash are
 *     all functions of `age / duration`, so the CPU writes one record and never
 *     touches it again.
 *
 * Both meshes render with depth test on, depth write off, and a negative
 * polygon offset plus a small Y lift — belt and braces against z-fighting with
 * the floor.
 */

import * as THREE from 'three';
import type { QualityProfile } from '../core/Renderer';
import { Random } from '../core/RNG';
import { Noise, clamp01, smoothstep } from '../art/Noise';

// ---------------------------------------------------------------------------
// Stain atlas
// ---------------------------------------------------------------------------

export const DECAL = {
  scorch: 0,
  blood: 1,
  ice: 2,
  poison: 3,
  crack: 4,
  splatter: 5,
  ring: 6,
  glow: 7,
  ash: 8,
  ooze: 9,
  rune: 10,
  frost: 11,
  gore: 12,
  water: 13,
  burn: 14,
  dust: 15,
} as const;

const D_GRID = 4;
const D_CELL = 160;

let stainAtlas: THREE.Texture | null = null;

/** The baked stain atlas, exposed so tooling can look at what it produced. */
export function decalAtlasTexture(): THREE.Texture {
  return buildStainAtlas();
}

function buildStainAtlas(): THREE.Texture {
  if (stainAtlas) return stainAtlas;
  const size = D_GRID * D_CELL;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  const noise = new Noise(0x0dec);
  const C = D_CELL;
  const H = C / 2;

  const paint = (idx: number, fn: (u: number, v: number, r: number) => [number, number]): void => {
    const ox = (idx % D_GRID) * C;
    const oy = Math.floor(idx / D_GRID) * C;
    const img = ctx.createImageData(C, C);
    const d = img.data;
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const u = (x - H) / H;
        const v = (y - H) / H;
        const r = Math.sqrt(u * u + v * v);
        const [lum, alpha] = fn(u, v, r);
        const o = (y * C + x) * 4;
        const l = clamp01(lum) * 255;
        d[o] = l;
        d[o + 1] = l;
        d[o + 2] = l;
        d[o + 3] = clamp01(alpha) * 255;
      }
    }
    ctx.putImageData(img, ox, oy);
  };

  const blobMask = (u: number, v: number, r: number, scale: number, rough: number, seedOff: number): number => {
    const n = noise.fbm((u + seedOff) * scale, (v + seedOff) * scale, 4) * rough;
    return smoothstep(1.0, 0.55, r + n);
  };

  // 0 scorch — dark burnt core with a lighter charred rim and soot spatter.
  paint(DECAL.scorch, (u, v, r) => {
    const m = blobMask(u, v, r, 2.4, 0.38, 0);
    const soot = noise.warp(u * 3.1 + 4, v * 3.1 - 2, 1.3, 4) * 0.5 + 0.5;
    const core = smoothstep(0.85, 0.15, r);
    const lum = 0.06 + 0.34 * (1 - core) * soot;
    return [lum, m * (0.55 + 0.45 * soot)];
  });

  // 1 blood pool — an irregular puddle with a wet middle and a drying rim.
  paint(DECAL.blood, (u, v, r) => {
    // The edge radius varies with *position*, never with angle. Perturbing by
    // angle alone is constant along every ray, which draws spokes.
    const lobe = noise.fbm(u * 2.6 + 3, v * 2.6 - 7, 4);
    const chew = noise.fbm(u * 6.4 - 2, v * 6.4 + 5, 3);
    const R = 0.40 + lobe * 0.30 + chew * 0.10;
    const pool = smoothstep(R, R - 0.09, r);
    const rim = Math.exp(-Math.pow((r - R * 0.92) * 7.0, 2)) * 0.45;
    return [0.16 + rim + smoothstep(R * 0.8, 0, r) * 0.4, pool];
  });

  // 2 ice patch — cell-fractured sheet, bright at the facet borders.
  paint(DECAL.ice, (u, v, r) => {
    const m = blobMask(u, v, r, 2.1, 0.28, 8.2);
    const cells = noise.worley(u * 3.4 + 10, v * 3.4 + 10, 0.95);
    const border = 1 - smoothstep(0, 0.16, cells.f2 - cells.f1);
    const lum = 0.55 + border * 0.45;
    return [lum, m * (0.42 + border * 0.58)];
  });

  // 3 poison puddle — bubbling ooze with visible cell blobs.
  paint(DECAL.poison, (u, v, r) => {
    const m = blobMask(u, v, r, 1.7, 0.34, 15.1);
    const bub = noise.billow(u * 5.2 - 3, v * 5.2 + 6, 3);
    const rim = Math.exp(-Math.pow((r - 0.7) * 5.0, 2)) * 0.6;
    return [0.35 + bub * 0.5 + rim, m * (0.6 + bub * 0.4)];
  });

  // 4 cracks — ridged fracture network, no fill.
  paint(DECAL.crack, (u, v, r) => {
    const ridge = noise.ridged(u * 2.6 + 21, v * 2.6 - 9, 4);
    const line = smoothstep(0.62, 0.92, ridge);
    const falloff = smoothstep(1.0, 0.25, r);
    return [0.1 + line * 0.35, line * falloff];
  });

  // 5 splatter — thrown blood.
  //
  // A torn central mass with fingers coming off it and satellite droplets
  // beyond, the droplets thinning with distance. Every term is sampled in
  // (u, v): the previous version perturbed the shape by angle, and a function
  // of the angle alone is constant along each ray, so it drew a star of grey
  // spokes rather than anything resembling blood.
  paint(DECAL.splatter, (u, v, r) => {
    const lobe = noise.fbm(u * 3.4 + 11, v * 3.4 - 4, 4);
    const chew = noise.fbm(u * 8.2 - 3, v * 8.2 + 9, 3);

    // Torn mass: an irregular blob, small enough to leave room for droplets.
    const R = 0.20 + lobe * 0.26 + chew * 0.08;
    const core = smoothstep(R, R - 0.07, r);

    // Fingers: ridged noise, kept just outside the mass, so the edge tears.
    const ridge = noise.ridged(u * 4.4 - 6, v * 4.4 + 2, 3);
    const finger = smoothstep(0.66, 0.95, ridge) * smoothstep(R + 0.34, R - 0.04, r);

    // Satellites: worley cells become droplets, smaller and rarer further out.
    const w = noise.worley(u * 7.2 + 30, v * 7.2 + 30, 1.0);
    const size = (0.10 + (w.id / 255) * 0.2) * (1 - r * 0.55);
    const drop = 1 - smoothstep(size * 0.55, size, w.f1);
    const sparse = smoothstep(1.05, 0.22, r) * (0.25 + chew * 1.1);

    const m = clamp01(Math.max(core, Math.max(finger * 0.9, drop * sparse)));
    // Wet in the middle, thinner where it is only droplets.
    return [0.16 + smoothstep(R, 0, r) * 0.45, m];
  });

  // 6 ring — a soft annulus used for shockwaves and area markers.
  paint(DECAL.ring, (_u, _v, r) => {
    const band = Math.exp(-Math.pow((r - 0.78) * 7.5, 2));
    return [1, band];
  });

  // 7 glow — plain radial falloff, for light pools under drops and braziers.
  paint(DECAL.glow, (_u, _v, r) => [1, Math.pow(clamp01(1 - r), 2.6)]);

  // 8 ash — fine grey dust with a soft irregular edge.
  paint(DECAL.ash, (u, v, r) => {
    const m = blobMask(u, v, r, 2.8, 0.42, 44.0);
    const g = noise.fbm(u * 8, v * 8, 3) * 0.5 + 0.5;
    return [0.45 + g * 0.3, m * (0.3 + g * 0.4)];
  });

  // 9 ooze — thick, glossy, with elongated runs.
  paint(DECAL.ooze, (u, v, r) => {
    const stretch = Math.sqrt(u * u + (v * 0.62) * (v * 0.62));
    const m = blobMask(u, v * 0.62, stretch, 1.6, 0.3, 51.0);
    const gloss = Math.exp(-Math.pow((r - 0.35) * 3.2, 2)) * 0.6;
    return [0.3 + gloss, m];
  });

  // 10 rune circle — concentric bands with radial ticks.
  paint(DECAL.rune, (u, v, r) => {
    const ang = Math.atan2(v, u);
    const ticks = Math.abs(Math.sin(ang * 12)) > 0.86 ? 1 : 0;
    const b1 = Math.exp(-Math.pow((r - 0.92) * 26, 2));
    const b2 = Math.exp(-Math.pow((r - 0.8) * 40, 2));
    const b3 = Math.exp(-Math.pow((r - 0.5) * 22, 2)) * ticks;
    const a = clamp01(b1 + b2 * 0.7 + b3 * 0.8);
    return [1, a];
  });

  // 11 frost — radiating needles from the centre.
  paint(DECAL.frost, (u, v, r) => {
    const ang = Math.atan2(v, u);
    const spokes = Math.pow(Math.abs(Math.cos(ang * 9 + noise.simplex2(u * 2, v * 2) * 2)), 8);
    const a = spokes * smoothstep(1.0, 0.1, r) + smoothstep(0.4, 0.0, r) * 0.6;
    return [0.75 + spokes * 0.25, clamp01(a)];
  });

  // 12 gore — the pool left where something died.
  //
  // Broadly round, with a lobed edge where the liquid found low ground, thin
  // runs escaping it, and chunks scattered around. Same rule as splatter: the
  // edge is perturbed in (u, v), never by angle.
  paint(DECAL.gore, (u, v, r) => {
    const lobe = noise.fbm(u * 2.2 + 41, v * 2.2 - 13, 4);
    const chew = noise.fbm(u * 5.8 - 7, v * 5.8 + 22, 3);
    const R = 0.40 + lobe * 0.26 + chew * 0.07;
    const pool = smoothstep(R, R - 0.06, r);

    // Runs: thin trails leaving the pool, fading out quickly.
    const ridge = noise.ridged(u * 3.2 + 3, v * 3.2 - 9, 3);
    const run = smoothstep(0.74, 0.96, ridge) * smoothstep(R + 0.3, R - 0.03, r);

    // Chunks around the margin.
    const w = noise.worley(u * 6.6 + 3, v * 6.6 - 8, 1.0);
    const chunk = (1 - smoothstep(0.07, 0.16, w.f1)) * smoothstep(1.0, 0.3, r) * 0.8;

    const m = clamp01(Math.max(pool, Math.max(run * 0.85, chunk)));
    // Near-black and wet in the middle, browner and thinner at the margin.
    return [0.1 + smoothstep(R, 0, r) * 0.5 + chunk * 0.2, m];
  });

  // 13 water — thin sheen with concentric ripples.
  paint(DECAL.water, (u, v, r) => {
    const m = blobMask(u, v, r, 2.2, 0.3, 91.0);
    const rip = 0.5 + 0.5 * Math.sin(r * 26 - 1.2);
    return [0.6 + rip * 0.4, m * (0.25 + rip * 0.3)];
  });

  // 14 burn — glowing embers inside a scorch, for lingering fire ground.
  paint(DECAL.burn, (u, v, r) => {
    const m = blobMask(u, v, r, 2.4, 0.36, 61.0);
    const cracks = smoothstep(0.6, 0.95, noise.ridged(u * 4 + 5, v * 4 + 5, 3));
    return [0.15 + cracks * 0.85, m * (0.5 + cracks * 0.5)];
  });

  // 15 dust — very soft, very cheap smudge.
  paint(DECAL.dust, (u, v, r) => {
    const m = blobMask(u, v, r, 3.2, 0.45, 101.0);
    return [0.6, m * 0.5];
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  stainAtlas = tex;
  return tex;
}

/** Default look per stain kind: atlas cell, tint, default life, blend. */
interface StainStyle {
  cell: number;
  color: number;
  life: number;
  /** Additive stains (fire ground, magic circles) glow instead of darkening. */
  additive: boolean;
  /** Multiplier on the requested radius. */
  sizeMul: number;
}

const STAINS: Record<string, StainStyle> = {
  scorch: { cell: DECAL.scorch, color: 0x2a2320, life: 26, additive: false, sizeMul: 1 },
  burn: { cell: DECAL.burn, color: 0xff5a10, life: 5, additive: true, sizeMul: 1 },
  blood: { cell: DECAL.blood, color: 0x6e0f0f, life: 40, additive: false, sizeMul: 1 },
  bloodSplatter: { cell: DECAL.splatter, color: 0x7a1212, life: 32, additive: false, sizeMul: 1.15 },
  gore: { cell: DECAL.gore, color: 0x5e0d0d, life: 40, additive: false, sizeMul: 1.1 },
  ice: { cell: DECAL.ice, color: 0x9fd8ff, life: 14, additive: false, sizeMul: 1 },
  frost: { cell: DECAL.frost, color: 0xbfe8ff, life: 10, additive: true, sizeMul: 1 },
  poison: { cell: DECAL.poison, color: 0x63b028, life: 16, additive: false, sizeMul: 1 },
  ooze: { cell: DECAL.ooze, color: 0x4a7a20, life: 22, additive: false, sizeMul: 1 },
  crack: { cell: DECAL.crack, color: 0x1c1917, life: 45, additive: false, sizeMul: 1.2 },
  ash: { cell: DECAL.ash, color: 0x4a453f, life: 30, additive: false, sizeMul: 1.1 },
  water: { cell: DECAL.water, color: 0x6aa8c8, life: 18, additive: false, sizeMul: 1 },
  dust: { cell: DECAL.dust, color: 0x6b6459, life: 8, additive: false, sizeMul: 1.2 },
  glow: { cell: DECAL.glow, color: 0xffc060, life: 4, additive: true, sizeMul: 1 },
  shadow: { cell: DECAL.glow, color: 0x000000, life: 1e6, additive: false, sizeMul: 1 },
  ring: { cell: DECAL.ring, color: 0xffd090, life: 0.6, additive: true, sizeMul: 1 },
  rune: { cell: DECAL.rune, color: 0xb070ff, life: 6, additive: true, sizeMul: 1 },
  arcane: { cell: DECAL.rune, color: 0x8a3cff, life: 8, additive: true, sizeMul: 1 },
  lightning: { cell: DECAL.crack, color: 0x60a0ff, life: 3, additive: true, sizeMul: 1.1 },
  shockwave: { cell: DECAL.ring, color: 0xffe0a0, life: 0.5, additive: true, sizeMul: 1 },
};

// ---------------------------------------------------------------------------
// Stain mesh
// ---------------------------------------------------------------------------

const STAIN_VERT = /* glsl */ `
  uniform float uTime;
  attribute vec4 iXform;   // x, z, radius, rotation
  attribute vec4 iAnim;    // spawn, life, cell, fadeIn
  attribute vec3 iColor;

  varying vec2 vUv;
  varying vec4 vColor;

  void main() {
    float age = uTime - iAnim.x;
    float life = max(iAnim.y, 1e-3);
    float alive = step(0.0, age) * step(age, life);
    float t = clamp(age / life, 0.0, 1.0);

    // Stains bloom outward over their first instants, then hold, then fade.
    float grow = mix(0.55, 1.0, smoothstep(0.0, max(iAnim.w, 1e-3), age));
    float radius = iXform.z * grow * alive;

    float c = cos(iXform.w);
    float s = sin(iXform.w);
    vec2 local = position.xz;
    vec2 rot = vec2(local.x * c - local.y * s, local.x * s + local.y * c);

    vec3 wpos = vec3(iXform.x + rot.x * radius * 2.0, position.y, iXform.y + rot.y * radius * 2.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(wpos, 1.0);

    float fadeIn = smoothstep(0.0, max(iAnim.w, 1e-3), age);
    float fadeOut = 1.0 - smoothstep(0.72, 1.0, t);
    vColor = vec4(iColor, fadeIn * fadeOut * alive);

    float cell = iAnim.z;
    vec2 cellUv = vec2(mod(cell, 4.0), floor(cell * 0.25));
    vUv = (uv + cellUv) * 0.25;
  }
`;

const STAIN_FRAG = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec4 vColor;

  void main() {
    vec4 tex = texture2D(uAtlas, vUv);
    float a = tex.a * vColor.a * uOpacity;
    if (a < 0.006) discard;
    gl_FragColor = vec4(vColor.rgb * tex.rgb, a);
  }
`;

interface StainAttrs {
  iXform: THREE.InstancedBufferAttribute;
  iAnim: THREE.InstancedBufferAttribute;
  iColor: THREE.InstancedBufferAttribute;
}

class StainLayer {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private mat: THREE.ShaderMaterial;
  private attrs: StainAttrs;
  private cap: number;
  private head = 0;
  private high = 0;
  private lo = Infinity;
  private hi = -Infinity;

  constructor(capacity: number, additive: boolean, atlas: THREE.Texture, y: number) {
    this.cap = Math.max(16, capacity | 0);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([-0.5, y, -0.5, 0.5, y, -0.5, 0.5, y, 0.5, -0.5, y, 0.5]),
        3,
      ),
    );
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);

    const mk = (items: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * items), items);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.attrs = { iXform: mk(4), iAnim: mk(4), iColor: mk(3) };
    geo.setAttribute('iXform', this.attrs.iXform);
    geo.setAttribute('iAnim', this.attrs.iAnim);
    geo.setAttribute('iColor', this.attrs.iColor);
    geo.instanceCount = 0;
    this.geo = geo;

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uAtlas: { value: atlas },
        uOpacity: { value: additive ? 1.0 : 0.92 },
      },
      vertexShader: STAIN_VERT,
      fragmentShader: STAIN_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 4;
  }

  add(x: number, z: number, radius: number, rotation: number, cell: number, color: THREE.Color, spawn: number, life: number, fadeIn: number): void {
    const i = this.head;
    this.head = (this.head + 1) % this.cap;
    if (i + 1 > this.high) this.high = i + 1;
    const o4 = i * 4;
    const o3 = i * 3;
    const A = this.attrs;
    A.iXform.array[o4] = x;
    A.iXform.array[o4 + 1] = z;
    A.iXform.array[o4 + 2] = radius;
    A.iXform.array[o4 + 3] = rotation;
    A.iAnim.array[o4] = spawn;
    A.iAnim.array[o4 + 1] = life;
    A.iAnim.array[o4 + 2] = cell;
    A.iAnim.array[o4 + 3] = fadeIn;
    A.iColor.array[o3] = color.r;
    A.iColor.array[o3 + 1] = color.g;
    A.iColor.array[o3 + 2] = color.b;
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  flush(time: number): void {
    this.mat.uniforms.uTime!.value = time;
    this.geo.instanceCount = this.high;
    if (this.hi < this.lo) return;
    const count = this.hi - this.lo + 1;
    const spec: Array<[THREE.InstancedBufferAttribute, number]> = [
      [this.attrs.iXform, 4], [this.attrs.iAnim, 4], [this.attrs.iColor, 3],
    ];
    for (const [attr, items] of spec) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(this.lo * items, count * items);
      attr.needsUpdate = true;
    }
    this.lo = Infinity;
    this.hi = -Infinity;
  }

  clear(): void {
    this.attrs.iAnim.array.fill(0);
    this.attrs.iAnim.needsUpdate = true;
    this.head = 0;
    this.high = 0;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

// ---------------------------------------------------------------------------
// Telegraphs
// ---------------------------------------------------------------------------

const TELEGRAPH_VERT = /* glsl */ `
  attribute vec4 iXform;  // x, z, size, rotation
  attribute vec4 iAnim;   // spawn, duration, shape, param
  attribute vec3 iColor;

  uniform float uTime;

  varying vec2 vLocal;
  varying vec3 vColor;
  varying float vAge;
  varying float vDur;
  varying float vShape;
  varying float vParam;

  void main() {
    float age = uTime - iAnim.x;
    // A short post-fire flash keeps the marker on screen for one beat after it
    // resolves, which is what makes a dodge feel earned rather than lucky.
    float total = iAnim.y + 0.18;
    float alive = step(0.0, age) * step(age, total) * step(0.001, iAnim.y);

    float c = cos(iXform.w);
    float s = sin(iXform.w);
    vec2 local = position.xz * 2.0;              // -1 .. 1
    vec2 scaled = local * iXform.z * alive;
    vec2 rot = vec2(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);

    vec3 wpos = vec3(iXform.x + rot.x, position.y, iXform.y + rot.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(wpos, 1.0);

    vLocal = local;
    vColor = iColor;
    vAge = age;
    vDur = max(iAnim.y, 1e-3);
    vShape = iAnim.z;
    vParam = iAnim.w;
  }
`;

const TELEGRAPH_FRAG = /* glsl */ `
  precision highp float;

  varying vec2 vLocal;
  varying vec3 vColor;
  varying float vAge;
  varying float vDur;
  varying float vShape;
  varying float vParam;

  uniform float uPixel;   // approximate edge softness in local units

  // Signed distance to the shape boundary, negative inside.
  float shapeSdf(vec2 p, float shape, float param) {
    if (shape < 0.5) {
      // circle
      return length(p) - 1.0;
    } else if (shape < 1.5) {
      // cone: wedge opening along +Y with half-angle 'param'
      float r = length(p);
      float a = abs(atan(p.x, p.y));
      float ang = a - param;
      // Approximate the angular distance in linear units.
      return max(r - 1.0, ang * max(r, 0.08));
    } else if (shape < 2.5) {
      // line: a rectangle from the origin along +Y, half-width 'param'
      vec2 d = vec2(abs(p.x) - param, abs(p.y - 0.5) - 0.5);
      return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
    }
    // ring: annulus of thickness 'param' at radius 1
    return abs(length(p) - (1.0 - param)) - param;
  }

  // 0..1 sweep coordinate — what "filling up" means for each shape.
  float sweepCoord(vec2 p, float shape) {
    if (shape < 0.5) return length(p);
    if (shape < 1.5) return length(p);
    if (shape < 2.5) return clamp(p.y, 0.0, 1.0);
    return length(p);
  }

  void main() {
    float t = clamp(vAge / vDur, 0.0, 1.0);
    float post = clamp((vAge - vDur) / 0.18, 0.0, 1.0);

    float d = shapeSdf(vLocal, vShape, vParam);
    float inside = 1.0 - smoothstep(-uPixel, uPixel, d);
    if (inside < 0.002 && d > uPixel * 6.0) discard;

    // --- border: a crisp bright outline that never blurs out --------------
    float border = exp(-pow(d / (uPixel * 2.2), 2.0));

    // --- fill sweep --------------------------------------------------------
    float sc = sweepCoord(vLocal, vShape);
    float filled = 1.0 - smoothstep(t - 0.03, t + 0.03, sc);
    // Leading edge of the sweep glows.
    float sweepEdge = exp(-pow((sc - t) / 0.05, 2.0));

    // --- hatching: diagonal bars so the fill reads as "danger", not "floor"
    float hatch = 0.5 + 0.5 * sin((vLocal.x + vLocal.y) * 42.0 - vAge * 6.0);
    hatch = smoothstep(0.45, 0.9, hatch);

    // --- pre-fire flash ----------------------------------------------------
    float imminent = smoothstep(0.72, 1.0, t);
    float strobe = 0.5 + 0.5 * sin(vAge * mix(14.0, 46.0, imminent));
    float flash = imminent * strobe;

    float bodyA = inside * (0.16 + filled * (0.30 + hatch * 0.20) + flash * 0.28);
    float edgeA = border * (0.75 + 0.25 * strobe);
    float a = clamp(bodyA + edgeA + sweepEdge * inside * 0.5, 0.0, 1.0);

    vec3 col = vColor * (0.85 + filled * 0.5 + flash * 1.4 + sweepEdge * 1.2) + border * vColor * 1.6;

    // Detonation: blow the whole shape out white for a frame or two.
    col += vColor * post * (1.0 - post) * 9.0;
    a = mix(a, mix(a, 1.0, 0.7) * (1.0 - post), step(0.001, post));

    // Fade the very start in so it never pops.
    a *= smoothstep(0.0, 0.06, t);

    gl_FragColor = vec4(col, a);
  }
`;

const SHAPE_ID: Record<string, number> = { circle: 0, cone: 1, line: 2, ring: 3 };

interface TelegraphAttrs {
  iXform: THREE.InstancedBufferAttribute;
  iAnim: THREE.InstancedBufferAttribute;
  iColor: THREE.InstancedBufferAttribute;
}

/** Handle returned by `telegraph()`. */
export interface TelegraphHandle {
  cancel(): void;
}

// ---------------------------------------------------------------------------
// DecalSystem
// ---------------------------------------------------------------------------

const _col = new THREE.Color();

/**
 * Screen-space and world decals: scorch marks, blood pools, telegraphs.
 *
 * Live counts are hard-capped and recycled oldest-first, so a ten-minute fight
 * in one room costs exactly as much as the first ten seconds.
 */
export class DecalSystem {
  private scene: THREE.Scene;
  private quality: QualityProfile;
  private rng = new Random(0xdeca1);
  private time = 0;

  private opaque: StainLayer;
  private additive: StainLayer;

  private tgGeo: THREE.InstancedBufferGeometry;
  private tgMat: THREE.ShaderMaterial;
  private tgMesh: THREE.Mesh;
  private tgAttrs: TelegraphAttrs;
  private tgCap: number;
  private tgHead = 0;
  private tgHigh = 0;
  private tgLo = Infinity;
  private tgHi = -Infinity;
  /** Generation stamp per slot so a stale handle cannot cancel a new marker. */
  private tgGen: Int32Array;

  constructor(scene: THREE.Scene, quality: QualityProfile) {
    this.scene = scene;
    this.quality = quality;
    const atlas = buildStainAtlas();
    const fx = Math.max(0.25, quality.fxScale);

    this.opaque = new StainLayer(Math.round(320 * fx), false, atlas, 0.018);
    this.additive = new StainLayer(Math.round(120 * fx), true, atlas, 0.024);
    scene.add(this.opaque.mesh);
    scene.add(this.additive.mesh);

    // --- telegraphs --------------------------------------------------------
    this.tgCap = Math.max(24, Math.round(72 * fx));
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([-0.5, 0.03, -0.5, 0.5, 0.03, -0.5, 0.5, 0.03, 0.5, -0.5, 0.03, 0.5]),
        3,
      ),
    );
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]), 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);

    const mk = (items: number): THREE.InstancedBufferAttribute => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(this.tgCap * items), items);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.tgAttrs = { iXform: mk(4), iAnim: mk(4), iColor: mk(3) };
    geo.setAttribute('iXform', this.tgAttrs.iXform);
    geo.setAttribute('iAnim', this.tgAttrs.iAnim);
    geo.setAttribute('iColor', this.tgAttrs.iColor);
    geo.instanceCount = 0;
    this.tgGeo = geo;
    this.tgGen = new Int32Array(this.tgCap);

    this.tgMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPixel: { value: 0.012 },
      },
      vertexShader: TELEGRAPH_VERT,
      fragmentShader: TELEGRAPH_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
      side: THREE.DoubleSide,
    });
    this.tgMesh = new THREE.Mesh(geo, this.tgMat);
    this.tgMesh.frustumCulled = false;
    this.tgMesh.renderOrder = 8;
    scene.add(this.tgMesh);
  }

  /**
   * Drops a ground stain. Unknown kinds degrade to a neutral scorch instead of
   * throwing. `life` overrides the style default (seconds).
   */
  add(kind: string, x: number, z: number, radius: number, rotation?: number, life?: number): void {
    const style = STAINS[kind] ?? STAINS.scorch!;
    const layer = style.additive ? this.additive : this.opaque;
    _col.setHex(style.color);
    if (style.additive) _col.multiplyScalar(2.2);
    // Small per-instance value jitter stops repeated stains from tiling
    // visually into an obvious grid of identical blobs.
    const jitter = this.rng.range(0.86, 1.14);
    _col.multiplyScalar(jitter);
    const rot = rotation ?? this.rng.range(0, Math.PI * 2);
    layer.add(
      x, z,
      Math.max(0.05, radius * style.sizeMul * this.rng.range(0.9, 1.12)),
      rot,
      style.cell,
      _col,
      this.time,
      life ?? style.life,
      style.additive ? 0.05 : 0.18,
    );
  }

  /** Convenience: a cluster of splatter decals for a kill or a heavy hit. */
  splatter(kind: string, x: number, z: number, radius: number, count = 4): void {
    const n = Math.max(1, Math.round(count * Math.max(0.4, this.quality.fxScale)));
    // Every piece gets its own rotation. Stamping the same texture unrotated at
    // several positions produces a visibly repeated motif, which is most of what
    // made blood read as "the circle decal, again".
    this.add(kind, x, z, radius, this.rng.range(0, Math.PI * 2), undefined);
    // Throws land along one direction rather than evenly all round.
    const throwDir = this.rng.range(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = throwDir + this.rng.range(-1.1, 1.1);
      const d = this.rng.range(0.25, 1.6) * radius;
      this.add(
        kind,
        x + Math.cos(a) * d,
        z + Math.sin(a) * d,
        radius * this.rng.range(0.2, 0.55),
        this.rng.range(0, Math.PI * 2),
      );
    }
  }

  /**
   * Ground telegraph for boss/enemy abilities. Fills over `duration` seconds
   * and strobes as it approaches detonation.
   *
   * `size` is the radius for circle/ring/cone and the length for line.
   * For `cone`, extra half-angle defaults to 45 degrees; for `line`, the
   * default half-width is 12% of the length.
   */
  telegraph(
    kind: 'circle' | 'cone' | 'line' | 'ring',
    x: number,
    z: number,
    size: number,
    rotation: number,
    duration: number,
    color?: number,
  ): TelegraphHandle {
    const slot = this.tgHead;
    this.tgHead = (this.tgHead + 1) % this.tgCap;
    if (slot + 1 > this.tgHigh) this.tgHigh = slot + 1;
    const gen = (this.tgGen[slot] = (this.tgGen[slot]! + 1) | 0);

    const param =
      kind === 'cone' ? Math.PI * 0.25 :
      kind === 'line' ? 0.12 :
      kind === 'ring' ? 0.14 : 0;

    const o4 = slot * 4;
    const o3 = slot * 3;
    const A = this.tgAttrs;
    A.iXform.array[o4] = x;
    A.iXform.array[o4 + 1] = z;
    A.iXform.array[o4 + 2] = Math.max(0.1, size);
    A.iXform.array[o4 + 3] = rotation;
    A.iAnim.array[o4] = this.time;
    A.iAnim.array[o4 + 1] = Math.max(0.05, duration);
    A.iAnim.array[o4 + 2] = SHAPE_ID[kind] ?? 0;
    A.iAnim.array[o4 + 3] = param;
    // Telegraph colours are pushed well above 1 so the outline catches bloom
    // and stays legible over a bright lava floor.
    _col.setHex(color ?? 0xff3020).multiplyScalar(1.6);
    A.iColor.array[o3] = _col.r;
    A.iColor.array[o3 + 1] = _col.g;
    A.iColor.array[o3 + 2] = _col.b;
    this.tgDirty(slot);

    const self = this;
    let cancelled = false;
    return {
      cancel(): void {
        if (cancelled) return;
        cancelled = true;
        if (self.tgGen[slot] !== gen) return; // slot already recycled
        self.tgAttrs.iAnim.array[slot * 4 + 1] = 0;
        self.tgDirty(slot);
      },
    };
  }

  /**
   * Telegraph with explicit shape parameters — cone half-angle in radians, or
   * line half-width as a fraction of length.
   */
  telegraphEx(
    kind: 'circle' | 'cone' | 'line' | 'ring',
    x: number,
    z: number,
    size: number,
    rotation: number,
    duration: number,
    color: number,
    param: number,
  ): TelegraphHandle {
    const h = this.telegraph(kind, x, z, size, rotation, duration, color);
    const slot = (this.tgHead - 1 + this.tgCap) % this.tgCap;
    this.tgAttrs.iAnim.array[slot * 4 + 3] = param;
    this.tgDirty(slot);
    return h;
  }

  private tgDirty(slot: number): void {
    if (slot < this.tgLo) this.tgLo = slot;
    if (slot > this.tgHi) this.tgHi = slot;
  }

  update(dt: number): void {
    this.time += dt;
    this.opaque.flush(this.time);
    this.additive.flush(this.time);

    this.tgMat.uniforms.uTime!.value = this.time;
    this.tgGeo.instanceCount = this.tgHigh;
    if (this.tgHi >= this.tgLo) {
      const count = this.tgHi - this.tgLo + 1;
      const spec: Array<[THREE.InstancedBufferAttribute, number]> = [
        [this.tgAttrs.iXform, 4], [this.tgAttrs.iAnim, 4], [this.tgAttrs.iColor, 3],
      ];
      for (const [attr, items] of spec) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(this.tgLo * items, count * items);
        attr.needsUpdate = true;
      }
      this.tgLo = Infinity;
      this.tgHi = -Infinity;
    }
  }

  /** Wipes every live decal and telegraph. */
  clear(): void {
    this.opaque.clear();
    this.additive.clear();
    this.tgAttrs.iAnim.array.fill(0);
    this.tgAttrs.iAnim.needsUpdate = true;
    this.tgHead = 0;
    this.tgHigh = 0;
  }

  dispose(): void {
    this.scene.remove(this.opaque.mesh);
    this.scene.remove(this.additive.mesh);
    this.scene.remove(this.tgMesh);
    this.opaque.dispose();
    this.additive.dispose();
    this.tgGeo.dispose();
    this.tgMat.dispose();
  }
}

/** Stain kinds accepted by `DecalSystem.add`. */
export function decalKinds(): string[] {
  return Object.keys(STAINS).sort();
}
