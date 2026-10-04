import * as THREE from 'three';
import { GameScene, type Engine } from '../core/Engine';
import type { SceneId } from '../types';
import { events } from '../core/Events';
import { audio } from '../audio/Audio';
import { surface, emissiveMaterial } from '../art/Materials';
import { stoneBlock, pillar, displace, archway, stairs } from '../art/Meshes';
import { Random } from '../core/RNG';
import { FXSystem } from '../fx/Particles';
import { buildRift, buildAtmosphere, guardianStatue, type RiftHandle, type AtmosphereHandle } from './MenuStage';

/** Arch opening, in metres. The rift plane is sized from these. */
const ARCH_W = 4.6;
const ARCH_H = 7.0;
const DAIS_H = 0.54;

/** Where the camera settles once the intro push-in is done. */
const REST = new THREE.Vector3(-3.6, 3.4, 14.5);
const LOOK = new THREE.Vector3(-2.7, 3.9, 0);

/**
 * The title screen: a ruined gate on a dais with a burning rift where the door
 * should be, two hooded guardians, braziers, and moonlit mist.
 *
 * The camera frames the gate right of centre because the menu lives on the
 * left; it pushes in over the first few seconds while the logo resolves, then
 * drifts and follows the mouse a little so the frame never feels like a still.
 */
export class TitleScene extends GameScene {
  readonly id: SceneId = 'title';
  camera: THREE.PerspectiveCamera;

  private fx: FXSystem;
  private torches: Array<{ light: THREE.PointLight; base: number; seed: number }> = [];
  private engine: Engine;
  private rift!: RiftHandle;
  private riftLight!: THREE.PointLight;
  private atmosphere!: AtmosphereHandle;
  private t = 0;
  private nextPulse = 4.5;
  private pulse = 0;
  private mouse = new THREE.Vector2();
  private mouseSmooth = new THREE.Vector2();
  private onMove = (e: PointerEvent): void => {
    this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  };

