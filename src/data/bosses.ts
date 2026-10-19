/**
 * SLAY — boss encounters.
 *
 * Twenty-two set-piece fights. The rule every entry follows: a phase transition
 * must change what the player *does*, not just what the numbers say. Each boss
 * has at least one phase that inverts its own rules — the tank that stops
 * tanking and starts kiting you, the caster that shatters into three, the
 * golem that turns the floor itself into the threat.
 *
 * `arena` hooks are resolved by `entities/Boss.ts`:
 *   lavaFloor  — creeping fire pools spawn around the room
 *   iceField   — chilling patches; standing still gets you frozen
 *   voidRifts  — pulling rifts open on a timer
 *   darkness   — sight range collapses, boss gains ambush behaviour
 *   collapse   — falling debris telegraphs across the arena
 *   pillars    — safe pillars spawn; everything outside them is hit
 *   floodTide  — rising water waves push you toward one edge
 *   swarmCall  — a continuous trickle of adds
 *   shatter    — the boss splits into duplicates
 *   sentries   — immortal turrets until the boss is staggered
 *   barrier    — boss is invulnerable while its adds live
 *   enrageTimer— hard damage ramp, kill it or die
 *   hookSweep  — chains sweep the room in a cross through the boss; step off the lines
 *
 * Every boss also has a soft enrage: a fight that runs past its time limit
 * (Boss.ts, softEnrageAfter) enrages the boss and fills the room with dread.
 */

import type { BossDef, BiomeId, BossMood, BossPhase, BossProfile, BossSize } from '../types';
import { NEW_BOSSES } from './bosses2';
import { DEEP_BOSSES } from './bosses3';
import { tr } from '../core/I18n';

const ALL: BossDef[] = [];

function boss(b: BossDef): BossDef {
  ALL.push(b);
  return b;
}

// ---------------------------------------------------------------------------
// Depth 1-8 — the crypt and the caverns
// ---------------------------------------------------------------------------

boss({
  id: 'boneking_gharruth',
  name: tr('Gharruth'),
  title: tr('the Bone King'),
  family: 'undead',
  minDepth: 1,
  biomes: ['crypt', 'sunkenTemple', 'darkForest', 'desertTomb'],
  lifeMul: 1.0,
  damageMul: 1.0,
  scale: 2.4,
  profile: 'bruiser',
  shape: 'phased',
  intro: tr('A crown of vertebrae turns toward you. The throne room exhales dust.'),
  lootTier: 1,
  music: 'boss.crypt',
  adds: ['skeleton_rattler', 'skeleton_archer'],
  visual: { body: 'colossal', palette: 'stone.crypt|0xd6cfb4', ornate: 0.85, eyes: 2, glow: 0x66ff99 },
  phases: [
    {
      atLife: 1.0,
      name: tr('The Throned King'),
      abilities: ['cleave', 'heavy_slam', 'bone_shard_spray'],
      bark: tr('KNEEL BEFORE THE BONE THRONE.'),
    },
    {
      atLife: 0.65,
      name: tr('The Court Rises'),
      abilities: ['raise_dead', 'wall_of_bone', 'cleave', 'ground_slam'],
      arena: 'barrier',
      damage: 1.1,
      bark: tr('My court is endless. Cut them down and you will only tire.'),
    },
    {
      atLife: 0.3,
      name: tr('Crownfall'),
      abilities: ['whirlwind', 'charge', 'shatter_death', 'enrage', 'quake_stomp'],
      arena: 'collapse',
      speed: 1.35,
      damage: 1.3,
      bark: tr('THEN I WILL BURY US BOTH.'),
    },
  ],
});

boss({
  id: 'broodmother_saelith',
  name: tr('Sae-lith'),
  title: tr('the Brood Mother'),
  family: 'insect',
  minDepth: 2,
  biomes: ['hive', 'caverns', 'swamp', 'desert'],
  lifeMul: 1.05,
  damageMul: 0.95,
  scale: 2.6,
  profile: 'swarm',
  shape: 'phased',
  intro: tr('The webs are not decoration. They are a nervous system, and it just felt you.'),
  lootTier: 1,
  music: 'boss.hive',
  adds: ['hive_drone', 'web_spinner', 'acid_larva'],
  visual: { body: 'arachnid', palette: 'flesh.rotted|0x3d4a35', ornate: 0.9, limbs: 8, eyes: 8, glow: 0x99ff33 },
  phases: [
    {
      atLife: 1.0,
      name: tr('The Weaver'),
      abilities: ['web_snare', 'acid_spit', 'impale'],
      bark: tr('Ssssso many mouths to feed.'),
    },
    {
      atLife: 0.7,
      name: tr('The Clutch'),
      abilities: ['summon_swarm', 'web_snare', 'poison_spit', 'burrow_emerge'],
      arena: 'swarmCall',
      bark: tr('Meet my children.'),
    },
    {
      atLife: 0.35,
      name: tr('Blood of the Hive'),
      abilities: ['spore_burst', 'quill_burst', 'summon_swarm', 'enrage', 'quake_stomp'],
      arena: 'enrageTimer',
      speed: 1.3,
      damage: 1.35,
      bark: tr('THE HIVE IS ONE. THE HIVE IS ME.'),
    },
  ],
});

boss({
  id: 'butcher_grell',
  name: tr('Grell'),
  title: tr('the Butcher'),
  family: 'demon',
  minDepth: 1,
  biomes: ['crypt', 'caverns', 'ashwaste', 'darkForest', 'hell'],
  lifeMul: 1.15,
  damageMul: 1.2,
  scale: 1.8,
  // Was 2.3: made smaller for the size spread, with its old reach so the fight is unchanged.
  reach: 2.3,
  profile: 'bruiser',
  shape: 'phased',
  intro: tr('The floor is tacky underfoot. Something enormous drags a hook across stone.'),
  lootTier: 2,
  music: 'boss.demon',
  visual: { body: 'colossal', palette: 'flesh.rotted|0x8e2f2a', ornate: 0.8, eyes: 2, glow: 0xff3020 },
  phases: [
    {
      atLife: 1.0,
      name: tr('Fresh Meat'),
      abilities: ['cleave', 'charge', 'flesh_hooks'],
      bark: tr('AHHH… FRESH MEAT!'),
    },
    {
      atLife: 0.6,
      name: tr('The Hook'),
      abilities: ['grapple_pull', 'flesh_hooks', 'whirlwind', 'heavy_slam'],
      arena: 'hookSweep',
      damage: 1.15,
      speed: 1.15,
      bark: tr('COME CLOSER. I INSIST.'),
    },
    {
      atLife: 0.25,
      name: tr('Frenzy'),
      abilities: ['whirlwind', 'gore_charge', 'execute_low', 'enrage'],
      arena: 'lavaFloor',
      speed: 1.5,
      damage: 1.4,
      bark: tr('MORE! MORE! MORE!'),
    },
  ],
});

