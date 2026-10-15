/**
 * SLAY — the living effect round a set or unique: embers rising off a
 * dragon-scaled outfit, frost mist sinking off ice plate, gold glints on a
 * gilded set, souls drifting up from a necromancer's crown.
 *
 * Two layers. The glow itself is a shell (`glowShell`, `glowTwins`): the
 * item's own surface pushed out a few millimetres and lit at its edges, so
 * the light hugs the silhouette and the bloom pass spreads it into a halo.
 * Over it, for the kinds that are made of sparks (embers, sparks, glints,
 * drips, ash), a few small points; the soft kinds (a halo, frost, souls,
 * smoke, wisps, motes) are the shell alone, as round blobs read as floating
 * circles rather than light.
 *
 * The game no longer adds the points to gear (the owner kept the outline glow
 * and dropped the sparks so busy fights draw less); `buildAura` stays for the
 * icons' look (`auraStyle`) and any later use.
 *
 * One instanced sprite per aura, one draw call. Every particle's path is a
 * closed loop worked out in the vertex shader from the clock, so nothing is
 * updated on the CPU and an aura costs the same standing or running. One
 * shader program serves every kind; the kind only changes uniforms.
 *
 * Seeded (`core/RNG.ts`): the same item always throws the same particles.
 */
import * as THREE from 'three/webgpu';
import {
  abs, attribute, cameraProjectionMatrix, clamp, cos, dot, exp, float, floor, fract, length, max, mix, modelViewMatrix, normalize,
  normalLocal, positionLocal, pow, sin, smoothstep, step, transformNormalToView, uniform, uv, vec3, vec4,
} from 'three/tsl';
import { vary, type F, type V3 } from '../../core/Tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random } from '../../core/RNG';
import type { Aura, GlowStyle } from './Designs';

/** How each kind of aura moves and looks. */
interface AuraKind {
  /** Metres a second up (negative falls). */
  rise: number;
  /** Turns a second round the axis. */
  swirl: number;
  /** Random hop each tick (sparks), metres. */
  jump: number;
  /** Sprite size in the world, units of 6 mm. */
  size: number;
  /** 0 steady .. 1 winks on and off. */
  twinkle: number;
  /** How far out it drifts as it rises (1 = stays at its radius). */
  spread: number;
  /** Brightness. */
  gain: number;
  /** 0 a soft blob .. 1 a hard bright point. */
  core: number;
  /** Particles per unit of strength. */
  count: number;
}

const KINDS: Record<Exclude<Aura, 'none'>, AuraKind> = {
  soft: { rise: 0.02, swirl: 0.05, jump: 0, size: 70, twinkle: 0, spread: 1, gain: 0.16, core: 0, count: 6 },
  embers: { rise: 0.55, swirl: 0.15, jump: 0, size: 9, twinkle: 0.4, spread: 1.3, gain: 1.1, core: 0.8, count: 22 },
  ash: { rise: 0.2, swirl: 0.25, jump: 0, size: 10, twinkle: 0.2, spread: 1.6, gain: 0.7, core: 0.5, count: 20 },
  frost: { rise: -0.12, swirl: 0.1, jump: 0, size: 22, twinkle: 0.3, spread: 1.4, gain: 0.45, core: 0.1, count: 18 },
  sparkles: { rise: 0.04, swirl: 0.08, jump: 0, size: 12, twinkle: 1, spread: 1.1, gain: 1.2, core: 1, count: 20 },
  shine: { rise: 0.08, swirl: 0.35, jump: 0, size: 12, twinkle: 0.9, spread: 1, gain: 1.1, core: 1, count: 18 },
  wisp: { rise: 0.22, swirl: 0.9, jump: 0, size: 10, twinkle: 0, spread: 1.1, gain: 0.8, core: 0.6, count: 24 },
  smoke: { rise: 0.22, swirl: 0.2, jump: 0, size: 34, twinkle: 0, spread: 1.7, gain: 0.3, core: 0, count: 14 },
  drips: { rise: -0.55, swirl: 0, jump: 0, size: 7, twinkle: 0, spread: 1, gain: 1, core: 0.7, count: 14 },
  sparks: { rise: 0, swirl: 0, jump: 0.06, size: 8, twinkle: 0.8, spread: 1, gain: 1.4, core: 1, count: 18 },
  motes: { rise: 0.08, swirl: 0.12, jump: 0, size: 10, twinkle: 0.3, spread: 1.2, gain: 0.8, core: 0.6, count: 20 },
  souls: { rise: 0.35, swirl: 0.3, jump: 0, size: 26, twinkle: 0, spread: 1.3, gain: 0.45, core: 0.2, count: 12 },
};

