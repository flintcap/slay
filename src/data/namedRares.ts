/**
 * SLAY — named rares.
 *
 * A floor full of "Frenzied Skeleton" and "Vampiric Ghoul" has variety on
 * paper and none in memory: the names are generated, so nothing that happens on
 * one floor is a thing that happened rather than a thing that happens.
 *
 * A named rare is a specific monster with a specific name, a title, and a
 * signature trick it always has. It is uncommon by design — you should be able
 * to tell someone you met the Choirmaster and have that mean something — and it
 * is always worth stopping for, because the affixes are fixed rather than rolled
 * and the loot is better.
 *
 * Nothing here is a new monster. Each one is an existing bestiary entry wearing
 * a name, which is what keeps the roster honest: a named rare fights like the
 * thing it is, only harder and with one idea of its own.
 */

import type { BiomeId, MonsterFamily } from '../types';

export interface NamedRare {
  id: string;
  /** The name on the plate. No rank prefix is added to it. */
  name: string;
  /** One line, shown on the plate under the name. */
  title: string;
  /**
   * Which bestiary entry it is. When absent, any monster of `family` will do,
   * which lets one name cover a whole family across several biomes.
   */
  monsterId?: string;
  family?: MonsterFamily;
  /** Biomes it can appear in. Empty means anywhere its monster appears. */
  biomes?: BiomeId[];
  minDepth: number;
  weight: number;
  /** Always has these, on top of whatever the pack rolled. */
  affixes: string[];
  /** Multipliers on top of the rare rank's own. */
  lifeMul: number;
  damageMul: number;
}

