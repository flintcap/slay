/**
 * SLAY — boss portraits, rendered from the bosses themselves.
 *
 * Each portrait is the boss's own creature body (the same look the arena
 * spawns), standing in its idle, framed on its head from a three-quarter
 * view: a warm key light from the upper left and a back light in the boss's
 * own glow colour, inside a round iron medallion. What the intro card shows
 * is exactly the body that fights.
 *
 * Rendered once per boss and size in a small offscreen context, cached in
 * memory and in localStorage (keyed by the bake version, so a changed body
 * redraws). `prepareBossPortrait` renders ahead of the fight (the boss
 * calls it when it is built with the floor); `bossPortraitUri` answers at
 * once with what is ready, or null.
 */
import * as THREE from 'three';
import { BOSSES } from '../data/bosses';
import { WARDENS } from '../data/wardens';
import { assetStats } from '../core/Assets';
import { studioShot, withStudio } from '../core/Studio';
import { Random, hashString } from '../core/RNG';
import { lookFor } from './creatures/Looks';
import { creatureSocket, instanceCreature, releaseCreature } from './creatures/Creature';
import { CreatureAnimator, type CreatureInfo } from './creatures/Animator';
import { BAKE_VERSION } from './creatures/Store';

const PORTRAIT_VERSION = `b1.${BAKE_VERSION}`;
const memory = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function storeKey(id: string, size: number): string {
  return `slay.bossportrait.${PORTRAIT_VERSION}.${id}.${size}`;
}

