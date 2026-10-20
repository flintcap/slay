/**
 * SLAY — the Ranger's three trees. Spread into `../skills.ts`.
 *
 *  - Marksman  one arrow, placed: pierce, the critical hit, the first shot.
 *  - Wildcraft traps, snares and footwork: the floor works for you.
 *  - Volley    arrows in quantity: spreads, rains, and shots that keep going.
 *
 * Every bow skill is an attack, timed in shots of the bow in hand
 * (`attackTime`, `sim/Speed.ts`); traps, buffs and the kestrel are spells on
 * cast speed (`castTime`). Damage per hit is the ladder alone: speed never
 * changes it.
 */
import { build, dim, per, syn, type SynergyLink } from './kit';
import { tr } from '../../core/I18n';

const MARKSMAN = build('marksman', [
  {
    id: 'pierceShot', name: tr('Pierce Shot'),
    desc: tr('A shot placed through the whole rank. Passes through every enemy in a line.'),
    tier: 1, col: 0, icon: 'arrow', t: 'direction', mana: [3, 0.35], dmg: [1.15, 0.14],
    type: 'physical', fx: 'projectile', p: { pierce: 99, speed: 34, range: 22 },
  },
  {
    id: 'steadyHand', name: tr('Steady Hand'),
    desc: tr('Breath control. +14 attack rating per rank, and +2.6% critical chance per rank with diminishing returns toward 26%.'),
    tier: 1, col: 1, icon: 'eye',
    stat: { attackRating: per(14), critChance: dim(26, 0.1) },
  },
  {
    id: 'huntersMark', name: tr("Hunter's Mark"),
    desc: tr('Name the target. It takes 12% more damage from you for 12s (+1.5% per rank).'),
    tier: 1, col: 2, icon: 'target', t: 'enemy', mana: [5, 0.4], cd: [10, 0.3, 4],
    fx: 'bolt', p: { duration: 12, amp: 12, ampPerRank: 1.5 },
    timing: 'spell', castTime: 0.35,
  },
  {
    id: 'aimedShot', name: tr('Aimed Shot'),
    desc: tr('Draw fully. Slow, single target, and it always crits below half health.'),
    tier: 2, col: 0, icon: 'crosshair', req: ['pierceShot'], t: 'enemy',
    mana: [7, 0.5], cd: [4, 0.12, 1.4], dmg: [3.0, 0.36], type: 'physical',
    fx: 'projectile', p: { speed: 40, executeBelow: 50 },
    attackTime: 1.4,
  },
  {
    id: 'bleedingArrow', name: tr('Bleeding Arrow'),
    desc: tr('A barbed head that will not come out. Applies a bleed for 6s.'),
    tier: 2, col: 1, icon: 'blood', req: ['steadyHand'], t: 'enemy',
    mana: [6, 0.45], cd: [6, 0.2, 2], dmg: [1.1, 0.12], type: 'physical',
    fx: 'projectile', p: { duration: 6 },
  },
  {
    id: 'longEye', name: tr('Long Eye'),
    desc: tr('Damage rises with range. +2% damage per metre past 6, up to +30% (+3% cap per rank).'),
    tier: 2, col: 2, icon: 'range', req: ['huntersMark'],
    stat: { enhancedDamage: dim(30, 0.11) },
  },
  {
    id: 'punchThrough', name: tr('Punch Through'),
    desc: tr('Arrows lose nothing on the way through. +3.6% damage per rank, with diminishing returns toward 40%.'),
    tier: 3, col: 0, icon: 'pierce', req: ['aimedShot'],
    stat: { enhancedDamage: dim(40, 0.09) },
  },
  {
    id: 'crippling', name: tr('Crippling Shot'),
    desc: tr('Take the leg. Crippled for 4s: 35% slower (+3% per rank) and easier to hit.'),
    tier: 3, col: 1, icon: 'snare', req: ['bleedingArrow'], t: 'enemy',
    mana: [8, 0.5], cd: [9, 0.25, 3.5], dmg: [1.5, 0.2], type: 'physical',
    fx: 'projectile', p: { slow: 35, slowPerRank: 3, speed: 32, cripple: 4 },
  },
  {
    id: 'coldFocus', name: tr('Cold Focus'),
    desc: tr('Nothing hurries you. +6% critical damage per rank, and +1.9% attack speed per rank with diminishing returns toward 24%.'),
    tier: 3, col: 2, icon: 'crit', req: ['longEye'],
    stat: { critDamage: per(6), attackSpeed: dim(24, 0.08) },
  },
  {
    id: 'headshot', name: tr('Headshot'),
    desc: tr('Aim for the eye. +1% critical chance and +8% critical damage per rank.'),
    tier: 4, col: 1, icon: 'skull', req: ['aimedShot', 'coldFocus'], max: 10,
    stat: { critChance: per(1), critDamage: per(8) },
  },
  {
    id: 'oneShot', name: tr('One Shot, One Grave'),
    desc: tr('Capstone. Your first attack on a full-health target is always a critical hit and pierces everything.'),
    tier: 5, col: 1, icon: 'apex', req: ['headshot'], max: 5, t: 'enemy',
    mana: [22, 1], cd: [26, 1.2, 14], dmg: [5.5, 0.8], type: 'physical',
    fx: 'projectile', p: { pierce: 99, range: 30 },
    attackTime: 1.8,
  },
]);

