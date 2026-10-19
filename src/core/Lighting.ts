/**
 * SLAY — how lights reach the shaders.
 *
 * three.js writes every light into every lit shader by default: the town's
 * twenty-odd torches made each lit fragment shader about 100 KB, and each was
 * compiled for every pipeline that used it. Adding or removing a light also
 * changed every shader, which is why the light pools park idle lights at zero
 * instead of removing them.
 *
 * Here the point and spot lights that cast no shadow are packed into one
 * uniform array and read by one loop, so a shader stays small (about a
 * third) and the count of those lights never changes it. Each frame the loop
 * is handed only the lights that are lit and whose reach touches the view, so
 * a parked light or a torch behind the camera costs a pixel nothing; and the
 * screen is cut into tiles, each with its own list of the lights that can
 * reach it, so a pixel loops over its tile's lights alone.
 *
 * Shadow-casting lights, the sun or moon and the sky light keep three's own
 * path: there are few of them and they do not come and go.
 *
 * Based on three's `DynamicLighting` add-on, which this cannot use as it is:
 * it sorts lights by `constructor.name`, which the release build shortens, so
 * in the built game it batched nothing; and it gives each light property a
 * uniform buffer of its own, which with the world's own passed WebGPU's
 * twelve per shader.
 */
import * as THREE from 'three/webgpu';
import {
  If, Loop, atan, clamp, countOneBits, countTrailingZeros, float, floor, int, positionView, renderGroup, screenUV, smoothstep, storage, uint,
  uniform, vec2, vec3,
} from 'three/tsl';
import { BounceLightNode } from './BounceLight';
import { hookSeen } from './ThreeHooks';

/**
 * The layer of casters that never move (walls, baked props). A torch's
 * shadow is drawn once, when a light takes that torch, from these alone:
 * anything that moves would leave its shadow behind where it stood.
 */
export const STILL_LAYER = 2;

/** Most packed lights drawn at once: the lit ones whose reach touches the view. */
const MAX = 256;
/**
 * The screen is cut into this many tiles across and down, and each tile
 * keeps a list of the lights whose reach can touch it (one bit per light).
 * A pixel loops over its own tile's lights only: in a big fight with dozens
 * of flashes and torches, a pixel lit by two of them shades two.
 */
const TILES_X = 16;
const TILES_Y = 10;
/** 32-bit words per tile's light list. */
const WORDS = MAX / 32;
/**
 * The size of a flame, metres. Light falls off from a ball this wide rather
 * than from a point: a point light's inverse square ran to eleven times its
 * one-metre brightness a hand's width from the torch, which burned the wall
 * behind every sconce to flat white. Past a metre it barely changes.
 */
const FLAME_RADIUS = 0.4;

/** vec4 slots per light: colour and reach, view position and decay, spot direction, cone. */
const STRIDE = 4;

type Lit = THREE.PointLight | THREE.SpotLight;

/**
 * Light in the air: the glow a torch makes in the fog around it. Most lights
 * scattered at once (the nearest to the camera); the quality sets how many
 * of these are used (`setScatterLimit`, 0 turns it off).
 */
const SCATTER = 6;
/** vec4 slots per scattering light: view position and reach, colour times intensity. */
const SCATTER_STRIDE = 2;
const scatterBuf = new THREE.StorageBufferAttribute(new Float32Array(SCATTER * SCATTER_STRIDE * 4), 4);
const scatterArray = storage(scatterBuf, 'vec4', SCATTER * SCATTER_STRIDE).toReadOnly();
const scatterCount = uniform(0, 'int').setGroup(renderGroup);
/** How many lights may scatter this frame (the quality's). */
let scatterLimit = 0;

/** Sets how many lights glow in the fog (0 to `SCATTER`). */
export function setScatterLimit(n: number): void {
  scatterLimit = Math.max(0, Math.min(SCATTER, Math.round(n)));
}