boss({
  id: 'warden_calix',
  name: tr('Calix'),
  title: tr('Warden of the Vault'),
  family: 'construct',
  minDepth: 3,
  biomes: ['foundry', 'sunkenTemple', 'desertTomb'],
  lifeMul: 1.3,
  damageMul: 1.0,
  scale: 2.5,
  profile: 'bulwark',
  shape: 'puzzle',
  intro: tr('Six centuries of standing perfectly still end in a single grinding step.'),
  lootTier: 2,
  music: 'boss.foundry',
  adds: ['scarab_drone', 'clockwork_sentry'],
  visual: { body: 'colossal', palette: 'metal.iron|0x8b8f96', ornate: 0.8, eyes: 4, glow: 0xffaa22 },
  phases: [
    {
      atLife: 1.0,
      name: tr('Protocol: Deny'),
      abilities: ['ground_slam', 'shield_bash', 'sunder_armor'],
      bark: tr('INTRUDER. AUTHORISATION REQUIRED.'),
    },
    {
      atLife: 0.7,
      name: tr('Protocol: Suppress'),
      abilities: ['summon_totem', 'shrapnel_nova', 'ground_slam', 'ballista_bolt'],
      arena: 'sentries',
      bark: tr('DEPLOYING COUNTERMEASURES.'),
    },
    {
      atLife: 0.4,
      name: tr('Protocol: Purge'),
      abilities: ['flame_wave', 'quake_stomp', 'charge', 'static_field'],
      arena: 'pillars',
      damage: 1.25,
      bark: tr('PURGE CYCLE ENGAGED. VACATE THE FLOOR.'),
    },
    {
      atLife: 0.15,
      name: tr('Core Breach'),
      abilities: ['shrapnel_nova', 'lightning_storm', 'death_explode', 'enrage'],
      arena: 'enrageTimer',
      speed: 1.3,
      damage: 1.5,
      bark: tr('CORE CONTAINMENT FAILING.'),
    },
  ],
});

boss({
  id: 'hound_master_vess',
  name: tr('Vess'),
  title: tr('the Hound Master'),
  family: 'humanoid',
  minDepth: 2,
  biomes: ['caverns', 'ashwaste', 'crypt', 'darkForest', 'desert', 'tundra'],
  lifeMul: 0.9,
  damageMul: 1.1,
  scale: 1.1,
  // Was 1.9: made smaller for the size spread, with its old reach so the fight is unchanged.
  reach: 1.9,
  profile: 'swarm',
  shape: 'phased',
  intro: tr('She does not fight you. She lets the pack do that, and watches.'),
  lootTier: 2,
  music: 'boss.beast',
  adds: ['gorge_wolf', 'corpse_hound', 'pack_alpha'],
  visual: { body: 'humanoid', palette: 'cloth.linen|0x6a6255', ornate: 0.6, eyes: 2, glow: 0xff8822 },
  phases: [
    {
      atLife: 1.0,
      name: tr('The Whistle'),
      abilities: ['rally_pack', 'summon_adds', 'crossbow_bolt', 'caltrops'],
      arena: 'swarmCall',
      bark: tr('Hunt.'),
    },
    {
      atLife: 0.65,
      name: tr('Loosed'),
      abilities: ['summon_adds', 'arrow_volley', 'blink_away', 'haste_aura'],
      arena: 'darkness',
      speed: 1.2,
      bark: tr('You cannot outrun what does not tire.'),
    },
    {
      atLife: 0.3,
      name: tr('Alpha'),
      abilities: ['gore_charge', 'rend', 'enrage', 'ambush_leap'],
      speed: 1.45,
      damage: 1.4,
      bark: tr('Fine. I will do it myself.'),
    },
  ],
});

boss({
  id: 'ooze_sovereign',
  name: tr('Ylph'),
  title: tr('the Sovereign Mass'),
  family: 'ooze',
  minDepth: 4,
  biomes: ['caverns', 'sunkenTemple', 'hive', 'swamp'],
  lifeMul: 1.4,
  damageMul: 0.9,
  scale: 2.7,
  profile: 'sponge',
  shape: 'phased',
  intro: tr('It has eaten everything else in this chamber. The armour is still visible inside it.'),
  lootTier: 2,
  music: 'boss.ooze',
  adds: ['ooze_spawn', 'acid_ooze'],
  visual: { body: 'ooze', palette: 'wood.oak|0x4a5c30', ornate: 0.7, eyes: 7, glow: 0x99ff33 },
  phases: [
    {
      atLife: 1.0,
      name: tr('Engulf'),
      abilities: ['heavy_slam', 'acid_spit', 'grapple_pull'],
      bark: '',
    },
    {
      atLife: 0.72,
      name: tr('Division'),
      abilities: ['split_self', 'corpse_burst', 'acid_spit', 'spore_burst'],
      arena: 'shatter',
      bark: tr('The mass does not die. It divides.'),
    },
    {
      atLife: 0.4,
      name: tr('Acid Bloom'),
      abilities: ['poison_spit', 'plague_death', 'spore_burst', 'vortex_pull'],
      arena: 'floodTide',
      damage: 1.3,
      bark: tr('Everything that falls in here is added to me. Come and be added.'),
    },
    {
      atLife: 0.15,
      name: tr('Reunion'),
      abilities: ['vortex_pull', 'heavy_slam', 'enrage', 'corpse_burst'],
      speed: 1.35,
      damage: 1.5,
      bark: tr('ALL OF IT COMES BACK TOGETHER.'),
    },
  ],
});

// ---------------------------------------------------------------------------
// Depth 8-16 — the foundry, the temple, the frost vault
// ---------------------------------------------------------------------------

boss({
  id: 'archivist_moln',
  name: tr('Moln'),
  title: tr('the Archivist'),
  family: 'undead',
  minDepth: 4,
  biomes: ['crypt', 'sunkenTemple', 'voidspire', 'desertTomb'],
  lifeMul: 1.0,
  damageMul: 1.25,
  scale: 1.6,
  // Was 2.2: made smaller for the size spread, with its old reach so the fight is unchanged.
  reach: 2.2,
  profile: 'glass',
  shape: 'phased',
  intro: tr('Every book in this hall is a name. He has been waiting to add yours.'),
  lootTier: 3,
  music: 'boss.arcane',
  adds: ['skeleton_rattler', 'bone_conjurer', 'watcher_eye'],
  visual: { body: 'humanoid', palette: 'cloth.linen|0x2e2c38', ornate: 0.8, eyes: 2, glow: 0x60ffb0 },
  phases: [
    {
      atLife: 1.0,
      name: tr('Cataloguing'),
      abilities: ['hex_bolt', 'arcane_orb', 'wall_of_bone', 'blink_away'],
      bark: tr('Hold still. I am recording this.'),
    },
    {
      atLife: 0.7,
      name: tr('Marginalia'),
      abilities: ['summon_totem', 'homing_bolt', 'curse_frailty', 'blink_away'],
      arena: 'sentries',
      bark: tr('Footnotes. Everywhere. Read them or die ignorant.'),
    },
    {
      atLife: 0.45,
      name: tr('Errata'),
      abilities: ['mirror_images', 'arcane_nova', 'gravity_well', 'teleport_strike'],
      arena: 'shatter',
      speed: 1.2,
      bark: tr('Which of us is the original? Guess.'),
    },
    {
      atLife: 0.18,
      name: tr('The Final Entry'),
      abilities: ['death_beam', 'void_rift', 'arcane_nova', 'enrage'],
      arena: 'voidRifts',
      damage: 1.45,
      bark: tr('AND HERE THE RECORD ENDS.'),
    },
  ],
});

