/**
 * SLAY — the blacksmith.
 *
 * Crafting exists because of the roguelike loop. You lose a character and
 * everything on them; what you keep is the stash and the materials. So the
 * bench has to be the thing that turns "I found a good base" into "I have a
 * weapon", repeatedly, for every character you roll.
 *
 * Six operations, each with its own currency:
 *
 * - **Upgrade** (gold + tier-appropriate materials) — the main progression
 *   sink. Twelve levels in four named tiers, each adding +10% of the item's
 *   base damage/defence and +4% to every rolled modifier. A fully upgraded
 *   item is roughly a tier-and-a-half of base above where it started, which is
 *   enough to keep a beloved level-40 unique relevant at level 60.
 * - **Reroll** (Sigil of Chaos) — reroll every affix on a magic or rare item.
 *   Keeps the base, the sockets and the item level. Up to two lines can be
 *   bound with cloth (hide, Gloomsilk, Starcloth) and come through unchanged.
 * - **Hone** (a beast, demon or titan heart) — one line a rung up its ladder.
 *   Once per item.
 * - **Socket** (shards) — add one socket, up to the base's cap. Escalating
 *   cost per socket, so six-socketing a two-hander is a project.
 * - **Gem insert / remove** — free to insert, destructive to remove unless you
 *   pay a Sigil of Order.
 * - **Salvage** — break an item down for materials scaled by rarity and level.
 */

import type { AffixTier, Item, ItemMod, ItemRarity, Rng, StatKey } from '../types';
import { save } from '../core/Save';
import { AFFIXES, getBase, rollAffixesKeeping, rollFreshAffixes } from './Loot';
import { maxSockets } from '../data/itemBases';
import { getSocketable, gemUpgradeRecipe, GEMS } from '../data/gems';
import { formatMaterials, materialName, salvagePool } from '../data/materials';
import { legacySalvageMultiplier } from './Legacy';
import { tr } from '../core/I18n';

export type CraftResult = { ok: boolean; reason?: string };

export interface CraftCost {
  gold: number;
  materials: Record<string, number>;
}

/** A bench entry, rendered by the blacksmith panel. */
export interface CraftRecipe {
  id: string;
  name: string;
  desc: string;
  category: 'upgrade' | 'affix' | 'socket' | 'gem' | 'salvage' | 'transmute';
  /** Human-readable input requirement. */
  requires: string;
  /** Human-readable output. */
  output: string;
  /** Representative cost. Per-item costs are computed by `upgradeCost` etc. */
  cost: CraftCost;
  /** Depth at which the recipe becomes available at the bench. */
  unlockDepth: number;
}

// ---------------------------------------------------------------------------
// Upgrade tiers
// ---------------------------------------------------------------------------

export const MAX_UPGRADE = 12;

export interface UpgradeTier {
  name: string;
  /** Highest upgrade level in this tier. */
  max: number;
  /** Material used for every step in the tier. */
  material: string;
  /** Secondary material, consumed from the top of the tier upward. */
  catalyst?: string;
  color: string;
}

export const UPGRADE_TIERS: UpgradeTier[] = [
  { name: tr('Reinforced'), max: 3, material: 'shard.iron', color: '#c8c8c8' },
  { name: tr('Tempered'), max: 6, material: 'shard.steel', catalyst: 'essence.lesser', color: '#6f8cff' },
  { name: tr('Masterwork'), max: 9, material: 'shard.mithral', catalyst: 'essence.greater', color: '#f5d76e' },
  { name: tr('Mythforged'), max: 12, material: 'shard.adamant', catalyst: 'essence.pure', color: '#c060ff' },
];

function tierFor(upgradeLevel: number): UpgradeTier {
  for (const tier of UPGRADE_TIERS) if (upgradeLevel <= tier.max) return tier;
  return UPGRADE_TIERS[UPGRADE_TIERS.length - 1];
}

