/**
 * SLAY — materials for heroes: skin, cloth, leather.
 *
 * A hero has no UVs. Every texture is projected three ways in the bind pose
 * (triplanar) and blended by the bind normal, so the weave or the pores stay
 * glued to the body however it bends. The bind position is the skinned
 * shader's own `position` attribute, so this costs no extra vertex data.
 *
 * Cloth and leather use CC0 photo scans from `public/assets/textures/hero/`
 * (see `tools/fetch-hero-textures.mjs`); they are colourless and the tint
 * picks the dye. Skin pores are painted here in code. Missing files fall back
 * to flat maps, so a hero always renders.
 */
import * as THREE from 'three/webgpu';
import {
  abs, atan, clamp, dot, float, floor, fract, fwidth, length, max, min, mix, mod, negateOnBackSide, normalGeometry,
  normalize, positionGeometry, sin, smoothstep, sqrt, uniform, vec2, vec3,
} from 'three/tsl';
import { asStandard, bindToView, isStandardLike, matColor, matFloat, setNodeTextures, triSample, whiteout, type F, type V3 } from '../../core/Tsl';
import { loadTexture } from '../../core/Assets';
import type { HeroLook } from './Looks';
import { resolveSurface } from '../SurfaceLibrary';
import { setTextures, TEXTURE_SETS, type TextureSetInfo } from '../TextureSets';
import { setScans } from '../Scans';

export type HeroFabric = 'linen' | 'wool' | 'leather' | 'suede' | 'hessian';

/** Real width of one tile of each scan, metres (from Poly Haven's metadata). */
const FABRIC_METRES: Record<HeroFabric, number> = { linen: 0.27, wool: 0.27, leather: 0.4, suede: 0.29, hessian: 0.27 };

const cache = new Map<string, THREE.Material>();

function shared<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = make();
  m.userData.shared = true;
  cache.set(key, m);
  return m;
}

interface TriOpts {
  albedo?: THREE.Texture;
  normal: THREE.Texture;
  /** Tiles per metre. */
  scale: number;
  normalScale: number;
  /** How much the map's alpha moves roughness (0 none .. 1 all). */
  roughVar: number;
  /** Multiplies the albedo map so its average lands on 1 (default 1.6, for scans pulled to 0.62). */
  albedoGain?: number;
  /** A relief pressed into the surface in the shader (quilting, mail rings, scales): see `ARMOUR_PATTERNS`. */
  pattern?: { kind: number; h: number };
}

/** The options each triplanar material was made with, so a patterned twin can be made from it. */
const triOptsOf = new WeakMap<THREE.Material, TriOpts>();

/**
 * Armour reliefs drawn in the shader instead of pressed into the mesh. A
 * relief a few centimetres across is finer than the mesher's cells and the
 * decimator's budget, and pressed into the mesh it came out as crumpled
 * facets and blotches. Here it is an exact height in bind space: the normal
 * bends round it and its grooves darken, and it fades to its average where
 * it would be finer than a few pixels.
 */
export const ARMOUR_PATTERNS = { quilt: 1, rings: 2, scales: 3, hide: 4, splints: 5, shell: 6 } as const;
export type ArmourPattern = keyof typeof ARMOUR_PATTERNS;

