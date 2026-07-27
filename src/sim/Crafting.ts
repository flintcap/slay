/**
 * SLAY — the blacksmith.
 *
 * Crafting exists because of the roguelike loop. You lose a character and
 * everything on them; what you keep is the stash and the materials. So the
 * bench has to be the thing that turns "I found a good base" into "I have a
 * weapon", repeatedly, for every character you roll.
 *
 * Five operations, each with its own currency:
 *
 * - **Upgrade** (gold + tier-appropriate materials) — the main progression
 *   sink. Twelve levels in four named tiers, each adding +10% of the item's
 *   base damage/defence and +4% to every rolled modifier. A fully upgraded
 *   item is roughly a tier-and-a-half of base above where it started, which is
 *   enough to keep a beloved level-40 unique relevant at level 60.
 * - **Reroll** (Sigil of Chaos) — reroll every affix on a magic or rare item.
 *   Keeps the base, the sockets and the item level.
 * - **Socket** (shards) — add one socket, up to the base's cap. Escalating
 *   cost per socket, so six-socketing a two-hander is a project.
 * - **Gem insert / remove** — free to insert, destructive to remove unless you
 *   pay a Sigil of Order.
 * - **Salvage** — break an item down for materials scaled by rarity and level.
 */

import type { Item, ItemMod, ItemRarity, Rng, StatKey } from '../types';
import { save } from '../core/Save';
import { getBase } from './Loot';
import { AFFIXES, eligibleTiers } from './Loot';
import { maxSockets } from '../data/itemBases';
import { getSocketable, gemUpgradeRecipe, GEMS } from '../data/gems';
import { formatMaterials, materialName, salvagePool } from '../data/materials';

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
  { name: 'Reinforced', max: 3, material: 'shard.iron', color: '#c8c8c8' },
  { name: 'Tempered', max: 6, material: 'shard.steel', catalyst: 'essence.lesser', color: '#6f8cff' },
  { name: 'Masterwork', max: 9, material: 'shard.mithral', catalyst: 'essence.greater', color: '#f5d76e' },
  { name: 'Mythforged', max: 12, material: 'shard.adamant', catalyst: 'essence.pure', color: '#c060ff' },
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
    return { ok: false, reason: 'This cannot be upgraded.' };
  }
  if (item.upgrade >= MAX_UPGRADE) return { ok: false, reason: 'Already fully upgraded.' };
  return { ok: true };
}

