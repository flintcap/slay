/**
 * SLAY — Legacy: progression that survives death.
 *
 * Characters die for good. Before this, the only things a dead character left
 * behind were the stash and a line on the memorial, so a run that ended at
 * depth two was a run that achieved nothing. Legacy is the account-level track
 * every run feeds:
 *
 *   - **Renown** is earned for everything you do down there — kills, floors,
 *     bosses, contracts, new depths, and every unique or set piece seen for
 *     the first time. It is banked the moment it is earned, so dying never
 *     takes it back.
 *   - Each **Renown rank** pays one Legacy point, spent on permanent perks that
 *     every character on the account inherits (more life, more magic find, a
 *     head start for new characters).
 *   - Certain ranks **unlock** things outright: town services, waypoints, a
 *     stash tab.
 *   - The **Codex** records every unique and set piece the account has found.
 *
 * Pure: every function takes the account (or reads the bound provider) and
 * returns numbers. The dungeon director decides when renown is earned.
 */

import type { AccountSave, Character, LegacyState, Stats } from '../types';
import { UNIQUES } from '../data/uniques';
import { SET_PIECES } from '../data/sets';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function emptyLegacy(): LegacyState {
  return {
    renown: 0,
    perks: {},
    codex: [],
    stats: { runs: 0, clears: 0, kills: 0, bosses: 0, deaths: 0, deepest: 0, contracts: 0 },
    milestones: [],
  };
}

/** The account's legacy, created or repaired in place. Old saves get one. */
export function legacyOf(account: AccountSave): LegacyState {
  let l = account.legacy;
  if (!l || typeof l !== 'object') {
    l = emptyLegacy();
    // A save from before Legacy existed still did things. Credit the deepest
    // depth it reached and every life it lost, so a veteran account does not
    // start from nothing.
    const best = Math.max(0, account.bestDepth ?? 0);
    l.stats.deepest = best;
    l.stats.deaths = Array.isArray(account.fallen) ? account.fallen.length : 0;
    l.renown = renownForDepthRecord(best) + l.stats.deaths * 25;
    account.legacy = l;
    return l;
  }
  const d = emptyLegacy();
  if (!Number.isFinite(l.renown) || l.renown < 0) l.renown = 0;
  if (!l.perks || typeof l.perks !== 'object') l.perks = {};
  if (!Array.isArray(l.codex)) l.codex = [];
  if (!l.stats || typeof l.stats !== 'object') l.stats = d.stats;
  for (const k of Object.keys(d.stats) as Array<keyof LegacyState['stats']>) {
    if (!Number.isFinite(l.stats[k])) l.stats[k] = 0;
  }
  if (!Array.isArray(l.milestones)) l.milestones = [];
  return l;
}

/** Back-credit for a pre-Legacy account: what clearing to that depth is worth. */
function renownForDepthRecord(depth: number): number {
  let r = 0;
  for (let d = 1; d <= depth; d++) r += RENOWN.newDepth(d) + RENOWN.clear(d);
  return Math.round(r);
}

// ---------------------------------------------------------------------------
// Ranks
// ---------------------------------------------------------------------------

export const MAX_RENOWN_RANK = 100;

/** Total renown needed to reach a rank. Rank 0 needs nothing. */
export function renownForRank(rank: number): number {
  if (rank <= 0) return 0;
  return Math.round(80 * Math.pow(rank, 1.75));
}

export function renownRank(renown: number): number {
  let r = 0;
  while (r < MAX_RENOWN_RANK && renown >= renownForRank(r + 1)) r++;
  return r;
}

/** Progress from the current rank to the next, 0..1. */
export function renownProgress(renown: number): { rank: number; into: number; need: number; frac: number } {
  const rank = renownRank(renown);
  if (rank >= MAX_RENOWN_RANK) return { rank, into: 0, need: 0, frac: 1 };
  const lo = renownForRank(rank);
  const hi = renownForRank(rank + 1);
  return { rank, into: renown - lo, need: hi - lo, frac: (renown - lo) / Math.max(1, hi - lo) };
}

// ---------------------------------------------------------------------------
// What earns renown
// ---------------------------------------------------------------------------

