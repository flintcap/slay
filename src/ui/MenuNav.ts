/**
 * SLAY — keyboard and pointer navigation for the front-end menus.
 *
 * Title, pause and death all present a short vertical list of choices. This
 * gives every one of them the same feel: arrow keys (or W/S) move a single
 * highlight, Enter or Space fires it, hovering with the mouse moves the same
 * highlight, and each move ticks the hover sound. One highlight shared by both
 * inputs is what stops a menu feeling like two menus fighting.
 *
 * A nav only listens while it is `active`, which its owning panel toggles on
 * open and close, so several can exist at once without stealing keys.
 */

import { events } from '../core/Events';
import { remapKey } from '../core/Access';

const FIXED_MENU_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'NumpadEnter', 'Tab', 'Escape']);

/**
 * The code a menu should act on. Arrows, Enter, Tab and Escape always mean
 * themselves in a menu, even if a game action was bound to one; every other key
 * goes through the player's rebinding (W moved to Z still moves up).
 */
export function menuKey(e: KeyboardEvent): string {
  return FIXED_MENU_KEYS.has(e.code) ? e.code : remapKey(e.code);
}
import { div, span, icon } from './Widgets';

/** Panels that open over a menu and take its keys while they are up. */
const NESTED_ON_TOP = new Set(['settings', 'memorial']);

export interface MenuItemOpts {
  label: string;
  /** Small second line under or beside the label. */
  hint?: string;
  icon?: string;
  /** Visual weight. `primary` gets the gold treatment even when idle. */
  tone?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  onSelect: () => void;
}

export class MenuNav {
  readonly root: HTMLDivElement;
  private items: Array<{ el: HTMLButtonElement; opts: MenuItemOpts }> = [];
  private index = 0;
  private active = false;
  private lastFire = 0;

  constructor(cls = 'mn-list') {
    this.root = div(cls);
    this.root.setAttribute('role', 'menu');
    window.addEventListener('keydown', this.onKey, true);
  }

  /** Replace the whole list. Keeps the highlight on the same index if it still exists. */
  set(list: MenuItemOpts[]): void {
    this.root.replaceChildren();
    this.items = [];
    list.forEach((opts, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `mn-item tone-${opts.tone ?? 'default'}`;
      el.setAttribute('role', 'menuitem');
      el.style.setProperty('--i', String(i));
      if (opts.icon) el.appendChild(icon(opts.icon, { size: 16, cls: 'mn-item-ico' }));
      const text = span('mn-item-text');
      text.appendChild(span('mn-item-label', opts.label));
      if (opts.hint) text.appendChild(span('mn-item-hint', opts.hint));
      el.appendChild(text);
      if (opts.disabled) {
        el.disabled = true;
        el.classList.add('is-disabled');
      }
      el.addEventListener('pointerenter', () => this.highlight(i));
      el.addEventListener('focus', () => this.highlight(i));
      el.addEventListener('click', () => this.fire(i));
      this.root.appendChild(el);
      this.items.push({ el, opts });
    });
    this.index = Math.min(this.index, Math.max(0, this.items.length - 1));
    if (this.items[this.index]?.opts.disabled) this.index = this.nextEnabled(this.index, 1);
    this.paint();
  }

  /** Start or stop listening for keys. Resets the highlight to the first item on start. */
  setActive(on: boolean, resetTo = 0): void {
    this.active = on;
    if (on) {
      this.index = this.nextEnabled(resetTo - 1, 1);
      this.paint();
    }
  }

  get isActive(): boolean {
    return this.active;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey, true);
  }

  private nextEnabled(from: number, dir: 1 | -1): number {
    const n = this.items.length;
    if (!n) return 0;
    for (let k = 1; k <= n; k++) {
      const i = (((from + dir * k) % n) + n) % n;
      if (!this.items[i]!.opts.disabled) return i;
    }
    return Math.max(0, from);
  }

  private highlight(i: number): void {
    if (i === this.index) return;
    if (this.items[i]?.opts.disabled) return;
    this.index = i;
    this.paint();
    events.emit('sfx', { id: 'ui.hover' });
  }

  private paint(): void {
    this.items.forEach(({ el }, i) => el.classList.toggle('is-active', i === this.index));
  }

  private fire(i: number): void {
    const it = this.items[i];
    if (!it || it.opts.disabled) return;
    // A focused button pressed with Enter or Space can arrive here twice: once
    // from our key handler and once as the browser's synthetic click.
    const now = performance.now();
    if (now - this.lastFire < 250) return;
    this.lastFire = now;
    events.emit('sfx', { id: 'ui.select' });
    it.el.classList.remove('is-fired');
    void it.el.offsetWidth;
    it.el.classList.add('is-fired');
    it.opts.onSelect();
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.active || !this.items.length) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    // A modal, or a screen opened on top of this one (Settings from the pause
    // menu, the memorial from the title), owns the keyboard.
    if (document.querySelector('.modal-wrap.is-open')) return;
    for (const w of document.querySelectorAll<HTMLElement>('.panel-wrap.is-open')) {
      if (NESTED_ON_TOP.has(w.dataset.panel ?? '') && !w.contains(this.root)) return;
    }
    let handled = true;
    switch (menuKey(e)) {
      case 'ArrowUp':
      case 'KeyW':
        this.highlight(this.nextEnabled(this.index, -1));
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.highlight(this.nextEnabled(this.index, 1));
        break;
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        if (e.repeat) break;
        this.fire(this.index);
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
}
