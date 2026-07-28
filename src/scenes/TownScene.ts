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
  private offs: Array<() => void> = [];

  constructor(engine: Engine) {
    super();
    this.engine = engine;
    this.rig = new CameraRig({ distance: 15.5, pitch: 0.9 });
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

    const rng = new Random(0x70b6);
    this.town = buildTown(rng);
    this.scene.add(this.town.root);

    this.scene.fog = new THREE.FogExp2(0x141019, 0.016);
    this.scene.background = new THREE.Color(0x0b0a12);

    this.player = new Player(character, 12345);
    this.player.position.set(0, 0, 6);
    this.scene.add(this.player.root);

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

    toast(`Welcome back, ${character.name}.`, 'info');
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
      this.keyDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rig.yaw);
    }

    // Keyboard wins. Issuing a move order while a key is held leaves a stale
    // destination that the player resumes running to after the key is released.
    const steering = this.keyDir.lengthSq() > 0;
    if (input.mouseLeft && !input.pointerOverUI && !steering) {
      this.player.moveTo(input.worldPoint.x, input.worldPoint.z);
    }

    this.player.update(dt, {
      colliders: this.town.colliders,
      walkableAt: (x, z) => Math.hypot(x, z) < 34,
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

    this.town.update(dt, elapsed);
    this.rig.follow(this.player.root);
    this.rig.setCursor(input.worldPoint);
    this.rig.update(dt, elapsed);
    this.fx.update(dt, elapsed);
    this.decals.update(dt);
    audio.setListener(this.player.position.x, this.player.position.z, this.player.root.rotation.y);
  }

  override dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.player?.dispose();
    this.town?.dispose();
    this.fx.dispose();
    this.decals.dispose();
    events.emit('ui:close', { panel: 'hud' });
  }
}
