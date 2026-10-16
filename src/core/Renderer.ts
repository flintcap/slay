import * as THREE from 'three/webgpu';
import {
  Fn, clamp, dot, emissive, float, fog, fract, max, mix, mrt, normalize, output, pass, positionLocal, positionView, positionWorld,
  pow, reference, renderGroup, renderOutput, screenCoordinate, sin, smoothstep, uniform, uv, vec2, vec3, vec4, velocity,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import './NodeNames';
import './ShadowNodes';
import { uploadCanvasesWithoutWaiting } from './CanvasUpload';
import { makeLighting } from './Lighting';
import { hideShadowBodies, watchShadowLight } from './ShadowBodies';
import { nodeTexturesOf } from './Tsl';
import type { GameSettings } from '../types';
import { setAssetAnisotropy } from './Assets';

type F = THREE.Node<'float'>;
type V2 = THREE.Node<'vec2'>;
type V3 = THREE.Node<'vec3'>;
type V4 = THREE.Node<'vec4'>;

/**
 * Colour-grade / lens uniforms, shared by every rebuilt post chain.
 *
 * The grade runs in linear HDR *before* tone mapping so it behaves like a
 * real film pipeline: exposure and contrast act on light values, not on
 * already crushed sRGB. It bundles vignette, chromatic aberration, film
 * grain, a subtle lift/gamma/gain and a screen-space distortion used for
 * damage feedback: one fullscreen pass instead of five.
 */
const G = {
  time: uniform(0),
  exposure: uniform(1.0),
  contrast: uniform(1.06),
  saturation: uniform(1.08),
  vignette: uniform(0.42),
  aberration: uniform(0.0016),
  grain: uniform(0.028),
  lift: uniform(new THREE.Vector3(0.005, 0.004, 0.012)),
  gain: uniform(new THREE.Vector3(1.02, 1.0, 0.98)),
  /** Split toning: multiplicative tints for the shadows and the highlights. */
  shadowTint: uniform(new THREE.Vector3(1, 1, 1)),
  highTint: uniform(new THREE.Vector3(1, 1, 1)),
  vignetteTint: uniform(new THREE.Vector3(0.62, 0.64, 0.74)),
  /** 0..1 heat shimmer toward the top of the frame (the far ground). */
  haze: uniform(0.0),
  /** 0..1 red damage flash. */
  hurt: uniform(0.0),
  /** 0..1 desaturating low-life pulse. */
  lowLife: uniform(0.0),
};

/**
 * The grade itself. `src` reads the lit frame (scene, AO and bloom) at a
 * screen position; the lens moves where it reads. Positions are y-down
 * (0 is the top of the frame).
 */
function gradeNode(src: (p: V2) => V3): V4 {
  return Fn(() => {
    const st = uv();
    const center = st.sub(0.5);
    const r2 = dot(center, center);

    // Barrel-ish stretch that intensifies when hurt: sells impact without
    // moving the camera, so gameplay readability survives.
    const p0 = center.mul(G.hurt.mul(0.035).mul(r2).add(1.0)).add(0.5);

    // Heat haze: a slow sideways ripple, strongest at the top of the frame
    // where the ground is farthest away, gone at the hero.
    const up = p0.y.oneMinus();
    const hz = smoothstep(0.45, 1.0, up).mul(G.haze);
    const dx = hz.mul(0.0022).mul(
      sin(up.mul(140.0).add(G.time.mul(3.7))).add(sin(up.mul(61.0).sub(G.time.mul(2.3)).add(p0.x.mul(9.0))).mul(0.6)),
    );
    const dy = hz.mul(0.0012).mul(sin(p0.x.add(dx).mul(80.0).add(G.time.mul(2.9)))).negate();
    const p = p0.add(vec2(dx, dy));

    // Chromatic aberration scales with radius: clean centre, fringed edges.
    const ca = G.aberration.mul(G.hurt.mul(6.0).add(1.0));
    const dir = normalize(center.add(1e-6)).mul(ca).mul(r2.mul(2.0).add(0.25));
    const raw = vec3(src(p.add(dir)).x, src(p).y, src(p.sub(dir)).z);

    let col: V3 = raw.mul(G.exposure);
    // Lift / gain before the contrast S-curve.
    col = col.mul(G.gain).add(G.lift);
    // Contrast around scene-linear middle grey.
    col = col.sub(0.18).mul(G.contrast).add(0.18);

    const luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(luma), col, G.saturation);

    // Split tone. Shadows and highlights lean different ways, which is most
    // of what makes a grade read as a mood rather than as a colour filter.
    // Weights are in scene-linear light, so a torch pool and the dark
    // between pools pick up different tints.
    const shW = smoothstep(0.0, 0.22, luma).oneMinus();
    const hiW = smoothstep(0.3, 1.6, luma);
    col = col.mul(mix(vec3(1.0), G.shadowTint, shW));
    col = col.mul(mix(vec3(1.0), G.highTint, hiW));

    // Low-life: desaturate and push toward red, pulsing.
    const pulse = sin(G.time.mul(5.0)).mul(0.5).add(0.5);
    const amt = G.lowLife.mul(pulse.mul(0.45).add(0.55));
    col = mix(col, vec3(luma).mul(vec3(1.5, 0.32, 0.3)), amt.mul(0.6));

    col = mix(col, col.mul(vec3(1.6, 0.35, 0.3)), G.hurt.mul(0.45));

    // Vignette, smooth and slightly cool at the corners.
    const vig = smoothstep(0.9, 0.2, r2.mul(G.vignette).mul(2.6));
    col = col.mul(mix(G.vignetteTint, vec3(1.0), vig));

    // Grain, proportional to the light. A flat amount added in linear light
    // is invisible in a torch pool and a snowstorm in the dark (the sRGB
    // curve blows a 0.02 step at black up to a fifth of the range), which
    // read as coloured static over every shadow. Interleaved-gradient noise:
    // cheap, temporally stable enough for grain.
    const gp = screenCoordinate.xy.add(fract(G.time).mul(137.0));
    const g = fract(fract(dot(gp, vec2(0.06711056, 0.00583715))).mul(52.9829189)).sub(0.5);
    col = col.mul(g.mul(G.grain).mul(3.0).add(1.0)).add(g.mul(0.0012));

    return vec4(max(col, vec3(0.0)), 1.0);
  })();
}

