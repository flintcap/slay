/**
 * SLAY — dungeon events.
 *
 * The generator scatters a few set pieces through ordinary rooms
 * (`DungeonGen.placeEvents`). This runs them:
 *
 *   - **Cursed chest.** Opening it seals the lid and calls two waves of
 *     champions and elites out of the dark. Kill every one inside the time
 *     limit and it opens with loot fit for a boss. Fail and it crumbles.
 *   - **Fallen adventurer.** A bone pile with a purse and something worth
 *     keeping. Taking it springs the ambush that killed them; the ambushers
 *     carry a guaranteed rare.
 *   - **Shrine of choices.** Three bargains: a boon, usually with a price.
 *   - **Treasure runner.** The Hoarder, a fat thief with a sack of gold, who
 *     bolts the moment it sees you, shedding coins, and escapes after a while.
 *     Catch it for a gold fountain and an armful of items.
 *
 * DungeonScene owns one per run and calls `onLevel`, `interact`, `onKill`
 * and `update`. Every reward goes through the host, so the scene keeps sole
 * ownership of the floor's loot list.
 */

import * as THREE from 'three';
import type { DungeonLevel, Item, MonsterRank } from '../types';
import { toast } from '../core/Events';
import { audio } from '../audio/Audio';
import type { Random } from '../core/RNG';
import type { Player } from '../entities/Player';
import { Enemy, type CombatContext } from '../entities/Enemy';
import type { EffectSystem } from '../fx/Effects';
import type { FXSystem } from '../fx/Particles';
import type { DecalSystem } from '../fx/Decals';
import type { Interactable } from '../world/DungeonBuilder';
import { MONSTERS, rollAffixes } from '../data/monsters';
import type { NamedRare } from '../data/namedRares';
import { BARGAINS, getBargain, type BargainDef } from '../data/boons';
import { rollDrops, rollItem } from '../sim/Loot';
import { offerChoice } from '../ui/DepthUI';

export interface EventHost {
  scene: THREE.Scene;
  player: () => Player;
  enemies: () => Enemy[];
  context: () => CombatContext;
  effects: EffectSystem;
  fx: FXSystem;
  decals: DecalSystem;
  rng: () => Random;
  depth: number;
  level: () => DungeonLevel;
  tileToWorld: (x: number, y: number) => THREE.Vector3;
  walkable: (x: number, z: number) => boolean;
  /** Hides a used event prop and stops it blocking movement. */
  consume: (it: Interactable) => void;
  dropItem: (item: Item, at: THREE.Vector3) => void;
  dropGold: (amount: number, at: THREE.Vector3) => void;
  addMaterials: (m: Record<string, number>) => void;
  magicFind: () => number;
  /** Renown for finishing an event. */
  renown: (amount: number) => void;
}

/** Monsters an event called into being, and what happens when they are all dead. */
interface Trial {
  kind: 'cursedChest' | 'ambush' | 'hunt';
  it: Interactable | null;
  at: THREE.Vector3;
  members: Set<string>;
  wavesLeft: Array<{ count: number; rank: MonsterRank }>;
  timeLeft: number;
  /** When set, the trial fails at zero. */
  timed: boolean;
  nextWaveIn: number;
  lastAnnounce: number;
}

interface Runner {
  enemy: Enemy;
  seen: boolean;
  escapeIn: number;
  dashCd: number;
  coinCd: number;
}

const RUNNER_NAMES = ['Gildgrub the Hoarder', 'Sackback Mott', 'Old Tallow, Who Took It All', 'The Pilfering Saint'];

export class RunEvents {
  private host: EventHost;
  private trials: Trial[] = [];
  private runner: Runner | null = null;
  /** Monster ids an event spawned, so the scene's loot rules can tell. */
  private eventSpawned = new Set<string>();
  /** Members of a hunt or ambush that carry a guaranteed rare. */
  private carriers = new Set<string>();
  private serial = 0;

  constructor(host: EventHost) {
    this.host = host;
  }