boss({
  id: 'forgefather_hurn',
  name: tr('Hurn'),
  title: tr('the Forgefather'),
  family: 'construct',
  minDepth: 5,
  biomes: ['foundry', 'ashwaste', 'hell'],
  lifeMul: 1.5,
  damageMul: 1.2,
  scale: 2.9,
  profile: 'bulwark',
  shape: 'phased',
  intro: tr('The great hammer has not stopped falling in four hundred years. It stops now.'),
  lootTier: 3,
  music: 'boss.foundry',
  adds: ['forge_smith', 'animated_armor', 'ember_wisp'],
  visual: { body: 'colossal', palette: 'metal.iron|0x8a5a34', ornate: 0.9, eyes: 4, glow: 0xff6600 },
  phases: [
    {
      atLife: 1.0,
      name: tr('The Hammer'),
      abilities: ['heavy_slam', 'ground_slam', 'charge'],
      bark: tr('Steel is honest. You are not.'),
    },
    {
      atLife: 0.72,
      name: tr('The Quench'),
      abilities: ['flame_wave', 'lava_pool', 'molten_trail', 'ground_slam'],
      arena: 'lavaFloor',
      damage: 1.15,
      bark: tr('Into the fire, then.'),
    },
    {
      atLife: 0.42,
      name: tr('The Bellows'),
      abilities: ['repair_construct', 'summon_adds', 'firestorm', 'shield_self'],
      arena: 'barrier',
      bark: tr('My hands are many. Break them all.'),
    },
    {
      atLife: 0.15,
      name: tr('Whitehot'),
      abilities: ['meteor', 'firestorm', 'quake_stomp', 'enrage', 'death_explode'],
      arena: 'enrageTimer',
      speed: 1.25,
      damage: 1.55,
      bark: tr('THE FORGE TAKES US BOTH!'),
    },
  ],
});

boss({
  id: 'tidewarden_nheru',
  name: tr('Nheru'),
  title: tr('the Tidewarden'),
  family: 'elemental',
  minDepth: 6,
  biomes: ['sunkenTemple', 'frostvault'],
  lifeMul: 1.25,
  damageMul: 1.15,
  scale: 2.5,
  profile: 'bruiser',
  shape: 'phased',
  intro: tr('The water in this temple has been waiting a long time to be told what to do.'),
  lootTier: 3,
  music: 'boss.temple',
  adds: ['sunken_zealot', 'frost_shard', 'tide_caller'],
  visual: { body: 'floating', palette: 'crystal.void|0x3a6ea8', ornate: 0.85, eyes: 3, glow: 0x40d0ff },
  phases: [
    {
      atLife: 1.0,
      name: tr('Low Tide'),
      abilities: ['frost_bolt', 'frozen_pulse', 'ice_nova'],
      bark: tr('The sea remembers every drowning.'),
    },
    {
      atLife: 0.7,
      name: tr('The Surge'),
      abilities: ['blizzard', 'vortex_pull', 'frost_bolt', 'summon_adds'],
      arena: 'floodTide',
      speed: 1.15,
      bark: tr('Rise.'),
    },
    {
      atLife: 0.38,
      name: tr('Deep Freeze'),
      abilities: ['ice_nova', 'blizzard', 'cone_breath_frost', 'shatter_death'],
      arena: 'iceField',
      damage: 1.3,
      bark: tr('Stand still and I will make you a monument.'),
    },
    {
      atLife: 0.14,
      name: tr('Undertow'),
      abilities: ['vortex_pull', 'gravity_well', 'blizzard', 'enrage'],
      speed: 1.3,
      damage: 1.4,
      bark: tr('DOWN. ALL OF IT GOES DOWN.'),
    },
  ],
});

boss({
  id: 'plaguelord_ossik',
  name: tr('Ossik'),
  title: tr('the Plaguelord'),
  family: 'undead',
  minDepth: 6,
  biomes: ['crypt', 'hive', 'sunkenTemple', 'swamp', 'desertTomb'],
  lifeMul: 1.55,
  damageMul: 1.0,
  scale: 2.8,
  profile: 'sponge',
  shape: 'phased',
  intro: tr('He is mostly other people. They are all still moving.'),
  lootTier: 3,
  music: 'boss.crypt',
  adds: ['plague_ghoul', 'rotting_bloat', 'acid_larva'],
  visual: { body: 'colossal', palette: 'flesh.rotted|0x6f7a4a', ornate: 0.9, eyes: 9, glow: 0x9ce03a },
  phases: [
    {
      atLife: 1.0,
      name: tr('Contagion'),
      abilities: ['corpse_burst', 'poison_spit', 'heavy_slam'],
      bark: tr('You are already breathing me in.'),
    },
    {
      atLife: 0.68,
      name: tr('Incubation'),
      abilities: ['summon_adds', 'spore_burst', 'cone_breath_poison', 'heal_self'],
      arena: 'swarmCall',
      bark: tr('Every corpse in this floor is an egg.'),
    },
    {
      atLife: 0.35,
      name: tr('Necrosis'),
      abilities: ['plague_death', 'corpse_burst', 'poison_spit', 'vortex_pull', 'enrage'],
      arena: 'enrageTimer',
      damage: 1.4,
      speed: 1.2,
      bark: tr('ROT WITH ME.'),
    },
  ],
});

boss({
  id: 'gaze_of_uln',
  name: tr('Uln'),
  title: tr('the Thousand Gaze'),
  family: 'aberration',
  minDepth: 7,
  biomes: ['voidspire', 'sunkenTemple'],
  lifeMul: 1.1,
  damageMul: 1.35,
  scale: 1.5,
  // Was 2.6: made smaller for the size spread, with its old reach so the fight is unchanged.
  reach: 2.6,
  profile: 'glass',
  shape: 'puzzle',
  intro: tr('It does not have a front. Wherever you stand, you are being looked at.'),
  lootTier: 4,
  music: 'boss.void',
  adds: ['watcher_eye', 'whisper_wisp'],
  visual: { body: 'floating', palette: 'crystal.void|0x4a2a6e', ornate: 1.0, eyes: 9, glow: 0xff40e0 },
  phases: [
    {
      atLife: 1.0,
      name: tr('Observation'),
      abilities: ['gaze_beam', 'homing_bolt', 'petrify_gaze'],
      bark: tr('I SEE.'),
    },
    {
      atLife: 0.72,
      name: tr('Refraction'),
      abilities: ['mirror_images', 'gaze_beam', 'arcane_nova', 'blink_away'],
      arena: 'shatter',
      bark: tr('I SEE FROM EVERYWHERE.'),
    },
    {
      atLife: 0.44,
      name: tr('Focus'),
      abilities: ['death_beam', 'gravity_well', 'petrify_gaze', 'summon_totem'],
      arena: 'sentries',
      damage: 1.25,
      bark: tr('HOLD STILL. THIS IS DELICATE WORK.'),
    },
    {
      atLife: 0.16,
      name: tr('Blink'),
      abilities: ['death_beam', 'void_rift', 'teleport_strike', 'enrage'],
      arena: 'darkness',
      speed: 1.35,
      damage: 1.5,
      bark: tr('CLOSE YOUR EYES. IT WILL NOT HELP.'),
    },
  ],
});

