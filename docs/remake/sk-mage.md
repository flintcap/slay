# Stream: sk-mage (Wave 5: Mage skills remake)

Status: in progress

Class: Mage (code id `mage`). Trees: Fire, Lightning, Cold (`conflagration`, `tempest`, `frost`). Port 4353.
Fights with caster: staffs, wands, orbs (starts with a short staff). No basic attack, ever. Class color: violet (`0x9a8aff`), with fire, lightning and cold colors per tree.

Goal (owner): fix every Mage skill and remake the kit to a AAA
standard. Keep the skills that are good, change the ones that are close,
replace the ones that feel lackluster, and add new skills where the kit has
a gap. Fix everything about the rest. Speeds stay near the feel of
similar classes in Diablo II and Path of Exile (our own numbers and names,
never theirs).

Milestones 1 and 2 (skill audit and new kit plan) only read code and write
in this file, so they may run while skillcore is still working. Milestone 3
on needs skillcore: if `skillcore.md` does not say `Status: done` when you
finish milestone 2, push your file, set `Status: waiting for skillcore`, and
end with one line saying so; you will be resumed. Once it is done, read its
"Handover" and `CONTRACTS.md` first: time every skill through skillcore's
fields and speed function, never with new hard-coded seconds. Do not touch
code before skillcore is done.

Your files (Wave 5 file ownership in `PLAN.md`): the `CONFLAGRATION`, `TEMPEST` and `FROST` sections of `src/data/skills.ts`, plus your own
class's branches and entries in `src/scenes/SkillRunner.ts`,
`src/art/hero/SkillActions.ts`, `Swing.ts`, `Actions.ts`,
`src/fx/SkillLooks.ts`, `src/art/SkillIconArt.ts`, `src/art/Glyphs.ts`,
`src/data/skillPower.ts`, `src/audio/SkillSounds.ts`, `src/data/skillBends.ts`,
and the unique and set lines that name your skills. New effect files under
`src/fx/` are best. Never reformat or reorder another class's part of a
shared file.

Checkers (only what you touch): `node tools/run-checks.mjs --only=rankpower,skillparams,stattext,i18n,skillsound,iconmatch,skilldepth,passives`
and `curve` once at the end for your class only
(`node tools/check-curve.mjs --classes=mage`). Browser, one at a time, at
most once per milestone: `check-skills --classes=mage`, and if you must
look, one small contact sheet. Run `node tools/get-chrome.mjs` once before
the first browser check.

## Class notes

- Cast rate is the big question here. Check every spell's real cast time
  under skillcore's model, with no gear and with the most cast speed a
  hero can reach. Bolts must not come out like a machine gun.
- Each tree needs its own look: fire heavy and smoky, lightning sharp and
  bright, cold glassy and slow.

## Milestones

- [x] 1. Skill audit (read code only). (sk-mage: skill audit and new kit plan) For every skill, read its data, its runner code, its
  swing or cast animation, its effect, its icon and its sound, and answer
  in one table under "Notes for resume":
  - Does it work? (read the code; flag anything broken)
  - Melee: does it have its own swing, not a shared one?
  - Ranged and spells: does it have its own projectile, motion and effect?
  - Is the attack or cast too fast?
  - Is the icon unique to the skill, sharp, and in class colors?
  - Do the projectile, swing and effect look AAA?
  - Keep, change, or replace, with one line why.
- [x] 2. Plan the new kit (sk-mage: skill audit and new kit plan) (owner: change, add and replace skills where
  needed). Write the list under "Notes for resume": skills to keep, skills
  to change (what changes), skills to replace (the new skill's idea in one
  line) and new skills to add (where they go, their idea in one line).
  Each tree has 6 tiers x 3 columns = 18 slots (`tier` 1..6, `column`
  0..2 in `src/types.ts`); read `src/data/skills.ts` (or the class file)
  for how many are used. A full tree gains a skill only by replacing one.
  Keep prerequisites, synergies and capstones whole. Our own names and
  ideas, never copies. Then check `skillcore.md`: if it is not done, follow
  the waiting rule above.
