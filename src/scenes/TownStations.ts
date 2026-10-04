/**
 * SLAY — the camp stations Legacy unlocks: the gambler's table, the
 * enchanter's lectern and the bounty board.
 *
 * Each is drawn from the moment the camp is built, so a new player can see
 * what Renown is for; until its rank is reached, using it says what it takes.
 * `TownScene` calls `mountTownStations` once in `enter` and runs the returned
 * cleanup in `dispose`. Nothing here touches the town's own build.
 */

import * as THREE from 'three';
import { events, toast } from '../core/Events';
import { save } from '../core/Save';
import { LEGACY_UNLOCKS, hasUnlock } from '../sim/Legacy';
import { surface } from '../art/Materials';

/** Same shape as TownScene's interaction points. */
export interface StationSpot {
  id: string;
  label: string;
  panel: string;
  pos: THREE.Vector3;
  radius: number;
}

interface StationDef {
  /** The Legacy unlock id and the panel it opens. */
  id: 'gambler' | 'enchanter' | 'bounties';
  label: string;
  at: [number, number];
  facing: number;
  build: (g: THREE.Group, own: Own) => void;
}

/** Geometries and materials this module made and must free. */
interface Own {
  geo: THREE.BufferGeometry[];
  mat: THREE.Material[];
}

export const STATIONS: StationDef[] = [
  { id: 'gambler', label: 'The Gambler — Sealed Goods', at: [16.4, 1.0], facing: -Math.PI / 2, build: buildTable },
  { id: 'enchanter', label: 'The Enchanter — Reforge & Imbue', at: [-17.0, 2.0], facing: Math.PI / 2, build: buildLectern },
  { id: 'bounties', label: 'Bounty Board — Contracts & Rewards', at: [5.0, -10.5], facing: 0, build: buildBoard },
];

/** Spots open this; the listener below decides between the panel and a refusal. */
const STATION_PREFIX = 'station-open:';

function mesh(g: THREE.Group, own: Own, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  own.geo.push(geo);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function glow(own: Own, color: number, intensity: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
  own.mat.push(m);
  return m;
}

function plain(own: Own, color: number, roughness = 0.85, metalness = 0): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  own.mat.push(m);
  return m;
}

/** A low card table: felt top, four legs, a lantern, dice and a stack of sealed parcels. */
function buildTable(g: THREE.Group, own: Own): void {
  const wood = surface('wood.oak');
  const felt = plain(own, 0x1d4a2c, 0.95);
  const wax = plain(own, 0x8a1c1c, 0.5);
  const paper = plain(own, 0xb9a57a, 0.9);
  mesh(g, own, new THREE.BoxGeometry(1.8, 0.08, 1.0), wood, 0, 0.82, 0);
  mesh(g, own, new THREE.BoxGeometry(1.62, 0.02, 0.84), felt, 0, 0.87, 0);
  for (const [x, z] of [[-0.8, -0.42], [0.8, -0.42], [-0.8, 0.42], [0.8, 0.42]] as const) {
    mesh(g, own, new THREE.CylinderGeometry(0.05, 0.06, 0.8, 6), wood, x, 0.4, z);
  }
  // Sealed parcels, each with a wax blob.
  for (let i = 0; i < 4; i++) {
    const p = mesh(g, own, new THREE.BoxGeometry(0.28, 0.16, 0.22), paper, -0.5 + i * 0.22, 0.96 + (i % 2) * 0.16, -0.18 - (i % 2) * 0.02);
    p.rotation.y = (i - 1.5) * 0.25;
    mesh(g, own, new THREE.SphereGeometry(0.035, 6, 4), wax, p.position.x, p.position.y + 0.09, p.position.z);
  }
  const bone = plain(own, 0xe8dcc0, 0.6);
  for (let i = 0; i < 2; i++) {
    const d = mesh(g, own, new THREE.BoxGeometry(0.07, 0.07, 0.07), bone, 0.3 + i * 0.12, 0.915, 0.18);
    d.rotation.set(0.4 * i, 0.7 + i, 0.2);
  }
  // A hooded lantern on the corner, the table's own light.
  mesh(g, own, new THREE.CylinderGeometry(0.09, 0.11, 0.22, 8), glow(own, 0xffb24a, 2.4), 0.7, 1.0, 0.3);
  mesh(g, own, new THREE.ConeGeometry(0.13, 0.12, 8), surface('metal.iron'), 0.7, 1.17, 0.3);
}

