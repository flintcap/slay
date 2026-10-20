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

- [x] 1. Skill audit (read code only). ("wip(sk-rogue): skill audit table") For every skill, read its data, its runner code, its
  swing or cast animation, its effect, its icon and its sound, and answer
  in one table under "Notes for resume":
  - Does it work? (read the code; flag anything broken)
  - Melee: does it have its own swing, not a shared one?
  - Ranged and spells: does it have its own projectile, motion and effect?
  - Is the attack or cast too fast?
  - Is the icon unique to the skill, sharp, and in class colors?
  - Do the projectile, swing and effect look AAA?
  - Keep, change, or replace, with one line why.
- [x] 2. Plan the new kit (owner: change, add and replace skills where
  needed). ("sk-rogue: skill audit and new kit plan") Write the list under "Notes for resume": skills to keep, skills
  to change (what changes), skills to replace (the new skill's idea in one
  line) and new skills to add (where they go, their idea in one line).
  Each tree has 6 tiers x 3 columns = 18 slots (`tier` 1..6, `column`
  0..2 in `src/types.ts`); read `src/data/skills.ts` (or the class file)
  for how many are used. A full tree gains a skill only by replacing one.
  Keep prerequisites, synergies and capstones whole. Our own names and
  ideas, never copies. Then check `skillcore.md`: if it is not done, follow
  the waiting rule above.
- [x] 3. Speed audit (owner: before any skill is changed). Under skillcore's model, write a table
  under "Notes for resume": the Rogue's basic attack (or, for a caster,
  its default cast) and every skill's real time per use, with no speed gear
  and at the speed ceiling, next to the feel of similar classes in the two
  reference games. Mark each one too fast, right, or too slow, and fix the
  numbers through skillcore's fields. This comes before any change to a
  skill. Owner rule: damage per hit never
  changes because of speed. A skill you slow down keeps the damage per hit
  it has today.
- [x] 4. Build. ("wip(sk-rogue): Knife Halo and Steel Waltz replace Momentum and Perfect Form; renames and true texts") Make the changes, replacements and new skills from the
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

1. Milestone 5: a painted Rogue icon set in `src/art/icons/` (like
   `shifterIcons.ts`, own painters), one picture per skill, tree accents
   (Venom acid green, Shadowcraft smoke violet-black with a pale green
   edge, Bladework bright steel with the class green). Knife Halo and
   Steel Waltz have placeholder glyph recipes (`knife-halo`, `waltz` in
   `SkillIconArt.ts`) until then.
2. Milestone 6: Coat Blades drip, Envenom Burst threads, Nightfall curtain,
   Death Lotus petal ring, phantom blade look; stand-ins in `warmup()`.
3. Milestone 7 and 8 as listed.

## Notes for resume

### Milestone 4: what was built

- Every Rogue blade skill plays its own gesture (`gestures/rogue.ts`), a
  weapon blow (`hit` + `blade`) with a wind up, a hit and a follow through,
  one blade and two (`alt.dual`). Multi-cut gestures carry `cuts`: later
  blows and the off blade's answer land on those keys as the animator
  plays them (`cutTimes` in `SkillRunner.ts`, SPAN_RATE math). No Rogue
  skill is in `PLAIN_MOVES` any more.
