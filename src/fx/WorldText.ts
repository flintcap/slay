/**
 * SLAY fx: world-space text over the fight (combo callouts, the odd damage
 * number). One instanced glyph quad per letter, one draw call for all of it.
 * Built on first use: most runs never draw any.
 */

import * as THREE from 'three';
import { markRange } from './kit/Upload';

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
    advance[i] = Math.min(1, (ctx.measureText(ch).width + GLYPH_CELL * 0.08) / GLYPH_CELL);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  // flipY must be off. The atlas is drawn top-down — glyph 0 in the top-left
  // cell — and three.js flips canvas textures by default, so row 0 was being
  // sampled from the bottom of the sheet. Every digit came back as whatever
  // letter happened to sit in the mirrored row, which is why damage read as
  // random symbols.
  tex.flipY = false;
  // No mipmaps: at distance a mip blends neighbouring cells together and a 7
  // picks up the edge of the 8 beside it.
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
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
    vec3 local = camRight * (rc.x * 1.0 + iCell.z) * scale * alive
               + camUp    * rc.y * scale * alive;

    vec4 mv = modelViewMatrix * vec4(wpos, 1.0);
    mv.xyz += mat3(viewMatrix) * local;
    gl_Position = projectionMatrix * mv;

    float fade = 1.0 - smoothstep(0.62, 1.0, t);
    float flashIn = smoothstep(0.0, 0.05, t);
    vColor = vec4(iColor, fade * flashIn * alive);

    // Sample the whole cell. Narrowing the window to the glyph's advance width
    // sliced the right-hand side off every character, because glyphs are drawn
    // centred in their cell rather than flush left. Advance only decides where
    // the next glyph starts, never how much of this one is visible.
    vUv = (uv + vec2(iCell.x, iCell.y)) * uCell;
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

const TEXT_ATTRS: ReadonlyArray<readonly [string, number]> = [
  ['iOrigin', 3], ['iCell', 4], ['iAnim', 4], ['iMotion', 4], ['iColor', 3],
];

/** Instanced glyph quads: one draw call for every damage number on screen. */
export class WorldText {
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
    const count = this.hi - this.lo + 1;
    for (const [name, items] of TEXT_ATTRS) {
      const attr = this.a[name]!;
      markRange(attr, this.lo * items, count * items);
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

