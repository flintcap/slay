/**
 * SLAY — the prop library: kind + biome art + variant → a cached template
 * the dungeon builder instances (`PropTemplate`).
 *
 * Every template is built from its own seeded stream (`streamFor` keyed by
 * kind, biome, light colour and variant), so a prop looks the same on every
 * level and in every run, and building one never disturbs any other stream.
 */
import * as THREE from 'three';
import type { BiomeArt } from '../../world/Biomes';
import { hash2 } from '../Noise';
import { hashString, streamFor } from '../../core/RNG';
import { PropKit } from './Kit';
import { makeCtx, type Builder } from './Ctx';
import { propDef, type PropLightSpec } from './Defs';
import { disposePropMats } from './PropMats';
import { LIGHTS } from './Lights';
import { STONE } from './Stone';

export interface PropLayer {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Additive/transparent layers are drawn without shadows and after opaques. */
  ghost?: boolean;
}

export interface PropTemplate {
  kind: string;
  variant: number;
  layers: PropLayer[];
  light: PropLightSpec | null;
  /** Emissive core geometry, instanced separately so bloom catches it and the builder can flicker it. */
  flame: { geometry: THREE.BufferGeometry; material: THREE.Material; y: number; forward: number } | null;
  radius: number;
  blocks: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
}

/** Builder families, by file (sheets and checkers use the names). */
export const KIND_GROUPS: Record<string, string[]> = {
  lights: Object.keys(LIGHTS),
  stone: Object.keys(STONE),
};

const BUILDERS: Record<string, Builder> = {
  ...LIGHTS,
  ...STONE,
};

/** True when the new library can build this kind. */
export function hasBuilder(kind: string): boolean {
  return Object.prototype.hasOwnProperty.call(BUILDERS, kind);
}

/** Every kind the library builds (checkers). */
export function builtKinds(): string[] {
  return Object.keys(BUILDERS);
}

const cache = new Map<string, PropTemplate>();

/**
 * Cached template for a prop kind. `seed` is accepted for the builder's
 * signature but not used: a prop's look belongs to its biome, not its level.
 */
export function libraryTemplate(kind: string, art: BiomeArt, _seed: number, variant: number): PropTemplate {
  const key = `${kind}|${art.id}|${art.lightColor}|${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = propDef(kind);
  const build = BUILDERS[kind] ?? BUILDERS[def.kind];
  if (!build) throw new Error(`no prop builder for ${kind}`);
  const rng = streamFor(hashString(key), 'prop');
  const k = new PropKit(rng);
  build(k, makeCtx(art, rng, variant));
  const out = k.done();
  const light = def.light ? { ...def.light, color: def.light.mood ? art.lightColor : def.light.color } : null;
  const tmpl: PropTemplate = {
    kind,
    variant,
    layers: out.layers,
    light,
    flame: out.flame,
    radius: def.radius,
    blocks: def.blocks,
    castShadow: def.castShadow,
    receiveShadow: def.receiveShadow,
  };
  cache.set(key, tmpl);
  return tmpl;
}

/** Deterministic variant index for a placement, so no extra data is stored. */
export function variantFor(kind: string, x: number, y: number): number {
  const n = Math.max(1, propDef(kind).variants);
  return Math.floor(hash2(x * 31 + 7, y * 17 + 3) * n) % n;
}

/** Deterministic scale jitter for a placement. */
export function scaleFor(kind: string, x: number, y: number): number {
  const j = propDef(kind).scaleJitter;
  if (j <= 0) return 1;
  return 1 + (hash2(x * 13 + 91, y * 57 + 5) * 2 - 1) * j;
}

/** Frees every template geometry and every prop material. */
export function disposeLibrary(): void {
  for (const t of cache.values()) {
    for (const l of t.layers) l.geometry.dispose();
    t.flame?.geometry.dispose();
  }
  cache.clear();
  disposePropMats();
}
