/**
 * Entry point for `tools/check-vfx.mjs`.
 *
 * Proves, without a browser, that every element school has its full set of
 * pictures and sounds (cast flare, wake, impact, floor mark with a cooling
 * glow, ribbon), that every active skill maps to a school, that the sprite
 * sheet is uploaded the right way up with every referenced cell inside it,
 * and that the effect library is pooled: a long fight grows no pool, adds no
 * meshes and keeps the draw calls it started with.
 */
import * as THREE from 'three';
import { ELEMENTS, SCHOOLS, RIBBON_PRESETS, EffectSystem, MAX_LIVE_EFFECTS } from '../src/fx/Effects';
import { FXSystem, emitterIds, emitterSprites, SPRITE_CELLS, spriteAtlasTexture } from '../src/fx/Particles';
import { DecalSystem, decalKinds, decalStyles } from '../src/fx/Decals';
import { BodyFX, LOOK, lookBitsOf, type StatusLook } from '../src/fx/BodyFX';
import { GROUND } from '../src/fx/kit/Ground';
import { RAMPS } from '../src/fx/kit/Palette';
import { FLIPBOOKS } from '../src/fx/kit/Atlas';
import { resolvesSound } from '../src/audio/Audio';
import { SKILLS } from '../src/data/skills';
import { particleFor, schoolOf } from '../src/scenes/SkillRunner';
import type { QualityProfile } from '../src/core/Renderer';
import { MOTIF_SHAPES, type MotifDraw } from '../src/fx/Motifs';

const fails: string[] = [];
const notes: Record<string, unknown> = {};
const check = (ok: boolean, msg: string): void => {
  if (!ok) fails.push(msg);
};

const emitters = new Set(emitterIds());
const decals = new Set(decalKinds());

// --- every school is complete ----------------------------------------------
for (const school of SCHOOLS) {
  const el = ELEMENTS[school];
  check(!!el, `school ${school} has no look`);
  if (!el) continue;
  check(!!RAMPS[school], `school ${school} has no colour ramp`);
  for (const [what, id] of [['impact', el.emitter], ['cast', el.castEmitter], ['wake', el.shedEmitter]] as const) {
    check(emitters.has(id), `${school}: ${what} emitter "${id}" does not exist`);
  }
  check(decals.has(el.decal), `${school}: mark "${el.decal}" is not a decal kind`);
  if (el.glowDecal) check(decals.has(el.glowDecal), `${school}: glow "${el.glowDecal}" is not a decal kind`);
  check(!!RIBBON_PRESETS[el.trail], `${school}: ribbon "${el.trail}" is not a preset`);
  for (const sfx of [el.sfxCast, el.sfxHit, `nova.${school}`, `beam.${school}`, `cone.${school}`, `impact.${school}`, `cast.${school}`]) {
    check(resolvesSound(sfx), `${school}: sound "${sfx}" resolves to nothing`);
  }
}
for (const hot of ['fire', 'cold', 'lightning', 'poison'] as const) {
  check(!!ELEMENTS[hot].glowDecal, `${hot} leaves no cooling glow over its mark`);
  const style = decalStyles()[ELEMENTS[hot].decal];
  check(!!style?.glow, `${hot}: its mark "${ELEMENTS[hot].decal}" lays no glow over itself`);
}
for (const key of ['emitter', 'castEmitter', 'shedEmitter', 'decal'] as const) {
  const seen = new Map<string, string>();
  for (const school of SCHOOLS) {
    const v = ELEMENTS[school][key];
    const prev = seen.get(v);
    check(!prev, `${school} and ${prev} share the same ${key} "${v}"`);
    seen.set(v, school);
  }
}
// Magic must be saturated: no school's body colour may be near grey (bone excepted).
for (const school of SCHOOLS) {
  if (school === 'bone' || school === 'physical') continue;
  const b = RAMPS[school].body;
  const r = (b >> 16) & 255, g = (b >> 8) & 255, bl = b & 255;
  check(Math.max(r, g, bl) - Math.min(r, g, bl) >= 120, `${school}: body colour #${b.toString(16)} is not saturated`);
}

