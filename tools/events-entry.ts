/**
 * Entry point for `tools/check-events.mjs`.
 *
 * Dungeon events and the generated quests, with the real bestiary installed:
 *
 *   1. Placement. Every event tile is open floor all round, clear of the
 *      stairs, never on a spawn or another prop, reachable from the entry;
 *      boss floors have none; generation is deterministic.
 *   2. Rates. With placement left to chance, how often each event shows up
 *      per ordinary floor, against its configured rate.
 *   3. Guarantees. Every floor has a chest you can open, every floor a
 *      collect quest owes an altar has one, and every floor has enough
 *      relics, keys and shrines for the quest that asks for them.
 *   4. Quests. Every generated quest is driven to completion through the
 *      same calls DungeonScene makes.
 *   5. Live events. `RunEvents` runs headlessly against a real level, a real
 *      player and real monsters: cursed chest (win and lose), fallen
 *      adventurer, every bargain, and the treasure runner (caught and lost).
 */
import './depth-catalog';
import * as THREE from 'three';
import type { DungeonLevel, DungeonRun, Item, MonsterRank, QuestInstance, QuestObjective } from '../src/types';
import { Random } from '../src/core/RNG';
import {
  EVENT_PROPS,
  EVENT_RATES,
  PLANT_STAIR_CLEARANCE,
  QUESTS,
  forceEvents,
  generateRun,
  isPlainChest,
  isQuestShrine,
  isWalkable,
  setRunDirector,
  tileToWorldXZ,
  worldToTileXZ,
} from '../src/world/DungeonGen';
import { NavGrid } from '../src/world/Nav';
import { BARGAINS } from '../src/data/boons';
import { getStatus } from '../src/data/statuses';
import { createCharacter } from '../src/sim/Character';
import { onBossKilled, onInteract, onKill, onSurviveTick, questState } from '../src/sim/Quests';
import { Player } from '../src/entities/Player';
import type { Enemy } from '../src/entities/Enemy';
import { RunEvents, type EventHost } from '../src/scenes/RunEvents';
import { setChoiceHandler } from '../src/ui/ChoiceSeam';
import { TOKENS_FROM_ALTAR, TOKENS_FROM_CHEST, questTokens, tokensFromKill } from '../src/scenes/QuestTokens';
import type { Interactable } from '../src/world/DungeonBuilder';

const problems: string[] = [];
const DEPTHS = [1, 2, 3, 5, 8, 12, 20, 30, 45, 70, 100];
const SEEDS = [11, 23, 37, 41, 59];
const T_FLOOR = 1;
const T_RUBBLE = 9;

