# Stream: sk-rogue (Wave 5: Rogue skills remake)

Status: in progress

Class: Rogue (code id `shadowblade`). Trees: Venom, Shadowcraft, Bladework (`venom`, `shadowcraft`, `bladework`). Port 4354.
Fights with melee and thrown: daggers, often two at once (starts with two daggers). Class color: green (`0x5ad18f`).

Goal (owner): fix every Rogue skill and remake the kit to a AAA
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

Your files (Wave 5 file ownership in `PLAN.md`): the `VENOM`, `SHADOWCRAFT` and `BLADEWORK` sections of `src/data/skills.ts`, plus your own
class's branches and entries in `src/scenes/SkillRunner.ts`,
`src/art/hero/SkillActions.ts`, `Swing.ts`, `Actions.ts`,
`src/fx/SkillLooks.ts`, `src/art/SkillIconArt.ts`, `src/art/Glyphs.ts`,
`src/data/skillPower.ts`, `src/audio/SkillSounds.ts`, `src/data/skillBends.ts`,
and the unique and set lines that name your skills. New effect files under
`src/fx/` are best. Never reformat or reorder another class's part of a
shared file.

Checkers (only what you touch): `node tools/run-checks.mjs --only=rankpower,skillparams,stattext,i18n,skillsound,iconmatch,skilldepth,passives`
and `curve` once at the end for your class only
(`node tools/check-curve.mjs --classes=shadowblade`). Browser, one at a time, at
most once per milestone: `check-skills --classes=shadowblade`, and if you must
look, one small contact sheet. Run `node tools/get-chrome.mjs` once before
the first browser check.

## Class notes

- The owner named Precise Cut as WAY too fast. Fix it first and check
  every other quick skill the same way, alone and with two blades.
- Quick does not mean a blur. Each cut must still be seen: a clear wind up,
  a clear hit, a clear follow through.

## Milestones

- [ ] 1. Skill audit (read code only). For every skill, read its data, its runner code, its
  swing or cast animation, its effect, its icon and its sound, and answer
  in one table under "Notes for resume":
  - Does it work? (read the code; flag anything broken)
  - Melee: does it have its own swing, not a shared one?
  - Ranged and spells: does it have its own projectile, motion and effect?
  - Is the attack or cast too fast?
  - Is the icon unique to the skill, sharp, and in class colors?
  - Do the projectile, swing and effect look AAA?
  - Keep, change, or replace, with one line why.
- [ ] 2. Plan the new kit (owner: change, add and replace skills where
  needed). Write the list under "Notes for resume": skills to keep, skills
  to change (what changes), skills to replace (the new skill's idea in one
  line) and new skills to add (where they go, their idea in one line).
  Each tree has 6 tiers x 3 columns = 18 slots (`tier` 1..6, `column`
  0..2 in `src/types.ts`); read `src/data/skills.ts` (or the class file)
  for how many are used. A full tree gains a skill only by replacing one.
  Keep prerequisites, synergies and capstones whole. Our own names and
  ideas, never copies. Then check `skillcore.md`: if it is not done, follow
  the waiting rule above.
- [ ] 3. Speed audit (owner: before any skill is changed). Under skillcore's model, write a table
  under "Notes for resume": the Rogue's basic attack (or, for a caster,
  its default cast) and every skill's real time per use, with no speed gear
  and at the speed ceiling, next to the feel of similar classes in the two
  reference games. Mark each one too fast, right, or too slow, and fix the
  numbers through skillcore's fields. This comes before any change to a
  skill. Owner rule: damage per hit never
  changes because of speed. A skill you slow down keeps the damage per hit
  it has today.
- [ ] 4. Build. Make the changes, replacements and new skills from the
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
- [ ] 5. Icons. Repaint every icon so it is unique to its skill, sharp at
  skillcore's icon size, and in class colors, with each tree's own accent.
  Readable at hotbar size: one clear shape, strong light and dark.