boss({
  id: 'rimeheart_valdr',
  name: tr('Valdr'),
  title: tr('Rimeheart'),
  family: 'elemental',
  minDepth: 8,
  biomes: ['frostvault', 'tundra'],
  lifeMul: 1.6,
  damageMul: 1.2,
  scale: 2.8,
  // Was 3.0: made smaller for the size spread, with its old reach so the fight is unchanged.
  reach: 3.0,
  profile: 'bulwark',
  shape: 'phased',
  intro: tr('A mountain of ice with something furious frozen at its centre.'),
  lootTier: 4,
  music: 'boss.frost',
  adds: ['frost_shard', 'ice_revenant', 'rime_stag'],
  visual: { body: 'colossal', palette: 'crystal.void|0xa8dcf0', ornate: 0.95, eyes: 4, glow: 0x66ddff },
  phases: [
    {
      atLife: 1.0,
      name: tr('Glacial'),
      abilities: ['heavy_slam', 'ice_nova', 'cone_breath_frost'],
      bark: tr('Cold enough to forget your own name.'),
    },
    {
      atLife: 0.68,
      name: tr('Whiteout'),
      abilities: ['blizzard', 'frozen_pulse', 'charge', 'summon_adds'],
      arena: 'iceField',
      speed: 1.15,
      bark: tr('You will not see the end coming.'),
    },
    {
      atLife: 0.4,
      name: tr('The Heart Shows'),
      abilities: ['shatter_death', 'ice_nova', 'quake_stomp', 'blizzard'],
      arena: 'pillars',
      damage: 1.3,
      bark: tr('Break the shell. I dare you.'),
    },
    {
      atLife: 0.15,
      name: tr('Thaw'),
      abilities: ['enrage', 'gore_charge', 'quake_stomp', 'shatter_death'],
      speed: 1.45,
      damage: 1.5,
      bark: tr('I HAVE BEEN COLD FOR A THOUSAND YEARS.'),
    },
  ],
});

boss({
  id: 'ashen_prophet',
  name: tr('Kaveh'),
  title: tr('the Ashen Prophet'),
  family: 'humanoid',
  minDepth: 9,
  biomes: ['ashwaste', 'foundry', 'desert', 'hell'],
  lifeMul: 1.2,
  damageMul: 1.4,
  scale: 1.15,
  // Was 2.3: made smaller for the size spread, with its old reach so the fight is unchanged.
  reach: 2.3,
  profile: 'glass',
  shape: 'phased',
  intro: tr('He has been preaching to an empty waste for years. You are the first congregation.'),
  lootTier: 4,
  music: 'boss.demon',
  adds: ['cultist_zealot', 'imp_scamperer', 'ember_fiend'],
  visual: { body: 'humanoid', palette: 'crystal.void|0xb03a1a', ornate: 0.85, wings: true, eyes: 2, glow: 0xff5500 },
  phases: [
    {
      atLife: 1.0,
      name: tr('The Sermon'),
      abilities: ['fire_bolt', 'flame_wave', 'curse_frailty'],
      bark: tr('Listen. It is the last kindness I have.'),
    },
    {
      atLife: 0.72,
      name: tr('The Congregation'),
      abilities: ['summon_imps', 'battle_cry', 'meteor', 'blink_away'],
      arena: 'barrier',
      bark: tr('My flock will hold you while I finish.'),
    },
    {
      atLife: 0.42,
      name: tr('The Pyre'),
      abilities: ['firestorm', 'lava_pool', 'meteor', 'flame_wave'],
      arena: 'lavaFloor',
      damage: 1.3,
      bark: tr('BURN AND BE HONEST.'),
    },
    {
      atLife: 0.15,
      name: tr('Revelation'),
      abilities: ['meteor', 'firestorm', 'death_explode', 'enrage', 'teleport_strike'],
      arena: 'enrageTimer',
      speed: 1.3,
      damage: 1.6,
      bark: tr('I SEE IT NOW. SO WILL YOU.'),
    },
  ],
});

boss({
  id: 'iron_conqueror',
  name: tr('Malek'),
  title: tr('the Iron Conqueror'),
  family: 'humanoid',
  minDepth: 9,
  biomes: ['foundry', 'crypt', 'ashwaste', 'desert', 'tundra'],
  lifeMul: 1.7,
  damageMul: 1.3,
  scale: 1.2,
  // Was 2.5: made smaller for the size spread, with its old reach so the fight is unchanged.
  reach: 2.5,
  profile: 'bulwark',
  shape: 'puzzle',
  intro: tr('Full plate, no visor slit. Whatever is inside does not need to see.'),
  lootTier: 4,
  music: 'boss.foundry',
  adds: ['animated_armor', 'gravebound_knight', 'skeletal_ballista'],
  visual: { body: 'armored', palette: 'metal.iron|0xc4ccd8', ornate: 0.95, eyes: 2, glow: 0x4080ff },
  phases: [
    {
      atLife: 1.0,
      name: tr('The Line'),
      abilities: ['cleave', 'shield_bash', 'sunder_armor', 'charge'],
      bark: tr('Hold the line. I always do.'),
    },
    {
      atLife: 0.7,
      name: tr('The Wall'),
      abilities: ['shield_self', 'summon_adds', 'ground_slam', 'battle_cry'],
      arena: 'barrier',
      bark: tr('You will break on my shield before I break on your sword.'),
    },
    {
      atLife: 0.4,
      name: tr('The Charge'),
      abilities: ['gore_charge', 'whirlwind', 'knockback_punt', 'quake_stomp'],
      arena: 'pillars',
      speed: 1.3,
      damage: 1.25,
      bark: tr('ENOUGH DEFENCE.'),
    },
    {
      atLife: 0.15,
      name: tr('The Last Stand'),
      abilities: ['execute_low', 'whirlwind', 'enrage', 'gore_charge'],
      arena: 'enrageTimer',
      speed: 1.5,
      damage: 1.6,
      bark: tr('I HAVE NEVER LOST. I WILL NOT LEARN TODAY.'),
    },
  ],
});

// ---------------------------------------------------------------------------
// Depth 17-28 — the void spire and the deep
// ---------------------------------------------------------------------------

