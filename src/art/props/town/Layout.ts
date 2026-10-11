/**
 * SLAY — the town, put together.
 *
 * A palisaded hamlet in a forest clearing. The fire is the centre; the
 * smithy, the merchant's shop, the strongroom, the apothecary and the cairn
 * stand round it where the services have always been; four timber houses
 * fill the arcs between them; the gatehouse closes the ring to the north
 * with the portal in its arch.
 *
 * `buildTownProps` draws every static piece into one batch (a few dozen
 * merged meshes for the whole town) and hands Town.ts what it needs to light
 * and animate it: lantern specs, smoke points, swaying cloth, colliders that
 * match what is drawn, and the portal. Ground's terrain and lights stay in
 * Town.ts.
 */
import * as THREE from 'three';
import type { Rng } from '../../../types';
import { buildPortal, type WayLook } from '../Ways';
import { apothecary, house, shop, smithy, strongroom, type Built } from './Houses';
import { TM, TownBatch, Site, type Collider, type LanternSpec, type SwayItem } from './TownKit';
import { cloth as clothGeo } from '../Kit';
import {
  bale, bench, cairn, dummy, fireRing, gatehouse, lanternPost, palisade, peltRack, pine, sackAt,
  washLine, watchTower, weaponRack, well, woodpile,
} from './Works';

/** Where Town.ts keeps its services. */
export interface TownSites {
  forge: THREE.Vector3;
  vendor: THREE.Vector3;
  stash: THREE.Vector3;
  alchemy: THREE.Vector3;
  cairn: THREE.Vector3;
  gate: THREE.Vector3;
  /** Lantern posts: x, z, and whether the lantern is a real light. */
  posts: Array<[number, number, boolean]>;
  /** The palisade's radius and its gate mouth. */
  R: number;
  gap: (x: number, z: number) => boolean;
}

export interface TownProps {
  root: THREE.Group;
  colliders: Collider[];
  lanterns: LanternSpec[];
  /** One per post, in `sites.posts` order. */
  postLanterns: LanternSpec[];
  smoke: THREE.Vector3[];
  sway: SwayItem[];
  /** The smithy's coals and the lantern on its corner post. */
  forgeLight: THREE.Vector3;
  forgeLantern: THREE.Vector3;
  portal: WayLook;
  update(dt: number): void;
  dispose(): void;
}

/** Yaw that turns a building at (x, z) to face the fire. */
function facing(x: number, z: number): number {
  return Math.atan2(-x, -z);
}

