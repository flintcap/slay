/**
 * SLAY — the quest catalogue.
 *
 * Every run carries exactly one quest. A quest is not a counter bolted to a
 * dungeon: it is the reason this particular descent is different from the last
 * one. Most entries here change a rule (`modifier`), change the shape of the
 * floor (guardian chests, dead torches, a stalking elite), or change what you
 * are willing to spend to finish.
 *
 * ---------------------------------------------------------------------------
 * FILTER GRAMMAR
 * ---------------------------------------------------------------------------
 * `QuestObjective.filter` is free-form by contract. This module and
 * `sim/Quests.ts` agree on a small `key:value` vocabulary. Unknown filters
 * always match, so a missing hook degrades to "any" rather than to a
 * softlocked run.
 *
 *   slay        `any`                      — anything that dies
 *               `family:undead`            — MonsterFamily
 *               `id:crypt_ghoul`           — MonsterDef id
 *               `rank:champion`            — MonsterRank and above
 *               `tagged:guardian`          — spawned by the quest itself
 *   slayElite   `rank:elite`               — elite or better
 *               `named:mark`               — the run's named stalker
 *               `named:champion`           — relic champions
 *               `family:demon`
 *   collect     `item:relic_fragment`      — quest pickup id
 *   reach       `marker:exit`              — level exit
 *               `marker:vault` / `shrine` / `survey` / `bell` / `deep`
 *   survive     `zone:shrine`              — must be held in place
 *               `zone:any`                 — anywhere on the floor
 *               `zone:arena`
 *   escort      `npc:lantern_bearer`       — see lore.NAMED_ESCORTS
 *   cleanse     `prop:shrine` / `brazier` / `chest` / `seal` / `ward` /
 *               `nursery` / `forge` / `wardstone` / `pyre`
 *   boss        `boss:any` or `boss:<id>`
 *
 * ---------------------------------------------------------------------------
 * SCALING
 * ---------------------------------------------------------------------------
 * Each objective template gives `base` + `perDepth`. `sim/Quests.ts` resolves
 * `target = round(base + perDepth * (depth - 1))`, clamped to >= 1, with a
 * small deterministic jitter. `survive` targets are in seconds and are not
 * jittered.
 */

import type { BiomeId, QuestDef } from '../types';

// ---------------------------------------------------------------------------
// Extended definition
// ---------------------------------------------------------------------------

export type QuestTag =
  | 'combat'
  | 'hoard'
  | 'escort'
  | 'ritual'
  | 'endurance'
  | 'exploration'
  | 'boss'
  | 'gauntlet'
  | 'hunt'
  | 'cursed';

/** Conditions that can end a quest early, in failure. */
export type QuestFailKind =
  | 'escortDeath'
  | 'potionUsed'
  | 'timeExpired'
  | 'shrineLost'
  | 'relicLost'
  | 'torchLost'
  | 'markEscaped'
  | 'wardBroken'
  | 'playerDeath';

/**
 * The catalogue's row type. It *extends* the shared `QuestDef` rather than
 * changing it, so anything typed against `QuestDef` (DungeonGen, the quest log
 * UI) keeps working while this module carries the extra selection metadata.
 */
export interface QuestDefEx extends QuestDef {
  /** Restrict to these biomes. Undefined = any biome. */
  biomes?: BiomeId[];
  /** Weight decays to zero past this depth — starter quests retire. */
  maxDepth?: number;
  tags: QuestTag[];
  /** What can end this quest in failure. Empty/undefined = cannot be failed. */
  failOn?: QuestFailKind[];
  /** 0..3. Extra danger beyond the depth baseline; feeds reward variance. */
  danger: number;
  /** Additional run modifiers beyond `modifier`. */
  extraModifiers?: string[];
}

/**
 * Every run-modifier string this catalogue can impose. Published so the
 * difficulty layer (`sim/Difficulty.ts`, owned by CHARACTER) has an
 * authoritative list of what quests will hand it. Unknown modifiers must be
 * ignored gracefully on that side.
 */
export const QUEST_MODIFIERS: readonly string[] = [
  'noPotions', // healing consumables are sealed
  'darkness', // static torches unlit; only carried light
  'noRegen', // life/mana regeneration suppressed
  'fragile', // player takes +% damage
  'famine', // no gold/consumable drops from trash
  'timeLimit', // floor timer; expiry fails the quest
  'chestGuardians', // opening a container spawns a guardian pack
  'shrinesHostile', // shrines fight back before they cleanse
  'doubleSpawns', // pack density up sharply
  'monsterHaste', // enemy move and attack speed up
  'reinforcements', // packs trickle in continuously
  'volatile', // slain enemies detonate
  'resistDrain', // carried quest relics sap resistances
  'eliteFrenzy', // elites gain an extra affix
  'thinAir', // mana costs raised, cast speed lowered
  'bleedout', // damage over time does not decay on its own
  'sanguine', // enemies heal from each other's deaths
  'echoes', // slain elites respawn once, weaker
  'cursedGround', // standing still is punished
  'stalker', // a named elite follows the run between levels
  'lowVisibility', // fog draws in
  'goldRush', // gold drops way up, monster life up with it
] as const;

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

/**
 * Roughly seventy quests, banded by depth. Weights are tuned so the pool
 * turns over as the player descends: the errands retire, the hunts and
 * gauntlets take their place, and the last band is made of things that ought
 * not to be attempted.
 */
