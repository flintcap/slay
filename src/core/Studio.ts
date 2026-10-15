/**
 * SLAY — the offscreen renderers behind item icons and portraits.
 *
 * A WebGPU renderer opens its GPU device asynchronously, so a studio is made
 * and opened ahead of use, then drawn with synchronously: a render followed,
 * in the same task, by a `drawImage` of its canvas. Each studio is its own
 * small device, cut off from the game's, so its size and settings never
 * touch the main view.
 */
import * as THREE from 'three/webgpu';

/** Set by the game once its own renderer is open: false on the WebGL2 fallback. */
let webgpu = true;
export function setStudioBackend(isWebGPU: boolean): void {
  webgpu = isWebGPU;
}

/** Makes and opens an offscreen renderer; null when the browser gives no GPU for it. */
export async function makeStudioRenderer(o: { alpha?: boolean; antialias?: boolean } = {}): Promise<THREE.WebGPURenderer | null> {
  if (typeof document === 'undefined') return null;
  let r: THREE.WebGPURenderer | null = null;
  try {
    r = new THREE.WebGPURenderer({
      antialias: o.antialias ?? true,
      alpha: o.alpha ?? true,
      // The fallback the game already chose: do not ask for WebGPU again.
      forceWebGL: !webgpu,
      powerPreference: 'low-power',
    });
    await r.init();
    r.setPixelRatio(1);
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    return r;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[studio] no offscreen renderer', e);
    r?.dispose();
    return null;
  }
}

/**
 * One studio shared by the portraits, kept a while between them and freed
 * once none has been asked for in a while.
 */
let shared: Promise<THREE.WebGPURenderer | null> | null = null;
let users = 0;
let idle = 0;
const IDLE_MS = 20000;

/**
 * Runs `draw` with the shared portrait studio. `draw` must render and read
 * the canvas in one go, with no await in between: the canvas holds the
 * picture only until the task ends.
 */
export async function withStudio<T>(draw: (r: THREE.WebGPURenderer) => T): Promise<T | null> {
  window.clearTimeout(idle);
  users++;
  try {
    if (!shared) {
      shared = makeStudioRenderer();
      const mine = shared;
      void mine.then((r) => {
        // A lost device cannot draw again: the next portrait makes a new one.
        if (r) r.onDeviceLost = () => {
          if (shared === mine) shared = null;
        };
      });
    }
    const r = await shared;
    if (!r) {
      shared = null;
      return null;
    }
    return draw(r);
  } finally {
    users--;
    if (users === 0) releaseLater();
  }
}

function releaseLater(): void {
  window.clearTimeout(idle);
  idle = window.setTimeout(() => {
    if (users > 0 || !shared) return;
    const p = shared;
    shared = null;
    void p.then((r) => r?.dispose());
  }, IDLE_MS);
}
