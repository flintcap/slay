/**
 * Creature sheets for `tools/creature-sheet.mjs`. Runs in the browser on the
 * Vite dev server against the real creature code, without booting the game.
 *
 *  - lineup: each creature standing, three-quarter view, with its cost.
 *  - poses:  one row per creature through idle, walk, run, wind-up, strike,
 *            cast, hit, stagger, spawn and death, driven by the real animator
 *            with the same drive calls `Enemy` makes.
 *  - game:   the lineup again from the real game camera, small, in dungeon light.
 */
import * as THREE from 'three';
import { MONSTERS } from '../src/data/monsters';
import { BOSSES } from '../src/data/bosses';
import { preloadSets } from '../src/art/TextureSets';
import { lookFor } from '../src/art/creatures/Looks';
import { clearCorpses, instanceCreature, miniBossFlair, rankTier } from '../src/art/creatures/Creature';
import { CreatureAnimator, type RigAction, type CreatureInfo } from '../src/art/creatures/Animator';
import { Random } from '../src/core/RNG';

const BG = '#14161c';
const INK = '#c9d1de';
const DIM = '#7d8796';

let renderer: THREE.WebGLRenderer | null = null;

function studio(w: number, h: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
  }
  renderer.setSize(w, h, false);
  return renderer;
}

function lights(scene: THREE.Scene, mood: 'studio' | 'dungeon'): void {
  if (mood === 'studio') {
    scene.add(new THREE.HemisphereLight(0x9fb0cc, 0x2a231c, 1.4));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
    key.position.set(2.5, 3.4, 3.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.6);
    rim.position.set(-2.8, 2.2, -3.0);
    scene.add(rim);
  } else {
    scene.add(new THREE.HemisphereLight(0x627cb0, 0x3a2e22, 1.0));
    const key = new THREE.DirectionalLight(0xffc890, 2.2);
    key.position.set(3, 8, 4);
    scene.add(key);
  }
}

interface Entry {
  id: string;
  name: string;
  visual: (typeof MONSTERS)[number]['visual'];
  family: string;
  scale: number;
  boss: boolean;
}

function entries(ids: string[]): Entry[] {
  const all: Entry[] = [
    ...MONSTERS.map((m) => ({ id: m.id, name: m.name, visual: m.visual, family: m.family, scale: m.scale, boss: false })),
    ...BOSSES.map((b) => ({ id: b.id, name: b.name, visual: b.visual, family: b.family, scale: b.scale, boss: true })),
  ];
  const out: Entry[] = [];
  for (const w of ids) {
    if (w.startsWith('family:')) out.push(...all.filter((e) => e.family === w.slice(7) && !e.boss));
    else if (w === 'bosses') out.push(...all.filter((e) => e.boss));
    else {
      const e = all.find((x) => x.id === w);
      if (e) out.push(e);
    }
  }
  return out;
}

function build(e: Entry, rank = e.boss ? 'boss' : 'normal') {
  const look = lookFor(e.visual, e.family, rank);
  const t0 = performance.now();
  const m = instanceCreature(look, 1, { rank });
  const ms = performance.now() - t0;
  const anim = new CreatureAnimator(m.root, m.bones, m.root.userData.creature as CreatureInfo, new Random(7));
  return { ...m, anim, ms, look };
}

function cost(root: THREE.Object3D): { tris: number; calls: number } {
  let tris = 0;
  let calls = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    tris += ((m.geometry.getIndex()?.count ?? 0) / 3) | 0;
    calls++;
  });
  return { tris, calls };
}

/** Drives the animator into a named state, the way Enemy does. */
/** Height span the posed body occupies (bone joints, world space), so hovering bodies stay in frame. */
function posedSpan(m: { bones: Record<string, THREE.Bone>; root: THREE.Object3D }, info: CreatureInfo, sz: number): { h: number; cy: number } {
  m.root.updateMatrixWorld(true);
  let lo = Infinity;
  let hi = -Infinity;
  const p = new THREE.Vector3();
  for (const b of Object.values(m.bones)) {
    b.getWorldPosition(p);
    lo = Math.min(lo, p.y);
    hi = Math.max(hi, p.y);
  }
  const top = Math.max(info.height * sz, hi + info.height * sz * 0.12);
  const bottom = Math.max(0, Math.min(lo - info.height * sz * 0.1, top - info.height * sz));
  return { h: top - bottom, cy: (top + bottom) * 0.5 };
}

