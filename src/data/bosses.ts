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
 */

import type { BossDef, BiomeId } from '../types';

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
  name: 'Gharruth',
  title: 'the Bone King',
  family: 'undead',
  minDepth: 1,
  biomes: ['crypt', 'sunkenTemple'],
  lifeMul: 1.0,
  damageMul: 1.0,
  scale: 2.4,
  intro: 'A crown of vertebrae turns toward you. The throne room exhales dust.',
  lootTier: 1,
  music: 'boss.crypt',
  adds: ['skeleton_rattler', 'skeleton_archer'],
  visual: { body: 'colossal', palette: 'stone.crypt|0xd6cfb4', ornate: 0.85, eyes: 2, glow: 0x66ff99 },
  phases: [
    {
      atLife: 1.0,
      name: 'The Throned King',
      abilities: ['cleave', 'heavy_slam', 'bone_shard_spray'],
      bark: 'KNEEL BEFORE THE BONE THRONE.',
    },
    {
      atLife: 0.65,
      name: 'The Court Rises',
      abilities: ['raise_dead', 'wall_of_bone', 'cleave', 'ground_slam'],
      arena: 'barrier',
      damage: 1.1,
      bark: 'My court is endless. Cut them down and you will only tire.',
    },
    {
      atLife: 0.3,
      name: 'Crownfall',
      abilities: ['whirlwind', 'charge', 'shatter_death', 'enrage', 'quake_stomp'],
      arena: 'collapse',
      speed: 1.35,
      damage: 1.3,
      bark: 'THEN I WILL BURY US BOTH.',
    },
  ],
});

boss({
  id: 'broodmother_saelith',
  name: 'Sae-lith',
  title: 'the Brood Mother',
  family: 'insect',
  minDepth: 3,
  biomes: ['hive', 'caverns'],
  lifeMul: 1.05,
  damageMul: 0.95,
  scale: 2.6,
  intro: 'The webs are not decoration. They are a nervous system, and it just felt you.',
  lootTier: 1,
  music: 'boss.hive',
  adds: ['hive_drone', 'web_spinner', 'acid_larva'],
  visual: { body: 'arachnid', palette: 'flesh.rotted|0x3d4a35', ornate: 0.9, limbs: 8, eyes: 8, glow: 0x99ff33 },
  phases: [
    {
      atLife: 1.0,
      name: 'The Weaver',
      abilities: ['web_snare', 'acid_spit', 'impale'],
      bark: 'Ssssso many mouths to feed.',
    },
    {
      atLife: 0.7,
      name: 'The Clutch',
      abilities: ['summon_swarm', 'web_snare', 'poison_spit', 'burrow_emerge'],
      arena: 'swarmCall',
      bark: 'Meet my children.',
    },
    {
      atLife: 0.35,
      name: 'Blood of the Hive',
      abilities: ['spore_burst', 'quill_burst', 'summon_swarm', 'enrage', 'quake_stomp'],
      arena: 'enrageTimer',
      speed: 1.3,
      damage: 1.35,
      bark: 'THE HIVE IS ONE. THE HIVE IS ME.',
    },
  ],
});

boss({
  id: 'butcher_grell',
  name: 'Grell',
  title: 'the Butcher',
  family: 'demon',
  minDepth: 4,
  biomes: ['crypt', 'caverns', 'ashwaste'],
  lifeMul: 1.15,
  damageMul: 1.2,
  scale: 2.3,
  intro: 'The floor is tacky underfoot. Something enormous drags a hook across stone.',
  lootTier: 2,
  music: 'boss.demon',
  visual: { body: 'colossal', palette: 'flesh.rotted|0x8e2f2a', ornate: 0.8, eyes: 2, glow: 0xff3020 },
  phases: [
    {
      atLife: 1.0,
      name: 'Fresh Meat',
      abilities: ['cleave', 'charge', 'flesh_hooks'],
      bark: 'AHHH… FRESH MEAT!',
    },
    {
      atLife: 0.6,
      name: 'The Hook',
      abilities: ['grapple_pull', 'flesh_hooks', 'whirlwind', 'heavy_slam'],
      damage: 1.15,
      speed: 1.15,
      bark: 'COME CLOSER. I INSIST.',
    },
    {
      atLife: 0.25,
      name: 'Frenzy',
      abilities: ['whirlwind', 'gore_charge', 'execute_low', 'enrage'],
      arena: 'lavaFloor',
      speed: 1.5,
      damage: 1.4,
      bark: 'MORE! MORE! MORE!',
    },
  ],
});

