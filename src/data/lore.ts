/**
 * SLAY — the writing layer.
 *
 * Everything in this file is text: biome descriptions, bestiary entries, boss
 * introductions, item flavour, town dialogue, epitaphs and loading fragments.
 * No gameplay logic lives here. Systems pull strings out; nothing pulls
 * gameplay state in.
 *
 * House style, so additions stay of a piece:
 *   - Restraint over volume. One good image beats three.
 *   - Concrete nouns. Bone, salt, iron, rain. Avoid "ancient evil".
 *   - The world does not care about you. It was here first and is busy.
 *   - Nobody in this world knows they are in a fantasy novel.
 *
 * All prose is written with backticks so apostrophes need no escaping.
 */

import type {
  BiomeId,
  ItemCategory,
  ItemRarity,
  MonsterFamily,
  MonsterRank,
  CharClassId,
  Rng,
} from '../types';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Deterministic pick with a graceful fallback for empty pools. */
export function pickLine(pool: readonly string[], rng: Rng, fallback = ''): string {
  if (pool.length === 0) return fallback;
  return rng.pick(pool);
}

/** Substitutes {key} tokens. Unknown tokens are left in place, visibly. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const v = vars[key];
    return v === undefined ? whole : String(v);
  });
}

// ---------------------------------------------------------------------------
// Biomes
// ---------------------------------------------------------------------------

export interface BiomeLore {
  /** Shown under the biome name on the depth card. */
  subtitle: string;
  /** Two or three sentences. Read once, on first entry to the biome. */
  description: string;
  /** Short lines the game may surface as ambient whispers while exploring. */
  ambient: string[];
  /** Shown when the player descends into this biome for the first time. */
  firstEntry: string;
  /** Shown when the biome is reached at high depth — the same place, worse. */
  deepEntry: string;
  /** One line for the map screen header. */
  mapNote: string;
}

export const BIOME_LORE: Record<BiomeId, BiomeLore> = {
  crypt: {
    subtitle: `The Ossuary Tiers`,
    description: `The first city buried its dead in tiers, each generation laying floor over floor until the graveyard had storeys and stairwells and, eventually, districts. The living moved out. The arrangement suited everyone.`,
    ambient: [
      `Something turns over in a niche and settles again.`,
      `The dust here is not dust.`,
      `A name has been scratched off the wall. Only the scratching remains.`,
      `Two hundred skulls face the same direction. You are walking the way they look.`,
      `Grave-oil still burns in a lamp nobody has filled in nine hundred years.`,
      `The mortar between these stones was mixed with ash and something finer.`,
    ],
    firstEntry: `Cold air comes up the stair to meet you, carrying the smell of old stone and older linen.`,
    deepEntry: `The tiers go on past counting now. Whoever kept the ledgers gave up long before the dead did.`,
    mapNote: `Bone-shelved corridors. The floor plan is a family tree.`,
  },
  caverns: {
    subtitle: `The Root Deeps`,
    description: `Below the masonry the rock takes over. Water cut these halls a long time before anyone thought to bury anything, and it is still cutting, patiently, without an opinion on the matter.`,
    ambient: [
      `Water finds a way down. So did you.`,
      `A stalactite drips onto the same spot it has hit for ten thousand years.`,
      `Something large moved through here recently. The mud remembers.`,
      `Pale roots hang through the ceiling from trees that died on the surface.`,
      `Your footfall comes back to you from four directions.`,
      `The air tastes of iron and wet limestone.`,
    ],
    firstEntry: `The worked stone gives out mid-corridor, as if the masons simply stopped and walked away. Beyond it, the rock does as it pleases.`,
    deepEntry: `There is no masonry to give out down here. There never was any. The dark is original.`,
    mapNote: `No architect. No plan. No mercy for the tidy-minded.`,
  },
  foundry: {
    subtitle: `The Cindergate Works`,
    description: `They built the foundry to arm a war that ended without telling it. The bellows still breathe. The moulds still fill. Somewhere down the line a hammer is still shaping something nobody ordered.`,
    ambient: [
      `A bell rings the shift change. Nobody comes.`,
      `The floor is warm. It should not be warm.`,
      `A tally-board counts up in a hand that never stops.`,
      `Slag cools in a channel, ticking as it goes.`,
      `Something down the line is being made. It is not finished.`,
      `The order book is open to a page dated after the war.`,
    ],
    firstEntry: `Heat rolls up the shaft in a slow wave, and with it the sound of machinery keeping its appointments.`,
    deepEntry: `The Works have expanded. The new galleries are not on any plan, and their tools are sized for hands you have not seen yet.`,
    mapNote: `Rails, crucibles, chain hoists. Everything still running.`,
  },
  sunkenTemple: {
    subtitle: `The Drowned Sanctum`,
    description: `The temple was built to be flooded. The priests considered water an improvement — it made the god harder to look at, and easier to hear. They were right about both.`,
    ambient: [
      `The water is warmer than the air, which is wrong.`,
      `Prayer-bells ring underwater, slow and off-time.`,
      `The mosaic shows a congregation kneeling into the tide.`,
      `Something surfaces behind you and does not break the water.`,
      `Every doorway is set below the waterline. Deliberately.`,
      `The offering bowls are full. They should not still be full.`,
    ],
    firstEntry: `The stair descends into standing water, and the water is very still, and it has been waiting.`,
    deepEntry: `The flood has depth to it here. There are storeys below the surface, lit from beneath, and they are attended.`,
    mapNote: `Half the floor plan is underwater. The useful half.`,
  },
  hive: {
    subtitle: `The Chitin Warrens`,
    description: `Something dug into the foundations and improved them. The tunnels are perfectly circular, perfectly smooth, and warm as a held hand. The architecture is not for you and does not accommodate you.`,
    ambient: [
      `The walls flex, very slightly, in time with something.`,
      `A dry rattle passes overhead and moves on.`,
      `Egg-cases line the ceiling in tidy rows. Tidiness is the frightening part.`,
      `The resin underfoot is fresh. It was laid tonight.`,
      `Every tunnel is exactly wide enough. For them.`,
      `Somewhere ahead, thousands of small mouths are working.`,
    ],
    firstEntry: `The corridor narrows, softens, and becomes a throat.`,
    deepEntry: `You have gone deep enough to reach the brood chambers. The hum here is not sound. It is agreement.`,
    mapNote: `Circular bores, resin galleries, nurseries. Do not linger in the nurseries.`,
  },
  frostvault: {
    subtitle: `The Rime Archive`,
    description: `Someone froze this place on purpose, and stacked what they wanted preserved along the galleries, and locked the door from the inside. The cold has kept its half of the bargain for a very long time.`,
    ambient: [
      `Your breath hangs where you left it.`,
      `Something is standing in the ice, facing out, waiting for a thaw.`,
      `The frost on the wall has grown into words. They are in no language you want to learn.`,
      `The cold here is not weather. It is policy.`,
      `Ice groans, settles, and holds.`,
      `A lantern is frozen mid-fall, still lit.`,
    ],
    firstEntry: `The cold takes the sweat off you in the first three steps and starts on the rest.`,
    deepEntry: `This far down the ice has stopped being water. It does not melt. It considers.`,
    mapNote: `Frozen galleries. Everything preserved, including the reasons.`,
  },
  ashwaste: {
    subtitle: `The Cinderfields`,
    description: `A country burned down here and then kept burning, quietly, without fuel, for longer than the country existed. The ash lies deep enough to walk on. Occasionally it lies deep enough to walk in.`,
    ambient: [
      `Ash falls upward for a moment, then thinks better of it.`,
      `A doorframe stands with no house behind it.`,
      `The wind carries heat but no smoke.`,
      `Footprints cross yours. They are going down too.`,
      `Something under the ash shifts to follow.`,
      `The ground here is warm all the way through.`,
    ],
    firstEntry: `The ceiling opens out into a grey sky that is not a sky, and grey weather falls out of it.`,
    deepEntry: `The fires that made this place are close now. You can feel them through your boots, taking an interest.`,
    mapNote: `Open ground. Very little cover. Everything sees you.`,
  },
  voidspire: {
    subtitle: `The Hollow Spire`,
    description: `A tower was driven down into the world like a nail, from the outside, by something with the reach to do it. Inside, the stairs go up and arrive lower. Nobody has satisfactorily explained this and the ones who tried are part of the wall now.`,
    ambient: [
      `The stair goes up. You are descending.`,
      `Your shadow arrives a moment before you do.`,
      `There is a door here that opens onto the same room.`,
      `Something is counting. It has reached a number with no name.`,
      `The geometry apologises and continues.`,
      `You have been here before. You have not been here before. Both are records.`,
    ],
    firstEntry: `The dark ahead has an edge to it, like a page, and past the edge the rules are different.`,
    deepEntry: `The Spire has stopped pretending. There is no floor, only the agreement that you are standing.`,
    mapNote: `Distances are advisory. Trust the walls, not the map.`,
  },
};