/** Relief height 0..1 at bind position `p`, for pattern `kind`; `h` is the body's head unit. */
function patHeight(p: V3, kind: number, h: number): F {
  // Distance round the body: the relief wraps the torso and limbs instead of
  // being projected flat onto them.
  const U = atan(p.x, p.z.add(0.04 * h)).mul(0.62 * h);
  if (kind === 1) {
    // Diamond quilting: puffed cells between stitched seams.
    const u = U.div(0.085);
    const v = p.y.div(0.085);
    const pa = sin(fract(u.add(v)).mul(Math.PI));
    const pb = sin(fract(u.sub(v)).mul(Math.PI));
    return sqrt(max(0.0, pa.mul(pb)));
  }
  if (kind === 2) {
    // Mail: rows of interlocking rings.
    const sz = 0.024;
    const r = floor(p.y.div(sz));
    const f = vec2(fract(U.div(sz).add(mod(r, 2.0).mul(0.5))), fract(p.y.div(sz))).sub(0.5);
    const d = length(f);
    return max(0.0, abs(d.sub(0.3)).div(0.14).oneMinus());
  }
  if (kind === 3 || kind === 4) {
    // Overlapping scales, each row over the one below.
    const sx = kind === 3 ? 0.05 : 0.034;
    const sy = kind === 3 ? 0.038 : 0.027;
    const r = floor(p.y.negate().div(sy));
    const fy = fract(p.y.negate().div(sy));
    const fu = fract(U.div(sx).add(mod(r, 2.0).mul(0.5))).mul(2.0).sub(1.0);
    const edge = fu.mul(fu).mul(0.45).oneMinus();
    return fy.lessThan(edge).select(fy.div(edge), float(0.12));
  }
  if (kind === 5) {
    // Splints: upright strips in bands.
    const fu = fract(U.div(0.046));
    const strip = smoothstep(0.06, 0.14, fu).mul(smoothstep(0.86, 0.94, fu).oneMinus());
    const fy = fract(p.y.div(0.17));
    return strip.mul(smoothstep(0.03, 0.08, fy));
  }
  // A shell of broad curved plates, each lapping the one below, with growth lines.
  const r = floor(p.y.negate().div(0.065));
  const fy = fract(p.y.negate().div(0.065));
  const fu = fract(U.div(0.15).add(mod(r, 2.0).mul(0.5))).mul(2.0).sub(1.0);
  const edge = fu.mul(fu).mul(0.3).oneMinus();
  const k = fy.lessThan(edge).select(fy.div(edge), float(0.08));
  return k.mul(k).mul(0.85).add(sin(k.mul(18.85)).mul(0.5).add(0.5).mul(0.15));
}

/** Depth of each relief in metres, and the period it repeats at (for the fade). */
const PATTERN_DEPTH: Record<number, [number, number]> = { 1: [0.006, 0.085], 2: [0.0022, 0.024], 3: [0.006, 0.038], 4: [0.0045, 0.027], 5: [0.005, 0.046], 6: [0.007, 0.065] };

/** Gives a standard node material maps sampled triplanar in bind space. */
function triplanar(m: THREE.MeshStandardNodeMaterial, o: TriOpts): void {
  triOptsOf.set(m, o);
  // Read by the icon studio (art/Icons.ts), as on item materials.
  setScans(m, o.albedo ? [o.albedo, o.normal] : [o.normal]);
  setNodeTextures(m, [o.albedo, o.normal]);
  const pat = o.pattern;
  // The bind pose: the skinned mesh's own `position` and `normal` attributes.
  const Pb = positionGeometry;
  const Nb = normalGeometry.normalize().toVar();
  const P = Pb.mul(uniform(o.scale)).toVar();
  const t = triSample(P, Nb, o.normal, o.albedo);
  const W = t.W;
  let color: V3 = matColor('color');
  let patFade: F = float(0.0);
  if (pat) {
    // Fade the relief out where it repeats in fewer than a few pixels.
    const period = PATTERN_DEPTH[pat.kind]![1];
    const px = length(fwidth(Pb));
    patFade = smoothstep(period * 0.12, period * 0.3, px).oneMinus().toVar();
    const h0 = patHeight(Pb, pat.kind, pat.h);
    color = color.mul(mix(float(0.8), mix(0.62, 1.08, h0), patFade));
  }
  if (o.albedo) {
    color = color.mul(min(vec3(2.0), t.albedo!.rgb.mul(uniform(o.albedoGain ?? 1.6))));
  }
  m.colorNode = color;

  const triR = t.rough;
  m.roughnessNode = clamp(matFloat('roughness').mul(mix(float(1.0), triR.mul(1.4), uniform(o.roughVar))), 0.04, 1.0);

  let bn: V3 = whiteout(t, Nb, uniform(o.normalScale));
  if (pat) {
    // Bend the bind normal round the relief: its gradient along the surface.
    const e = 0.0012;
    const depth = PATTERN_DEPTH[pat.kind]![0];
    const ph = (d: V3): F => patHeight(Pb.add(d), pat.kind, pat.h);
    const g0 = vec3(
      ph(vec3(e, 0, 0)).sub(ph(vec3(-e, 0, 0))),
      ph(vec3(0, e, 0)).sub(ph(vec3(0, -e, 0))),
      ph(vec3(0, 0, e)).sub(ph(vec3(0, 0, -e))),
    ).mul(depth / (2 * e));
    const g = g0.sub(Nb.mul(dot(g0, Nb)));
    bn = normalize(bn.sub(g.mul(1.4).mul(patFade)));
  }
  // Flipped on back faces by the side the material has when drawn.
  m.normalNode = negateOnBackSide(bindToView(bn, Pb, Nb));
}

