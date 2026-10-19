/**
 * SLAY — elite / rare pack affixes.
 *
 * An affix has to do two things: change the numbers, and change the *fight*.
 * Every entry here has a `behavior` hook the entity layer resolves each frame
 * (or on hit / on death), plus an aura colour so a pack reads at a glance —
 * you should know from across the room that the pack ahead is Molten + Jailer
 * and that you do not want to fight it in a corridor.
 *
 * `excludes` keeps combinations honest: nothing rolls two movement-denial
 * affixes, nothing rolls two elemental enchantments, and nothing pairs an
 * "unkillable while adds live" affix with "revives on death".
 */

import type { MonsterAffixDef } from '../types';
import { tr } from '../core/I18n';

const ALL: MonsterAffixDef[] = [];

function affix(a: MonsterAffixDef): MonsterAffixDef {
  ALL.push(a);
  return a;
}

// --- Raw statline affixes ---------------------------------------------------

affix({
  id: 'extra_fast',
  name: tr('Extra Fast'),
  desc: tr('Moves and strikes far quicker than it should.'),
  minDepth: 1,
  weight: 12,
  mods: { speed: 1.45, attackSpeed: 1.4 },
  behavior: 'none',
  color: 0xffe066,
  excludes: ['juggernaut', 'lumbering'],
});

affix({
  id: 'extra_tough',
  name: tr('Fortified'),
  desc: tr('A thick hide that shrugs off the first dozen blows.'),
  minDepth: 1,
  weight: 12,
  mods: { life: 1.9, defense: 1.5 },
  behavior: 'none',
  color: 0xb0b8c8,
});

affix({
  id: 'berserker',
  name: tr('Berserker'),
  desc: tr('Hits harder the closer it is to death.'),
  minDepth: 3,
  weight: 10,
  mods: { damage: 1.25 },
  behavior: 'berserker',
  params: { maxBonus: 1.8 },
  color: 0xff3020,
});

affix({
  id: 'juggernaut',
  name: tr('Juggernaut'),
  desc: tr('Cannot be slowed, stunned, frozen or knocked back.'),
  minDepth: 6,
  weight: 8,
  mods: { life: 1.6, speed: 0.92 },
  behavior: 'juggernaut',
  color: 0xc08040,
  excludes: ['extra_fast', 'phasing'],
});

affix({
  id: 'stoneskin',
  name: tr('Stoneskin'),
  desc: tr('Physical blows glance off; magic still bites.'),
  minDepth: 5,
  weight: 8,
  mods: { defense: 2.2, speed: 0.9 },
  behavior: 'stoneskin',
  params: { physicalReduction: 0.45 },
  color: 0x9a9484,
});

affix({
  id: 'missile_dampening',
  name: tr('Missile Dampening'),
  desc: tr('Projectiles slow to a crawl before they reach it.'),
  minDepth: 8,
  weight: 6,
  mods: { defense: 1.2 },
  behavior: 'missile_dampening',
  params: { rangedReduction: 0.5 },
  color: 0x60a0d0,
  excludes: ['reflect_damage'],
});

// --- Elemental enchantments -------------------------------------------------

affix({
  id: 'fire_enchanted',
  name: tr('Fire Enchanted'),
  desc: tr('Wreathed in flame; leaves burning ground and detonates on death.'),
  minDepth: 2,
  weight: 11,
  mods: { damage: 1.15 },
  behavior: 'fire_enchanted',
  params: { auraRadius: 2.6, auraDps: 0.32, deathRadius: 4.5 },
  color: 0xff6a20,
  excludes: ['cold_enchanted', 'lightning_enchanted', 'poison_aura', 'arcane_enchanted'],
});

affix({
  id: 'cold_enchanted',
  name: tr('Cold Enchanted'),
  desc: tr('Chills everything nearby and shatters into shards when killed.'),
  minDepth: 2,
  weight: 11,
  mods: { damage: 1.1, life: 1.15 },
  behavior: 'cold_enchanted',
  params: { auraRadius: 3.0, auraDps: 0.22, shards: 10 },
  color: 0x88d8ff,
  excludes: ['fire_enchanted', 'lightning_enchanted', 'poison_aura', 'arcane_enchanted'],
});