// ---------------------------------------------------------------------------
// Bestiary
// ---------------------------------------------------------------------------

export interface BestiaryEntry {
  /** Display name override — usually left undefined; MonsterDef.name wins. */
  name?: string;
  /** Two or three sentences of field-notes prose. */
  entry: string;
  /** One-line tactical hint shown under the entry. */
  hint?: string;
}

/**
 * Keyed by MonsterDef.id. The monster roster is owned by another module, so
 * this table is intentionally partial — `bestiaryEntry` composes a decent
 * fallback from family prose when an id is missing, and the game never shows
 * a blank page.
 */
export const BESTIARY: Record<string, BestiaryEntry> = {
  // --- undead -------------------------------------------------------------
  shambler: {
    entry: `The commonest thing down here, and the least interesting, which is exactly how it kills people. A shambler has no plan. It has arrival.`,
    hint: `Slow. Never alone.`,
  },
  ghoul: {
    entry: `Ghouls were people who ate what was available in a bad year. The change is gradual and, by every account we have, not unpleasant from the inside.`,
    hint: `Fast on open ground. Will break off to feed.`,
  },
  boneStalker: {
    entry: `A skeleton assembled with care by somebody who understood joints better than they understood mercy. The extra ribs are not decorative.`,
    hint: `Blunt weapons. Edges skate off.`,
  },
  gravewright: {
    entry: `Interred with tools, so it kept working. It still repairs the tombs. It still objects to visitors, in the tradesman way: firmly, and with the correct implement.`,
    hint: `Strikes hardest at the second swing.`,
  },
  wight: {
    entry: `A wight remembers being important. The armour is real, the title is not, and the anger is entirely justified by its own account.`,
    hint: `Drains. Do not trade blows.`,
  },
  cryptWarden: {
    entry: `Sworn to hold a door. The door has been rubble for six centuries. The oath did not include a clause for that.`,
    hint: `Holds ground. Will not chase far.`,
  },
  boneChoir: {
    entry: `Six skulls on a rack, singing a funeral in six parts. Break the rack and the parts continue, badly, which is worse.`,
    hint: `Silence it before the third verse.`,
  },
  // --- demon --------------------------------------------------------------
  imp: {
    entry: `Small, spiteful, and contractually obligated to be somewhere else in nine minutes. Most imps you meet are running an errand and resent you for the delay.`,
    hint: `Kill it before it finishes talking.`,
  },
  hellhound: {
    entry: `Bred for the hunt, on the assumption that the hunt would never end. It has not. The dogs have adapted better than their masters.`,
    hint: `Comes in threes. Never from the front.`,
  },
  bloodfiend: {
    entry: `It does not need to eat. It has simply decided the arrangement is agreeable and has no reason to revisit the decision.`,
    hint: `Heals from what it takes. End it fast.`,
  },
  brimstoneOgre: {
    entry: `Nine feet of grievance with a rock in each hand. Slow-witted, but it only needs one good idea, and it has had that idea already.`,
    hint: `Sidestep the wind-up. There is always a wind-up.`,
  },
  soulbinder: {
    entry: `Keeps a ledger of debts nobody signed for. It is exceptionally good at its job, and its job is collection.`,
    hint: `Kill the summoner, not the summons.`,
  },
  // --- beast --------------------------------------------------------------
  direRat: {
    entry: `Down here rats grow to the size of dogs, because there is a great deal to eat and no reason to stop.`,
    hint: `Individually trivial. Never individual.`,
  },
  caveBear: {
    entry: `It came down for the winter, found the winter never ended, and made adjustments. Its eyes are gone. It has not needed them for generations.`,
    hint: `Hunts by sound. Stand still and it will pass.`,
  },
  gloomStalker: {
    entry: `A cat, more or less, with the parts that made it a cat exchanged for parts that made it patient.`,
    hint: `It is already behind you. Turn early.`,
  },
  rotBoar: {
    entry: `Fattened on the crypt tiers and unkillable by any measure the surface would recognise. It has been dead for years and has not let that slow it.`,
    hint: `Charges in straight lines. Use corners.`,
  },
  // --- construct ----------------------------------------------------------
  ironSentry: {
    entry: `Standing orders, no garrison, no relief. It has been holding this corridor since the fall and it has not been relieved because there is nobody left to relieve it.`,
    hint: `Armoured. Find the seam at the neck.`,
  },
  forgeAutomaton: {
    entry: `Built to move ingots. Reassigned, at some point, to move anything that came through the door. The reassignment was not written down.`,
    hint: `Overheats. Outlast the second cycle.`,
  },
  clockwarden: {
    entry: `It keeps time in a place where time has stopped mattering, and it is very insistent about the schedule.`,
    hint: `Attacks on a fixed rhythm. Count it.`,
  },
  // --- insect -------------------------------------------------------------
  chitinDrone: {
    entry: `A worker. It does not fight so much as remove an obstruction, and it does not distinguish between rubble and you.`,
    hint: `Harmless alone. They are never alone.`,
  },
  brood: {
    entry: `Every hive keeps a few. They are the reason the hive has never been cleared, only postponed.`,
    hint: `Kill the egg-sacs first or the fight has no end.`,
  },
  spinneret: {
    entry: `It builds the galleries and it maintains the galleries and it considers you material.`,
    hint: `Do not fight it in a web. Nothing does.`,
  },
  // --- aberration ---------------------------------------------------------
  gazer: {
    entry: `An eye, unhoused, that has spent a long time learning what looking can be made to do.`,
    hint: `Break line of sight and it forgets you exist.`,
  },
  fleshknot: {
    entry: `Several people, at one point. The arrangement is stable and appears to be voluntary, which is the part that keeps scholars awake.`,
    hint: `Kill it in one place or it kills you in several.`,
  },
  voidTouched: {
    entry: `It went into the Spire whole and came out with additions. It does not regard this as a loss.`,
    hint: `Its position is a suggestion. Aim early.`,
  },
  // --- elemental ----------------------------------------------------------
  cinderling: {
    entry: `A fire that got as far as intent and then stopped developing. Simple wants, thoroughly pursued.`,
    hint: `Water tiles. Use them.`,
  },
  rimewraith: {
    entry: `The cold in the Archive has opinions, and this is what an opinion looks like when it has been left alone for nine hundred years.`,
    hint: `Slows you before it hits you. Move first.`,
  },
  stormcore: {
    entry: `A charge with nowhere to earth. Everything it touches becomes, briefly, the ground.`,
    hint: `Never fight it in standing water.`,
  },
  // --- humanoid -----------------------------------------------------------
  delverCorpse: {
    entry: `Came down for the same reasons you did, with better gear and a larger party. His gear is still here.`,
    hint: `He has learned your habits. He had them.`,
  },
  cultist: {
    entry: `They found something down here worth kneeling to, and they were not wrong, which is the trouble.`,
    hint: `They fight worse in the light. Take the torches.`,
  },
  ashRaider: {
    entry: `Surface stock, driven down by whatever took the surface. Hungry, organised, and no longer particular.`,
    hint: `They will parley. They will not honour it.`,
  },
  // --- plant --------------------------------------------------------------
  gravebloom: {
    entry: `Grows only where a body was left uncovered. There are, accordingly, meadows.`,
    hint: `Do not stand in the pollen.`,
  },
  stranglevine: {
    entry: `A slow hunter with a long memory for footfalls. It gets a season to plan each kill and it uses the season.`,
    hint: `Cut the anchor, not the coil.`,
  },
  // --- ooze ---------------------------------------------------------------
  gelid: {
    entry: `It moves at the pace of an argument and wins by attrition. Everything it has ever caught is still in it, in order.`,
    hint: `Splits. Fight it in a corridor.`,
  },
  bileMass: {
    entry: `The foundry drains had to go somewhere and this is where. It has been concentrating ever since.`,
    hint: `Ranged. Its floor is not your floor.`,
  },
};

