/**
 * SLAY — class portraits, rendered from the heroes themselves.
 *
 * Each portrait is the class's own hero (`src/scenes/HeroModel.ts`) in its
 * field kit, framed head and shoulders from a three-quarter view: one warm key
 * light from the upper left, a back light in the class's colour, the rest of
 * the face in shadow. What the select screen shows is exactly the body that
 * walks into town.
 *
 * Rendered once per class and size in a small offscreen studio shared by
 * every portrait (see `withStudio`), cached in memory and in localStorage
 * (keyed by the mesh version, so a changed body redraws). Until a portrait is
 * ready the slot shows a dark frame.
 */
import * as THREE from 'three';
import { assetStats } from '../core/Assets';
import { withStudio } from '../core/Studio';
import { MESH_VERSION } from './hero/MeshCache';
import type { CharClassId } from '../types';

/** Class colours: the back light and the ground behind the bust. */
const LOOK: Record<string, { light: number; ground: number }> = {
  warden: { light: 0xe0b860, ground: 0x2a2216 },
  mage: { light: 0x9a8aff, ground: 0x1a1430 },
  shadowblade: { light: 0x6ad8a0, ground: 0x0e1a16 },
  revenant: { light: 0x9ae0c8, ground: 0x14201c },
  ranger: { light: 0xc8d890, ground: 0x1a2012 },
  shapeshifter: { light: 0xe09050, ground: 0x22140c },
  paladin: { light: 0xf0d090, ground: 0x221a12 },
};

const PORTRAIT_VERSION = `p1.${MESH_VERSION}`;
const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function storeKey(classId: string, size: number): string {
  return `slay.portrait.${PORTRAIT_VERSION}.${classId}.${size}`;
}

function css(c: number, a = 1): string {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

/** The ground and frame behind a portrait: a dark field lit in the class colour. */
function backdrop(g: CanvasRenderingContext2D, size: number, classId: string): void {
  const look = LOOK[classId] ?? LOOK.warden!;
  g.fillStyle = '#07080a';
  g.fillRect(0, 0, size, size);
  const glow = g.createRadialGradient(size * 0.58, size * 0.38, size * 0.05, size * 0.5, size * 0.5, size * 0.75);
  glow.addColorStop(0, css(look.light, 0.32));
  glow.addColorStop(0.45, css(look.ground, 0.9));
  glow.addColorStop(1, 'rgba(4,4,6,1)');
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
}

function frame(g: CanvasRenderingContext2D, size: number): void {
  const v = g.createRadialGradient(size / 2, size * 0.45, size * 0.3, size / 2, size / 2, size * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.7)');
  g.fillStyle = v;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(150,130,96,0.55)';
  g.lineWidth = Math.max(1, size / 128);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, size - g.lineWidth, size - g.lineWidth);
}

/** Resolves once the textures in flight have landed, or after `ms`. */
async function texturesSettled(ms: number): Promise<void> {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    const s = assetStats();
    if (s.loaded + s.failed.length >= s.textures) return;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Portraits draw one at a time, each in an idle moment. The select screen
 * asks for all six at once; drawn together, each one's posing, drawing and
 * PNG encoding landed in the same few frames of the screen's first second.
 */
let queue: Promise<unknown> = Promise.resolve();
function idleSlot(): Promise<void> {
  return new Promise((r) => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(() => r(), { timeout: 500 });
    else requestAnimationFrame(() => r());
  });
}
function render(classId: CharClassId, size: number): Promise<string> {
  const run = queue.then(async () => {
    await idleSlot();
    return renderNow(classId, size);
  });
  queue = run.catch(() => undefined);
  return run;
}

async function renderNow(classId: CharClassId, size: number): Promise<string> {
  const { buildClassHero } = await import('../scenes/HeroModel');
  // The boot worker may be meshing this hero right now: wait for it rather
  // than meshing the same body again here, a freeze of seconds.
  const { heroMeshed } = await import('./npc/Prewarm');
  await heroMeshed(classId);
  const hero = buildClassHero(classId);
  const look = LOOK[classId] ?? LOOK.warden!;
  const scene = new THREE.Scene();
  scene.add(hero.root);
  // Turned a little to the light, standing in its stance.
  hero.root.rotation.y = 0.45;
  for (let i = 0; i < 40; i++) hero.animator.update(1 / 30);
  await texturesSettled(3000);

  scene.add(new THREE.HemisphereLight(0x8890a0, 0x1a1410, 0.5));
  const key = new THREE.DirectionalLight(0xffe2c0, 3.2);
  key.position.set(2.2, 3.2, 3.0);
  scene.add(key);
  const back = new THREE.DirectionalLight(look.light, 4.0);
  back.position.set(-2.4, 2.0, -2.6);
  scene.add(back);
  const fill = new THREE.DirectionalLight(look.light, 0.5);
  fill.position.set(-2.0, 0.2, 2.0);
  scene.add(fill);

  // Head and shoulders: frame on the head bone wherever the stance puts it.
  scene.updateMatrixWorld(true);
  const head = new THREE.Vector3();
  hero.root.getObjectByName('head')?.getWorldPosition(head);
  if (head.lengthSq() === 0) head.set(0, 1.65, 0);
  const aim = head.clone().add(new THREE.Vector3(0, -0.1, 0));
  const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
  camera.position.copy(aim).add(new THREE.Vector3(0.25, 0.08, 1.75));
  camera.lookAt(aim);

  try {
    // The studio is shared by every portrait, and cached between them: the
    // six heroes share most of their materials, so they compile once.
    const uri = await withStudio((renderer) => {
      renderer.toneMappingExposure = 1.1;
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(size, size);
      renderer.render(scene, camera);
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const g = cv.getContext('2d', { willReadFrequently: true })!;
      backdrop(g, size, classId);
      g.drawImage(renderer.domElement, 0, 0, size, size);
      frame(g, size);
      return cv.toDataURL('image/png');
    });
    return uri ?? '';
  } finally {
    hero.dispose();
  }
}

/** A portrait already rendered (this visit or an earlier one), or ''. */
export function classPortraitUri(classId: string, size = 256): string {
  const k = storeKey(classId, size);
  const hit = memory.get(k);
  if (hit) return hit;
  try {
    const stored = localStorage.getItem(k);
    if (stored) {
      memory.set(k, stored);
      return stored;
    }
  } catch {
    /* no storage: render again */
  }
  return '';
}

/** The class portrait as a data URI, rendered from its hero on first ask. */
export function classPortrait(classId: CharClassId, size = 256): Promise<string> {
  const ready = classPortraitUri(classId, size);
  if (ready) return Promise.resolve(ready);
  const k = storeKey(classId, size);
  const inFlight = pending.get(k);
  if (inFlight) return inFlight;
  const p = render(classId, size)
    .then((uri) => {
      memory.set(k, uri);
      try {
        localStorage.setItem(k, uri);
      } catch {
        /* quota: kept in memory for this visit */
      }
      return uri;
    })
    .catch(() => '')
    .finally(() => pending.delete(k));
  pending.set(k, p);
  return p;
}

/** A dark framed placeholder in the class colour, for the moment before a portrait lands. */
export function classPortraitPlaceholder(classId: string, size = 256): string {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d', { willReadFrequently: true });
  if (!g) return '';
  backdrop(g, size, classId);
  frame(g, size);
  return cv.toDataURL('image/png');
}
