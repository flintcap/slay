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
  MonsterFamily,
} from '../types';
import { events, toast } from '../core/Events';
import { audio } from '../audio/Audio';
import { save } from '../core/Save';
import { Random, randomSeed } from '../core/RNG';
import { FXSystem } from '../fx/Particles';
import { DecalSystem } from '../fx/Decals';
import { CameraRig } from '../fx/CameraRig';
import { EffectSystem } from '../fx/Effects';
import { Player } from '../entities/Player';
import { Enemy, type CombatContext } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
import { MONSTERS, MONSTER_AFFIXES, BOSSES } from '../data/monsters';
import { generateRun, isWalkable, BIOMES } from '../world/DungeonGen';
import { DungeonMesh, applyBiomeLighting, type Interactable } from '../world/DungeonBuilder';
import { NavGrid } from '../world/Nav';
import { rollDrops, rollItem, rollPotion } from '../sim/Loot';
import { buildDropModel } from '../art/ItemModels';
import { emissiveMaterial } from '../art/Materials';
import { grantXp } from '../sim/Character';
import { addItemToInventory } from '../sim/Inventory';
import { onKill, onBossKilled, onInteract, onSurviveTick, questRewards } from '../sim/Quests';
import { SkillRunner, weaponStyle } from './SkillRunner';
import { NameplateLayer } from '../ui/Nameplates';
import { GroundLabelLayer } from '../ui/GroundLabels';
import { setActiveDifficulty, activeDifficulty } from '../data/difficulties';
import { affixIconUri } from '../art/Icons';
import { typeColor } from '../entities/Abilities';
import { quickDrink, drinkPotion } from '../sim/Potions';
import { getStatus } from '../data/statuses';

/** What the prompt calls each thing you can use. */
const INTERACT_LABEL: Record<string, string> = {
  shrine: 'Pray at the shrine',
  chest: 'Open the chest',
  barrel: 'Smash the barrel',
  crate: 'Smash the crate',
  urn: 'Smash the urn',
  bookcase: 'Search the shelves',
  lever: 'Pull the lever',
  quest: 'Use the altar',
  altar: 'Use the altar',
};

/**
 * What a shrine can give you.
 *
 * Every one of these was authored in `data/statuses.ts` with real modifiers and
 * could not be granted by anything, because nothing built a shrine. Biome room
 * tables roll shrine rooms and a quest objective asks you to cleanse them.
 */
interface Blessing {
  id: string;
  duration: number;
  blurb: string;
}

/**
 * The generator already writes a shrine's flavour into its payload —
 * `shrine.power`, `shrine.fortune` and four more — so a shrine grants what it
 * looks like it should, not a random pick. Every status below was authored with
 * real modifiers and nothing in the game could grant a single one of them.
 */
const SHRINE_BLESSINGS: Record<string, Blessing[]> = {
  power: [
    { id: 'might', duration: 120, blurb: 'Your blows land heavier.' },
    { id: 'overcharged', duration: 120, blurb: 'The air crackles around you.' },
  ],
  ward: [
    { id: 'sanctified', duration: 120, blurb: 'Blessed against everything below.' },
    { id: 'fortitude', duration: 120, blurb: 'You can take more than you could.' },
  ],
  haste: [
    { id: 'haste', duration: 120, blurb: 'The floor comes at you faster.' },
    { id: 'veiled', duration: 90, blurb: 'They lose sight of you.' },
  ],
  fortune: [
    { id: 'treasureSense', duration: 180, blurb: 'The dark keeps fewer secrets.' },
    { id: 'inspired', duration: 120, blurb: 'Your craft comes easier.' },
  ],
  wrath: [
    { id: 'siphoning', duration: 120, blurb: 'Their wounds feed you.' },
    { id: 'soulharvest', duration: 150, blurb: 'Each death leaves something behind.' },
  ],
  vitality: [
    { id: 'secondWind', duration: 180, blurb: 'Something will catch you once.' },
    { id: 'evasion', duration: 120, blurb: 'You are harder to catch.' },
  ],
};

const ANY_BLESSING: Blessing[] = Object.values(SHRINE_BLESSINGS).flat();

export interface DungeonPayload {
  depth: number;
  seed?: number;
}

interface GroundLoot {
  /** Null for a gold pile. */
  item: Item | null;
  gold: number;
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
  private effects: EffectSystem;
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
  /** Hoisted out of the per-frame path; these ran every single frame. */
  private static readonly UP = new THREE.Vector3(0, 1, 0);
  /**
   * How close a melee attacker walks before swinging. Slightly under the swing's
   * own 2.3m reach, so arriving in range means the hit actually lands.
   */
  private static readonly MELEE_REACH = 1.9;
  /** How close you stand to use something. Generous: this is not a precision test. */
  private static readonly INTERACT_RANGE = 2.4;
  private tmpDir = new THREE.Vector3();
  private aimPoint = new THREE.Vector3();
  /** Reused each frame; ground loot can number in the dozens. */
  private labelScratch: Array<{ item: Item; root: THREE.Object3D; pos: THREE.Vector3 }> = [];
  private offs: Array<() => void> = [];
  private aiCursor = 0;
  private exitPos = new THREE.Vector3();
  /** On a boss floor the way home stays shut until the boss falls. */
  private exitOpen = true;
  private returnPortal: THREE.Object3D | null = null;
  /** Travels with the player so they are never standing in the dark. */
  private heroLight: THREE.PointLight | null = null;
  private heroAura: THREE.Mesh | null = null;
  /** Over-time portions of potions currently working. */
  private potionTicks: Array<{ life: number; mana: number; left: number }> = [];
  private plates: NameplateLayer | null = null;
  private groundLabels: GroundLabelLayer | null = null;
  private transitioning = false;
  private runTime = 0;
  private godMode = false;
  /** The interactable currently prompting, so the prompt only changes on change. */
  private nearProp: Interactable | null = null;
  /** Set when the floor's vault lever is pulled. Resets with each level. */
  private vaultOpen = false;

