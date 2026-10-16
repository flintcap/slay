import * as THREE from 'three';
import { GameScene, type Engine } from '../core/Engine';
import type { SceneId } from '../types';
import { events, toast } from '../core/Events';
import { audio } from '../audio/Audio';
import { save } from '../core/Save';
import { drawItemIconsNow } from '../art/Icons';
import { afterCurtain } from '../core/Idle';
import { addItemToInventory } from '../sim/Inventory';
import { Random, randomSeed } from '../core/RNG';
import { FXSystem } from '../fx/Particles';
import { DecalSystem } from '../fx/Decals';
import { CameraRig } from '../fx/CameraRig';
import { Player } from '../entities/Player';
import { folkMeshed, heroMeshed } from '../art/npc/Prewarm';
import { buildTown, type TownBuild } from '../world/Town';
import { setFogShape } from '../core/Renderer';
import { setActiveDifficulty } from '../data/difficulties';
import { dialogue, openDialogueFor, stationPrompt, storyTalkSpots } from '../ui/DialoguePanel';
import { npcForStation } from '../data/story/npcs';
import { STATIONS, mountTownStations } from './TownStations';
import { QuestMarkerLayer } from '../fx/QuestMarkers';
import { BOARD, townMarkers, type MarkerSpot, type QuestMarker } from '../sim/QuestMarkers';
import { planDescent } from './DescentPlanner';

/** Interaction points the player can walk up to and press E on. */
interface Interactable {
  id: string;
  label: string;
  panel: string;
  pos: THREE.Vector3;
  radius: number;
}

/**
 * The hub. Vendors, blacksmith, stash, and the gate down. Deliberately safe:
 * no enemies, warm light, and every service within a few seconds' walk so the
 * loop between runs stays tight.
 */
export class TownScene extends GameScene {
  readonly id: SceneId = 'town';
  camera: THREE.PerspectiveCamera;

  private engine: Engine;
  private fx: FXSystem;
  private decals: DecalSystem;
  private rig: CameraRig;
  private town!: TownBuild;
  private player!: Player;
  private interactables: Interactable[] = [];
  private nearby: Interactable | null = null;
  private keyDir = new THREE.Vector3();
  /** Hoisted out of the per-frame path; these ran every single frame. */
  private static readonly UP = new THREE.Vector3(0, 1, 0);
  private tmpDir = new THREE.Vector3();
  private heroLight: THREE.PointLight | null = null;
  private offs: Array<() => void> = [];
  private smokeSpots: THREE.Vector3[] = [];
  private smokeAccum = 0;
  /** The resident whose trade the player last opened; they face the player while near. */
  private engagedNpc: string | null = null;
  /** The "?" and "!" over people's heads (and the bounty board). */
  questMarkers: QuestMarkerLayer | null = null;
  private markerState: Partial<Record<MarkerSpot, QuestMarker>> = {};
  private markerAccum = Infinity;
  private markerAt = new THREE.Vector3();

  constructor(engine: Engine) {
    super();
    this.engine = engine;
    // Pulled back from the dungeon framing: the camp is worth looking at.
    this.rig = new CameraRig({ distance: 19.5, pitch: 0.95 });
    this.camera = this.rig.camera;
    this.fx = new FXSystem(this.scene, engine.renderer.quality);
    this.decals = new DecalSystem(this.scene, engine.renderer.quality);
  }