function css(c: number, a = 1): string {
  return `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
}

function bossOf(idOrName: string) {
  return [...BOSSES, ...WARDENS].find((x) => x.id === idOrName || x.name === idOrName) ?? null;
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

/** The medallion's field: near black, lit from behind in the boss's colour. */
function backdrop(g: CanvasRenderingContext2D, size: number, light: number): void {
  g.fillStyle = '#060507';
  g.fillRect(0, 0, size, size);
  const glow = g.createRadialGradient(size * 0.55, size * 0.4, size * 0.04, size * 0.5, size * 0.5, size * 0.6);
  glow.addColorStop(0, css(light, 0.38));
  glow.addColorStop(0.5, css(light, 0.1));
  glow.addColorStop(1, 'rgba(4,3,5,1)');
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
}

/** A vignette, then the round hammered-iron rim; the corners are cut away. */
function medallion(g: CanvasRenderingContext2D, size: number, light: number): void {
  const c = size / 2;
  const v = g.createRadialGradient(c, c * 0.92, size * 0.22, c, c, size * 0.5);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = v;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = '#000';
  g.beginPath();
  g.arc(c, c, size * 0.47, 0, Math.PI * 2);
  g.fill();
  g.globalCompositeOperation = 'source-over';
  const w = Math.max(2, size * 0.055);
  const ring = g.createLinearGradient(0, 0, size, size);
  ring.addColorStop(0, '#8a9098');
  ring.addColorStop(0.35, '#3a3e44');
  ring.addColorStop(0.65, '#1c1e22');
  ring.addColorStop(1, '#5a6068');
  g.strokeStyle = ring;
  g.lineWidth = w;
  g.beginPath();
  g.arc(c, c, size * 0.47 - w / 2, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = css(light, 0.45);
  g.lineWidth = Math.max(1, size / 96);
  g.beginPath();
  g.arc(c, c, size * 0.47 - w, 0, Math.PI * 2);
  g.stroke();
}

async function render(id: string, size: number): Promise<string> {
  const def = bossOf(id);
  if (!def) return '';
  const look = lookFor(def.visual, def.family, 'boss');
  const m = instanceCreature(look, def.scale ?? 1, { rank: 'boss' });
  const info = m.root.userData.creature as CreatureInfo;
  const light = def.visual.glow ?? 0xff7a30;
  const scene = new THREE.Scene();
  scene.add(m.root);
  // Turned a little to the light, standing in its idle.
  m.root.rotation.y = 0.5;
  const anim = new CreatureAnimator(m.root, m.bones, info, new Random(hashString(id)));
  for (let i = 0; i < 40; i++) {
    m.root.updateMatrixWorld(true);
    anim.update(1 / 30, { locomotion: 0, action: 'idle', actionT: 0, time: i / 30, deathT: 0 });
  }
  await texturesSettled(3000);

  scene.add(new THREE.HemisphereLight(0x8890a0, 0x1a1410, 0.55));
  const key = new THREE.DirectionalLight(0xffe2c0, 3.0);
  key.position.set(2.2, 3.2, 3.0);
  scene.add(key);
  const back = new THREE.DirectionalLight(light, 4.0);
  back.position.set(-2.4, 2.0, -2.6);
  scene.add(back);
  const fill = new THREE.DirectionalLight(light, 0.6);
  fill.position.set(-2.0, 0.2, 2.0);
  scene.add(fill);

  // Frame on the head wherever the idle puts it. Upright bodies get head and
  // shoulders; eyes, blobs and serpents show more of themselves.
  scene.updateMatrixWorld(true);
  const H = info.height * m.root.scale.y;
  const head = new THREE.Vector3();
  const hs = creatureSocket(m.root, 'head') ?? m.root.getObjectByName('head');
  if (hs) hs.getWorldPosition(head);
  else head.set(0, H * 0.8, 0);
  const bust = info.kind === 'biped' || info.kind === 'brute' || info.kind === 'giant' || info.kind === 'specter';
  const span = bust ? 0.42 * H : 0.75 * H;
  // Busts aim just under the head; whole bodies aim between head and middle.
  const aim = bust ? head.clone().add(new THREE.Vector3(0, -0.06 * H, 0)) : new THREE.Vector3(head.x * 0.5, (head.y + 0.5 * H) * 0.5, head.z * 0.5);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 200);
  const dist = (span * 0.5) / Math.tan((camera.fov * Math.PI) / 360) + 0.15 * H;
  camera.position.copy(aim).add(new THREE.Vector3(0.18 * dist, 0.1 * dist, dist));
  camera.lookAt(aim);
  camera.updateProjectionMatrix();

  // Creature albedo carries data in its alpha, so the body is drawn over an
  // opaque backdrop inside the render, never composited onto one after.
  const bg = document.createElement('canvas');
  bg.width = bg.height = size;
  backdrop(bg.getContext('2d', { willReadFrequently: true })!, size, light);
  const bgTex = new THREE.CanvasTexture(bg);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex;
  try {
    const uri = await withStudio(async (renderer) => {
      renderer.toneMappingExposure = 1.15;
      const shot = studioShot(renderer, scene, camera, size);
      // No wait on the canvas path: its picture lasts only this task.
      const pic = shot instanceof Promise ? await shot : shot;
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const g = cv.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(pic, 0, 0, size, size);
      medallion(g, size, light);
      return cv.toDataURL('image/png');
    });
    return uri ?? '';
  } finally {
    releaseCreature(m.root);
    bgTex.dispose();
  }
}

/** The intro-card portrait of one boss (by id or name) if it is ready, else null. */
export function bossPortraitUri(idOrName: string, size = 128): string | null {
  const def = bossOf(idOrName);
  if (!def) return null;
  const k = storeKey(def.id, size);
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
  void prepareBossPortrait(def.id, size);
  return null;
}

/** Renders a boss's portrait ahead of need; resolves to its data URI ('' on failure). */
export function prepareBossPortrait(idOrName: string, size = 128): Promise<string> {
  const def = bossOf(idOrName);
  if (!def || typeof document === 'undefined') return Promise.resolve('');
  const k = storeKey(def.id, size);
  const ready = memory.get(k);
  if (ready) return Promise.resolve(ready);
  try {
    const stored = localStorage.getItem(k);
    if (stored) {
      memory.set(k, stored);
      return Promise.resolve(stored);
    }
  } catch {
    /* no storage */
  }
  const inFlight = pending.get(k);
  if (inFlight) return inFlight;
  // Off the caller's frame: the boss asks while the floor is being built.
  const p = new Promise<void>((r) => setTimeout(r, 0))
    .then(() => render(def.id, size))
    .then((uri) => {
      if (!uri) return '';
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

/** Every boss id, for sheets and tests. */
export function bossIds(): string[] {
  return BOSSES.map((b) => b.id);
}
