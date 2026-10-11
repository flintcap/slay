/**
 * Sheets for `tools/npc-sheet.mjs`: the townsfolk, built by the real code
 * (`src/art/npc/*`) and posed by the real hero animator. Each entry in
 * `SHEETS` returns a PNG data URI, or for `check` a JSON report.
 *
 *   folk     the nine at rest, front (--yaw=0.7 for three-quarter, 3.14 for the back)
 *   faces    head and shoulders
 *   jobs     frames through each one's work loop (--loop=work2|rest|talk, --ids=kale,hesk)
 *   check    build time, draws, loops registered, a long run of every loop
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadMeshCache } from '../src/art/hero/MeshCache';
import { HeroAnimator } from '../src/art/hero/Animator';
import { actionFor } from '../src/art/hero/Actions';
import { buildFolk, NPC_LOOK_IDS, type FolkModel } from '../src/art/npc/Folk';

const BG = '#16181e';
const INK = '#c9d1de';

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

function sheet(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  g.font = '13px monospace';
  return { c, g };
}

let floor: THREE.Object3D | null = null;
function floorGrid(): THREE.Object3D {
  if (!floor) {
    const g = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 1 }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.002;
    g.add(plane);
    g.add(new THREE.GridHelper(40, 80, 0x4a5060, 0x3a3e48));
    floor = g;
  }
  return floor;
}

function shoot(
  g: CanvasRenderingContext2D,
  obj: THREE.Object3D,
  o: { x: number; y: number; w: number; h: number; yaw: number; target: THREE.Vector3; dist: number; fov?: number; pitch?: number },
): void {
  const r = studio(o.w, o.h);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  if (!envTex) {
    const pm = new THREE.PMREMGenerator(r);
    envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  scene.environment = envTex;
  scene.environmentIntensity = 0.22;
  scene.add(new THREE.HemisphereLight(0x8a96b0, 0x2a2018, 0.7));
  const key = new THREE.DirectionalLight(0xffe2c4, 2.6);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8ab4ff, 1.4);
  rim.position.set(-3, 2.5, -3);
  scene.add(rim);
  const holder = new THREE.Group();
  holder.add(obj);
  holder.add(floorGrid());
  holder.rotation.y = o.yaw;
  scene.add(holder);
  const cam = new THREE.PerspectiveCamera(o.fov ?? 30, o.w / o.h, 0.05, 60);
  const pitch = o.pitch ?? 0.08;
  cam.position.set(o.target.x, o.target.y + Math.sin(pitch) * o.dist, o.target.z + Math.cos(pitch) * o.dist);
  cam.lookAt(o.target);
  r.render(scene, cam);
  g.drawImage(r.domElement, o.x, o.y);
  holder.remove(obj);
}

interface Actor {
  folk: FolkModel;
  anim: HeroAnimator;
}

const actors = new Map<string, Actor>();
async function actor(id: string): Promise<Actor> {
  let a = actors.get(id);
  if (!a) {
    await loadMeshCache();
    const folk = buildFolk(id);
    const anim = new HeroAnimator(folk.bones);
    anim.setGrip(folk.grip);
    anim.follow(folk.root);
    a = { folk, anim };
    actors.set(id, a);
  }
  return a;
}

/** Plays `loop` from its start and runs the animator to `t` seconds. */
function pose(a: Actor, loop: string, t: number): void {
  a.anim.reset();
  a.anim.setGrip(a.folk.grip);
  a.anim.play(loop, { fade: 0, restart: true });
  const dt = 1 / 30;
  for (let s = 0; s < t; s += dt) a.anim.update(dt);
  a.folk.root.updateMatrixWorld(true);
}

function loopName(a: Actor, which: string): string {
  const l = a.folk.loops as unknown as Record<string, string | undefined>;
  return l[which] ?? a.folk.loops.work;
}

function ids(flags: Record<string, string | boolean>): string[] {
  return typeof flags.ids === 'string' ? flags.ids.split(',') : [...NPC_LOOK_IDS];
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  g.fillStyle = INK;
  g.fillText(text, x, y);
}

