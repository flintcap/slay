/**
 * The effect lab: a dark stone floor under the game's real renderer (HDR,
 * bloom, grade, ACES), with every effect family fired on a fixed clock. It
 * boots in seconds instead of minutes, so the look can be judged often.
 *
 * `window.VFXLAB.run(name)` resets the floor, plays scene `name` on a fixed
 * 60 Hz clock up to its shot time and renders that frame. `tools/check-decals.mjs`
 * drives it and saves one picture per scene.
 */
import * as THREE from 'three';
import { Renderer } from '../src/core/Renderer';
import { FXSystem } from '../src/fx/Particles';
import { DecalSystem, decalKinds } from '../src/fx/Decals';
import { EffectSystem, SCHOOLS, ELEMENTS, type School } from '../src/fx/Effects';
import { BodyFX } from '../src/fx/BodyFX';
import { LootFX } from '../src/fx/LootFX';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const label = document.getElementById('label')!;
const renderer = new Renderer(canvas);
renderer.setQuality('high');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070605);
scene.fog = new THREE.FogExp2(0x0a0908, 0.025);
renderer.applyEnvironment(scene, 0.25);

// A dark, rough flagstone floor and a few columns to catch light.
const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.92, metalness: 0 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60, 1, 1), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const stone = new THREE.MeshStandardMaterial({ color: 0x5a5048, roughness: 0.85 });
for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, -10]] as const) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 5, 10), stone);
  c.position.set(x, 2.5, z);
  scene.add(c);
}
scene.add(new THREE.HemisphereLight(0x8090a8, 0x201810, 0.35));
const key = new THREE.DirectionalLight(0xffe0c0, 0.5);
key.position.set(6, 12, 4);
scene.add(key);
const torch = new THREE.PointLight(0xff9a40, 6, 14, 2);
torch.position.set(-6, 2.5, -6);
scene.add(torch);

const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.35, 260);
{
  const d = 15.5;
  const pitch = 0.92;
  const yaw = Math.PI * 0.25;
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d);
  camera.lookAt(0, 0.8, 0);
}

const quality = renderer.quality;
const fx = new FXSystem(scene, quality);
const decals = new DecalSystem(scene, quality);
const effects = new EffectSystem(scene, fx, decals, quality);
effects.setCamera(camera);
const body = new BodyFX(effects);
const loot = new LootFX(effects);

const bodyMat = new THREE.MeshStandardMaterial({ color: 0x6a6058, roughness: 0.7 });
function dummy(x: number, z: number): THREE.Object3D {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 4, 10), bodyMat);
  m.position.y = 0.85;
  g.add(m);
  g.position.set(x, 0, z);
  scene.add(g);
  dummies.push(g);
  return g;
}
const dummies: THREE.Object3D[] = [];

type Plan = { at: number; fn: () => void };
interface LabScene {
  shot: number;
  plan: () => Plan[];
}

const v = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
const row = (i: number, n: number, span: number): number => (i - (n - 1) / 2) * (span / Math.max(1, n - 1));

