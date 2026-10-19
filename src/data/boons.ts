/**
 * SLAY — boons and bargains.
 *
 * A shrine of choices offers three bargains: something you want, usually with
 * a price attached. Boons are ordinary statuses, registered at load with
 * `registerStatus`, so the HUD shows their icon and timer and `computeStats`
 * folds their modifiers in exactly like a shrine blessing.
 */

import type { StatKey } from '../types';
import { registerStatus, type StatusDef } from './statuses';
import { tr } from '../core/I18n';

function boon(
  id: string,
  name: string,
  desc: string,
  mods: Partial<Record<StatKey, number>>,
  color: number,
  icon: string,
  baseDuration = 180,
): StatusDef {
  return registerStatus({
    id,
    name,
    polarity: 1,
    maxStacks: 1,
    mods,
    color,
    icon,
    desc,
    tags: ['buff'],
    stacking: 'refresh',
    baseDuration,
  });
}

export const BOON_STATUSES: StatusDef[] = [
  boon('boon.bloodlust', tr('Blood Tithe'), tr('+40% damage.'), { enhancedDamage: 40 }, 0xc0303a, 'fist'),
  boon(
    'boon.gilded',
    tr('Gilded Fever'),
    tr('+100% magic find and gold find, but -20% to all resistances.'),
    { magicFind: 100, goldFind: 100, fireResist: -20, coldResist: -20, lightningResist: -20, poisonResist: -20, arcaneResist: -20 },
    0xffc63a,
    'coin',
  ),
  boon(
    'boon.glass',
    tr('Glass Edge'),
    tr('+60% damage, but -25% physical and -15% elemental resistance.'),
    { enhancedDamage: 60, physicalResist: -25, fireResist: -15, coldResist: -15, lightningResist: -15, poisonResist: -15, arcaneResist: -15 },
    0xb8e8ff,
    'sword',
  ),
  boon(
    'boon.iron',
    tr('Iron Vow'),
    tr('+15% damage reduction and +60% defense, but -20% movement speed.'),
    { damageReduction: 15, enhancedDefense: 60, moveSpeed: -20 },
    0x9aa4b0,
    'shield',
  ),
  boon('boon.quicksilver', tr('Quicksilver'), tr('+25% movement, +20% attack and cast speed.'), { moveSpeed: 25, attackSpeed: 20, castSpeed: 20 }, 0x8fe0ff, 'speed'),
  boon('boon.soulwell', tr('Soul Well'), tr('+10 mana regeneration and +15% cast speed.'), { manaRegen: 10, castSpeed: 15 }, 0x4a7cff, 'mana'),
  boon(
    'boon.hunted',
    tr('Marked for the Hunt'),
    tr('Monsters know where you are. +30% magic find while it lasts.'),
    { magicFind: 30 },
    0xff6a3c,
    'target',
    90,
  ),
];

export type BargainCost = 'none' | 'life30' | 'life20' | 'mana20' | 'gold20' | 'elites';

export interface BargainDef {
  id: string;
  name: string;
  /** What you get. */
  gain: string;
  /** What it costs, in plain words. Empty when free. */
  cost: string;
  costKind: BargainCost;
  /** Boon status granted, if any. */
  status?: string;
  /** One-off rewards resolved by the scene. */
  reward?: 'item' | 'restore';
  weight: number;
  minDepth: number;
}

export const BARGAINS: BargainDef[] = [
  { id: 'blood', name: tr('Blood Tithe'), gain: tr('+40% damage for 3 minutes'), cost: tr('Lose 30% of your life'), costKind: 'life30', status: 'boon.bloodlust', weight: 10, minDepth: 1 },
  { id: 'gilded', name: tr('Gilded Fever'), gain: tr('+100% magic and gold find for 3 minutes'), cost: tr('-20% to all resistances while it lasts'), costKind: 'none', status: 'boon.gilded', weight: 9, minDepth: 1 },
  { id: 'glass', name: tr('Glass Edge'), gain: tr('+60% damage for 3 minutes'), cost: tr('Your resistances drop while it lasts'), costKind: 'none', status: 'boon.glass', weight: 8, minDepth: 3 },
  { id: 'iron', name: tr('Iron Vow'), gain: tr('+15% damage reduction, +60% defense for 3 minutes'), cost: tr('-20% movement speed while it lasts'), costKind: 'none', status: 'boon.iron', weight: 8, minDepth: 1 },
  { id: 'quick', name: tr('Quicksilver'), gain: tr('+25% movement, +20% attack and cast speed for 3 minutes'), cost: tr('Lose 20% of your life'), costKind: 'life20', status: 'boon.quicksilver', weight: 8, minDepth: 1 },
  { id: 'well', name: tr('Soul Well'), gain: tr('+100% mana regeneration, +15% cast speed for 3 minutes'), cost: tr('Lose 20% of your mana'), costKind: 'mana20', status: 'boon.soulwell', weight: 7, minDepth: 1 },
  { id: 'tithe', name: tr('Golden Tithe'), gain: tr('A rare item now, sometimes better'), cost: tr('Pay a fifth of the gold you carry'), costKind: 'gold20', reward: 'item', weight: 8, minDepth: 1 },
  { id: 'hunt', name: tr('Call the Hunt'), gain: tr('An elite pack that drops a guaranteed rare, and +30% magic find'), cost: tr('The elites come for you now'), costKind: 'elites', status: 'boon.hunted', weight: 7, minDepth: 2 },
  { id: 'rest', name: tr('Respite'), gain: tr('Fully restore life and mana'), cost: '', costKind: 'none', reward: 'restore', weight: 6, minDepth: 1 },
];

export function getBargain(id: string): BargainDef | undefined {
  return BARGAINS.find((b) => b.id === id);
}
