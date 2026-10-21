# Stream: sk-shifter (Wave 5: Shapeshifter skills remake)

Status: in progress

Class: Shapeshifter (code id `shapeshifter`). Trees: Feral, Teeth, Claw (`feral`, `teeth`, `claw`): the cat, the wolf, the bear. Port 4358.
Fights with melee in beast forms (starts with a club in man form). Class color: rust orange (`0xc46a34`).

Goal (owner): fix every Shapeshifter skill and remake the kit to a AAA
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

Your files (Wave 5 file ownership in `PLAN.md`): `src/data/classSkills/shapeshifter.ts`, `src/scenes/ShifterRunner.ts`, `src/data/shifterPower.ts`, `src/data/shifterStatuses.ts`, `src/art/icons/shifterIcons.ts`, `src/fx/shifter/*` and `src/art/hero/forms/*`, plus your own
class's branches and entries in `src/scenes/SkillRunner.ts`,
`src/art/hero/SkillActions.ts`, `Swing.ts`, `Actions.ts`,
`src/fx/SkillLooks.ts`, `src/art/SkillIconArt.ts`, `src/art/Glyphs.ts`,
`src/data/skillPower.ts`, `src/audio/SkillSounds.ts`, `src/data/skillBends.ts`,
and the unique and set lines that name your skills. New effect files under
`src/fx/` are best. Never reformat or reorder another class's part of a
shared file.

Checkers (only what you touch): `node tools/run-checks.mjs --only=rankpower,skillparams,stattext,i18n,skillsound,iconmatch,skilldepth,passives`
and `curve` once at the end for your class only
(`node tools/check-curve.mjs --classes=shapeshifter`). Browser, one at a time, at
most once per milestone: `check-skills --classes=shapeshifter`, and if you must
look, one small contact sheet. Run `node tools/get-chrome.mjs` once before
the first browser check.

## Class notes

- Each form must swing like its beast: the cat fast and light, the wolf
  in quick bites and lunges, the bear slow and wide. Form changes must not
  hitch.
- Rank power goes through `src/data/shifterPower.ts` and
  `check-rankpower`.

## Milestones

- [x] 1. (sk-shifter: skill audit and kit plan) Skill audit (read code only). For every skill, read its data, its runner code, its
  swing or cast animation, its effect, its icon and its sound, and answer
  in one table under "Notes for resume":
  - Does it work? (read the code; flag anything broken)
  - Melee: does it have its own swing, not a shared one?
  - Ranged and spells: does it have its own projectile, motion and effect?
  - Is the attack or cast too fast?
  - Is the icon unique to the skill, sharp, and in class colors?
  - Do the projectile, swing and effect look AAA?
  - Keep, change, or replace, with one line why.
- [x] 2. (sk-shifter: skill audit and kit plan) Plan the new kit (owner: change, add and replace skills where
  needed). Write the list under "Notes for resume": skills to keep, skills
  to change (what changes), skills to replace (the new skill's idea in one
  line) and new skills to add (where they go, their idea in one line).
  Each tree has 6 tiers x 3 columns = 18 slots (`tier` 1..6, `column`
  0..2 in `src/types.ts`); read `src/data/skills.ts` (or the class file)
  for how many are used. A full tree gains a skill only by replacing one.
  Keep prerequisites, synergies and capstones whole. Our own names and
  ideas, never copies. Then check `skillcore.md`: if it is not done, follow
  the waiting rule above.
- [x] 3. (sk-shifter: speed audit, beast pace and skill timings) Speed audit (owner: before any skill is changed). Under skillcore's model, write a table
  under "Notes for resume": the Shapeshifter's basic attack (or, for a caster,
  its default cast) and every skill's real time per use, with no speed gear
  and at the speed ceiling, next to the feel of similar classes in the two
  reference games. Mark each one too fast, right, or too slow, and fix the
  numbers through skillcore's fields. This comes before any change to a
  skill. Owner rule: damage per hit never
  changes because of speed. A skill you slow down keeps the damage per hit
  it has today.
- [x] 4. (sk-shifter: build, blows on their keys, runs by distance, Ravening and Many Mouths) Build. Make the changes, replacements and new skills from the
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
- [x] 5. Icons. Repaint every icon so it is unique to its skill, sharp at
  skillcore's icon size, and in class colors, with each tree's own accent.
  Readable at hotbar size: one clear shape, strong light and dark.
  (sk-shifter: icons, a picture of his own for every skill, each tree its own light)
- [x] 6. Effects quality and cost. Projectiles, swings and hit effects look
  AAA in the game's dark and gritty style. No allocation in per-frame code;
  particle counts follow the quality ladder; every new effect pipeline has
  a stand-in in `warmup()` in `src/scenes/DungeonScene.ts`, so nothing
  compiles on first cast.
  (sk-shifter: effects cost, no per-frame allocation, beast looks warmed)
- [ ] 7. Check. `check-skills --classes=shapeshifter` once (one retry if it fails,
  then note it) and `check-curve --classes=shapeshifter` once, for
  information. If a depth is walled that was not before, do not raise
  damage per hit to make up for slower speed and never touch monsters:
  write the before and after numbers under "Notes for resume" for the
  owner to decide.
- [ ] 8. Handover. Fill "For skillqa" (what you could not check: looks in
  motion, real frame time, any effect you fear is costly) and "For the
  owner to test". Set `Status: done`, push.

## Next up