type AuraMat = THREE.PointsNodeMaterial;

/** One clock for every aura and shell, set by whichever draws first in a frame. */
const auraTime = uniform(0);

function tick(): void {
  auraTime.value = (performance.now() / 1000) % 3600;
}

const mats = new Map<string, AuraMat>();

/**
 * Each particle is a camera-facing square drawn once per instance; its path
 * is worked out from the clock and its seed (phase, speed, angle, radius).
 */
function material(kind: Exclude<Aura, 'none'>, color: number, height: number, strength: number): AuraMat {
  const key = `${kind}|${color}|${height.toFixed(2)}|${strength.toFixed(2)}`;
  let m = mats.get(key);
  if (m) return m;
  const k = KINDS[kind];
  const uColor = uniform(new THREE.Color(color));
  const uGain = uniform(k.gain * Math.min(1.4, 0.5 + strength * 0.5));
  const seed = attribute<'vec4'>('aSeed', 'vec4');
  const base = attribute<'float'>('aY', 'float');
  const T = auraTime;
  const t = T.mul(seed.y).add(seed.x);
  const life = fract(t.mul(0.25));
  const ang = seed.z.add(T.mul(k.swirl * 6.2832).mul(seed.y.mul(0.4).add(0.6)));
  const r = seed.w.mul(mix(1.0, k.spread, life));
  // Rising things start low and climb; falling things start high.
  const y: F = Math.abs(k.rise) > 0.001 ? (k.rise > 0 ? life : life.oneMinus()).mul(height).add(base.mul(0.25)) : base;
  let p: V3 = vec3(cos(ang).mul(r), y, sin(ang).mul(r));
  if (k.jump > 0) {
    const h = (n: F): F => fract(sin(n).mul(43758.5453));
    const tk = floor(T.mul(14.0).add(seed.x.mul(7.0)));
    p = p.add(vec3(h(tk.add(seed.z)), h(tk.mul(1.3).add(seed.w)), h(tk.mul(1.7).add(seed.x))).sub(0.5).mul(k.jump * 4.0));
  }
  const fade: F = Math.abs(k.rise) > 0.001 ? smoothstep(0.0, 0.15, life).mul(smoothstep(0.65, 1.0, life).oneMinus()) : float(1.0);
  const vFade = vary(fade);
  const vSeed = vary(seed.x.add(T.mul(seed.y.add(0.5))));
  m = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false });
  m.fog = false;
  m.positionNode = p;
  // The sprite's world size in units of 6 mm (small: a spark, not a disc),
  // drawn for a 600 px tall view.
  const mv = modelViewMatrix.mul(vec4(p, 1.0));
  m.sizeNode = cameraProjectionMatrix.mul(vec4(0.0, 1.0, 0.0, 0.0)).y.mul(k.size * 0.6 * 1.8).div(max(0.2, mv.z.negate()));
  const d = uv().sub(0.5);
  const rr = length(d).mul(2.0);
  const soft = pow(rr.oneMinus().max(0.0), 2.0);
  const hard = smoothstep(0.45, 0.0, rr);
  const al = mix(soft, max(soft.mul(0.4), hard), k.core);
  const tw = mix(1.0, sin(vSeed.mul(6.2832)).mul(0.5).add(0.5), k.twinkle);
  // A white-hot centre on bright points.
  const c = mix(uColor as unknown as V3, vec3(1.0), hard.mul(k.core * 0.5));
  m.colorNode = c.mul(al).mul(vFade).mul(tw).mul(uGain);
  m.maskNode = rr.lessThanEqual(1.0);
  m.name = `aura:${kind}`;
  m.userData.shared = true;
  mats.set(key, m);
  return m;
}

export interface AuraOpts {
  /** Radius of the column the particles move in, metres. */
  radius: number;
  /** Height of the column, metres; its foot is at the object's origin. */
  height: number;
  /** 0..1.5: how many particles and how bright. A full set is 1. */
  strength: number;
  /** Seed for the particles' places. */
  seed: number;
}

