/**
 * SLAY — the bestiary.
 *
 * ~130 monsters arranged into families that escalate with depth. Every family
 * is a *line*: the crypt's rattling skeleton at depth 1 becomes a bone colossus
 * at depth 26, and the visual block escalates with it (more horns, bigger
 * silhouette, hotter glow). Roles are spread evenly so any depth band can field
 * a proper pack — front line, shooters, a caster, and something that flanks.
 *
 * Design rule for every entry: it must be describable in one sentence that
 * makes it sound different to fight.
 */

import type { BiomeId, MonsterDef, MonsterFamily, MonsterRole, Rng } from '../types';
import { tr } from '../core/I18n';

// Convenience re-exports: the scene layer pulls the whole monster surface from
// one module rather than three.
export { MONSTER_AFFIXES, getAffix, rollAffixes, affixCountForRank } from './monsterAffixes';
export { BOSSES, getBoss, pickBossForDepth } from './bosses';

// ---------------------------------------------------------------------------
// Surfaces — six keys from the material library, tinted per creature.
// ---------------------------------------------------------------------------

const BONE = 'stone.crypt|0xd6cfb4';
const OLDBONE = 'stone.crypt|0x9d9478';
const STONE = 'stone.crypt|0x8c8577';
const BASALT = 'stone.crypt|0x4a4348';
const IRON = 'metal.iron|0x8b8f96';
const RUST = 'metal.iron|0x8a5a34';
const BRASS = 'metal.iron|0xc09a4a';
const STEEL = 'metal.iron|0xc4ccd8';
const FLESH = 'flesh.rotted|0x8f7a68';
const ROT = 'flesh.rotted|0x6f7a4a';
const PALE = 'flesh.rotted|0xc9bfae';
const CRIMSON = 'flesh.rotted|0x8e2f2a';
const CHITIN = 'flesh.rotted|0x3d4a35';
const VOID = 'crystal.void|0x4a2a6e';
const AZURE = 'crystal.void|0x3a6ea8';
const EMBER = 'crystal.void|0xb03a1a';
const RIME = 'crystal.void|0xa8dcf0';
const CLOTH = 'cloth.linen|0x6a6255';
const SHROUD = 'cloth.linen|0x2e2c38';
const BARK = 'wood.oak|0x5a4a32';
const MOSS = 'wood.oak|0x4a5c30';

// ---------------------------------------------------------------------------
// Role baselines — every monster starts here and overrides what makes it itself
// ---------------------------------------------------------------------------

interface RoleBase {
  lifeMul: number;
  damageMul: number;
  defenseMul: number;
  speed: number;
  scale: number;
  attackRange: number;
  attackSpeed: number;
  xpMul: number;
  weight: number;
}

const ROLE_BASE: Record<MonsterRole, RoleBase> = {
  melee: { lifeMul: 1.0, damageMul: 1.0, defenseMul: 1.0, speed: 3.0, scale: 1.0, attackRange: 1.9, attackSpeed: 1.0, xpMul: 1.0, weight: 10 },
  ranged: { lifeMul: 0.72, damageMul: 0.9, defenseMul: 0.8, speed: 3.1, scale: 0.95, attackRange: 12, attackSpeed: 0.8, xpMul: 1.15, weight: 7 },
  caster: { lifeMul: 0.68, damageMul: 1.15, defenseMul: 0.75, speed: 2.7, scale: 1.0, attackRange: 13, attackSpeed: 0.6, xpMul: 1.35, weight: 5 },
  brute: { lifeMul: 2.6, damageMul: 1.55, defenseMul: 1.45, speed: 2.35, scale: 1.55, attackRange: 2.7, attackSpeed: 0.68, xpMul: 2.2, weight: 4 },
  swarm: { lifeMul: 0.32, damageMul: 0.5, defenseMul: 0.55, speed: 4.3, scale: 0.6, attackRange: 1.4, attackSpeed: 1.55, xpMul: 0.45, weight: 14 },
  support: { lifeMul: 0.9, damageMul: 0.65, defenseMul: 0.95, speed: 2.9, scale: 1.0, attackRange: 9, attackSpeed: 0.65, xpMul: 1.5, weight: 4 },
  ambusher: { lifeMul: 0.82, damageMul: 1.45, defenseMul: 0.78, speed: 3.7, scale: 0.95, attackRange: 2.2, attackSpeed: 1.2, xpMul: 1.25, weight: 6 },
};

type MonSpec = Partial<MonsterDef> &
  Pick<MonsterDef, 'id' | 'name' | 'family' | 'role' | 'minDepth' | 'abilities' | 'visual'>;

const ALL: MonsterDef[] = [];

function mon(spec: MonSpec): MonsterDef {
  const base = ROLE_BASE[spec.role];
  const d: MonsterDef = {
    lifeMul: base.lifeMul,
    damageMul: base.damageMul,
    defenseMul: base.defenseMul,
    speed: base.speed,
    scale: base.scale,
    attackRange: base.attackRange,
    attackSpeed: base.attackSpeed,
    xpMul: base.xpMul,
    weight: base.weight,
    damageType: 'physical',
    ...spec,
  };
  ALL.push(d);
  return d;
}

// ===========================================================================
// UNDEAD — the crypt line. Brittle, numerous, and they get back up.
// ===========================================================================

mon({
  id: 'skeleton_rattler', name: tr('Rattling Skeleton'), family: 'undead', role: 'melee',
  minDepth: 1, weight: 16, lifeMul: 0.75, damageMul: 0.85, speed: 2.9, scale: 0.95,
  abilities: ['basic_strike'],
  resists: { poison: 50, cold: 20, physical: -10 },
  biomes: ['crypt', 'caverns', 'sunkenTemple', 'ashwaste', 'darkForest', 'swamp', 'desert', 'desertTomb', 'tundra', 'hell'],
  visual: { body: 'skeleton', palette: BONE, ornate: 0.15, eyes: 2, glow: 0xffdd88 },
});

mon({
  id: 'skeleton_archer', name: tr('Bone Archer'), family: 'undead', role: 'ranged',
  // Slower than the swordsmen it stands behind: testers could not run one down.
  minDepth: 1, weight: 9, attackRange: 13, speed: 2.6,
  abilities: ['arrow_shot'],
  resists: { poison: 50, cold: 20 },
  biomes: ['crypt', 'caverns', 'sunkenTemple', 'darkForest', 'desert', 'desertTomb', 'tundra', 'swamp'],
  visual: { body: 'skeleton', palette: BONE, ornate: 0.2, eyes: 2, glow: 0xffdd88 },
});

mon({
  id: 'skeleton_warden', name: tr('Crypt Warden'), family: 'undead', role: 'brute',
  minDepth: 4, weight: 5, lifeMul: 2.2, scale: 1.35, speed: 2.5,
  abilities: ['shield_bash'],
  resists: { poison: 50, physical: 20 },
  biomes: ['crypt', 'sunkenTemple', 'desertTomb'],
  visual: { body: 'armored', palette: OLDBONE, ornate: 0.55, eyes: 2, glow: 0x88ccff },
});

mon({
  id: 'skeleton_duelist', name: tr('Ossuary Duelist'), family: 'undead', role: 'melee',
  minDepth: 6, weight: 8, speed: 3.6, attackSpeed: 1.5, damageMul: 1.1, lifeMul: 0.8,
  abilities: ['double_swipe'],
  resists: { poison: 50, cold: 25 },
  biomes: ['crypt', 'sunkenTemple', 'voidspire', 'desertTomb'],
  visual: { body: 'skeleton', palette: BONE, ornate: 0.4, eyes: 2, glow: 0x66ffcc },
});

mon({
  id: 'skeletal_ballista', name: tr('Ossuary Ballista'), family: 'undead', role: 'ranged',
  minDepth: 13, weight: 4, lifeMul: 1.4, speed: 1.5, scale: 1.4, attackRange: 24,
  abilities: ['ballista_bolt'],
  resists: { poison: 60, physical: 15 },
  biomes: ['crypt', 'sunkenTemple', 'desertTomb'],
  visual: { body: 'armored', palette: OLDBONE, ornate: 0.65, eyes: 3, glow: 0xff8844 },
});

mon({
  id: 'bone_conjurer', name: tr('Bone Conjurer'), family: 'undead', role: 'support',
  minDepth: 6, weight: 5, attackRange: 14,
  abilities: ['raise_dead'],
  resists: { poison: 60, arcane: 25 },
  biomes: ['crypt', 'sunkenTemple', 'voidspire', 'desertTomb'],
  visual: { body: 'skeleton', palette: SHROUD, ornate: 0.35, eyes: 2, glow: 0x80ffa0 },
});

mon({
  id: 'crypt_ghoul', name: tr('Crypt Ghoul'), family: 'undead', role: 'melee',
  minDepth: 2, weight: 12, speed: 3.5, lifeMul: 0.9, damageMul: 1.05,
  abilities: ['basic_strike'],
  resists: { poison: 40, cold: 15 },
  biomes: ['crypt', 'caverns', 'hive', 'darkForest', 'swamp', 'desertTomb'],
  visual: { body: 'humanoid', palette: PALE, ornate: 0.35, eyes: 2, glow: 0xff5555 },
});

mon({
  id: 'plague_ghoul', name: tr('Plague Ghoul'), family: 'undead', role: 'melee',
  minDepth: 7, weight: 9, speed: 3.3, lifeMul: 1.0, damageType: 'poison',
  abilities: ['basic_strike', 'plague_death'],
  resists: { poison: 90, cold: 20 },
  biomes: ['crypt', 'caverns', 'hive', 'swamp', 'desertTomb'],
  visual: { body: 'humanoid', palette: ROT, ornate: 0.45, eyes: 2, glow: 0x9ce03a },
});

mon({
  id: 'rotting_bloat', name: tr('Rotting Bloat'), family: 'undead', role: 'brute',
  minDepth: 6, weight: 5, lifeMul: 3.0, speed: 1.7, scale: 1.6, damageType: 'poison',
  abilities: ['heavy_slam', 'plague_death'],
  resists: { poison: 95, physical: 20, fire: -25 },
  biomes: ['crypt', 'caverns', 'hive', 'swamp'],
  visual: { body: 'humanoid', palette: ROT, ornate: 0.6, eyes: 4, glow: 0x9ce03a },
});

mon({
  id: 'corpse_hound', name: tr('Corpse Hound'), family: 'undead', role: 'swarm',
  minDepth: 3, weight: 13, speed: 4.8, scale: 0.75,
  abilities: ['basic_strike'],
  resists: { poison: 50 },
  biomes: ['crypt', 'caverns', 'ashwaste', 'darkForest', 'swamp', 'desert', 'tundra', 'hell'],
  visual: { body: 'quadruped', palette: PALE, ornate: 0.4, tail: true, eyes: 2, glow: 0xff4040 },
});

mon({
  id: 'wraith', name: tr('Wraith'), family: 'undead', role: 'ambusher',
  minDepth: 5, weight: 7, speed: 4.0, damageType: 'cold', attackRange: 2.4,
  abilities: ['phase_shift'],
  resists: { physical: 50, poison: 100, cold: 40, fire: -20 },
  biomes: ['crypt', 'frostvault', 'voidspire', 'darkForest', 'desertTomb', 'tundra'],
  visual: { body: 'wraith', palette: SHROUD, ornate: 0.3, wings: true, eyes: 2, glow: 0x9cf0ff },
});

mon({
  id: 'banshee', name: tr('Banshee'), family: 'undead', role: 'caster',
  minDepth: 9, weight: 5, damageType: 'cold', attackRange: 12,
  abilities: ['frost_bolt', 'banshee_wail'],
  resists: { physical: 45, cold: 60, poison: 100 },
  biomes: ['crypt', 'frostvault', 'voidspire', 'swamp', 'desertTomb', 'tundra'],
  visual: { body: 'wraith', palette: SHROUD, ornate: 0.45, wings: true, eyes: 2, glow: 0xa0e0ff },
});

