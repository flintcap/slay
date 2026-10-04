/**
 * SLAY — the seam between game rules that ask the player to choose and the
 * panel that asks.
 *
 * Kept free of the DOM so systems (`scenes/RunEvents.ts`) can import it under
 * a headless checker. `ui/DepthUI.ts` installs the real panel at mount; until
 * then, and in checkers that install nothing, every offer is walked away from.
 */

import type { ChoiceOption } from './ChoicePanel';

export type ChoiceHandler = (
  title: string,
  subtitle: string,
  options: ChoiceOption[],
  onPick: (id: string | null) => void,
) => void;

let handler: ChoiceHandler | null = null;

export function setChoiceHandler(h: ChoiceHandler | null): void {
  handler = h;
}

/**
 * Offers the player a choice. `onPick` receives the chosen id, or null when
 * they walk away. Safe to call before the UI exists: it then picks nothing.
 */
export function offerChoice(title: string, subtitle: string, options: ChoiceOption[], onPick: (id: string | null) => void): void {
  if (!handler) {
    onPick(null);
    return;
  }
  handler(title, subtitle, options, onPick);
}
