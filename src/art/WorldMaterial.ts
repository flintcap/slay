/**
 * SLAY — world-space materials for level geometry and terrain.
 *
 * Floors, walls, cliffs and open ground do not carry UVs that mean anything:
 * they are mapped from world position, so a texture keeps its real size
 * (metres per tile, from the scan) on every face and nothing stretches.
 *
 *  - Projection: floors take the top-down plane only. Walls and terrain are
 *    triplanar: each face picks the planes its normal leans into, and planes
 *    with almost no weight are skipped, so an axis-aligned wall costs one.
 *  - Tiling breakup: every sample is taken twice at two offsets chosen by a
 *    slow world noise and blended along the texture's own detail, so thirty
 *    metres of floor never reads as fifteen copies of one stone.
 *  - Layers: up to four surfaces on one mesh (stone, mud, grass, path...),
 *    weighted per vertex by `aSplat` (layers 1..3; layer 0 takes the rest) and
 *    blended by height, so mud fills the gaps between cobbles before it
 *    covers them.
 *  - World context from the builder through `aEnv`: on floors and terrain it
 *    is contact occlusion (1 = tucked into a corner), on walls the height
 *    above the floor in metres, which darkens and dirties the foot of every
 *    wall; above 150 on a wall marks a cap (the cut top of the masonry).
 *  - Damp patches, grime and broad colour drift on top.
 *  - Optional cutaway (walls between the camera and the hero open in a small
 *    dithered tube) and roof dissolve (a lid opens around the hero).
 *
 * Each call makes a private material; the caller owns disposal. Materials of
 * the same shape (kind, layer count, flags) build the same shader, which
 * three.js compiles once.
 */

import * as THREE from 'three/webgpu';
import {
  Fn, If, abs, attribute, cameraPosition, cameraViewMatrix, clamp, dFdx, dFdy, distance, dot, float, floor, fract,
  length, max, mix, normalWorldGeometry, positionWorld, pow, property, sin, smoothstep, step,
  texture, uniform, vec2, vec3, vec4,
} from 'three/tsl';
import { andMask, asStandard, matColor, matFloat, noise2, setNodeTextures, pixelDither, viewEye, floorDepth, worldLite, type F, type V2, type V3, type V4 } from '../core/Tsl';
import { resolveSurface } from './SurfaceLibrary';
import { setTextures, TEXTURE_SETS, type TextureSetInfo } from './TextureSets';

/** The vertex attribute carrying world context. See the header. */
export const WORLD_ENV_ATTRIBUTE = 'aEnv';
/** The vertex attribute carrying layer weights 1..3 (vec3). */
export const WORLD_SPLAT_ATTRIBUTE = 'aSplat';
/**
 * The vertex attribute (float, 0..1) mixing the first zone's grime and damp
 * into the second's. Read only by materials given `grime2` or `wet2`.
 */
export const WORLD_ZONE_ATTRIBUTE = 'aZone';
/** `aEnv` written on wall tops. Anything above 150 on a wall is a cap. */
export const WORLD_CAP_ENV = 199;

export interface WorldLayer {
  /** A surface key ('stone.crypt', 'ground.mud') or a set ('tex.cobble'). */
  key: string;
  /** Metres per texture tile; defaults to the scan's real size. */
  metres?: number;
  /** Extra multiplicative tint (sRGB hex). */
  tint?: number;
  /** Normal strength multiplier. */
  bump?: number;
  /** Roughness multiplier. */
  rough?: number;
  /** Emission colour and strength for sets that carry an emission map. */
  emissive?: number;
  emissiveIntensity?: number;
}

export interface WorldMaterialOpts {
  layers: WorldLayer[];
  /** See the header for what `aEnv` means for each. */
  kind: 'floor' | 'wall' | 'terrain';
  /** Colour that settles into corners and along wall feet. */
  grime?: number;
  grimeAmount?: number;
  /** 0..1 how much of the surface is damp: darker, glossier, flatter. */
  wet?: number;
  /**
   * A second zone's grime and damp, mixed in per vertex by `aZone` (terrain
   * where two outdoor zones meet). Either one alone turns the mix on.
   */
  grime2?: number;
  wet2?: number;
  /** 0..1 strength of broad light/dark drift. */
  variation?: number;
  /** 0..1 strength of the contact shadow from `aEnv`. */
  contact?: number;
  /** Open a sightline hole in front of the hero (walls). */
  cutaway?: boolean;
  /** Dissolve around the hero (roof lids, ceilings). See `setWorldRoof`. */
  roof?: boolean;
  /** Two-sample tiling breakup. On by default. */
  detile?: boolean;
  side?: THREE.Side;
  /** Uniform multiplier on every layer's colour (sRGB hex). */
  tint?: number;
}

