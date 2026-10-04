/**
 * Pose sheet: real models, real animator, frozen at chosen moments and laid
 * out side by side. Opened by `tools/shot-poses.mjs`; loads in a few seconds
 * because it skips the game's boot entirely.
 *
 *   /tools/pose-sheet.html?set=gait
 *
 * A number can be right and a pose still look wrong. This is for looking.
 */
import * as THREE from 'three';
import { buildPlayerModel, attachToSocket, weaponGrip, carryGrip } from '../src/art/CharacterModels';
import { buildItemModel } from '../src/art/ItemModels';
import { Animator } from '../src/art/Animation';
import { ITEM_BASES } from '../src/data/itemBases';
import { Random } from '../src/core/RNG';
import type { CharClassId } from '../src/types';

type View = 'side' | 'front' | 'threeQuarter' | 'back';

interface Tile {
  label: string;
  view: View;
  /** Builds and poses a character under `mover`; returns the animator. */
  run(mover: THREE.Group): void;
}

const DT = 1 / 60;

function character(cls: CharClassId, mover: THREE.Group, weapon?: string): { anim: Animator; root: THREE.Object3D } {
  const rng = new Random(0x5e7);
  const built = buildPlayerModel(cls, rng, weapon ? ['mainHand'] : []);
  mover.add(built.root);
  const anim = new Animator(built.bones);
  anim.follow(mover);
  if (weapon) {
    const base = ITEM_BASES.find((b) => b.id === weapon);
    if (base) {
      const two = base.slot === 'twoHand';
      const mesh = buildItemModel(base.visual ?? { shape: 'auto', palette: 'metal.steel' }, rng, 'rare');
      attachToSocket(built.root, built.bones, 'mainHand', mesh, undefined, weaponGrip(base.category, two));
      anim.setGrip(carryGrip(base.category, two));
    }
  }
  return { anim, root: built.root };
}

/** Moves `mover` the way Player does and drives the animator like Player. */
function drive(
  anim: Animator,
  mover: THREE.Group,
  seconds: number,
  speed: number,
  turn = 0,
  stopWhen?: () => boolean,
): void {
  const vel = new THREE.Vector2(Math.sin(mover.rotation.y) * speed, Math.cos(mover.rotation.y) * speed);
  let heading = mover.rotation.y;
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames + 600; i++) {
    if (i >= frames && (!stopWhen || stopWhen())) break;
    heading += turn * DT;
    const wx = Math.sin(heading) * speed;
    const wz = Math.cos(heading) * speed;
    if (speed > 0) {
      vel.x += (wx - vel.x) * Math.min(1, DT * 14);
      vel.y += (wz - vel.y) * Math.min(1, DT * 14);
    } else {
      vel.multiplyScalar(Math.max(0, 1 - DT * 18));
    }
    mover.position.x += vel.x * DT;
    mover.position.z += vel.y * DT;
    let d = heading - mover.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    mover.rotation.y += d * Math.min(1, DT * 16);
    const v = vel.length();
    if (v > 0.4) anim.play(v > 4.6 * 0.65 ? 'run' : 'walk', { fade: 0.14, speed: v / 4.6 });
    else anim.play('idle', { fade: 0.2 });
    anim.update(DT);
  }
}

/** Runs until the gait clock reaches `phase` (within a frame). */
function atPhase(anim: Animator, phase: number): () => boolean {
  let last = -1;
  return () => {
    const p = (anim as unknown as { phase: number }).phase;
    const hit = last >= 0 && ((last <= phase && p >= phase) || (last > p && (phase >= last || phase <= p)));
    last = p;
    return hit;
  };
}

function gaitTile(label: string, cls: CharClassId, speed: number, phase: number, view: View = 'side', weapon?: string): Tile {
  return {
    label,
    view,
    run(mover) {
      mover.rotation.y = Math.PI / 2;
      const { anim } = character(cls, mover, weapon);
      drive(anim, mover, 2.2, speed, 0, atPhase(anim, phase));
    },
  };
}