  async enter(): Promise<void> {
    const character = save.account.current;
    if (!character) {
      // Reaching town without a character means a broken flow — recover rather
      // than render an empty world.
      void this.engine.goTo('charSelect');
      return;
    }

    setActiveDifficulty(character.difficulty as never);
    // The boot worker may still be meshing the townsfolk and this hero: wait
    // for it behind the curtain rather than meshing them all again here.
    await Promise.all([folkMeshed(), heroMeshed(character.classId)]);
    const rng = new Random(0x70b6);
    this.town = buildTown(rng);
    this.scene.add(this.town.root);
    const town = this.town;
    this.decals.setGround((x, z) => town.groundY(x, z));

    this.engine.renderer.applyEnvironment(this.scene, 0.9);
    // The camp is a night exterior with no ceiling to bounce off, so it lands
    // much lower on the curve than the dungeon does. Open the grade up while
    // we are here and put it back on the way out.
    this.engine.renderer.setExposure(1.5);
    // Moonlit night: cool blue in the shadows, firelight gold in the
    // highlights, and a heavier vignette so the lit clearing is the subject.
    this.engine.renderer.setGrade({
      shadowTint: 0x4a5a8a,
      highlightTint: 0xffc080,
      splitTone: 0.5,
      vignette: 0.5,
      vignetteTint: 0x5a6890,
      saturation: 1.04,
      bloomStrength: 0.7,
    });
    // Fog starts past the camp's near edge, so the stations stay crisp and
    // only the tree line and the far palisade go soft.
    setFogShape(18);
    // Cold, damp night air. Denser than the old town fog so the tree line goes
    // soft and the camp reads as a lit clearing rather than an object on a plane.
    this.scene.fog = new THREE.FogExp2(0x131a26, 0.017);
    this.scene.background = new THREE.Color(0x080b12);

    // Building the camp and dressing the hero are each a second or more: the
    // page gets a moment between them, so the loading screen keeps moving.
    await new Promise((r) => setTimeout(r, 0));
    this.player = new Player(character, 12345);
    // Arrive on the south path, facing the fire and the gate beyond it.
    this.player.position.set(0, this.town.groundY(0, 8), 8);
    this.scene.add(this.player.root);

    // Soft and high: at 12 and 2.3 m the hero's pale linen rendered white-hot
    // against the night camp.
    this.heroLight = new THREE.PointLight(0xffdcb0, 9, 16, 2);
    this.scene.add(this.heroLight);

    // Smoke from the cook fire and the forge chimney, and midges over the camp.
    for (const p of this.town.smokeSpots) {
      this.smokeSpots.push(p);
      this.fx.burst('smoke', p.x, p.y, p.z, { count: 6, scale: 1.5 });
    }
    this.fx.setAmbient('embers', new THREE.Box3(
      new THREE.Vector3(-24, 0, -24),
      new THREE.Vector3(24, 10, 24),
    ));

    const spots = this.town.npcSpots;
    const at = (k: string, dx = 0, dz = 1.6) => {
      const v = spots[k] ?? new THREE.Vector3();
      return new THREE.Vector3(v.x + dx, 0, v.z + dz);
    };

    this.interactables = [
      { id: 'vendor', label: 'Merchant — Buy & Sell', panel: 'vendor', pos: at('vendor'), radius: 2.4 },
      { id: 'blacksmith', label: 'Blacksmith — Upgrade & Craft', panel: 'blacksmith', pos: at('blacksmith'), radius: 2.4 },
      { id: 'alchemist', label: 'Apothecary — Potions & Oils', panel: 'alchemist', pos: at('alchemist'), radius: 2.4 },
      { id: 'stash', label: 'Vault — Shared Stash', panel: 'stash', pos: at('stash'), radius: 2.4 },
      { id: 'memorial', label: 'Memorial — The Fallen', panel: 'memorial', pos: at('memorial'), radius: 2.2 },
      { id: 'portal', label: 'The Descent — Enter the Dungeon', panel: 'descend', pos: this.town.portalSpot.clone(), radius: 2.8 },
    ];
    // The people who keep no station: the watch captain, the Listener, Gilder
    // and the surveyor. Talking is handled by the story layer.
    this.interactables.push(...storyTalkSpots(spots));
    // The gambler, the enchanter and the bounty board (Legacy unlocks).
    this.offs.push(mountTownStations(this.scene, this.town.colliders, this.interactables));
    this.questMarkers = new QuestMarkerLayer(this.scene);

    // Equipping has to change the model now, not whenever the stat sheet next
    // happens to be recomputed. `item:equipped` was fired into the void, so new
    // gear appeared on your character minutes later, at whatever unrelated
    // moment something else called refreshStats.
    this.offs.push(
      events.on('item:equipped', () => this.player?.refreshStats()),
      events.on('item:unequipped', () => this.player?.refreshStats()),
      // Taking, finishing or handing in work fires a refresh: ask again now,
      // not on the next tick.
      events.on('ui:refresh', () => {
        this.markerAccum = Infinity;
      }),
      // There is nowhere to put a dropped item in town, so it goes back in the
      // pack rather than vanishing. Better to refuse than to eat it.
      events.on('loot:discard', ({ item }) => {
        const c = save.account.current;
        if (!c) return;
        addItemToInventory(c, item);
        save.touch();
        events.emit('toast', { text: 'Not here — sell it or stash it instead.', kind: 'info' });
        events.emit('ui:refresh', {});
      }),
    );

    this.rig.follow(this.player.root);
    this.rig.snap();
    audio.music('town', 2.0);
    events.emit('ui:open', { panel: 'hud' });
    events.emit('depth:changed', { depth: 0, level: 0, of: 0 });

    this.offs.push(
      events.on('ui:open', (p) => {
        if (p.panel === 'descend') this.descend();
      })
    );

    if (!save.hasUnlock('tutorial.town')) {
      save.unlock('tutorial.town');
      toast('Walk to the glowing portal to open a map.', 'info');
      if (character.skillPoints > 0) setTimeout(() => toast('Press T to spend your skill point first.', 'good'), 3400);
    } else {
      toast(`Welcome back, ${character.name}.`, 'info');
    }
    // The pack's icons. Town is safe ground, so they are drawn in the idle
    // time after the curtain lifts rather than holding the curtain down; by
    // the first run they are cached and the dungeon's curtain skips them.
    const items = [...Object.values(character.equipment), ...character.inventory];
    this.offs.push(
      events.on('scene:change', (p) => {
        if (p.to === 'town') afterCurtain(() => void drawItemIconsNow(items, 1500, 'shaped'));
      })
    );
  }

