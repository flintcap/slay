/**
 * SLAY — a gamepad drives the menus.
 *
 * The menus already answer the keyboard (MenuNav for title, pause and death,
 * FieldNav for settings, UIRoot for dialogs and Escape). Rather than teach
 * each one about pads, a pad's presses are turned into those same keys:
 *
 *   D-pad or left stick  -> arrow keys (held: repeats after a beat)
 *   A (bottom)           -> press the focused button, or Enter
 *   B (right)            -> Escape (back, close)
 *   LB / RB (shoulders)  -> previous / next settings tab
 *   Start (menu button)  -> Escape, so it opens and closes the pause menu
 *
 * Apart from Start, only while a menu, panel or dialog is on screen: the
 * pad never moves the hero. Polling runs only while a pad is connected; nothing runs without one.
 * Reads the standard layout (`Gamepad.mapping === 'standard'`, every modern
 * browser with a common pad).
 */

const DEAD = 0.6;
const REPEAT_FIRST_MS = 380;
const REPEAT_MS = 110;

type Action = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'Confirm' | 'Escape' | 'BracketLeft' | 'BracketRight' | 'Start';

const BUTTONS: Array<[index: number, action: Action]> = [
  [12, 'ArrowUp'],
  [13, 'ArrowDown'],
  [14, 'ArrowLeft'],
  [15, 'ArrowRight'],
  [0, 'Confirm'],
  [1, 'Escape'],
  [4, 'BracketLeft'],
  [5, 'BracketRight'],
  [9, 'Start'],
];

const REPEATS = new Set<Action>(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

let installed = false;
let raf = 0;
/** When each held action fires next (ms), or absent when released. */
const held = new Map<Action, number>();

/** A menu, panel or dialog is up, so pad presses belong to it. */
function menuUp(): boolean {
  return !!document.querySelector('.panel-wrap.is-open, .modal-wrap.is-open');
}

const KEY_OF: Record<string, string> = { BracketLeft: '[', BracketRight: ']' };

function key(code: string): void {
  const target = (document.activeElement as HTMLElement | null) ?? document.body;
  const k = KEY_OF[code] ?? code;
  target.dispatchEvent(new KeyboardEvent('keydown', { code, key: k, bubbles: true, cancelable: true }));
  target.dispatchEvent(new KeyboardEvent('keyup', { code, key: k, bubbles: true, cancelable: true }));
}

function fire(a: Action): void {
  if (document.documentElement.dataset.keyCapture) return;
  if (a === 'Start') {
    key('Escape');
    return;
  }
  if (!menuUp()) return;
  document.documentElement.classList.add('pad-nav');
  if (a === 'Confirm') {
    const el = document.activeElement as HTMLElement | null;
    // A synthetic Enter does not press a button; a click does.
    if (el && el !== document.body && el.matches('button, [role="button"], [role="switch"], [role="menuitem"], .mn-item')) el.click();
    else key('Enter');
    return;
  }
  key(a);
}

function poll(now: number): void {
  raf = 0;
  const pads = navigator.getGamepads();
  let any = false;
  const down = new Set<Action>();
  for (const p of pads) {
    if (!p || !p.connected) continue;
    any = true;
    for (const [i, a] of BUTTONS) if (p.buttons[i]?.pressed) down.add(a);
    const x = p.axes[0] ?? 0;
    const y = p.axes[1] ?? 0;
    if (y < -DEAD) down.add('ArrowUp');
    else if (y > DEAD) down.add('ArrowDown');
    if (x < -DEAD) down.add('ArrowLeft');
    else if (x > DEAD) down.add('ArrowRight');
  }
  for (const a of down) {
    const next = held.get(a);
    if (next === undefined) {
      fire(a);
      held.set(a, now + REPEAT_FIRST_MS);
    } else if (REPEATS.has(a) && now >= next) {
      fire(a);
      held.set(a, now + REPEAT_MS);
    }
  }
  for (const a of [...held.keys()]) if (!down.has(a)) held.delete(a);
  if (any) raf = requestAnimationFrame(poll);
}

function start(): void {
  if (!raf) raf = requestAnimationFrame(poll);
}

/** Lets a gamepad drive the menus. Call once. */
export function installGamepadNav(): void {
  if (installed || typeof window === 'undefined' || !('getGamepads' in navigator)) return;
  installed = true;
  window.addEventListener('gamepadconnected', start);
  // A pad already connected before the page loaded shows up on first press.
  if ([...navigator.getGamepads()].some((p) => p?.connected)) start();
  // The mouse is back: drop the pad's always-on focus ring.
  const root = document.documentElement;
  window.addEventListener(
    'pointermove',
    () => {
      if (root.classList.contains('pad-nav')) root.classList.remove('pad-nav');
    },
    { passive: true },
  );
}
