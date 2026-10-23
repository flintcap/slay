/**
 * SLAY — texture sizes that are always numbers.
 *
 * three.js reads a texture's width and height through one shared vector: the
 * source's `getSize` writes the image's `width`, `height` and `depth` into it.
 * An image with no size yet (the screen's depth texture before its first
 * frame, a render target not yet drawn) writes `undefined` there. One such
 * write is enough for the browser to stop keeping any `Vector3` field as a
 * plain number, game-wide and for good: from then on every position, scale
 * and direction write in the game makes a small piece of garbage. With
 * hundreds of monsters posed every frame that was megabytes a second, and the
 * stutter of collecting it.
 *
 * So a size that is not a number reads as NaN, which every caller in three.js
 * treats as it treated `undefined` (a mismatch, or `|| 1`).
 */
import * as THREE from 'three/webgpu';
import { hookSeen } from './ThreeHooks';

type GetSize = (this: THREE.TextureSource<unknown>, target: THREE.Vector3) => THREE.Vector3;
type Sized = { width?: unknown; height?: unknown; depth?: unknown; videoWidth?: number; videoHeight?: number; displayWidth?: number; displayHeight?: number };

const num = (v: unknown): number => (typeof v === 'number' ? v : NaN);
const proto = THREE.TextureSource.prototype as unknown as { getSize: GetSize };

// Only over three's own (`ThreeHooks.ts`): a three.js without it keeps its sizes.
if (hookSeen('TextureSource.getSize', typeof proto.getSize === 'function')) {
  proto.getSize = function (target) {
    const data = this.data as Sized | null;
    if (typeof HTMLVideoElement !== 'undefined' && data instanceof HTMLVideoElement) target.set(data.videoWidth, data.videoHeight, 0);
    else if (typeof VideoFrame !== 'undefined' && data instanceof VideoFrame) target.set(data.displayWidth, data.displayHeight, 0);
    else if (data !== null) target.set(num(data.width), num(data.height), num(data.depth) || 0);
    else target.set(0, 0, 0);
    return target;
  };
}