mon({
  id: 'gravebound_knight', name: tr('Gravebound Knight'), family: 'undead', role: 'brute',
  minDepth: 10, weight: 5, lifeMul: 2.9, defenseMul: 1.8, scale: 1.45,
  abilities: ['cleave'],
  resists: { poison: 60, physical: 30, cold: 25 },
  biomes: ['crypt', 'sunkenTemple', 'frostvault', 'darkForest', 'desertTomb', 'tundra'],
  visual: { body: 'armored', palette: STEEL, ornate: 0.7, eyes: 2, glow: 0x4080ff },
});

mon({
  id: 'grave_titan', name: tr('Bone Colossus'), family: 'undead', role: 'brute',
  minDepth: 16, weight: 3, lifeMul: 4.5, damageMul: 2.0, scale: 2.3, speed: 2.0,
  abilities: ['ground_slam', 'shatter_death'],
  resists: { poison: 70, physical: 35 },
  biomes: ['crypt', 'sunkenTemple', 'ashwaste', 'desertTomb', 'tundra', 'hell'],
  visual: { body: 'colossal', palette: OLDBONE, ornate: 0.8, eyes: 4, glow: 0x66ff99 },
});

mon({
  id: 'mortician_lich', name: tr('Mortician Lich'), family: 'undead', role: 'caster',
  minDepth: 20, weight: 3, lifeMul: 1.1, damageMul: 1.5, attackRange: 16,
  abilities: ['raise_dead', 'siphon_soul'],
  resists: { poison: 100, cold: 50, arcane: 40, physical: 20 },
  biomes: ['crypt', 'voidspire', 'sunkenTemple', 'desertTomb'],
  visual: { body: 'humanoid', palette: SHROUD, ornate: 0.75, eyes: 2, glow: 0x60ffb0 },
});

mon({
  id: 'barrow_shade', name: tr('Barrow Shade'), family: 'undead', role: 'ambusher',
  minDepth: 14, weight: 6, speed: 4.4, damageMul: 1.7, damageType: 'arcane',
  abilities: ['stealth', 'teleport_strike'],
  resists: { physical: 60, poison: 100, arcane: 30 },
  biomes: ['crypt', 'voidspire', 'darkForest', 'desertTomb'],
  visual: { body: 'wraith', palette: VOID, ornate: 0.4, wings: true, eyes: 3, glow: 0xc060ff },
});

mon({
  id: 'sepulcher_choir', name: tr('Sepulcher Choir'), family: 'undead', role: 'support',
  minDepth: 18, weight: 3, attackRange: 12,
  abilities: ['shield_ally', 'resurrect_ally'],
  resists: { poison: 80, cold: 40 },
  biomes: ['crypt', 'sunkenTemple', 'desertTomb'],
  visual: { body: 'wraith', palette: CLOTH, ornate: 0.5, wings: true, eyes: 6, glow: 0xffe0a0 },
});

// ===========================================================================
// DEMON — the ashwaste / voidspire line. Fast, aggressive, they punish greed.
// ===========================================================================

mon({
  id: 'imp_scamperer', name: tr('Scampering Imp'), family: 'demon', role: 'swarm',
  minDepth: 3, weight: 14, speed: 5.0, scale: 0.6, damageType: 'fire',
  abilities: ['basic_strike'],
  resists: { fire: 60, cold: -25 },
  biomes: ['ashwaste', 'foundry', 'voidspire', 'caverns', 'tundra', 'hell'],
  visual: { body: 'humanoid', palette: EMBER, ornate: 0.5, tail: true, wings: true, eyes: 2, glow: 0xff7a22 },
});

mon({
  id: 'fleshripper', name: tr('Fleshripper'), family: 'demon', role: 'melee',
  minDepth: 5, weight: 11, speed: 3.6, damageMul: 1.2, attackSpeed: 1.35,
  abilities: ['basic_strike'],
  resists: { fire: 40, poison: 25 },
  biomes: ['ashwaste', 'voidspire', 'caverns', 'tundra', 'hell'],
  visual: { body: 'humanoid', palette: CRIMSON, ornate: 0.65, tail: true, eyes: 2, glow: 0xff3020 },
});

mon({
  id: 'hellhound', name: tr('Hellhound'), family: 'demon', role: 'melee',
  minDepth: 7, weight: 9, speed: 4.2, damageType: 'fire', scale: 1.05,
  abilities: ['basic_strike', 'molten_trail'],
  resists: { fire: 85, cold: -30 },
  biomes: ['ashwaste', 'foundry', 'voidspire', 'hell'],
  visual: { body: 'quadruped', palette: EMBER, ornate: 0.6, tail: true, eyes: 2, glow: 0xff5010 },
});

mon({
  id: 'infernal_archer', name: tr('Cinder Archer'), family: 'demon', role: 'ranged',
  minDepth: 8, weight: 7, damageType: 'fire', attackRange: 15,
  abilities: ['bomb_lob'],
  resists: { fire: 70, cold: -20 },
  biomes: ['ashwaste', 'foundry', 'hell'],
  visual: { body: 'humanoid', palette: EMBER, ornate: 0.55, tail: true, eyes: 2, glow: 0xffaa30 },
});

mon({
  id: 'pit_brute', name: tr('Pit Brute'), family: 'demon', role: 'brute',
  minDepth: 9, weight: 5, lifeMul: 3.0, scale: 1.75, damageMul: 1.7,
  abilities: ['heavy_slam'],
  resists: { fire: 60, physical: 25, cold: -25 },
  biomes: ['ashwaste', 'foundry', 'voidspire', 'hell'],
  visual: { body: 'colossal', palette: CRIMSON, ornate: 0.8, tail: true, eyes: 2, glow: 0xff4020 },
});

mon({
  id: 'succubus_lash', name: tr('Lash Temptress'), family: 'demon', role: 'caster',
  minDepth: 11, weight: 5, attackRange: 12, damageType: 'arcane',
  abilities: ['mind_lash'],
  resists: { fire: 40, arcane: 50 },
  biomes: ['ashwaste', 'voidspire', 'hell'],
  visual: { body: 'winged', palette: CRIMSON, ornate: 0.6, wings: true, tail: true, eyes: 2, glow: 0xff40a0 },
});

mon({
  id: 'void_stalker', name: tr('Void Stalker'), family: 'demon', role: 'ambusher',
  minDepth: 13, weight: 6, speed: 4.3, damageMul: 1.7, damageType: 'arcane',
  abilities: ['stealth', 'teleport_strike'],
  resists: { arcane: 60, physical: 25 },
  biomes: ['voidspire', 'ashwaste', 'hell'],
  visual: { body: 'humanoid', palette: VOID, ornate: 0.65, tail: true, eyes: 4, glow: 0xc060ff },
});

mon({
  id: 'ember_fiend', name: tr('Ember Fiend'), family: 'demon', role: 'ranged',
  minDepth: 12, weight: 7, damageType: 'fire', attackRange: 14,
  abilities: ['fire_bolt', 'molten_trail'],
  resists: { fire: 95, cold: -40 },
  biomes: ['ashwaste', 'foundry', 'hell'],
  visual: { body: 'humanoid', palette: EMBER, ornate: 0.7, wings: true, eyes: 3, glow: 0xff6600 },
});

mon({
  id: 'soulbinder', name: tr('Soulbinder'), family: 'demon', role: 'support',
  minDepth: 15, weight: 4, attackRange: 13,
  abilities: ['summon_imps', 'shield_ally'],
  resists: { fire: 50, arcane: 45 },
  biomes: ['ashwaste', 'voidspire', 'hell'],
  visual: { body: 'humanoid', palette: VOID, ornate: 0.7, wings: true, eyes: 6, glow: 0xa040ff },
});

mon({
  id: 'chaos_maw', name: tr('Chaos Maw'), family: 'demon', role: 'brute',
  minDepth: 18, weight: 4, lifeMul: 3.4, scale: 1.9, damageMul: 1.9, speed: 2.6,
  abilities: ['cone_breath_void', 'quake_stomp'],
  resists: { arcane: 60, fire: 45, physical: 30 },
  biomes: ['voidspire', 'ashwaste', 'hell'],
  visual: { body: 'colossal', palette: VOID, ornate: 0.9, tail: true, eyes: 6, glow: 0xd040ff },
});

mon({
  id: 'balor_lieutenant', name: tr('Balor Lieutenant'), family: 'demon', role: 'brute',
  minDepth: 22, weight: 3, lifeMul: 3.8, scale: 2.0, damageMul: 2.1, damageType: 'fire',
  abilities: ['meteor', 'charge'],
  resists: { fire: 90, physical: 35, cold: -25 },
  biomes: ['ashwaste', 'foundry', 'voidspire', 'hell'],
  visual: { body: 'colossal', palette: EMBER, ornate: 1.0, wings: true, tail: true, eyes: 2, glow: 0xff3000 },
});

mon({
  id: 'sin_eater', name: tr('Sin Eater'), family: 'demon', role: 'melee',
  minDepth: 20, weight: 6, lifeMul: 1.6, damageMul: 1.5, speed: 3.2,
  abilities: ['flesh_hooks', 'execute_low'],
  resists: { arcane: 40, poison: 40 },
  biomes: ['voidspire', 'ashwaste', 'hell'],
  visual: { body: 'humanoid', palette: CRIMSON, ornate: 0.85, limbs: 4, eyes: 5, glow: 0xff2060 },
});

mon({
  id: 'brimstone_hulk', name: tr('Brimstone Hulk'), family: 'demon', role: 'brute',
  minDepth: 26, weight: 3, lifeMul: 4.2, scale: 2.1, damageType: 'fire', damageMul: 2.2,
  abilities: ['ground_slam', 'molten_trail', 'death_explode'],
  resists: { fire: 100, physical: 35, cold: -40 },
  biomes: ['foundry', 'ashwaste', 'hell'],
  visual: { body: 'colossal', palette: EMBER, ornate: 0.95, eyes: 4, glow: 0xffaa00 },
});

// ===========================================================================
// BEAST — the caverns line. Fast, pack-minded, and they flee when broken.
// ===========================================================================

mon({
  id: 'dire_rat', name: tr('Dire Rat'), family: 'beast', role: 'swarm',
  minDepth: 1, weight: 16, speed: 4.6, scale: 0.5,
  abilities: ['basic_strike'],
  biomes: ['crypt', 'caverns', 'hive', 'darkForest', 'swamp', 'desert', 'desertTomb'],
  visual: { body: 'quadruped', palette: FLESH, ornate: 0.2, tail: true, eyes: 2, glow: 0xff6060 },
});

mon({
  id: 'cave_bat', name: tr('Shriekbat'), family: 'beast', role: 'swarm',
  minDepth: 2, weight: 14, speed: 5.4, scale: 0.5,
  abilities: ['basic_strike'],
  biomes: ['caverns', 'crypt', 'hive', 'darkForest', 'desertTomb'],
  visual: { body: 'winged', palette: FLESH, ornate: 0.3, wings: true, eyes: 2, glow: 0xffcc44 },
});

mon({
  id: 'gorge_wolf', name: tr('Gorge Wolf'), family: 'beast', role: 'melee',
  minDepth: 2, weight: 12, speed: 4.1, damageMul: 1.05,
  abilities: ['basic_strike'],
  biomes: ['caverns', 'ashwaste', 'frostvault', 'darkForest', 'desert', 'tundra'],
  visual: { body: 'quadruped', palette: FLESH, ornate: 0.35, tail: true, eyes: 2, glow: 0xffdd44 },
});

