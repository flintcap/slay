/**
 * SLAY — the five playable classes.
 *
 * Each class is a distinct *engine*, not a palette swap:
 *
 *  - Warden      pays life and position for damage; wants to be hit.
 *  - Pyromancer  stacks burn on everything and detonates it.
 *  - Shadowblade  burst windows out of stealth, poison between them.
 *  - Stormcaller  never stands still; damage comes from chaining and charge.
 *  - Revenant    an army does the killing; you manage its life and its death.
 *  - Ranger      range is the resource; every skill trades distance for damage.
 *
 * `lifePerVit` / `manaPerEnr` and `perLevel` are the numbers that make that
 * true at the sheet level; the skill trees make it true at the keyboard.
 */

import type { CharClassDef, CharClassId } from '../types';

/** Base life/mana every character starts with before class scaling. */
export const BASE_LIFE = 35;
export const BASE_MANA = 15;

/**
 * `startingGear` holds real item base ids. Every entry here used to be a
 * made-up name — 'shortSword', 'clothRobe' — which `getBase` could not resolve,
 * so it was silently dropped and every class began the game with nothing
 * equipped at all.
 *
 * Deliberately just a weapon, and an off hand where the class fights with one.
 * Armour is what you go down there to find: starting in a full kit removes the
 * first thing the game has to give you.
 */
export const CLASSES: CharClassDef[] = [
  {
    id: 'warden',
    name: 'Warden',
    title: 'Oathkeeper of the Broken Gate',
    blurb:
      'The last order sworn to hold the stair. Wardens fight with a shield planted and a blade already wet — ' +
      'every wound they take is a debt the dark repays with interest. They do not dodge. They do not retreat. ' +
      'They open arteries and wait.',
    base: { strength: 30, dexterity: 20, vitality: 25, energy: 10 },
    perLevel: { life: 2.4, mana: 0.8, attackRating: 5 },
    lifePerVit: 4,
    manaPerEnr: 1,
    trees: ['bulwark', 'carnage', 'oath'],
    color: 0xc8a24a,
    startingGear: ['sword.short', 'shield.buckler'],
  },
  {
    id: 'pyromancer',
    name: 'Pyromancer',
    title: 'Keeper of the Second Sun',
    blurb:
      'They stole fire from something that is still looking for it. A pyromancer does not cast spells so much as ' +
      'schedule them: light everything, let it cook, then pull the whole room open at once. Robes optional. ' +
      'Eyebrows are a luxury.',
    base: { strength: 14, dexterity: 16, vitality: 20, energy: 35 },
    perLevel: { life: 1.4, mana: 2.2, attackRating: 2.5 },
    lifePerVit: 2,
    manaPerEnr: 2,
    trees: ['conflagration', 'cinders', 'sunfire'],
    color: 0xff7a1e,
    startingGear: ['wand.wand', 'orb.cracked'],
  },
  {
    id: 'shadowblade',
    name: 'Shadowblade',
    title: 'The Quiet Between Heartbeats',
    blurb:
      'A guild that officially never existed and unofficially took the contract on the god of this place. ' +
      'Shadowblades trade armour for arithmetic: a single opening, a coated edge, and the target is already ' +
      'dead — it simply has not been told yet.',
    base: { strength: 20, dexterity: 32, vitality: 20, energy: 15 },
    perLevel: { life: 1.9, mana: 1.3, attackRating: 8 },
    lifePerVit: 3,
    manaPerEnr: 1.5,
    trees: ['venom', 'shadowcraft', 'bladework'],
    color: 0x5ad18f,
    startingGear: ['dagger.dagger', 'dagger.dagger'],
  },
  {
    id: 'stormcaller',
    name: 'Stormcaller',
    title: 'Voice of the Standing Weather',
    blurb:
      'Storms do not travel underground. This one followed her anyway. The stormcaller fights the way lightning ' +
      'moves — never twice through the same air, always toward the shortest path to something conductive — and ' +
      'the charge she leaves behind does half the killing.',
    base: { strength: 16, dexterity: 26, vitality: 20, energy: 30 },
    perLevel: { life: 1.6, mana: 2, attackRating: 4 },
    lifePerVit: 2.5,
    manaPerEnr: 1.75,
    trees: ['tempest', 'galewalk', 'conduit'],
    color: 0x6fc9ff,
    startingGear: ['staff.short'],
  },
  {
    id: 'revenant',
    name: 'Revenant',
    title: 'He Who Was Buried Twice',
    blurb:
      'Died at the third gate. Came back wrong, and brought company. The revenant treats corpses as currency: ' +
      'raise them, bind them, spend them. What the dungeon takes from him he takes from everything else, one ' +
      'stolen heartbeat at a time.',
    base: { strength: 18, dexterity: 18, vitality: 24, energy: 30 },
    perLevel: { life: 1.8, mana: 2, attackRating: 3 },
    lifePerVit: 2.5,
    manaPerEnr: 2,
    trees: ['ossuary', 'blight', 'gravepact'],
    color: 0x8ce0c8,
    startingGear: ['wand.femur', 'orb.cracked'],
  },
  {
    id: 'ranger',
    name: 'Ranger',
    title: 'Warden of the Long Shot',
    blurb:
      'They learned the dungeon by mapping the distances in it. A ranger opens at the far wall and spends the ' +
      'whole fight keeping it there — traps behind, arrows ahead, and a step back for every step you take. ' +
      'Let one close the gap and the answer is a blade in the ribs, but that is not the plan.',
    base: { strength: 18, dexterity: 35, vitality: 20, energy: 12 },
    perLevel: { life: 1.9, mana: 1.1, attackRating: 9 },
    lifePerVit: 3,
    manaPerEnr: 1.4,
    trees: ['marksman', 'wildcraft', 'volley'],
    color: 0x7fc46a,
    startingGear: ['bow.short', 'quiver.ragged'],
  },
];

