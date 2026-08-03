/**
 * Entry point for `tools/check-starter.mjs`.
 *
 * The Revenant was handed a Bone Wand, which is a level 10 item, so the class
 * spent its first nine levels unable to equip its own starting weapon. Starting
 * gear has to be usable at level 1 by definition; this proves it for every
 * class, against level, strength and dexterity requirements alike.
 */
import { CLASSES } from '../src/data/classes';
import { findBase } from '../src/data/itemBases';
import { createCharacter } from '../src/sim/Character';
import { computeStats } from '../src/sim/Stats';
import { streamFor } from '../src/core/RNG';

interface Row {
  cls: string;
  baseId: string;
  name: string;
  levelReq: number;
  strReq: number;
  dexReq: number;
  str: number;
  dex: number;
  ok: boolean;
  why: string;
}

const rows: Row[] = [];

for (const def of CLASSES) {
  const c = createCharacter(`T${def.id}`, def.id, streamFor(11, `start:${def.id}`));
  const stats = computeStats(c);
  for (const baseId of def.startingGear) {
    const base = findBase(baseId);
    if (!base) {
      rows.push({
        cls: def.id, baseId, name: '(missing)', levelReq: 0, strReq: 0, dexReq: 0,
        str: stats.strength, dex: stats.dexterity, ok: false, why: 'base id does not exist',
      });
      continue;
    }
    const levelReq = base.levelReq ?? 1;
    const strReq = base.strReq ?? 0;
    const dexReq = base.dexReq ?? 0;
    const fails: string[] = [];
    if (levelReq > 1) fails.push(`level ${levelReq}`);
    if (strReq > stats.strength) fails.push(`strength ${strReq} > ${stats.strength}`);
    if (dexReq > stats.dexterity) fails.push(`dexterity ${dexReq} > ${stats.dexterity}`);
    rows.push({
      cls: def.id,
      baseId,
      name: base.name,
      levelReq,
      strReq,
      dexReq,
      str: stats.strength,
      dex: stats.dexterity,
      ok: fails.length === 0,
      why: fails.join(', '),
    });
  }
}

console.log(JSON.stringify({ rows }));
