/**
 * SLAY — the townsfolk living in the town: at their work, taking a break,
 * wandering where they would wander, and turning to the player.
 *
 * Each resident runs a small routine on the hero animator:
 *
 * - **work** (`Jobs.ts`): their trade, for a spell of fifteen seconds or so;
 *   some mix in a second loop (the sister's prayer, the smith eyeing the
 *   bar, the gravekeeper leaning on his broom).
 * - **move**: those who wander walk to the next place on their round (the
 *   captain's beat by the gate, Gilder's stagger round the fire, the
 *   surveyor's sightings, the vaultkeeper's pacing, the gravekeeper sweeping
 *   his way along the path). The legs walk from real ground motion
 *   (`HeroAnimator.follow`), so an upper-body loop goes on while they walk.
 * - **attend**: when the player comes near, their head turns to follow; in
 *   conversation they stop, turn to face the player, and talk with their
 *   hands. The Listener stays kneeling and only turns her head.
 *
 * Randomness is per resident, seeded, so a visit to town plays the same way.
 */
import * as THREE from 'three';
import { HeroAnimator } from '../hero/Animator';
import { Random } from '../../core/RNG';
import { buildFolk, type FolkModel, type NpcLookId } from './Folk';

/** Where a resident stands, and the round they walk if they walk one. */
export interface ResidentPlace {
  id: NpcLookId;
  x: number;
  z: number;
  /** Facing at home, radians (0 faces +Z, toward the camera). */
  facing: number;
  seed: number;
  /** Other places on their round: x, z and the facing to work in there. */
  route?: Array<[number, number, number]>;
  /** Walking speed, m/s. */
  pace?: number;
  /** The loop they carry while walking. */
  carry?: 'work' | 'rest';
  /** Never turns the body (kneels): attends with the head only. */
  stays?: boolean;
}

interface Collider {
  x: number;
  z: number;
  w: number;
  d: number;
  /** A resident walks; collision does not bucket them with the walls. */
  moves?: boolean;
}

type Mode = 'work' | 'work2' | 'rest' | 'move' | 'talk' | 'face';

interface Resident {
  place: ResidentPlace;
  folk: FolkModel;
  anim: HeroAnimator;
  rng: Random;
  collider: Collider;
  mode: Mode;
  timer: number;
  /** Index into the round (0 is home). */
  at: number;
  goal: THREE.Vector2;
  goalYaw: number;
  /** Look weight, 0..1, eased. */
  look: number;
  lookYaw: number;
  speed: number;
  /** Height of the top of the head (hat and hair included) over the head bone; measured once, on first ask. */
  crown?: number;
}

const _q = new THREE.Quaternion();
const _y = new THREE.Vector3(0, 1, 0);

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Turns `from` toward `to` by at most `step`, the short way round. */
function turnToward(from: number, to: number, step: number): number {
  const d = wrap(to - from);
  return from + Math.max(-step, Math.min(step, d));
}

const _v = new THREE.Vector3();
const _box = new THREE.Box3();

/**
 * How far the top of the model rises over `head` (world space), counting only
 * what sits round the head: a hat brim or hood counts, a staff held up beside
 * them does not. Skinned parts are measured in their current pose.
 */
function crownOver(root: THREE.Object3D, head: THREE.Vector3): number {
  const reach = 0.42;
  let top = head.y + 0.12;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry?.getAttribute('position')) return;
    const n = m.geometry.getAttribute('position').count;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
      for (let i = 0; i < n; i++) {
        m.getVertexPosition(i, _v);
        _v.applyMatrix4(m.matrixWorld);
        if (_v.y > top && Math.hypot(_v.x - head.x, _v.z - head.z) < reach) top = _v.y;
      }
      return;
    }
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    _box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    const cx = (_box.min.x + _box.max.x) / 2;
    const cz = (_box.min.z + _box.max.z) / 2;
    if (_box.max.y > top && Math.hypot(cx - head.x, cz - head.z) < reach) top = _box.max.y;
  });
  return top - head.y;
}

