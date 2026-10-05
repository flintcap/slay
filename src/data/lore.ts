/**
 * SLAY — the words that ride along with a run's quest.
 *
 * This file used to hold every piece of writing in the game. Most of it was
 * never shown, and much of it named bosses, monsters and townsfolk that do not
 * exist. What the game really shows now lives under `data/story/`:
 *
 *   premise.ts      the why, and the chapters of the descent
 *   npcs.ts         the people of Stairhead and what they say
 *   chains.ts       the hand-written contracts
 *   bossVoices.ts   what every boss says, and what it left on its floor
 *   notes.ts        pages found in the dungeon
 *   places.ts       the layers, as Stairhead names them
 *   itemFlavor.ts   a line under rare items
 *   uniqueText.ts   names and lines for uniques and sets
 *
 * What is left here is what `sim/Quests.ts` reads: a briefing, a line as each
 * objective falls, and the words on success or failure for the random quests
 * in `data/quests.ts`, and the names the run's stalking elite can wear.
 *
 * House style, as everywhere: restraint over volume, concrete nouns, nobody
 * knows they are in a story. No dashes; a full stop does the work.
 */

import type { Rng } from '../types';

/** Deterministic pick with a graceful fallback for empty pools. */
export function pickLine(pool: readonly string[], rng: Rng, fallback = ''): string {
  if (pool.length === 0) return fallback;
  return rng.pick(pool);
}

// ---------------------------------------------------------------------------
// Quest lore
// ---------------------------------------------------------------------------

export interface QuestLore {
  /** Shown when the quest is offered, under the objective list. */
  brief?: string;
  /** Said as each objective but the last is finished, in order. */
  whisper?: string[];
  /** Shown on completion. */
  onComplete?: string;
  /** Shown on failure. */
  onFail?: string;
}

/**
 * Keyed by QuestDef.id. Partial: `questLore` returns a plain set for any quest
 * without its own entry, so a new quest never reads as unfinished. The plain
 * set has no whispers: a line on every objective of every run would wear thin.
 */
