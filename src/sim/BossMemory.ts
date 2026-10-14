/**
 * SLAY — which bosses a hero and an account have fought.
 *
 * The boss picker (`pickBossForDepth`) reads this so runs feel different: a
 * life does not meet the same boss twice while another fits its depth, and
 * the account's least-fought bosses come up more often. A fight counts the
 * moment the boss is engaged, win or lose.
 */
import type { AccountSave, Character } from '../types';
import type { BossMemory } from '../data/bosses';
import { legacyOf } from './Legacy';

/** The account's fight counts, repaired in place. */
function seenOf(account: AccountSave): Record<string, number> {
  const l = legacyOf(account);
  if (!l.bossesSeen || typeof l.bossesSeen !== 'object' || Array.isArray(l.bossesSeen)) l.bossesSeen = {};
  return l.bossesSeen;
}

/** What the picker should remember for this hero on this account. */
export function bossMemoryOf(account: AccountSave, hero: Character | null): BossMemory {
  const met = hero && Array.isArray(hero.bossesMet) ? hero.bossesMet : [];
  return { met, seen: seenOf(account) };
}

/** A boss has been engaged: the hero has met it, and the account has seen it once more. */
export function recordBossFought(account: AccountSave, hero: Character | null, id: string): void {
  const seen = seenOf(account);
  seen[id] = Math.max(0, Math.floor(Number(seen[id]) || 0)) + 1;
  if (hero) {
    if (!Array.isArray(hero.bossesMet)) hero.bossesMet = [];
    if (!hero.bossesMet.includes(id)) hero.bossesMet.push(id);
  }
}