function drive(anim: CreatureAnimator, root: THREE.Object3D, state: string): void {
  const dt = 1 / 30;
  let t = 0;
  const step = (n: number, action: RigAction, actionT: (i: number) => number, move = 0, deathT = 0) => {
    for (let i = 0; i < n; i++) {
      t += dt;
      if (move) root.position.z += move * dt;
      root.updateMatrixWorld(true);
      anim.update(dt, { locomotion: move ? 1 : 0, action, actionT: actionT(i), time: t, deathT });
    }
  };
  step(20, 'idle', () => 0);
  switch (state) {
    case 'idle':
      step(25, 'idle', () => 0);
      break;
    case 'walk':
      step(40, 'walk', () => 0, 1.3);
      step(7, 'walk', () => 0, 1.3);
      break;
    case 'run':
      step(40, 'walk', () => 0, 4.5);
      step(5, 'walk', () => 0, 4.5);
      break;
    case 'windup':
      step(18, 'attack', (i) => i / 22);
      break;
    case 'strike':
      step(22, 'attack', (i) => i / 22);
      step(3, 'attack', (i) => (i + 1) / 12);
      break;
    case 'cast':
      step(27, 'cast', (i) => i / 30);
      break;
    case 'hit':
      step(3, 'hit', (i) => i / 10);
      break;
    case 'stagger':
      anim.react('stagger', 0);
      step(6, 'hit', (i) => i / 10);
      break;
    case 'spawn':
      step(9, 'spawn', (i) => i / 18);
      break;
    case 'death':
      step(1, 'death', () => 0, 0, 0.01);
      for (let i = 0; i < 26; i++) step(1, 'death', () => 0, 0, Math.min(1, (i + 1) / 24));
      break;
  }
  root.position.z = 0;
  root.updateMatrixWorld(true);
}

function frame(cam: THREE.PerspectiveCamera, h: number, yaw: number, cy: number, pitch = 0.18, len = 0): void {
  const size = Math.max(h, len * (0.7 + 0.45 * Math.abs(Math.sin(yaw))), 0.6) * 1.4;
  const dist = (size * 0.5) / Math.tan((cam.fov * Math.PI) / 360) + len * 0.3;
  cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, cy + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  cam.lookAt(0, cy, 0);
  cam.updateProjectionMatrix();
}

async function ready(): Promise<void> {
  await preloadSets(['bone', 'flesh', 'leather', 'fur', 'cloth', 'iron', 'rust', 'steel', 'cave', 'basalt', 'bark', 'moss', 'ice', 'lava_crust'] as never);
}

function sheet(cols: number, cw: number, ch: number, rows: number, title: string) {
  const c = document.createElement('canvas');
  c.width = cols * cw;
  c.height = rows * ch + 28;
  const g = c.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, c.width, c.height);
  g.font = '13px monospace';
  g.fillStyle = INK;
  g.fillText(title, 8, 18);
  return { c, g };
}

export async function lineup(ids: string[], mood: 'studio' | 'dungeon' = 'studio', big = false, yaw = 0.6): Promise<string> {
  await ready();
  const list = entries(ids);
  const cols = Math.min(big ? 3 : 6, list.length);
  const cw = big ? 460 : 230;
  const chh = big ? 580 : 290;
  const rows = Math.ceil(list.length / cols);
  const { c, g } = sheet(cols, cw, chh, rows, `creatures: ${ids.join(' ')}`);
  const r = studio(cw, chh - 40);
  const cam = new THREE.PerspectiveCamera(30, cw / (chh - 40), 0.05, 200);
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1c1f27);
    lights(scene, mood);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 1 }));
    scene.add(floor);
    let label = e.id;
    let line2 = '';
    try {
      const m = build(e);
      scene.add(m.root);
      drive(m.anim, m.root, 'idle');
      const info = m.root.userData.creature as CreatureInfo;
      const k = cost(m.root);
      const sz = m.look.size ?? 1;
      const span = posedSpan(m, info, sz);
      frame(cam, span.h, yaw, span.cy, 0.15, info.length * sz);
      r.render(scene, cam);
      line2 = `${k.tris} tris ${k.calls} calls ${m.ms.toFixed(0)}ms`;
    } catch (err) {
      line2 = `ERROR ${String(err).slice(0, 60)}`;
      console.log(String((err as Error).stack ?? err));
    }
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * chh + 28;
    g.drawImage(r.domElement, x, y);
    g.fillStyle = INK;
    g.fillText(label, x + 6, y + chh - 26);
    g.fillStyle = DIM;
    g.fillText(line2, x + 6, y + chh - 10);
  }
  return c.toDataURL('image/png');
}

