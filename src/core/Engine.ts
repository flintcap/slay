import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Input } from './Input';
import type { SceneId } from '../types';
import { events } from './Events';
import { save } from './Save';

/** One distinct error the engine caught, with how often it has happened. */
export interface CaughtError {
  /** Where it was caught: 'update', 'render', 'enter', 'dispose', 'window', 'promise'. */
  where: string;
  message: string;
  /** First few stack lines of the first occurrence. */
  stack: string;
  count: number;
  firstAt: number;
  lastAt: number;
  scene: SceneId | null;
}

/** Frames in a row a scene may fail before the engine pulls the player out. */
const FAILS_BEFORE_RECOVERY = 30;

let liveEngine: Engine | null = null;

/**
 * Record an error caught somewhere inside a scene, without stopping it. Use it
 * to fence off one entity's update so a single broken monster cannot end the
 * frame for everything after it:
 *
 *     try { e.update(dt, ctx); } catch (err) { reportError('enemy', err); }
 */
export function reportError(where: string, err: unknown): void {
  if (liveEngine) liveEngine.report(where, err);
  else console.error(`[${where}]`, err);
}

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

/**
 * Recursively frees the geometry under a root, and any material that belongs
 * to it alone.
 *
 * It used to free the materials and textures too, unconditionally. Almost
 * nothing in this game owns its own material: `surface()`, `emissiveMaterial()`
 * and friends all hand back globally cached instances, and every texture in the
 * project lives in a cache in `Textures.ts` shared across the whole scene. So
 * throwing away one item model — which happens on every single equip change,
 * and again in the paperdoll — was deleting materials the dungeon walls, the
 * monsters and the player were still using. Three.js then had to rebuild and
 * re-upload all of it on the next frame that touched them, which is both the
 * stall on equipping and a chunk of the general combat stutter.
 *
 * Geometry is always per-instance here, so that is always safe to free.
 * Textures are never freed from here; the asset cache (`core/Assets`) owns them, and that
 * is a between-runs operation, not a per-object one.
 */
