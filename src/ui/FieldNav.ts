/**
 * SLAY — arrow-key movement through a panel full of controls (Settings).
 *
 * MenuNav moves one highlight through a short list of choices. A settings
 * page is different: tabs, switches, sliders, segmented choices and buttons.
 * Here the browser's own focus is the highlight, so Tab, the mouse and the
 * arrows all agree:
 *
 * - Up / Down: the previous or next control, top to bottom (a segmented row
 *   counts as one stop). The page scrolls to keep it in view.
 * - Left / Right: change it in place. Sliders step, a segmented row picks
 *   its neighbour, a switch turns off or on.
 * - Enter / Space: the browser's own press on the focused button.
 *
 * Keys only count while `active()` says so, never while a dialog is up,
 * and never while a key is being rebound (`data-key-capture` on <html>).
 */

const STOPS = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled)';

function visible(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

export class FieldNav {
  private root: HTMLElement;
  private active: () => boolean;

  constructor(root: HTMLElement, active: () => boolean) {
    this.root = root;
    this.active = active;
    window.addEventListener('keydown', this.onKey, true);
  }

  /** The controls in reading order; a segmented row is one stop (its lit choice). */
  private stops(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const seen = new Set<Element>();
    for (const el of this.root.querySelectorAll<HTMLElement>(STOPS)) {
      if (!visible(el)) continue;
      const bar = el.closest('.segbar');
      if (bar) {
        if (seen.has(bar)) continue;
        seen.add(bar);
        out.push(bar.querySelector<HTMLElement>('.seg.on') ?? el);
        continue;
      }
      out.push(el);
    }
    return out;
  }

  private move(dir: 1 | -1): void {
    const stops = this.stops();
    if (!stops.length) return;
    const cur = document.activeElement as HTMLElement | null;
    let i = -1;
    if (cur && this.root.contains(cur)) {
      const bar = cur.closest('.segbar');
      i = stops.findIndex((s) => s === cur || (!!bar && bar.contains(s)));
    }
    // Nothing focused yet: Down starts on the page's first setting (past the
    // tab rail), Up on the last.
    let next: HTMLElement | undefined;
    if (i < 0) {
      const content = stops.filter((s) => !s.closest('.stg-rail'));
      next = dir > 0 ? (content[0] ?? stops[0]) : stops[stops.length - 1];
    } else {
      next = stops[(i + dir + stops.length) % stops.length];
    }
    if (!next) return;
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest' });
  }

  /** Left / Right on the focused control. True when it took the key. */
  private nudge(dir: 1 | -1): boolean {
    const cur = document.activeElement as HTMLElement | null;
    if (!cur || !this.root.contains(cur)) return false;
    const bar = cur.closest('.segbar');
    if (bar) {
      const segs = [...bar.querySelectorAll<HTMLButtonElement>('.seg:not(:disabled)')];
      const at = segs.indexOf(cur as HTMLButtonElement);
      const to = segs[Math.max(0, Math.min(segs.length - 1, at + dir))];
      if (to && to !== cur) {
        to.click();
        to.focus();
      }
      return true;
    }
    if (cur.getAttribute('role') === 'switch') {
      const on = cur.getAttribute('aria-checked') === 'true';
      if (on !== dir > 0) cur.click();
      return true;
    }
    // Sliders step on their own (the browser's range input).
    return false;
  }

  private onKey = (e: KeyboardEvent): void => {
    if (!this.active()) return;
    if (document.documentElement.dataset.keyCapture) return;
    if (document.querySelector('.modal-wrap.is-open')) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range'))) return;
    let handled = true;
    switch (e.code) {
      case 'ArrowUp':
        this.move(-1);
        break;
      case 'ArrowDown':
        this.move(1);
        break;
      case 'ArrowLeft':
        handled = this.nudge(-1);
        break;
      case 'ArrowRight':
        handled = this.nudge(1);
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
