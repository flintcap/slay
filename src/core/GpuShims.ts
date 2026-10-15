/**
 * SLAY — small fixes between three.js and the browsers that run it.
 *
 * three.js asks every texture view for the identity swizzle (`'rgba'`).
 * Chrome builds that shipped the experimental swizzle as a dictionary throw
 * on the string, and every draw fails. The identity swizzle changes nothing,
 * so it is dropped before it reaches the browser.
 */
type ViewDesc = { swizzle?: unknown } | undefined;

let done = false;
export function installGpuShims(): void {
  if (done) return;
  done = true;
  const T = (globalThis as { GPUTexture?: { prototype: { createView(d?: ViewDesc): unknown } } }).GPUTexture;
  if (!T?.prototype?.createView) return;
  const createView = T.prototype.createView;
  T.prototype.createView = function (this: unknown, d?: ViewDesc): unknown {
    if (d && d.swizzle === 'rgba') d.swizzle = undefined;
    return createView.call(this, d);
  };
}
