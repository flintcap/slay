/**
 * SLAY — the live character view inside the inventory paperdoll.
 *
 * A small, self-contained viewport that shows your actual character with
 * your actual equipment on it. Equipping a helm changes what you see here, which
 * is the whole point: the slot grid tells you what is equipped, this tells you
 * what you look like.
 *
 * It draws in a studio (see `Studio`): a canvas of its own, drawn straight
 * from the scene with no post chain, and only while the panel is open. The
 * studio opens asynchronously; until it has, the view stays empty and
 * nothing waits on it.
 */

import * as THREE from 'three/webgpu';
import { makeStudio, type Studio } from '../core/Studio';
import type { Character } from '../types';
import { DressedHero, VISUAL_SLOTS } from '../scenes/HeroModel';

/** Panel-sized viewport. */
const WIDTH = 188;
const HEIGHT = 572;

export class PaperdollView {
  readonly root: HTMLDivElement;

  private renderer: Studio | null = null;
  private opening: Promise<Studio | null> | null = null;
  /** What to do once the renderer opens: draw unseen (warm) or start the loop. */
  private onOpen: Array<() => void> = [];
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 0.1, 40);
  private rig = new THREE.Group();

  /** The same dressed hero the world uses (`src/scenes/HeroModel.ts`). */
  private hero: DressedHero | null = null;

  private classId = '';
  private equipSig = '';
  private spin = 0;
  private swayT = 0;
  /** Seconds a dragged pose is kept before easing back to the front. */
  private holdFor = 0;
  private dragging = false;
  private lastX = 0;
  private raf = 0;
  private lastT = 0;
  private running = false;
  private failed = false;
  private disposed = false;
  /** `start` was called before the renderer opened. */
  private wantRun = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'pd-view';
    this.scene.add(this.rig);

    // Three-point studio rig. The in-world lighting is deliberately moody; here
    // the job is to let you read the gear, so it is even and bright.
    this.scene.add(new THREE.HemisphereLight(0x9fb0cc, 0x2a231c, 1.5));

    const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
    key.position.set(2.5, 3.4, 3.2);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.7);
    rim.position.set(-2.8, 2.2, -3.0);
    this.scene.add(rim);

    const fill = new THREE.DirectionalLight(0xffd0a8, 0.7);
    fill.position.set(-2.0, 0.6, 2.4);
    this.scene.add(fill);

    this.bindDrag();
  }

  /** Spin the figure by dragging across it. */
  private bindDrag(): void {
    this.root.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.root.setPointerCapture(e.pointerId);
    });
    this.root.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.spin += (e.clientX - this.lastX) * 0.012;
      this.lastX = e.clientX;
    });
    const stop = (e: PointerEvent): void => {
      this.dragging = false;
      try {
        this.root.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    };
    this.root.addEventListener('pointerup', stop);
    this.root.addEventListener('pointercancel', stop);
  }

  /**
   * Opens the renderer on first use, in the background. If the browser
   * gives none, the view quietly stays empty and the rest of the inventory
   * keeps working.
   */
  private ensureRenderer(): void {
    if (this.renderer || this.opening || this.failed) return;
    this.opening = makeStudio({ antialias: true });
    void this.opening.then((r) => {
      this.opening = null;
      if (!r) {
        this.failed = true;
        this.onOpen.length = 0;
        return;
      }
      if (this.disposed) {
        r.dispose();
        return;
      }
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.setSize(WIDTH, HEIGHT);
      r.toneMappingExposure = 1.15;
      r.setClearColor(0x000000, 0);
      r.domElement.className = 'pd-view-canvas';
      this.root.appendChild(r.domElement);
      this.renderer = r;
      const todo = this.onOpen.splice(0);
      for (const fn of todo) fn();
    });
  }

  /** Runs `fn` now if the renderer is open, else once it opens. */
  private whenOpen(fn: () => void): void {
    if (this.renderer) fn();
    else if (!this.failed) {
      this.onOpen.push(fn);
      this.ensureRenderer();
    }
  }

  /**
   * Rebuilds only what changed. Opening the inventory, moving one item and
   * every `ui:refresh` in between all land here, so a full teardown per call
   * would rebuild the whole character on every gold pickup.
   */
  setCharacter(c: Character): void {
    this.ensureRenderer();
    if (this.failed) return;

    if (this.classId !== c.classId) {
      this.classId = c.classId;
      this.equipSig = '';
      this.hero?.dispose();
      this.hero = new DressedHero(c.classId, 0x9d0117);
      this.rig.add(this.hero.root);
      this.hero.animator.play('idle', { fade: 0 });
      this.frame(this.hero.root);
    }

    const eq = c.equipment;
    const sig = VISUAL_SLOTS.map((s) => {
      const it = eq[s];
      return it ? `${s}:${it.uid}:${it.rarity}:${it.upgrade}` : `${s}:-`;
    }).join('|');
    if (sig === this.equipSig) return;
    this.equipSig = sig;
    // Armour is grown on the body and weapons held, exactly as in the world;
    // only the slots that changed are rebuilt.
    this.hero?.dress(eq);
  }

  /**
   * Builds the figure and draws it once, unseen, so the first opening of the
   * inventory does not have to. That first opening used to make the context,
   * compile the hero's shaders in it and send it every texture the hero
   * wears (about 50 MB) on the frame the panel appeared. Called behind the
   * loading curtain.
   */
  warm(c: Character): void {
    this.setCharacter(c);
    if (!this.hero) return;
    this.whenOpen(() => this.warmNow());
  }

  private warmNow(): void {
    const r = this.renderer;
    if (!this.hero || !r) return;
    // Every look the figure wears is built, not just what the first pose
    // shows: before it was posed the held weapon stood out of frame, so its
    // gems' shader was left for the first opening (seconds on a cold driver).
    // `compileAsync` builds them off the main thread where the browser can.
    // Posed and with culling off for the compile too: `compileAsync` culls
    // to the camera, so the parts out of frame (the face, the cloth under
    // the armour, the held weapon's gem) were left to the draw after it,
    // which built their pipelines on the spot, with the curtain already up.
    this.hero.animator.update(0);
    const culled: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (o.frustumCulled) {
        o.frustumCulled = false;
        culled.push(o);
      }
    });
    const draw = (): void => {
      try {
        if (this.running || !this.renderer) return;
        this.hero?.animator.update(0);
        this.renderer.render(this.scene, this.camera);
      } finally {
        for (const o of culled) o.frustumCulled = true;
      }
    };
    r.compileAsync(this.scene, this.camera).then(draw, draw);
  }

  /** Points the camera at the model's own bounds, so proportions never matter. */
  private frame(obj: THREE.Object3D): void {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    if (!Number.isFinite(box.min.y) || box.isEmpty()) return;
    const height = Math.max(0.5, box.max.y - box.min.y);
    const mid = (box.max.y + box.min.y) * 0.5;
    // Fit the height into the vertical FOV with headroom at both ends, so a
    // tall helm crest and the boots both stay inside the viewport.
    const dist = (height * 0.72) / Math.tan((this.camera.fov * Math.PI) / 360);
    this.camera.position.set(0, mid, dist);
    this.camera.lookAt(0, mid, 0);
  }

  start(): void {
    if (this.running) return;
    if (!this.renderer) {
      this.wantRun = true;
      this.whenOpen(() => {
        if (this.wantRun) this.start();
      });
      return;
    }
    this.running = true;
    this.lastT = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      // Clamped so a backgrounded tab does not hand us a multi-second step.
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      // Left alone, ease back to face the viewer with a small sway (a full
      // turntable spin showed the back half the time). Drag still turns freely.
      if (this.dragging) this.holdFor = 3;
      else if ((this.holdFor -= dt) <= 0) {
        this.swayT += dt;
        const rest = Math.sin(this.swayT * 0.4) * 0.35;
        const target = rest + Math.round((this.spin - rest) / (Math.PI * 2)) * Math.PI * 2;
        this.spin += (target - this.spin) * (1 - Math.pow(0.35, dt));
      }
      this.rig.rotation.y = this.spin;
      this.hero?.animator.update(dt);
      this.renderer?.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.wantRun = false;
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.onOpen.length = 0;
    this.stop();
    this.hero?.dispose();
    this.hero = null;
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }
}
