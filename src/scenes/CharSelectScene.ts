import * as THREE from 'three';
import { GameScene, type Engine } from '../core/Engine';
import type { CharClassId, SceneId } from '../types';
import { events } from '../core/Events';
import { save } from '../core/Save';
import { audio } from '../audio/Audio';
import { surface, runeMaterial } from '../art/Materials';
import { displace, archway, stoneBlock } from '../art/Meshes';
import { Random } from '../core/RNG';
import { FXSystem } from '../fx/Particles';
import { CLASSES } from '../data/classes';
import { buildRift, buildAtmosphere, type RiftHandle, type AtmosphereHandle } from './MenuStage';
import { buildClassHero, buildCharacterHero, classColor, flourishClip, type HeroModel } from './HeroModel';

/**
 * Character select and creation: a hero on a plinth under a pool of light,
 * with a rift-filled arch behind that takes on the class's colour.
 *
 * The UI panel owns every control. It tells this scene what to show through
 * the bus: `ui:open { panel: 'class:<classId>' }` shows a class in its field
 * kit, `ui:open { panel: 'char:<characterId>' }` shows a living character in
 * their real gear. The model can be turned by dragging anywhere on the stage.
 */
export class CharSelectScene extends GameScene {
  readonly id: SceneId = 'charSelect';
  camera: THREE.PerspectiveCamera;

  private fx: FXSystem;
  private engine: Engine;
  private podium = new THREE.Group();
  private current: HeroModel | null = null;
  private showing = '';
  private keyLight!: THREE.PointLight;
  private rimLight!: THREE.PointLight;
  private poolLight!: THREE.SpotLight;
  private ringMat!: THREE.MeshStandardMaterial;
  private rune!: THREE.Mesh;
  private rift!: RiftHandle;
  private atmosphere!: AtmosphereHandle;
  private offSelect: (() => void) | null = null;

  /** Turntable state: auto-spin plus whatever the player drags in. */
  private yaw = 0.35;
  private yawVel = 0;
  private dragging = false;
  private dragX = 0;
  private idleFor = 10;

  /** Entrance animation for a freshly swapped model, 0 → 1. */
  private enterT = 1;
  private flash = 0;
  private flourishAt = -1;
  private accent = new THREE.Color(0xc9a227);
  private accentTarget = new THREE.Color(0xc9a227);