affix({
  id: 'lightning_enchanted',
  name: tr('Lightning Enchanted'),
  desc: tr('Discharges arcs of lightning when struck.'),
  minDepth: 3,
  weight: 11,
  mods: { damage: 1.15, speed: 1.1 },
  behavior: 'lightning_enchanted',
  params: { arcs: 6, interval: 3.5 },
  color: 0xffe066,
  excludes: ['fire_enchanted', 'cold_enchanted', 'poison_aura', 'arcane_enchanted'],
});

affix({
  id: 'poison_aura',
  name: tr('Pestilent'),
  desc: tr('Trails a cloud of spores that lingers where it walks.'),
  minDepth: 3,
  weight: 10,
  mods: { life: 1.2 },
  behavior: 'poison_aura',
  params: { auraRadius: 3.2, auraDps: 0.28 },
  color: 0x8ee04a,
  excludes: ['fire_enchanted', 'cold_enchanted', 'lightning_enchanted', 'arcane_enchanted'],
});

affix({
  id: 'arcane_enchanted',
  name: tr('Arcane Enchanted'),
  desc: tr('Sweeping beams of raw arcane rotate around it.'),
  minDepth: 9,
  weight: 8,
  mods: { damage: 1.2 },
  behavior: 'arcane_enchanted',
  params: { beams: 2, sweepSpeed: 0.8, dps: 0.55 },
  color: 0xc060ff,
  excludes: ['fire_enchanted', 'cold_enchanted', 'lightning_enchanted', 'poison_aura'],
});

// --- Movement & control -----------------------------------------------------

affix({
  id: 'teleporter',
  name: tr('Teleporter'),
  desc: tr('Blinks across the room the moment you gain distance.'),
  minDepth: 4,
  weight: 9,
  mods: { speed: 1.05 },
  behavior: 'teleporter',
  params: { interval: 6, minRange: 7 },
  color: 0xa060ff,
  excludes: ['jailer'],
});

affix({
  id: 'phasing',
  name: tr('Phasing'),
  desc: tr('Flickers out of reality; a fifth of your hits pass straight through.'),
  minDepth: 10,
  weight: 6,
  mods: { life: 0.9 },
  behavior: 'phasing',
  params: { dodge: 0.22 },
  color: 0x9090ff,
  excludes: ['juggernaut'],
});

affix({
  id: 'waller',
  name: tr('Waller'),
  desc: tr('Raises walls of stone to cut off your escape.'),
  minDepth: 7,
  weight: 8,
  behavior: 'waller',
  params: { interval: 9, segments: 5, life: 8 },
  color: 0x8c8577,
  excludes: ['jailer'],
});

affix({
  id: 'jailer',
  name: tr('Jailer'),
  desc: tr('Pins you in place with a cage of force.'),
  minDepth: 8,
  weight: 8,
  behavior: 'jailer',
  params: { interval: 8, duration: 1.6 },
  color: 0xd8c060,
  excludes: ['waller', 'teleporter', 'vortex'],
});

affix({
  id: 'vortex',
  name: tr('Vortex'),
  desc: tr('Yanks you into melee range without warning.'),
  minDepth: 9,
  weight: 8,
  behavior: 'vortex',
  params: { interval: 7, range: 12 },
  color: 0x7040d0,
  excludes: ['knockback', 'jailer'],
});

affix({
  id: 'knockback',
  name: tr('Knockback'),
  desc: tr('Every blow sends you flying.'),
  minDepth: 3,
  weight: 9,
  mods: { damage: 1.1 },
  behavior: 'knockback',
  params: { force: 6 },
  color: 0xd0d0f0,
  excludes: ['vortex'],
});