mon({
  id: 'pack_alpha', name: tr('Pack Alpha'), family: 'beast', role: 'support',
  minDepth: 5, weight: 4, lifeMul: 1.6, scale: 1.25, speed: 3.8, attackRange: 2.4,
  abilities: ['rally_pack'],
  biomes: ['caverns', 'ashwaste', 'frostvault', 'darkForest', 'desert', 'tundra'],
  visual: { body: 'quadruped', palette: FLESH, ornate: 0.6, tail: true, eyes: 2, glow: 0xff8822 },
});

mon({
  id: 'crag_bear', name: tr('Crag Bear'), family: 'beast', role: 'brute',
  minDepth: 6, weight: 5, lifeMul: 2.8, scale: 1.6,
  abilities: ['heavy_slam'],
  resists: { physical: 20, cold: 25 },
  biomes: ['caverns', 'frostvault', 'darkForest', 'tundra'],
  visual: { body: 'quadruped', palette: BARK, ornate: 0.5, tail: true, eyes: 2, glow: 0xffaa44 },
});

mon({
  id: 'saber_prowler', name: tr('Saber Prowler'), family: 'beast', role: 'ambusher',
  minDepth: 8, weight: 7, speed: 4.5, damageMul: 1.6,
  abilities: ['stealth'],
  biomes: ['caverns', 'ashwaste', 'darkForest', 'desert', 'tundra'],
  visual: { body: 'quadruped', palette: FLESH, ornate: 0.55, tail: true, eyes: 2, glow: 0x66ff88 },
});

mon({
  id: 'harpy_screecher', name: tr('Harpy Screecher'), family: 'beast', role: 'ranged',
  minDepth: 7, weight: 7, speed: 4.0, attackRange: 11,
  abilities: ['quill_burst'],
  biomes: ['caverns', 'ashwaste', 'voidspire', 'darkForest', 'desert', 'tundra'],
  visual: { body: 'winged', palette: FLESH, ornate: 0.5, wings: true, tail: true, eyes: 2, glow: 0xffdd66 },
});

mon({
  id: 'basilisk', name: tr('Basilisk'), family: 'beast', role: 'caster',
  minDepth: 12, weight: 5, lifeMul: 1.2, scale: 1.3, attackRange: 13, speed: 2.4,
  abilities: ['petrify_gaze'],
  resists: { poison: 70, physical: 20 },
  biomes: ['caverns', 'sunkenTemple', 'hive', 'swamp', 'desert'],
  visual: { body: 'serpent', palette: CHITIN, ornate: 0.6, eyes: 2, glow: 0xd8d060 },
});

mon({
  id: 'gulper_frog', name: tr('Gulper'), family: 'beast', role: 'ambusher',
  minDepth: 4, weight: 8, speed: 3.2, lifeMul: 1.1, damageMul: 1.3,
  abilities: ['grapple_pull'],
  resists: { poison: 50 },
  biomes: ['caverns', 'sunkenTemple', 'hive', 'swamp'],
  visual: { body: 'quadruped', palette: MOSS, ornate: 0.3, eyes: 2, glow: 0xaaff66 },
});

mon({
  id: 'tunnel_worm', name: tr('Tunnel Worm'), family: 'beast', role: 'brute',
  minDepth: 10, weight: 5, lifeMul: 2.6, scale: 1.7, speed: 2.2,
  abilities: ['burrow_emerge'],
  resists: { physical: 30, poison: 45 },
  biomes: ['caverns', 'hive', 'ashwaste', 'swamp', 'desert'],
  visual: { body: 'serpent', palette: FLESH, ornate: 0.45, tail: true, eyes: 0, glow: 0xff8888 },
});

mon({
  id: 'wyvern_whelp', name: tr('Wyvern Whelp'), family: 'beast', role: 'melee',
  minDepth: 14, weight: 6, speed: 4.0, scale: 1.25, damageType: 'poison',
  abilities: ['tail_sweep'],
  resists: { poison: 70 },
  biomes: ['caverns', 'ashwaste', 'hive', 'darkForest', 'desert', 'tundra'],
  visual: { body: 'winged', palette: CHITIN, ornate: 0.7, wings: true, tail: true, eyes: 2, glow: 0x88ff44 },
});

mon({
  id: 'rime_stag', name: tr('Rime Stag'), family: 'beast', role: 'brute',
  minDepth: 16, weight: 4, lifeMul: 2.4, scale: 1.65, speed: 3.4, damageType: 'cold',
  abilities: ['gore_charge', 'shatter_death'],
  resists: { cold: 90, fire: -30 },
  biomes: ['frostvault', 'caverns', 'tundra'],
  visual: { body: 'quadruped', palette: RIME, ornate: 0.85, tail: true, eyes: 2, glow: 0x88ddff },
});

mon({
  id: 'ashen_lion', name: tr('Ashen Lion'), family: 'beast', role: 'melee',
  minDepth: 19, weight: 6, speed: 4.4, damageMul: 1.4, scale: 1.3, damageType: 'fire',
  abilities: ['basic_strike'],
  resists: { fire: 70 },
  biomes: ['ashwaste', 'foundry', 'desert', 'hell'],
  visual: { body: 'quadruped', palette: EMBER, ornate: 0.75, tail: true, eyes: 2, glow: 0xff9944 },
});

mon({
  id: 'chasm_leviathan', name: tr('Chasm Leviathan'), family: 'beast', role: 'brute',
  minDepth: 24, weight: 3, lifeMul: 4.6, scale: 2.4, speed: 2.0,
  abilities: ['burrow_emerge', 'quake_stomp'],
  resists: { physical: 40, poison: 60 },
  biomes: ['caverns', 'hive', 'ashwaste', 'desert'],
  visual: { body: 'serpent', palette: CHITIN, ornate: 0.95, tail: true, eyes: 6, glow: 0x66ff99 },
});

// ===========================================================================
// CONSTRUCT — the foundry line. Slow, armoured, and they repair each other.
// ===========================================================================

mon({
  id: 'scarab_drone', name: tr('Clockwork Scarab'), family: 'construct', role: 'swarm',
  minDepth: 4, weight: 13, speed: 4.4, scale: 0.55,
  abilities: ['basic_strike', 'shatter_death'],
  resists: { physical: 25, poison: 100, lightning: -40 },
  biomes: ['foundry', 'sunkenTemple', 'desert', 'desertTomb'],
  visual: { body: 'insectoid', palette: BRASS, ornate: 0.4, limbs: 6, eyes: 2, glow: 0x66ffcc },
});

mon({
  id: 'animated_armor', name: tr('Animate Armour'), family: 'construct', role: 'melee',
  minDepth: 5, weight: 10, lifeMul: 1.3, defenseMul: 1.5, speed: 2.6,
  abilities: ['basic_strike'],
  resists: { physical: 35, poison: 100, cold: 30, lightning: -30 },
  biomes: ['foundry', 'crypt', 'sunkenTemple', 'desertTomb'],
  visual: { body: 'armored', palette: IRON, ornate: 0.6, eyes: 2, glow: 0x66aaff },
});

mon({
  id: 'clockwork_sentry', name: tr('Clockwork Sentry'), family: 'construct', role: 'ranged',
  minDepth: 6, weight: 8, speed: 2.2, attackRange: 16, lifeMul: 0.9,
  abilities: ['crossbow_bolt'],
  resists: { physical: 25, poison: 100, lightning: -35 },
  biomes: ['foundry', 'sunkenTemple', 'desertTomb'],
  visual: { body: 'humanoid', palette: BRASS, ornate: 0.5, eyes: 1, glow: 0xffcc44 },
});

mon({
  id: 'arc_pylon', name: tr('Arc Pylon'), family: 'construct', role: 'caster',
  minDepth: 9, weight: 6, speed: 1.6, attackRange: 14, damageType: 'lightning',
  abilities: ['shock_bolt', 'chain_lightning'],
  resists: { lightning: 100, physical: 25, poison: 100, cold: -25 },
  biomes: ['foundry', 'voidspire', 'desertTomb'],
  visual: { body: 'floating', palette: STEEL, ornate: 0.6, eyes: 1, glow: 0xffe066 },
});

mon({
  id: 'iron_golem', name: tr('Iron Golem'), family: 'construct', role: 'brute',
  minDepth: 11, weight: 5, lifeMul: 3.4, defenseMul: 2.0, scale: 1.8, speed: 1.9,
  abilities: ['ground_slam'],
  resists: { physical: 45, poison: 100, cold: 35, lightning: -35 },
  biomes: ['foundry', 'sunkenTemple', 'desertTomb'],
  visual: { body: 'colossal', palette: IRON, ornate: 0.7, eyes: 2, glow: 0xff6622 },
});

mon({
  id: 'forge_smith', name: tr('Forge Smith'), family: 'construct', role: 'support',
  minDepth: 12, weight: 4, attackRange: 10, speed: 2.4,
  abilities: ['repair_construct'],
  resists: { fire: 80, poison: 100, physical: 20 },
  biomes: ['foundry'],
  visual: { body: 'humanoid', palette: RUST, ornate: 0.65, limbs: 4, eyes: 2, glow: 0xff8822 },
});

mon({
  id: 'brass_stalker', name: tr('Brass Stalker'), family: 'construct', role: 'ambusher',
  minDepth: 13, weight: 6, speed: 4.2, damageMul: 1.6,
  abilities: ['stealth'],
  resists: { physical: 30, poison: 100, lightning: -30 },
  biomes: ['foundry', 'voidspire'],
  visual: { body: 'arachnid', palette: BRASS, ornate: 0.55, limbs: 8, eyes: 4, glow: 0x66ffdd },
});

mon({
  id: 'siege_automaton', name: tr('Siege Automaton'), family: 'construct', role: 'ranged',
  minDepth: 17, weight: 4, lifeMul: 1.8, speed: 1.7, attackRange: 22, scale: 1.5,
  abilities: ['ballista_bolt', 'bomb_lob'],
  resists: { physical: 40, poison: 100, lightning: -40 },
  biomes: ['foundry', 'sunkenTemple'],
  visual: { body: 'colossal', palette: RUST, ornate: 0.7, eyes: 3, glow: 0xff9922 },
});

mon({
  id: 'rune_guardian', name: tr('Rune Guardian'), family: 'construct', role: 'support',
  minDepth: 15, weight: 4, lifeMul: 1.4, attackRange: 12, damageType: 'arcane',
  abilities: ['shield_ally', 'arcane_nova'],
  resists: { arcane: 60, poison: 100, physical: 30 },
  biomes: ['sunkenTemple', 'voidspire', 'foundry', 'desertTomb'],
  visual: { body: 'floating', palette: STONE, ornate: 0.7, eyes: 1, glow: 0x60ffee },
});

mon({
  id: 'arcane_sentry_totem', name: tr('Arcane Sentry'), family: 'construct', role: 'ranged',
  minDepth: 15, weight: 0, lifeMul: 0.35, speed: 0, attackRange: 16, scale: 0.8, xpMul: 0.2,
  damageType: 'arcane',
  abilities: ['arcane_sentry'],
  resists: { physical: 30, poison: 100 },
  visual: { body: 'floating', palette: STONE, ornate: 0.4, eyes: 1, glow: 0xc060ff },
});

mon({
  id: 'colossus_frame', name: tr('Colossus Frame'), family: 'construct', role: 'brute',
  minDepth: 21, weight: 3, lifeMul: 4.4, defenseMul: 2.3, scale: 2.2, speed: 1.8,
  abilities: ['quake_stomp', 'death_explode'],
  resists: { physical: 50, poison: 100, cold: 40, lightning: -45 },
  biomes: ['foundry', 'sunkenTemple'],
  visual: { body: 'colossal', palette: IRON, ornate: 0.85, eyes: 4, glow: 0xffaa22 },
});

