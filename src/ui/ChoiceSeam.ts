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

/** What the gate offers before a descent (ui/GatePanel.ts). */
export interface GateOffer {
  /** The deepest tier this character may start: the one after their best clear. */
  top: number;
  /** Their best clear, 0 for none. */
  record: number;
  /** Legacy waypoints deeper than `top`, if unlocked. */
  waypoints: number[];
  /** The hero's level, for the danger reading. */
  level: number;
}

export type GateHandler = (offer: GateOffer, onPick: (depth: number | null) => void) => void;

let gate: GateHandler | null = null;

export function setGateHandler(h: GateHandler | null): void {
  gate = h;
}

/**
 * Asks which tier to descend to. `onPick` gets the depth, or null when the
 * player walks away. Without the UI it goes to the top tier, as the gate
 * always did.
 */
export function offerGate(offer: GateOffer, onPick: (depth: number | null) => void): void {
  if (!gate) {
    onPick(offer.top);
    return;
  }
  gate(offer, onPick);
}
