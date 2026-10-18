/**
 * Entry point for `tools/balance-report.mjs`: a read-only audit of the item
 * economy. Nothing here changes a number; it measures them.
 *
 * A stat line is scored as a share of a unique's usual top roll at that item
 * level (`statCurve`), the same scale `tools/setpower-entry.ts` uses, so +20
 * life and +5% fire resist sit on one ruler. Implicit lines are left out (a
 * unique and a rare of one base share them), and so are powers and skill
 * bends, which no number captures: the report says how many items carry one.
 *
 * Hero level by depth comes from `node tools/check-curve.mjs` (the level a
 * player has after clearing every depth up to it), and kill drops use the
 * monster's item level from `entities/Enemy.ts` (depth x 1.15, +2 when
 * ranked). Both are mirrored here by hand; if they change, change them here.
 */
import { UNIQUES, uniquePool, uniqueDropWeight, type UniqueDef } from '../src/data/uniques';
import { SETS } from '../src/data/sets';
import { statCurve } from '../src/data/uniqueBatches/kit';
import { GEMS, RUNES, RUNEWORDS, SOCKETABLES, socketableWeight } from '../src/data/gems';
import { ITEM_BASES, baseDropWeight, isEquippable } from '../src/data/itemBases';
import { createItem, rarityOdds, vendorPrice, rollCharm, type DropSource } from '../src/sim/Loot';
import { gamblePrice, GAMBLE_ODDS } from '../src/sim/TownServices';
import { itemLevelForDepth } from '../src/sim/Difficulty';
import { Random } from '../src/core/RNG';
import type { Item, ItemRarity, StatKey } from '../src/types';

const rng = new Random(0xba1a);
const r2 = (n: number): number => Math.round(n * 100) / 100;
const noCurve = new Set<string>();

/** One line's worth, as a share of a unique's usual top roll at level L. */
function lineScore(stat: StatKey, value: number, L: number): number {
  if (!statCurve.has(stat)) noCurve.add(stat);
  return value / statCurve(stat, L);
}
function itemScore(it: Item, L: number): number {
  return it.mods.filter((m) => m.kind !== 'implicit').reduce((s, m) => s + lineScore(m.stat, m.value, L), 0);
}
function uniqueScore(u: UniqueDef, L: number): number {
  return u.mods.filter((m) => m.kind !== 'implicit').reduce((s, m) => s + lineScore(m.stat, (m.min + m.max) / 2, L), 0);
}

const rareCache = new Map<string, { mean: number; p75: number }>();
function rareStats(baseId: string, L: number, rarity: ItemRarity = 'rare', n = 160): { mean: number; p75: number } {
  const key = `${baseId}|${L}|${rarity}`;
  const hit = rareCache.get(key);
  if (hit) return hit;
  const s: number[] = [];
  for (let i = 0; i < n; i++) s.push(itemScore(createItem(baseId, L, rng, rarity), L));
  s.sort((a, b) => a - b);
  const out = { mean: s.reduce((a, b) => a + b, 0) / s.length, p75: s[Math.floor(s.length * 0.75)]! };
  rareCache.set(key, out);
  return out;
}

// Hero level after clearing every depth up to d (check-curve, this wave's numbers).
const HERO_CURVE: Array<[number, number]> = [[1, 6], [5, 12], [12, 19], [25, 28], [40, 38]];
function heroLevel(depth: number): number {
  for (let i = 1; i < HERO_CURVE.length; i++) {
    const [d0, l0] = HERO_CURVE[i - 1]!;
    const [d1, l1] = HERO_CURVE[i]!;
    if (depth <= d1) return Math.round(l0 + ((l1 - l0) * (depth - d0)) / (d1 - d0));
  }
  const [dA, lA] = HERO_CURVE[HERO_CURVE.length - 2]!;
  const [dB, lB] = HERO_CURVE[HERO_CURVE.length - 1]!;
  return Math.round(lB + ((lB - lA) / (dB - dA)) * (depth - dB));
}
const killIlvl = (depth: number, ranked: boolean): number => Math.max(1, Math.round(depth * 1.15 + (ranked ? 2 : 0)));

const DEPTHS = [1, 5, 12, 25, 40, 60, 80];
const out: Record<string, unknown> = {};

// --- 1. Rare and magic lines by item level ----------------------------------------
{
  const probe = ['chest', 'ring', 'sword'];
  const rows: unknown[] = [];
  for (const L of [5, 10, 20, 30, 45, 60, 75, 90]) {
    const row: Record<string, unknown> = { L };
    for (const cat of probe) {
      const b = ITEM_BASES.filter((x) => x.category === cat && isEquippable(x) && x.levelReq <= L).sort((a, b2) => b2.levelReq - a.levelReq)[0];
      if (!b) continue;
      row[`${cat}Rare`] = r2(rareStats(b.id, L).mean);
      row[`${cat}Magic`] = r2(rareStats(b.id, L, 'magic').mean);
    }
    rows.push(row);
  }
  out.affixes = rows;
}

