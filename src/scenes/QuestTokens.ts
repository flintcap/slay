/**
 * SLAY — where the generated quests' pickups and places come from.
 *
 * The run generator (`world/DungeonGen.ts` QUESTS) asks for relics, corpse-keys,
 * "reach the lowest floor" and "open the reliquary". Nothing in the game made a
 * relic or marked a place, so those quests could never be finished. This is
 * the rule book that says what each moment of a descent is worth to them:
 *
 *   - Relics: one in every chest you open, two on the quest altar, one on
 *     every elite or rare, two on the floor boss.
 *   - Corpse-keys: one on every champion or better.
 *   - `marker:bottom`: arriving on the run's last floor.
 *   - `marker:altar`: using the quest altar (the reliquary).
 *   - `marker:exit`: taking a down stair.
 *
 * DungeonScene calls these at the matching moments. Every call is safe on any
 * quest: `sim/Quests` only advances objectives whose filter matches.
 */

import type { MonsterRank, QuestInstance } from '../types';
import { onCollect, onReach } from '../sim/Quests';
import { toast } from '../core/Events';

export type QuestToken = 'relic' | 'key';

const TOKEN_NAME: Record<QuestToken, string> = { relic: 'Relic', key: 'Corpse-key' };

/** How many of each token a kill of this rank yields. */
export function tokensFromKill(rank: MonsterRank): Partial<Record<QuestToken, number>> {
  switch (rank) {
    case 'champion':
      return { key: 1 };
    case 'elite':
    case 'rare':
      return { key: 1, relic: 1 };
    case 'boss':
      return { key: 1, relic: 2 };
    default:
      return {};
  }
}

export const TOKENS_FROM_CHEST: Partial<Record<QuestToken, number>> = { relic: 1 };
export const TOKENS_FROM_ALTAR: Partial<Record<QuestToken, number>> = { relic: 2 };

/** The open collect objective for a token, if the quest wants one. */
function wants(quest: QuestInstance | null | undefined, token: QuestToken) {
  if (!quest || quest.complete) return null;
  return (
    quest.objectives.find((o) => {
      const f = (o.filter ?? '').trim().toLowerCase();
      return o.kind === 'collect' && !o.done && (f === `item:${token}` || f === token);
    }) ?? null
  );
}

function grant(quest: QuestInstance | null | undefined, tokens: Partial<Record<QuestToken, number>>): void {
  if (!quest) return;
  for (const [token, n] of Object.entries(tokens) as Array<[QuestToken, number]>) {
    const o = wants(quest, token);
    if (!o || n <= 0) continue;
    onCollect(quest, `item:${token}`, n);
    if (!o.done) toast(`${TOKEN_NAME[token]} recovered (${o.progress}/${o.target})`, 'info');
  }
}

export const questTokens = {
  kill(quest: QuestInstance | null | undefined, rank: MonsterRank): void {
    grant(quest, tokensFromKill(rank));
  },
  chest(quest: QuestInstance | null | undefined): void {
    grant(quest, TOKENS_FROM_CHEST);
  },
  altar(quest: QuestInstance | null | undefined): void {
    grant(quest, TOKENS_FROM_ALTAR);
    if (quest) onReach(quest, 'marker:altar');
  },
  /** A floor was loaded. The last one is the bottom of the run. */
  floor(quest: QuestInstance | null | undefined, index: number, total: number): void {
    if (quest && index >= total - 1) onReach(quest, 'marker:bottom');
  },
  /** A down stair was taken. */
  exit(quest: QuestInstance | null | undefined): void {
    if (quest) onReach(quest, 'marker:exit');
  },
};
