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
import { tr } from '../../core/I18n';

export const NOTES: LoreNote[] = [
  // ---------------------------------------------------------------------------
  // The Ossuary Tiers
  // ---------------------------------------------------------------------------
  {
    id: 'note.crypt.chalk',
    title: tr('Chalk'),
    biome: 'crypt',
    minDepth: 1,
    source: tr('Chalked on a pillar, at shoulder height'),
    text: tr('Dace Orlo. Renn has me on her roster in chalk. If you are reading this, captain, rub me off with your thumb and save yourself the walk.'),
  },
  {
    id: 'note.crypt.swept',
    title: tr('Swept'),
    biome: 'crypt',
    minDepth: 2,
    source: tr('Scratched inside a burial niche'),
    text: tr('Third night. Something sweeps behind us. We leave prints in the dust going in, and coming back the floor is clean and the bones we knocked down are on their shelves again. Hollis says it is a courtesy. Hollis says a great many things.'),
  },
  {
    id: 'note.crypt.oil',
    title: tr('Grave Oil'),
    biome: 'crypt',
    minDepth: 2,
    source: tr('Folded under a lamp'),
    text: tr('Do not drink the lamp oil. I know you are thinking about it. It is the only warm thing down here. It is rendered from the people on the shelves, and it burns very clean.'),
  },
  {
    id: 'note.crypt.census',
    title: tr('A Clerk of the Census'),
    biome: 'crypt',
    minDepth: 3,
    source: tr("Cut into the wall of a clerk's alcove"),
    text: tr('Four thousand shelved this month. The King asks me the number every evening and says it back to me, and every evening his number is one higher than mine. I have stopped correcting him. He is counting something I am not.'),
  },
  {
    id: 'note.crypt.tariff',
    title: tr('Burial Tariff'),
    biome: 'crypt',
    minDepth: 5,
    source: tr('A bronze plate by the ossuary door'),
    text: tr('By order of the House: every citizen of Caul to be shelved below, in order, without exception. The dead are the rent. Pay it in full and the house stays in the house.'),
  },

  // ---------------------------------------------------------------------------
  // The Blackroot Wood
  // ---------------------------------------------------------------------------
  {
    id: 'note.darkForest.blaze',
    title: tr('Blazes'),
    biome: 'darkForest',
    minDepth: 1,
    source: tr('Cut into the bark of a trail tree'),
    text: tr('Blaze every third tree, Renn said, so we can find the way back. I blazed every third tree. Coming back, every tree was blazed, in my hand, at my height, all the way to the edge of sight.'),
  },
  {
    id: 'note.darkForest.forester',
    title: tr('The Forester’s Rule'),
    biome: 'darkForest',
    minDepth: 2,
    source: tr('A wooden board nailed to an oak'),
    text: tr('By order of the House: no felling, no burning, no digging under the roots. The wood is fed. The wood is grateful. Do not give it a reason to be anything else.'),
  },
  {
    id: 'note.darkForest.camp',
    title: tr('Cold Camp'),
    biome: 'darkForest',
    minDepth: 4,
    source: tr('Scratched on a tin plate by a dead fire'),
    text: tr('No fire tonight. Last night we lit one and the trees leaned in to warm themselves, and in the morning Tam was gone and there was a new sapling where he had slept.'),
  },

  // ---------------------------------------------------------------------------
  // The Gallows Fen
  // ---------------------------------------------------------------------------
  {
    id: 'note.swamp.sentence',
    title: tr('A Sentence'),
    biome: 'swamp',
    minDepth: 2,
    source: tr('A brass tag on a gibbet chain'),
    text: tr('Hanged in the fen for theft of bread. Sentence: until the rope rots. The rope has been replaced eleven times. The clerk who keeps replacing it is not on any roster.'),
  },
  {
    id: 'note.swamp.planks',
    title: tr('Planks'),
    biome: 'swamp',
    minDepth: 3,
    source: tr('Pencilled on a boardwalk plank'),
    text: tr('This plank was not here this morning. It has a name burned into it and a date. The date is next week. I have stepped round it. Hollis stepped on it.'),
  },
  {
    id: 'note.swamp.drowned',
    title: tr('Low Water'),
    biome: 'swamp',
    minDepth: 6,
    source: tr('Written on the inside of a boot'),
    text: tr('In a dry summer the fen drops a foot and you can see them under the surface, standing up, all facing the same way. Toward the city. Waiting for the water to bring them home.'),
  },

  // ---------------------------------------------------------------------------
  // The Bleached Reach
  // ---------------------------------------------------------------------------
  {
    id: 'note.desert.wall',
    title: tr('The Wall'),
    biome: 'desert',
    minDepth: 3,
    source: tr('Painted on a ruined wall, in red'),
    text: tr('This was a city. It had a name. We gave the name to the sand to keep, and the sand has kept it, every grain. Listen to the wind and you will hear it said.'),
  },
  {
    id: 'note.desert.water',
    title: tr('Water Ration'),
    biome: 'desert',
    minDepth: 4,
    source: tr('A page torn from a delver’s log'),
    text: tr('Day four. One mouthful each at dawn and dusk. The sun has not gone down since we arrived. Wenna says it is still dawn. Wenna says it has been dawn for three days.'),
  },
  {
    id: 'note.desert.caravan',
    title: tr('Caravan'),
    biome: 'desert',
    minDepth: 7,
    source: tr('Carved on a camel bone'),
    text: tr('We passed a caravan going the other way, out of the dunes. Forty beasts, sixty drivers, no shadows. They asked us the way to the city. We pointed back toward Caul. They thanked us and kept walking into the sand.'),
  },

  // ---------------------------------------------------------------------------
  // The Sand-Kings' Tombs
  // ---------------------------------------------------------------------------
  {
    id: 'note.desertTomb.seal',
    title: tr('The Seal'),
    biome: 'desertTomb',
    minDepth: 3,
    source: tr('Stamped into the wax of a tomb door'),
    text: tr('Here waits the King, and his household, and his guard, until the sand goes back where it came from. Do not wake him early. He has been told how long it will be, and he is a patient man.'),
  },
  {
    id: 'note.desertTomb.servant',
    title: tr('Servant’s Tally'),
    biome: 'desertTomb',
    minDepth: 5,
    source: tr('Scratched on the back of a funeral mask'),
    text: tr('Day nine thousand and something. Lamps trimmed. Floors swept. The King asked again whether the sand has gone. I told him it has not. I have not looked. I do not think he would like the answer.'),
  },
  {
    id: 'note.desertTomb.robbers',
    title: tr('Robbers'),
    biome: 'desertTomb',
    minDepth: 8,
    source: tr('A note pinned under a gold cup'),
    text: tr('Take nothing. We took a cup, once. The next night the King\'s guard walked out of the sand and into our camp and asked, politely, for it back. They took Orrin with it, as interest.'),
  },

  // ---------------------------------------------------------------------------
  // The Frostmarch
  // ---------------------------------------------------------------------------
  {
    id: 'note.tundra.orders',
    title: tr('Standing Orders'),
    biome: 'tundra',
    minDepth: 6,
    source: tr('A dispatch case, frozen shut, cut open'),
    text: tr('To all companies: hold the high ground until relieved. Relief is on the march. Do not break camp. Do not light fires the enemy can see. Do not, under any circumstances, go home.'),
  },
  {
    id: 'note.tundra.drift',
    title: tr('The Drift'),
    biome: 'tundra',
    minDepth: 8,
    source: tr('Chalked on a frozen cart'),
    text: tr('The drifts are full of soldiers. Dig one out and he thanks you, and asks if relief has come, and when you say no he lies back down and asks you to cover him up again. We have stopped digging.'),
  },
  {
    id: 'note.tundra.horn',
    title: tr('The Horn'),
    biome: 'tundra',
    minDepth: 12,
    source: tr('Written in a dead officer’s hand'),
    text: tr('Somebody keeps sounding the advance from the next ridge. The men get up out of the snow to answer it, every time. I have walked to the next ridge four times. There is never anyone there, only the horn, still warm.'),
  },

  // ---------------------------------------------------------------------------
  // The Burning Steppe
  // ---------------------------------------------------------------------------
  {
    id: 'note.hell.crust',
    title: tr('The Crust'),
    biome: 'hell',
    minDepth: 10,
    source: tr('Burned into a slab of black glass'),
    text: tr('Walk where the glass is dark. Where it glows, it is thin. Where it is thin, something underneath can see your feet, and it has never seen feet before, and it is very curious.'),
  },
  {
    id: 'note.hell.prayer',
    title: tr('A Prayer'),
    biome: 'hell',
    minDepth: 12,
    source: tr('Scratched on a melted helmet'),
    text: tr('Every god of Caul I prayed to up there, I have found down here, chained, and every one of them was glad to see me. Not one of them has asked me to free it. They are all waiting to see what I do.'),
  },
  {
    id: 'note.hell.ledger',
    title: tr('The Ledger'),
    biome: 'hell',
    minDepth: 16,
    source: tr('A page that will not burn'),
    text: tr('Every fire above was lit from this one. Every forge in the Works, every pyre in the Cinderfields, every lamp in the Ossuary. It keeps an account. It is owed a great deal of warmth, and it means to collect.'),
  },

  // ---------------------------------------------------------------------------
  // The Root Deeps
  // ---------------------------------------------------------------------------
  {
    id: 'note.caverns.pin',
    title: tr('Survey Mark 2-W'),
    biome: 'caverns',
    minDepth: 1,
    source: tr('A brass tag on a survey pin'),
    text: tr('Waterline at this pin: knee. Second reading, same day: chest. Third reading: knee. The water is not rising and falling. It is breathing.'),
  },
  {
    id: 'note.caverns.bedding',
    title: tr('Bedding'),
    biome: 'caverns',
    minDepth: 2,
    source: tr("A delver's notebook, wet through"),
    text: tr('Something large sleeps in the alcove past the second pool. Good bedding: a cloak, torn shirts, the lining of a pack. Delvers\' things. It does not eat them. It sleeps on them, because they smell of the surface.'),
  },
  {
    id: 'note.caverns.roots',
    title: tr('Roots'),
    biome: 'caverns',
    minDepth: 3,
    source: tr('Carved into a root with a knife'),
    text: tr('These roots come down through the ceiling from trees that died on the hill a thousand years ago. They are still growing. They are growing down. Something down there is watering them.'),
  },
  {
    id: 'note.caverns.echo',
    title: tr('Echo'),
    biome: 'caverns',
    minDepth: 4,
    source: tr("The last page of a delver's notebook"),
    text: tr('Shouted my name to test the cave. It came back four times. The fourth time it came back in a voice I did not use, and slower, as if it were learning how it went.'),
  },

  // ---------------------------------------------------------------------------
  // The Cindergate Works
  // ---------------------------------------------------------------------------
  {
    id: 'note.foundry.roster',
    title: tr('Shift Roster'),
    biome: 'foundry',
    minDepth: 2,
    source: tr('A slate by the furnace door'),
    text: tr('Shift of the ninth bell: Aundry, Coll, Hesse, Mott. Shift of the tenth bell: Aundry, Coll, Hesse, Mott. The roster has not changed in four hundred years. Neither have they.'),
  },
  {
    id: 'note.foundry.wages',
    title: tr('Wages'),
    biome: 'foundry',
    minDepth: 3,
    source: tr('A wage packet, sealed, never opened'),
    text: tr('Wages of the ninth bell shift, paid by the House of Caul. There has been no House for a very long time. The packet is still warm from the furnace, and nobody has ever come to collect it.'),
  },
  {
    id: 'note.foundry.quench',
    title: tr('The Lowest Channel'),
    biome: 'foundry',
    minDepth: 6,
    source: tr('Stamped into an iron grate'),
    text: tr('Do not touch. Do not drink. Do not look for the source. Quench only the order\'s own blades, wear the long gloves, and pray they are long enough.'),
  },
  {
    id: 'note.foundry.complaint',
    title: tr('To the Foreman'),
    biome: 'foundry',
    minDepth: 8,
    source: tr("Pinned to the foreman's door"),
    text: tr('The new order is not for arms. The measures are wrong for arms. We are being asked to cast a hand, and the hand is the size of this hall. Respectfully: who is it for?'),
  },

  // ---------------------------------------------------------------------------
  // The Drowned Sanctum
  // ---------------------------------------------------------------------------
  {
    id: 'note.temple.hymn',
    title: tr('Low Hymn'),
    biome: 'sunkenTemple',
    minDepth: 3,
    source: tr('Carved below the waterline'),
    text: tr('We pray with our faces in the water, so that we cannot see it and it can hear us better. Our god has no face. We have given it ours.'),
  },
  {
    id: 'note.temple.pews',
    title: tr('Reserved'),
    biome: 'sunkenTemple',
    minDepth: 4,
    source: tr('Painted on the end of a pew'),
    text: tr('Reserved for the family Tessaly. Reserved for the family Orme. Reserved for the family of whoever comes down. The pews are always full. The congregation sits very still and very upright, and every one of them is facing the door.'),
  },
  {
    id: 'note.temple.amath',
    title: tr('Sister Amath'),
    biome: 'sunkenTemple',
    minDepth: 5,
    source: tr("A novice's wax tablet"),
    text: tr('Sister Amath says it is like falling asleep in a warm bath. Sister Amath has done it three times and come up every time, and every time she comes up she is a little less Sister Amath.'),
  },

  // ---------------------------------------------------------------------------
  // The Chitin Warrens
  // ---------------------------------------------------------------------------
  {
    id: 'note.hive.larder',
    title: tr('Wrapped'),
    biome: 'hive',
    minDepth: 5,
    source: tr('A page pinned to the wall with a sting'),
    text: tr('They do not kill what they take. They wrap it and wait. I have been wrapped two days and I can still write, so it is not hurry they lack. It is appetite. They are waiting for something else to eat first.'),
  },
  {
    id: 'note.hive.warm',
    title: tr('Warm'),
    biome: 'hive',
    minDepth: 5,
    source: tr('Scratched into resin'),
    text: tr('The walls are warm because they are alive. The floor is warm because it is alive. I am warm because I have not stopped being alive yet. I am writing it down so I remember which of us is which.'),
  },
  {
    id: 'note.hive.tunnel',
    title: tr('The Short Way'),
    biome: 'hive',
    minDepth: 6,
    source: tr('A map on the back of a ration wrapper'),
    text: tr('One tunnel out of the warrens runs up under the camp. I followed it to the end and put my ear to the roof and heard the Listener humming. Tell nobody. Tell Renn.'),
  },
  {
    id: 'note.hive.scraps',
    title: tr('What the Hive Eats'),
    biome: 'hive',
    minDepth: 8,
    source: tr("A scholar's copy, carried down from the Archive"),
    text: tr('The hive does not hunt. It follows. Wherever the great one has fed, the hive comes after and cleans the bones. Without it the bones would be piled to the stair by now. Consider, then, whose servant the hive is.'),
  },

  // ---------------------------------------------------------------------------
  // The Rime Archive
  // ---------------------------------------------------------------------------
  {
    id: 'note.frost.tag',
    title: tr('Label'),
    biome: 'frostvault',
    minDepth: 7,
    source: tr('A brass tag tied to a frozen wrist'),
    text: tr('Delver, a woman of about thirty. Received whole from the tier above. Cause: cold, at her own request. Kept until wanted.'),
  },
  {
    id: 'note.frost.thaw',
    title: tr('In the Event of Thaw'),
    biome: 'frostvault',
    minDepth: 8,
    source: tr('A sealed order on a lectern'),
    text: tr('Do not wake the kept. Do not answer them. Do not tell them the year. They will ask after the city, and the kindest answer is none.'),
  },
  {
    id: 'note.frost.hand',
    title: tr('Neatly'),
    biome: 'frostvault',
    minDepth: 9,
    source: tr('Ink frozen in the middle of a word'),
    text: tr('We froze it to keep it still, and it kept still. Then the cold began keeping us. I cannot feel my hand any more. The hand is writing very neatly, and I am not sure that I am the one who'),
  },
  {
    id: 'note.frost.lantern',
    title: tr('A Lantern, Gone Out'),
    biome: 'frostvault',
    minDepth: 9,
    source: tr('Wrapped round a frozen candle'),
    text: tr('We are the Lantern Sisters. We keep a light at the top of the stair, and some of us carry one to the bottom, as far as the bottom goes. This one went out here. Light it again if you can.'),
  },

  // ---------------------------------------------------------------------------
  // The Cinderfields
  // ---------------------------------------------------------------------------
  {
    id: 'note.ash.map',
    title: tr('A Country'),
    biome: 'ashwaste',
    minDepth: 10,
    source: tr('A map, scorched at the edges'),
    text: tr('Rivers, roads and towns, all named: Haddon, Rell, Mere Ford, the Tallow Hills. Across the whole of it, in a council\'s careful hand: Starve it. Burn everything it could eat. Begin with ourselves.'),
  },
  {
    id: 'note.ash.pamphlet',
    title: tr('Pamphlet'),
    biome: 'ashwaste',
    minDepth: 10,
    source: tr('One of a great many copies'),
    text: tr('THE BOTTOM IS NEAR. SOMEONE WAITS THERE. COME DOWN AND BE GLAD. Most of the copies have been used to start fires. This one has not, because someone wrote across it: not yet.'),
  },
  {
    id: 'note.ash.vote',
    title: tr('The Vote'),
    biome: 'ashwaste',
    minDepth: 11,
    source: tr('A tally stick, charred'),
    text: tr('For: four hundred and six. Against: eleven. Abstaining: one, the miller, who said the fire would not ask how anyone voted. He was right. It did not.'),
  },
  {
    id: 'note.ash.prints',
    title: tr('Prints'),
    biome: 'ashwaste',
    minDepth: 12,
    source: tr('Scratched on a doorframe with no house behind it'),
    text: tr('Prints in the ash, going down. Mine, going down. Someone else\'s, older, going down. None coming back up. The ash would keep those too, if there were any.'),
  },

  // ---------------------------------------------------------------------------
  // The Hollow Spire
  // ---------------------------------------------------------------------------
  {
    id: 'note.spire.pin',
    title: tr('Withdrawal'),
    biome: 'voidspire',
    minDepth: 14,
    source: tr('A bent brass survey pin'),
    text: tr('Height of the Spire from its foot: unknown. Depth of its point: unknown. Rate of withdrawal: a finger\'s width a year. That last one we are sure of. We would rather not be.'),
  },
  {
    id: 'note.spire.door',
    title: tr('The Same Room'),
    biome: 'voidspire',
    minDepth: 15,
    source: tr('Chalk on a door'),
    text: tr('This door opens onto this room. I have been through it nine times. The tenth time someone was on the other side holding chalk, and they had just finished writing this.'),
  },
  {
    id: 'note.spire.outside',
    title: tr('From Outside'),
    biome: 'voidspire',
    minDepth: 16,
    source: tr('A script on the Spire wall that is not any script'),
    text: tr('You cannot read it. You know what it says anyway, the way you know a door from a wall. Here. Hold. Do not let it up. And under that, smaller, the way you know a signature: Sorry.'),
  },
  {
    id: 'note.spire.tally',
    title: tr('Tally'),
    biome: 'voidspire',
    minDepth: 30,
    source: tr('Tally marks, floor to ceiling'),
    text: tr('Marks in fives, wall after wall, too many to count. Near the end the groups stop being fives and start being letters. The letters spell a name, and the name is nearly finished.'),
  },

  // ---------------------------------------------------------------------------
  // Anywhere
  // ---------------------------------------------------------------------------
  {
    id: 'note.any.letter',
    title: tr('Letter Home'),
    minDepth: 2,
    source: tr('A letter, sealed, addressed to Stairhead'),
    text: tr('Mother. The pay is good and the work is simple. You walk down, and things come up to meet you. Do not let them tell you it is dangerous. It is only lonely.'),
  },
  {
    id: 'note.any.rope',
    title: tr('Rope'),
    minDepth: 4,
    source: tr('A coil of rope with a wagon tag'),
    text: tr('Sold by the Stairhead wagon. Tied off at the bottom in a knot no delver uses: a loop round nothing, pulled very tight, as if something had held the end and asked to be pulled up.'),
  },
  {
    id: 'note.any.third',
    title: tr('Day Twenty'),
    minDepth: 5,
    source: tr('A page torn from an expedition log'),
    text: tr('Tier five. Ferris is singing again, which means his feet hurt. Gilder says we turn back at the eleventh no matter what. Nobody has asked him what is on the eleventh.'),
  },
  {
    id: 'note.any.pin',
    title: tr('A Pin, Walked'),
    minDepth: 6,
    source: tr('A brass survey pin, stamped'),
    text: tr('Stamped: Caul survey, first tier. Found on the sixth. Wenna will want it. Wenna will want to know how it walked.'),
  },
  {
    id: 'note.any.marker',
    title: tr('Marker'),
    minDepth: 8,
    source: tr('A grave marker, carried down'),
    text: tr('Cut at three-quarters of an inch, every letter, the way Marrow cuts them: a name you do not know, and a tier. The tier is this one. The lettering is very good.'),
  },
  {
    id: 'note.any.minutes',
    title: tr('Minutes'),
    minDepth: 20,
    source: tr('A page of council minutes, torn out'),
    text: tr('Resolved: that a delver be kept below at all times. Resolved: that the delvers not be told why. Objection from the captain of the watch, noted. Objection from the captain of the watch, struck out.'),
  },
  {
    id: 'note.any.place',
    title: tr('A Place Set'),
    minDepth: 60,
    source: tr('A journal, every page blank but one'),
    text: tr('I have not seen another delver in a month. The thing below has started setting a place for me. I think I will sit down.'),
  },
];

const BY_ID = new Map(NOTES.map((n) => [n.id, n]));

export function noteById(id: string): LoreNote | undefined {
  return BY_ID.get(id);
}
