/**
 * Sheets for `tools/item-sheet.mjs`. Runs in the browser on the Vite dev
 * server against the real item code. Each entry in `SHEETS` returns a PNG
 * data URI (or a JSON report for checks).
 *
 *   <family>   every base of a category (sword, axe, helm, gem...), --rarity=
 *   uniques    every unique (--cat= to narrow, --rarity=mythic|ancient)
 *   sets       every set piece (--set= to narrow)
 *   rarity     one base (--base=) at every rarity
 *   distinct   check: every base, unique and set piece has an icon of its own
 *              (--min= the smallest mean difference over covered pixels, default 0.05)
 *   icons      inventory icons on slot backdrops: --cat= (or all bases), --rarity=,
 *              --uniques, --sets; each shown at full size and at the game's 52px
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ITEM_BASES } from '../src/data/itemBases';
import { UNIQUES } from '../src/data/uniques';
import { SET_PIECES } from '../src/data/sets';
import type { Item, ItemRarity, ItemVisual } from '../src/types';
import { buildItem } from '../src/art/items/Model';
import { buildDropModel, setItemVisualResolver } from '../src/art/ItemModels';
import { Random } from '../src/core/RNG';
import { drawItemIcon, iconCanvasSize, itemScansReady } from '../src/art/items/IconRender';
import { sizeOfBase } from '../src/sim/Grid';
import { openStudio } from './studio';

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

/** Opened before any sheet draws: its GPU device opens asynchronously. */
const renderer = await openStudio({ exposure: 1.15 });

let envTex: THREE.Texture | null = null;
function studio(w: number, h: number): THREE.WebGPURenderer {
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

/** Drops on a stone floor, camera high and to the south like the game's. */
function dropSheet(entries: Entry[], cols: number, w = 220, h = 220): string {
  const rows = Math.max(1, Math.ceil(entries.length / cols));
  const c = document.createElement('canvas');
  c.width = cols * w;
  c.height = rows * h;
  const g = c.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, c.width, c.height);
  const rng = new Random(7);
  setItemVisualResolver((it) => baseById.get(it.baseId)?.visual);
  entries.forEach((e, i) => {
    const r = studio(w, h - 20);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x24262c);
    scene.add(new THREE.HemisphereLight(0xb0b8d0, 0x302820, 1.0));
    const key = new THREE.DirectionalLight(0xffe0c0, 2.4);
    key.position.set(2, 5, 3);
    scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const item = { uid: `u${i}`, baseId: e.baseId, rarity: e.rarity } as unknown as Item;
    const drop = buildDropModel(item, rng);
    drop.position.y = 0.28;
    scene.add(drop);
    const cam = new THREE.PerspectiveCamera(35, w / (h - 20), 0.1, 50);
    cam.position.set(0, 2.6, 1.9);
    cam.lookAt(0, 0.05, 0);
    r.render(scene, cam);
    const x = (i % cols) * w;
    const y = Math.floor(i / cols) * h;
    g.drawImage(r.domElement, x, y);
    g.fillStyle = INK;
    g.font = '11px monospace';
    g.fillText(e.baseId.slice(0, 30), x + 4, y + h - 6);
  });
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

/** Inventory icons on the slot's own backdrop, at full size and at the game's 52px. */
function iconSheet(entries: Entry[], cols: number): string {
  const W = 150;
  const H = 196;
  const rows = Math.max(1, Math.ceil(entries.length / cols));
  const c = document.createElement('canvas');
  c.width = cols * W;
  c.height = rows * H;
  const g = c.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, c.width, c.height);
  const icon = document.createElement('canvas');
  icon.width = icon.height = 128;
  const ix = icon.getContext('2d')!;
  const slot = (x: number, y: number, s: number): void => {
    const gr = g.createRadialGradient(x + s / 2, y + s * 0.3, 0, x + s / 2, y + s * 0.3, s * 0.85);
    gr.addColorStop(0, '#1d1812');
    gr.addColorStop(1, '#0c0a07');
    g.fillStyle = gr;
    g.fillRect(x, y, s, s);
  };
  entries.forEach((e, i) => {
    const x = (i % cols) * W + 4;
    const y = Math.floor(i / cols) * H + 4;
    ix.clearRect(0, 0, 128, 128);
    drawItemIcon(ix, { baseId: e.baseId, rarity: e.rarity, visual: e.visual, uniqueId: e.uniqueId, setId: e.setId });
    slot(x, y, 128);
    g.drawImage(icon, x, y);
    slot(x + 88, y + 132, 52);
    g.drawImage(icon, x + 88, y + 132, 52, 52);
    g.fillStyle = RARITY_INK[e.rarity] ?? INK;
    g.font = '11px monospace';
    g.fillText(e.label.slice(0, 12), x, y + 146);
    g.fillStyle = '#7a8090';
    g.font = '10px monospace';
    g.fillText(e.baseId.slice(0, 13), x, y + 160);
  });
  return c.toDataURL('image/png');
}

