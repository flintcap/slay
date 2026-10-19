/**
 * SLAY — the offscreen views behind item icons, portraits and the paperdoll.
 *
 * Every studio draws with the game's own renderer into a canvas of its own
 * (a `CanvasTarget`), so it uses the GPU device the game already
 * opened and the textures and shaders already on it. Each studio used to open
 * a device of its own: four in all, each with its own copy of every texture
 * the hero wore and its own compile of every shader, which is memory a
 * browser can run out of on a map load.
 *
 * A studio draws synchronously: a render followed, in the same task, by a
 * `drawImage` of its canvas, which holds the picture only until the task ends.
 * That read blocks the page until the GPU process gets to it, which on a scene
 * load is after every shader it is building (check-loadtime: 40 to 52 s of a
 * 90 s first town inside `toBlob`). `renderPixels` reads back instead without
 * blocking (a copy into a buffer the CPU maps when the GPU is done).
 */
import * as THREE from 'three/webgpu';
import { hookSeen } from './ThreeHooks';

/** One offscreen view. Its settings never touch the game's own view. */
export interface Studio {
  readonly domElement: HTMLCanvasElement;
  /** The renderer it draws with, for helpers that need one (PMREM). Not for drawing directly. */
  readonly renderer: THREE.WebGPURenderer;
  toneMappingExposure: number;
  setPixelRatio(value: number): void;
  setSize(width: number, height: number): void;
  setViewport(x: number, y: number, width: number, height: number): void;
  setClearColor(color: THREE.ColorRepresentation, alpha: number): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  /** Draws `width` by `height` and reads the picture back without blocking the page. */
  readonly renderPixels: (scene: THREE.Object3D, camera: THREE.Camera, width: number, height: number) => Promise<ImageData>;
  compileAsync(scene: THREE.Object3D, camera: THREE.Camera): Promise<void>;
  /** Called when the game's renderer is replaced after a lost GPU; the next ask opens a new studio. */
  onLost: (() => void) | null;
  dispose(): void;
}

let host: THREE.WebGPURenderer | null = null;
let hostSet: () => void = () => {};
const hostReady = new Promise<void>((done) => (hostSet = done));

/** Every studio open on the host, told (`onLost`) when the host is replaced. */
const live = new Set<SharedStudio>();

/**
 * Set by the game once its own renderer is open, and again when a Restart
 * after a lost GPU opens another (`Engine.restartRenderer`). The studios on
 * the old one cannot draw again: each is told, and the next ask opens one on
 * the new renderer.
 */
export function setStudioHost(renderer: THREE.WebGPURenderer): void {
  if (host && host !== renderer) {
    const lost = [...live];
    live.clear();
    for (const s of lost) s.onLost?.();
  }
  host = renderer;
  hostSet();
}

/** Draws with the game's renderer into a canvas of its own. */
class SharedStudio implements Studio {
  readonly target: THREE.CanvasTarget;
  readonly domElement: HTMLCanvasElement;
  toneMappingExposure = 1;
  onLost: (() => void) | null = null;
  private clear = new THREE.Color(0x000000);
  private clearAlpha = 0;
  private readonly saved = new THREE.Color();

  constructor(
    readonly renderer: THREE.WebGPURenderer,
    private readonly samples: number,
  ) {
    this.domElement = document.createElement('canvas');
    this.target = new THREE.CanvasTarget(this.domElement);
    live.add(this);
  }

  // Resized with the renderer pointed at it: the renderer hears a resize
  // only from its current canvas, and remakes that canvas's depth buffer.
  setPixelRatio(value: number): void {
    this.use(() => this.target.setPixelRatio(value));
  }

  setSize(width: number, height: number): void {
    this.use(() => this.target.setSize(width, height, false));
  }

  setViewport(x: number, y: number, width: number, height: number): void {
    this.target.setViewport(x, y, width, height);
  }

  setClearColor(color: THREE.ColorRepresentation, alpha: number): void {
    this.clear.set(color);
    this.clearAlpha = alpha;
  }

  /** Runs `fn` with the renderer pointed at this canvas and its settings, then puts the game's back. */
  private use<T>(fn: () => T): T {
    const r = this.renderer as THREE.WebGPURenderer & { _samples: number };
    const canvas = r.getCanvasTarget();
    const rt = r.getRenderTarget();
    const exposure = r.toneMappingExposure;
    const alpha = r.getClearAlpha();
    const samples = r._samples;
    // Without it (`ThreeHooks.ts`) a studio draws at the game's own smoothing.
    const own = hookSeen('Renderer._samples', typeof samples === 'number');
    r.getClearColor(this.saved);
    r.setCanvasTarget(this.target);
    r.setRenderTarget(null);
    r.toneMappingExposure = this.toneMappingExposure;
    r.setClearColor(this.clear, this.clearAlpha);
    if (own) r._samples = this.samples;
    try {
      return fn();
    } finally {
      if (own) r._samples = samples;
      r.setClearColor(this.saved, alpha);
      r.toneMappingExposure = exposure;
      r.setRenderTarget(rt);
      r.setCanvasTarget(canvas);
    }
  }

