/**
 * Prop sheets for `tools/prop-sheet.mjs`. Runs in the browser on the Vite dev
 * server against the real prop library, without booting the game.
 *
 * `kinds`: one cell per kind x biome x variant, three-quarter view, on a
 * patch of the biome's floor (and its wall, for wall props), lit by a dim
 * dungeon fill plus the prop's own light. Under each cell: kind, variant,
 * triangles, draw calls (layers + flame), build time.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { allSetNames, preloadSets } from '../src/art/TextureSets';
import { assetsPending, preloadAssets } from '../src/core/Assets';
import { propTextureFiles, propMat } from '../src/art/props/PropMats';
import { KIND_GROUPS, libraryTemplate } from '../src/art/props/Library';
import { propDef } from '../src/art/props/Defs';
import { WALL_FACE } from '../src/art/props/Kit';
import { biomeArt } from '../src/world/Biomes';
import type { BiomeId } from '../src/types';

const BG = '#14161c';
const INK = '#c9d1de';
const DIM = '#7d8796';

let renderer: THREE.WebGLRenderer | null = null;
let envTex: THREE.Texture | null = null;

function studio(w: number, h: number): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
  }
  renderer.setSize(w, h, false);
  if (!envTex) {
    const pm = new THREE.PMREMGenerator(renderer);
    envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  return renderer;
}

function expand(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (id === 'all') for (const l of Object.values(KIND_GROUPS)) out.push(...l);
    else if (KIND_GROUPS[id]) out.push(...KIND_GROUPS[id]!);
    else out.push(id);
  }
  return out;
}

async function ready(): Promise<void> {
  await preloadSets(allSetNames());
  await preloadAssets(propTextureFiles(), 'props');
}

export async function kinds(ids: string[], biomes: string[]): Promise<string> {
  await ready();
  const list = expand(ids);
  const cells: Array<{ kind: string; biome: BiomeId; v: number }> = [];
  for (const kind of list) for (const b of biomes) for (let v = 0; v < propDef(kind).variants; v++) cells.push({ kind, biome: b as BiomeId, v });
  // Build every template once first, so every texture is requested, then
  // wait for the images before drawing anything.
  for (const cell of cells) {
    try {
      libraryTemplate(cell.kind, biomeArt(cell.biome), 1, cell.v);
      propMat(biomeArt(cell.biome).floors[0]!.palette, { grime: 0 });
      propMat(biomeArt(cell.biome).walls[0]!.palette, { grime: 0 });
    } catch {
      /* reported per cell below */
    }
  }
  for (let i = 0; i < 300 && assetsPending() > 0; i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
  const cw = 230;
  const chh = 250;
  const cols = Math.min(6, cells.length);
  const rows = Math.ceil(cells.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * cw;
  c.height = rows * chh + 28;
  const g = c.getContext('2d')!;
  g.fillStyle = BG;
  g.fillRect(0, 0, c.width, c.height);
  g.font = '12px monospace';
  g.fillStyle = INK;
  g.fillText(`props: ${ids.join(' ')} | ${biomes.join(' ')}`, 8, 18);
  const r = studio(cw, chh - 36);
  const cam = new THREE.PerspectiveCamera(34, cw / (chh - 36), 0.05, 100);
  for (let i = 0; i < cells.length; i++) {
    const { kind, biome, v } = cells[i]!;
    const art = biomeArt(biome);
    const def = propDef(kind);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101216);
    scene.environment = envTex;
    scene.environmentIntensity = 0.18;
    scene.add(new THREE.HemisphereLight(0x8090b0, 0x2a2420, 1.6));
    const key = new THREE.DirectionalLight(0xffe0c0, 2.4);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    scene.add(key);
    const floorMat = propMat(art.floors[0]!.palette, { grime: 0 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 32).rotateX(-Math.PI / 2), floorMat);
    floor.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(floor.geometry.getAttribute('position').count * 3).fill(1), 3));
    floor.receiveShadow = true;
    scene.add(floor);
    const wall = def.placement === 'wall';
    const off = wall ? def.wallOffset ?? 0.75 : 0;
    if (wall) {
      const wm = propMat(art.walls[0]!.palette, { grime: 0 });
      const wg = new THREE.BoxGeometry(4, 3.6, 0.4);
      wg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(wg.getAttribute('position').count * 3).fill(1), 3));
      const w = new THREE.Mesh(wg, wm);
      w.position.set(0, 1.8, WALL_FACE - 0.2 - (off - 0.75));
      w.receiveShadow = true;
      scene.add(w);
    }
    let line2 = '';
    let h = 1;
    let cyOver = 0.5;
    try {
      const t0 = performance.now();
      const t = libraryTemplate(kind, art, 1, v);
      const ms = performance.now() - t0;
      const root = new THREE.Group();
      let tris = 0;
      const bb = new THREE.Box3();
      for (const l of t.layers) {
        const m = new THREE.Mesh(l.geometry, l.material);
        m.castShadow = t.castShadow && !l.ghost;
        m.receiveShadow = true;
        root.add(m);
        tris += (l.geometry.index?.count ?? 0) / 3;
        l.geometry.computeBoundingBox();
        bb.union(l.geometry.boundingBox!);
      }
      if (t.flame) {
        const f = new THREE.Mesh(t.flame.geometry, t.flame.material);
        f.position.set(0, t.flame.y, t.flame.forward);
        root.add(f);
        tris += (t.flame.geometry.index?.count ?? 0) / 3;
      }
      if (t.light) {
        const pl = new THREE.PointLight(t.light.color, t.light.intensity, t.light.distance, 2);
        pl.position.set(0, t.light.height, t.light.forward);
        scene.add(pl);
      }
      scene.add(root);
      if (t.blocks && t.radius > 0) {
        const sq = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.PlaneGeometry(t.radius * 2, t.radius * 2).rotateX(-Math.PI / 2)),
          new THREE.LineBasicMaterial({ color: 0x40ff60 }),
        );
        sq.position.y = 0.02;
        scene.add(sq);
      }
      h = Math.max(0.35, bb.max.y - Math.max(0, bb.min.y) * (wall ? 1 : 0), (bb.max.x - bb.min.x) * 0.9, (bb.max.z - bb.min.z) * 0.9);
      cyOver = wall ? (bb.max.y + bb.min.y) / 2 : bb.max.y * 0.45;
      line2 = `${Math.round(tris)}t ${t.layers.length + (t.flame ? 1 : 0)}dc ${ms.toFixed(0)}ms`;
    } catch (err) {
      line2 = `ERROR ${String(err).slice(0, 40)}`;
      console.log(String((err as Error).stack ?? err));
    }
    const yaw = wall ? 0.5 : 0.7;
    const pitch = 0.42;
    const dist = (h * 0.75) / Math.tan((cam.fov * Math.PI) / 360) + 0.4;
    const cy = cyOver;
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, cy + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(0, cy, wall ? -0.1 : 0);
    cam.updateProjectionMatrix();
    r.render(scene, cam);
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * chh + 28;
    g.drawImage(r.domElement, x, y);
    g.fillStyle = INK;
    g.fillText(`${kind} ${v} ${biome}`.slice(0, 30), x + 6, y + chh - 22);
    g.fillStyle = DIM;
    g.fillText(line2, x + 6, y + chh - 7);
  }
  return c.toDataURL('image/png');
}

export const SHEETS: Record<string, (ids: string[], biomes: string[]) => Promise<string>> = {
  kinds,
};
