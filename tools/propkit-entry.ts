/**
 * Entry point for `tools/check-propkit.mjs`: builds every prop kind, in every
 * biome, in every variant (and every used state), and measures it.
 */
import * as THREE from 'three';
import { builtKinds, libraryTemplate, remainsTemplate } from '../src/art/props/Library';
import { PROP_DEFS, propDef } from '../src/art/props/Defs';
import { WALL_FACE } from '../src/art/props/Kit';
import { biomeArt } from '../src/world/Biomes';
import type { BiomeId } from '../src/types';

const BIOMES: BiomeId[] = ['crypt', 'caverns', 'foundry', 'sunkenTemple', 'hive', 'frostvault', 'ashwaste', 'voidspire', 'darkForest', 'swamp', 'desert', 'desertTomb', 'tundra', 'hell'];
const STATES: Record<string, string> = { chest: 'open', chestRare: 'open', chestVault: 'open', shrine: 'spent', lever: 'pulled', bookcase: 'searched', altar: 'spent' };

interface Row {
  kind: string;
  placement: string;
  radius: number;
  blocks: boolean;
  tris: number;
  calls: number;
  minY: number;
  maxY: number;
  /** Widest half-extent of anything below head height (1.8 m), in the prop's frame. */
  low: number;
  minZ: number;
  nan: number;
  ms: number;
  errors: string[];
}

const rows = new Map<string, Row>();
const v = new THREE.Vector3();
const missing = Object.keys(PROP_DEFS).filter((k) => !builtKinds().includes(k));

function measure(kind: string, biome: BiomeId, variant: number, state?: string): void {
  const def = propDef(kind);
  let r = rows.get(kind);
  if (!r) {
    r = { kind, placement: def.placement, radius: def.radius, blocks: def.blocks, tris: 0, calls: 0, minY: Infinity, maxY: -Infinity, low: 0, minZ: Infinity, nan: 0, ms: 0, errors: [] };
    rows.set(kind, r);
  }
  const t0 = performance.now();
  let t;
  try {
    t = state ? remainsTemplate(kind, biomeArt(biome), variant, state) : libraryTemplate(kind, biomeArt(biome), 1, variant);
  } catch (e) {
    r.errors.push(`${biome}/${variant}${state ? '/' + state : ''}: ${String(e).slice(0, 120)}`);
    return;
  }
  r.ms = Math.max(r.ms, performance.now() - t0);
  let tris = 0;
  for (const g of t.layers.map((l) => l.geometry)) {
    tris += (g.index?.count ?? 0) / 3;
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (!Number.isFinite(v.x + v.y + v.z)) {
        r.nan++;
        continue;
      }
      r.minY = Math.min(r.minY, v.y);
      r.maxY = Math.max(r.maxY, v.y);
      r.minZ = Math.min(r.minZ, v.z);
      if (v.y < 1.8) r.low = Math.max(r.low, Math.abs(v.x), Math.abs(v.z));
    }
  }
  if (t.flame) tris += (t.flame.geometry.index?.count ?? 0) / 3;
  r.tris = Math.max(r.tris, Math.round(tris));
  r.calls = Math.max(r.calls, t.layers.length + (t.flame ? 1 : 0));
}

for (const kind of builtKinds()) {
  const def = propDef(kind);
  for (const b of BIOMES) {
    for (let i = 0; i < def.variants; i++) {
      measure(kind, b, i);
      if (STATES[kind]) measure(kind, b, i, STATES[kind]);
    }
  }
}

console.log(JSON.stringify({ missing, wallFace: WALL_FACE, rows: [...rows.values()] }));