- [x] 3. Speed audit (owner: before any skill is changed). (sk-mage: speed audit and release frame) Under skillcore's model, write a table
  under "Notes for resume": the Mage's basic attack (or, for a caster,
  its default cast) and every skill's real time per use, with no speed gear
  and at the speed ceiling, next to the feel of similar classes in the two
  reference games. Mark each one too fast, right, or too slow, and fix the
  numbers through skillcore's fields. This comes before any change to a
  skill. Owner rule: damage per hit never
  changes because of speed. A skill you slow down keeps the damage per hit
  it has today.
- [x] 4. Build. (sk-mage: spells module) Make the changes, replacements and new skills from the
  plan. Every skill, old and new:
  - works, with its tooltip telling the truth (`check-skillparams`,
    `check-stattext`)
  - gets stronger every rank (damage, strength, time, size), not only
    cheaper or faster (`skillPower` lines, `check-rankpower`)
  - melee: its own swing animation with a clear wind up, hit and follow
    through, timed to the skill's speed
  - ranged and spells: its own projectile or cast effect, motion and hit
  - its own sound (`check-skillsound`)
  - mana only, no new resources; caster weapons have no basic attack
  - synergies, skill bends and the uniques and sets that name it still
    point at real skills and real settings
  - old saves stay safe: removed or moved skills refund their points and
    leave the hotbar (check that `src/sim/Character.ts` still does this for your ids)
  - all player text through `tr()`, then extract strings (`check-i18n`)
- [x] 5. Icons. (sk-mage: icons) Repaint every icon so it is unique to its skill, sharp at
  skillcore's icon size, and in class colors, with each tree's own accent.
  Readable at hotbar size: one clear shape, strong light and dark.
- [ ] 6. Effects quality and cost. Projectiles, swings and hit effects look
  AAA in the game's dark and gritty style. No allocation in per-frame code;
  particle counts follow the quality ladder; every new effect pipeline has
  a stand-in in `warmup()` in `src/scenes/DungeonScene.ts`, so nothing
  compiles on first cast.
- [ ] 7. Check. `check-skills --classes=mage` once (one retry if it fails,
  then note it) and `check-curve --classes=mage` once, for
  information. If a depth is walled that was not before, do not raise
  damage per hit to make up for slower speed and never touch monsters:
  write the before and after numbers under "Notes for resume" for the
  owner to decide.
- [ ] 8. Handover. Fill "For skillqa" (what you could not check: looks in
  motion, real frame time, any effect you fear is costly) and "For the
  owner to test". Set `Status: done`, push.

## Next up

Milestones 1 to 5 are done. Next: milestone 6 (per-tree looks, cost,
`warmup()` stand-in), then 7 (check-skills and check-curve once each), 8.

## Notes for resume

### Milestone 1: skill audit (from the code on this branch, 2026-10-20)

How every Mage spell runs today (`src/scenes/SkillRunner.ts` `castNow`):

- Each skill runs through a shared handler picked by the family of its
  `effect` (`projectile`, `nova`, `beam`, `ground`...). No Mage skill has a
  handler of its own.
- Cast time: every spell is `castTime = 0.5 / max(0.4, 1 + castSpeed%)`.
  Buffs take 0.7 of that, Inferno (`channel`) 1.6 of it, Frost Step a fixed
  0.26 s. Cast speed caps at 200% (`sim/Stats.ts` line 583), so at the cap a
  spell takes 0.17 s: 6 a second. Heat Shimmer (up to 40%), Storm Fury (up
  to 35% plus 10% in stacks) and gear stack toward that cap.
- No cooldown on Firebolt, Sparkbolt, Frost Shard or Inferno.
- Projectiles spawn on the click, not on the gesture's release frame.
- Every active skill has its own gesture (`art/hero/gestures/mage.ts`), its
  own motif (`fx/SkillLooks.ts`) and its own cast sound
  (`audio/SkillSounds.ts`). Under that, the look is the family's shared
  drawing in a hue shifted by the skill id. Bolts of one element share one
  core style.