  constructor(engine: Engine) {
    super();
    this.engine = engine;
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 220);
    this.fx = new FXSystem(this.scene, engine.renderer.quality);
  }

  enter(): void {
    const rng = new Random(0xa11ce);
    const scene = this.scene;

    this.engine.renderer.applyEnvironment(scene, 0.45);
    scene.fog = new THREE.FogExp2(0x090a12, 0.036);
    scene.background = new THREE.Color(0x05060b);

    scene.add(new THREE.HemisphereLight(0x2a3550, 0x0a0808, 0.3));

    // Cold moonlight from behind, so the gate reads as a silhouette first.
    const moon = new THREE.DirectionalLight(0x8fa8d8, 0.9);
    moon.position.set(-12, 20, -18);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 70;
    const c = moon.shadow.camera;
    c.left = -20;
    c.right = 20;
    c.top = 20;
    c.bottom = -20;
    c.updateProjectionMatrix();
    scene.add(moon);

    // Ground.
    const groundGeo = new THREE.PlaneGeometry(90, 90, 56, 56);
    displace(groundGeo, rng.fork('ground'), 0.26, 0.12);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, surface('ground.cobble', { repeat: 14, roughness: 0.94 }));
    ground.receiveShadow = true;
    scene.add(ground);

    const stoneMat = surface('stone.crypt', { repeat: 2.2 });
    const templeMat = surface('stone.temple', { repeat: 1.6 });

    // Dais and the steps up to it. The gate sits raised so it is approached,
    // not walked past.
    const dais = new THREE.Mesh(stoneBlock(10.5, DAIS_H, 4.6, rng.fork('dais'), 0.35), stoneMat);
    dais.position.set(0, DAIS_H * 0.5, -0.2);
    dais.castShadow = true;
    dais.receiveShadow = true;
    scene.add(dais);

    const steps = new THREE.Mesh(stairs(6.4, DAIS_H / 3, 0.62, 3, 0.03), stoneMat);
    steps.rotation.y = Math.PI;
    steps.position.set(0, 0, 2.1 + 0.93);
    steps.castShadow = true;
    steps.receiveShadow = true;
    scene.add(steps);

    // The arch, and the rift that fills it.
    const archGeo = archway(ARCH_W, ARCH_H, 1.3);
    displace(archGeo, rng.fork('arch'), 0.035, 1.6);
    const arch = new THREE.Mesh(archGeo, templeMat);
    arch.position.set(0, DAIS_H, 0);
    arch.castShadow = true;
    arch.receiveShadow = true;
    scene.add(arch);

    this.rift = buildRift(ARCH_W, ARCH_H, ARCH_H - ARCH_W * 0.5, 0x5a0d1e, 0xff6a2a);
    this.rift.mesh.position.set(0, DAIS_H + ARCH_H * 0.5, 0.02);
    scene.add(this.rift.mesh);

    // The rift lights its own doorway and the steps below it.
    this.riftLight = new THREE.PointLight(0xff5a28, 16, 18, 1.8);
    this.riftLight.position.set(0, DAIS_H + 2.4, 1.4);
    scene.add(this.riftLight);

    // Guardians either side of the gate, on plinths.
    const statueGeo = guardianStatue(rng.fork('statue'), 3.5);
    for (const side of [-1, 1]) {
      const plinth = new THREE.Mesh(stoneBlock(1.5, 0.9, 1.5, rng.fork(`plinth${side}`), 0.4), stoneMat);
      plinth.position.set(side * 4.3, DAIS_H + 0.45, 0.4);
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      scene.add(plinth);

      const statue = new THREE.Mesh(side < 0 ? statueGeo : statueGeo.clone(), templeMat);
      statue.position.set(side * 4.3, DAIS_H + 0.9, 0.4);
      statue.rotation.y = -side * 0.22;
      statue.castShadow = true;
      statue.receiveShadow = true;
      scene.add(statue);
    }

    // Broken columns further out give the ruin a footprint beyond the gate.
    for (const [x, z, broken] of [
      [-8.6, -2.6, true],
      [8.9, -3.4, false],
      [-12.5, -7, false],
      [13, -8.5, true],
    ] as Array<[number, number, boolean]>) {
      const h = broken ? rng.range(3.2, 4.6) : rng.range(7.5, 8.6);
      const col = new THREE.Mesh(pillar(0.78, h, 12, rng.fork(`col${x}`), broken ? 'broken' : 'fluted'), stoneMat);
      col.position.set(x, h * 0.5, z);
      col.castShadow = true;
      col.receiveShadow = true;
      scene.add(col);
    }

    // Rubble, kept off the approach so the steps read cleanly.
    for (let i = 0; i < 40; i++) {
      const s = rng.range(0.2, 0.8);
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(5.5, 22);
      const x = Math.cos(a) * d;
      const z = Math.sin(a) * d;
      if (Math.abs(x) < 4 && z > 0) continue;
      const rock = new THREE.Mesh(stoneBlock(s, s * rng.range(0.5, 1), s, rng.fork(`r${i}`), 0.8), stoneMat);
      rock.position.set(x, s * 0.3, z);
      rock.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
    }

    // Braziers at the foot of the steps: the warm key against the cold moon.
    for (const side of [-1, 1]) {
      const x = side * 4.1;
      const z = 3.6;
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.28, 0.4, 14),
        surface('metal.rusted', { repeat: 1.4 }),
      );
      bowl.position.set(x, 1.15, z);
      bowl.castShadow = true;
      scene.add(bowl);

      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 1.0, 10), surface('metal.dark', { repeat: 1 }));
      stem.position.set(x, 0.5, z);
      stem.castShadow = true;
      scene.add(stem);

      const coals = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), emissiveMaterial(0xff7a2a, 3.2));
      coals.position.set(x, 1.3, z);
      scene.add(coals);

      const light = new THREE.PointLight(0xff8a3c, 8, 20, 1.9);
      light.position.set(x, 1.8, z);
      light.castShadow = side < 0;
      light.shadow.mapSize.set(512, 512);
      scene.add(light);
      this.torches.push({ light, base: 8, seed: rng.range(0, 100) });
    }

    // Mist that the rift light glows through, and shafts of moonlight cutting
    // down past the gate.
    this.atmosphere = buildAtmosphere({
      mistColor: 0x3c4660,
      mistOpacity: 0.5,
      extent: 70,
      layers: 4,
      shafts: [
        { x: -2.2, z: -2.4, height: 15, width: 2.6, tilt: -0.42, yaw: 0.1 },
        { x: 1.6, z: -3.2, height: 16, width: 1.6, tilt: -0.38, yaw: -0.1 },
        { x: -6.5, z: -4.5, height: 14, width: 2.0, tilt: -0.46 },
      ],
      shaftColor: 0x9fb6e8,
      shaftOpacity: 0.09,
      seed: 0x7171,
    });
    scene.add(this.atmosphere.root);

    this.fx.setAmbient('embers', new THREE.Box3(new THREE.Vector3(-18, 0, -14), new THREE.Vector3(18, 10, 16)));

    // Start wide and high; update() eases in to REST.
    this.camera.position.set(REST.x + 2.5, REST.y + 3.4, REST.z + 9);
    this.camera.lookAt(LOOK);

    window.addEventListener('pointermove', this.onMove, { passive: true });

    audio.music('menu', 2.5);
    events.emit('ui:open', { panel: 'title' });
  }

  override update(dt: number, elapsed: number): void {
    this.t += dt;

    // Intro push-in: an ease-out over the first 4.5 seconds, while the logo
    // resolves. After that the camera only drifts.
    const k = Math.min(1, this.t / 4.5);
    const ease = 1 - Math.pow(1 - k, 3);
    this.mouseSmooth.lerp(this.mouse, Math.min(1, dt * 1.8));
    const drift = Math.sin(elapsed * 0.09) * 0.9;
    const bob = Math.sin(elapsed * 0.17) * 0.18;
    const px = REST.x + drift + this.mouseSmooth.x * 0.55;
    const py = REST.y + bob - this.mouseSmooth.y * 0.3;
    const pz = REST.z + Math.sin(elapsed * 0.07) * 0.6;
    this.camera.position.set(
      px + (1 - ease) * 2.5,
      py + (1 - ease) * 3.4,
      pz + (1 - ease) * 9,
    );
    this.camera.lookAt(LOOK.x + this.mouseSmooth.x * 0.25, LOOK.y - this.mouseSmooth.y * 0.12, LOOK.z);

    for (const t of this.torches) {
      // Layered flicker: a fast jitter over a slow swell. Sine alone reads as a
      // pulsing bulb rather than fire.
      const s = t.seed;
      const fast = Math.sin(elapsed * 21 + s) * Math.sin(elapsed * 13.7 + s * 2.1);
      const slow = Math.sin(elapsed * 2.3 + s * 0.7);
      t.light.intensity = t.base * (0.78 + fast * 0.13 + slow * 0.12);
    }

    // Every few seconds the rift breathes out: a flare, a gust of motes. It
    // gives the eye somewhere to go while the player reads the menu.
    if (this.t >= this.nextPulse) {
      this.nextPulse = this.t + 6.5;
      this.pulse = 1;
      this.fx.burst('portal', 0, DAIS_H + 2.2, 0.6, { count: 46, color: 0xff7a3a, scale: 1.5 });
    }
    this.pulse = Math.max(0, this.pulse - dt * 0.7);
    const p = this.pulse * this.pulse;
    this.rift.update(elapsed, p);
    this.riftLight.intensity = 14 + Math.sin(elapsed * 1.7) * 2 + p * 18;

    this.atmosphere.update(dt);
    this.fx.update(dt, elapsed);
  }

  override dispose(): void {
    window.removeEventListener('pointermove', this.onMove);
    this.atmosphere.dispose();
    this.fx.dispose();
    events.emit('ui:close', { panel: 'title' });
  }
}