- [ ] 6. Effects quality and cost. Projectiles, swings and hit effects look
  AAA in the game's dark and gritty style. No allocation in per-frame code;
  particle counts follow the quality ladder; every new effect pipeline has
  a stand-in in `warmup()` in `src/scenes/DungeonScene.ts`, so nothing
  compiles on first cast.
- [ ] 7. Check. `check-skills --classes=shadowblade` once (one retry if it fails,
  then note it) and `check-curve --classes=shadowblade` once, for
  information. If a depth is walled that was not before, do not raise
  damage per hit to make up for slower speed and never touch monsters:
  write the before and after numbers under "Notes for resume" for the
  owner to decide.
- [ ] 8. Handover. Fill "For skillqa" (what you could not check: looks in
  motion, real frame time, any effect you fear is costly) and "For the
  owner to test". Set `Status: done`, push.

## Next up

Start milestone 1 (skill audit). Do not touch code before skillcore is
done.

## Notes for resume

### Milestone 1: skill audit (read from the code on 2026-10-20)

How the code runs a Rogue skill today (all in `src/scenes/SkillRunner.ts`
`castNow` unless named):

- Melee skills (`melee`/`cleave` family): `attackTime = 0.42 / (1 + attack
  speed %)`, x1.35 with two blades (`DUAL_SKILL_TIME`), / (1 + `speedBonus`).
  Damage waits for the clip's contact (`contactDelay` in `Player.ts`, capped
  at 0.16 s). Two blades: a one-blow skill splits 60/40 over two blows, the
  left one from `Player.handBlow` (`attack2`); a multi-hit skill spaces its
  blows `min(0.08, time x 0.8 / hits)` apart.
- Throws and spells (`projectile`, `ground`, `detonate`, `summon`): `castTime
  = 0.5 / (1 + CAST speed %)`. Thrown knives and darts ignore attack speed.
- Buffs (`buff`, `self`): `castTime x 0.7` = 0.35 s. Blinks (`teleport`):
  0.26 s fixed. Dashes: `Player.dodge`, 0.32 to 0.5 s by distance, fixed.
- Basic attack: 0.42 s with one blade; two blades take turns, 0.32 s per
  blade (3.1 blows a second).