/** Renown per event. Depth makes everything worth more. */
export const RENOWN = {
  // Monster counts are high on purpose, so a single kill is worth very little:
  // the run as a whole is what pays.
  kill: (rank: string, depth: number) =>
    (rank === 'boss' ? 25 : rank === 'rare' ? 2.5 : rank === 'elite' ? 1.2 : rank === 'champion' ? 0.6 : 0.15) *
    (1 + depth * 0.08),
  floor: (depth: number) => 6 + depth * 2,
  clear: (depth: number) => 25 + depth * 6,
  newDepth: (depth: number) => 30 + depth * 8,
  contract: (depth: number) => 20 + depth * 4,
  codex: (rarity: string) => (rarity === 'ancient' ? 400 : rarity === 'mythic' ? 150 : rarity === 'unique' ? 40 : 25),
};

export interface RenownGain {
  amount: number;
  /** Ranks crossed by this grant, in order. Empty most of the time. */
  ranks: number[];
  /** Unlocks that turned on at those ranks. */
  unlocked: LegacyUnlock[];
}

/** Adds renown and reports any ranks and unlocks it crossed. */
export function grantRenown(account: AccountSave, amount: number): RenownGain {
  const l = legacyOf(account);
  // Fractional on purpose: a single kill is worth a fraction of a point.
  const gain = Math.max(0, Number.isFinite(amount) ? amount : 0);
  const before = renownRank(l.renown);
  l.renown += gain;
  const after = renownRank(l.renown);
  const ranks: number[] = [];
  for (let r = before + 1; r <= after; r++) ranks.push(r);
  const unlocked = LEGACY_UNLOCKS.filter((u) => u.rank > before && u.rank <= after);
  return { amount: gain, ranks, unlocked };
}

/** Records a codex find. Returns the renown it is worth, or 0 if already known. */
export function recordCodex(account: AccountSave, id: string, rarity: string): number {
  const l = legacyOf(account);
  if (l.codex.includes(id)) return 0;
  l.codex.push(id);
  return RENOWN.codex(rarity);
}

export function codexTotals(account: AccountSave): { uniques: number; uniquesFound: number; sets: number; setsFound: number } {
  const known = new Set(legacyOf(account).codex);
  return {
    uniques: UNIQUES.length,
    uniquesFound: UNIQUES.filter((u) => known.has(u.id)).length,
    sets: SET_PIECES.length,
    setsFound: SET_PIECES.filter((p) => known.has(p.id)).length,
  };
}

// ---------------------------------------------------------------------------
// Unlocks
// ---------------------------------------------------------------------------

export interface LegacyUnlock {
  id: string;
  rank: number;
  name: string;
  desc: string;
}

export const LEGACY_UNLOCKS: LegacyUnlock[] = [
  { id: 'bounties', rank: 2, name: 'Bounty Board', desc: 'The board by the gate posts bounties with real rewards.' },
  { id: 'gambler', rank: 3, name: 'The Gambler', desc: 'A dealer in sealed goods sets up shop. Pay gold, take your chances.' },
  { id: 'enchanter', rank: 5, name: 'The Enchanter', desc: 'Reforge one affix of an item, or imbue a rare with a power.' },
  { id: 'waypoints', rank: 7, name: 'Waypoints', desc: 'Begin a descent from any depth milestone you have reached.' },
  { id: 'pacts', rank: 9, name: 'Pacts', desc: 'Take on dangers by choice before a descent, for greater rewards.' },
  { id: 'stashTab', rank: 12, name: 'Vault Extension', desc: 'One more tab in the shared stash.' },
  { id: 'perkCap', rank: 20, name: 'Mastery', desc: 'Every perk can be raised two ranks higher.' },
];

export function hasUnlock(account: AccountSave, id: string): boolean {
  const u = LEGACY_UNLOCKS.find((x) => x.id === id);
  if (!u) return false;
  return renownRank(legacyOf(account).renown) >= u.rank;
}

// ---------------------------------------------------------------------------
// Perks
// ---------------------------------------------------------------------------

export interface PerkDef {
  id: string;
  name: string;
  /** Per-rank text. */
  desc: (rank: number) => string;
  maxRank: number;
  /** Renown rank needed before the first point can go in. */
  minRenown: number;
  /** Stat grants at a rank, applied by `computeStats` to every character. */
  stats?: (s: Stats, rank: number) => void;
}

