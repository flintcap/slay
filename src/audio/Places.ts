/**
 * SLAY — which "place" a music key, biome id or zone name sounds like.
 *
 * Music and ambience are both chosen per place. A place is a small fixed set
 * of moods (crypt, forest, desert, hell ...). Everything the game hands the
 * audio layer (old music keys like 'dirge', biome ids like 'sunkenTemple',
 * new biome ids the maps stream adds later) is folded onto one of them here,
 * first by exact name, then by keyword, so a new biome is never silent.
 */

export type Place =
  | 'town'
  | 'crypt'
  | 'caverns'
  | 'foundry'
  | 'temple'
  | 'hive'
  | 'frozen'
  | 'desert'
  | 'tomb'
  | 'void'
  | 'forest'
  | 'swamp'
  | 'hell';

export const PLACES: readonly Place[] = [
  'town', 'crypt', 'caverns', 'foundry', 'temple', 'hive', 'frozen', 'desert', 'tomb', 'void', 'forest', 'swamp', 'hell',
];

/** Exact keys: the old music keys and biome ids, plus a few spellings. */
const EXACT: Record<string, Place> = {
  town: 'town',
  dungeon: 'crypt',
  // old music keys
  dirge: 'crypt',
  drip: 'caverns',
  forge: 'foundry',
  submerged: 'temple',
  chitter: 'hive',
  glacial: 'frozen',
  windswept: 'desert',
  null: 'void',
  // old biome ids
  crypt: 'crypt',
  caverns: 'caverns',
  foundry: 'foundry',
  sunkenTemple: 'temple',
  hive: 'hive',
  frostvault: 'frozen',
  ashwaste: 'hell',
  voidspire: 'void',
};

/** Keyword fallbacks, checked in order against the lower-cased key. */
const KEYWORDS: Array<[RegExp, Place]> = [
  [/town|camp|village|haven/, 'town'],
  [/tomb|pyramid|sarcoph|mummy|necropol/, 'tomb'],
  [/crypt|catacomb|ossuary|grave|barrow|dungeon|keep|chapel|cathedral|monaster|prison|sewer|jail/, 'crypt'],
  [/cave|cavern|mine|grotto|tunnel|burrow|drip/, 'caverns'],
  [/forge|foundry|smelt|anvil|iron|furnace|works/, 'foundry'],
  [/temple|sunken|shrine|drown|tide|sea|submerg|flood/, 'temple'],
  [/hive|nest|brood|chitter|web|spider/, 'hive'],
  [/frost|ice|snow|tundra|glaci|frozen|winter|rime|polar|cold/, 'frozen'],
  [/desert|sand|dune|oasis|canyon|mesa|wind|waste/, 'desert'],
  [/void|null|astral|abyss|rift|spire|star/, 'void'],
  [/forest|wood|grove|thicket|jungle|glade|wild|moor|plain|field|meadow/, 'forest'],
  [/swamp|bog|marsh|fen|mire|bayou/, 'swamp'],
  [/hell|infern|lava|magma|ash|brimstone|fire|burn|demon|pit|chaos/, 'hell'],
];

/**
 * The place a key sounds like, or null for keys that are not places (menus,
 * death, victory, boss tracks).
 */
export function placeOf(key: string | null | undefined): Place | null {
  if (!key) return null;
  const exact = EXACT[key];
  if (exact) return exact;
  if ((PLACES as readonly string[]).includes(key)) return key as Place;
  if (/^(menu|title|charselect|death|victory|boss|danger|ambient)/i.test(key)) return null;
  const k = key.toLowerCase();
  for (const [re, place] of KEYWORDS) if (re.test(k)) return place;
  return null;
}