/**
 * True for a light that glows in the fog: the dungeon's torch pool (it marks
 * each with `userData.torch`) and anything marked `userData.scatter`. Never
 * the hero's own light: a glow over the fight would wash it out.
 */
function scatters(l: Lit): boolean {
  return typeof l.userData.torch === 'number' || l.userData.scatter === true;
}

const scatterPick: Array<{ d: number; l: Lit }> = [];
const camPos = new THREE.Vector3();

/** Plain point and spot lights: no shadow, no projected picture, not a node. */
function packable(l: THREE.Light): l is Lit {
  if ((l as unknown as { isNode?: boolean }).isNode || l.castShadow) return false;
  if ((l as THREE.PointLight).isPointLight) return true;
  const s = l as THREE.SpotLight;
  return s.isSpotLight === true && s.map === null && (s as unknown as { colorNode?: unknown }).colorNode === undefined;
}

function put(d: Float32Array, o: number, x: number, y: number, z: number, w: number): void {
  d[o] = x;
  d[o + 1] = y;
  d[o + 2] = z;
  d[o + 3] = w;
}

const frustum = new THREE.Frustum();
const viewProj = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const v = new THREE.Vector3();
const t = new THREE.Vector3();
const corner = new THREE.Vector3();

/**
 * The screen tiles (as uv, 0..1 from the top left) a light's reach can touch,
 * from its view-space centre and radius: the box round the sphere, projected.
 * A sphere reaching past the near plane covers the whole screen.
 */
function tileRect(c: THREE.Vector3, r: number, cam: THREE.Camera, out: Int32Array): void {
  const near = (cam as THREE.PerspectiveCamera).near ?? 0.1;
  if (!(cam as THREE.OrthographicCamera).isOrthographicCamera && c.z + r > -near) {
    out[0] = 0;
    out[1] = 0;
    out[2] = TILES_X - 1;
    out[3] = TILES_Y - 1;
    return;
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let k = 0; k < 8; k++) {
    corner.set(c.x + (k & 1 ? r : -r), c.y + (k & 2 ? r : -r), c.z + (k & 4 ? r : -r)).applyMatrix4(cam.projectionMatrix);
    const u = corner.x * 0.5 + 0.5;
    const w = 0.5 - corner.y * 0.5;
    if (u < x0) x0 = u;
    if (u > x1) x1 = u;
    if (w < y0) y0 = w;
    if (w > y1) y1 = w;
  }
  out[0] = Math.max(0, Math.floor(x0 * TILES_X));
  out[1] = Math.max(0, Math.floor(y0 * TILES_Y));
  out[2] = Math.min(TILES_X - 1, Math.floor(x1 * TILES_X));
  out[3] = Math.min(TILES_Y - 1, Math.floor(y1 * TILES_Y));
}
const rect = new Int32Array(4);

/** Every packed light in one array and one loop. */
class PackedLightsNode extends THREE.Node {
  lights: Lit[] = [];
  /**
   * A storage buffer, not a uniform array: a uniform array is copied into
   * every shader that reads it (the town's lit shaders made some 26 copies,
   * each sent to the GPU every frame), where this is one buffer they share,
   * sent once a frame and only as far as the lights in view fill it.
   */
  private readonly buf = new THREE.StorageBufferAttribute(new Float32Array(MAX * STRIDE * 4), 4);
  private readonly array = storage(this.buf, 'vec4', MAX * STRIDE).toReadOnly();
  /** Each screen tile's lights, a bit per light (`TILES_X`, `WORDS`). */
  private readonly maskBuf = new THREE.StorageBufferAttribute(new Uint32Array(TILES_X * TILES_Y * WORDS), 1);
  private readonly masks = storage(this.maskBuf, 'uint', TILES_X * TILES_Y * WORDS).toReadOnly();
  /** Words of each tile's list in use this frame. */
  private readonly words = uniform(0, 'int').setGroup(renderGroup);

  /** Whether the last update sent any light (the masks must be cleared once after). */
  private hadLights = false;

