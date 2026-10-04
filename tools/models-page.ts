/**
 * Lineup sheets for `tools/models-sheet.mjs`. Runs in the browser on the Vite
 * dev server against the real model code, without booting the game.
 *
 * Every sheet answers one question by looking:
 *  - classes:  does each class read as itself, bare and in low, mid and top
 *              gear, from the front, from behind, and at the game camera?
 *  - monsters: does every family have its own silhouette, and do elites,
 *              champions and bosses look tougher than the rank and file?
 *  - npcs:     does every camp resident say what they do before they speak?
 *
 * Each sheet also prints triangle and draw-call counts per figure, because a
 * lineup that looks good and costs too much is not finished.
 */
import * as THREE from 'three';
import type { CharClassId, EquipSlot, Item, ItemRarity, MonsterVisual } from '../src/types';
import { Random } from '../src/core/RNG';
import * as CM from '../src/art/CharacterModels';
import { buildItemModel } from '../src/art/ItemModels';
import { compactModel } from '../src/art/ModelBudget';
import { Animator } from '../src/art/Animation';
import { ITEM_BASES } from '../src/data/itemBases';
import { MONSTERS } from '../src/data/monsters';
import { BOSSES } from '../src/data/bosses';
import * as MM from '../src/entities/MonsterModels';

const BG = '#14161c';
const INK = '#c9d1de';
const DIM = '#7d8796';

const baseById = new Map(ITEM_BASES.map((b) => [b.id, b]));

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------

let renderer: THREE.WebGLRenderer | null = null;
let envMap: THREE.Texture | null = null;

function studio(w: number, h: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = false;
    envMap = buildEnv(renderer);
  }
  renderer.setSize(w, h, false);
  return renderer;
}