// --- 2. Uniques against rares of the same base -------------------------------------
{
  const rows: Array<Record<string, unknown>> = [];
  let withPower = 0;
  for (const u of UNIQUES) {
    if (ITEM_BASES.find((b) => b.id === u.baseId)?.category === 'charm') continue;
    if (u.special || u.bend) withPower++;
    const at = (over: number) => {
      const L = u.ilvl + over;
      const rare = rareStats(u.baseId, L);
      return { u: r2(uniqueScore(u, L)), rare: r2(rare.mean), p75: r2(rare.p75) };
    };
    rows.push({ id: u.id, rarity: u.rarity, ilvl: u.ilvl, req: u.levelReq, power: !!(u.special || u.bend), at0: at(0), at20: at(20) });
  }
  const below = (k: 'at0' | 'at20') => rows.filter((r) => (r[k] as { u: number; rare: number }).u < (r[k] as { rare: number }).rare);
  out.uniques = {
    count: rows.length,
    withPower,
    belowRareAt0: below('at0').length,
    belowRareAt0NoPower: below('at0').filter((r) => !r.power).length,
    belowRareAt20: below('at20').length,
    belowRareAt20NoPower: below('at20').filter((r) => !r.power).length,
    worstAt0: [...rows].sort((a, b) => (a.at0 as { u: number }).u / (a.at0 as { rare: number }).rare - (b.at0 as { u: number }).u / (b.at0 as { rare: number }).rare).slice(0, 12),
    byRarity: (['unique', 'mythic', 'ancient'] as const).map((r) => {
      const set = rows.filter((x) => x.rarity === r);
      const ratio = set.map((x) => (x.at0 as { u: number }).u / Math.max(0.01, (x.at0 as { rare: number }).rare));
      return { rarity: r, n: set.length, meanRatioAt0: r2(ratio.reduce((a, b) => a + b, 0) / Math.max(1, ratio.length)) };
    }),
    belowAt0ByBand: [[1, 29], [30, 54], [55, 200]].map(([lo, hi]) => {
      const band = rows.filter((r) => (r.ilvl as number) >= lo! && (r.ilvl as number) <= hi!);
      return { band: `${lo}-${hi}`, n: band.length, belowAt0: band.filter((r) => below('at0').includes(r)).length, belowAt20: band.filter((r) => below('at20').includes(r)).length };
    }),
  };
}

// --- 3. Sets ---------------------------------------------------------------------
out.sets = { sets: SETS.length, pieces: SETS.reduce((s, x) => s + x.pieces.length, 0) };

// --- 4. Gems and runes as a share of a unique's line at their own level -------------
{
  const gemRows = new Map<string, Record<string, number>>();
  for (const g of GEMS) {
    const L = g.levelReq;
    const row = gemRows.get(g.quality) ?? { level: L };
    const shares = (list: Array<{ stat: StatKey; value: number }>) => list.reduce((s, b) => s + lineScore(b.stat, b.value, L), 0);
    row.weapon = (row.weapon ?? 0) + shares(g.weapon) / 11;
    row.armor = (row.armor ?? 0) + shares(g.armor) / 11;
    row.jewelry = (row.jewelry ?? 0) + shares(g.jewelry) / 11;
    gemRows.set(g.quality, row);
  }
  out.gems = [...gemRows.entries()].map(([q, r]) => ({ q, level: r.level, weapon: r2(r.weapon!), armor: r2(r.armor!), jewelry: r2(r.jewelry!) }));
  out.runes = RUNES.map((r) => ({
    id: r.id,
    name: r.name,
    level: r.levelReq,
    minDepth: r.minDepth,
    value: r.value,
    weapon: `${r.weapon[0]!.stat} ${r.weapon[0]!.value} (${r2(lineScore(r.weapon[0]!.stat, r.weapon[0]!.value, r.levelReq))})`,
    armor: `${r.armor[0]!.stat} ${r.armor[0]!.value} (${r2(lineScore(r.armor[0]!.stat, r.armor[0]!.value, r.levelReq))})`,
    jewelry: `${r.jewelry[0]!.stat} ${r.jewelry[0]!.value} (${r2(lineScore(r.jewelry[0]!.stat, r.jewelry[0]!.value, r.levelReq))})`,
  }));
  // Chance a socketable drops per average kill (mix as in drops-entry.ts).
  const SOCK = 0.88 * 0.035 + 0.08 * 0.1 + 0.035 * 0.17 + 0.005 * 0.26;
  const killsFor = (runeId: string, depth: number): number => {
    const pool = SOCKETABLES.filter((s) => socketableWeight(s, depth) > 0);
    const total = pool.reduce((s, x) => s + socketableWeight(x, depth), 0);
    const target = RUNES.find((r) => r.id === runeId)!;
    let best = Infinity;
    for (const src of RUNES) {
      // Three of a cut make the next cut of the same vein.
      if (src.vein !== target.vein || src.cut > target.cut) continue;
      const def = pool.find((p) => p.id === src.id);
      if (!def) continue;
      const p = (socketableWeight(def, depth) / total) * SOCK;
      best = Math.min(best, Math.pow(3, target.cut - src.cut) / p);
    }
    return best;
  };
  out.runeKills = RUNES.map((r) => ({ name: r.name, order: r.order, at60: Math.round(killsFor(r.id, 60)), at100: Math.round(killsFor(r.id, 100)) }));
  out.runewords = RUNEWORDS.map((w) => ({ id: w.id, name: w.name, runes: w.veins.length, veins: w.veins.join(' ') }));
}

