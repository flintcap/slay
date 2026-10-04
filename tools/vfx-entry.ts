/**
 * Entry point for `tools/check-vfx.mjs`.
 *
 * Proves, without a browser, that every element school has a full set of
 * pictures and sounds — a cast flare, a wake, an impact, a lingering mark and
 * its cooling glow, a ribbon trail — that every one of those ids resolves, that
 * every active skill maps to a school, and that both texture atlases are
 * uploaded the right way up with every referenced cell inside the sheet.
 */
import { ELEMENTS, SCHOOLS } from '../src/fx/Effects';
import { emitterIds, emitterSprites, SPRITE_CELLS, spriteAtlasTexture } from '../src/fx/Particles';
import { decalAtlasTexture, decalKinds, stainCells, STAIN_CELLS } from '../src/fx/Decals';
import { TRAIL_PRESETS } from '../src/fx/Trails';
import { resolvesSound } from '../src/audio/Audio';
import { SKILLS } from '../src/data/skills';
import { particleFor, schoolOf } from '../src/scenes/SkillRunner';

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
  for (const [what, id] of [['impact', el.emitter], ['cast', el.castEmitter], ['wake', el.shedEmitter]] as const) {
    check(emitters.has(id), `${school}: ${what} emitter "${id}" does not exist`);
  }
  check(decals.has(el.decal), `${school}: mark "${el.decal}" is not a decal kind`);
  if (el.glowDecal) check(decals.has(el.glowDecal), `${school}: glow "${el.glowDecal}" is not a decal kind`);
  check(!!TRAIL_PRESETS[el.trail], `${school}: ribbon trail "${el.trail}" is not a preset`);
  for (const sfx of [el.sfxCast, el.sfxHit, `nova.${school}`, `beam.${school}`, `cone.${school}`, `impact.${school}`, `cast.${school}`]) {
    check(resolvesSound(sfx), `${school}: sound "${sfx}" resolves to nothing`);
  }
}
// The hot schools must leave a mark that cools.
for (const hot of ['fire', 'cold', 'lightning', 'poison'] as const) {
  check(!!ELEMENTS[hot].glowDecal, `${hot} leaves no cooling glow over its mark`);
}
// No two schools may share an impact, cast or mark: each must read as itself.
for (const key of ['emitter', 'castEmitter', 'shedEmitter', 'decal'] as const) {
  const seen = new Map<string, string>();
  for (const school of SCHOOLS) {
    const v = ELEMENTS[school][key];
    const prev = seen.get(v);
    check(!prev, `${school} and ${prev} share the same ${key} "${v}"`);
    seen.set(v, school);
  }
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

// --- atlases ---------------------------------------------------------------
{
  const sprite = spriteAtlasTexture();
  check(sprite.flipY === false, 'the particle sprite sheet is uploaded flipped: every particle samples the mirrored row');
  const decal = decalAtlasTexture();
  check(decal.flipY === false, 'the decal sheet is uploaded flipped: every stain samples the mirrored row');
  const badSprites = emitterSprites().filter((e) => e.sprite < 0 || e.sprite >= SPRITE_CELLS);
  check(badSprites.length === 0, `emitters reference sprites outside the sheet: ${badSprites.map((b) => `${b.id}:${b.sprite}`).join(', ')}`);
  const cells = stainCells();
  const badCells = Object.entries(cells).filter(([, c]) => c < 0 || c >= STAIN_CELLS);
  check(badCells.length === 0, `stains reference cells outside the sheet: ${badCells.map(([k]) => k).join(', ')}`);
  notes.spritesUsed = new Set(emitterSprites().map((e) => e.sprite)).size;
}

console.log(JSON.stringify({ ok: fails.length === 0, fails, notes }));