mon({
  id: 'mercury_construct', name: tr('Quicksilver Construct'), family: 'construct', role: 'melee',
  minDepth: 23, weight: 6, speed: 4.0, lifeMul: 1.5, damageMul: 1.4,
  abilities: ['split_self'],
  resists: { physical: 40, poison: 100, fire: 40 },
  biomes: ['foundry', 'voidspire'],
  visual: { body: 'humanoid', palette: STEEL, ornate: 0.4, eyes: 0, glow: 0xccddff },
});

mon({
  id: 'obsidian_warden', name: tr('Obsidian Warden'), family: 'construct', role: 'brute',
  minDepth: 27, weight: 3, lifeMul: 4.0, defenseMul: 2.4, scale: 2.0, damageType: 'fire',
  abilities: ['flame_wave', 'shield_self', 'molten_trail'],
  resists: { fire: 95, physical: 50, poison: 100 },
  biomes: ['foundry', 'ashwaste', 'voidspire', 'hell'],
  visual: { body: 'colossal', palette: BASALT, ornate: 0.9, eyes: 4, glow: 0xff5500 },
});

// ===========================================================================
// INSECT — the hive line. Swarms, spits, and a queen that keeps making more.
// ===========================================================================

mon({
  id: 'hive_drone', name: tr('Hive Drone'), family: 'insect', role: 'swarm',
  minDepth: 3, weight: 16, speed: 4.5, scale: 0.6,
  abilities: ['basic_strike'],
  resists: { poison: 60 },
  biomes: ['hive', 'caverns', 'sunkenTemple', 'swamp'],
  visual: { body: 'insectoid', palette: CHITIN, ornate: 0.4, limbs: 6, eyes: 4, glow: 0x99ff33 },
});

mon({
  id: 'hornet_swarmer', name: tr('Blade Hornet'), family: 'insect', role: 'swarm',
  minDepth: 6, weight: 13, speed: 5.6, scale: 0.55, damageType: 'poison',
  abilities: ['basic_strike'],
  resists: { poison: 80 },
  biomes: ['hive', 'caverns', 'swamp', 'desert'],
  visual: { body: 'insectoid', palette: BRASS, ornate: 0.5, limbs: 6, wings: true, tail: true, eyes: 4, glow: 0xffdd33 },
});

mon({
  id: 'spitter_beetle', name: tr('Spitter Beetle'), family: 'insect', role: 'ranged',
  minDepth: 4, weight: 9, damageType: 'poison', attackRange: 12, speed: 2.6,
  abilities: ['acid_spit'],
  resists: { poison: 90, physical: 20 },
  biomes: ['hive', 'caverns', 'sunkenTemple', 'swamp', 'desert'],
  visual: { body: 'insectoid', palette: CHITIN, ornate: 0.5, limbs: 6, eyes: 4, glow: 0x9ce03a },
});

mon({
  id: 'lance_mantis', name: tr('Lance Mantis'), family: 'insect', role: 'melee',
  minDepth: 8, weight: 10, speed: 3.8, damageMul: 1.25, attackRange: 3.0,
  abilities: ['impale'],
  resists: { poison: 50 },
  biomes: ['hive', 'caverns', 'desert'],
  visual: { body: 'insectoid', palette: MOSS, ornate: 0.65, limbs: 6, eyes: 4, glow: 0x66ff66 },
});

mon({
  id: 'burrow_tick', name: tr('Burrow Tick'), family: 'insect', role: 'ambusher',
  minDepth: 7, weight: 8, speed: 3.4, damageMul: 1.5, damageType: 'poison',
  abilities: ['burrow_emerge'],
  resists: { poison: 90, physical: 25 },
  biomes: ['hive', 'caverns', 'ashwaste', 'darkForest', 'swamp', 'desert', 'desertTomb'],
  visual: { body: 'arachnid', palette: FLESH, ornate: 0.45, limbs: 8, eyes: 6, glow: 0xff5555 },
});

mon({
  id: 'web_spinner', name: tr('Web Spinner'), family: 'insect', role: 'ranged',
  minDepth: 5, weight: 9, attackRange: 13, speed: 3.4,
  abilities: ['acid_spit', 'web_snare'],
  resists: { poison: 70 },
  biomes: ['hive', 'caverns', 'crypt', 'darkForest', 'desertTomb'],
  visual: { body: 'arachnid', palette: CHITIN, ornate: 0.4, limbs: 8, eyes: 8, glow: 0xccffaa },
});

mon({
  id: 'carapace_warden', name: tr('Carapace Warden'), family: 'insect', role: 'brute',
  minDepth: 12, weight: 5, lifeMul: 3.0, defenseMul: 1.8, scale: 1.7,
  abilities: ['heavy_slam'],
  resists: { physical: 40, poison: 90 },
  biomes: ['hive', 'caverns', 'desert', 'desertTomb'],
  visual: { body: 'insectoid', palette: CHITIN, ornate: 0.8, limbs: 6, eyes: 6, glow: 0x77ff44 },
});

mon({
  id: 'hive_nurse', name: tr('Hive Nurse'), family: 'insect', role: 'support',
  minDepth: 10, weight: 4, attackRange: 10,
  abilities: ['summon_swarm'],
  resists: { poison: 90 },
  biomes: ['hive'],
  visual: { body: 'insectoid', palette: PALE, ornate: 0.55, limbs: 6, wings: true, eyes: 6, glow: 0xffee88 },
});

mon({
  id: 'venom_wasp', name: tr('Venom Wasp'), family: 'insect', role: 'ranged',
  minDepth: 11, weight: 8, speed: 4.4, damageType: 'poison', attackRange: 12,
  abilities: ['acid_spit'],
  resists: { poison: 100 },
  biomes: ['hive', 'caverns', 'sunkenTemple', 'swamp', 'desert'],
  visual: { body: 'insectoid', palette: EMBER, ornate: 0.6, limbs: 6, wings: true, tail: true, eyes: 4, glow: 0xffaa22 },
});

mon({
  id: 'chitin_reaver', name: tr('Chitin Reaver'), family: 'insect', role: 'melee',
  minDepth: 15, weight: 9, speed: 3.9, damageMul: 1.4, attackSpeed: 1.3,
  abilities: ['basic_strike'],
  resists: { physical: 30, poison: 80 },
  biomes: ['hive', 'caverns', 'voidspire'],
  visual: { body: 'insectoid', palette: BASALT, ornate: 0.85, limbs: 6, eyes: 6, glow: 0xff4488 },
});

mon({
  id: 'acid_larva', name: tr('Acid Larva'), family: 'insect', role: 'swarm',
  minDepth: 9, weight: 11, speed: 3.6, scale: 0.65, damageType: 'poison',
  abilities: ['basic_strike', 'plague_death'],
  resists: { poison: 100 },
  biomes: ['hive', 'caverns', 'swamp'],
  visual: { body: 'serpent', palette: ROT, ornate: 0.25, eyes: 2, glow: 0xaaff33 },
});

mon({
  id: 'royal_guard_beetle', name: tr('Royal Guard'), family: 'insect', role: 'brute',
  minDepth: 19, weight: 4, lifeMul: 3.4, defenseMul: 2.0, scale: 1.85,
  abilities: ['charge', 'quake_stomp'],
  resists: { physical: 45, poison: 95 },
  biomes: ['hive'],
  visual: { body: 'insectoid', palette: BRASS, ornate: 0.95, limbs: 6, eyes: 6, glow: 0xffcc22 },
});

mon({
  id: 'broodmother_spawn', name: tr('Broodmother Spawn'), family: 'insect', role: 'support',
  minDepth: 21, weight: 3, lifeMul: 1.8, scale: 1.4, attackRange: 11,
  abilities: ['summon_swarm', 'web_snare'],
  resists: { poison: 100, physical: 30 },
  biomes: ['hive', 'caverns'],
  visual: { body: 'arachnid', palette: CRIMSON, ornate: 0.8, limbs: 8, eyes: 8, glow: 0xff5599 },
});

// ===========================================================================
// ABERRATION — the voidspire line. They break the rules the other families obey.
// ===========================================================================

mon({
  id: 'whisper_wisp', name: tr('Whispering Mote'), family: 'aberration', role: 'swarm',
  minDepth: 8, weight: 12, speed: 4.0, scale: 0.65, damageType: 'arcane',
  abilities: ['basic_strike'],
  resists: { physical: 40, arcane: 50 },
  biomes: ['voidspire', 'sunkenTemple'],
  visual: { body: 'swarm', palette: VOID, ornate: 0.5, eyes: 2, glow: 0xc060ff },
});

mon({
  id: 'watcher_eye', name: tr('Watcher'), family: 'aberration', role: 'ranged',
  minDepth: 9, weight: 8, speed: 2.6, attackRange: 16, damageType: 'arcane',
  abilities: ['gaze_beam'],
  resists: { arcane: 60, physical: 25 },
  biomes: ['voidspire', 'sunkenTemple', 'crypt', 'swamp', 'desertTomb'],
  visual: { body: 'floating', palette: VOID, ornate: 0.4, eyes: 1, glow: 0xff60c0 },
});

mon({
  id: 'gazer_tyrant', name: tr('Gazer Tyrant'), family: 'aberration', role: 'caster',
  minDepth: 18, weight: 4, lifeMul: 1.4, speed: 2.2, attackRange: 17, damageType: 'arcane', scale: 1.4,
  abilities: ['petrify_gaze', 'mirror_images'],
  resists: { arcane: 70, physical: 30 },
  biomes: ['voidspire', 'sunkenTemple'],
  visual: { body: 'floating', palette: VOID, ornate: 0.85, eyes: 9, glow: 0xff40e0 },
});

mon({
  id: 'thought_eater', name: tr('Thought Eater'), family: 'aberration', role: 'caster',
  minDepth: 13, weight: 5, attackRange: 14, damageType: 'arcane',
  abilities: ['mind_lash'],
  resists: { arcane: 65, poison: 30 },
  biomes: ['voidspire', 'sunkenTemple'],
  visual: { body: 'humanoid', palette: VOID, ornate: 0.7, limbs: 6, eyes: 4, glow: 0xa040ff },
});

mon({
  id: 'tentacle_horror', name: tr('Tentacle Horror'), family: 'aberration', role: 'brute',
  minDepth: 16, weight: 4, lifeMul: 3.2, scale: 1.9, speed: 2.2,
  abilities: ['tentacle_grasp', 'flesh_hooks'],
  resists: { physical: 35, arcane: 40, poison: 40 },
  biomes: ['voidspire', 'sunkenTemple', 'hive', 'swamp'],
  visual: { body: 'ooze', palette: CRIMSON, ornate: 0.9, eyes: 7, glow: 0xff3080 },
});

mon({
  id: 'null_walker', name: tr('Null Walker'), family: 'aberration', role: 'ambusher',
  minDepth: 17, weight: 6, speed: 4.0, damageMul: 1.8, damageType: 'arcane',
  abilities: ['teleport_strike', 'phase_shift'],
  resists: { physical: 55, arcane: 55 },
  biomes: ['voidspire'],
  visual: { body: 'humanoid', palette: BASALT, ornate: 0.5, eyes: 0, glow: 0x8040ff },
});

mon({
  id: 'flesh_amalgam', name: tr('Flesh Amalgam'), family: 'aberration', role: 'brute',
  minDepth: 14, weight: 5, lifeMul: 3.6, scale: 1.75, speed: 2.0,
  abilities: ['heavy_slam', 'heal_self'],
  resists: { physical: 30, poison: 60, cold: 25 },
  biomes: ['voidspire', 'crypt', 'hive', 'swamp', 'desertTomb'],
  visual: { body: 'ooze', palette: FLESH, ornate: 0.85, limbs: 6, eyes: 9, glow: 0xff6666 },
});

