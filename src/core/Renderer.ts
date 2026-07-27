import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
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
    uniform vec3 uLift, uGain;
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

      // Low-life: desaturate and push toward red, pulsing.
      if (uLowLife > 0.001) {
        float pulse = 0.5 + 0.5 * sin(uTime * 5.0);
        float amt = uLowLife * (0.55 + 0.45 * pulse);
        col = mix(col, vec3(luma) * vec3(1.5, 0.32, 0.3), amt * 0.6);
      }

      col = mix(col, col * vec3(1.6, 0.35, 0.3), uHurt * 0.45);

      // Vignette, smooth and slightly cool at the corners.
      float vig = smoothstep(0.9, 0.2, r2 * uVignette * 2.6);
      col *= mix(vec3(0.62, 0.64, 0.74), vec3(1.0), vig);

      // Grain, applied in linear so it survives tone mapping naturally.
      float g = ign(gl_FragCoord.xy + fract(uTime) * 137.0) - 0.5;
      col += g * uGrain * (0.35 + (1.0 - luma));

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

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
  private grade!: ShaderPass;
  private smaa?: SMAAPass;
  private output!: OutputPass;

  private currentScene: THREE.Scene | null = null;
  private currentCamera: THREE.Camera | null = null;

  quality: QualityProfile = QUALITY.high;
  private qualityName: GameSettings['quality'] = 'high';

  /** Transient grade state driven by gameplay. */
  private hurt = 0;
  private lowLife = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
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
    window.addEventListener('resize', this.onResize);
  }

  private buildComposer(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;

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
      this.composer.addPass(this.gtao);
    }

    if (this.quality.bloom) {
      // Tight threshold: only genuinely bright things (fire, magic, hot metal)
      // bloom. A low threshold is what makes amateur scenes look hazy.
      this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.62, 0.55, 0.92);
      this.composer.addPass(this.bloom);
    }

    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uResolution.value.set(w, h);
    this.composer.addPass(this.grade);

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
    this.grade.uniforms.uResolution.value.set(w, h);
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

  setExposure(v: number): void {
    this.grade.uniforms.uExposure.value = v;
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
    this.grade.uniforms.uHurt.value = this.hurt;
    this.grade.uniforms.uLowLife.value = this.lowLife;
    this.grade.uniforms.uTime.value = elapsed;

    this.composer.render(dt);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
    this.gl.dispose();
  }
}
