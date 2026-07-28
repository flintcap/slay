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
import type { Character, EquipSlot } from '../types';
import { Random } from '../core/RNG';
import { disposeObject } from '../core/Engine';
import { buildPlayerModel, attachToSocket, clearSocket } from '../art/CharacterModels';
import { buildItemModel } from '../art/ItemModels';
import { Animator } from '../art/Animation';
import { getBase } from '../sim/Loot';

/** Slots that put geometry on the body. Matches the in-world player. */
const VISUAL_SLOTS: EquipSlot[] = ['mainHand', 'offHand', 'helm', 'chest', 'gloves', 'boots', 'belt'];

/** Panel-sized viewport. Small enough that a second GL context is cheap. */
const WIDTH = 176;
const HEIGHT = 384;

export class PaperdollView {
  readonly root: HTMLDivElement;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 0.1, 40);
  private rig = new THREE.Group();

  private model: THREE.Object3D | null = null;
  private bones: Record<string, THREE.Bone> = {};
  private animator: Animator | null = null;
  private equipMeshes = new Map<EquipSlot, THREE.Object3D>();

  private classId = '';
  private equipSig = '';
  private spin = 0;
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
      if (this.model) {
        this.model.removeFromParent();
        disposeObject(this.model);
      }
      this.equipMeshes.clear();

      const built = buildPlayerModel(c.classId, new Random(0x9d0117));
      this.rig.add(built.root);
      this.model = built.root;
      this.bones = built.bones;
      this.animator = new Animator(built.bones);
      this.animator.play('idle', { fade: 0 });
      this.frame(built.root);
    }

    const eq = c.equipment;
    const sig = VISUAL_SLOTS.map((s) => {
      const it = eq[s];
      return it ? `${s}:${it.uid}:${it.rarity}:${it.upgrade}` : `${s}:-`;
    }).join('|');
    if (sig === this.equipSig) return;
    this.equipSig = sig;

    const rng = new Random(0x17ea55);
    for (const slot of VISUAL_SLOTS) {
      const prev = this.equipMeshes.get(slot);
      if (prev) {
        clearSocket(this.bones, slot);
        disposeObject(prev);
        this.equipMeshes.delete(slot);
      }
      const item = eq[slot];
      if (!item) continue;
      try {
        const visual = getBase(item.baseId)?.visual ?? { shape: 'auto', palette: 'metal.steel' };
        const mesh = buildItemModel(visual, rng, item.rarity);
        attachToSocket(this.rig, this.bones, slot, mesh);
        this.equipMeshes.set(slot, mesh);
      } catch {
        // A single unbuildable item must not blank the whole figure.
      }
    }
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
    if (this.running || !this.renderer) return;
    this.running = true;
    this.lastT = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      // Clamped so a backgrounded tab does not hand us a multi-second step.
      const dt = Math.min(0.05, (now - this.lastT) / 1000);
      this.lastT = now;
      if (!this.dragging) this.spin += dt * 0.25;
      this.rig.rotation.y = this.spin;
      this.animator?.update(dt);
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
    if (this.model) disposeObject(this.model);
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }
}
