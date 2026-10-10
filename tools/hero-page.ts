/**
 * Sheets for `tools/hero-sheet.mjs`. Runs in the browser on the Vite dev
 * server against the real hero code. Each entry in `SHEETS` returns a PNG
 * data URI.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { CharClassId } from '../src/types';
import { profileBodies } from '../src/art/hero/Body';
import { buildHero, setHeroHidden } from '../src/art/hero/Hero';
import { wearArmour } from '../src/art/hero/Armour';
import { ITEM_BASES } from '../src/data/itemBases';
import type { EquipSlot, ItemRarity } from '../src/types';
import { HERO_LOOKS } from '../src/art/hero/Looks';
import { loadMeshCache } from '../src/art/hero/MeshCache';
import { HeroAnimator } from '../src/art/hero/Animator';
import { ACTION_NAMES, actionFor } from '../src/art/hero/Actions';
import { holdItem } from '../src/art/hero/Hold';
import type { Stance } from '../src/art/hero/Stances';
import type { HeroModel } from '../src/art/hero/Hero';
import { buildItemModel } from '../src/art/ItemModels';
import { Random } from '../src/core/RNG';

const BG = '#16181e';
const INK = '#c9d1de';
const CLASSES: CharClassId[] = ['warden', 'pyromancer', 'shadowblade', 'stormcaller', 'revenant', 'ranger'];

let renderer: THREE.WebGLRenderer | null = null;
let envTex: THREE.Texture | null = null;
function studio(w: number, h: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
  }
  renderer.setSize(w, h, false);
  return renderer;
}

function lights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0x8a96b0, 0x2a2018, 0.7));
  const key = new THREE.DirectionalLight(0xffe2c4, 2.6);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8ab4ff, 1.4);
  rim.position.set(-3, 2.5, -3);
  scene.add(rim);
}

function sheet(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  g.font = '14px monospace';
  return { c, g };
}

/** Renders one object into a tile of the sheet. */
function shoot(
  g: CanvasRenderingContext2D,
  obj: THREE.Object3D,
  opts: { x: number; y: number; w: number; h: number; yaw: number; target: THREE.Vector3; dist: number; fov?: number; pitch?: number; floor?: boolean },
): void {
  const r = studio(opts.w, opts.h);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  // The game lights metal with a dim sky environment; so does the studio.
  if (!envTex) {
    const pm = new THREE.PMREMGenerator(r);
    envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  scene.environment = envTex;
  scene.environmentIntensity = 0.22;
  lights(scene);
  const holder = new THREE.Group();
  holder.add(obj);
  if (opts.floor) holder.add(floorGrid());
  holder.rotation.y = opts.yaw;
  scene.add(holder);
  const cam = new THREE.PerspectiveCamera(opts.fov ?? 30, opts.w / opts.h, 0.05, 50);
  const pitch = opts.pitch ?? 0.08;
  cam.position.set(0, opts.target.y + Math.sin(pitch) * opts.dist, Math.cos(pitch) * opts.dist).add(new THREE.Vector3(opts.target.x, 0, opts.target.z));
  cam.lookAt(opts.target);
  r.render(scene, cam);
  g.drawImage(r.domElement, opts.x, opts.y);
  holder.remove(obj);
}

let grid: THREE.Object3D | null = null;
/** A floor with a half-metre grid, fixed in the world, to judge sliding feet against. */
function floorGrid(): THREE.Object3D {
  if (!grid) {
    const g = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 1 }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.002;
    g.add(plane);
    g.add(new THREE.GridHelper(80, 160, 0x4a5060, 0x3a3e48));
    grid = g;
  }
  return grid;
}

/** A post where a foe would stand, a metre ahead, to judge where blows land. */
function dummy(H: number): THREE.Object3D {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, H * 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x8a3030, roughness: 0.8 }));
  post.position.set(0, H * 0.45, 1.25);
  return post;
}

/** What each stance holds for the sheets: slot, item base, grip. */
const STANCE_ITEMS: Record<Stance, Array<['mainHand' | 'offHand', string, string]>> = {
  unarmed: [],
  oneHand: [['mainHand', 'sword.broad', 'sword']],
  dagger: [['mainHand', 'dagger.dagger', 'dagger']],
  wand: [['mainHand', 'wand.wand', 'wand']],
  dual: [
    ['mainHand', 'dagger.kris', 'dagger'],
    ['offHand', 'dagger.dirk', 'dagger'],
  ],
  shield: [
    ['mainHand', 'sword.broad', 'sword'],
    ['offHand', 'shield.heater', 'shield'],
  ],
  twoHand: [['mainHand', 'sword.great', 'twoHand']],
  staff: [['mainHand', 'staff.long', 'staff']],
  bow: [['offHand', 'bow.long', 'bow']],
};
const STANCE_LIST = Object.keys(STANCE_ITEMS) as Stance[];
const CLASS_STANCE: Record<CharClassId, Stance> = {
  warden: 'shield',
  pyromancer: 'wand',
  shadowblade: 'dual',
  stormcaller: 'staff',
  revenant: 'twoHand',
  ranger: 'bow',
};

