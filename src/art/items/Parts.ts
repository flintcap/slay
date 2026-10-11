/**
 * SLAY — collecting an item's parts and turning them into meshes.
 *
 * Builders add geometry to named slots ('main', 'trim', 'second'...). When
 * the item is done, every slot is merged into one mesh with the slot's
 * material, so a sword with forty parts is still three or four draw calls.
 *
 * Builders also leave anchors: where the business end runs, where the head
 * sits, which surface points can carry a decoration. `Features.ts` reads
 * them to put flames on a blade or horns on a helm without knowing which
 * builder made it.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ItemLook } from '../ItemLook';
import { crystalMat, gemMat, ghostMat, glowMat, glassMat, itemSurface, liquidMat, stringMat } from './Mats';
import { clean, xf, type V3, type Xf } from './Geo';

export type Slot =
  | 'main' // blade, head, plates, body
  | 'second' // grip wraps, straps, linings
  | 'wood' // hafts, shafts, stocks
  | 'trim' // fittings, guards, rivets, settings
  | 'cloth'
  | 'dark' // blackened iron: bands, nails, hinges
  | 'bone'
  | 'gold'
  | 'gem'
  | 'glow'
  | 'crystal'
  | 'ghost'
  | 'string'
  | 'blood'
  | 'glass'
  | 'liquid'
  | 'leaf';

/** A point a decoration can sit on: position, outward normal, scale. */
export interface Hardpoint {
  p: V3;
  n: V3;
  s: number;
}

export interface Anchors {
  /** The business end: from `a` to `b`, `r` wide (blade, head, shaft top). */
  axis?: { a: V3; b: V3; r: number };
  /** The head or crown: centre and radius. */
  head?: { p: V3; r: number };
  /** Where a hand holds it. */
  grip?: { a: V3; b: V3 };
  /** Points on the surface for studs, eyes, thorns, arrows. */
  points: Hardpoint[];
  /** A place for an emblem: centre, facing, size. */
  face?: Hardpoint;
}

export class Parts {
  private readonly slots = new Map<Slot, THREE.BufferGeometry[]>();
  readonly anchors: Anchors = { points: [] };

  constructor(readonly look: ItemLook) {}

  /** Adds a geometry to a slot, optionally transformed. Returns it. */
  add(slot: Slot, geo: THREE.BufferGeometry, t?: Xf | THREE.Matrix4): THREE.BufferGeometry {
    if (t) xf(geo, t);
    let list = this.slots.get(slot);
    if (!list) {
      list = [];
      this.slots.set(slot, list);
    }
    list.push(clean(geo));
    return geo;
  }

  addAll(slot: Slot, geos: THREE.BufferGeometry[]): void {
    for (const g of geos) this.add(slot, g);
  }

  point(p: V3, n: V3, s: number): void {
    this.anchors.points.push({ p, n: n.clone().normalize(), s });
  }

  has(slot: Slot): boolean {
    return (this.slots.get(slot)?.length ?? 0) > 0;
  }

  /** The material a slot draws with, from the look. */
  material(slot: Slot): THREE.Material {
    const L = this.look;
    const wear = L.wear;
    switch (slot) {
      case 'main':
        if (L.material === 'crystal') return crystalMat(L.colors.main, L.glowColor, 0.35 + L.glow * 0.25);
        return itemSurface(L.keys.main, { wear });
      case 'second':
        return itemSurface(L.keys.second, { wear: Math.min(1, wear + 0.15) });
      case 'wood':
        return itemSurface(L.keys.wood, { wear });
      case 'trim':
        return itemSurface(L.keys.trim, { wear: wear * 0.6, tint: L.trimTint });
      case 'cloth':
        return itemSurface(L.keys.cloth, { wear });
      case 'dark':
        return itemSurface('metal.dark', { wear: Math.max(0.5, wear) });
      case 'bone':
        return itemSurface('bone.pale', { wear });
      case 'gold':
        return itemSurface('metal.gold', { wear: wear * 0.5 });
      case 'gem':
        return gemMat(L.stone, 0.3 + L.glow * 0.2);
      case 'glow':
        return glowMat(L.glowColor, Math.max(1.2, 0.9 + L.glow * 0.7));
      case 'crystal':
        return crystalMat(L.glowColor, L.glowColor, 0.5 + L.glow * 0.25);
      case 'ghost':
        return ghostMat(L.glowColor, 0.42);
      case 'string':
        return stringMat();
      case 'blood':
        return itemSurface('flesh.demonic|0x4a0c0a', { roughness: 0.25, emissiveIntensity: 0, emissive: 0x000000 });
      case 'glass':
        return glassMat();
      case 'liquid':
        return liquidMat(L.glowColor);
      case 'leaf':
        return itemSurface('cloth.silk|0x3a6a2a', { wear: 0.3 });
    }
  }

  /** Merges every slot into one mesh and returns the group. */
  build(name: string): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    for (const [slot, geos] of this.slots) {
      if (!geos.length) continue;
      const parts = geos.filter((x) => (x.getAttribute('position') as THREE.BufferAttribute).count > 0);
      if (!parts.length) continue;
      // Merging needs every part indexed or every part not.
      const anyFlat = parts.some((x) => !x.index);
      const ready = anyFlat ? parts.map((x) => (x.index ? x.toNonIndexed() : x)) : parts;
      const geo = ready.length === 1 ? ready[0]! : mergeGeometries(ready, false);
      if (!geo) continue;
      for (const x of geos) if (x !== geo) x.dispose();
      if (anyFlat) for (const x of ready) if (x !== geo) x.dispose();
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const mat = this.material(slot);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `item-${slot}`;
      mesh.castShadow = slot !== 'ghost' && slot !== 'glow' && slot !== 'glass';
      mesh.receiveShadow = slot !== 'ghost';
      if (slot === 'ghost' || slot === 'glass') mesh.renderOrder = 2;
      g.add(mesh);
    }
    this.slots.clear();
    return g;
  }
}
