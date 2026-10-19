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
import { tr } from '../../core/I18n';

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
    name: tr('The Ossuary Tiers'),
    makers: tr('Caul, the city before the camp'),
    firstEntry: tr('Cold air comes up the stair to meet you, carrying the smell of old stone and older linen.'),
    description: tr('Caul shelved its dead here in tiers, generation over generation, until the graveyard had storeys and stairwells and districts of its own. Every shelf is full. Every shelf has been dusted.'),
    deepAfter: 12,
    deepEntry: tr('The tiers go on past counting now. Whoever kept the ledgers gave up long before the dead did.'),
    ambient: [
      tr('Something turns over in a niche and settles again.'),
      tr('A name has been scratched off the wall. Only the scratching is left.'),
      tr('Two hundred skulls face the same way. You are walking the way they look.'),
      tr('A lamp burns grave oil. Someone filled it this morning.'),
      tr('The mortar between these stones was mixed with ash, and something finer.'),
      tr('Somewhere ahead, a broom.'),
    ],
  },
  caverns: {
    name: tr('The Root Deeps'),
    makers: tr('Water, before anyone'),
    firstEntry: tr('The worked stone gives out in the middle of a corridor, as if the masons put down their tools and left. Past it, the rock does as it pleases.'),
    description: tr('Water cut these halls long before anyone thought to bury anything, and it is still cutting, patiently, without an opinion. Roots hang through the ceiling from trees that died on the hill above.'),
    deepAfter: 12,
    deepEntry: tr('There is no masonry to give out down here. There never was. The dark is original.'),
    ambient: [
      tr('Water finds a way down. So did you.'),
      tr('A drip lands on the same stone it has struck for ten thousand years.'),
      tr('Something large came through here lately. The mud remembers.'),
      tr('Pale roots stir overhead, though there is no wind.'),
      tr('Your step comes back to you from four directions.'),
      tr('The air tastes of iron and wet stone.'),
    ],
  },
  foundry: {
    name: tr('The Cindergate Works'),
    makers: tr("Caul's armourers, for a war at depth"),
    firstEntry: tr('Heat rolls up the shaft in a slow wave, and with it the sound of machines keeping their appointments.'),
    description: tr('The Works were built to arm Caul for a war below, and the war ended without telling them. The bellows still breathe. The moulds still fill. Somewhere down the line a hammer is shaping something to an order nobody living placed.'),
    deepAfter: 12,
    deepEntry: tr('The Works have grown. The new galleries are on no plan, and their tools are sized for hands you have not seen yet.'),
    ambient: [
      tr('A bell rings the change of shift. Nobody comes.'),
      tr('The floor is warm. It should not be warm.'),
      tr('A tally board counts up, in chalk, in a hand that never stops.'),
      tr('Slag cools in a channel, ticking as it goes.'),
      tr('Something down the line is being made. It is not finished.'),
      tr('An order book lies open at a page dated after the war.'),
    ],
  },
  sunkenTemple: {
    name: tr('The Drowned Sanctum'),
    makers: tr('Those who prayed to it'),
    firstEntry: tr('The stair goes down into standing water, and the water is very still, and it has been waiting.'),
    description: tr('The Sanctum was built to be flooded. Its priests held that water was an improvement: it made the god harder to look at and easier to hear. They were right about both.'),
    deepAfter: 12,
    deepEntry: tr('The flood has depth to it here. There are storeys under the surface, lit from below, and they are attended.'),
    ambient: [
      tr('The water is warmer than the air, which is wrong.'),
      tr('Prayer bells ring under the water, slow and out of time.'),
      tr('The mosaic shows a congregation kneeling into the tide.'),
      tr('Something surfaces behind you without breaking the water.'),
      tr('Every doorway is set below the waterline. On purpose.'),
      tr('The offering bowls are full. They should not still be full.'),
    ],
  },
  hive: {
    name: tr('The Chitin Warrens'),
    makers: tr('The hive, which ate what it left'),
    firstEntry: tr('The corridor narrows, softens, and becomes a throat.'),
    description: tr('Something dug into the foundations and improved them. The bores are perfectly round, perfectly smooth, and warm as a held hand. None of it is built for you.'),
    deepAfter: 10,
    deepEntry: tr('This deep the hum is not a sound any more. It is agreement.'),
    ambient: [
      tr('The walls flex, very slightly, in time with something.'),
      tr('A dry rattle passes overhead and moves on.'),
      tr('Egg cases line the ceiling in tidy rows. The tidiness is the frightening part.'),
      tr('The resin underfoot is fresh. It was laid tonight.'),
      tr('Every tunnel is exactly wide enough. For them.'),
      tr('Somewhere ahead, thousands of small mouths are working.'),
    ],
  },
  frostvault: {
    name: tr('The Rime Archive'),
    makers: tr('The archivists, who froze it'),
    firstEntry: tr('The cold takes the sweat off you in three steps and starts on the rest.'),
    description: tr('Someone froze this place on purpose, shelved what they wanted kept along the galleries, and locked the door from the inside. The cold has kept its half of the bargain for a very long time.'),
    deepAfter: 10,
    deepEntry: tr('This far down the ice has stopped being water. It does not melt. It considers.'),
    ambient: [
      tr('Your breath hangs where you left it.'),
      tr('Someone stands in the ice, facing out, waiting for a thaw.'),
      tr('Frost on the wall has grown into letters. You do not want to learn them.'),
      tr('The cold here is not weather. It is policy.'),
      tr('Ice groans, settles, and holds.'),
      tr('A lantern hangs frozen in the middle of its fall, still lit.'),
    ],
  },
  ashwaste: {
    name: tr('The Cinderfields'),
    makers: tr('A country that burned itself to starve it'),
    firstEntry: tr('The ceiling opens out into a grey sky that is not a sky, and grey weather falls out of it.'),
    description: tr('A country burned down here, and then kept burning, quietly and without fuel, for longer than the country had stood. The ash lies deep enough to walk on. In places it lies deep enough to walk in.'),
    deepAfter: 10,
    deepEntry: tr('The fires that made this place are close now. You can feel them through your boots, taking an interest.'),
    ambient: [
      tr('Ash falls upward for a moment, then thinks better of it.'),
      tr('A doorframe stands with no house behind it.'),
      tr('The wind carries heat and no smoke.'),
      tr('Footprints cross yours. They are going down too.'),
      tr('Something under the ash shifts to follow.'),
      tr('The ground is warm all the way through.'),
    ],
  },
  voidspire: {
    name: tr('The Hollow Spire'),
    makers: tr('Something from outside, which drove it in'),
    firstEntry: tr('The dark ahead has an edge to it, like a page, and past the edge the rules are different.'),
    description: tr('A tower driven down into the world like a nail, from outside, by something with the reach to do it. Inside, the stairs go up and arrive lower. Nobody has explained this, and the ones who tried are part of the walls.'),
    deepAfter: 10,
    deepEntry: tr('The Spire has stopped pretending. There is no floor, only an agreement that you are standing.'),
    ambient: [
      tr('The stair goes up. You are going down.'),
      tr('Your shadow arrives a moment before you do.'),
      tr('A door here opens onto the room you are in.'),
      tr('Something is counting. It has passed the last number with a name.'),
      tr('The geometry apologises, and continues.'),
      tr('You have been here before. You have not been here before. Both are on record.'),
    ],
  },
  darkForest: {
    name: tr('The Blackroot Wood'),
    makers: tr('Caul’s foresters, who planted it over the dead'),
    firstEntry: tr('The portal lets you out under trees, and a moon you do not remember hangs in the branches.'),
    description: tr('Caul ran out of room for its dead long before it ran out of dead, so it planted a wood over the overflow and called it a park. The roots went down and found what they were fed. The trees have been grateful ever since, in their way.'),
    deepAfter: 12,
    deepEntry: tr('The wood is older here. The trunks have faces in the bark now, and the faces have opinions.'),
    ambient: [
      tr('A branch creaks under no weight at all.'),
      tr('The path bends around a tree that was not there a moment ago.'),
      tr('Something heavy moves off through the undergrowth, unhurried.'),
      tr('Lanterns hang in the high branches. Nobody could have reached to light them.'),
      tr('The leaves underfoot are wet, and some of them are not leaves.'),
      tr('A ring of mushrooms, and in the middle, a boot.'),
    ],
  },
  swamp: {
    name: tr('The Gallows Fen'),
    makers: tr('Caul’s magistrates, for the sentences too long to serve'),
    firstEntry: tr('The ground gives under the first step and keeps giving. The air is warm and tastes of rot and rope.'),
    description: tr('Caul hanged its worst out here, over water, so the bodies would be somebody else\'s problem. The water took them politely and has been asking for more. The boardwalks are mended every night. Nobody has seen who mends them.'),
    deepAfter: 12,
    deepEntry: tr('The gibbets out here are newer. The ropes are still taut, and the knots are fresh.'),
    ambient: [
      tr('A gibbet turns slowly, though the air is still.'),
      tr('Bubbles rise in a line toward you, and stop.'),
      tr('The boardwalk has been mended with planks from a coffin.'),
      tr('Frogs fall silent all at once, then start again behind you.'),
      tr('Something under the water brushes your ankle and lets go.'),
      tr('The reeds lean away from you as you pass.'),
    ],
  },
  desert: {
    name: tr('The Bleached Reach'),
    makers: tr('A city that was here first, and the wind'),
    firstEntry: tr('Heat hits you like an opened oven, and the light is so white it hurts to look at the sand.'),
    description: tr('There was a city here before Caul, and before the sand. The sand won. What is left is walls standing up out of the dunes like ribs, and a sun that never quite sets, watching the wind finish the job.'),
    deepAfter: 12,
    deepEntry: tr('The dunes have moved since the last time anyone mapped them. They do that. They are going somewhere.'),
    ambient: [
      tr('The wind writes a line in the sand and rubs it out.'),
      tr('A wall stands alone in the dunes, with a window in it.'),
      tr('Bones bleach in a neat row, as if laid out to dry.'),
      tr('The heat shimmers, and something in the shimmer waves back.'),
      tr('Sand pours off a dune as though something under it rolled over.'),
      tr('A cistern, dry for a thousand years, smells of fresh water.'),
    ],
  },
  desertTomb: {
    name: tr('The Sand-Kings’ Tombs'),
    makers: tr('The city under the sand, for its kings'),
    firstEntry: tr('The stair cuts down out of the heat into a chill that has been kept, like a breath held for a very long time.'),
    description: tr('When the sand came, the city\'s kings went down into their tombs and had the doors sealed after them, to wait it out. They are still waiting. Their servants went in with them, and their soldiers, and they have all stayed loyal.'),
    deepAfter: 12,
    deepEntry: tr('These are the oldest kings. Their tombs were cut for a much smaller sun, and a much larger god.'),
    ambient: [
      tr('Painted eyes follow you along the wall, one panel at a time.'),
      tr('Sand trickles from a crack in the ceiling, steady as an hourglass.'),
      tr('A sarcophagus lid sits a finger\'s width open.'),
      tr('The air is dry enough to drink the water out of you.'),
      tr('Grave goods lie heaped in an alcove, counted and recounted.'),
      tr('A servant\'s mask lies face up on the floor, still smiling.'),
    ],
  },
  tundra: {
    name: tr('The Frostmarch'),
    makers: tr('An army that marched up here and stopped'),
    firstEntry: tr('The cold comes through the portal before you do, and the snow beyond it is pink with old blood.'),
    description: tr('An army marched across these heights to take Caul from above, and the winter took the army instead. They are still up here, in their lines, in their camps, under the snow, facing the way they were facing. The weather has never let them go home.'),
    deepAfter: 10,
    deepEntry: tr('The march goes on higher than any map. The banners up here belong to wars nobody remembers fighting.'),
    ambient: [
      tr('A banner snaps in the wind, frozen stiff as a board.'),
      tr('Footprints lead up to a drift and do not come out.'),
      tr('A campfire ring, and the ash in it still warm.'),
      tr('Ice cracks somewhere below the snow, a long way down.'),
      tr('A soldier stands in the drift up to the chest, at attention.'),
      tr('The wind carries a horn call from the next ridge.'),
    ],
  },
  hell: {
    name: tr('The Burning Steppe'),
    makers: tr('The fire under everything, which got out'),
    firstEntry: tr('The portal opens on a plain of black glass and red light, and the heat is not weather. It is attention.'),
    description: tr('Every layer above this one was built on something, and this is the something. The fire that the Cinderfields burned with, that the Works were stoked from, comes up here through the crust in rivers. What lives in it was not made by anyone. It made itself, out of spite.'),
    deepAfter: 10,
    deepEntry: tr('The crust is thin here. You can see the fire moving under it, slow and patient, like something breathing.'),
    ambient: [
      tr('A river of fire takes a corner too fast and spills.'),
      tr('The black glass underfoot shows a red face that is not yours.'),
      tr('Chains hang from nothing, swaying in the updraught.'),
      tr('Laughter carries over the steppe from somewhere you cannot see.'),
      tr('The ground ticks as it cools, then warms again.'),
      tr('A spire of bone stands on the plain, freshly built.'),
    ],
  },
};

/** What Stairhead calls a biome. */
export function placeName(biome: BiomeId): string {
  return PLACES[biome]?.name ?? biome;
}
