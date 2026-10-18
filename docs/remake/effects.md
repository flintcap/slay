# Stream: effects (Wave 4: skills, hits and deaths)

Status: in progress

Goal: every skill, hit and death looks and feels strong and readable, in a
dark and gritty style: embers, blood, frost, smoke, sparks. Never
cartoonish. Each skill keeps its own look; our own designs, not 1:1 copies of
another game. Effects grow with skill rank where the skill does (bigger,
denser), never only recoloured. WebGPU compute particles where it helps.
Particle counts scale with the quality ladder.

Checkers: `node tools/run-checks.mjs --only=<name>` for what you touch
(`check-skills` is a browser check, one at a time). Renders: at most one
small contact sheet per milestone, inside `flock /tmp/slay-browser.lock
timeout`. Run `node tools/get-chrome.mjs` once before the first browser check.

## Milestones

- [x] 1. Audit (read the code first, render only if needed): list every
  skill look, hit effect and death effect per class; rank the weakest under
  "Notes for resume".
- [x] 2. Hits: impact flash, sparks or splashes per damage type (physical,
  fire, cold, lightning, poison, holy, shadow), short hit decals, crits that
  read at a glance.
- [x] 3. Skills: upgrade the weakest skill looks class by class, starting
  with the worst ten from the audit.
- [x] 4. Deaths: per damage type (burn to ash, shatter when frozen, blood
  burst, dissolve to shadow), per monster size.
- [ ] 5. Warm-up: stand-ins in `warmup()` for late effect pipelines
  (`fx:solid-shard`, `fx:cores`, `fx:columns` from speed's notes) and for
  every new effect, so nothing compiles mid-fight.
- [ ] 6. Cost: a particle budget per quality level; no per-frame
  allocation in the code you touch.
- [ ] 7. Handover.

## Next up

1. Milestone 5: in `warmup()` (DungeonScene, small additive edit) add
   stand-ins for `fx:solid-shard`, `fx:cores`, `fx:columns`, the new
   `fx:solid-blade` and `fx:solid-buckler`, one field (`effects.field`) and
   one `selfCast`, and the HitFlash hidden material, so nothing compiles
   mid-fight.
2. Milestone 6: write the particle budget per quality level (fields,
   deaths, crits) under Notes; check the touched code makes no per-frame
   objects.
3. Milestone 7: Handover.

## Notes for resume

### Done in milestones 2 to 4 (wave two)

- Hits: `crit` emitter is a white flare, a crossed slash, a gold ring and
  long rays. Arcane hits draw a dark inward smoke so they read as shadow.
  Short element marks under crit or heavy non-physical hits
  (`CombatFeel.hit`, rate limited). There is no holy or shadow damage type
  in the game: shadow is the arcane look, holy lives in the paladin files.
- Deaths (`CombatFeel.onKill`, `DEATH_LOOK`): fire burns to ash and
  crumbles, cold frosts over, frozen or petrified non-boss bodies shatter
  and vanish, lightning cooks and smokes, poison melts, arcane sinks into
  shadow and vanishes, big physical kills spray blood, big bodies land
  with a thud. `HitFlash.deathLook` holds the body's burned or frozen
  colour until the corpse goes. New emitters live in `src/fx/Grit.ts`.
- Skills (worst ten from the audit): fields draw as what they are
  (`src/fx/Fields.ts`, `FIELD_LOOKS` in SkillLooks), self buffs rise from
  the caster (`effects.selfCast`), thrown knives and the shield fly as a
  blade and a buckler, particle pools are keyed on the school
  (`skillParticles`, no gib for untyped skills, bone for ossuary), motifs
  grow with rank (`rankSize`), field density grows with rank on High and
  up (`rankDensity`), Suppressing Fire draws a fan of arrows.
- SkillRunner.ts got visual call-site edits only (signature, projectile
  shape, selfCast, addZone draws a field, motif size, the arrow fan).
- The vfx lab (`tools/check-decals.mjs`, `crits` and `deaths` scenes added
  to `tools/vfxlab-entry.ts`) renders black frames for every scene, even
  the old `impacts` scene. It failed twice, so it was skipped; the looks
  are untested on screen (see For the owner to test).


### Audit (milestone 1, read from the code)

How a skill is drawn today: `SkillRunner.cast` picks a family handler from
the skill's `effect` (`nova`, `slam`, `projectile`...), each a method of
`EffectSystem` (`src/fx/Effects.ts`), fed a particle signature from
`particleFor(id, damageType)` (an emitter and wake from a per-type pool,
hashed by id) and then draws the skill's motif from `fx/SkillLooks.ts`
(`EffectSystem.motif`, shapes and motions in `fx/Motifs.ts`). Paladin
(`rite`, `vigil`: `scenes/paladin/*`, `fx/paladin/*`) and Shapeshifter
(`shift`: `fx/shifter/*`) have their own newer drawing and already take rank.

Families per class (active skills): mage 33 (projectile 8, ground 6, nova
5, beam 3, buff 2, cone 2, sky 2, chain, channel, point, capstone,
teleport); warden 25 (melee 10 plain swings, shout 5, buff 2, stance 2,
aoe 2, banner, dash, projectile, wave); shadowblade 23 (melee 7 plain,
projectile 4, ground 3, buff 2, summon 2, teleport 2, dash, detonate,
self); revenant 30 (curse 6, nova 4, summon 4, projectile 3, aura 3, buff
3, channel 2, debuff 2, ground, minion, corpse); ranger 22 (projectile 8,
nova 3, buff 2, cone 2, dash 2, meteor 2, beam, bolt, chain); paladin 32
(rite 20, vigil 12); shapeshifter 26 (shift). Plain weapon swings draw only
the swing by the owner's call (no motif).

Hits today: `EffectSystem.impact` (school burst `hit.<school>`, flash light,
floor mark for scale > 0.55, trauma); `meleeHit` (steel sparks + slash +
element); `Enemy.takeDamage` adds the body's material burst (blood, bone
chips, stone chips, ichor, sparks) and a floor mark for physical hits;
`CombatFeel.hit` adds the white body flash, kick, shove and sounds. Crits:
`crit` burst (white flare + gold sparks) plus a stronger flash. The game has
six damage types (`types.ts`): physical, fire, cold, lightning, poison,
arcane; bone is a look only. There is no holy or shadow damage: shadow is
drawn as arcane void, the Paladin's holy look lives in its own files.

