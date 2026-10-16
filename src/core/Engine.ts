import * as THREE from 'three';
import { Renderer } from './Renderer';
import { Input } from './Input';
import type { SceneId } from '../types';
import { events } from './Events';
import { save } from './Save';
import { texturesSettled } from './Assets';

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

/** While paused, the world is redrawn at most this often (ms). */
const PAUSED_FRAME_MS = 100;

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

  /**
   * Optional: stand-ins for looks the scene puts on later, so their shader
   * programs are built behind the loading curtain instead of on the frame
   * they first show. Returned objects are added for one unseen frame and
   * removed; they must share geometry and materials, never own them.
   */
  warmup?(): THREE.Object3D | null;
  /** Optional: the warm-up frame is drawn; free what `warmup` built. */
  warmupDone?(): void;

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
    // Meshed hero parts are cached and shared between heroes (`MeshCache.ts`).
    if (mesh.geometry && !mesh.geometry.userData?.cached) mesh.geometry.dispose();
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
  readonly clock = new THREE.Timer();

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

  /**
   * The auto quality mode (core/AutoQuality.ts), set by main. Fed the length
   * of each frame of play; frames behind a pause, a curtain or a hidden tab
   * say nothing about how the game runs.
   */
  autoQuality: { frame(ms: number): void } | null = null;

  /** True only for a pause the engine applied itself when the tab went away. */
  private autoPaused = false;

  /** When the last frame was drawn, and at what canvas size (see `loop`). */
  private lastDraw = 0;
  private drawnW = 0;
  private drawnH = 0;
  /** Frame time not yet handed to the renderer while a paused frame is held. */
  private heldDt = 0;

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
  /** Set while the GPU device or context is lost; nothing is drawn until it returns. */
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

    // A lost GPU device (driver reset, too many tabs, laptop sleep) does not
    // come back: three.js would need every buffer and pipeline made again.
    // Hold the game and ask for a reload, which picks the save up where it was.
    this.renderer.gl.onDeviceLost = (info: { message?: string; reason?: string | null }) => {
      this.contextLost = true;
      this.report('render', new Error(`GPU device lost: ${info.message ?? info.reason ?? 'unknown'}`));
      if (!this.paused) {
        this.autoPaused = true;
        this.setPaused(true);
      }
      events.emit('toast', { text: 'The graphics device was lost. Reload the page to keep playing; your progress is saved.', kind: 'bad' });
    };

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
    await this.prime(next);
    this.clock.update();
  }

  /**
   * Builds every shader the scene needs while the curtain is still down, so
   * the first visible frame is not a hitch.
   *
   * The scene is drawn whole behind the curtain, culling off, until every
   * mesh in it draws (`Renderer.warm`): each frame leaves out what is not
   * built yet and builds it in the background, the page free in between.
   * That covers the shadow maps and the post chain too, and every mesh's
   * buffers and textures reach the GPU on the way. Before, one such frame
   * built them all on the spot: a task of seconds that froze the page, and
   * blocking pipelines that held up the whole browser.
   */
  async prime(next: GameScene): Promise<void> {
    // Looks the scene will only wear later (a hit flash, an effect first
    // cast), on stand-ins that are compiled with it and drawn once, unseen.
    let extra: THREE.Object3D | null = null;
    try {
      extra = next.warmup?.() ?? null;
      if (extra) next.scene.add(extra);
    } catch (err) {
      this.report('render', err);
    }
    try {
      // Shadow casters and map sizes for the current quality first: how many
      // lights cast shadows is part of every lit shader compiled below.
      this.renderer.applyShadows(next.scene);
    } catch (err) {
      this.report('render', err);
    }
    // Hidden things too: pooled effects, shots and bars wait hidden until
    // first used, and three.js compiles and draws only what is visible, so
    // each linked its shader on the frame it first showed (one mid-fight
    // link a fight). Shown for the compile and the warm frame, then hidden
    // again. Anything holding a light stays as it is: a shadow-casting light
    // switched on here would change every lit shader (`core/Lighting.ts`).
    const unhidden: THREE.Object3D[] = [];
    try {
      next.scene.traverse((o) => {
        if (o.visible || (o as THREE.Light).isLight) return;
        let lit = false;
        o.traverse((c) => {
          if ((c as THREE.Light).isLight) lit = true;
        });
        if (lit) return;
        o.visible = true;
        unhidden.push(o);
      });
    } catch (err) {
      this.report('render', err);
    }
    // Textures still decoding would otherwise upload on a frame in play.
    const textures = texturesSettled(2000);
    // The warm frames draw the whole scene, not just what the camera sees, so
    // every mesh's buffers and every texture reach the GPU now. Before, each
    // part of a map uploaded on the frame it first came into view: a hitch
    // per room, per monster, while walking. Culling is put back right after.
    const culled: THREE.Object3D[] = [];
    try {
      this.renderer.upload(next.scene);
      next.scene.traverse((o) => {
        if (o.frustumCulled) {
          o.frustumCulled = false;
          culled.push(o);
        }
      });
      await this.renderer.warm(next.scene, next.camera, this.elapsed, 20000);
      await textures;
      // What finished decoding meanwhile.
      this.renderer.upload(next.scene);
      this.renderer.render(next.scene, next.camera, 0, this.elapsed);
    } catch (err) {
      this.report('render', err);
    } finally {
      for (const o of culled) o.frustumCulled = true;
      for (const o of unhidden) o.visible = false;
    }
    // The warm frame's shadow maps held the hidden casters: a shadow drawn
    // only on demand (the title's) is drawn again on the first real frame.
    next.scene.traverse((o) => {
      const l = o as THREE.DirectionalLight;
      if (l.isLight && l.shadow) l.shadow.needsUpdate = true;
    });
    extra?.removeFromParent();
    try {
      next.warmupDone?.();
    } catch (err) {
      this.report('render', err);
    }
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
      this.clock.update();
      this.active?.onResume?.();
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.reset();
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
    const raw = this.clock.update().getDelta();
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
      // A paused world draws the same picture every frame: nothing in it
      // updates. Behind the pause menu and the settings it was still drawn
      // in full sixty times a second (shadows, bloom, the blur of the menu's
      // backdrop over it), for nothing. It is redrawn a few times a second,
      // so anything that does change (a setting being tried) still shows,
      // and at once when the canvas is resized, which clears it.
      const cv = this.renderer.canvas;
      // Behind a fully down curtain nothing drawn is seen, and a scene still
      // loading was drawn every frame for nothing. `prime` draws the frames
      // that build its shaders itself (`Renderer.warm`).
      const held =
        curtainDown ||
        (this.paused &&
          !this.transitioning &&
          tu1 - this.lastDraw < PAUSED_FRAME_MS &&
          cv.width === this.drawnW &&
          cv.height === this.drawnH);
      if (held) {
        // A load's seconds are not time the picture should catch up on.
        if (!curtainDown) this.heldDt += dt;
      }
      else {
        try {
          this.renderer.render(scene.scene, scene.camera, dt + this.heldDt, this.elapsed);
        } catch (err) {
          failed = true;
          this.report('render', err);
        }
        this.heldDt = 0;
        this.lastDraw = tu1;
        this.drawnW = cv.width;
        this.drawnH = cv.height;
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

      if (this.autoQuality && !this.paused && !this.transitioning && !document.hidden) {
        try {
          this.autoQuality.frame(raw * 1000);
        } catch (err) {
          this.report('render', err);
        }
      }
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

/**
 * True while the fade overlay is fully down: nothing drawn can be seen, so
 * the loop does not draw (see `loop`). Set when a fade to black has run its
 * course, cleared the moment a fade back up starts.
 */
let curtainDown = false;
let fadeSerial = 0;

/** Drives the fullscreen fade overlay declared in index.html. */
export function fadeTo(opacity: number, ms: number): Promise<void> {
  if (!fadeEl) fadeEl = document.getElementById('fade');
  if (!fadeEl) return Promise.resolve();
  const serial = ++fadeSerial;
  if (opacity < 1) curtainDown = false;
  fadeEl.style.transition = `opacity ${ms}ms ease`;
  fadeEl.style.pointerEvents = opacity > 0.5 ? 'all' : 'none';
  // Force a reflow so the transition actually runs when opacity is re-set.
  void fadeEl.offsetHeight;
  fadeEl.style.opacity = String(opacity);
  return new Promise((r) =>
    setTimeout(() => {
      // A later fade (one back up) owns the state now.
      if (serial === fadeSerial && opacity >= 1) curtainDown = true;
      r();
    }, ms),
  );
}
