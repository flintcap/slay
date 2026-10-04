/**
 * Entry point for `tools/check-town.mjs`.
 *
 * The camp services Legacy unlocks, driven through the same functions their
 * panels call:
 *
 *   1. Saves. A character from before town services repairs to a valid
 *      block; a damaged block is repaired; an enchanted item keeps its mark
 *      through a full save migration.
 *   2. The Gambler. Prices, odds against the table, the category asked for,
 *      class-usable weapons, payment, a full pack, and the house edge.
 *   3. The Enchanter. Reforge keeps kind and never duplicates a group; the
 *      one-mod rule; costs rise; uniques refused; imbue gives a real power.
 *   4. The Bounty Board. Three offers, two held, progress through the real
 *      RunDirector (kills, events, clears) with the depth gate, and a claim
 *      that pays gold, Renown and an item. Targets are reachable in a couple
 *      of real generated runs.
 *   5. Wiring (in check-town.mjs). Every seam the live game needs is present.
 */
import './depth-catalog';
import type { Character, Item, ItemRarity, MonsterRank } from '../src/types';
import { Random } from '../src/core/RNG';
import { save, migrateAccount } from '../src/core/Save';
import { createCharacter, repairCharacter } from '../src/sim/Character';
import { bindLegacyAccount, grantRenown, hasUnlock, legacyOf, renownForRank, LEGACY_UNLOCKS } from '../src/sim/Legacy';
import { getBase, rollItem, vendorPrice, AFFIXES } from '../src/sim/Loot';
import { getPower } from '../src/sim/ItemPowers';
import { generateRun } from '../src/world/DungeonGen';
import { RunDirector } from '../src/scenes/RunDirector';
import {
  BOARD_SIZE,
  BOUNTY_KINDS,
  GAMBLE_ODDS,
  GAMBLE_OFFERS,
  MAX_ACTIVE_BOUNTIES,
  acceptBounty,
  bountyText,
  canImbue,
  claimBounty,
  gamble,
  gamblePrice,
  heldBounties,
  imbueCost,
  imbuePower,
  makeBounty,
  refreshBoard,
  reforgeCost,
  reforgeMod,
  reforgeableMods,
  rollGambleItem,
  townOf,
} from '../src/sim/TownServices';

const problems: string[] = [];
const report: Record<string, unknown> = {};
bindLegacyAccount(() => save.account);

const free = () => ({ ok: true });
const groupOf = (id: string) => AFFIXES.find((a) => a.id === id)?.group;

// ---------------------------------------------------------------------------
// 1. Saves
// ---------------------------------------------------------------------------
{
  const old = createCharacter('Old', 'warden', new Random(1));
  delete (old as Partial<Character>).town;
  repairCharacter(old);
  if (!old.town || old.town.v !== 1 || !Array.isArray(old.town.bounties)) problems.push('an old character did not get a town block');
  const broken = createCharacter('Broken', 'ranger', new Random(2));
  (broken as unknown as Record<string, unknown>).town = { v: 'x', rolls: NaN, bounties: [{ id: 3 }, { id: 'ok', kind: 'slay', minDepth: 4, target: 50, progress: 60, state: 'active', reward: { gold: 100, renown: 3, rarity: 'rare' } }, null] };
  const changed = repairCharacter(broken);
  const t = broken.town!;
  if (!changed || t.rolls !== 0 || t.bounties.length !== 1 || t.bounties[0]!.state !== 'done') {
    problems.push(`a damaged town block was not repaired: ${JSON.stringify(t)}`);
  }
  const item = rollItem(20, new Random(3), { forceRarity: 'rare' });
  item.enchantedMod = item.mods.find((m) => m.kind === 'prefix' || m.kind === 'suffix')?.affixId;
  item.enchants = 2;
  const acct = JSON.parse(JSON.stringify({ ...save.account, current: { ...broken, inventory: [item, ...broken.inventory.slice(1)] } }));
  const { data } = migrateAccount(acct);
  const back = data.current?.inventory.find((i) => i?.uid === item.uid);
  if (!back || back.enchantedMod !== item.enchantedMod || back.enchants !== 2) problems.push('an enchanted item lost its mark through a save migration');
  if (!data.current?.town || data.current.town.bounties.length !== 1) problems.push('the bounty board did not survive a save migration');
}

