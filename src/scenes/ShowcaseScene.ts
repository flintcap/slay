import * as THREE from 'three';
import { GameScene, type Engine, disposeObject } from '../core/Engine';
import type { SceneId, ItemRarity } from '../types';
import { Random } from '../core/RNG';
import { surface } from '../art/Materials';
import { buildItemModel } from '../art/ItemModels';
import { buildPlayerModel } from '../art/CharacterModels';
import { buildMonsterModel } from '../entities/MonsterModels';
import { ITEM_BASES } from '../sim/Loot';
import { MONSTERS } from '../data/monsters';
import { CLASSES } from '../data/classes';

export type ShowcaseKind = 'items' | 'monsters' | 'classes' | 'rarity';

export interface ShowcasePayload {
  kind?: ShowcaseKind;
  /** Offset into the source list, for paging through everything. */
  page?: number;
}

/**
 * A neutral studio for judging art quality.
 *
 * Gameplay framing hides everything: models are small, dim, and half-occluded.
 * This scene puts them on a turntable under even three-point light at a size
 * where silhouette, material response and detail density can actually be
 * assessed. Debug only — never reachable from play.
 */
export class ShowcaseScene extends GameScene {
  readonly id: SceneId = 'town'; // reuses the town slot; never entered by play
  camera: THREE.PerspectiveCamera;

  private engine: Engine;
  private subjects: THREE.Object3D[] = [];
  private spin = 0;

  constructor(engine: Engine) {
    super();
    this.engine = engine;
    this.camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 200);
  }

  enter(payload?: unknown): void {
    const p = (payload ?? {}) as ShowcasePayload;
    const kind = p.kind ?? 'items';
    const page = p.page ?? 0;
    const rng = new Random(0x5140 + page);

    this.scene.background = new THREE.Color(0x14161c);
    this.scene.fog = null;

    // Even, neutral studio light. Deliberately not moody: mood hides flaws.
    this.scene.add(new THREE.HemisphereLight(0xa8b4c8, 0x2a2620, 1.1));

    const key = new THREE.DirectionalLight(0xfff2df, 2.3);
    key.position.set(4, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    const c = key.shadow.camera;
    c.left = -12;
    c.right = 12;
    c.top = 12;
    c.bottom = -12;
    c.updateProjectionMatrix();
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x9fc0ff, 0.85);
    fill.position.set(-6, 3, 4);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd9b0, 1.5);
    rim.position.set(-3, 4, -7);
    this.scene.add(rim);

    // A plain floor so shadows and grounding read.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      surface('stone.temple', { repeat: 10, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const cols = 5;
    const spacing = 2.6;

    const place = (obj: THREE.Object3D, i: number, scale = 1): void => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const holder = new THREE.Group();
      holder.add(obj);
      obj.scale.setScalar(scale);
      holder.position.set((col - (cols - 1) / 2) * spacing, 0, row * spacing * 1.15);
      holder.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      this.scene.add(holder);
      this.subjects.push(holder);
    };

    if (kind === 'items' || kind === 'rarity') {
      const rarities: ItemRarity[] = ['normal', 'magic', 'rare', 'set', 'unique', 'mythic', 'ancient'];
      const weapons = ITEM_BASES.filter(
        (b) => b.slot === 'mainHand' || b.slot === 'twoHand' || b.slot === 'offHand'
      );
      const armour = ITEM_BASES.filter((b) =>
        ['helm', 'chest', 'gloves', 'boots', 'belt'].includes(String(b.slot))
      );
      const pool = kind === 'rarity' ? [weapons[page % weapons.length]!] : [...weapons, ...armour];

      for (let i = 0; i < 15; i++) {
        const base = kind === 'rarity' ? pool[0]! : pool[(page * 15 + i) % pool.length]!;
        const rarity = kind === 'rarity' ? rarities[i % rarities.length]! : rarities[(i * 3) % rarities.length]!;
        try {
          const model = buildItemModel(base.visual, rng.fork(`i${i}`), rarity);
          const g = new THREE.Group();
          g.add(model);
          model.position.y = 1.2;
          place(g, i, 1.6);
        } catch {
          /* a broken base must not blank the whole sheet */
        }
      }
    } else if (kind === 'monsters') {
      for (let i = 0; i < 15; i++) {
        const def = MONSTERS[(page * 15 + i) % MONSTERS.length]!;
        try {
          const built = buildMonsterModel(def.visual, rng.fork(`m${i}`), def.scale);
          place(built.root, i, 1.0);
        } catch {
          /* skip */
        }
      }
    } else {
      CLASSES.forEach((cls, i) => {
        try {
          const built = buildPlayerModel(cls.id, rng.fork(cls.id));
          place(built.root, i, 1.15);
        } catch {
          /* skip */
        }
      });
    }

    // Frame the grid.
    const rows = Math.ceil(this.subjects.length / cols) || 1;
    const depth = rows * spacing * 1.15;
    this.camera.position.set(0, 3.4, depth * 0.5 + 8.5);
    this.camera.lookAt(0, 1.25, depth * 0.42);
  }

  override update(dt: number): void {
    this.spin += dt * 0.5;
    for (let i = 0; i < this.subjects.length; i++) {
      this.subjects[i]!.rotation.y = this.spin;
    }
  }

  override dispose(): void {
    for (const s of this.subjects) disposeObject(s);
    this.subjects = [];
  }
}
