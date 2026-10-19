/**
 * SLAY — the Paladin: who he is on the sheet. Spread into `../classes.ts`.
 *
 * One target at a time, one aura at a time. The Mace tree breaks things
 * (stagger, dents in armour, bells rung in skulls), the Blade tree opens them
 * (quick cuts, bleeds, answers to blows), and the Aura tree is the circle of
 * tallow light and censer smoke he carries at his feet.
 */
import type { CharClassDef } from '../../types';
import type { ClassEquipRules } from '../classes';
import { tr } from '../../core/I18n';

export const PALADIN: CharClassDef = {
  id: 'paladin',
  name: tr('Paladin'),
  title: tr('Bellwarden of the Ashen Chapel'),
  blurb:
    tr('They rang the chapel bell until the rope burned through, then carried the clapper down the stair to ring it by hand. A Paladin brings iron, a shield scorched with old prayers, and one aura at a time: a ring of candle smoke at his feet that the dark does not cross cheaply. He picks one thing in the room and hits it until it stops.'),
  base: { strength: 27, dexterity: 20, vitality: 26, energy: 14 },
  perLevel: { life: 2.3, mana: 1.2, attackRating: 6 },
  lifePerVit: 3.6,
  manaPerEnr: 1.6,
  trees: ['palMace', 'palBlade', 'palAura'],
  color: 0xe8cf96,
  startingGear: ['mace.club', 'shield.buckler'],
};

export const PALADIN_HINTS: string[] = ['tollingBlow', 'oathCut', 'tallowLight', 'shieldCrack'];

export const PALADIN_TAGLINES: string[] = [
  tr('One target. One aura. No retreat.'),
  tr('Ring it until it stops.'),
  tr('Candle smoke and broken plate.'),
];

export const PALADIN_EQUIP: ClassEquipRules = {
  // Iron in one hand and a shield in the other, or one big weapon in both.
  // No bows, no foci, no knives in the dark.
  denied: ['bow', 'crossbow', 'wand', 'staff', 'orb', 'dagger', 'quiver'],
  dualWield: false,
  offHandExtra: [],
  note: tr('Paladins fight with a mace or a sword, and a shield or both hands on the haft.'),
};
