/**
 * SLAY — difficulty tiers.
 *
 * Reaver is the baseline: the dungeon as it is tuned. Every other tier is
 * Reaver with a few numbers changed, written as only those changes in
 * `DIFFICULTIES` below. The biggest is `power`: every monster's and boss's
 * life, damage and armour is Reaver's times the tier's power, at every depth.
 * Wanderer and Seeker scale the rewards down with it; Zealot, Nemesis and
 * Damned pay more for the fight.
 *
 * To retune a tier, change its numbers. A tier that wants one monster stat
 * off its power (more life than damage, say) writes `monsterLife`,
 * `monsterDamage` or `monsterDefense` itself. The card's good and bad lines
 * are built from the numbers (`cardLines`), so they never fall out of step.
 */

import { tr, trk, trn, numText } from '../core/I18n';
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
  /** How strong monsters and bosses are next to Reaver. Life, damage and armour all follow it. */
  power: number;
  monsterLife: number;
  monsterDamage: number;
  monsterDefense: number;
  /** Multiplies champion and elite pack density. */
  eliteDensity: number;
  /** No elites at all before this depth. */
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
  /** Taken off the hero's fire, cold, lightning, poison and arcane resistance. */
  resistPenalty: number;

  // -- rewards -------------------------------------------------------------
  xp: number;
  /**
   * Over 1, adds (x - 1) * 100 magic find to every roll, as gear would. Under
   * 1, also scales the hero's own magic find down (`Payout.findRates`).
   */
  magicFind: number;
  goldFind: number;
  /**
   * How well dropped items roll. Over 1 each better rung of a line is that
   * many times as likely and values land higher in their range; under 1,
   * lower (`Loot.rollValue`). Shops and the gambler always roll at 1.
   */
  lootQuality: number;
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

type Numbers = Omit<DifficultyDef, 'id' | 'name' | 'blurb' | 'guidance' | 'color' | 'rank' | 'pros' | 'cons'>;

/** Reaver: the dungeon as tuned. Every other tier starts here. */
const REAVER: Numbers = {
  power: 1,
  monsterLife: 1,
  monsterDamage: 1,
  monsterDefense: 1,
  eliteDensity: 1,
  eliteFloor: 3,
  extraAffixes: 0,
  packSize: 1,
  damageTaken: 1,
  regen: 1,
  resistPenalty: 0,
  xp: 1,
  magicFind: 1,
  goldFind: 1,
  lootQuality: 1,
  bonusDrops: 0,
  startGold: 0,
  startStatPoints: 0,
  startSkillPoints: 0,
  statPointsPerLevel: 0,
};

interface Look {
  id: DifficultyId;
  name: string;
  blurb: string;
  guidance: string;
  color: number;
  rank: number;
  /** Lines the numbers cannot say, added after the built ones. */
  pros?: string[];
  cons?: string[];
}

/** A tier: Reaver with `changes`. The monster stats follow `power` unless written. */
function tier(look: Look, changes: Partial<Numbers>): DifficultyDef {
  const power = changes.power ?? REAVER.power;
  const n: Numbers = { ...REAVER, monsterLife: power, monsterDamage: power, monsterDefense: power, ...changes };
  const lines = cardLines(n);
  return { ...look, ...n, pros: [...lines.pros, ...(look.pros ?? [])], cons: [...lines.cons, ...(look.cons ?? [])] };
}

const pct = (x: number): number => Math.round(Math.abs(x - 1) * 100);
const times = (x: number): string => numText(x, Number.isInteger(x) ? 0 : Number.isInteger(x * 10) ? 1 : 2);