/**
 * A colour grade: how a place *feels*, applied after lighting and before tone
 * mapping. Scenes set one on enter; anything left out falls back to the
 * neutral house grade. Tints are 0xRRGGBB and are normalised so they shift hue
 * without changing brightness.
 */
export interface GradeProfile {
  exposure: number;
  contrast: number;
  saturation: number;
  /** Added to every pixel: lifts the blacks. Linear RGB, tiny values. */
  lift: [number, number, number];
  /** Multiplies every pixel. */
  gain: [number, number, number];
  shadowTint: number;
  highlightTint: number;
  /** 0..1 how strongly the two tints apply. */
  splitTone: number;
  vignette: number;
  vignetteTint: number;
  /** 0..1 heat shimmer over the far ground. */
  haze: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
}

export const DEFAULT_GRADE: GradeProfile = {
  exposure: 1.0,
  contrast: 1.06,
  saturation: 1.08,
  lift: [0.005, 0.004, 0.012],
  gain: [1.02, 1.0, 0.98],
  shadowTint: 0x8090b0,
  highlightTint: 0xffe0b8,
  splitTone: 0.25,
  vignette: 0.42,
  vignetteTint: 0x9ea3bd,
  haze: 0,
  bloomStrength: 0.62,
  bloomRadius: 0.55,
  bloomThreshold: 0.92,
};

/** A hue at unit brightness, mixed toward white by `amount`. */
function tintVector(hex: number, amount: number, out: THREE.Vector3): THREE.Vector3 {
  const c = new THREE.Color(hex);
  const m = Math.max(c.r, c.g, c.b, 1e-4);
  const l = (c.r / m) * 0.2126 + (c.g / m) * 0.7152 + (c.b / m) * 0.0722;
  // Normalise to unit luminance so a tint never brightens or darkens.
  const k = 1 / Math.max(l, 1e-4) / m;
  out.set(1 + (c.r * k - 1) * amount, 1 + (c.g * k - 1) * amount, 1 + (c.b * k - 1) * amount);
  return out;
}


/**
 * Shape of the scene fog, shared by every material in the game.
 *
 * Plain exponential fog is measured from the camera, and the camera here sits
 * twenty metres from the player, so a quarter of the fog was always lying over
 * the floor being fought on. That is backwards for an ARPG: the playable
 * floor should be the clearest thing in frame and the distance should fall
 * away. So fog starts `start` metres out, and below `floorY` a second, height
 * term thickens it so pits and chasms sink into the murk instead of showing
 * their bottoms.
 *
 *   x  distance from the camera where fog begins
 *   y  world height below which the height fog thickens
 *   z  1 / the depth over which it reaches full strength
 *   w  0..1 strength of the height fog
 *
 * One uniform drives every material at once (`fogNodeFor`).
 */
export const fogShape = { x: 0, y: -1000, z: 0, w: 0 };
const uFog = uniform(new THREE.Vector4(0, -1000, 0, 0));

/** Sets the fog shape; with no argument restores plain camera fog. */
export function setFogShape(start = 0, floorY = -1000, fadeDepth = 1, strength = 0): void {
  fogShape.x = start;
  fogShape.y = floorY;
  fogShape.z = 1 / Math.max(0.01, fadeDepth);
  fogShape.w = strength;
  uFog.value.set(fogShape.x, fogShape.y, fogShape.z, fogShape.w);
}

/**
 * The game's fog for a scene's `Fog` or `FogExp2`: three's own fog measured
 * from `fogShape.x` out, plus the height term. Colour, density and range are
 * read from the fog object every frame, so scenes keep animating them.
 */
/** A reference read once a frame rather than once per object drawn. */
function perFrame<T extends string>(r: THREE.ReferenceNode<T, unknown>): THREE.Node<T> {
  return (r as unknown as { setGroup(g: unknown): THREE.Node<T> }).setGroup(renderGroup);
}

function fogNodeFor(f: THREE.Fog | THREE.FogExp2): V4 {
  const color = perFrame(reference('color', 'color', f));
  const d = max(positionView.z.negate().sub(uFog.x), 0.0);
  let factor: F;
  if ((f as THREE.FogExp2).isFogExp2) {
    const density = perFrame(reference('density', 'float', f));
    factor = density.mul(density).mul(d).mul(d).negate().exp().oneMinus();
  } else {
    const near = perFrame(reference('near', 'float', f));
    const far = perFrame(reference('far', 'float', f));
    factor = smoothstep(near, far, d);
  }
  const low = clamp(uFog.y.sub(positionWorld.y).mul(uFog.z), 0.0, 1.0);
  factor = max(factor, low.mul(low).mul(uFog.w));
  return fog(color, factor);
}

/** Material settings that do not change a shader (three's own list). */
const NOT_IN_SHADER = /^(is[A-Z]|_)|^(visible|version|uuid|name|opacity|userData|id)$/;

/**
 * What decides the shader an object draws with, close to three's own key:
 * the material's node graph and settings (numbers only as on or off, as
 * three reads them), and the object's kind, skeleton size and vertex data.
 */
