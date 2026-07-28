/**
 * SLAY — the character object and every legal mutation of it.
 *
 * Creation, experience, level-ups, attribute and skill allocation with full
 * prerequisite validation, and equipment with requirement checks plus
 * two-hander / off-hand conflict resolution.
 *
 * Nothing here touches presentation: it emits on the bus and lets the UI and FX
 * layers react.
 */

import type {
  CharClassId,
  Character,
  EquipSlot,
  Item,
  ItemBase,
  ItemMod,
  Rng,
  Stats,
} from '../types';
import { events } from '../core/Events';
import { INVENTORY_SIZE } from '../core/Save';
import { CLASS_BY_ID, getClass, STARTING_SKILL_HINTS } from '../data/classes';
import {
  SKILLS,
  SKILL_BY_ID,
  TREE_BY_ID,
  tierLevelRequirement,
  tierPointRequirement,
  treesForClass,
} from '../data/skills';
import { MAX_LEVEL, computeStats, effectiveRank, xpForLevel } from './Stats';
import { skillPointsForLevel, statPointsForLevel } from './Progression';
import { getBase } from './Loot';

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

function uid(rng: Rng, prefix: string): string {
  const a = rng.int(0, 0xffffff).toString(36);
  const b = rng.int(0, 0xffffff).toString(36);
  return `${prefix}_${a}${b}`;
}

/**
 * Builds a plain normal-rarity item from a base id, rolling its implicits.
 * Starting gear only — everything else in the game comes from `Loot.rollItem`.
 */
function makeStartingItem(baseId: string, rng: Rng): Item | null {
  let base: ItemBase;
  try {
    base = getBase(baseId);
  } catch {
    return null;
  }
  if (!base) return null;
  const mods: ItemMod[] = [];
  for (const imp of base.implicits ?? []) {
    mods.push({
      affixId: `implicit.${imp.stat}`,
      stat: imp.stat,
      value: rng.int(Math.round(imp.min), Math.round(imp.max)),
      tier: 1,
      kind: 'implicit',
    });
  }
  return {
    uid: uid(rng, 'it'),
    baseId: base.id,
    name: base.name,
    rarity: 'normal',
    ilvl: 1,
    mods,
    upgrade: 0,
    sockets: [],
    value: 10,
    seen: true,
  };
}

export function createCharacter(name: string, classId: CharClassId, rng: Rng): Character {
  const cls = CLASS_BY_ID[classId] ? getClass(classId) : getClass('warden');
  const c: Character = {
    id: uid(rng, 'char'),
    name: name.trim() || cls.name,
    classId: cls.id,
    level: 1,
    xp: 0,
    statPoints: 0,
    skillPoints: 1,
    allocated: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
    skills: {},
    hotbar: [null, null, null, null, null, null],
    equipment: {},
    inventory: new Array<Item | null>(INVENTORY_SIZE).fill(null),
    gold: 0,
    depthRecord: 0,
    playtime: 0,
    createdAt: Date.now(),
  };

  for (const baseId of cls.startingGear) {
    const item = makeStartingItem(baseId, rng);
    if (!item) continue;
    const res = equipItem(c, item);
    if (!res.ok) addToInventory(c, item);
  }

  // Grant the class's opening attack for free and bind it. A brand new
  // character that cannot attack until it finds the skill tree is the single
  // worst first impression the game can make, and a hotbar full of skills at
  // rank 0 just looks broken.
  const starter = startingSkillFor(cls.id);
  if (starter) {
    c.skills[starter] = 1;
    c.hotbar[0] = starter;
  }

  // Anything else the class recommends is bound only once it has a rank, so the
  // bar never shows a skill the player cannot actually cast.
  const hints = (STARTING_SKILL_HINTS[cls.id] ?? []).filter((id) => id !== starter);
  let slot = 1;
  for (const id of hints) {
    if (slot >= c.hotbar.length) break;
    if ((c.skills[id] ?? 0) > 0) c.hotbar[slot++] = id;
  }

  return c;
}

