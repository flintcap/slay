/**
 * The one set of interface sounds, used everywhere.
 *
 * Every UI sound goes through `uiSfx`, which emits the bus `'sfx'` event the
 * audio engine plays. On top of that, `installUiSfx` listens once at the
 * document for the things no panel should have to remember:
 *
 * - hover over any button, tab or menu row: `ui.hover`
 * - press a disabled one: `ui.error`
 * - click one: `ui.click`, or `ui.tab` for tabs, or the id in its
 *   `data-sfx` attribute (`data-sfx="none"` for silence)
 *
 * The click sound waits until the click has been handled. If the handler
 * made a sound of its own (buy, equip, open a panel, pick a menu row) the
 * plain click is dropped, so a press never plays two sounds on top of each
 * other.
 */
import { events } from '../core/Events';

let serial = 0;
let lastHoverAt = -1e9;
let installed = false;

/** Hovers closer together than this are one hover (pointer and keyboard paths). */
const HOVER_GAP_MS = 45;

/** Plays an interface sound by bank id ('ui.click', 'ui.buy', 'skillpoint'...). */
export function uiSfx(id: string, volume?: number): void {
  if (id === 'ui.hover') {
    const now = performance.now();
    if (now - lastHoverAt < HOVER_GAP_MS) return;
    lastHoverAt = now;
  } else {
    serial++;
  }
  events.emit('sfx', volume === undefined ? { id } : { id, volume });
}

const CLICKABLE = 'button, [role="button"], [role="tab"], [role="menuitem"], [role="switch"], .btn, .tab, [data-sfx]';

function clickable(t: EventTarget | null): HTMLElement | null {
  return t instanceof Element ? (t.closest(CLICKABLE) as HTMLElement | null) : null;
}

function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
}

/** Wires the document-wide hover and click sounds. Call once. */
export function installUiSfx(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  let lastHover: Element | null = null;

  // A disabled button gets no click event, so the refusal is on press.
  document.addEventListener(
    'pointerdown',
    (e) => {
      const b = clickable(e.target);
      if (b && isDisabled(b) && b.dataset.sfx !== 'none') uiSfx('ui.error', 0.6);
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    'click',
    (e) => {
      const b = clickable(e.target);
      if (!b || isDisabled(b)) return;
      const tag = b.dataset.sfx;
      if (tag === 'none') return;
      const id = tag ?? (b.classList.contains('tab') || b.getAttribute('role') === 'tab' ? 'ui.tab' : 'ui.click');
      const mark = serial;
      // After every handler of this click has run: only if none spoke up.
      setTimeout(() => {
        if (serial === mark) uiSfx(id, 0.8);
      }, 0);
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    'pointerover',
    (e) => {
      const b = clickable(e.target);
      if (b === lastHover) return;
      lastHover = b;
      if (!b) return;
      if (!isDisabled(b) && b.dataset.sfx !== 'none') uiSfx('ui.hover', 0.5);
    },
    { capture: true, passive: true },
  );
}
