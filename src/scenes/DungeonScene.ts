import * as THREE from 'three';
import { GameScene, type Engine, disposeObject } from '../core/Engine';
import type {
  SceneId,
  DungeonRun,
  DungeonLevel,
  BiomeDef,
  Item,
  DamagePacket,
  MonsterRank,
} from '../types';
import { events, toast } from '../core/Events';
import { audio } from '../audio/Audio';
import { save } from '../core/Save';
import { Random, randomSeed } from '../core/RNG';
import { FXSystem } from '../fx/Particles';
import { DecalSystem } from '../fx/Decals';
import { CameraRig } from '../fx/CameraRig';
import { Player } from '../entities/Player';
import { Enemy, type CombatContext } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
import { MONSTERS, MONSTER_AFFIXES, BOSSES } from '../data/monsters';
import { generateRun, isWalkable, BIOMES } from '../world/DungeonGen';
import { DungeonMesh, applyBiomeLighting } from '../world/DungeonBuilder';
import { NavGrid } from '../world/Nav';
import { rollDrops } from '../sim/Loot';
import { buildDropModel } from '../art/ItemModels';
import { grantXp } from '../sim/Character';
import { addItemToInventory } from '../sim/Inventory';
import { onKill, onBossKilled, onInteract, onSurviveTick, questRewards } from '../sim/Quests';
import { SkillRunner } from './SkillRunner';

export interface DungeonPayload {
  depth: number;
  seed?: number;
}

interface GroundLoot {
  item: Item;
  root: THREE.Object3D;
  pos: THREE.Vector3;
  bornAt: number;
}

/**
 * The dungeon. Owns the run, the current level's geometry, every enemy, loot on
 * the floor, and the player. This is the integration point for every other
 * system in the game.
 */
export class DungeonScene extends GameScene {
  readonly id: SceneId = 'dungeon';
  camera: THREE.PerspectiveCamera;

  private engine: Engine;
  private fx: FXSystem;
  private decals: DecalSystem;
  private rig: CameraRig;
  private skills: SkillRunner;

  private run!: DungeonRun;
  private levelIndex = 0;
  private level!: DungeonLevel;
  private biome!: BiomeDef;
  private mesh!: DungeonMesh;
  private nav!: NavGrid;
  private lighting: { dispose(): void } | null = null;

  private player!: Player;
  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private loot: GroundLoot[] = [];
  private rng!: Random;

  private keyDir = new THREE.Vector3();
  private offs: Array<() => void> = [];
  private aiCursor = 0;
  private exitPos = new THREE.Vector3();
  private transitioning = false;
  private runTime = 0;
  private godMode = false;