/** Kinds that throw particles over their glow, and how many of the full count. */
const SPARKY: Partial<Record<Aura, number>> = { embers: 0.45, sparks: 0.45, sparkles: 0.4, shine: 0.4, drips: 0.5, ash: 0.4 };

/** True when the kind throws particles over its glow (see `SPARKY`). */
export function auraHasSparks(kind: Aura): boolean {
  return SPARKY[kind] !== undefined;
}

/**
 * The aura's particles as one Points object, or null for 'none' and for the
 * soft kinds, which are the glow shell alone. Add it under whatever it should follow.
 */
export function buildAura(kind: Aura, color: number, o: AuraOpts): THREE.Sprite | null {
  const share = SPARKY[kind];
  if (kind === 'none' || !KINDS[kind] || share === undefined) return null;
  const k = KINDS[kind];
  const n = Math.max(3, Math.round(share * k.count * Math.max(0.2, o.strength) * Math.max(0.6, Math.min(1.6, o.radius * 2.5 + o.height * 0.4))));
  const rng = new Random(o.seed >>> 0 || 1);
  const ys = new Float32Array(n);
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    ys[i] = rng.range(0, o.height);
    seed[i * 4] = rng.range(0, 4);
    seed[i * 4 + 1] = rng.range(0.6, 1.4);
    seed[i * 4 + 2] = rng.range(0, Math.PI * 2);
    seed[i * 4 + 3] = o.radius * Math.sqrt(rng.range(0.15, 1));
  }
  // A unit square, drawn once per particle.
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('aY', new THREE.InstancedBufferAttribute(ys, 1));
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, o.height / 2, 0), o.radius * 2 + o.height);
  const m = material(kind, color, o.height, o.strength);
  const pts = new THREE.Sprite(m);
  pts.geometry = g;
  pts.count = n;
  pts.name = `aura:${kind}`;
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  pts.castShadow = false;
  pts.receiveShadow = false;
  pts.userData.aura = kind;
  pts.userData.auraColor = color;
  // The clock is read once a frame by whichever aura draws first.
  pts.onBeforeRender = tick;
  return pts;
}

/** The look of an aura kind for flat drawers (icons): size, twinkle and drift. */
export function auraStyle(kind: Aura): { size: number; rise: number; twinkle: number; core: number; count: number } | null {
  if (kind === 'none' || !KINDS[kind]) return null;
  const k = KINDS[kind];
  return { size: k.size, rise: k.rise, twinkle: k.twinkle, core: k.core, count: k.count };
}

// ---------------------------------------------------------------------------
// The glow shell.

function shHash(p0: V3): F {
  const p = fract(p0.mul(0.3183099).add(0.1)).mul(17.0);
  return fract(p.x.mul(p.y).mul(p.z).mul(p.x.add(p.y).add(p.z)));
}

/** Value noise, shared by both halves of the shell. */
function shNoise(x: V3): F {
  const i = floor(x).toVar();
  const f0 = fract(x);
  const f = f0.mul(f0).mul(f0.mul(-2.0).add(3.0)).toVar();
  const c = (dx: number, dy: number, dz: number): F => shHash(i.add(vec3(dx, dy, dz)));
  return mix(
    mix(mix(c(0, 0, 0), c(1, 0, 0), f.x), mix(c(0, 1, 0), c(1, 1, 0), f.x), f.y),
    mix(mix(c(0, 0, 1), c(1, 0, 1), f.x), mix(c(0, 1, 1), c(1, 1, 1), f.x), f.y),
    f.z,
  );
}

const shellMats = new Map<string, THREE.MeshBasicNodeMaterial>();

