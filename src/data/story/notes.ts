/**
 * SLAY — lore notes, found in the dungeon.
 *
 * Pages, plates, tags and scratches left behind by every people that tried
 * something with the Tenant, and by the delvers who came after. They turn up
 * when you search a bookcase, open a chest, or go through the pack of a fallen
 * adventurer (`ui/StoryPlaces.ts` decides when). Each is found once per
 * account and kept in the journal.
 *
 * A note never says more than the person who wrote it knew. The chapters in
 * `premise.ts` say what it adds up to; a note should only ever be one piece,
 * and a note that would spoil a chapter waits until that chapter's tier.
 */

import type { LoreNote } from './types';

export const NOTES: LoreNote[] = [
  // ---------------------------------------------------------------------------
  // The Ossuary Tiers
  // ---------------------------------------------------------------------------
  {
    id: 'note.crypt.chalk',
    title: 'Chalk',
    biome: 'crypt',
    minDepth: 1,
    source: 'Chalked on a pillar, at shoulder height',
    text: `Dace Orlo. Renn has me on her roster in chalk. If you are reading this, captain, rub me off with your thumb and save yourself the walk.`,
  },
  {
    id: 'note.crypt.swept',
    title: 'Swept',
    biome: 'crypt',
    minDepth: 2,
    source: 'Scratched inside a burial niche',
    text: `Third night. Something sweeps behind us. We leave prints in the dust going in, and coming back the floor is clean and the bones we knocked down are on their shelves again. Hollis says it is a courtesy. Hollis says a great many things.`,
  },
  {
    id: 'note.crypt.oil',
    title: 'Grave Oil',
    biome: 'crypt',
    minDepth: 2,
    source: 'Folded under a lamp',
    text: `Do not drink the lamp oil. I know you are thinking about it. It is the only warm thing down here. It is rendered from the people on the shelves, and it burns very clean.`,
  },
  {
    id: 'note.crypt.census',
    title: 'A Clerk of the Census',
    biome: 'crypt',
    minDepth: 3,
    source: "Cut into the wall of a clerk's alcove",
    text: `Four thousand shelved this month. The King asks me the number every evening and says it back to me, and every evening his number is one higher than mine. I have stopped correcting him. He is counting something I am not.`,
  },
  {
    id: 'note.crypt.tariff',
    title: 'Burial Tariff',
    biome: 'crypt',
    minDepth: 5,
    source: 'A bronze plate by the ossuary door',
    text: `By order of the House: every citizen of Caul to be shelved below, in order, without exception. The dead are the rent. Pay it in full and the house stays in the house.`,
  },

  // ---------------------------------------------------------------------------
  // The Root Deeps
  // ---------------------------------------------------------------------------
  {
    id: 'note.caverns.pin',
    title: 'Survey Mark 2-W',
    biome: 'caverns',
    minDepth: 1,
    source: 'A brass tag on a survey pin',
    text: `Waterline at this pin: knee. Second reading, same day: chest. Third reading: knee. The water is not rising and falling. It is breathing.`,
  },
  {
    id: 'note.caverns.bedding',
    title: 'Bedding',
    biome: 'caverns',
    minDepth: 2,
    source: "A delver's notebook, wet through",
    text: `Something large sleeps in the alcove past the second pool. Good bedding: a cloak, torn shirts, the lining of a pack. Delvers' things. It does not eat them. It sleeps on them, because they smell of the surface.`,
  },
  {
    id: 'note.caverns.roots',
    title: 'Roots',
    biome: 'caverns',
    minDepth: 3,
    source: 'Carved into a root with a knife',
    text: `These roots come down through the ceiling from trees that died on the hill a thousand years ago. They are still growing. They are growing down. Something down there is watering them.`,
  },
  {
    id: 'note.caverns.echo',
    title: 'Echo',
    biome: 'caverns',
    minDepth: 4,
    source: "The last page of a delver's notebook",
    text: `Shouted my name to test the cave. It came back four times. The fourth time it came back in a voice I did not use, and slower, as if it were learning how it went.`,
  },

  // ---------------------------------------------------------------------------
  // The Cindergate Works
  // ---------------------------------------------------------------------------
  {
    id: 'note.foundry.roster',
    title: 'Shift Roster',
    biome: 'foundry',
    minDepth: 2,
    source: 'A slate by the furnace door',
    text: `Shift of the ninth bell: Aundry, Coll, Hesse, Mott. Shift of the tenth bell: Aundry, Coll, Hesse, Mott. The roster has not changed in four hundred years. Neither have they.`,
  },
  {
    id: 'note.foundry.wages',
    title: 'Wages',
    biome: 'foundry',
    minDepth: 3,
    source: 'A wage packet, sealed, never opened',
    text: `Wages of the ninth bell shift, paid by the House of Caul. There has been no House for a very long time. The packet is still warm from the furnace, and nobody has ever come to collect it.`,
  },
  {
    id: 'note.foundry.quench',
    title: 'The Lowest Channel',
    biome: 'foundry',
    minDepth: 6,
    source: 'Stamped into an iron grate',
    text: `Do not touch. Do not drink. Do not look for the source. Quench only the order's own blades, wear the long gloves, and pray they are long enough.`,
  },
  {
    id: 'note.foundry.complaint',
    title: 'To the Foreman',
    biome: 'foundry',
    minDepth: 8,
    source: "Pinned to the foreman's door",
    text: `The new order is not for arms. The measures are wrong for arms. We are being asked to cast a hand, and the hand is the size of this hall. Respectfully: who is it for?`,
  },

  // ---------------------------------------------------------------------------
  // The Drowned Sanctum
  // ---------------------------------------------------------------------------
  {
    id: 'note.temple.hymn',
    title: 'Low Hymn',
    biome: 'sunkenTemple',
    minDepth: 3,
    source: 'Carved below the waterline',
    text: `We pray with our faces in the water, so that we cannot see it and it can hear us better. Our god has no face. We have given it ours.`,
  },
  {
    id: 'note.temple.pews',
    title: 'Reserved',
    biome: 'sunkenTemple',
    minDepth: 4,
    source: 'Painted on the end of a pew',
    text: `Reserved for the family Tessaly. Reserved for the family Orme. Reserved for the family of whoever comes down. The pews are always full. The congregation sits very still and very upright, and every one of them is facing the door.`,
  },
  {
    id: 'note.temple.amath',
    title: 'Sister Amath',
    biome: 'sunkenTemple',
    minDepth: 5,
    source: "A novice's wax tablet",
    text: `Sister Amath says it is like falling asleep in a warm bath. Sister Amath has done it three times and come up every time, and every time she comes up she is a little less Sister Amath.`,
  },

  // ---------------------------------------------------------------------------
  // The Chitin Warrens
  // ---------------------------------------------------------------------------
  {
    id: 'note.hive.larder',
    title: 'Wrapped',
    biome: 'hive',
    minDepth: 5,
    source: 'A page pinned to the wall with a sting',
    text: `They do not kill what they take. They wrap it and wait. I have been wrapped two days and I can still write, so it is not hurry they lack. It is appetite. They are waiting for something else to eat first.`,
  },
  {
    id: 'note.hive.warm',
    title: 'Warm',
    biome: 'hive',
    minDepth: 5,
    source: 'Scratched into resin',
    text: `The walls are warm because they are alive. The floor is warm because it is alive. I am warm because I have not stopped being alive yet. I am writing it down so I remember which of us is which.`,
  },
  {
    id: 'note.hive.tunnel',
    title: 'The Short Way',
    biome: 'hive',
    minDepth: 6,
    source: 'A map on the back of a ration wrapper',
    text: `One tunnel out of the warrens runs up under the camp. I followed it to the end and put my ear to the roof and heard the Listener humming. Tell nobody. Tell Renn.`,
  },
  {
    id: 'note.hive.scraps',
    title: 'What the Hive Eats',
    biome: 'hive',
    minDepth: 8,
    source: "A scholar's copy, carried down from the Archive",
    text: `The hive does not hunt. It follows. Wherever the great one has fed, the hive comes after and cleans the bones. Without it the bones would be piled to the stair by now. Consider, then, whose servant the hive is.`,
  },

  // ---------------------------------------------------------------------------
  // The Rime Archive
  // ---------------------------------------------------------------------------
  {
    id: 'note.frost.tag',
    title: 'Label',
    biome: 'frostvault',
    minDepth: 7,
    source: 'A brass tag tied to a frozen wrist',
    text: `Delver, a woman of about thirty. Received whole from the tier above. Cause: cold, at her own request. Kept until wanted.`,
  },
  {
    id: 'note.frost.thaw',
    title: 'In the Event of Thaw',
    biome: 'frostvault',
    minDepth: 8,
    source: 'A sealed order on a lectern',
    text: `Do not wake the kept. Do not answer them. Do not tell them the year. They will ask after the city, and the kindest answer is none.`,
  },
  {
    id: 'note.frost.hand',
    title: 'Neatly',
    biome: 'frostvault',
    minDepth: 9,
    source: 'Ink frozen in the middle of a word',
    text: `We froze it to keep it still, and it kept still. Then the cold began keeping us. I cannot feel my hand any more. The hand is writing very neatly, and I am not sure that I am the one who`,
  },
  {
    id: 'note.frost.lantern',
    title: 'A Lantern, Gone Out',
    biome: 'frostvault',
    minDepth: 9,
    source: 'Wrapped round a frozen candle',
    text: `We are the Lantern Sisters. We keep a light at the top of the stair, and some of us carry one to the bottom, as far as the bottom goes. This one went out here. Light it again if you can.`,
  },

  // ---------------------------------------------------------------------------
  // The Cinderfields
  // ---------------------------------------------------------------------------
  {
    id: 'note.ash.map',
    title: 'A Country',
    biome: 'ashwaste',
    minDepth: 10,
    source: 'A map, scorched at the edges',
    text: `Rivers, roads and towns, all named: Haddon, Rell, Mere Ford, the Tallow Hills. Across the whole of it, in a council's careful hand: Starve it. Burn everything it could eat. Begin with ourselves.`,
  },
  {
    id: 'note.ash.pamphlet',
    title: 'Pamphlet',
    biome: 'ashwaste',
    minDepth: 10,
    source: 'One of a great many copies',
    text: `THE BOTTOM IS NEAR. SOMEONE WAITS THERE. COME DOWN AND BE GLAD. Most of the copies have been used to start fires. This one has not, because someone wrote across it: not yet.`,
  },
  {
    id: 'note.ash.vote',
    title: 'The Vote',
    biome: 'ashwaste',
    minDepth: 11,
    source: 'A tally stick, charred',
    text: `For: four hundred and six. Against: eleven. Abstaining: one, the miller, who said the fire would not ask how anyone voted. He was right. It did not.`,
  },
  {
    id: 'note.ash.prints',
    title: 'Prints',
    biome: 'ashwaste',
    minDepth: 12,
    source: 'Scratched on a doorframe with no house behind it',
    text: `Prints in the ash, going down. Mine, going down. Someone else's, older, going down. None coming back up. The ash would keep those too, if there were any.`,
  },

  // ---------------------------------------------------------------------------
  // The Hollow Spire
  // ---------------------------------------------------------------------------
  {
    id: 'note.spire.pin',
    title: 'Withdrawal',
    biome: 'voidspire',
    minDepth: 14,
    source: 'A bent brass survey pin',
    text: `Height of the Spire from its foot: unknown. Depth of its point: unknown. Rate of withdrawal: a finger's width a year. That last one we are sure of. We would rather not be.`,
  },
  {
    id: 'note.spire.door',
    title: 'The Same Room',
    biome: 'voidspire',
    minDepth: 15,
    source: 'Chalk on a door',
    text: `This door opens onto this room. I have been through it nine times. The tenth time someone was on the other side holding chalk, and they had just finished writing this.`,
  },
  {
    id: 'note.spire.outside',
    title: 'From Outside',
    biome: 'voidspire',
    minDepth: 16,
    source: 'A script on the Spire wall that is not any script',
    text: `You cannot read it. You know what it says anyway, the way you know a door from a wall. Here. Hold. Do not let it up. And under that, smaller, the way you know a signature: Sorry.`,
  },
  {
    id: 'note.spire.tally',
    title: 'Tally',
    biome: 'voidspire',
    minDepth: 30,
    source: 'Tally marks, floor to ceiling',
    text: `Marks in fives, wall after wall, too many to count. Near the end the groups stop being fives and start being letters. The letters spell a name, and the name is nearly finished.`,
  },

  // ---------------------------------------------------------------------------
  // Anywhere
  // ---------------------------------------------------------------------------
  {
    id: 'note.any.letter',
    title: 'Letter Home',
    minDepth: 2,
    source: 'A letter, sealed, addressed to Stairhead',
    text: `Mother. The pay is good and the work is simple. You walk down, and things come up to meet you. Do not let them tell you it is dangerous. It is only lonely.`,
  },
  {
    id: 'note.any.rope',
    title: 'Rope',
    minDepth: 4,
    source: 'A coil of rope with a wagon tag',
    text: `Sold by the Stairhead wagon. Tied off at the bottom in a knot no delver uses: a loop round nothing, pulled very tight, as if something had held the end and asked to be pulled up.`,
  },
  {
    id: 'note.any.third',
    title: 'Day Twenty',
    minDepth: 5,
    source: 'A page torn from an expedition log',
    text: `Tier five. Ferris is singing again, which means his feet hurt. Gilder says we turn back at the eleventh no matter what. Nobody has asked him what is on the eleventh.`,
  },
  {
    id: 'note.any.pin',
    title: 'A Pin, Walked',
    minDepth: 6,
    source: 'A brass survey pin, stamped',
    text: `Stamped: Caul survey, first tier. Found on the sixth. Wenna will want it. Wenna will want to know how it walked.`,
  },
  {
    id: 'note.any.marker',
    title: 'Marker',
    minDepth: 8,
    source: 'A grave marker, carried down',
    text: `Cut at three-quarters of an inch, every letter, the way Marrow cuts them: a name you do not know, and a tier. The tier is this one. The lettering is very good.`,
  },
  {
    id: 'note.any.minutes',
    title: 'Minutes',
    minDepth: 20,
    source: 'A page of council minutes, torn out',
    text: `Resolved: that a delver be kept below at all times. Resolved: that the delvers not be told why. Objection from the captain of the watch, noted. Objection from the captain of the watch, struck out.`,
  },
  {
    id: 'note.any.place',
    title: 'A Place Set',
    minDepth: 60,
    source: 'A journal, every page blank but one',
    text: `I have not seen another delver in a month. The thing below has started setting a place for me. I think I will sit down.`,
  },
];

const BY_ID = new Map(NOTES.map((n) => [n.id, n]));

export function noteById(id: string): LoreNote | undefined {
  return BY_ID.get(id);
}
