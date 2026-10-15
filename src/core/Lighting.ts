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
 * a parked light or a torch behind the camera costs a pixel nothing.
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
import { If, Loop, getDistanceAttenuation, positionView, renderGroup, smoothstep, uniform, uniformArray, vec3 } from 'three/tsl';

/** Most packed lights drawn at once: the lit ones whose reach touches the view. */
const MAX = 64;
/** vec4 slots per light: colour and reach, view position and decay, spot direction, cone. */
const STRIDE = 4;

type Lit = THREE.PointLight | THREE.SpotLight;

/** Plain point and spot lights: no shadow, no projected picture, not a node. */
function packable(l: THREE.Light): l is Lit {
  if ((l as unknown as { isNode?: boolean }).isNode || l.castShadow) return false;
  if ((l as THREE.PointLight).isPointLight) return true;
  const s = l as THREE.SpotLight;
  return s.isSpotLight === true && s.map === null && (s as unknown as { colorNode?: unknown }).colorNode === undefined;
}

const frustum = new THREE.Frustum();
const viewProj = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const v = new THREE.Vector3();
const t = new THREE.Vector3();

/** Every packed light in one array and one loop. */
class PackedLightsNode extends THREE.Node {
  lights: Lit[] = [];
  private readonly data: THREE.Vector4[] = [];
  private readonly array: THREE.UniformArrayNode<'vec4'>;
  private readonly count = uniform(0, 'int').setGroup(renderGroup);

  constructor() {
    super();
    for (let i = 0; i < MAX * STRIDE; i++) this.data.push(new THREE.Vector4());
    this.array = uniformArray<'vec4'>(this.data, 'vec4').setGroup(renderGroup);
    this.updateType = THREE.NodeUpdateType.RENDER;
  }

  override update(frame: THREE.NodeFrame): undefined {
    const cam = frame.camera;
    if (!cam) return;
    frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse), cam.coordinateSystem);
    let n = 0;
    for (const l of this.lights) {
      if (n >= MAX) break;
      if (l.intensity <= 0) continue;
      v.setFromMatrixPosition(l.matrixWorld);
      if (l.distance > 0) {
        sphere.center.copy(v);
        sphere.radius = l.distance;
        if (!frustum.intersectsSphere(sphere)) continue;
      }
      const d = this.data;
      const o = n * STRIDE;
      d[o]!.set(l.color.r * l.intensity, l.color.g * l.intensity, l.color.b * l.intensity, l.distance);
      v.applyMatrix4(cam.matrixWorldInverse);
      d[o + 1]!.set(v.x, v.y, v.z, l.decay);
      const s = l as THREE.SpotLight;
      if (s.isSpotLight) {
        v.setFromMatrixPosition(s.matrixWorld);
        t.setFromMatrixPosition(s.target.matrixWorld);
        v.sub(t).transformDirection(cam.matrixWorldInverse);
        d[o + 2]!.set(v.x, v.y, v.z, 0);
        d[o + 3]!.set(Math.cos(s.angle), Math.cos(s.angle * (1 - s.penumbra)), 0, 0);
      } else {
        // A point light: a cone wider than any angle.
        d[o + 2]!.set(0, 0, 1, 0);
        d[o + 3]!.set(-3, -2, 0, 0);
      }
      n++;
    }
    this.count.value = n;
    return undefined;
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
    Loop(this.count, ({ i }: { i: THREE.Node<'int'> }) => {
      const base = i.mul(STRIDE);
      const colorReach = this.array.element(base);
      const posDecay = this.array.element(base.add(1));
      const spot = this.array.element(base.add(2));
      const toLight = posDecay.xyz.sub(surface).toVar();
      const reach = colorReach.w;
      // A pixel past a light's reach gets nothing from it: skip the shading
      // rather than work it out and scale it by zero. Most of the screen is
      // in reach of only a torch or two.
      If(reach.equal(0).or(toLight.dot(toLight).lessThan(reach.mul(reach))), () => {
        const lightDirection = toLight.normalize().toVar();
        const fall = getDistanceAttenuation({ lightDistance: toLight.length(), cutoffDistance: reach, decayExponent: posDecay.w });
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
    });
    ctx.reflectedLight.directDiffuse.addAssign(diffuse);
    ctx.reflectedLight.directSpecular.addAssign(specular);
    return null;
  }
}

const ownNodes = new WeakMap<THREE.Light, THREE.Node>();

class PackedLights extends THREE.LightsNode {
  private readonly packed = new PackedLightsNode();

  override customCacheKey(): number {
    // Only the lights on three's own path shape the shader.
    const parts: number[] = [1];
    for (const l of this.getLights()) if (!packable(l)) parts.push(l.id, l.castShadow ? 1 : 0);
    return THREE.NodeUtils.hashArray(parts);
  }

  override setupLightsNode(builder: THREE.NodeBuilder): THREE.LightingNode[] {
    const out: THREE.LightingNode[] = [];
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