function shellMaterial(color: number, strength: number, thick: number, style: GlowStyle): THREE.MeshBasicNodeMaterial {
  const key = `${style}|${color}|${strength.toFixed(2)}|${thick.toFixed(3)}`;
  let m = shellMats.get(key);
  if (m) return m;
  const uColor = uniform(new THREE.Color(color)) as unknown as V3;
  // Past the bloom threshold at the edges, so the halo spreads.
  const uGain = uniform(0.9 + 1.5 * strength);
  const uThick = uniform(thick);
  const t = auraTime;
  // The skinned surface, in the model's space.
  const obj = positionLocal;
  // Flames and ghost-light stand off the surface in moving tongues.
  let lift: F = float(0.0);
  if (style === 'flame') {
    const f = shNoise(obj.mul(9.0).sub(vec3(0.0, t.mul(2.6), 0.0)));
    lift = f.mul(f).mul(2.6);
  } else if (style === 'spectral') {
    lift = shNoise(obj.mul(5.0).add(vec3(0.0, t.mul(-0.9), t.mul(0.3)))).mul(2.2);
  }
  const mv0 = modelViewMatrix.mul(vec4(obj, 1.0)).xyz;
  const n = transformNormalToView(normalLocal).normalize();
  // Pushed out in view space, so the shell is the same few millimetres
  // whatever scale the item is drawn at.
  const mv = mv0.add(n.mul(uThick).mul(lift.add(1.0)));
  const vN = vary(n);
  const ortho = cameraProjectionMatrix.mul(vec4(0.0, 0.0, 0.0, 1.0)).w.greaterThan(0.5);
  const vV = vary(ortho.select(vec3(0.0, 0.0, 1.0), normalize(mv.negate())));
  const vObj = vary(obj);
  const vLift = vary(lift);

  const facing = abs(dot(normalize(vN), normalize(vV)));
  const rim = pow(facing.oneMinus(), 2.4);
  let col: V3 = uColor;
  let al: F;
  switch (style) {
    case 'rim':
      // A steady halo, breathing.
      al = rim.add(0.05).mul(sin(t.mul(1.9)).mul(0.18).add(0.82));
      break;
    case 'pulse': {
      // Lub-dub, then rest.
      const b = fract(t.mul(0.9));
      const beat = exp(b.mul(-9.0)).add(exp(max(0.0, b.sub(0.2)).mul(-9.0)).mul(0.65).mul(step(0.2, b)));
      al = rim.add(0.04).mul(beat.mul(1.1).add(0.35));
      break;
    }
    case 'flame': {
      // Flickering tongues, hot white-yellow where they are thickest.
      const f = shNoise(vObj.mul(12.0).sub(vec3(0.0, t.mul(3.4), 0.0))).toVar();
      col = mix(uColor, vec3(1.0, 0.86, 0.55), clamp(vLift.mul(0.2).add(f.mul(0.2)), 0.0, 0.5));
      al = rim.add(0.03).add(vLift.mul(0.06)).mul(f.mul(0.6).add(0.5));
      break;
    }
    case 'shimmer': {
      // A band of light sweeping along, and glints winking.
      const b0 = fract(vObj.y.mul(1.6).add(vObj.x.mul(0.6)).mul(0.7).sub(t.mul(0.45)));
      const band = exp(pow(b0.sub(0.5).mul(9.0), 2.0).negate()).toVar();
      const glint = pow(shNoise(vObj.mul(55.0).add(vec3(floor(t.mul(5.0))))), 14.0).mul(5.0).toVar();
      col = mix(uColor, vec3(1.0), band.mul(0.5).add(glint.mul(0.3)));
      al = rim.mul(0.85).add(0.04).add(band.mul(0.75)).add(glint);
      break;
    }
    case 'frost': {
      // Cold and steady, ice crystals catching the light.
      const c = pow(shNoise(vObj.mul(42.0).add(vec3(0.0, floor(t.mul(3.0)), 0.0))), 10.0).mul(4.0).toVar();
      col = mix(uColor, vec3(0.92, 0.97, 1.0), c.mul(0.4).add(0.25));
      al = rim.mul(1.05).add(0.06).add(c);
      break;
    }
    case 'storm': {
      // Arcs crawling over it, the odd flash.
      const tk = floor(t.mul(11.0));
      const r = abs(shNoise(vObj.mul(13.0).add(vec3(0.0, 0.0, tk.mul(1.7)))).mul(2.0).sub(1.0)).oneMinus();
      const arc = pow(r, 14.0).mul(2.4).toVar();
      const flash = step(0.9, shHash(vec3(floor(t.mul(7.0)), 1.3, 2.1))).toVar();
      col = mix(uColor, vec3(1.0), clamp(arc.mul(0.5).add(flash.mul(0.4)), 0.0, 0.8));
      al = rim.mul(flash.mul(0.9).add(0.85)).add(0.03).add(arc);
      break;
    }
    case 'void': {
      // Dark smoke turning through the light.
      const nn = smoothstep(0.25, 0.85, shNoise(vObj.mul(6.0).add(vec3(t.mul(0.35), t.mul(0.2), t.mul(-0.3))))).toVar();
      col = mix(uColor.mul(0.55), mix(uColor, vec3(1.0), 0.35), nn);
      al = rim.mul(1.5).add(0.03).mul(nn.mul(1.2).add(0.4));
      break;
    }
    default: {
      // Spectral: ghost-light rising off it.
      const nn = shNoise(vObj.mul(7.0).sub(vec3(0.0, t.mul(1.2), 0.0)));
      col = mix(uColor, vec3(0.9, 1.0, 1.0), 0.2);
      al = rim.mul(0.9).add(0.04).mul(nn.add(0.35)).add(vLift.mul(0.12));
    }
  }
  m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.fog = false;
  m.vertexNode = cameraProjectionMatrix.mul(vec4(mv, 1.0));
  m.colorNode = col.mul(al).mul(uGain);
  m.name = 'aura:shell';
  m.userData.shared = true;
  shellMats.set(key, m);
  return m;
}

