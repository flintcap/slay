import * as THREE from 'three';
import type { Rng } from '../types';
import { Random } from '../core/RNG';
import { lathe, dome, blade, transformed, mergeGeometries, beveledBox, displace } from '../art/Meshes';

/**
 * Set dressing shared by the front-end scenes (title, character select,
 * death). Each piece is built per scene and owns its material, so the scene's
 * `disposeObject` pass frees it on exit; the textures it makes are tracked on
 * the returned handle and must be freed by the scene's `dispose`.
 *
 * Nothing here is gameplay art. It is lighting and atmosphere: the things that
 * make a menu read as a place rather than a backdrop.
 */

// ---------------------------------------------------------------------------
// The rift: an animated portal filling an arch opening
// ---------------------------------------------------------------------------

const RIFT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A vortex of fbm noise twisted around a point low in the opening, masked to
// the arch's own outline (a rectangle under a semicircle) with a burning rim.
// The centre is kept dark on purpose: a bright portal reads as "magic door",
// a dark one with a burning edge reads as "down".
const RIFT_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uHot;
  uniform vec2 uSize;
  uniform float uSpring;
  uniform float uPulse;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 p = vec2((vUv.x - 0.5) * uSize.x, vUv.y * uSize.y);
    float halfW = uSize.x * 0.5;
    float d = p.y < uSpring ? abs(p.x) - halfW : length(vec2(p.x, p.y - uSpring)) - halfW;
    float mask = smoothstep(0.02, -0.3, d);
    if (mask <= 0.001) discard;

    vec2 c = vec2(0.0, uSpring * 0.72);
    vec2 q = p - c;
    float r = length(q);
    float a = atan(q.y, q.x);
    float sw = a + 2.2 / (r + 0.6) - uTime * 0.42;
    vec2 sp = vec2(cos(sw), sin(sw)) * r;
    float n = fbm(sp * 0.85 + vec2(0.0, -uTime * 0.3));
    float n2 = fbm(sp * 2.3 - vec2(uTime * 0.2, 0.0));

    float ring = smoothstep(0.25, 2.2, r);
    float bright = (n * 1.15 + n2 * 0.45) * (0.18 + ring * 0.95);
    // Filaments: thin hot streaks where two noise fields cross.
    float fil = pow(1.0 - abs(n - n2), 14.0) * ring;
    float rim = smoothstep(-0.8, 0.0, d) * mask;

    vec3 col = mix(uDeep, uHot, clamp(n * 1.3 - 0.15, 0.0, 1.0)) * bright;
    col += uHot * (fil * 1.6 + rim * (1.6 + uPulse * 0.8));
    // A faint ember at the very centre, so the void has depth instead of a hole.
    col += uDeep * exp(-r * 1.4) * 0.6;
    gl_FragColor = vec4(col * mask, mask);
  }