affix({
  id: 'entangling',
  name: tr('Entangling'),
  desc: tr('Its strikes leave you dragging your feet.'),
  minDepth: 4,
  weight: 9,
  behavior: 'entangling',
  params: { slow: 0.35, duration: 2.5 },
  color: 0x70a040,
});

affix({
  id: 'gravity',
  name: tr('Gravity Bound'),
  desc: tr('Drags you a step closer with every pulse.'),
  minDepth: 12,
  weight: 6,
  behavior: 'gravity',
  params: { interval: 2.4, pull: 2.2, radius: 10 },
  color: 0x6040a0,
  excludes: ['knockback'],
});

affix({
  id: 'wormhole',
  name: tr('Wormhole'),
  desc: tr('Swaps places with you when cornered.'),
  minDepth: 14,
  weight: 5,
  behavior: 'wormhole',
  params: { interval: 11 },
  color: 0x40e0d0,
});

// --- Ground hazards ---------------------------------------------------------

affix({
  id: 'molten_trail',
  name: tr('Molten'),
  desc: tr('Every step it takes catches fire behind it.'),
  minDepth: 5,
  weight: 9,
  mods: { damage: 1.1 },
  behavior: 'molten_trail',
  params: { interval: 0.9, radius: 1.5, dps: 0.35, life: 4 },
  color: 0xff5010,
  excludes: ['frozen_ground'],
});

affix({
  id: 'frozen_ground',
  name: tr('Frozen Ground'),
  desc: tr('The floor beneath it turns to treacherous rime.'),
  minDepth: 6,
  weight: 8,
  behavior: 'frozen_ground',
  params: { interval: 1.2, radius: 1.8, slow: 0.4, life: 5 },
  color: 0x9ce0ff,
  excludes: ['molten_trail'],
});

affix({
  id: 'frozen_pulse',
  name: tr('Frozen Pulse'),
  desc: tr('Fires slow, spiralling shards of ice on a beat.'),
  minDepth: 7,
  weight: 8,
  behavior: 'frozen_pulse',
  params: { interval: 5, count: 5 },
  color: 0x66ccff,
});

affix({
  id: 'electrified',
  name: tr('Electrified'),
  desc: tr('Sheds crawling bolts of lightning as it moves.'),
  minDepth: 6,
  weight: 8,
  behavior: 'electrified',
  params: { interval: 2.6, bolts: 4 },
  color: 0xffee66,
});

affix({
  id: 'mortar',
  name: tr('Mortar'),
  desc: tr('Lobs arcing shells at anything beyond melee reach.'),
  minDepth: 8,
  weight: 8,
  behavior: 'mortar',
  params: { interval: 4.5, minRange: 6, radius: 2.6 },
  color: 0xff9040,
});

affix({
  id: 'arcane_sentry',
  name: tr('Arcane Sentry'),
  desc: tr('Plants immobile turrets that keep firing after it dies.'),
  minDepth: 10,
  weight: 7,
  behavior: 'arcane_sentry',
  params: { interval: 12, count: 1 },
  color: 0xc060ff,
});

affix({
  id: 'orbiter',
  name: tr('Orbiting Wards'),
  desc: tr('Rings of burning wards circle it at melee range.'),
  minDepth: 9,
  weight: 7,
  behavior: 'orbiter',
  params: { orbs: 3, radius: 2.4, spin: 1.6, dps: 0.45 },
  color: 0xff70e0,
});

// --- Defensive & sustain ----------------------------------------------------

affix({
  id: 'shielded',
  name: tr('Shielded'),
  desc: tr('Periodically becomes immune — break off and wait it out.'),
  minDepth: 6,
  weight: 9,
  behavior: 'shielded',
  params: { interval: 11, duration: 2.6 },
  color: 0x60c0ff,
  excludes: ['soul_bound'],
});

affix({
  id: 'thorns',
  name: tr('Thorns'),
  desc: tr('Returns a slice of every melee blow to its owner.'),
  minDepth: 3,
  weight: 9,
  mods: { defense: 1.2 },
  behavior: 'thorns',
  params: { ratio: 0.18 },
  color: 0xa0d060,
  excludes: ['reflect_damage'],
});

