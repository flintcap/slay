/**
 * SLAY — inventory icons rendered from the item models.
 *
 * The icon is the same model the hero holds and the floor shows, built by
 * `buildItem`, lit like a studio shot (warm key from the upper left, cool rim
 * from behind) and framed to fill a square slot. Long weapons lie on the
 * diagonal, so a sword reads as long and a dagger as short; armour, shields
 * and trinkets stand upright with a small turn.
 *
 * Rarity adds a pool of its colour behind the object and a halo around it.
 * Uniques and better get rays, mythic and ancient get motes, so they read at a
 * glance. The slot draws its own dark backdrop; the icon itself is
 * transparent.
 *
 * One studio (see `Studio`) is shared by every icon. It opens
 * asynchronously, so `itemScansReady` waits for it as well as the scans; an
 * icon asked for before then (or without a GPU) falls back to a plain
 * rarity-coloured mark.
 */
import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { makeStudio, type Studio } from '../../core/Studio';
import type { ItemRarity, ItemVisual } from '../../types';
import { RARITY_COLOR } from '../../types';
import { Random, hashString } from '../../core/RNG';
import { composite, css, glow, scratch, type Ctx } from '../Paint';
import { buildItem, type ItemFamily } from './Model';
import { auraStyle } from './Aura';
import type { Aura } from './Designs';
import { scansOf } from '../Scans';

import { itemLookStandIns, itemScansReady as scansReady } from './Mats';
import { screenRatio } from '../../core/Screen';

/** The item scans have decoded and the icon studio is open. */
export async function itemScansReady(): Promise<void> {
  await Promise.all([scansReady(), openStudio()]);
}

/** What an icon is drawn from. */
export interface IconSpec {
  baseId: string;
  rarity: ItemRarity;
  /** The base's authored visual block; the look system resolves the base id alone without it. */
  visual?: ItemVisual;
  uniqueId?: string;
  setId?: string;
  /**
   * The item's block in the pack, in cells, when it is not square. The icon
   * is drawn at that shape, so a staff stands the full height of its four
   * cells instead of shrinking to fit one.
   */
  shape?: { w: number; h: number };
}

/** Output size of a square icon on a plain screen, in pixels. */
const ICON_SIZE = 128;
/** Output pixels per cell for a shaped icon on a plain screen. */
const ICON_CELL = 80;

/**
 * How many times the plain size icons are drawn at, so a pack on a 4K monitor
 * is not a blur of stretched pictures (`core/Screen.ts`). A pack cell is 50
 * CSS px; 80 px per cell covers a ratio of 1.6, and past that the cell grows
 * with the ratio in 16 px steps, so a small change keeps the cached icons.
 */
export function iconScale(): number {
  const cell = Math.max(ICON_CELL, Math.round((64 * screenRatio()) / 16) * 16);
  return cell / ICON_CELL;
}

/** The canvas size an icon is drawn at on a plain screen. */
function plainSize(spec: IconSpec): { w: number; h: number } {
  const sh = spec.shape;
  if (!sh || sh.w === sh.h) return { w: ICON_SIZE, h: ICON_SIZE };
  return { w: ICON_CELL * sh.w, h: ICON_CELL * sh.h };
}

/** The canvas size an icon is drawn at on this screen. */
export function iconCanvasSize(spec: IconSpec): { w: number; h: number } {
  const k = iconScale();
  const p = plainSize(spec);
  return { w: Math.round(p.w * k), h: Math.round(p.h * k) };
}
/** Internal render size: drawn at twice the size, then scaled down for smooth edges. */
const DRAW = 256;

const RANK: Record<ItemRarity, number> = { normal: 0, magic: 1, rare: 2, set: 3, unique: 4, mythic: 5, ancient: 6 };

/** Families shown on the diagonal, business end to the upper right. */
const DIAGONAL = new Set<ItemFamily>(['sword', 'dagger', 'axe', 'mace', 'spear', 'wand', 'staff', 'scepter', 'crossbow', 'bow', 'quiver']);