  constructor() {
    super();
    this.updateType = THREE.NodeUpdateType.RENDER;
  }

  override update(frame: THREE.NodeFrame): undefined {
    const cam = frame.camera;
    if (!cam) return;
    frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse), cam.coordinateSystem);
    let n = 0;
    scatterPick.length = 0;
    camPos.setFromMatrixPosition(cam.matrixWorld);
    const masks = this.maskBuf.array as Uint32Array;
    masks.fill(0);
    for (const l of this.lights) {
      if (n >= MAX) break;
      if (l.intensity <= 0) continue;
      v.setFromMatrixPosition(l.matrixWorld);
      if (l.distance > 0) {
        sphere.center.copy(v);
        sphere.radius = l.distance;
        if (!frustum.intersectsSphere(sphere)) continue;
      }
      if (scatterLimit > 0 && scatters(l)) scatterPick.push({ d: v.distanceToSquared(camPos), l });
      const d = this.buf.array as Float32Array;
      const o = n * STRIDE * 4;
      put(d, o, l.color.r * l.intensity, l.color.g * l.intensity, l.color.b * l.intensity, l.distance);
      v.applyMatrix4(cam.matrixWorldInverse);
      put(d, o + 4, v.x, v.y, v.z, l.decay);
      // Into the list of every tile its reach can touch (all of them for a
      // light with no reach).
      if (l.distance > 0) tileRect(v, l.distance, cam, rect);
      else rect.set([0, 0, TILES_X - 1, TILES_Y - 1]);
      const word = n >> 5;
      const bit = (1 << (n & 31)) >>> 0;
      for (let ty = rect[0 + 1]!; ty <= rect[3]!; ty++) {
        for (let tx = rect[0]!; tx <= rect[2]!; tx++) masks[(ty * TILES_X + tx) * WORDS + word]! |= bit;
      }
      const s = l as THREE.SpotLight;
      if (s.isSpotLight) {
        v.setFromMatrixPosition(s.matrixWorld);
        t.setFromMatrixPosition(s.target.matrixWorld);
        v.sub(t).transformDirection(cam.matrixWorldInverse);
        put(d, o + 8, v.x, v.y, v.z, 0);
        put(d, o + 12, Math.cos(s.angle), Math.cos(s.angle * (1 - s.penumbra)), 0, 0);
      } else {
        // A point light: a cone wider than any angle.
        put(d, o + 8, 0, 0, 1, 0);
        put(d, o + 12, -3, -2, 0, 0);
      }
      n++;
    }
    this.words.value = (n + 31) >> 5;
    this.updateScatter(cam);
    // Only the slots the loop reads this time go up.
    if (n > 0) {
      this.buf.clearUpdateRanges();
      this.buf.addUpdateRange(0, n * STRIDE * 4);
      this.buf.needsUpdate = true;
    }
    if (n > 0 || this.hadLights) this.maskBuf.needsUpdate = true;
    this.hadLights = n > 0;
    return undefined;
  }

  /** The nearest scattering lights in view, into the shared scatter buffer. */
  private updateScatter(cam: THREE.Camera): void {
    let k = 0;
    if (scatterPick.length > 0) {
      scatterPick.sort((a, b) => a.d - b.d);
      const d = scatterBuf.array as Float32Array;
      for (const { l } of scatterPick) {
        if (k >= scatterLimit) break;
        v.setFromMatrixPosition(l.matrixWorld).applyMatrix4(cam.matrixWorldInverse);
        const o = k * SCATTER_STRIDE * 4;
        put(d, o, v.x, v.y, v.z, l.distance);
        put(d, o + 4, l.color.r * l.intensity, l.color.g * l.intensity, l.color.b * l.intensity, 0);
        k++;
      }
      if (k > 0) {
        scatterBuf.clearUpdateRanges();
        scatterBuf.addUpdateRange(0, k * SCATTER_STRIDE * 4);
        scatterBuf.needsUpdate = true;
      }
    }
    scatterCount.value = k;
  }

  override setup(builder: THREE.NodeBuilder): null {
    const ctx = builder.context as unknown as {
      positionView?: THREE.Node<'vec3'>;
      lightingModel: THREE.LightingModel;
      reflectedLight: { directDiffuse: THREE.Node<'vec3'>; directSpecular: THREE.Node<'vec3'> };
    };
    const surface = ctx.positionView ?? positionView;
    const diffuse = vec3(0).toVar('packedDiffuse');
    const specular = vec3(0).toVar('packedSpecular');
    const shade = (i: THREE.Node<'int'>): void => {
      const base = i.mul(STRIDE);
      const colorReach = this.array.element(base);
      const posDecay = this.array.element(base.add(1));
      const spot = this.array.element(base.add(2));
      const toLight = posDecay.xyz.sub(surface).toVar();
      const reach = colorReach.w;
      // A pixel past a light's reach gets nothing from it: skip the shading
      // rather than work it out and scale it by zero. A tile's list holds
      // every light that touches any of its pixels, so some of each list
      // misses any one pixel.
      If(reach.equal(0).or(toLight.dot(toLight).lessThan(reach.mul(reach))), () => {
        const lightDirection = toLight.normalize().toVar();
        // 1 / (d² + r²) raised to decay / 2, faded out smoothly to nothing at
        // the light's reach (the same window as three's own falloff).
        const d2 = toLight.dot(toLight);
        const core = d2.add(FLAME_RADIUS * FLAME_RADIUS).pow(posDecay.w.mul(-0.5));
        const edge = d2.div(reach.mul(reach).max(1e-4)).pow2().oneMinus().clamp().pow2();
        const fall = reach.greaterThan(0).select(core.mul(edge), core.mul(float(1)));
        const cone = this.array.element(base.add(3));
        const lightColor = colorReach.xyz.mul(fall).mul(smoothstep(cone.x, cone.y, lightDirection.dot(spot.xyz))).toVar();
        ctx.lightingModel.direct(
          {
            lightDirection,
            lightColor,
            lightNode: { light: {}, shadowNode: null },
            reflectedLight: { directDiffuse: diffuse, directSpecular: specular },
          } as never,
          builder,
        );
      });
    };
    // This pixel's tile, and the lights on its list.
    const cell = clamp(floor(screenUV.mul(vec2(TILES_X, TILES_Y))), vec2(0, 0), vec2(TILES_X - 1, TILES_Y - 1));
    const first = int(cell.y.mul(TILES_X).add(cell.x)).mul(WORDS).toVar();
    Loop(this.words, ({ i: w }: { i: THREE.Node<'int'> }) => {
      const bits = this.masks.element(first.add(w)).toVar();
      // Once per set bit: the lowest set bit is the next light, then cleared.
      Loop(int(countOneBits(bits) as unknown as THREE.Node<'uint'>), () => {
        shade(w.mul(32).add(int(countTrailingZeros(bits) as unknown as THREE.Node<'uint'>)).toVar());
        bits.assign(bits.bitAnd(bits.sub(uint(1))));
      });
    });
    ctx.reflectedLight.directDiffuse.addAssign(diffuse);
    ctx.reflectedLight.directSpecular.addAssign(specular);
    return null;
  }
}

