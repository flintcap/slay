import * as THREE from 'three';
import { isMouseCode, remapKey } from './Access';

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

/** `PointerEvent.buttons` bit for each `button` number (left, middle, right, back, forward). */
const BUTTON_BIT: Record<number, number> = { 0: 1, 1: 4, 2: 2, 3: 8, 4: 16 };

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
  /** Mouse buttons held down that carry a key's action (Settings, Key bindings). */
  private buttonsAsKeys = new Set<string>();

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
    // Caught on the way down, before any panel sees it. Dropping a carried
    // item or skill stops the release there, and missed, the button stayed
    // held and the hero walked after the cursor once it left the panel.
    window.addEventListener('pointerup', this.onPointerUp, { capture: true });
    // A second button pressed or let go while one is held comes as a move.
    window.addEventListener('pointermove', this.onPointerChord);
    // The back and forward buttons can be game buttons: the page never goes back.
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousedown', this.onMouseDown);
    // A drag that ends outside the window, or a cancelled pointer, never
    // delivers pointerup on the canvas — without these the button latches down
    // and the player keeps running forever.
    window.addEventListener('pointercancel', this.onPointerLost);
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
    // Player key rebinding (accessibility): the game sees the default code.
    const code = remapKey(e.code);
    this.press(code);
    if (code === 'Space' || code.startsWith('Digit') || e.code === 'Space') e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.release(remapKey(e.code));
  };

  /** `code` went down, from a key or a mouse button: the two mouse actions, or a key. */
  private press(code: string): void {
    if (code === 'Mouse0') {
      this.mouseLeft = true;
      this.mouseLeftPressed = true;
    } else if (code === 'Mouse2') {
      this.mouseRight = true;
      this.mouseRightPressed = true;
    } else {
      if (!this.down.has(code)) this.pressedThisFrame.add(code);
      this.down.add(code);
    }
  }

  private release(code: string): void {
    if (code === 'Mouse0') this.mouseLeft = false;
    else if (code === 'Mouse2') this.mouseRight = false;
    else {
      this.down.delete(code);
      this.releasedThisFrame.add(code);
    }
  }

  private onBlur = (): void => {
    this.down.clear();
    this.buttonsAsKeys.clear();
    this.mouseLeft = false;
    this.mouseRight = false;
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.screen.set(e.clientX, e.clientY);
    this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.button(e.button, true);
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.button(e.button, false);
  };

  private onPointerChord = (e: PointerEvent): void => {
    if (e.button < 0) return;
    this.button(e.button, (e.buttons & BUTTON_BIT[e.button]!) !== 0);
  };

  /**
   * A mouse button went down or up. It gives whatever the player has on it:
   * a mouse action, or a key's action, which goes out as that button's key
   * press so the panels' hotkeys see it too (they remap it the same way).
   * Over a menu the left and right buttons belong to the menu.
   */
  private button(n: number, down: boolean): void {
    if (!(n in BUTTON_BIT)) return;
    const physical = `Mouse${n}`;
    const code = remapKey(physical);
    if (isMouseCode(code)) {
      if (down) this.press(code);
      else this.release(code);
      return;
    }
    if (down) {
      if (this.buttonsAsKeys.has(physical) || ((n === 0 || n === 2) && this.pointerOverUI)) return;
      this.buttonsAsKeys.add(physical);
      window.dispatchEvent(new KeyboardEvent('keydown', { code: physical }));
    } else if (this.buttonsAsKeys.delete(physical)) {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: physical }));
    }
  }

  private onMouseDown = (e: MouseEvent): void => {
    // No scroll-by-dragging on the middle button: it may be a game button.
    if (e.button === 1) e.preventDefault();
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 3 || e.button === 4) e.preventDefault();
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
    for (const physical of this.buttonsAsKeys) window.dispatchEvent(new KeyboardEvent('keyup', { code: physical }));
    this.buttonsAsKeys.clear();
  };

  private onWheel = (e: WheelEvent): void => {
    this.wheelDelta += e.deltaY;
  };

  isDown(action: ActionName): boolean {
    const codes = this.codesFor(action);
    for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i]!)) return true;
    return false;
  }

  wasPressed(action: ActionName): boolean {
    const codes = this.codesFor(action);
    for (let i = 0; i < codes.length; i++) if (this.pressedThisFrame.has(codes[i]!)) return true;
    return false;
  }

  /**
   * The keys bound to an action, worked out once: asked many times a frame,
   * listing every binding afresh each time was a heap of small arrays.
   */
  private codesFor(action: ActionName): readonly string[] {
    let codes = this.boundCodes.get(action);
    if (!codes) {
      codes = Object.entries(this.binds).filter(([, act]) => act === action).map(([code]) => code);
      this.boundCodes.set(action, codes);
    }
    return codes;
  }
  private readonly boundCodes = new Map<ActionName, string[]>();

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
    window.removeEventListener('pointerup', this.onPointerUp, { capture: true });
    window.removeEventListener('pointermove', this.onPointerChord);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('pointercancel', this.onPointerLost);
    document.removeEventListener('pointerleave', this.onPointerLost);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('blur', this.onBlur);
  }
}