function reachableFrom(level: DungeonLevel): Uint8Array {
  const seen = new Uint8Array(level.width * level.height);
  const q = [level.entry.y * level.width + level.entry.x];
  seen[q[0]!] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % level.width;
    const y = (i / level.width) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const xx = x + dx;
      const yy = y + dy;
      if (!isWalkable(level, xx, yy)) continue;
      const j = yy * level.width + xx;
      if (seen[j]) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

// ---------------------------------------------------------------------------
// 1. Placement, with every event forced on
// ---------------------------------------------------------------------------

forceEvents(true);
let forcedFloors = 0;
let forcedEvents = 0;
const forcedByKind: Record<string, number> = {};
for (const depth of DEPTHS) {
  for (const seed of SEEDS) {
    const run = generateRun(depth, seed, 'warden');
    const again = generateRun(depth, seed, 'warden');
    run.levels.forEach((level, li) => {
      const twin = again.levels[li]!;
      if (JSON.stringify(level.events ?? []) !== JSON.stringify(twin.events ?? [])) {
        problems.push(`depth ${depth} seed ${seed} floor ${li}: events differ between two identical generations`);
      }
      // The boss's area may hold ground before the arena; events may stand
      // there, never in the arena itself.
      const ar = level.arena;
      if (ar) {
        for (const ev of level.events ?? []) {
          if (ev.x >= ar.x && ev.y >= ar.y && ev.x < ar.x + ar.w && ev.y < ar.y + ar.h) {
            problems.push(`depth ${depth} seed ${seed}: event ${ev.kind} inside the boss arena`);
          }
        }
      }
      forcedFloors++;
      const reach = reachableFrom(level);
      const spawnAt = new Set(level.spawns.map((s) => s.y * level.width + s.x));
      const propCount = new Map<number, number>();
      for (const p of level.props) {
        const k = p.y * level.width + p.x;
        propCount.set(k, (propCount.get(k) ?? 0) + 1);
      }
      for (const ev of level.events ?? []) {
        forcedEvents++;
        forcedByKind[ev.kind] = (forcedByKind[ev.kind] ?? 0) + 1;
        const where = `depth ${depth} seed ${seed} floor ${li} ${ev.kind} at ${ev.x},${ev.y}`;
        if (EVENT_RATES[ev.kind].minDepth > depth) problems.push(`${where}: below its minimum depth`);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const v = level.tiles[(ev.y + dy) * level.width + ev.x + dx];
            if (v !== T_FLOOR && v !== T_RUBBLE) problems.push(`${where}: neighbour ${dx},${dy} is not floor`);
          }
        }
        for (const st of [level.entry, level.exit]) {
          if (Math.abs(st.x - ev.x) + Math.abs(st.y - ev.y) < PLANT_STAIR_CLEARANCE) problems.push(`${where}: too close to a stair`);
        }
        const k = ev.y * level.width + ev.x;
        if (spawnAt.has(k)) problems.push(`${where}: on a monster spawn`);
        const want = EVENT_PROPS[ev.kind] ? 1 : 0;
        if ((propCount.get(k) ?? 0) !== want) problems.push(`${where}: ${propCount.get(k) ?? 0} props on the tile, expected ${want}`);
        if (want) {
          const p = level.props.find((pp) => pp.x === ev.x && pp.y === ev.y);
          if (p?.interact !== EVENT_PROPS[ev.kind]!.interact) problems.push(`${where}: prop payload ${p?.interact}`);
        }
        if (!reach[k]) problems.push(`${where}: not reachable from the entry`);
      }
    });
  }
}
if (forcedEvents < forcedFloors * 3) problems.push(`forced placement found room for only ${forcedEvents} events on ${forcedFloors} floors`);

// ---------------------------------------------------------------------------
// 2. Rates, left to chance
// ---------------------------------------------------------------------------

forceEvents(null);
const rateRows: Array<{ depth: number; floors: number; perFloor: number; byKind: Record<string, number> }> = [];
const RATE_SEEDS = Array.from({ length: 16 }, (_, i) => 101 + i * 7);
for (const depth of [1, 5, 20, 60]) {
  let floors = 0;
  let total = 0;
  const byKind: Record<string, number> = {};
  for (const seed of RATE_SEEDS) {
    for (const level of generateRun(depth, seed, 'warden').levels) {
      if (level.isBossLevel) continue;
      floors++;
      for (const ev of level.events ?? []) {
        total++;
        byKind[ev.kind] = (byKind[ev.kind] ?? 0) + 1;
      }
    }
  }
  for (const k of Object.keys(byKind)) byKind[k] = Math.round((byKind[k]! / floors) * 100) / 100;
  const perFloor = Math.round((total / floors) * 100) / 100;
  rateRows.push({ depth, floors, perFloor, byKind });
  let expected = 0;
  for (const [, r] of Object.entries(EVENT_RATES)) if (depth >= r.minDepth) expected += r.chance(depth);
  if (perFloor < expected * 0.6 || perFloor > expected * 1.4) {
    problems.push(`depth ${depth}: ${perFloor} events per floor, configured rates add to ${expected.toFixed(2)}`);
  }
  if (perFloor > 2.5) problems.push(`depth ${depth}: ${perFloor} events per floor is too busy`);
}

// ---------------------------------------------------------------------------
// 3. Guarantees: chests, altars, and enough of what each quest counts
// ---------------------------------------------------------------------------

function objectivesFor(def: (typeof QUESTS)[number], depth: number): QuestObjective[] {
  return def.objectives.map((o) => {
    const target = Math.max(1, Math.round(o.base + o.perDepth * depth));
    return { kind: o.kind, desc: o.desc.replace('{n}', String(target)), target, progress: 0, filter: o.filter, done: false };
  });
}
function questOf(def: (typeof QUESTS)[number], depth: number): QuestInstance {
  return { defId: def.id, name: def.name, flavor: def.flavor, objectives: objectivesFor(def, depth), complete: false, turnedIn: false };
}