  constructor(engine: Engine) {
    super();
    this.engine = engine;
    this.rig = new CameraRig({ distance: 15.5, pitch: 0.92 });
    this.camera = this.rig.camera;
    this.fx = new FXSystem(this.scene, engine.renderer.quality);
    this.decals = new DecalSystem(this.scene, engine.renderer.quality);
    this.effects = new EffectSystem(this.scene, this.fx, this.decals, engine.renderer.quality);
    this.effects.setRig(this.rig);
    this.effects.setCamera(this.camera);
    this.skills = new SkillRunner(this.effects);
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

    // Must be set before anything generates: world gen and monster stats both
    // read the active tier.
    setActiveDifficulty(character.difficulty as never);

    this.run = generateRun(depth, seed, character.classId);
    this.player = new Player(character, seed);
    this.scene.add(this.player.root);

    // A light on the hero is standard for the genre: torch placement is
    // procedural, so without it the player regularly ends up in pitch black.
    // Floating combat text. The particle system has always been able to draw
    // these; nothing ever asked it to, so every hit in the game landed silently.
    this.offs.push(
      events.on('enemy:damaged', (e) => {
        if (!save.settings.showDamageNumbers) return;
        this.fx.damageNumber(
          String(Math.max(1, Math.round(e.amount))),
          e.x, e.y + 0.35, e.z,
          typeColor(e.type),
          !!e.crit,
        );
      }),
    );

    this.offs.push(
      events.on('potion:use', (p) => this.drink(p.kind, p.baseId)),
    );

    // Equipping has to change the model now, not whenever the stat sheet next
    // happens to be recomputed. `item:equipped` was fired into the void, so new
    // gear appeared on your character minutes later, at whatever unrelated
    // moment something else called refreshStats.
    this.offs.push(
      events.on('item:equipped', () => this.player?.refreshStats()),
      events.on('item:unequipped', () => this.player?.refreshStats()),
    );

    // Something thrown out of the pack lands at the player's feet, as a real
    // drop — so it can be picked straight back up if it was a mistake.
    this.offs.push(
      events.on('loot:discard', ({ item }) => {
        if (!this.player) return;
        this.dropItem(item, this.player.position);
        audio.play('ui.click');
        toast(`Dropped ${item.name}.`, 'info');
      }),
    );

    this.plates = new NameplateLayer();
    this.groundLabels = new GroundLabelLayer();
    this.groundLabels.onPickUp = (uid) => this.pickUpByUid(uid);
    // The torch. Hung well above head height rather than at the chest.
    //
    // Three.js has no per-object light filtering, so there is no way to light
    // the world and skip the player. What there is instead is geometry: from
    // 4 metres up the character catches a normal top light rather than being
    // lit from inside their own ribcage, and the visible ring of light is a
    // disc drawn on the floor, which cannot illuminate anything at all.
    this.heroLight = new THREE.PointLight(0xffd9a8, 30, 22, 2);
    this.heroLight.castShadow = false;
    this.scene.add(this.heroLight);

    this.heroAura = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.MeshBasicMaterial({
        map: makeAuraTexture(),
        color: 0xffc98a,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      }),
    );
    this.heroAura.rotation.x = -Math.PI / 2;
    this.heroAura.renderOrder = 2;
    this.scene.add(this.heroAura);

    this.loadLevel(0);

    events.emit('ui:open', { panel: 'hud' });

    // First descent: say plainly how to fight. Discovering the attack button by
    // accident is not a puzzle worth having.
    if (!save.hasUnlock('tutorial.controls')) {
      save.unlock('tutorial.controls');
      toast('Left click to attack. Move with WASD.', 'info');
      setTimeout(() => toast('Keys 1-6 cast your other skills.', 'info'), 3200);
      setTimeout(() => toast('Press T to spend skill points.', 'info'), 6400);
      setTimeout(() => toast('Space dodges. Q drinks a health potion.', 'info'), 9600);
    }

