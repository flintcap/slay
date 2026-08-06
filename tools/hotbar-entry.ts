/**
 * Entry point for `tools/check-hotbar.mjs`.
 *
 * Reported three times: the right-click skill reappears on the hotbar on every
 * reload. Two separate places had to agree and only one did — `repairCharacter`
 * stripped it, then its own auto-fill block put it straight back. This runs the
 * real repair against characters in every shape it can be handed and asserts the
 * two never overlap.
 */
import { createCharacter, repairCharacter, setPrimaryAttack, setHotbarSlot } from '../src/sim/Character';
import { streamFor } from '../src/core/RNG';

const makeCharacter = (classId: string, name: string): ReturnType<typeof createCharacter> =>
  createCharacter(name, classId as never, streamFor(7, `hb:${classId}`));
import { CLASSES } from '../src/data/classes';
import { SKILLS } from '../src/data/skills';

interface Row {
  cls: string;
  scenario: string;
  primary: string | null;
  hotbar: Array<string | null>;
  overlap: boolean;
}

const rows: Row[] = [];

for (const def of CLASSES) {
  const actives = SKILLS.filter((s) => def.trees.includes(s.treeId) && s.targeting !== 'passive');

  // 0. A brand new character, untouched.
  //
  // This case was missing, and it is the one the player meets: reported as
  // "new character and still putting the first skill in the hotbar when its
  // RMB". Every other scenario here calls `repairCharacter` first, which
  // strips the duplicate — so the suite passed while the character-creation
  // code wrote both fields by hand and shipped the bug to the first screen
  // anyone sees. Repair does not run on a character that was just created.
  {
    const c = makeCharacter(def.id, `T${def.id}`);
    rows.push({
      cls: def.id,
      scenario: 'brand new, no repair',
      primary: c.primaryAttack ?? null,
      hotbar: [...c.hotbar],
      overlap: !!c.primaryAttack && c.hotbar.includes(c.primaryAttack),
    });
  }

  // 1. A fresh character, repaired the way loading does.
  {
    const c = makeCharacter(def.id, `T${def.id}`);
    repairCharacter(c);
    rows.push({
      cls: def.id,
      scenario: 'fresh + repair',
      primary: c.primaryAttack ?? null,
      hotbar: [...c.hotbar],
      overlap: !!c.primaryAttack && c.hotbar.includes(c.primaryAttack),
    });
  }

  // 2. Several skills ranked, one bound to right click, then repaired — which
  //    is exactly what a reload does to a played character.
  {
    const c = makeCharacter(def.id, `T${def.id}`);
    for (const s of actives.slice(0, 5)) c.skills[s.id] = 3;
    const pick = actives[0]?.id ?? null;
    if (pick) setPrimaryAttack(c, pick);
    repairCharacter(c);
    rows.push({
      cls: def.id,
      scenario: 'ranked + right click + repair',
      primary: c.primaryAttack ?? null,
      hotbar: [...c.hotbar],
      overlap: !!c.primaryAttack && c.hotbar.includes(c.primaryAttack),
    });
  }

  // 3. Repeated reloads must not drift.
  {
    const c = makeCharacter(def.id, `T${def.id}`);
    for (const s of actives.slice(0, 5)) c.skills[s.id] = 3;
    const pick = actives[1]?.id ?? actives[0]?.id ?? null;
    if (pick) setPrimaryAttack(c, pick);
    for (let i = 0; i < 5; i++) repairCharacter(c);
    rows.push({
      cls: def.id,
      scenario: 'five reloads',
      primary: c.primaryAttack ?? null,
      hotbar: [...c.hotbar],
      overlap: !!c.primaryAttack && c.hotbar.includes(c.primaryAttack),
    });
  }

  // 4. Binding to the bar must be refused while the skill is on right click.
  {
    const c = makeCharacter(def.id, `T${def.id}`);
    for (const s of actives.slice(0, 5)) c.skills[s.id] = 3;
    const pick = actives[0]?.id ?? null;
    let refused = true;
    if (pick) {
      setPrimaryAttack(c, pick);
      refused = setHotbarSlot(c, 3, pick) === false;
    }
    rows.push({
      cls: def.id,
      scenario: 'bar bind refused while on right click',
      primary: c.primaryAttack ?? null,
      hotbar: [...c.hotbar],
      overlap: !refused || (!!c.primaryAttack && c.hotbar.includes(c.primaryAttack)),
    });
  }
}

console.log(JSON.stringify({ rows }));