const WILDCRAFT = build('wildcraft', [
  {
    id: 'rollAway', name: tr('Roll Away'),
    desc: tr('Roll 6m in any direction, untouchable for 0.3s, then run 20% faster for 1.5s (+0.1s per rank).'),
    tier: 1, col: 0, icon: 'dash', t: 'direction', mana: [4, 0.3], cd: [7, 0.25, 3],
    fx: 'dash', p: { distance: 6, iframes: 0.3, speed: 20, duration: 1.5, durationPerRank: 0.1 },
  },
  {
    id: 'snareTrap', name: tr('Snare Trap'),
    desc: tr('Set a trap. The first thing across it is rooted for 2.5s (+0.2s per rank).'),
    tier: 1, col: 1, icon: 'trap', t: 'point', mana: [6, 0.4], cd: [9, 0.3, 4],
    fx: 'nova', p: { duration: 30, root: 2.5, rootPerRank: 0.2, radius: 2 },
    castTime: 0.55,
  },
  {
    id: 'lightFoot', name: tr('Light Foot'),
    desc: tr('You move like the floor owes you nothing. +1 dexterity per rank, and +2.7% movement speed per rank with diminishing returns toward 30%.'),
    tier: 1, col: 2, icon: 'boots',
    stat: { moveSpeed: dim(30, 0.09), dexterity: per(1) },
  },
  {
    id: 'spikeTrap', name: tr('Spike Trap'),
    desc: tr('A pressure plate over a pit. Detonates for heavy physical damage in a small area.'),
    tier: 2, col: 0, icon: 'spikes', req: ['snareTrap'], t: 'point',
    mana: [9, 0.6], cd: [11, 0.35, 5], dmg: [2.2, 0.26], type: 'physical',
    fx: 'nova', p: { duration: 25, radius: 2.6 },
    castTime: 0.55,
  },
  {
    id: 'thornBarrier', name: tr('Thorn Barrier'),
    desc: tr('A wall of brambles lashes out 7m ahead. Everything caught takes poison damage, is Slowed for 8s and gets 2 stacks of Bleeding.'),
    tier: 2, col: 1, icon: 'thorns', req: ['snareTrap'], t: 'point',
    mana: [11, 0.7], cd: [16, 0.5, 8], dmg: [0.6, 0.08], type: 'poison',
    fx: 'cone', p: { duration: 8, length: 7, bleedStacks: 2 },
    timing: 'spell', castTime: 0.6,
  },
  {
    id: 'survivalist', name: tr('Survivalist'),
    desc: tr('Field medicine. +12 life and +1 life regeneration per rank.'),
    tier: 2, col: 2, icon: 'heart', req: ['lightFoot'],
    stat: { life: per(12), lifeRegen: per(1) },
  },
  {
    id: 'disengage', name: tr('Disengage'),
    desc: tr('Leap 8m backwards and loose an arrow at what you left behind.'),
    tier: 3, col: 0, icon: 'leap', req: ['rollAway'], t: 'direction',
    mana: [10, 0.6], cd: [12, 0.4, 5], dmg: [1.6, 0.2], type: 'physical',
    fx: 'dash', p: { distance: 8, backwards: 1 },
  },
  {
    id: 'venomCoat', name: tr('Venom Coat'),
    desc: tr('Arrows carry poison for 20s: +5 poison damage (+3 per rank) on every hit, and every arrow hit applies a stack of Poisoned.'),
    tier: 3, col: 1, icon: 'vial', req: ['thornBarrier'], t: 'self',
    mana: [14, 0.8], cd: [24, 0.6, 12], type: 'poison',
    fx: 'buff', p: { duration: 20 },
    castTime: 0.5,
  },
  {
    id: 'camouflage', name: tr('Camouflage'),
    desc: tr('Stand still and disappear for 8s (+0.3s per rank) and move 15% faster (+0.5% per rank). Breaking it grants a guaranteed critical hit with +30% critical damage (+5% per rank).'),
    tier: 3, col: 2, icon: 'stealth', req: ['survivalist'], t: 'self',
    mana: [12, 0.7], cd: [22, 0.7, 10], fx: 'buff',
    p: { duration: 8, critBonus: 100 },
    castTime: 0.4,
  },
  {
    id: 'trapMastery', name: tr('Trap Mastery'),
    desc: tr('Practised hands. -3% skill cooldowns per rank, with diminishing returns toward 30%.'),
    tier: 4, col: 1, icon: 'gear', req: ['spikeTrap', 'venomCoat'], max: 10,
    stat: { cooldownReduction: dim(30, 0.1) },
  },
  {
    id: 'theWholeFloor', name: tr('The Whole Floor Is A Trap'),
    desc: tr('Capstone. Every trap you know goes off at once: one blast across 8m around you.'),
    tier: 5, col: 1, icon: 'apex', req: ['trapMastery'], max: 5, t: 'self',
    mana: [26, 1.2], cd: [40, 1.5, 22], dmg: [2.4, 0.35], type: 'physical',
    fx: 'nova', p: { radius: 8 },
    castTime: 0.7,
  },
]);

