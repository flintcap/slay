/**
 * Entry point for `tools/check-nameplates.mjs`: a monster keeps its own plate
 * while the crowd around it shifts. Plates were handed out in list order, so
 * one monster stepping in or out of view moved every plate after it onto a
 * new face, and a rare pack's badges were rebuilt frame after frame.
 *
 * Runs on a stand-in DOM that only counts what gets built.
 */
import * as THREE from 'three';

let built = 0;
const fakeCtx = new Proxy({}, { get: (_t, k) => (k === 'canvas' ? fakeEl('canvas') : () => fakeCtx), set: () => true });
function fakeEl(tag: string): Record<string, unknown> {
  if (tag === 'img') built++;
  const el: Record<string, unknown> = {
    tagName: tag.toUpperCase(),
    style: { setProperty() {}, display: '', transform: '', opacity: '' },
    dataset: {},
    children: [] as unknown[],
    className: '',
    textContent: '',
    width: 0,
    height: 0,
    append(...c: unknown[]) {
      (el.children as unknown[]).push(...c);
    },
    appendChild(c: unknown) {
      (el.children as unknown[]).push(c);
      return c;
    },
    remove() {},
    getContext: () => fakeCtx,
    toDataURL: () => 'data:image/png;base64,',
  };
  return el;
}
const g = globalThis as unknown as Record<string, unknown>;
g.Path2D = class { constructor() { return new Proxy({}, { get: () => () => undefined }); } };
g.document = { createElement: fakeEl, getElementById: () => null, body: fakeEl('body') };

const { NameplateLayer } = await import('../src/ui/Nameplates');
type PlateData = import('../src/ui/Nameplates').PlateData;

const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 200);
camera.position.set(0, 14, 12);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

type T = { root: THREE.Object3D; life: number; nameplate: PlateData };
const mk = (i: number, rank: string, affixes: number): T => {
  const root = new THREE.Object3D();
  root.position.set(-6 + (i % 7) * 2, 0, -2 + Math.floor(i / 7) * 2);
  const names = Array.from({ length: affixes }, (_, k) => `affix ${k}`);
  return {
    root,
    life: 10,
    nameplate: { name: `m${i}`, rank: rank as PlateData['rank'], affixes: names, affixBehaviors: names.map(() => 'fire_enchanted'), affixColors: names.map(() => 0xff6633), life: 10, maxLife: 10, color: 0xffffff, level: 30 },
  };
};
// Ordinary monsters mixed in among a rare pack, as they come in a fight.
const crowd: T[] = [];
for (let i = 0; i < 14; i++) crowd.push(mk(i, i % 3 === 0 ? 'rare' : 'normal', i % 3 === 0 ? 4 : 0));
const focus = new THREE.Vector3();
const layer = new NameplateLayer();
layer.update(camera, crowd, focus, 1280, 720);
const first = built;
// Ordinary monsters step in and out of range, one after another.
for (let f = 0; f < 60; f++) {
  for (const t of crowd) if (t.nameplate.rank === 'normal') t.life = (f + Number(String(t.nameplate.name).slice(1))) % 4 === 0 ? 0 : 10;
  layer.update(camera, crowd, focus, 1280, 720);
}
const rebuilt = built - first;
console.log(JSON.stringify({ first, rebuilt }));