/** A rendered icon shrunk to 48px, for comparing pictures. */
function iconPixels(e: Entry): Float32Array {
  const big = document.createElement('canvas');
  big.width = big.height = 128;
  const bx = big.getContext('2d')!;
  drawItemIcon(bx, { baseId: e.baseId, rarity: e.rarity, visual: e.visual, uniqueId: e.uniqueId, setId: e.setId }, { bare: true });
  const small = document.createElement('canvas');
  small.width = small.height = 48;
  const sx = small.getContext('2d', { willReadFrequently: true })!;
  sx.drawImage(big, 0, 0, 48, 48);
  const d = sx.getImageData(0, 0, 48, 48).data;
  const out = new Float32Array(48 * 48 * 3);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    // Premultiply by alpha: the slot behind is dark, so a clear pixel reads as black.
    const a = d[i + 3]! / 255;
    out[j] = (d[i]! / 255) * a;
    out[j + 1] = (d[i + 1]! / 255) * a;
    out[j + 2] = (d[i + 2]! / 255) * a;
  }
  return out;
}

/**
 * Mean colour difference over the pixels either icon covers, so a thin spear
 * is judged on the spear and not on the empty slot around it.
 */
function pixelDiff(a: Float32Array, b: Float32Array): number {
  let t = 0;
  let n = 0;
  for (let i = 0; i < a.length; i += 3) {
    const la = a[i]! + a[i + 1]! + a[i + 2]!;
    const lb = b[i]! + b[i + 1]! + b[i + 2]!;
    if (la < 0.03 && lb < 0.03) continue;
    t += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    n += 3;
  }
  return n ? t / n : 0;
}

/**
 * Every base reads as its own item: no two bases of one category, no two
 * uniques or set pieces on one base, and no unique or set piece against its
 * plain base at the same rarity, may draw (nearly) the same icon.
 */
function distinctCheck(f: Record<string, string>): string {
  const min = Number(f.min ?? 0.05);
  const lines: string[] = [];
  const fails: string[] = [];
  const cache = new Map<string, Float32Array>();
  const px = (e: Entry): Float32Array => {
    const k = `${e.baseId}|${e.rarity}|${e.uniqueId ?? ''}|${e.setId ?? ''}`;
    let v = cache.get(k);
    if (!v) cache.set(k, (v = iconPixels(e)));
    return v;
  };
  const compare = (group: string, list: Entry[]): void => {
    // Runes of one tier share their stone by design (as in D2); the glyph alone must differ.
    const floor = group === 'rune' ? min * 0.5 : min;
    let worst = Infinity;
    let pair = '';
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = pixelDiff(px(list[i]!), px(list[j]!));
        if (d < worst) {
          worst = d;
          pair = `${list[i]!.label} / ${list[j]!.label}`;
        }
        if (d < floor) fails.push(`${group}: ${list[i]!.label} and ${list[j]!.label} look the same (${d.toFixed(4)})`);
      }
    }
    if (list.length > 1) lines.push(`${group.padEnd(24)} ${String(list.length).padStart(3)}  closest ${worst.toFixed(4)}  ${pair}`);
  };
  const cats = [...new Set(ITEM_BASES.map((b) => b.category))];
  for (const cat of cats) {
    compare(cat, ITEM_BASES.filter((b) => b.category === cat).map((b) => ({ label: b.id, visual: b.visual, rarity: 'normal' as ItemRarity, baseId: b.id })));
  }
  // Uniques and set pieces: against each other on one base, and against the plain base.
  const special = new Map<string, Entry[]>();
  for (const u of UNIQUES) {
    const b = baseById.get(u.baseId);
    if (!b) continue;
    const e: Entry = { label: u.id, visual: b.visual, rarity: u.rarity as ItemRarity, baseId: b.id, uniqueId: u.id };
    special.set(b.id, [...(special.get(b.id) ?? []), e]);
  }
  for (const p of SET_PIECES) {
    const b = baseById.get(p.baseId);
    if (!b) continue;
    const e: Entry = { label: `${p.setId}:${p.name}`, visual: b.visual, rarity: 'set', baseId: b.id, setId: p.setId };
    special.set(b.id, [...(special.get(b.id) ?? []), e]);
  }
  let specials = 0;
  let worstPlain = Infinity;
  let worstPlainPair = '';
  for (const [baseId, list] of special) {
    const b = baseById.get(baseId)!;
    specials += list.length;
    if (list.length > 1) compare(`on ${baseId}`, list);
    for (const e of list) {
      // A set piece always carries its set, so it is judged against a rare of its base;
      // a unique against its base at the unique's own rarity.
      const plain: Entry = { label: `plain ${baseId}`, visual: b.visual, rarity: e.rarity === 'set' ? 'rare' : e.rarity, baseId };
      const d = pixelDiff(px(e), px(plain));
      if (d < worstPlain) {
        worstPlain = d;
        worstPlainPair = `${e.label} / ${plain.label}`;
      }
      if (d < min) fails.push(`${e.label} looks like a plain ${baseId} (${d.toFixed(4)})`);
    }
  }
  lines.push(`${specials} uniques and set pieces; closest to its plain base ${worstPlain.toFixed(4)}  ${worstPlainPair}`);
  lines.push(`${cache.size} icons rendered, ${fails.length} too alike (min ${min})`);
  for (const l of fails.slice(0, 60)) lines.push(`  ${l}`);
  return JSON.stringify({ pass: fails.length === 0, lines });
}

