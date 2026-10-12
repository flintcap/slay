# Stream: fix-skillsound (one sound per skill, sounding like the skill)

Status: done

Owner's words: "im hearing different sounds for the same skill. skills need
one sound that sounds how the skill should sound. a blink should be a quick
air sound".

## Milestones

- [x] Survey: for every skill in the game (all classes, all trees), list
  which sound ids it plays on cast, in flight and on impact, and why the same
  skill can play different sounds. Written below.
  (fix-skillsound: one sound per skill, wired through SkillRunner (checkpoint))
- [x] One identity per skill: each skill always plays the same recording.
  One mapping table, `src/audio/SkillSounds.ts`; every id in it has one take.
  (fix-skillsound: one sound per skill, wired through SkillRunner (checkpoint))
- [x] Each sound fits what the skill is. 195 `skill.*` recordings built from
  the CC0 files already in the game (no new downloads), each in ASSETS.md.
  Blink 0.23 s, Shadow Step 0.27 s, Void Walk 0.28 s: air only.
  (fix-skillsound: one sound per skill, wired through SkillRunner (checkpoint))
- [x] Check: typecheck, `check-assets`, `check-audio`, new
  `check-skillsound`. Handover with the skill to sound table below.
  (fix-skillsound: quiet scope as begin/end, skill sound checker, drop orphaned sounds)

## Survey

Before this stream a skill had no sound of its own. `SkillRunner.cast` played
a sound per effect family and school, and the effects it drew (projectile,
nova, meteor, teleport...) each played their own on top. Most ids had 2 to 4
takes, picked at random every cast, so the same skill sounded different each
time. What each family played:

| Family | Sounds heard (takes) |
|---|---|
| projectile, bolt | `cast.<school>` twice (runner and projectile), then `impact.<school>` or `arrow.thunk`, plus `hit.pierce` |
| nova | `nova.<school>` |
| meteor | `shoot.physical` or `cast.<school>`, `spell.volley`, `spell.meteor`, `spell.explosion` |
| sky | `cast.<school>`, `spell.thunder` or `spell.meteor` |
| beam, channel | `beam.<school>`, `cast.<school>` |
| cone | `cone.<school>`, `cast.<school>` |
| chain | `spell.chainLightning` (Ricochet, a bow skill, crackled), `cast.<type>` per jump |
| dash | `player.evade`, `swing.<weapon>` |
| buffs, stances, shouts | `buff.<school>` or `warcry`, `spell.shield` |
| ground, trap, ward | `spell.summon` (bone and earth), `nova.<school>` |
| summon, minion | `spell.summon`, `spell.teleportIn` per minion |
| curse, debuff | `spell.curse` (Ignite played a ghost moan) |
| wave | `nova.physical`, `cast`, `boss.windup`, `boss.slam` |
| leap | `spell.teleportOut`, `spell.teleportIn`, `boss.windup`, `boss.slam`, `nova` |
| teleport (Blink) | `spell.teleportOut`, `spell.teleportIn` (3 takes each, one with a thump), `spell.explosion` |
| detonate | `spell.explosion`, `impact.<school>` |
| melee | `swing.<weapon>` or `swing.heavy`, then `hit.<weapon>` (3 to 4 takes), `hit.heavy`, body |

Why the same skill varied: (1) a random take from a pool on every play,
(2) shared ids picked by school or family, so a fire nova and a fire bolt
shared, (3) layers from the effects stacking on the runner's sound, (4) the
weapon's hit layer on every skill blow, so a skill sounded like whatever
weapon was held.

## Next up

Nothing. Done.

## Handover

What exists now:

- `src/audio/SkillSounds.ts`: one row per active skill (163), plus Sworn
  Brother's fighter. Three stages: `cast` (once, as it goes off), `hit`
  (where it lands; once per swing that connects, once per chain jump),
  `minion` (each attack of what it raised).
- `tools/audio/recipe.mjs` `SKILL_TAKES`: 195 `skill.*` ids, one take each,
  built from the CC0 files already in the game. Mix presets in
  `src/audio/Bank.ts` (minion, whoosh, landing, boom, spark, shout) keep
  them level with the rest of the sfx bus.