/** A standard node material for the hero kit. */
function std(p: THREE.MeshStandardNodeMaterialParameters): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial(p);
}

/** Integer hash, deterministic. */
function ihash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Tileable value noise with period `p` cells. */
function vnoise(x: number, y: number, p: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const m = (v: number) => ((v % p) + p) % p;
  const a = ihash(m(xi), m(yi), s);
  const b = ihash(m(xi + 1), m(yi), s);
  const c = ihash(m(xi), m(yi + 1), s);
  const d = ihash(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

let poreTex: THREE.DataTexture | null = null;

/**
 * Skin detail, one tile: pores, fine creases and a little oil. RGB is a
 * tangent normal, A roughness (higher in the pores, lower on the sheen).
 */
function skinPores(): THREE.DataTexture {
  if (poreTex) return poreTex;
  const N = 256;
  const CELLS = 40;
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x / N) * CELLS;
      const v = (y / N) * CELLS;
      const cx = Math.floor(u);
      const cy = Math.floor(v);
      let pore = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const gy = cy + oy;
          const wx = ((gx % CELLS) + CELLS) % CELLS;
          const wy = ((gy % CELLS) + CELLS) % CELLS;
          const px = gx + ihash(wx, wy, 1);
          const py = gy + ihash(wx, wy, 2);
          const r = 0.16 + 0.12 * ihash(wx, wy, 3);
          const d2 = ((u - px) ** 2 + (v - py) ** 2) / (r * r);
          pore = Math.max(pore, Math.exp(-d2));
        }
      }
      // Fine creases run across the tile at a slant; broad soft unevenness under them.
      const crease = Math.abs(vnoise((x / N) * 24 + (y / N) * 8, (y / N) * 6, 24, 4) - 0.5);
      const soft = vnoise((x / N) * 8, (y / N) * 8, 8, 5);
      hgt[y * N + x] = -0.9 * pore - 0.35 * Math.max(0, 0.12 - crease) * 6 + 0.4 * soft;
    }
  }
  const data = new Uint8Array(N * N * 4);
  const at = (x: number, y: number) => hgt[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 0.9;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.9;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * N + x) * 4;
      data[i] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      const h = at(x, y);
      data[i + 3] = Math.round(Math.min(1, Math.max(0, 0.66 - 0.3 * h + 0.18 * (vnoise((x / N) * 4, (y / N) * 4, 4, 6) - 0.5))) * 255);
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  t.userData.shared = true;
  poreTex = t;
  return t;
}

/** Skin: tinted by the look, with painted flush and shadow in vertex colours. */
export function skinMaterial(look: HeroLook): THREE.MeshStandardMaterial {
  return shared(`skin|${look.skin}|${look.dead ? 1 : 0}`, () => {
    const m = std({ color: look.skin, roughness: look.dead ? 0.85 : 0.62, metalness: 0, vertexColors: true });
    // One tile every 6 cm.
    triplanar(m, { normal: skinPores(), scale: 1 / 0.06, normalScale: look.dead ? 0.9 : 0.5, roughVar: 0.8 });
    m.name = 'hero-skin';
    return asStandard(m);
  });
}

/** Cloth or leather from a CC0 scan, dyed. */
export function fabricMaterial(fabric: HeroFabric, tint: number, roughness = 0.9, twoSided = false): THREE.MeshStandardMaterial {
  return shared(`fabric|${fabric}|${tint}|${roughness}|${twoSided ? 2 : 1}`, () => {
    const dir = `textures/hero/${fabric}`;
    const albedo = loadTexture(`${dir}/albedo.webp`, { srgb: true, fallback: 0x9e9e9e, fallbackAlpha: 128 });
    const normal = loadTexture(`${dir}/normal.webp`, { srgb: false, fallback: 0x8080ff, fallbackAlpha: 200 });
    const m = std({ color: tint, roughness, metalness: 0, side: twoSided ? THREE.DoubleSide : THREE.FrontSide });
    triplanar(m, { albedo, normal, scale: 1 / FABRIC_METRES[fabric], normalScale: 1, roughVar: 0.7, albedoGain: 2.6 });
    m.name = `hero-${fabric}`;
    return asStandard(m);
  });
}

