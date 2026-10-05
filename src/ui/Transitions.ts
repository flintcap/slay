/**
 * SLAY — the loading card shown during scene swaps.
 *
 * `Engine.goTo` fades the `#fade` curtain to black, announces `scene:loading`,
 * builds the next scene, then lifts the curtain. Most swaps are quick; a deep
 * dungeon floor is not. The card lives inside the curtain and only becomes
 * visible after a short delay (in CSS), so a fast swap is a clean dip to black
 * and a slow one gets a destination, a turning sigil and a tip.
 */

import { events } from '../core/Events';
import { save } from '../core/Save';
import { Random, randomSeed } from '../core/RNG';
import { TIPS, nextTip } from './tips';
import { mountKeyArt } from '../art/KeyArt';
import { dividerUri } from '../art/Ornament';

let mounted = false;

export function mountTransitions(): void {
  if (mounted) return;
  mounted = true;
  const fade = document.getElementById('fade');
  if (!fade) return;

  const card = document.createElement('div');
  card.className = 'ld-card';
  card.innerHTML =
    '<div class="ld-sigil" aria-hidden="true">' +
    '<svg viewBox="0 0 100 100"><g fill="none" stroke="currentColor">' +
    '<circle cx="50" cy="50" r="44" stroke-width="0.8" opacity="0.5"/>' +
    '<circle cx="50" cy="50" r="38" stroke-width="0.6" stroke-dasharray="2 5" class="ld-spin-a"/>' +
    '<path d="M50 8 L58 50 L50 92 L42 50 Z" stroke-width="1" class="ld-spin-b"/>' +
    '<path d="M8 50 L50 42 L92 50 L50 58 Z" stroke-width="1" class="ld-spin-b"/>' +
    '<circle cx="50" cy="50" r="5" stroke-width="1.2"/>' +
    '</g></svg></div>' +
    '<div class="ld-kicker"></div>' +
    '<div class="ld-title"></div>' +
    '<div class="ld-tip"><span class="ld-tip-k">Tip</span><span class="ld-tip-text"></span></div>';
  fade.appendChild(card);

  // A gold filigree divider (art stream) in place of the tip's hairline.
  const tipRow = card.querySelector<HTMLElement>('.ld-tip');
  if (tipRow) {
    try {
      tipRow.style.borderTop = '0';
      tipRow.style.paddingTop = '30px';
      tipRow.style.background = `url(${dividerUri(320, 'gold')}) center top / 320px 24px no-repeat`;
    } catch {
      /* the hairline stays */
    }
  }

  // The key art (art stream) fades in behind the card on slow swaps only.
  let art: HTMLCanvasElement | null = null;
  try {
    art = mountKeyArt(fade, 0);
    art.style.transition = 'opacity 600ms ease';
  } catch {
    art = null;
  }
  const showArt = (on: boolean): void => {
    if (!art) return;
    art.style.transitionDelay = on ? '380ms' : '0ms';
    art.style.opacity = on ? '0.35' : '0';
  };

  const kicker = card.querySelector<HTMLElement>('.ld-kicker')!;
  const title = card.querySelector<HTMLElement>('.ld-title')!;
  const tipText = card.querySelector<HTMLElement>('.ld-tip-text')!;
  const rng = new Random(randomSeed());
  let tip = -1;

  events.on('scene:loading', (p) => {
    let k = '';
    let t = '';
    if (p.to === 'dungeon') {
      const depth = Math.max(1, Number((p.payload as { depth?: number } | undefined)?.depth ?? 1));
      k = p.from === 'dungeon' ? 'Deeper still' : 'Descending';
      t = `Depth ${depth}`;
    } else if (p.to === 'town') {
      k = p.from === 'dungeon' ? 'Climbing out' : 'Returning';
      t = 'The Town';
      const c = save.account.current;
      if (c && p.from !== 'dungeon') k = c.name;
    } else {
      // Menus build instantly; a card would only flash.
      card.classList.remove('is-on');
      showArt(false);
      return;
    }
    tip = nextTip(tip, () => rng.next());
    kicker.textContent = k;
    title.textContent = t;
    tipText.textContent = TIPS[tip] ?? '';
    card.classList.add('is-on');
    showArt(true);
  });

  events.on('scene:change', () => {
    card.classList.remove('is-on');
    showArt(false);
  });
}