affix({
  id: 'reflect_damage',
  name: tr('Reflects Damage'),
  desc: tr('Sends a share of all damage — including spells — back at you.'),
  minDepth: 11,
  weight: 6,
  mods: { defense: 1.15 },
  behavior: 'reflect_damage',
  params: { ratio: 0.22 },
  color: 0xd0a0ff,
  excludes: ['thorns', 'missile_dampening'],
});

affix({
  id: 'life_leech',
  name: tr('Life Leeching'),
  desc: tr('Drinks a third of the damage it deals.'),
  minDepth: 5,
  weight: 9,
  mods: { damage: 1.1 },
  behavior: 'life_leech',
  params: { ratio: 0.34 },
  color: 0xc02040,
  excludes: ['vampiric'],
});

affix({
  id: 'vampiric',
  name: tr('Vampiric'),
  desc: tr('Steadily drains life from you while you stand near it.'),
  minDepth: 12,
  weight: 6,
  behavior: 'vampiric',
  params: { radius: 6, dps: 0.2, healRatio: 1.2 },
  color: 0x901030,
  excludes: ['life_leech'],
});

affix({
  id: 'regenerating',
  name: tr('Fast Healing'),
  desc: tr('Knits itself back together between exchanges.'),
  minDepth: 4,
  weight: 8,
  mods: { life: 1.2 },
  behavior: 'regenerating',
  params: { pctPerSecond: 0.035, delay: 3 },
  color: 0x60ff90,
});

affix({
  id: 'health_link',
  name: tr('Health Link'),
  desc: tr('Shares damage with every linked pack member — kill the links first.'),
  minDepth: 8,
  weight: 7,
  mods: { life: 1.15 },
  behavior: 'health_link',
  params: { radius: 14, share: 0.55 },
  color: 0xff60c0,
});

affix({
  id: 'soul_bound',
  name: tr('Soul Bound'),
  desc: tr('Rises once at half strength before it truly dies.'),
  minDepth: 13,
  weight: 5,
  behavior: 'soul_bound',
  params: { reviveFraction: 0.45 },
  color: 0xa0ff60,
  excludes: ['shielded'],
});

affix({
  id: 'blood_thirsty',
  name: tr('Blood Thirsty'),
  desc: tr('Grows visibly stronger every time it lands a hit.'),
  minDepth: 7,
  weight: 8,
  behavior: 'blood_thirsty',
  params: { perStack: 0.06, maxStacks: 10, duration: 8 },
  color: 0xff4060,
});

// --- Support & pack affixes -------------------------------------------------

affix({
  id: 'summoner',
  name: tr('Summoner'),
  desc: tr('Keeps calling in fresh bodies until you cut it down.'),
  minDepth: 7,
  weight: 8,
  behavior: 'summoner',
  params: { interval: 14, count: 2, cap: 6 },
  color: 0x60ff90,
});

affix({
  id: 'empowered',
  name: tr('Empowering'),
  desc: tr('Every ally near it hits noticeably harder.'),
  minDepth: 6,
  weight: 7,
  behavior: 'empowered',
  params: { radius: 10, damage: 1.3 },
  color: 0xffc040,
  excludes: ['hasted_pack'],
});

affix({
  id: 'hasted_pack',
  name: tr('Frenzied Pack'),
  desc: tr('Drives its pack into a sprinting frenzy.'),
  minDepth: 6,
  weight: 7,
  behavior: 'hasted_pack',
  params: { radius: 10, speed: 1.3, attackSpeed: 1.3 },
  color: 0x60ffe0,
  excludes: ['empowered'],
});

affix({
  id: 'avenger',
  name: tr('Avenger'),
  desc: tr('Enrages permanently each time one of its pack falls.'),
  minDepth: 9,
  weight: 7,
  behavior: 'avenger',
  params: { perDeath: 0.18, cap: 1.9 },
  color: 0xff8020,
});