interface Pose {
  yaw: number;
  pitch: number;
  roll: number;
  /** Fill of the frame: 1 touches the edges. */
  fill: number;
  /**
   * Smallest half-height of the frame, in metres. Gems are framed at one
   * scale, so a chipped stone shows small and a perfect one fills the slot.
   */
  ref?: number;
}

function poseFor(family: ItemFamily, size: THREE.Vector3, tall = false): Pose {
  // In a tall block, long things stand straight up, business end high.
  if (tall && family === 'bow') return { yaw: Math.PI / 2 - 0.4, pitch: 0, roll: 0, fill: 0.94 };
  if (tall && family === 'quiver') return { yaw: 0.4, pitch: 0.1, roll: -0.12, fill: 0.9 };
  if (tall && DIAGONAL.has(family)) return { yaw: 0.4, pitch: 0.08, roll: 0, fill: 0.94 };
  if (family === 'bow') return { yaw: Math.PI / 2 - 0.4, pitch: 0, roll: -Math.PI / 4, fill: 0.98 };
  if (family === 'quiver') return { yaw: 0.4, pitch: 0.1, roll: -0.45, fill: 0.9 };
  if (DIAGONAL.has(family)) return { yaw: 0.4, pitch: 0.08, roll: -Math.PI / 4, fill: 0.98 };
  if (family === 'ring') return { yaw: 0.3, pitch: 0.55, roll: 0, fill: 0.72 };
  if (family === 'gem') return { yaw: 0.45, pitch: 0.3, roll: 0, fill: 0.7, ref: 0.1 };
  if (family === 'rune' || family === 'charm' || family === 'trinket' || family === 'material') return { yaw: 0.45, pitch: 0.3, roll: 0, fill: 0.7 };
  if (family === 'amulet' || family === 'potion') return { yaw: 0.35, pitch: 0.15, roll: 0, fill: 0.84 };
  // Circlets and crowns are low rings: look down into them.
  if (family === 'helm' && size.y < size.x * 0.5) return { yaw: 0.2, pitch: 0.7, roll: 0, fill: 0.86 };
  // Boots turn to show the toe.
  if (family === 'boots') return { yaw: 1.05, pitch: 0.12, roll: 0, fill: 0.86 };
  // Pants stand square on, turned a little to show the cut down the outer seam.
  if (family === 'pants') return { yaw: 0.35, pitch: 0.06, roll: 0, fill: 0.9 };
  if (family === 'belt') return { yaw: 0.35, pitch: 0.45, roll: 0, fill: 0.9 };
  // Wide flat things (shields, chests) stand square on; everything else turns a little more.
  const flat = size.z < Math.min(size.x, size.y) * 0.35;
  return { yaw: flat ? 0.3 : 0.5, pitch: 0.16, roll: 0, fill: 0.86 };
}

let renderer: Studio | null = null;
let opening: Promise<void> | null = null;
/**
 * The renderer's drawing buffer, which only ever grows. Resizing it
 * reallocates its targets (check-frames: 4.3 s in setSize while the town drew
 * a pack of mixed shapes), so an icon smaller than the buffer draws into its
 * top-left corner instead, and `drawW` by `drawH` is the part it used.
 */
let bufW = DRAW;
let bufH = DRAW;
let drawW = DRAW;
let drawH = DRAW;
let stage: { scene: THREE.Scene; holder: THREE.Group; cam: THREE.OrthographicCamera } | null = null;

/** Opens the studio once; a lost device opens a new one on the next ask. */
function openStudio(): Promise<void> {
  if (opening) return opening;
  opening = makeStudio().then((r) => {
    if (!r) return;
    r.setSize(DRAW, DRAW);
    bufW = bufH = drawW = drawH = DRAW;
    r.toneMappingExposure = 1.3;
    r.setClearColor(0x000000, 0);
    r.onLost = () => {
      if (renderer === r) {
        renderer = null;
        stage = null;
        opening = null;
      }
    };
    renderer = r;
  });
  return opening;
}