boss({
  id: 'treant_elder_vhoss',
  name: tr('Vhoss'),
  title: tr('Elder of the Drowned Grove'),
  family: 'plant',
  minDepth: 10,
  biomes: ['sunkenTemple', 'caverns', 'darkForest', 'swamp'],
  lifeMul: 1.9,
  damageMul: 1.15,
  scale: 3.2,
  profile: 'sponge',
  shape: 'phased',
  intro: tr('Roots have found every corpse in this temple and put them all to work.'),
  lootTier: 4,
  music: 'boss.temple',
  adds: ['thorn_creeper', 'spore_pod', 'deathcap_priest'],
  visual: { body: 'colossal', palette: 'wood.oak|0x5a4a32', ornate: 0.9, eyes: 4, glow: 0x66ff88 },
  phases: [
    {
      atLife: 1.0,
      name: tr('Deep Roots'),
      abilities: ['thorn_lash', 'root_snare', 'ground_slam'],
      bark: '',
    },
    {
      atLife: 0.68,
      name: tr('The Grove Wakes'),
      abilities: ['summon_swarm', 'root_snare', 'spore_burst', 'heal_self'],
      arena: 'swarmCall',
      bark: tr('The grove does not forgive axes.'),
    },
    {
      atLife: 0.38,
      name: tr('Blight'),
      abilities: ['poison_spit', 'corpse_burst', 'thorn_lash', 'spore_burst'],
      arena: 'floodTide',
      damage: 1.3,
      bark: tr('Rot is only a root that has learned to be hungry.'),
    },
    {
      atLife: 0.14,
      name: tr('Deadfall'),
      abilities: ['quake_stomp', 'enrage', 'root_snare', 'heavy_slam'],
      arena: 'collapse',
      speed: 1.25,
      damage: 1.45,
      bark: tr('THEN WE ALL FALL TOGETHER.'),
    },
  ],
});

boss({
  id: 'stalker_prime',
  name: tr('Nul'),
  title: tr('the Stalker Prime'),
  family: 'aberration',
  minDepth: 11,
  biomes: ['voidspire', 'caverns'],
  lifeMul: 1.2,
  damageMul: 1.6,
  scale: 1.7,
  // Was 2.2: made smaller for the size spread, with its old reach so the fight is unchanged.
  reach: 2.2,
  profile: 'duelist',
  shape: 'phased',
  intro: tr('It was here before you opened the door. It has been here the whole time.'),
  lootTier: 5,
  music: 'boss.void',
  adds: ['null_walker', 'void_stalker'],
  visual: { body: 'humanoid', palette: 'stone.crypt|0x4a4348', ornate: 0.7, limbs: 6, eyes: 0, glow: 0x8040ff },
  phases: [
    {
      atLife: 1.0,
      name: tr('Unseen'),
      abilities: ['stealth', 'teleport_strike', 'rend'],
      arena: 'darkness',
      bark: '',
    },
    {
      atLife: 0.7,
      name: tr('The Hunt'),
      abilities: ['teleport_strike', 'ambush_leap', 'flesh_hooks', 'summon_adds'],
      speed: 1.25,
      bark: tr('You were never the hunter here.'),
    },
    {
      atLife: 0.42,
      name: tr('Many Knives'),
      abilities: ['mirror_images', 'teleport_strike', 'double_swipe', 'phase_shift'],
      arena: 'shatter',
      speed: 1.35,
      damage: 1.3,
      bark: tr('Which one is real? Neither answer saves you.'),
    },
    {
      atLife: 0.15,
      name: tr('Killing Blow'),
      abilities: ['execute_low', 'teleport_strike', 'enrage', 'gore_charge'],
      speed: 1.6,
      damage: 1.7,
      bark: tr('Enough playing.'),
    },
  ],
});

boss({
  id: 'stormcrown_azhek',
  name: tr('Azhek'),
  title: tr('the Stormcrown'),
  family: 'elemental',
  minDepth: 12,
  biomes: ['foundry', 'voidspire', 'frostvault', 'desert', 'tundra'],
  lifeMul: 1.4,
  damageMul: 1.45,
  scale: 2.7,
  profile: 'glass',
  shape: 'phased',
  intro: tr('The air tastes of copper. Your hair is standing up and it is not fear.'),
  lootTier: 5,
  music: 'boss.storm',
  adds: ['lightning_wisp', 'arc_pylon', 'storm_djinn'],
  visual: { body: 'winged', palette: 'crystal.void|0x3a6ea8', ornate: 0.95, wings: true, eyes: 3, glow: 0xffee66 },
  phases: [
    {
      atLife: 1.0,
      name: tr('Static Build'),
      abilities: ['shock_bolt', 'chain_lightning', 'static_field'],
      bark: tr('Ground yourself. It will not be enough.'),
    },
    {
      atLife: 0.72,
      name: tr('Conduction'),
      abilities: ['summon_totem', 'chain_lightning', 'static_field', 'blink_away'],
      arena: 'sentries',
      bark: tr('My pylons will do the arithmetic.'),
    },
    {
      atLife: 0.42,
      name: tr('The Storm'),
      abilities: ['lightning_storm', 'chain_lightning', 'shrapnel_nova', 'teleport_strike'],
      arena: 'pillars',
      speed: 1.25,
      damage: 1.3,
      bark: tr('FIND SHELTER. THERE IS NONE.'),
    },
    {
      atLife: 0.14,
      name: tr('Discharge'),
      abilities: ['lightning_storm', 'static_field', 'enrage', 'death_explode'],
      arena: 'enrageTimer',
      speed: 1.4,
      damage: 1.6,
      bark: tr('ALL OF IT. AT ONCE.'),
    },
  ],
});

boss({
  id: 'hive_queen_zsarra',
  name: tr('Zsarra'),
  title: tr('Queen of the Deep Hive'),
  family: 'insect',
  minDepth: 13,
  biomes: ['hive'],
  lifeMul: 2.0,
  damageMul: 1.3,
  scale: 3.1,
  profile: 'swarm',
  shape: 'phased',
  intro: tr('The hive is not her home. The hive is her body, and you are inside it.'),
  lootTier: 5,
  music: 'boss.hive',
  adds: ['hive_drone', 'hornet_swarmer', 'royal_guard_beetle', 'hive_nurse'],
  visual: { body: 'insectoid', palette: 'metal.iron|0xc09a4a', ornate: 1.0, limbs: 6, wings: true, eyes: 6, glow: 0xffcc22 },
  phases: [
    {
      atLife: 1.0,
      name: tr('Royal Guard'),
      abilities: ['impale', 'quill_burst', 'summon_swarm'],
      arena: 'barrier',
      bark: tr('My guard will not tire. You will.'),
    },
    {
      atLife: 0.75,
      name: tr('The Laying'),
      abilities: ['summon_swarm', 'web_snare', 'acid_spit', 'heal_self'],
      arena: 'swarmCall',
      bark: tr('For every one you kill I make three.'),
    },
    {
      atLife: 0.45,
      name: tr('Flight'),
      abilities: ['swarm_dive', 'poison_spit', 'quill_burst', 'burrow_emerge'],
      speed: 1.4,
      damage: 1.25,
      bark: tr('Then I will come down to you.'),
    },
    {
      atLife: 0.16,
      name: tr('The Hive Screams'),
      abilities: ['quake_stomp', 'spore_burst', 'enrage', 'summon_swarm'],
      arena: 'enrageTimer',
      speed: 1.35,
      damage: 1.6,
      bark: tr('EVERY MOUTH IN THIS PLACE IS SCREAMING MY NAME.'),
    },
  ],
});