- `SkillRunner.cast` plays the skill's cast sound, wraps the family switch in
  `effects.beginQuiet()` / `endQuiet()` so nothing it draws makes a sound
  (now or when it lands), and plays the hit sound itself. Skill blows skip
  CombatFeel's weapon layer (`HitReport.skill`); the monster's body and voice
  still answer. Dash skills roll without the dodge sound. Summons play their
  skill's minion sound.
- `tools/check-skillsound.mjs`: every active skill has a row; every stage is
  a `skill.*` id with exactly one take, no alias, no fallback, no layer; a
  stage the family never plays is empty; summons have a minion sound;
  teleports are under 0.4 s. `--table` prints the table.
- Removed, nothing plays them now: `buff`, `buff.<school>`, `debuff`,
  `spell.curse`. The generic family ids stay: monsters still use them.

Left for later: nothing for this stream. Ears on it in a real run are the
only test left (no browser run was made, per the brief).

Skill to sound table (ids without the `skill.` prefix; every one is one
recording):

**Ranger: bows, traps and the wild**

| Skill | Kind | Cast | Hit | Minion |
|---|---|---|---|---|
| pierceShot | projectile | `bow.pierce` | `arrow.hit` |  |
| huntersMark | bolt | `bow.mark` | `arrow.mark` |  |
| aimedShot | projectile | `bow.heavy` | `arrow.heavy` |  |
| bleedingArrow | projectile | `bow` | `arrow.barb` |  |
| crippling | projectile | `bow` | `arrow.hit` |  |
| oneShot | projectile | `bow.heavy` | `arrow.heavy` |  |
| twinShot | projectile | `bow.twin` | `arrow.hit` |  |
| fanFire | projectile | `bow.fan` | `arrow.hit` |  |
| scattershot | cone | `bow.fan` |  |  |
| ricochet | chain | `bow` | `arrow.ricochet` |  |
| explosiveTip | projectile | `bow` | `fire.burst` |  |
| suppressing | beam | `bow.stream` |  |  |
| arrowRain | meteor | `bow.sky` | `arrow.rain` |  |
| darkenTheSky | meteor | `bow.sky` | `arrow.rain` |  |
| rollAway | dash | `roll` |  |  |
| disengage | dash | `leap.back` |  |  |
| snareTrap | nova | `trap.snare` |  |  |
| spikeTrap | nova | `trap.spike` |  |  |
| theWholeFloor | nova | `trap.field` |  |  |
| thornBarrier | cone | `thorns` |  |  |
| venomCoat | buff | `coat.venom` |  |  |
| camouflage | buff | `camo` |  |  |

**Warden: shield, steel and voice**

| Skill | Kind | Cast | Hit | Minion |
|---|---|---|---|---|
| shieldWall | buff | `shield.wall` |  |  |
| shieldBash | melee | `swing.shield` | `shield.bash` |  |
| guardStance | stance | `stance.guard` |  |  |
| shieldCharge | dash | `charge` | `shield.bash` |  |
| aegis | buff | `ward.aegis` |  |  |
| fortressStance | stance | `stance.fortress` |  |  |
| shieldThrow | projectile | `shield.throw` | `shield.ring` |  |
| cleave | melee | `swing.wide` | `hit.cleave` |  |
| rend | melee | `swing.blade` | `hit.rend` |  |
| gash | melee | `swing.blade` | `hit.gash` |  |
| overhead | melee | `swing.heavy` | `hit.crush` |  |
| sunder | melee | `swing.heavy` | `hit.sunder` |  |
| maim | melee | `swing.blade` | `hit.maim` |  |
| whirlwind | melee | `whirlwind` | `hit.whirl` |  |
| gorefeast | aoe | `gorefeast` |  |  |
| massacre | melee | `swing.flurry` | `hit.massacre` |  |
| ruin | melee | `swing.ruin` | `hit.ruin` |  |
| battleCry | shout | `shout.battle` |  |  |
| rallyingHorn | shout | `shout.rally` |  |  |
| intimidate | shout | `shout.fear` |  |  |
| tauntingRoar | shout | `shout.taunt` |  |  |
| heraldOfRuin | shout | `shout.herald` |  |  |
| bannerOfTheGate | banner | `banner` |  |  |
| swornBrother | passive |  |  | `clone.strike` |
| warStomp | aoe | `stomp` |  |  |
| earthshatter | wave | `quake` |  |  |