function studio(): Studio | null {
  if (!renderer) {
    void openStudio();
    return null;
  }
  if (!stage) {
    const scene = new THREE.Scene();
    const pm = new THREE.PMREMGenerator(renderer.renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    scene.environmentIntensity = 1.1;
    scene.add(new THREE.HemisphereLight(0xa8b0c8, 0x2a2018, 0.7));
    const key = new THREE.DirectionalLight(0xffe6c8, 3.0);
    key.position.set(-2.5, 3.2, 4);
    scene.add(key);
    const fillL = new THREE.DirectionalLight(0xc8d4ff, 0.6);
    fillL.position.set(3, 0.5, 3);
    scene.add(fillL);
    const rim = new THREE.DirectionalLight(0x9cc0ff, 2.0);
    rim.position.set(2.5, 2, -4);
    scene.add(rim);
    const holder = new THREE.Group();
    scene.add(holder);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    stage = { scene, holder, cam };
  }
  return renderer;
}

let warm: Promise<void> | null = null;

/**
 * Draws one tiny unseen shot of every kind of item material, so the
 * studio's shaders are built before the first real icon needs them: an
 * icon for a drop of a new kind (a first rune, flask or glowing unique)
 * built its shader mid-fight. For a scene to call behind its curtain.
 */
export function warmIconStudio(): Promise<void> {
  if (warm) return warm;
  warm = (async () => {
    await openStudio();
    const r = studio();
    if (!r || !stage) {
      warm = null;
      return;
    }
    const { meshes, geometries } = itemLookStandIns();
    const g = new THREE.Group();
    for (const m of meshes) g.add(m);
    const { holder, cam, scene } = stage;
    cam.left = cam.bottom = -1;
    cam.right = cam.top = 1;
    cam.near = 0.01;
    cam.far = 20;
    cam.position.set(0, 0, 10);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    holder.rotation.set(0, 0, 0);
    holder.add(g);
    try {
      // The same path a real icon takes, so the same pipelines are built.
      await r.renderPixels(scene, cam, 4, 4);
      // And the canvas path (`drawItemIcon`): its output pass (tone mapping
      // and sRGB) writes the canvas's own colour format, a pipeline apart
      // from the read-back target's, and check-frames caught it built on
      // the first icon drawn mid-fight.
      r.setViewport(0, 0, 4, 4);
      r.render(scene, cam);
    } catch {
      warm = null;
    } finally {
      holder.remove(g);
      for (const x of geometries) x.dispose();
    }
  })();
  return warm;
}

/** What `renderModel` reports back for compositing. */
interface Shot {
  glowColor: number;
  stone: number;
  aura: Aura;
}

const tmpBox = new THREE.Box3();
const tmpV = new THREE.Vector3();
const tmpC = new THREE.Vector3();

/** Scans the last icon was drawn without (still loading), for a redraw once they land. */
const missing: THREE.Texture[] = [];
export function iconScansMissing(): readonly THREE.Texture[] {
  return missing;
}

/**
 * Renders the model onto the shared renderer's canvas, or with `read` into
 * a target read back later, in `pixels`. Null when the studio is not open.
 */
function renderModel(spec: IconSpec, read = false): (Shot & { pixels: Promise<ImageData> | null }) | null {
  missing.length = 0;
  const r = studio();
  if (!r || !stage) return null;
  const out = iconCanvasSize(spec);
  const aspect = out.w / out.h;
  const dw = out.w * 2;
  const dh = out.h * 2;
  if (dw > bufW || dh > bufH) {
    bufW = Math.max(bufW, dw);
    bufH = Math.max(bufH, dh);
    r.setSize(bufW, bufH);
  }
  // The viewport's origin is the top left. Measured from the bottom, an icon
  // smaller than the buffer landed below the corner that is copied out:
  // blank or cut off once a tall item had grown the buffer.
  r.setViewport(0, 0, dw, dh);
  drawW = dw;
  drawH = dh;
  const visual = spec.visual ?? { shape: spec.baseId, palette: 'metal.steel' };
  const built = buildItem(visual, spec.rarity, { baseId: spec.baseId, uniqueId: spec.uniqueId, setId: spec.setId });
  const obj = built.group;
  const { holder, cam, scene } = stage;
  const size0 = tmpBox.setFromObject(obj).getSize(tmpV).clone();
  const pose = poseFor(built.family, size0, aspect < 1);
  // Yaw and pitch turn the item inside; the roll lays it on the diagonal outside.
  const inner = new THREE.Group();
  inner.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  inner.add(obj);
  holder.rotation.set(0, 0, pose.roll);
  holder.add(inner);
  holder.updateMatrixWorld(true);
  tmpBox.setFromObject(holder);
  const c = tmpBox.getCenter(tmpC);
  const s = tmpBox.getSize(tmpV);
  const half = Math.max(1e-3, Math.max(s.y, s.x / aspect) / 2 / pose.fill, pose.ref ?? 0);
  cam.left = -half * aspect;
  cam.right = half * aspect;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 0.01;
  cam.far = s.z + 20;
  cam.position.set(c.x, c.y, c.z + s.z / 2 + 10);
  cam.lookAt(c);
  cam.updateProjectionMatrix();
  obj.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      const scans = scansOf(mat);
      if (scans) for (const t of scans) if (!t.userData.loaded && !missing.includes(t)) missing.push(t);
    }
  });
  let pixels: Promise<ImageData> | null = null;
  try {
    if (read) pixels = r.renderPixels(scene, cam, dw, dh);
    else r.render(scene, cam);
  } finally {
    holder.remove(inner);
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      // Materials are shared and cached by the item kit; geometry is this build's own.
      if (m.isMesh) m.geometry.dispose();
    });
  }
  return { glowColor: built.look.glowColor, stone: built.look.stone, aura: built.look.aura, pixels };
}