// ---------------------------------------------------------------------------
// 2. The Gambler
// ---------------------------------------------------------------------------
{
  const c = createCharacter('Gambler', 'pyromancer', new Random(4));
  c.level = 20;
  save.account.current = c;
  const prices: Record<string, number> = {};
  for (const o of GAMBLE_OFFERS) prices[o.id] = gamblePrice(c, o.id);
  report.gamblePricesAt20 = prices;
  const low = gamblePrice({ level: 1 }, 'ring');
  const high = gamblePrice({ level: 60 }, 'ring');
  if (!(high > low * 4)) problems.push(`gamble prices barely scale with level (${low} -> ${high})`);

  const N = 1500;
  const seen: Record<string, number> = {};
  let wrongCategory = 0;
  let unusable = 0;
  let resale = 0;
  let paid = 0;
  const rng = new Random(99);
  for (let i = 0; i < N; i++) {
    const offer = GAMBLE_OFFERS[i % GAMBLE_OFFERS.length]!;
    const it = rollGambleItem(c, offer, rng);
    seen[it.rarity] = (seen[it.rarity] ?? 0) + 1;
    const base = getBase(it.baseId);
    if (offer.categories.length && !offer.categories.includes(base.category)) wrongCategory++;
    if (!offer.categories.length && base.classes && !base.classes.includes(c.classId)) unusable++;
    resale += vendorPrice(it, false);
    paid += gamblePrice(c, offer.id);
  }
  const total = GAMBLE_ODDS.reduce((s, o) => s + o.weight, 0);
  const odds: Record<string, string> = {};
  for (const o of GAMBLE_ODDS) {
    const want = o.weight / total;
    // Authored items fall back to rare when no unique of that category exists.
    const got = (seen[o.rarity] ?? 0) / N;
    odds[o.rarity] = `${(got * 100).toFixed(1)}% (table ${(want * 100).toFixed(1)}%)`;
    if (o.rarity === 'magic' && Math.abs(got - want) > 0.05) problems.push(`gamble: magic came up ${(got * 100).toFixed(1)}%, table says ${(want * 100).toFixed(1)}%`);
  }
  const special = ((seen.set ?? 0) + (seen.unique ?? 0) + (seen.mythic ?? 0)) / N;
  report.gambleOdds = odds;
  report.gambleEdge = `items resell for ${Math.round((resale / paid) * 100)}% of what they cost`;
  if (special < 0.05) problems.push(`gamble: only ${(special * 100).toFixed(1)}% set/unique/mythic`);
  if (wrongCategory) problems.push(`gamble: ${wrongCategory} items were not the kind paid for`);
  if (unusable) problems.push(`gamble: ${unusable} weapons the class cannot use`);
  if (resale >= paid) problems.push('gamble: resale is worth more than the price (gold printer)');

  // Payment and refusals through the real entry point.
  c.gold = 0;
  if (gamble(c, 'helm').ok) problems.push('gamble: worked with no gold');
  c.gold = 1e6;
  const before = c.gold;
  const r = gamble(c, 'helm');
  if (!r.ok || !r.item || c.gold !== before - gamblePrice(c, 'helm') || !c.inventory.some((i) => i?.uid === r.item!.uid)) {
    problems.push(`gamble: payment or delivery wrong (${r.reason ?? ''})`);
  }
  const rolls = townOf(c).rolls;
  const inv = c.inventory.map((i) => i);
  for (let i = 0; i < c.inventory.length; i++) if (!c.inventory[i]) c.inventory[i] = rollItem(5, new Random(i), {});
  const full = gamble(c, 'helm');
  if (full.ok) problems.push('gamble: worked with a full pack');
  c.inventory = inv;
  if (townOf(c).rolls !== rolls) problems.push('gamble: a refused gamble still advanced the roll counter');
}

