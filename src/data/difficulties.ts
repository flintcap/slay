/**
 * SLAY — difficulty tiers.
 *
 * Difficulty changes where a run *starts*, never how it scales. The endless
 * curve past that point is identical on every tier: pick Wanderer and depth 60
 * is still depth 60. What changes is how long the ramp takes to bite, how much
 * the early floors punish a fresh character, and what you are paid for it.
 *
 * Every tier is a real trade. The easy ones cost you rewards; the hard ones pay
 * out enough that a geared player has a reason to take them. Nothing here is
 * purely worse than its neighbour.
 */

export type DifficultyId = 'wanderer' | 'seeker' | 'reaver' | 'zealot' | 'nemesis' | 'damned';

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  /** One line of flavour for the selection card. */
  blurb: string;
  /** Plain-language guidance so the player can actually choose. */
  guidance: string;
  /** Accent colour for the card. */
  color: number;
  /** 1 = baseline. Ordering index, also used for the difficulty pip display. */
  rank: number;

  // -- monster side --------------------------------------------------------
  monsterLife: number;
  monsterDamage: number;
  monsterDefense: number;
  /** Multiplies champion and elite pack density. */
  eliteDensity: number;
  /** No elites at all before this depth. The single biggest early-game lever. */
  eliteFloor: number;
  /** Extra affixes rolled onto elite and rare packs. */
  extraAffixes: number;
  /** Monster count multiplier per floor. */
  packSize: number;

  // -- player side ---------------------------------------------------------
  /** Multiplies damage the player actually takes, after mitigation. */
  damageTaken: number;
  /** Multiplies life and mana regeneration. */
  regen: number;

  // -- rewards -------------------------------------------------------------
  xp: number;
  magicFind: number;
  goldFind: number;
  /** Extra guaranteed item drops from elite and rare packs. */
  bonusDrops: number;

  // -- creation bonuses ----------------------------------------------------
  startGold: number;
  startStatPoints: number;
  startSkillPoints: number;
  /** Extra attribute points awarded every level. */
  statPointsPerLevel: number;

  /** Short bullet list shown on the card: the good half. */
  pros: string[];
  /** Short bullet list shown on the card: the cost. */
  cons: string[];
}

