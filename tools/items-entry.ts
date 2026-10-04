/**
 * Entry point for `tools/check-items.mjs`.
 *
 * A unique's power is a promise printed in gold on its tooltip. This proves
 * each one is kept:
 *
 *   1. Every unique `special` and every set-bonus `power` names a real power.
 *   2. Every power changes something when worn: the passive record, the stat
 *      sheet, or the runtime record.
 *   3. Every runtime field a power can set is exercised against a fake dungeon
 *      that follows the same hook protocol as `Enemy.takeDamage`, and visibly
 *      does its job (the fire really is fire, the cleave really lands).
 *   4. Authored set bonuses reach the stat sheet, and set powers turn on at the
 *      right piece count.
 *   5. Power affixes actually drop, every one of them, and rares carry them at a
 *      sane rate.
 */
import * as THREE from 'three';
import type { Character, DamagePacket, Item, StatusApplication, MonsterFamily } from '../src/types';
import { Random } from '../src/core/RNG';
import { events } from '../src/core/Events';
import { createCharacter } from '../src/sim/Character';
import { computeStats, setBonusStats } from '../src/sim/Stats';
import { passiveEffects } from '../src/sim/Passives';
import { createItem, rollItem, rollDrops, affixTierRank } from '../src/sim/Loot';
import { passesFilter, LOOT_FILTER_PRESETS, DEFAULT_LOOT_FILTER } from '../src/sim/LootFilter';
import { uniqueDropWeight } from '../src/data/uniques';
import { setPieceDropWeight, SET_PIECES } from '../src/data/sets';
import { RARITY_ORDER } from '../src/types';
import {
  POWERS,
  POWER_AFFIXES,
  getPower,
  powerEffects,
  powerHooks,
  emptyPowerEffects,
  characterPowers,
  type PowerEffects,
} from '../src/sim/ItemPowers';
import { UNIQUES } from '../src/data/uniques';
import { SETS } from '../src/data/sets';
import { PowerRuntime } from '../src/scenes/PowerRuntime';

const problems: string[] = [];
import { ITEM_BASES } from '../src/sim/Loot';
const BASE_CATS = new Map<string, string>(ITEM_BASES.map((b) => [b.id, b.category]));