/** A stone lectern with an open book and a ring of floating runes. */
function buildLectern(g: THREE.Group, own: Own): void {
  const stone = plain(own, 0x5a5560, 0.9);
  const page = plain(own, 0xe2d6b6, 0.9);
  const cover = plain(own, 0x3a1f4a, 0.7);
  const rune = glow(own, 0xb070ff, 2.6);
  mesh(g, own, new THREE.CylinderGeometry(0.42, 0.5, 0.18, 8), stone, 0, 0.09, 0);
  mesh(g, own, new THREE.CylinderGeometry(0.16, 0.22, 0.95, 8), stone, 0, 0.62, 0);
  const top = mesh(g, own, new THREE.BoxGeometry(0.7, 0.08, 0.5), stone, 0, 1.12, 0);
  top.rotation.x = -0.35;
  const book = mesh(g, own, new THREE.BoxGeometry(0.56, 0.04, 0.38), cover, 0, 1.18, 0.02);
  book.rotation.x = -0.35;
  for (const s of [-1, 1]) {
    const leaf = mesh(g, own, new THREE.BoxGeometry(0.25, 0.02, 0.34), page, s * 0.13, 1.215, 0.01);
    leaf.rotation.set(-0.35, 0, s * 0.08);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const r = mesh(g, own, new THREE.TorusGeometry(0.07, 0.015, 4, 10), rune, Math.cos(a) * 0.6, 1.45 + (i % 2) * 0.12, Math.sin(a) * 0.6);
    r.castShadow = false;
    r.rotation.set(Math.PI / 2, 0, a);
    r.userData.spin = a;
  }
}

/** Two posts, a plank board, and notices nailed to it. */
function buildBoard(g: THREE.Group, own: Own): void {
  const wood = surface('wood.oak');
  const iron = surface('metal.iron');
  const notice = plain(own, 0xcdbb8c, 0.95);
  const red = plain(own, 0x8a1c1c, 0.6);
  for (const x of [-0.85, 0.85]) mesh(g, own, new THREE.BoxGeometry(0.14, 2.3, 0.14), wood, x, 1.15, 0);
  mesh(g, own, new THREE.BoxGeometry(1.9, 1.15, 0.08), wood, 0, 1.45, 0.04);
  mesh(g, own, new THREE.BoxGeometry(2.1, 0.12, 0.3), wood, 0, 2.12, 0.04);
  const spots: Array<[number, number, number]> = [[-0.55, 1.65, 0.1], [0.05, 1.55, -0.06], [0.58, 1.68, 0.08], [-0.3, 1.18, -0.1], [0.4, 1.2, 0.05]];
  for (const [x, y, rot] of spots) {
    const n = mesh(g, own, new THREE.PlaneGeometry(0.42, 0.5), notice, x, y, 0.085);
    n.rotation.z = rot;
    n.castShadow = false;
    mesh(g, own, new THREE.SphereGeometry(0.025, 5, 3), iron, x, y + 0.2, 0.095);
    mesh(g, own, new THREE.SphereGeometry(0.03, 5, 3), red, x + 0.1, y - 0.15, 0.09);
  }
}

/**
 * Builds the stations into the scene, adds their colliders to the town's and
 * their interaction points to `spots`. Returns the cleanup.
 */
export function mountTownStations(
  scene: THREE.Scene,
  colliders: Array<{ x: number; z: number; w: number; d: number }>,
  spots: StationSpot[],
): () => void {
  const own: Own = { geo: [], mat: [] };
  const root = new THREE.Group();
  root.name = 'townStations';
  const spinners: THREE.Object3D[] = [];
  for (const s of STATIONS) {
    const g = new THREE.Group();
    s.build(g, own);
    g.position.set(s.at[0], 0, s.at[1]);
    g.rotation.y = s.facing;
    root.add(g);
    g.traverse((o) => {
      if (o.userData.spin !== undefined) spinners.push(o);
    });
    colliders.push({ x: s.at[0], z: s.at[1], w: 1.4, d: 1.4 });
    // Stand in front of it: the side it faces.
    const front = new THREE.Vector3(Math.sin(s.facing), 0, Math.cos(s.facing)).multiplyScalar(1.4);
    const pos = new THREE.Vector3(s.at[0], 0, s.at[1]).add(front);
    const unlocked = hasUnlock(save.account, s.id);
    const u = LEGACY_UNLOCKS.find((x) => x.id === s.id);
    spots.push({
      id: `station:${s.id}`,
      label: unlocked ? s.label : `${s.label.split(' — ')[0]} — Renown rank ${u?.rank ?? '?'}`,
      panel: `${STATION_PREFIX}${s.id}`,
      pos,
      radius: 2.2,
    });
  }
  scene.add(root);

  // Checked on use, not on arrival: a bounty paid here can cross a rank.
  const off = events.on('ui:open', (p) => {
    if (!p.panel?.startsWith(STATION_PREFIX)) return;
    const id = p.panel.slice(STATION_PREFIX.length);
    if (hasUnlock(save.account, id)) {
      events.emit('ui:open', { panel: id });
      return;
    }
    const u = LEGACY_UNLOCKS.find((x) => x.id === id);
    if (u) toast(`${u.name} opens at Renown rank ${u.rank}. ${u.desc}`, 'info');
  });

  // The enchanter's runes turn slowly. Cheap: six objects, one callback.
  let raf = 0;
  let last = 0;
  const tick = (t: number) => {
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    for (const o of spinners) o.rotation.z += dt * 0.8;
    raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(tick) : 0;
  };
  if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);

  return () => {
    off();
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    root.removeFromParent();
    for (const g of own.geo) g.dispose();
    for (const m of own.mat) m.dispose();
  };
}