export const DIFFICULTIES: DifficultyDef[] = [
  {
    id: 'wanderer',
    name: 'Wanderer',
    blurb: 'The dark makes room for you. For a while.',
    guidance: 'Learn the game. Nothing serious threatens you until the middle floors.',
    color: 0x7fc98a,
    rank: 1,
    monsterLife: 0.6,
    monsterDamage: 0.42,
    monsterDefense: 0.7,
    eliteDensity: 0.35,
    eliteFloor: 7,
    extraAffixes: 0,
    packSize: 0.8,
    damageTaken: 0.8,
    regen: 1.6,
    xp: 0.7,
    magicFind: 0.6,
    goldFind: 0.75,
    bonusDrops: 0,
    startGold: 400,
    startStatPoints: 0,
    startSkillPoints: 0,
    statPointsPerLevel: 0,
    pros: ['Enemies hit much softer', 'No elite packs until depth 7', 'Faster health and mana recovery'],
    cons: ['Much less experience', 'Far worse loot quality', 'Less gold'],
  },
  {
    id: 'seeker',
    name: 'Seeker',
    blurb: 'A fair fight, mostly.',
    guidance: 'A gentle run. Good if you want to reach the deep floors without a fight for every metre.',
    color: 0x8fb8e0,
    rank: 2,
    monsterLife: 0.8,
    monsterDamage: 0.68,
    monsterDefense: 0.85,
    eliteDensity: 0.65,
    eliteFloor: 4,
    extraAffixes: 0,
    packSize: 0.9,
    damageTaken: 0.92,
    regen: 1.25,
    xp: 0.85,
    magicFind: 0.8,
    goldFind: 0.9,
    bonusDrops: 0,
    startGold: 200,
    startStatPoints: 0,
    startSkillPoints: 1,
    statPointsPerLevel: 0,
    pros: ['Enemies hit softer', 'No elite packs until depth 4', 'One extra skill point to start'],
    cons: ['Less experience', 'Slightly worse loot'],
  },
  {
    id: 'reaver',
    name: 'Reaver',
    blurb: 'The dungeon as it was written.',
    guidance: 'The intended experience. Everything is tuned around this.',
    color: 0xcbb98a,
    rank: 3,
    monsterLife: 1,
    monsterDamage: 1,
    monsterDefense: 1,
    eliteDensity: 1,
    eliteFloor: 3,
    extraAffixes: 0,
    packSize: 1,
    damageTaken: 1,
    regen: 1,
    xp: 1,
    magicFind: 1,
    goldFind: 1,
    bonusDrops: 0,
    startGold: 0,
    startStatPoints: 0,
    startSkillPoints: 0,
    statPointsPerLevel: 0,
    pros: ['Balanced rewards', 'No modifiers either way'],
    cons: ['No safety net'],
  },
  {
    id: 'zealot',
    name: 'Zealot',
    blurb: 'It hits back.',
    guidance: 'A real fight from depth 2. Worth it for the loot if you know your build.',
    color: 0xe0a24a,
    rank: 4,
    monsterLife: 1.3,
    monsterDamage: 1.28,
    monsterDefense: 1.15,
    eliteDensity: 1.45,
    eliteFloor: 2,
    extraAffixes: 1,
    packSize: 1.12,
    damageTaken: 1.08,
    regen: 0.9,
    xp: 1.4,
    magicFind: 1.5,
    goldFind: 1.35,
    bonusDrops: 0,
    startGold: 0,
    startStatPoints: 5,
    startSkillPoints: 0,
    statPointsPerLevel: 1,
    pros: ['+40% experience', '+50% better loot', 'One extra attribute point every level'],
    cons: ['Enemies are tougher and hit harder', 'Elite packs from depth 2', 'Elites carry an extra power'],
  },
  {
    id: 'nemesis',
    name: 'Nemesis',
    blurb: 'Bring friends. You have none.',
    guidance: 'Expect to die. Bring gear from the vault or expect to die twice.',
    color: 0xd8563c,
    rank: 5,
    monsterLife: 1.75,
    monsterDamage: 1.7,
    monsterDefense: 1.35,
    eliteDensity: 2.1,
    eliteFloor: 1,
    extraAffixes: 1,
    packSize: 1.25,
    damageTaken: 1.18,
    regen: 0.75,
    xp: 1.9,
    magicFind: 2.2,
    goldFind: 1.8,
    bonusDrops: 1,
    startGold: 0,
    startStatPoints: 10,
    startSkillPoints: 2,
    statPointsPerLevel: 2,
    pros: [
      '+90% experience',
      'More than double the loot quality',
      'Elites always drop something extra',
      'Two extra attribute points every level',
    ],
    cons: ['Enemies are far tougher', 'Elite packs from depth 1', 'You take 18% more damage'],
  },
  {
    id: 'damned',
    name: 'Damned',
    blurb: 'You will need what the dead left you.',
    guidance: 'Only sane with a stash full of good gear ready to equip at level 1.',
    color: 0xa855f7,
    rank: 6,
    monsterLife: 2.2,
    monsterDamage: 2.15,
    monsterDefense: 1.6,
    eliteDensity: 3.0,
    eliteFloor: 1,
    extraAffixes: 2,
    packSize: 1.4,
    damageTaken: 1.32,
    regen: 0.55,
    xp: 2.6,
    magicFind: 3.2,
    goldFind: 2.4,
    bonusDrops: 2,
    startGold: 0,
    startStatPoints: 15,
    startSkillPoints: 3,
    statPointsPerLevel: 3,
    pros: [
      '+160% experience',
      'More than triple the loot quality',
      'Elites drop two extra items',
      'Three extra attribute points every level',
    ],
    cons: [
      'Enemies more than double in strength',
      'Elite packs everywhere from depth 1',
      'Elites carry two extra powers',
      'You take 32% more damage and heal slowly',
    ],
  },
];

export const DIFFICULTY_BY_ID: Record<string, DifficultyDef> = Object.fromEntries(
  DIFFICULTIES.map((d) => [d.id, d])
);

export const DEFAULT_DIFFICULTY: DifficultyId = 'reaver';

export function getDifficulty(id: DifficultyId | undefined): DifficultyDef {
  return DIFFICULTY_BY_ID[id ?? DEFAULT_DIFFICULTY] ?? DIFFICULTY_BY_ID[DEFAULT_DIFFICULTY]!;
}

// ---------------------------------------------------------------------------
// Active tier
// ---------------------------------------------------------------------------

let active: DifficultyDef = DIFFICULTY_BY_ID[DEFAULT_DIFFICULTY]!;

/**
 * Set once when a run starts. Monster construction and world generation read
 * this rather than threading the character through every call site.
 */
export function setActiveDifficulty(id: DifficultyId | undefined): void {
  active = getDifficulty(id);
}

export function activeDifficulty(): DifficultyDef {
  return active;
}