// ---------------------------------------------------------------------------
// 3. The Enchanter
// ---------------------------------------------------------------------------
{
  const c = createCharacter('Enchanted', 'warden', new Random(5));
  c.level = 30;
  save.account.current = c;
  let tried = 0;
  let changedValue = 0;
  const costs: number[] = [];
  for (let s = 0; s < 40; s++) {
    const item = rollItem(30, new Random(500 + s), { forceRarity: 'rare' });
    const idx = reforgeableMods(item);
    if (idx.length < 2) continue;
    tried++;
    const i = idx[0]!;
    const kind = item.mods[i]!.kind;
    const before = JSON.stringify(item.mods[i]);
    let pays = 0;
    costs.push(reforgeCost(item).gold);
    const r = reforgeMod(c, item, i, () => (pays++, { ok: true }));
    if (!r.ok) {
      problems.push(`reforge refused on a fresh rare: ${r.reason}`);
      continue;
    }
    if (pays !== 1) problems.push(`reforge charged ${pays} times`);
    if (item.mods[i]!.kind !== kind) problems.push('reforge changed a prefix into a suffix or back');
    if (JSON.stringify(item.mods[i]) !== before) changedValue++;
    const groups = item.mods.filter((m) => m.kind === 'prefix' || m.kind === 'suffix').map((m) => groupOf(m.affixId));
    if (new Set(groups).size !== groups.length) problems.push(`reforge produced two mods from one group on ${item.name}`);
    if (item.enchantedMod !== item.mods[i]!.affixId) problems.push('reforge did not mark the mod it changed');
    const other = idx.find((j) => j !== i)!;
    let otherPaid = 0;
    if (reforgeMod(c, item, other, () => (otherPaid++, { ok: true })).ok || otherPaid) problems.push('the one-mod rule let a second property be reforged');
    if (JSON.stringify(reforgeableMods(item)) !== JSON.stringify([i])) problems.push('after a reforge, more than the marked mod is offered');
    const c2 = reforgeCost(item).gold;
    if (!reforgeMod(c, item, i, free).ok) problems.push('the marked mod could not be reforged again');
    if (!(c2 > costs[costs.length - 1]!)) problems.push('reforging again did not cost more');
  }
  report.reforge = `${tried} rares reforged, ${changedValue} came out different, first reforge ~${Math.round(costs.reduce((a, b) => a + b, 0) / Math.max(1, costs.length))}g at ilvl 30`;
  if (tried < 20) problems.push(`only ${tried} rares had two reforgeable mods`);
  if (changedValue < tried * 0.8) problems.push(`reforges mostly changed nothing (${changedValue}/${tried})`);
  const unique = rollItem(40, new Random(77), { forceRarity: 'unique' });
  if (unique.rarity === 'unique' && (reforgeableMods(unique).length || reforgeMod(c, unique, 0, free).ok)) problems.push('a unique could be reforged');

  let imbued = 0;
  let imbueTried = 0;
  for (let s = 0; s < 30; s++) {
    const item = rollItem(25, new Random(900 + s), { forceRarity: 'rare' });
    item.powers = undefined;
    if (!canImbue(item).ok) continue;
    imbueTried++;
    let pays = 0;
    const r = imbuePower(c, item, () => (pays++, { ok: true }));
    const got = item.powers as Item['powers'];
    if (r.ok && got?.length === 1 && getPower(got[0]!.id) && pays === 1) imbued++;
    if (r.ok && canImbue(item).ok) problems.push('an imbued item could be imbued again');
    if (!r.ok && pays) problems.push('a failed imbue still charged');
  }
  report.imbue = `${imbued} of ${imbueTried} rares took a real power; imbue at ilvl 25 costs ${imbueCost(rollItem(25, new Random(1), { forceRarity: 'rare' })).gold}g`;
  if (imbued < imbueTried * 0.8) problems.push(`imbue worked on only ${imbued} of ${imbueTried} rares`);
}

