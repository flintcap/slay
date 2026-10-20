/**
 * Entry point for `tools/build-meshes.mjs`: meshes, in Node, every body a
 * first launch would otherwise mesh in the page (the select-screen heroes,
 * each class as a new character, the shapeshifter's beasts and the
 * townsfolk), through the same code and the same cache keys, and prints
 * them as one JSON line of base64 arrays for the tool to pack.
 */
import './dom-stub';
import { MESH_VERSION, onMeshed, type RawGeo } from '../src/art/hero/MeshCache';
import { buildClassHero, buildCharacterHero } from '../src/scenes/HeroModel';
import { buildFolk, NPC_LOOK_IDS } from '../src/art/npc/Folk';
import { buildHero } from '../src/art/hero/Hero';
import { HERO_LOOKS } from '../src/art/hero/Looks';
import { BEAST_FORMS, meshBeast } from '../src/art/hero/forms/BeastBody';
import { CLASSES } from '../src/data/classes';
import { createCharacter } from '../src/sim/Character';
import { Random } from '../src/core/RNG';

const parts = new Map<string, RawGeo>();
onMeshed((key, raw) => parts.set(key, raw));

/** The jobs the town prewarm hands its workers (art/npc/Prewarm.ts): shipped ones are skipped there. */
const jobs: string[] = [];
const times: Record<string, number> = {};
const run = (id: string, fn: () => void): void => {
  const t0 = performance.now();
  fn();
  times[id] = Math.round(performance.now() - t0);
};

for (const c of CLASSES) {
  run(`hero:${c.id}`, () => buildClassHero(c.id).dispose());
  jobs.push(`hero:${c.id}`);
  // A new character wears only its starting weapons: the bare body's clothes.
  run(`new:${c.id}`, () => buildCharacterHero(createCharacter(c.id, c.id, new Random(1))).dispose());
}
const shifter = buildHero(HERO_LOOKS.shapeshifter, 'shapeshifter');
for (const f of BEAST_FORMS) run(`beast:${f}`, () => meshBeast(f, shifter.rig.shape));
for (const id of NPC_LOOK_IDS) {
  run(id, () => buildFolk(id));
  jobs.push(id);
}

declare const Buffer: { from(b: ArrayBufferLike, offset: number, length: number): { toString(enc: 'base64'): string } };
const b64 = (a: ArrayBufferView): string => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const type = (a: ArrayBufferView): string => a.constructor.name;
const out = [...parts].map(([key, raw]) => ({
  key,
  attrs: Object.entries(raw.attrs).map(([name, a]) => ({ name, itemSize: a.itemSize, type: type(a.array), data: b64(a.array) })),
  index: { type: type(raw.index), data: b64(raw.index) },
}));
console.log(JSON.stringify({ version: MESH_VERSION, jobs, times, parts: out }));
