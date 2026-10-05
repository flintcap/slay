/**
 * SLAY — the layers, as the story names them.
 *
 * Every biome is one people's attempt at the Tenant, gone down a tier at a
 * time. This is what the story calls each one, what you see the first time
 * you walk into it, what it is like much deeper down, and the small things
 * you notice while you are in it.
 *
 *   firstEntry + description   a card, the first time any character enters
 *   deepEntry                  added to the journal once you have been far below its first tier
 *   ambient                    one line, now and then, while you explore
 *
 * The biome's own name and blurb (`world/Biomes.ts`) head the floor card; the
 * variants there give a run its own sub-name. The biome's name and its plain
 * variant's name must match `name` here (the checker holds them together).
 */

import type { BiomeId } from '../../types';

export interface Place {
  /** What Stairhead calls it. */
  name: string;
  /** Who made this layer, in a few words, for the journal. */
  makers: string;
  firstEntry: string;
  description: string;
  /** Tiers past the biome's first before `deepEntry` is told. */
  deepAfter: number;
  deepEntry: string;
  ambient: string[];
}

export const PLACES: Record<BiomeId, Place> = {
  crypt: {
    name: 'The Ossuary Tiers',
    makers: 'Caul, the city before the camp',
    firstEntry: `Cold air comes up the stair to meet you, carrying the smell of old stone and older linen.`,
    description: `Caul shelved its dead here in tiers, generation over generation, until the graveyard had storeys and stairwells and districts of its own. Every shelf is full. Every shelf has been dusted.`,
    deepAfter: 12,
    deepEntry: `The tiers go on past counting now. Whoever kept the ledgers gave up long before the dead did.`,
    ambient: [
      `Something turns over in a niche and settles again.`,
      `A name has been scratched off the wall. Only the scratching is left.`,
      `Two hundred skulls face the same way. You are walking the way they look.`,
      `A lamp burns grave oil. Someone filled it this morning.`,
      `The mortar between these stones was mixed with ash, and something finer.`,
      `Somewhere ahead, a broom.`,
    ],
  },
  caverns: {
    name: 'The Root Deeps',
    makers: 'Water, before anyone',
    firstEntry: `The worked stone gives out in the middle of a corridor, as if the masons put down their tools and left. Past it, the rock does as it pleases.`,
    description: `Water cut these halls long before anyone thought to bury anything, and it is still cutting, patiently, without an opinion. Roots hang through the ceiling from trees that died on the hill above.`,
    deepAfter: 12,
    deepEntry: `There is no masonry to give out down here. There never was. The dark is original.`,
    ambient: [
      `Water finds a way down. So did you.`,
      `A drip lands on the same stone it has struck for ten thousand years.`,
      `Something large came through here lately. The mud remembers.`,
      `Pale roots stir overhead, though there is no wind.`,
      `Your step comes back to you from four directions.`,
      `The air tastes of iron and wet stone.`,
    ],
  },
  foundry: {
    name: 'The Cindergate Works',
    makers: "Caul's armourers, for a war at depth",
    firstEntry: `Heat rolls up the shaft in a slow wave, and with it the sound of machines keeping their appointments.`,
    description: `The Works were built to arm Caul for a war below, and the war ended without telling them. The bellows still breathe. The moulds still fill. Somewhere down the line a hammer is shaping something to an order nobody living placed.`,
    deepAfter: 12,
    deepEntry: `The Works have grown. The new galleries are on no plan, and their tools are sized for hands you have not seen yet.`,
    ambient: [
      `A bell rings the change of shift. Nobody comes.`,
      `The floor is warm. It should not be warm.`,
      `A tally board counts up, in chalk, in a hand that never stops.`,
      `Slag cools in a channel, ticking as it goes.`,
      `Something down the line is being made. It is not finished.`,
      `An order book lies open at a page dated after the war.`,
    ],
  },
  sunkenTemple: {
    name: 'The Drowned Sanctum',
    makers: 'Those who prayed to it',
    firstEntry: `The stair goes down into standing water, and the water is very still, and it has been waiting.`,
    description: `The Sanctum was built to be flooded. Its priests held that water was an improvement: it made the god harder to look at and easier to hear. They were right about both.`,
    deepAfter: 12,
    deepEntry: `The flood has depth to it here. There are storeys under the surface, lit from below, and they are attended.`,
    ambient: [
      `The water is warmer than the air, which is wrong.`,
      `Prayer bells ring under the water, slow and out of time.`,
      `The mosaic shows a congregation kneeling into the tide.`,
      `Something surfaces behind you without breaking the water.`,
      `Every doorway is set below the waterline. On purpose.`,
      `The offering bowls are full. They should not still be full.`,
    ],
  },
  hive: {
    name: 'The Chitin Warrens',
    makers: 'The hive, which ate what it left',
    firstEntry: `The corridor narrows, softens, and becomes a throat.`,
    description: `Something dug into the foundations and improved them. The bores are perfectly round, perfectly smooth, and warm as a held hand. None of it is built for you.`,
    deepAfter: 10,
    deepEntry: `This deep the hum is not a sound any more. It is agreement.`,
    ambient: [
      `The walls flex, very slightly, in time with something.`,
      `A dry rattle passes overhead and moves on.`,
      `Egg cases line the ceiling in tidy rows. The tidiness is the frightening part.`,
      `The resin underfoot is fresh. It was laid tonight.`,
      `Every tunnel is exactly wide enough. For them.`,
      `Somewhere ahead, thousands of small mouths are working.`,
    ],
  },
  frostvault: {
    name: 'The Rime Archive',
    makers: 'The archivists, who froze it',
    firstEntry: `The cold takes the sweat off you in three steps and starts on the rest.`,
    description: `Someone froze this place on purpose, shelved what they wanted kept along the galleries, and locked the door from the inside. The cold has kept its half of the bargain for a very long time.`,
    deepAfter: 10,
    deepEntry: `This far down the ice has stopped being water. It does not melt. It considers.`,
    ambient: [
      `Your breath hangs where you left it.`,
      `Someone stands in the ice, facing out, waiting for a thaw.`,
      `Frost on the wall has grown into letters. You do not want to learn them.`,
      `The cold here is not weather. It is policy.`,
      `Ice groans, settles, and holds.`,
      `A lantern hangs frozen in the middle of its fall, still lit.`,
    ],
  },
  ashwaste: {
    name: 'The Cinderfields',
    makers: 'A country that burned itself to starve it',
    firstEntry: `The ceiling opens out into a grey sky that is not a sky, and grey weather falls out of it.`,
    description: `A country burned down here, and then kept burning, quietly and without fuel, for longer than the country had stood. The ash lies deep enough to walk on. In places it lies deep enough to walk in.`,
    deepAfter: 10,
    deepEntry: `The fires that made this place are close now. You can feel them through your boots, taking an interest.`,
    ambient: [
      `Ash falls upward for a moment, then thinks better of it.`,
      `A doorframe stands with no house behind it.`,
      `The wind carries heat and no smoke.`,
      `Footprints cross yours. They are going down too.`,
      `Something under the ash shifts to follow.`,
      `The ground is warm all the way through.`,
    ],
  },
  voidspire: {
    name: 'The Hollow Spire',
    makers: 'Something from outside, which drove it in',
    firstEntry: `The dark ahead has an edge to it, like a page, and past the edge the rules are different.`,
    description: `A tower driven down into the world like a nail, from outside, by something with the reach to do it. Inside, the stairs go up and arrive lower. Nobody has explained this, and the ones who tried are part of the walls.`,
    deepAfter: 10,
    deepEntry: `The Spire has stopped pretending. There is no floor, only an agreement that you are standing.`,
    ambient: [
      `The stair goes up. You are going down.`,
      `Your shadow arrives a moment before you do.`,
      `A door here opens onto the room you are in.`,
      `Something is counting. It has passed the last number with a name.`,
      `The geometry apologises, and continues.`,
      `You have been here before. You have not been here before. Both are on record.`,
    ],
  },
};

/** What Stairhead calls a biome. */
export function placeName(biome: BiomeId): string {
  return PLACES[biome]?.name ?? biome;
}