export const CLASS_BY_ID: Record<CharClassId, CharClassDef> = CLASSES.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<CharClassId, CharClassDef>,
);

export function getClass(id: CharClassId): CharClassDef {
  const c = CLASS_BY_ID[id];
  if (!c) throw new Error(`unknown class "${id}"`);
  return c;
}

export const CLASS_IDS: readonly CharClassId[] = CLASSES.map((c) => c.id);

/**
 * Per-class starting hotbar hints. The character factory binds whichever of
 * these the character can actually use at level 1; the rest are suggestions the
 * UI can surface as "recommended" when the skill is first learned.
 */
export const STARTING_SKILL_HINTS: Record<CharClassId, string[]> = {
  warden: ['cleave', 'rend', 'shieldWall', 'battleCry'],
  pyromancer: ['firebolt', 'ignite', 'emberNova', 'flameWard'],
  shadowblade: ['viperStrike', 'shadowStep', 'preciseCut', 'coatBlades'],
  stormcaller: ['sparkbolt', 'staticField', 'gust', 'chargeUp'],
  revenant: ['boneSpear', 'raiseSkeleton', 'siphonLife', 'weaken'],
  ranger: ['pierceShot', 'huntersMark', 'rollAway', 'snareTrap'],
};

/** Flavour lines used by the character select screen when hovering a class. */
export const CLASS_TAGLINES: Record<CharClassId, string[]> = {
  warden: ['Blocks into bleeds.', 'Wants the hit.', 'Slow, immovable, inevitable.'],
  pyromancer: ['Everything burns twice.', 'Detonation over damage.', 'Glass, but the room is on fire.'],
  shadowblade: ['One window is enough.', 'Poison does the waiting.', 'Crit or leave.'],
  stormcaller: ['Never stand still.', 'The chain is the build.', 'Charge, discharge, repeat.'],
  revenant: ['The army is the weapon.', 'Corpses are ammunition.', 'Steal what you cannot survive.'],
  ranger: ['Distance is the build.', 'Never let them arrive.', 'The floor is the trap.'],
};


// ---------------------------------------------------------------------------
// Equipment restrictions
// ---------------------------------------------------------------------------

import type { ItemCategory } from '../types';

export interface ClassEquipRules {
  /** Categories this class can never equip. */
  denied: ItemCategory[];
  /** True if the class may hold a second one-handed melee weapon. */
  dualWield: boolean;
  /** Extra categories allowed in the off hand beyond shields and orbs. */
  offHandExtra: ItemCategory[];
  /** One-line explanation shown when an equip is refused. */
  note: string;
}

/**
 * What each class may hold. These are identity, not balance: a Shadowblade
 * fighting from behind a kite shield is not a Shadowblade, and a Warden who
 * cannot plant a shield loses the whole point of the class.
 */
export const CLASS_EQUIP: Record<CharClassId, ClassEquipRules> = {
  ranger: {
    // The only class built around a bow. A shield in the off hand is the one
    // thing that stops you drawing one, so it is out.
    denied: ['shield', 'staff', 'wand', 'orb', 'scepter', 'mace'],
    dualWield: false,
    offHandExtra: ['quiver'],
    note: 'Rangers need both hands on the bow. A quiver is the only off hand.',
  },
  warden: {
    denied: ['bow', 'crossbow', 'wand', 'staff', 'orb'],
    dualWield: false,
    offHandExtra: [],
    note: 'Wardens fight with a blade and a planted shield.',
  },
  pyromancer: {
    denied: ['bow', 'crossbow', 'spear', 'shield'],
    dualWield: false,
    offHandExtra: ['orb'],
    note: 'Pyromancers channel through a focus, not a shield.',
  },
  shadowblade: {
    // No shields, ever. Two blades instead.
    denied: ['shield', 'staff', 'mace', 'crossbow'],
    dualWield: true,
    offHandExtra: ['sword', 'axe', 'dagger', 'quiver'],
    note: 'Shadowblades carry a second blade where a shield would go.',
  },
  stormcaller: {
    denied: ['crossbow', 'mace', 'shield'],
    dualWield: false,
    offHandExtra: ['orb'],
    note: 'Stormcallers keep one hand free to conduct.',
  },
  revenant: {
    denied: ['bow', 'crossbow', 'spear'],
    dualWield: false,
    offHandExtra: ['orb', 'shield'],
    note: 'Revenants bind their dead through a focus or a warding shield.',
  },
};

export function equipRules(classId: CharClassId): ClassEquipRules {
  return CLASS_EQUIP[classId] ?? CLASS_EQUIP.warden;
}
