/**
 * SLAY — who in town has something for you: the one source of truth for the
 * quest markers over people's heads.
 *
 *   - `offer`: they have work you can take now (a yellow "?").
 *   - `turnIn`: work you did for them is ready to hand in (a green "!").
 *   - `null`: nothing to do with them right now (no marker).
 *
 * Hand-in wins when both apply. A step that is taken and still being worked
 * shows nothing: there is nothing to do with the giver until it is done.
 *
 * Contracts (`sim/Chains.ts`) are given and taken back by people. Bounties
 * (`sim/TownServices.ts`) live on the board, which has no keeper, so the
 * board is its own marker spot (`BOARD`). Run quests are rolled with the map
 * and have no giver in town, so they never mark anyone.
 */
import type { AccountSave, Character } from '../types';
import type { NpcDef, NpcId } from '../data/story/types';
import { NPCS, NPC_IDS } from '../data/story/npcs';
import { offerFor, openWorkFor } from './Chains';
import { MAX_ACTIVE_BOUNTIES, townOf } from './TownServices';
import { hasUnlock } from './Legacy';

export type QuestMarker = 'offer' | 'turnIn' | null;

/** The marker spot of the bounty board. */
export const BOARD = 'bounties';

/** Every spot that can carry a marker: each resident, and the board. */
export type MarkerSpot = NpcId | typeof BOARD;

/** The rule, on its own: hand-in beats offer, and nothing is nothing. */
export function combineMarker(offer: boolean, ready: boolean): QuestMarker {
  if (ready) return 'turnIn';
  if (offer) return 'offer';
  return null;
}

/** What a person's marker is right now. */
export function npcMarker(npc: NpcDef | NpcId): QuestMarker {
  const def = typeof npc === 'string' ? NPCS[npc] : npc;
  if (!def) return null;
  return combineMarker(offerFor(def) !== null, openWorkFor(def).some((w) => w.ready));
}

/**
 * What the bounty board's marker is right now. It offers while it is open to
 * this account and the hero has a free hand (the board refills itself when it
 * is opened); it takes back any bounty that is done.
 */
export function boardMarker(account: AccountSave, c: Character | null | undefined): QuestMarker {
  if (!c || !hasUnlock(account, 'bounties')) return null;
  const list = townOf(c).bounties;
  const held = list.filter((b) => b.state === 'active' || b.state === 'done').length;
  return combineMarker(held < MAX_ACTIVE_BOUNTIES, list.some((b) => b.state === 'done'));
}

/** Every spot's marker. Cheap enough to ask several times a second. */
export function townMarkers(account: AccountSave, c: Character | null | undefined): Record<MarkerSpot, QuestMarker> {
  const out = {} as Record<MarkerSpot, QuestMarker>;
  for (const id of NPC_IDS) out[id] = npcMarker(id);
  out[BOARD] = boardMarker(account, c);
  return out;
}
