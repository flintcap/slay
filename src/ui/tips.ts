/**
 * SLAY — loading-screen tips.
 *
 * Every line here must be true of the game as it is. A tip that teaches the
 * wrong key is worse than no tip, so the controls lines are written against
 * the bindings in `core/Input.ts` and the click handling in DungeonScene.
 */

export const TIPS: readonly string[] = [
  'Right click attacks with whatever you have bound to it. Left click moves.',
  'Space dodges. A well-timed dodge passes straight through a heavy swing.',
  'Q drinks a life potion. F drinks a mana potion. Both refill from the alchemist.',
  'Hold Shift to show the name of every item on the floor.',
  'Keys 1 to 6 cast the skills on your bar. Drag skills onto it from the tree with T.',
  'Every level brings stat points and a skill point. C and T spend them.',
  'The vault, opened with B in town, is shared by every character on the account.',
  'Gold left in your pocket dies with you. Gold in the bank does not.',
  'Elites wear their affixes over their heads. Read them before you engage.',
  'Bosses mark the ground before their biggest attacks. Step out of the marked area.',
  'Each floor of a depth is harder than the last, and the boss waits on the final one.',
  'Clearing a depth banks it as your record. The next run can start deeper.',
  'Set items grow stronger with every piece of the set you wear.',
  'Unique items always roll the same powers. The numbers are what change.',
  'The blacksmith in town can upgrade the gear you already love.',
  'Resistances stack from gear and skills. Deeper biomes punish anyone who ignores them.',
  'M opens the map. Unexplored rooms are where the loot is.',
  'L opens the quest log. Every depth has a task worth finishing before the stairs.',
  'Potions are cheap. Dying with a full belt is not.',
  'A slow character is a dead character. Movement speed is worth more than it looks.',
  'Your summons and traps keep fighting while you reposition. Let them.',
  'The memorial keeps every name. The vault keeps everything else.',
  'Harder difficulties drop better loot and more of it. They also hit harder.',
  'E talks to townsfolk and opens chests and doors.',
  'Beating the boss opens a portal home. Step through it to bank the depth.',
];

/** A tip that is not the one just shown. */
export function nextTip(prev: number, roll: () => number): number {
  if (TIPS.length < 2) return 0;
  let i = Math.floor(roll() * TIPS.length);
  if (i === prev) i = (i + 1) % TIPS.length;
  return i;
}