// --- skill motifs fire real emitters and lay real marks -----------------------
// (a missing emitter silently falls back to a plain physical hit)
for (const [name, d] of Object.entries(MOTIF_SHAPES) as [string, MotifDraw][]) {
  if (d.k === 'puff') check(emitters.has(d.emitter), `motif "${name}": emitter "${d.emitter}" does not exist`);
  if (d.k === 'solid' && d.land) check(emitters.has(d.land), `motif "${name}": landing emitter "${d.land}" does not exist`);
  if (d.k === 'mark') check(decals.has(d.kind), `motif "${name}": mark "${d.kind}" is not a decal kind`);
}

// --- floor -------------------------------------------------------------------
for (const [kind, st] of Object.entries(decalStyles())) {
  check(st.kind in GROUND, `decal "${kind}" draws unknown ground kind "${st.kind}"`);
  if (st.glow) check(st.glow in GROUND, `decal "${kind}" glows with unknown ground kind "${st.glow}"`);
}

// --- skills ------------------------------------------------------------------
const bySchool: Record<string, number> = {};
let active = 0;
for (const s of SKILLS) {
  if (s.targeting === 'passive') continue;
  active++;
  const school = schoolOf(s);
  check(SCHOOLS.includes(school), `${s.id}: school "${school}" is not a known school`);
  bySchool[school] = (bySchool[school] ?? 0) + 1;
  const sig = particleFor(s.id, s.damageType ?? 'physical');
  check(emitters.has(sig.emitter), `${s.id}: signature emitter "${sig.emitter}" does not exist`);
  check(emitters.has(sig.trail), `${s.id}: signature wake "${sig.trail}" does not exist`);
}
notes.activeSkills = active;
notes.bySchool = bySchool;
check((bySchool.bone ?? 0) >= 3, `only ${bySchool.bone ?? 0} skills draw as bone`);

// --- sprite sheet ------------------------------------------------------------
{
  const sprite = spriteAtlasTexture();
  check(sprite.flipY === false, 'the sprite sheet is uploaded flipped: every particle samples the mirrored row');
  const bad = emitterSprites().filter((e) => {
    const span = FLIPBOOKS.has(e.sprite) ? 8 : e.variants;
    return e.sprite < 0 || e.sprite + span - 1 >= SPRITE_CELLS;
  });
  check(bad.length === 0, `emitters reference sprites outside the sheet: ${bad.map((b) => `${b.id}:${b.sprite}`).join(', ')}`);
  notes.spritesUsed = new Set(emitterSprites().map((e) => e.sprite)).size;
}

