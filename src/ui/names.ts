/**
 * SLAY — character name rules.
 *
 * Pure, so `tools/check-menus.mjs` can exercise them without a browser.
 */

import type { Character } from '../types';
import { tr } from '../core/I18n';

export interface NameCheck {
  ok: boolean;
  name: string;
  /** Shown under the field. Empty when there is nothing to say. */
  message: string;
  tone: 'ok' | 'warn' | 'bad';
}

/**
 * The rules for a character name. Exported so the check and any tooling agree.
 * Letters (any script), spaces, hyphens and apostrophes; 2 to 16 characters;
 * not the same as a living character on this account.
 */
export function checkName(raw: string, roster: Character[], fallen: Array<{ name: string }>): NameCheck {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, name, message: tr('Every grave needs a name.'), tone: 'bad' };
  if (name.length < 2) return { ok: false, name, message: tr('At least two letters.'), tone: 'bad' };
  if (name.length > 16) return { ok: false, name, message: tr('Sixteen characters at most.'), tone: 'bad' };
  if (!/^\p{L}[\p{L}' -]*$/u.test(name)) {
    return { ok: false, name, message: tr('Letters, spaces, hyphens and apostrophes only.'), tone: 'bad' };
  }
  if (/['\- ]{2,}/.test(name) || /['\- ]$/.test(name)) {
    return { ok: false, name, message: tr('That name trails off. Finish it with a letter.'), tone: 'bad' };
  }
  const lower = name.toLowerCase();
  if (roster.some((c) => c.name.toLowerCase() === lower)) {
    return { ok: false, name, message: tr('{0} is already alive on this account.', name), tone: 'bad' };
  }
  if (fallen.some((f) => f.name.toLowerCase() === lower)) {
    return { ok: true, name, message: tr('A {0} already lies in the memorial. The name is free.', name), tone: 'warn' };
  }
  return { ok: true, name, message: '', tone: 'ok' };
}

