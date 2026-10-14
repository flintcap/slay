/**
 * Just enough of a browser for building models in Node: canvases that draw
 * nothing and images that never load. Imported first by the entries that
 * build meshes headlessly. Colours live on the materials, so nothing a
 * checker reads is lost.
 */
const g = globalThis as Record<string, unknown>;
if (typeof g.document === 'undefined') {
  const nothing: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === 'data' ? new Uint8ClampedArray(4 * 64 * 64) : k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : nothing),
    apply: () => nothing,
    set: () => true,
  });
  const canvas = (): unknown => ({ width: 64, height: 64, style: {}, getContext: () => nothing, toDataURL: () => '', addEventListener() {} });
  g.document = { createElement: (tag: string) => (tag === 'canvas' ? canvas() : { style: {}, appendChild() {}, setAttribute() {} }), body: { appendChild() {} } };
  g.window = g;
  g.self = g;
  g.OffscreenCanvas = class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h; } getContext() { return nothing; } };
  if (typeof g.Image === 'undefined') g.Image = class { onload: unknown = null; onerror: unknown = null; set src(_v: string) {} };
  if (typeof g.requestAnimationFrame === 'undefined') g.requestAnimationFrame = () => 0;
}
export {};