`;

export interface RiftHandle {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  update(elapsed: number, pulse?: number): void;
}

/**
 * A plane exactly covering an arch opening of `width` by `height` whose round
 * top springs at `spring`. Additive, so it never needs sorting against the
 * stone it sits in.
 */
export function buildRift(width: number, height: number, spring: number, deep: number, hot: number): RiftHandle {
  const material = new THREE.ShaderMaterial({
    vertexShader: RIFT_VERT,
    fragmentShader: RIFT_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(deep) },
      uHot: { value: new THREE.Color(hot) },
      uSize: { value: new THREE.Vector2(width, height) },
      uSpring: { value: spring },
      uPulse: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.y = height * 0.5;
  mesh.renderOrder = 3;
  return {
    mesh,
    material,
    update(elapsed: number, pulse = 0): void {
      material.uniforms.uTime!.value = elapsed;
      material.uniforms.uPulse!.value = pulse;
    },
  };
}

// ---------------------------------------------------------------------------
// Atmosphere: ground mist and light shafts
// ---------------------------------------------------------------------------

/** Soft cloudy blobs on transparent black, tileable enough to scroll. */
function mistTexture(seed: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const rng = new Random(seed);
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 70; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const r = rng.range(24, 80);
    const a = rng.range(0.04, 0.12);
    // Draw each blob at its wrapped neighbours too so the tile has no seam.
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A vertical falloff for light shafts: bright at the top, gone at the floor. */
function shaftTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const v = ctx.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(255,255,255,0.9)');
  v.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  v.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 64, 256);
  // Feather the sides so a shaft never shows a hard plane edge.
  ctx.globalCompositeOperation = 'destination-in';
  const h = ctx.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.5, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = h;
  ctx.fillRect(0, 0, 64, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface AtmosphereHandle {
  root: THREE.Group;
  update(dt: number): void;
  dispose(): void;
}

export interface AtmosphereOpts {
  /** Mist colour. Additive, so keep it dim. */
  mistColor: number;
  mistOpacity?: number;
  /** Area the mist sheets cover, centred on the origin. */
  extent?: number;
  layers?: number;
  /** Optional light shafts: position of each top and the tilt. */
  shafts?: Array<{ x: number; z: number; height: number; width: number; tilt: number; yaw?: number }>;
  shaftColor?: number;
  shaftOpacity?: number;
  seed?: number;
}

/**
 * Layered drifting mist sheets just above the ground plus optional god rays.
 * Each sheet scrolls at its own rate and direction, so the parallax between
 * them reads as volume even though every layer is a flat quad.
 */
export function buildAtmosphere(opts: AtmosphereOpts): AtmosphereHandle {
  const root = new THREE.Group();
  root.name = 'menu-atmosphere';
  const textures: THREE.Texture[] = [];
  const sheets: Array<{ tex: THREE.Texture; vx: number; vy: number }> = [];
  const extent = opts.extent ?? 60;
  const layers = opts.layers ?? 4;

  for (let i = 0; i < layers; i++) {
    const tex = mistTexture((opts.seed ?? 77) + i * 131);
    tex.repeat.set(extent / 22, extent / 22);
    textures.push(tex);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: opts.mistColor,
      transparent: true,
      opacity: (opts.mistOpacity ?? 0.55) * (1 - i * 0.12),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(extent, extent), mat);
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.y = 0.18 + i * 0.32;
    sheet.renderOrder = 4;
    root.add(sheet);
    const ang = i * 2.1;
    sheets.push({ tex, vx: Math.cos(ang) * 0.006 * (1 + i * 0.4), vy: Math.sin(ang) * 0.006 * (1 + i * 0.4) });
  }

  if (opts.shafts?.length) {
    const tex = shaftTexture();
    textures.push(tex);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color: opts.shaftColor ?? 0x9fb4e0,
      transparent: true,
      opacity: opts.shaftOpacity ?? 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    for (const s of opts.shafts) {
      const geo = new THREE.PlaneGeometry(s.width, s.height);
      geo.translate(0, -s.height * 0.5, 0);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.x, s.height, s.z);
      m.rotation.set(0, s.yaw ?? 0, s.tilt);
      m.renderOrder = 5;
      root.add(m);
    }
  }

  return {
    root,
    update(dt: number): void {
      for (const s of sheets) {
        s.tex.offset.x = (s.tex.offset.x + s.vx * dt) % 1;
        s.tex.offset.y = (s.tex.offset.y + s.vy * dt) % 1;
      }
    },
    dispose(): void {
      for (const t of textures) t.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Statuary
// ---------------------------------------------------------------------------

/**
 * A hooded stone guardian, hands folded on the pommel of a greatsword planted
 * point-down. Built from revolved profiles so it costs one draw call, and
 * deliberately faceless: it is architecture, not a character.
 */
export function guardianStatue(rng: Rng, height = 3.4): THREE.BufferGeometry {
  const k = height / 3.4;
  const parts: THREE.BufferGeometry[] = [];

  // Robe: wide hem, cinched waist, broad shoulders.
  const robe = lathe(
    [
      [0.78, 0],
      [0.74, 0.12],
      [0.62, 0.7],
      [0.5, 1.3],
      [0.44, 1.6],
      [0.5, 1.95],
      [0.58, 2.3],
      [0.6, 2.42],
      [0.46, 2.58],
      [0.22, 2.66],
      [0.0001, 2.68],
    ],
    20,
  );
  parts.push(robe);

  // Hood: a squashed dome tipped slightly forward, with a deep cowl.
  parts.push(transformed(dome(0.36, 1.25, 16, 8), { pos: [0, 2.58, 0.02], rot: [0.18, 0, 0] }));
  parts.push(transformed(dome(0.42, 0.55, 16, 6), { pos: [0, 2.5, -0.02], rot: [-0.15, 0, 0] }));

  // Pauldrons.
  for (const s of [-1, 1]) {
    parts.push(transformed(dome(0.26, 0.7, 12, 6), { pos: [s * 0.5, 2.36, 0], rot: [0, 0, -s * 0.5] }));
  }

  // Forearms meeting at the pommel.
  for (const s of [-1, 1]) {
    parts.push(
      transformed(beveledBox(0.17, 0.62, 0.17, 0.04, 1), {
        pos: [s * 0.24, 1.86, 0.36],
        rot: [1.1, 0, s * 0.85],
      }),
    );
  }
  parts.push(transformed(beveledBox(0.3, 0.2, 0.22, 0.05, 1), { pos: [0, 1.72, 0.52] }));

  // Greatsword, point down, in front of the body.
  const swordLen = 1.75;
  parts.push(
    transformed(blade(swordLen, 0.2, 0.05, { taper: 0.7, fuller: 0.3, tip: 0.86 }), {
      pos: [0, 1.6, 0.6],
      rot: [Math.PI, 0, 0],
    }),
  );
  // Crossguard, grip and pommel.
  parts.push(transformed(beveledBox(0.72, 0.08, 0.1, 0.02, 1), { pos: [0, 1.62, 0.6] }));
  parts.push(transformed(beveledBox(0.07, 0.3, 0.07, 0.015, 1), { pos: [0, 1.8, 0.6] }));
  parts.push(transformed(dome(0.07, 1.6, 10, 4), { pos: [0, 1.95, 0.6] }));

  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  // Weathering: a little noise so it reads as carved and old, not modelled.
  displace(merged, rng, 0.018, 3.5);
  merged.scale(k, k, k);
  merged.computeVertexNormals();
  return merged;
}