export const PERKS: PerkDef[] = [
  {
    id: 'hardy',
    name: 'Hardy Stock',
    desc: (r) => `+${r * 3}% maximum life`,
    maxRank: 5,
    minRenown: 0,
    stats: (s, r) => {
      s.life *= 1 + (r * 3) / 100;
    },
  },
  {
    id: 'fortune',
    name: "Fortune's Eye",
    desc: (r) => `+${r * 8}% magic find`,
    maxRank: 5,
    minRenown: 0,
    stats: (s, r) => {
      s.magicFind += r * 8;
    },
  },
  {
    id: 'prosperity',
    name: 'Deep Pockets',
    desc: (r) => `+${r * 12}% gold find`,
    maxRank: 5,
    minRenown: 0,
    stats: (s, r) => {
      s.goldFind += r * 12;
    },
  },
  {
    id: 'scholar',
    name: 'Scholar of Ruin',
    desc: (r) => `+${r * 5}% experience from kills`,
    maxRank: 5,
    minRenown: 1,
  },
  {
    id: 'warded',
    name: 'Old Wards',
    desc: (r) => `+${r * 3}% to all resistances`,
    maxRank: 5,
    minRenown: 2,
    stats: (s, r) => {
      s.fireResist += r * 3;
      s.coldResist += r * 3;
      s.lightningResist += r * 3;
      s.poisonResist += r * 3;
      s.arcaneResist += r * 3;
    },
  },
  {
    id: 'swift',
    name: 'Swift Feet',
    desc: (r) => `+${r * 3}% movement speed`,
    maxRank: 3,
    minRenown: 3,
    stats: (s, r) => {
      s.moveSpeed += r * 3;
    },
  },
  {
    id: 'killer',
    name: 'Killer Instinct',
    desc: (r) => `+${r * 4}% damage`,
    maxRank: 5,
    minRenown: 4,
    stats: (s, r) => {
      s.enhancedDamage += r * 4;
    },
  },
  {
    id: 'inheritance',
    name: 'Inheritance',
    desc: (r) => `New characters start with ${r * 150} more gold and ${r} more healing potion${r === 1 ? '' : 's'}`,
    maxRank: 3,
    minRenown: 1,
  },
  {
    id: 'prodigy',
    name: 'Prodigy',
    desc: (r) => `New characters start with ${r} more skill point${r === 1 ? '' : 's'} and ${r * 3} more stat points`,
    maxRank: 2,
    minRenown: 6,
  },
  {
    id: 'salvager',
    name: 'Salvager',
    desc: (r) => `+${r * 15}% materials from salvage`,
    maxRank: 3,
    minRenown: 4,
  },
  {
    id: 'haggler',
    name: 'Haggler',
    desc: (r) => `Vendors charge ${r * 5}% less`,
    maxRank: 3,
    minRenown: 3,
  },
];

const PERK_BY_ID = new Map(PERKS.map((p) => [p.id, p]));

export function getPerk(id: string): PerkDef | undefined {
  return PERK_BY_ID.get(id);
}

export function perkRank(account: AccountSave, id: string): number {
  return Math.max(0, Math.floor(legacyOf(account).perks[id] ?? 0));
}

export function perkCap(account: AccountSave, def: PerkDef): number {
  return def.maxRank + (hasUnlock(account, 'perkCap') ? 2 : 0);
}

export function pointsSpent(account: AccountSave): number {
  const l = legacyOf(account);
  let n = 0;
  for (const v of Object.values(l.perks)) n += Math.max(0, Math.floor(v));
  return n;
}

export function pointsAvailable(account: AccountSave): number {
  const l = legacyOf(account);
  return Math.max(0, renownRank(l.renown) - pointsSpent(account));
}

export function canBuyPerk(account: AccountSave, id: string): { ok: boolean; reason?: string } {
  const def = PERK_BY_ID.get(id);
  if (!def) return { ok: false, reason: 'Unknown perk.' };
  const l = legacyOf(account);
  if (renownRank(l.renown) < def.minRenown) return { ok: false, reason: `Needs Renown rank ${def.minRenown}.` };
  if (perkRank(account, id) >= perkCap(account, def)) return { ok: false, reason: 'Already at its highest rank.' };
  if (pointsAvailable(account) <= 0) return { ok: false, reason: 'No Legacy points to spend.' };
  return { ok: true };
}