/** Field-note fallbacks, one pool per family. Used when an id is unknown. */
export const FAMILY_LORE: Record<MonsterFamily, string[]> = {
  undead: [
    `Death down here is a change of employment, not an ending. The terms are poor and the hours are long.`,
    `It remembers a name and nothing else, and it will not be told the name is no longer in use.`,
    `Whatever animates it is not soul and not machinery. It is closer to habit.`,
  ],
  demon: [
    `It was summoned for a purpose, discharged that purpose, and was never dismissed. The paperwork was lost with the man who filed it.`,
    `Cruelty in these things is not appetite. It is craft, practised daily, with pride.`,
    `It bargains. Everything it offers is true and none of it is good for you.`,
  ],
  beast: [
    `No malice in it at all, which helps nobody. It is hungry and you are the shape of food.`,
    `Generations underground have taken the eyes, the colour and the caution. What is left is efficient.`,
    `It hunts the way water runs downhill — not deciding, just going.`,
  ],
  construct: [
    `Given an instruction once and never given another. It has not stopped and cannot be argued with, only unmade.`,
    `Its maker is dust. Its orders are not.`,
    `There is no hate in the thing. That has never once made it easier to survive.`,
  ],
  insect: [
    `Individually it is nothing. That is not the unit it comes in.`,
    `It has a role in the hive and it will die performing that role rather than deviate, which makes it predictable and does not make it safe.`,
    `The hive does not fight you. It processes you.`,
  ],
  aberration: [
    `Something in the deep alters what stays too long. This stayed.`,
    `The wrongness is not in the shape but in the confidence with which the shape holds.`,
    `It was made by a mistake, and it has spent a long time becoming good at being one.`,
  ],
  elemental: [
    `Fire and cold and charge, given enough time and enough dark, learn to want things.`,
    `It is a process wearing the costume of a creature.`,
    `Killing it does not destroy it. It disperses it. There is a difference and the difference is temporary.`,
  ],
  humanoid: [
    `Came down for gold or god or the reason people always come down, and stayed for the same reason everyone stays.`,
    `The dangerous thing about a man in the dark is that he can plan and is not sorry.`,
    `It carries the gear of five other people, all of which fit.`,
  ],
  plant: [
    `It grows where corpses were and its patience is measured in seasons.`,
    `No sap in it. Something else runs the length of the stem.`,
    `It has all the time in the world and needs you to be tired only once.`,
  ],
  ooze: [
    `A digestion with ambitions.`,
    `It does not chase. It arrives, eventually, in the doorway you were going to use.`,
    `Whatever it has taken is still legible inside it, which is how we identify the missing.`,
  ],
};

/** Bestiary line for any monster, with a family fallback for unknown ids. */
export function bestiaryEntry(monsterId: string, family: MonsterFamily, rng: Rng): BestiaryEntry {
  const known = BESTIARY[monsterId];
  if (known) return known;
  return { entry: pickLine(FAMILY_LORE[family], rng, FAMILY_LORE.undead[0]!) };
}

/** Short nameplate flavour for elites and rares. */
export const RANK_EPITHETS: Record<MonsterRank, string[]> = {
  normal: [``],
  champion: [`the Stubborn`, `the Scarred`, `Firstblood`, `the Unbroken`, `the Heavy`, `Gravemouth`],
  elite: [
    `the Long Patience`,
    `Nine Winters`,
    `the Tally-Keeper`,
    `Salt-in-the-Wound`,
    `the Quiet Half`,
    `Thricebound`,
    `the Uninvited`,
  ],
  rare: [
    `Who Counts the Doors`,
    `Last of the Third Watch`,
    `the Debt Unpaid`,
    `Whose Name Was Struck`,
    `the Answered Prayer`,
    `Keeper of the Wrong Key`,
  ],
  boss: [``],
};

// ---------------------------------------------------------------------------
// Bosses
// ---------------------------------------------------------------------------

export interface BossLore {
  /** Shown on the sealed gate before the fight. */
  intro: string;
  /** Optional per-phase barks, in phase order. */
  barks?: string[];
  /** Shown over the corpse. */
  defeat: string;
  /** Shown on the death screen if this boss killed you. */
  taunt?: string;
}

/**
 * Keyed by BossDef.id. Partial by design — `bossIntro` falls back to the
 * BossDef's own intro string, and then to a family-flavoured generic.
 */