boss({
  id: 'warden_calix',
  name: 'Calix',
  title: 'Warden of the Vault',
  family: 'construct',
  minDepth: 6,
  biomes: ['foundry', 'sunkenTemple'],
  lifeMul: 1.3,
  damageMul: 1.0,
  scale: 2.5,
  intro: 'Six centuries of standing perfectly still end in a single grinding step.',
  lootTier: 2,
  music: 'boss.foundry',
  adds: ['scarab_drone', 'clockwork_sentry'],
  visual: { body: 'colossal', palette: 'metal.iron|0x8b8f96', ornate: 0.8, eyes: 4, glow: 0xffaa22 },
  phases: [
    {
      atLife: 1.0,
      name: 'Protocol: Deny',
      abilities: ['ground_slam', 'shield_bash', 'sunder_armor'],
      bark: 'INTRUDER. AUTHORISATION REQUIRED.',
    },
    {
      atLife: 0.7,
      name: 'Protocol: Suppress',
      abilities: ['summon_totem', 'shrapnel_nova', 'ground_slam', 'ballista_bolt'],
      arena: 'sentries',
      bark: 'DEPLOYING COUNTERMEASURES.',
    },
    {
      atLife: 0.4,
      name: 'Protocol: Purge',
      abilities: ['flame_wave', 'quake_stomp', 'charge', 'static_field'],
      arena: 'pillars',
      damage: 1.25,
      bark: 'PURGE CYCLE ENGAGED. VACATE THE FLOOR.',
    },
    {
      atLife: 0.15,
      name: 'Core Breach',
      abilities: ['shrapnel_nova', 'lightning_storm', 'death_explode', 'enrage'],
      arena: 'enrageTimer',
      speed: 1.3,
      damage: 1.5,
      bark: 'CORE CONTAINMENT FAILING.',
    },
  ],
});

boss({
  id: 'hound_master_vess',
  name: 'Vess',
  title: 'the Hound Master',
  family: 'humanoid',
  minDepth: 5,
  biomes: ['caverns', 'ashwaste', 'crypt'],
  lifeMul: 0.9,
  damageMul: 1.1,
  scale: 1.9,
  intro: 'She does not fight you. She lets the pack do that, and watches.',
  lootTier: 2,
  music: 'boss.beast',
  adds: ['gorge_wolf', 'corpse_hound', 'pack_alpha'],
  visual: { body: 'humanoid', palette: 'cloth.linen|0x6a6255', ornate: 0.6, eyes: 2, glow: 0xff8822 },
  phases: [
    {
      atLife: 1.0,
      name: 'The Whistle',
      abilities: ['rally_pack', 'summon_adds', 'crossbow_bolt', 'caltrops'],
      arena: 'swarmCall',
      bark: 'Hunt.',
    },
    {
      atLife: 0.65,
      name: 'Loosed',
      abilities: ['summon_adds', 'arrow_volley', 'blink_away', 'haste_aura'],
      arena: 'darkness',
      speed: 1.2,
      bark: 'You cannot outrun what does not tire.',
    },
    {
      atLife: 0.3,
      name: 'Alpha',
      abilities: ['gore_charge', 'rend', 'enrage', 'ambush_leap'],
      speed: 1.45,
      damage: 1.4,
      bark: 'Fine. I will do it myself.',
    },
  ],
});

boss({
  id: 'ooze_sovereign',
  name: 'Ylph',
  title: 'the Sovereign Mass',
  family: 'ooze',
  minDepth: 7,
  biomes: ['caverns', 'sunkenTemple', 'hive'],
  lifeMul: 1.4,
  damageMul: 0.9,
  scale: 2.7,
  intro: 'It has eaten everything else in this chamber. The armour is still visible inside it.',
  lootTier: 2,
  music: 'boss.ooze',
  adds: ['ooze_spawn', 'acid_ooze'],
  visual: { body: 'ooze', palette: 'wood.oak|0x4a5c30', ornate: 0.7, eyes: 7, glow: 0x99ff33 },
  phases: [
    {
      atLife: 1.0,
      name: 'Engulf',
      abilities: ['heavy_slam', 'acid_spit', 'grapple_pull'],
      bark: '',
    },
    {
      atLife: 0.72,
      name: 'Division',
      abilities: ['split_self', 'corpse_burst', 'acid_spit', 'spore_burst'],
      arena: 'shatter',
      bark: 'The mass does not die. It divides.',
    },
    {
      atLife: 0.4,
      name: 'Acid Bloom',
      abilities: ['poison_spit', 'plague_death', 'spore_burst', 'vortex_pull'],
      arena: 'floodTide',
      damage: 1.3,
    },
    {
      atLife: 0.15,
      name: 'Reunion',
      abilities: ['vortex_pull', 'heavy_slam', 'enrage', 'corpse_burst'],
      speed: 1.35,
      damage: 1.5,
      bark: 'ALL OF IT COMES BACK TOGETHER.',
    },
  ],
});

// ---------------------------------------------------------------------------
// Depth 8-16 — the foundry, the temple, the frost vault
// ---------------------------------------------------------------------------

boss({
  id: 'archivist_moln',
  name: 'Moln',
  title: 'the Archivist',
  family: 'undead',
  minDepth: 9,
  biomes: ['crypt', 'sunkenTemple', 'voidspire'],
  lifeMul: 1.0,
  damageMul: 1.25,
  scale: 2.2,
  intro: 'Every book in this hall is a name. He has been waiting to add yours.',
  lootTier: 3,
  music: 'boss.arcane',
  adds: ['skeleton_rattler', 'bone_conjurer', 'watcher_eye'],
  visual: { body: 'humanoid', palette: 'cloth.linen|0x2e2c38', ornate: 0.8, eyes: 2, glow: 0x60ffb0 },
  phases: [
    {
      atLife: 1.0,
      name: 'Cataloguing',
      abilities: ['hex_bolt', 'arcane_orb', 'wall_of_bone', 'blink_away'],
      bark: 'Hold still. I am recording this.',
    },
    {
      atLife: 0.7,
      name: 'Marginalia',
      abilities: ['summon_totem', 'homing_bolt', 'curse_frailty', 'blink_away'],
      arena: 'sentries',
      bark: 'Footnotes. Everywhere. Read them or die ignorant.',
    },
    {
      atLife: 0.45,
      name: 'Errata',
      abilities: ['mirror_images', 'arcane_nova', 'gravity_well', 'teleport_strike'],
      arena: 'shatter',
      speed: 1.2,
      bark: 'Which of us is the original? Guess.',
    },
    {
      atLife: 0.18,
      name: 'The Final Entry',
      abilities: ['death_beam', 'void_rift', 'arcane_nova', 'enrage'],
      arena: 'voidRifts',
      damage: 1.45,
      bark: 'AND HERE THE RECORD ENDS.',
    },
  ],
});

