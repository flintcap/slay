# Stream: shapeshifter

Status: done
Port: SLAY_PORT=4343

## The owner's brief

Shapeshifter (male). Three trees:
- **Feral**: a big-cat form (panther / feline). Speed and agility skills,
  single-target melee.
- **Teeth**: a wolf form. Attack and buff skills, single-target melee.
- **Claw**: a bear form. Tank skills, cleave melee.

Transforms keep a humanoid figure and shape (a were-creature standing on two
legs, not a four-legged animal). Every skill, gesture, effect and sound is
new and unique. Dark, gritty, primal: fur, bone charms, blood, wet earth,
snapping sinew. Not sci-fi.

Follow `docs/remake/new-class.md` for every place a class touches.

Design notes
- Class id `shapeshifter`.
- A transform is a skill (one per tree) that turns the hero into that form
  until cancelled or they change form. Form skills of a tree can only be used
  in that form, or cast into the form automatically (pick the one that plays
  best and say why in the progress file). Show it clearly on the hotbar.
- The forms are built in code like everything else (see `src/art/hero/`):
  the same rig, so every animation system still works, with a re-shaped
  body: cat (lean, long limbs, tail, low stance, crouched run), wolf (muzzle,
  ears, digitigrade feel, hunched), bear (huge shoulders, heavy gut, short
  thick limbs, upright tank). Fur, claws, eyes that catch light. A transform
  plays a short change effect (body swells / sheds, a burst of hair and
  breath), hides worn gear that would not fit and keeps stats from gear.
  Each form needs its own idle, walk/run, and attack chain feel, plus a
  unique gesture per active skill.
- Human form: pick a weapon set that fits (for example clubs, axes, staves);
  write it in the class def.

## Milestones

- [x] M1 Class def, look (male), field kit, portrait, select screen words; selectable and playable with a starter skill.
- [x] M2 Form system: transform skill family, three humanoid forms built in code, change effect, gear hiding, hotbar rule.
- [x] M3 Feral tree: 18 skills, rules, statuses, icons.
- [x] M4 Teeth tree: 18 skills, rules, statuses, icons.
- [x] M5 Claw tree: 18 skills, rules, statuses, icons.
- [x] M6 Form motion (idle, move, attack chain per form) and a unique gesture per active skill.
- [x] M7 A unique VFX look and a unique sound per active skill (CC0, layered takes).
- [x] M8 Story and NPC lines, tools class lists, balance (curve passes every depth), in-game skill check green.

## Next up

Nothing. Every milestone is in and pushed. See Handover.

## Handover

What exists now:
- A male Shapeshifter with three trees of 18 skills each (54 in all, 26 of
  them actives): Feral (Shadowcat, speed and single-target kills), Teeth (Grey
  Wolf, bites, howls, frenzy and a summoned pack), Claw (Great Bear, tank and
  cleave). Data in `src/data/classSkills/shapeshifter.ts`, class in
  `shapeshifterClass.ts`, passives in `src/sim/shifterPassives.ts`.
- Forms are statuses (`form.cat`, `form.wolf`, `form.bear`), run by
  `src/entities/Shapeshift.ts`. Each carries its rank's mods (from
  `src/data/shifterPower.ts`); the bear also gets a share of the man's life.
  Hotbar rule is auto-shift: any tree skill used in the wrong shape first
  changes you, then fires. The form skill used in its own form turns you back.
- Beast bodies, stances and basic blows: `src/art/hero/forms/`. A gesture per
  active: `src/art/hero/gestures/shapeshifter.ts`.
- Skill handlers: `src/scenes/ShifterRunner.ts` (family `shift`). Effects:
  `src/fx/shifter/` (ShifterFX, emitters, motifs). Sounds: 39 layered CC0
  takes in `tools/audio/shifter-takes.mjs`, rows in `src/audio/shifterSounds.ts`,
  every file listed in ASSETS.md.
- Icons `src/art/icons/shifterIcons.ts`, glyphs `src/art/ShifterGlyphs.ts`.
- Camp lines for Hesk, Kale, Vell, Marrow and Wenna; starting hints; in the
  curve, hero sheet and strict uniqueness lists.
- Debug: `SLAY.debug.shiftTo(form)` and `shiftCast(id)`; shots with
  `tools/shoot-shifter.mjs` (checks for broken numbers in the scene too).

Checks: typecheck 0, curve passes every depth for shapeshifter, rank power
all grow (26 actives), check-skills 26 of 26 working, unique, skillsound,
skilldepth, passives, wiring, story, starter, hotbar, assets, audio all pass.

Left for `finish`:
- `tools/check-skills.mjs` exits 1 at the very end if `shots/` does not exist
  (it writes `shots/skill-audit.json`). Not a skill problem.
- The curve does not model forms, so its numbers are the man only; forms only
  add power on top.
- One hammerfall frame once rendered black under software rendering; a
  reshoot with a broken-number scan was clean. Worth a glance on real GPUs.
- Checks failing before this stream and not mine: curve for mage and others,
  beats (paladin), sweep (reassemble), town (mage gamble).

## Notes for resume

- Hotbar rule: **auto-shift**. Any tree skill used out of its form first turns
  the hero into that form (the change plays, then the skill). Why: it keeps the
  hotbar to skills, never a dance of form button then skill, and it still reads
  clearly because the change effect and the body say which form you are in.
  The form skill itself turns you back into a man when used in its form.
- Done (M1): class def `src/data/classSkills/shapeshifterClass.ts`, trees in
  `src/data/classSkills/shapeshifter.ts`, look in `Looks.ts`, field kit, portrait,
  select words, Gore combo, starter skill Rake (`src/scenes/ShifterRunner.ts`,
  family `shift`, sub `shift.rake`).
- Form stances and basic blows are in `src/art/hero/forms/` (FormStances,
  FormActions), hooked by one line each into Stances.ts / Actions.ts;
  `Animator.setForm()` picks them. Beast meshes are `forms/BeastBody.ts`.
- Checks that fail before my work too: curve (mage at 1/5/12, shadowblade and
  ranger at 12), beats and menus (paladin), sweep (reassemble), town (mage gamble).
- Rank power: buffs and the roar's curse are in `src/data/shifterPower.ts`,
  spread into `SELF_POWER` / `FOE_POWER`. `RANK_ONLY=<my 26 actives>
  node tools/check-rankpower.mjs` says all grow.
- Uniqueness words: `src/fx/shifter/motifs.ts`, spread into `fx/SkillLooks.ts`.
- skilldepth and unique pass; shapeshifter is in check-unique's strict list.
