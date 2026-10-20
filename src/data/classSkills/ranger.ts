/**
 * SLAY — the Ranger's three trees. Spread into `../skills.ts`.
 *
 *  - Marksman  one arrow, placed: pierce, the critical hit, the first shot.
 *  - Wildcraft traps, snares and footwork: the floor works for you.
 *  - Volley    arrows in quantity: spreads, rains, and shots that keep going.
 *
 * Every active runs in `scenes/ranger/RangerMoves.ts`: each arrow strikes an
 * enemy when it gets there, traps wait on the floor, rains land as they fall.
 * The passives with rules live in `sim/passives/ranger.ts`.
 *
 * Every bow skill is an attack, timed in shots of the bow in hand
 * (`attackTime`, `sim/Speed.ts`); traps, buffs and the kestrel are spells on
 * cast speed (`castTime`). Damage per hit is the ladder alone: speed never
 * changes it.
 */
import { build, dim, per, syn, type SynergyLink } from './kit';
import { tr } from '../../core/I18n';

const MARKSMAN = build('marksman', [
  // --------------------------------------------------------------- tier 1
  {
    id: 'pierceShot', name: tr('Pierce Shot'),
    desc: tr('One heavy shaft through the whole rank. It flies 22m and strikes every enemy on its line as it reaches each one.'),
    tier: 1, col: 0, icon: 'rn-pierce-shot', t: 'direction', mana: [3, 0.35], dmg: [1.15, 0.14],
    type: 'physical', fx: 'projectile.pierce', p: { pierce: 99, speed: 40, range: 22 },
  },
  {
    id: 'steadyHand', name: tr('Steady Hand'),
    desc: tr('Breath control. +14 attack rating per rank, and +2.6% critical chance per rank with diminishing returns toward 26%.'),
    tier: 1, col: 1, icon: 'rn-steady-hand',
    stat: { attackRating: per(14), critChance: dim(26, 0.1) },
  },
  {
    id: 'huntersMark', name: tr("Hunter's Mark"),
    desc: tr('Name the quarry. The enemy you point at (or the nearest within 3m of where you point) has every resistance lowered by 12 (+1.5 per rank) for 12s. If it dies marked, the mark jumps to the nearest enemy within 10m with the time it had left.'),
    tier: 1, col: 2, icon: 'rn-hunters-mark', t: 'enemy', mana: [5, 0.4], cd: [10, 0.3, 4],
    fx: 'apply.mark', p: { duration: 12, amp: 12, ampPerRank: 1.5, reach: 3, jump: 10 },
    timing: 'spell', castTime: 0.35,
  },
  // --------------------------------------------------------------- tier 2
  {
    id: 'aimedShot', name: tr('Aimed Shot'),
    desc: tr('Down on one knee for a slow, full draw. One heavy arrow into the first enemy on its line: a critical hit against anything below half life, and the target is shoved back 1.5m.'),
    tier: 2, col: 0, icon: 'rn-aimed-shot', req: ['pierceShot'], t: 'enemy',
    mana: [7, 0.5], cd: [4, 0.12, 1.4], dmg: [3.0, 0.36], type: 'physical',
    fx: 'projectile.aimed', p: { speed: 46, executeBelow: 50, knockback: 1.5, range: 24 },
    attackTime: 1.4,
  },
  {
    id: 'bleedingArrow', name: tr('Bleeding Arrow'),
    desc: tr('A barbed head that will not come out. The first enemy it meets bleeds (Hemorrhage) for 6s.'),
    tier: 2, col: 1, icon: 'rn-bleeding-arrow', req: ['steadyHand'], t: 'enemy',
    mana: [6, 0.45], cd: [6, 0.2, 2], dmg: [1.1, 0.12], type: 'physical',
    fx: 'projectile.barbed', p: { duration: 6, speed: 38, range: 20 },
  },
  {
    id: 'longEye', name: tr('Long Eye'),
    desc: tr('Damage rises with range. Your arrows deal +2% damage for every metre past 6m between you and what they hit, up to a cap of +3.3% at rank 1 that rises toward +30%.'),
    tier: 2, col: 2, icon: 'rn-long-eye', req: ['huntersMark'],
    p: { perMetre: 2, from: 6, cap: 30, capRate: 0.11 },
  },
  // --------------------------------------------------------------- tier 3
  {
    id: 'punchThrough', name: tr('Punch Through'),
    desc: tr('Arrows lose nothing on the way through. +3.6% damage per rank, with diminishing returns toward 40%.'),
    tier: 3, col: 0, icon: 'rn-punch-through', req: ['aimedShot'],
    stat: { enhancedDamage: dim(40, 0.09) },
  },
  {
    id: 'crippling', name: tr('Crippling Shot'),
    desc: tr('Take the leg. A low arrow that Cripples the first enemy it meets for 4s: 35% slower (+3% per rank) and 80 less defense.'),
    tier: 3, col: 1, icon: 'rn-crippling-shot', req: ['bleedingArrow'], t: 'enemy',
    mana: [8, 0.5], cd: [9, 0.25, 3.5], dmg: [1.5, 0.2], type: 'physical',
    fx: 'projectile.leg', p: { slow: 35, slowPerRank: 3, speed: 38, cripple: 4, range: 20 },
  },
  {
    id: 'coldFocus', name: tr('Cold Focus'),
    desc: tr('Nothing hurries you. +6% critical damage per rank, and +1.9% attack speed per rank with diminishing returns toward 24%.'),
    tier: 3, col: 2, icon: 'rn-cold-focus', req: ['longEye'],
    stat: { critDamage: per(6), attackSpeed: dim(24, 0.08) },
  },
  // --------------------------------------------------------------- tier 4
  {
    id: 'splinterShot', name: tr('Splinter Shot'),
    desc: tr('A brittle shaft that shatters inside the first enemy it meets. That enemy takes the full shot, and 6 splinters spray on through a 6m cone behind it, each striking the first enemy in its way for 35% of the shot.'),
    tier: 4, col: 0, icon: 'rn-splinter-shot', req: ['punchThrough'], t: 'direction',
    mana: [12, 0.6], cd: [4, 0.12, 1.5], dmg: [2.0, 0.24], type: 'physical',
    fx: 'projectile.splinter', p: { range: 20, speed: 36, splinters: 6, cone: 0.7, reach: 6, splinterShare: 35 },
  },
  {
    id: 'headshot', name: tr('Headshot'),
    desc: tr('Aim for the eye. +1% critical chance and +8% critical damage per rank.'),
    tier: 4, col: 1, icon: 'rn-headshot', req: ['aimedShot', 'coldFocus'], max: 10,
    stat: { critChance: per(1), critDamage: per(8) },
  },
  {
    id: 'openSeason', name: tr('Open Season'),
    desc: tr("Hunter's Mark also lands on up to 2 more enemies within 6m of the first (+1 every 8 ranks), and your critical hits on marked enemies deal +6% critical damage per rank."),
    tier: 4, col: 2, icon: 'rn-open-season', req: ['coldFocus'],
    p: { extra: 2, extraPerRanks: 8, spread: 6, critDmgPerRank: 6 },
  },
  // --------------------------------------------------------------- tier 5
  {
    id: 'bankShot', name: tr('Bank Shot'),
    desc: tr('An arrow that glances off walls up to 2 times (+1 every 7 ranks) over 26m, striking everything on every leg as it passes. Corridors become a weapon.'),
    tier: 5, col: 0, icon: 'rn-bank-shot', req: ['splinterShot'], t: 'direction',
    mana: [14, 0.7], cd: [5, 0.15, 2], dmg: [1.5, 0.18], type: 'physical',
    fx: 'projectile.bank', p: { range: 26, speed: 38, banks: 2, banksPerRanks: 7, pierce: 99 },
    attackTime: 1.15,
  },
  {
    id: 'cleanKill', name: tr('Clean Kill'),
    desc: tr('The first arrow into an enemy at full life is a critical hit with +20% critical damage (+3% per rank).'),
    tier: 5, col: 1, icon: 'rn-clean-kill', req: ['headshot'],
    p: { critDmg: 20, critDmgPerRank: 3 },
  },
  {
    id: 'quarrysEnd', name: tr("Quarry's End"),
    desc: tr('One arrow at every marked enemy within 25m, at most 6 (with none marked, at the one you aim at). Every one is a critical hit, and each mark it strikes is spent.'),
    tier: 5, col: 2, icon: 'rn-quarrys-end', req: ['openSeason'], t: 'enemy',
    mana: [18, 0.9], cd: [12, 0.35, 5], dmg: [2.2, 0.25], type: 'physical',
    fx: 'projectile.quarry', p: { range: 25, most: 6, speed: 40, alwaysCrit: 1 },
    attackTime: 1.3,
  },
  // --------------------------------------------------------------- tier 6
  {
    id: 'throughAndThrough', name: tr('Through and Through'),
    desc: tr("Capstone. Your plain shot, Aimed Shot, Bleeding Arrow, Crippling Shot, Disengage's arrow and Quarry's End all pierce, and every enemy an arrow passes through makes it strike the next 10% harder (+1% per rank), up to +50%."),
    tier: 6, col: 0, icon: 'rn-through-and-through', req: ['bankShot', 'cleanKill'],
    fx: 'capstone.throughAndThrough', p: { pct: 10, pctPerRank: 1, cap: 50 },
  },
  {
    id: 'oneShot', name: tr('One Shot, One Grave'),
    desc: tr('The longest draw there is. One black arrow that pierces everything on a 30m line. It is always a critical hit, and it deals double damage to anything at full life.'),
    tier: 6, col: 1, icon: 'rn-one-shot', req: ['headshot'], t: 'enemy',
    mana: [22, 1], cd: [26, 1.2, 14], dmg: [5.5, 0.8], type: 'physical',
    fx: 'projectile.grave', p: { pierce: 99, range: 30, speed: 44, alwaysCrit: 1, fullLife: 100 },
    attackTime: 1.8,
  },
  {
    id: 'fletchersArt', name: tr("Fletcher's Art"),
    desc: tr('Your own fletching, your own heads. +5% damage with bow skills per rank, and +0.5% critical chance per rank.'),
    tier: 6, col: 2, icon: 'rn-fletchers-art', req: ['quarrysEnd'], max: 15,
    stat: { critChance: per(0.5) }, p: { damagePerRank: 5 },
  },
]);

