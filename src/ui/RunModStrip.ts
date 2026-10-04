/**
 * SLAY — the descent's modifiers, as a row of chips under the depth header.
 *
 * `scenes/RunModifiers.ts` calls `showRunModifiers` on the first floor and
 * with an empty list when the run ends. Each chip shows the modifier's name and
 * tier; hovering explains it. Safe to call with no DOM (checkers): it does
 * nothing.
 */

import { hoverHooks } from './Widgets';

let strip: HTMLDivElement | null = null;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

export function showRunModifiers(list: Array<{ name: string; desc: string; tier: number }>): void {
  if (typeof document === 'undefined') return;
  if (!list.length) {
    strip?.remove();
    strip = null;
    return;
  }
  if (!strip) {
    strip = document.createElement('div');
    strip.className = 'depth-mods';
  }
  // Under the depth header when the HUD has one; on its own otherwise.
  const host = document.querySelector('.hud-topleft');
  if (host) {
    strip.classList.remove('is-floating');
    host.appendChild(strip);
  } else {
    strip.classList.add('is-floating');
    (document.querySelector('#ui-root') ?? document.body).appendChild(strip);
  }
  strip.replaceChildren();
  for (const m of list) {
    const chip = document.createElement('span');
    chip.className = 'depth-mod';
    chip.textContent = `${m.name}${m.tier > 1 ? ` ${ROMAN[m.tier] ?? m.tier}` : ''}`;
    chip.addEventListener('pointerenter', () => hoverHooks.text?.(m.desc, chip, m.name));
    chip.addEventListener('pointerleave', () => hoverHooks.hide?.());
    strip.appendChild(chip);
  }
}