  /** A new floor was built. Spawns anything the floor's events need up front. */
  onLevel(): void {
    this.trials = [];
    this.runner = null;
    this.eventSpawned.clear();
    this.carriers.clear();
    const level = this.host.level();
    for (const ev of level.events ?? []) {
      if (ev.kind === 'treasureRunner') this.spawnRunner(ev.x, ev.y);
    }
  }

  /** Handles an event prop. Returns false for anything that is not one. */
  interact(it: Interactable): boolean {
    switch (it.kind) {
      case 'chest.cursed':
        this.openCursedChest(it);
        return true;
      case 'corpse.ambush':
        this.lootFallen(it);
        return true;
      case 'shrine.choice':
        this.offerShrine(it);
        return true;
      default:
        return false;
    }
  }

  /** What the prompt should say for an event prop, or null for anything else. */
  static prompt(kind: string): string | null {
    switch (kind) {
      case 'chest.cursed':
        return 'Open the cursed chest';
      case 'corpse.ambush':
        return 'Search the fallen adventurer';
      case 'shrine.choice':
        return 'Kneel at the shrine of choices';
      default:
        return null;
    }
  }

  // -------------------------------------------------------------------------
  // Cursed chest
  // -------------------------------------------------------------------------

  private openCursedChest(it: Interactable): void {
    if (this.trials.some((t) => t.it === it)) {
      toast('The curse is still on it. Kill what it called.', 'bad');
      return;
    }
    const at = new THREE.Vector3(it.x, 0, it.z);
    const deep = this.host.depth;
    const trial: Trial = {
      kind: 'cursedChest',
      it,
      at,
      members: new Set(),
      wavesLeft: [
        { count: 4 + Math.min(4, Math.floor(deep / 8)), rank: 'champion' },
        { count: 2 + Math.min(3, Math.floor(deep / 12)), rank: 'elite' },
      ],
      timeLeft: 45,
      timed: true,
      nextWaveIn: 0,
      lastAnnounce: 45,
    };
    this.trials.push(trial);
    this.host.effects.summonCircle(at.x, at.z, 5, 2.4, 0xa82040);
    this.host.fx.burst('void', at.x, 1.0, at.z, { count: 50, color: 0xa82040, scale: 1.4 });
    audio.play('ambush');
    toast('The chest is cursed! Slay what answers within 45 seconds.', 'epic');
  }

  // -------------------------------------------------------------------------
  // Fallen adventurer
  // -------------------------------------------------------------------------

  private lootFallen(it: Interactable): void {
    this.host.consume(it);
    const at = new THREE.Vector3(it.x, 0, it.z);
    const rng = this.host.rng();
    const ilvl = this.host.depth + 2;
    this.host.dropGold(Math.round((30 + ilvl * 14) * rng.range(0.8, 1.4)), at);
    this.host.dropItem(rollItem(ilvl, rng, { magicFind: this.host.magicFind() + 60 }), at);
    this.host.fx.burst('dust', at.x, 0.6, at.z, { count: 18 });
    const trial: Trial = {
      kind: 'ambush',
      it: null,
      at: this.host.player().position.clone(),
      members: new Set(),
      wavesLeft: [{ count: 5 + Math.min(5, Math.floor(this.host.depth / 6)), rank: 'champion' }],
      timeLeft: 0,
      timed: false,
      nextWaveIn: 0.6,
      lastAnnounce: 0,
    };
    this.trials.push(trial);
    toast('Whatever killed them is still here.', 'bad');
  }

  // -------------------------------------------------------------------------
  // Shrine of choices
  // -------------------------------------------------------------------------

  private offerShrine(it: Interactable): void {
    const rng = this.host.rng();
    const pool = BARGAINS.filter((b) => b.minDepth <= this.host.depth);
    const picks: BargainDef[] = [];
    while (picks.length < 3 && picks.length < pool.length) {
      const b = rng.weighted(pool.filter((p) => !picks.includes(p)), (p) => p.weight);
      picks.push(b);
    }
    const player = this.host.player();
    const gold = player.character.gold;
    offerChoice(
      'Shrine of Choices',
      'It offers three bargains. It will answer only once.',
      picks.map((b) => ({
        id: b.id,
        title: b.name,
        gain: b.gain,
        cost: b.cost || undefined,
        disabled: b.costKind === 'gold20' && gold < 50 ? 'You carry too little gold.' : undefined,
      })),
      (id) => {
        if (!id) return;
        const b = getBargain(id);
        if (!b || it.used) return;
        this.host.consume(it);
        this.takeBargain(b, new THREE.Vector3(it.x, 0, it.z));
      },
    );
  }

