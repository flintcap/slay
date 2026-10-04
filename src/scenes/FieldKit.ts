import type { CharClassId, EquipSlot } from '../types';

/**
 * The look each class is shown in on the select screen. Weapons are the real
 * starting weapons; the armour is representative of the class's fantasy.
 *
 * Pure data, kept apart from HeroModel so tools can check it without a WebGL
 * context. `tools/check-menus.mjs` proves every id here is a real item base
 * that fits the slot it is listed under.
 */
export const FIELD_KIT: Record<CharClassId, Partial<Record<EquipSlot, string>>> = {
  warden: {
    mainHand: 'sword.short',
    offHand: 'shield.kite',
    helm: 'helm.full',
    chest: 'chest.gothic',
    gloves: 'gloves.war',
    boots: 'boots.war',
    belt: 'belt.war',
  },
  pyromancer: {
    mainHand: 'wand.wand',
    offHand: 'orb.cracked',
    helm: 'helm.circlet',
    chest: 'chest.dusk',
    gloves: 'gloves.silk',
    boots: 'boots.slippers',
    belt: 'belt.sash',
  },
  shadowblade: {
    mainHand: 'dagger.dagger',
    offHand: 'dagger.dagger',
    chest: 'chest.wyrmhide',
    gloves: 'gloves.bramble',
    boots: 'boots.sharkskin',
    belt: 'belt.light',
  },
  stormcaller: {
    mainHand: 'staff.short',
    helm: 'helm.coronet',
    chest: 'chest.ghost',
    gloves: 'gloves.silk',
    boots: 'boots.gale',
    belt: 'belt.spiderweb',
  },
  revenant: {
    mainHand: 'wand.femur',
    offHand: 'orb.cracked',
    helm: 'helm.bone',
    chest: 'chest.boneweave',
    gloves: 'gloves.vampirebone',
    boots: 'boots.scarabshell',
    belt: 'belt.vampirefang',
  },
  ranger: {
    mainHand: 'bow.short',
    offHand: 'quiver.ragged',
    helm: 'helm.cap',
    chest: 'chest.studded',
    gloves: 'gloves.leather',
    boots: 'boots.wyrmhide',
    belt: 'belt.belt',
  },
};

