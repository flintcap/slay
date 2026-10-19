/**
 * SLAY — canvas textures upload without blocking the page.
 *
 * three.js hands a canvas to WebGPU with `copyExternalImageToTexture`, which
 * waits, blocking the page, until the GPU process has taken the canvas in.
 * On a scene load that process is busy building shaders, so even a 2x2
 * placeholder took a second and a 128x128 label eleven (check-loadtime, a
 * first town). Every texture canvas here is a small 2D canvas painted on the
 * CPU, so its pixels are read here and written with `writeTexture`, which
 * copies them into the GPU's queue and returns at once.
 *
 * Anything else (an image, an ImageBitmap, a canvas with a GPU context, a
 * format other than 8-bit RGBA) still goes the usual way.
 */
import type * as THREE from 'three/webgpu';
import { hookSeen } from './ThreeHooks';

type CopyImage = (
  image: unknown,
  textureGPU: GPUTexture,
  descriptor: GPUTextureDescriptor & { size: { width: number; height: number } },
  originDepth: number,
  flipY: boolean,
  premultiplyAlpha: boolean,
  mipLevel?: number,
) => void;

const RGBA8 = new Set<GPUTextureFormat>(['rgba8unorm', 'rgba8unorm-srgb']);

function context2d(image: unknown): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  const c = image as HTMLCanvasElement | OffscreenCanvas;
  const isCanvas = (typeof HTMLCanvasElement !== 'undefined' && c instanceof HTMLCanvasElement) || (typeof OffscreenCanvas !== 'undefined' && c instanceof OffscreenCanvas);
  if (!isCanvas) return null;
  // Null for a canvas with a WebGL or WebGPU context.
  return c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
}

/** Routes 2D canvas uploads of `renderer` (a WebGPU one) through `writeTexture`. */
export function uploadCanvasesWithoutWaiting(renderer: THREE.WebGPURenderer): void {
  const backend = renderer.backend as unknown as { device?: GPUDevice; textureUtils?: { _copyImageToTexture?: CopyImage } };
  const utils = backend.textureUtils;
  const device = backend.device;
  // Without them (`ThreeHooks.ts`) canvases upload the way three does.
  hookSeen('WebGPUTextureUtils._copyImageToTexture', typeof utils?._copyImageToTexture === 'function' && !!device);
  if (!utils?._copyImageToTexture || !device) return;
  const base = utils._copyImageToTexture.bind(utils);
  utils._copyImageToTexture = (image, textureGPU, descriptor, originDepth, flipY, premultiplyAlpha, mipLevel = 0) => {
    const ctx = RGBA8.has(descriptor.format) ? context2d(image) : null;
    if (!ctx) return base(image, textureGPU, descriptor, originDepth, flipY, premultiplyAlpha, mipLevel);
    const src = image as { width: number; height: number };
    const w = mipLevel > 0 ? src.width : descriptor.size.width;
    const h = mipLevel > 0 ? src.height : descriptor.size.height;
    const px = ctx.getImageData(0, 0, w, h).data;
    const row = w * 4;
    let data: Uint8ClampedArray = px;
    if (flipY || premultiplyAlpha) {
      data = new Uint8ClampedArray(px.length);
      for (let y = 0; y < h; y++) {
        const from = (flipY ? h - 1 - y : y) * row;
        data.set(px.subarray(from, from + row), y * row);
      }
      if (premultiplyAlpha) {
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3]! / 255;
          data[i] = data[i]! * a;
          data[i + 1] = data[i + 1]! * a;
          data[i + 2] = data[i + 2]! * a;
        }
      }
    }
    device.queue.writeTexture(
      { texture: textureGPU, mipLevel, origin: { x: 0, y: 0, z: originDepth } },
      data,
      { offset: 0, bytesPerRow: row, rowsPerImage: h },
      { width: w, height: h, depthOrArrayLayers: 1 },
    );
  };
}