  /** Pays the bargain's price and grants its reward. Public for the checker. */
  takeBargain(b: BargainDef, at: THREE.Vector3): void {
    const player = this.host.player();
    const rng = this.host.rng();
    switch (b.costKind) {
      case 'life30':
        player.life = Math.max(1, player.life * 0.7);
        break;
      case 'life20':
        player.life = Math.max(1, player.life * 0.8);
        break;
      case 'mana20':
        player.mana = Math.max(0, player.mana * 0.8);
        break;
      case 'gold20': {
        const pay = Math.max(50, Math.floor(player.character.gold * 0.2));
        player.character.gold = Math.max(0, player.character.gold - pay);
        break;
      }
      case 'elites': {
        const trial: Trial = {
          kind: 'hunt',
          it: null,
          at: at.clone(),
          members: new Set(),
          wavesLeft: [{ count: 3 + Math.min(3, Math.floor(this.host.depth / 10)), rank: 'elite' }],
          timeLeft: 0,
          timed: false,
          nextWaveIn: 1.2,
          lastAnnounce: 0,
        };
        this.trials.push(trial);
        break;
      }
      default:
        break;
    }
    if (b.status) player.applyStatus(b.status, 180, 1, 1);
    if (b.reward === 'restore') {
      player.life = player.stats.life;
      player.mana = player.stats.mana;
    }
    if (b.reward === 'item') {
      const ilvl = this.host.depth + 3;
      const better = rng.chance(0.25);
      const item = better
        ? rollItem(ilvl, rng, { magicFind: this.host.magicFind() + 400 })
        : rollItem(ilvl, rng, { forceRarity: 'rare' });
      this.host.dropItem(item, at);
    }
    this.host.effects.teleportIn(at.x, 0.6, at.z, 0xffd66b);
    this.host.fx.burst('levelup', at.x, 1.0, at.z, { count: 40 });
    audio.play('levelup');
    toast(`${b.name}. ${b.gain}.`, 'good');
    this.host.renown(8 + this.host.depth * 1.5);
  }

  // -------------------------------------------------------------------------
  // Treasure runner
  // -------------------------------------------------------------------------

