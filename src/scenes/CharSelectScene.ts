import * as THREE from 'three';
import { GameScene, type Engine, disposeObject } from '../core/Engine';
import type { CharClassId, SceneId } from '../types';
import { events } from '../core/Events';
import { audio } from '../audio/Audio';
import { surface } from '../art/Materials';
import { displace } from '../art/Meshes';
import { buildPlayerModel } from '../art/CharacterModels';
import { Animator } from '../art/Animation';
import { Random } from '../core/RNG';
import { FXSystem } from '../fx/Particles';
import { CLASSES } from '../data/classes';

/**
 * Class selection. The UI panel owns the cards; this scene owns the 3D
 * character on the plinth and swaps the model when the selection changes.
 */
export class CharSelectScene extends GameScene {
  readonly id: SceneId = 'charSelect';
  camera: THREE.PerspectiveCamera;

  private fx: FXSystem;
  private engine: Engine;
  private podium = new THREE.Group();
  private current: { root: THREE.Object3D; animator: Animator } | null = null;
  private selected: CharClassId = 'warden';
  private keyLight!: THREE.PointLight;
  private rimLight!: THREE.PointLight;
  private offSelect: (() => void) | null = null;
  private spin = 0;

  constructor(engine: Engine) {
    super();
    this.engine = engine;
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 120);
    this.fx = new FXSystem(this.scene, engine.renderer.quality);
  }

  enter(): void {
    const rng = new Random(0xc1a55);
    const scene = this.scene;
    this.engine.renderer.applyEnvironment(scene, 0.6);
    scene.fog = new THREE.FogExp2(0x07070c, 0.055);
    scene.background = new THREE.Color(0x05050a);

    scene.add(new THREE.HemisphereLight(0x28304a, 0x080608, 0.28));

    // Three-point rig. Key warm, rim cool and behind — this is the whole
    // reason the character reads as sculpted rather than flat.
    this.keyLight = new THREE.PointLight(0xffd0a0, 26, 24, 2);
    this.keyLight.position.set(2.6, 4.4, 3.4);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.bias = -0.0015;
    scene.add(this.keyLight);

    this.rimLight = new THREE.PointLight(0x7ea8ff, 22, 22, 2);
    this.rimLight.position.set(-3.2, 3.6, -3.6);
    scene.add(this.rimLight);

    const fill = new THREE.PointLight(0x4a5878, 6, 20, 2);
    fill.position.set(-2.4, 2.2, 3.0);
    scene.add(fill);

    // Floor
    const floorGeo = new THREE.PlaneGeometry(40, 40, 32, 32);
    displace(floorGeo, rng.fork('floor'), 0.12, 0.2);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, surface('stone.crypt', { repeat: 9, roughness: 0.88 }));
    floor.receiveShadow = true;
    scene.add(floor);

    // Plinth
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.55, 1.8, 0.42, 32, 1),
      surface('stone.temple', { repeat: 2.2 })
    );
    plinth.position.y = 0.21;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.62, 0.055, 10, 60),
      surface('metal.gold', { repeat: 3, emissive: 0x35240c, emissiveIntensity: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.44;
    scene.add(ring);

    this.podium.position.y = 0.42;
    scene.add(this.podium);

    this.fx.setAmbient('dust', new THREE.Box3(new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 6, 8)));

    this.camera.position.set(0, 2.55, 5.4);
    this.camera.lookAt(0, 1.55, 0);

    this.setClass(this.selected);

    // The UI panel announces selection changes through the bus.
    const handler = (p: { panel: string }) => {
      if (p.panel.startsWith('class:')) {
        const id = p.panel.slice(6) as CharClassId;
        if (CLASSES.some((c) => c.id === id)) this.setClass(id);
      }
    };
    this.offSelect = events.on('ui:open', handler);

    audio.music('menu', 1.5);
    events.emit('ui:open', { panel: 'charSelect' });
  }

  private setClass(id: CharClassId): void {
    this.selected = id;
    if (this.current) {
      this.current.root.removeFromParent();
      disposeObject(this.current.root);
      this.current = null;
    }
    const rng = new Random(0x5eed ^ id.length * 7919);
    const built = buildPlayerModel(id, rng);
    this.podium.add(built.root);
    const animator = new Animator(built.bones);
    animator.play('idle', { fade: 0 });
    this.current = { root: built.root, animator };

    const def = CLASSES.find((c) => c.id === id);
    if (def) {
      // Tint the rim light with the class accent so each class has its own mood.
      this.rimLight.color.setHex(def.color);
    }
    this.fx.burst('portal', 0, 1.2, 0, { count: 40, color: def?.color ?? 0x88aaff, scale: 1.4 });
    audio.play('ui.select');
  }

  override update(dt: number, elapsed: number): void {
    this.spin += dt * 0.32;
    this.podium.rotation.y = this.spin;
    this.current?.animator.update(dt);

    // Subtle breathing on the key light keeps the still frame from feeling dead.
    this.keyLight.intensity = 26 + Math.sin(elapsed * 1.3) * 1.6;
    this.camera.position.y = 2.55 + Math.sin(elapsed * 0.5) * 0.06;
    this.camera.lookAt(0, 1.55, 0);

    this.fx.update(dt, elapsed);
  }

  override dispose(): void {
    this.offSelect?.();
    this.fx.dispose();
    events.emit('ui:close', { panel: 'charSelect' });
  }
}
