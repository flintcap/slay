/**
 * SLAY — the sun's shadow of what never moves, drawn once.
 *
 * Every shadow update drew every caster into the sun's map again: the
 * ground, the baked props, the piles of crates and columns, none of which
 * ever move. Now the still ones are drawn into a map of their own, kept
 * while the sun's camera and those casters stay as they were, and each
 * update starts from a copy of it and draws only what moves (monsters, the
 * hero, loot, effects) on top. The result is the same depth map, pixel for
 * pixel: the copy is exact, and the kept map is drawn again whenever the
 * camera steps (the sun follows the hero in whole metres), a chunk is shown
 * or hidden, or a still caster is moved, changed or taken away.
 *
 * A scene says which of its casters are still with `markStaticShadows`
 * (the map's floor and props, the camp). A marked caster that moves anyway
 * is put back with the moving ones for good, so a wrong guess costs speed,
 * never a wrong shadow. Casters whose shadow follows the hero or the clock
 * (a wall cut away near the hero, a dithered roof, a swaying shape) are
 * never marked.
 *
 * Only lights with `userData.shadowCache` (set by `Renderer.applyShadows`
 * for the sun and moon) use it. Their depth is stored as 32-bit float,
 * since three's default depth format cannot be copied.
 */
import * as THREE from 'three/webgpu';
import { hookSeen } from './ThreeHooks';

interface Still {
  obj: THREE.Object3D;
  matrix: THREE.Matrix4;
  /** Instance matrices (their attribute, version and count), for instanced casters. */
  attr: THREE.BufferAttribute | null;
  version: number;
  count: number;
  /** Shown when the kept map was drawn. */
  shown: boolean;
}

/** What a marked scene keeps: its still casters. */
const stills = new WeakMap<THREE.Object3D, Still[]>();

/** Material fields a solid caster's shadow can depend on (`ShadowNodes.ts`). */
type ShadowMat = THREE.Material & {
  alphaMap?: unknown;
  displacementMap?: unknown;
  positionNode?: unknown;
  castShadowPositionNode?: unknown;
  castShadowNode?: unknown;
  maskNode?: unknown;
  maskShadowNode?: unknown;
  depthNode?: unknown;
};

/** A material whose shadow is the same every frame. */
function steady(m: THREE.Material): boolean {
  const s = m as ShadowMat;
  if (s.transparent || s.alphaTest > 0 || s.alphaMap || s.displacementMap) return false;
  return !(s.positionNode || s.castShadowPositionNode || s.castShadowNode || s.maskNode || s.maskShadowNode || s.depthNode);
}

function eligible(o: THREE.Object3D): boolean {
  const m = o as THREE.Mesh;
  if (!m.isMesh || !m.castShadow || m.userData.shadowOnly) return false;
  if ((m as unknown as THREE.SkinnedMesh).isSkinnedMesh || (m as unknown as THREE.BatchedMesh).isBatchedMesh) return false;
  // Anything held or worn by a body moves with it.
  for (let p = m.parent; p; p = p.parent) if ((p as THREE.Bone).isBone) return false;
  if (Object.keys(m.geometry.morphAttributes).length > 0) return false;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  return mats.every(steady);
}

/** Where `o` stands: shown, hidden, or no longer in `scene` at all. */
function placeOf(o: THREE.Object3D, scene: THREE.Object3D): 'shown' | 'hidden' | 'gone' {
  let shown = true;
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (p === scene) return shown ? 'shown' : 'hidden';
    if (!p.visible) shown = false;
  }
  return 'gone';
}

/**
 * Marks the casters under `root` that never move as still, for `scene`'s
 * kept sun shadow. Call once the root is built and in the scene. Returns
 * how many were marked.
 */
