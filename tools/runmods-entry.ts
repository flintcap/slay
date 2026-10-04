/**
 * Entry point for `tools/check-runmods.mjs`.
 *
 * Run variety: every run modifier does something, depth milestones pay once,
 * waypoints and pacts work.
 *
 *   1. Every modifier in the table has an effect: the spawn-table ones change
 *      the spawn table, the rest act through `RunModifiers` on a real level,
 *      real monsters and a real player.
 *   2. Every modifier pays: magic and gold find rise with the danger.
 *   3. Milestones: first clears pay gold, Renown and guaranteed items, once.
 *   4. Waypoints and pacts: offered only once unlocked, real, and rewarded.
 */
import './depth-catalog';
import * as THREE from 'three';
import type { DamagePacket } from '../src/types';
import { Random } from '../src/core/RNG';
import { events } from '../src/core/Events';
import { save } from '../src/core/Save';
import { RUN_MODIFIERS, generateLevel, generateRun, isWalkable, tileToWorldXZ, worldToTileXZ } from '../src/world/DungeonGen';
import { NavGrid } from '../src/world/Nav';
import { MONSTERS } from '../src/data/monsters';
import { createCharacter } from '../src/sim/Character';
import {
  LEGACY_UNLOCKS,
  bindLegacyAccount,
  claimMilestones,
  descentOptions,
  grantRenown,
  legacyOf,
  milestoneReward,
  renownForRank,
} from '../src/sim/Legacy';
import { Player } from '../src/entities/Player';
import { Enemy } from '../src/entities/Enemy';
import { RunModifiers, modValue } from '../src/scenes/RunModifiers';
import { RunDirector } from '../src/scenes/RunDirector';
import { PACT_POOL, pactOffers } from '../src/scenes/DescentPlanner';

const problems: string[] = [];
const report: Record<string, unknown> = {};
bindLegacyAccount(() => save.account);
const shrug: any = new Proxy(function () {}, { get: () => shrug, apply: () => shrug });

const run = generateRun(30, 77, 'warden');
const level = run.levels[0]!;
const nav = new NavGrid(level);
const def = MONSTERS.find((m) => level.spawns.some((s) => s.monsterId === m.id)) ?? MONSTERS[0]!;
const start = tileToWorldXZ(level, level.entry.x, level.entry.y);

interface World {
  mods: RunModifiers;
  player: Player;
  enemies: Enemy[];
  hits: DamagePacket[];
  exposure: number[];
}

function world(modifiers: string[]): World {
  const c = createCharacter('Mod', 'warden', new Random(3));
  c.level = 30;
  const player = new Player(c, 3);
  player.root.position.set(start.x, 0, start.z);
  const enemies: Enemy[] = [];
  const hits: DamagePacket[] = [];
  const exposure: number[] = [];
  const ctx: any = {
    playerPos: player.position,
    heroPos: player.position,
    playerStats: player.stats,
    playerLevel: 30,
    damagePlayer: (p: DamagePacket) => {
      hits.push(p);
      player.takeDamage(p, new Random(1));
    },
    nav,
    fx: shrug,
    decals: shrug,
    rng: new Random(4),
    elapsed: 0,
    enemies,
    scene: new THREE.Scene(),
    minions: [],
    damageMinion: () => true,
  };
  const mods = new RunModifiers({
    scene: ctx.scene,
    player: () => player,
    enemies: () => enemies,
    boss: () => null,
    context: () => ctx,
    effects: shrug,
    fx: shrug,
    decals: shrug,
    rng: () => ctx.rng,
    depth: 30,
    modifiers,
    level: () => level,
    walkable: (x, z) => {
      const t = worldToTileXZ(level, x, z);
      return isWalkable(level, t.x, t.y);
    },
    setExposure: (v) => exposure.push(v),
  });
  mods.onLevel(0);
  return { mods, player, enemies, hits, exposure };
}

function monster(w: World, dx: number, rank: 'normal' | 'elite' = 'normal'): Enemy {
  const e = new Enemy(def, rank, [], 30, new Random(w.enemies.length + 10));
  e.root.position.set(start.x + dx, 0, start.z);
  w.enemies.push(e);
  return e;
}

function step(w: World, seconds: number, dt = 0.1): void {
  for (let t = 0; t < seconds; t += dt) w.mods.update(dt);
}

const effects: Record<string, string> = {};
const GENERATION = new Set(['mod.swarm', 'mod.elites', 'mod.legion']);

