/**
 * SLAY — loading-screen tips.
 *
 * Every line here must be true of the game as it is. A tip that teaches the
 * wrong key is worse than no tip, so the controls lines are written against
 * the bindings in `core/Input.ts` and the click handling in DungeonScene.
 */

import { tr } from '../core/I18n';
export const TIPS: readonly string[] = [
  tr('Right click attacks with whatever you have bound to it. Left click moves.'),
  tr('Space dodges. A well-timed dodge passes straight through a heavy swing.'),
  tr('Q drinks a life potion. F drinks a mana potion. Both refill from the alchemist.'),
  tr('Hold Shift to show the name of every item on the floor.'),
  tr('Keys 1 to 6 cast the skills on your bar. Drag skills onto it from the tree with T.'),
  tr('Every level brings stat points and a skill point. C and T spend them.'),
  tr('The vault, opened with B in town, is shared by every character on the account.'),
  tr('Gold left in your pocket dies with you. Gold in the bank does not.'),
  tr('Elites wear their affixes over their heads. Read them before you engage.'),
  tr('Bosses mark the ground before their biggest attacks. Step out of the marked area.'),
  tr('Stuns never hold a boss. They fill the gold bar under its life, and so do hard hits. Fill it and the boss is broken: held still and taking more damage.'),
  tr('Each zone of a map is harder than the last, and the boss waits in the final one.'),
  tr('Clearing a map banks its tier as your record. The next portal opens deeper.'),
  tr('Set items grow stronger with every piece of the set you wear.'),
  tr('Unique items always roll the same powers. The numbers are what change.'),
  tr('The blacksmith in town can upgrade the gear you already love.'),
  tr('Resistances stack from gear and skills. Deeper biomes punish anyone who ignores them.'),
  tr('M opens the map. Unexplored rooms are where the loot is.'),
  tr('L opens the quest log. Every map has a task worth finishing before the boss falls.'),
  tr('Potions are cheap. Dying with a full belt is not.'),
  tr('A slow character is a dead character. Movement speed is worth more than it looks.'),
  tr('Your summons and traps keep fighting while you reposition. Let them.'),
  tr('The memorial keeps every name. The vault keeps everything else.'),
  tr('Harder difficulties drop better loot and more of it. They also hit harder.'),
  tr('E talks to townsfolk and opens chests and doors.'),
  tr('Beating the boss opens a portal home. Step through it to bank the tier.'),
];

/** A tip that is not the one just shown. */
export function nextTip(prev: number, roll: () => number): number {
  if (TIPS.length < 2) return 0;
  let i = Math.floor(roll() * TIPS.length);
  if (i === prev) i = (i + 1) % TIPS.length;
  return i;
}
