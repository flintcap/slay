/**
 * Entry point for `tools/check-audio.mjs`.
 *
 * Proves nothing the game asks for is silent: every biome and boss track is a
 * real track, every place has an ambience bed whose floor makes a footstep,
 * every monster ability phase resolves to a sound, and every swing and
 * weapon impact exists. Also: every bed's loops and events have recordings,
 * every place has its own music, and every file the manifest names exists
 * on disk with a row in ASSETS.md.
 */
import { resolvesSound } from '../src/audio/Audio';
import { hasTrack, musicTracks } from '../src/audio/Score';
import { bedDef, bedFor, bedIds } from '../src/audio/Beds';
import { bankIds, soundFiles } from '../src/audio/Bank';
import { AMBIENCE_FILES, MUSIC_FILES } from '../src/audio/manifest';
import { monsterSoundFor, TELEGRAPH_MIN } from '../src/audio/MonsterAudio';
import { BIOMES } from '../src/world/DungeonGen';
import { BOSSES } from '../src/data/bosses';
import { MONSTERS } from '../src/data/monsters';
import { getAbility } from '../src/entities/Abilities';

const fails: string[] = [];
const notes: Record<string, unknown> = {};
const check = (ok: boolean, msg: string): void => {
  if (!ok) fails.push(msg);
};

// --- music -------------------------------------------------------------------
for (const b of BIOMES) {
  check(hasTrack(b.music), `biome ${b.id} plays "${b.music}", which is not a track`);
  check(bedFor(b.music) !== null, `biome ${b.id}'s track "${b.music}" brings no ambience bed`);
}
for (const b of BOSSES) {
  check(hasTrack(b.music), `boss ${b.id} asks for "${b.music}", which is not a track (it would play the crypt dirge)`);
}
for (const t of ['menu', 'town', 'death', 'victory', 'boss', 'title', 'charSelect']) {
  check(hasTrack(t), `scene track "${t}" missing`);
}

// --- ambience and footsteps ---------------------------------------------------
for (const id of bedIds()) {
  const d = bedDef(id)!;
  check(resolvesSound(`footstep.${d.surface}`), `bed ${id}: footstep.${d.surface} is silent`);
}
check(bedFor('town') === 'town', 'town has no ambience');
for (const id of bedIds()) {
  const d = bedDef(id)!;
  for (const loop of d.loops) check((AMBIENCE_FILES[loop] ?? []).length > 0, `bed ${id}: loop "${loop}" has no recording`);
  for (const e of d.events) check(resolvesSound(e), `bed ${id}: event "${e}" is silent`);
  check(hasTrack(id), `place ${id} has no music of its own`);
}
for (const b of BIOMES) check(bedFor(b.id) !== null && hasTrack(b.id), `biome id ${b.id} does not fold onto a place with music and a bed`);
check(bedFor('menu') === null, 'menus should be free of ambience');

// --- player weapons -------------------------------------------------------------
for (const w of ['blade', 'axe', 'blunt', 'pierce', 'fist']) {
  check(resolvesSound(`swing.${w}`), `swing.${w} is silent`);
}
for (const id of ['swing.heavy', 'hit.sword', 'hit.axe', 'hit.blunt', 'hit.pierce', 'hit.fist', 'ui.click', 'ui.hover', 'ui.tab', 'ui.open', 'ui.close', 'ui.equip', 'ui.error']) {
  check(resolvesSound(id), `${id} is silent`);
}

// --- monsters --------------------------------------------------------------------
let phases = 0;
let voiced = 0;
let telegraphs = 0;
let named = 0;
const missingSfx = new Set<string>();
const seen = new Set<string>();
for (const m of MONSTERS) {
  for (const id of m.abilities) {
    const a = getAbility(id);
    if (!a || seen.has(`${m.family}:${id}`)) continue;
    seen.add(`${m.family}:${id}`);
    if (a.sfx) {
      named++;
      if (!resolvesSound(a.sfx)) missingSfx.add(a.sfx);
    }
    const ids = [...monsterSoundFor(a, 'windup', m.family), ...monsterSoundFor(a, 'active', m.family)];
    phases++;
    if (ids.length > 0 || a.sfx) voiced++;
    if (a.windup >= TELEGRAPH_MIN && !a.sfx && ids.includes('telegraph')) telegraphs++;
    for (const s of ids) {
      if (s === 'telegraph') continue;
      check(resolvesSound(s), `monster ${m.id} ability ${id}: "${s}" is silent`);
    }
  }
}
check(missingSfx.size === 0, `abilities name sounds that do not exist: ${[...missingSfx].join(', ')}`);
check(resolvesSound('telegraph') && resolvesSound('telegraph.long'), 'telegraph sounds missing');
notes.abilities = phases;
notes.voiced = voiced;
notes.telegraphs = telegraphs;
notes.namedSfx = named;
check(voiced / Math.max(1, phases) > 0.8, `only ${voiced} of ${phases} monster abilities make any sound`);

// --- files -----------------------------------------------------------------------
// (check-audio.mjs checks each one is on disk and in ASSETS.md.)
const allFiles = [
  ...bankIds().flatMap((id) => soundFiles(id)),
  ...Object.values(MUSIC_FILES).flat(),
  ...Object.values(AMBIENCE_FILES).flat(),
];
for (const id of ['boss.intro', 'loot.legendary', 'drop.unique', 'levelup', 'quest.complete', 'portal', 'waypoint', 'player.death', 'player.hurt', 'block', 'crit']) {
  check(resolvesSound(id), `${id} is silent`);
}
for (const fam of ['undead', 'demon', 'beast', 'construct', 'insect', 'aberration', 'elemental', 'humanoid', 'plant', 'ooze']) {
  for (const k of ['aggro', 'attack', 'hurt', 'death']) check(bankIds().includes(`monster.${fam}.${k}`), `monster.${fam}.${k} has no recordings of its own`);
}
for (const el of ['physical', 'fire', 'cold', 'lightning', 'poison', 'arcane']) {
  for (const k of ['cast', 'impact', 'nova']) check(resolvesSound(`${k}.${el}`), `${k}.${el} is silent`);
}
for (const f of ['stone', 'dirt', 'grass', 'sand', 'snow', 'water']) check(bankIds().includes(`footstep.${f}`), `footstep.${f} has no recordings`);
notes.soundIds = bankIds().length;
notes.files = allFiles;
notes.tracks = musicTracks().length;

console.log(JSON.stringify({ ok: fails.length === 0, fails: [...new Set(fails)].slice(0, 40), notes }));