const WILDCRAFT = build('wildcraft', [
  // --------------------------------------------------------------- tier 1
  {
    id: 'rollAway', name: tr('Roll Away'),
    desc: tr('Roll 6m in any direction, untouchable for 0.3s, then run 20% faster for 1.5s (+0.1s per rank). You come up with an arrow nocked: your next arrow skill within 2s (+0.05s per rank) is a critical hit.'),
    tier: 1, col: 0, icon: 'rn-roll-away', t: 'direction', mana: [4, 0.3], cd: [7, 0.25, 3],
    fx: 'dash.roll', p: { distance: 6, iframes: 0.3, speed: 20, duration: 1.5, durationPerRank: 0.1, nocked: 2, nockedPerRank: 0.05 },
  },
  {
    id: 'snareTrap', name: tr('Snare Trap'),
    desc: tr('Set a noose at the aimed point, up to 12m away. It arms in 0.4s and waits 30s; the first enemy within 2m snaps it, and everything within 2m is Rooted for 2.5s (+0.2s per rank). Up to 3 out at once.'),
    tier: 1, col: 1, icon: 'rn-snare-trap', t: 'point', mana: [6, 0.4], cd: [9, 0.3, 4],
    fx: 'trap.snare', p: { range: 12, arm: 0.4, life: 30, most: 3, radius: 2, root: 2.5, rootPerRank: 0.2 },
    castTime: 0.55,
  },
  {
    id: 'lightFoot', name: tr('Light Foot'),
    desc: tr('You move like the floor owes you nothing. +1 dexterity per rank, and +2.7% movement speed per rank with diminishing returns toward 30%.'),
    tier: 1, col: 2, icon: 'rn-light-foot',
    stat: { moveSpeed: dim(30, 0.09), dexterity: per(1) },
  },
  // --------------------------------------------------------------- tier 2
  {
    id: 'spikeTrap', name: tr('Spike Trap'),
    desc: tr('A pressure plate at the aimed point, up to 12m away. It arms in 0.5s and waits 25s; the first enemy within 1.2m sets it off, and spikes burst up through everything within 2.6m, leaving 2 stacks of Bleeding for 6s. Up to 3 out at once.'),
    tier: 2, col: 0, icon: 'rn-spike-trap', req: ['snareTrap'], t: 'point',
    mana: [9, 0.6], cd: [11, 0.35, 5], dmg: [2.2, 0.26], type: 'physical',
    fx: 'trap.spike', p: { range: 12, arm: 0.5, life: 25, most: 3, radius: 2.6, plate: 1.2, bleedStacks: 2, bleedDuration: 6 },
    castTime: 0.55,
  },
  {
    id: 'thornBarrier', name: tr('Thorn Barrier'),
    desc: tr('Brambles burst up in a wall 7m long across the aimed point and stand for 6s (+0.2s per rank). Whatever stands in it or pushes through takes poison damage every 0.5s and is Slowed 30%; its first touch leaves 2 stacks of Bleeding.'),
    tier: 2, col: 1, icon: 'rn-thorn-barrier', req: ['snareTrap'], t: 'point',
    mana: [11, 0.7], cd: [16, 0.5, 8], dmg: [0.25, 0.035], type: 'poison',
    fx: 'ground.bramble', p: { range: 14, length: 7, width: 1.4, duration: 6, durationPerRank: 0.2, tick: 0.5, slow: 30, bleedStacks: 2 },
    timing: 'spell', castTime: 0.6,
  },
  {
    id: 'survivalist', name: tr('Survivalist'),
    desc: tr('Field medicine. +12 life and +1 life regeneration per rank.'),
    tier: 2, col: 2, icon: 'rn-survivalist', req: ['lightFoot'],
    stat: { life: per(12), lifeRegen: per(1) },
  },
  // --------------------------------------------------------------- tier 3
  {
    id: 'disengage', name: tr('Disengage'),
    desc: tr('Leap 8m backwards with your eyes on the enemy, and loose an arrow at what you left behind as you go.'),
    tier: 3, col: 0, icon: 'rn-disengage', req: ['rollAway'], t: 'direction',
    mana: [10, 0.6], cd: [12, 0.4, 5], dmg: [1.6, 0.2], type: 'physical',
    fx: 'dash.back', p: { distance: 8, backwards: 1, range: 18, speed: 40 },
  },
  {
    id: 'venomCoat', name: tr('Venom Coat'),
    desc: tr('Coat your arrows for 20s: +5 poison damage (+3 per rank) on every hit, and every arrow that lands leaves a stack of Poisoned for 8s. Every arrow skill carries it, rains and caroms too.'),
    tier: 3, col: 1, icon: 'rn-venom-coat', req: ['thornBarrier'], t: 'self',
    mana: [14, 0.8], cd: [24, 0.6, 12], type: 'poison',
    fx: 'buff.coat', p: { duration: 20 },
    castTime: 0.5,
  },
  {
    id: 'camouflage', name: tr('Camouflage'),
    desc: tr('For 10s (+0.3s per rank) you move 15% faster (+0.5% per rank), and whenever you stand still for 0.6s you vanish (Veiled) until you move or shoot. Your first arrow from hiding is a critical hit with +30% critical damage (+5% per rank).'),
    tier: 3, col: 2, icon: 'rn-camouflage', req: ['survivalist'], t: 'self',
    mana: [12, 0.7], cd: [22, 0.7, 10], fx: 'buff.hide',
    p: { duration: 10, still: 0.6, critDamage: 30, critDamagePerRank: 5 },
    castTime: 0.4,
  },
  // --------------------------------------------------------------- tier 4
  {
    id: 'tripwire', name: tr('Tripwire'),
    desc: tr('String a wire 8m long across the aimed point, up to 12m away. It arms in 0.5s and waits 25s; the first enemy to cross it snaps it, and everything within 1m of the wire takes the damage and is Knocked Down for 1.2s (+0.05s per rank). Up to 2 out at once.'),
    tier: 4, col: 0, icon: 'rn-tripwire', req: ['disengage'], t: 'point',
    mana: [9, 0.55], cd: [8, 0.25, 3.5], dmg: [1.2, 0.15], type: 'physical',
    fx: 'trap.wire', p: { range: 12, length: 8, arm: 0.5, life: 25, most: 2, width: 1, trip: 1.2, tripPerRank: 0.05 },
    castTime: 0.55,
  },
  {
    id: 'trapMastery', name: tr('Trap Mastery'),
    desc: tr('Practised hands. -3% skill cooldowns per rank, with diminishing returns toward 30%.'),
    tier: 4, col: 1, icon: 'rn-trap-mastery', req: ['spikeTrap', 'venomCoat'], max: 10,
    stat: { cooldownReduction: dim(30, 0.1) },
  },
  {
    id: 'boltHole', name: tr('Bolt-Hole'),
    desc: tr('When a blow takes you below 35% life, you heal 15% of your life (+1% per rank) over 3s and run 30% faster for 3s. Once every 60s (1s less per rank, never under 40s).'),
    tier: 4, col: 2, icon: 'rn-bolt-hole', req: ['camouflage'],
    p: { below: 35, heal: 15, healPerRank: 1, over: 3, run: 30, cooldown: 60, cdPerRank: 1, cdFloor: 40 },
  },
  // --------------------------------------------------------------- tier 5
  {
    id: 'slipFree', name: tr('Slip Free'),
    desc: tr('Holds on you (stuns, roots, knock downs, fear) end sooner: 4% at rank 1, rising toward 50%, and never less than half their time. Roll Away and Disengage shake one hold or slow off you before you go.'),
    tier: 5, col: 0, icon: 'rn-slip-free', req: ['tripwire'],
    p: { ccReduction: 50, ccRate: 0.08, ccFloor: 50 },
  },
  {
    id: 'waspNest', name: tr('Wasp Nest'),
    desc: tr('Hang a wasp nest at the aimed point, up to 12m away. The first enemy within 2m breaks it, and for 5s the swarm stings everything within 3.5m every 0.5s for poison damage, each sting leaving a stack of Poisoned for 8s. Up to 2 out at once.'),
    tier: 5, col: 1, icon: 'rn-wasp-nest', req: ['trapMastery'], t: 'point',
    mana: [14, 0.8], cd: [12, 0.35, 6], dmg: [0.3, 0.04], type: 'poison',
    fx: 'trap.wasp', p: { range: 12, arm: 0.5, life: 25, most: 2, catch: 2, radius: 3.5, swarm: 5, tick: 0.5, poisonStacks: 1 },
    castTime: 0.55,
  },
  {
    id: 'kestrel', name: tr('Kestrel'),
    desc: tr('A kestrel circles over you for 30s (+1s per rank), stooping every 1.4s on an enemy within 14m (marked ones first) for weapon damage. Nothing can strike it.'),
    tier: 5, col: 2, icon: 'rn-kestrel', req: ['boltHole'], t: 'self',
    mana: [18, 0.9], cd: [20, 0.5, 10], dmg: [0.9, 0.11], type: 'physical',
    fx: 'sky.kestrel', p: { duration: 30, durationPerRank: 1, every: 1.4, reach: 14 },
    timing: 'spell', castTime: 0.5,
  },
  // --------------------------------------------------------------- tier 6
  {
    id: 'layOfTheLand', name: tr('Lay of the Land'),
    desc: tr('Capstone. Every Roll Away and Disengage leaves an armed Spike Trap where your feet left the ground (at your Spike Trap rank, which needs a point). Your traps arm at once, you may keep 1 more of each out (+1 every 10 ranks), and your trap damage rises 2% per rank.'),
    tier: 6, col: 0, icon: 'rn-lay-of-the-land', req: ['slipFree', 'waspNest'],
    fx: 'capstone.layOfTheLand', p: { extra: 1, extraPerRanks: 10, damagePerRank: 2 },
  },
  {
    id: 'theWholeFloor', name: tr('The Whole Floor Is A Trap'),
    desc: tr('Every trap you have out goes off at once, wherever it is, and steel bursts across 8m around you.'),
    tier: 6, col: 1, icon: 'rn-whole-floor', req: ['trapMastery'], t: 'self',
    mana: [26, 1.2], cd: [40, 1.5, 22], dmg: [2.4, 0.35], type: 'physical',
    fx: 'nova.floor', p: { radius: 8 },
    castTime: 0.7,
  },
  {
    id: 'huntcraft', name: tr('Huntcraft'),
    desc: tr('A life spent reading ground. +6% damage per rank with your traps, Thorn Barrier and the kestrel, and your traps catch from 3% farther per rank.'),
    tier: 6, col: 2, icon: 'rn-huntcraft', req: ['kestrel'], max: 15,
    p: { damagePerRank: 6, reachPerRank: 3 },
  },
]);

