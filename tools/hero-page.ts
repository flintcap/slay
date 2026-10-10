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
  opts: { x: number; y: number; w: number; h: number; yaw: number; target: THREE.Vector3; dist: number; fov?: number; pitch?: number },
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
    return JSON.stringify({ pass, lines });
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