let strandTex: { albedo: THREE.DataTexture; normal: THREE.DataTexture } | null = null;

/** Strands running down the tile (along v): grey albedo streaks and a ridged normal. */
function strands(): { albedo: THREE.DataTexture; normal: THREE.DataTexture } {
  if (strandTex) return strandTex;
  const N = 256;
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Columns wander a little down the tile so strands are not ruled lines.
      const u = x / N + 0.012 * Math.sin((y / N) * Math.PI * 2 * 2 + vnoise(x / 16, 0, N / 16, 9) * 6);
      const a = vnoise(u * 96, (y / N) * 3, 96, 7);
      const b = vnoise(u * 40, (y / N) * 2, 40, 8);
      hgt[y * N + x] = 0.65 * a + 0.35 * b;
    }
  }
  const alb = new Uint8Array(N * N * 4);
  const nor = new Uint8Array(N * N * 4);
  const at = (x: number, y: number) => hgt[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const v = at(x, y);
      const g = Math.round(Math.min(1, 0.35 + 0.9 * v) * 255);
      alb[i] = alb[i + 1] = alb[i + 2] = g;
      alb[i + 3] = 255;
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 0.4;
      const l = Math.hypot(dx, dy, 1);
      nor[i] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      nor[i + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      nor[i + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      nor[i + 3] = Math.round((0.75 - 0.35 * v) * 255);
    }
  }
  const mk = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true;
    t.userData.shared = true;
    return t;
  };
  strandTex = { albedo: mk(alb, true), normal: mk(nor, false) };
  return strandTex;
}

/** Hair, brows and beards: streaked strands with a soft sheen. */
export function hairMaterial(color: number): THREE.MeshStandardMaterial {
  return shared(`hair|${color}`, () => {
    const m = std({ color, roughness: 0.55, metalness: 0 });
    const t = strands();
    // One tile every 4 cm.
    triplanar(m, { albedo: t.albedo, normal: t.normal, scale: 1 / 0.04, normalScale: 1.2, roughVar: 0.8 });
    m.name = 'hero-hair';
    return asStandard(m);
  });
}

/**
 * A beast's pelt (the Shapeshifter's forms): the hair strands at a coarser
 * tile and a deeper ridge, coloured by the pelt painted in vertex colours,
 * matte except where the guard hairs catch the light.
 */
export function furMaterial(sheen = 0.68): THREE.MeshStandardMaterial {
  return shared(`fur|${sheen}`, () => {
    const m = std({ color: 0xffffff, roughness: sheen, metalness: 0, vertexColors: true });
    const t = strands();
    // One tile every 5 cm: thicker strands than a man's hair.
    triplanar(m, { albedo: t.albedo, normal: t.normal, scale: 1 / 0.05, normalScale: 1.6, roughVar: 0.9, albedoGain: 1.25 });
    m.name = 'hero-fur';
    return asStandard(m);
  });
}

/** Claws, fangs and horn: dark at the root, pale and polished at the tip (vertex colours). */
export function hornMaterial(): THREE.MeshStandardMaterial {
  return shared('horn', () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.05, vertexColors: true });
    m.name = 'hero-horn';
    return m;
  });
}

/** Tile size on armour by family: a plate shows its hammering, a mail its rings. */
const GEAR_METRES: Record<string, number> = { metal: 0.45, leather: 0.3, cloth: 0.25, bone: 0.4 };

/**
 * Armour and trim from a world surface key ('metal.steel', 'leather.worn',
 * 'cloth.linen|0x7a1e1a'...), projected triplanar like the skin. Colour,
 * roughness and metalness follow the surface library, so the piece on the
 * body matches the one on the floor.
 */