// --- pooling: a long fight grows nothing --------------------------------------
{
  const quality = { fxScale: 1 } as QualityProfile;
  const scene = new THREE.Scene();
  const fx = new FXSystem(scene, quality);
  const ground = new DecalSystem(scene, quality);
  const effects = new EffectSystem(scene, fx, ground, quality);
  const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 200);
  cam.position.set(0, 14, 10);
  cam.lookAt(0, 0, 0);
  const body = new THREE.Object3D();
  scene.add(body);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let hits = 0;
  const round = (i: number): void => {
    const s = SCHOOLS[i % SCHOOLS.length]!;
    a.set(Math.sin(i) * 3, 1.2, Math.cos(i) * 3);
    b.set(Math.cos(i) * 6, 1, Math.sin(i) * 6);
    effects.projectile(a, b, { element: s, onHit: () => hits++ });
    if (i % 3 === 0) effects.nova(a.x, a.z, 3, { element: s });
    if (i % 5 === 0) effects.explosion(b.x, 0.5, b.z, { element: s, radius: 2.5 });
    if (i % 7 === 0) effects.beam(a, b, { element: s, duration: 0.3 });
    if (i % 11 === 0) effects.chainLightning([a.clone(), b.clone(), new THREE.Vector3(0, 1, 0)]);
    if (i % 13 === 0) effects.cone(a, b.clone().sub(a), 0.5, 5, { element: s, duration: 0.5 });
    if (i % 17 === 0) effects.aura(body, { element: s }).stop();
    if (i % 19 === 0) effects.slam(b.x, b.z, 3, { windup: 0.2 });
    if (i % 23 === 0) effects.levelUp(0, 0, 0);
    if (i % 4 === 0) ground.telegraph('cone', a.x, a.z, 4, i, 0.4, 0xff4020);
    fx.burst(`hit.${s}`, a.x, 1, a.z);
    ground.add(ELEMENTS[s].decal, b.x, b.z, 1);
  };
  const frame = (t: number): void => {
    effects.update(1 / 60, t, cam);
    fx.update(1 / 60, t, cam);
    ground.update(1 / 60);
  };
  let t = 0;
  for (let i = 0; i < 300; i++) {
    if (i % 6 === 0) round(i / 6);
    frame((t += 1 / 60));
  }
  const children = scene.children.length;
  const pools = (effects as unknown as { free: unknown[]; live: unknown[] });
  const records = pools.free.length + pools.live.length;
  let peakLive = 0;
  for (let i = 0; i < 3600; i++) {
    if (i % 6 === 0) round(i / 6 + 50);
    frame((t += 1 / 60));
    peakLive = Math.max(peakLive, effects.liveCount);
  }
  for (let i = 0; i < 600; i++) frame((t += 1 / 60));
  const records2 = pools.free.length + pools.live.length;
  notes.pool = { records, records2, peakLive, hits, children, children2: scene.children.length, culled: effects.culled };
  check(scene.children.length === children, `the scene grew from ${children} to ${scene.children.length} objects during a long fight`);
  check(records2 <= Math.max(records, MAX_LIVE_EFFECTS + 32), `effect records grew from ${records} to ${records2}`);
  check(effects.liveCount === 0, `${effects.liveCount} effects still alive after the fight ended`);
  check(hits > 500, `only ${hits} projectiles reported landing`);
  // Every family is one draw call: count meshes that would draw.
  // Solids are one family: one hidden mesh per shape, and only shapes with
  // something flying draw, so they count once (the budget below lost the
  // five it used to spend on them).
  let meshes = 0;
  let solidShapes = 0;
  scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    if (o.name.startsWith('fx:solid-')) solidShapes++;
    else meshes++;
  });
  if (solidShapes) meshes++;
  notes.meshes = meshes;
  notes.solidShapes = solidShapes;
  check(meshes <= 12, `${meshes} fx meshes in the scene; the kit should stay near one per family`);

  // Bodies wearing every status look, swinging: nothing grows, all of it lets go.
  const bodies = new BodyFX(effects);
  const stand: THREE.Object3D[] = [];
  for (let i = 0; i < 16; i++) {
    const o = new THREE.Object3D();
    o.position.set((i % 4) * 2 - 3, 0, Math.floor(i / 4) * 2 - 3);
    scene.add(o);
    stand.push(o);
    for (const look of Object.keys(LOOK) as StatusLook[]) if ((i + look.length) % 3 === 0) bodies.labStatus(o, look);
  }
  const kids = scene.children.length;
  for (let i = 0; i < 1200; i++) {
    if (i % 20 === 0) bodies.labSwing(0, 0, SCHOOLS[i % 7]!, i);
    bodies.update(1 / 60, cam);
    frame((t += 1 / 60));
  }
  notes.bodies = { ...bodies.counts, shells: effects.shells.liveCount, cores: effects.cores.liveCount };
  check(scene.children.length === kids, `status looks grew the scene from ${kids} to ${scene.children.length}`);
  check(effects.shells.liveCount > 0 && effects.shells.liveCount <= 16, `${effects.shells.liveCount} status shells for 16 bodies`);
  for (const o of stand) scene.remove(o);
  bodies.update(1 / 60, cam);
  frame((t += 1 / 60));
  check(bodies.counts.bodies === 0, 'bodies taken out of the scene still wear their looks');
  check(effects.shells.liveCount === 0 && effects.cores.liveCount === 0, `looks left ${effects.shells.liveCount} shells and ${effects.cores.liveCount} cores behind`);
  for (const id of ['burning', 'chilled', 'frozen', 'shocked', 'poisoned', 'bleeding', 'stunned', 'cursed']) {
    check(lookBitsOf(id) !== 0, `status "${id}" has no look on a body`);
  }

  effects.dispose();
  fx.dispose();
  ground.dispose();
}

console.log(JSON.stringify({ ok: fails.length === 0, fails, notes }));