/** "Tempered +5", or an empty string at +0. */
export function upgradeTierName(item: Item): string {
  if (item.upgrade <= 0) return '';
  return `${tierFor(item.upgrade).name} +${item.upgrade}`;
}

const RARITY_COST_MUL: Record<ItemRarity, number> = {
  normal: 1,
  magic: 1.35,
  rare: 1.9,
  set: 2.6,
  unique: 3.1,
  mythic: 5,
  ancient: 8,
};

// ---------------------------------------------------------------------------
// Upgrade
// ---------------------------------------------------------------------------

/**
 * Cost of taking an item from its current upgrade level to the next one.
 * Returns a zero cost when the item is already at maximum — check
 * `canUpgrade` (or just call `upgradeItem`) rather than reading the cost.
 */
export function upgradeCost(item: Item): CraftCost {
  const base = getBase(item.baseId);
  const next = item.upgrade + 1;
  if (next > MAX_UPGRADE) return { gold: 0, materials: {} };

  const tier = tierFor(next);
  const levelFactor = 1 + base.levelReq * 0.06;
  const rarityFactor = RARITY_COST_MUL[item.rarity] ?? 1;

  // Gold escalates ~55% per step, so the last three levels cost more than the
  // first nine put together.
  const gold = Math.round(140 * Math.pow(1.55, next - 1) * levelFactor * rarityFactor);

  const materials: Record<string, number> = {};
  const stepInTier = next - (tier.max - 2);
  materials[tier.material] = Math.max(1, 2 + next * 2);
  if (tier.catalyst) materials[tier.catalyst] = Math.max(1, stepInTier);
  // The final step of the top tier wants something genuinely rare.
  if (next === MAX_UPGRADE) materials['catalyst.eternity'] = 1;
  else if (next === MAX_UPGRADE - 1) materials['catalyst.order'] = 2;

  return { gold, materials };
}

export function canUpgrade(item: Item): CraftResult {
  const base = getBase(item.baseId);
  if (base.slot === 'none' || base.slot === 'consumable') {
    return { ok: false, reason: tr('This cannot be upgraded.') };
  }
  if (item.upgrade >= MAX_UPGRADE) return { ok: false, reason: tr('Already fully upgraded.') };
  return { ok: true };
}

/** Takes a cost from the current character's gold and the account's materials. */
export function spendCost(cost: CraftCost): CraftResult {
  const character = save.account.current;
  const gold = character ? character.gold : save.account.bankGold;
  if (gold < cost.gold) return { ok: false, reason: tr('Not enough gold (need {0}).', cost.gold) };
  for (const id of Object.keys(cost.materials)) {
    const need = cost.materials[id] ?? 0;
    if (save.materialCount(id) < need) {
      return { ok: false, reason: tr('Need {0} {1}.', need, materialName(id)) };
    }
  }
  if (character) character.gold -= cost.gold;
  else save.account.bankGold -= cost.gold;
  for (const id of Object.keys(cost.materials)) {
    const need = cost.materials[id] ?? 0;
    if (need) save.addMaterial(id, -need);
  }
  save.touch();
  return { ok: true };
}

/**
 * Applies one upgrade level. The stat scaling itself lives in
 * `Loot.itemStats`, which reads `item.upgrade` — this only has to move the
 * counter and take the payment, which keeps upgraded items correct even if the
 * scaling formula is retuned later.
 */
export function upgradeItem(item: Item, rng: Rng): CraftResult {
  const check = canUpgrade(item);
  if (!check.ok) return check;
  const paid = spendCost(upgradeCost(item));
  if (!paid.ok) return paid;
  applyUpgrade(item, rng);
  save.touch();
  return { ok: true };
}

/**
 * One upgrade level with no payment, for the anvil's preview of a throwaway
 * clone. The preview used to call `upgradeItem` itself, which charged the
 * real hero's gold and materials every time an item was put on the anvil.
 * Pass `rng: null` to leave out the chance bonus, so the preview shows the
 * sure result.
 */