export function disposeObject(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    // A skinned mesh's skeleton owns a bone texture on the GPU; a torn-down
    // scene left one behind per resident, hero and monster.
    (obj as THREE.SkinnedMesh).skeleton?.dispose();
    const mat = (mesh as unknown as { material?: THREE.Material | THREE.Material[] }).material;
    if (!mat) return;
    const list = Array.isArray(mat) ? mat : [mat];
    for (const m of list) {
      if (seen.has(m)) continue;
      seen.add(m);
      // Opt-out marker set by every cached factory in `art/Materials.ts`.
      if (m.userData?.shared === true) continue;
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
  /** Wall time across the same frames, for an fps that is an average, not one sample. */
  private fpsWall = 0;

  /** True only for a pause the engine applied itself when the tab went away. */
  private autoPaused = false;

  /**
   * Every distinct error caught anywhere in the game, keyed by place and
   * message. A frame that throws is logged once and counted after that, so a
   * bug that fires every frame cannot flood the console or stall the tab.
   * Read by the soak test via window.SLAY.engine.errors.
   */
  readonly errors = new Map<string, CaughtError>();
  /** Frames in a row the active scene's update or render has thrown. */
  private failStreak = 0;
  private recovering = false;
  /** Set while the WebGL context is lost; nothing is drawn until it returns. */
  contextLost = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    liveEngine = this;

    // Errors that escape everything else: event listeners, timers, promises
    // nobody awaited. None of them stop the loop on their own, but they must
    // be seen, and counted, rather than vanish.
    window.addEventListener('error', (e) => {
      this.report('window', e.error ?? e.message);
    });
    window.addEventListener('unhandledrejection', (e) => {
      this.report('promise', e.reason);
    });

    // A lost GPU context (driver reset, too many tabs, laptop sleep). Three.js
    // restores its own state when the context comes back; until then there is
    // nothing to draw into, so stop trying and hold the game still.
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.report('render', new Error('WebGL context lost'));
      if (!this.paused) {
        this.autoPaused = true;
        this.setPaused(true);
      }
      events.emit('toast', { text: 'The graphics device was reset. Waiting for it to come back...', kind: 'bad' });
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      if (this.autoPaused) {
        this.autoPaused = false;
        this.setPaused(false);
      }
      events.emit('toast', { text: 'Graphics restored.', kind: 'good' });
    });

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
    let arrived: SceneId = id;

    try {
      await fadeTo(1, 260);
      events.emit('scene:loading', { from, to: id, payload });

      if (this.active) {
        // A scene that fails to tear down must not keep the player in it.
        try {
          this.active.dispose();
        } catch (err) {
          this.report('dispose', err);
        }
        try {
          disposeObject(this.active.scene);
        } catch (err) {
          this.report('dispose', err);
        }
        this.active = null;
      }

      // Let the browser reclaim before we allocate the next world.
      await nextFrame();

      try {
        await this.enterScene(id, factory, payload);
      } catch (err) {
        // The scene could not be built. Fall back to somewhere that can be:
        // town for anything in a run, the title for town itself.
        this.report('enter', err);
        const fallback = this.fallbackFor(id);
        const fb = fallback ? this.scenes.get(fallback) : undefined;
        if (!fallback || !fb) throw err;
        this.active = null;
        events.emit('toast', { text: 'Something went wrong getting there. You are safe.', kind: 'bad' });
        await this.enterScene(fallback, fb, undefined);
        arrived = fallback;
      }

      this.failStreak = 0;
      events.emit('scene:change', { from, to: arrived });
    } finally {
      // Whatever happened, never leave the screen black and input dead.
      await fadeTo(0, 420);
      this.transitioning = false;
    }
  }

  private async enterScene(id: SceneId, factory: () => GameScene, payload: unknown): Promise<void> {
    const next = factory();
    this.active = next;
    try {
      await next.enter(payload);
    } catch (err) {
      try {
        next.dispose();
        disposeObject(next.scene);
      } catch {
        /* half-built; nothing more to do */
      }
      this.active = null;
      throw err;
    }
    // Prime: build shaders now so the first visible frame is not a hitch.
    try {
      this.renderer.gl.compile(next.scene, next.camera);
    } catch (err) {
      this.report('render', err);
    }
    this.clock.getDelta();
  }

  /** Where to send the player when `id` cannot be entered or keeps failing. */
  private fallbackFor(id: SceneId): SceneId | null {
    if (id === 'title') return null;
    if (id === 'town') return 'title';
    return this.scenes.has('town') ? 'town' : 'title';
  }

  /**
   * Record a caught error. Logs it in full the first time, then only counts
   * it, so a per-frame failure costs a map lookup rather than a console flood.
   */
  report(where: string, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    const key = `${where}|${message}`;
    const now = performance.now();
    const seen = this.errors.get(key);
    if (seen) {
      seen.count++;
      seen.lastAt = now;
      // Remind every so often so a long session still shows it is ongoing.
      if (seen.count === 10 || seen.count === 100 || seen.count % 1000 === 0) {
        console.error(`[engine] ${where} error repeated ${seen.count}x: ${message}`);
      }
      return;
    }
    if (this.errors.size >= 200) return;
    const stack = err instanceof Error ? (err.stack ?? '').split('\n').slice(0, 6).join('\n') : '';
    this.errors.set(key, { where, message, stack, count: 1, firstAt: now, lastAt: now, scene: this.active?.id ?? null });
    console.error(`[engine] ${where} error:`, err);
  }

  /** Total caught errors, every kind, every repeat. */
  get errorCount(): number {
    let n = 0;
    for (const e of this.errors.values()) n += e.count;
    return n;
  }

  /**
   * A scene has thrown for many frames in a row: it is not going to fix
   * itself. Save what can be saved and move the player somewhere safe.
   */
  private recover(): void {
    if (this.recovering || this.transitioning) return;
    const id = this.active?.id ?? null;
    const to = id ? this.fallbackFor(id) : 'title';
    this.failStreak = 0;
    if (!to) return; // The title itself is failing; keep trying to draw it.
    this.recovering = true;
    try {
      save.flush();
    } catch {
      /* the save has its own safety */
    }
    events.emit('toast', { text: 'Something went wrong. You have been moved somewhere safe.', kind: 'bad' });
    void this.goTo(to)
      .catch((err) => this.report('enter', err))
      .finally(() => {
        this.recovering = false;
      });
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
    if (scene && !this.contextLost) {
      // Update and render are guarded separately: a bad frame of simulation
      // should still draw, and a bad draw should not stop the simulation.
      let failed = false;
      const tu0 = performance.now();
      if (!this.paused && !this.transitioning) {
        try {
          scene.update(dt, this.elapsed);
        } catch (err) {
          failed = true;
          this.report('update', err);
        }
      }
      const tu1 = performance.now();
      try {
        this.renderer.render(scene.scene, scene.camera, dt, this.elapsed);
      } catch (err) {
        failed = true;
        this.report('render', err);
      }
      const tr1 = performance.now();
      if (failed) {
        if (++this.failStreak >= FAILS_BEFORE_RECOVERY) this.recover();
      } else this.failStreak = 0;

      const p = this.perf;
      p.upd[p.i] = tu1 - tu0;
      p.ren[p.i] = tr1 - tu1;
      p.total[p.i] = tr1 - tu0;
      p.i = (p.i + 1) % p.upd.length;
      if (p.count < p.upd.length) p.count++;
    }

    try {
      this.input.endFrame();
    } catch (err) {
      this.report('input', err);
    }

    const t1 = performance.now();
    this.fpsAccum += t1 - t0;
    this.fpsWall += raw;
    this.fpsFrames++;
    if (this.fpsFrames >= 20) {
      this.frameMs = this.fpsAccum / this.fpsFrames;
      this.fps = Math.round(this.fpsFrames / Math.max(this.fpsWall, 0.0001));
      this.fpsAccum = 0;
      this.fpsWall = 0;
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