function shaderSignature(o: THREE.Object3D, mats: readonly THREE.Material[]): string {
  let k = o.type;
  for (const m of mats) {
    k += `|${m.type}:${m.customProgramCacheKey()}:`;
    const r = m as unknown as Record<string, unknown>;
    for (const p in r) {
      if (NOT_IN_SHADER.test(p)) continue;
      const v = r[p];
      if (typeof v === 'number') k += p === 'side' ? v : v !== 0 ? 1 : 0;
      else if (v && typeof v === 'object') k += (v as THREE.Texture).isTexture ? 'T' : 'o';
      else k += String(v);
      k += ',';
    }
  }
  const sk = o as THREE.SkinnedMesh;
  if (sk.isSkinnedMesh) k += `|bones${sk.skeleton.bones.length}`;
  if (o.receiveShadow) k += '|r';
  const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
  if (g) k += `|${Object.keys(g.attributes).join(',')}|${g.index ? 'x' : ''}|${Object.keys(g.morphAttributes).join(',')}`;
  return k;
}

/** One visible object per distinct shader under `root`. */
function shaderRepresentatives(root: THREE.Object3D, camera: THREE.Camera): THREE.Object3D[] {
  const seen = new Set<string>();
  const out: THREE.Object3D[] = [];
  root.traverseVisible((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m || !o.layers.test(camera.layers)) return;
    const mats = Array.isArray(m) ? m : [m];
    if (!mats.some((x) => x.visible)) return;
    const k = shaderSignature(o, mats);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(o);
  });
  return out;
}

/** Which fog object each scene's fog node was built for. */
const fogBuiltFor = new WeakMap<THREE.Scene, THREE.Fog | THREE.FogExp2 | null>();

/** Keeps `scene.fogNode` in step with `scene.fog`. */
function syncFog(scene: THREE.Scene): void {
  const f = (scene.fog as THREE.Fog | THREE.FogExp2 | null) ?? null;
  if (fogBuiltFor.get(scene) === f) return;
  fogBuiltFor.set(scene, f);
  scene.fogNode = f ? (fogNodeFor(f) as THREE.Node) : null;
}

export interface QualityProfile {
  /** Multiplier on every shadow-casting light's own map size (256 to 4096). */
  shadowScale: number;
  /** Whether point and spot lights (torches, braziers) cast shadows. */
  pointShadows: boolean;
  /**
   * View distance: multiplier on how far around the hero the sun and moon
   * draw shadows (their shadow camera's extent).
   */
  viewScale: number;
  /** Multiplier on the pixel ratio: below 1 draws fewer pixels and scales up. */
  renderScale: number;
  shadows: boolean;
  ao: boolean;
  bloom: boolean;
  smaa: boolean;
  /**
   * Temporal anti-aliasing: the camera shifts by under a pixel each frame and
   * the frames are blended along the scene's motion, so thin edges, railings
   * and the glint on metal hold still instead of crawling. Replaces SMAA.
   */
  taa: boolean;
  pixelRatioCap: number;
  anisotropy: number;
  /** Multiplier on particle budgets and decal counts. */
  fxScale: number;
  /**
   * Shadow-map redraws a second, at most. The shadow pass draws nearly every
   * caster a second time (check-perf: 178 shadow draws beside 199 colour
   * ones), and walls and trees never move, so it is redrawn on a clock rather
   * than every frame: a fast machine no longer draws the map's shadows two
   * hundred times a second. Map and matrix stay paired, so a held shadow
   * lags a moment rather than sliding.
   */
  shadowHz: number;
}

// GTAO draws the whole scene a second time for its normal and depth buffer:
// on a busy outdoor map that was ~580 of 1430 draw calls (check-perf, dark
// forest). The world material already darkens wall feet and corners itself,
// so the default preset goes without and only Ultra keeps it.
//
// Each step sets shadows (map size, which lights cast, how far they reach),
// post (AO, bloom, edge smoothing), effect density, and resolution (the pixel
// ratio cap and a render scale). High is the intended look. The auto mode
// (core/AutoQuality.ts) moves between these with the chosen one as its top.
export const QUALITY: Record<GameSettings['quality'], QualityProfile> = {
  low: { shadowScale: 0.5, pointShadows: false, viewScale: 0.8, renderScale: 0.8, shadows: true, ao: false, bloom: false, smaa: false, taa: false, pixelRatioCap: 1, anisotropy: 2, fxScale: 0.35, shadowHz: 20 },
  medium: { shadowScale: 0.75, pointShadows: true, viewScale: 1, renderScale: 0.9, shadows: true, ao: false, bloom: true, smaa: true, taa: false, pixelRatioCap: 1.25, anisotropy: 4, fxScale: 0.6, shadowHz: 30 },
  high: { shadowScale: 1, pointShadows: true, viewScale: 1, renderScale: 1, shadows: true, ao: false, bloom: true, smaa: false, taa: true, pixelRatioCap: 1.5, anisotropy: 8, fxScale: 1.0, shadowHz: 40 },
  ultra: { shadowScale: 2, pointShadows: true, viewScale: 1.2, renderScale: 1, shadows: true, ao: true, bloom: true, smaa: false, taa: true, pixelRatioCap: 2, anisotropy: 16, fxScale: 1.4, shadowHz: 40 },
};

/** Pixel ratio for a profile on this screen, times the auto mode's resolution step. */
function pixelRatioFor(q: QualityProfile, dyn = 1): number {
  return Math.min(window.devicePixelRatio || 1, q.pixelRatioCap) * q.renderScale * dyn;
}