- Body: eight blade skills play a plain move from `PLAIN_MOVES` in
  `src/art/hero/SkillActions.ts` (the basic attack's own swings, shared);
  the other fifteen actives have their own gesture in
  `src/art/hero/gestures/rogue.ts` (none is a weapon blow with `hit: true`).
- Look: each skill's family handler plus one motif (`src/fx/SkillLooks.ts`);
  the eight blade skills have no motif (owner's earlier call). Only Fan of
  Knives and Throwing Spree have a thrown shape (`THROWN_SHAPES`, a knife).
- Icons: every Rogue icon is a shared glyph plus a modifier (`ICON_MAP` in
  `src/art/SkillIconArt.ts`), in the Rogue frame. Poison skills glow poison
  green, physical and untyped ones glow the class green (`0x6ad8a0`). No
  painted icon of its own. Size is 128 px (skillcore milestone 7).
- Sounds: every active has its own cast (and hit) sound in
  `src/audio/SkillSounds.ts`. Passives make none. Nothing missing.
- Reference feel (skillcore audit): a dagger should swing about 1.5 to 1.75
  times a second (about 0.6 s a blow), about 3 a second at the ceiling.
  Today every Rogue melee skill takes 0.42 s or less with no gear.

"Speed" below is with no speed gear: one blade / two blades. "Icon dup"
names the other skill drawing the same pictogram plan.

#### Venom

| Skill | Works? (code) | Body | Projectile / effect | Speed | Icon | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Viper Strike `viperStrike` (T1) | Yes: 80% + 3 Poisoned stacks | Shared `lunge` (same as Umbral Ambush) | Swing smear only, no motif | 0.42 / 0.57 s: too fast | `fang` = Revenant `fang-dark` | Change: own jab; rename (Viper Strike is a PoE skill name) |
| Coat Blades `coatBlades` (T1) | Yes: 60 s, flat poison + chance | Own gesture | Drip motif once at cast; nothing on the blades after | 0.35 s | `vial` (one of four vial icons) | Keep; add a lasting drip on the blades |
| Toxicology `toxicology` (T1) | Yes (`Passives.ts`) | Passive | - | - | `vial:1` | Keep |
| Venom Dart `venomDart` (T2) | Yes: pierces everything on the line (tooltip does not say so) | Own gesture | Generic green glob, not a needle | 0.5 s on cast speed: wrong stat | `arrow^drip`: an arrow for a dart | Change: real needle, time on attack speed, tooltip says pierce |
| Corrosive Edge `corrosiveEdge` (T2) | Yes | Passive | - | - | `drop:1` | Keep |
| Noxious Cloud `noxiousCloud` (T2) | Yes: lands at the aimed point, Envenomed + Poisoned | Own gesture | Venom field + spores | 0.5 s | `cloud` = Gloom Shroud | Keep; own icon |
| Paralytic Toxin `paralyticToxin` (T3) | Yes (`afterHit`) | Passive | - | - | `hand^drip` | Keep |
| Cultivate `cultivate` (T3) | Yes | Passive | - | - | `leaf:1` | Keep |
| Plague Vial `plagueVial` (T3) | Half: aimed at a point, but flies straight and bursts at the first enemy or 18 m | Own gesture | Generic glob, not a flask | 0.5 s, cast speed | `vial:1^speed` | Change: lob to the aimed point, a vial you can see, shatter splash |
| Blood Toxin `bloodToxin` (T4) | Yes | Passive | - | - | `dagger^drip` | Keep |
| Envenom Burst `envenomBurst` (T4) | Yes: burst + drains Poisoned stacks; burst grows 13.3% a rank (text says 13%) | Own gesture | Generic explosion + nova | 0.5 s | `nova` = Mage Blast Wave | Change: own look (stacks torn out of each target), exact text |
| Miasma Trail `miasmaTrail` (T4) | Yes | Passive | Trail field | - | `footprints` = Shadow Step, Paladin | Keep; own icon |
| Hemotoxin `hemotoxin` (T5) | Yes | Passive | - | - | `heart` = Ranger | Keep; own icon |
| Death Lotus `deathLotus` (T5) | Yes, but 8 blows 0.042 s apart (0.3 s for all eight) | Shared `attack2`: one swing, no spin | No motif | 0.42 s total: far too fast | `leaf:1^aura` | Change: own spin, cuts spaced so each reads, own blade ring |
| Antivenom `antivenom` (T5) | Yes | Passive | - | - | `vial^aura` | Keep |
| Apex Predator `apexPredator` (T6 capstone) | Yes | Passive | - | - | `star^mastery` | Keep |
| Call the Viper `viperGod` (T6) | BROKEN: no body (no `MINION_MONSTER` entry), so it never walks, cannot be hit, never counts toward its cap of 2 (`countSummons` skips bodiless) and never leaves: every cast adds another invisible, permanent turret. It shoots from 11 m (not a melee bite) for 0.5 x 140% = 70% (tooltip 140%) | Own gesture | Summon circle only | 0.5 s | `serpent` | Change (rebuild): real serpent body (the `serpent` monster rig exists), melee bites, cap works, tooltip true |
| Toxic Mastery `toxicMastery` (T6) | Yes | Passive | - | - | `drop^mastery` | Keep |

#### Shadowcraft

| Skill | Works? (code) | Body | Projectile / effect | Speed | Icon | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Shadow Step `shadowStep` (T1) | Yes: blink behind the marked enemy, +50% crit, one target | Own gesture, but a release gesture: the stab lands at once, not on the downstroke | Smoke trail + teleport puffs | 0.26 s fixed | `footprints` = Miasma Trail | Change: stab on its hit frame, own icon |
| Veil `veil` (T1) | Yes: `veiled`, guaranteed crit, moves +15% | Shared `blink` (same as Vanish's family) | Smoke converge | 0.35 s | `figure^aura` = Ranger Camouflage | Change: own gesture and icon |
| Night Eyes `nightEyes` (T1) | Yes | Passive | - | - | `eye` | Keep |
| Smoke Bomb `smokeBomb` (T2) | Yes, plus hidden damage: every field ticks 0.28 x weapon each 0.5 s (about 56% a second) though the tooltip names none | Own gesture | Smoke field | 0.5 s | `cloud^burst` | Change: no hidden damage |
| Shadow Clone `shadowClone` (T2) | Yes, but hits for 50% (`minionScale` 0.5), tooltip says 45% | Own gesture | Dark double of the hero | 0.5 s | `figure:1` | Change: tooltip and damage agree |
| Fleetfoot `fleetfoot` (T2) | Yes | Passive | - | - | `boot` = Ranger | Keep; own icon |
| Umbral Ambush `umbralAmbush` (T3) | Yes: veil only, always crits, kill keeps veil | Shared `lunge` (same as Viper Strike) | No motif | 0.42 / 0.57 s | `dagger^impact` | Change: own heavy plunge from the veil |
| Dark Pact `darkPact` (T3) | Yes, but cooldown cut is 4.5% at rank 1 (text says 3% a rank) | Passive | - | - | `hand^aura` | Keep; fix the text |
| Vanish `vanish` (T3) | Yes: veil, cleanse, resets Shadow Step | Own gesture | Smoke burst | 0.35 s | `figure^speed` | Change: it is Veil again; make it the escape (blink back out of melee, blinding puff left behind) |
| Shadow Legion `shadowLegion` (T4) | Yes, but "each at 35%" is not in the code (it adds 4% a rank on top) | Passive | - | - | `figure:2` | Keep; fix the text |
| Silhouette `silhouette` (T4) | Yes | Passive | - | - | `figure` | Keep; own icon |
| Nightfall `nightfall` (T4) | Yes, plus the same hidden field damage as Smoke Bomb | Own gesture | Void field | 0.5 s | `moon` | Change: no hidden damage, own dark look |
| Mirror Gambit `mirrorGambit` (T5) | Yes: clones +40% damage | Passive | - | - | `mirror` | Change: a plain number; make clones copy your strikes |
| Void Walk `voidWalk` (T5) | Yes: 4 hops in 3 s, later hops free | Own gesture (release, the blow lands at once) | Void orb trail + teleport puffs | 0.26 s a hop | `rift` | Change: blow on its hit frame |
| Gloom Shroud `gloomShroud` (T5) | Half: "within your own darkness" does nothing, it only works while Veiled | Passive | - | - | `cloud` = Noxious Cloud | Change: Nightfall and Smoke Bomb count as darkness |
| The Unseen Blade `theUnseenBlade` (T6 capstone) | Yes | Passive | - | - | `eye:2` | Keep |
| Assassinate `assassinate` (T6) | Yes: kills a non-boss below 15%, refund on kill | Shared `thrust` | No motif | 0.42 / 0.57 s: an execute with no weight | `scythe` = Revenant Harvest | Change: own heavy two-blade plunge, slower |
| Shadow Mastery `shadowMastery` (T6) | Yes | Passive | - | - | `moon^mastery` | Keep |

#### Bladework

| Skill | Works? (code) | Body | Projectile / effect | Speed | Icon | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Precise Cut `preciseCut` (T1, default right click) | Yes; "no wind-up" is `speedBonus: 15` | Shared `attack1` = the basic attack's swing | No motif | 0.37 s alone; two blades 0.49 s with blows at 0.16 and 0.27 s: WAY too fast (owner) | `sword^speed` | Change: speed first, then own clean draw-cut with a wind up |
| Blade Mastery `bladeMastery` (T1) | Yes | Passive | - | - | `dagger^mastery` | Keep |
| Fan of Knives `fanOfKnives` (T1) | Yes: 5 knives (+1 per 7 ranks) | Own gesture | Knife shape, knives burst | 0.5 s on cast speed: wrong stat | `dagger:2` | Keep; time on attack speed |
| Cripple Tendon `crippleTendon` (T2) | Yes: Crippled, -20% attack speed | Shared `attack1` | No motif | 0.42 / 0.57 s | `boot^drip` = Knight Hamstring | Change: own low cut at the legs, own icon |
| Deadly Aim `deadlyAim` (T2) | Yes | Passive | - | - | `target:1` = Ranger | Keep; own icon |
| Double Strike `doubleStrike` (T2) | Yes, but the second blow lands 0.08 s after the first | Shared `attack1`: two blows, one swing | No motif | too fast | `dagger:1` | Change: two cuts you can see; rename (PoE skill name) |
| Exploit Weakness `exploitWeakness` (T3) | Half: text says -5% defense a rank, code gives +5% damage a rank against debuffed targets | Passive | - | - | `crack` = Knight | Change: code does what the text says |
| Whirling Blades `whirlingBlades` (T3) | Half: the whole lane is hit at the press, before the hero gets there | Shared `attack2` played while sliding | Dodge slide, no motif | 0.5 s dash | `dagger^spin` | Change: hits as you pass, own spinning dash; rename (PoE skill name) |
| Throwing Spree `throwingSpree` (T3) | Half: all six knives leave at once while the gesture throws them one by one; `duration 3` unused | Own gesture | Knife shape | 0.5 s, cast speed | `dagger:2^spin` | Change: knives leave hand by hand, on attack speed |
| Bleeding Edge `bleedingEdge` (T4) | Yes, but "+6% bleed damage" is all damage over time (poison too) | Passive | - | - | `sword` | Keep; fix the text |
| Flurry `flurry` (T4) | Yes: +10% (+1) attack speed a stack x 6 (skillcore caps it) | Passive | - | - | `flurry` -> `claw^multi` = Knight | Keep; own icon |
| Momentum `momentum` (T4) | Yes | Passive | - | - | `swirl` = Revenant | Replace: a plain number, and Bladework has no active past tier 3 |
| Lethality `lethality` (T5) | Yes | Passive | - | - | `skull` = Ranger, Revenant | Keep; own icon |
| Phantom Blades `phantomBlades` (T5) | Yes, but the hit lands at once and the blade is drawn after | Passive | Pale generic projectile | - | `ghost` | Change: the hit lands when the blade arrives |
| Finisher `finisher` (T5) | Yes | Passive | - | - | `skull^impact` | Keep |
| A Thousand Cuts `thousandCuts` (T6 capstone) | Yes | Passive | - | - | `dagger:2^nova` | Keep |
| Perfect Form `perfectForm` (T6) | Yes | Passive | - | - | `figure^rise` | Replace: does what the capstone beside it does (makes crits certain); Bladework needs a top-tier active |
| Riposte `riposteBlade` (T6) | Yes | Passive | Counter hit | - | `sword^cross` = Knight Counter | Change: own name (the Knight's Riposte has the same name), own icon |

Summary of what is broken or untrue today: Call the Viper (invisible,
permanent, uncapped, half damage), Plague Vial (bursts on the first enemy,
not the point), Smoke Bomb and Nightfall (hidden damage), Gloom Shroud and
Exploit Weakness (half their text does nothing or something else), Whirling
Blades (hits before it arrives), Throwing Spree (knives do not match the
hands), Phantom Blades (hit before the blade), tooltip numbers off on Shadow
Clone, Shadow Legion, Dark Pact and Bleeding Edge. Too fast: every melee
skill (0.42 s or less), Precise Cut most of all, and the multi-blow
spacing of Double Strike and Death Lotus. Shared bodies: eight blade skills
swing the basic attack's moves. Icons: built from the shared glyph set,
fourteen share their picture with another skill. Names copied from Path of
Exile: Viper Strike, Double Strike, Whirling Blades.

## For the owner to test

(empty)

## For skillqa

(empty)

## Handover

(empty)