boss({
  id: 'forgefather_hurn',
  name: 'Hurn',
  title: 'the Forgefather',
  family: 'construct',
  minDepth: 10,
  biomes: ['foundry', 'ashwaste'],
  lifeMul: 1.5,
  damageMul: 1.2,
  scale: 2.9,
  intro: 'The great hammer has not stopped falling in four hundred years. It stops now.',
  lootTier: 3,
  music: 'boss.foundry',
  adds: ['forge_smith', 'animated_armor', 'ember_wisp'],
  visual: { body: 'colossal', palette: 'metal.iron|0x8a5a34', ornate: 0.9, eyes: 4, glow: 0xff6600 },
  phases: [
    {
      atLife: 1.0,
      name: 'The Hammer',
      abilities: ['heavy_slam', 'ground_slam', 'charge'],
      bark: 'Steel is honest. You are not.',
    },
    {
      atLife: 0.72,
      name: 'The Quench',
      abilities: ['flame_wave', 'lava_pool', 'molten_trail', 'ground_slam'],
      arena: 'lavaFloor',
      damage: 1.15,
      bark: 'Into the fire, then.',
    },
    {
      atLife: 0.42,
      name: 'The Bellows',
      abilities: ['repair_construct', 'summon_adds', 'firestorm', 'shield_self'],
      arena: 'barrier',
      bark: 'My hands are many. Break them all.',
    },
    {
      atLife: 0.15,
      name: 'Whitehot',
      abilities: ['meteor', 'firestorm', 'quake_stomp', 'enrage', 'death_explode'],
      arena: 'enrageTimer',
      speed: 1.25,
      damage: 1.55,
      bark: 'THE FORGE TAKES US BOTH!',
    },
  ],
});

boss({
  id: 'tidewarden_nheru',
  name: 'Nheru',
  title: 'the Tidewarden',
  family: 'elemental',
  minDepth: 11,
  biomes: ['sunkenTemple', 'frostvault'],
  lifeMul: 1.25,
  damageMul: 1.15,
  scale: 2.5,
  intro: 'The water in this temple has been waiting a long time to be told what to do.',
  lootTier: 3,
  music: 'boss.temple',
  adds: ['sunken_zealot', 'frost_shard', 'tide_caller'],
  visual: { body: 'floating', palette: 'crystal.void|0x3a6ea8', ornate: 0.85, eyes: 3, glow: 0x40d0ff },
  phases: [
    {
      atLife: 1.0,
      name: 'Low Tide',
      abilities: ['frost_bolt', 'frozen_pulse', 'ice_nova'],
      bark: 'The sea remembers every drowning.',
    },
    {
      atLife: 0.7,
      name: 'The Surge',
      abilities: ['blizzard', 'vortex_pull', 'frost_bolt', 'summon_adds'],
      arena: 'floodTide',
      speed: 1.15,
      bark: 'Rise.',
    },
    {
      atLife: 0.38,
      name: 'Deep Freeze',
      abilities: ['ice_nova', 'blizzard', 'cone_breath_frost', 'shatter_death'],
      arena: 'iceField',
      damage: 1.3,
      bark: 'Stand still and I will make you a monument.',
    },
    {
      atLife: 0.14,
      name: 'Undertow',
      abilities: ['vortex_pull', 'gravity_well', 'blizzard', 'enrage'],
      speed: 1.3,
      damage: 1.4,
      bark: 'DOWN. ALL OF IT GOES DOWN.',
    },
  ],
});

boss({
  id: 'plaguelord_ossik',
  name: 'Ossik',
  title: 'the Plaguelord',
  family: 'undead',
  minDepth: 12,
  biomes: ['crypt', 'hive', 'sunkenTemple'],
  lifeMul: 1.55,
  damageMul: 1.0,
  scale: 2.8,
  intro: 'He is mostly other people. They are all still moving.',
  lootTier: 3,
  music: 'boss.crypt',
  adds: ['plague_ghoul', 'rotting_bloat', 'acid_larva'],
  visual: { body: 'colossal', palette: 'flesh.rotted|0x6f7a4a', ornate: 0.9, eyes: 9, glow: 0x9ce03a },
  phases: [
    {
      atLife: 1.0,
      name: 'Contagion',
      abilities: ['corpse_burst', 'poison_spit', 'heavy_slam'],
      bark: 'You are already breathing me in.',
    },
    {
      atLife: 0.68,
      name: 'Incubation',
      abilities: ['summon_adds', 'spore_burst', 'cone_breath_poison', 'heal_self'],
      arena: 'swarmCall',
      bark: 'Every corpse in this floor is an egg.',
    },
    {
      atLife: 0.35,
      name: 'Necrosis',
      abilities: ['plague_death', 'corpse_burst', 'poison_spit', 'vortex_pull', 'enrage'],
      arena: 'enrageTimer',
      damage: 1.4,
      speed: 1.2,
      bark: 'ROT WITH ME.',
    },
  ],
});