const SETS: Record<string, Tile[]> = {
  gait: [
    gaitTile('walk 1.4 m/s  0.00', 'warden', 1.4, 0.0),
    gaitTile('walk  0.25', 'warden', 1.4, 0.25),
    gaitTile('walk  0.50', 'warden', 1.4, 0.5),
    gaitTile('walk  0.75', 'warden', 1.4, 0.75),
    gaitTile('run 4.6 m/s  0.00', 'warden', 4.6, 0.0),
    gaitTile('run  0.17', 'warden', 4.6, 0.17),
    gaitTile('run  0.33', 'warden', 4.6, 0.33),
    gaitTile('run  0.50', 'warden', 4.6, 0.5),
    gaitTile('run  0.67', 'warden', 4.6, 0.67),
    gaitTile('run  0.83', 'warden', 4.6, 0.83),
    gaitTile('sprint 7 m/s  0.10', 'shadowblade', 7, 0.1),
    gaitTile('sprint  0.60', 'shadowblade', 7, 0.6),
    gaitTile('run, front', 'ranger', 4.6, 0.3, 'front', 'bow.short'),
    gaitTile('run, 3/4, greatsword', 'warden', 4.6, 0.55, 'threeQuarter', 'sword.great'),
    {
      label: 'banked left turn, back',
      view: 'back',
      run(mover) {
        const { anim } = character('stormcaller', mover);
        drive(anim, mover, 1.5, 4.6, 0);
        drive(anim, mover, 0.45, 4.6, 3.2);
      },
    },
    {
      label: 'hard stop',
      view: 'side',
      run(mover) {
        mover.rotation.y = Math.PI / 2;
        const { anim } = character('warden', mover, 'sword.short');
        drive(anim, mover, 1.5, 4.6, 0);
        drive(anim, mover, 0.12, 0, 0);
      },
    },
    {
      label: 'stopped, settled',
      view: 'threeQuarter',
      run(mover) {
        const { anim } = character('pyromancer', mover, 'staff.short');
        drive(anim, mover, 1.5, 4.6, 0);
        drive(anim, mover, 1.6, 0, 0);
      },
    },
    {
      label: 'turn in place',
      view: 'front',
      run(mover) {
        const { anim } = character('revenant', mover);
        drive(anim, mover, 0.6, 0, 0);
        drive(anim, mover, 0.25, 0, 5);
      },
    },
  ],
};

// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
const tiles = SETS[params.get('set') ?? 'gait'] ?? SETS.gait;
const cols = Number(params.get('cols') ?? 6);
const tileW = Number(params.get('w') ?? 300);
const tileH = Number(params.get('h') ?? 360);
const rows = Math.ceil(tiles.length / cols);

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(cols * tileW, rows * tileH);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setScissorTest(true);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x24262c);
scene.add(new THREE.HemisphereLight(0xcfd6e6, 0x3a3226, 1.3));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.position.set(6, 12, 8);
scene.add(sun);

const labels = document.getElementById('labels')!;
const SPACING = 60;

tiles.forEach((tile, i) => {
  const cell = new THREE.Group();
  cell.position.set((i % cols) * SPACING, 0, Math.floor(i / cols) * SPACING);
  scene.add(cell);
  const mover = new THREE.Group();
  cell.add(mover);
  tile.run(mover);
  cell.updateMatrixWorld(true);

  // A floor with a fine grid under every character, so contact can be judged.
  const floorAt = new THREE.Vector3();
  mover.getWorldPosition(floorAt);
  const grid = new THREE.GridHelper(4, 40, 0x6a6f7a, 0x3c4048);
  grid.position.set(floorAt.x, 0.001, floorAt.z);
  scene.add(grid);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ color: 0x30333a }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(floorAt.x, 0, floorAt.z);
  scene.add(floor);

  const yaw = mover.rotation.y;
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const left = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const dir =
    tile.view === 'side'
      ? left.clone()
      : tile.view === 'front'
        ? fwd.clone()
        : tile.view === 'back'
          ? fwd.clone().negate()
          : fwd.clone().add(left).normalize();
  const cam = new THREE.PerspectiveCamera(30, tileW / tileH, 0.1, 100);
  const target = floorAt.clone().add(new THREE.Vector3(0, 0.95, 0));
  cam.position.copy(target).addScaledVector(dir, 4.6).add(new THREE.Vector3(0, 0.35, 0));
  cam.lookAt(target);
  (tile as Tile & { cam?: THREE.Camera }).cam = cam;

  const x = (i % cols) * tileW;
  const y = Math.floor(i / cols) * tileH;
  const el = document.createElement('div');
  el.textContent = tile.label;
  el.style.left = `${x + 4}px`;
  el.style.top = `${y + 4}px`;
  labels.appendChild(el);
});

const H = rows * tileH;
tiles.forEach((tile, i) => {
  const x = (i % cols) * tileW;
  const y = H - (Math.floor(i / cols) + 1) * tileH;
  renderer.setViewport(x, y, tileW, tileH);
  renderer.setScissor(x, y, tileW, tileH);
  renderer.render(scene, (tile as Tile & { cam: THREE.Camera }).cam);
});

(window as unknown as { POSES_READY: boolean }).POSES_READY = true;