export function markStaticShadows(scene: THREE.Scene, root: THREE.Object3D): number {
  const list = (stills.get(scene) ?? []).filter((s) => placeOf(s.obj, scene) !== 'gone');
  scene.updateMatrixWorld(true);
  let n = 0;
  root.traverse((o) => {
    if (o.userData.staticShadow || !eligible(o)) return;
    o.userData.staticShadow = true;
    const im = o as THREE.InstancedMesh;
    list.push({
      obj: o,
      matrix: o.matrixWorld.clone(),
      attr: im.isInstancedMesh ? im.instanceMatrix : null,
      version: im.isInstancedMesh ? im.instanceMatrix.version : 0,
      count: im.isInstancedMesh ? im.count : 0,
      shown: false,
    });
    n++;
  });
  stills.set(scene, list);
  return n;
}

/**
 * Whether the still casters are as they were when the kept map was drawn.
 * A caster that moved or changed is no longer still; one that left the
 * scene is dropped.
 */
function unchanged(list: Still[], scene: THREE.Object3D): boolean {
  let same = true;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    const where = placeOf(s.obj, scene);
    const im = s.obj as THREE.InstancedMesh;
    // The shader gate swaps an instanced mesh's matrices into a storage
    // attribute on its first draw (`ShaderGate.ts`): same matrices, new version.
    if (im.isInstancedMesh && im.instanceMatrix !== s.attr) {
      s.attr = im.instanceMatrix;
      s.version = im.instanceMatrix.version;
      same = false;
    }
    const moved =
      where === 'gone' ||
      !s.obj.castShadow ||
      !s.matrix.equals(s.obj.matrixWorld) ||
      (im.isInstancedMesh && (im.instanceMatrix.version !== s.version || im.count !== s.count));
    if (moved) {
      delete s.obj.userData.staticShadow;
      list.splice(i, 1);
      same = false;
      continue;
    }
    if ((where === 'shown') !== s.shown) same = false;
  }
  return same;
}

function remember(list: Still[], scene: THREE.Object3D): void {
  for (const s of list) s.shown = placeOf(s.obj, scene) === 'shown';
}

/** Per shadow: the kept map and what it was drawn from. */
interface Kept {
  target: THREE.RenderTarget;
  view: THREE.Matrix4;
  proj: THREE.Matrix4;
  valid: boolean;
  /** The light's own map has been drawn once the ordinary way. */
  primed: boolean;
  size: number;
}

type RenderObjectFn = (
  object: THREE.Object3D,
  scene: THREE.Scene,
  camera: THREE.Camera,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  group: unknown,
  lightsNode: unknown,
  clippingContext: unknown,
  passId?: string,
) => void;

interface ShadowNodeLike {
  light: THREE.Light;
  shadow: THREE.LightShadow;
  shadowMap: THREE.RenderTarget;
  renderShadow(frame: { renderer: THREE.Renderer; scene: THREE.Scene }): void;
  setupRenderTarget(shadow: THREE.LightShadow, builder: unknown): { shadowMap: THREE.RenderTarget; depthTexture: THREE.DepthTexture };
}

const kept = new WeakMap<object, Kept>();
let base: RenderObjectFn | null = null;
const stillOnly: RenderObjectFn = (o, s, c, g, m, gr, l, cc, p) => {
  if (o.userData.staticShadow) base!(o, s, c, g, m, gr, l, cc, p);
};
const movingOnly: RenderObjectFn = (o, s, c, g, m, gr, l, cc, p) => {
  if (!o.userData.staticShadow) base!(o, s, c, g, m, gr, l, cc, p);
};
let installed = false;

/**
 * Teaches three's shadow node to keep still casters' shadows. `gate` is the
 * renderer's shader gate: a kept map drawn while a caster's shader was
 * still being built is missing it, so it is drawn again next time.
 */