boss({
  id: 'gaze_of_uln',
  name: 'Uln',
  title: 'the Thousand Gaze',
  family: 'aberration',
  minDepth: 13,
  biomes: ['voidspire', 'sunkenTemple'],
  lifeMul: 1.1,
  damageMul: 1.35,
  scale: 2.6,
  intro: 'It does not have a front. Wherever you stand, you are being looked at.',
  lootTier: 4,
  music: 'boss.void',
  adds: ['watcher_eye', 'whisper_wisp'],
  visual: { body: 'floating', palette: 'crystal.void|0x4a2a6e', ornate: 1.0, eyes: 9, glow: 0xff40e0 },
  phases: [
    {
      atLife: 1.0,
      name: 'Observation',
      abilities: ['gaze_beam', 'homing_bolt', 'petrify_gaze'],
      bark: 'I SEE.',
    },
    {
      atLife: 0.72,
      name: 'Refraction',
      abilities: ['mirror_images', 'gaze_beam', 'arcane_nova', 'blink_away'],
      arena: 'shatter',
      bark: 'I SEE FROM EVERYWHERE.',
    },
    {
      atLife: 0.44,
      name: 'Focus',
      abilities: ['death_beam', 'gravity_well', 'petrify_gaze', 'summon_totem'],
      arena: 'sentries',
      damage: 1.25,
      bark: 'HOLD STILL. THIS IS DELICATE WORK.',
    },
    {
      atLife: 0.16,
      name: 'Blink',
      abilities: ['death_beam', 'void_rift', 'teleport_strike', 'enrage'],
      arena: 'darkness',
      speed: 1.35,
      damage: 1.5,
      bark: 'CLOSE YOUR EYES. IT WILL NOT HELP.',
    },
  ],
});

boss({
  id: 'rimeheart_valdr',
  name: 'Valdr',
  title: 'Rimeheart',
  family: 'elemental',
  minDepth: 14,
  biomes: ['frostvault'],
  lifeMul: 1.6,
  damageMul: 1.2,
  scale: 3.0,
  intro: 'A mountain of ice with something furious frozen at its centre.',
  lootTier: 4,
  music: 'boss.frost',
  adds: ['frost_shard', 'ice_revenant', 'rime_stag'],
  visual: { body: 'colossal', palette: 'crystal.void|0xa8dcf0', ornate: 0.95, eyes: 4, glow: 0x66ddff },
  phases: [
    {
      atLife: 1.0,
      name: 'Glacial',
      abilities: ['heavy_slam', 'ice_nova', 'cone_breath_frost'],
      bark: 'Cold enough to forget your own name.',
    },
    {
      atLife: 0.68,
      name: 'Whiteout',
      abilities: ['blizzard', 'frozen_pulse', 'charge', 'summon_adds'],
      arena: 'iceField',
      speed: 1.15,
      bark: 'You will not see the end coming.',
    },
    {
      atLife: 0.4,
      name: 'The Heart Shows',
      abilities: ['shatter_death', 'ice_nova', 'quake_stomp', 'blizzard'],
      arena: 'pillars',
      damage: 1.3,
      bark: 'Break the shell. I dare you.',
    },
    {
      atLife: 0.15,
      name: 'Thaw',
      abilities: ['enrage', 'gore_charge', 'quake_stomp', 'shatter_death'],
      speed: 1.45,
      damage: 1.5,
      bark: 'I HAVE BEEN COLD FOR A THOUSAND YEARS.',
    },
  ],
});

boss({
  id: 'ashen_prophet',
  name: 'Kaveh',
  title: 'the Ashen Prophet',
  family: 'humanoid',
  minDepth: 15,
  biomes: ['ashwaste', 'foundry'],
  lifeMul: 1.2,
  damageMul: 1.4,
  scale: 2.3,
  intro: 'He has been preaching to an empty waste for years. You are the first congregation.',
  lootTier: 4,
  music: 'boss.demon',
  adds: ['cultist_zealot', 'imp_scamperer', 'ember_fiend'],
  visual: { body: 'humanoid', palette: 'crystal.void|0xb03a1a', ornate: 0.85, wings: true, eyes: 2, glow: 0xff5500 },
  phases: [
    {
      atLife: 1.0,
      name: 'The Sermon',
      abilities: ['fire_bolt', 'flame_wave', 'curse_frailty'],
      bark: 'Listen. It is the last kindness I have.',
    },
    {
      atLife: 0.72,
      name: 'The Congregation',
      abilities: ['summon_imps', 'battle_cry', 'meteor', 'blink_away'],
      arena: 'barrier',
      bark: 'My flock will hold you while I finish.',
    },
    {
      atLife: 0.42,
      name: 'The Pyre',
      abilities: ['firestorm', 'lava_pool', 'meteor', 'flame_wave'],
      arena: 'lavaFloor',
      damage: 1.3,
      bark: 'BURN AND BE HONEST.',
    },
    {
      atLife: 0.15,
      name: 'Revelation',
      abilities: ['meteor', 'firestorm', 'death_explode', 'enrage', 'teleport_strike'],
      arena: 'enrageTimer',
      speed: 1.3,
      damage: 1.6,
      bark: 'I SEE IT NOW. SO WILL YOU.',
    },
  ],
});

