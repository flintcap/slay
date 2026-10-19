/**
 * SLAY — bounced light as fill on every lit surface.
 *
 * The level bakes how much light its floors throw back (`world/Bounce.ts`)
 * into a small map, one texel a tile; every lit shader reads it once, from a
 * point pushed off the surface along its normal, and adds it to its indirect
 * light. With no level baked the map is black and the gain zero.
 */
import * as THREE from 'three/webgpu';
import { normalWorld, positionWorld, texture, uniform, vec2 } from 'three/tsl';

/** Where a baked map lies: tiles across and down, tile (0, 0)'s centre and metres per tile. */
export interface BounceFrame {
  width: number;
  height: number;
  x0: number;
  z0: number;
  tile: number;
}

const empty = new THREE.DataTexture(new Uint16Array(4), 1, 1, THREE.RGBAFormat, THREE.HalfFloatType);
empty.needsUpdate = true;
const uMap = texture(empty);
/** World x, z of the map's (0, 0) corner, and 1 / its size in metres. */
const uRect = uniform(new THREE.Vector4(0, 0, 1, 1));
const uGain = uniform(0);
let current: THREE.DataTexture | null = null;

/** How far off the surface along its normal the fill is read, metres. */
const LOOK_OUT = 0.8;

/**
 * Hands every lit surface a level's bounce (`bakeBounce`), or none. `gain`
 * scales it (0 turns it off; every shader still reads the map, a single tap).
 */
export function setBounce(g: BounceFrame | null, field: Float32Array | null, gain = 1): void {
  current?.dispose();
  current = null;
  if (!g || !field) {
    uMap.value = empty;
    uGain.value = 0;
    return;
  }
  const W = g.width;
  const H = g.height;
  const data = new Uint16Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = THREE.DataUtils.toHalfFloat(field[i * 3]!);
    data[i * 4 + 1] = THREE.DataUtils.toHalfFloat(field[i * 3 + 1]!);
    data[i * 4 + 2] = THREE.DataUtils.toHalfFloat(field[i * 3 + 2]!);
    data[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  current = tex;
  uMap.value = tex;
  // Texel centres sit on tile centres.
  uRect.value.set(g.x0 - g.tile * 0.5, g.z0 - g.tile * 0.5, 1 / (W * g.tile), 1 / (H * g.tile));
  uGain.value = gain;
}

/** The bounce as light: soft fill added to every lit surface's indirect light. */
export class BounceLightNode extends THREE.LightingNode {
  override setup(builder: THREE.NodeBuilder): null {
    const ctx = builder.context as unknown as { irradiance?: THREE.Node<'vec3'> & { addAssign(n: THREE.Node): void } };
    if (!ctx.irradiance) return null;
    const N = normalWorld;
    const at = positionWorld.xz.add(N.xz.mul(LOOK_OUT)).sub(vec2(uRect.x, uRect.y)).mul(vec2(uRect.z, uRect.w));
    // Floors catch least of it (it came off them); walls and undersides most.
    const facing = N.y.mul(-0.35).add(0.75);
    ctx.irradiance.addAssign(uMap.sample(at).rgb.mul(uGain).mul(facing));
    return null;
  }
}