/**
 * Paints an item's aura into its icon, so a unique or set piece shows the
 * same light in the bag as it does in the world: big soft kinds (smoke,
 * souls, frost, a soft glow) bloom behind the item, small bright kinds
 * (embers, sparks, sparkles, drips) sit on top with trails showing which
 * way they drift.
 */
function paintAura(out: Ctx, kind: Aura, color: number, seed: string, layer: 'back' | 'front', k: number): void {
  const st = auraStyle(kind);
  if (!st) return;
  const W = out.canvas.width;
  const H = out.canvas.height;
  const big = st.size >= 20;
  if (big !== (layer === 'back')) return;
  const rnd = new Random(hashString(`icon-aura|${seed}`));
  const n = big ? Math.max(3, Math.round(st.count * 0.4)) : Math.max(6, Math.round(st.count * 0.5));
  out.save();
  out.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const px = (14 + rnd.next() * 100) * (W / ICON_SIZE);
    const py = (12 + rnd.next() * 104) * (H / ICON_SIZE);
    if (big) {
      const r = (10 + rnd.next() * (st.size >= 60 ? 22 : 12)) * k;
      glow(out, px, py, r, color, st.size >= 60 ? 0.28 : 0.4);
      continue;
    }
    const r = (1 + rnd.next() * 1.3 + st.size * 0.05) * k;
    glow(out, px, py, r * 3.2, color, 0.85);
    if (Math.abs(st.rise) > 0.15) {
      // A short streak behind it: up for embers and ash, down for drips.
      const len = r * (5 + rnd.next() * 4);
      const dir = st.rise > 0 ? 1 : -1;
      const g = out.createLinearGradient(px, py, px, py + dir * len);
      g.addColorStop(0, css(color, 0.55));
      g.addColorStop(1, css(color, 0));
      out.strokeStyle = g;
      out.lineWidth = r * 0.9;
      out.beginPath();
      out.moveTo(px, py);
      out.lineTo(px, py + dir * len);
      out.stroke();
    }
    if (st.twinkle >= 0.8) {
      out.strokeStyle = css(0xffffff, 0.7);
      out.lineWidth = 0.8 * k;
      const l = r * 2.6;
      out.beginPath();
      out.moveTo(px - l, py);
      out.lineTo(px + l, py);
      out.moveTo(px, py - l);
      out.lineTo(px, py + l);
      out.stroke();
    }
    if (st.core > 0.4) {
      out.fillStyle = css(0xffffff, 0.85);
      out.beginPath();
      out.arc(px, py, r * 0.45, 0, Math.PI * 2);
      out.fill();
    }
  }
  out.restore();
}