/**
 * Pack icons at their own shapes, drawn in an order that mixes big and small
 * (the icon renderer keeps one buffer and draws a small icon in its corner).
 */
function shapedSheet(entries: Entry[]): string {
  const cells = entries.map((e) => {
    const sh = sizeOfBase(baseById.get(e.baseId));
    const dim = iconCanvasSize({ baseId: e.baseId, rarity: e.rarity, shape: sh });
    const c = document.createElement('canvas');
    c.width = dim.w;
    c.height = dim.h;
    drawItemIcon(c.getContext('2d')!, { baseId: e.baseId, rarity: e.rarity, visual: e.visual, shape: sh });
    return c;
  });
  const out = document.createElement('canvas');
  out.width = cells.reduce((z, c) => z + c.width + 8, 8);
  out.height = Math.max(...cells.map((c) => c.height)) + 16;
  const g = out.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, out.width, out.height);
  let x = 8;
  for (const c of cells) {
    g.fillStyle = '#1d1812';
    g.fillRect(x, 8, c.width, c.height);
    g.drawImage(c, x, 8);
    x += c.width + 8;
  }
  return out.toDataURL('image/png');
}

export const SHEETS: Record<string, (f: Record<string, string>) => Promise<string>> = {
  async shaped(f) {
    const ids = (f.ids ?? '').split(',').filter((id) => baseById.has(id));
    const list = ids.length ? ids : ITEM_BASES.filter((b, i) => i % Math.max(1, Math.floor(ITEM_BASES.length / 10)) === 0).map((b) => b.id);
    return shapedSheet(list.map((id) => ({ label: id, visual: baseById.get(id)!.visual, rarity: 'rare' as ItemRarity, baseId: id })));
  },
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
  async drops(f) {
    // One base per category (or --cat=), as dropped, seen from the play camera.
    const seen = new Set<string>();
    const list = ITEM_BASES.filter((b) => {
      if (f.cat) return b.category === f.cat;
      if (seen.has(b.category)) return false;
      seen.add(b.category);
      return true;
    }).slice(0, Number(f.max ?? 30));
    const rarity = asRarity(f.rarity, 'rare');
    return dropSheet(list.map((b) => ({ label: b.name, visual: b.visual, rarity, baseId: b.id })), Number(f.cols ?? 6));
  },
  async distinct(f) {
    return distinctCheck(f);
  },
  async icons(f) {
    const from = Number(f.from ?? 0);
    const max = Number(f.max ?? 48);
    let entries: Entry[];
    if (f.ids) {
      // Each named unique (uq.*) or set (set.*:baseId) beside its plain base at the same rarity.
      entries = [];
      for (const id of f.ids.split('+')) {
        const u = UNIQUES.find((x) => x.id === id);
        const sp = id.startsWith('set.') ? SET_PIECES.find((x) => x.setId === id.split(':')[0] && (!id.includes(':') || x.baseId === id.split(':')[1])) : undefined;
        const baseId = u?.baseId ?? sp?.baseId;
        const b = baseId ? baseById.get(baseId) : undefined;
        if (!b) continue;
        const rarity = (u?.rarity ?? 'set') as ItemRarity;
        entries.push({ label: u?.name ?? sp!.name, visual: b.visual, rarity, baseId: b.id, uniqueId: u?.id, setId: sp?.setId });
        entries.push({ label: `plain ${b.name}`, visual: b.visual, rarity: rarity === 'set' ? 'rare' : rarity, baseId: b.id });
      }
    } else if (f.uniques) {
      entries = UNIQUES.filter((u) => baseById.has(u.baseId) && (!f.cat || baseById.get(u.baseId)!.category === f.cat)).map((u) => ({
        label: u.name,
        visual: baseById.get(u.baseId)!.visual,
        rarity: u.rarity as ItemRarity,
        baseId: u.baseId,
        uniqueId: u.id,
      }));
    } else if (f.sets) {
      entries = SET_PIECES.filter((p) => baseById.has(p.baseId)).map((p) => ({ label: p.name, visual: baseById.get(p.baseId)!.visual, rarity: 'set' as ItemRarity, baseId: p.baseId, setId: p.setId }));
    } else {
      const rarity = asRarity(f.rarity, 'normal');
      entries = ITEM_BASES.filter((b) => !f.cat || b.category === f.cat).map((b) => ({ label: b.name, visual: b.visual, rarity, baseId: b.id }));
    }
    return iconSheet(entries.slice(from, from + max), Number(f.cols ?? 8));
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

// Every sheet waits for the item scans, so nothing is drawn with flat maps.
for (const [name, fn] of Object.entries(SHEETS)) {
  SHEETS[name] = async (f) => {
    await itemScansReady();
    return fn(f);
  };
}