export function installShadowCache(gate: { skipped: number } | null): void {
  if (installed) return;
  installed = true;
  const proto = THREE.ShadowNode.prototype as unknown as ShadowNodeLike;
  // Only over three's own (`ThreeHooks.ts`): without them, shadows are drawn every time.
  const found =
    typeof proto.setupRenderTarget === 'function' &&
    typeof proto.renderShadow === 'function' &&
    typeof (THREE.Renderer.prototype as { getRenderObjectFunction?: unknown }).getRenderObjectFunction === 'function';
  if (!hookSeen('ShadowNode.setupRenderTarget, renderShadow', found)) return;

  const setup = proto.setupRenderTarget;
  proto.setupRenderTarget = function (this: ShadowNodeLike, shadow, builder) {
    const out = setup.call(this, shadow, builder);
    if (this.light?.userData.shadowCache) out.depthTexture.type = THREE.FloatType;
    return out;
  };

  const render = proto.renderShadow;
  proto.renderShadow = function (this: ShadowNodeLike, frame) {
    const { light, shadow, shadowMap } = this;
    const { renderer, scene } = frame;
    const fn = renderer.getRenderObjectFunction() as RenderObjectFn | null;
    // `updateShadow` always sets its own draw function first; without one this is not a shadow pass we know.
    const list = fn && light.userData.shadowCache && shadowMap.depthTexture?.type === THREE.FloatType ? stills.get(scene) : undefined;
    const size = shadow.mapSize.width;
    let k = kept.get(this);
    if (k && k.size !== size) {
      k.target.setSize(size, shadow.mapSize.height);
      k.size = size;
      k.valid = false;
      k.primed = false;
    }
    if (!list || list.length === 0 || !k?.primed) {
      render.call(this, frame);
      if (list && list.length > 0) {
        if (!k) {
          const target = new THREE.RenderTarget(size, shadow.mapSize.height);
          target.texture.name = 'ShadowMapKept';
          target.texture.type = shadowMap.texture.type;
          const depth = new THREE.DepthTexture(size, shadow.mapSize.height);
          depth.name = 'ShadowDepthKept';
          depth.type = THREE.FloatType;
          target.depthTexture = depth;
          k = { target, view: new THREE.Matrix4(), proj: new THREE.Matrix4(), valid: false, primed: false, size };
          kept.set(this, k);
          // The kept map lives as long as the light's own: freed with the
          // light, or when three swaps the map for another shadow type.
          const owner = this;
          const mine = k;
          shadowMap.addEventListener('dispose', () => {
            mine.target.dispose();
            if (kept.get(owner) === mine) kept.delete(owner);
          });
        }
        k.primed = true;
      }
      return;
    }

    shadow.updateMatrices(light);
    shadowMap.setSize(shadow.mapSize.width, shadow.mapSize.height, shadowMap.depth);
    const cam = shadow.camera;
    if (!unchanged(list, scene)) k.valid = false;
    if (!k.view.equals(cam.matrixWorldInverse) || !k.proj.equals(cam.projectionMatrix)) k.valid = false;

    const name = scene.name;
    scene.name = `Shadow Map [ ${light.name || 'ID: ' + light.id} ]`;
    base = fn;
    try {
      if (!k.valid) {
        renderer.setRenderTarget(k.target);
        renderer.setRenderObjectFunction(stillOnly as never);
        const before = gate?.skipped ?? 0;
        renderer.render(scene, cam);
        k.valid = !gate || gate.skipped === before;
        k.view.copy(cam.matrixWorldInverse);
        k.proj.copy(cam.projectionMatrix);
        remember(list, scene);
        renderer.setRenderTarget(shadowMap);
      }
      renderer.copyTextureToTexture(k.target.depthTexture!, shadowMap.depthTexture!);
      renderer.setRenderObjectFunction(movingOnly as never);
      const clear = renderer.autoClear;
      renderer.autoClear = false;
      try {
        renderer.render(scene, cam);
      } finally {
        renderer.autoClear = clear;
      }
    } finally {
      renderer.setRenderObjectFunction(fn as never);
      base = null;
      scene.name = name;
    }
  };
}