boss({
  id: 'iron_conqueror',
  name: 'Malek',
  title: 'the Iron Conqueror',
  family: 'humanoid',
  minDepth: 16,
  biomes: ['foundry', 'crypt', 'ashwaste'],
  lifeMul: 1.7,
  damageMul: 1.3,
  scale: 2.5,
  intro: 'Full plate, no visor slit. Whatever is inside does not need to see.',
  lootTier: 4,
  music: 'boss.foundry',
  adds: ['animated_armor', 'gravebound_knight', 'skeletal_ballista'],
  visual: { body: 'armored', palette: 'metal.iron|0xc4ccd8', ornate: 0.95, eyes: 2, glow: 0x4080ff },
  phases: [
    {
      atLife: 1.0,
      name: 'The Line',
      abilities: ['cleave', 'shield_bash', 'sunder_armor', 'charge'],
      bark: 'Hold the line. I always do.',
    },
    {
      atLife: 0.7,
      name: 'The Wall',
      abilities: ['shield_self', 'summon_adds', 'ground_slam', 'battle_cry'],
      arena: 'barrier',
      bark: 'You will break on my shield before I break on your sword.',
    },
    {
      atLife: 0.4,
      name: 'The Charge',
      abilities: ['gore_charge', 'whirlwind', 'knockback_punt', 'quake_stomp'],
      arena: 'pillars',
      speed: 1.3,
      damage: 1.25,
      bark: 'ENOUGH DEFENCE.',
    },
    {
      atLife: 0.15,
      name: 'The Last Stand',
      abilities: ['execute_low', 'whirlwind', 'enrage', 'gore_charge'],
      arena: 'enrageTimer',
      speed: 1.5,
      damage: 1.6,
      bark: 'I HAVE NEVER LOST. I WILL NOT LEARN TODAY.',
    },
  ],
});

// ---------------------------------------------------------------------------
// Depth 17-28 — the void spire and the deep
// ---------------------------------------------------------------------------

boss({
  id: 'treant_elder_vhoss',
  name: 'Vhoss',
  title: 'Elder of the Drowned Grove',
  family: 'plant',
  minDepth: 17,
  biomes: ['sunkenTemple', 'caverns'],
  lifeMul: 1.9,
  damageMul: 1.15,
  scale: 3.2,
  intro: 'Roots have found every corpse in this temple and put them all to work.',
  lootTier: 4,
  music: 'boss.temple',
  adds: ['thorn_creeper', 'spore_pod', 'deathcap_priest'],
  visual: { body: 'colossal', palette: 'wood.oak|0x5a4a32', ornate: 0.9, eyes: 4, glow: 0x66ff88 },
  phases: [
    {
      atLife: 1.0,
      name: 'Deep Roots',
      abilities: ['thorn_lash', 'root_snare', 'ground_slam'],
      bark: '',
    },
    {
      atLife: 0.68,
      name: 'The Grove Wakes',
      abilities: ['summon_swarm', 'root_snare', 'spore_burst', 'heal_self'],
      arena: 'swarmCall',
      bark: 'The grove does not forgive axes.',
    },
    {
      atLife: 0.38,
      name: 'Blight',
      abilities: ['poison_spit', 'corpse_burst', 'thorn_lash', 'spore_burst'],
      arena: 'floodTide',
      damage: 1.3,
    },
    {
      atLife: 0.14,
      name: 'Deadfall',
      abilities: ['quake_stomp', 'enrage', 'root_snare', 'heavy_slam'],
      arena: 'collapse',
      speed: 1.25,
      damage: 1.45,
      bark: 'THEN WE ALL FALL TOGETHER.',
    },
  ],
});

boss({
  id: 'stalker_prime',
  name: 'Nul',
  title: 'the Stalker Prime',
  family: 'aberration',
  minDepth: 18,
  biomes: ['voidspire', 'caverns'],
  lifeMul: 1.2,
  damageMul: 1.6,
  scale: 2.2,
  intro: 'It was here before you opened the door. It has been here the whole time.',
  lootTier: 5,
  music: 'boss.void',
  adds: ['null_walker', 'void_stalker'],
  visual: { body: 'humanoid', palette: 'stone.crypt|0x4a4348', ornate: 0.7, limbs: 6, eyes: 0, glow: 0x8040ff },
  phases: [
    {
      atLife: 1.0,
      name: 'Unseen',
      abilities: ['stealth', 'teleport_strike', 'rend'],
      arena: 'darkness',
      bark: '',
    },
    {
      atLife: 0.7,
      name: 'The Hunt',
      abilities: ['teleport_strike', 'ambush_leap', 'flesh_hooks', 'summon_adds'],
      speed: 1.25,
      bark: 'You were never the hunter here.',
    },
    {
      atLife: 0.42,
      name: 'Many Knives',
      abilities: ['mirror_images', 'teleport_strike', 'double_swipe', 'phase_shift'],
      arena: 'shatter',
      speed: 1.35,
      damage: 1.3,
      bark: 'Which one is real? Neither answer saves you.',
    },
    {
      atLife: 0.15,
      name: 'Killing Blow',
      abilities: ['execute_low', 'teleport_strike', 'enrage', 'gore_charge'],
      speed: 1.6,
      damage: 1.7,
      bark: 'Enough playing.',
    },
  ],
});