boss({
  id: 'lich_of_seven_seals',
  name: tr('Ordrach'),
  title: tr('Lich of the Seven Seals'),
  family: 'undead',
  minDepth: 15,
  biomes: ['crypt', 'voidspire', 'sunkenTemple', 'desertTomb'],
  lifeMul: 1.6,
  damageMul: 1.55,
  scale: 1.8,
  // Was 2.6: made smaller for the size spread, with its old reach so the fight is unchanged.
  reach: 2.6,
  profile: 'glass',
  shape: 'puzzle',
  intro: tr('Six seals are already broken. He is very close to whatever he wanted.'),
  lootTier: 5,
  music: 'boss.arcane',
  adds: ['bone_conjurer', 'gravebound_knight', 'barrow_shade'],
  visual: { body: 'humanoid', palette: 'cloth.linen|0x2e2c38', ornate: 1.0, eyes: 2, glow: 0x60ffb0 },
  phases: [
    {
      atLife: 1.0,
      name: tr('The Fifth Seal'),
      abilities: ['arcane_orb', 'curse_frailty', 'wall_of_bone', 'blink_away'],
      bark: tr('You are late. The work is nearly done.'),
    },
    {
      atLife: 0.75,
      name: tr('The Sixth Seal'),
      abilities: ['raise_dead', 'siphon_soul', 'homing_bolt', 'shield_self'],
      arena: 'barrier',
      bark: tr('My phylactery walks among the dead. Find it.'),
    },
    {
      atLife: 0.45,
      name: tr('The Seventh Seal'),
      abilities: ['void_rift', 'death_beam', 'gravity_well', 'teleport_strike'],
      arena: 'voidRifts',
      damage: 1.35,
      bark: tr('THE LAST SEAL BREAKS.'),
    },
    {
      atLife: 0.15,
      name: tr('Apotheosis'),
      abilities: ['death_beam', 'meteor', 'void_rift', 'enrage', 'raise_dead'],
      arena: 'enrageTimer',
      speed: 1.35,
      damage: 1.7,
      bark: tr('I AM NO LONGER A MAN. I AM A CONCLUSION.'),
    },
  ],
});

boss({
  id: 'magma_sovereign',
  name: tr('Ixthar'),
  title: tr('the Magma Sovereign'),
  family: 'demon',
  minDepth: 16,
  biomes: ['foundry', 'ashwaste', 'hell'],
  lifeMul: 2.1,
  damageMul: 1.5,
  scale: 3.3,
  profile: 'bruiser',
  shape: 'phased',
  intro: tr('The lava is not a hazard in this room. The lava is him, and he is standing up.'),
  lootTier: 6,
  music: 'boss.demon',
  adds: ['magma_ooze', 'ember_fiend', 'hellhound'],
  visual: { body: 'colossal', palette: 'crystal.void|0xb03a1a', ornate: 1.0, wings: true, tail: true, eyes: 4, glow: 0xff6600 },
  phases: [
    {
      atLife: 1.0,
      name: tr('Eruption'),
      abilities: ['heavy_slam', 'cone_breath_fire', 'lava_pool'],
      bark: tr('THE DEEP FIRE HAS A KING.'),
    },
    {
      atLife: 0.72,
      name: tr('Flowing Stone'),
      abilities: ['molten_trail', 'charge', 'flame_wave', 'lava_pool'],
      arena: 'lavaFloor',
      speed: 1.2,
      bark: tr('THE FLOOR IS MINE.'),
    },
    {
      atLife: 0.45,
      name: tr('Cooling Crust'),
      abilities: ['shield_self', 'summon_imps', 'meteor', 'ground_slam'],
      arena: 'pillars',
      damage: 1.3,
      bark: tr('STRIKE THE CRUST BEFORE IT HARDENS.'),
    },
    {
      atLife: 0.16,
      name: tr('Caldera'),
      abilities: ['firestorm', 'meteor', 'quake_stomp', 'enrage', 'death_explode'],
      arena: 'enrageTimer',
      speed: 1.35,
      damage: 1.7,
      bark: tr('THEN THE WHOLE MOUNTAIN COMES DOWN.'),
    },
  ],
});

boss({
  id: 'void_herald_shessi',
  name: tr('Shessi'),
  title: tr('Herald of the Hollow'),
  family: 'aberration',
  minDepth: 18,
  biomes: ['voidspire'],
  lifeMul: 1.8,
  damageMul: 1.65,
  scale: 2.7,
  // Was 3.0: made smaller for the size spread, with its old reach so the fight is unchanged.
  reach: 3.0,
  profile: 'glass',
  shape: 'phased',
  intro: tr('It is announcing something. The announcement is happening inside your skull.'),
  lootTier: 6,
  music: 'boss.void',
  adds: ['star_spawn', 'null_walker', 'whisper_wisp'],
  visual: { body: 'colossal', palette: 'crystal.void|0x4a2a6e', ornate: 1.0, limbs: 6, wings: true, eyes: 9, glow: 0xff00ff },
  phases: [
    {
      atLife: 1.0,
      name: tr('The Announcement'),
      abilities: ['mind_lash', 'void_rift', 'cone_breath_void'],
      bark: tr('IT IS COMING. I AM ONLY THE NOTICE.'),
    },
    {
      atLife: 0.75,
      name: tr('Unmaking the Floor'),
      abilities: ['void_rift', 'gravity_well', 'vortex_pull', 'homing_bolt'],
      arena: 'voidRifts',
      bark: tr('GEOMETRY IS A COURTESY. I WITHDRAW IT.'),
    },
    {
      atLife: 0.48,
      name: tr('Fracture'),
      abilities: ['mirror_images', 'teleport_strike', 'arcane_nova', 'death_beam'],
      arena: 'shatter',
      speed: 1.3,
      damage: 1.3,
      bark: tr('I AM NOT ONE THING.'),
    },
    {
      atLife: 0.18,
      name: tr('The Hollow Opens'),
      abilities: ['death_beam', 'void_rift', 'gravity_well', 'enrage', 'summon_adds'],
      arena: 'enrageTimer',
      speed: 1.4,
      damage: 1.8,
      bark: tr('LOOK UP. THAT IS NOT THE CEILING.'),
    },
  ],
});