export const QUEST_LORE: Record<string, QuestLore> = {
  the_tithe: {
    brief: `The bargain is old and the terms are plain: what is stored below is stored for somebody, and the somebody collects at the lid.`,
    whisper: [`The next one will be worse.`, `It is keeping count.`],
    onComplete: `The last guardian goes down and the tithe is paid. The chests stay open behind you.`,
    onFail: `The tithe goes unpaid. Nothing objects aloud. It simply notes the shortfall.`,
  },
  bloodless: {
    brief: `Vell will not sell to you today. She has her reasons, and one of them is that you asked her to.`,
    whisper: [`The bottle is still in your belt. That is the whole test.`],
    onComplete: `You come up dry-mouthed, shaking and undosed. Vell looks at you a long moment and writes something down.`,
    onFail: `The cork comes out. Nobody blames you. The wager is simply over.`,
  },
  the_long_dark: {
    brief: `Every torch on this tier is out and the sconces are cold. Whatever put them out did it thoroughly, and in order.`,
    whisper: [`Your light reaches nine feet. Something has measured it.`],
    onComplete: `You come up the stair with the same flame you carried down. That is not nothing.`,
  },
  hunters_mark: {
    brief: `Something has taken an interest and will follow you down. Each time it slips away it comes back heavier.`,
    whisper: [`It is on this tier. It has stopped hiding it.`],
    onComplete: `It goes down at last, on the tier where it decided to stand. It was bigger than when it started. So were you.`,
    onFail: `It breaks off, satisfied, and goes to wait somewhere deeper.`,
  },
  reliquary: {
    brief: `Five fragments, five champions, and one unpleasant property: the reliquary draws its protection from whoever carries it.`,
    whisper: [`The fragments are cold against your ribs. Carrying them is costing you something.`],
    onComplete: `The reliquary closes on the last fragment, and whatever it was taking from you stops, all at once.`,
  },
  the_lantern_bearer: {
    brief: `He knows the way to the lower vault and he will not draw it for you. He has been let down before.`,
    whisper: [`He is talking to keep his nerve up. Let him.`],
    onComplete: `He gets to the stair, sits down on the bottom step, and laughs for rather too long.`,
    onFail: `The lantern goes out on the floor beside him. You take it. There is nothing else to take.`,
  },
  hold_the_shrine: {
    brief: `The shrine is lit. It will stay lit for as long as somebody is standing in the light.`,
    whisper: [`They are coming down the corridor. Hold.`],
    onComplete: `The last of them falls back into the dark and the shrine burns steady, having asked for exactly what it asked for.`,
    onFail: `The light goes out. Very simply, and all at once.`,
  },
  widows_keepsake: {
    brief: `A brass locket, nine coppers' worth. Inside it, a curl of hair and a name the widow will not say aloud.`,
    whisper: [`The locket is warm. It was not warm when you picked it up.`],
    onComplete: `She takes the locket without opening it, and pays the nine hundred, and does not count it.`,
    onFail: `The locket is somewhere on the floor of a tier you will not see again. She will ask. Tell her the truth.`,
  },
  the_third_watch: {
    brief: `Six tokens of the watch, stamped with Stairhead's three towers. Renn wants them back. She does not want to know what wore them.`,
    whisper: [`The token is dented where a chest would be.`],
    onComplete: `Renn lays the tokens out on the table in a row and stands there a while. Then she puts them in the drawer with the others.`,
  },
  cartographers_debt: {
    brief: `Anwen Doss charted further than anyone paid her for. Her stations are still standing. Her pages are scattered.`,
    whisper: [`Her hand is very neat, right up to the last line.`],
    onComplete: `Wenna pins the chart on her wall, with a gap in it the shape of the fourth tier. It is the best map anyone has.`,
  },
  drowned_procession: {
    brief: `Sister Ottilie walks slowly and does not stop to pray. She says the praying is the walking.`,
    whisper: [`She blesses the station and her hand does not shake. Yours does.`],
    onComplete: `At the sanctum Ottilie kneels at the water's edge and puts her face to it, and comes up again, which is more than most.`,
    onFail: `She goes into the water before you can reach her. The congregation makes room on the bench.`,
  },
  the_last_expedition: {
    brief: `Ashka has been below so long she walks like the things that live here. She knows the long way. She will not take the short one.`,
    whisper: [`She stops to touch a wall, as if greeting someone.`],
    onComplete: `Ashka climbs the last step, looks at the sky a long time, and asks whether Gilder is still alive. He is. She goes to find him.`,
    onFail: `She sits down on the floor and will not get up. She says she has been here before, and it ended the same way.`,
  },
  the_last_watch: {
    brief: `Holt carries his old spear and does not lean on it. He wants to stand the shift his watch did not finish.`,
    whisper: [`Holt counts the watch under his breath. The names, not the hours.`],
    onComplete: `When the shift ends Holt nods once, as if someone had relieved him, and lets you take him home.`,
    onFail: `Holt falls at his post. It is, he would tell you, where he meant to be.`,
  },
  salvage_rights: {
    brief: `Six expeditions never came back. Their packs belong to the town, by charter. Their owners may not agree.`,
    whisper: [`This pack has a name stitched inside the flap. You do not read it.`],
    onComplete: `Corvane logs every pack and every item in it, and pays the finder's share without being asked, which is unlike him.`,
  },
};

const PLAIN_QUEST_LORE: QuestLore = {
  brief: `A reason to be down here, which is more than most people manage.`,
  onComplete: `Done, logged and paid. The tier goes back to what it was doing.`,
  onFail: `The contract lapses. Nobody down here was ever going to enforce it.`,
};

export function questLore(questId: string): QuestLore {
  return QUEST_LORE[questId] ?? PLAIN_QUEST_LORE;
}

// ---------------------------------------------------------------------------
// Names a run's stalking elite can wear
// ---------------------------------------------------------------------------

export const NAMED_ELITES: string[] = [
  `The Marked`,
  `Grinning Ossric`,
  `Vhal, Who Waited`,
  `The Second Shift`,
  `Nine-Fingers`,
  `The Quiet Half`,
  `Bell-Ringer`,
  `Thrice-Buried Sela`,
  `The Uninvited Guest`,
  `Cold Amma`,
];