const VOLLEY = build('volley', [
  {
    id: 'twinShot', name: tr('Twin Shot'),
    desc: tr('Two arrows, slightly apart. Both can hit the same target at close range.'),
    tier: 1, col: 0, icon: 'arrows', t: 'direction', mana: [4, 0.4], dmg: [0.72, 0.09],
    type: 'physical', fx: 'projectile', p: { count: 2, spread: 0.14, speed: 32 },
    attackTime: 1.1,
  },
  {
    id: 'quickDraw', name: tr('Quick Draw'),
    desc: tr('Nock without looking. +3.2% attack speed per rank, with diminishing returns toward 32%.'),
    tier: 1, col: 1, icon: 'speed',
    stat: { attackSpeed: dim(32, 0.1) },
  },
  {
    id: 'scattershot', name: tr('Scattershot'),
    desc: tr('A cone of arrows at close range: everything within 8m in front of you is hit.'),
    tier: 1, col: 2, icon: 'cone', t: 'direction', mana: [7, 0.5], cd: [5, 0.15, 2],
    dmg: [0.65, 0.08], type: 'physical', fx: 'cone.burst', p: { arc: 0.8, range: 8 },
    attackTime: 0.9,
  },
  {
    id: 'arrowRain', name: tr('Arrow Rain'),
    desc: tr('Loose high. One heavy volley lands across a 4.5m circle.'),
    tier: 2, col: 0, icon: 'rain', req: ['twinShot'], t: 'point',
    mana: [12, 0.8], cd: [6, 0.18, 2.5], dmg: [1.8, 0.28], type: 'physical',
    fx: 'meteor', p: { radius: 4.5 },
    attackTime: 1.2,
  },
  {
    id: 'ricochet', name: tr('Ricochet'),
    desc: tr('Arrows bounce on to 2 more nearby targets after hitting (+1 per 4 ranks).'),
    tier: 2, col: 1, icon: 'bounce', req: ['quickDraw'], t: 'direction',
    mana: [8, 0.5], dmg: [0.95, 0.11], type: 'physical',
    fx: 'chain', p: { bounces: 2, range: 8, bouncesPerRanks: 4 },
  },
  {
    id: 'fanFire', name: tr('Fan Fire'),
    desc: tr('Five arrows in a wide fan. Every one can crit.'),
    tier: 2, col: 2, icon: 'fan', req: ['scattershot'], t: 'direction',
    mana: [11, 0.7], cd: [5, 0.15, 2], dmg: [1.3, 0.2], type: 'physical',
    fx: 'projectile', p: { count: 5, spread: 0.2, speed: 30 },
    attackTime: 1.15,
  },
  {
    id: 'suppressing', name: tr('Suppressing Fire'),
    desc: tr('A stream of arrows down an 18m line. Everything it touches is Slowed 20% for 4s and Exhausted (-25% attack and cast speed) for 8s.'),
    tier: 3, col: 0, icon: 'stream', req: ['arrowRain'], t: 'direction',
    mana: [4, 0.3], dmg: [0.42, 0.06], type: 'physical',
    fx: 'beam', p: { slow: 20, range: 18 },
    attackTime: 1.2,
  },
  {
    id: 'explosiveTip', name: tr('Explosive Tip'),
    desc: tr('Arrows burst on impact for area fire damage.'),
    tier: 3, col: 1, icon: 'burst', req: ['ricochet'], t: 'direction',
    mana: [10, 0.6], cd: [3, 0.1, 1], dmg: [1.4, 0.18], type: 'fire',
    fx: 'projectile', p: { radius: 3, speed: 28 },
    timing: 'attack',
  },
  {
    id: 'endlessQuiver', name: tr('Endless Quiver'),
    desc: tr('Every third skill shot from a bow costs no mana. +1 mana regeneration and +6 mana per rank.'),
    tier: 3, col: 2, icon: 'quiver', req: ['fanFire'],
    stat: { manaRegen: per(1), mana: per(6) }, p: { every: 3 },
  },
  {
    id: 'volleyMastery', name: tr('Volley Mastery'),
    desc: tr('Skills that loose several arrows loose one more every 5 ranks. +2.8% damage per rank (toward 35%) and +0.9% attack speed per rank (toward 15%).'),
    tier: 4, col: 1, icon: 'multi', req: ['explosiveTip', 'endlessQuiver'], max: 10,
    stat: { enhancedDamage: dim(35, 0.08), attackSpeed: dim(15, 0.06) }, p: { perRanks: 5 },
  },
  {
    id: 'darkenTheSky', name: tr('Darken The Sky'),
    desc: tr('Capstone. The sky goes dark and one vast volley falls across the whole room at once.'),
    tier: 5, col: 1, icon: 'apex', req: ['volleyMastery'], max: 5, t: 'point',
    mana: [30, 1.4], cd: [24, 1.5, 15], dmg: [3.6, 0.6], type: 'physical',
    fx: 'meteor', p: { radius: 12 },
    attackTime: 1.6,
  },
]);

