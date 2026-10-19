/**
 * SLAY — the Shapeshifter.
 *
 * A man from the drowned woods who answers to three old bloods. He fights as
 * a great black cat (Feral: speed, single kills), a grey wolf (Teeth: bites
 * and howls) or a bear (Claw: the wall, the wide swipe). Each tree's skills
 * shift him into its form; his own shape fights with what the woods give a
 * man: clubs and axes, staves and spears.
 *
 * Kept in its own file so the class and its data live together and the shared
 * tables (`classes.ts`) only spread it in.
 */
import type { CharClassDef } from '../../types';
import type { ClassEquipRules } from '../classes';
import { tr } from '../../core/I18n';

export const SHAPESHIFTER_CLASS: CharClassDef = {
  id: 'shapeshifter',
  name: tr('Shapeshifter'),
  title: tr('He Who Wears Three Skins'),
  blurb:
    tr('Born in the drowned woods with the old blood in him three times over. In the dark he lets one of them out: the black cat that is gone before the scream, the grey wolf that never stops running, the bear that stands in the door and does not move. Bone charms on a cord, wet earth under the nails, and something behind the eyes that is not quite a man.'),
  base: { strength: 28, dexterity: 25, vitality: 26, energy: 8 },
  perLevel: { life: 2.5, mana: 0.9, attackRating: 7 },
  lifePerVit: 3.7,
  manaPerEnr: 1.2,
  trees: ['feral', 'teeth', 'claw'],
  color: 0xc46a34,
  // A plain wooden club: the man fights with what the woods give him.
  startingGear: ['mace.club'],
};

/**
 * Human form fights with a club, an axe, a staff or a spear. No shields and
 * no blades of the town's making, no bows: the other hand is kept free for
 * the change.
 */
export const SHAPESHIFTER_EQUIP: ClassEquipRules = {
  denied: ['bow', 'crossbow', 'wand', 'orb', 'scepter', 'shield', 'sword', 'dagger'],
  dualWield: false,
  offHandExtra: [],
  note: tr('Shapeshifters fight with clubs, axes, staves and spears, and keep the other hand free for the change.'),
};
