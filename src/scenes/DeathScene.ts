import * as THREE from 'three';
import { GameScene, type Engine } from '../core/Engine';
import type { SceneId } from '../types';
import { events } from '../core/Events';
import { audio } from '../audio/Audio';
import { surface, emissiveMaterial } from '../art/Materials';
import { stoneBlock, displace } from '../art/Meshes';
import { Random } from '../core/RNG';
import { FXSystem } from '../fx/Particles';

export interface DeathPayload {
  killedBy: string;
  depth: number;
  level: number;
  name: string;
  playtime: number;
}

/**
 * The death screen backdrop: a fresh grave marker under cold light. Deliberately
 * still and quiet — the run just ended, and the pause should land.
 */
export class DeathScene extends GameScene {
  readonly id: SceneId = 'death';
  camera: THREE.PerspectiveCamera;

  private fx: FXSystem;
  private engine: Engine;
  private candle!: THREE.PointLight;
  private t = 0;

  constructor(engine: Engine) {
    super();
    this.engine = engine;
    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
    this.fx = new FXSystem(this.scene, engine.renderer.quality);
  }

  enter(payload?: unknown): void {
    const data = (payload ?? {}) as Partial<DeathPayload>;
    const rng = new Random(0xdead);
    const scene = this.scene;

    scene.fog = new THREE.FogExp2(0x05060a, 0.075);
    scene.background = new THREE.Color(0x030408);
    scene.add(new THREE.HemisphereLight(0x1a2338, 0x050505, 0.22));

    const moon = new THREE.DirectionalLight(0x7a90c0, 0.45);
    moon.position.set(-6, 12, -8);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    scene.add(moon);

    const groundGeo = new THREE.PlaneGeometry(50, 50, 40, 40);
    displace(groundGeo, rng.fork('g'), 0.2, 0.16);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, surface('ground.dirt', { repeat: 12 }));
    ground.receiveShadow = true;
    scene.add(ground);

    // Headstone
    const stoneMat = surface('stone.crypt', { repeat: 1.6 });
    const slab = new THREE.Mesh(stoneBlock(1.3, 1.75, 0.24, rng.fork('slab'), 0.35), stoneMat);
    slab.position.set(0, 0.85, 0);
    slab.rotation.z = 0.035;
    slab.castShadow = true;
    slab.receiveShadow = true;
    scene.add(slab);

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.24, 20, 1, false, 0, Math.PI), stoneMat);
    cap.rotation.z = Math.PI / 2 + 0.035;
    cap.rotation.y = Math.PI / 2;
    cap.position.set(0, 1.72, 0);
    cap.castShadow = true;
    scene.add(cap);

    const base = new THREE.Mesh(stoneBlock(1.7, 0.22, 0.55, rng.fork('base'), 0.3), stoneMat);
    base.position.set(0, 0.11, 0.02);
    base.receiveShadow = true;
    scene.add(base);

    // A single guttering candle: the only warmth in the frame.
    const candleBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.065, 0.3, 10),
      surface('cloth.linen', { tint: 0xe8e0cc, roughness: 0.7 })
    );
    candleBody.position.set(0.62, 0.37, 0.42);
    candleBody.castShadow = true;
    scene.add(candleBody);

    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), emissiveMaterial(0xffb347, 6));
    flame.scale.y = 2.1;
    flame.position.set(0.62, 0.57, 0.42);
    scene.add(flame);

    this.candle = new THREE.PointLight(0xffb060, 5.5, 9, 2);
    this.candle.position.set(0.62, 0.62, 0.42);
    this.candle.castShadow = true;
    this.candle.shadow.mapSize.set(512, 512);
    scene.add(this.candle);

    // Scattered stones in the background suggest the rest of the graveyard.
    for (let i = 0; i < 12; i++) {
      const h = rng.range(0.7, 1.4);
      const s = new THREE.Mesh(stoneBlock(rng.range(0.6, 1.0), h, 0.18, rng.fork(`s${i}`), 0.5), stoneMat);
      const a = rng.range(-1.2, 1.2) + Math.PI;
      const d = rng.range(5, 16);
      s.position.set(Math.cos(a) * d + rng.range(-3, 3), h * 0.5, Math.sin(a) * d - 4);
      s.rotation.set(0, rng.range(-0.6, 0.6), rng.range(-0.09, 0.09));
      s.castShadow = true;
      s.receiveShadow = true;
      scene.add(s);
    }

    this.fx.setAmbient('dust', new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 5, 10)));

    this.camera.position.set(1.1, 1.45, 3.5);
    this.camera.lookAt(0, 1.0, 0);

    audio.music('death', 1.2);
    audio.play('player.death');
    events.emit('ui:open', { panel: 'death' });
    // Hand the run summary to the UI layer.
    (window as unknown as Record<string, unknown>).SLAY_DEATH = data;
  }

  override update(dt: number, elapsed: number): void {
    this.t += dt;
    // Slow push-in over the first several seconds, then hold.
    const k = Math.min(1, this.t / 9);
    const ease = 1 - Math.pow(1 - k, 3);
    const dist = 3.5 - ease * 0.85;
    this.camera.position.set(1.1 - ease * 0.5, 1.45 - ease * 0.12, dist);
    this.camera.lookAt(0, 1.0, 0);

    const s = Math.sin(elapsed * 17) * Math.sin(elapsed * 9.3);
    this.candle.intensity = 5.5 * (0.8 + s * 0.2);

    this.fx.update(dt, elapsed);
  }

  override dispose(): void {
    this.fx.dispose();
    events.emit('ui:close', { panel: 'death' });
  }
}