const SCENES: Record<string, LabScene> = {
  bolts: {
    shot: 0.32,
    plan: () => SCHOOLS.map((s, i) => ({
      at: 0,
      fn: () => { effects.projectile(v(-6, 1.2, row(i, 7, 10)), v(8, 1.2, row(i, 7, 10)), { element: s, speed: 18 }); },
    })),
  },
  impacts: {
    shot: 0.09,
    plan: () => SCHOOLS.map((s, i) => ({ at: 0, fn: () => effects.impact(s, row(i, 7, 11), 1, 0, { scale: 1.2 }) })),
  },
  blasts: {
    shot: 0.14,
    plan: () => SCHOOLS.map((s, i) => ({ at: 0, fn: () => effects.explosion(row(i % 4, 4, 10), 0.4, i < 4 ? -2.6 : 2.6, { element: s, radius: 2.2 }) })),
  },
  novas: {
    shot: 0.28,
    plan: () => SCHOOLS.map((s, i) => ({ at: 0, fn: () => { effects.nova(row(i % 4, 4, 10), i < 4 ? -2.6 : 2.6, 2.4, { element: s, mark: true }); } })),
  },
  tells: {
    shot: 0.7,
    plan: () => [
      { at: 0, fn: () => { decals.telegraph('circle', -4, -3, 2.2, 0, 1.0, 0xff4a20); } },
      { at: 0.35, fn: () => { decals.telegraph('circle', 0, -3, 2.2, 0, 1.0, 0x8a40ff); } },
      { at: 0, fn: () => { decals.telegraph('cone', 4, -3, 3.2, Math.PI * 0.75, 0.8, 0xffa020); } },
      { at: 0, fn: () => { decals.telegraph('line', -6, 2.5, 8, Math.PI / 2, 0.9, 0x40a0ff); } },
      { at: 0.1, fn: () => { decals.telegraph('ring', 4, 3, 2.4, 0, 0.6, 0x80ff60); } },
      { at: 0.55, fn: () => { decals.telegraph('circle', 0, 3.5, 1.6, 0, 0.12, 0xff2040); } },
    ],
  },
  marks: {
    shot: 1.2,
    plan: () => decalKinds().filter((k) => k !== 'shadow').map((k, i, all) => {
      const cols = 7;
      const x = row(i % cols, cols, 12);
      const z = row(Math.floor(i / cols), Math.ceil(all.length / cols), 9);
      return { at: 0, fn: () => decals.add(k, x, z, 0.75, 0) };
    }),
  },
  beams: {
    shot: 0.16,
    plan: () => {
      const a = dummy(-5, -3);
      const b = dummy(-5, 3);
      return [
        { at: 0, fn: () => { effects.beam(v(-6, 1.2, -4.5), v(6, 1.2, -4.5), { element: 'arcane', duration: 0.5 }); } },
        { at: 0, fn: () => { effects.beam(v(-6, 1.2, -2.5), v(6, 1.2, -2.5), { element: 'cold', duration: 0.5 }); } },
        { at: 0, fn: () => { effects.channel(() => a.position.clone().setY(1.2), () => v(5, 1.2, 0), { element: 'fire' }); } },
        { at: 0, fn: () => { effects.chainLightning([v(-5, 1.2, 1.5), v(-1, 1, 2.5), v(2, 1, 1.2), v(5, 1, 3)]); } },
        { at: 0, fn: () => { effects.cone(b.position.clone().setY(0.8), v(1, 0, 0.3), 0.5, 5, { element: 'fire', duration: 0.6 }); } },
        { at: 0, fn: () => { effects.tether(() => v(2, 1.2, 5), () => v(6, 1.2, 4), { element: 'poison' }); } },
      ];
    },
  },
  bodies: {
    shot: 0.45,
    plan: () => {
      const d = [dummy(-5, -2.5), dummy(-1.5, -2.5), dummy(2, -2.5), dummy(5.5, -2.5)];
      return [
        { at: 0, fn: () => { effects.aura(d[0]!, { element: 'fire' }); } },
        { at: 0, fn: () => { effects.shield(d[1]!, 1.3); } },
        { at: 0.3, fn: () => { effects.shield(d[1]!, 1.3).setEndpoint?.(v(-1.5, 1.2, -1.3)); } },
        { at: 0, fn: () => { effects.whirlwind(d[2]!, { radius: 1.4 }); } },
        { at: 0, fn: () => { effects.aura(d[3]!, { element: 'poison' }); } },
        { at: 0, fn: () => { effects.summonCircle(-3.5, 3, 1.8, 1.6); } },
        { at: 0.05, fn: () => effects.levelUp(1, 0, 3) },
        { at: 0.25, fn: () => effects.teleportIn(5, 0, 3) },
      ];
    },
  },
  swings: {
    shot: 0.2,
    plan: () => {
      const out: Plan[] = [];
      SCHOOLS.forEach((s, i) => {
        const x = row(i, 7, 11);
        out.push({ at: 0, fn: () => body.labSwing(x, 0, s, i * 0.9) });
      });
      return out;
    },
  },
  loot: {
    shot: 1.0,
    plan: () => (['normal', 'magic', 'rare', 'set', 'unique'] as const).map((r, i) => ({
      at: 0, fn: () => loot.labBeam(row(i, 5, 10), 0, r),
    })),
  },
  status: {
    shot: 0.9,
    plan: () => {
      const looks = ['burning', 'chilled', 'frozen', 'shocked', 'poisoned', 'bleeding', 'stunned', 'cursed'] as const;
      return looks.map((st, i) => {
        const d = dummy(row(i % 4, 4, 10), i < 4 ? -2.5 : 2.5);
        return { at: 0, fn: () => body.labStatus(d, st) };
      });
    },
  },
  storm: {
    shot: 0.3,
    plan: () => {
      const out: Plan[] = [];
      for (let i = 0; i < 18; i++) {
        const s: School = (['fire', 'fire', 'lightning', 'cold', 'arcane', 'poison'] as const)[i % 6]!;
        out.push({ at: i * 0.012, fn: () => effects.explosion(Math.sin(i * 2.1) * 2.2, 0.4, Math.cos(i * 1.7) * 2.2, { element: s, radius: 2.5 }) });
        out.push({ at: i * 0.01, fn: () => { effects.projectile(v(-7, 1.2, row(i, 18, 10)), v(7, 1.2, -row(i, 18, 10)), { element: s }); } });
      }
      return out;
    },
  },
};

let clock = 0;

function reset(): void {
  effects.clear();
  fx.clear();
  decals.clear();
  body.clear();
  loot.clear();
  for (const d of dummies) scene.remove(d);
  dummies.length = 0;
}

function step(dt: number): void {
  clock += dt;
  effects.update(dt, clock, camera);
  body.update(dt, camera);
  loot.update(dt);
  fx.update(dt, clock, camera);
  decals.update(dt);
}

async function run(name: string): Promise<boolean> {
  const sc = SCENES[name];
  if (!sc) return false;
  reset();
  label.textContent = name;
  const plan = sc.plan().sort((a, b) => a.at - b.at);
  let t = 0;
  let k = 0;
  const dt = 1 / 60;
  // Let the floor settle a beat so nothing from the last scene lingers.
  for (let i = 0; i < 6; i++) step(dt);
  while (t <= sc.shot) {
    while (k < plan.length && plan[k]!.at <= t + 1e-6) plan[k++]!.fn();
    step(dt);
    t += dt;
  }
  renderer.render(scene, camera, dt, clock);
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  return true;
}

(window as unknown as { VFXLAB: unknown }).VFXLAB = {
  scenes: Object.keys(SCENES),
  run,
  elements: ELEMENTS,
  parts: { fx, decals, effects, body, loot, scene, camera, renderer, bodyMat },
  ready: true,
};