/** The card's good and bad lines, read off the numbers. */
function cardLines(n: Numbers): { pros: string[]; cons: string[] } {
  const pros: string[] = [];
  const cons: string[] = [];
  const even = n.monsterLife === n.monsterDamage && n.monsterDamage === n.monsterDefense;
  if (even && n.monsterLife < 1) pros.push(tr('Monsters and bosses have {0}% of the life, damage and armour', Math.round(n.monsterLife * 100)));
  else if (even && n.monsterLife > 1) cons.push(tr('Monsters and bosses have {0}x the life, damage and armour', times(n.monsterLife)));
  else if (!even) {
    const stat = (x: number, more: string, less: string): void => {
      if (x > 1) cons.push(tr(more, times(x)));
      else if (x < 1) pros.push(tr(less, Math.round(x * 100)));
    };
    stat(n.monsterLife, trk('Monsters have {0}x the life'), trk('Monsters have {0}% of the life'));
    stat(n.monsterDamage, trk('Monsters deal {0}x the damage'), trk('Monsters deal {0}% of the damage'));
    stat(n.monsterDefense, trk('Monsters have {0}x the armour'), trk('Monsters have {0}% of the armour'));
  }
  const more = (x: number, up: string, down: string): void => {
    if (x > 1) pros.push(tr(up, pct(x)));
    else if (x < 1) cons.push(tr(down, pct(x)));
  };
  more(n.xp, trk('+{0}% experience'), trk('-{0}% experience'));
  more(n.magicFind, trk('+{0}% magic find'), trk('-{0}% magic find'));
  if (n.lootQuality > 1) pros.push(tr('Loot quality x{0}: item lines roll higher', times(n.lootQuality)));
  else if (n.lootQuality < 1) cons.push(tr('Loot quality x{0}: item lines roll lower', times(n.lootQuality)));
  more(n.goldFind, trk('+{0}% gold'), trk('-{0}% gold'));
  if (n.statPointsPerLevel > 0) {
    pros.push(trn(n.statPointsPerLevel, '{0} extra attribute point every level', '{0} extra attribute points every level', n.statPointsPerLevel));
  }
  if (n.bonusDrops > 0) pros.push(trn(n.bonusDrops, 'Elites drop {0} extra item', 'Elites drop {0} extra items', n.bonusDrops));
  if (n.startStatPoints > 0) pros.push(tr('{0} extra attribute points to start', n.startStatPoints));
  if (n.startSkillPoints > 0) pros.push(trn(n.startSkillPoints, '{0} extra skill point to start', '{0} extra skill points to start', n.startSkillPoints));
  if (n.startGold > 0) pros.push(tr('Start with {0} gold', n.startGold));
  if (n.resistPenalty > 0) cons.push(tr('-{0} to every resistance', n.resistPenalty));
  if (n.damageTaken > 1) cons.push(tr('You take {0}% more damage', pct(n.damageTaken)));
  else if (n.damageTaken < 1) pros.push(tr('You take {0}% less damage', pct(n.damageTaken)));
  if (n.regen > 1) pros.push(tr('Life and mana recover {0}% faster', pct(n.regen)));
  else if (n.regen < 1) cons.push(tr('Life and mana recover {0}% slower', pct(n.regen)));
  if (n.eliteFloor > REAVER.eliteFloor) pros.push(tr('No elite packs until tier {0}', n.eliteFloor));
  else if (n.eliteFloor < REAVER.eliteFloor) cons.push(tr('Elite packs from tier {0}', n.eliteFloor));
  if (n.eliteDensity > 1) cons.push(tr('{0}% more elite packs', pct(n.eliteDensity)));
  else if (n.eliteDensity < 1) pros.push(tr('{0}% fewer elite packs', pct(n.eliteDensity)));
  if (n.extraAffixes > 0) cons.push(trn(n.extraAffixes, 'Elites carry {0} extra power', 'Elites carry {0} extra powers', n.extraAffixes));
  if (n.packSize > 1) cons.push(tr('{0}% more monsters', pct(n.packSize)));
  else if (n.packSize < 1) pros.push(tr('{0}% fewer monsters', pct(n.packSize)));
  return { pros, cons };
}

export const DIFFICULTIES: DifficultyDef[] = [
  tier(
    {
      id: 'wanderer',
      name: tr('Wanderer'),
      blurb: tr('The dark makes room for you. For a while.'),
      guidance: tr('Learn the game. Half the fight of Reaver, and half the reward.'),
      color: 0x7fc98a,
      rank: 1,
    },
    { power: 0.5, xp: 0.5, magicFind: 0.5, goldFind: 0.5, lootQuality: 0.5 },
  ),
  tier(
    {
      id: 'seeker',
      name: tr('Seeker'),
      blurb: tr('A fair fight, mostly.'),
      guidance: tr('A gentle run. Good if you want to reach the deep tiers without a fight for every metre.'),
      color: 0x8fb8e0,
      rank: 2,
    },
    { power: 0.75, xp: 0.75, magicFind: 0.75, goldFind: 0.75, lootQuality: 0.75 },
  ),
  tier(
    {
      id: 'reaver',
      name: tr('Reaver'),
      blurb: tr('The dungeon as it was written.'),
      guidance: tr('The intended experience. Every other tier is measured from this one.'),
      color: 0xcbb98a,
      rank: 3,
      pros: [tr('Balanced rewards'), tr('No modifiers either way')],
      cons: [tr('No safety net')],
    },
    {},
  ),
  tier(
    {
      id: 'zealot',
      name: tr('Zealot'),
      blurb: tr('It hits back.'),
      guidance: tr('Twice the fight of Reaver. Worth it for the loot if you know your build.'),
      color: 0xe0a24a,
      rank: 4,
    },
    { power: 2, xp: 1.1, magicFind: 1.2, lootQuality: 1.1 },
  ),
  tier(
    {
      id: 'nemesis',
      name: tr('Nemesis'),
      blurb: tr('Bring friends. You have none.'),
      guidance: tr('Expect to die. Bring gear from the vault or expect to die twice.'),
      color: 0xd8563c,
      rank: 5,
    },
    { power: 3.5, xp: 1.2, magicFind: 1.3, lootQuality: 1.5, resistPenalty: 5 },
  ),
  tier(
    {
      id: 'damned',
      name: tr('Damned'),
      blurb: tr('You will need what the dead left you.'),
      guidance: tr('Only sane with a stash full of good gear ready to equip at level 1.'),
      color: 0xa855f7,
      rank: 6,
    },
    { power: 6, xp: 1.3, magicFind: 1.5, lootQuality: 2, statPointsPerLevel: 1, resistPenalty: 15 },
  ),
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