// --- 1. Each modifier's effect ---------------------------------------------
for (const m of RUN_MODIFIERS) {
  const id = m.id;
  const tag = `${id}@2`;
  let what = '';
  try {
    if (GENERATION.has(id)) {
      const a = generateRun(70, 5, 'warden');
      const plain = a.levels[0]!;
      const without = generateLevel(70, 0, 5, a.biome, 5, a.quest, []);
      const withIt = generateLevel(70, 0, 5, a.biome, 5, a.quest, [tag]);
      void plain;
      const count = (l: typeof without) => l.spawns.length;
      const elites = (l: typeof without) => l.spawns.filter((s) => s.rank !== 'normal').length;
      if (id === 'mod.swarm' && count(withIt) > count(without)) what = `spawns ${count(without)} -> ${count(withIt)}`;
      if (id === 'mod.elites' && elites(withIt) >= elites(without)) what = `champions and up ${elites(without)} -> ${elites(withIt)}`;
      if (id === 'mod.legion') {
        // Every pack is led by a champion or better.
        const led = (l: typeof without) => {
          const packs = new Map<number, boolean>();
          for (const s of l.spawns) packs.set(s.packId, (packs.get(s.packId) ?? false) || s.rank !== 'normal');
          return [...packs.values()];
        };
        const a0 = led(without).filter(Boolean).length / Math.max(1, led(without).length);
        const a1 = led(withIt).filter(Boolean).length / Math.max(1, led(withIt).length);
        if (a1 === 1 && a1 > a0) what = `packs led by a champion or better ${Math.round(a0 * 100)}% -> 100%`;
      }
    } else {
      const w = world([tag]);
      const e = monster(w, 2);
      const base = new Enemy(def, 'normal', [], 30, new Random(10));
      w.mods.update(0.05);
      switch (id) {
        case 'mod.hardened':
          if (e.maxLife > base.maxLife) what = `life ${base.maxLife} -> ${e.maxLife}`;
          break;
        case 'mod.savage':
          if (e.buffDamageMul > 1) what = `damage x${e.buffDamageMul.toFixed(2)}`;
          break;
        case 'mod.swift':
          if (e.hasBuff('run.modifiers')) what = 'speed buff on';
          break;
        case 'mod.resistant':
          if (e.stats.fireResist > base.stats.fireResist) what = `fire resist ${base.stats.fireResist} -> ${e.stats.fireResist}`;
          break;
        case 'mod.reflect': {
          events.emit('enemy:damaged', { id: e.id, amount: 400, type: 'physical', crit: false, x: 0, y: 0, z: 0 });
          const r = w.hits.find((h) => h.ability === 'mod.reflect');
          if (r) what = `reflected ${r.amount.toFixed(0)} of 400`;
          break;
        }
        case 'mod.drain': {
          e.life = e.maxLife * 0.5;
          const before = e.life;
          events.emit('player:damaged', { amount: 300, type: 'physical', life: 1, maxLife: 1 });
          if (e.life > before) what = `healed ${Math.round(e.life - before)}`;
          break;
        }
        case 'mod.fragile': {
          const plainW = world([]);
          const r0 = plainW.player.stats.physicalResist;
          const r1 = w.player.stats.physicalResist;
          const d0 = plainW.player.stats.enhancedDamage;
          const d1 = w.player.stats.enhancedDamage;
          if (r1 < r0 && d1 > d0) what = `physical resist ${r0} -> ${r1}, damage +${Math.round(d1 - d0)}%`;
          plainW.mods.dispose();
          break;
        }
        case 'mod.greed': {
          const plainW = world([]);
          if (w.player.stats.magicFind > plainW.player.stats.magicFind + 16) what = `magic find ${plainW.player.stats.magicFind} -> ${w.player.stats.magicFind}`;
          plainW.mods.dispose();
          break;
        }
        case 'mod.gloom':
          if (w.exposure.length && w.exposure[0]! < 1) what = `exposure ${w.exposure[0]}`;
          break;
        case 'mod.blaze': {
          for (let i = 0; i < 12 && !w.hits.some((h) => h.ability === 'mod.blaze'); i++) {
            const d = monster(w, 0.3);
            d.root.position.copy(w.player.position);
            w.mods.onKill(d);
            step(w, 1.2);
          }
          const n = w.hits.filter((h) => h.ability === 'mod.blaze').length;
          if (n) what = `${w.mods.tally.firePools ?? 0} pools, burned ${n} ticks`;
          break;
        }
        case 'mod.unstable': {
          const el = monster(w, 1, 'elite');
          w.mods.onKill(el);
          step(w, 1.4);
          if (w.hits.some((h) => h.ability === 'mod.unstable')) what = 'an elite detonated under you';
          break;
        }
        case 'mod.frostbite':
          step(w, 2.5);
          if (w.player.status.has('chilled') && w.hits.some((h) => h.ability === 'mod.frostbite')) what = 'standing still chilled and hurt you';
          break;
        case 'mod.ambush': {
          const n0 = w.enemies.length;
          step(w, 31, 0.25);
          if (w.enemies.length > n0) what = `${w.enemies.length - n0} stepped out of the dark`;
          break;
        }
        case 'mod.void': {
          const n0 = w.enemies.length;
          step(w, 45, 0.25);
          const called = w.enemies.slice(n0);
          if (called.length && called.every((x) => x.rank === 'champion')) what = `a rift spilled ${called.length} champions`;
          break;
        }
        case 'mod.hunted': {
          const n0 = w.enemies.length;
          step(w, 19, 0.25);
          const s = w.enemies[n0];
          if (s && (s.rank === 'elite' || s.rank === 'rare') && s.ai?.fixateOnPlayer) what = `a ${s.rank} stalker with ${s.maxLife} life hunts you`;
          break;
        }
        default:
          what = '';
      }
      w.mods.dispose();
    }
  } catch (err) {
    problems.push(`${id}: threw ${String(err).slice(0, 200)}`);
  }
  effects[`${m.name} (${id})`] = what || 'NOTHING';
  if (!what) problems.push(`${m.name} (${id}) does nothing`);
  const v = modValue(id, 2);
  if (!Number.isFinite(v)) problems.push(`${id}: description value is not a number`);
}
report.effects = effects;