/**
 * See-through for walls standing between the camera and the hero: xyz is the
 * hero's chest, w the radius of the cut (0 switches it off). One object
 * shared by every cutaway material, written each frame by the level.
 *
 * Only a small dithered hole along the sightline and only in front of the
 * hero: side walls level with the hero, and everything behind, stay solid.
 * Shadow and AO passes use their own materials and are not cut.
 */
export const worldCutaway = { value: new THREE.Vector4(0, 0, 0, 0) };

export function setWorldCutaway(x: number, y: number, z: number, radius: number): void {
  worldCutaway.value.set(x, y, z, radius);
}

/**
 * The roof dissolve shared by every lid and ceiling: x, y = world x, z of the
 * hero, z = radius of the opening in metres (0 closes it).
 */
export const worldRoof = { value: new THREE.Vector3(0, 0, 0) };

export function setWorldRoof(x: number, z: number, radius: number): void {
  worldRoof.value.set(x, z, radius);
}

const uCut = uniform(worldCutaway.value);
const uRoof = uniform(worldRoof.value);

/**
 * Kept where the sightline cut does not open the wall. Only for the eye of
 * the frame: in a shadow pass the camera is a light, and a cut there let a
 * torch shine through the wall between it and the hero.
 */
function cutKeep(): THREE.Node<'bool'> {
  const d = uCut.xyz.sub(cameraPosition);
  const len = length(d);
  const n = d.div(max(len, 1e-3));
  const r = positionWorld.sub(cameraPosition);
  const t = dot(r, n);
  const off = length(r.sub(n.mul(t)));
  const a = max(smoothstep(uCut.w.mul(0.6), uCut.w, off), smoothstep(len.sub(1.4), len.sub(0.7), t));
  return uCut.w.lessThanEqual(0.0).or(distance(cameraPosition, viewEye).greaterThan(0.05)).or(a.greaterThanEqual(pixelDither()));
}

/** Kept outside the roof's opening around the hero. */
function roofKeep(): THREE.Node<'bool'> {
  const d = distance(positionWorld.xz, uRoof.xy);
  const a = smoothstep(uRoof.z.mul(0.62), uRoof.z, d);
  return uRoof.z.lessThanEqual(0.0).or(a.greaterThanEqual(pixelDither()));
}

/**
 * The same cutaway on any private node material (trim, plinths, wall
 * dressing that would otherwise float in the hole). Never call it on a
 * cached `surface()`.
 */
export function addWorldCutaway<M extends THREE.Material>(mat: M): M {
  andMask(mat as unknown as THREE.NodeMaterial, cutKeep());
  return mat;
}

// ---------------------------------------------------------------------------
// Shader nodes
// ---------------------------------------------------------------------------

type Axis = 'x' | 'y' | 'z';

/** How a layer glows: not at all, from its emission map, or from the low points of its relief. */
type Glow = 0 | 1 | 2;

interface LayerNodes {
  albedo: THREE.Texture;
  normal: THREE.Texture;
  emissive: THREE.Texture | null;
  /** x: 1 / metres per tile, y: relief strength. */
  p: THREE.UniformNode<'vec2', THREE.Vector2>;
  tint: THREE.UniformNode<'color', THREE.Color>;
  /** x, y: roughness range, z: metalness. */
  r: THREE.UniformNode<'vec3', THREE.Vector3>;
  glowColor: THREE.UniformNode<'color', THREE.Color> | null;
  glow: Glow;
}

/** One planar projection of world position: its weight, uv, uv gradients and normal rebuild. */
interface Proj {
  w: F;
  uv: V2;
  dx: V2;
  dy: V2;
  /** Tangent normal t -> world, minus the axis normal. */
  delta: (tt: V3) => V3;
}