const ownNodes = new WeakMap<THREE.Light, THREE.Node>();
const bounce = new BounceLightNode();

class PackedLights extends THREE.LightsNode {
  private readonly packed = new PackedLightsNode();

  override customCacheKey(): number {
    // Only the lights on three's own path shape the shader.
    const parts: number[] = [1];
    for (const l of this.getLights()) if (!packable(l)) parts.push(l.id, l.castShadow ? 1 : 0);
    return THREE.NodeUtils.hashArray(parts);
  }

  override setupLightsNode(builder: THREE.NodeBuilder): THREE.LightingNode[] {
    // The material's own light comes first, as in three's: the sky
    // reflection, its occlusion and any light map. Leaving these out drew
    // every surface without its sky fill.
    const mine = (builder.context as unknown as { materialLightings?: THREE.LightingNode[] }).materialLightings;
    const own = hookSeen('lighting context: materialLightings', mine !== undefined) ? mine! : [];
    const out: THREE.LightingNode[] = [...own];
    for (const l of [...this.getLights()].sort((a, b) => a.id - b.id)) {
      if (packable(l)) continue;
      if ((l as unknown as { isNode?: boolean }).isNode) {
        out.push(l as unknown as THREE.LightingNode);
        continue;
      }
      let node = ownNodes.get(l);
      if (!node) {
        const Cls = builder.renderer.library.getLightNodeClass(l.constructor as new () => THREE.Light);
        if (!Cls) continue;
        node = new Cls(l);
        ownNodes.set(l, node);
      }
      out.push(node as THREE.LightingNode);
    }
    out.push(this.packed as unknown as THREE.LightingNode);
    // The level's bounced light, as soft fill (`BounceLight.ts`).
    out.push(bounce);
    return out;
  }

