# Stream: sk-rogue (Wave 5: Rogue skills remake)

Status: waiting

Class: Rogue (code id `shadowblade`). Trees: Venom, Shadowcraft, Bladework (`venom`, `shadowcraft`, `bladework`). Port 4354.
Fights with melee and thrown: daggers, often two at once (starts with two daggers). Class color: green (`0x5ad18f`).

Goal (owner): fix every Rogue skill and remake the kit to a AAA
standard. Keep the skills that are good, replace the ones that feel
lackluster, fix everything about the rest. Speeds stay near the feel of
similar classes in Diablo II and Path of Exile (our own numbers and names,
never theirs).

Start only after `skillcore.md` says `Status: done`. Read its "Handover"
and `CONTRACTS.md` first: time every skill through skillcore's fields and
speed function, never with new hard-coded seconds.

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

- [ ] 1. Speed audit first (owner). Under skillcore's model, write a table
  under "Notes for resume": the Rogue's basic attack (or, for a caster,
  its default cast) and every skill's real time per use, with no speed gear
  and at the speed ceiling, next to the feel of similar classes in the two
  reference games. Mark each one too fast, right, or too slow, and fix the
  numbers through skillcore's fields. Speeds must not change damage per
  second at equal gear by much; where a skill slows down, it hits harder.
- [ ] 2. Skill audit. For every skill, read its data, its runner code, its
  swing or cast animation, its effect, its icon and its sound, and answer
  in one table under "Notes for resume":
  - Does it work? (read the code; flag anything broken)
  - Melee: does it have its own swing, not a shared one?
  - Ranged and spells: does it have its own projectile, motion and effect?
  - Is the attack or cast too fast?
  - Is the icon unique to the skill, sharp, and in class colors?
  - Do the projectile, swing and effect look AAA?
  - Keep, rework, or replace, with one line why.
- [ ] 3. Plan the new kit. Write the list of skills to keep, rework and
  replace (with the new skill's idea in one line) under "Notes for resume".
  Keep the tree shape the game expects (tiers, columns, prerequisites,
  synergies, capstones). Our own names and ideas, never copies.
- [ ] 4. Build. Implement the reworks and replacements. Every skill:
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
  - old saves stay safe: removed skills refund their points and leave the
    hotbar (check that `src/sim/Character.ts` still does this for your ids)
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
  then note it) and `check-curve --classes=shadowblade` once; no depth may be
  walled that was not before (make the class stronger, never monsters
  weaker or fewer).
- [ ] 8. Handover. Fill "For skillqa" (what you could not check: looks in
  motion, real frame time, any effect you fear is costly) and "For the
  owner to test". Set `Status: done`, push.

## Next up

Wait for skillcore. Then start milestone 1.

## Notes for resume

(empty)

## For the owner to test

(empty)

## For skillqa

(empty)

## Handover

(empty)
