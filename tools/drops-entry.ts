/**
 * Entry point for `tools/check-drops.mjs`: can every unique, set piece and
 * signature actually be found, and in a sane number of kills?
 *
 * Worked out from the drop tables, not sampled, so a one-in-a-million item is
 * still measured exactly. The odds follow `rollDrops`, `rollItem`,
 * `rollCharm` and `rollSignature` in `src/sim/Loot.ts`; if those change, the
 * numbers here must change with them.
 */
import { UNIQUES, uniquePool, uniqueDropWeight, type UniqueDef } from '../src/data/uniques';
import { SET_PIECES, SETS, setPool, setPieceDropWeight } from '../src/data/sets';
import { SIGNATURES } from '../src/data/uniqueBatches/index';
import { BOSSES } from '../src/data/bosses';
import { WARDENS } from '../src/data/wardens';
import { CLASS_IDS } from '../src/data/classes';
import { ITEM_BASES } from '../src/data/itemBases';
import { CHARM_UNIQUE_CHANCE, rarityOdds, SIGNATURE_CHANCE, type DropSource } from '../src/sim/Loot';
import type { CharClassId, ItemRarity } from '../src/types';

// Mirrors of the private tables in Loot.ts. Kept in step by hand.
const earlyRamp = (r: string, ilvl: number): number => (r === 'unique' || r === 'set' ? Math.min(1, 0.25 + 0.75 * Math.max(0, ilvl - 1) / 29) : 1);
const CHARM_SIZE_WEIGHT: Record<string, number> = { 'charm.small': 44, 'charm.medium': 28, 'charm.large': 18, 'charm.grand': 10 };

/**
 * An average floor kill: mostly plain monsters, some champions and elites.
 * Item rolls per kill follow `RANK_PROFILE` in Loot.ts; the rank lifts quality.
 */
const KILL_MIX: Array<{ share: number; rolls: number; source: DropSource; charm: number }> = [
  { share: 0.88, rolls: 0.17, source: 'normal', charm: 0.0005 },
  { share: 0.08, rolls: 0.62, source: 'champion', charm: 0.003 },
  { share: 0.035, rolls: 1.5, source: 'elite', charm: 0.006 },
  { share: 0.005, rolls: 2.55, source: 'rare', charm: 0.012 },
];

const baseCat = new Map(ITEM_BASES.map((b) => [b.id, b.category]));
const baseReq = new Map(ITEM_BASES.map((b) => [b.id, b.levelReq]));

const oddsCache = new Map<string, Record<ItemRarity, number>>();
function rarityChance(r: ItemRarity, ilvl: number, source: DropSource): number {
  const key = `${ilvl}|${source}`;
  let o = oddsCache.get(key);
  if (!o) oddsCache.set(key, (o = rarityOdds(ilvl, 0, source)));
  return o[r];
}

/** Chance one ordinary item roll is this unique, for a hero of `hero`. */
function uniqueRollChance(d: UniqueDef, ilvl: number, source: DropSource, hero: CharClassId | undefined): number {
  const w = uniqueDropWeight(d, ilvl);
  if (w <= 0) return 0;
  const pool = uniquePool(d.rarity, ilvl).filter((x) => baseCat.get(x.baseId) !== 'charm' && (!x.classId || x.classId === hero) && uniqueDropWeight(x, ilvl) > 0);
  const sum = pool.reduce((s, x) => s + uniqueDropWeight(x, ilvl), 0);
  return sum > 0 ? (rarityChance(d.rarity, ilvl, source) * w) / sum : 0;
}

/** Chance one kill drops this charm unique. */
function charmKillChance(d: UniqueDef, ilvl: number, hero: CharClassId | undefined): number {
  const sizes = ITEM_BASES.filter((b) => b.category === 'charm' && b.levelReq <= ilvl);
  const sizeSum = sizes.reduce((s, b) => s + (CHARM_SIZE_WEIGHT[b.id] ?? 10), 0);
  if (!sizes.some((b) => b.id === d.baseId) || sizeSum <= 0) return 0;
  const sizeShare = (CHARM_SIZE_WEIGHT[d.baseId] ?? 10) / sizeSum;
  const pool = uniquePool('unique', ilvl).filter((x) => x.baseId === d.baseId && (!x.classId || x.classId === hero) && uniqueDropWeight(x, ilvl) > 0);
  const sum = pool.reduce((s, x) => s + uniqueDropWeight(x, ilvl), 0);
  if (sum <= 0) return 0;
  let p = 0;
  for (const k of KILL_MIX) {
    p += k.share * k.charm * sizeShare * CHARM_UNIQUE_CHANCE * earlyRamp('unique', ilvl) * (uniqueDropWeight(d, ilvl) / sum);
  }
  return p;
}

