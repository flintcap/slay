/**
 * SLAY — what the uniques and sets are called, and what is said about them.
 *
 * The numbers live in `data/uniques.ts` and `data/sets.ts` (depth's files).
 * The words live here, so the story can keep them in one voice: every name
 * belongs to this world, every line is something a person in Stairhead could
 * say about the thing on the counter. Both files apply these entries once, as
 * they load, before anything looks an item up.
 *
 * Rules, so additions stay of a piece:
 *   - Names are plain words or the name of someone who lived here. No borrowed
 *     names from anywhere else.
 *   - Flavour says one true thing about the object, ideally where it came
 *     from. It does not explain the mechanics; `hook` does that, plainly.
 *   - A hook never talks about the game as a game: no "in the game", no
 *     "level 51 to the end", no "farming".
 *
 * New drops, the tooltip flavour and the codex use these. Uniques already in
 * a save are renamed to match when the save loads (`core/Save.ts`).
 *
 * `tools/check-story.mjs` reads every unique and set through this table.
 */

import { tr } from '../../core/I18n';
export interface UniqueText {
  name?: string;
  flavor?: string;
  hook?: string;
}

export const UNIQUE_TEXT: Record<string, UniqueText> = {
  // ---------------------------------------------------------------------------
  // Early
  // ---------------------------------------------------------------------------
  'uq.rixots': {
    name: tr("Orlo's Keen"),
    flavor: tr('Dace Orlo sharpened it every night for thirty years and died of a cough on the second tier.'),
  },
  'uq.felloak': {
    name: tr('Hilloak'),
    flavor: tr('Cut from the last oak on the hill, which was already burning and never stopped.'),
  },
  'uq.gnasher': {
    name: tr('Toothhaft'),
    flavor: tr('Something chewed the haft to fit its own jaw. It fits your hand too, which is worse.'),
  },
  'uq.hotspur': {
    name: tr('Cinderheels'),
    flavor: tr('The last owner walked out of the Works at the change of shift and kept walking.'),
  },
  'uq.pluckeye': {
    name: tr('Eyepicker'),
    flavor: tr('Named for what it does, not for who made it.'),
  },
  'uq.greyform': {
    name: tr('Dullhide'),
    flavor: tr('A hide so dull the eye slides off it, and so does most of what is thrown.'),
  },
  'uq.jadetando': {
    name: tr('The Green Tooth'),
    flavor: tr('A blade for people who mean to be the last one standing, not the first one moving.'),
  },
  'uq.wormskull': {
    name: tr('Wormcap'),
    flavor: tr('It fits every head. That is the least strange thing about it.'),
  },
  'uq.steelclash': {
    name: tr('Bellguard'),
    flavor: tr('Rings like the bell at Stairhead, struck badly. The ringing is the point.'),
  },
  'uq.nightsmoke': {
    name: tr('The Grey Sash'),
    flavor: tr('Woven from something that used to be weather.'),
  },
  'uq.bloodrise': {
    name: tr('The Glutton'),
    flavor: tr('It is heavier after a fight than before one.'),
  },
  'uq.civerbs': {
    name: tr("The Sexton's Cudgel"),
    flavor: tr('Caul\'s sextons carried these to settle the shelved when they would not lie still. The sextons are gone. The shelved are not.'),
  },
  'uq.gorefoot': {
    name: tr('Redtread'),
    flavor: tr('The tread pattern is not a tread pattern.'),
  },
  'uq.venomward': {
    name: tr('Greenward'),
    flavor: tr('Green stains that will not come off, and never needed to.'),
  },
  'uq.skystrike': {
    name: tr('Splitsky'),
    flavor: tr('Loosed once at the storm on the Spire. The storm moved.'),
  },
  'uq.hexfire': {
    name: tr('Feverblade'),
    flavor: tr('It has a fever, and it is catching.'),
  },
  'uq.frostwind': {
    name: tr('Rimebrand'),
    flavor: tr('Brought up from the Archive. The scabbard cracked from the inside within a week.'),
  },
  'uq.duskdeep': {
    name: tr('The Shut Visor'),
    flavor: tr('The visor slot is welded shut. It has been for a long time.'),
  },
  'uq.magefist': {
    name: tr('Scorchgrip'),
    flavor: tr('The fingertips are scorched from the inside.'),
  },
  'uq.frostburn': {
    name: tr('The Aching Hands'),
    flavor: tr('Both hands ache. Neither hand is cold.'),
  },
  'uq.stormchaser': {
    name: tr('Weathervane'),
    flavor: tr('It points at weather. Not always weather you can see.'),
  },
  'uq.rockstopper': {
    name: tr('Firstblow'),
    flavor: tr('Dented in one place, very deeply. Whatever did it did not get a second try.'),
  },
  'uq.goldwrap': {
    name: tr('Coincinch'),
    flavor: tr('The buckle is worth more than most of what it has held up.'),
  },
  'uq.nagelring': {
    name: tr('Brass Luck'),
    flavor: tr('Cheap metal, unreasonable luck.'),
  },
  'uq.manald': {
    name: tr("Ossik's Signet"),
    flavor: tr('A physician of Caul wore it on the hand he took the sick in with. He never lost a patient.'),
  },

  // ---------------------------------------------------------------------------
  // The middle tiers
  // ---------------------------------------------------------------------------
  'uq.cleglaw': {
    name: tr('Unasked'),
    flavor: tr('A duelling blade, for a duel nobody agreed to.'),
  },
  'uq.buriza': {
    name: tr('Linebreaker'),
    flavor: tr('Built in the Works to break a line of ten thousand. It was loaded once. The line was never delivered.'),
  },
  'uq.titans': {
    name: tr('Homeward'),
    flavor: tr('Thrown at something very large. Came back. The something did not.'),
  },
  'uq.stormshield': {
    name: tr('The Eleventh Strap'),
    flavor: tr('The straps have been replaced eleven times. The face never has.'),
  },
  'uq.shaftstop': {
    name: tr('The Pincushion'),
    flavor: tr('Arrows come out of it if you shake it hard enough.'),
  },
  'uq.gazehell': {
    name: tr('Kindling Gaze'),
    flavor: tr('It has been looking at something ever since it was made. Not at you.'),
  },
  'uq.silkweave': {
    name: tr('Threadwalkers'),
    flavor: tr('Every thread is a spider that agreed to stop being a spider. Sae-lith did not agree.'),
  },
  'uq.chancecast': {
    name: tr("Gambler's Gauntlets"),
    flavor: tr('A gambler had them made. Nobody knows if it worked out.'),
  },
  'uq.ravenfrost': {
    name: tr('Unthawed'),
    flavor: tr('Cold to hold, and it does not warm up.'),
  },
  'uq.bulkathos': {
    name: tr('The Long Marriage'),
    flavor: tr('A wedding band that outlived both parties and most of Caul.'),
  },
  'uq.thegravenspine': {
    name: tr('The Graven Spine'),
    flavor: tr('Every knot in the wood is a face, and they are all listening.'),
  },
  'uq.widowmaker': {
    name: tr("Widow's Lock"),
    flavor: tr('The fletching is human hair. It was given freely.'),
  },
  'uq.hellslayer': {
    name: tr('Gravesplitter'),
    flavor: tr('Two hands, one purpose, no second opinion.'),
  },
  'uq.spectralshard': {
    name: tr('Halfblade'),
    flavor: tr('Half of it is missing, and it works better that way.'),
    hook: tr('Very quick in a caster\'s hand, and it barely cuts.'),
  },
  'uq.windforce': {
    name: tr('Doorsong'),
    flavor: tr('The draw makes a sound like a door opening somewhere behind you.'),
  },
  'uq.doombringer': {
    name: tr('The Undoing'),
    flavor: tr('It was named in hope, and then lived up to the name.'),
  },
  'uq.griswold': {
    name: tr("Hurn's Edge"),
    flavor: tr('The Forgefather kept the best one for himself. He has not needed it in four hundred years.'),
  },
  'uq.azurewrath': {
    name: tr('Coldlight'),
    flavor: tr('It does not reflect torchlight. It replaces it.'),
  },
  'uq.arreatsface': {
    name: tr('The Stone Face'),
    flavor: tr('Cut from the hill for a king of Caul who wished to be as patient as stone. He was, in the end.'),
    hook: tr('Good at everything. Nobody who wears it argues.'),
  },
  'uq.crownofages': {
    name: tr('Crown of Caul'),
    flavor: tr('Six kings of Caul. One crown. None of them kept it long.'),
  },
  'uq.leviathan': {
    name: tr('Floodplate'),
    flavor: tr('Salt crusts the seams, from water the Sanctum let in on purpose.'),
  },
  'uq.skinofvipermagi': {
    name: tr('The Shed Skin'),
    flavor: tr('Shed, not skinned. Whatever left it is still down there, and larger.'),
    hook: tr('A caster can wear it from the middle deep to the bottom. Many have.'),
  },
  'uq.warTraveler': {
    name: tr('Stairworn'),
    flavor: tr('They have been down the stair more times than anyone who wore them.'),
    hook: tr('They find more, and cost your strikes nothing.'),
  },
  'uq.gorerider': {
    name: tr('Bonespur'),
    flavor: tr('The spurs are not for show, and were not always metal.'),
  },
  'uq.dracul': {
    name: tr('The Closing Hand'),
    flavor: tr('The fingers close before you decide to close them.'),
  },
  'uq.arachnid': {
    name: tr('Webcinch'),
    flavor: tr('It tightens on its own, very slightly, over years.'),
  },
  'uq.verdungo': {
    name: tr('Hardknot'),
    flavor: tr('The knot has never been untied, and should not be.'),
  },
  'uq.highlords': {
    name: tr('Wrathbone'),
    flavor: tr('It holds the knucklebone of a lord of Caul who was not a lord and was very angry about it.'),
  },
  'uq.mara': {
    name: tr('Mere Ford Prism'),
    flavor: tr('Carried out of a town in the Cinderfields before it burned. Look through it and everything is briefly the wrong colour.'),
  },
  'uq.metalgrid': {
    name: tr("The Foreman's Sigil"),
    flavor: tr('Two iron sentries from the Works answer to it. Nobody has told them the war is over.'),
  },
  'uq.soj': {
    name: tr('Stairhead Tender'),
    flavor: tr('It has changed hands as coin more often than it has been worn.'),
    hook: tr('Everybody wants it. Nobody admits how long they looked.'),
  },
  'uq.carrionwind': {
    name: tr('Rotwind'),
    flavor: tr('The stone in it is not a stone.'),
  },
  'uq.thunderstroke': {
    name: tr('Upstroke'),
    flavor: tr('Held up in a storm, it does not draw the lightning. It sends it back, upward.'),
  },
  'uq.deathsweb': {
    name: tr('Namestrand'),
    flavor: tr('Every strand is a name, and the list is not finished.'),
  },
  'uq.eschutas': {
    name: tr('The Turning Orb'),
    flavor: tr('Warm on one side, freezing on the other, and it turns.'),
  },
  'uq.herald': {
    name: tr('The Procession'),
    flavor: tr('Carried at the front of a procession of the Sanctum that never reached the water.'),
  },
  'uq.lastwish': {
    name: tr('The Granted Wish'),
    flavor: tr('Granted exactly once, badly, and then it kept swinging.'),
  },

  // ---------------------------------------------------------------------------
  // Mythic
  // ---------------------------------------------------------------------------
  'my.griffonseye': {
    name: tr('Lens of Uln'),
    flavor: tr('The lens is ground from something that was watching before it was glass.'),
  },
  'my.harlequin': {
    name: tr("The Fool's Crown"),
    flavor: tr('The joke is old, and you are the end of it.'),
    hook: tr('Life, mana, skills, fortune and a harder hide, all on one head.'),
  },
  'my.tyraelsmight': {
    name: tr('The Unmended'),
    flavor: tr('Nobody has ever needed to repair it, which is the strangest part.'),
    hook: tr('Needs no strength. Cannot be broken. Demons will not close with it.'),
  },
  'my.chainsofhonor': {
    name: tr('The Oathchain'),
    flavor: tr('Each link is stamped with an oath. Most of them were kept.'),
  },
  'my.the-oculus': {
    name: tr('The Lidded Eye'),
    flavor: tr('It blinks. Not often, and never while you are looking.'),
  },
  'my.wizardspike': {
    name: tr('The Circlemaker'),
    flavor: tr('Held point down, it draws a circle in the dust by itself.'),
  },
  'my.the-reapers-toll': {
    name: tr('Tollkeeper'),
    flavor: tr('The toll is collected whether or not the debt was yours.'),
  },
  'my.beast': {
    name: tr('The Changing Axe'),
    flavor: tr('There are teeth marks on the inside of the grip.'),
  },
  'my.iceblink': {
    name: tr('Glassbell'),
    flavor: tr('It rings once, at a pitch you feel in your teeth, and then the room is cold.'),
  },
  'my.faith': {
    name: tr('The Fervent'),
    flavor: tr('It is not clear what the faith was in. It did not seem to matter.'),
  },
  'my.spirit-of-the-forge': {
    name: tr('Spirit of the Forge'),
    flavor: tr('It was never quenched. It has been cooling for four hundred years and is not done.'),
  },
  'my.nightwing': {
    name: tr('The Reading Veil'),
    flavor: tr('Thin enough to read through, and you should not.'),
  },
  'my.stoneofthevoid': {
    name: tr('Stone of the Hollow'),
    flavor: tr('Chipped from the Spire. It weighs nothing at all, and your hand still knows it is there.'),
  },
  'my.seraphshymn': {
    name: tr('Hymnstone'),
    flavor: tr('It sings when carried and stops the moment you set it down, like the congregation.'),
  },

  // ---------------------------------------------------------------------------
  // Ancient
  // ---------------------------------------------------------------------------
  'an.worldbreaker': {
    name: tr('Worldbreaker'),
    flavor: tr('It has been used to open exactly three things: a gate, a hill, and something that was asleep.'),
  },
  'an.the-long-noon': {
    name: tr('The Long Noon'),
    flavor: tr('Held up at midnight it casts a shadow anyway, from the wrong direction.'),
  },
  'an.eternity': {
    name: tr('The Unjoined Loop'),
    flavor: tr('A ring with no join. Turning it does nothing, and everyone tries.'),
  },
  'an.the-first-word': {
    name: tr('The First Word'),
    flavor: tr('Somebody said something, once, and everything after that was consequences.'),
  },
  'an.mourning-star': {
    name: tr('Mourning Star'),
    flavor: tr('A funeral weapon. It was carried at the front, not used. It is being used now.'),
  },
  'an.the-hollow-crown': {
    name: tr('The Hollow Crown'),
    flavor: tr('It fits nobody. It has never fitted anybody. People keep putting it on.'),
  },
  'an.godsblood-shroud': {
    name: tr('Shroud of the Sleeper'),
    flavor: tr('It is breathing, slowly. So is what it was taken from.'),
  },
  // ---------------------------------------------------------------------------
  // Pants
  // ---------------------------------------------------------------------------
  'uq.mudlark': {
    name: tr("Mudlark's Breeches"),
    flavor: tr('Pulled out of the river mud below Stairhead. Nobody asked after the owner.'),
  },
  'uq.hearthwool': {
    name: tr('Hearthwool'),
    flavor: tr('Knitted by the stove in the Lamp, one row a night, all winter.'),
  },
  'uq.gatewarden': {
    name: tr('Gatewarden'),
    flavor: tr('The gate on the first tier fell. The man who held it did not.'),
  },
  'uq.brambleshanks': {
    name: tr('Brambleshanks'),
    flavor: tr('Every stud was hammered in by a hand that had bled on a bramble that day.'),
  },
  'uq.stillwater': {
    name: tr('Stillwater'),
    flavor: tr('Woven at the bottom of the cistern, where the water has not moved in a hundred years.'),
  },
  'uq.anvilknees': {
    name: tr('Anvilknees'),
    flavor: tr('Beaten on the big anvil at the Works, by a smith who wanted something that would not kneel.'),
  },
  'uq.wyrmhaunch': {
    name: tr('Wyrmhaunch'),
    flavor: tr('Cut from the hide of the wyrm under the Works. The hide is still warm.'),
  },
  'uq.nightstride': {
    name: tr('Nightstride'),
    flavor: tr('Sewn on the roof of the Archive, by the light of stars that are no longer there.'),
  },
  'uq.lastrank': {
    name: tr('The Last Rank'),
    flavor: tr('The last line of the old guard held the stair for nine days. These are what was left standing.'),
  },
  'my.rootbound': {
    name: tr('Rootbound'),
    flavor: tr('Caul planted a tree where the dead lay. The roots came up through the floor and into these.'),
  },
  'an.spirefoot': {
    name: tr('Spirefoot'),
    flavor: tr('The Spire stands on two legs of stone. These were cut from the same quarry, and they have not moved either.'),
  },
  // ---------------------------------------------------------------------------
  // Charms
  // ---------------------------------------------------------------------------
  'uq.charm.widowpebble': {
    name: tr('The Widow\'s Pebble'),
    flavor: tr('Maudie Thorn kept it in her cheek the winter her husband went down the stairs, so she would not say his name aloud.'),
  },
  'uq.charm.emberstone': {
    name: tr('Ember in a Stone'),
    flavor: tr('Picked out of the kiln after the potter\'s house burned. It is still warm, and it is still angry.'),
  },
  'uq.charm.pellmother': {
    name: tr('Pellmother\'s Eye'),
    flavor: tr('The old woman by the well read fortunes with it, and only ever told the bad ones.'),
  },
  'uq.charm.corranfingers': {
    name: tr('Two Fingers of Ash Corran'),
    flavor: tr('Corran held the gate alone for a night. In the morning these were what they found of him, still pointing down.'),
  },
  'uq.charm.hangknot': {
    name: tr('The Hangman\'s Knot'),
    flavor: tr('Cut from the gallows on the fen when the rope was replaced. The new rope never held as well.'),
  },
  'uq.charm.lanternmoth': {
    name: tr('Lantern-Moth Fetish'),
    flavor: tr('Moths came to the lamp in the low tunnels and would not leave. Someone tied them to a bone so they would at least be useful.'),
  },
  'uq.charm.ninthbell': {
    name: tr('Plaque of the Ninth Bell'),
    flavor: tr('There were nine bells in the chapel tower. Eight were melted for blades. The ninth asked to be left alone.'),
  },
  'uq.charm.saltwife': {
    name: tr('Saltwife\'s Tally'),
    flavor: tr('A bone scored with every coin she was ever owed. She was owed a great many, and she collected.'),
  },
  'uq.charm.mutepsalm': {
    name: tr('The Mute Psalm'),
    flavor: tr('The words were scraped off the bone one at a time by a monk who had taken a vow of silence and regretted it.'),
  },
  'uq.charm.drownedidol': {
    name: tr('The Drowned Idol'),
    flavor: tr('The fen took the lower village in one night. The idol was the only thing that floated back.'),
  },
  'uq.charm.lastherd': {
    name: tr('Horn of the Last Herd'),
    flavor: tr('The herders blew it to call the cattle home off the hill. The last time it was blown, something else came.'),
  },
  'uq.charm.ninateeth': {
    name: tr('Crown of Nine Teeth'),
    flavor: tr('Nine teeth from nine mouths that each tried to bite the same watchman. He kept them, strung them, and wore his luck.'),
  },
};