function projection(ax: Axis, P: V3, Dx: V3, Dy: V3, Sg: V3, W: V3): Proj {
  if (ax === 'y') {
    const sy = Sg.y;
    return {
      w: W.y,
      uv: vec2(P.x, sy.negate().mul(P.z)),
      dx: vec2(Dx.x, sy.negate().mul(Dx.z)),
      dy: vec2(Dy.x, sy.negate().mul(Dy.z)),
      delta: (tt) => vec3(tt.x, sy.mul(tt.z), sy.negate().mul(tt.y)).sub(vec3(0.0, sy, 0.0)),
    };
  }
  if (ax === 'x') {
    const sx = Sg.x;
    return {
      w: W.x,
      uv: vec2(sx.negate().mul(P.z), P.y),
      dx: vec2(sx.negate().mul(Dx.z), Dx.y),
      dy: vec2(sx.negate().mul(Dy.z), Dy.y),
      delta: (tt) => vec3(sx.mul(tt.z), tt.y, sx.negate().mul(tt.x)).sub(vec3(sx, 0.0, 0.0)),
    };
  }
  const sz = Sg.z;
  return {
    w: W.z,
    uv: vec2(sz.mul(P.x), P.y),
    dx: vec2(sz.mul(Dx.x), Dx.y),
    dy: vec2(sz.mul(Dy.x), Dy.y),
    delta: (tt) => vec3(sz.mul(tt.x), tt.y, sz.mul(tt.z)).sub(vec3(0.0, 0.0, sz)),
  };
}

/**
 * Builds the node graph. The main pass runs once, in the colour slot, and
 * leaves its results in named shader variables that the roughness, metal,
 * normal, glow and occlusion slots read.
 */