**Pyromancer: fire roars, light hums**

| Skill | Kind | Cast | Hit | Minion |
|---|---|---|---|---|
| firebolt | projectile | `fire.bolt` | `fire.hit` |  |
| emberNova | nova | `fire.nova` |  |  |
| flameLance | beam | `fire.lance` |  |  |
| fireball | projectile | `fire.ball` | `fire.blast` |  |
| infernoStream | channel | `fire.stream` |  |  |
| blastWave | nova | `fire.wave` |  |  |
| pyroclasm | ground | `fire.erupt` |  |  |
| firestorm | ground | `fire.storm` |  |  |
| dragonsBreath | cone | `fire.breath` |  |  |
| annihilate | point | `fire.annihilate` |  |  |
| ignite | apply | `fire.ignite` |  |  |
| ashCloud | ground | `fire.ash` |  |  |
| wallOfFlame | ground | `fire.wall` |  |  |
| immolate | aura | `fire.immolate` |  |  |
| emberField | ground | `fire.embers` |  |  |
| consumeAshes | self | `fire.consume` |  |  |
| livingFlame | summon | `fire.wisp` |  | `fire.wispShot` |
| funeralPyre | corpse | `fire.pyre` |  |  |
| ashenShroud | buff | `fire.shroud` |  |  |
| theLongBurn | capstone | `fire.longBurn` |  |  |
| arcaneBolt | projectile | `arcane.bolt` | `arcane.hit` |  |
| flameWard | buff | `fire.ward` |  |  |
| sunbrand | buff | `fire.brand` |  |  |
| blink | teleport | `blink` |  |  |
| radiance | aura | `light.radiance` |  |  |
| meteor | sky | `fire.meteorCall` | `fire.meteor` |  |
| supernova | nova | `supernova` |  |  |
| eclipse | ground | `eclipse` |  |  |
| sunsAnvil | ground | `fire.anvil` |  |  |
| lucentForm | buff | `light.form` |  |  |
| secondSun | capstone | `fire.sun` |  |  |
| heliosLance | channel | `fire.helios` |  |  |

**Shadowblade: quick steel, hiss and shadow**

| Skill | Kind | Cast | Hit | Minion |
|---|---|---|---|---|
| viperStrike | melee | `swing.quick` | `hit.viper` |  |
| coatBlades | buff | `coat.venom` |  |  |
| venomDart | projectile | `throw.dart` | `poison.dart` |  |
| noxiousCloud | ground | `poison.cloud` |  |  |
| plagueVial | projectile | `throw.vial` | `poison.vial` |  |
| envenomBurst | detonate | `poison.burst` |  |  |
| deathLotus | melee | `swing.lotus` | `hit.viper` |  |
| viperGod | summon | `viper` |  | `viper.bite` |
| shadowStep | teleport | `shadowStep` | `hit.backstab` |  |
| veil | buff | `veil` |  |  |
| smokeBomb | ground | `smoke` |  |  |
| shadowClone | summon | `clone` |  | `clone.strike` |
| umbralAmbush | melee | `swing.shadow` | `hit.ambush` |  |
| vanish | self | `vanish` |  |  |
| nightfall | ground | `nightfall` |  |  |
| voidWalk | teleport | `voidWalk` | `hit.backstab` |  |
| assassinate | melee | `swing.quick` | `hit.execute` |  |
| preciseCut | melee | `swing.quick` | `hit.precise` |  |
| fanOfKnives | projectile | `throw.fan` | `knife.hit` |  |
| crippleTendon | melee | `swing.quick` | `hit.tendon` |  |
| doubleStrike | melee | `swing.double` | `hit.precise` |  |
| whirlingBlades | dash | `dash.blades` | `hit.whirl` |  |
| throwingSpree | projectile | `throw.knife` | `knife.hit` |  |

**Stormcaller: snaps, thunder and wind**