/** The same reflection sky the game builds, so metal reads the way it will in play. */
function buildEnv(r: THREE.WebGLRenderer): THREE.Texture | null {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(50, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vDir; void main(){
        float up = vDir.y*0.5+0.5;
        vec3 zenith=vec3(0.10,0.13,0.20), horizon=vec3(0.26,0.23,0.21), ground=vec3(0.09,0.07,0.06);
        vec3 col = up>0.5 ? mix(horizon,zenith,(up-0.5)*2.0) : mix(ground,horizon,up*2.0);
        float a=max(0.0,dot(normalize(vDir),normalize(vec3(0.6,0.5,0.4))));
        float b=max(0.0,dot(normalize(vDir),normalize(vec3(-0.5,0.3,-0.6))));
        col += vec3(0.55,0.40,0.26)*pow(a,26.0); col += vec3(0.22,0.30,0.45)*pow(b,18.0);
        gl_FragColor=vec4(col,1.0); }`,
    }),
  );
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(r);
  try {
    return pmrem.fromScene(scene, 0.04).texture;
  } catch {
    return null;
  } finally {
    pmrem.dispose();
  }
}

function lights(scene: THREE.Scene, mood: 'studio' | 'dungeon'): void {
  if (envMap) {
    scene.environment = envMap;
    scene.environmentIntensity = 0.55;
  }
  if (mood === 'studio') {
    scene.add(new THREE.HemisphereLight(0x9fb0cc, 0x2a231c, 1.5));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.6);
    key.position.set(2.5, 3.4, 3.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 1.7);
    rim.position.set(-2.8, 2.2, -3.0);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffd0a8, 0.7);
    fill.position.set(-2.0, 0.6, 2.4);
    scene.add(fill);
  } else {
    // Roughly the dungeon: dim cool ambient, one warm torch key from above.
    scene.add(new THREE.HemisphereLight(0x627cb0, 0x3a2e22, 1.5));
    const key = new THREE.DirectionalLight(0xffc890, 2.4);
    key.position.set(3, 8, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7f9cff, 1.1);
    rim.position.set(-4, 5, -5);
    scene.add(rim);
  }
}

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  g.font = '12px monospace';
  return { c, g };
}

/** Triangles and draw calls an object costs, counted the way the renderer does. */
export function cost(root: THREE.Object3D): { tris: number; calls: number } {
  let tris = 0;
  let calls = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    let vis = true;
    for (let p: THREE.Object3D | null = m; p; p = p.parent) {
      if (!p.visible) vis = false;
      // Only the near level of a LOD counts: the others are not drawn.
      const lod = p.parent as THREE.LOD | null;
      if (lod && (lod as THREE.LOD).isLOD && lod.levels[0]?.object !== p) vis = false;
    }
    if (!vis) return;
    const geo = m.geometry;
    const idx = geo.getIndex();
    const n = idx ? idx.count : geo.getAttribute('position').count;
    const mats = Array.isArray(m.material) ? m.material.length : 1;
    tris += (n / 3) | 0;
    calls += mats;
  });
  return { tris, calls };
}

/** Frames an object's bounds into a portrait camera at the given yaw. */
function portrait(cam: THREE.PerspectiveCamera, obj: THREE.Object3D, yaw: number, pad = 1.08): void {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  const h = Math.max(size.y, size.x / cam.aspect, size.z / cam.aspect, 0.4) * pad;
  const dist = (h * 0.5) / Math.tan((cam.fov * Math.PI) / 360) + Math.max(size.x, size.z) * 0.5;
  const pitch = 0.12;
  cam.position.set(
    mid.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    mid.y + Math.sin(pitch) * dist,
    mid.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  cam.lookAt(mid);
  cam.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Characters and gear
// ---------------------------------------------------------------------------

type Tier = 'bare' | 'low' | 'mid' | 'top';

interface Kit {
  [slot: string]: [string, ItemRarity];
}

/** What each class plausibly wears at each stage of a run. */
const KITS: Record<CharClassId, Record<Exclude<Tier, 'bare'>, Kit>> = {
  warden: {
    low: { mainHand: ['sword.short', 'normal'], offHand: ['shield.buckler', 'normal'], chest: ['chest.leather', 'normal'], boots: ['boots.boots', 'normal'], helm: ['helm.cap', 'normal'] },
    mid: { mainHand: ['sword.broad', 'magic'], offHand: ['shield.kite', 'rare'], chest: ['chest.chainmail', 'rare'], helm: ['helm.helm', 'magic'], gloves: ['gloves.gauntlets', 'magic'], boots: ['boots.greaves', 'rare'], belt: ['belt.belt', 'magic'] },
    top: { mainHand: ['sword.conquest', 'mythic'], offHand: ['shield.aegis', 'unique'], chest: ['chest.archon', 'mythic'], helm: ['helm.corona', 'unique'], gloves: ['gloves.eclipse', 'set'], boots: ['boots.myrmidon', 'unique'], belt: ['belt.colossus', 'set'] },
  },
  pyromancer: {
    low: { mainHand: ['wand.wand', 'normal'], chest: ['chest.quilted', 'normal'], boots: ['boots.slippers', 'normal'] },
    mid: { mainHand: ['staff.battle', 'rare'], chest: ['chest.ghost', 'rare'], helm: ['helm.circlet', 'magic'], gloves: ['gloves.silk', 'magic'], boots: ['boots.slippers', 'rare'], belt: ['belt.sash', 'magic'] },
    top: { mainHand: ['staff.eldritch', 'mythic'], chest: ['chest.aeonshroud', 'unique'], helm: ['helm.diadem', 'mythic'], gloves: ['gloves.sorcerer', 'set'], boots: ['boots.wyrmhide', 'unique'], belt: ['belt.spiderweb', 'set'] },
  },
  shadowblade: {
    low: { mainHand: ['dagger.dagger', 'normal'], chest: ['chest.leather', 'normal'], boots: ['boots.boots', 'normal'] },
    mid: { mainHand: ['dagger.kris', 'rare'], offHand: ['dagger.dirk', 'magic'], chest: ['chest.studded', 'rare'], helm: ['helm.cap', 'magic'], gloves: ['gloves.leather', 'rare'], boots: ['boots.heavy', 'magic'], belt: ['belt.light', 'magic'] },
    top: { mainHand: ['dagger.mindrender', 'mythic'], offHand: ['dagger.nightblade', 'unique'], chest: ['chest.wyrmhide', 'unique'], helm: ['helm.skullcap', 'set'], gloves: ['gloves.bramble', 'set'], boots: ['boots.sharkskin', 'mythic'], belt: ['belt.vampirefang', 'unique'] },
  },
  stormcaller: {
    low: { mainHand: ['staff.short', 'normal'], chest: ['chest.quilted', 'normal'], boots: ['boots.boots', 'normal'] },
    mid: { mainHand: ['wand.yew', 'rare'], offHand: ['orb.eagle', 'magic'], chest: ['chest.scale', 'rare'], helm: ['helm.circlet', 'magic'], gloves: ['gloves.silk', 'magic'], boots: ['boots.heavy', 'rare'], belt: ['belt.girdle', 'magic'] },
    top: { mainHand: ['staff.worldtree', 'mythic'], chest: ['chest.kraken', 'unique'], helm: ['helm.coronet', 'set'], gloves: ['gloves.sorcerer', 'unique'], boots: ['boots.gale', 'unique'], belt: ['belt.worldheart', 'mythic'] },
  },
  revenant: {
    low: { mainHand: ['wand.femur', 'normal'], chest: ['chest.quilted', 'normal'] },
    mid: { mainHand: ['wand.grim', 'rare'], offHand: ['shield.bone', 'magic'], chest: ['chest.boneweave', 'rare'], helm: ['helm.bone', 'rare'], gloves: ['gloves.vampirebone', 'magic'], boots: ['boots.scarabshell', 'magic'], belt: ['belt.sash', 'magic'] },
    top: { mainHand: ['wand.heartstone', 'mythic'], offHand: ['shield.trollnest', 'unique'], chest: ['chest.dusk', 'unique'], helm: ['helm.spired', 'mythic'], gloves: ['gloves.vampirebone', 'set'], boots: ['boots.wyrmhide', 'set'], belt: ['belt.vampirefang', 'unique'] },
  },
  ranger: {
    low: { mainHand: ['bow.short', 'normal'], offHand: ['quiver.ragged', 'normal'], chest: ['chest.leather', 'normal'], boots: ['boots.boots', 'normal'] },
    mid: { mainHand: ['bow.composite', 'rare'], offHand: ['quiver.hunters', 'magic'], chest: ['chest.studded', 'rare'], helm: ['helm.cap', 'magic'], gloves: ['gloves.leather', 'magic'], boots: ['boots.heavy', 'rare'], belt: ['belt.light', 'magic'] },
    top: { mainHand: ['bow.matron', 'mythic'], offHand: ['quiver.endless', 'unique'], chest: ['chest.wyrmhide', 'set'], helm: ['helm.casque', 'unique'], gloves: ['gloves.bramble', 'set'], boots: ['boots.gale', 'mythic'], belt: ['belt.troll', 'unique'] },
  },
};

const CLASSES = Object.keys(KITS) as CharClassId[];

function fakeItem(baseId: string, rarity: ItemRarity): Item {
  const it: Item = { uid: `${baseId}:${rarity}`, baseId, name: baseId, rarity, ilvl: 1, mods: [], upgrade: 0, sockets: [], value: 0 };
  if (rarity === 'unique' || rarity === 'mythic') it.uniqueId = `u:${baseId}`;
  if (rarity === 'set') it.setId = 'set:lineup';
  return it;
}

interface Figure {
  root: THREE.Object3D;
  animator: Animator | null;
}

/** Builds and dresses a character exactly the way `Player` does. */
export function dressed(cls: CharClassId, tier: Tier): Figure {
  const kit: Kit = tier === 'bare' ? {} : KITS[cls][tier];
  const worn = new Set<EquipSlot>(Object.keys(kit) as EquipSlot[]);
  const built = CM.buildPlayerModel(cls, new Random(0x9d0117), worn);
  const holder = new THREE.Group();
  holder.add(built.root);
  const anim = new Animator(built.bones);
  anim.play('idle', { fade: 0 });
  const rng = new Random(7);
  const wear = (CM as unknown as Record<string, unknown>).wearItem as
    | ((body: THREE.Object3D, bones: Record<string, THREE.Bone>, slot: EquipSlot, item: Item, visual: unknown) => THREE.Object3D | null)
    | undefined;
  for (const [slot, [baseId, rarity]] of Object.entries(kit)) {
    const base = baseById.get(baseId);
    if (!base) continue;
    const item = fakeItem(baseId, rarity);
    const s = slot as EquipSlot;
    const onBody = wear ? wear(built.root, built.bones, s, item, base.visual) : null;
    if (onBody) continue;
    const socketKey = base.category === 'quiver' ? 'quiver' : undefined;
    const grip = s === 'mainHand' || s === 'offHand' ? CM.weaponGrip(base.category, base.slot === 'twoHand') : undefined;
    const mesh = compactModel(buildItemModel(base.visual, rng, rarity));
    CM.attachToSocket(holder, built.bones, s, mesh, socketKey, grip);
  }
  const main = kit.mainHand ? baseById.get(kit.mainHand[0]) : undefined;
  anim.setGrip(CM.carryGrip(main?.category, main?.slot === 'twoHand'));
  for (let i = 0; i < 24; i++) anim.update(1 / 30);
  return { root: holder, animator: anim };
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

const CELL_W = 190;
const CELL_H = 300;

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

function drawCell(
  g: CanvasRenderingContext2D,
  r: THREE.WebGLRenderer,
  scene: THREE.Scene,
  cam: THREE.PerspectiveCamera,
  obj: THREE.Object3D,
  yaw: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  scene.add(obj);
  portrait(cam, obj, yaw);
  r.render(scene, cam);
  g.drawImage(r.domElement, x, y, w, h);
  scene.remove(obj);
}

/** A row of figures seen through the real game camera at 1080p scale. */
function gameStrip(
  g: CanvasRenderingContext2D,
  figures: THREE.Object3D[],
  x: number,
  y: number,
  w: number,
  h: number,
  spacing = 2.3,
): void {
  const r = studio(w, h);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d1a18);
  lights(scene, 'dungeon');
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 40),
    new THREE.MeshStandardMaterial({ color: 0x3b3631, roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const n = figures.length;
  figures.forEach((f, i) => {
    f.position.set((i - (n - 1) / 2) * spacing, 0, 0);
    f.rotation.y = 0.35;
    scene.add(f);
  });
  // The game camera: 15.5 m boom at 0.92 rad pitch with a 46 degree lens on a
  // 1080 px tall frame. Narrow the lens so this crop keeps the same pixel scale.
  const fov = (2 * Math.atan(Math.tan((46 * Math.PI) / 360) * (h / 1080)) * 180) / Math.PI;
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.3, 200);
  const dist = 15.5;
  const pitch = 0.92;
  cam.position.set(0, 0.9 + Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  cam.lookAt(0, 0.9, 0);
  r.render(scene, cam);
  g.drawImage(r.domElement, x, y, w, h);
  for (const f of figures) scene.remove(f);
}

/** Frames just the head bone's neighbourhood, for faces and hair. */
function headShot(cam: THREE.PerspectiveCamera, obj: THREE.Object3D, yaw: number): void {
  obj.updateMatrixWorld(true);
  let head: THREE.Object3D | undefined;
  obj.traverse((o) => {
    if (!head && o.name === 'head' && (o as THREE.Bone).isBone) head = o;
  });
  const mid = new THREE.Vector3();
  head?.getWorldPosition(mid);
  mid.y += 0.08;
  const dist = 0.62;
  cam.position.set(mid.x + Math.sin(yaw) * dist, mid.y + 0.05, mid.z + Math.cos(yaw) * dist);
  cam.lookAt(mid);
  cam.updateProjectionMatrix();
}

/** Every class big in one gear tier: front, side, back, and the head close up. */
async function bodySheet(tierArg: Tier): Promise<string> {
  {
    const views = [0.35, Math.PI * 0.5, Math.PI + 0.3];
    const cw = 200;
    const ch = 360;
    const hw = 200;
    const W = CLASSES.length * cw + 20;
    const H = views.length * (ch + 10) + 2 * (hw + 10) + 40;
    const { c, g } = canvas(W, H);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    lights(scene, 'studio');
    const cam = new THREE.PerspectiveCamera(26, cw / ch, 0.05, 60);
    const hcam = new THREE.PerspectiveCamera(30, 1, 0.02, 20);
    for (let ci = 0; ci < CLASSES.length; ci++) {
      const cls = CLASSES[ci]!;
      const fig = dressed(cls, tierArg);
      const x = 10 + ci * cw;
      g.fillStyle = INK;
      g.fillText(cls, x, 16);
      let r = studio(cw, ch);
      for (let vi = 0; vi < views.length; vi++) drawCell(g, r, scene, cam, fig.root, views[vi]!, x, 24 + vi * (ch + 10), cw, ch);
      r = studio(hw, hw);
      for (let hi = 0; hi < 2; hi++) {
        scene.add(fig.root);
        headShot(hcam, fig.root, hi === 0 ? 0.4 : Math.PI * 0.62);
        r.render(scene, hcam);
        g.drawImage(r.domElement, x, 24 + views.length * (ch + 10) + hi * (hw + 10), hw, hw);
        scene.remove(fig.root);
      }
      await settle();
    }
    return c.toDataURL('image/png');
  }
}

export const SHEETS: Record<string, () => Promise<string>> = {
  bodies: () => bodySheet('bare'),
  'bodies-low': () => bodySheet('low'),
  'bodies-mid': () => bodySheet('mid'),
  'bodies-top': () => bodySheet('top'),

  /**
   * Every class in mid and top gear caught mid-stride and mid-swing, from the
   * side and the front: where skirts, capes, tassets and long hair clip.
   */
  async stride() {
    const tiers: Tier[] = ['mid', 'top'];
    const poses: Array<{ clip: string; t: number; yaw: number }> = [
      { clip: 'run', t: 0.3, yaw: Math.PI * 0.5 },
      { clip: 'run', t: 0.62, yaw: 0.3 },
      { clip: 'attack1', t: 0.2, yaw: 0.6 },
    ];
    const cw = 170;
    const ch = 300;
    const W = CLASSES.length * tiers.length * cw + 20;
    const H = poses.length * (ch + 10) + 30;
    const { c, g } = canvas(W, H);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    lights(scene, 'studio');
    const cam = new THREE.PerspectiveCamera(28, cw / ch, 0.05, 60);
    const r = studio(cw, ch);
    let col = 0;
    for (const cls of CLASSES) {
      for (const tier of tiers) {
        const x = 10 + col * cw;
        g.fillStyle = INK;
        g.fillText(`${cls} ${tier}`, x, 16);
        for (let pi = 0; pi < poses.length; pi++) {
          const pose = poses[pi]!;
          const fig = dressed(cls, tier);
          fig.animator?.play(pose.clip, { fade: 0 });
          for (let s = 0; s < Math.round(pose.t * 30); s++) fig.animator?.update(1 / 30);
          drawCell(g, r, scene, cam, fig.root, pose.yaw, x, 24 + pi * (ch + 10), cw, ch);
        }
        col++;
        await settle();
      }
    }
    return c.toDataURL('image/png');
  },

  async classes() {
    const tiers: Tier[] = ['bare', 'low', 'mid', 'top'];
    const views = [0.45, Math.PI + 0.45];
    const colW = CELL_W * views.length + 10;
    const W = colW * CLASSES.length + 10;
    const stripH = 300;
    const H = tiers.length * (CELL_H + 24) + 30 + stripH + 30;
    const { c, g } = canvas(W, H);
    const r = studio(CELL_W, CELL_H);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    lights(scene, 'studio');
    const cam = new THREE.PerspectiveCamera(28, CELL_W / CELL_H, 0.05, 60);
    const report: string[] = [];
    const topFigures: THREE.Object3D[] = [];
    for (let ci = 0; ci < CLASSES.length; ci++) {
      const cls = CLASSES[ci]!;
      g.fillStyle = INK;
      g.fillText(cls, 10 + ci * colW, 16);
      for (let ti = 0; ti < tiers.length; ti++) {
        const tier = tiers[ti]!;
        const fig = dressed(cls, tier);
        const y = 24 + ti * (CELL_H + 24);
        for (let vi = 0; vi < views.length; vi++) {
          drawCell(g, r, scene, cam, fig.root, views[vi]!, 10 + ci * colW + vi * CELL_W, y, CELL_W, CELL_H);
        }
        const k = cost(fig.root);
        g.fillStyle = DIM;
        g.fillText(`${tier}  ${k.tris} tris  ${k.calls} calls`, 10 + ci * colW, y + CELL_H + 14);
        report.push(`${cls}/${tier}: ${k.tris} tris, ${k.calls} calls`);
        if (tier === 'top' || tier === 'low') topFigures.push(fig.root);
        await settle();
      }
    }
    const sy = 24 + tiers.length * (CELL_H + 24) + 10;
    g.fillStyle = INK;
    g.fillText('game camera, 1080p scale: each class low then top', 10, sy);
    gameStrip(g, topFigures, 10, sy + 8, W - 20, stripH, 1.6);
    console.log(report.join('\n'));
    return c.toDataURL('image/png');
  },

  async monsters() {
    const picks: Array<{ label: string; visual: MonsterVisual; scale: number; family: string; rank: string }> = [];
    const families = new Map<string, typeof MONSTERS>();
    for (const m of MONSTERS) {
      const list = families.get(m.family) ?? [];
      list.push(m);
      families.set(m.family, list);
    }
    for (const [fam, list] of families) {
      const byRole = new Map<string, (typeof MONSTERS)[number]>();
      for (const m of list) if (!byRole.has(m.visual.body)) byRole.set(m.visual.body, m);
      const chosen = [...byRole.values()].slice(0, 4);
      for (const m of chosen) picks.push({ label: m.name, visual: m.visual, scale: m.scale, family: fam, rank: 'normal' });
      const first = list[0]!;
      picks.push({ label: `${first.name} (elite)`, visual: first.visual, scale: first.scale * 1.18, family: fam, rank: 'elite' });
    }
    for (const b of BOSSES.slice(0, 6)) picks.push({ label: `${b.name} (boss)`, visual: b.visual, scale: b.scale, family: b.family, rank: 'boss' });

    const cols = 8;
    const cw = 170;
    const ch = 200;
    const rows = Math.ceil(picks.length / cols);
    const { c, g } = canvas(cols * cw + 20, rows * (ch + 30) + 30);
    const r = studio(cw, ch);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    lights(scene, 'studio');
    const cam = new THREE.PerspectiveCamera(30, cw / ch, 0.05, 80);
    const report: string[] = [];
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i]!;
      const build = MM.buildMonsterModel as unknown as (
        v: MonsterVisual,
        rng: Random,
        scale: number,
        opts?: { family?: string; rank?: string },
      ) => { root: THREE.Group; bones: Record<string, THREE.Bone> };
      const model = build(p.visual, new Random(1234 + i), p.scale, { family: p.family, rank: p.rank });
      const anim = new MM.RigAnimator(model.root, model.bones, MM.monsterArchetype(p.visual.body), new Random(5));
      anim.update(0.5, { locomotion: 0, action: 'idle', actionT: 0, time: 1.2, deathT: 0 });
      const x = 10 + (i % cols) * cw;
      const y = 24 + Math.floor(i / cols) * (ch + 30);
      drawCell(g, r, scene, cam, model.root, 0.6, x, y, cw, ch);
      const k = cost(model.root);
      g.fillStyle = INK;
      g.fillText(p.label.slice(0, 22), x, y - 4);
      g.fillStyle = DIM;
      g.fillText(`${p.family} ${k.tris}t ${k.calls}dc`, x, y + ch + 12);
      // The far level, which the game swaps in beyond 25 m from the camera.
      let farTris = 0;
      model.root.traverse((o) => {
        const lod = o as THREE.LOD;
        if (!lod.isLOD || !lod.levels[1]) return;
        lod.levels[1].object.traverse((m) => {
          const mm = m as THREE.Mesh;
          if (!mm.isMesh) return;
          const idx = mm.geometry.getIndex();
          farTris += ((idx ? idx.count : mm.geometry.getAttribute('position').count) / 3) | 0;
        });
      });
      report.push(`${p.label} [${p.family}/${p.visual.body}/${p.rank}]: ${k.tris} tris (far ${farTris}), ${k.calls} calls`);
      await settle();
    }
    console.log(report.join('\n'));
    return c.toDataURL('image/png');
  },

  npcs: () => npcSheet(0, 99),
  'npcs-a': () => npcSheet(0, 5),
  'npcs-b': () => npcSheet(5, 99),
};

async function npcSheet(from: number, to: number): Promise<string> {
  {
    let mod: Record<string, unknown> | null = null;
    try {
      const path = '/src/art/NpcModels.ts';
      mod = (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
    } catch {
      mod = null;
    }
    const ids = (mod && Array.isArray(mod.NPC_LOOK_IDS) ? (mod.NPC_LOOK_IDS as string[]) : []).slice(from, to);
    const cw = 200;
    const ch = 320;
    const n = Math.max(1, ids.length);
    const { c, g } = canvas(n * cw * 2 + 20, ch + 60 + 260);
    const r = studio(cw, ch);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BG);
    lights(scene, 'studio');
    const cam = new THREE.PerspectiveCamera(28, cw / ch, 0.05, 60);
    const figs: THREE.Object3D[] = [];
    const report: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const build = mod!.buildNpcModel as (id: string, rng: Random) => { root: THREE.Object3D; bones: Record<string, THREE.Bone> };
      const built = build(ids[i]!, new Random(99 + i));
      const holder = new THREE.Group();
      holder.add(built.root);
      const anim = new Animator(built.bones);
      const carry = mod!.npcCarryGrip as ((id: string) => 'none' | 'twoHand' | 'staff' | 'bow') | undefined;
      if (carry) anim.setGrip(carry(ids[i]!));
      anim.play('idle', { fade: 0 });
      for (let t = 0; t < 24; t++) anim.update(1 / 30);
      const x = 10 + i * cw * 2;
      drawCell(g, r, scene, cam, holder, 0.45, x, 24, cw, ch);
      drawCell(g, r, scene, cam, holder, Math.PI + 0.45, x + cw, 24, cw, ch);
      const k = cost(holder);
      g.fillStyle = INK;
      g.fillText(ids[i]!, x, 16);
      g.fillStyle = DIM;
      g.fillText(`${k.tris}t ${k.calls}dc`, x, 24 + ch + 14);
      report.push(`${ids[i]}: ${k.tris} tris, ${k.calls} calls`);
      figs.push(holder);
      await settle();
    }
    if (figs.length) gameStrip(g, figs, 10, ch + 50, n * cw * 2, 250, 1.8);
    console.log(report.join('\n'));
    return c.toDataURL('image/png');
  }
}