/** The Ranger's skills, tree by tree. */
export const RANGER_SKILLS = [...MARKSMAN, ...WILDCRAFT, ...VOLLEY];

export const RANGER_SYNERGIES: SynergyLink[] = [
  // Marksman
  syn('pierceShot', 'steadyHand', 6),
  syn('pierceShot', 'punchThrough', 8),
  syn('aimedShot', 'coldFocus', 8),
  syn('aimedShot', 'longEye', 6),
  syn('bleedingArrow', 'aimedShot', 6),
  syn('bleedingArrow', 'steadyHand', 5),
  syn('crippling', 'bleedingArrow', 8),
  syn('oneShot', 'aimedShot', 10),
  syn('oneShot', 'headshot', 8),
  // Wildcraft
  syn('spikeTrap', 'snareTrap', 8),
  syn('spikeTrap', 'trapMastery', 8),
  syn('thornBarrier', 'survivalist', 6),
  syn('thornBarrier', 'venomCoat', 6),
  syn('disengage', 'rollAway', 10),
  syn('disengage', 'lightFoot', 5),
  syn('theWholeFloor', 'spikeTrap', 10),
  syn('theWholeFloor', 'trapMastery', 8),
  // Volley
  syn('twinShot', 'quickDraw', 8),
  syn('twinShot', 'fanFire', 6),
  syn('scattershot', 'twinShot', 8),
  syn('arrowRain', 'volleyMastery', 8),
  syn('arrowRain', 'fanFire', 5),
  syn('ricochet', 'twinShot', 8),
  syn('ricochet', 'quickDraw', 5),
  syn('fanFire', 'scattershot', 8),
  syn('fanFire', 'volleyMastery', 6),
  syn('suppressing', 'quickDraw', 8),
  syn('explosiveTip', 'arrowRain', 8),
  syn('explosiveTip', 'endlessQuiver', 5),
  syn('darkenTheSky', 'arrowRain', 10),
  syn('darkenTheSky', 'volleyMastery', 8),
];
