/**
 * SLAY — what the Shapeshifter's skills sound like. Spread into `SKILL_SOUNDS`
 * (`audio/SkillSounds.ts`); the recordings are `tools/audio/shifter-takes.mjs`.
 * Every id is the skill's own: no Shapeshifter skill borrows another's sound.
 *
 * A blow has a hit sound where it lands; a buff, a howl or a roar is all in
 * its cast. Call the Pack's wolves bite with their own sound.
 */
import type { SkillSound } from './SkillSounds';

const s = (cast: string | null, hit: string | null = null, minion: string | null = null): SkillSound => ({ cast, hit, minion });
/** A skill with its cast and hit under `skill.shift.<id>`. */
const blow = (id: string): SkillSound => s(`skill.shift.${id}`, `skill.shift.${id}.hit`);
/** A skill that is all cast. */
const call = (id: string): SkillSound => s(`skill.shift.${id}`);

export const SHIFTER_SOUNDS: Readonly<Record<string, SkillSound>> = {
  // The forms
  catForm: call('catForm'),
  wolfForm: call('wolfForm'),
  bearForm: call('bearForm'),
  // Feral
  rake: blow('rake'),
  pounce: blow('pounce'),
  slink: call('slink'),
  hamstring: blow('hamstring'),
  throatTear: blow('throatTear'),
  killingDance: blow('killingDance'),
  nightHunt: call('nightHunt'),
  // Teeth
  snap: blow('snap'),
  huntingHowl: call('huntingHowl'),
  lunge: blow('lunge'),
  worry: blow('worry'),
  callThePack: s('skill.shift.callThePack', null, 'skill.shift.callThePack.bite'),
  bloodHowl: call('bloodHowl'),
  goForTheThroat: blow('goForTheThroat'),
  bloodmoon: call('bloodmoon'),
  // Claw
  maul: blow('maul'),
  rattlingRoar: call('rattlingRoar'),
  hammerfall: blow('hammerfall'),
  bristle: call('bristle'),
  overrun: blow('overrun'),
  reapingSwipe: blow('reapingSwipe'),
  bearHug: blow('bearHug'),
  ursaMajor: call('ursaMajor'),
};