- Caster weapons have no basic attack (`basicAttack` returns false). Good.
- Icons: a shared glyph plus a small modifier (`art/SkillIconArt.ts`
  `ICON_MAP`). A passive with no damage type (19 of the 21 passives, and
  Ionize) is lit in class violet, not in its tree's element. Fire uses the
  flame glyph 7 times, Cold the flake 6 times, Lightning the bolt 6 times.
- Old saves: `sim/Character.ts` refunds ranks of any skill id no longer in
  the class's trees and takes it off the bar. A removed id is safe.

Key: OK = works as written. Speed "cap" = fine with no gear, too fast at
the cast-speed cap (0.17 s). Icon "violet" = lit in class colour, not the
tree's.

#### Fire (`conflagration`)

| Skill (tier.col) | Works? | Own projectile, motion, effect? | Too fast? | Icon | AAA look? | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Firebolt (1.0) | Mostly. Its 0.8 `radius` is both body size and hit lane, so it hits things 0.8 m off its line | Shared fire core, own motif (embers fan) | Cap; no cooldown, 6/s at the cap | flame+speed, shared glyph | Plain fire core | Keep; change body size, own smoky dart |
| Fire Mastery (1.1) | Text lies: says fire, gives all elemental damage (stacks with the other masteries) | Passive | - | flame+mastery, violet | - | Change: fire only |
| Ember Nova (1.2) | OK | Shared nova, own motif | Cap (cooldown limits it) | flame+nova | Shared ring | Keep |
| Flame Lance (2.0) | OK | Shared instant beam | Cap | beam+impact | Shared beam | Replace: Ice Lance in orange, third lance in the class |
| Scorch (2.1) | OK | Passive | - | flame+field, violet | - | Keep |
| Fireball (2.2) | Bug: its 3.2 m blast `radius` is also its body size and hit lane, so it flies as a core about 10 m wide and bursts on anything within 3.2 m of its path. Says lobbed, flies flat | Shared fire core | Cap | orb+speed, same as Ball Lightning | Oversized core | Keep; fix size and lane, real lob, heavy smoky blast |
| Inferno (3.0) | Works, but no cooldown at 200% (+34%/rank) per 0.8 s: the best fire single target. Hits only the first enemy | Thin beam, not a stream of flame | Cap | beam, same as Sky Lance | A laser, not fire | Change: a real stream of flame in a narrow cone |
| Kindling (3.1) | OK | Passive | - | flame, violet | - | Keep |
| Blast Wave (3.2) | OK (knockback 5, 0.3 s stun) | Shared nova | Cap | nova | Shared ring | Keep; heavier smoky blast |
| Pyroclasm (4.0) | OK | Own: eruptions walk out from the point | Cap | flame+rise | Eruptions are silent (no hit sound) | Keep; a sound per eruption |
| Combustion (4.1) | OK | Passive | - | nova+burst, violet | - | Keep |
| Heat Shimmer (4.2) | OK | Passive | Adds up to 40% cast speed | wave, violet | - | Keep; recheck in milestone 3 |
| Firestorm (5.0) | Works as a field that hits all in 8 m 3 times a second (text says "impacts") | Own field look | Cooldown 20 s | flame+rain | Own field | Keep |
| Searing Core (5.1) | OK | Passive | - | orb+aura, violet | - | Keep |
| Dragon's Breath (5.2) | OK | Shared cone, same drawing as Winter's Breath | Cap | wing+burst | Shared cone | Keep; own rolling gout of flame |
| Cataclysm (6.0) | OK (capstone; overkill chain in `DungeonScene`) | Passive | - | flame+chain | - | Keep |
| Annihilate (6.1) | Bug: the `point` branch calls `applyBuff`, so it puts an empty "Annihilate" buff on the hero for 10 s | Shared explosion, no build-up | Cooldown 30 s | sun | One plain blast | Keep; drop the buff, gather then blast |
| Ember Soul (6.2) | Text says fire, code raises all damage | Passive | - | skull, violet | - | Keep; fire only |

#### Lightning (`tempest`)