interface Actor {
  hero: HeroModel;
  anim: HeroAnimator;
  /** Stands in for the player's root: the animator follows it over the floor. */
  mover: THREE.Group;
  /** Holds the mover and the floor grid, for shooting. */
  world: THREE.Group;
}

function actor(cls: CharClassId, stance: Stance, name = `${cls}-${stance}`, kit?: string, rarity: ItemRarity = 'unique'): Actor {
  const hero = buildHero(HERO_LOOKS[cls], name);
  if (kit && KITS[kit]) {
    const hidden = new Set<string>();
    for (const id of KITS[kit]!) {
      const base = ITEM_BASES.find((b) => b.id === id);
      if (!base) continue;
      wearArmour(hero, base.slot as EquipSlot, { baseId: base.id, rarity }, base.visual)?.hides.forEach((k) => hidden.add(k));
    }
    setHeroHidden(hero, hidden);
  }
  for (const [slot, id, grip] of STANCE_ITEMS[stance]) {
    const base = ITEM_BASES.find((b) => b.id === id);
    if (!base) continue;
    holdItem(hero.rig, slot, buildItemModel(base.visual, new Random(7), 'rare'), grip);
  }
  const anim = new HeroAnimator(hero.rig.bones);
  anim.setStance(stance);
  const mover = new THREE.Group();
  mover.add(hero.root);
  anim.follow(mover);
  const world = new THREE.Group();
  world.add(mover);
  return { hero, anim, mover, world };
}

/** A path for the mover: position and heading at time t. */
type Drive = (t: number, m: THREE.Group, dt: number) => void;

/** Steps the actor at 60 Hz along a drive, calling `each` after every frame. */
function simulate(a: Actor, from: number, to: number, drive: Drive, each?: (t: number) => void): void {
  const dt = 1 / 60;
  for (let t = from; t < to - 1e-6; t += dt) {
    drive(t, a.mover, dt);
    a.anim.update(dt);
    each?.(t + dt);
  }
}

const still: Drive = () => {};
const straight =
  (v: number): Drive =>
  (t, m) => {
    m.position.set(0, 0, v * t);
    m.rotation.y = 0;
  };
/** Player-style: accelerate toward a run, hold, then let go and stop. */
function startStop(): Drive {
  let v = 0;
  let z = 0;
  return (t, m, dt) => {
    const want = t > 0.3 && t < 1.3 ? 4.6 : 0;
    v += (want - v) * Math.min(1, dt * (want > 0 ? 14 : 18));
    z += v * dt;
    m.position.set(0, 0, z);
    m.rotation.y = 0;
  };
}
/** Turns on the spot, half a turn and back, at the player's turn rate. */
function turnInPlace(): Drive {
  let yaw = 0;
  return (t, m, dt) => {
    const want = t < 0.4 ? 0 : t < 1.6 ? Math.PI * 0.95 : 0;
    yaw += (want - yaw) * Math.min(1, dt * 16);
    m.position.set(0, 0, 0);
    m.rotation.y = yaw;
  };
}
/** Runs a circle: a constant turn while moving. */
function circle(v: number, r: number): Drive {
  return (t, m) => {
    const a = (v / r) * t;
    m.position.set(r - r * Math.cos(a), 0, r * Math.sin(a));
    m.rotation.y = a;
  };
}

/**
 * Plays `name` as the game does for a blow `contact` seconds off, after
 * `combo` blows of the chain; returns its natural length and contact key.
 */
function playAction(a: Actor, name: string, combo = 0, contact?: number, speed = 1): { end: number; contact: number | null } {
  for (let i = 0; i < combo; i++) {
    a.anim.play(name, { fade: 0.08, restart: true });
    a.anim.update(1 / 60);
  }
  const def = actionFor(name, a.anim.moveKind, combo);
  a.anim.play(name, { fade: 0.08, restart: true, speed, contact });
  return { end: def.keys[def.keys.length - 1]!.t, contact: def.contact ?? null };
}

/** Real seconds an action takes when its contact is warped to `contact`. */
function realLength(end: number, c: number | null, contact: number | undefined, speed: number): number {
  if (c === null || contact === undefined) return end / speed;
  return contact + (end - c) / speed;
}

/** Shoots the actor framed on its mover, the floor fixed under it. */
function shootActor(g: CanvasRenderingContext2D, a: Actor, x: number, y: number, w: number, h: number, yaw: number, dist = 4.2): void {
  const H = a.hero.look.shape.height;
  const tgt = a.mover.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(0, H * 0.5, 0));
  shoot(g, a.world, { x, y, w, h, yaw, target: tgt, dist, floor: true, pitch: 0.18 });
}