/** The mark drawn when there is no studio: a faceted stone in the rarity colour. */
function fallback(out: Ctx, rc: number, k: number): void {
  const cx = out.canvas.width / 2;
  const cy = out.canvas.height / 2;
  out.fillStyle = css(rc, 0.85);
  out.strokeStyle = css(0x000000, 0.7);
  out.lineWidth = 3 * k;
  out.beginPath();
  out.moveTo(cx, cy - 42 * k);
  out.lineTo(cx + 36 * k, cy);
  out.lineTo(cx, cy + 42 * k);
  out.lineTo(cx - 36 * k, cy);
  out.closePath();
  out.fill();
  out.stroke();
}

/**
 * Draws the icon for one item onto `out`, a clear canvas context sized by
 * `iconCanvasSize` (128px square on a plain screen unless the item has a shape).
 * Synchronous: builds the model, renders it, composites the rarity look.
 */
export function drawItemIcon(out: Ctx, spec: IconSpec, opts: { bare?: boolean } = {}): void {
  let shot: Shot | null = null;
  try {
    shot = renderModel(spec);
  } catch (e) {
    // A broken model must never cost the player their inventory.
    if (typeof console !== 'undefined') console.warn('[icons] render failed', spec.baseId, e);
    shot = null;
  }
  paintIcon(out, spec, opts, shot, shot && renderer ? renderer.domElement : null, drawW, drawH);
}

/**
 * As `drawItemIcon`, but the model is read back without blocking the page
 * where the studio can (WebGPU): `painted` resolves once `out` holds the
 * icon. `missing` is the scans it was drawn without, as `iconScansMissing`
 * would report straight after a `drawItemIcon`.
 */
export function drawItemIconLater(out: Ctx, spec: IconSpec): { missing: THREE.Texture[]; painted: Promise<void> } {
  let shot: (Shot & { pixels: Promise<ImageData> | null }) | null = null;
  try {
    shot = renderModel(spec, true);
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[icons] render failed', spec.baseId, e);
    shot = null;
  }
  const late = missing.slice();
  if (!shot?.pixels) {
    paintIcon(out, spec, {}, shot, shot && renderer ? renderer.domElement : null, drawW, drawH);
    return { missing: late, painted: Promise.resolve() };
  }
  const s = shot;
  const painted = shot.pixels.then(
    (img) => {
      const read = scratch('iconReadback', img.width, img.height);
      read.x.putImageData(img, 0, 0);
      paintIcon(out, spec, {}, s, read.c, img.width, img.height);
    },
    () => paintIcon(out, spec, {}, null, null, 0, 0),
  );
  return { missing: late, painted };
}