mon({
  id: 'dimensional_lurker', name: tr('Dimensional Lurker'), family: 'aberration', role: 'ambusher',
  minDepth: 22, weight: 5, speed: 4.2, damageMul: 2.0, damageType: 'arcane',
  abilities: ['teleport_strike', 'void_rift'],
  resists: { physical: 60, arcane: 60 },
  biomes: ['voidspire'],
  visual: { body: 'winged', palette: VOID, ornate: 0.8, wings: true, tail: true, eyes: 5, glow: 0xd060ff },
});

mon({
  id: 'star_spawn', name: tr('Star Spawn'), family: 'aberration', role: 'caster',
  minDepth: 25, weight: 3, lifeMul: 1.5, damageMul: 1.6, attackRange: 18, damageType: 'arcane',
  abilities: ['void_rift', 'summon_adds'],
  resists: { arcane: 75, cold: 40, physical: 30 },
  biomes: ['voidspire'],
  visual: { body: 'colossal', palette: VOID, ornate: 1.0, limbs: 6, wings: true, eyes: 9, glow: 0xff00ff },
});

mon({
  id: 'mirror_image', name: tr('Mirror Image'), family: 'aberration', role: 'melee',
  minDepth: 1, weight: 0, lifeMul: 0.25, damageMul: 0.5, xpMul: 0, speed: 3.6,
  abilities: ['basic_strike'],
  resists: { physical: -50 },
  visual: { body: 'humanoid', palette: RIME, ornate: 0.3, eyes: 2, glow: 0x80c0ff },
});

// ---------------------------------------------------------------------------
// Room objects: what a boss room's rule is built around (entities/RoomRules).
// They stand still, never fight, and pay nothing when broken.
// ---------------------------------------------------------------------------

const roomObject = (id: string, name: string, lifeMul: number, scale: number, palette: string, glow: number): MonsterDef =>
  mon({
    id, name, family: 'construct', role: 'support', object: true,
    minDepth: 1, weight: 0, lifeMul, damageMul: 0, defenseMul: 0.6, speed: 0, attackRange: 30, scale, xpMul: 0,
    abilities: [],
    resists: { poison: 100 },
    visual: { body: 'floating', palette, ornate: 0.3, eyes: 0, glow },
  });

roomObject('ward_portal', tr('Ward Portal'), 1.3, 1.1, STONE, 0x80c8ff);
roomObject('heartstone', tr('Heartstone'), 1.0, 0.9, CRIMSON, 0xff4040);
roomObject('rite_bell', tr('Rite Bell'), 0.35, 0.9, BRASS, 0xffd27a);
roomObject('rite_brazier', tr('Cold Brazier'), 0.3, 0.9, IRON, 0x403830);
roomObject('chain_anchor', tr('Chain Anchor'), 1.6, 1.0, IRON, 0xc0a070);

mon({
  id: 'hero_echo', name: tr('Your Echo'), family: 'aberration', role: 'melee',
  minDepth: 1, weight: 0, lifeMul: 0.9, damageMul: 0.6, xpMul: 0, speed: 3.4, attackRange: 2.2,
  abilities: ['basic_strike', 'double_swipe', 'charge'],
  resists: { physical: 10, arcane: -20 },
  visual: { body: 'humanoid', palette: RIME, ornate: 0.2, eyes: 2, glow: 0xb0e8ff, weapon: 'sword' },
});

// --- Boss partners and the flocks they call (weight 0: never rolled) -----

mon({
  id: 'choir_high_voice', name: tr('The High Voice'), family: 'undead', role: 'support',
  minDepth: 1, weight: 0, lifeMul: 0.8, damageMul: 0.7, xpMul: 0, speed: 2.2, attackRange: 14, damageType: 'arcane',
  abilities: ['heal_ally', 'banshee_wail', 'hex_bolt'],
  resists: { physical: 15, arcane: 25 },
  visual: { body: 'wraith', palette: PALE, ornate: 0.5, eyes: 2, glow: 0xe0f0a0 },
});

mon({
  id: 'sallow_orrin', name: tr('Orrin Sallow'), family: 'humanoid', role: 'caster',
  minDepth: 1, weight: 0, lifeMul: 0.8, damageMul: 0.8, xpMul: 0, speed: 2.8, attackRange: 14, damageType: 'poison',
  abilities: ['poison_spit', 'frost_bolt', 'acid_spit'],
  resists: { poison: 40, cold: 20 },
  visual: { body: 'humanoid', palette: MOSS, ornate: 0.4, eyes: 2, glow: 0x80d0a0, weapon: 'staff' },
});

mon({
  id: 'slag_cantor', name: tr('Slag Cantor'), family: 'elemental', role: 'brute',
  minDepth: 1, weight: 0, lifeMul: 1.0, damageMul: 0.8, xpMul: 0, speed: 2.4, attackRange: 2.6, damageType: 'fire',
  abilities: ['ground_slam', 'lava_pool', 'fire_bolt'],
  resists: { fire: 60, cold: -20 },
  visual: { body: 'golem', palette: EMBER, ornate: 0.5, eyes: 2, glow: 0xff7030 },
});

mon({
  id: 'tallow_sheep', name: tr('Tallow Sheep'), family: 'beast', role: 'swarm',
  minDepth: 1, weight: 0, lifeMul: 0.35, damageMul: 0.5, xpMul: 0.2, speed: 3.6, attackRange: 1.6,
  abilities: ['basic_strike'],
  resists: { fire: -30 },
  visual: { body: 'quadruped', palette: PALE, ornate: 0.1, eyes: 2, glow: 0xffe0a0 },
});

mon({
  id: 'wax_child', name: tr('Wax Child'), family: 'humanoid', role: 'swarm',
  minDepth: 1, weight: 0, lifeMul: 0.3, damageMul: 0.5, xpMul: 0.2, speed: 3.8, attackRange: 1.6,
  abilities: ['basic_strike'],
  resists: { fire: -30, physical: 10 },
  visual: { body: 'humanoid', palette: PALE, ornate: 0.1, eyes: 2, glow: 0xffd080 },
});

mon({
  id: 'unmaker', name: tr('The Unmaker'), family: 'aberration', role: 'caster',
  minDepth: 29, weight: 2, lifeMul: 1.8, damageMul: 1.8, attackRange: 18, damageType: 'arcane',
  abilities: ['death_beam', 'void_rift'],
  resists: { arcane: 80, physical: 40, fire: 40, cold: 40 },
  biomes: ['voidspire'],
  visual: { body: 'floating', palette: VOID, ornate: 1.0, eyes: 9, glow: 0xff20ff },
});

// ===========================================================================
// ELEMENTAL — biome-flavoured. Immune to their own school, weak to the opposite.
// ===========================================================================

mon({
  id: 'ember_wisp', name: tr('Ember Wisp'), family: 'elemental', role: 'swarm',
  minDepth: 4, weight: 12, speed: 4.4, scale: 0.6, damageType: 'fire',
  abilities: ['basic_strike', 'death_explode'],
  resists: { fire: 100, cold: -50, physical: 30 },
  biomes: ['foundry', 'ashwaste', 'caverns', 'desert', 'hell'],
  visual: { body: 'floating', palette: EMBER, ornate: 0.5, eyes: 1, glow: 0xff7722 },
});

mon({
  id: 'fire_elemental', name: tr('Cinder Elemental'), family: 'elemental', role: 'melee',
  minDepth: 8, weight: 9, damageType: 'fire', speed: 3.3,
  abilities: ['basic_strike', 'molten_trail'],
  resists: { fire: 100, cold: -50, physical: 30, poison: 100 },
  biomes: ['foundry', 'ashwaste', 'desert', 'hell'],
  visual: { body: 'humanoid', palette: EMBER, ornate: 0.6, eyes: 2, glow: 0xff5500 },
});

mon({
  id: 'magma_hulk', name: tr('Magma Hulk'), family: 'elemental', role: 'brute',
  minDepth: 15, weight: 4, lifeMul: 3.2, scale: 1.9, damageType: 'fire',
  abilities: ['ground_slam', 'molten_trail', 'death_explode'],
  resists: { fire: 100, cold: -60, physical: 35, poison: 100 },
  biomes: ['foundry', 'ashwaste', 'hell'],
  visual: { body: 'colossal', palette: BASALT, ornate: 0.85, eyes: 4, glow: 0xff6600 },
});

mon({
  id: 'frost_shard', name: tr('Frost Shard'), family: 'elemental', role: 'ranged',
  minDepth: 7, weight: 9, damageType: 'cold', attackRange: 14, speed: 2.8,
  abilities: ['frost_bolt', 'shatter_death'],
  resists: { cold: 100, fire: -50, poison: 100 },
  biomes: ['frostvault', 'caverns', 'sunkenTemple', 'tundra'],
  visual: { body: 'floating', palette: RIME, ornate: 0.7, eyes: 1, glow: 0x88ddff },
});

mon({
  id: 'ice_revenant', name: tr('Ice Revenant'), family: 'elemental', role: 'brute',
  minDepth: 13, weight: 5, lifeMul: 2.8, scale: 1.7, damageType: 'cold',
  abilities: ['ice_nova', 'shatter_death'],
  resists: { cold: 100, fire: -55, physical: 30, poison: 100 },
  biomes: ['frostvault', 'tundra'],
  visual: { body: 'colossal', palette: RIME, ornate: 0.8, eyes: 2, glow: 0x66ccff },
});

mon({
  id: 'lightning_wisp', name: tr('Arc Wisp'), family: 'elemental', role: 'swarm',
  minDepth: 10, weight: 11, speed: 5.6, scale: 0.55, damageType: 'lightning',
  abilities: ['basic_strike'],
  resists: { lightning: 100, poison: 100, physical: 35 },
  biomes: ['foundry', 'voidspire', 'frostvault', 'tundra'],
  visual: { body: 'floating', palette: AZURE, ornate: 0.45, eyes: 1, glow: 0xffee66 },
});

mon({
  id: 'storm_djinn', name: tr('Storm Djinn'), family: 'elemental', role: 'caster',
  minDepth: 16, weight: 5, damageType: 'lightning', attackRange: 15, speed: 3.4,
  abilities: ['shock_bolt', 'lightning_storm'],
  resists: { lightning: 100, poison: 100, physical: 30 },
  biomes: ['foundry', 'voidspire', 'desert', 'desertTomb'],
  visual: { body: 'winged', palette: AZURE, ornate: 0.75, wings: true, eyes: 2, glow: 0xffee66 },
});

mon({
  id: 'living_gale', name: tr('Living Gale'), family: 'elemental', role: 'ambusher',
  minDepth: 12, weight: 6, speed: 5.0, damageMul: 1.3, damageType: 'lightning',
  abilities: ['swarm_dive'],
  resists: { lightning: 80, physical: 50, poison: 100 },
  biomes: ['frostvault', 'voidspire', 'ashwaste', 'desert', 'tundra'],
  visual: { body: 'swarm', palette: RIME, ornate: 0.6, eyes: 2, glow: 0xaaffff },
});

mon({
  id: 'obsidian_elemental', name: tr('Obsidian Elemental'), family: 'elemental', role: 'melee',
  minDepth: 18, weight: 8, lifeMul: 1.6, defenseMul: 1.6, speed: 2.7,
  abilities: ['sunder_armor'],
  resists: { physical: 50, fire: 60, poison: 100 },
  biomes: ['foundry', 'ashwaste', 'voidspire', 'hell'],
  visual: { body: 'humanoid', palette: BASALT, ornate: 0.8, eyes: 3, glow: 0xff4400 },
});