affix({
  id: 'illusionist',
  name: tr('Illusionist'),
  desc: tr('Splits into decoys the instant you commit to a swing.'),
  minDepth: 10,
  weight: 6,
  behavior: 'illusionist',
  params: { interval: 13, count: 2 },
  color: 0x80c0ff,
});

affix({
  id: 'nightmarish',
  name: tr('Nightmarish'),
  desc: tr('Its blows send you fleeing in terror.'),
  minDepth: 9,
  weight: 6,
  behavior: 'nightmarish',
  params: { chance: 0.22, duration: 1.4 },
  color: 0x402050,
});

affix({
  id: 'plagued',
  name: tr('Plagued'),
  desc: tr('Leaves festering pools behind and bursts when it dies.'),
  minDepth: 5,
  weight: 9,
  behavior: 'plagued',
  params: { interval: 3.5, radius: 2.6, dps: 0.3, deathRadius: 4 },
  color: 0x99ff33,
});

affix({
  id: 'mana_burn',
  name: tr('Mana Burn'),
  desc: tr('Drains your reserves with every strike.'),
  minDepth: 8,
  weight: 7,
  behavior: 'mana_burn',
  params: { drain: 0.12 },
  color: 0x4060ff,
});

affix({
  id: 'unstable',
  name: tr('Unstable'),
  desc: tr('Detonates violently the moment it drops.'),
  minDepth: 4,
  weight: 9,
  behavior: 'unstable',
  params: { radius: 4.5, delay: 0.9, mul: 2.6 },
  color: 0xff7020,
  excludes: ['soul_bound'],
});

affix({
  id: 'chilling_death',
  name: tr('Rimebound'),
  desc: tr('Explodes into a freezing nova on death.'),
  minDepth: 7,
  weight: 8,
  behavior: 'chilling_death',
  params: { radius: 5, mul: 1.5 },
  color: 0xa8dcf0,
  excludes: ['unstable'],
});

affix({
  id: 'storm_death',
  name: tr('Storm Charged'),
  desc: tr('Its death throws lightning across the room.'),
  minDepth: 10,
  weight: 7,
  behavior: 'storm_death',
  params: { bolts: 8, mul: 1.3 },
  color: 0xffee66,
  excludes: ['unstable'],
});

// --- Combat overhaul: affixes that change where you can stand ---------------
//
// Each of these asks a different question of the player. Several are written
// to *combine*: a control affix (Jailer, Waller, Vortex, Entangling, Frozen
// Ground, Gravity) that catches you sets off any follow-up affix in the same
// monster immediately (see COMBO_FOLLOWUPS in Enemy.ts), so Jailer + Mortar is
// a trap and a shell, not two unrelated timers.

affix({
  id: 'desecrator',
  name: tr('Desecrator'),
  desc: tr('Fouls the ground where you stand. Keep moving.'),
  minDepth: 4,
  weight: 9,
  behavior: 'desecrator',
  params: { interval: 5, radius: 2.2, dps: 0.5, life: 7, delay: 0.9 },
  color: 0x9b2fd0,
});

affix({
  id: 'fire_chains',
  name: tr('Fire Chains'),
  desc: tr('Chained in flame to its packmates. Do not step between them.'),
  minDepth: 8,
  weight: 7,
  behavior: 'fire_chains',
  params: { links: 2, range: 12, width: 0.7, mul: 0.22 },
  color: 0xff5a1a,
});

affix({
  id: 'bulwark',
  name: tr('Bulwark'),
  desc: tr('Its ward turns aside blows aimed at the pack. Kill it first.'),
  minDepth: 6,
  weight: 7,
  behavior: 'bulwark',
  params: { radius: 7, absorb: 0.4 },
  color: 0x7fb2ff,
});

affix({
  id: 'splitter',
  name: tr('Splitting'),
  desc: tr('Bursts into two of itself when it dies.'),
  minDepth: 5,
  weight: 7,
  behavior: 'splitter',
  params: { count: 2 },
  color: 0x86d16a,
  excludes: ['soul_bound', 'unstable', 'summoner'],
});

