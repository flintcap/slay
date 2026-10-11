/**
 * Sheets for `tools/item-sheet.mjs`. Runs in the browser on the Vite dev
 * server against the real item code. Each entry in `SHEETS` returns a PNG
 * data URI (or a JSON report for checks).
 *
 *   <family>   every base of a category (sword, axe, helm, gem...), --rarity=
 *   uniques    every unique (--cat= to narrow, --rarity=mythic|ancient)
 *   sets       every set piece (--set= to narrow)
 *   rarity     one base (--base=) at every rarity
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ITEM_BASES } from '../src/data/itemBases';
import { UNIQUES } from '../src/data/uniques';
import { SET_PIECES } from '../src/data/sets';
import type { ItemRarity, ItemVisual } from '../src/types';
import { buildItem } from '../src/art/items/Model';

const BG = '#121318';
const INK = '#c9d1de';
const RARITIES: ItemRarity[] = ['normal', 'magic', 'rare', 'set', 'unique', 'mythic', 'ancient'];
const RARITY_INK: Record<string, string> = {
  normal: '#c9c9c9',
  magic: '#7c8cff',
  rare: '#f0d060',
  set: '#4ad06a',
  unique: '#c8963c',
  mythic: '#c070ff',
  ancient: '#ff7a5a',
};

let renderer: THREE.WebGLRenderer | null = null;
let envTex: THREE.Texture | null = null;
function studio(w: number, h: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
  }
  renderer.setSize(w, h, false);
  return renderer;
}

interface Entry {
  label: string;
  visual: ItemVisual;
  rarity: ItemRarity;
  baseId: string;
  uniqueId?: string;
  setId?: string;
}

const baseById = new Map(ITEM_BASES.map((b) => [b.id, b]));

/** Renders one item into a tile: upright, three-quarter turn, framed to fit. */
function tile(g: CanvasRenderingContext2D, e: Entry, x: number, y: number, w: number, h: number): void {
  const r = studio(w, h - 34);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  if (!envTex) {
    const pm = new THREE.PMREMGenerator(r);
    envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  scene.environment = envTex;
  scene.environmentIntensity = 0.35;
  scene.add(new THREE.HemisphereLight(0x9aa6c0, 0x2a2018, 0.6));
  const key = new THREE.DirectionalLight(0xffe8d0, 2.8);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8ab4ff, 1.6);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  let obj: THREE.Object3D;
  try {
    obj = buildItem(e.visual, e.rarity, { baseId: e.baseId, uniqueId: e.uniqueId, setId: e.setId }).group;
  } catch (err) {
    g.fillStyle = '#ff5050';
    g.fillText(String(err).slice(0, 30), x + 4, y + 20);
    return;
  }
  const holder = new THREE.Group();
  holder.add(obj);
  const box0 = new THREE.Box3().setFromObject(obj);
  const size0 = box0.getSize(new THREE.Vector3());
  // Bows lie in the YZ plane; turn them to show their curve.
  holder.rotation.y = size0.z > size0.x * 1.4 ? Math.PI / 2 - 0.35 : 0.35;
  holder.rotation.x = 0.12;
  scene.add(holder);
  holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(holder);
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const aspect = w / (h - 34);
  const half = Math.max(s.y / 2, s.x / 2 / aspect) * 1.08;
  const cam = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.01, 100);
  cam.position.set(c.x, c.y, c.z + 10);
  cam.lookAt(c);
  r.render(scene, cam);
  g.drawImage(r.domElement, x, y);
  g.fillStyle = RARITY_INK[e.rarity] ?? INK;
  g.font = '12px monospace';
  g.fillText(e.label.slice(0, 26), x + 4, y + h - 20);
  g.fillStyle = '#7a8090';
  g.font = '10px monospace';
  g.fillText(e.baseId.slice(0, 30), x + 4, y + h - 6);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
}

function render(entries: Entry[], cols: number, w = 170, h = 230): string {
  const rows = Math.max(1, Math.ceil(entries.length / cols));
  const c = document.createElement('canvas');
  c.width = cols * w;
  c.height = rows * h;
  const g = c.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, c.width, c.height);
  entries.forEach((e, i) => tile(g, e, (i % cols) * w, Math.floor(i / cols) * h, w, h));
  return c.toDataURL('image/png');
}

function asRarity(v: string | undefined, def: ItemRarity): ItemRarity {
  return (RARITIES as string[]).includes(v ?? '') ? (v as ItemRarity) : def;
}

function familySheet(cat: string, f: Record<string, string>): string {
  const rarity = asRarity(f.rarity, 'normal');
  const list = ITEM_BASES.filter((b) => b.category === cat).slice(Number(f.from ?? 0), Number(f.from ?? 0) + Number(f.max ?? 64));
  const entries = list.map((b) => ({ label: b.name, visual: b.visual, rarity, baseId: b.id }));
  return render(entries, Number(f.cols ?? 7));
}

export const SHEETS: Record<string, (f: Record<string, string>) => Promise<string>> = {
  async uniques(f) {
    const list = UNIQUES.filter((u) => {
      const b = baseById.get(u.baseId);
      if (!b) return false;
      if (f.cat && b.category !== f.cat) return false;
      if (f.rarity && u.rarity !== f.rarity) return false;
      return true;
    }).slice(Number(f.from ?? 0), Number(f.from ?? 0) + Number(f.max ?? 48));
    return render(
      list.map((u) => ({ label: u.name, visual: baseById.get(u.baseId)!.visual, rarity: u.rarity as ItemRarity, baseId: u.baseId, uniqueId: u.id })),
      Number(f.cols ?? 8),
    );
  },
  async sets(f) {
    const list = SET_PIECES.filter((p) => baseById.has(p.baseId) && (!f.set || p.setId === f.set)).slice(Number(f.from ?? 0), Number(f.from ?? 0) + Number(f.max ?? 48));
    return render(
      list.map((p) => ({ label: p.name, visual: baseById.get(p.baseId)!.visual, rarity: 'set' as ItemRarity, baseId: p.baseId, setId: p.setId })),
      Number(f.cols ?? 8),
    );
  },
  async rarity(f) {
    const b = baseById.get(f.base ?? 'sword.short') ?? ITEM_BASES[0]!;
    return render(
      RARITIES.map((r) => ({ label: `${b.name} ${r}`, visual: b.visual, rarity: r, baseId: b.id })),
      7,
    );
  },
};

for (const cat of new Set(ITEM_BASES.map((b) => b.category))) {
  SHEETS[cat] = async (f) => familySheet(cat, f);
}