function killChance(d: UniqueDef, ilvl: number, hero: CharClassId | undefined): number {
  if (baseCat.get(d.baseId) === 'charm') return charmKillChance(d, ilvl, hero);
  let p = 0;
  for (const k of KILL_MIX) p += k.share * k.rolls * uniqueRollChance(d, ilvl, k.source, hero);
  return p;
}

function setKillChance(id: string, ilvl: number): number {
  const piece = SET_PIECES.find((p) => p.id === id)!;
  const w = setPieceDropWeight(piece, ilvl);
  if (w <= 0) return 0;
  const sum = setPool(ilvl).reduce((s, p) => s + setPieceDropWeight(p, ilvl), 0);
  let p = 0;
  for (const k of KILL_MIX) p += k.share * k.rolls * (rarityChance('set', ilvl, k.source) * w) / sum;
  return p;
}

/** The level a hero meets an item at: its own item level, or the base's level if that is higher. */
const meetAt = (ilvl: number, baseId: string): number => Math.max(ilvl, baseReq.get(baseId) ?? 1) + 4;

const problems: string[] = [];
const rows: Array<{ id: string; name: string; kind: string; ilvl: number; kills: number }> = [];

// --- Uniques ----------------------------------------------------------------
for (const d of UNIQUES) {
  const at = meetAt(d.ilvl, d.baseId);
  const heroes = d.classId ? [d.classId] : CLASS_IDS;
  let best = 0;
  for (const h of heroes) best = Math.max(best, killChance(d, at, h));
  // It must still be in the table well past its own level.
  let ever = best;
  for (let l = 1; l <= 150 && ever <= 0; l++) for (const h of heroes) ever = Math.max(ever, killChance(d, l, h));
  if (ever <= 0) problems.push(`${d.id} (${d.name}) can never drop`);
  rows.push({ id: d.id, name: d.name, kind: baseCat.get(d.baseId) === 'charm' ? `charm ${d.rarity}` : d.rarity, ilvl: d.ilvl, kills: best > 0 ? 1 / best : Infinity });
}

// --- Set pieces -------------------------------------------------------------
for (const p of SET_PIECES) {
  const at = meetAt(p.ilvl, p.baseId);
  const best = setKillChance(p.id, at);
  if (best <= 0) problems.push(`${p.id} (${p.name}) can never drop`);
  rows.push({ id: p.id, name: p.name, kind: 'set', ilvl: p.ilvl, kills: best > 0 ? 1 / best : Infinity });
}
for (const s of SETS) if (!SET_PIECES.some((p) => p.setId === s.id)) problems.push(`${s.id} has no pieces`);

// --- Signatures -------------------------------------------------------------
const wardenIds = new Set(WARDENS.map((w) => w.id));
const sigRows: Array<{ boss: string; id: string; bossKills: number }> = [];
const fights = [...BOSSES.map((b) => ({ id: b.id, extra: (b as { signature?: string[] }).signature ?? [] })), ...WARDENS.map((w) => ({ id: w.id, extra: [] as string[] }))];
for (const f of fights) {
  const ids = [...(SIGNATURES[f.id] ?? []), ...f.extra];
  const chance = wardenIds.has(f.id) ? SIGNATURE_CHANCE.warden : SIGNATURE_CHANCE.boss;
  for (const id of ids) {
    const d = UNIQUES.find((u) => u.id === id);
    if (!d) { problems.push(`${f.id}: signature ${id} is not a unique`); continue; }
    // Met once the boss's drop level reaches the item: rollSignature allows six levels early.
    const lvl = Math.max(1, d.ilvl - 6);
    const pool = ids.map((x) => UNIQUES.find((u) => u.id === x)).filter((u): u is UniqueDef => !!u && u.ilvl <= lvl + 6 && (!u.classId || u.classId === d.classId));
    const sum = pool.reduce((s, u) => s + Math.max(1, uniqueDropWeight(u, lvl + 6)), 0);
    const p = (chance * Math.max(1, uniqueDropWeight(d, lvl + 6))) / sum;
    sigRows.push({ boss: f.id, id, bossKills: 1 / p });
  }
}

console.log(JSON.stringify({ rows, sigRows, problems }));