// --- 2. Danger pays ---------------------------------------------------------
{
  const none = world([]);
  const two = world(['mod.hardened@2', 'mod.savage@2']);
  const mf0 = none.player.stats.magicFind;
  const mf2 = two.player.stats.magicFind;
  report.spoils = `magic find with no modifiers ${mf0}, with two tier-2 modifiers ${mf2}`;
  if (!(mf2 >= mf0 + 30)) problems.push('modifiers do not raise magic find');
  // A purge cannot shed them for long.
  two.player.status.clear();
  two.player.refreshStats();
  step(two, 3.5);
  if (two.player.stats.magicFind !== mf2) problems.push('run statuses did not come back after a purge');
  none.mods.dispose();
  two.mods.dispose();
}

// --- 3. Milestones ------------------------------------------------------------
{
  const acct = save.account;
  legacyOf(acct).milestones = [];
  const c = createCharacter('Deep', 'ranger', new Random(8));
  acct.current = c;
  const claimed = claimMilestones(acct, 12);
  if (JSON.stringify(claimed.map((m) => m.depth)) !== '[5,10]') problems.push(`clearing depth 12 claimed ${claimed.map((m) => m.depth)}`);
  if (claimMilestones(acct, 12).length) problems.push('milestones were claimable twice');
  legacyOf(acct).milestones = [5];
  const gold0 = c.gold;
  const items0 = c.inventory.filter(Boolean).length;
  const renown0 = legacyOf(acct).renown;
  const dir = new RunDirector(15);
  dir.onRunCleared();
  dir.dispose();
  const got = c.inventory.filter(Boolean).length - items0;
  const want = milestoneReward(10).items.length + milestoneReward(15).items.length;
  report.milestones = `clearing 15 with 5 claimed: +${c.gold - gold0} gold, +${got} items, +${Math.round(legacyOf(acct).renown - renown0)} renown; claimed ${legacyOf(acct).milestones}`;
  if (got !== want) problems.push(`milestone caches gave ${got} items, expected ${want}`);
  if (c.gold - gold0 < milestoneReward(10).gold + milestoneReward(15).gold) problems.push('milestone caches paid too little gold');
  if (JSON.stringify(legacyOf(acct).milestones) !== '[5,10,15]') problems.push(`milestones after clearing 15: ${legacyOf(acct).milestones}`);
  for (const m of [5, 10, 25, 50]) {
    const r = milestoneReward(m);
    if (!r.items.includes('unique')) problems.push(`milestone ${m} has no guaranteed unique`);
  }
}

// --- 4. Waypoints and pacts -------------------------------------------------
{
  const acct = save.account;
  const c = createCharacter('Fresh', 'stormcaller', new Random(9));
  acct.current = c;
  legacyOf(acct).milestones = [5, 10, 15];
  const wp = LEGACY_UNLOCKS.find((u) => u.id === 'waypoints')!;
  legacyOf(acct).renown = renownForRank(wp.rank) - 1;
  if (descentOptions(acct, c).length !== 1) problems.push('waypoints offered before they unlock');
  grantRenown(acct, 2);
  const opts = descentOptions(acct, c);
  if (JSON.stringify(opts) !== '[1,5,10,15]') problems.push(`waypoint options for a new character: ${opts}`);
  c.depthRecord = 9;
  if (JSON.stringify(descentOptions(acct, c)) !== '[10,15]') problems.push(`waypoint options at record 9: ${descentOptions(acct, c)}`);

  const offers = pactOffers(c, 20);
  report.pacts = offers;
  if (offers.length !== 3 || new Set(offers.map((o) => o.split('@')[0])).size !== 3) problems.push(`pact offers: ${offers}`);
  if (offers.some((o) => !PACT_POOL.includes(o.split('@')[0]!))) problems.push('a pact is not a runtime modifier');
  if (JSON.stringify(pactOffers(c, 20)) !== JSON.stringify(offers)) problems.push('pact offers change between visits to the gate');
  const plain = new RunDirector(20, 0);
  const pact = new RunDirector(20, 1);
  const r0 = legacyOf(acct).renown;
  plain.onKill('rare');
  const r1 = legacyOf(acct).renown;
  pact.onKill('rare');
  const r2 = legacyOf(acct).renown;
  plain.dispose();
  pact.dispose();
  report.pactRenown = `a rare kill: ${(r1 - r0).toFixed(2)} renown, with one pact ${(r2 - r1).toFixed(2)}`;
  if (!((r2 - r1) > (r1 - r0) * 1.2)) problems.push('a pact does not raise Renown');
}

console.log(JSON.stringify({ problems, report }));