export const SHEETS: Record<string, (flags: Record<string, string | boolean>) => Promise<string>> = {
  async folk(flags) {
    const list = ids(flags);
    const yaw = Number(flags.yaw ?? 0);
    const W = 210;
    const H = 420;
    const { c, g } = sheet(W * list.length, H + 20);
    for (let i = 0; i < list.length; i++) {
      const a = await actor(list[i]!);
      pose(a, loopName(a, String(flags.loop ?? 'rest')), Number(flags.t ?? 1.5));
      shoot(g, a.folk.root, { x: i * W, y: 20, w: W, h: H, yaw, target: new THREE.Vector3(0, Number(flags.ty ?? 0.98), 0), dist: Number(flags.dist ?? 5.6) });
      label(g, list[i]!, i * W + 8, 15);
    }
    return c.toDataURL('image/png');
  },

  async faces(flags) {
    const list = ids(flags);
    const yaw = Number(flags.yaw ?? 0.35);
    const W = 200;
    const H = 240;
    const { c, g } = sheet(W * Math.min(5, list.length), (H + 20) * Math.ceil(list.length / 5));
    for (let i = 0; i < list.length; i++) {
      const a = await actor(list[i]!);
      pose(a, a.folk.loops.rest, 1.0);
      const head = new THREE.Vector3();
      a.folk.bones.head!.getWorldPosition(head);
      const col = i % 5;
      const row = Math.floor(i / 5);
      shoot(g, a.folk.root, { x: col * W, y: row * (H + 20) + 20, w: W, h: H, yaw, target: new THREE.Vector3(0, head.y - 0.02, 0), dist: 1.5, pitch: 0.05 });
      label(g, list[i]!, col * W + 8, row * (H + 20) + 15);
    }
    return c.toDataURL('image/png');
  },

  async jobs(flags) {
    const list = ids(flags);
    const frames = Number(flags.frames ?? 5);
    const which = String(flags.loop ?? 'work');
    const yaw = Number(flags.yaw ?? 0.5);
    const W = 180;
    const H = 300;
    const { c, g } = sheet(W * frames, (H + 18) * list.length);
    for (let r = 0; r < list.length; r++) {
      const a = await actor(list[r]!);
      const name = loopName(a, which);
      const def = actionFor(name, a.anim.moveKind, 0);
      const period = def.keys[def.keys.length - 1]!.t;
      for (let f = 0; f < frames; f++) {
        // Start a second in, so any fade or kneel has settled.
        const t = 1 + (period * f) / frames;
        pose(a, name, t);
        shoot(g, a.folk.root, { x: f * W, y: r * (H + 18) + 18, w: W, h: H, yaw, target: new THREE.Vector3(0, 0.9, 0), dist: 5.4 });
        label(g, `${list[r]} ${which} ${(t - 1).toFixed(1)}s`, f * W + 6, r * (H + 18) + 13);
      }
    }
    return c.toDataURL('image/png');
  },

  async check() {
    const lines: string[] = [];
    let pass = true;
    const bad = (s: string) => {
      pass = false;
      lines.push(`FAIL ${s}`);
    };
    await loadMeshCache();
    let total = 0;
    let draws = 0;
    for (const id of NPC_LOOK_IDS) {
      const t0 = performance.now();
      let a: Actor;
      try {
        a = await actor(id);
      } catch (e) {
        bad(`${id}: ${String(e).slice(0, 200)}`);
        continue;
      }
      const ms = performance.now() - t0;
      total += ms;
      let meshes = 0;
      let shadow = 0;
      let tris = 0;
      a.folk.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.visible) return;
        meshes++;
        if (m.castShadow) shadow++;
        const idx = m.geometry.getIndex();
        tris += (idx ? idx.count : m.geometry.getAttribute('position').count) / 3;
      });
      draws += meshes + shadow;
      if (meshes > 16) bad(`${id}: ${meshes} meshes, budget 16`);
      // Every loop: registered, and ten seconds of it leave every bone finite.
      const loops = Object.entries(a.folk.loops).filter(([, v]) => v) as Array<[string, string]>;
      for (const [k, name] of loops) {
        const def = actionFor(name, a.anim.moveKind, 0);
        if (!def.loop) {
          bad(`${id}: ${k} loop "${name}" is not registered`);
          continue;
        }
        pose(a, name, 10);
        let finite = true;
        for (const b of Object.values(a.folk.bones)) {
          const q = b.quaternion;
          if (!Number.isFinite(q.x + q.y + q.z + q.w) || !Number.isFinite(b.position.x + b.position.y + b.position.z)) finite = false;
        }
        if (!finite) bad(`${id}: ${k} leaves a bone NaN`);
      }
      lines.push(`ok   ${id.padEnd(9)} ${String(meshes).padStart(2)} meshes, ${shadow} cast shadow, ${Math.round(tris)} tris, built in ${ms | 0} ms, loops ${loops.map(([k]) => k).join('/')}`);
    }
    lines.push(`all nine: ${draws} draws (colour + one shadow pass), built cold in ${total | 0} ms`);
    if (draws > 240) bad(`all nine: ${draws} draws, budget 240`);
    return JSON.stringify({ lines, pass });
  },
};
