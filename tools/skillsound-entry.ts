/**
 * Entry point for `tools/check-skillsound.mjs`.
 *
 * Proves every skill sounds like one thing: each active skill has a row in
 * `audio/SkillSounds.ts`, and each stage it plays (cast, hit, minion) names a
 * `skill.*` id with exactly one recording, no alias, no fallback and no extra
 * layer. A stage the skill's effect family never plays must be empty, so the
 * table cannot promise a sound the game does not make.
 */
import { SKILLS } from '../src/data/skills';
import { SKILL_SOUNDS } from '../src/audio/SkillSounds';
import { resolveSound, soundDef, soundFiles } from '../src/audio/Bank';
import { SAMPLE_COUNTS } from '../src/audio/manifest';

const fails: string[] = [];
const notes: Record<string, unknown> = {};
const check = (ok: boolean, msg: string): void => {
  if (!ok) fails.push(msg);
};

// The effect families `SkillRunner.cast` handles. Anything else takes its
// default branch, which swings or shoots and so has a landing sound.
const FAMILIES = new Set([
  'melee', 'cleave', 'whirlwind', 'projectile', 'bolt', 'nova', 'slam', 'meteor', 'beam', 'cone', 'chain',
  'dash', 'heal', 'buff', 'aura', 'stance', 'shout', 'banner', 'self', 'absorb', 'ground', 'trap', 'ward',
  'summon', 'minion', 'curse', 'debuff', 'apply', 'channel', 'sky', 'wave', 'leap', 'teleport',
  'detonate', 'corpse', 'point', 'aoe', 'capstone',
  'rite', 'vigil',
]);
// Families whose cast plays the skill's hit sound where it lands.
const HITS = new Set(['melee', 'cleave', 'whirlwind', 'projectile', 'bolt', 'slam', 'meteor', 'cone', 'chain', 'dash', 'sky', 'teleport', 'rite', 'vigil', 'default']);
// Families that raise something that fights, and so need a minion sound.
const RAISES = new Set(['summon', 'minion']);

const familyOf = (effect: string | undefined): string => {
  const f = (effect ?? 'melee').split('.')[0] ?? 'melee';
  return FAMILIES.has(f) ? f : 'default';
};

const byId = new Map(SKILLS.map((s) => [s.id, s]));
// Only active skills: their packets' ability name is what marks a blow as a
// skill's (see SKILL_NAMES in SkillRunner).
const names = new Map<string, string>();
for (const s of SKILLS) {
  if (s.targeting === 'passive') continue;
  check(!names.has(s.name), `skills ${names.get(s.name)} and ${s.id} share the name "${s.name}"`);
  names.set(s.name, s.id);
}
// A packet's ability name marks it as a skill's (no weapon layer); these are
// not skills and must keep theirs.
for (const n of ['Attack', 'Riposte', 'Rebirth', 'Phantom Blade', 'Arc', 'Superconductor']) {
  check(!names.has(n), `skill ${names.get(n)} is named "${n}", which is also a non-skill hit`);
}

const stageOk = (skill: string, stage: string, id: string): void => {
  check(id.startsWith('skill.'), `${skill} ${stage} plays "${id}", not a skill.* sound`);
  check((SAMPLE_COUNTS[id] ?? 0) === 1, `${skill} ${stage} "${id}" has ${SAMPLE_COUNTS[id] ?? 0} recordings, not exactly 1`);
  check(resolveSound(id) === id, `${skill} ${stage} "${id}" resolves to ${resolveSound(id)}`);
  check(soundDef(id).with.length === 0, `${skill} ${stage} "${id}" layers other sounds on top`);
  check(soundFiles(id).length === 1, `${skill} ${stage} "${id}" has ${soundFiles(id).length} files`);
};

const rows: Array<{ id: string; name: string; family: string; cast: string | null; hit: string | null; minion: string | null }> = [];
const quick: string[] = [];
let active = 0;
for (const s of SKILLS) {
  const row = SKILL_SOUNDS[s.id];
  const family = familyOf(s.effect);
  if (s.targeting === 'passive') {
    if (row) check(row.cast === null && row.hit === null, `passive ${s.id} has a cast or hit sound it can never play`);
    continue;
  }
  active++;
  if (!row) {
    fails.push(`active skill ${s.id} (${s.name}) has no row in SkillSounds.ts`);
    continue;
  }
  check(row.cast !== null, `${s.id} makes no sound when cast`);
  if (row.hit !== null) check(HITS.has(family), `${s.id} has a hit sound, but its family "${family}" never plays one`);
  // A Shapeshifter skill that raises a pack (`ShifterRunner.SHIFTER_MINIONS`) needs one too.
  if (RAISES.has(family) || s.effect === 'shift.callThePack') check(row.minion !== null, `${s.id} raises a ${family} with no minion sound`);
  else check(row.minion === null, `${s.id} has a minion sound, but its family "${family}" raises nothing`);
  if (family === 'teleport' && row.cast) quick.push(row.cast);
  rows.push({ id: s.id, name: s.name, family, ...row });
}
for (const [id, row] of Object.entries(SKILL_SOUNDS)) {
  check(byId.has(id), `SkillSounds.ts has a row for "${id}", which is not a skill`);
  if (row.cast) stageOk(id, 'cast', row.cast);
  if (row.hit) stageOk(id, 'hit', row.hit);
  if (row.minion) stageOk(id, 'minion', row.minion);
}
// The Sworn Brother passive raises a fighter with the banner.
check(SKILL_SOUNDS.swornBrother?.minion != null, 'swornBrother has no minion sound');

notes.active = active;
notes.rows = rows.length;
notes.ids = new Set(Object.values(SKILL_SOUNDS).flatMap((r) => [r.cast, r.hit, r.minion]).filter(Boolean)).size;
notes.quick = [...new Set(quick)];
notes.files = [...new Set(quick)].flatMap((id) => soundFiles(id));
notes.table = rows;

console.log(JSON.stringify({ ok: fails.length === 0, fails: [...new Set(fails)].slice(0, 60), notes }));