const STATES = ['idle', 'walk', 'run', 'windup', 'strike', 'cast', 'hit', 'stagger', 'spawn', 'death'];

export async function poses(ids: string[], yaw = 1.1): Promise<string> {
  await ready();
  const list = entries(ids);
  const cw = 150;
  const chh = 190;
  const { c, g } = sheet(STATES.length, cw, chh, list.length, `poses: ${STATES.join(' ')}`);
  const r = studio(cw, chh - 20);
  const cam = new THREE.PerspectiveCamera(32, cw / (chh - 20), 0.05, 200);
  for (let row = 0; row < list.length; row++) {
    const e = list[row]!;
    for (let col = 0; col < STATES.length; col++) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1c1f27);
      lights(scene, 'studio');
      scene.add(new THREE.Mesh(new THREE.CircleGeometry(6, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 1 })));
      try {
        const m = build(e);
        scene.add(m.root);
        drive(m.anim, m.root, STATES[col]!);
        const info = m.root.userData.creature as CreatureInfo;
        const sz = m.look.size ?? 1;
        frame(cam, info.height * 1.1 * sz, yaw, info.height * 0.5 * sz, 0.2, info.length * 1.3 * sz);
        r.render(scene, cam);
      } catch (err) {
        console.log(String((err as Error).stack ?? err));
      }
      const x = col * cw;
      const y = row * chh + 28;
      g.drawImage(r.domElement, x, y);
      g.fillStyle = DIM;
      g.fillText(col === 0 ? e.id.slice(0, 18) : STATES[col]!, x + 4, y + chh - 6);
    }
  }
  return c.toDataURL('image/png');
}

const RANK_COLS = ['normal', 'champion', 'elite', 'rare', 'mini-boss', 'corpse'];

/** One row per monster: each rank's look, the mini-boss crown, and the body it leaves. */
export async function ranks(ids: string[]): Promise<string> {
  await ready();
  const list = entries(ids);
  const cw = 200;
  const chh = 240;
  const { c, g } = sheet(RANK_COLS.length, cw, chh, list.length, `ranks: ${RANK_COLS.join(' ')}`);
  const r = studio(cw, chh - 20);
  const cam = new THREE.PerspectiveCamera(32, cw / (chh - 20), 0.05, 200);
  for (let row = 0; row < list.length; row++) {
    const e = list[row]!;
    for (let col = 0; col < RANK_COLS.length; col++) {
      const what = RANK_COLS[col]!;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1c1f27);
      lights(scene, 'dungeon');
      scene.add(new THREE.Mesh(new THREE.CircleGeometry(6, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b2a28, roughness: 1 })));
      try {
        const rank = what === 'mini-boss' ? 'rare' : what === 'corpse' ? 'elite' : what;
        const m = build(e, rank);
        scene.add(m.root);
        if (what === 'mini-boss') miniBossFlair(m.root, rank);
        drive(m.anim, m.root, what === 'corpse' ? 'death' : 'idle');
        const info = m.root.userData.creature as CreatureInfo;
        const sz = m.look.size ?? 1;
        frame(cam, info.height * 1.1 * sz, 0.7, info.height * 0.5 * sz, 0.25, info.length * 1.3 * sz);
        r.render(scene, cam);
      } catch (err) {
        console.log(String((err as Error).stack ?? err));
      }
      const x = col * cw;
      const y = row * chh + 28;
      g.drawImage(r.domElement, x, y);
      g.fillStyle = DIM;
      g.fillText(col === 0 ? e.id.slice(0, 22) : what, x + 4, y + chh - 6);
    }
  }
  clearCorpses();
  return c.toDataURL('image/png');
}

export const SHEETS: Record<string, (ids: string[]) => Promise<string>> = {
  lineup: (ids) => lineup(ids),
  /** The poses seen nearly face on. */
  posesFront: (ids) => poses(ids, 0.3),
  game: (ids) => lineup(ids, 'dungeon'),
  big: (ids) => lineup(ids, 'studio', true),
  side: (ids) => lineup(ids, 'studio', true, Math.PI / 2),
  poses,
  ranks,
};

void rankTier;