boss({
  id: 'stormcrown_azhek',
  name: 'Azhek',
  title: 'the Stormcrown',
  family: 'elemental',
  minDepth: 19,
  biomes: ['foundry', 'voidspire', 'frostvault'],
  lifeMul: 1.4,
  damageMul: 1.45,
  scale: 2.7,
  intro: 'The air tastes of copper. Your hair is standing up and it is not fear.',
  lootTier: 5,
  music: 'boss.storm',
  adds: ['lightning_wisp', 'arc_pylon', 'storm_djinn'],
  visual: { body: 'winged', palette: 'crystal.void|0x3a6ea8', ornate: 0.95, wings: true, eyes: 3, glow: 0xffee66 },
  phases: [
    {
      atLife: 1.0,
      name: 'Static Build',
      abilities: ['shock_bolt', 'chain_lightning', 'static_field'],
      bark: 'Ground yourself. It will not be enough.',
    },
    {
      atLife: 0.72,
      name: 'Conduction',
      abilities: ['summon_totem', 'chain_lightning', 'static_field', 'blink_away'],
      arena: 'sentries',
      bark: 'My pylons will do the arithmetic.',
    },
    {
      atLife: 0.42,
      name: 'The Storm',
      abilities: ['lightning_storm', 'chain_lightning', 'shrapnel_nova', 'teleport_strike'],
      arena: 'pillars',
      speed: 1.25,
      damage: 1.3,
      bark: 'FIND SHELTER. THERE IS NONE.',
    },
    {
      atLife: 0.14,
      name: 'Discharge',
      abilities: ['lightning_storm', 'static_field', 'enrage', 'death_explode'],
      arena: 'enrageTimer',
      speed: 1.4,
      damage: 1.6,
      bark: 'ALL OF IT. AT ONCE.',
    },
  ],
});

boss({
  id: 'hive_queen_zsarra',
  name: 'Zsarra',
  title: 'Queen of the Deep Hive',
  family: 'insect',
  minDepth: 20,
  biomes: ['hive'],
  lifeMul: 2.0,
  damageMul: 1.3,
  scale: 3.1,
  intro: 'The hive is not her home. The hive is her body, and you are inside it.',
  lootTier: 5,
  music: 'boss.hive',
  adds: ['hive_drone', 'hornet_swarmer', 'royal_guard_beetle', 'hive_nurse'],
  visual: { body: 'insectoid', palette: 'metal.iron|0xc09a4a', ornate: 1.0, limbs: 6, wings: true, eyes: 6, glow: 0xffcc22 },
  phases: [
    {
      atLife: 1.0,
      name: 'Royal Guard',
      abilities: ['impale', 'quill_burst', 'summon_swarm'],
      arena: 'barrier',
      bark: 'My guard will not tire. You will.',
    },
    {
      atLife: 0.75,
      name: 'The Laying',
      abilities: ['summon_swarm', 'web_snare', 'acid_spit', 'heal_self'],
      arena: 'swarmCall',
      bark: 'For every one you kill I make three.',
    },
    {
      atLife: 0.45,
      name: 'Flight',
      abilities: ['swarm_dive', 'poison_spit', 'quill_burst', 'burrow_emerge'],
      speed: 1.4,
      damage: 1.25,
      bark: 'Then I will come down to you.',
    },
    {
      atLife: 0.16,
      name: 'The Hive Screams',
      abilities: ['quake_stomp', 'spore_burst', 'enrage', 'summon_swarm'],
      arena: 'enrageTimer',
      speed: 1.35,
      damage: 1.6,
      bark: 'EVERY MOUTH IN THIS PLACE IS SCREAMING MY NAME.',
    },
  ],
});

boss({
  id: 'lich_of_seven_seals',
  name: 'Ordrach',
  title: 'Lich of the Seven Seals',
  family: 'undead',
  minDepth: 22,
  biomes: ['crypt', 'voidspire', 'sunkenTemple'],
  lifeMul: 1.6,
  damageMul: 1.55,
  scale: 2.6,
  intro: 'Six seals are already broken. He is very close to whatever he wanted.',
  lootTier: 5,
  music: 'boss.arcane',
  adds: ['bone_conjurer', 'gravebound_knight', 'barrow_shade'],
  visual: { body: 'humanoid', palette: 'cloth.linen|0x2e2c38', ornate: 1.0, eyes: 2, glow: 0x60ffb0 },
  phases: [
    {
      atLife: 1.0,
      name: 'The Fifth Seal',
      abilities: ['arcane_orb', 'curse_frailty', 'wall_of_bone', 'blink_away'],
      bark: 'You are late. The work is nearly done.',
    },
    {
      atLife: 0.75,
      name: 'The Sixth Seal',
      abilities: ['raise_dead', 'siphon_soul', 'homing_bolt', 'shield_self'],
      arena: 'barrier',
      bark: 'My phylactery walks among the dead. Find it.',
    },
    {
      atLife: 0.45,
      name: 'The Seventh Seal',
      abilities: ['void_rift', 'death_beam', 'gravity_well', 'teleport_strike'],
      arena: 'voidRifts',
      damage: 1.35,
      bark: 'THE LAST SEAL BREAKS.',
    },
    {
      atLife: 0.15,
      name: 'Apotheosis',
      abilities: ['death_beam', 'meteor', 'void_rift', 'enrage', 'raise_dead'],
      arena: 'enrageTimer',
      speed: 1.35,
      damage: 1.7,
      bark: 'I AM NO LONGER A MAN. I AM A CONCLUSION.',
    },
  ],
});