export const QUESTS: QuestDefEx[] = [
  // =========================================================================
  // BAND I — the first tiers. Teaches the verbs.
  // =========================================================================
  {
    id: 'first_blood',
    name: `The Culling Order`,
    flavor: `The watch pays by the head and does not ask which head. It is not glamorous work. It is the work that keeps the stair quiet.`,
    minDepth: 1,
    maxDepth: 9,
    weight: 90,
    objectives: [
      { kind: 'slay', filter: 'any', base: 24, perDepth: 5, desc: `Cull {n} of whatever holds this tier` },
    ],
    rewardGold: 1.0,
    rewardXp: 1.0,
    rewardItems: 1,
    tags: ['combat'],
    danger: 0,
  },
  {
    id: 'the_tithe',
    name: `The Tithe`,
    flavor: `Everything stored down here was stored for somebody, and the somebody has never been paid. Open the boxes if you like. The account settles at the lid.`,
    minDepth: 1,
    weight: 70,
    objectives: [
      { kind: 'cleanse', filter: 'prop:chest', base: 6, perDepth: 0.4, desc: `Open {n} sealed caches` },
      { kind: 'slay', filter: 'tagged:guardian', base: 6, perDepth: 0.4, desc: `Put down the {n} guardians they wake` },
      { kind: 'survive', filter: 'zone:any', base: 45, perDepth: 4, desc: `Live {n} seconds with the tithe unpaid` },
    ],
    rewardGold: 2.0,
    rewardXp: 1.2,
    rewardItems: 3,
    modifier: 'chestGuardians',
    tags: ['hoard', 'combat'],
    danger: 1,
  },
  {
    id: 'bloodless',
    name: `Bloodless`,
    flavor: `Vell will not sell to you today. She has her reasons and the chief one is that you asked her not to.`,
    minDepth: 1,
    weight: 55,
    objectives: [
      { kind: 'slay', filter: 'any', base: 20, perDepth: 4, desc: `Clear {n} of them undosed` },
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Reach the descent with the seal unbroken` },
    ],
    rewardGold: 1.8,
    rewardXp: 1.8,
    rewardItems: 2,
    modifier: 'noPotions',
    tags: ['cursed', 'endurance'],
    failOn: ['potionUsed'],
    danger: 2,
  },
  {
    id: 'the_long_dark',
    name: `The Long Dark`,
    flavor: `Every sconce on this tier is cold and every torch is out. Whatever did it went along the corridor in order, unhurried, and did not miss one.`,
    minDepth: 1,
    weight: 60,
    objectives: [
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Find the descent by the light you carry` },
      { kind: 'slay', filter: 'any', base: 15, perDepth: 3, desc: `Kill {n} things you cannot see coming` },
    ],
    rewardGold: 1.4,
    rewardXp: 1.6,
    rewardItems: 2,
    modifier: 'darkness',
    extraModifiers: ['lowVisibility'],
    tags: ['exploration', 'cursed'],
    danger: 2,
  },
  {
    id: 'gravewatch',
    name: `Gravewatch`,
    flavor: `The braziers along the ossuary tiers are not decorative. Somebody worked out, early, that the dead dislike a lit room, and somebody has been letting the fires go out.`,
    minDepth: 1,
    maxDepth: 12,
    weight: 65,
    biomes: ['crypt', 'caverns'],
    objectives: [
      { kind: 'cleanse', filter: 'prop:brazier', base: 5, perDepth: 0.3, desc: `Relight {n} grave-braziers` },
      { kind: 'slay', filter: 'family:undead', base: 20, perDepth: 4, desc: `Put down {n} of the restless` },
    ],
    rewardGold: 1.2,
    rewardXp: 1.2,
    rewardItems: 1,
    tags: ['ritual', 'combat'],
    danger: 0,
  },
  {
    id: 'the_lantern_bearer',
    name: `The Lantern-Bearer`,
    flavor: `He knows the way down to the lower vault and he will not draw it for you. He has been let down before, twice, by better-equipped people than you.`,
    minDepth: 1,
    weight: 50,
    objectives: [
      { kind: 'escort', filter: 'npc:lantern_bearer', base: 1, perDepth: 0, desc: `Keep the lantern-bearer breathing` },
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Walk him to the stair` },
    ],
    rewardGold: 1.6,
    rewardXp: 1.5,
    rewardItems: 2,
    tags: ['escort'],
    failOn: ['escortDeath'],
    danger: 1,
  },
  {
    id: 'hold_the_shrine',
    name: `Hold the Shrine`,
    flavor: `The stone will take your offering and then, quite reasonably, expect you to stay for the consequences.`,
    minDepth: 1,
    weight: 60,
    objectives: [
      { kind: 'cleanse', filter: 'prop:shrine', base: 1, perDepth: 0, desc: `Wake the shrine` },
      { kind: 'survive', filter: 'zone:shrine', base: 80, perDepth: 6, desc: `Stand in the light for {n} seconds` },
    ],
    rewardGold: 1.5,
    rewardXp: 1.4,
    rewardItems: 2,
    modifier: 'reinforcements',
    tags: ['endurance', 'ritual'],
    failOn: ['shrineLost'],
    danger: 1,
  },
  {
    id: 'widows_keepsake',
    name: `The Widow's Keepsake`,
    flavor: `It is a brass locket worth nine coppers. She has offered nine hundred. Do not ask her to explain the arithmetic.`,
    minDepth: 1,
    maxDepth: 10,
    weight: 45,
    objectives: [
      { kind: 'collect', filter: 'item:keepsake', base: 1, perDepth: 0, desc: `Recover the locket` },
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Carry it back to the stair` },
    ],
    rewardGold: 2.2,
    rewardXp: 0.8,
    rewardItems: 1,
    tags: ['hoard', 'exploration'],
    danger: 0,
  },
  {
    id: 'rat_king',
    name: `The Rat King`,
    flavor: `A thing that is many things, agreeing. It has been agreeing for a long time and has grown accordingly.`,
    minDepth: 1,
    maxDepth: 14,
    weight: 50,
    objectives: [
      { kind: 'slay', filter: 'family:beast', base: 30, perDepth: 5, desc: `Thin the swarm — {n} of them` },
      { kind: 'slayElite', filter: 'named:mark', base: 1, perDepth: 0, desc: `Kill the thing they are all part of` },
    ],
    rewardGold: 1.4,
    rewardXp: 1.4,
    rewardItems: 2,
    tags: ['combat', 'hunt'],
    danger: 1,
  },
  {
    id: 'ossuary_census',
    name: `Ossuary Census`,
    flavor: `The tiers were catalogued once. The catalogue is out of date by four centuries and several thousand residents, and the town would like the discrepancy narrowed.`,
    minDepth: 1,
    maxDepth: 12,
    weight: 50,
    biomes: ['crypt'],
    objectives: [
      { kind: 'collect', filter: 'item:census_skull', base: 10, perDepth: 1.2, desc: `Tally {n} marked skulls` },
    ],
    rewardGold: 1.5,
    rewardXp: 1.0,
    rewardItems: 1,
    tags: ['hoard', 'exploration'],
    danger: 0,
  },
  {
    id: 'the_sealed_door',
    name: `The Sealed Door`,
    flavor: `Three keys, three hands, no exceptions — so said the council that sealed it, and the council is four hundred years dissolved, and the door does not know that.`,
    minDepth: 1,
    weight: 55,
    objectives: [
      { kind: 'collect', filter: 'item:vault_key', base: 3, perDepth: 0.2, desc: `Take {n} keys from the ones that hold them` },
      { kind: 'reach', filter: 'marker:vault', base: 1, perDepth: 0, desc: `Open the sealed vault` },
    ],
    rewardGold: 2.4,
    rewardXp: 1.1,
    rewardItems: 3,
    tags: ['exploration', 'hoard'],
    danger: 1,
  },
  {
    id: 'errand_of_iron',
    name: `An Errand of Iron`,
    flavor: `Ordrun wants deep-forged stock and will not say why, beyond that surface iron has been disappointing him personally since the fall.`,
    minDepth: 1,
    maxDepth: 16,
    weight: 45,
    objectives: [
      { kind: 'collect', filter: 'item:deep_iron', base: 8, perDepth: 1.0, desc: `Recover {n} billets of deep iron` },
      { kind: 'slay', filter: 'family:construct', base: 8, perDepth: 1.5, desc: `Unmake {n} of what guards it` },
    ],
    rewardGold: 1.3,
    rewardXp: 1.1,
    rewardItems: 2,
    tags: ['hoard'],
    danger: 0,
  },
  {
    id: 'quiet_hours',
    name: `Quiet Hours`,
    flavor: `Something on this tier has learned to wait behind you, and it has taught the technique to the rest.`,
    minDepth: 2,
    weight: 50,
    objectives: [
      { kind: 'slay', filter: 'role:ambusher', base: 10, perDepth: 2, desc: `Kill {n} of the ones that wait` },
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Reach the stair without being taken from behind` },
    ],
    rewardGold: 1.3,
    rewardXp: 1.5,
    rewardItems: 2,
    modifier: 'lowVisibility',
    tags: ['hunt', 'cursed'],
    danger: 1,
  },
  {
    id: 'cull_the_broods',
    name: `Cull the Broods`,
    flavor: `You do not fight a hive. You reduce it, and then you leave before it finishes recalculating.`,
    minDepth: 2,
    weight: 50,
    biomes: ['hive', 'caverns'],
    objectives: [
      { kind: 'slay', filter: 'family:insect', base: 35, perDepth: 6, desc: `Reduce the brood by {n}` },
      { kind: 'cleanse', filter: 'prop:nursery', base: 3, perDepth: 0.3, desc: `Burn out {n} nurseries` },
    ],
    rewardGold: 1.3,
    rewardXp: 1.4,
    rewardItems: 2,
    tags: ['combat', 'ritual'],
    danger: 1,
  },
  {
    id: 'deep_and_quick',
    name: `Deep and Quick`,
    flavor: `The Listener says the tier goes quiet in about eleven minutes. She has never been wrong about this and has never explained it either.`,
    minDepth: 2,
    weight: 45,
    objectives: [
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Get to the descent before it notices` },
      { kind: 'slay', filter: 'any', base: 12, perDepth: 2, desc: `Clear the {n} that get in the way` },
    ],
    rewardGold: 1.6,
    rewardXp: 1.7,
    rewardItems: 2,
    modifier: 'timeLimit',
    tags: ['exploration', 'gauntlet'],
    failOn: ['timeExpired'],
    danger: 2,
  },

  // =========================================================================
  // BAND II — depth 3-5. The pool starts imposing rules.
  // =========================================================================
  {
    id: 'hunters_mark',
    name: `Hunter's Mark`,
    flavor: `One of them has taken an interest. It will follow you down. Every time it slips away it comes back heavier, and it has slipped away before.`,
    minDepth: 3,
    weight: 70,
    objectives: [
      { kind: 'slayElite', filter: 'named:mark', base: 1, perDepth: 0, desc: `Kill the thing that is following you` },
      { kind: 'slay', filter: 'any', base: 25, perDepth: 5, desc: `Clear {n} of its escort` },
    ],
    rewardGold: 1.8,
    rewardXp: 2.0,
    rewardItems: 3,
    modifier: 'stalker',
    tags: ['hunt'],
    failOn: ['markEscaped'],
    danger: 2,
  },
  {
    id: 'reliquary',
    name: `Reliquary`,
    flavor: `Five fragments, each held by something that considers itself a custodian. The reliquary draws its protection from whoever is carrying it, which is an elegant design and a hateful one.`,
    minDepth: 4,
    weight: 65,
    objectives: [
      { kind: 'collect', filter: 'item:relic_fragment', base: 5, perDepth: 0.3, desc: `Gather {n} reliquary fragments` },
      { kind: 'slayElite', filter: 'named:champion', base: 5, perDepth: 0.3, desc: `Break the {n} champions that hold them` },
    ],
    rewardGold: 2.2,
    rewardXp: 2.0,
    rewardItems: 4,
    modifier: 'resistDrain',
    tags: ['hoard', 'cursed'],
    failOn: ['relicLost'],
    danger: 2,
  },
  {
    id: 'the_third_watch',
    name: `The Third Watch`,
    flavor: `Eleven guards went down with the Third Expedition and eleven tokens came back up, in a sack, without a note.`,
    minDepth: 3,
    weight: 50,
    objectives: [
      { kind: 'collect', filter: 'item:watch_token', base: 4, perDepth: 0.5, desc: `Recover {n} watch tokens` },
      { kind: 'slayElite', filter: 'rank:elite', base: 2, perDepth: 0.2, desc: `Kill the {n} wearing them now` },
    ],
    rewardGold: 1.7,
    rewardXp: 1.6,
    rewardItems: 2,
    tags: ['hoard', 'hunt'],
    danger: 1,
  },
  {
    id: 'saltline',
    name: `The Saltline`,
    flavor: `The wardstones make a line across the tier. Everything below the line respects it. The problem is that the line has been broken in six places and the respect is expiring.`,
    minDepth: 3,
    weight: 55,
    objectives: [
      { kind: 'cleanse', filter: 'prop:wardstone', base: 6, perDepth: 0.4, desc: `Re-salt {n} wardstones` },
      { kind: 'slay', filter: 'any', base: 30, perDepth: 6, desc: `Hold off {n} while you work` },
    ],
    rewardGold: 1.5,
    rewardXp: 1.7,
    rewardItems: 2,
    modifier: 'doubleSpawns',
    tags: ['ritual', 'endurance'],
    danger: 2,
  },
  {
    id: 'the_unlit_way',
    name: `The Unlit Way`,
    flavor: `The survey marks are still there. Reading them requires light, and light is the thing this tier has been methodically removing.`,
    minDepth: 4,
    weight: 50,
    objectives: [
      { kind: 'reach', filter: 'marker:survey', base: 3, perDepth: 0.4, desc: `Find {n} survey marks in the dark` },
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Reach the descent` },
    ],
    rewardGold: 1.6,
    rewardXp: 1.8,
    rewardItems: 2,
    modifier: 'darkness',
    tags: ['exploration', 'cursed'],
    danger: 2,
  },
  {
    id: 'butchers_bill',
    name: `The Butcher's Bill`,
    flavor: `No cleverness in it. The watch has calculated how many need to die for the stair to stay quiet another season, and the figure is not small.`,
    minDepth: 3,
    weight: 60,
    objectives: [
      { kind: 'slay', filter: 'any', base: 55, perDepth: 9, desc: `Settle the bill — {n} dead` },
    ],
    rewardGold: 1.6,
    rewardXp: 1.7,
    rewardItems: 2,
    modifier: 'monsterHaste',
    tags: ['combat', 'gauntlet'],
    danger: 2,
  },
  {
    id: 'no_quarter',
    name: `No Quarter`,
    flavor: `The elites hold territory. Taking the territory is not the contract. Taking the elites is.`,
    minDepth: 5,
    weight: 55,
    objectives: [
      { kind: 'slayElite', filter: 'rank:elite', base: 5, perDepth: 0.4, desc: `Break {n} elite packs` },
    ],
    rewardGold: 1.9,
    rewardXp: 2.0,
    rewardItems: 3,
    modifier: 'eliteFrenzy',
    tags: ['hunt', 'combat'],
    danger: 2,
  },
  {
    id: 'the_drowned_choir',
    name: `The Drowned Choir`,
    flavor: `They still keep the hours. Matins is the loud one. Try to be elsewhere for matins.`,
    minDepth: 5,
    weight: 55,
    biomes: ['sunkenTemple', 'crypt'],
    objectives: [
      { kind: 'cleanse', filter: 'prop:shrine', base: 4, perDepth: 0.3, desc: `Silence {n} choir stalls` },
      { kind: 'slay', filter: 'family:undead', base: 25, perDepth: 5, desc: `Disperse {n} of the congregation` },
    ],
    rewardGold: 1.7,
    rewardXp: 1.7,
    rewardItems: 2,
    modifier: 'shrinesHostile',
    tags: ['ritual', 'combat'],
    danger: 2,
  },
  {
    id: 'bellringer',
    name: `Bell-Ringer`,
    flavor: `The shift bell has rung on the hour since the fall and nobody has found the bell. Ring it deliberately, once, and see what reports for work.`,
    minDepth: 4,
    weight: 50,
    biomes: ['foundry'],
    objectives: [
      { kind: 'reach', filter: 'marker:bell', base: 1, perDepth: 0, desc: `Find the shift bell` },
      { kind: 'survive', filter: 'zone:any', base: 110, perDepth: 8, desc: `Survive {n} seconds of the shift` },
      { kind: 'slay', filter: 'family:construct', base: 15, perDepth: 3, desc: `Break {n} of what answers` },
    ],
    rewardGold: 2.0,
    rewardXp: 1.9,
    rewardItems: 3,
    modifier: 'reinforcements',
    tags: ['endurance', 'combat'],
    danger: 2,
  },
  {
    id: 'brood_cull',
    name: `Brood Cull`,
    flavor: `The hive treats an attack as an input and adjusts production. There is a rate of removal it cannot adjust to. Find it.`,
    minDepth: 4,
    weight: 50,
    biomes: ['hive'],
    objectives: [
      { kind: 'slay', filter: 'family:insect', base: 50, perDepth: 9, desc: `Remove {n} from the brood` },
      { kind: 'slayElite', filter: 'rank:elite', base: 2, perDepth: 0.3, desc: `Kill {n} brood-mothers` },
    ],
    rewardGold: 1.5,
    rewardXp: 1.8,
    rewardItems: 2,
    modifier: 'doubleSpawns',
    tags: ['combat', 'gauntlet'],
    danger: 2,
  },
  {
    id: 'thaw_watch',
    name: `Thaw Watch`,
    flavor: `Something in the ice is nearly out. It has been nearly out for two hundred years. The Archive would like that state of affairs extended.`,
    minDepth: 5,
    weight: 50,
    biomes: ['frostvault'],
    objectives: [
      { kind: 'survive', filter: 'zone:any', base: 140, perDepth: 9, desc: `Hold the gallery {n} seconds` },
      { kind: 'slay', filter: 'family:elemental', base: 18, perDepth: 3, desc: `Disperse {n} of the cold` },
    ],
    rewardGold: 1.7,
    rewardXp: 1.8,
    rewardItems: 2,
    modifier: 'noRegen',
    tags: ['endurance'],
    danger: 2,
  },
  {
    id: 'the_uninvited',
    name: `The Uninvited`,
    flavor: `It has been to every tier you have been to, one room behind, for a while now. Tonight it stops being one room behind.`,
    minDepth: 4,
    weight: 55,
    objectives: [
      { kind: 'slayElite', filter: 'named:mark', base: 1, perDepth: 0, desc: `Turn and face it` },
      { kind: 'survive', filter: 'zone:any', base: 90, perDepth: 7, desc: `Last {n} seconds of its attention` },
    ],
    rewardGold: 1.9,
    rewardXp: 2.1,
    rewardItems: 3,
    modifier: 'stalker',
    tags: ['hunt', 'endurance'],
    failOn: ['markEscaped'],
    danger: 2,
  },
  {
    id: 'cartographers_debt',
    name: `The Cartographer's Debt`,
    flavor: `Anwen Doss took an advance to chart the fourth tier and did not deliver. Her marks are still down there. So, in a manner of speaking, is she.`,
    minDepth: 3,
    weight: 50,
    objectives: [
      { kind: 'reach', filter: 'marker:survey', base: 4, perDepth: 0.5, desc: `Recover {n} survey stations` },
      { kind: 'collect', filter: 'item:survey_page', base: 3, perDepth: 0.4, desc: `Retrieve {n} pages of her chart` },
    ],
    rewardGold: 1.8,
    rewardXp: 1.4,
    rewardItems: 2,
    tags: ['exploration', 'hoard'],
    danger: 1,
  },
  {
    id: 'blood_price',
    name: `The Blood Price`,
    flavor: `They feed on each other's endings. Kill them slowly and you feed the room. Kill them fast and you feed nothing.`,
    minDepth: 5,
    weight: 50,
    objectives: [
      { kind: 'slay', filter: 'any', base: 45, perDepth: 8, desc: `Take {n} before the room takes them back` },
    ],
    rewardGold: 1.8,
    rewardXp: 1.9,
    rewardItems: 3,
    modifier: 'sanguine',
    extraModifiers: ['noRegen'],
    tags: ['combat', 'cursed'],
    danger: 3,
  },
  {
    id: 'the_offering',
    name: `The Offering`,
    flavor: `The bowls are full and have always been full. Adding to them is not the ritual. Taking from them is.`,
    minDepth: 4,
    weight: 45,
    objectives: [
      { kind: 'collect', filter: 'item:offering', base: 3, perDepth: 0.3, desc: `Lift {n} offerings from the bowls` },
      { kind: 'cleanse', filter: 'prop:shrine', base: 1, perDepth: 0.1, desc: `Close the shrine behind you` },
      { kind: 'survive', filter: 'zone:any', base: 60, perDepth: 5, desc: `Outlast the objection — {n} seconds` },
    ],
    rewardGold: 2.3,
    rewardXp: 1.5,
    rewardItems: 3,
    modifier: 'shrinesHostile',
    tags: ['ritual', 'hoard'],
    danger: 2,
  },
  {
    id: 'dead_mans_pack',
    name: `Dead Man's Pack`,
    flavor: `A pack found at depth contains rope, oil, iron rations and a will. The will is always the most recent item. This one names you.`,
    minDepth: 3,
    weight: 45,
    objectives: [
      { kind: 'collect', filter: 'item:delvers_pack', base: 1, perDepth: 0, desc: `Find the pack` },
      { kind: 'slay', filter: 'any', base: 18, perDepth: 3, desc: `Kill the {n} that were waiting near it` },
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Carry it out` },
    ],
    rewardGold: 2.0,
    rewardXp: 1.3,
    rewardItems: 3,
    tags: ['hoard', 'exploration'],
    danger: 1,
  },
  {
    id: 'iron_harvest',
    name: `Iron Harvest`,
    flavor: `The pour is still running. Nobody has stopped it because stopping it requires standing where the pour is.`,
    minDepth: 5,
    weight: 50,
    biomes: ['foundry'],
    objectives: [
      { kind: 'collect', filter: 'item:ingot', base: 10, perDepth: 1.0, desc: `Draw {n} ingots off the line` },
      { kind: 'slay', filter: 'family:construct', base: 18, perDepth: 3, desc: `Break {n} of the shift` },
      { kind: 'cleanse', filter: 'prop:forge', base: 2, perDepth: 0.2, desc: `Bank {n} forges` },
    ],
    rewardGold: 2.4,
    rewardXp: 1.5,
    rewardItems: 3,
    tags: ['hoard', 'ritual'],
    danger: 2,
  },
  {
    id: 'thin_ice',
    name: `Thin Ice`,
    flavor: `The Archive is stable so long as nothing warm stays in it for long. You are warm and you are staying.`,
    minDepth: 5,
    weight: 45,
    biomes: ['frostvault'],
    objectives: [
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Cross the galleries to the descent` },
      { kind: 'slayElite', filter: 'rank:elite', base: 2, perDepth: 0.2, desc: `Break {n} of what is already thawed` },
    ],
    rewardGold: 1.7,
    rewardXp: 1.9,
    rewardItems: 3,
    modifier: 'fragile',
    tags: ['exploration', 'cursed'],
    danger: 3,
  },
  {
    id: 'ashfall_run',
    name: `Ashfall`,
    flavor: `Open ground, no cover, grey weather. Everything on the Cinderfields will see you leave the wall. That is the price of the shortcut.`,
    minDepth: 5,
    weight: 45,
    biomes: ['ashwaste'],
    objectives: [
      { kind: 'reach', filter: 'marker:survey', base: 3, perDepth: 0.4, desc: `Cross to {n} waymarks` },
      { kind: 'survive', filter: 'zone:any', base: 100, perDepth: 8, desc: `Weather {n} seconds of the fall` },
    ],
    rewardGold: 1.6,
    rewardXp: 1.8,
    rewardItems: 2,
    modifier: 'lowVisibility',
    tags: ['exploration', 'endurance'],
    danger: 2,
  },
  {
    id: 'the_long_count',
    name: `The Long Count`,
    flavor: `On the ninth tier there is a tally in a hand that changes every hundred marks. Somebody would like to know what is being counted. Contribute to the total.`,
    minDepth: 4,
    weight: 50,
    objectives: [
      { kind: 'slay', filter: 'any', base: 70, perDepth: 12, desc: `Add {n} to the tally` },
      { kind: 'cleanse', filter: 'prop:seal', base: 3, perDepth: 0.3, desc: `Mark {n} tally stones` },
    ],
    rewardGold: 1.7,
    rewardXp: 1.9,
    rewardItems: 3,
    tags: ['combat', 'ritual'],
    danger: 1,
  },
  {
    id: 'famine_run',
    name: `Lean Season`,
    flavor: `Nothing down here is dropping anything worth having. The tier has been picked over — recently, thoroughly, by something with hands.`,
    minDepth: 5,
    weight: 40,
    objectives: [
      { kind: 'slay', filter: 'any', base: 40, perDepth: 7, desc: `Work through {n} for nothing` },
      { kind: 'reach', filter: 'marker:vault', base: 1, perDepth: 0, desc: `Reach the one cache they missed` },
    ],
    rewardGold: 3.0,
    rewardXp: 1.5,
    rewardItems: 4,
    modifier: 'famine',
    tags: ['cursed', 'hoard'],
    danger: 2,
  },

  // =========================================================================
  // BAND III — depth 6-10. Bosses enter the pool; rules compound.
  // =========================================================================
  {
    id: 'the_hollow_king',
    name: `The Hollow King`,
    flavor: `Whatever holds the bottom of this run has a court, and a court has to be gone through. That is what a court is for.`,
    minDepth: 8,
    weight: 65,
    objectives: [
      { kind: 'slayElite', filter: 'rank:elite', base: 3, perDepth: 0.3, desc: `Break the court — {n} elites` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Put down what sits at the end` },
    ],
    rewardGold: 2.2,
    rewardXp: 2.2,
    rewardItems: 4,
    tags: ['boss', 'hunt'],
    danger: 2,
  },
  {
    id: 'seven_seals',
    name: `Seven Seals`,
    flavor: `Somebody sealed this thing in with seven stones and left a note explaining the order. The note is gone. The stones are not.`,
    minDepth: 7,
    weight: 55,
    objectives: [
      { kind: 'cleanse', filter: 'prop:seal', base: 7, perDepth: 0.3, desc: `Break {n} seals` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Meet what they were holding` },
    ],
    rewardGold: 2.4,
    rewardXp: 2.3,
    rewardItems: 4,
    modifier: 'shrinesHostile',
    tags: ['ritual', 'boss'],
    danger: 3,
  },
  {
    id: 'the_debt_collector',
    name: `The Debt Collector`,
    flavor: `It keeps a ledger nobody signed. Your name is in it. The entry is recent and it is written in a hand that has been improving.`,
    minDepth: 6,
    weight: 55,
    objectives: [
      { kind: 'slayElite', filter: 'named:mark', base: 1, perDepth: 0, desc: `Settle with the collector` },
      { kind: 'collect', filter: 'item:ledger_page', base: 4, perDepth: 0.4, desc: `Take {n} pages of the ledger` },
    ],
    rewardGold: 2.6,
    rewardXp: 2.0,
    rewardItems: 3,
    modifier: 'stalker',
    tags: ['hunt', 'hoard'],
    failOn: ['markEscaped'],
    danger: 3,
  },
  {
    id: 'crucible',
    name: `The Crucible`,
    flavor: `An arena, cut deliberately, with drains. Somebody used to hold events here. The events did not stop when the audience did.`,
    minDepth: 6,
    weight: 55,
    objectives: [
      { kind: 'reach', filter: 'marker:arena', base: 1, perDepth: 0, desc: `Enter the pit` },
      { kind: 'survive', filter: 'zone:arena', base: 200, perDepth: 14, desc: `Last {n} seconds in it` },
      { kind: 'slayElite', filter: 'rank:elite', base: 3, perDepth: 0.3, desc: `Kill the {n} they send last` },
    ],
    rewardGold: 2.5,
    rewardXp: 2.4,
    rewardItems: 4,
    modifier: 'reinforcements',
    extraModifiers: ['cursedGround'],
    tags: ['endurance', 'gauntlet'],
    danger: 3,
  },
  {
    id: 'relic_run',
    name: `The Reliquary Run`,
    flavor: `Six fragments this time, and the drain is worse the more of them you hold. The reliquary was designed by somebody who wanted collection to hurt.`,
    minDepth: 7,
    weight: 55,
    objectives: [
      { kind: 'collect', filter: 'item:relic_fragment', base: 6, perDepth: 0.4, desc: `Bear {n} fragments` },
      { kind: 'slayElite', filter: 'named:champion', base: 4, perDepth: 0.4, desc: `Break {n} custodians` },
      { kind: 'reach', filter: 'marker:vault', base: 1, perDepth: 0, desc: `Set them in the reliquary` },
    ],
    rewardGold: 2.6,
    rewardXp: 2.3,
    rewardItems: 5,
    modifier: 'resistDrain',
    tags: ['hoard', 'cursed'],
    failOn: ['relicLost'],
    danger: 3,
  },
  {
    id: 'the_second_shift',
    name: `The Second Shift`,
    flavor: `The first shift died in the pour. The second shift is what the Works made to replace them, out of the pour, and it has never been stood down.`,
    minDepth: 7,
    weight: 50,
    biomes: ['foundry'],
    objectives: [
      { kind: 'cleanse', filter: 'prop:forge', base: 4, perDepth: 0.3, desc: `Bank {n} furnaces` },
      { kind: 'slay', filter: 'family:construct', base: 40, perDepth: 7, desc: `Break {n} of the shift` },
      { kind: 'survive', filter: 'zone:any', base: 120, perDepth: 9, desc: `Outlast the whistle — {n} seconds` },
    ],
    rewardGold: 2.3,
    rewardXp: 2.2,
    rewardItems: 4,
    modifier: 'reinforcements',
    tags: ['ritual', 'endurance'],
    danger: 3,
  },
  {
    id: 'nursery',
    name: `The Nursery`,
    flavor: `Do not linger in the nurseries. That is the whole of the advice and it is not compatible with the contract.`,
    minDepth: 8,
    weight: 50,
    biomes: ['hive'],
    objectives: [
      { kind: 'slay', filter: 'family:insect', base: 90, perDepth: 14, desc: `Clear {n} from the chambers` },
      { kind: 'slayElite', filter: 'rank:elite', base: 3, perDepth: 0.3, desc: `Kill {n} attendant mothers` },
      { kind: 'cleanse', filter: 'prop:nursery', base: 5, perDepth: 0.4, desc: `Burn {n} egg galleries` },
    ],
    rewardGold: 2.1,
    rewardXp: 2.4,
    rewardItems: 4,
    modifier: 'doubleSpawns',
    tags: ['combat', 'gauntlet'],
    danger: 3,
  },
  {
    id: 'the_frozen_ward',
    name: `The Frozen Ward`,
    flavor: `Five wards hold the Archive shut. Opening them is straightforward. Being warm while you do it is the difficulty.`,
    minDepth: 8,
    weight: 50,
    biomes: ['frostvault'],
    objectives: [
      { kind: 'cleanse', filter: 'prop:ward', base: 5, perDepth: 0.3, desc: `Thaw {n} wards` },
      { kind: 'survive', filter: 'zone:any', base: 160, perDepth: 11, desc: `Endure {n} seconds of the cold` },
    ],
    rewardGold: 2.2,
    rewardXp: 2.2,
    rewardItems: 3,
    modifier: 'noRegen',
    extraModifiers: ['thinAir'],
    tags: ['ritual', 'endurance'],
    failOn: ['wardBroken'],
    danger: 3,
  },
  {
    id: 'drowned_procession',
    name: `The Drowned Procession`,
    flavor: `Sister Ottilie wants to walk the old processional route to the sanctum. She has been told what is on the route. She has heard it and would like to go anyway.`,
    minDepth: 8,
    weight: 45,
    biomes: ['sunkenTemple'],
    objectives: [
      { kind: 'escort', filter: 'npc:sister_ottilie', base: 1, perDepth: 0, desc: `Walk Sister Ottilie to the sanctum` },
      { kind: 'cleanse', filter: 'prop:shrine', base: 3, perDepth: 0.3, desc: `Let her bless {n} stations` },
      { kind: 'slay', filter: 'any', base: 30, perDepth: 5, desc: `Clear {n} from the route` },
    ],
    rewardGold: 2.4,
    rewardXp: 2.3,
    rewardItems: 4,
    tags: ['escort', 'ritual'],
    failOn: ['escortDeath'],
    danger: 3,
  },
  {
    id: 'the_ledger',
    name: `The Ledger`,
    flavor: `Nine pages, scattered across the run by something that reads them in order and does not want them assembled.`,
    minDepth: 6,
    weight: 50,
    objectives: [
      { kind: 'collect', filter: 'item:ledger_page', base: 9, perDepth: 0.5, desc: `Assemble {n} pages` },
      { kind: 'slayElite', filter: 'rank:elite', base: 2, perDepth: 0.3, desc: `Take {n} from the ones reading them` },
    ],
    rewardGold: 2.3,
    rewardXp: 1.9,
    rewardItems: 3,
    tags: ['hoard', 'exploration'],
    danger: 2,
  },
  {
    id: 'blackened_pilgrimage',
    name: `Blackened Pilgrimage`,
    flavor: `Five stations, in order, across open ground, in falling ash. The pilgrims used to do it barefoot. The pilgrims are the ash.`,
    minDepth: 9,
    weight: 50,
    biomes: ['ashwaste'],
    objectives: [
      { kind: 'reach', filter: 'marker:survey', base: 5, perDepth: 0.4, desc: `Walk {n} stations` },
      { kind: 'cleanse', filter: 'prop:pyre', base: 3, perDepth: 0.3, desc: `Light {n} pyres` },
      { kind: 'slay', filter: 'any', base: 45, perDepth: 8, desc: `Clear {n} from the road` },
    ],
    rewardGold: 2.3,
    rewardXp: 2.3,
    rewardItems: 4,
    modifier: 'lowVisibility',
    tags: ['exploration', 'ritual'],
    danger: 3,
  },
  {
    id: 'starvation',
    name: `Starvation`,
    flavor: `Nothing on this tier will feed you, fund you or fix you. Bring what you need or come back for it.`,
    minDepth: 9,
    weight: 45,
    objectives: [
      { kind: 'slay', filter: 'any', base: 110, perDepth: 16, desc: `Grind through {n}` },
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Reach the descent still standing` },
    ],
    rewardGold: 3.2,
    rewardXp: 2.4,
    rewardItems: 5,
    modifier: 'famine',
    extraModifiers: ['noRegen'],
    tags: ['cursed', 'gauntlet'],
    danger: 3,
  },
  {
    id: 'the_gauntlet',
    name: `The Gauntlet`,
    flavor: `A number, a clock, and a door at the end. There is no subtlety in the design and none has ever been required.`,
    minDepth: 10,
    weight: 55,
    objectives: [
      { kind: 'slay', filter: 'any', base: 130, perDepth: 18, desc: `Cut through {n}` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Beat the door before the clock` },
    ],
    rewardGold: 2.8,
    rewardXp: 2.8,
    rewardItems: 5,
    modifier: 'timeLimit',
    extraModifiers: ['monsterHaste'],
    tags: ['gauntlet', 'boss'],
    failOn: ['timeExpired'],
    danger: 3,
  },
  {
    id: 'widowmaker',
    name: `Widowmaker`,
    flavor: `Eight elites is not a contract the watch issues. It is a contract the watch accepts, from people who have stopped listening to the watch.`,
    minDepth: 10,
    weight: 50,
    objectives: [
      { kind: 'slayElite', filter: 'rank:elite', base: 8, perDepth: 0.5, desc: `Break {n} elite packs` },
    ],
    rewardGold: 2.6,
    rewardXp: 2.7,
    rewardItems: 5,
    modifier: 'eliteFrenzy',
    extraModifiers: ['echoes'],
    tags: ['hunt', 'gauntlet'],
    danger: 3,
  },
  {
    id: 'hearthless',
    name: `Hearthless`,
    flavor: `No draught, no regeneration, no second wind. Whatever you have when you go through the door is what you finish with.`,
    minDepth: 6,
    weight: 45,
    objectives: [
      { kind: 'slay', filter: 'any', base: 40, perDepth: 7, desc: `Clear {n} on what you carried in` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Finish it dry` },
    ],
    rewardGold: 2.4,
    rewardXp: 2.6,
    rewardItems: 4,
    modifier: 'noPotions',
    extraModifiers: ['noRegen'],
    tags: ['cursed', 'boss'],
    failOn: ['potionUsed'],
    danger: 3,
  },
  {
    id: 'the_quiet_half',
    name: `The Quiet Half`,
    flavor: `It only ever shows you part of itself. The other part is doing something else, elsewhere, and has been all along.`,
    minDepth: 9,
    weight: 50,
    objectives: [
      { kind: 'slayElite', filter: 'named:mark', base: 2, perDepth: 0.1, desc: `Kill both halves — {n} of it` },
      { kind: 'collect', filter: 'item:trophy', base: 3, perDepth: 0.3, desc: `Take {n} of what it collected` },
    ],
    rewardGold: 2.5,
    rewardXp: 2.5,
    rewardItems: 4,
    modifier: 'stalker',
    extraModifiers: ['echoes'],
    tags: ['hunt'],
    failOn: ['markEscaped'],
    danger: 3,
  },
  {
    id: 'salt_and_iron',
    name: `Salt and Iron`,
    flavor: `Old method, still the best: salt the ground, iron the doors, and be somewhere else by the time it works out the counter.`,
    minDepth: 6,
    weight: 45,
    objectives: [
      { kind: 'cleanse', filter: 'prop:wardstone', base: 8, perDepth: 0.5, desc: `Lay {n} salt lines` },
      { kind: 'survive', filter: 'zone:any', base: 130, perDepth: 10, desc: `Hold {n} seconds after the last one` },
    ],
    rewardGold: 2.1,
    rewardXp: 2.1,
    rewardItems: 3,
    modifier: 'reinforcements',
    tags: ['ritual', 'endurance'],
    danger: 2,
  },
  {
    id: 'lightless_hunt',
    name: `The Lightless Hunt`,
    flavor: `It sees perfectly well down here and you do not, and it knows the difference, and it has arranged the evening accordingly.`,
    minDepth: 7,
    weight: 50,
    objectives: [
      { kind: 'slayElite', filter: 'named:mark', base: 1, perDepth: 0, desc: `Corner it in the dark` },
      { kind: 'slay', filter: 'any', base: 30, perDepth: 5, desc: `Kill {n} it drives at you` },
    ],
    rewardGold: 2.2,
    rewardXp: 2.5,
    rewardItems: 4,
    modifier: 'darkness',
    extraModifiers: ['stalker'],
    tags: ['hunt', 'cursed'],
    failOn: ['markEscaped', 'torchLost'],
    danger: 3,
  },

  // =========================================================================
  // BAND IV — depth 11-17. The contracts stop pretending to be reasonable.
  // =========================================================================
  {
    id: 'tally_of_nine',
    name: `The Tally of Nine`,
    flavor: `Nine stones, nine elites, ninety dead. The hand that keeps the tally changes every hundred marks and it has been keeping it a long time.`,
    minDepth: 11,
    weight: 55,
    objectives: [
      { kind: 'cleanse', filter: 'prop:seal', base: 9, perDepth: 0.3, desc: `Mark {n} tally stones` },
      { kind: 'slayElite', filter: 'rank:elite', base: 9, perDepth: 0.4, desc: `Add {n} elites to the count` },
      { kind: 'slay', filter: 'any', base: 90, perDepth: 12, desc: `Add {n} of the rest` },
    ],
    rewardGold: 2.8,
    rewardXp: 2.9,
    rewardItems: 5,
    modifier: 'eliteFrenzy',
    tags: ['ritual', 'gauntlet'],
    danger: 3,
  },
  {
    id: 'the_spire_survey',
    name: `The Spire Survey`,
    flavor: `Measurements are taken in duplicate by policy. The duplicates are compared. They have never agreed, and the survey continues, because the alternative is admitting why.`,
    minDepth: 12,
    weight: 55,
    biomes: ['voidspire'],
    objectives: [
      { kind: 'reach', filter: 'marker:survey', base: 6, perDepth: 0.4, desc: `Log {n} stations that will not stay put` },
      { kind: 'collect', filter: 'item:survey_page', base: 4, perDepth: 0.3, desc: `Record {n} readings` },
      { kind: 'slay', filter: 'family:aberration', base: 35, perDepth: 6, desc: `Clear {n} of what the geometry has produced` },
    ],
    rewardGold: 2.7,
    rewardXp: 2.8,
    rewardItems: 5,
    modifier: 'lowVisibility',
    tags: ['exploration', 'cursed'],
    danger: 3,
  },
  {
    id: 'unmaking',
    name: `Unmaking`,
    flavor: `They come apart loudly at this depth. Standing near the ending is nearly as bad as causing it.`,
    minDepth: 12,
    weight: 50,
    objectives: [
      { kind: 'cleanse', filter: 'prop:seal', base: 4, perDepth: 0.3, desc: `Undo {n} bindings` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Unmake what they bound` },
    ],
    rewardGold: 2.9,
    rewardXp: 2.9,
    rewardItems: 5,
    modifier: 'volatile',
    tags: ['boss', 'cursed'],
    danger: 3,
  },
  {
    id: 'carrion_tide',
    name: `Carrion Tide`,
    flavor: `They do not stop arriving. That is not a figure of speech and it is not a difficulty setting. It is a description of the tide.`,
    minDepth: 13,
    weight: 55,
    objectives: [
      { kind: 'survive', filter: 'zone:any', base: 260, perDepth: 16, desc: `Stand in it {n} seconds` },
      { kind: 'slay', filter: 'any', base: 140, perDepth: 18, desc: `Take {n} down with you` },
    ],
    rewardGold: 2.8,
    rewardXp: 3.0,
    rewardItems: 5,
    modifier: 'doubleSpawns',
    extraModifiers: ['reinforcements'],
    tags: ['endurance', 'gauntlet'],
    danger: 3,
  },
  {
    id: 'the_last_expedition',
    name: `The Last Expedition`,
    flavor: `Ashka of the Third has been down here since before you could walk, and she has finally agreed to be brought up, on the condition that you come the long way with her.`,
    minDepth: 14,
    weight: 50,
    objectives: [
      { kind: 'escort', filter: 'npc:ashka', base: 1, perDepth: 0, desc: `Bring Ashka up alive` },
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Get her to the stair` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Kill the thing that has kept her` },
    ],
    rewardGold: 3.2,
    rewardXp: 3.0,
    rewardItems: 6,
    tags: ['escort', 'boss'],
    failOn: ['escortDeath'],
    danger: 3,
  },
  {
    id: 'bone_census',
    name: `The Greater Census`,
    flavor: `The tiers have residents the catalogue never had. Count them. Marrow will cut the numbers into the wall himself and he wants them right.`,
    minDepth: 11,
    weight: 45,
    objectives: [
      { kind: 'collect', filter: 'item:census_skull', base: 26, perDepth: 2.0, desc: `Tally {n} of the uncatalogued` },
      { kind: 'slay', filter: 'family:undead', base: 70, perDepth: 10, desc: `Reduce the population by {n}` },
    ],
    rewardGold: 2.6,
    rewardXp: 2.5,
    rewardItems: 4,
    tags: ['hoard', 'combat'],
    danger: 2,
  },
  {
    id: 'the_cold_room',
    name: `The Cold Room`,
    flavor: `There is a room in the Archive that is colder than the Archive, and the difference is maintained by something that lives in it.`,
    minDepth: 13,
    weight: 50,
    biomes: ['frostvault'],
    objectives: [
      { kind: 'survive', filter: 'zone:any', base: 220, perDepth: 14, desc: `Keep warm for {n} seconds` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Meet the room's tenant` },
    ],
    rewardGold: 2.9,
    rewardXp: 3.0,
    rewardItems: 5,
    modifier: 'resistDrain',
    extraModifiers: ['noRegen'],
    tags: ['endurance', 'boss'],
    danger: 3,
  },
  {
    id: 'forgeheart',
    name: `Forgeheart`,
    flavor: `Five cores drive the Works. Removing them is possible. Removing them while the Works are running is what the fee is for.`,
    minDepth: 14,
    weight: 50,
    biomes: ['foundry'],
    objectives: [
      { kind: 'collect', filter: 'item:forge_core', base: 5, perDepth: 0.3, desc: `Draw {n} cores` },
      { kind: 'cleanse', filter: 'prop:forge', base: 5, perDepth: 0.3, desc: `Bank {n} furnaces first` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Answer the foreman` },
    ],
    rewardGold: 3.4,
    rewardXp: 3.0,
    rewardItems: 6,
    modifier: 'volatile',
    tags: ['hoard', 'boss'],
    danger: 3,
  },
  {
    id: 'the_uninvited_guest',
    name: `The Uninvited Guest`,
    flavor: `It has escaped you twice and it is not the same size it was. Nothing about this arrangement is accidental. It has been eating on the way down.`,
    minDepth: 15,
    weight: 55,
    objectives: [
      { kind: 'slayElite', filter: 'named:mark', base: 3, perDepth: 0.1, desc: `Corner it {n} times. It only dies on the last` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Then deal with what it was running from` },
    ],
    rewardGold: 3.2,
    rewardXp: 3.2,
    rewardItems: 6,
    modifier: 'stalker',
    extraModifiers: ['eliteFrenzy'],
    tags: ['hunt', 'boss'],
    failOn: ['markEscaped'],
    danger: 3,
  },
  {
    id: 'black_liturgy',
    name: `The Black Liturgy`,
    flavor: `Twelve responses, two hundred voices, one service. It has been running without interruption since the tiers were sealed and it would like to be interrupted.`,
    minDepth: 16,
    weight: 50,
    biomes: ['crypt', 'sunkenTemple'],
    objectives: [
      { kind: 'cleanse', filter: 'prop:shrine', base: 12, perDepth: 0.4, desc: `Break {n} responses` },
      { kind: 'slay', filter: 'family:undead', base: 160, perDepth: 20, desc: `Disperse {n} of the congregation` },
    ],
    rewardGold: 3.0,
    rewardXp: 3.1,
    rewardItems: 5,
    modifier: 'shrinesHostile',
    extraModifiers: ['sanguine'],
    tags: ['ritual', 'gauntlet'],
    danger: 3,
  },
  {
    id: 'lightless_descent',
    name: `Lightless Descent`,
    flavor: `Every tier of this run is dark. Not unlit — dark, in the way the drunk means when he says the dark has a grain to it.`,
    minDepth: 15,
    weight: 50,
    objectives: [
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Find every descent by carried light` },
      { kind: 'slay', filter: 'any', base: 80, perDepth: 12, desc: `Kill {n} you never properly see` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Finish it in the dark` },
    ],
    rewardGold: 3.1,
    rewardXp: 3.3,
    rewardItems: 6,
    modifier: 'darkness',
    extraModifiers: ['lowVisibility', 'fragile'],
    tags: ['cursed', 'boss'],
    failOn: ['torchLost'],
    danger: 3,
  },
  {
    id: 'the_wager',
    name: `The Wager`,
    flavor: `Hesk will not take the bet. Corvane will, and has drawn up terms, and has been unpleasantly cheerful about the odds.`,
    minDepth: 16,
    weight: 45,
    objectives: [
      { kind: 'slay', filter: 'any', base: 90, perDepth: 14, desc: `Clear {n} undosed and unguarded` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Collect on the wager` },
    ],
    rewardGold: 4.0,
    rewardXp: 3.4,
    rewardItems: 7,
    modifier: 'noPotions',
    extraModifiers: ['fragile', 'noRegen'],
    tags: ['cursed', 'boss'],
    failOn: ['potionUsed'],
    danger: 3,
  },
  {
    id: 'the_hollow_court',
    name: `The Hollow Court`,
    flavor: `A court, a claimant, and a room that has been arranged for the succession. You are not on the guest list, which simplifies matters.`,
    minDepth: 12,
    weight: 50,
    objectives: [
      { kind: 'slayElite', filter: 'rank:elite', base: 6, perDepth: 0.4, desc: `Unseat {n} of the court` },
      { kind: 'survive', filter: 'zone:arena', base: 150, perDepth: 10, desc: `Hold the hall {n} seconds` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Settle the succession` },
    ],
    rewardGold: 3.0,
    rewardXp: 3.1,
    rewardItems: 6,
    modifier: 'echoes',
    tags: ['boss', 'gauntlet'],
    danger: 3,
  },
  {
    id: 'salvage_rights',
    name: `Salvage Rights`,
    flavor: `Nine expeditions were chartered. Three came back. The other six are still down there in an administrative sense, and their gear is legally the town's.`,
    minDepth: 11,
    weight: 45,
    objectives: [
      { kind: 'collect', filter: 'item:delvers_pack', base: 5, perDepth: 0.4, desc: `Recover {n} expedition packs` },
      { kind: 'slayElite', filter: 'rank:elite', base: 3, perDepth: 0.3, desc: `Take them off {n} current owners` },
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Bring the lot up` },
    ],
    rewardGold: 3.6,
    rewardXp: 2.4,
    rewardItems: 6,
    modifier: 'famine',
    tags: ['hoard', 'exploration'],
    danger: 2,
  },
  {
    id: 'the_thaw',
    name: `The Thaw`,
    flavor: `Something has decided the Archive should be warmer. The Archive disagrees. You are the argument.`,
    minDepth: 13,
    weight: 45,
    biomes: ['frostvault', 'ashwaste'],
    objectives: [
      { kind: 'cleanse', filter: 'prop:ward', base: 7, perDepth: 0.4, desc: `Re-freeze {n} wards` },
      { kind: 'slay', filter: 'family:elemental', base: 55, perDepth: 9, desc: `Disperse {n} of what got in` },
      { kind: 'survive', filter: 'zone:any', base: 150, perDepth: 10, desc: `Hold {n} seconds against the melt` },
    ],
    rewardGold: 2.7,
    rewardXp: 2.9,
    rewardItems: 5,
    modifier: 'volatile',
    tags: ['ritual', 'endurance'],
    failOn: ['wardBroken'],
    danger: 3,
  },

  // =========================================================================
  // BAND V — depth 18+. Nobody sane accepts these.
  // =========================================================================
  {
    id: 'thricebound',
    name: `Thricebound`,
    flavor: `They come back. Not all of them and not all the way, but enough that the count you are given is optimistic and everybody knows it.`,
    minDepth: 18,
    weight: 55,
    objectives: [
      { kind: 'slayElite', filter: 'rank:elite', base: 12, perDepth: 0.5, desc: `Put {n} elites down and keep them down` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Finish the one that binds them` },
    ],
    rewardGold: 3.4,
    rewardXp: 3.6,
    rewardItems: 7,
    modifier: 'echoes',
    extraModifiers: ['eliteFrenzy'],
    tags: ['hunt', 'boss'],
    danger: 3,
  },
  {
    id: 'architects_survey',
    name: `The Architect's Survey`,
    flavor: `It drove the Spire into the world from outside and it has been taking measurements ever since, apparently for a second one. The measurements would be worth having.`,
    minDepth: 20,
    weight: 55,
    biomes: ['voidspire'],
    objectives: [
      { kind: 'reach', filter: 'marker:survey', base: 8, perDepth: 0.4, desc: `Reach {n} of its stations` },
      { kind: 'collect', filter: 'item:survey_page', base: 6, perDepth: 0.3, desc: `Steal {n} of its figures` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Interrupt the survey` },
    ],
    rewardGold: 3.8,
    rewardXp: 3.8,
    rewardItems: 8,
    modifier: 'volatile',
    extraModifiers: ['lowVisibility'],
    tags: ['exploration', 'boss'],
    danger: 3,
  },
  {
    id: 'the_endless_tally',
    name: `The Endless Tally`,
    flavor: `The hand keeping the count has changed four thousand times. The count has not restarted once.`,
    minDepth: 22,
    weight: 50,
    objectives: [
      { kind: 'slay', filter: 'any', base: 320, perDepth: 26, desc: `Add {n} to the tally` },
      { kind: 'cleanse', filter: 'prop:seal', base: 12, perDepth: 0.4, desc: `Cut {n} marks in the wall` },
    ],
    rewardGold: 3.6,
    rewardXp: 3.9,
    rewardItems: 7,
    modifier: 'monsterHaste',
    extraModifiers: ['doubleSpawns'],
    tags: ['gauntlet', 'combat'],
    danger: 3,
  },
  {
    id: 'nothing_wasted',
    name: `Nothing Wasted`,
    flavor: `Twelve fragments. Every one you carry takes something out of you and gives it to the reliquary, which is the point, and was always the point.`,
    minDepth: 20,
    weight: 50,
    objectives: [
      { kind: 'collect', filter: 'item:relic_fragment', base: 12, perDepth: 0.5, desc: `Bear {n} fragments at once` },
      { kind: 'slayElite', filter: 'named:champion', base: 8, perDepth: 0.4, desc: `Break {n} custodians` },
      { kind: 'reach', filter: 'marker:vault', base: 1, perDepth: 0, desc: `Set the reliquary complete` },
    ],
    rewardGold: 4.0,
    rewardXp: 3.6,
    rewardItems: 8,
    modifier: 'resistDrain',
    extraModifiers: ['fragile'],
    tags: ['hoard', 'cursed'],
    failOn: ['relicLost'],
    danger: 3,
  },
  {
    id: 'the_long_patience',
    name: `The Long Patience`,
    flavor: `Ten minutes, held, in one room, at this depth. The arithmetic is simple. Doing the arithmetic is not the difficult part.`,
    minDepth: 24,
    weight: 50,
    objectives: [
      { kind: 'cleanse', filter: 'prop:shrine', base: 1, perDepth: 0, desc: `Wake the stone` },
      { kind: 'survive', filter: 'zone:shrine', base: 480, perDepth: 20, desc: `Hold the light {n} seconds` },
      { kind: 'slayElite', filter: 'rank:elite', base: 6, perDepth: 0.4, desc: `Break the {n} they send to end it` },
    ],
    rewardGold: 4.0,
    rewardXp: 4.0,
    rewardItems: 8,
    modifier: 'reinforcements',
    extraModifiers: ['cursedGround', 'noRegen'],
    tags: ['endurance', 'gauntlet'],
    failOn: ['shrineLost'],
    danger: 3,
  },
  {
    id: 'all_debts',
    name: `All Debts`,
    flavor: `Corvane's standing arrangement, invoked. Everything owed by everyone who went down and did not come up, collected in one descent, by you, tonight.`,
    minDepth: 25,
    weight: 50,
    objectives: [
      { kind: 'collect', filter: 'item:ledger_page', base: 12, perDepth: 0.5, desc: `Recover {n} pages of the ledger` },
      { kind: 'slayElite', filter: 'rank:elite', base: 10, perDepth: 0.5, desc: `Collect from {n} debtors` },
      { kind: 'survive', filter: 'zone:any', base: 300, perDepth: 16, desc: `Stay solvent {n} seconds` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Settle the principal` },
    ],
    rewardGold: 5.0,
    rewardXp: 4.2,
    rewardItems: 9,
    modifier: 'noRegen',
    extraModifiers: ['eliteFrenzy', 'sanguine'],
    tags: ['boss', 'gauntlet', 'hoard'],
    danger: 3,
  },
  {
    id: 'one_room_further',
    name: `One Room Further`,
    flavor: `The wall in town has four hundred and seven names on it and most of them died going one room further. This contract is that room, formalised.`,
    minDepth: 28,
    weight: 50,
    objectives: [
      { kind: 'reach', filter: 'marker:deep', base: 1, perDepth: 0, desc: `Find the room past the last room` },
      { kind: 'slay', filter: 'any', base: 200, perDepth: 22, desc: `Clear {n} on the way` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Come back out through what is in it` },
    ],
    rewardGold: 4.6,
    rewardXp: 4.4,
    rewardItems: 9,
    modifier: 'fragile',
    extraModifiers: ['monsterHaste', 'darkness'],
    tags: ['boss', 'exploration'],
    danger: 3,
  },
  {
    id: 'the_bottom',
    name: `The Bottom`,
    flavor: `They say the deep is endless. What they mean is that nobody has come back from the bottom to correct them. Correct them.`,
    minDepth: 30,
    weight: 45,
    objectives: [
      { kind: 'reach', filter: 'marker:deep', base: 1, perDepth: 0, desc: `Reach the floor of the tier` },
      { kind: 'slayElite', filter: 'rank:elite', base: 12, perDepth: 0.6, desc: `Break {n} of what is stationed there` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Kill whatever the bottom keeps` },
    ],
    rewardGold: 5.5,
    rewardXp: 4.8,
    rewardItems: 10,
    modifier: 'volatile',
    extraModifiers: ['doubleSpawns', 'noRegen', 'fragile'],
    tags: ['boss', 'gauntlet'],
    danger: 3,
  },
  {
    id: 'the_last_watch',
    name: `The Last Watch`,
    flavor: `Warden-Emeritus Holt is ninety-one and has asked to be taken down to where his watch died so that he can stand the shift out. He has been refused eleven times.`,
    minDepth: 19,
    weight: 45,
    objectives: [
      { kind: 'escort', filter: 'npc:holt', base: 1, perDepth: 0, desc: `Take Holt down to his post` },
      { kind: 'survive', filter: 'zone:shrine', base: 240, perDepth: 14, desc: `Stand the watch with him — {n} seconds` },
      { kind: 'slayElite', filter: 'rank:elite', base: 5, perDepth: 0.4, desc: `Break {n} that come for him` },
    ],
    rewardGold: 3.8,
    rewardXp: 3.8,
    rewardItems: 7,
    modifier: 'reinforcements',
    tags: ['escort', 'endurance'],
    failOn: ['escortDeath'],
    danger: 3,
  },
  {
    id: 'the_quiet_year',
    name: `The Quiet Year`,
    flavor: `The Listener says the deep goes quiet eleven days a year. It is quiet now. She has advised against going. She has also drawn you a map.`,
    minDepth: 21,
    weight: 45,
    objectives: [
      { kind: 'reach', filter: 'marker:survey', base: 5, perDepth: 0.3, desc: `Reach {n} points on her map` },
      { kind: 'slay', filter: 'any', base: 60, perDepth: 10, desc: `Kill the {n} that break the quiet` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Find out what the silence was for` },
    ],
    rewardGold: 3.6,
    rewardXp: 3.7,
    rewardItems: 7,
    modifier: 'lowVisibility',
    extraModifiers: ['timeLimit'],
    tags: ['exploration', 'boss'],
    failOn: ['timeExpired'],
    danger: 3,
  },
  {
    id: 'blood_for_the_pour',
    name: `Blood for the Pour`,
    flavor: `The Works never stopped needing material. It has been meeting the requirement locally for four hundred years and it has never once been short.`,
    minDepth: 18,
    weight: 45,
    biomes: ['foundry', 'ashwaste'],
    objectives: [
      { kind: 'cleanse', filter: 'prop:forge', base: 8, perDepth: 0.4, desc: `Bank {n} furnaces` },
      { kind: 'slay', filter: 'any', base: 150, perDepth: 18, desc: `Deny it {n} inputs` },
      { kind: 'survive', filter: 'zone:any', base: 200, perDepth: 12, desc: `Outlast the pour — {n} seconds` },
    ],
    rewardGold: 3.7,
    rewardXp: 3.5,
    rewardItems: 6,
    modifier: 'volatile',
    extraModifiers: ['reinforcements'],
    tags: ['ritual', 'gauntlet'],
    danger: 3,
  },
  {
    id: 'the_uncatalogued',
    name: `The Uncatalogued`,
    flavor: `The bestiary is maintained by four people, none of whom have seen most of it. Bring them something the book does not have.`,
    minDepth: 17,
    weight: 45,
    objectives: [
      { kind: 'slayElite', filter: 'rank:elite', base: 7, perDepth: 0.4, desc: `Document {n} unlisted elites` },
      { kind: 'collect', filter: 'item:trophy', base: 7, perDepth: 0.4, desc: `Bring back {n} specimens` },
    ],
    rewardGold: 3.2,
    rewardXp: 3.4,
    rewardItems: 6,
    modifier: 'eliteFrenzy',
    tags: ['hunt', 'hoard'],
    danger: 3,
  },
  {
    id: 'held_against_the_dark',
    name: `Held Against the Dark`,
    flavor: `One shrine, no light, no draughts, and everything on the tier walking toward the only thing still burning.`,
    minDepth: 18,
    weight: 45,
    objectives: [
      { kind: 'cleanse', filter: 'prop:shrine', base: 1, perDepth: 0, desc: `Light the last shrine` },
      { kind: 'survive', filter: 'zone:shrine', base: 300, perDepth: 18, desc: `Keep it lit {n} seconds` },
    ],
    rewardGold: 3.6,
    rewardXp: 3.8,
    rewardItems: 7,
    modifier: 'darkness',
    extraModifiers: ['noPotions', 'reinforcements'],
    tags: ['endurance', 'cursed'],
    failOn: ['shrineLost', 'potionUsed'],
    danger: 3,
  },
  {
    id: 'the_second_spire',
    name: `The Second Spire`,
    flavor: `The measurements were for another one. It is being built. It is being built here, out of here, and the work is well advanced.`,
    minDepth: 26,
    weight: 45,
    biomes: ['voidspire'],
    objectives: [
      { kind: 'cleanse', filter: 'prop:seal', base: 9, perDepth: 0.4, desc: `Break {n} of the new foundations` },
      { kind: 'slay', filter: 'family:aberration', base: 90, perDepth: 14, desc: `Clear {n} of the workforce` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Stop the architect` },
    ],
    rewardGold: 4.4,
    rewardXp: 4.4,
    rewardItems: 9,
    modifier: 'volatile',
    extraModifiers: ['thinAir', 'cursedGround'],
    tags: ['boss', 'ritual'],
    danger: 3,
  },
  {
    id: 'gold_and_grief',
    name: `Gold and Grief`,
    flavor: `The tier is rich tonight in the way a trap is baited. Corvane has advanced you nothing and expects a return regardless.`,
    minDepth: 12,
    weight: 45,
    objectives: [
      { kind: 'cleanse', filter: 'prop:chest', base: 10, perDepth: 0.6, desc: `Empty {n} caches` },
      { kind: 'slay', filter: 'tagged:guardian', base: 10, perDepth: 0.6, desc: `Answer the {n} that come with them` },
      { kind: 'reach', filter: 'marker:exit', base: 1, perDepth: 0, desc: `Get the haul out` },
    ],
    rewardGold: 4.5,
    rewardXp: 2.4,
    rewardItems: 6,
    modifier: 'goldRush',
    extraModifiers: ['chestGuardians'],
    tags: ['hoard', 'gauntlet'],
    danger: 3,
  },
  {
    id: 'the_understudy',
    name: `The Understudy`,
    flavor: `Something down here has been learning your habits. It has your footwork, roughly, and your opening, exactly.`,
    minDepth: 17,
    weight: 45,
    objectives: [
      { kind: 'slayElite', filter: 'named:mark', base: 1, perDepth: 0, desc: `Kill the thing that fights like you` },
      { kind: 'survive', filter: 'zone:any', base: 180, perDepth: 12, desc: `Survive {n} seconds of yourself` },
      { kind: 'slay', filter: 'any', base: 70, perDepth: 11, desc: `Clear {n} of what it has taught` },
    ],
    rewardGold: 3.4,
    rewardXp: 3.6,
    rewardItems: 7,
    modifier: 'stalker',
    extraModifiers: ['echoes'],
    tags: ['hunt', 'endurance'],
    failOn: ['markEscaped'],
    danger: 3,
  },
  {
    id: 'the_full_measure',
    name: `The Full Measure`,
    flavor: `Everything at once, because at this depth there is no longer any point in separating the contracts.`,
    minDepth: 32,
    weight: 40,
    objectives: [
      { kind: 'slay', filter: 'any', base: 260, perDepth: 24, desc: `Clear {n}` },
      { kind: 'slayElite', filter: 'rank:elite', base: 14, perDepth: 0.6, desc: `Break {n} elites` },
      { kind: 'collect', filter: 'item:relic_fragment', base: 8, perDepth: 0.4, desc: `Bear {n} fragments` },
      { kind: 'cleanse', filter: 'prop:seal', base: 8, perDepth: 0.4, desc: `Break {n} seals` },
      { kind: 'survive', filter: 'zone:any', base: 360, perDepth: 18, desc: `Last {n} seconds` },
      { kind: 'boss', filter: 'boss:any', base: 1, perDepth: 0, desc: `Finish it` },
    ],
    rewardGold: 6.0,
    rewardXp: 5.2,
    rewardItems: 12,
    modifier: 'fragile',
    extraModifiers: ['noRegen', 'eliteFrenzy', 'doubleSpawns', 'resistDrain'],
    tags: ['boss', 'gauntlet', 'cursed'],
    failOn: ['relicLost'],
    danger: 3,
  },
];

// ---------------------------------------------------------------------------
// Indices
// ---------------------------------------------------------------------------

const BY_ID = new Map<string, QuestDefEx>();
for (const q of QUESTS) BY_ID.set(q.id, q);

export function questById(id: string): QuestDefEx | undefined {
  return BY_ID.get(id);
}

/** Quests that can ever be offered at this depth, ignoring biome. */
export function questsForDepth(depth: number): QuestDefEx[] {
  return QUESTS.filter((q) => depth >= q.minDepth && (q.maxDepth === undefined || depth <= q.maxDepth));
}

/** Every distinct objective kind the catalogue uses — sanity for tests. */
export function catalogueCoverage(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const q of QUESTS) {
    for (const o of q.objectives) counts[o.kind] = (counts[o.kind] ?? 0) + 1;
  }
  return counts;
}

/** Total catalogue size, exported so the quest log can show a completion tally. */
export const QUEST_COUNT = QUESTS.length;
