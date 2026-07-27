/**
 * SLAY — crafting materials.
 *
 * Materials are the second currency. Gold is abundant and buys *access*;
 * materials are scarce and buy *power*. Every material has a defined faucet
 * (which monster ranks drop it, at what depth) and a defined sink (which
 * crafting recipes and upgrade tiers consume it), so the economy can be tuned
 * from this one file.
 *
 * Tier bands, roughly by depth:
 *   1  depth  1-15   common trash, drops from everything
 *   2  depth 12-35   uncommon, champions and up
 *   3  depth 30-60   rare, elites and up
 *   4  depth 55-85   very rare, rare packs and bosses
 *   5  depth 80+     chase, bosses only
 */

import type { ItemRarity, MonsterRank } from '../types';

export type MaterialKind = 'dust' | 'essence' | 'shard' | 'catalyst' | 'reagent' | 'core';

export interface MaterialDef {
  id: string;
  name: string;
  kind: MaterialKind;
  /** 1..5. Gates which recipes and which blacksmith upgrade tiers accept it. */
  tier: number;
  desc: string;
  /** Chip colour in the UI and tint of the drop mote. */
  color: number;
  /** Gold value of one unit when sold. */
  value: number;
  stackMax: number;
  /** Depth at which this starts appearing in drop tables. */
  minDepth: number;
  /** Depth past which it stops rolling as a raw drop (still craftable). */
  maxDepth?: number;
  /** Relative weight inside its tier band. */
  weight: number;
  /** Monster ranks whose drop table includes it. */
  sources: MonsterRank[];
  /** Salvaging an item of one of these rarities can yield it. */
  salvageFrom?: ItemRarity[];
}

const ALL_RANKS: MonsterRank[] = ['normal', 'champion', 'elite', 'rare', 'boss'];
const CHAMP_UP: MonsterRank[] = ['champion', 'elite', 'rare', 'boss'];
const ELITE_UP: MonsterRank[] = ['elite', 'rare', 'boss'];
const RARE_UP: MonsterRank[] = ['rare', 'boss'];
const BOSS_ONLY: MonsterRank[] = ['boss'];