affix({
  id: 'hexing',
  name: tr('Hexing'),
  desc: tr('Every blow lays a curse that strips your resistances.'),
  minDepth: 7,
  weight: 7,
  behavior: 'hexing',
  params: { duration: 6 },
  color: 0x6c3fa0,
});

affix({
  id: 'adaptive',
  name: tr('Adaptive'),
  desc: tr('Hardens against whatever element keeps hitting it. Mix your attacks.'),
  minDepth: 9,
  weight: 6,
  behavior: 'adaptive',
  params: { hits: 4, window: 3, resist: 45, duration: 6 },
  color: 0xd0d0ff,
});

affix({
  id: 'lancer',
  name: tr('Lancer'),
  desc: tr('Lines up and charges straight through you.'),
  minDepth: 6,
  weight: 7,
  behavior: 'lancer',
  params: { interval: 7, minRange: 5, range: 14, windup: 1.0, mul: 1.8 },
  color: 0xffc040,
  excludes: ['teleporter', 'wormhole', 'juggernaut'],
});

// --- The deep powers (depth 20 on, one every five depths) -------------------
// Each one hurts only after a marker on the floor, or is a harmless thing you
// can see coming: a soot cloud, a thread, a ghost climbing out.

affix({
  id: 'echoing',
  name: tr('Echoing'),
  desc: tr('Every blow it lands comes again a beat later, where you stood.'),
  minDepth: 20,
  weight: 9,
  mods: { damage: 1.1 },
  behavior: 'echoing',
  params: { delay: 0.8, radius: 1.7, mul: 0.8, cooldown: 2.2 },
  color: 0xb89cff,
});

affix({
  id: 'lampblack',
  name: tr('Lampblack'),
  desc: tr('Wrapped in soot. Inside its cloud your light gutters and your mana stops refilling.'),
  minDepth: 25,
  weight: 8,
  mods: { life: 1.2 },
  behavior: 'lampblack',
  params: { radius: 6, interval: 0.5 },
  color: 0x6a5a48,
  excludes: ['mana_burn'],
});

affix({
  id: 'restless',
  name: tr('Restless'),
  desc: tr('When it falls, its ghost climbs out a beat later and hunts you, fast and cold.'),
  minDepth: 30,
  weight: 8,
  behavior: 'restless',
  params: { delay: 1.2, life: 0.6 },
  color: 0x9cd8e8,
  excludes: ['splitter', 'soul_bound'],
});

affix({
  id: 'knelling',
  name: tr('Knelling'),
  desc: tr('Rings a bell. The wave rolls out over the marked ring: hug it, or stand clear.'),
  minDepth: 35,
  weight: 8,
  behavior: 'knelling',
  params: { interval: 7, inner: 2.4, outer: 7.5, windup: 1.0, mul: 1.5, slow: 0.35 },
  color: 0xffb040,
});

affix({
  id: 'splintering',
  name: tr('Splintering'),
  desc: tr('Glass under the skin. Heavy blows knock shards loose that rain down around you.'),
  minDepth: 40,
  weight: 8,
  mods: { defense: 1.3 },
  behavior: 'splintering',
  params: { share: 0.06, cooldown: 0.7, radius: 1.3, delay: 0.8, mul: 0.9 },
  color: 0x9ab8d0,
  excludes: ['thorns', 'reflect_damage'],
});

affix({
  id: 'stitching',
  name: tr('Stitching'),
  desc: tr('Sews its wounded packmates shut with a glowing thread. Stand on the thread to cut it.'),
  minDepth: 45,
  weight: 7,
  behavior: 'stitching',
  params: { range: 12, heal: 0.08, width: 0.8, snap: 6 },
  color: 0xff9ac0,
});

