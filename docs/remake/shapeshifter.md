# Stream: shapeshifter

Status: in progress
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
- [ ] M8 Story and NPC lines, tools class lists, balance (curve passes every depth), in-game skill check green.

## Next up

M1 to M7 are in and pushed. M8 so far: camp lines (Hesk, Kale, Vell, Marrow,
Wenna), STARTING_SKILL_HINTS, shapeshifter in the curve, hero sheet and the
strict list of check-unique. Curve passes every depth (`node tools/check-curve.mjs
--classes=shapeshifter`), rank power says all grow, unique and skilldepth green.
Left, in this order:
1. Read `scratchpad/shoot.log` (tools/shoot-shifter.mjs, port 4343, flock) and
   look at the form and skill shots; fix what looks wrong.
2. Read `scratchpad/skills.log` (`node tools/check-skills.mjs
   --classes=shapeshifter --port=4343`, flock); every active must report an
   effect. Fix, then rerun once.
3. Tick M8, then finish: Status done, Handover, push.

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
- Checks that fail until the trees are written: skilldepth (no synergies yet),
  unique (shapeshifter shows as pending).