export const MATERIALS: MaterialDef[] = [
  // --- Tier 1 — the floor of the economy -----------------------------------
  {
    id: 'dust.grave',
    name: 'Grave Dust',
    kind: 'dust',
    tier: 1,
    desc: 'Powdered bone and dry rot. Every corpse in the dark leaves a little.',
    color: 0x9a9382,
    value: 4,
    stackMax: 999,
    minDepth: 1,
    weight: 120,
    sources: ALL_RANKS,
    salvageFrom: ['normal', 'magic'],
  },
  {
    id: 'shard.iron',
    name: 'Iron Shard',
    kind: 'shard',
    tier: 1,
    desc: 'Broken weapon metal, still holding an edge somewhere in the pile.',
    color: 0x8f9096,
    value: 5,
    stackMax: 999,
    minDepth: 1,
    weight: 110,
    sources: ALL_RANKS,
    salvageFrom: ['normal', 'magic'],
  },
  {
    id: 'reagent.hide',
    name: 'Cured Hide',
    kind: 'reagent',
    tier: 1,
    desc: 'Thick, scarred, and stubbornly hard to cut. Good armour backing.',
    color: 0x8a6a44,
    value: 5,
    stackMax: 999,
    minDepth: 1,
    weight: 95,
    sources: ALL_RANKS,
    salvageFrom: ['normal', 'magic'],
  },
  {
    id: 'dust.ember',
    name: 'Ember Dust',
    kind: 'dust',
    tier: 1,
    desc: 'Warm to the touch a week after the fire that made it went out.',
    color: 0xd8632a,
    value: 8,
    stackMax: 999,
    minDepth: 4,
    weight: 70,
    sources: ALL_RANKS,
    salvageFrom: ['magic'],
  },
  {
    id: 'dust.frost',
    name: 'Rime Dust',
    kind: 'dust',
    tier: 1,
    desc: 'Never melts. Cold enough that the jar frosts from the inside.',
    color: 0x74c2e0,
    value: 8,
    stackMax: 999,
    minDepth: 4,
    weight: 70,
    sources: ALL_RANKS,
    salvageFrom: ['magic'],
  },
  {
    id: 'dust.storm',
    name: 'Storm Dust',
    kind: 'dust',
    tier: 1,
    desc: 'Grains that jump between your fingers and sting the nail beds.',
    color: 0xf0e05a,
    value: 8,
    stackMax: 999,
    minDepth: 4,
    weight: 70,
    sources: ALL_RANKS,
    salvageFrom: ['magic'],
  },
  {
    id: 'dust.venom',
    name: 'Blight Dust',
    kind: 'dust',
    tier: 1,
    desc: 'Spore powder. Do not open the jar downwind of anyone you like.',
    color: 0x7ec24a,
    value: 8,
    stackMax: 999,
    minDepth: 4,
    weight: 70,
    sources: ALL_RANKS,
    salvageFrom: ['magic'],
  },

  // --- Tier 2 — the mid-game grind -----------------------------------------
  {
    id: 'shard.steel',
    name: 'Tempered Steel',
    kind: 'shard',
    tier: 2,
    desc: 'Folded, quenched, and folded again by hands that no longer exist.',
    color: 0xbfc6d0,
    value: 24,
    stackMax: 999,
    minDepth: 12,
    weight: 100,
    sources: CHAMP_UP,
    salvageFrom: ['magic', 'rare'],
  },
  {
    id: 'essence.lesser',
    name: 'Lesser Essence',
    kind: 'essence',
    tier: 2,
    desc: 'What is left of a thing after everything that made it a thing is gone.',
    color: 0x8fa8ff,
    value: 30,
    stackMax: 999,
    minDepth: 12,
    weight: 90,
    sources: CHAMP_UP,
    salvageFrom: ['magic', 'rare'],
  },
  {
    id: 'reagent.sinew',
    name: 'Corded Sinew',
    kind: 'reagent',
    tier: 2,
    desc: 'Still twitches. Bowyers pay well and ask nothing.',
    color: 0xc07a72,
    value: 22,
    stackMax: 999,
    minDepth: 12,
    weight: 85,
    sources: CHAMP_UP,
    salvageFrom: ['magic', 'rare'],
  },
  {
    id: 'reagent.silk',
    name: 'Gloomsilk',
    kind: 'reagent',
    tier: 2,
    desc: 'Spun in the dark by something with too many opinions about weaving.',
    color: 0xa89ccc,
    value: 26,
    stackMax: 999,
    minDepth: 16,
    weight: 70,
    sources: CHAMP_UP,
    salvageFrom: ['magic', 'rare'],
  },
  {
    id: 'core.beast',
    name: 'Beast Heart',
    kind: 'core',
    tier: 2,
    desc: 'Big enough to need two hands. Beats when you are not looking at it.',
    color: 0xa02c30,
    value: 40,
    stackMax: 500,
    minDepth: 15,
    weight: 55,
    sources: ELITE_UP,
  },

  // --- Tier 3 — where builds get made --------------------------------------
  {
    id: 'shard.mithral',
    name: 'Mithral Filament',
    kind: 'shard',
    tier: 3,
    desc: 'Light as thread, sharp as an argument you cannot win.',
    color: 0xd8f0ff,
    value: 120,
    stackMax: 999,
    minDepth: 30,
    weight: 90,
    sources: ELITE_UP,
    salvageFrom: ['rare', 'set'],
  },
  {
    id: 'essence.greater',
    name: 'Greater Essence',
    kind: 'essence',
    tier: 3,
    desc: 'Dense enough to bend the light around the vial. Do not drop it.',
    color: 0x6f8cff,
    value: 150,
    stackMax: 999,
    minDepth: 30,
    weight: 80,
    sources: ELITE_UP,
    salvageFrom: ['rare', 'set'],
  },
  {
    id: 'dust.void',
    name: 'Void Ash',
    kind: 'dust',
    tier: 3,
    desc: 'The residue of something that was unmade rather than killed.',
    color: 0x8a4fd8,
    value: 140,
    stackMax: 999,
    minDepth: 34,
    weight: 65,
    sources: ELITE_UP,
    salvageFrom: ['rare', 'set'],
  },
  {
    id: 'core.demon',
    name: 'Demon Ichor',
    kind: 'core',
    tier: 3,
    desc: 'Burns through everything but glass, and it is working on the glass.',
    color: 0xe04a20,
    value: 170,
    stackMax: 500,
    minDepth: 32,
    weight: 60,
    sources: ELITE_UP,
  },
  {
    id: 'catalyst.order',
    name: 'Sigil of Order',
    kind: 'catalyst',
    tier: 3,
    desc: 'Forces a rolled property to settle high. Smiths guard these jealously.',
    color: 0xf5d76e,
    value: 260,
    stackMax: 200,
    minDepth: 35,
    weight: 34,
    sources: RARE_UP,
    salvageFrom: ['set', 'unique'],
  },

  // --- Tier 4 — endgame ----------------------------------------------------
  {
    id: 'shard.adamant',
    name: 'Adamant Core',
    kind: 'shard',
    tier: 4,
    desc: 'Has never been scratched. Several people have made that their life’s work.',
    color: 0x60d0b0,
    value: 600,
    stackMax: 999,
    minDepth: 55,
    weight: 80,
    sources: RARE_UP,
    salvageFrom: ['set', 'unique'],
  },
  {
    id: 'essence.pure',
    name: 'Pure Essence',
    kind: 'essence',
    tier: 4,
    desc: 'Perfectly clear, perfectly still, and audibly humming.',
    color: 0xc060ff,
    value: 720,
    stackMax: 999,
    minDepth: 55,
    weight: 70,
    sources: RARE_UP,
    salvageFrom: ['set', 'unique'],
  },
  {
    id: 'catalyst.chaos',
    name: 'Sigil of Chaos',
    kind: 'catalyst',
    tier: 4,
    desc: 'Unmakes every property on an item so the smith can try again.',
    color: 0xff5a33,
    value: 850,
    stackMax: 200,
    minDepth: 58,
    weight: 42,
    sources: RARE_UP,
    salvageFrom: ['unique'],
  },
  {
    id: 'core.titan',
    name: 'Titan Marrow',
    kind: 'core',
    tier: 4,
    desc: 'Carved from something that was a hill until it stood up.',
    color: 0xd8c090,
    value: 900,
    stackMax: 500,
    minDepth: 62,
    weight: 40,
    sources: RARE_UP,
  },
  {
    id: 'reagent.starcloth',
    name: 'Starcloth',
    kind: 'reagent',
    tier: 4,
    desc: 'A hand-width of night sky, still cold from wherever it was cut out of.',
    color: 0x304a9a,
    value: 780,
    stackMax: 999,
    minDepth: 60,
    weight: 45,
    sources: RARE_UP,
    salvageFrom: ['set', 'unique'],
  },

  // --- Tier 5 — chase ------------------------------------------------------
  {
    id: 'shard.starmetal',
    name: 'Starmetal Ingot',
    kind: 'shard',
    tier: 5,
    desc: 'It fell, it cooled, and it has been waiting a very long time to be a sword.',
    color: 0xfff0c0,
    value: 3200,
    stackMax: 999,
    minDepth: 80,
    weight: 60,
    sources: BOSS_ONLY,
    salvageFrom: ['mythic'],
  },
  {
    id: 'essence.mythic',
    name: 'Mythic Essence',
    kind: 'essence',
    tier: 5,
    desc: 'The distilled fact of a legend. Rewrites what an object is willing to be.',
    color: 0xff8adf,
    value: 4200,
    stackMax: 999,
    minDepth: 82,
    weight: 46,
    sources: BOSS_ONLY,
    salvageFrom: ['mythic', 'ancient'],
  },
  {
    id: 'catalyst.eternity',
    name: 'Sigil of Eternity',
    kind: 'catalyst',
    tier: 5,
    desc: 'The last upgrade an item ever needs, and the last one you will ever find.',
    color: 0xff5a33,
    value: 9000,
    stackMax: 100,
    minDepth: 88,
    weight: 16,
    sources: BOSS_ONLY,
    salvageFrom: ['ancient'],
  },
  {
    id: 'core.godsblood',
    name: 'Godsblood',
    kind: 'core',
    tier: 5,
    desc: 'Nothing down here should have had this. Something down here did.',
    color: 0xffd24a,
    value: 12000,
    stackMax: 100,
    minDepth: 92,
    weight: 8,
    sources: BOSS_ONLY,
    salvageFrom: ['ancient'],
  },
];