// ---------------------------------------------------------------------------
// 4. The Bounty Board
// ---------------------------------------------------------------------------
{
  const c = createCharacter('Hunter', 'ranger', new Random(6));
  c.depthRecord = 4;
  save.account.current = c;
  const board = refreshBoard(c);
  const open = () => board.bounties.filter((b) => b.state === 'open');
  if (open().length !== BOARD_SIZE) problems.push(`the board shows ${open().length} offers`);
  for (const b of open()) {
    if (b.minDepth < c.depthRecord + 1 || b.minDepth > c.depthRecord + 3) problems.push(`bounty at depth ${b.minDepth} for a character whose next descent is ${c.depthRecord + 1}`);
  }
  // Take two; a third is refused.
  const ids = open().map((b) => b.id);
  if (!acceptBounty(c, ids[0]!).ok || !acceptBounty(c, ids[1]!).ok) problems.push('could not take two bounties');
  const third = open()[0];
  if (third && acceptBounty(c, third.id).ok) problems.push(`took more than ${MAX_ACTIVE_BOUNTIES} bounties`);
  if (open().length !== BOARD_SIZE) problems.push('the board did not refill after a bounty was taken');

  // Force one of each kind into the held list and drive them through a real director.
  board.bounties = board.bounties.filter((b) => b.state === 'open');
  const rng = new Random(8);
  const held = BOUNTY_KINDS.map((k) => {
    let b = makeBounty(c, rng);
    for (let i = 0; i < 50 && b.kind !== k.kind; i++) b = makeBounty(c, rng);
    b.state = 'active';
    return b;
  });
  board.bounties.push(...held);
  const shallow = new RunDirector(held[0]!.minDepth - 1);
  for (let i = 0; i < 10; i++) shallow.onKill('elite');
  if (held.some((b) => b.progress > 0)) problems.push('a descent shallower than the bounty still counted');
  const deep = Math.max(...held.map((b) => b.minDepth));
  const dir = new RunDirector(deep);
  const ranks: MonsterRank[] = ['normal', 'champion', 'elite', 'rare'];
  for (let i = 0; i < 600; i++) dir.onKill(ranks[i % 4]!);
  dir.onKill('boss');
  for (let i = 0; i < 4; i++) dir.award(10, 'cursedChest');
  dir.onRunCleared();
  dir.dispose();
  const notDone = held.filter((b) => b.state !== 'done');
  if (notDone.length) problems.push(`bounties not finished by a full run: ${notDone.map((b) => `${b.kind} ${b.progress}/${b.target}`).join(', ')}`);

  // Claim.
  grantRenown(save.account, renownForRank(2) - legacyOf(save.account).renown + 1);
  const renown0 = legacyOf(save.account).renown;
  const gold0 = c.gold;
  const b0 = held[0]!;
  const r = claimBounty(c, b0.id);
  if (!r.ok || !r.payout?.item) problems.push(`claim failed: ${r.reason}`);
  else {
    grantRenown(save.account, r.payout.renown);
    if (c.gold !== gold0 + b0.reward.gold) problems.push('claim paid the wrong gold');
    if (!c.inventory.some((i) => i?.uid === r.payout!.item!.uid)) problems.push('claim did not put the item in the pack');
    const wanted: ItemRarity = b0.reward.rarity;
    if (r.payout.item.rarity !== wanted && !(wanted !== 'rare' && r.payout.item.rarity === 'rare')) problems.push(`claim item was ${r.payout.item.rarity}, promised ${wanted}`);
    if (!(legacyOf(save.account).renown > renown0)) problems.push('claim gave no Renown');
    if (townOf(c).claimed !== 1) problems.push('claim was not tallied');
  }
  if (claimBounty(c, b0.id).ok) problems.push('a bounty could be claimed twice');
  if (!hasUnlock(save.account, 'bounties')) problems.push('rank 2 does not unlock the bounty board');
  report.bounties = held.map((b) => `${bountyText(b)} -> ${b.reward.gold}g, ${b.reward.renown} renown, ${b.reward.rarity}`);

  // Reachable: what a real descent at the bounty's depth provides.
  const supply = { slay: 0, elites: 0, events: 0, runs: 0 };
  for (const seed of [3, 9, 27]) {
    const run = generateRun(deep, seed, 'ranger');
    supply.runs++;
    for (const l of run.levels) {
      for (const s of l.spawns) {
        supply.slay++;
        if (s.rank !== 'normal') supply.elites++;
      }
      supply.events += (l.events ?? []).length;
    }
  }
  const per = { slay: supply.slay / supply.runs, elites: supply.elites / supply.runs, events: supply.events / supply.runs };
  report.perRunAtBountyDepth = per;
  for (let s = 0; s < 60; s++) {
    const b = makeBounty(c, new Random(1000 + s));
    const runs = b.kind === 'slay' ? b.target / per.slay : b.kind === 'elites' ? b.target / per.elites : b.kind === 'events' ? b.target / Math.max(0.01, per.events) : 1;
    if (runs > 2.5) problems.push(`bounty "${bountyText(b)}" needs ~${runs.toFixed(1)} full descents`);
  }
}

// 5. Wiring is checked by check-town.mjs, which reads the sources.
for (const id of ['gambler', 'enchanter', 'bounties']) if (!LEGACY_UNLOCKS.some((u) => u.id === id)) problems.push(`no Legacy unlock for ${id}`);

console.log(JSON.stringify({ problems, report }));
