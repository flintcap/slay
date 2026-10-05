import * as THREE from 'three';
import { GameScene, type Engine } from '../core/Engine';
import type { CharClassId, ItemRarity, SceneId } from '../types';
import { events } from '../core/Events';
import { audio } from '../audio/Audio';
import { surface, emissiveMaterial } from '../art/Materials';
import { radialGlowTexture } from '../art/Textures';
import { stoneBlock, displace } from '../art/Meshes';
import { buildItemModel } from '../art/ItemModels';
import { Random } from '../core/RNG';
import { FXSystem } from '../fx/Particles';
import { getBase } from '../sim/Loot';
import { CLASSES } from '../data/classes';
import { buildAtmosphere, type AtmosphereHandle } from './MenuStage';

export interface DeathPayload {
  killedBy: string;
  depth: number;
  level: number;
  name: string;
  playtime: number;
  classId?: CharClassId;
  /** The main-hand weapon they died holding, planted on the grave. */
  weapon?: { baseId: string; rarity: ItemRarity } | null;
}

/**
 * The death screen backdrop: a fresh grave under cold light, the name cut into
 * the stone, the weapon they died holding planted in the earth in front of it,
 * and a single wisp in the class's colour rising off the mound.
 *
 * Deliberately still and quiet. The run just ended, and the pause should land.
 */
export class DeathScene extends GameScene {
  readonly id: SceneId = 'death';
  camera: THREE.PerspectiveCamera;

  private fx: FXSystem;
  private engine: Engine;
  private candle!: THREE.PointLight;
  private wisp: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;
  private atmosphere!: AtmosphereHandle;
  private textures: THREE.Texture[] = [];
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

    scene.fog = new THREE.FogExp2(0x05060a, 0.07);
    scene.background = new THREE.Color(0x030408);
    scene.add(new THREE.HemisphereLight(0x1a2338, 0x050505, 0.22));

    const moon = new THREE.DirectionalLight(0x7a90c0, 0.5);
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

    // The fresh mound in front of the stone.
    const moundGeo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    moundGeo.scale(0.75, 0.22, 1.25);
    displace(moundGeo, rng.fork('mound'), 0.05, 2.2);
    const mound = new THREE.Mesh(moundGeo, surface('ground.dirt', { repeat: 3, tint: 0x6a5a48 }));
    mound.position.set(0, 0, 1.25);
    mound.receiveShadow = true;
    mound.castShadow = true;
    scene.add(mound);

    // Headstone.
    // Dressed stone at a scale where one slab spans the face: a single cut
    // headstone, not the crypt's brick wall, and pale enough for the
    // inscription to read.
    const stoneMat = surface('stone.temple', { repeat: 0.45, tint: 0xa4a6ae, bump: 0.5 });
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

    // The name, cut into the face of the stone.
    const engraving = this.engrave(data);
    engraving.position.set(0, 1.0, 0.124);
    engraving.rotation.z = 0.035;
    scene.add(engraving);

    // The weapon they died holding, driven point-first into the mound.
    if (data.weapon) {
      try {
        const def = getBase(data.weapon.baseId);
        if (def?.visual) {
          const w = buildItemModel(def.visual, rng.fork('weapon'), data.weapon.rarity);
          w.rotation.set(0.12, 0.5, Math.PI + 0.1);
          const holder = new THREE.Group();
          holder.add(w);
          const box = new THREE.Box3().setFromObject(holder);
          holder.position.set(0.05, -box.min.y - 0.18, 1.0);
          holder.traverse((o) => {
            o.castShadow = true;
          });
          scene.add(holder);
        }
      } catch {
        // No weapon is better than no death screen.
      }
    }