Milestones 1 to 6 are done (see "Milestone 6: effects cost" under "Notes
for resume"). Next, milestone 7: `mkdir -p shots`, then
`SLAY_PORT=4358 flock /tmp/slay-browser.lock timeout 3500 node
tools/check-skills.mjs --classes=shapeshifter` once (one retry, then
note it), then `check-curve --classes=shapeshifter` once, inside the lock.
`get-chrome` is done this session. Then 8 (handover).

## Notes for resume

### Milestone 1: skill audit (read from the code on 2026-10-20, skillcore at its milestone 2)

How the Shapeshifter's skills run today (read from the code, not notes):

- Data: `src/data/classSkills/shapeshifter.ts`, three trees of 18, every
  slot used. Feral 8 actives (with the form) / 10 passives, Teeth 9 / 9,
  Claw 9 / 9. Buff and curse numbers in `data/shifterPower.ts` (spread into
  `SELF_POWER` / `FOE_POWER`), statuses in `data/shifterStatuses.ts`, rule
  passives in `sim/shifterPassives.ts`, form-only passives in
  `FORM_PASSIVES` (`entities/Shapeshift.ts`).
- Runner: every active is family `shift`; `SkillRunner.cast` pays, sounds
  and hands it to `runShift` (`scenes/ShifterRunner.ts`), one handler per
  skill, with a `ShiftKit` of the runner's hit helpers. A tree skill used as
  a man changes you into its beast first; in a beast only that beast's
  skills and the three form skills work (`formRefusal`).
- Body: every active has its own gesture in `art/hero/gestures/shapeshifter.ts`
  (no shared plain moves). Each form has its own basic chain
  (`forms/FormActions.ts`: cat rakes, wolf hooks and bite, bear haymakers
  and hammer) and stance (`forms/FormStances.ts`). Contact: every `hit`
  gesture lands at `min(0.16 s, 0.35 x action)` (`CONTACT_CAP`,
  `Player.contactDelay`), and the clip plays at `max(0.5, 0.45 / action)`
  after the contact key (`Player.beginAction`), so a gesture longer than
  about 0.45 s natural is still running (or is cut by a move order) when
  the action ends.
- Speed today (skillcore's `sim/Speed.ts`, before my milestone 3): a beast
  still swings at the pace of the weapon hidden in its hands
  (`handsOf(equipment)`, `ItemBase.baseSpeed`). Shift skills have no
  `attackTime` / `castTime` of their own: `c.attackTime` is one swing
  (`1 / (aps x attackMult)`), `c.castTime` 0.5 s / cast speed, and the
  handlers multiply those (x0.85 to x1.7) or use fixed seconds. With the
  starting club (1.2 a second), no gear, rank 1: cat swing 0.76 s (Shadowcat
  +10%), wolf and bear 0.83 s. A cat holding a two-handed maul (0.58 a
  second) swings at 1.6 s; a bear holding a one-handed axe (1.25) at 0.8 s:
  the forms do not set their own feel. Before skillcore every swing was
  0.42 s.
- Look: each active has its own drawing (`fx/shifter/ShifterFX.ts`, its own
  emitters in `emitters.ts`, motifs in `motifs.ts`): claw scores that follow
  the paw bones, jaws that close, craters, roars. On top of that every
  shift hit also draws the shared physical `effects.meleeHit` impact (a
  metal-spark hit on a claw or a bite). In a form the weapon smear is
  hidden (`BodyFX.edgeOf`), but the basic attack still whooshes and lands
  with the hidden weapon's sound (`swing.blunt` and `weapon: 'blunt'` for
  the starting club, `weaponSoundOf`).
- Cost: `clawTrails` allocates a vector every frame per trail
  (`_b.clone().sub(_a)`); everything else in `ShifterFX` reuses scratch
  vectors or allocates once per cast.
- Icons: `art/icons/shifterIcons.ts` (`ss-*` keys) over three glyphs of his
  own (`beast`, `paw`, `howl` in `art/ShifterGlyphs.ts`, variant 0 cat,
  1 wolf, 2 bear) and shared ones. Spread thin: `paw` x11, `beast` x9,
  `claw` x7, `fang` x5. Eleven plans are exact copies of other skills'
  icons: Hamstring = `gash` (`claw^drip`), Stalker = `footprints` (four
  others), Feral Grace = `speed` (`feather^speed`), Night Hunt = the
  Paladin's Vespers (`moon^aura`), Pack Blood = `siphon` (`chalice^drip`),
  Alpha = `crown-shield`, Thick Hide = `crest` (`shield^aura`), Fat
  Reserves = `undying` (`heart^aura`), Bruiser = `fist`, Scar Tissue = `scar`
  (`claw^aura`), Old Scars = `crack-cold` (`crack^aura`). The three trees
  differ only by pips and the beast variant; no tree accent.
- Sound: every active has its own `skill.shift.<id>` cast (and `.hit` for
  blows), 41 bank ids, all used (`audio/shifterSounds.ts`, takes in
  `tools/audio/shifter-takes.mjs`). Passive procs have none.
- Uniques that bend Shapeshifter skills (`data/uniqueBatches/*`): Maul
  (`arc`, `reach`), Hammerfall (`radius`), Killing Dance (`hits` +2),
  Call the Pack (`lifePct`, `count` +1), Reaping Swipe (`maxTargets` +2,
  `radius`), Worry (`shakes` +2, `knockback`), Rattling Roar (`radius`,
  `duration`, `weaken`), Bear Hug (`squeezes` +2, `heal`). Every handler
  reads those knobs through the bent `num`, so all eight work. No set and
  no `skillBends.ts` entry names a Shapeshifter skill.
- Old saves: `repairCharacter` (`sim/Character.ts`) refunds the ranks of
  any skill id that is gone and clears it from the hotbar and right click.

Legend: Works = the code does what the tooltip says. Move: own = its own
gesture. Time = real seconds per use under today's model with the
starting club, no gear, rank 1 (contact at 0.16 s for every blow). Verdict:
K keep, C change, R replace.

| Skill (tier.col) | Works? | Move | Effect | Time, too fast? | Icon | Verdict, why |
| --- | --- | --- | --- | --- | --- | --- |
| **Feral (cat)** | | | | | | |
| Shadowcat (1.0) | Yes (form status, +12% move, +10% AS, +4% crit) | own (crouch, rise) | shed + change burst, breath, eyes | 0.55 s; the beast keeps the weapon's pace | beast:0^aura | K (form pace in M3) |
| Rake (1.1) | Half: three hits at 0.16 / 0.27 / 0.38 s (gap 0.11 s fixed) while the gesture's second and third swipes now play at about 0.39 / 0.63 s: the hits no longer ride their swipes | own (3 swipes) | claw scores per swipe, blood thrown | 0.96 s for 3 hits; slow for a cat | claw^speed | C: each swipe its own hit, the third both paws |
| Lithe (1.2) | Yes | - | - | - | paw:0^speed | K |
| Pounce (2.0) | Mostly: the body slides forward through the crouch (travel starts on the press), and the claws-first landing pose plays at 0.16 s in mid air; the hit lands on arrival | own | shadow streak, claw trails, landing dust, blood, flash | 9 m in 0.49 s + 0.3 s; ok | paw:0^impact | C: crouch in place, leap, land claws first on arrival |
| Cat's Eyes (2.1) | Yes | - | - | - | eye^aura | K |
| Taste of Blood (2.2) | Yes (`vsBleedingPct`) | - | - | - | drop^drip | K |
| Slink (3.0) | Mostly: the ambush works (`runShift` wraps the packet, ends the slink), but Night Hunt cast while slinking eats it for nothing | own | dark pool, wisps | 0.5 s; ok | paw:0^field | C: a real ambush, a sure critical, only a strike ends it |
| Hamstring (3.1) | Yes (Crippled 4 s, 2 Bleed stacks) | own (low sweep) | claw scores, blood along the floor | 0.88 s; ok | claw^drip (copy of `gash`) | K |
| Stalker (3.2) | Yes (`vsDebuffedPct`) | - | - | - | footprints (copy) | K |
| Throat Tear (4.0) | Yes (x2.5 under 30%, Hemorrhage 5 s) | own (hook, wrench) | closing jaws, gush, gore and flash on the execute | 0.99 s; ok | fang^impact | K |
| Feral Grace (4.1) | Yes (`FORM_PASSIVES`) | - | - | - | feather^speed (copy) | K |
| Open Veins (4.2) | Yes (`critBleedStacks`) | - | - | - | drop^burst | K |
| Killing Dance (5.0) | Half: its beats are counted from `contactIn` before its own action starts (0), so the first blow lands on the press; the one gesture (3 keys, about 0.9 s at speed 0.5) plays once while the six blows run 1.6 s, so the last blows come from a still body; each hop is a 0.05 s blink (up to 60 m/s); single target only | own, but one swipe for six blows | afterimage puffs, claw trails on a still paw | 1.83 s for 6; hop far too fast | claw^spin | C: the Feral crowd skill, each blow its own dash and swipe |
| Ninth Life (5.1) | Yes (`cheatDeath*`) | - | - | - | heart^rise | K |
| Keen Claws (5.2) | Yes | - | - | - | claw^mastery | K |
| Night Hunt (6.0) | Mostly: the mana is refunded after it is spent, so a Feral skill still needs the mana in the pool under Night Hunt | own | dark rises, eyes, ring, trail | 0.6 s; ok | moon^aura (copy of Paladin's Vespers) | K (small fix: no mana needed) |
| King of the Night (6.1) | Yes | - | - | - | beast:0^rise | K |
| Feral Mastery (6.2) | Yes | - | - | - | paw:0^mastery | K |
| **Teeth (wolf)** | | | | | | |
| Grey Wolf (1.0) | Yes (+20% dmg, +3% leech, +40 AR) | own | as Shadowcat | 0.55 s | beast:1^aura | K |
| Snap (1.1) | Yes (Pack Frenzy on the press) | own (head darts in) | small jaws, glint | 0.71 s; ok | fang^speed | K |
| Pack Blood (1.2) | Yes | - | - | - | chalice^drip (copy of `siphon`) | K |
| Hunting Howl (2.0) | Yes (wolves bite with your sheet, so they get it) | own (head back) | breath, three gold rings, motes | 0.8 s; ok | howl^nova | K |
| Thick Ruff (2.1) | Yes | - | - | - | beast:1^wall | K |
| Sharp Teeth (2.2) | Yes | - | - | - | fang^mastery | K |
| Lunge (3.0) | Mostly: the bite pose plays at 0.16 s while the rush (8 m in 0.43 s) is still under way; the bite lands on arrival | own | dust streak, jaws, glint | 0.68 s; ok | paw:1^speed | C: run pose all the way, bite on arrival |
| Worry (3.1) | Half: shakes land at 0.16 / 0.33 / 0.50 / 0.67 s (gap 0.17 s fixed); the gesture plays at speed 0.5, so its shakes come at 0.44 / 0.76 / 1.08 s and the throw (natural 0.78) never shows before the 0.83 s action ends; the first shake's blood flick draws on the press | own | blood flicked per shake | 0.83 s; ok | fang^cross | C: each shake on its own shake key, the throw seen |
| Pack Instinct (3.2) | Yes (`hitStack*`) | - | - | - | paw:1^multi | K |
| Call the Pack (4.0) | Half: bites grow 8% a rank (`burstGrowth` default: no `dmg` ladder) on top of the +3% a rank the tooltip says, so a rank 20 wolf bites about 2.5 times its tooltip; Alpha does nothing (below); the wolves rise out of the shared magic summon circle and teleport flash | own (beckon) | fog, eyes, then a summon circle | 0.7 s; ok | beast:1^multi | C: true bites, Alpha honoured, out of the fog |
| Blood Howl (4.1) | Yes (heals you and every summon) | own | red mist, ring | 0.75 s; ok | howl^drip | K |
| Alpha (4.2) | No: it sets `minionDamagePct` / `minionLifePct`, which only the `summon` family reads; Call the Pack raises its wolves through `ShiftKit.raise` and never reads them | - | - | - | crown^aura (copy of `crown-shield`) | C: fixed through Call the Pack |
| Go for the Throat (5.0) | Yes (crouch then spring, 220%, Hemorrhage 6 s, Weakened 4 s); the spring still happens after a dodge in the crouch (`later(..., true)`) | own | head trail, jaws, fountain, gore | 0.74 s; ok | fang^rise | R: a second "throat and Hemorrhage" skill (the cat's Throat Tear is the first); Teeth has no crowd skill |
| Blood Frenzy (5.1) | Yes (`frenzyCap`) | - | - | - | paw:1^chain | K |
| Scent of Weakness (5.2) | Yes, but it is Stalker's rule again (`vsDebuffedPct`) in another tree | - | - | - | eye^drip | R: the same rule twice; the pack has no passive of its own |
| Bloodmoon (6.0) | Yes (Pack Frenzy full and held, +40%, +10% leech) | own (pull the moon down) | red moon and rain | 0.8 s; ok | howl:1^aura | K |
| Last Wolf Standing (6.1) | Yes | - | - | - | beast:1^rise | K |
| Teeth Mastery (6.2) | Yes | - | - | - | paw:1^mastery | K |
| **Claw (bear)** | | | | | | |
| Great Bear (1.0) | Yes (life share as flat life, -8% move) | own (swell, stamp) | dust, shake | 0.55 s | beast:2^aura | K |
| Maul (1.1) | Yes (137 degrees, 2.9 m, paws in turn) | own | four claw scores, grit | 1.08 s; ok for a bear | claw^burst | K |
| Thick Hide (1.2) | Yes | - | - | - | shield^aura (copy of `crest`) | K |
| Rattling Roar (2.0) | Yes (flinch 0.6 s, Rattled -20%) | own | blast, dust, ring, shake | 0.75 s; ok | beast:2^nova | K |
| Fat Reserves (2.1) | Yes | - | - | - | heart^aura (copy of `undying`) | K |
| Bruiser (2.2) | Yes (`thornsMeleePct`) | - | - | - | fist^impact (copy of `fist`) | K |
| Hammerfall (3.0) | Mostly: `areaDamage` falls off to 65% at the edge; the tooltip says flat 160% within 3.2 m; the wind up is squeezed into 0.16 s | own (both paws overhead) | two craters, crack, chunks, ring, shake | 1.42 s; ok | paw:2^impact | C: flat inside its ring, a real wind up |
| Bristle (3.1) | Yes (reflect scaled by magnitude; the HUD text shows the base 30%) | own | spines each second | 0.6 s; ok | spikes^burst | K |
| Immovable Bulk (3.2) | Yes | - | - | - | boulder^aura | K |
| Overrun (4.0) | Half: strides are counted on the trip clock `u`, but the bear moves on the eased path `u^2`, so each 2 m of hits lands ahead of the body (half way through the time the bear is a quarter of the way); bodies are pushed away from the bear (forward), about 1 m, not "3 m aside", and one pushed ahead can be struck again by the next stride | own (charge) | dust wake, furrow | 8 m in 0.65 s + 0.3 s; ok | paw:2^speed | C: hits on arrival, once a body, thrown aside |
| Grizzled (4.1) | Yes | - | - | - | beast:2^wall | K |
| Scar Tissue (4.2) | Yes | - | - | - | claw^aura (copy of `scar`) | K |
| Reaping Swipe (5.0) | Mostly: area falloff makes the paws (the edge) the weakest part; it is a round Maul with a bonus | own (full turn) | ring score, dust, floor ring | 1.33 s; ok | claw:1^spin | C: flat, and it drags the pack in (the bear's gather) |
| Bear Hug (5.1) | Half: squeezes at 0.16 / 0.48 / 0.80 s fixed; the gesture's squeezes come at about 0.16 / 0.56 / 0.96 s; the first squeeze heals and draws on the press, and every squeeze heals whether it lands or not | own | crush puff | 1.16 s; ok | hand^cross | C: each squeeze on its key, heal on a landed squeeze |
| Unbowed (5.2) | Yes | - | - | - | helm^rise | K |
| Ursa Major (6.0) | Yes (bigger, life, damage, swipes +40% reach) | own | stone rises, seven stars | 0.9 s; ok | star^multi | K |
| Claw Mastery (6.1) | Yes | - | - | - | paw:2^mastery | K |
| Old Scars (6.2) | Yes | - | - | - | crack^aura (copy of `crack-cold`) | K |

Totals: keep 38, change 14, replace 2. Broken or half working: Alpha
(dead), Call the Pack (bites 2.5x the tooltip at rank 20), Overrun (hits
ahead of the bear, double hits, wrong throw), Killing Dance (first blow on
the press, one swipe for six blows, blinks), Rake, Worry and Bear Hug
(hits off their swipes), plus the small ones (Pounce and Lunge poses,
Slink eaten by Night Hunt, Night Hunt still needs mana, area falloff on
Hammerfall and Reaping Swipe). Class wide: the beasts swing at the hidden
weapon's pace, the basic attack sounds like the hidden weapon, every hit
also sparks like metal, and Feral and Teeth have no skill that reaches
more than one enemy.

### Milestone 2: the new kit

All three trees are full (18 of 18), and the shape is right: Feral kills
one at a time fast, Teeth feeds Pack Frenzy and the pack, Claw holds the
room. Kept: every tier, column and `requires` chain, so saves keep their
ranks. Two slots get a new skill under a new id (old ranks are refunded
by `repairCharacter`, which drops unknown ids and their hotbar keys).

Rules for every build item: time through skillcore's per-skill fields and
speed function (never new hard-coded seconds); damage per hit stays what
it is today; every rank grows damage, strength, time or size
(`shifterPower.ts` / `skillPower.ts`, `check-rankpower`); text through
`tr()`; looks stay animal (claw scores, teeth, blood, fur, dust, broken
stone), never a spell sigil. Every shift hit draws its own look and skips
the shared metal-spark `meleeHit` (a `ShiftKit.swing` option, read in the
runner's shift kit only).

**Class wide (milestone 3 and 4):**
- Form pace: a beast swings at its weapon's pace times its own factor:
  cat 1.25, wolf 1.1, bear 0.85 (basic attack and every skill). The weapon
  still matters (a heavy weapon's big hit is not swung at cat speed), the
  cat is always quicker than the wolf and the bear with the same weapon,
  and damage per hit does not change. One additive hook where skillcore's
  `handsOf` reads the hands (request below); the form is read from the
  hero's form status.
- The basic attack in a form sounds like the beast, not the hidden weapon:
  cat `swing.light`, bear `swing.heavy`, wolf `monster.beast.attack`; it
  lands as flesh (`hit.flesh`), and its impact is the beast's, not the
  metal spark. Bear basic reach 2.7 m and arc 2.0 (wide), cat and wolf as
  today (2.4 m, 1.5).
- Every multi-hit skill (Rake, Killing Dance, Worry, Bear Hug, Ravening)
  lands each hit on its own key of its own gesture, through skillcore's
  multi-hit timing; a dodge or a new action stops the rest.
- Leaps and rushes (Pounce, Lunge, Overrun, Killing Dance's steps) move at
  a real speed by distance and play their landing or bite on arrival.
- `clawTrails` allocates nothing per frame.

**Keep as is (38):** Shadowcat, Lithe, Cat's Eyes, Taste of Blood,
Hamstring, Stalker, Throat Tear, Feral Grace, Open Veins, Ninth Life,
Keen Claws, King of the Night, Feral Mastery; Grey Wolf, Snap, Pack
Blood, Hunting Howl, Thick Ruff, Sharp Teeth, Pack Instinct, Blood Howl,
Blood Frenzy, Bloodmoon, Last Wolf Standing, Teeth Mastery; Great Bear,
Maul, Thick Hide, Rattling Roar, Fat Reserves, Bruiser, Bristle,
Immovable Bulk, Grizzled, Scar Tissue, Unbowed, Ursa Major, Claw Mastery,
Old Scars. All get new icons (milestone 5) and their speed set (milestone
3). Small fix among them: Night Hunt (Feral skills need no mana in the
pool while it lasts: the cost is skipped, not refunded after).

**Change (14):**

Feral
- Rake: three swipes, right, left, then both paws dragged down, each hit
  on its own swipe key; the third opens the Bleed. Claw scores per swipe.
  Numbers stay.
- Pounce: the cat coils on the spot (no slide), then leaps at a leap speed
  by distance (about 14 m/s, arc height by distance) and lands claws first
  on arrival: the gesture's contact is the landing. Numbers stay.
- Slink: a real ambush. The next Feral skill that strikes (not Night Hunt,
  not a form) deals +60% (+8% a rank) and is a sure critical strike; only
  a strike ends the slink. Numbers stay.
- Killing Dance (the Feral crowd skill): the cat runs (a visible dash at
  about 12 m/s, not a blink) to a new side and swipes, one swipe per blow,
  paws in turn, faster each time. With other enemies within 3 m of the
  target, each blow goes to the next one not yet struck (back to the first
  when all have been), so alone it is the same dance on one and in a pack
  it cuts through six throats. The first blow lands on its swipe, not on
  the press. 45% (+6%) a blow, 6 blows (+1 every 5 ranks) stay.

Teeth
- Lunge: the wolf runs low the whole way (the run held), the bite and
  throw on arrival. Numbers stay.
- Worry: the jaws clamp (first shake holds), each shake on its own shake
  key, the body of the prey wrenched with the head, then flung aside on
  the throw key, to the side of the last wrench. Numbers stay.
- Call the Pack: the bite is what the tooltip says (45% +3% a rank: no
  hidden `burstGrowth` on top, through a `BURST_POWER` line of 1 or reading
  the share alone); Alpha's damage and life are honoured (read in the
  handler); the wolves come out of a low fog with their eyes first, not out
  of a magic circle. Numbers stay.
- Alpha: works through Call the Pack (above). Numbers stay.

Claw
- Hammerfall: lands flat inside its 3.2 m ring (no edge falloff: a
  Shapeshifter-only `flat` option on the kit's `area`), contact at the
  bottom of the drop with a real wind up (needs the contact cap lifted for
  skill blows). Numbers stay.
- Overrun: hits counted on the bear's real path, so each body is struck as
  the bear reaches it, once a charge; bodies thrown to the side of the
  lane they stood on (left or right of the bear), as the tooltip says.
  Numbers stay.
- Reaping Swipe (the bear's gather): flat to everything within 3.4 m (the
  paws are the edge), +8% for every enemy caught (up to 5) as today, and
  everything it hits is dragged in toward the bear by 1.2 m (+0.04 m a
  rank), gathering the pack for Maul and Hammerfall. New params `pull: 1.2`,
  `pullR: 0.04`.
- Bear Hug: each squeeze on its own squeeze key, the heal only when a
  squeeze lands on the held enemy, the crush drawn on the squeeze. Numbers
  stay.

**Replace (2):**
- Go for the Throat (Teeth 5.0, needs Call the Pack, needed by Bloodmoon)
  becomes **Ravening** (`ravening`): the wolf's crowd bite. "Tear into
  everything near: 5 bites (+1 every 5 ranks), each at the next enemy
  within 3 m (round again when all are bitten), each 70% weapon damage
  (+10% per rank). Every bite adds a stack of Pack Frenzy." Mana 12 (+0.6),
  cooldown 7 s (-0.2 a rank, at least 3.5). Its own gesture (low, head
  snapping left and right, the body turning with each bite), jaws and a
  blood flick at each bite. Synergies: Snap's 4% line from Go for the Throat
  now comes from Ravening; Ravening takes Worry's 5% line. Its sounds: the
  two `skill.shift.goForTheThroat` takes (a snarl and a wet bite) move to
  `skill.shift.ravening` (renamed, no new download).
- Scent of Weakness (Teeth 5.2, needs Alpha) becomes **Many Mouths**
  (`manyMouths`), the pack's own passive: "For every wolf of yours standing
  (up to 3), you and your wolves deal +1% damage per rank." Read once a
  second where the forms are refreshed (a hidden pack status with
  `enhancedDamage`, so it is on the sheet and the wolves get it through
  your packet). The Stalker rule stays only in Feral.

**New skills beyond that:** none. Every tree is full; Ravening is the
Teeth crowd skill and Killing Dance becomes the Feral one.

**Speeds (milestone 3, under skillcore's model; starting points, in
swings of the form's pace unless said):** basic: cat about 1.6 a second
with the club, wolf 1.3, bear 1.0. Rake 1.4 for all three swipes; Snap
0.8; Hamstring 1.0; Throat Tear 1.2; Maul 1.15; Worry 1.8 for the four
shakes and the throw; Bear Hug 2.0 for three squeezes; Hammerfall 1.5 with
contact late in the drop; Reaping Swipe 1.4; Ravening 1.8 for five bites;
Killing Dance about 2.4 for six blows (each step at a run). Pounce,
Lunge and Overrun by distance (leap about 14 m/s, wolf run 16 m/s, bear
charge 12 m/s) plus their own crouch and recovery. Roars, howls, the
forms and the buffs on cast time (`castTime`): forms 0.5 s, Slink 0.45 s,
Bristle 0.55 s, Call the Pack and Night Hunt 0.7 s, Rattling Roar and
Blood Howl 0.75 s, Hunting Howl and Bloodmoon 0.85 s, Ursa Major 1.0 s.

**Uniques that name Shapeshifter skills (all still valid after the
plan):** Maul (`arc`, `reach`), Hammerfall (`radius`), Killing Dance
(`hits`), Call the Pack (`lifePct`, `count`), Reaping Swipe (`maxTargets`,
`radius`), Worry (`shakes`, `knockback`), Rattling Roar (`radius`,
`duration`, `weaken`), Bear Hug (`squeezes`, `heal`). None names Go for
the Throat or Scent of Weakness. No set names a Shapeshifter skill.

**Out of my files, small additive edits (shared):** `sim/Speed.ts` (the
form pace hook in `handsOf`, or skillcore adds it), `SkillRunner.ts`
(Shapeshifter-only lines: the basic attack's sound, impact and bear reach
in a form; the shift kit's `swing` option to skip the shared spark and
`area` option to land flat; Night Hunt skipping the cost), `DungeonScene.ts`
(`warmup()` stand-ins for new effects), `tools/audio/shifter-takes.mjs`
and the sound files (rename two takes).

**Requests to skillcore (to check at milestone 3):** the form pace above
(or a hook for it); a skill's own blow must be able to connect later than
`CONTACT_CAP` (0.16 s), so a bear's drop and a pounce's landing land on
their own key; multi-hit gaps that follow the speed and ride the gesture's
keys; gestures longer than about 0.45 s natural play out over their action
instead of being cut.

### Milestone 3: speed audit (read from skillcore's finished model, 0616b06)

What skillcore left (read again in `sim/Speed.ts`, `Player.ts`,
`Animator.ts`, `SkillActions.ts`): a blow lands at 35% of its action
(`SKILL_BLOW_CONTACT`, cap `CONTACT_CAP` 0.5 s), the clip is stretched over
the action (`span`, `SPAN_RATE` 0.55-2.6), a gesture's later blows sit on
its keys (`Spec.cuts`, `cutTimes`), rushes go by distance (`travelTime`,
14 m/s). My four requests: later contact, cuts on keys and gestures played
over their action are in; the form pace was left to me.

Today (before this milestone) a beast swings at the hidden weapon's pace,
the `shift` family times as a spell in every menu (wrong for the blows),
and `ShifterRunner` multiplies one swing (`c.attackTime`) or 0.5 s
(`c.castTime`) by its own factors.

The fix:
- Form pace: the beast swings at the weapon's pace times cat 1.25, wolf
  1.1, bear 0.85 (`FORM_PACE`, `data/shifterPower.ts`), for the basic
  attack and every tree skill (a tree skill always fights in its form, so
  the skill board reads the same pace). Damage per hit unchanged.
- Every blow skill gets `timing: 'attack'` and its own `attackTime`;
  every howl, roar, buff and form its own `castTime`. The runner's in-code
  factors go; leaps and rushes add `travelTime(distance)` to their own
  crouch and recovery.

Times: starting club (1.2 a second), rank 1, no speed gear (the cat with
Shadowcat's +10%), and at the ceiling (speed gear's curve at its limit, x2,
under 3 attacks a second). Leaps at 9 m, rushes at 8 m. "Old" is today's
code under skillcore's model.

| Use | Old, no gear | New field | New, no gear | New, ceiling | Feel next to the references | Verdict on old |
| --- | --- | --- | --- | --- | --- | --- |
| Basic, cat | 0.76 s (1.31 a s) | pace 1.25 | 0.61 s (1.64 a s) | 0.33 s | a cat is as quick as a dagger | too slow |
| Basic, wolf | 0.83 s (1.2) | pace 1.1 | 0.76 s (1.32) | 0.38 s | a sword's pace | right (a hair slow) |
| Basic, bear | 0.83 s (1.2) | pace 0.85 | 0.98 s (1.02) | 0.49 s | a great maul's pace | too fast |
| Forms (x3) | 0.55 s | cast 0.5 | 0.5 s | 0.29 s | quick change | right |
| Rake (3 hits) | 0.96 s, hits off their swipes | attack 1.4 | 0.86 s | 0.47 s | a short flurry | too slow, hits off |
| Pounce | 0.79 s, no crouch | attack 0.6 + leap | 1.01 s | 0.98 s | a leap you see | too fast in the air |
| Slink | 0.5 s | cast 0.45 | 0.45 s | 0.29 s | a step into the dark | right |
| Hamstring | 0.88 s | attack 1.0 | 0.61 s | 0.33 s | one swipe | too slow |
| Throat Tear | 0.99 s | attack 1.2 | 0.73 s | 0.4 s | a heavier bite | too slow |
| Killing Dance (6) | 1.83 s, blinks, first blow on the press | attack 2.8 | 1.71 s | 0.93 s | a dance at a run | blinks |
| Night Hunt | 0.6 s | cast 0.6 | 0.6 s | 0.3 s | a long breath | right |
| Snap | 0.71 s | attack 0.8 | 0.61 s | 0.33 s | a quick bite | a hair slow |
| Hunting Howl | 0.8 s | cast 0.8 | 0.8 s | 0.4 s | a howl | right |
| Lunge | 0.68 s, bite pose mid run | attack 0.4 + run 18 m/s | 0.78 s | 0.78 s | a dart | pose off |
| Worry (4 + throw) | 0.83 s, throw never seen | attack 1.6 | 1.21 s | 0.61 s | a held shake | too fast |
| Call the Pack | 0.7 s | cast 0.7 | 0.7 s | 0.35 s | a call | right |
| Blood Howl | 0.75 s | cast 0.75 | 0.75 s | 0.38 s | a howl | right |
| Ravening (5, new) | (Go for the Throat 0.74 s) | attack 1.8 | 1.36 s | 0.68 s | a crowd bite | new |
| Bloodmoon | 0.8 s | cast 0.85 | 0.85 s | 0.43 s | a big call | right |
| Maul | 1.08 s | attack 1.0 | 0.98 s | 0.49 s | the bear's swing | right |
| Rattling Roar | 0.75 s | cast 0.75 | 0.75 s | 0.38 s | a roar | right |
| Hammerfall | 1.42 s | attack 1.5 | 1.47 s | 0.74 s | a slam with a wind up | right |
| Bristle | 0.6 s | cast 0.55 | 0.55 s | 0.29 s | a shudder | right |
| Overrun | 0.95 s | attack 0.5 + charge 14 m/s | 1.06 s | 0.9 s | a charge | hits ahead of the bear |
| Reaping Swipe | 1.33 s | attack 1.4 | 1.37 s | 0.69 s | a full turn | right |
| Bear Hug (3) | 1.16 s, squeezes off their keys | attack 1.7 | 1.67 s | 0.83 s | three slow crushes | too fast |
| Ursa Major | 0.9 s | cast 1.0 | 1.0 s | 0.5 s | the big change | right |

Multi-hit skills (Rake, Killing Dance, Worry, Ravening, Bear Hug) take
longer when a rank or a unique adds hits (time x hits / base hits), so a
blow never comes quicker; damage per hit stays as it is.

### Milestone 4: what was built

- Kit (`SkillRunner.shiftKit`): `swing` returns how many it hit; `area`
  can land `flat`; `hit` strikes one body from a chosen side; `cuts` reads
  the gesture's later blows (`cutTimes`); `raise` brings a wolf with no
  summoning circle (`addTurret` `extra.quiet`). `meleeSwing` returns its
  hit count.
- In a form the hero's weapon sound is `claw` (`weaponSoundOf`;
  `CombatFeel` lands it as `hit.flesh`): the basic attack whooshes as the
  beast (`beastWhoosh`: cat `swing.light`, wolf `monster.beast.attack`,
  bear `swing.heavy`), every beast blow draws `beastImpact` (blood and the
  beast's hair, `ss.impact.<form>`) instead of the metal spark, and the
  bear's basic attack is 2.0 rad wide and 2.7 m long (`formSwing`).
- Multi-blow skills land each blow on its gesture key (`blowTimes`: the
  contact frame, then `Spec.cuts`, extras at the gesture's spacing) and
  stretch with added blows (`stretched`). Gestures with cuts: Rake (third
  blow both paws crossed), Worry (three shakes and the throw), Bear Hug
  (three squeezes), Ravening (five bites).
- Leaps and runs go by distance (`travelTime`): Pounce coils, then leaps
  at 14 m/s; Lunge runs at 18 m/s (`WOLF_RUN`); Overrun charges at 14 m/s
  and strikes each body as the bear reaches it, thrown off its side of the
  lane; Killing Dance runs to each spot (dash capped near 20 m/s by a
  shorter step round). A dodge stops a trip where it is
  (`Shapeshift.travel` `id`). The motif lands with the landing
  (`ShiftCast.lands`).
- Throws are real moves (`fling`, the monster's `motionOverride`, wall
  checked, bosses / objects / juggernauts / moving bodies untouched): Lunge
  1.5 m back, Worry's wrenches and its 2.5 m throw, Overrun 3 m aside,
  Reaping Swipe's pull 1.2 m (+0.04 a rank, new params `pull` / `pullR`).
  The packet's own knockback is dropped on those blows.
- Slink: only a Feral strike (not Slink, Night Hunt or Shadowcat) uses it:
  +60% (+8% a rank) and a sure critical strike. Night Hunt: the cost is
  skipped where it is taken (`shiftFree` in `SkillRunner.cast`), no refund.
- Call the Pack: the share grows once (`BURST_POWER.callThePack`, the
  handler reads the base share), Alpha's damage and life go on, each wolf
  rises out of its own fog with its eyes first (`TeethFX.wolfRise`).
- Hammerfall lands flat to its edge. Bear Hug heals only on a squeeze that
  lands. Hamstring, Throat Tear and Snap draw their look only on a hit.
- Ravening replaces Go for the Throat (sounds renamed
  `skill.shift.ravening(.hit)` in place, with `manifest.ts`, the ledger,
  `shifter-takes.mjs` and `ASSETS.md`); Many Mouths replaces Scent of
  Weakness (`PassiveEffects.manyMouthsPct`, the status `ss.manyMouths`
  kept by `tickShiftPack` from `SkillRunner.update`). Old ranks refund
  through `repairCharacter` (drops unknown ids and their hotbar keys).
  grep goForTheThroat / scentOfWeakness / ss-gofor / ss-scent in src, tools,
  locales, public, ASSETS.md: 0.

### Milestone 5: icons

- Every skill's picture is now one of his own glyphs in
  `art/ShifterGlyphs.ts`, each skill its own glyph and variant (54 pairs,
  none shared): `beast` heads (v3 the cat crowned for King of the Night,
  v4 the wolf in its ruff for Thick Ruff, v5 the old grey bear among the
  four elements for Grizzled, v6 the scarred bear for Old Scars, v7 the
  roaring bear for Rattling Roar), `paw` prints (v3 in blood for Taste of
  Blood, v4 three wolf prints for Pack Instinct, v5 a glowing trail for
  Stalker), `howl` (v2 a heart of blood for Blood Howl), and new: `sstear`
  (Rake, Hamstring, Open Veins, Maul, Killing Dance), `sscat` (Pounce,
  Feral Grace, Slink, Lithe), `sswolf` (Lunge, Call the Pack, Alpha, Last
  Wolf Standing), `ssbear` (Ursa Major, Overrun, Immovable Bulk, Unbowed),
  `ssjaw` (Snap, Worry, Throat Tear, Sharp Teeth, Ravening), `sseyes`
  (Cat's Eyes, Many Mouths, Night Hunt, Blood Frenzy), `sshide` (Thick
  Hide, Bristle, Scar Tissue), `ssheart` (Pack Blood, Fat Reserves, Ninth
  Life), `ssclaw` (Keen Claws, Bruiser, Hammerfall, Reaping Swipe, Bear
  Hug). Blood is always painted red, whatever the tree's light.
- Each tree has its own light and ground (`TREE_LOOK.shapeshifter` in
  `art/SkillIconArt.ts`): Feral violet night `0xa890ff`, Teeth blood red
  `0xe0503c`, Claw amber `0xe09050` (the class light).
- None of the eleven copies the audit found is left; no `ss-*` plan matches
  any other plan in `ICON_MAP`, and no other class draws `beast`, `paw` or
  `howl`.
- Looked at with `node tools/art-sheet.mjs shapeshifter` (new sheet in
  `tools/art-sheet-page.ts`, seconds, no game boot) at 96 px and 40 px.
  Weakest at hotbar size: Immovable Bulk, Ravening (bite marks), Lithe.

### Milestone 6: effects cost

- No allocation left in what runs every frame: `clawTrails` reuses a
  scratch direction (`_d`) instead of `_b.clone()`; Reaping Swipe's dust
  fills one options object in place; the ticking bursts (Slink, Night Hunt,
  Bloodmoon, Bristle, the run trails of Lunge and Overrun) pass no new
  options object. Once-per-cast vectors are left as they are.
- Quality ladder: every `ss.` layer already scales with `fxScale` and the
  per-frame ceiling (`fx/Particles.ts`). The garnish layers are now `rich`
  (High and Ultra only): the cat change's lingering smoke, the wolf
  change's slow second fall of hair, the motes of Slink's pool, Killing
  Dance, Night Hunt and Blood Howl, and the motes round Ursa Major's stars.
- Warm-up: every shifter effect draws through the shared systems (one
  particle field, the ribbon batch, the decals, the light pool), which are
  in the scene from the start, so `ss.impact.*` and `ss.raven.spray` need
  no stand-in of their own. What was not warmed was the beast itself: the
  forms hang hidden on the hero and a hidden mesh is never linked, so the
  first change in a fight linked the pelt, claws, eyes and tail (the tail
  on its own five-bone skeleton) on that frame. `FormBody.standIns()`
  (through `DressedHero.formStandIns()` and `Player.formStandIns()`) now
  hands `DungeonScene.warmup()` one shown copy of each, for a Shapeshifter
  only; it meshes any form not built yet behind the curtain. Call the
  Pack's wolves were already warmed (`warmSummons`, `gorge_wolf`).

## For the owner to test

(empty)

## For skillqa

- Game wide, not only this class: knockback tooltips say metres but
  `Enemy.takeHit` pushes knockback x 0.35, so every "knocks back N m" reads
  about three times too far.
- HUD text for Bristle shows the base 30% reflect, not the ranked magnitude.
- A Shapeshifter skill's blow lands at 35% of its action (skillcore's
  `SKILL_BLOW_CONTACT`), so Rake's first swipe waits about 0.3 s: look at
  whether the cat's flurry feels quick enough in motion.
- Killing Dance replays its gesture per blow (`animator.play` with the
  blow's own span); look for a hitch between blows.
- Worry's wrench (0.35 m) and Reaping Swipe's pull use the monster's
  `motionOverride`: look that a pulled or wrenched body never ends inside a
  wall or prop (the path is checked with `wallStop`, the end point is not
  checked against props smaller than the step).
- Icons (milestone 5): judge at real hotbar size in game, above all
  Immovable Bulk (a bear sat face on), Ravening (three bite marks) and
  Lithe (the cat walking, tail curled); the shifter status chips now use
  the same glyphs at 17 px (`ss-snap` is Pack Frenzy's chip, a side-on jaw).
- Effects cost (milestone 6): the first change into each form should no
  longer hitch (beast looks warmed in `DungeonScene.warmup()`); confirm on
  a real GPU with a fresh shapeshifter, first change of the run. On Medium
  and Low the garnish layers listed under milestone 6 are gone by design.

## Handover

(empty)
