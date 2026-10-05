import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PMREMGenerator } from 'three';
import type { GameSettings } from '../types';

/**
 * Colour-grade / lens pass.
 *
 * Runs in linear HDR *before* tone mapping so the grade behaves like a real
 * film pipeline: exposure and contrast act on light values, not on already
 * crushed sRGB. Bundles vignette, chromatic aberration, film grain, a subtle
 * lift/gamma/gain and a screen-space distortion used for damage feedback —
 * one fullscreen pass instead of five.
 */
const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uExposure: { value: 1.0 },
    uContrast: { value: 1.06 },
    uSaturation: { value: 1.08 },
    uVignette: { value: 0.42 },
    uAberration: { value: 0.0016 },
    uGrain: { value: 0.028 },
    uLift: { value: new THREE.Vector3(0.005, 0.004, 0.012) },
    uGain: { value: new THREE.Vector3(1.02, 1.0, 0.98) },
    /** Split toning: multiplicative tints for the shadows and the highlights. */
    uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
    uHighTint: { value: new THREE.Vector3(1, 1, 1) },
    uVignetteTint: { value: new THREE.Vector3(0.62, 0.64, 0.74) },
    /** 0..1 red damage flash. */
    uHurt: { value: 0.0 },
    /** 0..1 desaturating low-life pulse. */
    uLowLife: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uExposure, uContrast, uSaturation, uVignette;
    uniform float uAberration, uGrain, uHurt, uLowLife;
    uniform vec3 uLift, uGain, uShadowTint, uHighTint, uVignetteTint;
    uniform vec2 uResolution;
    varying vec2 vUv;

    // Interleaved-gradient noise — cheap, temporally stable enough for grain.
    float ign(vec2 p) {
      return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
    }

    void main() {
      vec2 uv = vUv;
      vec2 center = uv - 0.5;
      float r2 = dot(center, center);

      // Barrel-ish stretch that intensifies when hurt — sells impact without
      // moving the camera, so gameplay readability survives.
      uv = 0.5 + center * (1.0 + uHurt * 0.035 * r2);

      // Chromatic aberration scales with radius: clean centre, fringed edges.
      float ca = uAberration * (1.0 + uHurt * 6.0);
      vec2 dir = normalize(center + 1e-6) * ca * (0.25 + r2 * 2.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir).b;

      col *= uExposure;

      // Lift / gain before the contrast S-curve.
      col = col * uGain + uLift;

      // Contrast around scene-linear middle grey.
      col = (col - 0.18) * uContrast + 0.18;

      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);

      // Split tone. Shadows and highlights lean different ways, which is most
      // of what makes a grade read as a mood rather than as a colour filter.
      // Weights are in scene-linear light, so a torch pool and the dark
      // between pools pick up different tints.
      float shW = 1.0 - smoothstep(0.0, 0.22, luma);
      float hiW = smoothstep(0.3, 1.6, luma);
      col *= mix(vec3(1.0), uShadowTint, shW);
      col *= mix(vec3(1.0), uHighTint, hiW);

      // Low-life: desaturate and push toward red, pulsing.
      if (uLowLife > 0.001) {
        float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
        float amt = uLowLife * (0.55 + 0.45 * pulse);
        col = mix(col, vec3(luma) * vec3(1.5, 0.32, 0.3), amt * 0.6);
      }

      col = mix(col, col * vec3(1.6, 0.35, 0.3), uHurt * 0.45);

      // Vignette, smooth and slightly cool at the corners.
      float vig = smoothstep(0.9, 0.2, r2 * uVignette * 2.6);
      col *= mix(uVignetteTint, vec3(1.0), vig);

      // Grain, applied in linear so it survives tone mapping naturally.
      float g = ign(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5;
      col += g * uGrain * (0.35 + (1.0 - luma));

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

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
  bloomStrength: 0.62,
  bloomRadius: 0.55,
  bloomThreshold: 0.92,
};

/**
 * GTAO draws the scene once with a normal/depth override material, and three
 * hides points and lines for that draw. Sprites slip through: the override
 * material ignores their texture, so every glow sprite lands in the AO buffer
 * as a solid camera-facing square and darkens the frame behind it. Hide them
 * too. Patched on the instance (the method is internal to three; the typings
 * name it without the underscore), so an upgrade that renames it just falls
 * back to three's own behaviour.
 */