boss({
  id: 'magma_sovereign',
  name: 'Ixthar',
  title: 'the Magma Sovereign',
  family: 'demon',
  minDepth: 23,
  biomes: ['foundry', 'ashwaste'],
  lifeMul: 2.1,
  damageMul: 1.5,
  scale: 3.3,
  intro: 'The lava is not a hazard in this room. The lava is him, and he is standing up.',
  lootTier: 6,
  music: 'boss.demon',
  adds: ['magma_ooze', 'ember_fiend', 'hellhound'],
  visual: { body: 'colossal', palette: 'crystal.void|0xb03a1a', ornate: 1.0, wings: true, tail: true, eyes: 4, glow: 0xff6600 },
  phases: [
    {
      atLife: 1.0,
      name: 'Eruption',
      abilities: ['heavy_slam', 'cone_breath_fire', 'lava_pool'],
      bark: 'THE DEEP FIRE HAS A KING.',
    },
    {
      atLife: 0.72,
      name: 'Flowing Stone',
      abilities: ['molten_trail', 'charge', 'flame_wave', 'lava_pool'],
      arena: 'lavaFloor',
      speed: 1.2,
      bark: 'THE FLOOR IS MINE.',
    },
    {
      atLife: 0.45,
      name: 'Cooling Crust',
      abilities: ['shield_self', 'summon_imps', 'meteor', 'ground_slam'],
      arena: 'pillars',
      damage: 1.3,
      bark: 'STRIKE THE CRUST BEFORE IT HARDENS.',
    },
    {
      atLife: 0.16,
      name: 'Caldera',
      abilities: ['firestorm', 'meteor', 'quake_stomp', 'enrage', 'death_explode'],
      arena: 'enrageTimer',
      speed: 1.35,
      damage: 1.7,
      bark: 'THEN THE WHOLE MOUNTAIN COMES DOWN.',
    },
  ],
});

boss({
  id: 'void_herald_shessi',
  name: 'Shessi',
  title: 'Herald of the Hollow',
  family: 'aberration',
  minDepth: 25,
  biomes: ['voidspire'],
  lifeMul: 1.8,
  damageMul: 1.65,
  scale: 3.0,
  intro: 'It is announcing something. The announcement is happening inside your skull.',
  lootTier: 6,
  music: 'boss.void',
  adds: ['star_spawn', 'null_walker', 'whisper_wisp'],
  visual: { body: 'colossal', palette: 'crystal.void|0x4a2a6e', ornate: 1.0, limbs: 6, wings: true, eyes: 9, glow: 0xff00ff },
  phases: [
    {
      atLife: 1.0,
      name: 'The Announcement',
      abilities: ['mind_lash', 'void_rift', 'cone_breath_void'],
      bark: 'IT IS COMING. I AM ONLY THE NOTICE.',
    },
    {
      atLife: 0.75,
      name: 'Unmaking the Floor',
      abilities: ['void_rift', 'gravity_well', 'vortex_pull', 'homing_bolt'],
      arena: 'voidRifts',
      bark: 'GEOMETRY IS A COURTESY. I WITHDRAW IT.',
    },
    {
      atLife: 0.48,
      name: 'Fracture',
      abilities: ['mirror_images', 'teleport_strike', 'arcane_nova', 'death_beam'],
      arena: 'shatter',
      speed: 1.3,
      damage: 1.3,
      bark: 'I AM NOT ONE THING.',
    },
    {
      atLife: 0.18,
      name: 'The Hollow Opens',
      abilities: ['death_beam', 'void_rift', 'gravity_well', 'enrage', 'summon_adds'],
      arena: 'enrageTimer',
      speed: 1.4,
      damage: 1.8,
      bark: 'LOOK UP. THAT IS NOT THE CEILING.',
    },
  ],
});

boss({
  id: 'colossus_of_the_deep',
  name: 'Vareth-Kar',
  title: 'Colossus of the Deep Foundry',
  family: 'construct',
  minDepth: 27,
  biomes: ['foundry', 'sunkenTemple', 'voidspire'],
  lifeMul: 2.6,
  damageMul: 1.5,
  scale: 3.6,
  intro: 'You mistook it for architecture for a full minute. It let you.',
  lootTier: 6,
  music: 'boss.foundry',
  adds: ['colossus_frame', 'arc_pylon', 'siege_automaton'],
  visual: { body: 'colossal', palette: 'metal.iron|0x8b8f96', ornate: 1.0, eyes: 4, glow: 0xffaa22 },
  phases: [
    {
      atLife: 1.0,
      name: 'Foundation',
      abilities: ['quake_stomp', 'ground_slam', 'grapple_pull'],
      bark: 'STRUCTURAL INTEGRITY: NOMINAL.',
    },
    {
      atLife: 0.78,
      name: 'Load Bearing',
      abilities: ['summon_totem', 'ballista_bolt', 'shrapnel_nova', 'ground_slam'],
      arena: 'sentries',
      bark: 'THREAT ELEVATED. DEPLOYING BATTERIES.',
    },
    {
      atLife: 0.5,
      name: 'Collapse Sequence',
      abilities: ['quake_stomp', 'charge', 'flame_wave', 'knockback_punt'],
      arena: 'collapse',
      speed: 1.2,
      damage: 1.3,
      bark: 'CEILING SUPPORT COMPROMISED. THIS IS INTENTIONAL.',
    },
    {
      atLife: 0.2,
      name: 'Total Failure',
      abilities: ['lightning_storm', 'quake_stomp', 'death_explode', 'enrage'],
      arena: 'enrageTimer',
      speed: 1.3,
      damage: 1.8,
      bark: 'I WILL NOT FALL ALONE.',
    },
  ],
});