/**
 * Repairs a character loaded from an older save: strips hotbar entries the
 * player cannot actually cast, and grants the free opening attack if they have
 * none. Without this, a save made before the starter skill existed loads with a
 * bar full of rank-0 skills and no way to fight.
 */
export function repairCharacter(c: Character): boolean {
  let changed = false;

  for (let i = 0; i < c.hotbar.length; i++) {
    const id = c.hotbar[i];
    if (id && (c.skills[id] ?? 0) <= 0) {
      c.hotbar[i] = null;
      changed = true;
    }
  }

  const hasAnyActive = Object.entries(c.skills).some(
    ([id, rank]) => rank > 0 && SKILL_BY_ID[id]?.targeting !== 'passive'
  );
  if (!hasAnyActive) {
    const starter = startingSkillFor(c.classId);
    if (starter) {
      c.skills[starter] = Math.max(1, c.skills[starter] ?? 0);
      changed = true;
    }
  }

  // Make sure every ranked active is reachable from the bar.
  const ranked = Object.entries(c.skills)
    .filter(([id, rank]) => rank > 0 && SKILL_BY_ID[id]?.targeting !== 'passive')
    .map(([id]) => id);
  for (const id of ranked) {
    if (c.hotbar.includes(id)) continue;
    const free = c.hotbar.indexOf(null);
    if (free < 0) break;
    c.hotbar[free] = id;
    changed = true;
  }

  return changed;
}

/**
 * Each class opens with its own signature attack. These are hand-picked rather
 * than derived so the first thirty seconds of a Pyromancer and a Warden feel
 * like different games, which is the whole point of picking a class.
 */
const STARTING_SKILL: Record<CharClassId, string> = {
  warden: 'cleave',        // wide arc, hits the whole pack
  pyromancer: 'firebolt',  // ranged fire dart
  shadowblade: 'preciseCut', // fast single-target crit strike
  stormcaller: 'sparkbolt',  // erratic piercing lightning
  revenant: 'boneSpear',   // piercing bone shard
};

/**
 * The free opening attack. Falls back to the cheapest tier-1 active in the
 * class's trees if the authored pick ever goes missing from the data.
 */
export function startingSkillFor(classId: CharClassId): string | null {
  const authored = STARTING_SKILL[classId];
  if (authored && SKILL_BY_ID[authored]) return authored;
  return derivedStartingSkill(classId);
}

