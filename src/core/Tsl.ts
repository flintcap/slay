/**
 * SLAY — small shared pieces for shaders written in TSL (three.js's node
 * shading language), so the hand-built materials speak the same dialect.
 *
 * TSL builds a shader graph in JavaScript, and three.js writes it out as
 * WGSL for WebGPU or GLSL for the WebGL2 fallback. Helpers here are plain
 * functions that return nodes: each call inlines its graph where it is used.
 *
 * Every `select` here is written `.select(a, b).uniformFlow().toVar()`. A bare
 * `select` becomes an if/else in the shader, and a value both branches share
 * is then worked out only inside the first branch that reads it: the other
 * branch reads zero. Particles stood still and outdoor ground lost its
 * texture that way. With `uniformFlow` both sides are worked out up front
 * and the pick is a plain WGSL `select`. `toVar` keeps the pick in one
 * variable: a `uniformFlow` pick read a second time came back as a name that
 * was never written (half of every stretched spark faced the wrong way).
 */
import * as THREE from 'three/webgpu';
import {
  abs, cross, dFdx, dFdy, dot, floor, fract, mix, normalViewGeometry, normalize, positionView, pow,
  screenCoordinate, sign, sin, texture, varying, vec2, vec3,
} from 'three/tsl';

export type F = THREE.Node<'float'>;
export type V2 = THREE.Node<'vec2'>;
export type V3 = THREE.Node<'vec3'>;
export type V4 = THREE.Node<'vec4'>;

/** A value worked out per vertex and handed to the pixels, keeping its type. */
export function vary<T extends THREE.Node>(n: T): T {
  return varying(n) as unknown as T;
}

/** Cheap 2D hash in 0..1. */
export function hash2(p: V2): F {
  const q = fract(p.mul(vec2(123.34, 456.21)));
  const r = q.add(dot(q, q.add(45.32)));
  return fract(r.x.mul(r.y));
}

