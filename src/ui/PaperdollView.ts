/**
 * SLAY — the live character view inside the inventory paperdoll.
 *
 * A small, self-contained WebGL viewport that shows your actual character with
 * your actual equipment on it. Equipping a helm changes what you see here, which
 * is the whole point: the slot grid tells you what is equipped, this tells you
 * what you look like.
 *
 * It owns its own renderer rather than borrowing the game's. The game renderer
 * is wired to a full post-processing chain sized to the window, and re-targeting
 * it per frame to a 170px panel would thrash that setup for no gain. A second
 * context at this size costs very little, and it only draws while the panel is
 * actually open.
 */

import * as THREE from 'three';
import type { Character } from '../types';
import { DressedHero, VISUAL_SLOTS } from '../scenes/HeroModel';

/** Panel-sized viewport. Small enough that a second GL context is cheap. */
const WIDTH = 238;
const HEIGHT = 572;
/** How far the figure sways either side when left alone, in radians. */
const SWAY = 0.35;
/** Room round the fitted figure, as a share of its size. */
const MARGIN = 1.08;

export class PaperdollView {
  readonly root: HTMLDivElement;

  private renderer: THREE.WebGLRenderer | null = null;
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
   * Creates the GL context on first use. If the browser refuses one — too many
   * live contexts, blocklisted driver — the view quietly stays empty and the
   * rest of the inventory keeps working.
   */
  private ensureRenderer(): boolean {
    if (this.renderer) return true;
    if (this.failed) return false;
    try {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.setSize(WIDTH, HEIGHT, false);
      r.setClearAlpha(0);
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 1.15;
      r.domElement.className = 'pd-view-canvas';
      this.root.appendChild(r.domElement);
      this.renderer = r;
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  /**
   * Rebuilds only what changed. Opening the inventory, moving one item and
   * every `ui:refresh` in between all land here, so a full teardown per call
   * would rebuild the whole character on every gold pickup.
   */
  setCharacter(c: Character): void {
    if (!this.ensureRenderer()) return;

    if (this.classId !== c.classId) {
      this.classId = c.classId;
      this.equipSig = '';
      this.hero?.dispose();
      this.hero = new DressedHero(c.classId, 0x9d0117);
      this.rig.add(this.hero.root);
      this.hero.animator.play('idle', { fade: 0 });
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
    // A spear overhead or a greatsword out to the side reaches past the body:
    // fit what is held and worn, every time it changes.
    this.frame();
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
    if (this.hero) this.renderer?.render(this.scene, this.camera);
  }

  /**
   * Points the camera at the dressed figure's own posed bounds, gear and all,
   * so nothing is cut off: not a helm's crest, the boots, or a weapon held
   * high or wide. Proportions never matter.
   */
  private frame(): void {
    const hero = this.hero;
    if (!hero) return;
    hero.animator.update(1 / 60);
    // Sampled at both ends of the resting sway and facing front, so what
    // sticks out front or back stays in frame as the figure turns. Only what
    // is drawn solid counts: hidden parts and floating motes do not.
    const spin = this.rig.rotation.y;
    const box = new THREE.Box3();
    const pts: number[] = [];
    const v = new THREE.Vector3();
    for (const turn of [-SWAY, 0, SWAY]) {
      this.rig.rotation.y = turn;
      this.rig.updateMatrixWorld(true);
      hero.root.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || (m.material as THREE.Material).transparent) return;
        const n = m.geometry.getAttribute('position')?.count ?? 0;
        const step = Math.max(1, Math.floor(n / 1500));
        for (let i = 0; i < n; i += step) {
          m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
          pts.push(v.x, v.y, v.z);
          box.expandByPoint(v);
        }
      });
    }
    this.rig.rotation.y = spin;
    this.rig.updateMatrixWorld(true);
    if (box.isEmpty() || !Number.isFinite(box.min.y)) return;
    const midX = (box.max.x + box.min.x) * 0.5;
    const midY = (box.max.y + box.min.y) * 0.5;
    // Back far enough that every point lands inside the frame, with a little
    // room all round for the idle's breath. A point nearer the lens shows
    // bigger, so each is fitted at its own depth.
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360) / MARGIN;
    const tanH = tanV * this.camera.aspect;
    let dist = 1;
    for (let i = 0; i < pts.length; i += 3) {
      const need = pts[i + 2]! + Math.max(Math.abs(pts[i]! - midX) / tanH, Math.abs(pts[i + 1]! - midY) / tanV);
      if (need > dist) dist = need;
    }
    this.camera.position.set(midX, midY, dist);
    this.camera.lookAt(midX, midY, 0);
  }

  start(): void {
    if (this.running || !this.renderer) return;
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
        const rest = Math.sin(this.swayT * 0.4) * SWAY;
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
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose(): void {
    this.stop();
    this.hero?.dispose();
    this.hero = null;
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }
}