/**
 * How far planted feet slide and float: each planted frame, where the foot's
 * contact point really is (from the skinned bones) against where the gait
 * put it on the floor. Millimetres.
 */
function footSlide(a: Actor, drive: Drive, seconds: number): { slide: number; drift: number; float: number; air: number; steps: number } {
  let slide = 0;
  let float = 0;
  let air = 0;
  let steps = 0;
  let drift = 0;
  const off = a.anim.on('step', () => steps++);
  const bones = [a.hero.rig.bones.footL, a.hero.rig.bones.footR];
  const geo = a.anim.footGeo;
  const p = new THREE.Vector3();
  // Frame-to-frame travel of each planted contact point, summed per plant.
  const last = [new THREE.Vector3(), new THREE.Vector3()];
  const lastSign = [0, 0];
  const run = [0, 0];
  simulate(a, 0, seconds, drive, (t) => {
    if (t < 0.5) return;
    a.world.updateMatrixWorld(true);
    a.anim.feet.forEach((f, i) => {
      const sign = f.pitch >= 0 ? 1 : -1;
      const pz = sign > 0 ? geo.ballZ : geo.heelZ;
      p.set(0, -geo.ankleY, pz).applyMatrix4(bones[i]!.matrixWorld);
      if (!f.planted) {
        air = Math.max(air, p.y * 1000);
        lastSign[i] = 0;
        run[i] = 0;
        return;
      }
      const ex = f.x + Math.sin(f.yaw) * pz;
      const ez = f.z + Math.cos(f.yaw) * pz;
      slide = Math.max(slide, Math.hypot(p.x - ex, p.z - ez) * 1000);
      float = Math.max(float, Math.abs(p.y) * 1000);
      if (lastSign[i] === sign) {
        run[i]! += Math.hypot(p.x - last[i]!.x, p.z - last[i]!.z) * 1000;
        drift = Math.max(drift, run[i]!);
      }
      lastSign[i] = sign;
      last[i]!.copy(p);
    });
  });
  off();
  return { slide, drift, float, air, steps };
}

function bareBody(cls: CharClassId): { root: THREE.Object3D; info: string } {
  const look = HERO_LOOKS[cls];
  const hero = buildHero(look, cls);
  const tris = hero.body.skin.getIndex()!.count / 3;
  return { root: hero.root, info: `${tris | 0} tris ${hero.body.ms | 0}ms` };
}

const KITS: Record<string, string[]> = {
  heavy: ['chest.archon', 'helm.great', 'gloves.war', 'boots.myrmidon', 'belt.war'],
  plate: ['chest.plate', 'helm.helm', 'gloves.gauntlets', 'boots.greaves', 'belt.belt'],
  caster: ['chest.aeonshroud', 'helm.diadem', 'gloves.silk', 'boots.slippers', 'belt.sash'],
  robe: ['chest.quilted', 'helm.circlet', 'gloves.silk', 'boots.slippers', 'belt.sash'],
  leather: ['chest.studded', 'helm.cap', 'gloves.leather', 'boots.boots', 'belt.light'],
  mail: ['chest.chainmail', 'helm.skullcap', 'gloves.heavy', 'boots.heavy', 'belt.girdle'],
  scale: ['chest.kraken', 'helm.grim', 'gloves.vampirebone', 'boots.scarabshell', 'belt.troll'],
  bone: ['chest.boneweave', 'helm.bone', 'gloves.bramble', 'boots.wyrmhide', 'belt.vampirefang'],
};

/** Every skinned mesh under a hero. */
function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh);
  });
  return out;
}

