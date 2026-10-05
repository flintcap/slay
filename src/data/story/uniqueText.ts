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
    name: "Orlo's Keen",
    flavor: `Dace Orlo sharpened it every night for thirty years and died of a cough on the second tier.`,
  },
  'uq.felloak': {
    name: 'Hilloak',
    flavor: `Cut from the last oak on the hill, which was already burning and never stopped.`,
  },
  'uq.gnasher': {
    name: 'Toothhaft',
    flavor: `Something chewed the haft to fit its own jaw. It fits your hand too, which is worse.`,
  },
  'uq.hotspur': {
    name: 'Cinderheels',
    flavor: `The last owner walked out of the Works at the change of shift and kept walking.`,
  },
  'uq.pluckeye': {
    name: 'Eyepicker',
    flavor: `Named for what it does, not for who made it.`,
  },
  'uq.greyform': {
    name: 'Dullhide',
    flavor: `A hide so dull the eye slides off it, and so does most of what is thrown.`,
  },
  'uq.jadetando': {
    name: 'The Green Tooth',
    flavor: `A blade for people who mean to be the last one standing, not the first one moving.`,
  },
  'uq.wormskull': {
    name: 'Wormcap',
    flavor: `It fits every head. That is the least strange thing about it.`,
  },
  'uq.steelclash': {
    name: 'Bellguard',
    flavor: `Rings like the bell at Stairhead, struck badly. The ringing is the point.`,
  },
  'uq.nightsmoke': {
    name: 'The Grey Sash',
    flavor: `Woven from something that used to be weather.`,
  },
  'uq.bloodrise': {
    name: 'The Glutton',
    flavor: `It is heavier after a fight than before one.`,
  },
  'uq.civerbs': {
    name: "The Sexton's Cudgel",
    flavor: `Caul's sextons carried these to settle the shelved when they would not lie still. The sextons are gone. The shelved are not.`,
  },
  'uq.gorefoot': {
    name: 'Redtread',
    flavor: `The tread pattern is not a tread pattern.`,
  },
  'uq.venomward': {
    name: 'Greenward',
    flavor: `Green stains that will not come off, and never needed to.`,
  },
  'uq.skystrike': {
    name: 'Splitsky',
    flavor: `Loosed once at the storm on the Spire. The storm moved.`,
  },
  'uq.hexfire': {
    name: 'Feverblade',
    flavor: `It has a fever, and it is catching.`,
  },
  'uq.frostwind': {
    name: 'Rimebrand',
    flavor: `Brought up from the Archive. The scabbard cracked from the inside within a week.`,
  },
  'uq.duskdeep': {
    name: 'The Shut Visor',
    flavor: `The visor slot is welded shut. It has been for a long time.`,
  },
  'uq.magefist': {
    name: 'Scorchgrip',
    flavor: `The fingertips are scorched from the inside.`,
  },
  'uq.frostburn': {
    name: 'The Aching Hands',
    flavor: `Both hands ache. Neither hand is cold.`,
  },
  'uq.stormchaser': {
    name: 'Weathervane',
    flavor: `It points at weather. Not always weather you can see.`,
  },
  'uq.rockstopper': {
    name: 'Firstblow',
    flavor: `Dented in one place, very deeply. Whatever did it did not get a second try.`,
  },
  'uq.goldwrap': {
    name: 'Coincinch',
    flavor: `The buckle is worth more than most of what it has held up.`,
  },
  'uq.nagelring': {
    name: 'Brass Luck',
    flavor: `Cheap metal, unreasonable luck.`,
  },
  'uq.manald': {
    name: "Ossik's Signet",
    flavor: `A physician of Caul wore it on the hand he took the sick in with. He never lost a patient.`,
  },

  // ---------------------------------------------------------------------------
  // The middle tiers
  // ---------------------------------------------------------------------------
  'uq.cleglaw': {
    name: 'Unasked',
    flavor: `A duelling blade, for a duel nobody agreed to.`,
  },
  'uq.buriza': {
    name: 'Linebreaker',
    flavor: `Built in the Works to break a line of ten thousand. It was loaded once. The line was never delivered.`,
  },
  'uq.titans': {
    name: 'Homeward',
    flavor: `Thrown at something very large. Came back. The something did not.`,
  },
  'uq.stormshield': {
    name: 'The Eleventh Strap',
    flavor: `The straps have been replaced eleven times. The face never has.`,
  },
  'uq.shaftstop': {
    name: 'The Pincushion',
    flavor: `Arrows come out of it if you shake it hard enough.`,
  },
  'uq.gazehell': {
    name: 'Kindling Gaze',
    flavor: `It has been looking at something ever since it was made. Not at you.`,
  },
  'uq.silkweave': {
    name: 'Threadwalkers',
    flavor: `Every thread is a spider that agreed to stop being a spider. Sae-lith did not agree.`,
  },
  'uq.chancecast': {
    name: "Gambler's Gauntlets",
    flavor: `A gambler had them made. Nobody knows if it worked out.`,
  },
  'uq.ravenfrost': {
    name: 'Unthawed',
    flavor: `Cold to hold, and it does not warm up.`,
  },
  'uq.bulkathos': {
    name: 'The Long Marriage',
    flavor: `A wedding band that outlived both parties and most of Caul.`,
  },
  'uq.thegravenspine': {
    name: 'The Graven Spine',
    flavor: `Every knot in the wood is a face, and they are all listening.`,
  },
  'uq.widowmaker': {
    name: "Widow's Lock",
    flavor: `The fletching is human hair. It was given freely.`,
  },
  'uq.hellslayer': {
    name: 'Gravesplitter',
    flavor: `Two hands, one purpose, no second opinion.`,
  },
  'uq.spectralshard': {
    name: 'Halfblade',
    flavor: `Half of it is missing, and it works better that way.`,
    hook: 'Very quick in a caster\'s hand, and it barely cuts.',
  },
  'uq.windforce': {
    name: 'Doorsong',
    flavor: `The draw makes a sound like a door opening somewhere behind you.`,
  },
  'uq.doombringer': {
    name: 'The Undoing',
    flavor: `It was named in hope, and then lived up to the name.`,
  },
  'uq.griswold': {
    name: "Hurn's Edge",
    flavor: `The Forgefather kept the best one for himself. He has not needed it in four hundred years.`,
  },
  'uq.azurewrath': {
    name: 'Coldlight',
    flavor: `It does not reflect torchlight. It replaces it.`,
  },
  'uq.arreatsface': {
    name: 'The Stone Face',
    flavor: `Cut from the hill for a king of Caul who wished to be as patient as stone. He was, in the end.`,
    hook: 'Good at everything. Nobody who wears it argues.',
  },
  'uq.crownofages': {
    name: 'Crown of Caul',
    flavor: `Six kings of Caul. One crown. None of them kept it long.`,
  },
  'uq.leviathan': {
    name: 'Floodplate',
    flavor: `Salt crusts the seams, from water the Sanctum let in on purpose.`,
  },
  'uq.skinofvipermagi': {
    name: 'The Shed Skin',
    flavor: `Shed, not skinned. Whatever left it is still down there, and larger.`,
    hook: 'A caster can wear it from the middle deep to the bottom. Many have.',
  },
  'uq.warTraveler': {
    name: 'Stairworn',
    flavor: `They have been down the stair more times than anyone who wore them.`,
    hook: 'They find more, and cost your strikes nothing.',
  },
  'uq.gorerider': {
    name: 'Bonespur',
    flavor: `The spurs are not for show, and were not always metal.`,
  },
  'uq.dracul': {
    name: 'The Closing Hand',
    flavor: `The fingers close before you decide to close them.`,
  },
  'uq.arachnid': {
    name: 'Webcinch',
    flavor: `It tightens on its own, very slightly, over years.`,
  },
  'uq.verdungo': {
    name: 'Hardknot',
    flavor: `The knot has never been untied, and should not be.`,
  },
  'uq.highlords': {
    name: 'Wrathbone',
    flavor: `It holds the knucklebone of a lord of Caul who was not a lord and was very angry about it.`,
  },
  'uq.mara': {
    name: 'Mere Ford Prism',
    flavor: `Carried out of a town in the Cinderfields before it burned. Look through it and everything is briefly the wrong colour.`,
  },
  'uq.metalgrid': {
    name: "The Foreman's Sigil",
    flavor: `Two iron sentries from the Works answer to it. Nobody has told them the war is over.`,
  },
  'uq.soj': {
    name: 'Stairhead Tender',
    flavor: `It has changed hands as coin more often than it has been worn.`,
    hook: 'Everybody wants it. Nobody admits how long they looked.',
  },
  'uq.carrionwind': {
    name: 'Rotwind',
    flavor: `The stone in it is not a stone.`,
  },
  'uq.thunderstroke': {
    name: 'Upstroke',
    flavor: `Held up in a storm, it does not draw the lightning. It sends it back, upward.`,
  },
  'uq.deathsweb': {
    name: 'Namestrand',
    flavor: `Every strand is a name, and the list is not finished.`,
  },
  'uq.eschutas': {
    name: 'The Turning Orb',
    flavor: `Warm on one side, freezing on the other, and it turns.`,
  },
  'uq.herald': {
    name: 'The Procession',
    flavor: `Carried at the front of a procession of the Sanctum that never reached the water.`,
  },
  'uq.lastwish': {
    name: 'The Granted Wish',
    flavor: `Granted exactly once, badly, and then it kept swinging.`,
  },

  // ---------------------------------------------------------------------------
  // Mythic
  // ---------------------------------------------------------------------------
  'my.griffonseye': {
    name: 'Lens of Uln',
    flavor: `The lens is ground from something that was watching before it was glass.`,
  },
  'my.harlequin': {
    name: "The Fool's Crown",
    flavor: `The joke is old, and you are the end of it.`,
    hook: 'Life, mana, skills, fortune and a harder hide, all on one head.',
  },
  'my.tyraelsmight': {
    name: 'The Unmended',
    flavor: `Nobody has ever needed to repair it, which is the strangest part.`,
    hook: 'Needs no strength. Cannot be broken. Demons will not close with it.',
  },
  'my.chainsofhonor': {
    name: 'The Oathchain',
    flavor: `Each link is stamped with an oath. Most of them were kept.`,
  },
  'my.the-oculus': {
    name: 'The Lidded Eye',
    flavor: `It blinks. Not often, and never while you are looking.`,
  },
  'my.wizardspike': {
    name: 'The Circlemaker',
    flavor: `Held point down, it draws a circle in the dust by itself.`,
  },
  'my.the-reapers-toll': {
    name: 'Tollkeeper',
    flavor: `The toll is collected whether or not the debt was yours.`,
  },
  'my.beast': {
    name: 'The Changing Axe',
    flavor: `There are teeth marks on the inside of the grip.`,
  },
  'my.iceblink': {
    name: 'Glassbell',
    flavor: `It rings once, at a pitch you feel in your teeth, and then the room is cold.`,
  },
  'my.faith': {
    name: 'The Fervent',
    flavor: `It is not clear what the faith was in. It did not seem to matter.`,
  },
  'my.spirit-of-the-forge': {
    name: 'Spirit of the Forge',
    flavor: `It was never quenched. It has been cooling for four hundred years and is not done.`,
  },
  'my.nightwing': {
    name: 'The Reading Veil',
    flavor: `Thin enough to read through, and you should not.`,
  },
  'my.stoneofthevoid': {
    name: 'Stone of the Hollow',
    flavor: `Chipped from the Spire. It weighs nothing at all, and your hand still knows it is there.`,
  },
  'my.seraphshymn': {
    name: 'Hymnstone',
    flavor: `It sings when carried and stops the moment you set it down, like the congregation.`,
  },

  // ---------------------------------------------------------------------------
  // Ancient
  // ---------------------------------------------------------------------------
  'an.worldbreaker': {
    name: 'Worldbreaker',
    flavor: `It has been used to open exactly three things: a gate, a hill, and something that was asleep.`,
  },
  'an.the-long-noon': {
    name: 'The Long Noon',
    flavor: `Held up at midnight it casts a shadow anyway, from the wrong direction.`,
  },
  'an.eternity': {
    name: 'The Unjoined Loop',
    flavor: `A ring with no join. Turning it does nothing, and everyone tries.`,
  },
  'an.the-first-word': {
    name: 'The First Word',
    flavor: `Somebody said something, once, and everything after that was consequences.`,
  },
  'an.mourning-star': {
    name: 'Mourning Star',
    flavor: `A funeral weapon. It was carried at the front, not used. It is being used now.`,
  },
  'an.the-hollow-crown': {
    name: 'The Hollow Crown',
    flavor: `It fits nobody. It has never fitted anybody. People keep putting it on.`,
  },
  'an.godsblood-shroud': {
    name: 'Shroud of the Sleeper',
    flavor: `It is breathing, slowly. So is what it was taken from.`,
  },
};

