/**
 * SLAY — what a hero carried into a map, and what leaving early costs.
 *
 * Going down a map writes down what the hero holds: every worn and packed
 * item, their gold and the account's materials. A map that ends well (the
 * last exit, the waypoint ring) throws the note away and the hero keeps all
 * of it. A map left any other way is settled from the note: the menu's
 * Return to Town and Quit to Title, closing the tab, a refresh, a crash. The
 * hero is back in town with what they took down, nothing found on the map,
 * and a share of a level's experience gone. Never a level, never the hero:
 * a game that closes is not the player's fault.
 *
 * The note is on the character in the save, so a crash settles it on the
 * next load (`core/Save.ts`).
 */
import type { Character, Item, RunLedger } from '../types';
import { MAX_LEVEL, xpForLevel } from './Stats';
import { tr, trn, numGrouped } from '../core/I18n';

/** Share of the current level's experience a map left early costs. */
export const LEAVE_XP_SHARE = 0.1;

/** What leaving a map early took. */
export interface Forfeit {
  name: string;
  /** Items found on the map that are gone. */
  items: number;
  gold: number;
  xp: number;
}

const copy = <T>(v: T): T => structuredClone(v);

/** Writes down what `c` carries as they go down a map at `depth`. */
export function beginRun(c: Character, materials: Record<string, number>, depth: number): void {
  c.run = {
    v: 1,
    at: Date.now(),
    depth,
    equipment: copy(c.equipment),
    inventory: copy(c.inventory),
    gold: c.gold,
    materials: copy(materials),
  };
}

/** The map ended well: the hero keeps everything. */
export function endRun(c: Character): void {
  delete c.run;
}

function carried(c: Pick<Character, 'equipment' | 'inventory'>): Item[] {
  return [...Object.values(c.equipment), ...c.inventory].filter((it): it is Item => !!it);
}

/**
 * The map was left early: `c` holds again what they took down (and
 * `materials` what the account had), less `LEAVE_XP_SHARE` of the current
 * level's experience, never below the level's start. Null when there was no
 * map in progress. Grid repair is the caller's (`core/Save.ts`).
 */
export function forfeitRun(c: Character, materials: Record<string, number>): Forfeit | null {
  const run: RunLedger | undefined = c.run;
  if (!run) return null;
  delete c.run;
  const before = new Set(carried(run).map((it) => it.uid));
  const found = carried(c).filter((it) => !before.has(it.uid)).length;
  const gold = Math.max(0, c.gold - run.gold);
  c.equipment = run.equipment;
  c.inventory = run.inventory;
  c.gold = run.gold;
  for (const k of Object.keys(materials)) delete materials[k];
  Object.assign(materials, run.materials);
  const need = c.level >= MAX_LEVEL ? 0 : xpForLevel(c.level);
  const xp = Math.min(c.xp, Math.floor(need * LEAVE_XP_SHARE));
  c.xp -= xp;
  return { name: c.name, items: found, gold, xp };
}

/** One line for a toast: what leaving cost. */
export function forfeitText(f: Forfeit): string {
  const lost: string[] = [];
  if (f.items) lost.push(trn(f.items, '{0} item', '{0} items', f.items));
  if (f.gold) lost.push(tr('{0} gold', numGrouped(f.gold)));
  if (f.xp) lost.push(tr('{0} experience', numGrouped(f.xp)));
  return lost.length ? tr('{0} is back in town. Lost: {1}.', f.name, lost.join(', ')) : tr('{0} is back in town.', f.name);
}
