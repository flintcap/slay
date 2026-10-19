/**
 * SLAY — light in the air.
 *
 * Outdoors on High and Ultra the fog takes the sun: beams fall between the
 * trees, the air under a canopy stays dim, and a clearing glows faintly
 * above its grass. Each pixel walks its line of sight through the fog (from
 * where the fog starts, `setFogShape`, to whatever the pixel shows) and asks
 * the sun's own shadow map at each step whether that bit of air is lit. The
 * walk runs at a quarter of the pixels, with a per-pixel jitter on where the
 * steps fall, and the composite (`Renderer`) reads it with a small blur.
 *
 * No pass runs while there is no sun (indoors, or a sun turned off): the
 * shadow map is swapped in by `setShaftSun`, and a level without one leaves
 * the strength at 0.
 */
import * as THREE from 'three/webgpu';
import {
  Fn, Loop, clamp, exp, float, getViewPosition, interleavedGradientNoise, max, min, screenCoordinate, select,
  texture, uniform, uv, vec2, vec4,
} from 'three/tsl';

/** Steps along each line of sight. The jitter and the blur hide the gaps between them. */
const STEPS = 14;
/** Air walked past where the fog starts, metres: the beams farther out are lost in the fog itself. */
const REACH = 34;
/** Fog thickness per unit of the scene's fog density, for the beams. */
const DENSITY_GAIN = 2.2;

// Stands in for a sun's shadow map until a scene has one; the real map's
// texture is swapped in, so the shaders are built once.
const blank = new THREE.DepthTexture(1, 1);
blank.compareFunction = THREE.LessEqualCompare;
blank.minFilter = THREE.LinearFilter;
blank.magFilter = THREE.LinearFilter;

const uMap = texture(blank);
const uShadow = uniform(new THREE.Matrix4());
const uCamWorld = uniform(new THREE.Matrix4());
const uProjInv = uniform(new THREE.Matrix4());
/** x: where the fog starts (metres from the camera), y: fog thickness per metre. */
const uSpan = uniform(new THREE.Vector2(0, 0));

/** Strength of the beams, 0 when there is no sun to cast them. */
export const shaftStrength = { value: 0 };

/**
 * The share of each pixel's line of sight lit by the sun, as fog would show
 * it (0 clear .. 1 thick, lit air), in the red channel.
 */
export function shaftNode(depth: THREE.TextureNode): THREE.Node {
  return Fn(() => {
    const st = uv();
    const view = getViewPosition(st, depth.sample(st).r, uProjInv);
    const far = view.length();
    const dir = view.div(max(far, 1e-4));
    const t0 = min(uSpan.x, far);
    const t1 = min(far, uSpan.x.add(REACH));
    const span = t1.sub(t0);
    const lit = float(0).toVar();
    const jitter = interleavedGradientNoise(screenCoordinate);
    Loop(STEPS, ({ i }) => {
      const t = t0.add(span.mul(float(i).add(jitter).div(STEPS)));
      const world = uCamWorld.mul(vec4(dir.mul(t), 1.0));
      const s = uShadow.mul(world);
      const c = s.xyz.div(s.w);
      const y = c.y.oneMinus();
      const inside = c.x.greaterThanEqual(0).and(c.x.lessThanEqual(1)).and(y.greaterThanEqual(0)).and(y.lessThanEqual(1))
        .and(c.z.lessThanEqual(1));
      const seen = uMap.sample(vec2(c.x, y)).compare(c.z.sub(0.002)).r;
      lit.addAssign(select(inside, seen, float(1)));
    });
    // Lit metres of air, through the fog's own thickness.
    const metres = lit.div(STEPS).mul(span);
    const amount = clamp(exp(metres.mul(uSpan.y).negate()).oneMinus(), 0.0, 1.0);
    return vec4(amount, 0.0, 0.0, 1.0);
  })() as unknown as THREE.Node;
}

/**
 * Points the beams at a sun (its shadow map and matrix, held in step with
 * the map) and the camera of the frame, or turns them off with `null`.
 */
export function setShaftSun(sun: THREE.DirectionalLight | null, camera: THREE.Camera | null, fogStart: number, fogDensity: number): void {
  const map = sun?.shadow.map?.depthTexture ?? null;
  if (!sun || !map || !camera || fogDensity <= 0) {
    shaftStrength.value = 0;
    return;
  }
  if (uMap.value !== map) uMap.value = map;
  uShadow.value.copy(sun.shadow.matrix);
  uCamWorld.value.copy(camera.matrixWorld);
  uProjInv.value.copy(camera.projectionMatrixInverse);
  uSpan.value.set(fogStart, fogDensity * DENSITY_GAIN);
  shaftStrength.value = 1;
}
