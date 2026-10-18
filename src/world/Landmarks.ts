/**
 * SLAY — landmarks: rare set pieces worth a detour (docs/remake/mapvariety.md).
 *
 * Now and then an area keeps one: a hill of gibbets in the wood, a watch
 * frozen where it stood, a chapel fallen in on its own shrine. Each is built
 * from the prop library's own pieces round one room, off the way through,
 * with a light so it shows from a distance, and most leave something for
 * whoever walks over: a strongbox, or a shrine still holding a blessing.
 *
 * This file is data and the chance. `world/Props.ts` (`placeLandmark`) finds
 * the room and stands the pieces; the level records what it placed in
 * `DungeonLevel.landmark`.
 */
import type { BiomeId } from '../types';

export interface SetPiece {
  id: string;
  /** What the place is called, for a label on the map or a toast. */
  name: string;
  biomes: BiomeId[];
  /** The heart of it, at the room's centre. */
  heart: string;
  /** Stood round the heart, kinds taken in turn. */
  ring: { kinds: string[]; n: number; r: number };
  /** Loose pieces strewn round it. */
  litter: { kinds: string[]; n: number; r: number };
  /**
   * A free-standing light beside it, so it reads from across the area. Left
   * out, it takes one of the zone's own stand lights.
   */
  light?: string;
  /** What it leaves: a rare chest beside the heart, or the heart is a shrine. */
  reward: 'chest' | 'shrine' | 'none';
}

export const SET_PIECES: SetPiece[] = [
  {
    id: 'gallows',
    name: 'The Hanging Hill',
    biomes: ['darkForest', 'swamp', 'crypt', 'tundra'],
    heart: 'gibbet',
    ring: { kinds: ['gibbet', 'cage', 'gibbet', 'impaler'], n: 4, r: 3 },
    litter: { kinds: ['bonepile', 'skullPile', 'bloodStain', 'bonepile'], n: 6, r: 4 },
    light: 'lanternPost',
    reward: 'chest',
  },
  {
    id: 'frozenWatch',
    name: 'The Frozen Watch',
    biomes: ['tundra', 'frostvault'],
    heart: 'iceMonolith',
    ring: { kinds: ['frozenCorpse', 'frozenCorpse', 'frozenBanner', 'frozenCorpse', 'iceShard'], n: 5, r: 2.8 },
    litter: { kinds: ['iceShard', 'iceCrust', 'iceCrust'], n: 5, r: 4.5 },
    reward: 'chest',
  },
  {
    id: 'brokenChapel',
    name: 'The Broken Chapel',
    biomes: ['crypt', 'sunkenTemple', 'desert', 'desertTomb', 'darkForest', 'ashwaste'],
    heart: 'shrine',
    ring: { kinds: ['ruinWall', 'pillarBroken', 'brokenColumn', 'pillarBroken', 'ruinWall'], n: 5, r: 3.5 },
    litter: { kinds: ['candleCluster', 'rubblePile', 'rubblePile', 'candleCluster'], n: 6, r: 3 },
    light: 'candelabra',
    reward: 'shrine',
  },
  {
    id: 'tithePit',
    name: 'The Tithe Mound',
    biomes: ['crypt', 'caverns', 'hell', 'desertTomb'],
    heart: 'ossuary',
    ring: { kinds: ['boneSpire', 'skullPile', 'boneSpire', 'skullPile'], n: 4, r: 3 },
    litter: { kinds: ['bonepile', 'boneChips', 'boneChips', 'bloodStain'], n: 7, r: 4 },
    light: 'brazier',
    reward: 'chest',
  },
  {
    id: 'drownedIdol',
    name: 'The Drowned Idol',
    biomes: ['swamp', 'sunkenTemple', 'caverns', 'hive'],
    heart: 'idolHead',
    ring: { kinds: ['runeStone', 'runeStone', 'runeStone'], n: 3, r: 3.2 },
    litter: { kinds: ['mossPatch', 'candleCluster', 'mossPatch', 'bonepile'], n: 6, r: 4 },
    light: 'brazier',
    reward: 'shrine',
  },
  {
    id: 'lastCamp',
    name: 'The Last Camp',
    biomes: ['darkForest', 'desert', 'tundra', 'ashwaste'],
    heart: 'campfire',
    ring: { kinds: ['tent', 'cart', 'tent'], n: 3, r: 3.4 },
    litter: { kinds: ['bonepile', 'beastSkull', 'bonepile', 'twigs'], n: 5, r: 4.5 },
    light: 'lanternPost',
    reward: 'chest',
  },
  {
    id: 'weepingGate',
    name: 'The Weeping Gate',
    biomes: ['voidspire', 'hell'],
    heart: 'voidRift',
    ring: { kinds: ['obelisk', 'obelisk', 'obelisk'], n: 3, r: 3.4 },
    litter: { kinds: ['voidShard', 'floatingStone', 'voidMote', 'voidShard'], n: 7, r: 4 },
    light: 'brazier',
    reward: 'shrine',
  },
  {
    id: 'coldCrucible',
    name: 'The Cold Crucible',
    biomes: ['foundry', 'hell'],
    heart: 'smeltingVat',
    ring: { kinds: ['anvil', 'pipeCluster', 'anvil', 'gear'], n: 4, r: 3 },
    litter: { kinds: ['ingotStack', 'slagChunk', 'slagChunk', 'scorchMark'], n: 7, r: 4 },
    light: 'brazier',
    reward: 'chest',
  },
  {
    id: 'larder',
    name: 'The Queen’s Larder',
    biomes: ['hive', 'caverns'],
    heart: 'broodMound',
    ring: { kinds: ['cocoon', 'cocoon', 'chitinSpike', 'cocoon', 'cocoon'], n: 5, r: 3 },
    litter: { kinds: ['webClump', 'shellFragment', 'webClump', 'bonepile'], n: 7, r: 4 },
    reward: 'chest',
  },
];

/** Chance an area keeps a landmark (when it has a room fit for one, off the way through and clear of the arena). */
export const LANDMARK_CHANCE = 0.3;

/** The set pieces a biome can hold. */
export function setPiecesFor(biome: BiomeId): SetPiece[] {
  return SET_PIECES.filter((s) => s.biomes.includes(biome));
}