boss({
  id: 'first_devourer',
  name: 'Ghaal',
  title: 'the First Devourer',
  family: 'ooze',
  minDepth: 29,
  biomes: ['hive', 'voidspire', 'caverns'],
  lifeMul: 2.8,
  damageMul: 1.6,
  scale: 3.5,
  intro: 'Everything that ever went missing down here is in there, and still awake.',
  lootTier: 7,
  music: 'boss.ooze',
  adds: ['devourer_pudding', 'ooze_spawn', 'flesh_amalgam'],
  visual: { body: 'ooze', palette: 'flesh.rotted|0x8e2f2a', ornate: 1.0, limbs: 6, eyes: 9, glow: 0xff3366 },
  phases: [
    {
      atLife: 1.0,
      name: 'The Mouth',
      abilities: ['grapple_pull', 'heavy_slam', 'vortex_pull'],
      bark: '',
    },
    {
      atLife: 0.78,
      name: 'Digestion',
      abilities: ['split_self', 'corpse_burst', 'poison_spit', 'heal_self'],
      arena: 'shatter',
      bark: 'Everything I have eaten is still screaming. Join the chorus.',
    },
    {
      atLife: 0.5,
      name: 'Regurgitation',
      abilities: ['summon_adds', 'corpse_burst', 'plague_death', 'spore_burst'],
      arena: 'swarmCall',
      damage: 1.3,
      bark: 'I will give some of them back. You will not enjoy it.',
    },
    {
      atLife: 0.2,
      name: 'Infinite Hunger',
      abilities: ['vortex_pull', 'gravity_well', 'enrage', 'heavy_slam', 'execute_low'],
      arena: 'enrageTimer',
      speed: 1.35,
      damage: 1.9,
      bark: 'STILL. HUNGRY.',
    },
  ],
});

boss({
  id: 'the_gaunt_king',
  name: 'The Gaunt King',
  title: 'Last Thing in the Deep',
  family: 'demon',
  minDepth: 32,
  biomes: ['voidspire', 'ashwaste', 'crypt'],
  lifeMul: 3.2,
  damageMul: 1.8,
  scale: 3.8,
  intro: 'There is nothing below this floor. He is what the bottom looks like.',
  lootTier: 8,
  music: 'boss.final',
  adds: ['balor_lieutenant', 'sin_eater', 'void_stalker', 'star_spawn'],
  visual: { body: 'colossal', palette: 'crystal.void|0x4a2a6e', ornate: 1.0, wings: true, tail: true, eyes: 6, glow: 0xff2060 },
  phases: [
    {
      atLife: 1.0,
      name: 'Court of Ash',
      abilities: ['cleave', 'flame_wave', 'gore_charge', 'terrify'],
      bark: 'You came a long way down to die somewhere memorable.',
    },
    {
      atLife: 0.8,
      name: 'The Gaunt Retinue',
      abilities: ['summon_adds', 'battle_cry', 'meteor', 'shield_self'],
      arena: 'barrier',
      bark: 'My retinue first. I am not finished with my drink.',
    },
    {
      atLife: 0.55,
      name: 'Hollowing',
      abilities: ['void_rift', 'death_beam', 'teleport_strike', 'gravity_well'],
      arena: 'voidRifts',
      speed: 1.25,
      damage: 1.35,
      bark: 'Very well. Properly, then.',
    },
    {
      atLife: 0.25,
      name: 'Nothing Below',
      abilities: ['firestorm', 'death_beam', 'quake_stomp', 'enrage', 'meteor', 'execute_low'],
      arena: 'enrageTimer',
      speed: 1.45,
      damage: 2.0,
      bark: 'THERE IS NOTHING BELOW ME. THERE IS NOTHING ABOVE YOU.',
    },
  ],
});

// ---------------------------------------------------------------------------

export const BOSSES: BossDef[] = ALL;

const BY_ID = new Map<string, BossDef>();
for (const b of ALL) BY_ID.set(b.id, b);

export function getBoss(id: string): BossDef | undefined {
  return BY_ID.get(id);
}

/**
 * Picks the floor boss. Prefers a boss matching the biome whose `minDepth` is
 * as close under the current depth as possible, so the encounter always feels
 * tier-appropriate rather than randomly ancient.
 */
export function pickBossForDepth(
  depth: number,
  biome: BiomeId,
  rng: { weighted<T>(a: readonly T[], w: (t: T) => number): T; pick<T>(a: readonly T[]): T },
): BossDef {
  const eligible = ALL.filter((b) => b.minDepth <= depth);
  const pool = eligible.length ? eligible : [ALL[0]!];
  const inBiome = pool.filter((b) => b.biomes.includes(biome));
  const from = inBiome.length ? inBiome : pool;
  return rng.weighted(from, (b) => {
    const gap = depth - b.minDepth;
    // Sweet spot is 0-6 floors above the boss's introduction.
    return 1 / (1 + Math.pow(Math.max(0, gap - 3) / 8, 2));
  });
}