export function applyUpgrade(item: Item, rng: Rng | null): void {
  item.upgrade++;

  // Crossing into a new tier occasionally awards a small bonus roll on one
  // existing modifier — the "it came out of the quench better than it went in"
  // moment that makes people upgrade the item they like instead of the best one.
  const tier = tierFor(item.upgrade);
  const crossedTier = item.upgrade === tier.max - 2;
  if (rng && crossedTier && item.mods.length > 0 && rng.chance(0.35)) {
    // Only a line that helps you: scaling a negative line (a curse, a cost)
    // made it worse, which is the opposite of what the bonus promises.
    const rolled = item.mods.filter((m) => m.kind !== 'implicit' && m.value > 0);
    if (rolled.length > 0) {
      const mod = rng.pick(rolled);
      mod.value = Math.round(mod.value * rng.range(1.04, 1.12)) || mod.value + 1;
    }
  }

  item.value = Math.round(item.value * 1.18);
}

// ---------------------------------------------------------------------------
// Affix reroll
// ---------------------------------------------------------------------------

/** How many lines a reroll may bind and keep, by rarity. */
export function maxLocks(item: Item): number {
  return item.rarity === 'rare' ? 2 : item.rarity === 'magic' ? 1 : 0;
}

/** What binds a line through a reroll, by how deep the item was found. */
function bindMaterial(ilvl: number): string {
  if (ilvl >= 60) return 'reagent.starcloth';
  if (ilvl >= 16) return 'reagent.silk';
  return 'reagent.hide';
}

/** A reroll's cost. Each bound line adds gold and binding cloth, the second more than the first. */
export function rerollCost(item: Item, locks = 0): CraftCost {
  const base = getBase(item.baseId);
  const gold = Math.round((400 + base.levelReq * 90) * (RARITY_COST_MUL[item.rarity] ?? 1) * (1 + 0.5 * locks));
  const materials: Record<string, number> = {};
  if (item.ilvl >= 58) materials['catalyst.chaos'] = 1;
  else materials['catalyst.order'] = 1;
  materials['essence.lesser'] = item.rarity === 'rare' ? 4 : 2;
  if (item.ilvl >= 40) materials['essence.greater'] = item.rarity === 'rare' ? 2 : 1;
  if (locks > 0) materials[bindMaterial(item.ilvl)] = locks === 1 ? 2 : 5;
  return { gold, materials };
}

/**
 * Rerolls every non-implicit modifier on a magic or rare item, except the
 * prefixes and suffixes at the indexes in `locked`, which stay exactly as they
 * are. The affix count is rerolled too, so this is a real gamble rather than
 * a guaranteed sidegrade.
 */