| Skill (tier.col) | Works? | Own projectile, motion, effect? | Too fast? | Icon | AAA look? | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Sparkbolt (1.0) | Text lies: promises a 40-110% roll, deals a flat 75%. `pierce: 1` pierces everything | Shared plasma core, flies straight | Cap; no cooldown | bolt | Plain core | Change: real wide roll, pierce one, erratic path |
| Lightning Mastery (1.1) | Text says lightning, gives all elemental | Passive | - | bolt+mastery, violet | - | Change: lightning only |
| Shock Nova (1.2) | OK | Shared nova | Cap | bolt+nova | Shared ring | Keep |
| Chain Lightning (2.0) | Bug: chain hits skip `afterHit`, so Storm Fury stacks, Scorch / Frostbite / Absolute Zero procs and crit riders never come from it. The first arc lands near the cursor with no reach or wall check | Shared arcs | Cap (cooldown 1.5 s, 0.74 s at rank 20) | bolt+chain | Thin arcs | Keep; fix the hits and the first arc |
| Thunderclap (2.1) | OK | Shared nova | Cooldown 10 s | hand+nova | Shared ring | Keep |
| Conductance (2.2) | Text lies: gives +5%/rank against any debuffed enemy (not only Shocked) and +4%/rank time on everything you apply (not +0.4 s on shocks) | Passive | - | coil, violet | - | Change: do what it says |
| Lightning Strike (3.0) | OK | Own sky bolt | Cap | cloud | Own strike | Keep |
| Forked (3.1) | OK | Passive | - | bolt+multi, violet | - | Keep |
| Tempest Orb (3.2) | Bug: its 5 m blast `radius` is the body size and hit lane: a giant core that bursts on anything within 5 m of its line | Shared core | Cooldown 7 s | orb | Oversized core | Replace: a second slow lightning orb beside Ball Lightning |
| Thunderstorm (4.0) | Works; also grants Overcharged (+25% elemental, +12 lightning) for 30 s, which the text never says | Own sky bolts | Cooldown 40 s | cloud+rain | Own | Keep; say what it grants |
| Storm Fury (4.1) | OK, but chain hits never build it | Passive | Adds up to 45% cast speed | bolt+burst, violet | - | Keep; recheck in milestone 3 |
| Ball Lightning (4.2) | Weak: all its "rolling" damage lands at once when it reaches the end; nothing it passes is hit | Shared core | Cooldown 5 s | orb+speed, same as Fireball | Plain core | Change: real rolling hits along the way |
| Sky Lance (5.0) | OK (resist pierce is an approximation) | Shared beam | Cap | beam, same as Inferno | Shared beam | Keep (the class's one beam) |
| Overload (5.1) | OK | Passive | - | orb+burst, violet | - | Keep |
| Ionize (5.2) | Bug: no damage type, so its field ticks unadvertised physical damage twice a second | Own field look | Cooldown 22 s | swirl+aura, violet | Own field | Change: debuff only, as written |
| The Eye of the Storm (6.0) | OK (capstone) | Own sky bolts | Cooldown 60 s | eye+aura | Own | Keep |
| Heaven's Gate (6.1) | OK | Own pillar field | Cooldown 28 s | bolt+field | Own | Keep |
| Storm Mastery (6.2) | OK | Passive | - | cloud+mastery, violet | - | Keep |

#### Cold (`frost`)

| Skill (tier.col) | Works? | Own projectile, motion, effect? | Too fast? | Icon | AAA look? | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Frost Shard (1.0) | OK | Shared ice shard body | Cap; no cooldown | flake+speed | Plain shard | Keep; glassy look |
| Cold Mastery (1.1) | Honest, but all elemental, so it stacks with the other two masteries | Passive | - | flake+mastery, violet | - | Change: cold only, like the other two |
| Frost Nova (1.2) | OK | Shared nova | Cap | flake+nova | Shared ring | Keep |
| Ice Lance (2.0) | OK | Shared instant beam | Cap | lance+impact | Shared beam | Change: a thrown lance of ice, not a beam |
| Frostbite (2.1) | OK | Passive | - | fang+aura, violet | - | Keep |
| Ice Armor (2.2) | OK (`frostArmor` with a ward) | Shared self burst | Buff | hexshield+aura | Shared | Keep |
| Glacial Spike (3.0) | OK | Shared shard | Cap | spikes+impact | Plain shard | Keep; heavy glassy burst |
| Shatterpoint (3.1) | OK | Passive | - | crack+aura, violet | - | Keep |
| Rime Field (3.2) | OK (its Chill lasts the field's 8 s) | Own field look | Cooldown 12 s | flake+field | Own field | Keep |
| Blizzard (4.0) | OK | Own field look | Cooldown 16 s | flake+rain | Own field | Keep |
| Permafrost (4.1) | OK | Passive | - | hourglass+aura, violet | - | Keep |
| Frost Step (4.2) | OK | Blink with a burst where you left | Fixed 0.26 s | footprints+aura | Shared blink | Keep |
| Frozen Orb (5.0) | Weak: all its damage lands at once at the end of its path; drawn as a big ice shard, not an orb | Shared shard body | Cooldown 6 s | orb+spin | Not an orb | Change: rolls and hits along the way, cracks open at the end |
| Heart of Winter (5.1) | OK, but a copy of Searing Core (same three stats, same sentence) | Passive | - | heart+field, violet | - | Replace |
| Winter's Breath (5.2) | OK | Shared cone, same drawing as Dragon's Breath | Cap | lungs+burst | Shared cone | Keep; own glassy fan of frost |
| Absolute Zero (6.0) | OK (capstone) | Passive | - | flake+cross | - | Keep |
| Glacial Comet (6.1) | OK | Falling ice (meteor) | Cooldown 20 s | star+impact | Own fall | Keep |
| Winter's Edge (6.2) | OK | Passive | - | split+aura, violet | - | Keep |

Also found while reading:

- Shatterpoint, Conductance and Absolute Zero all add the same "more damage
  against anything debuffed" number.
- Uniques that bend Mage skills (`data/uniqueBatches/batchC.ts`,
  `batchE.ts`): Fireball, Chain Lightning, Blizzard, Frozen Orb, Tempest
  Orb (Bottled Squall, batchC line 197), Firestorm, Frost Nova, Ice Lance.
- Lightning Strike's sky bolt plays the shared `spell.thunder` on top of
  its own hit sound (it fires after the quiet window).
- Hero damage over time (Burning, Immolated) ticks on the depth curve
  (`sim/Status.ts` `dotRate`), scaled only by `magnitude`, not by spell
  damage. A new damage-over-time skill grows through a `FOE_POWER`
  magnitude line.
- Flat elemental adds (`fireDamage`, `coldDamage`...) feed every elemental
  spell, whatever its element (`sim/Combat.ts` `rollDamage`).

### Milestone 2: the new kit

Every tree is full (18 of 18 slots), so each new skill takes the slot of
the one it replaces. Capstones, tiers and columns stay where they are.
Look direction per tree (class notes): fire heavy and smoky, lightning
sharp and bright, cold glassy and slow.

**Keep as they are (numbers may still move in milestone 3, icons in 5,
looks in 6):** Ember Nova, Scorch, Kindling, Combustion, Heat Shimmer,
Firestorm, Searing Core, Cataclysm; Shock Nova, Thunderclap, Lightning
Strike, Forked, Storm Fury, Sky Lance, Overload, The Eye of the Storm,
Heaven's Gate, Storm Mastery; Frost Nova, Frostbite, Ice Armor,
Shatterpoint, Rime Field, Blizzard, Permafrost, Frost Step, Absolute Zero,
Glacial Comet, Winter's Edge.

**Change:**

- Firebolt: body size apart from the hit lane (a new `size` knob; `radius`
  stays the lane at 0.4); own smoky dart look.
- Fire Mastery, Lightning Mastery, Cold Mastery: each raises only its own
  element (a per-element share added to `elementalDamagePct` for packets of
  that type, so it stays additive with gear). Text says so.
- Fireball: body `size` apart from the blast `radius` (the unique's
  `radius` bend keeps growing the blast); a real lob (`arc`); heavy smoky
  blast. Burn stacks land on everything in the blast: text says so.
- Inferno: a real stream of flame, not a beam: a narrow cone (7 m, about
  25 degrees) that hits everything in it, drawn as rolling flame. Damage
  per hit stays 200% (+34%/rank). Because it now hits a crowd, its mana
  cost rises (numbers in milestone 3, written down for the owner).
- Blast Wave, Dragon's Breath: own heavy smoky looks (Dragon's Breath a
  rolling gout, not the shared cone).
- Pyroclasm: a hit sound per eruption.
- Annihilate: no empty buff; the blast gathers at the point for a short
  telegraph, then goes off. Same damage.
- Ember Soul: raises fire damage only, as written.
- Sparkbolt: the wide roll it promises (40% to 110%, average 75%), pierces
  exactly one enemy as written, an erratic jittering path.
- Chain Lightning: its hits go through `afterHit` (Storm Fury, Scorch,
  Frostbite, Absolute Zero, crit riders), as an opt-in on the shared helper
  so Ricochet and Shield Throw stay as they are. The first arc must be in
  reach of the caster (14 m) and in line of sight.
- Conductance: does what it says: +5% damage per rank against Shocked
  enemies only, and +0.4 s per rank on the Shocked you apply.
- Thunderstorm: the text names the Overcharged buff it grants for its 30 s.
- Ball Lightning: really rolls: hits what it passes (a tick every 0.25 s
  within its 3 m) instead of everything at once at the end. Own crackling
  sphere look. Takes over Bottled Squall's bend (see below).
- Ionize: a debuff field only, no hidden physical ticks.
- Ice Lance: a thrown lance of ice that flies and pierces everything in
  its 14 m, leaving Brittle; no longer a beam. The unique's `length`,
  `width`, `duration` bends keep their meaning.
- Frozen Orb: rolls and chills what it passes (ticks along its path),
  drawn as a real orb, and cracks open at the end of its path, Freezing
  what stands within 3 m. Same damage per hit.
- Frost Shard, Glacial Spike, Winter's Breath: own glassy, slow cold looks
  (Winter's Breath a fan of frost crystals, not the shared cone).
- Every Mage passive gets its tree's damage type (`type`) so its icon is lit
  in the tree's element, not class violet. Passives are never cast, so the
  type changes nothing else (check before relying on it).

**Replace (new id in the same slot; old ids refund on load):**

- Flame Lance (fire 2.0) -> **Pyre Brand** (`pyreBrand`). A slow ember dart
  that brands one enemy: 90% spell damage (+15% per rank) as fire, and
  Immolated (the game's heavy burn) for 6 s, stronger every rank through a
  `FOE_POWER` magnitude. If the branded enemy dies while Immolated, the
  brand leaps to the nearest enemy within 6 m (+0.2 m per rank) with the
  time it had left. Fire's "spread it". Requires Firebolt; Inferno now
  requires Pyre Brand. Sound: the freed `skill.fire.lance` recording.
- Tempest Orb (lightning 3.2) -> **Stormstride** (`stormstride`), the class's
  missing fast move. You become a bolt and strike a point up to 9 m away
  (+0.15 m per rank), stopping at walls: 120% spell damage (+18% per rank)
  as lightning to everything along the path and 1 stack of Shocked.
  Requires Thunderclap; Ball Lightning now requires Stormstride. Sound: the
  freed `skill.storm.orb` / `skill.storm.orbHit` recordings.
- Heart of Winter (cold 5.1) -> **Splintering Frost** (`splinteringFrost`),
  passive. The blurb promises "shatter" and nothing in the tree did it: a
  Frozen or Brittle enemy you kill bursts into ice, dealing 25% of its
  maximum life (+2% per rank) as cold damage within 3 m (+0.1 m per rank)
  and Chilling what it hits. Requires Cold Mastery; Winter's Edge now
  requires Splintering Frost. Lives beside Combustion in the kill hook.

**Synergies and links that move with the replacements:**

- `syn('flameLance','firebolt',10)`, `syn('flameLance','infernoStream',6)`,
  `syn('infernoStream','flameLance',8)` become the same with `pyreBrand`
  (its synergy also grows the brand's magnitude).
- `syn('tempestOrb','ballLightning',8)`, `syn('tempestOrb','shockNova',6)`,
  `syn('ballLightning','tempestOrb',8)` become the same with `stormstride`.
- `syn('glacialComet','heartOfWinter',6)` becomes
  `syn('glacialComet','splinteringFrost',6)`.
- Bottled Squall (`data/uniqueBatches/batchC.ts` line 197) bends Ball
  Lightning: 20% more damage, 30% more `radius` (named "burst"), its hits
  Shock for 4 s.
- Gesture, motif, sound, icon and `SKILL_STATUS` rows for the three removed
  ids are deleted; the new ids get their own. Grep the old ids to zero.
- Starting skill (Firebolt) and the starting hints are unchanged.

**New skills to add:** none beyond the three replacements. Every slot is
taken, and the replacements fill the three real gaps: a fast move for the
Mage, a "spread it" skill for Fire, a shatter for Cold.

### Milestone 3: speed audit (skillcore's model, `sim/Speed.ts`)

How a Mage cast is timed now (read from the code after skillcore):

- Every Mage active is a spell (`skillTiming`: no attack family, and a
  staff is neither melee nor ranged). One use takes `castTime` seconds
  (default 0.5, self buffs 0.35, channels 0.8) divided by `castMult`.
- `castMult` = `speedMultiplier(castSpeed% + Storm Fury stacks)`: gain is
  100p/(p+100). `sim/Stats.ts` still clamps cast speed at 200%, Storm Fury's
  10 stacks add 10% on top, so the most a hero reaches is 210%: x1.68. A
  0.5 s spell then takes 0.30 s (3.35 a second), under the 3.4 ceiling.
  Before skillcore the same hero cast 6 a second.
- From the trees alone: Heat Shimmer rank 20 is +35% (x1.26, 0.40 s),
  Storm Fury rank 20 is +30% plus 10% in stacks (x1.28), both together +75%
  (x1.43, 0.35 s, 2.9 a second). Under the curve these are fair: keep
  their numbers.
- Frost Step stays a fixed 0.26 s blink (the teleport branch). Caster
  weapons have no basic attack; a Mage's "default cast" is the tier 1 bolt.
- Reference feel: a Diablo II caster casts about 1.9 a second with no gear
  and about 3.6 at its best; Path of Exile spells take 0.5 to 0.9 s base,
  big ones about 1 s. Light spells near 0.5 s, heavy ones slower.

No gear = 0% cast speed. Ceiling = 210% (x1.68). Seconds per cast.

| Skill | castTime now | No gear | Ceiling | Verdict | New castTime |
| --- | --- | --- | --- | --- | --- |
| Firebolt, Sparkbolt, Frost Shard (default casts) | 0.5 | 0.50 (2.0/s) | 0.30 (3.35/s) | Right: the Diablo II caster pace, not a machine gun | 0.5 |
| Ember Nova, Shock Nova, Frost Nova, Blast Wave, Thunderclap | 0.5 | 0.50 | 0.30 | Right | 0.5 |
| Chain Lightning, Lightning Strike, Ice Lance, Ionize, Rime Field | 0.5 | 0.50 | 0.30 | Right | 0.5 |
| Dragon's Breath, Winter's Breath, Ball Lightning, Frozen Orb | 0.5 | 0.50 | 0.30 | Right | 0.5 |
| Pyre Brand (new, Flame Lance's slot) | 0.5 | 0.50 | 0.30 | Right | 0.5 |
| Thunderstorm, Ice Armor (self buffs) | 0.35 | 0.35 | 0.29 (ceiling) | Right | 0.35 |
| Inferno (channel, a tick) | 0.8 | 0.80 | 0.48 | Right: same as before skillcore | 0.8 |
| Fireball | 0.5 | 0.50 | 0.30 | A little fast for a heavy lobbed blast | 0.6 (0.36 at the ceiling) |
| Glacial Spike | 0.5 | 0.50 | 0.30 | A little fast for a heavy spike | 0.6 |
| Sky Lance | 0.5 | 0.50 | 0.30 | A little fast for a lance from the sky | 0.6 |
| Pyroclasm | 0.5 | 0.50 | 0.30 | A little fast for a line of eruptions | 0.6 |
| The Eye of the Storm (capstone) | 0.5 | 0.50 | 0.30 | Too fast for a capstone call | 0.6 |
| Firestorm, Blizzard | 0.5 | 0.50 | 0.30 | Too fast for a storm called down | 0.65 (0.39) |
| Heaven's Gate | 0.5 | 0.50 | 0.30 | Too fast | 0.75 (0.45) |
| Glacial Comet | 0.5 | 0.50 | 0.30 | Too fast for a comet | 0.8 (0.48) |
| Annihilate (capstone) | 0.5 | 0.50 | 0.30 | Too fast: no build-up at all | 0.85 (0.51) |
| Frost Step | fixed 0.26 | 0.26 | 0.26 | Right (a blink) | unchanged |
| Stormstride (new) | - | - | - | A bolt over the ground | `travelTime(distance, 32)`: 0.28 s at 9 m |

- Every skill slowed above has a cooldown longer than its new cast, so its
  damage per second barely moves; damage per hit is unchanged.
- Release frame: every Mage spell but the channel and the blinks now lets
  go on its gesture's release frame (`beginAction(..., { release: true })`
  and `atRelease`), a third of the cast, at most 0.25 s. Mana and cooldown
  are paid on the press; a dodge before the release cancels the spell.
- Inferno's mana: it now hits everything in its cone, so a tick costs 12
  (+0.7 per rank), 25.3 at rank 20 (was 8, +0.4, 15.6). At no gear that is
  15 to 32 mana a second (was 10 to 20). For the owner: say if it drains
  too fast.

### Milestone 4: build notes

- `src/scenes/mage/Spells.ts` casts Fireball, Sparkbolt, Pyre Brand,
  Inferno, Annihilate, Chain Lightning, Stormstride, Ball Lightning, Ice
  Lance, Frozen Orb and Ionize, keyed by skill id, through a host on the
  runner's own pipeline (`landSpell`: tune, strike, afterHit). Movers
  (bolts, lances, orbs) are stepped every frame in sub-steps of 0.5 m and
  strike what they touch then. No other class's skill goes through it.
- Firebolt keeps the shared projectile branch; that branch now draws a
  body by `size` when a skill has one (lane stays `radius`).
- Forked now splits only Sparkbolt ("your bolts"). Before, Ball Lightning
  forked too, as it was a lightning projectile.
- Splintering Frost is 20% of the dead enemy's life (+1% per rank), 3 m
  (+0.1 m per rank), Chill 3 s: milder than the 25% (+2%) in the plan.
  Hooked in `DungeonScene.passiveOnKill` beside Combustion.
- Sounds: Pyre Brand casts with the freed `skill.fire.lance` and has no
  hit sound (no free fire recording, and recordings may not be shared).
  Stormstride casts with `skill.storm.orbHit` (0.22 s) and lands with
  `skill.storm.orb`.
- Pyroclasm: every eruption after the first replays its recording where
  it goes up.
- Pyre Brand's Immolated grows by rank (`FOE_POWER`); its synergies grow
  its hit, not the burn.

### Milestone 5: icons

- New glyphs in `src/art/Glyphs.ts`: `emberdart` (Pyre Brand), `stride`
  (Stormstride), `splinter` (Splintering Frost), `icicle` (Ice Lance, which
  drew a wooden jousting lance before).
- Duplicates fixed: Ball Lightning is now `orb^chain` (was Fireball's
  `orb^speed`); Inferno has its own icon name `inferno` -> `flame^burst`
  (the Ranger's Suppressing Fire keeps `stream`); Sky Lance is
  `beam^impact` (freed by Flame Lance).
- All 54 Mage skills now resolve to 54 different pictures. One contact
  sheet was looked at; the dart and icicle were thickened after it.
- Not done: many fire icons are still flame variants, and Sparkbolt and
  Chain Lightning differ only by the chain arc. A deeper repaint is for a
  later pass.

## For the owner to test

(empty)

## For skillqa

(empty)

## Handover

(empty)