boss({
  id: 'colossus_of_the_deep',
  name: tr('Vareth-Kar'),
  title: tr('Colossus of the Deep Foundry'),
  family: 'construct',
  minDepth: 20,
  biomes: ['foundry', 'sunkenTemple', 'voidspire'],
  lifeMul: 2.6,
  damageMul: 1.5,
  scale: 3.6,
  profile: 'sponge',
  shape: 'phased',
  intro: tr('You mistook it for architecture for a full minute. It let you.'),
  lootTier: 6,
  music: 'boss.foundry',
  adds: ['colossus_frame', 'arc_pylon', 'siege_automaton'],
  visual: { body: 'colossal', palette: 'metal.iron|0x8b8f96', ornate: 1.0, eyes: 4, glow: 0xffaa22 },
  phases: [
    {
      atLife: 1.0,
      name: tr('Foundation'),
      abilities: ['quake_stomp', 'ground_slam', 'grapple_pull'],
      bark: tr('STRUCTURAL INTEGRITY: NOMINAL.'),
    },
    {
      atLife: 0.78,
      name: tr('Load Bearing'),
      abilities: ['summon_totem', 'ballista_bolt', 'shrapnel_nova', 'ground_slam'],
      arena: 'sentries',
      bark: tr('THREAT ELEVATED. DEPLOYING BATTERIES.'),
    },
    {
      atLife: 0.5,
      name: tr('Collapse Sequence'),
      abilities: ['quake_stomp', 'charge', 'flame_wave', 'knockback_punt'],
      arena: 'collapse',
      speed: 1.2,
      damage: 1.3,
      bark: tr('CEILING SUPPORT COMPROMISED. THIS IS INTENTIONAL.'),
    },
    {
      atLife: 0.2,
      name: tr('Total Failure'),
      abilities: ['lightning_storm', 'quake_stomp', 'death_explode', 'enrage'],
      arena: 'enrageTimer',
      speed: 1.3,
      damage: 1.8,
      bark: tr('I WILL NOT FALL ALONE.'),
    },
  ],
});

boss({
  id: 'first_devourer',
  name: tr('Ghaal'),
  title: tr('the First Devourer'),
  family: 'ooze',
  minDepth: 22,
  biomes: ['hive', 'voidspire', 'caverns', 'swamp'],
  lifeMul: 2.8,
  damageMul: 1.6,
  scale: 3.5,
  profile: 'sponge',
  shape: 'phased',
  intro: tr('Everything that ever went missing down here is in there, and still awake.'),
  lootTier: 7,
  music: 'boss.ooze',
  adds: ['devourer_pudding', 'ooze_spawn', 'flesh_amalgam'],
  visual: { body: 'ooze', palette: 'flesh.rotted|0x8e2f2a', ornate: 1.0, limbs: 6, eyes: 9, glow: 0xff3366 },
  phases: [
    {
      atLife: 1.0,
      name: tr('The Mouth'),
      abilities: ['grapple_pull', 'heavy_slam', 'vortex_pull'],
      bark: '',
    },
    {
      atLife: 0.78,
      name: tr('Digestion'),
      abilities: ['split_self', 'corpse_burst', 'poison_spit', 'heal_self'],
      arena: 'shatter',
      bark: tr('Everything I have eaten is still screaming. Join the chorus.'),
    },
    {
      atLife: 0.5,
      name: tr('Regurgitation'),
      abilities: ['summon_adds', 'corpse_burst', 'plague_death', 'spore_burst'],
      arena: 'swarmCall',
      damage: 1.3,
      bark: tr('I will give some of them back. You will not enjoy it.'),
    },
    {
      atLife: 0.2,
      name: tr('Infinite Hunger'),
      abilities: ['vortex_pull', 'gravity_well', 'enrage', 'heavy_slam', 'execute_low'],
      arena: 'enrageTimer',
      speed: 1.35,
      damage: 1.9,
      bark: tr('STILL. HUNGRY.'),
    },
  ],
});

boss({
  id: 'the_gaunt_king',
  name: tr('The Gaunt King'),
  title: tr('Last Thing in the Deep'),
  family: 'demon',
  minDepth: 25,
  biomes: ['voidspire', 'ashwaste', 'crypt', 'hell'],
  lifeMul: 3.2,
  damageMul: 1.8,
  scale: 3.8,
  profile: 'bruiser',
  shape: 'phased',
  intro: tr('There is nothing below this floor. He is what the bottom looks like.'),
  lootTier: 8,
  music: 'boss.final',
  adds: ['balor_lieutenant', 'sin_eater', 'void_stalker', 'star_spawn'],
  visual: { body: 'colossal', palette: 'crystal.void|0x4a2a6e', ornate: 1.0, wings: true, tail: true, eyes: 6, glow: 0xff2060 },
  phases: [
    {
      atLife: 1.0,
      name: tr('Court of Ash'),
      abilities: ['cleave', 'flame_wave', 'gore_charge', 'terrify'],
      bark: tr('You came a long way down to die somewhere memorable.'),
    },
    {
      atLife: 0.8,
      name: tr('The Gaunt Retinue'),
      abilities: ['summon_adds', 'battle_cry', 'meteor', 'shield_self'],
      arena: 'barrier',
      bark: tr('My retinue first. I am not finished with my drink.'),
    },
    {
      atLife: 0.55,
      name: tr('Hollowing'),
      abilities: ['void_rift', 'death_beam', 'teleport_strike', 'gravity_well'],
      arena: 'voidRifts',
      speed: 1.25,
      damage: 1.35,
      bark: tr('Very well. Properly, then.'),
    },
    {
      atLife: 0.25,
      name: tr('Nothing Below'),
      abilities: ['firestorm', 'death_beam', 'quake_stomp', 'enrage', 'meteor', 'execute_low'],
      arena: 'enrageTimer',
      speed: 1.45,
      damage: 2.0,
      bark: tr('THERE IS NOTHING BELOW ME. THERE IS NOTHING ABOVE YOU.'),
    },
  ],
});

// ---------------------------------------------------------------------------

// The depth plan's twenty-eight (bosses2.ts).
for (const b of NEW_BOSSES) boss(b);
for (const b of DEEP_BOSSES) boss(b);

export const BOSSES: BossDef[] = ALL;

const BY_ID = new Map<string, BossDef>();
for (const b of ALL) BY_ID.set(b.id, b);

export function getBoss(id: string): BossDef | undefined {
  return BY_ID.get(id);
}

// ---------------------------------------------------------------------------
// Profiles and sizes
// ---------------------------------------------------------------------------

/**
 * Where a boss's numbers come from when the data leaves them out: the
 * profile's shares, times its tier. Life and damage stop climbing together,
 * so a late duelist still dies fast and a late sponge still barely hurts.
 * `defense` multiplies armour and resists; `range` is how close it fights.
 */
export const BOSS_PROFILES: Record<BossProfile, { life: number; damage: number; speed: number; defense: number; range: number }> = {
  duelist: { life: 0.6, damage: 1.6, speed: 1.25, defense: 1.2, range: 2.6 },
  bulwark: { life: 1.2, damage: 0.8, speed: 0.85, defense: 2.1, range: 3.4 },
  sponge: { life: 3.0, damage: 0.7, speed: 0.85, defense: 1.35, range: 3.6 },
  glass: { life: 0.7, damage: 1.4, speed: 1.05, defense: 1.0, range: 3.4 },
  swarm: { life: 0.8, damage: 0.9, speed: 1.0, defense: 1.2, range: 3.2 },
  bruiser: { life: 1.0, damage: 1.0, speed: 1.0, defense: 1.35, range: 3.4 },
};