export function buyPerk(account: AccountSave, id: string): boolean {
  if (!canBuyPerk(account, id).ok) return false;
  const l = legacyOf(account);
  l.perks[id] = perkRank(account, id) + 1;
  return true;
}

/** Refunds every point. Free: experimenting with perks should not be punished. */
export function resetPerks(account: AccountSave): void {
  legacyOf(account).perks = {};
}

// ---------------------------------------------------------------------------
// Applying perks
// ---------------------------------------------------------------------------

/**
 * The account every character belongs to. Bound once at boot by `main.ts` so
 * `computeStats` and `createCharacter` can stay single-argument. Unbound (as
 * under Node in most checkers), Legacy simply grants nothing.
 */
let provider: (() => AccountSave | null) | null = null;
export function bindLegacyAccount(fn: (() => AccountSave | null) | null): void {
  provider = fn;
}
function boundAccount(): AccountSave | null {
  try {
    return provider?.() ?? null;
  } catch {
    return null;
  }
}

/** Stat perks, applied to every character's finished sheet. */
export function applyLegacyStats(s: Stats): void {
  const a = boundAccount();
  if (!a) return;
  for (const def of PERKS) {
    if (!def.stats) continue;
    const r = perkRank(a, def.id);
    if (r > 0) def.stats(s, r);
  }
}

/** Experience multiplier from Scholar of Ruin. */
export function legacyXpMultiplier(): number {
  const a = boundAccount();
  return a ? 1 + (perkRank(a, 'scholar') * 5) / 100 : 1;
}

/** Vendor buy-price multiplier from Haggler. */
export function legacyPriceMultiplier(): number {
  const a = boundAccount();
  return a ? 1 - (perkRank(a, 'haggler') * 5) / 100 : 1;
}

/** Salvage yield multiplier from Salvager. */
export function legacySalvageMultiplier(): number {
  const a = boundAccount();
  return a ? 1 + (perkRank(a, 'salvager') * 15) / 100 : 1;
}

/**
 * The head start a brand new character gets. Returns what it applied, so the
 * creation path can add the potions with its own item factory.
 */
export function legacyStartingBonus(c: Character): { gold: number; potions: number } {
  const a = boundAccount();
  if (!a) return { gold: 0, potions: 0 };
  const inh = perkRank(a, 'inheritance');
  const pro = perkRank(a, 'prodigy');
  c.gold += inh * 150;
  c.skillPoints += pro;
  c.statPoints += pro * 3;
  return { gold: inh * 150, potions: inh };
}

// ---------------------------------------------------------------------------
// Depth milestones
// ---------------------------------------------------------------------------

/** Every this many depths is a milestone: a first-clear cache and a waypoint. */
export const MILESTONE_STEP = 5;

export interface MilestoneReward {
  depth: number;
  renown: number;
  gold: number;
  /** Guaranteed items, best first. */
  items: Array<'set' | 'unique' | 'mythic'>;
}

/** What clearing a milestone depth for the first time pays the account. */
export function milestoneReward(depth: number): MilestoneReward {
  const items: MilestoneReward['items'] = ['unique'];
  if (depth % 10 === 0) items.push('set');
  if (depth % 25 === 0) items.unshift('mythic');
  return { depth, renown: Math.round(40 + depth * 10), gold: Math.round(500 + depth * 150), items };
}

/**
 * Marks every milestone at or below `clearedDepth` that the account has not
 * claimed, and returns their rewards for the caller to pay out.
 */
export function claimMilestones(account: AccountSave, clearedDepth: number): MilestoneReward[] {
  const l = legacyOf(account);
  const out: MilestoneReward[] = [];
  for (let d = MILESTONE_STEP; d <= clearedDepth; d += MILESTONE_STEP) {
    if (l.milestones.includes(d)) continue;
    l.milestones.push(d);
    out.push(milestoneReward(d));
  }
  l.milestones.sort((a, b) => a - b);
  return out;
}

/**
 * Where a character may begin a descent: the next depth always, and with the
 * Waypoints unlock any claimed milestone deeper than where they would start.
 */
export function descentOptions(account: AccountSave, c: Pick<Character, 'depthRecord'>): number[] {
  const next = Math.max(1, c.depthRecord + 1);
  const out = [next];
  if (!hasUnlock(account, 'waypoints')) return out;
  for (const d of legacyOf(account).milestones) if (d > next) out.push(d);
  return out;
}