mon({
  id: 'tide_caller', name: tr('Tide Caller'), family: 'elemental', role: 'support',
  minDepth: 14, weight: 4, attackRange: 12, damageType: 'cold',
  abilities: ['frost_bolt', 'heal_ally'],
  resists: { cold: 80, fire: -30, poison: 100 },
  biomes: ['sunkenTemple', 'frostvault', 'swamp'],
  visual: { body: 'floating', palette: AZURE, ornate: 0.65, eyes: 3, glow: 0x40d0ff },
});

mon({
  id: 'void_ember', name: tr('Void Ember'), family: 'elemental', role: 'caster',
  minDepth: 24, weight: 4, damageType: 'arcane', attackRange: 16,
  abilities: ['void_rift', 'homing_bolt'],
  resists: { arcane: 90, fire: 60, poison: 100, physical: 35 },
  biomes: ['voidspire', 'ashwaste', 'hell'],
  visual: { body: 'floating', palette: VOID, ornate: 0.9, eyes: 3, glow: 0xcc44ff },
});

mon({
  id: 'glacier_titan', name: tr('Glacier Titan'), family: 'elemental', role: 'brute',
  minDepth: 26, weight: 3, lifeMul: 4.4, scale: 2.3, damageType: 'cold', speed: 1.9,
  abilities: ['blizzard', 'quake_stomp', 'shatter_death'],
  resists: { cold: 100, fire: -50, physical: 45, poison: 100 },
  biomes: ['frostvault', 'tundra'],
  visual: { body: 'colossal', palette: RIME, ornate: 0.95, eyes: 4, glow: 0x66ddff },
});

// ===========================================================================
// HUMANOID — cultists, bandits, goblins. They fight like people: badly, in groups.
// ===========================================================================

mon({
  id: 'goblin_scrapper', name: tr('Goblin Scrapper'), family: 'humanoid', role: 'swarm',
  minDepth: 1, weight: 15, speed: 4.2, scale: 0.7,
  abilities: ['basic_strike'],
  biomes: ['caverns', 'foundry', 'crypt', 'darkForest', 'desert', 'tundra'],
  visual: { body: 'humanoid', palette: MOSS, ornate: 0.25, eyes: 2, glow: 0xffcc44 },
});

mon({
  id: 'goblin_bomber', name: tr('Goblin Bomber'), family: 'humanoid', role: 'ranged',
  minDepth: 3, weight: 8, damageType: 'fire', attackRange: 12, speed: 3.6,
  abilities: ['bomb_lob', 'death_explode'],
  resists: { fire: 40 },
  biomes: ['caverns', 'foundry', 'darkForest', 'desert', 'tundra', 'swamp'],
  visual: { body: 'humanoid', palette: MOSS, ornate: 0.35, eyes: 2, glow: 0xff8822 },
});

mon({
  id: 'bandit_cutthroat', name: tr('Cutthroat'), family: 'humanoid', role: 'ambusher',
  minDepth: 2, weight: 8, speed: 3.9, damageMul: 1.4,
  abilities: ['basic_strike'],
  biomes: ['caverns', 'crypt', 'ashwaste', 'darkForest', 'desert', 'tundra'],
  visual: { body: 'humanoid', palette: CLOTH, ornate: 0.3, eyes: 2, glow: 0xff4444 },
});

mon({
  id: 'bandit_crossbow', name: tr('Crossbow Bandit'), family: 'humanoid', role: 'ranged',
  minDepth: 3, weight: 8, attackRange: 14,
  abilities: ['crossbow_bolt'],
  biomes: ['caverns', 'crypt', 'ashwaste', 'darkForest', 'desert', 'tundra', 'swamp'],
  visual: { body: 'humanoid', palette: CLOTH, ornate: 0.3, eyes: 2, glow: 0xffaa44 },
});

mon({
  id: 'cultist_zealot', name: tr('Cultist Zealot'), family: 'humanoid', role: 'melee',
  minDepth: 4, weight: 11, speed: 3.4, damageMul: 1.1,
  abilities: ['basic_strike'],
  biomes: ['crypt', 'sunkenTemple', 'voidspire', 'darkForest', 'desertTomb', 'hell'],
  visual: { body: 'humanoid', palette: SHROUD, ornate: 0.4, eyes: 2, glow: 0xff2266 },
});

mon({
  id: 'cultist_acolyte', name: tr('Cultist Acolyte'), family: 'humanoid', role: 'caster',
  minDepth: 4, weight: 7, damageType: 'arcane', attackRange: 13,
  abilities: ['hex_bolt'],
  biomes: ['crypt', 'sunkenTemple', 'voidspire', 'darkForest', 'swamp', 'desertTomb'],
  visual: { body: 'humanoid', palette: SHROUD, ornate: 0.45, eyes: 2, glow: 0xc060ff },
});

mon({
  id: 'dark_priest', name: tr('Dark Priest'), family: 'humanoid', role: 'support',
  minDepth: 8, weight: 5, attackRange: 12,
  abilities: ['heal_ally'],
  resists: { arcane: 35 },
  biomes: ['crypt', 'sunkenTemple', 'voidspire', 'darkForest', 'desertTomb'],
  visual: { body: 'humanoid', palette: SHROUD, ornate: 0.6, eyes: 2, glow: 0x60ffa0 },
});

mon({
  id: 'inquisitor', name: tr('Ashen Inquisitor'), family: 'humanoid', role: 'brute',
  minDepth: 11, weight: 5, lifeMul: 2.4, scale: 1.4, damageType: 'fire',
  abilities: ['flame_wave'],
  resists: { fire: 55, physical: 20 },
  biomes: ['ashwaste', 'foundry', 'sunkenTemple', 'desert'],
  visual: { body: 'armored', palette: STEEL, ornate: 0.7, eyes: 2, glow: 0xffaa22 },
});

mon({
  id: 'troglodyte', name: tr('Troglodyte'), family: 'humanoid', role: 'melee',
  minDepth: 5, weight: 10, lifeMul: 1.2, speed: 3.1, damageType: 'poison',
  abilities: ['basic_strike'],
  resists: { poison: 60 },
  biomes: ['caverns', 'hive', 'sunkenTemple', 'swamp'],
  visual: { body: 'humanoid', palette: MOSS, ornate: 0.4, tail: true, eyes: 2, glow: 0x99cc44 },
});

mon({
  id: 'sunken_zealot', name: tr('Sunken Zealot'), family: 'humanoid', role: 'melee',
  minDepth: 9, weight: 9, speed: 3.0, lifeMul: 1.2, damageType: 'cold',
  abilities: ['impale'],
  resists: { cold: 60, poison: 40 },
  biomes: ['sunkenTemple', 'frostvault', 'tundra'],
  visual: { body: 'humanoid', palette: AZURE, ornate: 0.55, eyes: 4, glow: 0x40c0ff },
});

mon({
  id: 'ashen_marauder', name: tr('Ashen Marauder'), family: 'humanoid', role: 'melee',
  minDepth: 13, weight: 9, speed: 3.5, damageMul: 1.3, attackSpeed: 1.25,
  abilities: ['charge'],
  resists: { fire: 40 },
  biomes: ['ashwaste', 'foundry', 'desert'],
  visual: { body: 'armored', palette: RUST, ornate: 0.6, eyes: 2, glow: 0xff7733 },
});

mon({
  id: 'blood_chanter', name: tr('Blood Chanter'), family: 'humanoid', role: 'support',
  minDepth: 16, weight: 4, attackRange: 12,
  abilities: ['blood_link', 'siphon_soul'],
  resists: { arcane: 40, poison: 30 },
  biomes: ['crypt', 'voidspire', 'ashwaste', 'darkForest', 'hell'],
  visual: { body: 'humanoid', palette: CRIMSON, ornate: 0.7, eyes: 3, glow: 0xff2244 },
});

mon({
  id: 'warlock_apostate', name: tr('Apostate Warlock'), family: 'humanoid', role: 'caster',
  minDepth: 19, weight: 5, damageMul: 1.4, attackRange: 16, damageType: 'fire',
  abilities: ['fire_bolt', 'meteor', 'summon_imps'],
  resists: { fire: 60, arcane: 45 },
  biomes: ['ashwaste', 'voidspire', 'foundry', 'hell'],
  visual: { body: 'humanoid', palette: EMBER, ornate: 0.75, eyes: 2, glow: 0xff5500 },
});

mon({
  id: 'iron_captain', name: tr('Iron Captain'), family: 'humanoid', role: 'brute',
  minDepth: 23, weight: 4, lifeMul: 3.0, defenseMul: 1.9, scale: 1.5,
  abilities: ['battle_cry', 'cleave'],
  resists: { physical: 30, fire: 30 },
  biomes: ['foundry', 'ashwaste', 'crypt', 'desert', 'tundra'],
  visual: { body: 'armored', palette: STEEL, ornate: 0.85, eyes: 2, glow: 0x44aaff },
});

// ===========================================================================
// PLANT — the sunken temple / hive line. Rooted, area-denial, hard to reach.
// ===========================================================================

mon({
  id: 'spore_pod', name: tr('Spore Pod'), family: 'plant', role: 'swarm',
  minDepth: 5, weight: 12, speed: 2.6, scale: 0.65, damageType: 'poison',
  abilities: ['basic_strike', 'plague_death'],
  resists: { poison: 100, physical: 20, fire: -40 },
  biomes: ['sunkenTemple', 'hive', 'caverns', 'darkForest', 'swamp'],
  visual: { body: 'ooze', palette: MOSS, ornate: 0.4, eyes: 3, glow: 0xaaff44 },
});

mon({
  id: 'thorn_creeper', name: tr('Thorn Creeper'), family: 'plant', role: 'melee',
  minDepth: 6, weight: 10, speed: 2.8, attackRange: 4.0,
  abilities: ['thorn_lash'],
  resists: { poison: 90, physical: 25, fire: -45 },
  biomes: ['sunkenTemple', 'caverns', 'hive', 'darkForest', 'swamp'],
  visual: { body: 'serpent', palette: BARK, ornate: 0.65, eyes: 0, glow: 0x88ff44 },
});

mon({
  id: 'strangler_vine', name: tr('Strangler Vine'), family: 'plant', role: 'ambusher',
  minDepth: 8, weight: 7, speed: 0.8, damageMul: 1.8, attackRange: 5.5,
  abilities: ['thorn_lash', 'tentacle_grasp'],
  resists: { poison: 100, physical: 30, fire: -50 },
  biomes: ['sunkenTemple', 'hive', 'darkForest', 'swamp'],
  visual: { body: 'serpent', palette: MOSS, ornate: 0.7, eyes: 0, glow: 0x66dd44 },
});

mon({
  id: 'bloom_cannon', name: tr('Bloom Cannon'), family: 'plant', role: 'ranged',
  minDepth: 10, weight: 7, speed: 0, attackRange: 18, lifeMul: 1.4, damageType: 'poison',
  abilities: ['acid_spit', 'spore_burst'],
  resists: { poison: 100, physical: 30, fire: -50 },
  biomes: ['sunkenTemple', 'hive', 'caverns', 'darkForest', 'swamp'],
  visual: { body: 'floating', palette: MOSS, ornate: 0.6, eyes: 0, glow: 0xccff44 },
});

mon({
  id: 'fungal_shambler', name: tr('Fungal Shambler'), family: 'plant', role: 'melee',
  minDepth: 9, weight: 9, lifeMul: 1.4, speed: 2.4, damageType: 'poison',
  abilities: ['basic_strike'],
  resists: { poison: 100, physical: 25, fire: -45 },
  biomes: ['sunkenTemple', 'hive', 'caverns', 'darkForest', 'swamp'],
  visual: { body: 'humanoid', palette: MOSS, ornate: 0.55, eyes: 5, glow: 0x99ff66 },
});