- Shadow Step and Void Walk arrive and cut on their gesture's hit frame.
- `scenes/rogue/RogueMoves.ts`: Venom Dart (needle in flight, passes
  through `pierce` enemies nearest first), Plague Vial (lobbed to the
  aimed point, a turning vial), Fan of Knives and Throwing Spree (knives
  leave on the release frame and on each throw key), Razor Dash (cuts each
  enemy as the hero reaches it), Vanish (spring back, blinding puff, then
  the veil), Knife Halo, Steel Waltz, Mirror Gambit (clones blink in and
  strike for a share of a skill's melee blow).
- Momentum and Perfect Form are gone with their code (`crowdDamage*`,
  `hitAt`, `nearbyCount`, the `perfectForm` handler). `guaranteedCritEvery`
  stays for the Paladin.
- Renames: Adder's Kiss, Scissor Cut, Razor Dash, Counter-Cut (ids kept).
- New sounds: `skill.knife.halo`, `skill.swing.waltz`, `skill.hit.waltz`.
- Checks run: typecheck 0; rankpower, stattext, i18n, skillsound,
  iconmatch, skilldepth, passives, unique, uniques, hits all pass.
  skillparams fails only on the Knight's `phalanx` (`capBonus`), not ours.

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

### Milestone 2: the new kit

All three trees are full (18 of 18 each). Venom has 8 actives, Shadowcraft
9, Bladework 6, and Bladework has no active past tier 3 (tiers 4, 5 and 6
are nine passives). So Bladework gains two actives by replacing its two
weakest passives. Everything else stays in its slot. Ids stay the same
unless a skill is replaced, so saves keep their ranks; renamed skills only
change their shown name.

Rules for every build item below: time through skillcore's per-skill
fields and speed function (never new hard-coded seconds); damage per hit
stays what it is today; every rank grows damage, strength, time or size
(`skillPower.ts`, `check-rankpower`); text through `tr()`.

#### Keep as they are (code works, idea is good)

Coat Blades (plus a lasting drip on the blades, see Change), Toxicology,
Corrosive Edge, Noxious Cloud, Paralytic Toxin, Cultivate, Blood Toxin,
Miasma Trail, Hemotoxin, Antivenom, Apex Predator (capstone), Toxic
Mastery; Night Eyes, Fleetfoot, Silhouette, The Unseen Blade (capstone),
Shadow Mastery; Blade Mastery, Fan of Knives, Deadly Aim, Flurry,
Lethality, Finisher (new prerequisite, see Replace), A Thousand Cuts
(capstone). Each still gets its own icon (milestone 5).

#### Change

Venom:
- `viperStrike`: rename to **Adder's Kiss** (Viper Strike is a PoE skill).
  Own weapon blow: a low coiled jab with the main blade, the off hand
  flicking venom after it. Keeps 80% + 3 Poisoned stacks.
- `coatBlades`: while coated, the blades drip and glow faintly green
  (status-driven, `fx/rogue/`), so the buff is seen, not only an icon.
- `venomDart`: a real thin needle in flight (new thrown shape), thrown on
  attack speed, not cast speed. Text says it pierces.
- `plagueVial`: lobbed in an arc to the aimed point (not the first enemy on
  the line), a glass vial you can see turning, shattering in a green splash
  on landing. Same damage, radius and Plagued.
- `envenomBurst`: own look: green threads torn out of every Poisoned enemy
  in reach and pulled into the burst. Text gives the real growth (13.3% a
  rank) or the ladder is set to 13%.
- `deathLotus`: own spin: two full turns, blades held out low, one cut
  every quarter turn, spaced so each of the eight cuts reads (on
  skillcore's multi-hit timing). Own ring of blade petals on the floor.
- `viperGod` (Call the Viper): rebuild. A real serpent body (the
  `basilisk` monster has the `serpent` rig; tint it spectral green), melee
  bites at 2.6 m, follows like other summons, cap of 1 (+1 at rank 12)
  works, it can be hit and falls. Each bite 140% (+22%) as the text says
  (`minionScale: 1`), 5 Poisoned stacks.

Shadowcraft:
- `shadowStep`: its gesture becomes a weapon blow (`hit: true`): the stab
  lands on the downstroke, not at the press.
- `veil`: own gesture (cloak drawn round, body sinks and fades) instead of
  the shared `blink`.
- `smokeBomb`: no hidden damage (the field only blinds and veils). Shared
  `ground` branch gets a small flag, Rogue skills only.
- `shadowClone`: a clone hits for `damagePct`% of your hit (45%, +5% a
  rank), as the text says, so the Shadow Mirror unique's "+30% damagePct"
  works (today it lowers the rank ratio and does nothing).
- `umbralAmbush`: own weapon blow: both blades raised from a crouch and
  plunged down together, heavy.
- `darkPact`: text tells the truth (4.5% at rank 1, toward 45%).
- `vanish`: make it the escape, unlike Veil (the opener): a back-flip
  blink 5 m away from where you face, a smoke puff left where you stood
  that Blinds for 2 s (+0.1 s a rank), then Veiled. Keeps cleanse and the
  Shadow Step reset.
- `shadowLegion`: text tells the truth (+4% clone damage a rank, no "35%").
- `nightfall`: no hidden damage; own dark look (a falling curtain of
  shadow that settles as a pool).
- `mirrorGambit`: from "+40% clone damage" to: when one of your skills
  lands a melee blow, each clone within 12 m blinks to that enemy and
  strikes it for 40% (+4% a rank) of the blow (at most once a second per
  clone, so it costs no frames). Same params (`mimicPct`, `perRank`).
- `voidWalk`: its gesture becomes a weapon blow; each hop's cut lands on
  its hit frame.
- `gloomShroud`: "within your own darkness" works: standing in your
  Smoke Bomb or Nightfall counts, as well as being Veiled.
- `assassinate`: own weapon blow: a long wind up, both blades driven in
  together; a slower time factor than a normal stab (an execute has
  weight). Damage per hit unchanged.

Bladework:
- `preciseCut` (the Rogue's default right click): speed first (remove
  `speedBonus`, time from skillcore's dagger speed), then its own weapon
  blow: a clear wind up, a flat draw-cut across, follow through. Text loses
  "no wind-up". Keeps 120% and the crit bonus.
- `crippleTendon`: own weapon blow: a low sweeping cut at the back of the
  legs.
- `doubleStrike`: rename to **Scissor Cut** (Double Strike is a PoE skill).
  Two crossing cuts you can see: right then left with two blades,
  forehand then backhand with one, about 0.15 to 0.2 s apart (skillcore's
  multi-hit timing). Second still inherits the first's crit.
- `exploitWeakness`: text tells the truth: crits apply Vulnerable for 8 s,
  and you deal +5% damage a rank to debuffed enemies (that is what the
  code does; the text promised a defense cut that never existed).
- `whirlingBlades`: rename to **Razor Dash** (Whirling Blades is a PoE
  skill). Enemies are cut as the hero reaches them, not at the press. Own
  spinning dash (blades out, one turn) instead of the basic `attack2`.
- `throwingSpree`: the six knives leave hand by hand, timed to the
  gesture's throws, on attack speed. Drop the unused `duration`.
- `bleedingEdge`: code does what the text says: +6% a rank to bleeds only
  (`bleedDamagePct`, which Butchery already uses), not all damage over time.
- `phantomBlades`: the spectral blade's hit lands when it arrives; the blade
  gets its own look (pale steel ghost knife with a green edge).
- `riposteBlade`: rename to **Counter-Cut** (the Knight's Riposte has the
  same name). Same mechanics.

#### Replace (new ids; the old ids refund on load through
`repairCharacter` in `src/sim/Character.ts`, which already deletes ranks in
unknown skills and gives the points back)

- `momentum` (T4, column 2) becomes **Knife Halo** `knifeHalo`: six knives
  circle you for 8 s (+0.25 s a rank), cutting everything within 2.6 m
  every 0.5 s for 30% weapon damage (+5% a rank); you keep fighting while
  they turn. Self, `aura` family with a damage ladder (the zone follows the
  hero, as Bone Storm does), own orbiting-knives effect (`fx/rogue/`), own
  motif (`knives` + `orbit` is free). Requires Razor Dash (as Momentum
  did). Mana about 14, cooldown about 14 s. Finisher's prerequisite
  becomes `knifeHalo`. Synergies: `syn('knifeHalo', 'fanOfKnives', 8)`,
  `syn('knifeHalo', 'bladeMastery', 5)`; Razor Dash's
  `syn('whirlingBlades', 'momentum', 6)` becomes
  `syn('whirlingBlades', 'knifeHalo', 6)`. Remove `momentum` from
  `Passives.ts` with the fields only it feeds (`crowdDamagePct`,
  `crowdDamageCap`, `crowdWindow`, checked 2026-10-20) and their readers
  (`damageMultiplier` in `Passives.ts`, `hitAt` / `nearbyCount` in
  `SkillRunner.ts`; grep again before deleting).
- `perfectForm` (T6, column 1) becomes **Steel Waltz** `steelWaltz`: a
  dance of five cuts around one enemy, 110% weapon damage each (+16% a
  rank), stepping a quarter turn round it with each cut; the fifth always
  crits. One target, own five-blow gesture (`hit: true` keys), cuts spaced
  on skillcore's multi-hit timing so each is seen, faster with Flurry
  stacks. Requires Flurry (as Perfect Form did). Mana about 24, cooldown
  about 10 s. Synergies: `syn('steelWaltz', 'doubleStrike', 8)`,
  `syn('steelWaltz', 'preciseCut', 6)`. Remove the `perfectForm` handler
  from `Passives.ts`; `guaranteedCritEvery` stays (the Paladin's
  `sim/passives/paladin.ts` uses it).

#### Add

Nothing beyond the two replacements: every tree is full, and the gap
(Bladework's empty upper tiers) is filled by them.

#### Check list for the build (milestone 4)

- Bends that name Rogue skills (all keep their ids): `shadowStep` (batchA),
  `fanOfKnives` (batchA), `deathLotus` (batchA, `hits` +3), `shadowClone`
  (batchD, `damagePct`, `lifePct`, `baseCap`), `venomDart` (batchD,
  `poisonStacks`, `pierce`), `noxiousCloud` (batchE), `voidWalk` (batchE,
  `hops`, `window`, `range`), `assassinate` (batchE, `threshold`). None
  names `momentum` or `perfectForm`. `node tools/check-uniques.mjs` after.
- Other places naming Rogue ids: `STARTING_SKILL` (`preciseCut`) and
  `STARTING_SKILL_HINTS` (`viperStrike`, `shadowStep`, `preciseCut`,
  `coatBlades`), `Player.ts` (`skill.coatBlades`), `DungeonScene.ts`
  (`shadowClone` stand-ins), `SkillRunner.ts` (`COAT`, `SUMMON_HARD_CAP`,
  `MINION_NAME`, `MINION_MONSTER`, Vanish's `resetCooldown('shadowStep')`),
  `MiniBoss.ts` (its own `shadowStep`, a monster move, unrelated),
  `tools/check-summon.mjs`, `tools/summon-entry.ts`, `tools/hits-entry.ts`,
  `tools/audio/ledger.json`, `tools/audio/recipe.mjs`.
- Weapon-blow gestures: today a skill with its own gesture is not a
  `weaponSwing` (only `PLAIN_MOVES` are), so `check-unique` would ask it
  for a motif. Either count `strikesAt` gestures as blows in
  `weaponSwing` (small shared edit in `SkillActions.ts`, explain in the
  commit) or give each its own motif. Build the blows like `blow()` in
  `Actions.ts` (reach places, weapon smear on contact), not casting poses:
  the owner's earlier complaint was gestures that read as casting.
- New sounds for Knife Halo and Steel Waltz: add takes in
  `tools/audio/recipe.mjs` from the CC0 packs already used (see
  `packs.mjs`), ledger and manifest; `check-skillsound` and the sounds
  part of `check-unique`.
- Icons (milestone 5): a painted Rogue set in `src/art/icons/` (like
  `shifterIcons.ts`, but with own painters), one picture per skill, tree
  accents: Venom acid green, Shadowcraft smoke violet-black with a pale
  green edge, Bladework bright steel with the class green. Fourteen icons
  share a picture today (see the audit).

### Milestone 3: speed audit (skillcore's model, `src/sim/Speed.ts`)

Read from the code after skillcore (head f348980). Seconds per use with a
1.65 dagger (most daggers are 1.5 to 1.75). "Bare": no speed. "Geared":
+100% summed attack speed (x1.5 through the curve). "Ceiling": the curve's
top (x2) under the 3.0 a second cap. Two blades: melee skills x1.35
(`DUAL_SKILL_STRETCH`); throws and blinks are not stretched. Reference
feel: one-hand melee swings about 0.6 to 0.8 s bare and 0.36 to 0.44 s
with heavy speed gear; casts about 0.5 s bare.

| Use | Kind | Before (bare / two blades) | After: bare | After: geared | After: ceiling | Verdict |
|---|---|---|---|---|---|---|
| Basic attack, one dagger | attack | 0.61 | 0.61 | 0.40 | 0.33 | right |
| Basic attack, two daggers (each blow) | attack | 0.47 | 0.47 | 0.33 | 0.33 | right |
| Precise Cut | attack 1 swing (was 0.87) | 0.53 / 0.71 | 0.61 / 0.82 | 0.40 / 0.55 | 0.33 / 0.41 | was too fast (quicker than a basic swing): now one full swing, wind-up 0.21 s |
| Adder's Kiss (viperStrike) | attack 1 | 0.61 / 0.82 | same | 0.40 / 0.55 | 0.33 / 0.41 | right |
| Cripple Tendon | attack 1 | 0.61 / 0.82 | same | 0.40 / 0.55 | 0.33 / 0.41 | right |
| Scissor Cut (doubleStrike) | attack 1.2 (was 1) | 0.61 / 0.82, second cut 0.08 s after the first | 0.73 / 0.98 | 0.48 / 0.65 | 0.36 / 0.49 | was too fast (two cuts read as one); second cut spaced in M4 |
| Death Lotus | attack 2 (was 1) | 0.61 / 0.82, 8 hits 0.08 s apart, the last ones after the action ends | 1.21 / 1.64 | 0.81 / 1.09 | 0.61 / 0.82 | was too fast; two full turns, a cut every quarter turn (M4) |
| Umbral Ambush | attack 1.25 (was 1) | 0.61 / 0.82 | 0.76 / 1.02 | 0.51 / 0.68 | 0.38 / 0.51 | was a bit fast for a 320% blow from the veil |
| Assassinate | attack 1.5 (was 1) | 0.61 / 0.82 | 0.91 / 1.23 | 0.61 / 0.82 | 0.45 / 0.61 | was too fast for a 500% execute |
| Steel Waltz (new) | attack 2 | - | 1.21 / 1.64 | 0.81 / 1.09 | 0.61 / 0.82 | five cuts, about 0.2 s apart bare |
| Fan of Knives | attack 1 (throw) | 0.61, knives leave on the press | 0.61 | 0.40 | 0.33 | right; knives leave on the release frame in M4 |
| Venom Dart | attack 0.9 (was a 0.5 s spell: poison type made it a cast) | 0.50 | 0.55 | 0.36 | 0.33 | wrong kind fixed: a thrown dart runs on attack speed |
| Plague Vial | attack 1.2 (was a 0.5 s spell) | 0.50 | 0.73 | 0.48 | 0.36 | wrong kind fixed: a lobbed flask |
| Throwing Spree | attack 2 (was 1) | 0.61, six knives at once | 1.21 | 0.81 | 0.61 | was too fast; a knife a hand every 0.2 s bare in M4 |
| Shadow Step | blink + attack 0.9 stab | 0.26 blink, blow on the press | 0.26 + 0.55 | 0.26 + 0.36 | 0.26 + 0.33 | was too fast (no hit frame); stab on its hit frame in M4 |
| Void Walk (each blink) | blink + attack 1 | 0.26 blink, blow on the press | 0.26 + 0.61 | 0.26 + 0.40 | 0.26 + 0.33 | same as Shadow Step |
| Razor Dash (whirlingBlades) | dash, `travelTime` | 0.50 for 8 m, every enemy hit on the press | 0.57 for 8 m (14 m/s) | same | same | hit timing wrong; hits as you pass in M4 |
| Coat Blades, Veil, Vanish, Knife Halo | spell 0.35 | 0.35 | 0.35 | 0.35 | 0.29 | right |
| Noxious Cloud, Envenom Burst, Smoke Bomb, Nightfall, Shadow Clone, Call the Viper | spell 0.5 | 0.50 | 0.50 | 0.50 (rogue gear has little cast speed) | 0.29 | right |

Flurry: was +10% attack speed a stack (+1% a rank), 6 stacks: +60% at rank
1 and +174% at rank 20, which puts a geared rogue at the 3.0 cap, so later
ranks bought nothing. Now +8% attack speed a stack, fixed (+48% summed at 6
stacks, x1.32 alone), and the ranks grow damage: +2% (+0.3% a rank) a stack,
12% at rank 1 and 46% at rank 20 with 6 stacks (`hitStackDamagePct`,
`damageMultiplier` in `src/sim/Passives.ts`).

Damage per hit is unchanged for every skill slowed above.

## For the owner to test

(empty)

## For skillqa

(empty)

## Handover

(empty)