  constructor(engine: Engine) {
    super();
    this.engine = engine;
    this.camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 120);
    this.fx = new FXSystem(this.scene, engine.renderer.quality);
  }

  enter(): void {
    const rng = new Random(0xc1a55);
    const scene = this.scene;
    this.engine.renderer.applyEnvironment(scene, 0.55);
    scene.fog = new THREE.FogExp2(0x07070c, 0.06);
    scene.background = new THREE.Color(0x040409);

    scene.add(new THREE.HemisphereLight(0x28304a, 0x080608, 0.24));

    // Three-point rig. Key warm, rim in the class colour and behind: this is
    // the whole reason the character reads as sculpted rather than flat.
    this.keyLight = new THREE.PointLight(0xffd6ac, 24, 24, 2);
    this.keyLight.position.set(2.4, 4.2, 3.6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.bias = -0.0015;
    scene.add(this.keyLight);

    this.rimLight = new THREE.PointLight(0x7ea8ff, 26, 22, 2);
    this.rimLight.position.set(-2.8, 3.4, -3.0);
    scene.add(this.rimLight);

    const fill = new THREE.PointLight(0x4a5878, 5, 20, 2);
    fill.position.set(-2.6, 2.0, 3.2);
    scene.add(fill);

    // A hard pool of light straight down onto the plinth. It is what makes the
    // plinth the only lit thing in a dark room.
    this.poolLight = new THREE.SpotLight(0xfff0d8, 40, 14, 0.42, 0.55, 1.6);
    this.poolLight.position.set(0, 7.5, 0.6);
    this.poolLight.target.position.set(0, 0, 0);
    scene.add(this.poolLight, this.poolLight.target);

    // Floor.
    const floorGeo = new THREE.PlaneGeometry(44, 44, 36, 36);
    displace(floorGeo, rng.fork('floor'), 0.1, 0.2);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, surface('stone.crypt', { repeat: 10, roughness: 0.9 }));
    floor.receiveShadow = true;
    scene.add(floor);

    // Plinth: a stepped drum with a glowing inlaid ring.
    const templeMat = surface('stone.temple', { repeat: 2.2 });
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.1, 0.22, 40, 1), templeMat);
    lower.position.y = 0.11;
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.62, 0.26, 40, 1), templeMat);
    upper.position.y = 0.35;
    for (const m of [lower, upper]) {
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    }
    this.ringMat = new THREE.MeshStandardMaterial({
      color: 0x1a1408,
      emissive: new THREE.Color(0xc9a227),
      emissiveIntensity: 2.4,
      roughness: 0.4,
      metalness: 0.6,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.56, 0.035, 8, 80), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.48;
    scene.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.02, 0.025, 8, 90), this.ringMat);
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.23;
    scene.add(ring2);

    // A rune circle on the floor around the plinth, slowly turning.
    // A private copy of the cached rune material: its colour follows the class,
    // and tinting the shared instance would tint every rune in the game.
    const runeMat = runeMaterial(0xffffff, 23).clone();
    runeMat.userData = {};
    this.rune = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 6.4), runeMat);
    this.rune.rotation.x = -Math.PI / 2;
    this.rune.position.y = 0.012;
    this.rune.renderOrder = 2;
    scene.add(this.rune);

    this.podium.position.y = 0.48;
    scene.add(this.podium);

    // Backdrop: an arch holding a rift that takes the class colour, flanked by
    // dark masonry so the frame has edges.
    const archW = 3.6;
    const archH = 5.6;
    const arch = new THREE.Mesh(archway(archW, archH, 0.9), templeMat);
    arch.position.set(0, 0, -5.2);
    arch.castShadow = true;
    arch.receiveShadow = true;
    scene.add(arch);
    this.rift = buildRift(archW, archH, archH - archW * 0.5, 0x1a1030, 0x7ea8ff);
    this.rift.mesh.position.set(0, archH * 0.5, -5.2);
    scene.add(this.rift.mesh);
    const wallMat = surface('stone.crypt', { repeat: 3 });
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(stoneBlock(6, 7.5, 0.9, rng.fork(`w${side}`), 0.4), wallMat);
      wall.position.set(side * (archW * 0.5 + 0.6 + 3), 3.75, -5.25);
      wall.receiveShadow = true;
      scene.add(wall);
    }

    this.atmosphere = buildAtmosphere({
      mistColor: 0x2a3048,
      mistOpacity: 0.42,
      extent: 40,
      layers: 3,
      shafts: [{ x: 0, z: 0.5, height: 8.5, width: 3.4, tilt: 0 }],
      shaftColor: 0xfff0d8,
      shaftOpacity: 0.05,
      seed: 0xc5c5,
    });
    scene.add(this.atmosphere.root);

    this.fx.setAmbient('dust', new THREE.Box3(new THREE.Vector3(-6, 0, -5), new THREE.Vector3(6, 6, 5)));

    this.layoutCamera();
    window.addEventListener('resize', this.layoutCamera);

    const canvas = this.engine.renderer.canvas;
    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);

    // Start on whatever the panel last asked for, or the first class.
    this.showClass((CLASSES[0]?.id ?? 'warden') as CharClassId, false);

    const handler = (p: { panel: string }): void => {
      if (p.panel.startsWith('class:')) {
        const id = p.panel.slice(6) as CharClassId;
        if (CLASSES.some((c) => c.id === id)) this.showClass(id, true);
      } else if (p.panel.startsWith('char:')) {
        this.showCharacter(p.panel.slice(5));
      }
    };
    this.offSelect = events.on('ui:open', handler);

    audio.music('menu', 1.5);
    events.emit('ui:open', { panel: 'charSelect' });
  }

  /**
   * Frame the hero a little high and centred. On narrow windows pull back so
   * the side columns never cover the model.
   */
  private layoutCamera = (): void => {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const pull = aspect < 1.5 ? 1.25 : 1;
    this.camera.position.set(0, 1.75 * pull, 5.6 * pull);
    this.camera.lookAt(0, 1.18, 0);
  };

  private onDown = (e: PointerEvent): void => {
    this.dragging = true;
    this.dragX = e.clientX;
    this.idleFor = 0;
  };
  private onMove = (e: PointerEvent): void => {
    if (!this.dragging) return;
    const dx = e.clientX - this.dragX;
    this.dragX = e.clientX;
    this.yaw += dx * 0.01;
    this.yawVel = dx * 0.6;
  };
  private onUp = (): void => {
    this.dragging = false;
  };

  private showClass(id: CharClassId, announce: boolean): void {
    const key = `class:${id}`;
    if (this.showing === key) return;
    this.swap(buildClassHero(id), key, announce);
  }

  private showCharacter(charId: string): void {
    const key = `char:${charId}`;
    if (this.showing === key) return;
    const c = save.roster.find((x) => x.id === charId);
    if (!c) return;
    this.swap(buildCharacterHero(c), key, true);
  }

  private swap(next: HeroModel, key: string, announce: boolean): void {
    this.current?.dispose();
    this.current = next;
    this.showing = key;
    this.podium.add(next.root);

    const color = classColor(next.classId);
    this.accentTarget.setHex(color);
    this.enterT = 0;
    this.flash = 1;
    this.flourishAt = 0.45;
    this.fx.burst('portal', 0, 1.0, 0, { count: 56, color, scale: 1.3 });
    if (announce) audio.play('ui.select');
  }

  override update(dt: number, elapsed: number): void {
    // Turntable: auto-spin after a few seconds of no input, with inertia from
    // the last drag so a flick keeps turning and settles.
    this.idleFor += dt;
    if (!this.dragging) {
      this.yaw += this.yawVel * dt;
      this.yawVel *= Math.pow(0.04, dt);
      if (this.idleFor > 2.5) this.yaw += dt * 0.28 * Math.min(1, (this.idleFor - 2.5) / 1.5);
    }
    this.podium.rotation.y = this.yaw;

    // Swap entrance: rise out of the plinth and settle.
    if (this.enterT < 1) {
      this.enterT = Math.min(1, this.enterT + dt / 0.6);
      const e = 1 - Math.pow(1 - this.enterT, 3);
      if (this.current) {
        this.current.root.position.y = (1 - e) * -0.35;
        this.current.root.scale.setScalar(0.94 + e * 0.06);
      }
    }
    if (this.flourishAt >= 0) {
      this.flourishAt -= dt;
      if (this.flourishAt < 0 && this.current) {
        this.current.animator.play(flourishClip(this.current.classId), { once: true, fade: 0.12 });
      }
    }
    this.current?.animator.update(dt);

    // The accent eases between classes rather than snapping.
    this.accent.lerp(this.accentTarget, Math.min(1, dt * 3));
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.rimLight.color.copy(this.accent);
    this.rimLight.intensity = 26 + this.flash * 30;
    this.ringMat.emissive.copy(this.accent);
    this.ringMat.emissiveIntensity = 2.2 + Math.sin(elapsed * 1.6) * 0.3 + this.flash * 3;
    const u = this.rift.material.uniforms;
    (u.uHot!.value as THREE.Color).copy(this.accent);
    (u.uDeep!.value as THREE.Color).copy(this.accent).multiplyScalar(0.18);
    this.rift.update(elapsed, this.flash);
    (this.rune.material as THREE.MeshBasicMaterial).color.copy(this.accent).multiplyScalar(0.55 + this.flash * 0.6);
    this.rune.rotation.z = elapsed * 0.05;

    // Subtle breathing on the key light keeps the still frame from feeling dead.
    this.keyLight.intensity = 24 + Math.sin(elapsed * 1.3) * 1.4;

    this.atmosphere.update(dt);
    this.fx.update(dt, elapsed);
  }

  override dispose(): void {
    this.offSelect?.();
    window.removeEventListener('resize', this.layoutCamera);
    this.engine.renderer.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.current?.dispose();
    this.current = null;
    this.atmosphere.dispose();
    this.fx.dispose();
    events.emit('ui:close', { panel: 'charSelect' });
  }
}