function buildNodes(
  mat: THREE.MeshStandardNodeMaterial,
  o: WorldMaterialOpts,
  L: LayerNodes[],
  grime: THREE.UniformNode<'color', THREE.Color>,
  world: THREE.UniformNode<'vec4', THREE.Vector4>,
  zone2: { grime: THREE.UniformNode<'color', THREE.Color>; wet: THREE.UniformNode<'float', number> } | null,
): void {
  const n = L.length;
  const floorOnly = o.kind === 'floor';
  const axes: Axis[] = floorOnly ? ['y'] : ['y', 'x', 'z'];
  const detile = o.detile !== false;
  const wall = o.kind === 'wall';

  const outAlb = property('vec3', 'slAlbOut');
  const outRough = property('float', 'slRoughOut');
  const outMetal = property('float', 'slMetalOut');
  const outNormal = property('vec3', 'slNormalOut');
  const outEmis = property('vec3', 'slEmisOut');
  const outOcc = property('float', 'slOccOut');

  const env = attribute(WORLD_ENV_ATTRIBUTE, 'float') as F;
  const splat = n > 1 ? (attribute(WORLD_SPLAT_ATTRIBUTE, 'vec3') as V3) : null;
  const zoneT = zone2 ? (attribute(WORLD_ZONE_ATTRIBUTE, 'float') as F) : null;

  const main = Fn(() => {
    const lite = worldLite.greaterThan(0.5).toVar();
    const P = positionWorld.toVar();
    const Dx = dFdx(positionWorld).toVar();
    const Dy = dFdy(positionWorld).toVar();
    const Ng = normalWorldGeometry.normalize().toVar();
    const Sg = step(0.0, Ng).mul(2.0).sub(1.0).toVar();
    let W: V3;
    if (floorOnly) {
      W = vec3(0.0, 1.0, 0.0);
    } else {
      const w0 = pow(abs(Ng), vec3(4.0));
      const w1 = w0.div(max(w0.x.add(w0.y).add(w0.z), 1e-4));
      const w2 = max(w1.sub(0.04), vec3(0.0));
      const blend = w2.div(max(w2.x.add(w2.y).add(w2.z), 1e-4)).toVar();
      // The light shader: the plane the face leans into most, alone.
      const lone = blend.y.greaterThanEqual(max(blend.x, blend.z))
        .select(vec3(0.0, 1.0, 0.0), blend.x.greaterThanEqual(blend.z).select(vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0)));
      W = lite.select(lone, blend).toVar();
    }
    const K = noise2(P.xz.mul(0.11).add(P.y.mul(0.07))).toVar();
    // Each projection's uv and gradients are worked out here, once, before
    // any branch. A value shared by several branches is otherwise written
    // only inside the first branch that reads it, and every other branch
    // reads zero: the ground drew without its texture wherever that first
    // branch was skipped.
    const proj = {} as Record<Axis, Proj>;
    for (const ax of axes) {
      const p = projection(ax, P, Dx, Dy, Sg, W);
      proj[ax] = { ...p, uv: p.uv.toVar(), dx: p.dx.toVar(), dy: p.dy.toVar() };
    }

    // Two offset taps blended along the texture's own detail. K is a slow
    // world-space noise, so the offset pair changes every few metres.
    const lk = K.mul(7.0);
    const ia = floor(lk);
    const fk = fract(lk).toVar();
    const oa = detile ? sin(vec2(3.0, 7.0).mul(ia)).toVar() : vec2(0.0);
    const ob = detile ? sin(vec2(3.0, 7.0).mul(ia.add(1.0))).toVar() : vec2(0.0);

    // Layer weights, blended by height so mud fills the gaps between cobbles first.
    const B: F[] = [];
    if (n > 1 && splat) {
      const wt: F[] = [splat.x.add(splat.y).add(splat.z).oneMinus().max(0.0).toVar(), splat.x, splat.y, splat.z];
      const S: F[] = [];
      for (let i = 0; i < n; i++) {
        const h = float(0.0).toVar();
        const tapH = (ax: Axis): void => {
          const p = proj[ax];
          const s = L[i]!.p.x;
          h.assign(texture(L[i]!.albedo, p.uv.mul(s)).grad(p.dx.mul(s), p.dy.mul(s)).a);
        };
        If(wt[i]!.greaterThan(0.001), () => {
          if (floorOnly) tapH('y');
          else {
            If(W.y.greaterThanEqual(max(W.x, W.z)), () => tapH('y'))
              .ElseIf(W.x.greaterThanEqual(W.z), () => tapH('x'))
              .Else(() => tapH('z'));
          }
        });
        S.push(wt[i]!.greaterThan(0.001).select(wt[i]!.add(h.mul(0.55)), float(-10.0)).uniformFlow().toVar());
      }
      const mx = S.reduce((a, b) => max(a, b)).sub(0.2).toVar();
      const raw = S.map((x) => max(x.sub(mx), 0.0).toVar());
      const sum = max(raw.reduce<F>((a, b) => a.add(b), float(0.0)), 1e-4).toVar();
      for (const r of raw) B.push(r.div(sum).toVar() as F);
    } else {
      B.push(float(1.0));
    }

    // Depth from the scans' height (albedo alpha): the low points of a floor
    // sit `floorDepth` below its tops, so the gaps between stones slide under
    // their edges as the view moves. Two reads per layer find where the view
    // ray meets the relief; the taps below then read there. Floors and the
    // top plane of open ground only: a wall keeps its face.
    if (!wall) {
      If(floorDepth.greaterThan(0.0), () => {
        const p = proj.y;
        const V = cameraPosition.sub(P).normalize().toVar();
        const k = V.xz.div(max(V.y, 0.3)).mul(floorDepth).negate();
        const duv = vec2(k.x, Sg.y.negate().mul(k.y)).mul(W.y).toVar();
        const od = fk.lessThan(0.5).select(oa, ob).toVar();
        const height = (uv: V2): F => {
          const h = float(0.0).toVar();
          for (let i = 0; i < n; i++) {
            const s = L[i]!.p.x;
            const read = (): void => {
              h.addAssign(texture(L[i]!.albedo, uv.mul(s).add(od)).grad(p.dx.mul(s), p.dy.mul(s)).a.mul(B[i]!));
            };
            if (n > 1) If(B[i]!.greaterThan(0.0), read);
            else read();
          }
          return h;
        };
        const h0 = height(p.uv);
        const h1 = height(p.uv.add(duv.mul(h0.oneMinus())));
        p.uv.addAssign(duv.mul(h0.add(h1).mul(0.5).oneMinus()));
      });
    }

    const alb = vec3(0.0).toVar();
    const roughV = float(0.0).toVar();
    const metalV = float(0.0).toVar();
    const DN = vec3(0.0).toVar();
    const emis = vec3(0.0).toVar();

    for (let i = 0; i < n; i++) {
      const Li = L[i]!;
      const body = (): void => {
        const s = Li.p.x;
        const la = vec4(0.0).toVar();
        const lr = float(0.0).toVar();
        const ld = vec3(0.0).toVar();
        const le = vec3(0.0).toVar();
        for (const ax of axes) {
          const p = proj[ax];
          const tap = (): void => {
            const puv = p.uv.mul(s).toVar();
            const pdx = p.dx.mul(s).toVar();
            const pdy = p.dy.mul(s).toVar();
            let a: V4;
            let nn: V4;
            let tb: F = float(0.0);
            if (detile) {
              // The light shader keeps the first tap only.
              const av0 = vec4(0.0).toVar();
              const nv0 = vec4(0.0).toVar();
              const tbv = float(0.0).toVar();
              If(lite, () => {
                av0.assign(texture(Li.albedo, puv.add(oa)).grad(pdx, pdy));
                nv0.assign(texture(Li.normal, puv.add(oa)).grad(pdx, pdy));
              }).Else(() => {
                const a0 = texture(Li.albedo, puv.add(oa)).grad(pdx, pdy).toVar();
                const a1 = texture(Li.albedo, puv.add(ob)).grad(pdx, pdy).toVar();
                tbv.assign(smoothstep(0.2, 0.8, fk.sub(dot(a0.rgb.sub(a1.rgb), vec3(1.0)).mul(0.1))));
                av0.assign(mix(a0, a1, tbv));
                nv0.assign(mix(texture(Li.normal, puv.add(oa)).grad(pdx, pdy), texture(Li.normal, puv.add(ob)).grad(pdx, pdy), tbv));
              });
              tb = tbv;
              a = av0;
              nn = nv0;
            } else {
              a = texture(Li.albedo, puv).grad(pdx, pdy);
              nn = texture(Li.normal, puv).grad(pdx, pdy);
            }
            const av = a.toVar();
            const nv = nn.toVar();
            la.addAssign(av.mul(p.w));
            lr.addAssign(nv.a.mul(p.w));
            const t0 = nv.xyz.mul(2.0).sub(1.0);
            const tt = vec3(t0.xy.mul(Li.p.y), t0.z);
            ld.addAssign(p.delta(tt).mul(p.w));
            if (Li.glow === 1 && Li.emissive) {
              const em = Li.emissive;
              if (detile) {
                If(lite, () => {
                  le.addAssign(texture(em, puv.add(oa)).grad(pdx, pdy).rgb.mul(p.w));
                }).Else(() => {
                  le.addAssign(mix(texture(em, puv.add(oa)).grad(pdx, pdy).rgb, texture(em, puv.add(ob)).grad(pdx, pdy).rgb, tb).mul(p.w));
                });
              } else {
                le.addAssign(texture(em, puv).grad(pdx, pdy).rgb.mul(p.w));
              }
            } else if (Li.glow === 2) {
              // No emission map: light pools in the cracks and hollows of the relief.
              const cav = av.a.oneMinus();
              le.addAssign(vec3(cav.mul(cav).mul(cav).mul(2.0)).mul(p.w));
            }
          };
          if (axes.length > 1) If(p.w.greaterThan(0.0), tap);
          else tap();
        }
        const b = B[i]!;
        alb.addAssign(la.rgb.mul(Li.tint).mul(b));
        roughV.addAssign(mix(Li.r.x, Li.r.y, lr).mul(b));
        metalV.addAssign(Li.r.z.mul(b));
        DN.addAssign(ld.mul(b));
        if (Li.glowColor) emis.addAssign(le.mul(Li.glowColor).mul(b));
      };
      if (n > 1) If(B[i]!.greaterThan(0.0), body);
      else body();
    }

    // World context: drift, damp, grime, contact, caps.
    const wsP = abs(Ng.y).greaterThan(0.5).select(P.xz, vec2(P.x.add(P.z), P.y.mul(1.3))).uniformFlow().toVar();
    const wsA = noise2(wsP.mul(1.0 / 23.0)).mul(0.65).add(noise2(wsP.mul(1.0 / 9.0).add(3.1)).mul(0.35)).toVar();
    const wsB = noise2(wsP.mul(1.0 / 6.1).add(vec2(0.37, 0.71))).toVar();
    const wsC = noise2(wsP.mul(1.0 / 3.3).add(vec2(7.1, 2.3))).toVar();
    const wsContact = (wall ? smoothstep(0.0, 1.5, env).oneMinus() : smoothstep(0.15, 1.0, env)).toVar();
    const wsBroad = wsA.sub(0.5).mul(2.0);
    alb.mulAssign(wsBroad.mul(0.24).mul(world.z).add(1.0));
    const grimeV = (zone2 && zoneT ? mix(grime, zone2.grime, zoneT).toVar() : grime) as unknown as V3;
    const wetW: F = zone2 && zoneT ? mix(world.y, zone2.wet, zoneT).toVar() : world.y;
    const gmax = max(max(grimeV.x, grimeV.y), max(grimeV.z, 0.001));
    const wsHue = grimeV.div(gmax);
    const wsBlot = smoothstep(0.45, 0.85, wsB.mul(0.7).add(wsA.mul(0.3)));
    alb.mulAssign(mix(vec3(1.0), wsHue.mul(0.74), wsBlot.mul(0.45).mul(world.z)));
    const wsWet = (wall
      ? wetW.mul(smoothstep(0.45, 0.8, wsA.add(wsContact.mul(0.35)))).mul(smoothstep(0.4, 2.2, env).oneMinus())
      : wetW.mul(smoothstep(wetW.mul(0.75).oneMinus(), wetW.mul(0.75).oneMinus().add(0.22), wsA.mul(0.8).add(wsC.mul(0.2)).add(wsContact.mul(0.15))))
    ).toVar();
    alb.mulAssign(wsWet.mul(0.42).oneMinus());
    const wsG = clamp(wsContact.mul(wsB.mul(0.6).add(0.55)), 0.0, 1.0).mul(world.x);
    alb.assign(mix(alb, grimeV, wsG.mul(0.5)));
    const wsCap: F = wall ? step(150.0, env).toVar() : float(0.0);
    alb.mulAssign(wsCap.mul(0.55).oneMinus());

    // Contact shadow: indirect light is occluded fully, direct light a little.
    const dd = wsContact.mul(world.w).mul(0.22).oneMinus();
    const occ = wsContact.mul(world.w).mul(0.65).oneMinus();
    outAlb.assign(alb.mul(dd));
    outOcc.assign(occ.div(max(dd, 1e-3)));

    // Standing water: the wettest heart of a damp patch, only where the
    // place is properly wet (a swamp, a flooded temple, a dripping cave).
    // Flat and near mirror-smooth, so each torch makes a sharp bright streak
    // in it; the damp ring round it stays merely glossy.
    const wsPool = (floorOnly || o.kind === 'terrain'
      ? smoothstep(0.72, 0.97, wsWet.div(max(wetW, 0.01))).mul(smoothstep(0.18, 0.45, wetW))
      : float(0.0)
    ).toVar();
    let rough: F = matFloat('roughness').mul(roughV);
    rough = rough.mul(mix(0.88, 1.06, wsC));
    rough = mix(rough, 0.2, wsWet.mul(0.85));
    rough = mix(rough, 0.07, wsPool);
    rough = mix(rough, 1.0, wsCap);
    outRough.assign(rough);
    outMetal.assign(matFloat('metalness').mul(metalV));
    // Standing water fills the crevices: relief flattens where it is wet.
    const WN = Ng.add(DN.mul(max(max(wsWet.mul(0.7), wsPool), wsCap.mul(0.6)).oneMinus())).normalize();
    outNormal.assign(cameraViewMatrix.mul(vec4(WN, 0.0)).xyz.normalize());
    outEmis.assign(emis);

    return matColor('color').mul(outAlb);
  });

  mat.colorNode = main();
  mat.roughnessNode = outRough;
  mat.metalnessNode = outMetal;
  mat.normalNode = outNormal;
  mat.emissiveNode = matColor('emissive').mul(matFloat('emissiveIntensity')).add(outEmis);
  mat.aoNode = outOcc;
  if (o.cutaway) andMask(mat, cutKeep());
  if (o.roof) andMask(mat, roofKeep());
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

