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
import { tr } from '../../core/I18n';

const RARE: Partial<Record<ItemCategory, string[]>> = {
  sword: [
    tr('Caul forged these by the thousand for a war at depth. This one went.'),
    tr('Honed so often the blade is a finger narrower than it was made.'),
    tr('Someone scratched a tally on the ricasso and stopped at nine.'),
  ],
  axe: [
    tr('A felling axe, once. The trees on the hill are gone, and it found other work.'),
    tr('The haft has been replaced. The head has not, and remembers everything.'),
    tr('Notched along the beard, one notch for every tier.'),
  ],
  mace: [
    tr('Heavy enough that the argument is over before it starts.'),
    tr('Flanged by a smith who did not hold with subtlety.'),
    tr('The grip is worn to the shape of a hand much larger than yours.'),
  ],
  dagger: [
    tr('Small, quiet, and never the first thing anyone looks for.'),
    tr('It lived in a boot for a long time. It is glad to be out.'),
    tr('Sharpened down to almost nothing, and still sharpening.'),
  ],
  spear: [
    tr('The watch at Stairhead carries spears like this. This one went further than the watch.'),
    tr('A long reach, for things you would rather not be close to.'),
    tr('The shaft is ash from the hill, cut when the hill still had trees.'),
  ],
  bow: [
    tr('The string hums when something moves below you.'),
    tr('Strung with gut. Better not to ask whose.'),
    tr('Rangers mapped the descent by walking it. This bow walked it with one of them.'),
  ],
  crossbow: [
    tr('Built in the Works, to a pattern for soldiers who were never made.'),
    tr('The ratchet clicks like a clerk counting.'),
    tr('Slow to load. Very final.'),
  ],
  wand: [
    tr('Bone, wrapped in wire, warm at one end.'),
    tr('It has been pointed at worse things than you, and lately.'),
    tr('Something lives in the grain and does not like to be idle.'),
  ],
  staff: [
    tr('Cut from a root that came down through a cavern roof, still growing when it was cut.'),
    tr('The ferrule is worn flat by a great many stairs.'),
    tr('Set it down and it leans toward the deep.'),
  ],
  scepter: [
    tr('An office of Caul came with it. The office is gone. The authority is not.'),
    tr('It was made to be held over kneeling people.'),
    tr('The head is a small lamp that has never needed oil.'),
  ],
  shield: [
    tr('Scored on the face and clean on the rim, the way Kale likes them.'),
    tr('Something has been trying this shield for a long time, and is still trying, somewhere.'),
    tr('The boss is dented inward, very deeply, in one place.'),
  ],
  orb: [
    tr('Cold, and full of a weather you cannot see.'),
    tr('Look into it long enough and something looks back, politely.'),
    tr('Ground from the Spire\'s glass, which is not glass.'),
  ],
  quiver: [
    tr('Every arrow in it came back once. Not every arrow comes back twice.'),
    tr('Fletched with grey feathers from birds that nest under the hill.'),
    tr('It rattles when you run, and never when you hide.'),
  ],
  helm: [
    tr('The padding was replaced by the last owner, and by the one before.'),
    tr('The visor is dented exactly where an eye would be.'),
    tr('Inside the brow, one name scratched out and another scratched in.'),
  ],
  chest: [
    tr('Mended so often there is more thread than leather.'),
    tr('Rust where the blood dried. Polish everywhere else.'),
    tr('Somebody\'s estate. Corvane has the paperwork.'),
  ],
  gloves: [
    tr('The fingertips are worn through from climbing.'),
    tr('They still hold the warmth of the last hands in them, somehow.'),
    tr('Stained to the wrist with something that will not wash out.'),
  ],
  boots: [
    tr('They know the stair better than you do.'),
    tr('Resoled at Stairhead twice, by people who expected to see them again.'),
    tr('They have walked down a great deal further than they have walked up.'),
  ],
  belt: [
    tr('The buckle is Caul work. The leather is newer, and less sure of itself.'),
    tr('Every loop once held something a delver needed. Most still do.'),
    tr('Cinched hard enough to keep someone upright after they should have fallen.'),
  ],
  amulet: [
    tr('Worn against the skin by someone who believed in it. It may have helped.'),
    tr('The chain is new. The pendant is not, and it is heavier than it looks.'),
    tr('It is warm when you face down the stair.'),
  ],
  ring: [
    tr('A plain band that has been on a great many fingers, none of them for long.'),
    tr('Engraved inside: hold. Nothing else.'),
    tr('It turns on the finger by itself, a little, when something is near.'),
  ],
  charm: [
    tr('Kept in a pocket for luck by someone whose luck ran out.'),
    tr('It hums, very faintly, in a key the Listener would know.'),
    tr('Wrapped in a scrap of linen from the Ossuary shelves.'),
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