export const BOSS_LORE: Record<string, BossLore> = {
  gravebishop: {
    intro: `He was buried in the vestments of an office that had already been abolished. Nobody told him. He has been performing the rite ever since, and the congregation has grown.`,
    barks: [
      `You are late for the service.`,
      `Kneel, or be knelt. The liturgy allows both.`,
      `The collection is taken from everyone.`,
    ],
    defeat: `The vestments settle. Somewhere below, a congregation waits for a sermon that will not come, and begins, patiently, to compose its own.`,
    taunt: `He gave you the whole rite. You could at least have stayed for the end of it.`,
  },
  thresherQueen: {
    intro: `Every tunnel in the warren was cut to bring things to her. You have been walking her digestive tract for an hour.`,
    barks: [`The brood is hungry.`, `You are late material.`, `We were many. We are more.`],
    defeat: `The hum stops. Every tunnel in the warren goes quiet at once, which is how you learn how many of them there were.`,
    taunt: `You went into the throat and were surprised by the stomach.`,
  },
  slagKing: {
    intro: `The Works needed a foreman after the fall and made one out of what was on hand: the last shift, the pour that killed them, and the order book.`,
    barks: [`Back to your station.`, `The quota does not care.`, `Everything here is raw material. Everything.`],
    defeat: `The line stops. For the first time since the war, the Cindergate Works are silent, and the silence is much worse than the noise was.`,
    taunt: `Filed under waste. The Works do not keep a separate ledger for people.`,
  },
  drownedOracle: {
    intro: `She has been face-down in six inches of water for four hundred years, answering questions nobody asked, correctly.`,
    barks: [`I said you would come.`, `I said this part too.`, `And now the part I did not say aloud.`],
    defeat: `The water goes still. The last thing she says is your name, pronounced the way your mother said it, which is not information she should have had.`,
    taunt: `She told you how this ended. You were busy.`,
  },
  rimeConservator: {
    intro: `It froze the Archive to preserve what was inside. It has since revised its definition of inside, several times, always outward.`,
    barks: [`Hold still. You will keep better.`, `Catalogued.`, `Nothing is lost. Everything is stored.`],
    defeat: `The frost withdraws a single pace, then stops. Not defeat, exactly. A revised estimate.`,
    taunt: `Accessioned, shelved, and given a number. You are safe now, in the way stored things are safe.`,
  },
  ashheraldn: {
    intro: `It walks ahead of a fire that has not been lit yet, announcing it, so that the fire will find things ready.`,
    barks: [`I go before.`, `Be ready. It is coming regardless.`, `Now the fire.`],
    defeat: `The herald falls, and behind it, very far off, something that was following the announcement stops and turns around.`,
    taunt: `You were told it was coming. That was the entire job of the thing that killed you.`,
  },
  hollowArchitect: {
    intro: `It drove the Spire into the world from outside and has been down here ever since, taking measurements, apparently for a second one.`,
    barks: [`Your position is provisional.`, `I will correct the room.`, `Hold. I am revising the floor.`],
    defeat: `The measurements stop. The Spire remains, unfinished and unexplained, and somewhere above you a door that was never there closes.`,
    taunt: `The room was wrong and you were in it. Nothing personal — a survey error.`,
  },
  marrowSovereign: {
    intro: `The crypt tiers elected a king the only way the dead can: by settling. He is what all of them, pressed together long enough, agreed to become.`,
    barks: [`We are of one mind. Join it.`, `Every bone here voted.`, `The census is not closed.`],
    defeat: `The consensus breaks. Ten thousand small collapses run away down the tiers like applause.`,
    taunt: `A unanimous decision. You were the only vote against.`,
  },
};

const GENERIC_BOSS_INTRO: string[] = [
  `It has held this room a very long time and has never once been asked to leave.`,
  `Whatever it was before, this is what the depth made of it, and the depth was thorough.`,
  `It does not announce itself. It has no reason to. Nothing that has come this far has needed telling.`,
  `The door seals behind you. This is not a trap — it is simply how the room has always worked.`,
];

export function bossIntro(bossId: string, fallback: string, rng: Rng): string {
  const lore = BOSS_LORE[bossId];
  if (lore) return lore.intro;
  if (fallback) return fallback;
  return pickLine(GENERIC_BOSS_INTRO, rng, GENERIC_BOSS_INTRO[0]!);
}