    if (this.run.quest) {
      setTimeout(() => toast(this.run.quest.name, 'epic'), 800);
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
    this.nearProp = null;
    this.vaultOpen = false;
    this.biome = BIOMES.find((b) => b.id === this.level.biome) ?? BIOMES[0]!;

    const levelRng = this.rng.fork(`level:${index}`) as Random;
    this.mesh = new DungeonMesh(this.level, this.biome, levelRng);
    this.scene.add(this.mesh.root);
    this.nav = new NavGrid(this.level);
    this.lighting = applyBiomeLighting(this.scene, this.biome);

    this.engine.renderer.applyEnvironment(this.scene, 0.4);
    this.scene.fog = new THREE.FogExp2(this.biome.fogColor, this.biome.fogDensity);
    this.scene.background = new THREE.Color(this.biome.fogColor).multiplyScalar(0.4);

    // Place the player at the entry stairs.
    const entry = this.mesh.tileToWorld(this.level.entry.x, this.level.entry.y);
    this.player.position.copy(entry);
    this.player.stop();
    this.rig.follow(this.player.root);
    this.rig.snap();

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

    // Boss floor: the fight owns the arena, and the exit stays sealed until
    // the boss dies — otherwise killing it on the stairs would end the run
    // before the player can pick up what it dropped.
    this.exitOpen = !this.level.isBossLevel;
    this.returnPortal = null;
    if (this.level.isBossLevel) {
      const def = BOSSES.find((b) => b.id === this.run.bossId) ?? BOSSES[0];
      if (def) {
        this.boss = new Boss(def, this.run.depth, levelRng.fork('boss'));
        const arena = this.level.rooms.find((r) => r.kind === 'boss');
        const centre = arena
          ? this.mesh.tileToWorld(Math.round(arena.center.x), Math.round(arena.center.y))
          : this.mesh.tileToWorld(this.level.exit.x, this.level.exit.y);
        this.boss.root.position.copy(centre);
        this.scene.add(this.boss.root);
      }
    }

    this.fx.setAmbient(this.biome.particles ?? null, new THREE.Box3().setFromObject(this.mesh.root));

    // Everything below is one-time work that would otherwise land on the frame
    // a pack first comes into view. Profiling a fight showed a single 3.4s
    // frame there against a 1.3ms median, so it all moves behind the fade.
    try {
      // Affix badges encode a PNG per icon; doing 60 of those mid-fight stalls.
      const seen = new Set<string>();
      for (const e of this.enemies) {
        const np = e.nameplate;
        for (let i = 0; i < np.affixBehaviors.length; i++) {
          const b = np.affixBehaviors[i] ?? 'none';
          const c = np.affixColors[i] ?? np.color;
          const k = `${b}|${c}`;
          if (seen.has(k)) continue;
          seen.add(k);
          affixIconUri(b, c);
        }
      }
      this.engine.renderer.gl.compile(this.scene, this.camera);

      // Compiling programs is not enough: every generated PBR texture is
      // uploaded to the GPU lazily, on the first frame the material is actually
      // drawn. A dozen monsters coming into view at once therefore uploads
      // dozens of 1024px maps in a single frame, which profiling measured as a
      // 3.3 second render spike. Force the uploads now instead.
      const gl = this.engine.renderer.gl;
      const uploaded = new Set<THREE.Texture>();
      const MAPS = [
        'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
        'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'envMap',
      ] as const;
      this.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (!mat) return;
        const list = Array.isArray(mat) ? mat : [mat];
        for (const m of list) {
          const rec = m as unknown as Record<string, unknown>;
          for (const key of MAPS) {
            const tex = rec[key];
            if (tex instanceof THREE.Texture && !uploaded.has(tex)) {
              uploaded.add(tex);
              gl.initTexture(tex);
            }
          }
        }
      });
    } catch {
      // Warm-up is an optimisation; never let it block the run starting.
    }

    events.emit('depth:changed', {
      depth: this.run.depth,
      level: index + 1,
      of: this.run.levels.length,
    });
  }

  /** The world view handed to enemy AI each frame. */
  /**
   * Everything a passive does when the player is hit.
   *
   * Thorns, Riposte's counterattack, Retribution's charge and the two cheat
   * deaths all trigger from the same moment, and all of them need the attacker
   * and the scene. `Player.takeDamage` has neither, so it stays a pure
   * mitigation function and this runs beside it.
   */
  private passiveDefence(packet: DamagePacket, taken: number, lifeBefore: number): void {
    const e = this.player.passives;
    const st = this.player.passiveState;
    const ctx = this.ctxCache ?? this.context();

    // The thing that hit us, if it is still standing.
    const attacker =
      this.enemies.find((x) => x.id === packet.source && x.life > 0) ??
      (this.boss && this.boss.id === packet.source && this.boss.life > 0 ? this.boss : null);

    const blocked = taken === 0 && lifeBefore === this.player.life;
    const reach = 2.6;

    if (attacker) {
      const melee = !packet.ability || packet.ability === 'melee';
      let back = 0;
      if (blocked && e.thornsBlockPct > 0) back += lifeBefore * 0 + packet.amount * (e.thornsBlockPct / 100);
      if (!blocked && melee && e.thornsMeleePct > 0) back += taken * (e.thornsMeleePct / 100);
      if (back > 0) {
        attacker.takeDamage(
          { amount: back, type: 'physical', crit: false, source: 'player', ability: 'Thorns' },
          ctx,
        );
        this.effects.impact('physical', attacker.root.position.x, 1.0, attacker.root.position.z, {
          scale: 0.5, shake: 0, decal: false,
        });
      }
      // Riposte: a blocked attack is an opening.
      if (blocked && e.blockCounterChance > 0 && this.rng.chance(Math.min(0.9, e.blockCounterChance / 100))) {
        const gap = this.tmpDir.subVectors(attacker.root.position, this.player.position).setY(0).length();
        if (gap <= reach + attacker.hitRadius) {
          this.skills.counterAttack(this.player, attacker, ctx, e.blockCounterPct / 100);
        }
      }
    }

    // Retribution builds a charge on every block and spends it on the next hit.
    if (blocked && e.retributionPctPerBlock > 0) {
      st.retribution = Math.min(300, st.retribution + e.retributionPctPerBlock);
    }

    // Cheat death, once the cooldown is spent.
    if (this.player.life <= 0 && e.cheatDeathCooldown > 0 && st.cheatDeathCd <= 0) {
      st.cheatDeathCd = e.cheatDeathCooldown;
      this.player.life = Math.max(1, this.player.stats.life * (e.cheatDeathHealPct / 100));
      if (e.cheatDeathInvuln > 0) this.player.grantInvulnerability(e.cheatDeathInvuln);
      const p = this.player.position;
      this.effects.nova(p.x, p.z, Math.max(4, e.cheatDeathRadius), {
        element: e.cheatDeathNovaPct > 0 ? 'fire' : 'physical',
        color: e.cheatDeathNovaPct > 0 ? 0xff7a2a : 0xffe9b0,
      });
      if (e.cheatDeathNovaPct > 0) {
        this.skills.passiveNova(this.player, p, e.cheatDeathRadius, e.cheatDeathNovaPct / 100, 'fire', ctx, this.enemies, this.boss);
      } else {
        for (const en of this.enemies) {
          if (en.life <= 0) continue;
          if (en.root.position.distanceTo(p) > e.cheatDeathRadius) continue;
          en.applyStatuses([{ id: 'stunned', duration: 3, magnitude: 1 }], ctx);
        }
      }
      toast('You should have died there.', 'epic');
      audio.play('levelup');
    }
  }

  /**
   * Everything a passive does when something dies.
   *
   * Combustion detonates a burning corpse, Executioner refunds mana on a
   * finishing blow, and Reap Soul heals. All three read the same moment.
   */
  /**
   * The passives that read how you are moving.
   *
   * Tailwind and Airborne pay you for running; Thunder Run leaves a burning
   * strip behind a dash. All three need distance travelled per frame, which
   * only the scene knows, so they tick here rather than in the engine.
   */
  private passiveMovement(dt: number, ctx: CombatContext): void {
    const e = this.player.passives;
    const st = this.player.passiveState;
    const p = this.player.position;
    const moved = this.lastPos.distanceTo(p);
    this.lastPos.copy(p);

    if (e.momentumMovePct > 0 || e.momentumDamageShare > 0) {
      // Metres banked in a short rolling window, not a raw speed reading: the
      // skills are written as "distance travelled recently".
      st.moving = moved > 0.01 ? Math.min(e.momentumMoveCap || 30, st.moving + moved) : Math.max(0, st.moving - dt * 8);
    }

    if (e.trailDamagePct > 0 && e.trailRadius > 0 && moved > 0.02) {
      this.trailTimer -= dt;
      if (this.trailTimer <= 0) {
        this.trailTimer = 0.25;
        this.skills.passiveNova(
          this.player, p.clone(), e.trailRadius, e.trailDamagePct / 100 * 0.25,
          'lightning', ctx, this.enemies, this.boss,
        );
        this.decals.add('scorch', p.x, p.z, e.trailRadius * 0.8);
      }
    }
  }

  private lastPos = new THREE.Vector3();
  private trailTimer = 0;
  private auraTimer = 0;

  /**
   * The passives that tick rather than trigger.
   *
   * Souls expiring, Wither eating cursed enemies alive, Attrition's standing
   * debuff aura, and Gloom Shroud's regeneration while unseen. Ticked at 4Hz;
   * none of them need a per-frame answer and the aura walks the enemy list.
   */
  private passiveTick(dt: number, ctx: CombatContext): void {
    const e = this.player.passives;
    const st = this.player.passiveState;

    if (st.souls > 0) {
      st.soulTimer -= dt;
      if (st.soulTimer <= 0) {
        st.souls = 0;
        st.soulTimer = 0;
      }
    }
    if (e.stealthRegenPct > 0 && this.player.status.has('veiled')) {
      this.player.life = Math.min(
        this.player.stats.life,
        this.player.life + this.player.stats.life * (e.stealthRegenPct / 100) * dt,
      );
    }
    // Flurry decays when you stop connecting.
    if (e.hitStackAttackSpeed > 0 && st.hitStacks > 0) {
      this.flurryIdle += dt;
      if (this.flurryIdle > 2) {
        st.hitStacks = 0;
        this.flurryIdle = 0;
      }
    }

    this.auraTimer -= dt;
    if (this.auraTimer > 0) return;
    this.auraTimer = 0.25;

    if (e.curseDecayPctPerSec > 0 || e.auraDebuffRadius > 0) {
      for (const en of this.enemies) {
        if (en.life <= 0) continue;
        // Wither: a curse that eats through maximum life rather than ticking a
        // flat number, so it scales with whatever you are fighting.
        if (e.curseDecayPctPerSec > 0 && en.isDebuffed) {
          en.takeDamage(
            {
              amount: en.maxLife * (e.curseDecayPctPerSec / 100) * 0.25,
              type: 'poison',
              crit: false,
              source: 'player',
              ability: 'Wither',
            },
            ctx,
          );
        }
        // Attrition: everything near you is worse at its job.
        if (
          e.auraDebuffRadius > 0 &&
          en.root.position.distanceTo(this.player.position) <= e.auraDebuffRadius
        ) {
          en.applyStatuses(
            [{ id: 'weakened', duration: 1, magnitude: Math.max(0.2, e.auraResistShred / 20) }],
            ctx,
          );
          if (e.auraSlowPct > 0) {
            en.applyStatuses([{ id: 'slowed', duration: 1, magnitude: e.auraSlowPct / 100 }], ctx);
          }
        }
      }
    }
  }

  private flurryIdle = 0;

  private passiveOnKill(pos: THREE.Vector3, overkill = 0): void {
    const e = this.player.passives;
    // Cataclysm: whatever the killing blow spilled past zero carries onward.
    if (e.overkillCarryPct > 0 && e.overkillRadius > 0 && overkill > 0) {
      const ctx = this.ctxCache ?? this.context();
      let carried = overkill * (e.overkillCarryPct / 100);
      let chains = Math.max(1, Math.floor(e.overkillChains));
      const struck = new Set<string>();
      while (chains > 0 && carried > 1) {
        let best: Enemy | null = null;
        let bestD = Infinity;
        for (const en of this.enemies) {
          if (en.life <= 0 || struck.has(en.id)) continue;
          const d = en.root.position.distanceTo(pos);
          if (d < bestD && d <= e.overkillRadius) {
            bestD = d;
            best = en;
          }
        }
        if (!best) break;
        struck.add(best.id);
        best.takeDamage(
          { amount: carried, type: 'fire', crit: false, source: 'player', ability: 'Cataclysm' },
          ctx,
        );
        this.effects.impact('fire', best.root.position.x, 1.0, best.root.position.z, { scale: 0.8, shake: 0 });
        carried *= e.overkillCarryPct / 100;
        chains--;
      }
    }
    if (e.killExplodePct > 0 && e.killExplodeRadius > 0) {
      const ctx = this.ctxCache ?? this.context();
      this.effects.explosion(pos.x, 0.8, pos.z, {
        radius: e.killExplodeRadius,
        element: 'fire',
        color: 0xff7a2a,
      });
      this.skills.passiveNova(
        this.player, pos, e.killExplodeRadius, e.killExplodePct / 100, 'fire', ctx, this.enemies, this.boss,
      );
    }
    if (e.executeManaRefund > 0) {
      this.player.mana = Math.min(
        this.player.stats.mana,
        this.player.mana + this.player.stats.mana * (e.executeManaRefund / 100) * 0.1,
      );
    }
    if (e.killLifePct > 0) {
      this.player.life = Math.min(
        this.player.stats.life,
        this.player.life + this.player.stats.life * (e.killLifePct / 100),
      );
    }
    if (e.killManaPct > 0) {
      this.player.mana = Math.min(
        this.player.stats.mana,
        this.player.mana + this.player.stats.mana * (e.killManaPct / 100),
      );
    }
    // Reap Soul banks a soul per kill nearby; Harvest Mastery raises the
    // ceiling and how long they keep.
    const st = this.player.passiveState;
    if (e.soulMaxStacks > 0 && this.player.position.distanceTo(pos) <= 12) {
      st.souls = Math.min(e.soulMaxStacks, st.souls + 1);
      st.soulTimer = e.soulDurationSec;
    }
    // Contagion: a cursed corpse throws its curses at the pack.
    if (e.curseSpreadRadius > 0) {
      const ctx = this.ctxCache ?? this.context();
      for (const en of this.enemies) {
        if (en.life <= 0) continue;
        if (en.root.position.distanceTo(pos) > e.curseSpreadRadius) continue;
        en.applyStatuses([{ id: 'weakened', duration: 8, magnitude: 1, stacks: 1 }], ctx);
      }
    }
  }

  /** Reused inside the damage callback so it never rebuilds the context. */
  private ctxCache: CombatContext | null = null;
  /** Overkill from the corpse currently being reaped. */
  private lastOverkill = 0;

  private context(): CombatContext {
    return {
      playerPos: this.player.position,
      playerStats: this.player.stats,
      playerLevel: this.player.character.level,
      damagePlayer: (packet: DamagePacket) => {
        if (this.godMode) return;
        const before = this.player.life;
        const taken = this.player.takeDamage(packet, this.rng);
        this.passiveDefence(packet, taken, before);
        if (taken > 0 && save.settings.showDamageNumbers) {
          // Player damage in the packet's own colour, so a big fire hit is
          // readable as fire without reading the number.
          this.fx.damageNumber(
            String(Math.max(1, Math.round(taken))),
            this.player.position.x,
            1.9,
            this.player.position.z,
            typeColor(packet.type),
            false,
          );
        }
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
      blockers: this.mesh?.colliders,
      playerHidden: this.player.statuses.some((s) => s.id === 'veiled'),
      auraRadiusBonus: this.player.passives.auraRadiusM,
    };
  }

  override update(dt: number, elapsed: number): void {
    if (!this.player || this.transitioning) return;
    this.runTime += dt;

    const input = this.engine.input;
    input.updateWorldPoint(this.camera, 0);

    const ctx = this.context();
    this.ctxCache = ctx;

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

    // Only monsters near the player think. Aggro persists for the whole floor,
    // so without a leash every monster the player has ever disturbed keeps
    // pathing forever and the cost grows the further you explore — which is
    // exactly the "it gets worse as I go" the profiler could not see in a
    // stationary test.
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const LEASH = 38;
    const LEASH2 = LEASH * LEASH;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i]!;
      const dx = e.root.position.x - px;
      const dz = e.root.position.z - pz;
      // Far away: leave it in the world and visible (frustum culling already
      // handles the draw cost), just stop simulating it.
      if (dx * dx + dz * dz > LEASH2) continue;
      e.update(dt, ctx);
    }

    this.boss?.update(dt, ctx);

    this.reapDead(ctx);
    this.updateLoot(dt, elapsed, input);
    this.checkExit();

    onSurviveTick(this.run.quest, dt);

    // Potion regeneration.
    for (let i = this.potionTicks.length - 1; i >= 0; i--) {
      const t = this.potionTicks[i]!;
      const step = Math.min(dt, t.left);
      if (t.life > 0) this.player.heal(t.life * step);
      if (t.mana > 0) this.player.restoreMana(t.mana * step);
      t.left -= step;
      if (t.left <= 0) this.potionTicks.splice(i, 1);
    }

    if (this.heroLight) {
      // High above, so it reads as light falling on the player rather than
      // light coming out of them.
      this.heroLight.position.set(this.player.position.x, 4.0, this.player.position.z);
      // Breathe very slightly so it reads as carried flame, not a fixed lamp.
      this.heroLight.intensity = 30 + Math.sin(elapsed * 3.1) * 2.2;
    }
    if (this.heroAura) {
      this.heroAura.position.set(this.player.position.x, 0.06, this.player.position.z);
      const m = this.heroAura.material as THREE.MeshBasicMaterial;
      m.opacity = 0.32 + Math.sin(elapsed * 3.1) * 0.035;
    }

    if (this.groundLabels) {
      const shift = this.engine.input.keyDown('ShiftLeft') || this.engine.input.keyDown('ShiftRight');
      this.labelScratch.length = 0;
      for (const l of this.loot) {
        if (l.item) this.labelScratch.push(l as { item: Item; root: THREE.Object3D; pos: THREE.Vector3 });
      }
      this.groundLabels.update(
        this.camera,
        this.labelScratch,
        this.player.position,
        window.innerWidth,
        window.innerHeight,
        shift
      );
    }

    if (this.plates) {
      const targets = this.boss ? [...this.enemies, this.boss] : this.enemies;
      this.plates.update(
        this.camera,
        targets,
        this.player.position,
        window.innerWidth,
        window.innerHeight
      );
    }

    if (this.returnPortal) {
      this.returnPortal.rotation.y += dt * 0.55;
      this.returnPortal.position.y = Math.sin(elapsed * 1.7) * 0.07;
    }

    this.skills.update(dt);
    this.skills.tickOffHand(dt, this.player);
    this.effects.update(dt, elapsed);
    this.mesh.update(dt, elapsed, this.player.position);
    this.passiveMovement(dt, ctx);
    this.passiveTick(dt, ctx);
    this.rig.follow(this.player.root);
    this.rig.setCursor(input.worldPoint);
    this.rig.update(dt, elapsed);
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
      this.keyDir.applyAxisAngle(DungeonScene.UP, this.rig.yaw);
    }

    if (input.pointerOverUI) return;

    // Left click is movement, full stop — except over a loot label, which owns
    // the left button so clicking an item picks it up instead of walking past.
    if (input.mouseLeft && !input.pointerOverClickable && this.keyDir.lengthSq() === 0) {
      // Keyboard wins; a move order issued while a key is held leaves a stale
      // destination the player resumes running to after releasing the key.
      this.player.moveTo(input.worldPoint.x, input.worldPoint.z);
    }

    // Right click is the attack button. It runs whatever the player assigned,
    // falling back to the free basic attack.
    if (input.mouseRight) {
      const aimed = this.enemyUnderCursor(input.worldPoint);
      // Aim at the target itself rather than the ground under the cursor, so
      // melee arcs and projectiles both converge on what is being clicked.
      const target = aimed ? this.aimPoint.copy(aimed.root.position).setY(0) : input.worldPoint;

      // Close the distance before swinging.
      //
      // A melee swing reaches about two and a half metres. Clicking a monster
      // further away than that used to play the whole attack against thin air,
      // and because starting an action clears the move order the character then
      // stood still doing it again forever. From the player's side the attack
      // button simply did no damage, which is exactly how it was reported.
      //
      // Only when there is actually a monster under the cursor: clicking bare
      // ground still swings on the spot rather than turning the attack button
      // into a second movement key.
      if (aimed) {
        const style = weaponStyle(this.player);
        if (style === 'melee' || style === 'unarmed') {
          const gap = this.tmpDir.subVectors(target, this.player.position).setY(0).length() - aimed.hitRadius;
          if (gap > DungeonScene.MELEE_REACH) {
            this.player.moveTo(target.x, target.z);
            return;
          }
        }
      }

      const assigned = this.player.character.primaryAttack;
      let acted = false;
      if (assigned) {
        acted = this.skills.cast(assigned, this.player, target, ctx, this.enemies, this.boss);
      }
      // Fall back whenever the assigned skill did not fire, not only when
      // nothing is assigned. Out of mana used to mean the attack button simply
      // did nothing, which reads as the game being broken rather than as you
      // being out of mana.
      if (!acted) {
        this.skills.basicAttack(this.player, target, ctx, this.enemies, this.boss);
      }
      // Swinging at a barrel should break it. Nobody presses a use key on a
      // crate that is in their way.
      this.breakNear(target.x, target.z);
    }

    // Number keys 1-6 fire the matching hotbar slot.
    for (let i = 0; i < 6; i++) {
      if (!input.keyPressed(`Digit${i + 1}`)) continue;
      const id = this.player.character.hotbar[i];
      if (!id) continue;
      const aimed = this.enemyUnderCursor(input.worldPoint);
      const target = aimed ? this.aimPoint.copy(aimed.root.position).setY(0) : input.worldPoint;
      this.skills.cast(id, this.player, target, ctx, this.enemies, this.boss);
    }

    this.tickInteractables(input, ctx);

    if (input.wasPressed('potionLife')) this.drink('life');
    if (input.wasPressed('potionMana')) this.drink('mana');

    if (input.wasPressed('dodge')) {
      const d = this.tmpDir.subVectors(input.worldPoint, this.player.position);
      if (this.keyDir.lengthSq() > 0) d.copy(this.keyDir);
      if (this.player.dodge(d.x, d.z)) this.rig.addTrauma(0.08);
    }
  }

  /**
   * The enemy the cursor is over, if any. Uses a generous radius around the
   * ground point rather than exact mesh picking: at this camera angle a monster
   * stands *above* the tile the cursor projects onto, so strict picking makes
   * players feel like they are missing clicks.
   */
  private enemyUnderCursor(groundPoint: THREE.Vector3): Enemy | Boss | null {
    // Runs every frame the attack button is held: no closures, no allocation.
    let best: Enemy | Boss | null = null;
    let bestD = Infinity;
    const gx = groundPoint.x;
    const gz = groundPoint.z;

    for (let i = 0; i < this.enemies.length; i++) {
      const t = this.enemies[i]!;
      if (t.life <= 0) continue;
      const dx = t.root.position.x - gx;
      const dz = t.root.position.z - gz;
      const d2 = dx * dx + dz * dz;
      const grab = t.hitRadius + 1.1;
      if (d2 < grab * grab && d2 < bestD) {
        bestD = d2;
        best = t;
      }
    }
    const b = this.boss;
    if (b && b.life > 0) {
      const dx = b.root.position.x - gx;
      const dz = b.root.position.z - gz;
      const d2 = dx * dx + dz * dz;
      const grab = b.hitRadius + 1.4;
      if (d2 < grab * grab && d2 < bestD) best = b;
    }
    return best;
  }

  /** Handles kills: XP, loot, quest progress, FX. */
  /**
   * Quick-drink. Applies the instant portion immediately and spreads the rest
   * over the potion's own duration, which is what makes a healing flask feel
   * different from a full rejuvenation.
   */
  private drink(kind: 'life' | 'mana', baseId?: string): void {
    if (!this.player || !this.player.alive) return;
    const c = this.player.character;
    const st = this.player.stats;
    const res = baseId
      ? drinkPotion(c, baseId, st.life, st.mana)
      : quickDrink(
          c,
          kind,
          kind === 'life' ? this.player.life : this.player.mana,
          kind === 'life' ? st.life : st.mana,
          st.life,
          st.mana,
        );
    if (!res.ok) {
      if (res.reason) toast(res.reason, 'bad');
      return;
    }

    const instant = res.over > 0 ? 0.35 : 1;
    if (res.life > 0) this.player.heal(res.life * instant);
    if (res.mana > 0) this.player.restoreMana(res.mana * instant);
    if (res.over > 0) {
      this.potionTicks.push({
        life: (res.life * (1 - instant)) / res.over,
        mana: (res.mana * (1 - instant)) / res.over,
        left: res.over,
      });
    }
    for (const id of res.cleanse) this.player.status.remove(id);
    if (res.buff) this.player.applyStatus('potion.tonic', res.buff.duration, 1, 1);

    this.fx.burst(kind === 'life' ? 'heal' : 'mana', this.player.position.x, 1.1, this.player.position.z, {
      count: 18,
    });
    audio.play('potion');
    save.touch();
    events.emit('ui:refresh', {});
  }

  private reapDead(ctx: CombatContext): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]!;
      // Pay out the moment the body starts to fall, separately from removing
      // it. The corpse can take its time sinking; the loot should not.
      if (!e.lootGranted && e.readyToLoot) {
        e.lootGranted = true;
        this.lastOverkill = e.overkill;
        this.grantKill(e.monsterId, e.rank, e.family, e.root.position, e.ilvl);
      }
      if (e.life > 0 || !e.readyToRemove) continue;
      this.enemies.splice(i, 1);
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
      this.openReturnPortal(b.root.position);
      b.root.removeFromParent();
      b.dispose();
    }
  }

  private grantKill(
    monsterId: string,
    rank: MonsterRank,
    family: MonsterFamily,
    pos: THREE.Vector3,
    ilvl: number
  ): void {
    events.emit('enemy:killed', { id: monsterId, monsterId, rank, x: pos.x, z: pos.z });
    onKill(this.run.quest, monsterId, family, rank);
    this.passiveOnKill(pos, this.lastOverkill);
    this.lastOverkill = 0;

    const c = this.player.character;
    const dif = activeDifficulty();
    const xpMul = rank === 'boss' ? 22 : rank === 'rare' ? 5 : rank === 'elite' ? 3.2 : rank === 'champion' ? 1.9 : 1;
    const xp = Math.round((8 + this.run.depth * 6) * xpMul * dif.xp);
    if (grantXp(c, xp)) {
      this.player.refreshStats();
      // Levelling up is a full heal, as the genre expects.
      this.player.life = this.player.stats.life;
      this.player.mana = this.player.stats.mana;
      this.fx.burst('levelup', pos.x, 1, pos.z, { count: 90 });
      audio.play('levelup');
    }
    // `grantXp` already announces the new total. Re-emitting here with a made-up
    // `toNext` of zero is what pinned the XP bar to full after the first few
    // kills — the HUD believed the second, wrong event.

    const drops = rollDrops(
      ilvl,
      rank,
      this.rng,
      this.player.stats.magicFind * dif.magicFind + (dif.magicFind - 1) * 100,
      this.player.stats.goldFind * dif.goldFind
    );
    for (const item of drops.items) this.dropItem(item, pos);
    // Harder tiers guarantee extra drops from anything above a normal monster.
    if (dif.bonusDrops > 0 && rank !== 'normal') {
      for (let i = 0; i < dif.bonusDrops; i++) {
        const extra = rollDrops(ilvl, rank, this.rng, this.player.stats.magicFind * dif.magicFind, 0);
        for (const item of extra.items.slice(0, 1)) this.dropItem(item, pos);
      }
    }
    if (drops.gold > 0) {
      this.dropGold(Math.round(drops.gold * dif.goldFind), pos);
    }
    for (const [id, n] of Object.entries(drops.materials)) save.addMaterial(id, n);
  }

  /**
   * Walk-up-and-use, for everything the level put in your path.
   *
   * Chests, shrines, barrels, crates and urns were all authored with an
   * `interact` payload, placed by the generator and drawn by the builder, and
   * nothing anywhere read the payload. The whole layer was scenery you walked
   * past. This is the half that was missing.
   */
  private tickInteractables(input: Engine['input'], ctx: CombatContext): void {
    const near = this.mesh.nearestInteractable(
      this.player.position.x,
      this.player.position.z,
      DungeonScene.INTERACT_RANGE,
    );
    if (near !== this.nearProp) {
      this.nearProp = near;
      toast(near ? `[E] ${this.promptFor(near)}` : '', 'info');
    }
    if (!near || !input.wasPressed('interact')) return;

    // The payload is `family.tier` — `chest.vault`, `lever.vault`, `quest.altar`
    // — or a bare family for anything scattered. Dispatch on the family.
    const family = near.kind.split('.')[0]!;
    const tier = near.kind.split('.')[1] ?? '';

    if (family === 'lever') {
      this.pullLever(near);
      return;
    }
    if (family === 'chest' && tier === 'vault' && !this.vaultOpen) {
      toast('The vault is barred. There is a lever somewhere in this room.', 'bad');
      audio.play('ui.error');
      return;
    }

    this.mesh.removeInteractable(near);
    this.nav.setBlocked(near.tileX, near.tileY, false);
    this.nearProp = null;
    toast('', 'info');

    if (family === 'shrine') this.useShrine(near);
    else if (family === 'chest') this.openChest(near, tier);
    else if (family === 'quest' || family === 'altar') this.useAltar(near);
    else if (family === 'bookcase') this.search(near);
    else this.smash(near);
  }

  /**
   * Breaks any loose container caught in a swing.
   *
   * Only the smashables: a chest, a shrine, a lever and a quest altar all need
   * a deliberate use, and popping them by swinging near them would be a way to
   * lose a vault by accident.
   */
  private breakNear(x: number, z: number, range = 2.2): void {
    const it = this.mesh.nearestInteractable(x, z, range);
    if (!it) return;
    const family = it.kind.split('.')[0]!;
    if (family !== 'barrel' && family !== 'crate' && family !== 'urn') return;
    this.mesh.removeInteractable(it);
    this.nav.setBlocked(it.tileX, it.tileY, false);
    if (this.nearProp === it) this.nearProp = null;
    this.smash(it);
  }

  /** What the on-screen prompt says, for a `family.tier` payload. */
  private promptFor(it: Interactable): string {
    const family = it.kind.split('.')[0]!;
    if (family === 'chest' && it.kind.split('.')[1] === 'vault' && !this.vaultOpen) return 'Barred vault';
    return INTERACT_LABEL[family] ?? INTERACT_LABEL[it.propKind] ?? 'Search';
  }

  /**
   * The vault lever. Vault rooms place a barred chest and a wall lever, and the
   * lever was drawn with an `interact` payload nothing ever read, so the vault
   * could never be opened at all.
   */
  private pullLever(it: Interactable): void {
    this.mesh.removeInteractable(it);
    this.nav.setBlocked(it.tileX, it.tileY, false);
    this.nearProp = null;
    this.vaultOpen = true;
    this.effects.teleportIn(it.x, 0.8, it.z, 0xffd66b);
    audio.play('ui.open');
    toast('Something heavy moves. The vault is open.', 'good');
  }

  /** The quest altar in a quest room. Counts toward `interact` objectives. */
  private useAltar(it: Interactable): void {
    this.effects.summonCircle(it.x, it.z, 2.0, 1.2, 0x9fd8ff);
    this.fx.burst('levelup', it.x, 1.0, it.z, { count: 26 });
    audio.play('ui.open');
    toast('The altar goes quiet.', 'good');
    onInteract(this.run.quest, 'altar');
  }

  /** Shelves pay small and quiet: coins, and occasionally something written. */
  private search(it: Interactable): void {
    const at = this.tmpDir.set(it.x, 0, it.z).clone();
    const ilvl = Math.max(1, this.run.depth + this.levelIndex);
    this.dropGold(Math.round(this.rng.range(6, 20) * (1 + ilvl * 0.35)), at);
    if (this.rng.chance(0.12)) {
      const item = rollItem(ilvl, this.rng, { magicFind: this.player.stats.magicFind });
      if (item) this.dropItem(item, at);
    }
    this.fx.burst('dust', it.x, 1.0, it.z, { count: 14, scale: 0.7 });
    audio.play('ui.open');
    onInteract(this.run.quest, 'bookcase');
  }

  /**
   * A shrine grants the blessing matching its own flavour, then is spent.
   *
   * Twelve blessing statuses were written with full modifiers — might,
   * fortitude, sanctified, treasure sense — and nothing in the game could grant
   * a single one, because nothing ever built a shrine you could touch.
   */
  private useShrine(it: { x: number; y: number; z: number; kind: string }): void {
    const type = it.kind.split('.')[1] ?? '';
    const blessing = this.rng.pick(SHRINE_BLESSINGS[type] ?? ANY_BLESSING);
    const def = getStatus(blessing.id);
    this.player.applyStatus(blessing.id, blessing.duration, 1, 1);
    this.effects.summonCircle(it.x, it.z, 2.2, 1.4, def?.color ?? 0xffd66b);
    this.effects.teleportIn(it.x, 0.6, it.z, def?.color ?? 0xffd66b);
    this.fx.burst('levelup', it.x, 1.0, it.z, { count: 40 });
    audio.play('levelup');
    toast(`${def?.name ?? 'Blessing'} — ${blessing.blurb}`, 'good');
    onInteract(this.run.quest, 'shrine');
  }

  /**
   * A chest pays out like a kill of the matching rank, plus a gold bonus. The
   * generator writes three tiers into the payload: scattered chests are normal,
   * treasure rooms hold a rare, and the barred vault chest is the best on the
   * floor.
   */
  private openChest(it: { x: number; y: number; z: number }, tier: string): void {
    const at = this.tmpDir.set(it.x, 0, it.z).clone();
    const ilvl = Math.max(1, this.run.depth + this.levelIndex);
    const rank: MonsterRank = tier === 'vault' ? 'boss' : tier === 'rare' ? 'rare' : 'champion';
    const goldBonus = tier === 'vault' ? 3.0 : tier === 'rare' ? 1.6 : 1.1;
    const drops = rollDrops(
      ilvl,
      rank,
      this.rng,
      this.player.stats.magicFind * activeDifficulty().magicFind,
      this.player.stats.goldFind * activeDifficulty().goldFind,
    );
    for (const item of drops.items) this.dropItem(item, at);
    if (drops.gold > 0) this.dropGold(Math.round(drops.gold * goldBonus), at);
    this.effects.explosion(it.x, 0.7, it.z, { radius: 1.2, element: 'physical', color: 0xffd66b });
    audio.play('ui.open');
    onInteract(this.run.quest, 'chest');
  }

  /**
   * A breakable pays out small: a handful of coins, sometimes a potion, and
   * only rarely anything worth keeping. It is there to be smashed on the way
   * past, not to be farmed.
   */
  private smash(it: { x: number; y: number; z: number; propKind: string }): void {
    const at = this.tmpDir.set(it.x, 0, it.z).clone();
    const ilvl = Math.max(1, this.run.depth + this.levelIndex);

    this.dropGold(Math.round(this.rng.range(4, 14) * (1 + ilvl * 0.35)), at);
    if (this.rng.chance(0.22)) {
      const potion = rollPotion(ilvl, 'normal', this.rng);
      if (potion) this.dropItem(potion, at);
    }
    if (this.rng.chance(0.06)) {
      const item = rollItem(ilvl, this.rng, { magicFind: this.player.stats.magicFind });
      if (item) this.dropItem(item, at);
    }

    // Debris in the prop's own colour family, and a bang.
    this.fx.burst(it.propKind === 'urn' ? 'dust' : 'gib', it.x, 0.6, it.z, { count: 22, scale: 0.8 });
    this.decals.add('dust', it.x, it.z, 0.7);
    this.effects.impact('physical', it.x, 0.6, it.z, { scale: 0.8, decal: false });
    audio.play('hit.physical');
    onInteract(this.run.quest, it.propKind);
  }

  private dropItem(item: Item, at: THREE.Vector3): void {
    const model = buildDropModel(item, this.rng);
    // Scatter so a big drop doesn't stack into one unreadable pile.
    const a = this.rng.range(0, Math.PI * 2);
    const d = this.rng.range(0.3, 1.5);
    const pos = new THREE.Vector3(at.x + Math.cos(a) * d, 0, at.z + Math.sin(a) * d);
    model.position.copy(pos);
    this.scene.add(model);
    this.loot.push({ item, gold: 0, root: model, pos, bornAt: this.runTime });
    events.emit('loot:dropped', { item, x: pos.x, z: pos.z });
  }

  /** Scatters a gold pile that the player collects by walking over it. */
  private dropGold(amount: number, at: THREE.Vector3): void {
    if (amount <= 0) return;
    const rng = this.rng;
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0.2, 1.1);
    const pos = new THREE.Vector3(at.x + Math.cos(a) * d, 0, at.z + Math.sin(a) * d);

    const group = new THREE.Group();
    const coins = Math.min(7, 2 + Math.floor(Math.log10(Math.max(10, amount))));
    for (let i = 0; i < coins; i++) {
      const c = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 0.022, 10),
        emissiveMaterial(0xffc63a, 0.5)
      );
      c.position.set(rng.range(-0.16, 0.16), 0.012 + i * 0.016, rng.range(-0.16, 0.16));
      c.rotation.set(rng.range(-0.2, 0.2), rng.range(0, 3), rng.range(-0.2, 0.2));
      group.add(c);
    }
    group.position.copy(pos);
    this.scene.add(group);
    this.loot.push({ item: null, gold: amount, root: group, pos, bornAt: this.runTime });
  }

  /** Picks up a specific ground item, used by the label click handler. */
  private pickUpByUid(uid: string): boolean {
    const i = this.loot.findIndex((l) => l.item?.uid === uid);
    if (i < 0) return false;
    const l = this.loot[i]!;
    if (l.pos.distanceTo(this.player.position) > 4.5) {
      toast('Too far away.', 'bad');
      return false;
    }
    if (!l.item || !addItemToInventory(this.player.character, l.item)) {
      toast('Your pack is full.', 'bad');
      return false;
    }
    this.loot.splice(i, 1);
    l.root.removeFromParent();
    disposeObject(l.root);
    events.emit('loot:pickedUp', { item: l.item });
    this.fx.burst('pickup', l.pos.x, 0.5, l.pos.z, { count: 14 });
    audio.play('pickup');
    return true;
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
        l.root.position.y = 0.28;
      }
      // Drop models declare their own motion rather than animating themselves.
      l.root.traverse((o) => {
        const d = o.userData as {
          spin?: number;
          bobAmplitude?: number;
          bobSpeed?: number;
          orbit?: { radius: number; phase: number; y: number };
        };
        if (d.spin) o.rotation.y += dt * d.spin;
        if (d.bobAmplitude) o.position.y = Math.sin(elapsed * (d.bobSpeed ?? 1.6) + l.pos.x) * d.bobAmplitude;
        if (d.orbit) {
          const a = elapsed * 0.9 + d.orbit.phase;
          o.position.set(Math.cos(a) * d.orbit.radius, d.orbit.y, Math.sin(a) * d.orbit.radius);
        }
      });

      // Gold is collected by walking over it; items wait to be clicked.
      if (l.gold > 0 && l.pos.distanceTo(this.player.position) < pickupRadius + 0.4) {
        this.player.character.gold += l.gold;
        events.emit('loot:gold', { amount: l.gold });
        this.loot.splice(i, 1);
        l.root.removeFromParent();
        disposeObject(l.root);
        this.fx.burst('pickup', l.pos.x, 0.4, l.pos.z, { count: 10, color: 0xffc63a });
        audio.play('gold');
      }
    }
  }

  private checkExit(): void {
    if (this.transitioning) return;
    if (!this.exitOpen) return;
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
      events.emit('run:cleared', { depth: this.run.depth });
      toast(`Depth ${this.run.depth} cleared.`, 'epic');
      void this.engine.goTo('town');
    }
  }

  /**
   * Spawns the way home a few metres off the boss's corpse — far enough that
   * the player has to step away from the loot pile deliberately, so nobody
   * gets yanked to town mid-pickup.
   */
  private openReturnPortal(near: THREE.Vector3): void {
    const offset = new THREE.Vector3(near.x - this.player.position.x, 0, near.z - this.player.position.z);
    if (offset.lengthSq() < 0.01) offset.set(0, 0, 1);
    offset.normalize().multiplyScalar(4.5);
    const at = new THREE.Vector3(near.x + offset.x, 0, near.z + offset.z);

    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.11, 14, 48),
      emissiveMaterial(0x8fd8ff, 4.2)
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.25;
    group.add(ring);

    const veil = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 40),
      emissiveMaterial(0x4aa8ff, 1.6)
    );
    veil.rotation.x = -Math.PI / 2;
    veil.position.y = 0.06;
    group.add(veil);

    const light = new THREE.PointLight(0x7ec8ff, 14, 16, 2);
    light.position.set(0, 1.4, 0);
    group.add(light);

    group.position.copy(at);
    this.scene.add(group);
    this.returnPortal = group;

    this.exitPos.copy(at);
    this.exitOpen = true;

    this.fx.burst('portal', at.x, 1.0, at.z, { count: 120, color: 0x7ec8ff, scale: 1.6 });
    audio.play('portal');
    toast('The way home has opened.', 'epic');
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
      this.rig.follow(this.player.root);
    this.rig.snap();
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
    this.heroLight?.removeFromParent();
    this.heroLight = null;
    if (this.heroAura) {
      this.heroAura.removeFromParent();
      disposeObject(this.heroAura);
      this.heroAura = null;
    }
    this.plates?.dispose();
    this.plates = null;
    this.groundLabels?.dispose();
    this.groundLabels = null;
    this.skills.dispose();
    this.effects.dispose();
    this.fx.dispose();
    this.decals.dispose();
    this.engine.renderer.setLowLife(0);
    events.emit('ui:close', { panel: 'hud' });
  }
}


/**
 * Soft radial falloff used for the player's ground aura. Generated once and
 * shared; a texture beats a shader here because it is drawn exactly once.
 */
let auraTexture: THREE.Texture | null = null;
function makeAuraTexture(): THREE.Texture {
  if (auraTexture) return auraTexture;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,214,166,0.85)');
  g.addColorStop(0.35, 'rgba(255,196,140,0.35)');
  g.addColorStop(0.7, 'rgba(255,180,120,0.10)');
  g.addColorStop(1, 'rgba(255,170,110,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  auraTexture = new THREE.CanvasTexture(c);
  auraTexture.colorSpace = THREE.SRGBColorSpace;
  return auraTexture;
}
