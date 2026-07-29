import * as THREE from 'three';

export type ActionName =
  | 'move'
  | 'skill1'
  | 'skill2'
  | 'skill3'
  | 'skill4'
  | 'skill5'
  | 'skill6'
  | 'potionLife'
  | 'potionMana'
  | 'inventory'
  | 'character'
  | 'skills'
  | 'stash'
  | 'map'
  | 'interact'
  | 'dodge'
  | 'pause'
  | 'showItems';

const DEFAULT_BINDS: Record<string, ActionName> = {
  Digit1: 'skill1',
  Digit2: 'skill2',
  Digit3: 'skill3',
  Digit4: 'skill4',
  Digit5: 'skill5',
  Digit6: 'skill6',
  KeyQ: 'potionLife',
  KeyF: 'potionMana',
  KeyI: 'inventory',
  KeyC: 'character',
  KeyT: 'skills',
  KeyB: 'stash',
  KeyM: 'map',
  KeyE: 'interact',
  Space: 'dodge',
  Escape: 'pause',
  AltLeft: 'showItems',
  ShiftLeft: 'showItems',
};

/**
 * Centralised input. Owns keyboard state, mouse position, and the ground-plane
 * raycast every ARPG needs ("where in the world is the cursor?").
 */
export class Input {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private releasedThisFrame = new Set<string>();
  private binds = { ...DEFAULT_BINDS };

  /** Normalised device coords, -1..1. */
  readonly ndc = new THREE.Vector2();
  /** Raw client pixel coords. */
  readonly screen = new THREE.Vector2();

  mouseLeft = false;
  mouseRight = false;
  mouseLeftPressed = false;
  mouseRightPressed = false;
  wheelDelta = 0;

  /** Set true by the UI layer while the pointer is over a panel. */
  pointerOverUI = false;
  /**
   * True over anything clickable, including things that only claim the left
   * button — ground-loot labels. `pointerOverUI` stays false for those so the
   * attack button still works over a dropped item.
   */
  pointerOverClickable = false;

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** World-space point under the cursor on the y=0 plane. */
  readonly worldPoint = new THREE.Vector3();

  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    el.addEventListener('pointermove', this.onPointerMove);
    // On `window`, not on the canvas. Ground-loot nameplates are HTML sitting on
    // top of the canvas, so a right-click aimed at a monster standing on an item
    // landed on the label instead and the attack button simply did not fire. The
    // scenes already gate every click on `pointerOverUI`, so listening wider is
    // safe and it is what makes clicking *through* a label possible.
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    // A drag that ends outside the window, or a cancelled pointer, never
    // delivers pointerup on the canvas — without these the button latches down
    // and the player keeps running forever.
    window.addEventListener('pointercancel', this.onPointerUp);
    document.addEventListener('pointerleave', this.onPointerLost);
    el.addEventListener('wheel', this.onWheel, { passive: true });
    // Right-click is the attack button, so the browser menu is never wanted —
    // not over the canvas, and not over the loot labels and HUD chrome drawn on
    // top of it. The only exception is a real text field, where right-click
    // still needs to offer cut/copy/paste.
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('blur', this.onBlur);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    // Let the browser handle text entry (character naming).
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (!this.down.has(e.code)) this.pressedThisFrame.add(e.code);
    this.down.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Digit')) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
    this.releasedThisFrame.add(e.code);
  };

  private onBlur = (): void => {
    this.down.clear();
    this.mouseLeft = false;
    this.mouseRight = false;
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.screen.set(e.clientX, e.clientY);
    this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 0) {
      this.mouseLeft = true;
      this.mouseLeftPressed = true;
    }
    if (e.button === 2) {
      this.mouseRight = true;
      this.mouseRightPressed = true;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 0) this.mouseLeft = false;
    if (e.button === 2) this.mouseRight = false;
  };

  private onContextMenu = (e: MouseEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
  };

  /** Drop all mouse state — used when the pointer leaves or is taken away. */
  private onPointerLost = (): void => {
    this.mouseLeft = false;
    this.mouseRight = false;
  };

  private onWheel = (e: WheelEvent): void => {
    this.wheelDelta += e.deltaY;
  };

  isDown(action: ActionName): boolean {
    for (const [code, act] of Object.entries(this.binds)) {
      if (act === action && this.down.has(code)) return true;
    }
    return false;
  }

  wasPressed(action: ActionName): boolean {
    for (const [code, act] of Object.entries(this.binds)) {
      if (act === action && this.pressedThisFrame.has(code)) return true;
    }
    return false;
  }

  keyDown(code: string): boolean {
    return this.down.has(code);
  }

  keyPressed(code: string): boolean {
    return this.pressedThisFrame.has(code);
  }

  /** Project the cursor onto the ground plane. Call once per frame. */
  updateWorldPoint(camera: THREE.Camera, planeY = 0): void {
    this.groundPlane.constant = -planeY;
    this.raycaster.setFromCamera(this.ndc, camera);
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, this.worldPoint)) {
      // Ray parallel to the plane — fall back to a point far down the ray.
      this.raycaster.ray.at(50, this.worldPoint);
    }
  }

  raycastAgainst(camera: THREE.Camera, objects: THREE.Object3D[]): THREE.Intersection[] {
    this.raycaster.setFromCamera(this.ndc, camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  /** Clear per-frame edges. The engine calls this at the end of each tick. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.mouseLeftPressed = false;
    this.mouseRightPressed = false;
    this.wheelDelta = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    document.removeEventListener('pointerleave', this.onPointerLost);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('blur', this.onBlur);
  }
}
