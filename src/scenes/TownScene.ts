import * as THREE from 'three';
import { GameScene, type Engine } from '../core/Engine';
import type { SceneId } from '../types';
import { events, toast } from '../core/Events';
import { audio } from '../audio/Audio';
import { save } from '../core/Save';
import { Random, randomSeed } from '../core/RNG';
import { FXSystem } from '../fx/Particles';
import { DecalSystem } from '../fx/Decals';
import { CameraRig } from '../fx/CameraRig';
import { Player } from '../entities/Player';
import { buildTown, type TownBuild } from '../world/Town';
import { setActiveDifficulty } from '../data/difficulties';

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

  constructor(engine: Engine) {
    super();
    this.engine = engine;
    // Pulled back from the dungeon framing: the camp is worth looking at.
    this.rig = new CameraRig({ distance: 19.5, pitch: 0.95 });
    this.camera = this.rig.camera;
    this.fx = new FXSystem(this.scene, engine.renderer.quality);
    this.decals = new DecalSystem(this.scene, engine.renderer.quality);
  }

  enter(): void {
    const character = save.account.current;
    if (!character) {
      // Reaching town without a character means a broken flow — recover rather
      // than render an empty world.
      void this.engine.goTo('charSelect');
      return;
    }

    setActiveDifficulty(character.difficulty as never);
    const rng = new Random(0x70b6);
    this.town = buildTown(rng);
    this.scene.add(this.town.root);

    this.engine.renderer.applyEnvironment(this.scene, 0.9);
    // The camp is a night exterior with no ceiling to bounce off, so it lands
    // much lower on the curve than the dungeon does. Open the grade up while
    // we are here and put it back on the way out.
    this.engine.renderer.setExposure(1.5);
    // Cold, damp night air. Denser than the old town fog so the tree line goes
    // soft and the camp reads as a lit clearing rather than an object on a plane.
    this.scene.fog = new THREE.FogExp2(0x131a26, 0.017);
    this.scene.background = new THREE.Color(0x080b12);

    this.player = new Player(character, 12345);
    // Arrive on the south path, facing the fire and the gate beyond it.
    this.player.position.set(0, 0, 8);
    this.scene.add(this.player.root);

    this.heroLight = new THREE.PointLight(0xffdcb0, 12, 16, 2);
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
      { id: 'stash', label: 'Vault — Shared Stash', panel: 'stash', pos: at('stash'), radius: 2.4 },
      { id: 'memorial', label: 'Memorial — The Fallen', panel: 'memorial', pos: at('memorial'), radius: 2.2 },
      { id: 'portal', label: 'The Descent — Enter the Dungeon', panel: 'descend', pos: this.town.portalSpot.clone(), radius: 2.8 },
    ];

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
      toast('Walk to the glowing gate to descend.', 'info');
      setTimeout(() => toast('Press T to spend your skill point first.', 'good'), 3400);
    } else {
      toast(`Welcome back, ${character.name}.`, 'info');
    }
  }

  private descend(): void {
    const character = save.account.current;
    if (!character) return;
    const depth = Math.max(1, character.depthRecord + 1);
    audio.play('portal');
    void this.engine.goTo('dungeon', { depth, seed: randomSeed() });
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
      events.emit('toast', best ? { text: `[E] ${best.label}`, kind: 'info' } : { text: '', kind: 'info' });
    }
    if (best && input.wasPressed('interact')) {
      audio.play('ui.open');
      events.emit('ui:open', { panel: best.panel });
    }

    if (this.heroLight) {
      this.heroLight.position.set(this.player.position.x, 2.3, this.player.position.z);
    }
    // Keep the columns going. Bursting on a timer rather than every frame keeps
    // the particle budget where the combat scenes expect it.
    this.smokeAccum += dt;
    if (this.smokeAccum > 0.55) {
      this.smokeAccum = 0;
      for (const p of this.smokeSpots) this.fx.burst('smoke', p.x, p.y, p.z, { count: 4, scale: 1.6 });
    }

    this.town.update(dt, elapsed);
    this.rig.follow(this.player.root);
    this.rig.setCursor(input.worldPoint);
    this.rig.update(dt, elapsed);
    this.fx.update(dt, elapsed);
    this.decals.update(dt);
    audio.setListener(this.player.position.x, this.player.position.z, this.player.root.rotation.y);
  }

  override dispose(): void {
    // Drop the proximity prompt so it does not follow the player downstairs.
    this.engine.renderer.setExposure(1.0);
    this.nearby = null;
    this.smokeSpots = [];
    events.emit('toast', { text: '', kind: 'info' });
    for (const off of this.offs) off();
    this.offs = [];
    this.heroLight?.removeFromParent();
    this.heroLight = null;
    this.player?.dispose();
    this.town?.dispose();
    this.fx.dispose();
    this.decals.dispose();
    events.emit('ui:close', { panel: 'hud' });
  }
}
