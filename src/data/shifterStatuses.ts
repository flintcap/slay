/**
 * SLAY — the Shapeshifter's own buffs and the one debuff only he puts on
 * monsters. Registered on import. Their stat numbers are filled in at cast
 * time from the skill's rank (`scenes/ShifterRunner.ts`), so the descriptions
 * here say what each one is, not how much.
 */
import { registerStatus, type StatusDef } from './statuses';
import { tr } from '../core/I18n';

function buff(id: string, name: string, color: number, icon: string, desc: string, o: Partial<StatusDef> = {}): StatusDef {
  return registerStatus({
    id,
    name,
    polarity: 1,
    maxStacks: 1,
    mods: {},
    color,
    icon,
    desc,
    tags: ['buff'],
    stacking: 'refresh',
    baseDuration: 8,
    ...o,
  });
}

/** Slink: low and quiet; the next Feral skill is an ambush. */
export const SLINK = buff('ss.slink', tr('Slinking'), 0x4a3a7a, 'ss-slink', tr('Low and quiet: faster, sharper, and the next Feral skill is an ambush.'));
/** Night Hunt. */
export const NIGHT_HUNT = buff('ss.nightHunt', tr('Night Hunt'), 0x3a2a6a, 'ss-nighthunt', tr('The dark runs with you: faster, deadlier, and Feral skills cost no mana.'));
/** Snap's stacks. The cap a hero can reach is set by Blood Frenzy; the handler holds it. */
export const PACK_FRENZY = buff('ss.packFrenzy', tr('Pack Frenzy'), 0xc08a3a, 'ss-snap', tr('Each stack: +4% attack speed and +4% damage.'), {
  maxStacks: 12,
  stacking: 'stack',
  mods: { attackSpeed: 4, enhancedDamage: 4 },
});
export const HUNTING_HOWL = buff('ss.huntingHowl', tr('Hunting Howl'), 0xd0a050, 'ss-huntinghowl', tr('The hunt is called: more damage and a surer bite.'));
export const BLOOD_HOWL = buff('ss.bloodHowl', tr('Blood Howl'), 0xa02020, 'ss-bloodhowl', tr('Every hit drinks.'));
/** Many Mouths: put on and kept while wolves of yours stand, its damage set by how many (`ShifterRunner.tickShiftPack`). */
export const MANY_MOUTHS = buff('ss.manyMouths', tr('Many Mouths'), 0x9a948a, 'ss-manymouths', tr('Your wolves stand with you: you and they deal more damage for each one.'), { baseDuration: 1.2 });
export const BLOODMOON = buff('ss.bloodmoon', tr('Bloodmoon'), 0xc01818, 'ss-bloodmoon', tr('Pack Frenzy held full, more damage, and every hit drinks deep.'));
export const BRISTLE = buff('ss.bristle', tr('Bristling'), 0x8a5a2e, 'ss-bristle', tr('Spines up: less damage taken, and melee attackers bleed for it.'), { reflect: 0.3 });
export const URSA_MAJOR = buff('ss.ursaMajor', tr('Ursa Major'), 0xd0a060, 'ss-ursamajor', tr('The great bear of the old stories: bigger, harder, wider swipes.'));

/** Rattling Roar's debuff on monsters: they hit softer. */
export const RATTLED = registerStatus({
  id: 'ss.rattled',
  name: tr('Rattled'),
  polarity: -1,
  maxStacks: 1,
  mods: { enhancedDamage: -20 },
  color: 0x8a6a4a,
  icon: 'ss-roar',
  desc: tr('Shaken by a bear\'s roar: deals less damage.'),
  tags: ['curse'],
  stacking: 'strongest',
  baseDuration: 5,
});