export const SET_TEXT: Record<string, { name?: string; blurb?: string }> = {
  'set.bloodied': { blurb: tr('Three pieces of a company of sellswords that stopped taking prisoners on the fourth tier.') },
  'set.kindled': { blurb: tr('A novice mage burned down her own order. These are what was left of it.') },
  'set.quickstep': { blurb: tr('Nobody who wore these was ever hit. Nobody who wore these was ever hit twice.') },
  'set.bonefetter': { blurb: tr('Worn by a revenant who kept his household staff on after their deaths. They are still on the books.') },
  'set.gravewarden': { blurb: tr('Four hundred nights on the palisade at Stairhead, and not one thing came over it.') },
  'set.frostwrought': { blurb: tr('Forged in the Archive, where the forge itself had to be kept warm.') },
  'set.stormbound': { blurb: tr('Five conductors in a ring, cast from the Spire\'s lightning. Whatever stands inside the ring does not stay standing.') },
  'set.venomthread': { blurb: tr('Not woven. Drawn. The weaver is still in the Warrens, under the floor.') },
  'set.ironvow': { blurb: tr('The vow was short: nothing gets through. It has been kept.') },
  'set.ashwalker': { blurb: tr('He walked out of the Cinderfields after nine years. Nothing followed him out. That was the worrying part.') },
  'set.gilded': { blurb: tr('An agreement between four thieves, none of whom trusted the other three.') },
  'set.nightfall': { blurb: tr('Five people met once, at dusk, and agreed on something. Nobody knows what.') },
  'set.sunderedsky': { blurb: tr('Gathered from six disasters, each survived by exactly one person.') },
  'set.lastlegion': { blurb: tr('The last company of the Works held a gate for six days. This is the sixth day.') },
  'set.hollowking': { blurb: tr('A crown, a hand, a heel and a heart. The king himself is not included.') },
  'set.tollgate': { blurb: tr('The wardens of the old bridge took a coin from everyone who crossed. From the things that came up out of the river, they took more.') },
  'set.orrery': { blurb: tr('A brass clock of the heavens that a mage wore piece by piece, so that she would always know what hour it was in the sky.') },
  'set.lampblack': { blurb: tr('The chimney sweeps of the old town went where nobody else could. Some of them were paid to come down a chimney and not go back up it.') },
  'set.heronwatch': { blurb: tr('Marsh hunters who stood in the reeds so still and so long that the herons came and stood beside them.') },
  'set.pallbearer': { blurb: tr('The funeral guild of the lower town carried every coffin to the crypt. When the dead stopped staying in them, the guild carried on.') },
  'set.lanternwright': { blurb: tr('The lamp makers kept a light in every window of the chapel through the long dark. They were never once asked to. They were never once thanked.') },
  'set.tallowmoon': { blurb: tr('The moon cult on the hill made masks of tallow and wore the skins of what they hunted. When the moon was full, it was hard to say which was which.') },
  'set.cutpurse': { blurb: tr('A stolen ring and a stolen pendant, threaded on a bit of string that was also stolen.') },
  'set.tinker': { blurb: tr('Patched leather and copper rivets, none of it matching, all of it mended by a tinker who could fix anything but his own luck.') },
  'set.saltmarsh': { blurb: tr('Oilcloth gear for the road across the salt flats, rimmed white where the sea dried on it.') },
  'set.ninefold': { blurb: tr('Nine little silver bells, one for each voice in the choir that sang the town to sleep in the winter of the long night.') },
  'set.kilnborn': { blurb: tr('Armour of glazed red clay, fired in the great kiln and lined in gold where it cracked. It was made for someone who meant to walk into the fire.') },
  'set.glasswing': { blurb: tr('Light cloth set with panes of crystal like a moth\'s wings. It shatters, and it is meant to.') },
  'set.drownedbell': { blurb: tr('A company of marines who went down with the bell-ship. On still nights you can hear them ringing for a muster that will never come.') },
  'set.pretender': { blurb: tr('A whole king\'s kit, stolen from the treasury on the night the old king died. It does not quite fit. Nothing about the claim quite fits.') },
  'set.cartographer': { blurb: tr('A map-maker who mapped only the dead: where they lay, and where they went after. The ink on his fingers never came off.') },
  'set.hollowmere': { blurb: tr('Hollowmere drowned in a night, and the lamp lighter went round every street lighting the lamps under the water. This is all of his kit. One lamp is still lit.') },
};

/** Writes the story's names and lines onto the unique definitions. */
export function applyUniqueText(defs: Array<{ id: string; name: string; flavor: string; hook?: string }>): void {
  for (const d of defs) {
    const t = UNIQUE_TEXT[d.id];
    if (!t) continue;
    if (t.name) d.name = t.name;
    if (t.flavor) d.flavor = t.flavor;
    if (t.hook) d.hook = t.hook;
  }
}

/** Writes the story's names and blurbs onto the set definitions. */
export function applySetText(defs: Array<{ id: string; name: string; blurb: string }>): void {
  for (const d of defs) {
    const t = SET_TEXT[d.id];
    if (!t) continue;
    if (t.name) d.name = t.name;
    if (t.blurb) d.blurb = t.blurb;
  }
}