const BY_ID = new Map<string, MaterialDef>(MATERIALS.map((m) => [m.id, m]));

export function getMaterial(id: string): MaterialDef | undefined {
  return BY_ID.get(id);
}

export function materialName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

export function materialColor(id: string): number {
  return BY_ID.get(id)?.color ?? 0xc8c8c8;
}

export function materialValue(id: string): number {
  return BY_ID.get(id)?.value ?? 1;
}

export function materialsOfTier(tier: number): MaterialDef[] {
  return MATERIALS.filter((m) => m.tier === tier);
}

/** Which materials a monster of this rank at this depth is allowed to drop. */
export function materialDropPool(depth: number, rank: MonsterRank): MaterialDef[] {
  return MATERIALS.filter(
    (m) => depth >= m.minDepth && (m.maxDepth === undefined || depth <= m.maxDepth) && m.sources.includes(rank),
  );
}

/** Material pool available when breaking down an item of the given rarity. */
export function salvagePool(rarity: ItemRarity, ilvl: number): MaterialDef[] {
  return MATERIALS.filter((m) => (m.salvageFrom?.includes(rarity) ?? false) && ilvl >= m.minDepth - 4);
}

/** Elemental dusts, keyed for recipes that want a matching element. */
export const ELEMENT_DUST: Record<string, string> = {
  fire: 'dust.ember',
  cold: 'dust.frost',
  lightning: 'dust.storm',
  poison: 'dust.venom',
  arcane: 'dust.void',
  physical: 'dust.grave',
};

/** Human-readable "X Grave Dust, Y Iron Shard" for costs and recipe lines. */
export function formatMaterials(cost: Record<string, number>): string {
  const parts: string[] = [];
  for (const id of Object.keys(cost)) {
    const n = cost[id];
    if (!n) continue;
    parts.push(`${n} ${materialName(id)}`);
  }
  return parts.join(', ');
}