/** The bloom and AO passes draw at this share of the frame's width and height. */
const POST_SCALE = 0.5;

interface ShadowBase {
  size: number;
  casts: boolean;
  /** The shadow's own strength, restored when it is drawn again. */
  intensity: number;
  extent: [number, number, number, number] | null;
}

/** The browser has no WebGPU (or no GPU it will hand out). */
export class NoWebGPUError extends Error {
  constructor() {
    super('This game needs WebGPU. Update your browser (Chrome, Edge, Safari or Firefox), or turn on hardware acceleration in its settings.');
    this.name = 'NoWebGPUError';
  }
}

type BloomNode = ReturnType<typeof bloom>;
type AONode = ReturnType<typeof ao>;
type TRAANode = ReturnType<typeof traa>;

/**
 * 1 for a surface that writes depth, 0 for one that does not, fixed when the
 * shader is built. Glows, smoke and sparks write no depth, and with this as
 * the alpha of their motion they leave the motion of the surface behind them
 * in place: a spark's quad has no motion of its own that means anything, and
 * written over a wall it made the temporal blend smear the wall.
 */
class WritesDepth extends THREE.Node {
  constructor() {
    super('float');
  }

  override setup(builder: THREE.NodeBuilder): THREE.Node {
    return float((builder.material as THREE.Material).depthWrite ? 1 : 0);
  }
}

/** The motion of each pixel, kept only where a solid surface wrote it (see `WritesDepth`). */
const sceneVelocity = vec4((velocity as unknown as V2).xy, 0, new WritesDepth() as unknown as THREE.Node<'float'>);

/** Motion is blended by its own alpha: solid surfaces replace it, glows leave it. */
const keepUnderGlows = new THREE.BlendMode(THREE.NormalBlending);

/**
 * The light a surface gives off itself, the frame's second picture and what
 * bloom glows from. An unlit material (fire, magic, sparks, beams, marks) is
 * all glow, so its whole colour; a lit one only its emission (lava, runes,
 * eyes, hot metal), never the torch or sun light falling on it. Bloom read
 * the lit frame before, so a bright wall or a pale shirt in a torch's pool
 * glowed like the fire beside it.
 */
class Emission extends THREE.Node {
  constructor() {
    super('vec4');
  }

  override setup(builder: THREE.NodeBuilder): THREE.Node {
    const lit = (builder.material as THREE.Material & { lights?: boolean }).lights === true;
    return lit ? vec4(emissive, (output as unknown as V4).a) : (output as unknown as THREE.Node);
  }
}

const sceneEmission = new Emission() as unknown as THREE.Node<'vec4'>;

/** Emission blends the way the material's own colour does: a glow adds, a solid surface replaces. */
const blendAsMaterial = new THREE.BlendMode(THREE.MaterialBlending);

/**
 * Owns the GPU device (WebGPU only) and the full post chain. Scenes hand it a scene+camera each frame; it does
 * not know what a dungeon is.
 */
export class Renderer {
  readonly gl: THREE.WebGPURenderer;
  readonly canvas: HTMLCanvasElement;
  readonly pipeline: THREE.RenderPipeline;

  private scenePass: THREE.PassNode | null = null;
  private aoNode: AONode | null = null;
  private bloomNode: BloomNode | null = null;
  private traaNode: TRAANode | null = null;
  /** Rebuild the post chain before the next frame (quality changed). */
  private chainDirty = true;

  private currentScene: THREE.Scene | null = null;
  /** Renderer and scene state kept from the start of each frame (see `render`). */
  private safeState = {
    renderer: {} as THREE.RendererUtils.RendererState,
    scene: {} as THREE.RendererUtils.SceneState,
  };
  private currentCamera: THREE.Camera | null = null;

  quality: QualityProfile = QUALITY.high;
  private qualityName: GameSettings['quality'] = 'high';

  /**
   * Prefiltered environment for image-based lighting. Without one, metal has
   * nothing to reflect: it goes flat black in shadow and blows to white in the
   * key light, which is exactly what plate armour was doing.
   */
  private envMap: THREE.Texture | null = null;

  /** The grade the current scene asked for, and a scene-level exposure trim. */
  private grade: GradeProfile = { ...DEFAULT_GRADE };
  private exposureTrim = 1;

  /** Transient grade state driven by gameplay. */
  private hurt = 0;
  /** When the shadow maps were last redrawn (performance.now ms). */
  private shadowAt = -Infinity;
  /** Shadow-casting lights redrawn on the `shadowHz` clock rather than every frame. */
  private ticked = new Set<THREE.Light>();
  /**
   * The auto mode's resolution step (1 = full). Lowered before any effect is
   * turned off, so a heavy moment costs a little sharpness, not the look.
   */
  private dynScale = 1;
  private lowLife = 0;

  /** GPU time per frame (ms), smoothed; 0 until the first reading. */
  private gpuAvg = 0;
  /** Frames drawn since the timestamps were last read back. */
  private gpuFrames = 0;
  private gpuReading = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = new THREE.WebGPURenderer({
      canvas,
      antialias: false, // SMAA handles it.
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      // GPU time per frame (`gpuMs`), where the device offers timestamps.
      trackTimestamp: true,
    });
    this.gl.setPixelRatio(pixelRatioFor(this.quality, this.dynScale));
    this.gl.setSize(window.innerWidth, window.innerHeight);

    // ACES Filmic is the reason this looks like a game and not a tech demo:
    // it rolls highlights off instead of clipping them to flat white. The
    // post chain applies it once, after the grade.
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.lighting = makeLighting();

