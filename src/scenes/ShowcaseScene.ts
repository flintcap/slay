import * as THREE from 'three';
import { GameScene, type Engine, disposeObject } from '../core/Engine';
import type { SceneId, ItemRarity } from '../types';
import { Random } from '../core/RNG';
import { surface } from '../art/Materials';
import { buildItemModel } from '../art/ItemModels';
import { buildClassHero, type HeroModel } from './HeroModel';
import { buildMonsterModel } from '../entities/MonsterModels';
import { ITEM_BASES } from '../sim/Loot';
import { MONSTERS } from '../data/monsters';
import { BOSSES } from '../data/bosses';
import { WARDENS } from '../data/wardens';
import { CLASSES } from '../data/classes';

export type ShowcaseKind = 'items' | 'monsters' | 'classes' | 'rarity' | 'bosses';

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
  private heroes: HeroModel[] = [];
  private spin = 0;
  /** The boss line-up stands still, facing the camera. */
  private lineup = false;

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
    this.lineup = false;

    this.engine.renderer.applyEnvironment(this.scene, 0.75);
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
        ['helm', 'chest', 'gloves', 'legs', 'boots', 'belt'].includes(String(b.slot))
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
    } else if (kind === 'bosses') {
      // A line-up for judging size: a hero, then eight bosses or wardens of
      // the page in a row, smallest to largest, each in its own lane.
      const all = [...BOSSES, ...WARDENS];
      const defs = all.slice(page * 8, page * 8 + 8).sort((a, b) => a.scale - b.scale);
      let x = 0;
      const lane = (obj: THREE.Object3D, w: number): void => {
        const holder = new THREE.Group();
        holder.add(obj);
        holder.position.set(x + w / 2, 0, 0);
        x += w;
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
      try {
        const hero = buildClassHero(CLASSES[0]!.id);
        this.heroes.push(hero);
        lane(hero.root, 1.8);
      } catch {
        /* skip */
      }
      let tallest = 2;
      for (const def of defs) {
        try {
          const built = buildMonsterModel(def.visual, rng.fork(def.id), def.scale, { family: def.family, rank: 'boss' });
          const box = new THREE.Box3().setFromObject(built.root);
          const h = box.max.y - box.min.y;
          tallest = Math.max(tallest, h);
          lane(built.root, Math.max(1.8, (box.max.x - box.min.x) * 0.9 + 0.6));
        } catch {
          /* skip */
        }
      }
      for (const sub of this.subjects) sub.position.x -= x / 2;
      // Spinning hides how tall they stand next to each other: face front.
      this.lineup = true;
      const dist = Math.max(x * 0.95, tallest * 2.2) + 2;
      this.camera.position.set(0, tallest * 0.45, dist);
      this.camera.lookAt(0, tallest * 0.42, 0);
      return;
    } else {
      CLASSES.forEach((cls, i) => {
        try {
          // Each class in its field kit, standing in its stance.
          const hero = buildClassHero(cls.id);
          this.heroes.push(hero);
          place(hero.root, i, 1.15);
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
    for (let i = 0; i < this.subjects.length && !this.lineup; i++) {
      this.subjects[i]!.rotation.y = this.spin;
    }
    for (const h of this.heroes) h.animator.update(dt);
  }

  override dispose(): void {
    // Heroes first: they leave their shared, cached meshes alone.
    for (const h of this.heroes) h.dispose();
    for (const s of this.subjects) disposeObject(s);
    this.heroes = [];
    this.subjects = [];
  }
}