affix({
  id: 'grappling',
  name: tr('Grappling'),
  desc: tr('Throws a hook along the marked line and drags you in. Step off the line.'),
  minDepth: 50,
  weight: 8,
  behavior: 'grappling',
  params: { interval: 8, minRange: 4, range: 13, windup: 0.8, mul: 0.6, width: 0.9 },
  color: 0xc89060,
  excludes: ['vortex', 'gravity', 'teleporter', 'wormhole'],
});

affix({
  id: 'refracting',
  name: tr('Refracting'),
  desc: tr('Splits its light into three beams along the marked lines. Stand between them.'),
  minDepth: 55,
  weight: 8,
  behavior: 'refracting',
  params: { interval: 8, range: 15, windup: 0.9, mul: 1.3, spread: 0.42, width: 0.65 },
  color: 0xd8f0ff,
  excludes: ['arcane_enchanted'],
});

affix({
  id: 'funereal',
  name: tr('Funereal'),
  desc: tr('Lights its dead. When a packmate falls nearby, the body is marked and bursts a beat later.'),
  minDepth: 60,
  weight: 8,
  behavior: 'funereal',
  params: { range: 14, radius: 3, delay: 1.0, mul: 1.6, cooldown: 1.2 },
  color: 0x9ad0ff,
});

affix({
  id: 'hemming',
  name: tr('Hemming'),
  desc: tr('Drives a ring of nails up around you. Get out before it closes, or pay to cross it.'),
  minDepth: 65,
  weight: 7,
  behavior: 'hemming',
  params: { interval: 12, radius: 4.5, windup: 1.0, life: 4.5, nails: 14, dps: 0.55 },
  color: 0x8090a8,
  excludes: ['jailer', 'waller'],
});

affix({
  id: 'emberfall',
  name: tr('Emberfall'),
  desc: tr('Calls down a scatter of embers on and around you. Each lands where it is marked.'),
  minDepth: 70,
  weight: 8,
  behavior: 'emberfall',
  params: { interval: 6, ring: 4, radius: 1.4, spread: 2.9, delay: 1.0, mul: 1.1 },
  color: 0xff7030,
  excludes: ['mortar'],
});

affix({
  id: 'eclipsing',
  name: tr('Eclipsing'),
  desc: tr('Swallows the light around it. Anyone still inside the mark when it closes is struck blind.'),
  minDepth: 75,
  weight: 7,
  mods: { life: 1.25 },
  behavior: 'eclipsing',
  params: { interval: 11, radius: 7, windup: 1.3, mul: 1.1, blind: 3 },
  color: 0x7040c0,
});

// ---------------------------------------------------------------------------

export const MONSTER_AFFIXES: MonsterAffixDef[] = ALL;

const BY_ID = new Map<string, MonsterAffixDef>();
for (const a of ALL) BY_ID.set(a.id, a);

export function getAffix(id: string): MonsterAffixDef | undefined {
  return BY_ID.get(id);
}

/**
 * Rolls a legal affix set for a pack. `count` is the number wanted; exclusions
 * and depth gating can return fewer.
 */
export function rollAffixes(
  depth: number,
  count: number,
  rng: { weighted<T>(a: readonly T[], w: (t: T) => number): T; next(): number },
): MonsterAffixDef[] {
  const chosen: MonsterAffixDef[] = [];
  const banned = new Set<string>();
  for (let i = 0; i < count; i++) {
    const pool = ALL.filter(
      (a) => a.minDepth <= depth && !banned.has(a.id) && !chosen.some((c) => c.id === a.id),
    );
    if (!pool.length) break;
    const pick = rng.weighted(pool, (a) => a.weight);
    chosen.push(pick);
    banned.add(pick.id);
    for (const ex of pick.excludes ?? []) banned.add(ex);
  }
  return chosen;
}

/** How many affixes a rank carries. */
export function affixCountForRank(rank: string): number {
  switch (rank) {
    case 'champion':
      return 1;
    case 'elite':
      return 2;
    case 'rare':
      return 3;
    case 'boss':
      return 0;
    default:
      return 0;
  }
}