/** Smooth value noise in 0..1. */
export function noise2(p: V2): F {
  const i = floor(p);
  const f0 = fract(p);
  const f = f0.mul(f0).mul(f0.mul(-2.0).add(3.0));
  const a = hash2(i);
  const b = hash2(i.add(vec2(1.0, 0.0)));
  const c = hash2(i.add(vec2(0.0, 1.0)));
  const d = hash2(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/** The classic per-pixel dither threshold in 0..1, for dissolves and cutaways. */
export function pixelDither(): F {
  return fract(sin(dot(screenCoordinate.xy, vec2(12.9898, 78.233))).mul(43758.5453));
}

/**
 * Hand-built node materials keep the classic material's properties (colour,
 * roughness, emissive, maps), so they are typed as the classic material and
 * callers stay unchanged. The renderer draws classic materials through the
 * same node path.
 */
export function asStandard(m: THREE.MeshStandardNodeMaterial): THREE.MeshStandardMaterial {
  return m as unknown as THREE.MeshStandardMaterial;
}

export function asPhysical(m: THREE.MeshPhysicalNodeMaterial): THREE.MeshPhysicalMaterial {
  return m as unknown as THREE.MeshPhysicalMaterial;
}

export function asBasic(m: THREE.MeshBasicNodeMaterial): THREE.MeshBasicMaterial {
  return m as unknown as THREE.MeshBasicMaterial;
}

/** True for a standard or physical material, classic or node. */
export function isStandardLike(m: unknown): m is THREE.MeshStandardMaterial {
  const x = m as { isMeshStandardMaterial?: boolean; isMeshStandardNodeMaterial?: boolean } | null;
  return !!x && (x.isMeshStandardMaterial === true || x.isMeshStandardNodeMaterial === true);
}

/** Adds a discard test to a node material's mask (kept where the mask is true). */
export function andMask(mat: THREE.NodeMaterial, keep: THREE.Node<'bool'>): void {
  const prev = mat.maskNode as THREE.Node<'bool'> | null;
  mat.maskNode = prev ? prev.and(keep) : keep;
}

/**
 * A reference to a property of the material being drawn, read per draw.
 *
 * It reads through the material, not a captured object, so a cloned
 * material reads its own. In a pass that swaps the material out (the shadow
 * pass draws every caster with one shared material, and still evaluates the
 * caster's colour node for its alpha), the stand-in has no such property:
 * then it reads the mesh's own material instead. When neither has it (a
 * struck monster wears the hit flash's plain material for a few frames, and
 * the shadow pass still draws it with the monster's graph), it reads a
 * neutral default: a missing value is an error inside the renderer, part
 * way through the shadow pass, and the screen stayed black after one.
 */
class SourceMaterialReference extends THREE.MaterialReferenceNode {
  private stand: Record<string, unknown> | null = null;

  constructor(property: string, private readonly slType: string) {
    super(property, slType);
  }

  override updateReference(state: THREE.NodeFrame): unknown {
    // Runs for every input of every draw, so it allocates nothing.
    const p = this.property;
    let ref: unknown = (this as unknown as { material: THREE.Material | null }).material ?? state.material;
    if (!hasInput(ref, p)) {
      const om = (state.object as THREE.Mesh | null)?.material;
      let src: unknown = om;
      if (Array.isArray(om)) {
        src = undefined;
        for (const m of om) if (hasInput(m, p)) { src = m; break; }
      }
      if (!hasInput(src, p)) {
        // Its own material drawn without the input its graph reads is a bug
        // (a copy that lost its inputs drew black); a pass's stand-in is not.
        if (state.material && state.material === om) warnMissing(state.material, p);
        ref = this.stand ??= { [p]: neutral(this.slType) };
      } else ref = src;
    }
    this.reference = ref as THREE.Material;
    return ref;
  }
}

function hasInput(m: unknown, p: string): boolean {
  return !!m && (m as Record<string, unknown>)[p] !== undefined;
}

const warned = new Set<string>();
function warnMissing(m: THREE.Material, prop: string): void {
  const key = `${m.name}|${prop}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[materials] "${m.name || m.type}" is drawn with a shared graph but has no ${prop}`);
}

/** The value a material property reads when no material has it. */
function neutral(type: string): unknown {
  if (type === 'color') return new THREE.Color(0);
  if (type === 'vec2') return new THREE.Vector2();
  if (type === 'vec3') return new THREE.Vector3();
  if (type === 'vec4') return new THREE.Vector4();
  return 0;
}

function matRef(name: string, type: string): THREE.Node {
  return new SourceMaterialReference(name, type) as unknown as THREE.Node;
}

export function matFloat(name: string): F {
  return matRef(name, 'float') as unknown as F;
}

export function matColor(name: string): V3 {
  return matRef(name, 'color') as unknown as V3;
}

export function matVec2(name: string): V2 {
  return matRef(name, 'vec2') as unknown as V2;
}

/**
 * Inputs a shared graph reads from each material (`matFloat`, `matTexture`)
 * are kept on it as `sl*` properties. Copies carry them, as they carry the
 * material's own colour and maps, so a clone (a hit flash, a see-through
 * twin) draws like its original.
 *
 * A node material's `copy` does not call the base material's: it copies
 * only the properties a new material already has, which leaves out every
 * `sl*` input. So both are wrapped. Without it the hero's own copies of its
 * gear (Player.ownMaterial) had no inputs and drew black.
 */
const SL_INPUT = /^sl[A-Z]/;
function carryInputs(proto: { copy(source: THREE.Material): unknown }): void {
  const base = proto.copy;
  proto.copy = function (this: THREE.Material, source: THREE.Material) {
    base.call(this, source);
    const from = source as unknown as Record<string, unknown>;
    const to = this as unknown as Record<string, unknown>;
    for (const k of Object.keys(from)) if (SL_INPUT.test(k)) to[k] = from[k];
    return this;
  };
}
carryInputs(THREE.Material.prototype);
carryInputs(THREE.NodeMaterial.prototype);

/** The drawn material's own value of `prop`, or the mesh's when a pass swapped the material out. */
function sourceValue(state: THREE.NodeFrame, prop: string): unknown {
  const own = (state.material as unknown as Record<string, unknown> | null)?.[prop];
  if (own !== undefined) return own;
  const om = (state.object as THREE.Mesh | null)?.material;
  for (const m of Array.isArray(om) ? om : [om]) {
    const v = (m as unknown as Record<string, unknown> | undefined)?.[prop];
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * A texture node that samples the texture in the drawn material's `prop`,
 * looked up per draw like `matFloat`. Every sample of it (`texture(node, uv)`
 * copies it) reads the same lookup.
 */
class MaterialTextureNode extends THREE.TextureNode {
  slProp = '';

  override setup(builder: THREE.NodeBuilder): THREE.Node | null | undefined {
    const out = super.setup(builder);
    this.updateType = THREE.NodeUpdateType.OBJECT;
    return out;
  }

  override update(frame: THREE.NodeFrame): boolean | undefined {
    const t = sourceValue(frame, this.slProp) as THREE.Texture | undefined;
    if (t?.isTexture) this.value = t;
    return super.update(frame);
  }

  override clone(): this {
    const n = super.clone() as this;
    n.slProp = this.slProp;
    return n;
  }
}

/**
 * The texture in material property `prop`, as a node to sample. One graph
 * built with it serves every material that sets the property, so materials
 * that differ only in their maps share one shader build. `placeholder` is
 * read until a material is drawn.
 */
export function matTexture(prop: string, placeholder: THREE.Texture): THREE.TextureNode {
  const n = new MaterialTextureNode(placeholder);
  n.slProp = prop;
  return n;
}

/** Three planar taps of a normal map (and maybe an albedo), weighted by a normal. */
export interface TriSample {
  W: V3;
  nx: V4;
  ny: V4;
  nz: V4;
  /** Roughness from the normal map's alpha, blended. */
  rough: F;
  albedo: V4 | null;
}

/** Samples `normal` (and `albedo`) on the three planes through `P`, weighted by `N`. */
export function triSample(P: V3, N: V3, normal: THREE.Texture | THREE.TextureNode, albedo?: THREE.Texture | THREE.TextureNode | null): TriSample {
  const w0 = pow(abs(N), vec3(4.0));
  const W = w0.div(w0.x.add(w0.y).add(w0.z)).toVar();
  const nx = texture(normal, P.zy).toVar();
  const ny = texture(normal, P.xz).toVar();
  const nz = texture(normal, P.xy).toVar();
  const a = albedo
    ? texture(albedo, P.zy).mul(W.x).add(texture(albedo, P.xz).mul(W.y)).add(texture(albedo, P.xy).mul(W.z)).toVar()
    : null;
  return { W, nx, ny, nz, rough: nx.a.mul(W.x).add(ny.a.mul(W.y)).add(nz.a.mul(W.z)), albedo: a };
}

/** Whiteout blend of the three tangent-space normals onto the normal `N`. */
export function whiteout(t: TriSample, N: V3, scale: F | number): V3 {
  const ns = vec3(scale, scale, 1.0);
  const tx0 = t.nx.xyz.mul(2.0).sub(1.0).mul(ns);
  const ty0 = t.ny.xyz.mul(2.0).sub(1.0).mul(ns);
  const tz0 = t.nz.xyz.mul(2.0).sub(1.0).mul(ns);
  const tx = vec3(tx0.xy.add(N.zy), abs(tx0.z).mul(N.x));
  const ty = vec3(ty0.xy.add(N.xz), abs(ty0.z).mul(N.y));
  const tz = vec3(tz0.xy.add(N.xy), abs(tz0.z).mul(N.z));
  return normalize(tx.zyx.mul(t.W.x).add(ty.xzy.mul(t.W.y)).add(tz.mul(t.W.z)));
}

/**
 * Carries a bind-space direction onto the drawn (skinned, view-space)
 * surface. Within a triangle the bind position and the drawn position are
 * both linear, so their screen derivatives give the triangle's own linear
 * map, and the bind normal maps onto the drawn normal: three pairs, one
 * 3x3 map, solved per pixel. Works the same with or without skinning.
 */
export function bindToView(v: V3, Pb: V3, Nb: V3): V3 {
  const a = dFdx(Pb);
  const b = dFdy(Pb);
  const pa = dFdx(positionView);
  const pb = dFdy(positionView);
  const pc = normalViewGeometry;
  const bc = cross(b, Nb);
  const ca = cross(Nb, a);
  const ab = cross(a, b);
  const det = dot(a, bc);
  const w = vec3(dot(bc, v), dot(ca, v), dot(ab, v)).mul(sign(det));
  const r = pa.mul(w.x).add(pb.mul(w.y)).add(pc.mul(w.z)).toVar();
  return dot(r, r).greaterThan(1e-30).select(normalize(r), pc).uniformFlow().toVar();
}

/**
 * Textures a material samples inside its nodes, where `Renderer.upload`
 * cannot see them. Kept beside the material rather than in `userData`, which
 * three.js copies through JSON on every clone.
 */
const nodeTex = new WeakMap<THREE.Material, THREE.Texture[]>();

export function setNodeTextures(m: THREE.Material, list: readonly (THREE.Texture | null | undefined)[]): void {
  nodeTex.set(m, list.filter((t): t is THREE.Texture => !!t));
}

/** A clone keeps its original's node textures (cloning copies the nodes). */
export function copyNodeTextures(from: THREE.Material, to: THREE.Material): void {
  const list = nodeTex.get(from);
  if (list) nodeTex.set(to, list);
}

export function nodeTexturesOf(m: THREE.Material): readonly THREE.Texture[] {
  return nodeTex.get(m) ?? [];
}