  constructor(engine: Engine) {
    super();
    this.engine = engine;
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 240);
    this.fx = new FXSystem(this.scene, engine.renderer.quality);
    this.decals = new DecalSystem(this.scene, engine.renderer.quality);
    this.rig = new CameraRig(this.camera);
    this.skills = new SkillRunner();
  }

  async enter(payload?: unknown): Promise<void> {
    const p = (payload ?? {}) as Partial<DungeonPayload>;
    const character = save.account.current;
    if (!character) {
      await this.engine.goTo('charSelect');
      return;
    }

    const depth = Math.max(1, p.depth ?? 1);
    const seed = p.seed ?? randomSeed();
    this.rng = new Random(seed);

    this.run = generateRun(depth, seed, character.classId);
    this.player = new Player(character, seed);
    this.scene.add(this.player.root);

    this.loadLevel(0);

    events.emit('ui:open', { panel: 'hud' });
    if (this.run.quest) {
      toast(this.run.quest.name, 'epic');
    }
    audio.music(this.biome.music, 2.0);
  }

  /** Tears down the current level and builds the next. */
  private loadLevel(index: number): void {
    // Clear the previous level.
    for (const e of this.enemies) {
      e.root.removeFromParent();
      e.dispose();
    }
    this.enemies = [];
    if (this.boss) {
      this.boss.root.removeFromParent();
      this.boss.dispose();
      this.boss = null;
    }
    for (const l of this.loot) {
      l.root.removeFromParent();
      disposeObject(l.root);
    }
    this.loot = [];
    if (this.mesh) {
      this.mesh.root.removeFromParent();
      this.mesh.dispose();
    }
    this.lighting?.dispose();

    this.levelIndex = index;
    this.level = this.run.levels[index]!;
    this.biome = BIOMES.find((b) => b.id === this.level.biome) ?? BIOMES[0]!;

    const levelRng = this.rng.fork(`level:${index}`) as Random;
    this.mesh = new DungeonMesh(this.level, this.biome, levelRng);
    this.scene.add(this.mesh.root);
    this.nav = new NavGrid(this.level);
    this.lighting = applyBiomeLighting(this.scene, this.biome);

    this.scene.fog = new THREE.FogExp2(this.biome.fogColor, this.biome.fogDensity);
    this.scene.background = new THREE.Color(this.biome.fogColor).multiplyScalar(0.4);

    // Place the player at the entry stairs.
    const entry = this.mesh.tileToWorld(this.level.entry.x, this.level.entry.y);
    this.player.position.copy(entry);
    this.player.stop();
    this.rig.snapTo(this.player.position);

    this.exitPos.copy(this.mesh.tileToWorld(this.level.exit.x, this.level.exit.y));

    // Spawn the level's monsters.
    for (const spawn of this.level.spawns) {
      const def = MONSTERS.find((m) => m.id === spawn.monsterId);
      if (!def) continue;
      const affixes = spawn.affixes
        .map((id) => MONSTER_AFFIXES.find((a) => a.id === id))
        .filter((a): a is NonNullable<typeof a> => !!a);
      const enemy = new Enemy(def, spawn.rank, affixes, this.run.depth, levelRng.fork(`e${spawn.x},${spawn.y}`));
      const wp = this.mesh.tileToWorld(spawn.x, spawn.y);
      enemy.root.position.copy(wp);
      this.scene.add(enemy.root);
      this.enemies.push(enemy);
    }

    // Boss floor.
    if (this.level.isBossLevel) {
      const def = BOSSES.find((b) => b.id === this.run.bossId) ?? BOSSES[0];
      if (def) {
        this.boss = new Boss(def, this.run.depth, levelRng.fork('boss'));
        const bp = this.mesh.tileToWorld(this.level.exit.x, this.level.exit.y);
        this.boss.root.position.copy(bp);
        this.scene.add(this.boss.root);
      }
    }

    this.fx.setAmbient(this.biome.particles ?? null, new THREE.Box3().setFromObject(this.mesh.root));

    events.emit('depth:changed', {
      depth: this.run.depth,
      level: index + 1,
      of: this.run.levels.length,
    });
  }

  /** The world view handed to enemy AI each frame. */
  private context(): CombatContext {
    return {
      playerPos: this.player.position,
      playerStats: this.player.stats,
      playerLevel: this.player.character.level,
      damagePlayer: (packet: DamagePacket) => {
        if (this.godMode) return;
        const taken = this.player.takeDamage(packet, this.rng);
        if (taken > 0) {
          this.engine.renderer.flashHurt(Math.min(1, taken / Math.max(1, this.player.stats.life * 0.25)));
          this.rig.addTrauma(Math.min(0.5, taken / Math.max(1, this.player.stats.life * 0.4)));
        }
      },
      nav: this.nav,
      fx: this.fx,
      decals: this.decals,
      rng: this.rng,
      elapsed: this.runTime,
      enemies: this.enemies,
      scene: this.scene,
    };
  }

  override update(dt: number, elapsed: number): void {
    if (!this.player || this.transitioning) return;
    this.runTime += dt;

    const input = this.engine.input;
    input.updateWorldPoint(this.camera, 0);

    const ctx = this.context();

    if (this.player.alive) {
      this.handleInput(dt, input, ctx);
    }

    this.player.update(dt, {
      colliders: this.mesh.colliders,
      walkableAt: (x, z) => {
        const t = this.mesh.worldToTile(x, z);
        return isWalkable(this.level, t.x, t.y);
      },
    }, this.keyDir.lengthSq() > 0 ? this.keyDir : null);

    // Stagger AI: every enemy moves every frame, but only a slice re-plans.
    // Full pathfinding for 60 enemies per frame would blow the budget.
    const slice = Math.max(1, Math.ceil(this.enemies.length / 4));
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      e.update(dt, ctx);
    }
    this.aiCursor = (this.aiCursor + slice) % Math.max(1, this.enemies.length);

    this.boss?.update(dt, ctx);

    this.reapDead(ctx);
    this.updateLoot(dt, elapsed, input);
    this.checkExit();

    onSurviveTick(this.run.quest, dt);

    this.skills.update(dt, ctx, this.enemies, this.boss);
    this.mesh.update(dt, elapsed, this.player.position);
    this.rig.follow(this.player.position, dt, input);
    this.fx.update(dt, elapsed);
    this.decals.update(dt);

    audio.setListener(this.player.position.x, this.player.position.z, this.player.root.rotation.y);

    // Low-life vignette feeds off the grade pass.
    const lifeFrac = this.player.stats.life > 0 ? this.player.life / this.player.stats.life : 0;
    this.engine.renderer.setLowLife(lifeFrac < 0.3 ? 1 - lifeFrac / 0.3 : 0);

    if (!this.player.alive) this.handleDeath();
  }

  private handleInput(dt: number, input: Engine['input'], ctx: CombatContext): void {
    this.keyDir.set(0, 0, 0);
    if (input.keyDown('KeyW') || input.keyDown('ArrowUp')) this.keyDir.z -= 1;
    if (input.keyDown('KeyS') || input.keyDown('ArrowDown')) this.keyDir.z += 1;
    if (input.keyDown('KeyA') || input.keyDown('ArrowLeft')) this.keyDir.x -= 1;
    if (input.keyDown('KeyD') || input.keyDown('ArrowRight')) this.keyDir.x += 1;
    if (this.keyDir.lengthSq() > 0) {
      this.keyDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rig.yaw);
    }

    if (input.pointerOverUI) return;

    // Left click: primary skill (hotbar 0) or move if nothing bound.
    if (input.mouseLeft) {
      const primary = this.player.character.hotbar[0];
      const target = input.worldPoint;
      if (primary) {
        this.skills.cast(primary, this.player, target, ctx, this.enemies, this.boss);
      } else {
        this.player.moveTo(target.x, target.z);
      }
    }

    // Right click: secondary skill.
    if (input.mouseRight) {
      const secondary = this.player.character.hotbar[1];
      if (secondary) this.skills.cast(secondary, this.player, input.worldPoint, ctx, this.enemies, this.boss);
    }

    // Number keys 1-6 map to hotbar slots.
    for (let i = 0; i < 6; i++) {
      if (input.keyPressed(`Digit${i + 1}`)) {
        const id = this.player.character.hotbar[i];
        if (id) this.skills.cast(id, this.player, input.worldPoint, ctx, this.enemies, this.boss);
      }
    }

    if (input.wasPressed('dodge')) {
      const d = new THREE.Vector3().subVectors(input.worldPoint, this.player.position);
      if (this.keyDir.lengthSq() > 0) d.copy(this.keyDir);
      if (this.player.dodge(d.x, d.z)) this.rig.addTrauma(0.08);
    }
  }

  /** Handles kills: XP, loot, quest progress, FX. */
  private reapDead(ctx: CombatContext): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]!;
      if (e.life > 0 || !e.readyToRemove) continue;
      this.enemies.splice(i, 1);
      this.grantKill(e.monsterId, e.rank, e.family, e.root.position, e.ilvl);
      e.root.removeFromParent();
      e.dispose();
    }

    if (this.boss && this.boss.life <= 0 && this.boss.readyToRemove) {
      const b = this.boss;
      this.boss = null;
      onBossKilled(this.run.quest, b.defId);
      events.emit('boss:killed', { name: b.name });
      this.grantKill(b.defId, 'boss', 'demon', b.root.position, this.run.depth + 6);
      // Boss death is the run's payoff: a real burst of loot.
      const drops = rollDrops(this.run.depth + 8, 'boss', this.rng, this.player.stats.magicFind, this.player.stats.goldFind);
      for (const item of drops.items) this.dropItem(item, b.root.position);
      this.awardQuestIfComplete();
      b.root.removeFromParent();
      b.dispose();
    }
  }

  private grantKill(
    monsterId: string,
    rank: MonsterRank,
    family: string,
    pos: THREE.Vector3,
    ilvl: number
  ): void {
    events.emit('enemy:killed', { id: monsterId, monsterId, rank, x: pos.x, z: pos.z });
    onKill(this.run.quest, monsterId, family, rank);

    const c = this.player.character;
    const xpMul = rank === 'boss' ? 22 : rank === 'rare' ? 5 : rank === 'elite' ? 3.2 : rank === 'champion' ? 1.9 : 1;
    const xp = Math.round((8 + this.run.depth * 6) * xpMul);
    if (grantXp(c, xp)) {
      this.player.refreshStats();
      this.fx.burst('levelup', pos.x, 1, pos.z, { count: 90 });
      audio.play('levelup');
    }
    events.emit('player:xp', { gained: xp, total: c.xp, toNext: 0 });

    const drops = rollDrops(ilvl, rank, this.rng, this.player.stats.magicFind, this.player.stats.goldFind);
    for (const item of drops.items) this.dropItem(item, pos);
    if (drops.gold > 0) {
      c.gold += drops.gold;
      events.emit('loot:gold', { amount: drops.gold });
    }
    for (const [id, n] of Object.entries(drops.materials)) save.addMaterial(id, n);
  }

  private dropItem(item: Item, at: THREE.Vector3): void {
    const model = buildDropModel(item, this.rng);
    // Scatter so a big drop doesn't stack into one unreadable pile.
    const a = this.rng.range(0, Math.PI * 2);
    const d = this.rng.range(0.3, 1.5);
    const pos = new THREE.Vector3(at.x + Math.cos(a) * d, 0, at.z + Math.sin(a) * d);
    model.position.copy(pos);
    this.scene.add(model);
    this.loot.push({ item, root: model, pos, bornAt: this.runTime });
    events.emit('loot:dropped', { item, x: pos.x, z: pos.z });
  }

  private updateLoot(dt: number, elapsed: number, input: Engine['input']): void {
    const pickupRadius = 1.5;
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i]!;
      const age = this.runTime - l.bornAt;
      // Drop-in arc, then a slow idle bob and spin.
      if (age < 0.45) {
        const t = age / 0.45;
        l.root.position.y = Math.sin(t * Math.PI) * 0.9;
      } else {
        l.root.position.y = 0.28 + Math.sin(elapsed * 2.1 + l.pos.x) * 0.06;
      }
      l.root.rotation.y += dt * 1.1;

      if (l.pos.distanceTo(this.player.position) < pickupRadius) {
        const ok = addItemToInventory(this.player.character, l.item);
        if (ok) {
          this.loot.splice(i, 1);
          l.root.removeFromParent();
          disposeObject(l.root);
          events.emit('loot:pickedUp', { item: l.item });
          this.fx.burst('pickup', l.pos.x, 0.5, l.pos.z, { count: 14 });
        }
      }
    }
  }

  private checkExit(): void {
    if (this.transitioning) return;
    if (this.level.isBossLevel && this.boss) return; // gate the exit behind the boss
    if (this.player.position.distanceTo(this.exitPos) > 1.6) return;

    if (this.levelIndex + 1 < this.run.levels.length) {
      this.transitioning = true;
      audio.play('stairs');
      void (async () => {
        const { fadeTo } = await import('../core/Engine');
        await fadeTo(1, 320);
        this.loadLevel(this.levelIndex + 1);
        await fadeTo(0, 420);
        this.transitioning = false;
      })();
    } else {
      // Run complete — bank the depth and return to town.
      this.transitioning = true;
      const c = this.player.character;
      c.depthRecord = Math.max(c.depthRecord, this.run.depth);
      if (this.run.depth > save.account.bestDepth) save.account.bestDepth = this.run.depth;
      this.awardQuestIfComplete();
      save.setCharacter(c);
      toast(`Depth ${this.run.depth} cleared.`, 'epic');
      void this.engine.goTo('town');
    }
  }

  private awardQuestIfComplete(): void {
    const q = this.run.quest;
    if (!q || !q.complete || q.turnedIn) return;
    q.turnedIn = true;
    const rewards = questRewards(q, this.run.depth, this.rng);
    const c = this.player.character;
    c.gold += rewards.gold;
    grantXp(c, rewards.xp);
    for (const item of rewards.items) this.dropItem(item, this.player.position);
    events.emit('quest:complete', { name: q.name });
    audio.play('quest.complete');
  }

  private handleDeath(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    const c = this.player.character;
    const payload = {
      killedBy: 'the depths',
      depth: this.run.depth,
      level: c.level,
      name: c.name,
      playtime: c.playtime,
    };
    // The roguelike contract: the character is gone, the stash is not.
    save.killCharacter(payload.killedBy, this.run.depth);
    setTimeout(() => {
      void this.engine.goTo('death', payload);
    }, 2200);
  }

  /** Debug hooks used by the screenshot harness and by manual testing. */
  debugWarpToBoss(): void {
    const last = this.run.levels.length - 1;
    if (this.levelIndex !== last) this.loadLevel(last);
    if (this.boss) {
      const p = this.boss.root.position;
      this.player.position.set(p.x, 0, p.z + 7);
      this.rig.snapTo(this.player.position);
    }
  }

  debugGodMode(on: boolean): void {
    this.godMode = on;
    this.player.invulnerable = on;
  }

  override dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
    for (const e of this.enemies) e.dispose();
    this.enemies = [];
    this.boss?.dispose();
    this.mesh?.dispose();
    this.lighting?.dispose();
    this.player?.dispose();
    this.skills.dispose();
    this.fx.dispose();
    this.decals.dispose();
    this.engine.renderer.setLowLife(0);
    events.emit('ui:close', { panel: 'hud' });
  }
}