/** The rarity backdrop, the model (`src`, `sw` by `sh` from its top left) and its light. */
function paintIcon(out: Ctx, spec: IconSpec, opts: { bare?: boolean }, shot: Shot | null, src: CanvasImageSource | null, sw: number, sh: number): void {
  const W = out.canvas.width;
  const H = out.canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.max(W, H) / 2;
  // Fixed sizes below are for a plain screen; a sharper one draws bigger.
  const k = W / plainSize(spec).w;
  // `bare` draws the model alone, with no rarity light: for comparing pictures.
  const rank = opts.bare ? 0 : RANK[spec.rarity] ?? 0;
  const rc = RARITY_COLOR[spec.rarity] ?? 0xc8c8c8;
  const glowC = shot?.glowColor ?? rc;

  // Rarity backdrop: a soft pool of the rarity's light behind the object.
  if (rank >= 1) {
    const a = [0, 0.1, 0.14, 0.2, 0.26, 0.32, 0.36][rank]!;
    const g = out.createRadialGradient(cx, cy, 4 * k, cx, cy, R);
    g.addColorStop(0, css(rc, a));
    g.addColorStop(0.6, css(rc, a * 0.35));
    g.addColorStop(1, css(rc, 0));
    out.fillStyle = g;
    out.fillRect(0, 0, W, H);
  }
  if (rank >= 4) {
    // Rays behind uniques and better.
    out.save();
    out.globalCompositeOperation = 'lighter';
    out.translate(cx, cy);
    const n = rank >= 5 ? 12 : 8;
    for (let i = 0; i < n; i++) {
      out.rotate((Math.PI * 2) / n);
      const g = out.createLinearGradient(0, 0, 0, -R);
      g.addColorStop(0, css(glowC, 0));
      g.addColorStop(0.3, css(glowC, 0.12 + (rank - 4) * 0.04));
      g.addColorStop(1, css(glowC, 0));
      out.fillStyle = g;
      out.beginPath();
      out.moveTo(0, 0);
      out.lineTo(-7 * k, -R);
      out.lineTo(7 * k, -R);
      out.closePath();
      out.fill();
    }
    out.restore();
  }

  if (!shot || !src) {
    fallback(out, rc, k);
    return;
  }
  const layer = scratch('iconRenderLayer', W, H);
  layer.x.clearRect(0, 0, W, H);
  layer.x.imageSmoothingEnabled = true;
  layer.x.imageSmoothingQuality = 'high';
  layer.x.drawImage(src, 0, 0, sw, sh, 0, 0, W, H);
  if (opts.bare) {
    out.drawImage(layer.c, 0, 0);
    return;
  }
  const haloC = rank >= 3 ? glowC : rc;
  const auraSeed = `${spec.baseId}|${spec.rarity}|${spec.uniqueId ?? spec.setId ?? ''}`;
  paintAura(out, shot.aura, glowC, auraSeed, 'back', k);
  composite(out, layer.c, {
    shadow: 0.75,
    shadowBlur: 5 * k,
    dx: 2 * k,
    dy: 3 * k,
    halo: [0, 0.35, 0.4, 0.6, 0.75, 0.85, 0.9][rank]!,
    haloColor: haloC,
    haloBlur: [0, 5, 6, 8, 9, 11, 12][rank]! * k,
  });
  paintAura(out, shot.aura, glowC, auraSeed, 'front', k);
  if (rank >= 5 && shot.aura === 'none') {
    // Motes for mythic, embers for ancient.
    const rnd = new Random(hashString(`${spec.baseId}|${spec.rarity}|${spec.uniqueId ?? spec.setId ?? ''}`));
    for (let i = 0; i < 5; i++) {
      const px = (10 + rnd.next() * 108) * (W / ICON_SIZE);
      const py = (8 + rnd.next() * 112) * (H / ICON_SIZE);
      const r = (1 + rnd.next() * 1.8) * k;
      glow(out, px, py, r * 3, glowC, 0.8);
      out.fillStyle = css(0xffffff, 0.85);
      out.beginPath();
      out.arc(px, py, r * 0.45, 0, Math.PI * 2);
      out.fill();
    }
  }
}

/** Which liquid a potion holds, from its id or name. */
export function potionColor(hay: string): number {
  const h = hay.toLowerCase();
  const life = /heal|life|health|blood|crimson|rejuv/.test(h);
  const mana = /mana|azure|sapphire|spirit|arcane|rejuv/.test(h);
  if (life && mana) return 0xb060ff;
  if (mana) return 0x3aa0ff;
  if (life) return 0xe03a4a;
  if (/antidote|venom|poison/.test(h)) return 0x6cc02c;
  if (/thaw|frost|cold/.test(h)) return 0x7fd8ff;
  if (/stamina|haste/.test(h)) return 0xe0c040;
  if (/oil|fire/.test(h)) return 0xff7a2a;
  return 0xe03a4a;
}