function spendCost(cost: CraftCost): CraftResult {
  const character = save.account.current;
  const gold = character ? character.gold : save.account.bankGold;
  if (gold < cost.gold) return { ok: false, reason: `Not enough gold (need ${cost.gold}).` };
  for (const id of Object.keys(cost.materials)) {
    const need = cost.materials[id] ?? 0;
    if (save.materialCount(id) < need) {
      return { ok: false, reason: `Need ${need} ${materialName(id)}.` };
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

  item.upgrade++;

  // Crossing into a new tier occasionally awards a small bonus roll on one
  // existing modifier — the "it came out of the quench better than it went in"
  // moment that makes people upgrade the item they like instead of the best one.
  const tier = tierFor(item.upgrade);
  const crossedTier = item.upgrade === tier.max - 2;
  if (crossedTier && item.mods.length > 0 && rng.chance(0.35)) {
    const rolled = item.mods.filter((m) => m.kind !== 'implicit');
    if (rolled.length > 0) {
      const mod = rng.pick(rolled);
      mod.value = Math.round(mod.value * rng.range(1.04, 1.12)) || mod.value + 1;
    }
  }

  item.value = Math.round(item.value * 1.18);
  save.touch();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Affix reroll
// ---------------------------------------------------------------------------

export function rerollCost(item: Item): CraftCost {
  const base = getBase(item.baseId);
  const gold = Math.round((400 + base.levelReq * 90) * (RARITY_COST_MUL[item.rarity] ?? 1));
  const materials: Record<string, number> = {};
  if (item.ilvl >= 58) materials['catalyst.chaos'] = 1;
  else materials['catalyst.order'] = 1;
  materials['essence.lesser'] = item.rarity === 'rare' ? 4 : 2;
  if (item.ilvl >= 40) materials['essence.greater'] = item.rarity === 'rare' ? 2 : 1;
  return { gold, materials };
}

function affixAllowedOn(affix: (typeof AFFIXES)[number], item: Item): boolean {
  const base = getBase(item.baseId);
  if (affix.categories && affix.categories.length > 0 && !affix.categories.includes(base.category)) return false;
  if (affix.slots && affix.slots.length > 0) {
    if (base.slot === 'twoHand' || base.slot === 'consumable' || base.slot === 'none') return false;
    if (!affix.slots.includes(base.slot)) return false;
  }
  if (affix.minRarity === 'rare' && item.rarity === 'magic') return false;
  return true;
}

/**
 * Rerolls every non-implicit modifier on a magic or rare item. The affix count
 * is rerolled too, so this is a real gamble rather than a guaranteed sidegrade.
 */
export function rerollAffixes(item: Item, rng: Rng): CraftResult {
  if (item.rarity !== 'magic' && item.rarity !== 'rare') {
    return { ok: false, reason: 'Only magic and rare items can be reforged.' };
  }
  const paid = spendCost(rerollCost(item));
  if (!paid.ok) return paid;

  const implicits = item.mods.filter((m) => m.kind === 'implicit');
  const wantPrefixes = item.rarity === 'magic' ? (rng.chance(0.62) ? 1 : rng.chance(0.5) ? 1 : 0) : rng.int(1, 3);
  const wantSuffixes =
    item.rarity === 'magic' ? (wantPrefixes === 1 && rng.chance(0.62) ? 1 : wantPrefixes === 0 ? 1 : 0) : rng.int(1, 3);

  const used = new Set<string>();
  const rolled: ItemMod[] = [];

  const roll = (kind: 'prefix' | 'suffix') => {
    const pool = AFFIXES.filter(
      (a) => a.kind === kind && !used.has(a.group) && affixAllowedOn(a, item) && eligibleTiers(a, item.ilvl).length > 0,
    );
    if (pool.length === 0) return;
    const affix = rng.weighted(pool, (a) => {
      const tiers = eligibleTiers(a, item.ilvl);
      let w = 0;
      for (const t of tiers) w += t.weight;
      return w / Math.sqrt(Math.max(1, tiers.length));
    });
    const tiers = eligibleTiers(affix, item.ilvl);
    if (tiers.length === 0) return;
    const tier = rng.weighted(tiers, (t) => t.weight);
    used.add(affix.group);
    rolled.push({
      affixId: affix.id,
      stat: affix.stat,
      value: tier.min === tier.max ? tier.min : rng.int(tier.min, tier.max),
      tier: tier.tier,
      kind,
    });
  };

  for (let i = 0; i < wantPrefixes; i++) roll('prefix');
  for (let i = 0; i < wantSuffixes; i++) roll('suffix');
  if (rolled.length === 0) roll('prefix');

  item.mods = [...implicits, ...rolled];
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
  if (cap <= 0) return { ok: false, reason: 'This item cannot hold sockets.' };
  if (item.sockets.length >= cap) return { ok: false, reason: `Cannot hold more than ${cap} sockets.` };
  // Item level gates socket count the same way it does on drops.
  const ilvlCap = Math.max(1, Math.min(cap, Math.floor(item.ilvl / 14) + 1));
  if (item.sockets.length >= ilvlCap) {
    return { ok: false, reason: `Item level ${item.ilvl} supports only ${ilvlCap} socket(s).` };
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
  if (socket < 0 || socket >= item.sockets.length) return { ok: false, reason: 'No such socket.' };
  const slot = item.sockets[socket];
  if (!slot) return { ok: false, reason: 'No such socket.' };
  if (slot.gemId) return { ok: false, reason: 'That socket is already filled.' };
  const def = getSocketable(gemId);
  if (!def) return { ok: false, reason: 'That is not a gem or rune.' };
  const base = getBase(item.baseId);
  if (def.levelReq > base.levelReq + 25) {
    return { ok: false, reason: `${def.name} is too potent for this base.` };
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
  if (socket < 0 || socket >= item.sockets.length) return { ok: false, reason: 'No such socket.' };
  const slot = item.sockets[socket];
  if (!slot || !slot.gemId) return { ok: false, reason: 'That socket is empty.' };
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
  const scale = (1 + base.levelReq * 0.045) * yieldMul * (1 + item.upgrade * 0.12);

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
  if (!recipe) return { ok: false, reason: 'That gem is already at its highest quality.' };
  const cost = transmuteCost(gemId);
  if (!cost) return { ok: false, reason: 'That gem cannot be transmuted.' };
  const character = save.account.current;
  const gold = character ? character.gold : save.account.bankGold;
  if (gold < cost.gold) return { ok: false, reason: `Not enough gold (need ${cost.gold}).` };
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
      name: 'Reforge',
      desc:
        'Raises an item one upgrade level, up to +12. Each level adds 10% of the item’s base damage or defence and 4% ' +
        'to every rolled property. Crossing into a new tier sometimes improves a property outright.',
      category: 'upgrade',
      requires: 'Any equippable item below +12',
      output: 'The same item, one upgrade level higher',
      cost: { gold: 140, materials: { 'shard.iron': 4 } },
      unlockDepth: 1,
    },
    {
      id: 'craft.reroll',
      name: 'Reforge Properties',
      desc:
        'Unmakes every rolled property on a magic or rare item and rolls them again from scratch — including how many ' +
        'it gets. The base, item level and sockets are preserved.',
      category: 'affix',
      requires: 'A magic or rare item',
      output: 'The same item with entirely new properties',
      cost: { gold: 400, materials: { 'catalyst.order': 1, 'essence.lesser': 2 } },
      unlockDepth: 8,
    },
    {
      id: 'craft.socket',
      name: 'Punch Socket',
      desc:
        'Adds one empty socket. Limited by the base type and by item level — a two-handed weapon can eventually hold ' +
        'six, a ring can hold none. Cost nearly doubles per socket.',
      category: 'socket',
      requires: 'An item below its socket cap',
      output: 'The same item with one more socket',
      cost: { gold: 220, materials: { 'shard.steel': 3 } },
      unlockDepth: 5,
    },
    {
      id: 'craft.insert',
      name: 'Set Gem',
      desc:
        'Seats a gem or rune in an empty socket. The bonus depends on what it goes into: a ruby is fire damage in a ' +
        'weapon, life in armour and fire resistance in jewellery.',
      category: 'gem',
      requires: 'An item with an empty socket, and a gem or rune',
      output: 'A socketed item',
      cost: { gold: 0, materials: {} },
      unlockDepth: 1,
    },
    {
      id: 'craft.extract',
      name: 'Extract Gem',
      desc:
        'Removes a gem or rune. Free if you are content to destroy it; a Sigil of Order buys it back out intact.',
      category: 'gem',
      requires: 'An item with a filled socket',
      output: 'The gem, returned to your inventory',
      cost: removeGemCost(),
      unlockDepth: 12,
    },
    {
      id: 'craft.salvage',
      name: 'Break Down',
      desc:
        'Destroys an item for crafting materials, scaled by its rarity, level and upgrade. The only reliable source of ' +
        'high-tier essences outside of boss kills.',
      category: 'salvage',
      requires: 'Any item',
      output: 'Materials',
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
      name: `Fuse ${gem.name.replace('Chipped ', '')}`,
      desc: 'Three gems of one quality fuse into one of the next quality up. Works at every rung of the ladder.',
      category: 'transmute',
      requires: `3 gems of the same family and quality`,
      output: 'One gem of the next quality',
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
  return mats || 'Free';
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
