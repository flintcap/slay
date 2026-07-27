import * as THREE from 'three';
import { GameScene, type Engine } from '../core/Engine';
import type { SceneId } from '../types';
import { events } from '../core/Events';
import { audio } from '../audio/Audio';
import { surface, emissiveMaterial } from '../art/Materials';
import { stoneBlock, pillar, displace } from '../art/Meshes';
import { Random } from '../core/RNG';
import { FXSystem } from '../fx/Particles';

/**
 * The title screen. A slow orbit around a ruined gate with drifting embers —
 * the whole job is to set tone before the player has touched anything.
 */
export class TitleScene extends GameScene {
  readonly id: SceneId = 'title';
  camera: THREE.PerspectiveCamera;

  private fx: FXSystem;
  private torches: Array<{ light: THREE.PointLight; base: number; seed: number }> = [];
  private orbitAngle = 0;
  private engine: Engine;

  constructor(engine: Engine) {
    super();
    this.engine = engine;
    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 220);
    this.fx = new FXSystem(this.scene, engine.renderer.quality);
  }

  enter(): void {
    const rng = new Random(0xa11ce);
    const scene = this.scene;

    scene.fog = new THREE.FogExp2(0x0a0910, 0.038);
    scene.background = new THREE.Color(0x06060b);

    const ambient = new THREE.HemisphereLight(0x2a3550, 0x0a0808, 0.32);
    scene.add(ambient);

    // Cold moonlight from behind, so the gate reads as a silhouette first.
    const moon = new THREE.DirectionalLight(0x8fa8d8, 0.85);
    moon.position.set(-14, 18, -20);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.near = 1;
    moon.shadow.camera.far = 70;
    const c = moon.shadow.camera;
    c.left = -22;
    c.right = 22;
    c.top = 22;
    c.bottom = -22;
    c.updateProjectionMatrix();
    scene.add(moon);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(90, 90, 48, 48);
    displace(groundGeo, rng.fork('ground'), 0.28, 0.12);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, surface('ground.cobble', { repeat: 14, roughness: 0.94 }));
    ground.receiveShadow = true;
    scene.add(ground);

    // The gate: two broken pillars and a fallen lintel.
    const stoneMat = surface('stone.crypt', { repeat: 2.2 });
    for (const side of [-1, 1]) {
      const h = 7.4 + rng.range(-0.5, 0.5);
      const col = new THREE.Mesh(pillar(0.86, h, 12, rng.fork(`p${side}`), 'ruined'), stoneMat);
      col.position.set(side * 3.4, h * 0.5, 0);
      col.castShadow = true;
      col.receiveShadow = true;
      scene.add(col);

      const capGeo = stoneBlock(2.2, 0.7, 2.2, rng.fork(`cap${side}`), 0.5);
      const cap = new THREE.Mesh(capGeo, stoneMat);
      cap.position.set(side * 3.4, h + 0.3, 0);
      cap.rotation.y = rng.range(-0.2, 0.2);
      cap.castShadow = true;
      scene.add(cap);
    }

    const lintel = new THREE.Mesh(stoneBlock(9.2, 1.15, 2.0, rng.fork('lintel'), 0.55), stoneMat);
    lintel.position.set(0.4, 7.9, -0.1);
    lintel.rotation.z = -0.045;
    lintel.castShadow = true;
    scene.add(lintel);

    // Scattered rubble breaks the symmetry and gives the AO something to bite on.
    for (let i = 0; i < 34; i++) {
      const s = rng.range(0.22, 0.85);
      const rock = new THREE.Mesh(stoneBlock(s, s * rng.range(0.5, 1), s, rng.fork(`r${i}`), 0.8), stoneMat);
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(4.5, 20);
      rock.position.set(Math.cos(a) * d, s * 0.35, Math.sin(a) * d);
      rock.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      rock.castShadow = true;
      rock.receiveShadow = true;
      scene.add(rock);
    }

    // Braziers flanking the gate — the warm key against the cold moon.
    for (const side of [-1, 1]) {
      const x = side * 5.6;
      const z = 2.8;
      const bowl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.52, 0.3, 0.42, 14),
        surface('metal.rusted', { repeat: 1.4 })
      );
      bowl.position.set(x, 1.15, z);
      bowl.castShadow = true;
      scene.add(bowl);

      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.17, 1.0, 10),
        surface('metal.dark', { repeat: 1 })
      );
      stem.position.set(x, 0.5, z);
      stem.castShadow = true;
      scene.add(stem);

      const coals = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), emissiveMaterial(0xff7a2a, 3.2));
      coals.position.set(x, 1.3, z);
      scene.add(coals);

      const light = new THREE.PointLight(0xff8a3c, 9, 22, 1.9);
      light.position.set(x, 1.7, z);
      light.castShadow = true;
      light.shadow.mapSize.set(512, 512);
      scene.add(light);
      this.torches.push({ light, base: 9, seed: rng.range(0, 100) });

      this.fx.burst('embers', x, 1.5, z, { count: 0 });
    }

    this.fx.setAmbient('embers', new THREE.Box3(new THREE.Vector3(-25, 0, -25), new THREE.Vector3(25, 12, 25)));

    this.camera.position.set(0, 4.2, 15);
    this.camera.lookAt(0, 4.4, 0);

    audio.music('menu', 2.5);
    events.emit('ui:open', { panel: 'title' });
  }

  override update(dt: number, elapsed: number): void {
    // Very slow drift — enough to feel alive, slow enough to read the menu over.
    this.orbitAngle += dt * 0.045;
    const r = 15.5 + Math.sin(elapsed * 0.11) * 1.4;
    this.camera.position.set(
      Math.sin(this.orbitAngle) * r,
      4.6 + Math.sin(elapsed * 0.17) * 0.5,
      Math.cos(this.orbitAngle) * r
    );
    this.camera.lookAt(0, 4.6, 0);

    for (const t of this.torches) {
      // Layered noise flicker: a fast jitter over a slow swell. Sine alone
      // reads as a pulsing bulb rather than fire.
      const s = t.seed;
      const fast = Math.sin(elapsed * 21 + s) * Math.sin(elapsed * 13.7 + s * 2.1);
      const slow = Math.sin(elapsed * 2.3 + s * 0.7);
      t.light.intensity = t.base * (0.78 + fast * 0.13 + slow * 0.12);
    }

    this.fx.update(dt, elapsed);
  }

  override dispose(): void {
    this.fx.dispose();
    events.emit('ui:close', { panel: 'title' });
  }
}