  render(scene: THREE.Object3D, camera: THREE.Camera): void {
    this.use(() => this.renderer.render(scene, camera));
  }

  /** One target per size read, kept: icons come in a handful of shapes. */
  private readonly reads = new Map<string, THREE.RenderTarget>();

  readonly renderPixels = (scene: THREE.Object3D, camera: THREE.Camera, width: number, height: number): Promise<ImageData> => {
    const key = `${width}x${height}`;
    let rt = this.reads.get(key);
    if (!rt) {
      // Plain RGBA bytes. Drawn as the output target, so it gets the same
      // tone mapping and sRGB encoding a canvas does; the anti-aliasing is
      // done in the renderer's own frame target before that.
      rt = new THREE.RenderTarget(width, height, { type: THREE.UnsignedByteType, depthBuffer: false });
      this.reads.set(key, rt);
    }
    const r = this.renderer;
    const target = rt;
    // The copy is queued in this call, so the target can be drawn into again
    // straight after; only the CPU's view of it waits.
    const read = this.use(() => {
      const out = r.getOutputRenderTarget();
      r.setOutputRenderTarget(target);
      try {
        r.render(scene, camera);
        return r.readRenderTargetPixelsAsync(target, 0, 0, width, height);
      } finally {
        r.setOutputRenderTarget(out);
      }
    });
    return read.then((data) => straightAlpha(data as Uint8Array, width, height));
  };

  compileAsync(scene: THREE.Object3D, camera: THREE.Camera): Promise<void> {
    return this.use(() => this.renderer.compileAsync(scene, camera));
  }

  dispose(): void {
    live.delete(this);
    // Frees this canvas's own buffers; the renderer is the game's.
    this.target.dispose();
    for (const rt of this.reads.values()) rt.dispose();
    this.reads.clear();
  }
}

/**
 * GPU rows padded to 256 bytes, alpha premultiplied (as the canvas holds
 * it), to an `ImageData`, whose rows are packed and alpha straight.
 */
function straightAlpha(src: Uint8Array, w: number, h: number): ImageData {
  const stride = Math.ceil((w * 4) / 256) * 256;
  const img = new ImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const so = y * stride;
    const dO = y * w * 4;
    for (let x = 0; x < w * 4; x += 4) {
      const a = src[so + x + 3]!;
      if (a === 0) continue;
      const k = a === 255 ? 1 : 255 / a;
      d[dO + x] = Math.min(255, Math.round(src[so + x]! * k));
      d[dO + x + 1] = Math.min(255, Math.round(src[so + x + 1]! * k));
      d[dO + x + 2] = Math.min(255, Math.round(src[so + x + 2]! * k));
      d[dO + x + 3] = a;
    }
  }
  return img;
}

/** Draws `scene` at `size` square and hands back a canvas holding the picture. */
export function studioShot(s: Studio, scene: THREE.Object3D, camera: THREE.Camera, size: number): Promise<HTMLCanvasElement> {
  return s.renderPixels(scene, camera, size, size).then((img) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    cv.getContext('2d', { willReadFrequently: true })!.putImageData(img, 0, 0);
    return cv;
  });
}

/** Makes a studio on the game's renderer; null outside a page. */
export async function makeStudio(o: { antialias?: boolean } = {}): Promise<Studio | null> {
  if (typeof document === 'undefined') return null;
  await hostReady;
  return host ? new SharedStudio(host, o.antialias === false ? 0 : 4) : null;
}

/**
 * One studio shared by the portraits, kept a while between them and freed
 * once none has been asked for in a while.
 */
let shared: Promise<Studio | null> | null = null;
let users = 0;
let idle = 0;
const IDLE_MS = 20000;

/**
 * Runs `draw` with the shared portrait studio. `draw` must render and read
 * the canvas in one go, with no await in between: the canvas holds the
 * picture only until the task ends.
 */
export async function withStudio<T>(draw: (s: Studio) => T | Promise<T>): Promise<T | null> {
  window.clearTimeout(idle);
  users++;
  try {
    if (!shared) {
      shared = makeStudio();
      const mine = shared;
      void mine.then((s) => {
        // A lost device cannot draw again: the next portrait makes a new one.
        if (s) s.onLost = () => {
          if (shared === mine) shared = null;
        };
      });
    }
    const s = await shared;
    if (!s) {
      shared = null;
      return null;
    }
    // Awaited here, so a draw that reads back later still counts as a user.
    return await draw(s);
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
    void p.then((s) => s?.dispose());
  }, IDLE_MS);
}