export function gearMaterial(key: string, opts: { tint?: number; metalness?: number; roughness?: number } = {}): THREE.MeshStandardMaterial {
  const [pal, inlineTint] = key.split('|');
  const inline = inlineTint ? Number(inlineTint) : undefined;
  return shared(`gear|${pal}|${inline ?? ''}|${opts.tint ?? ''}|${opts.metalness ?? ''}|${opts.roughness ?? ''}`, () => {
    const def = resolveSurface(pal!);
    const info: TextureSetInfo = TEXTURE_SETS[def.set];
    const tex = setTextures(def.set);
    const avg = new THREE.Color(info.avg);
    const lum = Math.max(0.05, 0.2126 * avg.r + 0.7152 * avg.g + 0.0722 * avg.b);
    const color = new THREE.Color(def.base ?? 0xffffff);
    // The same rule as the item icons (`itemSurface`): on a surface with its
    // own base colour an inline tint IS the colour, on the rest it multiplies.
    // Multiplying both ways put a pink snakeskin robe on the body as near
    // black while its icon stayed pink.
    if (inline !== undefined && Number.isFinite(inline)) {
      if (def.base !== undefined) color.set(inline);
      else color.multiply(new THREE.Color(inline));
    }
    if (opts.tint !== undefined) color.multiply(new THREE.Color(opts.tint));
    // Worn metal keeps a share of diffuse light: a dungeon has little for a
    // mirror to reflect, and full metal reads as black.
    const metal = opts.metalness ?? (def.metal > 0.5 ? 0.6 : def.metal);
    const m = std({
      color,
      // Metal keeps some grain: a smoother floor blows out to white under the town's sky.
      roughness: opts.roughness ?? Math.max(metal > 0.5 ? 0.42 : 0.35, (def.rough[0] + def.rough[1]) * 0.6),
      metalness: metal,
      envMapIntensity: metal > 0.5 ? 1.35 : 1,
    });
    // Coloured scans (wood, bone) keep a share of their own hue.
    triplanar(m, {
      albedo: tex.albedo,
      normal: tex.normal,
      scale: 1 / (GEAR_METRES[def.family] ?? 0.4),
      normalScale: def.bump * 0.85,
      roughVar: 0.8,
      albedoGain: def.base !== undefined ? 1 / lum : 1,
    });
    m.name = `hero-gear:${def.key}`;
    // The colour it reads as, scan and all: what the icon's surface of the same key shows.
    m.userData.albedo = def.base !== undefined ? color.getHex() : color.clone().multiply(avg).getHex();
    return asStandard(m);
  });
}

/**
 * A twin of a triplanar gear or cloth material with a relief drawn in (see
 * `ARMOUR_PATTERNS`). `h` is the body's head unit, which the relief is laid
 * out round. Materials made some other way come back unchanged.
 */
export function patternedMaterial(m: THREE.Material, pattern: ArmourPattern, h: number): THREE.Material {
  const o = triOptsOf.get(m);
  if (!o || !isStandardLike(m)) return m;
  return shared(`pat|${m.uuid}|${pattern}|${h.toFixed(4)}`, () => {
    const c = (m as unknown as THREE.MeshStandardNodeMaterial).clone();
    triplanar(c, { ...o, pattern: { kind: ARMOUR_PATTERNS[pattern], h } });
    c.name = `${m.name}+${pattern}`;
    return c;
  });
}

/**
 * A twin of a gear material lit from within: a set's trims once two pieces
 * are worn, a full set's whole outfit, a unique's inlays. Shared and cached
 * like the material it twins.
 */
export function glowingTwin(m: THREE.Material, color: number, intensity: number): THREE.Material {
  if (!isStandardLike(m) || intensity <= 0) return m;
  const o = triOptsOf.get(m);
  return shared(`lit|${m.uuid}|${color}|${intensity.toFixed(3)}`, () => {
    const c = (m as unknown as THREE.MeshStandardNodeMaterial).clone();
    if (o) triplanar(c, o);
    c.emissive.set(color);
    c.emissiveIntensity = intensity;
    c.name = `${m.name}+lit`;
    return c;
  });
}

/** Glowing runes, gems and inlays. */
export function glowMaterial(color: number, intensity: number): THREE.MeshStandardMaterial {
  return shared(`glow|${color}|${intensity}`, () => {
    const c = new THREE.Color(color);
    const m = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.14), emissive: c, emissiveIntensity: intensity, roughness: 0.3, metalness: 0 });
    m.name = 'hero-glow';
    return m;
  });
}