function markShell(o: THREE.Mesh, color: number): void {
  o.name = 'aura:shell';
  o.renderOrder = 3;
  o.castShadow = false;
  o.receiveShadow = false;
  o.userData.aura = 'shell';
  o.userData.auraColor = color;
  o.onBeforeRender = tick;
}

/** Meshes worth outlining: solid ones, not glows, decals or particles of their own. */
function solid(m: THREE.Mesh): boolean {
  if (!m.isMesh || m.userData.aura) return false;
  const mat = m.material as THREE.Material | THREE.Material[];
  const one = Array.isArray(mat) ? mat[0] : mat;
  return !!one && !one.transparent && one.blending === THREE.NormalBlending;
}

/**
 * A glow round a still model (a weapon, a shield, a ring): its solid meshes
 * merged into one shell under `root`, one draw call. `thick` is metres.
 */
export function glowShell(root: THREE.Object3D, color: number, strength: number, thick: number, style: GlowStyle = 'rim'): THREE.Mesh | null {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  const parts: THREE.BufferGeometry[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!solid(m) || (m as unknown as THREE.SkinnedMesh).isSkinnedMesh) return;
    const src = m.geometry;
    const pos = src.getAttribute('position');
    if (!pos) return;
    let g = new THREE.BufferGeometry();
    g.setAttribute('position', pos.clone());
    const nrm = src.getAttribute('normal');
    if (nrm) g.setAttribute('normal', nrm.clone());
    if (src.index) g.setIndex(src.index.clone());
    if (g.index) g = g.toNonIndexed();
    if (!nrm) g.computeVertexNormals();
    rel.multiplyMatrices(inv, m.matrixWorld);
    g.applyMatrix4(rel);
    parts.push(g);
  });
  if (!parts.length) return null;
  const geo = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
  if (parts.length > 1) for (const g of parts) g.dispose();
  if (!geo) return null;
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, shellMaterial(color, strength, thick, style));
  markShell(mesh, color);
  root.add(mesh);
  return mesh;
}

/**
 * A glow round worn armour: a twin of each skinned mesh in `group`, on the
 * same geometry and bones, so it bends with the body. The twins share the
 * piece's geometry; take them off with `removeFromParent`, never dispose.
 */
export function glowTwins(group: THREE.Object3D, color: number, strength: number, thick: number, style: GlowStyle = 'rim'): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const mat = shellMaterial(color, strength, thick, style);
  for (const o of [...group.children]) {
    const m = o as THREE.SkinnedMesh;
    // Worn icon parts are thin (wings, spikes, rings): a shell round them is all glow.
    if (!m.isSkinnedMesh || !solid(m) || m.userData.iconPart) continue;
    const twin = new THREE.SkinnedMesh(m.geometry, mat);
    twin.frustumCulled = false;
    twin.position.copy(m.position);
    twin.quaternion.copy(m.quaternion);
    twin.scale.copy(m.scale);
    markShell(twin, color);
    twin.userData.sharedGeometry = true;
    group.add(twin);
    twin.bind(m.skeleton, m.bindMatrix);
    out.push(twin);
  }
  return out;
}