function add(into: Record<string, number>, from: Partial<Record<string, number>>, times = 1): void {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + (v ?? 0) * times;
}

/** What a full clear of this run yields: relics, keys and shrines. */
function supplyOf(run: DungeonRun): Record<string, number> {
  const s: Record<string, number> = { relic: 0, key: 0, shrine: 0 };
  for (const level of run.levels) {
    for (const p of level.props) {
      if (isPlainChest(p)) add(s, TOKENS_FROM_CHEST);
      if (p.interact === 'quest.altar') add(s, TOKENS_FROM_ALTAR);
      if (isQuestShrine(p)) s.shrine!++;
    }
    for (const sp of level.spawns) add(s, tokensFromKill(sp.rank));
  }
  add(s, tokensFromKill('boss'));
  return s;
}

let chestless = 0;
let floorsSeen = 0;
let altarless = 0;
const tightest: Record<string, { ratio: number; where: string }> = {};
for (const def of QUESTS) {
  for (const depth of DEPTHS) {
    if (depth < def.minDepth) continue;
    for (const seed of SEEDS.slice(0, 3)) {
      const quest = questOf(def, depth);
      setRunDirector(() => ({ quest: () => questOf(def, depth) }));
      const run = generateRun(depth, seed, 'warden');
      setRunDirector(null);
      const wantsAltar = quest.objectives.some((o) => o.kind === 'collect');
      run.levels.forEach((level, li) => {
        floorsSeen++;
        if (!level.props.some(isPlainChest)) {
          chestless++;
          problems.push(`depth ${depth} seed ${seed} floor ${li} (${level.layout}): no chest`);
        }
        if (wantsAltar && li >= 1 && !level.isBossLevel && !level.props.some((p) => p.interact === 'quest.altar')) {
          altarless++;
          problems.push(`${def.id} depth ${depth} seed ${seed} floor ${li} (${level.layout}): no quest altar`);
        }
      });
      const supply = supplyOf(run);
      for (const o of quest.objectives) {
        let token = '';
        if (o.kind === 'collect') token = (o.filter ?? '').replace('item:', '');
        else if (o.kind === 'cleanse') token = 'shrine';
        if (!token) continue;
        const have = supply[token] ?? 0;
        const ratio = have / o.target;
        const key = `${def.id}/${token}`;
        if (!tightest[key] || ratio < tightest[key]!.ratio) tightest[key] = { ratio: Math.round(ratio * 100) / 100, where: `depth ${depth} seed ${seed}: ${have} for ${o.target}` };
        if (have < o.target) problems.push(`${def.id} depth ${depth} seed ${seed}: only ${have} ${token} on the floors for a target of ${o.target}`);
      }

      // -------------------------------------------------------------------
      // 4. Drive the quest to completion through DungeonScene's calls
      // -------------------------------------------------------------------
      run.levels.forEach((level, li) => {
        questTokens.floor(quest, li, run.levels.length);
        for (const p of level.props) {
          if (!p.interact) continue;
          const family = p.interact.split('.')[0]!;
          if (p.interact === 'shrine.choice' || p.interact === 'chest.cursed' || p.interact === 'corpse.ambush') continue;
          if (family === 'chest') {
            onInteract(quest, 'chest');
            questTokens.chest(quest);
          } else if (family === 'quest' || family === 'altar') {
            onInteract(quest, 'altar');
            questTokens.altar(quest);
          } else if (family === 'shrine') onInteract(quest, 'shrine');
          else if (family === 'lever') continue;
          else onInteract(quest, p.kind);
        }
        for (const sp of level.spawns) {
          onKill(quest, sp.monsterId, 'undead', sp.rank as MonsterRank);
          questTokens.kill(quest, sp.rank as MonsterRank);
        }
        if (li < run.levels.length - 1) questTokens.exit(quest);
        else {
          onBossKilled(quest, run.bossId);
          onKill(quest, run.bossId, 'demon', 'boss');
          questTokens.kill(quest, 'boss');
        }
      });
      for (let t = 0; t < 900 && !quest.complete; t++) onSurviveTick(quest, 1);
      if (!quest.complete) {
        const open = quest.objectives.filter((o) => !o.done).map((o) => `${o.kind}${o.filter ? `(${o.filter})` : ''} ${o.progress}/${o.target}`);
        problems.push(`${def.id} depth ${depth} seed ${seed}: a full clear does not finish it (${open.join(', ')}${questState(quest).failed ? ', failed' : ''})`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Live events
// ---------------------------------------------------------------------------

for (const b of BARGAINS) {
  if (b.status && !getStatus(b.status)) problems.push(`bargain ${b.id}: status ${b.status} does not resolve`);
}

const shrug: any = new Proxy(function () {}, { get: () => shrug, apply: () => shrug });

forceEvents(true);
let found: DungeonLevel | undefined;
for (let seed = 4242; seed < 4262 && !found; seed++) {
  found = generateRun(10, seed, 'warden').levels.find((l) => (l.events ?? []).some((e) => e.kind === 'treasureRunner'));
}
if (!found) throw new Error('no floor with a treasure runner in twenty forced runs');
const liveLevel: DungeonLevel = found;
forceEvents(null);
const nav = new NavGrid(liveLevel);

interface Ledger {
  items: Item[];
  gold: number;
  materials: number;
  renown: number;
  consumed: Interactable[];
}
const ledger: Ledger = { items: [], gold: 0, materials: 0, renown: 0, consumed: [] };
const character = createCharacter('Checker', 'warden', new Random(5));
character.gold = 1000;
const player = new Player(character, 5);
let enemies: Enemy[] = [];
const scene = new THREE.Scene();
const rng = new Random(77);
const ctx: any = {
  playerPos: player.position,
  heroPos: player.position,
  playerStats: player.stats,
  playerLevel: 10,
  damagePlayer: () => {},
  nav,
  fx: shrug,
  decals: shrug,
  rng,
  elapsed: 0,
  get enemies() {
    return enemies;
  },
  scene,
  minions: [],
  damageMinion: () => true,
};
const host: EventHost = {
  scene,
  player: () => player,
  enemies: () => enemies,
  context: () => ctx,
  effects: shrug,
  fx: shrug,
  decals: shrug,
  rng: () => rng,
  depth: 10,
  level: () => liveLevel,
  tileToWorld: (x, y) => {
    const w = tileToWorldXZ(liveLevel, x, y);
    return new THREE.Vector3(w.x, 0, w.z);
  },
  walkable: (x, z) => {
    const t = worldToTileXZ(liveLevel, x, z);
    return isWalkable(liveLevel, t.x, t.y);
  },
  consume: (it) => {
    it.used = true;
    ledger.consumed.push(it);
  },
  dropItem: (item) => ledger.items.push(item),
  dropGold: (amount) => (ledger.gold += amount),
  addMaterials: (m) => {
    for (const v of Object.values(m)) ledger.materials += v;
  },
  magicFind: () => 0,
  renown: (n) => (ledger.renown += n),
};
const live = new RunEvents(host);

function prop(kind: string, at: THREE.Vector3): Interactable {
  const t = worldToTileXZ(liveLevel, at.x, at.z);
  return { kind, propKind: kind.split('.')[0]!, tileX: t.x, tileY: t.y, x: at.x, y: 0, z: at.z, index: 0, meshes: [], used: false };
}
function step(seconds: number, dt = 0.1): void {
  for (let t = 0; t < seconds; t += dt) {
    ctx.elapsed += dt;
    live.update(dt);
    for (const e of enemies) if (e.alive && !e.ai) e.update(dt, ctx);
  }
}
/** Kills every living monster the events called, the way the scene pays out. */
function killAll(filter: (e: Enemy) => boolean = () => true): number {
  let n = 0;
  for (const e of enemies) {
    if (!e.alive || e.lootGranted || !filter(e)) continue;
    e.life = 0;
    e.alive = false;
    e.lootGranted = true;
    live.onKill(e);
    n++;
  }
  enemies = enemies.filter((e) => e.alive);
  return n;
}
function snapshot() {
  return { items: ledger.items.length, gold: ledger.gold, renown: ledger.renown, consumed: ledger.consumed.length };
}
const live5: Record<string, string> = {};
const spot = (() => {
  const ev = (liveLevel.events ?? [])[0];
  const w = tileToWorldXZ(liveLevel, ev ? ev.x : liveLevel.exit.x, ev ? ev.y : liveLevel.exit.y);
  return new THREE.Vector3(w.x, 0, w.z);
})();
player.root.position.copy(spot).add(new THREE.Vector3(1.5, 0, 0));

// Cursed chest, won.
{
  live.onLevel();
  killAll();
  const before = snapshot();
  const chest = prop('chest.cursed', spot);
  if (!live.interact(chest)) problems.push('cursed chest: interact refused its own prop');
  step(0.3);
  const wave1 = enemies.filter((e) => e.alive).length;
  killAll();
  step(1.2);
  const wave2 = enemies.filter((e) => e.alive).length;
  const ranks = enemies.map((e) => e.rank);
  killAll();
  step(0.3);
  const after = snapshot();
  live5.cursedWon = `waves ${wave1}+${wave2} (${[...new Set(ranks)].join('/')}), +${after.items - before.items} items, +${after.gold - before.gold} gold, +${Math.round(after.renown - before.renown)} renown`;
  if (wave1 < 4 || wave2 < 2) problems.push(`cursed chest: waves of ${wave1} and ${wave2}`);
  if (!chest.used) problems.push('cursed chest: not consumed after the trial was won');
  if (after.items - before.items < 2) problems.push('cursed chest: won, but paid fewer than two items');
  if (after.renown <= before.renown) problems.push('cursed chest: no renown');
  if (live.debugState().trials !== 0) problems.push('cursed chest: trial still running after it was won');
}

// Cursed chest, lost.
{
  const before = snapshot();
  const chest = prop('chest.cursed', spot);
  live.interact(chest);
  step(47, 0.25);
  const after = snapshot();
  live5.cursedLost = `consumed ${chest.used}, +${after.items - before.items} items`;
  if (!chest.used) problems.push('cursed chest: not consumed after the timer ran out');
  if (after.items !== before.items) problems.push('cursed chest: paid out although the timer ran out');
  if (live.debugState().trials !== 0) problems.push('cursed chest: trial still running after it failed');
  killAll();
}

// Fallen adventurer.
{
  const before = snapshot();
  const corpse = prop('corpse.ambush', spot);
  live.interact(corpse);
  const mid = snapshot();
  step(1);
  const ambushers = enemies.filter((e) => e.alive).length;
  killAll();
  step(0.3);
  const after = snapshot();
  live5.fallen = `+${mid.items - before.items} item and ${mid.gold - before.gold} gold on search, ambush of ${ambushers}, +${after.items - mid.items} from the carrier`;
  if (!corpse.used) problems.push('fallen adventurer: not consumed');
  if (mid.items - before.items < 1 || mid.gold <= before.gold) problems.push('fallen adventurer: search paid nothing');
  if (ambushers < 5) problems.push(`fallen adventurer: ambush of only ${ambushers}`);
  if (!ledger.items.slice(mid.items).some((i) => i.rarity === 'rare')) problems.push('fallen adventurer: the carrier dropped no rare');
  if (after.renown <= mid.renown) problems.push('fallen adventurer: no renown for breaking the ambush');
}

// Every bargain.
{
  const shrine = prop('shrine.choice', spot);
  live.interact(shrine); // no handler installed: the offer is walked away from
  if (shrine.used) problems.push('shrine of choices: consumed without a choice');
  // Now through the real offer: three different bargains, pick the first.
  let offered: string[] = [];
  setChoiceHandler((_t, _s, options, onPick) => {
    offered = options.map((o) => o.id);
    onPick(options.find((o) => !o.disabled)?.id ?? null);
  });
  player.status.clear();
  live.interact(shrine);
  setChoiceHandler(null);
  const picked = BARGAINS.find((b) => b.id === offered[0]);
  if (offered.length !== 3 || new Set(offered).size !== 3) problems.push(`shrine of choices: offered ${offered.join(',')}`);
  if (!shrine.used) problems.push('shrine of choices: not consumed after a choice');
  if (picked?.status && !player.status.has(picked.status)) problems.push(`shrine of choices: chose ${picked.id} but ${picked.status} is not on`);
  live.interact(shrine);
  const out: string[] = [`offered ${offered.join('/')}, took ${picked?.id}`];
  for (const b of BARGAINS) {
    player.status.clear();
    player.refreshStats();
    player.life = player.stats.life;
    player.mana = player.stats.mana;
    character.gold = 1000;
    const before = { ...snapshot(), life: player.life, mana: player.mana, gold: character.gold };
    live.takeBargain(b, spot.clone());
    step(1.5);
    const hunters = enemies.filter((e) => e.alive).length;
    killAll();
    step(0.3);
    const after = snapshot();
    const bits: string[] = [];
    if (b.status) {
      if (!player.status.has(b.status)) problems.push(`bargain ${b.id}: status ${b.status} not on the player`);
      else bits.push(b.status);
    }
    if (b.costKind === 'life30' || b.costKind === 'life20') {
      if (!(player.life < before.life)) problems.push(`bargain ${b.id}: cost no life`);
      else bits.push(`life ${Math.round(before.life)}->${Math.round(player.life)}`);
    }
    if (b.costKind === 'mana20' && !(player.mana < before.mana)) problems.push(`bargain ${b.id}: cost no mana`);
    if (b.costKind === 'gold20') {
      if (!(character.gold < before.gold)) problems.push(`bargain ${b.id}: cost no gold`);
      else bits.push(`gold ${before.gold}->${character.gold}`);
    }
    if (b.costKind === 'elites') {
      if (hunters < 3) problems.push(`bargain ${b.id}: only ${hunters} hunters came`);
      else bits.push(`${hunters} hunters`);
    }
    if (b.reward === 'item' || b.costKind === 'elites') {
      if (after.items <= before.items) problems.push(`bargain ${b.id}: no item`);
      else bits.push(`+${after.items - before.items} item`);
    }
    if (after.renown <= before.renown) problems.push(`bargain ${b.id}: no renown`);
    out.push(`${b.id}: ${bits.join(', ') || 'ok'}`);
  }
  live5.bargains = out.join('; ');
}

// Treasure runner, caught and lost.
for (const outcome of ['caught', 'lost'] as const) {
  killAll();
  live.onLevel();
  const runner = enemies.find((e) => e.named?.id === 'event.runner');
  if (!runner) {
    problems.push(`treasure runner: none spawned on a floor with a runner event (${(liveLevel.events ?? []).map((e) => e.kind).join(',')})`);
    break;
  }
  if (runner.ai) problems.push('treasure runner: has a fighting brain');
  const p0 = runner.root.position.clone();
  player.root.position.copy(p0).add(new THREE.Vector3(3, 0, 0));
  const d0 = runner.root.position.distanceTo(player.position);
  const before = snapshot();
  step(3);
  const d1 = runner.root.position.distanceTo(player.position);
  const coins = ledger.gold - before.gold;
  if (outcome === 'caught') {
    killAll((e) => e === runner);
    const after = snapshot();
    live5.runnerCaught = `fled ${d0.toFixed(1)}m -> ${d1.toFixed(1)}m, shed ${coins} gold, caught for +${after.items - before.items} items`;
    if (!(d1 > d0 + 2)) problems.push(`treasure runner: did not flee (${d0.toFixed(1)}m -> ${d1.toFixed(1)}m)`);
    if (coins <= 0) problems.push('treasure runner: shed no coins while fleeing');
    if (after.items - before.items < 3) problems.push('treasure runner: caught, but dropped fewer than three items');
    if (after.renown <= before.renown) problems.push('treasure runner: no renown for the catch');
  } else {
    step(30, 0.25);
    live5.runnerLost = `escaped ${runner.readyToRemove && runner.lootGranted}, runner tracked ${live.debugState().runner}`;
    if (!(runner.readyToRemove && runner.lootGranted && !runner.alive)) problems.push('treasure runner: never escaped');
    if (live.debugState().runner) problems.push('treasure runner: still tracked after escaping');
  }
}

console.log(
  JSON.stringify({
    problems,
    forced: { floors: forcedFloors, events: forcedEvents, byKind: forcedByKind },
    rates: rateRows,
    chests: { floors: floorsSeen, chestless, altarless },
    tightest,
    live: live5,
  }),
);