function tintOf(key: string, extra: number | undefined, global: number | undefined): THREE.Color {
  const def = resolveSurface(key);
  const info: TextureSetInfo = TEXTURE_SETS[def.set];
  const out = new THREE.Color(1, 1, 1);
  if (def.base !== undefined) {
    const avg = new THREE.Color(info.avg);
    const base = new THREE.Color(def.base);
    const k = def.tintAmount ?? (info.gray ? 1 : 0.6);
    out.setRGB(
      1 + (base.r / Math.max(avg.r, 0.004) - 1) * k,
      1 + (base.g / Math.max(avg.g, 0.004) - 1) * k,
      1 + (base.b / Math.max(avg.b, 0.004) - 1) * k,
    );
  }
  if (extra !== undefined) out.multiply(new THREE.Color(extra));
  if (global !== undefined) out.multiply(new THREE.Color(global));
  return out;
}

/**
 * A private world-space material. See the header for the vertex attributes
 * it reads. The caller owns disposal (the textures are shared and stay).
 */
export function worldMaterial(o: WorldMaterialOpts): THREE.MeshStandardMaterial {
  const layers = o.layers.slice(0, 4);
  if (!layers.length) layers.push({ key: 'stone.crypt' });
  const grime = uniform(new THREE.Color(o.grime ?? 0x2a2622));
  const world = uniform(new THREE.Vector4(o.grimeAmount ?? 0.6, o.wet ?? 0, o.variation ?? 0.8, o.contact ?? 0.85));
  const zone2 =
    o.grime2 !== undefined || o.wet2 !== undefined
      ? { grime: uniform(new THREE.Color(o.grime2 ?? o.grime ?? 0x2a2622)), wet: uniform(o.wet2 ?? o.wet ?? 0) }
      : null;
  const nodes: LayerNodes[] = layers.map((l) => {
    const def = resolveSurface(l.key);
    const tex = setTextures(def.set);
    const metres = l.metres ?? def.metres ?? TEXTURE_SETS[def.set].metres;
    // Floors and walls never go mirror-smooth: seen from twenty metres, a
    // glossy normal map turns into a field of glitter (the hive's chitin
    // floor sparkled purple all over). Wet patches still darken and gloss.
    const r0 = Math.max(0.32, def.rough[0] * (l.rough ?? 1));
    const r1 = Math.max(r0 + 0.12, Math.min(1, def.rough[1] * (l.rough ?? 1)));
    const glowColor = l.emissive ?? def.emissive;
    const glow: Glow = tex.emissive ? 1 : glowColor !== undefined ? 2 : 0;
    return {
      albedo: tex.albedo,
      normal: tex.normal,
      emissive: tex.emissive,
      p: uniform(new THREE.Vector2(1 / Math.max(0.05, metres), def.bump * (l.bump ?? 1))),
      tint: uniform(tintOf(l.key, l.tint, o.tint)),
      r: uniform(new THREE.Vector3(r0, Math.min(1, r1), def.metal)),
      glowColor: glow
        ? uniform(new THREE.Color(glowColor ?? 0xff6020).multiplyScalar(l.emissiveIntensity ?? def.emissiveIntensity ?? (glow === 1 ? 1.5 : 0.4)))
        : null,
      glow,
    };
  });

  const mat = new THREE.MeshStandardNodeMaterial({
    name: `world:${o.kind}:${layers.map((l) => resolveSurface(l.key).key).join('+')}`,
    roughness: 1,
    metalness: 1,
    side: o.side ?? THREE.FrontSide,
  });
  buildNodes(mat, { ...o, layers }, nodes, grime, world, zone2);
  setNodeTextures(mat, nodes.flatMap((l) => [l.albedo, l.normal, l.emissive]));
  mat.userData.shared = false;
  return asStandard(mat);
}