export function rerollAffixes(item: Item, rng: Rng, locked: number[] = []): CraftResult {
  if (item.rarity !== 'magic' && item.rarity !== 'rare') {
    return { ok: false, reason: tr('Only magic and rare items can be reforged.') };
  }
  const keepAt = [...new Set(locked)];
  if (keepAt.length > maxLocks(item)) return { ok: false, reason: tr('At most {0} line(s) can be bound.', maxLocks(item)) };
  const keep: ItemMod[] = [];
  for (const i of keepAt) {
    const m = item.mods[i];
    if (!m || (m.kind !== 'prefix' && m.kind !== 'suffix')) return { ok: false, reason: tr('Only a prefix or suffix can be bound.') };
    keep.push(m);
  }
  const paid = spendCost(rerollCost(item, keep.length));
  if (!paid.ok) return paid;

  const implicits = item.mods.filter((m) => m.kind === 'implicit');
  // The same roller a drop uses, so the line count and every allowed ladder
  // (a charm's size above all) match what the floor could have thrown.
  const rolled = keep.length ? rollAffixesKeeping(item, keep, rng) : rollFreshAffixes(item, rng);

  item.mods = [...implicits, ...rolled];
  // The Enchanter's mark goes with its line; offers on the table go stale.
  if (item.enchantedMod && !keep.some((m) => m.affixId === item.enchantedMod)) item.enchantedMod = undefined;
  item.offers = undefined;
  save.touch();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Hone
// ---------------------------------------------------------------------------

/** How far past its own item level a honed rung may reach. */
export const HONE_REACH = 10;

/** The rung a line would hone up to, or null when it cannot. */
export function honeTarget(item: Item, index: number): AffixTier | null {
  const mod = item.mods[index];
  if (!mod || (mod.kind !== 'prefix' && mod.kind !== 'suffix') || mod.value <= 0) return null;
  const affix = AFFIXES.find((a) => a.id === mod.affixId);
  const next = affix?.tiers.find((t) => t.tier === mod.tier + 1);
  if (!next || next.ilvl > item.ilvl + HONE_REACH || next.max <= mod.value) return null;
  return next;
}

/** Whether this line can be honed. One line per item, magic and rare only. */
export function canHone(item: Item, index: number): CraftResult {
  if (item.rarity !== 'magic' && item.rarity !== 'rare') return { ok: false, reason: tr('Only magic and rare items can be honed.') };
  if (item.mods.some((m) => m.honed)) return { ok: false, reason: tr('One line on this item is already honed.') };
  const mod = item.mods[index];
  if (!mod || (mod.kind !== 'prefix' && mod.kind !== 'suffix')) return { ok: false, reason: tr('Only a prefix or suffix can be honed.') };
  if (!honeTarget(item, index)) return { ok: false, reason: tr('That line is as fine as this item can hold.') };
  return { ok: true };
}

export function honeCost(item: Item): CraftCost {
  const gold = Math.round((300 + Math.pow(item.ilvl, 1.4) * 30) * (item.rarity === 'rare' ? 1.5 : 1));
  // A heart for the line and metal for the edge, by how deep it was found.
  const materials: Record<string, number> =
    item.ilvl >= 62
      ? { 'core.titan': 1, 'shard.adamant': 2 }
      : item.ilvl >= 32
        ? { 'core.demon': 1, 'shard.mithral': 3 }
        : item.ilvl >= 15
          ? { 'core.beast': 1, 'shard.steel': 3 }
          : { 'shard.iron': 6, 'dust.grave': 4 };
  return { gold, materials };
}

/**
 * Moves one line a rung up its ladder: the next tier's value, and never less
 * than one more than it had. Marks the line honed; no other line on the item
 * may be honed after it.
 */
export function honeLine(item: Item, index: number, rng: Rng): CraftResult {
  const check = canHone(item, index);
  if (!check.ok) return check;
  const next = honeTarget(item, index)!;
  const paid = spendCost(honeCost(item));
  if (!paid.ok) return paid;
  const mod = item.mods[index]!;
  const rolled = next.min === next.max ? next.min : rng.int(next.min, next.max);
  mod.value = Math.max(rolled, mod.value + 1);
  mod.tier = next.tier;
  mod.honed = true;
  item.value = Math.round(item.value * 1.15);
  save.touch();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sockets
// ---------------------------------------------------------------------------

export function socketCost(item: Item): CraftCost {
  const base = getBase(item.baseId);
  const next = item.sockets.length + 1;
  const gold = Math.round(220 * Math.pow(1.8, next - 1) * (1 + base.levelReq * 0.05));
  const materials: Record<string, number> = {};
  if (base.levelReq >= 60) materials['shard.adamant'] = next;
  else if (base.levelReq >= 35) materials['shard.mithral'] = next + 1;
  else materials['shard.steel'] = next + 2;
  if (next >= 4) materials['catalyst.order'] = next - 3;
  return { gold, materials };
}

/** Adds one empty socket, up to the base's cap. */
export function addSocket(item: Item, rng: Rng): CraftResult {
  const base = getBase(item.baseId);
  const cap = maxSockets(base);
  if (cap <= 0) return { ok: false, reason: tr('This item cannot hold sockets.') };
  if (item.sockets.length >= cap) return { ok: false, reason: tr('Cannot hold more than {0} sockets.', cap) };
  // Item level gates socket count the same way it does on drops.
  const ilvlCap = Math.max(1, Math.min(cap, Math.floor(item.ilvl / 14) + 1));
  if (item.sockets.length >= ilvlCap) {
    return { ok: false, reason: tr('Item level {0} supports only {1} socket(s).', item.ilvl, ilvlCap) };
  }
  const paid = spendCost(socketCost(item));
  if (!paid.ok) return paid;

  item.sockets.push({ gemId: null });
  // A small chance the punch goes clean and you get the next one free.
  if (item.sockets.length < ilvlCap && rng.chance(0.06)) item.sockets.push({ gemId: null });
  item.value = Math.round(item.value * 1.1);
  save.touch();
  return { ok: true };
}

/** Puts a gem or rune into a specific socket index. */
export function insertGem(item: Item, gemId: string, socket: number): CraftResult {
  if (socket < 0 || socket >= item.sockets.length) return { ok: false, reason: tr('No such socket.') };
  const slot = item.sockets[socket];
  if (!slot) return { ok: false, reason: tr('No such socket.') };
  if (slot.gemId) return { ok: false, reason: tr('That socket is already filled.') };
  const def = getSocketable(gemId);
  if (!def) return { ok: false, reason: tr('That is not a gem or rune.') };
  const base = getBase(item.baseId);
  if (def.levelReq > base.levelReq + 25) {
    // Say what would work, not just that this does not.
    return {
      ok: false,
      reason: tr('{0} needs a base of level {1} or higher — {2} is level {3}.', def.name, def.levelReq - 25, base.name, base.levelReq),
    };
  }
  slot.gemId = gemId;
  item.value = Math.round(item.value + def.value * 0.5);
  save.touch();
  return { ok: true };
}

export function removeGemCost(): CraftCost {
  return { gold: 500, materials: { 'catalyst.order': 1 } };
}

/**
 * Takes a gem back out. Paying the Sigil of Order preserves it; without one it
 * is destroyed, which is the D2 bargain and keeps early socketing a real
 * decision rather than a free preview.
 */
export function removeGem(item: Item, socket: number, preserve: boolean): { ok: boolean; reason?: string; gemId?: string } {
  if (socket < 0 || socket >= item.sockets.length) return { ok: false, reason: tr('No such socket.') };
  const slot = item.sockets[socket];
  if (!slot || !slot.gemId) return { ok: false, reason: tr('That socket is empty.') };
  const gemId = slot.gemId;
  if (preserve) {
    const paid = spendCost(removeGemCost());
    if (!paid.ok) return paid;
  }
  slot.gemId = null;
  save.touch();
  return preserve ? { ok: true, gemId } : { ok: true };
}

// ---------------------------------------------------------------------------
// Salvage
// ---------------------------------------------------------------------------

const SALVAGE_YIELD: Record<ItemRarity, number> = {
  normal: 1,
  magic: 1.8,
  rare: 3.2,
  set: 5.5,
  unique: 6.5,
  mythic: 12,
  ancient: 22,
};

/**
 * Breaks an item into materials. Deterministic (no rng in the signature), so
 * the UI can show exactly what a salvage will return before you confirm it.
 */
export function salvage(item: Item): Record<string, number> {
  const base = getBase(item.baseId);
  const out: Record<string, number> = {};
  if (base.category === 'material') {
    out[base.id] = 1;
    return out;
  }
  if (base.category === 'gem' || base.category === 'rune' || base.category === 'potion') {
    out['dust.grave'] = 1;
    return out;
  }

  const yieldMul = SALVAGE_YIELD[item.rarity] ?? 1;
  const scale = (1 + base.levelReq * 0.045) * yieldMul * (1 + item.upgrade * 0.12) * legacySalvageMultiplier();

  const pool = salvagePool(item.rarity, item.ilvl);
  if (pool.length === 0) {
    out['dust.grave'] = Math.max(1, Math.round(scale));
    return out;
  }

  // Spread the yield across the two highest-tier eligible materials plus a
  // guaranteed floor of the common tier-1 stock.
  const sorted = pool.slice().sort((x, y) => y.tier - x.tier);
  const primary = sorted[0];
  const secondary = sorted.length > 1 ? sorted[1] : undefined;

  out[primary.id] = Math.max(1, Math.round((scale * 1.6) / Math.pow(1.9, primary.tier - 1)));
  if (secondary) {
    out[secondary.id] = Math.max(1, Math.round((scale * 1.1) / Math.pow(1.9, secondary.tier - 1)));
  }
  out['dust.grave'] = (out['dust.grave'] ?? 0) + Math.max(1, Math.round(scale * 0.8));

  // Anything worth wearing gives back a fragment of the socket economy too.
  if (item.sockets.length > 0) {
    out['shard.iron'] = (out['shard.iron'] ?? 0) + item.sockets.length;
  }
  return out;
}

/** Salvages and credits the account in one call. */
export function salvageInto(item: Item): Record<string, number> {
  const yielded = salvage(item);
  for (const id of Object.keys(yielded)) {
    const n = yielded[id];
    if (n) save.addMaterial(id, n);
  }
  return yielded;
}

// ---------------------------------------------------------------------------
// Gem transmutation
// ---------------------------------------------------------------------------

export function transmuteCost(gemId: string): CraftCost | null {
  const recipe = gemUpgradeRecipe(gemId);
  if (!recipe) return null;
  const def = getSocketable(gemId);
  return { gold: Math.round((def?.value ?? 50) * 0.4), materials: { [gemId]: recipe.count } };
}

/**
 * Three of a quality make one of the next. Returns the resulting gem id.
 * The caller is responsible for removing the three source items from the
 * inventory — this only validates and charges the gold half of the cost.
 */
export function transmuteGems(gemId: string): { ok: boolean; reason?: string; resultId?: string } {
  const recipe = gemUpgradeRecipe(gemId);
  if (!recipe) return { ok: false, reason: tr('That gem is already at its highest quality.') };
  const cost = transmuteCost(gemId);
  if (!cost) return { ok: false, reason: tr('That gem cannot be transmuted.') };
  const character = save.account.current;
  const gold = character ? character.gold : save.account.bankGold;
  if (gold < cost.gold) return { ok: false, reason: tr('Not enough gold (need {0}).', cost.gold) };
  if (character) character.gold -= cost.gold;
  else save.account.bankGold -= cost.gold;
  save.touch();
  return { ok: true, resultId: recipe.to };
}

// ---------------------------------------------------------------------------
// Recipe list
// ---------------------------------------------------------------------------

/** Everything the blacksmith panel lists, in display order. */
export function craftingRecipes(): CraftRecipe[] {
  const recipes: CraftRecipe[] = [
    {
      id: 'craft.upgrade',
      name: tr('Reforge'),
      desc:
        tr('Raises an item one upgrade level, up to +12. Each level adds 10% of the item’s base damage or defence and 4% to every rolled property. Crossing into a new tier sometimes improves a property outright.'),
      category: 'upgrade',
      requires: tr('Any equippable item below +12'),
      output: tr('The same item, one upgrade level higher'),
      cost: { gold: 140, materials: { 'shard.iron': 4 } },
      unlockDepth: 1,
    },
    {
      id: 'craft.reroll',
      name: tr('Reforge Properties'),
      desc:
        tr('Unmakes every rolled property on a magic or rare item and rolls them again from scratch — including how many it gets. The base, item level and sockets are preserved.'),
      category: 'affix',
      requires: tr('A magic or rare item'),
      output: tr('The same item with entirely new properties'),
      cost: { gold: 400, materials: { 'catalyst.order': 1, 'essence.lesser': 2 } },
      unlockDepth: 8,
    },
    {
      id: 'craft.socket',
      name: tr('Punch Socket'),
      desc:
        tr('Adds one empty socket. Limited by the base type and by item level — a two-handed weapon can eventually hold six, a ring can hold none. Cost nearly doubles per socket.'),
      category: 'socket',
      requires: tr('An item below its socket cap'),
      output: tr('The same item with one more socket'),
      cost: { gold: 220, materials: { 'shard.steel': 3 } },
      unlockDepth: 5,
    },
    {
      id: 'craft.insert',
      name: tr('Set Gem'),
      desc:
        tr('Seats a gem or rune in an empty socket. The bonus depends on what it goes into: a ruby is fire damage in a weapon, life in armour and fire resistance in jewellery.'),
      category: 'gem',
      requires: tr('An item with an empty socket, and a gem or rune'),
      output: tr('A socketed item'),
      cost: { gold: 0, materials: {} },
      unlockDepth: 1,
    },
    {
      id: 'craft.extract',
      name: tr('Extract Gem'),
      desc:
        tr('Removes a gem or rune. Free if you are content to destroy it; a Sigil of Order buys it back out intact.'),
      category: 'gem',
      requires: tr('An item with a filled socket'),
      output: tr('The gem, returned to your inventory'),
      cost: removeGemCost(),
      unlockDepth: 12,
    },
    {
      id: 'craft.salvage',
      name: tr('Break Down'),
      desc:
        tr('Destroys an item for crafting materials, scaled by its rarity, level and upgrade. The only reliable source of high-tier essences outside of boss kills.'),
      category: 'salvage',
      requires: tr('Any item'),
      output: tr('Materials'),
      cost: { gold: 0, materials: {} },
      unlockDepth: 1,
    },
  ];

  // One transmute entry per gem family, using the chipped quality as the face.
  for (const gem of GEMS) {
    if (gem.quality !== 'chipped') continue;
    const recipe = gemUpgradeRecipe(gem.id);
    if (!recipe) continue;
    recipes.push({
      id: `craft.transmute.${gem.family}`,
      name: tr('Fuse {0}', gem.familyName),
      desc: tr('Three gems of one quality fuse into one of the next quality up. Works at every rung of the ladder.'),
      category: 'transmute',
      requires: tr('3 gems of the same family and quality'),
      output: tr('One gem of the next quality'),
      cost: { gold: Math.round(gem.value * 0.4), materials: { [gem.id]: 3 } },
      unlockDepth: 3,
    });
  }

  return recipes;
}

/** Pretty-prints a cost for the bench UI. */
export function formatCost(cost: CraftCost): string {
  const mats = formatMaterials(cost.materials);
  if (cost.gold > 0 && mats) return `${cost.gold}g, ${mats}`;
  if (cost.gold > 0) return `${cost.gold}g`;
  return mats || tr('Free');
}

/** True when the account can currently pay a cost. */
export function canAfford(cost: CraftCost): boolean {
  const character = save.account.current;
  const gold = character ? character.gold : save.account.bankGold;
  if (gold < cost.gold) return false;
  for (const id of Object.keys(cost.materials)) {
    if (save.materialCount(id) < (cost.materials[id] ?? 0)) return false;
  }
  return true;
}

/** Which stat lines an upgrade would move, for the preview panel. */
export function upgradePreview(item: Item): Array<{ stat: StatKey; from: number; to: number }> {
  if (item.upgrade >= MAX_UPGRADE) return [];
  const out: Array<{ stat: StatKey; from: number; to: number }> = [];
  const nextMul = 1 + (item.upgrade + 1) * 0.04;
  const curMul = 1 + item.upgrade * 0.04;
  for (const mod of item.mods) {
    if (mod.kind === 'implicit') continue;
    const from = Math.round(mod.value * curMul);
    const to = Math.round(mod.value * nextMul);
    if (from !== to) out.push({ stat: mod.stat, from, to });
  }
  return out;
}