  private descend(): void {
    const character = save.account.current;
    if (!character) return;
    // Waypoints and pacts, when Legacy has unlocked them (scenes/DescentPlanner).
    planDescent(character, (depth, pacts) => {
      audio.play('portal');
      void this.engine.goTo('dungeon', { depth, seed: randomSeed(), pacts });
    });
  }

  override update(dt: number, elapsed: number): void {
    if (!this.player) return;
    const input = this.engine.input;

    input.updateWorldPoint(this.camera, 0);

    // WASD as an alternative to click-to-move; both feel required in a modern ARPG.
    this.keyDir.set(0, 0, 0);
    if (input.keyDown('KeyW') || input.keyDown('ArrowUp')) this.keyDir.z -= 1;
    if (input.keyDown('KeyS') || input.keyDown('ArrowDown')) this.keyDir.z += 1;
    if (input.keyDown('KeyA') || input.keyDown('ArrowLeft')) this.keyDir.x -= 1;
    if (input.keyDown('KeyD') || input.keyDown('ArrowRight')) this.keyDir.x += 1;
    if (this.keyDir.lengthSq() > 0) {
      // Camera-relative so "up" always means away from the viewer.
      this.keyDir.applyAxisAngle(TownScene.UP, this.rig.yaw);
    }

    // Keyboard wins. Issuing a move order while a key is held leaves a stale
    // destination that the player resumes running to after the key is released.
    const steering = this.keyDir.lengthSq() > 0;
    if (input.mouseLeft && !input.pointerOverUI && !steering) {
      this.player.moveTo(input.worldPoint.x, input.worldPoint.z);
    }

    this.player.update(dt, {
      colliders: this.town.colliders,
      // Inside the palisade, plus the ramp out through the gate.
      walkableAt: (x, z) => Math.hypot(x, z) < 21.4 || (z < -15 && z > -24 && Math.abs(x) < 5.5),
    }, this.keyDir.lengthSq() > 0 ? this.keyDir : null);
    // Stand on the ground. The camp is trodden into hollows and rises; at a
    // flat zero the feet sank into every rise. Eased, as below, so a bump
    // reads as a bump, not a pop.
    {
      const pp = this.player.position;
      pp.y += (this.town.groundY(pp.x, pp.z) - pp.y) * Math.min(1, dt * 16);
    }

    this.attendResidents();

    // Proximity prompt for the nearest service.
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of this.interactables) {
      const d = it.pos.distanceTo(this.player.position);
      if (d < it.radius && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    if (best !== this.nearby) {
      this.nearby = best;
      events.emit('toast', best ? { text: `[E] ${stationPrompt(best.id, best.label)}`, kind: 'info' } : { text: '', kind: 'info' });
    }
    // Whoever [E] would talk to, outlined in gold: in a crowd round the fire
    // the prompt alone does not say which of them it means.
    const npc = best ? (best.id.startsWith('talk:') ? best.id.slice(5) : (npcForStation(best.id)?.id ?? null)) : null;
    this.engine.renderer.setOutline(npc ? this.town.residents.rootOf(npc) : null, 0xffc45a);
    if (best && input.wasPressed('interact')) {
      audio.play('ui.open');
      // The keeper of a station talks first; their trade is the first option.
      if (!openDialogueFor(best.id)) events.emit('ui:open', { panel: best.panel });
      this.engagedNpc = best.id.startsWith('talk:') ? best.id.slice(5) : (npcForStation(best.id)?.id ?? null);
    }

    if (this.heroLight) {
      this.heroLight.position.set(this.player.position.x, 3.4, this.player.position.z);
    }
    // Keep the columns going. Bursting on a timer rather than every frame keeps
    // the particle budget where the combat scenes expect it.
    this.smokeAccum += dt;
    if (this.smokeAccum > 0.55) {
      this.smokeAccum = 0;
      for (const p of this.smokeSpots) this.fx.burst('smoke', p.x, p.y, p.z, { count: 4, scale: 1.6 });
    }

    this.town.update(dt, elapsed);
    this.updateMarkers(dt, elapsed);
    this.rig.follow(this.player.root);
    this.rig.setCursor(input.worldPoint);
    this.rig.update(dt, elapsed);
    this.fx.update(dt, elapsed);
    this.decals.update(dt);
    audio.setListener(this.player.position.x, this.player.position.z, this.player.root.rotation.y);
  }

  /**
   * Who has work, asked several times a second (and at once after any
   * refresh), drawn over the head of whoever it is wherever they stand.
   */
  private updateMarkers(dt: number, elapsed: number): void {
    const layer = this.questMarkers;
    if (!layer) return;
    this.markerAccum += dt;
    if (this.markerAccum >= 0.2) {
      this.markerAccum = 0;
      try {
        this.markerState = townMarkers(save.account, save.account.current);
      } catch {
        this.markerState = {};
      }
    }
    const res = this.town.residents;
    for (const [spot, kind] of Object.entries(this.markerState) as Array<[MarkerSpot, QuestMarker]>) {
      let at: THREE.Vector3 | null = null;
      if (kind && spot === BOARD) {
        const st = STATIONS.find((x) => x.id === 'bounties');
        if (st) at = this.markerAt.set(st.at[0], 2.35, st.at[1]);
      } else if (kind && res.headTop(spot, this.markerAt)) {
        at = this.markerAt;
      }
      layer.set(spot, kind, at, elapsed);
    }
  }

  /**
   * The townsfolk turn to the player: whoever they are talking to faces them
   * and talks; the keeper whose trade is open faces them; heads follow anyone
   * who walks close. Talk points of the residents who wander go with them.
   */
  private attendResidents(): void {
    const res = this.town.residents;
    const d = dialogue();
    const talking = d.isOpen ? d.npc.id : null;
    if (this.engagedNpc) {
      const at = res.where(this.engagedNpc);
      if (!at || at.distanceTo(this.player.position) > 4) this.engagedNpc = null;
    }
    res.attend(this.player.position, talking, this.engagedNpc);
    for (const it of this.interactables) {
      if (!it.id.startsWith('talk:')) continue;
      const id = it.id.slice(5);
      const at = res.where(id);
      if (!at) continue;
      const yaw = res.facing(id);
      it.pos.set(at.x + Math.sin(yaw) * 0.9, 0, at.z + Math.cos(yaw) * 0.9);
    }
  }

  override dispose(): void {
    // Drop the proximity prompt so it does not follow the player downstairs.
    this.engine.renderer.setExposure(1.0);
    this.engine.renderer.setGrade();
    setFogShape();
    this.nearby = null;
    this.smokeSpots = [];
    events.emit('toast', { text: '', kind: 'info' });
    for (const off of this.offs) off();
    this.offs = [];
    this.heroLight?.removeFromParent();
    this.heroLight = null;
    this.player?.dispose();
    this.questMarkers?.dispose();
    this.questMarkers = null;
    this.town?.dispose();
    this.fx.dispose();
    this.decals.dispose();
    // The rig subscribes to the event bus and to window resize; without this
    // every visit left one behind, still answering every shake event.
    this.rig.dispose();
    events.emit('ui:close', { panel: 'hud' });
  }
}