/** The town's people, built and placed, and their routines. */
export class Residents {
  private list: Resident[] = [];
  private player: THREE.Vector3 | null = null;
  private talking: string | null = null;
  private engaged: string | null = null;

  /** The ground's height under a point; the folk stand on it. */
  private ground: (x: number, z: number) => number;

  constructor(parent: THREE.Object3D, colliders: Collider[], places: ResidentPlace[], ground: (x: number, z: number) => number = () => 0) {
    this.ground = ground;
    for (const place of places) {
      try {
        this.list.push(this.make(parent, colliders, place));
      } catch {
        // A town with one fewer resident beats a town that fails to load.
      }
    }
  }

  private make(parent: THREE.Object3D, colliders: Collider[], place: ResidentPlace): Resident {
    const folk = buildFolk(place.id);
    folk.root.position.set(place.x, this.ground(place.x, place.z), place.z);
    folk.root.rotation.y = place.facing;
    folk.root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.receiveShadow = true;
      // Skinned parts ship unculled; a sphere round the root bone that
      // covers any pose (no part is further than ~2 m from it) culls safely.
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.4);
      m.frustumCulled = true;
    });
    parent.add(folk.root);
    const anim = new HeroAnimator(folk.bones);
    anim.setGrip(folk.grip);
    anim.follow(folk.root);
    const collider = { x: place.x, z: place.z, w: 0.8, d: 0.8, moves: true };
    colliders.push(collider);
    const rng = new Random(place.seed);
    const r: Resident = {
      place,
      folk,
      anim,
      rng,
      collider,
      mode: 'work',
      timer: rng.range(8, 20),
      at: 0,
      goal: new THREE.Vector2(place.x, place.z),
      goalYaw: place.facing,
      look: 0,
      lookYaw: 0,
      // Nobody keeps time with anybody else.
      speed: rng.range(0.88, 1.08),
    };
    // Settle into their stance (a staff swings upright over a second or so),
    // and start part way through their loop, so the town is not in step.
    anim.play(folk.loops.work, { fade: 0, speed: r.speed });
    for (let i = 0, n = 20 + rng.int(0, 40); i < n; i++) anim.update(1 / 10);
    return r;
  }

  /**
   * Tells the residents where the player is and who they are talking to.
   * `talking` is the resident in conversation; `engaged` one whose trade the
   * player is using (they face the player without gesturing).
   */
  attend(player: THREE.Vector3 | null, talking: string | null, engaged: string | null = null): void {
    this.player = player;
    this.talking = talking;
    this.engaged = engaged;
  }

  /** Where a resident stands now, or null if there is no such resident. */
  where(id: string): THREE.Vector3 | null {
    const r = this.list.find((x) => x.place.id === id);
    return r ? r.folk.root.position : null;
  }

  /**
   * The top of a resident's head now, hat included, in world space: the head
   * bone follows them as they walk, kneel and turn, and the height of what
   * sits on it is measured once. False if there is no such resident.
   */
  headTop(id: string, out: THREE.Vector3): boolean {
    const r = this.list.find((x) => x.place.id === id);
    const head = r?.folk.bones.head;
    if (!r || !head) return false;
    // Up the chain to the head only: the whole body below it is not needed,
    // and redoing every bone and mesh of it each frame was the town's
    // biggest source of garbage.
    head.updateWorldMatrix(true, false);
    out.setFromMatrixPosition(head.matrixWorld);
    r.crown ??= crownOver(r.folk.root, out);
    out.y += r.crown;
    return true;
  }

  /** Which way a resident faces now (radians), or 0. */
  facing(id: string): number {
    const r = this.list.find((x) => x.place.id === id);
    return r ? r.folk.root.rotation.y : 0;
  }

  update(dt: number): void {
    for (const r of this.list) {
      try {
        this.think(r, dt);
      } catch {
        /* one resident's trouble never stops the town */
      }
    }
  }

  private think(r: Resident, dt: number): void {
    const root = r.folk.root;
    const loops = r.folk.loops;
    const p = this.player;
    const dx = p ? p.x - root.position.x : 0;
    const dz = p ? p.z - root.position.z : 0;
    const dist = p ? Math.hypot(dx, dz) : Infinity;
    const toPlayer = Math.atan2(dx, dz);
    const id = r.place.id;
    const talking = this.talking === id;
    const engaged = talking || this.engaged === id;

    let want: string;
    if (engaged) {
      r.mode = talking ? 'talk' : 'face';
      want = talking ? loops.talk : loops.rest;
      if (!r.place.stays) r.goalYaw = toPlayer;
      r.goal.set(root.position.x, root.position.z);
      // When it ends, they go back to work after a moment.
      r.timer = r.rng.range(2, 4);
    } else {
      if (r.mode === 'talk' || r.mode === 'face') {
        // Back to where they were working, facing their work.
        r.mode = 'rest';
        r.goalYaw = r.at === 0 ? r.place.facing : r.place.route![r.at - 1]![2];
      }
      r.timer -= dt;
      if (r.mode === 'move') {
        // Someone in the way: wait for them to pass.
        const blocked = dist < 1.6;
        if (!blocked) {
          const gx = r.goal.x - root.position.x;
          const gz = r.goal.y - root.position.z;
          const left = Math.hypot(gx, gz);
          const heading = Math.atan2(gx, gz);
          if (left < 0.08) {
            r.mode = 'work';
            r.timer = r.rng.range(12, 24);
            const stop = r.at === 0 ? r.place.facing : r.place.route![r.at - 1]![2];
            r.goalYaw = stop;
          } else {
            // Turn first, then walk: nobody strides off sideways.
            r.goalYaw = heading;
            const facingErr = Math.abs(wrap(heading - root.rotation.y));
            const pace = (r.place.pace ?? 0.8) * Math.max(0, 1 - facingErr / 0.9);
            const step = Math.min(left, pace * dt);
            root.position.x += (gx / left) * step;
            root.position.z += (gz / left) * step;
            root.position.y = this.ground(root.position.x, root.position.z);
          }
        }
      } else if (r.timer <= 0) {
        this.next(r);
      }
      want = r.mode === 'move' ? (r.place.carry === 'work' ? loops.work : loops.rest) : r.mode === 'work2' && loops.work2 ? loops.work2 : r.mode === 'rest' ? loops.rest : loops.work;
    }

    // Turning. The Listener on her knees never turns; the smith's planted
    // loop gives way to his talk or rest loop before he turns.
    if (!r.place.stays) root.rotation.y = turnToward(root.rotation.y, r.goalYaw, 2.2 * dt);

    if (r.anim.clip !== want) r.anim.play(want, { fade: 0.5, speed: r.speed });
    r.anim.update(dt);

    // The head follows the player who comes near, as far as a neck turns.
    const rel = wrap(toPlayer - root.rotation.y);
    const near = engaged ? 1 : dist < 4.5 ? 1 : 0;
    const reachable = Math.abs(rel) < 1.9 ? 1 : 0;
    r.look += (near * reachable - r.look) * Math.min(1, dt * 2.5);
    r.lookYaw += (Math.max(-1.15, Math.min(1.15, rel)) - r.lookYaw) * Math.min(1, dt * 4);
    if (r.look > 0.01) {
      const a = r.lookYaw * r.look;
      const b = r.folk.bones;
      b.chest?.quaternion.multiply(_q.setFromAxisAngle(_y, a * 0.15));
      b.neck?.quaternion.multiply(_q.setFromAxisAngle(_y, a * 0.35));
      b.head?.quaternion.multiply(_q.setFromAxisAngle(_y, a * 0.5));
    }

    r.collider.x = root.position.x;
    r.collider.z = root.position.z;
  }

  /** Picks what a resident does next when a spell of work runs out. */
  private next(r: Resident): void {
    const route = r.place.route;
    const roll = r.rng.next();
    if (route && route.length && roll < 0.5) {
      r.at = (r.at + 1) % (route.length + 1);
      const to = r.at === 0 ? [r.place.x, r.place.z] : route[r.at - 1]!;
      r.goal.set(to[0]!, to[1]!);
      r.mode = 'move';
      r.timer = 30;
      return;
    }
    if (r.folk.loops.work2 && r.mode !== 'work2' && roll < 0.8) {
      r.mode = 'work2';
      r.timer = r.rng.range(6, 11);
      return;
    }
    if (r.mode !== 'rest' && roll > 0.9) {
      r.mode = 'rest';
      r.timer = r.rng.range(4, 8);
      return;
    }
    r.mode = 'work';
    r.timer = r.rng.range(12, 24);
  }
}