function hideSpritesFromAO(pass: GTAOPass): void {
  const p = pass as unknown as {
    _overrideVisibility?: () => void;
    _visibilityCache: THREE.Object3D[];
    scene: THREE.Scene;
  };
  if (typeof p._overrideVisibility !== 'function' || !Array.isArray(p._visibilityCache)) return;
  p._overrideVisibility = function (): void {
    const cache = p._visibilityCache;
    p.scene.traverse((o) => {
      const t = o as THREE.Object3D & {
        isPoints?: boolean; isLine?: boolean; isLine2?: boolean; isSprite?: boolean; isMesh?: boolean;
        material?: THREE.Material | THREE.Material[];
      };
      // Glow meshes too: anything transparent that writes no depth (light
      // shafts, light pools, cobwebs, additive FX). In the AO buffer a light
      // shaft became a solid cone and laid a dark trapezoid over the floor
      // around the hero (w16 frostvault, calm).
      let glow = false;
      if (t.isMesh && t.material) {
        const m = Array.isArray(t.material) ? t.material[0] : t.material;
        glow = !!m && m.transparent && !m.depthWrite;
      }
      if ((t.isPoints || t.isLine || t.isLine2 || t.isSprite || glow) && o.visible) {
        o.visible = false;
        cache.push(o);
      }
    });
  };
}

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
 * Plain object rather than a Vector4 on purpose: three copies uniform values
 * per material when they are vectors, but passes plain objects by reference,
 * so this one object drives every program at once.
 *   x  distance from the camera where fog begins
 *   y  world height below which the height fog thickens
 *   z  1 / the depth over which it reaches full strength
 *   w  0..1 strength of the height fog
 */
export const fogShape = { x: 0, y: -1000, z: 0, w: 0 };

/** Sets the fog shape; with no argument restores plain camera fog. */
export function setFogShape(start = 0, floorY = -1000, fadeDepth = 1, strength = 0): void {
  fogShape.x = start;
  fogShape.y = floorY;
  fogShape.z = 1 / Math.max(0.01, fadeDepth);
  fogShape.w = strength;
}

let fogPatched = false;

/**
 * Rewrites three's fog chunks once, before any program compiles. Materials
 * whose uniforms predate the patch (hand-written ShaderMaterials) read the
 * new uniform as zero, which is exactly plain fog, so nothing breaks.
 */
