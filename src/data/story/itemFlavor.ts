/**
 * SLAY — a line under the item.
 *
 * Uniques carry their own flavour (`data/uniques.ts`). Set pieces show their
 * set's blurb (`data/sets.ts`). Rare items get one line from the pool for their
 * kind, chosen by the item's own id so the same item always reads the same.
 * Plain and magic items stay quiet: flavour is for the things worth keeping.
 */

import type { Item, ItemCategory } from '../../types';
import { getSet } from '../sets';

const RARE: Partial<Record<ItemCategory, string[]>> = {
  sword: [
    `Caul forged these by the thousand for a war at depth. This one went.`,
    `Honed so often the blade is a finger narrower than it was made.`,
    `Someone scratched a tally on the ricasso and stopped at nine.`,
  ],
  axe: [
    `A felling axe, once. The trees on the hill are gone, and it found other work.`,
    `The haft has been replaced. The head has not, and remembers everything.`,
    `Notched along the beard, one notch for every tier.`,
  ],
  mace: [
    `Heavy enough that the argument is over before it starts.`,
    `Flanged by a smith who did not hold with subtlety.`,
    `The grip is worn to the shape of a hand much larger than yours.`,
  ],
  dagger: [
    `Small, quiet, and never the first thing anyone looks for.`,
    `It lived in a boot for a long time. It is glad to be out.`,
    `Sharpened down to almost nothing, and still sharpening.`,
  ],
  spear: [
    `The watch at Stairhead carries spears like this. This one went further than the watch.`,
    `A long reach, for things you would rather not be close to.`,
    `The shaft is ash from the hill, cut when the hill still had trees.`,
  ],
  bow: [
    `The string hums when something moves below you.`,
    `Strung with gut. Better not to ask whose.`,
    `Rangers mapped the descent by walking it. This bow walked it with one of them.`,
  ],
  crossbow: [
    `Built in the Works, to a pattern for soldiers who were never made.`,
    `The ratchet clicks like a clerk counting.`,
    `Slow to load. Very final.`,
  ],
  wand: [
    `Bone, wrapped in wire, warm at one end.`,
    `It has been pointed at worse things than you, and lately.`,
    `Something lives in the grain and does not like to be idle.`,
  ],
  staff: [
    `Cut from a root that came down through a cavern roof, still growing when it was cut.`,
    `The ferrule is worn flat by a great many stairs.`,
    `Set it down and it leans toward the deep.`,
  ],
  scepter: [
    `An office of Caul came with it. The office is gone. The authority is not.`,
    `It was made to be held over kneeling people.`,
    `The head is a small lamp that has never needed oil.`,
  ],
  shield: [
    `Scored on the face and clean on the rim, the way Kale likes them.`,
    `Something has been trying this shield for a long time, and is still trying, somewhere.`,
    `The boss is dented inward, very deeply, in one place.`,
  ],
  orb: [
    `Cold, and full of a weather you cannot see.`,
    `Look into it long enough and something looks back, politely.`,
    `Ground from the Spire's glass, which is not glass.`,
  ],
  quiver: [
    `Every arrow in it came back once. Not every arrow comes back twice.`,
    `Fletched with grey feathers from birds that nest under the hill.`,
    `It rattles when you run, and never when you hide.`,
  ],
  helm: [
    `The padding was replaced by the last owner, and by the one before.`,
    `The visor is dented exactly where an eye would be.`,
    `Inside the brow, one name scratched out and another scratched in.`,
  ],
  chest: [
    `Mended so often there is more thread than leather.`,
    `Rust where the blood dried. Polish everywhere else.`,
    `Somebody's estate. Corvane has the paperwork.`,
  ],
  gloves: [
    `The fingertips are worn through from climbing.`,
    `They still hold the warmth of the last hands in them, somehow.`,
    `Stained to the wrist with something that will not wash out.`,
  ],
  boots: [
    `They know the stair better than you do.`,
    `Resoled at Stairhead twice, by people who expected to see them again.`,
    `They have walked down a great deal further than they have walked up.`,
  ],
  belt: [
    `The buckle is Caul work. The leather is newer, and less sure of itself.`,
    `Every loop once held something a delver needed. Most still do.`,
    `Cinched hard enough to keep someone upright after they should have fallen.`,
  ],
  amulet: [
    `Worn against the skin by someone who believed in it. It may have helped.`,
    `The chain is new. The pendant is not, and it is heavier than it looks.`,
    `It is warm when you face down the stair.`,
  ],
  ring: [
    `A plain band that has been on a great many fingers, none of them for long.`,
    `Engraved inside: hold. Nothing else.`,
    `It turns on the finger by itself, a little, when something is near.`,
  ],
  charm: [
    `Kept in a pocket for luck by someone whose luck ran out.`,
    `It hums, very faintly, in a key the Listener would know.`,
    `Wrapped in a scrap of linen from the Ossuary shelves.`,
  ],
};

/** Every rare pool, for the checker. */
export const RARE_FLAVOR = RARE;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The flavour line for an item that has no unique flavour of its own, or
 * undefined. `category` is the base's category.
 */
export function itemFlavor(item: Item, category?: ItemCategory): string | undefined {
  if (item.setId) return getSet(item.setId)?.blurb;
  if (item.rarity !== 'rare' || !category) return undefined;
  const pool = RARE[category];
  if (!pool || pool.length === 0) return undefined;
  return pool[hash(item.uid || item.baseId) % pool.length];
}