// --- 5. Charms against a rare ring of the same level --------------------------------
{
  const rows: unknown[] = [];
  for (const L of [10, 30, 50, 80]) {
    const ring = ITEM_BASES.filter((x) => x.category === 'ring' && x.levelReq <= L).sort((a, b) => b.levelReq - a.levelReq)[0]!;
    const row: Record<string, unknown> = { L, rareRing: r2(rareStats(ring.id, L).mean) };
    for (const size of ['charm.small', 'charm.medium', 'charm.large', 'charm.grand']) {
      const b = ITEM_BASES.find((x) => x.id === size)!;
      if (b.levelReq > L) continue;
      let s = 0;
      for (let i = 0; i < 200; i++) s += itemScore(rollCharm(L, rng, 0, size), L);
      row[size.slice(6)] = r2(s / 200);
    }
    rows.push(row);
  }
  out.charms = rows;
}

// --- 6. Drop odds, item level against hero level, and what can be worn --------------
{
  const KILL_MIX: Array<{ share: number; rolls: number; source: DropSource }> = [
    { share: 0.88, rolls: 0.17, source: 'normal' },
    { share: 0.08, rolls: 0.62, source: 'champion' },
    { share: 0.035, rolls: 1.5, source: 'elite' },
    { share: 0.005, rolls: 2.55, source: 'rare' },
  ];
  out.drops = DEPTHS.map((d) => {
    const per: Record<string, number> = { normal: 0, magic: 0, rare: 0, set: 0, unique: 0, mythic: 0, ancient: 0 };
    let wear = 0;
    let rolls = 0;
    const hero = heroLevel(d);
    for (const k of KILL_MIX) {
      const L = killIlvl(d, k.source !== 'normal');
      const odds = rarityOdds(L, 0, k.source);
      for (const r of Object.keys(per)) per[r]! += k.share * k.rolls * odds[r as ItemRarity];
      const bases = ITEM_BASES.filter((b) => isEquippable(b) && b.category !== 'charm' && baseDropWeight(b, L) > 0);
      const tot = bases.reduce((s, b) => s + baseDropWeight(b, L), 0);
      const ok = bases.filter((b) => b.levelReq <= hero).reduce((s, b) => s + baseDropWeight(b, L), 0);
      wear += k.share * k.rolls * (ok / tot);
      rolls += k.share * k.rolls;
    }
    const uPool = uniquePool('unique', killIlvl(d, false));
    const uw = uPool.reduce((s, u) => s + uniqueDropWeight(u, killIlvl(d, false)), 0);
    const uWear = uPool.filter((u) => u.levelReq <= hero).reduce((s, u) => s + uniqueDropWeight(u, killIlvl(d, false)), 0);
    return {
      depth: d,
      heroLevel: hero,
      killIlvl: killIlvl(d, false),
      gateShows: itemLevelForDepth(d),
      killsPerRare: Math.round(1 / per.rare!),
      killsPerSet: Math.round(1 / per.set!),
      killsPerUnique: Math.round(1 / per.unique!),
      basesWearable: r2(wear / rolls),
      uniquesWearable: r2(uw > 0 ? uWear / uw : 0),
    };
  });
}

// --- 7. Prices: what things cost against what a kill pays ----------------------------
{
  const goldPerKill = (d: number): number => {
    const L = killIlvl(d, false);
    const base = 10 + L * 3.4 + L * L * 0.045;
    const mul = 0.88 * 1 + 0.08 * 2.4 + 0.035 * 4.2 + 0.005 * 7;
    return base * mul * 1.05;
  };
  out.prices = DEPTHS.map((d) => {
    const L = killIlvl(d, false);
    const hero = heroLevel(d);
    const b = ITEM_BASES.filter((x) => x.category === 'chest' && x.levelReq <= L).sort((a, b2) => b2.levelReq - a.levelReq)[0]!;
    let rareSell = 0;
    let rareBuy = 0;
    for (let i = 0; i < 40; i++) {
      const it = createItem(b.id, L, rng, 'rare');
      rareSell += vendorPrice(it, false) / 40;
      rareBuy += vendorPrice(it, true) / 40;
    }
    const gp = goldPerKill(d);
    const gamble = gamblePrice({ level: hero }, 'helm');
    return {
      depth: d,
      goldPerKill: Math.round(gp),
      rareChestSell: Math.round(rareSell),
      rareChestBuy: Math.round(rareBuy),
      killsToBuyRare: Math.round(rareBuy / gp),
      gambleHelm: gamble,
      killsPerGamble: Math.round(gamble / gp),
    };
  });
  out.gambleOdds = GAMBLE_ODDS;
}

out.noCurve = [...noCurve];
console.log(JSON.stringify(out));