  override setLights(lights: THREE.Light[]): this {
    super.setLights(lights);
    this.packed.lights = lights.filter(packable);
    return this;
  }

  override get hasLights(): boolean {
    return true;
  }
}

const plain = new THREE.LightsNode();

class PackedLighting extends THREE.Lighting {
  private readonly nodes = new WeakMap<THREE.Scene, THREE.LightsNode>();

  override createNode(lights: THREE.Light[] = []): THREE.LightsNode {
    return new PackedLights().setLights(lights);
  }

  override getNode(scene: THREE.Scene): THREE.LightsNode {
    if ((scene as unknown as { isQuadMesh?: boolean }).isQuadMesh) return plain;
    let node = this.nodes.get(scene);
    if (!node) {
      node = this.createNode();
      this.nodes.set(scene, node);
    }
    return node;
  }
}

/** The lighting the game's renderer draws with. */
export function makeLighting(): THREE.Lighting {
  return new PackedLighting();
}

/**
 * The light the fog between the camera and this pixel catches from the
 * scattering lights, times `density` (the fog's own). Worked out exactly for
 * a point light in even fog: along a ray at distance h from the light, the
 * inverse square sums to (atan(t1 / h) - atan(t0 / h)) / h. A few lights,
 * a handful of sums each: a soft glow round every torch with no extra pass.
 * Fades out over each light's reach, as the light itself does.
 */
export function airLight(density: THREE.Node<'float'>): THREE.Node<'vec3'> {
  const sum = vec3(0).toVar('airLight');
  const P = positionView;
  const len = P.length().max(1e-3).toVar();
  const dir = P.div(len).toVar();
  Loop(scatterCount, ({ i }: { i: THREE.Node<'int'> }) => {
    const base = i.mul(SCATTER_STRIDE);
    const posReach = scatterArray.element(base);
    const col = scatterArray.element(base.add(1));
    const L = posReach.xyz;
    const t = L.dot(dir).toVar();
    const h2 = L.dot(L).sub(t.mul(t)).max(0.04).toVar();
    const h = h2.sqrt();
    // From the camera (t0 = -t) to the pixel (t1 = len - t), in the light's frame.
    const glow = atan(len.sub(t).div(h)).sub(atan(t.negate().div(h))).div(h);
    // Only the air within the light's reach glows, fading at the edge.
    const fade = smoothstep(posReach.w.mul(posReach.w), float(0), h2);
    sum.addAssign(col.xyz.mul(glow.mul(fade)));
  });
  return sum.mul(density);
}

/** The scattering lights, for anything else drawn in them (`Motes`). */
export const scatterLights = {
  array: scatterArray,
  count: scatterCount,
  stride: SCATTER_STRIDE,
  max: SCATTER,
};