/** A warden's share of a boss's life and damage at the same profile and tier. */
export const WARDEN_LIFE = 0.3;
export const WARDEN_DAMAGE = 0.6;

/**
 * Life climbs about 9% and damage about 3% per tier a boss first appears at
 * (to tier 40). Past tier 60, where the deep six live, both climb again, so
 * each of them stands above the one before it.
 */
export function bossTierMul(minDepth: number): { life: number; damage: number } {
  const t = Math.max(0, Math.min(40, minDepth) - 1);
  const deep = Math.max(0, minDepth - 60);
  return { life: 1 + 0.09 * t + 0.03 * deep, damage: 1 + 0.033 * t + 0.01 * deep };
}

/**
 * A boss's statline multipliers. Data that gives its own life and damage (the
 * first 24, tuned before profiles) keeps them, and its old speed, armour and
 * reach; everything else comes from the profile.
 */
export function bossNumbers(b: BossDef): { life: number; damage: number; speed: number; defense: number; range: number } {
  if (b.lifeMul !== undefined && b.damageMul !== undefined) return { life: b.lifeMul, damage: b.damageMul, speed: 1, defense: 1.35, range: 3.4 };
  const p = BOSS_PROFILES[b.profile];
  const t = bossTierMul(b.minDepth);
  // A warden is a minute's fight: a third of a boss's life, and gentler blows.
  if (b.warden) {
    t.life *= WARDEN_LIFE;
    t.damage *= WARDEN_DAMAGE;
  }
  return {
    life: b.lifeMul ?? p.life * t.life,
    damage: b.damageMul ?? p.damage * t.damage,
    speed: p.speed,
    defense: p.defense,
    range: p.range * Math.min(1, Math.max(0.7, (b.reach ?? b.scale) / 2.4)),
  };
}

/** How big a boss stands: the data's word, else its scale. */
export function bossSize(b: Pick<BossDef, 'size' | 'scale'>): BossSize {
  if (b.size) return b.size;
  if (b.scale <= 1.25) return 'person';
  if (b.scale < 1.9) return 'tall';
  if (b.scale < 3) return 'large';
  return 'giant';
}

/**
 * What the picker remembers: the bosses this character has fought (a life
 * does not meet one twice until its depth's pool is used up), and how often
 * the account has fought each (seen less, picked more).
 */
export interface BossMemory {
  met: readonly string[];
  seen: Readonly<Record<string, number>>;
}

/**
 * The boss for a run at `depth` in `biome`. Bosses of the biome first, and
 * near their introduction depth, so the fight is tier-appropriate rather than
 * randomly ancient. With a memory, a boss this life has met is skipped while
 * any other fits, and a boss the account has fought less is likelier.
 * Wardens are never picked here.
 */
export function pickBossForDepth(
  depth: number,
  biome: BiomeId,
  rng: { weighted<T>(a: readonly T[], w: (t: T) => number): T; pick<T>(a: readonly T[]): T },
  memory?: BossMemory | null,
): BossDef {
  const real = ALL.filter((b) => !b.warden);
  const eligible = real.filter((b) => b.minDepth <= depth);
  const pool = eligible.length ? eligible : [real[0]!];
  const inBiome = pool.filter((b) => b.biomes.includes(biome));
  let from = inBiome.length ? inBiome : pool;
  if (memory && memory.met.length) {
    const met = new Set(memory.met);
    const fresh = from.filter((b) => !met.has(b.id));
    // The biome's bosses are all met: any fresh one of the depth will do.
    const anyFresh = fresh.length ? fresh : pool.filter((b) => !met.has(b.id));
    if (anyFresh.length) from = anyFresh;
  }
  const seen = memory?.seen ?? {};
  const least = Math.min(...from.map((b) => seen[b.id] ?? 0));
  return rng.weighted(from, (b) => {
    const gap = depth - b.minDepth;
    // Sweet spot is 0-6 floors above the boss's introduction.
    const near = 1 / (1 + Math.pow(Math.max(0, gap - 3) / 8, 2));
    // Each fight more than the least-fought boss here halves its chance, to a floor.
    const extra = (seen[b.id] ?? 0) - least;
    return near * Math.max(0.15, Math.pow(0.5, extra));
  });
}

// ---------------------------------------------------------------------------
// Moods
// ---------------------------------------------------------------------------

/** What each mood is called and what it does, for the gate and the name card. */
export const BOSS_MOODS: Record<BossMood, { name: string; text: string }> = {
  wounded: { name: tr('Wounded'), text: tr('less life, but it hits a quarter harder') },
  crowned: { name: tr('Crowned'), text: tr('one more phase before it falls') },
  hungry: { name: tr('Hungry'), text: tr('it heals a little each time it hurts you') },
  ancient: { name: tr('Ancient'), text: tr('bigger, slower, and far more life') },
  haunted: { name: tr('Haunted'), text: tr('what it calls rises once more after dying') },
};

/** Moods start at this tier. */
export const MOOD_FROM = 15;

/**
 * A boss's mood for one run. None before tier 15; from there 70% of bosses
 * have one, climbing to all of them by tier 30. Haunted needs a boss that
 * calls adds.
 */
export function rollBossMood(def: BossDef, depth: number, rng: { next(): number }): BossMood | null {
  if (depth < MOOD_FROM || def.warden) return null;
  const chance = Math.min(1, 0.7 + ((depth - MOOD_FROM) / 15) * 0.3);
  if (rng.next() >= chance) return null;
  const all = Object.keys(BOSS_MOODS) as BossMood[];
  const legal = (def.adds?.length ?? 0) > 0 ? all : all.filter((m) => m !== 'haunted');
  return legal[Math.min(legal.length - 1, Math.floor(rng.next() * legal.length))]!;
}

/**
 * The boss as its mood makes it. Crowned adds a last phase (the last kit,
 * harder, no room rule); ancient is a fifth bigger, and its reach with it.
 * The rest change the fight, not the data (see `Boss`).
 */
export function withMood(def: BossDef, mood: BossMood | null): BossDef {
  if (mood === 'crowned') {
    const last = def.phases[def.phases.length - 1]!;
    const at = Math.min(0.15, last.atLife * 0.5);
    const crown: BossPhase = {
      atLife: at,
      name: tr('Crowned'),
      abilities: last.abilities.slice(),
      speed: (last.speed ?? 1) * 1.1,
      damage: (last.damage ?? 1) * 1.15,
      bark: tr('Not yet. Not by you.'),
    };
    return { ...def, phases: [...def.phases, crown] };
  }
  if (mood === 'ancient') return { ...def, scale: def.scale * 1.2, reach: (def.reach ?? def.scale) * 1.2 };
  return def;
}