Deaths today: `Enemy.die` throws the material burst (26) and a decal by
material (gore + blood, ash, bone, stain); `CombatFeel.onKill` adds a flash
and an element burst (`DEATH_BURST`: gib, explosion, frost, shock, poison,
void) scaled by size, plus gibs for non-physical. The body collapses and
sinks the same way for every death (`Enemy.tickDeath`, 1.16 s).

Weakest, worst first:
1. Ground fields (firestorm, pyroclasm, blizzard, rimeField, noxiousCloud,
   smokeBomb, nightfall, ionize, heavensGate, boneCage): for their whole
   life they draw a summoning circle (rune circle, light column, rising
   runes and skulls) in the school colour. Skulls in a blizzard.
2. Untyped skills burst from the physical pool because `particleFor` keys on
   damage type, not school: guardStance, fortressStance, bannerOfTheGate,
   boneArmor, bloodPact, ionize, nightfall, boneCage throw gore chunks
   (`gib`); camouflage, vanish, rallyingHorn throw steel sparks.
3. Self buffs, stances, shouts, banners (23 skills): drawn as an impact on
   your own chest (sparks and a slash sprite for physical). No rising
   power, no ground ring.
4. Thrown weapons drawn as arrows: shieldThrow, fanOfKnives, throwingSpree
   (every physical projectile is an arrow solid).
5. Death by fire is a generic fireball; no burn to ash.
6. Death by cold ignores a frozen body; no shatter.
7. Death by arcane is a small void puff; no dissolve into shadow.
8. Crits add a flare and gold sparks only; nothing shaped that reads at a
   glance.
9. No skill look grows with rank except where the radius grows; motifs are
   a fixed size.
10. suppressing (beam, physical) is a pale laser for a volley of arrows.

## For the owner to test

(Add one line per item: what to try and what should happen.)

- Land a crit: a white flash, a crossed slash and gold rays read at once.
- Kill with fire: the body goes dark, puffs ash, then crumbles.
- Kill a frozen monster: it shatters into ice and is gone at once.
- Kill with lightning, poison, arcane: smoke and scorch, a green melt, a
  dark sink that vanishes.
- Kill a big monster with a sword: a blood spray and a heavy thud.
- Cast Firestorm, Blizzard, Noxious Cloud, Smoke Bomb, Nightfall, Ionize:
  each shows its own field (falling cinders, snow, green fog, grey smoke,
  dark pool, crawling sparks), no rune circle.
- Cast a buff, a stance and a war cry: power rises from you; a war cry
  pushes a ring out to its reach.
- Fan of Knives and Throwing Spree throw knives; Shield Throw throws a
  spinning shield.
- Hold Suppressing Fire: a stream of arrows, not a laser.
- On High or Ultra, a rank 20 field looks denser than rank 1, and motifs a
  bit bigger.
- On Low with three fields up, the frame rate holds.

## Handover

(Written when every milestone is ticked.)
