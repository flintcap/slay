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
  boon('boon.bloodlust', 'Blood Tithe', '+40% damage.', { enhancedDamage: 40 }, 0xc0303a, 'fist'),
  boon(
    'boon.gilded',
    'Gilded Fever',
    '+100% magic find and gold find, but -20% to all resistances.',
    { magicFind: 100, goldFind: 100, fireResist: -20, coldResist: -20, lightningResist: -20, poisonResist: -20, arcaneResist: -20 },
    0xffc63a,
    'coin',
  ),
  boon(
    'boon.glass',
    'Glass Edge',
    '+60% damage, but -25% physical and -15% elemental resistance.',
    { enhancedDamage: 60, physicalResist: -25, fireResist: -15, coldResist: -15, lightningResist: -15, poisonResist: -15, arcaneResist: -15 },
    0xb8e8ff,
    'sword',
  ),
  boon(
    'boon.iron',
    'Iron Vow',
    '+15% damage reduction and +60% defense, but -20% movement speed.',
    { damageReduction: 15, enhancedDefense: 60, moveSpeed: -20 },
    0x9aa4b0,
    'shield',
  ),
  boon('boon.quicksilver', 'Quicksilver', '+25% movement, +20% attack and cast speed.', { moveSpeed: 25, attackSpeed: 20, castSpeed: 20 }, 0x8fe0ff, 'speed'),
  boon('boon.soulwell', 'Soul Well', '+100% mana regeneration and +15% cast speed.', { manaRegen: 100, castSpeed: 15 }, 0x4a7cff, 'mana'),
  boon(
    'boon.hunted',
    'Marked for the Hunt',
    'Monsters know where you are. +30% magic find while it lasts.',
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
  { id: 'blood', name: 'Blood Tithe', gain: '+40% damage for 3 minutes', cost: 'Lose 30% of your life', costKind: 'life30', status: 'boon.bloodlust', weight: 10, minDepth: 1 },
  { id: 'gilded', name: 'Gilded Fever', gain: '+100% magic and gold find for 3 minutes', cost: '-20% to all resistances while it lasts', costKind: 'none', status: 'boon.gilded', weight: 9, minDepth: 1 },
  { id: 'glass', name: 'Glass Edge', gain: '+60% damage for 3 minutes', cost: 'Your resistances drop while it lasts', costKind: 'none', status: 'boon.glass', weight: 8, minDepth: 3 },
  { id: 'iron', name: 'Iron Vow', gain: '+15% damage reduction, +60% defense for 3 minutes', cost: '-20% movement speed while it lasts', costKind: 'none', status: 'boon.iron', weight: 8, minDepth: 1 },
  { id: 'quick', name: 'Quicksilver', gain: '+25% movement, +20% attack and cast speed for 3 minutes', cost: 'Lose 20% of your life', costKind: 'life20', status: 'boon.quicksilver', weight: 8, minDepth: 1 },
  { id: 'well', name: 'Soul Well', gain: '+100% mana regeneration, +15% cast speed for 3 minutes', cost: 'Lose 20% of your mana', costKind: 'mana20', status: 'boon.soulwell', weight: 7, minDepth: 1 },
  { id: 'tithe', name: 'Golden Tithe', gain: 'A rare item now, sometimes better', cost: 'Pay a fifth of the gold you carry', costKind: 'gold20', reward: 'item', weight: 8, minDepth: 1 },
  { id: 'hunt', name: 'Call the Hunt', gain: 'An elite pack that drops a guaranteed rare, and +30% magic find', cost: 'The elites come for you now', costKind: 'elites', status: 'boon.hunted', weight: 7, minDepth: 2 },
  { id: 'rest', name: 'Respite', gain: 'Fully restore life and mana', cost: '', costKind: 'none', reward: 'restore', weight: 6, minDepth: 1 },
];

export function getBargain(id: string): BargainDef | undefined {
  return BARGAINS.find((b) => b.id === id);
}