export const NAMED_RARES: NamedRare[] = [
  // --- crypt -------------------------------------------------------------
  {
    id: 'named.choirmaster',
    name: 'The Choirmaster',
    title: 'Still Counting the Dead',
    family: 'undead',
    biomes: ['crypt'],
    minDepth: 1,
    weight: 10,
    affixes: ['summoner', 'arcaneWard'],
    lifeMul: 1.5,
    damageMul: 1.15,
  },
  {
    id: 'named.gravewarden',
    name: 'Ossuar, the Gravewarden',
    title: 'He Files the Bones',
    family: 'undead',
    biomes: ['crypt', 'frostvault'],
    minDepth: 3,
    weight: 8,
    affixes: ['juggernaut', 'reflective'],
    lifeMul: 2.1,
    damageMul: 1.1,
  },
  {
    id: 'named.hollowbride',
    name: 'The Hollow Bride',
    title: 'She Waited Too Long',
    family: 'undead',
    minDepth: 6,
    weight: 6,
    affixes: ['vampiric', 'frenzied'],
    lifeMul: 1.6,
    damageMul: 1.35,
  },

  // --- caverns / hive ----------------------------------------------------
  {
    id: 'named.deepmother',
    name: 'The Deep Mother',
    title: 'Everything Down Here Is Hers',
    family: 'insect',
    biomes: ['caverns', 'hive'],
    minDepth: 2,
    weight: 10,
    affixes: ['summoner', 'poisonous'],
    lifeMul: 1.9,
    damageMul: 1.1,
  },
  {
    id: 'named.stonefather',
    name: 'Old Stonefather',
    title: 'Older Than The Cave',
    family: 'beast',
    biomes: ['caverns'],
    minDepth: 3,
    weight: 8,
    affixes: ['juggernaut', 'entangling'],
    lifeMul: 2.4,
    damageMul: 1.2,
  },
  {
    id: 'named.rotcrown',
    name: 'Rotcrown',
    title: 'It Grew Where Something Died',
    family: 'plant',
    biomes: ['caverns', 'hive'],
    minDepth: 5,
    weight: 7,
    affixes: ['poisonous', 'shielded'],
    lifeMul: 1.7,
    damageMul: 1.25,
  },

  // --- foundry -----------------------------------------------------------
  {
    id: 'named.bellowsknight',
    name: 'The Bellows Knight',
    title: 'Sealed In And Still Working',
    family: 'construct',
    biomes: ['foundry'],
    minDepth: 2,
    weight: 10,
    affixes: ['fireEnchanted', 'juggernaut'],
    lifeMul: 2.2,
    damageMul: 1.2,
  },
  {
    id: 'named.slagtongue',
    name: 'Slagtongue',
    title: 'It Speaks And The Floor Melts',
    family: 'demon',
    biomes: ['foundry', 'ashwaste'],
    minDepth: 5,
    weight: 8,
    affixes: ['fireEnchanted', 'explosive'],
    lifeMul: 1.5,
    damageMul: 1.45,
  },

  // --- sunken temple -----------------------------------------------------
  {
    id: 'named.tidewarden',
    name: 'The Tidewarden',
    title: 'He Holds The Door For The Sea',
    family: 'humanoid',
    biomes: ['sunkenTemple'],
    minDepth: 3,
    weight: 10,
    affixes: ['coldEnchanted', 'shielded'],
    lifeMul: 1.8,
    damageMul: 1.2,
  },
  {
    id: 'named.pale',
    name: 'The Pale Congregation',
    title: 'They Answer As One',
    family: 'aberration',
    biomes: ['sunkenTemple', 'voidspire'],
    minDepth: 6,
    weight: 7,
    affixes: ['summoner', 'teleporter'],
    lifeMul: 1.4,
    damageMul: 1.3,
  },

  // --- frostvault --------------------------------------------------------
  {
    id: 'named.longwinter',
    name: 'Long Winter',
    title: 'It Has Not Finished Arriving',
    family: 'elemental',
    biomes: ['frostvault'],
    minDepth: 7,
    weight: 10,
    affixes: ['coldEnchanted', 'entangling'],
    lifeMul: 2.0,
    damageMul: 1.3,
  },
  {
    id: 'named.rimehound',
    name: 'The Rime Pack Alpha',
    title: 'It Eats Last',
    family: 'beast',
    biomes: ['frostvault'],
    minDepth: 8,
    weight: 8,
    affixes: ['fast', 'frenzied'],
    lifeMul: 1.4,
    damageMul: 1.4,
  },

  // --- ashwaste ----------------------------------------------------------
  {
    id: 'named.emberking',
    name: 'The Ember King',
    title: 'His Kingdom Burned First',
    family: 'demon',
    biomes: ['ashwaste'],
    minDepth: 10,
    weight: 10,
    affixes: ['fireEnchanted', 'frenzied', 'explosive'],
    lifeMul: 2.0,
    damageMul: 1.4,
  },
  {
    id: 'named.dustwidow',
    name: 'The Dust Widow',
    title: 'She Is What The Wind Is Carrying',
    family: 'undead',
    biomes: ['ashwaste', 'voidspire'],
    minDepth: 12,
    weight: 7,
    affixes: ['teleporter', 'vampiric'],
    lifeMul: 1.5,
    damageMul: 1.45,
  },

  // --- voidspire ---------------------------------------------------------
  {
    id: 'named.unmaker',
    name: 'The Unmaker',
    title: 'It Is Undoing This Floor',
    family: 'aberration',
    biomes: ['voidspire'],
    minDepth: 14,
    weight: 10,
    affixes: ['arcaneWard', 'teleporter', 'reflective'],
    lifeMul: 2.2,
    damageMul: 1.5,
  },
  {
    id: 'named.lastecho',
    name: 'The Last Echo',
    title: 'Somebody Screamed Here Once',
    family: 'undead',
    biomes: ['voidspire'],
    minDepth: 16,
    weight: 8,
    affixes: ['summoner', 'arcaneWard'],
    lifeMul: 1.7,
    damageMul: 1.4,
  },
];

const BY_ID = new Map<string, NamedRare>();
for (const n of NAMED_RARES) BY_ID.set(n.id, n);

export function namedRare(id: string): NamedRare | null {
  return BY_ID.get(id) ?? null;
}

/**
 * The named rares that could stand in for this monster, here, at this depth.
 *
 * Matching on family rather than a single monster id is what keeps them from
 * being a lottery: whatever the floor's pool happened to roll, there is usually
 * a name that fits it, so a named rare is a thing that shows up rather than a
 * thing you have to be lucky twice for.
 */
export function namedRaresFor(
  family: MonsterFamily,
  monsterId: string,
  biome: BiomeId,
  depth: number,
): NamedRare[] {
  return NAMED_RARES.filter((n) => {
    if (n.minDepth > depth) return false;
    if (n.monsterId && n.monsterId !== monsterId) return false;
    if (!n.monsterId && n.family !== family) return false;
    if (n.biomes && n.biomes.length > 0 && !n.biomes.includes(biome)) return false;
    return true;
  });
}