export function bossDefeat(bossId: string, rng: Rng): string {
  const lore = BOSS_LORE[bossId];
  if (lore) return lore.defeat;
  return pickLine(
    [
      `It stops. That is the whole of it — no last words, no collapse of the architecture. It simply stops holding the room.`,
      `The weight goes out of the air. Whatever was standing here has finished.`,
      `Something further down notices the vacancy.`,
    ],
    rng,
    `It stops.`,
  );
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** Rarity-tier voice: normal is mute, ancient is a paragraph with a grudge. */
export const RARITY_FLAVOR: Record<ItemRarity, string[]> = {
  normal: [
    `Serviceable. Nobody wrote a song about it.`,
    `Made to a price, and the price was met.`,
    `Issue kit. It has outlived the man it was issued to.`,
  ],
  magic: [
    `A single small enchantment, done well and cheaply.`,
    `Warm to the touch, for no reason the smith would admit to.`,
    `Hedge-work. Effective, unlicensed, still holding.`,
  ],
  rare: [
    `The maker signed the underside where nobody would look.`,
    `Three enchantments, layered by three different hands, none of whom got on.`,
    `Commissioned for a war that was called off. It never learned that.`,
  ],
  set: [
    `Part of a matched suite. The rest is down here somewhere, on somebody.`,
    `It fits with its fellows the way an argument fits with a grudge.`,
    `Made as a set, buried as a set, scattered by looters with no eye for a collection.`,
  ],
  unique: [
    `There was one. There is still one. This is it.`,
    `Named by the people it was used on, which is the only naming that sticks.`,
    `It has a history and does not intend to be the last chapter of it.`,
  ],
  mythic: [
    `Older than the language on it. The language is not the original inscription.`,
    `It was not made. It was found already finished, and improved since.`,
    `Handle it as a loan. Everything that has held it has held it briefly.`,
  ],
  ancient: [
    `It predates the crypt, the city and the reason for the city. It has been patient about this.`,
    `Somewhere in it is the original intention, unchanged, still working.`,
    `Every owner of this has been the second-to-last owner of it.`,
  ],
};

/** Category voice — the object's own character, independent of its power. */
export const CATEGORY_FLAVOR: Partial<Record<ItemCategory, string[]>> = {
  sword: [`Balanced a finger behind the guard, the way a duellist likes it.`, `The edge takes a shine it has not earned.`],
  axe: [`Head-heavy on purpose. Let it fall and get out of its way.`, `Splits shields, hafts and arguments.`],
  mace: [`No edge to dull, no point to bend. It solves armour by ignoring it.`, `Honest work, done heavily.`],
  dagger: [`Short enough to be a conversation. Sharp enough to end one.`, `The kind of thing worn where a hand naturally rests.`],
  spear: [`The oldest good idea anybody has had.`, `Range is a virtue nobody appreciates until the reach is gone.`],
  bow: [`The draw is stiff and stays stiff. It was made for a stronger year.`, `Silent, and disliked for it.`],
  crossbow: [`No skill required, which is precisely the complaint.`, `Slow, certain, unimpressed by armour.`],
  wand: [`Small work, precisely aimed. The point is efficiency, not spectacle.`, `Bone core. Not the maker's own.`],
  staff: [`Long enough to lean on and stout enough to end an argument with.`, `The carvings run to the top and then continue somewhere else.`],
  scepter: [`An instrument of office, sharpened by someone practical.`, `Authority as a physical object.`],
  shield: [`Scored all over the face and nowhere on the rim. Whoever held it knew the job.`, `Heavier than it looks. That is the feature.`],
  orb: [`It has a weather inside it and the weather has moods.`, `Cold at the centre, always.`],
  quiver: [`Waxed leather, forty loops, thirty-one occupied.`, `The stitching was repaired in the field, badly, and held.`],
  helm: [`The dent above the left brow was survived. Once.`, `Narrows the world to what matters.`],
  chest: [`Fitted to somebody with a longer reach than yours.`, `Repaired more often than it was cleaned.`],
  gloves: [`Worn smooth at the palm, stiff at the knuckle.`, `Good grip. That is most of a fight.`],
  boots: [`Somebody walked a very long way in these and did not arrive.`, `Silent on stone. That was paid for.`],
  belt: [`Four notches, all of them used, in order, downward.`, `Holds everything a bad hour requires.`],
  amulet: [`Worn under the shirt where the wearer could feel it, which was the point.`, `The chain is newer than the pendant by centuries.`],
  ring: [`Sized for a hand that is not down here any more.`, `Turned inward, so the stone faces the palm. That is a habit with a reason.`],
  charm: [`Superstition, cast in metal, that turned out to be correct.`, `Kept in a pocket, touched often, never discussed.`],
  gem: [`Cut along a fault that should not have held. It held.`, `Colder than the room by a fixed amount.`],
  rune: [`One idea, carved, repeating.`, `The stroke order matters. Nobody remembers the stroke order.`],
  potion: [`Bitter, hot, and effective in that order.`, `Corked with wax and somebody's initials.`],
  material: [`Worth nothing alone. That is what the smith is for.`, `Raw, and stubbornly so.`],
};

export function itemFlavor(category: ItemCategory, rarity: ItemRarity, rng: Rng): string {
  const rare = rarity !== 'normal' && rarity !== 'magic';
  const pool = rare
    ? RARITY_FLAVOR[rarity]
    : (CATEGORY_FLAVOR[category] ?? RARITY_FLAVOR[rarity]);
  return pickLine(pool, rng, ``);
}

/** Longer inscriptions for uniques and set pieces. Pull one per item uid. */
export const RELIC_INSCRIPTIONS: string[] = [
  `TO HOLD IS TO BE HELD.`,
  `MADE IN THE SECOND WINTER, FOR THE THIRD.`,
  `I WAS NOT LOST. I WAS PUT DOWN.`,
  `THE DEBT FOLLOWS THE BLADE.`,
  `IF YOU ARE READING THIS THE OWNER IS BELOW YOU.`,
  `FORGED AGAINST THE ADVICE OF EVERY MAN PRESENT.`,
  `LET IT NOT BE SAID WE DID NOTHING.`,
  `SEVEN CARRIED ME. ONE OF THEM SLEPT.`,
  `NOT FOR THE HAND. FOR THE HOUR.`,
  `THE FIRE WAS ASKED FOR.`,
  `RETURN TO THE VAULT BEFORE THE THAW.`,
  `I AM THE ANSWER. YOU HAVE MISREMEMBERED THE QUESTION.`,
];

// ---------------------------------------------------------------------------
// Town
// ---------------------------------------------------------------------------

export type TownNpcId =
  | 'quartermaster'
  | 'blacksmith'
  | 'apothecary'
  | 'banker'
  | 'gravekeeper'
  | 'oracle'
  | 'drunk'
  | 'child'
  | 'captain';

export interface TownNpc {
  id: TownNpcId;
  name: string;
  role: string;
  /** One-paragraph description for the interaction panel. */
  portraitNote: string;
  greeting: string[];
  idle: string[];
  /** Said on a successful transaction. */
  onTrade?: string[];
  /** Said when the player leaves for the dungeon. */
  onDepart?: string[];
  /** Said when the player returns from a deep run. */
  onReturn?: string[];
  /** Said when a character has died and a new one arrives. */
  onFallen?: string[];
}

export const TOWN_NPCS: Record<TownNpcId, TownNpc> = {
  quartermaster: {
    id: 'quartermaster',
    name: `Hesk`,
    role: `Quartermaster`,
    portraitNote: `A small, exact woman who has outlasted eleven expeditions by never joining one. Her ledger goes back further than the town does and she has never been caught out in it.`,
    greeting: [
      `You are alive. Good. That affects the pricing.`,
      `Back already. Show me what you brought and I will tell you what it is worth, which is less than you think.`,
      `I have what you need. You will not like the number.`,
    ],
    idle: [
      `Everything down there was up here once. Remember that when you are pricing a find.`,
      `Two rules. Do not buy on credit, and do not name your weapon.`,
      `I stock rope. Nobody buys rope. Everybody, at some point, wants rope.`,
      `The dead are terrible customers but excellent suppliers.`,
    ],
    onTrade: [`Done. Try to keep it longer than the last one.`, `Sold. No refunds, and no resurrections.`],
    onDepart: [`Come back with something heavy.`, `Mind the stairs. They are the only part that is honest.`],
    onReturn: [`Deeper than last time. That will show up in your face within the year.`],
    onFallen: [`Another name for the wall. Sit down. Eat something. Then we will talk about gear.`],
  },
  blacksmith: {
    id: 'blacksmith',
    name: `Ordrun Kale`,
    role: `Smith`,
    portraitNote: `Enormous, deliberate, and burned white up both forearms from an accident he will not discuss. He works to the standard of a place that no longer exists.`,
    greeting: [
      `Put it on the bench. I will tell you if it can be saved.`,
      `Steel first. Talk after.`,
      `You have been swinging that off the wrist again. It shows.`,
    ],
    idle: [
      `Everything breaks. The trick is choosing where.`,
      `I have reforged the same sword nine times for six different men. It is still the sword. They were not still the men.`,
      `Good iron is patient. Be more like the iron.`,
      `They made better metal below than we do above. That is not a compliment to them.`,
    ],
    onTrade: [`It will hold. Do not test that carelessly.`, `Better. Not good. Better.`],
    onDepart: [`Take the edge off nothing but them.`],
    onReturn: [`You brought it back. Both of you, more or less intact.`],
    onFallen: [`I will keep his gear on the rack a month. Then it goes to the next one. That is how it works.`],
  },
  apothecary: {
    id: 'apothecary',
    name: `Sister Vell`,
    role: `Apothecary`,
    portraitNote: `Left an order that has since been dissolved, and kept the habit, the pharmacopoeia and a great deal of unfinished business. Her hands are steady in a way that takes practice.`,
    greeting: [
      `Sit. Show me. Do not tell me it is nothing.`,
      `You are bleeding into your own boot. Sit down.`,
      `I have three tinctures, two of which are honest.`,
    ],
    idle: [
      `Pain is information. Numbing it is a decision, not a cure.`,
      `The moulds down there are more use than anything that grows in daylight. That should trouble you.`,
      `I have brought back four people this year. I have failed with nineteen. The four asked for help early.`,
      `Drink it slowly. Everyone drinks it fast and then complains about the taste twice.`,
    ],
    onTrade: [`Ration it. The dark is longer than the bottle.`],
    onDepart: [`Come back damaged rather than not at all.`],
    onReturn: [`Still whole. I will note it in the good column. It is a short column.`],
    onFallen: [`I sat with him at the end. He was not afraid. That is worth something and I have never worked out how much.`],
  },
  banker: {
    id: 'banker',
    name: `Corvane`,
    role: `Vaultkeeper`,
    portraitNote: `Runs the only vault the depths have never reached, which he attributes to good masonry and everyone else attributes to something he keeps in the lower room.`,
    greeting: [
      `Deposits down, withdrawals across. Try to keep them in that order.`,
      `The vault holds. It always holds. Ask me again next year.`,
      `Yours is where you left it. Nothing here moves on its own.`,
    ],
    idle: [
      `Gold is only heavy on the way up.`,
      `I have held the estates of two hundred delvers. Nine came back for them.`,
      `The vault is dry, cold and boring. Those are the three virtues.`,
      `Do not ask what is in the lower room.`,
    ],
    onDepart: [`Your estate is in order. Statistically, that was the useful part of today.`],
    onFallen: [`His holdings pass to you, per the standing arrangement. Sign here. Everyone signs here eventually.`],
  },
  gravekeeper: {
    id: 'gravekeeper',
    name: `Old Marrow`,
    role: `Gravekeeper`,
    portraitNote: `Digs the graves that stay empty, since bodies rarely come back up. He maintains the memorial wall himself and has strong views about the lettering.`,
    greeting: [
      `Another one going down. I will get the chisel warm.`,
      `Do not take that as pessimism. I dig for everyone.`,
      `Come and see the wall. Everybody should know the wall before they go.`,
    ],
    idle: [
      `Names should be cut deep. Shallow letters wear off and then who were they.`,
      `I have never once been down there. I have met everything that lives down there. It comes to me eventually.`,
      `The wall has four hundred and six names. The town has two hundred people.`,
      `Grief is a job like any other. Somebody has to keep the tools.`,
    ],
    onDepart: [`Go on then. I will not wish you luck. It has never helped.`],
    onReturn: [`Not today, then. Good. I hate the chisel.`],
    onFallen: [`I have cut it. Come and read it when you can stand to.`],
  },
  oracle: {
    id: 'oracle',
    name: `The Listener`,
    role: `Oracle`,
    portraitNote: `Sits with her back to the stair and her ear to the floor. She does not predict. She reports what the depth is doing, which people find harder to hear.`,
    greeting: [
      `It is awake tonight. Not agitated. Awake.`,
      `Something changed on the sixth tier. I would not go straight down.`,
      `You are louder than you were. It has started to know your step.`,
    ],
    idle: [
      `I do not see the future. I hear the present from further away than you do.`,
      `The deep is not evil. It is occupied, and you keep knocking.`,
      `Every so often it goes quiet. That is the part to be afraid of.`,
      `Three of you went down last month. Four sets of footsteps came back and I have not slept since.`,
    ],
    onDepart: [`It heard the door. It always hears the door.`],
    onReturn: [`You brought something up with you. Not in your pack.`],
  },
  drunk: {
    id: 'drunk',
    name: `Gilder Hain`,
    role: `Formerly of the Third Expedition`,
    portraitNote: `Came back from a depth nobody else has matched, spent the reward in a season, and has not been below ground since. He is the best-informed man in town between the second and fourth drink.`,
    greeting: [
      `You are going down. I can tell by the boots.`,
      `Buy me one and I will tell you about the foundry. Buy me two and I will stop.`,
      `Do not sit there. That is where Ferris used to sit.`,
    ],
    idle: [
      `We got to the eleventh. Eleventh. Nobody believes it and I have stopped needing them to.`,
      `The dark down there is not the absence of light. It is a substance. It has a grain.`,
      `Take a second torch. Take a third. Take more torches than you think is stupid.`,
      `I hear it in the well water. I hear it in the kettle. That is not madness, that is acoustics.`,
      `We left him because there was no getting him out. That is the whole story and it takes nine seconds to tell.`,
    ],
    onReturn: [`How deep. No — do not tell me. Tell me. No.`],
    onFallen: [`I knew that one. Bought me a drink once and did not want anything for it.`],
  },
  child: {
    id: 'child',
    name: `Peb`,
    role: `Runner`,
    portraitNote: `Carries messages, steals nothing anyone misses, and knows the town's business more thoroughly than the captain does.`,
    greeting: [
      `Is it true there is a floor made of eyes?`,
      `Bring me back a tooth. A big one.`,
      `You are the one that came back. Everyone said you would not.`,
    ],
    idle: [
      `Marrow says I am not to go near the stair. I go near the stair.`,
      `My mother went down. She is coming back. It is only that it takes a while.`,
      `I can hear the smith from anywhere in town. That is how I know it is still all right.`,
      `The lady with the ear on the floor gave me a coin to be quiet. I was quiet for ages.`,
    ],
    onDepart: [`Bye. Bye. Bye!`],
    onReturn: [`I knew it. I told them and they said hush and I knew it.`],
  },
  captain: {
    id: 'captain',
    name: `Captain Ilsa Renn`,
    role: `Watch Captain`,
    portraitNote: `Holds a wall against a thing that has never once attacked it, with eleven guards and a bell. She considers this the most important work in the world and she is probably right.`,
    greeting: [
      `You go down voluntarily. I have never understood it and I have stopped saying so.`,
      `Report anything that comes up the stair. Anything.`,
      `The bell has rung twice in my service. Both times, nothing came. Both times, something had.`,
    ],
    idle: [
      `We do not hold the stair. We watch it. There is a difference and it is the whole of my career.`,
      `Delvers bring things up in their packs that should not come up. I do not search you. I should.`,
      `Eleven guards. Two hundred souls. One door. Sleep well.`,
      `Keep your name on the roster. If you are not on the roster nobody knows to stop waiting.`,
    ],
    onDepart: [`Noted and logged. Come back and I will strike you off with pleasure.`],
    onReturn: [`Struck off the overdue list. Do not make a habit of the other column.`],
    onFallen: [`I posted the notice. It is the part of the rank nobody warns you about.`],
  },
};

export function npcLine(id: TownNpcId, kind: keyof Omit<TownNpc, 'id' | 'name' | 'role' | 'portraitNote'>, rng: Rng): string {
  const npc = TOWN_NPCS[id];
  const pool = npc[kind];
  if (!pool || pool.length === 0) return pickLine(npc.idle, rng, ``);
  return pickLine(pool, rng, ``);
}

// ---------------------------------------------------------------------------
// Class flavour
// ---------------------------------------------------------------------------

export const CLASS_LORE: Record<CharClassId, { creed: string; origin: string; selectLine: string }> = {
  warden: {
    creed: `Hold the line. There is no second line.`,
    origin: `Wardens were the door-guard of an order that has been dissolved twice and reconstituted three times. The training survived every dissolution because it was never written down — it was beaten in.`,
    selectLine: `Somebody has to stand where it comes through.`,
  },
  pyromancer: {
    creed: `Fire asks nothing and forgives less.`,
    origin: `Pyromancy is the oldest applied science and the least respectable. Every practitioner is self-taught, because the ones who took students stopped having students.`,
    selectLine: `It is not that I like the fire. It is that the fire is the honest one.`,
  },
  shadowblade: {
    creed: `Once, correctly, and be elsewhere.`,
    origin: `The guilds that trained shadowblades were not criminal enterprises but civic ones, retained by cities that preferred quiet solutions. The cities are gone. The retainer was never formally cancelled.`,
    selectLine: `You will not see the work. That is the work.`,
  },
  stormcaller: {
    creed: `The charge wants to go somewhere. Point it.`,
    origin: `Stormcalling came up from the coast, where the weather is a neighbour rather than a season. Its practitioners are famously bad at standing still and famously good at surviving.`,
    selectLine: `Everything down there is earthed. Everything.`,
  },
  revenant: {
    creed: `Nothing is wasted. Not even the dead.`,
    origin: `A revenant has died once, formally, with witnesses, and come back with a debt they did not agree to. The dead follow them out of professional courtesy and something less pleasant.`,
    selectLine: `I have been where they are. They remember the courtesy.`,
  },
};

// ---------------------------------------------------------------------------
// Death
// ---------------------------------------------------------------------------

/** Death-screen epitaphs. `{name}`, `{killer}`, `{depth}`, `{level}` tokens. */
export const EPITAPHS: string[] = [
  `{name} went down to the {depth} tier and did not come back up. This is not remarkable. It is only recent.`,
  `Killed by {killer} on the {depth} tier. The wall will say so, in letters cut deep, because Marrow does not do shallow work.`,
  `Here ends {name}, who was told to take a second torch.`,
  `{name}, level {level}, of no fixed parish. The depth keeps what it stops.`,
  `They found the pack. They did not find {name}. That is the usual order of things.`,
  `{killer} did not know your name and will not learn it. That is the insult buried inside the injury.`,
  `The stair is only forty minutes from the surface. {name} was forty minutes from the surface for four years.`,
  `You were quicker than most and it made a difference of about nine seconds.`,
  `Struck from the roster. Added to the wall. The town does both on the same afternoon.`,
  `{name} descended with a plan. The plan was sound. The tier was not interested.`,
  `Somewhere above, a bell did not ring, because nobody up there knows yet.`,
  `The last thing you did was reasonable. That has never been the requirement.`,
  `Gold recovered: none. Gear recovered: none. Lesson recovered: unclear.`,
  `{name} of the {level}th year, who went one room further.`,
  `You were owed better. The ledger down here does not carry that column.`,
  `The {depth} tier has taken four hundred and seven. It does not keep the count. We do.`,
  `Not eaten. Not taken. Simply stopped, in the dark, where it is cheapest to stop.`,
  `A good death would have required an audience. There was none. There rarely is.`,
];

export function epitaph(vars: { name: string; killer: string; depth: number; level: number }, rng: Rng): string {
  return fill(pickLine(EPITAPHS, rng, EPITAPHS[0]!), vars);
}

/** Short lines for the memorial wall in town. */
export const MEMORIAL_LINES: string[] = [
  `WENT DOWN WILLING`,
  `NOT RECOVERED`,
  `PAID IN FULL`,
  `THE THIRD WATCH`,
  `KNEW THE RISK`,
  `ONE ROOM FURTHER`,
  `HELD THE DOOR`,
  `TOOK THE STAIR ALONE`,
  `NO BODY, NO DEBT`,
  `REMEMBERED BY THE TOWN`,
];

// ---------------------------------------------------------------------------
// Loading screens
// ---------------------------------------------------------------------------

/**
 * Loading-screen fragments: excerpts, marginalia, notices, overheard lines.
 * Kept deliberately various — a wall of the same voice reads as filler.
 */
export const LOADING_FRAGMENTS: string[] = [
  `From the Cindergate order book, final entry: "Quota met. Quota met. Quota met. Quota met."`,
  `Nobody agrees how many tiers there are. Everybody agrees the number has grown.`,
  `The town was founded to mine the crypt. Within a generation it existed to keep the crypt supplied with people.`,
  `Torch discipline: light the second before the first goes out. The moment between is where they are.`,
  `A delver's rule — if a room is warmer than the corridor, something is using it.`,
  `The dead do not hunt. They accumulate, and then the accumulation moves.`,
  `Watch Captain's standing order: the stair is watched, never entered. Eleven guards, one bell.`,
  `Marginal note in a surveyor's chart: "Corridor measures ninety feet going down and one hundred and forty coming back. Rechecked. Same."`,
  `The Rime Archive was sealed from the inside. This is agreed. What is disputed is by whom, and against what.`,
  `Hesk's pricing rule: a thing that came out of the deep is worth what somebody will pay minus what it costs to sleep beside it.`,
  `Nine expeditions have been chartered. Three returned. Two of those returned incomplete, in ways the charter did not anticipate.`,
  `Advice from the Third Expedition, entire: "Do not go to the eleventh."`,
  `Ash falls in the Cinderfields at a constant rate and has done since before there was anyone to measure it.`,
  `Sister Vell keeps a list of nineteen names in the front of her pharmacopoeia. She has never explained the list and nobody asks.`,
  `A shrine will take your offering whether or not it means to give anything back. This is not malice. It is procedure.`,
  `The hive does not defend itself. It absorbs the attack as an input and adjusts production.`,
  `Every chest down there was closed by somebody. Consider what closing it accomplished.`,
  `The Drowned Sanctum floods on no tide and drains on no schedule. Prayers are timed to it regardless.`,
  `On the fourth tier there is a door that has been opened forty times and shut thirty-nine.`,
  `Gold is not scarce below. Carriers are.`,
  `The old survey marks stop at the seventh tier. Not because the surveyors did. Because the marks do not stay put.`,
  `What the depth wants is unclear. That it wants is not in serious dispute.`,
  `Ordrun Kale on deep-forged steel: "Better than ours. Do not ask me to say why, because I have worked out why."`,
  `A pack found at depth will contain rope, oil, iron rations and a will. The will is always the most recent item.`,
  `The Listener reports the deep going quiet on average eleven days a year. She keeps a chart. She will not show it.`,
  `Nothing that comes up the stair has ever announced itself as coming up the stair.`,
  `It is not true that the tiers rearrange. It is true that they are not the same on the way back.`,
  `The memorial wall has more names than the town has residents. The stonework was extended twice.`,
  `Old delver saying: the first tier teaches you, the fifth tests you, the ninth stops pretending there was a lesson.`,
  `Voidspire measurements are taken in duplicate by policy. The duplicates are compared. They have never agreed.`,
  `Peb has a collection of teeth. Four of them are not from anything the bestiary lists.`,
  `A body left below is not a body left below for long. Budget for that.`,
  `The foundry bell rings the shift change on the hour. It has been ringing since the fall. Nobody has found the bell.`,
  `The apothecary's fee is waived for anyone who comes to her within the hour. Almost nobody does.`,
  `They say the deep is endless. What they mean is that nobody has come back from the bottom to correct them.`,
  `Rule one of the vault: the lower room is not part of the tour.`,
  `Grave-oil burns cold and lasts nine hours. It is made in the crypt from a material the makers do not name.`,
  `The word for delver in the old survey language translates literally as "volunteer".`,
  `A monster is only a shape the depth found useful. It will find others.`,
  `Torches recovered from the eleventh tier were unlit and unburned. Their bearers were neither.`,
  `The stair down is the only route in and the only route out. This has been checked exhaustively and resentfully.`,
  `Every biome below was somebody's solution to a problem. The problems are not recorded. The solutions persist.`,
  `Certain relics recovered from depth continue to increase in value while unobserved. Corvane files this under "storage anomalies".`,
  `A quest is a reason to go where you were going anyway. Take the reason. It helps at hour three.`,
  `The bestiary is maintained by four people, none of whom have seen most of it, all of whom are accurate.`,
  `On the ninth tier the walls carry a tally in a hand that changes every hundred marks. The tally is still being kept.`,
  `Old Marrow cuts names at three-quarters of an inch. He says anything shallower is a rumour.`,
  `Depth is measured in tiers because nobody has agreed what a floor is down there.`,
  `Warning posted at the stairhead, unsigned, in an old hand: IT IS NOT A RUIN. SOMEONE IS STILL USING IT.`,
];

// ---------------------------------------------------------------------------
// Environmental text
// ---------------------------------------------------------------------------

export const SHRINE_INSCRIPTIONS: string[] = [
  `LEAVE SOMETHING. TAKE LESS.`,
  `THE BOWL IS NEVER EMPTIED. IT IS ONLY EVER FULL.`,
  `SPEAK IF YOU MUST. IT WAS LISTENING ALREADY.`,
  `THIS STONE WAS CARRIED DOWN. NOBODY REMEMBERS BY WHOM.`,
  `KNEEL OR PASS. BOTH ARE ANSWERED.`,
  `WE MADE IT A HOUSE SO IT WOULD STAY IN THE HOUSE.`,
  `GIVE FREELY. IT CAN TELL.`,
  `THE LAST PETITIONER IS STILL HERE. BE BRIEF.`,
];

export const DOOR_INSCRIPTIONS: string[] = [
  `SEALED BY ORDER OF A COUNCIL THAT NO LONGER SITS.`,
  `THREE KEYS. THREE HANDS. NO EXCEPTIONS.`,
  `DO NOT PROP OPEN.`,
  `BEYOND THIS POINT THE SURVEY IS UNRELIABLE.`,
  `WE CLOSED IT FROM THIS SIDE. REMEMBER THAT.`,
  `THE HINGES WERE FITTED TO SWING INWARD. ASK WHY.`,
];

export const CHEST_WHISPERS: string[] = [
  `The lid is warmer than the room.`,
  `Somebody packed this carefully, then locked it, then walked away in a hurry.`,
  `There is a name scratched inside the lid. It has been scratched out and rewritten twice.`,
  `The hinge is oiled. Recently.`,
  `Not treasure. Storage. Somebody meant to come back.`,
];

/** Barks the world may throw up at the player. Ambient, never critical. */
export const AMBIENT_BARKS: string[] = [
  `Something changes its mind about you and moves off.`,
  `A door closes somewhere ahead, unhurried.`,
  `The torch gutters, holds, and steadies.`,
  `For a moment the corridor smells of rain.`,
  `You are being counted.`,
  `The dark ahead is deeper than the dark behind. It should not be.`,
];

// ---------------------------------------------------------------------------
// Quest lore
// ---------------------------------------------------------------------------

export interface QuestLore {
  /** Line shown when the quest is accepted, under the objective list. */
  brief?: string;
  /** Occasional whispers while the quest is active. */
  whisper?: string[];
  /** Shown on completion, above the reward panel. */
  onComplete?: string;
  /** Shown on failure. */
  onFail?: string;
}

/**
 * Keyed by QuestDef.id. Partial — `questLore` returns a generic set for any
 * quest without a bespoke entry, so new quests never read as unfinished.
 */
export const QUEST_LORE: Record<string, QuestLore> = {
  the_tithe: {
    brief: `The bargain is old and the terms are plain: what is stored below is stored for somebody, and the somebody collects at the lid.`,
    whisper: [`The next one will be worse.`, `You have opened four. It is keeping count.`],
    onComplete: `The last guardian goes down and the tithe is paid. The chests stay open behind you, which is somehow the unpleasant part.`,
    onFail: `The tithe goes unpaid. Nothing objects aloud. It simply notes the shortfall.`,
  },
  bloodless: {
    brief: `Vell will not sell to you today. She has her reasons and one of them is that you asked her to.`,
    whisper: [`The bottle is still in your belt. That is the entire test.`],
    onComplete: `You come up dry-mouthed, shaking and undosed. Vell looks at you a long moment and writes something down.`,
    onFail: `The cork comes out. Nobody blames you. The wager is simply over.`,
  },
  the_long_dark: {
    brief: `Every torch on this tier is out and the sconces are cold. Whatever put them out did it thoroughly and in order.`,
    whisper: [`Your light reaches nine feet. It knows this.`, `Something moved just past the edge of the flame.`],
    onComplete: `You come up the stair with the same flame you carried down. That is not nothing.`,
  },
  hunters_mark: {
    brief: `Something has taken an interest and will follow you down. Each time it slips away it comes back heavier.`,
    whisper: [`It is on this tier.`, `It has been watching for a while and has stopped hiding it.`],
    onComplete: `It goes down at last, on the tier where it finally decided to stand. It was bigger than when it started. So were you.`,
    onFail: `It breaks off, satisfied, and goes to wait somewhere deeper.`,
  },
  reliquary: {
    brief: `Five fragments, five champions, and one unpleasant property: the reliquary draws its protection from the bearer.`,
    whisper: [`The fragments are cold against your ribs.`, `Carrying these is costing you something.`],
    onComplete: `The reliquary closes on the fifth fragment, and whatever it was taking from you stops, all at once, like a held breath let go.`,
  },
  the_lantern_bearer: {
    brief: `He knows the way to the lower vault and he will not draw it for you. He has been let down before.`,
    whisper: [`He is falling behind.`, `He is talking to keep his nerve up. Let him.`],
    onComplete: `He gets to the stair, sits down on the bottom step, and laughs for rather too long.`,
    onFail: `The lantern goes out on the floor beside him. You take it. There is nothing else to take.`,
  },
  hold_the_shrine: {
    brief: `The shrine is lit. It will stay lit for as long as somebody is standing in the light.`,
    whisper: [`They are coming from the corridor.`, `Hold. It is nearly through.`],
    onComplete: `The last of them falls back into the dark and the shrine burns steady, having asked for exactly what it asked for.`,
    onFail: `The light goes out. Very simply, and all at once.`,
  },
};

const GENERIC_QUEST_LORE: QuestLore = {
  brief: `A reason to be down here, which is more than most people manage.`,
  whisper: [`The work is not finished.`, `Deeper. That is where the rest of it is.`],
  onComplete: `Done, and logged, and paid. The tier goes back to what it was doing.`,
  onFail: `The contract lapses. Nobody down here was ever going to enforce it.`,
};

export function questLore(questId: string): QuestLore {
  return QUEST_LORE[questId] ?? GENERIC_QUEST_LORE;
}

// ---------------------------------------------------------------------------
// Named NPCs and elites that quests reference by filter
// ---------------------------------------------------------------------------

/** Names used for quest-spawned escorts, marked elites and relic champions. */
export const NAMED_ESCORTS: string[] = [
  `Jerem the Lantern-Bearer`,
  `Surveyor Anwen Doss`,
  `Fennik, Guild Runner`,
  `Sister Ottilie`,
  `Cartwright Pell`,
  `The Boy Ives`,
  `Warden-Emeritus Holt`,
  `Ashka of the Third Expedition`,
];

export const NAMED_ELITES: string[] = [
  `The Marked`,
  `Grinning Ossric`,
  `Vhal, Who Waited`,
  `The Second Shift`,
  `Nine-Fingers`,
  `The Quiet Half`,
  `Bell-Ringer`,
  `Thrice-Buried Sela`,
  `The Uninvited Guest`,
  `Cold Amma`,
];

export const RELIC_NAMES: string[] = [
  `a splinter of the Marrow Reliquary`,
  `a pale coin, still warm`,
  `the third stanza, cut in slate`,
  `a jar of grave-oil, sealed`,
  `the tally-board's missing page`,
  `a tooth that is not from anything listed`,
  `the Drowned Oracle's second answer`,
  `a nail from the Spire`,
];

// ---------------------------------------------------------------------------
// Misc UI voice
// ---------------------------------------------------------------------------

export const LEVEL_UP_LINES: string[] = [
  `Something in you settles into place.`,
  `The weight of the pack changes without getting lighter.`,
  `You have learned the corridor's habits.`,
  `Steadier. Not safer.`,
];

export const DEPTH_CARDS: string[] = [
  `Tier {depth}. The air changes on the stair.`,
  `Tier {depth}. Nothing here has been surveyed twice.`,
  `Tier {depth}. Further than most of the wall got.`,
  `Tier {depth}. Down is the only direction that works.`,
];

export function depthCard(depth: number, rng: Rng): string {
  return fill(pickLine(DEPTH_CARDS, rng, DEPTH_CARDS[0]!), { depth });
}