const VOLLEY = build('volley', [
  // --------------------------------------------------------------- tier 1
  {
    id: 'twinShot', name: tr('Twin Shot'),
    desc: tr('Two arrows, one loose after the other, slightly apart. Up close both can find the same target.'),
    tier: 1, col: 0, icon: 'rn-twin-shot', t: 'direction', mana: [4, 0.4], dmg: [0.72, 0.09],
    type: 'physical', fx: 'projectile.twin', p: { count: 2, spread: 0.14, speed: 36, range: 20 },
    attackTime: 1.1,
  },
  {
    id: 'quickDraw', name: tr('Quick Draw'),
    desc: tr('Nock without looking. +3.2% attack speed per rank, with diminishing returns toward 32%.'),
    tier: 1, col: 1, icon: 'rn-quick-draw',
    stat: { attackSpeed: dim(32, 0.1) },
  },
  {
    id: 'scattershot', name: tr('Scattershot'),
    desc: tr('A snap from the hip: 6 short arrows sprayed across a cone 8m deep, each striking the first enemy it meets. What they strike is shoved back 1.5m and Blinded for 2s.'),
    tier: 1, col: 2, icon: 'rn-scattershot', t: 'direction', mana: [7, 0.5], cd: [5, 0.15, 2],
    dmg: [0.65, 0.08], type: 'physical', fx: 'cone.scatter', p: { arc: 0.8, range: 8, arrows: 6, knockback: 1.5, duration: 2 },
    attackTime: 0.9,
  },
  // --------------------------------------------------------------- tier 2
  {
    id: 'arrowRain', name: tr('Arrow Rain'),
    desc: tr('Loose high. A beat later the volley comes down across a 4.5m circle, up to 20m away, and strikes everything under it.'),
    tier: 2, col: 0, icon: 'rn-arrow-rain', req: ['twinShot'], t: 'point',
    mana: [12, 0.8], cd: [6, 0.18, 2.5], dmg: [2.52, 0.39], type: 'physical',
    fx: 'meteor.rain', p: { radius: 4.5, range: 20 },
    attackTime: 1.2,
  },
  {
    id: 'ricochet', name: tr('Carom Shot'),
    desc: tr('An arrow that caroms from enemy to enemy: after the first it flies on to 2 more within 8m (+1 every 4 ranks), each leg striking as it arrives and 18% weaker than the last.'),
    tier: 2, col: 1, icon: 'rn-carom-shot', req: ['quickDraw'], t: 'direction',
    mana: [8, 0.5], dmg: [0.95, 0.11], type: 'physical',
    fx: 'chain.carom', p: { bounces: 2, range: 8, bouncesPerRanks: 4, falloff: 18, speed: 34, reach: 20 },
  },
  {
    id: 'fanFire', name: tr('Fan Fire'),
    desc: tr('Five arrows in one flat sweep of the bow, fanned wide. Every one can crit, and up close several find the same target.'),
    tier: 2, col: 2, icon: 'rn-fan-fire', req: ['scattershot'], t: 'direction',
    mana: [11, 0.7], cd: [5, 0.15, 2], dmg: [1.3, 0.2], type: 'physical',
    fx: 'projectile.fan', p: { count: 5, spread: 0.2, speed: 34, range: 18 },
    attackTime: 1.15,
  },
  // --------------------------------------------------------------- tier 3
  {
    id: 'suppressing', name: tr('Suppressing Fire'),
    desc: tr('Knelt and steady: three arrows one after another down an 18m line, each striking everything it passes. What they touch is Slowed 20% for 4s and Exhausted (-25% attack and cast speed) for 8s.'),
    tier: 3, col: 0, icon: 'rn-suppressing-fire', req: ['arrowRain'], t: 'direction',
    mana: [4, 0.3], dmg: [0.42, 0.06], type: 'physical',
    fx: 'beam.stream', p: { slow: 20, range: 18, arrows: 3 },
    attackTime: 1.2,
  },
  {
    id: 'explosiveTip', name: tr('Explosive Tip'),
    desc: tr('A burning arrow that bursts on the first enemy it meets, or at the end of its 20m flight, for fire damage to everything within 3m.'),
    tier: 3, col: 1, icon: 'rn-explosive-tip', req: ['ricochet'], t: 'direction',
    mana: [10, 0.6], cd: [3, 0.1, 1], dmg: [1.4, 0.18], type: 'fire',
    fx: 'projectile.fire', p: { radius: 3, speed: 34, range: 20 },
    timing: 'attack',
  },
  {
    id: 'endlessQuiver', name: tr('Endless Quiver'),
    desc: tr('Every third bow skill you loose costs no mana. +1 mana regeneration and +6 mana per rank.'),
    tier: 3, col: 2, icon: 'rn-endless-quiver', req: ['fanFire'],
    stat: { manaRegen: per(1), mana: per(6) }, p: { every: 3 },
  },
  // --------------------------------------------------------------- tier 4
  {
    id: 'creepingBarrage', name: tr('Creeping Barrage'),
    desc: tr('A rain that walks: 5 falls (+1 every 6 ranks), 2.2m and 0.2s apart, from just in front of you toward the aimed point, each striking everything within 1.5m.'),
    tier: 4, col: 0, icon: 'rn-creeping-barrage', req: ['suppressing'], t: 'point',
    mana: [16, 0.8], cd: [6, 0.18, 2.5], dmg: [1.1, 0.14], type: 'physical',
    fx: 'meteor.creep', p: { falls: 5, fallsPerRanks: 6, step: 2.2, gap: 0.2, radius: 1.5 },
    attackTime: 1.3,
  },
  {
    id: 'volleyMastery', name: tr('Volley Mastery'),
    desc: tr('Twin Shot, Scattershot, Fan Fire, Suppressing Fire and Arrow Wheel loose one more arrow every 5 ranks. +2.8% damage per rank (toward 35%) and +0.9% attack speed per rank (toward 15%).'),
    tier: 4, col: 1, icon: 'rn-volley-mastery', req: ['explosiveTip', 'endlessQuiver'], max: 10,
    stat: { enhancedDamage: dim(35, 0.08), attackSpeed: dim(15, 0.06) }, p: { perRanks: 5 },
  },
  {
    id: 'closeGrouping', name: tr('Close Grouping'),
    desc: tr('When more than one arrow of a single loose strikes the same enemy, each after the first deals +10% damage (+2% per rank).'),
    tier: 4, col: 2, icon: 'rn-close-grouping', req: ['endlessQuiver'],
    p: { pct: 10, pctPerRank: 2 },
  },
  // --------------------------------------------------------------- tier 5
  {
    id: 'thicketOfShafts', name: tr('Thicket of Shafts'),
    desc: tr('Where Arrow Rain, Creeping Barrage and Darken The Sky come down, the floor bristles with shafts for 4s (+0.2s per rank): enemies in it are Slowed 25%.'),
    tier: 5, col: 0, icon: 'rn-thicket', req: ['creepingBarrage'],
    p: { duration: 4, durationPerRank: 0.2, slow: 25 },
  },
  {
    id: 'openQuiver', name: tr('Open Quiver'),
    desc: tr('For 6s (+0.2s per rank), Twin Shot, Scattershot, Fan Fire, Suppressing Fire and Arrow Wheel loose 2 more arrows, and you draw 15% faster (+0.5% per rank).'),
    tier: 5, col: 1, icon: 'rn-open-quiver', req: ['volleyMastery'], t: 'self',
    mana: [20, 1], cd: [24, 0.6, 12], fx: 'buff.quiver',
    p: { duration: 6, durationPerRank: 0.2, arrows: 2, draw: 15, drawPerRank: 0.5 },
    castTime: 0.4,
  },
  {
    id: 'arrowWheel', name: tr('Arrow Wheel'),
    desc: tr('Turn on the spot and loose 10 arrows (+1 every 4 ranks) in a full circle, each flying 10m and striking the first enemy it meets. The answer to being surrounded.'),
    tier: 5, col: 2, icon: 'rn-arrow-wheel', req: ['closeGrouping'], t: 'self',
    mana: [14, 0.7], cd: [5, 0.15, 2], dmg: [0.8, 0.09], type: 'physical',
    fx: 'projectile.wheel', p: { arrows: 10, arrowsPerRanks: 4, range: 10, speed: 32 },
    attackTime: 1.3,
  },
  // --------------------------------------------------------------- tier 6
  {
    id: 'murmuration', name: tr('Murmuration'),
    desc: tr('Capstone. An arrow that kills scatters into two that fly on to the nearest enemies within 10m for 60% of the killing hit (+2% per rank). Those can scatter again, three times at most, and no more than 12 scattered arrows fly at once.'),
    tier: 6, col: 0, icon: 'rn-murmuration', req: ['thicketOfShafts', 'openQuiver'],
    fx: 'capstone.murmuration', p: { share: 60, sharePerRank: 2, reach: 10, split: 2, depth: 3, most: 12 },
  },
  {
    id: 'darkenTheSky', name: tr('Darken The Sky'),
    desc: tr('The light dims, and a beat later a vast volley falls across 12m, up to 22m away, striking everything under it.'),
    tier: 6, col: 1, icon: 'rn-darken-the-sky', req: ['volleyMastery'], t: 'point',
    mana: [30, 1.4], cd: [24, 1.5, 15], dmg: [5.04, 0.84], type: 'physical',
    fx: 'meteor.sky', p: { radius: 12, range: 22 },
    attackTime: 1.6,
  },
  {
    id: 'arrowsmith', name: tr('Arrowsmith'),
    desc: tr('+5% damage per rank with Twin Shot, Scattershot, Fan Fire, Suppressing Fire, Arrow Wheel and the rains (Arrow Rain, Creeping Barrage, Darken The Sky), and +1% critical chance with them every 3 ranks.'),
    tier: 6, col: 2, icon: 'rn-arrowsmith', req: ['arrowWheel'], max: 15,
    p: { damagePerRank: 5, critEvery: 3 },
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
  syn('splinterShot', 'pierceShot', 8),
  syn('splinterShot', 'punchThrough', 6),
  syn('bankShot', 'splinterShot', 8),
  syn('bankShot', 'pierceShot', 5),
  syn('quarrysEnd', 'huntersMark', 10),
  syn('quarrysEnd', 'openSeason', 6),
  // Wildcraft
  syn('spikeTrap', 'snareTrap', 8),
  syn('spikeTrap', 'trapMastery', 8),
  syn('thornBarrier', 'survivalist', 6),
  syn('thornBarrier', 'venomCoat', 6),
  syn('disengage', 'rollAway', 10),
  syn('disengage', 'lightFoot', 5),
  syn('theWholeFloor', 'spikeTrap', 10),
  syn('theWholeFloor', 'trapMastery', 8),
  syn('theWholeFloor', 'tripwire', 6),
  syn('tripwire', 'snareTrap', 8),
  syn('tripwire', 'trapMastery', 5),
  syn('waspNest', 'venomCoat', 8),
  syn('waspNest', 'thornBarrier', 6),
  syn('kestrel', 'camouflage', 8),
  syn('kestrel', 'survivalist', 5),
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
  syn('creepingBarrage', 'arrowRain', 10),
  syn('creepingBarrage', 'suppressing', 6),
  syn('arrowWheel', 'scattershot', 8),
  syn('arrowWheel', 'fanFire', 6),
];