  private spawnRunner(tx: number, ty: number): void {
    const rng = this.host.rng();
    const level = this.host.level();
    // Something from this floor's own bestiary, so the Hoarder fits the place.
    const ids = Array.from(new Set(level.spawns.map((s) => s.monsterId)));
    const defs = ids.map((id) => MONSTERS.find((m) => m.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
    const def = defs.find((d) => d.role === 'swarm' || d.role === 'ambusher') ?? defs[0] ?? MONSTERS[0];
    if (!def) return;
    const named: NamedRare = {
      id: 'event.runner',
      name: rng.pick(RUNNER_NAMES),
      title: 'Carrying Far Too Much Gold',
      minDepth: 1,
      weight: 0,
      affixes: [],
      lifeMul: 0.9,
      damageMul: 0.2,
    };
    const enemy = new Enemy(def, 'rare', [], this.host.depth, rng.fork(`runner${this.serial++}`), named);
    // It never fights. It runs.
    enemy.ai = null;
    enemy.root.position.copy(this.host.tileToWorld(tx, ty));
    this.host.scene.add(enemy.root);
    this.host.enemies().push(enemy);
    this.eventSpawned.add(enemy.id);
    this.runner = { enemy, seen: false, escapeIn: 30, dashCd: 0, coinCd: 0 };
  }

  private tickRunner(dt: number): void {
    const r = this.runner;
    if (!r) return;
    const e = r.enemy;
    if (e.life <= 0 || !e.alive) {
      this.runner = null;
      return;
    }
    const player = this.host.player();
    const d = e.root.position.distanceTo(player.position);
    if (!r.seen && d < 16) {
      r.seen = true;
      toast(`${e.name} bolts with the gold! Catch it before it escapes.`, 'epic');
    }
    if (!r.seen) return;
    r.escapeIn -= dt;
    r.dashCd -= dt;
    r.coinCd -= dt;
    if (r.escapeIn <= 0) {
      const p = e.root.position;
      this.host.effects.teleportOut(p.x, 0.8, p.z, 0xffd66b);
      toast(`${e.name} escaped.`, 'bad');
      e.alive = false;
      e.life = 0;
      e.lootGranted = true;
      e.root.visible = false;
      e.readyToRemove = true;
      this.runner = null;
      return;
    }
    if (r.dashCd <= 0 && !e.motionOverride && d < 18) {
      r.dashCd = 0.75;
      const p = e.root.position;
      const away = new THREE.Vector3(p.x - player.position.x, 0, p.z - player.position.z);
      if (away.lengthSq() < 0.01) away.set(1, 0, 0);
      away.normalize();
      const rng = this.host.rng();
      // Try a few headings around "directly away", so walls do not trap it.
      for (let i = 0; i < 8; i++) {
        const turn = (i === 0 ? 0 : rng.range(-1.6, 1.6));
        const dir = away.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
        const len = rng.range(3.5, 5);
        const tx = p.x + dir.x * len;
        const tz = p.z + dir.z * len;
        if (!this.host.walkable(tx, tz) || !this.host.walkable((p.x + tx) / 2, (p.z + tz) / 2)) continue;
        e.motionOverride = { kind: 'dash', fromX: p.x, fromZ: p.z, toX: tx, toZ: tz, t: 0, duration: 0.6, arc: 0 };
        break;
      }
    }
    if (r.coinCd <= 0) {
      r.coinCd = 1.1;
      this.host.dropGold(Math.round(4 + this.host.depth * 2), e.root.position.clone());
    }
  }

  // -------------------------------------------------------------------------
  // Trials (waves of called monsters)
  // -------------------------------------------------------------------------

  private spawnWave(trial: Trial, count: number, rank: MonsterRank): void {
    const level = this.host.level();
    const rng = this.host.rng();
    const ids = Array.from(new Set(level.spawns.map((s) => s.monsterId)));
    const defs = ids.map((id) => MONSTERS.find((m) => m.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
    if (defs.length === 0) return;
    const ctx = this.host.context();
    const packId = 9000 + this.serial;
    for (let i = 0; i < count; i++) {
      const def = rng.pick(defs);
      const affixes = rollAffixes(this.host.depth, rank === 'elite' ? 2 : rank === 'champion' ? 1 : 0, rng);
      const e = new Enemy(def, rank, affixes, this.host.depth, rng.fork(`ev${this.serial++}`));
      e.packId = packId;
      // Ring them around the point, on ground that exists.
      let placed = false;
      for (let tries = 0; tries < 10 && !placed; tries++) {
        const a = (i / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
        const rad = rng.range(4, 7.5);
        const x = trial.at.x + Math.cos(a) * rad;
        const z = trial.at.z + Math.sin(a) * rad;
        if (!this.host.walkable(x, z)) continue;
        e.root.position.set(x, 0, z);
        placed = true;
      }
      if (!placed) e.root.position.copy(trial.at);
      this.host.scene.add(e.root);
      this.host.enemies().push(e);
      this.eventSpawned.add(e.id);
      trial.members.add(e.id);
      if (trial.kind !== 'cursedChest' && i === 0) this.carriers.add(e.id);
      this.host.effects.teleportIn(e.root.position.x, 0.8, e.root.position.z, 0xa82040);
      e.wake(ctx);
    }
  }

  private tickTrials(dt: number): void {
    for (let i = this.trials.length - 1; i >= 0; i--) {
      const t = this.trials[i]!;
      t.nextWaveIn -= dt;
      const alive = this.host.enemies().filter((e) => t.members.has(e.id) && e.life > 0).length;
      if (t.wavesLeft.length && (t.nextWaveIn <= 0 && (alive === 0 || t.members.size === 0))) {
        const w = t.wavesLeft.shift()!;
        this.spawnWave(t, w.count, w.rank);
        t.nextWaveIn = 0.8;
        continue;
      }
      if (t.timed) {
        t.timeLeft -= dt;
        if (t.timeLeft <= 15 && t.lastAnnounce > 15) toast('15 seconds!', 'bad');
        if (t.timeLeft <= 30 && t.lastAnnounce > 30) toast('30 seconds left.', 'info');
        t.lastAnnounce = t.timeLeft;
        if (t.timeLeft <= 0) {
          this.failTrial(t);
          this.trials.splice(i, 1);
          continue;
        }
      }
      if (t.wavesLeft.length === 0 && alive === 0 && t.members.size > 0) {
        this.completeTrial(t);
        this.trials.splice(i, 1);
      }
    }
  }

  private completeTrial(t: Trial): void {
    const rng = this.host.rng();
    if (t.kind === 'cursedChest' && t.it) {
      this.host.consume(t.it);
      const ilvl = this.host.depth + 4;
      const drops = rollDrops(ilvl, 'boss', rng, this.host.magicFind() + 100, 50);
      for (const item of drops.items) this.host.dropItem(item, t.at);
      this.host.dropGold(Math.round(drops.gold * 1.5), t.at);
      this.host.addMaterials(drops.materials);
      this.host.effects.explosion(t.at.x, 0.7, t.at.z, { radius: 2, element: 'arcane', color: 0xffd66b });
      audio.play('quest.complete');
      toast('The curse breaks. The chest is yours.', 'epic');
      this.host.renown(25 + this.host.depth * 4);
    } else {
      toast(t.kind === 'hunt' ? 'The hunt is over.' : 'The ambush is broken.', 'good');
      this.host.renown(12 + this.host.depth * 2);
    }
  }

  private failTrial(t: Trial): void {
    if (t.it) {
      this.host.consume(t.it);
      this.host.fx.burst('dust', t.at.x, 0.7, t.at.z, { count: 40, scale: 1.3 });
    }
    toast('Too slow. The chest crumbles to dust.', 'bad');
  }

  // -------------------------------------------------------------------------
  // Kills
  // -------------------------------------------------------------------------

  /** Called once per enemy as its loot is granted. Pays event bonuses. */
  onKill(e: Enemy): void {
    const rng = this.host.rng();
    const at = e.root.position.clone();
    if (this.runner?.enemy === e || (e.named?.id === 'event.runner')) {
      this.runner = null;
      const ilvl = this.host.depth + 3;
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) this.host.dropItem(rollItem(ilvl, rng, { magicFind: this.host.magicFind() + 150 }), at);
      for (let i = 0; i < 6; i++) this.host.dropGold(Math.round((25 + ilvl * 9) * rng.range(0.7, 1.4)), at);
      const mats = rollDrops(ilvl, 'rare', rng, 0, 0).materials;
      this.host.addMaterials(mats);
      this.host.fx.burst('pickup', at.x, 1.2, at.z, { count: 60, color: 0xffc63a, scale: 1.5 });
      toast(`${e.name} falls. The sack splits open.`, 'epic');
      this.host.renown(20 + this.host.depth * 3);
    }
    if (this.carriers.delete(e.id)) {
      this.host.dropItem(rollItem(this.host.depth + 3, rng, { forceRarity: 'rare' }), at);
    }
    this.eventSpawned.delete(e.id);
  }

  update(dt: number): void {
    this.tickRunner(dt);
    if (this.trials.length) this.tickTrials(dt);
  }

  /** For the checker: what is running right now. */
  debugState(): { trials: number; runner: boolean; spawned: number } {
    return { trials: this.trials.length, runner: !!this.runner, spawned: this.eventSpawned.size };
  }

  dispose(): void {
    this.trials = [];
    this.runner = null;
    this.eventSpawned.clear();
    this.carriers.clear();
  }
}