    this.pipeline = new THREE.RenderPipeline(this.gl);
    window.addEventListener('resize', this.onResize);
  }

  /**
   * Opens the GPU device. Nothing draws before this resolves. A browser
   * without WebGPU cannot run the game: three.js would quietly fall back to
   * WebGL2, which the game no longer supports, so this refuses instead.
   */
  async init(): Promise<void> {
    await this.gl.init();
    if (!(this.gl.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) throw new NoWebGPUError();
    // Canvas textures upload without waiting on the GPU (`CanvasUpload`).
    uploadCanvasesWithoutWaiting(this.gl);
    this.buildEnvironment();
  }

  /**
   * A small procedural sky used only as a reflection source: cool zenith, warm
   * bounce near the floor, and a couple of bright patches so curved metal picks
   * up moving highlights as it turns.
   */
  private buildEnvironment(): void {
    this.envMap = skyEnvironment(this.gl);
  }

  /** Applies the reflection environment to a scene. Scenes call this on enter. */
  applyEnvironment(scene: THREE.Scene, intensity = 0.55): void {
    if (!this.envMap) return;
    scene.environment = this.envMap;
    scene.environmentIntensity = intensity;
  }

  /**
   * Builds the post chain for a scene and camera: the lit frame in a
   * half-float target, then AO, bloom, the grade, tone mapping and SMAA as
   * the quality asks.
   */
  private buildChain(scene: THREE.Scene, camera: THREE.Camera): void {
    this.disposeChain();
    const q = this.quality;
    const sp = pass(scene, camera);
    this.scenePass = sp;
    let color: THREE.TextureNode = sp.getTextureNode('output');
    if (q.taa || q.bloom) {
      const outs: Record<string, THREE.Node> = { output };
      if (q.taa) outs.velocity = sceneVelocity;
      if (q.bloom) outs.emission = sceneEmission;
      const m = mrt(outs);
      if (q.taa) m.setBlendMode('velocity', keepUnderGlows);
      if (q.bloom) m.setBlendMode('emission', blendAsMaterial);
      sp.setMRT(m);
    }
    if (q.taa) {
      // The resolve runs on the lit frame, before AO, bloom and the grade:
      // bloom then glows from a steady picture, and grain stays fresh.
      const t = traa(color, sp.getTextureNode('depth'), sp.getTextureNode('velocity'), camera);
      this.traaNode = t;
      color = (t as unknown as { getTextureNode(): THREE.TextureNode }).getTextureNode();
    }

    let aoTex: THREE.TextureNode | null = null;
    if (q.ao) {
      // Normals rebuilt from depth: a normal pass would draw every mesh a
      // second time (about as many draw calls as the frame itself).
      const a = ao(sp.getTextureNode('depth'), null as unknown as THREE.Node, camera);
      a.resolutionScale = POST_SCALE;
      a.radius.value = 0.32;
      a.distanceExponent.value = 1.0;
      a.thickness.value = 1.0;
      a.scale.value = 1.0;
      // Half the samples: at a quarter of the pixels the blur smooths what eight leave.
      a.samples.value = 8;
      a.distanceFallOff.value = 1.0;
      this.aoNode = a;
      aoTex = a.getTextureNode();
    }

    let bloomTex: THREE.TextureNode | null = null;
    if (q.bloom) {
      // Glow from what glows (`Emission`), and only where it is bright: a
      // low threshold is what makes amateur scenes look hazy.
      const b = bloom(sp.getTextureNode('emission'), 0.62, 0.55, 0.92);
      // Glow is blurry by nature, so a quarter of the pixels looks the same.
      b.setResolutionScale(POST_SCALE);
      this.bloomNode = b;
      bloomTex = (b as unknown as { getTextureNode(): THREE.TextureNode }).getTextureNode();
    }

    const src = (p: V2): V3 => {
      let c: V3 = color.sample(p).rgb;
      if (aoTex) c = c.mul(mix(float(1.0), aoTex.sample(p).r, 0.85));
      if (bloomTex) c = c.add(bloomTex.sample(p).rgb);
      return c;
    };
    const graded = gradeNode(src);
    this.applyGrade();

    if (q.smaa) {
      // Edge smoothing reads the final picture, so tone mapping and sRGB come first.
      this.pipeline.outputColorTransform = false;
      this.pipeline.outputNode = smaa(renderOutput(graded)) as unknown as THREE.Node;
    } else {
      this.pipeline.outputColorTransform = true;
      this.pipeline.outputNode = graded;
    }
    this.pipeline.needsUpdate = true;
    this.chainDirty = false;
  }

  private disposeChain(): void {
    this.scenePass?.dispose();
    this.aoNode?.dispose();
    this.bloomNode?.dispose();
    this.traaNode?.dispose();
    this.scenePass = null;
    this.aoNode = null;
    this.bloomNode = null;
    this.traaNode = null;
  }

  /**
   * Moves to a quality preset. `step` is the auto mode moving along the
   * ladder mid-play rather than the player choosing in Settings: it keeps
   * the chosen preset's texture filtering, since a new filtering level
   * re-uploads every texture in the game. The post chain is rebuilt only
   * when the set of passes changes.
   */
  setQuality(name: GameSettings['quality'], step = false): void {
    if (name === this.qualityName) return;
    const before = this.quality;
    this.qualityName = name;
    this.quality = QUALITY[name];
    const q = this.quality;
    this.gl.setPixelRatio(pixelRatioFor(q, this.dynScale));
    this.gl.shadowMap.enabled = q.shadows;
    if (this.shadowScene) this.applyShadows(this.shadowScene);
    // Every asset texture, the world sets included, now and later.
    if (!step) setAssetAnisotropy(q.anisotropy);
    if (before.ao !== q.ao || before.bloom !== q.bloom || before.smaa !== q.smaa || before.taa !== q.taa) this.chainDirty = true;
    this.onResize();
  }

  get qualityLevel(): GameSettings['quality'] {
    return this.qualityName;
  }

  /** The auto mode's resolution step (1 = full sharpness). */
  get dynamicScale(): number {
    return this.dynScale;
  }

  /** Draws at `k` of the profile's own pixel ratio, everything else as it is. */
  setDynamicScale(k: number): void {
    k = Math.max(0.5, Math.min(1, k));
    if (k === this.dynScale) return;
    this.dynScale = k;
    this.gl.setPixelRatio(pixelRatioFor(this.quality, k));
    this.onResize();
  }

  /** The scene `applyShadows` last fitted, refitted when the quality changes. */
  private shadowScene: THREE.Scene | null = null;

  /**
   * Fits a scene's shadow-casting lights to the quality: each light's map
   * size times `shadowScale`, point and spot shadows only where the profile
   * has them, and the sun's or moon's reach times `viewScale`. Each light's
   * own settings are remembered the first time, so a step back up restores
   * them exactly. The engine calls this before it compiles a scene, since
   * how many lights cast shadows is part of every lit shader.
   *
   * Lights that redraw every frame are moved onto the `shadowHz` clock. The
   * shadow pass draws nearly every caster a second time, and walls and trees
   * never move, so a fast machine no longer draws the map's shadows two
   * hundred times a second. A light already held (the title's) stays held.
   */
  applyShadows(scene: THREE.Scene): void {
    if (scene !== this.shadowScene) this.ticked.clear();
    this.shadowScene = scene;
    const q = this.quality;
    scene.traverse((o) => {
      const l = o as THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight;
      if (!l.isLight || !l.shadow) return;
      let base = l.userData.shadowBase as ShadowBase | undefined;
      if (!base) {
        if (!l.castShadow) return;
        const c = (l as THREE.DirectionalLight).isDirectionalLight ? (l.shadow.camera as THREE.OrthographicCamera) : null;
        base = { size: l.shadow.mapSize.x, casts: true, intensity: l.shadow.intensity, extent: c ? [c.left, c.right, c.top, c.bottom] : null };
        l.userData.shadowBase = base;
      }
      // Shadow-only bodies (merged creature parts) are drawn into its map.
      watchShadowLight(l);
      if (l.shadow.autoUpdate) {
        l.shadow.autoUpdate = false;
        l.userData.shadowTicked = true;
      }
      const point = !(l as THREE.DirectionalLight).isDirectionalLight;
      // A lamp's shadow left out at this quality is faded to nothing and no
      // longer drawn, rather than switched off. Switching `castShadow` changes
      // every lit shader, and switching it back on reused shaders built
      // around the shadow three had freed when it went off: every frame then
      // failed and the screen went black.
      const on = !point || q.pointShadows;
      l.castShadow = base.casts;
      l.shadow.intensity = on ? base.intensity : 0;
      if (l.userData.shadowTicked && on) this.ticked.add(l);
      else this.ticked.delete(l);
      const size = Math.max(256, Math.min(4096, Math.round(base.size * q.shadowScale)));
      // The shadow node resizes its own map to this on its next draw. Freeing
      // the map here would leave the node drawing into a freed target.
      if (l.shadow.mapSize.x !== size) l.shadow.mapSize.set(size, size);
      if (base.extent) {
        const c = l.shadow.camera as THREE.OrthographicCamera;
        const k = q.viewScale;
        c.left = base.extent[0] * k;
        c.right = base.extent[1] * k;
        c.top = base.extent[2] * k;
        c.bottom = base.extent[3] * k;
        c.updateProjectionMatrix();
      }
      // A held shadow (the title's) is drawn again at its new size.
      l.shadow.needsUpdate = on;
    });
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setSize(w, h);
    const cam = this.currentCamera;
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  };

  /**
   * True when the device reports GPU time. Chrome and Edge do; a device
   * without the `timestamp-query` feature does not, and `gpuMs` stays 0.
   */
  get hasGpuTime(): boolean {
    return (this.gl.backend as { trackTimestamp?: boolean }).trackTimestamp === true;
  }

  /** How long the GPU spends on a frame (ms): draws and compute, smoothed over a few readings. */
  get gpuMs(): number {
    return this.gpuAvg;
  }

  /**
   * Reads the GPU's own timings back, one readback at a time. The queries
   * of every frame drawn while one is in flight land in the next, so its
   * total is shared out over those frames.
   */
  private readGpuTime(): void {
    this.gpuFrames++;
    if (this.gpuReading || !this.hasGpuTime) return;
    this.gpuReading = true;
    const frames = this.gpuFrames;
    this.gpuFrames = 0;
    Promise.all([this.gl.resolveTimestampsAsync('render'), this.gl.resolveTimestampsAsync('compute')])
      .then(([draw, compute]) => {
        const ms = ((draw ?? 0) + (compute ?? 0)) / Math.max(1, frames);
        if (ms > 0) this.gpuAvg = this.gpuAvg > 0 ? this.gpuAvg + (ms - this.gpuAvg) * 0.2 : ms;
      })
      .catch(() => undefined)
      .finally(() => {
        this.gpuReading = false;
      });
  }

  /** Flash the screen red: call on player damage. */
  flashHurt(strength = 1): void {
    this.hurt = Math.min(1, this.hurt + strength);
  }

  /** 0 = healthy, 1 = about to die. Drives the desaturating pulse. */
  setLowLife(v: number): void {
    this.lowLife = v;
  }

  /**
   * Scene-level exposure trim, multiplied into the grade's own exposure. The
   * town uses it because a night exterior sits lower on the curve.
   */
  setExposure(v: number): void {
    this.exposureTrim = v;
    this.applyGrade();
  }

  /**
   * Sets the colour grade for the current scene. Fields left out take the
   * house default, so `setGrade()` with nothing resets it.
   */
  setGrade(profile: Partial<GradeProfile> = {}): void {
    this.grade = { ...DEFAULT_GRADE, ...profile };
    this.applyGrade();
  }

  get currentGrade(): Readonly<GradeProfile> {
    return this.grade;
  }

  /** Pushes the grade into the post chain. Safe to call after a rebuild. */
  private applyGrade(): void {
    const g = this.grade;
    G.exposure.value = g.exposure * this.exposureTrim;
    G.contrast.value = g.contrast;
    G.saturation.value = g.saturation;
    G.lift.value.set(g.lift[0], g.lift[1], g.lift[2]);
    G.gain.value.set(g.gain[0], g.gain[1], g.gain[2]);
    tintVector(g.shadowTint, g.splitTone, G.shadowTint.value);
    tintVector(g.highlightTint, g.splitTone * 0.6, G.highTint.value);
    G.vignette.value = g.vignette;
    G.haze.value = g.haze;
    // The vignette darkens toward its tint: a hue at roughly 63% brightness.
    tintVector(g.vignetteTint, 1, G.vignetteTint.value).multiplyScalar(0.63);
    if (this.bloomNode) {
      this.bloomNode.strength.value = g.bloomStrength;
      this.bloomNode.radius.value = g.bloomRadius;
      this.bloomNode.threshold.value = g.bloomThreshold;
    }
  }

  /**
   * Points the post chain at `scene` and `camera`, building it if needed.
   *
   * The chain draws through `view`, a camera of its own that copies the
   * scene's camera each frame. AO and the temporal blend hold the camera
   * they were built with; a chain rebuilt for each new map's camera freed
   * the frame target while the map's shaders were still being built for it,
   * and those were thrown away and built again on the first frame.
   */
  private bind(scene: THREE.Scene, camera: THREE.Camera): void {
    syncFog(scene);
    const view = this.syncView(camera);
    if (this.chainDirty || !this.scenePass) {
      this.buildChain(scene, view);
    } else if (scene !== this.currentScene || camera !== this.currentCamera) {
      this.scenePass.scene = scene;
      // A cut: no history from the last picture ghosting into this one.
      this.restartHistory();
    }
    this.currentScene = scene;
    this.currentCamera = camera;
  }

  /** The chain's own camera (see `bind`). */
  private view: THREE.PerspectiveCamera | THREE.OrthographicCamera | null = null;

  /** Copies `camera` into `view`, making a new one (and a new chain) when the kind of camera changes. */
  private syncView(camera: THREE.Camera): THREE.Camera {
    const persp = camera as THREE.PerspectiveCamera;
    const ortho = camera as THREE.OrthographicCamera;
    if (!persp.isPerspectiveCamera && !ortho.isOrthographicCamera) return camera;
    let v = this.view;
    if (!v || v.type !== camera.type) {
      v = persp.isPerspectiveCamera ? new THREE.PerspectiveCamera() : new THREE.OrthographicCamera();
      // Its world matrix is copied, not worked out from a position.
      v.matrixAutoUpdate = false;
      v.matrixWorldAutoUpdate = false;
      this.view = v;
      this.chainDirty = true;
    }
    camera.updateWorldMatrix(true, false);
    v.matrix.copy(camera.matrixWorld);
    v.matrixWorld.copy(camera.matrixWorld);
    v.matrixWorldInverse.copy(camera.matrixWorldInverse);
    v.layers.mask = camera.layers.mask;
    v.near = persp.near;
    v.far = persp.far;
    v.zoom = persp.zoom;
    if ((v as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const p = v as THREE.PerspectiveCamera;
      p.fov = persp.fov;
      p.aspect = persp.aspect;
      p.filmGauge = persp.filmGauge;
      p.filmOffset = persp.filmOffset;
    } else {
      const o = v as THREE.OrthographicCamera;
      o.left = ortho.left;
      o.right = ortho.right;
      o.top = ortho.top;
      o.bottom = ortho.bottom;
    }
    // The projection is worked out here, not copied: three sets it up for
    // WebGPU's depth range on the camera it draws with, which is this one.
    v.updateProjectionMatrix();
    return v;
  }

  /** Makes the temporal blend start over from the next frame (it starts over when its size changes). */
  private restartHistory(): void {
    const t = this.traaNode as unknown as { _historyRenderTarget?: THREE.RenderTarget } | null;
    t?._historyRenderTarget?.setSize(1, 1);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, dt: number, elapsed: number): void {
    const sceneChanged = this.currentScene !== scene;
    this.bind(scene, camera);

    // Hurt decays fast: a long flash reads as a bug, not a hit.
    this.hurt = Math.max(0, this.hurt - dt * 3.2);
    G.hurt.value = this.hurt;
    G.lowLife.value = this.lowLife;
    G.time.value = elapsed;
    uFog.value.set(fogShape.x, fogShape.y, fogShape.z, fogShape.w);

    // A new scene always gets its shadows on its first frame. Map and matrix
    // stay paired, so a held shadow lags a moment rather than sliding.
    const now = performance.now();
    if (sceneChanged || now - this.shadowAt >= 1000 / this.quality.shadowHz - 1) {
      for (const l of this.ticked) (l as THREE.DirectionalLight).shadow.needsUpdate = true;
      this.shadowAt = now;
    }

    // Shadow bodies stay out of the frame's own draw list (`ShadowBodies`).
    hideShadowBodies();
    const U = THREE.RendererUtils;
    U.saveRendererState(this.gl, this.safeState.renderer);
    U.saveSceneState(scene, this.safeState.scene);
    try {
      this.pipeline.render();
      this.readGpuTime();
    } catch (err) {
      // A throw part way through a pass (a shadow map, the bloom) leaves the
      // renderer drawing into that pass's target with its material swapped
      // in: every later frame, in every scene, came out black. Put it all
      // back, then let the caller report it.
      U.restoreRendererState(this.gl, this.safeState.renderer);
      U.restoreSceneState(scene, this.safeState.scene);
      throw err;
    }
  }

  /**
   * Builds the GPU pipelines `root` will need, for the target the frame is
   * drawn into: drawn straight to the screen three.js bakes tone mapping and
   * sRGB output into every shader, drawn into the post chain's half-float
   * target it leaves them to the chain. Binding that target first builds the
   * ones the frames use.
   *
   * `scene` lends lights, fog and environment when `root` is not a scene.
   */
  compileAsync(root: THREE.Object3D, camera: THREE.Camera, scene?: THREE.Scene): Promise<unknown> {
    const s = scene ?? (root as THREE.Scene);
    if (s.isScene) {
      syncFog(s);
      if (!this.scenePass || this.chainDirty) this.bind(s, camera);
    }
    // three's `compileAsync` takes a scene's objects one at a time and waits
    // for each one's pipeline before it starts the next: a town of a
    // thousand meshes and two hundred shaders took longer to build than the
    // load allowed. Here each distinct shader is asked for once, by one
    // object that wears it, and all of them at the same time, so the GPU
    // builds them side by side. The warm frame then draws the rest, each a
    // shader already built.
    const reps = shaderRepresentatives(root, camera);
    const target = s.isScene ? s : null;
    const prev = this.gl.getRenderTarget();
    const prevMrt = this.gl.getMRT();
    if (this.scenePass) {
      this.gl.setRenderTarget(this.scenePass.renderTarget);
      // With the temporal blend on, the frame also writes motion: a shader
      // built without that output would be built again on its first frame.
      this.gl.setMRT(this.scenePass.getMRT());
    }
    const culled: THREE.Object3D[] = [];
    try {
      // Each call picks its objects before its first wait, so culling is
      // only off for that moment: the representative may be out of view.
      for (const o of reps) {
        if (o.frustumCulled) {
          o.frustumCulled = false;
          culled.push(o);
        }
      }
      return Promise.all(reps.map((o) => this.gl.compileAsync(o, camera, target)));
    } finally {
      for (const o of culled) o.frustumCulled = true;
      this.gl.setRenderTarget(prev);
      this.gl.setMRT(prevMrt);
    }
  }

  /** `compileAsync`, not waited for. */
  compile(root: THREE.Object3D, camera: THREE.Camera, scene?: THREE.Scene): void {
    this.compileAsync(root, camera, scene).catch(() => undefined);
  }

  /**
   * Sends every texture under `root` to the GPU now.
   *
   * three.js uploads a texture (and builds its mipmaps) on the first frame
   * that draws it, so a body coming into view for the first time paid for its
   * skin, megabytes on a big monster, on that frame. Compiling a scene does not
   * upload anything. Hidden objects count too: a pooled effect sheet is
   * uploaded here rather than on its first cast. Textures still loading have
   * nothing to send and are skipped; they upload when they arrive, as before.
   */
  upload(root: THREE.Object3D): void {
    const seen = new Set<THREE.Texture>();
    const take = (v: unknown): void => {
      const t = v as THREE.Texture | null | undefined;
      if (t && t.isTexture && !t.isRenderTargetTexture && t.image) seen.add(t);
    };
    root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        for (const k in mat) take((mat as unknown as Record<string, unknown>)[k]);
        for (const t of nodeTexturesOf(mat)) take(t);
      }
    });
    const s = root as THREE.Scene;
    if (s.isScene) {
      take(s.background);
      take(s.environment);
    }
    for (const t of seen) this.gl.initTexture(t);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.disposeChain();
    this.pipeline.dispose();
    this.gl.dispose();
  }
}