function patchFog(): void {
  if (fogPatched) return;
  fogPatched = true;
  const SC = THREE.ShaderChunk as unknown as Record<string, string>;
  SC.fog_pars_vertex = `
#ifdef USE_FOG
	varying float vFogDepth;
	varying float vFogWorldY;
#endif
`;
  // World height from the view-space position: the view matrix is rigid, so
  // its inverse rotation is a transpose. Works for instanced meshes, sprites
  // and skinned meshes alike, because it starts from the final mvPosition.
  SC.fog_vertex = `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorldY = cameraPosition.y + ( transpose( mat3( viewMatrix ) ) * mvPosition.xyz ).y;
#endif
`;
  SC.fog_pars_fragment = `
#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec4 slayFog;
	varying float vFogDepth;
	varying float vFogWorldY;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif
`;
  SC.fog_fragment = `
#ifdef USE_FOG
	float fogD = max( 0.0, vFogDepth - slayFog.x );
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * fogD * fogD );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, fogD );
	#endif
	float fogLow = clamp( ( slayFog.y - vFogWorldY ) * slayFog.z, 0.0, 1.0 );
	fogFactor = max( fogFactor, fogLow * fogLow * slayFog.w );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
  const libs = THREE.ShaderLib as unknown as Record<string, { uniforms: Record<string, { value: unknown }> }>;
  for (const key of Object.keys(libs)) {
    const u = libs[key]?.uniforms;
    if (u && 'fogDensity' in u) u.slayFog = { value: fogShape };
  }
  (THREE.UniformsLib.fog as Record<string, { value: unknown }>).slayFog = { value: fogShape };
}

export interface QualityProfile {
  shadowMapSize: number;
  shadows: boolean;
  ao: boolean;
  bloom: boolean;
  smaa: boolean;
  pixelRatioCap: number;
  anisotropy: number;
  /** Multiplier on particle budgets and decal counts. */
  fxScale: number;
}

export const QUALITY: Record<GameSettings['quality'], QualityProfile> = {
  low: { shadowMapSize: 1024, shadows: true, ao: false, bloom: true, smaa: false, pixelRatioCap: 1, anisotropy: 2, fxScale: 0.35 },
  medium: { shadowMapSize: 2048, shadows: true, ao: false, bloom: true, smaa: true, pixelRatioCap: 1.25, anisotropy: 4, fxScale: 0.6 },
  high: { shadowMapSize: 2048, shadows: true, ao: true, bloom: true, smaa: true, pixelRatioCap: 1.5, anisotropy: 8, fxScale: 1.0 },
  ultra: { shadowMapSize: 4096, shadows: true, ao: true, bloom: true, smaa: true, pixelRatioCap: 2, anisotropy: 16, fxScale: 1.4 },
};

/**
 * Owns the WebGL context and the full post chain. Scenes hand it a
 * scene+camera each frame; it does not know what a dungeon is.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  composer!: EffectComposer;

  private renderPass!: RenderPass;
  private gtao?: GTAOPass;
  private bloom?: UnrealBloomPass;
  private gradePass!: ShaderPass;
  private smaa?: SMAAPass;
  private output!: OutputPass;

  private currentScene: THREE.Scene | null = null;
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
  private lowLife = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    patchFog();
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // SMAA handles it; MSAA is wasted with a composer.
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatioCap));
    this.gl.setSize(window.innerWidth, window.innerHeight);

    // ACES Filmic is the reason this looks like a game and not a tech demo:
    // it rolls highlights off instead of clipping them to flat white.
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.0;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;

    this.buildComposer();
    this.buildEnvironment();
    window.addEventListener('resize', this.onResize);
  }

  /**
   * A small procedural sky used only as a reflection source: cool zenith, warm
   * bounce near the floor, and a couple of bright patches so curved metal picks
   * up moving highlights as it turns.
   */
  private buildEnvironment(): void {
    const scene = new THREE.Scene();

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(50, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {},
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vDir;
          void main() {
            float up = vDir.y * 0.5 + 0.5;
            vec3 zenith = vec3(0.10, 0.13, 0.20);
            vec3 horizon = vec3(0.26, 0.23, 0.21);
            vec3 ground = vec3(0.09, 0.07, 0.06);
            vec3 col = up > 0.5
              ? mix(horizon, zenith, (up - 0.5) * 2.0)
              : mix(ground, horizon, up * 2.0);
            // Two warm patches so turning metal catches a travelling highlight.
            float a = max(0.0, dot(normalize(vDir), normalize(vec3(0.6, 0.5, 0.4))));
            float b = max(0.0, dot(normalize(vDir), normalize(vec3(-0.5, 0.3, -0.6))));
            col += vec3(0.55, 0.40, 0.26) * pow(a, 26.0);
            col += vec3(0.22, 0.30, 0.45) * pow(b, 18.0);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    scene.add(sky);

    const pmrem = new PMREMGenerator(this.gl);
    pmrem.compileEquirectangularShader();
    try {
      this.envMap = pmrem.fromScene(scene, 0.04).texture;
    } catch {
      this.envMap = null;
    }
    pmrem.dispose();
    sky.geometry.dispose();
    (sky.material as THREE.Material).dispose();
  }

  /** Applies the reflection environment to a scene. Scenes call this on enter. */
  applyEnvironment(scene: THREE.Scene, intensity = 0.55): void {
    if (!this.envMap) return;
    scene.environment = this.envMap;
    scene.environmentIntensity = intensity;
  }

  private buildComposer(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Drop references to the previous chain. Without this, switching to a
    // preset that has no AO leaves `gtao` pointing at a disposed pass, and the
    // next resize calls setSize() on it.
    this.gtao = undefined;
    this.bloom = undefined;
    this.smaa = undefined;

    // HDR float target so bloom has real headroom above 1.0.
    const target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      samples: 0,
      depthBuffer: true,
    });

    this.composer = new EffectComposer(this.gl, target);
    this.composer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatioCap));
    this.composer.setSize(w, h);

    // Placeholder scene/camera; swapped every frame by render().
    const dummyScene = new THREE.Scene();
    const dummyCam = new THREE.PerspectiveCamera();

    this.renderPass = new RenderPass(dummyScene, dummyCam);
    this.composer.addPass(this.renderPass);

    if (this.quality.ao) {
      this.gtao = new GTAOPass(dummyScene, dummyCam, w, h);
      this.gtao.output = GTAOPass.OUTPUT.Default;
      this.gtao.blendIntensity = 0.85;
      this.gtao.updateGtaoMaterial({
        radius: 0.32,
        distanceExponent: 1.0,
        thickness: 1.0,
        scale: 1.0,
        samples: 16,
        distanceFallOff: 1.0,
        screenSpaceRadius: false,
      });
      hideSpritesFromAO(this.gtao);
      this.composer.addPass(this.gtao);
    }

    if (this.quality.bloom) {
      // Tight threshold: only genuinely bright things (fire, magic, hot metal)
      // bloom. A low threshold is what makes amateur scenes look hazy.
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.62, 0.55, 0.92);
      this.composer.addPass(this.bloom);
    }

    this.gradePass = new ShaderPass(GradeShader);
    this.gradePass.uniforms.uResolution.value.set(w, h);
    this.composer.addPass(this.gradePass);
    this.applyGrade();

    // OutputPass performs tone mapping + sRGB conversion; must come after grade.
    this.output = new OutputPass();
    this.composer.addPass(this.output);

    if (this.quality.smaa) {
      this.smaa = new SMAAPass();
      this.composer.addPass(this.smaa);
    }
  }

  setQuality(name: GameSettings['quality']): void {
    if (name === this.qualityName) return;
    this.qualityName = name;
    this.quality = QUALITY[name];
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatioCap));
    this.gl.shadowMap.enabled = this.quality.shadows;
    this.composer.dispose();
    this.buildComposer();

    // buildComposer() wires the new passes to a placeholder scene and camera.
    // render() only rebinds them when it sees a *different* scene than last
    // frame, so without clearing these the freshly built passes keep rendering
    // the empty placeholder — a black screen until the next scene change.
    this.currentScene = null;
    this.currentCamera = null;

    this.onResize();
  }

  get qualityLevel(): GameSettings['quality'] {
    return this.qualityName;
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setSize(w, h);
    this.composer.setSize(w, h);
    this.gradePass.uniforms.uResolution.value.set(w, h);
    this.bloom?.setSize(w, h);
    this.gtao?.setSize(w, h);
    const cam = this.currentCamera;
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  };

  /** Flash the screen red — call on player damage. */
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
    const u = this.gradePass?.uniforms;
    if (u) {
      u.uExposure.value = g.exposure * this.exposureTrim;
      u.uContrast.value = g.contrast;
      u.uSaturation.value = g.saturation;
      (u.uLift.value as THREE.Vector3).set(g.lift[0], g.lift[1], g.lift[2]);
      (u.uGain.value as THREE.Vector3).set(g.gain[0], g.gain[1], g.gain[2]);
      tintVector(g.shadowTint, g.splitTone, u.uShadowTint.value as THREE.Vector3);
      tintVector(g.highlightTint, g.splitTone * 0.6, u.uHighTint.value as THREE.Vector3);
      u.uVignette.value = g.vignette;
      // The vignette darkens toward its tint: a hue at roughly 63% brightness.
      tintVector(g.vignetteTint, 1, u.uVignetteTint.value as THREE.Vector3).multiplyScalar(0.63);
    }
    if (this.bloom) {
      this.bloom.strength = g.bloomStrength;
      this.bloom.radius = g.bloomRadius;
      this.bloom.threshold = g.bloomThreshold;
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera, dt: number, elapsed: number): void {
    if (this.currentScene !== scene || this.currentCamera !== camera) {
      this.currentScene = scene;
      this.currentCamera = camera;
      this.renderPass.scene = scene;
      this.renderPass.camera = camera;
      if (this.gtao) {
        this.gtao.scene = scene;
        this.gtao.camera = camera;
      }
    }

    // Hurt decays fast — a long flash reads as a bug, not a hit.
    this.hurt = Math.max(0, this.hurt - dt * 3.2);
    this.gradePass.uniforms.uHurt.value = this.hurt;
    this.gradePass.uniforms.uLowLife.value = this.lowLife;
    this.gradePass.uniforms.uTime.value = elapsed;

    this.composer.render(dt);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
    this.gl.dispose();
  }
}