export const SHEETS: Record<string, (f: Record<string, string>) => Promise<string>> = {
  /** Numbers, not pictures: returns a JSON report. */
  async check(f) {
    await loadMeshCache();
    const list = f.class ? (f.class.split(',') as CharClassId[]) : CLASSES;
    const lines: string[] = [];
    let pass = true;
    const bad = (msg: string) => {
      pass = false;
      lines.push(`  FAIL ${msg}`);
    };
    for (const cls of list) {
      const look = HERO_LOOKS[cls];
      const t0 = performance.now();
      const hero = buildHero(look, cls);
      const ms = performance.now() - t0;
      const meshes = skinnedMeshes(hero.root);
      let tris = 0;
      for (const m of meshes) {
        const geo = m.geometry;
        tris += geo.getIndex()!.count / 3;
        const pos = geo.getAttribute('position').array as Float32Array;
        const sw = geo.getAttribute('skinWeight').array as Float32Array;
        const si = geo.getAttribute('skinIndex').array;
        let nan = 0;
        for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) nan++;
        if (nan) bad(`${cls} ${m.name}: ${nan} bad positions`);
        let worst = 0;
        for (let v = 0; v < sw.length; v += 4) worst = Math.max(worst, Math.abs(sw[v] + sw[v + 1] + sw[v + 2] + sw[v + 3] - 1));
        if (worst > 2e-3) bad(`${cls} ${m.name}: skin weights off by ${worst.toFixed(4)}`);
        for (let i = 0; i < si.length; i++) {
          if (si[i] >= hero.rig.skeleton.bones.length) {
            bad(`${cls} ${m.name}: skin index ${si[i]} out of range`);
            break;
          }
        }
      }
      const box = new THREE.Box3();
      box.setFromBufferAttribute(hero.body.skin.getAttribute('position') as THREE.BufferAttribute);
      const H = box.max.y - box.min.y;
      if (Math.abs(H / look.shape.height - 1) > 0.03) bad(`${cls}: height ${H.toFixed(3)} m, wants ${look.shape.height}`);
      if (box.min.y < -0.005 || box.min.y > 0.02) bad(`${cls}: soles at ${box.min.y.toFixed(3)} m, want 0`);
      if (tris > 24000) bad(`${cls}: ${tris} triangles, budget 24000`);
      if (meshes.length > 8) bad(`${cls}: ${meshes.length} draw calls bare, budget 8`);
      const e = hero.body.anatomy.eyes;
      const f0 = hero.body.anatomy.field;
      for (const c of [e.L, e.R]) {
        // The eye's centre sits inside the head and its front just breaks the lid.
        if (!look.face.skull && f0.eval(c.x, c.y, c.z) > 0) bad(`${cls}: eye centre outside the head`);
      }
      const t1 = performance.now();
      buildHero(look, `${cls}-again`);
      const again = performance.now() - t1;
      if (again > 120) bad(`${cls}: second build took ${again | 0} ms (cache miss?)`);
      lines.push(`${cls}: ${tris} tris, ${meshes.length} meshes, ${H.toFixed(2)} m, built ${ms | 0} ms, again ${again | 0} ms`);
    }
    // Every kit on every class: it must build, stay in budget and skin cleanly.
    for (const cls of list) {
      for (const [kitName, kit] of Object.entries(KITS)) {
        const hero = buildHero(HERO_LOOKS[cls], `${cls}-${kitName}`);
        const t0 = performance.now();
        for (const id of kit) {
          const base = ITEM_BASES.find((b) => b.id === id);
          if (!base) {
            bad(`kit ${kitName}: no base ${id}`);
            continue;
          }
          try {
            wearArmour(hero, base.slot as EquipSlot, { baseId: base.id, rarity: 'unique' }, base.visual);
          } catch (e) {
            bad(`${cls} ${id}: ${String(e).slice(0, 160)}`);
          }
        }
        const ms = performance.now() - t0;
        let tris = 0;
        let draws = 0;
        hero.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          draws++;
          tris += (m.geometry.getIndex()?.count ?? 0) / 3;
          const sw = m.geometry.getAttribute('skinWeight');
          if (sw) {
            const a = sw.array as Float32Array;
            for (let v = 0; v < a.length; v += 4) {
              if (Math.abs(a[v] + a[v + 1] + a[v + 2] + a[v + 3] - 1) > 2e-3) {
                bad(`${cls} ${kitName} ${m.name}: skin weights do not sum to 1`);
                break;
              }
            }
          }
        });
        if (tris > 60000) bad(`${cls} ${kitName}: ${tris} triangles dressed, budget 60000`);
        if (draws > 32) bad(`${cls} ${kitName}: ${draws} draw calls dressed, budget 32`);
        lines.push(`${cls} ${kitName}: ${tris} tris, ${draws} draws, dressed in ${ms | 0} ms`);
      }
    }
    // Cost: one animator frame, with a cape to swing.
    {
      const a = actor(list[0]!, CLASS_STANCE[list[0]!], 'timing', 'plate');
      const t0 = performance.now();
      simulate(a, 0, 10, circle(3.4, 3));
      const us = ((performance.now() - t0) / 600) * 1000;
      if (us > 400) bad(`animator frame costs ${us | 0} us, budget 400`);
      lines.push(`animator: ${us | 0} us a frame`);
    }
    // Feet: planted feet must stay planted, on the floor, whatever the body does.
    for (const cls of list) {
      const runs: Array<[string, Drive, number]> = [
        ['walk', straight(1.6), 4],
        ['run', straight(4.6), 4],
        ['start-stop', startStop(), 3],
        ['turn', turnInPlace(), 3],
        ['circle', circle(3.4, 3), 4],
      ];
      for (const [label, drive, secs] of runs) {
        const a = actor(cls, CLASS_STANCE[cls], `${cls}-feet-${label}`);
        const r = footSlide(a, drive, secs);
        if (r.slide > 15 || r.drift > 15) bad(`${cls} ${label}: planted foot slides ${Math.max(r.slide, r.drift).toFixed(1)} mm`);
        if ((label === 'walk' || label === 'run') && r.air < 40) bad(`${cls} ${label}: feet never leave the floor`);
        if (r.float > 20) bad(`${cls} ${label}: planted foot off the floor by ${r.float.toFixed(1)} mm`);
        if ((label === 'walk' || label === 'run') && r.steps < secs) bad(`${cls} ${label}: only ${r.steps} steps`);
        lines.push(`${cls} ${label}: slide ${r.slide.toFixed(1)} mm, drift ${r.drift.toFixed(1)} mm, float ${r.float.toFixed(1)} mm, lift ${r.air.toFixed(0)} mm, ${r.steps} steps`);
      }
    }
    // Actions: the hit or release lands exactly when the game asked, every
    // weapon, every blow of each chain, and nothing goes to NaN.
    {
      const kits: Array<[Stance, string | undefined]> = [...STANCE_LIST.map((st) => [st, undefined] as [Stance, undefined]), ['oneHand', 'axe'], ['oneHand', 'mace']];
      let checked = 0;
      let worst = 0;
      for (const [st, weapon] of kits) {
        const a = actor(list[0]!, st, `act-${st}-${weapon ?? ''}`);
        if (weapon) a.anim.setWeapon(weapon);
        simulate(a, 0, 0.5, still);
        let fired = -1;
        let clock = 0;
        a.anim.on('hit', () => fired < 0 && (fired = clock + 1 / 60));
        a.anim.on('release', () => fired < 0 && (fired = clock + 1 / 60));
        const names = [...ACTION_NAMES, 'attack1#1', 'attack1#2', 'attack1#3'];
        for (const spec of names) {
          const [name, n] = spec.split('#') as [string, string | undefined];
          if (name === 'death' || name === 'deathFwd' || name === 'down') continue;
          a.anim.reset();
          simulate(a, 0, 0.3, still);
          const want = 0.16;
          const speed = 1.07;
          fired = -1;
          const { end, contact } = playAction(a, name, Number(n ?? 0), want, speed);
          clock = 0;
          const len = realLength(end, contact, want, speed);
          let nan = false;
          simulate(a, 0, Math.min(3, len + 0.3), still, (t) => {
            clock = t;
            if (!nan) for (const b of a.anim.bones) if (!Number.isFinite(b.quaternion.w) || !Number.isFinite(b.position.y)) nan = true;
          });
          a.anim.reset();
          const label = `${st}${weapon ? `/${weapon}` : ''} ${spec}`;
          if (nan) bad(`${label}: bones went NaN`);
          if (contact === null) {
            if (fired >= 0 && name !== 'channel') bad(`${label}: fired an event with no contact key`);
            continue;
          }
          checked++;
          const late = fired - want;
          if (fired < 0) bad(`${label}: never fired`);
          else if (late < -1e-6 || late > 1 / 60 + 1e-6) bad(`${label}: fired ${(late * 1000).toFixed(1)} ms off`);
          else worst = Math.max(worst, late);
        }
      }
      lines.push(`actions: ${checked} timed, worst ${(worst * 1000).toFixed(1)} ms late (one frame is 16.7)`);
    }
    return JSON.stringify({ pass, lines });
  },
  /**
   * Locomotion strips: idle, a walk cycle, a run cycle, start and stop, a
   * turn on the spot, a run round a circle. `--class=` and `--stance=` pick
   * who and what they hold.
   */
  async clips(f) {
    await loadMeshCache();
    const cls = (f.class ?? 'warden').split(',')[0] as CharClassId;
    const stance = (f.stance as Stance | undefined) ?? CLASS_STANCE[cls];
    const TW = 200;
    const TH = 340;
    const COLS = 8;
    // label, drive, warm-up, span (0: one gait cycle), view yaw
    const rows: Array<[string, () => Drive, number, number, number]> = [
      ['idle', () => still, 1, 6, 0.5],
      ['walk', () => straight(1.6), 2, 0, Math.PI / 2],
      ['run', () => straight(4.6), 2, 0, Math.PI / 2],
      ['start, stop', startStop, 0.2, 2.2, Math.PI / 2],
      ['turn', turnInPlace, 0.3, 2.4, 0.3],
      ['circle', () => circle(3.4, 3), 2, 1.2, Math.PI / 2],
    ];
    const { c, g } = sheet(TW * COLS, TH * rows.length);
    rows.forEach(([label, make, warm, span0, view], r) => {
      const drive = make();
      const a = actor(cls, stance, `${cls}-${stance}-${r}`, f.kit, (f.rarity ?? 'unique') as ItemRarity);
      simulate(a, 0, warm, drive);
      const span = span0 > 0 ? span0 : 1 / a.anim.gaitInfo.freq;
      let t = warm;
      for (let k = 0; k < COLS; k++) {
        const next = warm + (span * k) / COLS;
        simulate(a, t, next, drive);
        t = next;
        shootActor(g, a, k * TW, r * TH, TW, TH, view);
      }
      g.fillStyle = INK;
      const gi = a.anim.gaitInfo;
      g.fillText(`${label}  ${stance}  ${gi.freq.toFixed(2)} Hz  run ${gi.runW.toFixed(2)}`, 8, r * TH + 18);
    });
    return c.toDataURL('image/png');
  },
  /**
   * Key strips for actions: one row per action, eight frames across its
   * length, the contact frame outlined. `--class=`, `--stance=`,
   * `--weapon=axe|mace` and `--actions=attack1#0,attack1#1,slam,...`
   * (`#n` is the place in the chain).
   */
  async actions(f) {
    await loadMeshCache();
    const cls = (f.class ?? 'warden').split(',')[0] as CharClassId;
    const stance = (f.stance as Stance | undefined) ?? CLASS_STANCE[cls];
    const list = (f.actions ?? 'attack1#0,attack1#1,attack1#2,thrust,slam,lunge,cast,shoot').split(',');
    const TW = 210;
    const TH = 300;
    const COLS = 8;
    // Two views a row: three-quarter from the front, and the game's camera from above.
    const views: Array<[number, number, number]> = [
      [Number(f.view ?? 0.7), 0.15, 3.9],
      [Number(f.view ?? 0.7) + 0.5, 0.95, 4.4],
    ];
    const { c, g } = sheet(TW * COLS, TH * list.length * views.length);
    list.forEach((spec, row) => {
      const [name, n] = spec.split('#') as [string, string | undefined];
      views.forEach(([yaw, pitch, dist], vi) => {
        const r = row * views.length + vi;
        const a = actor(cls, stance, `${cls}-${stance}-act${r}`, f.kit, (f.rarity ?? 'unique') as ItemRarity);
        if (f.weapon) a.anim.setWeapon(f.weapon);
        a.world.add(dummy(a.hero.look.shape.height));
        simulate(a, 0, 0.6, still);
        const { end, contact } = playAction(a, name, Number(n ?? 0));
        // Even frames, with the one nearest the contact moved onto it.
        const times = Array.from({ length: COLS }, (_, k) => (end * k) / (COLS - 1));
        let ck = -1;
        if (contact !== null) {
          ck = 0;
          times.forEach((tt, k) => Math.abs(tt - contact) < Math.abs(times[ck]! - contact) && (ck = k));
          times[ck] = contact;
        }
        let t = 0;
        times.forEach((next, k) => {
          simulate(a, t, next, still);
          t = next;
          const H = a.hero.look.shape.height;
          const tgt = new THREE.Vector3(0, H * 0.5, 0);
          shoot(g, a.world, { x: k * TW, y: r * TH, w: TW, h: TH, yaw, target: tgt, dist, floor: true, pitch });
          if (k === ck) {
            g.strokeStyle = '#d04040';
            g.lineWidth = 3;
            g.strokeRect(k * TW + 2, r * TH + 2, TW - 4, TH - 4);
          }
          g.fillStyle = INK;
          g.fillText(next.toFixed(2), k * TW + 8, r * TH + TH - 10);
        });
        g.fillStyle = INK;
        if (vi === 0) g.fillText(`${spec}  ${a.anim.moveKind}  hit ${contact ?? '-'}`, 8, r * TH + 18);
      });
    });
    return c.toDataURL('image/png');
  },
  /**
   * Numbers for tuning actions: at each key, where the weapon hand is and
   * which way the blade points, in character space (+X left, +Z ahead),
   * and the chest's turn. Same flags as `actions`.
   */
  async probe(f) {
    await loadMeshCache();
    const cls = (f.class ?? 'warden').split(',')[0] as CharClassId;
    const stance = (f.stance as Stance | undefined) ?? CLASS_STANCE[cls];
    const list = (f.actions ?? 'attack1#0,attack1#1,attack1#2').split(',');
    const lines: string[] = [];
    const v = (o: THREE.Vector3) => `${o.x.toFixed(2)} ${o.y.toFixed(2)} ${o.z.toFixed(2)}`.padEnd(17);
    for (const spec of list) {
      const [name, n] = spec.split('#') as [string, string | undefined];
      const a = actor(cls, stance, `${cls}-${stance}-probe`);
      if (f.weapon) a.anim.setWeapon(f.weapon);
      simulate(a, 0, 0.6, still);
      const def = actionFor(name, a.anim.moveKind, Number(n ?? 0));
      playAction(a, name, Number(n ?? 0));
      lines.push(`${spec} (${a.anim.moveKind}) contact ${def.contact ?? '-'}`);
      lines.push('     t   hand R             blade R           hand L             blade L           chest yaw');
      let t = 0;
      for (const key of def.keys) {
        simulate(a, t, key.t, still);
        t = key.t;
        a.world.updateMatrixWorld(true);
        const row = [key.t.toFixed(2).padStart(6)];
        for (const slot of ['mainHand', 'offHand'] as const) {
          const sock = a.hero.rig.sockets[slot];
          const node = sock.getObjectByName(`hold:${slot}`) ?? sock;
          const pos = node.getWorldPosition(new THREE.Vector3());
          const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()));
          row.push(v(pos), v(dir));
        }
        const chest = a.hero.rig.bones.chest;
        const fz = new THREE.Vector3(0, 0, 1).applyQuaternion(chest.getWorldQuaternion(new THREE.Quaternion()));
        row.push(Math.atan2(fz.x, fz.z).toFixed(2));
        lines.push(row.join('  '));
      }
    }
    return JSON.stringify({ pass: true, lines });
  },
  /** Every stance on one class: standing, mid-walk, mid-run. */
  async stances(f) {
    await loadMeshCache();
    const cls = (f.class ?? 'warden').split(',')[0] as CharClassId;
    const list = f.stance ? (f.stance.split(',') as Stance[]) : STANCE_LIST;
    const TW = 220;
    const TH = 380;
    const { c, g } = sheet(TW * 3 * 3, TH * Math.ceil(list.length / 3));
    list.forEach((st, i) => {
      const ox = (i % 3) * TW * 3;
      const oy = Math.floor(i / 3) * TH;
      const idle = actor(cls, st, `${cls}-${st}-i`);
      simulate(idle, 0, 1.5, still);
      shootActor(g, idle, ox, oy, TW, TH, 0.6);
      const walk = actor(cls, st, `${cls}-${st}-w`);
      simulate(walk, 0, 2.3, straight(1.6));
      shootActor(g, walk, ox + TW, oy, TW, TH, 1.1);
      const run = actor(cls, st, `${cls}-${st}-r`);
      simulate(run, 0, 2.15, straight(4.6));
      shootActor(g, run, ox + TW * 2, oy, TW, TH, 1.3);
      g.fillStyle = INK;
      g.fillText(st, ox + 8, oy + 18);
    });
    return c.toDataURL('image/png');
  },
  /** Every class body, bare, front / side / back, in the bind pose. */
  async bodies(f) {
    profileBodies(true);
    const list = f.class ? (f.class.split(',') as CharClassId[]) : CLASSES;
    const TW = 260;
    const TH = 480;
    const { c, g } = sheet(TW * 3 * Math.min(3, list.length), TH * Math.ceil(list.length / 3) + 10);
    list.forEach((cls, i) => {
      const { root, info } = bareBody(cls);
      const ox = (i % 3) * TW * 3;
      const oy = Math.floor(i / 3) * TH;
      const tgt = new THREE.Vector3(0, HERO_LOOKS[cls].shape.height * 0.52, 0);
      [0, Math.PI * 0.5, Math.PI].forEach((yaw, k) => shoot(g, root, { x: ox + k * TW, y: oy, w: TW, h: TH, yaw, target: tgt, dist: 4.4 }));
      g.fillStyle = INK;
      g.fillText(`${cls}  ${info}`, ox + 8, oy + 18);
    });
    return c.toDataURL('image/png');
  },
  /**
   * Every class in a typical kit, front / side / back. `--kit=heavy|plate|caster|...`
   * overrides the class's own, `--rarity=` picks the rarity.
   */
  async gear(f) {
    profileBodies(true);
    const list = f.class ? (f.class.split(',') as CharClassId[]) : CLASSES;
    const own: Record<CharClassId, string> = { warden: 'heavy', pyromancer: 'caster', shadowblade: 'leather', stormcaller: 'mail', revenant: 'bone', ranger: 'scale' };
    const rarity = (f.rarity ?? 'rare') as ItemRarity;
    const TW = 260;
    const TH = 480;
    const { c, g } = sheet(TW * 3 * Math.min(3, list.length), TH * Math.ceil(list.length / 3) + 10);
    list.forEach((cls, i) => {
      const hero = buildHero(HERO_LOOKS[cls], `${cls}-gear`);
      const hidden = new Set<string>();
      const kit = KITS[f.kit ?? own[cls]] ?? KITS.heavy!;
      let ms = 0;
      for (const id of kit) {
        const base = ITEM_BASES.find((b) => b.id === id);
        if (!base) continue;
        const t0 = performance.now();
        const worn = wearArmour(hero, base.slot as EquipSlot, { baseId: base.id, rarity }, base.visual);
        ms += performance.now() - t0;
        worn?.hides.forEach((k) => hidden.add(k));
      }
      setHeroHidden(hero, hidden);
      const ox = (i % 3) * TW * 3;
      const oy = Math.floor(i / 3) * TH;
      const tgt = new THREE.Vector3(0, HERO_LOOKS[cls].shape.height * 0.52, 0);
      [0.35, Math.PI * 0.5, Math.PI].forEach((yaw, k) => shoot(g, hero.root, { x: ox + k * TW, y: oy, w: TW, h: TH, yaw, target: tgt, dist: 4.4 }));
      g.fillStyle = INK;
      g.fillText(`${cls} ${f.kit ?? own[cls]} ${ms | 0}ms`, ox + 8, oy + 18);
    });
    return c.toDataURL('image/png');
  },
  /** Bent joints, to judge the skin weights: a crouch, a reach, a twist. */
  async poses(f) {
    const cls = (f.class ?? 'warden').split(',')[0] as CharClassId;
    const TW = 300;
    const TH = 480;
    const { c, g } = sheet(TW * 6, TH);
    const H = HERO_LOOKS[cls].shape.height;
    const poses: Array<Record<string, [number, number, number]>> = [
      // Reach: arms forward, elbows bent, wrists cocked.
      { upperArmL: [-1.3, 0, 0.5], upperArmR: [-0.3, 0, -0.9], foreArmL: [-1.5, 0, 0], foreArmR: [-0.9, 0, 0], handR: [0.6, 0, 0], neck: [0.2, 0, 0] },
      // Crouch: hips and knees deep, back bent.
      { thighL: [-1.4, 0, 0], thighR: [-0.4, 0, 0], shinL: [1.6, 0, 0], shinR: [1.2, 0, 0], footL: [-0.2, 0, 0], spine: [0.3, 0, 0], chest: [0.2, 0, 0] },
      // Twist: torso turned, head turned back, arm raised overhead.
      { spine: [0, 0.4, 0], chest: [0, 0.35, 0], neck: [0, -0.4, 0], head: [0, -0.3, 0.1], upperArmL: [0, 0, 2.1], foreArmL: [0, 0, 0.6], upperArmR: [0.5, 0, 0], clavL: [0, 0, 0.3] },
    ];
    poses.forEach((pose, i) => {
      const hero = buildHero(HERO_LOOKS[cls], `${cls}-pose${i}`);
      for (const [bone, r] of Object.entries(pose)) {
        const b = hero.rig.bones[bone as keyof typeof hero.rig.bones];
        if (b) b.rotation.set(r[0], r[1], r[2]);
      }
      const tgt = new THREE.Vector3(0, H * 0.48, 0);
      shoot(g, hero.root, { x: i * 2 * TW, y: 0, w: TW, h: TH, yaw: 0.35, target: tgt, dist: 4.4 });
      shoot(g, hero.root, { x: (i * 2 + 1) * TW, y: 0, w: TW, h: TH, yaw: Math.PI * 0.5 + 0.2, target: tgt, dist: 4.4 });
    });
    return c.toDataURL('image/png');
  },
  /** Head close-ups: front, three-quarter, profile. */
  async faces(f) {
    const list = f.class ? (f.class.split(',') as CharClassId[]) : CLASSES;
    const T = 300;
    const { c, g } = sheet(T * 3 * 2, T * Math.ceil(list.length / 2));
    list.forEach((cls, i) => {
      const { root } = bareBody(cls);
      const ox = (i % 2) * T * 3;
      const oy = Math.floor(i / 2) * T;
      const H = HERO_LOOKS[cls].shape.height;
      const tgt = new THREE.Vector3(0, H * 0.905, 0);
      [0, 0.7, Math.PI * 0.5].forEach((yaw, k) => shoot(g, root, { x: ox + k * T, y: oy, w: T, h: T, yaw, target: tgt, dist: 1.0, fov: 22 }));
      g.fillStyle = INK;
      g.fillText(cls, ox + 8, oy + 18);
    });
    return c.toDataURL('image/png');
  },
  /** Hands and feet close-up. */
  async extremities(f) {
    const cls = (f.class ?? 'warden').split(',')[0] as CharClassId;
    const T = 320;
    const { c, g } = sheet(T * 4, T);
    const { root } = bareBody(cls);
    root.updateMatrixWorld(true);
    const rig = root.getObjectByName('handR')!;
    const hand = rig.getWorldPosition(new THREE.Vector3());
    shoot(g, root, { x: 0, y: 0, w: T, h: T, yaw: 0, target: hand.clone().add(new THREE.Vector3(-0.05, -0.05, 0)), dist: 0.7, fov: 22 });
    shoot(g, root, { x: T, y: 0, w: T, h: T, yaw: Math.PI * 0.5, target: new THREE.Vector3(0, hand.y - 0.05, -hand.x - 0.05), dist: 0.7, fov: 22, pitch: 0.6 });
    const foot = root.getObjectByName('footR')!.getWorldPosition(new THREE.Vector3());
    shoot(g, root, { x: T * 2, y: 0, w: T, h: T, yaw: 0, target: foot.clone().add(new THREE.Vector3(0, 0, 0.05)), dist: 0.8, fov: 22, pitch: 0.4 });
    shoot(g, root, { x: T * 3, y: 0, w: T, h: T, yaw: Math.PI * 0.5, target: new THREE.Vector3(0, foot.y, foot.x), dist: 0.8, fov: 22, pitch: 0.2 });
    return c.toDataURL('image/png');
  },
};