/**
 * The reflection sky as a prefiltered environment map: cool zenith, warm
 * bounce near the floor, two bright patches. Null if the GPU cannot make it.
 */
export function skyEnvironment(r: THREE.WebGPURenderer): THREE.Texture | null {
  const scene = new THREE.Scene();
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  mat.fog = false;
  mat.colorNode = Fn(() => {
    const dir = positionLocal.normalize();
    const up = dir.y.mul(0.5).add(0.5);
    const zenith = vec3(0.10, 0.13, 0.20);
    const horizon = vec3(0.26, 0.23, 0.21);
    const ground = vec3(0.09, 0.07, 0.06);
    const base = up.greaterThan(0.5).select(mix(horizon, zenith, up.sub(0.5).mul(2.0)), mix(ground, horizon, up.mul(2.0))).uniformFlow().toVar();
    // Two warm patches so turning metal catches a travelling highlight.
    const a = max(0.0, dot(dir, normalize(vec3(0.6, 0.5, 0.4))));
    const b = max(0.0, dot(dir, normalize(vec3(-0.5, 0.3, -0.6))));
    return base.add(vec3(0.55, 0.40, 0.26).mul(pow(a, 26.0))).add(vec3(0.22, 0.30, 0.45).mul(pow(b, 18.0)));
  })();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 16), mat);
  scene.add(sky);

  const pmrem = new THREE.PMREMGenerator(r);
  let env: THREE.Texture | null = null;
  try {
    env = pmrem.fromScene(scene, 0.04).texture;
  } catch {
    env = null;
  }
  pmrem.dispose();
  sky.geometry.dispose();
  mat.dispose();
  return env;
}