    // A single guttering candle: the only warmth in the frame.
    const candleBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.065, 0.3, 10),
      surface('cloth.linen', { tint: 0xe8e0cc, roughness: 0.7 }),
    );
    candleBody.position.set(0.62, 0.37, 0.42);
    candleBody.castShadow = true;
    scene.add(candleBody);

    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), emissiveMaterial(0xffb347, 3.2));
    flame.scale.y = 2.1;
    flame.position.set(0.62, 0.57, 0.42);
    scene.add(flame);

    this.candle = new THREE.PointLight(0xffb060, 4, 9, 2);
    this.candle.position.set(0.62, 0.62, 0.42);
    this.candle.castShadow = true;
    this.candle.shadow.mapSize.set(512, 512);
    scene.add(this.candle);

    // What is left of them: a wisp in the class colour, rising and fading.
    const color = CLASSES.find((c) => c.id === data.classId)?.color ?? 0x9fb4e0;
    // A single point, not a Sprite: the AO pass redraws sprites with its normal
    // material as flat unbillboarded squares, which printed a dark box on the
    // stone. It skips points.
    const wispGeo = new THREE.BufferGeometry();
    wispGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    this.wisp = new THREE.Points(
      wispGeo,
      new THREE.PointsMaterial({
        map: radialGlowTexture(),
        color,
        size: 0,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.wisp.position.set(0, 0.4, 1.2);
    scene.add(this.wisp);
    const wispLight = new THREE.PointLight(color, 2.5, 5, 2);
    this.wisp.add(wispLight);

    // The rest of the graveyard, receding into fog.
    for (let i = 0; i < 14; i++) {
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

    this.atmosphere = buildAtmosphere({
      mistColor: 0x2c3448,
      mistOpacity: 0.55,
      extent: 40,
      layers: 3,
      shafts: [{ x: -1.4, z: -1.5, height: 9, width: 2.2, tilt: -0.3 }],
      shaftColor: 0x8aa0d0,
      shaftOpacity: 0.07,
      seed: 0xdead,
    });
    scene.add(this.atmosphere.root);

    this.fx.setAmbient('dust', new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 5, 10)));

    this.camera.position.set(1.3, 1.7, 7.0);
    this.camera.lookAt(0, 1.0, 0);
    this.frameRight();

    audio.music('death', 1.2);
    audio.play('player.death');
    // Hand the run summary to the UI layer.
    (window as unknown as Record<string, unknown>).SLAY_DEATH = data;
    events.emit('ui:open', { panel: 'death' });
  }

  /** A transparent plane carrying the carved inscription. */
  private engrave(data: Partial<DeathPayload>): THREE.Mesh {
    const W = 512;
    const H = 460;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
    const carve = (text: string, y: number, size: number, weight = '700'): void => {
      ctx.font = `${weight} ${size}px ${serif}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Lit lower lip, then the dark cut: reads as letters sunk into stone.
      ctx.fillStyle = 'rgba(220, 220, 230, 0.32)';
      ctx.fillText(text, W / 2, y + 2);
      ctx.fillStyle = 'rgba(8, 8, 10, 0.88)';
      ctx.fillText(text, W / 2, y);
    };
    const name = (data.name ?? 'The Nameless').toUpperCase();
    const size = name.length > 11 ? Math.max(38, 66 - (name.length - 11) * 4) : 66;
    carve('HERE LIES', 70, 30, '600');
    carve(name, 150, size);
    ctx.fillStyle = 'rgba(8, 8, 10, 0.7)';
    ctx.fillRect(W / 2 - 110, 200, 220, 3);
    const cls = CLASSES.find((c) => c.id === data.classId)?.name;
    carve(cls ? `${cls}, level ${data.level ?? 1}` : `Level ${data.level ?? 1}`, 250, 32, '600');
    carve(`Fell on Depth ${data.depth ?? 0}`, 300, 32, '600');
    // A small cross of crossed lines as a mark.
    ctx.strokeStyle = 'rgba(8, 8, 10, 0.8)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(W / 2, 350);
    ctx.lineTo(W / 2, 420);
    ctx.moveTo(W / 2 - 24, 372);
    ctx.lineTo(W / 2 + 24, 372);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.textures.push(tex);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      roughness: 1,
      metalness: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(1.08, 1.08 * (H / W)), mat);
  }

  /**
   * The run summary fills the left of the screen, so the grave is framed right
   * of centre by shifting the projection, not by turning the camera (which
   * would show the stone from the side). Portrait windows keep it centred.
   */
  private frameRight(): void {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const shift = w / h > 1.2 ? -0.19 : 0;
    const v = this.camera.view;
    if (v?.enabled) {
      if (shift !== 0 && v.fullWidth === w && v.fullHeight === h) return;
    } else if (shift === 0) return;
    // setViewOffset also sets the aspect to fullWidth / fullHeight, so it gets
    // the real window size; a unit window here squashed the scene to square.
    if (shift === 0) {
      this.camera.clearViewOffset();
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    } else this.camera.setViewOffset(w, h, shift * w, 0, w, h);
  }

  override update(dt: number, elapsed: number): void {
    this.t += dt;
    this.frameRight();
    // Slow push-in over the first several seconds, then hold.
    const k = Math.min(1, this.t / 9);
    const ease = 1 - Math.pow(1 - k, 3);
    // Far enough that the stone fills about half the height: the grave is the
    // subject, but it sits in a graveyard, not against the lens.
    const dist = 7.0 - ease * 1.1;
    this.camera.position.set(1.3 - ease * 0.6, 1.7 - ease * 0.15, dist);
    this.camera.lookAt(0, 0.95, 0);

    const s = Math.sin(elapsed * 17) * Math.sin(elapsed * 9.3);
    this.candle.intensity = 4 * (0.8 + s * 0.2);

    if (this.wisp) {
      // Rises off the mound over six seconds, shrinking away, then begins again.
      const p = (this.t % 6) / 6;
      this.wisp.position.set(Math.sin(this.t * 1.3) * 0.12, 0.35 + p * 2.1, 1.2 - p * 0.4);
      const sc = 0.55 * Math.sin(Math.PI * Math.min(1, p * 1.15));
      // Point size is in the same units as a sprite's scale once divided by
      // tan(fov / 2), so the glow keeps the size it had as a sprite.
      this.wisp.material.size = Math.max(0.001, sc) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    }

    this.atmosphere.update(dt);
    this.fx.update(dt, elapsed);
  }

  override dispose(): void {
    this.atmosphere.dispose();
    for (const t of this.textures) t.dispose();
    this.textures = [];
    this.fx.dispose();
    events.emit('ui:close', { panel: 'death' });
  }
}