export function buildTownProps(rng: Rng, sites: TownSites): TownProps {
  const batch = new TownBatch();
  const root = new THREE.Group();
  root.name = 'town:props';
  const lanterns: LanternSpec[] = [];
  const smoke: THREE.Vector3[] = [];
  const sway: SwayItem[] = [];
  const owned: Array<THREE.BufferGeometry | THREE.Material> = [];
  const take = (b: Built): void => {
    lanterns.push(...b.lanterns);
    smoke.push(...b.smoke);
  };
  const r = (k: string): Rng => rng.fork(k);

  // --- the services -----------------------------------------------------
  const forge = smithy(new Site(batch, sites.forge.x, sites.forge.z, 0), r('smithy'));
  take(forge);
  // The shop faces south: the camera looks in from the south-east, so a
  // counter on any other side would hide the merchant under his own awning.
  take(shop(new Site(batch, sites.vendor.x - 0.4, sites.vendor.z - 0.6, 0), r('shop')));
  take(strongroom(new Site(batch, sites.stash.x - 1.5, sites.stash.z - 0.5, Math.PI / 2), r('strongroom')));
  // The stash chest out front, where the vault keeper stands.
  batch.template('chestVault', 0, sites.stash.x + 0.7, sites.stash.z - 1.6, Math.PI / 2, 1);
  batch.solid(sites.stash.x + 0.7, sites.stash.z - 1.6, 0.75, 1.15);
  const glass = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, name: 'town:bottles' });
  owned.push(glass);
  take(apothecary(new Site(batch, sites.alchemy.x, sites.alchemy.z - 0.8, 0), r('apothecary'), glass));
  {
    const c = cairn(new Site(batch, sites.cairn.x, sites.cairn.z, 0), r('cairn'));
    lanterns.push(...c.lanterns);
    sway.push(...c.sway);
    owned.push(...c.owned);
  }
  const gate = gatehouse(new Site(batch, sites.gate.x, sites.gate.z, 0), r('gate'));
  lanterns.push(...gate.lanterns);
  for (const s of [-1, 1]) lanterns.push(watchTower(new Site(batch, s * 9.2, -17.4, 0), r(`tower${s}`), 1));

  // --- the houses -------------------------------------------------------
  const homes: Array<{ x: number; z: number; ry?: number; w: number; d: number; roof: 'thatch' | 'slate'; chimney: -1 | 1; lit: number }> = [
    { x: -11, z: 13, w: 5.2, d: 3.8, roof: 'thatch', chimney: -1, lit: 0.6 },
    { x: 11, z: 13, w: 5.0, d: 3.6, roof: 'thatch', chimney: 1, lit: 0.5 },
    { x: 17.9, z: -5.0, ry: -Math.PI / 2, w: 4.4, d: 3.2, roof: 'thatch', chimney: -1, lit: 0.5 },
    { x: 12.8, z: -13.6, w: 4.4, d: 3.2, roof: 'slate', chimney: 1, lit: 0.4 },
  ];
  const houseSites: Site[] = [];
  homes.forEach((h, i) => {
    const site = new Site(batch, h.x, h.z, h.ry ?? facing(h.x, h.z));
    const b = house(site, r(`house${i}`), { w: h.w, d: h.d, roof: h.roof, chimney: h.chimney, lit: h.lit, lantern: i < 2 });
    take(b);
    houseSites.push(site);
    // A bench by the door, on the side away from the lantern.
    bench(site, r(`bench${i}`), b.door + (b.door > 0 ? -1.5 : 1.5), h.d / 2 + 0.95, 0);
  });
  // Woodpiles against the gable ends, stores by the walls.
  woodpile(houseSites[0]!, r('wood0'), 5.2 / 2 + 0.75, -0.3, Math.PI / 2, 4);
  woodpile(houseSites[1]!, r('wood1'), -5.0 / 2 - 0.75, 0.2, Math.PI / 2, 3);
  houseSites[1]!.template('crate', 2, 5.0 / 2 + 0.7, 0.6, 0.3, 1).solid(5.0 / 2 + 0.7, 0.6, 0.9, 0.9, 0.3);
  houseSites[1]!.template('barrel', 0, 5.0 / 2 + 0.6, -0.6, 0, 1).solid(5.0 / 2 + 0.6, -0.6, 0.7, 0.7);
  houseSites[2]!.template('barrel', 2, 4.4 / 2 + 0.6, 0.9, 0, 0.95).solid(4.4 / 2 + 0.6, 0.9, 0.7, 0.7);
  houseSites[3]!.template('crate', 0, -4.4 / 2 - 0.7, 0.5, -0.2, 1).solid(-4.4 / 2 - 0.7, 0.5, 0.9, 0.9, -0.2);
  woodpile(new Site(batch, sites.forge.x, sites.forge.z), r('wood2'), -3.95, -1.6, Math.PI / 2, 4);

  // --- the yard ---------------------------------------------------------
  const yard = new Site(batch, 0, 0);
  fireRing(yard, r('fire'));
  well(new Site(batch, 8.5, -1.5, 0.4), r('well'));
  // The practice ground on the south approach.
  dummy(yard, r('d0'), -4.4, 12.0, 0.12);
  dummy(yard, r('d1'), -1.0, 13.6, -0.08);
  dummy(yard, r('d2'), 2.6, 12.4, 0.16);
  bale(yard, r('b0'), 5.6, 14.8, 0.3);
  bale(yard, r('b1'), 6.6, 13.5, -0.2);
  weaponRack(yard, r('wr0'), 3.0, 17.0, 0.15);
  weaponRack(yard, r('wr1'), -3.0, 17.4, -0.15);
  sackAt(yard, r('s0'), -6.5, 17.2, 1.1);
  sackAt(yard, r('s1'), -6.0, 17.7, 0.9);
  {
    const w = washLine(yard, r('wash'), -6.6, 16.0, -9.0, 18.2, 4);
    sway.push(w.sway);
    owned.push(w.owned);
  }
  {
    const p = peltRack(yard, r('pelts'), -17.6, -8.5, Math.PI / 2);
    sway.push(p.sway);
    owned.push(p.owned);
  }
  yard.template('cart', 1, -15.8, 11.0, 0.9, 1);
  yard.solid(-15.8, 11.0, 1.4, 1.1, 0.9);
  // Standards flanking the fire, catching the updraught.
  for (const s of [-1, 1]) {
    const px = s * 5.6;
    const pz = -2.4;
    yard.box(TM.timber(), 0.1, 4.4, 0.1, { x: px, z: pz }, 0.85, 0.01);
    yard.box(TM.timber(), 1.1, 0.07, 0.07, { x: px, y: 4.1, z: pz, ry: s * 0.4 }, 0.85, 0.01);
    yard.solid(px, pz, 0.1, 0.1);
    const g = clothGeo(0.9, 2.2, rng, { segsX: 5, segsY: 9, ripple: 0.06, flare: 0.2, tatter: 0.15 });
    const banner = new THREE.Mesh(g, TM.banner());
    banner.position.set(px, 4.1, pz);
    banner.rotation.y = s * 0.4;
    banner.castShadow = true;
    sway.push({ obj: banner, phase: s * 3, amp: 0.09, axis: 'x' });
  }
  // Lantern posts on the ring road.
  const postLanterns = sites.posts.map(([x, z, lit], i) => lanternPost(new Site(batch, x, z, 0), r(`post${i}`), lit));

  // --- the ring and the trees -------------------------------------------
  const built = [...batch.colliders];
  lanterns.push(...palisade(batch, r('palisade'), { R: sites.R, gap: sites.gap, avoid: built }));
  const prng = r('forest');
  for (let i = 0; i < 54; i++) {
    const a = (i / 54) * Math.PI * 2 + prng.range(-0.05, 0.05);
    const d = prng.range(26, 44);
    pine(new Site(batch, Math.cos(a) * d, Math.sin(a) * d, prng.range(0, 6.3)), prng, prng.range(7, 13));
  }
  // Stumps and ferns inside the stakes, where the clearing was cut.
  const free = (x: number, z: number, pad: number): boolean =>
    !sites.gap(x, z) && !batch.colliders.some((c) => Math.abs(c.x - x) < c.w / 2 + pad && Math.abs(c.z - z) < c.d / 2 + pad);
  for (let i = 0, placed = 0; i < 40 && placed < 7; i++) {
    const a = prng.range(0, Math.PI * 2);
    const d = prng.range(17, 20.5);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (z < -14 && Math.abs(x) < 8) continue;
    if (!free(x, z, 1.0)) continue;
    yard.template('stump', placed % 3, x, z, prng.range(0, 6.3), prng.range(0.9, 1.2));
    yard.solid(x, z, 0.75, 0.75);
    placed++;
  }
  for (let i = 0, placed = 0; i < 60 && placed < 14; i++) {
    const a = prng.range(0, Math.PI * 2);
    const d = prng.range(19.6, 21.2);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (!free(x, z, 0.4)) continue;
    yard.template('fern', placed % 3, x, z, prng.range(0, 6.3), prng.range(0.8, 1.3));
    placed++;
  }

  // --- the portal -------------------------------------------------------
  const portal = buildPortal(0xa84cff, { width: 2.6, height: 3.6, light: [28, 24], billboard: false });
  portal.root.position.copy(gate.portal);
  root.add(portal.root);

  // Swaying cloth hangs under the root too.
  for (const s of sway) root.add(s.obj);
  for (const s of sway) {
    const m = s.obj as THREE.Mesh;
    if (m.geometry && !owned.includes(m.geometry)) owned.push(m.geometry);
  }
  const merged = batch.flush(root);
  owned.push(...merged);

  return {
    root,
    colliders: batch.colliders,
    lanterns,
    postLanterns,
    smoke,
    sway,
    forgeLight: forge.forgeLight,
    forgeLantern: forge.lantern,
    portal,
    update(dt: number): void {
      portal.update(dt);
    },
    dispose(): void {
      portal.dispose();
      root.removeFromParent();
      for (const o of owned) o.dispose();
      owned.length = 0;
      root.clear();
    },
  };
}