function derivedStartingSkill(classId: CharClassId): string | null {
  const cls = CLASS_BY_ID[classId] ? getClass(classId) : getClass('warden');
  const candidates = SKILLS.filter(
    (sk) =>
      cls.trees.includes(sk.treeId) &&
      sk.tier === 1 &&
      sk.targeting !== 'passive' &&
      !sk.requires?.length
  );
  if (candidates.length === 0) return null;
  // Prefer a skill with no cooldown — a spammable basic attack.
  const spammable = candidates.filter((sk) => !sk.cooldown || sk.cooldown(1) <= 0);
  const pool = spammable.length ? spammable : candidates;
  // Prefer the cheapest to cast so level 1 can actually use it repeatedly.
  pool.sort((a, b) => (a.manaCost?.(1) ?? 0) - (b.manaCost?.(1) ?? 0));
  return pool[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Inventory plumbing
// ---------------------------------------------------------------------------

export function firstFreeInventorySlot(c: Character): number {
  return c.inventory.indexOf(null);
}

export function addToInventory(c: Character, item: Item): boolean {
  const i = firstFreeInventorySlot(c);
  if (i < 0) return false;
  c.inventory[i] = item;
  return true;
}

export function removeFromInventory(c: Character, uidToRemove: string): Item | null {
  const i = c.inventory.findIndex((it) => it?.uid === uidToRemove);
  if (i < 0) return null;
  const item = c.inventory[i] ?? null;
  c.inventory[i] = null;
  return item;
}

export function inventoryFreeSlots(c: Character): number {
  let n = 0;
  for (const slot of c.inventory) if (!slot) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Experience and levelling
// ---------------------------------------------------------------------------

/** Grants XP, resolving as many level-ups as it earns. True if any happened. */
export function grantXp(c: Character, amount: number): boolean {
  if (!isFinite(amount) || amount <= 0) return false;
  if (c.level >= MAX_LEVEL) {
    events.emit('player:xp', { gained: 0, total: c.xp, toNext: 0 });
    return false;
  }

  c.xp += Math.floor(amount);
  let levelled = false;

  while (c.level < MAX_LEVEL) {
    const need = xpForLevel(c.level);
    if (!isFinite(need) || c.xp < need) break;
    c.xp -= need;
    c.level++;
    levelled = true;

    const statGain = statPointsForLevel(c.level);
    const skillGain = skillPointsForLevel(c.level);
    c.statPoints += statGain;
    c.skillPoints += skillGain;

    events.emit('player:levelUp', {
      level: c.level,
      statPoints: c.statPoints,
      skillPoints: c.skillPoints,
    });
  }

  if (c.level >= MAX_LEVEL) c.xp = 0;

  events.emit('player:xp', {
    gained: Math.floor(amount),
    total: c.xp,
    toNext: c.level >= MAX_LEVEL ? 0 : xpForLevel(c.level),
  });

  return levelled;
}

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

export type AttributeKey = 'strength' | 'dexterity' | 'vitality' | 'energy';

export function allocateStat(c: Character, stat: AttributeKey): boolean {
  if (c.statPoints <= 0) return false;
  if (c.allocated[stat] === undefined) return false;
  c.allocated[stat]++;
  c.statPoints--;
  events.emit('ui:refresh', {});
  return true;
}

/** Spends `n` points at once; returns how many were actually spent. */
export function allocateStats(c: Character, stat: AttributeKey, n: number): number {
  let spent = 0;
  for (let i = 0; i < n; i++) {
    if (!allocateStat(c, stat)) break;
    spent++;
  }
  return spent;
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/** Hard points in a skill, ignoring `+skills` from gear. */
export function skillRank(c: Character, skillId: string): number {
  return c.skills[skillId] ?? 0;
}

/** Rank including `+skills` from gear and buffs — what the game actually uses. */
export function effectiveSkillRank(c: Character, skillId: string, stats?: Stats): number {
  const hard = skillRank(c, skillId);
  if (hard <= 0) return 0;
  const s = stats ?? computeStats(c);
  return effectiveRank(hard, s.skillLevels);
}

/** Total hard points spent in one tree. */
export function pointsInTree(c: Character, treeId: string): number {
  let total = 0;
  for (const id of Object.keys(c.skills)) {
    const def = SKILL_BY_ID[id];
    if (def?.treeId === treeId) total += c.skills[id] ?? 0;
  }
  return total;
}

/** Total hard points spent across every tree. */
export function pointsSpent(c: Character): number {
  let total = 0;
  for (const id of Object.keys(c.skills)) total += c.skills[id] ?? 0;
  return total;
}

export function canAllocateSkill(c: Character, skillId: string): { ok: boolean; reason?: string } {
  const def = SKILL_BY_ID[skillId];
  if (!def) return { ok: false, reason: 'Unknown skill.' };

  const tree = TREE_BY_ID[def.treeId];
  if (!tree) return { ok: false, reason: 'Unknown skill tree.' };
  if (tree.classId !== c.classId) return { ok: false, reason: `${tree.name} belongs to another class.` };

  if (c.skillPoints <= 0) return { ok: false, reason: 'No skill points available.' };

  const rank = skillRank(c, skillId);
  if (rank >= def.maxRank) return { ok: false, reason: `Already at maximum rank (${def.maxRank}).` };

  const levelReq = tierLevelRequirement(def.tier);
  if (c.level < levelReq) return { ok: false, reason: `Requires character level ${levelReq}.` };

  const pointReq = tierPointRequirement(def.tier);
  const spent = pointsInTree(c, def.treeId);
  if (spent < pointReq) {
    return { ok: false, reason: `Requires ${pointReq} points in ${tree.name} (you have ${spent}).` };
  }

  for (const reqId of def.requires ?? []) {
    if (skillRank(c, reqId) < 1) {
      const reqDef = SKILL_BY_ID[reqId];
      return { ok: false, reason: `Requires 1 point in ${reqDef?.name ?? reqId}.` };
    }
  }

  return { ok: true };
}

export function allocateSkill(c: Character, skillId: string): boolean {
  const check = canAllocateSkill(c, skillId);
  if (!check.ok) return false;
  c.skills[skillId] = (c.skills[skillId] ?? 0) + 1;
  c.skillPoints--;

  // Auto-bind the first active skill learned to a free hotbar slot.
  const def = SKILL_BY_ID[skillId];
  if (def && def.targeting !== 'passive' && !c.hotbar.includes(skillId)) {
    const free = c.hotbar.indexOf(null);
    if (free >= 0) c.hotbar[free] = skillId;
  }

  events.emit('ui:refresh', {});
  return true;
}

/**
 * Removing a point is only legal when nothing else still depends on it — this
 * is what the blacksmith's partial respec uses.
 */
export function canDeallocateSkill(c: Character, skillId: string): { ok: boolean; reason?: string } {
  const def = SKILL_BY_ID[skillId];
  if (!def) return { ok: false, reason: 'Unknown skill.' };
  const rank = skillRank(c, skillId);
  if (rank <= 0) return { ok: false, reason: 'No points invested.' };

  if (rank === 1) {
    for (const id of Object.keys(c.skills)) {
      if ((c.skills[id] ?? 0) <= 0) continue;
      const other = SKILL_BY_ID[id];
      if (other?.requires?.includes(skillId)) {
        return { ok: false, reason: `${other.name} still requires it.` };
      }
    }
  }

  // Removing the point must not drop a higher tier below its gate.
  const treeTotal = pointsInTree(c, def.treeId);
  let highestTierUsed = 0;
  for (const id of Object.keys(c.skills)) {
    if ((c.skills[id] ?? 0) <= 0) continue;
    const other = SKILL_BY_ID[id];
    if (other?.treeId === def.treeId && other.tier > highestTierUsed) highestTierUsed = other.tier;
  }
  if (treeTotal - 1 < tierPointRequirement(highestTierUsed)) {
    return { ok: false, reason: 'Higher tier skills in this tree would become invalid.' };
  }

  return { ok: true };
}

export function deallocateSkill(c: Character, skillId: string): boolean {
  if (!canDeallocateSkill(c, skillId).ok) return false;
  const rank = skillRank(c, skillId);
  if (rank <= 1) delete c.skills[skillId];
  else c.skills[skillId] = rank - 1;
  c.skillPoints++;
  events.emit('ui:refresh', {});
  return true;
}

/** Skills the character can see: every skill in their three trees. */
export function availableSkills(c: Character): string[] {
  const trees = new Set(treesForClass(c.classId).map((t) => t.id));
  return Object.keys(SKILL_BY_ID).filter((id) => trees.has(SKILL_BY_ID[id]!.treeId));
}

export function bindHotbar(c: Character, index: number, skillId: string | null): boolean {
  if (index < 0 || index >= c.hotbar.length) return false;
  if (skillId && skillRank(c, skillId) <= 0) return false;
  c.hotbar[index] = skillId;
  events.emit('ui:refresh', {});
  return true;
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

const RING_SLOTS: readonly EquipSlot[] = ['ring1', 'ring2'];

function baseOf(item: Item): ItemBase | null {
  try {
    return getBase(item.baseId) ?? null;
  } catch {
    return null;
  }
}

function isTwoHanded(item: Item): boolean {
  return baseOf(item)?.slot === 'twoHand';
}

/** The slot(s) an item is legally allowed to occupy. */
export function slotsFor(item: Item): EquipSlot[] {
  const base = baseOf(item);
  if (!base) return [];
  if (base.slot === 'twoHand') return ['mainHand'];
  if (base.slot === 'consumable' || base.slot === 'none') return [];
  if (base.category === 'ring') return [...RING_SLOTS];
  return [base.slot];
}

/** Attribute / level / class gate. */
export function meetsRequirements(c: Character, item: Item, stats?: Stats): { ok: boolean; reason?: string } {
  const base = baseOf(item);
  if (!base) return { ok: false, reason: 'Unknown item base.' };
  if (base.classes && base.classes.length > 0 && !base.classes.includes(c.classId)) {
    return { ok: false, reason: 'Your class cannot use this.' };
  }
  const levelReq = base.levelReq + item.upgrade;
  if (c.level < levelReq) return { ok: false, reason: `Requires level ${levelReq}.` };

  const s = stats ?? computeStats(c);
  if (base.strReq && s.strength < base.strReq) {
    return { ok: false, reason: `Requires ${base.strReq} strength.` };
  }
  if (base.dexReq && s.dexterity < base.dexReq) {
    return { ok: false, reason: `Requires ${base.dexReq} dexterity.` };
  }
  return { ok: true };
}

/**
 * Equips an item, resolving conflicts:
 *  - a two-handed weapon displaces whatever is in the off-hand;
 *  - an off-hand item displaces a two-handed weapon;
 *  - a ring goes to the first free ring slot, or ring1 if both are full
 *    (unless the caller names a slot).
 *
 * Displaced items are returned AND placed back into the inventory. If there is
 * no room for them the equip is refused so nothing is ever destroyed.
 */
export function equipItem(
  c: Character,
  item: Item,
  slot?: EquipSlot,
): { ok: boolean; reason?: string; displaced?: Item[] } {
  const legal = slotsFor(item);
  if (legal.length === 0) return { ok: false, reason: 'This item cannot be equipped.' };

  let target: EquipSlot;
  if (slot) {
    if (!legal.includes(slot)) return { ok: false, reason: 'Wrong slot for this item.' };
    target = slot;
  } else if (legal.length > 1) {
    target = legal.find((s) => !c.equipment[s]) ?? legal[0]!;
  } else {
    target = legal[0]!;
  }

  const stats = computeStats(c);
  const req = meetsRequirements(c, item, stats);
  if (!req.ok) return { ok: false, reason: req.reason };

  // Work out everything this equip pushes out.
  const displaced: Item[] = [];
  const existing = c.equipment[target];
  if (existing) displaced.push(existing);

  const twoHand = isTwoHanded(item);
  if (target === 'mainHand' && twoHand) {
    const off = c.equipment.offHand;
    if (off) displaced.push(off);
  }
  if (target === 'offHand') {
    const main = c.equipment.mainHand;
    if (main && isTwoHanded(main) && !displaced.includes(main)) displaced.push(main);
  }

  // The incoming item may already be sitting in the inventory; that slot frees
  // up, so it counts toward the room available for displaced gear.
  const fromInventory = c.inventory.some((it) => it?.uid === item.uid);
  const room = inventoryFreeSlots(c) + (fromInventory ? 1 : 0);
  if (displaced.length > room) {
    return { ok: false, reason: 'Not enough inventory space.' };
  }

  if (fromInventory) removeFromInventory(c, item.uid);

  for (const d of displaced) {
    for (const s of Object.keys(c.equipment) as EquipSlot[]) {
      if (c.equipment[s]?.uid === d.uid) delete c.equipment[s];
    }
    addToInventory(c, d);
    events.emit('item:unequipped', { item: d });
  }

  c.equipment[target] = item;
  item.seen = true;
  events.emit('item:equipped', { item });
  events.emit('ui:refresh', {});
  return { ok: true, displaced };
}

export function unequipItem(c: Character, slot: EquipSlot): boolean {
  const item = c.equipment[slot];
  if (!item) return false;
  if (!addToInventory(c, item)) return false;
  delete c.equipment[slot];
  events.emit('item:unequipped', { item });
  events.emit('ui:refresh', {});
  return true;
}

/** True when the main hand is a two-handed weapon (blocks off-hand use). */
export function usingTwoHander(c: Character): boolean {
  const main = c.equipment.mainHand;
  return !!main && isTwoHanded(main);
}

/** Sum of gold, for the vendor UI. */
export function addGold(c: Character, amount: number): void {
  c.gold = Math.max(0, Math.floor(c.gold + amount));
  events.emit('loot:gold', { amount });
}

export function spendGold(c: Character, amount: number): boolean {
  if (amount <= 0) return true;
  if (c.gold < amount) return false;
  c.gold -= Math.floor(amount);
  return true;
}