/** The fixed places in town residents stand by. */
export interface TownAnchors {
  forge: THREE.Vector3;
  wagon: THREE.Vector3;
  stash: THREE.Vector3;
  alchemy: THREE.Vector3;
  cairn: THREE.Vector3;
  /** Where the alchemist's customers stand, which Vell faces. */
  alchemist: THREE.Vector3;
}

/** Where each resident lives in town, and their rounds. */
export function townPlaces(a: TownAnchors): ResidentPlace[] {
  const vx = a.alchemy.x + 1.3;
  const vz = a.alchemy.z + 0.5;
  return [
    // Kale behind the anvil, facing out over it to the camp.
    { id: 'kale', x: a.forge.x + 1.2, z: a.forge.z + 1.12, facing: 0, seed: 101 },
    // Hesk by her wagon, keeping the books.
    { id: 'hesk', x: a.wagon.x - 1.2, z: a.wagon.z + 2.9, facing: -1.5, seed: 202 },
    // Corvane paces before his strongroom.
    {
      id: 'corvane', x: a.stash.x + 1.6, z: a.stash.z + 0.4, facing: 1.2, seed: 303,
      route: [[a.stash.x + 2.8, a.stash.z + 1.0, 1.6]], pace: 0.7, carry: 'rest',
    },
    // Old Marrow sweeps his way along the path by the cairn.
    {
      id: 'marrow', x: a.cairn.x - 1.3, z: a.cairn.z + 0.6, facing: -1.1, seed: 404,
      route: [[a.cairn.x - 2.4, a.cairn.z + 1.6, -1.4], [a.cairn.x - 0.4, a.cairn.z + 1.9, 0.4]], pace: 0.35, carry: 'work',
    },
    // Gilder staggers about the fire with his tankard.
    {
      id: 'gilder', x: -3.6, z: 4.4, facing: 0.6, seed: 505,
      route: [[-2.4, 5.4, 0.2], [-4.6, 5.8, 1.0]], pace: 0.55, carry: 'work',
    },
    // Wenna takes her sightings on the far side of the fire.
    {
      id: 'wenna', x: 3.4, z: 4.8, facing: -0.7, seed: 606,
      route: [[5.0, 3.6, -1.2], [4.2, 6.4, -0.3]], pace: 0.85, carry: 'rest',
    },
    // The Listener kneels before the gate, her back to it.
    { id: 'listener', x: -1.2, z: -14.6, facing: 0.15, seed: 707, stays: true },
    // Captain Renn keeps the gate.
    {
      id: 'renn', x: 2.0, z: -14.4, facing: -0.15, seed: 808,
      route: [[3.6, -15.4, -0.6], [2.6, -12.8, 0.3]], pace: 0.9, carry: 'rest',
    },
    // Sister Vell at her apothecary, facing her customers.
    { id: 'vell', x: vx, z: vz, facing: Math.atan2(a.alchemist.x - vx, a.alchemist.z - vz), seed: 909 },
  ];
}