mon({
  id: 'deathcap_priest', name: tr('Deathcap Priest'), family: 'plant', role: 'support',
  minDepth: 13, weight: 4, attackRange: 11, damageType: 'poison',
  abilities: ['heal_ally'],
  resists: { poison: 100, fire: -40 },
  biomes: ['sunkenTemple', 'hive', 'darkForest'],
  visual: { body: 'humanoid', palette: CRIMSON, ornate: 0.7, eyes: 5, glow: 0xff88cc },
});

mon({
  id: 'blight_flower', name: tr('Blight Flower'), family: 'plant', role: 'caster',
  minDepth: 15, weight: 5, speed: 1.2, attackRange: 15, damageType: 'poison',
  abilities: ['poison_spit'],
  resists: { poison: 100, physical: 25, fire: -50 },
  biomes: ['sunkenTemple', 'hive', 'swamp'],
  visual: { body: 'floating', palette: CRIMSON, ornate: 0.8, eyes: 0, glow: 0xdd44ff },
});

mon({
  id: 'ancient_treant', name: tr('Ancient Treant'), family: 'plant', role: 'brute',
  minDepth: 17, weight: 4, lifeMul: 3.8, defenseMul: 1.9, scale: 2.1, speed: 1.8,
  abilities: ['ground_slam', 'root_snare'],
  resists: { poison: 100, physical: 40, cold: 30, fire: -55 },
  biomes: ['sunkenTemple', 'caverns', 'darkForest'],
  visual: { body: 'colossal', palette: BARK, ornate: 0.85, eyes: 4, glow: 0x66ff88 },
});

mon({
  id: 'root_horror', name: tr('Root Horror'), family: 'plant', role: 'ambusher',
  minDepth: 20, weight: 5, speed: 2.0, damageMul: 1.9, attackRange: 5,
  abilities: ['thorn_lash', 'burrow_emerge'],
  resists: { poison: 100, physical: 35, fire: -50 },
  biomes: ['sunkenTemple', 'caverns', 'hive', 'darkForest', 'swamp'],
  visual: { body: 'ooze', palette: BARK, ornate: 0.9, limbs: 6, eyes: 6, glow: 0x88dd44 },
});

mon({
  id: 'corpse_bloom', name: tr('Corpse Bloom'), family: 'plant', role: 'caster',
  minDepth: 22, weight: 4, attackRange: 16, damageType: 'poison', lifeMul: 1.3,
  abilities: ['corpse_burst', 'summon_swarm'],
  resists: { poison: 100, physical: 30, fire: -50 },
  biomes: ['sunkenTemple', 'hive', 'crypt', 'swamp'],
  visual: { body: 'floating', palette: ROT, ornate: 0.9, eyes: 7, glow: 0xff66aa },
});

// ===========================================================================
// OOZE — the shared line. They split, they corrode gear, they refuse to die once.
// ===========================================================================

mon({
  id: 'ooze_spawn', name: tr('Ooze Spawn'), family: 'ooze', role: 'swarm',
  minDepth: 2, weight: 12, speed: 3.0, scale: 0.55, damageType: 'poison',
  abilities: ['basic_strike'],
  resists: { poison: 100, physical: 25, cold: 30 },
  biomes: ['caverns', 'sunkenTemple', 'crypt', 'hive', 'swamp'],
  visual: { body: 'ooze', palette: MOSS, ornate: 0.2, eyes: 2, glow: 0x88ff66 },
});

mon({
  id: 'green_slime', name: tr('Green Slime'), family: 'ooze', role: 'melee',
  minDepth: 2, weight: 11, speed: 2.4, lifeMul: 1.2, damageType: 'poison',
  abilities: ['basic_strike', 'split_self'],
  resists: { poison: 100, physical: 30, cold: 30 },
  biomes: ['caverns', 'sunkenTemple', 'crypt', 'swamp'],
  visual: { body: 'ooze', palette: MOSS, ornate: 0.3, eyes: 2, glow: 0x88ff66 },
});

mon({
  id: 'acid_ooze', name: tr('Acid Ooze'), family: 'ooze', role: 'melee',
  minDepth: 6, weight: 10, speed: 2.5, lifeMul: 1.4, damageType: 'poison',
  abilities: ['split_self', 'plague_death'],
  resists: { poison: 100, physical: 35, cold: 25 },
  biomes: ['caverns', 'hive', 'foundry', 'swamp'],
  visual: { body: 'ooze', palette: ROT, ornate: 0.35, eyes: 3, glow: 0xccff33 },
});

mon({
  id: 'tar_crawler', name: tr('Tar Crawler'), family: 'ooze', role: 'ambusher',
  minDepth: 9, weight: 7, speed: 3.2, damageMul: 1.5,
  abilities: ['grapple_pull'],
  resists: { poison: 100, physical: 40, fire: -35 },
  biomes: ['caverns', 'sunkenTemple', 'foundry', 'swamp'],
  visual: { body: 'ooze', palette: BASALT, ornate: 0.4, eyes: 4, glow: 0x6688ff },
});

mon({
  id: 'gelatinous_mass', name: tr('Gelatinous Mass'), family: 'ooze', role: 'brute',
  minDepth: 11, weight: 5, lifeMul: 3.4, scale: 1.8, speed: 1.7, damageType: 'poison',
  abilities: ['heavy_slam', 'split_self'],
  resists: { poison: 100, physical: 45, cold: 35, lightning: -30 },
  biomes: ['caverns', 'sunkenTemple', 'hive', 'swamp'],
  visual: { body: 'ooze', palette: AZURE, ornate: 0.5, eyes: 5, glow: 0x66ddff },
});

mon({
  id: 'magma_ooze', name: tr('Magma Ooze'), family: 'ooze', role: 'melee',
  minDepth: 14, weight: 8, speed: 2.6, lifeMul: 1.6, damageType: 'fire',
  abilities: ['basic_strike', 'molten_trail', 'death_explode'],
  resists: { fire: 100, poison: 100, cold: -45, physical: 35 },
  biomes: ['foundry', 'ashwaste', 'hell'],
  visual: { body: 'ooze', palette: EMBER, ornate: 0.45, eyes: 3, glow: 0xff5500 },
});

mon({
  id: 'plague_pudding', name: tr('Plague Pudding'), family: 'ooze', role: 'brute',
  minDepth: 18, weight: 4, lifeMul: 3.8, scale: 1.9, speed: 1.6, damageType: 'poison',
  abilities: ['corpse_burst', 'heal_self', 'plague_death'],
  resists: { poison: 100, physical: 45, cold: 30 },
  biomes: ['crypt', 'hive', 'sunkenTemple', 'swamp'],
  visual: { body: 'ooze', palette: ROT, ornate: 0.6, eyes: 7, glow: 0x99ff33 },
});

mon({
  id: 'glass_gel', name: tr('Glass Gel'), family: 'ooze', role: 'ranged',
  minDepth: 16, weight: 6, attackRange: 13, damageType: 'physical',
  abilities: ['shrapnel_nova', 'shatter_death'],
  resists: { poison: 100, cold: 60, physical: 20 },
  biomes: ['frostvault', 'foundry', 'voidspire', 'desert'],
  visual: { body: 'ooze', palette: RIME, ornate: 0.55, eyes: 4, glow: 0xaaeeff },
});

mon({
  id: 'void_slime', name: tr('Void Slime'), family: 'ooze', role: 'melee',
  minDepth: 21, weight: 7, lifeMul: 1.8, speed: 2.8, damageType: 'arcane',
  abilities: ['void_rift', 'split_self'],
  resists: { arcane: 80, poison: 100, physical: 40 },
  biomes: ['voidspire'],
  visual: { body: 'ooze', palette: VOID, ornate: 0.7, eyes: 6, glow: 0xcc44ff },
});

mon({
  id: 'devourer_pudding', name: tr('Devourer Pudding'), family: 'ooze', role: 'brute',
  minDepth: 25, weight: 3, lifeMul: 4.2, scale: 2.1, speed: 1.9, damageType: 'poison',
  abilities: ['grapple_pull', 'split_self', 'plague_death'],
  resists: { poison: 100, physical: 50, cold: 40, arcane: 30 },
  biomes: ['hive', 'voidspire', 'sunkenTemple'],
  visual: { body: 'ooze', palette: CRIMSON, ornate: 0.85, limbs: 6, eyes: 9, glow: 0xff3366 },
});

// ===========================================================================
// THE KEPT — the Tenant's household (depth 30 on). Servants kept at their work
// so long they went to wax and soot: they trim the lamps, sweep the halls and
// tidy away whatever comes down the stair. Indoor layers only.
// ===========================================================================

const KEPT_HALLS: BiomeId[] = ['crypt', 'caverns', 'foundry', 'sunkenTemple', 'desertTomb', 'frostvault', 'voidspire'];
const KEPT_WAX = 'flesh.rotted|0xd8c8a4';
const KEPT_SOOT = 'cloth.linen|0x2a2622';
const KEPT_RESISTS = { poison: 40, cold: 20, fire: -15 };

mon({
  id: 'kept_hallsweeper', name: tr('Hallsweeper'), family: 'kept', role: 'melee',
  minDepth: 30, weight: 12, lifeMul: 1.1, damageMul: 1.05, attackRange: 2.2,
  abilities: ['basic_strike'],
  resists: KEPT_RESISTS,
  biomes: KEPT_HALLS,
  visual: { body: 'humanoid', palette: KEPT_WAX, ornate: 0.2, eyes: 2, glow: 0xffc870, weapon: 'staff' },
});

mon({
  id: 'kept_wicktrimmer', name: tr('Wick-Trimmer'), family: 'kept', role: 'ranged',
  minDepth: 31, weight: 8, attackRange: 13, speed: 2.7, damageType: 'fire',
  abilities: ['fire_bolt'],
  resists: { ...KEPT_RESISTS, fire: 30 },
  biomes: KEPT_HALLS,
  visual: { body: 'humanoid', palette: KEPT_WAX, ornate: 0.3, eyes: 2, glow: 0xffb050, weapon: 'staff' },
});

mon({
  id: 'kept_dustling', name: tr('Dustling'), family: 'kept', role: 'swarm',
  minDepth: 32, weight: 14, speed: 4.4,
  abilities: ['basic_strike'],
  resists: { poison: 60, physical: 10, fire: -15 },
  biomes: KEPT_HALLS,
  visual: { body: 'floating', palette: KEPT_SOOT, ornate: 0.2, eyes: 2, glow: 0xffd890 },
});

mon({
  id: 'kept_shelver', name: tr('Shelver'), family: 'kept', role: 'brute',
  minDepth: 34, weight: 5, lifeMul: 2.8, damageMul: 1.6, scale: 1.6,
  abilities: ['heavy_slam'],
  resists: { ...KEPT_RESISTS, physical: 20 },
  biomes: KEPT_HALLS,
  visual: { body: 'brute', palette: KEPT_WAX, ornate: 0.5, eyes: 2, glow: 0xffc070, weapon: 'hammer' },
});

mon({
  id: 'kept_turnkey', name: tr('Turnkey'), family: 'kept', role: 'support',
  minDepth: 36, weight: 4,
  abilities: ['shield_ally'],
  resists: KEPT_RESISTS,
  biomes: KEPT_HALLS,
  visual: { body: 'humanoid', palette: KEPT_SOOT, ornate: 0.45, eyes: 2, glow: 0xe0c080, weapon: 'staff' },
});

mon({
  id: 'kept_housemother', name: tr('Housemother'), family: 'kept', role: 'ambusher',
  minDepth: 40, weight: 5, lifeMul: 1.0, damageMul: 1.5, speed: 3.6,
  abilities: ['teleport_strike'],
  resists: { ...KEPT_RESISTS, arcane: 25 },
  biomes: KEPT_HALLS,
  visual: { body: 'humanoid', palette: KEPT_SOOT, ornate: 0.6, eyes: 2, glow: 0xffe0a0, weapon: 'dagger' },
});