// ---------------------------------------------------------------------------
// 1. Every named power exists
// ---------------------------------------------------------------------------
const specials = UNIQUES.filter((u) => u.special);
const missingSpecials = specials.filter((u) => !getPower(u.special!)).map((u) => `${u.name}: ${u.special}`);
for (const m of missingSpecials) problems.push(`unique special has no power: ${m}`);
let setPowerCount = 0;
for (const s of SETS) {
  for (const b of s.bonuses) {
    if (!b.power) continue;
    setPowerCount++;
    if (!getPower(b.power)) problems.push(`set ${s.id} (${b.pieces}) names unknown power ${b.power}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Every power changes something when worn
// ---------------------------------------------------------------------------
const rng = new Random(0x51a7);
function hero(level = 30): Character {
  const c = createCharacter('Tester', 'warden', new Random(7));
  c.level = level;
  c.equipment = {};
  return c;
}
function carrier(id: string, mag = 1): Item {
  const it = createItem('amulet.amulet', 30, new Random(3), 'normal');
  it.mods = [];
  it.powers = [{ id, mag }];
  return it;
}
const plain = hero();
plain.equipment.amulet = (() => {
  const it = createItem('amulet.amulet', 30, new Random(3), 'normal');
  it.mods = [];
  return it;
})();
const basePassive = JSON.stringify(passiveEffects(plain));
const baseStats = JSON.stringify(computeStats(plain));
const baseRuntime = JSON.stringify(emptyPowerEffects());
const inert: string[] = [];
for (const p of POWERS) {
  const c = hero();
  c.equipment.amulet = carrier(p.id);
  const a = JSON.stringify(passiveEffects(c)) !== basePassive;
  const b = JSON.stringify(computeStats(c)) !== baseStats;
  const r = JSON.stringify(powerEffects(c)) !== baseRuntime;
  if (!a && !b && !r) inert.push(p.id);
  if (!p.desc(1) || p.desc(1).length < 8) problems.push(`power ${p.id} has no description`);
}
for (const id of inert) problems.push(`power ${id} changes nothing when worn`);

// Uniques resolve to their power through the item itself.
for (const u of specials) {
  const c = hero();
  const it = createItem(u.baseId, u.ilvl, new Random(5), 'unique');
  it.uniqueId = u.id;
  c.equipment.amulet = it;
  if (!characterPowers(c).some((x) => x.id === u.special)) problems.push(`unique ${u.name} does not grant ${u.special}`);
}

// ---------------------------------------------------------------------------
// 3. Runtime: a fake dungeon with the real hook protocol
// ---------------------------------------------------------------------------
class FakeEnemy {
  id: string;
  family: MonsterFamily;
  life = 1e6;
  maxLife = 1e6;
  alive = true;
  isBoss = false;
  hitRadius = 0.5;
  ilvl = 30;
  root = { position: new THREE.Vector3() };
  statuses = new Set<string>();
  hits: Array<{ amount: number; type: string; ability?: string; knockback?: number }> = [];
  constructor(id: string, family: MonsterFamily, x = 0, z = 0) {
    this.id = id;
    this.family = family;
    this.root.position.set(x, 0, z);
  }
  hasStatus(id: string): boolean {
    return this.statuses.has(id);
  }
  applyStatuses(list: StatusApplication[]): void {
    for (const a of list) this.statuses.add(a.id);
  }
  /** Mirrors `Enemy.takeDamage`'s two hook calls, without mitigation. */
  takeDamage(packet: DamagePacket, ctx: unknown): void {
    if (packet.source === 'player' && powerHooks.outgoing) packet = powerHooks.outgoing(this, packet, ctx);
    const taken = packet.amount;
    this.life -= taken;
    this.hits.push({ amount: taken, type: packet.type, ability: packet.ability, knockback: packet.knockback });
    if (packet.applies?.length) this.applyStatuses(packet.applies);
    if (packet.source === 'player' && powerHooks.afterHit) powerHooks.afterHit(this, packet, taken, ctx);
  }
}

const noop = new Proxy({}, { get: () => () => ({ stop() {} }) }) as never;

interface World {
  rt: PowerRuntime;
  player: {
    character: Character;
    stats: ReturnType<typeof computeStats>;
    life: number;
    mana: number;
    readonly alive: boolean;
    position: THREE.Vector3;
    heal(n: number): void;
    restoreMana(n: number): void;
    stop(): void;
  };
  enemies: FakeEnemy[];
  bonusDrops: number;
}

function world(powerId: string | null, mainHand?: string, extra?: (c: Character) => void): World {
  const c = hero();
  if (powerId) c.equipment.amulet = carrier(powerId);
  if (mainHand) {
    const w = createItem(mainHand, 30, new Random(9), 'normal');
    c.equipment.mainHand = w;
  }
  extra?.(c);
  const stats = computeStats(c);
  const player = {
    character: c,
    stats,
    life: stats.life * 0.5,
    mana: stats.mana * 0.5,
    get alive() {
      return this.life > 0;
    },
    position: new THREE.Vector3(),
    heal(n: number) {
      this.life = Math.min(this.stats.life, this.life + n);
    },
    restoreMana(n: number) {
      this.mana = Math.min(this.stats.mana, this.mana + n);
    },
    stop() {},
  };
  const w: World = {
    rt: null as never,
    player,
    enemies: [new FakeEnemy('a', 'beast', 0, 2), new FakeEnemy('b', 'beast', 1.2, 2.6)],
    bonusDrops: 0,
  };
  const r = new Random(11);
  const ctx = { rng: r, fx: noop };
  w.rt = new PowerRuntime({
    player: () => player as never,
    enemies: () => w.enemies as never,
    boss: () => null,
    context: () => ctx as never,
    effects: noop,
    fx: noop,
    decals: noop,
    rng: () => r,
    walkable: () => true,
    dropBonus: () => {
      w.bonusDrops++;
    },
  });
  return w;
}

const sharedCtx = { rng: new Random(13), fx: noop };
const ctxOf = () => sharedCtx;
function hit(w: World, t: FakeEnemy, over: Partial<DamagePacket> = {}): number {
  const before = t.hits.length;
  t.takeDamage({ amount: 100, type: 'physical', crit: false, source: 'player', ability: 'Attack', ...over }, ctxOf());
  return t.hits[before]?.amount ?? 0;
}

type Probe = (id: string) => boolean;
const PROBES: Record<keyof PowerEffects, Probe> = {
  convertFirePct: (id) => { const w = world(id); hit(w, w.enemies[0]!); return w.enemies[0]!.hits[0]!.type === 'fire'; },
  convertColdArcanePct: (id) => { const w = world(id); hit(w, w.enemies[0]!); const t = w.enemies[0]!.hits[0]!.type; return t === 'cold' || t === 'arcane'; },
  fireMorePct: (id) => { const w = world(id); return hit(w, w.enemies[0]!, { type: 'fire' }) > 100; },
  coldMorePct: (id) => { const w = world(id); return hit(w, w.enemies[0]!, { type: 'cold' }) > 100; },
  lightningMorePct: (id) => { const w = world(id); return hit(w, w.enemies[0]!, { type: 'lightning' }) > 100; },
  elementalMorePct: (id) => { const w = world(id); return hit(w, w.enemies[0]!, { type: 'fire' }) > 100; },
  poisonMorePct: (id) => { const w = world(id); return hit(w, w.enemies[0]!, { type: 'poison' }) > 100; },
  critMorePct: (id) => { const w = world(id); return hit(w, w.enemies[0]!, { crit: true }) > 100; },
  vsUndeadPct: (id) => { const w = world(id); w.enemies[0]!.family = 'undead'; return hit(w, w.enemies[0]!) > 100; },
  vsDemonPct: (id) => { const w = world(id); w.enemies[0]!.family = 'demon'; return hit(w, w.enemies[0]!) > 100; },
  vsBeastPct: (id) => { const w = world(id); return hit(w, w.enemies[0]!) > 100; },
  vsLivingPenaltyPct: (id) => { const w = world(id); return hit(w, w.enemies[0]!) < 100; },
  knockback: (id) => { const w = world(id); hit(w, w.enemies[0]!); return (w.enemies[0]!.hits[0]!.knockback ?? 0) > 0; },
  critStaggerSec: (id) => { const w = world(id); hit(w, w.enemies[0]!, { crit: true }); return w.enemies[0]!.statuses.has('stunned'); },
  vsStaggeredPct: (id) => { const w = world(id); w.enemies[0]!.statuses.add('stunned'); return hit(w, w.enemies[0]!) > 100; },
  noCritLeech: (id) => {
    const w = world(id); w.player.stats.lifeSteal = 10;
    const l0 = w.player.life; hit(w, w.enemies[0]!, { crit: true }); const l1 = w.player.life;
    hit(w, w.enemies[0]!); return l1 === l0 && w.player.life > l1;
  },
  lifeTapChance: (id) => { const w = world(id); const l0 = w.player.life; for (let i = 0; i < 60; i++) hit(w, w.enemies[0]!); return w.player.life > l0; },
  lifeTapPct: (id) => PROBES.lifeTapChance(id),
  chillChance: (id) => { const w = world(id); for (let i = 0; i < 20; i++) hit(w, w.enemies[0]!); return w.enemies[0]!.statuses.has('chilled'); },
  weakenChance: (id) => { const w = world(id); for (let i = 0; i < 20; i++) hit(w, w.enemies[0]!); return w.enemies[0]!.statuses.has('weakened'); },
  fearDemonChance: (id) => { const w = world(id); w.enemies[0]!.family = 'demon'; for (let i = 0; i < 40; i++) hit(w, w.enemies[0]!); return w.enemies[0]!.statuses.has('feared'); },
  wishCurseChance: (id) => { const w = world(id); for (let i = 0; i < 40; i++) hit(w, w.enemies[0]!); w.rt.onKill(w.enemies[0]! as never); return w.bonusDrops === 1; },
  igniteRadius: (id) => { const w = world(id); hit(w, w.enemies[0]!); return w.enemies[1]!.statuses.has('burning'); },
  cleavePct: (id) => { const w = world(id, 'sword.short'); hit(w, w.enemies[0]!); return w.enemies[1]!.hits.some((h) => h.ability === 'Cleave'); },
  cleaveRadius: (id) => PROBES.cleavePct(id),
  pierceChainPct: (id) => { const w = world(id, 'bow.short'); hit(w, w.enemies[0]!); return w.enemies[1]!.hits.some((h) => h.ability === 'Pierce'); },
  returnHitPct: (id) => { const w = world(id, 'bow.short'); hit(w, w.enemies[0]!); w.rt.update(0.5); return w.enemies[0]!.hits.some((h) => h.ability === 'Return'); },
  echoHitPct: (id) => { const w = world(id); hit(w, w.enemies[0]!, { ability: 'Firebolt' }); w.rt.update(0.5); return w.enemies[0]!.hits.some((h) => h.ability === 'Echo'); },
  manaOnLightningPct: (id) => { const w = world(id); const m = w.player.mana; hit(w, w.enemies[0]!, { type: 'lightning' }); return w.player.mana > m; },
  manaOnFireLowPct: (id) => { const w = world(id); w.player.mana = w.player.stats.mana * 0.1; const m = w.player.mana; hit(w, w.enemies[0]!, { type: 'fire' }); return w.player.mana > m; },
  manaShieldPct: (id) => {
    const w = world(id); const m = w.player.mana;
    const out = w.rt.incoming({ amount: 100, type: 'physical', crit: false, source: 'x', ability: 'melee' });
    return out.amount < 100 && w.player.mana < m;
  },
  rangedTakenLessPct: (id) => { const w = world(id); return w.rt.incoming({ amount: 100, type: 'physical', crit: false, source: 'x', ability: 'arrow' }).amount < 100; },
  poisonTakenLessPct: (id) => { const w = world(id); return w.rt.incoming({ amount: 100, type: 'poison', crit: false, source: 'x', ability: 'melee' }).amount < 100; },
  poisonFeedsPct: (id) => { const w = world(id); const m = w.player.mana; w.rt.incoming({ amount: 100, type: 'poison', crit: false, source: 'x', ability: 'melee' }); return w.player.mana > m; },
  freezeImmune: (id) => {
    const w = world(id);
    const out = w.rt.incoming({ amount: 10, type: 'cold', crit: false, source: 'x', applies: [{ id: 'frozen', duration: 2, magnitude: 1 }] });
    return !(out.applies ?? []).some((a) => a.id === 'frozen');
  },
  unstoppable: (id) => {
    const w = world(id);
    const out = w.rt.incoming({ amount: 10, type: 'physical', crit: false, source: 'x', knockback: 4, applies: [{ id: 'stunned', duration: 2, magnitude: 1 }] });
    return !out.knockback && !(out.applies ?? []).some((a) => a.id === 'stunned');
  },
  manaOnBlockPct: (id) => { const w = world(id); const m = w.player.mana; w.rt.afterPlayerHit({ amount: 10, type: 'physical', crit: false, source: 'x' }, 0, true); return w.player.mana > m; },
  panicBlinkPct: (id) => {
    const w = world(id); w.player.life = w.player.stats.life * 0.1;
    w.rt.afterPlayerHit({ amount: 10, type: 'physical', crit: false, source: 'x' }, 10, false);
    return w.player.position.length() > 5;
  },
  panicBlinkCooldown: (id) => PROBES.panicBlinkPct(id),
  wardPct: (id) => {
    const w = world(id); w.player.life = w.player.stats.life;
    for (let i = 0; i < 40; i++) w.rt.update(0.1);
    return w.rt.ward > 0 && w.rt.incoming({ amount: 50, type: 'physical', crit: false, source: 'x', ability: 'melee' }).amount < 50;
  },
  goldToLifePct: (id) => { const w = world(id); const l = w.player.life; events.emit('loot:gold', { amount: 10 }); const ok = w.player.life > l; w.rt.dispose(); return ok; },
  rotAuraRadius: (id) => { const w = world(id); w.rt.update(1.1); return w.enemies[0]!.hits.some((h) => h.ability === 'Rot Cyclone') && w.enemies[0]!.statuses.has('poisoned'); },
  rotAuraPct: (id) => PROBES.rotAuraRadius(id),
  sentryPct: (id) => { const w = world(id); w.rt.update(0.1); return w.enemies.some((e) => e.hits.some((h) => h.ability === 'Sentry')); },
  sentryInterval: (id) => PROBES.sentryPct(id),
  shatterRadius: (id) => { const w = world(id); w.enemies[0]!.statuses.add('chilled'); w.rt.onKill(w.enemies[0]! as never); return w.enemies[1]!.statuses.has('frozen'); },
  pyreKillPct: (id) => { const w = world(id); w.rt.onKill(w.enemies[0]! as never); return w.enemies[1]!.hits.some((h) => h.ability === 'Pyre'); },
};

const runtimeRows: Array<{ power: string; field: string; ok: boolean }> = [];
for (const p of POWERS) {
  if (!p.runtime) continue;
  const rec = emptyPowerEffects();
  p.runtime(rec, 1);
  for (const [k, v] of Object.entries(rec)) {
    if (v === 0) continue;
    const probe = PROBES[k as keyof PowerEffects];
    let ok = false;
    try {
      ok = !!probe?.(p.id);
    } catch (err) {
      problems.push(`probe ${k} for ${p.id} threw: ${String(err).slice(0, 160)}`);
    }
    // Leave no hooks behind between probes.
    powerHooks.outgoing = null;
    powerHooks.afterHit = null;
    runtimeRows.push({ power: p.id, field: k, ok });
    if (!probe) problems.push(`runtime field ${k} has no probe`);
    else if (!ok) problems.push(`power ${p.id}: ${k} did not fire`);
  }
}

// Life Steal itself: a stat that did nothing for the whole life of the game.
{
  const w = world(null);
  w.player.stats.lifeSteal = 8;
  w.player.stats.manaSteal = 8;
  const l = w.player.life;
  const m = w.player.mana;
  hit(w, w.enemies[0]!);
  if (!(w.player.life > l)) problems.push('life steal does not heal');
  if (!(w.player.mana > m)) problems.push('mana steal does not restore mana');
  w.rt.dispose();
}

// ---------------------------------------------------------------------------
// 4. Sets
// ---------------------------------------------------------------------------
const setRows: Array<{ id: string; pieces: number; statsOk: boolean; powerOk: boolean }> = [];
for (const s of SETS) {
  const eq: Partial<Record<string, Item>> = {};
  const slots = ['mainHand', 'offHand', 'helm', 'chest', 'gloves', 'boots', 'belt', 'amulet', 'ring1', 'ring2'];
  s.pieces.forEach((piece, i) => {
    const it = createItem(piece.baseId, piece.ilvl, new Random(17 + i), 'normal');
    it.rarity = 'set';
    it.setId = s.id;
    it.uniqueId = piece.id;
    it.mods = [];
    eq[slots[i]!] = it;
  });
  const bonus = setBonusStats(eq as never);
  const full = s.bonuses.filter((b) => b.pieces <= s.pieces.length);
  let statsOk = true;
  for (const b of full) for (const m of b.mods) if (!((bonus as Record<string, number>)[m.stat] ?? 0)) statsOk = false;
  const c = hero(99);
  c.equipment = eq as never;
  const owned = characterPowers(c).map((x) => x.id);
  const powerOk = full.every((b) => !b.power || owned.includes(b.power));
  // One piece short of the power's tier must not grant it.
  const gated = s.bonuses.find((b) => b.power);
  if (gated) {
    const c2 = hero(99);
    const partial: Record<string, Item> = {};
    let n = 0;
    for (const [k, v] of Object.entries(eq)) if (n++ < gated.pieces - 1 && v) partial[k] = v;
    c2.equipment = partial as never;
    if (characterPowers(c2).some((x) => x.id === gated.power)) problems.push(`set ${s.id} grants its power one piece early`);
  }
  if (!statsOk) problems.push(`set ${s.id}: authored bonus stats missing from the sheet`);
  if (!powerOk) problems.push(`set ${s.id}: power not granted at full set`);
  setRows.push({ id: s.id, pieces: s.pieces.length, statsOk, powerOk });
}

// ---------------------------------------------------------------------------
// 5. Power affixes drop
// ---------------------------------------------------------------------------
const seen = new Map<string, number>();
for (const p of POWER_AFFIXES) seen.set(p.id, 0);
let rares = 0;
let rarePowers = 0;
let magicPowers = 0;
let magics = 0;
const N = 40000;
for (let i = 0; i < N; i++) {
  const ilvl = 5 + (i % 85);
  const it = rollItem(ilvl, rng, { forceRarity: i % 3 === 0 ? 'magic' : 'rare' });
  if (it.rarity === 'rare') rares++;
  if (it.rarity === 'magic') magics++;
  for (const p of it.powers ?? []) {
    seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
    if (it.rarity === 'rare') rarePowers++;
    else magicPowers++;
  }
}
const neverDrops = [...seen.entries()].filter(([, n]) => n === 0).map(([id]) => id);
for (const id of neverDrops) problems.push(`power affix ${id} never drops`);
const rareRate = rarePowers / Math.max(1, rares);
if (rareRate < 0.06 || rareRate > 0.3) problems.push(`rare power rate ${rareRate.toFixed(3)} outside 0.06-0.30`);

// ---------------------------------------------------------------------------
// 6. Loot filter
// ---------------------------------------------------------------------------
const preset = (id: string) => LOOT_FILTER_PRESETS.find((p) => p.id === id)!.settings;
{
  const junk = createItem('sword.short', 10, new Random(1), 'normal');
  junk.sockets = [];
  junk.mods = [];
  const uq = createItem('sword.short', 10, new Random(1), 'normal');
  uq.rarity = 'unique';
  const powered = createItem('sword.short', 30, new Random(1), 'rare');
  powered.powers = [{ id: 'cleave', mag: 1 }];
  powered.mods = [];
  if (!passesFilter(junk, preset('all'))) problems.push('filter "Everything" hides a plain sword');
  if (passesFilter(junk, preset('nojunk'))) problems.push('filter "No junk" shows a plain sword');
  if (!passesFilter(uq, preset('strict'))) problems.push('filter "Strict" hides a unique');
  if (!passesFilter(powered, preset('strict'))) problems.push('filter "Strict" hides a powered rare');
  if (!passesFilter(junk, { ...DEFAULT_LOOT_FILTER, enabled: false, minRarity: 'set' })) problems.push('a disabled filter still hides');
}
const filterRows: Record<string, number> = {};
{
  const drops: Item[] = [];
  const r = new Random(0xf11);
  for (let i = 0; i < 4000; i++) drops.push(...rollDrops(12, i % 10 === 0 ? 'champion' : 'normal', r, 0, 0).items);
  const gear = drops.filter((d) => !['potion', 'gem', 'rune', 'material'].includes(createItemCat(d)));
  for (const p of LOOT_FILTER_PRESETS) {
    const shown = gear.filter((d) => passesFilter(d, p.settings, 'warden')).length;
    filterRows[p.id] = +(shown / Math.max(1, gear.length)).toFixed(3);
  }
  if (filterRows.all !== 1) problems.push('"Everything" does not show every drop');
  if (!(filterRows.nojunk! < 0.8)) problems.push('"No junk" hides almost nothing');
  if (!(filterRows.rares! < filterRows.nojunk!)) problems.push('"Rares up" is not stricter than "No junk"');
}
function createItemCat(it: Item): string {
  try {
    return (createItem(it.baseId, 1, new Random(1)) as Item) && require_cat(it.baseId);
  } catch {
    return '';
  }
}
function require_cat(baseId: string): string {
  return BASE_CATS.get(baseId) ?? '';
}

// ---------------------------------------------------------------------------
// 7. Every rarity, unique, set piece and affix tier is reachable from drops
// ---------------------------------------------------------------------------
const rarityHits: Record<string, number> = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
const t1Seen = new Set<string>();
{
  const r = new Random(0xd00d);
  for (let i = 0; i < 200000; i++) {
    const it = rollItem(90, r, { magicFind: 300 });
    rarityHits[it.rarity] = (rarityHits[it.rarity] ?? 0) + 1;
    for (const m of it.mods) if (affixTierRank(m)?.rank === 1) t1Seen.add(m.affixId);
  }
}
for (const rr of RARITY_ORDER) if (rr !== 'normal' && !rarityHits[rr]) problems.push(`rarity ${rr} never drops at ilvl 90`);
const unreachableUniques = UNIQUES.filter((u) => ![u.ilvl, u.ilvl + 10, 60, 90].some((l) => uniqueDropWeight(u, l) > 0));
for (const u of unreachableUniques) problems.push(`unique ${u.name} can never drop`);
const unreachablePieces = SET_PIECES.filter((p) => ![p.ilvl, p.ilvl + 5, 60, 90].some((l) => setPieceDropWeight(p, l) > 0));
for (const p of unreachablePieces) problems.push(`set piece ${p.name} can never drop`);

console.log(
  JSON.stringify({
    filterShown: filterRows,
    rarityHits,
    t1Affixes: t1Seen.size,
    powers: POWERS.length,
    affixPowers: POWER_AFFIXES.length,
    specials: specials.length,
    setPowers: setPowerCount,
    runtimeChecks: runtimeRows.length,
    runtimeFailed: runtimeRows.filter((r) => !r.ok).map((r) => `${r.power}.${r.field}`),
    sets: setRows,
    rareRate: +rareRate.toFixed(3),
    magicRate: +(magicPowers / Math.max(1, magics)).toFixed(3),
    affixSeen: Object.fromEntries(seen),
    problems,
  }),
);
