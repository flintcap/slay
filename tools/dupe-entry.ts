/**
 * Entry point for `tools/check-dupe.mjs`.
 *
 * Reported: "i just equipped an item to my off hand on the shadowblade class
 * and it duped the item to my main hand".
 *
 * `equipItem` assigned the target slot but never vacated whatever slot the item
 * was already in, so moving a one-hander from the main hand to the off hand —
 * a legal move on a dual-wield class — left the same object in both.
 *
 * The invariant that catches the whole family: **no item uid may appear twice**
 * across the equipment and the pack, after any sequence of equips. This drives
 * every class through every slot-to-slot move it can make and checks it, plus
 * the matching one for loss — an item must never simply vanish either.
 */
import { createCharacter, equipItem, unequipItem, addToInventory, slotsFor } from '../src/sim/Character';
import { newItem, getBase } from '../src/sim/Loot';
import { ITEM_BASES } from '../src/data/itemBases';
import { CLASSES } from '../src/data/classes';
import { ONE_HAND_MELEE } from '../src/data/itemBases';
import { Random } from '../src/core/RNG';
import type { Character, EquipSlot, Item } from '../src/types';

const SLOTS: EquipSlot[] = [
  'mainHand', 'offHand', 'helm', 'chest', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2',
];

/** Every uid the character holds anywhere, with how many places it sits in. */
function census(c: Character): Map<string, number> {
  const seen = new Map<string, number>();
  const bump = (it: Item | null | undefined): void => {
    if (!it) return;
    seen.set(it.uid, (seen.get(it.uid) ?? 0) + 1);
  };
  for (const s of SLOTS) bump(c.equipment[s]);
  for (const it of c.inventory) bump(it);
  return seen;
}

interface Case {
  cls: string;
  what: string;
  dupes: string[];
  lost: string[];
}

const cases: Case[] = [];

for (const def of CLASSES) {
  // Weapons and armour this class can actually wear, one base per category.
  const wearable: string[] = [];
  const seenCat = new Set<string>();
  for (const b of ITEM_BASES) {
    if (b.slot === 'consumable' || b.slot === 'none') continue;
    if (b.levelReq > 1) continue;
    if (seenCat.has(b.category)) continue;
    seenCat.add(b.category);
    wearable.push(b.id);
  }

  for (const baseId of wearable) {
    const base = getBase(baseId);
    if (!base) continue;
    const legal = slotsFor({ baseId } as Item, def.id);
    // Only items with more than one legal home can be moved between slots, and
    // that move is the one that duplicated.
    if (legal.length < 2) continue;

    for (const from of legal) {
      for (const to of legal) {
        if (from === to) continue;
        const rng = new Random(0x0d0e);
        const c = createCharacter('Dupe Test', def.id, rng);
        // Clear whatever the class started in, so only the test item matters.
        for (const s of SLOTS) delete c.equipment[s];
        for (let i = 0; i < c.inventory.length; i++) c.inventory[i] = null;

        // A one-hander in the off hand wants a partner in the main hand, so
        // give the character a second weapon it can pair with.
        const partner = newItem(getBase('sword.short')!, 1, 'normal', rng);
        const item = newItem(base, 1, 'normal', rng);
        addToInventory(c, partner);
        addToInventory(c, item);

        const before = census(c);
        equipItem(c, partner, 'mainHand');
        if (!equipItem(c, item, from).ok) continue;
        // The move under test.
        equipItem(c, item, to);

        const after = census(c);
        const dupes: string[] = [];
        for (const [uid, n] of after) if (n > 1) dupes.push(`${uid} x${n}`);
        const lost: string[] = [];
        for (const uid of before.keys()) if (!after.has(uid)) lost.push(uid);

        if (dupes.length || lost.length) {
          cases.push({ cls: def.id, what: `${baseId} ${from} -> ${to}`, dupes, lost });
        }
      }
    }
  }
}

// And the plain round trip: equip, unequip, equip again, for every slot.
for (const def of CLASSES) {
  const rng = new Random(0x0d0f);
  const c = createCharacter('Round Trip', def.id, rng);
  for (const s of SLOTS) delete c.equipment[s];
  for (let i = 0; i < c.inventory.length; i++) c.inventory[i] = null;
  const item = newItem(getBase('helm.cap')!, 1, 'normal', rng);
  addToInventory(c, item);
  equipItem(c, item, 'helm');
  unequipItem(c, 'helm');
  equipItem(c, item, 'helm');
  const after = census(c);
  const dupes = [...after].filter(([, n]) => n > 1).map(([uid, n]) => `${uid} x${n}`);
  if (dupes.length) cases.push({ cls: def.id, what: 'helm equip/unequip/equip', dupes, lost: [] });
}

/**
 * An off-hand weapon needs a partner in the main hand, and the rule that
 * enforces it now looks at what the main hand holds *after* the equip. Rolling
 * a fresh character equips its gear one piece at a time, so a bad ordering
 * could leave a weapon in the off hand with an empty main hand — legal by
 * accident, and not a state any rule should be able to produce.
 */
const orphans: Array<{ cls: string; off: string }> = [];
for (const def of CLASSES) {
  for (let seed = 0; seed < 24; seed++) {
    const c = createCharacter('Start', def.id, new Random(0x5747 + seed * 131));
    const off = c.equipment.offHand;
    if (!off) continue;
    const offBase = getBase(off.baseId);
    if (!offBase || !ONE_HAND_MELEE.has(offBase.category)) continue;
    if (!c.equipment.mainHand) orphans.push({ cls: def.id, off: off.baseId });
  }
}

console.log(
  JSON.stringify({
    classes: CLASSES.map((d) => d.id),
    cases,
    orphans,
  }),
);