// ===========================================================================
// THE NAILBORN — glass that grew wrong in the Hollow Spire (depth 50 on). Cut
// edges, light trapped inside, too many angles. Hard to cut, they carry
// lightning and spellfire, and they shatter.
// ===========================================================================

const NAIL_REACH: BiomeId[] = ['voidspire', 'frostvault', 'hell', 'ashwaste', 'hive', 'caverns', 'tundra', 'desert'];
const NAIL_GLASS = 'crystal.void|0x9ab8d0';
const NAIL_DARK = 'crystal.void|0x2a2e3a';
const NAIL_RESISTS = { physical: 25, lightning: 50, arcane: 40, poison: 60, fire: -10 };

mon({
  id: 'nail_splinter', name: tr('Splinterling'), family: 'nailborn', role: 'swarm',
  minDepth: 50, weight: 14, speed: 4.6,
  abilities: ['basic_strike'],
  resists: NAIL_RESISTS,
  biomes: NAIL_REACH,
  visual: { body: 'floating', palette: NAIL_GLASS, ornate: 0.5, eyes: 1, glow: 0xa8e8ff },
});

mon({
  id: 'nail_facet', name: tr('Facet'), family: 'nailborn', role: 'ranged',
  minDepth: 52, weight: 8, attackRange: 14, damageType: 'lightning',
  abilities: ['shock_bolt'],
  resists: { ...NAIL_RESISTS, lightning: 75 },
  biomes: NAIL_REACH,
  visual: { body: 'floating', palette: NAIL_GLASS, ornate: 0.6, eyes: 1, glow: 0xd0f4ff },
});

mon({
  id: 'nail_walker', name: tr('Nailwalker'), family: 'nailborn', role: 'melee',
  minDepth: 54, weight: 11, lifeMul: 1.05, damageMul: 1.1, speed: 3.2,
  abilities: ['basic_strike'],
  resists: NAIL_RESISTS,
  biomes: NAIL_REACH,
  visual: { body: 'humanoid', palette: NAIL_DARK, ornate: 0.7, eyes: 1, glow: 0x80d8ff, weapon: 'spear' },
});

mon({
  id: 'nail_prism', name: tr('Split Prism'), family: 'nailborn', role: 'caster',
  minDepth: 56, weight: 5, lifeMul: 0.8, damageMul: 1.25, attackRange: 15, damageType: 'arcane',
  abilities: ['arcane_orb'],
  resists: { ...NAIL_RESISTS, arcane: 70 },
  biomes: NAIL_REACH,
  visual: { body: 'floating', palette: NAIL_GLASS, ornate: 0.8, eyes: 3, glow: 0xe0a0ff },
});

mon({
  id: 'nail_nailhead', name: tr('Nailhead'), family: 'nailborn', role: 'brute',
  minDepth: 60, weight: 5, lifeMul: 2.8, damageMul: 1.6, scale: 1.6, speed: 2.3,
  abilities: ['impale'],
  resists: { ...NAIL_RESISTS, physical: 40 },
  biomes: NAIL_REACH,
  visual: { body: 'brute', palette: NAIL_DARK, ornate: 0.9, eyes: 1, glow: 0x90e0ff },
});

mon({
  id: 'nail_wrongangle', name: tr('Wrong Angle'), family: 'nailborn', role: 'ambusher',
  minDepth: 64, weight: 5, damageMul: 1.55, speed: 3.9, damageType: 'arcane',
  abilities: ['phase_shift'],
  resists: { ...NAIL_RESISTS, arcane: 60 },
  biomes: NAIL_REACH,
  visual: { body: 'humanoid', palette: NAIL_DARK, ornate: 0.9, eyes: 2, glow: 0xc080ff, weapon: 'dagger' },
});

// ===========================================================================
// THE STAYED — delvers who went down and never came back up (depth 70 on).
// Dead, still in the gear they died in, still fighting the way they were
// taught: a leap, a whirl, a prayer. Found in every layer.
// ===========================================================================

const STAYED_DUST = 'stone.crypt|0xb8b0a0';
const STAYED_RESISTS = { poison: 50, cold: 25, physical: 10 };

mon({
  id: 'stayed_sellsword', name: tr('Stayed Sellsword'), family: 'stayed', role: 'melee',
  minDepth: 70, weight: 11, lifeMul: 1.15, damageMul: 1.1,
  abilities: ['basic_strike'],
  resists: STAYED_RESISTS,
  visual: { body: 'armored', palette: STAYED_DUST, ornate: 0.5, eyes: 2, glow: 0x9ad0ff, weapon: 'sword' },
});

mon({
  id: 'stayed_archer', name: tr('Stayed Archer'), family: 'stayed', role: 'ranged',
  minDepth: 72, weight: 8, attackRange: 15, speed: 2.8,
  abilities: ['arrow_shot'],
  resists: STAYED_RESISTS,
  visual: { body: 'skeleton', palette: STAYED_DUST, ornate: 0.4, eyes: 2, glow: 0x9ad0ff, weapon: 'bow' },
});

mon({
  id: 'stayed_spellwright', name: tr('Stayed Spellwright'), family: 'stayed', role: 'caster',
  minDepth: 74, weight: 5, attackRange: 14, damageType: 'cold',
  abilities: ['frost_bolt'],
  resists: { ...STAYED_RESISTS, cold: 60, fire: 30 },
  visual: { body: 'skeleton', palette: STAYED_DUST, ornate: 0.6, eyes: 2, glow: 0x80c8ff, weapon: 'staff' },
});

mon({
  id: 'stayed_cutthroat', name: tr('Stayed Cutthroat'), family: 'stayed', role: 'ambusher',
  minDepth: 77, weight: 5, damageMul: 1.5, speed: 3.8,
  abilities: ['ambush_leap'],
  resists: { ...STAYED_RESISTS, poison: 75 },
  visual: { body: 'skeleton', palette: STAYED_DUST, ornate: 0.5, eyes: 2, glow: 0x9ad0ff, weapon: 'dagger' },
});

mon({
  id: 'stayed_chaplain', name: tr('Stayed Chaplain'), family: 'stayed', role: 'support',
  minDepth: 80, weight: 4,
  abilities: ['heal_ally'],
  resists: { ...STAYED_RESISTS, arcane: 30 },
  visual: { body: 'armored', palette: STAYED_DUST, ornate: 0.7, eyes: 2, glow: 0xffe8a0, weapon: 'staff' },
});

mon({
  id: 'stayed_champion', name: tr('Stayed Champion'), family: 'stayed', role: 'brute',
  minDepth: 84, weight: 4, lifeMul: 2.9, damageMul: 1.6, scale: 1.5,
  abilities: ['whirlwind'],
  resists: { ...STAYED_RESISTS, physical: 25 },
  visual: { body: 'armored', palette: STAYED_DUST, ornate: 0.9, eyes: 2, glow: 0x9ad0ff, weapon: 'greataxe' },
});

// What climbs out of a Restless monster (data/monsterAffixes.ts): never rolled,
// only called up. Fast, frail, and it hits cold.
mon({
  id: 'restless_shade', name: tr('Restless Shade'), family: 'undead', role: 'melee',
  minDepth: 1, weight: 0, lifeMul: 0.45, damageMul: 0.9, speed: 4.3, xpMul: 0,
  damageType: 'cold',
  abilities: ['basic_strike'],
  resists: { physical: 40, poison: 100, cold: 50 },
  visual: { body: 'wraith', palette: RIME, ornate: 0.3, eyes: 2, glow: 0x9cd8e8 },
});

// ---------------------------------------------------------------------------
// Exports & selection
// ---------------------------------------------------------------------------

/**
 * Put a weapon in the hand of anything shaped like it could hold one.
 *
 * A "Bone Archer" that shoots arrows out of an empty fist reads as a bug, and
 * with a hundred-odd monsters this cannot be authored per entry without it
 * drifting out of date the moment a role changes. Derived from role and body
 * instead, so it stays true by construction.
 */
const HANDED_BODIES = new Set(['humanoid', 'skeleton', 'zombie', 'armored', 'brute']);
const ROLE_WEAPON: Partial<Record<MonsterDef['role'], string[]>> = {
  ranged: ['bow'],
  caster: ['staff'],
  melee: ['sword', 'axe', 'dagger'],
  brute: ['mace', 'axe'],
  support: ['staff'],
  ambusher: ['dagger', 'sword'],
};
for (const m of ALL) {
  if (m.visual.weapon !== undefined) continue;
  if (!HANDED_BODIES.has(m.visual.body)) continue;
  const choices = ROLE_WEAPON[m.role];
  if (!choices) continue;
  // Deterministic pick from the id, so the same monster always carries the
  // same thing across runs and across machines.
  let h = 0;
  for (let i = 0; i < m.id.length; i++) h = (h * 31 + m.id.charCodeAt(i)) >>> 0;
  m.visual.weapon = choices[h % choices.length];
}

export const MONSTERS: MonsterDef[] = ALL;

const BY_ID = new Map<string, MonsterDef>();
for (const m of ALL) BY_ID.set(m.id, m);

export function getMonster(id: string): MonsterDef | undefined {
  return BY_ID.get(id);
}

/** Every monster that can legally appear at a depth in a biome. */
export function monstersFor(depth: number, biome: BiomeId): MonsterDef[] {
  const out: MonsterDef[] = [];
  for (const m of ALL) {
    if (m.weight <= 0) continue;
    if (depth < m.minDepth) continue;
    if (m.maxDepth !== undefined && depth > m.maxDepth) continue;
    if (m.biomes && m.biomes.length && !m.biomes.includes(biome)) continue;
    out.push(m);
  }
  return out;
}

/**
 * Weighted pick for a spawn batch. Two shaping rules keep the bestiary feeling
 * alive rather than random:
 *
 * - Monsters far below the current depth fade out, so depth 30 is not still
 *   throwing rattling skeletons at you.
 * - The batch is composition-aware: it front-loads a mix of roles so a pack has
 *   a front line and a back line instead of eight archers.
 */
export function pickMonstersForDepth(
  depth: number,
  biome: BiomeId,
  rng: Rng,
  count: number,
): MonsterDef[] {
  const pool = monstersFor(depth, biome);
  if (pool.length === 0) return [];

  const relevance = (m: MonsterDef): number => {
    const over = depth - m.minDepth;
    // Peaks a few floors after introduction, then decays with a long tail.
    const fade = over <= 0 ? 1 : 1 / (1 + Math.pow(over / 14, 2.2));
    return Math.max(0.02, m.weight * fade);
  };

  const wantRoles: MonsterRole[] = [];
  const frontline: MonsterRole[] = ['melee', 'brute', 'swarm'];
  const backline: MonsterRole[] = ['ranged', 'caster', 'ambusher'];
  for (let i = 0; i < count; i++) {
    if (i === 0) wantRoles.push('melee');
    else if (i === 2 && count >= 4) wantRoles.push(rng.pick(backline));
    else if (i === 4 && count >= 6) wantRoles.push('support');
    else if (i % 3 === 1) wantRoles.push(rng.pick(backline));
    else wantRoles.push(rng.pick(frontline));
  }

  const out: MonsterDef[] = [];
  for (const role of wantRoles) {
    const roleMatched = pool.filter((m) => m.role === role);
    const from = roleMatched.length > 0 ? roleMatched : pool;
    out.push(rng.weighted(from, relevance));
  }
  return out;
}

/** Families present at a depth — used by the codex and quest generator. */
export function familiesAtDepth(depth: number, biome: BiomeId): MonsterFamily[] {
  const seen = new Set<MonsterFamily>();
  for (const m of monstersFor(depth, biome)) seen.add(m.family);
  return Array.from(seen);
}