| Skill | Kind | Cast | Hit | Minion |
|---|---|---|---|---|
| sparkbolt | projectile | `storm.spark` | `storm.sparkHit` |  |
| shockNova | nova | `storm.nova` |  |  |
| chainLightning | chain | `storm.chain` | `storm.arc` |  |
| thunderclap | nova | `storm.clap` |  |  |
| lightningStrike | sky | `storm.call` | `storm.strike` |  |
| tempestOrb | projectile | `storm.orb` | `storm.orbHit` |  |
| ballLightning | projectile | `storm.ball` | `storm.orbHit` |  |
| thunderstorm | buff | `storm.gather` |  |  |
| skyLance | beam | `storm.lance` |  |  |
| ionize | ground | `storm.ionize` |  |  |
| eyeOfTheStorm | capstone | `storm.eye` |  |  |
| heavensGate | ground | `storm.pillar` |  |  |
| stormveil | buff | `storm.veil` |  |  |
| skyfall | leap | `storm.skyfall` |  |  |
| chargeUp | buff | `storm.charge` |  |  |
| staticField | nova | `storm.static` |  |  |
| dischargeStrike | detonate | `storm.discharge` |  |  |
| lightningRod | summon | `storm.rod` |  | `storm.zap` |
| polarize | debuff | `storm.polarize` |  |  |
| overchargeSkill | buff | `storm.overcharge` |  |  |
| staticBurst | detonate | `storm.burst` |  |  |
| voltaicShield | buff | `storm.shield` |  |  |
| teslaCoil | summon | `storm.coil` |  | `storm.zap` |
| gust | cone | `wind.gust` |  |  |
| windStep | dash | `wind.step` |  |  |
| cyclone | ground | `wind.cyclone` |  |  |
| updraft | leap | `wind.updraft` |  |  |
| tempestDance | dash | `wind.dance` |  |  |
| shear | wave | `wind.shear` |  |  |
| hurricane | aura | `wind.hurricane` |  |  |
| maelstrom | ground | `wind.maelstrom` |  |  |

**Revenant: bone, earth, rot and the dead**

| Skill | Kind | Cast | Hit | Minion |
|---|---|---|---|---|
| boneSpear | projectile | `bone.spear` | `bone.spearHit` |  |
| raiseSkeleton | summon | `bone.raise` |  | `bone.slash` |
| boneArmor | buff | `bone.armor` |  |  |
| skeletalMage | summon | `bone.mage` |  | `bone.bolt` |
| boneSpirit | projectile | `bone.spirit` | `bone.spiritHit` |  |
| claySentinel | summon | `clay.raise` |  | `clay.slam` |
| boneCage | ground | `bone.cage` |  |  |
| boneStorm | aura | `bone.storm` |  |  |
| reassemble | minion | `bone.reassemble` |  | `bone.slash` |
| boneNova | nova | `bone.nova` |  |  |
| grandOssuary | summon | `bone.host` |  | `bone.slash` |
| weaken | curse | `curse.weaken` |  |  |
| amplifyDamage | curse | `curse.amplify` |  |  |
| terror | curse | `curse.terror` |  |  |
| doomBrand | curse | `curse.doom` |  |  |
| massConfusion | curse | `curse.confuse` |  |  |
| lowerResist | curse | `curse.lower` |  |  |
| blightBolt | projectile | `blight.bolt` | `blight.hit` |  |
| poisonNova | nova | `blight.nova` |  |  |
| pestilence | aura | `blight.aura` |  |  |
| corpseExplosion | corpse | `corpse.burst` |  |  |
| siphonLife | channel | `drain.siphon` |  |  |
| exsanguinate | channel | `drain.blood` |  |  |
| bloodPact | buff | `blood.pact` |  |  |
| sanguineNova | nova | `blood.nova` |  |  |
| gravechill | aura | `cold.grave` |  |  |
| soulCage | debuff | `soul.cage` |  |  |
| soulTether | debuff | `soul.tether` |  |  |
| revenantForm | buff | `revenant.form` |  |  |
| reaping | nova | `reap` |  |  |

## Notes for resume

- fix-uisound (done) already removed chimes and synths; read its handover
  in `docs/remake/fix-uisound.md` first.
- Rebuild one sound: `SLAY_AUDIO_SRC=/tmp/slay-downloads/fix-uisound/src
  node tools/build-audio.mjs --only=skill.blink`. The build reorders
  ASSETS.md; put the rows back in place before committing.
