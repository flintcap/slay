import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Input } from './Input';
import type { SceneId } from '../types';
import { events } from './Events';

/**
 * A game scene (town, dungeon, menus). Scenes own their THREE.Scene and camera
 * and are fully torn down on exit — no cross-scene leakage of lights or meshes.
 */
export abstract class GameScene {
  abstract readonly id: SceneId;
  readonly scene = new THREE.Scene();
  abstract camera: THREE.Camera;

  /** Called once when the scene becomes active. May be async (generation). */
  abstract enter(payload?: unknown): Promise<void> | void;
  /** Per-frame update. `dt` is clamped seconds. */
  abstract update(dt: number, elapsed: number): void;
  /** Release GPU resources. */
  abstract dispose(): void;

  /** Optional: called when the window regains focus after a pause. */
  onResume?(): void;
  onPause?(): void;
}

/** Recursively frees geometries, materials and textures under a root. */
export function disposeObject(root: THREE.Object3D): void {
  const seenMaterials = new Set<THREE.Material>();
  const seenTextures = new Set<THREE.Texture>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
    if (!mat) return;
    const list = Array.isArray(mat) ? mat : [mat];
    for (const m of list) {
      if (seenMaterials.has(m)) continue;
      seenMaterials.add(m);
      for (const key of Object.keys(m)) {
        const v = (m as unknown as Record<string, unknown>)[key];
        if (v instanceof THREE.Texture && !seenTextures.has(v)) {
          seenTextures.add(v);
          v.dispose();
        }
      }
      m.dispose();
    }
  });
}

/**
 * Owns the main loop, the renderer, input, and the active scene. Everything
 * else hangs off a scene.
 */
export class Engine {
  readonly renderer: Renderer;
  readonly input: Input;
  readonly clock = new THREE.Clock();

  private scenes = new Map<SceneId, () => GameScene>();
  private active: GameScene | null = null;
  private transitioning = false;
  private running = false;
  private rafId = 0;

  /** Seconds since the engine started, excluding paused time. */
  elapsed = 0;
  paused = false;

  /**
   * Ring buffer of recent frame costs, split into simulation and render. Lets a
   * stutter be attributed instead of guessed at. Read via window.SLAY.perf.
   */
  readonly perf = {
    upd: new Float32Array(600),
    ren: new Float32Array(600),
    total: new Float32Array(600),
    i: 0,
    count: 0,
  };

  /** Rolling average frame time in ms, for the perf readout. */
  frameMs = 16.7;
  fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;

  /** True only for a pause the engine applied itself when the tab went away. */
  private autoPaused = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);

    // Pause when the tab is hidden, and — critically — resume when it comes
    // back. Only ever undo a pause we applied ourselves, so a player who opened
    // the pause menu and then switched tabs stays paused.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (!this.paused) {
          this.autoPaused = true;
          this.setPaused(true);
        }
      } else if (this.autoPaused) {
        this.autoPaused = false;
        this.setPaused(false);
      }
    });

    // Alt-tabbing to another application does not always fire visibilitychange.
    window.addEventListener('blur', () => {
      if (!this.paused) {
        this.autoPaused = true;
        this.setPaused(true);
      }
    });
    window.addEventListener('focus', () => {
      if (this.autoPaused) {
        this.autoPaused = false;
        this.setPaused(false);
      }
    });
  }

  register(id: SceneId, factory: () => GameScene): void {
    this.scenes.set(id, factory);
  }

  get currentScene(): GameScene | null {
    return this.active;
  }

  get currentSceneId(): SceneId | null {
    return this.active?.id ?? null;
  }

  /**
   * Swap scenes with a fade. Awaits the incoming scene's `enter` so world
   * generation finishes before the fade lifts — no popping into a half-built
   * dungeon.
   */
  async goTo(id: SceneId, payload?: unknown): Promise<void> {
    if (this.transitioning) return;
    const factory = this.scenes.get(id);
    if (!factory) throw new Error(`Engine: no scene registered for "${id}"`);
    this.transitioning = true;
    const from = this.active?.id ?? 'boot';

    await fadeTo(1, 260);

    if (this.active) {
      this.active.dispose();
      disposeObject(this.active.scene);
      this.active = null;
    }

    // Let the browser reclaim before we allocate the next world.
    await nextFrame();

    const next = factory();
    this.active = next;
    await next.enter(payload);

    // Prime: build shaders now so the first visible frame is not a hitch.
    this.renderer.gl.compile(next.scene, next.camera);
    this.clock.getDelta();

    events.emit('scene:change', { from, to: id });
    await fadeTo(0, 420);
    this.transitioning = false;
  }

  setPaused(v: boolean): void {
    if (this.paused === v) return;
    this.paused = v;
    if (v) this.active?.onPause?.();
    else {
      this.clock.getDelta();
      this.active?.onResume?.();
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.loop();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);

    const t0 = performance.now();

    // Clamp dt so a tab-switch or a long generation pause cannot teleport
    // entities through walls when the loop resumes.
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 1 / 20);

    if (!this.paused) this.elapsed += dt;

    const scene = this.active;
    if (scene) {
      const tu0 = performance.now();
      if (!this.paused && !this.transitioning) {
        scene.update(dt, this.elapsed);
      }
      const tu1 = performance.now();
      this.renderer.render(scene.scene, scene.camera, dt, this.elapsed);
      const tr1 = performance.now();

      const p = this.perf;
      p.upd[p.i] = tu1 - tu0;
      p.ren[p.i] = tr1 - tu1;
      p.total[p.i] = tr1 - tu0;
      p.i = (p.i + 1) % p.upd.length;
      if (p.count < p.upd.length) p.count++;
    }

    this.input.endFrame();

    const t1 = performance.now();
    this.fpsAccum += t1 - t0;
    this.fpsFrames++;
    if (this.fpsFrames >= 20) {
      this.frameMs = this.fpsAccum / this.fpsFrames;
      this.fps = Math.round(1000 / Math.max(0.001, raw * 1000) / 1) || 60;
      this.fps = Math.round(1 / Math.max(raw, 0.0001));
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  };
}

// --- Transition helpers -----------------------------------------------------

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

let fadeEl: HTMLElement | null = null;

/** Drives the fullscreen fade overlay declared in index.html. */
export function fadeTo(opacity: number, ms: number): Promise<void> {
  if (!fadeEl) fadeEl = document.getElementById('fade');
  if (!fadeEl) return Promise.resolve();
  fadeEl.style.transition = `opacity ${ms}ms ease`;
  fadeEl.style.pointerEvents = opacity > 0.5 ? 'all' : 'none';
  // Force a reflow so the transition actually runs when opacity is re-set.
  void fadeEl.offsetHeight;
  fadeEl.style.opacity = String(opacity);
  return new Promise((r) => setTimeout(r, ms));
}