export const SET_TEXT: Record<string, { name?: string; blurb?: string }> = {
  'set.bloodied': { blurb: `Three pieces of a company of sellswords that stopped taking prisoners on the fourth tier.` },
  'set.kindled': { blurb: `A novice pyromancer burned down her own order. These are what was left of it.` },
  'set.quickstep': { blurb: `Nobody who wore these was ever hit. Nobody who wore these was ever hit twice.` },
  'set.bonefetter': { blurb: `Worn by a revenant who kept his household staff on after their deaths. They are still on the books.` },
  'set.gravewarden': { blurb: `Four hundred nights on the palisade at Stairhead, and not one thing came over it.` },
  'set.frostwrought': { blurb: `Forged in the Archive, where the forge itself had to be kept warm.` },
  'set.stormbound': { blurb: `Five conductors in a ring, cast from the Spire's lightning. Whatever stands inside the ring does not stay standing.` },
  'set.venomthread': { blurb: `Not woven. Drawn. The weaver is still in the Warrens, under the floor.` },
  'set.ironvow': { blurb: `The vow was short: nothing gets through. It has been kept.` },
  'set.ashwalker': { blurb: `He walked out of the Cinderfields after nine years. Nothing followed him out. That was the worrying part.` },
  'set.gilded': { blurb: `An agreement between four thieves, none of whom trusted the other three.` },
  'set.nightfall': { blurb: `Five people met once, at dusk, and agreed on something. Nobody knows what.` },
  'set.sunderedsky': { blurb: `Gathered from six disasters, each survived by exactly one person.` },
  'set.lastlegion': { blurb: `The last company of the Works held a gate for six days. This is the sixth day.` },
  'set.hollowking': { blurb: `A crown, a hand, a heel and a heart. The king himself is not included.` },
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
