/**
 * Entry point for `tools/check-uniques.mjs`: every unique is built soundly.
 * A real base, a design, a power that exists, mods that roll the right way
 * up, a skill bender that bends a real knob of its own class's skill, and
 * boss drops that name real bosses.
 */
import { UNIQUES } from '../src/data/uniques';
import { UNIQUE_DESIGNS } from '../src/art/items/Designs';
import { SIGNATURES } from '../src/data/uniqueBatches/index';
import { classOfSkill, getSkill } from '../src/data/skills';
import { getStatus } from '../src/data/statuses';
import { getPower } from '../src/sim/ItemPowers';
import { BOSSES } from '../src/data/bosses';
import { WARDENS } from '../src/data/wardens';
import { ITEM_BASES } from '../src/data/itemBases';

const bases = new Map(ITEM_BASES.map((b) => [b.id, b]));
const bossIds = new Set([...BOSSES, ...WARDENS].map((b) => b.id));
const problems: string[] = [];
const ids = new Set<string>();
let benders = 0;
let powers = 0;

for (const u of UNIQUES) {
  const where = `${u.id} (${u.name})`;
  if (ids.has(u.id)) problems.push(`${u.id}: id used twice`);
  ids.add(u.id);
  const base = bases.get(u.baseId);
  if (!base) problems.push(`${where}: base ${u.baseId} does not exist`);
  if (!UNIQUE_DESIGNS[u.id]) problems.push(`${where}: no design`);
  if (!(u.ilvl >= 1)) problems.push(`${where}: item level ${u.ilvl}`);
  if (!(u.weight > 0)) problems.push(`${where}: drop weight ${u.weight}`);
  if (!u.flavor?.trim()) problems.push(`${where}: no flavour line`);
  if (/[—–‘’“”]/.test(u.name + u.flavor + (u.hook ?? ''))) problems.push(`${where}: a dash or curly quote in its text`);
  if (u.mods.length === 0 && !u.special && !u.bend) problems.push(`${where}: does nothing`);
  for (const m of u.mods) if (m.min > m.max) problems.push(`${where}: ${m.stat} rolls ${m.min} to ${m.max}`);
  if (u.special) {
    powers++;
    if (!getPower(u.special)) problems.push(`${where}: power ${u.special} does not exist`);
  }
  if (u.chase && u.rarity === 'unique') problems.push(`${where}: a chase item must be a mythic or an ancient`);
  if (u.bend) {
    benders++;
    const s = getSkill(u.bend.skill);
    if (!s) { problems.push(`${where}: bends ${u.bend.skill}, which is not a skill`); continue; }
    const params = (s as { params?: Record<string, unknown> }).params ?? {};
    for (const k of [...Object.keys(u.bend.grow ?? {}), ...Object.keys(u.bend.add ?? {})]) {
      if (!(k in params)) problems.push(`${where}: ${u.bend.skill} has no knob "${k}" (it has ${Object.keys(params).join(', ') || 'none'})`);
    }
    if (u.bend.applies && !getStatus(u.bend.applies.status)) problems.push(`${where}: leaves status ${u.bend.applies.status}, which does not exist`);
    if (!u.classId) problems.push(`${where}: a skill bender must be class-only`);
    else if (classOfSkill(u.bend.skill) !== u.classId) problems.push(`${where}: rolls for ${u.classId} but bends a ${classOfSkill(u.bend.skill)} skill`);
  }
}

for (const [boss, list] of Object.entries(SIGNATURES)) {
  if (!bossIds.has(boss)) problems.push(`boss drops for ${boss}, which is not a boss`);
  for (const id of list) if (!ids.has(id)) problems.push(`${boss} drops ${id}, which is not a unique`);
}

console.log(JSON.stringify({ uniques: UNIQUES.length, benders, powers, bosses: Object.keys(SIGNATURES).length, problems }));
